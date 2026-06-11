/**
 * Bracket generation guards — regression tests
 *
 * Bugs covered (transition page /admin/tournaments/[id]/transition):
 * 1. A stale transition tab could call generateBracket()/generateSplitBrackets()
 *    AFTER the tournament had advanced to FINAL_STAGE with results entered —
 *    silently overwriting the whole finalStage and wiping played matches.
 *    Now generation refuses if any existing bracket match is IN_PROGRESS,
 *    COMPLETED or WALKOVER, or if the tournament is COMPLETED.
 * 2. generateSplitBrackets seeded DISQUALIFIED/WITHDRAWN players (the filter
 *    existed only in generateBracket); a withdrawn player was auto-placed in
 *    the Silver bracket by the transition page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockDocumentReference } from './__mocks__/mockFirestore';

// ─── vi.mock setup ───────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) =>
    new MockDocumentReference(`${collection}/${id}`, id),
  runTransaction: vi.fn(),
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

const { getTournament, updateTournament } = await import('./tournaments');
const { generateBracket, generateSplitBrackets } = await import('./tournamentBracket');

// ─── Fixtures ────────────────────────────────────────────────────────────────

function participant(id: string, status = 'ACTIVE') {
  return { id, type: 'GUEST', name: id.toUpperCase(), rankingSnapshot: 0, status };
}

function baseTwoPhaseTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: 'guard-t1',
    status: 'TRANSITION',
    phaseType: 'TWO_PHASE',
    numTables: 2,
    participants: [participant('p1'), participant('p2'), participant('p3'), participant('p4')],
    groupStage: {
      type: 'ROUND_ROBIN',
      isComplete: true,
      currentRound: 3,
      totalRounds: 3,
      groups: [{
        id: 'group-0',
        name: 'Grupo A',
        participants: ['p1', 'p2', 'p3', 'p4'],
        standings: [
          { participantId: 'p1', position: 1, matchesPlayed: 3, matchesWon: 3, matchesLost: 0, matchesTied: 0, points: 6, total20s: 0, totalPointsScored: 20, qualifiedForFinal: true },
          { participantId: 'p2', position: 2, matchesPlayed: 3, matchesWon: 2, matchesLost: 1, matchesTied: 0, points: 4, total20s: 0, totalPointsScored: 15, qualifiedForFinal: true },
          { participantId: 'p3', position: 3, matchesPlayed: 3, matchesWon: 1, matchesLost: 2, matchesTied: 0, points: 2, total20s: 0, totalPointsScored: 10, qualifiedForFinal: true },
          { participantId: 'p4', position: 4, matchesPlayed: 3, matchesWon: 0, matchesLost: 3, matchesTied: 0, points: 0, total20s: 0, totalPointsScored: 5, qualifiedForFinal: true }
        ],
        schedule: []
      }]
    },
    ...overrides
  };
}

function existingBracket(matchStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED') {
  return {
    rounds: [{
      roundNumber: 1,
      name: 'Final',
      matches: [{
        id: 'bm1',
        position: 0,
        participantA: 'p1',
        participantB: 'p2',
        status: matchStatus,
        ...(matchStatus === 'COMPLETED' ? { winner: 'p1', gamesWonA: 1, gamesWonB: 0 } : {})
      }]
    }],
    totalRounds: 1,
    config: {}
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateTournament).mockResolvedValue(true);
});

// ─── generateBracket guards ──────────────────────────────────────────────────

describe('generateBracket regeneration guard', () => {
  it('refuses when the existing bracket has a COMPLETED match (stale tab)', async () => {
    const tournament = baseTwoPhaseTournament({
      status: 'FINAL_STAGE',
      finalStage: { mode: 'SINGLE_BRACKET', goldBracket: existingBracket('COMPLETED') }
    });
    vi.mocked(getTournament).mockResolvedValue(tournament as any);

    const ok = await generateBracket('guard-t1');

    expect(ok).toBe(false);
    expect(updateTournament).not.toHaveBeenCalled();
  });

  it('refuses when the existing bracket has an IN_PROGRESS match', async () => {
    const tournament = baseTwoPhaseTournament({
      status: 'FINAL_STAGE',
      finalStage: { mode: 'SINGLE_BRACKET', goldBracket: existingBracket('IN_PROGRESS') }
    });
    vi.mocked(getTournament).mockResolvedValue(tournament as any);

    expect(await generateBracket('guard-t1')).toBe(false);
    expect(updateTournament).not.toHaveBeenCalled();
  });

  it('refuses when the tournament is COMPLETED', async () => {
    const tournament = baseTwoPhaseTournament({ status: 'COMPLETED' });
    vi.mocked(getTournament).mockResolvedValue(tournament as any);

    expect(await generateBracket('guard-t1')).toBe(false);
    expect(updateTournament).not.toHaveBeenCalled();
  });

  it('allows regenerating when the existing bracket is all PENDING (admin retry in TRANSITION)', async () => {
    const tournament = baseTwoPhaseTournament({
      finalStage: { mode: 'SINGLE_BRACKET', goldBracket: existingBracket('PENDING') }
    });
    vi.mocked(getTournament).mockResolvedValue(tournament as any);

    expect(await generateBracket('guard-t1')).toBe(true);
    expect(updateTournament).toHaveBeenCalledTimes(1);
  });

  it('allows first-time generation (no finalStage bracket yet)', async () => {
    const tournament = baseTwoPhaseTournament();
    vi.mocked(getTournament).mockResolvedValue(tournament as any);

    expect(await generateBracket('guard-t1')).toBe(true);
    expect(updateTournament).toHaveBeenCalledTimes(1);
  });
});

// ─── generateSplitBrackets guards ───────────────────────────────────────────

const SPLIT_CONFIG = {
  earlyRounds: { gameMode: 'rounds' as const, roundsToPlay: 4, matchesToWin: 1 },
  semifinal: { gameMode: 'rounds' as const, roundsToPlay: 4, matchesToWin: 1 },
  final: { gameMode: 'rounds' as const, roundsToPlay: 4, matchesToWin: 1 }
};

function splitOptions(goldIds: string[], silverIds: string[]) {
  return {
    goldParticipantIds: goldIds,
    silverParticipantIds: silverIds,
    goldConfig: SPLIT_CONFIG,
    silverConfig: SPLIT_CONFIG,
    consolationEnabled: false,
    thirdPlaceMatchEnabled: true
  };
}

describe('generateSplitBrackets guards', () => {
  it('refuses when an existing bracket has played matches', async () => {
    const tournament = baseTwoPhaseTournament({
      status: 'FINAL_STAGE',
      finalStage: {
        mode: 'SPLIT_DIVISIONS',
        goldBracket: existingBracket('PENDING'),
        silverBracket: existingBracket('COMPLETED')
      }
    });
    vi.mocked(getTournament).mockResolvedValue(tournament as any);

    const ok = await generateSplitBrackets('guard-t1', splitOptions(['p1', 'p2'], ['p3', 'p4']));

    expect(ok).toBe(false);
    expect(updateTournament).not.toHaveBeenCalled();
  });

  it('excludes DISQUALIFIED and WITHDRAWN players from both brackets', async () => {
    const tournament = baseTwoPhaseTournament({
      participants: [
        participant('p1'),
        participant('p2', 'DISQUALIFIED'),
        participant('p3'),
        participant('p4', 'WITHDRAWN'),
        participant('p5'),
        participant('p6')
      ]
    });
    vi.mocked(getTournament).mockResolvedValue(tournament as any);

    let captured: any = null;
    vi.mocked(updateTournament).mockImplementation(async (_id, updates: any) => {
      captured = updates;
      return true;
    });

    // p2 (DSQ) listed in gold, p4 (WITHDRAWN) listed in silver
    const ok = await generateSplitBrackets('guard-t1', splitOptions(['p1', 'p2', 'p3'], ['p4', 'p5', 'p6']));

    expect(ok).toBe(true);
    expect(captured).not.toBeNull();

    const collectSlots = (bracket: any): string[] => {
      const slots: string[] = [];
      for (const round of bracket.rounds) {
        for (const match of round.matches) {
          if (match.participantA) slots.push(match.participantA);
          if (match.participantB) slots.push(match.participantB);
        }
      }
      return slots;
    };

    const goldSlots = collectSlots(captured.finalStage.goldBracket);
    const silverSlots = collectSlots(captured.finalStage.silverBracket);

    expect(goldSlots).not.toContain('p2');
    expect(silverSlots).not.toContain('p4');
    expect(goldSlots).toContain('p1');
    expect(goldSlots).toContain('p3');
    expect(silverSlots).toContain('p5');
    expect(silverSlots).toContain('p6');
  });

  it('refuses when after filtering fewer than 2 participants remain in a bracket', async () => {
    const tournament = baseTwoPhaseTournament({
      participants: [
        participant('p1'),
        participant('p2', 'DISQUALIFIED'),
        participant('p3'),
        participant('p4')
      ]
    });
    vi.mocked(getTournament).mockResolvedValue(tournament as any);

    // Gold would end up with only p1 after filtering the DSQ player
    const ok = await generateSplitBrackets('guard-t1', splitOptions(['p1', 'p2'], ['p3', 'p4']));

    expect(ok).toBe(false);
    expect(updateTournament).not.toHaveBeenCalled();
  });

  it('deduplicates repeated IDs in the client-provided lists', async () => {
    const tournament = baseTwoPhaseTournament();
    vi.mocked(getTournament).mockResolvedValue(tournament as any);

    let captured: any = null;
    vi.mocked(updateTournament).mockImplementation(async (_id, updates: any) => {
      captured = updates;
      return true;
    });

    const ok = await generateSplitBrackets('guard-t1', splitOptions(['p1', 'p2', 'p1'], ['p3', 'p4', 'p4']));

    expect(ok).toBe(true);
    // 2 unique gold participants → single final match, no inflated bracket
    expect(captured.finalStage.goldBracket.rounds[0].matches.length).toBe(1);
  });
});
