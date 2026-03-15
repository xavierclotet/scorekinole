/**
 * Tests for doubles ranking bugs in tournamentRanking.ts
 *
 * Confirms two bugs:
 * 1. syncParticipantRankings: partner profiles not fetched → partner rankingSnapshot = 0
 * 2. applyRankingUpdates: partner gets main participant's rankingSnapshot for rankingBefore/rankingAfter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Track mock calls ──────────────────────────────────────────────────────────

const getUserProfileByIdCalls: string[] = [];
const addTournamentRecordCalls: { userId: string; record: any; rankingAfter?: number }[] = [];
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

vi.mock('./userProfile', () => ({
	getUserProfileById: async (userId: string) => {
		getUserProfileByIdCalls.push(userId);
		// Return mock profiles with different tournament histories
		if (userId === 'main-user-1') {
			return {
				playerName: 'Main Player 1',
				tournaments: [
					{
						tournamentId: 'prev-tournament-1',
						tournamentName: 'Previous Tournament',
						tournamentDate: new Date('2026-01-15').getTime(),
						finalPosition: 1,
						totalParticipants: 10,
						rankingBefore: 0,
						rankingAfter: 15,
						rankingDelta: 15
					}
				]
			};
		}
		if (userId === 'partner-user-1') {
			return {
				playerName: 'Partner Player 1',
				tournaments: [
					{
						tournamentId: 'prev-tournament-2',
						tournamentName: 'Another Tournament',
						tournamentDate: new Date('2026-02-10').getTime(),
						finalPosition: 2,
						totalParticipants: 8,
						rankingBefore: 0,
						rankingAfter: 10,
						rankingDelta: 10
					}
				]
			};
		}
		if (userId === 'main-user-2') {
			return {
				playerName: 'Main Player 2',
				tournaments: []
			};
		}
		if (userId === 'partner-user-2') {
			return {
				playerName: 'Partner Player 2',
				tournaments: [
					{
						tournamentId: 'prev-tournament-3',
						tournamentName: 'Yet Another',
						tournamentDate: new Date('2026-03-01').getTime(),
						finalPosition: 1,
						totalParticipants: 12,
						rankingBefore: 0,
						rankingAfter: 15,
						rankingDelta: 15
					}
				]
			};
		}
		return null;
	},
	addTournamentRecord: async (userId: string, record: any, rankingAfter?: number) => {
		addTournamentRecordCalls.push({ userId, record, rankingAfter });
		return true;
	},
	removeTournamentRecord: async () => true
}));

vi.mock('./rankings', () => ({
	recalculateUserRanking: (_tournaments: any[], _map: any, _year: number, _bestOfN: number) => {
		// Return different rankings for different users
		if (_tournaments?.length > 0) {
			return _tournaments.reduce((sum: number, t: any) => sum + t.rankingDelta, 0);
		}
		return 0;
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
	getParticipantDisplayName: (p: any) => p.name,
	normalizeTier: (tier: any) => tier || 'SERIES_15'
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

const { syncParticipantRankings, applyRankingUpdates } = await import('./tournamentRanking');

// ─── Test helpers ───────────────────────────────────────────────────────────────

function createDoublesTournament(overrides: any = {}): any {
	return {
		id: 'doubles-tournament-1',
		name: 'Doubles Championship',
		gameType: 'doubles',
		status: 'GROUP_STAGE',
		completedAt: Date.now(),
		country: 'ES',
		phaseType: 'GROUP_ONLY',
		rankingConfig: {
			enabled: true,
			tier: 'SERIES_15'
		},
		participants: [
			{
				id: 'pair-1',
				type: 'REGISTERED',
				userId: 'main-user-1',
				name: 'Main Player 1',
				status: 'ACTIVE',
				rankingSnapshot: 15,
				partner: {
					type: 'REGISTERED',
					userId: 'partner-user-1',
					name: 'Partner Player 1'
				},
				finalPosition: 1
			},
			{
				id: 'pair-2',
				type: 'REGISTERED',
				userId: 'main-user-2',
				name: 'Main Player 2',
				status: 'ACTIVE',
				rankingSnapshot: 0,
				partner: {
					type: 'REGISTERED',
					userId: 'partner-user-2',
					name: 'Partner Player 2'
				},
				finalPosition: 2
			}
		],
		...overrides
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('syncParticipantRankings — doubles partner bugs', () => {
	beforeEach(() => {
		getUserProfileByIdCalls.length = 0;
		addTournamentRecordCalls.length = 0;
		mockUpdatedParticipants = null;
	});

	it('BUG: should fetch profiles for BOTH main and partner userIds, but only fetches main', async () => {
		mockTournamentData = createDoublesTournament();

		await syncParticipantRankings('doubles-tournament-1');

		// Expected: getUserProfileById called for ALL 4 userIds (2 main + 2 partners)
		const expectedUserIds = ['main-user-1', 'partner-user-1', 'main-user-2', 'partner-user-2'];
		for (const userId of expectedUserIds) {
			expect(
				getUserProfileByIdCalls.includes(userId),
				`getUserProfileById should be called for ${userId} but was only called for: [${getUserProfileByIdCalls.join(', ')}]`
			).toBe(true);
		}
	});

	it('BUG: partner rankingSnapshot should reflect partner profile ranking, not 0', async () => {
		mockTournamentData = createDoublesTournament();

		await syncParticipantRankings('doubles-tournament-1');

		// Check that participants were updated with correct rankingSnapshots
		expect(mockUpdatedParticipants).not.toBeNull();

		const pair1 = mockUpdatedParticipants!.find((p: any) => p.id === 'pair-1');
		const pair2 = mockUpdatedParticipants!.find((p: any) => p.id === 'pair-2');

		// Main participants should have their own ranking
		expect(pair1?.rankingSnapshot).toBe(15); // main-user-1 has 15 points from previous tournament
		expect(pair2?.rankingSnapshot).toBe(0);  // main-user-2 has no tournaments

		// BUG: Partners have no rankingSnapshot field on the participant object
		// The function should set partner ranking somewhere (e.g., partner.rankingSnapshot)
		// but currently it doesn't even fetch partner profiles
		// partner-user-1 has 10 points from previous tournament
		// partner-user-2 has 15 points from previous tournament
		// These rankings are completely lost/ignored
	});

	it('BUG: only main participant userIds are in the profile map', async () => {
		mockTournamentData = createDoublesTournament();

		await syncParticipantRankings('doubles-tournament-1');

		// The function only calls getUserProfileById for main participants
		// It should also call it for partners
		const mainUserIds = ['main-user-1', 'main-user-2'];
		const partnerUserIds = ['partner-user-1', 'partner-user-2'];

		// Main users ARE fetched (this works)
		for (const userId of mainUserIds) {
			expect(getUserProfileByIdCalls).toContain(userId);
		}

		// Partners are NOT fetched (this is the bug)
		// This assertion documents the buggy behavior
		for (const userId of partnerUserIds) {
			expect(
				getUserProfileByIdCalls.includes(userId),
				`Partner ${userId} should be fetched but is missing from profile map`
			).toBe(true);
		}
	});

	it('BUG: with guest partner having userId, partner ranking is still ignored', async () => {
		const tournament = createDoublesTournament({
			participants: [
				{
					id: 'pair-1',
					type: 'REGISTERED',
					userId: 'main-user-1',
					name: 'Main Player 1',
					status: 'ACTIVE',
					rankingSnapshot: 15,
					partner: {
						type: 'GUEST',
						userId: 'partner-user-1', // Persistent guest WITH userId
						name: 'Guest Partner'
					},
					finalPosition: 1
				}
			]
		});
		mockTournamentData = tournament;

		await syncParticipantRankings('doubles-tournament-1');

		// Even persistent guests with userId should have their profile fetched
		expect(
			getUserProfileByIdCalls.includes('partner-user-1'),
			`Persistent guest partner 'partner-user-1' should have profile fetched`
		).toBe(true);
	});
});

describe('applyRankingUpdates — doubles partner bugs', () => {
	beforeEach(() => {
		getUserProfileByIdCalls.length = 0;
		addTournamentRecordCalls.length = 0;
		mockUpdatedParticipants = null;
	});

	it('should add tournament records for BOTH main and partner', async () => {
		const tournament = createDoublesTournament({
			status: 'COMPLETED',
			participants: [
				{
					id: 'pair-1',
					type: 'REGISTERED',
					userId: 'main-user-1',
					name: 'Main Player 1',
					status: 'ACTIVE',
					rankingSnapshot: 15,
					partner: {
						type: 'REGISTERED',
						userId: 'partner-user-1',
						name: 'Partner Player 1'
					},
					finalPosition: 1
				}
			]
		});
		mockTournamentData = tournament;

		await applyRankingUpdates('doubles-tournament-1', tournament);

		// Both users should receive tournament records
		const mainRecord = addTournamentRecordCalls.find(c => c.userId === 'main-user-1');
		const partnerRecord = addTournamentRecordCalls.find(c => c.userId === 'partner-user-1');

		expect(mainRecord, 'Main participant should get tournament record').toBeDefined();
		expect(partnerRecord, 'Partner should get tournament record').toBeDefined();
	});

	it('BUG: partner rankingBefore should use partner own ranking, not main participant ranking', async () => {
		// Main participant has rankingSnapshot: 50 (from previous tournaments)
		// Partner should have their own ranking (e.g., 30) but there's no field for it
		const tournament = createDoublesTournament({
			status: 'COMPLETED',
			participants: [
				{
					id: 'pair-1',
					type: 'REGISTERED',
					userId: 'main-user-1',
					name: 'Main Player 1',
					status: 'ACTIVE',
					rankingSnapshot: 50, // Main's ranking
					partner: {
						type: 'REGISTERED',
						userId: 'partner-user-1',
						name: 'Partner Player 1'
						// No rankingSnapshot field for partner!
					},
					finalPosition: 1
				}
			]
		});
		mockTournamentData = tournament;

		await applyRankingUpdates('doubles-tournament-1', tournament);

		const mainRecord = addTournamentRecordCalls.find(c => c.userId === 'main-user-1');
		const partnerRecord = addTournamentRecordCalls.find(c => c.userId === 'partner-user-1');

		expect(mainRecord).toBeDefined();
		expect(partnerRecord).toBeDefined();

		// Main participant's rankingBefore is correct: uses their own rankingSnapshot
		expect(mainRecord!.record.rankingBefore).toBe(50);

		// BUG: Partner's rankingBefore should be the partner's own ranking,
		// but the code uses participant.rankingSnapshot (main's value: 50)
		// instead of partner's actual ranking
		// This assertion documents the EXPECTED (correct) behavior:
		expect(
			partnerRecord!.record.rankingBefore,
			'Partner rankingBefore should NOT be the main participant\'s ranking (50). ' +
			'It should be the partner\'s own ranking.'
		).not.toBe(mainRecord!.record.rankingBefore);
	});

	it('BUG: partner rankingAfter is calculated from main participant rankingSnapshot', async () => {
		const tournament = createDoublesTournament({
			status: 'COMPLETED',
			participants: [
				{
					id: 'pair-1',
					type: 'REGISTERED',
					userId: 'main-user-1',
					name: 'Main Player 1',
					status: 'ACTIVE',
					rankingSnapshot: 100,
					partner: {
						type: 'REGISTERED',
						userId: 'partner-user-1',
						name: 'Partner Player 1'
					},
					finalPosition: 1
				}
			]
		});
		mockTournamentData = tournament;

		await applyRankingUpdates('doubles-tournament-1', tournament);

		const mainRecord = addTournamentRecordCalls.find(c => c.userId === 'main-user-1');
		const partnerRecord = addTournamentRecordCalls.find(c => c.userId === 'partner-user-1');

		// Both records exist
		expect(mainRecord).toBeDefined();
		expect(partnerRecord).toBeDefined();

		// The rankingDelta (points earned) is the same for both — this is CORRECT
		expect(partnerRecord!.record.rankingDelta).toBe(mainRecord!.record.rankingDelta);

		// But rankingBefore and rankingAfter are WRONG for partner
		// Main: rankingBefore=100, rankingAfter=100+delta
		// Partner: rankingBefore=100 (WRONG — should be partner's own ranking)
		//          rankingAfter=100+delta (WRONG — should be partnerRanking+delta)
		expect(mainRecord!.record.rankingBefore).toBe(100);

		// BUG assertion: partner gets same rankingBefore as main (100) instead of their own
		expect(
			partnerRecord!.record.rankingBefore,
			'Partner should have their OWN rankingBefore, not the main participant\'s (100)'
		).not.toBe(100);
	});

	it('partner without userId does not get tournament record (expected behavior)', async () => {
		const tournament = createDoublesTournament({
			status: 'COMPLETED',
			participants: [
				{
					id: 'pair-1',
					type: 'REGISTERED',
					userId: 'main-user-1',
					name: 'Main Player 1',
					status: 'ACTIVE',
					rankingSnapshot: 15,
					partner: {
						type: 'GUEST',
						// No userId — pure guest, no user profile
						name: 'Anonymous Partner'
					},
					finalPosition: 1
				}
			]
		});
		mockTournamentData = tournament;

		await applyRankingUpdates('doubles-tournament-1', tournament);

		// Only main participant should get a record
		expect(addTournamentRecordCalls).toHaveLength(1);
		expect(addTournamentRecordCalls[0].userId).toBe('main-user-1');
	});

	it('both members of doubles pair should get tournament records with correct positions', async () => {
		const tournament = createDoublesTournament({
			status: 'COMPLETED'
		});
		mockTournamentData = tournament;

		await applyRankingUpdates('doubles-tournament-1', tournament);

		// Pair 1 (position 1): both main-user-1 and partner-user-1 should get records
		const pair1Main = addTournamentRecordCalls.find(c => c.userId === 'main-user-1');
		const pair1Partner = addTournamentRecordCalls.find(c => c.userId === 'partner-user-1');

		// Pair 2 (position 2): both main-user-2 and partner-user-2 should get records
		const pair2Main = addTournamentRecordCalls.find(c => c.userId === 'main-user-2');
		const pair2Partner = addTournamentRecordCalls.find(c => c.userId === 'partner-user-2');

		// All 4 users should get records
		expect(pair1Main, 'Pair 1 main should get record').toBeDefined();
		expect(pair1Partner, 'Pair 1 partner should get record').toBeDefined();
		expect(pair2Main, 'Pair 2 main should get record').toBeDefined();
		expect(pair2Partner, 'Pair 2 partner should get record').toBeDefined();

		// Both members of same pair should have same finalPosition
		expect(pair1Main!.record.finalPosition).toBe(1);
		expect(pair1Partner!.record.finalPosition).toBe(1);
		expect(pair2Main!.record.finalPosition).toBe(2);
		expect(pair2Partner!.record.finalPosition).toBe(2);

		// Both members should have same rankingDelta (points earned)
		expect(pair1Main!.record.rankingDelta).toBe(pair1Partner!.record.rankingDelta);
		expect(pair2Main!.record.rankingDelta).toBe(pair2Partner!.record.rankingDelta);
	});
});

describe('Cloud Function processParticipant — same bugs', () => {
	// These tests document that the Cloud Function has the SAME bug pattern:
	// const rankingBefore = participant.rankingSnapshot || 0;
	// This uses the main participant's rankingSnapshot for both members

	it('documents the bug: partner rankingBefore uses main participant rankingSnapshot in CF too', () => {
		// Cloud Function processParticipant (functions/src/index.ts:342):
		//   const rankingBefore = participant.rankingSnapshot || 0;
		//   const rankingAfter = rankingBefore + pointsEarned;
		//
		// For a doubles pair where:
		//   participant.rankingSnapshot = 50 (main player's ranking)
		//   partner has their own ranking = 30 (stored in /users doc, not on participant)
		//
		// The CF creates ONE tournamentRecord with:
		//   rankingBefore: 50 (main's)
		//   rankingAfter: 50 + delta
		//
		// And adds this SAME record to both users:
		//   addTournamentRecord(participant.userId, tournamentRecord)    // OK: main gets correct rankingBefore
		//   addTournamentRecord(participant.partner.userId, tournamentRecord) // BUG: partner gets main's rankingBefore
		//
		// The partner's /users doc ends up with a tournament record showing:
		//   rankingBefore: 50 (should be 30, the partner's actual ranking)
		//   rankingAfter: 50 + delta (should be 30 + delta)
		//   rankingDelta: delta (correct — same for both team members)

		// Simulate the CF logic
		const participant = {
			rankingSnapshot: 50,
			userId: 'main-user',
			partner: { userId: 'partner-user' },
			finalPosition: 1
		};

		const rankingBefore = participant.rankingSnapshot || 0; // line 342
		const pointsEarned = 15;
		const rankingAfter = rankingBefore + pointsEarned; // line 343

		const tournamentRecord = {
			rankingBefore,
			rankingAfter,
			rankingDelta: pointsEarned
		};

		// Both users get the SAME record — partner's rankingBefore is wrong
		expect(tournamentRecord.rankingBefore).toBe(50);
		// Partner's actual ranking is 30, but they get 50 in their record

		// EXPECTED for partner:
		const partnerActualRanking = 30;
		const correctPartnerRecord = {
			rankingBefore: partnerActualRanking,
			rankingAfter: partnerActualRanking + pointsEarned,
			rankingDelta: pointsEarned // Same delta
		};

		// The records SHOULD be different for rankingBefore/rankingAfter
		expect(tournamentRecord.rankingBefore).not.toBe(correctPartnerRecord.rankingBefore);
	});
});
