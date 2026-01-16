/**
 * Tie-breaker resolution algorithm
 * Resolves ties in group standings using multiple criteria
 */

import type { GroupStanding, TournamentParticipant, SwissRankingSystem } from '$lib/types/tournament';

/**
 * Resolve tie-breakers in standings
 *
 * For Swiss system with WINS ranking:
 * 1. Swiss Points (2 per win, 1 per tie, 0 per loss)
 * 2. Head-to-head record
 * 3. Total 20s scored
 * 4. Initial ranking order
 *
 * For Swiss system with POINTS ranking:
 * 1. Total points scored in matches
 * 2. Total 20s scored
 * 3. Head-to-head record
 * 4. Initial ranking order
 *
 * For Round Robin:
 * 1. Total points scored in matches
 * 2. Total 20s scored
 * 3. Head-to-head record
 * 4. Initial ranking order
 *
 * @param standings Current standings
 * @param participants Tournament participants (for ranking reference)
 * @param isSwiss Whether this is a Swiss system tournament
 * @param swissRankingSystem Swiss ranking system: 'WINS' or 'POINTS'
 * @returns Sorted standings with positions
 */
export function resolveTiebreaker(
  standings: GroupStanding[],
  participants: TournamentParticipant[],
  isSwiss: boolean = false,
  swissRankingSystem: SwissRankingSystem = 'WINS'
): GroupStanding[] {
  // Create participant map for quick ranking lookup
  const participantMap = new Map<string, TournamentParticipant>();
  participants.forEach(p => participantMap.set(p.id, p));

  // Sort standings
  const sorted = [...standings].sort((a, b) => {
    if (isSwiss && swissRankingSystem === 'WINS') {
      // SWISS SYSTEM (WINS): swissPoints > head-to-head > 20s > ranking

      // 1. Swiss Points (2/1/0) - PRIMARY
      const aSwiss = a.swissPoints ?? (a.matchesWon * 2 + a.matchesTied);
      const bSwiss = b.swissPoints ?? (b.matchesWon * 2 + b.matchesTied);
      if (aSwiss !== bSwiss) {
        return bSwiss - aSwiss;
      }

      // 2. Head-to-head
      if (a.headToHeadRecord && b.headToHeadRecord) {
        const aVsB = a.headToHeadRecord[b.participantId];
        if (aVsB === 'WIN') return -1;
        if (aVsB === 'LOSS') return 1;
      }

      // 3. Total 20s
      if (a.total20s !== b.total20s) {
        return b.total20s - a.total20s;
      }
    } else {
      // ROUND ROBIN or SWISS with POINTS: totalPointsScored > 20s > head-to-head > ranking

      // 1. Total points scored (descending)
      if (a.totalPointsScored !== b.totalPointsScored) {
        return b.totalPointsScored - a.totalPointsScored;
      }

      // 2. Total 20s (descending)
      if (a.total20s !== b.total20s) {
        return b.total20s - a.total20s;
      }

      // 3. Head-to-head
      if (a.headToHeadRecord && b.headToHeadRecord) {
        const aVsB = a.headToHeadRecord[b.participantId];
        if (aVsB === 'WIN') return -1;
        if (aVsB === 'LOSS') return 1;
      }
    }

    // Fallback: Initial ranking (descending)
    const participantA = participantMap.get(a.participantId);
    const participantB = participantMap.get(b.participantId);

    if (participantA && participantB) {
      return participantB.rankingSnapshot - participantA.rankingSnapshot;
    }

    return 0;
  });

  // Assign positions
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].position = i + 1;
  }

  return sorted;
}

/**
 * Update head-to-head record between two participants
 *
 * @param standings Current standings
 * @param participantA First participant ID
 * @param participantB Second participant ID
 * @param winner Winner ID (or null for tie)
 * @returns Updated standings
 */
export function updateHeadToHeadRecord(
  standings: GroupStanding[],
  participantA: string,
  participantB: string,
  winner: string | null
): GroupStanding[] {
  const updated = [...standings];

  const standingA = updated.find(s => s.participantId === participantA);
  const standingB = updated.find(s => s.participantId === participantB);

  if (!standingA || !standingB) {
    return updated;
  }

  // Initialize head-to-head if needed
  if (!standingA.headToHeadRecord) {
    standingA.headToHeadRecord = {};
  }
  if (!standingB.headToHeadRecord) {
    standingB.headToHeadRecord = {};
  }

  // Update records
  if (winner === null) {
    // Tie
    standingA.headToHeadRecord[participantB] = 'TIE';
    standingB.headToHeadRecord[participantA] = 'TIE';
  } else if (winner === participantA) {
    standingA.headToHeadRecord[participantB] = 'WIN';
    standingB.headToHeadRecord[participantA] = 'LOSS';
  } else {
    standingA.headToHeadRecord[participantB] = 'LOSS';
    standingB.headToHeadRecord[participantA] = 'WIN';
  }

  return updated;
}

/**
 * Calculate match points (2 for win, 1 for tie, 0 for loss) - Used for Round Robin
 *
 * @param matchesWon Number of matches won
 * @param matchesTied Number of matches tied
 * @returns Total match points
 */
export function calculateMatchPoints(matchesWon: number, matchesTied: number): number {
  return matchesWon * 2 + matchesTied * 1;
}

/**
 * Determine qualifiers from standings
 *
 * @param standings Sorted standings
 * @param numQualifiers Number of qualifiers
 * @returns Array of qualified participant IDs
 */
export function getQualifiers(
  standings: GroupStanding[],
  numQualifiers: number
): string[] {
  const sorted = [...standings].sort((a, b) => a.position - b.position);
  return sorted.slice(0, numQualifiers).map(s => s.participantId);
}

/**
 * Check if there's a tie for qualification
 *
 * Returns true if the last qualifier is tied with the next participant
 *
 * @param standings Sorted standings
 * @param numQualifiers Number of qualifiers
 * @returns true if there's a tie at the qualification line
 */
export function hasTieForQualification(
  standings: GroupStanding[],
  numQualifiers: number
): boolean {
  if (numQualifiers >= standings.length) {
    return false;
  }

  const sorted = [...standings].sort((a, b) => a.position - b.position);
  const lastQualifier = sorted[numQualifiers - 1];
  const firstNonQualifier = sorted[numQualifiers];

  // Check if they have same points (primary criterion)
  return lastQualifier.points === firstNonQualifier.points;
}

/**
 * Get participants involved in a tie
 *
 * @param standings Sorted standings
 * @param position Position around which to check for ties
 * @returns Array of participant IDs in the tie
 */
export function getParticipantsInTie(
  standings: GroupStanding[],
  position: number
): string[] {
  const sorted = [...standings].sort((a, b) => a.position - b.position);

  if (position < 1 || position > sorted.length) {
    return [];
  }

  const targetStanding = sorted[position - 1];
  const targetPoints = targetStanding.points;

  // Find all participants with same points
  return sorted
    .filter(s => s.points === targetPoints)
    .map(s => s.participantId);
}
