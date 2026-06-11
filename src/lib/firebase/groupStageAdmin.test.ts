/**
 * Group stage admin operations — critical bug regression tests
 *
 * Covers bugs found in the admin group-stage management flow
 * (/admin/tournaments/[id]/groups):
 *
 * 1. markNoShow over a COMPLETED match must clear the old result
 *    (totalPoints/total20s/rounds) — otherwise calculateStandings keeps
 *    counting points/20s of a match that is now a WALKOVER.
 * 2. updateMatchResult overwriting a WALKOVER must clear noShowParticipant
 *    and walkedOverAt — otherwise the match reads as COMPLETED with
 *    leftover walkover metadata.
 * 3. calculateStandings must honor the tournament's custom tiebreakerPriority
 *    (it used to silently fall back to the default priority, so automatic
 *    recalcs ordered standings differently than manual recalcs).
 * 4. generateSwissPairings must reject non-sequential round numbers
 *    (round skipping from a stale client).
 * 5. updateSwissRoundsConfig must enforce server-side what the client
 *    already validates (integer >= 1; reducing to the current round only
 *    when that round is fully played).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import {
  createTestTournament,
  createSwissTournament,
  getInProgressMatches,
  createMatchResult,
  findMatchBetween,
  findMatchInTournament
} from './__mocks__/testTournamentFactory';
import type { Tournament } from '$lib/types/tournament';

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

const { updateMatchResult, markNoShow } = await import('./tournamentMatches');
const { generateSwissPairings, updateSwissRoundsConfig } = await import('./tournamentGroups');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SAMPLE_ROUNDS = [
  { gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
  { gameNumber: 1, roundInGame: 2, pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 1 },
  { gameNumber: 1, roundInGame: 3, pointsA: 2, pointsB: 0, twentiesA: 0, twentiesB: 0 },
  { gameNumber: 1, roundInGame: 4, pointsA: 2, pointsB: 0, twentiesA: 0, twentiesB: 0 }
];

async function completeSwissRound(tournamentId: string, roundNumber: number): Promise<void> {
  const tournament = readTournament(tournamentId);
  const pairing = tournament.groupStage!.groups[0].pairings!.find(p => p.roundNumber === roundNumber);
  if (!pairing) throw new Error(`Round ${roundNumber} not found`);
  for (const match of pairing.matches) {
    if (match.participantB === 'BYE') continue;
    if (match.status === 'COMPLETED' || match.status === 'WALKOVER') continue;
    const ok = await updateMatchResult(tournamentId, match.id, createMatchResult(2, 0, 8, 3, 1, 0));
    if (!ok) throw new Error(`Could not complete match ${match.id}`);
  }
}

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── 1. markNoShow over a COMPLETED match ────────────────────────────────────

describe('markNoShow overwriting a COMPLETED match', () => {
  it('clears stale totalPoints/total20s/rounds so standings do not count them', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    seedTournament(tournament);

    const match = findMatchBetween(tournament, 'player-1', 'player-2')!;
    expect(match).toBeTruthy();

    // Complete the match with a real result first
    const completed = await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(1, 0, 8, 3, 2, 1, SAMPLE_ROUNDS)
    );
    expect(completed).toBe(true);

    let stored = findMatchInTournament(readTournament(tournament.id), match.id)!;
    expect(stored.status).toBe('COMPLETED');
    expect(stored.totalPointsA).toBe(8);
    expect(stored.rounds?.length).toBe(4);

    // Admin converts it to a walkover (player-2 didn't actually show up)
    const noShowOk = await markNoShow(tournament.id, match.id, stored.participantB);
    expect(noShowOk).toBe(true);

    stored = findMatchInTournament(readTournament(tournament.id), match.id)!;
    expect(stored.status).toBe('WALKOVER');
    expect(stored.winner).toBe(stored.participantA);
    expect(stored.noShowParticipant).toBe(stored.participantB);

    // Old result data must be gone
    expect(stored.totalPointsA).toBeUndefined();
    expect(stored.totalPointsB).toBeUndefined();
    expect(stored.total20sA).toBeUndefined();
    expect(stored.total20sB).toBeUndefined();
    expect(stored.rounds).toBeUndefined();

    // Standings must not count the old points/20s
    const standings = readTournament(tournament.id).groupStage!.groups[0].standings!;
    const winnerStanding = standings.find(s => s.participantId === stored.participantA)!;
    expect(winnerStanding.matchesWon).toBe(1);
    expect(winnerStanding.totalPointsScored).toBe(0);
    expect(winnerStanding.total20s).toBe(0);

    const loserStanding = standings.find(s => s.participantId === stored.participantB)!;
    expect(loserStanding.matchesLost).toBe(1);
    expect(loserStanding.totalPointsScored).toBe(0);
    expect(loserStanding.total20s).toBe(0);
  });
});

// ─── 2. updateMatchResult overwriting a WALKOVER ─────────────────────────────

describe('updateMatchResult overwriting a WALKOVER', () => {
  it('clears noShowParticipant and walkedOverAt when the match is completed for real', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    seedTournament(tournament);

    const match = findMatchBetween(tournament, 'player-1', 'player-2')!;

    // First: mark as walkover
    const noShowOk = await markNoShow(tournament.id, match.id, match.participantB);
    expect(noShowOk).toBe(true);

    let stored = findMatchInTournament(readTournament(tournament.id), match.id)!;
    expect(stored.status).toBe('WALKOVER');
    expect(stored.noShowParticipant).toBe(match.participantB);
    expect(stored.walkedOverAt).toBeDefined();

    // Then: the players actually played — admin records the real result
    const overwriteOk = await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(0, 1, 3, 8, 0, 2, SAMPLE_ROUNDS),
      true // allowOverwrite
    );
    expect(overwriteOk).toBe(true);

    stored = findMatchInTournament(readTournament(tournament.id), match.id)!;
    expect(stored.status).toBe('COMPLETED');
    expect(stored.winner).toBe(match.participantB);

    // Walkover metadata must be gone
    expect(stored.noShowParticipant).toBeUndefined();
    expect(stored.walkedOverAt).toBeUndefined();

    // Standings reflect the real result
    const standings = readTournament(tournament.id).groupStage!.groups[0].standings!;
    const newWinner = standings.find(s => s.participantId === match.participantB)!;
    expect(newWinner.matchesWon).toBe(1);
    expect(newWinner.totalPointsScored).toBe(8);
    const newLoser = standings.find(s => s.participantId === match.participantA)!;
    expect(newLoser.matchesWon).toBe(0);
    expect(newLoser.matchesLost).toBe(1);
  });
});

// ─── 3. calculateStandings honors tiebreakerPriority ─────────────────────────

describe('calculateStandings tiebreakerPriority', () => {
  it('orders tied players by the custom priority, not the default one', async () => {
    // Custom priority resolves ties by total points scored FIRST.
    // Default priority is ['h2h', 'total20s', 'totalPoints', 'buchholz'].
    const tournament = createTestTournament({ numParticipants: 4 });
    tournament.groupStage!.tiebreakerPriority = ['totalPoints', 'total20s', 'h2h'];
    seedTournament(tournament);

    // player-1 beats player-2 with MANY points but ZERO 20s
    const matchA = findMatchBetween(tournament, 'player-1', 'player-2')!;
    const p1IsA = matchA.participantA === 'player-1';
    await updateMatchResult(
      tournament.id,
      matchA.id,
      createMatchResult(p1IsA ? 1 : 0, p1IsA ? 0 : 1, p1IsA ? 8 : 2, p1IsA ? 2 : 8, 0, 0)
    );

    // player-3 beats player-4 with FEW points but MANY 20s
    const matchB = findMatchBetween(tournament, 'player-3', 'player-4')!;
    const p3IsA = matchB.participantA === 'player-3';
    await updateMatchResult(
      tournament.id,
      matchB.id,
      createMatchResult(p3IsA ? 1 : 0, p3IsA ? 0 : 1, p3IsA ? 4 : 2, p3IsA ? 2 : 4, p3IsA ? 5 : 0, p3IsA ? 0 : 5)
    );

    // player-1 and player-3 are tied 1-0 with no head-to-head.
    // Custom priority (totalPoints first): player-1 (8 pts) above player-3 (4 pts).
    // Default priority would pick player-3 first via total20s (5 vs 0).
    const standings = readTournament(tournament.id).groupStage!.groups[0].standings!;
    const idxP1 = standings.findIndex(s => s.participantId === 'player-1');
    const idxP3 = standings.findIndex(s => s.participantId === 'player-3');
    expect(idxP1).toBeGreaterThanOrEqual(0);
    expect(idxP3).toBeGreaterThanOrEqual(0);
    expect(idxP1).toBeLessThan(idxP3);
  });
});

// ─── 4. generateSwissPairings round sequence validation ──────────────────────

describe('generateSwissPairings round sequence validation', () => {
  it('rejects skipping a round (stale client passes wrong round number)', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 4 });
    seedTournament(tournament);

    await completeSwissRound(tournament.id, 1);

    // currentRound is 1 — generating round 3 would skip round 2
    const skipResult = await generateSwissPairings(tournament.id, 3);
    expect(skipResult).toBe(false);

    const after = readTournament(tournament.id);
    expect(after.groupStage!.groups[0].pairings!.length).toBe(1);
    expect(after.groupStage!.currentRound).toBe(1);

    // The correct sequential round still works
    const okResult = await generateSwissPairings(tournament.id, 2);
    expect(okResult).toBe(true);
    expect(readTournament(tournament.id).groupStage!.groups[0].pairings!.length).toBe(2);
    expect(readTournament(tournament.id).groupStage!.currentRound).toBe(2);
  });

  it('rejects re-generating the current round (double click / second admin)', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 4 });
    seedTournament(tournament);

    await completeSwissRound(tournament.id, 1);

    expect(await generateSwissPairings(tournament.id, 2)).toBe(true);
    // Second call with the same round number (stale currentRound on a second client)
    expect(await generateSwissPairings(tournament.id, 2)).toBe(false);

    const after = readTournament(tournament.id);
    expect(after.groupStage!.groups[0].pairings!.length).toBe(2);
    expect(after.groupStage!.currentRound).toBe(2);
  });

  it('rejects generating round 1 again or round 0', async () => {
    const tournament = createSwissTournament({ numParticipants: 6, swissRounds: 3 });
    seedTournament(tournament);

    expect(await generateSwissPairings(tournament.id, 1)).toBe(false);
    expect(await generateSwissPairings(tournament.id, 0)).toBe(false);

    const after = readTournament(tournament.id);
    expect(after.groupStage!.groups[0].pairings!.length).toBe(1);
  });
});

// ─── 5. updateSwissRoundsConfig server-side validation ───────────────────────

describe('updateSwissRoundsConfig server-side validation', () => {
  it('rejects non-integer and < 1 values', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    seedTournament(tournament);

    expect(await updateSwissRoundsConfig(tournament.id, 0)).toBe(false);
    expect(await updateSwissRoundsConfig(tournament.id, -2)).toBe(false);
    expect(await updateSwissRoundsConfig(tournament.id, 2.5)).toBe(false);
    expect(await updateSwissRoundsConfig(tournament.id, NaN)).toBe(false);

    const after = readTournament(tournament.id);
    expect(after.groupStage!.numSwissRounds).toBe(5);
  });

  it('rejects reducing to the current round while it is still in progress', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    seedTournament(tournament);

    // Round 1 matches are IN_PROGRESS (factory default)
    expect(await updateSwissRoundsConfig(tournament.id, 1)).toBe(false);

    const after = readTournament(tournament.id);
    expect(after.groupStage!.numSwissRounds).toBe(5);
  });

  it('allows reducing to the current round once it is fully played (early finalization)', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    seedTournament(tournament);

    await completeSwissRound(tournament.id, 1);

    expect(await updateSwissRoundsConfig(tournament.id, 1)).toBe(true);

    const after = readTournament(tournament.id);
    expect(after.groupStage!.numSwissRounds).toBe(1);
    expect(after.groupStage!.totalRounds).toBe(1);
    expect(after.numSwissRounds).toBe(1);
  });

  it('rejects values below the current round', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    seedTournament(tournament);

    await completeSwissRound(tournament.id, 1);
    await generateSwissPairings(tournament.id, 2);

    // currentRound is now 2 — cannot go back to 1
    expect(await updateSwissRoundsConfig(tournament.id, 1)).toBe(false);
    expect(readTournament(tournament.id).groupStage!.numSwissRounds).toBe(5);
  });

  it('allows increasing the total at any time', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 3 });
    seedTournament(tournament);

    expect(await updateSwissRoundsConfig(tournament.id, 7)).toBe(true);
    expect(readTournament(tournament.id).groupStage!.numSwissRounds).toBe(7);
  });
});
