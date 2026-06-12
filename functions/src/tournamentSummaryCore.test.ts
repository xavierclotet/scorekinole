import { describe, it, expect } from 'vitest';
import {
	buildTournamentSummary,
	summariesEqual,
	toEpochMillis,
	type TournamentSummary
} from './tournamentSummaryCore';

const NOW = new Date(2026, 5, 12, 12, 0, 0).getTime();
const DAY = 86400000;

function fakeTimestamp(ms: number) {
	return { toMillis: () => ms };
}

function baseTournament(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		key: 'open-bcn',
		name: 'Open BCN',
		country: 'ES',
		city: 'Barcelona',
		status: 'COMPLETED',
		gameType: 'singles',
		tournamentDate: NOW - DAY,
		createdAt: NOW - 30 * DAY,
		participants: [{ status: 'ACTIVE' }, { status: 'ACTIVE' }, { status: 'WITHDRAWN' }],
		...overrides
	};
}

describe('toEpochMillis', () => {
	it('passes through finite numbers', () => {
		expect(toEpochMillis(123456)).toBe(123456);
	});

	it('converts Timestamp-like objects', () => {
		expect(toEpochMillis(fakeTimestamp(987654))).toBe(987654);
	});

	it('returns undefined for missing/invalid values', () => {
		expect(toEpochMillis(undefined)).toBeUndefined();
		expect(toEpochMillis(null)).toBeUndefined();
		expect(toEpochMillis('2026-01-01')).toBeUndefined();
		expect(toEpochMillis(NaN)).toBeUndefined();
	});
});

describe('buildTournamentSummary', () => {
	it('builds a summary with the listing fields', () => {
		const summary = buildTournamentSummary(baseTournament(), NOW)!;
		expect(summary).toEqual({
			key: 'open-bcn',
			name: 'Open BCN',
			country: 'ES',
			city: 'Barcelona',
			tournamentDate: NOW - DAY,
			status: 'COMPLETED',
			gameType: 'singles',
			participantsCount: 2,
			createdAt: NOW - 30 * DAY
		});
	});

	it('returns null for test tournaments (excluded from public view)', () => {
		expect(buildTournamentSummary(baseTournament({ isTest: true }), NOW)).toBeNull();
	});

	it('counts only ACTIVE participants', () => {
		const summary = buildTournamentSummary(
			baseTournament({
				participants: [
					{ status: 'ACTIVE' },
					{ status: 'WITHDRAWN' },
					{ status: 'DISQUALIFIED' },
					null
				]
			}),
			NOW
		)!;
		expect(summary.participantsCount).toBe(1);
	});

	it('converts Timestamp dates and falls back tournamentDate → createdAt → now', () => {
		const withTimestamps = buildTournamentSummary(
			baseTournament({
				tournamentDate: fakeTimestamp(NOW - 2 * DAY),
				createdAt: fakeTimestamp(NOW - 10 * DAY)
			}),
			NOW
		)!;
		expect(withTimestamps.tournamentDate).toBe(NOW - 2 * DAY);
		expect(withTimestamps.createdAt).toBe(NOW - 10 * DAY);

		// No tournamentDate → falls back to createdAt so the summary is never
		// missing the field (orderBy-exclusion bug class)
		const noDate = buildTournamentSummary(baseTournament({ tournamentDate: undefined }), NOW)!;
		expect(noDate.tournamentDate).toBe(NOW - 30 * DAY);

		// Neither → now
		const neither = buildTournamentSummary(
			baseTournament({ tournamentDate: undefined, createdAt: undefined }),
			NOW
		)!;
		expect(neither.tournamentDate).toBe(NOW);
		expect(neither.createdAt).toBe(NOW);
	});

	it('includes tier only when rankingConfig is enabled', () => {
		const ranked = buildTournamentSummary(
			baseTournament({ rankingConfig: { enabled: true, tier: 'SERIES_25' } }),
			NOW
		)!;
		expect(ranked.tier).toBe('SERIES_25');

		const unranked = buildTournamentSummary(
			baseTournament({ rankingConfig: { enabled: false, tier: 'SERIES_25' } }),
			NOW
		)!;
		expect('tier' in unranked).toBe(false);
	});

	it('never produces undefined values (Firestore rejects them)', () => {
		const summary = buildTournamentSummary(
			baseTournament({
				edition: undefined,
				address: undefined,
				posterUrl: undefined,
				isImported: undefined,
				participants: undefined
			}),
			NOW
		)!;
		for (const value of Object.values(summary)) {
			expect(value).not.toBeUndefined();
		}
	});

	it('includes optional fields when present', () => {
		const summary = buildTournamentSummary(
			baseTournament({
				edition: 3,
				address: 'C/ Mallorca 1',
				isImported: true,
				posterUrl: 'https://example.com/poster.jpg'
			}),
			NOW
		)!;
		expect(summary.edition).toBe(3);
		expect(summary.address).toBe('C/ Mallorca 1');
		expect(summary.isImported).toBe(true);
		expect(summary.posterUrl).toBe('https://example.com/poster.jpg');
	});
});

describe('summariesEqual', () => {
	it('detects no-op writes (score updates do not change the summary)', () => {
		// Same tournament, only embedded match data changed (not part of summary)
		const before = buildTournamentSummary(baseTournament({ groups: [{ matches: [1] }] }), NOW);
		const after = buildTournamentSummary(baseTournament({ groups: [{ matches: [1, 2] }] }), NOW);
		expect(summariesEqual(before, after)).toBe(true);
	});

	it('detects real changes (status, participants)', () => {
		const before = buildTournamentSummary(baseTournament(), NOW);
		const statusChanged = buildTournamentSummary(baseTournament({ status: 'GROUP_STAGE' }), NOW);
		expect(summariesEqual(before, statusChanged)).toBe(false);

		const participantAdded = buildTournamentSummary(
			baseTournament({
				participants: [{ status: 'ACTIVE' }, { status: 'ACTIVE' }, { status: 'ACTIVE' }]
			}),
			NOW
		);
		expect(summariesEqual(before, participantAdded)).toBe(false);
	});

	it('handles null (test tournament / deleted doc)', () => {
		const summary: TournamentSummary | null = buildTournamentSummary(baseTournament(), NOW);
		expect(summariesEqual(null, null)).toBe(true);
		expect(summariesEqual(summary, null)).toBe(false);
		expect(summariesEqual(null, summary)).toBe(false);
	});
});
