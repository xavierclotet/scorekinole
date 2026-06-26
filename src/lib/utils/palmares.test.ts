import { describe, it, expect } from 'vitest';
import { buildPalmaresRows } from './palmares';
import type { TournamentRecord } from '$lib/types/tournament';
import type { PalmaresMeta } from '$lib/types/history';
import { calculateRankingPoints } from '$lib/algorithms/ranking';

function record(over: Partial<TournamentRecord> = {}): TournamentRecord {
	return {
		tournamentId: 't1',
		tournamentName: 'Open BCN',
		tournamentDate: new Date('2025-05-01').getTime(),
		finalPosition: 3,
		totalParticipants: 24,
		rankingBefore: 0,
		rankingAfter: 0,
		rankingDelta: 99,
		...over
	};
}

describe('buildPalmaresRows', () => {
	it('joins record + meta into a row', () => {
		const meta = new Map<string, PalmaresMeta>([
			['t1', { gameType: 'doubles', tier: 'SERIES_25', partnerName: 'Pat', partnerUserId: 'pat-1', edition: 3 }]
		]);
		const [row] = buildPalmaresRows([record()], meta);

		expect(row.tournamentId).toBe('t1');
		expect(row.tournamentName).toBe('Open BCN');
		expect(row.edition).toBe(3);
		expect(row.gameType).toBe('doubles');
		expect(row.tier).toBe('SERIES_25');
		expect(row.tierLabel).toBe('Series 25');
		expect(row.partnerName).toBe('Pat');
		expect(row.partnerUserId).toBe('pat-1');
		expect(row.position).toBe(3);
		expect(row.participants).toBe(24);
	});

	it('computes points like /ranking (calculateRankingPoints), not the stored delta', () => {
		const meta = new Map<string, PalmaresMeta>([
			['t1', { gameType: 'doubles', tier: 'SERIES_25' }]
		]);
		const [row] = buildPalmaresRows([record({ rankingDelta: 99 })], meta);
		expect(row.points).toBe(calculateRankingPoints(3, 'SERIES_25', 24, 'doubles'));
		expect(row.points).not.toBe(99);
	});

	it('falls back to rankingDelta when there is no meta for the tournament', () => {
		const [row] = buildPalmaresRows([record({ rankingDelta: 42 })], new Map());
		expect(row.points).toBe(42);
		expect(row.gameType).toBeUndefined();
		expect(row.tierLabel).toBeUndefined();
		expect(row.partnerName).toBeUndefined();
	});

	it('defaults a missing tier to Series 15 when meta exists (mirrors /ranking)', () => {
		const meta = new Map<string, PalmaresMeta>([['t1', { gameType: 'singles' }]]);
		const [row] = buildPalmaresRows([record()], meta);
		expect(row.tierLabel).toBe('Series 15');
		expect(row.points).toBe(calculateRankingPoints(3, 'SERIES_15', 24, 'singles'));
	});

	it('sorts by date descending', () => {
		const recs = [
			record({ tournamentId: 'old', tournamentDate: new Date('2024-01-01').getTime() }),
			record({ tournamentId: 'new', tournamentDate: new Date('2025-09-01').getTime() }),
			record({ tournamentId: 'mid', tournamentDate: new Date('2025-03-01').getTime() })
		];
		const rows = buildPalmaresRows(recs, new Map());
		expect(rows.map((r) => r.tournamentId)).toEqual(['new', 'mid', 'old']);
	});
});
