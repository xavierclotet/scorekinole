/**
 * Tournament time configuration defaults
 * Time settings are now stored per-tournament, not globally in Firebase
 */

import type { TournamentTimeConfig } from '$lib/types/tournament';

/**
 * Default time configuration values
 * Used as defaults when creating new tournaments
 */
export const DEFAULT_TIME_CONFIG: TournamentTimeConfig = {
  minutesPer4RoundsSingles: 10,
  minutesPer4RoundsDoubles: 15,
  avgRoundsForPointsMode: {
    5: 4,
    7: 6,
    9: 8,
    11: 10
  },
  breakBetweenMatches: 5,
  breakBetweenPhases: 10,
  parallelSemifinals: true,
  parallelFinals: true
};
