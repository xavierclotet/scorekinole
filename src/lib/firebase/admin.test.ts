/**
 * Tests for mergeUsers in admin.ts
 *
 * Covers:
 * - Validation (missing users, same user, already merged, auth checks)
 * - Tournament deduplication (target wins on conflict)
 * - Tournament document updates (participant.userId, partner.userId)
 * - mergedTo / mergedFrom bookkeeping
 * - Edge cases: no tournaments, non-existent tournament docs, multiple mergedFrom, etc.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock state ──────────────────────────────────────────────────────────────

let mockUsers: Map<string, any> = new Map();
let mockTournaments: Map<string, any> = new Map();
let setDocCalls: { path: string; data: any; options?: any }[] = [];
let isAdminResult = true;
let mockCurrentUser: any = { id: 'admin-user' };
let mockUserProfile: any = { isAdmin: true };

// ─── vi.mock setup ──────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
	db: {},
	isFirebaseEnabled: () => true
}));

vi.mock('./auth', () => ({
	currentUser: {
		subscribe: (fn: any) => {
			fn(mockCurrentUser);
			return () => {};
		}
	}
}));

vi.mock('./userProfile', () => ({
	getUserProfile: async () => mockUserProfile,
	getUserProfileById: async () => null
}));

// Shared write helper used by setDoc, runTransaction tx.set, and writeBatch commit
function applyWrite(ref: any, data: any, options?: any) {
	setDocCalls.push({ path: ref.path, data, options });
	const store = ref._collection === 'users' ? mockUsers : mockTournaments;
	const existing = store.get(ref.id) || {};
	if (options?.merge) {
		store.set(ref.id, { ...existing, ...data });
	} else {
		store.set(ref.id, data);
	}
}

function makeGetDoc(ref: any) {
	const store = ref._collection === 'users' ? mockUsers : mockTournaments;
	const data = store.get(ref.id);
	return {
		exists: () => !!data,
		data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
	};
}

vi.mock('firebase/functions', () => ({
	getFunctions: vi.fn(() => ({ app: {} })),
	httpsCallable: vi.fn()
}));

vi.mock('firebase/app', () => ({
	getApp: vi.fn(() => ({ name: '[DEFAULT]' }))
}));

vi.mock('firebase/firestore', () => ({
	doc: (_db: any, collection: string, id: string) => ({
		path: `${collection}/${id}`,
		id,
		_collection: collection
	}),
	getDoc: async (ref: any) => makeGetDoc(ref),
	getDocs: async () => ({
		forEach: () => {}
	}),
	setDoc: async (ref: any, data: any, options?: any) => {
		applyWrite(ref, data, options);
	},
	runTransaction: async (_db: any, fn: (tx: any) => Promise<void>) => {
		const tx = {
			get: async (ref: any) => makeGetDoc(ref),
			set: (ref: any, data: any, options?: any) => {
				applyWrite(ref, data, options);
			}
		};
		await fn(tx);
	},
	writeBatch: (_db: any) => {
		const ops: { ref: any; data: any; options?: any }[] = [];
		return {
			set: (ref: any, data: any, options?: any) => {
				ops.push({ ref, data, options });
			},
			commit: async () => {
				for (const op of ops) applyWrite(op.ref, op.data, op.options);
			}
		};
	},
	updateDoc: async () => {},
	deleteDoc: async () => {},
	collection: () => ({}),
	query: (...args: any[]) => args,
	where: () => ({}),
	orderBy: () => ({}),
	limit: () => ({}),
	startAfter: () => ({}),
	getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
	serverTimestamp: () => 'SERVER_TIMESTAMP',
	arrayRemove: (...args: any[]) => args,
	arrayUnion: (...args: any[]) => args
}));

// Dynamic import after mocks
const { mergeUsers } = await import('./admin');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findSetDocCall(path: string) {
	return setDocCalls.filter((c) => c.path === path);
}

function lastSetDocCall(path: string) {
	const calls = findSetDocCall(path);
	return calls[calls.length - 1];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('mergeUsers', () => {
	beforeEach(() => {
		mockUsers.clear();
		mockTournaments.clear();
		setDocCalls = [];
		isAdminResult = true;
		mockCurrentUser = { id: 'admin-user' };
		mockUserProfile = { isAdmin: true };
	});

	// ── Validation ────────────────────────────────────────────────────────

	describe('validation', () => {
		it('returns error if source user not found', async () => {
			mockUsers.set('target-id', { playerName: 'Target' });

			const result = await mergeUsers('missing-id', 'target-id');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Source user not found');
		});

		it('returns error if target user not found', async () => {
			mockUsers.set('source-id', { playerName: 'Source' });

			const result = await mergeUsers('source-id', 'missing-id');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Target user not found');
		});

		it('returns error if source and target are the same userId', async () => {
			mockUsers.set('same-id', { playerName: 'Same' });

			const result = await mergeUsers('same-id', 'same-id');

			expect(result.success).toBe(false);
			expect(result.error).toContain('same');
		});

		it('returns error if source was already merged', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				mergedTo: 'some-other-user'
			});
			mockUsers.set('target-id', { playerName: 'Target' });

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(false);
			expect(result.error).toContain('already merged');
		});

		it('allows merging even if target was previously a merge target (has mergedFrom)', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: []
			});
			mockUsers.set('target-id', {
				playerName: 'Target',
				mergedFrom: ['old-merged-user'],
				tournaments: []
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
		});
	});

	// ── Tournament deduplication ──────────────────────────────────────────

	describe('tournament deduplication', () => {
		it('merges tournaments from source to target, deduplicating by tournamentId', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [
					{ tournamentId: 't1', rankingDelta: 10 },
					{ tournamentId: 't2', rankingDelta: 20 }
				]
			});
			mockUsers.set('target-id', {
				playerName: 'Target',
				tournaments: [
					{ tournamentId: 't2', rankingDelta: 25 },
					{ tournamentId: 't3', rankingDelta: 30 }
				]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate).toBeDefined();
			expect(targetUpdate.data.tournaments).toHaveLength(3);

			// t2 should keep target's version (rankingDelta: 25)
			const t2 = targetUpdate.data.tournaments.find(
				(t: any) => t.tournamentId === 't2'
			);
			expect(t2.rankingDelta).toBe(25);

			// t1 should come from source
			const t1 = targetUpdate.data.tournaments.find(
				(t: any) => t.tournamentId === 't1'
			);
			expect(t1.rankingDelta).toBe(10);
		});

		it('handles source with no tournaments', async () => {
			mockUsers.set('source-id', { playerName: 'Source' });
			mockUsers.set('target-id', {
				playerName: 'Target',
				tournaments: [{ tournamentId: 't1' }]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate.data.tournaments).toHaveLength(1);
		});

		it('handles target with no tournaments', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1', rankingDelta: 10 }]
			});
			mockUsers.set('target-id', { playerName: 'Target' });

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate.data.tournaments).toHaveLength(1);
			expect(targetUpdate.data.tournaments[0].tournamentId).toBe('t1');
		});

		it('handles both users with no tournaments', async () => {
			mockUsers.set('source-id', { playerName: 'Source', tournaments: [] });
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate.data.tournaments).toHaveLength(0);
		});

		it('handles source with undefined tournaments field', async () => {
			mockUsers.set('source-id', { playerName: 'Source' });
			mockUsers.set('target-id', { playerName: 'Target' });

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate.data.tournaments).toHaveLength(0);
		});

		it('preserves all tournament fields during deduplication', async () => {
			const sourceT = {
				tournamentId: 't1',
				tournamentName: 'Copa A',
				tournamentDate: 1710000000000,
				finalPosition: 3,
				totalParticipants: 10,
				rankingDelta: 15,
				gameType: 'singles'
			};
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [sourceT]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });

			await mergeUsers('source-id', 'target-id');

			const targetUpdate = lastSetDocCall('users/target-id');
			const merged = targetUpdate.data.tournaments[0];
			expect(merged.tournamentName).toBe('Copa A');
			expect(merged.finalPosition).toBe(3);
			expect(merged.totalParticipants).toBe(10);
			expect(merged.rankingDelta).toBe(15);
			expect(merged.gameType).toBe('singles');
		});
	});

	// ── mergedTo / mergedFrom bookkeeping ─────────────────────────────────

	describe('mergedTo / mergedFrom', () => {
		it('marks source with mergedTo pointing to target', async () => {
			mockUsers.set('source-id', { playerName: 'Source', tournaments: [] });
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });

			await mergeUsers('source-id', 'target-id');

			const sourceUpdate = lastSetDocCall('users/source-id');
			expect(sourceUpdate.data.mergedTo).toBe('target-id');
		});

		it('adds source to target mergedFrom array', async () => {
			mockUsers.set('source-id', { playerName: 'Source', tournaments: [] });
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });

			await mergeUsers('source-id', 'target-id');

			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate.data.mergedFrom).toContain('source-id');
		});

		it('appends to existing mergedFrom (does not overwrite)', async () => {
			mockUsers.set('source-id', { playerName: 'Source', tournaments: [] });
			mockUsers.set('target-id', {
				playerName: 'Target',
				mergedFrom: ['previously-merged-user'],
				tournaments: []
			});

			await mergeUsers('source-id', 'target-id');

			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate.data.mergedFrom).toContain('previously-merged-user');
			expect(targetUpdate.data.mergedFrom).toContain('source-id');
			expect(targetUpdate.data.mergedFrom).toHaveLength(2);
		});

		it('sets updatedAt on both source and target', async () => {
			mockUsers.set('source-id', { playerName: 'Source', tournaments: [] });
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });

			await mergeUsers('source-id', 'target-id');

			const sourceUpdate = lastSetDocCall('users/source-id');
			const targetUpdate = lastSetDocCall('users/target-id');
			expect(sourceUpdate.data.updatedAt).toBe('SERVER_TIMESTAMP');
			expect(targetUpdate.data.updatedAt).toBe('SERVER_TIMESTAMP');
		});
	});

	// ── Tournament document updates ──────────────────────────────────────

	describe('tournament document updates', () => {
		it('replaces source userId in participant.userId', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('t1', {
				participants: [
					{ userId: 'source-id', name: 'Source', type: 'GUEST' },
					{ userId: 'other-user', name: 'Other' }
				]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			expect(result.tournamentsUpdated).toBe(1);

			const tournamentUpdate = lastSetDocCall('tournaments/t1');
			expect(tournamentUpdate).toBeDefined();
			const updated = tournamentUpdate.data.participants;
			expect(updated[0].userId).toBe('target-id');
			expect(updated[1].userId).toBe('other-user'); // unchanged
		});

		it('replaces source userId in partner.userId', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('t1', {
				participants: [
					{
						userId: 'main-player',
						name: 'Main',
						partner: { userId: 'source-id', name: 'Source' }
					}
				]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.tournamentsUpdated).toBe(1);
			const tournamentUpdate = lastSetDocCall('tournaments/t1');
			const p = tournamentUpdate.data.participants[0];
			expect(p.partner.userId).toBe('target-id');
			expect(p.userId).toBe('main-player'); // unchanged
		});

		it('replaces source in both participant.userId AND partner.userId in same tournament', async () => {
			// Source appears as main player in one entry and partner in another
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('t1', {
				participants: [
					{
						userId: 'source-id',
						name: 'Source',
						partner: { userId: 'partner-A', name: 'Partner A' }
					},
					{
						userId: 'other-player',
						name: 'Other',
						partner: { userId: 'source-id', name: 'Source' }
					}
				]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.tournamentsUpdated).toBe(1);
			const tournamentUpdate = lastSetDocCall('tournaments/t1');
			const ps = tournamentUpdate.data.participants;
			expect(ps[0].userId).toBe('target-id');
			expect(ps[1].partner.userId).toBe('target-id');
		});

		it('skips tournament documents that no longer exist', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [
					{ tournamentId: 'existing-t' },
					{ tournamentId: 'deleted-t' }
				]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('existing-t', {
				participants: [{ userId: 'source-id', name: 'Source' }]
			});
			// 'deleted-t' is NOT in mockTournaments — simulates deleted doc

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			expect(result.tournamentsUpdated).toBe(1);
		});

		it('does not update tournament doc if source userId is not in participants', async () => {
			// Source has a tournament record but the tournament doc doesn't reference source
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('t1', {
				participants: [
					{ userId: 'unrelated-user', name: 'Unrelated' }
				]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			expect(result.tournamentsUpdated).toBe(0);
			// No setDoc call for this tournament
			const tournamentCalls = findSetDocCall('tournaments/t1');
			expect(tournamentCalls).toHaveLength(0);
		});

		it('updates photoURL from target profile when replacing participant', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', {
				playerName: 'Target',
				photoURL: 'https://example.com/photo.jpg',
				authProvider: 'google',
				tournaments: []
			});
			mockTournaments.set('t1', {
				participants: [
					{ userId: 'source-id', name: 'Source', photoURL: null }
				]
			});

			await mergeUsers('source-id', 'target-id');

			const tournamentUpdate = lastSetDocCall('tournaments/t1');
			expect(tournamentUpdate.data.participants[0].photoURL).toBe(
				'https://example.com/photo.jpg'
			);
		});

		it('sets type to REGISTERED when target has authProvider', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', {
				playerName: 'Target',
				authProvider: 'google',
				tournaments: []
			});
			mockTournaments.set('t1', {
				participants: [
					{ userId: 'source-id', name: 'Source', type: 'GUEST' }
				]
			});

			await mergeUsers('source-id', 'target-id');

			const tournamentUpdate = lastSetDocCall('tournaments/t1');
			expect(tournamentUpdate.data.participants[0].type).toBe('REGISTERED');
		});

		it('does not change type when target is also guest (no authProvider)', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				authProvider: null,
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', {
				playerName: 'Target',
				authProvider: null,
				tournaments: []
			});
			mockTournaments.set('t1', {
				participants: [
					{ userId: 'source-id', name: 'Source', type: 'GUEST' }
				]
			});

			await mergeUsers('source-id', 'target-id');

			const tournamentUpdate = lastSetDocCall('tournaments/t1');
			// type should remain GUEST — authProvider is null/falsy
			expect(tournamentUpdate.data.participants[0].type).toBe('GUEST');
		});

		it('updates partner photoURL and type from target profile', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', {
				playerName: 'Target',
				photoURL: 'https://target.com/pic.jpg',
				authProvider: 'email',
				tournaments: []
			});
			mockTournaments.set('t1', {
				participants: [
					{
						userId: 'main-player',
						name: 'Main',
						partner: {
							userId: 'source-id',
							name: 'Source',
							photoURL: null,
							type: 'GUEST'
						}
					}
				]
			});

			await mergeUsers('source-id', 'target-id');

			const tournamentUpdate = lastSetDocCall('tournaments/t1');
			const partner = tournamentUpdate.data.participants[0].partner;
			expect(partner.userId).toBe('target-id');
			expect(partner.photoURL).toBe('https://target.com/pic.jpg');
			expect(partner.type).toBe('REGISTERED');
		});

		it('handles tournament with empty participants array', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('t1', { participants: [] });

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			expect(result.tournamentsUpdated).toBe(0);
		});

		it('handles multiple tournaments from source', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [
					{ tournamentId: 't1' },
					{ tournamentId: 't2' },
					{ tournamentId: 't3' }
				]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('t1', {
				participants: [{ userId: 'source-id', name: 'Source' }]
			});
			mockTournaments.set('t2', {
				participants: [{ userId: 'source-id', name: 'Source' }]
			});
			mockTournaments.set('t3', {
				participants: [{ userId: 'someone-else', name: 'Other' }]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			expect(result.tournamentsUpdated).toBe(2); // t1 and t2 changed, t3 didn't
		});
	});

	// ── User type combinations ───────────────────────────────────────────

	describe('user type combinations', () => {
		it('guest → guest merge', async () => {
			mockUsers.set('guest-1', {
				playerName: 'Guest 1',
				authProvider: null,
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('guest-2', {
				playerName: 'Guest 2',
				authProvider: null,
				tournaments: [{ tournamentId: 't2' }]
			});

			const result = await mergeUsers('guest-1', 'guest-2');

			expect(result.success).toBe(true);
			const targetUpdate = lastSetDocCall('users/guest-2');
			expect(targetUpdate.data.tournaments).toHaveLength(2);
		});

		it('guest → registered merge', async () => {
			mockUsers.set('guest-1', {
				playerName: 'Guest',
				authProvider: null,
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('reg-1', {
				playerName: 'Registered',
				authProvider: 'google',
				tournaments: [{ tournamentId: 't2' }]
			});

			const result = await mergeUsers('guest-1', 'reg-1');

			expect(result.success).toBe(true);
		});

		it('registered → registered merge', async () => {
			mockUsers.set('reg-1', {
				playerName: 'Reg 1',
				authProvider: 'google',
				tournaments: []
			});
			mockUsers.set('reg-2', {
				playerName: 'Reg 2',
				authProvider: 'email',
				tournaments: []
			});

			const result = await mergeUsers('reg-1', 'reg-2');

			expect(result.success).toBe(true);
		});

		it('registered → guest merge', async () => {
			mockUsers.set('reg-1', {
				playerName: 'Registered',
				authProvider: 'google',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('guest-1', {
				playerName: 'Guest',
				authProvider: null,
				tournaments: []
			});

			const result = await mergeUsers('reg-1', 'guest-1');

			expect(result.success).toBe(true);
		});
	});

	// ── Edge cases ───────────────────────────────────────────────────────

	describe('edge cases', () => {
		it('participant has partner without userId — should not crash', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('t1', {
				participants: [
					{
						userId: 'source-id',
						name: 'Source',
						partner: { name: 'Partner Without UserId' }
					}
				]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			expect(result.tournamentsUpdated).toBe(1);
			const tournamentUpdate = lastSetDocCall('tournaments/t1');
			const p = tournamentUpdate.data.participants[0];
			expect(p.userId).toBe('target-id');
			// Partner without userId should remain unchanged
			expect(p.partner.name).toBe('Partner Without UserId');
			expect(p.partner.userId).toBeUndefined();
		});

		it('participant has no partner field at all', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('t1', {
				participants: [{ userId: 'source-id', name: 'Source' }]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			const tournamentUpdate = lastSetDocCall('tournaments/t1');
			expect(tournamentUpdate.data.participants[0].userId).toBe('target-id');
		});

		it('source appears in shared/duplicate tournament — only source records transferred', async () => {
			// Both users participated in the same tournament
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [
					{ tournamentId: 'shared-t', rankingDelta: 10, finalPosition: 5 }
				]
			});
			mockUsers.set('target-id', {
				playerName: 'Target',
				tournaments: [
					{ tournamentId: 'shared-t', rankingDelta: 20, finalPosition: 2 }
				]
			});
			mockTournaments.set('shared-t', {
				participants: [
					{ userId: 'source-id', name: 'Source' },
					{ userId: 'target-id', name: 'Target' }
				]
			});

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			// Tournament dedup: target's version kept
			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate.data.tournaments).toHaveLength(1);
			expect(targetUpdate.data.tournaments[0].rankingDelta).toBe(20); // target's

			// Tournament doc updated: source participant now points to target
			const tournamentUpdate = lastSetDocCall('tournaments/shared-t');
			expect(tournamentUpdate.data.participants[0].userId).toBe('target-id');
		});

		it('source has many tournaments (10+) — all processed', async () => {
			const tournaments = Array.from({ length: 12 }, (_, i) => ({
				tournamentId: `t-${i}`
			}));
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });

			// Create matching tournament docs
			for (let i = 0; i < 12; i++) {
				mockTournaments.set(`t-${i}`, {
					participants: [{ userId: 'source-id', name: 'Source' }]
				});
			}

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			expect(result.tournamentsUpdated).toBe(12);
			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate.data.tournaments).toHaveLength(12);
		});

		it('merging into a user that already has multiple mergedFrom entries', async () => {
			mockUsers.set('source-id', { playerName: 'Source', tournaments: [] });
			mockUsers.set('target-id', {
				playerName: 'Target',
				mergedFrom: ['old-1', 'old-2', 'old-3'],
				tournaments: []
			});

			await mergeUsers('source-id', 'target-id');

			const targetUpdate = lastSetDocCall('users/target-id');
			expect(targetUpdate.data.mergedFrom).toEqual([
				'old-1',
				'old-2',
				'old-3',
				'source-id'
			]);
		});

		it('tournament doc has no participants field', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [{ tournamentId: 't1' }]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });
			mockTournaments.set('t1', { name: 'Tournament without participants' });

			const result = await mergeUsers('source-id', 'target-id');

			expect(result.success).toBe(true);
			expect(result.tournamentsUpdated).toBe(0);
		});

		it('returns tournamentsUpdated count correctly across multiple tournaments', async () => {
			mockUsers.set('source-id', {
				playerName: 'Source',
				tournaments: [
					{ tournamentId: 't1' },
					{ tournamentId: 't2' },
					{ tournamentId: 't3' }
				]
			});
			mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });

			mockTournaments.set('t1', {
				participants: [{ userId: 'source-id', name: 'S' }]
			});
			// t2 does not exist in Firestore (deleted)
			mockTournaments.set('t3', {
				participants: [{ userId: 'someone-else', name: 'X' }]
			});

			const result = await mergeUsers('source-id', 'target-id');

			// t1: updated (has source), t2: skipped (deleted), t3: not updated (no source in participants)
			expect(result.tournamentsUpdated).toBe(1);
		});

		it('uses merge:true for setDoc calls (does not overwrite other fields)', async () => {
			mockUsers.set('source-id', { playerName: 'Source', tournaments: [] });
			mockUsers.set('target-id', {
				playerName: 'Target',
				email: 'target@example.com',
				tournaments: []
			});

			await mergeUsers('source-id', 'target-id');

			// Check that setDoc was called with merge: true
			const targetCalls = findSetDocCall('users/target-id');
			expect(targetCalls.length).toBeGreaterThan(0);
			expect(targetCalls[0].options).toEqual({ merge: true });

			const sourceCalls = findSetDocCall('users/source-id');
			expect(sourceCalls.length).toBeGreaterThan(0);
			expect(sourceCalls[0].options).toEqual({ merge: true });
		});
	});
});

// ─── disableUser ──────────────────────────────────────────────────────────────

describe('disableUser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCurrentUser = { id: 'admin-user' };
	});

	it('calls disableUser Cloud Function with correct userId', async () => {
		const { disableUser } = await import('./admin');
		const innerFn = vi.fn().mockResolvedValue({ data: { success: true } });
		const { httpsCallable } = await import('firebase/functions');
		vi.mocked(httpsCallable).mockReturnValue(innerFn as any);

		const result = await disableUser('target-user-id');

		expect(vi.mocked(httpsCallable)).toHaveBeenCalledWith(expect.anything(), 'disableUser');
		expect(innerFn).toHaveBeenCalledWith({ userId: 'target-user-id' });
		expect(result).toBe(true);
	});

	it('returns false if not authenticated', async () => {
		mockCurrentUser = null;
		const { disableUser } = await import('./admin');
		const { httpsCallable } = await import('firebase/functions');

		const result = await disableUser('target-user-id');
		expect(result).toBe(false);
		expect(vi.mocked(httpsCallable)).not.toHaveBeenCalled();
	});

	it('returns false and logs error if Cloud Function throws', async () => {
		const { disableUser } = await import('./admin');
		const innerFn = vi.fn().mockRejectedValue(new Error('permission-denied'));
		const { httpsCallable } = await import('firebase/functions');
		vi.mocked(httpsCallable).mockReturnValue(innerFn as any);

		const result = await disableUser('target-user-id');
		expect(result).toBe(false);
	});
});

// ─── enableUser ───────────────────────────────────────────────────────────────

describe('enableUser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCurrentUser = { id: 'admin-user' };
	});

	it('calls enableUser Cloud Function with correct userId', async () => {
		const { enableUser } = await import('./admin');
		const innerFn = vi.fn().mockResolvedValue({ data: { success: true } });
		const { httpsCallable } = await import('firebase/functions');
		vi.mocked(httpsCallable).mockReturnValue(innerFn as any);

		const result = await enableUser('target-user-id');

		expect(vi.mocked(httpsCallable)).toHaveBeenCalledWith(expect.anything(), 'enableUser');
		expect(innerFn).toHaveBeenCalledWith({ userId: 'target-user-id' });
		expect(result).toBe(true);
	});

	it('returns false if Cloud Function throws', async () => {
		const { enableUser } = await import('./admin');
		const innerFn = vi.fn().mockRejectedValue(new Error('internal'));
		const { httpsCallable } = await import('firebase/functions');
		vi.mocked(httpsCallable).mockReturnValue(innerFn as any);

		const result = await enableUser('target-user-id');
		expect(result).toBe(false);
	});
});
