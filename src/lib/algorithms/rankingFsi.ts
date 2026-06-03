import type { TournamentTier } from '$lib/types/tournament';
import { distributeRankingPoints } from './ranking';

const FSI_TIER_FLOORS: Record<TournamentTier, number> = {
  SERIES_35: 25,
  SERIES_25: 18,
  SERIES_15: 12,
};

export function getFsiTierFloor(tier: TournamentTier): number {
  return FSI_TIER_FLOORS[tier];
}

/**
 * Compute the Field Strength Index for a set of participants.
 *
 * fsi = 0.6 × avg(top10 by rankingSnapshot)
 *     + 0.3 × avg(all participants)
 *     + 0.1 × size_bonus
 *
 * size_bonus = min(N / 20, 1) × 10  (max 10 pts when N ≥ 20)
 */
export function calculateFsi(participants: { rankingSnapshot: number }[]): number {
  if (participants.length === 0) return 0;

  const sorted = [...participants].sort((a, b) => b.rankingSnapshot - a.rankingSnapshot);
  const top10 = sorted.slice(0, 10);

  const avgTop10 = top10.reduce((sum, p) => sum + p.rankingSnapshot, 0) / top10.length;
  const avgAll = participants.reduce((sum, p) => sum + p.rankingSnapshot, 0) / participants.length;
  const sizeBonus = Math.min(participants.length / 20, 1) * 10;

  return 0.6 * avgTop10 + 0.3 * avgAll + 0.1 * sizeBonus;
}

/**
 * Compute winner points for FSI system.
 * Result is max(tier_floor, round(fsi)).
 */
export function calculateFsiWinnerPoints(
  participants: { rankingSnapshot: number }[],
  tier: TournamentTier
): number {
  const fsi = calculateFsi(participants);
  return Math.max(FSI_TIER_FLOORS[tier], Math.round(fsi));
}

/**
 * Calculate FSI ranking points for a given position.
 * Winner points come from FSI; distribution uses same Hamilton/level-fill as classic.
 *
 * @param position Final position (1 = winner)
 * @param participants All active participants with rankingSnapshot
 * @param tier Tournament tier (sets floor)
 * @param participantsCount Total active participant count
 * @param mode 'singles' or 'doubles'
 */
export function calculateFsiRankingPoints(
  position: number,
  participants: { rankingSnapshot: number }[],
  tier: TournamentTier,
  participantsCount: number,
  mode: 'singles' | 'doubles' = 'singles'
): number {
  const winnerPoints = calculateFsiWinnerPoints(participants, tier);
  return distributeRankingPoints(position, winnerPoints, participantsCount, mode);
}
