/**
 * Tournament management types
 * Core data structures for tournament system with ranking
 */

// Tournament lifecycle states
export type TournamentStatus =
  | 'DRAFT'          // Creating tournament, adding participants
  | 'GROUP_STAGE'    // Group matches in progress
  | 'TRANSITION'     // Between group and final stage
  | 'FINAL_STAGE'    // Bracket matches in progress
  | 'COMPLETED'      // Tournament finished, ranking applied
  | 'CANCELLED';     // Tournament cancelled

// Tournament configuration
export type TournamentPhaseType = 'ONE_PHASE' | 'TWO_PHASE';
export type GroupStageType = 'ROUND_ROBIN' | 'SWISS';
export type FinalStageType = 'SINGLE_ELIMINATION';
export type FinalStageMode = 'SINGLE_BRACKET' | 'SPLIT_DIVISIONS';  // Single bracket or Gold/Silver divisions

// Group stage ranking system: by wins or by total points scored
// WINS: Both Round Robin and Swiss use 2/1/0 (win/tie/loss)
// POINTS: Sum of all Crokinole points scored
export type GroupRankingSystem = 'WINS' | 'POINTS';

// Legacy alias for backwards compatibility
export type SwissRankingSystem = GroupRankingSystem;

// Match status
export type MatchStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'WALKOVER';

// Participant status
export type ParticipantStatus = 'ACTIVE' | 'WITHDRAWN' | 'DISQUALIFIED';

// Participant type
export type ParticipantType = 'REGISTERED' | 'GUEST';

/**
 * Main Tournament interface
 */
export interface Tournament {
  // Metadata
  id: string;
  key: string;                  // 6-character alphanumeric identifier
  name: string;
  description?: string;
  edition: number;              // Edition number of the tournament (e.g., 1st, 2nd, etc.)
  country: string;              // Country where tournament takes place
  city: string;                 // City where tournament takes place
  tournamentDate?: number;      // Timestamp of when tournament is scheduled
  status: TournamentStatus;
  phaseType: TournamentPhaseType;

  // Game configuration (inherited from GameSettings)
  gameType: 'singles' | 'doubles';
  show20s: boolean;
  showHammer: boolean;

  // Tournament configuration
  numTables: number;
  numGroups?: number;                // For Round Robin (legacy field, will be moved to groupStage)
  numSwissRounds?: number;           // For Swiss (legacy field, will be moved to groupStage)

  // Ranking configuration
  rankingConfig: RankingConfig;

  // Participants
  participants: TournamentParticipant[];

  // Phases
  groupStage?: GroupStage;
  finalStage: FinalStage;

  // Final stage config (stored during tournament creation for TWO_PHASE tournaments)
  finalStageConfig?: {
    mode: FinalStageMode;           // Single bracket or split divisions (Gold/Silver)
    // Gold bracket config (or single bracket if mode is SINGLE_BRACKET)
    gameMode: 'points' | 'rounds';
    pointsToWin?: number;
    roundsToPlay?: number;
    matchesToWin: number;
    // Silver bracket config (only used when mode is SPLIT_DIVISIONS)
    silverGameMode?: 'points' | 'rounds';
    silverPointsToWin?: number;
    silverRoundsToPlay?: number;
    silverMatchesToWin?: number;
    // Per-phase configuration (optional, overrides default config above)
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
    // Silver bracket per-phase config (only for SPLIT_DIVISIONS)
    silverEarlyRoundsGameMode?: 'points' | 'rounds';
    silverEarlyRoundsPointsToWin?: number;
    silverEarlyRoundsToPlay?: number;
    silverSemifinalGameMode?: 'points' | 'rounds';
    silverSemifinalPointsToWin?: number;
    silverSemifinalRoundsToPlay?: number;
    silverSemifinalMatchesToWin?: number;
    silverFinalGameMode?: 'points' | 'rounds';
    silverFinalPointsToWin?: number;
    silverFinalRoundsToPlay?: number;
    silverFinalMatchesToWin?: number;
  };

  // Time configuration (per-tournament settings for time estimation)
  timeConfig?: TournamentTimeConfig;

  // Time estimation
  timeEstimate?: TournamentTimeEstimate;

  // Timestamps
  createdAt: number;
  createdBy: {
    userId: string;
    userName: string;
  };
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;
}

/**
 * Tournament tier type
 */
export type TournamentTier = 'CLUB' | 'REGIONAL' | 'NATIONAL' | 'MAJOR';

/**
 * Ranking configuration for tournament
 */
export interface RankingConfig {
  enabled: boolean;
  tier?: TournamentTier;   // Tournament category (affects points)
}

/**
 * Tournament participant (player or pair)
 */
export interface TournamentParticipant {
  id: string;
  type: ParticipantType;
  userId?: string;         // Only for REGISTERED
  name: string;
  email?: string;

  // For doubles
  partner?: {
    type: ParticipantType;
    userId?: string;
    name: string;
    email?: string;
  };

  // Ranking tracking
  rankingSnapshot: number;     // Ranking at tournament start
  currentRanking: number;      // Current ranking (updated after tournament)
  finalPosition?: number;      // Actual final rank

  // Status
  status: ParticipantStatus;
  withdrawnAt?: number;
  disqualifiedAt?: number;
}

/**
 * Group stage structure
 */
export interface GroupStage {
  type: GroupStageType;
  groups: Group[];
  currentRound: number;
  totalRounds: number;
  isComplete: boolean;

  // Phase-specific game configuration
  gameMode: 'points' | 'rounds';
  pointsToWin?: number;        // For points mode
  roundsToPlay?: number;       // For rounds mode
  matchesToWin: number;        // Best of X

  // Configuration specific to group stage type
  numGroups?: number;          // For Round Robin
  numSwissRounds?: number;     // For Swiss
  rankingSystem?: GroupRankingSystem;  // How to rank: 'WINS' (2/1/0 for both RR and Swiss) or 'POINTS' (total scored)
  swissRankingSystem?: SwissRankingSystem;  // @deprecated - use rankingSystem instead
}

/**
 * Single group (for Round Robin)
 */
export interface Group {
  id: string;
  name: string;                // "Grupo A", "Grupo B", etc.
  participants: string[];      // Participant IDs

  // Round Robin specific
  schedule?: RoundRobinRound[];

  // Swiss specific (no groups, but tracked at tournament level)
  pairings?: SwissPairing[];

  // Standings
  standings: GroupStanding[];
}

/**
 * Round Robin round structure
 */
export interface RoundRobinRound {
  roundNumber: number;
  matches: GroupMatch[];
}

/**
 * Swiss pairing structure
 */
export interface SwissPairing {
  roundNumber: number;
  matches: GroupMatch[];
}

/**
 * Match in group stage
 */
export interface GroupMatch {
  id: string;
  groupId?: string;            // ID of the group this match belongs to
  participantA: string;        // Participant ID
  participantB: string;        // Participant ID or 'BYE'
  tableNumber?: number;
  status: MatchStatus;

  // Results
  matchId?: string;            // Link to MatchHistory
  winner?: string;             // Participant ID
  gamesWonA?: number;
  gamesWonB?: number;
  totalPointsA?: number;
  totalPointsB?: number;
  total20sA?: number;
  total20sB?: number;

  // Round-by-round details (for bracket matches displayed in this dialog)
  rounds?: Array<{
    gameNumber: number;
    roundInGame: number;
    pointsA: number | null;
    pointsB: number | null;
    twentiesA: number;
    twentiesB: number;
  }>;

  // No-show handling
  noShowParticipant?: string;  // Participant ID who didn't show
  walkedOverAt?: number;

  // Timestamps
  startedAt?: number;
  completedAt?: number;
}

/**
 * Group standings entry
 */
export interface GroupStanding {
  participantId: string;
  position: number;

  // Match statistics
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesTied: number;

  // Points (2 for win, 1 for tie, 0 for loss) - Used for Round Robin
  points: number;

  // Swiss Points (2 for win, 1 for tie, 0 for loss) - Used for Swiss system
  // Same scale as Round Robin points for consistency
  swissPoints?: number;

  // Tie-breaker criteria
  total20s: number;                // Tie-breaker 1
  totalPointsScored: number;       // Tie-breaker 2
  headToHeadRecord?: {             // Tie-breaker 3
    [participantId: string]: 'WIN' | 'LOSS' | 'TIE';
  };

  // Qualification
  qualifiedForFinal: boolean;

  // Tie resolution
  tiedWith?: string[];           // IDs of participants tied with this one (unresolved)
  tieReason?: 'head-to-head' | 'twenties' | 'unresolved';  // Why the tie exists
}

/**
 * Final stage structure (always single elimination)
 */
export interface FinalStage {
  type: FinalStageType;
  mode: FinalStageMode;         // Single bracket or split divisions
  bracket: Bracket;             // Gold bracket (or single bracket)
  silverBracket?: Bracket;      // Silver bracket (only for SPLIT_DIVISIONS)
  isComplete: boolean;
  winner?: string;              // Participant ID (Gold winner)
  silverWinner?: string;        // Silver bracket winner (only for SPLIT_DIVISIONS)

  // Phase-specific game configuration for Gold bracket (can differ from group stage)
  gameMode: 'points' | 'rounds';
  pointsToWin?: number;        // For points mode (e.g., 7 points)
  roundsToPlay?: number;       // For rounds mode (e.g., 4 rounds)
  matchesToWin: number;        // Best of X (e.g., best of 3)

  // Silver bracket game configuration (only for SPLIT_DIVISIONS)
  silverGameMode?: 'points' | 'rounds';
  silverPointsToWin?: number;
  silverRoundsToPlay?: number;
  silverMatchesToWin?: number;

  // Per-phase configuration for bracket (optional, overrides default config)
  // Early rounds (octavos, cuartos, etc.)
  earlyRoundsGameMode?: 'points' | 'rounds';  // default: 'rounds'
  earlyRoundsPointsToWin?: number;            // default: 7
  earlyRoundsToPlay?: number;                 // default: 4

  // Semifinals configuration
  semifinalGameMode?: 'points' | 'rounds';    // default: 'points'
  semifinalPointsToWin?: number;              // default: 7
  semifinalRoundsToPlay?: number;
  semifinalMatchesToWin?: number;             // default: 1

  // Final configuration
  finalGameMode?: 'points' | 'rounds';        // default: 'points'
  finalPointsToWin?: number;                  // default: 9
  finalRoundsToPlay?: number;
  finalMatchesToWin?: number;                 // default: 1

  // Silver bracket per-phase configuration (only for SPLIT_DIVISIONS)
  silverEarlyRoundsGameMode?: 'points' | 'rounds';
  silverEarlyRoundsPointsToWin?: number;
  silverEarlyRoundsToPlay?: number;
  silverSemifinalGameMode?: 'points' | 'rounds';
  silverSemifinalPointsToWin?: number;
  silverSemifinalRoundsToPlay?: number;
  silverSemifinalMatchesToWin?: number;
  silverFinalGameMode?: 'points' | 'rounds';
  silverFinalPointsToWin?: number;
  silverFinalRoundsToPlay?: number;
  silverFinalMatchesToWin?: number;
}

/**
 * Bracket structure
 */
export interface Bracket {
  rounds: BracketRound[];
  totalRounds: number;          // log2(participants)
  thirdPlaceMatch?: BracketMatch;  // 3rd/4th place match (losers of semifinals)
}

/**
 * Bracket round
 */
export interface BracketRound {
  roundNumber: number;
  name: string;                 // "Octavos", "Cuartos", "Semifinales", "Final"
  matches: BracketMatch[];
}

/**
 * Match in bracket
 */
export interface BracketMatch {
  id: string;
  position: number;             // Position in bracket (for visual rendering)
  participantA?: string;        // Participant ID (undefined if TBD)
  participantB?: string;
  seedA?: number;               // Seed from group stage
  seedB?: number;
  tableNumber?: number;
  status: MatchStatus;

  // Results
  matchId?: string;             // Link to MatchHistory
  winner?: string;              // Participant ID
  gamesWonA?: number;
  gamesWonB?: number;
  totalPointsA?: number;        // Aggregate points across all games
  totalPointsB?: number;        // Aggregate points across all games
  total20sA?: number;           // Aggregate 20s across all games
  total20sB?: number;           // Aggregate 20s across all games

  // Round-by-round details (for points mode only)
  rounds?: Array<{
    gameNumber: number;
    roundInGame: number;
    pointsA: number | null;
    pointsB: number | null;
    twentiesA: number;
    twentiesB: number;
  }>;

  // No-show
  noShowParticipant?: string;
  walkedOverAt?: number;

  // Timestamps
  startedAt?: number;
  completedAt?: number;

  // Navigation
  nextMatchId?: string;         // Where winner advances
}

/**
 * Ranking calculation result
 */
export interface EloCalculation {
  tournamentId: string;
  participantId: string;
  calculatedAt: number;

  initialElo: number;
  expectedPosition: number;
  actualPosition: number;

  kFactor: number;
  delta: number;                // (expectedPosition - actualPosition) * kFactor, capped
  finalElo: number;

  // For doubles
  isDoubles: boolean;
  partnerParticipantId?: string;
  pairAverageElo?: number;
}

/**
 * Match correction audit trail
 */
export interface MatchCorrection {
  matchId: string;
  correctedAt: number;
  correctedBy: {
    userId: string;
    userName: string;
  };
  previousResult: {
    winner: string;
    scoreA: number;
    scoreB: number;
  };
  newResult: {
    winner: string;
    scoreA: number;
    scoreB: number;
  };
  reason?: string;
}

/**
 * Tournament record for user history
 * Stored in user profile to track ranking changes
 */
export interface TournamentRecord {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: number;        // completedAt timestamp
  finalPosition: number;
  totalParticipants: number;
  rankingBefore: number;
  rankingAfter: number;
  rankingDelta: number;
}

/**
 * Tournament time configuration
 * Global settings stored in Firebase, only modifiable by SuperAdmins
 */
export interface TournamentTimeConfig {
  minutesPer4RoundsSingles: number;     // default: 10
  minutesPer4RoundsDoubles: number;     // default: 15
  avgRoundsForPointsMode: Record<number, number>;  // e.g., {5: 4, 7: 6, 9: 8, 11: 10}
  breakBetweenMatches: number;          // default: 5 minutes
  breakBetweenPhases: number;           // default: 10 minutes
  parallelSemifinals: boolean;          // default: true - if semifinals are played in parallel
  parallelFinals: boolean;              // default: true - if final and 3rd place match are played in parallel
}

/**
 * Tournament time estimate
 * Stored on tournament object after creation
 */
export interface TournamentTimeEstimate {
  totalMinutes: number;
  groupStageMinutes?: number;
  finalStageMinutes?: number;
  calculatedAt: number;
}
