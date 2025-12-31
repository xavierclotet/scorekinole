/**
 * Game settings and configuration
 * Stored in localStorage as 'crokinoleGame'
 * @interface GameSettings
 */
export interface GameSettings {
    /** App version string (for migration compatibility checks) */
    appVersion: string;

    /** Points required to win a game in 'points' mode */
    pointsToWin: number;

    /** Timer duration - minutes component */
    timerMinutes: number;

    /** Timer duration - seconds component */
    timerSeconds: number;

    /** Active language: Spanish, Catalan, or English */
    language: 'es' | 'ca' | 'en';

    /** Number of matches (games) to win the overall match */
    matchesToWin: number;

    /** Whether to track and display 20-point center shots */
    show20s: boolean;

    /** Whether to show hammer indicator */
    showHammer: boolean;

    /** Singles (1v1) or doubles (2v2) game type */
    gameType: 'singles' | 'doubles';

    /** Game mode: play to X points or play N rounds */
    gameMode: 'points' | 'rounds';

    /** Number of rounds to play in 'rounds' mode */
    roundsToPlay: number;

    /** Optional event/tournament title to display */
    eventTitle: string;

    /** Optional match phase label (e.g., "Final", "Semi-Final") */
    matchPhase: string;

    /** X position of history button (draggable, null = default) */
    historyBtnX: number | null;

    /** Y position of history button (draggable, null = default) */
    historyBtnY: number | null;
}
