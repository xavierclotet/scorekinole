/**
 * Tournament bracket (final stage) management
 * Single elimination bracket operations
 */

import { getTournament, updateTournament } from './tournaments';
import { generateBracket as generateBracketAlgorithm, advanceWinner as advanceWinnerAlgorithm, getQualifiedParticipants } from '$lib/algorithms/bracket';
import { calculateFinalPositions, applyEloUpdates } from './tournamentElo';
import type { BracketMatch } from '$lib/types/tournament';

/**
 * Generate bracket from qualified participants
 *
 * @param tournamentId Tournament ID
 * @param config Optional final stage game configuration
 * @returns true if successful
 */
export async function generateBracket(
  tournamentId: string,
  config?: {
    gameMode: 'points' | 'rounds';
    pointsToWin?: number;
    roundsToPlay?: number;
    matchesToWin: number;
  }
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  try {
    let qualifiedParticipantIds: string[] = [];

    if (tournament.phaseType === 'TWO_PHASE') {
      // Get qualified from group stage (based on qualifiedForFinal flag set in transition)
      if (!tournament.groupStage || !tournament.groupStage.isComplete) {
        console.error('Group stage not complete');
        return false;
      }

      // Ensure groups is an array (Firestore may return object)
      const groups = Array.isArray(tournament.groupStage.groups)
        ? tournament.groupStage.groups
        : Object.values(tournament.groupStage.groups);

      // Collect all participants marked as qualifiedForFinal
      // Maintain seeding order: 1st place from each group, then 2nd place from each group, etc.
      const qualifiedByPosition: Map<number, string[]> = new Map();

      groups.forEach((group) => {
        // Ensure standings is an array
        const standings = Array.isArray(group.standings)
          ? group.standings
          : Object.values(group.standings);

        standings
          .filter(s => s.qualifiedForFinal)
          .sort((a, b) => a.position - b.position)
          .forEach(standing => {
            if (!qualifiedByPosition.has(standing.position)) {
              qualifiedByPosition.set(standing.position, []);
            }
            qualifiedByPosition.get(standing.position)!.push(standing.participantId);
          });
      });

      // Flatten: 1st from all groups, then 2nd from all groups, etc.
      const sortedPositions = Array.from(qualifiedByPosition.keys()).sort((a, b) => a - b);
      for (const position of sortedPositions) {
        qualifiedParticipantIds.push(...qualifiedByPosition.get(position)!);
      }

      if (qualifiedParticipantIds.length < 2) {
        console.error('Not enough qualified participants');
        return false;
      }

      // Validate power of 2
      if ((qualifiedParticipantIds.length & (qualifiedParticipantIds.length - 1)) !== 0) {
        console.error(`Number of qualified participants must be power of 2 (got ${qualifiedParticipantIds.length})`);
        return false;
      }
    } else {
      // ONE_PHASE: all participants go to bracket
      qualifiedParticipantIds = tournament.participants.map(p => p.id);
    }

    // Get participant objects
    const qualifiedParticipants = qualifiedParticipantIds
      .map(id => tournament.participants.find(p => p.id === id))
      .filter(p => p !== undefined);

    if (qualifiedParticipants.length < 2) {
      console.error('Not enough qualified participants');
      return false;
    }

    // Generate bracket
    const bracket = generateBracketAlgorithm(qualifiedParticipants);

    // Update tournament
    // Use provided config or defaults: points mode (to 7 points), best of 3
    const finalStageConfig = config || {
      gameMode: 'points' as const,
      pointsToWin: 7,
      matchesToWin: 3
    };

    return await updateTournament(tournamentId, {
      finalStage: {
        type: 'SINGLE_ELIMINATION',
        bracket,
        isComplete: false,
        gameMode: finalStageConfig.gameMode,
        pointsToWin: finalStageConfig.pointsToWin,
        roundsToPlay: finalStageConfig.roundsToPlay,
        matchesToWin: finalStageConfig.matchesToWin
      }
    });
  } catch (error) {
    console.error('❌ Error generating bracket:', error);
    return false;
  }
}

/**
 * Update bracket match result
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param result Match result data
 * @returns true if successful
 */
export async function updateBracketMatch(
  tournamentId: string,
  matchId: string,
  result: Partial<BracketMatch>
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage) {
    console.error('Tournament or final stage not found');
    return false;
  }

  try {
    const bracket = tournament.finalStage.bracket;
    let matchUpdated = false;

    console.log('🔧 updateBracketMatch - Received result:', result);
    console.log('🔧 result.rounds:', result.rounds);

    // Clean undefined values from result to avoid Firestore errors
    const cleanResult: Partial<BracketMatch> = {};
    Object.entries(result).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanResult[key as keyof BracketMatch] = value;
      }
    });

    console.log('🔧 cleanResult after cleaning:', cleanResult);
    console.log('🔧 cleanResult.rounds:', cleanResult.rounds);

    // Add completedAt if status is COMPLETED
    if (result.status === 'COMPLETED') {
      cleanResult.completedAt = Date.now();
    }

    // Find and update match (check 3rd place match first)
    if (bracket.thirdPlaceMatch?.id === matchId) {
      bracket.thirdPlaceMatch = {
        ...bracket.thirdPlaceMatch,
        ...cleanResult
      };
      matchUpdated = true;
    } else {
      // Search in rounds
      for (const round of bracket.rounds) {
        const matchIndex = round.matches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          round.matches[matchIndex] = {
            ...round.matches[matchIndex],
            ...cleanResult
          };
          matchUpdated = true;
          break;
        }
      }
    }

    if (!matchUpdated) {
      console.error('Match not found');
      return false;
    }

    // Update tournament
    await updateTournament(tournamentId, {
      finalStage: {
        ...tournament.finalStage,
        bracket
      }
    });

    return true;
  } catch (error) {
    console.error('❌ Error updating bracket match:', error);
    return false;
  }
}

/**
 * Advance winner to next match
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param winnerId Winner participant ID
 * @returns true if successful
 */
export async function advanceWinner(
  tournamentId: string,
  matchId: string,
  winnerId: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage) {
    console.error('Tournament or final stage not found');
    return false;
  }

  try {
    // Use algorithm to advance winner
    const updatedBracket = advanceWinnerAlgorithm(
      tournament.finalStage.bracket,
      matchId,
      winnerId
    );

    // Check if final match is complete
    const finalRound = updatedBracket.rounds[updatedBracket.rounds.length - 1];
    const finalMatch = finalRound.matches[0];
    const isFinalComplete = finalMatch.status === 'COMPLETED' || finalMatch.status === 'WALKOVER';

    // Check if 3rd place match is complete (if it exists)
    const thirdPlaceMatch = updatedBracket.thirdPlaceMatch;
    const isThirdPlaceComplete = !thirdPlaceMatch ||
      thirdPlaceMatch.status === 'COMPLETED' ||
      thirdPlaceMatch.status === 'WALKOVER';

    // Tournament is complete only when both final AND 3rd place match are done
    const isTournamentComplete = isFinalComplete && isThirdPlaceComplete;

    // Update tournament - if all matches complete, also set tournament status to COMPLETED
    const updateData: any = {
      finalStage: {
        ...tournament.finalStage,
        bracket: updatedBracket,
        isComplete: isTournamentComplete,
        winner: isFinalComplete ? finalMatch.winner : undefined
      }
    };

    // If all matches are complete, mark entire tournament as COMPLETED
    if (isTournamentComplete) {
      updateData.status = 'COMPLETED';
      updateData.completedAt = Date.now();
      console.log('🏆 Final and 3rd place matches completed - marking tournament as COMPLETED');
    }

    const success = await updateTournament(tournamentId, updateData);

    // If tournament just completed, calculate positions and apply ELO updates
    if (success && isFinalComplete) {
      console.log('📊 Calculating final positions and ELO updates...');
      await calculateFinalPositions(tournamentId);
      await applyEloUpdates(tournamentId);
    }

    return success;
  } catch (error) {
    console.error('❌ Error advancing winner:', error);
    return false;
  }
}

/**
 * Mark participant as no-show in bracket (walkover)
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param participantId Participant who didn't show
 * @returns true if successful
 */
export async function markBracketNoShow(
  tournamentId: string,
  matchId: string,
  participantId: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage) {
    console.error('Tournament or final stage not found');
    return false;
  }

  // Find match
  let match: BracketMatch | undefined;
  for (const round of tournament.finalStage.bracket.rounds) {
    match = round.matches.find(m => m.id === matchId);
    if (match) break;
  }

  if (!match) {
    console.error('Match not found');
    return false;
  }

  // Determine winner (opponent)
  const winner =
    match.participantA === participantId ? match.participantB : match.participantA;

  if (!winner) {
    console.error('Cannot determine winner for walkover');
    return false;
  }

  // Update match as walkover
  await updateBracketMatch(tournamentId, matchId, {
    status: 'WALKOVER',
    winner,
    gamesWonA: match.participantA === winner ? 2 : 0,
    gamesWonB: match.participantB === winner ? 2 : 0,
    noShowParticipant: participantId,
    walkedOverAt: Date.now()
  });

  // Advance winner
  return await advanceWinner(tournamentId, matchId, winner);
}

/**
 * Complete final stage
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function completeFinalStage(tournamentId: string): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage) {
    console.error('Tournament or final stage not found');
    return false;
  }

  // Verify final match is complete
  const finalRound = tournament.finalStage.bracket.rounds[tournament.finalStage.bracket.rounds.length - 1];
  const finalMatch = finalRound.matches[0];

  if (finalMatch.status !== 'COMPLETED' && finalMatch.status !== 'WALKOVER') {
    console.error('Final match is not complete');
    return false;
  }

  if (!finalMatch.winner) {
    console.error('Final match has no winner');
    return false;
  }

  // Verify 3rd place match is complete (if it exists)
  const thirdPlaceMatch = tournament.finalStage.bracket.thirdPlaceMatch;
  if (thirdPlaceMatch) {
    if (thirdPlaceMatch.status !== 'COMPLETED' && thirdPlaceMatch.status !== 'WALKOVER') {
      console.error('3rd place match is not complete');
      return false;
    }
  }

  // Mark final stage as complete and update tournament status
  const success = await updateTournament(tournamentId, {
    status: 'COMPLETED',
    completedAt: Date.now(),
    finalStage: {
      ...tournament.finalStage,
      isComplete: true,
      winner: finalMatch.winner
    }
  });

  // Calculate positions and apply ELO updates
  if (success) {
    console.log('📊 Calculating final positions and ELO updates...');
    await calculateFinalPositions(tournamentId);
    await applyEloUpdates(tournamentId);
  }

  return success;
}
