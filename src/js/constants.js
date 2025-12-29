export const APP_VERSION = '1.1.6';
export const APP_NAME = 'Scorekinole';

export const DEFAULT_GAME_SETTINGS = {
    appVersion: APP_VERSION,
    pointsToWin: 7,
    timerMinutes: 10,
    timerSeconds: 0,
    language: 'ca',
    matchesToWin: 1,
    show20s: false,
    showHammer: false,
    gameType: 'singles', // 'singles' or 'doubles'
    gameMode: 'rounds', // 'points' | 'rounds'
    roundsToPlay: 4, // Número de rondas en modo rounds
    eventTitle: '', // Título del evento
    matchPhase: '', // Fase de la partida
    historyBtnX: null, // Posición X del botón history (null = default)
    historyBtnY: null  // Posición Y del botón history (null = default)
};
