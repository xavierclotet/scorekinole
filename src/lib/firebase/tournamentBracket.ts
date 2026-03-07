/**
 * Tournament bracket (final stage) management
 * Single elimination bracket operations
 */

import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { getTournament, updateTournament, parseTournamentData } from './tournaments';
import { cleanUndefined } from './cleanUndefined';
import {
  generateBracket as generateBracketAlgorithm,
  advanceWinner as advanceWinnerAlgorithm,
  generateConsolationBracketStructure,
  replaceLoserPlaceholder,
  advanceConsolationWinner as advanceConsolationWinnerAlgorithm,
  getAvailableConsolationSources,
  nextPowerOfTwo,
  isBye,
  cascadeByeWins
} from '$lib/algorithms/bracket';
import type { ConsolationSource } from '$lib/algorithms/bracket';
import { calculateFinalPositionsForTournament } from './tournamentRanking';
import type { Bracket, BracketMatch, BracketWithConfig, BracketConfig, PhaseConfig, Tournament } from '$lib/types/tournament';

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
 * Build a complete table history from ALL matches in the tournament (groups + brackets + consolation).
 * Returns a Map where each participant ID maps to an array of table numbers they've played on.
 * Only includes matches that have a table assigned (completed, in progress, or pending with table).
 */
function buildTableHistory(tournament: Tournament): Map<string, number[]> {
  const history = new Map<string, number[]>();

  const record = (id: string, table: number) => {
    if (!id || id === 'BYE') return;
    if (!history.has(id)) history.set(id, []);
    history.get(id)!.push(table);
  };

  // 1. Group stage: schedule (RR) + pairings (Swiss)
  for (const group of tournament.groupStage?.groups || []) {
    for (const round of [...(group.schedule || []), ...(group.pairings || [])]) {
      for (const match of round.matches) {
        const table = match.tableNumber || match.playedOnTable;
        if (table && match.participantB !== 'BYE') {
          record(match.participantA, table);
          record(match.participantB, table);
        }
      }
    }
  }

  // 2. Final stage brackets (gold, silver)
  const recordBracketMatches = (bracket: Bracket) => {
    for (const round of bracket.rounds) {
      for (const match of round.matches) {
        const table = match.tableNumber || match.playedOnTable;
        if (table && match.participantA && match.participantB &&
            match.participantA !== 'BYE' && match.participantB !== 'BYE') {
          record(match.participantA, table);
          record(match.participantB, table);
        }
      }
    }
    const tpm = bracket.thirdPlaceMatch;
    const tpmTable = tpm?.tableNumber || tpm?.playedOnTable;
    if (tpmTable && tpm?.participantA && tpm?.participantB) {
      record(tpm.participantA, tpmTable);
      record(tpm.participantB, tpmTable);
    }
    // Consolation brackets
    const consolations = (bracket as BracketWithConfig).consolationBrackets;
    if (consolations) {
      for (const consolation of consolations) {
        for (const round of consolation.rounds) {
          for (const match of round.matches) {
            const table = match.tableNumber || match.playedOnTable;
            if (table && match.participantA && match.participantB &&
                match.participantA !== 'BYE' && match.participantB !== 'BYE' &&
                !match.participantA.startsWith('LOSER:') && !match.participantB.startsWith('LOSER:')) {
              record(match.participantA, table);
              record(match.participantB, table);
            }
          }
        }
      }
    }
  };

  if (tournament.finalStage?.goldBracket) {
    recordBracketMatches(tournament.finalStage.goldBracket);
  }
  if (tournament.finalStage?.silverBracket) {
    recordBracketMatches(tournament.finalStage.silverBracket);
  }

  // Log full table history

  return history;
}

/**
 * Pick the best table for a match using Fair Table Rotation.
 * Prioritizes tables that don't break any player's cycle (no repeat before visiting all tables).
 * On tie, uses combined usage as secondary score and recency as final tiebreak.
 *
 * @returns The best table number, or null if no tables available
 */
function pickBestTable(
  participantA: string,
  participantB: string,
  availableTables: number[],
  tableHistory: Map<string, number[]>,
  totalTables: number
): number | null {
  if (availableTables.length === 0) return null;

  const historyA = tableHistory.get(participantA) || [];
  const historyB = tableHistory.get(participantB) || [];

  // Build usage maps for O(1) lookup
  const usageMapA = new Map<number, number>();
  const usageMapB = new Map<number, number>();
  for (const t of historyA) usageMapA.set(t, (usageMapA.get(t) || 0) + 1);
  for (const t of historyB) usageMapB.set(t, (usageMapB.get(t) || 0) + 1);

  // Compute minimum usage across ALL tables (cycle level)
  // If a player hasn't visited all tables yet, min = 0
  let minA = Infinity;
  let minB = Infinity;
  for (let t = 1; t <= totalTables; t++) {
    minA = Math.min(minA, usageMapA.get(t) || 0);
    minB = Math.min(minB, usageMapB.get(t) || 0);
  }
  if (minA === Infinity) minA = 0;
  if (minB === Infinity) minB = 0;

  // Log player cycle status
  const usageAStr = Array.from({ length: totalTables }, (_, i) => `T${i + 1}:${usageMapA.get(i + 1) || 0}`).join(' ');
  const usageBStr = Array.from({ length: totalTables }, (_, i) => `T${i + 1}:${usageMapB.get(i + 1) || 0}`).join(' ');

  let bestTable = availableTables[0];
  let bestPrimary = Infinity;
  let bestSecondary = Infinity;

  const tableScores: string[] = [];

  for (const table of availableTables) {
    const uA = usageMapA.get(table) || 0;
    const uB = usageMapB.get(table) || 0;

    // Fair Table Rotation: prioritize tables that don't break any player's cycle
    const deltaA = uA - minA;
    const deltaB = uB - minB;
    const primaryScore = Math.max(deltaA, deltaB);
    const secondaryScore = uA + uB;

    tableScores.push(`T${table}(p=${primaryScore},s=${secondaryScore})`);

    if (primaryScore < bestPrimary
        || (primaryScore === bestPrimary && secondaryScore < bestSecondary)) {
      bestPrimary = primaryScore;
      bestSecondary = secondaryScore;
      bestTable = table;
    } else if (primaryScore === bestPrimary && secondaryScore === bestSecondary) {
      // Tie-breaker: prefer table not recently used by either participant
      const recentA = historyA.length > 0 && historyA[historyA.length - 1] === table;
      const recentB = historyB.length > 0 && historyB[historyB.length - 1] === table;
      const currentRecentA = historyA.length > 0 && historyA[historyA.length - 1] === bestTable;
      const currentRecentB = historyB.length > 0 && historyB[historyB.length - 1] === bestTable;

      if ((!recentA && !recentB) && (currentRecentA || currentRecentB)) {
        bestTable = table;
      }
    }
  }


  return bestTable;
}

/**
 * Assign tables to playable matches in brackets, respecting the table limit
 * If there are 2 brackets, tables are split between them (half each)
 * Uses table history to maximize variety - participants play on different tables
 *
 * @param goldBracket Gold bracket (or main bracket if no split)
 * @param silverBracket Silver bracket (optional)
 * @param numTables Maximum number of tables available
 * @param tableHistory Historical table usage per participant (from groups + previous bracket matches)
 */
function assignTablesToBrackets(
  goldBracket: Bracket,
  silverBracket: Bracket | null,
  numTables: number,
  tableHistory: Map<string, number[]> = new Map()
): void {
  // Get tables currently used by both brackets
  const usedByGold = getUsedTables(goldBracket);
  const usedBySilver = silverBracket ? getUsedTables(silverBracket) : new Set<number>();
  const allUsed = new Set([...usedByGold, ...usedBySilver]);

  // Get available tables
  let availableTables = getAvailableTables(allUsed, numTables);

  if (availableTables.length === 0) {
    return; // No tables available
  }

  // Get playable matches from both brackets
  const goldPlayable = getPlayableMatches(goldBracket);
  const silverPlayable = silverBracket ? getPlayableMatches(silverBracket) : [];


  // Helper: assign best table to a match and remove it from available pool
  const assignBestTable = (match: BracketMatch): boolean => {
    if (!match.participantA || !match.participantB) return false;
    const table = pickBestTable(match.participantA, match.participantB, availableTables, tableHistory, numTables);
    if (table === null) return false;

    match.tableNumber = table;
    availableTables = availableTables.filter(t => t !== table);

    // Update history so subsequent assignments in the same batch see this
    if (!tableHistory.has(match.participantA)) tableHistory.set(match.participantA, []);
    if (!tableHistory.has(match.participantB)) tableHistory.set(match.participantB, []);
    tableHistory.get(match.participantA)!.push(table);
    tableHistory.get(match.participantB)!.push(table);
    return true;
  };

  if (silverBracket) {
    const goldNeeds = goldPlayable.length;
    const silverNeeds = silverPlayable.length;
    const totalNeeds = goldNeeds + silverNeeds;


    if (totalNeeds <= availableTables.length) {
      // Enough tables for everyone - assign best table to each match
      for (const match of goldPlayable) assignBestTable(match);
      for (const match of silverPlayable) assignBestTable(match);
    } else {
      // Not enough tables - split proportionally (prioritize gold slightly)
      const tablesForGold = Math.ceil(availableTables.length / 2);
      const tablesForSilver = availableTables.length - tablesForGold;

      let goldAssigned = 0;
      for (const match of goldPlayable) {
        if (goldAssigned >= tablesForGold || availableTables.length === 0) break;
        if (assignBestTable(match)) goldAssigned++;
      }
      let silverAssigned = 0;
      for (const match of silverPlayable) {
        if (silverAssigned >= tablesForSilver || availableTables.length === 0) break;
        if (assignBestTable(match)) silverAssigned++;
      }
    }
  } else {
    // Single bracket: all tables go to gold
    for (const match of goldPlayable) {
      if (availableTables.length === 0) break;
      assignBestTable(match);
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
 * Uses table history to maximize variety across all tournament phases
 */
function assignTablesToConsolation(
  goldBracket: BracketWithConfig,
  silverBracket: BracketWithConfig | null,
  numTables: number,
  tableHistory: Map<string, number[]> = new Map()
): void {
  // Get tables currently used by main brackets and existing consolation
  const usedByGold = getUsedTables(goldBracket);
  const usedBySilver = silverBracket ? getUsedTables(silverBracket) : new Set<number>();
  const allUsed = new Set([...usedByGold, ...usedBySilver]);

  // Get available tables
  let availableTables = getAvailableTables(allUsed, numTables);

  if (availableTables.length === 0) {
    return;
  }

  // Get playable consolation matches
  const goldConsolationPlayable = getPlayableConsolationMatches(goldBracket);
  const silverConsolationPlayable = silverBracket ? getPlayableConsolationMatches(silverBracket) : [];


  // Helper: assign best table to a match and remove it from available pool
  const assignBestTable = (match: BracketMatch): boolean => {
    if (!match.participantA || !match.participantB) return false;
    const table = pickBestTable(match.participantA, match.participantB, availableTables, tableHistory, numTables);
    if (table === null) return false;

    match.tableNumber = table;
    availableTables = availableTables.filter(t => t !== table);

    if (!tableHistory.has(match.participantA)) tableHistory.set(match.participantA, []);
    if (!tableHistory.has(match.participantB)) tableHistory.set(match.participantB, []);
    tableHistory.get(match.participantA)!.push(table);
    tableHistory.get(match.participantB)!.push(table);
    return true;
  };

  const totalNeeds = goldConsolationPlayable.length + silverConsolationPlayable.length;

  if (totalNeeds <= availableTables.length) {
    // Enough tables - assign best to each
    for (const match of goldConsolationPlayable) assignBestTable(match);
    for (const match of silverConsolationPlayable) assignBestTable(match);
  } else {
    // Not enough - prioritize gold
    const tablesForGold = Math.ceil(availableTables.length / 2);
    let goldAssigned = 0;
    for (const match of goldConsolationPlayable) {
      if (goldAssigned >= tablesForGold || availableTables.length === 0) break;
      if (assignBestTable(match)) goldAssigned++;
    }
    let silverAssigned = 0;
    for (const match of silverConsolationPlayable) {
      if (availableTables.length === 0) break;
      if (assignBestTable(match)) silverAssigned++;
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

    // Build table history from all tournament phases for equitable assignment
    const tableHistory = buildTableHistory(tournament);

    // Reassign tables for main brackets
    assignTablesToBrackets(goldBracket, silverBracket, numTables, tableHistory);

    // Reassign tables for consolation brackets (only if consolation enabled)
    if (consolationEnabled) {
      assignTablesToConsolation(
        goldBracket as BracketWithConfig,
        silverBracket as BracketWithConfig | null,
        numTables,
        tableHistory
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

    // Compare with original to skip unnecessary writes
    const originalGold = JSON.stringify(tournament.finalStage.goldBracket);
    const originalSilver = tournament.finalStage.silverBracket
      ? JSON.stringify(tournament.finalStage.silverBracket)
      : null;
    const newGold = JSON.stringify(goldBracket);
    const newSilver = silverBracket ? JSON.stringify(silverBracket) : null;

    if (newGold === originalGold && newSilver === originalSilver && numTables === (tournament.numTables ?? 4)) {
      return { success: true, tablesAssigned };
    }

    // Deep-clone entire finalStage to avoid carrying Firestore Timestamps or invalid types
    const cleanFinalStage = JSON.parse(JSON.stringify(tournament.finalStage));
    cleanFinalStage.goldBracket = goldBracket;
    if (silverBracket) {
      cleanFinalStage.silverBracket = silverBracket;
    }

    const updateData: any = {
      numTables,
      finalStage: cleanFinalStage
    };

    await updateTournament(tournamentId, updateData);

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
    thirdPlaceMatchEnabled?: boolean;
  }
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  try {
    const { goldParticipantIds, silverParticipantIds, goldConfig, silverConfig, consolationEnabled, thirdPlaceMatchEnabled = true } = options;

    // Deduplicate participant IDs (defensive - prevents bracket size inflation from stale reactivity)
    const uniqueGoldIds = [...new Set(goldParticipantIds)];
    const uniqueSilverIds = [...new Set(silverParticipantIds)];

    // Get participant objects for gold bracket
    const goldParticipants = uniqueGoldIds
      .map(id => tournament.participants.find(p => p.id === id))
      .filter(p => p !== undefined);

    // Get participant objects for silver bracket
    const silverParticipants = uniqueSilverIds
      .map(id => tournament.participants.find(p => p.id === id))
      .filter(p => p !== undefined);


    if (goldParticipants.length < 2 || silverParticipants.length < 2) {
      console.error('Not enough participants for brackets');
      return false;
    }

    // Generate both brackets using algorithm
    // Silver bracket seeds are offset by gold participant count (e.g., if gold has 8, silver seeds start at 9)
    const goldBracketRaw = generateBracketAlgorithm(goldParticipants, thirdPlaceMatchEnabled);
    const silverBracketRaw = generateBracketAlgorithm(silverParticipants, thirdPlaceMatchEnabled, goldParticipants.length);

    // Assign table numbers to brackets respecting the table limit
    // Tables are distributed fairly between gold and silver brackets
    const numTables = tournament.numTables || 4;
    const tableHistory = buildTableHistory(tournament);
    assignTablesToBrackets(goldBracketRaw, silverBracketRaw, numTables, tableHistory);


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
      const goldAvailable = getAvailableConsolationSources(goldBracketSize, goldParticipants.length);
      const silverAvailable = getAvailableConsolationSources(silverBracketSize, silverParticipants.length);

      goldBracketWithConfig.consolationBrackets = [];
      silverBracketWithConfig.consolationBrackets = [];

      // Use raw brackets to calculate BYE positions (cast is safe as we only use rounds/totalRounds)
      const tempGoldBracket = goldBracketRaw as unknown as BracketWithConfig;
      const tempSilverBracket = silverBracketRaw as unknown as BracketWithConfig;

      // Gold bracket consolation (generate from outermost round inward)
      for (const roundType of ['R64', 'R32', 'R16', 'QF'] as ConsolationSource[]) {
        const key = `has${roundType}` as keyof typeof goldAvailable;
        if (goldAvailable[key]) {
          const byePositions = getByePositionsInRound(tempGoldBracket, roundType);
          goldBracketWithConfig.consolationBrackets.push(generateConsolationBracketStructure(goldBracketSize, roundType, byePositions, 'gold'));
        }
      }

      // Silver bracket consolation (positions offset by gold participant count)
      const silverPosOffset = goldParticipants.length;
      for (const roundType of ['R64', 'R32', 'R16', 'QF'] as ConsolationSource[]) {
        const key = `has${roundType}` as keyof typeof silverAvailable;
        if (silverAvailable[key]) {
          const byePositions = getByePositionsInRound(tempSilverBracket, roundType);
          silverBracketWithConfig.consolationBrackets.push(generateConsolationBracketStructure(silverBracketSize, roundType, byePositions, 'silver', silverPosOffset));
        }
      }
    }

    // Update tournament with both brackets (config embedded in each bracket)
    // Use spread to preserve any existing finalStage fields from tournament creation
    // Explicitly include thirdPlaceMatchEnabled to ensure it's not lost
    return await updateTournament(tournamentId, {
      finalStage: {
        ...tournament.finalStage,
        mode: 'SPLIT_DIVISIONS',
        consolationEnabled: consolationEnabled ?? tournament.finalStage?.consolationEnabled ?? false,
        thirdPlaceMatchEnabled: thirdPlaceMatchEnabled ?? tournament.finalStage?.thirdPlaceMatchEnabled ?? true,
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
 * @param thirdPlaceMatchEnabled Optional flag to generate 3rd/4th place match (default: true)
 * @returns true if successful
 */
export async function generateBracket(
  tournamentId: string,
  config?: BracketConfig,
  consolationEnabled?: boolean,
  thirdPlaceMatchEnabled: boolean = true
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
    const bracketRaw = generateBracketAlgorithm(qualifiedParticipants, thirdPlaceMatchEnabled);

    // Assign table numbers respecting the table limit
    const numTables = tournament.numTables || 4;
    const tableHistory = buildTableHistory(tournament);
    assignTablesToBrackets(bracketRaw, null, numTables, tableHistory);

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
      const available = getAvailableConsolationSources(bracketSize, qualifiedParticipants.length);

      goldBracketWithConfig.consolationBrackets = [];

      // Use bracketRaw to calculate BYE positions (cast is safe as we only use rounds/totalRounds)
      const tempBracket = bracketRaw as unknown as BracketWithConfig;

      for (const roundType of ['R64', 'R32', 'R16', 'QF'] as ConsolationSource[]) {
        const key = `has${roundType}` as keyof typeof available;
        if (available[key]) {
          const byePositions = getByePositionsInRound(tempBracket, roundType);
          goldBracketWithConfig.consolationBrackets.push(generateConsolationBracketStructure(bracketSize, roundType, byePositions, 'gold'));
        }
      }
    }

    // Use spread to preserve any existing finalStage fields from tournament creation
    // Explicitly include thirdPlaceMatchEnabled to ensure it's not lost
    return await updateTournament(tournamentId, {
      finalStage: {
        ...tournament.finalStage,
        mode: 'SINGLE_BRACKET',
        consolationEnabled: consolationEnabled ?? tournament.finalStage?.consolationEnabled ?? false,
        thirdPlaceMatchEnabled: thirdPlaceMatchEnabled ?? tournament.finalStage?.thirdPlaceMatchEnabled ?? true,
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
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage || !tournament.finalStage.goldBracket) {
        throw new Error('Gold bracket not found');
      }

      // Check consolationEnabled
      const consolationEnabled = Boolean(
        tournament.finalStage.consolationEnabled ??
        (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
      );

      const goldBracket = tournament.finalStage.goldBracket;
      let matchUpdated = false;


      // Clean undefined values from result to avoid Firestore errors
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

      // Helper: merge result into existing match, preserving playedOnTable from existing tableNumber
      const mergeMatch = (existing: BracketMatch): BracketMatch => {
        if (cleanResult.completedAt) {
          cleanResult.duration = existing.startedAt ? cleanResult.completedAt - existing.startedAt : 0;
        }
        // Preserve which table was used before clearing it
        if (result.status === 'COMPLETED' && existing.tableNumber) {
          cleanResult.playedOnTable = existing.tableNumber;
        }
        return { ...existing, ...cleanResult };
      };

      // Find and update match (check 3rd place match first)
      if (goldBracket.thirdPlaceMatch?.id === matchId) {
        goldBracket.thirdPlaceMatch = mergeMatch(goldBracket.thirdPlaceMatch);
        matchUpdated = true;
      } else {
        // Search in rounds
        for (const round of goldBracket.rounds) {
          const matchIndex = round.matches.findIndex(m => m.id === matchId);
          if (matchIndex !== -1) {
            round.matches[matchIndex] = mergeMatch(round.matches[matchIndex]);
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
              round.matches[matchIndex] = mergeMatch(round.matches[matchIndex]);
              matchUpdated = true;
              break;
            }
          }
          if (matchUpdated) break;
        }
      }

      if (!matchUpdated) {
        throw new Error('Match not found');
      }

      // Atomic write
      const cleanedFinalStage = cleanUndefined({
        ...tournament.finalStage,
        goldBracket
      });
      transaction.update(tournamentRef, {
        finalStage: cleanedFinalStage,
        updatedAt: serverTimestamp()
      });
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
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage || !tournament.finalStage.goldBracket) {
        throw new Error('Gold bracket not found');
      }

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
      const consolationEnabled = Boolean(
        tournament.finalStage.consolationEnabled
        ?? (tournament.finalStage as unknown as Record<string, unknown>)['consolationEnabled ']
      );
      updatedGoldBracket = await checkAndGenerateConsolation(tournamentId, updatedGoldBracket, 'gold', consolationEnabled);

      // Assign tables to any newly ready matches (with full tournament table history)
      const numTables = tournament.numTables || 4;
      const silverBracketForTables = tournament.finalStage.silverBracket || null;
      const tableHistory = buildTableHistory(tournament);
      assignTablesToBrackets(updatedGoldBracket, silverBracketForTables, numTables, tableHistory);

      if (consolationEnabled) {
        assignTablesToConsolation(updatedGoldBracket, silverBracketForTables as BracketWithConfig | null, numTables, tableHistory);
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

      const isTournamentComplete = isGoldComplete && isSilverComplete;

      // Get gold final match winner
      const goldFinalRound = updatedGoldBracket.rounds[updatedGoldBracket.rounds.length - 1];
      const goldFinalMatch = goldFinalRound.matches[0];
      const goldWinner = (goldFinalMatch.status === 'COMPLETED' || goldFinalMatch.status === 'WALKOVER')
        ? goldFinalMatch.winner
        : undefined;

      // Build update data
      const updateData: any = {
        finalStage: cleanUndefined({
          ...tournament.finalStage,
          goldBracket: updatedGoldBracket,
          isComplete: isTournamentComplete,
          winner: goldWinner
        }),
        updatedAt: serverTimestamp()
      };

      const wasAlreadyCompleted = tournament.status === 'COMPLETED';

      if (isTournamentComplete && !wasAlreadyCompleted) {
        updateData.status = 'COMPLETED';
        updateData.completedAt = Date.now();

        const tournamentWithUpdatedBracket = {
          ...tournament,
          finalStage: { ...tournament.finalStage, goldBracket: updatedGoldBracket, isComplete: true }
        };
        updateData.participants = cleanUndefined(calculateFinalPositionsForTournament(tournamentWithUpdatedBracket));
        // Note: Ranking updates are applied by the Cloud Function (onTournamentComplete)
        // to avoid double-application of ranking points
      }

      transaction.update(tournamentRef, updateData);
    });

    return true;
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
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage || !tournament.finalStage.silverBracket) {
        throw new Error('Silver bracket not found');
      }

      // Check consolationEnabled
      const consolationEnabled = Boolean(
        tournament.finalStage.consolationEnabled ??
        (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
      );

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
        cleanResult.tableNumber = undefined;
      }

      // Helper: merge result into existing match, preserving playedOnTable from existing tableNumber
      const mergeMatch = (existing: BracketMatch): BracketMatch => {
        if (cleanResult.completedAt) {
          cleanResult.duration = existing.startedAt ? cleanResult.completedAt - existing.startedAt : 0;
        }
        if (result.status === 'COMPLETED' && existing.tableNumber) {
          cleanResult.playedOnTable = existing.tableNumber;
        }
        return { ...existing, ...cleanResult };
      };

      // Find and update match (check 3rd place match first)
      if (silverBracket.thirdPlaceMatch?.id === matchId) {
        silverBracket.thirdPlaceMatch = mergeMatch(silverBracket.thirdPlaceMatch);
        matchUpdated = true;
      } else {
        for (const round of silverBracket.rounds) {
          const matchIndex = round.matches.findIndex(m => m.id === matchId);
          if (matchIndex !== -1) {
            round.matches[matchIndex] = mergeMatch(round.matches[matchIndex]);
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
              round.matches[matchIndex] = mergeMatch(round.matches[matchIndex]);
              matchUpdated = true;
              break;
            }
          }
          if (matchUpdated) break;
        }
      }

      if (!matchUpdated) {
        throw new Error('Match not found in silver bracket');
      }

      // Atomic write
      const cleanedFinalStage = cleanUndefined({
        ...tournament.finalStage,
        silverBracket
      });
      transaction.update(tournamentRef, {
        finalStage: cleanedFinalStage,
        updatedAt: serverTimestamp()
      });
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
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage || !tournament.finalStage.silverBracket || !tournament.finalStage.goldBracket) {
        throw new Error('Brackets not found');
      }

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

      const consolationEnabled = Boolean(
        tournament.finalStage.consolationEnabled
        ?? (tournament.finalStage as unknown as Record<string, unknown>)['consolationEnabled ']
      );
      const silverConsoOffset = tournament.finalStage.goldBracket ? countRealParticipants(tournament.finalStage.goldBracket as BracketWithConfig) : 0;
      updatedSilverBracket = await checkAndGenerateConsolation(tournamentId, updatedSilverBracket, 'silver', consolationEnabled, silverConsoOffset);

      const numTables = tournament.numTables || 4;
      const tableHistory = buildTableHistory(tournament);
      assignTablesToBrackets(tournament.finalStage.goldBracket, updatedSilverBracket, numTables, tableHistory);

      if (consolationEnabled) {
        assignTablesToConsolation(
          tournament.finalStage.goldBracket as BracketWithConfig,
          updatedSilverBracket,
          numTables,
          tableHistory
        );
      }

      // Check completion
      const isSilverMainComplete = isBracketComplete(updatedSilverBracket);
      const isSilverConsolationComplete = areConsolationBracketsComplete(updatedSilverBracket, consolationEnabled);
      const isSilverComplete = isSilverMainComplete && isSilverConsolationComplete;

      const isGoldMainComplete = isBracketComplete(tournament.finalStage.goldBracket);
      const isGoldConsolationComplete = areConsolationBracketsComplete(tournament.finalStage.goldBracket, consolationEnabled);
      const isGoldComplete = isGoldMainComplete && isGoldConsolationComplete;

      const isTournamentComplete = isGoldComplete && isSilverComplete;

      const silverFinalRound = updatedSilverBracket.rounds[updatedSilverBracket.rounds.length - 1];
      const silverFinalMatch = silverFinalRound.matches[0];
      const silverWinner = (silverFinalMatch.status === 'COMPLETED' || silverFinalMatch.status === 'WALKOVER')
        ? silverFinalMatch.winner
        : undefined;

      const updateData: any = {
        finalStage: cleanUndefined({
          ...tournament.finalStage,
          silverBracket: updatedSilverBracket,
          isComplete: isTournamentComplete,
          silverWinner: silverWinner
        }),
        updatedAt: serverTimestamp()
      };

      const wasAlreadyCompleted = tournament.status === 'COMPLETED';

      if (isTournamentComplete && !wasAlreadyCompleted) {
        updateData.status = 'COMPLETED';
        updateData.completedAt = Date.now();

        const tournamentWithUpdatedBracket = {
          ...tournament,
          finalStage: { ...tournament.finalStage, silverBracket: updatedSilverBracket, isComplete: true }
        };
        updateData.participants = cleanUndefined(calculateFinalPositionsForTournament(tournamentWithUpdatedBracket));
        // Note: Ranking updates are applied by the Cloud Function (onTournamentComplete)
      }

      transaction.update(tournamentRef, updateData);
    });

    return true;
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
  // Use single-transaction completeBracketMatchAndAdvance which handles
  // phase detection, match update, and winner advancement atomically
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    // Read match inside transaction to determine winner, then delegate to atomic function
    let winner: string | undefined;
    let matchParticipantA: string | undefined;

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage?.silverBracket) {
        throw new Error('Tournament or silver bracket not found');
      }

      // Find match in silver bracket
      let match: BracketMatch | undefined;
      for (const round of tournament.finalStage.silverBracket.rounds) {
        match = round.matches.find(m => m.id === matchId);
        if (match) break;
      }
      if (!match && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
        match = tournament.finalStage.silverBracket.thirdPlaceMatch;
      }
      if (!match) throw new Error('Match not found in silver bracket');

      winner = match.participantA === participantId ? match.participantB : match.participantA;
      matchParticipantA = match.participantA;
      if (!winner) throw new Error('Cannot determine winner for walkover');
    });

    // Now use the atomic function with the determined winner
    return await completeBracketMatchAndAdvance(tournamentId, matchId, {
      status: 'WALKOVER',
      winner: winner!,
      gamesWonA: matchParticipantA === winner ? 2 : 0,
      gamesWonB: matchParticipantA === winner ? 0 : 2,
      noShowParticipant: participantId,
      walkedOverAt: Date.now()
    });
  } catch (error) {
    console.error('❌ Error marking silver bracket no-show:', error);
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
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    // Read match inside transaction to determine winner, then delegate to atomic function
    let winner: string | undefined;
    let matchParticipantA: string | undefined;

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage?.goldBracket) {
        throw new Error('Tournament or gold bracket not found');
      }

      // Find match in gold bracket
      let match: BracketMatch | undefined;
      for (const round of tournament.finalStage.goldBracket.rounds) {
        match = round.matches.find(m => m.id === matchId);
        if (match) break;
      }
      if (!match) throw new Error('Match not found');

      winner = match.participantA === participantId ? match.participantB : match.participantA;
      matchParticipantA = match.participantA;
      if (!winner) throw new Error('Cannot determine winner for walkover');
    });

    // Now use the atomic function with the determined winner
    return await completeBracketMatchAndAdvance(tournamentId, matchId, {
      status: 'WALKOVER',
      winner: winner!,
      gamesWonA: matchParticipantA === winner ? 2 : 0,
      gamesWonB: matchParticipantA === winner ? 0 : 2,
      noShowParticipant: participantId,
      walkedOverAt: Date.now()
    });
  } catch (error) {
    console.error('❌ Error marking bracket no-show:', error);
    return false;
  }
}

/**
 * Complete final stage
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function completeFinalStage(tournamentId: string): Promise<boolean> {
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage || !tournament.finalStage.goldBracket) {
        throw new Error('Tournament or gold bracket not found');
      }

      // Check if tournament was already completed
      if (tournament.status === 'COMPLETED') {
        return;
      }

      const consolationEnabled = tournament.finalStage.consolationEnabled ?? false;
      const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';

      // Check if gold bracket is complete (main + consolation)
      const isGoldMainComplete = isBracketComplete(tournament.finalStage.goldBracket);
      const isGoldConsolationComplete = areConsolationBracketsComplete(tournament.finalStage.goldBracket, consolationEnabled);
      const isGoldComplete = isGoldMainComplete && isGoldConsolationComplete;

      if (!isGoldComplete) {
        throw new Error(`Gold bracket is not complete (main: ${isGoldMainComplete}, consolation: ${isGoldConsolationComplete})`);
      }

      // For SPLIT_DIVISIONS, also check silver bracket (main + consolation)
      if (isSplitDivisions) {
        const isSilverMainComplete = isBracketComplete(tournament.finalStage.silverBracket);
        const isSilverConsolationComplete = areConsolationBracketsComplete(tournament.finalStage.silverBracket, consolationEnabled);
        const isSilverComplete = isSilverMainComplete && isSilverConsolationComplete;

        if (!isSilverComplete) {
          throw new Error(`Silver bracket is not complete (main: ${isSilverMainComplete}, consolation: ${isSilverConsolationComplete})`);
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
      const tournamentWithComplete = {
        ...tournament,
        finalStage: { ...tournament.finalStage, isComplete: true }
      };
      const updatedParticipants = cleanUndefined(calculateFinalPositionsForTournament(tournamentWithComplete));

      // Mark final stage as complete and update tournament status with positions
      transaction.update(tournamentRef, {
        status: 'COMPLETED',
        completedAt: Date.now(),
        participants: updatedParticipants,
        finalStage: cleanUndefined({
          ...tournament.finalStage,
          isComplete: true,
          winner: goldWinner,
          silverWinner: silverWinner
        }),
        updatedAt: serverTimestamp()
      });
    });

    // Note: Ranking updates are applied by the Cloud Function (onTournamentComplete)
    return true;
  } catch (error) {
    console.error('❌ Error completing final stage:', error);
    return false;
  }
}


/**
 * Check if all matches in a round type are complete
 */
function isRoundComplete(bracket: BracketWithConfig, roundType: ConsolationSource): boolean {
  const totalRounds = bracket.totalRounds;
  const roundOffsets: Record<ConsolationSource, number> = { 'QF': 3, 'R16': 4, 'R32': 5, 'R64': 6 };
  const targetRoundIndex = totalRounds - roundOffsets[roundType];

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
function getByePositionsInRound(bracket: BracketWithConfig, roundType: ConsolationSource): number[] {
  const totalRounds = bracket.totalRounds;
  const roundOffsets: Record<ConsolationSource, number> = { 'QF': 3, 'R16': 4, 'R32': 5, 'R64': 6 };
  const targetRoundIndex = totalRounds - roundOffsets[roundType];

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
 * Count real participants (non-BYE) in a bracket's first round
 */
function countRealParticipants(bracket: BracketWithConfig): number {
  if (!bracket.rounds || bracket.rounds.length === 0) return 0;

  const firstRound = bracket.rounds[0];
  let count = 0;
  for (const match of firstRound.matches) {
    if (match.participantA && !isBye(match.participantA)) count++;
    if (match.participantB && !isBye(match.participantB)) count++;
  }
  return count;
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
  consolationEnabled: boolean,
  positionOffset: number = 0
): Promise<BracketWithConfig> {
  // Check if consolation is enabled
  if (!consolationEnabled) {
    return bracket;
  }

  const updatedBracket = JSON.parse(JSON.stringify(bracket)) as BracketWithConfig;
  const bracketSize = nextPowerOfTwo(Math.pow(2, bracket.totalRounds));
  const realParticipants = countRealParticipants(bracket);
  const available = getAvailableConsolationSources(bracketSize, realParticipants);

  // Initialize consolationBrackets array if needed
  if (!updatedBracket.consolationBrackets) {
    updatedBracket.consolationBrackets = [];
  }

  // Helper to get losers with their match positions and seeds
  function getLosersWithPositions(roundType: ConsolationSource): { loserId: string; matchPosition: number; seed?: number }[] {
    const totalRounds = bracket.totalRounds;
    const roundOffsets: Record<ConsolationSource, number> = { 'QF': 3, 'R16': 4, 'R32': 5, 'R64': 6 };
    const targetRoundIndex = totalRounds - roundOffsets[roundType];

    if (targetRoundIndex < 0 || targetRoundIndex >= bracket.rounds.length) {
      return [];
    }

    const round = bracket.rounds[targetRoundIndex];
    const losers: { loserId: string; matchPosition: number; seed?: number }[] = [];

    for (let i = 0; i < round.matches.length; i++) {
      const match = round.matches[i];
      if ((match.status === 'COMPLETED' || match.status === 'WALKOVER') && match.winner) {
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
        // If match is completed/walkover with a winner, advance to next round
        if ((match.status === 'COMPLETED' || match.status === 'WALKOVER') && match.winner && match.nextMatchId) {
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

    // Cascade BYE wins through subsequent rounds (auto-complete matches where opponent is BYE)
    const cascaded = cascadeByeWins(consolation);
    consolation.rounds = cascaded.rounds;
    consolation.isComplete = cascaded.isComplete;

    // Log the result after updates
    consolation.rounds.forEach((round, rIdx) => {
      round.matches.forEach((m, i) => {
      });
    });
  }

  // Check QF consolation - generate if missing and round is complete (legacy support)
  // Uses generateConsolationBracketStructure which handles BYEs properly (not exact-count legacy)
  // Check each consolation round - generate if missing and round is complete (legacy support)
  // Uses generateConsolationBracketStructure which handles BYEs properly
  for (const roundType of ['R64', 'R32', 'R16', 'QF'] as ConsolationSource[]) {
    const key = `has${roundType}` as keyof typeof available;
    if (available[key] && isRoundComplete(bracket, roundType)) {
      const existing = updatedBracket.consolationBrackets.find(c => c.source === roundType);
      if (!existing) {
        const byePositions = getByePositionsInRound(bracket, roundType);
        const newBracket = generateConsolationBracketStructure(bracketSize, roundType, byePositions, bracketType, positionOffset);
        if (newBracket.rounds.length > 0) {
          const losers = getLosersWithPositions(roundType);
          for (const { loserId, matchPosition, seed } of losers) {
            const updated = replaceLoserPlaceholder(newBracket, roundType, matchPosition, loserId, seed);
            newBracket.rounds = updated.rounds;
          }
          const cascaded = cascadeByeWins(newBracket);
          newBracket.rounds = cascaded.rounds;
          newBracket.isComplete = cascaded.isComplete;
          updatedBracket.consolationBrackets.push(newBracket);
        }
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
  const bracketSize = nextPowerOfTwo(Math.pow(2, bracket.totalRounds));
  const realParticipants = countRealParticipants(bracket);
  const available = getAvailableConsolationSources(bracketSize, realParticipants);

  // Check round completion
  const roundOffsets: Record<ConsolationSource, number> = { 'QF': 3, 'R16': 4, 'R32': 5, 'R64': 6 };
  for (const roundType of ['R64', 'R32', 'R16', 'QF'] as ConsolationSource[]) {
    const key = `has${roundType}` as keyof typeof available;
    if (available[key]) {
      const roundIndex = bracket.totalRounds - roundOffsets[roundType];
      if (roundIndex >= 0 && roundIndex < bracket.rounds.length) {
        const round = bracket.rounds[roundIndex];
        round.matches.forEach((m, i) => {
        });
        const complete = isRoundComplete(bracket, roundType);
      }
    }
  }

  // Fallback for consolationEnabled - check multiple locations due to migration
  const consolationEnabled = Boolean(
    tournament.finalStage.consolationEnabled ??
    (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled '] ??
    (bracket.config as unknown as Record<string, unknown>)?.consolationEnabled
  );


  if (!consolationEnabled) {
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
        }
      }
    }
    if (matchMap.size > 0) {
      existingMatchesMap.set(consolation.source, matchMap);
    }
  }


  // For silver bracket, offset consolation positions by gold participant count
  const positionOffset = bracketType === 'silver' && tournament.finalStage.goldBracket
    ? countRealParticipants(tournament.finalStage.goldBracket as BracketWithConfig)
    : 0;

  updatedBracket.consolationBrackets = [];

  for (const roundType of ['R64', 'R32', 'R16', 'QF'] as ConsolationSource[]) {
    const key = `has${roundType}` as keyof typeof available;
    if (available[key]) {
      const byePositions = getByePositionsInRound(updatedBracket, roundType);
      const newBracket = generateConsolationBracketStructure(bracketSize, roundType, byePositions, bracketType, positionOffset);

      // Restore completed matches
      const completedMatches = existingMatchesMap.get(roundType);
      if (completedMatches && completedMatches.size > 0) {
        for (const round of newBracket.rounds) {
          for (let i = 0; i < round.matches.length; i++) {
            const existingMatch = completedMatches.get(round.matches[i].id);
            if (existingMatch) {
              round.matches[i] = existingMatch;
            }
          }
        }
      }

      updatedBracket.consolationBrackets.push(newBracket);
    }
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

    const silverBracket = bracketType === 'gold'
      ? tournament.finalStage.silverBracket as BracketWithConfig | null
      : null;
    const goldBracketForTables = bracketType === 'gold'
      ? updatedBracket
      : tournament.finalStage.goldBracket as BracketWithConfig;

    const tableHistory = buildTableHistory(tournament);

    if (bracketType === 'gold') {
      assignTablesToConsolation(updatedBracket, silverBracket, numTables, tableHistory);
    } else {
      assignTablesToConsolation(goldBracketForTables, updatedBracket, numTables, tableHistory);
    }

    // Log assigned tables

    // Update tournament with new/updated bracket
    const updatePath = bracketType === 'gold' ? 'finalStage.goldBracket' : 'finalStage.silverBracket';
    await updateTournament(tournamentId, { [updatePath]: updatedBracket });

    return true;
  }

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
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage) throw new Error('Final stage not found');

      const bracket = bracketType === 'gold'
        ? tournament.finalStage.goldBracket
        : tournament.finalStage.silverBracket;

      if (!bracket || !bracket.consolationBrackets) {
        throw new Error('Bracket or consolation brackets not found');
      }

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
            const existing = round.matches[matchIndex];
            if (cleanResult.completedAt) {
              cleanResult.duration = existing.startedAt ? cleanResult.completedAt - existing.startedAt : 0;
            }
            round.matches[matchIndex] = {
              ...existing,
              ...cleanResult
            };
            matchUpdated = true;
            break;
          }
        }
        if (matchUpdated) break;
      }

      if (!matchUpdated) {
        throw new Error('Match not found in consolation brackets');
      }

      // Atomic write
      const cleanedFinalStage = cleanUndefined({
        ...tournament.finalStage,
        [bracketType === 'gold' ? 'goldBracket' : 'silverBracket']: bracket
      });
      transaction.update(tournamentRef, {
        finalStage: cleanedFinalStage,
        updatedAt: serverTimestamp()
      });
    });

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
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage) throw new Error('Final stage not found');

      const bracket = bracketType === 'gold'
        ? tournament.finalStage.goldBracket
        : tournament.finalStage.silverBracket;

      if (!bracket || !bracket.consolationBrackets) {
        throw new Error('Bracket or consolation brackets not found');
      }

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
        throw new Error('Match not found in any consolation bracket');
      }

      // Advance winner (and loser if provided) using algorithm
      const updatedConsolation = advanceConsolationWinnerAlgorithm(
        bracket.consolationBrackets[consolationIndex],
        matchId,
        winnerId,
        loserId
      );

      bracket.consolationBrackets[consolationIndex] = updatedConsolation;

      // Assign tables to any newly playable consolation matches (with full history)
      const numTables = tournament.numTables || 4;
      const goldBracket = bracketType === 'gold' ? bracket : tournament.finalStage.goldBracket;
      const silverBracket = bracketType === 'silver' ? bracket : tournament.finalStage.silverBracket;
      const tableHistory = buildTableHistory(tournament);
      assignTablesToConsolation(goldBracket!, silverBracket || null, numTables, tableHistory);

      // Check if tournament is complete
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

      // Build update data
      const updateData: any = {
        finalStage: cleanUndefined({
          ...tournament.finalStage,
          [bracketType === 'gold' ? 'goldBracket' : 'silverBracket']: bracket,
          isComplete: isTournamentComplete
        }),
        updatedAt: serverTimestamp()
      };

      const wasAlreadyCompleted = tournament.status === 'COMPLETED';

      if (isTournamentComplete && !wasAlreadyCompleted) {
        updateData.status = 'COMPLETED';
        updateData.completedAt = Date.now();

        const tournamentWithUpdatedBracket = {
          ...tournament,
          finalStage: {
            ...tournament.finalStage,
            [bracketType === 'gold' ? 'goldBracket' : 'silverBracket']: bracket,
            isComplete: true
          }
        };
        updateData.participants = cleanUndefined(calculateFinalPositionsForTournament(tournamentWithUpdatedBracket));
        // Note: Ranking updates are applied by the Cloud Function (onTournamentComplete)
      }

      transaction.update(tournamentRef, updateData);
    });

    return true;
  } catch (error) {
    console.error('Error advancing consolation winner:', error);
    return false;
  }
}

/**
 * Check if all matches in a consolation bracket's final round are completed
 * This is a fallback check when isComplete flag might not be set
 */
function areAllConsolationMatchesCompleted(consolation: { rounds: Array<{ matches: BracketMatch[] }>; isComplete?: boolean }): boolean {
  if (!consolation.rounds || consolation.rounds.length === 0) return true;

  // Check ALL matches in ALL rounds (not just final round)
  for (const round of consolation.rounds) {
    for (const match of round.matches) {
      if (match.status !== 'COMPLETED' && match.status !== 'WALKOVER') {
        return false;
      }
    }
  }
  return true;
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
    const realParticipants = countRealParticipants(bracket);
    const available = getAvailableConsolationSources(bracketSize, realParticipants);

    // If we should have consolation brackets but don't, return false
    for (const roundType of ['R64', 'R32', 'R16', 'QF'] as ConsolationSource[]) {
      const key = `has${roundType}` as keyof typeof available;
      if (available[key] && isRoundComplete(bracket, roundType)) return false;
    }
    return true;
  }

  // Check each consolation bracket, auto-fixing isComplete flag if all matches are done
  for (const c of bracket.consolationBrackets) {
    if (!c.isComplete && areAllConsolationMatchesCompleted(c)) {
      c.isComplete = true;
    }
  }

  return bracket.consolationBrackets.every(c => c.isComplete);
}

/**
 * Complete a bracket match and advance the winner in a SINGLE atomic transaction.
 * This eliminates stale reads and partial-failure risks from the two-transaction pattern.
 *
 * Handles all bracket types: gold main, silver main, gold consolation, silver consolation.
 */
export async function completeBracketMatchAndAdvance(
  tournamentId: string,
  matchId: string,
  result: Partial<BracketMatch>
): Promise<boolean> {
  if (!db) return false;

  const callId = Math.random().toString(36).substring(2, 8);

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);
    let txAttempt = 0;

    await runTransaction(db, async (transaction) => {
      txAttempt++;
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.finalStage) throw new Error('Final stage not found');

      const consolationEnabled = Boolean(
        tournament.finalStage.consolationEnabled
        ?? (tournament.finalStage as unknown as Record<string, unknown>)['consolationEnabled ']
      );

      // --- Phase 1: Clean result and prepare merge helper ---
      const cleanResult: Partial<BracketMatch> = {};
      Object.entries(result).forEach(([key, value]) => {
        if (value !== undefined) {
          (cleanResult as any)[key] = value;
        }
      });

      if (result.status === 'COMPLETED' || result.status === 'WALKOVER') {
        cleanResult.completedAt = Date.now();
      }

      const mergeMatch = (existing: BracketMatch): BracketMatch => {
        if (cleanResult.completedAt) {
          cleanResult.duration = existing.startedAt ? cleanResult.completedAt - existing.startedAt : 0;
        }
        if ((result.status === 'COMPLETED' || result.status === 'WALKOVER') && existing.tableNumber) {
          cleanResult.playedOnTable = existing.tableNumber;
        }
        const merged = { ...existing, ...cleanResult };
        // Clear tableNumber on completion/walkover (table is now free) - use delete instead of undefined
        if (result.status === 'COMPLETED' || result.status === 'WALKOVER') {
          delete (merged as any).tableNumber;
        }
        return merged;
      };

      // --- Phase 1.5: Check if match is already completed (prevents duplicate processing from stale cache) ---
      {
        let existingMatch: BracketMatch | undefined;
        const gb = tournament.finalStage.goldBracket;
        const sb = tournament.finalStage.silverBracket;
        if (gb) {
          if (gb.thirdPlaceMatch?.id === matchId) existingMatch = gb.thirdPlaceMatch;
          if (!existingMatch) {
            for (const r of gb.rounds) { existingMatch = r.matches.find(m => m.id === matchId); if (existingMatch) break; }
          }
          if (!existingMatch && gb.consolationBrackets) {
            for (const c of gb.consolationBrackets) { for (const r of c.rounds) { existingMatch = r.matches.find(m => m.id === matchId); if (existingMatch) break; } if (existingMatch) break; }
          }
        }
        if (!existingMatch && sb) {
          if (sb.thirdPlaceMatch?.id === matchId) existingMatch = sb.thirdPlaceMatch;
          if (!existingMatch) {
            for (const r of sb.rounds) { existingMatch = r.matches.find(m => m.id === matchId); if (existingMatch) break; }
          }
          if (!existingMatch && sb.consolationBrackets) {
            for (const c of sb.consolationBrackets) { for (const r of c.rounds) { existingMatch = r.matches.find(m => m.id === matchId); if (existingMatch) break; } if (existingMatch) break; }
          }
        }
        if (existingMatch && (existingMatch.status === 'COMPLETED' || existingMatch.status === 'WALKOVER')) {
          return;
        }
      }

      // --- Phase 2: Detect match location and update it ---
      type MatchLocation = 'gold' | 'silver' | 'gold_consolation' | 'silver_consolation';
      let location: MatchLocation | null = null;
      let consolationBracketIndex = -1;
      let loserId: string | undefined;

      // Check gold bracket (main + 3rd place)
      const goldBracket = tournament.finalStage.goldBracket;
      if (goldBracket) {
        if (goldBracket.thirdPlaceMatch?.id === matchId) {
          goldBracket.thirdPlaceMatch = mergeMatch(goldBracket.thirdPlaceMatch);
          location = 'gold';
        } else {
          for (const round of goldBracket.rounds) {
            const idx = round.matches.findIndex(m => m.id === matchId);
            if (idx !== -1) {
              round.matches[idx] = mergeMatch(round.matches[idx]);
              location = 'gold';
              break;
            }
          }
        }

        // Check gold consolation brackets
        if (!location && consolationEnabled && goldBracket.consolationBrackets) {
          for (let i = 0; i < goldBracket.consolationBrackets.length; i++) {
            for (const round of goldBracket.consolationBrackets[i].rounds) {
              const idx = round.matches.findIndex(m => m.id === matchId);
              if (idx !== -1) {
                const existing = round.matches[idx];
                if (result.winner && existing.participantA && existing.participantB) {
                  loserId = result.winner === existing.participantA ? existing.participantB : existing.participantA;
                }
                round.matches[idx] = mergeMatch(existing);
                location = 'gold_consolation';
                consolationBracketIndex = i;
                break;
              }
            }
            if (location) break;
          }
        }
      }

      // Check silver bracket (main + 3rd place)
      const silverBracket = tournament.finalStage.silverBracket;
      if (!location && silverBracket) {
        if (silverBracket.thirdPlaceMatch?.id === matchId) {
          silverBracket.thirdPlaceMatch = mergeMatch(silverBracket.thirdPlaceMatch);
          location = 'silver';
        } else {
          for (const round of silverBracket.rounds) {
            const idx = round.matches.findIndex(m => m.id === matchId);
            if (idx !== -1) {
              round.matches[idx] = mergeMatch(round.matches[idx]);
              location = 'silver';
              break;
            }
          }
        }

        // Check silver consolation brackets
        if (!location && consolationEnabled && silverBracket.consolationBrackets) {
          for (let i = 0; i < silverBracket.consolationBrackets.length; i++) {
            for (const round of silverBracket.consolationBrackets[i].rounds) {
              const idx = round.matches.findIndex(m => m.id === matchId);
              if (idx !== -1) {
                const existing = round.matches[idx];
                if (result.winner && existing.participantA && existing.participantB) {
                  loserId = result.winner === existing.participantA ? existing.participantB : existing.participantA;
                }
                round.matches[idx] = mergeMatch(existing);
                location = 'silver_consolation';
                consolationBracketIndex = i;
                break;
              }
            }
            if (location) break;
          }
        }
      }

      if (!location) {
        throw new Error('Match not found in any bracket');
      }

      // --- Phase 3: Advance winner if applicable ---
      const winnerId = result.winner;
      if (winnerId) {
        const numTables = tournament.numTables || 4;
        const tableHistory = buildTableHistory(tournament);

        if (location === 'gold' && goldBracket) {
          // Advance in gold bracket
          const updatedBracketRaw = advanceWinnerAlgorithm(goldBracket, matchId, winnerId);
          let updatedGoldBracket: BracketWithConfig = {
            ...updatedBracketRaw,
            config: goldBracket.config,
            consolationBrackets: goldBracket.consolationBrackets
          };

          updatedGoldBracket = await checkAndGenerateConsolation(tournamentId, updatedGoldBracket, 'gold', consolationEnabled);
          assignTablesToBrackets(updatedGoldBracket, silverBracket || null, numTables, tableHistory);
          if (consolationEnabled) {
            assignTablesToConsolation(updatedGoldBracket, silverBracket as BracketWithConfig | null, numTables, tableHistory);
          }

          tournament.finalStage.goldBracket = updatedGoldBracket;

        } else if (location === 'silver' && silverBracket) {
          // Advance in silver bracket
          const updatedBracketRaw = advanceWinnerAlgorithm(silverBracket, matchId, winnerId);
          let updatedSilverBracket: BracketWithConfig = {
            ...updatedBracketRaw,
            config: silverBracket.config,
            consolationBrackets: silverBracket.consolationBrackets
          };

          const silverConsoOffset2 = goldBracket ? countRealParticipants(goldBracket as BracketWithConfig) : 0;
          updatedSilverBracket = await checkAndGenerateConsolation(tournamentId, updatedSilverBracket, 'silver', consolationEnabled, silverConsoOffset2);
          assignTablesToBrackets(goldBracket!, updatedSilverBracket, numTables, tableHistory);
          if (consolationEnabled) {
            assignTablesToConsolation(goldBracket as BracketWithConfig, updatedSilverBracket, numTables, tableHistory);
          }

          tournament.finalStage.silverBracket = updatedSilverBracket;

        } else if (location === 'gold_consolation' && goldBracket?.consolationBrackets) {
          // Advance in gold consolation
          const updatedConsolation = advanceConsolationWinnerAlgorithm(
            goldBracket.consolationBrackets[consolationBracketIndex],
            matchId, winnerId, loserId
          );
          goldBracket.consolationBrackets[consolationBracketIndex] = updatedConsolation;
          assignTablesToConsolation(goldBracket, silverBracket || null, numTables, tableHistory);

        } else if (location === 'silver_consolation' && silverBracket?.consolationBrackets) {
          // Advance in silver consolation
          const updatedConsolation = advanceConsolationWinnerAlgorithm(
            silverBracket.consolationBrackets[consolationBracketIndex],
            matchId, winnerId, loserId
          );
          silverBracket.consolationBrackets[consolationBracketIndex] = updatedConsolation;
          assignTablesToConsolation(goldBracket!, silverBracket, numTables, tableHistory);
        }
      }

      // --- Phase 4: Check tournament completion ---
      const updatedGold = tournament.finalStage.goldBracket;
      const updatedSilver = tournament.finalStage.silverBracket;
      const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';

      const isGoldMainComplete = isBracketComplete(updatedGold);
      const isGoldConsolationComplete = areConsolationBracketsComplete(updatedGold, consolationEnabled);
      const isGoldComplete = isGoldMainComplete && isGoldConsolationComplete;

      const isSilverMainComplete = !isSplitDivisions || isBracketComplete(updatedSilver);
      const isSilverConsolationComplete = !isSplitDivisions || areConsolationBracketsComplete(updatedSilver, consolationEnabled);
      const isSilverComplete = isSilverMainComplete && isSilverConsolationComplete;

      const isTournamentComplete = isGoldComplete && isSilverComplete;

      // Get winners for update
      const goldFinalRound = updatedGold?.rounds[updatedGold.rounds.length - 1];
      const goldFinalMatch = goldFinalRound?.matches[0];
      const goldWinner = (goldFinalMatch?.status === 'COMPLETED' || goldFinalMatch?.status === 'WALKOVER')
        ? goldFinalMatch.winner : undefined;

      let silverWinner: string | undefined;
      if (isSplitDivisions && updatedSilver) {
        const silverFinalRound = updatedSilver.rounds[updatedSilver.rounds.length - 1];
        const silverFinalMatch = silverFinalRound?.matches[0];
        silverWinner = (silverFinalMatch?.status === 'COMPLETED' || silverFinalMatch?.status === 'WALKOVER')
          ? silverFinalMatch.winner : undefined;
      }

      // --- Phase 5: Build and execute atomic write ---
      const updateData: any = {
        finalStage: cleanUndefined({
          ...tournament.finalStage,
          isComplete: isTournamentComplete,
          winner: goldWinner,
          silverWinner: silverWinner
        }),
        updatedAt: serverTimestamp()
      };

      const wasAlreadyCompleted = tournament.status === 'COMPLETED';

      if (isTournamentComplete && !wasAlreadyCompleted) {
        updateData.status = 'COMPLETED';
        updateData.completedAt = Date.now();

        const tournamentWithComplete = {
          ...tournament,
          finalStage: { ...tournament.finalStage, isComplete: true }
        };
        updateData.participants = cleanUndefined(calculateFinalPositionsForTournament(tournamentWithComplete));
        // Note: Ranking updates are applied by the Cloud Function (onTournamentComplete)
      }

      transaction.update(tournamentRef, updateData);
    });

    return true;
  } catch (error) {
    console.error(`❌ Error completing bracket match [${callId}]:`, error);
    return false;
  }
}
