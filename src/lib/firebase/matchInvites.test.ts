import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Hoisted mutable state — shared between mocks and tests
// ─────────────────────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
	/** In-memory Firestore document store: id → document data */
	const store = new Map<string, Record<string, any>>();
	let idCounter = 0;

	return {
		store,
		get idCounter() {
			return idCounter;
		},
		nextId: () => `auto-id-${++idCounter}`,
		resetStore: () => {
			store.clear();
			idCounter = 0;
		},
		/** Controls what get(currentUser) returns */
		currentUser: { id: 'host-user', name: 'Host' } as { id: string; name: string } | null,
		/** Toggle browser / firebase enabled for integration tests */
		browserEnabled: false,
		firebaseEnabled: false
	};
});

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — must be before imports of the module under test
// vi.mock factories are hoisted, so all definitions must be self-contained.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('./config', () => ({
	get db() {
		return hoisted.firebaseEnabled ? {} : null;
	},
	isFirebaseEnabled: () => hoisted.firebaseEnabled
}));
vi.mock('./auth', () => ({
	currentUser: {
		subscribe: (fn: (v: any) => void) => {
			fn(hoisted.currentUser);
			return () => {};
		}
	}
}));
vi.mock('$app/environment', () => ({
	get browser() {
		return hoisted.browserEnabled;
	}
}));
vi.mock('firebase/firestore', () => {
	// Timestamp must be a real class so `instanceof` checks work in the source
	class Timestamp {
		private _ms: number;
		constructor(ms: number) {
			this._ms = ms;
		}
		toMillis() {
			return this._ms;
		}
		static now() {
			return new Timestamp(Date.now());
		}
		static fromMillis(ms: number) {
			return new Timestamp(ms);
		}
	}

	// ── In-memory Firestore simulation ──────────────────────────────

	const where = (field: string, _op: string, value: any) => ({ field, op: _op, value });

	const collection = (_db: any, path: string) => ({ __type: 'collectionRef', path });

	const doc = (...args: any[]) => {
		if (args.length >= 3) {
			// doc(db, 'matchInvites', id)
			return { __type: 'docRef', id: args[2] };
		}
		// doc(collectionRef) — auto-generate ID
		return { __type: 'docRef', id: hoisted.nextId() };
	};

	const query = (ref: any, ...constraints: any[]) => ({ ref, constraints });

	const getDocs = async (q: any) => {
		const allEntries = Array.from(hoisted.store.entries());

		const filtered = allEntries.filter(([_id, data]) => {
			return q.constraints.every((c: any) => {
				const val = data[c.field];
				if (c.op === '==') return val === c.value;
				return true;
			});
		});

		return {
			empty: filtered.length === 0,
			size: filtered.length,
			docs: filtered.map(([id, data]) => ({
				id,
				data: () => ({ ...data })
			}))
		};
	};

	const getDoc = async (ref: any) => {
		const data = hoisted.store.get(ref.id);
		return {
			exists: () => !!data,
			id: ref.id,
			data: () => (data ? { ...data } : undefined)
		};
	};

	const setDoc = async (ref: any, data: any) => {
		hoisted.store.set(ref.id, { ...data });
	};

	const updateDoc = async (ref: any, updates: any) => {
		const existing = hoisted.store.get(ref.id);
		if (existing) {
			hoisted.store.set(ref.id, { ...existing, ...updates });
		}
	};

	const deleteDoc = async (ref: any) => {
		hoisted.store.delete(ref.id);
	};

	const onSnapshot = vi.fn();

	const runTransaction = async (_db: any, fn: (tx: any) => Promise<any>) => {
		// Simple transaction mock — no real isolation
		const tx = {
			get: async (ref: any) => getDoc(ref).then((snap) => snap),
			update: (ref: any, updates: any) => {
				const existing = hoisted.store.get(ref.id);
				if (existing) {
					hoisted.store.set(ref.id, { ...existing, ...updates });
				}
			},
			set: (ref: any, data: any) => {
				hoisted.store.set(ref.id, { ...data });
			}
		};
		return fn(tx);
	};

	return {
		collection,
		doc,
		setDoc,
		getDoc,
		updateDoc,
		deleteDoc,
		query,
		where,
		getDocs,
		onSnapshot,
		runTransaction,
		Timestamp
	};
});
vi.mock('$lib/constants', () => ({
	PRODUCTION_URL: 'https://scorekinole.web.app'
}));

import {
	generateInviteCode,
	isInviteExpired,
	getInviteTimeRemaining,
	getInviteUrl,
	createInvite,
	acceptInvite,
	getInviteByCode,
	cancelInvite,
	deleteInvite
} from './matchInvites';
import { Timestamp } from 'firebase/firestore';
import type { CreateInviteData, InviteType } from '$lib/types/matchInvite';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** The exact character set used in the source code */
const ALLOWED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeInvite(overrides: Record<string, unknown> = {}) {
	return {
		id: 'inv1',
		inviteCode: 'ABC123',
		status: 'pending',
		expiresAt: Date.now() + 60000,
		hostUserId: 'u1',
		hostUserName: 'Alice',
		hostTeamNumber: 1,
		inviteType: 'opponent',
		...overrides
	} as any;
}

function makeCreateData(overrides: Partial<CreateInviteData> = {}): CreateInviteData {
	return {
		hostUserId: 'host-user',
		hostUserName: 'Host',
		hostUserPhotoURL: null,
		hostTeamNumber: 1,
		inviteType: 'opponent',
		matchContext: {
			team1Name: 'Team 1',
			team1Color: '#ff0000',
			team2Name: 'Team 2',
			team2Color: '#0000ff',
			gameMode: 'points',
			pointsToWin: 100,
			roundsToPlay: 4,
			matchesToWin: 1,
			gameType: 'singles'
		},
		...overrides
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure function tests (no Firebase needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('generateInviteCode', () => {
	it('returns a string of exactly 6 characters', () => {
		const code = generateInviteCode();
		expect(code).toHaveLength(6);
	});

	it('only contains characters from the allowed set', () => {
		for (let i = 0; i < 50; i++) {
			const code = generateInviteCode();
			for (const ch of code) {
				expect(ALLOWED_CHARS).toContain(ch);
			}
		}
	});

	it('never includes the ambiguous characters O, 0, I, or 1', () => {
		const forbidden = ['O', '0', 'I', '1'];
		for (let i = 0; i < 100; i++) {
			const code = generateInviteCode();
			for (const ch of forbidden) {
				expect(code).not.toContain(ch);
			}
		}
	});

	it('generates 100 unique codes (collision probability is negligible)', () => {
		const codes = new Set<string>();
		for (let i = 0; i < 100; i++) {
			codes.add(generateInviteCode());
		}
		expect(codes.size).toBe(100);
	});
});

describe('isInviteExpired', () => {
	it('returns false when expiresAt is in the future', () => {
		const invite = makeInvite({ expiresAt: Date.now() + 60_000 });
		expect(isInviteExpired(invite)).toBe(false);
	});

	it('returns true when expiresAt is in the past', () => {
		const invite = makeInvite({ expiresAt: Date.now() - 1_000 });
		expect(isInviteExpired(invite)).toBe(true);
	});

	it('returns true when expiresAt is missing (undefined)', () => {
		const invite = makeInvite({ expiresAt: undefined });
		expect(isInviteExpired(invite)).toBe(true);
	});

	it('returns true when expiresAt is null', () => {
		const invite = makeInvite({ expiresAt: null });
		expect(isInviteExpired(invite)).toBe(true);
	});

	it('works with plain number timestamps (not Firestore Timestamp)', () => {
		const futureMs = Date.now() + 300_000;
		const invite = makeInvite({ expiresAt: futureMs });
		expect(isInviteExpired(invite)).toBe(false);

		const pastMs = Date.now() - 300_000;
		const invite2 = makeInvite({ expiresAt: pastMs });
		expect(isInviteExpired(invite2)).toBe(true);
	});

	it('works with Firestore Timestamp objects (instanceof path)', () => {
		const futureTs = Timestamp.fromMillis(Date.now() + 120_000);
		const invite = makeInvite({ expiresAt: futureTs });
		expect(isInviteExpired(invite)).toBe(false);

		const pastTs = Timestamp.fromMillis(Date.now() - 120_000);
		const invite2 = makeInvite({ expiresAt: pastTs });
		expect(isInviteExpired(invite2)).toBe(true);
	});
});

describe('getInviteTimeRemaining', () => {
	it('returns a positive number of milliseconds when invite is not expired', () => {
		const invite = makeInvite({ expiresAt: Date.now() + 30_000 });
		const remaining = getInviteTimeRemaining(invite);
		expect(remaining).toBeGreaterThan(0);
		expect(remaining).toBeLessThanOrEqual(30_000);
	});

	it('returns 0 when the invite is expired (never returns negative)', () => {
		const invite = makeInvite({ expiresAt: Date.now() - 10_000 });
		expect(getInviteTimeRemaining(invite)).toBe(0);
	});

	it('returns 0 when expiresAt is missing', () => {
		const invite = makeInvite({ expiresAt: undefined });
		expect(getInviteTimeRemaining(invite)).toBe(0);
	});

	it('returns 0 when expiresAt is null', () => {
		const invite = makeInvite({ expiresAt: null });
		expect(getInviteTimeRemaining(invite)).toBe(0);
	});

	it('works with Firestore Timestamp objects (instanceof path)', () => {
		const futureTs = Timestamp.fromMillis(Date.now() + 45_000);
		const invite = makeInvite({ expiresAt: futureTs });
		const remaining = getInviteTimeRemaining(invite);
		expect(remaining).toBeGreaterThan(0);
		expect(remaining).toBeLessThanOrEqual(45_000);
	});
});

describe('getInviteUrl', () => {
	it('returns the production URL with the invite code as a query parameter', () => {
		expect(getInviteUrl('ABC123')).toBe('https://scorekinole.web.app/join?invite=ABC123');
	});

	it('preserves the exact case of the provided invite code', () => {
		expect(getInviteUrl('xYz789')).toBe('https://scorekinole.web.app/join?invite=xYz789');
	});

	it('works with an empty string (edge case)', () => {
		expect(getInviteUrl('')).toBe('https://scorekinole.web.app/join?invite=');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests — in-memory Firestore mock
// ─────────────────────────────────────────────────────────────────────────────

describe('createInvite + cancelPendingInvitesForUser (doubles bugs)', () => {
	beforeEach(() => {
		hoisted.resetStore();
		hoisted.browserEnabled = true;
		hoisted.firebaseEnabled = true;
		hoisted.currentUser = { id: 'host-user', name: 'Host' };
	});

	afterEach(() => {
		hoisted.browserEnabled = false;
		hoisted.firebaseEnabled = false;
	});

	it('creates an invite and stores it with status pending', async () => {
		const invite = await createInvite(makeCreateData({ inviteType: 'opponent' }));

		expect(invite).not.toBeNull();
		expect(invite!.status).toBe('pending');
		expect(invite!.inviteType).toBe('opponent');
		expect(invite!.inviteCode).toHaveLength(6);
	});

	it('creating 3 invites of different types should all coexist', async () => {
		const inv1 = await createInvite(makeCreateData({ inviteType: 'opponent' }));
		const inv2 = await createInvite(makeCreateData({ inviteType: 'my_partner' }));
		const inv3 = await createInvite(makeCreateData({ inviteType: 'opponent_partner' }));

		expect(inv1).not.toBeNull();
		expect(inv2).not.toBeNull();
		expect(inv3).not.toBeNull();

		// All 3 should remain pending — the bug causes inv1 and inv2 to be cancelled
		const doc1 = hoisted.store.get(inv1!.id);
		const doc2 = hoisted.store.get(inv2!.id);
		const doc3 = hoisted.store.get(inv3!.id);

		expect(doc1.status).toBe('pending');
		expect(doc2.status).toBe('pending');
		expect(doc3.status).toBe('pending');
	});

	it('creating new invite of SAME type cancels only that type', async () => {
		const inv1 = await createInvite(makeCreateData({ inviteType: 'opponent' }));
		const inv2 = await createInvite(makeCreateData({ inviteType: 'my_partner' }));
		// Create another opponent invite — should cancel inv1 but NOT inv2
		const inv3 = await createInvite(makeCreateData({ inviteType: 'opponent' }));

		expect(inv1).not.toBeNull();
		expect(inv2).not.toBeNull();
		expect(inv3).not.toBeNull();

		const doc1 = hoisted.store.get(inv1!.id);
		const doc2 = hoisted.store.get(inv2!.id);
		const doc3 = hoisted.store.get(inv3!.id);

		expect(doc1.status).toBe('cancelled'); // old opponent → replaced
		expect(doc2.status).toBe('pending'); // my_partner → untouched
		expect(doc3.status).toBe('pending'); // new opponent → active
	});

	it('re-invite after accept: accepted invite is preserved', async () => {
		// Create my_partner invite
		const inv1 = await createInvite(makeCreateData({ inviteType: 'my_partner' }));
		expect(inv1).not.toBeNull();

		// Simulate acceptance — set status directly in store
		hoisted.store.set(inv1!.id, {
			...hoisted.store.get(inv1!.id),
			status: 'accepted',
			guestUserId: 'guest-1'
		});

		// Now create opponent invite — my_partner (accepted) should NOT be touched
		const inv2 = await createInvite(makeCreateData({ inviteType: 'opponent' }));
		expect(inv2).not.toBeNull();

		const doc1 = hoisted.store.get(inv1!.id);
		const doc2 = hoisted.store.get(inv2!.id);

		expect(doc1.status).toBe('accepted'); // accepted → untouched
		expect(doc2.status).toBe('pending'); // new opponent → active
	});

	it('cancelled invite is not returned by getInviteByCode when status != pending', async () => {
		const inv = await createInvite(makeCreateData({ inviteType: 'opponent' }));
		expect(inv).not.toBeNull();

		// Cancel the invite
		hoisted.store.set(inv!.id, { ...hoisted.store.get(inv!.id), status: 'cancelled' });

		// getInviteByCode should still find it (it returns any status)
		const found = await getInviteByCode(inv!.inviteCode);
		expect(found).not.toBeNull();
		expect(found!.status).toBe('cancelled');
	});

	it('deleted invite returns null on code lookup', async () => {
		const inv = await createInvite(makeCreateData({ inviteType: 'opponent' }));
		expect(inv).not.toBeNull();

		// Delete the invite from store
		hoisted.store.delete(inv!.id);

		const found = await getInviteByCode(inv!.inviteCode);
		expect(found).toBeNull();
	});

	it('all 3 invite types get unique codes', async () => {
		const inv1 = await createInvite(makeCreateData({ inviteType: 'opponent' }));
		const inv2 = await createInvite(makeCreateData({ inviteType: 'my_partner' }));
		const inv3 = await createInvite(makeCreateData({ inviteType: 'opponent_partner' }));

		const codes = new Set([inv1!.inviteCode, inv2!.inviteCode, inv3!.inviteCode]);
		expect(codes.size).toBe(3);
	});

	it('returns null when Firebase is disabled', async () => {
		hoisted.firebaseEnabled = false;
		const inv = await createInvite(makeCreateData());
		expect(inv).toBeNull();
	});

	it('returns null when no user is authenticated', async () => {
		hoisted.currentUser = null;
		const inv = await createInvite(makeCreateData());
		expect(inv).toBeNull();
	});
});

// Import afterEach at the top level
import { afterEach } from 'vitest';
