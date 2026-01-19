/**
 * Tournament bracket (final stage) management
 * Single elimination bracket operations
 */

import { getTournament, updateTournament, updateTournamentPublic } from './tournaments';
import { generateBracket as generateBracketAlgorithm, advanceWinner as advanceWinnerAlgorithm } from '$lib/algorithms/bracket';
import { calculateFinalPositions, applyRankingUpdates } from './tournamentRanking';
import type { BracketMatch } from '$lib/types/tournament';

/**
 * Generate split brackets (Gold/Silver) for SPLIT_DIVISIONS mode
 *
 * @param tournamentId Tournament ID
 * @param options Configuration for both brackets
 * @returns true if successful
 */
export async function generateSplitBrackets(
  tournamentId: string,
  options: {
    goldParticipantIds: string[];
    silverParticipantIds: string[];
    goldConfig: {
      gameMode: 'points' | 'rounds';
      pointsToWin?: number;
      roundsToPlay?: number;
      matchesToWin: number;
    };
    silverConfig: {
      gameMode: 'points' | 'rounds';
      pointsToWin?: number;
      roundsToPlay?: number;
      matchesToWin: number;
    };
  }
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  try {
    const { goldParticipantIds, silverParticipantIds, goldConfig, silverConfig } = options;

    // Validate both have valid sizes (power of 2)
    if ((goldParticipantIds.length & (goldParticipantIds.length - 1)) !== 0) {
      console.error(`Gold bracket must have power of 2 participants (got ${goldParticipantIds.length})`);
      return false;
    }
    if ((silverParticipantIds.length & (silverParticipantIds.length - 1)) !== 0) {
      console.error(`Silver bracket must have power of 2 participants (got ${silverParticipantIds.length})`);
      return false;
    }

    // Get participant objects for gold bracket
    const goldParticipants = goldParticipantIds
      .map(id => tournament.participants.find(p => p.id === id))
      .filter(p => p !== undefined);

    // Get participant objects for silver bracket
    const silverParticipants = silverParticipantIds
      .map(id => tournament.participants.find(p => p.id === id))
      .filter(p => p !== undefined);

    if (goldParticipants.length < 2 || silverParticipants.length < 2) {
      console.error('Not enough participants for brackets');
      return false;
    }

    // Generate both brackets
    const goldBracket = generateBracketAlgorithm(goldParticipants);
    const silverBracket = generateBracketAlgorithm(silverParticipants);

    console.log('🥇 Generated Gold bracket with', goldParticipants.length, 'participants');
    console.log('🥈 Generated Silver bracket with', silverParticipants.length, 'participants');

    // Update tournament with both brackets
    return await updateTournament(tournamentId, {
      finalStage: {
        type: 'SINGLE_ELIMINATION',
        mode: 'SPLIT_DIVISIONS',
        bracket: goldBracket,
        silverBracket: silverBracket,
        isComplete: false,
        // Gold bracket config
        gameMode: goldConfig.gameMode,
        pointsToWin: goldConfig.pointsToWin,
        roundsToPlay: goldConfig.roundsToPlay,
        matchesToWin: goldConfig.matchesToWin,
        // Silver bracket config
        silverGameMode: silverConfig.gameMode,
        silverPointsToWin: silverConfig.pointsToWin,
        silverRoundsToPlay: silverConfig.roundsToPlay,
        silverMatchesToWin: silverConfig.matchesToWin
      }
    });
  } catch (error) {
    console.error('❌ Error generating split brackets:', error);
    return false;
  }
}

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
    // Per-phase configuration
    earlyRoundsGameMode?: 'points' | 'rounds';
    earlyRoundsPointsToWin?: number;
    earlyRoundsToPlay?: number;
    semifinalGameMode?: 'points' | 'rounds';
    semifinalPointsToWin?: number;
    semifinalRoundsToPlay?: number;
    semifinalMatchesToWin?: number;
    finalGameMode?: 'points' | 'rounds';
    finalPointsToWin?: number;
    finalRoundsToPlay?: number;
    finalMatchesToWin?: number;
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

      groups.forEach((group: any) => {
        // Ensure standings is an array
        const standings = Array.isArray(group.standings)
          ? group.standings
          : Object.values(group.standings) as any[];

        standings
          .filter((s: any) => s.qualifiedForFinal)
          .sort((a: any, b: any) => a.position - b.position)
          .forEach((standing: any) => {
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
        mode: 'SINGLE_BRACKET',
        bracket,
        isComplete: false,
        gameMode: finalStageConfig.gameMode,
        pointsToWin: finalStageConfig.pointsToWin,
        roundsToPlay: finalStageConfig.roundsToPlay,
        matchesToWin: finalStageConfig.matchesToWin,
        // Per-phase configuration
        earlyRoundsGameMode: finalStageConfig.earlyRoundsGameMode,
        earlyRoundsPointsToWin: finalStageConfig.earlyRoundsPointsToWin,
        earlyRoundsToPlay: finalStageConfig.earlyRoundsToPlay,
        semifinalGameMode: finalStageConfig.semifinalGameMode,
        semifinalPointsToWin: finalStageConfig.semifinalPointsToWin,
        semifinalRoundsToPlay: finalStageConfig.semifinalRoundsToPlay,
        semifinalMatchesToWin: finalStageConfig.semifinalMatchesToWin,
        finalGameMode: finalStageConfig.finalGameMode,
        finalPointsToWin: finalStageConfig.finalPointsToWin,
        finalRoundsToPlay: finalStageConfig.finalRoundsToPlay,
        finalMatchesToWin: finalStageConfig.finalMatchesToWin
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
        (cleanResult as any)[key] = value;
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

    // Update tournament (public - allows non-authenticated users with tournament key)
    await updateTournamentPublic(tournamentId, {
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
 * Helper function to check if a bracket is complete
 */
function isBracketComplete(bracket: any): boolean {
  if (!bracket) return true; // No bracket = considered complete

  const finalRound = bracket.rounds[bracket.rounds.length - 1];
  const finalMatch = finalRound?.matches[0];
  const isFinalComplete = finalMatch?.status === 'COMPLETED' || finalMatch?.status === 'WALKOVER';

  const thirdPlaceMatch = bracket.thirdPlaceMatch;
  const isThirdPlaceComplete = !thirdPlaceMatch ||
    thirdPlaceMatch.status === 'COMPLETED' ||
    thirdPlaceMatch.status === 'WALKOVER';

  return isFinalComplete && isThirdPlaceComplete;
}

/**
 * Advance winner to next match (Gold bracket)
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
    // Use algorithm to advance winner in gold bracket
    const updatedBracket = advanceWinnerAlgorithm(
      tournament.finalStage.bracket,
      matchId,
      winnerId
    );

    // Check if gold bracket is complete
    const isGoldComplete = isBracketComplete(updatedBracket);

    // For SPLIT_DIVISIONS, also check silver bracket
    const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';
    const silverBracket = tournament.finalStage.silverBracket;
    const isSilverComplete = !isSplitDivisions || isBracketComplete(silverBracket);

    // Tournament is complete only when both brackets are done (or single bracket if not split)
    const isTournamentComplete = isGoldComplete && isSilverComplete;

    // Get gold final match winner
    const goldFinalRound = updatedBracket.rounds[updatedBracket.rounds.length - 1];
    const goldFinalMatch = goldFinalRound.matches[0];
    const goldWinner = (goldFinalMatch.status === 'COMPLETED' || goldFinalMatch.status === 'WALKOVER')
      ? goldFinalMatch.winner
      : undefined;

    // Update tournament
    const updateData: any = {
      finalStage: {
        ...tournament.finalStage,
        bracket: updatedBracket,
        isComplete: isTournamentComplete,
        winner: goldWinner
      }
    };

    // If all matches are complete, mark entire tournament as COMPLETED
    if (isTournamentComplete) {
      updateData.status = 'COMPLETED';
      updateData.completedAt = Date.now();
      console.log('🏆 All brackets completed - marking tournament as COMPLETED');
    }

    // Check if tournament was already completed (to avoid double ranking application)
    const wasAlreadyCompleted = tournament.status === 'COMPLETED';

    const success = await updateTournamentPublic(tournamentId, updateData);

    // If tournament JUST completed (not already completed before), calculate positions and apply ranking updates
    if (success && isTournamentComplete && !wasAlreadyCompleted) {
      console.log('📊 Calculating final positions and ranking updates...');
      await calculateFinalPositions(tournamentId);
      await applyRankingUpdates(tournamentId);
    }

    return success;
  } catch (error) {
    console.error('❌ Error advancing winner:', error);
    return false;
  }
}

/**
 * Update silver bracket match result
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param result Match result data
 * @returns true if successful
 */
export async function updateSilverBracketMatch(
  tournamentId: string,
  matchId: string,
  result: Partial<BracketMatch>
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage || !tournament.finalStage.silverBracket) {
    console.error('Tournament or silver bracket not found');
    return false;
  }

  try {
    const silverBracket = tournament.finalStage.silverBracket;
    let matchUpdated = false;

    // Clean undefined values from result
    const cleanResult: Partial<BracketMatch> = {};
    Object.entries(result).forEach(([key, value]) => {
      if (value !== undefined) {
        (cleanResult as any)[key] = value;
      }
    });

    // Add completedAt if status is COMPLETED
    if (result.status === 'COMPLETED') {
      cleanResult.completedAt = Date.now();
    }

    // Find and update match (check 3rd place match first)
    if (silverBracket.thirdPlaceMatch?.id === matchId) {
      silverBracket.thirdPlaceMatch = {
        ...silverBracket.thirdPlaceMatch,
        ...cleanResult
      };
      matchUpdated = true;
    } else {
      // Search in rounds
      for (const round of silverBracket.rounds) {
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
      console.error('Match not found in silver bracket');
      return false;
    }

    // Update tournament (public - allows non-authenticated users with tournament key)
    await updateTournamentPublic(tournamentId, {
      finalStage: {
        ...tournament.finalStage,
        silverBracket
      }
    });

    return true;
  } catch (error) {
    console.error('❌ Error updating silver bracket match:', error);
    return false;
  }
}

/**
 * Advance winner to next match in silver bracket
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param winnerId Winner participant ID
 * @returns true if successful
 */
export async function advanceSilverWinner(
  tournamentId: string,
  matchId: string,
  winnerId: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage || !tournament.finalStage.silverBracket) {
    console.error('Tournament or silver bracket not found');
    return false;
  }

  try {
    // Use algorithm to advance winner in silver bracket
    const updatedSilverBracket = advanceWinnerAlgorithm(
      tournament.finalStage.silverBracket,
      matchId,
      winnerId
    );

    // Check if silver bracket is complete
    const isSilverComplete = isBracketComplete(updatedSilverBracket);

    // Also check gold bracket
    const isGoldComplete = isBracketComplete(tournament.finalStage.bracket);

    // Tournament is complete only when both brackets are done
    const isTournamentComplete = isGoldComplete && isSilverComplete;

    // Get silver final match winner
    const silverFinalRound = updatedSilverBracket.rounds[updatedSilverBracket.rounds.length - 1];
    const silverFinalMatch = silverFinalRound.matches[0];
    const silverWinner = (silverFinalMatch.status === 'COMPLETED' || silverFinalMatch.status === 'WALKOVER')
      ? silverFinalMatch.winner
      : undefined;

    // Update tournament
    const updateData: any = {
      finalStage: {
        ...tournament.finalStage,
        silverBracket: updatedSilverBracket,
        isComplete: isTournamentComplete,
        silverWinner: silverWinner
      }
    };

    // If all matches are complete, mark entire tournament as COMPLETED
    if (isTournamentComplete) {
      updateData.status = 'COMPLETED';
      updateData.completedAt = Date.now();
      console.log('🏆 All brackets completed - marking tournament as COMPLETED');
    }

    // Check if tournament was already completed (to avoid double ranking application)
    const wasAlreadyCompleted = tournament.status === 'COMPLETED';

    const success = await updateTournamentPublic(tournamentId, updateData);

    // If tournament JUST completed, calculate positions and apply ranking updates
    if (success && isTournamentComplete && !wasAlreadyCompleted) {
      console.log('📊 Calculating final positions and ranking updates...');
      await calculateFinalPositions(tournamentId);
      await applyRankingUpdates(tournamentId);
    }

    return success;
  } catch (error) {
    console.error('❌ Error advancing silver winner:', error);
    return false;
  }
}

/**
 * Mark participant as no-show in silver bracket (walkover)
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param participantId Participant who didn't show
 * @returns true if successful
 */
export async function markSilverBracketNoShow(
  tournamentId: string,
  matchId: string,
  participantId: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage || !tournament.finalStage.silverBracket) {
    console.error('Tournament or silver bracket not found');
    return false;
  }

  // Find match in silver bracket
  let match: BracketMatch | undefined;
  for (const round of tournament.finalStage.silverBracket.rounds) {
    match = round.matches.find(m => m.id === matchId);
    if (match) break;
  }

  // Also check 3rd place match
  if (!match && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
    match = tournament.finalStage.silverBracket.thirdPlaceMatch;
  }

  if (!match) {
    console.error('Match not found in silver bracket');
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
  await updateSilverBracketMatch(tournamentId, matchId, {
    status: 'WALKOVER',
    winner,
    gamesWonA: match.participantA === winner ? 2 : 0,
    gamesWonB: match.participantB === winner ? 2 : 0,
    noShowParticipant: participantId,
    walkedOverAt: Date.now()
  });

  // Advance winner
  return await advanceSilverWinner(tournamentId, matchId, winner);
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

  // Check if tournament was already completed (to avoid double ranking application)
  if (tournament.status === 'COMPLETED') {
    console.log('Tournament already completed - skipping ranking updates');
    return true;
  }

  // Check if gold bracket is complete
  const isGoldComplete = isBracketComplete(tournament.finalStage.bracket);
  if (!isGoldComplete) {
    console.error('Gold bracket is not complete');
    return false;
  }

  // For SPLIT_DIVISIONS, also check silver bracket
  const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';
  if (isSplitDivisions) {
    const isSilverComplete = isBracketComplete(tournament.finalStage.silverBracket);
    if (!isSilverComplete) {
      console.error('Silver bracket is not complete');
      return false;
    }
  }

  // Get gold bracket winner
  const goldFinalRound = tournament.finalStage.bracket.rounds[tournament.finalStage.bracket.rounds.length - 1];
  const goldFinalMatch = goldFinalRound.matches[0];
  const goldWinner = goldFinalMatch.winner;

  // Get silver bracket winner (if SPLIT_DIVISIONS)
  let silverWinner: string | undefined;
  if (isSplitDivisions && tournament.finalStage.silverBracket) {
    const silverFinalRound = tournament.finalStage.silverBracket.rounds[tournament.finalStage.silverBracket.rounds.length - 1];
    const silverFinalMatch = silverFinalRound.matches[0];
    silverWinner = silverFinalMatch.winner;
  }

  // Mark final stage as complete and update tournament status
  const success = await updateTournamentPublic(tournamentId, {
    status: 'COMPLETED',
    completedAt: Date.now(),
    finalStage: {
      ...tournament.finalStage,
      isComplete: true,
      winner: goldWinner,
      silverWinner: silverWinner
    }
  });

  // Calculate positions and apply ELO updates
  if (success) {
    console.log('📊 Calculating final positions and ranking updates...');
    await calculateFinalPositions(tournamentId);
    await applyRankingUpdates(tournamentId);
  }

  return success;
}
