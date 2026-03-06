/**
 * Integration tests for friendly ↔ tournament mode transitions.
 *
 * These tests simulate the exact sequence of store operations that
 * +page.svelte performs when entering/exiting tournament mode, verifying
 * that settings, teams, and match state are properly saved/restored.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock constants
vi.mock('$lib/constants', () => ({
	APP_VERSION: '2.4.81',
	DEFAULT_GAME_SETTINGS: {
		appVersion: '2.4.81',
		pointsToWin: 7,
		timerMinutes: 10,
		timerSeconds: 0,
		showTimer: true,
		matchesToWin: 1,
		show20s: false,
		showHammer: false,
		showScoreTable: true,
		gameType: 'singles' as const,
		gameMode: 'rounds' as const,
		roundsToPlay: 4,
		allowTiesInRoundsMode: true,
		eventTitle: '',
		matchPhase: '',
		timerX: null,
		timerY: null,
		matchScoreSize: 'medium',
		mainScoreSize: 'medium',
		nameSize: 'medium',
		lastTournamentResult: null
	}
}));

// Mock history module
const { mockAddRoundToCurrentMatch, mockResetCurrentMatch } = vi.hoisted(() => ({
	mockAddRoundToCurrentMatch: vi.fn(),
	mockResetCurrentMatch: vi.fn()
}));
vi.mock('./history', () => ({
	resetCurrentMatch: mockResetCurrentMatch,
	addRoundToCurrentMatch: mockAddRoundToCurrentMatch,
	startCurrentMatch: vi.fn()
}));

// Mock localStorage
const localStorageMock = {
	store: {} as Record<string, string>,
	getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
	setItem: vi.fn((key: string, value: string) => {
		localStorageMock.store[key] = value;
	}),
	removeItem: vi.fn((key: string) => {
		delete localStorageMock.store[key];
	}),
	clear: vi.fn(() => {
		localStorageMock.store = {};
	})
};
vi.stubGlobal('localStorage', localStorageMock);

import { get } from 'svelte/store';
import { team1, team2, resetTeams, updateTeam } from './teams';
import { gameSettings } from './gameSettings';
import {
	resetMatchState,
	matchStartedBy,
	matchStartTime,
	roundsPlayed,
	lastRoundPoints,
	currentMatchGames,
	currentGameRounds,
	completeRound,
	addGame,
	startMatch
} from './matchState';
import {
	gameTournamentContext,
	setTournamentContext,
	clearTournamentContext,
	getTournamentContext
} from './tournamentContext';
import type { TournamentMatchContext } from './tournamentContext';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PRE_TOURNAMENT_BACKUP_KEY = 'crokinolePreTournamentBackup';

/** Friendly settings the user has configured */
const friendlySettings = {
	gameMode: 'points' as const,
	pointsToWin: 100,
	roundsToPlay: 4,
	matchesToWin: 2,
	show20s: true,
	showHammer: true,
	gameType: 'doubles' as const,
	allowTiesInRoundsMode: false,
	showScoreTable: false,
	timerMinutes: 5,
	timerSeconds: 30,
	showTimer: true
};

/** Team data before tournament */
const friendlyTeam1 = {
	name: 'Eagles',
	color: '#FF0000',
	userId: 'user-alice',
	userPhotoURL: 'http://alice.jpg',
	partner: { name: 'Partner A', userId: 'user-pa', userPhotoURL: 'http://pa.jpg' }
};

const friendlyTeam2 = {
	name: 'Hawks',
	color: '#0000FF',
	userId: 'user-bob',
	userPhotoURL: 'http://bob.jpg',
	partner: { name: 'Partner B', userId: 'user-pb', userPhotoURL: null }
};

function makeTournamentContext(overrides: Partial<TournamentMatchContext> = {}): TournamentMatchContext {
	return {
		tournamentId: 'tour-1',
		tournamentKey: 'ABC123',
		tournamentName: 'Regional Championship',
		matchId: 'match-1',
		phase: 'GROUP',
		participantAId: 'p-carlos',
		participantBId: 'p-diana',
		participantAName: 'Carlos',
		participantBName: 'Diana',
		currentUserId: 'user-alice',
		currentUserSide: 'A',
		gameConfig: {
			gameMode: 'rounds',
			roundsToPlay: 4,
			matchesToWin: 1,
			show20s: false,
			showHammer: true,
			gameType: 'singles',
			timeLimitMinutes: 15
		},
		...overrides
	};
}

/**
 * Simulates what handleTournamentMatchStarted() does in +page.svelte:
 * 1. Save backup (if none exists)
 * 2. Set tournament context
 * 3. Apply tournament config to settings/teams
 */
function simulateEnterTournament(context: TournamentMatchContext) {
	// Step 1: Save backup (only if none exists — matches line 1108)
	if (!localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)) {
		const t1 = get(team1);
		const t2 = get(team2);
		const settings = get(gameSettings);
		const backup = {
			team1Name: t1.name,
			team1Color: t1.color,
			team1UserId: t1.userId,
			team1UserPhotoURL: t1.userPhotoURL,
			team1Partner: t1.partner,
			team2Name: t2.name,
			team2Color: t2.color,
			team2UserId: t2.userId,
			team2UserPhotoURL: t2.userPhotoURL,
			team2Partner: t2.partner,
			gameMode: settings.gameMode,
			pointsToWin: settings.pointsToWin,
			roundsToPlay: settings.roundsToPlay,
			matchesToWin: settings.matchesToWin,
			show20s: settings.show20s,
			showHammer: settings.showHammer,
			gameType: settings.gameType,
			allowTiesInRoundsMode: settings.allowTiesInRoundsMode,
			showScoreTable: settings.showScoreTable,
			timerMinutes: settings.timerMinutes,
			timerSeconds: settings.timerSeconds,
			showTimer: settings.showTimer
		};
		localStorage.setItem(PRE_TOURNAMENT_BACKUP_KEY, JSON.stringify(backup));
	}

	// Step 2: Set tournament context
	setTournamentContext(context);

	// Step 3: Apply tournament config (matches applyTournamentConfig lines 819-836)
	const config = context.gameConfig;
	gameSettings.update(s => ({
		...s,
		gameMode: config.gameMode,
		pointsToWin: config.pointsToWin || 7,
		roundsToPlay: config.roundsToPlay || 4,
		matchesToWin: config.matchesToWin,
		show20s: config.show20s,
		showHammer: config.showHammer,
		gameType: config.gameType,
		eventTitle: context.tournamentName,
		eventEdition: context.tournamentEdition,
		matchPhase: 'Fase de Grupos',
		lastTournamentResult: null,
		...(config.timeLimitMinutes != null
			? { showTimer: true, timerMinutes: config.timeLimitMinutes, timerSeconds: 0 }
			: { showTimer: false })
	}));

	// Reset match state (line 839)
	resetMatchState();

	// Apply team names from tournament (lines 907-936)
	const isUserSideA = context.currentUserSide === 'A';
	updateTeam(1, {
		name: isUserSideA ? context.participantAName : context.participantBName,
		userId: null,
		userPhotoURL: null,
		partner: undefined,
		points: 0,
		rounds: 0,
		matches: 0,
		twenty: 0,
		hasWon: false
	});
	updateTeam(2, {
		name: isUserSideA ? context.participantBName : context.participantAName,
		userId: null,
		userPhotoURL: null,
		partner: undefined,
		points: 0,
		rounds: 0,
		matches: 0,
		twenty: 0,
		hasWon: false
	});
}

/**
 * Simulates exitTournamentMode() from +page.svelte (lines 595-620)
 */
function simulateExitTournamentMode(restoreImmediately = true) {
	clearTournamentContext();

	const backupStr = localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY);
	const backup = backupStr ? (() => { try { return JSON.parse(backupStr); } catch { return null; } })() : null;

	gameSettings.update(s => ({
		...s,
		eventTitle: '',
		eventEdition: undefined,
		matchPhase: '',
		...(backup?.gameType ? { gameType: backup.gameType } : {})
	}));

	if (restoreImmediately) {
		simulateRestorePreTournamentData();
	}
}

/**
 * Simulates restorePreTournamentData() from +page.svelte (lines 627-677)
 */
function simulateRestorePreTournamentData() {
	const backupStr = localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY);
	if (!backupStr) return;

	try {
		const backup = JSON.parse(backupStr);

		updateTeam(1, {
			name: backup.team1Name,
			color: backup.team1Color,
			userId: backup.team1UserId ?? null,
			userPhotoURL: backup.team1UserPhotoURL ?? null,
			partner: backup.team1Partner ?? undefined
		});
		updateTeam(2, {
			name: backup.team2Name,
			color: backup.team2Color,
			userId: backup.team2UserId ?? null,
			userPhotoURL: backup.team2UserPhotoURL ?? null,
			partner: backup.team2Partner ?? undefined
		});

		gameSettings.update(s => ({
			...s,
			gameMode: backup.gameMode ?? s.gameMode,
			pointsToWin: backup.pointsToWin ?? s.pointsToWin,
			roundsToPlay: backup.roundsToPlay ?? s.roundsToPlay,
			matchesToWin: backup.matchesToWin ?? s.matchesToWin,
			show20s: backup.show20s ?? s.show20s,
			showHammer: backup.showHammer ?? s.showHammer,
			gameType: backup.gameType ?? s.gameType,
			allowTiesInRoundsMode: backup.allowTiesInRoundsMode ?? s.allowTiesInRoundsMode,
			showScoreTable: backup.showScoreTable ?? s.showScoreTable,
			timerMinutes: backup.timerMinutes ?? s.timerMinutes,
			timerSeconds: backup.timerSeconds ?? s.timerSeconds,
			showTimer: backup.showTimer ?? s.showTimer
		}));

		gameSettings.save();
		localStorage.removeItem(PRE_TOURNAMENT_BACKUP_KEY);
	} catch {
		localStorage.removeItem(PRE_TOURNAMENT_BACKUP_KEY);
	}
}

/**
 * Simulates handleResetMatch() from +page.svelte (lines 1658-1681)
 */
function simulateHandleResetMatch() {
	if (getTournamentContext()) {
		simulateExitTournamentMode();
	}
	// Restore deferred pre-tournament data if pending (from completed tournament match)
	simulateRestorePreTournamentData();
	gameSettings.update(s => ({ ...s, lastTournamentResult: null }));
	resetTeams();
	resetMatchState();
}

/**
 * Simulates pauseTournamentMatch() from +page.svelte (lines 1443-1457)
 */
function simulatePauseTournamentMatch() {
	simulateExitTournamentMode();
	resetTeams();
	resetMatchState();
}

/**
 * Set up friendly state before each test
 */
function setupFriendlyState() {
	// Set friendly team data
	updateTeam(1, { ...friendlyTeam1 });
	updateTeam(2, { ...friendlyTeam2 });

	// Set friendly game settings
	gameSettings.update(s => ({ ...s, ...friendlySettings, eventTitle: '', matchPhase: '' }));
	gameSettings.save();
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();
	localStorageMock.store = {};

	// Reset all stores to defaults
	resetMatchState();
	gameTournamentContext.set(null);
	vi.clearAllMocks();
});

describe('Friendly → Tournament transition', () => {
	it('applies tournament settings correctly, overriding friendly settings', () => {
		setupFriendlyState();

		simulateEnterTournament(makeTournamentContext());

		const settings = get(gameSettings);
		expect(settings.gameMode).toBe('rounds');
		expect(settings.matchesToWin).toBe(1);
		expect(settings.show20s).toBe(false);
		expect(settings.showHammer).toBe(true);
		expect(settings.gameType).toBe('singles');
		expect(settings.timerMinutes).toBe(15);
		expect(settings.timerSeconds).toBe(0);
		expect(settings.showTimer).toBe(true);
		expect(settings.eventTitle).toBe('Regional Championship');
		expect(settings.matchPhase).toBe('Fase de Grupos');
	});

	it('replaces team names with tournament participant names', () => {
		setupFriendlyState();

		simulateEnterTournament(makeTournamentContext());

		expect(get(team1).name).toBe('Carlos');
		expect(get(team2).name).toBe('Diana');
	});

	it('clears user assignments and partner data from teams', () => {
		setupFriendlyState();

		// Verify friendly state has user data
		expect(get(team1).userId).toBe('user-alice');
		expect(get(team1).partner).toBeDefined();

		simulateEnterTournament(makeTournamentContext());

		expect(get(team1).userId).toBeNull();
		expect(get(team1).userPhotoURL).toBeNull();
		expect(get(team1).partner).toBeUndefined();
		expect(get(team2).userId).toBeNull();
		expect(get(team2).partner).toBeUndefined();
	});

	it('saves backup to localStorage', () => {
		setupFriendlyState();

		simulateEnterTournament(makeTournamentContext());

		const backupStr = localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY);
		expect(backupStr).not.toBeNull();

		const backup = JSON.parse(backupStr!);
		expect(backup.team1Name).toBe('Eagles');
		expect(backup.team2Name).toBe('Hawks');
		expect(backup.gameMode).toBe('points');
		expect(backup.timerMinutes).toBe(5);
		expect(backup.timerSeconds).toBe(30);
		expect(backup.gameType).toBe('doubles');
		expect(backup.team1UserId).toBe('user-alice');
		expect(backup.team1Partner).toBeDefined();
	});

	it('resets match state when entering tournament', () => {
		setupFriendlyState();
		vi.spyOn(Date, 'now').mockReturnValue(1000000);
		completeRound(2, 0, 0, 0, 1); // simulate mid-game

		simulateEnterTournament(makeTournamentContext());

		expect(get(roundsPlayed)).toBe(0);
		expect(get(currentGameRounds)).toEqual([]);
		expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });
	});

	it('does not overwrite existing backup (multiple matches)', () => {
		setupFriendlyState();

		simulateEnterTournament(makeTournamentContext());

		// Modify team names while in tournament
		updateTeam(1, { name: 'Modified' });

		// Exit and re-enter a different tournament match
		simulateExitTournamentMode();

		// Backup was deleted by exit, so a new one should be saved
		// with the RESTORED friendly data (not "Modified")
		simulateEnterTournament(makeTournamentContext({ matchId: 'match-2' }));

		const backup = JSON.parse(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)!);
		expect(backup.team1Name).toBe('Eagles'); // original friendly name
	});
});

describe('Tournament → Friendly transition (pause)', () => {
	it('restores team names from backup', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		expect(get(team1).name).toBe('Carlos');
		expect(get(team2).name).toBe('Diana');

		simulatePauseTournamentMatch();

		// resetTeams preserves current names, which were restored by exitTournamentMode
		expect(get(team1).name).toBe('Eagles');
		expect(get(team2).name).toBe('Hawks');
	});

	it('restores team colors from backup', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		simulatePauseTournamentMatch();

		expect(get(team1).color).toBe('#FF0000');
		expect(get(team2).color).toBe('#0000FF');
	});

	it('restores user assignments from backup', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		expect(get(team1).userId).toBeNull(); // cleared by tournament

		simulatePauseTournamentMatch();

		// resetTeams preserves userId/partner from restored state
		expect(get(team1).userId).toBe('user-alice');
		expect(get(team1).userPhotoURL).toBe('http://alice.jpg');
		expect(get(team2).userId).toBe('user-bob');
	});

	it('restores partner data from backup', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		expect(get(team1).partner).toBeUndefined(); // cleared by tournament

		simulatePauseTournamentMatch();

		expect(get(team1).partner).toBeDefined();
		expect(get(team1).partner!.name).toBe('Partner A');
		expect(get(team2).partner).toBeDefined();
		expect(get(team2).partner!.name).toBe('Partner B');
	});

	it('restores game settings from backup', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		const duringTournament = get(gameSettings);
		expect(duringTournament.gameMode).toBe('rounds');
		expect(duringTournament.timerMinutes).toBe(15);

		simulatePauseTournamentMatch();

		const afterExit = get(gameSettings);
		expect(afterExit.gameMode).toBe('points');
		expect(afterExit.pointsToWin).toBe(100);
		expect(afterExit.matchesToWin).toBe(2);
		expect(afterExit.show20s).toBe(true);
		expect(afterExit.showHammer).toBe(true);
		expect(afterExit.gameType).toBe('doubles');
		expect(afterExit.timerMinutes).toBe(5);
		expect(afterExit.timerSeconds).toBe(30);
		expect(afterExit.showTimer).toBe(true);
	});

	it('clears tournament-specific settings (eventTitle, matchPhase)', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		expect(get(gameSettings).eventTitle).toBe('Regional Championship');

		simulatePauseTournamentMatch();

		expect(get(gameSettings).eventTitle).toBe('');
		expect(get(gameSettings).matchPhase).toBe('');
	});

	it('clears tournament context', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		expect(getTournamentContext()).not.toBeNull();

		simulatePauseTournamentMatch();

		expect(getTournamentContext()).toBeNull();
	});

	it('removes backup from localStorage after restore', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		expect(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)).not.toBeNull();

		simulatePauseTournamentMatch();

		expect(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)).toBeNull();
	});

	it('resets match scores to zero', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());
		vi.spyOn(Date, 'now').mockReturnValue(1000000);
		completeRound(2, 0, 0, 0, 1);

		simulatePauseTournamentMatch();

		expect(get(team1).points).toBe(0);
		expect(get(team1).rounds).toBe(0);
		expect(get(team2).points).toBe(0);
		expect(get(roundsPlayed)).toBe(0);
	});
});

describe('Tournament → Friendly transition (handleResetMatch / New Match)', () => {
	it('restores team names when clicking New Match in tournament', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		simulateHandleResetMatch();

		expect(get(team1).name).toBe('Eagles');
		expect(get(team2).name).toBe('Hawks');
	});

	it('restores settings when clicking New Match in tournament', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		simulateHandleResetMatch();

		const settings = get(gameSettings);
		expect(settings.gameMode).toBe('points');
		expect(settings.timerMinutes).toBe(5);
		expect(settings.timerSeconds).toBe(30);
		expect(settings.gameType).toBe('doubles');
	});

	it('clears lastTournamentResult', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		// Simulate match completion setting a result
		gameSettings.update(s => ({
			...s,
			lastTournamentResult: {
				winnerName: 'Carlos',
				scoreA: 2,
				scoreB: 1,
				isTie: false,
				team1Name: 'Carlos',
				team2Name: 'Diana',
				pointsA: 15,
				pointsB: 10,
				matchesToWin: 1
			}
		}));

		simulateHandleResetMatch();

		expect(get(gameSettings).lastTournamentResult).toBeNull();
	});
});

describe('GameType transition (singles ↔ doubles)', () => {
	it('restores doubles mode after singles tournament', () => {
		setupFriendlyState();
		expect(get(gameSettings).gameType).toBe('doubles');

		// Tournament is singles
		simulateEnterTournament(makeTournamentContext());
		expect(get(gameSettings).gameType).toBe('singles');

		simulatePauseTournamentMatch();
		expect(get(gameSettings).gameType).toBe('doubles');
	});

	it('restores singles mode after doubles tournament', () => {
		// Setup friendly as singles
		setupFriendlyState();
		gameSettings.update(s => ({ ...s, gameType: 'singles' }));
		gameSettings.save();

		// Tournament is doubles
		simulateEnterTournament(makeTournamentContext({
			gameConfig: {
				gameMode: 'points',
				matchesToWin: 2,
				show20s: true,
				showHammer: true,
				gameType: 'doubles'
			}
		}));
		expect(get(gameSettings).gameType).toBe('doubles');

		simulatePauseTournamentMatch();
		expect(get(gameSettings).gameType).toBe('singles');
	});
});

describe('Timer restoration', () => {
	it('restores friendly timer after tournament with different timer', () => {
		setupFriendlyState();
		expect(get(gameSettings).timerMinutes).toBe(5);
		expect(get(gameSettings).timerSeconds).toBe(30);

		// Tournament has 15min timer
		simulateEnterTournament(makeTournamentContext());
		expect(get(gameSettings).timerMinutes).toBe(15);
		expect(get(gameSettings).timerSeconds).toBe(0);

		simulatePauseTournamentMatch();
		expect(get(gameSettings).timerMinutes).toBe(5);
		expect(get(gameSettings).timerSeconds).toBe(30);
	});

	it('restores showTimer=false after tournament enables timer', () => {
		setupFriendlyState();
		gameSettings.update(s => ({ ...s, showTimer: false }));
		gameSettings.save();

		// Tournament forces timer on
		simulateEnterTournament(makeTournamentContext());
		expect(get(gameSettings).showTimer).toBe(true);

		simulatePauseTournamentMatch();
		expect(get(gameSettings).showTimer).toBe(false);
	});

	it('timer values are correct for handleResetMatch after tournament', () => {
		setupFriendlyState();

		simulateEnterTournament(makeTournamentContext());
		simulateHandleResetMatch();

		// After handleResetMatch, $gameSettings should have restored values
		const settings = get(gameSettings);
		expect(settings.timerMinutes).toBe(5);
		expect(settings.timerSeconds).toBe(30);

		// This is what +page.svelte line 1674 would compute:
		const totalSeconds = settings.timerMinutes * 60 + settings.timerSeconds;
		expect(totalSeconds).toBe(330); // 5*60 + 30
	});
});

describe('Multiple tournament cycles', () => {
	it('correctly handles enter → exit → enter → exit cycle', () => {
		setupFriendlyState();

		// Cycle 1
		simulateEnterTournament(makeTournamentContext({ matchId: 'match-1' }));
		expect(get(team1).name).toBe('Carlos');
		simulatePauseTournamentMatch();
		expect(get(team1).name).toBe('Eagles');
		expect(get(gameSettings).gameMode).toBe('points');

		// Cycle 2 (different tournament)
		simulateEnterTournament(makeTournamentContext({
			matchId: 'match-2',
			participantAName: 'Elena',
			participantBName: 'Fernando',
			tournamentName: 'Other Tournament',
			gameConfig: {
				gameMode: 'points',
				pointsToWin: 50,
				matchesToWin: 3,
				show20s: true,
				showHammer: false,
				gameType: 'doubles',
				timeLimitMinutes: 20
			}
		}));
		expect(get(team1).name).toBe('Elena');
		expect(get(gameSettings).gameMode).toBe('points');
		expect(get(gameSettings).pointsToWin).toBe(50);
		expect(get(gameSettings).timerMinutes).toBe(20);

		simulatePauseTournamentMatch();
		expect(get(team1).name).toBe('Eagles');
		expect(get(team2).name).toBe('Hawks');
		expect(get(gameSettings).gameMode).toBe('points');
		expect(get(gameSettings).pointsToWin).toBe(100); // original friendly
		expect(get(gameSettings).timerMinutes).toBe(5);
	});

	it('backup is re-created correctly after each cycle', () => {
		setupFriendlyState();

		// Cycle 1: enter and exit
		simulateEnterTournament(makeTournamentContext());
		simulatePauseTournamentMatch();
		expect(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)).toBeNull();

		// Cycle 2: enter again — backup should be saved with current (restored) friendly data
		simulateEnterTournament(makeTournamentContext({ matchId: 'match-2' }));
		const backup = JSON.parse(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)!);
		expect(backup.team1Name).toBe('Eagles');
		expect(backup.gameMode).toBe('points');
	});
});

describe('Match completion then New Match', () => {
	it('keeps tournament names after completion, restores friendly on New Match', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		// Simulate match completion (handleTournamentMatchComplete behavior):
		// 1. Set lastTournamentResult
		gameSettings.update(s => ({
			...s,
			lastTournamentResult: {
				winnerName: 'Carlos',
				scoreA: 2,
				scoreB: 0,
				isTie: false,
				team1Name: 'Carlos',
				team2Name: 'Diana',
				pointsA: 20,
				pointsB: 8,
				matchesToWin: 1
			}
		}));
		// 2. exitTournamentMode(false) — don't restore yet, keep tournament names for RoundsPanel
		simulateExitTournamentMode(false);

		// After completion: context gone, but team names still show tournament participants
		expect(getTournamentContext()).toBeNull();
		expect(get(team1).name).toBe('Carlos'); // tournament name preserved
		expect(get(team2).name).toBe('Diana');  // tournament name preserved
		// Backup still exists (not consumed yet)
		expect(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)).not.toBeNull();

		// User clicks "New Match" — NOW restore friendly state
		simulateHandleResetMatch();

		// Everything should be clean friendly state
		expect(get(team1).name).toBe('Eagles');
		expect(get(team2).name).toBe('Hawks');
		expect(get(gameSettings).gameType).toBe('doubles');
		expect(get(gameSettings).lastTournamentResult).toBeNull();
		expect(get(team1).points).toBe(0);
		// Backup consumed
		expect(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)).toBeNull();
	});

	it('tournament names persist in RoundsPanel after match completion until New Match', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		// Play some rounds
		vi.spyOn(Date, 'now').mockReturnValue(1000000);
		completeRound(2, 0, 0, 0, 1);

		// Complete match — deferred restore
		gameSettings.update(s => ({
			...s,
			lastTournamentResult: {
				winnerName: 'Carlos',
				scoreA: 1,
				scoreB: 0,
				isTie: false,
				team1Name: 'Carlos',
				team2Name: 'Diana',
				pointsA: 10,
				pointsB: 5,
				matchesToWin: 1
			}
		}));
		simulateExitTournamentMode(false);

		// Team names should still be tournament names (for RoundsPanel display)
		expect(get(team1).name).toBe('Carlos');
		expect(get(team2).name).toBe('Diana');
		// gameType should already be restored to friendly (doubles) via backup
		expect(get(gameSettings).gameType).toBe('doubles');
		// But settings NOT fully restored yet
		expect(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)).not.toBeNull();

		// New Match restores everything
		simulateHandleResetMatch();
		expect(get(team1).name).toBe('Eagles');
		expect(get(team2).name).toBe('Hawks');
		expect(get(gameSettings).gameMode).toBe('points');
		expect(get(gameSettings).timerMinutes).toBe(5);
		expect(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)).toBeNull();
	});
});

describe('Edge cases', () => {
	it('handles missing backup gracefully on exit', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		// Manually delete backup (simulating corruption)
		localStorage.removeItem(PRE_TOURNAMENT_BACKUP_KEY);

		// Exit should not crash
		simulatePauseTournamentMatch();

		// Teams will keep tournament names since backup is missing
		// This is expected behavior — no crash is the key assertion
		expect(get(team1).name).toBeDefined();
	});

	it('handles corrupted backup JSON on exit', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		// Corrupt the backup
		localStorageMock.store[PRE_TOURNAMENT_BACKUP_KEY] = 'not-valid-json{{{';

		// Exit should not crash
		simulatePauseTournamentMatch();
		expect(get(team1).name).toBeDefined();
		// Corrupted backup should be cleaned up
		expect(localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)).toBeNull();
	});

	it('entering tournament mode from already-in-tournament-mode', () => {
		setupFriendlyState();

		// Enter tournament match 1
		simulateEnterTournament(makeTournamentContext({ matchId: 'match-1' }));
		const firstBackup = localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)!;

		// Enter tournament match 2 directly (without exiting first)
		// Backup should NOT be overwritten (it was saved on first enter)
		simulateEnterTournament(makeTournamentContext({
			matchId: 'match-2',
			participantAName: 'Elena',
			participantBName: 'Fernando'
		}));

		// Backup should still have original friendly data
		const secondBackup = localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)!;
		expect(secondBackup).toBe(firstBackup);
		expect(JSON.parse(secondBackup).team1Name).toBe('Eagles');

		// Exit should restore to original friendly (not match-1 tournament)
		simulatePauseTournamentMatch();
		expect(get(team1).name).toBe('Eagles');
	});

	it('handleResetMatch when NOT in tournament mode does nothing special', () => {
		setupFriendlyState();

		// Simulate some game progress
		vi.spyOn(Date, 'now').mockReturnValue(1000000);
		completeRound(2, 0, 0, 0, 1);

		simulateHandleResetMatch();

		// Settings should be unchanged
		const settings = get(gameSettings);
		expect(settings.gameMode).toBe('points');
		expect(settings.pointsToWin).toBe(100);

		// Teams should keep names but reset scores
		expect(get(team1).name).toBe('Eagles');
		expect(get(team1).points).toBe(0);
		expect(get(roundsPlayed)).toBe(0);
	});

	it('gameSettings.save persists restored settings', () => {
		setupFriendlyState();
		simulateEnterTournament(makeTournamentContext());

		simulatePauseTournamentMatch();

		// Verify localStorage has the restored settings
		const savedSettings = JSON.parse(localStorageMock.store['crokinoleGame']);
		expect(savedSettings.gameMode).toBe('points');
		expect(savedSettings.timerMinutes).toBe(5);
		expect(savedSettings.gameType).toBe('doubles');
	});

	it('eventEdition is cleared on exit (was leaking)', () => {
		setupFriendlyState();
		expect(get(gameSettings).eventEdition).toBeUndefined();

		simulateEnterTournament(makeTournamentContext({ tournamentEdition: 3 }));
		expect(get(gameSettings).eventEdition).toBe(3);

		simulatePauseTournamentMatch();
		expect(get(gameSettings).eventEdition).toBeUndefined();
	});

	it('allowTiesInRoundsMode is preserved across tournament', () => {
		setupFriendlyState();
		expect(get(gameSettings).allowTiesInRoundsMode).toBe(false);

		simulateEnterTournament(makeTournamentContext());

		simulatePauseTournamentMatch();
		expect(get(gameSettings).allowTiesInRoundsMode).toBe(false);
	});

	it('showScoreTable is preserved across tournament', () => {
		setupFriendlyState();
		expect(get(gameSettings).showScoreTable).toBe(false);

		simulateEnterTournament(makeTournamentContext());

		simulatePauseTournamentMatch();
		expect(get(gameSettings).showScoreTable).toBe(false);
	});

	it('all settings fields round-trip correctly through backup', () => {
		setupFriendlyState();

		// Capture all settings before tournament
		const before = { ...get(gameSettings) };

		simulateEnterTournament(makeTournamentContext({ tournamentEdition: 5 }));

		// Verify tournament overwrote key fields
		expect(get(gameSettings).gameMode).toBe('rounds');
		expect(get(gameSettings).eventEdition).toBe(5);

		simulatePauseTournamentMatch();

		// Verify ALL backed-up fields are restored
		const after = get(gameSettings);
		expect(after.gameMode).toBe(before.gameMode);
		expect(after.pointsToWin).toBe(before.pointsToWin);
		expect(after.roundsToPlay).toBe(before.roundsToPlay);
		expect(after.matchesToWin).toBe(before.matchesToWin);
		expect(after.show20s).toBe(before.show20s);
		expect(after.showHammer).toBe(before.showHammer);
		expect(after.gameType).toBe(before.gameType);
		expect(after.allowTiesInRoundsMode).toBe(before.allowTiesInRoundsMode);
		expect(after.showScoreTable).toBe(before.showScoreTable);
		expect(after.timerMinutes).toBe(before.timerMinutes);
		expect(after.timerSeconds).toBe(before.timerSeconds);
		expect(after.showTimer).toBe(before.showTimer);
		// Tournament-specific fields should be cleared
		expect(after.eventTitle).toBe('');
		expect(after.eventEdition).toBeUndefined();
		expect(after.matchPhase).toBe('');
	});

	it('bracket stage tournament hides timer', () => {
		setupFriendlyState();

		// Final phase with no timer
		simulateEnterTournament(makeTournamentContext({
			phase: 'FINAL',
			bracketRoundName: 'Semifinales',
			gameConfig: {
				gameMode: 'points',
				pointsToWin: 100,
				matchesToWin: 2,
				show20s: true,
				showHammer: true,
				gameType: 'singles'
				// No timeLimitMinutes → showTimer should be false
			}
		}));

		expect(get(gameSettings).showTimer).toBe(false);

		simulatePauseTournamentMatch();

		// Restore friendly timer settings
		expect(get(gameSettings).showTimer).toBe(true);
		expect(get(gameSettings).timerMinutes).toBe(5);
	});
});
