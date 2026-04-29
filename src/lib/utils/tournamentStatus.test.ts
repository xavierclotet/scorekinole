import { describe, it, expect } from 'vitest';
import { shouldClearSavedTournamentKey, isTournamentKeyStillValid } from './tournamentStatus';
import type { TournamentStatus } from '$lib/types/tournament';

describe('shouldClearSavedTournamentKey', () => {
	it('keeps key during GROUP_STAGE', () => {
		expect(shouldClearSavedTournamentKey('GROUP_STAGE')).toBe(false);
	});

	it('keeps key during TRANSITION (between groups and bracket)', () => {
		// Regression: previously the /game join flow used an allow-list that
		// omitted TRANSITION, wiping the key whenever the admin moved the
		// tournament past the group stage. Players had to re-enter the key
		// just to reach the "no pending matches" screen until the bracket
		// was generated.
		expect(shouldClearSavedTournamentKey('TRANSITION')).toBe(false);
	});

	it('keeps key during FINAL_STAGE', () => {
		expect(shouldClearSavedTournamentKey('FINAL_STAGE')).toBe(false);
	});

	it('clears key when tournament is COMPLETED', () => {
		expect(shouldClearSavedTournamentKey('COMPLETED')).toBe(true);
	});

	it('clears key when tournament is CANCELLED', () => {
		expect(shouldClearSavedTournamentKey('CANCELLED')).toBe(true);
	});

	it('clears key when tournament is still DRAFT', () => {
		expect(shouldClearSavedTournamentKey('DRAFT')).toBe(true);
	});

	it('isTournamentKeyStillValid is the inverse', () => {
		const allStatuses: TournamentStatus[] = [
			'DRAFT',
			'GROUP_STAGE',
			'TRANSITION',
			'FINAL_STAGE',
			'COMPLETED',
			'CANCELLED'
		];
		for (const s of allStatuses) {
			expect(isTournamentKeyStillValid(s)).toBe(!shouldClearSavedTournamentKey(s));
		}
	});

	it('every active in-flight status keeps the key', () => {
		const inFlight: TournamentStatus[] = ['GROUP_STAGE', 'TRANSITION', 'FINAL_STAGE'];
		for (const s of inFlight) {
			expect(isTournamentKeyStillValid(s), `${s} should keep the key`).toBe(true);
		}
	});
});
