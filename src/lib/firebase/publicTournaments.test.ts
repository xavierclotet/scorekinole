import { describe, it, expect, vi } from 'vitest';

// Critical mocks — must be before imports
vi.mock('./config', () => ({
	db: null,
	isFirebaseEnabled: () => false
}));

vi.mock('$app/environment', () => ({
	browser: false
}));

vi.mock('firebase/firestore', () => ({
	collection: vi.fn(),
	getDocs: vi.fn(),
	getDoc: vi.fn(),
	doc: vi.fn(),
	query: vi.fn(),
	orderBy: vi.fn(),
	where: vi.fn(),
	onSnapshot: vi.fn(),
	Timestamp: {
		fromMillis: (ms: number) => ({ toMillis: () => ms }),
		fromDate: (d: Date) => ({ toMillis: () => d.getTime() })
	}
}));

import {
	sortTournaments,
	filterTournaments,
	extractFilterOptions,
	type TournamentListItem
} from './publicTournaments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTournament(overrides: Partial<TournamentListItem> = {}): TournamentListItem {
	return {
		id: 't1',
		key: 'key1',
		name: 'Tournament 1',
		country: 'ES',
		city: 'Madrid',
		status: 'COMPLETED',
		gameType: 'singles',
		participantsCount: 8,
		createdAt: Date.now(),
		tournamentDate: Date.now() - 86400000, // yesterday
		...overrides
	};
}

const DAY = 86400000;

// Fixed "now" for deterministic tests
const NOW = new Date('2025-06-15T12:00:00Z').getTime();

// ---------------------------------------------------------------------------
// sortTournaments
// ---------------------------------------------------------------------------

describe('sortTournaments', () => {
	const pastRecent = makeTournament({ id: 'past-recent', tournamentDate: NOW - 1 * DAY });
	const pastOld = makeTournament({ id: 'past-old', tournamentDate: NOW - 30 * DAY });
	const futureClose = makeTournament({ id: 'future-close', tournamentDate: NOW + 2 * DAY });
	const futureFar = makeTournament({ id: 'future-far', tournamentDate: NOW + 30 * DAY });

	it('timeFilter=all: future first (ascending), then past (descending)', () => {
		const input = [pastOld, futureFar, pastRecent, futureClose];
		const result = sortTournaments(input, 'all', NOW);

		expect(result.map(t => t.id)).toEqual([
			'future-close', 'future-far', 'past-recent', 'past-old'
		]);
	});

	it('timeFilter=future: ascending (closest first)', () => {
		const input = [futureFar, futureClose];
		const result = sortTournaments(input, 'future', NOW);

		expect(result.map(t => t.id)).toEqual(['future-close', 'future-far']);
	});

	it('timeFilter=past: descending (most recent first)', () => {
		const input = [pastOld, pastRecent];
		const result = sortTournaments(input, 'past', NOW);

		expect(result.map(t => t.id)).toEqual(['past-recent', 'past-old']);
	});

	it('handles tournaments without tournamentDate', () => {
		const noDate = makeTournament({ id: 'no-date', tournamentDate: undefined });
		const result = sortTournaments([futureClose, noDate, pastRecent], 'all', NOW);

		// No date → tournamentDate || 0 → treated as very old past
		expect(result[0].id).toBe('future-close');
		expect(result[result.length - 1].id).toBe('no-date');
	});

	it('does not mutate the input array', () => {
		const input = [pastOld, futureClose, pastRecent];
		const original = [...input];
		sortTournaments(input, 'all', NOW);
		expect(input.map(t => t.id)).toEqual(original.map(t => t.id));
	});

	it('handles empty array', () => {
		expect(sortTournaments([], 'all', NOW)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// filterTournaments
// ---------------------------------------------------------------------------

describe('filterTournaments', () => {
	const tournaments: TournamentListItem[] = [
		makeTournament({ id: 't1', country: 'ES', gameType: 'singles', status: 'COMPLETED', tournamentDate: new Date('2025-03-10').getTime(), tier: 'SERIES_25' }),
		makeTournament({ id: 't2', country: 'FR', gameType: 'doubles', status: 'COMPLETED', tournamentDate: new Date('2025-06-10').getTime(), tier: 'SERIES_35' }),
		makeTournament({ id: 't3', country: 'ES', gameType: 'singles', status: 'CANCELLED', tournamentDate: new Date('2025-05-01').getTime() }),
		makeTournament({ id: 't4', country: 'US', gameType: 'singles', status: 'GROUP_STAGE', tournamentDate: new Date('2024-11-15').getTime(), tier: 'SERIES_15' }),
		makeTournament({ id: 't5', country: 'ES', gameType: 'doubles', status: 'DRAFT', tournamentDate: NOW + 10 * DAY }),
	];

	it('excludes cancelled tournaments by default', () => {
		const result = filterTournaments(tournaments, {}, NOW);
		expect(result.find(t => t.id === 't3')).toBeUndefined();
		expect(result).toHaveLength(4);
	});

	it('filters by year', () => {
		const result = filterTournaments(tournaments, { year: 2024 }, NOW);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('t4');
	});

	it('filters by country', () => {
		const result = filterTournaments(tournaments, { country: 'ES' }, NOW);
		// t1, t5 (t3 cancelled)
		expect(result).toHaveLength(2);
		expect(result.every(t => t.country === 'ES')).toBe(true);
	});

	it('filters by gameType', () => {
		const result = filterTournaments(tournaments, { gameType: 'doubles' }, NOW);
		// t2, t5 (t3 cancelled)
		expect(result).toHaveLength(2);
		expect(result.every(t => t.gameType === 'doubles')).toBe(true);
	});

	it('filters by tier with normalization', () => {
		const result = filterTournaments(tournaments, { tier: 'SERIES_25' }, NOW);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('t1');
	});

	it('filters by timeFilter=past', () => {
		const result = filterTournaments(tournaments, { timeFilter: 'past' }, NOW);
		// t1, t2, t4 are in the past (t3 cancelled, t5 future)
		expect(result.every(t => t.tournamentDate! <= NOW)).toBe(true);
	});

	it('filters by timeFilter=future', () => {
		const result = filterTournaments(tournaments, { timeFilter: 'future' }, NOW);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('t5');
	});

	it('combines multiple filters', () => {
		const result = filterTournaments(tournaments, {
			country: 'ES',
			gameType: 'singles',
			year: 2025
		}, NOW);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('t1');
	});

	it('gameType=all returns all types', () => {
		const result = filterTournaments(tournaments, { gameType: 'all' }, NOW);
		expect(result).toHaveLength(4); // all except cancelled
	});

	it('returns empty when no matches', () => {
		const result = filterTournaments(tournaments, { country: 'JP' }, NOW);
		expect(result).toHaveLength(0);
	});

	it('tournament without tier excluded by tier filter', () => {
		const noTier = [makeTournament({ id: 'no-tier', tier: undefined })];
		const result = filterTournaments(noTier, { tier: 'SERIES_25' }, NOW);
		expect(result).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// extractFilterOptions
// ---------------------------------------------------------------------------

describe('extractFilterOptions', () => {
	it('extracts unique years sorted descending', () => {
		const tournaments = [
			makeTournament({ tournamentDate: new Date('2024-03-10').getTime() }),
			makeTournament({ tournamentDate: new Date('2025-06-20').getTime() }),
			makeTournament({ tournamentDate: new Date('2024-11-15').getTime() }),
			makeTournament({ tournamentDate: new Date('2023-01-01').getTime() }),
		];
		const { years } = extractFilterOptions(tournaments);
		expect(years).toEqual([2025, 2024, 2023]);
	});

	it('extracts unique countries sorted alphabetically', () => {
		const tournaments = [
			makeTournament({ country: 'FR' }),
			makeTournament({ country: 'ES' }),
			makeTournament({ country: 'FR' }),
			makeTournament({ country: 'US' }),
		];
		const { countries } = extractFilterOptions(tournaments);
		expect(countries).toEqual(['ES', 'FR', 'US']);
	});

	it('handles tournaments without date or country', () => {
		const tournaments = [
			makeTournament({ tournamentDate: undefined, country: '' }),
			makeTournament({ tournamentDate: new Date('2025-01-01').getTime(), country: 'ES' }),
		];
		const { years, countries } = extractFilterOptions(tournaments);
		expect(years).toEqual([2025]);
		expect(countries).toEqual(['ES']);
	});

	it('returns empty arrays for empty input', () => {
		const { years, countries } = extractFilterOptions([]);
		expect(years).toEqual([]);
		expect(countries).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Large dataset — scalability
// ---------------------------------------------------------------------------

describe('large dataset scalability', () => {
	// Generate 5000 tournaments spanning 3 years, 10 countries
	const COUNTRIES = ['ES', 'FR', 'US', 'CA', 'UK', 'DE', 'JP', 'AU', 'BR', 'MX'];
	const GAME_TYPES: ('singles' | 'doubles')[] = ['singles', 'doubles'];
	const STATUSES: TournamentListItem['status'][] = ['COMPLETED', 'GROUP_STAGE', 'DRAFT', 'CANCELLED'];
	const TIERS: (TournamentListItem['tier'] | undefined)[] = ['SERIES_15', 'SERIES_25', 'SERIES_35', undefined];

	const largeTournaments: TournamentListItem[] = [];
	for (let i = 0; i < 5000; i++) {
		const yearOffset = i % 3; // 2023, 2024, 2025
		const monthDay = (i % 365) + 1;
		const date = new Date(2023 + yearOffset, 0, monthDay).getTime();
		largeTournaments.push(makeTournament({
			id: `t-${i}`,
			key: `key-${i}`,
			name: `Tournament ${i}`,
			country: COUNTRIES[i % COUNTRIES.length],
			gameType: GAME_TYPES[i % 2],
			status: STATUSES[i % STATUSES.length],
			tier: TIERS[i % TIERS.length],
			tournamentDate: date,
			participantsCount: 4 + (i % 30),
		}));
	}

	it('filterTournaments handles 5000 tournaments quickly', () => {
		const start = performance.now();
		const result = filterTournaments(largeTournaments, {
			year: 2025,
			country: 'ES',
			gameType: 'singles',
		}, NOW);
		const elapsed = performance.now() - start;

		expect(result.length).toBeGreaterThan(0);
		expect(result.every(t => t.country === 'ES')).toBe(true);
		expect(result.every(t => t.gameType === 'singles')).toBe(true);
		expect(result.every(t => t.status !== 'CANCELLED')).toBe(true);
		// Should complete well under 50ms even on slow machines
		expect(elapsed).toBeLessThan(50);
	});

	it('sortTournaments handles 5000 tournaments quickly', () => {
		const start = performance.now();
		const result = sortTournaments(largeTournaments, 'all', NOW);
		const elapsed = performance.now() - start;

		expect(result).toHaveLength(5000);
		// Should complete well under 50ms
		expect(elapsed).toBeLessThan(50);
	});

	it('extractFilterOptions handles 5000 tournaments quickly', () => {
		const start = performance.now();
		const { years, countries } = extractFilterOptions(largeTournaments);
		const elapsed = performance.now() - start;

		expect(years).toEqual([2025, 2024, 2023]);
		expect(countries).toEqual([...COUNTRIES].sort());
		expect(elapsed).toBeLessThan(50);
	});

	it('filter + sort pipeline handles 5000 tournaments', () => {
		const start = performance.now();
		const filtered = filterTournaments(largeTournaments, { year: 2025 }, NOW);
		const sorted = sortTournaments(filtered, 'all', NOW);
		const elapsed = performance.now() - start;

		// Verify sorted order: future first ascending, then past descending
		let seenPast = false;
		for (let i = 1; i < sorted.length; i++) {
			const prevDate = sorted[i - 1].tournamentDate || 0;
			const currDate = sorted[i].tournamentDate || 0;
			const prevFuture = prevDate > NOW;
			const currFuture = currDate > NOW;

			if (prevFuture && !currFuture) {
				seenPast = true;
				continue; // transition point
			}
			if (prevFuture && currFuture) {
				expect(prevDate).toBeLessThanOrEqual(currDate);
			}
			if (!prevFuture && !currFuture) {
				expect(prevDate).toBeGreaterThanOrEqual(currDate);
			}
		}

		expect(elapsed).toBeLessThan(100);
	});

	it('sort stability: tournaments with same date maintain relative order', () => {
		const sameDate = NOW - DAY;
		const items = Array.from({ length: 100 }, (_, i) =>
			makeTournament({ id: `same-${i}`, tournamentDate: sameDate })
		);
		const result = sortTournaments(items, 'past', NOW);
		// All have same date, so order should be stable (V8's sort is stable)
		for (let i = 0; i < result.length; i++) {
			expect(result[i].id).toBe(`same-${i}`);
		}
	});
});
