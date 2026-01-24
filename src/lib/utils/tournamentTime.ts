/**
 * Tournament time estimation utilities
 * Calculates estimated duration based on tournament configuration
 */

import type {
  Tournament,
  TournamentTimeConfig,
  TournamentTimeEstimate
} from '$lib/types/tournament';
import { DEFAULT_TIME_CONFIG } from '$lib/firebase/timeConfig';

/**
 * Calculate number of matches for Round Robin group stage
 * Formula: N*(N-1)/2 matches per group
 */
function calculateRoundRobinMatches(numParticipants: number, numGroups: number): number {
  if (numParticipants < 2 || numGroups < 1) return 0;

  const participantsPerGroup = Math.ceil(numParticipants / numGroups);
  // Round Robin formula: N*(N-1)/2 matches per group
  const matchesPerGroup = (participantsPerGroup * (participantsPerGroup - 1)) / 2;
  return Math.ceil(matchesPerGroup * numGroups);
}

/**
 * Calculate number of matches for Swiss system
 * Formula: rounds × ceil(N/2) matches per round
 */
function calculateSwissMatches(numParticipants: number, numRounds: number): number {
  if (numParticipants < 2 || numRounds < 1) return 0;

  // Each round has N/2 matches (with BYE if odd number of participants)
  const matchesPerRound = Math.ceil(numParticipants / 2);
  return numRounds * matchesPerRound;
}

/**
 * Get suggested qualifiers for Swiss system
 * Uses power of 2 values, typically half of participants
 */
function getSuggestedQualifiersForSwiss(totalParticipants: number): number {
  if (totalParticipants < 4) {
    return totalParticipants >= 2 ? 2 : 0;
  }

  const halfParticipants = Math.floor(totalParticipants / 2);

  // Powers of 2: 2, 4, 8, 16
  const powersOf2 = [2, 4, 8, 16];

  let suggested = 4; // Minimum: semifinals

  for (const power of powersOf2) {
    if (power <= halfParticipants) {
      suggested = power;
    } else {
      break;
    }
  }

  // Special cases for exact powers of 2
  if (totalParticipants === 8) suggested = 4;
  if (totalParticipants === 16) suggested = 8;

  return Math.min(suggested, totalParticipants);
}

/**
 * Get suggested qualifiers for Round Robin with groups
 * For multiple groups: typically 2 per group (top 2 advance)
 * For single group: use power of 2 (similar to Swiss, half participants)
 */
function getSuggestedQualifiersForRoundRobin(totalParticipants: number, numGroups: number): number {
  if (totalParticipants < 2) return 0;

  // Multiple groups: typical format is top 2 from each group
  if (numGroups > 1) {
    const qualifiersPerGroup = 2;
    return Math.min(totalParticipants, numGroups * qualifiersPerGroup);
  }

  // Single group: use power of 2 logic (half participants, rounded to power of 2)
  // This is the same logic as Swiss
  if (totalParticipants < 4) {
    return totalParticipants >= 2 ? 2 : 0;
  }

  const halfParticipants = Math.floor(totalParticipants / 2);

  // Powers of 2: 2, 4, 8, 16
  const powersOf2 = [2, 4, 8, 16];

  let suggested = 4; // Minimum: semifinals

  for (const power of powersOf2) {
    if (power <= halfParticipants) {
      suggested = power;
    } else {
      break;
    }
  }

  // Special cases for exact powers of 2
  if (totalParticipants === 8) suggested = 4;
  if (totalParticipants === 16) suggested = 8;

  return Math.min(suggested, totalParticipants);
}

/**
 * Calculate number of matches for single elimination bracket
 * Formula: N-1 matches (+1 for 3rd place match if 4+ participants)
 */
function calculateBracketMatches(numParticipants: number, includeThirdPlace: boolean = true): number {
  if (numParticipants < 2) return 0;

  // Single elimination: N-1 matches
  let matches = numParticipants - 1;

  // Add 3rd place match if 4+ participants
  if (includeThirdPlace && numParticipants >= 4) {
    matches += 1;
  }

  return matches;
}

/**
 * Get bracket round name based on number of participants in that round
 */
function getBracketRoundName(participantsInRound: number): string {
  if (participantsInRound === 2) return 'final';
  if (participantsInRound === 4) return 'semifinals';
  if (participantsInRound === 8) return 'quarterfinals';
  if (participantsInRound === 16) return 'round16';
  if (participantsInRound === 32) return 'round32';
  if (participantsInRound === 64) return 'round64';
  return `round${participantsInRound}`;
}

/**
 * Phase-specific configuration for bracket rounds
 */
interface PhaseConfig {
  minutesPerMatch: number;
  breakBetweenMatches: number;
  gameMode?: 'points' | 'rounds';
  pointsToWin?: number;
  roundsToPlay?: number;
}

/**
 * Calculate detailed bracket rounds breakdown
 * Returns an array of rounds from first round to final
 * Now supports different configurations per phase (early rounds, semifinals, final)
 */
function calculateBracketRoundsBreakdown(
  numParticipants: number,
  includeThirdPlace: boolean,
  numTables: number,
  defaultMinutesPerMatch: number,
  breakBetweenMatches: number,
  parallelSemifinals: boolean,
  parallelFinals: boolean = true,
  phaseConfigs?: {
    earlyRounds?: PhaseConfig;
    semifinals?: PhaseConfig;
    finals?: PhaseConfig;
  },
  breakBetweenPhases: number = 0
): Array<{ name: string; matches: number; minutes: number; parallel?: boolean; config?: string }> {
  if (numParticipants < 2) return [];

  const rounds: Array<{ name: string; matches: number; minutes: number; parallel?: boolean; config?: string }> = [];

  // Helper to get config string (e.g., "4R", "7P")
  const getConfigString = (config: PhaseConfig): string => {
    if (config.gameMode === 'rounds') {
      return `${config.roundsToPlay || 4}R`;
    } else if (config.gameMode === 'points') {
      return `${config.pointsToWin || 7}P`;
    }
    return '';
  };

  // Find the smallest power of 2 >= numParticipants for bracket structure
  let bracketSize = 2;
  while (bracketSize < numParticipants) {
    bracketSize *= 2;
  }

  // Calculate number of byes
  const byes = bracketSize - numParticipants;

  // First round may have fewer matches due to byes
  let currentParticipants = bracketSize;
  const firstRoundMatches = (bracketSize / 2) - byes; // Real matches in first round

  // Helper to get phase config for a round with proper defaults
  const getPhaseConfig = (participantsInRound: number): PhaseConfig => {
    if (participantsInRound === 2) {
      // Final - default: 9 points
      return phaseConfigs?.finals || {
        minutesPerMatch: defaultMinutesPerMatch,
        breakBetweenMatches,
        gameMode: 'points',
        pointsToWin: 9
      };
    } else if (participantsInRound === 4) {
      // Semifinals - default: 7 points
      return phaseConfigs?.semifinals || {
        minutesPerMatch: defaultMinutesPerMatch,
        breakBetweenMatches,
        gameMode: 'points',
        pointsToWin: 7
      };
    } else {
      // Early rounds (quarterfinals, round16, etc.) - default: 4 rounds
      return phaseConfigs?.earlyRounds || {
        minutesPerMatch: defaultMinutesPerMatch,
        breakBetweenMatches,
        gameMode: 'rounds',
        roundsToPlay: 4
      };
    }
  };

  // If there are byes, some participants skip to round 2
  if (byes > 0 && firstRoundMatches > 0) {
    const roundName = getBracketRoundName(currentParticipants);
    const config = getPhaseConfig(currentParticipants);
    const matchRoundsNeeded = Math.ceil(firstRoundMatches / numTables);
    const roundMinutes = matchRoundsNeeded * (config.minutesPerMatch + config.breakBetweenMatches);

    rounds.push({
      name: roundName,
      matches: firstRoundMatches,
      minutes: Math.round(roundMinutes),
      parallel: true,  // Early rounds always play in parallel
      config: getConfigString(config)
    });
  }

  // Continue with subsequent rounds (starting from round where all participants compete)
  currentParticipants = byes > 0 ? bracketSize / 2 : bracketSize;

  // Track phase transitions to add break between phases
  let lastPhase: 'early' | 'semi' | 'final' | null = null;

  while (currentParticipants >= 2) {
    const matchesInRound = currentParticipants / 2;
    const roundName = getBracketRoundName(currentParticipants);

    // Skip if this round was already added as first round (due to byes)
    if (rounds.length > 0 && rounds[0].name === roundName) {
      currentParticipants /= 2;
      continue;
    }

    // Get phase-specific config
    const config = getPhaseConfig(currentParticipants);

    // Check if this is semifinals (special parallel handling)
    const isSemifinals = currentParticipants === 4;
    const isFinal = currentParticipants === 2;

    // Determine current phase
    const currentPhase: 'early' | 'semi' | 'final' = isFinal ? 'final' : (isSemifinals ? 'semi' : 'early');

    // Add break between phases if transitioning to a new phase
    let phaseTransitionMinutes = 0;
    if (lastPhase !== null && lastPhase !== currentPhase && breakBetweenPhases > 0) {
      phaseTransitionMinutes = breakBetweenPhases;
    }
    lastPhase = currentPhase;

    let roundMinutes: number;
    if (isSemifinals && parallelSemifinals) {
      // Parallel semifinals: both play at the same time
      const semiRoundsNeeded = Math.ceil(matchesInRound / numTables);
      roundMinutes = semiRoundsNeeded * (config.minutesPerMatch + config.breakBetweenMatches);
    } else if (isFinal) {
      // Final: just 1 match
      roundMinutes = config.minutesPerMatch + config.breakBetweenMatches;
    } else {
      // Normal round: parallelize based on tables
      const matchRoundsNeeded = Math.ceil(matchesInRound / numTables);
      roundMinutes = matchRoundsNeeded * (config.minutesPerMatch + config.breakBetweenMatches);
    }

    // Add phase transition time
    roundMinutes += phaseTransitionMinutes;

    // Determine parallel status:
    // - Early rounds (octavos, cuartos, etc.): always parallel
    // - Semifinals: based on parallelSemifinals setting
    // - Final: single match, no parallel
    let isParallel: boolean | undefined;
    if (isFinal) {
      isParallel = undefined;  // Single match
    } else if (isSemifinals) {
      isParallel = parallelSemifinals;
    } else {
      // Early rounds are always parallel (multiple matches at once)
      isParallel = true;
    }

    rounds.push({
      name: roundName,
      matches: matchesInRound,
      minutes: Math.round(roundMinutes),
      parallel: isParallel,
      config: getConfigString(config)
    });

    currentParticipants /= 2;
  }

  // Add 3rd place match if applicable
  // 3rd place match uses SEMIFINALS config (same as semis), not finals
  if (includeThirdPlace && numParticipants >= 4) {
    const thirdPlaceConfig = phaseConfigs?.semifinals || { minutesPerMatch: defaultMinutesPerMatch, breakBetweenMatches, gameMode: 'points', pointsToWin: 7 };

    // If parallelFinals is true, final and 3rd place are played together
    // So we mark it and adjust the time (it doesn't add extra time if parallel)
    if (parallelFinals) {
      // Find the final round and update it to show both matches
      const finalRound = rounds.find(r => r.name === 'final');
      if (finalRound) {
        finalRound.matches = 2; // Final + 3rd place
        finalRound.parallel = true;
        finalRound.name = 'finals'; // Use plural
      }
    } else {
      // Sequential: add 3rd place as separate round (uses semis config)
      rounds.push({
        name: 'thirdPlace',
        matches: 1,
        minutes: Math.round(thirdPlaceConfig.minutesPerMatch + thirdPlaceConfig.breakBetweenMatches),
        config: getConfigString(thirdPlaceConfig)
      });
    }
  }

  return rounds;
}

/**
 * Calculate minutes per match based on game mode and configuration
 */
function calculateMinutesPerMatch(
  gameMode: 'points' | 'rounds',
  pointsToWin: number | undefined,
  roundsToPlay: number | undefined,
  matchesToWin: number,
  gameType: 'singles' | 'doubles',
  config: TournamentTimeConfig
): number {
  const baseMinutes =
    gameType === 'singles' ? config.minutesPer4RoundsSingles : config.minutesPer4RoundsDoubles;

  let minutesPerGame: number;

  if (gameMode === 'rounds') {
    // Rounds mode: scale based on number of rounds
    const rounds = roundsToPlay || 4;
    minutesPerGame = (rounds / 4) * baseMinutes;
  } else {
    // Points mode: use average rounds from config
    const points = pointsToWin || 7;
    const avgRounds = config.avgRoundsForPointsMode[points] || 6;
    minutesPerGame = (avgRounds / 4) * baseMinutes;
  }

  // For best-of-X matches, estimate average games played
  // matchesToWin stores the "best of X" value (1, 3, 5, 7)
  // Best of 1 = 1 game
  // Best of 3 = ~2.4 games on average (60% end 2-0, 40% end 2-1)
  // Best of 5 = ~4 games on average
  // Best of 7 = ~5.5 games on average
  let avgGamesPlayed: number;
  switch (matchesToWin) {
    case 1: avgGamesPlayed = 1; break;
    case 3: avgGamesPlayed = 2.4; break;
    case 5: avgGamesPlayed = 4; break;
    case 7: avgGamesPlayed = 5.5; break;
    default: avgGamesPlayed = matchesToWin * 0.75; // fallback
  }

  return minutesPerGame * avgGamesPlayed;
}

/**
 * Calculate minutes per match with detailed breakdown
 */
function calculateMinutesPerMatchDetailed(
  gameMode: 'points' | 'rounds',
  pointsToWin: number | undefined,
  roundsToPlay: number | undefined,
  matchesToWin: number,
  gameType: 'singles' | 'doubles',
  config: TournamentTimeConfig
): { minutesPerMatch: number; minutesPerGame: number; avgGamesPlayed: number } {
  const baseMinutes =
    gameType === 'singles' ? config.minutesPer4RoundsSingles : config.minutesPer4RoundsDoubles;

  let minutesPerGame: number;

  if (gameMode === 'rounds') {
    const rounds = roundsToPlay || 4;
    minutesPerGame = (rounds / 4) * baseMinutes;
  } else {
    const points = pointsToWin || 7;
    const avgRounds = config.avgRoundsForPointsMode[points] || 6;
    minutesPerGame = (avgRounds / 4) * baseMinutes;
  }

  let avgGamesPlayed: number;
  switch (matchesToWin) {
    case 1: avgGamesPlayed = 1; break;
    case 3: avgGamesPlayed = 2.4; break;
    case 5: avgGamesPlayed = 4; break;
    case 7: avgGamesPlayed = 5.5; break;
    default: avgGamesPlayed = matchesToWin * 0.75;
  }

  return {
    minutesPerMatch: minutesPerGame * avgGamesPlayed,
    minutesPerGame,
    avgGamesPlayed
  };
}

/**
 * Detailed breakdown of time calculation
 */
export interface TimeBreakdown {
  // Tournament info
  numParticipants: number;
  numTables: number;
  gameType: 'singles' | 'doubles';
  phaseType: 'ONE_PHASE' | 'TWO_PHASE';

  // Group stage breakdown
  groupStage?: {
    type: 'ROUND_ROBIN' | 'SWISS';
    numGroups?: number;
    numSwissRounds?: number;
    totalMatches: number;
    matchRounds: number;
    minutesPerMatch: number;
    breakPerMatch: number;
    totalMinutes: number;
    // Calculation details
    gameMode: 'points' | 'rounds';
    pointsToWin?: number;
    roundsToPlay?: number;
    matchesToWin: number;
    minutesPerGame: number;
    avgGamesPlayed: number;
  };

  // Final stage breakdown
  finalStage?: {
    qualifiedCount: number;
    totalMatches: number;
    // Bracket rounds breakdown
    bracketRounds: Array<{
      name: string;  // 'round64', 'round32', 'round16', 'quarterfinals', 'semifinals', 'final', 'thirdPlace'
      matches: number;
      minutes: number;
      parallel?: boolean;
      config?: string;  // e.g. '4R', '7P', '9P' - showing game mode for each phase
    }>;
    earlyRoundMatches: number;
    earlyRoundsMinutes: number;
    semifinalMatches: number;
    semifinalsMinutes: number;
    parallelSemifinals: boolean;
    finalMatches: number;
    finalsMinutes: number;
    minutesPerMatch: number;
    breakPerMatch: number;
    totalMinutes: number;
    // Calculation details
    gameMode: 'points' | 'rounds';
    pointsToWin?: number;
    roundsToPlay?: number;
    matchesToWin: number;
    minutesPerGame: number;
    avgGamesPlayed: number;
  };

  // Transition
  transitionMinutes: number;

  // Total
  totalMinutes: number;
}

/**
 * Calculate detailed time breakdown for debugging/display
 */
export function calculateTimeBreakdown(
  tournament: Tournament,
  config?: TournamentTimeConfig
): TimeBreakdown {
  // Use tournament's own timeConfig if available, otherwise fallback to provided config or defaults
  const effectiveConfig = config || tournament.timeConfig || DEFAULT_TIME_CONFIG;
  const numTables = tournament.numTables || 1;
  const numParticipants = tournament.participants?.length || 0;

  const breakdown: TimeBreakdown = {
    numParticipants,
    numTables,
    gameType: tournament.gameType,
    phaseType: tournament.phaseType,
    transitionMinutes: 0,
    totalMinutes: 0
  };

  // Group Stage calculation (only for TWO_PHASE tournaments)
  if (tournament.phaseType === 'TWO_PHASE' && tournament.groupStage) {
    let totalMatches = 0;
    const numGroups = tournament.groupStage.numGroups || tournament.numGroups || 1;
    const numSwissRounds = tournament.groupStage.numSwissRounds || tournament.numSwissRounds || 5;

    if (tournament.groupStage.type === 'ROUND_ROBIN') {
      totalMatches = calculateRoundRobinMatches(numParticipants, numGroups);
    } else if (tournament.groupStage.type === 'SWISS') {
      totalMatches = calculateSwissMatches(numParticipants, numSwissRounds);
    }

    if (totalMatches > 0) {
      const groupGameMode = tournament.groupStage.gameMode;
      const groupPointsToWin = tournament.groupStage.pointsToWin;
      const groupRoundsToPlay = tournament.groupStage.roundsToPlay;
      const groupMatchesToWin = tournament.groupStage.matchesToWin || 1;

      const detailed = calculateMinutesPerMatchDetailed(
        groupGameMode,
        groupPointsToWin,
        groupRoundsToPlay,
        groupMatchesToWin,
        tournament.gameType,
        effectiveConfig
      );

      // For both Swiss and Round Robin: use tournament rounds directly
      // - Swiss: numSwissRounds (each round has N/2 parallel matches)
      // - Round Robin: N-1 rounds per group (each participant plays against all others)
      // In both cases, matches within each round are played in parallel
      let matchRounds: number;
      if (tournament.groupStage.type === 'SWISS') {
        // Swiss rounds are already time slots - each Swiss round has N/2 parallel matches
        matchRounds = numSwissRounds;
      } else {
        // Round Robin: rounds depend on participant count
        // - Even number: N-1 rounds (everyone plays each round)
        // - Odd number: N rounds (one BYE per round)
        const participantsPerGroup = Math.ceil(numParticipants / numGroups);
        matchRounds = participantsPerGroup % 2 === 0 ? participantsPerGroup - 1 : participantsPerGroup;
      }

      const totalMinutes = matchRounds * (detailed.minutesPerMatch + effectiveConfig.breakBetweenMatches);

      breakdown.groupStage = {
        type: tournament.groupStage.type,
        numGroups: tournament.groupStage.type === 'ROUND_ROBIN' ? numGroups : undefined,
        numSwissRounds: tournament.groupStage.type === 'SWISS' ? numSwissRounds : undefined,
        totalMatches,
        matchRounds,
        minutesPerMatch: Math.round(detailed.minutesPerMatch),
        breakPerMatch: effectiveConfig.breakBetweenMatches,
        totalMinutes: Math.round(totalMinutes),
        // Calculation details
        gameMode: groupGameMode,
        pointsToWin: groupPointsToWin,
        roundsToPlay: groupRoundsToPlay,
        matchesToWin: groupMatchesToWin,
        minutesPerGame: Math.round(detailed.minutesPerGame * 10) / 10,
        avgGamesPlayed: detailed.avgGamesPlayed
      };
    }
  }

  // Final Stage calculation
  const finalConfig = tournament.finalStageConfig || tournament.finalStage;
  const isSplitDivisions = finalConfig?.mode === 'SPLIT_DIVISIONS';

  // For SPLIT_DIVISIONS: half go to Gold bracket, half to Silver
  // For SINGLE_BRACKET: all participants go to one bracket
  let qualifiedCount: number;

  if (tournament.phaseType === 'TWO_PHASE') {
    if (isSplitDivisions) {
      // SPLIT_DIVISIONS: half of participants go to Gold, half to Silver
      // For gold/silver divisions, we use exactly half (not power of 2)
      // since brackets can handle any number with BYEs
      qualifiedCount = Math.floor(numParticipants / 2);
      // Ensure minimum of 2 for a valid bracket
      qualifiedCount = Math.max(qualifiedCount, 2);
    } else {
      // SINGLE_BRACKET: all participants go to the bracket
      qualifiedCount = numParticipants;
    }
  } else {
    // ONE_PHASE: all participants go directly to bracket
    qualifiedCount = numParticipants;
  }

  if (qualifiedCount >= 2) {
    if (finalConfig) {
      // For SPLIT_DIVISIONS:
      // - Gold = qualifiers (the ones who passed from group stage)
      // - Silver = non-qualifiers (the rest who didn't qualify)
      // For SINGLE_BRACKET: all participants go to one bracket (with BYEs if needed)
      let goldBracketSize: number;
      let silverBracketSize: number;

      if (isSplitDivisions) {
        // Gold gets the qualifiers, Silver gets the rest
        goldBracketSize = qualifiedCount;
        silverBracketSize = numParticipants - qualifiedCount;
      } else {
        // SINGLE_BRACKET: all go to one bracket
        goldBracketSize = qualifiedCount;
        silverBracketSize = 0;
      }

      const goldMatches = calculateBracketMatches(goldBracketSize, goldBracketSize >= 4);
      const silverMatches = isSplitDivisions && silverBracketSize >= 2
        ? calculateBracketMatches(silverBracketSize, silverBracketSize >= 4)
        : 0;

      // For SPLIT_DIVISIONS: Gold and Silver run in parallel on different tables
      // So effective matches = max of the two brackets (they don't add up)
      // But we need to consider table availability
      const totalMatches = isSplitDivisions
        ? Math.max(goldMatches, silverMatches)  // Parallel execution = max, not sum
        : goldMatches;

      const hasSemifinals = goldBracketSize >= 4;
      const hasThirdPlace = goldBracketSize >= 4;
      // For early rounds, we look at total rounds needed considering parallelism
      const earlyRoundMatches = hasSemifinals ? Math.max(0, totalMatches - 3) : Math.max(0, totalMatches - 1);
      const semifinalMatches = hasSemifinals ? 2 : 0;
      const finalMatches = hasThirdPlace ? 2 : 1; // Final + 3rd place (or just final)

      // Calculate time for early rounds using default or specific config
      // Default: early rounds are 4 rounds (not points)
      let earlyRoundsMinutes = 0;
      let earlyMinutesPerMatch = 0;
      if (earlyRoundMatches > 0) {
        const earlyGameMode = finalConfig.earlyRoundsGameMode || 'rounds';  // Default: rounds mode
        const earlyPointsToWin = finalConfig.earlyRoundsPointsToWin || 7;
        const earlyRoundsToPlay = finalConfig.earlyRoundsToPlay || 4;  // Default: 4 rounds
        const earlyMatchesToWin = finalConfig.matchesToWin || 1;
        earlyMinutesPerMatch = calculateMinutesPerMatch(
          earlyGameMode,
          earlyPointsToWin,
          earlyRoundsToPlay,
          earlyMatchesToWin,
          tournament.gameType,
          effectiveConfig
        );
        const earlyRounds = Math.ceil(earlyRoundMatches / numTables);
        earlyRoundsMinutes = earlyRounds * (earlyMinutesPerMatch + effectiveConfig.breakBetweenMatches);
      }

      // Calculate time for semifinals using specific config if available
      // Default: semifinals are 7 points
      let semifinalsMinutes = 0;
      let semiMinutesPerMatch = 0;
      if (semifinalMatches > 0) {
        const semiGameMode = finalConfig.semifinalGameMode || 'points';  // Default: points mode
        const semiPointsToWin = finalConfig.semifinalPointsToWin || 7;  // Default: 7 points
        const semiRoundsToPlay = finalConfig.semifinalRoundsToPlay || 4;
        const semiMatchesToWin = finalConfig.semifinalMatchesToWin || finalConfig.matchesToWin || 1;
        semiMinutesPerMatch = calculateMinutesPerMatch(
          semiGameMode,
          semiPointsToWin,
          semiRoundsToPlay,
          semiMatchesToWin,
          tournament.gameType,
          effectiveConfig
        );

        // For SPLIT_DIVISIONS: 4 semifinals (2 Gold + 2 Silver)
        // For SINGLE_BRACKET: 2 semifinals
        const totalSemifinals = isSplitDivisions ? 4 : 2;

        // Calculate rounds needed based on tables and parallel setting
        if (effectiveConfig.parallelSemifinals) {
          // With parallel semis: how many rounds needed?
          const semiRoundsNeeded = Math.ceil(totalSemifinals / numTables);
          semifinalsMinutes = semiRoundsNeeded * (semiMinutesPerMatch + effectiveConfig.breakBetweenMatches);
        } else {
          semifinalsMinutes = totalSemifinals * (semiMinutesPerMatch + effectiveConfig.breakBetweenMatches);
        }

      }

      // Calculate time for finals using specific config if available
      // Default: final is 9 points, semifinals is 7 points
      let finalsMinutes = 0;
      let finalMinutesPerMatch = 0;
      let finalDetails = { minutesPerGame: 0, avgGamesPlayed: 1 };
      const finalGameMode = finalConfig.finalGameMode || finalConfig.gameMode || 'points';
      const finalPointsToWin = finalConfig.finalPointsToWin || 9;  // Default 9 for finals
      const finalRoundsToPlay = finalConfig.finalRoundsToPlay || finalConfig.roundsToPlay || 4;
      const finalMatchesToWin = finalConfig.finalMatchesToWin || finalConfig.matchesToWin || 1;

      if (finalMatches > 0) {
        const detailed = calculateMinutesPerMatchDetailed(
          finalGameMode,
          finalPointsToWin,
          finalRoundsToPlay,
          finalMatchesToWin,
          tournament.gameType,
          effectiveConfig
        );
        finalMinutesPerMatch = detailed.minutesPerMatch;
        finalDetails = detailed;

        // For SPLIT_DIVISIONS with 3rd place: 4 finals (Final Gold, Final Silver, 3rd Gold, 3rd Silver)
        // For SINGLE_BRACKET with 3rd place: 2 finals (Final, 3rd place)
        const totalFinals = isSplitDivisions && hasThirdPlace ? 4 : finalMatches;

        // Calculate rounds needed based on tables
        const finalRoundsNeeded = Math.ceil(totalFinals / numTables);
        finalsMinutes = finalRoundsNeeded * (finalMinutesPerMatch + effectiveConfig.breakBetweenMatches);

      }

      // Use the main config's minutesPerMatch for display (average)
      const displayMinutesPerMatch = earlyMinutesPerMatch || semiMinutesPerMatch || finalMinutesPerMatch;

      // Get game modes for early rounds and semifinals with proper defaults
      // Early rounds: default 4R (rounds mode)
      // Semifinals: default 7P (points mode)
      // Finals: default 9P (points mode) - already defined above
      const earlyGameModeForConfig = finalConfig.earlyRoundsGameMode || 'rounds';
      const earlyPointsToWinForConfig = finalConfig.earlyRoundsPointsToWin || 7;
      const earlyRoundsToPlayForConfig = finalConfig.earlyRoundsToPlay || 4;
      const semiGameModeForConfig = finalConfig.semifinalGameMode || 'points';
      const semiPointsToWinForConfig = finalConfig.semifinalPointsToWin || 7;
      const semiRoundsToPlayForConfig = finalConfig.semifinalRoundsToPlay || 4;

      // Calculate detailed bracket rounds breakdown with phase-specific configs
      const bracketRounds = calculateBracketRoundsBreakdown(
        qualifiedCount,
        hasThirdPlace,
        numTables,
        displayMinutesPerMatch,
        effectiveConfig.breakBetweenMatches,
        effectiveConfig.parallelSemifinals,
        effectiveConfig.parallelFinals ?? true,
        {
          earlyRounds: earlyMinutesPerMatch > 0 ? {
            minutesPerMatch: earlyMinutesPerMatch,
            breakBetweenMatches: effectiveConfig.breakBetweenMatches,
            gameMode: earlyGameModeForConfig,
            pointsToWin: earlyPointsToWinForConfig,
            roundsToPlay: earlyRoundsToPlayForConfig
          } : undefined,
          semifinals: semiMinutesPerMatch > 0 ? {
            minutesPerMatch: semiMinutesPerMatch,
            breakBetweenMatches: effectiveConfig.breakBetweenMatches,
            gameMode: semiGameModeForConfig,
            pointsToWin: semiPointsToWinForConfig,
            roundsToPlay: semiRoundsToPlayForConfig
          } : undefined,
          finals: finalMinutesPerMatch > 0 ? {
            minutesPerMatch: finalMinutesPerMatch,
            breakBetweenMatches: effectiveConfig.breakBetweenMatches,
            gameMode: finalGameMode,
            pointsToWin: finalPointsToWin,
            roundsToPlay: finalRoundsToPlay
          } : undefined
        },
        effectiveConfig.breakBetweenPhases
      );

      // Calculate total from bracket rounds breakdown (more accurate)
      const totalFromBracketRounds = bracketRounds.reduce((sum, round) => sum + round.minutes, 0);

      breakdown.finalStage = {
        qualifiedCount,
        totalMatches,
        bracketRounds,
        earlyRoundMatches,
        earlyRoundsMinutes: Math.round(earlyRoundsMinutes),
        semifinalMatches,
        semifinalsMinutes: Math.round(semifinalsMinutes),
        parallelSemifinals: effectiveConfig.parallelSemifinals,
        finalMatches,
        finalsMinutes: Math.round(finalsMinutes),
        minutesPerMatch: Math.round(displayMinutesPerMatch),
        breakPerMatch: effectiveConfig.breakBetweenMatches,
        totalMinutes: Math.round(totalFromBracketRounds),
        // Calculation details
        gameMode: finalGameMode,
        pointsToWin: finalPointsToWin,
        roundsToPlay: finalRoundsToPlay,
        matchesToWin: finalMatchesToWin,
        minutesPerGame: Math.round(finalDetails.minutesPerGame * 10) / 10,
        avgGamesPlayed: finalDetails.avgGamesPlayed
      };
    }
  }

  // Transition time
  breakdown.transitionMinutes = tournament.phaseType === 'TWO_PHASE' ? effectiveConfig.breakBetweenPhases : 0;

  // Total
  breakdown.totalMinutes =
    (breakdown.groupStage?.totalMinutes || 0) +
    breakdown.transitionMinutes +
    (breakdown.finalStage?.totalMinutes || 0);

  return breakdown;
}

/**
 * Calculate total tournament time estimate
 * Uses calculateTimeBreakdown internally to ensure consistency
 */
export function calculateTournamentTimeEstimate(
  tournament: Tournament,
  config?: TournamentTimeConfig
): TournamentTimeEstimate {
  // Use calculateTimeBreakdown to ensure consistent calculations
  const breakdown = calculateTimeBreakdown(tournament, config);

  return {
    totalMinutes: Math.round(breakdown.totalMinutes),
    groupStageMinutes: breakdown.groupStage?.totalMinutes
      ? Math.round(breakdown.groupStage.totalMinutes)
      : undefined,
    finalStageMinutes: breakdown.finalStage?.totalMinutes
      ? Math.round(breakdown.finalStage.totalMinutes)
      : undefined,
    calculatedAt: Date.now()
  };
}

/**
 * Format minutes as "Xh Ym" string
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Normalize round name to standard English format
 * Converts Spanish names (from old brackets) and handles singular/plural variations
 */
function normalizeRoundName(name: string): string {
  const lowerName = name.toLowerCase();

  // Check exact matches first (most common case for new brackets)
  if (lowerName === 'finals' || lowerName === 'final') return 'finals';
  if (lowerName === 'semifinals' || lowerName === 'semifinal') return 'semifinals';
  if (lowerName === 'quarterfinals' || lowerName === 'quarterfinal') return 'quarterfinals';
  if (lowerName === 'round16') return 'round16';
  if (lowerName === 'round32') return 'round32';
  if (lowerName === 'preliminary') return 'round16';

  // Spanish to English mapping (for brackets created before the English names change)
  // Order matters: check more specific patterns first
  if (lowerName.includes('cuarto')) {
    return 'quarterfinals';
  }
  if (lowerName.includes('semifinal') || lowerName.includes('semi')) {
    return 'semifinals';
  }
  // Check 'final' last since it's a substring of 'semifinal' and 'quarterfinal'
  if (lowerName.includes('final')) {
    return 'finals';
  }
  if (lowerName.includes('octavo')) {
    return 'round16';
  }
  if (lowerName.includes('dieciseis')) {
    return 'round32';
  }
  if (lowerName.includes('preliminar')) {
    return 'round16';
  }

  return lowerName;
}

/**
 * Helper to get bracket round status from tournament data
 * Returns completed and total matches per bracket round (normalized to English names)
 */
function getBracketRoundStatus(
  bracket: any,
  thirdPlaceMatch: any
): Map<string, { total: number; completed: number }> {
  const roundStatus = new Map<string, { total: number; completed: number }>();

  if (!bracket?.rounds) return roundStatus;

  for (const round of bracket.rounds) {
    const rawName = round.name || `round${round.matches?.length * 2 || 0}`;
    // Normalize to standard format (bracket now uses English names internally)
    const roundName = normalizeRoundName(rawName);

    let total = 0;
    let completed = 0;

    for (const match of round.matches || []) {
      // Skip BYE matches
      if (match.participantA === 'BYE' || match.participantB === 'BYE') {
        continue;
      }
      // Count matches with both participants assigned
      if (match.participantA && match.participantB) {
        total++;
        if (match.status === 'COMPLETED' || match.status === 'WALKOVER') {
          completed++;
        }
      }
    }

    if (total > 0) {
      // If this normalized name already exists, merge the counts
      const existing = roundStatus.get(roundName);
      if (existing) {
        existing.total += total;
        existing.completed += completed;
      } else {
        roundStatus.set(roundName, { total, completed });
      }
    }
  }

  // Handle 3rd place match - it's part of "finals" phase
  if (thirdPlaceMatch && thirdPlaceMatch.participantA && thirdPlaceMatch.participantB) {
    const finalsEntry = roundStatus.get('finals');
    if (finalsEntry) {
      finalsEntry.total++;
      if (thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'WALKOVER') {
        finalsEntry.completed++;
      }
    } else {
      // Create finals entry if final round not found
      roundStatus.set('finals', {
        total: 1,
        completed: thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'WALKOVER' ? 1 : 0
      });
    }
  }

  return roundStatus;
}

/**
 * Calculate remaining time and progress based on completed matches
 * Uses phase-aware calculation: each bracket phase must complete before the next starts
 */
export function calculateRemainingTime(tournament: Tournament): {
  remainingMinutes: number;
  percentComplete: number;
} {
  if (!tournament.timeEstimate) {
    return { remainingMinutes: 0, percentComplete: 0 };
  }

  // Get the breakdown to have phase-specific times
  const breakdown = calculateTimeBreakdown(tournament);

  // === GROUP STAGE ===
  let groupTotalMatches = 0;
  let groupCompletedMatches = 0;

  if (tournament.groupStage?.groups) {
    for (const group of tournament.groupStage.groups) {
      // Round Robin schedule
      if (group.schedule) {
        for (const round of group.schedule) {
          for (const match of round.matches) {
            if (match.participantB === 'BYE') continue;
            groupTotalMatches++;
            if (match.status === 'COMPLETED' || match.status === 'WALKOVER') {
              groupCompletedMatches++;
            }
          }
        }
      }
      // Swiss pairings
      if (group.pairings) {
        // For Swiss, use the total rounds defined, not just generated rounds
        const numSwissRounds = tournament.groupStage?.numSwissRounds || tournament.groupStage?.totalRounds || group.pairings.length;
        const participantsInGroup = group.participants?.length || 0;
        const matchesPerRound = Math.floor(participantsInGroup / 2);

        // Total matches = rounds × matches per round
        groupTotalMatches += numSwissRounds * matchesPerRound;

        // Count completed matches from generated pairings
        for (const pairing of group.pairings) {
          for (const match of pairing.matches) {
            if (match.participantB === 'BYE') continue;
            if (match.status === 'COMPLETED' || match.status === 'WALKOVER') {
              groupCompletedMatches++;
            }
          }
        }
      }
    }
  }

  // === FINAL STAGE - Calculate by bracket phases ===
  // Get status per bracket round from actual tournament data
  const goldBracketStatus = getBracketRoundStatus(
    tournament.finalStage?.bracket,
    tournament.finalStage?.bracket?.thirdPlaceMatch
  );
  const silverBracketStatus = getBracketRoundStatus(
    tournament.finalStage?.silverBracket,
    tournament.finalStage?.silverBracket?.thirdPlaceMatch
  );

  // Calculate remaining time
  const groupStageMinutes = breakdown.groupStage?.totalMinutes || 0;
  const transitionMinutes = breakdown.transitionMinutes || 0;
  const bracketRounds = breakdown.finalStage?.bracketRounds || [];

  let remainingMinutes = 0;
  let completedMinutes = 0;

  // Group stage remaining
  if (groupTotalMatches > 0) {
    const groupProgress = groupCompletedMatches / groupTotalMatches;
    remainingMinutes += groupStageMinutes * (1 - groupProgress);
    completedMinutes += groupStageMinutes * groupProgress;
  }

  // Transition time
  const groupStageComplete = groupTotalMatches > 0 && groupCompletedMatches === groupTotalMatches;
  const hasFinalStageData = goldBracketStatus.size > 0 || silverBracketStatus.size > 0;
  const anyFinalMatchCompleted = Array.from(goldBracketStatus.values()).some(s => s.completed > 0) ||
                                  Array.from(silverBracketStatus.values()).some(s => s.completed > 0);

  if (tournament.phaseType === 'TWO_PHASE') {
    if (!groupStageComplete) {
      // Group stage not complete - add full transition time
      remainingMinutes += transitionMinutes;
    } else if (!anyFinalMatchCompleted) {
      // In transition or final stage not started
      remainingMinutes += transitionMinutes;
    }
    // If any final match completed, transition is done
  }

  // Final stage - calculate by phases
  // Each phase must complete before the next can start
  if (bracketRounds.length > 0) {
    if (!hasFinalStageData) {
      // Bracket not generated yet - add full final stage time
      for (const round of bracketRounds) {
        remainingMinutes += round.minutes;
      }
    } else {
      // Calculate per-phase progress
      // Phases are sequential: preliminary -> quarters -> semis -> finals
      // Within a phase, all matches must complete before next phase starts

      // Helper to find status by round name (now uses English names internally)
      const findRoundStatus = (
        statusMap: Map<string, { total: number; completed: number }>,
        breakdownName: string
      ): { total: number; completed: number } | null => {
        const normalizedName = normalizeRoundName(breakdownName);
        if (statusMap.has(normalizedName)) return statusMap.get(normalizedName)!;
        return null;
      };

      let previousPhaseComplete = true;

      for (const round of bracketRounds) {
        const goldStatus = findRoundStatus(goldBracketStatus, round.name);
        const silverStatus = findRoundStatus(silverBracketStatus, round.name);

        const totalInPhase = (goldStatus?.total || 0) + (silverStatus?.total || 0);
        const completedInPhase = (goldStatus?.completed || 0) + (silverStatus?.completed || 0);

        if (totalInPhase === 0) {
          // Phase not yet populated (TBD matches)
          remainingMinutes += round.minutes;
          previousPhaseComplete = false;
        } else if (!previousPhaseComplete) {
          // Previous phase not complete - this phase hasn't started
          remainingMinutes += round.minutes;
        } else {
          // Phase is in progress or complete
          const phaseProgress = completedInPhase / totalInPhase;
          remainingMinutes += round.minutes * (1 - phaseProgress);
          completedMinutes += round.minutes * phaseProgress;
          previousPhaseComplete = completedInPhase === totalInPhase;
        }
      }
    }
  }

  // Calculate overall percent complete
  const totalMinutes = breakdown.totalMinutes;
  const percentComplete = totalMinutes > 0
    ? ((totalMinutes - remainingMinutes) / totalMinutes) * 100
    : 0;

  return {
    remainingMinutes: Math.round(remainingMinutes),
    percentComplete: Math.round(Math.max(0, Math.min(100, percentComplete)))
  };
}
