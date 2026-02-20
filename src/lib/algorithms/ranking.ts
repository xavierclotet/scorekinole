/**
 * Tournament ranking points calculation
 * NCA (National Crokinole Association) point system with interpolation
 */

import type { TournamentTier } from '$lib/types/tournament';

/**
 * Tier information
 */
export interface TierInfo {
  name: string;
  description: string;
  basePoints: number;
}

/**
 * Get tier info based on tier type
 */
export function getTierInfo(tier: TournamentTier): TierInfo {
  const tiers: Record<TournamentTier, TierInfo> = {
    CLUB: { name: 'Club (Tier 4)', description: 'Torneo local', basePoints: 30 },
    REGIONAL: { name: 'Regional (Tier 3)', description: 'Torneo inter-clubes', basePoints: 35 },
    NATIONAL: { name: 'Nacional (Tier 2)', description: 'Open nacional', basePoints: 40 },
    MAJOR: { name: 'Major (Tier 1)', description: 'Tavistock / Mundial', basePoints: 50 }
  };
  return tiers[tier];
}

/**
 * Get all tiers info for display
 */
export function getAllTiers(): { tier: TournamentTier; info: TierInfo }[] {
  return [
    { tier: 'MAJOR', info: getTierInfo('MAJOR') },
    { tier: 'NATIONAL', info: getTierInfo('NATIONAL') },
    { tier: 'REGIONAL', info: getTierInfo('REGIONAL') },
    { tier: 'CLUB', info: getTierInfo('CLUB') }
  ];
}

/**
 * Calculate NCA ranking points with interpolation using largest remainder method.
 *
 * Algorithm:
 * 1. Winner points = round(basePoints * min(1, N/16))
 * 2. Build standard NCA drop curve (Singles: -3,-2,-2,-2,-1,-1... / Doubles: -5,-4,-2,-2...)
 * 3. If 16+ participants and total standard drops >= targetDrop: use raw drops directly.
 * 4. Otherwise, use largest remainder method (Hamilton) to distribute targetDrop across
 *    all positions proportionally to the standard curve, ensuring drops sum exactly to
 *    winnerPoints - 1 so last place always gets 1 point.
 *
 * @param position Final position (1 = winner)
 * @param tier Tournament tier (CLUB, REGIONAL, NATIONAL, MAJOR)
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

  // Build the standard NCA drop curve
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

  const targetDrop = winnerPoints - 1;
  const totalStandardDrop = standardDrops.reduce((acc, val) => acc + val, 0);

  // 16+ participants with enough standard drops: use raw curve
  if (participantsCount >= 16 && totalStandardDrop >= targetDrop) {
    let cumDrop = 0;
    for (let i = 0; i < position - 1; i++) cumDrop += standardDrops[i];
    return Math.max(1, winnerPoints - cumDrop);
  }

  // Largest remainder method: distribute targetDrop proportionally
  const scale = targetDrop / totalStandardDrop;
  const idealDrops = standardDrops.map(d => d * scale);
  const floorDrops = idealDrops.map(d => Math.floor(d));
  let remaining = targetDrop - floorDrops.reduce((acc, val) => acc + val, 0);

  // Sort indices by fractional remainder descending (stable: earlier positions win ties)
  const remainders = idealDrops.map((d, i) => ({ i, rem: d - Math.floor(d) }));
  remainders.sort((a, b) => b.rem - a.rem || a.i - b.i);

  const actualDrops = [...floorDrops];
  for (let r = 0; r < remaining; r++) {
    actualDrops[remainders[r].i]++;
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
