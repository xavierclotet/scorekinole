import type { GameSettings } from './types/settings';

export const APP_VERSION = '2.4.19';
export const APP_NAME = 'Scorekinole';
export const PRODUCTION_URL = 'https://scorekinole.web.app';

/**
 * Batch size for Firestore bulk writes (autofill, simulate matches)
 * Prevents "Write stream exhausted" error when many writes are queued
 */
export const FIRESTORE_BATCH_SIZE = 20;

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
    allowTiesInRoundsMode: true,
    eventTitle: 'Event',
    matchPhase: 'Fase',
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
    'Cataluña',
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
