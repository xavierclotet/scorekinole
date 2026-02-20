/**
 * Game settings and configuration
 * Stored in localStorage as 'crokinoleGame'
 * @interface GameSettings
 */
export interface GameSettings {
    /** App version string (for migration compatibility checks) */
    appVersion: string;

    /** Points required to win a game in 'points' mode (undefined when in rounds mode) */
    pointsToWin?: number;

    /** Timer duration - minutes component */
    timerMinutes: number;

    /** Timer duration - seconds component */
    timerSeconds: number;

    /** Whether to show the timer on the game screen */
    showTimer: boolean;

    /** Number of matches (games) to win the overall match (undefined when in rounds mode) */
    matchesToWin?: number;

    /** Whether to track and display 20-point center shots */
    show20s: boolean;

    /** Whether to show hammer indicator */
    showHammer: boolean;

    /** Whether to show the score table at the bottom of the screen */
    showScoreTable: boolean;

    /** Singles (1v1) or doubles (2v2) game type */
    gameType: 'singles' | 'doubles';

    /** Game mode: play to X points or play N rounds */
    gameMode: 'points' | 'rounds';

    /** Number of rounds to play in 'rounds' mode (undefined when in points mode) */
    roundsToPlay?: number;

    /** Whether ties are allowed in rounds mode (if false, extra rounds until winner) */
    allowTiesInRoundsMode: boolean;

    /** Optional event/tournament title to display */
    eventTitle: string;

    /** Optional match phase label (e.g., "Final", "Semi-Final") */
    matchPhase: string;

    /** X position of timer (draggable, null = default centered) */
    timerX: number | null;

    /** Y position of timer (draggable, null = default centered) */
    timerY: number | null;

    /** Size of the match score indicator: 'small', 'medium', or 'large' */
    matchScoreSize: 'small' | 'medium' | 'large';

    /** Size of the main score display: 'small', 'medium', or 'large' */
    mainScoreSize: 'small' | 'medium' | 'large';

    /** Size of the team name display: 'small', 'medium', or 'large' */
    nameSize: 'small' | 'medium' | 'large';

    /** The key/token of the active tournament the device is connected to */
    tournamentKey?: string;

    /** Temporary storage for the last completed tournament match result to show in RoundsPanel */
    lastTournamentResult?: {
        winnerName: string | null;
        scoreA: number;
        scoreB: number;
        isTie: boolean;
        team1Name: string;
        team2Name: string;
        pointsA?: number;
        pointsB?: number;
        matchesToWin?: number;
    } | null;
}
