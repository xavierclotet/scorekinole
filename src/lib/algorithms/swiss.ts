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
function generateRandomPairings(participants: TournamentParticipant[]): GroupMatch[] {
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
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
  const standingsMap = new Map<string, GroupStanding>();
  standings.forEach(s => standingsMap.set(s.participantId, s));

  // Sort participants by Swiss points (2/1/0) descending
  // This ensures players with similar scores are paired together
  const sorted = [...participants].sort((a, b) => {
    const aStanding = standingsMap.get(a.id);
    const bStanding = standingsMap.get(b.id);
    if (!aStanding || !bStanding) return 0;

    // Use swissPoints if available, otherwise calculate from wins/ties
    const aSwiss = aStanding.swissPoints ?? (aStanding.matchesWon * 2 + aStanding.matchesTied);
    const bSwiss = bStanding.swissPoints ?? (bStanding.matchesWon * 2 + bStanding.matchesTied);
    return bSwiss - aSwiss;
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
    // 2. Among those, pick the lowest-ranked (last in sorted order)

    // Get players who haven't had BYE yet
    const neverHadBye = sorted.filter(p => !byeHistory.has(p.id));

    let byeCandidate: TournamentParticipant;

    if (neverHadBye.length > 0) {
      // Pick the lowest-ranked player who hasn't had BYE
      byeCandidate = neverHadBye[neverHadBye.length - 1];
    } else {
      // Everyone has had at least one BYE, pick lowest-ranked overall
      byeCandidate = sorted[sorted.length - 1];
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

    // Find the best available table that:
    // 1. Is NOT already used in this round (CRITICAL - no duplicates)
    // 2. Has least usage by both participants historically
    let bestTable: number | null = null;
    let minUsage = Infinity;

    for (let table = 1; table <= totalTables; table++) {
      // CRITICAL: Skip if table already used in this round
      if (tablesUsedInRound.has(table)) {
        continue;
      }

      // Calculate historical usage
      const usageA = usedByA.filter(t => t === table).length;
      const usageB = usedByB.filter(t => t === table).length;
      const totalUsage = usageA + usageB;

      if (totalUsage < minUsage) {
        minUsage = totalUsage;
        bestTable = table;
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
