import { describe, it, expect } from 'vitest';
import {
	calculateRankingPoints,
	getPointsDistribution,
	getTierInfo,
	getNaturalThreshold
} from './ranking';
import type { TournamentTier } from '$lib/types/tournament';

describe('calculateRankingPoints', () => {
	it('points decrease monotonically from position 1 to N', () => {
		const tiers: TournamentTier[] = ['SERIES_35', 'SERIES_25', 'SERIES_15'];
		const counts = [5, 10, 16, 25, 30, 50];

		for (const tier of tiers) {
			for (const count of counts) {
				const points: number[] = [];
				for (let pos = 1; pos <= count; pos++) {
					points.push(calculateRankingPoints(pos, tier, count));
				}

				for (let i = 0; i < points.length - 1; i++) {
					expect(points[i]).toBeGreaterThanOrEqual(points[i + 1]);
				}
			}
		}
	});

	it('last place always receives at least 1 point', () => {
		const tiers: TournamentTier[] = ['SERIES_35', 'SERIES_25', 'SERIES_15'];

		for (const tier of tiers) {
			for (let count = 2; count <= 50; count++) {
				const lastPlacePoints = calculateRankingPoints(count, tier, count);
				expect(lastPlacePoints).toBeGreaterThanOrEqual(1);
			}
		}
	});

	it('position beyond participant count returns 0', () => {
		expect(calculateRankingPoints(17, 'SERIES_35', 16)).toBe(0);
		expect(calculateRankingPoints(51, 'SERIES_15', 50)).toBe(0);
	});

	it('winner receives scaled points below threshold', () => {
		// SERIES_15 singles: threshold = 15 - 5 = 10
		// With 5 players: winner gets round(15 * 5/10) = round(7.5) = 8
		expect(calculateRankingPoints(1, 'SERIES_15', 5)).toBe(8);

		// SERIES_35 singles: threshold = 30
		// With 30 players: winner gets round(35 * 30/30) = 35 (at threshold)
		expect(calculateRankingPoints(1, 'SERIES_35', 30)).toBe(35);

		// With 15 players: winner gets round(35 * 15/30) = round(17.5) = 18
		expect(calculateRankingPoints(1, 'SERIES_35', 15)).toBe(18);
	});

	it('winner receives full basePoints at or above threshold', () => {
		// SERIES_25 singles: threshold = 20
		expect(calculateRankingPoints(1, 'SERIES_25', 20)).toBe(25);
		expect(calculateRankingPoints(1, 'SERIES_25', 30)).toBe(25);
		expect(calculateRankingPoints(1, 'SERIES_25', 50)).toBe(25);
	});

	it('doubles gives fewer points than singles for same count', () => {
		const count = 16;
		const singlesWinner = calculateRankingPoints(1, 'SERIES_35', count, 'singles');
		const doublesWinner = calculateRankingPoints(1, 'SERIES_35', count, 'doubles');

		expect(doublesWinner).toBeLessThanOrEqual(singlesWinner);
	});
});

describe('getPointsDistribution', () => {
	it('returns correct number of entries', () => {
		const dist = getPointsDistribution('SERIES_25', 16);
		expect(dist).toHaveLength(16);
		expect(dist[0].position).toBe(1);
		expect(dist[15].position).toBe(16);
	});

	it('all entries have positive points', () => {
		const dist = getPointsDistribution('SERIES_35', 30);
		for (const entry of dist) {
			expect(entry.points).toBeGreaterThanOrEqual(1);
		}
	});
});

describe('getTierInfo', () => {
	it('returns correct base points for each tier', () => {
		expect(getTierInfo('SERIES_35').basePoints).toBe(35);
		expect(getTierInfo('SERIES_25').basePoints).toBe(25);
		expect(getTierInfo('SERIES_15').basePoints).toBe(15);
	});
});

describe('getNaturalThreshold', () => {
	it('singles threshold = basePoints - 5', () => {
		expect(getNaturalThreshold(35, 'singles')).toBe(30);
		expect(getNaturalThreshold(25, 'singles')).toBe(20);
		expect(getNaturalThreshold(15, 'singles')).toBe(10);
	});

	it('doubles threshold = basePoints', () => {
		expect(getNaturalThreshold(35, 'doubles')).toBe(35);
		expect(getNaturalThreshold(25, 'doubles')).toBe(25);
	});
});
