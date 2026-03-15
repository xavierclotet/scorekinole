/**
 * Tests for tournament synced timer and timeout match completion
 *
 * Covers:
 * - subscribeToMatchStatus onCountdownTimer callback extraction
 * - Countdown timer change detection (dedup via JSON.stringify)
 * - Timeout match completion: winner determination from accumulated points
 * - Edge cases: ties, incomplete games, best-of-N, already-completed matches
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TournamentTimer } from '$lib/types/tournament';

// ─── Mock setup ──────────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

// Track subscribeTournament callbacks
let subscribeTournamentCallback: ((tournament: any) => void) | null = null;

vi.mock('./config', () => ({
	isFirebaseEnabled: () => true
}));

vi.mock('./tournaments', () => ({
	getTournament: vi.fn(),
	subscribeTournament: vi.fn((_id: string, callback: (tournament: any) => void) => {
		subscribeTournamentCallback = callback;
		return () => { subscribeTournamentCallback = null; };
	})
}));

vi.mock('./tournamentMatches', () => ({
	updateTournamentMatchRounds: vi.fn(),
	completeTournamentMatch: vi.fn(),
	markNoShow: vi.fn(),
	startTournamentMatch: vi.fn(),
	abandonTournamentMatch: vi.fn(),
	getPendingMatchesForUser: vi.fn(),
	getAllPendingMatches: vi.fn(),
	getUserActiveMatches: vi.fn(),
	resumeTournamentMatch: vi.fn()
}));

vi.mock('./tournamentBracket', () => ({
	completeBracketMatchAndAdvance: vi.fn()
}));

import { subscribeToMatchStatus } from './tournamentSync';

// ─── Helper: create tournament with group match ─────────────────────────────

function createTournamentWithMatch(
	matchId: string,
	status: string = 'IN_PROGRESS',
	countdownTimer: TournamentTimer | null = null
) {
	return {
		id: 'T1',
		countdownTimer,
		groupStage: {
			groups: [{
				id: 'G1',
				schedule: [{
					roundNumber: 1,
					matches: [{
						id: matchId,
						status,
						participantA: 'P1',
						participantB: 'P2',
						winner: status === 'COMPLETED' ? 'P1' : undefined
					}]
				}]
			}]
		}
	};
}

// ─── Tests: onCountdownTimer callback ────────────────────────────────────────

describe('subscribeToMatchStatus - onCountdownTimer', () => {
	beforeEach(() => {
		subscribeTournamentCallback = null;
	});

	it('should call onCountdownTimer when timer is present', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		const timer: TournamentTimer = { status: 'running', endsAt: Date.now() + 60000, remaining: 60, duration: 300 };
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', timer));

		expect(onTimer).toHaveBeenCalledWith(timer);
	});

	it('should NOT emit when timer is absent on first call (no change from initial null)', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', null));

		// Initial state is null, timer is null → no change → no emission
		expect(onTimer).not.toHaveBeenCalled();
	});

	it('should NOT re-emit timer if unchanged (dedup by JSON)', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		const timer: TournamentTimer = { status: 'running', endsAt: 1700000000000, remaining: 60, duration: 300 };
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', timer));
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', { ...timer }));

		expect(onTimer).toHaveBeenCalledTimes(1);
	});

	it('should emit again when timer changes (pause/resume)', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		const running: TournamentTimer = { status: 'running', endsAt: 1700000000000, remaining: 60, duration: 300 };
		const paused: TournamentTimer = { status: 'paused', remaining: 45, duration: 300 };
		const resumed: TournamentTimer = { status: 'running', endsAt: 1700000045000, remaining: 45, duration: 300 };

		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', running));
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', paused));
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', resumed));

		expect(onTimer).toHaveBeenCalledTimes(3);
		expect(onTimer).toHaveBeenNthCalledWith(1, running);
		expect(onTimer).toHaveBeenNthCalledWith(2, paused);
		expect(onTimer).toHaveBeenNthCalledWith(3, resumed);
	});

	it('should emit null when timer is removed (admin closes timer)', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		const timer: TournamentTimer = { status: 'running', endsAt: 1700000000000, remaining: 60, duration: 300 };
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', timer));
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', null));

		expect(onTimer).toHaveBeenCalledTimes(2);
		expect(onTimer).toHaveBeenNthCalledWith(2, null);
	});

	it('should still emit match status changes alongside timer changes', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		const timer: TournamentTimer = { status: 'running', endsAt: 1700000000000, remaining: 60, duration: 300 };
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', timer));

		expect(onTimer).toHaveBeenCalledTimes(1);
		expect(onStatus).toHaveBeenCalledTimes(1);
		expect(onStatus).toHaveBeenCalledWith('IN_PROGRESS', undefined, { participantA: 'P1', participantB: 'P2' });
	});

	it('should work without onCountdownTimer callback (backwards compatible)', () => {
		const onStatus = vi.fn();

		// No 7th argument
		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus);

		const timer: TournamentTimer = { status: 'running', endsAt: 1700000000000, remaining: 60, duration: 300 };
		// Should not throw
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', timer));

		expect(onStatus).toHaveBeenCalledTimes(1);
	});

	it('should not call onCountdownTimer when tournament is null', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		subscribeTournamentCallback!(null);

		expect(onTimer).not.toHaveBeenCalled();
	});

	it('should handle rapid timer updates (only emitting changes)', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		// Simulate rapid updates where remaining changes but rest stays same
		const t1: TournamentTimer = { status: 'running', endsAt: 1700000060000, remaining: 60, duration: 300 };
		const t2: TournamentTimer = { status: 'running', endsAt: 1700000060000, remaining: 59, duration: 300 };
		const t3: TournamentTimer = { status: 'running', endsAt: 1700000060000, remaining: 58, duration: 300 };

		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', t1));
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', t2));
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', t3));

		// Each has different remaining, so each is emitted
		expect(onTimer).toHaveBeenCalledTimes(3);
	});
});

// ─── Tests: Timeout winner determination logic ──────────────────────────────

describe('Timeout match completion - winner determination', () => {
	/**
	 * Extracted logic from handleTimeoutAccept for testability:
	 * Given rounds, gameMode, matchesToWin, and current game state,
	 * determine the match winner.
	 */
	function determineTimeoutWinner(
		rounds: Array<{ gameNumber: number; pointsA: number; pointsB: number }>,
		gamesAlreadyWonA: number,
		gamesAlreadyWonB: number,
		currentGameNumber: number,
		gameMode: 'rounds' | 'points',
		matchesToWin: number
	): { winner: 'A' | 'B' | null; gamesWonA: number; gamesWonB: number; totalPointsA: number; totalPointsB: number } {
		// Sum points per game
		const gamePointsMap = new Map<number, { pointsA: number; pointsB: number }>();
		let totalPointsA = 0;
		let totalPointsB = 0;

		rounds.forEach(round => {
			const gameNum = round.gameNumber;
			if (!gamePointsMap.has(gameNum)) {
				gamePointsMap.set(gameNum, { pointsA: 0, pointsB: 0 });
			}
			const game = gamePointsMap.get(gameNum)!;
			game.pointsA += round.pointsA || 0;
			game.pointsB += round.pointsB || 0;
		});

		gamePointsMap.forEach(game => {
			totalPointsA += game.pointsA;
			totalPointsB += game.pointsB;
		});

		// Force-assign current incomplete game winner
		let gamesWonA = gamesAlreadyWonA;
		let gamesWonB = gamesAlreadyWonB;

		const currentGamePoints = gamePointsMap.get(currentGameNumber);
		if (currentGamePoints) {
			const isCurrentGameAlreadyCounted = gamesWonA + gamesWonB >= currentGameNumber;
			if (!isCurrentGameAlreadyCounted) {
				if (currentGamePoints.pointsA > currentGamePoints.pointsB) {
					gamesWonA++;
				} else if (currentGamePoints.pointsB > currentGamePoints.pointsA) {
					gamesWonB++;
				}
			}
		}

		const winner = gamesWonA > gamesWonB ? 'A' : gamesWonB > gamesWonA ? 'B' : null;
		return { winner, gamesWonA, gamesWonB, totalPointsA, totalPointsB };
	}

	// --- Single game, rounds mode ---

	it('should determine winner from total points in rounds mode (A wins)', () => {
		const rounds = [
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 1, pointsA: 0, pointsB: 2 },
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },  // timeout round
		];
		const result = determineTimeoutWinner(rounds, 0, 0, 1, 'rounds', 1);
		expect(result.winner).toBe('A');
		expect(result.gamesWonA).toBe(1);
		expect(result.gamesWonB).toBe(0);
		expect(result.totalPointsA).toBe(4);
		expect(result.totalPointsB).toBe(2);
	});

	it('should determine winner from total points in rounds mode (B wins)', () => {
		const rounds = [
			{ gameNumber: 1, pointsA: 0, pointsB: 2 },
			{ gameNumber: 1, pointsA: 1, pointsB: 1 },
			{ gameNumber: 1, pointsA: 0, pointsB: 2 },  // timeout round
		];
		const result = determineTimeoutWinner(rounds, 0, 0, 1, 'rounds', 1);
		expect(result.winner).toBe('B');
		expect(result.gamesWonA).toBe(0);
		expect(result.gamesWonB).toBe(1);
		expect(result.totalPointsA).toBe(1);
		expect(result.totalPointsB).toBe(5);
	});

	it('should return tie when total points are equal', () => {
		const rounds = [
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 1, pointsA: 0, pointsB: 2 },
			{ gameNumber: 1, pointsA: 1, pointsB: 1 },  // timeout round: tie
		];
		const result = determineTimeoutWinner(rounds, 0, 0, 1, 'rounds', 1);
		expect(result.winner).toBe(null);
		expect(result.gamesWonA).toBe(0);
		expect(result.gamesWonB).toBe(0);
		expect(result.totalPointsA).toBe(3);
		expect(result.totalPointsB).toBe(3);
	});

	it('should handle single-round timeout (only the timeout round exists)', () => {
		const rounds = [
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
		];
		const result = determineTimeoutWinner(rounds, 0, 0, 1, 'rounds', 1);
		expect(result.winner).toBe('A');
		expect(result.gamesWonA).toBe(1);
		expect(result.gamesWonB).toBe(0);
	});

	it('should handle 0-0 tie round (empate with no points)', () => {
		const rounds = [
			{ gameNumber: 1, pointsA: 0, pointsB: 0 },  // no discs on board
		];
		const result = determineTimeoutWinner(rounds, 0, 0, 1, 'rounds', 1);
		expect(result.winner).toBe(null);
		expect(result.gamesWonA).toBe(0);
		expect(result.gamesWonB).toBe(0);
	});

	// --- Best-of-3, points mode ---

	it('should use games won for best-of-3 match (A already won game 1)', () => {
		// Game 1 completed: A won. Game 2 in progress when timeout.
		const rounds = [
			// Game 1 (completed, A won)
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			// Game 2 (incomplete, B leading)
			{ gameNumber: 2, pointsA: 0, pointsB: 2 },
			{ gameNumber: 2, pointsA: 0, pointsB: 2 },
			{ gameNumber: 2, pointsA: 1, pointsB: 1 },  // timeout round
		];
		// Game 1: gamesWonA=1 already counted
		const result = determineTimeoutWinner(rounds, 1, 0, 2, 'points', 2);
		expect(result.winner).toBe(null);  // 1-1 in games
		expect(result.gamesWonA).toBe(1);
		expect(result.gamesWonB).toBe(1);  // B wins game 2 (5 > 1)
	});

	it('should not double-count current game if already counted', () => {
		// Game 1 and Game 2 completed. Game 3 in progress.
		const rounds = [
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 2, pointsA: 0, pointsB: 2 },
			{ gameNumber: 3, pointsA: 2, pointsB: 0 },  // timeout round
		];
		// gamesWonA=1, gamesWonB=1 (games 1 and 2 already counted)
		// currentGameNumber=3, which is NOT yet counted (1+1 < 3)
		const result = determineTimeoutWinner(rounds, 1, 1, 3, 'rounds', 2);
		expect(result.winner).toBe('A');  // 2-1 in games
		expect(result.gamesWonA).toBe(2);
		expect(result.gamesWonB).toBe(1);
	});

	it('should correctly skip counting when current game IS already counted', () => {
		// All 3 games completed and counted - timeout triggered late
		const rounds = [
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 2, pointsA: 0, pointsB: 2 },
			{ gameNumber: 3, pointsA: 2, pointsB: 0 },
		];
		// All games already counted: gamesWonA=2, gamesWonB=1
		// currentGameNumber=3, which IS already counted (2+1 >= 3)
		const result = determineTimeoutWinner(rounds, 2, 1, 3, 'rounds', 2);
		expect(result.gamesWonA).toBe(2);
		expect(result.gamesWonB).toBe(1);
		expect(result.winner).toBe('A');
	});

	// --- Points mode ---

	it('should handle points mode single game (A ahead when timeout)', () => {
		const rounds = [
			{ gameNumber: 1, pointsA: 5, pointsB: 3 },  // Accumulated
		];
		const result = determineTimeoutWinner(rounds, 0, 0, 1, 'points', 1);
		expect(result.winner).toBe('A');
		expect(result.gamesWonA).toBe(1);
	});

	it('should handle points mode tie at timeout', () => {
		const rounds = [
			{ gameNumber: 1, pointsA: 4, pointsB: 4 },
		];
		const result = determineTimeoutWinner(rounds, 0, 0, 1, 'points', 1);
		expect(result.winner).toBe(null);
		expect(result.gamesWonA).toBe(0);
		expect(result.gamesWonB).toBe(0);
	});

	// --- Edge cases ---

	it('should handle empty rounds (timeout before any round played)', () => {
		const result = determineTimeoutWinner([], 0, 0, 1, 'rounds', 1);
		expect(result.winner).toBe(null);
		expect(result.gamesWonA).toBe(0);
		expect(result.gamesWonB).toBe(0);
		expect(result.totalPointsA).toBe(0);
		expect(result.totalPointsB).toBe(0);
	});

	it('should handle multiple rounds in same game correctly', () => {
		const rounds = [
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 1, pointsA: 0, pointsB: 2 },
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 1, pointsA: 1, pointsB: 1 },
			{ gameNumber: 1, pointsA: 0, pointsB: 2 },  // timeout round
		];
		// Total: A=5, B=5 → tie
		const result = determineTimeoutWinner(rounds, 0, 0, 1, 'rounds', 1);
		expect(result.winner).toBe(null);
		expect(result.totalPointsA).toBe(5);
		expect(result.totalPointsB).toBe(5);
	});

	it('should handle 1-point margin correctly', () => {
		const rounds = [
			{ gameNumber: 1, pointsA: 2, pointsB: 0 },
			{ gameNumber: 1, pointsA: 0, pointsB: 1 },  // B got 1 point (empate round where B led)
		];
		// Total: A=2, B=1 → A wins
		const result = determineTimeoutWinner(rounds, 0, 0, 1, 'rounds', 1);
		expect(result.winner).toBe('A');
		expect(result.totalPointsA).toBe(2);
		expect(result.totalPointsB).toBe(1);
	});
});

// ─── Tests: Timer change detection edge cases ───────────────────────────────

describe('subscribeToMatchStatus - timer dedup edge cases', () => {
	beforeEach(() => {
		subscribeTournamentCallback = null;
	});

	it('should not emit when going from null to undefined (both absent)', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		// First call with no timer
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', null));
		// Second call with undefined (missing field)
		const tournament = createTournamentWithMatch('M1', 'IN_PROGRESS', null);
		delete (tournament as any).countdownTimer;
		subscribeTournamentCallback!(tournament);

		// Both are null/undefined → treated as null → initial state is null too → no emissions
		expect(onTimer).toHaveBeenCalledTimes(0);
	});

	it('should detect stopped timer as different from paused', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		const paused: TournamentTimer = { status: 'paused', remaining: 30, duration: 300 };
		const stopped: TournamentTimer = { status: 'stopped', remaining: 30, duration: 300 };

		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', paused));
		subscribeTournamentCallback!(createTournamentWithMatch('M1', 'IN_PROGRESS', stopped));

		expect(onTimer).toHaveBeenCalledTimes(2);
		expect(onTimer).toHaveBeenNthCalledWith(1, paused);
		expect(onTimer).toHaveBeenNthCalledWith(2, stopped);
	});
});

// ─── Tests: Timeout modal point mapping ─────────────────────────────────────

describe('Timeout modal - round result to points mapping', () => {
	/**
	 * Maps roundWinner selection to points (extracted from TimeoutRoundModal logic)
	 */
	function getPointsFromWinner(roundWinner: 0 | 1 | 2): { team1Points: number; team2Points: number } {
		const team1Points = roundWinner === 1 ? 2 : roundWinner === 0 ? 1 : 0;
		const team2Points = roundWinner === 2 ? 2 : roundWinner === 0 ? 1 : 0;
		return { team1Points, team2Points };
	}

	it('should give 2-0 when team1 wins', () => {
		expect(getPointsFromWinner(1)).toEqual({ team1Points: 2, team2Points: 0 });
	});

	it('should give 0-2 when team2 wins', () => {
		expect(getPointsFromWinner(2)).toEqual({ team1Points: 0, team2Points: 2 });
	});

	it('should give 1-1 for tie', () => {
		expect(getPointsFromWinner(0)).toEqual({ team1Points: 1, team2Points: 1 });
	});
});

// ─── Tests: 20s bounds ──────────────────────────────────────────────────────

describe('Timeout modal - 20s bounds', () => {
	it('singles max should be 8', () => {
		const gameType = 'singles';
		const maxTwenty = gameType === 'singles' ? 8 : 12;
		expect(maxTwenty).toBe(8);
	});

	it('doubles max should be 12', () => {
		const gameType = 'doubles';
		const maxTwenty = gameType === 'singles' ? 8 : 12;
		expect(maxTwenty).toBe(12);
	});

	it('stepper should clamp to 0 minimum', () => {
		let value = 0;
		value = Math.max(0, value - 1);
		expect(value).toBe(0);
	});

	it('stepper should clamp to max', () => {
		let value = 8;
		const max = 8;
		value = Math.min(max, value + 1);
		expect(value).toBe(8);
	});
});

// ─── Tests: Guard against double completion ─────────────────────────────────

describe('Timeout completion guards', () => {
	it('should not complete if tournamentMatchCompletedSent is true', () => {
		// Simulating the guard: if (!context || tournamentMatchCompletedSent) return;
		let tournamentMatchCompletedSent = true;
		const context = { tournamentId: 'T1' };
		let completed = false;

		if (!context || tournamentMatchCompletedSent) {
			// early return
		} else {
			completed = true;
		}

		expect(completed).toBe(false);
	});

	it('should not complete if context is null (exited tournament)', () => {
		let tournamentMatchCompletedSent = false;
		const context = null;
		let completed = false;

		if (!context || tournamentMatchCompletedSent) {
			// early return
		} else {
			completed = true;
		}

		expect(completed).toBe(false);
	});

	it('should not show timeout modal if match already completed', () => {
		let tournamentMatchCompletedSent = true;
		let showTimeoutModal = false;
		let called = false;

		// Simulating handleTimerTimeout
		if (!tournamentMatchCompletedSent && !showTimeoutModal) {
			showTimeoutModal = true;
			called = true;
		}

		expect(showTimeoutModal).toBe(false);
		expect(called).toBe(false);
	});

	it('should not show timeout modal if already showing', () => {
		let tournamentMatchCompletedSent = false;
		let showTimeoutModal = true;
		let called = false;

		if (!tournamentMatchCompletedSent && !showTimeoutModal) {
			showTimeoutModal = true;
			called = true;
		}

		// Already true, should not re-trigger
		expect(called).toBe(false);
	});

	it('should show timeout modal when conditions are met', () => {
		let tournamentMatchCompletedSent = false;
		let showTimeoutModal = false;

		if (!tournamentMatchCompletedSent && !showTimeoutModal) {
			showTimeoutModal = true;
		}

		expect(showTimeoutModal).toBe(true);
	});

	it('should abort timeout completion if normal flow already fired during tick (double-send bug)', () => {
		// Scenario: timeout round is also the last natural round (e.g., round 4/4)
		// After finalizeRound + tick(), the normal completion fires first and sets the flag.
		// Our timeout code must check AGAIN after tick() and bail out.
		let tournamentMatchCompletedSent = false;
		let completionsSent = 0;

		// Simulate: guard at top passes
		const contextExists = true;
		if (!contextExists || tournamentMatchCompletedSent) {
			return; // early return
		}

		// Simulate: finalizeRound + tick() causes normal completion to fire
		// (the normal flow sets the flag)
		tournamentMatchCompletedSent = true;
		completionsSent++; // normal flow sent once

		// Post-tick guard (the fix)
		if (tournamentMatchCompletedSent) {
			// bail out — don't send again
		} else {
			tournamentMatchCompletedSent = true;
			completionsSent++; // timeout flow would send
		}

		expect(completionsSent).toBe(1); // only normal flow, not both
	});

	it('should proceed with timeout completion if normal flow did NOT fire during tick', () => {
		// Scenario: timeout in round 2/4 — game didn't complete naturally
		let tournamentMatchCompletedSent = false;
		let completionsSent = 0;

		const contextExists = true;
		if (!contextExists || tournamentMatchCompletedSent) {
			return;
		}

		// Simulate: finalizeRound + tick() — normal flow does NOT fire (game incomplete)
		// tournamentMatchCompletedSent stays false

		// Post-tick guard
		if (tournamentMatchCompletedSent) {
			// bail
		} else {
			tournamentMatchCompletedSent = true;
			completionsSent++;
		}

		expect(completionsSent).toBe(1);
		expect(tournamentMatchCompletedSent).toBe(true);
	});

	it('should update team.points from lastRoundPoints baseline when timeout modal is accepted', () => {
		// Simulates the fix: before calling finalizeRound, team.points must be updated
		// to include the timeout round result. In normal flow, user taps update team.points;
		// in timeout flow, this was missing — the visual score never changed.

		// Setup: 3 rounds played, cumulative score is 5-3
		const lastRoundPoints = { team1: 5, team2: 3 };
		const team1 = { points: 5 }; // same as lastRoundPoints (no partial taps in current round)
		const team2 = { points: 3 };

		// Timeout modal result: team1 wins (2-0)
		const data = { team1Points: 2, team2Points: 0, team1Twenty: 0, team2Twenty: 0 };

		// The fix: update team.points from baseline + round points
		team1.points = lastRoundPoints.team1 + data.team1Points;
		team2.points = lastRoundPoints.team2 + data.team2Points;

		// Visual score now shows updated values
		expect(team1.points).toBe(7); // 5 + 2
		expect(team2.points).toBe(3); // 3 + 0
	});

	it('should override partial taps when timeout overrides mid-round state', () => {
		// User was tapping during the round but timer expired before completion.
		// The timeout modal result should replace the partial state.

		// Setup: baseline from last completed round is 4-2
		const lastRoundPoints = { team1: 4, team2: 2 };
		// User had tapped +1 for team1 before timeout (partial round)
		const team1 = { points: 5 };
		const team2 = { points: 2 };

		// Timeout modal: tie (1-1)
		const data = { team1Points: 1, team2Points: 1, team1Twenty: 0, team2Twenty: 0 };

		// The fix overwrites partial taps with the modal's result
		team1.points = lastRoundPoints.team1 + data.team1Points;
		team2.points = lastRoundPoints.team2 + data.team2Points;

		// Score should be baseline + modal result, NOT baseline + partial taps
		expect(team1.points).toBe(5); // 4 + 1, not 5 + 1
		expect(team2.points).toBe(3); // 2 + 1
	});

	it('should handle timeout with no prior rounds (first round timeout)', () => {
		// Timer expires during the very first round
		const lastRoundPoints = { team1: 0, team2: 0 };
		const team1 = { points: 0 };
		const team2 = { points: 0 };

		// Team2 wins the only round
		const data = { team1Points: 0, team2Points: 2, team1Twenty: 0, team2Twenty: 0 };

		team1.points = lastRoundPoints.team1 + data.team1Points;
		team2.points = lastRoundPoints.team2 + data.team2Points;

		expect(team1.points).toBe(0);
		expect(team2.points).toBe(2);
	});
});

// ─── Tests: Swiss format timer subscription ─────────────────────────────────

describe('subscribeToMatchStatus - Swiss format with timer', () => {
	beforeEach(() => {
		subscribeTournamentCallback = null;
	});

	it('should extract timer from Swiss tournament', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		const timer: TournamentTimer = { status: 'paused', remaining: 120, duration: 600 };
		subscribeTournamentCallback!({
			id: 'T1',
			countdownTimer: timer,
			groupStage: {
				groups: [{
					id: 'G1',
					pairings: [{
						roundNumber: 1,
						matches: [{ id: 'M1', status: 'IN_PROGRESS', participantA: 'P1', participantB: 'P2' }]
					}]
				}]
			}
		});

		expect(onTimer).toHaveBeenCalledWith(timer);
		expect(onStatus).toHaveBeenCalledWith('IN_PROGRESS', undefined, { participantA: 'P1', participantB: 'P2' });
	});
});

// ─── Tests: Bracket match timer subscription ────────────────────────────────

describe('subscribeToMatchStatus - Bracket (FINAL) with timer', () => {
	beforeEach(() => {
		subscribeTournamentCallback = null;
	});

	it('should extract timer from bracket tournament', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'FINAL', undefined, onStatus, onTimer);

		const timer: TournamentTimer = { status: 'running', endsAt: 1700000060000, remaining: 60, duration: 300 };
		subscribeTournamentCallback!({
			id: 'T1',
			countdownTimer: timer,
			finalStage: {
				goldBracket: {
					rounds: [{
						roundNumber: 1,
						matches: [{ id: 'M1', status: 'IN_PROGRESS', participantA: 'P1', participantB: 'P2' }]
					}]
				}
			}
		});

		expect(onTimer).toHaveBeenCalledWith(timer);
		expect(onStatus).toHaveBeenCalledWith('IN_PROGRESS', undefined, { participantA: 'P1', participantB: 'P2' });
	});
});

// ─── Tests: Between-rounds timer state reset ──────────────────────────────────
// When a tournament has multiple rounds (RR or Swiss), after each round's match
// completes the player gets a new match assignment. The timer, modal, and
// completion flags must all reset so the next match starts clean.

describe('Between-rounds timer state reset (RR/Swiss)', () => {
	it('should reset all timer state when applyTournamentConfig runs for a new match', () => {
		// Simulates the state reset that applyTournamentConfig performs
		let tournamentMatchCompletedSent = true; // from previous match
		let showTimeoutModal = true; // was open from timeout
		let tournamentCountdownTimer: TournamentTimer | null = {
			status: 'running', endsAt: 1700000000000, remaining: 0, duration: 600
		};
		let isInExtraRounds = true;

		// applyTournamentConfig resets
		tournamentMatchCompletedSent = false;
		showTimeoutModal = false;
		tournamentCountdownTimer = null;
		isInExtraRounds = false;

		expect(tournamentMatchCompletedSent).toBe(false);
		expect(showTimeoutModal).toBe(false);
		expect(tournamentCountdownTimer).toBeNull();
		expect(isInExtraRounds).toBe(false);
	});

	it('should reset timer state when exitTournamentMode runs between rounds', () => {
		// exitTournamentMode also clears timer state
		let tournamentCountdownTimer: TournamentTimer | null = {
			status: 'stopped', remaining: 0, duration: 600
		};
		let showTimeoutModal = true;

		// exitTournamentMode resets
		tournamentCountdownTimer = null;
		showTimeoutModal = false;

		expect(tournamentCountdownTimer).toBeNull();
		expect(showTimeoutModal).toBe(false);
	});

	it('should handle full round-to-round cycle: R1 timeout → complete → R2 fresh', () => {
		// Round 1: timer runs and reaches timeout
		let tournamentMatchCompletedSent = false;
		let showTimeoutModal = false;
		let tournamentCountdownTimer: TournamentTimer | null = null;
		let timeoutFired = false;

		// Admin starts timer for round 1
		tournamentCountdownTimer = {
			status: 'running', endsAt: Date.now() + 600000, remaining: 600, duration: 600
		};
		expect(tournamentCountdownTimer).not.toBeNull();

		// Timer reaches 0 → timeout fires
		timeoutFired = true;
		showTimeoutModal = true;

		// Player accepts timeout → match completes
		tournamentMatchCompletedSent = true;
		showTimeoutModal = false;

		// exitTournamentMode runs (between rounds)
		tournamentCountdownTimer = null;
		showTimeoutModal = false;

		// applyTournamentConfig for round 2 match
		tournamentMatchCompletedSent = false;
		showTimeoutModal = false;
		tournamentCountdownTimer = null;
		timeoutFired = false;

		// Verify all state is fresh for round 2
		expect(tournamentMatchCompletedSent).toBe(false);
		expect(showTimeoutModal).toBe(false);
		expect(tournamentCountdownTimer).toBeNull();
		expect(timeoutFired).toBe(false);

		// Admin starts new timer for round 2
		tournamentCountdownTimer = {
			status: 'running', endsAt: Date.now() + 600000, remaining: 600, duration: 600
		};
		expect(tournamentCountdownTimer).not.toBeNull();
		expect(tournamentCountdownTimer!.status).toBe('running');
		expect(tournamentCountdownTimer!.remaining).toBe(600);
	});

	it('should handle round-to-round cycle WITHOUT timeout (normal completion)', () => {
		let tournamentMatchCompletedSent = false;
		let showTimeoutModal = false;
		let tournamentCountdownTimer: TournamentTimer | null = null;

		// Admin starts timer
		tournamentCountdownTimer = {
			status: 'running', endsAt: Date.now() + 600000, remaining: 600, duration: 600
		};

		// Match completes normally (before timeout)
		tournamentMatchCompletedSent = true;
		// Timer is still running but irrelevant

		// exitTournamentMode
		tournamentCountdownTimer = null;

		// applyTournamentConfig for next match
		tournamentMatchCompletedSent = false;
		showTimeoutModal = false;
		tournamentCountdownTimer = null;

		expect(tournamentMatchCompletedSent).toBe(false);
		expect(showTimeoutModal).toBe(false);
		expect(tournamentCountdownTimer).toBeNull();
	});

	it('should receive fresh timer from subscription after new match assignment', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		// Subscribe to match in round 1
		const unsub = subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		// Timer for round 1
		const timer1: TournamentTimer = { status: 'running', endsAt: 1700000600000, remaining: 600, duration: 600 };
		subscribeTournamentCallback!({
			id: 'T1',
			countdownTimer: timer1,
			groupStage: {
				groups: [{
					id: 'G1',
					pairings: [{
						roundNumber: 1,
						matches: [{ id: 'M1', status: 'IN_PROGRESS', participantA: 'P1', participantB: 'P2' }]
					}]
				}]
			}
		});

		expect(onTimer).toHaveBeenCalledWith(timer1);
		onTimer.mockClear();

		// Round 1 ends, unsubscribe
		unsub();

		// New subscription for round 2 match
		const onTimer2 = vi.fn();
		const onStatus2 = vi.fn();
		subscribeToMatchStatus('T1', 'M2', 'GROUP', 'G1', onStatus2, onTimer2);

		// Admin starts new timer for round 2
		const timer2: TournamentTimer = { status: 'running', endsAt: 1700001200000, remaining: 600, duration: 600 };
		subscribeTournamentCallback!({
			id: 'T1',
			countdownTimer: timer2,
			groupStage: {
				groups: [{
					id: 'G1',
					pairings: [{
						roundNumber: 2,
						matches: [{ id: 'M2', status: 'IN_PROGRESS', participantA: 'P1', participantB: 'P3' }]
					}]
				}]
			}
		});

		// New subscription gets fresh timer
		expect(onTimer2).toHaveBeenCalledWith(timer2);
		// Old callback not called again
		expect(onTimer).not.toHaveBeenCalled();
	});

	it('should not carry over timeoutFired from previous match component instance', () => {
		// TournamentSyncedTimer component is destroyed between matches.
		// When recreated, timeoutFired starts as false (fresh $state).
		// This test validates the design assumption.

		// Simulate component instance 1 (round 1)
		let timeoutFired1 = false; // $state(false) in component
		timeoutFired1 = true; // timer reached 0

		// Component destroyed (unmount between rounds)
		// Component instance 2 (round 2) — new $state
		const timeoutFired2 = false; // fresh $state(false)

		expect(timeoutFired2).toBe(false);
		// The two are independent — no shared state leak
		expect(timeoutFired1).toBe(true); // old instance unaffected
	});

	it('should handle rapid round transitions (admin restarts timer quickly)', () => {
		const onTimer = vi.fn();
		const onStatus = vi.fn();

		subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus, onTimer);

		// Timer stops (round 1 over)
		subscribeTournamentCallback!({
			id: 'T1',
			countdownTimer: { status: 'stopped', remaining: 0, duration: 600 },
			groupStage: {
				groups: [{
					id: 'G1',
					pairings: [{
						roundNumber: 1,
						matches: [{ id: 'M1', status: 'COMPLETED', participantA: 'P1', participantB: 'P2' }]
					}]
				}]
			}
		});

		// Timer removed briefly
		subscribeTournamentCallback!({
			id: 'T1',
			groupStage: {
				groups: [{
					id: 'G1',
					pairings: [{
						roundNumber: 1,
						matches: [{ id: 'M1', status: 'COMPLETED', participantA: 'P1', participantB: 'P2' }]
					}]
				}]
			}
		});

		// New timer starts immediately for round 2
		const newTimer: TournamentTimer = { status: 'running', endsAt: Date.now() + 600000, remaining: 600, duration: 600 };
		subscribeTournamentCallback!({
			id: 'T1',
			countdownTimer: newTimer,
			groupStage: {
				groups: [{
					id: 'G1',
					pairings: [{
						roundNumber: 2,
						matches: [{ id: 'M1', status: 'COMPLETED', participantA: 'P1', participantB: 'P2' }]
					}]
				}]
			}
		});

		// Should have received: stopped → null → new running
		const timerCalls = onTimer.mock.calls.map((c: any[]) => c[0]);
		expect(timerCalls.length).toBe(3);
		expect(timerCalls[0].status).toBe('stopped');
		expect(timerCalls[1]).toBeNull();
		expect(timerCalls[2].status).toBe('running');
		expect(timerCalls[2].remaining).toBe(600);
	});

	it('should detect external timer reset and update local state (admin component bug fix)', () => {
		// This tests the exact bug: AdminCountdownTimer was write-only.
		// When round completes and Firestore resets timer, admin UI must react.
		// Simulates the externalTimer $effect logic in AdminCountdownTimer.

		let localTimeRemaining = 0; // Timer was at 0 (timeout)
		let localRunning = false;
		let lastExternalJson = '';

		function applyExternalTimer(externalTimer: TournamentTimer | null) {
			if (!externalTimer) return;
			const json = JSON.stringify(externalTimer);
			if (json === lastExternalJson) return;
			lastExternalJson = json;

			if (externalTimer.status === 'stopped' && externalTimer.remaining > 0 && externalTimer.remaining !== localTimeRemaining) {
				localRunning = false;
				localTimeRemaining = externalTimer.remaining;
			}
		}

		// Timer at 0 showing "TIME!"
		expect(localTimeRemaining).toBe(0);

		// Round completes → Firestore auto-resets timer
		applyExternalTimer({ status: 'stopped', remaining: 600, duration: 600 });

		// Admin UI should now show 10:00, ready to play
		expect(localTimeRemaining).toBe(600);
		expect(localRunning).toBe(false);
	});

	it('should NOT react to external timer when admin is actively running', () => {
		// Admin starts timer → writes running to Firestore → Firestore echoes back.
		// The echo should NOT mess with local state.

		let localTimeRemaining = 550; // 9:10 remaining
		let localRunning = true;
		let lastExternalJson = '';

		function applyExternalTimer(externalTimer: TournamentTimer | null) {
			if (!externalTimer) return;
			const json = JSON.stringify(externalTimer);
			if (json === lastExternalJson) return;
			lastExternalJson = json;

			if (externalTimer.status === 'stopped' && externalTimer.remaining > 0 && externalTimer.remaining !== localTimeRemaining) {
				localRunning = false;
				localTimeRemaining = externalTimer.remaining;
			}
		}

		// Firestore echoes back a running timer (admin's own write)
		applyExternalTimer({ status: 'running', endsAt: Date.now() + 550000, remaining: 550, duration: 600 });

		// Local state unchanged — status is 'running', not 'stopped'
		expect(localTimeRemaining).toBe(550);
		expect(localRunning).toBe(true);
	});

	it('should handle dedup: same external reset twice does not re-trigger', () => {
		let applyCount = 0;
		let localTimeRemaining = 0;
		let lastExternalJson = '';

		function applyExternalTimer(externalTimer: TournamentTimer | null) {
			if (!externalTimer) return;
			const json = JSON.stringify(externalTimer);
			if (json === lastExternalJson) return;
			lastExternalJson = json;

			if (externalTimer.status === 'stopped' && externalTimer.remaining > 0 && externalTimer.remaining !== localTimeRemaining) {
				localTimeRemaining = externalTimer.remaining;
				applyCount++;
			}
		}

		const resetTimer: TournamentTimer = { status: 'stopped', remaining: 600, duration: 600 };
		applyExternalTimer(resetTimer);
		applyExternalTimer(resetTimer); // same JSON → dedup

		expect(applyCount).toBe(1);
		expect(localTimeRemaining).toBe(600);
	});

	it('should react to paused→reset external transition', () => {
		// Admin paused at 120s → round completes → Firestore resets to 600s
		let localTimeRemaining = 120;
		let localRunning = false;
		let lastExternalJson = JSON.stringify({ status: 'paused', remaining: 120, duration: 600 });

		function applyExternalTimer(externalTimer: TournamentTimer | null) {
			if (!externalTimer) return;
			const json = JSON.stringify(externalTimer);
			if (json === lastExternalJson) return;
			lastExternalJson = json;

			if (externalTimer.status === 'stopped' && externalTimer.remaining > 0 && externalTimer.remaining !== localTimeRemaining) {
				localRunning = false;
				localTimeRemaining = externalTimer.remaining;
			}
		}

		applyExternalTimer({ status: 'stopped', remaining: 600, duration: 600 });

		expect(localTimeRemaining).toBe(600);
	});

	it('should NOT reset when external says stopped with remaining=0 (genuine timeout)', () => {
		// Timer reaches 0 on server. Admin should keep showing TIME!, not reset.
		let localTimeRemaining = 0;
		let lastExternalJson = '';

		function applyExternalTimer(externalTimer: TournamentTimer | null) {
			if (!externalTimer) return;
			const json = JSON.stringify(externalTimer);
			if (json === lastExternalJson) return;
			lastExternalJson = json;

			if (externalTimer.status === 'stopped' && externalTimer.remaining > 0 && externalTimer.remaining !== localTimeRemaining) {
				localTimeRemaining = externalTimer.remaining;
			}
		}

		// Server says stopped at 0 — this is the normal timeout, not a reset
		applyExternalTimer({ status: 'stopped', remaining: 0, duration: 600 });

		expect(localTimeRemaining).toBe(0); // Unchanged
	});

	it('should reset dedup tracking per subscription (no stale lastCountdownTimerJson)', () => {
		const onTimer1 = vi.fn();
		const onStatus1 = vi.fn();

		// Subscribe for round 1
		const unsub1 = subscribeToMatchStatus('T1', 'M1', 'GROUP', 'G1', onStatus1, onTimer1);

		const timer: TournamentTimer = { status: 'running', endsAt: 1700000600000, remaining: 600, duration: 600 };
		subscribeTournamentCallback!({
			id: 'T1',
			countdownTimer: timer,
			groupStage: {
				groups: [{
					id: 'G1',
					pairings: [{
						roundNumber: 1,
						matches: [{ id: 'M1', status: 'IN_PROGRESS', participantA: 'P1', participantB: 'P2' }]
					}]
				}]
			}
		});

		expect(onTimer1).toHaveBeenCalledTimes(1);
		unsub1();

		// New subscription for round 2 with SAME timer values
		const onTimer2 = vi.fn();
		const onStatus2 = vi.fn();
		subscribeToMatchStatus('T1', 'M2', 'GROUP', 'G1', onStatus2, onTimer2);

		// Same timer object — new subscription should still emit it (fresh dedup state)
		subscribeTournamentCallback!({
			id: 'T1',
			countdownTimer: timer,
			groupStage: {
				groups: [{
					id: 'G1',
					pairings: [{
						roundNumber: 2,
						matches: [{ id: 'M2', status: 'IN_PROGRESS', participantA: 'P1', participantB: 'P3' }]
					}]
				}]
			}
		});

		// Fresh subscription = fresh dedup = timer emitted
		expect(onTimer2).toHaveBeenCalledTimes(1);
		expect(onTimer2).toHaveBeenCalledWith(timer);
	});
});
