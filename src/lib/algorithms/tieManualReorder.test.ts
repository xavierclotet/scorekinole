import { describe, it, expect } from 'vitest';
import { canMoveUp, canMoveDown, moveUp, moveDown, confirmOrder, hasUnresolvedTies } from './tieManualReorder';
import type { GroupStanding } from '$lib/types/tournament';

/** Helper to create a standing with default values */
function createStanding(
	participantId: string,
	overrides: Partial<GroupStanding> = {}
): GroupStanding {
	return {
		participantId,
		position: 0,
		matchesPlayed: 0,
		matchesWon: 0,
		matchesLost: 0,
		matchesTied: 0,
		points: 0,
		swissPoints: 0,
		total20s: 0,
		totalPointsScored: 0,
		qualifiedForFinal: false,
		...overrides
	};
}

/** Create a pair of tied standings (2-player unresolved tie) */
function createTiedPair(): GroupStanding[] {
	return [
		createStanding('p1', { position: 1, tiedWith: ['p2'], tieReason: 'unresolved' }),
		createStanding('p2', { position: 2, tiedWith: ['p1'], tieReason: 'unresolved' }),
		createStanding('p3', { position: 3 })
	];
}

/** Create a 3-player unresolved tie */
function createTiedTriple(): GroupStanding[] {
	return [
		createStanding('p1', { position: 1, tiedWith: ['p2', 'p3'], tieReason: 'unresolved' }),
		createStanding('p2', { position: 2, tiedWith: ['p1', 'p3'], tieReason: 'unresolved' }),
		createStanding('p3', { position: 3, tiedWith: ['p1', 'p2'], tieReason: 'unresolved' }),
		createStanding('p4', { position: 4 })
	];
}

// ============================================================================
// canMoveUp / canMoveDown
// ============================================================================

describe('canMoveUp', () => {
	it('returns true when participant is tied with the one above', () => {
		const standings = createTiedPair();
		expect(canMoveUp(standings, 'p2')).toBe(true);
	});

	it('returns false for the first participant (nothing above)', () => {
		const standings = createTiedPair();
		expect(canMoveUp(standings, 'p1')).toBe(false);
	});

	it('returns false when not tied with the one above', () => {
		const standings = createTiedPair();
		// p3 is not tied with p2
		expect(canMoveUp(standings, 'p3')).toBe(false);
	});

	it('returns false for non-existent participant', () => {
		const standings = createTiedPair();
		expect(canMoveUp(standings, 'p99')).toBe(false);
	});

	it('returns true in a 3-player tie for middle participant', () => {
		const standings = createTiedTriple();
		expect(canMoveUp(standings, 'p2')).toBe(true);
		expect(canMoveUp(standings, 'p3')).toBe(true);
	});
});

describe('canMoveDown', () => {
	it('returns true when participant is tied with the one below', () => {
		const standings = createTiedPair();
		expect(canMoveDown(standings, 'p1')).toBe(true);
	});

	it('returns false for the last participant (nothing below)', () => {
		const standings = createTiedPair();
		expect(canMoveDown(standings, 'p3')).toBe(false);
	});

	it('returns false when not tied with the one below', () => {
		const standings = createTiedPair();
		// p2 is not tied with p3
		expect(canMoveDown(standings, 'p2')).toBe(false);
	});

	it('returns true in a 3-player tie for top and middle participants', () => {
		const standings = createTiedTriple();
		expect(canMoveDown(standings, 'p1')).toBe(true);
		expect(canMoveDown(standings, 'p2')).toBe(true);
	});

	it('returns false for last tied participant (p3 not tied with p4)', () => {
		const standings = createTiedTriple();
		expect(canMoveDown(standings, 'p3')).toBe(false);
	});
});

// ============================================================================
// moveDown
// ============================================================================

describe('moveDown', () => {
	it('swaps positions between two tied participants', () => {
		const standings = createTiedPair();
		const result = moveDown(standings, 'p1')!;

		expect(result).not.toBeNull();
		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		// Positions swapped
		expect(p1.position).toBe(2);
		expect(p2.position).toBe(1);
	});

	it('clears tie between the swapped pair', () => {
		const standings = createTiedPair();
		const result = moveDown(standings, 'p1')!;

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		// Tie should be cleared
		expect(p1.tiedWith).toBeUndefined();
		expect(p1.tieReason).toBeUndefined();
		expect(p2.tiedWith).toBeUndefined();
		expect(p2.tieReason).toBeUndefined();
	});

	it('swaps array order so sorted-by-position output is correct', () => {
		const standings = createTiedPair();
		const result = moveDown(standings, 'p1')!;

		// After moveDown('p1'), p2 should come first in the array
		expect(result[0].participantId).toBe('p2');
		expect(result[1].participantId).toBe('p1');
	});

	it('returns null if participant is not tied with the one below', () => {
		const standings = createTiedPair();
		// p2 is position 2, p3 is position 3, but they are NOT tied
		expect(moveDown(standings, 'p2')).toBeNull();
	});

	it('returns null for last participant', () => {
		const standings = createTiedPair();
		expect(moveDown(standings, 'p3')).toBeNull();
	});

	it('returns null for non-existent participant', () => {
		const standings = createTiedPair();
		expect(moveDown(standings, 'p99')).toBeNull();
	});

	it('preserves remaining ties in a 3-player tie', () => {
		const standings = createTiedTriple();

		// Move p1 down (swap with p2)
		const result = moveDown(standings, 'p1')!;
		expect(result).not.toBeNull();

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;
		const p3 = result.find(s => s.participantId === 'p3')!;

		// p1↔p2 tie cleared, but p1 still tied with p3, p2 still tied with p3
		expect(p1.tiedWith).toEqual(['p3']);
		expect(p2.tiedWith).toEqual(['p3']);
		expect(p3.tiedWith).toEqual(['p1', 'p2']); // unchanged (both still there)
	});

	it('does not mutate the original standings', () => {
		const standings = createTiedPair();
		const originalP1TiedWith = [...standings[0].tiedWith!];

		moveDown(standings, 'p1');

		// Original should not be modified
		expect(standings[0].tiedWith).toEqual(originalP1TiedWith);
		expect(standings[0].position).toBe(1);
	});
});

// ============================================================================
// moveUp
// ============================================================================

describe('moveUp', () => {
	it('swaps positions between two tied participants', () => {
		const standings = createTiedPair();
		const result = moveUp(standings, 'p2')!;

		expect(result).not.toBeNull();
		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		expect(p1.position).toBe(2);
		expect(p2.position).toBe(1);
	});

	it('clears tie between the swapped pair', () => {
		const standings = createTiedPair();
		const result = moveUp(standings, 'p2')!;

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		expect(p1.tiedWith).toBeUndefined();
		expect(p2.tiedWith).toBeUndefined();
	});

	it('swaps array order correctly', () => {
		const standings = createTiedPair();
		const result = moveUp(standings, 'p2')!;

		// After moveUp('p2'), p2 should come first in the array
		expect(result[0].participantId).toBe('p2');
		expect(result[1].participantId).toBe('p1');
	});

	it('returns null if participant is first', () => {
		const standings = createTiedPair();
		expect(moveUp(standings, 'p1')).toBeNull();
	});

	it('returns null if not tied with the one above', () => {
		const standings = createTiedPair();
		expect(moveUp(standings, 'p3')).toBeNull();
	});

	it('preserves remaining ties in a 3-player tie', () => {
		const standings = createTiedTriple();
		// Move p3 up (swap with p2)
		const result = moveUp(standings, 'p3')!;

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;
		const p3 = result.find(s => s.participantId === 'p3')!;

		// p2↔p3 tie cleared, but p1 still tied with both
		expect(p2.tiedWith).toEqual(['p1']);
		expect(p3.tiedWith).toEqual(['p1']);
		expect(p1.tiedWith).toEqual(['p2', 'p3']);
	});

	it('moveUp(p2) is equivalent to moveDown(p1) for a tied pair', () => {
		const standings = createTiedPair();
		const resultUp = moveUp(standings, 'p2')!;
		const resultDown = moveDown(standings, 'p1')!;

		// Both should produce same final positions
		expect(resultUp.find(s => s.participantId === 'p1')!.position)
			.toBe(resultDown.find(s => s.participantId === 'p1')!.position);
		expect(resultUp.find(s => s.participantId === 'p2')!.position)
			.toBe(resultDown.find(s => s.participantId === 'p2')!.position);
	});
});

// ============================================================================
// confirmOrder
// ============================================================================

describe('confirmOrder', () => {
	it('clears all ties for a 2-player tie', () => {
		const standings = createTiedPair();
		const result = confirmOrder(standings, 'p1');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		expect(p1.tiedWith).toBeUndefined();
		expect(p1.tieReason).toBeUndefined();
		expect(p2.tiedWith).toBeUndefined();
		expect(p2.tieReason).toBeUndefined();
	});

	it('does not change positions', () => {
		const standings = createTiedPair();
		const result = confirmOrder(standings, 'p1');

		expect(result.find(s => s.participantId === 'p1')!.position).toBe(1);
		expect(result.find(s => s.participantId === 'p2')!.position).toBe(2);
	});

	it('in a 3-player tie, removes confirmed player from others ties', () => {
		const standings = createTiedTriple();
		const result = confirmOrder(standings, 'p1');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;
		const p3 = result.find(s => s.participantId === 'p3')!;

		// p1 fully resolved
		expect(p1.tiedWith).toBeUndefined();
		expect(p1.tieReason).toBeUndefined();

		// p2 and p3 still tied with each other
		expect(p2.tiedWith).toEqual(['p3']);
		expect(p2.tieReason).toBe('unresolved');
		expect(p3.tiedWith).toEqual(['p2']);
		expect(p3.tieReason).toBe('unresolved');
	});

	it('confirming middle player of 3-way tie preserves outer ties', () => {
		const standings = createTiedTriple();
		const result = confirmOrder(standings, 'p2');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;
		const p3 = result.find(s => s.participantId === 'p3')!;

		expect(p2.tiedWith).toBeUndefined();
		expect(p1.tiedWith).toEqual(['p3']);
		expect(p3.tiedWith).toEqual(['p1']);
	});

	it('confirming all 3 in sequence fully resolves a 3-player tie', () => {
		const standings = createTiedTriple();
		let result = confirmOrder(standings, 'p1');
		result = confirmOrder(result, 'p2');

		// After confirming p1 and p2, p3 should also be resolved (only tie was with p2)
		expect(result.every(s => !s.tiedWith || s.tiedWith.length === 0)).toBe(true);
	});

	it('no-op for participant without ties', () => {
		const standings = createTiedPair();
		const result = confirmOrder(standings, 'p3');

		// p3 has no ties, standings unchanged
		expect(result.find(s => s.participantId === 'p1')!.tiedWith).toEqual(['p2']);
		expect(result.find(s => s.participantId === 'p2')!.tiedWith).toEqual(['p1']);
	});

	it('does not mutate the original standings', () => {
		const standings = createTiedPair();
		confirmOrder(standings, 'p1');

		expect(standings[0].tiedWith).toEqual(['p2']);
		expect(standings[1].tiedWith).toEqual(['p1']);
	});
});

// ============================================================================
// hasUnresolvedTies
// ============================================================================

describe('hasUnresolvedTies', () => {
	it('returns true when there are unresolved ties', () => {
		const standings = createTiedPair();
		expect(hasUnresolvedTies(standings)).toBe(true);
	});

	it('returns false when all ties are resolved', () => {
		const standings = createTiedPair();
		const result = confirmOrder(standings, 'p1');
		expect(hasUnresolvedTies(result)).toBe(false);
	});

	it('returns false for standings without ties', () => {
		const standings = [
			createStanding('p1', { position: 1 }),
			createStanding('p2', { position: 2 })
		];
		expect(hasUnresolvedTies(standings)).toBe(false);
	});

	it('returns true when partially resolved (1 of 3 confirmed)', () => {
		const standings = createTiedTriple();
		const result = confirmOrder(standings, 'p1');
		// p2 and p3 still tied
		expect(hasUnresolvedTies(result)).toBe(true);
	});

	it('returns false after full resolution of 3-player tie', () => {
		const standings = createTiedTriple();
		let result = confirmOrder(standings, 'p1');
		result = confirmOrder(result, 'p2');
		expect(hasUnresolvedTies(result)).toBe(false);
	});
});

// ============================================================================
// Full shoot-out workflow
// ============================================================================

describe('shoot-out workflow', () => {
	it('admin resolves 2-player tie by moving p2 up', () => {
		const standings = createTiedPair();

		// Admin sees tie, performs shoot-out, p2 wins → move p2 up
		expect(hasUnresolvedTies(standings)).toBe(true);
		expect(canMoveUp(standings, 'p2')).toBe(true);

		const result = moveUp(standings, 'p2')!;

		// p2 is now position 1, p1 is position 2, tie resolved
		expect(result.find(s => s.participantId === 'p2')!.position).toBe(1);
		expect(result.find(s => s.participantId === 'p1')!.position).toBe(2);
		expect(hasUnresolvedTies(result)).toBe(false);
	});

	it('admin resolves 2-player tie by confirming current order', () => {
		const standings = createTiedPair();

		// Admin decides current order is fine (e.g., shoot-out winner already on top)
		const result = confirmOrder(standings, 'p1');

		expect(result.find(s => s.participantId === 'p1')!.position).toBe(1);
		expect(result.find(s => s.participantId === 'p2')!.position).toBe(2);
		expect(hasUnresolvedTies(result)).toBe(false);
	});

	it('admin resolves 3-player tie step by step', () => {
		const standings = createTiedTriple();
		expect(hasUnresolvedTies(standings)).toBe(true);

		// Step 1: Shoot-out between p1, p2, p3. Result: p3 wins → move p3 to top
		// Move p3 up past p2
		let result = moveUp(standings, 'p3')!;
		// Now order: p1(1), p3(2), p2(3). p3↔p2 tie cleared. p1 still tied with p2,p3.
		expect(result.find(s => s.participantId === 'p3')!.position).toBe(2);

		// Step 2: Move p3 up past p1
		result = moveUp(result, 'p3')!;
		// Now order: p3(1), p1(2), p2(3). p3↔p1 tie cleared.
		expect(result.find(s => s.participantId === 'p3')!.position).toBe(1);

		// Step 3: p1 and p2 may still be tied. Confirm p1's position.
		if (hasUnresolvedTies(result)) {
			result = confirmOrder(result, 'p1');
		}

		expect(hasUnresolvedTies(result)).toBe(false);
		// Final order: p3(1), p1(2), p2(3)
		expect(result.find(s => s.participantId === 'p3')!.position).toBe(1);
		expect(result.find(s => s.participantId === 'p1')!.position).toBe(2);
		expect(result.find(s => s.participantId === 'p2')!.position).toBe(3);
	});

	it('admin resolves 3-player tie by confirming first, then swapping remaining', () => {
		const standings = createTiedTriple();

		// Confirm p1 as first (they won shoot-out for top spot)
		let result = confirmOrder(standings, 'p1');
		// p1 resolved, p2 and p3 still tied
		expect(hasUnresolvedTies(result)).toBe(true);

		// Shoot-out for 2nd/3rd: p3 wins → move p3 up
		result = moveUp(result, 'p3')!;
		expect(hasUnresolvedTies(result)).toBe(false);

		expect(result.find(s => s.participantId === 'p1')!.position).toBe(1);
		expect(result.find(s => s.participantId === 'p3')!.position).toBe(2);
		expect(result.find(s => s.participantId === 'p2')!.position).toBe(3);
	});

	it('resolving ties at qualification boundary (top 2 qualify, tie at 2-3)', () => {
		// p1 clearly first, p2 and p3 tied for qualification spot
		const standings = [
			createStanding('p1', { position: 1 }),
			createStanding('p2', { position: 2, tiedWith: ['p3'], tieReason: 'unresolved' }),
			createStanding('p3', { position: 3, tiedWith: ['p2'], tieReason: 'unresolved' }),
			createStanding('p4', { position: 4 })
		];

		expect(hasUnresolvedTies(standings)).toBe(true);

		// p3 wins shoot-out → move up
		const result = moveUp(standings, 'p3')!;

		expect(result.find(s => s.participantId === 'p3')!.position).toBe(2); // qualifies
		expect(result.find(s => s.participantId === 'p2')!.position).toBe(3); // eliminated
		expect(hasUnresolvedTies(result)).toBe(false);
	});

	it('4-player tie: stepwise resolution via multiple moves', () => {
		const standings = [
			createStanding('p1', { position: 1, tiedWith: ['p2', 'p3', 'p4'], tieReason: 'unresolved' }),
			createStanding('p2', { position: 2, tiedWith: ['p1', 'p3', 'p4'], tieReason: 'unresolved' }),
			createStanding('p3', { position: 3, tiedWith: ['p1', 'p2', 'p4'], tieReason: 'unresolved' }),
			createStanding('p4', { position: 4, tiedWith: ['p1', 'p2', 'p3'], tieReason: 'unresolved' }),
			createStanding('p5', { position: 5 })
		];

		// Shoot-out result: p4 wins → needs to move to top
		// Move p4 up past p3
		let result = moveUp(standings, 'p4')!;
		// Move p4 up past p2
		result = moveUp(result, 'p4')!;
		// Move p4 up past p1
		result = moveUp(result, 'p4')!;

		expect(result.find(s => s.participantId === 'p4')!.position).toBe(1);

		// Now resolve remaining 3-way tie (p1, p2, p3)
		// Confirm order p1(2), p2(3), p3(4)
		result = confirmOrder(result, 'p1');
		if (hasUnresolvedTies(result)) {
			result = confirmOrder(result, 'p2');
		}

		expect(hasUnresolvedTies(result)).toBe(false);
	});
});
