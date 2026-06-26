import { describe, it, expect } from 'vitest';
import { emptyBlock, addBlock, type CounterBlock, accumulateMatch, type RawMatch } from './playerStatsCore';

describe('CounterBlock helpers', () => {
  it('emptyBlock is all zeros', () => {
    const b = emptyBlock();
    expect(Object.values(b).every((v) => v === 0)).toBe(true);
    expect(b.matches).toBe(0);
    expect(b.hammerTwenties).toBe(0);
  });

  it('addBlock sums every field into the target (mutating)', () => {
    const a = emptyBlock();
    const b = emptyBlock();
    b.matches = 2; b.twenties = 5; b.koRounds = 3;
    addBlock(a, b);
    expect(a.matches).toBe(2);
    expect(a.twenties).toBe(5);
    expect(a.koRounds).toBe(3);
  });
});

describe('accumulateMatch (singles, perspective = participant id)', () => {
  const match: RawMatch = {
    participantA: 'pA', participantB: 'pB', winner: 'pA',
    totalPointsA: 8, totalPointsB: 4,
    rounds: [
      // game 1
      { gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 8, twentiesB: 3, hammer: 'pA' },
      { gameNumber: 1, roundInGame: 2, pointsA: 0, pointsB: 2, twentiesA: 2, twentiesB: 5, hammer: 'pB' },
      // game 2
      { gameNumber: 2, roundInGame: 1, pointsA: 1, pointsB: 1, twentiesA: 0, twentiesB: 0, hammer: 'pA' },
    ],
  };

  it('accumulates from A perspective', () => {
    const b = emptyBlock();
    const ctx = accumulateMatch(b, match, 'pA', 'group');
    expect(b.matches).toBe(1);
    expect(b.matchesWon).toBe(1);
    expect(b.games).toBe(2);
    expect(b.rounds).toBe(3);
    expect(b.roundsWon).toBe(1);              // r1 won (2>0); r2 lost; r3 tie
    expect(b.twenties).toBe(10);              // 8 + 2 + 0
    expect(b.roundsWithTwenty).toBe(2);       // r1, r2
    expect(b.perfectRounds).toBe(1);          // r1 = 8
    expect(b.hammerRounds).toBe(2);           // r1, r3
    expect(b.hammerTwenties).toBe(8);         // r1 (8) + r3 (0)
    expect(b.hammerRoundsWon).toBe(1);        // r1 won with hammer
    expect(b.nonHammerRounds).toBe(1);        // r2
    expect(b.nonHammerTwenties).toBe(2);
    expect(b.groupMatches).toBe(1);
    expect(b.groupRounds).toBe(3);
    expect(b.groupTwenties).toBe(10);
    expect(b.marginWins).toBe(1);
    expect(b.marginSum).toBe(4);              // 8 - 4
    expect(ctx.maxTwentiesInRound).toBe(8);
    expect(ctx.maxTwentiesInGame).toBe(10);   // game1: 8+2=10, game2: 0
  });

  it('accumulates from B perspective and tags ko/finals', () => {
    const b = emptyBlock();
    accumulateMatch(b, match, 'pB', 'final');
    expect(b.matchesWon).toBe(0);
    expect(b.twenties).toBe(8);               // 3 + 5 + 0
    expect(b.koMatches).toBe(1);
    expect(b.koRounds).toBe(3);
    expect(b.koTwenties).toBe(8);
    expect(b.finalsPlayed).toBe(1);
    expect(b.finalsWon).toBe(0);
    expect(b.marginWins).toBe(0);             // didn't win → no margin
  });
});
