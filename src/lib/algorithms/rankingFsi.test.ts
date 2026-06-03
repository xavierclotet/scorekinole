import { describe, it, expect } from 'vitest';
import {
  calculateFsi,
  calculateFsiWinnerPoints,
  calculateFsiRankingPoints,
  getFsiTierFloor,
} from './rankingFsi';
import { calculateRankingPoints, distributeRankingPoints } from './ranking';
import type { TournamentTier } from '$lib/types/tournament';

// Helper: build a field of N players all with the same ranking snapshot
const field = (n: number, snapshot: number) =>
  Array.from({ length: n }, () => ({ rankingSnapshot: snapshot }));

describe('calculateFsi', () => {
  it('returns 0 for empty participants', () => {
    expect(calculateFsi([])).toBe(0);
  });

  it('uses only top 10 for avgTop10 when more than 10 players', () => {
    const strong = Array.from({ length: 10 }, () => ({ rankingSnapshot: 30 }));
    const weak = Array.from({ length: 10 }, () => ({ rankingSnapshot: 0 }));
    // avgTop10 = 30, avgAll = 15, sizeBonus = min(20/20,1)*10 = 10
    // fsi = 0.6*30 + 0.3*15 + 0.1*10 = 18 + 4.5 + 1 = 23.5
    expect(calculateFsi([...strong, ...weak])).toBeCloseTo(23.5);
  });

  it('size bonus caps at 10 for >=20 players', () => {
    const participants = Array.from({ length: 20 }, () => ({ rankingSnapshot: 20 }));
    // avgTop10 = 20, avgAll = 20, sizeBonus = 10
    // fsi = 0.6*20 + 0.3*20 + 0.1*10 = 12 + 6 + 1 = 19
    expect(calculateFsi(participants)).toBeCloseTo(19);
  });

  it('size bonus is proportional below 20 players', () => {
    const participants = Array.from({ length: 10 }, () => ({ rankingSnapshot: 20 }));
    // avgTop10 = 20, avgAll = 20, sizeBonus = min(10/20,1)*10 = 5
    // fsi = 0.6*20 + 0.3*20 + 0.1*5 = 12 + 6 + 0.5 = 18.5
    expect(calculateFsi(participants)).toBeCloseTo(18.5);
  });

  it('uses all players as top group when fewer than 10', () => {
    const participants = [
      { rankingSnapshot: 30 },
      { rankingSnapshot: 20 },
      { rankingSnapshot: 10 },
    ];
    // avgTop10 = avgAll = (30+20+10)/3 = 20, sizeBonus = min(3/20,1)*10 = 1.5
    // fsi = 0.6*20 + 0.3*20 + 0.1*1.5 = 12 + 6 + 0.15 = 18.15
    expect(calculateFsi(participants)).toBeCloseTo(18.15);
  });
});

describe('calculateFsiWinnerPoints', () => {
  it('returns tier floor when FSI is zero', () => {
    const weakField = Array.from({ length: 3 }, () => ({ rankingSnapshot: 0 }));
    expect(calculateFsiWinnerPoints(weakField, 'SERIES_15')).toBe(12);
    expect(calculateFsiWinnerPoints(weakField, 'SERIES_25')).toBe(18);
    expect(calculateFsiWinnerPoints(weakField, 'SERIES_35')).toBe(25);
  });

  it('exceeds floor when FSI is high', () => {
    // 20 players all with rankingSnapshot = 30
    // avgTop10 = 30, avgAll = 30, sizeBonus = 10
    // fsi = 0.6*30 + 0.3*30 + 0.1*10 = 18 + 9 + 1 = 28
    // SERIES_15 floor = 12 → winner gets max(12, 28) = 28
    const strongField = Array.from({ length: 20 }, () => ({ rankingSnapshot: 30 }));
    expect(calculateFsiWinnerPoints(strongField, 'SERIES_15')).toBe(28);
  });

  it('rounds FSI to nearest integer', () => {
    // 3 players: snapshots 30, 20, 10 → fsi ≈ 18.15 → round = 18
    // SERIES_15 floor = 12 → winner gets max(12, 18) = 18
    const participants = [
      { rankingSnapshot: 30 },
      { rankingSnapshot: 20 },
      { rankingSnapshot: 10 },
    ];
    expect(calculateFsiWinnerPoints(participants, 'SERIES_15')).toBe(18);
  });
});

describe('calculateFsiRankingPoints', () => {
  it('position 1 gets winner points (tier floor)', () => {
    const participants = Array.from({ length: 3 }, () => ({ rankingSnapshot: 0 }));
    expect(calculateFsiRankingPoints(1, participants, 'SERIES_15', 3)).toBe(12);
  });

  it('points decrease monotonically through all positions', () => {
    const participants = Array.from({ length: 10 }, () => ({ rankingSnapshot: 25 }));
    const pts: number[] = [];
    for (let pos = 1; pos <= 10; pos++) {
      pts.push(calculateFsiRankingPoints(pos, participants, 'SERIES_25', 10));
    }
    for (let i = 0; i < pts.length - 1; i++) {
      expect(pts[i]).toBeGreaterThanOrEqual(pts[i + 1]);
    }
  });

  it('last place gets at least 1 point', () => {
    const participants = Array.from({ length: 10 }, () => ({ rankingSnapshot: 10 }));
    const last = calculateFsiRankingPoints(10, participants, 'SERIES_15', 10);
    expect(last).toBeGreaterThanOrEqual(1);
  });

  it('position beyond participant count returns 0', () => {
    const participants = Array.from({ length: 5 }, () => ({ rankingSnapshot: 10 }));
    expect(calculateFsiRankingPoints(6, participants, 'SERIES_15', 5)).toBe(0);
  });

  it('doubles mode applies doubles drop curve', () => {
    const participants = Array.from({ length: 8 }, () => ({ rankingSnapshot: 0 }));
    const pos2singles = calculateFsiRankingPoints(2, participants, 'SERIES_15', 8, 'singles');
    const pos2doubles = calculateFsiRankingPoints(2, participants, 'SERIES_15', 8, 'doubles');
    // Doubles has bigger drop at pos2 (5 vs 3), so pos2 doubles earns fewer points
    expect(pos2doubles).toBeLessThanOrEqual(pos2singles);
  });
});

describe('getFsiTierFloor', () => {
  it('returns correct floors for each tier', () => {
    expect(getFsiTierFloor('SERIES_15')).toBe(12);
    expect(getFsiTierFloor('SERIES_25')).toBe(18);
    expect(getFsiTierFloor('SERIES_35')).toBe(25);
  });
});

describe('FSI edge cases', () => {
  it('top10 picks the 10 HIGHEST, not the first 10 in array order', () => {
    // 9 weak listed first, then 1 very strong, then enough to exceed 10 total
    const field = [
      ...Array.from({ length: 10 }, () => ({ rankingSnapshot: 5 })),
      { rankingSnapshot: 100 }, // 11th, strongest — must be included in top10
    ];
    // Sorted desc: [100, 5×9 in top10] → avgTop10 = (100 + 5*9)/10 = 14.5
    // avgAll = (100 + 5*10)/11 = 150/11 ≈ 13.636
    // sizeBonus = min(11/20,1)*10 = 5.5
    // fsi = 0.6*14.5 + 0.3*13.636 + 0.1*5.5 = 8.7 + 4.0909 + 0.55 ≈ 13.34
    expect(calculateFsi(field)).toBeCloseTo(13.34, 1);
  });

  it('boundary: 10 vs 11 participants changes avgTop10 (11th is dropped)', () => {
    const ten = Array.from({ length: 10 }, () => ({ rankingSnapshot: 30 }));
    const elevenWithWeak = [...ten, { rankingSnapshot: 0 }];
    // With 10: avgTop10 = 30. With 11: the 0 is dropped from top10, avgTop10 still 30,
    // but avgAll drops and sizeBonus rises slightly.
    const fsi10 = calculateFsi(ten);
    const fsi11 = calculateFsi(elevenWithWeak);
    // avgTop10 unchanged (weak 11th excluded); the change comes only from avgAll + sizeBonus
    expect(fsi11).toBeLessThan(fsi10); // weaker average field overall
  });

  it('mixed field with guests (rankingSnapshot 0) — realistic wizard case', () => {
    // 4 ranked players + 4 guests
    const field = [
      { rankingSnapshot: 40 },
      { rankingSnapshot: 30 },
      { rankingSnapshot: 20 },
      { rankingSnapshot: 10 },
      { rankingSnapshot: 0 },
      { rankingSnapshot: 0 },
      { rankingSnapshot: 0 },
      { rankingSnapshot: 0 },
    ];
    // avgTop10 = avgAll = 100/8 = 12.5, sizeBonus = min(8/20,1)*10 = 4
    // fsi = 0.6*12.5 + 0.3*12.5 + 0.1*4 = 7.5 + 3.75 + 0.4 = 11.65
    expect(calculateFsi(field)).toBeCloseTo(11.65);
    // round(11.65)=12 = SERIES_15 floor (12) → winner gets 12
    expect(calculateFsiWinnerPoints(field, 'SERIES_15')).toBe(12);
  });

  it('single participant does not divide by zero', () => {
    const field = [{ rankingSnapshot: 50 }];
    // avgTop10 = avgAll = 50, sizeBonus = min(1/20,1)*10 = 0.5
    // fsi = 0.6*50 + 0.3*50 + 0.1*0.5 = 30 + 15 + 0.05 = 45.05
    expect(calculateFsi(field)).toBeCloseTo(45.05);
    expect(calculateFsiWinnerPoints(field, 'SERIES_35')).toBe(45); // 45 > floor 25
  });

  it('size bonus boundary: 19 vs 20 vs 21 participants', () => {
    const make = (n: number) => Array.from({ length: n }, () => ({ rankingSnapshot: 0 }));
    // Only size bonus contributes (all ranks 0): fsi = 0.1 * sizeBonus
    expect(calculateFsi(make(19))).toBeCloseTo(0.1 * (19 / 20) * 10); // 0.95
    expect(calculateFsi(make(20))).toBeCloseTo(1.0); // capped: 0.1 * 10
    expect(calculateFsi(make(21))).toBeCloseTo(1.0); // still capped at 10
  });

  it('winner points never drop below the tier floor even with a weak field', () => {
    // Weak field (fsi ≈ 1) → floor is the true minimum for each tier
    const weak = Array.from({ length: 5 }, () => ({ rankingSnapshot: 1 }));
    expect(calculateFsiWinnerPoints(weak, 'SERIES_35')).toBe(25);
    expect(calculateFsiWinnerPoints(weak, 'SERIES_25')).toBe(18);
    expect(calculateFsiWinnerPoints(weak, 'SERIES_15')).toBe(12);
  });

  it('position 1 EXCEEDS the floor when the field is strong (must not be pinned to floor)', () => {
    // Regression guard: the winner distribution must be driven by the FSI winner points,
    // not by the tier floor. A strong field (fsi well above floor) gives the winner > floor.
    const strong = Array.from({ length: 12 }, () => ({ rankingSnapshot: 35 }));
    const floor = getFsiTierFloor('SERIES_15'); // 12
    const winner = calculateFsiRankingPoints(1, strong, 'SERIES_15', 12);
    expect(winner).toBeGreaterThan(floor);
    // And it equals the FSI-derived winner points, not the floor
    expect(winner).toBe(calculateFsiWinnerPoints(strong, 'SERIES_15'));
  });

  it('distribution from FSI winner points is monotonic and ends at >= 1', () => {
    const descending = Array.from({ length: 16 }, (_, i) => ({ rankingSnapshot: 50 - i }));
    const pts: number[] = [];
    for (let pos = 1; pos <= 16; pos++) {
      pts.push(calculateFsiRankingPoints(pos, descending, 'SERIES_25', 16));
    }
    for (let i = 0; i < pts.length - 1; i++) {
      expect(pts[i]).toBeGreaterThanOrEqual(pts[i + 1]);
    }
    expect(pts[15]).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────
// FSI formula breakdown — verify each weighted term
// ─────────────────────────────────────────────────
describe('calculateFsi — formula breakdown', () => {
  it('is purely the size bonus term when all rankings are 0', () => {
    // fsi = 0.6*0 + 0.3*0 + 0.1*sizeBonus
    expect(calculateFsi(field(10, 0))).toBeCloseTo(0.1 * (10 / 20) * 10); // 0.5
    expect(calculateFsi(field(20, 0))).toBeCloseTo(0.1 * 10);             // 1.0 (capped)
    expect(calculateFsi(field(40, 0))).toBeCloseTo(0.1 * 10);             // 1.0 (still capped)
  });

  it('weights are 0.6 / 0.3 / 0.1 — uniform field of value V with N>=20', () => {
    // avgTop10 = avgAll = V, sizeBonus = 10 → fsi = 0.6V + 0.3V + 1.0 = 0.9V + 1
    for (const V of [10, 20, 30]) {
      expect(calculateFsi(field(20, V))).toBeCloseTo(0.9 * V + 1);
    }
  });

  it('is independent of participant ordering', () => {
    const a = [{ rankingSnapshot: 5 }, { rankingSnapshot: 40 }, { rankingSnapshot: 18 }];
    const b = [{ rankingSnapshot: 18 }, { rankingSnapshot: 5 }, { rankingSnapshot: 40 }];
    expect(calculateFsi(a)).toBeCloseTo(calculateFsi(b));
  });

  it('avgTop10 ignores everyone beyond the top 10', () => {
    // 10 strong (50) + 50 zeros: avgTop10 = 50 regardless of how many zeros follow
    const f = [...field(10, 50), ...field(50, 0)];
    const avgTop10 = 50;
    const avgAll = (10 * 50) / 60;
    const sizeBonus = 10; // 60 >= 20
    expect(calculateFsi(f)).toBeCloseTo(0.6 * avgTop10 + 0.3 * avgAll + 0.1 * sizeBonus);
  });
});

// ─────────────────────────────────────────────────
// Winner points — rounding boundaries around the floor
// ─────────────────────────────────────────────────
describe('calculateFsiWinnerPoints — rounding & floor boundary', () => {
  // For a uniform field of N>=20: fsi = 0.9V + 1. Pick V so fsi lands just under/over a value.
  it('rounds fsi to nearest integer before applying the floor', () => {
    // V such that fsi = 0.9V + 1 is fractional. V=15 → fsi=14.5 → round=15 (>=floor 12)
    expect(calculateFsiWinnerPoints(field(20, 15), 'SERIES_15')).toBe(15);
    // V=14 → fsi=0.9*14+1=13.6 → round=14
    expect(calculateFsiWinnerPoints(field(20, 14), 'SERIES_15')).toBe(14);
  });

  it('applies the floor when rounded fsi is just below it', () => {
    // SERIES_15 floor=12. Need fsi < 11.5 to round below 12.
    // V=11 → fsi=0.9*11+1=10.9 → round=11 < 12 → floor 12
    expect(calculateFsiWinnerPoints(field(20, 11), 'SERIES_15')).toBe(12);
    // V=12 → fsi=0.9*12+1=11.8 → round=12 = floor → 12
    expect(calculateFsiWinnerPoints(field(20, 12), 'SERIES_15')).toBe(12);
    // V=13 → fsi=0.9*13+1=12.7 → round=13 > floor → 13
    expect(calculateFsiWinnerPoints(field(20, 13), 'SERIES_15')).toBe(13);
  });

  it('each tier floor is the hard minimum', () => {
    const tiers: { tier: TournamentTier; floor: number }[] = [
      { tier: 'SERIES_15', floor: 12 },
      { tier: 'SERIES_25', floor: 18 },
      { tier: 'SERIES_35', floor: 25 },
    ];
    for (const { tier, floor } of tiers) {
      expect(calculateFsiWinnerPoints(field(4, 0), tier)).toBe(floor);
      expect(calculateFsiWinnerPoints([], tier)).toBe(floor);
    }
  });
});

// ─────────────────────────────────────────────────
// Consistency: calculateFsiRankingPoints == distribute(winnerPoints)
// ─────────────────────────────────────────────────
describe('calculateFsiRankingPoints — consistency with the building blocks', () => {
  it('equals distributeRankingPoints(pos, fsiWinnerPoints, ...) for every position', () => {
    const f = Array.from({ length: 14 }, (_, i) => ({ rankingSnapshot: 40 - i * 2 }));
    const winner = calculateFsiWinnerPoints(f, 'SERIES_25');
    for (let pos = 1; pos <= 14; pos++) {
      expect(calculateFsiRankingPoints(pos, f, 'SERIES_25', 14)).toBe(
        distributeRankingPoints(pos, winner, 14, 'singles')
      );
    }
  });

  it('doubles uses the doubles drop curve', () => {
    const f = field(8, 20);
    const winner = calculateFsiWinnerPoints(f, 'SERIES_25');
    for (let pos = 1; pos <= 8; pos++) {
      expect(calculateFsiRankingPoints(pos, f, 'SERIES_25', 8, 'doubles')).toBe(
        distributeRankingPoints(pos, winner, 8, 'doubles')
      );
    }
  });
});

// ─────────────────────────────────────────────────
// Calibration vs the CLASSIC system (design intent)
// ─────────────────────────────────────────────────
describe('FSI vs CLASSIC calibration', () => {
  const tiers: { tier: TournamentTier; classicMax: number }[] = [
    { tier: 'SERIES_15', classicMax: 15 },
    { tier: 'SERIES_25', classicMax: 25 },
    { tier: 'SERIES_35', classicMax: 35 },
  ];

  it('every FSI floor sits BELOW the classic max for the same tier', () => {
    for (const { tier, classicMax } of tiers) {
      expect(getFsiTierFloor(tier)).toBeLessThan(classicMax);
    }
  });

  it('a weak field gives the winner LESS than the classic winner', () => {
    // Classic winner at full threshold vs FSI floor on a weak (all-guest) field
    for (const { tier, classicMax } of tiers) {
      const fsiWeak = calculateFsiWinnerPoints(field(16, 0), tier);
      expect(fsiWeak).toBeLessThan(classicMax);
    }
  });

  it('a strong field can give the winner MORE than the classic max', () => {
    // Field of strong players (high snapshots) pushes FSI above the classic ceiling
    const strong = field(20, 40);
    for (const { tier, classicMax } of tiers) {
      expect(calculateFsiWinnerPoints(strong, tier)).toBeGreaterThan(classicMax);
    }
  });
});

// ─────────────────────────────────────────────────
// Realistic field scenarios (documented expectations)
// ─────────────────────────────────────────────────
describe('FSI realistic scenarios', () => {
  it('weak/local field (avg ~13) stays at or near the SERIES_15 floor', () => {
    const weak = field(12, 13);
    const winner = calculateFsiWinnerPoints(weak, 'SERIES_15');
    // fsi = 0.9*13 + 0.1*(12/20*10) = 11.7 + 0.6 = 12.3 → round 12 = floor
    expect(winner).toBe(12);
  });

  it('regional field (avg ~25) clearly beats the SERIES_15 floor', () => {
    const regional = field(16, 25);
    const winner = calculateFsiWinnerPoints(regional, 'SERIES_15');
    // fsi = 0.9*25 + 0.1*(16/20*10) = 22.5 + 0.8 = 23.3 → 23 > floor 12
    expect(winner).toBe(23);
  });

  it('mixed field: strong core + guests lands between floor and strong-field value', () => {
    const mixed = [...field(6, 35), ...field(10, 0)]; // 6 strong + 10 guests
    const winner = calculateFsiWinnerPoints(mixed, 'SERIES_25');
    const floor = getFsiTierFloor('SERIES_25'); // 18
    const allStrong = calculateFsiWinnerPoints(field(16, 35), 'SERIES_25');
    expect(winner).toBeGreaterThanOrEqual(floor);
    expect(winner).toBeLessThan(allStrong);
  });

  it('adding strong players never decreases the winner points', () => {
    let prev = calculateFsiWinnerPoints(field(2, 30), 'SERIES_25');
    for (let n = 3; n <= 20; n++) {
      const cur = calculateFsiWinnerPoints(field(n, 30), 'SERIES_25');
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});
