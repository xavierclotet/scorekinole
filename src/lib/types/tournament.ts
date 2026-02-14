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
export type FinalStageMode = 'SINGLE_BRACKET' | 'SPLIT_DIVISIONS' | 'PARALLEL_BRACKETS';  // Single bracket, Gold/Silver divisions, or A/B/C parallel brackets

// Qualification mode: how players qualify from group stage
// WINS: Both Round Robin and Swiss use 2/1/0 (win/tie/loss)
// POINTS: Sum of all Crokinole points scored
export type QualificationMode = 'WINS' | 'POINTS';

// Legacy aliases for backwards compatibility
export type GroupRankingSystem = QualificationMode;
export type SwissRankingSystem = QualificationMode;

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
  descriptionLanguage?: string; // Language code of the description (es, en, ca) for translation
  edition?: number;             // Edition number of the tournament (e.g., 1st, 2nd, etc.) - optional
  country: string;              // Country where tournament takes place
  city: string;                 // City where tournament takes place
  address?: string;             // Address/venue where tournament takes place
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

  // Ownership & permissions
  ownerId?: string;              // Current owner UID (defaults to createdBy.userId if not set)
  ownerName?: string;            // Current owner name (for display without extra queries)
  adminIds?: string[];           // Additional admin UIDs who can manage this tournament

  startedAt?: number;
  completedAt?: number;
  updatedAt: number;

  // Import fields (for tournaments imported after completion)
  isImported?: boolean;                // true for tournaments imported after completion
  importedAt?: number;                 // Timestamp when tournament was imported
  importedBy?: {
    userId: string;
    userName: string;
  };
  importNotes?: string;                // Notes about data source/quality
  externalLink?: string;               // External link (e.g., to original results page)
  posterUrl?: string;                  // URL to tournament poster/banner image

  // Video highlight (YouTube)
  videoUrl?: string;                   // Full YouTube URL
  videoId?: string;                    // Extracted video ID for embedding

  // Test flag
  isTest?: boolean;                    // true = hidden from public tournament list
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
 * Tournament participant (player or pair for doubles)
 *
 * For doubles: use the `partner` field with both players' data.
 * - `name` always contains the primary player's REAL name
 * - `partner.name` always contains the second player's REAL name
 * - `teamName` (optional) contains the artistic team name for display
 *
 * Display logic: teamName || `${name} / ${partner.name}`
 */
export interface TournamentParticipant {
  id: string;

  // Primary player
  type: ParticipantType;
  userId?: string;         // Only for REGISTERED
  name: string;            // Player 1's REAL name (always)
  email?: string;
  photoURL?: string;       // Snapshot of user's photo at time of registration

  // Optional artistic team name for doubles (display only)
  teamName?: string;       // e.g., "Los Invencibles" - if not set, displays "P1 / P2"

  // Second player (only for doubles)
  partner?: {
    type: ParticipantType;
    userId?: string;
    name: string;          // Player 2's REAL name (always)
    email?: string;
    photoURL?: string;     // Partner's photo snapshot at registration
  };

  // Ranking tracking
  rankingSnapshot: number;     // Ranking at tournament start (used for seeding)
  finalPosition?: number;      // Final position in tournament (used to calculate points earned)

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
  qualificationMode?: QualificationMode;  // How players qualify: 'WINS' (2/1/0) or 'POINTS' (total scored)
  rankingSystem?: GroupRankingSystem;  // @deprecated - use qualificationMode instead
  swissRankingSystem?: SwissRankingSystem;  // @deprecated - use qualificationMode instead
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
  tableNumber?: number;        // Table assignment (undefined = TBD, waiting for table)
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

  // Video attachment
  videoUrl?: string;             // Full YouTube URL
  videoId?: string;              // Extracted video ID for embedding
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
  headToHeadRecord?: {             // Tie-breaker 3 - includes result and 20s for mini-league calc
    [participantId: string]: {
      result: 'WIN' | 'LOSS' | 'TIE';
      twenties: number;  // 20s scored in that specific match
    };
  };

  // Qualification
  qualifiedForFinal: boolean;

  // Tie resolution
  tiedWith?: string[];           // IDs of participants tied with this one (unresolved)
  tieReason?: 'head-to-head' | 'twenties' | 'unresolved';  // Why the tie exists
}

/**
 * Configuration for a bracket phase (early rounds, semifinal, or final)
 */
export interface PhaseConfig {
  gameMode: 'points' | 'rounds';
  pointsToWin?: number;   // Only if gameMode is 'points'
  roundsToPlay?: number;  // Only if gameMode is 'rounds'
  matchesToWin: number;   // Best of X
}

/**
 * Configuration for all phases of a bracket
 */
export interface BracketConfig {
  earlyRounds: PhaseConfig;
  semifinal: PhaseConfig;
  final: PhaseConfig;
}

/**
 * Consolation bracket for eliminated players
 * QF losers compete for positions 5-8
 * R16 losers compete for positions 9-16
 */
export interface ConsolationBracket {
  source: 'QF' | 'R16';           // Which round's losers this bracket contains
  rounds: BracketRound[];         // Mini-bracket structure
  totalRounds: number;            // Number of rounds in this consolation bracket
  startPosition: number;          // Starting position for rankings (5 for QF, 9 for R16)
  numLosers?: number;             // Actual number of losers (may be less due to BYEs)
  isComplete: boolean;
}

/**
 * Bracket with embedded configuration
 */
export interface BracketWithConfig {
  rounds: BracketRound[];
  totalRounds: number;
  thirdPlaceMatch?: BracketMatch;
  config: BracketConfig;
  consolationBrackets?: ConsolationBracket[];  // Consolation brackets for eliminated players
}

/**
 * Named bracket for parallel brackets (A/B/C Finals)
 * Used for historical tournament imports where groups qualify to different parallel brackets
 */
export interface NamedBracket {
  id: string;
  name: string;                               // "A Finals", "B Finals", "C Finals"
  label: string;                              // "A", "B", "C"
  bracket: BracketWithConfig;
  sourcePositions: number[];                  // Group positions that qualify to this bracket (e.g., [1,2] for A Finals)
  winner?: string;                            // Winner participant ID
}

/**
 * Final stage structure (single elimination)
 */
export interface FinalStage {
  mode: FinalStageMode;                       // Single bracket, split divisions, or parallel brackets
  consolationEnabled?: boolean;               // Enable consolation brackets for eliminated players (applies to both brackets)
  thirdPlaceMatchEnabled?: boolean;           // Enable 3rd/4th place match (semifinal losers play for 3rd place)
  goldBracket: BracketWithConfig;             // Gold bracket (always present)
  silverBracket?: BracketWithConfig;          // Silver bracket (only for SPLIT_DIVISIONS)
  parallelBrackets?: NamedBracket[];          // A/B/C parallel brackets (only for PARALLEL_BRACKETS mode)
  isComplete: boolean;
  winner?: string;                            // Gold bracket winner participant ID
  silverWinner?: string;                      // Silver bracket winner (only for SPLIT_DIVISIONS)
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
    hammerSide?: 'A' | 'B' | null;  // Which participant had the hammer in this round
  }>;

  // No-show
  noShowParticipant?: string;
  walkedOverAt?: number;

  // Timestamps
  startedAt?: number;
  completedAt?: number;

  // Navigation
  nextMatchId?: string;         // Where winner advances
  nextMatchIdForLoser?: string; // Where loser goes (for consolation brackets)

  // Consolation bracket specific
  isThirdPlace?: boolean;       // True if this is a "loser's match" in consolation (e.g., 7-8, 11-12)

  // Video attachment
  videoUrl?: string;             // Full YouTube URL
  videoId?: string;              // Extracted video ID for embedding
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

/**
 * Get display name for a tournament participant
 * For doubles: returns teamName if set, otherwise "Player1 / Player2"
 * For singles: returns participant.name
 *
 * @param participant The tournament participant
 * @param isDoubles Whether the tournament is doubles format
 * @returns Display name for the participant
 */
export function getParticipantDisplayName(
  participant: TournamentParticipant | null | undefined,
  isDoubles: boolean = false
): string {
  if (!participant) return '';

  // For doubles with partner, use teamName or construct from both names
  if (isDoubles && participant.partner) {
    return participant.teamName || `${participant.name} / ${participant.partner.name}`;
  }

  // For singles or doubles without partner data, use participant name
  return participant.name;
}
