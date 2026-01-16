/**
 * Tournament ranking points calculation
 * Based on tier-based point system
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
    CLUB: { name: 'Club (Tier 4)', description: 'Torneo local', basePoints: 15 },
    REGIONAL: { name: 'Regional (Tier 3)', description: 'Torneo inter-clubes', basePoints: 25 },
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
 * Calculate ranking points based on position and tier
 *
 * @param position Final position (1 = winner)
 * @param tier Tournament tier
 * @returns Points earned
 */
export function calculateRankingPoints(position: number, tier: TournamentTier): number {
  const tierInfo = getTierInfo(tier);
  const basePoints = tierInfo.basePoints;

  // 1st place gets full points
  if (position === 1) return basePoints;

  // Top 4 get percentage of base points
  if (position === 2) return Math.round(basePoints * 0.9);
  if (position === 3) return Math.round(basePoints * 0.8);
  if (position === 4) return Math.round(basePoints * 0.7);

  // Rest get decreasing points, minimum 1
  const points = basePoints - (position + 2);
  return points > 1 ? points : 1;
}

/**
 * Get points distribution for a tier (for display)
 */
export function getPointsDistribution(tier: TournamentTier): { position: number; points: number }[] {
  return [
    { position: 1, points: calculateRankingPoints(1, tier) },
    { position: 2, points: calculateRankingPoints(2, tier) },
    { position: 3, points: calculateRankingPoints(3, tier) },
    { position: 4, points: calculateRankingPoints(4, tier) },
    { position: 5, points: calculateRankingPoints(5, tier) },
    { position: 6, points: calculateRankingPoints(6, tier) },
    { position: 7, points: calculateRankingPoints(7, tier) },
    { position: 8, points: calculateRankingPoints(8, tier) }
  ];
}
