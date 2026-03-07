/**
 * Test tournament factory
 *
 * Creates realistic tournament data for concurrency and integration tests.
 * Uses the REAL generateRoundRobinSchedule and generateSwissPairings algorithms.
 */

import type {
  Tournament,
  TournamentParticipant,
  GroupStage,
  Group,
  GroupMatch,
  GroupStanding,
  QualificationMode,
  SwissPairing
} from '$lib/types/tournament';
import { generateRoundRobinSchedule } from '$lib/algorithms/roundRobin';
import { generateSwissPairings } from '$lib/algorithms/swiss';

interface CreateTestTournamentOptions {
  numParticipants: number;
  type?: 'ROUND_ROBIN' | 'SWISS';
  gameMode?: 'points' | 'rounds';
  numTables?: number;
  qualificationMode?: QualificationMode;
  gameType?: 'singles' | 'doubles';
  show20s?: boolean;
  /** For Swiss: how many rounds to pre-generate (default 1) */
  swissRounds?: number;
  /** Custom tournament ID */
  tournamentId?: string;
  /** Best-of-N: number of games to win a match (default 1) */
  matchesToWin?: number;
}

/**
 * Create participants array from count
 */
function createParticipants(
  numParticipants: number,
  gameType: 'singles' | 'doubles' = 'singles',
  prefix = 'player'
): { participants: TournamentParticipant[]; participantIds: string[] } {
  const participants: TournamentParticipant[] = [];
  const participantIds: string[] = [];
  for (let i = 0; i < numParticipants; i++) {
    const id = `${prefix}-${i + 1}`;
    participantIds.push(id);
    const participant: TournamentParticipant = {
      id,
      type: 'GUEST',
      name: `Player ${i + 1}`,
      status: 'ACTIVE',
      rankingSnapshot: 1000 - i * 10
    };
    if (gameType === 'doubles') {
      participant.partner = {
        type: 'GUEST',
        name: `Partner ${i + 1}`
      };
    }
    participants.push(participant);
  }
  return { participants, participantIds };
}

/**
 * Initialize empty standings for a list of participant IDs
 */
function initStandings(participantIds: string[], isSwiss = false): GroupStanding[] {
  return participantIds.map(id => ({
    participantId: id,
    position: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    matchesTied: 0,
    points: 0,
    swissPoints: isSwiss ? 0 : undefined,
    total20s: 0,
    totalPointsScored: 0,
    qualifiedForFinal: false,
    headToHeadRecord: {}
  }));
}

/**
 * Set all PENDING non-BYE matches to IN_PROGRESS with table numbers
 */
function activateMatches(matches: GroupMatch[], numTables: number, startCounter = 1): number {
  let tableCounter = startCounter;
  const now = Date.now();
  for (const match of matches) {
    if (match.participantB !== 'BYE' && match.status === 'PENDING') {
      match.status = 'IN_PROGRESS';
      match.startedAt = now - 600000;
      match.tableNumber = ((tableCounter - 1) % numTables) + 1;
      tableCounter++;
    }
  }
  return tableCounter;
}

/**
 * Create a complete test tournament with all matches IN_PROGRESS
 */
export function createTestTournament(options: CreateTestTournamentOptions): Tournament {
  const {
    numParticipants,
    type = 'ROUND_ROBIN',
    gameMode = 'rounds',
    numTables = 4,
    qualificationMode,
    gameType = 'singles',
    show20s = true,
    tournamentId = 'test-tournament-1',
    matchesToWin = 1
  } = options;

  const { participants, participantIds } = createParticipants(numParticipants, gameType);

  // Generate schedule using the REAL algorithm
  const schedule = generateRoundRobinSchedule(participantIds);

  // Set all non-BYE matches to IN_PROGRESS with table numbers
  for (const round of schedule) {
    activateMatches(round.matches, numTables);
  }

  const standings = initStandings(participantIds);

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
    matchesToWin,
    qualificationMode
  };

  const now = Date.now();
  return {
    id: tournamentId,
    key: 'TEST01',
    name: 'Test Tournament',
    country: 'ES',
    city: 'Barcelona',
    status: 'GROUP_STAGE',
    phaseType: 'GROUP_ONLY',
    gameType,
    show20s,
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
 * Create a Swiss tournament with round 1 pairings generated
 */
export function createSwissTournament(options: Omit<CreateTestTournamentOptions, 'type'> & { swissRounds?: number }): Tournament {
  const {
    numParticipants,
    gameMode = 'rounds',
    numTables = 4,
    qualificationMode,
    gameType = 'singles',
    show20s = true,
    swissRounds = 1,
    tournamentId = 'test-swiss-1'
  } = options;

  const { participants, participantIds } = createParticipants(numParticipants, gameType);
  const standings = initStandings(participantIds, true);

  // Generate round 1 pairings using the REAL algorithm
  const r1Matches = generateSwissPairings(participants, standings, [], 1);

  // Activate matches
  activateMatches(r1Matches, numTables);

  const pairings: SwissPairing[] = [
    { roundNumber: 1, matches: r1Matches }
  ];

  const group: Group = {
    id: 'group-1',
    name: 'Grupo A',
    participants: participantIds,
    pairings,
    standings
  };

  const groupStage: GroupStage = {
    type: 'SWISS',
    groups: [group],
    currentRound: 1,
    totalRounds: swissRounds,
    isComplete: false,
    gameMode,
    pointsToWin: gameMode === 'points' ? 7 : undefined,
    roundsToPlay: gameMode === 'rounds' ? 4 : undefined,
    matchesToWin: 1,
    numSwissRounds: swissRounds,
    qualificationMode
  };

  const now = Date.now();
  return {
    id: tournamentId,
    key: 'SWISS01',
    name: 'Test Swiss Tournament',
    country: 'ES',
    city: 'Barcelona',
    status: 'GROUP_STAGE',
    phaseType: 'GROUP_ONLY',
    gameType,
    show20s,
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
 * Create a multi-group Round Robin tournament
 */
export function createMultiGroupTournament(
  numParticipants: number,
  numGroups: number,
  options?: Partial<Omit<CreateTestTournamentOptions, 'numParticipants' | 'type'>>
): Tournament {
  const {
    gameMode = 'rounds',
    numTables = 4,
    qualificationMode,
    gameType = 'singles',
    show20s = true,
    tournamentId = 'test-multigroup-1'
  } = options || {};

  const { participants } = createParticipants(numParticipants, gameType);

  // Split participants into groups (snake draft)
  const groupParticipants: TournamentParticipant[][] = Array.from({ length: numGroups }, () => []);
  participants.forEach((p, i) => {
    const groupIdx = i % numGroups;
    groupParticipants[groupIdx].push(p);
  });

  const groups: Group[] = groupParticipants.map((groupPlayers, gi) => {
    const ids = groupPlayers.map(p => p.id);
    const schedule = generateRoundRobinSchedule(ids);

    for (const round of schedule) {
      activateMatches(round.matches, numTables);
    }

    return {
      id: `group-${gi + 1}`,
      name: `Grupo ${String.fromCharCode(65 + gi)}`,
      participants: ids,
      schedule,
      standings: initStandings(ids)
    };
  });

  const maxRounds = Math.max(...groups.map(g => g.schedule!.length));

  const groupStage: GroupStage = {
    type: 'ROUND_ROBIN',
    groups,
    currentRound: 1,
    totalRounds: maxRounds,
    isComplete: false,
    gameMode,
    pointsToWin: gameMode === 'points' ? 7 : undefined,
    roundsToPlay: gameMode === 'rounds' ? 4 : undefined,
    matchesToWin: 1,
    numGroups,
    qualificationMode
  };

  const now = Date.now();
  return {
    id: tournamentId,
    key: 'MULTI01',
    name: 'Test Multi-Group Tournament',
    country: 'ES',
    city: 'Barcelona',
    status: 'GROUP_STAGE',
    phaseType: 'GROUP_ONLY',
    gameType,
    show20s,
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
 * Get all IN_PROGRESS matches (excluding BYEs) across all groups
 */
export function getInProgressMatches(tournament: Tournament, groupIndex?: number): GroupMatch[] {
  const matches: GroupMatch[] = [];
  if (!tournament.groupStage) return matches;

  const groups = groupIndex !== undefined
    ? [tournament.groupStage.groups[groupIndex]]
    : tournament.groupStage.groups;

  for (const group of groups) {
    const rounds = group.schedule || group.pairings || [];
    for (const round of rounds) {
      for (const match of round.matches) {
        if (match.status === 'IN_PROGRESS' && match.participantB !== 'BYE') {
          matches.push(match);
        }
      }
    }
  }
  return matches;
}

/**
 * Get all matches from a group (all statuses)
 */
export function getAllMatches(tournament: Tournament, groupIndex = 0): GroupMatch[] {
  const group = tournament.groupStage?.groups[groupIndex];
  if (!group) return [];

  const rounds = group.schedule || group.pairings || [];
  return rounds.flatMap(r => r.matches);
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
 * Find a specific match in the tournament by ID (searches all groups)
 */
export function findMatchInTournament(tournament: Tournament, matchId: string): GroupMatch | null {
  if (!tournament.groupStage) return null;

  for (const group of tournament.groupStage.groups) {
    const rounds = group.schedule || group.pairings || [];
    for (const round of rounds) {
      for (const match of round.matches) {
        if (match.id === matchId) return match;
      }
    }
  }
  return null;
}

/**
 * Find match between two specific participants
 */
export function findMatchBetween(
  tournament: Tournament,
  participantA: string,
  participantB: string,
  groupIndex = 0
): GroupMatch | null {
  const group = tournament.groupStage?.groups[groupIndex];
  if (!group) return null;

  const rounds = group.schedule || group.pairings || [];
  for (const round of rounds) {
    for (const match of round.matches) {
      if (
        (match.participantA === participantA && match.participantB === participantB) ||
        (match.participantA === participantB && match.participantB === participantA)
      ) {
        return match;
      }
    }
  }
  return null;
}
