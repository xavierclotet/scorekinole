import type { GameSettings } from './types/settings';

export const APP_VERSION = '2.4.28';
export const APP_NAME = 'Scorekinole';
export const PRODUCTION_URL = 'https://scorekinole.web.app';

/**
 * Batch size for Firestore bulk writes (autofill, simulate matches)
 * Prevents "Write stream exhausted" error when many writes are queued
 */
export const FIRESTORE_BATCH_SIZE = 20;

export const PAGE_SIZE = 15;

export const DEFAULT_GAME_SETTINGS: GameSettings = {
    appVersion: APP_VERSION,
    pointsToWin: 7,
    timerMinutes: 10,
    timerSeconds: 0,
    showTimer: true,
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

/** Country codes for user profiles (names come from translations) */
export const COUNTRY_CODES = [
    'AR', 'AU', 'AT', 'BE', 'BR', 'CA', 'CAT', 'CL', 'CN', 'CO',
    'KR', 'CZ', 'DK', 'ES', 'US', 'FI', 'FR', 'DE', 'GR', 'HU',
    'IN', 'IE', 'IS', 'IT', 'JP', 'LU', 'MX', 'NO', 'NZ', 'NL',
    'PL', 'PT', 'GB', 'RO', 'RU', 'SG', 'ZA', 'SE', 'CH', 'UY', 'VE'
] as const;
