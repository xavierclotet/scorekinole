/**
 * saveUserProfile — PII isolation regression tests.
 *
 * Security bug: `email`, `registrationIP`, `deviceFingerprint` and the full
 * `deviceInfo` (IP, userAgent, screen, timezone, ...) were written onto the user
 * doc, which is world-readable (`/users/{uid}` has `allow read: if true`). Anyone
 * could enumerate the collection and scrape every user's email, IP and device
 * fingerprint.
 *
 * Fixed behavior: this PII is written to the OWNER-ONLY `/users/{uid}/private/meta`
 * subcollection, never to the public user doc. `email` moves for every save;
 * device info is captured only at registration (new users).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
  db: {},
  auth: { currentUser: { providerData: [{ providerId: 'google.com' }] } },
  isFirebaseEnabled: () => true
}));

vi.mock('$lib/paraglide/runtime.js', () => ({ setLocale: vi.fn() }));
vi.mock('./messaging', () => ({ deleteAllFCMTokens: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/stores/statsCache', () => ({ statsCache: { set: vi.fn() } }));
vi.mock('$lib/stores/tournamentContext', () => ({ clearTournamentContext: vi.fn() }));
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

const getDocMock = vi.fn();
const setDocMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  // Join ALL path segments so public (users/uid) and private
  // (users/uid/private/meta) refs are distinguishable in assertions.
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: vi.fn(),
  where: vi.fn(),
  collection: vi.fn(),
  addDoc: vi.fn(),
  arrayUnion: vi.fn(),
  serverTimestamp: () => 'SERVER_TS',
  runTransaction: vi.fn(),
  limit: vi.fn()
}));

const DEVICE_INFO = {
  ip: '9.9.9.9',
  fingerprint: 'fp-secret-abcd1234',
  userAgent: 'Mozilla/5.0 test',
  screenResolution: '1920x1080',
  timezone: 'Europe/Madrid',
  language: 'es'
};

vi.mock('$lib/utils/deviceInfo', () => ({
  getDeviceInfo: vi.fn(async () => DEVICE_INFO)
}));

const deviceInfoMod = await import('$lib/utils/deviceInfo');
const { currentUser } = await import('./auth');
const { saveUserProfile } = await import('./userProfile');

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fields that must NEVER appear on the world-readable public user doc.
const PII_KEYS = ['registrationIP', 'deviceFingerprint', 'deviceInfo', 'email'];
const DEVICE_KEYS = ['registrationIP', 'deviceFingerprint', 'deviceInfo'];

function publicDocCall() {
  return setDocMock.mock.calls.find((c) => c[0].path === 'users/user-1');
}
function privateMetaCall() {
  return setDocMock.mock.calls.find((c) => c[0].path === 'users/user-1/private/meta');
}

function loginAs() {
  currentUser.set({
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.org',
    photoURL: null,
    providerPhotoURL: null
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getDocsMock.mockResolvedValue({ empty: true, docs: [] });
  setDocMock.mockResolvedValue(undefined);
  currentUser.set(null);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('saveUserProfile PII isolation', () => {
  it('NEW profile: PII is NOT written to the public user doc', async () => {
    loginAs();
    getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined });

    await saveUserProfile('Nuevo Jugador', { country: 'ES' });

    const pub = publicDocCall();
    expect(pub, 'a public user doc must be written').toBeTruthy();
    for (const key of PII_KEYS) {
      expect(key in pub![1], `public user doc must NOT contain ${key}`).toBe(false);
    }
  });

  it('NEW profile: PII goes to the owner-only /private/meta subdoc', async () => {
    loginAs();
    getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined });

    await saveUserProfile('Nuevo Jugador');

    const priv = privateMetaCall();
    expect(priv, 'a /private/meta doc must be written for new users').toBeTruthy();
    const payload = priv![1];
    expect(payload.email).toBe('test@example.org');
    expect(payload.registrationIP).toBe('9.9.9.9');
    expect(payload.deviceFingerprint).toBe('fp-secret-abcd1234');
    expect(payload.deviceInfo).toEqual(DEVICE_INFO);
    // authProvider is duplicated so the Cloud Function fraud-check query can
    // filter within the `private` collection group alone.
    expect(payload.authProvider).toBe('google');
  });

  it('EXISTING profile: email goes to /private/meta, but NO device re-capture', async () => {
    loginAs();
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ playerName: 'Old', key: 'ABC234' })
    });

    await saveUserProfile('Nombre Nuevo', { country: 'FR' });

    // Public doc never carries PII (email included).
    const pub = publicDocCall();
    for (const key of PII_KEYS) {
      expect(key in pub![1], `public user doc must NOT contain ${key}`).toBe(false);
    }

    // Private meta is written for the email, but device info is NOT re-captured
    // for an existing user (no external IP fetch on every edit).
    const priv = privateMetaCall();
    expect(priv, 'existing users still sync email to /private/meta').toBeTruthy();
    expect(priv![1].email).toBe('test@example.org');
    for (const key of DEVICE_KEYS) {
      expect(key in priv![1], `existing-user /private/meta must NOT contain ${key}`).toBe(false);
    }
    expect(deviceInfoMod.getDeviceInfo).not.toHaveBeenCalled();
  });
});
