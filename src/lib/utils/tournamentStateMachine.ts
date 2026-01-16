/**
 * Tournament state machine
 * Manages tournament lifecycle transitions
 */

import { getTournament, updateTournament } from '$lib/firebase/tournaments';
import { generateBracket } from '$lib/firebase/tournamentBracket';
import { calculateFinalPositions, applyRankingUpdates, syncParticipantRankings } from '$lib/firebase/tournamentRanking';
import type { TournamentStatus } from '$lib/types/tournament';

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT: ['GROUP_STAGE', 'FINAL_STAGE', 'CANCELLED'],
  GROUP_STAGE: ['TRANSITION', 'CANCELLED'],
  TRANSITION: ['FINAL_STAGE', 'CANCELLED'],
  FINAL_STAGE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

/**
 * Check if transition is valid
 *
 * @param currentStatus Current tournament status
 * @param nextStatus Next tournament status
 * @returns true if transition is valid
 */
export function canTransition(
  currentStatus: TournamentStatus,
  nextStatus: TournamentStatus
): boolean {
  return VALID_TRANSITIONS[currentStatus]?.includes(nextStatus) || false;
}

/**
 * Transition tournament to new status
 *
 * @param tournamentId Tournament ID
 * @param nextStatus Next status
 * @returns true if successful
 */
export async function transitionTournament(
  tournamentId: string,
  nextStatus: TournamentStatus
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  // Check if transition is valid
  if (!canTransition(tournament.status, nextStatus)) {
    console.error(`Invalid transition from ${tournament.status} to ${nextStatus}`);
    return false;
  }

  // Execute transition logic
  switch (`${tournament.status}->${nextStatus}`) {
    case 'DRAFT->GROUP_STAGE':
      return await startGroupStage(tournamentId);

    case 'DRAFT->FINAL_STAGE':
      return await startFinalStage(tournamentId);

    case 'GROUP_STAGE->TRANSITION':
      return await enterTransition(tournamentId);

    case 'TRANSITION->FINAL_STAGE':
      return await startFinalStage(tournamentId);

    case 'FINAL_STAGE->COMPLETED':
      return await completeTournament(tournamentId);

    default:
      // Simple status update (e.g., cancellation)
      return await updateTournament(tournamentId, { status: nextStatus });
  }
}

/**
 * Start group stage
 *
 * Validates:
 * - Minimum 4 participants
 * - Generates schedule/pairings
 * - Snapshots ranking
 */
async function startGroupStage(tournamentId: string): Promise<boolean> {
  let tournament = await getTournament(tournamentId);
  if (!tournament) return false;

  // Validate minimum participants
  if (tournament.participants.length < 2) {
    console.error('Tournament requires at least 2 participants');
    return false;
  }

  // Sync participant rankings from user profiles
  // This ensures we use their current accumulated ranking points
  if (tournament.rankingConfig?.enabled) {
    console.log('📊 Syncing participant rankings from user profiles...');
    await syncParticipantRankings(tournamentId);
    // Re-fetch tournament to get updated rankingSnapshots
    const refreshedTournament = await getTournament(tournamentId);
    if (refreshedTournament) {
      tournament = refreshedTournament;
    }
  }

  // Use participants as-is (no expected positions calculation needed with new tier system)
  let updatedParticipants = tournament.participants;

  // Generate schedule based on type (in-memory only, don't update yet)
  let groupStage;

  // Get configuration from groupStage object or legacy fields
  const existingGroupStage = tournament.groupStage;
  const groupStageType = existingGroupStage?.type || 'ROUND_ROBIN';
  const numGroups = existingGroupStage?.numGroups || tournament.numGroups || 1;
  const numSwissRounds = existingGroupStage?.numSwissRounds || tournament.numSwissRounds || 3;

  // Get game configuration from groupStage
  const gameMode = existingGroupStage?.gameMode || 'rounds';
  const pointsToWin = existingGroupStage?.pointsToWin || 7;
  const roundsToPlay = existingGroupStage?.roundsToPlay || 4;
  const matchesToWin = existingGroupStage?.matchesToWin || 1;

  if (groupStageType === 'ROUND_ROBIN') {
    // Import and generate schedule
    const { splitIntoGroups, generateRoundRobinSchedule: generateRRSchedule, assignTablesGlobally } = await import('$lib/algorithms/roundRobin');
    const groups = splitIntoGroups(updatedParticipants, numGroups);

    // Generate schedule for each group (without table assignment yet)
    for (const group of groups) {
      const rounds = generateRRSchedule(group.participants);
      group.schedule = rounds;

      // Initialize standings
      group.standings = group.participants.map(participantId => ({
        participantId,
        position: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        matchesTied: 0,
        points: 0,
        total20s: 0,
        totalPointsScored: 0,
        qualifiedForFinal: false
      }));
    }

    // Assign tables GLOBALLY across all groups
    // This ensures no table is used twice in the same round across any group
    assignTablesGlobally(groups, tournament.numTables);

    const totalRounds = groups[0]?.schedule?.length || 0;
    groupStage = {
      type: 'ROUND_ROBIN' as const,
      groups,
      currentRound: 1,
      totalRounds,
      isComplete: false,
      gameMode,
      pointsToWin: gameMode === 'points' ? pointsToWin : undefined,
      roundsToPlay: gameMode === 'rounds' ? roundsToPlay : undefined,
      matchesToWin,
      numGroups
    };
  } else if (groupStageType === 'SWISS') {
    // For Swiss, generate first round
    const { generateSwissPairings: generateSwissAlg, assignTablesWithVariety } = await import('$lib/algorithms/swiss');
    const matches = generateSwissAlg(updatedParticipants, [], [], 1);
    const matchesWithTables = assignTablesWithVariety(matches, tournament.numTables, new Map());

    // Initialize single group for Swiss
    const group = {
      id: 'swiss-group',
      name: 'Sistema Suizo',
      participants: updatedParticipants.map(p => p.id),
      pairings: [{
        roundNumber: 1,
        matches: matchesWithTables
      }],
      standings: updatedParticipants.map(participantId => ({
        participantId: participantId.id,
        position: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        matchesTied: 0,
        points: 0,
        total20s: 0,
        totalPointsScored: 0,
        qualifiedForFinal: false
      }))
    };

    groupStage = {
      type: 'SWISS' as const,
      groups: [group],
      currentRound: 1,
      totalRounds: numSwissRounds,
      isComplete: false,
      gameMode,
      pointsToWin: gameMode === 'points' ? pointsToWin : undefined,
      roundsToPlay: gameMode === 'rounds' ? roundsToPlay : undefined,
      matchesToWin,
      numSwissRounds
    };
  }

  if (!groupStage) {
    console.error('Failed to generate schedule');
    return false;
  }

  // Single update with all changes
  return await updateTournament(tournamentId, {
    participants: updatedParticipants,
    groupStage,
    status: 'GROUP_STAGE',
    startedAt: Date.now()
  });
}

/**
 * Enter transition phase
 *
 * Validates:
 * - All group matches completed
 * - Standings finalized
 */
async function enterTransition(tournamentId: string): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.groupStage) return false;

  // Verify all matches are complete
  // Ensure groups is an array (Firestore may return object)
  const groups = Array.isArray(tournament.groupStage.groups)
    ? tournament.groupStage.groups
    : Object.values(tournament.groupStage.groups) as typeof tournament.groupStage.groups;

  for (const group of groups) {
    // Ensure schedule/pairings are arrays
    const schedule = group.schedule
      ? Array.isArray(group.schedule)
        ? group.schedule
        : Object.values(group.schedule) as typeof group.schedule
      : null;

    const pairings = group.pairings
      ? Array.isArray(group.pairings)
        ? group.pairings
        : Object.values(group.pairings) as typeof group.pairings
      : null;

    const matches = schedule
      ? schedule.flatMap((r: any) => {
          const roundMatches = r.matches;
          return Array.isArray(roundMatches) ? roundMatches : Object.values(roundMatches || {});
        })
      : pairings
      ? pairings.flatMap((p: any) => {
          const pairingMatches = p.matches;
          return Array.isArray(pairingMatches) ? pairingMatches : Object.values(pairingMatches || {});
        })
      : [];

    const incompleteMatches = matches.filter(
      (m: any) => m.status !== 'COMPLETED' && m.status !== 'WALKOVER'
    );

    if (incompleteMatches.length > 0) {
      console.error(`Group ${group.name} has ${incompleteMatches.length} incomplete matches`);
      return false;
    }
  }

  // Update status
  return await updateTournament(tournamentId, {
    status: 'TRANSITION',
    groupStage: {
      ...tournament.groupStage,
      isComplete: true
    }
  });
}

/**
 * Start final stage
 *
 * Validates:
 * - Generates bracket
 * - Seeds participants
 */
async function startFinalStage(tournamentId: string): Promise<boolean> {
  let tournament = await getTournament(tournamentId);
  if (!tournament) return false;

  // For ONE_PHASE tournaments, sync rankings here
  // (For TWO_PHASE, this is done in startGroupStage)
  if (tournament.phaseType === 'ONE_PHASE' && tournament.rankingConfig?.enabled) {
    console.log('📊 [ONE_PHASE] Syncing participant rankings from user profiles...');
    await syncParticipantRankings(tournamentId);

    // Re-fetch tournament to get updated rankingSnapshots
    const refreshedTournament = await getTournament(tournamentId);
    if (refreshedTournament) {
      tournament = refreshedTournament;
    }
  }

  // Generate bracket
  const bracketSuccess = await generateBracket(tournamentId);
  if (!bracketSuccess) {
    console.error('Failed to generate bracket');
    return false;
  }

  // Update status
  return await updateTournament(tournamentId, {
    status: 'FINAL_STAGE'
  });
}

/**
 * Complete tournament
 *
 * Validates:
 * - Final match completed
 * - Calculates ranking points
 * - Applies ranking updates to user profiles
 */
async function completeTournament(tournamentId: string): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.finalStage) return false;

  // Verify final is complete
  const finalRound = tournament.finalStage.bracket.rounds[tournament.finalStage.bracket.rounds.length - 1];
  const finalMatch = finalRound?.matches[0];

  if (!finalMatch || (finalMatch.status !== 'COMPLETED' && finalMatch.status !== 'WALKOVER')) {
    console.error('Final match is not complete');
    return false;
  }

  // Calculate final positions
  const positionsSuccess = await calculateFinalPositions(tournamentId);
  if (!positionsSuccess) {
    console.warn('Failed to calculate final positions');
  }

  // Apply ranking updates
  if (tournament.rankingConfig?.enabled) {
    const rankingSuccess = await applyRankingUpdates(tournamentId);
    if (!rankingSuccess) {
      console.warn('Failed to apply ranking updates');
    }
  }

  // Update status
  return await updateTournament(tournamentId, {
    status: 'COMPLETED',
    completedAt: Date.now()
  });
}

/**
 * Get editable fields for current status
 *
 * @param status Tournament status
 * @returns Array of editable field names
 */
export function getEditableFields(status: TournamentStatus): string[] {
  const EDITABLE_FIELDS: Record<TournamentStatus, string[]> = {
    DRAFT: [
      'name',
      'description',
      'phaseType',
      'groupStageType',
      'gameMode',
      'gameType',
      'pointsToWin',
      'roundsToPlay',
      'matchesToWin',
      'show20s',
      'showHammer',
      'numTables',
      'numGroups',
      'numSwissRounds',
      'participants',
      'rankingConfig'
    ],
    GROUP_STAGE: ['match results', 'no-show', 'tableAssignment'],
    TRANSITION: ['qualifiers'],
    FINAL_STAGE: ['match results', 'no-show', 'tableAssignment'],
    COMPLETED: [],
    CANCELLED: []
  };

  return EDITABLE_FIELDS[status] || [];
}

/**
 * Check if field is editable in current status
 *
 * @param status Tournament status
 * @param fieldName Field name
 * @returns true if editable
 */
export function canEditField(status: TournamentStatus, fieldName: string): boolean {
  return getEditableFields(status).includes(fieldName);
}
