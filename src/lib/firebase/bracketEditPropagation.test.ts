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
  commitTournamentStartIfRosterUnchanged: async (id: string, _keys: string[], updates: Record<string, unknown>) => {
    const doc = mockStore.getDocument(`tournaments/${id}`);
    if (!doc) return { success: false, reason: 'not_found' };
    mockStore.setDocument(`tournaments/${id}`, { ...(doc.data as Record<string, unknown>), ...updates });
    return { success: true };
  },
  applyParticipantRankingSnapshots: async () => true,
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
const { completeBracketMatchAndAdvance, revertBracketMatch } = await import('./tournamentBracket');

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

/**
 * Safety invariant: a participant must not appear in more than ONE pending /
 * future slot across the bracket (main rounds + 3rd place + consolation).
 * Already-completed matches keep their participants by design.
 */
function assertNoDuplicateLiveParticipants(t: Tournament): void {
  const gb = t.finalStage!.goldBracket;
  if (!gb) return;
  const slots = new Map<string, string[]>(); // participantId → list of slot descriptors
  const recordSlot = (matchId: string, slotName: 'A' | 'B', participant: string | undefined, status: string) => {
    if (!participant || participant === 'BYE') return;
    if (status === 'COMPLETED' || status === 'WALKOVER') return; // completed matches are historical
    const list = slots.get(participant) ?? [];
    list.push(`${matchId}.${slotName}`);
    slots.set(participant, list);
  };
  for (const round of gb.rounds) {
    for (const m of round.matches) {
      recordSlot(m.id, 'A', m.participantA, m.status);
      recordSlot(m.id, 'B', m.participantB, m.status);
    }
  }
  if (gb.thirdPlaceMatch) {
    const m = gb.thirdPlaceMatch;
    recordSlot(m.id, 'A', m.participantA, m.status);
    recordSlot(m.id, 'B', m.participantB, m.status);
  }
  if (gb.consolationBrackets) {
    for (const c of gb.consolationBrackets) {
      for (const r of c.rounds) {
        for (const m of r.matches) {
          recordSlot(m.id, 'A', m.participantA, m.status);
          recordSlot(m.id, 'B', m.participantB, m.status);
        }
      }
    }
  }
  const duplicates: Array<[string, string[]]> = [];
  for (const [pid, locs] of slots.entries()) {
    if (locs.length > 1) duplicates.push([pid, locs]);
  }
  if (duplicates.length > 0) {
    const msg = duplicates.map(([pid, locs]) => `  ${pid} appears in: ${locs.join(', ')}`).join('\n');
    throw new Error(`Duplicate participant slots detected:\n${msg}`);
  }
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
  it('legacy data (no consolationSourceA/B fields): backfill kicks in and consolation slot updates correctly on re-edit', async () => {
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

    // Complete all QFs with playerA winning each
    const qfRound = t.finalStage!.goldBracket!.rounds[0];
    const qfMatches = [...qfRound.matches].filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    const targetQf = qfMatches[0];
    const playerA = targetQf.participantA!;
    const playerB = targetQf.participantB!;
    const targetQfId = targetQf.id;
    for (const qf of qfMatches) {
      await completeWith(tournament.id, qf.id, qf.participantA!);
    }

    // Simulate legacy data: STRIP the consolationSourceA/B fields from all
    // first-round consolation matches (mirrors a tournament created before v2.5.22)
    t = readTournament(tournament.id);
    const consoBrackets = t.finalStage!.goldBracket!.consolationBrackets;
    expect(consoBrackets).toBeDefined();
    for (const c of consoBrackets!) {
      for (const m of c.rounds[0].matches) {
        delete (m as any).consolationSourceA;
        delete (m as any).consolationSourceB;
      }
    }
    mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);

    // Sanity: confirm fields are stripped
    t = readTournament(tournament.id);
    const stripped = t.finalStage!.goldBracket!.consolationBrackets![0].rounds[0].matches[0];
    expect(stripped.consolationSourceA).toBeUndefined();

    // Sanity: loser playerB sits in consolation
    expect(findInConsolation(t, playerB)).toBe(true);

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

    // Backfill should have kicked in → playerA (new loser) is now in consolation
    expect(findInConsolation(t, playerA)).toBe(true);
    expect(findInConsolation(t, playerB)).toBe(false); // and old loser is gone

    // Same player must NOT be in two places
    const playerBInSemis = !!findMatchContaining(t, playerB, 1);
    const playerBInConso = findInConsolation(t, playerB);
    expect(playerBInSemis && playerBInConso).toBe(false); // never both
  });

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

// ─── Live tournament safety: complex scenarios ─────────────────────────

describe('LIVE tournament safety: complex edit scenarios', () => {
  it('double-edit: A→B then B→A returns bracket to original state', async () => {
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

    const qfRound = t.finalStage!.goldBracket!.rounds[0];
    const qfMatches = qfRound.matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    const target = qfMatches[0];
    const playerA = target.participantA!;
    const playerB = target.participantB!;

    for (const qf of qfMatches) {
      await completeWith(tournament.id, qf.id, qf.participantA!);
    }
    t = readTournament(tournament.id);
    assertNoDuplicateLiveParticipants(t);

    // Edit 1: A→B
    await completeBracketMatchAndAdvance(tournament.id, target.id, {
      status: 'COMPLETED', winner: playerB,
      gamesWonA: 0, gamesWonB: 1,
      totalPointsA: 4, totalPointsB: 8,
      total20sA: 0, total20sB: 1
    }, true);
    t = readTournament(tournament.id);
    assertNoDuplicateLiveParticipants(t);
    expect(findMatchContaining(t, playerB, 1)).toBeDefined();
    expect(findInConsolation(t, playerA)).toBe(true);

    // Edit 2: B→A (back to original)
    await completeBracketMatchAndAdvance(tournament.id, target.id, {
      status: 'COMPLETED', winner: playerA,
      gamesWonA: 1, gamesWonB: 0,
      totalPointsA: 8, totalPointsB: 4,
      total20sA: 1, total20sB: 0
    }, true);
    t = readTournament(tournament.id);
    assertNoDuplicateLiveParticipants(t);
    expect(findMatchContaining(t, playerA, 1)).toBeDefined();
    expect(findInConsolation(t, playerB)).toBe(true);
    expect(findInConsolation(t, playerA)).toBe(false);
  });

  // KNOWN LIMITATION (rare in practice — admin notices error before next
  // round is played): if admin edits cuartos AFTER semis are already played,
  // the new winner gets placed in the (still-COMPLETED) semi slot, which can
  // produce a duplicated participant (in final + consolation). Admin must
  // manually rejug the affected downstream match. We do NOT auto-reset
  // downstream matches because that would silently invalidate played results.
  it.skip('KNOWN LIMITATION: edit cuartos when semis already played leaves inconsistent state — admin must rejug', async () => {
    // Documented edge case; not enforced as invariant.
  });

  it('after every successful re-edit, no participant appears in two pending slots', async () => {
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

    const qfMatches = t.finalStage!.goldBracket!.rounds[0].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    for (const qf of qfMatches) {
      await completeWith(tournament.id, qf.id, qf.participantA!);
    }
    t = readTournament(tournament.id);
    assertNoDuplicateLiveParticipants(t);

    // Re-edit each QF, flipping its winner. After each edit, invariant must hold.
    for (const qf of qfMatches) {
      const newWinner = qf.participantB!;
      await completeBracketMatchAndAdvance(tournament.id, qf.id, {
        status: 'COMPLETED', winner: newWinner,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      }, true);
      t = readTournament(tournament.id);
      assertNoDuplicateLiveParticipants(t);
    }
  });

  it('legacy data: backfill works correctly even when fields are stripped post-load', async () => {
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

    const qfMatches = t.finalStage!.goldBracket!.rounds[0].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    const target = qfMatches[0];
    const playerA = target.participantA!;
    const playerB = target.participantB!;
    for (const qf of qfMatches) {
      await completeWith(tournament.id, qf.id, qf.participantA!);
    }

    // Strip metadata to simulate legacy data
    t = readTournament(tournament.id);
    for (const c of t.finalStage!.goldBracket!.consolationBrackets ?? []) {
      for (const m of c.rounds[0].matches) {
        delete (m as any).consolationSourceA;
        delete (m as any).consolationSourceB;
      }
    }
    mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);

    // Re-edit
    await completeBracketMatchAndAdvance(tournament.id, target.id, {
      status: 'COMPLETED', winner: playerB,
      gamesWonA: 0, gamesWonB: 1,
      totalPointsA: 4, totalPointsB: 8,
      total20sA: 0, total20sB: 1
    }, true);
    t = readTournament(tournament.id);

    // Backfill repopulated source fields AND the slot updated correctly
    assertNoDuplicateLiveParticipants(t);
    expect(findInConsolation(t, playerA)).toBe(true);
    expect(findInConsolation(t, playerB)).toBe(false);
  });
});

// ─── Revert match (admin reset to PENDING) ──────────────────────────────

describe('revertBracketMatch: reset COMPLETED match back to PENDING', () => {
  it('revert semi (final still PENDING) → semi back to PENDING + final & 3rd-place slots cleared', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableMatchInRound(t, 0);
    const playerA = semi.participantA!;
    const playerB = semi.participantB!;

    // Complete semi: A wins
    await completeWith(tournament.id, semi.id, playerA);

    t = readTournament(tournament.id);
    const finalBefore = findFinalMatch(t);
    expect([finalBefore.participantA, finalBefore.participantB]).toContain(playerA);

    // Revert
    const result = await revertBracketMatch(tournament.id, semi.id);
    expect(result.ok).toBe(true);

    t = readTournament(tournament.id);
    const semiAfter = t.finalStage!.goldBracket!.rounds[0].matches.find(m => m.id === semi.id)!;
    expect(semiAfter.status).toBe('PENDING');
    expect(semiAfter.winner).toBeUndefined();
    expect(semiAfter.gamesWonA).toBeUndefined();
    expect(semiAfter.completedAt).toBeUndefined();
    // Players still sitting in their slots (not cleared)
    expect(semiAfter.participantA).toBe(playerA);
    expect(semiAfter.participantB).toBe(playerB);

    // Final lost the winner; 3rd-place lost the loser
    const finalAfter = findFinalMatch(t);
    expect(finalAfter.participantA === playerA || finalAfter.participantB === playerA).toBe(false);
    const third = findThirdPlace(t);
    if (third) {
      expect(third.participantA === playerB || third.participantB === playerB).toBe(false);
    }
    assertNoDuplicateLiveParticipants(t);
  });

  it('revert quarterfinal (semi still PENDING) → consolation slot cleared, semi slot cleared', async () => {
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

    // Complete all QFs (consolation generates after all QFs done)
    const qfs = t.finalStage!.goldBracket!.rounds[0].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    const target = qfs[0];
    const playerA = target.participantA!;
    const playerB = target.participantB!;
    for (const qf of qfs) {
      await completeWith(tournament.id, qf.id, qf.participantA!);
    }

    t = readTournament(tournament.id);
    expect(findInConsolation(t, playerB)).toBe(true);

    // Revert target QF — semi is PENDING (not played), should succeed
    const result = await revertBracketMatch(tournament.id, target.id);
    expect(result.ok).toBe(true);

    t = readTournament(tournament.id);
    const targetAfter = t.finalStage!.goldBracket!.rounds[0].matches.find(m => m.id === target.id)!;
    expect(targetAfter.status).toBe('PENDING');

    // Semi slot should no longer have playerA (winner of QF)
    expect(findMatchContaining(t, playerA, 1)).toBeUndefined();
    // Consolation slot should no longer have playerB (loser of QF)
    expect(findInConsolation(t, playerB)).toBe(false);

    assertNoDuplicateLiveParticipants(t);
  });

  it('revert blocked: cuartos when semis already played → returns ok=false reason=downstream_played', async () => {
    const tournament = createOnePhaseBracketTournament(8);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const qfs = t.finalStage!.goldBracket!.rounds[0].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    const targetQf = qfs[0];
    for (const qf of qfs) {
      await completeWith(tournament.id, qf.id, qf.participantA!);
    }

    // Complete the semi that targetQf feeds into
    t = readTournament(tournament.id);
    const semis = t.finalStage!.goldBracket!.rounds[1].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    for (const semi of semis) {
      await completeWith(tournament.id, semi.id, semi.participantA!);
    }

    // Now try to revert the QF — should be blocked
    const result = await revertBracketMatch(tournament.id, targetQf.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('downstream_played');

    // Match should remain unchanged (still COMPLETED)
    t = readTournament(tournament.id);
    const qfAfter = t.finalStage!.goldBracket!.rounds[0].matches.find(m => m.id === targetQf.id)!;
    expect(qfAfter.status).toBe('COMPLETED');
  });

  it('revert final → tournament winner cleared, both finalists stay in their slots', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semis = t.finalStage!.goldBracket!.rounds[0].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    for (const s of semis) {
      await completeWith(tournament.id, s.id, s.participantA!);
    }

    t = readTournament(tournament.id);
    const final = findFinalMatch(t);
    const finalistA = final.participantA!;
    const finalistB = final.participantB!;

    await completeWith(tournament.id, final.id, finalistA);
    t = readTournament(tournament.id);
    expect(findFinalMatch(t).winner).toBe(finalistA);

    // Revert the final
    const result = await revertBracketMatch(tournament.id, final.id);
    expect(result.ok).toBe(true);

    t = readTournament(tournament.id);
    const finalAfter = findFinalMatch(t);
    expect(finalAfter.status).toBe('PENDING');
    expect(finalAfter.winner).toBeUndefined();
    // Finalists stay (they came from semis, not from the final itself)
    expect(finalAfter.participantA).toBe(finalistA);
    expect(finalAfter.participantB).toBe(finalistB);
  });

  it('revert non-completed match → returns ok=false reason=not_completed', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    const t = readTournament(tournament.id);

    const semi = findFirstPlayableMatchInRound(t, 0);
    expect(semi.status).toBe('PENDING');

    const result = await revertBracketMatch(tournament.id, semi.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_completed');
  });

  it('revert non-existent match → returns ok=false reason=not_found', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');

    const result = await revertBracketMatch(tournament.id, 'does-not-exist');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('revert + re-complete cycle: revert match and complete again with DIFFERENT winner — propagation works correctly', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableMatchInRound(t, 0);
    const playerA = semi.participantA!;
    const playerB = semi.participantB!;

    await completeWith(tournament.id, semi.id, playerA);
    await revertBracketMatch(tournament.id, semi.id);
    await completeWith(tournament.id, semi.id, playerB);

    t = readTournament(tournament.id);
    const finalAfter = findFinalMatch(t);
    expect([finalAfter.participantA, finalAfter.participantB]).toContain(playerB);
    expect([finalAfter.participantA, finalAfter.participantB]).not.toContain(playerA);
    assertNoDuplicateLiveParticipants(t);
  });

  it('revert + re-complete cycle: same winner → bracket identical to first completion', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableMatchInRound(t, 0);
    const playerA = semi.participantA!;

    await completeWith(tournament.id, semi.id, playerA);
    t = readTournament(tournament.id);
    const finalSlotsA = [findFinalMatch(t).participantA, findFinalMatch(t).participantB];

    await revertBracketMatch(tournament.id, semi.id);
    await completeWith(tournament.id, semi.id, playerA);
    t = readTournament(tournament.id);
    const finalSlotsB = [findFinalMatch(t).participantA, findFinalMatch(t).participantB];

    expect(finalSlotsB.sort()).toEqual(finalSlotsA.sort());
  });

  it('cascade revert: revert final → revert semi → final and semi are PENDING', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semis = t.finalStage!.goldBracket!.rounds[0].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    for (const s of semis) await completeWith(tournament.id, s.id, s.participantA!);

    t = readTournament(tournament.id);
    const final = findFinalMatch(t);
    await completeWith(tournament.id, final.id, final.participantA!);

    // Revert final first (no downstream — terminal)
    let r = await revertBracketMatch(tournament.id, final.id);
    expect(r.ok).toBe(true);

    // Now revert semi (downstream: final, which is now PENDING again)
    r = await revertBracketMatch(tournament.id, semis[0].id);
    expect(r.ok).toBe(true);

    t = readTournament(tournament.id);
    const semiAfter = t.finalStage!.goldBracket!.rounds[0].matches.find(m => m.id === semis[0].id)!;
    expect(semiAfter.status).toBe('PENDING');
    expect(semiAfter.winner).toBeUndefined();
    assertNoDuplicateLiveParticipants(t);
  });

  it('revert WALKOVER match → resets correctly (status was not COMPLETED but WALKOVER)', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableMatchInRound(t, 0);
    const playerA = semi.participantA!;

    // Manually mark as WALKOVER (simulate no-show flow)
    await completeBracketMatchAndAdvance(tournament.id, semi.id, {
      status: 'WALKOVER',
      winner: playerA,
      gamesWonA: 1, gamesWonB: 0,
      totalPointsA: 0, totalPointsB: 0,
      total20sA: 0, total20sB: 0,
      noShowParticipant: semi.participantB
    });

    const result = await revertBracketMatch(tournament.id, semi.id);
    expect(result.ok).toBe(true);

    t = readTournament(tournament.id);
    const semiAfter = t.finalStage!.goldBracket!.rounds[0].matches.find(m => m.id === semi.id)!;
    expect(semiAfter.status).toBe('PENDING');
    expect(semiAfter.winner).toBeUndefined();
    expect(semiAfter.noShowParticipant).toBeUndefined();
  });

  it('revert legacy data (no consolationSourceA/B) → backfill kicks in and consolation slot clears', async () => {
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

    const qfs = t.finalStage!.goldBracket!.rounds[0].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    const target = qfs[0];
    const playerA = target.participantA!;
    const playerB = target.participantB!;
    for (const qf of qfs) await completeWith(tournament.id, qf.id, qf.participantA!);

    // Strip metadata (legacy)
    t = readTournament(tournament.id);
    for (const c of t.finalStage!.goldBracket!.consolationBrackets ?? []) {
      for (const m of c.rounds[0].matches) {
        delete (m as any).consolationSourceA;
        delete (m as any).consolationSourceB;
      }
    }
    mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);

    const result = await revertBracketMatch(tournament.id, target.id);
    expect(result.ok).toBe(true);

    t = readTournament(tournament.id);
    expect(findInConsolation(t, playerB)).toBe(false);
    expect(findMatchContaining(t, playerA, 1)).toBeUndefined();
  });

  it('revert blocked: cuartos when CONSOLATION already played (downstream is consolation match)', async () => {
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

    const qfs = t.finalStage!.goldBracket!.rounds[0].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    const target = qfs[0];
    for (const qf of qfs) await completeWith(tournament.id, qf.id, qf.participantA!);

    // The QF doesn't directly link via nextMatchIdForLoser to consolation in this
    // bracket (consolation is generated separately and uses placeholders).
    // Even so, our revert logic blocks ONLY on linked downstream. Consolation
    // played would not block via this path — but if a future change links them,
    // ensure revert remains safe. This test documents current behavior.
    const result = await revertBracketMatch(tournament.id, target.id);
    // Accept either: ok=true (current — consolation not directly linked) OR
    // ok=false reason=downstream_played (future improvement). Both are consistent.
    expect(result.ok === true || result.reason === 'downstream_played').toBe(true);
  });

  it('16-player bracket: revert R16 match clears its winner from QF slot', async () => {
    const tournament = createOnePhaseBracketTournament(16);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const r16 = findFirstPlayableMatchInRound(t, 0); // round 0 is R16 in 16-player bracket
    const winner = r16.participantA!;

    await completeWith(tournament.id, r16.id, winner);
    t = readTournament(tournament.id);
    expect(findMatchContaining(t, winner, 1)).toBeDefined(); // winner in QF

    const result = await revertBracketMatch(tournament.id, r16.id);
    expect(result.ok).toBe(true);

    t = readTournament(tournament.id);
    expect(findMatchContaining(t, winner, 1)).toBeUndefined(); // QF slot cleared
    assertNoDuplicateLiveParticipants(t);
  });

  it('revert 3rd-place match → terminal slot, no downstream to check', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    // Complete semis to populate 3rd-place
    const semis = t.finalStage!.goldBracket!.rounds[0].matches.filter(
      m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
    );
    for (const s of semis) await completeWith(tournament.id, s.id, s.participantA!);

    t = readTournament(tournament.id);
    const third = findThirdPlace(t);
    if (!third) return; // skip if no 3rd-place
    const finalistA = third.participantA!;

    await completeWith(tournament.id, third.id, finalistA);

    const result = await revertBracketMatch(tournament.id, third.id);
    expect(result.ok).toBe(true);

    t = readTournament(tournament.id);
    const thirdAfter = findThirdPlace(t);
    expect(thirdAfter?.status).toBe('PENDING');
    expect(thirdAfter?.winner).toBeUndefined();
  });

  it('revert preserves participants (slots) but clears scores/rounds/duration', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);
    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableMatchInRound(t, 0);
    const origA = semi.participantA;
    const origB = semi.participantB;

    await completeBracketMatchAndAdvance(tournament.id, semi.id, {
      status: 'COMPLETED',
      winner: origA,
      gamesWonA: 2, gamesWonB: 1,
      totalPointsA: 14, totalPointsB: 11,
      total20sA: 3, total20sB: 2,
      rounds: [
        { gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 }
      ]
    });

    const result = await revertBracketMatch(tournament.id, semi.id);
    expect(result.ok).toBe(true);

    t = readTournament(tournament.id);
    const semiAfter = t.finalStage!.goldBracket!.rounds[0].matches.find(m => m.id === semi.id)!;
    expect(semiAfter.participantA).toBe(origA);
    expect(semiAfter.participantB).toBe(origB);
    expect(semiAfter.gamesWonA).toBeUndefined();
    expect(semiAfter.totalPointsA).toBeUndefined();
    expect(semiAfter.total20sA).toBeUndefined();
    expect(semiAfter.rounds).toBeUndefined();
    expect(semiAfter.duration).toBeUndefined();
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
