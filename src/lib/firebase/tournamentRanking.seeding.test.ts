/**
 * Tests for ranking-based seeding with previous year fallback
 * 
 * Verifies that syncParticipantRankings() uses the previous year's ranking
 * when the current year ranking is 0, ensuring proper seeding for group distribution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Track mock calls ──────────────────────────────────────────────────────────

let mockTournamentData: any = null;
let mockUpdatedParticipants: any[] | null = null;

// ─── vi.mock setup ──────────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
	db: {},
	isFirebaseEnabled: () => true
}));

vi.mock('firebase/firestore', () => ({
	doc: () => ({}),
	runTransaction: vi.fn(),
	serverTimestamp: () => Date.now(),
	arrayUnion: (...args: any[]) => args[0]
}));

vi.mock('./tournaments', () => ({
	getTournament: async (_id: string) => mockTournamentData,
	updateTournament: async (_id: string, updates: any) => {
		mockUpdatedParticipants = updates.participants || null;
		return true;
	},
	updateTournamentPublic: async (_id: string, updates: any) => {
		mockUpdatedParticipants = updates.participants || null;
		return true;
	},
	parseTournamentData: (data: unknown) => data
}));

// Mock user profiles with tournament histories spanning two years
vi.mock('./userProfile', () => ({
	getUserProfileById: async (userId: string) => {
		// Player with tournaments in BOTH years
		if (userId === 'user-both-years') {
			return {
				playerName: 'Player Both Years',
				tournaments: [
					{
						tournamentId: 't-current-1',
						tournamentName: 'Current Year Tournament',
						tournamentDate: new Date('2026-06-15').getTime(),
						finalPosition: 2,
						totalParticipants: 16,
						rankingBefore: 0,
						rankingAfter: 80,
						rankingDelta: 80
					},
					{
						tournamentId: 't-prev-1',
						tournamentName: 'Previous Year Tournament',
						tournamentDate: new Date('2025-06-15').getTime(),
						finalPosition: 1,
						totalParticipants: 20,
						rankingBefore: 0,
						rankingAfter: 120,
						rankingDelta: 120
					}
				]
			};
		}
		// Player with tournaments ONLY in previous year (early season scenario)
		if (userId === 'user-prev-year-only') {
			return {
				playerName: 'Player Previous Year Only',
				tournaments: [
					{
						tournamentId: 't-prev-2',
						tournamentName: 'Last Year Open',
						tournamentDate: new Date('2025-09-10').getTime(),
						finalPosition: 1,
						totalParticipants: 24,
						rankingBefore: 0,
						rankingAfter: 150,
						rankingDelta: 150
					},
					{
						tournamentId: 't-prev-3',
						tournamentName: 'Last Year Finals',
						tournamentDate: new Date('2025-11-20').getTime(),
						finalPosition: 3,
						totalParticipants: 20,
						rankingBefore: 150,
						rankingAfter: 200,
						rankingDelta: 50
					}
				]
			};
		}
		// Player with tournaments ONLY in current year
		if (userId === 'user-current-year-only') {
			return {
				playerName: 'Player Current Year Only',
				tournaments: [
					{
						tournamentId: 't-current-2',
						tournamentName: 'Spring Championship',
						tournamentDate: new Date('2026-03-20').getTime(),
						finalPosition: 1,
						totalParticipants: 12,
						rankingBefore: 0,
						rankingAfter: 100,
						rankingDelta: 100
					}
				]
			};
		}
		// Player with NO tournaments at all
		if (userId === 'user-no-tournaments') {
			return {
				playerName: 'New Player',
				tournaments: []
			};
		}
		// Player for doubles partner test (previous year only)
		if (userId === 'partner-prev-year') {
			return {
				playerName: 'Partner Previous Year',
				tournaments: [
					{
						tournamentId: 't-prev-4',
						tournamentName: 'Partner Tournament',
						tournamentDate: new Date('2025-07-15').getTime(),
						finalPosition: 2,
						totalParticipants: 16,
						rankingBefore: 0,
						rankingAfter: 75,
						rankingDelta: 75
					}
				]
			};
		}
		return null;
	},
	addTournamentRecord: async () => true,
	removeTournamentRecord: async () => true
}));

// Mock recalculateUserRanking to be YEAR-AWARE
// This is the key mock: it filters tournaments by year before summing
vi.mock('./rankings', () => ({
	recalculateUserRanking: (tournaments: any[], _map: any, year: number, bestOfN: number) => {
		if (!tournaments?.length) return 0;
		// Filter by year (matching real implementation)
		const filtered = tournaments.filter((t: any) => {
			const recordYear = new Date(t.tournamentDate).getFullYear();
			return recordYear === year;
		});
		if (filtered.length === 0) return 0;
		// Sort by delta descending and take top N
		const sorted = [...filtered].sort((a: any, b: any) => b.rankingDelta - a.rankingDelta);
		const topN = sorted.slice(0, bestOfN);
		return topN.reduce((sum: number, t: any) => sum + t.rankingDelta, 0);
	}
}));

vi.mock('$lib/algorithms/ranking', () => ({
	calculateRankingPoints: (position: number, _tier: string, total: number, _gameType: string) => {
		return Math.max(1, 15 - (position - 1) * 2);
	}
}));

vi.mock('$lib/algorithms/bracket', () => ({
	calculateConsolationPositions: () => new Map()
}));

vi.mock('$lib/stores/tournament', () => ({
	savingParticipantResults: { set: () => {} }
}));

vi.mock('$lib/types/tournament', () => ({
	getParticipantDisplayName: (p: any) => p?.name || '',
	normalizeTier: (tier: any) => tier || 'SERIES_15'
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

const { syncParticipantRankings } = await import('./tournamentRanking');

// ─── Test helpers ───────────────────────────────────────────────────────────────

function createTournament(overrides: any = {}): any {
	return {
		id: 'test-tournament-1',
		name: 'Test Tournament',
		gameType: 'singles',
		status: 'GROUP_STAGE',
		country: 'ES',
		phaseType: 'TWO_PHASE',
		rankingConfig: {
			enabled: true,
			tier: 'SERIES_25'
		},
		participants: [],
		...overrides
	};
}

function createParticipant(id: string, userId: string, name: string, overrides: any = {}): any {
	return {
		id,
		type: 'REGISTERED',
		userId,
		name,
		status: 'ACTIVE',
		rankingSnapshot: 0,
		...overrides
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('syncParticipantRankings — previous year fallback for seeding', () => {
	beforeEach(() => {
		mockUpdatedParticipants = null;
	});

	it('uses current year ranking when available', async () => {
		mockTournamentData = createTournament({
			participants: [
				createParticipant('p1', 'user-current-year-only', 'Current Year Player')
			]
		});

		await syncParticipantRankings('test-tournament-1');

		expect(mockUpdatedParticipants).not.toBeNull();
		const p1 = mockUpdatedParticipants!.find((p: any) => p.id === 'p1');
		// user-current-year-only has 100 points in 2026
		expect(p1?.rankingSnapshot).toBe(100);
	});

	it('falls back to previous year when current year ranking is 0', async () => {
		mockTournamentData = createTournament({
			participants: [
				createParticipant('p1', 'user-prev-year-only', 'Previous Year Player')
			]
		});

		await syncParticipantRankings('test-tournament-1');

		expect(mockUpdatedParticipants).not.toBeNull();
		const p1 = mockUpdatedParticipants!.find((p: any) => p.id === 'p1');
		// user-prev-year-only has 0 points in 2026, but 200 (150+50 top 2) in 2025
		expect(p1?.rankingSnapshot).toBeGreaterThan(0);
		expect(p1?.rankingSnapshot).toBe(200); // top 2 of 2025: 150 + 50
	});

	it('prefers current year over previous year when both have points', async () => {
		mockTournamentData = createTournament({
			participants: [
				createParticipant('p1', 'user-both-years', 'Both Years Player')
			]
		});

		await syncParticipantRankings('test-tournament-1');

		expect(mockUpdatedParticipants).not.toBeNull();
		const p1 = mockUpdatedParticipants!.find((p: any) => p.id === 'p1');
		// user-both-years has 80 in 2026 and 120 in 2025
		// Should use 2026 (80) since it's > 0
		expect(p1?.rankingSnapshot).toBe(80);
	});

	it('returns 0 when no tournaments in any year', async () => {
		mockTournamentData = createTournament({
			participants: [
				createParticipant('p1', 'user-no-tournaments', 'New Player')
			]
		});

		await syncParticipantRankings('test-tournament-1');

		expect(mockUpdatedParticipants).not.toBeNull();
		const p1 = mockUpdatedParticipants!.find((p: any) => p.id === 'p1');
		expect(p1?.rankingSnapshot).toBe(0);
	});

	it('mixed participants: correct seeding order with fallback', async () => {
		mockTournamentData = createTournament({
			participants: [
				createParticipant('p1', 'user-prev-year-only', 'Top Seed (prev year)'),   // 200 from 2025
				createParticipant('p2', 'user-current-year-only', 'Seed 2 (current year)'), // 100 from 2026
				createParticipant('p3', 'user-both-years', 'Seed 3 (both years)'),           // 80 from 2026
				createParticipant('p4', 'user-no-tournaments', 'Unseeded')                    // 0
			]
		});

		await syncParticipantRankings('test-tournament-1');

		expect(mockUpdatedParticipants).not.toBeNull();

		const rankings = mockUpdatedParticipants!.map((p: any) => ({
			id: p.id,
			ranking: p.rankingSnapshot
		}));

		// p1 should have highest ranking (200 from 2025 fallback)
		const p1 = rankings.find((r: any) => r.id === 'p1');
		const p2 = rankings.find((r: any) => r.id === 'p2');
		const p3 = rankings.find((r: any) => r.id === 'p3');
		const p4 = rankings.find((r: any) => r.id === 'p4');

		expect(p1!.ranking).toBe(200); // Previous year fallback
		expect(p2!.ranking).toBe(100); // Current year
		expect(p3!.ranking).toBe(80);  // Current year (has both, uses current)
		expect(p4!.ranking).toBe(0);   // No tournaments

		// Verify correct seeding order: p1 > p2 > p3 > p4
		expect(p1!.ranking).toBeGreaterThan(p2!.ranking);
		expect(p2!.ranking).toBeGreaterThan(p3!.ranking);
		expect(p3!.ranking).toBeGreaterThan(p4!.ranking);
	});

	it('doubles: partner falls back to previous year ranking', async () => {
		mockTournamentData = createTournament({
			gameType: 'doubles',
			participants: [
				createParticipant('pair-1', 'user-current-year-only', 'Main Player', {
					partner: {
						type: 'REGISTERED',
						userId: 'partner-prev-year',
						name: 'Partner Previous Year'
					}
				})
			]
		});

		await syncParticipantRankings('test-tournament-1');

		expect(mockUpdatedParticipants).not.toBeNull();
		const pair1 = mockUpdatedParticipants!.find((p: any) => p.id === 'pair-1');

		// Main player: 100 from 2026 (current year)
		expect(pair1?.rankingSnapshot).toBe(100);

		// Partner: 0 in 2026, should fallback to 75 from 2025
		expect(pair1?.partner?.rankingSnapshot).toBe(75);
	});

	it('does not sync rankings when rankingConfig is disabled', async () => {
		mockTournamentData = createTournament({
			rankingConfig: { enabled: false },
			participants: [
				createParticipant('p1', 'user-prev-year-only', 'Player')
			]
		});

		const result = await syncParticipantRankings('test-tournament-1');

		// Should return true (no-op) without updating participants
		expect(result).toBe(true);
		expect(mockUpdatedParticipants).toBeNull();
	});
});
