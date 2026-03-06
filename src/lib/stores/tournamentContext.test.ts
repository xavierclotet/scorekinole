import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
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
	gameTournamentContext,
	setTournamentContext,
	getTournamentContext,
	clearTournamentContext,
	updateTournamentContext,
	addOfflineRound,
	addOfflineGame,
	hasPendingOfflineData,
	isInTournamentMode
} from './tournamentContext';
import type { TournamentMatchContext } from './tournamentContext';
import type { MatchRound, MatchGame } from '$lib/types/history';

function makeContext(overrides: Partial<TournamentMatchContext> = {}): TournamentMatchContext {
	return {
		tournamentId: 'tour-1',
		tournamentKey: 'key-1',
		tournamentName: 'Test Tournament',
		matchId: 'match-1',
		phase: 'GROUP',
		participantAId: 'p-a',
		participantBId: 'p-b',
		participantAName: 'Player A',
		participantBName: 'Player B',
		gameConfig: {
			gameMode: 'points',
			pointsToWin: 100,
			matchesToWin: 2,
			show20s: true,
			showHammer: true,
			gameType: 'singles'
		},
		...overrides
	};
}

function makeRound(overrides: Partial<MatchRound> = {}): MatchRound {
	return {
		team1Points: 2,
		team2Points: 0,
		team1Twenty: 0,
		team2Twenty: 0,
		hammerTeam: 1,
		roundNumber: 1,
		...overrides
	};
}

function makeGame(overrides: Partial<MatchGame> = {}): MatchGame {
	return {
		team1Points: 20,
		team2Points: 15,
		gameNumber: 1,
		rounds: [],
		winner: 1,
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorageMock.store = {};
	gameTournamentContext.set(null);
});

describe('tournamentContext', () => {
	describe('set/get/clear round-trip', () => {
		it('sets, gets, and clears context correctly', () => {
			expect(getTournamentContext()).toBeNull();
			expect(isInTournamentMode()).toBe(false);

			const ctx = makeContext();
			setTournamentContext(ctx);

			expect(getTournamentContext()).toEqual(ctx);
			expect(get(gameTournamentContext)).toEqual(ctx);
			expect(isInTournamentMode()).toBe(true);

			clearTournamentContext();

			expect(getTournamentContext()).toBeNull();
			expect(get(gameTournamentContext)).toBeNull();
			expect(isInTournamentMode()).toBe(false);
		});
	});

	describe('updateTournamentContext', () => {
		it('is a no-op when context is null', () => {
			expect(getTournamentContext()).toBeNull();

			// Should not throw
			updateTournamentContext({ tournamentName: 'Updated' });

			expect(getTournamentContext()).toBeNull();
		});

		it('partially updates existing context', () => {
			setTournamentContext(makeContext());

			updateTournamentContext({ tournamentName: 'Updated Name' });

			const ctx = getTournamentContext()!;
			expect(ctx.tournamentName).toBe('Updated Name');
			expect(ctx.tournamentId).toBe('tour-1'); // unchanged
		});
	});

	describe('addOfflineRound', () => {
		it('accumulates rounds in pendingRounds', () => {
			setTournamentContext(makeContext());

			addOfflineRound(makeRound({ roundNumber: 1 }));
			addOfflineRound(makeRound({ roundNumber: 2 }));
			addOfflineRound(makeRound({ roundNumber: 3 }));

			const ctx = getTournamentContext()!;
			expect(ctx.offlineData).toBeDefined();
			expect(ctx.offlineData!.pendingRounds).toHaveLength(3);
			expect(ctx.offlineData!.pendingRounds[2].roundNumber).toBe(3);
		});

		it('is a no-op when context is null', () => {
			addOfflineRound(makeRound());
			expect(getTournamentContext()).toBeNull();
		});
	});

	describe('addOfflineGame', () => {
		it('clears pending rounds and adds game', () => {
			setTournamentContext(makeContext());

			// Add some rounds first
			addOfflineRound(makeRound({ roundNumber: 1 }));
			addOfflineRound(makeRound({ roundNumber: 2 }));
			expect(getTournamentContext()!.offlineData!.pendingRounds).toHaveLength(2);

			// Add game — should clear rounds
			addOfflineGame(makeGame({ gameNumber: 1 }));

			const ctx = getTournamentContext()!;
			expect(ctx.offlineData!.pendingRounds).toEqual([]);
			expect(ctx.offlineData!.pendingGames).toHaveLength(1);
			expect(ctx.offlineData!.currentGameNumber).toBe(2);
		});
	});

	describe('hasPendingOfflineData', () => {
		it('returns false when context is null', () => {
			expect(hasPendingOfflineData()).toBe(false);
		});

		it('returns false when no offline data', () => {
			setTournamentContext(makeContext());
			expect(hasPendingOfflineData()).toBe(false);
		});

		it('returns true with pending rounds', () => {
			setTournamentContext(makeContext());
			addOfflineRound(makeRound());
			expect(hasPendingOfflineData()).toBe(true);
		});

		it('returns true with pending games', () => {
			setTournamentContext(makeContext());
			addOfflineGame(makeGame());
			expect(hasPendingOfflineData()).toBe(true);
		});
	});

	describe('isInTournamentMode', () => {
		it('returns false when context is null', () => {
			expect(isInTournamentMode()).toBe(false);
		});

		it('returns true when context is set', () => {
			setTournamentContext(makeContext());
			expect(isInTournamentMode()).toBe(true);
		});
	});
});
