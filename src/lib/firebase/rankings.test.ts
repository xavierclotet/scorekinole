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
	doc: vi.fn(),
	getDoc: vi.fn(),
	query: vi.fn(),
	where: vi.fn(),
	Timestamp: {
		now: () => ({ toMillis: () => Date.now() }),
		fromMillis: (ms: number) => ({ toMillis: () => ms })
	}
}));

vi.mock('$lib/types/tournament', () => ({
	normalizeTier: (tier: any) => tier || 'SERIES_15'
}));

vi.mock('$lib/algorithms/ranking', () => ({
	calculateRankingPoints: (position: number, _tier: string, total: number, _gameType: string) => {
		// Simple mock: 1st gets 100, 2nd gets 80, etc., minimum 0
		const base = Math.max(0, 100 - (position - 1) * 20);
		return base;
	}
}));

import {
	calculateUserRanking,
	recalculateUserRanking,
	calculateRankings,
	getAvailableCountries,
	getAvailableYears
} from './rankings';
import type { UserWithId, TournamentInfo, RankingFilters } from './rankings';
import type { TournamentRecord } from '$lib/types/tournament';

// --- Helpers ---

const makeRecord = (overrides: Partial<TournamentRecord> & Record<string, any> = {}): TournamentRecord => ({
	tournamentId: 't1',
	tournamentName: 'Tournament 1',
	tournamentDate: new Date('2025-06-15').getTime(),
	finalPosition: 1,
	totalParticipants: 10,
	rankingBefore: 0,
	rankingAfter: 100,
	rankingDelta: 100,
	...overrides
});

const makeUser = (overrides: Partial<UserWithId> & Record<string, any> = {}): UserWithId => ({
	odId: 'user1',
	playerName: 'Alice',
	email: null,
	photoURL: null,
	tournaments: [],
	...overrides
});

const makeTournamentInfo = (overrides: Partial<TournamentInfo> = {}): TournamentInfo => ({
	id: 't1',
	tier: 'SERIES_15',
	gameType: 'singles',
	country: 'ES',
	completedAt: new Date('2025-06-15').getTime(),
	...overrides
});

// ─────────────────────────────────────────────────
// calculateUserRanking
// ─────────────────────────────────────────────────
describe('calculateUserRanking', () => {
	it('returns 0 for undefined tournaments', () => {
		expect(calculateUserRanking(undefined)).toBe(0);
	});

	it('returns 0 for empty tournaments array', () => {
		expect(calculateUserRanking([])).toBe(0);
	});

	it('returns 0 when no tournaments match the requested year', () => {
		const records = [makeRecord({ tournamentDate: new Date('2023-01-01').getTime() })];
		expect(calculateUserRanking(records, 2025)).toBe(0);
	});

	it('sums top 2 results by default (bestOfN = 2)', () => {
		const records = [
			makeRecord({ rankingDelta: 50, tournamentDate: new Date('2025-03-01').getTime() }),
			makeRecord({ rankingDelta: 80, tournamentDate: new Date('2025-04-01').getTime() }),
			makeRecord({ rankingDelta: 30, tournamentDate: new Date('2025-05-01').getTime() })
		];
		// Sorted desc: 80, 50, 30 → top 2 = 80 + 50 = 130
		expect(calculateUserRanking(records, 2025, 2)).toBe(130);
	});

	it('takes top N when bestOfN is specified', () => {
		const records = [
			makeRecord({ rankingDelta: 90, tournamentDate: new Date('2025-01-01').getTime() }),
			makeRecord({ rankingDelta: 70, tournamentDate: new Date('2025-02-01').getTime() }),
			makeRecord({ rankingDelta: 50, tournamentDate: new Date('2025-03-01').getTime() }),
			makeRecord({ rankingDelta: 30, tournamentDate: new Date('2025-04-01').getTime() })
		];
		// Top 3: 90 + 70 + 50 = 210
		expect(calculateUserRanking(records, 2025, 3)).toBe(210);
	});

	it('handles fewer tournaments than bestOfN gracefully', () => {
		const records = [
			makeRecord({ rankingDelta: 100, tournamentDate: new Date('2025-06-01').getTime() })
		];
		// Only 1 tournament, bestOfN=2 → takes all available = 100
		expect(calculateUserRanking(records, 2025, 2)).toBe(100);
	});

	it('filters by year correctly across multiple years', () => {
		const records = [
			makeRecord({ rankingDelta: 100, tournamentDate: new Date('2024-06-01').getTime() }),
			makeRecord({ rankingDelta: 60, tournamentDate: new Date('2025-06-01').getTime() }),
			makeRecord({ rankingDelta: 40, tournamentDate: new Date('2025-09-01').getTime() })
		];
		// 2025 only: 60 + 40 = 100
		expect(calculateUserRanking(records, 2025, 5)).toBe(100);
		// 2024 only: 100
		expect(calculateUserRanking(records, 2024, 5)).toBe(100);
	});

	it('sorts by rankingDelta descending before slicing', () => {
		const records = [
			makeRecord({ rankingDelta: 10, tournamentDate: new Date('2025-01-01').getTime() }),
			makeRecord({ rankingDelta: 99, tournamentDate: new Date('2025-02-01').getTime() }),
			makeRecord({ rankingDelta: 50, tournamentDate: new Date('2025-03-01').getTime() })
		];
		// Top 1 should be 99 (not 10, the first in array order)
		expect(calculateUserRanking(records, 2025, 1)).toBe(99);
	});
});

// ─────────────────────────────────────────────────
// recalculateUserRanking
// ─────────────────────────────────────────────────
describe('recalculateUserRanking', () => {
	it('returns 0 for undefined tournaments', () => {
		expect(recalculateUserRanking(undefined, new Map())).toBe(0);
	});

	it('returns 0 for empty tournaments', () => {
		expect(recalculateUserRanking([], new Map())).toBe(0);
	});

	it('recalculates points using calculateRankingPoints mock', () => {
		const records = [
			makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-01').getTime() }),
			makeRecord({ tournamentId: 't2', finalPosition: 2, tournamentDate: new Date('2025-07-01').getTime() })
		];
		const tMap = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1' })],
			['t2', makeTournamentInfo({ id: 't2' })]
		]);
		// Mock: pos 1 → 100, pos 2 → 80. bestOfN=2 → 100 + 80 = 180
		expect(recalculateUserRanking(records, tMap, 2025, 2)).toBe(180);
	});

	it('falls back to stored rankingDelta when tournament not in map', () => {
		const records = [
			makeRecord({ tournamentId: 't_unknown', rankingDelta: 42, tournamentDate: new Date('2025-05-01').getTime() })
		];
		// t_unknown not in map → uses stored rankingDelta = 42
		expect(recalculateUserRanking(records, new Map(), 2025, 5)).toBe(42);
	});

	it('mixes recalculated and fallback values, sorts desc, takes top N', () => {
		const records = [
			makeRecord({ tournamentId: 't1', finalPosition: 3, rankingDelta: 10, tournamentDate: new Date('2025-01-01').getTime() }),
			makeRecord({ tournamentId: 't_missing', rankingDelta: 75, tournamentDate: new Date('2025-02-01').getTime() })
		];
		const tMap = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1' })]
		]);
		// t1: pos 3 → 100 - 2*20 = 60. t_missing: fallback 75. Sorted: [75, 60]. Top 2 = 135
		expect(recalculateUserRanking(records, tMap, 2025, 2)).toBe(135);
	});

	it('filters by year before recalculating', () => {
		const records = [
			makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2024-06-01').getTime() }),
			makeRecord({ tournamentId: 't2', finalPosition: 1, tournamentDate: new Date('2025-06-01').getTime() })
		];
		const tMap = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1' })],
			['t2', makeTournamentInfo({ id: 't2' })]
		]);
		// Only 2025: pos 1 → 100
		expect(recalculateUserRanking(records, tMap, 2025, 5)).toBe(100);
	});
});

// ─────────────────────────────────────────────────
// calculateRankings
// ─────────────────────────────────────────────────
describe('calculateRankings', () => {
	const baseFilters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 2 };

	const tournamentsMap = new Map<string, TournamentInfo>([
		['t1', makeTournamentInfo({ id: 't1', country: 'ES', completedAt: new Date('2025-06-15').getTime() })],
		['t2', makeTournamentInfo({ id: 't2', country: 'FR', completedAt: new Date('2025-03-10').getTime() })],
		['t3', makeTournamentInfo({ id: 't3', country: 'ES', completedAt: new Date('2025-09-01').getTime() })]
	]);

	it('skips users without tournaments', () => {
		const users = [makeUser({ tournaments: [] }), makeUser({ tournaments: undefined })];
		const ranked = calculateRankings(users, tournamentsMap, baseFilters);
		expect(ranked).toHaveLength(0);
	});

	it('sorts players by totalPoints descending', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Low',
				tournaments: [makeRecord({ tournamentId: 't1', finalPosition: 3, tournamentDate: new Date('2025-06-15').getTime() })]
			}),
			makeUser({
				odId: 'u2', playerName: 'High',
				tournaments: [makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })]
			})
		];
		const ranked = calculateRankings(users, tournamentsMap, baseFilters);
		expect(ranked[0].playerName).toBe('High');
		expect(ranked[1].playerName).toBe('Low');
		expect(ranked[0].totalPoints).toBeGreaterThan(ranked[1].totalPoints);
	});

	it('applies year filter correctly', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Alice',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2024-06-15').getTime() })
				]
			})
		];
		// Filtering for 2025, but tournament is in 2024
		const ranked = calculateRankings(users, tournamentsMap, { ...baseFilters, year: 2025 });
		expect(ranked).toHaveLength(0);
	});

	it('applies country filter', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Alice',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
					makeRecord({ tournamentId: 't2', finalPosition: 1, tournamentDate: new Date('2025-03-10').getTime() })
				]
			})
		];
		const countryFilters: RankingFilters = {
			year: 2025, filterType: 'country', countryValue: 'FR', bestOfN: 5
		};
		const ranked = calculateRankings(users, tournamentsMap, countryFilters);
		expect(ranked).toHaveLength(1);
		// Only t2 (FR) should be counted
		expect(ranked[0].tournamentsCount).toBe(1);
	});

	it('bestOfN = 0 means all tournaments count', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Alice',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
					makeRecord({ tournamentId: 't2', finalPosition: 1, tournamentDate: new Date('2025-03-10').getTime() }),
					makeRecord({ tournamentId: 't3', finalPosition: 1, tournamentDate: new Date('2025-09-01').getTime() })
				]
			})
		];
		const allFilters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 0 };
		const ranked = calculateRankings(users, tournamentsMap, allFilters);
		expect(ranked[0].tournamentsCount).toBe(3);
		// All 3 × 100 = 300
		expect(ranked[0].totalPoints).toBe(300);
		// otherTournaments should be empty when bestOfN=0
		expect(ranked[0].otherTournaments).toHaveLength(0);
	});

	it('tiebreaker: better singles position wins when points are equal', () => {
		// Both get 100 points total, but u1 has best singles pos 1, u2 has best singles pos 2
		const u1 = makeUser({
			odId: 'u1', playerName: 'HasFirst',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
				makeRecord({ tournamentId: 't2', finalPosition: 6, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		const u2 = makeUser({
			odId: 'u2', playerName: 'HasSecond',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 2, tournamentDate: new Date('2025-06-15').getTime() }),
				makeRecord({ tournamentId: 't2', finalPosition: 5, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		// bestOfN=0: u1 = 100+0=100, u2 = 80+20=100. Equal points.
		// bestSinglesResult: u1=1, u2=2. u1 wins.
		const ranked = calculateRankings([u2, u1], tournamentsMap, { year: 2025, filterType: 'all', bestOfN: 0 });
		expect(ranked[0].totalPoints).toBe(ranked[1].totalPoints);
		expect(ranked[0].playerName).toBe('HasFirst');
		expect(ranked[0].bestSinglesResult).toBe(1);
	});

	it('tiebreaker: doubles position breaks tie when singles positions are equal', () => {
		const doublesMap = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1', gameType: 'singles' })],
			['t2', makeTournamentInfo({ id: 't2', gameType: 'singles', completedAt: new Date('2025-03-10').getTime() })],
			['td1', makeTournamentInfo({ id: 'td1', gameType: 'doubles' })],
			['td2', makeTournamentInfo({ id: 'td2', gameType: 'doubles', completedAt: new Date('2025-03-10').getTime() })]
		]);
		const u1 = makeUser({
			odId: 'u1', playerName: 'BetterDoubles',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
				makeRecord({ tournamentId: 'td1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
			]
		});
		const u2 = makeUser({
			odId: 'u2', playerName: 'WorseDoubles',
			tournaments: [
				makeRecord({ tournamentId: 't2', finalPosition: 1, tournamentDate: new Date('2025-03-10').getTime() }),
				makeRecord({ tournamentId: 'td2', finalPosition: 1, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		// Mock: pos 1 → 100 pts. Both: 100+100=200 points. bestSingles: both 1.
		// bestDoubles: u1=1, u2=1. Equal → falls to name. Let's make doubles differ:
		const u3 = makeUser({
			odId: 'u3', playerName: 'BetterDoubles',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 2, tournamentDate: new Date('2025-06-15').getTime() }),
				makeRecord({ tournamentId: 'td1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
			]
		});
		const u4 = makeUser({
			odId: 'u4', playerName: 'WorseDoubles',
			tournaments: [
				makeRecord({ tournamentId: 't2', finalPosition: 2, tournamentDate: new Date('2025-03-10').getTime() }),
				makeRecord({ tournamentId: 'td2', finalPosition: 3, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		// u3: 80+100=180, u4: 80+60=140. Not equal. Need same total.
		// Use bestOfN=1: u3 top1=100 (doubles), u4 top1=80 (singles). Not equal.
		// Simpler: same singles pos, one doubles pos differs, use bestOfN=1 so only 1 counts.
		const u5 = makeUser({
			odId: 'u5', playerName: 'BetterDoubles',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
				makeRecord({ tournamentId: 'td1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
			]
		});
		const u6 = makeUser({
			odId: 'u6', playerName: 'WorseDoubles',
			tournaments: [
				makeRecord({ tournamentId: 't2', finalPosition: 1, tournamentDate: new Date('2025-03-10').getTime() }),
				makeRecord({ tournamentId: 'td2', finalPosition: 3, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		// bestOfN=1: both top1=100. bestSingles: both 1. bestDoubles: u5=1, u6=3. u5 wins.
		const ranked = calculateRankings([u6, u5], doublesMap, { year: 2025, filterType: 'all', bestOfN: 1 });
		expect(ranked[0].totalPoints).toBe(ranked[1].totalPoints);
		expect(ranked[0].bestSinglesResult).toBe(ranked[1].bestSinglesResult);
		expect(ranked[0].playerName).toBe('BetterDoubles');
		expect(ranked[0].bestDoublesResult).toBe(1);
		expect(ranked[1].bestDoublesResult).toBe(3);
	});

	it('tiebreaker: player with only doubles loses to player with singles result', () => {
		const mixedMap = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1', gameType: 'singles' })],
			['td1', makeTournamentInfo({ id: 'td1', gameType: 'doubles' })]
		]);
		const u1 = makeUser({
			odId: 'u1', playerName: 'SinglesPlayer',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
			]
		});
		const u2 = makeUser({
			odId: 'u2', playerName: 'DoublesPlayer',
			tournaments: [
				makeRecord({ tournamentId: 'td1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
			]
		});
		// Both 100 points. u1 has bestSingles=1, u2 has bestSingles=null (Infinity). u1 wins.
		const ranked = calculateRankings([u2, u1], mixedMap, baseFilters);
		expect(ranked[0].playerName).toBe('SinglesPlayer');
	});

	it('tiebreaker: alphabetical name when all else is equal', () => {
		const u1 = makeUser({
			odId: 'u1', playerName: 'Zara',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
			]
		});
		const u2 = makeUser({
			odId: 'u2', playerName: 'Anna',
			tournaments: [
				makeRecord({ tournamentId: 't2', finalPosition: 1, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		// Same points (100), same bestSinglesResult (1), no doubles. Name tiebreaker.
		const ranked = calculateRankings([u1, u2], tournamentsMap, baseFilters);
		expect(ranked[0].playerName).toBe('Anna');
		expect(ranked[1].playerName).toBe('Zara');
	});

	it('otherTournaments contains remaining tournaments with points > 0', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Alice',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
					makeRecord({ tournamentId: 't2', finalPosition: 2, tournamentDate: new Date('2025-03-10').getTime() }),
					makeRecord({ tournamentId: 't3', finalPosition: 3, tournamentDate: new Date('2025-09-01').getTime() })
				]
			})
		];
		// bestOfN=1: top 1 tournament. Others with points > 0 go to otherTournaments.
		const filters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 1 };
		const ranked = calculateRankings(users, tournamentsMap, filters);
		expect(ranked[0].tournaments).toHaveLength(1);
		// pos 2 → 80, pos 3 → 60. Both > 0.
		expect(ranked[0].otherTournaments).toHaveLength(2);
	});

	it('excludes tournaments not in tournamentsMap', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Alice',
				tournaments: [
					makeRecord({ tournamentId: 'nonexistent', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			})
		];
		const ranked = calculateRankings(users, tournamentsMap, baseFilters);
		// Tournament not in map → filtered out → no matching tournaments → user skipped
		expect(ranked).toHaveLength(0);
	});

	it('uses "Unknown" for users without playerName', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: '',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			})
		];
		const ranked = calculateRankings(users, tournamentsMap, baseFilters);
		expect(ranked[0].playerName).toBe('Unknown');
	});
});

// ─────────────────────────────────────────────────
// getAvailableCountries
// ─────────────────────────────────────────────────
describe('getAvailableCountries', () => {
	it('returns unique countries sorted alphabetically', () => {
		const tMap = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1', country: 'FR' })],
			['t2', makeTournamentInfo({ id: 't2', country: 'ES' })],
			['t3', makeTournamentInfo({ id: 't3', country: 'FR' })],
			['t4', makeTournamentInfo({ id: 't4', country: 'DE' })]
		]);
		expect(getAvailableCountries(tMap)).toEqual(['DE', 'ES', 'FR']);
	});

	it('skips empty country strings', () => {
		const tMap = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1', country: '' })],
			['t2', makeTournamentInfo({ id: 't2', country: 'ES' })]
		]);
		expect(getAvailableCountries(tMap)).toEqual(['ES']);
	});

	it('returns empty array for empty map', () => {
		expect(getAvailableCountries(new Map())).toEqual([]);
	});
});

// ─────────────────────────────────────────────────
// getAvailableYears
// ─────────────────────────────────────────────────
describe('getAvailableYears', () => {
	it('returns unique years sorted descending', () => {
		const tMap = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1', completedAt: new Date('2025-06-15').getTime() })],
			['t2', makeTournamentInfo({ id: 't2', completedAt: new Date('2024-03-10').getTime() })],
			['t3', makeTournamentInfo({ id: 't3', completedAt: new Date('2025-09-01').getTime() })],
			['t4', makeTournamentInfo({ id: 't4', completedAt: new Date('2023-01-01').getTime() })]
		]);
		expect(getAvailableYears(tMap)).toEqual([2025, 2024, 2023]);
	});

	it('skips tournaments with completedAt = 0 (falsy)', () => {
		const tMap = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1', completedAt: 0 })],
			['t2', makeTournamentInfo({ id: 't2', completedAt: new Date('2025-06-15').getTime() })]
		]);
		expect(getAvailableYears(tMap)).toEqual([2025]);
	});

	it('returns empty array for empty map', () => {
		expect(getAvailableYears(new Map())).toEqual([]);
	});
});

// ─────────────────────────────────────────────────
// getAvailableCountries — year filter
// ─────────────────────────────────────────────────
describe('getAvailableCountries with year filter', () => {
	const tMap = new Map<string, TournamentInfo>([
		['t1', makeTournamentInfo({ id: 't1', country: 'ES', completedAt: new Date('2025-06-15').getTime() })],
		['t2', makeTournamentInfo({ id: 't2', country: 'FR', completedAt: new Date('2024-03-10').getTime() })],
		['t3', makeTournamentInfo({ id: 't3', country: 'DE', completedAt: new Date('2025-09-01').getTime() })],
		['t4', makeTournamentInfo({ id: 't4', country: 'FR', completedAt: new Date('2025-01-01').getTime() })]
	]);

	it('returns all countries when no year is specified', () => {
		expect(getAvailableCountries(tMap)).toEqual(['DE', 'ES', 'FR']);
	});

	it('filters countries by year', () => {
		expect(getAvailableCountries(tMap, 2025)).toEqual(['DE', 'ES', 'FR']);
		expect(getAvailableCountries(tMap, 2024)).toEqual(['FR']);
	});

	it('returns empty when no tournaments match the year', () => {
		expect(getAvailableCountries(tMap, 2020)).toEqual([]);
	});

	it('handles completedAt = 0 gracefully with year filter', () => {
		const withZero = new Map<string, TournamentInfo>([
			['t1', makeTournamentInfo({ id: 't1', country: 'ES', completedAt: 0 })],
			['t2', makeTournamentInfo({ id: 't2', country: 'FR', completedAt: new Date('2025-06-15').getTime() })]
		]);
		// completedAt=0 is falsy, so the year check is skipped and ES is included
		expect(getAvailableCountries(withZero, 2025)).toEqual(['ES', 'FR']);
	});
});

// ─────────────────────────────────────────────────
// Large dataset tests
// ─────────────────────────────────────────────────
describe('calculateRankings — large dataset', () => {
	it('handles 1000 users × 10 tournaments correctly', () => {
		const tournamentCount = 20;
		const userCount = 1000;

		// Create tournaments
		const tMap = new Map<string, TournamentInfo>();
		for (let t = 0; t < tournamentCount; t++) {
			tMap.set(`t${t}`, makeTournamentInfo({
				id: `t${t}`,
				country: t % 2 === 0 ? 'ES' : 'FR',
				completedAt: new Date(`2025-${String(Math.floor(t / 2) + 1).padStart(2, '0')}-15`).getTime()
			}));
		}

		// Create users — each participates in 10 random tournaments
		const users: UserWithId[] = [];
		for (let u = 0; u < userCount; u++) {
			const tournaments: TournamentRecord[] = [];
			for (let t = 0; t < 10; t++) {
				const tournamentIdx = (u + t) % tournamentCount;
				tournaments.push(makeRecord({
					tournamentId: `t${tournamentIdx}`,
					finalPosition: (u % 10) + 1, // positions 1-10
					totalParticipants: 30,
					rankingDelta: Math.max(0, 100 - (u % 10) * 20),
					tournamentDate: new Date(`2025-${String(Math.floor(tournamentIdx / 2) + 1).padStart(2, '0')}-15`).getTime()
				}));
			}
			users.push(makeUser({
				odId: `user${u}`,
				playerName: `Player ${String(u).padStart(4, '0')}`,
				tournaments
			}));
		}

		const filters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 3 };

		const start = performance.now();
		const ranked = calculateRankings(users, tMap, filters);
		const elapsed = performance.now() - start;

		// Should complete in reasonable time
		expect(elapsed).toBeLessThan(2000);

		// All 1000 users should appear (all have 2025 tournaments)
		expect(ranked.length).toBe(userCount);

		// Rankings should be sorted descending by totalPoints
		for (let i = 1; i < ranked.length; i++) {
			expect(ranked[i - 1].totalPoints).toBeGreaterThanOrEqual(ranked[i].totalPoints);
		}

		// First-place users (position 1, mock gives 100 pts) should be at top
		// Their bestOfN=3 would be 3×100 = 300
		expect(ranked[0].totalPoints).toBe(300);

		// Last users (position 10+, mock gives 0 pts) should have 0
		const lastPlayer = ranked[ranked.length - 1];
		expect(lastPlayer.totalPoints).toBe(0);
	});

	it('handles country filter with large dataset', () => {
		const tMap = new Map<string, TournamentInfo>();
		for (let t = 0; t < 10; t++) {
			tMap.set(`t${t}`, makeTournamentInfo({
				id: `t${t}`,
				country: t < 5 ? 'ES' : 'FR',
				completedAt: new Date(`2025-${String(t + 1).padStart(2, '0')}-15`).getTime()
			}));
		}

		const users: UserWithId[] = [];
		for (let u = 0; u < 500; u++) {
			const tournaments: TournamentRecord[] = [];
			for (let t = 0; t < 5; t++) {
				tournaments.push(makeRecord({
					tournamentId: `t${(u + t) % 10}`,
					finalPosition: (u % 5) + 1,
					totalParticipants: 20,
					tournamentDate: new Date(`2025-${String(((u + t) % 10) + 1).padStart(2, '0')}-15`).getTime()
				}));
			}
			users.push(makeUser({
				odId: `user${u}`,
				playerName: `Player ${u}`,
				tournaments
			}));
		}

		const esFilters: RankingFilters = { year: 2025, filterType: 'country', countryValue: 'ES', bestOfN: 2 };
		const esRanked = calculateRankings(users, tMap, esFilters);

		// Some users may not have ES tournaments
		expect(esRanked.length).toBeGreaterThan(0);
		expect(esRanked.length).toBeLessThanOrEqual(500);

		// All returned players should only have ES tournament details
		for (const player of esRanked) {
			for (const t of player.tournaments) {
				expect(t.country).toBe('ES');
			}
		}
	});
});

// ─────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────
describe('calculateRankings — edge cases', () => {
	const tournamentsMap = new Map<string, TournamentInfo>([
		['t1', makeTournamentInfo({ id: 't1', country: 'ES', completedAt: new Date('2025-06-15').getTime() })],
		['t2', makeTournamentInfo({ id: 't2', country: 'FR', completedAt: new Date('2025-03-10').getTime() })]
	]);
	const baseFilters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 2 };

	it('user with all 0-point tournaments still appears in rankings', () => {
		// Position 6 → mock: max(0, 100 - 5*20) = 0
		const users = [
			makeUser({
				odId: 'u1', playerName: 'ZeroPlayer',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 6, tournamentDate: new Date('2025-06-15').getTime() }),
					makeRecord({ tournamentId: 't2', finalPosition: 6, tournamentDate: new Date('2025-03-10').getTime() })
				]
			})
		];
		const ranked = calculateRankings(users, tournamentsMap, baseFilters);
		expect(ranked).toHaveLength(1);
		expect(ranked[0].totalPoints).toBe(0);
		expect(ranked[0].tournamentsCount).toBe(2);
	});

	it('all users tied — falls to alphabetical name tiebreaker', () => {
		const users = Array.from({ length: 5 }, (_, i) =>
			makeUser({
				odId: `u${i}`,
				playerName: String.fromCharCode(69 - i), // E, D, C, B, A
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			})
		);
		const ranked = calculateRankings(users, tournamentsMap, baseFilters);
		expect(ranked.map(r => r.playerName)).toEqual(['A', 'B', 'C', 'D', 'E']);
	});

	it('bestOfN larger than available tournaments uses all', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Alice',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			})
		];
		const bigBestOf: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 10 };
		const ranked = calculateRankings(users, tournamentsMap, bigBestOf);
		expect(ranked).toHaveLength(1);
		expect(ranked[0].tournamentsCount).toBe(1);
		expect(ranked[0].totalPoints).toBe(100);
	});

	it('otherTournaments does not include 0-point tournaments', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Alice',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
					makeRecord({ tournamentId: 't2', finalPosition: 6, tournamentDate: new Date('2025-03-10').getTime() }) // 0 points
				]
			})
		];
		const filters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 1 };
		const ranked = calculateRankings(users, tournamentsMap, filters);
		expect(ranked[0].tournaments).toHaveLength(1);
		expect(ranked[0].otherTournaments).toHaveLength(0); // 0-point tournament excluded
	});
});

// ─────────────────────────────────────────────────
// calculateRankings — doubles tournaments
// ─────────────────────────────────────────────────
describe('calculateRankings — doubles tournaments', () => {
	const baseFilters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 2 };

	// Doubles tournament info
	const doublesMap = new Map<string, TournamentInfo>([
		['d1', makeTournamentInfo({ id: 'd1', gameType: 'doubles', country: 'ES', completedAt: new Date('2025-06-15').getTime() })],
		['d2', makeTournamentInfo({ id: 'd2', gameType: 'doubles', country: 'FR', completedAt: new Date('2025-09-01').getTime() })],
		['s1', makeTournamentInfo({ id: 's1', gameType: 'singles', country: 'ES', completedAt: new Date('2025-03-10').getTime() })]
	]);

	it('doubles tournament records appear in ranking when user has them', () => {
		// Both members of a doubles pair should have records in their /users profile
		// (assuming applyRankingUpdates worked correctly)
		const users = [
			makeUser({
				odId: 'player-A', playerName: 'Player A',
				tournaments: [
					makeRecord({ tournamentId: 'd1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			}),
			makeUser({
				odId: 'partner-A', playerName: 'Partner A',
				tournaments: [
					makeRecord({ tournamentId: 'd1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			})
		];

		const ranked = calculateRankings(users, doublesMap, baseFilters);

		// Both should appear in rankings
		expect(ranked).toHaveLength(2);

		// Both should have same points (same position in same tournament)
		expect(ranked[0].totalPoints).toBe(ranked[1].totalPoints);
	});

	it('doubles and singles tournaments are both counted in ranking', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Versatile Player',
				tournaments: [
					makeRecord({ tournamentId: 's1', finalPosition: 1, tournamentDate: new Date('2025-03-10').getTime() }),
					makeRecord({ tournamentId: 'd1', finalPosition: 2, tournamentDate: new Date('2025-06-15').getTime() })
				]
			})
		];

		const ranked = calculateRankings(users, doublesMap, baseFilters);

		expect(ranked).toHaveLength(1);
		expect(ranked[0].tournamentsCount).toBe(2);
		// Both singles and doubles results contribute to ranking
		expect(ranked[0].totalPoints).toBeGreaterThan(0);
	});

	it('partner who only participated as partner (no own tournaments) should appear if record exists', () => {
		// This is the critical test: a player who ONLY played as a partner
		// They should appear in rankings IF their /users profile has the tournament record
		const users = [
			makeUser({
				odId: 'pure-partner', playerName: 'Pure Partner',
				tournaments: [
					makeRecord({ tournamentId: 'd1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			})
		];

		const ranked = calculateRankings(users, doublesMap, baseFilters);

		expect(ranked).toHaveLength(1);
		expect(ranked[0].playerName).toBe('Pure Partner');
		expect(ranked[0].totalPoints).toBeGreaterThan(0);
	});

	it('partner WITHOUT tournament record in profile does NOT appear in ranking (the reported bug)', () => {
		// If applyRankingUpdates/Cloud Function failed to add the record for partner,
		// the partner won't appear in rankings at all
		const users = [
			makeUser({
				odId: 'main-player', playerName: 'Main Player',
				tournaments: [
					makeRecord({ tournamentId: 'd1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			}),
			makeUser({
				odId: 'forgotten-partner', playerName: 'Forgotten Partner',
				tournaments: [] // BUG: record never added because partner had no userId at tournament time
			})
		];

		const ranked = calculateRankings(users, doublesMap, baseFilters);

		// Only main player appears — partner is invisible in rankings
		expect(ranked).toHaveLength(1);
		expect(ranked[0].playerName).toBe('Main Player');
		// The partner is completely absent from rankings because they have no tournament records
	});

	it('multiple doubles tournaments are aggregated correctly per user', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'Doubles Specialist',
				tournaments: [
					makeRecord({ tournamentId: 'd1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
					makeRecord({ tournamentId: 'd2', finalPosition: 3, tournamentDate: new Date('2025-09-01').getTime() })
				]
			})
		];

		const ranked = calculateRankings(users, doublesMap, { ...baseFilters, bestOfN: 0 });

		expect(ranked).toHaveLength(1);
		expect(ranked[0].tournamentsCount).toBe(2);
		// Points from both doubles tournaments are summed
		expect(ranked[0].totalPoints).toBeGreaterThan(0);
	});
});
