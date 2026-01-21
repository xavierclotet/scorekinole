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

import type { GroupStanding, TournamentParticipant, SwissRankingSystem } from '$lib/types/tournament';

/**
 * Get the primary ranking value for a standing based on ranking system
 */
function getPrimaryValue(standing: GroupStanding, isSwiss: boolean, rankingSystem: SwissRankingSystem): number {
  if (isSwiss && rankingSystem === 'WINS') {
    return standing.swissPoints ?? (standing.matchesWon * 2 + standing.matchesTied);
  } else if (rankingSystem === 'POINTS') {
    return standing.totalPointsScored;
  } else {
    // Round Robin with WINS
    return standing.points;
  }
}

/**
 * Get head-to-head result between two participants
 * Returns: 1 if A wins, -1 if B wins, 0 if tied or no record
 */
function getHeadToHeadResult(standingA: GroupStanding, standingB: GroupStanding): number {
  if (standingA.headToHeadRecord) {
    const result = standingA.headToHeadRecord[standingB.participantId];
    console.log(`[TIEBREAKER] H2H lookup: ${standingA.participantId} vs ${standingB.participantId} = ${result || 'NO_RECORD'}`);
    if (result === 'WIN') return 1;
    if (result === 'LOSS') return -1;
    // TIE or undefined = 0
  } else {
    console.log(`[TIEBREAKER] H2H lookup: ${standingA.participantId} has NO headToHeadRecord`);
  }
  return 0;
}

/**
 * Resolve a tie between exactly 2 participants
 * Returns sorted array and marks unresolved ties
 */
function resolveTwoPlayerTie(
  tiedGroup: GroupStanding[],
  rankingSystem: SwissRankingSystem,
  participantMap: Map<string, TournamentParticipant>
): GroupStanding[] {
  const [a, b] = tiedGroup;

  console.log(`[TIEBREAKER] Resolving 2-player tie (${rankingSystem}):`);
  console.log(`  Player A: ${a.participantId}, 20s=${a.total20s}, h2hRecord=`, a.headToHeadRecord);
  console.log(`  Player B: ${b.participantId}, 20s=${b.total20s}, h2hRecord=`, b.headToHeadRecord);

  if (rankingSystem === 'WINS') {
    // WINS: head-to-head > 20s > unresolved

    // 1. Head-to-head
    const h2h = getHeadToHeadResult(a, b);
    console.log(`[TIEBREAKER] WINS mode - H2H result: ${h2h}`);
    if (h2h !== 0) {
      // Clear any previous tie markers
      a.tiedWith = undefined;
      a.tieReason = undefined;
      b.tiedWith = undefined;
      b.tieReason = undefined;
      console.log(`[TIEBREAKER] Resolved by H2H: winner=${h2h === 1 ? a.participantId : b.participantId}`);
      return h2h === 1 ? [a, b] : [b, a];
    }

    // Head-to-head was a tie (4-4), use 20s
    // 2. Total 20s
    console.log(`[TIEBREAKER] H2H tied, checking 20s: A=${a.total20s}, B=${b.total20s}`);
    if (a.total20s !== b.total20s) {
      a.tiedWith = undefined;
      a.tieReason = undefined;
      b.tiedWith = undefined;
      b.tieReason = undefined;
      console.log(`[TIEBREAKER] Resolved by 20s: winner=${a.total20s > b.total20s ? a.participantId : b.participantId}`);
      return a.total20s > b.total20s ? [a, b] : [b, a];
    }

    // 3. Unresolved - mark for admin
    console.log(`[TIEBREAKER] UNRESOLVED TIE between ${a.participantId} and ${b.participantId}`);
    a.tiedWith = [b.participantId];
    a.tieReason = 'unresolved';
    b.tiedWith = [a.participantId];
    b.tieReason = 'unresolved';

  } else {
    // POINTS: 20s > head-to-head > unresolved
    console.log(`[TIEBREAKER] POINTS mode - checking 20s first: A=${a.total20s}, B=${b.total20s}`);

    // 1. Total 20s
    if (a.total20s !== b.total20s) {
      a.tiedWith = undefined;
      a.tieReason = undefined;
      b.tiedWith = undefined;
      b.tieReason = undefined;
      console.log(`[TIEBREAKER] Resolved by 20s: winner=${a.total20s > b.total20s ? a.participantId : b.participantId}`);
      return a.total20s > b.total20s ? [a, b] : [b, a];
    }

    // 2. Head-to-head
    const h2h = getHeadToHeadResult(a, b);
    console.log(`[TIEBREAKER] 20s tied, checking H2H: result=${h2h}`);
    if (h2h !== 0) {
      a.tiedWith = undefined;
      a.tieReason = undefined;
      b.tiedWith = undefined;
      b.tieReason = undefined;
      console.log(`[TIEBREAKER] Resolved by H2H: winner=${h2h === 1 ? a.participantId : b.participantId}`);
      return h2h === 1 ? [a, b] : [b, a];
    }

    // 3. Unresolved - mark for admin
    console.log(`[TIEBREAKER] UNRESOLVED TIE between ${a.participantId} and ${b.participantId}`);
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
 * Resolve a tie between 3+ participants
 *
 * For WINS ranking: count head-to-head wins among tied players > 20s > unresolved
 * For POINTS ranking: 20s > count head-to-head wins > unresolved
 *
 * Returns sorted array and marks unresolved ties
 */
function resolveMultiPlayerTie(
  tiedGroup: GroupStanding[],
  rankingSystem: SwissRankingSystem,
  participantMap: Map<string, TournamentParticipant>
): GroupStanding[] {
  console.log(`[TIEBREAKER] Resolving ${tiedGroup.length}-player tie (${rankingSystem}):`);
  for (const s of tiedGroup) {
    const name = participantMap.get(s.participantId)?.name || s.participantId;
    console.log(`  - ${name}: 20s=${s.total20s}, h2hRecord=`, s.headToHeadRecord);
  }

  // Count head-to-head wins among the tied players
  const h2hWins = new Map<string, number>();

  // Initialize win counts
  for (const standing of tiedGroup) {
    h2hWins.set(standing.participantId, 0);
  }

  // Count head-to-head wins within the tied group
  console.log(`[TIEBREAKER] Counting H2H wins among tied players:`);
  for (let i = 0; i < tiedGroup.length; i++) {
    for (let j = i + 1; j < tiedGroup.length; j++) {
      const a = tiedGroup[i];
      const b = tiedGroup[j];
      const h2h = getHeadToHeadResult(a, b);

      if (h2h === 1) {
        h2hWins.set(a.participantId, h2hWins.get(a.participantId)! + 1);
        console.log(`    ${participantMap.get(a.participantId)?.name} beat ${participantMap.get(b.participantId)?.name}`);
      } else if (h2h === -1) {
        h2hWins.set(b.participantId, h2hWins.get(b.participantId)! + 1);
        console.log(`    ${participantMap.get(b.participantId)?.name} beat ${participantMap.get(a.participantId)?.name}`);
      } else {
        console.log(`    ${participantMap.get(a.participantId)?.name} vs ${participantMap.get(b.participantId)?.name} = TIE/NO_RECORD`);
      }
      // If h2h === 0 (tie 4-4), neither gets a win
    }
  }

  console.log(`[TIEBREAKER] H2H wins count:`);
  for (const [id, wins] of h2hWins.entries()) {
    console.log(`    ${participantMap.get(id)?.name}: ${wins} wins`);
  }

  // Sort based on ranking system
  const sorted = [...tiedGroup].sort((a, b) => {
    const winsA = h2hWins.get(a.participantId)!;
    const winsB = h2hWins.get(b.participantId)!;

    if (rankingSystem === 'WINS') {
      // WINS: head-to-head wins > 20s > ranking

      // 1. Head-to-head wins among tied players
      if (winsA !== winsB) {
        return winsB - winsA;
      }

      // 2. Total 20s
      if (a.total20s !== b.total20s) {
        return b.total20s - a.total20s;
      }
    } else {
      // POINTS: 20s > head-to-head wins > ranking

      // 1. Total 20s
      if (a.total20s !== b.total20s) {
        return b.total20s - a.total20s;
      }

      // 2. Head-to-head wins among tied players
      if (winsA !== winsB) {
        return winsB - winsA;
      }
    }

    // Fallback to initial ranking
    const participantA = participantMap.get(a.participantId);
    const participantB = participantMap.get(b.participantId);
    if (participantA && participantB) {
      return participantB.rankingSnapshot - participantA.rankingSnapshot;
    }

    return 0;
  });

  // Check for unresolved ties (players with same h2h wins and 20s)
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentWins = h2hWins.get(current.participantId)!;

    const tiedWithIds: string[] = [];

    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;

      const other = sorted[j];
      const otherWins = h2hWins.get(other.participantId)!;

      if (currentWins === otherWins && current.total20s === other.total20s) {
        tiedWithIds.push(other.participantId);
      }
    }

    if (tiedWithIds.length > 0) {
      current.tiedWith = tiedWithIds;
      current.tieReason = 'unresolved';
    } else {
      current.tiedWith = undefined;
      current.tieReason = undefined;
    }
  }

  return sorted;
}

/**
 * Resolve a group of tied participants
 */
function resolveTiedGroup(
  tiedGroup: GroupStanding[],
  rankingSystem: SwissRankingSystem,
  participantMap: Map<string, TournamentParticipant>
): GroupStanding[] {
  if (tiedGroup.length === 1) {
    // No tie to resolve
    tiedGroup[0].tiedWith = undefined;
    tiedGroup[0].tieReason = undefined;
    return tiedGroup;
  }

  if (tiedGroup.length === 2) {
    return resolveTwoPlayerTie(tiedGroup, rankingSystem, participantMap);
  }

  return resolveMultiPlayerTie(tiedGroup, rankingSystem, participantMap);
}

/**
 * Resolve tie-breakers in standings
 *
 * @param standings Current standings
 * @param participants Tournament participants (for ranking reference)
 * @param isSwiss Whether this is a Swiss system tournament
 * @param swissRankingSystem Swiss ranking system: 'WINS' or 'POINTS'
 * @returns Sorted standings with positions and tie markers
 */
export function resolveTiebreaker(
  standings: GroupStanding[],
  participants: TournamentParticipant[],
  isSwiss: boolean = false,
  swissRankingSystem: SwissRankingSystem = 'WINS'
): GroupStanding[] {
  console.log('========================================');
  console.log('[TIEBREAKER] Starting tiebreaker resolution');
  console.log(`[TIEBREAKER] isSwiss=${isSwiss}, rankingSystem=${swissRankingSystem}`);
  console.log(`[TIEBREAKER] Input standings (${standings.length} players):`);

  // Log all standings with full details
  for (const s of standings) {
    const participant = participants.find(p => p.id === s.participantId);
    console.log(`  - ${participant?.name || s.participantId}:`);
    console.log(`      position=${s.position}, points=${s.points}, swissPoints=${s.swissPoints}`);
    console.log(`      matchesWon=${s.matchesWon}, matchesTied=${s.matchesTied}, matchesLost=${s.matchesLost}`);
    console.log(`      total20s=${s.total20s}, totalPointsScored=${s.totalPointsScored}`);
    console.log(`      headToHeadRecord=`, s.headToHeadRecord);
    console.log(`      tiedWith=${JSON.stringify(s.tiedWith)}, tieReason=${s.tieReason}`);
  }

  // Create participant map for quick ranking lookup
  const participantMap = new Map<string, TournamentParticipant>();
  participants.forEach(p => participantMap.set(p.id, p));

  // Create a copy of standings to avoid mutating originals
  const standingsCopy = standings.map(s => ({ ...s }));

  // Group standings by primary value
  const groups = new Map<number, GroupStanding[]>();

  for (const standing of standingsCopy) {
    const primaryValue = getPrimaryValue(standing, isSwiss, swissRankingSystem);

    if (!groups.has(primaryValue)) {
      groups.set(primaryValue, []);
    }
    groups.get(primaryValue)!.push(standing);
  }

  // Sort groups by primary value (descending)
  const sortedPrimaryValues = [...groups.keys()].sort((a, b) => b - a);

  console.log(`[TIEBREAKER] Grouped by primary value:`);
  for (const pv of sortedPrimaryValues) {
    const group = groups.get(pv)!;
    const names = group.map(s => participantMap.get(s.participantId)?.name || s.participantId);
    console.log(`  Value ${pv}: [${names.join(', ')}] (${group.length} players)`);
  }

  // Resolve ties within each group and build final sorted list
  const result: GroupStanding[] = [];

  for (const primaryValue of sortedPrimaryValues) {
    const tiedGroup = groups.get(primaryValue)!;
    if (tiedGroup.length > 1) {
      console.log(`[TIEBREAKER] Processing tie at value ${primaryValue} with ${tiedGroup.length} players...`);
    }
    const resolvedGroup = resolveTiedGroup(tiedGroup, swissRankingSystem, participantMap);
    result.push(...resolvedGroup);
  }

  // Assign positions
  for (let i = 0; i < result.length; i++) {
    result[i].position = i + 1;
  }

  console.log(`[TIEBREAKER] Final result:`);
  for (const s of result) {
    const participant = participantMap.get(s.participantId);
    console.log(`  #${s.position}: ${participant?.name || s.participantId} - tiedWith=${JSON.stringify(s.tiedWith)}, tieReason=${s.tieReason}`);
  }
  console.log('========================================');

  return result;
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
