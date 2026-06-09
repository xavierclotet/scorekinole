import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock history module — use vi.hoisted so fns are available when vi.mock factory runs
const { mockAddRoundToCurrentMatch, mockResetCurrentMatch, mockRemoveLastRoundFromCurrentMatch, mockSwapTeamsInCurrentMatch } = vi.hoisted(() => ({
	mockAddRoundToCurrentMatch: vi.fn(),
	mockResetCurrentMatch: vi.fn(),
	mockRemoveLastRoundFromCurrentMatch: vi.fn(),
	mockSwapTeamsInCurrentMatch: vi.fn()
}));
vi.mock('./history', () => ({
	resetCurrentMatch: mockResetCurrentMatch,
	addRoundToCurrentMatch: mockAddRoundToCurrentMatch,
	removeLastRoundFromCurrentMatch: mockRemoveLastRoundFromCurrentMatch,
	swapTeamsInCurrentMatch: mockSwapTeamsInCurrentMatch
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
	completeRound,
	undoLastRound,
	updateRoundTwenties,
	swapTeamsInMatchState
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

	describe('completeRound edge cases', () => {
		it('handles a tie round (0, 0) correctly', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			completeRound(0, 0, 0, 0, 1);

			expect(get(roundsPlayed)).toBe(1);
			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });

			const rounds = get(currentGameRounds);
			expect(rounds).toHaveLength(1);
			expect(rounds[0].team1Points).toBe(0);
			expect(rounds[0].team2Points).toBe(0);
		});

		it('handles hammerTeam=null without errors', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			completeRound(2, 0, 0, 0, null);

			const rounds = get(currentGameRounds);
			expect(rounds[0].hammerTeam).toBeNull();
		});
	});

	describe('dual-store consistency', () => {
		it('keeps currentGameRounds in sync after completeRound', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			completeRound(2, 0, 1, 0, 1);
			completeRound(0, 2, 0, 1, 2);

			const standalone = get(currentGameRounds);
			const fromState = get(matchState).currentGameRounds;
			expect(standalone).toEqual(fromState);
		});

		it('keeps currentGameRounds in sync after addRound', () => {
			const round = makeRound({ roundNumber: 1 });
			addRound(round);

			const standalone = get(currentGameRounds);
			const fromState = get(matchState).currentGameRounds;
			expect(standalone).toEqual(fromState);
		});

		it('keeps currentMatchGames in sync after addGame', () => {
			const game = makeGame({ gameNumber: 1 });
			addGame(game);

			const standalone = get(currentMatchGames);
			const fromState = get(matchState).currentMatchGames;
			expect(standalone).toEqual(fromState);
		});
	});

	describe('resetGameOnly preserves fields', () => {
		it('preserves matchStartedBy and matchStartTime', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			startMatch('user-999', 1);
			completeRound(2, 0, 0, 0, 1);

			resetGameOnly();

			expect(get(matchStartedBy)).toBe('user-999');
			expect(get(matchStartTime)).toBe(1000000);
		});

		it('resets round numbering so next round is roundNumber=1', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			completeRound(2, 0, 0, 0, 1);
			completeRound(0, 2, 0, 0, 2);
			expect(get(roundsPlayed)).toBe(2);

			resetGameOnly();

			completeRound(4, 0, 0, 0, 1);

			const rounds = get(currentGameRounds);
			expect(rounds).toHaveLength(1);
			expect(rounds[0].roundNumber).toBe(1);
		});
	});

	describe('multi-game flow', () => {
		it('completes full multi-game cycle correctly', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			// Game 1: play 2 rounds
			completeRound(2, 0, 1, 0, 1);
			completeRound(0, 2, 0, 1, 2);
			expect(get(lastRoundPoints)).toEqual({ team1: 2, team2: 2 });

			// End game 1
			addGame(makeGame({ gameNumber: 1 }));
			resetGameOnly();

			// lastRoundPoints should be reset
			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });
			expect(get(roundsPlayed)).toBe(0);
			expect(get(currentGameRounds)).toEqual([]);

			// Game 2: play 1 round
			completeRound(4, 0, 0, 0, 1);
			expect(get(lastRoundPoints)).toEqual({ team1: 4, team2: 0 });
			expect(get(roundsPlayed)).toBe(1);

			// Games from game 1 are still there
			expect(get(currentMatchGames)).toHaveLength(1);
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

		it('rebuilds lastRoundPoints baseline from restored currentGameRounds (mid-game reload bug)', () => {
			// Regression: lastRoundPoints is NOT persisted. Before the fix, a page
			// reload mid-game left the baseline at 0-0 while team points were
			// restored, so checkRoundCompletion (totalChange === 2) could never
			// fire again and the match was permanently stuck.
			const savedState = {
				matchStartedBy: null,
				lastGameHammerTeam: null,
				currentGameStartHammer: 1,
				currentTwentyTeam: 0,
				twentyDialogPending: false,
				matchStartTime: 1000,
				currentMatchGames: [],
				currentMatchRounds: [],
				currentGameRounds: [
					makeRound({ roundNumber: 1, team1Points: 2, team2Points: 0 }),
					makeRound({ roundNumber: 2, team1Points: 1, team2Points: 1 }),
					makeRound({ roundNumber: 3, team1Points: 0, team2Points: 2 })
				],
				roundsPlayed: 3
			};
			localStorageMock.store['crokinoleMatchState'] = JSON.stringify(savedState);

			loadMatchState();

			// Baseline = accumulated points of the completed rounds (3-3)
			expect(get(lastRoundPoints)).toEqual({ team1: 3, team2: 3 });
		});

		it('keeps lastRoundPoints at 0-0 when no rounds were played before the reload', () => {
			const savedState = {
				matchStartedBy: null,
				currentMatchGames: [],
				currentMatchRounds: [],
				currentGameRounds: [],
				roundsPlayed: 0
			};
			localStorageMock.store['crokinoleMatchState'] = JSON.stringify(savedState);

			loadMatchState();

			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });
		});

		it('rebuilds baseline from current-game rounds only (not previous games)', () => {
			// In a multi-game match (Bo3), previous games' rounds live in
			// currentMatchGames — only the in-progress game's rounds count.
			const savedState = {
				matchStartedBy: null,
				currentMatchGames: [makeGame({ gameNumber: 1, team1Points: 7, team2Points: 3 })],
				currentMatchRounds: [makeRound({ roundNumber: 1, team1Points: 2, team2Points: 0 })],
				currentGameRounds: [makeRound({ roundNumber: 1, team1Points: 2, team2Points: 0 })],
				roundsPlayed: 1
			};
			localStorageMock.store['crokinoleMatchState'] = JSON.stringify(savedState);

			loadMatchState();

			expect(get(lastRoundPoints)).toEqual({ team1: 2, team2: 0 });
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

	describe('double-call idempotency (double-click guards)', () => {
		it('resetMatchState called twice is idempotent', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			startMatch('user-1', 1);
			completeRound(2, 0, 1, 0, 1);
			addGame(makeGame());

			resetMatchState();
			resetMatchState();

			expect(get(roundsPlayed)).toBe(0);
			expect(get(matchStartedBy)).toBeNull();
			expect(get(currentMatchGames)).toEqual([]);
			expect(get(currentGameRounds)).toEqual([]);
			expect(get(currentMatchRounds)).toEqual([]);
			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });
		});

		it('resetGameOnly called twice is idempotent', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			addGame(makeGame({ gameNumber: 1 }));
			completeRound(2, 0, 0, 0, 1);

			resetGameOnly();
			resetGameOnly();

			expect(get(roundsPlayed)).toBe(0);
			expect(get(currentGameRounds)).toEqual([]);
			expect(get(currentMatchRounds)).toEqual([]);
			// Games from before are still preserved
			expect(get(currentMatchGames)).toHaveLength(1);
		});

		it('resetGameOnly twice does not corrupt next round numbering', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			addGame(makeGame({ gameNumber: 1 }));
			completeRound(2, 0, 0, 0, 1);
			completeRound(0, 2, 0, 0, 2);

			resetGameOnly();
			resetGameOnly();

			// New round after double-reset should start at roundNumber 1
			completeRound(4, 0, 0, 0, 1);
			const rounds = get(currentGameRounds);
			expect(rounds).toHaveLength(1);
			expect(rounds[0].roundNumber).toBe(1);
		});

		it('resetMatchState after multi-game progress clears everything', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);

			// Game 1
			startMatch('user-1', 1);
			completeRound(2, 0, 1, 0, 1);
			completeRound(0, 2, 0, 1, 2);
			addGame(makeGame({ gameNumber: 1 }));
			resetGameOnly();

			// Game 2
			completeRound(4, 0, 0, 0, 1);
			addGame(makeGame({ gameNumber: 2, winner: 1, team1Points: 4, team2Points: 0 }));
			resetGameOnly();

			// Game 3 in progress
			completeRound(2, 0, 0, 0, 1);

			expect(get(currentMatchGames)).toHaveLength(2);
			expect(get(currentGameRounds)).toHaveLength(1);
			expect(get(roundsPlayed)).toBe(1);

			resetMatchState();

			expect(get(currentMatchGames)).toEqual([]);
			expect(get(currentGameRounds)).toEqual([]);
			expect(get(currentMatchRounds)).toEqual([]);
			expect(get(roundsPlayed)).toBe(0);
			expect(get(matchStartedBy)).toBeNull();
			expect(get(matchStartTime)).toBeNull();
		});
	});

	// Bug #7 regression: defensive loading with missing/corrupted fields

	describe('defensive loading (Bug #7)', () => {
		it('fills missing fields with defaults when loading old version data', () => {
			// Simulate data from an older app version missing newer fields
			const oldData = {
				matchStartedBy: 'team1',
				currentMatchGames: [],
				roundsPlayed: 3
				// Missing: lastGameHammerTeam, currentGameStartHammer, currentTwentyTeam,
				// twentyDialogPending, matchStartTime, currentMatchRounds, currentGameRounds
			};
			localStorageMock.store['crokinoleMatchState'] = JSON.stringify(oldData);

			loadMatchState();

			const state = get(matchState);
			// Loaded field should be preserved
			expect(state.matchStartedBy).toBe('team1');
			expect(state.roundsPlayed).toBe(3);
			// Missing fields should get defaults
			expect(state.lastGameHammerTeam).toBeNull();
			expect(state.currentGameStartHammer).toBeNull();
			expect(state.currentTwentyTeam).toBe(0);
			expect(state.twentyDialogPending).toBe(false);
			expect(state.matchStartTime).toBeNull();
			expect(state.currentMatchRounds).toEqual([]);
			expect(state.currentGameRounds).toEqual([]);
		});

		it('repairs corrupted array fields', () => {
			const corruptedData = {
				matchStartedBy: null,
				lastGameHammerTeam: null,
				currentGameStartHammer: null,
				currentTwentyTeam: 0,
				twentyDialogPending: false,
				matchStartTime: null,
				currentMatchGames: 'not-an-array', // corrupted
				currentMatchRounds: null,           // corrupted
				currentGameRounds: 42,              // corrupted
				roundsPlayed: 0
			};
			localStorageMock.store['crokinoleMatchState'] = JSON.stringify(corruptedData);

			loadMatchState();

			const state = get(matchState);
			expect(Array.isArray(state.currentMatchGames)).toBe(true);
			expect(state.currentMatchGames).toEqual([]);
			expect(Array.isArray(state.currentMatchRounds)).toBe(true);
			expect(state.currentMatchRounds).toEqual([]);
			expect(Array.isArray(state.currentGameRounds)).toBe(true);
			expect(state.currentGameRounds).toEqual([]);
		});

		it('handles completely empty stored object gracefully', () => {
			localStorageMock.store['crokinoleMatchState'] = JSON.stringify({});

			loadMatchState();

			const state = get(matchState);
			expect(state.currentMatchGames).toEqual([]);
			expect(state.currentMatchRounds).toEqual([]);
			expect(state.currentGameRounds).toEqual([]);
			expect(state.roundsPlayed).toBe(0);
			expect(state.matchStartedBy).toBeNull();
		});
	});

	describe('undoLastRound', () => {
		it('returns null when there are no rounds to undo', () => {
			const result = undoLastRound();
			expect(result).toBeNull();
			expect(get(roundsPlayed)).toBe(0);
			expect(get(currentGameRounds)).toEqual([]);
			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });
		});

		it('pops the last round and returns it', () => {
			completeRound(2, 0, 1, 0, 1);
			completeRound(0, 2, 0, 1, 2);

			expect(get(roundsPlayed)).toBe(2);
			expect(get(currentGameRounds)).toHaveLength(2);

			const popped = undoLastRound();

			expect(popped).not.toBeNull();
			expect(popped!.team1Points).toBe(0);
			expect(popped!.team2Points).toBe(2);
			expect(popped!.roundNumber).toBe(2);
			expect(get(roundsPlayed)).toBe(1);
			expect(get(currentGameRounds)).toHaveLength(1);
			expect(get(currentMatchRounds)).toHaveLength(1);
		});

		it('subtracts the popped round points from lastRoundPoints', () => {
			completeRound(2, 0, 0, 0, 1); // 2-0
			completeRound(1, 1, 0, 0, 2); // 3-1

			expect(get(lastRoundPoints)).toEqual({ team1: 3, team2: 1 });

			undoLastRound();

			expect(get(lastRoundPoints)).toEqual({ team1: 2, team2: 0 });
		});

		it('floors lastRoundPoints at 0 (defensive against bad data)', () => {
			// Manually set lastRoundPoints lower than the round about to be popped
			completeRound(2, 0, 0, 0, 1);
			lastRoundPoints.set({ team1: 1, team2: 0 });

			undoLastRound();

			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });
		});

		it('updates matchState.currentGameRounds and roundsPlayed atomically', () => {
			completeRound(2, 0, 0, 0, 1);
			completeRound(0, 2, 0, 0, 2);

			undoLastRound();

			const state = get(matchState);
			expect(state.roundsPlayed).toBe(1);
			expect(state.currentGameRounds).toHaveLength(1);
			expect(state.currentMatchRounds).toHaveLength(1);
		});

		it('calls removeLastRoundFromCurrentMatch to keep the history store in sync', () => {
			completeRound(2, 0, 0, 0, 1);
			vi.clearAllMocks(); // ignore the addRoundToCurrentMatch from completeRound

			undoLastRound();

			expect(mockRemoveLastRoundFromCurrentMatch).toHaveBeenCalledOnce();
		});

		it('persists the revert to localStorage', () => {
			completeRound(2, 0, 0, 0, 1);
			completeRound(0, 2, 0, 0, 2);

			undoLastRound();

			const stored = JSON.parse(localStorageMock.store['crokinoleMatchState']);
			expect(stored.roundsPlayed).toBe(1);
			expect(stored.currentGameRounds).toHaveLength(1);
		});

		it('can be called repeatedly to unwind multiple rounds back to game start', () => {
			completeRound(2, 0, 0, 0, 1);
			completeRound(1, 1, 0, 0, 2);
			completeRound(0, 2, 0, 0, 1);

			expect(get(roundsPlayed)).toBe(3);
			expect(get(lastRoundPoints)).toEqual({ team1: 3, team2: 3 });

			undoLastRound();
			undoLastRound();
			undoLastRound();

			expect(get(roundsPlayed)).toBe(0);
			expect(get(currentGameRounds)).toHaveLength(0);
			expect(get(currentMatchRounds)).toHaveLength(0);
			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 0 });
		});

		it('returns null on the call after the last round is undone', () => {
			completeRound(2, 0, 0, 0, 1);

			expect(undoLastRound()).not.toBeNull();
			expect(undoLastRound()).toBeNull();
		});
	});

	describe('updateRoundTwenties (20s edit from RoundsPanel)', () => {
		it('updates the round in currentGameRounds AND currentMatchRounds', () => {
			// Regression: the old page-level edit only patched currentGameRounds,
			// so saveGameAndCheckMatchComplete (which sums currentMatchRounds)
			// stored stale 20s totals for the game.
			completeRound(2, 0, 1, 0, 1);
			completeRound(0, 2, 0, 2, 2);

			updateRoundTwenties(0, 3, 1);

			expect(get(currentGameRounds)[0].team1Twenty).toBe(3);
			expect(get(currentGameRounds)[0].team2Twenty).toBe(1);
			expect(get(currentMatchRounds)[0].team1Twenty).toBe(3);
			expect(get(currentMatchRounds)[0].team2Twenty).toBe(1);
			// Other rounds untouched
			expect(get(currentGameRounds)[1].team2Twenty).toBe(2);
		});

		it('does not modify points or hammer of the edited round', () => {
			completeRound(2, 0, 1, 0, 1);

			updateRoundTwenties(0, 5, 5);

			const round = get(currentGameRounds)[0];
			expect(round.team1Points).toBe(2);
			expect(round.team2Points).toBe(0);
			expect(round.hammerTeam).toBe(1);
			expect(round.roundNumber).toBe(1);
		});

		it('persists the edit to localStorage (matchState object in sync)', () => {
			// Regression: edits were lost on reload because matchState was never
			// updated nor saved.
			completeRound(2, 0, 1, 0, 1);

			updateRoundTwenties(0, 4, 2);

			const state = get(matchState);
			expect(state.currentGameRounds[0].team1Twenty).toBe(4);
			expect(state.currentMatchRounds[0].team2Twenty).toBe(2);

			const stored = JSON.parse(localStorageMock.store['crokinoleMatchState']);
			expect(stored.currentGameRounds[0].team1Twenty).toBe(4);
			expect(stored.currentMatchRounds[0].team2Twenty).toBe(2);
		});

		it('is a no-op for an out-of-range index', () => {
			completeRound(2, 0, 1, 0, 1);

			updateRoundTwenties(5, 9, 9);
			updateRoundTwenties(-1, 9, 9);

			expect(get(currentGameRounds)).toHaveLength(1);
			expect(get(currentGameRounds)[0].team1Twenty).toBe(1);
			expect(get(currentGameRounds)[0].team2Twenty).toBe(0);
		});
	});

	describe('swapTeamsInMatchState (switch sides mid-game)', () => {
		it('swaps team1/team2 fields and hammer in every round', () => {
			completeRound(2, 0, 1, 0, 1); // team1 wins round, team1 had hammer
			completeRound(0, 2, 0, 2, 2); // team2 wins round, team2 had hammer

			swapTeamsInMatchState();

			const rounds = get(currentGameRounds);
			expect(rounds[0]).toMatchObject({
				team1Points: 0,
				team2Points: 2,
				team1Twenty: 0,
				team2Twenty: 1,
				hammerTeam: 2
			});
			expect(rounds[1]).toMatchObject({
				team1Points: 2,
				team2Points: 0,
				team1Twenty: 2,
				team2Twenty: 0,
				hammerTeam: 1
			});
			// currentMatchRounds mirrors the same swap
			expect(get(currentMatchRounds)[0].team2Points).toBe(2);
		});

		it('swaps lastRoundPoints baseline so round detection stays consistent', () => {
			// Regression: after switchSides() the baseline kept the old card
			// mapping. With score 2-0 swapped to 0-2 but baseline still {2,0},
			// the next round's totalChange went negative/wrong and rounds fired
			// with corrupted points (or never fired).
			completeRound(2, 0, 0, 0, 1);
			expect(get(lastRoundPoints)).toEqual({ team1: 2, team2: 0 });

			swapTeamsInMatchState();

			expect(get(lastRoundPoints)).toEqual({ team1: 0, team2: 2 });
		});

		it('swaps completed games (winner, points, rounds, twenties)', () => {
			addGame(makeGame({
				gameNumber: 1,
				winner: 1,
				team1Points: 7,
				team2Points: 3,
				team1Rounds: 3,
				team2Rounds: 1,
				team1Twenty: 2,
				team2Twenty: 0
			}));

			swapTeamsInMatchState();

			const game = get(currentMatchGames)[0];
			expect(game.winner).toBe(2);
			expect(game.team1Points).toBe(3);
			expect(game.team2Points).toBe(7);
			expect(game.team1Rounds).toBe(1);
			expect(game.team2Rounds).toBe(3);
			expect(game.team1Twenty).toBe(0);
			expect(game.team2Twenty).toBe(2);
		});

		it('keeps a tied game winner as null', () => {
			addGame(makeGame({ gameNumber: 1, winner: null, team1Points: 4, team2Points: 4 }));

			swapTeamsInMatchState();

			expect(get(currentMatchGames)[0].winner).toBeNull();
		});

		it('swaps hammer tracking (currentGameStartHammer, lastGameHammerTeam)', () => {
			startMatch('user-1', 1);
			lastGameHammerTeam.set(2);

			swapTeamsInMatchState();

			expect(get(currentGameStartHammer)).toBe(2);
			expect(get(lastGameHammerTeam)).toBe(1);
		});

		it('leaves null hammer tracking untouched', () => {
			swapTeamsInMatchState();

			expect(get(currentGameStartHammer)).toBeNull();
			expect(get(lastGameHammerTeam)).toBeNull();
		});

		it('keeps the matchState object and localStorage in sync', () => {
			completeRound(2, 0, 1, 0, 1);

			swapTeamsInMatchState();

			const state = get(matchState);
			expect(state.currentGameRounds[0].team2Points).toBe(2);
			expect(state.currentMatchRounds[0].team2Twenty).toBe(1);

			const stored = JSON.parse(localStorageMock.store['crokinoleMatchState']);
			expect(stored.currentGameRounds[0].team2Points).toBe(2);
		});

		it('propagates the swap to the history store (currentMatch)', () => {
			swapTeamsInMatchState();
			expect(mockSwapTeamsInCurrentMatch).toHaveBeenCalledOnce();
		});

		it('is an involution: swapping twice restores the original state', () => {
			completeRound(2, 0, 1, 0, 1);
			completeRound(1, 1, 0, 1, 2);
			addGame(makeGame({ gameNumber: 1 }));
			startMatch('user-1', 2);

			const roundsBefore = get(currentGameRounds);
			const gamesBefore = get(currentMatchGames);
			const baselineBefore = get(lastRoundPoints);

			swapTeamsInMatchState();
			swapTeamsInMatchState();

			expect(get(currentGameRounds)).toEqual(roundsBefore);
			expect(get(currentMatchGames)).toEqual(gamesBefore);
			expect(get(lastRoundPoints)).toEqual(baselineBefore);
			expect(get(currentGameStartHammer)).toBe(2);
		});
	});
});
