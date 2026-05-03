import { describe, it, expect } from 'vitest';
import { swapBracketParticipants } from './bracketSwap';
import type { FinalStage, BracketWithConfig, ConsolationBracket, NamedBracket } from '$lib/types/tournament';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PHASE_CFG = {
  gameMode: 'points' as const,
  pointsToWin: 13,
  matchesToWin: 1,
};

const BRACKET_CONFIG = {
  earlyRounds: PHASE_CFG,
  semifinal: PHASE_CFG,
  final: PHASE_CFG,
};

/**
 * Build a minimal 4-player gold bracket (2 rounds: QF → Final).
 * Participants: p1, p2, p3, p4 in a standard seeding arrangement.
 *
 * Round 1 (QF):
 *   match 0: p1 vs p4
 *   match 1: p2 vs p3
 * Round 2 (Final):
 *   match 0: TBD vs TBD
 */
function mkFinalStage(): FinalStage {
  const goldBracket: BracketWithConfig = {
    totalRounds: 2,
    config: BRACKET_CONFIG,
    rounds: [
      {
        roundNumber: 1,
        name: 'Cuartos',
        matches: [
          {
            id: 'r1-m1',
            position: 0,
            participantA: 'p1',
            participantB: 'p4',
            seedA: 1,
            seedB: 4,
            status: 'PENDING',
          },
          {
            id: 'r1-m2',
            position: 1,
            participantA: 'p2',
            participantB: 'p3',
            seedA: 2,
            seedB: 3,
            status: 'PENDING',
          },
        ],
      },
      {
        roundNumber: 2,
        name: 'Final',
        matches: [
          {
            id: 'r2-m1',
            position: 0,
            participantA: undefined,
            participantB: undefined,
            status: 'PENDING',
          },
        ],
      },
    ],
  };

  return {
    mode: 'SINGLE_BRACKET',
    goldBracket,
    isComplete: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('swapBracketParticipants', () => {
  it('swaps two participants symmetrically in the gold bracket', () => {
    const stage = mkFinalStage();
    const result = swapBracketParticipants(stage, 'p1', 'p3');

    // p1 should now appear where p3 was, and vice-versa
    const r1 = result.goldBracket.rounds[0].matches;
    expect(r1[0].participantA).toBe('p3'); // was p1
    expect(r1[0].participantB).toBe('p4'); // untouched
    expect(r1[1].participantA).toBe('p2'); // untouched
    expect(r1[1].participantB).toBe('p1'); // was p3
  });

  it('is pure — does not mutate the original FinalStage', () => {
    const stage = mkFinalStage();
    const original = JSON.parse(JSON.stringify(stage));

    swapBracketParticipants(stage, 'p1', 'p3');

    expect(stage).toEqual(original);
  });

  it('throws when neither id appears in the bracket', () => {
    const stage = mkFinalStage();
    expect(() => swapBracketParticipants(stage, 'x99', 'x100')).toThrow();
  });

  it('throws when only one id appears in the bracket', () => {
    const stage = mkFinalStage();
    expect(() => swapBracketParticipants(stage, 'p1', 'x99')).toThrow();
  });

  it('throws when both ids are the same', () => {
    const stage = mkFinalStage();
    expect(() => swapBracketParticipants(stage, 'p1', 'p1')).toThrow();
  });

  it('handles a completed match — swaps in both slots and in winner field', () => {
    const stage = mkFinalStage();
    // Mark r1-m1 as completed with p1 winning
    stage.goldBracket.rounds[0].matches[0].status = 'COMPLETED';
    stage.goldBracket.rounds[0].matches[0].winner = 'p1';
    // Pre-fill final match as if p1 advanced
    stage.goldBracket.rounds[1].matches[0].participantA = 'p1';

    const result = swapBracketParticipants(stage, 'p1', 'p3');

    // The match that was p1 vs p4 → now p3 vs p4, winner also updated to p3
    const swappedMatch = result.goldBracket.rounds[0].matches[0];
    expect(swappedMatch.participantA).toBe('p3');
    expect(swappedMatch.winner).toBe('p3');

    // p1 appears in the other first-round match where p3 was
    expect(result.goldBracket.rounds[0].matches[1].participantB).toBe('p1');

    // The pre-filled final slot should also be updated
    expect(result.goldBracket.rounds[1].matches[0].participantA).toBe('p3');
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by the extended-coverage tests
// ---------------------------------------------------------------------------

/** Minimal bracket with a single completed match: A vs B, A won. */
function mkMinimalBracket(pA: string, pB: string): BracketWithConfig {
  return {
    totalRounds: 1,
    config: BRACKET_CONFIG,
    rounds: [
      {
        roundNumber: 1,
        name: 'Final',
        matches: [
          {
            id: 'm1',
            position: 0,
            participantA: pA,
            participantB: pB,
            status: 'COMPLETED',
            winner: pA,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Extended coverage
// ---------------------------------------------------------------------------

describe('swapBracketParticipants — extended coverage', () => {
  it('swaps inside silverBracket', () => {
    // Silver bracket: A vs B. Gold bracket needs both ids too — easiest: same
    // ids appear there so the fixture is valid (both ids present).
    const fs: FinalStage = {
      mode: 'SPLIT_DIVISIONS',
      isComplete: false,
      goldBracket: mkMinimalBracket('A', 'B'),
      silverBracket: mkMinimalBracket('A', 'B'),
    };

    const result = swapBracketParticipants(fs, 'A', 'B');

    // Silver bracket match: participantA was 'A' → now 'B', participantB was 'B' → now 'A'
    const silverMatch = result.silverBracket!.rounds[0].matches[0];
    expect(silverMatch.participantA).toBe('B');
    expect(silverMatch.participantB).toBe('A');
    expect(silverMatch.winner).toBe('B'); // winner was 'A', now 'B'

    // Gold bracket is also swapped (same ids)
    const goldMatch = result.goldBracket.rounds[0].matches[0];
    expect(goldMatch.participantA).toBe('B');
    expect(goldMatch.participantB).toBe('A');
  });

  it('swaps inside goldBracket.thirdPlaceMatch', () => {
    const thirdPlaceMatch = {
      id: 'tp1',
      position: 0,
      participantA: 'A',
      participantB: 'B',
      status: 'COMPLETED' as const,
      winner: 'A',
    };

    const base = mkMinimalBracket('A', 'B');
    const fs: FinalStage = {
      mode: 'SINGLE_BRACKET',
      isComplete: false,
      goldBracket: { ...base, thirdPlaceMatch },
    };

    const result = swapBracketParticipants(fs, 'A', 'B');

    const tp = result.goldBracket.thirdPlaceMatch!;
    expect(tp.participantA).toBe('B'); // was 'A'
    expect(tp.participantB).toBe('A'); // was 'B'
    expect(tp.winner).toBe('B');       // was 'A'

    // Ensure the regular round is also swapped (both ids move symmetrically)
    const r0 = result.goldBracket.rounds[0].matches[0];
    expect(r0.participantA).toBe('B');
    expect(r0.participantB).toBe('A');
  });

  it('swaps the FinalStage.winner field', () => {
    const fs: FinalStage = {
      mode: 'SINGLE_BRACKET',
      isComplete: true,
      goldBracket: mkMinimalBracket('A', 'B'),
      winner: 'A',
    };

    const result = swapBracketParticipants(fs, 'A', 'B');

    expect(result.winner).toBe('B'); // was 'A'
    // Sanity: silverWinner not present → stays undefined
    expect(result.silverWinner).toBeUndefined();
  });

  it('swaps the FinalStage.silverWinner field', () => {
    const fs: FinalStage = {
      mode: 'SPLIT_DIVISIONS',
      isComplete: true,
      goldBracket: mkMinimalBracket('A', 'X'),
      silverBracket: mkMinimalBracket('B', 'Y'),
      winner: 'A',
      silverWinner: 'B',
    };

    const result = swapBracketParticipants(fs, 'A', 'B');

    expect(result.winner).toBe('B');       // was 'A'
    expect(result.silverWinner).toBe('A'); // was 'B'

    // Gold bracket round had 'A' → now 'B'; silver bracket round had 'B' → now 'A'
    expect(result.goldBracket.rounds[0].matches[0].participantA).toBe('B');
    expect(result.silverBracket!.rounds[0].matches[0].participantA).toBe('A');
  });

  it('swaps NamedBracket.winner in parallelBrackets', () => {
    const namedBracket: NamedBracket = {
      id: 'nb-a',
      name: 'A Finals',
      label: 'A',
      bracket: mkMinimalBracket('A', 'B'),
      sourcePositions: [1, 2],
      winner: 'A',
    };

    const fs: FinalStage = {
      mode: 'PARALLEL_BRACKETS',
      isComplete: true,
      goldBracket: mkMinimalBracket('A', 'B'), // satisfies presence requirement
      parallelBrackets: [namedBracket],
      winner: 'A',
    };

    const result = swapBracketParticipants(fs, 'A', 'B');

    const nb = result.parallelBrackets![0];
    expect(nb.winner).toBe('B'); // was 'A'

    // The bracket inside the NamedBracket is also swapped
    const nbMatch = nb.bracket.rounds[0].matches[0];
    expect(nbMatch.participantA).toBe('B');
    expect(nbMatch.participantB).toBe('A');

    // Structural fields not related to ids are preserved
    expect(nb.id).toBe('nb-a');
    expect(nb.label).toBe('A');
    expect(nb.sourcePositions).toEqual([1, 2]);
  });

  it('swaps inside goldBracket.consolationBrackets', () => {
    const consolation: ConsolationBracket = {
      source: 'QF',
      totalRounds: 1,
      startPosition: 5,
      isComplete: false,
      rounds: [
        {
          roundNumber: 1,
          name: '5th Place',
          matches: [
            {
              id: 'c-m1',
              position: 0,
              participantA: 'A',
              participantB: 'B',
              status: 'COMPLETED',
              winner: 'A',
            },
          ],
        },
      ],
    };

    const base = mkMinimalBracket('A', 'B');
    const fs: FinalStage = {
      mode: 'SINGLE_BRACKET',
      isComplete: false,
      goldBracket: { ...base, consolationBrackets: [consolation] },
    };

    const result = swapBracketParticipants(fs, 'A', 'B');

    const cm = result.goldBracket.consolationBrackets![0].rounds[0].matches[0];
    expect(cm.participantA).toBe('B'); // was 'A'
    expect(cm.participantB).toBe('A'); // was 'B'
    expect(cm.winner).toBe('B');       // was 'A'

    // Consolation metadata is preserved
    expect(result.goldBracket.consolationBrackets![0].source).toBe('QF');
    expect(result.goldBracket.consolationBrackets![0].startPosition).toBe(5);
  });
});
