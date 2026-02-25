/**
 * Tournament ranking points calculation
 * Crokinole Series point system with interpolation
 */

import type { TournamentTier } from '$lib/types/tournament';

/**
 * Tier information
 */
export interface TierInfo {
  name: string;
  description: string;
  basePoints: number;
  minPlayers?: number;
  minPlayersStrict?: boolean;
}

/**
 * Get tier info based on tier type
 */
export function getTierInfo(tier: TournamentTier): TierInfo {
  const tiers: Record<TournamentTier, TierInfo> = {
    SERIES_35: { name: 'Series 35', description: 'Campeonato de España o torneos masivos', basePoints: 35 },
    SERIES_25: { name: 'Series 25', description: 'Torneos regionales', basePoints: 25 },
    SERIES_15: { name: 'Series 15', description: 'Torneos locales y de clubes', basePoints: 15 }
  };
  return tiers[tier];
}

/**
 * Get all tiers info for display
 */
export function getAllTiers(): { tier: TournamentTier; info: TierInfo }[] {
  return [
    { tier: 'SERIES_35', info: getTierInfo('SERIES_35') },
    { tier: 'SERIES_25', info: getTierInfo('SERIES_25') },
    { tier: 'SERIES_15', info: getTierInfo('SERIES_15') }
  ];
}

/**
 * Threshold: participant count at which the winner receives full basePoints.
 * Below threshold, winnerPoints is scaled by N/threshold.
 *
 * Singles: threshold = basePoints - 5
 * Doubles: threshold = basePoints (fewer points than singles for same N)
 */
export function getNaturalThreshold(basePoints: number, mode: 'singles' | 'doubles' = 'singles'): number {
  if (mode === 'singles') return basePoints - 5;
  // Doubles: higher threshold so doubles gives fewer points than singles for same N.
  // At threshold = basePoints, winner gets exactly N points (N = team count).
  return basePoints;
}

/**
 * Calculate ranking points.
 *
 * Winner gets round(basePoints * min(1, N/threshold)) points.
 * Always uses interpolation (Hamilton or level fill) to spread points from winner to 1.
 *
 * @param position Final position (1 = winner)
 * @param tier Tournament series (SERIES_35, SERIES_25, SERIES_15)
 * @param participantsCount Number of participating teams/players (default 16)
 * @param mode Game mode: 'singles' or 'doubles' (default 'singles')
 * @returns Points earned
 */
export function calculateRankingPoints(
  position: number,
  tier: TournamentTier,
  participantsCount: number = 16,
  mode: 'singles' | 'doubles' = 'singles'
): number {
  const tierInfo = getTierInfo(tier);
  const basePoints = tierInfo.basePoints;
  const threshold = getNaturalThreshold(basePoints, mode);

  const winnerPoints = Math.round(basePoints * Math.min(1, participantsCount / threshold));

  if (position === 1) return winnerPoints;
  if (position > participantsCount) return 0;
  if (winnerPoints <= 1) return 1;

  // Build the standard drop curve
  const standardDrops: number[] = [];
  for (let i = 2; i <= participantsCount; i++) {
    if (mode === 'singles') {
      if (i === 2) standardDrops.push(3);
      else if (i <= 5) standardDrops.push(2);
      else standardDrops.push(1);
    } else {
      if (i === 2) standardDrops.push(5);
      else if (i === 3) standardDrops.push(4);
      else standardDrops.push(2);
    }
  }

  // Always interpolate: spread points from winnerPoints to 1
  // (At threshold, standard drops sum exactly to winnerPoints-1, so interpolation = raw drops)
  const targetDrop = winnerPoints - 1;
  const totalStandardDrop = standardDrops.reduce((acc, val) => acc + val, 0);

  let actualDrops: number[];

  if (totalStandardDrop > targetDrop) {
    // Hamilton (largest remainder): reduce drops proportionally
    const scale = targetDrop / totalStandardDrop;
    const idealDrops = standardDrops.map(d => d * scale);
    const floorDrops = idealDrops.map(d => Math.floor(d));
    let remaining = targetDrop - floorDrops.reduce((acc, val) => acc + val, 0);

    const remainders = idealDrops.map((d, i) => ({ i, rem: d - Math.floor(d) }));
    remainders.sort((a, b) => b.rem - a.rem || a.i - b.i);

    actualDrops = [...floorDrops];
    for (let r = 0; r < remaining; r++) {
      actualDrops[remainders[r].i]++;
    }
  } else {
    // Level fill: increase smallest drops first (left to right within same level)
    actualDrops = [...standardDrops];
    let total = totalStandardDrop;

    while (total < targetDrop) {
      const minDrop = Math.min(...actualDrops);
      for (let i = 0; i < actualDrops.length && total < targetDrop; i++) {
        if (actualDrops[i] === minDrop) {
          actualDrops[i]++;
          total++;
        }
      }
    }
  }

  let cumDrop = 0;
  for (let i = 0; i < position - 1; i++) cumDrop += actualDrops[i];
  return Math.max(1, winnerPoints - cumDrop);
}

/**
 * Get points distribution for a tier (for display)
 */
export function getPointsDistribution(
  tier: TournamentTier,
  participantsCount: number = 16,
  mode: 'singles' | 'doubles' = 'singles'
): { position: number; points: number }[] {
  const count = Math.max(2, participantsCount);
  const result: { position: number; points: number }[] = [];
  for (let pos = 1; pos <= count; pos++) {
    result.push({ position: pos, points: calculateRankingPoints(pos, tier, participantsCount, mode) });
  }
  return result;
}
