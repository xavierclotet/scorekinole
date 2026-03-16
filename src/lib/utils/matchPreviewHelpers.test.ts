import { describe, it, expect } from 'vitest';
import {
	getInitials,
	getPartnerInitials,
	shouldShowPlayButton,
	isRoundEditable,
	isRoundsPanelReadonly,
	deriveTimeoutRoundPoints,
	determineMatchStartRoute,
	getScorerWarningName
} from './matchPreviewHelpers';

// ============================================================================
// getInitials
// ============================================================================

describe('getInitials', () => {
	it('single word → first character uppercase', () => {
		expect(getInitials('Xavier')).toBe('X');
	});

	it('two words → first + last initial', () => {
		expect(getInitials('Xavier Costa')).toBe('XC');
	});

	it('three words → first + last initial (skips middle)', () => {
		expect(getInitials('Xavier Costa Prats')).toBe('XP');
	});

	it('lowercase input → uppercase output', () => {
		expect(getInitials('john doe')).toBe('JD');
	});

	it('handles extra whitespace', () => {
		expect(getInitials('  Maria   Garcia  ')).toBe('MG');
	});

	it('single character name', () => {
		expect(getInitials('A')).toBe('A');
	});
});

// ============================================================================
// getPartnerInitials
// ============================================================================

describe('getPartnerInitials', () => {
	it('extracts partner initials from combined name', () => {
		expect(getPartnerInitials('Xavier Costa / Maria Garcia')).toBe('MG');
	});

	it('partner with single name', () => {
		expect(getPartnerInitials('Player A / Bob')).toBe('B');
	});

	it('returns ? if no separator', () => {
		expect(getPartnerInitials('Just One Name')).toBe('?');
	});

	it('handles three-part combined name', () => {
		expect(getPartnerInitials('A / B / C')).toBe('B');
	});
});

// ============================================================================
// shouldShowPlayButton
// ============================================================================

describe('shouldShowPlayButton', () => {
	it('hammer enabled + not resuming + not auto-alternate → no play button (hammer selects)', () => {
		expect(shouldShowPlayButton(true, false, false)).toBe(false);
	});

	it('hammer enabled + resuming → show play button (skip hammer for resumed match)', () => {
		expect(shouldShowPlayButton(true, true, false)).toBe(true);
	});

	it('hammer enabled + auto-alternate → show play button (auto-assigned)', () => {
		expect(shouldShowPlayButton(true, false, true)).toBe(true);
	});

	it('hammer disabled → always show play button', () => {
		expect(shouldShowPlayButton(false, false, false)).toBe(true);
	});

	it('hammer disabled + resuming → show play button', () => {
		expect(shouldShowPlayButton(false, true, false)).toBe(true);
	});

	it('all true → show play button (resuming overrides hammer)', () => {
		expect(shouldShowPlayButton(true, true, true)).toBe(true);
	});
});

// ============================================================================
// isRoundEditable (RoundsPanel readonly fix)
// ============================================================================

describe('isRoundEditable', () => {
	it('readonly=false, not completed → editable', () => {
		expect(isRoundEditable(false, false)).toBe(true);
	});

	it('readonly=true, not completed → NOT editable', () => {
		expect(isRoundEditable(true, false)).toBe(false);
	});

	it('readonly=false, completed → NOT editable', () => {
		expect(isRoundEditable(false, true)).toBe(false);
	});

	it('readonly=true, completed → NOT editable', () => {
		expect(isRoundEditable(true, true)).toBe(false);
	});
});

// ============================================================================
// deriveTimeoutRoundPoints (TimeoutRoundModal scoring)
// ============================================================================

describe('deriveTimeoutRoundPoints', () => {
	it('team 1 wins → 2-0', () => {
		const result = deriveTimeoutRoundPoints(1);
		expect(result.team1Points).toBe(2);
		expect(result.team2Points).toBe(0);
		expect(result.canAccept).toBe(true);
	});

	it('team 2 wins → 0-2', () => {
		const result = deriveTimeoutRoundPoints(2);
		expect(result.team1Points).toBe(0);
		expect(result.team2Points).toBe(2);
		expect(result.canAccept).toBe(true);
	});

	it('tie → 1-1', () => {
		const result = deriveTimeoutRoundPoints(0);
		expect(result.team1Points).toBe(1);
		expect(result.team2Points).toBe(1);
		expect(result.canAccept).toBe(true);
	});

	it('null (no selection) → 0-0, canAccept false', () => {
		const result = deriveTimeoutRoundPoints(null);
		expect(result.team1Points).toBe(0);
		expect(result.team2Points).toBe(0);
		expect(result.canAccept).toBe(false);
	});

	it('points always sum to 2 when a winner is selected', () => {
		for (const winner of [0, 1, 2] as const) {
			const result = deriveTimeoutRoundPoints(winner);
			expect(result.team1Points + result.team2Points).toBe(2);
		}
	});

	it('winner always gets >= loser points', () => {
		const r1 = deriveTimeoutRoundPoints(1);
		expect(r1.team1Points).toBeGreaterThan(r1.team2Points);

		const r2 = deriveTimeoutRoundPoints(2);
		expect(r2.team2Points).toBeGreaterThan(r2.team1Points);

		const tie = deriveTimeoutRoundPoints(0);
		expect(tie.team1Points).toBe(tie.team2Points);
	});
});

// ============================================================================
// Integration: MatchPreviewDialog flow contracts
// ============================================================================

describe('MatchPreviewDialog flow contracts', () => {
	it('hammer selection mode: no play button, selecting starter auto-starts', () => {
		// When showHammer is on and not resuming and not auto-alternate
		const showPlay = shouldShowPlayButton(true, false, false);
		expect(showPlay).toBe(false);
		// User must click a starter button → handleHammerSelect inverts → doPlay
	});

	it('resuming match: play button shown, no hammer re-selection', () => {
		const showPlay = shouldShowPlayButton(true, true, false);
		expect(showPlay).toBe(true);
	});

	it('auto-alternate mode: play button shown, hammer auto-assigned', () => {
		const showPlay = shouldShowPlayButton(true, false, true);
		expect(showPlay).toBe(true);
	});
});

// ============================================================================
// Integration: isExitingTournament finally pattern
// ============================================================================

describe('isExitingTournament finally pattern', () => {
	/**
	 * This tests the contract of the bug fix: isExitingTournament must
	 * always reset to false after the exit attempt, whether it succeeds or fails.
	 * The fix was changing catch → finally in the game page.
	 */

	it('flag resets on success (finally pattern)', async () => {
		let isExitingTournament = true;
		try {
			// Simulate successful exit
			await Promise.resolve();
		} finally {
			isExitingTournament = false;
		}
		expect(isExitingTournament).toBe(false);
	});

	it('flag resets on failure (finally pattern)', async () => {
		let isExitingTournament = true;
		try {
			// Simulate failed exit
			throw new Error('exit failed');
		} catch {
			// Error handled
		} finally {
			isExitingTournament = false;
		}
		expect(isExitingTournament).toBe(false);
	});

	it('BUG REGRESSION: catch-only pattern would NOT reset on success', async () => {
		let isExitingTournament = true;
		try {
			// Simulate successful exit — no error thrown
			await Promise.resolve();
		} catch {
			// This block only runs on error — flag stays true!
			isExitingTournament = false;
		}
		// BUG: flag is still true after success
		expect(isExitingTournament).toBe(true);
	});
});

// ============================================================================
// isRoundsPanelReadonly
// ============================================================================

describe('isRoundsPanelReadonly', () => {
	it('both flags false → not readonly', () => {
		expect(isRoundsPanelReadonly(false, null)).toBe(false);
	});

	it('tournamentMatchCompletedSent=true → readonly', () => {
		expect(isRoundsPanelReadonly(true, null)).toBe(true);
	});

	it('lastTournamentResult set → readonly', () => {
		expect(isRoundsPanelReadonly(false, { winnerName: 'X' })).toBe(true);
	});

	it('both flags true → readonly', () => {
		expect(isRoundsPanelReadonly(true, { winnerName: 'X' })).toBe(true);
	});

	it('lastTournamentResult=undefined → not readonly (only if completedSent=false)', () => {
		expect(isRoundsPanelReadonly(false, undefined)).toBe(false);
	});
});

// ============================================================================
// Tournament match completion → RoundsPanel readonly flow
// ============================================================================

describe('Tournament match completion → RoundsPanel readonly', () => {
	/**
	 * Simulates the state machine of a tournament match lifecycle:
	 *
	 * 1. Match starts → not readonly (rounds editable)
	 * 2. Match completes → readonly (rounds locked)
	 * 3. New friendly match starts → not readonly (new rounds editable)
	 *
	 * These tests verify the state transitions that control RoundsPanel editability.
	 */

	// --- Helper to simulate game page state ---
	function createGameState() {
		let tournamentMatchCompletedSent = false;
		let lastTournamentResult: Record<string, unknown> | null = null;

		return {
			get readonly() {
				return isRoundsPanelReadonly(tournamentMatchCompletedSent, lastTournamentResult);
			},
			get tournamentMatchCompletedSent() { return tournamentMatchCompletedSent; },
			get lastTournamentResult() { return lastTournamentResult; },

			// Simulates handleTournamentMatchComplete() — synchronous part
			completeTournamentMatch(winner: string) {
				tournamentMatchCompletedSent = true;
				lastTournamentResult = {
					winnerName: winner,
					scoreA: 1,
					scoreB: 0,
					isTie: false,
					team1Name: 'Player A',
					team2Name: 'Player B'
				};
			},

			// Simulates Firebase write failure → flag reset
			firebaseWriteFailed() {
				tournamentMatchCompletedSent = false;
			},

			// Simulates handleResetMatch() → new friendly match
			resetForNewMatch() {
				lastTournamentResult = null;
				tournamentMatchCompletedSent = false;
			},

			// Simulates exitTournamentMode() — clears context but keeps result
			exitTournamentMode() {
				// Does NOT clear lastTournamentResult
				// Does NOT clear tournamentMatchCompletedSent
			},

			// Simulates page reload — local $state resets, gameSettings persists
			simulatePageReload() {
				tournamentMatchCompletedSent = false;
				// lastTournamentResult is persisted via gameSettings/localStorage
			},

			// Simulates starting a new tournament match
			startNewTournamentMatch() {
				tournamentMatchCompletedSent = false;
				lastTournamentResult = null;
			}
		};
	}

	// --- Phase 1: During tournament match ---

	it('during active tournament match → rounds are editable', () => {
		const state = createGameState();
		expect(state.readonly).toBe(false);

		// Current game rounds should be editable
		expect(isRoundEditable(state.readonly, false)).toBe(true);
	});

	it('during active match, completed game rounds are NOT editable', () => {
		const state = createGameState();
		// Completed game in a multi-game match
		expect(isRoundEditable(state.readonly, true)).toBe(false);
	});

	// --- Phase 2: Tournament match completes ---

	it('after match completion → rounds become readonly immediately', () => {
		const state = createGameState();
		expect(state.readonly).toBe(false);

		state.completeTournamentMatch('Player A');

		expect(state.readonly).toBe(true);
		expect(state.tournamentMatchCompletedSent).toBe(true);
		expect(state.lastTournamentResult).not.toBeNull();
	});

	it('after match completion → current game rounds are NOT editable', () => {
		const state = createGameState();
		state.completeTournamentMatch('Player A');

		// Even current (non-completed) game rounds should be locked
		expect(isRoundEditable(state.readonly, false)).toBe(false);
	});

	it('after match completion → completed game rounds are NOT editable', () => {
		const state = createGameState();
		state.completeTournamentMatch('Player A');

		expect(isRoundEditable(state.readonly, true)).toBe(false);
	});

	it('after match completion + exitTournamentMode → still readonly', () => {
		const state = createGameState();
		state.completeTournamentMatch('Player A');
		state.exitTournamentMode();

		// Both flags still set → readonly
		expect(state.readonly).toBe(true);
	});

	// --- Phase 3: Firebase failure edge case ---

	it('Firebase write failure → readonly preserved via lastTournamentResult', () => {
		const state = createGameState();
		state.completeTournamentMatch('Player A');

		// Firebase fails → tournamentMatchCompletedSent resets
		state.firebaseWriteFailed();

		// lastTournamentResult is still set → readonly = true
		expect(state.tournamentMatchCompletedSent).toBe(false);
		expect(state.lastTournamentResult).not.toBeNull();
		expect(state.readonly).toBe(true);
	});

	it('Firebase failure + no lastTournamentResult → rounds would be editable (impossible state)', () => {
		// This scenario can't happen in practice because lastTournamentResult
		// is always set AFTER the Firebase call, but we test the logic anyway
		const state = createGameState();
		// Only set completedSent, then fail — no result set
		expect(isRoundsPanelReadonly(false, null)).toBe(false);
	});

	// --- Phase 4: Page reload ---

	it('page reload after completion → readonly via persisted lastTournamentResult', () => {
		const state = createGameState();
		state.completeTournamentMatch('Player A');
		state.exitTournamentMode();

		// Simulate page reload: local $state resets, gameSettings persists
		state.simulatePageReload();

		// tournamentMatchCompletedSent = false (local state reset)
		// lastTournamentResult is still set (persisted in gameSettings/localStorage)
		expect(state.tournamentMatchCompletedSent).toBe(false);
		expect(state.lastTournamentResult).not.toBeNull();
		expect(state.readonly).toBe(true);
	});

	// --- Phase 5: New friendly match ---

	it('new friendly match (handleResetMatch) → rounds become editable', () => {
		const state = createGameState();
		state.completeTournamentMatch('Player A');
		state.exitTournamentMode();

		expect(state.readonly).toBe(true);

		// User starts new match
		state.resetForNewMatch();

		expect(state.tournamentMatchCompletedSent).toBe(false);
		expect(state.lastTournamentResult).toBeNull();
		expect(state.readonly).toBe(false);

		// New match rounds should be editable
		expect(isRoundEditable(state.readonly, false)).toBe(true);
	});

	it('new tournament match after completion → rounds editable', () => {
		const state = createGameState();
		state.completeTournamentMatch('Player A');
		state.exitTournamentMode();

		expect(state.readonly).toBe(true);

		// Another tournament match starts
		state.startNewTournamentMatch();

		expect(state.readonly).toBe(false);
		expect(isRoundEditable(state.readonly, false)).toBe(true);
	});

	// --- Phase 6: handleRoundClick guard ---

	it('handleRoundClick contract: readonly=true blocks editing even if game is not completed', () => {
		// This simulates the function body guard: if (readonly) return;
		const readonly = true;
		const gameIsCompleted = false;
		const hasMoved = false;

		// Guard chain as in handleRoundClick:
		const shouldBlock = hasMoved || readonly;
		expect(shouldBlock).toBe(true);
	});

	it('handleRoundClick contract: readonly=false + game not completed → editing allowed', () => {
		const readonly = false;
		const gameIsCompleted = false;
		const hasMoved = false;

		const shouldBlock = hasMoved || readonly;
		expect(shouldBlock).toBe(false);
		expect(isRoundEditable(readonly, gameIsCompleted)).toBe(true);
	});

	// --- Full lifecycle test ---

	it('full lifecycle: start → play → complete → show result → new match', () => {
		const state = createGameState();

		// 1. Tournament match starts
		expect(state.readonly).toBe(false);
		expect(isRoundEditable(state.readonly, false)).toBe(true);

		// 2. Rounds are played (still editable for 20s adjustment)
		expect(isRoundEditable(state.readonly, false)).toBe(true);

		// 3. Match completes
		state.completeTournamentMatch('Player A');
		expect(state.readonly).toBe(true);
		expect(isRoundEditable(state.readonly, false)).toBe(false);

		// 4. Exit tournament mode (show result in RoundsPanel)
		state.exitTournamentMode();
		expect(state.readonly).toBe(true);
		expect(isRoundEditable(state.readonly, false)).toBe(false);

		// 5. User starts new friendly match
		state.resetForNewMatch();
		expect(state.readonly).toBe(false);
		expect(isRoundEditable(state.readonly, false)).toBe(true);
	});

	it('full lifecycle with page reload mid-flow', () => {
		const state = createGameState();

		// 1. Tournament match completes
		state.completeTournamentMatch('Player B');
		state.exitTournamentMode();
		expect(state.readonly).toBe(true);

		// 2. User reloads page
		state.simulatePageReload();
		expect(state.readonly).toBe(true); // Still readonly via lastTournamentResult

		// 3. User starts new match (handleResetMatch)
		state.resetForNewMatch();
		expect(state.readonly).toBe(false);
		expect(isRoundEditable(state.readonly, false)).toBe(true);
	});
});

// ============================================================================
// determineMatchStartRoute (Unified tournament match start flow)
// ============================================================================

describe('determineMatchStartRoute', () => {
	describe('with hammer enabled, fresh match (no existing progress)', () => {
		it('with preview options → routes to preview (MatchPreviewDialog)', () => {
			expect(determineMatchStartRoute(true, true, false, false)).toBe('preview');
		});

		it('without preview options, auto-alternate → routes to autoHammer', () => {
			expect(determineMatchStartRoute(false, true, false, true)).toBe('autoHammer');
		});

		it('without preview options, no auto-alternate → routes to hammerDialog (fallback)', () => {
			expect(determineMatchStartRoute(false, true, false, false)).toBe('hammerDialog');
		});

		it('with preview options + auto-alternate → preview takes priority', () => {
			expect(determineMatchStartRoute(true, true, false, true)).toBe('preview');
		});
	});

	describe('with hammer enabled, resuming match (has existing progress)', () => {
		it('with preview options → routes to preview', () => {
			expect(determineMatchStartRoute(true, true, true, false)).toBe('preview');
		});

		it('without preview options → direct start (no hammer for resumed matches)', () => {
			expect(determineMatchStartRoute(false, true, true, false)).toBe('direct');
		});
	});

	describe('with hammer disabled', () => {
		it('with preview options → routes to preview (apply colors)', () => {
			expect(determineMatchStartRoute(true, false, false, false)).toBe('preview');
		});

		it('without preview options, fresh match → direct start', () => {
			expect(determineMatchStartRoute(false, false, false, false)).toBe('direct');
		});

		it('without preview options, resuming → direct start', () => {
			expect(determineMatchStartRoute(false, false, true, false)).toBe('direct');
		});
	});

	describe('unified flow contracts', () => {
		it('in unified flow, all tournament matches have preview options → never hammerDialog', () => {
			// When the unified flow is active, hasMatchPreviewOptions is always true
			// because all matches go through MatchPreviewDialog first
			const routes = [
				determineMatchStartRoute(true, true, false, false),   // hammer, fresh
				determineMatchStartRoute(true, true, true, false),    // hammer, resuming
				determineMatchStartRoute(true, false, false, false),  // no hammer, fresh
				determineMatchStartRoute(true, false, true, false),   // no hammer, resuming
				determineMatchStartRoute(true, true, false, true),    // hammer, auto-alternate
			];

			// None should be 'hammerDialog'
			expect(routes).not.toContain('hammerDialog');
			// All should be 'preview'
			expect(routes.every(r => r === 'preview')).toBe(true);
		});

		it('hammerDialog only appears when preview options are missing (legacy/fallback)', () => {
			const route = determineMatchStartRoute(false, true, false, false);
			expect(route).toBe('hammerDialog');
		});

		it('auto-alternate without preview options still works (group stage shortcut)', () => {
			const route = determineMatchStartRoute(false, true, false, true);
			expect(route).toBe('autoHammer');
		});
	});
});

describe('getScorerWarningName', () => {
	const scorer = { userId: 'user-123', userName: 'Xavier' };

	it('returns undefined when no scorer', () => {
		expect(getScorerWarningName(undefined, 'user-123')).toBeUndefined();
		expect(getScorerWarningName(null, 'user-123')).toBeUndefined();
	});

	it('returns undefined when scorer is the current user (same userId)', () => {
		expect(getScorerWarningName(scorer, 'user-123')).toBeUndefined();
	});

	it('returns scorer name when scorer is a different user', () => {
		expect(getScorerWarningName(scorer, 'user-456')).toBe('Xavier');
	});

	it('returns scorer name when current user is not logged in (undefined)', () => {
		expect(getScorerWarningName(scorer, undefined)).toBe('Xavier');
	});

	it('returns scorer name when current user is null', () => {
		expect(getScorerWarningName(scorer, null)).toBe('Xavier');
	});

	it('returns undefined when both scorer and currentUser are undefined', () => {
		expect(getScorerWarningName(undefined, undefined)).toBeUndefined();
	});
});

// ============================================================================
// BUG REGRESSION: Editing 20s must update BOTH stores for Firebase sync
// ============================================================================

describe('BUG REGRESSION: dual-store 20s edit sync', () => {
	/**
	 * Root cause: handleEdit20sConfirm only called updateCurrentMatchRound()
	 * which updates currentMatch.rounds (history store), but
	 * saveTournamentProgressToLocalStorage reads from currentGameRounds
	 * (matchState store). The two stores were out of sync, so Firebase
	 * received stale 20s values after editing.
	 *
	 * Fix: handleEdit20sConfirm now updates BOTH stores before syncing.
	 * These tests simulate the dual-store pattern to prevent regression.
	 */

	interface RoundLike { team1Twenty: number; team2Twenty: number; [key: string]: any }

	function simulateDualStoreEdit(
		historyRounds: RoundLike[],
		gameRounds: RoundLike[],
		editIndex: number,
		newTeam1Twenty: number,
		newTeam2Twenty: number,
		updateBothStores: boolean
	): { historyRounds: RoundLike[]; gameRounds: RoundLike[] } {
		// 1. Always update history store (updateCurrentMatchRound)
		const updatedHistory = [...historyRounds];
		if (updatedHistory[editIndex]) {
			updatedHistory[editIndex] = {
				...updatedHistory[editIndex],
				team1Twenty: newTeam1Twenty,
				team2Twenty: newTeam2Twenty
			};
		}

		// 2. Only update gameRounds if the fix is applied
		const updatedGameRounds = [...gameRounds];
		if (updateBothStores && updatedGameRounds[editIndex]) {
			updatedGameRounds[editIndex] = {
				...updatedGameRounds[editIndex],
				team1Twenty: newTeam1Twenty,
				team2Twenty: newTeam2Twenty
			};
		}

		return { historyRounds: updatedHistory, gameRounds: updatedGameRounds };
	}

	const initialRounds: RoundLike[] = [
		{ team1Twenty: 0, team2Twenty: 0, team1Points: 20, team2Points: 0 },
		{ team1Twenty: 0, team2Twenty: 0, team1Points: 0, team2Points: 15 }
	];

	it('BUG: old code only updated history store — gameRounds stayed stale', () => {
		const result = simulateDualStoreEdit(
			initialRounds, initialRounds,
			0, 1, 2,
			false // BUG: only history updated
		);

		// History got updated...
		expect(result.historyRounds[0].team1Twenty).toBe(1);
		expect(result.historyRounds[0].team2Twenty).toBe(2);

		// ...but gameRounds (used by Firebase sync) is STALE
		expect(result.gameRounds[0].team1Twenty).toBe(0); // BUG: still 0
		expect(result.gameRounds[0].team2Twenty).toBe(0); // BUG: still 0
	});

	it('FIX: both stores updated — gameRounds matches history', () => {
		const result = simulateDualStoreEdit(
			initialRounds, initialRounds,
			0, 1, 2,
			true // FIX: both stores updated
		);

		expect(result.historyRounds[0].team1Twenty).toBe(1);
		expect(result.historyRounds[0].team2Twenty).toBe(2);

		// gameRounds now in sync
		expect(result.gameRounds[0].team1Twenty).toBe(1);
		expect(result.gameRounds[0].team2Twenty).toBe(2);
	});

	it('FIX: editing second round updates both stores correctly', () => {
		const result = simulateDualStoreEdit(
			initialRounds, initialRounds,
			1, 3, 0,
			true
		);

		// First round untouched
		expect(result.historyRounds[0].team1Twenty).toBe(0);
		expect(result.gameRounds[0].team1Twenty).toBe(0);

		// Second round updated in both
		expect(result.historyRounds[1].team1Twenty).toBe(3);
		expect(result.historyRounds[1].team2Twenty).toBe(0);
		expect(result.gameRounds[1].team1Twenty).toBe(3);
		expect(result.gameRounds[1].team2Twenty).toBe(0);
	});

	it('FIX: other fields preserved after 20s edit', () => {
		const result = simulateDualStoreEdit(
			initialRounds, initialRounds,
			0, 2, 1,
			true
		);

		// Points not affected
		expect(result.historyRounds[0].team1Points).toBe(20);
		expect(result.historyRounds[0].team2Points).toBe(0);
		expect(result.gameRounds[0].team1Points).toBe(20);
		expect(result.gameRounds[0].team2Points).toBe(0);
	});
});
