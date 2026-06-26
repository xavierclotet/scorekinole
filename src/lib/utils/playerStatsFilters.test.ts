import { describe, it, expect } from 'vitest';
import type { MatchHistory } from '$lib/types/history';
import { getMatchYears, pickDefaultYearFilter } from './playerStatsFilters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeMatch = (overrides: Partial<MatchHistory> & Record<string, unknown> = {}): MatchHistory => ({
	id: 'match1',
	team1Name: 'A',
	team2Name: 'B',
	team1Color: '#000',
	team2Color: '#fff',
	team1Score: 0,
	team2Score: 0,
	winner: null,
	gameMode: 'points' as const,
	gameType: 'singles' as const,
	matchesToWin: 1,
	games: [],
	startTime: new Date('2025-06-15').getTime(),
	endTime: 0,
	duration: 0,
	...overrides,
});

const atYear = (year: number) => makeMatch({ startTime: new Date(`${year}-06-15`).getTime() });

// ---------------------------------------------------------------------------
// getMatchYears
// ---------------------------------------------------------------------------

describe('getMatchYears', () => {
	it('returns distinct years sorted newest-first', () => {
		const matches = [atYear(2024), atYear(2025), atYear(2024), atYear(2023)];
		expect(getMatchYears(matches)).toEqual([2025, 2024, 2023]);
	});

	it('returns empty array for no matches', () => {
		expect(getMatchYears([])).toEqual([]);
	});

	it('drops matches with undefined startTime (no NaN in the dropdown)', () => {
		// Imported tournaments with no timestamps surface startTime = undefined.
		const matches = [atYear(2025), makeMatch({ startTime: undefined as unknown as number })];
		const years = getMatchYears(matches);
		expect(years).toEqual([2025]);
		expect(years.some((y) => Number.isNaN(y))).toBe(false);
	});

	it('drops matches with NaN startTime', () => {
		const matches = [atYear(2024), makeMatch({ startTime: NaN })];
		expect(getMatchYears(matches)).toEqual([2024]);
	});

	it('returns empty array when every match has an invalid startTime', () => {
		const matches = [
			makeMatch({ startTime: undefined as unknown as number }),
			makeMatch({ startTime: NaN }),
		];
		expect(getMatchYears(matches)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// pickDefaultYearFilter
// ---------------------------------------------------------------------------

describe('pickDefaultYearFilter', () => {
	it('defaults to the current year when it has matches', () => {
		const matches = [atYear(2024), atYear(2026), atYear(2025)];
		expect(pickDefaultYearFilter(matches, 2026, false)).toBe('2026');
	});

	it('BUG A: falls back to the most recent year with data when the current year is empty', () => {
		// Player last played in 2025; viewing in 2026 must NOT open to a blank profile.
		const matches = [atYear(2023), atYear(2025), atYear(2024)];
		expect(pickDefaultYearFilter(matches, 2026, false)).toBe('2025');
	});

	it('returns all-years ("") when there are no matches', () => {
		expect(pickDefaultYearFilter([], 2026, false)).toBe('');
	});

	it('returns all-years ("") for a tournament-specific view regardless of dates', () => {
		const matches = [atYear(2024)];
		expect(pickDefaultYearFilter(matches, 2026, true)).toBe('');
	});

	it('returns all-years ("") when every match has an invalid startTime', () => {
		const matches = [
			makeMatch({ startTime: undefined as unknown as number }),
			makeMatch({ startTime: NaN }),
		];
		expect(pickDefaultYearFilter(matches, 2026, false)).toBe('');
	});

	it('ignores invalid-dated matches when choosing the fallback year', () => {
		const matches = [atYear(2024), makeMatch({ startTime: NaN })];
		// Current year 2026 has no data → fall back to 2024, not NaN.
		expect(pickDefaultYearFilter(matches, 2026, false)).toBe('2024');
	});
});
