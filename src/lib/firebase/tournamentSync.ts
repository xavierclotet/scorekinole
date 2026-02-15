/**
 * Tournament Sync Service
 *
 * Centralized service for all tournament match synchronization.
 * All writes to tournament matches should go through this service.
 *
 * This service wraps the underlying functions from tournamentMatches.ts
 * and tournamentBracket.ts to provide a unified API.
 */

import { browser } from '$app/environment';
import { isFirebaseEnabled } from './config';
import {
  updateTournamentMatchRounds,
  completeTournamentMatch,
  markNoShow as markNoShowGroup,
  startTournamentMatch,
  abandonTournamentMatch
} from './tournamentMatches';
import {
  updateBracketMatch,
  advanceWinner,
  updateSilverBracketMatch,
  advanceSilverWinner
} from './tournamentBracket';
import { getTournament, subscribeTournament } from './tournaments';

/**
 * Round data structure for sync
 */
export interface MatchRound {
  gameNumber: number;
  roundInGame: number;
  pointsA: number | null;
  pointsB: number | null;
  twentiesA: number;
  twentiesB: number;
  hammerSide?: 'A' | 'B' | null;  // Which participant had the hammer in this round
}

/**
 * Data for syncing match progress (during match)
 */
export interface MatchProgressData {
  rounds: MatchRound[];
  gamesWonA: number;
  gamesWonB: number;
}

/**
 * Data for completing a match
 */
export interface MatchCompleteData {
  rounds: MatchRound[];
  winner: string | null; // null for ties in rounds mode
  gamesWonA: number;
  gamesWonB: number;
  totalPointsA: number;
  totalPointsB: number;
  total20sA: number;
  total20sB: number;
  videoUrl?: string;
  videoId?: string;
}

/**
 * Sync match progress (rounds, games won, 20s) in real-time
 * Called after each round is completed
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param phase GROUP or FINAL
 * @param groupId Group ID (for group stage matches)
 * @param data Progress data to sync
 * @returns true if successful
 */
export async function syncMatchProgress(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId: string | undefined,
  data: MatchProgressData
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.log('⏭️ syncMatchProgress skipped: Firebase disabled');
    return false;
  }

  console.log('📤 syncMatchProgress:', {
    tournamentId,
    matchId,
    phase,
    roundsCount: data.rounds.length,
    gamesWonA: data.gamesWonA,
    gamesWonB: data.gamesWonB
  });

  try {
    const success = await updateTournamentMatchRounds(
      tournamentId,
      matchId,
      phase,
      groupId,
      data.rounds,
      { gamesWonA: data.gamesWonA, gamesWonB: data.gamesWonB }
    );

    if (success) {
      console.log('✅ Match progress synced successfully');
    } else {
      console.warn('⚠️ Match progress sync returned false');
    }

    return success;
  } catch (error) {
    console.error('❌ Error syncing match progress:', error);
    return false;
  }
}

/**
 * Complete a match and update standings/bracket advancement
 * Called when match ends
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param phase GROUP or FINAL
 * @param groupId Group ID (for group stage matches)
 * @param data Complete match data
 * @returns true if successful
 */
export async function completeMatch(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId: string | undefined,
  data: MatchCompleteData
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.log('⏭️ completeMatch skipped: Firebase disabled');
    return false;
  }

  console.log('🏁 completeMatch:', {
    tournamentId,
    matchId,
    phase,
    winner: data.winner,
    gamesWonA: data.gamesWonA,
    gamesWonB: data.gamesWonB
  });

  try {
    const success = await completeTournamentMatch(
      tournamentId,
      matchId,
      phase,
      groupId,
      {
        winner: data.winner,
        gamesWonA: data.gamesWonA,
        gamesWonB: data.gamesWonB,
        totalPointsA: data.totalPointsA,
        totalPointsB: data.totalPointsB,
        total20sA: data.total20sA,
        total20sB: data.total20sB,
        rounds: data.rounds,
        videoUrl: data.videoUrl,
        videoId: data.videoId
      }
    );

    if (success) {
      console.log('✅ Match completed and synced successfully');
    } else {
      console.warn('⚠️ Match completion sync returned false');
    }

    return success;
  } catch (error) {
    console.error('❌ Error completing match:', error);
    return false;
  }
}

/**
 * Mark a participant as no-show (walkover)
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param phase GROUP or FINAL
 * @param groupId Group ID (for group stage matches)
 * @param noShowParticipantId ID of participant who didn't show
 * @returns true if successful
 */
export async function markNoShow(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId: string | undefined,
  noShowParticipantId: string
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.log('⏭️ markNoShow skipped: Firebase disabled');
    return false;
  }

  console.log('🚫 markNoShow:', {
    tournamentId,
    matchId,
    phase,
    noShowParticipantId
  });

  try {
    if (phase === 'GROUP') {
      return await markNoShowGroup(tournamentId, matchId, noShowParticipantId);
    } else {
      // For bracket matches, need to determine winner and update bracket
      const tournament = await getTournament(tournamentId);
      if (!tournament || !tournament.finalStage) {
        return false;
      }

      // Find the match to get the other participant
      let match: any;
      let isSilverBracket = false;

      // Check gold bracket
      if (tournament.finalStage.goldBracket?.rounds) {
        for (const round of tournament.finalStage.goldBracket.rounds) {
          match = round.matches.find(m => m.id === matchId);
          if (match) break;
        }

        // Check 3rd place
        if (!match && tournament.finalStage.goldBracket.thirdPlaceMatch?.id === matchId) {
          match = tournament.finalStage.goldBracket.thirdPlaceMatch;
        }
      }

      // Check silver bracket
      if (!match && tournament.finalStage.silverBracket?.rounds) {
        for (const round of tournament.finalStage.silverBracket.rounds) {
          match = round.matches.find(m => m.id === matchId);
          if (match) {
            isSilverBracket = true;
            break;
          }
        }
        if (!match && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
          match = tournament.finalStage.silverBracket.thirdPlaceMatch;
          isSilverBracket = true;
        }
      }

      if (!match) {
        console.error('Match not found');
        return false;
      }

      // Determine winner (the one who showed up)
      const winner = match.participantA === noShowParticipantId
        ? match.participantB
        : match.participantA;

      // Update match with walkover status
      const updateFn = isSilverBracket ? updateSilverBracketMatch : updateBracketMatch;
      const success = await updateFn(tournamentId, matchId, {
        status: 'WALKOVER',
        winner,
        noShowParticipant: noShowParticipantId,
        gamesWonA: winner === match.participantA ? 1 : 0,
        gamesWonB: winner === match.participantB ? 1 : 0
      });

      if (!success) {
        return false;
      }

      // Advance winner
      const advanceFn = isSilverBracket ? advanceSilverWinner : advanceWinner;
      return await advanceFn(tournamentId, matchId, winner);
    }
  } catch (error) {
    console.error('❌ Error marking no-show:', error);
    return false;
  }
}

/**
 * Start a match (change from PENDING to IN_PROGRESS)
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param phase GROUP or FINAL
 * @param groupId Group ID (for group stage matches)
 * @returns Result with success flag and optional error
 */
export async function startMatch(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!browser || !isFirebaseEnabled()) {
    return { success: false, error: 'Firebase disabled' };
  }

  console.log('▶️ startMatch:', { tournamentId, matchId, phase });

  return await startTournamentMatch(tournamentId, matchId, phase, groupId);
}

/**
 * Abandon a match (revert from IN_PROGRESS to PENDING)
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param phase GROUP or FINAL
 * @param groupId Group ID (for group stage matches)
 * @returns true if successful
 */
export async function abandonMatch(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId?: string
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  console.log('⏹️ abandonMatch:', { tournamentId, matchId, phase });

  return await abandonTournamentMatch(tournamentId, matchId, phase, groupId);
}

/**
 * Subscribe to match status changes
 * Used by /game to detect if admin completes the match externally
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param phase GROUP or FINAL
 * @param groupId Group ID (for group stage matches)
 * @param callback Called when match status changes
 * @returns Unsubscribe function
 */
export function subscribeToMatchStatus(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId: string | undefined,
  callback: (status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'WALKOVER', winner?: string | null, matchParticipants?: { participantA: string | null; participantB: string | null }) => void
): () => void {
  if (!browser || !isFirebaseEnabled()) {
    return () => {};
  }

  let lastStatus: string | null = null;

  const unsubscribe = subscribeTournament(tournamentId, (tournament: any) => {
    if (!tournament) return;

    let match: any = null;

    if (phase === 'GROUP' && tournament.groupStage?.groups) {
      // Find match in groups - check both schedule (Round Robin) and pairings (Swiss)
      for (const group of tournament.groupStage.groups) {
        if (groupId && group.id !== groupId) continue;

        // Check in schedule (Round Robin format)
        if (group.schedule) {
          for (const round of group.schedule) {
            match = round.matches?.find((m: any) => m.id === matchId);
            if (match) break;
          }
        }

        // Check in pairings (Swiss format)
        if (!match && group.pairings) {
          for (const pairing of group.pairings) {
            match = pairing.matches?.find((m: any) => m.id === matchId);
            if (match) break;
          }
        }

        if (match) break;
      }
    } else if (phase === 'FINAL' && tournament.finalStage) {
      // Check gold bracket
      if (tournament.finalStage.goldBracket?.rounds) {
        for (const round of tournament.finalStage.goldBracket.rounds) {
          match = round.matches?.find((m: any) => m.id === matchId);
          if (match) break;
        }
        // Check 3rd place
        if (!match && tournament.finalStage.goldBracket.thirdPlaceMatch?.id === matchId) {
          match = tournament.finalStage.goldBracket.thirdPlaceMatch;
        }
      }

      // Check silver bracket
      if (!match && tournament.finalStage.silverBracket?.rounds) {
        for (const round of tournament.finalStage.silverBracket.rounds) {
          match = round.matches?.find((m: any) => m.id === matchId);
          if (match) break;
        }
        if (!match && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
          match = tournament.finalStage.silverBracket.thirdPlaceMatch;
        }
      }

      // Check consolation brackets (array of brackets, e.g., QF and R16)
      if (!match && tournament.finalStage.goldBracket?.consolationBrackets) {
        for (const consolationBracket of tournament.finalStage.goldBracket.consolationBrackets) {
          for (const round of consolationBracket.rounds || []) {
            match = round.matches?.find((m: any) => m.id === matchId);
            if (match) break;
          }
          if (match) break;
        }
      }
      if (!match && tournament.finalStage.silverBracket?.consolationBrackets) {
        for (const consolationBracket of tournament.finalStage.silverBracket.consolationBrackets) {
          for (const round of consolationBracket.rounds || []) {
            match = round.matches?.find((m: any) => m.id === matchId);
            if (match) break;
          }
          if (match) break;
        }
      }
    }

    if (match && match.status !== lastStatus) {
      console.log('📡 subscribeToMatchStatus - match found:', {
        matchId,
        status: match.status,
        winner: match.winner,
        participantA: match.participantA,
        participantB: match.participantB
      });
      lastStatus = match.status;
      callback(match.status, match.winner, {
        participantA: match.participantA || null,
        participantB: match.participantB || null
      });
    }
  });

  return unsubscribe;
}

// Re-export for convenience
export { getTournament } from './tournaments';
export { getPendingMatchesForUser, getAllPendingMatches, getUserActiveMatches, resumeTournamentMatch } from './tournamentMatches';
export type { PendingMatchInfo } from './tournamentMatches';
