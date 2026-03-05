import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock history module — use vi.hoisted so fns are available when vi.mock factory runs
const { mockAddRoundToCurrentMatch, mockResetCurrentMatch } = vi.hoisted(() => ({
	mockAddRoundToCurrentMatch: vi.fn(),
	mockResetCurrentMatch: vi.fn()
}));
vi.mock('./history', () => ({
	resetCurrentMatch: mockResetCurrentMatch,
	addRoundToCurrentMatch: mockAddRoundToCurrentMatch
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
import {
	matchState,
	roundsPlayed,
	lastRoundPoints,
	matchStartedBy,
	lastGameHammerTeam,
	currentGameStartHammer,
	currentTwentyTeam,
	twentyDialogPending,
	matchStartTime,
	currentMatchGames,
	currentMatchRounds,
	currentGameRounds,
	loadMatchState,
	saveMatchState,
	resetMatchState,
	resetGameOnly,
	addGame,
	addRound,
	startMatch,
	completeRound
} from './matchState';
import type { GameData, RoundData } from '$lib/types/team';

function makeGame(overrides: Partial<GameData> = {}): GameData {
	return {
		gameNumber: 1,
		winner: 1,
		team1Points: 6,
		team2Points: 2,
		team1Rounds: 3,
		team2Rounds: 1,
		team1Twenty: 2,
		team2Twenty: 0,
		timestamp: 1000000,
		...overrides
	};
}

function makeRound(overrides: Partial<RoundData> = {}): RoundData {
	return {
		roundNumber: 1,
		team1Points: 2,
		team2Points: 0,
		team1Twenty: 1,
		team2Twenty: 0,
		hammerTeam: 1,
		timestamp: 1000000,
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorageMock.store = {};
	// Reset stores to defaults
	resetMatchState();
	vi.clearAllMocks(); // clear the mocks called by resetMatchState itself
});

describe('matchState', () => {
	describe('initial state', () => {
		it('has correct defaults', () => {
			expect(get(roundsPlayed)).toBe(0);
			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });
			expect(get(matchStartedBy)).toBeNull();
			expect(get(lastGameHammerTeam)).toBeNull();
			expect(get(currentGameStartHammer)).toBeNull();
			expect(get(currentTwentyTeam)).toBe(0);
			expect(get(twentyDialogPending)).toBe(false);
			expect(get(matchStartTime)).toBeNull();
			expect(get(currentMatchGames)).toEqual([]);
			expect(get(currentMatchRounds)).toEqual([]);
			expect(get(currentGameRounds)).toEqual([]);

			const state = get(matchState);
			expect(state.roundsPlayed).toBe(0);
			expect(state.matchStartedBy).toBeNull();
			expect(state.currentMatchGames).toEqual([]);
			expect(state.currentMatchRounds).toEqual([]);
			expect(state.currentGameRounds).toEqual([]);
		});
	});

	describe('startMatch', () => {
		it('sets matchStartedBy, currentGameStartHammer, and matchStartTime', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			startMatch('user-123', 2);

			expect(get(matchStartedBy)).toBe('user-123');
			expect(get(currentGameStartHammer)).toBe(2);
			expect(get(matchStartTime)).toBe(1000000);

			const state = get(matchState);
			expect(state.matchStartedBy).toBe('user-123');
			expect(state.currentGameStartHammer).toBe(2);
			expect(state.matchStartTime).toBe(1000000);
		});
	});

	describe('completeRound', () => {
		it('increments roundsPlayed', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			expect(get(roundsPlayed)).toBe(0);

			completeRound(2, 0, 1, 0, 1);

			expect(get(roundsPlayed)).toBe(1);
		});

		it('creates correct RoundData and adds to currentGameRounds', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			completeRound(2, 0, 1, 0, 1);

			const rounds = get(currentGameRounds);
			expect(rounds).toHaveLength(1);
			expect(rounds[0]).toEqual({
				roundNumber: 1,
				team1Points: 2,
				team2Points: 0,
				team1Twenty: 1,
				team2Twenty: 0,
				hammerTeam: 1,
				timestamp: 1000000
			});
		});

		it('accumulates lastRoundPoints across multiple rounds', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			completeRound(2, 0, 1, 0, 1);
			expect(get(lastRoundPoints)).toEqual({ team1: 2, team2: 0 });

			completeRound(0, 2, 0, 1, 2);
			expect(get(lastRoundPoints)).toEqual({ team1: 2, team2: 2 });

			completeRound(4, 0, 0, 0, 1);
			expect(get(lastRoundPoints)).toEqual({ team1: 6, team2: 2 });
		});

		it('calls addRoundToCurrentMatch with correct MatchRound', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			completeRound(2, 0, 1, 0, 2);

			expect(mockAddRoundToCurrentMatch).toHaveBeenCalledTimes(1);
			expect(mockAddRoundToCurrentMatch).toHaveBeenCalledWith({
				team1Points: 2,
				team2Points: 0,
				team1Twenty: 1,
				team2Twenty: 0,
				hammerTeam: 2,
				roundNumber: 1
			});
		});

		it('increments roundsPlayed correctly across multiple rounds', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			completeRound(2, 0, 0, 0, 1);
			expect(get(roundsPlayed)).toBe(1);

			completeRound(0, 2, 0, 0, 2);
			expect(get(roundsPlayed)).toBe(2);

			completeRound(2, 0, 0, 0, 1);
			expect(get(roundsPlayed)).toBe(3);

			const state = get(matchState);
			expect(state.roundsPlayed).toBe(3);
		});
	});

	describe('addRound', () => {
		it('appends to currentGameRounds and currentMatchRounds', () => {
			const round1 = makeRound({ roundNumber: 1 });
			const round2 = makeRound({ roundNumber: 2, team1Points: 0, team2Points: 2 });

			addRound(round1);
			expect(get(currentGameRounds)).toHaveLength(1);
			expect(get(currentMatchRounds)).toHaveLength(1);

			addRound(round2);
			expect(get(currentGameRounds)).toHaveLength(2);
			expect(get(currentMatchRounds)).toHaveLength(2);
			expect(get(currentGameRounds)[1].roundNumber).toBe(2);
			expect(get(currentMatchRounds)[1].team2Points).toBe(2);

			// Also reflected in matchState
			const state = get(matchState);
			expect(state.currentGameRounds).toHaveLength(2);
			expect(state.currentMatchRounds).toHaveLength(2);
		});
	});

	describe('addGame', () => {
		it('appends to currentMatchGames and matchState', () => {
			const game1 = makeGame({ gameNumber: 1 });
			const game2 = makeGame({ gameNumber: 2, winner: 2, team1Points: 2, team2Points: 6 });

			addGame(game1);
			expect(get(currentMatchGames)).toHaveLength(1);
			expect(get(currentMatchGames)[0].gameNumber).toBe(1);

			addGame(game2);
			expect(get(currentMatchGames)).toHaveLength(2);
			expect(get(currentMatchGames)[1].gameNumber).toBe(2);
			expect(get(currentMatchGames)[1].winner).toBe(2);

			const state = get(matchState);
			expect(state.currentMatchGames).toHaveLength(2);
		});
	});

	describe('resetMatchState', () => {
		it('resets all stores back to defaults', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			// Set up non-default state
			startMatch('user-456', 1);
			completeRound(2, 0, 1, 0, 1);
			addGame(makeGame());

			// Verify non-default state
			expect(get(roundsPlayed)).toBe(1);
			expect(get(matchStartedBy)).toBe('user-456');
			expect(get(currentMatchGames)).toHaveLength(1);

			resetMatchState();

			expect(get(roundsPlayed)).toBe(0);
			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });
			expect(get(matchStartedBy)).toBeNull();
			expect(get(lastGameHammerTeam)).toBeNull();
			expect(get(currentGameStartHammer)).toBeNull();
			expect(get(currentTwentyTeam)).toBe(0);
			expect(get(twentyDialogPending)).toBe(false);
			expect(get(matchStartTime)).toBeNull();
			expect(get(currentMatchGames)).toEqual([]);
			expect(get(currentMatchRounds)).toEqual([]);
			expect(get(currentGameRounds)).toEqual([]);
		});

		it('calls resetCurrentMatch from history module', () => {
			resetMatchState();
			expect(mockResetCurrentMatch).toHaveBeenCalledTimes(1);
		});
	});

	describe('resetGameOnly', () => {
		it('clears currentGameRounds, currentMatchRounds, roundsPlayed, and lastRoundPoints', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			completeRound(2, 0, 1, 0, 1);
			completeRound(0, 2, 0, 1, 2);

			expect(get(roundsPlayed)).toBe(2);
			expect(get(currentGameRounds)).toHaveLength(2);
			expect(get(currentMatchRounds)).toHaveLength(2);
			expect(get(lastRoundPoints)).toEqual({ team1: 2, team2: 2 });

			resetGameOnly();

			expect(get(roundsPlayed)).toBe(0);
			expect(get(currentGameRounds)).toEqual([]);
			expect(get(currentMatchRounds)).toEqual([]);
			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });

			const state = get(matchState);
			expect(state.currentGameRounds).toEqual([]);
			expect(state.currentMatchRounds).toEqual([]);
			expect(state.roundsPlayed).toBe(0);
		});

		it('preserves currentMatchGames', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			addGame(makeGame({ gameNumber: 1 }));
			addGame(makeGame({ gameNumber: 2 }));
			completeRound(2, 0, 0, 0, 1);

			expect(get(currentMatchGames)).toHaveLength(2);

			resetGameOnly();

			expect(get(currentMatchGames)).toHaveLength(2);
			expect(get(currentMatchGames)[0].gameNumber).toBe(1);
			expect(get(currentMatchGames)[1].gameNumber).toBe(2);
		});
	});

	describe('saveMatchState', () => {
		it('writes matchState to localStorage', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			startMatch('user-789', 1);
			localStorageMock.setItem.mockClear();

			saveMatchState();

			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				'crokinoleMatchState',
				expect.any(String)
			);

			const savedData = JSON.parse(
				localStorageMock.setItem.mock.calls[0][1]
			);
			expect(savedData.matchStartedBy).toBe('user-789');
			expect(savedData.currentGameStartHammer).toBe(1);
			expect(savedData.matchStartTime).toBe(1000000);
		});
	});

	describe('loadMatchState', () => {
		it('restores state from localStorage', () => {
			const savedState = {
				matchStartedBy: 'restored-user',
				lastGameHammerTeam: 2,
				currentGameStartHammer: 1,
				currentTwentyTeam: 1,
				twentyDialogPending: true,
				matchStartTime: 5000000,
				currentMatchGames: [makeGame()],
				currentMatchRounds: [makeRound()],
				currentGameRounds: [makeRound()],
				roundsPlayed: 3
			};

			localStorageMock.store['crokinoleMatchState'] = JSON.stringify(savedState);

			loadMatchState();

			expect(get(matchStartedBy)).toBe('restored-user');
			expect(get(lastGameHammerTeam)).toBe(2);
			expect(get(currentGameStartHammer)).toBe(1);
			expect(get(currentTwentyTeam)).toBe(1);
			expect(get(twentyDialogPending)).toBe(true);
			expect(get(matchStartTime)).toBe(5000000);
			expect(get(currentMatchGames)).toHaveLength(1);
			expect(get(currentMatchGames)[0].gameNumber).toBe(1);
			expect(get(currentMatchRounds)).toHaveLength(1);
			expect(get(currentGameRounds)).toHaveLength(1);
			expect(get(roundsPlayed)).toBe(3);

			const state = get(matchState);
			expect(state.matchStartedBy).toBe('restored-user');
			expect(state.roundsPlayed).toBe(3);
		});

		it('handles missing data gracefully (no localStorage entry)', () => {
			// localStorage is empty (no 'crokinoleMatchState' key)
			loadMatchState();

			// All stores should remain at their defaults
			expect(get(roundsPlayed)).toBe(0);
			expect(get(matchStartedBy)).toBeNull();
			expect(get(currentMatchGames)).toEqual([]);
			expect(get(currentMatchRounds)).toEqual([]);
			expect(get(currentGameRounds)).toEqual([]);
		});
	});
});
