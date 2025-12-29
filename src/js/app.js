import { APP_VERSION, APP_NAME, DEFAULT_GAME_SETTINGS } from './constants.js';
import { translations, t } from './translations.js';

// Game State
let gameSettings = { ...DEFAULT_GAME_SETTINGS };

let team1 = {
    name: 'Team 1',
    color: '#D06249', // orange
    points: 0,
    rounds: 0,
    autoRounds: 0,
    matches: 0,
    twenty: 0,
    hasWon: false,
    hasHammer: false
};

let team2 = {
    name: 'Team 2',
    color: '#3CBCFB', // lightblue
    points: 0,
    rounds: 0,
    autoRounds: 0,
    matches: 0,
    twenty: 0,
    hasWon: false,
    hasHammer: false
};

// Track who started the current match (for alternating in next match)
let matchStartedBy = 0; // 0 = not set, 1 = team1 started, 2 = team2 started

// Track who had the hammer AT THE START of the last game (for alternating between games within a match)
let lastGameHammerTeam = 0; // 0 = not set, 1 = team1 had hammer at start, 2 = team2 had hammer at start

// Track who has the hammer at the start of current game (to save when game ends)
let currentGameStartHammer = 0; // 0 = not set, 1 = team1, 2 = team2

// State for 20s input dialog
let currentTwentyTeam = 0; // 0 = not active, 1 = entering team1, 2 = entering team2
const MAX_TWENTY_SINGLES = 8;
const MAX_TWENTY_DOUBLES = 12;

// Timer state
let timerInterval = null;
let timerRunning = false;
let timeRemaining = 600; // in seconds (10:00)

// Rounds counter (for rounds mode)
let roundsPlayed = 0;

// Match history tracking
let matchStartTime = 0;
let currentMatchGames = [];  // Para modo points
let currentMatchRounds = []; // Para modo rounds
let currentGameRounds = [];  // Track rounds within current game (for points mode)
let previousRoundTwenty1 = 0; // Track previous round 20s for team1
let previousRoundTwenty2 = 0; // Track previous round 20s for team2

// Tab state for history modal
let activeHistoryTab = 'history'; // 'current' | 'history'

// Color picker state
let currentColorTeam = 1;
let tempColor = '';
let selectedPreset = -1;

// Primary colors
const primaryColors = [
    '#E6BD80', // natural
    '#1B100E', // negro
    '#DADADA', // blanco
    '#BB484D', // red
    '#D06249', // orange
    '#DFC530', // yellow
    '#559D5E', // green
    '#3CBCFB', // lightblue
    '#014BC6', // blue
    '#DA85CE', // pink
    '#8B65A0'  // magenta
];

// Preset color schemes - all unique combinations
const presets = [
    // Blanco vs others
    { team1: '#DADADA', team2: '#1B100E', name: 'White vs Black' },
    { team1: '#DADADA', team2: '#E6BD80', name: 'White vs Natural' },
    { team1: '#DADADA', team2: '#BB484D', name: 'White vs Red' },
    { team1: '#DADADA', team2: '#559D5E', name: 'White vs Green' },
    { team1: '#DADADA', team2: '#DFC530', name: 'White vs Yellow' },
    { team1: '#DADADA', team2: '#D06249', name: 'White vs Orange' },
    { team1: '#DADADA', team2: '#3CBCFB', name: 'White vs Light Blue' },
    { team1: '#DADADA', team2: '#014BC6', name: 'White vs Blue' },
    { team1: '#DADADA', team2: '#DA85CE', name: 'White vs Pink' },
    { team1: '#DADADA', team2: '#8B65A0', name: 'White vs Magenta' },
    // Negro vs others
    { team1: '#1B100E', team2: '#E6BD80', name: 'Black vs Natural' },
    { team1: '#1B100E', team2: '#BB484D', name: 'Black vs Red' },
    { team1: '#1B100E', team2: '#559D5E', name: 'Black vs Green' },
    { team1: '#1B100E', team2: '#DFC530', name: 'Black vs Yellow' },
    { team1: '#1B100E', team2: '#D06249', name: 'Black vs Orange' },
    { team1: '#1B100E', team2: '#3CBCFB', name: 'Black vs Light Blue' },
    { team1: '#1B100E', team2: '#014BC6', name: 'Black vs Blue' },
    { team1: '#1B100E', team2: '#DA85CE', name: 'Black vs Pink' },
    { team1: '#1B100E', team2: '#8B65A0', name: 'Black vs Magenta' },
    // Natural vs others
    { team1: '#E6BD80', team2: '#BB484D', name: 'Natural vs Red' },
    { team1: '#E6BD80', team2: '#559D5E', name: 'Natural vs Green' },
    { team1: '#E6BD80', team2: '#DFC530', name: 'Natural vs Yellow' },
    { team1: '#E6BD80', team2: '#D06249', name: 'Natural vs Orange' },
    { team1: '#E6BD80', team2: '#3CBCFB', name: 'Natural vs Light Blue' },
    { team1: '#E6BD80', team2: '#014BC6', name: 'Natural vs Blue' },
    { team1: '#E6BD80', team2: '#DA85CE', name: 'Natural vs Pink' },
    { team1: '#E6BD80', team2: '#8B65A0', name: 'Natural vs Magenta' },
    // Red vs others
    { team1: '#BB484D', team2: '#559D5E', name: 'Red vs Green' },
    { team1: '#BB484D', team2: '#DFC530', name: 'Red vs Yellow' },
    { team1: '#BB484D', team2: '#D06249', name: 'Red vs Orange' },
    { team1: '#BB484D', team2: '#3CBCFB', name: 'Red vs Light Blue' },
    { team1: '#BB484D', team2: '#014BC6', name: 'Red vs Blue' },
    { team1: '#BB484D', team2: '#DA85CE', name: 'Red vs Pink' },
    { team1: '#BB484D', team2: '#8B65A0', name: 'Red vs Magenta' },
    // Orange vs others
    { team1: '#D06249', team2: '#559D5E', name: 'Orange vs Green' },
    { team1: '#D06249', team2: '#DFC530', name: 'Orange vs Yellow' },
    { team1: '#D06249', team2: '#3CBCFB', name: 'Orange vs Light Blue' },
    { team1: '#D06249', team2: '#014BC6', name: 'Orange vs Blue' },
    { team1: '#D06249', team2: '#DA85CE', name: 'Orange vs Pink' },
    { team1: '#D06249', team2: '#8B65A0', name: 'Orange vs Magenta' },
    // Yellow vs others
    { team1: '#DFC530', team2: '#559D5E', name: 'Yellow vs Green' },
    { team1: '#DFC530', team2: '#3CBCFB', name: 'Yellow vs Light Blue' },
    { team1: '#DFC530', team2: '#014BC6', name: 'Yellow vs Blue' },
    { team1: '#DFC530', team2: '#DA85CE', name: 'Yellow vs Pink' },
    { team1: '#DFC530', team2: '#8B65A0', name: 'Yellow vs Magenta' },
    // Green vs others
    { team1: '#559D5E', team2: '#3CBCFB', name: 'Green vs Light Blue' },
    { team1: '#559D5E', team2: '#014BC6', name: 'Green vs Blue' },
    { team1: '#559D5E', team2: '#DA85CE', name: 'Green vs Pink' },
    { team1: '#559D5E', team2: '#8B65A0', name: 'Green vs Magenta' },
    // Light Blue vs others
    { team1: '#3CBCFB', team2: '#014BC6', name: 'Light Blue vs Blue' },
    { team1: '#3CBCFB', team2: '#DA85CE', name: 'Light Blue vs Pink' },
    { team1: '#3CBCFB', team2: '#8B65A0', name: 'Light Blue vs Magenta' },
    // Blue vs others
    { team1: '#014BC6', team2: '#DA85CE', name: 'Blue vs Pink' },
    { team1: '#014BC6', team2: '#8B65A0', name: 'Blue vs Magenta' },
    // Pink vs Magenta
    { team1: '#DA85CE', team2: '#8B65A0', name: 'Pink vs Magenta' }
];

// Touch tracking
let touchStartY = {};
let touchStartTime = {};
let mouseStartY = {};
let mouseStartTime = {};
let isMouseDown = {};
const SWIPE_THRESHOLD = 50;
const TAP_TIME_THRESHOLD = 200;

// Load data
function loadData() {
    const savedGame = localStorage.getItem('crokinoleGame');
    const savedTeam1 = localStorage.getItem('crokinoleTeam1');
    const savedTeam2 = localStorage.getItem('crokinoleTeam2');

    if (savedGame) {
        const parsedSettings = JSON.parse(savedGame);

        // Check version - if different, clear game data (not history)
        if (parsedSettings.appVersion !== APP_VERSION) {
            localStorage.removeItem('crokinoleGame');
            localStorage.removeItem('crokinoleTeam1');
            localStorage.removeItem('crokinoleTeam2');
            // Keep default gameSettings with current version
            return;
        }

        gameSettings = parsedSettings;
        // Ensure matchesToWin exists
        if (gameSettings.matchesToWin === undefined) {
            gameSettings.matchesToWin = 1;
        }
        // Ensure show20s exists
        if (gameSettings.show20s === undefined) {
            gameSettings.show20s = false;
        }
        // Ensure minPointsDifference exists
        if (gameSettings.minPointsDifference === undefined) {
            gameSettings.minPointsDifference = 2;
        }
        // Ensure showHammer exists
        if (gameSettings.showHammer === undefined) {
            gameSettings.showHammer = false;
        }
        // Ensure gameType exists
        if (gameSettings.gameType === undefined) {
            gameSettings.gameType = 'singles';
        }
        // Ensure gameMode exists
        if (gameSettings.gameMode === undefined) {
            gameSettings.gameMode = 'points';
        }
        // Ensure roundsToPlay exists
        if (gameSettings.roundsToPlay === undefined) {
            gameSettings.roundsToPlay = 4;
        }
    }
    if (savedTeam1) {
        team1 = JSON.parse(savedTeam1);
        // Ensure matches property exists
        if (team1.matches === undefined) {
            team1.matches = 0;
        }
        // Ensure twenty property exists
        if (team1.twenty === undefined) {
            team1.twenty = 0;
        }
        // Ensure hasWon property exists
        if (team1.hasWon === undefined) {
            team1.hasWon = false;
        }
        // Ensure hasHammer property exists
        if (team1.hasHammer === undefined) {
            team1.hasHammer = false;
        }
        // Ensure autoRounds property exists
        if (team1.autoRounds === undefined) {
            team1.autoRounds = 0;
        }
    }
    if (savedTeam2) {
        team2 = JSON.parse(savedTeam2);
        // Ensure matches property exists
        if (team2.matches === undefined) {
            team2.matches = 0;
        }
        // Ensure twenty property exists
        if (team2.twenty === undefined) {
            team2.twenty = 0;
        }
        // Ensure hasWon property exists
        if (team2.hasWon === undefined) {
            team2.hasWon = false;
        }
        // Ensure hasHammer property exists
        if (team2.hasHammer === undefined) {
            team2.hasHammer = false;
        }
        // Ensure autoRounds property exists
        if (team2.autoRounds === undefined) {
            team2.autoRounds = 0;
        }
    }

    // Initialize timer with configured time
    timeRemaining = gameSettings.timerMinutes * 60 + gameSettings.timerSeconds;

    updateDisplay();
    applyTeamColors();
    updateTimerVisibility();
    updateEventInfo();

    // Restaurar estado visual de victoria si existe
    if (team1.hasWon) {
        document.getElementById('team1Score').classList.add('winner');
        document.getElementById('team1Name').classList.add('winner');
    }
    if (team2.hasWon) {
        document.getElementById('team2Score').classList.add('winner');
        document.getElementById('team2Name').classList.add('winner');
    }
}

function saveData() {
    // Always save with current version
    gameSettings.appVersion = APP_VERSION;
    localStorage.setItem('crokinoleGame', JSON.stringify(gameSettings));
    localStorage.setItem('crokinoleTeam1', JSON.stringify(team1));
    localStorage.setItem('crokinoleTeam2', JSON.stringify(team2));
}

function saveMatchToHistory() {
    // Don't save if match just started (no meaningful data)
    if (matchStartTime === 0) return;

    const matchData = {
        matchId: matchStartTime.toString(),
        timestamp: matchStartTime,
        duration: Math.floor((Date.now() - matchStartTime) / 1000), // seconds
        gameMode: gameSettings.gameMode,
        metadata: {
            gameType: gameSettings.gameType,
            language: gameSettings.language,
            timerMinutes: gameSettings.timerMinutes,
            timerSeconds: gameSettings.timerSeconds,
            show20s: gameSettings.show20s,
            eventTitle: gameSettings.eventTitle || '',
            matchPhase: gameSettings.matchPhase || ''
        },
        teams: {
            team1: {
                name: team1.name,
                color: team1.color
            },
            team2: {
                name: team2.name,
                color: team2.color
            }
        }
    };

    // Add mode-specific data
    if (gameSettings.gameMode === 'points') {
        matchData.metadata.pointsToWin = gameSettings.pointsToWin;
        matchData.metadata.matchesToWin = gameSettings.matchesToWin;
        matchData.metadata.minPointsDifference = gameSettings.minPointsDifference;
        matchData.games = currentMatchGames;
    } else if (gameSettings.gameMode === 'rounds') {
        matchData.metadata.roundsToPlay = gameSettings.roundsToPlay;
        matchData.rounds = currentMatchRounds;
    }

    // Load existing history
    const historyJson = localStorage.getItem('crokinoleMatchHistory');
    let history = historyJson ? JSON.parse(historyJson) : { schemaVersion: '1.0.0', matchHistory: [] };

    // Ensure schema version exists
    if (!history.schemaVersion) {
        history.schemaVersion = '1.0.0';
    }

    // Add new match at the beginning (most recent first)
    history.matchHistory.unshift(matchData);

    // Keep only last 10 matches (FIFO)
    if (history.matchHistory.length > 10) {
        history.matchHistory = history.matchHistory.slice(0, 10);
    }

    // Save back to localStorage with error handling
    try {
        localStorage.setItem('crokinoleMatchHistory', JSON.stringify(history));
    } catch (e) {
        console.error('Failed to save match history:', e);
    }

    // Check if history modal is open and on current match tab
    const modal = document.getElementById('historyModal');
    const isModalOpen = modal && modal.style.display === 'flex';

    if (isModalOpen && activeHistoryTab === 'current') {
        // Switch to history tab since match just ended
        setTimeout(() => {
            switchHistoryTab('history');
        }, 500); // Small delay to let user see completion
    }

    // Reset tracking
    matchStartTime = 0;
    currentMatchGames = [];
    currentMatchRounds = [];
}

function openHistory() {
    closeQuickMenu();
    showMatchHistory();
}

function showMatchHistory() {
    const modal = document.getElementById('historyModal');

    // Determine which tab to show
    if (hasCurrentMatch()) {
        activeHistoryTab = 'current';
    } else {
        activeHistoryTab = 'history';
    }

    // Update tab translations
    updateHistoryTabTranslations();

    // Show modal
    modal.style.display = 'flex';

    // Switch to appropriate tab
    switchHistoryTab(activeHistoryTab);
}

/**
 * Render history list only
 */
function renderHistoryList() {
    const content = document.getElementById('historyContent');
    const empty = document.getElementById('historyEmpty');

    // Load history
    const historyJson = localStorage.getItem('crokinoleMatchHistory');
    const history = historyJson ? JSON.parse(historyJson) : { matchHistory: [] };

    if (history.matchHistory.length === 0) {
        content.style.display = 'none';
        empty.style.display = 'block';
    } else {
        content.style.display = 'flex';
        empty.style.display = 'none';

        // Render history entries
        content.innerHTML = history.matchHistory.map((match, index) => {
            return renderMatchEntry(match, index);
        }).join('');

        // Add event listeners for delete buttons
        content.querySelectorAll('.history-delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-index'));
                deleteHistoryEntry(index);
            });
        });
    }
}

function closeHistory() {
    document.getElementById('historyModal').style.display = 'none';
}

/**
 * Check if there's a match currently in progress
 */
function hasCurrentMatch() {
    if (matchStartTime === 0) return false;

    if (gameSettings.gameMode === 'points') {
        return currentMatchGames.length > 0 || team1.matches > 0 || team2.matches > 0;
    } else {
        return currentMatchRounds.length > 0 || roundsPlayed > 0;
    }
}

/**
 * Update tab text translations
 */
function updateHistoryTabTranslations() {
    const tabCurrentText = document.getElementById('tabCurrentMatchText');
    const tabHistoryText = document.getElementById('tabHistoryText');
    const currentEmptyText = document.getElementById('currentMatchEmptyText');

    if (tabCurrentText) tabCurrentText.textContent = t('currentMatch');
    if (tabHistoryText) tabHistoryText.textContent = t('matchHistory');
    if (currentEmptyText) currentEmptyText.textContent = t('noCurrentMatch');
}

/**
 * Switch between tabs in history modal
 */
function switchHistoryTab(tab) {
    activeHistoryTab = tab;

    const currentTab = document.getElementById('tabCurrentMatch');
    const historyTab = document.getElementById('tabHistory');
    const currentContent = document.getElementById('currentMatchContent');
    const historyContent = document.getElementById('historyContent');
    const historyEmpty = document.getElementById('historyEmpty');

    // Check if elements exist
    if (!currentTab || !historyTab || !currentContent || !historyContent || !historyEmpty) {
        console.error('History tab elements not found');
        return;
    }

    if (tab === 'current') {
        // Activate "Current Match" tab
        currentTab.classList.add('active');
        historyTab.classList.remove('active');
        currentContent.style.display = 'block';
        historyContent.style.display = 'none';
        historyEmpty.style.display = 'none';

        // Render current match
        renderCurrentMatch();
    } else {
        // Activate "History" tab
        currentTab.classList.remove('active');
        historyTab.classList.add('active');
        currentContent.style.display = 'none';

        // Render history list
        renderHistoryList();
    }
}

/**
 * Render current match in progress
 */
function renderCurrentMatch() {
    const display = document.getElementById('currentMatchDisplay');
    const empty = document.getElementById('currentMatchEmpty');

    if (!hasCurrentMatch()) {
        display.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    display.style.display = 'flex';

    // Calculate elapsed duration
    const duration = Math.floor((Date.now() - matchStartTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    let durationStr = '';
    if (minutes > 0 && seconds > 0) {
        durationStr = `${minutes}min ${seconds}s`;
    } else if (minutes > 0) {
        durationStr = `${minutes}min`;
    } else if (seconds > 0) {
        durationStr = `${seconds}s`;
    }

    // Build mode label
    let modeLabel = '';
    if (gameSettings.gameMode === 'points') {
        modeLabel = t('raceTo').replace('{points}', gameSettings.pointsToWin);
        if (gameSettings.matchesToWin > 1) {
            modeLabel += ` • ${t('bestOf').replace('{games}', gameSettings.matchesToWin * 2 - 1)}`;
        }
    } else {
        modeLabel = `${gameSettings.roundsToPlay} ${t('rounds')}`;
    }
    const typeLabel = gameSettings.gameType === 'singles' ? t('singles') : t('doubles');

    // Build event info
    let eventInfo = '';
    if (gameSettings.eventTitle || gameSettings.matchPhase) {
        const parts = [];
        if (gameSettings.eventTitle) parts.push(gameSettings.eventTitle);
        if (gameSettings.matchPhase) parts.push(gameSettings.matchPhase);
        eventInfo = `<div style="font-weight: 600; color: var(--accent-green); margin-bottom: 0.5rem;">${parts.join(' • ')}</div>`;
    }

    // Current score display
    let scoreDisplay = '';
    let total20sTeam1 = team1.twenty;
    let total20sTeam2 = team2.twenty;

    if (gameSettings.gameMode === 'points') {
        scoreDisplay = `${team1.matches} - ${team2.matches}`;
    } else {
        scoreDisplay = `${team1.points} - ${team2.points}`;
    }

    let twentyInfo = '';
    if (total20sTeam1 > 0 || total20sTeam2 > 0) {
        twentyInfo = ` <span style="font-size: 0.85rem; opacity: 0.75;">• ⭐ ${total20sTeam1}-${total20sTeam2}</span>`;
    }

    // Build header
    const headerHtml = `
        <div class="history-entry">
            <div class="history-header">
                <div style="flex: 1;">
                    ${eventInfo}
                    <div style="font-weight: 600; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem;">
                        <span style="color: ${team1.color};">${team1.name}</span>
                        <span style="color: var(--text-dim);">vs</span>
                        <span style="color: ${team2.color};">${team2.name}</span>
                    </div>
                    <div class="history-meta">
                        <div>${typeLabel} • ${modeLabel}</div>
                        <div>${t('duration')}: ${durationStr}</div>
                        <div>${t('rounds')}: ${roundsPlayed}</div>
                    </div>
                    <div class="history-result" style="color: var(--accent-green);">
                        ${t('inProgress')}: ${scoreDisplay}${twentyInfo}
                    </div>
                </div>
            </div>
            <div class="history-body">
                ${renderCurrentMatchRounds()}
            </div>
        </div>
    `;

    display.innerHTML = headerHtml;
}

/**
 * Render rounds/games of current match
 */
function renderCurrentMatchRounds() {
    if (gameSettings.gameMode === 'points') {
        // Render completed games + current game in progress
        let gamesHtml = '';

        // Render completed games
        currentMatchGames.forEach(game => {
            const team1Color = team1.color;
            const team2Color = team2.color;

            const game20sTeam1 = game.team1.twentyCount || 0;
            const game20sTeam2 = game.team2.twentyCount || 0;
            const twentyDisplay = (game20sTeam1 > 0 || game20sTeam2 > 0)
                ? ` <span style="font-size: 0.85rem; opacity: 0.75;">• ⭐ ${game20sTeam1}-${game20sTeam2}</span>`
                : '';

            const gameHeader = `<div style="font-weight: 600; margin-bottom: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem;">
                ${t('game')} ${game.gameNumber} - ${game.team1.finalPoints}-${game.team2.finalPoints}
                ${game.winner === 'team1' ? ` • ${team1.name}` : game.winner === 'team2' ? ` • ${team2.name}` : ''}
                ${twentyDisplay}
            </div>`;

            // Render rounds within game
            const roundsHtml = (game.rounds || []).map((round, ridx) => {
                const team1Hammer = round.team1.hadHammer ? '🔨 ' : '';
                const team2Hammer = round.team2.hadHammer ? '🔨 ' : '';

                const prevRound = ridx > 0 ? game.rounds[ridx - 1] : null;
                const team1RoundPoints = prevRound ? round.team1.pointsAfterRound - prevRound.team1.pointsAfterRound : round.team1.pointsAfterRound;
                const team2RoundPoints = prevRound ? round.team2.pointsAfterRound - prevRound.team2.pointsAfterRound : round.team2.pointsAfterRound;

                const show20s = gameSettings.show20s;
                const team1Twenty = show20s ? `⭐${round.team1.twentyCount || 0}` : (round.team1.twentyCount > 0 ? `⭐${round.team1.twentyCount}` : '');
                const team2Twenty = show20s ? `⭐${round.team2.twentyCount || 0}` : (round.team2.twentyCount > 0 ? `⭐${round.team2.twentyCount}` : '');

                return `
                    <div class="history-round-row">
                        <span class="history-round-label">${t('round')} ${round.roundNumber}</span>
                        <div class="history-team-score" style="background: ${team1Color}20; border-left: 3px solid ${team1Color};">
                            <span class="history-team-name">${team1.name}</span>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                                <span class="history-team-points">${team1Hammer}${team1RoundPoints}</span>
                                ${team1Twenty ? `<span style="font-size: 0.75rem;">${team1Twenty}</span>` : ''}
                            </div>
                        </div>
                        <div class="history-team-score" style="background: ${team2Color}20; border-left: 3px solid ${team2Color};">
                            <span class="history-team-name">${team2.name}</span>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                                <span class="history-team-points">${team2Hammer}${team2RoundPoints}</span>
                                ${team2Twenty ? `<span style="font-size: 0.75rem;">${team2Twenty}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            gamesHtml += `<div style="margin-bottom: 1rem;">${gameHeader}${roundsHtml}</div>`;
        });

        // Add current game in progress (if rounds have been played but game not complete)
        if (currentGameRounds.length > 0) {
            const currentGameNumber = currentMatchGames.length + 1;
            const team1Color = team1.color;
            const team2Color = team2.color;

            const gameHeader = `<div style="font-weight: 600; margin-bottom: 0.5rem; padding: 0.5rem; background: rgba(0,255,136,0.1); border: 1px solid var(--accent-green); border-radius: 0.5rem;">
                ${t('game')} ${currentGameNumber} - ${t('inProgress')}
            </div>`;

            const roundsHtml = currentGameRounds.map((round, ridx) => {
                const team1Hammer = round.team1.hadHammer ? '🔨 ' : '';
                const team2Hammer = round.team2.hadHammer ? '🔨 ' : '';

                const prevRound = ridx > 0 ? currentGameRounds[ridx - 1] : null;
                const team1RoundPoints = prevRound ? round.team1.pointsAfterRound - prevRound.team1.pointsAfterRound : round.team1.pointsAfterRound;
                const team2RoundPoints = prevRound ? round.team2.pointsAfterRound - prevRound.team2.pointsAfterRound : round.team2.pointsAfterRound;

                const show20s = gameSettings.show20s;
                const team1Twenty = show20s ? `⭐${round.team1.twentyCount || 0}` : (round.team1.twentyCount > 0 ? `⭐${round.team1.twentyCount}` : '');
                const team2Twenty = show20s ? `⭐${round.team2.twentyCount || 0}` : (round.team2.twentyCount > 0 ? `⭐${round.team2.twentyCount}` : '');

                return `
                    <div class="history-round-row">
                        <span class="history-round-label">${t('round')} ${round.roundNumber}</span>
                        <div class="history-team-score" style="background: ${team1Color}20; border-left: 3px solid ${team1Color};">
                            <span class="history-team-name">${team1.name}</span>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                                <span class="history-team-points">${team1Hammer}${team1RoundPoints}</span>
                                ${team1Twenty ? `<span style="font-size: 0.75rem;">${team1Twenty}</span>` : ''}
                            </div>
                        </div>
                        <div class="history-team-score" style="background: ${team2Color}20; border-left: 3px solid ${team2Color};">
                            <span class="history-team-name">${team2.name}</span>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                                <span class="history-team-points">${team2Hammer}${team2RoundPoints}</span>
                                ${team2Twenty ? `<span style="font-size: 0.75rem;">${team2Twenty}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            gamesHtml += `<div style="margin-bottom: 1rem;">${gameHeader}${roundsHtml}</div>`;
        }

        return gamesHtml;
    } else {
        // Render rounds for rounds mode
        const team1Color = team1.color;
        const team2Color = team2.color;

        return currentMatchRounds.map((round, idx) => {
            const team1Hammer = round.team1.hadHammer ? '🔨 ' : '';
            const team2Hammer = round.team2.hadHammer ? '🔨 ' : '';

            const prevRound = idx > 0 ? currentMatchRounds[idx - 1] : null;
            const team1RoundPoints = prevRound
                ? round.team1.pointsAfterRound - prevRound.team1.pointsAfterRound
                : round.team1.pointsAfterRound;
            const team2RoundPoints = prevRound
                ? round.team2.pointsAfterRound - prevRound.team2.pointsAfterRound
                : round.team2.pointsAfterRound;

            const show20s = gameSettings.show20s;
            const team1Twenty = show20s ? `⭐${round.team1.twentyCount || 0}` : (round.team1.twentyCount > 0 ? `⭐${round.team1.twentyCount}` : '');
            const team2Twenty = show20s ? `⭐${round.team2.twentyCount || 0}` : (round.team2.twentyCount > 0 ? `⭐${round.team2.twentyCount}` : '');

            return `
                <div class="history-round-row">
                    <span class="history-round-label">${t('round')} ${round.roundNumber}</span>
                    <div class="history-team-score" style="background: ${team1Color}20; border-left: 3px solid ${team1Color};">
                        <span class="history-team-name">${team1.name}</span>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                            <span class="history-team-points">${team1Hammer}${team1RoundPoints}</span>
                            ${team1Twenty ? `<span style="font-size: 0.75rem;">${team1Twenty}</span>` : ''}
                        </div>
                    </div>
                    <div class="history-team-score" style="background: ${team2Color}20; border-left: 3px solid ${team2Color};">
                        <span class="history-team-name">${team2.name}</span>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                            <span class="history-team-points">${team2Hammer}${team2RoundPoints}</span>
                            ${team2Twenty ? `<span style="font-size: 0.75rem;">${team2Twenty}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function renderMatchEntry(match, index) {
    const date = new Date(match.timestamp);
    // Formato corto: 25/12/25
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    const dateStr = `${day}/${month}/${year}`;

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    // Formatear duración real de la partida
    let durationStr = '';
    if (match.duration && match.duration > 0) {
        const totalSeconds = match.duration;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes > 0 && seconds > 0) {
            durationStr = `${minutes}min ${seconds}s`;
        } else if (minutes > 0) {
            durationStr = `${minutes}min`;
        } else if (seconds > 0) {
            durationStr = `${seconds}s`;
        }
    }

    let resultClass = 'tie';
    let resultText = '';
    let twentyInfo = '';

    if (match.gameMode === 'points') {
        // Calcular total de 20s sumando todos los games
        const total20sTeam1 = match.games.reduce((sum, game) => sum + (game.team1.twentyCount || 0), 0);
        const total20sTeam2 = match.games.reduce((sum, game) => sum + (game.team2.twentyCount || 0), 0);

        if (total20sTeam1 > 0 || total20sTeam2 > 0) {
            twentyInfo = ` <span style="font-size: 0.85rem; opacity: 0.75;">• ⭐ ${total20sTeam1}-${total20sTeam2}</span>`;
        }

        // Calcular wins contando games ganados
        const team1Wins = match.games.filter(g => g.winner === 'team1').length;
        const team2Wins = match.games.filter(g => g.winner === 'team2').length;

        if (team1Wins > team2Wins) {
            resultClass = 'team1-win';
            resultText = `${match.teams.team1.name} ${t('gana')} ${team1Wins}-${team2Wins}`;
        } else {
            resultClass = 'team2-win';
            resultText = `${match.teams.team2.name} ${t('gana')} ${team2Wins}-${team1Wins}`;
        }
    } else {
        // En rounds mode calculamos sumando todas las rondas
        const total20sTeam1 = match.rounds.reduce((sum, round) => sum + (round.team1.twentyCount || 0), 0);
        const total20sTeam2 = match.rounds.reduce((sum, round) => sum + (round.team2.twentyCount || 0), 0);

        if (total20sTeam1 > 0 || total20sTeam2 > 0) {
            twentyInfo = ` <span style="font-size: 0.85rem; opacity: 0.75;">• ⭐ ${total20sTeam1}-${total20sTeam2}</span>`;
        }

        // Calcular puntos finales sumando todas las rondas
        const lastRound = match.rounds[match.rounds.length - 1];
        const team1Points = lastRound ? lastRound.team1.pointsAfterRound : 0;
        const team2Points = lastRound ? lastRound.team2.pointsAfterRound : 0;

        if (team1Points > team2Points) {
            resultClass = 'team1-win';
            resultText = `${match.teams.team1.name} ${t('gana')} ${team1Points}-${team2Points}`;
        } else if (team2Points > team1Points) {
            resultClass = 'team2-win';
            resultText = `${match.teams.team2.name} ${t('gana')} ${team1Points}-${team2Points}`;
        } else {
            resultText = `${t('tie')} ${team1Points}-${team2Points}`;
        }
    }

    // Build mode label with details
    let modeLabel = '';
    if (match.gameMode === 'points') {
        const pointsToWin = match.metadata.pointsToWin || 7;
        const matchesToWin = match.metadata.matchesToWin || 1;
        modeLabel = t('raceTo').replace('{points}', pointsToWin);
        if (matchesToWin > 1) {
            modeLabel += ` • ${t('bestOf').replace('{games}', matchesToWin * 2 - 1)}`;
        }
    } else {
        const roundsToPlay = match.metadata.roundsToPlay || 4;
        modeLabel = `${roundsToPlay} ${t('rounds')}`;
    }
    const typeLabel = match.metadata.gameType === 'singles' ? t('singles') : t('doubles');

    let bodyHtml = '';

    if (match.gameMode === 'points') {
        bodyHtml = match.games.map(game => {
            const team1Color = match.teams.team1.color;
            const team2Color = match.teams.team2.color;

            // Game header with winner and total 20s
            const game20sTeam1 = game.team1.twentyCount || 0;
            const game20sTeam2 = game.team2.twentyCount || 0;
            const twentyDisplay = (game20sTeam1 > 0 || game20sTeam2 > 0)
                ? ` <span style="font-size: 0.85rem; opacity: 0.75;">• ⭐ ${game20sTeam1}-${game20sTeam2}</span>`
                : '';

            let gameHeader = `<div style="font-weight: 600; margin-bottom: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem;">
                ${t('game')} ${game.gameNumber} - ${game.team1.finalPoints}-${game.team2.finalPoints}
                ${game.winner === 'team1' ? ` • ${match.teams.team1.name}` : ` • ${match.teams.team2.name}`}
                ${twentyDisplay}
            </div>`;

            // Render rounds of this game
            const roundsHtml = (game.rounds || []).map((round, idx) => {
                const team1Hammer = round.team1.hadHammer ? '🔨 ' : '';
                const team2Hammer = round.team2.hadHammer ? '🔨 ' : '';

                // Calculate points won in this round
                const prevRound = idx > 0 ? game.rounds[idx - 1] : null;
                const team1RoundPoints = prevRound ? round.team1.pointsAfterRound - prevRound.team1.pointsAfterRound : round.team1.pointsAfterRound;
                const team2RoundPoints = prevRound ? round.team2.pointsAfterRound - prevRound.team2.pointsAfterRound : round.team2.pointsAfterRound;

                // Show 20s if enabled
                const show20s = match.metadata.show20s;
                const team1Twenty = show20s ? `⭐${round.team1.twentyCount || 0}` : (round.team1.twentyCount > 0 ? `⭐${round.team1.twentyCount}` : '');
                const team2Twenty = show20s ? `⭐${round.team2.twentyCount || 0}` : (round.team2.twentyCount > 0 ? `⭐${round.team2.twentyCount}` : '');

                return `
                    <div class="history-round-row">
                        <span class="history-round-label">${t('round')} ${round.roundNumber}</span>
                        <div class="history-team-score" style="background: ${team1Color}20; border-left: 3px solid ${team1Color};">
                            <span class="history-team-name">${match.teams.team1.name}</span>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                                <span class="history-team-points">${team1Hammer}${team1RoundPoints}</span>
                                ${team1Twenty ? `<span style="font-size: 0.75rem;">${team1Twenty}</span>` : ''}
                            </div>
                        </div>
                        <div class="history-team-score" style="background: ${team2Color}20; border-left: 3px solid ${team2Color};">
                            <span class="history-team-name">${match.teams.team2.name}</span>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                                <span class="history-team-points">${team2Hammer}${team2RoundPoints}</span>
                                ${team2Twenty ? `<span style="font-size: 0.75rem;">${team2Twenty}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            return `<div style="margin-bottom: 1rem;">${gameHeader}${roundsHtml}</div>`;
        }).join('');
    } else {
        bodyHtml = match.rounds.map((round, idx) => {
            const team1Color = match.teams.team1.color;
            const team2Color = match.teams.team2.color;
            const team1Hammer = round.team1.hadHammer ? '🔨 ' : '';
            const team2Hammer = round.team2.hadHammer ? '🔨 ' : '';

            // Calcular puntos ganados en esta ronda (diferencia con la anterior)
            const prevRound = idx > 0 ? match.rounds[idx - 1] : null;
            const team1RoundPoints = prevRound
                ? round.team1.pointsAfterRound - prevRound.team1.pointsAfterRound
                : round.team1.pointsAfterRound;
            const team2RoundPoints = prevRound
                ? round.team2.pointsAfterRound - prevRound.team2.pointsAfterRound
                : round.team2.pointsAfterRound;

            // Mostrar 20s si show20s estaba activo, incluso si es 0
            const show20s = match.metadata.show20s;
            const team1Twenty = show20s ? `⭐${round.team1.twentyCount || 0}` : (round.team1.twentyCount > 0 ? `⭐${round.team1.twentyCount}` : '');
            const team2Twenty = show20s ? `⭐${round.team2.twentyCount || 0}` : (round.team2.twentyCount > 0 ? `⭐${round.team2.twentyCount}` : '');

            return `
                <div class="history-round-row">
                    <span class="history-round-label">${t('round')} ${round.roundNumber}</span>
                    <div class="history-team-score" style="background: ${team1Color}20; border-left: 3px solid ${team1Color};">
                        <span class="history-team-name">${match.teams.team1.name}</span>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                            <span class="history-team-points">${team1Hammer}${team1RoundPoints}</span>
                            ${team1Twenty ? `<span style="font-size: 0.75rem;">${team1Twenty}</span>` : ''}
                        </div>
                    </div>
                    <div class="history-team-score" style="background: ${team2Color}20; border-left: 3px solid ${team2Color};">
                        <span class="history-team-name">${match.teams.team2.name}</span>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem;">
                            <span class="history-team-points">${team2Hammer}${team2RoundPoints}</span>
                            ${team2Twenty ? `<span style="font-size: 0.75rem;">${team2Twenty}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Event info
    const eventTitle = match.metadata.eventTitle || '';
    const matchPhase = match.metadata.matchPhase || '';
    let eventInfo = '';
    if (eventTitle || matchPhase) {
        const parts = [];
        if (eventTitle) parts.push(eventTitle);
        if (matchPhase) parts.push(matchPhase);
        eventInfo = `<div style="font-weight: 600; color: var(--accent-green); margin-bottom: 0.25rem;">${parts.join(' • ')}</div>`;
    }

    return `
        <div class="history-entry">
            <div class="history-header">
                <div style="flex: 1;">
                    ${eventInfo}
                    <div class="history-meta">
                        <div>${dateStr} ${timeStr}</div>
                        <div>${typeLabel} • ${modeLabel}${durationStr ? ' • ' + durationStr : ''}</div>
                    </div>
                    <div class="history-result ${resultClass}">${resultText}${twentyInfo}</div>
                </div>
                <button class="history-delete-btn" data-index="${index}">${t('delete')}</button>
            </div>
            <div class="history-body">
                ${bodyHtml}
            </div>
        </div>
    `;
}

function deleteHistoryEntry(index) {
    // Direct delete without confirmation to avoid sandbox issues
    const historyJson = localStorage.getItem('crokinoleMatchHistory');
    const history = historyJson ? JSON.parse(historyJson) : { matchHistory: [] };

    history.matchHistory.splice(index, 1);
    localStorage.setItem('crokinoleMatchHistory', JSON.stringify(history));

    // Refresh display
    showMatchHistory();
}

/**
 * Set Team 1 name and update display
 * @param {string} name - Team 1 name
 */
export function setTeam1Name(name) {
    team1.name = name;
    saveData();
    updateDisplay();
}

function updateDisplay() {
    document.getElementById('team1Score').textContent = team1.points;
    document.getElementById('team2Score').textContent = team2.points;

    // Update team names preserving the hammer indicator span
    const team1NameEl = document.getElementById('team1Name');
    const team2NameEl = document.getElementById('team2Name');

    // Get or create text node
    if (team1NameEl.childNodes.length === 0 || team1NameEl.childNodes[0].nodeType !== Node.TEXT_NODE) {
        team1NameEl.insertBefore(document.createTextNode(team1.name + ' '), team1NameEl.firstChild);
    } else {
        team1NameEl.childNodes[0].textContent = team1.name + ' ';
    }

    if (team2NameEl.childNodes.length === 0 || team2NameEl.childNodes[0].nodeType !== Node.TEXT_NODE) {
        team2NameEl.insertBefore(document.createTextNode(team2.name + ' '), team2NameEl.firstChild);
    } else {
        team2NameEl.childNodes[0].textContent = team2.name + ' ';
    }

    updateMatchesCounter();
    updateHammerIndicator();
}

function checkWinCondition() {
    if (gameSettings.gameMode === 'points') {
        // MODO PUNTOS: Victoria por alcanzar pointsToWin
        const pointsToWin = gameSettings.pointsToWin;
        const minDifference = gameSettings.minPointsDifference;

        if (team1.points >= pointsToWin && !team1.hasWon && (team1.points - team2.points) >= minDifference) {
            declareWinner(1);
        } else if (team2.points >= pointsToWin && !team2.hasWon && (team2.points - team1.points) >= minDifference) {
            declareWinner(2);
        }
    } else if (gameSettings.gameMode === 'rounds') {
        // MODO RONDAS: Victoria al completar roundsToPlay rondas
        if (roundsPlayed >= gameSettings.roundsToPlay) {
            // Rondas completadas - determinar ganador por puntos totales
            if (team1.points > team2.points && !team1.hasWon) {
                declareWinner(1);
            } else if (team2.points > team1.points && !team2.hasWon) {
                declareWinner(2);
            }
            // Si están empatados (team1.points === team2.points), no declarar ganador
        }
    }
}

function checkWinConditionOrTie() {
    if (gameSettings.gameMode === 'rounds') {
        if (roundsPlayed >= gameSettings.roundsToPlay) {
            if (team1.points > team2.points && !team1.hasWon) {
                declareWinner(1);
            } else if (team2.points > team1.points && !team2.hasWon) {
                declareWinner(2);
            } else if (team1.points === team2.points) {
                declareTie();
            }
        }
    } else {
        // In points mode, just use normal checkWinCondition
        checkWinCondition();
    }
}

function declareTie() {

    // Crear elemento overlay para mostrar mensaje de empate
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    overlay.style.zIndex = '9999';
    overlay.style.animation = 'fadeIn 0.5s ease-in-out';

    const tieMessage = document.createElement('div');
    tieMessage.textContent = t('tie');
    tieMessage.className = 'tie-message';
    tieMessage.style.fontWeight = 'bold';
    tieMessage.style.color = '#FFD700';
    tieMessage.style.textShadow = '0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.6)';
    tieMessage.style.animation = 'pulse 1.5s ease-in-out infinite';
    tieMessage.style.fontFamily = 'Orbitron, sans-serif';

    overlay.appendChild(tieMessage);
    document.body.appendChild(overlay);

    // Remover el overlay después de 4 segundos
    setTimeout(() => {
        overlay.style.animation = 'fadeOut 0.5s ease-in-out';
        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 500);
    }, 4000);

    // Save the tie state
    saveData();

    // Save match to history
    saveMatchToHistory();
}

function showConfetti(teamNumber) {
    const section = document.getElementById(`team${teamNumber}Section`);
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];

    // Create 50 confetti pieces
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';

        // Random color
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];

        // Random starting position across the team section
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = '0';

        // Random size
        const size = Math.random() * 10 + 5;
        confetti.style.width = size + 'px';
        confetti.style.height = size + 'px';

        // Random delay for staggered effect
        confetti.style.animationDelay = Math.random() * 0.5 + 's';

        // Random duration
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';

        section.appendChild(confetti);

        // Remove after animation
        setTimeout(() => {
            confetti.remove();
        }, 4000);
    }
}

function declareWinner(teamNumber) {
    const team = teamNumber === 1 ? team1 : team2;

    // Marcar estado de victoria
    team.hasWon = true;

    // Incrementar contador de matches del ganador (solo en modo points)
    if (gameSettings.gameMode === 'points') {
        team.matches = (team.matches || 0) + 1;
    }

    // Save who had the hammer AT THE START of this game (for alternating in next game)
    if (gameSettings.showHammer && currentGameStartHammer !== 0) {
        lastGameHammerTeam = currentGameStartHammer;
    }

    // Capture game data for points mode
    if (gameSettings.gameMode === 'points') {
        const gameData = {
            gameNumber: team1.matches + team2.matches,
            rounds: [...currentGameRounds], // Save rounds of this game
            team1: {
                finalPoints: team1.points,
                twentyCount: team1.twenty,
                hadHammerAtStart: currentGameStartHammer === 1
            },
            team2: {
                finalPoints: team2.points,
                twentyCount: team2.twenty,
                hadHammerAtStart: currentGameStartHammer === 2
            },
            winner: teamNumber === 1 ? 'team1' : 'team2'
        };
        currentMatchGames.push(gameData);

        // Reset game rounds for next game
        currentGameRounds = [];
    }

    // Agregar clase CSS de winner al score y al nombre
    document.getElementById(`team${teamNumber}Score`).classList.add('winner');
    document.getElementById(`team${teamNumber}Name`).classList.add('winner');

    // Check if this wins the overall match
    const matchWon = gameSettings.gameMode === 'rounds' || team.matches >= gameSettings.matchesToWin;

    if (matchWon) {
        // Match won! Add special celebration
        document.getElementById(`team${teamNumber}Name`).classList.add('match-winner');
        showConfetti(teamNumber);

        // Save match to history
        saveMatchToHistory();
    }

    // Actualizar display y guardar estado
    updateMatchesCounter();
    saveData();

    // User will manually reset using Reset Round button
    // Hammer will be toggled when Reset Round is pressed
}

function generateTwentyButtons(max) {
    const container = document.getElementById('twentyCalculator');
    container.innerHTML = '';

    for (let i = 0; i <= max; i++) {
        const btn = document.createElement('button');
        btn.className = 'twenty-calc-btn';
        btn.textContent = i;
        btn.onclick = () => selectTwentyValue(i);

        container.appendChild(btn);
    }
}

function selectTwentyValue(value) {
    const team = currentTwentyTeam === 1 ? team1 : team2;

    // Add value to team's twenty total
    team.twenty = (team.twenty || 0) + value;

    if (currentTwentyTeam === 1) {
        // Move to team 2
        currentTwentyTeam = 2;
        showTwentyInputForTeam(2);
    } else {
        // Done with both teams
        closeTwentyDialog();
        saveData();
    }
}

function showTwentyInputForTeam(teamNum) {
    const team = teamNum === 1 ? team1 : team2;
    const teamName = team.name;

    // Update title
    const titleText = t('twentyDialogTitle');
    document.getElementById('twentyDialogTitle').textContent = `${teamName}: ${titleText}`;

    // Generate buttons with appropriate max based on game type
    const maxTwenty = gameSettings.gameType === 'singles' ? MAX_TWENTY_SINGLES : MAX_TWENTY_DOUBLES;
    generateTwentyButtons(maxTwenty);

    // Apply team color to dialog and buttons
    const modal = document.querySelector('#twentyDialog .modal');
    modal.style.borderColor = team.color;

    const buttons = document.querySelectorAll('.twenty-calc-btn');
    const teamTextColor = getContrastColor(team.color);
    buttons.forEach(btn => {
        btn.style.backgroundColor = team.color;
        btn.style.borderColor = team.color;
        btn.style.color = teamTextColor;
    });

    // Show modal
    document.getElementById('twentyDialog').classList.add('active');
}

function openTwentyDialog() {
    // Start sequential flow
    currentTwentyTeam = 1;
    showTwentyInputForTeam(1);
}

function closeTwentyDialog() {
    document.getElementById('twentyDialog').classList.remove('active');
    currentTwentyTeam = 0;

    // Check if we need to check for winner/tie (in rounds mode after all rounds complete)
    const allRoundsCompleted = gameSettings.gameMode === 'rounds' && roundsPlayed >= gameSettings.roundsToPlay;

    if (allRoundsCompleted) {
        // Use checkWinConditionOrTie for rounds mode final check
        checkWinConditionOrTie();
    } else {
        // Normal flow - just check win condition
        checkWinCondition();
    }

    updateDisplay();
    saveData();
}


function updateHammerIndicator() {
    const team1Hammer = document.getElementById('team1Hammer');
    const team2Hammer = document.getElementById('team2Hammer');

    // Only show if setting is enabled
    if (gameSettings.showHammer) {
        team1Hammer.style.display = team1.hasHammer ? 'inline-block' : 'none';
        team2Hammer.style.display = team2.hasHammer ? 'inline-block' : 'none';
    } else {
        team1Hammer.style.display = 'none';
        team2Hammer.style.display = 'none';
    }
}

function updateEventInfo() {
    const eventTitleEl = document.getElementById('eventTitle');
    const matchPhaseEl = document.getElementById('matchPhase');
    const appNameEl = document.getElementById('appName');

    if (gameSettings.eventTitle && gameSettings.eventTitle.trim() !== '') {
        eventTitleEl.textContent = gameSettings.eventTitle;
        eventTitleEl.style.display = 'block';
    } else {
        eventTitleEl.style.display = 'none';
    }

    if (gameSettings.matchPhase && gameSettings.matchPhase.trim() !== '') {
        matchPhaseEl.textContent = gameSettings.matchPhase;
        matchPhaseEl.style.display = 'block';
    } else {
        matchPhaseEl.style.display = 'none';
    }

    // Always show app name
    if (appNameEl) {
        appNameEl.textContent = APP_NAME;
    }
}

function toggleHammer() {
    // Swap hammer between teams
    const temp = team1.hasHammer;
    team1.hasHammer = team2.hasHammer;
    team2.hasHammer = temp;

    updateHammerIndicator();

    // Open 20s dialog if the setting is enabled
    if (gameSettings.show20s) {
        openTwentyDialog();
    }
}

function updateMatchesCounter() {
    const team1MatchCounter = document.getElementById('team1MatchCounter');
    const team2MatchCounter = document.getElementById('team2MatchCounter');
    const team1CounterEl = document.getElementById('team1Counter');
    const team2CounterEl = document.getElementById('team2Counter');

    // En modo rounds, NO mostrar los contadores
    if (gameSettings.gameMode === 'rounds') {
        team1MatchCounter.classList.remove('visible');
        team2MatchCounter.classList.remove('visible');
        return;
    }

    // En modo points, mostrar solo si matchesToWin > 1
    const showCounter = gameSettings.matchesToWin > 1;

    if (showCounter) {
        // Modo points: mostrar solo número de matches
        const value1 = team1.matches || 0;
        const value2 = team2.matches || 0;

        team1CounterEl.textContent = value1;
        team2CounterEl.textContent = value2;

        // Apply team colors as backgrounds with contrast text
        const team1TextColor = getContrastColor(team1.color);
        const team2TextColor = getContrastColor(team2.color);

        team1MatchCounter.style.backgroundColor = team1.color;
        team1MatchCounter.style.color = team1TextColor;

        team2MatchCounter.style.backgroundColor = team2.color;
        team2MatchCounter.style.color = team2TextColor;

        team1MatchCounter.style.pointerEvents = 'auto';
        team2MatchCounter.style.pointerEvents = 'auto';
        team1MatchCounter.style.cursor = 'pointer';
        team2MatchCounter.style.cursor = 'pointer';

        team1MatchCounter.classList.add('visible');
        team2MatchCounter.classList.add('visible');
    } else {
        team1MatchCounter.classList.remove('visible');
        team2MatchCounter.classList.remove('visible');
    }
}

function incrementCounter(teamNum, event) {
    event.stopPropagation();

    // Check if match is already won - if so, don't allow incrementing
    const matchWon = team1.matches >= gameSettings.matchesToWin || team2.matches >= gameSettings.matchesToWin;
    if (matchWon) {
        return;
    }

    const team = teamNum === 1 ? team1 : team2;

    // Increment matches counter
    team.matches = (team.matches || 0) + 1;

    updateMatchesCounter();
    saveData();
}

function applyTeamColors() {
    document.getElementById('team1Section').style.background = team1.color;
    document.getElementById('team2Section').style.background = team2.color;

    // Calculate and apply text colors based on background luminance
    const team1TextColor = getContrastColor(team1.color);
    const team2TextColor = getContrastColor(team2.color);

    document.getElementById('team1Score').style.color = team1TextColor;
    document.getElementById('team1Name').style.color = team1TextColor;

    document.getElementById('team2Score').style.color = team2TextColor;
    document.getElementById('team2Name').style.color = team2TextColor;

    // Update header icons based on average background luminance
    updateHeaderIconsColor();
}

function updateHeaderIconsColor() {
    // Calculate luminance for each team
    const team1Luminance = getLuminance(team1.color);
    const team2Luminance = getLuminance(team2.color);
    const avgLuminance = (team1Luminance + team2Luminance) / 2;

    // Determine if each team's background is light
    const team1IsLight = team1Luminance >= 0.5;
    const team2IsLight = team2Luminance >= 0.5;
    const avgIsLight = avgLuminance >= 0.4;

    // Get orientation
    const isPortrait = window.innerHeight > window.innerWidth;

    // Update menu button (left side in landscape, top in portrait)
    const menuButton = document.getElementById('menuButton');
    if (menuButton) {
        if (isPortrait) {
            // In portrait, menu is at top over team1 section
            if (team1IsLight) {
                menuButton.classList.add('dark');
            } else {
                menuButton.classList.remove('dark');
            }
        } else {
            // In landscape, menu is on left over team1 section
            if (team1IsLight) {
                menuButton.classList.add('dark');
            } else {
                menuButton.classList.remove('dark');
            }
        }
    }

    // Update settings button (right side in landscape, top in portrait)
    const settingsButton = document.getElementById('settingsButton');
    if (settingsButton) {
        if (isPortrait) {
            // In portrait, settings is at top over team1 section
            if (team1IsLight) {
                settingsButton.classList.add('dark');
            } else {
                settingsButton.classList.remove('dark');
            }
        } else {
            // In landscape, settings is on right over team2 section
            if (team2IsLight) {
                settingsButton.classList.add('dark');
            } else {
                settingsButton.classList.remove('dark');
            }
        }
    }

    // Update timer display and reset button (center, use average)
    const timerDisplay = document.getElementById('timerDisplay');
    const timerResetBtn = document.querySelector('.timer-reset-btn');

    if (avgIsLight) {
        if (timerDisplay) timerDisplay.classList.add('dark');
        if (timerResetBtn) timerResetBtn.classList.add('dark');
    } else {
        if (timerDisplay) timerDisplay.classList.remove('dark');
        if (timerResetBtn) timerResetBtn.classList.remove('dark');
    }
}

function getLuminance(hexColor) {
    // Convert hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Calculate relative luminance
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Calculate luminance and return appropriate text color
function getContrastColor(hexColor) {
    const luminance = getLuminance(hexColor);
    // Return black for light backgrounds, white for dark backgrounds
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Track previous scores to detect round completion
let previousTeam1Points = 0;
let previousTeam2Points = 0;

function updateScore(teamNum, delta) {
    // Block score changes if someone has already won
    if (team1.hasWon || team2.hasWon) {
        return;
    }

    // Block score changes in rounds mode if all rounds are completed
    if (gameSettings.gameMode === 'rounds' && roundsPlayed >= gameSettings.roundsToPlay) {
        return;
    }

    const team = teamNum === 1 ? team1 : team2;
    const previousPoints = team.points;
    team.points = Math.max(0, team.points + delta);

    // Start match tracking on first point scored
    if (matchStartTime === 0 && delta > 0) {
        matchStartTime = Date.now();
    }

    // Check for round completion (for both hammer and rounds mode)
    if (delta > 0) {
        const team1Change = team1.points - previousTeam1Points;
        const team2Change = team2.points - previousTeam2Points;

        // Round complete when: +2 for one team OR +1 for each team
        const roundCompleted = (team1Change === 2 && team2Change === 0) ||
                              (team1Change === 0 && team2Change === 2) ||
                              (team1Change === 1 && team2Change === 1);

        // Check if this point wins the game
        const gameWon = team1.points >= gameSettings.pointsToWin || team2.points >= gameSettings.pointsToWin;

        // Check if match is already won (for hammer toggle, not for round detection)
        const matchWon = team1.matches >= gameSettings.matchesToWin || team2.matches >= gameSettings.matchesToWin;

        if (roundCompleted) {
            previousTeam1Points = team1.points;
            previousTeam2Points = team2.points;

            // Incrementar contador global de rondas (para modo rounds)
            roundsPlayed++;

            // Capture round data
            // Calculate 20s for THIS round only (difference from previous round)
            const team1RoundTwenty = team1.twenty - previousRoundTwenty1;
            const team2RoundTwenty = team2.twenty - previousRoundTwenty2;

            const roundData = {
                roundNumber: roundsPlayed,
                team1: {
                    pointsAfterRound: team1.points,
                    twentyCount: team1RoundTwenty,
                    hadHammer: team1.hasHammer
                },
                team2: {
                    pointsAfterRound: team2.points,
                    twentyCount: team2RoundTwenty,
                    hadHammer: team2.hasHammer
                }
            };

            if (gameSettings.gameMode === 'rounds') {
                currentMatchRounds.push(roundData);
            } else {
                // In points mode, track rounds within the current game
                currentGameRounds.push(roundData);
            }

            // Update previous round totals for next iteration
            previousRoundTwenty1 = team1.twenty;
            previousRoundTwenty2 = team2.twenty;

            // Actualizar display de contador
            updateMatchesCounter();

            // Check if all rounds are completed in rounds mode
            const allRoundsCompleted = gameSettings.gameMode === 'rounds' && roundsPlayed >= gameSettings.roundsToPlay;

            if (allRoundsCompleted) {
                // ALL ROUNDS COMPLETED IN ROUNDS MODE
                if (gameSettings.show20s) {
                    openTwentyDialog();
                    return; // checkWinCondition or declareTie will be called after dialog closes
                } else {
                    checkWinConditionOrTie();
                    updateDisplay();
                    saveData();
                }
            } else {
                // NORMAL ROUND COMPLETION (not final round OR points mode)
                // Toggle hammer if enabled (this may open 20s dialog via toggleHammer)
                if (gameSettings.showHammer) {
                    if (!gameWon && !matchWon) {
                        if (gameSettings.show20s) {
                            toggleHammer(); // This opens the 20s dialog
                            return; // Exit - checkWinCondition will be called after dialog closes
                        } else {
                            toggleHammer(); // Just toggle hammer, no dialog
                            // No 20s dialog, so check winner now
                            checkWinCondition();
                            updateDisplay();
                            saveData();
                        }
                    } else if (gameSettings.show20s) {
                        // Game/match won but need to open 20s dialog for this completed round
                        openTwentyDialog();
                        return; // Exit - checkWinCondition will be called after dialog closes
                    } else {
                        // Game/match won, no 20s dialog, check winner now
                        checkWinCondition();
                        updateDisplay();
                        saveData();
                    }
                } else {
                    // showHammer disabled, just check winner and update
                    checkWinCondition();
                    updateDisplay();
                    saveData();
                }
            }
        } else {
            // No round completed, just update display
            updateDisplay();
            saveData();
        }
    }

    const scoreElement = document.getElementById(`team${teamNum}Score`);
    scoreElement.classList.add('pulse');
    setTimeout(() => scoreElement.classList.remove('pulse'), 300);

    if (delta < 0) {
        const indicator = document.getElementById(`swipe${teamNum}`);
        indicator.classList.add('show');
        setTimeout(() => indicator.classList.remove('show'), 500);

        // Update display and save when decreasing score
        updateDisplay();
        saveData();
    }
}

// Quick Menu Functions
function toggleQuickMenu() {
    const menu = document.getElementById('quickMenu');
    const btnResetGame = document.getElementById('btnResetGame');

    // En modo rounds, ocultar el botón "Nueva Partida"
    if (gameSettings.gameMode === 'rounds') {
        btnResetGame.style.display = 'none';
    } else {
        btnResetGame.style.display = 'flex';
    }

    menu.classList.toggle('active');
}

function closeQuickMenu() {
    const menu = document.getElementById('quickMenu');
    menu.classList.remove('active');
}

function resetGame() {
    // Check if match is won - if so, call resetMatch instead
    const matchWon = team1.matches >= gameSettings.matchesToWin || team2.matches >= gameSettings.matchesToWin;
    if (matchWon) {
        resetMatch();
        return;
    }

    // Check if there was a previous game in this match and hammer is enabled
    if (gameSettings.showHammer && lastGameHammerTeam !== 0) {
        // Alternate hammer: the team that did NOT have the hammer in the last game gets it now
        if (lastGameHammerTeam === 1) {
            team1.hasHammer = false;
            team2.hasHammer = true;
        } else {
            team1.hasHammer = true;
            team2.hasHammer = false;
        }
    }

    // Save who has the hammer AT THE START of this new game
    if (gameSettings.showHammer) {
        currentGameStartHammer = team1.hasHammer ? 1 : 2;
    }

    team1.points = 0;
    team2.points = 0;
    team1.twenty = 0;
    team2.twenty = 0;
    team1.hasWon = false;
    team2.hasWon = false;
    team1.autoRounds = 0;
    team2.autoRounds = 0;

    // Reset tracking variables for round detection
    previousTeam1Points = 0;
    previousTeam2Points = 0;
    previousRoundTwenty1 = 0;
    previousRoundTwenty2 = 0;
    roundsPlayed = 0;

    // Remover clases winner
    document.getElementById('team1Score').classList.remove('winner');
    document.getElementById('team2Score').classList.remove('winner');
    document.getElementById('team1Name').classList.remove('winner');
    document.getElementById('team2Name').classList.remove('winner');

    // Reactivar interacciones de los scores
    document.getElementById('team1Score').style.pointerEvents = 'auto';
    document.getElementById('team2Score').style.pointerEvents = 'auto';

    updateDisplay();
    saveData();
    resetTimer();
    closeQuickMenu();
}

function resetMatch() {
    // Reset matchStartedBy to force hammer selection dialog
    matchStartedBy = 0;

    // Only show hammer selection dialog if showHammer is enabled
    if (gameSettings.showHammer) {
        // Always show dialog when resetting match
        openHammerDialog();
    } else {
        // Reset directly without hammer selection
        lastGameHammerTeam = 0; // Reset game hammer tracking
        completeResetMatch();
    }
}

function completeResetMatch() {
    // This function is called AFTER hammer selection
    team1.points = 0;
    team1.rounds = 0;
    team1.autoRounds = 0;
    team1.matches = 0;
    team1.twenty = 0;
    team1.hasWon = false;
    // hasHammer is set by hammer dialog

    team2.points = 0;
    team2.rounds = 0;
    team2.autoRounds = 0;
    team2.matches = 0;
    team2.twenty = 0;
    team2.hasWon = false;
    // hasHammer is set by hammer dialog

    // Reset tracking variables for round detection
    previousTeam1Points = 0;
    previousTeam2Points = 0;
    roundsPlayed = 0;

    // Reset match history tracking
    matchStartTime = 0;
    currentMatchGames = [];
    currentMatchRounds = [];
    currentGameRounds = [];
    previousRoundTwenty1 = 0;
    previousRoundTwenty2 = 0;

    // Remover clases winner y match-winner
    document.getElementById('team1Score').classList.remove('winner');
    document.getElementById('team2Score').classList.remove('winner');
    document.getElementById('team1Name').classList.remove('winner', 'match-winner');
    document.getElementById('team2Name').classList.remove('winner', 'match-winner');

    // Reactivar interacciones de los scores
    document.getElementById('team1Score').style.pointerEvents = 'auto';
    document.getElementById('team2Score').style.pointerEvents = 'auto';

    updateDisplay();
    saveData();
    stopTimer();

    // Check if history modal is open and on current match tab
    const modal = document.getElementById('historyModal');
    const isModalOpen = modal && modal.style.display === 'flex';

    if (isModalOpen && activeHistoryTab === 'current') {
        // Refresh current match display (will show empty state)
        renderCurrentMatch();
    }
    resetTimer();
    closeQuickMenu();
}

function openHammerDialog() {
    // Update team names in dialog
    document.getElementById('hammerTeam1Name').textContent = team1.name;
    document.getElementById('hammerTeam2Name').textContent = team2.name;

    // Update title and subtitle with translations
    document.getElementById('hammerDialogTitle').textContent = t('hammerDialogTitle');
    document.getElementById('hammerDialogSubtitle').textContent = t('hammerDialogSubtitle');

    // Apply team colors to buttons
    const btn1 = document.getElementById('btnHammerTeam1');
    const btn2 = document.getElementById('btnHammerTeam2');

    btn1.style.borderColor = team1.color;
    btn1.style.background = `${team1.color}15`;

    btn2.style.borderColor = team2.color;
    btn2.style.background = `${team2.color}15`;

    // Show modal
    document.getElementById('hammerDialog').classList.add('active');
}

function closeHammerDialog() {
    document.getElementById('hammerDialog').classList.remove('active');
}

function selectStartingTeam(teamNumber) {
    // Team that starts SHOOTING FIRST does NOT get hammer
    // The OTHER team gets the hammer (shoots last)
    if (teamNumber === 1) {
        team1.hasHammer = false;
        team2.hasHammer = true;
        matchStartedBy = 1; // Team 1 started this match
        lastGameHammerTeam = 2; // Track who has hammer for first game
        currentGameStartHammer = 2; // Track hammer at start of first game
    } else {
        team1.hasHammer = true;
        team2.hasHammer = false;
        matchStartedBy = 2; // Team 2 started this match
        lastGameHammerTeam = 1; // Track who has hammer for first game
        currentGameStartHammer = 1; // Track hammer at start of first game
    }

    closeHammerDialog();
    completeResetMatch();
}

function switchSides() {
    // Swap team data
    const tempTeam = {
        name: team1.name,
        color: team1.color,
        points: team1.points,
        rounds: team1.rounds,
        matches: team1.matches,
        twenty: team1.twenty,
        hasWon: team1.hasWon,
        hasHammer: team1.hasHammer
    };

    team1.name = team2.name;
    team1.color = team2.color;
    team1.points = team2.points;
    team1.rounds = team2.rounds;
    team1.matches = team2.matches;
    team1.twenty = team2.twenty;
    team1.hasWon = team2.hasWon;
    team1.hasHammer = team2.hasHammer;

    team2.name = tempTeam.name;
    team2.color = tempTeam.color;
    team2.points = tempTeam.points;
    team2.rounds = tempTeam.rounds;
    team2.matches = tempTeam.matches;
    team2.twenty = tempTeam.twenty;
    team2.hasWon = tempTeam.hasWon;
    team2.hasHammer = tempTeam.hasHammer;

    // Actualizar clases winner después del intercambio
    document.getElementById('team1Score').classList.remove('winner');
    document.getElementById('team2Score').classList.remove('winner');
    document.getElementById('team1Name').classList.remove('winner');
    document.getElementById('team2Name').classList.remove('winner');
    if (team1.hasWon) {
        document.getElementById('team1Score').classList.add('winner');
        document.getElementById('team1Name').classList.add('winner');
    }
    if (team2.hasWon) {
        document.getElementById('team2Score').classList.add('winner');
        document.getElementById('team2Name').classList.add('winner');
    }

    updateDisplay();
    applyTeamColors();
    saveData();
    closeQuickMenu();
}

function switchColors() {
    // Swap only the colors
    const tempColor = team1.color;
    team1.color = team2.color;
    team2.color = tempColor;

    applyTeamColors();
    saveData();
    closeQuickMenu();
}

// Timer functions
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
    document.getElementById('timerDisplay').textContent = formatTime(timeRemaining);
}

function toggleTimer() {
    if (timerRunning) {
        stopTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    if (timeRemaining <= 0) {
        // Reset to configured time
        timeRemaining = gameSettings.timerMinutes * 60 + gameSettings.timerSeconds;
    }

    timerRunning = true;
    document.getElementById('timerDisplay').classList.add('running');

    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();

        if (timeRemaining <= 0) {
            stopTimer();
            timeRemaining = 0;
            onTimerEnd();
        }
    }, 1000);
}

function onTimerEnd() {
    // Play beep sound
    playBeep();

    // Show TIME OUT message
    const timerDisplay = document.getElementById('timerDisplay');
    const originalText = timerDisplay.textContent;
    timerDisplay.textContent = t('timeOut');
    timerDisplay.style.color = 'var(--accent-red)';
    timerDisplay.classList.add('pulse');

    // Restore original display after 3 seconds
    setTimeout(() => {
        timerDisplay.textContent = originalText;
        timerDisplay.style.color = '';
        timerDisplay.classList.remove('pulse');
    }, 3000);
}

function playBeep() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Set frequency (higher = higher pitch)
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        // Set volume
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        // Play beep
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        // Audio not supported
    }
}

function stopTimer() {
    timerRunning = false;
    document.getElementById('timerDisplay').classList.remove('running');
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function resetTimer() {
    stopTimer();
    timeRemaining = gameSettings.timerMinutes * 60 + gameSettings.timerSeconds;
    updateTimerDisplay();
}

function updateTimerVisibility() {
    const timerContainer = document.querySelector('.timer-container');
    const totalTime = gameSettings.timerMinutes * 60 + gameSettings.timerSeconds;

    if (totalTime === 0) {
        timerContainer.classList.add('hidden');
    } else {
        timerContainer.classList.remove('hidden');
    }
}

function clearTimerSettings() {
    document.getElementById('timerMinutes').value = 0;
    document.getElementById('timerSeconds').value = 0;
}

function toggleGameModeSettings() {
    const mode = document.getElementById('gameModeSelect').value;
    const groupPointsToWin = document.getElementById('groupPointsToWin');
    const groupRoundsToPlay = document.getElementById('groupRoundsToPlay');
    const groupMatchesToWin = document.getElementById('groupMatchesToWin');

    if (mode === 'points') {
        groupPointsToWin.style.display = 'block';
        groupRoundsToPlay.style.display = 'none';
        if (groupMatchesToWin) groupMatchesToWin.style.display = 'block';
    } else if (mode === 'rounds') {
        groupPointsToWin.style.display = 'none';
        groupRoundsToPlay.style.display = 'block';
        if (groupMatchesToWin) groupMatchesToWin.style.display = 'none';
    }
}

// Number Input Spinners
function incrementNumber(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;
    const max = parseInt(input.getAttribute('max'));
    if (max && currentValue >= max) return;
    input.value = currentValue + 1;

    // Sync with state and check win condition for team points/rounds
    syncNumberInputToState(inputId);
}

function decrementNumber(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;
    const min = parseInt(input.getAttribute('min'));
    // For number-control-display, use explicit min attribute or default to 1
    // Team points/rounds have min="0", pointsToWin/matchesToWin don't have min so default to 1
    const minValue = !isNaN(min) ? min : 1;
    if (currentValue <= minValue) return;
    input.value = currentValue - 1;

    // Sync with state and check win condition for team points/rounds
    syncNumberInputToState(inputId);
}

function syncNumberInputToState(inputId) {
    // Update team state when points or rounds change
    if (inputId === 'team1Points') {
        team1.points = parseInt(document.getElementById('team1Points').value) || 0;
        updateDisplay();
        checkWinCondition();
        saveData();
    } else if (inputId === 'team2Points') {
        team2.points = parseInt(document.getElementById('team2Points').value) || 0;
        updateDisplay();
        checkWinCondition();
        saveData();
    } else if (inputId === 'team1Rounds') {
        team1.rounds = parseInt(document.getElementById('team1Rounds').value) || 0;
        updateRoundsPlayed();
        updateDisplay();
        checkWinCondition();
        saveData();
    } else if (inputId === 'team2Rounds') {
        team2.rounds = parseInt(document.getElementById('team2Rounds').value) || 0;
        updateRoundsPlayed();
        updateDisplay();
        checkWinCondition();
        saveData();
    }
}

// Timer minutes spinners (with padding)
function incrementTimerMinutes() {
    const input = document.getElementById('timerMinutes');
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;
    const newValue = currentValue + 1;
    input.value = newValue.toString().padStart(2, '0');
}

function decrementTimerMinutes() {
    const input = document.getElementById('timerMinutes');
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;
    if (currentValue <= 0) return;
    const newValue = currentValue - 1;
    input.value = newValue.toString().padStart(2, '0');
}

// Timer seconds spinners (special logic: 0, 15, 30, 45 cycle)
function incrementTimerSeconds() {
    const input = document.getElementById('timerSeconds');
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;

    // Cycle: 0 -> 15 -> 30 -> 45 -> 0
    if (currentValue < 15) {
        input.value = '15';
    } else if (currentValue < 30) {
        input.value = '30';
    } else if (currentValue < 45) {
        input.value = '45';
    } else {
        input.value = '00';
    }
}

function decrementTimerSeconds() {
    const input = document.getElementById('timerSeconds');
    if (!input) return;
    const currentValue = parseInt(input.value) || 0;

    // Cycle backwards: 45 <- 30 <- 15 <- 0 <- 45
    if (currentValue <= 0) {
        input.value = '45';
    } else if (currentValue <= 15) {
        input.value = '00';
    } else if (currentValue <= 30) {
        input.value = '15';
    } else {
        input.value = '30';
    }
}

// Settings Modal
function openSettings() {
    document.getElementById('pointsToWin').value = gameSettings.pointsToWin;
    document.getElementById('matchesToWin').value = gameSettings.matchesToWin;
    document.getElementById('show20sCheckbox').checked = gameSettings.show20s;
    document.getElementById('showHammerCheckbox').checked = gameSettings.showHammer;
    document.getElementById('gameTypeSelect').value = gameSettings.gameType;
    document.getElementById('timerMinutes').value = gameSettings.timerMinutes.toString().padStart(2, '0');
    document.getElementById('timerSeconds').value = gameSettings.timerSeconds.toString().padStart(2, '0');
    document.getElementById('languageSelect').value = gameSettings.language;
    document.getElementById('gameModeSelect').value = gameSettings.gameMode;
    document.getElementById('roundsToPlay').value = gameSettings.roundsToPlay;
    document.getElementById('eventTitleInput').value = gameSettings.eventTitle || '';
    document.getElementById('matchPhaseInput').value = gameSettings.matchPhase || '';
    toggleGameModeSettings(); // Mostrar/ocultar configuraciones según modo

    document.getElementById('team1NameInput').value = team1.name;
    document.getElementById('team1Points').value = team1.points;
    document.getElementById('team1Rounds').value = team1.rounds;
    document.getElementById('team1ColorPreview').style.background = team1.color;

    document.getElementById('team2NameInput').value = team2.name;
    document.getElementById('team2Points').value = team2.points;
    document.getElementById('team2Rounds').value = team2.rounds;
    document.getElementById('team2ColorPreview').style.background = team2.color;

    document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function saveSettings() {
    try {
        gameSettings.pointsToWin = parseInt(document.getElementById('pointsToWin').value) || 0;
        gameSettings.matchesToWin = parseInt(document.getElementById('matchesToWin').value) || 1;
        gameSettings.show20s = document.getElementById('show20sCheckbox').checked;
        gameSettings.showHammer = document.getElementById('showHammerCheckbox').checked;
        gameSettings.gameType = document.getElementById('gameTypeSelect').value;
        gameSettings.timerMinutes = parseInt(document.getElementById('timerMinutes').value) || 0;
        gameSettings.timerSeconds = parseInt(document.getElementById('timerSeconds').value) || 0;
        gameSettings.language = document.getElementById('languageSelect').value;
        gameSettings.gameMode = document.getElementById('gameModeSelect').value;
        gameSettings.roundsToPlay = parseInt(document.getElementById('roundsToPlay').value);
        gameSettings.eventTitle = document.getElementById('eventTitleInput').value || '';
        gameSettings.matchPhase = document.getElementById('matchPhaseInput').value || '';

        team1.name = document.getElementById('team1NameInput').value || 'Team 1';
        team1.points = parseInt(document.getElementById('team1Points').value) || 0;
        team1.rounds = parseInt(document.getElementById('team1Rounds').value) || 0;

        team2.name = document.getElementById('team2NameInput').value || 'Team 2';
        team2.points = parseInt(document.getElementById('team2Points').value) || 0;
        team2.rounds = parseInt(document.getElementById('team2Rounds').value) || 0;

        updateDisplay();
        applyTeamColors();
        resetTimer();
        updateTimerVisibility();
        updateHammerIndicator();
        updateEventInfo();
        updateUILanguage();
        saveData();
        closeSettings();
    } catch (error) {
        console.error('Error in saveSettings:', error);
        alert('Error saving settings: ' + error.message);
    }
}

function updateUILanguage() {
    // Update quick menu - Using IDs instead of indices for robustness
    const textResetGame = document.getElementById('textResetGame');
    const textResetMatch = document.getElementById('textResetMatch');
    const textSwitchSides = document.getElementById('textSwitchSides');
    const textSwitchColors = document.getElementById('textSwitchColors');
    const textSignIn = document.getElementById('textSignIn');
    const textLogout = document.getElementById('textLogout');

    if (textResetGame) textResetGame.textContent = t('newGame');
    if (textResetMatch) textResetMatch.textContent = t('newMatch');
    if (textSwitchSides) textSwitchSides.textContent = t('switchSides');
    if (textSwitchColors) textSwitchColors.textContent = t('switchColors');
    if (textSignIn) textSignIn.textContent = t('signIn');
    if (textLogout) textLogout.textContent = t('logout');

    // Update settings modal
    document.querySelector('#settingsModal .modal-title').textContent = t('settings');
    const btnSettingsCancel = document.getElementById('btnSettingsCancel');
    const btnSettingsSave = document.getElementById('btnSettingsSave');
    if (btnSettingsCancel) btnSettingsCancel.textContent = t('cancel');
    if (btnSettingsSave) btnSettingsSave.textContent = t('save');

    // Update history modal
    const historyTitle = document.getElementById('historyTitle');
    const btnHistoryClose = document.getElementById('btnHistoryClose');
    const historyEmptyText = document.getElementById('historyEmptyText');
    if (historyTitle) historyTitle.textContent = t('matchHistory');
    if (btnHistoryClose) btnHistoryClose.textContent = t('close');
    if (historyEmptyText) historyEmptyText.textContent = t('noHistory');

    // Update section titles
    const titleMatchSettings = document.getElementById('titleMatchSettings');
    const titleTeam1 = document.getElementById('titleTeam1');
    const titleTeam2 = document.getElementById('titleTeam2');
    const titleAppearance = document.getElementById('titleAppearance');
    const titleOthers = document.getElementById('titleOthers');

    if (titleMatchSettings) titleMatchSettings.textContent = t('matchSettings');
    if (titleTeam1) titleTeam1.textContent = t('team') + ' 1';
    if (titleTeam2) titleTeam2.textContent = t('team') + ' 2';
    if (titleAppearance) titleAppearance.textContent = t('appearance');
    if (titleOthers) titleOthers.textContent = t('others');

    // Update input labels in Match Settings using IDs
    const labelGameMode = document.getElementById('labelGameMode');
    if (labelGameMode) labelGameMode.textContent = t('gameMode');

    const labelPointsToWin = document.getElementById('labelPointsToWin');
    if (labelPointsToWin) labelPointsToWin.textContent = t('pointsToWin');

    const labelRoundsToPlay = document.getElementById('labelRoundsToPlay');
    if (labelRoundsToPlay) labelRoundsToPlay.textContent = t('roundsToPlay');

    document.getElementById('labelGameType').textContent = t('gameType');
    document.getElementById('labelLanguage').textContent = t('language');
    document.getElementById('labelMatchesToWin').textContent = t('matchesToWin');
    document.getElementById('labelTimer').textContent = t('timer');

    // Update gameMode options
    const optionModePoints = document.getElementById('optionModePoints');
    if (optionModePoints) optionModePoints.textContent = t('modePoints');

    const optionModeRounds = document.getElementById('optionModeRounds');
    if (optionModeRounds) optionModeRounds.textContent = t('modeRounds');

    // Update gameType options
    document.getElementById('optionSingles').textContent = t('singles');
    document.getElementById('optionDoubles').textContent = t('doubles');

    // Update Team 1 labels using IDs
    document.getElementById('labelTeam1Name').textContent = t('name');
    document.getElementById('labelTeam1Color').textContent = t('color');
    document.getElementById('labelTeam1Points').textContent = t('points');
    document.getElementById('labelTeam1Rounds').textContent = t('rounds');

    // Update Team 2 labels using IDs
    document.getElementById('labelTeam2Name').textContent = t('name');
    document.getElementById('labelTeam2Color').textContent = t('color');
    document.getElementById('labelTeam2Points').textContent = t('points');
    document.getElementById('labelTeam2Rounds').textContent = t('rounds');

    // Update checkbox labels using IDs
    document.getElementById('labelShow20s').textContent = t('show20s');
    document.getElementById('labelShowHammer').textContent = t('showHammer');

    // Update event info labels
    document.getElementById('labelEventTitle').textContent = t('eventTitle');
    document.getElementById('labelMatchPhase').textContent = t('matchPhase');

    // Update color picker buttons using IDs
    document.getElementById('spanTeam1ChooseColor').textContent = t('chooseColor');
    document.getElementById('spanTeam2ChooseColor').textContent = t('chooseColor');

    // Update appearance section
    const btnPresetColors = document.getElementById('btnPresetColors');
    if (btnPresetColors) btnPresetColors.textContent = t('presetColors');

    // Update others section buttons
    const btnRateApp = document.getElementById('btnRateApp');
    const btnShareApp = document.getElementById('btnShareApp');
    const btnGiveFeedback = document.getElementById('btnGiveFeedback');

    if (btnRateApp) btnRateApp.textContent = '⭐ ' + t('rateApp');
    if (btnShareApp) btnShareApp.textContent = '📤 ' + t('shareApp');
    if (btnGiveFeedback) btnGiveFeedback.textContent = '💬 ' + t('giveFeedback');

    // Update color picker modal
    const colorPickerTitle = document.getElementById('colorPickerTitle');
    if (colorPickerTitle.textContent.includes('Team') || colorPickerTitle.textContent.includes('Equip')) {
        const teamNum = colorPickerTitle.textContent.match(/\d+/)[0];
        colorPickerTitle.textContent = t('chooseColor') + ' - ' + t('team') + ' ' + teamNum;
    }

    // Update color picker modal buttons
    const btnColorPickerCancel = document.getElementById('btnColorPickerCancel');
    const btnColorPickerSave = document.getElementById('btnColorPickerSave');
    if (btnColorPickerCancel) btnColorPickerCancel.textContent = t('cancel');
    if (btnColorPickerSave) btnColorPickerSave.textContent = t('save');

    // Update color tabs
    const tabColorPrimary = document.getElementById('tabColorPrimary');
    const tabColorWheel = document.getElementById('tabColorWheel');
    if (tabColorPrimary) tabColorPrimary.textContent = t('primary');
    if (tabColorWheel) tabColorWheel.textContent = t('wheel');

    // Update preset colors modal
    document.querySelector('#presetColorsModal .modal-title').textContent = t('presetColors');

    // Update "TIME OUT" message if needed
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay.textContent === 'TIME OUT' || timerDisplay.textContent === 'TIEMPO' || timerDisplay.textContent === 'TEMPS') {
        timerDisplay.textContent = t('timeOut');
    }

    // Update profile modal
    const profileModalTitle = document.getElementById('profileModalTitle');
    const btnCloseProfile = document.getElementById('btnCloseProfile');
    const profileEmailLabel = document.getElementById('profileEmailLabel');
    const profileUidLabel = document.getElementById('profileUidLabel');
    const profileRankingLabel = document.getElementById('profileRankingLabel');
    const profilePlayerNameLabel = document.getElementById('profilePlayerNameLabel');
    const profileRanking = document.getElementById('profileRanking');
    const btnUpdateProfile = document.getElementById('btnUpdateProfile');

    if (profileModalTitle) profileModalTitle.textContent = t('myProfile');
    if (btnCloseProfile) btnCloseProfile.textContent = t('close');
    if (profileEmailLabel) profileEmailLabel.textContent = t('email');
    if (profileUidLabel) profileUidLabel.textContent = t('userId');
    if (profileRankingLabel) profileRankingLabel.textContent = t('ranking');
    if (profilePlayerNameLabel) profilePlayerNameLabel.textContent = t('playerName');
    if (profileRanking) profileRanking.textContent = t('comingSoon');
    if (btnUpdateProfile) btnUpdateProfile.textContent = t('updateProfile');

    // Update player name modal
    const playerNameModalTitle = document.getElementById('playerNameModalTitle');
    const playerNameLabel = document.getElementById('playerNameLabel');
    const btnSavePlayerName = document.getElementById('btnSavePlayerName');

    if (playerNameModalTitle) playerNameModalTitle.textContent = t('setPlayerName');
    if (playerNameLabel) playerNameLabel.textContent = t('playerNameDescription');
    if (btnSavePlayerName) btnSavePlayerName.textContent = t('save');
}

// Color Picker
function openColorPicker(teamNum) {
    currentColorTeam = teamNum;
    const team = teamNum === 1 ? team1 : team2;
    tempColor = team.color;

    document.getElementById('colorPickerTitle').textContent = `${t('chooseColor')} - ${t('team')} ${teamNum}`;
    generateColorGrid();
    document.getElementById('colorWheel').value = tempColor;
    document.getElementById('colorPickerModal').classList.add('active');
}

function closeColorPicker() {
    document.getElementById('colorPickerModal').classList.remove('active');
}

function saveColor() {
    const team = currentColorTeam === 1 ? team1 : team2;
    team.color = tempColor;
    document.getElementById(`team${currentColorTeam}ColorPreview`).style.background = tempColor;
    closeColorPicker();
}

function switchColorTab(tab) {
    // Update tab buttons
    const tabPrimary = document.getElementById('tabColorPrimary');
    const tabWheel = document.getElementById('tabColorWheel');

    if (tab === 'primary') {
        tabPrimary.classList.add('active');
        tabWheel.classList.remove('active');
        document.getElementById('colorPrimaryContainer').style.display = 'block';
        document.getElementById('colorWheelContainer').classList.remove('active');
    } else {
        tabPrimary.classList.remove('active');
        tabWheel.classList.add('active');
        document.getElementById('colorPrimaryContainer').style.display = 'none';
        document.getElementById('colorWheelContainer').classList.add('active');
    }
}

function generateColorGrid() {
    const grid = document.getElementById('colorGrid');
    grid.innerHTML = '';

    primaryColors.forEach(color => {
        const div = document.createElement('div');
        div.className = 'color-option';
        div.style.background = color;
        if (color === tempColor) div.classList.add('selected');
        div.onclick = () => {
            tempColor = color;
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
            div.classList.add('selected');
        };
        grid.appendChild(div);
    });
}

document.getElementById('colorWheel').addEventListener('input', (e) => {
    tempColor = e.target.value;
});

// Preset Colors
let selectedPresetColor = null;

function openPresetColors() {
    // Reset to color selector view
    selectedPresetColor = null;
    document.getElementById('presetColorSelector').style.display = 'block';
    document.getElementById('presetCombinationsContainer').style.display = 'none';
    generatePresetColorGrid();
    updatePresetTexts();
    document.getElementById('presetColorsModal').classList.add('active');
}

function closePresetColors() {
    document.getElementById('presetColorsModal').classList.remove('active');
}

function backToColorSelector() {
    selectedPresetColor = null;
    document.getElementById('presetColorSelector').style.display = 'block';
    document.getElementById('presetCombinationsContainer').style.display = 'none';
}

function generatePresetColorGrid() {
    const grid = document.getElementById('presetColorGrid');
    grid.innerHTML = '';

    primaryColors.forEach(color => {
        const div = document.createElement('div');
        div.className = 'preset-color-option';
        div.style.background = color;
        div.onclick = () => {
            selectedPresetColor = color;
            showPresetCombinations(color);
        };
        grid.appendChild(div);
    });
}

function showPresetCombinations(color) {
    // Filter presets that include the selected color
    const filteredPresets = presets.filter(p => p.team1 === color || p.team2 === color);

    // Show combinations view
    document.getElementById('presetColorSelector').style.display = 'none';
    document.getElementById('presetCombinationsContainer').style.display = 'block';

    // Generate grid with filtered combinations
    const grid = document.getElementById('presetGrid');
    grid.innerHTML = '';

    filteredPresets.forEach(preset => {
        const div = document.createElement('div');
        div.className = 'preset-item';
        div.onclick = () => {
            // Apply preset immediately
            team1.color = preset.team1;
            team2.color = preset.team2;
            document.getElementById('team1ColorPreview').style.background = preset.team1;
            document.getElementById('team2ColorPreview').style.background = preset.team2;
            applyTeamColors();
            saveData();
            // Close modal
            closePresetColors();
        };

        const half1 = document.createElement('div');
        half1.className = 'preset-half';
        half1.style.background = preset.team1;
        half1.style.color = getContrastColor(preset.team1);
        half1.textContent = '42';

        const half2 = document.createElement('div');
        half2.className = 'preset-half';
        half2.style.background = preset.team2;
        half2.style.color = getContrastColor(preset.team2);
        half2.textContent = '35';

        div.appendChild(half1);
        div.appendChild(half2);
        grid.appendChild(div);
    });
}

function updatePresetTexts() {
    const title = document.getElementById('presetColorsTitle');
    const instruction = document.getElementById('presetInstruction');
    const backBtn = document.getElementById('presetBackBtn');

    if (title) title.textContent = t('presetColors');
    if (instruction) instruction.textContent = t('chooseFirstColor');
    if (backBtn) backBtn.textContent = '← ' + t('back');
}

// Other actions
function rateApp() {
    alert('Thank you for your interest! Rate functionality would open app store.');
}

function shareApp() {
    if (navigator.share) {
        navigator.share({
            title: 'Scorekinole',
            text: 'Check out this Crokinole scoring app!',
            url: window.location.href
        });
    } else {
        alert('Share: ' + window.location.href);
    }
}

function giveFeedback() {
    window.open('https://github.com/xavierclotet/scorekinole/issues/new', '_blank');
}

// Score handlers
function setupScoreHandlers() {
    ['team1Section', 'team2Section'].forEach((id, index) => {
        const element = document.getElementById(id);
        const teamNum = index + 1;

        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchStartY[teamNum] = e.touches[0].clientY;
            touchStartTime[teamNum] = Date.now();
        });

        element.addEventListener('touchend', (e) => {
            e.preventDefault();
            const deltaY = e.changedTouches[0].clientY - touchStartY[teamNum];
            const deltaTime = Date.now() - touchStartTime[teamNum];

            if (deltaTime < TAP_TIME_THRESHOLD && Math.abs(deltaY) < 20) {
                updateScore(teamNum, 1);
            } else if (deltaY > SWIPE_THRESHOLD) {
                // Swipe down - decrease
                updateScore(teamNum, -1);
            } else if (deltaY < -SWIPE_THRESHOLD) {
                // Swipe up - increase
                updateScore(teamNum, 1);
            }
        });

        element.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            mouseStartY[teamNum] = e.clientY;
            mouseStartTime[teamNum] = Date.now();
            isMouseDown[teamNum] = true;
        });

        element.addEventListener('mouseup', (e) => {
            if (e.button !== 0 || !isMouseDown[teamNum]) return;

            const deltaY = e.clientY - mouseStartY[teamNum];
            const deltaTime = Date.now() - mouseStartTime[teamNum];
            isMouseDown[teamNum] = false;

            if (deltaTime < TAP_TIME_THRESHOLD && Math.abs(deltaY) < 20) {
                // Click - increase
                updateScore(teamNum, 1);
            } else if (deltaY > SWIPE_THRESHOLD) {
                // Drag down - decrease
                updateScore(teamNum, -1);
            } else if (deltaY < -SWIPE_THRESHOLD) {
                // Drag up - increase
                updateScore(teamNum, 1);
            }
        });

        element.addEventListener('mouseleave', () => {
            isMouseDown[teamNum] = false;
        });
    });
}

// Update header icons on window resize (orientation change)
window.addEventListener('resize', () => {
    updateHeaderIconsColor();
});

// Close quick menu when clicking outside
document.addEventListener('click', (e) => {
    const quickMenu = document.getElementById('quickMenu');
    const quickMenuContainer = document.querySelector('.quick-menu-container');

    if (!quickMenuContainer.contains(e.target)) {
        closeQuickMenu();
    }
});

// Close modals on overlay click
document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') closeSettings();
});

document.getElementById('colorPickerModal').addEventListener('click', (e) => {
    if (e.target.id === 'colorPickerModal') closeColorPicker();
});

document.getElementById('presetColorsModal').addEventListener('click', (e) => {
    if (e.target.id === 'presetColorsModal') closePresetColors();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSettings();
        closeColorPicker();
        closePresetColors();
    }
});

// Setup number control buttons with fast touch events
function setupNumberControlButtons() {
    // Handle all number-control-btn buttons (pointsToWin, matchesToWin)
    document.querySelectorAll('.number-control-btn').forEach(button => {
        const action = button.getAttribute('data-action');
        const target = button.getAttribute('data-target');

        if (!action || !target) return;

        const handler = (e) => {
            e.preventDefault(); // Prevent 300ms delay on mobile
            if (action === 'increment') {
                incrementNumber(target);
            } else if (action === 'decrement') {
                decrementNumber(target);
            }
        };

        // Use touchstart for mobile (instant response)
        button.addEventListener('touchstart', handler, { passive: false });
        // Use click for desktop/mouse
        button.addEventListener('click', handler);
    });

    // Handle timer spinner buttons
    document.querySelectorAll('.spinner-btn').forEach(button => {
        const action = button.getAttribute('data-action');

        if (!action) return;

        const handler = (e) => {
            e.preventDefault(); // Prevent 300ms delay on mobile
            switch(action) {
                case 'increment-timer-minutes':
                    incrementTimerMinutes();
                    break;
                case 'decrement-timer-minutes':
                    decrementTimerMinutes();
                    break;
                case 'increment-timer-seconds':
                    incrementTimerSeconds();
                    break;
                case 'decrement-timer-seconds':
                    decrementTimerSeconds();
                    break;
            }
        };

        // Use touchstart for mobile (instant response)
        button.addEventListener('touchstart', handler, { passive: false });
        // Use click for desktop/mouse
        button.addEventListener('click', handler);
    });

    // Handle timer clear button
    const timerClearBtn = document.getElementById('timerClearBtn');
    if (timerClearBtn) {
        const handler = (e) => {
            e.preventDefault(); // Prevent 300ms delay on mobile
            clearTimerSettings();
        };

        timerClearBtn.addEventListener('touchstart', handler, { passive: false });
        timerClearBtn.addEventListener('click', handler);
    }
}

// Prevent double-tap zoom
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Load version
function loadVersion() {
    const versionDisplay = document.getElementById('versionDisplay');
    if (versionDisplay) {
        versionDisplay.textContent = APP_NAME + ' v' + APP_VERSION;
    }
}

// History Button Draggable
function setupDraggableHistoryBtn() {
    const historyBtn = document.getElementById('historyBtn');
    if (!historyBtn) return;

    let isDragging = false;
    let dragStartTime = 0;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    // Apply saved position or default
    function applyPosition() {
        const x = gameSettings.historyBtnX;
        const y = gameSettings.historyBtnY;

        if (x !== null && y !== null) {
            historyBtn.style.left = x + 'px';
            historyBtn.style.top = y + 'px';
        } else {
            // Default position: left center
            historyBtn.style.left = '0.5rem';
            historyBtn.style.top = 'calc(50% - 1.75rem)';
        }
    }

    // Constrain position to viewport
    function constrainPosition(x, y) {
        const rect = historyBtn.getBoundingClientRect();
        const margin = 10; // Minimum distance from edges

        const minX = margin;
        const maxX = window.innerWidth - rect.width - margin;
        const minY = margin;
        const maxY = window.innerHeight - rect.height - margin;

        x = Math.max(minX, Math.min(maxX, x));
        y = Math.max(minY, Math.min(maxY, y));

        return { x, y };
    }

    // Save position to localStorage
    function savePosition(x, y) {
        gameSettings.historyBtnX = x;
        gameSettings.historyBtnY = y;
        saveData();
    }

    // Touch start
    function onTouchStart(e) {
        dragStartTime = Date.now();
        const touch = e.touches[0];
        const rect = historyBtn.getBoundingClientRect();

        startX = touch.clientX - rect.left;
        startY = touch.clientY - rect.top;
        currentX = rect.left;
        currentY = rect.top;

        isDragging = false;
    }

    // Touch move
    function onTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const newX = touch.clientX - startX;
        const newY = touch.clientY - startY;

        // Check if moved enough to be considered dragging
        const distance = Math.sqrt(Math.pow(newX - currentX, 2) + Math.pow(newY - currentY, 2));
        if (distance > 5) {
            isDragging = true;
            historyBtn.classList.add('dragging');
        }

        if (isDragging) {
            const constrained = constrainPosition(newX, newY);
            historyBtn.style.left = constrained.x + 'px';
            historyBtn.style.top = constrained.y + 'px';
            currentX = constrained.x;
            currentY = constrained.y;
        }
    }

    // Touch end
    function onTouchEnd(e) {
        historyBtn.classList.remove('dragging');

        const dragDuration = Date.now() - dragStartTime;

        if (isDragging) {
            // Was dragging, save position
            savePosition(currentX, currentY);
        } else if (dragDuration < 300) {
            // Was a quick tap, open history
            openHistory();
        }

        isDragging = false;
    }

    // Mouse events (for desktop testing)
    function onMouseDown(e) {
        dragStartTime = Date.now();
        const rect = historyBtn.getBoundingClientRect();

        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        currentX = rect.left;
        currentY = rect.top;

        isDragging = false;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        const newX = e.clientX - startX;
        const newY = e.clientY - startY;

        const distance = Math.sqrt(Math.pow(newX - currentX, 2) + Math.pow(newY - currentY, 2));
        if (distance > 5) {
            isDragging = true;
            historyBtn.classList.add('dragging');
        }

        if (isDragging) {
            const constrained = constrainPosition(newX, newY);
            historyBtn.style.left = constrained.x + 'px';
            historyBtn.style.top = constrained.y + 'px';
            currentX = constrained.x;
            currentY = constrained.y;
        }
    }

    function onMouseUp(e) {
        historyBtn.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const dragDuration = Date.now() - dragStartTime;

        if (isDragging) {
            savePosition(currentX, currentY);
        } else if (dragDuration < 300) {
            openHistory();
        }

        isDragging = false;
    }

    // Attach event listeners
    historyBtn.addEventListener('touchstart', onTouchStart, { passive: false });
    historyBtn.addEventListener('touchmove', onTouchMove, { passive: false });
    historyBtn.addEventListener('touchend', onTouchEnd);
    historyBtn.addEventListener('mousedown', onMouseDown);

    // Apply initial position
    applyPosition();

    // Reapply position on orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (gameSettings.historyBtnX !== null && gameSettings.historyBtnY !== null) {
                const constrained = constrainPosition(gameSettings.historyBtnX, gameSettings.historyBtnY);
                historyBtn.style.left = constrained.x + 'px';
                historyBtn.style.top = constrained.y + 'px';
                savePosition(constrained.x, constrained.y);
            }
        }, 300);
    });
}

// Initialize
loadVersion();
loadData();
updateDisplay();
applyTeamColors();
setupScoreHandlers();
setupNumberControlButtons();
setupDraggableHistoryBtn();
updateTimerDisplay();
updateUILanguage();
updateMatchesCounter();
updateHammerIndicator();
updateEventInfo();

// Expose functions to global scope for onclick handlers
window.toggleQuickMenu = toggleQuickMenu;
window.resetGame = resetGame;
window.resetMatch = resetMatch;
window.switchSides = switchSides;
window.switchColors = switchColors;
window.toggleTimer = toggleTimer;
window.resetTimer = resetTimer;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.openColorPicker = openColorPicker;
window.closeColorPicker = closeColorPicker;
window.saveColor = saveColor;
window.switchColorTab = switchColorTab;
window.openPresetColors = openPresetColors;
window.backToColorSelector = backToColorSelector;
window.rateApp = rateApp;
window.shareApp = shareApp;
window.giveFeedback = giveFeedback;
window.incrementCounter = incrementCounter;
window.selectStartingTeam = selectStartingTeam;
window.closeHistory = closeHistory;
window.switchHistoryTab = switchHistoryTab;
