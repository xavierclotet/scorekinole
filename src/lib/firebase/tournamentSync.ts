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
import { completeBracketMatchAndAdvance } from './tournamentBracket';
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
  hammer?: string | null;  // Participant ID who had hammer this round
}

/**
 * Data for syncing match progress (during match)
 */
export interface MatchProgressData {
  rounds: MatchRound[];
  gamesWonA: number;
  gamesWonB: number;
  currentHammer?: string | null;
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
      { gamesWonA: data.gamesWonA, gamesWonB: data.gamesWonB, currentHammer: data.currentHammer ?? null }
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

// --- Pending tournament match completion offline queue ---

const PENDING_TOURNAMENT_COMPLETION_KEY = 'pendingTournamentCompletion';

interface PendingTournamentCompletion {
  tournamentId: string;
  matchId: string;
  phase: 'GROUP' | 'FINAL';
  groupId: string | undefined;
  data: MatchCompleteData;
}

export function savePendingTournamentCompletion(pending: PendingTournamentCompletion): void {
  if (!browser) return;
  localStorage.setItem(PENDING_TOURNAMENT_COMPLETION_KEY, JSON.stringify(pending));
}

export function removePendingTournamentCompletion(): void {
  if (!browser) return;
  localStorage.removeItem(PENDING_TOURNAMENT_COMPLETION_KEY);
}

export async function retryPendingTournamentCompletion(): Promise<boolean> {
  if (!browser) return false;
  const raw = localStorage.getItem(PENDING_TOURNAMENT_COMPLETION_KEY);
  if (!raw) return false;

  try {
    const pending: PendingTournamentCompletion = JSON.parse(raw);
    const success = await completeMatch(
      pending.tournamentId,
      pending.matchId,
      pending.phase,
      pending.groupId,
      pending.data
    );
    if (success) {
      removePendingTournamentCompletion();
      console.log('✅ Pending tournament match completion synced:', pending.matchId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error retrying pending tournament completion:', error);
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
      // For bracket matches, need to determine winner and update bracket atomically
      // Read tournament to find match participants (stale read is safe - participants don't change)
      const tournament = await getTournament(tournamentId);
      if (!tournament || !tournament.finalStage) {
        return false;
      }

      // Find the match to get the other participant
      // Searches: gold main, gold 3rd place, gold consolation, silver main, silver 3rd place, silver consolation
      let match: any;

      const findInBracket = (bracket: any) => {
        if (!bracket) return;
        // Main rounds
        if (bracket.rounds) {
          for (const round of bracket.rounds) {
            const found = round.matches.find((m: any) => m.id === matchId);
            if (found) { match = found; return; }
          }
        }
        // 3rd place
        if (bracket.thirdPlaceMatch?.id === matchId) {
          match = bracket.thirdPlaceMatch;
          return;
        }
        // Consolation brackets
        if (bracket.consolationBrackets) {
          for (const consolation of bracket.consolationBrackets) {
            for (const round of consolation.rounds) {
              const found = round.matches.find((m: any) => m.id === matchId);
              if (found) { match = found; return; }
            }
          }
        }
      };

      findInBracket(tournament.finalStage.goldBracket);
      if (!match) findInBracket(tournament.finalStage.silverBracket);

      if (!match) {
        console.error('Match not found in any bracket');
        return false;
      }

      // Determine winner (the one who showed up)
      const winner = match.participantA === noShowParticipantId
        ? match.participantB
        : match.participantA;

      // Use atomic transaction: updates match, advances winner, checks completion in one go
      return await completeBracketMatchAndAdvance(tournamentId, matchId, {
        status: 'WALKOVER',
        winner,
        noShowParticipant: noShowParticipantId,
        gamesWonA: winner === match.participantA ? 1 : 0,
        gamesWonB: winner === match.participantB ? 1 : 0
      });
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
