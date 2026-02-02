/**
 * Tie-breaker resolution algorithm
 * Resolves ties in group standings using multiple criteria
 *
 * TIEBREAKER LOGIC:
 *
 * For WINS ranking (2/1/0 system):
 * 1. Swiss/Match Points (2 per win, 1 per tie, 0 per loss)
 * 2. If tied: Head-to-head result
 * 3. If head-to-head is also tied (4-4): Total 20s scored
 * 4. If still tied: Mark as unresolved for admin decision
 *
 * For POINTS ranking (total crokinole points):
 * 1. Total points scored in matches
 * 2. If tied: Total 20s scored
 * 3. If still tied: Head-to-head result
 * 4. If still tied: Mark as unresolved for admin decision
 */

import type { GroupStanding, TournamentParticipant, QualificationMode } from '$lib/types/tournament';

/**
 * Get the primary ranking value for a standing based on qualification mode
 */
function getPrimaryValue(standing: GroupStanding, isSwiss: boolean, qualificationMode: QualificationMode): number {
  if (isSwiss && qualificationMode === 'WINS') {
    return standing.swissPoints ?? (standing.matchesWon * 2 + standing.matchesTied);
  } else if (qualificationMode === 'POINTS') {
    return standing.totalPointsScored;
  } else {
    // Round Robin with WINS
    return standing.points;
  }
}

/**
 * Get head-to-head result between two participants
 * Returns: 1 if A wins, -1 if B wins, 0 if tied (4-4), null if no record (didn't play each other)
 */
function getHeadToHeadResult(standingA: GroupStanding, standingB: GroupStanding): number | null {
  if (standingA.headToHeadRecord) {
    const record = standingA.headToHeadRecord[standingB.participantId];
    if (record) {
      if (record.result === 'WIN') return 1;
      if (record.result === 'LOSS') return -1;
      if (record.result === 'TIE') return 0; // They played and tied (4-4)
    }
    // undefined = no record (didn't play each other)
    return null;
  }
  return null;
}


/**
 * Resolve a tie between exactly 2 participants
 * Returns sorted array and marks unresolved ties
 */
function resolveTwoPlayerTie(
  tiedGroup: GroupStanding[],
  qualificationMode: QualificationMode,
  participantMap: Map<string, TournamentParticipant>
): GroupStanding[] {
  const [a, b] = tiedGroup;

  if (qualificationMode === 'WINS') {
    // WINS: head-to-head > 20s > unresolved

    // 1. Head-to-head (only if they played each other)
    const h2h = getHeadToHeadResult(a, b);
    if (h2h !== null && h2h !== 0) {
      // They played and one won
      a.tiedWith = undefined;
      a.tieReason = undefined;
      b.tiedWith = undefined;
      b.tieReason = undefined;
      return h2h === 1 ? [a, b] : [b, a];
    }

    // Head-to-head was a tie (4-4) OR they didn't play each other, use 20s
    // 2. Total 20s
    if (a.total20s !== b.total20s) {
      a.tiedWith = undefined;
      a.tieReason = undefined;
      b.tiedWith = undefined;
      b.tieReason = undefined;
      return a.total20s > b.total20s ? [a, b] : [b, a];
    }

    // 3. Unresolved - mark for admin
    a.tiedWith = [b.participantId];
    a.tieReason = 'unresolved';
    b.tiedWith = [a.participantId];
    b.tieReason = 'unresolved';

  } else {
    // POINTS: 20s > head-to-head > unresolved

    // 1. Total 20s
    if (a.total20s !== b.total20s) {
      a.tiedWith = undefined;
      a.tieReason = undefined;
      b.tiedWith = undefined;
      b.tieReason = undefined;
      return a.total20s > b.total20s ? [a, b] : [b, a];
    }

    // 2. Head-to-head
    const h2h = getHeadToHeadResult(a, b);
    if (h2h !== 0) {
      a.tiedWith = undefined;
      a.tieReason = undefined;
      b.tiedWith = undefined;
      b.tieReason = undefined;
      return h2h === 1 ? [a, b] : [b, a];
    }

    // 3. Unresolved - mark for admin
    a.tiedWith = [b.participantId];
    a.tieReason = 'unresolved';
    b.tiedWith = [a.participantId];
    b.tieReason = 'unresolved';
  }

  // Fallback: use initial ranking
  const participantA = participantMap.get(a.participantId);
  const participantB = participantMap.get(b.participantId);
  if (participantA && participantB) {
    return participantA.rankingSnapshot > participantB.rankingSnapshot ? [a, b] : [b, a];
  }

  return [a, b];
}

/**
 * Calculate mini-league points for a participant (only matches between tied players)
 */
function calculateMiniLeaguePoints(standing: GroupStanding, tiedIds: Set<string>): number {
  if (!standing.headToHeadRecord) return 0;

  let points = 0;
  for (const opponentId of tiedIds) {
    if (opponentId === standing.participantId) continue;
    const record = standing.headToHeadRecord[opponentId];
    if (record) {
      if (record.result === 'WIN') points += 2;
      else if (record.result === 'TIE') points += 1;
      // LOSS = 0
    }
  }
  return points;
}

/**
 * Calculate mini-league 20s for a participant (only matches between tied players)
 */
function calculateMiniLeague20s(standing: GroupStanding, tiedIds: Set<string>): number {
  if (!standing.headToHeadRecord) return 0;

  let twenties = 0;
  for (const opponentId of tiedIds) {
    if (opponentId === standing.participantId) continue;
    const record = standing.headToHeadRecord[opponentId];
    if (record) {
      twenties += record.twenties;
    }
  }
  return twenties;
}

/**
 * Resolve remaining 2-player ties using H2H after initial sorting
 */
function resolveRemainingTwoPlayerTies(
  sorted: GroupStanding[],
  participantMap: Map<string, TournamentParticipant>,
  compareValue: (s: GroupStanding) => number
): GroupStanding[] {
  const result: GroupStanding[] = [];
  let i = 0;

  while (i < sorted.length) {
    // Find all players with same compare value starting at i
    const currentValue = compareValue(sorted[i]);
    let j = i + 1;
    while (j < sorted.length && compareValue(sorted[j]) === currentValue) {
      j++;
    }

    const tiedSubgroup = sorted.slice(i, j);

    if (tiedSubgroup.length === 2) {
      // Exactly 2 players tied - try H2H
      const [a, b] = tiedSubgroup;
      const h2h = getHeadToHeadResult(a, b);

      if (h2h !== null && h2h !== 0) {
        // H2H resolves it
        a.tiedWith = undefined;
        a.tieReason = undefined;
        b.tiedWith = undefined;
        b.tieReason = undefined;
        if (h2h === 1) {
          result.push(a, b);
        } else {
          result.push(b, a);
        }
      } else {
        // Still tied - mark as unresolved, use ranking snapshot for order
        a.tiedWith = [b.participantId];
        a.tieReason = 'unresolved';
        b.tiedWith = [a.participantId];
        b.tieReason = 'unresolved';

        const pA = participantMap.get(a.participantId);
        const pB = participantMap.get(b.participantId);
        if (pA && pB && pA.rankingSnapshot !== pB.rankingSnapshot) {
          result.push(...(pA.rankingSnapshot > pB.rankingSnapshot ? [a, b] : [b, a]));
        } else {
          result.push(a, b);
        }
      }
    } else if (tiedSubgroup.length > 2) {
      // 3+ still tied - mark all as unresolved
      for (const s of tiedSubgroup) {
        s.tiedWith = tiedSubgroup.filter(x => x !== s).map(x => x.participantId);
        s.tieReason = 'unresolved';
      }
      result.push(...tiedSubgroup);
    } else {
      // Single player - no tie
      tiedSubgroup[0].tiedWith = undefined;
      tiedSubgroup[0].tieReason = undefined;
      result.push(...tiedSubgroup);
    }

    i = j;
  }

  return result;
}

/**
 * Resolve a tie between 3+ participants
 *
 * SWISS SYSTEM (3+ players):
 * 1. Total 20s
 * 2. If 2-player ties remain after 20s sorting: apply H2H between them
 *
 * ROUND ROBIN with WINS mode (3+ players) - Mini-league:
 * 1. Points only from matches between tied players (mini-league)
 * 2. 20s only from matches between tied players
 * 3. Total 20s (all matches)
 * 4. If 2-player ties remain: apply H2H
 *
 * ROUND ROBIN with POINTS mode (3+ players):
 * 1. Total 20s (all matches)
 * 2. If 2-player ties remain: apply H2H
 * (No mini-league since primary ranking is already total points)
 *
 * Returns sorted array and marks unresolved ties
 */
function resolveMultiPlayerTie(
  tiedGroup: GroupStanding[],
  qualificationMode: QualificationMode,
  participantMap: Map<string, TournamentParticipant>,
  isSwiss: boolean
): GroupStanding[] {
  const tiedIds = new Set(tiedGroup.map(s => s.participantId));

  const systemType = isSwiss ? 'SWISS' : `ROUND ROBIN (${qualificationMode})`;
  console.log(`[Tiebreaker] Resolving ${tiedGroup.length}-way tie (${systemType}):`);
  tiedGroup.forEach(s => {
    const p = participantMap.get(s.participantId);
    const miniPts = calculateMiniLeaguePoints(s, tiedIds);
    const mini20s = calculateMiniLeague20s(s, tiedIds);
    console.log(`  - ${p?.name || s.participantId}: pts=${s.points}, totalPoints=${s.totalPointsScored}, total20s=${s.total20s}, miniPts=${miniPts}, mini20s=${mini20s}`);
  });

  let sorted: GroupStanding[];

  if (isSwiss) {
    // SWISS: Sort by total 20s only
    sorted = [...tiedGroup].sort((a, b) => {
      // 1. Total 20s (higher is better)
      if (a.total20s !== b.total20s) {
        return b.total20s - a.total20s;
      }
      // Fallback to initial ranking for stable sort
      const pA = participantMap.get(a.participantId);
      const pB = participantMap.get(b.participantId);
      if (pA && pB) {
        return pB.rankingSnapshot - pA.rankingSnapshot;
      }
      return 0;
    });

    console.log('[Tiebreaker] SWISS sorted by total 20s:');
    sorted.forEach((s, idx) => {
      const p = participantMap.get(s.participantId);
      console.log(`  ${idx + 1}. ${p?.name || s.participantId}: 20s=${s.total20s}`);
    });

    // Resolve remaining 2-player ties with H2H
    sorted = resolveRemainingTwoPlayerTies(sorted, participantMap, s => s.total20s);

  } else if (qualificationMode === 'POINTS') {
    // ROUND ROBIN with POINTS mode: Sort by total 20s only (no mini-league)
    // Primary ranking is already totalPointsScored, so ties are resolved by 20s
    sorted = [...tiedGroup].sort((a, b) => {
      // 1. Total 20s (higher is better)
      if (a.total20s !== b.total20s) {
        return b.total20s - a.total20s;
      }
      // Fallback to initial ranking for stable sort
      const pA = participantMap.get(a.participantId);
      const pB = participantMap.get(b.participantId);
      if (pA && pB) {
        return pB.rankingSnapshot - pA.rankingSnapshot;
      }
      return 0;
    });

    console.log('[Tiebreaker] ROUND ROBIN (POINTS mode) sorted by total 20s:');
    sorted.forEach((s, idx) => {
      const p = participantMap.get(s.participantId);
      console.log(`  ${idx + 1}. ${p?.name || s.participantId}: totalPoints=${s.totalPointsScored}, 20s=${s.total20s}`);
    });

    // Resolve remaining 2-player ties with H2H
    sorted = resolveRemainingTwoPlayerTies(sorted, participantMap, s => s.total20s);

  } else {
    // ROUND ROBIN with WINS mode: Mini-league approach
    // 1. Sort by mini-league points
    sorted = [...tiedGroup].sort((a, b) => {
      const miniPtsA = calculateMiniLeaguePoints(a, tiedIds);
      const miniPtsB = calculateMiniLeaguePoints(b, tiedIds);
      if (miniPtsA !== miniPtsB) {
        return miniPtsB - miniPtsA;
      }

      // 2. Mini-league 20s
      const mini20sA = calculateMiniLeague20s(a, tiedIds);
      const mini20sB = calculateMiniLeague20s(b, tiedIds);
      if (mini20sA !== mini20sB) {
        return mini20sB - mini20sA;
      }

      // 3. Total 20s (all matches)
      if (a.total20s !== b.total20s) {
        return b.total20s - a.total20s;
      }

      // No fallback to ranking - leave as truly unresolved
      return 0;
    });

    console.log('[Tiebreaker] ROUND ROBIN (WINS mode) sorted by mini-league:');
    sorted.forEach((s, idx) => {
      const p = participantMap.get(s.participantId);
      const miniPts = calculateMiniLeaguePoints(s, tiedIds);
      const mini20s = calculateMiniLeague20s(s, tiedIds);
      console.log(`  ${idx + 1}. ${p?.name || s.participantId}: miniPts=${miniPts}, mini20s=${mini20s}, total20s=${s.total20s}`);
    });

    // Key for detecting truly unresolved ties (same miniPts + mini20s + total20s)
    const getFullCompareKey = (s: GroupStanding): string => {
      const miniPts = calculateMiniLeaguePoints(s, tiedIds);
      const mini20s = calculateMiniLeague20s(s, tiedIds);
      return `${miniPts.toString().padStart(5, '0')}-${mini20s.toString().padStart(5, '0')}-${s.total20s.toString().padStart(5, '0')}`;
    };

    // Key for detecting sub-ties (same miniPts + mini20s, resolved by total20s)
    const getMiniLeagueKey = (s: GroupStanding): string => {
      const miniPts = calculateMiniLeaguePoints(s, tiedIds);
      const mini20s = calculateMiniLeague20s(s, tiedIds);
      return `${miniPts.toString().padStart(5, '0')}-${mini20s.toString().padStart(5, '0')}`;
    };

    // First pass: detect truly unresolved ties (same miniPts + mini20s + total20s)
    const result: GroupStanding[] = [];
    let i = 0;

    while (i < sorted.length) {
      const currentKey = getFullCompareKey(sorted[i]);
      let j = i + 1;
      while (j < sorted.length && getFullCompareKey(sorted[j]) === currentKey) {
        j++;
      }

      const tiedSubgroup = sorted.slice(i, j);

      if (tiedSubgroup.length === 2) {
        const [a, b] = tiedSubgroup;
        const h2h = getHeadToHeadResult(a, b);

        if (h2h !== null && h2h !== 0) {
          a.tiedWith = undefined;
          a.tieReason = undefined;
          b.tiedWith = undefined;
          b.tieReason = undefined;
          if (h2h === 1) {
            result.push(a, b);
          } else {
            result.push(b, a);
          }
        } else {
          // Truly unresolved - mark as tied and leave order as-is
          a.tiedWith = [b.participantId];
          a.tieReason = 'unresolved';
          b.tiedWith = [a.participantId];
          b.tieReason = 'unresolved';
          result.push(a, b);
        }
      } else if (tiedSubgroup.length > 2) {
        for (const s of tiedSubgroup) {
          s.tiedWith = tiedSubgroup.filter(x => x !== s).map(x => x.participantId);
          s.tieReason = 'unresolved';
        }
        result.push(...tiedSubgroup);
      } else {
        tiedSubgroup[0].tiedWith = undefined;
        tiedSubgroup[0].tieReason = undefined;
        result.push(...tiedSubgroup);
      }

      i = j;
    }

    // Second pass: mark sub-ties (same miniPts + mini20s but resolved by total20s)
    // These should also show warning since they were resolved by total20s, not mini-league
    for (let k = 0; k < result.length - 1; k++) {
      const current = result[k];
      const next = result[k + 1];

      // Skip if already marked as unresolved
      if (current.tiedWith && current.tiedWith.length > 0) continue;

      // Check if they have the same mini-league key (same miniPts + mini20s)
      if (getMiniLeagueKey(current) === getMiniLeagueKey(next)) {
        // They were resolved by total20s - mark as sub-tie
        current.tiedWith = current.tiedWith || [];
        if (!current.tiedWith.includes(next.participantId)) {
          current.tiedWith.push(next.participantId);
        }
        current.tieReason = 'twenties';  // Resolved by total 20s

        next.tiedWith = next.tiedWith || [];
        if (!next.tiedWith.includes(current.participantId)) {
          next.tiedWith.push(current.participantId);
        }
        next.tieReason = 'twenties';

        console.log(`[Tiebreaker] Sub-tie detected: ${current.participantId} and ${next.participantId} (resolved by total 20s)`);
      }
    }

    sorted = result;
  }

  return sorted;
}

/**
 * Resolve a group of tied participants
 */
function resolveTiedGroup(
  tiedGroup: GroupStanding[],
  qualificationMode: QualificationMode,
  participantMap: Map<string, TournamentParticipant>,
  isSwiss: boolean
): GroupStanding[] {
  if (tiedGroup.length === 1) {
    // No tie to resolve
    tiedGroup[0].tiedWith = undefined;
    tiedGroup[0].tieReason = undefined;
    return tiedGroup;
  }

  if (tiedGroup.length === 2) {
    return resolveTwoPlayerTie(tiedGroup, qualificationMode, participantMap);
  }

  return resolveMultiPlayerTie(tiedGroup, qualificationMode, participantMap, isSwiss);
}

/**
 * Resolve tie-breakers in standings
 *
 * @param standings Current standings
 * @param participants Tournament participants (for ranking reference)
 * @param isSwiss Whether this is a Swiss system tournament
 * @param qualificationMode How players qualify: 'WINS' (2/1/0) or 'POINTS' (total scored)
 * @returns Sorted standings with positions and tie markers
 */
export function resolveTiebreaker(
  standings: GroupStanding[],
  participants: TournamentParticipant[],
  isSwiss: boolean = false,
  qualificationMode: QualificationMode = 'WINS'
): GroupStanding[] {
  console.log(`[Tiebreaker] Resolving standings for ${standings.length} players (${qualificationMode} mode)`);

  // Create participant map for quick ranking lookup
  const participantMap = new Map<string, TournamentParticipant>();
  participants.forEach(p => participantMap.set(p.id, p));

  // Create a copy of standings to avoid mutating originals
  const standingsCopy = standings.map(s => ({ ...s }));

  // Group standings by primary value
  const groups = new Map<number, GroupStanding[]>();

  for (const standing of standingsCopy) {
    const primaryValue = getPrimaryValue(standing, isSwiss, qualificationMode);

    if (!groups.has(primaryValue)) {
      groups.set(primaryValue, []);
    }
    groups.get(primaryValue)!.push(standing);
  }

  // Sort groups by primary value (descending)
  const sortedPrimaryValues = [...groups.keys()].sort((a, b) => b - a);

  // Resolve ties within each group and build final sorted list
  const result: GroupStanding[] = [];

  for (const primaryValue of sortedPrimaryValues) {
    const tiedGroup = groups.get(primaryValue)!;
    const resolvedGroup = resolveTiedGroup(tiedGroup, qualificationMode, participantMap, isSwiss);
    result.push(...resolvedGroup);
  }

  // Assign positions
  for (let i = 0; i < result.length; i++) {
    result[i].position = i + 1;
  }

  return result;
}

/**
 * Update head-to-head record between two participants
 *
 * @param standings Current standings
 * @param participantA First participant ID
 * @param participantB Second participant ID
 * @param winner Winner ID (or null for tie)
 * @param twentiesA 20s scored by participant A in this match
 * @param twentiesB 20s scored by participant B in this match
 * @returns Updated standings
 */
export function updateHeadToHeadRecord(
  standings: GroupStanding[],
  participantA: string,
  participantB: string,
  winner: string | null,
  twentiesA: number = 0,
  twentiesB: number = 0
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

  // Update records with result and 20s
  if (winner === null) {
    // Tie
    standingA.headToHeadRecord[participantB] = { result: 'TIE', twenties: twentiesA };
    standingB.headToHeadRecord[participantA] = { result: 'TIE', twenties: twentiesB };
  } else if (winner === participantA) {
    standingA.headToHeadRecord[participantB] = { result: 'WIN', twenties: twentiesA };
    standingB.headToHeadRecord[participantA] = { result: 'LOSS', twenties: twentiesB };
  } else {
    standingA.headToHeadRecord[participantB] = { result: 'LOSS', twenties: twentiesA };
    standingB.headToHeadRecord[participantA] = { result: 'WIN', twenties: twentiesB };
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
