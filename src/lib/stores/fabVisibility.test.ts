/**
 * Tests for Tournament FAB visibility logic.
 *
 * The FAB on /game shows when:
 *   !inTournamentMode
 *
 * It is always visible in friendly mode regardless of match state,
 * and only hidden when actively in a tournament match.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock constants
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

// Mock history module
vi.mock('./history', () => ({
	resetCurrentMatch: vi.fn(),
	addRoundToCurrentMatch: vi.fn(),
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
	resetGameOnly,
	currentMatchGames,
	completeRound,
	addGame
} from './matchState';
import {
	gameTournamentContext,
	setTournamentContext,
	clearTournamentContext
} from './tournamentContext';
import type { TournamentMatchContext } from './tournamentContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<TournamentMatchContext> = {}): TournamentMatchContext {
	return {
		tournamentId: 'tour-1',
		tournamentKey: 'ABC123',
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

/**
 * Compute FAB visibility from current store state.
 * Mirrors the exact logic in +page.svelte:
 *   {#if !inTournamentMode}
 */
function computeFabVisible(): boolean {
	const context = get(gameTournamentContext);
	return !context;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();
	localStorageMock.store = {};
	gameTournamentContext.set(null);
	resetMatchState();
	resetTeams();
	gameSettings.update((s) => ({
		...s,
		gameMode: 'points' as const,
		pointsToWin: 100,
		matchesToWin: 1,
		show20s: false,
		showHammer: false,
		gameType: 'singles' as const,
		eventTitle: '',
		matchPhase: '',
		lastTournamentResult: null
	}));
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Tournament FAB visibility', () => {
	describe('visible in friendly mode (no tournament context)', () => {
		it('FAB is visible in fresh friendly state', () => {
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB is visible with custom team names', () => {
			updateTeam(1, { name: 'Eagles' });
			updateTeam(2, { name: 'Hawks' });
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB is visible in rounds mode', () => {
			gameSettings.update((s) => ({ ...s, gameMode: 'rounds' as const, roundsToPlay: 4 }));
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB is visible with doubles game type', () => {
			gameSettings.update((s) => ({ ...s, gameType: 'doubles' as const }));
			expect(computeFabVisible()).toBe(true);
		});
	});

	describe('visible during friendly match gameplay', () => {
		it('FAB visible while playing rounds (no winner yet)', () => {
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			completeRound(2, 0, 0, 0, 1);
			completeRound(0, 2, 0, 0, 2);
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB visible when friendly match is complete (team1 won)', () => {
			updateTeam(1, { hasWon: true });
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB visible when friendly match is complete (team2 won)', () => {
			updateTeam(2, { hasWon: true });
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB visible between games of best-of-3 (showNextGameButton state)', () => {
			gameSettings.update((s) => ({ ...s, gameMode: 'points' as const, matchesToWin: 2 }));
			updateTeam(1, { hasWon: true });
			// hasWon but matchesToWin=2 → "next game" state, FAB still visible
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB visible when best-of-3 match is fully complete', () => {
			gameSettings.update((s) => ({ ...s, gameMode: 'points' as const, matchesToWin: 2 }));
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			addGame({
				gameNumber: 1, winner: 1,
				team1Points: 100, team2Points: 50,
				team1Rounds: 0, team2Rounds: 0,
				team1Twenty: 0, team2Twenty: 0,
				timestamp: 1000000
			});
			updateTeam(1, { hasWon: true }); // 2nd win → match complete
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB visible for tie in rounds mode', () => {
			gameSettings.update((s) => ({ ...s, gameMode: 'rounds' as const, roundsToPlay: 4 }));
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			addGame({
				gameNumber: 1, winner: 0,
				team1Points: 10, team2Points: 10,
				team1Rounds: 2, team2Rounds: 2,
				team1Twenty: 0, team2Twenty: 0,
				timestamp: 1000000
			});
			expect(computeFabVisible()).toBe(true);
		});
	});

	describe('hidden when in tournament mode', () => {
		it('FAB hidden when tournament context is set', () => {
			setTournamentContext(makeContext());
			expect(computeFabVisible()).toBe(false);
		});

		it('FAB hidden for GROUP phase', () => {
			setTournamentContext(makeContext({ phase: 'GROUP' }));
			expect(computeFabVisible()).toBe(false);
		});

		it('FAB hidden for FINAL phase', () => {
			setTournamentContext(makeContext({ phase: 'FINAL' }));
			expect(computeFabVisible()).toBe(false);
		});

		it('FAB hidden during tournament with rounds in progress', () => {
			setTournamentContext(makeContext());
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			completeRound(2, 0, 0, 0, 1);
			expect(computeFabVisible()).toBe(false);
		});

		it('FAB hidden when tournament match is complete', () => {
			setTournamentContext(makeContext());
			updateTeam(1, { hasWon: true });
			expect(computeFabVisible()).toBe(false);
		});
	});

	describe('reappears after exiting tournament mode', () => {
		it('FAB reappears after clearing tournament context', () => {
			setTournamentContext(makeContext());
			expect(computeFabVisible()).toBe(false);

			clearTournamentContext();
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB reappears after exiting tournament via handleResetMatch', () => {
			setTournamentContext(makeContext());
			gameSettings.update((s) => ({
				...s,
				gameMode: 'rounds' as const,
				eventTitle: 'Test Tournament'
			}));
			expect(computeFabVisible()).toBe(false);

			// Simulate handleResetMatch
			clearTournamentContext();
			gameSettings.update((s) => ({
				...s,
				gameMode: 'points' as const,
				lastTournamentResult: null,
				eventTitle: '',
				matchPhase: ''
			}));
			resetTeams();
			resetMatchState();

			expect(computeFabVisible()).toBe(true);
		});

		it('FAB reappears after tournament match completion + new match', () => {
			setTournamentContext(makeContext());
			updateTeam(1, { hasWon: true });
			expect(computeFabVisible()).toBe(false);

			// exitTournamentMode(false) — deferred restore
			clearTournamentContext();
			// Even though hasWon is still true, FAB shows because not in tournament
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB visible after pausing tournament match (no winner)', () => {
			setTournamentContext(makeContext());
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			completeRound(2, 0, 0, 0, 1);
			expect(computeFabVisible()).toBe(false);

			clearTournamentContext();
			resetTeams();
			resetMatchState();
			expect(computeFabVisible()).toBe(true);
		});
	});

	describe('full tournament lifecycle', () => {
		it('FAB visibility tracks tournament mode through complete lifecycle', () => {
			// 1. Start: visible
			expect(computeFabVisible()).toBe(true);

			// 2. Enter tournament: hidden
			setTournamentContext(makeContext());
			expect(computeFabVisible()).toBe(false);

			// 3. Play rounds: still hidden
			vi.spyOn(Date, 'now').mockReturnValue(1000000);
			completeRound(2, 0, 0, 0, 1);
			expect(computeFabVisible()).toBe(false);

			// 4. Win match: still hidden
			updateTeam(1, { hasWon: true });
			expect(computeFabVisible()).toBe(false);

			// 5. Exit tournament (deferred): visible immediately
			clearTournamentContext();
			expect(computeFabVisible()).toBe(true);

			// 6. New Match (full reset): still visible
			resetTeams();
			resetMatchState();
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB visible between consecutive tournament matches', () => {
			// Match 1
			setTournamentContext(makeContext({ matchId: 'match-1' }));
			expect(computeFabVisible()).toBe(false);

			clearTournamentContext();
			expect(computeFabVisible()).toBe(true);

			// Match 2
			setTournamentContext(makeContext({ matchId: 'match-2' }));
			expect(computeFabVisible()).toBe(false);

			clearTournamentContext();
			expect(computeFabVisible()).toBe(true);
		});
	});

	describe('edge cases', () => {
		it('setting context to null makes FAB visible', () => {
			setTournamentContext(makeContext());
			gameTournamentContext.set(null);
			expect(computeFabVisible()).toBe(true);
		});

		it('FAB state is consistent after rapid enter/exit', () => {
			for (let i = 0; i < 5; i++) {
				setTournamentContext(makeContext({ matchId: `match-${i}` }));
				expect(computeFabVisible()).toBe(false);
				clearTournamentContext();
				expect(computeFabVisible()).toBe(true);
			}
		});

		it('FAB visible regardless of lastTournamentResult setting', () => {
			gameSettings.update((s) => ({
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
			expect(computeFabVisible()).toBe(true);
		});
	});
});
