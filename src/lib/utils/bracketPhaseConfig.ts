/**
 * Bracket phase configuration utility
 * Determines game settings based on bracket phase (early rounds, semifinals, final)
 */

import type { FinalStage } from '$lib/types/tournament';

export interface PhaseConfig {
  gameMode: 'points' | 'rounds';
  pointsToWin: number;
  roundsToPlay: number;
  matchesToWin: number;
}

/**
 * Get the game configuration for a specific bracket phase
 *
 * @param finalStage - The final stage configuration
 * @param roundNumber - The round number (1-indexed)
 * @param totalRounds - Total number of rounds in the bracket
 * @param isThirdPlace - Whether this is the 3rd/4th place match
 * @param isSilverBracket - Whether this is the silver bracket
 * @returns The phase configuration
 */
export function getPhaseConfig(
  finalStage: FinalStage,
  roundNumber: number,
  totalRounds: number,
  isThirdPlace: boolean = false,
  isSilverBracket: boolean = false
): PhaseConfig {
  // Determine which phase this round belongs to
  const isFinal = roundNumber === totalRounds && !isThirdPlace;
  const isSemifinal = roundNumber === totalRounds - 1 || isThirdPlace;

  if (isSilverBracket) {
    return getSilverPhaseConfig(finalStage, isFinal, isSemifinal);
  }

  return getGoldPhaseConfig(finalStage, isFinal, isSemifinal);
}

function getGoldPhaseConfig(
  finalStage: FinalStage,
  isFinal: boolean,
  isSemifinal: boolean
): PhaseConfig {
  // Final configuration
  if (isFinal) {
    return {
      gameMode: finalStage.finalGameMode || finalStage.gameMode || 'points',
      pointsToWin: finalStage.finalPointsToWin ?? finalStage.pointsToWin ?? 9,
      roundsToPlay: finalStage.finalRoundsToPlay ?? finalStage.roundsToPlay ?? 4,
      matchesToWin: finalStage.finalMatchesToWin ?? finalStage.matchesToWin ?? 1
    };
  }

  // Semifinals configuration (includes 3rd/4th place match)
  if (isSemifinal) {
    return {
      gameMode: finalStage.semifinalGameMode || finalStage.gameMode || 'points',
      pointsToWin: finalStage.semifinalPointsToWin ?? finalStage.pointsToWin ?? 7,
      roundsToPlay: finalStage.semifinalRoundsToPlay ?? finalStage.roundsToPlay ?? 4,
      matchesToWin: finalStage.semifinalMatchesToWin ?? finalStage.matchesToWin ?? 1
    };
  }

  // Early rounds configuration (octavos, cuartos, etc.)
  // Falls back to general finalStage config, then to defaults
  return {
    gameMode: finalStage.earlyRoundsGameMode || finalStage.gameMode || 'points',
    pointsToWin: finalStage.earlyRoundsPointsToWin ?? finalStage.pointsToWin ?? 7,
    roundsToPlay: finalStage.earlyRoundsToPlay ?? finalStage.roundsToPlay ?? 4,
    matchesToWin: finalStage.earlyRoundsMatchesToWin ?? finalStage.matchesToWin ?? 1
  };
}

function getSilverPhaseConfig(
  finalStage: FinalStage,
  isFinal: boolean,
  isSemifinal: boolean
): PhaseConfig {
  // Final configuration for silver bracket
  if (isFinal) {
    return {
      gameMode: finalStage.silverFinalGameMode || finalStage.silverGameMode || 'points',
      pointsToWin: finalStage.silverFinalPointsToWin ?? finalStage.silverPointsToWin ?? 9,
      roundsToPlay: finalStage.silverFinalRoundsToPlay ?? finalStage.silverRoundsToPlay ?? 4,
      matchesToWin: finalStage.silverFinalMatchesToWin ?? finalStage.silverMatchesToWin ?? 1
    };
  }

  // Semifinals configuration for silver bracket
  if (isSemifinal) {
    return {
      gameMode: finalStage.silverSemifinalGameMode || finalStage.silverGameMode || 'points',
      pointsToWin: finalStage.silverSemifinalPointsToWin ?? finalStage.silverPointsToWin ?? 7,
      roundsToPlay: finalStage.silverSemifinalRoundsToPlay ?? finalStage.silverRoundsToPlay ?? 4,
      matchesToWin: finalStage.silverSemifinalMatchesToWin ?? finalStage.silverMatchesToWin ?? 1
    };
  }

  // Early rounds configuration for silver bracket
  // Falls back to silver bracket config, then general finalStage config, then defaults
  return {
    gameMode: finalStage.silverEarlyRoundsGameMode || finalStage.silverGameMode || finalStage.gameMode || 'points',
    pointsToWin: finalStage.silverEarlyRoundsPointsToWin ?? finalStage.silverPointsToWin ?? finalStage.pointsToWin ?? 7,
    roundsToPlay: finalStage.silverEarlyRoundsToPlay ?? finalStage.silverRoundsToPlay ?? finalStage.roundsToPlay ?? 4,
    matchesToWin: finalStage.silverEarlyRoundsMatchesToWin ?? finalStage.silverMatchesToWin ?? finalStage.matchesToWin ?? 1
  };
}

/**
 * Get the phase name for display purposes
 */
export function getPhaseName(
  roundNumber: number,
  totalRounds: number,
  isThirdPlace: boolean = false
): string {
  if (isThirdPlace) return '3º/4º Puesto';
  if (roundNumber === totalRounds) return 'Final';
  if (roundNumber === totalRounds - 1) return 'Semifinales';
  if (roundNumber === totalRounds - 2) return 'Cuartos';
  if (roundNumber === totalRounds - 3) return 'Octavos';
  return `Ronda ${roundNumber}`;
}
