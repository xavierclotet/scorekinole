import { describe, it, expect, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — must be before imports of the module under test
// vi.mock factories are hoisted, so all definitions must be self-contained.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('./config', () => ({
	db: null,
	isFirebaseEnabled: () => false
}));
vi.mock('./auth', () => ({
	currentUser: { subscribe: vi.fn() }
}));
vi.mock('$app/environment', () => ({
	browser: false
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

	return {
		collection: vi.fn(),
		doc: vi.fn(),
		setDoc: vi.fn(),
		getDoc: vi.fn(),
		updateDoc: vi.fn(),
		deleteDoc: vi.fn(),
		query: vi.fn(),
		where: vi.fn(),
		getDocs: vi.fn(),
		onSnapshot: vi.fn(),
		runTransaction: vi.fn(),
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
	getInviteUrl
} from './matchInvites';
import { Timestamp } from 'firebase/firestore';

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

// ─────────────────────────────────────────────────────────────────────────────
// Tests
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
