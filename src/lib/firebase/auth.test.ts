/**
 * Tests for src/lib/firebase/auth.ts
 *
 * Covers:
 * - isGmailDomain helper
 * - signInWithEmail: Gmail rejection, EMAIL_NOT_VERIFIED enforcement, email normalization
 * - signUpWithEmail: email normalization, sendEmailVerification rollback
 * - signOut: complete store cleanup, FCM-safe (no propagation if FCM throws)
 * - initAuthListener: unverified password-provider user kept as currentUser=null,
 *                      no listener accumulation on re-init
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// ─── Mocks (hoisted before all imports) ─────────────────────────────────────

// Override $app/environment alias so browser = true
vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
	auth: {},
	db: {},
	isFirebaseEnabled: () => true
}));

vi.mock('$lib/paraglide/runtime.js', () => ({ setLocale: vi.fn() }));

vi.mock('./messaging', () => ({
	deleteAllFCMTokens: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/statsCache', () => ({
	statsCache: { set: vi.fn() }
}));

vi.mock('$lib/stores/tournamentContext', () => ({
	clearTournamentContext: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
	doc: vi.fn(),
	getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined })
}));

vi.mock('firebase/auth', () => ({
	GoogleAuthProvider: vi.fn(),
	signInWithPopup: vi.fn(),
	createUserWithEmailAndPassword: vi.fn(),
	signInWithEmailAndPassword: vi.fn(),
	sendEmailVerification: vi.fn().mockResolvedValue(undefined),
	sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
	signOut: vi.fn().mockResolvedValue(undefined),
	onAuthStateChanged: vi.fn()
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import {
	isGmailDomain,
	signInWithEmail,
	signUpWithEmail,
	signOut,
	initAuthListener,
	disposeAuthListener,
	currentUser,
	emailVerificationPending,
	needsProfileSetup
} from './auth';
import {
	createUserWithEmailAndPassword,
	signInWithEmailAndPassword,
	sendEmailVerification,
	signOut as firebaseSignOut,
	onAuthStateChanged
} from 'firebase/auth';
import { deleteAllFCMTokens } from './messaging';
import { statsCache } from '$lib/stores/statsCache';
import { clearTournamentContext } from '$lib/stores/tournamentContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetStores() {
	currentUser.set(null);
	emailVerificationPending.set(false);
	needsProfileSetup.set(false);
}

// ─── isGmailDomain ───────────────────────────────────────────────────────────

describe('isGmailDomain', () => {
	it('returns true for @gmail.com', () => {
		expect(isGmailDomain('user@gmail.com')).toBe(true);
	});

	it('returns true for @googlemail.com', () => {
		expect(isGmailDomain('user@googlemail.com')).toBe(true);
	});

	it('is case-insensitive — @Gmail.com and @GMAIL.COM are Gmail', () => {
		expect(isGmailDomain('user@Gmail.com')).toBe(true);
		expect(isGmailDomain('user@GMAIL.COM')).toBe(true);
		expect(isGmailDomain('user@GoogleMail.com')).toBe(true);
	});

	it('returns false for non-Gmail domains', () => {
		expect(isGmailDomain('user@example.com')).toBe(false);
		expect(isGmailDomain('user@outlook.com')).toBe(false);
		expect(isGmailDomain('user@yahoo.com')).toBe(false);
		expect(isGmailDomain('user@scorekinole.com')).toBe(false);
	});

	it('returns false for empty string', () => {
		expect(isGmailDomain('')).toBe(false);
	});

	it('returns false for malformed input without @', () => {
		expect(isGmailDomain('gmail.com')).toBe(false);
		expect(isGmailDomain('invalid')).toBe(false);
	});
});

// ─── signInWithEmail ──────────────────────────────────────────────────────────

describe('signInWithEmail', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetStores();
	});

	it('throws GMAIL_USE_GOOGLE_SIGNIN for @gmail.com accounts without calling Firebase', async () => {
		await expect(signInWithEmail('user@gmail.com', 'pass')).rejects.toMatchObject({
			code: 'GMAIL_USE_GOOGLE_SIGNIN'
		});
		expect(vi.mocked(signInWithEmailAndPassword)).not.toHaveBeenCalled();
	});

	it('throws GMAIL_USE_GOOGLE_SIGNIN for @googlemail.com accounts', async () => {
		await expect(signInWithEmail('user@googlemail.com', 'pass')).rejects.toMatchObject({
			code: 'GMAIL_USE_GOOGLE_SIGNIN'
		});
	});

	it('throws EMAIL_NOT_VERIFIED when emailVerified=false, does NOT set currentUser', async () => {
		vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
			user: {
				uid: 'u1',
				email: 'test@example.com',
				emailVerified: false,
				displayName: null,
				photoURL: null,
				providerData: [{ providerId: 'password' }]
			}
		} as any);

		await expect(signInWithEmail('test@example.com', 'pass')).rejects.toMatchObject({
			code: 'EMAIL_NOT_VERIFIED'
		});

		expect(get(currentUser)).toBeNull();
		expect(get(emailVerificationPending)).toBe(true);
	});

	it('normalizes email (trim + lowercase) before calling Firebase', async () => {
		vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
			user: {
				uid: 'u1',
				email: 'user@example.com',
				emailVerified: true,
				displayName: 'User',
				photoURL: null,
				providerData: []
			}
		} as any);

		await signInWithEmail('  USER@EXAMPLE.COM  ', 'pass');

		expect(vi.mocked(signInWithEmailAndPassword)).toHaveBeenCalledWith(
			expect.anything(),
			'user@example.com',
			'pass'
		);
	});

	it('sets currentUser on successful verified sign-in', async () => {
		vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
			user: {
				uid: 'u1',
				email: 'user@example.com',
				emailVerified: true,
				displayName: 'Test User',
				photoURL: null,
				providerData: []
			}
		} as any);

		const user = await signInWithEmail('user@example.com', 'pass');

		expect(user.id).toBe('u1');
		expect(get(currentUser)).not.toBeNull();
		expect(get(currentUser)?.id).toBe('u1');
	});
});

// ─── signUpWithEmail ──────────────────────────────────────────────────────────

describe('signUpWithEmail', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Restore default implementations that may have been overridden in previous tests
		vi.mocked(sendEmailVerification).mockResolvedValue(undefined);
		resetStores();
	});

	it('normalizes email (trim + lowercase) before calling Firebase', async () => {
		const mockDelete = vi.fn().mockResolvedValue(undefined);
		vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
			user: { uid: 'u1', email: 'user@example.com', delete: mockDelete }
		} as any);

		await signUpWithEmail('  USER@EXAMPLE.COM  ', 'Password1');

		expect(vi.mocked(createUserWithEmailAndPassword)).toHaveBeenCalledWith(
			expect.anything(),
			'user@example.com',
			'Password1'
		);
	});

	it('deletes Auth user if sendEmailVerification fails (rollback)', async () => {
		const mockDelete = vi.fn().mockResolvedValue(undefined);
		vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
			user: { uid: 'u1', email: 'test@example.com', delete: mockDelete }
		} as any);
		vi.mocked(sendEmailVerification).mockRejectedValue(new Error('network error'));

		await expect(signUpWithEmail('test@example.com', 'Password1')).rejects.toThrow('network error');

		expect(mockDelete).toHaveBeenCalled();
	});

	it('does NOT set currentUser after sign-up (leaves it to onAuthStateChanged)', async () => {
		const mockDelete = vi.fn();
		vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
			user: { uid: 'u1', email: 'test@example.com', delete: mockDelete }
		} as any);

		await signUpWithEmail('test@example.com', 'Password1');

		// currentUser should stay null — the onAuthStateChanged listener will
		// keep it null because emailVerified=false.
		expect(get(currentUser)).toBeNull();
		expect(get(emailVerificationPending)).toBe(true);
	});

	it('throws GMAIL_USE_GOOGLE_SIGNIN for Gmail without calling Firebase', async () => {
		await expect(signUpWithEmail('user@gmail.com', 'pass')).rejects.toMatchObject({
			code: 'GMAIL_USE_GOOGLE_SIGNIN'
		});
		expect(vi.mocked(createUserWithEmailAndPassword)).not.toHaveBeenCalled();
	});
});

// ─── signOut ─────────────────────────────────────────────────────────────────

describe('signOut', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(firebaseSignOut).mockResolvedValue(undefined);
		vi.mocked(deleteAllFCMTokens).mockResolvedValue(undefined);
		resetStores();
	});

	it('clears currentUser, emailVerificationPending, and needsProfileSetup', async () => {
		currentUser.set({ id: 'u1', name: 'Test', email: 'test@example.com', photoURL: null, providerPhotoURL: null });
		emailVerificationPending.set(true);
		needsProfileSetup.set(true);

		await signOut();

		expect(get(currentUser)).toBeNull();
		expect(get(emailVerificationPending)).toBe(false);
		expect(get(needsProfileSetup)).toBe(false);
	});

	it('clears statsCache and tournamentContext on sign-out', async () => {
		await signOut();

		expect(vi.mocked(statsCache.set)).toHaveBeenCalledWith(null);
		expect(vi.mocked(clearTournamentContext)).toHaveBeenCalled();
	});

	it('still calls firebaseSignOut and clears stores even if deleteAllFCMTokens throws', async () => {
		vi.mocked(deleteAllFCMTokens).mockRejectedValue(new Error('FCM error'));

		await expect(signOut()).resolves.toBeUndefined();

		expect(vi.mocked(firebaseSignOut)).toHaveBeenCalled();
		expect(get(currentUser)).toBeNull();
		expect(vi.mocked(statsCache.set)).toHaveBeenCalledWith(null);
	});
});

// ─── initAuthListener ────────────────────────────────────────────────────────

describe('initAuthListener', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		disposeAuthListener(); // reset module-level authUnsubscribe
		resetStores();
	});

	it('keeps currentUser=null and sets emailVerificationPending=true for password provider with emailVerified=false', async () => {
		const unverifiedUser = {
			uid: 'u1',
			email: 'test@example.com',
			emailVerified: false,
			displayName: null,
			photoURL: null,
			providerData: [{ providerId: 'password' }]
		};

		let capturedCallback: ((user: any) => Promise<void>) | null = null;
		vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
			capturedCallback = cb;
			return vi.fn();
		});

		initAuthListener();
		expect(capturedCallback).not.toBeNull();

		await capturedCallback!(unverifiedUser);

		expect(get(currentUser)).toBeNull();
		expect(get(emailVerificationPending)).toBe(true);
	});

	it('sets currentUser for Google provider user regardless of emailVerified', async () => {
		const googleUser = {
			uid: 'g1',
			email: 'user@gmail.com',
			emailVerified: true,
			displayName: 'Google User',
			photoURL: null,
			providerData: [{ providerId: 'google.com' }]
		};

		// getDoc returns no profile doc
		const { getDoc } = await import('firebase/firestore');
		vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => undefined } as any);

		let capturedCallback: ((user: any) => Promise<void>) | null = null;
		vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
			capturedCallback = cb;
			return vi.fn();
		});

		initAuthListener();
		await capturedCallback!(googleUser);

		expect(get(currentUser)).not.toBeNull();
		expect(get(currentUser)?.id).toBe('g1');
	});

	it('sets currentUser=null and clears all flags when Firebase user is null (sign-out event)', async () => {
		currentUser.set({ id: 'u1', name: 'Test', email: 't@t.com', photoURL: null, providerPhotoURL: null });
		emailVerificationPending.set(true);
		needsProfileSetup.set(true);

		let capturedCallback: ((user: any) => Promise<void>) | null = null;
		vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
			capturedCallback = cb;
			return vi.fn();
		});

		initAuthListener();
		await capturedCallback!(null);

		expect(get(currentUser)).toBeNull();
		expect(get(emailVerificationPending)).toBe(false);
		expect(get(needsProfileSetup)).toBe(false);
	});

	it('disposes the first listener when called a second time (no listener accumulation)', () => {
		const firstUnsubscribe = vi.fn();
		const secondUnsubscribe = vi.fn();

		vi.mocked(onAuthStateChanged)
			.mockReturnValueOnce(firstUnsubscribe)
			.mockReturnValueOnce(secondUnsubscribe);

		initAuthListener();
		initAuthListener(); // second call should unsubscribe the first

		expect(firstUnsubscribe).toHaveBeenCalledTimes(1);
		expect(vi.mocked(onAuthStateChanged)).toHaveBeenCalledTimes(2);
	});
});
