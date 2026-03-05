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

	it('tiebreaker: more tournaments wins when points are equal', () => {
		const users = [
			makeUser({
				odId: 'u1', playerName: 'One-tourney',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			}),
			makeUser({
				odId: 'u2', playerName: 'Two-tourneys',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 2, tournamentDate: new Date('2025-06-15').getTime() }),
					makeRecord({ tournamentId: 't2', finalPosition: 2, tournamentDate: new Date('2025-03-10').getTime() })
				]
			})
		];
		// u1: pos 1 → 100 (1 tournament). u2: pos 2 → 80 × 2 = 160 (2 tournaments).
		// u2 has more points → wins regardless. Let's equalize with bestOfN=1.
		const filters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 1 };
		// u1: top1=100. u2: top1=80. u1 still ahead by points.
		// To test the tournamentsCount tiebreaker, we need equal points.
		const equalUsers = [
			makeUser({
				odId: 'u1', playerName: 'Fewer',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
				]
			}),
			makeUser({
				odId: 'u2', playerName: 'More',
				tournaments: [
					makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
					makeRecord({ tournamentId: 't2', finalPosition: 1, tournamentDate: new Date('2025-03-10').getTime() })
				]
			})
		];
		const eqFilters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 1 };
		// Both have top1 = 100. tournamentsCount tiebreaker: u2 has 1 (bestOfN=1), u1 has 1. Equal!
		// Actually bestOfN=1 means both have tournamentsCount=1. Let's use bestOfN=2.
		const eq2Filters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 2 };
		// u1: top2 = 100 (only 1). u2: top2 = 100+100 = 200.
		// Points differ. Need exact same points AND different tournament counts.
		// Use bestOfN=0 with same sum.
		const u1 = makeUser({
			odId: 'u1', playerName: 'Fewer',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() })
			]
		});
		const u2 = makeUser({
			odId: 'u2', playerName: 'More',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
				makeRecord({ tournamentId: 't2', finalPosition: 6, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		// bestOfN=0: u1 = 100. u2 = 100 + 0 (pos 6 → max(0, 100-100)=0) = 100.
		// Same points, u2 has 2 tournaments (even though one scored 0... wait, does it get filtered?)
		// Looking at the code: matchingTournaments includes all that pass year/country filter.
		// tournamentsCount = topN.length = matchingTournaments.length (when bestOfN=0).
		// But pos 6 → 0 points. matchingTournaments still includes it. tournamentsCount=2 vs 1.
		const allFilters: RankingFilters = { year: 2025, filterType: 'all', bestOfN: 0 };
		const ranked = calculateRankings([u1, u2], tournamentsMap, allFilters);
		expect(ranked[0].totalPoints).toBe(ranked[1].totalPoints);
		expect(ranked[0].playerName).toBe('More'); // More tournaments → wins tiebreak
		expect(ranked[0].tournamentsCount).toBeGreaterThan(ranked[1].tournamentsCount);
	});

	it('tiebreaker: better bestResult wins when points and tournamentsCount are equal', () => {
		const u1 = makeUser({
			odId: 'u1', playerName: 'WorseResult',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 2, tournamentDate: new Date('2025-06-15').getTime() })
			]
		});
		const u2 = makeUser({
			odId: 'u2', playerName: 'BetterResult',
			tournaments: [
				makeRecord({ tournamentId: 't2', finalPosition: 2, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		// Both: 1 tournament, pos 2 → 80 points. Same tournamentsCount. Same bestResult (2).
		// Falls to name tiebreaker. Let's create a scenario with different bestResult.
		const u3 = makeUser({
			odId: 'u3', playerName: 'HasFirst',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 1, tournamentDate: new Date('2025-06-15').getTime() }),
				makeRecord({ tournamentId: 't2', finalPosition: 6, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		const u4 = makeUser({
			odId: 'u4', playerName: 'HasSecond',
			tournaments: [
				makeRecord({ tournamentId: 't1', finalPosition: 2, tournamentDate: new Date('2025-06-15').getTime() }),
				makeRecord({ tournamentId: 't2', finalPosition: 5, tournamentDate: new Date('2025-03-10').getTime() })
			]
		});
		// bestOfN=1: u3 top1=100, u4 top1=80. Not equal.
		// bestOfN=0: u3 = 100+0=100, u4 = 80+0=100 (pos5 → max(0,100-80)=20). u4=100.
		// Hmm, let me just check: pos5 → 100-(5-1)*20 = 100-80=20. So u4=80+20=100, u3=100+0=100. Equal!
		// tournamentsCount: both 2. bestResult: u3=1, u4=2. u3 wins (lower is better).
		const ranked = calculateRankings([u4, u3], tournamentsMap, { year: 2025, filterType: 'all', bestOfN: 0 });
		expect(ranked[0].totalPoints).toBe(ranked[1].totalPoints);
		expect(ranked[0].playerName).toBe('HasFirst');
		expect(ranked[0].bestResult).toBe(1);
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
		// Same points (100), same tournamentsCount (1), same bestResult (1). Name tiebreaker.
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
