/**
 * Test tournament factory
 *
 * Creates realistic tournament data for concurrency tests.
 * Uses the REAL generateRoundRobinSchedule algorithm.
 */

import type {
  Tournament,
  TournamentParticipant,
  GroupStage,
  Group,
  GroupMatch,
  GroupStanding
} from '$lib/types/tournament';
import { generateRoundRobinSchedule } from '$lib/algorithms/roundRobin';

interface CreateTestTournamentOptions {
  numParticipants: number;
  type?: 'ROUND_ROBIN' | 'SWISS';
  gameMode?: 'points' | 'rounds';
  numTables?: number;
}

/**
 * Create a complete test tournament with all matches IN_PROGRESS
 */
export function createTestTournament(options: CreateTestTournamentOptions): Tournament {
  const {
    numParticipants,
    type = 'ROUND_ROBIN',
    gameMode = 'rounds',
    numTables = 4
  } = options;

  // Create participants
  const participants: TournamentParticipant[] = [];
  const participantIds: string[] = [];
  for (let i = 0; i < numParticipants; i++) {
    const id = `player-${i + 1}`;
    participantIds.push(id);
    participants.push({
      id,
      type: 'GUEST',
      name: `Player ${i + 1}`,
      status: 'ACTIVE',
      rankingSnapshot: 1000 - i * 10
    });
  }

  // Generate schedule using the REAL algorithm
  const schedule = generateRoundRobinSchedule(participantIds);

  // Set all non-BYE matches to IN_PROGRESS with table numbers
  let tableCounter = 1;
  const now = Date.now();
  for (const round of schedule) {
    for (const match of round.matches) {
      if (match.participantB !== 'BYE' && match.status === 'PENDING') {
        match.status = 'IN_PROGRESS';
        match.startedAt = now - 600000; // Started 10 min ago
        match.tableNumber = ((tableCounter - 1) % numTables) + 1;
        tableCounter++;
      }
    }
  }

  // Initialize empty standings
  const standings: GroupStanding[] = participantIds.map(id => ({
    participantId: id,
    position: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    matchesTied: 0,
    points: 0,
    total20s: 0,
    totalPointsScored: 0,
    qualifiedForFinal: false,
    headToHeadRecord: {}
  }));

  const group: Group = {
    id: 'group-1',
    name: 'Grupo A',
    participants: participantIds,
    schedule,
    standings
  };

  const groupStage: GroupStage = {
    type,
    groups: [group],
    currentRound: 1,
    totalRounds: schedule.length,
    isComplete: false,
    gameMode,
    pointsToWin: gameMode === 'points' ? 7 : undefined,
    roundsToPlay: gameMode === 'rounds' ? 4 : undefined,
    matchesToWin: 1
  };

  return {
    id: 'test-tournament-1',
    key: 'TEST01',
    name: 'Test Concurrency Tournament',
    country: 'ES',
    city: 'Barcelona',
    status: 'GROUP_STAGE',
    phaseType: 'GROUP_ONLY',
    gameType: 'singles',
    show20s: true,
    showHammer: false,
    numTables,
    rankingConfig: { enabled: false },
    participants,
    groupStage,
    createdAt: now - 3600000,
    createdBy: { userId: 'admin-1', userName: 'Admin' },
    updatedAt: now
  };
}

/**
 * Get all IN_PROGRESS matches (excluding BYEs)
 */
export function getInProgressMatches(tournament: Tournament): GroupMatch[] {
  const matches: GroupMatch[] = [];
  const group = tournament.groupStage?.groups[0];
  if (!group?.schedule) return matches;

  for (const round of group.schedule) {
    for (const match of round.matches) {
      if (match.status === 'IN_PROGRESS' && match.participantB !== 'BYE') {
        matches.push(match);
      }
    }
  }
  return matches;
}

/**
 * Create a match result for completing a match
 */
export function createMatchResult(
  gamesWonA: number,
  gamesWonB: number,
  totalPointsA = 0,
  totalPointsB = 0,
  total20sA = 0,
  total20sB = 0,
  rounds?: Array<{
    gameNumber: number;
    roundInGame: number;
    pointsA: number | null;
    pointsB: number | null;
    twentiesA: number;
    twentiesB: number;
  }>
) {
  return {
    gamesWonA,
    gamesWonB,
    totalPointsA,
    totalPointsB,
    total20sA,
    total20sB,
    rounds
  };
}

/**
 * Find a specific match in the tournament by ID
 */
export function findMatchInTournament(tournament: Tournament, matchId: string): GroupMatch | null {
  const group = tournament.groupStage?.groups[0];
  if (!group?.schedule) return null;

  for (const round of group.schedule) {
    for (const match of round.matches) {
      if (match.id === matchId) return match;
    }
  }
  return null;
}
