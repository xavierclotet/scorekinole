import { describe, it, expect } from 'vitest';
import { emptyBlock, addBlock, type CounterBlock } from './playerStatsCore';

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
