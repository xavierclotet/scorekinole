import type { GameSettings } from './types/settings';

export const APP_VERSION = '2.0.4';
export const APP_NAME = 'Scorekinole';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
    appVersion: APP_VERSION,
    pointsToWin: 7,
    timerMinutes: 10,
    timerSeconds: 0,
    showTimer: true,
    language: 'ca',
    matchesToWin: 1,
    show20s: false,
    showHammer: false,
    gameType: 'singles',
    gameMode: 'rounds',
    roundsToPlay: 4,
    eventTitle: 'Scorekinole',
    matchPhase: '',
    timerX: null,
    timerY: null
};
