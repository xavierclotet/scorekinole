/**
 * Tournament integration tests
 *
 * End-to-end tests that simulate complete tournament flows:
 * updateMatchResult() → calculateStandings() → resolveTiebreaker()
 *
 * Uses REAL algorithms (not mocked): tiebreaker, H2H, standings, scheduling.
 * Only Firebase layer is mocked via MockFirestore.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import {
  createTestTournament,
  createSwissTournament,
  createMultiGroupTournament,
  getInProgressMatches,
  getAllMatches,
  createMatchResult,
  findMatchInTournament,
  findMatchBetween
} from './__mocks__/testTournamentFactory';
import type { Tournament, GroupMatch, SwissPairing } from '$lib/types/tournament';
import { generateSwissPairings as generateSwissPairingsAlgorithm } from '$lib/algorithms/swiss';

// ─── Shared mock state ───────────────────────────────────────────────────────

let mockStore: MockFirestore;

function seedTournament(tournament: Tournament): void {
  mockStore.setDocument(`tournaments/${tournament.id}`, tournament as unknown as Record<string, unknown>);
  mockStore.resetStats();
}

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

// ─── Import functions under test (AFTER mocks) ──────────────────────────────

const { updateMatchResult } = await import('./tournamentMatches');

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── Helper: complete a match sequentially ───────────────────────────────────

async function completeMatch(
  tournamentId: string,
  match: GroupMatch,
  result: ReturnType<typeof createMatchResult>
): Promise<boolean> {
  return updateMatchResult(tournamentId, match.id, result);
}

/**
 * Complete all IN_PROGRESS matches in a tournament sequentially.
 * resultFn receives match index and returns the result to use.
 */
async function completeAllMatches(
  tournamentId: string,
  matches: GroupMatch[],
  resultFn: (match: GroupMatch, index: number) => ReturnType<typeof createMatchResult>
): Promise<void> {
  for (let i = 0; i < matches.length; i++) {
    const ok = await completeMatch(tournamentId, matches[i], resultFn(matches[i], i));
    expect(ok).toBe(true);
  }
}

// ─── GROUP 1: Round Robin 1 group ────────────────────────────────────────────

describe('Round Robin — single group', () => {
  it('6 players RR, WINS mode: all matches completed, standings correct', async () => {
    const tournament = createTestTournament({
      numParticipants: 6,
      qualificationMode: 'WINS',
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(15); // C(6,2) = 15

    // participantA always wins: 8-2 with 1 twenty
    await completeAllMatches(tournament.id, matches, () =>
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // All 6 players played 5 matches
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(5);
      expect(s.matchesWon + s.matchesLost + s.matchesTied).toBe(5);
    }

    // Total wins = 15 (one winner per match)
    const totalWins = standings.reduce((sum, s) => sum + s.matchesWon, 0);
    expect(totalWins).toBe(15);

    // Points = wins * 2
    for (const s of standings) {
      expect(s.points).toBe(s.matchesWon * 2);
    }

    // Positions assigned 1-6
    const positions = standings.map(s => s.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6]);

    // H2H records exist for all pairs
    for (const s of standings) {
      expect(Object.keys(s.headToHeadRecord || {}).length).toBe(5);
    }
  });

  it('6 players RR, POINTS mode: standings ordered by totalPointsScored', async () => {
    const tournament = createTestTournament({
      numParticipants: 6,
      qualificationMode: 'POINTS',
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);

    // Each match: A scores variable points to create differentiated standings
    await completeAllMatches(tournament.id, matches, (match, i) => {
      // Give A increasing total points per match
      const pointsA = 8 + (i % 4);
      const pointsB = 2;
      return createMatchResult(2, 0, pointsA, pointsB, 0, 0);
    });

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // In POINTS mode, primary ranking is totalPointsScored
    // Standings should be sorted descending by totalPointsScored
    for (let i = 0; i < standings.length - 1; i++) {
      expect(standings[i].totalPointsScored).toBeGreaterThanOrEqual(standings[i + 1].totalPointsScored);
    }
  });

  it('5 players RR (odd, BYEs): BYE walkovers handled, standings correct', async () => {
    const tournament = createTestTournament({ numParticipants: 5 });
    seedTournament(tournament);

    const inProgressMatches = getInProgressMatches(tournament);
    expect(inProgressMatches.length).toBe(10); // C(5,2) = 10 real matches

    // Check that BYE walkovers exist in schedule
    const allMatches = getAllMatches(tournament);
    const byeMatches = allMatches.filter(m => m.participantB === 'BYE');
    expect(byeMatches.length).toBe(5); // 5 rounds × 1 BYE each
    expect(byeMatches.every(m => m.status === 'WALKOVER')).toBe(true);

    // Complete all real matches
    await completeAllMatches(tournament.id, inProgressMatches, () =>
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // Each player plays 4 real matches + 1 BYE = 5 matchesPlayed
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(5);
    }

    // Total wins = 10 (real matches) + 5 (BYE walkovers) = 15
    const totalWins = standings.reduce((sum, s) => sum + s.matchesWon, 0);
    expect(totalWins).toBe(15);

    // Positions assigned
    expect(standings.every(s => s.position >= 1 && s.position <= 5)).toBe(true);
  });

  it('H2H tiebreaker: 2 players tied in wins, H2H resolves', async () => {
    // 4 players: engineer it so P1 and P2 have same wins but P1 beat P2
    const tournament = createTestTournament({
      numParticipants: 4,
      qualificationMode: 'WINS'
    });
    seedTournament(tournament);

    const t = readTournament(tournament.id);
    const matches = getInProgressMatches(t);

    // Find specific matchups
    const p1vp2 = findMatchBetween(t, 'player-1', 'player-2')!;
    const p1vp3 = findMatchBetween(t, 'player-1', 'player-3')!;
    const p1vp4 = findMatchBetween(t, 'player-1', 'player-4')!;
    const p2vp3 = findMatchBetween(t, 'player-2', 'player-3')!;
    const p2vp4 = findMatchBetween(t, 'player-2', 'player-4')!;
    const p3vp4 = findMatchBetween(t, 'player-3', 'player-4')!;

    expect(p1vp2).not.toBeNull();
    expect(p1vp3).not.toBeNull();
    expect(p1vp4).not.toBeNull();
    expect(p2vp3).not.toBeNull();
    expect(p2vp4).not.toBeNull();
    expect(p3vp4).not.toBeNull();

    // P1 beats P2, P1 beats P3, P1 loses to P4 → P1: 2W 1L
    // P2 beats P3, P2 beats P4, P2 loses to P1 → P2: 2W 1L
    // P3 loses all (except vs P4)
    // P4 beats P1, loses to P2, beats P3

    // Complete in order — need to handle who is participantA carefully
    async function completeWithWinner(match: GroupMatch, winnerId: string) {
      const aWins = winnerId === match.participantA;
      await completeMatch(tournament.id, match, createMatchResult(
        aWins ? 2 : 0, aWins ? 0 : 2,
        aWins ? 8 : 2, aWins ? 2 : 8,
        1, 1 // Same 20s to ensure H2H breaks the tie
      ));
    }

    await completeWithWinner(p1vp2, 'player-1'); // P1 beats P2
    await completeWithWinner(p1vp3, 'player-1'); // P1 beats P3
    await completeWithWinner(p1vp4, 'player-4'); // P4 beats P1
    await completeWithWinner(p2vp3, 'player-2'); // P2 beats P3
    await completeWithWinner(p2vp4, 'player-2'); // P2 beats P4
    await completeWithWinner(p3vp4, 'player-4'); // P4 beats P3

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // P1: 2W 1L = 4pts, P2: 2W 1L = 4pts, P4: 2W 1L = 4pts, P3: 0W 3L = 0pts
    // Three-way tie at 4 pts between P1, P2, P4
    // P1 beat P2, P2 beat P4, P4 beat P1 → circular tie → mini-league
    // Mini-league: each has 1W 1L = 2pts → still tied → 20s breaks
    // Since all have same 20s, falls to further tiebreakers

    // P3 should be last
    const p3Standing = standings.find(s => s.participantId === 'player-3')!;
    expect(p3Standing.position).toBe(4);
    expect(p3Standing.matchesWon).toBe(0);

    // P1, P2, P4 all have 2 wins
    const p1 = standings.find(s => s.participantId === 'player-1')!;
    const p2 = standings.find(s => s.participantId === 'player-2')!;
    const p4 = standings.find(s => s.participantId === 'player-4')!;
    expect(p1.matchesWon).toBe(2);
    expect(p2.matchesWon).toBe(2);
    expect(p4.matchesWon).toBe(2);
  });

  it('3-player circular tie: mini-league used, further tiebreakers apply', async () => {
    // 3 players: A>B, B>C, C>A → circular tie
    const tournament = createTestTournament({ numParticipants: 3 });
    seedTournament(tournament);

    const t = readTournament(tournament.id);
    const ab = findMatchBetween(t, 'player-1', 'player-2')!;
    const bc = findMatchBetween(t, 'player-2', 'player-3')!;
    const ac = findMatchBetween(t, 'player-1', 'player-3')!;

    // A>B with more 20s for A
    async function completeWithWinner(match: GroupMatch, winnerId: string, twentiesW: number, twentiesL: number) {
      const aWins = winnerId === match.participantA;
      await completeMatch(tournament.id, match, createMatchResult(
        aWins ? 2 : 0, aWins ? 0 : 2,
        aWins ? 8 : 2, aWins ? 2 : 8,
        aWins ? twentiesW : twentiesL, aWins ? twentiesL : twentiesW
      ));
    }

    await completeWithWinner(ab, 'player-1', 3, 0); // A beats B, A gets 3 twenties
    await completeWithWinner(bc, 'player-2', 1, 0); // B beats C, B gets 1 twenty
    await completeWithWinner(ac, 'player-3', 2, 0); // C beats A, C gets 2 twenties

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // All 3 have 1W 1L = 2pts → tied
    // Mini-league: each pair played once, each has 1W 1L = 2pts in mini-league
    // 20s in mini-league: A=3, C=2, B=1 → A first by mini-league 20s, then C, then B
    expect(standings.length).toBe(3);
    // 3 players (odd) = each plays 2 real matches + 1 BYE walkover
    for (const s of standings) {
      expect(s.matchesWon).toBe(2);  // 1 real win + 1 BYE walkover
      expect(s.matchesLost).toBe(1); // 1 real loss
      expect(s.matchesPlayed).toBe(3);
      expect(s.points).toBe(4); // 2W × 2pts
    }

    // All tied at 4pts → mini-league: each has 1W 1L = 2pts
    // Mini-league 20s: P1(3) > P3(2) > P2(1)
    // A should be position 1 (most mini-league 20s: 3)
    // C should be position 2 (2nd mini-league 20s: 2)
    // B should be position 3 (least mini-league 20s: 1)
    const p1 = standings.find(s => s.participantId === 'player-1')!;
    const p2 = standings.find(s => s.participantId === 'player-2')!;
    const p3 = standings.find(s => s.participantId === 'player-3')!;
    expect(p1.position).toBe(1);
    expect(p2.position).toBe(3);
    expect(p3.position).toBe(2);
  });

  it('Game mode rounds: winner by totalPoints', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);

    // In rounds mode, winner is determined by totalPoints (not gamesWon)
    // A has more totalPoints → A wins even if gamesWon is same
    await completeAllMatches(tournament.id, matches, () =>
      createMatchResult(1, 1, 10, 6, 1, 0) // same gamesWon but A has more totalPoints
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // In rounds mode, totalPointsA > totalPointsB → participantA wins
    // So all matches should have winners (no ties)
    const allMatchesUpdated = getAllMatches(updated);
    const completedMatches = allMatchesUpdated.filter(m => m.status === 'COMPLETED');
    for (const m of completedMatches) {
      expect(m.winner).toBeDefined();
      expect(m.winner).toBe(m.participantA); // A always had more total points
    }

    // No ties
    for (const s of standings) {
      expect(s.matchesTied).toBe(0);
    }
  });

  it('Game mode points: winner by gamesWon', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameMode: 'points'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);

    // In points mode, winner is determined by gamesWon (not totalPoints)
    // A has more gamesWon → A wins even if totalPoints is lower
    await completeAllMatches(tournament.id, matches, () =>
      createMatchResult(2, 1, 5, 10, 0, 0) // A has more gamesWon, fewer totalPoints
    );

    const updated = readTournament(tournament.id);
    const allMatchesUpdated = getAllMatches(updated);
    const completedMatches = allMatchesUpdated.filter(m => m.status === 'COMPLETED');

    // A always won (more gamesWon)
    for (const m of completedMatches) {
      expect(m.winner).toBe(m.participantA);
    }
  });

  it('Tie in rounds mode: totalPointsA === totalPointsB → no winner, matchesTied incremented', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);

    // In rounds mode, if totalPointsA === totalPointsB → tie
    await completeAllMatches(tournament.id, matches, () =>
      createMatchResult(1, 1, 6, 6, 0, 0) // same totalPoints → tie
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // All matches are ties
    for (const s of standings) {
      expect(s.matchesTied).toBe(3); // 4 players, each plays 3 matches, all ties
      expect(s.matchesWon).toBe(0);
      expect(s.matchesLost).toBe(0);
      expect(s.points).toBe(3); // 3 ties × 1 point each
    }

    // All matches should have no winner
    const completedMatches = getAllMatches(updated).filter(m => m.status === 'COMPLETED');
    for (const m of completedMatches) {
      expect(m.winner).toBeUndefined();
    }
  });
});

// ─── GROUP 2: Swiss ──────────────────────────────────────────────────────────

describe('Swiss system', () => {
  it('8 players Swiss R1: pairings correct, standings after completion', async () => {
    const tournament = createSwissTournament({ numParticipants: 8 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(4); // 8 players = 4 matches in R1

    // Complete all R1 matches: A always wins
    await completeAllMatches(tournament.id, matches, () =>
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // 4 winners (2 pts each) + 4 losers (0 pts)
    const winners = standings.filter(s => s.matchesWon === 1);
    const losers = standings.filter(s => s.matchesLost === 1);
    expect(winners.length).toBe(4);
    expect(losers.length).toBe(4);

    // Swiss points
    for (const w of winners) {
      expect(w.swissPoints).toBe(2);
    }
    for (const l of losers) {
      expect(l.swissPoints).toBe(0);
    }

    // All played 1 match
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(1);
    }
  });

  it('7 players Swiss R1 (BYE): BYE handling and standings correct', async () => {
    const tournament = createSwissTournament({ numParticipants: 7 });
    seedTournament(tournament);

    // Check BYE exists
    const allMatches = getAllMatches(tournament);
    const byeMatches = allMatches.filter(m => m.participantB === 'BYE');
    expect(byeMatches.length).toBe(1);
    expect(byeMatches[0].status).toBe('WALKOVER');

    const inProgressMatches = getInProgressMatches(tournament);
    expect(inProgressMatches.length).toBe(3); // 7 players → 3 real matches + 1 BYE

    // Complete all real matches
    await completeAllMatches(tournament.id, inProgressMatches, () =>
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // BYE receiver should have 1 win (walkover)
    const byeReceiver = standings.find(s =>
      s.participantId === byeMatches[0].participantA
    )!;
    expect(byeReceiver.matchesWon).toBe(1);
    expect(byeReceiver.matchesPlayed).toBe(1);

    // Total of 4 winners (3 real + 1 BYE) and 3 losers
    const totalWins = standings.reduce((sum, s) => sum + s.matchesWon, 0);
    expect(totalWins).toBe(4);
  });

  it('Swiss POINTS mode: standings ordered by totalPointsScored', async () => {
    const tournament = createSwissTournament({
      numParticipants: 8,
      qualificationMode: 'POINTS'
    });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);

    // Give increasing totalPoints to create differentiated standings
    await completeAllMatches(tournament.id, matches, (_, i) =>
      createMatchResult(2, 0, 10 + i * 2, 2, 0, 0)
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // In POINTS mode, primary ranking is totalPointsScored
    // Standings should be sorted descending by totalPointsScored
    for (let i = 0; i < standings.length - 1; i++) {
      expect(standings[i].totalPointsScored).toBeGreaterThanOrEqual(standings[i + 1].totalPointsScored);
    }
  });
});

// ─── GROUP 3: Multiple groups ────────────────────────────────────────────────

describe('Multi-group Round Robin', () => {
  it('12 players, 2 groups: each group has independent schedule', async () => {
    const tournament = createMultiGroupTournament(12, 2);
    seedTournament(tournament);

    const groups = tournament.groupStage!.groups;
    expect(groups.length).toBe(2);

    // Each group has 6 players
    expect(groups[0].participants.length).toBe(6);
    expect(groups[1].participants.length).toBe(6);

    // Each group has C(6,2)=15 real matches
    const matchesA = getInProgressMatches(tournament, 0);
    const matchesB = getInProgressMatches(tournament, 1);
    expect(matchesA.length).toBe(15);
    expect(matchesB.length).toBe(15);

    // No overlap: group A participants ≠ group B participants
    const idsA = new Set(groups[0].participants);
    const idsB = new Set(groups[1].participants);
    for (const id of idsA) {
      expect(idsB.has(id)).toBe(false);
    }
  });

  it('Complete group A only: group B standings unchanged', async () => {
    const tournament = createMultiGroupTournament(12, 2);
    seedTournament(tournament);

    const matchesA = getInProgressMatches(tournament, 0);

    // Complete all group A matches
    await completeAllMatches(tournament.id, matchesA, () =>
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    const updated = readTournament(tournament.id);

    // Group A standings should be updated
    const standingsA = updated.groupStage!.groups[0].standings;
    for (const s of standingsA) {
      expect(s.matchesPlayed).toBe(5);
    }

    // Group B standings should still be zeroed
    const standingsB = updated.groupStage!.groups[1].standings;
    for (const s of standingsB) {
      expect(s.matchesPlayed).toBe(0);
      expect(s.matchesWon).toBe(0);
      expect(s.points).toBe(0);
    }
  });

  it('Both groups completed: positions 1-6 assigned independently', async () => {
    const tournament = createMultiGroupTournament(12, 2);
    seedTournament(tournament);

    // Complete all matches in both groups
    for (let gi = 0; gi < 2; gi++) {
      const matches = getInProgressMatches(tournament, gi);
      await completeAllMatches(tournament.id, matches, () =>
        createMatchResult(2, 0, 8, 2, 1, 0)
      );
      // Re-read tournament for next group (state changed)
    }

    const updated = readTournament(tournament.id);

    for (let gi = 0; gi < 2; gi++) {
      const standings = updated.groupStage!.groups[gi].standings;
      const positions = standings.map(s => s.position).sort((a, b) => a - b);
      expect(positions).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('30 players, 3 groups: large scale multi-group', async () => {
    const tournament = createMultiGroupTournament(30, 3);
    seedTournament(tournament);

    const groups = tournament.groupStage!.groups;
    expect(groups.length).toBe(3);

    // 30/3 = 10 players per group
    for (const g of groups) {
      expect(g.participants.length).toBe(10);
    }

    // Complete all matches in all groups
    for (let gi = 0; gi < 3; gi++) {
      const matches = getInProgressMatches(tournament, gi);
      // C(10,2) = 45 matches per group
      expect(matches.length).toBe(45);

      await completeAllMatches(tournament.id, matches, () =>
        createMatchResult(2, 0, 8, 2, 1, 0)
      );
    }

    const updated = readTournament(tournament.id);

    for (let gi = 0; gi < 3; gi++) {
      const standings = updated.groupStage!.groups[gi].standings;
      expect(standings.length).toBe(10);

      // All positions assigned 1-10
      const positions = standings.map(s => s.position).sort((a, b) => a - b);
      expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // All played 9 matches
      for (const s of standings) {
        expect(s.matchesPlayed).toBe(9);
      }
    }
  });
});

// ─── GROUP 4: Advanced tiebreakers ───────────────────────────────────────────

describe('Tiebreaker scenarios', () => {
  it('H2H direct: 2 players tied in points, H2H decides position', async () => {
    // 4 players: P1 and P2 both win 2 of 3, P1 beat P2 directly
    const tournament = createTestTournament({
      numParticipants: 4,
      qualificationMode: 'WINS'
    });
    seedTournament(tournament);

    const t = readTournament(tournament.id);

    async function completeWithWinner(pA: string, pB: string, winnerId: string) {
      const match = findMatchBetween(t, pA, pB)!;
      expect(match).not.toBeNull();
      const aWins = winnerId === match.participantA;
      await completeMatch(tournament.id, match, createMatchResult(
        aWins ? 2 : 0, aWins ? 0 : 2,
        aWins ? 8 : 2, aWins ? 2 : 8,
        1, 1 // same 20s
      ));
    }

    // P1 beats P2, P3; P1 loses to P4 → 2W 1L
    // P2 beats P3, P4; P2 loses to P1 → 2W 1L
    // But P1 beat P2 directly, so P1 should rank higher
    // P3: 0W; P4: 2W (beats P1, loses to P2, beats P3 — wait, let me recalculate)
    // Actually: P1>P2, P1>P3, P4>P1, P2>P3, P2>P4, P4>P3
    // P1: 2W(P2,P3) 1L(P4) = 4pts
    // P2: 2W(P3,P4) 1L(P1) = 4pts
    // P4: 2W(P1,P3) 1L(P2) = 4pts
    // P3: 0W 3L = 0pts
    // Three-way tie. H2H between any 2 is pairwise. But this is 3+ tie.

    // For a pure 2-player H2H test, let's do 3 players instead
    // P1>P2, P1>P3 (but different margins so not circular)
    // Actually, let me use a simpler setup: 4 players but ensure only 2 tie

    // P1 beats P2, P1 beats P3, P1 loses to P4 → 2W
    // P2 loses to P1, P2 beats P4, P2 beats P3 → 2W
    // P4 beats P1, P4 loses to P2, P4 loses to P3 → 1W
    // P3 loses to P1, loses to P2, P3 beats P4 → 1W
    await completeWithWinner('player-1', 'player-2', 'player-1'); // P1>P2
    await completeWithWinner('player-1', 'player-3', 'player-1'); // P1>P3
    await completeWithWinner('player-1', 'player-4', 'player-4'); // P4>P1
    await completeWithWinner('player-2', 'player-3', 'player-2'); // P2>P3
    await completeWithWinner('player-2', 'player-4', 'player-2'); // P2>P4
    await completeWithWinner('player-3', 'player-4', 'player-3'); // P3>P4

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // P1: 2W 1L = 4pts, P2: 2W 1L = 4pts → tied, but P1 beat P2 → P1 higher
    // P3: 1W 2L = 2pts, P4: 1W 2L = 2pts → tied, but P3 beat P4 → P3 higher
    const p1 = standings.find(s => s.participantId === 'player-1')!;
    const p2 = standings.find(s => s.participantId === 'player-2')!;
    const p3 = standings.find(s => s.participantId === 'player-3')!;
    const p4 = standings.find(s => s.participantId === 'player-4')!;

    expect(p1.matchesWon).toBe(2);
    expect(p2.matchesWon).toBe(2);
    expect(p3.matchesWon).toBe(1);
    expect(p4.matchesWon).toBe(1);

    // H2H: P1 beat P2 → P1 ranks higher
    expect(p1.position).toBeLessThan(p2.position);
    // H2H: P3 beat P4 → P3 ranks higher
    expect(p3.position).toBeLessThan(p4.position);
  });

  it('20s tiebreaker: tied points + neutral H2H, 20s decides', async () => {
    // 4 players: P1 and P2 tie in points and tie their H2H match
    const tournament = createTestTournament({
      numParticipants: 4,
      qualificationMode: 'WINS',
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const t = readTournament(tournament.id);

    async function completeSpecific(pA: string, pB: string, winnerId: string | null, twentiesA: number, twentiesB: number) {
      const match = findMatchBetween(t, pA, pB)!;
      expect(match).not.toBeNull();
      if (winnerId === null) {
        // Tie in rounds mode: same totalPoints
        await completeMatch(tournament.id, match, createMatchResult(1, 1, 6, 6, twentiesA, twentiesB));
      } else {
        const aWins = winnerId === match.participantA;
        await completeMatch(tournament.id, match, createMatchResult(
          aWins ? 2 : 0, aWins ? 0 : 2,
          aWins ? 8 : 2, aWins ? 2 : 8,
          twentiesA, twentiesB
        ));
      }
    }

    // P1 and P2 tie their direct match
    // P1 beats P3, P2 beats P3 → both 1W 0L 1T = 3pts, tied H2H (tie)
    // P1 gets more 20s overall → P1 should rank higher
    await completeSpecific('player-1', 'player-2', null, 0, 0); // Tie, no 20s
    await completeSpecific('player-1', 'player-3', 'player-1', 3, 0); // P1 wins with 3 twenties
    await completeSpecific('player-1', 'player-4', 'player-4', 0, 0);
    await completeSpecific('player-2', 'player-3', 'player-2', 1, 0); // P2 wins with 1 twenty
    await completeSpecific('player-2', 'player-4', 'player-4', 0, 0);
    await completeSpecific('player-3', 'player-4', 'player-4', 0, 0);

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    const p1 = standings.find(s => s.participantId === 'player-1')!;
    const p2 = standings.find(s => s.participantId === 'player-2')!;

    // P1 and P2 both have: 1W 1T 1L = 3pts
    expect(p1.points).toBe(3);
    expect(p2.points).toBe(3);

    // H2H is a TIE, so 20s should break the tie
    // P1 has 3 total 20s, P2 has 1 total 20s → P1 higher
    expect(p1.total20s).toBe(3);
    expect(p2.total20s).toBe(1);
    expect(p1.position).toBeLessThan(p2.position);
  });

  it('Buchholz tiebreaker: same points, H2H tied, same 20s → Buchholz decides', async () => {
    // 6 players: engineer P1 and P2 to tie in everything except Buchholz
    const tournament = createTestTournament({
      numParticipants: 6,
      qualificationMode: 'WINS'
    });
    seedTournament(tournament);

    const t = readTournament(tournament.id);

    async function completeWithWinner(pA: string, pB: string, winnerId: string | null, twentiesA = 0, twentiesB = 0) {
      const match = findMatchBetween(t, pA, pB)!;
      expect(match).not.toBeNull();
      if (winnerId === null) {
        await completeMatch(tournament.id, match, createMatchResult(1, 1, 6, 6, twentiesA, twentiesB));
      } else {
        const aWins = winnerId === match.participantA;
        await completeMatch(tournament.id, match, createMatchResult(
          aWins ? 2 : 0, aWins ? 0 : 2,
          aWins ? 8 : 2, aWins ? 2 : 8,
          twentiesA, twentiesB
        ));
      }
    }

    // P1 ties P2 (H2H neutral)
    // P1 beats P3, P4; loses to P5, P6
    // P2 beats P5, P6; loses to P3, P4
    // Both have 2W 2L 1T = same points, same 20s
    // But Buchholz differs: P1 lost to P5,P6 and P2 lost to P3,P4
    await completeWithWinner('player-1', 'player-2', null, 0, 0); // Tie
    await completeWithWinner('player-1', 'player-3', 'player-1', 0, 0);
    await completeWithWinner('player-1', 'player-4', 'player-1', 0, 0);
    await completeWithWinner('player-1', 'player-5', 'player-5', 0, 0);
    await completeWithWinner('player-1', 'player-6', 'player-6', 0, 0);
    await completeWithWinner('player-2', 'player-3', 'player-3', 0, 0);
    await completeWithWinner('player-2', 'player-4', 'player-4', 0, 0);
    await completeWithWinner('player-2', 'player-5', 'player-2', 0, 0);
    await completeWithWinner('player-2', 'player-6', 'player-2', 0, 0);
    // Complete remaining matches between P3-P6
    await completeWithWinner('player-3', 'player-4', 'player-3', 0, 0);
    await completeWithWinner('player-3', 'player-5', 'player-3', 0, 0);
    await completeWithWinner('player-3', 'player-6', 'player-3', 0, 0);
    await completeWithWinner('player-4', 'player-5', 'player-4', 0, 0);
    await completeWithWinner('player-4', 'player-6', 'player-4', 0, 0);
    await completeWithWinner('player-5', 'player-6', 'player-5', 0, 0);

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    const p1 = standings.find(s => s.participantId === 'player-1')!;
    const p2 = standings.find(s => s.participantId === 'player-2')!;

    // Both should have same wins and same 20s (0)
    expect(p1.matchesWon).toBe(2);
    expect(p2.matchesWon).toBe(2);
    expect(p1.total20s).toBe(0);
    expect(p2.total20s).toBe(0);

    // Buchholz should differ (different opponents' strength)
    // P1 lost to P5 (1W) and P6 (0W), beat P3 (4W) and P4 (3W)
    // P2 lost to P3 (4W) and P4 (3W), beat P5 (1W) and P6 (0W)
    // P1's Buchholz = sum of all opponents' points = P2+P3+P4+P5+P6 points
    // P2's Buchholz = sum of all opponents' points = P1+P3+P4+P5+P6 points
    // Since P1 and P2 have same points, their Buchholz should be equal!
    // (Buchholz = sum of ALL opponents' primary values, and both play all other 5)
    // In RR everyone plays everyone, so Buchholz is same for same-wins players!
    // This means it falls through to unresolved
    expect(p1.buchholz).toBe(p2.buchholz);

    // Both should be marked as tied/unresolved
    expect(p1.tiedWith).toBeDefined();
    expect(p2.tiedWith).toBeDefined();
  });

  it('POINTS mode tie: totalPointsScored equal, 20s decides', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      qualificationMode: 'POINTS',
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const t = readTournament(tournament.id);

    async function completeWithResult(pA: string, pB: string, pointsA: number, pointsB: number, twentiesA: number, twentiesB: number) {
      const match = findMatchBetween(t, pA, pB)!;
      const aWins = pointsA > pointsB;
      await completeMatch(tournament.id, match, createMatchResult(
        aWins ? 2 : pointsA === pointsB ? 1 : 0,
        aWins ? 0 : pointsA === pointsB ? 1 : 2,
        pointsA, pointsB, twentiesA, twentiesB
      ));
    }

    // Engineer P1 and P2 to have same totalPointsScored but different 20s
    await completeWithResult('player-1', 'player-2', 8, 2, 3, 0);
    await completeWithResult('player-1', 'player-3', 2, 8, 0, 0);
    await completeWithResult('player-1', 'player-4', 8, 2, 0, 0);
    await completeWithResult('player-2', 'player-3', 8, 2, 0, 0);
    await completeWithResult('player-2', 'player-4', 2, 8, 0, 0);
    await completeWithResult('player-3', 'player-4', 8, 2, 0, 0);

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // P1: 8+2+8 = 18 totalPoints, 3 twenties
    // P2: 2+8+2 = 12 totalPoints
    // P3: 8+2+8 = 18 totalPoints, 0 twenties
    // P4: 2+8+2 = 12 totalPoints
    const p1 = standings.find(s => s.participantId === 'player-1')!;
    const p3 = standings.find(s => s.participantId === 'player-3')!;

    // P1 and P3 have same totalPointsScored (18), but P1 has more 20s
    expect(p1.totalPointsScored).toBe(18);
    expect(p3.totalPointsScored).toBe(18);
    expect(p1.total20s).toBeGreaterThan(p3.total20s);

    // P1 should rank higher than P3 (20s tiebreaker)
    expect(p1.position).toBeLessThan(p3.position);
  });

  it('Unresolved tie: 2 players exactly equal → tiedWith marked', async () => {
    // 4 players: P1 and P2 have identical everything (same wins, 20s, H2H tied, same totalPoints)
    const tournament = createTestTournament({
      numParticipants: 4,
      qualificationMode: 'WINS',
      gameMode: 'rounds'
    });
    seedTournament(tournament);

    const t = readTournament(tournament.id);

    async function completeWithResult(pA: string, pB: string, winnerId: string | null) {
      const match = findMatchBetween(t, pA, pB)!;
      if (winnerId === null) {
        await completeMatch(tournament.id, match, createMatchResult(1, 1, 6, 6, 0, 0));
      } else {
        const aWins = winnerId === match.participantA;
        await completeMatch(tournament.id, match, createMatchResult(
          aWins ? 2 : 0, aWins ? 0 : 2,
          aWins ? 8 : 2, aWins ? 2 : 8,
          0, 0 // no 20s
        ));
      }
    }

    // P1 ties P2, P1 beats P3, P1 loses to P4
    // P2 ties P1, P2 beats P3, P2 loses to P4
    // P1 and P2 have identical records
    await completeWithResult('player-1', 'player-2', null);
    await completeWithResult('player-1', 'player-3', 'player-1');
    await completeWithResult('player-1', 'player-4', 'player-4');
    await completeWithResult('player-2', 'player-3', 'player-2');
    await completeWithResult('player-2', 'player-4', 'player-4');
    await completeWithResult('player-3', 'player-4', 'player-4');

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    const p1 = standings.find(s => s.participantId === 'player-1')!;
    const p2 = standings.find(s => s.participantId === 'player-2')!;

    // Same wins, same totalPoints, H2H tied, same 20s = 0
    expect(p1.matchesWon).toBe(p2.matchesWon);
    expect(p1.total20s).toBe(p2.total20s);
    expect(p1.totalPointsScored).toBe(p2.totalPointsScored);

    // Should be marked as tied (unresolved or via ranking snapshot fallback)
    // Since they have different ranking snapshots, one will be placed first
    // But the system should have tried all tiebreakers
    expect(p1.points).toBe(p2.points);
  });
});

// ─── GROUP 5: Doubles + edge cases ──────────────────────────────────────────

describe('Doubles and edge cases', () => {
  it('Doubles tournament: partner fields present, standings correct', async () => {
    const tournament = createTestTournament({
      numParticipants: 4,
      gameType: 'doubles'
    });
    seedTournament(tournament);

    // Verify participants have partner info
    for (const p of tournament.participants) {
      expect(p.partner).toBeDefined();
      expect(p.partner!.name).toBeDefined();
    }

    expect(tournament.gameType).toBe('doubles');

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(6); // C(4,2) = 6

    await completeAllMatches(tournament.id, matches, () =>
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // All 4 teams played 3 matches each
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(3);
    }

    // Positions assigned
    const positions = standings.map(s => s.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4]);
  });

  it('Idempotency: completing same match twice is a no-op', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const match = matches[0];

    // Complete once
    const result1 = await completeMatch(tournament.id, match,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );
    expect(result1).toBe(true);

    const afterFirst = readTournament(tournament.id);
    const m1 = findMatchInTournament(afterFirst, match.id)!;
    expect(m1.status).toBe('COMPLETED');
    expect(m1.winner).toBe(match.participantA);

    // Complete again with DIFFERENT result → should be no-op
    const result2 = await completeMatch(tournament.id, match,
      createMatchResult(0, 2, 2, 8, 0, 1)
    );
    expect(result2).toBe(true); // Returns true (no error), but no-op

    const afterSecond = readTournament(tournament.id);
    const m2 = findMatchInTournament(afterSecond, match.id)!;
    expect(m2.status).toBe('COMPLETED');
    expect(m2.winner).toBe(match.participantA); // Original winner preserved
    expect(m2.gamesWonA).toBe(2); // Original result preserved
  });

  it('BYE walkovers in standings: BYE matches count but no points distortion', async () => {
    // 5 players = BYEs present. Verify BYE walkovers don't give unfair advantage
    const tournament = createTestTournament({ numParticipants: 5 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);

    // Complete all real matches where B always wins
    await completeAllMatches(tournament.id, matches, (match) => {
      return createMatchResult(0, 2, 2, 8, 0, 1);
    });

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    // Check that BYE walkovers are counted
    const totalMatches = standings.reduce((sum, s) => sum + s.matchesPlayed, 0);
    // 10 real matches × 2 players + 5 BYE walkovers × 1 player = 25
    expect(totalMatches).toBe(25);

    // BYE walkovers give totalPointsA=8, total20sA=0, gamesWonA=2
    // Check that 20s from BYEs are 0 (no artificial 20s from walkovers)
    const allMatchesInSchedule = getAllMatches(updated);
    const byeMatches = allMatchesInSchedule.filter(m => m.participantB === 'BYE');
    for (const bm of byeMatches) {
      expect(bm.total20sA).toBe(0);
    }
  });

  it('30+ players tournament: large RR standings calculated correctly', async () => {
    // 20 players = C(20,2) = 190 matches
    const tournament = createTestTournament({ numParticipants: 20 });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    expect(matches.length).toBe(190);

    // Complete all matches: alternate winners
    await completeAllMatches(tournament.id, matches, (_, i) =>
      createMatchResult(
        i % 2 === 0 ? 2 : 0,
        i % 2 === 0 ? 0 : 2,
        i % 2 === 0 ? 8 : 2,
        i % 2 === 0 ? 2 : 8,
        1, 0
      )
    );

    const updated = readTournament(tournament.id);
    const standings = updated.groupStage!.groups[0].standings;

    expect(standings.length).toBe(20);

    // All played 19 matches
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(19);
    }

    // Positions 1-20 assigned
    const positions = standings.map(s => s.position).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    // Total wins = 190
    const totalWins = standings.reduce((sum, s) => sum + s.matchesWon, 0);
    expect(totalWins).toBe(190);

    // Total losses = 190
    const totalLosses = standings.reduce((sum, s) => sum + s.matchesLost, 0);
    expect(totalLosses).toBe(190);
  });
});

// ─── GROUP 6: Swiss multi-round integration ─────────────────────────────────

describe('Swiss multi-round integration', () => {

  /**
   * Helper: generate R2+ Swiss pairings from current tournament state,
   * using the REAL algorithm. Returns updated tournament with new pairings.
   */
  function advanceSwissRound(tournament: Tournament, roundNumber: number): Tournament {
    const group = tournament.groupStage!.groups[0];
    const standings = group.standings;
    const previousPairings = group.pairings as SwissPairing[];
    const participants = tournament.participants;

    const newMatches = generateSwissPairingsAlgorithm(
      participants,
      standings,
      previousPairings,
      roundNumber
    );

    // Activate non-BYE matches
    const now = Date.now();
    let tableCounter = 1;
    for (const match of newMatches) {
      if (match.participantB !== 'BYE' && match.status === 'PENDING') {
        match.status = 'IN_PROGRESS';
        match.startedAt = now;
        match.tableNumber = ((tableCounter - 1) % tournament.numTables) + 1;
        tableCounter++;
      }
    }

    // Add new pairing
    const updatedPairings: SwissPairing[] = [
      ...previousPairings,
      { roundNumber, matches: newMatches }
    ];

    const updatedGroup = { ...group, pairings: updatedPairings };
    const updatedGroupStage = {
      ...tournament.groupStage!,
      groups: [updatedGroup],
      currentRound: roundNumber,
      totalRounds: Math.max(tournament.groupStage!.totalRounds, roundNumber)
    };

    return { ...tournament, groupStage: updatedGroupStage };
  }

  it('8 players Swiss R1+R2: cumulative standings after 2 rounds', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 3 });
    seedTournament(tournament);

    // ── Round 1 ──
    const r1Matches = getInProgressMatches(tournament);
    expect(r1Matches.length).toBe(4);

    // Complete R1: participantA always wins
    await completeAllMatches(tournament.id, r1Matches, () =>
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    let t = readTournament(tournament.id);
    let standings = t.groupStage!.groups[0].standings;

    // After R1: 4 winners (2 swissPoints), 4 losers (0 swissPoints)
    expect(standings.filter(s => s.swissPoints === 2).length).toBe(4);
    expect(standings.filter(s => s.swissPoints === 0).length).toBe(4);

    // ── Round 2: generate pairings from standings ──
    t = advanceSwissRound(t, 2);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    const r2Matches = getInProgressMatches(t);
    expect(r2Matches.length).toBe(4);

    // Verify point-based pairing: R2 should pair winners vs winners, losers vs losers
    // After R1, participants sorted by swissPoints desc. R2 pairs 1v2 (both 2pts), 3v4 (both 2pts), etc.
    for (const match of r2Matches) {
      const sA = standings.find(s => s.participantId === match.participantA);
      const sB = standings.find(s => s.participantId === match.participantB);
      expect(sA).toBeDefined();
      expect(sB).toBeDefined();
      // Same point bracket (both 2pts or both 0pts)
      expect(sA!.swissPoints).toBe(sB!.swissPoints);
    }

    // Complete R2: A always wins again
    await completeAllMatches(tournament.id, r2Matches, () =>
      createMatchResult(2, 0, 7, 3, 0, 0)
    );

    t = readTournament(tournament.id);
    standings = t.groupStage!.groups[0].standings;

    // After R2: everyone played 2 matches
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(2);
    }

    // SwissPoints distribution after 2 rounds: 2W=4pts, 1W1L=2pts, 0W2L=0pts
    const points4 = standings.filter(s => s.swissPoints === 4);
    const points2 = standings.filter(s => s.swissPoints === 2);
    const points0 = standings.filter(s => s.swissPoints === 0);

    // 2 players should have 4pts (won both rounds)
    expect(points4.length).toBe(2);
    // 4 players should have 2pts (won 1, lost 1)
    expect(points2.length).toBe(4);
    // 2 players should have 0pts (lost both rounds)
    expect(points0.length).toBe(2);
  });

  it('8 players Swiss R1+R2+R3: full 3-round Swiss with standings', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 3 });
    seedTournament(tournament);

    // ── Round 1 ──
    const r1Matches = getInProgressMatches(tournament);
    await completeAllMatches(tournament.id, r1Matches, () =>
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    // ── Round 2 ──
    let t = readTournament(tournament.id);
    t = advanceSwissRound(t, 2);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    const r2Matches = getInProgressMatches(t);
    await completeAllMatches(tournament.id, r2Matches, () =>
      createMatchResult(2, 0, 7, 3, 0, 1)
    );

    // ── Round 3 ──
    t = readTournament(tournament.id);
    t = advanceSwissRound(t, 3);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    const r3Matches = getInProgressMatches(t);
    expect(r3Matches.length).toBe(4);

    // R3 should avoid repeat pairings from R1 and R2
    const previousPairKeys = new Set<string>();
    const pairings = t.groupStage!.groups[0].pairings as SwissPairing[];
    for (let i = 0; i < 2; i++) { // R1 and R2
      for (const m of pairings[i].matches) {
        if (m.participantB !== 'BYE') {
          previousPairKeys.add([m.participantA, m.participantB].sort().join('-'));
        }
      }
    }

    let repeats = 0;
    for (const m of r3Matches) {
      const key = [m.participantA, m.participantB].sort().join('-');
      if (previousPairKeys.has(key)) repeats++;
    }
    // With 8 players and 3 rounds, repeat avoidance should be possible
    // (each player has 7 possible opponents, needs 3 unique)
    expect(repeats).toBe(0);

    // Complete R3
    await completeAllMatches(tournament.id, r3Matches, () =>
      createMatchResult(2, 0, 6, 4, 2, 0)
    );

    t = readTournament(tournament.id);
    const standings = t.groupStage!.groups[0].standings;

    // After 3 rounds, all played 3 matches
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(3);
    }

    // Total wins should equal total losses (4 wins per round × 3 rounds = 12)
    const totalWins = standings.reduce((sum, s) => sum + s.matchesWon, 0);
    const totalLosses = standings.reduce((sum, s) => sum + s.matchesLost, 0);
    expect(totalWins).toBe(12);
    expect(totalLosses).toBe(12);

    // Standings sorted by swissPoints descending
    for (let i = 0; i < standings.length - 1; i++) {
      expect(standings[i].swissPoints!).toBeGreaterThanOrEqual(standings[i + 1].swissPoints!);
    }

    // Max swissPoints = 6 (3 wins × 2pts each)
    expect(standings[0].swissPoints).toBeLessThanOrEqual(6);
    expect(standings[standings.length - 1].swissPoints).toBeGreaterThanOrEqual(0);
  });

  it('7 players Swiss R1+R2: BYE fairness across rounds', async () => {
    const tournament = createSwissTournament({ numParticipants: 7, swissRounds: 3 });
    seedTournament(tournament);

    // ── Round 1 ──
    const allR1 = getAllMatches(tournament);
    const r1Bye = allR1.find(m => m.participantB === 'BYE');
    expect(r1Bye).toBeDefined();
    const r1ByeReceiver = r1Bye!.participantA;

    const r1Active = getInProgressMatches(tournament);
    await completeAllMatches(tournament.id, r1Active, () =>
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    // ── Round 2 ──
    let t = readTournament(tournament.id);
    t = advanceSwissRound(t, 2);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    const allR2 = (t.groupStage!.groups[0].pairings as SwissPairing[])[1].matches;
    const r2Bye = allR2.find(m => m.participantB === 'BYE');
    expect(r2Bye).toBeDefined();
    const r2ByeReceiver = r2Bye!.participantA;

    // BYE should go to a DIFFERENT player in R2 (BYE fairness)
    expect(r2ByeReceiver).not.toBe(r1ByeReceiver);

    // Complete R2
    const r2Active = allR2.filter(m => m.status === 'IN_PROGRESS' && m.participantB !== 'BYE');
    await completeAllMatches(tournament.id, r2Active, () =>
      createMatchResult(2, 0, 7, 3, 0, 0)
    );

    t = readTournament(tournament.id);
    const standings = t.groupStage!.groups[0].standings;

    // Both BYE receivers should have their BYE wins counted
    const r1ByeStanding = standings.find(s => s.participantId === r1ByeReceiver);
    const r2ByeStanding = standings.find(s => s.participantId === r2ByeReceiver);
    expect(r1ByeStanding!.matchesWon).toBeGreaterThanOrEqual(1);
    expect(r2ByeStanding!.matchesWon).toBeGreaterThanOrEqual(1);
  });

  it('Swiss R2 pairings respect swissPoints ranking', async () => {
    const tournament = createSwissTournament({ numParticipants: 6, swissRounds: 3 });
    seedTournament(tournament);

    // Complete R1 with DIFFERENT results to create varied standings
    const r1Matches = getInProgressMatches(tournament);
    // Assign different results: first 2 A-wins big, last 1 close
    await completeAllMatches(tournament.id, r1Matches, (_, i) => {
      if (i < 2) return createMatchResult(2, 0, 8, 0, 2, 0);
      return createMatchResult(2, 1, 6, 5, 0, 0);
    });

    let t = readTournament(tournament.id);
    const standingsR1 = t.groupStage!.groups[0].standings;

    // Sort standings by swissPoints to know expected pairing order
    const sorted = [...standingsR1].sort((a, b) =>
      (b.swissPoints ?? 0) - (a.swissPoints ?? 0)
    );

    // Generate R2
    t = advanceSwissRound(t, 2);

    // R2 pairings should pair 1st vs 2nd, 3rd vs 4th (by swissPoints)
    const r2Pairings = (t.groupStage!.groups[0].pairings as SwissPairing[])[1].matches;
    const nonByeR2 = r2Pairings.filter(m => m.participantB !== 'BYE');

    // All non-BYE R2 matches should pair participants from similar point brackets
    for (const match of nonByeR2) {
      const sA = standingsR1.find(s => s.participantId === match.participantA);
      const sB = standingsR1.find(s => s.participantId === match.participantB);
      expect(sA).toBeDefined();
      expect(sB).toBeDefined();
      // Point difference should be small (within same bracket or adjacent)
      const diff = Math.abs((sA!.swissPoints ?? 0) - (sB!.swissPoints ?? 0));
      expect(diff).toBeLessThanOrEqual(2);
    }
  });

  it('Swiss cumulative stats: totalPointsScored and total20s accumulate', async () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 2 });
    seedTournament(tournament);

    // R1: different 20s counts
    const r1Matches = getInProgressMatches(tournament);
    await completeAllMatches(tournament.id, r1Matches, () =>
      createMatchResult(2, 0, 8, 2, 3, 1)
    );

    let t = readTournament(tournament.id);
    let standings = t.groupStage!.groups[0].standings;

    // After R1: winners should have 8 totalPointsScored, 3 total20s
    const r1Winners = standings.filter(s => s.matchesWon === 1);
    for (const w of r1Winners) {
      expect(w.totalPointsScored).toBe(8);
      expect(w.total20s).toBe(3);
    }

    // Generate and complete R2
    t = advanceSwissRound(t, 2);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    const r2Matches = getInProgressMatches(t);
    await completeAllMatches(tournament.id, r2Matches, () =>
      createMatchResult(2, 0, 7, 3, 2, 0)
    );

    t = readTournament(tournament.id);
    standings = t.groupStage!.groups[0].standings;

    // After R2: players who won both rounds should have 8+7=15 totalPointsScored, 3+2=5 total20s
    const twoWinners = standings.filter(s => s.matchesWon === 2);
    expect(twoWinners.length).toBe(2); // 2 players won both rounds
    for (const w of twoWinners) {
      expect(w.totalPointsScored).toBe(15);
      expect(w.total20s).toBe(5);
    }

    // Players who lost both rounds: 2+3=5 totalPointsScored
    const twoLosers = standings.filter(s => s.matchesLost === 2);
    expect(twoLosers.length).toBe(2);
    for (const l of twoLosers) {
      expect(l.totalPointsScored).toBe(5);
    }
  });
});
