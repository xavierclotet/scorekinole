/**
 * Represents a team in a Crokinole match
 * @interface Team
 */
export interface Team {
    /** Team name (e.g., "Team 1", "Los Campeones") */
    name: string;
    /** Team color in hex format (e.g., "#00ff88") */
    color: string;
    /** Current points in the active round */
    points: number;
    /** Number of rounds won in the current match */
    rounds: number;
    /** Auto-calculated rounds (legacy, may be deprecated) */
    autoRounds: number;
    /** Total matches won across all sessions */
    matches: number;
    /** Number of 20-point center shots in current round */
    twenty: number;
    /** Whether this team has won the current match */
    hasWon: boolean;
    /** Whether this team has the hammer (starts second) */
    hasHammer: boolean;
}

/**
 * State tracking for the current match
 * @interface MatchState
 */
export interface MatchState {
    /** User ID of the player who started this match (for Firebase sync) */
    matchStartedBy: string | null;
    /** Team number (1 or 2) that had hammer in last game */
    lastGameHammerTeam: number | null;
    /** Team number (1 or 2) that started with hammer in current game */
    currentGameStartHammer: number | null;
    /** Which team is currently tracking 20s: 0=none, 1=team1, 2=team2 */
    currentTwentyTeam: number;
    /** Whether the 20s input dialog is pending/should be shown */
    twentyDialogPending: boolean;
    /** Unix timestamp when the match started */
    matchStartTime: number | null;
    /** History of completed games in this match */
    currentMatchGames: GameData[];
    /** History of all rounds in this match */
    currentMatchRounds: RoundData[];
    /** Rounds in the current game only */
    currentGameRounds: RoundData[];
}

/**
 * Data for a completed game within a match
 * @interface GameData
 */
export interface GameData {
    /** Sequential game number (1, 2, 3, ...) */
    gameNumber: number;
    /** Winning team: 1 or 2 */
    winner: number;
    /** Final points for team 1 */
    team1Points: number;
    /** Final points for team 2 */
    team2Points: number;
    /** Rounds won by team 1 */
    team1Rounds: number;
    /** Rounds won by team 2 */
    team2Rounds: number;
    /** Total 20s scored by team 1 */
    team1Twenty: number;
    /** Total 20s scored by team 2 */
    team2Twenty: number;
    /** Unix timestamp when game was completed */
    timestamp: number;
}

/**
 * Data for a single round within a game
 * @interface RoundData
 */
export interface RoundData {
    /** Sequential round number (1, 2, 3, ...) */
    roundNumber: number;
    /** Points scored by team 1 in this round */
    team1Points: number;
    /** Points scored by team 2 in this round */
    team2Points: number;
    /** 20s scored by team 1 in this round */
    team1Twenty: number;
    /** 20s scored by team 2 in this round */
    team2Twenty: number;
    /** Unix timestamp when round was completed */
    timestamp: number;
}
