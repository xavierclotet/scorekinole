/**
 * Swiss Pairings Data Integrity Tests
 *
 * Validates that generateSwissPairings() NEVER overwrites match results.
 * Tests scenarios:
 * - Generating round 2 preserves all round 1 completed match data
 * - Concurrent match completion + pairing generation both succeed
 * - All match fields (winner, points, 20s, rounds, duration) are preserved
 * - Standings are correctly recalculated from preserved match data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import {
  createSwissTournament,
  getInProgressMatches,
  createMatchResult,
  findMatchInTournament,
  getAllMatches
} from './__mocks__/testTournamentFactory';
import type { Tournament, GroupMatch } from '$lib/types/tournament';

// ─── Shared mock state ───────────────────────────────────────────────────────

let mockStore: MockFirestore;

function seedTournament(tournament: Tournament): void {
  mockStore.setDocument(`tournaments/${tournament.id}`, tournament as unknown as Record<string, unknown>);
  mockStore.resetStats();
}

function readTournament(tournamentId: string): Tournament {
  const doc = mockStore.getDocument(`tournaments/${tournamentId}`);
  if (!doc) throw new Error(`Tournament ${tournamentId} not found`);
  return doc.data as unknown as Tournament;
}

// ─── vi.mock setup ───────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) =>
    new MockDocumentReference(`${collection}/${id}`, id),
  runTransaction: (
    _db: unknown,
    callback: (txn: unknown) => Promise<unknown>,
    options?: { maxAttempts?: number }
  ) => mockStore.runTransaction(callback as any, options?.maxAttempts ? options.maxAttempts - 1 : undefined),
  serverTimestamp: () => Date.now()
}));

vi.mock('./config', () => ({
  db: {},
  isFirebaseEnabled: () => true
}));

vi.mock('./tournaments', () => ({
  parseTournamentData: (data: unknown) => data,
  getTournament: vi.fn(),
  updateTournament: vi.fn(),
  updateTournamentPublic: vi.fn()
}));

// ─── Import functions under test (AFTER mocks) ──────────────────────────────

const { updateMatchResult } = await import('./tournamentMatches');
const { generateSwissPairings } = await import('./tournamentGroups');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Complete all IN_PROGRESS matches in a Swiss tournament (in mock store)
 * Returns the match results for later verification
 */
async function completeAllMatches(
  tournamentId: string,
  tournament: Tournament
): Promise<Map<string, { winner: string; totalPointsA: number; totalPointsB: number; total20sA: number; total20sB: number }>> {
  const matches = getInProgressMatches(tournament);
  const results = new Map<string, { winner: string; totalPointsA: number; totalPointsB: number; total20sA: number; total20sB: number }>();

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const aWins = i % 2 === 0;
    const result = createMatchResult(
      aWins ? 2 : 0,
      aWins ? 0 : 2,
      aWins ? 8 : 3,
      aWins ? 3 : 8,
      aWins ? 2 : 0,
      aWins ? 0 : 1
    );

    await updateMatchResult(tournamentId, match.id, result);

    results.set(match.id, {
      winner: aWins ? match.participantA : match.participantB,
      totalPointsA: aWins ? 8 : 3,
      totalPointsB: aWins ? 3 : 8,
      total20sA: aWins ? 2 : 0,
      total20sB: aWins ? 0 : 1
    });
  }

  return results;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Swiss pairings data integrity', () => {
  it('generating round 2 preserves ALL round 1 match results', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 3 });
    seedTournament(tournament);

    // Complete all round 1 matches
    const r1Results = await completeAllMatches(tournament.id, tournament);
    expect(r1Results.size).toBeGreaterThan(0);

    // Verify round 1 matches are completed in the store
    const beforePairings = readTournament(tournament.id);
    const r1Matches = beforePairings.groupStage!.groups[0].pairings![0].matches;
    const completedBefore = r1Matches.filter(m => m.status === 'COMPLETED' && m.participantB !== 'BYE');
    expect(completedBefore.length).toBe(r1Results.size);

    // Generate round 2 pairings
    const success = await generateSwissPairings(tournament.id, 2);
    expect(success).toBe(true);

    // Verify round 1 matches are STILL completed with same data
    const afterPairings = readTournament(tournament.id);
    const r1MatchesAfter = afterPairings.groupStage!.groups[0].pairings![0].matches;

    for (const match of r1MatchesAfter) {
      if (match.participantB === 'BYE') continue;

      const expected = r1Results.get(match.id);
      if (!expected) continue;

      expect(match.status).toBe('COMPLETED');
      expect(match.winner).toBe(expected.winner);
      expect(match.totalPointsA).toBe(expected.totalPointsA);
      expect(match.totalPointsB).toBe(expected.totalPointsB);
      expect(match.total20sA).toBe(expected.total20sA);
      expect(match.total20sB).toBe(expected.total20sB);
      expect(match.completedAt).toBeDefined();
      expect(match.duration).toBeDefined();
    }

    // Verify round 2 was added
    expect(afterPairings.groupStage!.groups[0].pairings!.length).toBe(2);
    const r2Matches = afterPairings.groupStage!.groups[0].pairings![1].matches;
    expect(r2Matches.length).toBeGreaterThan(0);

    console.log(`  📊 Round 2 generated: ${r1Results.size} R1 results preserved, ${r2Matches.length} R2 matches created`);
  });

  it('generating round 3 preserves both round 1 and round 2 results', async () => {
    const tournament = createSwissTournament({ numParticipants: 6, swissRounds: 3 });
    seedTournament(tournament);

    // Complete round 1
    const r1Results = await completeAllMatches(tournament.id, tournament);

    // Generate round 2
    await generateSwissPairings(tournament.id, 2);

    // Activate round 2 matches (set to IN_PROGRESS)
    const afterR2 = readTournament(tournament.id);
    const r2Pairings = afterR2.groupStage!.groups[0].pairings![1];
    let tableCounter = 1;
    for (const match of r2Pairings.matches) {
      if (match.participantB !== 'BYE' && match.status === 'PENDING') {
        match.status = 'IN_PROGRESS';
        match.startedAt = Date.now();
        match.tableNumber = ((tableCounter - 1) % 4) + 1;
        tableCounter++;
      }
    }
    mockStore.setDocument(`tournaments/${tournament.id}`, afterR2 as unknown as Record<string, unknown>);

    // Complete round 2
    const freshTournament = readTournament(tournament.id);
    const r2Results = await completeAllMatches(tournament.id, freshTournament);

    // Generate round 3
    const success = await generateSwissPairings(tournament.id, 3);
    expect(success).toBe(true);

    // Verify ALL round 1 results preserved
    const final = readTournament(tournament.id);
    const r1MatchesFinal = final.groupStage!.groups[0].pairings![0].matches;
    for (const match of r1MatchesFinal) {
      if (match.participantB === 'BYE') continue;
      const expected = r1Results.get(match.id);
      if (!expected) continue;
      expect(match.status).toBe('COMPLETED');
      expect(match.winner).toBe(expected.winner);
      expect(match.totalPointsA).toBe(expected.totalPointsA);
    }

    // Verify ALL round 2 results preserved
    const r2MatchesFinal = final.groupStage!.groups[0].pairings![1].matches;
    for (const match of r2MatchesFinal) {
      if (match.participantB === 'BYE') continue;
      const expected = r2Results.get(match.id);
      if (!expected) continue;
      expect(match.status).toBe('COMPLETED');
      expect(match.winner).toBe(expected.winner);
    }

    // Verify round 3 exists
    expect(final.groupStage!.groups[0].pairings!.length).toBe(3);
    console.log(`  📊 Round 3: R1(${r1Results.size}), R2(${r2Results.size}) results all preserved`);
  });

  it('standings correctly reflect all completed match data after pairing generation', async () => {
    const tournament = createSwissTournament({ numParticipants: 6, swissRounds: 2 });
    seedTournament(tournament);

    // Complete round 1 — track expected stats
    const matches = getInProgressMatches(tournament);
    const winsPerPlayer = new Map<string, number>();
    const pointsPerPlayer = new Map<string, number>();

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const aWins = i % 2 === 0;
      await updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(aWins ? 2 : 0, aWins ? 0 : 2, aWins ? 8 : 3, aWins ? 3 : 8, 1, 0)
      );

      const winner = aWins ? match.participantA : match.participantB;
      const loser = aWins ? match.participantB : match.participantA;
      winsPerPlayer.set(winner, (winsPerPlayer.get(winner) || 0) + 1);
      winsPerPlayer.set(loser, winsPerPlayer.get(loser) || 0);
      pointsPerPlayer.set(match.participantA, (pointsPerPlayer.get(match.participantA) || 0) + (aWins ? 8 : 3));
      pointsPerPlayer.set(match.participantB, (pointsPerPlayer.get(match.participantB) || 0) + (aWins ? 3 : 8));
    }

    // Generate round 2
    await generateSwissPairings(tournament.id, 2);

    // Verify standings match expected stats
    const after = readTournament(tournament.id);
    const standings = after.groupStage!.groups[0].standings!;

    for (const standing of standings) {
      const expectedWins = winsPerPlayer.get(standing.participantId) || 0;
      expect(standing.matchesWon).toBe(expectedWins);
      expect(standing.points).toBe(expectedWins * 2); // 2 points per win

      const expectedPoints = pointsPerPlayer.get(standing.participantId) || 0;
      // BYE players get default 8 points, skip those
      if (expectedPoints > 0) {
        expect(standing.totalPointsScored).toBe(expectedPoints);
      }
    }
  });

  it('match gamesWonA/gamesWonB fields are preserved through pairing generation', async () => {
    const tournament = createSwissTournament({ numParticipants: 6 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    // Complete with specific gamesWon values
    for (const match of matches) {
      await updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(2, 1, 12, 7, 3, 1)
      );
    }

    // Generate round 2
    await generateSwissPairings(tournament.id, 2);

    // Verify gamesWon fields preserved
    const after = readTournament(tournament.id);
    const r1Matches = after.groupStage!.groups[0].pairings![0].matches;
    for (const match of r1Matches) {
      if (match.participantB === 'BYE') continue;
      expect(match.gamesWonA).toBe(2);
      expect(match.gamesWonB).toBe(1);
      expect(match.totalPointsA).toBe(12);
      expect(match.totalPointsB).toBe(7);
      expect(match.total20sA).toBe(3);
      expect(match.total20sB).toBe(1);
    }
  });
});

describe('Swiss pairings concurrent safety', () => {
  it('concurrent match completion + pairing generation: no data loss', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 3 });
    seedTournament(tournament);

    // Complete all matches except one
    const matches = getInProgressMatches(tournament);
    const lastMatch = matches[matches.length - 1];
    const otherMatches = matches.slice(0, -1);

    for (let i = 0; i < otherMatches.length; i++) {
      const match = otherMatches[i];
      await updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(2, 0, 8, 3, 1, 0)
      );
    }

    // Now complete the last match AND generate pairings concurrently
    // This simulates the edge case where admin clicks "generate round" while
    // the last match is being submitted
    const [completeResult, pairingsResult] = await Promise.all([
      updateMatchResult(
        tournament.id,
        lastMatch.id,
        createMatchResult(0, 2, 3, 8, 0, 2)
      ),
      generateSwissPairings(tournament.id, 2)
    ]);

    // Both should succeed (transactions retry on conflict)
    expect(completeResult).toBe(true);
    expect(pairingsResult).toBe(true);

    // Verify the last match result was preserved
    const after = readTournament(tournament.id);
    const completedMatch = findMatchInTournament(after, lastMatch.id);
    expect(completedMatch!.status).toBe('COMPLETED');
    expect(completedMatch!.winner).toBe(lastMatch.participantB);
    expect(completedMatch!.totalPointsB).toBe(8);

    // Verify all other matches still completed
    for (const match of otherMatches) {
      const m = findMatchInTournament(after, match.id);
      expect(m!.status).toBe('COMPLETED');
      expect(m!.totalPointsA).toBe(8);
    }

    // Verify round 2 was created
    expect(after.groupStage!.groups[0].pairings!.length).toBe(2);

    console.log(`  📊 Concurrent: ${mockStore.totalRetries} retries needed, both operations succeeded`);
  });

  it('multiple concurrent match completions during pairing generation', async () => {
    const tournament = createSwissTournament({ numParticipants: 10, swissRounds: 3 });
    seedTournament(tournament);

    // Complete half the matches first
    const matches = getInProgressMatches(tournament);
    const half = Math.floor(matches.length / 2);
    const firstHalf = matches.slice(0, half);
    const secondHalf = matches.slice(half);

    for (const match of firstHalf) {
      await updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(2, 0, 8, 3, 1, 0)
      );
    }

    // Now complete remaining matches AND generate pairings ALL concurrently
    const operations = [
      ...secondHalf.map((match, i) =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(i % 2 === 0 ? 2 : 0, i % 2 === 0 ? 0 : 2, 8, 3, 1, 0)
        )
      ),
      generateSwissPairings(tournament.id, 2)
    ];

    const results = await Promise.all(operations);

    // All match completions should succeed
    const matchResults = results.slice(0, -1);
    expect(matchResults.every(r => r === true)).toBe(true);

    // Pairing generation should also succeed
    expect(results[results.length - 1]).toBe(true);

    // Verify ALL matches are preserved
    const after = readTournament(tournament.id);
    const allR1Matches = after.groupStage!.groups[0].pairings![0].matches;
    const completedCount = allR1Matches.filter(m =>
      m.status === 'COMPLETED' && m.participantB !== 'BYE'
    ).length;
    expect(completedCount).toBe(matches.length);

    console.log(`  📊 ${matches.length} concurrent completions + pairing gen: ${mockStore.totalRetries} retries`);
  });
});

describe('Swiss recalculateStandings data integrity', () => {
  it('recalculateStandings does NOT modify match results', async () => {
    const tournament = createSwissTournament({ numParticipants: 6 });
    seedTournament(tournament);

    // Complete some matches with specific data
    const matches = getInProgressMatches(tournament);
    const matchData = new Map<string, { gA: number; gB: number; pA: number; pB: number }>();

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const pA = 5 + i;
      const pB = 3 + i;
      await updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(2, 0, pA, pB, i, 0)
      );
      matchData.set(match.id, { gA: 2, gB: 0, pA, pB });
    }

    // Import recalculateStandings
    const { recalculateStandings } = await import('./tournamentGroups');

    // Call recalculateStandings
    const success = await recalculateStandings(tournament.id);
    expect(success).toBe(true);

    // Verify ALL match results are untouched
    const after = readTournament(tournament.id);
    const r1Matches = after.groupStage!.groups[0].pairings![0].matches;

    for (const match of r1Matches) {
      if (match.participantB === 'BYE') continue;
      const expected = matchData.get(match.id);
      if (!expected) continue;

      expect(match.status).toBe('COMPLETED');
      expect(match.gamesWonA).toBe(expected.gA);
      expect(match.gamesWonB).toBe(expected.gB);
      expect(match.totalPointsA).toBe(expected.pA);
      expect(match.totalPointsB).toBe(expected.pB);
    }
  });
});
