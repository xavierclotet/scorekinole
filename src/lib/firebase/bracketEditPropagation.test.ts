/**
 * Bracket re-edit propagation tests.
 *
 * Verifies that admins can edit an already-COMPLETED bracket match and have
 * the new winner/loser propagated into subsequent slots (semis → final, etc.)
 * via `completeBracketMatchAndAdvance(..., allowOverwrite=true)`.
 *
 * Coverage matrix:
 * - 4 players (semi → final + 3rd/4th place)
 * - 8 players (cuartos → semis → final, with consolation)
 * - 8 players (cuartos → semis → final, NO consolation)
 * - Final edit (tournament winner change)
 * - 3rd place match edit
 * - Idempotency without `allowOverwrite` (no-op)
 * - Same-winner edit (no spurious slot moves)
 *
 * Regression coverage for v2.5.20+ fix where editing an already-completed
 * knockout match left subsequent rounds populated with the OLD winner.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import type { Tournament, BracketMatch } from '$lib/types/tournament';

let mockStore: MockFirestore;

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) =>
    new MockDocumentReference(`${collection}/${id}`, id),
  runTransaction: (
    _db: unknown,
    callback: (txn: unknown) => Promise<unknown>,
    options?: { maxAttempts?: number }
  ) => mockStore.runTransaction(callback as any, options?.maxAttempts ? options.maxAttempts - 1 : undefined),
  serverTimestamp: () => Date.now(),
  Timestamp: class MockTimestamp {
    _ms: number;
    constructor(seconds: number, nanoseconds: number) { this._ms = seconds * 1000 + nanoseconds / 1e6; }
    toMillis() { return this._ms; }
    static fromMillis(ms: number) { const t = new MockTimestamp(0, 0); t._ms = ms; return t; }
  }
}));

vi.mock('./config', () => ({ db: {}, isFirebaseEnabled: () => true }));

vi.mock('$lib/firebase/tournaments', () => ({
  getTournament: async (id: string) => {
    const doc = mockStore.getDocument(`tournaments/${id}`);
    return doc ? (doc.data as unknown as Tournament) : null;
  },
  updateTournament: async (id: string, updates: Record<string, unknown>) => {
    const doc = mockStore.getDocument(`tournaments/${id}`);
    if (!doc) return false;
    const current = doc.data as Record<string, unknown>;
    mockStore.setDocument(`tournaments/${id}`, { ...current, ...updates });
    return true;
  },
  updateTournamentPublic: async (id: string, updates: Record<string, unknown>) => {
    const doc = mockStore.getDocument(`tournaments/${id}`);
    if (!doc) return false;
    const current = doc.data as Record<string, unknown>;
    mockStore.setDocument(`tournaments/${id}`, { ...current, ...updates });
    return true;
  },
  parseTournamentData: (data: unknown) => data
}));

vi.mock('$lib/firebase/tournamentRanking', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    syncParticipantRankings: async () => true,
    calculateFinalPositions: async () => null
  };
});

const { transitionTournament } = await import('$lib/utils/tournamentStateMachine');
const { completeBracketMatchAndAdvance } = await import('./tournamentBracket');

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function seedTournament(t: Tournament): void {
  mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);
}

function readTournament(id: string): Tournament {
  const doc = mockStore.getDocument(`tournaments/${id}`);
  if (!doc) throw new Error(`Tournament ${id} not found`);
  return doc.data as unknown as Tournament;
}

function createOnePhaseBracketTournament(numParticipants: number, opts?: { consolationEnabled?: boolean }): Tournament {
  const participants = Array.from({ length: numParticipants }, (_, i) => ({
    id: `p${i + 1}`,
    type: 'GUEST' as const,
    name: `P${i + 1}`,
    status: 'ACTIVE' as const,
    rankingSnapshot: 1000 - i * 10
  }));
  const now = Date.now();
  return {
    id: 'bracket-edit-test',
    key: 'EDIT01',
    name: 'Bracket Edit Test',
    country: 'ES',
    city: 'Barcelona',
    status: 'DRAFT',
    phaseType: 'ONE_PHASE',
    gameType: 'singles',
    show20s: true,
    showHammer: false,
    numTables: 2,
    rankingConfig: { enabled: false },
    participants,
    finalStageConfig: opts?.consolationEnabled ? { consolationEnabled: true } : undefined,
    createdAt: now,
    createdBy: { userId: 'admin-1', userName: 'Admin' },
    updatedAt: now
  } as Tournament;
}

function findFirstPlayableMatchInRound(t: Tournament, roundIndex: number): BracketMatch {
  const round = t.finalStage!.goldBracket!.rounds[roundIndex];
  const match = round.matches.find(
    m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
  );
  if (!match) throw new Error(`No playable match in round ${roundIndex}`);
  return match;
}

function findFinalMatch(t: Tournament): BracketMatch {
  const rounds = t.finalStage!.goldBracket!.rounds;
  return rounds[rounds.length - 1].matches[0];
}

function findThirdPlace(t: Tournament): BracketMatch | undefined {
  return t.finalStage!.goldBracket!.thirdPlaceMatch;
}

async function completeWith(tournamentId: string, matchId: string, winner: string, allowOverwrite = false): Promise<boolean> {
  return await completeBracketMatchAndAdvance(
    tournamentId,
    matchId,
    {
      status: 'COMPLETED',
      winner,
      gamesWonA: winner.endsWith('A') ? 1 : 0, // arbitrary
      gamesWonB: winner.endsWith('A') ? 0 : 1,
      totalPointsA: 8, totalPointsB: 4,
      total20sA: 1, total20sB: 0
    } as Partial<BracketMatch>,
    allowOverwrite
  );
}

function findMatchContaining(t: Tournament, participantId: string, roundIndex: number): BracketMatch | undefined {
  const round = t.finalStage!.goldBracket!.rounds[roundIndex];
  return round.matches.find(m => m.participantA === participantId || m.participantB === participantId);
}

function findInConsolation(t: Tournament, participantId: string): boolean {
  const cb = t.finalStage!.goldBracket!.consolationBrackets;
  if (!cb) return false;
  for (const c of cb) {
    for (const r of c.rounds) {
      for (const m of r.matches) {
        if (m.participantA === participantId || m.participantB === participantId) return true;
      }
    }
  }
  return false;
}

// ─── 4-player bracket: semi edit ─────────────────────────────────────────

describe('4-player bracket: edit semifinal', () => {
  it('semifinal winner change → final slot updates AND 3rd-place slot updates', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableMatchInRound(t, 0);
    const playerA = semi.participantA!;
    const playerB = semi.participantB!;

    // Step 1: playerA wins semi
    await completeBracketMatchAndAdvance(tournament.id, semi.id, {
      status: 'COMPLETED', winner: playerA,
      gamesWonA: 1, gamesWonB: 0,
      totalPointsA: 8, totalPointsB: 4,
      total20sA: 1, total20sB: 0
    });

    t = readTournament(tournament.id);
    let final = findFinalMatch(t);
    let third = findThirdPlace(t);

    // Verify initial propagation
    expect([final.participantA, final.participantB]).toContain(playerA);
    if (third) expect([third.participantA, third.participantB]).toContain(playerB);

    // Step 2: admin re-edits, playerB wins
    const ok = await completeBracketMatchAndAdvance(
      tournament.id, semi.id,
      {
        status: 'COMPLETED', winner: playerB,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    final = findFinalMatch(t);
    third = findThirdPlace(t);

    // Final now has playerB
    expect([final.participantA, final.participantB]).toContain(playerB);
    expect([final.participantA, final.participantB]).not.toContain(playerA);

    // 3rd-place now has playerA
    if (third) {
      expect([third.participantA, third.participantB]).toContain(playerA);
      expect([third.participantA, third.participantB]).not.toContain(playerB);
    }
  });
});

// ─── 8-player bracket WITH consolation ───────────────────────────────────

describe('8-player bracket WITH consolation: edit at each round', () => {
  it('quarterfinal edit AFTER all QFs complete → consolation already exists, slot updates with new loser', async () => {
    const tournament = createOnePhaseBracketTournament(8, { consolationEnabled: true });
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);
    if (t.finalStage && !(t.finalStage as any).consolationEnabled) {
      (t.finalStage as any).consolationEnabled = true;
      mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);
      t = readTournament(tournament.id);
    }

    // Complete all QFs (A wins each one) so consolation gets generated and populated
    const qfRound = t.finalStage!.goldBracket!.rounds[0];
    const qfMatches = [...qfRound.matches].filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );

    // Snapshot the QF[0]'s players for the edit later
    const targetQf = qfMatches[0];
    const playerA = targetQf.participantA!;
    const playerB = targetQf.participantB!;
    const targetQfId = targetQf.id;

    for (const qf of qfMatches) {
      await completeWith(tournament.id, qf.id, qf.participantA!);
    }

    // Now consolation should exist with playerB (loser of QF0) somewhere
    t = readTournament(tournament.id);
    const playerBWasInConso = findInConsolation(t, playerB);
    expect(playerBWasInConso).toBe(true);
    expect(findInConsolation(t, playerA)).toBe(false);

    // Admin re-edits QF0: now playerB wins
    const ok = await completeBracketMatchAndAdvance(
      tournament.id, targetQfId,
      {
        status: 'COMPLETED', winner: playerB,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);

    // playerA (new loser) should now be in consolation, playerB should NOT be there
    expect(findInConsolation(t, playerA)).toBe(true);
    expect(findInConsolation(t, playerB)).toBe(false);

    // playerB (new winner) should be in semifinal
    expect(findMatchContaining(t, playerB, 1)).toBeDefined();
    expect(findMatchContaining(t, playerA, 1)).toBeUndefined();
  });

  it('quarterfinal edit → semifinal slot AND consolation slot update', async () => {
    const tournament = createOnePhaseBracketTournament(8, { consolationEnabled: true });
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);
    if (t.finalStage && !(t.finalStage as any).consolationEnabled) {
      (t.finalStage as any).consolationEnabled = true;
      mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);
      t = readTournament(tournament.id);
    }

    const qf = findFirstPlayableMatchInRound(t, 0);
    const playerA = qf.participantA!;
    const playerB = qf.participantB!;

    // playerA wins QF
    await completeWith(tournament.id, qf.id, playerA);

    t = readTournament(tournament.id);
    expect(findMatchContaining(t, playerA, 1)).toBeDefined(); // playerA in semi
    const playerBInConso = findInConsolation(t, playerB);

    // admin re-edits: playerB wins
    const ok = await completeBracketMatchAndAdvance(
      tournament.id, qf.id,
      {
        status: 'COMPLETED', winner: playerB,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    expect(findMatchContaining(t, playerB, 1)).toBeDefined(); // playerB in semi now
    expect(findMatchContaining(t, playerA, 1)).toBeUndefined(); // playerA no longer in semi

    // If consolation existed before with playerB, now it should have playerA instead
    if (playerBInConso) {
      expect(findInConsolation(t, playerA)).toBe(true);
      expect(findInConsolation(t, playerB)).toBe(false);
    }
  });

  it('semifinal edit → final slot AND 3rd-place slot update', async () => {
    const tournament = createOnePhaseBracketTournament(8, { consolationEnabled: true });
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    // Complete all QFs first
    const qfRound = t.finalStage!.goldBracket!.rounds[0];
    for (const qfMatch of qfRound.matches) {
      if (qfMatch.participantA && qfMatch.participantB
          && qfMatch.participantA !== 'BYE' && qfMatch.participantB !== 'BYE') {
        await completeWith(tournament.id, qfMatch.id, qfMatch.participantA);
      }
    }

    t = readTournament(tournament.id);
    const semi = findFirstPlayableMatchInRound(t, 1);
    const playerA = semi.participantA!;
    const playerB = semi.participantB!;

    // playerA wins semi
    await completeWith(tournament.id, semi.id, playerA);
    t = readTournament(tournament.id);

    let final = findFinalMatch(t);
    let third = findThirdPlace(t);
    expect([final.participantA, final.participantB]).toContain(playerA);
    if (third) expect([third.participantA, third.participantB]).toContain(playerB);

    // admin re-edits: playerB wins semi
    const ok = await completeBracketMatchAndAdvance(
      tournament.id, semi.id,
      {
        status: 'COMPLETED', winner: playerB,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    final = findFinalMatch(t);
    third = findThirdPlace(t);

    expect([final.participantA, final.participantB]).toContain(playerB);
    expect([final.participantA, final.participantB]).not.toContain(playerA);
    if (third) {
      expect([third.participantA, third.participantB]).toContain(playerA);
      expect([third.participantA, third.participantB]).not.toContain(playerB);
    }
  });

  it('final edit → tournament winner changes (no further propagation needed)', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    // Complete both semis
    const semis = t.finalStage!.goldBracket!.rounds[0].matches;
    for (const s of semis) {
      if (s.participantA && s.participantB
          && s.participantA !== 'BYE' && s.participantB !== 'BYE') {
        await completeWith(tournament.id, s.id, s.participantA);
      }
    }

    t = readTournament(tournament.id);
    const final = findFinalMatch(t);
    const playerA = final.participantA!;
    const playerB = final.participantB!;

    // playerA wins final
    await completeWith(tournament.id, final.id, playerA);

    t = readTournament(tournament.id);
    let f = findFinalMatch(t);
    expect(f.winner).toBe(playerA);

    // admin re-edits: playerB wins
    const ok = await completeBracketMatchAndAdvance(
      tournament.id, final.id,
      {
        status: 'COMPLETED', winner: playerB,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    f = findFinalMatch(t);
    expect(f.winner).toBe(playerB);
  });

  it('3rd-place match edit → winner field updates (no advancement, terminal slot)', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    // Complete semis
    const semis = t.finalStage!.goldBracket!.rounds[0].matches;
    for (const s of semis) {
      if (s.participantA && s.participantB
          && s.participantA !== 'BYE' && s.participantB !== 'BYE') {
        await completeWith(tournament.id, s.id, s.participantA);
      }
    }

    t = readTournament(tournament.id);
    const third = findThirdPlace(t);
    if (!third) {
      // 4-player bracket might not have 3rd-place; skip
      return;
    }
    const playerA = third.participantA!;
    const playerB = third.participantB!;

    await completeWith(tournament.id, third.id, playerA);

    t = readTournament(tournament.id);
    let th = findThirdPlace(t)!;
    expect(th.winner).toBe(playerA);

    // admin re-edits 3rd-place: playerB wins
    const ok = await completeBracketMatchAndAdvance(
      tournament.id, third.id,
      {
        status: 'COMPLETED', winner: playerB,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    th = findThirdPlace(t)!;
    expect(th.winner).toBe(playerB);
  });
});

// ─── 8-player bracket WITHOUT consolation ────────────────────────────────

describe('8-player bracket WITHOUT consolation: loser just disappears', () => {
  it('quarterfinal edit propagates winner to semi (loser has no slot to update)', async () => {
    const tournament = createOnePhaseBracketTournament(8); // no consolation
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const qf = findFirstPlayableMatchInRound(t, 0);
    const playerA = qf.participantA!;
    const playerB = qf.participantB!;

    await completeWith(tournament.id, qf.id, playerA);
    t = readTournament(tournament.id);
    expect(findMatchContaining(t, playerA, 1)).toBeDefined();

    // admin re-edits
    const ok = await completeBracketMatchAndAdvance(
      tournament.id, qf.id,
      {
        status: 'COMPLETED', winner: playerB,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    expect(findMatchContaining(t, playerB, 1)).toBeDefined();
    expect(findMatchContaining(t, playerA, 1)).toBeUndefined();
    // No consolation, so playerA has no slot — that's fine
  });
});

// ─── Idempotency / safety ────────────────────────────────────────────────

describe('safety guards', () => {
  it('without allowOverwrite, re-edit is a silent no-op (idempotency guard)', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableMatchInRound(t, 0);
    const playerA = semi.participantA!;
    const playerB = semi.participantB!;

    await completeWith(tournament.id, semi.id, playerA);

    t = readTournament(tournament.id);
    let final = findFinalMatch(t);
    expect([final.participantA, final.participantB]).toContain(playerA);

    // re-edit WITHOUT allowOverwrite — should be no-op
    const ok = await completeBracketMatchAndAdvance(tournament.id, semi.id, {
      status: 'COMPLETED', winner: playerB,
      gamesWonA: 0, gamesWonB: 1,
      totalPointsA: 4, totalPointsB: 8,
      total20sA: 0, total20sB: 1
    });
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    final = findFinalMatch(t);
    expect([final.participantA, final.participantB]).toContain(playerA); // unchanged
    expect([final.participantA, final.participantB]).not.toContain(playerB);
  });

  it('admin edit with same winner → final slot remains unchanged (no spurious moves)', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableMatchInRound(t, 0);
    const playerA = semi.participantA!;

    await completeWith(tournament.id, semi.id, playerA);

    // admin re-edits with allowOverwrite=true but SAME winner
    const ok = await completeBracketMatchAndAdvance(
      tournament.id, semi.id,
      {
        status: 'COMPLETED', winner: playerA,
        gamesWonA: 1, gamesWonB: 0,
        totalPointsA: 8, totalPointsB: 4,
        total20sA: 2, total20sB: 0  // only 20s changed
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    const final = findFinalMatch(t);
    expect([final.participantA, final.participantB]).toContain(playerA); // still there
  });
});
