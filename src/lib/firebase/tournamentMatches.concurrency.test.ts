/**
 * Concurrency tests for tournament match updates
 *
 * Validates that runTransaction() correctly handles concurrent writes
 * to the single tournament document. The mock simulates Firestore's
 * optimistic concurrency control (version tracking + retry on conflict).
 *
 * These tests reproduce and validate the fix for the race condition where
 * 10-20 players completing matches simultaneously from /game would cause
 * later writes to overwrite earlier results.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import {
  createTestTournament,
  createSwissTournament,
  createMultiGroupTournament,
  getInProgressMatches,
  createMatchResult,
  findMatchInTournament
} from './__mocks__/testTournamentFactory';
import type { Tournament, GroupMatch } from '$lib/types/tournament';

// ─── Shared mock state ───────────────────────────────────────────────────────

let mockStore: MockFirestore;

/**
 * Seed the mock store with a tournament document
 */
function seedTournament(tournament: Tournament): void {
  mockStore.setDocument(`tournaments/${tournament.id}`, tournament as unknown as Record<string, unknown>);
  // Reset version to 1 after seeding (setDocument bumps to 1)
  mockStore.resetStats();
}

/**
 * Read the current tournament from the mock store
 */
function readTournament(tournamentId: string): Tournament {
  const doc = mockStore.getDocument(`tournaments/${tournamentId}`);
  if (!doc) throw new Error(`Tournament ${tournamentId} not found in mock store`);
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
  getTournament: vi.fn()
}));

// Real algorithms — NOT mocked
// import { resolveTiebreaker, updateHeadToHeadRecord, calculateMatchPoints } from '$lib/algorithms/tiebreaker';
// import { generateRoundRobinSchedule } from '$lib/algorithms/roundRobin';

// ─── Import functions under test (AFTER mocks) ──────────────────────────────

const { updateMatchResult, updateTournamentMatchRounds } = await import('./tournamentMatches');

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Concurrent match completions', () => {
  it('Test 1: 10 concurrent completions — all results preserved', async () => {
    const tournament = createTestTournament({ numParticipants: 5 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(10); // 5 players = 10 round-robin matches

    // Complete all 10 matches concurrently
    const results = await Promise.all(
      matches.map((match, i) => {
        // Alternate who wins: even index → A wins, odd index → B wins
        const aWins = i % 2 === 0;
        return updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(
            aWins ? 2 : 0,
            aWins ? 0 : 2,
            aWins ? 8 : 2,
            aWins ? 2 : 8,
            aWins ? 1 : 0,
            aWins ? 0 : 1
          )
        );
      })
    );

    // All should succeed
    expect(results.every(r => r === true)).toBe(true);

    // Verify all 10 matches are COMPLETED
    const updatedTournament = readTournament(tournament.id);
    const allMatches = getInProgressMatches(updatedTournament);
    expect(allMatches.length).toBe(0); // None left IN_PROGRESS

    // Count COMPLETED matches
    let completedCount = 0;
    for (const round of updatedTournament.groupStage!.groups[0].schedule!) {
      for (const m of round.matches) {
        if (m.status === 'COMPLETED') completedCount++;
      }
    }
    expect(completedCount).toBe(10);

    // Retries should have occurred (proving concurrency was detected)
    expect(mockStore.totalRetries).toBeGreaterThan(0);
    console.log(`  📊 Stats: ${mockStore.totalCommits} commits, ${mockStore.totalRetries} retries`);
  });

  it('Test 7: Scale test — 20 concurrent updates (7 participants)', async () => {
    const tournament = createTestTournament({ numParticipants: 7 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    // 7 players = 21 matches; use first 20
    expect(matches.length).toBe(21);
    const first20 = matches.slice(0, 20);

    const results = await Promise.all(
      first20.map((match, i) =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(i % 2 === 0 ? 2 : 1, i % 2 === 0 ? 1 : 2, 6, 4, 1, 0)
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    let completedCount = 0;
    for (const round of updated.groupStage!.groups[0].schedule!) {
      for (const m of round.matches) {
        if (m.status === 'COMPLETED') completedCount++;
      }
    }
    expect(completedCount).toBe(20);
    expect(mockStore.totalRetries).toBeGreaterThan(0);
    console.log(`  📊 Scale stats: ${mockStore.totalCommits} commits, ${mockStore.totalRetries} retries`);
  });

  it.each([
    { players: 10, expectedMatches: 45 },   // 10 players = 45 matches
    { players: 14, expectedMatches: 91 },   // 14 players = 91 matches (stress)
  ])('Scale: $players players ($expectedMatches concurrent completions)', async ({ players, expectedMatches }) => {
    const tournament = createTestTournament({ numParticipants: players });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(expectedMatches);

    const results = await Promise.all(
      matches.map((match, i) =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(i % 2 === 0 ? 2 : 1, i % 2 === 0 ? 1 : 2, 6, 4, 1, 0)
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    let completedCount = 0;
    for (const round of updated.groupStage!.groups[0].schedule!) {
      for (const m of round.matches) {
        if (m.status === 'COMPLETED') completedCount++;
      }
    }
    expect(completedCount).toBe(expectedMatches);
    expect(mockStore.totalRetries).toBeGreaterThan(0);
    console.log(`  📊 ${players} players: ${mockStore.totalCommits} commits, ${mockStore.totalRetries} retries`);
  });
});

describe('Concurrent round syncs', () => {
  it('Test 2: 5 concurrent round syncs — all rounds preserved', async () => {
    const tournament = createTestTournament({ numParticipants: 5 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament).slice(0, 5);

    // Each match syncs different round data
    const results = await Promise.all(
      matches.map((match, i) =>
        updateTournamentMatchRounds(
          tournament.id,
          match.id,
          'GROUP',
          'group-1',
          [
            {
              gameNumber: 1,
              roundInGame: 1,
              pointsA: (i + 1) * 2,
              pointsB: i,
              twentiesA: i % 2,
              twentiesB: (i + 1) % 2
            }
          ],
          { gamesWonA: 0, gamesWonB: 0 }
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    // Verify each match has its distinct round data
    const updated = readTournament(tournament.id);
    for (let i = 0; i < 5; i++) {
      const match = findMatchInTournament(updated, matches[i].id);
      expect(match).not.toBeNull();
      expect(match!.rounds).toHaveLength(1);
      expect(match!.rounds![0].pointsA).toBe((i + 1) * 2);
      expect(match!.rounds![0].pointsB).toBe(i);
    }

    console.log(`  📊 Stats: ${mockStore.totalCommits} commits, ${mockStore.totalRetries} retries`);
  });
});

describe('Mixed concurrent operations', () => {
  it('Test 3: 3 completions + 3 round syncs concurrently', async () => {
    // Use 4 participants (even) to avoid BYE walkovers inflating standings
    const tournament = createTestTournament({ numParticipants: 4 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(6); // 4 players = 6 matches, no BYEs
    const toComplete = matches.slice(0, 3);
    const toSync = matches.slice(3, 6);

    const completions = toComplete.map((match, i) =>
      updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(2, 0, 8, 2, 1, 0)
      )
    );

    const syncs = toSync.map((match, i) =>
      updateTournamentMatchRounds(
        tournament.id,
        match.id,
        'GROUP',
        'group-1',
        [{ gameNumber: 1, roundInGame: 1, pointsA: 4, pointsB: 2, twentiesA: 1, twentiesB: 0 }],
        { gamesWonA: 0, gamesWonB: 0 }
      )
    );

    const results = await Promise.all([...completions, ...syncs]);
    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);

    // Verify completions
    for (const match of toComplete) {
      const m = findMatchInTournament(updated, match.id);
      expect(m!.status).toBe('COMPLETED');
      expect(m!.gamesWonA).toBe(2);
    }

    // Verify syncs
    for (const match of toSync) {
      const m = findMatchInTournament(updated, match.id);
      expect(m!.rounds).toHaveLength(1);
      expect(m!.rounds![0].pointsA).toBe(4);
    }

    // Verify standings were calculated (3 completed matches)
    const standings = updated.groupStage!.groups[0].standings;
    const totalPlayed = standings.reduce((sum, s) => sum + s.matchesPlayed, 0);
    // 3 completed matches = 6 matchesPlayed entries (2 per match)
    expect(totalPlayed).toBe(6);

    console.log(`  📊 Stats: ${mockStore.totalCommits} commits, ${mockStore.totalRetries} retries`);
  });
});

describe('Idempotency guard', () => {
  it('Test 4: re-completing an already completed match is a no-op', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const matchA = matches[0];
    const matchB = matches[1];

    // First: complete match A
    await updateMatchResult(
      tournament.id,
      matchA.id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    // Verify A is completed
    let updated = readTournament(tournament.id);
    let mA = findMatchInTournament(updated, matchA.id);
    expect(mA!.status).toBe('COMPLETED');
    expect(mA!.winner).toBe(matchA.participantA);

    // Concurrently: re-complete A (with different winner!) + complete B
    const results = await Promise.all([
      updateMatchResult(
        tournament.id,
        matchA.id,
        createMatchResult(0, 2, 2, 8, 0, 1) // B would win this time
      ),
      updateMatchResult(
        tournament.id,
        matchB.id,
        createMatchResult(2, 1, 6, 4, 1, 0)
      )
    ]);

    // Both calls succeed (A's re-complete is a no-op, not an error)
    expect(results.every(r => r === true)).toBe(true);

    // A keeps its ORIGINAL result (idempotency guard)
    updated = readTournament(tournament.id);
    mA = findMatchInTournament(updated, matchA.id);
    expect(mA!.status).toBe('COMPLETED');
    expect(mA!.winner).toBe(matchA.participantA); // Original winner preserved

    // B is completed normally
    const mB = findMatchInTournament(updated, matchB.id);
    expect(mB!.status).toBe('COMPLETED');
  });
});

describe('Bug reproduction: without transactions', () => {
  it('Test 5: without transactions only last write survives; with transactions all survive', async () => {
    // ── Part A: Reproduce the bug (no transactions) ──
    const tournament1 = createTestTournament({ numParticipants: 4 });
    mockStore.setDocument(
      `tournaments/${tournament1.id}`,
      tournament1 as unknown as Record<string, unknown>
    );
    mockStore.resetStats();

    const matches1 = getInProgressMatches(tournament1);
    const threeMatches = matches1.slice(0, 3);

    // Simulate broken pattern: all 3 read the SAME version, all 3 write blindly
    await Promise.all(
      threeMatches.map((match, i) => {
        return mockStore.runWithoutTransaction(async (txn) => {
          const ref = new MockDocumentReference(`tournaments/${tournament1.id}`, tournament1.id);
          const snapshot = await txn.get(ref);
          const t = snapshot.data() as unknown as Tournament;

          // Find and update the match in-memory
          for (const round of t.groupStage!.groups[0].schedule!) {
            const m = round.matches.find(rm => rm.id === match.id);
            if (m) {
              m.status = 'COMPLETED';
              m.winner = m.participantA;
              m.gamesWonA = 2;
              m.gamesWonB = 0;
              break;
            }
          }

          txn.update(ref, { groupStage: t.groupStage });
        });
      })
    );

    // Check: only the LAST writer's state survives (the bug)
    const broken = readTournament(tournament1.id);
    let brokenCompleted = 0;
    for (const round of broken.groupStage!.groups[0].schedule!) {
      for (const m of round.matches) {
        if (m.status === 'COMPLETED' && m.participantB !== 'BYE') brokenCompleted++;
      }
    }
    // With blind writes, only 1 survives (the last one overwrites the others)
    expect(brokenCompleted).toBe(1);

    // ── Part B: Same operation WITH transactions (the fix) ──
    const tournament2 = createTestTournament({ numParticipants: 4 });
    // Give it a different ID to avoid conflicts
    (tournament2 as any).id = 'test-tournament-2';
    seedTournament(tournament2);

    const matches2 = getInProgressMatches(tournament2);
    const threeMatches2 = matches2.slice(0, 3);

    const results = await Promise.all(
      threeMatches2.map(match =>
        updateMatchResult(
          tournament2.id,
          match.id,
          createMatchResult(2, 0, 8, 2, 1, 0)
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const fixed = readTournament(tournament2.id);
    let fixedCompleted = 0;
    for (const round of fixed.groupStage!.groups[0].schedule!) {
      for (const m of round.matches) {
        if (m.status === 'COMPLETED' && m.participantB !== 'BYE') fixedCompleted++;
      }
    }
    // With transactions, ALL 3 survive
    expect(fixedCompleted).toBe(3);
  });
});

describe('Standings correctness under concurrency', () => {
  it('Test 6: standings are correct after 15 concurrent completions', async () => {
    // Use 6 participants (even) to avoid BYE walkovers
    const tournament = createTestTournament({ numParticipants: 6 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(15); // 6 players = 15 matches, no BYEs

    // Complete all matches: participantA always wins
    const results = await Promise.all(
      matches.map(match =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(2, 0, 8, 2, 2, 0)
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // All 6 players should have matchesPlayed = 5 (each plays 5 opponents)
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(5);
      expect(s.matchesWon + s.matchesLost + s.matchesTied).toBe(5);
    }

    // Total matchesWon across all players = 15 (one winner per match)
    const totalWins = standings.reduce((sum, s) => sum + s.matchesWon, 0);
    expect(totalWins).toBe(15);

    // Total matchesLost across all players = 15
    const totalLosses = standings.reduce((sum, s) => sum + s.matchesLost, 0);
    expect(totalLosses).toBe(15);

    // Points should be 2 * matchesWon (no ties)
    for (const s of standings) {
      expect(s.points).toBe(s.matchesWon * 2);
    }

    // Total 20s: each match has 2 for A, 0 for B → total across all = 30
    const total20s = standings.reduce((sum, s) => sum + s.total20s, 0);
    expect(total20s).toBe(30);

    // Positions should be assigned (1-6, no zeros)
    const positions = standings.map(s => s.position).sort((a, b) => a - b);
    expect(positions.every(p => p >= 1 && p <= 6)).toBe(true);

    // Head-to-head records should exist
    for (const s of standings) {
      const h2hKeys = Object.keys(s.headToHeadRecord || {});
      // Each player has h2h records against their 5 opponents
      expect(h2hKeys.length).toBe(5);
    }

    console.log(`  📊 Stats: ${mockStore.totalCommits} commits, ${mockStore.totalRetries} retries`);
    console.log(`  📊 Standings:`, standings.map(s => ({
      id: s.participantId,
      pos: s.position,
      W: s.matchesWon,
      L: s.matchesLost,
      pts: s.points,
      '20s': s.total20s
    })));
  });
});

describe('Round sync does not overwrite completion', () => {
  it('Test 8: round sync after completion is a no-op', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const match = matches[0];

    // Complete the match with final data
    await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(
        2, 1, 10, 6, 3, 1,
        [
          { gameNumber: 1, roundInGame: 1, pointsA: 4, pointsB: 2, twentiesA: 1, twentiesB: 0 },
          { gameNumber: 1, roundInGame: 2, pointsA: 6, pointsB: 4, twentiesA: 2, twentiesB: 1 }
        ]
      )
    );

    // Verify completion
    let updated = readTournament(tournament.id);
    let m = findMatchInTournament(updated, match.id);
    expect(m!.status).toBe('COMPLETED');
    expect(m!.gamesWonA).toBe(2);
    expect(m!.rounds).toHaveLength(2);

    // Now a "stale" round sync arrives (from a lagging client)
    const staleResult = await updateTournamentMatchRounds(
      tournament.id,
      match.id,
      'GROUP',
      'group-1',
      [{ gameNumber: 1, roundInGame: 1, pointsA: 0, pointsB: 0, twentiesA: 0, twentiesB: 0 }],
      { gamesWonA: 0, gamesWonB: 0 }
    );

    // Sync call returns true (it found the match, just skipped the update)
    expect(staleResult).toBe(true);

    // Match data is UNCHANGED — completion data preserved
    updated = readTournament(tournament.id);
    m = findMatchInTournament(updated, match.id);
    expect(m!.status).toBe('COMPLETED');
    expect(m!.gamesWonA).toBe(2);
    expect(m!.gamesWonB).toBe(1);
    expect(m!.rounds).toHaveLength(2);
    expect(m!.rounds![0].pointsA).toBe(4); // Original data, not stale zeros
  });
});

// ─── Real-world scale: 30 and 50 concurrent match completions ───────────────
// Simulates the worst case: all matches in a round finishing at the exact same instant.
// In reality, matches stagger over 1-3 minutes, so actual concurrency is much lower.

describe('Real-world scale: 30 and 50 concurrent completions', () => {
  it('30 concurrent completions (e.g., 15 tables × 2 groups)', async () => {
    // 8 participants = 28 matches (close to 30)
    const tournament = createTestTournament({ numParticipants: 8 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(28);

    const results = await Promise.all(
      matches.map((match, i) =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(i % 2 === 0 ? 2 : 1, i % 2 === 0 ? 1 : 2, 6, 4, 1, 0)
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    let completedCount = 0;
    for (const round of updated.groupStage!.groups[0].schedule!) {
      for (const m of round.matches) {
        if (m.status === 'COMPLETED') completedCount++;
      }
    }
    expect(completedCount).toBe(28);
    expect(mockStore.totalRetries).toBeGreaterThan(0);
    console.log(`  📊 30 concurrent: ${mockStore.totalCommits} commits, ${mockStore.totalRetries} retries`);
  });

  it('50 concurrent completions (worst case: all tables finish at once)', async () => {
    // 10 participants = 45 matches; also test 50 from 11 participants = 55
    const tournament = createTestTournament({ numParticipants: 11 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    // 11 players (odd) = 55 matches total, some are BYE walkovers
    // Use first 50 IN_PROGRESS matches
    const first50 = matches.slice(0, 50);
    expect(first50.length).toBe(50);

    const results = await Promise.all(
      first50.map((match, i) =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(i % 2 === 0 ? 2 : 0, i % 2 === 0 ? 0 : 2, 8, 2, 1, 0)
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    let completedCount = 0;
    for (const round of updated.groupStage!.groups[0].schedule!) {
      for (const m of round.matches) {
        if (m.status === 'COMPLETED' && m.participantB !== 'BYE') completedCount++;
      }
    }
    expect(completedCount).toBe(50);
    expect(mockStore.totalRetries).toBeGreaterThan(0);
    console.log(`  📊 50 concurrent: ${mockStore.totalCommits} commits, ${mockStore.totalRetries} retries`);
  });

  it('50 concurrent mixed: 25 completions + 25 round syncs', async () => {
    const tournament = createTestTournament({ numParticipants: 11 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const toComplete = matches.slice(0, 25);
    const toSync = matches.slice(25, 50);

    const completions = toComplete.map((match, i) =>
      updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(2, 0, 8, 2, 1, 0)
      )
    );

    const syncs = toSync.map((match, i) =>
      updateTournamentMatchRounds(
        tournament.id,
        match.id,
        'GROUP',
        'group-1',
        [{ gameNumber: 1, roundInGame: 1, pointsA: 4, pointsB: 2, twentiesA: 1, twentiesB: 0 }],
        { gamesWonA: 0, gamesWonB: 0 }
      )
    );

    const results = await Promise.all([...completions, ...syncs]);
    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);

    // Verify all 25 completions
    for (const match of toComplete) {
      const m = findMatchInTournament(updated, match.id);
      expect(m!.status).toBe('COMPLETED');
    }

    // Verify all 25 syncs
    for (const match of toSync) {
      const m = findMatchInTournament(updated, match.id);
      expect(m!.rounds).toHaveLength(1);
    }

    console.log(`  📊 50 mixed: ${mockStore.totalCommits} commits, ${mockStore.totalRetries} retries`);
  });
});

// ============================================================================
// Winner determination edge cases
// ============================================================================

describe('Winner determination edge cases', () => {
  it('rounds mode + matchesToWin=1: winner by total points', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameMode: 'rounds',
      matchesToWin: 1
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const match = matches[0];

    // A wins by total points: 8 vs 4
    await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(1, 0, 8, 4, 1, 0)
    );

    const updated = readTournament(tournament.id);
    const m = findMatchInTournament(updated, match.id);
    expect(m!.status).toBe('COMPLETED');
    expect(m!.winner).toBe(match.participantA);
  });

  it('rounds mode + matchesToWin=2 (best-of-3): winner by games won, NOT total points', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameMode: 'rounds',
      matchesToWin: 2
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const match = matches[0];

    // B wins the series 2-1 even though A has more total points
    // Game 1: A wins 15-0 → A leads 1-0, totalA=15, totalB=0
    // Game 2: B wins 5-3 → tied 1-1, totalA=18, totalB=5
    // Game 3: B wins 5-3 → B wins 2-1, totalA=21, totalB=10
    await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(1, 2, 21, 10, 0, 0)
    );

    const updated = readTournament(tournament.id);
    const m = findMatchInTournament(updated, match.id);
    expect(m!.status).toBe('COMPLETED');
    // B should win (2 games vs 1), NOT A (who has 21 total points vs 10)
    expect(m!.winner).toBe(match.participantB);
  });

  it('points mode + matchesToWin=2: winner by games won', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameMode: 'points',
      matchesToWin: 2
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const match = matches[0];

    // A wins the series 2-0
    await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(2, 0, 14, 4, 2, 0)
    );

    const updated = readTournament(tournament.id);
    const m = findMatchInTournament(updated, match.id);
    expect(m!.winner).toBe(match.participantA);
  });

  it('rounds mode + matchesToWin=1: tie when total points equal', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameMode: 'rounds',
      matchesToWin: 1
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const match = matches[0];

    // Tie: both have 6 total points
    await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(0, 0, 6, 6, 1, 1)
    );

    const updated = readTournament(tournament.id);
    const m = findMatchInTournament(updated, match.id);
    expect(m!.status).toBe('COMPLETED');
    expect(m!.winner).toBeUndefined(); // Tie, no winner
  });

  it('points mode: tie when games won are equal', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameMode: 'points',
      matchesToWin: 1
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const match = matches[0];

    // Tie: both won 0 games (shouldn't happen in practice, but tests the code)
    await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(0, 0, 0, 0, 0, 0)
    );

    const updated = readTournament(tournament.id);
    const m = findMatchInTournament(updated, match.id);
    expect(m!.winner).toBeUndefined();
  });
});

// ============================================================================
// Swiss tournament match completions
// ============================================================================

describe('Swiss tournament match completions', () => {
  it('complete all Swiss round 1 matches — standings updated correctly', async () => {
    const tournament = createSwissTournament({
      numParticipants: 8,
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    // 8 players = 4 matches in Swiss round 1 (no BYE)
    expect(matches.length).toBe(4);

    // Complete all 4 matches: A always wins
    const results = await Promise.all(
      matches.map(match =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(1, 0, 8, 4, 1, 0)
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // All 8 players should have 1 match played
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(1);
    }

    // 4 winners, 4 losers
    const totalWins = standings.reduce((sum, s) => sum + s.matchesWon, 0);
    expect(totalWins).toBe(4);

    // Swiss points: winners get 2, losers get 0
    for (const s of standings) {
      if (s.matchesWon === 1) {
        expect(s.swissPoints).toBe(2);
      } else {
        expect(s.swissPoints).toBe(0);
      }
    }
  });

  it('Swiss with odd participants — BYE match handled', async () => {
    const tournament = createSwissTournament({
      numParticipants: 7,
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    // 7 players: 3 real matches + 1 BYE (but BYE is auto-completed, not IN_PROGRESS)
    expect(matches.length).toBe(3);

    const results = await Promise.all(
      matches.map(match =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(1, 0, 8, 4, 1, 0)
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // 3 match winners + BYE beneficiary = 4 with at least 1 win
    // (BYE standings are handled at pairing generation, not match completion)
    const totalMatchesPlayed = standings.reduce((sum, s) => sum + s.matchesPlayed, 0);
    // 3 matches × 2 participants + BYE handled separately = at least 6
    expect(totalMatchesPlayed).toBeGreaterThanOrEqual(6);
  });

  it('Swiss concurrent completions preserve standings', async () => {
    const tournament = createSwissTournament({
      numParticipants: 10,
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    // 10 players = 5 matches in Swiss round 1
    expect(matches.length).toBe(5);

    // All 5 complete concurrently
    const results = await Promise.all(
      matches.map((match, i) =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(
            i % 2 === 0 ? 1 : 0,
            i % 2 === 0 ? 0 : 1,
            i % 2 === 0 ? 8 : 4,
            i % 2 === 0 ? 4 : 8,
            1, 0
          )
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // All 10 players should have 1 match played
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(1);
    }

    const totalWins = standings.reduce((sum, s) => sum + s.matchesWon, 0);
    expect(totalWins).toBe(5);

    expect(mockStore.totalRetries).toBeGreaterThan(0);
  });
});

// ============================================================================
// Multi-group tournament edge cases
// ============================================================================

describe('Multi-group tournament completions', () => {
  it('2 groups: completions in both groups maintain separate standings', async () => {
    const tournament = createMultiGroupTournament(8, 2);
    seedTournament(tournament);

    // Complete one match per group
    const matchesGroup0 = getInProgressMatches(tournament, 0);
    const matchesGroup1 = getInProgressMatches(tournament, 1);

    expect(matchesGroup0.length).toBeGreaterThan(0);
    expect(matchesGroup1.length).toBeGreaterThan(0);

    const results = await Promise.all([
      updateMatchResult(
        tournament.id,
        matchesGroup0[0].id,
        createMatchResult(2, 0, 8, 2, 1, 0)
      ),
      updateMatchResult(
        tournament.id,
        matchesGroup1[0].id,
        createMatchResult(0, 2, 2, 8, 0, 1)
      )
    ]);

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);

    // Group 0: match completed
    const m0 = findMatchInTournament(updated, matchesGroup0[0].id);
    expect(m0!.status).toBe('COMPLETED');
    expect(m0!.winner).toBe(matchesGroup0[0].participantA);

    // Group 1: match completed
    const m1 = findMatchInTournament(updated, matchesGroup1[0].id);
    expect(m1!.status).toBe('COMPLETED');
    expect(m1!.winner).toBe(matchesGroup1[0].participantB);

    // Verify standings are separate
    const standings0 = updated.groupStage!.groups[0].standings;
    const standings1 = updated.groupStage!.groups[1].standings;

    const played0 = standings0.reduce((sum, s) => sum + s.matchesPlayed, 0);
    const played1 = standings1.reduce((sum, s) => sum + s.matchesPlayed, 0);
    expect(played0).toBe(2); // 1 match = 2 matchesPlayed entries
    expect(played1).toBe(2);
  });
});

// ============================================================================
// Standings with ties
// ============================================================================

describe('Standings with tied matches', () => {
  it('tied match increments matchesTied for both players', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const match = matches[0];

    // Tie: same total points
    await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(0, 0, 6, 6, 1, 1)
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    const standingA = standings.find(s => s.participantId === match.participantA);
    const standingB = standings.find(s => s.participantId === match.participantB);

    expect(standingA!.matchesTied).toBe(1);
    expect(standingB!.matchesTied).toBe(1);
    expect(standingA!.matchesWon).toBe(0);
    expect(standingB!.matchesWon).toBe(0);
    // Tie points: 1 each (calculateMatchPoints: win=2, tie=1)
    expect(standingA!.points).toBe(1);
    expect(standingB!.points).toBe(1);
  });
});

// ============================================================================
// Timer auto-reset when round completes
// ============================================================================

describe('Timer auto-reset on round completion', () => {
  it('RR: timer resets when all matches in a round are completed', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    // Add a running countdown timer
    (tournament as any).countdownTimer = {
      status: 'running',
      endsAt: Date.now() + 300000,
      remaining: 300,
      duration: 600
    };
    seedTournament(tournament);

    // 4 players = 3 rounds × 2 matches = 6 total
    // Round 1 has 2 matches. Complete only round 1 matches.
    const round1Matches = tournament.groupStage!.groups[0].schedule![0].matches
      .filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');
    expect(round1Matches.length).toBe(2);

    // Complete first match — timer should NOT reset yet
    await updateMatchResult(
      tournament.id,
      round1Matches[0].id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    let updated = readTournament(tournament.id);
    expect(updated.countdownTimer?.status).toBe('running'); // Not yet reset

    // Complete second (last) match of round 1 — timer SHOULD reset
    await updateMatchResult(
      tournament.id,
      round1Matches[1].id,
      createMatchResult(1, 2, 4, 8, 0, 1)
    );

    updated = readTournament(tournament.id);
    expect(updated.countdownTimer).toBeDefined();
    expect(updated.countdownTimer!.status).toBe('stopped');
    expect(updated.countdownTimer!.remaining).toBe(600); // Reset to full duration
    expect(updated.countdownTimer!.duration).toBe(600);
  });

  it('RR: timer does NOT reset when only some matches in round complete', async () => {
    const tournament = createTestTournament({ numParticipants: 6 });
    (tournament as any).countdownTimer = {
      status: 'running',
      endsAt: Date.now() + 200000,
      remaining: 200,
      duration: 600
    };
    seedTournament(tournament);

    // 6 players = 5 rounds × 3 matches. Round 1 has 3 matches.
    const round1Matches = tournament.groupStage!.groups[0].schedule![0].matches
      .filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');
    expect(round1Matches.length).toBe(3);

    // Complete only 2 of 3 matches
    await updateMatchResult(tournament.id, round1Matches[0].id, createMatchResult(2, 0, 8, 2, 1, 0));
    await updateMatchResult(tournament.id, round1Matches[1].id, createMatchResult(1, 2, 4, 8, 0, 1));

    const updated = readTournament(tournament.id);
    // Timer still running — round not fully complete
    expect(updated.countdownTimer!.status).toBe('running');
  });

  it('RR: timer not affected when no timer exists', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    // No countdownTimer field
    seedTournament(tournament);

    const round1Matches = tournament.groupStage!.groups[0].schedule![0].matches
      .filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');

    // Complete all round 1 matches
    for (const match of round1Matches) {
      await updateMatchResult(tournament.id, match.id, createMatchResult(2, 0, 8, 2, 1, 0));
    }

    const updated = readTournament(tournament.id);
    expect(updated.countdownTimer).toBeUndefined();
  });

  it('RR: timer resets with already-stopped timer (preserves duration)', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    // Timer already stopped (at 0, timeout state)
    (tournament as any).countdownTimer = {
      status: 'stopped',
      remaining: 0,
      duration: 480
    };
    seedTournament(tournament);

    const round1Matches = tournament.groupStage!.groups[0].schedule![0].matches
      .filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');

    for (const match of round1Matches) {
      await updateMatchResult(tournament.id, match.id, createMatchResult(2, 0, 8, 2, 1, 0));
    }

    const updated = readTournament(tournament.id);
    expect(updated.countdownTimer!.status).toBe('stopped');
    expect(updated.countdownTimer!.remaining).toBe(480); // Reset to original duration
    expect(updated.countdownTimer!.duration).toBe(480);
  });

  it('Swiss: timer resets when all matches in current round complete', async () => {
    const tournament = createSwissTournament({ numParticipants: 8 });
    (tournament as any).countdownTimer = {
      status: 'running',
      endsAt: Date.now() + 100000,
      remaining: 100,
      duration: 600
    };
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(4); // 8 players = 4 Swiss matches

    // Complete all 4 matches
    for (const match of matches) {
      await updateMatchResult(tournament.id, match.id, createMatchResult(1, 0, 8, 4, 1, 0));
    }

    const updated = readTournament(tournament.id);
    expect(updated.countdownTimer!.status).toBe('stopped');
    expect(updated.countdownTimer!.remaining).toBe(600);
  });

  it('RR concurrent: all round matches complete simultaneously → timer resets exactly once', async () => {
    const tournament = createTestTournament({ numParticipants: 6 });
    (tournament as any).countdownTimer = {
      status: 'running',
      endsAt: Date.now() + 500000,
      remaining: 500,
      duration: 600
    };
    seedTournament(tournament);

    // Round 1 has 3 matches
    const round1Matches = tournament.groupStage!.groups[0].schedule![0].matches
      .filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');
    expect(round1Matches.length).toBe(3);

    // Complete all 3 concurrently
    const results = await Promise.all(
      round1Matches.map((match, i) =>
        updateMatchResult(tournament.id, match.id, createMatchResult(i % 2 === 0 ? 2 : 0, i % 2 === 0 ? 0 : 2, 8, 2, 1, 0))
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    // Timer should be reset (the last concurrent completion triggers it)
    expect(updated.countdownTimer!.status).toBe('stopped');
    expect(updated.countdownTimer!.remaining).toBe(600);
  });

  it('Multi-group RR: timer resets only when ALL groups have round complete', async () => {
    const tournament = createMultiGroupTournament(8, 2);
    (tournament as any).countdownTimer = {
      status: 'running',
      endsAt: Date.now() + 300000,
      remaining: 300,
      duration: 600
    };
    seedTournament(tournament);

    // Group A round 1 matches
    const group0Schedule = tournament.groupStage!.groups[0].schedule!;
    const group1Schedule = tournament.groupStage!.groups[1].schedule!;
    const g0r1 = group0Schedule[0].matches.filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');
    const g1r1 = group1Schedule[0].matches.filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');

    expect(g0r1.length).toBeGreaterThan(0);
    expect(g1r1.length).toBeGreaterThan(0);

    // Complete all Group A round 1 matches
    for (const match of g0r1) {
      await updateMatchResult(tournament.id, match.id, createMatchResult(2, 0, 8, 2, 1, 0));
    }

    let updated = readTournament(tournament.id);
    // Timer should NOT reset — Group B round 1 still has matches
    expect(updated.countdownTimer!.status).toBe('running');

    // Complete all Group B round 1 matches
    for (const match of g1r1) {
      await updateMatchResult(tournament.id, match.id, createMatchResult(2, 0, 8, 2, 1, 0));
    }

    updated = readTournament(tournament.id);
    // NOW timer resets — both groups have round 1 complete
    expect(updated.countdownTimer!.status).toBe('stopped');
    expect(updated.countdownTimer!.remaining).toBe(600);
  });

  it('RR: completing round 2 matches after round 1 was already done also resets timer', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    (tournament as any).countdownTimer = {
      status: 'running',
      endsAt: Date.now() + 300000,
      remaining: 300,
      duration: 600
    };
    seedTournament(tournament);

    const schedule = tournament.groupStage!.groups[0].schedule!;
    expect(schedule.length).toBe(3); // 4 players = 3 rounds

    // Complete all round 1 matches
    const r1Matches = schedule[0].matches.filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');
    for (const match of r1Matches) {
      await updateMatchResult(tournament.id, match.id, createMatchResult(2, 0, 8, 2, 1, 0));
    }

    let updated = readTournament(tournament.id);
    expect(updated.countdownTimer!.status).toBe('stopped');
    expect(updated.countdownTimer!.remaining).toBe(600);

    // Admin restarts timer for round 2
    const store = readTournament(tournament.id);
    (store as any).countdownTimer = {
      status: 'running',
      endsAt: Date.now() + 600000,
      remaining: 600,
      duration: 600
    };
    seedTournament(store);

    // Complete round 2 matches
    const updatedT = readTournament(tournament.id);
    const r2Matches = updatedT.groupStage!.groups[0].schedule![1].matches
      .filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');

    for (const match of r2Matches) {
      await updateMatchResult(tournament.id, match.id, createMatchResult(1, 2, 4, 8, 0, 1));
    }

    updated = readTournament(tournament.id);
    // Timer should reset again
    expect(updated.countdownTimer!.status).toBe('stopped');
    expect(updated.countdownTimer!.remaining).toBe(600);
  });

  it('RR with BYE: round complete check ignores BYE matches', async () => {
    // 5 players = odd → BYE matches in each round
    const tournament = createTestTournament({ numParticipants: 5 });
    (tournament as any).countdownTimer = {
      status: 'running',
      endsAt: Date.now() + 300000,
      remaining: 300,
      duration: 600
    };
    seedTournament(tournament);

    // Round 1: 2 real matches + 1 BYE match
    const round1 = tournament.groupStage!.groups[0].schedule![0];
    const realMatches = round1.matches.filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');
    const byeMatches = round1.matches.filter(m => m.participantB === 'BYE');
    expect(realMatches.length).toBe(2);
    expect(byeMatches.length).toBe(1);

    // Complete both real matches (BYE is already handled)
    for (const match of realMatches) {
      await updateMatchResult(tournament.id, match.id, createMatchResult(2, 0, 8, 2, 1, 0));
    }

    const updated = readTournament(tournament.id);
    // Timer should reset — BYE matches don't block round completion
    expect(updated.countdownTimer!.status).toBe('stopped');
    expect(updated.countdownTimer!.remaining).toBe(600);
  });

  it('Swiss: timer not reset when only partial round complete', async () => {
    const tournament = createSwissTournament({ numParticipants: 10 });
    (tournament as any).countdownTimer = {
      status: 'running',
      endsAt: Date.now() + 400000,
      remaining: 400,
      duration: 600
    };
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(5); // 10 players = 5 matches

    // Complete only 3 of 5
    for (let i = 0; i < 3; i++) {
      await updateMatchResult(tournament.id, matches[i].id, createMatchResult(1, 0, 8, 4, 1, 0));
    }

    const updated = readTournament(tournament.id);
    expect(updated.countdownTimer!.status).toBe('running');
  });

  it('Paused timer also gets reset on round completion', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    (tournament as any).countdownTimer = {
      status: 'paused',
      remaining: 120,
      duration: 600
    };
    seedTournament(tournament);

    const round1Matches = tournament.groupStage!.groups[0].schedule![0].matches
      .filter(m => m.participantB !== 'BYE' && m.status === 'IN_PROGRESS');

    for (const match of round1Matches) {
      await updateMatchResult(tournament.id, match.id, createMatchResult(2, 0, 8, 2, 1, 0));
    }

    const updated = readTournament(tournament.id);
    expect(updated.countdownTimer!.status).toBe('stopped');
    expect(updated.countdownTimer!.remaining).toBe(600); // Full reset
  });
});
