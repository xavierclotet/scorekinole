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
  GroupStanding,
  ConsolationBracket
} from '$lib/types/tournament';

export type ConsolationSource = 'QF' | 'R16' | 'R32' | 'R64';

/** Number of matches in the source round */
function getSourcePositions(source: ConsolationSource): number {
  switch (source) {
    case 'QF':  return 4;
    case 'R16': return 8;
    case 'R32': return 16;
    case 'R64': return 32;
  }
}

/** Starting position for consolation rankings */
function getSourceStartPosition(source: ConsolationSource): number {
  switch (source) {
    case 'QF':  return 5;   // positions 5-8
    case 'R16': return 9;   // positions 9-16
    case 'R32': return 17;  // positions 17-32
    case 'R64': return 33;  // positions 33-64
  }
}

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
 * Build a map of participantId → seed from the first round of one or more brackets.
 * Seeds are fixed from group stage and never change, so we only need R1 data.
 * Works for both main brackets and consolation brackets.
 */
export function buildSeedMap(
  ...brackets: (
    | { rounds: { matches: BracketMatch[] }[]; thirdPlaceMatch?: BracketMatch; consolationBrackets?: ConsolationBracket[] }
    | null
    | undefined
  )[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const bracket of brackets) {
    if (!bracket?.rounds?.[0]?.matches) continue;
    for (const match of bracket.rounds[0].matches) {
      if (match.participantA && match.seedA && !isBye(match.participantA)) {
        map.set(match.participantA, match.seedA);
      }
      if (match.participantB && match.seedB && !isBye(match.participantB)) {
        map.set(match.participantB, match.seedB);
      }
    }
    // Also include consolation brackets (same original seeds)
    if (bracket.consolationBrackets) {
      for (const cb of bracket.consolationBrackets) {
        if (!cb.rounds?.[0]?.matches) continue;
        for (const match of cb.rounds[0].matches) {
          if (match.participantA && match.seedA && !isBye(match.participantA)) {
            map.set(match.participantA, match.seedA);
          }
          if (match.participantB && match.seedB && !isBye(match.participantB)) {
            map.set(match.participantB, match.seedB);
          }
        }
      }
    }
  }
  return map;
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
 * @param thirdPlaceMatchEnabled Whether to generate 3rd/4th place match (default: true)
 * @param seedOffset Offset to add to all seed values (e.g., goldParticipants.length for silver bracket)
 * @returns Complete bracket structure with BYEs if needed
 */
export function generateBracket(participants: TournamentParticipant[], thirdPlaceMatchEnabled: boolean = true, seedOffset: number = 0): Bracket {
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
      seedA: seedA + seedOffset,
      seedB: seedB + seedOffset,
      // BYE matches are pre-completed with the real participant as winner
      status: isByeMatch ? 'COMPLETED' : 'PENDING',
      winner: isByeMatch ? (participantA?.id || participantB?.id) : undefined
    });
  }

  // Always use getRoundName for consistency - it returns roundX based on bracket size
  rounds.push({
    roundNumber: 1,
    name: getRoundName(1, totalRounds),
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

  // Create 3rd/4th place match if enabled and there are semifinals (4+ real participants)
  let thirdPlaceMatch: BracketMatch | undefined;
  if (thirdPlaceMatchEnabled && numParticipants >= 4) {
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
 * Uses English names internally for consistency with time calculations
 *
 * @param roundNumber Current round number (1-indexed)
 * @param totalRounds Total number of rounds
 * @returns Round name in English (for internal use)
 */
export function getRoundName(roundNumber: number, totalRounds: number): string {
  const matchesInRound = Math.pow(2, totalRounds - roundNumber);

  if (roundNumber === totalRounds) {
    return 'finals';
  }

  if (roundNumber === totalRounds - 1) {
    return 'semifinals';
  }

  if (roundNumber === totalRounds - 2) {
    return 'quarterfinals';
  }

  if (roundNumber === totalRounds - 3) {
    return 'round16';
  }

  // For larger brackets
  return `round${matchesInRound * 2}`;
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

  console.log(`🔀 advanceWinner called: matchId=${matchId}, winnerId=${winnerId?.substring(0, 12)}`);

  // Check if this is the 3rd place match
  if (updatedBracket.thirdPlaceMatch?.id === matchId) {
    console.log('🔀 Match is 3rd place match, no advancement needed');
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
    console.warn('🔀 ⚠️ Match not found in bracket!');
    return updatedBracket; // Match not found
  }

  console.log(`🔀 Found match at round ${roundIndex}, participantA=${completedMatch.participantA?.substring(0, 12)}, participantB=${completedMatch.participantB?.substring(0, 12)}, winner=${completedMatch.winner?.substring(0, 12)}`);

  // Check if this is a semifinal match (second to last round)
  const isSemifinal = roundIndex === updatedBracket.rounds.length - 2;
  console.log(`🔀 isSemifinal=${isSemifinal} (roundIndex=${roundIndex}, totalRounds=${updatedBracket.rounds.length})`);

  // Advance loser to 3rd place match if it's a semifinal
  if (isSemifinal && updatedBracket.thirdPlaceMatch) {
    const loserId = completedMatch.participantA === winnerId
      ? completedMatch.participantB
      : completedMatch.participantA;

    if (loserId) {
      const currentMatchIndex = updatedBracket.rounds[roundIndex].matches.indexOf(completedMatch);
      const isFirstSemifinal = currentMatchIndex === 0;
      console.log(`🔀 SF loser ${loserId?.substring(0, 12)} -> 3rd place match slot ${isFirstSemifinal ? 'A' : 'B'}`);

      if (isFirstSemifinal) {
        updatedBracket.thirdPlaceMatch.participantA = loserId;
      } else {
        updatedBracket.thirdPlaceMatch.participantB = loserId;
      }
    }
  }

  // If no next match (final), just return
  if (!completedMatch.nextMatchId) {
    console.log('🔀 No nextMatchId (final match), returning');
    return updatedBracket;
  }

  // Find next match
  const nextRound = updatedBracket.rounds[roundIndex + 1];
  const nextMatch = nextRound.matches.find(m => m.id === completedMatch!.nextMatchId);

  if (!nextMatch) {
    console.warn('🔀 ⚠️ Next match not found!');
    return updatedBracket;
  }

  // Determine which slot (A or B)
  const currentMatchIndex = updatedBracket.rounds[roundIndex].matches.indexOf(completedMatch);
  const isFirstOfPair = currentMatchIndex % 2 === 0;

  console.log(`🔀 Advancing winner ${winnerId?.substring(0, 12)} to next match ${nextMatch.id?.substring(0, 20)}, slot ${isFirstOfPair ? 'A' : 'B'} (matchIndex=${currentMatchIndex})`);
  console.log(`🔀 Next match BEFORE: participantA=${nextMatch.participantA?.substring(0, 12) || 'none'}, participantB=${nextMatch.participantB?.substring(0, 12) || 'none'}`);

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

  console.log(`🔀 Next match AFTER: participantA=${nextMatch.participantA?.substring(0, 12) || 'none'}, participantB=${nextMatch.participantB?.substring(0, 12) || 'none'}`);

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

/**
 * Generate a consolation bracket for eliminated players
 * Used to determine exact positions for losers of QF or R16
 *
 * @param losers Array of participant IDs who lost in the source round
 * @param source Which round these losers came from ('QF' or 'R16')
 * @returns ConsolationBracket structure
 */
export function generateConsolationBracket(
  losers: { participantId: string; seed?: number }[],
  source: ConsolationSource,
  bracketType: 'gold' | 'silver' = 'gold'
): ConsolationBracket {
  const numLosers = losers.length;
  const expectedLosers = getSourcePositions(source);

  if (numLosers !== expectedLosers) {
    throw new Error(`Consolation bracket for ${source} expects ${expectedLosers} losers, got ${numLosers}`);
  }

  // Starting position for this consolation bracket
  const startPosition = getSourceStartPosition(source);

  // Sort losers by seed (best seeds first)
  const sortedLosers = [...losers].sort((a, b) => (a.seed || 999) - (b.seed || 999));

  // Calculate bracket size and rounds
  const totalRounds = Math.log2(expectedLosers); // QF=2, R16=3, R32=4, R64=5
  const rounds: BracketRound[] = [];

  // Generate first round with proper seeding (1vs4, 2vs3 for 4 players)
  // For 8 players: standard bracket seeding
  const firstRoundMatches: BracketMatch[] = [];
  const seeding = source === 'QF'
    ? [[0, 3], [1, 2]] // 1vs4, 2vs3 (0-indexed)
    : [[0, 7], [3, 4], [1, 6], [2, 5]]; // Standard 8-player seeding (0-indexed)

  for (let i = 0; i < seeding.length; i++) {
    const [seedAIdx, seedBIdx] = seeding[i];
    const participantA = sortedLosers[seedAIdx];
    const participantB = sortedLosers[seedBIdx];

    firstRoundMatches.push({
      // Deterministic ID based on bracket type, source, round, and position (so regeneration preserves matches)
      id: `consolation-${bracketType}-${source}-r1-m${i + 1}`,
      position: i,
      participantA: participantA.participantId,
      participantB: participantB.participantId,
      seedA: participantA.seed,
      seedB: participantB.seed,
      status: 'PENDING'
    });
  }

  rounds.push({
    roundNumber: 1,
    name: getConsolationRoundName(1, totalRounds, startPosition),
    matches: firstRoundMatches
  });

  // Generate subsequent rounds
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = Math.pow(2, totalRounds - round);
    const matches: BracketMatch[] = [];

    for (let i = 0; i < matchesInRound; i++) {
      // Deterministic ID based on bracket type, source, round, and position (so regeneration preserves matches)
      const matchId = `consolation-${bracketType}-${source}-r${round}-m${i + 1}`;

      // Link previous round matches to this match
      const prevRound = rounds[round - 2];
      const prevMatch1 = prevRound.matches[i * 2];
      const prevMatch2 = prevRound.matches[i * 2 + 1];

      prevMatch1.nextMatchId = matchId;
      prevMatch2.nextMatchId = matchId;

      matches.push({
        id: matchId,
        position: i,
        status: 'PENDING'
      });
    }

    rounds.push({
      roundNumber: round,
      name: getConsolationRoundName(round, totalRounds, startPosition),
      matches
    });
  }

  return {
    source,
    rounds,
    totalRounds,
    startPosition,
    isComplete: false
  };
}

/**
 * Get round name for consolation bracket
 * Shows position range being determined at each round
 * @param roundNumber Current round number (1-based)
 * @param totalRounds Total number of rounds in this consolation bracket
 * @param startPosition Starting position for this consolation bracket (e.g., 5 for QF, 9 for R16, or offset values for silver)
 */
function getConsolationRoundName(roundNumber: number, totalRounds: number, startPosition: number): string {
  const roundsFromEnd = totalRounds - roundNumber;

  if (roundsFromEnd === 0) {
    // Final round - shows the top positions being decided
    // E.g., for QF consolation: "5º-6º", for R16: "9º-10º"
    return `${startPosition}º-${startPosition + 1}º`;
  }

  // For earlier rounds, show the position range of losers from this round
  // Losers of this round compete for positions starting at startPosition + 2^roundsFromEnd
  // E.g., for QF consolation (4 players, 2 rounds):
  //   - Round 1 (roundsFromEnd=1): losers go to 7º-8º match
  // For R16 consolation (8 players, 3 rounds):
  //   - Round 1 (roundsFromEnd=2): losers get positions 13º-16º
  //   - Round 2 (roundsFromEnd=1): losers go to 11º-12º match
  const bestLoserPosition = startPosition + Math.pow(2, roundsFromEnd);
  const worstLoserPosition = startPosition + Math.pow(2, roundsFromEnd + 1) - 1;

  return `${bestLoserPosition}º-${worstLoserPosition}º`;
}

/**
 * Special prefix for loser placeholders in consolation brackets
 * Format: LOSER:roundName:matchPosition (e.g., "LOSER:R16:0" means loser of R16 match at position 0)
 */
export const LOSER_PLACEHOLDER_PREFIX = 'LOSER:';

/**
 * Check if a participant ID is a loser placeholder
 */
export function isLoserPlaceholder(participantId: string | undefined): boolean {
  return participantId?.startsWith(LOSER_PLACEHOLDER_PREFIX) || false;
}

/**
 * Parse a loser placeholder to get the source round and match position
 */
export function parseLoserPlaceholder(placeholder: string): { roundName: string; matchPosition: number } | null {
  if (!placeholder.startsWith(LOSER_PLACEHOLDER_PREFIX)) return null;
  const parts = placeholder.slice(LOSER_PLACEHOLDER_PREFIX.length).split(':');
  if (parts.length !== 2) return null;
  return {
    roundName: parts[0],
    matchPosition: parseInt(parts[1], 10)
  };
}

/**
 * Create a loser placeholder ID
 */
export function createLoserPlaceholder(roundName: string, matchPosition: number): string {
  return `${LOSER_PLACEHOLDER_PREFIX}${roundName}:${matchPosition}`;
}

/**
 * Generate consolation bracket structure with placeholders
 * Creates the bracket structure upfront with LOSER: placeholders
 * that get replaced when actual losers are determined
 *
 * @param bracketSize Size of the main bracket (8, 16, 32)
 * @param source Which round losers come from ('QF' for 8+, 'R16' for 16+)
 * @param positionOffset Offset to add to startPosition (e.g., goldParticipants.length for silver bracket)
 * @returns ConsolationBracket structure with placeholders
 */
export function generateConsolationBracketStructure(
  _bracketSize: number,
  source: ConsolationSource,
  byePositions: number[] = [],
  bracketType: 'gold' | 'silver' = 'gold',
  positionOffset: number = 0
): ConsolationBracket {
  const sourceRoundName = source;

  // Get all positions and filter out BYEs to find real losers
  const totalPositions = getSourcePositions(source);
  const allPositions = Array.from({ length: totalPositions }, (_, i) => i);
  const realLoserPositions = allPositions.filter(pos => !byePositions.includes(pos));
  const numRealLosers = realLoserPositions.length;

  // Calculate bracket structure based on real losers
  // Need at least 2 participants for a bracket
  if (numRealLosers < 2) {
    // Not enough losers for consolation - return empty bracket
    return {
      source,
      rounds: [],
      totalRounds: 0,
      startPosition: getSourceStartPosition(source) + positionOffset,
      isComplete: true
    };
  }

  // Calculate rounds needed: log2 of next power of 2
  const bracketSize = nextPowerOfTwo(numRealLosers);
  const totalRounds = Math.log2(bracketSize);
  const startPosition = getSourceStartPosition(source) + positionOffset;

  const rounds: BracketRound[] = [];

  // Generate seeding for first round based on actual losers
  // Standard seeding: 1v8, 4v5, 2v7, 3v6 (for 8) or 1v4, 2v3 (for 4) or 1v2 (for 2)
  const seeding = getBracketSeeding(bracketSize);
  const firstRoundMatches: BracketMatch[] = [];
  const numByesNeeded = bracketSize - numRealLosers;

  for (let i = 0; i < seeding.length; i++) {
    const [seedA, seedB] = seeding[i];
    // Deterministic ID based on bracket type, source, round, and position (so regeneration preserves matches)
    const matchId = `consolation-${bracketType}-${source}-r1-m${i + 1}`;

    // Map seeds to actual loser positions
    // Seeds 1 to numRealLosers get real losers, rest get BYEs
    const posA = seedA <= numRealLosers ? realLoserPositions[seedA - 1] : -1;
    const posB = seedB <= numRealLosers ? realLoserPositions[seedB - 1] : -1;

    const isByeA = posA === -1;
    const isByeB = posB === -1;

    if (isByeA && isByeB) {
      // Both BYEs - shouldn't happen with proper seeding
      firstRoundMatches.push({
        id: matchId,
        position: i,
        participantA: BYE_PARTICIPANT,
        participantB: BYE_PARTICIPANT,
        status: 'COMPLETED',
        winner: undefined
      });
    } else if (isByeA) {
      firstRoundMatches.push({
        id: matchId,
        position: i,
        participantA: BYE_PARTICIPANT,
        participantB: createLoserPlaceholder(sourceRoundName, posB),
        status: 'PENDING'
      });
    } else if (isByeB) {
      firstRoundMatches.push({
        id: matchId,
        position: i,
        participantA: createLoserPlaceholder(sourceRoundName, posA),
        participantB: BYE_PARTICIPANT,
        status: 'PENDING'
      });
    } else {
      firstRoundMatches.push({
        id: matchId,
        position: i,
        participantA: createLoserPlaceholder(sourceRoundName, posA),
        participantB: createLoserPlaceholder(sourceRoundName, posB),
        status: 'PENDING'
      });
    }
  }

  rounds.push({
    roundNumber: 1,
    name: getConsolationRoundName(1, totalRounds, startPosition),
    matches: firstRoundMatches
  });

  // Generate subsequent rounds (empty, waiting for winners)
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = Math.pow(2, totalRounds - round);
    const matches: BracketMatch[] = [];
    const isFinalRound = round === totalRounds;

    // For the final round, we add both the final AND a 3rd place match
    // Final: winners of semi-finals play for positions 5-6 (or 9-10)
    // 3rd place: losers of semi-finals play for positions 7-8 (or 11-12)
    const totalMatchesThisRound = isFinalRound ? matchesInRound * 2 : matchesInRound;

    for (let i = 0; i < matchesInRound; i++) {
      // Deterministic ID based on bracket type, source, round, and position (so regeneration preserves matches)
      const matchId = `consolation-${bracketType}-${source}-r${round}-m${i + 1}`;

      // Link previous round matches to this match (winners go here)
      const prevRound = rounds[round - 2];
      const prevMatch1 = prevRound.matches[i * 2];
      const prevMatch2 = prevRound.matches[i * 2 + 1];

      prevMatch1.nextMatchId = matchId;
      prevMatch2.nextMatchId = matchId;

      matches.push({
        id: matchId,
        position: i,
        status: 'PENDING'
      });
    }

    // Add 3rd place match(es) for losers of semi-finals (winner bracket)
    if (isFinalRound && matchesInRound >= 1) {
      const prevRound = rounds[round - 2];
      // Only link primary (winner bracket) matches — LB matches are handled separately below
      const primaryMatchesInPrevRound = Math.pow(2, totalRounds - (round - 1));

      // Create 3rd place matches - one for every 2 primary matches in previous round
      for (let i = 0; i < matchesInRound; i++) {
        // Deterministic ID for 3rd place match
        const thirdPlaceMatchId = `consolation-${bracketType}-${source}-r${round}-3rd-${i + 1}`;

        // Link previous round primary match losers to this 3rd place match
        const prevMatch1 = prevRound.matches[i * 2];
        const prevMatch2 = prevRound.matches[i * 2 + 1];

        prevMatch1.nextMatchIdForLoser = thirdPlaceMatchId;
        prevMatch2.nextMatchIdForLoser = thirdPlaceMatchId;

        matches.push({
          id: thirdPlaceMatchId,
          position: matchesInRound + i, // Position after the finals
          status: 'PENDING',
          isThirdPlace: true
        });
      }
    }

    // Add loser bracket matches so R1 losers play for remaining positions (13-16 etc.)
    // Only needed when totalRounds >= 3 (8+ slot brackets), since 4-slot brackets
    // already cover all positions with the existing final + 3rd place matches.
    if (totalRounds >= 3) {
      const prevRound = rounds[round - 2];
      const primaryMatchesInPrevRound = Math.pow(2, totalRounds - (round - 1));

      if (!isFinalRound) {
        // Non-final round: create LB matches for losers from previous round's primary matches
        const numLbMatches = primaryMatchesInPrevRound / 2;

        for (let i = 0; i < numLbMatches; i++) {
          const lbMatchId = `consolation-${bracketType}-${source}-r${round}-lb-m${i + 1}`;

          // Link previous round primary matches' losers to this LB match
          prevRound.matches[i * 2].nextMatchIdForLoser = lbMatchId;
          prevRound.matches[i * 2 + 1].nextMatchIdForLoser = lbMatchId;

          matches.push({
            id: lbMatchId,
            position: matchesInRound + i, // Position after winner matches
            status: 'PENDING'
          });
        }
      } else {
        // Final round: create LB final + LB 3rd from previous round's LB matches
        const lbMatchesInPrevRound = prevRound.matches.slice(primaryMatchesInPrevRound);

        if (lbMatchesInPrevRound.length >= 2) {
          const numLbFinals = lbMatchesInPrevRound.length / 2;

          for (let i = 0; i < numLbFinals; i++) {
            const lbFinalId = `consolation-${bracketType}-${source}-r${round}-lb-m${i + 1}`;
            const lb3rdId = `consolation-${bracketType}-${source}-r${round}-lb-3rd-${i + 1}`;

            // Link previous round LB matches to LB final (winners) and LB 3rd (losers)
            const lbPrev1 = lbMatchesInPrevRound[i * 2];
            const lbPrev2 = lbMatchesInPrevRound[i * 2 + 1];

            lbPrev1.nextMatchId = lbFinalId;
            lbPrev2.nextMatchId = lbFinalId;
            lbPrev1.nextMatchIdForLoser = lb3rdId;
            lbPrev2.nextMatchIdForLoser = lb3rdId;

            matches.push({
              id: lbFinalId,
              position: matches.length, // After final + 3rd
              status: 'PENDING'
            });

            matches.push({
              id: lb3rdId,
              position: matches.length, // After LB final
              status: 'PENDING',
              isThirdPlace: true
            });
          }
        }
      }
    }

    rounds.push({
      roundNumber: round,
      name: getConsolationRoundName(round, totalRounds, startPosition),
      matches
    });
  }

  return {
    source,
    rounds,
    totalRounds,
    startPosition,
    numLosers: numRealLosers,
    isComplete: false
  };
}

/**
 * Replace a loser placeholder with the actual loser participant
 * Called when a match in the main bracket is completed
 *
 * If the opponent is a BYE, the loser automatically advances
 *
 * @param consolationBracket The consolation bracket to update
 * @param roundName The round name (e.g., 'QF', 'R16')
 * @param matchPosition The position of the match in that round
 * @param loserId The actual loser's participant ID
 * @returns Updated consolation bracket
 */
export function replaceLoserPlaceholder(
  consolationBracket: ConsolationBracket,
  roundName: string,
  matchPosition: number,
  loserId: string,
  loserSeed?: number
): ConsolationBracket {
  const placeholder = createLoserPlaceholder(roundName, matchPosition);
  const updated = JSON.parse(JSON.stringify(consolationBracket)) as ConsolationBracket;

  // Guard: check if rounds exist
  if (!updated.rounds || updated.rounds.length === 0 || !updated.rounds[0]?.matches) {
    console.warn('replaceLoserPlaceholder: No rounds in consolation bracket');
    return updated;
  }

  // Only check first round - that's where placeholders are
  for (const match of updated.rounds[0].matches) {
    let replaced = false;

    if (match.participantA === placeholder) {
      match.participantA = loserId;
      match.seedA = loserSeed;
      replaced = true;
    }
    if (match.participantB === placeholder) {
      match.participantB = loserId;
      match.seedB = loserSeed;
      replaced = true;
    }

    // If we replaced a placeholder and opponent is BYE, auto-complete and advance winner
    if (replaced) {
      const opponentIsBye = match.participantA === BYE_PARTICIPANT || match.participantB === BYE_PARTICIPANT;
      const hasRealParticipant =
        (match.participantA && match.participantA !== BYE_PARTICIPANT && !isLoserPlaceholder(match.participantA)) ||
        (match.participantB && match.participantB !== BYE_PARTICIPANT && !isLoserPlaceholder(match.participantB));

      if (opponentIsBye && hasRealParticipant) {
        // The real participant wins automatically
        match.status = 'COMPLETED';
        const winnerId = match.participantA === BYE_PARTICIPANT ? match.participantB : match.participantA;
        match.winner = winnerId;

        // Advance winner to next round if there is one
        if (match.nextMatchId && winnerId) {
          for (let roundIdx = 1; roundIdx < updated.rounds.length; roundIdx++) {
            for (const nextMatch of updated.rounds[roundIdx].matches) {
              if (nextMatch.id === match.nextMatchId) {
                // Determine slot based on match position parity (even=A, odd=B)
                if (match.position % 2 === 0) {
                  if (!nextMatch.participantA) nextMatch.participantA = winnerId;
                } else {
                  if (!nextMatch.participantB) nextMatch.participantB = winnerId;
                }
                break;
              }
            }
          }
        }
      }
    }
  }

  return cascadeByeWins(updated);
}

/**
 * Fill the winner slot in the next match based on position parity.
 * Even position → participantA, Odd position → participantB.
 * Returns true if a slot was actually filled.
 */
function fillSlotInNextMatch(
  bracket: ConsolationBracket,
  currentRoundIdx: number,
  currentMatch: BracketMatch,
  participantId: string
): boolean {
  if (!currentMatch.nextMatchId) return false;
  for (let roundIdx = currentRoundIdx + 1; roundIdx < bracket.rounds.length; roundIdx++) {
    for (const nextMatch of bracket.rounds[roundIdx].matches) {
      if (nextMatch.id === currentMatch.nextMatchId) {
        if (currentMatch.position % 2 === 0) {
          if (!nextMatch.participantA) {
            nextMatch.participantA = participantId;
            return true;
          }
        } else {
          if (!nextMatch.participantB) {
            nextMatch.participantB = participantId;
            return true;
          }
        }
        return false;
      }
    }
  }
  return false;
}

/**
 * Fill the loser slot in the loser's next match based on position parity.
 * Used for 3rd place matches in consolation finals.
 */
function fillLoserSlotInNextMatch(
  bracket: ConsolationBracket,
  currentRoundIdx: number,
  currentMatch: BracketMatch,
  participantId: string
): boolean {
  if (!currentMatch.nextMatchIdForLoser) return false;
  for (let roundIdx = currentRoundIdx + 1; roundIdx < bracket.rounds.length; roundIdx++) {
    for (const nextMatch of bracket.rounds[roundIdx].matches) {
      if (nextMatch.id === currentMatch.nextMatchIdForLoser) {
        if (currentMatch.position % 2 === 0) {
          if (!nextMatch.participantA) {
            nextMatch.participantA = participantId;
            return true;
          }
        } else {
          if (!nextMatch.participantB) {
            nextMatch.participantB = participantId;
            return true;
          }
        }
        return false;
      }
    }
  }
  return false;
}

/**
 * Cascade BYE wins through a consolation bracket.
 * Iteratively resolves all matches where one or both participants are BYE:
 * - PENDING match with real vs BYE → auto-complete, real player wins, advance winner
 * - PENDING match with BYE vs BYE → auto-complete with no winner, advance BYE
 * - COMPLETED BYE-vs-BYE with no winner → advance BYE to next round
 * Loops until no more auto-completions are possible (stable state).
 * Also checks and sets isComplete when all matches are done.
 *
 * NOTE: This function mutates the input object (callers already deep-clone).
 */
export function cascadeByeWins(consolationBracket: ConsolationBracket): ConsolationBracket {
  if (!consolationBracket.rounds || consolationBracket.rounds.length === 0) {
    return consolationBracket;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let roundIdx = 0; roundIdx < consolationBracket.rounds.length; roundIdx++) {
      for (const match of consolationBracket.rounds[roundIdx].matches) {

        // Case A: COMPLETED BYE-vs-BYE (winner=undefined) → advance BYE to next slots
        if (match.status === 'COMPLETED' && !match.winner &&
            isBye(match.participantA) && isBye(match.participantB)) {
          if (match.nextMatchId) {
            if (fillSlotInNextMatch(consolationBracket, roundIdx, match, BYE_PARTICIPANT)) {
              changed = true;
            }
          }
          if (match.nextMatchIdForLoser) {
            if (fillLoserSlotInNextMatch(consolationBracket, roundIdx, match, BYE_PARTICIPANT)) {
              changed = true;
            }
          }
        }

        // Case B: COMPLETED with winner, one participant is BYE → ensure BYE loser advanced
        // This handles matches auto-completed by replaceLoserPlaceholder that only advanced the winner
        if (match.status === 'COMPLETED' && match.winner &&
            (isBye(match.participantA) || isBye(match.participantB))) {
          // Ensure winner is advanced (may already be done by replaceLoserPlaceholder)
          if (match.nextMatchId) {
            if (fillSlotInNextMatch(consolationBracket, roundIdx, match, match.winner)) {
              changed = true;
            }
          }
          // Advance BYE loser to loser match (3rd place) — this was missing!
          if (match.nextMatchIdForLoser) {
            if (fillLoserSlotInNextMatch(consolationBracket, roundIdx, match, BYE_PARTICIPANT)) {
              changed = true;
            }
          }
        }

        // Case C: PENDING with both participants set, at least one is BYE → auto-complete
        if (match.status === 'PENDING' && match.participantA && match.participantB) {
          const aIsBye = isBye(match.participantA);
          const bIsBye = isBye(match.participantB);

          if (aIsBye && bIsBye) {
            // Both BYE → complete with no winner, advance BYEs to next slots
            match.status = 'COMPLETED';
            match.winner = undefined;
            if (match.nextMatchId) {
              fillSlotInNextMatch(consolationBracket, roundIdx, match, BYE_PARTICIPANT);
            }
            if (match.nextMatchIdForLoser) {
              fillLoserSlotInNextMatch(consolationBracket, roundIdx, match, BYE_PARTICIPANT);
            }
            changed = true;
          } else if (aIsBye || bIsBye) {
            // One real, one BYE → real player wins automatically
            const winnerId = aIsBye ? match.participantB! : match.participantA!;
            match.status = 'COMPLETED';
            match.winner = winnerId;
            if (match.nextMatchId) {
              fillSlotInNextMatch(consolationBracket, roundIdx, match, winnerId);
            }
            // Loser is BYE → advance BYE to loser match (3rd place)
            if (match.nextMatchIdForLoser) {
              fillLoserSlotInNextMatch(consolationBracket, roundIdx, match, BYE_PARTICIPANT);
            }
            changed = true;
          }
        }
      }
    }
  }

  // Check if all matches are complete → mark bracket as complete
  const allDone = consolationBracket.rounds.every(round =>
    round.matches.every(m => m.status === 'COMPLETED' || m.status === 'WALKOVER')
  );
  if (allDone) {
    consolationBracket.isComplete = true;
  }

  return consolationBracket;
}

/**
 * Check if all placeholders in a consolation bracket have been replaced
 * BYE participants are considered as "assigned" (no loser expected from BYE matches)
 */
export function hasAllLosersAssigned(consolationBracket: ConsolationBracket): boolean {
  for (const match of consolationBracket.rounds[0].matches) {
    // Skip BYE-only matches (both participants are BYEs)
    if (isBye(match.participantA) && isBye(match.participantB)) {
      continue;
    }
    // Check for unresolved placeholders (ignoring BYE participants)
    if (!isBye(match.participantA) && isLoserPlaceholder(match.participantA)) {
      return false;
    }
    if (!isBye(match.participantB) && isLoserPlaceholder(match.participantB)) {
      return false;
    }
  }
  return true;
}

/**
 * Advance winner in consolation bracket
 * Similar to main bracket but for consolation
 */
export function advanceConsolationWinner(
  consolationBracket: ConsolationBracket,
  matchId: string,
  winnerId: string,
  loserId?: string
): ConsolationBracket {
  const updated = JSON.parse(JSON.stringify(consolationBracket)) as ConsolationBracket;

  // Find the match
  let completedMatch: BracketMatch | undefined;
  let roundIndex = -1;

  for (let i = 0; i < updated.rounds.length; i++) {
    const match = updated.rounds[i].matches.find(m => m.id === matchId);
    if (match) {
      completedMatch = match;
      roundIndex = i;
      break;
    }
  }

  if (!completedMatch) {
    return updated;
  }

  // Determine which slot (A or B) based on match position
  const currentMatchIndex = updated.rounds[roundIndex].matches.findIndex(m => m.id === matchId);
  const isFirstOfPair = currentMatchIndex % 2 === 0;

  // Advance winner to next match
  if (completedMatch.nextMatchId) {
    const nextRound = updated.rounds[roundIndex + 1];
    const nextMatch = nextRound?.matches.find(m => m.id === completedMatch!.nextMatchId);

    if (nextMatch) {
      if (isFirstOfPair) {
        nextMatch.participantA = winnerId;
      } else {
        nextMatch.participantB = winnerId;
      }
    }
  }

  // Advance loser to loser's match (for consolation brackets with 3rd place matches)
  if (completedMatch.nextMatchIdForLoser && loserId) {
    const nextRound = updated.rounds[roundIndex + 1];
    const loserMatch = nextRound?.matches.find(m => m.id === completedMatch!.nextMatchIdForLoser);

    if (loserMatch) {
      if (isFirstOfPair) {
        loserMatch.participantA = loserId;
      } else {
        loserMatch.participantB = loserId;
      }
    }
  }

  // Cascade any BYE wins triggered by this advancement, and check isComplete
  return cascadeByeWins(updated);
}

/**
 * Calculate final positions for consolation bracket participants
 * Returns map of participantId -> final position
 *
 * Uses sequential position assignment:
 * 1. Final round: finals first (best positions), then 3rd-place matches
 * 2. Earlier rounds in reverse order (closest to final = better positions)
 * 3. Guarantees positions startPos through startPos + numParticipants - 1
 */
export function calculateConsolationPositions(
  consolationBracket: ConsolationBracket
): Map<string, number> {
  const positions = new Map<string, number>();

  if (!consolationBracket.isComplete || consolationBracket.rounds.length === 0) {
    return positions;
  }

  const startPos = consolationBracket.startPosition;
  let nextPosition = startPos;

  // Helper to get loser of a completed match
  const getLoser = (match: BracketMatch): string | undefined => {
    if (!match.winner) return undefined;
    return match.participantA === match.winner ? match.participantB : match.participantA;
  };

  // Helper to check if an ID is a real participant (not BYE or placeholder)
  const isRealParticipant = (id: string | undefined): id is string => {
    return !!id && !isBye(id) && !isLoserPlaceholder(id);
  };

  // 1) Final round: process matches in position order
  // Position ordering: final, 3rd place, LB final, LB 3rd (ensures correct sequential positions)
  const finalRound = consolationBracket.rounds[consolationBracket.rounds.length - 1];
  const sortedFinalMatches = [...finalRound.matches].sort((a, b) => a.position - b.position);

  for (const match of sortedFinalMatches) {
    if (match.status !== 'COMPLETED' || !match.winner) continue;
    const loserId = getLoser(match);
    if (isRealParticipant(match.winner) && !positions.has(match.winner)) positions.set(match.winner, nextPosition++);
    if (isRealParticipant(loserId) && !positions.has(loserId)) positions.set(loserId, nextPosition++);
  }

  // 2) Earlier rounds in reverse (closest to final first = better positions)
  for (let roundIdx = consolationBracket.rounds.length - 2; roundIdx >= 0; roundIdx--) {
    const round = consolationBracket.rounds[roundIdx];
    for (const match of round.matches) {
      if (match.status !== 'COMPLETED' || !match.winner) continue;
      const loserId = getLoser(match);
      if (isRealParticipant(loserId) && !positions.has(loserId)) {
        positions.set(loserId, nextPosition++);
      }
    }
  }

  return positions;
}

/**
 * Minimum number of real participants required for consolation to be meaningful.
 * With 5 or fewer participants, the main bracket already determines all positions.
 */
export const MIN_PARTICIPANTS_FOR_CONSOLATION = 5;

/**
 * Check if main bracket has enough rounds for consolation
 * @param bracketSize Total bracket size (power of 2)
 * @param realParticipants Optional: actual number of participants (not including BYEs)
 * @returns Object with available consolation sources
 */
export function getAvailableConsolationSources(
  bracketSize: number,
  realParticipants?: number
): { hasQF: boolean; hasR16: boolean; hasR32: boolean; hasR64: boolean } {
  // If we know the real participant count and it's too small, no consolation needed
  if (realParticipants !== undefined && realParticipants <= MIN_PARTICIPANTS_FOR_CONSOLATION) {
    return { hasQF: false, hasR16: false, hasR32: false, hasR64: false };
  }

  const totalRounds = Math.log2(bracketSize);
  return {
    hasQF: totalRounds >= 3,   // At least 8 players for QF
    hasR16: totalRounds >= 4,  // At least 16 players for R16
    hasR32: totalRounds >= 5,  // At least 32 players for R32
    hasR64: totalRounds >= 6   // At least 64 players for R64
  };
}
