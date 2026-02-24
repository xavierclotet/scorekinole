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
    SERIES_50: { name: 'Series 50', description: 'Campeonato de España o torneos masivos', basePoints: 50, minPlayers: 30, minPlayersStrict: true },
    SERIES_40: { name: 'Series 40', description: 'Torneos regionales grandes', basePoints: 40, minPlayers: 20, minPlayersStrict: false },
    SERIES_35: { name: 'Series 35', description: 'Torneos locales y de clubes', basePoints: 35 }
  };
  return tiers[tier];
}

/**
 * Get all tiers info for display
 */
export function getAllTiers(): { tier: TournamentTier; info: TierInfo }[] {
  return [
    { tier: 'SERIES_50', info: getTierInfo('SERIES_50') },
    { tier: 'SERIES_40', info: getTierInfo('SERIES_40') },
    { tier: 'SERIES_35', info: getTierInfo('SERIES_35') }
  ];
}

/**
 * Calculate ranking points.
 *
 * Two regimes:
 * - 16+ participants: use drop curve (Singles: -3,-2,-2,-2,-1... / Doubles: -5,-4,-2,-2...)
 *   Winner gets full basePoints. Lower positions may still get high points.
 * - <16 participants: winner scaled by N/16, then interpolate drops to reach 1 at last place.
 *   Hamilton method when standard drops exceed target (Doubles), level fill when insufficient (Singles).
 *
 * @param position Final position (1 = winner)
 * @param tier Tournament series (SERIES_50, SERIES_40, SERIES_35)
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

  const winnerPoints = Math.round(basePoints * Math.min(1, participantsCount / 16));

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

  // 16+ participants: use raw drops (no interpolation)
  if (participantsCount >= 16) {
    let cumDrop = 0;
    for (let i = 0; i < position - 1; i++) cumDrop += standardDrops[i];
    return Math.max(1, winnerPoints - cumDrop);
  }

  // <16 participants: interpolate so last place gets 1 point
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
  const count = Math.min(Math.max(2, participantsCount), 16);
  const result: { position: number; points: number }[] = [];
  for (let pos = 1; pos <= count; pos++) {
    result.push({ position: pos, points: calculateRankingPoints(pos, tier, participantsCount, mode) });
  }
  return result;
}
