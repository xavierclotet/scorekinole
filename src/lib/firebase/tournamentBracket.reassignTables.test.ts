/**
 * Concurrency tests for reassignTables()
 *
 * Bug: reassignTables() read the tournament with getTournament() (outside any
 * transaction), mutated table numbers on the clone, and then wrote the ENTIRE
 * finalStage back. A bracket-match completion committing between that read and
 * write was silently reverted (result lost, winner not advanced) — and the
 * function is used exactly when completions are most frequent (between rounds).
 *
 * Fix: the whole read→assign→write cycle now runs inside one runTransaction,
 * so a concurrent completion forces a retry that re-reads fresh state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import type { Tournament, BracketMatch } from '$lib/types/tournament';

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
  updateTournament: vi.fn()
}));

vi.mock('./tournamentRanking', () => ({
  calculateFinalPositionsForTournament: vi.fn()
}));

// ─── Import function under test (AFTER mocks) ───────────────────────────────

const { reassignTables } = await import('./tournamentBracket');

// ─── Fixtures ────────────────────────────────────────────────────────────────

function bracketMatch(id: string, overrides: Partial<BracketMatch> = {}): BracketMatch {
  return {
    id,
    position: 0,
    participantA: 'p1',
    participantB: 'p2',
    status: 'PENDING',
    ...overrides
  } as BracketMatch;
}

/**
 * FINAL_STAGE tournament: semifinal m1 IN_PROGRESS on table 1,
 * semifinal m2 PENDING without a table (waiting for reassignment).
 */
function makeBracketTournament(): Tournament {
  return {
    id: 'bt1',
    status: 'FINAL_STAGE',
    numTables: 1,
    participants: [
      { id: 'p1', type: 'GUEST', name: 'P1', rankingSnapshot: 0, status: 'ACTIVE' },
      { id: 'p2', type: 'GUEST', name: 'P2', rankingSnapshot: 0, status: 'ACTIVE' },
      { id: 'p3', type: 'GUEST', name: 'P3', rankingSnapshot: 0, status: 'ACTIVE' },
      { id: 'p4', type: 'GUEST', name: 'P4', rankingSnapshot: 0, status: 'ACTIVE' }
    ],
    finalStage: {
      mode: 'SINGLE_BRACKET',
      consolationEnabled: false,
      goldBracket: {
        rounds: [
          {
            roundNumber: 1,
            name: 'Semifinales',
            matches: [
              bracketMatch('m1', { position: 0, status: 'IN_PROGRESS', tableNumber: 1, startedAt: Date.now() }),
              bracketMatch('m2', { position: 1, participantA: 'p3', participantB: 'p4' })
            ]
          },
          {
            roundNumber: 2,
            name: 'Final',
            matches: [bracketMatch('m3', { position: 0, participantA: '', participantB: '' })]
          }
        ],
        totalRounds: 2
      },
      isComplete: false
    }
  } as unknown as Tournament;
}

function findBracketMatch(t: Tournament, id: string): BracketMatch {
  for (const round of t.finalStage!.goldBracket!.rounds) {
    const m = round.matches.find(x => x.id === id);
    if (m) return m;
  }
  throw new Error(`match ${id} not found`);
}

/** Simulates a player's device completing m1 — a transactional write deriving from the in-txn read. */
async function concurrentCompleteM1(tournamentId: string) {
  await mockStore.runTransaction(async (txn) => {
    const ref = new MockDocumentReference(`tournaments/${tournamentId}`, tournamentId);
    const snap = await txn.get(ref);
    const data = snap.data() as unknown as Tournament;
    const finalStage = JSON.parse(JSON.stringify(data.finalStage));
    const m1 = finalStage.goldBracket.rounds[0].matches.find((m: BracketMatch) => m.id === 'm1');
    m1.status = 'COMPLETED';
    m1.winner = 'p1';
    m1.totalPointsA = 7;
    m1.totalPointsB = 3;
    delete m1.tableNumber; // table freed
    txn.update(ref, { finalStage });
  });
}

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('reassignTables — basic behavior', () => {
  it('assigns a table to the pending match and persists the new table count', async () => {
    seedTournament(makeBracketTournament());

    const result = await reassignTables('bt1', 2);

    expect(result.success).toBe(true);
    const t = readTournament('bt1');
    expect(t.numTables).toBe(2);
    const m2 = findBracketMatch(t, 'm2');
    expect(m2.tableNumber).toBeDefined();
    // The in-progress match keeps its table and status
    const m1 = findBracketMatch(t, 'm1');
    expect(m1.status).toBe('IN_PROGRESS');
    expect(m1.tableNumber).toBe(1);
  });
});

describe('reassignTables — concurrent completion must survive', () => {
  it('a match completion committing during the reassignment is NOT reverted', async () => {
    seedTournament(makeBracketTournament());

    // Fire the reassignment and a player's completion at the same time.
    // Whichever commits second must retry from fresh state — neither write may be lost.
    const [result] = await Promise.all([
      reassignTables('bt1', 2),
      concurrentCompleteM1('bt1')
    ]);

    expect(result.success).toBe(true);

    const t = readTournament('bt1');
    const m1 = findBracketMatch(t, 'm1');
    // The completion survived (the old getTournament+write-all code reverted it
    // to IN_PROGRESS with the stale table assignment).
    expect(m1.status).toBe('COMPLETED');
    expect(m1.winner).toBe('p1');
    expect(m1.totalPointsA).toBe(7);

    // And the reassignment still did its job for the pending match.
    expect(t.numTables).toBe(2);
    expect(findBracketMatch(t, 'm2').tableNumber).toBeDefined();
  });

  it('sequential: completion first, then reassign — completed match untouched', async () => {
    seedTournament(makeBracketTournament());

    await concurrentCompleteM1('bt1');
    const result = await reassignTables('bt1', 2);

    expect(result.success).toBe(true);
    const t = readTournament('bt1');
    const m1 = findBracketMatch(t, 'm1');
    expect(m1.status).toBe('COMPLETED');
    expect(m1.winner).toBe('p1');
  });
});

// ─── Regression: generateBracket must never seed DSQ/withdrawn players ────────

describe('generateBracket — disqualified players excluded', () => {
  it('a DSQ player marked qualifiedForFinal is not seeded into the bracket', async () => {
    const { getTournament, updateTournament } = await import('./tournaments');
    const { generateBracket } = await import('./tournamentBracket');

    const tournament = {
      id: 'gb-t1',
      status: 'TRANSITION',
      phaseType: 'TWO_PHASE',
      numTables: 2,
      participants: [
        { id: 'p1', type: 'GUEST', name: 'P1', rankingSnapshot: 0, status: 'ACTIVE' },
        { id: 'p2', type: 'GUEST', name: 'P2', rankingSnapshot: 0, status: 'ACTIVE' },
        { id: 'p3', type: 'GUEST', name: 'P3', rankingSnapshot: 0, status: 'DISQUALIFIED' },
        { id: 'p4', type: 'GUEST', name: 'P4', rankingSnapshot: 0, status: 'ACTIVE' }
      ],
      groupStage: {
        type: 'ROUND_ROBIN',
        isComplete: true,
        currentRound: 3,
        totalRounds: 3,
        groups: [{
          id: 'group-0',
          name: 'Grupo A',
          participants: ['p1', 'p2', 'p3', 'p4'],
          // p3 finished 2nd before being disqualified and is still flagged as qualifier
          standings: [
            { participantId: 'p1', position: 1, matchesPlayed: 3, matchesWon: 3, matchesLost: 0, matchesTied: 0, points: 6, total20s: 0, totalPointsScored: 20, qualifiedForFinal: true },
            { participantId: 'p3', position: 2, matchesPlayed: 3, matchesWon: 2, matchesLost: 1, matchesTied: 0, points: 4, total20s: 0, totalPointsScored: 15, qualifiedForFinal: true },
            { participantId: 'p2', position: 3, matchesPlayed: 3, matchesWon: 1, matchesLost: 2, matchesTied: 0, points: 2, total20s: 0, totalPointsScored: 10, qualifiedForFinal: true },
            { participantId: 'p4', position: 4, matchesPlayed: 3, matchesWon: 0, matchesLost: 3, matchesTied: 0, points: 0, total20s: 0, totalPointsScored: 5, qualifiedForFinal: true }
          ],
          schedule: []
        }]
      }
    };

    vi.mocked(getTournament).mockResolvedValue(tournament as any);
    let captured: any = null;
    vi.mocked(updateTournament).mockImplementation(async (_id: string, updates: any) => {
      captured = updates;
      return true;
    });

    const ok = await generateBracket('gb-t1');

    expect(ok).toBe(true);
    expect(captured).not.toBeNull();

    // Collect every participant slot in the generated bracket
    const slots: string[] = [];
    for (const round of captured.finalStage.goldBracket.rounds) {
      for (const match of round.matches) {
        if (match.participantA) slots.push(match.participantA);
        if (match.participantB) slots.push(match.participantB);
      }
    }

    expect(slots).not.toContain('p3'); // DSQ player never seeded
    expect(slots).toContain('p1');
    expect(slots).toContain('p2');
    expect(slots).toContain('p4');
  });
});

// ─── setBracketMatchSlot — transactional repair-tool write ────────────────────

describe('setBracketMatchSlot (repair tool fallback)', () => {
  it('sets only the requested slot of the target match', async () => {
    const { setBracketMatchSlot } = await import('./tournamentBracket');
    seedTournament(makeBracketTournament());

    const ok = await setBracketMatchSlot('bt1', 'gold', 'm3', 'A', 'p1');

    expect(ok).toBe(true);
    const t = readTournament('bt1');
    const m3 = findBracketMatch(t, 'm3');
    expect(m3.participantA).toBe('p1');
    expect(m3.participantB).toBe(''); // other slot untouched
  });

  it('returns false when the match does not exist', async () => {
    const { setBracketMatchSlot } = await import('./tournamentBracket');
    seedTournament(makeBracketTournament());

    const ok = await setBracketMatchSlot('bt1', 'gold', 'no-such-match', 'A', 'p1');

    expect(ok).toBe(false);
  });

  it('a concurrent match completion is NOT reverted by the repair write', async () => {
    const { setBracketMatchSlot } = await import('./tournamentBracket');
    seedTournament(makeBracketTournament());

    // Repair m3 slot A while a player completes m1 at the same time.
    const [ok] = await Promise.all([
      setBracketMatchSlot('bt1', 'gold', 'm3', 'A', 'p1'),
      concurrentCompleteM1('bt1')
    ]);

    expect(ok).toBe(true);
    const t = readTournament('bt1');
    // Both writes survive (the old fallback wrote a whole stale finalStage,
    // reverting m1 to IN_PROGRESS).
    expect(findBracketMatch(t, 'm1').status).toBe('COMPLETED');
    expect(findBracketMatch(t, 'm1').winner).toBe('p1');
    expect(findBracketMatch(t, 'm3').participantA).toBe('p1');
  });
});
