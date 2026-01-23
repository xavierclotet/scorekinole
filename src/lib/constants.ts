import type { GameSettings } from './types/settings';

export const APP_VERSION = '2.1.7';
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
    showScoreTable: true,
    gameType: 'singles',
    gameMode: 'rounds',
    roundsToPlay: 4,
    eventTitle: 'Scorekinole',
    matchPhase: '',
    timerX: null,
    timerY: null,
    matchScoreSize: 'medium',
    mainScoreSize: 'medium',
    nameSize: 'medium'
};

export const DEVELOPED_COUNTRIES = [
    'Alemania',
    'Australia',
    'Austria',
    'Bélgica',
    'Canadá',
    'Corea del Sur',
    'Dinamarca',
    'España',
    'Estados Unidos',
    'Finlandia',
    'Francia',
    'Hungría',
    'Islandia',
    'Italia',
    'Japón',
    'Luxemburgo',
    'Noruega',
    'Nueva Zelanda',
    'Países Bajos',
    'Reino Unido',
    'Rumanía',
    'Singapur',
    'Suecia',
    'Suiza'
];
