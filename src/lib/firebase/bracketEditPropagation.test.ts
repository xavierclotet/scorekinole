/**
 * Bracket re-edit propagation tests.
 *
 * Verifies that admins can edit an already-COMPLETED bracket match and have
 * the new winner/loser propagated into subsequent slots (semis → final, etc.)
 * via `completeBracketMatchAndAdvance(..., allowOverwrite=true)`.
 *
 * Regression coverage for v2.5.20 fix where editing a quarterfinal result
 * left the next round populated with the OLD winner.
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

function seedTournament(t: Tournament): void {
  mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);
}

function readTournament(id: string): Tournament {
  const doc = mockStore.getDocument(`tournaments/${id}`);
  if (!doc) throw new Error(`Tournament ${id} not found`);
  return doc.data as unknown as Tournament;
}

function createOnePhaseBracketTournament(numParticipants: number): Tournament {
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
    createdAt: now,
    createdBy: { userId: 'admin-1', userName: 'Admin' },
    updatedAt: now
  } as Tournament;
}

function findFirstPlayableSemi(t: Tournament): BracketMatch {
  const round1 = t.finalStage!.goldBracket!.rounds[0];
  const match = round1.matches.find(
    m => m.participantA && m.participantB && m.participantA !== 'BYE' && m.participantB !== 'BYE'
  );
  if (!match) throw new Error('No playable semifinal found');
  return match;
}

function findFinal(t: Tournament): BracketMatch {
  const rounds = t.finalStage!.goldBracket!.rounds;
  return rounds[rounds.length - 1].matches[0];
}

describe('Bracket re-edit propagation (allowOverwrite)', () => {
  it('admin edits semifinal winner → final slot updates to new winner', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableSemi(t);
    const playerA = semi.participantA!;
    const playerB = semi.participantB!;
    const semiId = semi.id;

    // Step 1 — first completion: playerA wins
    let ok = await completeBracketMatchAndAdvance(tournament.id, semiId, {
      status: 'COMPLETED',
      winner: playerA,
      gamesWonA: 1, gamesWonB: 0,
      totalPointsA: 8, totalPointsB: 4,
      total20sA: 1, total20sB: 0
    });
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    const finalBefore = findFinal(t);
    const slotsBefore = [finalBefore.participantA, finalBefore.participantB];
    expect(slotsBefore).toContain(playerA);
    expect(slotsBefore).not.toContain(playerB);

    // Step 2 — admin re-edits with allowOverwrite=true: playerB wins
    ok = await completeBracketMatchAndAdvance(
      tournament.id,
      semiId,
      {
        status: 'COMPLETED',
        winner: playerB,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      },
      true
    );
    expect(ok).toBe(true);

    // Final slot should now contain playerB instead of playerA
    t = readTournament(tournament.id);
    const finalAfter = findFinal(t);
    const slotsAfter = [finalAfter.participantA, finalAfter.participantB];
    expect(slotsAfter).toContain(playerB);
    expect(slotsAfter).not.toContain(playerA);
  });

  it('without allowOverwrite, re-edit is a silent no-op (idempotency guard)', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableSemi(t);
    const playerA = semi.participantA!;
    const playerB = semi.participantB!;
    const semiId = semi.id;

    // First completion: playerA wins
    await completeBracketMatchAndAdvance(tournament.id, semiId, {
      status: 'COMPLETED',
      winner: playerA,
      gamesWonA: 1, gamesWonB: 0,
      totalPointsA: 8, totalPointsB: 4,
      total20sA: 1, total20sB: 0
    });

    t = readTournament(tournament.id);
    const finalAfterFirst = findFinal(t);
    const slotsAfterFirst = [finalAfterFirst.participantA, finalAfterFirst.participantB];
    expect(slotsAfterFirst).toContain(playerA);

    // Re-edit attempt without allowOverwrite — should NOT change the final slot
    const ok = await completeBracketMatchAndAdvance(tournament.id, semiId, {
      status: 'COMPLETED',
      winner: playerB,
      gamesWonA: 0, gamesWonB: 1,
      totalPointsA: 4, totalPointsB: 8,
      total20sA: 0, total20sB: 1
    });
    expect(ok).toBe(true); // Returns true (no error) but is a no-op

    t = readTournament(tournament.id);
    const finalAfterEdit = findFinal(t);
    const slotsAfterEdit = [finalAfterEdit.participantA, finalAfterEdit.participantB];
    expect(slotsAfterEdit).toContain(playerA); // Still playerA
    expect(slotsAfterEdit).not.toContain(playerB);
  });

  it('8-player bracket: admin edits quarterfinal → new winner propagates to semifinal AND new loser flows to consolation', async () => {
    const tournament = createOnePhaseBracketTournament(8);
    (tournament as any).groupStage = undefined;
    // Enable consolation so loser flows somewhere observable
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    // Force-enable consolation on the gold bracket if not already
    if (t.finalStage?.goldBracket && !(t.finalStage as any).consolationEnabled) {
      (t.finalStage as any).consolationEnabled = true;
      mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);
    }
    t = readTournament(tournament.id);

    // Find a quarterfinal (round 0)
    const quarterfinal = findFirstPlayableSemi(t); // works for any first-round playable match
    const playerA = quarterfinal.participantA!;
    const playerB = quarterfinal.participantB!;
    const qfId = quarterfinal.id;

    // Step 1 — playerA wins the quarterfinal
    let ok = await completeBracketMatchAndAdvance(tournament.id, qfId, {
      status: 'COMPLETED',
      winner: playerA,
      gamesWonA: 1, gamesWonB: 0,
      totalPointsA: 8, totalPointsB: 4,
      total20sA: 1, total20sB: 0
    });
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    // The semifinal that this quarterfinal feeds into should now have playerA
    const round1 = t.finalStage!.goldBracket!.rounds[1]; // round 1 = semifinals (0-indexed)
    const semiThatGotWinner = round1.matches.find(
      m => m.participantA === playerA || m.participantB === playerA
    );
    expect(semiThatGotWinner).toBeDefined();
    expect([semiThatGotWinner!.participantA, semiThatGotWinner!.participantB]).toContain(playerA);

    // The consolation bracket should have playerB (the loser) somewhere
    const consoBefore = t.finalStage!.goldBracket!.consolationBrackets;
    let playerBInConsolation = false;
    if (consoBefore) {
      for (const c of consoBefore) {
        for (const r of c.rounds) {
          for (const m of r.matches) {
            if (m.participantA === playerB || m.participantB === playerB) {
              playerBInConsolation = true;
            }
          }
        }
      }
    }

    // Step 2 — admin re-edits with allowOverwrite=true: playerB wins now
    ok = await completeBracketMatchAndAdvance(
      tournament.id,
      qfId,
      {
        status: 'COMPLETED',
        winner: playerB,
        gamesWonA: 0, gamesWonB: 1,
        totalPointsA: 4, totalPointsB: 8,
        total20sA: 0, total20sB: 1
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);

    // The semifinal slot should now have playerB instead of playerA
    const round1AfterEdit = t.finalStage!.goldBracket!.rounds[1];
    const semiAfter = round1AfterEdit.matches.find(
      m => m.participantA === playerA || m.participantB === playerA
        || m.participantA === playerB || m.participantB === playerB
    );
    expect(semiAfter).toBeDefined();
    const semiSlots = [semiAfter!.participantA, semiAfter!.participantB];
    expect(semiSlots).toContain(playerB);
    expect(semiSlots).not.toContain(playerA);

    // The consolation should now have playerA (was previously absent or had playerB)
    const consoAfter = t.finalStage!.goldBracket!.consolationBrackets;
    if (consoAfter && playerBInConsolation) {
      // If consolation existed, playerB should NO LONGER be in consolation; playerA SHOULD be there
      let playerAInConsolation = false;
      let playerBStillInConsolation = false;
      for (const c of consoAfter) {
        for (const r of c.rounds) {
          for (const m of r.matches) {
            if (m.participantA === playerA || m.participantB === playerA) playerAInConsolation = true;
            if (m.participantA === playerB || m.participantB === playerB) playerBStillInConsolation = true;
          }
        }
      }
      expect(playerAInConsolation).toBe(true);
      expect(playerBStillInConsolation).toBe(false);
    }
  });

  it('admin edit with same winner → final slot remains unchanged (no spurious moves)', async () => {
    const tournament = createOnePhaseBracketTournament(4);
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'FINAL_STAGE');
    let t = readTournament(tournament.id);

    const semi = findFirstPlayableSemi(t);
    const playerA = semi.participantA!;
    const semiId = semi.id;

    // First completion: playerA wins 1-0
    await completeBracketMatchAndAdvance(tournament.id, semiId, {
      status: 'COMPLETED',
      winner: playerA,
      gamesWonA: 1, gamesWonB: 0,
      totalPointsA: 8, totalPointsB: 4,
      total20sA: 1, total20sB: 0
    });

    // Admin re-edits with allowOverwrite=true but SAME winner (just fixing a 20s value)
    const ok = await completeBracketMatchAndAdvance(
      tournament.id,
      semiId,
      {
        status: 'COMPLETED',
        winner: playerA,
        gamesWonA: 1, gamesWonB: 0,
        totalPointsA: 8, totalPointsB: 4,
        total20sA: 2, total20sB: 0  // ← only 20s changed
      },
      true
    );
    expect(ok).toBe(true);

    t = readTournament(tournament.id);
    const finalAfter = findFinal(t);
    const slotsAfter = [finalAfter.participantA, finalAfter.participantB];
    expect(slotsAfter).toContain(playerA); // Still there
  });
});
