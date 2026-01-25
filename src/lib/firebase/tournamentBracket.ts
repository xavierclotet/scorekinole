/**
 * Tournament bracket (final stage) management
 * Single elimination bracket operations
 */

import { getTournament, updateTournament, updateTournamentPublic } from './tournaments';
import { generateBracket as generateBracketAlgorithm, advanceWinner as advanceWinnerAlgorithm } from '$lib/algorithms/bracket';
import { calculateFinalPositionsForTournament } from './tournamentRanking';
import type { Bracket, BracketMatch, BracketWithConfig, BracketConfig, PhaseConfig } from '$lib/types/tournament';

/**
 * Get all playable matches from a bracket (PENDING with both participants, no BYE)
 */
function getPlayableMatches(bracket: Bracket): BracketMatch[] {
  const matches: BracketMatch[] = [];

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (
        match.status === 'PENDING' &&
        match.participantA &&
        match.participantB &&
        match.participantA !== 'BYE' &&
        match.participantB !== 'BYE' &&
        !match.tableNumber
      ) {
        matches.push(match);
      }
    }
  }

  // Also check third place match
  if (bracket.thirdPlaceMatch &&
      bracket.thirdPlaceMatch.status === 'PENDING' &&
      bracket.thirdPlaceMatch.participantA &&
      bracket.thirdPlaceMatch.participantB &&
      !bracket.thirdPlaceMatch.tableNumber) {
    matches.push(bracket.thirdPlaceMatch);
  }

  return matches;
}

/**
 * Get tables currently in use (assigned to PENDING or IN_PROGRESS matches)
 */
function getUsedTables(bracket: Bracket): Set<number> {
  const used = new Set<number>();

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if ((match.status === 'PENDING' || match.status === 'IN_PROGRESS') && match.tableNumber) {
        used.add(match.tableNumber);
      }
    }
  }

  if (bracket.thirdPlaceMatch &&
      (bracket.thirdPlaceMatch.status === 'PENDING' || bracket.thirdPlaceMatch.status === 'IN_PROGRESS') &&
      bracket.thirdPlaceMatch.tableNumber) {
    used.add(bracket.thirdPlaceMatch.tableNumber);
  }

  return used;
}

/**
 * Get available tables (not currently in use)
 */
function getAvailableTables(usedTables: Set<number>, numTables: number): number[] {
  const available: number[] = [];
  for (let i = 1; i <= numTables; i++) {
    if (!usedTables.has(i)) {
      available.push(i);
    }
  }
  return available;
}

/**
 * Assign tables to playable matches in brackets, respecting the table limit
 * If there are 2 brackets, tables are split between them (half each)
 *
 * @param goldBracket Gold bracket (or main bracket if no split)
 * @param silverBracket Silver bracket (optional)
 * @param numTables Maximum number of tables available
 */
function assignTablesToBrackets(
  goldBracket: Bracket,
  silverBracket: Bracket | null,
  numTables: number
): void {
  // Get tables currently used by both brackets
  const usedByGold = getUsedTables(goldBracket);
  const usedBySilver = silverBracket ? getUsedTables(silverBracket) : new Set<number>();
  const allUsed = new Set([...usedByGold, ...usedBySilver]);

  // Get available tables
  const availableTables = getAvailableTables(allUsed, numTables);

  if (availableTables.length === 0) {
    return; // No tables available
  }

  // Get playable matches from both brackets
  const goldPlayable = getPlayableMatches(goldBracket);
  const silverPlayable = silverBracket ? getPlayableMatches(silverBracket) : [];

  console.log('🎯 assignTablesToBrackets:', {
    numTables,
    availableTables,
    goldPlayableCount: goldPlayable.length,
    silverPlayableCount: silverPlayable.length
  });

  if (silverBracket) {
    // Calculate how many tables each bracket actually needs
    const goldNeeds = goldPlayable.length;
    const silverNeeds = silverPlayable.length;
    const totalNeeds = goldNeeds + silverNeeds;

    console.log('🎯 Table needs:', { goldNeeds, silverNeeds, totalNeeds, availableTables: availableTables.length });

    let tableIndex = 0;

    if (totalNeeds <= availableTables.length) {
      // Enough tables for everyone - assign all needed
      for (let i = 0; i < goldNeeds; i++) {
        goldPlayable[i].tableNumber = availableTables[tableIndex++];
      }
      for (let i = 0; i < silverNeeds; i++) {
        silverPlayable[i].tableNumber = availableTables[tableIndex++];
      }
      console.log('🎯 All matches got tables:', { goldAssigned: goldNeeds, silverAssigned: silverNeeds });
    } else {
      // Not enough tables - split proportionally (prioritize gold slightly)
      const tablesForGold = Math.ceil(availableTables.length / 2);
      const tablesForSilver = availableTables.length - tablesForGold;

      for (let i = 0; i < Math.min(tablesForGold, goldNeeds); i++) {
        goldPlayable[i].tableNumber = availableTables[tableIndex++];
      }
      for (let i = 0; i < Math.min(tablesForSilver, silverNeeds); i++) {
        silverPlayable[i].tableNumber = availableTables[tableIndex++];
      }
      console.log('🎯 Split tables (not enough):', { tablesForGold, tablesForSilver });
    }
  } else {
    // Single bracket: all tables go to gold
    for (let i = 0; i < Math.min(availableTables.length, goldPlayable.length); i++) {
      goldPlayable[i].tableNumber = availableTables[i];
    }
  }
}


/**
 * Reassign tables for all pending matches in the bracket(s)
 * Also optionally updates the number of tables available
 *
 * @param tournamentId Tournament ID
 * @param newNumTables Optional new number of tables (if changing)
 * @returns Object with success status and info about changes made
 */
export async function reassignTables(
  tournamentId: string,
  newNumTables?: number
): Promise<{ success: boolean; error?: string; tablesAssigned?: number }> {
  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament) {
      return { success: false, error: 'Tournament not found' };
    }

    if (!tournament.finalStage || !tournament.finalStage.goldBracket) {
      return { success: false, error: 'No bracket found' };
    }

    // Update numTables if provided
    const numTables = newNumTables ?? tournament.numTables ?? 4;

    // Clone brackets to modify
    const goldBracket = JSON.parse(JSON.stringify(tournament.finalStage.goldBracket)) as Bracket;
    const silverBracket = tournament.finalStage.silverBracket
      ? JSON.parse(JSON.stringify(tournament.finalStage.silverBracket)) as Bracket
      : null;

    // Clear existing table assignments for PENDING matches only
    const clearPendingTables = (bracket: Bracket) => {
      for (const round of bracket.rounds) {
        for (const match of round.matches) {
          if (match.status === 'PENDING') {
            match.tableNumber = undefined;
          }
        }
      }
      if (bracket.thirdPlaceMatch?.status === 'PENDING') {
        bracket.thirdPlaceMatch.tableNumber = undefined;
      }
    };

    clearPendingTables(goldBracket);
    if (silverBracket) {
      clearPendingTables(silverBracket);
    }

    // Reassign tables
    assignTablesToBrackets(goldBracket, silverBracket, numTables);

    // Count how many tables were assigned
    let tablesAssigned = 0;
    const countAssigned = (bracket: Bracket) => {
      for (const round of bracket.rounds) {
        for (const match of round.matches) {
          if (match.status === 'PENDING' && match.tableNumber) {
            tablesAssigned++;
          }
        }
      }
      if (bracket.thirdPlaceMatch?.status === 'PENDING' && bracket.thirdPlaceMatch.tableNumber) {
        tablesAssigned++;
      }
    };

    countAssigned(goldBracket);
    if (silverBracket) {
      countAssigned(silverBracket);
    }

    // Update tournament
    const updateData: any = {
      numTables,
      finalStage: {
        ...tournament.finalStage,
        goldBracket
      }
    };

    if (silverBracket) {
      updateData.finalStage.silverBracket = silverBracket;
    }

    await updateTournament(tournamentId, updateData);

    console.log('✅ Tables reassigned:', { numTables, tablesAssigned });
    return { success: true, tablesAssigned };
  } catch (error) {
    console.error('Error reassigning tables:', error);
    return { success: false, error: String(error) };
  }
}


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
    goldConfig: BracketConfig;
    silverConfig: BracketConfig;
  }
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  try {
    const { goldParticipantIds, silverParticipantIds, goldConfig, silverConfig } = options;

    // Note: Power of 2 validation removed - brackets now support BYEs for any participant count >= 2

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

    // Generate both brackets using algorithm
    const goldBracketRaw = generateBracketAlgorithm(goldParticipants);
    const silverBracketRaw = generateBracketAlgorithm(silverParticipants);

    // Assign table numbers to brackets respecting the table limit
    // Tables are distributed fairly between gold and silver brackets
    const numTables = tournament.numTables || 4;
    assignTablesToBrackets(goldBracketRaw, silverBracketRaw, numTables);

    console.log('🥇 Generated Gold bracket with', goldParticipants.length, 'participants');
    console.log('🥈 Generated Silver bracket with', silverParticipants.length, 'participants');

    // Create BracketWithConfig objects
    const goldBracketWithConfig: BracketWithConfig = {
      rounds: goldBracketRaw.rounds,
      totalRounds: goldBracketRaw.totalRounds,
      thirdPlaceMatch: goldBracketRaw.thirdPlaceMatch,
      config: goldConfig
    };

    const silverBracketWithConfig: BracketWithConfig = {
      rounds: silverBracketRaw.rounds,
      totalRounds: silverBracketRaw.totalRounds,
      thirdPlaceMatch: silverBracketRaw.thirdPlaceMatch,
      config: silverConfig
    };

    // Update tournament with both brackets (config embedded in each bracket)
    return await updateTournament(tournamentId, {
      finalStage: {
        mode: 'SPLIT_DIVISIONS',
        goldBracket: goldBracketWithConfig,
        silverBracket: silverBracketWithConfig,
        isComplete: false
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
 * @param config Optional bracket configuration (per-phase settings)
 * @returns true if successful
 */
export async function generateBracket(
  tournamentId: string,
  config?: BracketConfig
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

      // Note: Power of 2 validation removed - brackets now support BYEs for any participant count >= 2
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

    // Generate bracket using algorithm
    const bracketRaw = generateBracketAlgorithm(qualifiedParticipants);

    // Assign table numbers respecting the table limit
    const numTables = tournament.numTables || 4;
    assignTablesToBrackets(bracketRaw, null, numTables);

    // Default config: points mode (7 points), best of 1 for all phases
    const defaultPhaseConfig: PhaseConfig = {
      gameMode: 'points',
      pointsToWin: 7,
      matchesToWin: 1
    };

    const bracketConfig: BracketConfig = config || {
      earlyRounds: { ...defaultPhaseConfig },
      semifinal: { ...defaultPhaseConfig },
      final: { ...defaultPhaseConfig }
    };

    // Create BracketWithConfig object
    const goldBracketWithConfig: BracketWithConfig = {
      rounds: bracketRaw.rounds,
      totalRounds: bracketRaw.totalRounds,
      thirdPlaceMatch: bracketRaw.thirdPlaceMatch,
      config: bracketConfig
    };

    return await updateTournament(tournamentId, {
      finalStage: {
        mode: 'SINGLE_BRACKET',
        goldBracket: goldBracketWithConfig,
        isComplete: false
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
  if (!tournament || !tournament.finalStage || !tournament.finalStage.goldBracket) {
    console.error('Tournament or gold bracket not found');
    return false;
  }

  try {
    const goldBracket = tournament.finalStage.goldBracket;
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
    if (goldBracket.thirdPlaceMatch?.id === matchId) {
      goldBracket.thirdPlaceMatch = {
        ...goldBracket.thirdPlaceMatch,
        ...cleanResult
      };
      matchUpdated = true;
    } else {
      // Search in rounds
      for (const round of goldBracket.rounds) {
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
        goldBracket
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

  console.log('📋 isBracketComplete check:', {
    finalMatchStatus: finalMatch?.status,
    isFinalComplete,
    hasThirdPlace: !!thirdPlaceMatch,
    thirdPlaceStatus: thirdPlaceMatch?.status,
    isThirdPlaceComplete,
    result: isFinalComplete && isThirdPlaceComplete
  });

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
  if (!tournament || !tournament.finalStage || !tournament.finalStage.goldBracket) {
    console.error('Tournament or gold bracket not found');
    return false;
  }

  try {
    // Use algorithm to advance winner in gold bracket
    const updatedBracketRaw = advanceWinnerAlgorithm(
      tournament.finalStage.goldBracket,
      matchId,
      winnerId
    );

    // Preserve config in updated bracket
    const updatedGoldBracket: BracketWithConfig = {
      ...updatedBracketRaw,
      config: tournament.finalStage.goldBracket.config
    };

    // Assign tables to any newly ready matches
    // Tables freed from completed matches become available for new matches
    const numTables = tournament.numTables || 4;
    const silverBracketForTables = tournament.finalStage.silverBracket || null;
    assignTablesToBrackets(updatedGoldBracket, silverBracketForTables, numTables);

    // Check if gold bracket is complete
    const isGoldComplete = isBracketComplete(updatedGoldBracket);

    // For SPLIT_DIVISIONS, also check silver bracket
    const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';
    const silverBracket = tournament.finalStage.silverBracket;
    const isSilverComplete = !isSplitDivisions || isBracketComplete(silverBracket);

    // Tournament is complete only when both brackets are done (or single bracket if not split)
    const isTournamentComplete = isGoldComplete && isSilverComplete;

    // Get gold final match winner
    const goldFinalRound = updatedGoldBracket.rounds[updatedGoldBracket.rounds.length - 1];
    const goldFinalMatch = goldFinalRound.matches[0];
    const goldWinner = (goldFinalMatch.status === 'COMPLETED' || goldFinalMatch.status === 'WALKOVER')
      ? goldFinalMatch.winner
      : undefined;

    // Update tournament
    const updateData: any = {
      finalStage: {
        ...tournament.finalStage,
        goldBracket: updatedGoldBracket,
        isComplete: isTournamentComplete,
        winner: goldWinner
      }
    };

    // Check if tournament was already completed (to avoid double ranking application)
    const wasAlreadyCompleted = tournament.status === 'COMPLETED';

    // If all matches are complete, mark entire tournament as COMPLETED
    // Calculate final positions BEFORE marking as COMPLETED so Cloud Function has the data
    if (isTournamentComplete && !wasAlreadyCompleted) {
      updateData.status = 'COMPLETED';
      updateData.completedAt = Date.now();
      console.log('🏆 All brackets completed - marking tournament as COMPLETED');

      // Calculate final positions and include in the same update
      console.log('📊 Calculating final positions...');
      const tournamentWithUpdatedBracket = {
        ...tournament,
        finalStage: { ...tournament.finalStage, goldBracket: updatedGoldBracket, isComplete: true }
      };
      updateData.participants = calculateFinalPositionsForTournament(tournamentWithUpdatedBracket);
      console.log('📊 Final positions calculated and included in update.');
    } else if (!isTournamentComplete) {
      console.log('📋 Bracket status: goldComplete=' + isGoldComplete + ', silverComplete=' + isSilverComplete + ', isSplitDivisions=' + isSplitDivisions);
    }

    console.log('📋 wasAlreadyCompleted=' + wasAlreadyCompleted + ', isTournamentComplete=' + isTournamentComplete);

    return await updateTournamentPublic(tournamentId, updateData);
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
  if (!tournament || !tournament.finalStage || !tournament.finalStage.silverBracket || !tournament.finalStage.goldBracket) {
    console.error('Tournament or brackets not found');
    return false;
  }

  try {
    // Use algorithm to advance winner in silver bracket
    const updatedSilverBracketRaw = advanceWinnerAlgorithm(
      tournament.finalStage.silverBracket,
      matchId,
      winnerId
    );

    // Preserve config in updated bracket
    const updatedSilverBracket: BracketWithConfig = {
      ...updatedSilverBracketRaw,
      config: tournament.finalStage.silverBracket.config
    };

    // Assign tables to any newly ready matches
    // Find the highest table number currently in use across both brackets
    // Assign tables to any newly ready matches
    // Tables freed from completed matches become available for new matches
    const numTables = tournament.numTables || 4;
    assignTablesToBrackets(tournament.finalStage.goldBracket, updatedSilverBracket, numTables);

    // Check if silver bracket is complete
    const isSilverComplete = isBracketComplete(updatedSilverBracket);

    // Also check gold bracket
    const isGoldComplete = isBracketComplete(tournament.finalStage.goldBracket);

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

    // Check if tournament was already completed (to avoid double ranking application)
    const wasAlreadyCompleted = tournament.status === 'COMPLETED';

    // If all matches are complete, mark entire tournament as COMPLETED
    // Calculate final positions BEFORE marking as COMPLETED so Cloud Function has the data
    if (isTournamentComplete && !wasAlreadyCompleted) {
      updateData.status = 'COMPLETED';
      updateData.completedAt = Date.now();
      console.log('🏆 All brackets completed - marking tournament as COMPLETED');

      // Calculate final positions and include in the same update
      console.log('📊 Calculating final positions...');
      const tournamentWithUpdatedBracket = {
        ...tournament,
        finalStage: { ...tournament.finalStage, silverBracket: updatedSilverBracket, isComplete: true }
      };
      updateData.participants = calculateFinalPositionsForTournament(tournamentWithUpdatedBracket);
      console.log('📊 Final positions calculated and included in update.');
    }

    return await updateTournamentPublic(tournamentId, updateData);
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
  if (!tournament || !tournament.finalStage || !tournament.finalStage.goldBracket) {
    console.error('Tournament or gold bracket not found');
    return false;
  }

  // Find match
  let match: BracketMatch | undefined;
  for (const round of tournament.finalStage.goldBracket.rounds) {
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
  if (!tournament || !tournament.finalStage || !tournament.finalStage.goldBracket) {
    console.error('Tournament or gold bracket not found');
    return false;
  }

  // Check if tournament was already completed (to avoid double ranking application)
  if (tournament.status === 'COMPLETED') {
    console.log('Tournament already completed - skipping ranking updates');
    return true;
  }

  // Check if gold bracket is complete
  const isGoldComplete = isBracketComplete(tournament.finalStage.goldBracket);
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
  const goldFinalRound = tournament.finalStage.goldBracket.rounds[tournament.finalStage.goldBracket.rounds.length - 1];
  const goldFinalMatch = goldFinalRound.matches[0];
  const goldWinner = goldFinalMatch.winner;

  // Get silver bracket winner (if SPLIT_DIVISIONS)
  let silverWinner: string | undefined;
  if (isSplitDivisions && tournament.finalStage.silverBracket) {
    const silverFinalRound = tournament.finalStage.silverBracket.rounds[tournament.finalStage.silverBracket.rounds.length - 1];
    const silverFinalMatch = silverFinalRound.matches[0];
    silverWinner = silverFinalMatch.winner;
  }

  // Calculate final positions BEFORE marking as COMPLETED so Cloud Function has the data
  console.log('📊 Calculating final positions...');
  const tournamentWithComplete = {
    ...tournament,
    finalStage: { ...tournament.finalStage, isComplete: true }
  };
  const updatedParticipants = calculateFinalPositionsForTournament(tournamentWithComplete);
  console.log('📊 Final positions calculated and included in update.');

  // Mark final stage as complete and update tournament status with positions
  return await updateTournamentPublic(tournamentId, {
    status: 'COMPLETED',
    completedAt: Date.now(),
    participants: updatedParticipants,
    finalStage: {
      ...tournament.finalStage,
      isComplete: true,
      winner: goldWinner,
      silverWinner: silverWinner
    }
  });
}
