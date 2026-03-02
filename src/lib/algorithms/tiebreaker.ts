/**
 * Tie-breaker resolution algorithm
 * Resolves ties in group standings using multiple criteria
 *
 * TIEBREAKER LOGIC:
 *
 * 2-PLAYER TIES (both WINS and POINTS):
 * 1. Head-to-head (H2H) direct result
 * 2. Total 20s scored
 * 3. Total Crokinole points (WINS mode only, since POINTS already uses this as primary)
 * 4. Buchholz (sum of opponents' primary ranking values)
 * 5. Mark as unresolved for admin decision (Shoot-out)
 *
 * 3+ PLAYER TIES - SWISS:
 * Sort by: Total 20s → Total Crokinole points (WINS only) → Buchholz
 * Then resolve remaining 2-player ties with H2H
 *
 * 3+ PLAYER TIES - ROUND ROBIN (WINS):
 * Mini-league first (points → 20s between tied players)
 * Then: Total 20s → Total Crokinole points → Buchholz → H2H for remaining 2-ties
 *
 * 3+ PLAYER TIES - ROUND ROBIN (POINTS):
 * Sort by: Total 20s → Buchholz
 * Then resolve remaining 2-player ties with H2H
 */

import type { GroupStanding, TournamentParticipant, QualificationMode, TiebreakerCriterion } from '$lib/types/tournament';

/** Default tiebreaker priority order */
const DEFAULT_PRIORITY: TiebreakerCriterion[] = ['h2h', 'total20s', 'totalPoints', 'buchholz'];

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
 * Iterates criteria in priority order: each criterion is checked, first difference wins
 */
function resolveTwoPlayerTie(
  tiedGroup: GroupStanding[],
  qualificationMode: QualificationMode,
  participantMap: Map<string, TournamentParticipant>,
  allStandings: GroupStanding[],
  isSwiss: boolean,
  show20s: boolean = true,
  priority: TiebreakerCriterion[] = DEFAULT_PRIORITY
): GroupStanding[] {
  const [a, b] = tiedGroup;

  const clearTie = () => {
    a.tiedWith = undefined; a.tieReason = undefined;
    b.tiedWith = undefined; b.tieReason = undefined;
  };

  for (const criterion of priority) {
    switch (criterion) {
      case 'h2h': {
        const h2h = getHeadToHeadResult(a, b);
        if (h2h !== null && h2h !== 0) {
          clearTie();
          return h2h === 1 ? [a, b] : [b, a];
        }
        break;
      }
      case 'total20s': {
        if (show20s && a.total20s !== b.total20s) {
          clearTie();
          return a.total20s > b.total20s ? [a, b] : [b, a];
        }
        break;
      }
      case 'totalPoints': {
        // Only for WINS mode (POINTS already uses this as primary)
        if (qualificationMode === 'WINS' && a.totalPointsScored !== b.totalPointsScored) {
          clearTie();
          return a.totalPointsScored > b.totalPointsScored ? [a, b] : [b, a];
        }
        break;
      }
      case 'buchholz': {
        const buchA = a.buchholz ?? 0;
        const buchB = b.buchholz ?? 0;
        if (buchA !== buchB) {
          clearTie();
          return buchA > buchB ? [a, b] : [b, a];
        }
        break;
      }
    }
  }

  // Unresolved - mark for admin (Shoot-out)
  a.tiedWith = [b.participantId];
  a.tieReason = 'unresolved';
  b.tiedWith = [a.participantId];
  b.tieReason = 'unresolved';

  // Fallback: use initial ranking for display order
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
 * Calculate Buchholz score for a participant
 * Buchholz = sum of primary ranking values of all opponents faced
 */
function calculateBuchholz(
  standing: GroupStanding,
  allStandings: GroupStanding[],
  isSwiss: boolean,
  qualificationMode: QualificationMode
): number {
  if (!standing.headToHeadRecord) {
    return 0;
  }

  const opponentIds = Object.keys(standing.headToHeadRecord);

  if (opponentIds.length === 0) {
    return 0;
  }

  const standingsMap = new Map(allStandings.map(s => [s.participantId, s]));
  let buchholz = 0;

  for (const opponentId of opponentIds) {
    const opponentStanding = standingsMap.get(opponentId);
    if (opponentStanding) {
      const value = getPrimaryValue(opponentStanding, isSwiss, qualificationMode);
      buchholz += value;
    }
  }

  return buchholz;
}

/**
 * Resolve remaining 2-player ties using H2H → Buchholz after initial sorting
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
        a.tiedWith = undefined; a.tieReason = undefined;
        b.tiedWith = undefined; b.tieReason = undefined;
        result.push(h2h === 1 ? a : b, h2h === 1 ? b : a);
      } else {
        // Try Buchholz
        const buchA = a.buchholz ?? 0;
        const buchB = b.buchholz ?? 0;
        if (buchA !== buchB) {
          a.tiedWith = undefined; a.tieReason = undefined;
          b.tiedWith = undefined; b.tieReason = undefined;
          result.push(buchA > buchB ? a : b, buchA > buchB ? b : a);
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
/**
 * Build a sort comparator from priority list for multi-player ties.
 * For RR+WINS with h2h criterion and 3+ players, h2h maps to mini-league (pts then 20s).
 */
function buildMultiPlayerComparator(
  priority: TiebreakerCriterion[],
  tiedIds: Set<string>,
  qualificationMode: QualificationMode,
  isSwiss: boolean,
  show20s: boolean,
  participantMap: Map<string, TournamentParticipant>
): (a: GroupStanding, b: GroupStanding) => number {
  return (a, b) => {
    for (const criterion of priority) {
      switch (criterion) {
        case 'h2h': {
          if (!isSwiss && qualificationMode === 'WINS') {
            // RR+WINS 3+: mini-league points then mini-league 20s
            const miniPtsA = calculateMiniLeaguePoints(a, tiedIds);
            const miniPtsB = calculateMiniLeaguePoints(b, tiedIds);
            if (miniPtsA !== miniPtsB) return miniPtsB - miniPtsA;
            if (show20s) {
              const mini20sA = calculateMiniLeague20s(a, tiedIds);
              const mini20sB = calculateMiniLeague20s(b, tiedIds);
              if (mini20sA !== mini20sB) return mini20sB - mini20sA;
            }
          }
          // For Swiss or POINTS mode, H2H doesn't apply to 3+ (handled in post-sort pass)
          break;
        }
        case 'total20s': {
          if (show20s && a.total20s !== b.total20s) return b.total20s - a.total20s;
          break;
        }
        case 'totalPoints': {
          if (qualificationMode === 'WINS' && a.totalPointsScored !== b.totalPointsScored) {
            return b.totalPointsScored - a.totalPointsScored;
          }
          break;
        }
        case 'buchholz': {
          const buchA = a.buchholz ?? 0;
          const buchB = b.buchholz ?? 0;
          if (buchA !== buchB) return buchB - buchA;
          break;
        }
      }
    }
    // Fallback to initial ranking for stable sort
    const pA = participantMap.get(a.participantId);
    const pB = participantMap.get(b.participantId);
    if (pA && pB) return pB.rankingSnapshot - pA.rankingSnapshot;
    return 0;
  };
}

/**
 * Build a composite numeric key for a standing based on all criteria (for detecting sub-ties)
 */
function buildCompareKey(
  s: GroupStanding,
  priority: TiebreakerCriterion[],
  tiedIds: Set<string>,
  qualificationMode: QualificationMode,
  isSwiss: boolean,
  show20s: boolean
): string {
  const parts: string[] = [];
  for (const criterion of priority) {
    switch (criterion) {
      case 'h2h': {
        if (!isSwiss && qualificationMode === 'WINS') {
          parts.push(calculateMiniLeaguePoints(s, tiedIds).toString().padStart(5, '0'));
          if (show20s) parts.push(calculateMiniLeague20s(s, tiedIds).toString().padStart(5, '0'));
        }
        break;
      }
      case 'total20s': {
        if (show20s) parts.push(s.total20s.toString().padStart(5, '0'));
        break;
      }
      case 'totalPoints': {
        if (qualificationMode === 'WINS') parts.push(s.totalPointsScored.toString().padStart(6, '0'));
        break;
      }
      case 'buchholz': {
        parts.push((s.buchholz ?? 0).toString().padStart(6, '0'));
        break;
      }
    }
  }
  return parts.join('-');
}

function resolveMultiPlayerTie(
  tiedGroup: GroupStanding[],
  qualificationMode: QualificationMode,
  participantMap: Map<string, TournamentParticipant>,
  isSwiss: boolean,
  show20s: boolean = true,
  priority: TiebreakerCriterion[] = DEFAULT_PRIORITY
): GroupStanding[] {
  const tiedIds = new Set(tiedGroup.map(s => s.participantId));

  // Sort using configurable priority
  const comparator = buildMultiPlayerComparator(priority, tiedIds, qualificationMode, isSwiss, show20s, participantMap);
  let sorted = [...tiedGroup].sort(comparator);

  // For RR+WINS with mini-league (h2h criterion): detect sub-ties and resolve remaining 2-player ties
  const useMiniLeague = !isSwiss && qualificationMode === 'WINS' && priority.includes('h2h');

  if (useMiniLeague) {
    const getFullCompareKey = (s: GroupStanding) => buildCompareKey(s, priority, tiedIds, qualificationMode, isSwiss, show20s);

    // Find the h2h index in priority to build a "mini-league only" key for sub-tie detection
    const h2hIndex = priority.indexOf('h2h');
    const getMiniLeagueKey = (s: GroupStanding) => {
      const miniParts: string[] = [];
      miniParts.push(calculateMiniLeaguePoints(s, tiedIds).toString().padStart(5, '0'));
      if (show20s) miniParts.push(calculateMiniLeague20s(s, tiedIds).toString().padStart(5, '0'));
      return miniParts.join('-');
    };

    // First pass: detect truly unresolved ties
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
          a.tiedWith = undefined; a.tieReason = undefined;
          b.tiedWith = undefined; b.tieReason = undefined;
          result.push(h2h === 1 ? a : b, h2h === 1 ? b : a);
        } else {
          a.tiedWith = [b.participantId]; a.tieReason = 'unresolved';
          b.tiedWith = [a.participantId]; b.tieReason = 'unresolved';
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

    // Second pass: mark sub-ties (same mini-league key but resolved by later criteria)
    for (let k = 0; k < result.length - 1; k++) {
      const current = result[k];
      const next = result[k + 1];
      if (current.tiedWith && current.tiedWith.length > 0) continue;

      if (getMiniLeagueKey(current) === getMiniLeagueKey(next)) {
        current.tiedWith = current.tiedWith || [];
        if (!current.tiedWith.includes(next.participantId)) current.tiedWith.push(next.participantId);
        current.tieReason = 'twenties';
        next.tiedWith = next.tiedWith || [];
        if (!next.tiedWith.includes(current.participantId)) next.tiedWith.push(current.participantId);
        next.tieReason = 'twenties';
      }
    }

    sorted = result;
  } else {
    // Non mini-league path: resolve remaining 2-player ties with H2H
    sorted = resolveRemainingTwoPlayerTies(sorted, participantMap, s => {
      return Number(buildCompareKey(s, priority, tiedIds, qualificationMode, isSwiss, show20s).replace(/-/g, ''));
    });
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
  isSwiss: boolean,
  allStandings: GroupStanding[],
  show20s: boolean = true,
  priority: TiebreakerCriterion[] = DEFAULT_PRIORITY
): GroupStanding[] {
  if (tiedGroup.length === 1) {
    // No tie to resolve
    tiedGroup[0].tiedWith = undefined;
    tiedGroup[0].tieReason = undefined;
    return tiedGroup;
  }

  if (tiedGroup.length === 2) {
    return resolveTwoPlayerTie(tiedGroup, qualificationMode, participantMap, allStandings, isSwiss, show20s, priority);
  }

  return resolveMultiPlayerTie(tiedGroup, qualificationMode, participantMap, isSwiss, show20s, priority);
}

/**
 * Resolve tie-breakers in standings
 *
 * @param standings Current standings
 * @param participants Tournament participants (for ranking reference)
 * @param isSwiss Whether this is a Swiss system tournament
 * @param qualificationMode How players qualify: 'WINS' (2/1/0) or 'POINTS' (total scored)
 * @param show20s Whether 20s are tracked in this tournament (if false, skip 20s tiebreaker step)
 * @param tiebreakerPriority Custom priority order for tiebreaker criteria
 * @returns Sorted standings with positions and tie markers
 */
export function resolveTiebreaker(
  standings: GroupStanding[],
  participants: TournamentParticipant[],
  isSwiss: boolean = false,
  qualificationMode: QualificationMode = 'WINS',
  show20s: boolean = true,
  tiebreakerPriority?: TiebreakerCriterion[]
): GroupStanding[] {
  const priority = tiebreakerPriority && tiebreakerPriority.length > 0 ? tiebreakerPriority : DEFAULT_PRIORITY;
  // Create participant map for quick ranking lookup
  const participantMap = new Map<string, TournamentParticipant>();
  participants.forEach(p => participantMap.set(p.id, p));

  // Create a copy of standings to avoid mutating originals
  const standingsCopy = standings.map(s => ({ ...s }));

  // Calculate Buchholz for all standings upfront
  for (const standing of standingsCopy) {
    standing.buchholz = calculateBuchholz(standing, standingsCopy, isSwiss, qualificationMode);
  }

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
    const resolvedGroup = resolveTiedGroup(tiedGroup, qualificationMode, participantMap, isSwiss, standingsCopy, show20s, priority);
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
