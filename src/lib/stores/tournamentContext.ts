/**
 * Tournament context for /game page
 * Stores information about current tournament match being played
 */

import { writable } from 'svelte/store';

/**
 * Tournament match context
 */
export interface TournamentMatchContext {
  tournamentId: string;
  tournamentName: string;
  matchId: string;
  participantAId: string;
  participantBId: string;
  participantAName: string;
  participantBName: string;
  phase: 'GROUP' | 'FINAL';
  roundNumber?: number;
  groupId?: string;
}

/**
 * Store for tournament context in game page
 */
export const gameTournamentContext = writable<TournamentMatchContext | null>(null);

/**
 * Helper function to set tournament context
 */
export function setTournamentContext(context: TournamentMatchContext | null) {
  gameTournamentContext.set(context);
}

/**
 * Helper function to clear tournament context
 */
export function clearTournamentContext() {
  gameTournamentContext.set(null);
}

/**
 * Helper function to check if currently in tournament mode
 */
export function isInTournamentMode(): boolean {
  let inTournament = false;
  gameTournamentContext.subscribe(ctx => {
    inTournament = ctx !== null;
  })();
  return inTournament;
}
