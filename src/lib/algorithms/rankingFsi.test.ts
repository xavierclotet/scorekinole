import { describe, it, expect } from 'vitest';
import {
  calculateFsi,
  calculateFsiWinnerPoints,
  calculateFsiRankingPoints,
  getFsiTierFloor,
} from './rankingFsi';

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
    expect(calculateFsiWinnerPoints(weakField, 'SERIES_15')).toBe(20);
    expect(calculateFsiWinnerPoints(weakField, 'SERIES_25')).toBe(30);
    expect(calculateFsiWinnerPoints(weakField, 'SERIES_35')).toBe(40);
  });

  it('exceeds floor when FSI is high', () => {
    // 20 players all with rankingSnapshot = 30
    // avgTop10 = 30, avgAll = 30, sizeBonus = 10
    // fsi = 0.6*30 + 0.3*30 + 0.1*10 = 18 + 9 + 1 = 28
    // SERIES_15 floor = 20 → winner gets max(20, 28) = 28
    const strongField = Array.from({ length: 20 }, () => ({ rankingSnapshot: 30 }));
    expect(calculateFsiWinnerPoints(strongField, 'SERIES_15')).toBe(28);
  });

  it('rounds FSI to nearest integer', () => {
    // 3 players: snapshots 30, 20, 10 → fsi ≈ 18.15 → round = 18
    // SERIES_15 floor = 20 → winner gets max(20, 18) = 20
    const participants = [
      { rankingSnapshot: 30 },
      { rankingSnapshot: 20 },
      { rankingSnapshot: 10 },
    ];
    expect(calculateFsiWinnerPoints(participants, 'SERIES_15')).toBe(20);
  });
});

describe('calculateFsiRankingPoints', () => {
  it('position 1 gets winner points (tier floor)', () => {
    const participants = Array.from({ length: 3 }, () => ({ rankingSnapshot: 0 }));
    expect(calculateFsiRankingPoints(1, participants, 'SERIES_15', 3)).toBe(20);
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
    expect(getFsiTierFloor('SERIES_15')).toBe(20);
    expect(getFsiTierFloor('SERIES_25')).toBe(30);
    expect(getFsiTierFloor('SERIES_35')).toBe(40);
  });
});
