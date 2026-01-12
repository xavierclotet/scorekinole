/**
 * Round Robin scheduling algorithm
 * Uses the circle method with rotation (carousel pattern)
 */

import type {
  Group,
  RoundRobinRound,
  GroupMatch,
  TournamentParticipant
} from '$lib/types/tournament';

/**
 * Generate Round Robin schedule using circle method
 *
 * Algorithm:
 * - Fix position 1, rotate others clockwise
 * - Pairing: 1 vs N, 2 vs N-1, 3 vs N-2, etc.
 * - If N is odd, add "BYE" placeholder
 *
 * @param participants Array of participant IDs
 * @returns Array of rounds with matches
 */
export function generateRoundRobinSchedule(participants: string[]): RoundRobinRound[] {
  if (participants.length < 2) {
    throw new Error('Round Robin requires at least 2 participants');
  }

  // Add BYE if odd number of participants
  const players = [...participants];
  const hasBye = players.length % 2 !== 0;
  if (hasBye) {
    players.push('BYE');
  }

  const numPlayers = players.length;
  const numRounds = numPlayers - 1;
  const matchesPerRound = numPlayers / 2;

  const rounds: RoundRobinRound[] = [];

  // Generate each round
  for (let round = 0; round < numRounds; round++) {
    const matches: GroupMatch[] = [];

    // Generate matches for this round
    for (let match = 0; match < matchesPerRound; match++) {
      let home: number;
      let away: number;

      if (match === 0) {
        // First match: position 0 vs last position
        home = 0;
        away = numPlayers - 1;
      } else {
        // Other matches: symmetric pairing
        home = match;
        away = numPlayers - 1 - match;
      }

      const participantA = players[home];
      const participantB = players[away];

      // Skip BYE matches (they'll be added as walkovers)
      if (participantA !== 'BYE' && participantB !== 'BYE') {
        matches.push({
          id: `rr-r${round + 1}-m${match + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          participantA,
          participantB,
          status: 'PENDING'
        });
      } else {
        // Create walkover match for player vs BYE
        const realPlayer = participantA === 'BYE' ? participantB : participantA;
        matches.push({
          id: `rr-r${round + 1}-bye-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          participantA: realPlayer,
          participantB: 'BYE',
          status: 'WALKOVER',
          winner: realPlayer,
          gamesWonA: 2,
          gamesWonB: 0,
          walkedOverAt: Date.now()
        });
      }
    }

    rounds.push({
      roundNumber: round + 1,
      matches
    });

    // Rotate players (keep position 0 fixed, rotate others clockwise)
    if (round < numRounds - 1) {
      const lastPlayer = players.pop()!;
      players.splice(1, 0, lastPlayer);
    }
  }

  return rounds;
}

/**
 * Split participants into balanced groups using snake draft
 *
 * Algorithm:
 * - Sort participants by ELO (descending)
 * - Distribute using snake pattern: A, B, C, A, B, C, C, B, A, C, B, A...
 *
 * @param participants Array of tournament participants
 * @param numGroups Number of groups to create
 * @returns Array of groups with participants
 */
export function splitIntoGroups(
  participants: TournamentParticipant[],
  numGroups: number
): Group[] {
  if (numGroups < 1) {
    throw new Error('Number of groups must be at least 1');
  }

  if (participants.length < numGroups * 2) {
    throw new Error(`Not enough participants for ${numGroups} groups (minimum ${numGroups * 2})`);
  }

  if (numGroups === 1) {
    // Single group
    return [{
      id: `group-a-${Date.now()}`,
      name: 'Grupo Único',
      participants: participants.map(p => p.id),
      standings: []
    }];
  }

  // Sort participants by ELO (descending)
  const sortedParticipants = [...participants].sort((a, b) => b.eloSnapshot - a.eloSnapshot);

  // Initialize groups
  const groups: Group[] = [];
  const groupNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  for (let i = 0; i < numGroups; i++) {
    groups.push({
      id: `group-${groupNames[i].toLowerCase()}-${Date.now()}`,
      name: `Grupo ${groupNames[i]}`,
      participants: [],
      standings: []
    });
  }

  // Distribute using snake draft
  let currentGroup = 0;
  let direction = 1; // 1 = forward, -1 = backward

  for (const participant of sortedParticipants) {
    groups[currentGroup].participants.push(participant.id);

    currentGroup += direction;

    // Reverse direction at boundaries
    if (currentGroup >= numGroups) {
      currentGroup = numGroups - 1;
      direction = -1;
    } else if (currentGroup < 0) {
      currentGroup = 0;
      direction = 1;
    }
  }

  return groups;
}

/**
 * Calculate total number of rounds for Round Robin
 *
 * @param numParticipants Number of participants in the group
 * @param cycles Number of cycles (1 or 2)
 * @returns Total number of rounds
 */
export function calculateRoundRobinRounds(numParticipants: number, cycles: 1 | 2 = 1): number {
  const participants = numParticipants % 2 === 0 ? numParticipants : numParticipants + 1;
  return (participants - 1) * cycles;
}

/**
 * Validate Round Robin group size
 *
 * @param numParticipants Number of participants
 * @param maxPerGroup Maximum allowed per group (default 20)
 * @returns true if valid
 */
export function validateRoundRobinGroupSize(
  numParticipants: number,
  maxPerGroup: number = 20
): boolean {
  return numParticipants >= 2 && numParticipants <= maxPerGroup;
}

/**
 * Assign tables to Round Robin matches with rotation strategy
 *
 * Strategy:
 * 1. Each match in a round MUST have a unique table (parallel play)
 * 2. Rotate table assignments across rounds for variety
 * 3. Optimize for participants to play on different tables
 *
 * @param rounds Array of rounds with matches
 * @param totalTables Total number of tables available
 * @returns Rounds with table assignments
 */
export function assignTablesToRounds(
  rounds: RoundRobinRound[],
  totalTables: number
): RoundRobinRound[] {
  const assignedRounds = [...rounds];

  // Track table usage by participant across all rounds
  const tableHistory = new Map<string, number[]>();

  for (const round of assignedRounds) {
    // Track which tables are used in THIS round (must be unique)
    const tablesUsedInRound = new Set<number>();

    // For each match in this round
    for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
      const match = round.matches[matchIndex];

      if (match.participantB === 'BYE') {
        // BYE matches don't need tables
        continue;
      }

      // Get tables already used by these participants historically
      const usedByA = tableHistory.get(match.participantA) || [];
      const usedByB = tableHistory.get(match.participantB) || [];

      // Find the best available table that:
      // 1. Is NOT already used in this round (CRITICAL)
      // 2. Is least used by both participants historically
      let bestTable = 1;
      let minTotalUsage = Infinity;

      for (let table = 1; table <= totalTables; table++) {
        // CRITICAL: Skip if table already used in this round
        if (tablesUsedInRound.has(table)) {
          continue;
        }

        // Calculate historical usage
        const usageA = usedByA.filter(t => t === table).length;
        const usageB = usedByB.filter(t => t === table).length;
        const totalUsage = usageA + usageB;

        if (totalUsage < minTotalUsage) {
          minTotalUsage = totalUsage;
          bestTable = table;
        } else if (totalUsage === minTotalUsage) {
          // Tie-breaker: prefer tables not recently used
          const recentlyUsedByA = usedByA.length > 0 && usedByA[usedByA.length - 1] === table;
          const recentlyUsedByB = usedByB.length > 0 && usedByB[usedByB.length - 1] === table;

          if (!recentlyUsedByA && !recentlyUsedByB) {
            bestTable = table;
          }
        }
      }

      // Assign table to match
      match.tableNumber = bestTable;

      // Mark table as used in this round
      tablesUsedInRound.add(bestTable);

      // Update historical usage
      if (!tableHistory.has(match.participantA)) {
        tableHistory.set(match.participantA, []);
      }
      if (!tableHistory.has(match.participantB)) {
        tableHistory.set(match.participantB, []);
      }
      tableHistory.get(match.participantA)!.push(bestTable);
      tableHistory.get(match.participantB)!.push(bestTable);
    }
  }

  return assignedRounds;
}
