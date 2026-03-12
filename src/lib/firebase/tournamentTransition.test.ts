import { describe, it, expect, vi } from 'vitest';

// Mock SvelteKit and Firebase dependencies (tournamentTransition.ts imports from config)
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn()
}));
vi.mock('./config', () => ({
  db: {},
  isFirebaseEnabled: () => true
}));
vi.mock('./tournaments', () => ({
  getTournament: vi.fn(),
  parseTournamentData: (data: unknown) => data
}));
vi.mock('./cleanUndefined', () => ({
  cleanUndefined: (data: unknown) => data
}));

const {
  calculateSuggestedQualifiers,
  calculateDefaultTopNPerGroup,
  calculateDefaultQualifierCount,
  isValidBracketSize,
  getBracketRoundNames
} = await import('./tournamentTransition');

describe('calculateSuggestedQualifiers', () => {
  it('returns 4 for 8 participants (half)', () => {
    expect(calculateSuggestedQualifiers(8).total).toBe(4);
  });

  it('returns 8 for 16 participants (half)', () => {
    expect(calculateSuggestedQualifiers(16).total).toBe(8);
  });

  it('returns 16 for 32 participants (half)', () => {
    expect(calculateSuggestedQualifiers(32).total).toBe(16);
  });

  it('returns 4 for 5-7 participants', () => {
    expect(calculateSuggestedQualifiers(5).total).toBe(4);
    expect(calculateSuggestedQualifiers(6).total).toBe(4);
    expect(calculateSuggestedQualifiers(7).total).toBe(4);
  });

  it('returns 4 for 9-15 participants (largest power of 2 <= half)', () => {
    expect(calculateSuggestedQualifiers(9).total).toBe(4);
    expect(calculateSuggestedQualifiers(10).total).toBe(4);
    expect(calculateSuggestedQualifiers(14).total).toBe(4);
    expect(calculateSuggestedQualifiers(15).total).toBe(4);
  });

  it('returns 8 for 17-31 participants', () => {
    expect(calculateSuggestedQualifiers(17).total).toBe(8);
    expect(calculateSuggestedQualifiers(20).total).toBe(8);
    expect(calculateSuggestedQualifiers(24).total).toBe(8);
    expect(calculateSuggestedQualifiers(31).total).toBe(8);
  });

  it('handles very small tournaments', () => {
    expect(calculateSuggestedQualifiers(2).total).toBe(2);
    expect(calculateSuggestedQualifiers(3).total).toBe(4);
  });

  it('calculates per-group correctly with multiple groups', () => {
    const result = calculateSuggestedQualifiers(16, 2);
    expect(result.total).toBe(8);
    expect(result.perGroup).toBe(4);
  });

  it('rounds per-group up for odd divisions', () => {
    const result = calculateSuggestedQualifiers(20, 3);
    expect(result.perGroup).toBe(Math.ceil(result.total / 3));
  });
});

describe('calculateDefaultTopNPerGroup', () => {
  describe('SINGLE_BRACKET with single group — selects all', () => {
    it('selects all 14 participants', () => {
      expect(calculateDefaultTopNPerGroup(14, 1, 'SINGLE_BRACKET')).toBe(14);
    });

    it('selects all 8 participants', () => {
      expect(calculateDefaultTopNPerGroup(8, 1, 'SINGLE_BRACKET')).toBe(8);
    });

    it('selects all 20 participants', () => {
      expect(calculateDefaultTopNPerGroup(20, 1, 'SINGLE_BRACKET')).toBe(20);
    });
  });

  describe('SPLIT_DIVISIONS single group — minimum 8 total qualifiers', () => {
    it('selects 8 when half < 8 (14 players)', () => {
      // half = 7, but minimum is 8
      expect(calculateDefaultTopNPerGroup(14, 1, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('selects 8 when half < 8 (12 players)', () => {
      // half = 6, but minimum is 8
      expect(calculateDefaultTopNPerGroup(12, 1, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('selects 8 when half < 8 (10 players)', () => {
      // half = 5, but minimum is 8
      expect(calculateDefaultTopNPerGroup(10, 1, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('selects 8 when half < 8 (9 players)', () => {
      // half = ceil(9/2) = 5, but minimum is 8
      expect(calculateDefaultTopNPerGroup(9, 1, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('caps at 8 when > 16 participants per group (20 players)', () => {
      // 20 > 16, cap at 8
      expect(calculateDefaultTopNPerGroup(20, 1, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('selects 8 when half equals 8 (16 players)', () => {
      expect(calculateDefaultTopNPerGroup(16, 1, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('caps at 8 per group when > 16 participants per group', () => {
      // 34 per group > 16, cap at 8
      expect(calculateDefaultTopNPerGroup(34, 1, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('selects all if fewer than 8 exist (6 players)', () => {
      // Can't select 8 from 6, so min(8, 6) = 6
      expect(calculateDefaultTopNPerGroup(6, 1, 'SPLIT_DIVISIONS')).toBe(6);
    });

    it('selects all if fewer than 8 exist (4 players)', () => {
      expect(calculateDefaultTopNPerGroup(4, 1, 'SPLIT_DIVISIONS')).toBe(4);
    });
  });

  describe('SPLIT_DIVISIONS with multiple groups', () => {
    it('ensures 8 total across 2 groups (12 players)', () => {
      // 6 per group, half = 3, min per group = ceil(8/2) = 4
      const perGroup = calculateDefaultTopNPerGroup(12, 2, 'SPLIT_DIVISIONS');
      expect(perGroup).toBe(4); // 4 * 2 = 8 total
    });

    it('ensures 8 total across 2 groups (14 players)', () => {
      // 7 per group, half = 4, min per group = ceil(8/2) = 4
      const perGroup = calculateDefaultTopNPerGroup(14, 2, 'SPLIT_DIVISIONS');
      expect(perGroup).toBe(4);
    });

    it('uses half when it exceeds minimum (20 players, 2 groups)', () => {
      // 10 per group, half = 5, min per group = 4
      expect(calculateDefaultTopNPerGroup(20, 2, 'SPLIT_DIVISIONS')).toBe(5);
    });

    it('caps at participants when not enough (6 players, 2 groups)', () => {
      // 3 per group, min(ceil(8/2), 3) = min(4, 3) = 3
      expect(calculateDefaultTopNPerGroup(6, 2, 'SPLIT_DIVISIONS')).toBe(3);
    });

    it('handles 3 groups (18 players)', () => {
      // 6 per group, half = 3, min per group = ceil(8/3) = 3
      expect(calculateDefaultTopNPerGroup(18, 3, 'SPLIT_DIVISIONS')).toBe(3);
    });

    it('handles 4 groups (24 players)', () => {
      // 6 per group, half = 3, min per group = ceil(8/4) = 2
      expect(calculateDefaultTopNPerGroup(24, 4, 'SPLIT_DIVISIONS')).toBe(3);
    });
  });

  describe('SINGLE_BRACKET with multiple groups — minimum 8 total', () => {
    it('ensures 8 total (12 players, 2 groups)', () => {
      // 6 per group, half = 3, min per group = 4
      expect(calculateDefaultTopNPerGroup(12, 2, 'SINGLE_BRACKET')).toBe(4);
    });

    it('ensures 8 total (10 players, 2 groups)', () => {
      // 5 per group, half = 3, min per group = min(4, 5) = 4
      expect(calculateDefaultTopNPerGroup(10, 2, 'SINGLE_BRACKET')).toBe(4);
    });

    it('uses half when it exceeds minimum (20 players, 2 groups)', () => {
      // 10 per group, half = 5, min per group = 4
      expect(calculateDefaultTopNPerGroup(20, 2, 'SINGLE_BRACKET')).toBe(5);
    });

    it('caps at participants when not enough (6 players, 2 groups)', () => {
      // 3 per group, min(4, 3) = 3
      expect(calculateDefaultTopNPerGroup(6, 2, 'SINGLE_BRACKET')).toBe(3);
    });

    it('uses half for large tournaments (30 players, 2 groups)', () => {
      // 15 per group, half = 8, min = 4
      expect(calculateDefaultTopNPerGroup(30, 2, 'SINGLE_BRACKET')).toBe(8);
    });
  });

  describe('custom minQualifiers parameter', () => {
    it('respects custom minimum of 4 (half already >= 4)', () => {
      // 14 players, 1 group, SPLIT_DIV, min=4 → half=7 >= 4, use 7
      expect(calculateDefaultTopNPerGroup(14, 1, 'SPLIT_DIVISIONS', 4)).toBe(7);
    });

    it('respects custom minimum of 16', () => {
      // 14 players, 1 group, SPLIT_DIV, min=16 → half=7, min(16,14)=14, max(7,14)=14
      expect(calculateDefaultTopNPerGroup(14, 1, 'SPLIT_DIVISIONS', 16)).toBe(14);
    });

    it('custom minimum does not affect SINGLE_BRACKET single group', () => {
      expect(calculateDefaultTopNPerGroup(14, 1, 'SINGLE_BRACKET', 4)).toBe(14);
    });
  });
});

describe('calculateDefaultQualifierCount', () => {
  describe('SPLIT_DIVISIONS mode — minimum 8', () => {
    it('returns 8 when half < 8 (14 standings)', () => {
      expect(calculateDefaultQualifierCount(14, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('returns 8 when half < 8 (12 standings)', () => {
      expect(calculateDefaultQualifierCount(12, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('returns 8 when half < 8 (10 standings)', () => {
      expect(calculateDefaultQualifierCount(10, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('caps at 8 when > 16 standings (20 standings)', () => {
      // 20 > 16, cap at 8
      expect(calculateDefaultQualifierCount(20, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('returns 8 when half equals 8 (16 standings)', () => {
      expect(calculateDefaultQualifierCount(16, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('caps at 8 for > 16 standings', () => {
      expect(calculateDefaultQualifierCount(34, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('caps at 8 for 18 standings (> 16)', () => {
      // 18 > 16, cap at 8
      expect(calculateDefaultQualifierCount(18, 'SPLIT_DIVISIONS')).toBe(8);
    });

    it('returns all when fewer than 8 exist', () => {
      expect(calculateDefaultQualifierCount(6, 'SPLIT_DIVISIONS')).toBe(6);
      expect(calculateDefaultQualifierCount(4, 'SPLIT_DIVISIONS')).toBe(4);
      expect(calculateDefaultQualifierCount(2, 'SPLIT_DIVISIONS')).toBe(2);
    });
  });

  describe('ALL mode (single bracket single group)', () => {
    it('returns all standings', () => {
      expect(calculateDefaultQualifierCount(14, 'ALL')).toBe(14);
      expect(calculateDefaultQualifierCount(8, 'ALL')).toBe(8);
    });
  });

  describe('custom minQualifiers', () => {
    it('respects custom minimum of 4 (half >= 4)', () => {
      // 12 standings, half = 6 >= 4, use half
      expect(calculateDefaultQualifierCount(12, 'SPLIT_DIVISIONS', 4)).toBe(6);
    });

    it('respects custom minimum of 16', () => {
      // 14 standings, half = 7, min(16,14) = 14, max(7,14) = 14
      expect(calculateDefaultQualifierCount(14, 'SPLIT_DIVISIONS', 16)).toBe(14);
    });
  });
});

describe('isValidBracketSize', () => {
  it('accepts any number >= 2', () => {
    expect(isValidBracketSize(2)).toBe(true);
    expect(isValidBracketSize(3)).toBe(true);
    expect(isValidBracketSize(8)).toBe(true);
    expect(isValidBracketSize(16)).toBe(true);
  });

  it('rejects numbers < 2', () => {
    expect(isValidBracketSize(1)).toBe(false);
    expect(isValidBracketSize(0)).toBe(false);
  });
});

describe('getBracketRoundNames', () => {
  it('returns correct names for 8 participants', () => {
    const names = getBracketRoundNames(8);
    expect(names).toContain('quarterfinals');
    expect(names).toContain('semifinals');
    expect(names).toContain('finals');
  });

  it('returns correct names for 4 participants', () => {
    const names = getBracketRoundNames(4);
    expect(names).toContain('semifinals');
    expect(names).toContain('finals');
  });

  it('returns correct names for 2 participants', () => {
    const names = getBracketRoundNames(2);
    expect(names).toContain('finals');
  });
});
