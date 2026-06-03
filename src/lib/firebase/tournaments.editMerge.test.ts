/**
 * Integration tests for the "admin edits players while registration is open" fix,
 * exercising the REAL Firestore save functions (not just the pure helper) against
 * the optimistic-concurrency mock.
 *
 * Goal: prove that `updateDraftTournamentMergingRegistration` does NOT lose a
 * registration that arrived while the edit wizard was open — including under a
 * genuinely interleaved transaction race — while the OLD `updateTournament`
 * overwrite path demonstrably DID lose it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import type { Tournament, TournamentParticipant, WaitlistEntry } from '$lib/types/tournament';

// ─── Shared mock state ───────────────────────────────────────────────────────

let mockStore: MockFirestore;

// ─── vi.mock setup (must cover everything tournaments.ts pulls in) ─────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) =>
    new MockDocumentReference(`${collection}/${id}`, id),
  runTransaction: (
    _db: unknown,
    callback: (txn: unknown) => Promise<unknown>,
    options?: { maxAttempts?: number }
  ) => mockStore.runTransaction(callback as any, options?.maxAttempts ? options.maxAttempts - 1 : undefined),
  serverTimestamp: () => Date.now(),
  // parseTournamentData uses `instanceof Timestamp` — must be a constructor.
  Timestamp: class {}
}));

vi.mock('./config', () => ({ db: {}, isFirebaseEnabled: () => true }));

vi.mock('./auth', async () => {
  const { writable } = await import('svelte/store');
  return { currentUser: writable({ id: 'admin1', name: 'Admin', email: 'admin@x.com' }) };
});

vi.mock('./admin', () => ({
  isAdmin: async () => true,
  isSuperAdmin: async () => true
}));

vi.mock('./userProfile', () => ({ getUserProfile: async () => ({ key: 'adminkey' }) }));

// ─── Import functions under test (AFTER mocks) ────────────────────────────────

const {
  updateDraftTournamentMergingRegistration,
  updateTournament,
  commitTournamentStartIfRosterUnchanged,
  applyParticipantRankingSnapshots
} = await import('./tournaments');
const { participantIdentityKey } = await import('./tournamentRegistration');

// ─── factories ────────────────────────────────────────────────────────────────

function participant(id: string, overrides: Partial<TournamentParticipant> = {}): TournamentParticipant {
  return { id, type: 'REGISTERED', userId: `user-${id}`, name: `Player ${id}`, rankingSnapshot: 0, status: 'ACTIVE', ...overrides };
}

function makeTournament(participants: TournamentParticipant[], waitlist: WaitlistEntry[] = []): Tournament {
  return {
    id: 't1',
    status: 'DRAFT',
    ownerId: 'admin1',
    participants,
    waitlist,
    registration: { enabled: true, notifyOnRegistration: false, showParticipantList: true },
    name: 'Test',
  } as unknown as Tournament;
}

function seed(t: Tournament) {
  mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);
  mockStore.resetStats();
}

function readParticipants(id = 't1'): TournamentParticipant[] {
  return (mockStore.getDocument(`tournaments/${id}`)!.data.participants as TournamentParticipant[]) || [];
}
function readWaitlist(id = 't1'): WaitlistEntry[] {
  return (mockStore.getDocument(`tournaments/${id}`)!.data.waitlist as WaitlistEntry[]) || [];
}

/** A raw self-registration transaction, mirroring registerForTournament's core write. */
async function concurrentRegister(id: string, newParticipant: TournamentParticipant) {
  await mockStore.runTransaction(async (txn) => {
    const ref = new MockDocumentReference(`tournaments/${id}`, id);
    const snap = await txn.get(ref);
    const data = snap.data() as { participants?: TournamentParticipant[] };
    txn.update(ref, { participants: [...(data.participants || []), newParticipant] });
  });
}

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── the regression: registration must NOT be lost ────────────────────────────

describe('updateDraftTournamentMergingRegistration — no lost registrations', () => {
  it('preserves a registration that arrived before the save (admin snapshot is stale)', async () => {
    // Wizard opened with [a, b].
    const a = participant('a');
    const b = participant('b');
    // c self-registered while the wizard was open → Firestore now [a, b, c].
    const c = participant('c');
    seed(makeTournament([a, b, c]));

    // Admin saves: they only ever saw [a, b], and added guest d by hand.
    const d = participant('d', { type: 'GUEST', userId: undefined });
    const ok = await updateDraftTournamentMergingRegistration(
      't1',
      { name: 'Renamed Tournament' },
      { participantIds: ['a', 'b'], waitlistUserIds: [] },
      [a, b, d],
      []
    );

    expect(ok).toBe(true);
    expect(readParticipants().map(p => p.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    // Config change still applied.
    expect(mockStore.getDocument('tournaments/t1')!.data.name).toBe('Renamed Tournament');
  });

  it('CONTRAST: the old updateTournament overwrite DID lose the concurrent registration', async () => {
    const a = participant('a');
    const b = participant('b');
    const c = participant('c');
    seed(makeTournament([a, b, c]));

    const d = participant('d', { type: 'GUEST', userId: undefined });
    // Old code path: blind overwrite with the stale snapshot + admin's addition.
    const ok = await updateTournament('t1', { participants: [a, b, d] } as Partial<Tournament>);

    expect(ok).toBe(true);
    // c is gone — this is the bug the merge function fixes.
    expect(readParticipants().map(p => p.id)).not.toContain('c');
    expect(readParticipants().map(p => p.id).sort()).toEqual(['a', 'b', 'd']);
  });

  it('survives a genuinely interleaved race (save || registration) — both preserved', async () => {
    const a = participant('a');
    const b = participant('b');
    seed(makeTournament([a, b]));

    const c = participant('c'); // registers concurrently
    const d = participant('d', { type: 'GUEST', userId: undefined }); // admin adds by hand

    // Fire the admin save and a self-registration at the same time. Whichever
    // commits second must re-read the merged state — neither write may be lost.
    const [saveOk] = await Promise.all([
      updateDraftTournamentMergingRegistration(
        't1',
        {},
        { participantIds: ['a', 'b'], waitlistUserIds: [] },
        [a, b, d],
        []
      ),
      concurrentRegister('t1', c)
    ]);

    expect(saveOk).toBe(true);
    expect(readParticipants().map(p => p.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('preserves a waitlist entry that joined while the wizard was open', async () => {
    const a = participant('a');
    const w1: WaitlistEntry = { userId: 'w1', userName: 'W1', userKey: 'k1', registeredAt: 1 };
    const w2: WaitlistEntry = { userId: 'w2', userName: 'W2', userKey: 'k2', registeredAt: 2 };
    seed(makeTournament([a], [w1, w2])); // w2 joined concurrently

    const ok = await updateDraftTournamentMergingRegistration(
      't1',
      {},
      { participantIds: ['a'], waitlistUserIds: ['w1'] }, // admin only saw w1
      [a],
      [w1]
    );

    expect(ok).toBe(true);
    expect(readWaitlist().map(w => w.userId).sort()).toEqual(['w1', 'w2']);
  });

  it('still honours an explicit admin removal of a participant present at open time', async () => {
    const a = participant('a');
    const b = participant('b');
    seed(makeTournament([a, b]));

    // Admin removed b; no concurrent activity.
    const ok = await updateDraftTournamentMergingRegistration(
      't1',
      {},
      { participantIds: ['a', 'b'], waitlistUserIds: [] },
      [a],
      []
    );

    expect(ok).toBe(true);
    expect(readParticipants().map(p => p.id)).toEqual(['a']);
  });

  it('aborts (no write) if the tournament left DRAFT while the wizard was open', async () => {
    const a = participant('a');
    const started = makeTournament([a]);
    (started as unknown as Record<string, unknown>).status = 'GROUP_STAGE';
    seed(started);

    const d = participant('d', { type: 'GUEST', userId: undefined });
    const ok = await updateDraftTournamentMergingRegistration(
      't1',
      {},
      { participantIds: ['a'], waitlistUserIds: [] },
      [a, d],
      []
    );

    expect(ok).toBe(false);
    // Roster untouched — the running tournament was not corrupted.
    expect(readParticipants().map(p => p.id)).toEqual(['a']);
  });
});

// ─── tournament-start race: roster guard ──────────────────────────────────────

describe('commitTournamentStartIfRosterUnchanged', () => {
  it('commits the start when the roster is unchanged', async () => {
    const a = participant('a');
    const b = participant('b');
    seed(makeTournament([a, b]));

    const result = await commitTournamentStartIfRosterUnchanged(
      't1',
      [a, b].map(participantIdentityKey),
      { participants: [a, b], status: 'GROUP_STAGE', startedAt: 123 } as Partial<Tournament>
    );

    expect(result.success).toBe(true);
    expect(mockStore.getDocument('tournaments/t1')!.data.status).toBe('GROUP_STAGE');
    expect(readParticipants().map(p => p.id).sort()).toEqual(['a', 'b']);
  });

  it('ABORTS (no write) when a player registered while the schedule was being built', async () => {
    const a = participant('a');
    const b = participant('b');
    const c = participant('c'); // registered after the schedule snapshot
    seed(makeTournament([a, b, c]));

    const result = await commitTournamentStartIfRosterUnchanged(
      't1',
      [a, b].map(participantIdentityKey), // schedule was built from just [a, b]
      { participants: [a, b], status: 'GROUP_STAGE', startedAt: 123 } as Partial<Tournament>
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe('roster_changed');
    // Nothing committed: still DRAFT, c still present → retrying start will include c.
    expect(mockStore.getDocument('tournaments/t1')!.data.status).toBe('DRAFT');
    expect(readParticipants().map(p => p.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('is robust to id regeneration (matches roster by identity, not id)', async () => {
    // Current doc has regenerated ids but the same players (by userId).
    const stored = [participant('participant-new-1', { userId: 'user-a' }), participant('participant-new-2', { userId: 'user-b' })];
    seed(makeTournament(stored));

    const expectedKeys = [
      participantIdentityKey({ userId: 'user-a' }),
      participantIdentityKey({ userId: 'user-b' })
    ];
    const result = await commitTournamentStartIfRosterUnchanged(
      't1',
      expectedKeys,
      { participants: stored, status: 'GROUP_STAGE' } as Partial<Tournament>
    );

    expect(result.success).toBe(true);
  });

  it('refuses to start a tournament that already left DRAFT', async () => {
    const a = participant('a');
    const started = makeTournament([a]);
    (started as unknown as Record<string, unknown>).status = 'GROUP_STAGE';
    seed(started);

    const result = await commitTournamentStartIfRosterUnchanged(
      't1',
      [a].map(participantIdentityKey),
      { participants: [a], status: 'GROUP_STAGE' } as Partial<Tournament>
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_draft');
  });
});

// ─── ranking sync during start: must not drop a concurrent registration ───────

describe('applyParticipantRankingSnapshots', () => {
  it('applies snapshots AND preserves a player who registered during the sync', async () => {
    const a = participant('a', { userId: 'ua', rankingSnapshot: 0 });
    const late = participant('late', { userId: 'ulate', rankingSnapshot: 0 });
    // By the time we commit, `late` has self-registered → doc has [a, late].
    seed(makeTournament([a, late]));

    // The snapshot map was computed from the stale read (only knew `a`).
    const updatedA = participant('a', { userId: 'ua', rankingSnapshot: 1800 });
    const map = new Map([[participantIdentityKey(updatedA), updatedA]]);

    const ok = await applyParticipantRankingSnapshots('t1', map);

    expect(ok).toBe(true);
    const after = readParticipants();
    expect(after.map(p => p.userId).sort()).toEqual(['ulate', 'ua'].sort());
    expect(after.find(p => p.userId === 'ua')?.rankingSnapshot).toBe(1800);
    // The concurrent registration is NOT lost (the old overwrite would have dropped it).
    expect(after.find(p => p.userId === 'ulate')).toBeTruthy();
  });
});
