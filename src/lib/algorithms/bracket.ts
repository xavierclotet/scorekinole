/**
 * Single Elimination Bracket generation
 * Standard seeding pattern for fair brackets
 * Supports BYEs for non-power-of-2 participant counts
 */

import type {
  Bracket,
  BracketRound,
  BracketMatch,
  TournamentParticipant,
  GroupStanding
} from '$lib/types/tournament';

/**
 * Special constant for BYE participant
 * When a participant faces a BYE, they automatically advance
 */
export const BYE_PARTICIPANT = 'BYE';

/**
 * Check if a participant ID represents a BYE
 */
export function isBye(participantId: string | undefined): boolean {
  return participantId === BYE_PARTICIPANT;
}

/**
 * Generate single elimination bracket from qualified participants
 * Supports any number of participants >= 2 using BYEs
 *
 * For non-power-of-2 participant counts:
 * - Bracket size is rounded up to next power of 2
 * - Top seeds receive BYEs (skip first round)
 * - Number of BYEs = nextPowerOf2 - actualParticipants
 *
 * Example with 12 participants:
 * - Bracket size: 16 (next power of 2)
 * - BYEs: 4 (16 - 12)
 * - Seeds 1-4 get BYEs, seeds 5-12 play first round
 *
 * @param participants Qualified participants sorted by ranking
 * @returns Complete bracket structure with BYEs if needed
 */
export function generateBracket(participants: TournamentParticipant[]): Bracket {
  const numParticipants = participants.length;

  if (numParticipants < 2) {
    throw new Error('Bracket requires at least 2 participants');
  }

  // Calculate bracket size (next power of 2)
  const bracketSize = nextPowerOfTwo(numParticipants);
  const numByes = bracketSize - numParticipants;
  const totalRounds = Math.log2(bracketSize);
  const seeding = getBracketSeeding(bracketSize);
  const rounds: BracketRound[] = [];

  // Generate first round with BYEs
  const firstRoundMatches: BracketMatch[] = [];
  const matchesInFirstRound = bracketSize / 2;

  for (let i = 0; i < matchesInFirstRound; i++) {
    const [seedA, seedB] = seeding[i];

    // Get participant or BYE for each seed
    const participantA = seedA <= numParticipants ? participants[seedA - 1] : null;
    const participantB = seedB <= numParticipants ? participants[seedB - 1] : null;

    const isByeMatch = !participantA || !participantB;

    firstRoundMatches.push({
      id: `bracket-r1-m${i + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: i,
      participantA: participantA?.id || BYE_PARTICIPANT,
      participantB: participantB?.id || BYE_PARTICIPANT,
      seedA,
      seedB,
      // BYE matches are pre-completed with the real participant as winner
      status: isByeMatch ? 'COMPLETED' : 'PENDING',
      winner: isByeMatch ? (participantA?.id || participantB?.id) : undefined
    });
  }

  rounds.push({
    roundNumber: 1,
    name: numByes > 0 ? 'Ronda Preliminar' : getRoundName(1, totalRounds),
    matches: firstRoundMatches
  });

  // Generate subsequent rounds (with TBD participants)
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = Math.pow(2, totalRounds - round);
    const matches: BracketMatch[] = [];

    for (let i = 0; i < matchesInRound; i++) {
      const matchId = `bracket-r${round}-m${i + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Link previous round matches to this match
      const prevRound = rounds[round - 2];
      const prevMatch1 = prevRound.matches[i * 2];
      const prevMatch2 = prevRound.matches[i * 2 + 1];

      prevMatch1.nextMatchId = matchId;
      prevMatch2.nextMatchId = matchId;

      // Pre-fill participants from BYE matches
      let participantA: string | undefined;
      let participantB: string | undefined;
      let seedAValue: number | undefined;
      let seedBValue: number | undefined;

      // Check if prevMatch1 was a BYE match (already completed)
      if (prevMatch1.status === 'COMPLETED' && prevMatch1.winner &&
          (isBye(prevMatch1.participantA) || isBye(prevMatch1.participantB))) {
        participantA = prevMatch1.winner;
        seedAValue = isBye(prevMatch1.participantA) ? prevMatch1.seedB : prevMatch1.seedA;
      }

      // Check if prevMatch2 was a BYE match (already completed)
      if (prevMatch2.status === 'COMPLETED' && prevMatch2.winner &&
          (isBye(prevMatch2.participantA) || isBye(prevMatch2.participantB))) {
        participantB = prevMatch2.winner;
        seedBValue = isBye(prevMatch2.participantA) ? prevMatch2.seedB : prevMatch2.seedA;
      }

      matches.push({
        id: matchId,
        position: i,
        status: 'PENDING',
        participantA,
        participantB,
        seedA: seedAValue,
        seedB: seedBValue
      });
    }

    // Adjust round name when we have byes
    // If we have byes, the "real" rounds start from round 2
    const effectiveRound = numByes > 0 ? round - 1 : round;
    const effectiveTotalRounds = numByes > 0 ? totalRounds - 1 : totalRounds;

    rounds.push({
      roundNumber: round,
      name: numByes > 0 ? getRoundName(effectiveRound, effectiveTotalRounds) : getRoundName(round, totalRounds),
      matches
    });
  }

  // Create 3rd/4th place match if there are semifinals (4+ real participants)
  let thirdPlaceMatch: BracketMatch | undefined;
  if (numParticipants >= 4) {
    thirdPlaceMatch = {
      id: `bracket-3rd-place-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: 0,
      status: 'PENDING'
      // participantA and participantB will be filled with semifinal losers
    };
  }

  return {
    rounds,
    totalRounds,
    thirdPlaceMatch
  };
}

/**
 * Get standard bracket seeding pattern
 *
 * Seeding ensures best players don't meet until later rounds
 *
 * Examples:
 * - 4 participants: [1v4, 2v3]
 * - 8 participants: [1v8, 4v5, 2v7, 3v6]
 * - 16 participants: [1v16, 8v9, 4v13, 5v12, 2v15, 7v10, 3v14, 6v11]
 *
 * @param numParticipants Number of participants (must be power of 2)
 * @returns Array of [seedA, seedB] pairs
 */
export function getBracketSeeding(numParticipants: number): [number, number][] {
  if (!isPowerOfTwo(numParticipants)) {
    throw new Error('Number of participants must be a power of 2');
  }

  // Start with 1v2
  let seeds: number[] = [1, 2];

  // Double the bracket for each round
  const rounds = Math.log2(numParticipants);

  for (let round = 1; round < rounds; round++) {
    const newSeeds: number[] = [];
    const nextSeed = seeds.length + 1;

    for (const seed of seeds) {
      newSeeds.push(seed);
      newSeeds.push(nextSeed + seeds.length - seed);
    }

    seeds = newSeeds;
  }

  // Convert to pairs
  const pairs: [number, number][] = [];
  for (let i = 0; i < seeds.length; i += 2) {
    pairs.push([seeds[i], seeds[i + 1]]);
  }

  return pairs;
}

/**
 * Get round name based on round number and total rounds
 *
 * @param roundNumber Current round number (1-indexed)
 * @param totalRounds Total number of rounds
 * @returns Localized round name
 */
export function getRoundName(roundNumber: number, totalRounds: number): string {
  const matchesInRound = Math.pow(2, totalRounds - roundNumber);

  if (roundNumber === totalRounds) {
    return 'Final';
  }

  if (roundNumber === totalRounds - 1) {
    return 'Semifinales';
  }

  if (roundNumber === totalRounds - 2) {
    return 'Cuartos de Final';
  }

  if (roundNumber === totalRounds - 3) {
    return 'Octavos de Final';
  }

  // For larger brackets
  return `Ronda de ${matchesInRound * 2}`;
}

/**
 * Advance winner to next match
 * Also advances loser to 3rd/4th place match if it's a semifinal
 *
 * @param bracket Current bracket
 * @param matchId Match ID of completed match
 * @param winnerId Participant ID of winner
 * @returns Updated bracket
 */
export function advanceWinner(
  bracket: Bracket,
  matchId: string,
  winnerId: string
): Bracket {
  const updatedBracket = JSON.parse(JSON.stringify(bracket)) as Bracket;

  // Check if this is the 3rd place match
  if (updatedBracket.thirdPlaceMatch?.id === matchId) {
    return updatedBracket; // No advancement needed for 3rd place match
  }

  // Find the match
  let completedMatch: BracketMatch | undefined;
  let roundIndex = -1;

  for (let i = 0; i < updatedBracket.rounds.length; i++) {
    const match = updatedBracket.rounds[i].matches.find(m => m.id === matchId);
    if (match) {
      completedMatch = match;
      roundIndex = i;
      break;
    }
  }

  if (!completedMatch) {
    return updatedBracket; // Match not found
  }

  // Check if this is a semifinal match (second to last round)
  const isSemifinal = roundIndex === updatedBracket.rounds.length - 2;

  // Advance loser to 3rd place match if it's a semifinal
  if (isSemifinal && updatedBracket.thirdPlaceMatch) {
    const loserId = completedMatch.participantA === winnerId
      ? completedMatch.participantB
      : completedMatch.participantA;

    if (loserId) {
      const currentMatchIndex = updatedBracket.rounds[roundIndex].matches.indexOf(completedMatch);
      const isFirstSemifinal = currentMatchIndex === 0;

      if (isFirstSemifinal) {
        updatedBracket.thirdPlaceMatch.participantA = loserId;
      } else {
        updatedBracket.thirdPlaceMatch.participantB = loserId;
      }
    }
  }

  // If no next match (final), just return
  if (!completedMatch.nextMatchId) {
    return updatedBracket;
  }

  // Find next match
  const nextRound = updatedBracket.rounds[roundIndex + 1];
  const nextMatch = nextRound.matches.find(m => m.id === completedMatch!.nextMatchId);

  if (!nextMatch) {
    return updatedBracket;
  }

  // Determine which slot (A or B)
  const currentMatchIndex = updatedBracket.rounds[roundIndex].matches.indexOf(completedMatch);
  const isFirstOfPair = currentMatchIndex % 2 === 0;

  if (isFirstOfPair) {
    nextMatch.participantA = winnerId;
    if (completedMatch.seedA && completedMatch.winner === completedMatch.participantA) {
      nextMatch.seedA = completedMatch.seedA;
    } else if (completedMatch.seedB && completedMatch.winner === completedMatch.participantB) {
      nextMatch.seedA = completedMatch.seedB;
    }
  } else {
    nextMatch.participantB = winnerId;
    if (completedMatch.seedA && completedMatch.winner === completedMatch.participantA) {
      nextMatch.seedB = completedMatch.seedA;
    } else if (completedMatch.seedB && completedMatch.winner === completedMatch.participantB) {
      nextMatch.seedB = completedMatch.seedB;
    }
  }

  return updatedBracket;
}

/**
 * Check if number is power of 2
 */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Get next power of 2 (for bracket size adjustment)
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  if (isPowerOfTwo(n)) return n;

  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
}

/**
 * Calculate qualified participants for bracket based on group standings
 *
 * @param groups Array of groups with standings
 * @param qualifiersPerGroup Number of qualifiers per group
 * @returns Sorted array of qualified participants
 */
export function getQualifiedParticipants(
  groups: { standings: GroupStanding[] }[],
  qualifiersPerGroup: number
): string[] {
  const qualified: { participantId: string; position: number; groupIndex: number }[] = [];

  groups.forEach((group, groupIndex) => {
    const sorted = [...group.standings].sort((a, b) => a.position - b.position);

    for (let i = 0; i < Math.min(qualifiersPerGroup, sorted.length); i++) {
      qualified.push({
        participantId: sorted[i].participantId,
        position: i + 1,
        groupIndex
      });
    }
  });

  // Sort qualified: 1st from group A, 1st from group B, ..., 2nd from group A, 2nd from group B, ...
  qualified.sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return a.groupIndex - b.groupIndex;
  });

  return qualified.map(q => q.participantId);
}
