import { describe, it, expect } from 'vitest';
import { getCounterWinner, shouldAutoAssignCounterUser } from './counterMode';

/**
 * Counter scoring mode: two independent per-team scores, first to reach the
 * target wins immediately (no minimum lead, unlike points mode's 2-point rule).
 * See docs/en/COUNTER_SCORING_MODE.md.
 */
describe('getCounterWinner', () => {
	it('returns null while neither team has reached the target', () => {
		expect(getCounterWinner(0, 0, 100)).toBeNull();
		expect(getCounterWinner(95, 90, 100)).toBeNull();
	});

	it('team 1 wins the instant it reaches the target, regardless of the gap', () => {
		// 100 vs 99 would NOT win in points mode (needs 2-point lead); here it wins.
		expect(getCounterWinner(100, 99, 100)).toBe(1);
	});

	it('team 2 wins the instant it reaches the target', () => {
		expect(getCounterWinner(45, 100, 100)).toBe(2);
	});

	it('wins on exceeding the target (increment overshoots the exact value)', () => {
		// target 100, increment 50: 50 -> 100, or an off-target 105 still wins.
		expect(getCounterWinner(105, 30, 100)).toBe(1);
	});

	it('defensive: if both are at/over target, the higher score wins', () => {
		expect(getCounterWinner(105, 100, 100)).toBe(1);
		expect(getCounterWinner(100, 105, 100)).toBe(2);
	});
});

/**
 * Counter mode auto-attribution: a logged-in user playing a counter match won't
 * tap the "+" assign button (it's a quick scoreboard), so the match would never
 * be credited to anyone and never persist. When nobody is assigned we auto-assign
 * the logged-in user to Team 1 so the match saves to /matches and shows in stats.
 */
describe('shouldAutoAssignCounterUser', () => {
	it('assigns when counter + logged in + auth ready + nobody assigned', () => {
		expect(shouldAutoAssignCounterUser(true, true, true, false, false)).toBe(true);
	});

	it('does not assign outside counter mode', () => {
		expect(shouldAutoAssignCounterUser(false, true, true, false, false)).toBe(false);
	});

	it('does not assign before auth is initialized', () => {
		expect(shouldAutoAssignCounterUser(true, false, true, false, false)).toBe(false);
	});

	it('does not assign when there is no logged-in user', () => {
		expect(shouldAutoAssignCounterUser(true, true, false, false, false)).toBe(false);
	});

	it('does not re-assign when team 1 already has a user', () => {
		expect(shouldAutoAssignCounterUser(true, true, true, true, false)).toBe(false);
	});

	it('does not assign when team 2 already has a user', () => {
		expect(shouldAutoAssignCounterUser(true, true, true, false, true)).toBe(false);
	});
});
