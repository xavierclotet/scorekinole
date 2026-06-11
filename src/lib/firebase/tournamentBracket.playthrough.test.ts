/**
 * Final-stage playthrough tests — bracket must work for ANY participant count.
 *
 * For N = 4..24 participants (consolation + 3rd place enabled) this harness:
 *   1. generates the bracket with the REAL generateBracket() (BYEs included),
 *   2. plays every playable match through the REAL completeBracketMatchAndAdvance()
 *      transaction machinery (the exact code path used by the admin /bracket
 *      page and /game), letting BYEs auto-advance,
 *   3. asserts NOTHING hangs: every match reaches COMPLETED/WALKOVER, no
 *      LOSER:x placeholders remain, every consolation bracket is isComplete,
 *   4. asserts completeFinalStage() succeeds (its in-transaction completeness
 *      validation passes, including BYE-vs-BYE consolation matches),
 *   5. asserts final positions cover every real participant exactly once
 *      (top 4 from main bracket + consolation positions).
 *
 * A hang anywhere (a consolation slot waiting for a loser that never comes, a
 * BYE not cascading, parity-based slot assignment landing in the wrong match)
 * fails these tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import { calculateConsolationPositions, isBye, isLoserPlaceholder } from '$lib/algorithms/bracket';
import type { Tournament, BracketMatch, BracketWithConfig } from '$lib/types/tournament';

// ─── Shared mock state ───────────────────────────────────────────────────────

let mockStore: MockFirestore;

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

// getTournament/updateTournament backed by the SAME mock store the
// transactions use, so generateBracket's read→write lands in the store.
vi.mock('./tournaments', () => ({
  parseTournamentData: (data: unknown) => data,
  getTournament: vi.fn(async (id: string) => {
    const doc = mockStore.getDocument(`tournaments/${id}`);
    return doc ? structuredClone(doc.data) : null;
  }),
  updateTournament: vi.fn(async (id: string, updates: Record<string, unknown>) => {
    const doc = mockStore.getDocument(`tournaments/${id}`);
    if (!doc) return false;
    mockStore.setDocument(`tournaments/${id}`, { ...doc.data, ...structuredClone(updates) });
    return true;
  })
}));

// Positions are asserted in-test via calculateConsolationPositions; the
// ranking layer (user profiles etc.) is out of scope here.
vi.mock('./tournamentRanking', () => ({
  calculateFinalPositionsForTournament: (t: { participants: unknown[] }) => t.participants
}));

const { generateBracket, completeBracketMatchAndAdvance, completeFinalStage } = await import('./tournamentBracket');

// ─── Fixtures & helpers ──────────────────────────────────────────────────────

function makeTournament(numParticipants: number, id: string): Tournament {
  const participants = Array.from({ length: numParticipants }, (_, i) => ({
    id: `p${i + 1}`,
    type: 'GUEST' as const,
    name: `Player ${i + 1}`,
    status: 'ACTIVE' as const,
    rankingSnapshot: 1000 - i * 10
  }));

  return {
    id,
    key: 'PLAY01',
    name: `Playthrough ${numParticipants}`,
    country: 'ES',
    city: 'Barcelona',
    status: 'FINAL_STAGE',
    phaseType: 'ONE_PHASE',
    gameType: 'singles',
    show20s: true,
    showHammer: false,
    numTables: 4,
    rankingConfig: { enabled: false },
    participants,
    finalStage: {
      mode: 'SINGLE_BRACKET',
      consolationEnabled: true,
      thirdPlaceMatchEnabled: true,
      isComplete: false
    },
    createdAt: Date.now() - 3600000,
    createdBy: { userId: 'admin-1', userName: 'Admin' },
    updatedAt: Date.now()
  } as unknown as Tournament;
}

function isRealParticipant(id: string | undefined): id is string {
  return !!id && !isBye(id) && !isLoserPlaceholder(id);
}

function allMatches(bracket: BracketWithConfig): BracketMatch[] {
  return [
    ...(bracket.rounds || []).flatMap(r => r.matches),
    ...(bracket.thirdPlaceMatch ? [bracket.thirdPlaceMatch] : []),
    ...(bracket.consolationBrackets || []).flatMap(cb => (cb.rounds || []).flatMap(r => r.matches))
  ];
}

function playableMatches(bracket: BracketWithConfig): BracketMatch[] {
  return allMatches(bracket).filter(m =>
    m.status === 'PENDING' &&
    isRealParticipant(m.participantA) &&
    isRealParticipant(m.participantB)
  );
}

/** Play every playable match (participantA always wins) until nothing is left */
async function playAll(tournamentId: string): Promise<number> {
  let played = 0;
  for (let iter = 0; iter < 80; iter++) {
    const bracket = readTournament(tournamentId).finalStage!.goldBracket!;
    const playable = playableMatches(bracket);
    if (playable.length === 0) return played;

    for (const match of playable) {
      const ok = await completeBracketMatchAndAdvance(tournamentId, match.id, {
        status: 'COMPLETED',
        winner: match.participantA,
        gamesWonA: 1,
        gamesWonB: 0,
        totalPointsA: 7,
        totalPointsB: 3,
        total20sA: 1,
        total20sB: 0
      });
      expect(ok, `completing match ${match.id} (${match.participantA} vs ${match.participantB})`).toBe(true);
      played++;
    }
  }
  throw new Error('playAll did not converge in 80 iterations');
}

/** Top-4 positions from the main bracket (final + 3rd place) */
function topPositions(bracket: BracketWithConfig): Map<string, number> {
  const positions = new Map<string, number>();
  const finalMatch = bracket.rounds[bracket.rounds.length - 1].matches[0];
  if (finalMatch.winner) {
    positions.set(finalMatch.winner, 1);
    const loser = finalMatch.participantA === finalMatch.winner ? finalMatch.participantB : finalMatch.participantA;
    if (isRealParticipant(loser)) positions.set(loser, 2);
  }
  const third = bracket.thirdPlaceMatch;
  if (third?.winner) {
    positions.set(third.winner, 3);
    const loser = third.participantA === third.winner ? third.participantB : third.participantA;
    if (isRealParticipant(loser)) positions.set(loser, 4);
  }
  return positions;
}

function assertFullyResolved(tournamentId: string, numParticipants: number) {
  const bracket = readTournament(tournamentId).finalStage!.goldBracket!;
  const matches = allMatches(bracket);

  // 1. Every match decided — nothing hangs
  for (const match of matches) {
    expect(
      match.status === 'COMPLETED' || match.status === 'WALKOVER',
      `match ${match.id} stuck in ${match.status} (${match.participantA} vs ${match.participantB})`
    ).toBe(true);
  }

  // 2. No loser placeholders left anywhere
  for (const match of matches) {
    expect(isLoserPlaceholder(match.participantA), `placeholder left in ${match.id}`).toBe(false);
    expect(isLoserPlaceholder(match.participantB), `placeholder left in ${match.id}`).toBe(false);
  }

  // 3. Consolation brackets all complete
  for (const cb of bracket.consolationBrackets || []) {
    if ((cb.rounds || []).length === 0) continue;
    expect(cb.isComplete, `consolation ${cb.source} not complete`).toBe(true);
  }

  // 4. Position coverage: top 4 + consolation positions = every real participant once
  const positions = topPositions(bracket);
  for (const cb of bracket.consolationBrackets || []) {
    if ((cb.rounds || []).length === 0) continue;
    const consPositions = calculateConsolationPositions(cb);
    for (const [pid, pos] of consPositions) {
      expect(positions.has(pid), `participant ${pid} positioned twice (cons ${cb.source} pos ${pos})`).toBe(false);
      positions.set(pid, pos);
    }
  }

  // Consolation exists from 6 participants up — then EVERY participant must
  // have a unique final position, EXCEPT when a consolation source produced a
  // single real loser (e.g. 9 players in a 16-bracket: only one real R1 match,
  // so its loser has nobody to play — the empty consolation is legitimate and
  // that player's position is determined implicitly).
  const emptyConsolations = (bracket.consolationBrackets || []).filter(
    cb => (cb.rounds || []).length === 0
  ).length;
  if (numParticipants >= 6) {
    expect(
      positions.size,
      `positioned ${positions.size}/${numParticipants} (empty consolations: ${emptyConsolations})`
    ).toBeGreaterThanOrEqual(numParticipants - emptyConsolations);
    expect(positions.size).toBeLessThanOrEqual(numParticipants);
  } else {
    expect(positions.size).toBe(4);
  }
  const uniquePositions = new Set(positions.values());
  expect(uniquePositions.size).toBe(positions.size);

  console.log(`  📊 N=${numParticipants}: positioned ${positions.size}/${numParticipants}, empty consolations: ${emptyConsolations}, consolation sizes: ${(bracket.consolationBrackets || []).map(cb => `${cb.source}:${cb.numLosers ?? 0}`).join(' ')}`);
}

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('final-stage playthrough for any participant count (consolation + 3rd place)', () => {
  const COUNTS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20, 21, 24, 25, 27, 32, 33, 40, 48, 56, 61, 64];

  for (const n of COUNTS) {
    it(`${n} participants: bracket completes, BYEs advance, consolation resolves, positions cover all`, async () => {
      const id = `play-${n}`;
      mockStore.setDocument(`tournaments/${id}`, makeTournament(n, id) as unknown as Record<string, unknown>);

      expect(await generateBracket(id, undefined, true, true)).toBe(true);

      // Structural sanity after generation: every participant exactly once in R1
      const generated = readTournament(id).finalStage!.goldBracket!;
      const r1Ids = generated.rounds[0].matches
        .flatMap(m => [m.participantA, m.participantB])
        .filter(isRealParticipant);
      expect(new Set(r1Ids).size).toBe(n);
      expect(r1Ids.length).toBe(n);
      // No BYE-vs-BYE in round 1
      for (const m of generated.rounds[0].matches) {
        expect(isBye(m.participantA) && isBye(m.participantB)).toBe(false);
      }

      await playAll(id);
      assertFullyResolved(id, n);

      // The finalize validation (main + consolation completeness) must pass
      expect(await completeFinalStage(id)).toBe(true);
      const final = readTournament(id);
      expect(final.status).toBe('COMPLETED');
      expect(final.finalStage!.winner).toBeDefined();
    }, 30000);
  }
});

describe('final-stage playthrough with walkovers', () => {
  it('8 participants: a first-round WALKOVER still feeds consolation and everything completes', async () => {
    const id = 'play-wo-8';
    mockStore.setDocument(`tournaments/${id}`, makeTournament(8, id) as unknown as Record<string, unknown>);
    expect(await generateBracket(id, undefined, true, true)).toBe(true);

    // First QF decided by no-show (same payload markBracketNoShow produces)
    const bracket = readTournament(id).finalStage!.goldBracket!;
    const firstQF = bracket.rounds[0].matches[0];
    const ok = await completeBracketMatchAndAdvance(id, firstQF.id, {
      status: 'WALKOVER',
      winner: firstQF.participantA,
      noShowParticipant: firstQF.participantB,
      gamesWonA: 1,
      gamesWonB: 0
    });
    expect(ok).toBe(true);

    await playAll(id);
    assertFullyResolved(id, 8);
    expect(await completeFinalStage(id)).toBe(true);

    // The no-show loser was still placed in the consolation bracket
    // (current design: WO losers compete for positions 5-8)
    const after = readTournament(id).finalStage!.goldBracket!;
    const consParticipants = (after.consolationBrackets || [])
      .flatMap(cb => cb.rounds[0]?.matches || [])
      .flatMap(m => [m.participantA, m.participantB])
      .filter(isRealParticipant);
    expect(consParticipants).toContain(firstQF.participantB);
  }, 30000);

  it('6 participants: WALKOVER in a BYE-shifted bracket (QF is round 1) completes cleanly', async () => {
    const id = 'play-wo-6';
    mockStore.setDocument(`tournaments/${id}`, makeTournament(6, id) as unknown as Record<string, unknown>);
    expect(await generateBracket(id, undefined, true, true)).toBe(true);

    const bracket = readTournament(id).finalStage!.goldBracket!;
    const playable = playableMatches(bracket);
    expect(playable.length).toBeGreaterThan(0);

    const ok = await completeBracketMatchAndAdvance(id, playable[0].id, {
      status: 'WALKOVER',
      winner: playable[0].participantB,
      noShowParticipant: playable[0].participantA,
      gamesWonA: 0,
      gamesWonB: 1
    });
    expect(ok).toBe(true);

    await playAll(id);
    assertFullyResolved(id, 6);
    expect(await completeFinalStage(id)).toBe(true);
  }, 30000);
});
