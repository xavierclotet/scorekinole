/**
 * Tests for the Friendly Match Setup flow.
 *
 * Simulates the FriendlyMatchModal's handleStart() → handleFriendlyMatchStart()
 * sequence: applying new settings/teams then resetting match state.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$lib/constants', () => ({
	APP_VERSION: '2.4.99',
	DEFAULT_GAME_SETTINGS: {
		appVersion: '2.4.99',
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

vi.mock('./history', () => ({
	resetCurrentMatch: vi.fn(),
	addRoundToCurrentMatch: vi.fn(),
	startCurrentMatch: vi.fn()
}));

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
	completeRound,
	addGame,
	roundsPlayed,
	currentMatchGames,
	currentGameRounds
} from './matchState';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simulates the FriendlyMatchModal's handleStart():
 * applies new settings and team data to stores.
 */
function simulateModalApply(config: {
	gameType: 'singles' | 'doubles';
	gameMode: 'points' | 'rounds';
	pointsToWin?: number;
	matchesToWin?: number;
	roundsToPlay?: number;
	allowTies?: boolean;
	show20s?: boolean;
	showHammer?: boolean;
	showTimer?: boolean;
	timerMinutes?: number;
	timerSeconds?: number;
	team1Name?: string;
	team1Color?: string;
	team2Name?: string;
	team2Color?: string;
}) {
	gameSettings.update(s => ({
		...s,
		gameType: config.gameType,
		gameMode: config.gameMode,
		pointsToWin: config.gameMode === 'points' ? (config.pointsToWin ?? 7) : undefined,
		matchesToWin: config.gameMode === 'points' ? (config.matchesToWin ?? 1) : undefined,
		roundsToPlay: config.gameMode === 'rounds' ? (config.roundsToPlay ?? 4) : undefined,
		allowTiesInRoundsMode: config.allowTies ?? true,
		show20s: config.show20s ?? false,
		showHammer: config.showHammer ?? false,
		showTimer: config.showTimer ?? true,
		timerMinutes: config.timerMinutes ?? 10,
		timerSeconds: config.timerSeconds ?? 0
	}));
	gameSettings.save();

	if (config.team1Name || config.team1Color) {
		updateTeam(1, {
			...(config.team1Name ? { name: config.team1Name } : {}),
			...(config.team1Color ? { color: config.team1Color } : {})
		});
	}
	if (config.team2Name || config.team2Color) {
		updateTeam(2, {
			...(config.team2Name ? { name: config.team2Name } : {}),
			...(config.team2Color ? { color: config.team2Color } : {})
		});
	}
}

/**
 * Simulates handleFriendlyMatchStart() from +page.svelte:
 * resets teams (scores) and match state.
 */
function simulateMatchStart() {
	resetTeams();
	resetMatchState();
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();
	localStorageMock.store = {};
	resetMatchState();
	resetTeams();
	gameSettings.update(s => ({
		...s,
		gameMode: 'rounds' as const,
		roundsToPlay: 4,
		pointsToWin: undefined,
		matchesToWin: undefined,
		show20s: false,
		showHammer: false,
		showTimer: true,
		timerMinutes: 10,
		timerSeconds: 0,
		gameType: 'singles' as const,
		allowTiesInRoundsMode: true,
		eventTitle: '',
		matchPhase: '',
		lastTournamentResult: null
	}));
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Friendly Match Setup', () => {
	describe('applying settings from modal', () => {
		it('switches from rounds to points mode', () => {
			expect(get(gameSettings).gameMode).toBe('rounds');

			simulateModalApply({
				gameType: 'singles',
				gameMode: 'points',
				pointsToWin: 100,
				matchesToWin: 2
			});

			const s = get(gameSettings);
			expect(s.gameMode).toBe('points');
			expect(s.pointsToWin).toBe(100);
			expect(s.matchesToWin).toBe(2);
			expect(s.roundsToPlay).toBeUndefined();
		});

		it('switches from points to rounds mode', () => {
			gameSettings.update(s => ({
				...s,
				gameMode: 'points' as const,
				pointsToWin: 50,
				matchesToWin: 3
			}));

			simulateModalApply({
				gameType: 'singles',
				gameMode: 'rounds',
				roundsToPlay: 8,
				allowTies: false
			});

			const s = get(gameSettings);
			expect(s.gameMode).toBe('rounds');
			expect(s.roundsToPlay).toBe(8);
			expect(s.allowTiesInRoundsMode).toBe(false);
			expect(s.pointsToWin).toBeUndefined();
			expect(s.matchesToWin).toBeUndefined();
		});

		it('changes game type from singles to doubles', () => {
			simulateModalApply({ gameType: 'doubles', gameMode: 'rounds' });
			expect(get(gameSettings).gameType).toBe('doubles');
		});

		it('enables all features', () => {
			simulateModalApply({
				gameType: 'singles',
				gameMode: 'points',
				show20s: true,
				showHammer: true,
				showTimer: true,
				timerMinutes: 15,
				timerSeconds: 30
			});

			const s = get(gameSettings);
			expect(s.show20s).toBe(true);
			expect(s.showHammer).toBe(true);
			expect(s.showTimer).toBe(true);
			expect(s.timerMinutes).toBe(15);
			expect(s.timerSeconds).toBe(30);
		});

		it('disables all features', () => {
			gameSettings.update(s => ({ ...s, show20s: true, showHammer: true, showTimer: true }));

			simulateModalApply({
				gameType: 'singles',
				gameMode: 'rounds',
				show20s: false,
				showHammer: false,
				showTimer: false
			});

			const s = get(gameSettings);
			expect(s.show20s).toBe(false);
			expect(s.showHammer).toBe(false);
			expect(s.showTimer).toBe(false);
		});

		it('applies team names', () => {
			simulateModalApply({
				gameType: 'singles',
				gameMode: 'rounds',
				team1Name: 'Eagles',
				team2Name: 'Hawks'
			});

			expect(get(team1).name).toBe('Eagles');
			expect(get(team2).name).toBe('Hawks');
		});

		it('applies team colors', () => {
			simulateModalApply({
				gameType: 'singles',
				gameMode: 'rounds',
				team1Color: '#FF0000',
				team2Color: '#0000FF'
			});

			expect(get(team1).color).toBe('#FF0000');
			expect(get(team2).color).toBe('#0000FF');
		});

		it('persists settings to localStorage', () => {
			simulateModalApply({
				gameType: 'doubles',
				gameMode: 'points',
				pointsToWin: 50,
				matchesToWin: 3,
				show20s: true
			});

			const saved = JSON.parse(localStorageMock.store['crokinoleGame']);
			expect(saved.gameType).toBe('doubles');
			expect(saved.gameMode).toBe('points');
			expect(saved.pointsToWin).toBe(50);
			expect(saved.show20s).toBe(true);
		});
	});

	describe('match reset after applying settings', () => {
		it('resets scores to zero', () => {
			// Set some scores manually (as TeamCard would)
			updateTeam(1, { points: 50, rounds: 3 });
			updateTeam(2, { points: 30, rounds: 2 });
			expect(get(team1).points).toBe(50);

			simulateModalApply({ gameType: 'singles', gameMode: 'rounds' });
			simulateMatchStart();

			expect(get(team1).points).toBe(0);
			expect(get(team2).points).toBe(0);
			expect(get(team1).rounds).toBe(0);
			expect(get(team2).rounds).toBe(0);
		});

		it('clears rounds played', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			completeRound(2, 0, 0, 0, 1);
			completeRound(0, 2, 0, 0, 2);
			expect(get(roundsPlayed)).toBe(2);

			simulateModalApply({ gameType: 'singles', gameMode: 'rounds' });
			simulateMatchStart();

			expect(get(roundsPlayed)).toBe(0);
			expect(get(currentGameRounds)).toEqual([]);
		});

		it('clears completed games', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			addGame({
				gameNumber: 1, winner: 1,
				team1Points: 100, team2Points: 50,
				team1Rounds: 0, team2Rounds: 0,
				team1Twenty: 0, team2Twenty: 0,
				timestamp: 1000000
			});
			expect(get(currentMatchGames)).toHaveLength(1);

			simulateModalApply({ gameType: 'singles', gameMode: 'points' });
			simulateMatchStart();

			expect(get(currentMatchGames)).toEqual([]);
		});

		it('clears hasWon flags', () => {
			updateTeam(1, { hasWon: true });
			expect(get(team1).hasWon).toBe(true);

			simulateModalApply({ gameType: 'singles', gameMode: 'rounds' });
			simulateMatchStart();

			expect(get(team1).hasWon).toBe(false);
			expect(get(team2).hasWon).toBe(false);
		});

		it('preserves team names and colors after reset', () => {
			simulateModalApply({
				gameType: 'singles',
				gameMode: 'rounds',
				team1Name: 'Phoenix',
				team1Color: '#DFC530',
				team2Name: 'Dragons',
				team2Color: '#559D5E'
			});
			simulateMatchStart();

			// resetTeams clears scores but preserves names/colors
			expect(get(team1).name).toBe('Phoenix');
			expect(get(team1).color).toBe('#DFC530');
			expect(get(team2).name).toBe('Dragons');
			expect(get(team2).color).toBe('#559D5E');
		});
	});

	describe('full flow: change settings mid-session', () => {
		it('can change from rounds to points after playing some rounds', () => {
			// Play some rounds in rounds mode
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			completeRound(2, 0, 0, 0, 1);
			completeRound(0, 4, 0, 0, 2);
			expect(get(roundsPlayed)).toBe(2);

			// Open modal, switch to points mode
			simulateModalApply({
				gameType: 'singles',
				gameMode: 'points',
				pointsToWin: 100,
				matchesToWin: 1
			});
			simulateMatchStart();

			// Fresh start with new settings
			expect(get(gameSettings).gameMode).toBe('points');
			expect(get(gameSettings).pointsToWin).toBe(100);
			expect(get(roundsPlayed)).toBe(0);
			expect(get(team1).points).toBe(0);
		});

		it('can change team names and start fresh', () => {
			updateTeam(1, { name: 'Old Name 1' });
			updateTeam(2, { name: 'Old Name 2' });
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			completeRound(2, 0, 0, 0, 1);

			simulateModalApply({
				gameType: 'doubles',
				gameMode: 'rounds',
				team1Name: 'Team Alpha',
				team2Name: 'Team Beta'
			});
			simulateMatchStart();

			expect(get(team1).name).toBe('Team Alpha');
			expect(get(team2).name).toBe('Team Beta');
			expect(get(gameSettings).gameType).toBe('doubles');
			expect(get(roundsPlayed)).toBe(0);
		});

		it('consecutive modal uses apply settings correctly', () => {
			// First setup: points mode
			simulateModalApply({
				gameType: 'singles',
				gameMode: 'points',
				pointsToWin: 50,
				matchesToWin: 2,
				show20s: true,
				team1Name: 'A',
				team2Name: 'B'
			});
			simulateMatchStart();

			expect(get(gameSettings).pointsToWin).toBe(50);
			expect(get(team1).name).toBe('A');

			// Second setup: rounds mode (complete change)
			simulateModalApply({
				gameType: 'doubles',
				gameMode: 'rounds',
				roundsToPlay: 6,
				allowTies: true,
				show20s: false,
				showHammer: true,
				team1Name: 'C',
				team2Name: 'D'
			});
			simulateMatchStart();

			const s = get(gameSettings);
			expect(s.gameMode).toBe('rounds');
			expect(s.roundsToPlay).toBe(6);
			expect(s.pointsToWin).toBeUndefined();
			expect(s.matchesToWin).toBeUndefined();
			expect(s.show20s).toBe(false);
			expect(s.showHammer).toBe(true);
			expect(s.gameType).toBe('doubles');
			expect(get(team1).name).toBe('C');
			expect(get(team2).name).toBe('D');
		});
	});

	describe('edge cases', () => {
		it('timer config preserved when timer disabled', () => {
			simulateModalApply({
				gameType: 'singles',
				gameMode: 'rounds',
				showTimer: false,
				timerMinutes: 15,
				timerSeconds: 30
			});

			const s = get(gameSettings);
			expect(s.showTimer).toBe(false);
			// Timer values still stored even when disabled
			expect(s.timerMinutes).toBe(15);
			expect(s.timerSeconds).toBe(30);
		});

		it('points mode clears roundsToPlay', () => {
			gameSettings.update(s => ({ ...s, roundsToPlay: 8 }));

			simulateModalApply({
				gameType: 'singles',
				gameMode: 'points',
				pointsToWin: 100
			});

			expect(get(gameSettings).roundsToPlay).toBeUndefined();
		});

		it('rounds mode clears pointsToWin and matchesToWin', () => {
			gameSettings.update(s => ({ ...s, pointsToWin: 100, matchesToWin: 3 }));

			simulateModalApply({
				gameType: 'singles',
				gameMode: 'rounds',
				roundsToPlay: 4
			});

			expect(get(gameSettings).pointsToWin).toBeUndefined();
			expect(get(gameSettings).matchesToWin).toBeUndefined();
		});

		it('does not affect eventTitle or matchPhase', () => {
			gameSettings.update(s => ({ ...s, eventTitle: 'Some Event', matchPhase: 'Finals' }));

			simulateModalApply({ gameType: 'singles', gameMode: 'rounds' });
			simulateMatchStart();

			// Modal doesn't touch these tournament-specific fields
			expect(get(gameSettings).eventTitle).toBe('Some Event');
			expect(get(gameSettings).matchPhase).toBe('Finals');
		});
	});
});
