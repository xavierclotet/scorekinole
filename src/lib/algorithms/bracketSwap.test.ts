import { describe, it, expect } from 'vitest';
import { swapBracketParticipants } from './bracketSwap';
import type { FinalStage, BracketWithConfig } from '$lib/types/tournament';

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

  it('is a no-op when neither id appears in the bracket', () => {
    const stage = mkFinalStage();
    const result = swapBracketParticipants(stage, 'x99', 'x100');

    expect(result).toEqual(stage);
  });

  it('is a no-op when only one id appears (nothing to swap with)', () => {
    const stage = mkFinalStage();
    const result = swapBracketParticipants(stage, 'p1', 'x99');

    // p1 must remain in its original slot
    expect(result.goldBracket.rounds[0].matches[0].participantA).toBe('p1');
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
