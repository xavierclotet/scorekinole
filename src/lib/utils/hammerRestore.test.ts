import { describe, it, expect } from 'vitest';
import { deriveHammerState, type HammerRound } from './hammerRestore';

// Regression suite for the lost-hammer-on-resume bug: hasHammer and
// currentGameStartHammer only live in localStorage, so resuming a tournament
// match on another device (or reloading after a game auto-advanced) lost the
// hammer indicator. Both values are derivable from the recorded rounds:
// hammer rotates after every round, starting hammer alternates between games.

function round(gameNumber: number, hammerTeam: 1 | 2 | null): HammerRound {
	return { gameNumber, hammerTeam };
}

describe('deriveHammerState', () => {
	describe('current game with rounds', () => {
		it('derives start hammer from round 1 and rotates per completed round (odd count)', () => {
			// Team 1 held hammer in round 1 → started with it. After 1 round it rotated.
			const result = deriveHammerState([round(1, 1)], 1);
			expect(result.gameStartHammer).toBe(1);
			expect(result.currentHolder).toBe(2);
		});

		it('returns to the starting team after an even number of rounds', () => {
			const result = deriveHammerState([round(1, 1), round(1, 2)], 1);
			expect(result.gameStartHammer).toBe(1);
			expect(result.currentHolder).toBe(1);
		});

		it('derives across a full 4-round game', () => {
			const rounds = [round(1, 2), round(1, 1), round(1, 2), round(1, 1)];
			const result = deriveHammerState(rounds, 1);
			expect(result.gameStartHammer).toBe(2);
			expect(result.currentHolder).toBe(2); // 4 rotations → back to start
		});

		it('back-rotates from a later round when earlier rounds lack hammer data', () => {
			// Round 1 unknown, round 2 held by team 1 → start was team 2
			// (1 rotation between round 1 and round 2).
			const rounds = [round(1, null), round(1, 1), round(1, null)];
			const result = deriveHammerState(rounds, 1);
			expect(result.gameStartHammer).toBe(2);
			expect(result.currentHolder).toBe(1); // 3 rounds played → start flipped
		});

		it('returns nulls when no round of the current game has hammer data', () => {
			const result = deriveHammerState([round(1, null), round(1, null)], 1);
			expect(result.gameStartHammer).toBeNull();
			expect(result.currentHolder).toBeNull();
		});
	});

	describe('current game not started (between games)', () => {
		it('alternates the starting hammer from the previous game', () => {
			// Game 1 started with team 1 → game 2 starts with team 2.
			// Covers the reload-after-game-end case where resetForNextGame
			// never ran and the alternation used to be silently skipped.
			const game1 = [round(1, 1), round(1, 2), round(1, 1), round(1, 2)];
			const result = deriveHammerState(game1, 2);
			expect(result.gameStartHammer).toBe(2);
			expect(result.currentHolder).toBe(2);
		});

		it('double-alternation lands on the same team two games later', () => {
			// Game 2 has no hammer data; derive game 3 from game 1 (two flips).
			const rounds = [round(1, 1), round(2, null), round(2, null)];
			const result = deriveHammerState(rounds, 3);
			expect(result.gameStartHammer).toBe(1);
			expect(result.currentHolder).toBe(1);
		});

		it('uses the most recent previous game with hammer data', () => {
			const rounds = [
				round(1, 1), // game 1 started with team 1
				round(2, 2) // game 2 started with team 2 (consistent alternation)
			];
			const result = deriveHammerState(rounds, 3);
			expect(result.gameStartHammer).toBe(1); // flip game 2's start
			expect(result.currentHolder).toBe(1);
		});

		it('returns nulls when no previous game has hammer data', () => {
			const result = deriveHammerState([round(1, null)], 2);
			expect(result.gameStartHammer).toBeNull();
			expect(result.currentHolder).toBeNull();
		});
	});

	it('returns nulls for an empty history (fresh match → hammer dialog decides)', () => {
		const result = deriveHammerState([], 1);
		expect(result.gameStartHammer).toBeNull();
		expect(result.currentHolder).toBeNull();
	});

	it('ignores rounds of FUTURE games (defensive against inconsistent data)', () => {
		const rounds = [round(1, 1), round(2, 2)];
		const result = deriveHammerState(rounds, 1);
		// Only game 1 data should matter
		expect(result.gameStartHammer).toBe(1);
		expect(result.currentHolder).toBe(2);
	});
});
