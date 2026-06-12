/**
 * saveUserProfile — photoURL semantics regression tests.
 *
 * Bug: every profile save (name/country edit) rewrote `photoURL` from the
 * in-memory currentUser store. A custom photo uploaded from another
 * device/session (persisted directly by uploadAvatar) was overwritten with a
 * stale value on the next unrelated edit.
 *
 * Fixed behavior: photoURL is seeded from the auth provider ONLY at profile
 * creation; updates never touch it (uploadAvatar/deleteAvatar own that field).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
  db: {},
  auth: { currentUser: { providerData: [{ providerId: 'google.com' }] } },
  isFirebaseEnabled: () => true
}));

// auth.ts (imported for the currentUser store) pulls these in transitively
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
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` })),
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

vi.mock('$lib/utils/deviceInfo', () => ({
  getDeviceInfo: vi.fn(async () => ({ ip: '1.2.3.4', fingerprint: 'fp-test-12345678' }))
}));

const { currentUser } = await import('./auth');
const { saveUserProfile } = await import('./userProfile');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loginAs(photoURL: string | null) {
  currentUser.set({
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.org',
    photoURL,
    providerPhotoURL: photoURL
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Key-uniqueness query: pretend generated keys are always unique
  getDocsMock.mockResolvedValue({ empty: true, docs: [] });
  setDocMock.mockResolvedValue(undefined);
  currentUser.set(null);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('saveUserProfile photoURL semantics', () => {
  it('NEW profile: seeds photoURL from the auth provider', async () => {
    loginAs('https://provider/photo.jpg');
    getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined });

    const result = await saveUserProfile('Nuevo Jugador', { country: 'ES' });

    expect(result).not.toBeNull();
    // Two writes for a new user: the public user doc (first) and the
    // owner-only /private/meta subdoc with device info (see userProfile.privacy.test.ts).
    expect(setDocMock).toHaveBeenCalledTimes(2);
    const payload = setDocMock.mock.calls[0][1];
    expect(payload.photoURL).toBe('https://provider/photo.jpg');
    expect(payload.playerName).toBe('Nuevo Jugador');
    expect(payload.playerNameLower).toBe('nuevo jugador');
    expect(payload.country).toBe('ES');
  });

  it('EXISTING profile: photoURL is NOT in the update payload (custom photo preserved)', async () => {
    // currentUser carries a STALE photo (e.g. loaded before a custom upload
    // happened on another device)
    loginAs('https://provider/stale-photo.jpg');
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ playerName: 'Old Name', key: 'ABC234', photoURL: 'https://storage/custom-photo.jpg' })
    });

    const result = await saveUserProfile('Nombre Nuevo', { country: 'FR' });

    expect(result).not.toBeNull();
    const payload = setDocMock.mock.calls[0][1];
    expect('photoURL' in payload, 'update payload must not touch photoURL').toBe(false);
    expect(payload.playerName).toBe('Nombre Nuevo');
    expect(payload.country).toBe('FR');
    // merge:true so the untouched custom photo survives
    expect(setDocMock.mock.calls[0][2]).toEqual({ merge: true });
  });

  it('trims the player name and lowercases playerNameLower', async () => {
    loginAs(null);
    getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined });

    await saveUserProfile('  María López  ');

    const payload = setDocMock.mock.calls[0][1];
    expect(payload.playerName).toBe('María López');
    expect(payload.playerNameLower).toBe('maría lópez');
  });

  it('returns null without writing when no user is logged in', async () => {
    currentUser.set(null);

    const result = await saveUserProfile('Cualquiera');

    expect(result).toBeNull();
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
