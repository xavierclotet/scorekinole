/**
 * Tournament bracket (final stage) management
 * Single elimination bracket operations
 */

import { getTournament, updateTournament, updateTournamentPublic } from './tournaments';
import {
  generateBracket as generateBracketAlgorithm,
  advanceWinner as advanceWinnerAlgorithm,
  generateConsolationBracket,
  generateConsolationBracketStructure,
  replaceLoserPlaceholder,
  advanceConsolationWinner as advanceConsolationWinnerAlgorithm,
  getAvailableConsolationSources,
  nextPowerOfTwo,
  isBye
} from '$lib/algorithms/bracket';
import { calculateFinalPositionsForTournament, applyRankingUpdates } from './tournamentRanking';
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

  // Also check consolation brackets
  if ((bracket as BracketWithConfig).consolationBrackets) {
    for (const consolation of (bracket as BracketWithConfig).consolationBrackets!) {
      for (const round of consolation.rounds) {
        for (const match of round.matches) {
          if ((match.status === 'PENDING' || match.status === 'IN_PROGRESS') && match.tableNumber) {
            used.add(match.tableNumber);
          }
        }
      }
    }
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
 * Get playable matches from consolation brackets
 */
function getPlayableConsolationMatches(bracket: BracketWithConfig): BracketMatch[] {
  const matches: BracketMatch[] = [];

  if (!bracket.consolationBrackets) return matches;

  for (const consolation of bracket.consolationBrackets) {
    for (const round of consolation.rounds) {
      for (const match of round.matches) {
        if (
          match.status === 'PENDING' &&
          match.participantA &&
          match.participantB &&
          match.participantA !== 'BYE' &&
          match.participantB !== 'BYE' &&
          !match.participantA.startsWith('LOSER:') &&
          !match.participantB.startsWith('LOSER:') &&
          !match.tableNumber
        ) {
          matches.push(match);
        }
      }
    }
  }

  return matches;
}

/**
 * Assign tables to playable consolation matches
 */
function assignTablesToConsolation(
  goldBracket: BracketWithConfig,
  silverBracket: BracketWithConfig | null,
  numTables: number
): void {
  // Get tables currently used by main brackets and existing consolation
  const usedByGold = getUsedTables(goldBracket);
  const usedBySilver = silverBracket ? getUsedTables(silverBracket) : new Set<number>();
  const allUsed = new Set([...usedByGold, ...usedBySilver]);

  // Get available tables
  const availableTables = getAvailableTables(allUsed, numTables);

  if (availableTables.length === 0) {
    console.log('🎯 No tables available for consolation');
    return;
  }

  // Get playable consolation matches
  const goldConsolationPlayable = getPlayableConsolationMatches(goldBracket);
  const silverConsolationPlayable = silverBracket ? getPlayableConsolationMatches(silverBracket) : [];

  console.log('🎯 assignTablesToConsolation:', {
    numTables,
    availableTables,
    goldConsolationCount: goldConsolationPlayable.length,
    silverConsolationCount: silverConsolationPlayable.length
  });

  let tableIndex = 0;
  const totalNeeds = goldConsolationPlayable.length + silverConsolationPlayable.length;

  if (totalNeeds <= availableTables.length) {
    // Enough tables - assign all
    for (const match of goldConsolationPlayable) {
      match.tableNumber = availableTables[tableIndex++];
    }
    for (const match of silverConsolationPlayable) {
      match.tableNumber = availableTables[tableIndex++];
    }
    console.log('🎯 All consolation matches got tables');
  } else {
    // Not enough - prioritize gold
    const tablesForGold = Math.ceil(availableTables.length / 2);
    for (let i = 0; i < Math.min(tablesForGold, goldConsolationPlayable.length); i++) {
      goldConsolationPlayable[i].tableNumber = availableTables[tableIndex++];
    }
    for (let i = 0; i < Math.min(availableTables.length - tablesForGold, silverConsolationPlayable.length); i++) {
      silverConsolationPlayable[i].tableNumber = availableTables[tableIndex++];
    }
    console.log('🎯 Split consolation tables (not enough)');
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

    // Check if consolation is enabled
    const consolationEnabled = Boolean(
      tournament.finalStage?.consolationEnabled ??
      (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
    );

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
      // Also clear consolation brackets (only if consolation enabled)
      if (consolationEnabled && (bracket as BracketWithConfig).consolationBrackets) {
        for (const consolation of (bracket as BracketWithConfig).consolationBrackets!) {
          for (const round of consolation.rounds) {
            for (const match of round.matches) {
              if (match.status === 'PENDING') {
                match.tableNumber = undefined;
              }
            }
          }
        }
      }
    };

    clearPendingTables(goldBracket);
    if (silverBracket) {
      clearPendingTables(silverBracket);
    }

    // Reassign tables for main brackets
    assignTablesToBrackets(goldBracket, silverBracket, numTables);

    // Reassign tables for consolation brackets (only if consolation enabled)
    if (consolationEnabled) {
      assignTablesToConsolation(
        goldBracket as BracketWithConfig,
        silverBracket as BracketWithConfig | null,
        numTables
      );
    }

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
      // Also count consolation brackets (only if consolation enabled)
      if (consolationEnabled && (bracket as BracketWithConfig).consolationBrackets) {
        for (const consolation of (bracket as BracketWithConfig).consolationBrackets!) {
          for (const round of consolation.rounds) {
            for (const match of round.matches) {
              if (match.status === 'PENDING' && match.tableNumber) {
                tablesAssigned++;
              }
            }
          }
        }
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
    consolationEnabled?: boolean;
  }
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  try {
    const { goldParticipantIds, silverParticipantIds, goldConfig, silverConfig, consolationEnabled } = options;

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

    // Generate consolation brackets with placeholders if enabled
    if (consolationEnabled) {
      const goldBracketSize = nextPowerOfTwo(goldParticipants.length);
      const silverBracketSize = nextPowerOfTwo(silverParticipants.length);
      const goldAvailable = getAvailableConsolationSources(goldBracketSize);
      const silverAvailable = getAvailableConsolationSources(silverBracketSize);

      goldBracketWithConfig.consolationBrackets = [];
      silverBracketWithConfig.consolationBrackets = [];

      // Use raw brackets to calculate BYE positions (cast is safe as we only use rounds/totalRounds)
      const tempGoldBracket = goldBracketRaw as unknown as BracketWithConfig;
      const tempSilverBracket = silverBracketRaw as unknown as BracketWithConfig;

      // Gold bracket consolation
      if (goldAvailable.hasR16) {
        const r16ByePositions = getByePositionsInRound(tempGoldBracket, 'R16');
        console.log(`🎯 R16 BYE positions for Gold bracket: [${r16ByePositions.join(', ') || 'none'}]`);
        goldBracketWithConfig.consolationBrackets.push(generateConsolationBracketStructure(goldBracketSize, 'R16', r16ByePositions));
        console.log('🎯 Generated R16 consolation structure for Gold bracket');
      }
      if (goldAvailable.hasQF) {
        const qfByePositions = getByePositionsInRound(tempGoldBracket, 'QF');
        console.log(`🎯 QF BYE positions for Gold bracket: [${qfByePositions.join(', ') || 'none'}]`);
        goldBracketWithConfig.consolationBrackets.push(generateConsolationBracketStructure(goldBracketSize, 'QF', qfByePositions));
        console.log('🎯 Generated QF consolation structure for Gold bracket');
      }

      // Silver bracket consolation
      if (silverAvailable.hasR16) {
        const r16ByePositions = getByePositionsInRound(tempSilverBracket, 'R16');
        console.log(`🎯 R16 BYE positions for Silver bracket: [${r16ByePositions.join(', ') || 'none'}]`);
        silverBracketWithConfig.consolationBrackets.push(generateConsolationBracketStructure(silverBracketSize, 'R16', r16ByePositions));
        console.log('🎯 Generated R16 consolation structure for Silver bracket');
      }
      if (silverAvailable.hasQF) {
        const qfByePositions = getByePositionsInRound(tempSilverBracket, 'QF');
        console.log(`🎯 QF BYE positions for Silver bracket: [${qfByePositions.join(', ') || 'none'}]`);
        silverBracketWithConfig.consolationBrackets.push(generateConsolationBracketStructure(silverBracketSize, 'QF', qfByePositions));
        console.log('🎯 Generated QF consolation structure for Silver bracket');
      }
    }

    // Update tournament with both brackets (config embedded in each bracket)
    // Use spread to preserve any existing finalStage fields from tournament creation
    return await updateTournament(tournamentId, {
      finalStage: {
        ...tournament.finalStage,
        mode: 'SPLIT_DIVISIONS',
        consolationEnabled: consolationEnabled ?? tournament.finalStage?.consolationEnabled ?? false,
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
 * @param consolationEnabled Optional flag to generate consolation brackets
 * @returns true if successful
 */
export async function generateBracket(
  tournamentId: string,
  config?: BracketConfig,
  consolationEnabled?: boolean
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

    // Generate consolation brackets with placeholders if enabled
    if (consolationEnabled) {
      const bracketSize = nextPowerOfTwo(qualifiedParticipants.length);
      const available = getAvailableConsolationSources(bracketSize);

      goldBracketWithConfig.consolationBrackets = [];

      // Use bracketRaw to calculate BYE positions (cast is safe as we only use rounds/totalRounds)
      const tempBracket = bracketRaw as unknown as BracketWithConfig;

      if (available.hasR16) {
        const r16ByePositions = getByePositionsInRound(tempBracket, 'R16');
        console.log(`🎯 R16 BYE positions for SINGLE_BRACKET: [${r16ByePositions.join(', ') || 'none'}]`);
        goldBracketWithConfig.consolationBrackets.push(generateConsolationBracketStructure(bracketSize, 'R16', r16ByePositions));
        console.log('🎯 Generated R16 consolation structure for SINGLE_BRACKET');
      }
      if (available.hasQF) {
        const qfByePositions = getByePositionsInRound(tempBracket, 'QF');
        console.log(`🎯 QF BYE positions for SINGLE_BRACKET: [${qfByePositions.join(', ') || 'none'}]`);
        goldBracketWithConfig.consolationBrackets.push(generateConsolationBracketStructure(bracketSize, 'QF', qfByePositions));
        console.log('🎯 Generated QF consolation structure for SINGLE_BRACKET');
      }
    }

    // Use spread to preserve any existing finalStage fields from tournament creation
    return await updateTournament(tournamentId, {
      finalStage: {
        ...tournament.finalStage,
        mode: 'SINGLE_BRACKET',
        consolationEnabled: consolationEnabled ?? tournament.finalStage?.consolationEnabled ?? false,
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

  // Check consolationEnabled
  const consolationEnabled = Boolean(
    tournament.finalStage.consolationEnabled ??
    (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
  );

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

    // Add completedAt and clear tableNumber if status is COMPLETED (release the table)
    if (result.status === 'COMPLETED') {
      cleanResult.completedAt = Date.now();
      cleanResult.tableNumber = undefined; // Release table for other matches
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

    // Search in consolation brackets if not found (only if consolationEnabled)
    if (!matchUpdated && consolationEnabled && goldBracket.consolationBrackets) {
      for (const consolation of goldBracket.consolationBrackets) {
        for (const round of consolation.rounds) {
          const matchIndex = round.matches.findIndex((m: any) => m.id === matchId);
          if (matchIndex !== -1) {
            round.matches[matchIndex] = {
              ...round.matches[matchIndex],
              ...cleanResult
            };
            matchUpdated = true;
            break;
          }
        }
        if (matchUpdated) break;
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

    // Preserve config and consolation brackets in updated bracket
    let updatedGoldBracket: BracketWithConfig = {
      ...updatedBracketRaw,
      config: tournament.finalStage.goldBracket.config,
      consolationBrackets: tournament.finalStage.goldBracket.consolationBrackets
    };

    // Check and generate consolation brackets if needed
    // Fallback for consolationEnabled - check multiple locations due to migration
    const consolationEnabled = Boolean(
      tournament.finalStage.consolationEnabled
      ?? (tournament.finalStage as unknown as Record<string, unknown>)['consolationEnabled ']  // Typo with trailing space
    );
    updatedGoldBracket = await checkAndGenerateConsolation(tournamentId, updatedGoldBracket, 'gold', consolationEnabled);

    // Assign tables to any newly ready matches
    // Tables freed from completed matches become available for new matches
    const numTables = tournament.numTables || 4;
    const silverBracketForTables = tournament.finalStage.silverBracket || null;
    assignTablesToBrackets(updatedGoldBracket, silverBracketForTables, numTables);

    // Also assign tables to consolation matches if consolationEnabled
    if (consolationEnabled) {
      assignTablesToConsolation(updatedGoldBracket, silverBracketForTables as BracketWithConfig | null, numTables);
    }

    // Check if gold bracket is complete (including consolation)
    const isGoldMainComplete = isBracketComplete(updatedGoldBracket);
    const isGoldConsolationComplete = areConsolationBracketsComplete(updatedGoldBracket, consolationEnabled);
    const isGoldComplete = isGoldMainComplete && isGoldConsolationComplete;

    // For SPLIT_DIVISIONS, also check silver bracket
    const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';
    const silverBracket = tournament.finalStage.silverBracket;
    const isSilverMainComplete = !isSplitDivisions || isBracketComplete(silverBracket);
    const isSilverConsolationComplete = !isSplitDivisions || areConsolationBracketsComplete(silverBracket, consolationEnabled);
    const isSilverComplete = isSilverMainComplete && isSilverConsolationComplete;

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

  // Check consolationEnabled
  const consolationEnabled = Boolean(
    tournament.finalStage.consolationEnabled ??
    (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
  );

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

    // Add completedAt and clear tableNumber if status is COMPLETED (release the table)
    if (result.status === 'COMPLETED') {
      cleanResult.completedAt = Date.now();
      cleanResult.tableNumber = undefined; // Release table for other matches
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

    // Search in consolation brackets if not found (only if consolationEnabled)
    if (!matchUpdated && consolationEnabled && silverBracket.consolationBrackets) {
      for (const consolation of silverBracket.consolationBrackets) {
        for (const round of consolation.rounds) {
          const matchIndex = round.matches.findIndex((m: any) => m.id === matchId);
          if (matchIndex !== -1) {
            round.matches[matchIndex] = {
              ...round.matches[matchIndex],
              ...cleanResult
            };
            matchUpdated = true;
            break;
          }
        }
        if (matchUpdated) break;
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

    // Preserve config and consolation brackets in updated bracket
    let updatedSilverBracket: BracketWithConfig = {
      ...updatedSilverBracketRaw,
      config: tournament.finalStage.silverBracket.config,
      consolationBrackets: tournament.finalStage.silverBracket.consolationBrackets
    };

    // Check and generate consolation brackets if needed
    // Fallback for consolationEnabled - check multiple locations due to migration
    const consolationEnabled = Boolean(
      tournament.finalStage.consolationEnabled
      ?? (tournament.finalStage as unknown as Record<string, unknown>)['consolationEnabled ']  // Typo with trailing space
    );
    updatedSilverBracket = await checkAndGenerateConsolation(tournamentId, updatedSilverBracket, 'silver', consolationEnabled);

    // Assign tables to any newly ready matches
    // Tables freed from completed matches become available for new matches
    const numTables = tournament.numTables || 4;
    assignTablesToBrackets(tournament.finalStage.goldBracket, updatedSilverBracket, numTables);

    // Also assign tables to consolation matches if consolationEnabled
    if (consolationEnabled) {
      assignTablesToConsolation(
        tournament.finalStage.goldBracket as BracketWithConfig,
        updatedSilverBracket,
        numTables
      );
    }

    // Check if silver bracket is complete (including consolation)
    const isSilverMainComplete = isBracketComplete(updatedSilverBracket);
    const isSilverConsolationComplete = areConsolationBracketsComplete(updatedSilverBracket, consolationEnabled);
    const isSilverComplete = isSilverMainComplete && isSilverConsolationComplete;

    // Also check gold bracket (including consolation)
    const isGoldMainComplete = isBracketComplete(tournament.finalStage.goldBracket);
    const isGoldConsolationComplete = areConsolationBracketsComplete(tournament.finalStage.goldBracket, consolationEnabled);
    const isGoldComplete = isGoldMainComplete && isGoldConsolationComplete;

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

  const consolationEnabled = tournament.finalStage.consolationEnabled ?? false;
  const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';

  // Check if gold bracket is complete (main + consolation)
  const isGoldMainComplete = isBracketComplete(tournament.finalStage.goldBracket);
  const isGoldConsolationComplete = areConsolationBracketsComplete(tournament.finalStage.goldBracket, consolationEnabled);
  const isGoldComplete = isGoldMainComplete && isGoldConsolationComplete;

  if (!isGoldComplete) {
    console.error('Gold bracket is not complete (main:', isGoldMainComplete, ', consolation:', isGoldConsolationComplete, ')');
    return false;
  }

  // For SPLIT_DIVISIONS, also check silver bracket (main + consolation)
  if (isSplitDivisions) {
    const isSilverMainComplete = isBracketComplete(tournament.finalStage.silverBracket);
    const isSilverConsolationComplete = areConsolationBracketsComplete(tournament.finalStage.silverBracket, consolationEnabled);
    const isSilverComplete = isSilverMainComplete && isSilverConsolationComplete;

    if (!isSilverComplete) {
      console.error('Silver bracket is not complete (main:', isSilverMainComplete, ', consolation:', isSilverConsolationComplete, ')');
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
  const success = await updateTournamentPublic(tournamentId, {
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

  // Apply ranking updates if ranking is enabled
  if (success && tournament.rankingConfig?.enabled) {
    console.log('🏅 Applying ranking updates...');
    await applyRankingUpdates(tournamentId);
    console.log('🏅 Ranking updates applied.');
  }

  return success;
}

/**
 * Get all losers from a specific round type (QF or R16)
 */
function getLosersFromRound(bracket: BracketWithConfig, roundType: 'QF' | 'R16'): { participantId: string; seed?: number }[] {
  const totalRounds = bracket.totalRounds;
  const targetRoundIndex = roundType === 'QF' ? totalRounds - 3 : totalRounds - 4;

  if (targetRoundIndex < 0 || targetRoundIndex >= bracket.rounds.length) {
    return [];
  }

  const round = bracket.rounds[targetRoundIndex];
  const losers: { participantId: string; seed?: number }[] = [];

  for (const match of round.matches) {
    if (match.status === 'COMPLETED' && match.winner) {
      const loserId = match.participantA === match.winner ? match.participantB : match.participantA;
      if (loserId && loserId !== 'BYE') {
        const loserSeed = match.participantA === loserId ? match.seedA : match.seedB;
        losers.push({ participantId: loserId, seed: loserSeed });
      }
    }
  }

  return losers;
}

/**
 * Check if all matches in a round type are complete
 */
function isRoundComplete(bracket: BracketWithConfig, roundType: 'QF' | 'R16'): boolean {
  const totalRounds = bracket.totalRounds;
  const targetRoundIndex = roundType === 'QF' ? totalRounds - 3 : totalRounds - 4;

  if (targetRoundIndex < 0 || targetRoundIndex >= bracket.rounds.length) {
    return false;
  }

  const round = bracket.rounds[targetRoundIndex];
  return round.matches.every(m =>
    m.status === 'COMPLETED' || m.status === 'WALKOVER' ||
    m.participantA === 'BYE' || m.participantB === 'BYE'
  );
}

/**
 * Get positions in a round that are BYE matches (no real loser)
 * Returns array of match positions where a BYE participant exists
 */
function getByePositionsInRound(bracket: BracketWithConfig, roundType: 'QF' | 'R16'): number[] {
  const totalRounds = bracket.totalRounds;
  const targetRoundIndex = roundType === 'QF' ? totalRounds - 3 : totalRounds - 4;

  if (targetRoundIndex < 0 || targetRoundIndex >= bracket.rounds.length) {
    return [];
  }

  const round = bracket.rounds[targetRoundIndex];
  const byePositions: number[] = [];

  for (let i = 0; i < round.matches.length; i++) {
    const match = round.matches[i];
    // A match is a BYE match if either participant is a BYE
    if (isBye(match.participantA) || isBye(match.participantB)) {
      byePositions.push(i);
    }
  }

  return byePositions;
}

/**
 * Check and generate consolation brackets if needed
 * Also updates existing consolation brackets with losers from completed matches
 * Called after a match is completed in the main bracket
 */
async function checkAndGenerateConsolation(
  _tournamentId: string,
  bracket: BracketWithConfig,
  bracketType: 'gold' | 'silver',
  consolationEnabled: boolean
): Promise<BracketWithConfig> {
  // Check if consolation is enabled
  if (!consolationEnabled) {
    return bracket;
  }

  const updatedBracket = JSON.parse(JSON.stringify(bracket)) as BracketWithConfig;
  const bracketSize = nextPowerOfTwo(Math.pow(2, bracket.totalRounds));
  const available = getAvailableConsolationSources(bracketSize);

  // Initialize consolationBrackets array if needed
  if (!updatedBracket.consolationBrackets) {
    updatedBracket.consolationBrackets = [];
  }

  // Helper to get losers with their match positions and seeds
  function getLosersWithPositions(roundType: 'QF' | 'R16'): { loserId: string; matchPosition: number; seed?: number }[] {
    const totalRounds = bracket.totalRounds;
    const targetRoundIndex = roundType === 'QF' ? totalRounds - 3 : totalRounds - 4;

    if (targetRoundIndex < 0 || targetRoundIndex >= bracket.rounds.length) {
      return [];
    }

    const round = bracket.rounds[targetRoundIndex];
    const losers: { loserId: string; matchPosition: number; seed?: number }[] = [];

    for (let i = 0; i < round.matches.length; i++) {
      const match = round.matches[i];
      if (match.status === 'COMPLETED' && match.winner) {
        const loserId = match.participantA === match.winner ? match.participantB : match.participantA;
        const loserSeed = match.participantA === loserId ? match.seedA : match.seedB;
        if (loserId && loserId !== 'BYE') {
          losers.push({ loserId, matchPosition: i, seed: loserSeed });
        }
      }
    }

    return losers;
  }

  // Update placeholders in existing consolation brackets
  for (const consolation of updatedBracket.consolationBrackets) {
    const losers = getLosersWithPositions(consolation.source);
    console.log(`📝 Updating ${consolation.source} consolation with ${losers.length} losers:`);
    losers.forEach(l => console.log(`   Position ${l.matchPosition}: ${l.loserId?.substring(0, 12)}...`));

    for (const { loserId, matchPosition, seed } of losers) {
      // Replace placeholder with actual loser (and their seed)
      const updated = replaceLoserPlaceholder(consolation, consolation.source, matchPosition, loserId, seed);
      // Copy the updated rounds back
      consolation.rounds = updated.rounds;
    }

    // Process all rounds to advance winners from completed BYE matches
    for (let roundIdx = 0; roundIdx < consolation.rounds.length; roundIdx++) {
      for (const match of consolation.rounds[roundIdx].matches) {
        // If match is completed with a winner, advance to next round
        if (match.status === 'COMPLETED' && match.winner && match.nextMatchId) {
          for (let nextRoundIdx = roundIdx + 1; nextRoundIdx < consolation.rounds.length; nextRoundIdx++) {
            for (const nextMatch of consolation.rounds[nextRoundIdx].matches) {
              if (nextMatch.id === match.nextMatchId) {
                // Determine slot based on match position (even = A, odd = B)
                if (match.position % 2 === 0) {
                  if (!nextMatch.participantA) nextMatch.participantA = match.winner;
                } else {
                  if (!nextMatch.participantB) nextMatch.participantB = match.winner;
                }
              }
            }
          }
        }
      }
    }

    // Log the result after updates
    console.log(`   After updates:`);
    consolation.rounds.forEach((round, rIdx) => {
      console.log(`   Round ${rIdx + 1}:`);
      round.matches.forEach((m, i) => {
        console.log(`     Match ${i}: A=${m.participantA?.substring(0, 15) || 'none'}, B=${m.participantB?.substring(0, 15) || 'none'}, status=${m.status}, winner=${m.winner?.substring(0, 10) || 'none'}`);
      });
    });
  }

  // Check QF consolation - generate if missing and round is complete (legacy support)
  if (available.hasQF && isRoundComplete(bracket, 'QF')) {
    const existingQF = updatedBracket.consolationBrackets.find(c => c.source === 'QF');
    if (!existingQF) {
      const qfLosers = getLosersFromRound(bracket, 'QF');
      if (qfLosers.length === 4) {
        console.log(`🏅 Generating QF consolation bracket for ${bracketType} bracket`);
        const consolation = generateConsolationBracket(qfLosers, 'QF');
        updatedBracket.consolationBrackets.push(consolation);
      }
    }
  }

  // Check R16 consolation - generate if missing and round is complete (legacy support)
  if (available.hasR16 && isRoundComplete(bracket, 'R16')) {
    const existingR16 = updatedBracket.consolationBrackets.find(c => c.source === 'R16');
    if (!existingR16) {
      const r16Losers = getLosersFromRound(bracket, 'R16');
      if (r16Losers.length === 8) {
        console.log(`🏅 Generating R16 consolation bracket for ${bracketType} bracket`);
        const consolation = generateConsolationBracket(r16Losers, 'R16');
        updatedBracket.consolationBrackets.push(consolation);
      }
    }
  }

  return updatedBracket;
}

/**
 * Force regenerate consolation brackets for a tournament
 * Called manually when automatic generation failed
 */
export async function forceRegenerateConsolationBrackets(
  tournamentId: string,
  bracketType: 'gold' | 'silver' = 'gold'
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage) {
    console.error('Tournament or final stage not found');
    return false;
  }

  const bracket = bracketType === 'gold'
    ? tournament.finalStage.goldBracket
    : tournament.finalStage.silverBracket;

  if (!bracket) {
    console.error(`${bracketType} bracket not found`);
    return false;
  }

  // Debug info
  console.log(`🔍 Debug ${bracketType} bracket:`);
  console.log(`   totalRounds: ${bracket.totalRounds}`);
  console.log(`   rounds.length: ${bracket.rounds?.length}`);
  const bracketSize = nextPowerOfTwo(Math.pow(2, bracket.totalRounds));
  const available = getAvailableConsolationSources(bracketSize);
  console.log(`   bracketSize: ${bracketSize}`);
  console.log(`   hasQF: ${available.hasQF}, hasR16: ${available.hasR16}`);

  // Check round completion
  if (available.hasQF) {
    const qfIndex = bracket.totalRounds - 3;
    console.log(`   QF round index: ${qfIndex}`);
    if (qfIndex >= 0 && qfIndex < bracket.rounds.length) {
      const qfRound = bracket.rounds[qfIndex];
      console.log(`   QF round name: ${qfRound.name}`);
      console.log(`   QF matches: ${qfRound.matches.length}`);
      qfRound.matches.forEach((m, i) => {
        console.log(`     Match ${i}: status=${m.status}, A=${m.participantA?.substring(0,8)}, B=${m.participantB?.substring(0,8)}, winner=${m.winner?.substring(0,8) || 'none'}`);
      });
      const qfComplete = isRoundComplete(bracket, 'QF');
      console.log(`   QF complete: ${qfComplete}`);
    }
  }

  if (available.hasR16) {
    const r16Index = bracket.totalRounds - 4;
    console.log(`   R16 round index: ${r16Index}`);
    if (r16Index >= 0 && r16Index < bracket.rounds.length) {
      const r16Round = bracket.rounds[r16Index];
      console.log(`   R16 round name: ${r16Round.name}`);
      console.log(`   R16 matches: ${r16Round.matches.length}`);
      r16Round.matches.forEach((m, i) => {
        console.log(`     Match ${i}: status=${m.status}, A=${m.participantA?.substring(0,8)}, B=${m.participantB?.substring(0,8)}, winner=${m.winner?.substring(0,8) || 'none'}`);
      });
      const r16Complete = isRoundComplete(bracket, 'R16');
      console.log(`   R16 complete: ${r16Complete}`);
    }
  }

  // Fallback for consolationEnabled - check multiple locations due to migration
  const consolationEnabled = Boolean(
    tournament.finalStage.consolationEnabled ??
    (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled '] ??
    (bracket.config as unknown as Record<string, unknown>)?.consolationEnabled
  );

  console.log(`   consolationEnabled: ${consolationEnabled}`);

  if (!consolationEnabled) {
    console.log('Consolation is not enabled for this tournament');
    return false;
  }

  // FORCE recreate consolation brackets (preserve completed matches!)
  let updatedBracket = JSON.parse(JSON.stringify(bracket)) as BracketWithConfig;
  const existingBrackets = updatedBracket.consolationBrackets || [];
  const existingCount = existingBrackets.length;

  // Save existing completed/in-progress matches by source and match ID
  const existingMatchesMap = new Map<string, Map<string, BracketMatch>>();
  for (const consolation of existingBrackets) {
    const matchMap = new Map<string, BracketMatch>();
    for (const round of consolation.rounds) {
      for (const match of round.matches) {
        // Preserve any match that's not PENDING (completed, in progress, walkover)
        if (match.status !== 'PENDING') {
          matchMap.set(match.id, match);
          console.log(`💾 Preserving completed match: ${match.id} (status: ${match.status})`);
        }
      }
    }
    if (matchMap.size > 0) {
      existingMatchesMap.set(consolation.source, matchMap);
    }
  }

  if (existingCount > 0) {
    console.log(`🔄 Regenerating ${existingCount} consolation bracket(s), preserving ${[...existingMatchesMap.values()].reduce((sum, m) => sum + m.size, 0)} completed matches...`);
  }

  console.log('🆕 Creating consolation bracket structures with BYE handling...');
  updatedBracket.consolationBrackets = [];

  if (available.hasR16) {
    const r16ByePositions = getByePositionsInRound(updatedBracket, 'R16');
    console.log(`   R16 BYE positions: [${r16ByePositions.join(', ') || 'none'}]`);
    const newR16Bracket = generateConsolationBracketStructure(bracketSize, 'R16', r16ByePositions);

    // Restore completed matches for R16 consolation
    const r16CompletedMatches = existingMatchesMap.get('R16');
    if (r16CompletedMatches && r16CompletedMatches.size > 0) {
      for (const round of newR16Bracket.rounds) {
        for (let i = 0; i < round.matches.length; i++) {
          const existingMatch = r16CompletedMatches.get(round.matches[i].id);
          if (existingMatch) {
            console.log(`✅ Restoring completed match: ${existingMatch.id}`);
            round.matches[i] = existingMatch;
          }
        }
      }
    }

    updatedBracket.consolationBrackets.push(newR16Bracket);
    console.log('   Created R16 consolation structure');
  }
  if (available.hasQF) {
    const qfByePositions = getByePositionsInRound(updatedBracket, 'QF');
    console.log(`   QF BYE positions: [${qfByePositions.join(', ') || 'none'}]`);
    const newQFBracket = generateConsolationBracketStructure(bracketSize, 'QF', qfByePositions);

    // Restore completed matches for QF consolation
    const qfCompletedMatches = existingMatchesMap.get('QF');
    if (qfCompletedMatches && qfCompletedMatches.size > 0) {
      for (const round of newQFBracket.rounds) {
        for (let i = 0; i < round.matches.length; i++) {
          const existingMatch = qfCompletedMatches.get(round.matches[i].id);
          if (existingMatch) {
            console.log(`✅ Restoring completed match: ${existingMatch.id}`);
            round.matches[i] = existingMatch;
          }
        }
      }
    }

    updatedBracket.consolationBrackets.push(newQFBracket);
    console.log('   Created QF consolation structure');
  }

  // Now update with actual losers
  updatedBracket = await checkAndGenerateConsolation(
    tournamentId,
    updatedBracket,
    bracketType,
    consolationEnabled
  );

  // Check if we have consolation brackets to save
  const finalBracketsCount = updatedBracket.consolationBrackets?.length || 0;

  if (finalBracketsCount > 0) {
    // Assign tables to playable consolation matches
    const numTables = tournament.numTables || 12;
    console.log(`🎯 Assigning tables to consolation (numTables: ${numTables})...`);

    const silverBracket = bracketType === 'gold'
      ? tournament.finalStage.silverBracket as BracketWithConfig | null
      : null;
    const goldBracketForTables = bracketType === 'gold'
      ? updatedBracket
      : tournament.finalStage.goldBracket as BracketWithConfig;

    if (bracketType === 'gold') {
      assignTablesToConsolation(updatedBracket, silverBracket, numTables);
    } else {
      assignTablesToConsolation(goldBracketForTables, updatedBracket, numTables);
    }

    // Log assigned tables
    for (const consolation of updatedBracket.consolationBrackets!) {
      console.log(`   ${consolation.source} consolation tables:`);
      for (const round of consolation.rounds) {
        for (const match of round.matches) {
          if (match.tableNumber) {
            console.log(`     Match ${match.id.substring(0, 20)}...: Mesa ${match.tableNumber}`);
          }
        }
      }
    }

    // Update tournament with new/updated bracket
    const updatePath = bracketType === 'gold' ? 'finalStage.goldBracket' : 'finalStage.silverBracket';
    await updateTournament(tournamentId, { [updatePath]: updatedBracket });

    if (existingCount === 0) {
      console.log(`✅ Created ${finalBracketsCount} consolation bracket structure(s) for ${bracketType} bracket`);
    } else {
      console.log(`✅ Updated consolation brackets for ${bracketType} bracket`);
    }
    return true;
  }

  console.log('❌ Could not create consolation brackets - bracket may be too small (needs 8+ participants for QF consolation)');
  return false;
}

/**
 * Update a consolation bracket match
 */
export async function updateConsolationMatch(
  tournamentId: string,
  matchId: string,
  result: Partial<BracketMatch>,
  bracketType: 'gold' | 'silver' = 'gold'
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage) {
    console.error('Tournament not found');
    return false;
  }

  const bracket = bracketType === 'gold'
    ? tournament.finalStage.goldBracket
    : tournament.finalStage.silverBracket;

  if (!bracket || !bracket.consolationBrackets) {
    console.error('Bracket or consolation brackets not found');
    return false;
  }

  try {
    let matchUpdated = false;

    // Clean undefined values
    const cleanResult: Partial<BracketMatch> = {};
    Object.entries(result).forEach(([key, value]) => {
      if (value !== undefined) {
        (cleanResult as any)[key] = value;
      }
    });

    if (result.status === 'COMPLETED') {
      cleanResult.completedAt = Date.now();
    }

    // Find and update match in consolation brackets
    for (const consolation of bracket.consolationBrackets) {
      for (const round of consolation.rounds) {
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
      if (matchUpdated) break;
    }

    if (!matchUpdated) {
      console.error('Match not found in consolation brackets');
      return false;
    }

    // Update tournament
    const updateData: any = {
      finalStage: {
        ...tournament.finalStage,
        [bracketType === 'gold' ? 'goldBracket' : 'silverBracket']: bracket
      }
    };

    await updateTournamentPublic(tournamentId, updateData);
    return true;
  } catch (error) {
    console.error('Error updating consolation match:', error);
    return false;
  }
}

/**
 * Advance winner (and loser) in consolation bracket
 */
export async function advanceConsolationWinner(
  tournamentId: string,
  matchId: string,
  winnerId: string,
  bracketType: 'gold' | 'silver' = 'gold',
  loserId?: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage) {
    console.error('Tournament not found');
    return false;
  }

  const bracket = bracketType === 'gold'
    ? tournament.finalStage.goldBracket
    : tournament.finalStage.silverBracket;

  if (!bracket || !bracket.consolationBrackets) {
    console.error('Bracket or consolation brackets not found');
    return false;
  }

  try {
    // Find which consolation bracket contains this match
    let consolationIndex = -1;
    for (let i = 0; i < bracket.consolationBrackets.length; i++) {
      for (const round of bracket.consolationBrackets[i].rounds) {
        if (round.matches.some(m => m.id === matchId)) {
          consolationIndex = i;
          break;
        }
      }
      if (consolationIndex !== -1) break;
    }

    if (consolationIndex === -1) {
      console.error('Match not found in any consolation bracket');
      return false;
    }

    // Advance winner (and loser if provided) using algorithm
    const updatedConsolation = advanceConsolationWinnerAlgorithm(
      bracket.consolationBrackets[consolationIndex],
      matchId,
      winnerId,
      loserId
    );

    bracket.consolationBrackets[consolationIndex] = updatedConsolation;

    // Assign tables to any newly playable consolation matches
    const numTables = tournament.numTables || 4;
    const goldBracket = bracketType === 'gold' ? bracket : tournament.finalStage.goldBracket;
    const silverBracket = bracketType === 'silver' ? bracket : tournament.finalStage.silverBracket;
    console.log('🎯 advanceConsolationWinner: Assigning tables after match completion');
    assignTablesToConsolation(goldBracket!, silverBracket || null, numTables);

    // Check if tournament is complete (main brackets + consolation brackets)
    const consolationEnabled = tournament.finalStage.consolationEnabled ?? false;
    const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';

    const updatedGoldBracket = bracketType === 'gold' ? bracket : tournament.finalStage.goldBracket;
    const updatedSilverBracket = bracketType === 'silver' ? bracket : tournament.finalStage.silverBracket;

    const isGoldMainComplete = isBracketComplete(updatedGoldBracket);
    const isGoldConsolationComplete = areConsolationBracketsComplete(updatedGoldBracket, consolationEnabled);
    const isGoldComplete = isGoldMainComplete && isGoldConsolationComplete;

    const isSilverMainComplete = !isSplitDivisions || isBracketComplete(updatedSilverBracket);
    const isSilverConsolationComplete = !isSplitDivisions || areConsolationBracketsComplete(updatedSilverBracket, consolationEnabled);
    const isSilverComplete = isSilverMainComplete && isSilverConsolationComplete;

    const isTournamentComplete = isGoldComplete && isSilverComplete;

    // Update tournament
    const updateData: any = {
      finalStage: {
        ...tournament.finalStage,
        [bracketType === 'gold' ? 'goldBracket' : 'silverBracket']: bracket,
        isComplete: isTournamentComplete
      }
    };

    // Check if tournament was already completed (to avoid double ranking application)
    const wasAlreadyCompleted = tournament.status === 'COMPLETED';

    // If all matches are complete, mark entire tournament as COMPLETED
    if (isTournamentComplete && !wasAlreadyCompleted) {
      updateData.status = 'COMPLETED';
      updateData.completedAt = Date.now();
      console.log('🏆 All brackets (including consolation) completed - marking tournament as COMPLETED');

      // Calculate final positions and include in the same update
      console.log('📊 Calculating final positions...');
      const tournamentWithUpdatedBracket = {
        ...tournament,
        finalStage: {
          ...tournament.finalStage,
          [bracketType === 'gold' ? 'goldBracket' : 'silverBracket']: bracket,
          isComplete: true
        }
      };
      updateData.participants = calculateFinalPositionsForTournament(tournamentWithUpdatedBracket);
      console.log('📊 Final positions calculated and included in update.');
    } else if (!isTournamentComplete) {
      console.log('📋 Consolation check - goldComplete=' + isGoldComplete + ', silverComplete=' + isSilverComplete);
    }

    await updateTournamentPublic(tournamentId, updateData);
    return true;
  } catch (error) {
    console.error('Error advancing consolation winner:', error);
    return false;
  }
}

/**
 * Check if all consolation brackets are complete
 */
function areConsolationBracketsComplete(bracket: BracketWithConfig | undefined, consolationEnabled: boolean): boolean {
  if (!bracket) return true;
  if (!consolationEnabled) return true;
  if (!bracket.consolationBrackets || bracket.consolationBrackets.length === 0) {
    // Consolation enabled but no brackets generated yet - check if they should be
    const bracketSize = nextPowerOfTwo(Math.pow(2, bracket.totalRounds));
    const available = getAvailableConsolationSources(bracketSize);

    // If we should have consolation brackets but don't, return false
    if (available.hasQF || available.hasR16) {
      // Check if the main bracket is far enough along to generate consolation
      if (available.hasQF && isRoundComplete(bracket, 'QF')) return false;
      if (available.hasR16 && isRoundComplete(bracket, 'R16')) return false;
    }
    return true;
  }

  return bracket.consolationBrackets.every(c => c.isComplete);
}
