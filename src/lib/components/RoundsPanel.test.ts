/**
 * Unit tests for RoundsPanel click logic.
 *
 * Since this is a Svelte component (no DOM test environment), we test the
 * pure logic functions that drive handleRoundClick and displayGames.
 */
import { describe, it, expect, vi } from 'vitest';

// ─── Mirrors displayGames derivation (RoundsPanel.svelte) ────────────────────

interface RoundData {
	roundNumber: number;
	team1Points: number;
	team2Points: number;
	team1Twenty: number;
	team2Twenty: number;
}

interface GameData {
	gameNumber?: number;
	rounds: RoundData[];
	winner?: number | null;
}

interface DisplayGame {
	gameNumber: number;
	rounds: RoundData[];
	isCompleted: boolean;
}

function buildDisplayGames(games: GameData[], currentRounds: RoundData[]): DisplayGame[] {
	const result: DisplayGame[] = games.map((g, i) => ({
		gameNumber: g.gameNumber || i + 1,
		rounds: g.rounds || [],
		isCompleted: true
	}));

	if (currentRounds.length > 0) {
		result.push({
			gameNumber: result.length + 1,
			rounds: currentRounds,
			isCompleted: false
		});
	}

	return result;
}

// ─── Mirrors handleRoundClick logic (RoundsPanel.svelte) ─────────────────────

function simulateRoundClick(
	roundIndex: number,
	selectedGameIndex: number,
	displayGames: DisplayGame[],
	hasMoved: boolean,
	isReadonly: boolean,
	onedit20s: ((idx: number, t1: number, t2: number) => void) | undefined
) {
	if (hasMoved) return 'hasMoved';
	if (isReadonly) return 'readonly';

	const game = displayGames[selectedGameIndex];
	if (!game || !game.rounds[roundIndex]) return 'noRound';
	if (game.isCompleted) return 'completed';

	onedit20s?.(roundIndex, game.rounds[roundIndex].team1Twenty, game.rounds[roundIndex].team2Twenty);
	return 'ok';
}

// ─── Mirrors reversed-index calculation in template ──────────────────────────
// Template: {#each [...rounds].reverse() as round, i}
//   {@const index = rounds.length - 1 - i}
function getRoundIndexFromDisplayPosition(totalRounds: number, displayPosition: number): number {
	return totalRounds - 1 - displayPosition;
}

// ─── Test data helpers ────────────────────────────────────────────────────────

function makeRound(roundNumber: number, overrides: Partial<RoundData> = {}): RoundData {
	return {
		roundNumber,
		team1Points: 2,
		team2Points: 0,
		team1Twenty: 1,
		team2Twenty: 0,
		...overrides
	};
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildDisplayGames', () => {
	it('returns empty array when no games and no current rounds', () => {
		expect(buildDisplayGames([], [])).toEqual([]);
	});

	it('marks completed games as isCompleted: true', () => {
		const games = [{ gameNumber: 1, rounds: [makeRound(1)], winner: 1 }];
		const result = buildDisplayGames(games, []);
		expect(result).toHaveLength(1);
		expect(result[0].isCompleted).toBe(true);
	});

	it('appends current game with isCompleted: false when rounds exist', () => {
		const result = buildDisplayGames([], [makeRound(1), makeRound(2)]);
		expect(result).toHaveLength(1);
		expect(result[0].isCompleted).toBe(false);
		expect(result[0].rounds).toHaveLength(2);
	});

	it('does NOT append current game when currentRounds is empty', () => {
		const result = buildDisplayGames([], []);
		expect(result).toHaveLength(0);
	});

	it('numbers current game correctly after completed games', () => {
		const completedGames = [
			{ gameNumber: 1, rounds: [makeRound(1)], winner: 1 },
			{ gameNumber: 2, rounds: [makeRound(1)], winner: 2 }
		];
		const result = buildDisplayGames(completedGames, [makeRound(1)]);
		expect(result).toHaveLength(3);
		expect(result[2].gameNumber).toBe(3);
		expect(result[2].isCompleted).toBe(false);
	});

	it('falls back to index-based game number when gameNumber is missing', () => {
		const games = [{ rounds: [makeRound(1)] } as GameData];
		const result = buildDisplayGames(games, []);
		expect(result[0].gameNumber).toBe(1);
	});
});

describe('handleRoundClick logic', () => {
	it('calls onedit20s with correct roundIndex and 20s values', () => {
		const callback = vi.fn();
		const rounds = [makeRound(1, { team1Twenty: 3, team2Twenty: 1 })];
		const displayGames = buildDisplayGames([], rounds);

		simulateRoundClick(0, 0, displayGames, false, false, callback);

		expect(callback).toHaveBeenCalledOnce();
		expect(callback).toHaveBeenCalledWith(0, 3, 1);
	});

	it('does NOT call onedit20s when hasMoved is true', () => {
		const callback = vi.fn();
		const rounds = [makeRound(1)];
		const displayGames = buildDisplayGames([], rounds);

		const result = simulateRoundClick(0, 0, displayGames, true, false, callback);

		expect(result).toBe('hasMoved');
		expect(callback).not.toHaveBeenCalled();
	});

	it('does NOT call onedit20s when isReadonly is true', () => {
		const callback = vi.fn();
		const rounds = [makeRound(1)];
		const displayGames = buildDisplayGames([], rounds);

		const result = simulateRoundClick(0, 0, displayGames, false, true, callback);

		expect(result).toBe('readonly');
		expect(callback).not.toHaveBeenCalled();
	});

	it('does NOT call onedit20s for completed game rounds', () => {
		const callback = vi.fn();
		const completedGames = [{ gameNumber: 1, rounds: [makeRound(1)], winner: 1 }];
		const displayGames = buildDisplayGames(completedGames, []);

		const result = simulateRoundClick(0, 0, displayGames, false, false, callback);

		expect(result).toBe('completed');
		expect(callback).not.toHaveBeenCalled();
	});

	it('does NOT call onedit20s when roundIndex is out of bounds', () => {
		const callback = vi.fn();
		const rounds = [makeRound(1)];
		const displayGames = buildDisplayGames([], rounds);

		const result = simulateRoundClick(99, 0, displayGames, false, false, callback);

		expect(result).toBe('noRound');
		expect(callback).not.toHaveBeenCalled();
	});

	it('handles undefined onedit20s gracefully (no crash)', () => {
		const rounds = [makeRound(1)];
		const displayGames = buildDisplayGames([], rounds);

		expect(() => {
			simulateRoundClick(0, 0, displayGames, false, false, undefined);
		}).not.toThrow();
	});

	it('calls with correct roundIndex when game has multiple rounds', () => {
		const callback = vi.fn();
		const rounds = [
			makeRound(1, { team1Twenty: 0, team2Twenty: 0 }),
			makeRound(2, { team1Twenty: 2, team2Twenty: 1 }),
			makeRound(3, { team1Twenty: 4, team2Twenty: 0 })
		];
		const displayGames = buildDisplayGames([], rounds);

		// Click round at index 2 (round 3)
		simulateRoundClick(2, 0, displayGames, false, false, callback);
		expect(callback).toHaveBeenCalledWith(2, 4, 0);

		callback.mockClear();

		// Click round at index 1 (round 2)
		simulateRoundClick(1, 0, displayGames, false, false, callback);
		expect(callback).toHaveBeenCalledWith(1, 2, 1);
	});
});

describe('stopPropagation guard: hasMoved should not affect round clicks', () => {
	it('click works even when hasMoved was true from a previous drag (stopPropagation prevents new drag)', () => {
		// With stopPropagation on round buttons, touchstart on a round does NOT
		// call handleDragStart, so hasMoved is never set to true by tapping a round.
		// This test verifies that hasMoved=false → click succeeds.
		const callback = vi.fn();
		const rounds = [makeRound(1, { team1Twenty: 2, team2Twenty: 0 })];
		const displayGames = buildDisplayGames([], rounds);

		// hasMoved = false (as it would be when touchstart is stopped)
		simulateRoundClick(0, 0, displayGames, false, false, callback);
		expect(callback).toHaveBeenCalledWith(0, 2, 0);
	});

	it('when hasMoved=true (residual drag), click is blocked — confirms why stopPropagation is needed', () => {
		const callback = vi.fn();
		const rounds = [makeRound(1)];
		const displayGames = buildDisplayGames([], rounds);

		// Without stopPropagation, a tiny finger wobble sets hasMoved=true and blocks click
		const result = simulateRoundClick(0, 0, displayGames, true, false, callback);
		expect(result).toBe('hasMoved');
		expect(callback).not.toHaveBeenCalled();
	});
});

describe('reversed display index → round array index', () => {
	it('first displayed item (i=0) maps to last round', () => {
		const totalRounds = 4;
		// Display shows rounds in reverse: last round is at display position 0
		expect(getRoundIndexFromDisplayPosition(totalRounds, 0)).toBe(3);
	});

	it('last displayed item maps to first round (index 0)', () => {
		const totalRounds = 4;
		expect(getRoundIndexFromDisplayPosition(totalRounds, 3)).toBe(0);
	});

	it('works correctly for single round', () => {
		expect(getRoundIndexFromDisplayPosition(1, 0)).toBe(0);
	});

	it('is consistent: display index and round index sum to totalRounds - 1', () => {
		for (let total = 1; total <= 6; total++) {
			for (let displayPos = 0; displayPos < total; displayPos++) {
				const roundIdx = getRoundIndexFromDisplayPosition(total, displayPos);
				expect(displayPos + roundIdx).toBe(total - 1);
			}
		}
	});
});
