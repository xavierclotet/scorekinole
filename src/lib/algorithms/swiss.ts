/**
 * Swiss pairing algorithm
 * Maximizes variety of opponents and tables
 */

import type {
  GroupMatch,
  TournamentParticipant,
  GroupStanding,
  SwissPairing
} from '$lib/types/tournament';

/**
 * Generate Swiss pairings for a round
 *
 * Round 1: Random pairings
 * Subsequent rounds:
 * - Sort by points
 * - Pair within point groups (top vs top)
 * - Avoid repeat pairings
 * - Maximize table variety
 *
 * @param participants Tournament participants
 * @param standings Current standings
 * @param previousPairings Previous pairings to avoid repeats
 * @param roundNumber Current round number
 * @param tableHistory Table usage history for variety
 * @returns Array of matches for this round
 */
export function generateSwissPairings(
  participants: TournamentParticipant[],
  standings: GroupStanding[],
  previousPairings: SwissPairing[],
  roundNumber: number,
  tableHistory?: Map<string, number[]>
): GroupMatch[] {
  if (roundNumber === 1) {
    return generateRandomPairings(participants);
  }

  return generatePointBasedPairings(participants, standings, previousPairings);
}

/**
 * Get set of participant IDs who have already received a BYE
 */
function getByeHistory(previousPairings: SwissPairing[]): Set<string> {
  const byeReceivers = new Set<string>();
  previousPairings.forEach(pairing => {
    pairing.matches.forEach(match => {
      if (match.participantB === 'BYE') {
        byeReceivers.add(match.participantA);
      }
    });
  });
  return byeReceivers;
}

/**
 * Generate random pairings for round 1
 */
/**
 * Fisher-Yates shuffle for uniform random distribution
 */
function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateRandomPairings(participants: TournamentParticipant[]): GroupMatch[] {
  const shuffled = fisherYatesShuffle(participants);
  const matches: GroupMatch[] = [];

  // Add BYE if odd
  const hasBye = shuffled.length % 2 !== 0;
  if (hasBye) {
    const byePlayer = shuffled.pop()!;
    matches.push(createByeMatch(byePlayer.id, 1));
  }

  // Create matches
  for (let i = 0; i < shuffled.length; i += 2) {
    matches.push({
      id: `swiss-r1-m${Math.floor(i / 2) + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      participantA: shuffled[i].id,
      participantB: shuffled[i + 1].id,
      status: 'PENDING'
    });
  }

  return matches;
}

/**
 * Generate point-based pairings for subsequent rounds
 *
 * BYE distribution: Each participant should receive at most 1 BYE before
 * anyone receives a second BYE. Among eligible players, the lowest-ranked
 * player (by Swiss points) gets the BYE.
 */
function generatePointBasedPairings(
  participants: TournamentParticipant[],
  standings: GroupStanding[],
  previousPairings: SwissPairing[]
): GroupMatch[] {
  // Create map of participant standings
  // NOTE: standings are recalculated fresh before calling this function
  const standingsMap = new Map<string, GroupStanding>();
  standings.forEach(s => standingsMap.set(s.participantId, s));

  // Helper to get Swiss points from standings (already recalculated)
  const getSwissPoints = (id: string): number => {
    const s = standingsMap.get(id);
    if (!s) return 0;
    return s.swissPoints ?? s.points ?? (s.matchesWon * 2 + s.matchesTied);
  };

  // Sort participants by Swiss points (2/1/0) descending
  // This ensures players with similar scores are paired together
  const sorted = [...participants].sort((a, b) => {
    return getSwissPoints(b.id) - getSwissPoints(a.id);
  });

  // Build set of previous pairings for quick lookup
  const previousPairs = new Set<string>();
  previousPairings.forEach(pairing => {
    pairing.matches.forEach(match => {
      if (match.participantB !== 'BYE') {
        const pair = [match.participantA, match.participantB].sort().join('-');
        previousPairs.add(pair);
      }
    });
  });

  // Get BYE history - who has already received a BYE
  const byeHistory = getByeHistory(previousPairings);

  // Handle odd number of participants - assign BYE first
  const matches: GroupMatch[] = [];
  const paired = new Set<string>();
  let matchCounter = 1;
  const roundNumber = previousPairings.length + 1;

  if (sorted.length % 2 !== 0) {
    // Find the best candidate for BYE:
    // 1. Prioritize players who haven't had a BYE yet
    // 2. Among those, pick the weakest player by:
    //    a. Fewest Swiss points
    //    b. Fewest total points scored
    //    c. Fewest total 20s

    // Sort candidates specifically for BYE assignment (weakest first)
    const byeSort = (a: TournamentParticipant, b: TournamentParticipant) => {
      // 1. Fewest Swiss points (from fresh standings)
      const aSwiss = getSwissPoints(a.id);
      const bSwiss = getSwissPoints(b.id);
      if (aSwiss !== bSwiss) return aSwiss - bSwiss;

      const aS = standingsMap.get(a.id);
      const bS = standingsMap.get(b.id);
      if (!aS || !bS) return 0;

      // 2. Fewest total Crokinole points scored
      if (aS.totalPointsScored !== bS.totalPointsScored) return aS.totalPointsScored - bS.totalPointsScored;

      // 3. Fewest total 20s
      if (aS.total20s !== bS.total20s) return aS.total20s - bS.total20s;

      // 4. Lowest Buchholz
      return (aS.buchholz ?? 0) - (bS.buchholz ?? 0);
    };

    // Get players who haven't had BYE yet
    const neverHadBye = sorted.filter(p => !byeHistory.has(p.id));

    let byeCandidate: TournamentParticipant;
    let byePool: TournamentParticipant[];

    if (neverHadBye.length > 0) {
      // Pick the weakest player who hasn't had BYE
      byePool = [...neverHadBye].sort(byeSort);
      byeCandidate = byePool[0];
    } else {
      // Everyone has had at least one BYE, pick weakest overall
      byePool = [...sorted].sort(byeSort);
      byeCandidate = byePool[0];
    }

    // Assign BYE to this player
    matches.push(createByeMatch(byeCandidate.id, roundNumber));
    paired.add(byeCandidate.id);
  }

  // Pair remaining participants
  for (let i = 0; i < sorted.length; i++) {
    if (paired.has(sorted[i].id)) continue;

    const participantA = sorted[i];
    let participantB: TournamentParticipant | null = null;

    // Find best opponent (same point group, not previously paired)
    for (let j = i + 1; j < sorted.length; j++) {
      if (paired.has(sorted[j].id)) continue;

      const candidate = sorted[j];
      const pairKey = [participantA.id, candidate.id].sort().join('-');

      // Check if already paired before
      if (!previousPairs.has(pairKey)) {
        participantB = candidate;
        break;
      }
    }

    // If no unpaired opponent found, pair with next available
    if (!participantB) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (!paired.has(sorted[j].id)) {
          participantB = sorted[j];
          break;
        }
      }
    }

    if (participantB) {
      paired.add(participantA.id);
      paired.add(participantB.id);

      matches.push({
        id: `swiss-r${roundNumber}-m${matchCounter++}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        participantA: participantA.id,
        participantB: participantB.id,
        status: 'PENDING'
      });
    }
  }

  return matches;
}

/**
 * Create a BYE match (automatic win)
 */
function createByeMatch(participantId: string, roundNumber: number): GroupMatch {
  return {
    id: `swiss-r${roundNumber}-bye-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    participantA: participantId,
    participantB: 'BYE',
    status: 'WALKOVER',
    winner: participantId,
    gamesWonA: 2,
    gamesWonB: 0,
    totalPointsA: 8,
    totalPointsB: 0,
    total20sA: 0,
    total20sB: 0,
    walkedOverAt: Date.now()
  };
}

/**
 * Assign tables to matches with variety optimization
 *
 * Only assigns tables up to the number of available tables.
 * Matches without tables show "TBD" and get assigned when a table frees up.
 *
 * CRITICAL: No table is duplicated within the same round.
 *
 * @param matches Matches to assign tables
 * @param totalTables Total number of tables available
 * @param tableHistory History of table usage per participant
 * @param tablesAlreadyUsed Tables already used in this round (for cross-group coordination)
 * @returns Matches with table assignments (some may have no table if more matches than tables)
 */
export function assignTablesWithVariety(
  matches: GroupMatch[],
  totalTables: number,
  tableHistory: Map<string, number[]> = new Map(),
  tablesAlreadyUsed: Set<number> = new Set()
): GroupMatch[] {
  const assignedMatches = [...matches];

  // Track tables used in THIS round (must be unique)
  const tablesUsedInRound = new Set<number>(tablesAlreadyUsed);

  for (const match of assignedMatches) {
    if (match.participantB === 'BYE') {
      // BYE matches don't need tables
      continue;
    }

    // Get tables already used by these participants historically
    const usedByA = tableHistory.get(match.participantA) || [];
    const usedByB = tableHistory.get(match.participantB) || [];

    // Build usage maps for O(1) lookup
    const usageMapA = new Map<number, number>();
    const usageMapB = new Map<number, number>();
    for (const t of usedByA) usageMapA.set(t, (usageMapA.get(t) || 0) + 1);
    for (const t of usedByB) usageMapB.set(t, (usageMapB.get(t) || 0) + 1);

    // Compute minimum usage across ALL tables (cycle level)
    let minA = Infinity;
    let minB = Infinity;
    for (let t = 1; t <= totalTables; t++) {
      minA = Math.min(minA, usageMapA.get(t) || 0);
      minB = Math.min(minB, usageMapB.get(t) || 0);
    }
    if (minA === Infinity) minA = 0;
    if (minB === Infinity) minB = 0;

    // Track global table usage across ALL matches (for diversity tiebreak)
    const globalTableUsage = new Map<number, number>();
    for (const hist of tableHistory.values()) {
      for (const t of hist) {
        globalTableUsage.set(t, (globalTableUsage.get(t) || 0) + 1);
      }
    }

    // Find the best available table using Fair Table Rotation:
    // 1. Is NOT already used in this round (CRITICAL - no duplicates)
    // 2. Lowest primaryScore = max(deltaA, deltaB) — cycle fairness
    // 3. Lowest maxUsage = max(uA, uB) — prefer tables neither player has visited much
    // 4. Lowest secondaryScore = uA + uB — combined balance
    // 5. Lowest globalUsage — spread load across all tables in the tournament
    // 6. Not recently used — recency tiebreak
    let bestTable: number | null = null;
    let bestPrimary = Infinity;
    let bestMaxUsage = Infinity;
    let bestSecondary = Infinity;
    let bestGlobal = Infinity;

    for (let table = 1; table <= totalTables; table++) {
      // CRITICAL: Skip if table already used in this round
      if (tablesUsedInRound.has(table)) {
        continue;
      }

      const uA = usageMapA.get(table) || 0;
      const uB = usageMapB.get(table) || 0;

      const deltaA = uA - minA;
      const deltaB = uB - minB;
      const primaryScore = Math.max(deltaA, deltaB);
      const maxUsage = Math.max(uA, uB);
      const secondaryScore = uA + uB;
      const globalUsage = globalTableUsage.get(table) || 0;

      // Compare tuple: (primaryScore, maxUsage, secondaryScore, globalUsage) — all ascending
      if (primaryScore < bestPrimary
          || (primaryScore === bestPrimary && maxUsage < bestMaxUsage)
          || (primaryScore === bestPrimary && maxUsage === bestMaxUsage && secondaryScore < bestSecondary)
          || (primaryScore === bestPrimary && maxUsage === bestMaxUsage && secondaryScore === bestSecondary && globalUsage < bestGlobal)) {
        bestPrimary = primaryScore;
        bestMaxUsage = maxUsage;
        bestSecondary = secondaryScore;
        bestGlobal = globalUsage;
        bestTable = table;
      } else if (primaryScore === bestPrimary && maxUsage === bestMaxUsage
                 && secondaryScore === bestSecondary && globalUsage === bestGlobal) {
        // Final tie-breaker: prefer tables not recently used by either player
        const recentA = usedByA.length > 0 && usedByA[usedByA.length - 1] === table;
        const recentB = usedByB.length > 0 && usedByB[usedByB.length - 1] === table;
        const currentRecentA = usedByA.length > 0 && usedByA[usedByA.length - 1] === bestTable;
        const currentRecentB = usedByB.length > 0 && usedByB[usedByB.length - 1] === bestTable;

        if ((!recentA && !recentB) && (currentRecentA || currentRecentB)) {
          bestTable = table;
        }
      }
    }

    // If no table available, leave tableNumber undefined (will show TBD)
    if (bestTable === null) {
      // No table assigned - match will wait for a table to free up
      continue;
    }

    match.tableNumber = bestTable;

    // Mark table as used in this round
    tablesUsedInRound.add(bestTable);

    // Update history
    if (!tableHistory.has(match.participantA)) {
      tableHistory.set(match.participantA, []);
    }
    if (!tableHistory.has(match.participantB)) {
      tableHistory.set(match.participantB, []);
    }
    tableHistory.get(match.participantA)!.push(bestTable);
    tableHistory.get(match.participantB)!.push(bestTable);
  }

  return assignedMatches;
}

/**
 * Validate Swiss system configuration
 *
 * @param numParticipants Number of participants
 * @param numRounds Number of rounds
 * @returns true if valid
 */
export function validateSwissSystem(numParticipants: number, numRounds: number): boolean {
  // Need at least 4 participants
  if (numParticipants < 4) return false;

  // Typical Swiss has 3-7 rounds
  // Maximum reasonable: log2(participants) + 2
  const maxRounds = Math.ceil(Math.log2(numParticipants)) + 2;

  return numRounds >= 3 && numRounds <= maxRounds;
}
