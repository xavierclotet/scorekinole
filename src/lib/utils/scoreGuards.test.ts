import { describe, it, expect } from 'vitest';
import { canDecrementScore } from './scoreGuards';

// Regression suite for the negative-rounds bug: decrementing a team below
// its completed-rounds baseline (lastRoundPoints) desynced round detection
// and produced rounds with negative points (e.g. 3 / -1) that were synced
// verbatim to Firestore in tournament mode.

describe('canDecrementScore', () => {
	it('allows decrementing points added during the current round', () => {
		// baseline 4, score 5 → the 5th point is in-progress, removable
		expect(canDecrementScore(5, 4)).toBe(true);
		expect(canDecrementScore(6, 4)).toBe(true);
	});

	it('blocks decrementing at the baseline (completed rounds are immutable)', () => {
		// Reverting a completed round is only possible via the boundary undo
		// (both teams exactly at baseline), never by partial decrements.
		expect(canDecrementScore(4, 4)).toBe(false);
	});

	it('blocks decrementing below the baseline (corrupted/legacy state)', () => {
		expect(canDecrementScore(3, 4)).toBe(false);
	});

	it('blocks decrementing at zero', () => {
		expect(canDecrementScore(0, 0)).toBe(false);
	});
});
