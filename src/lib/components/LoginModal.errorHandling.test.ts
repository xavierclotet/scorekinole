/**
 * LoginModal — error handling decision logic tests.
 *
 * Pure mirrors of the component's handlers (same pattern as
 * MatchResultDialog.concurrentEdit.test.ts), covering the bugs fixed:
 *  1. EMAIL_NOT_VERIFIED on sign-in must route to the verify-email view
 *     (with resend button), not a dead-end generic error.
 *  2. Reset-password must reject malformed emails BEFORE calling Firebase
 *     (whose anti-enumeration behavior would show "sent" for a typo) and must
 *     redirect Gmail accounts to Google Sign-In.
 *  3. Double-submit guard: handlers ignore re-entry while loading.
 */
import { describe, it, expect, vi } from 'vitest';

// auth.ts transitively imports Firebase + app stores — mock them out so the
// REAL isGmailDomain can be imported (no logic drift in the mirror)
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/firebase/config', () => ({ auth: {}, db: {}, isFirebaseEnabled: () => true }));
vi.mock('$lib/paraglide/runtime.js', () => ({ setLocale: vi.fn() }));
vi.mock('$lib/firebase/messaging', () => ({ deleteAllFCMTokens: vi.fn() }));
vi.mock('$lib/stores/statsCache', () => ({ statsCache: { set: vi.fn() } }));
vi.mock('$lib/stores/tournamentContext', () => ({ clearTournamentContext: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }));
vi.mock('firebase/auth', () => ({
	GoogleAuthProvider: vi.fn(),
	signInWithPopup: vi.fn(),
	createUserWithEmailAndPassword: vi.fn(),
	signInWithEmailAndPassword: vi.fn(),
	sendEmailVerification: vi.fn(),
	sendPasswordResetEmail: vi.fn(),
	signOut: vi.fn(),
	onAuthStateChanged: vi.fn()
}));

import { isGmailDomain } from '$lib/firebase/auth';

// --- Pure mirrors of LoginModal logic ---

type SignInAction =
  | { type: 'go-verify-email'; verifyEmail: string }
  | { type: 'error'; key: string; gmailHint?: boolean };

/** Mirrors handleEmailSignIn's catch block */
function signInErrorAction(errCode: string, email: string): SignInAction {
  if (errCode === 'EMAIL_NOT_VERIFIED') {
    return { type: 'go-verify-email', verifyEmail: email.trim().toLowerCase() };
  }
  if (errCode === 'GMAIL_USE_GOOGLE_SIGNIN') {
    return { type: 'error', key: 'auth_gmailUseGoogleSignIn', gmailHint: true };
  }
  if (errCode === 'auth/invalid-credential' || errCode === 'auth/wrong-password' || errCode === 'auth/user-not-found') {
    return { type: 'error', key: 'auth_invalidCredentials' };
  }
  if (errCode === 'auth/too-many-requests') {
    return { type: 'error', key: 'auth_tooManyAttempts' };
  }
  if (errCode === 'auth/user-disabled') {
    return { type: 'error', key: 'auth_userDisabled' };
  }
  if (errCode === 'auth/network-request-failed') {
    return { type: 'error', key: 'auth_networkError' };
  }
  return { type: 'error', key: 'auth_loginError' };
}

type ResetPrecheck =
  | { ok: true }
  | { ok: false; key: string; gmailHint?: boolean };

/** Mirrors handleResetPassword's pre-validation */
function resetPasswordPrecheck(resetEmail: string): ResetPrecheck {
  if (!/^\S+@\S+\.\S+$/.test(resetEmail.trim())) {
    return { ok: false, key: 'auth_invalidEmailFormat' };
  }
  if (isGmailDomain(resetEmail.trim().toLowerCase())) {
    return { ok: false, key: 'auth_gmailUseGoogleSignIn', gmailHint: true };
  }
  return { ok: true };
}

/** Mirrors the double-submit guard added to every handler */
function shouldProcessSubmit(isLoading: boolean): boolean {
  return !isLoading;
}

// --- Tests ---

describe('sign-in error → action mapping', () => {
  it('EMAIL_NOT_VERIFIED routes to verify-email view with normalized email', () => {
    const action = signInErrorAction('EMAIL_NOT_VERIFIED', '  User@Empresa.COM ');
    expect(action).toEqual({ type: 'go-verify-email', verifyEmail: 'user@empresa.com' });
  });

  it('Gmail accounts get the Google Sign-In hint', () => {
    const action = signInErrorAction('GMAIL_USE_GOOGLE_SIGNIN', 'a@gmail.com');
    expect(action).toEqual({ type: 'error', key: 'auth_gmailUseGoogleSignIn', gmailHint: true });
  });

  it('wrong credentials map to the invalid-credentials message (all 3 Firebase codes)', () => {
    for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) {
      expect(signInErrorAction(code, 'a@b.org')).toEqual({ type: 'error', key: 'auth_invalidCredentials' });
    }
  });

  it('unknown codes fall back to the generic login error', () => {
    expect(signInErrorAction('auth/internal-error', 'a@b.org')).toEqual({ type: 'error', key: 'auth_loginError' });
  });
});

describe('reset-password pre-validation', () => {
  it('rejects malformed emails before calling Firebase', () => {
    for (const bad of ['notanemail', 'a@b', 'a @b.com', '@b.com', 'a@.', '']) {
      const result = resetPasswordPrecheck(bad);
      expect(result.ok, `"${bad}" should be rejected`).toBe(false);
      if (!result.ok) expect(result.key).toBe('auth_invalidEmailFormat');
    }
  });

  it('redirects Gmail/Googlemail accounts to Google Sign-In', () => {
    for (const gmail of ['user@gmail.com', 'User@GMAIL.com', 'x@googlemail.com']) {
      const result = resetPasswordPrecheck(gmail);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.key).toBe('auth_gmailUseGoogleSignIn');
        expect(result.gmailHint).toBe(true);
      }
    }
  });

  it('accepts valid non-Gmail emails (incl. surrounding whitespace)', () => {
    for (const good of ['user@empresa.com', ' user@dominio.es ', 'a.b+c@sub.dominio.org']) {
      expect(resetPasswordPrecheck(good).ok, `"${good}" should pass`).toBe(true);
    }
  });
});

describe('double-submit guard', () => {
  it('ignores submissions while a request is in flight', () => {
    expect(shouldProcessSubmit(true)).toBe(false);
    expect(shouldProcessSubmit(false)).toBe(true);
  });
});
