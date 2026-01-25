/**
 * Bracket phase configuration utility
 * Determines game settings based on bracket phase (early rounds, semifinals, final)
 */

import type { BracketWithConfig, PhaseConfig } from '$lib/types/tournament';

// Re-export PhaseConfig for backwards compatibility
export type { PhaseConfig };

/**
 * Get the game configuration for a specific bracket phase
 *
 * @param bracket - The bracket with embedded config
 * @param roundNumber - The round number (1-indexed)
 * @param totalRounds - Total number of rounds in the bracket
 * @param isThirdPlace - Whether this is the 3rd/4th place match
 * @returns The phase configuration
 */
export function getPhaseConfig(
  bracket: BracketWithConfig,
  roundNumber: number,
  totalRounds: number,
  isThirdPlace: boolean = false
): PhaseConfig {
  // Fallback defaults if no config
  if (!bracket.config) {
    return {
      gameMode: 'points',
      pointsToWin: 7,
      matchesToWin: 1
    };
  }

  const config = bracket.config;

  // Determine which phase this round belongs to
  const isFinal = roundNumber === totalRounds && !isThirdPlace;
  const isSemifinal = roundNumber === totalRounds - 1 || isThirdPlace;

  if (isFinal) {
    return config.final;
  }

  if (isSemifinal) {
    return config.semifinal;
  }

  // Early rounds (octavos, cuartos, etc.)
  return config.earlyRounds;
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
