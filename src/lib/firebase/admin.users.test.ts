/**
 * Unit tests for /admin/users backend functions (admin.ts)
 *
 * Covers mergeUsers() and removeUserFromTournamentCollaborators() using the
 * shared MockFirestore (optimistic concurrency + retry), mirroring the setup
 * of tournamentMatches.concurrency.test.ts.
 *
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import type { UserProfile } from './userProfile';

// ─── Shared mock state ───────────────────────────────────────────────────────

let mockStore: MockFirestore;

/** Access the private documents map of MockFirestore (test-only). */
function allDocs(): Map<string, { data: Record<string, unknown>; version: number }> {
  return (mockStore as unknown as { documents: Map<string, { data: Record<string, unknown>; version: number }> }).documents;
}

function seedDoc(path: string, data: Record<string, unknown>): void {
  mockStore.setDocument(path, data);
}

function readDoc<T = Record<string, unknown>>(path: string): T {
  const doc = mockStore.getDocument(path);
  if (!doc) throw new Error(`Document ${path} not found in mock store`);
  return doc.data as unknown as T;
}

// ─── vi.mock setup ───────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
  db: {},
  isFirebaseEnabled: () => true
}));

vi.mock('./auth', async () => {
  const { writable } = await import('svelte/store');
  return { currentUser: writable({ id: 'super-admin-uid' }) };
});

vi.mock('./userProfile', () => ({
  getUserProfile: vi.fn(async () => ({ isAdmin: true, isSuperAdmin: true }))
}));

vi.mock('firebase/app', () => ({ getApp: vi.fn(() => ({})) }));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn(async () => ({ data: { success: true } })))
}));

interface WhereClause { field: string; op: string; value: unknown }
const ARRAY_REMOVE = Symbol('arrayRemove');

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collectionName: string, id: string) =>
    new MockDocumentReference(`${collectionName}/${id}`, id),

  collection: (_db: unknown, name: string) => ({ __collection: name }),

  where: (field: string, op: string, value: unknown): WhereClause => ({ field, op, value }),

  query: (col: { __collection: string }, ...clauses: WhereClause[]) => ({ col, clauses }),

  // Minimal getDocs: supports '==' and 'in' on top-level fields
  getDocs: async (q: { col: { __collection: string }; clauses: WhereClause[] }) => {
    const prefix = `${q.col.__collection}/`;
    const docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
    for (const [path, stored] of allDocs()) {
      if (!path.startsWith(prefix)) continue;
      const data = stored.data;
      const matches = (q.clauses ?? []).every((c) => {
        const fieldValue = data[c.field];
        if (c.op === '==') return fieldValue === c.value;
        if (c.op === 'in') return Array.isArray(c.value) && (c.value as unknown[]).includes(fieldValue);
        return true;
      });
      if (matches) {
        docs.push({ id: path.slice(prefix.length), data: () => structuredClone(data) });
      }
    }
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
      forEach: (cb: (d: { id: string; data: () => Record<string, unknown> }) => void) => docs.forEach(cb)
    };
  },

  runTransaction: (_db: unknown, callback: (txn: unknown) => Promise<unknown>) =>
    mockStore.runTransaction((txn) =>
      // Adapter: MockTransaction.set() ignores the { merge } option, so route
      // set(..., { merge: true }) through update() which buffers a merge write.
      callback({
        get: (ref: MockDocumentReference) => txn.get(ref),
        set: (ref: MockDocumentReference, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
          opts?.merge ? txn.update(ref, data) : txn.set(ref, data),
        update: (ref: MockDocumentReference, data: Record<string, unknown>) => txn.update(ref, data)
      })
    ),

  updateDoc: async (ref: MockDocumentReference, data: Record<string, unknown>) => {
    const existing = mockStore.getDocument(ref.path);
    if (!existing) throw new Error(`updateDoc: no document at ${ref.path}`);
    const merged = { ...existing.data };
    for (const [key, value] of Object.entries(data)) {
      const marker = value as { __op?: symbol; value?: unknown };
      if (marker && marker.__op === ARRAY_REMOVE) {
        const current = (merged[key] as unknown[]) ?? [];
        merged[key] = current.filter((v) => v !== marker.value);
      } else {
        merged[key] = value;
      }
    }
    mockStore.setDocument(ref.path, merged);
  },

  arrayRemove: (value: unknown) => ({ __op: ARRAY_REMOVE, value }),

  serverTimestamp: () => Date.now(),

  // Unused by the functions under test — present so module imports resolve
  getCountFromServer: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => undefined),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn()
}));

// ─── Import functions under test (AFTER mocks) ──────────────────────────────

const { mergeUsers, removeUserFromTournamentCollaborators } = await import('./admin');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedUser(userId: string, profile: Partial<UserProfile> = {}): void {
  seedDoc(`users/${userId}`, {
    playerName: `Player ${userId}`,
    ...profile
  } as Record<string, unknown>);
}

function tournamentRecord(tournamentId: string, rankingDelta = 10) {
  return { tournamentId, tournamentName: `Tournament ${tournamentId}`, rankingDelta };
}

function seedTournamentDoc(
  id: string,
  opts: {
    status?: string;
    participants?: Array<Record<string, unknown>>;
    waitlist?: Array<Record<string, unknown>>;
    adminIds?: string[];
  } = {}
): void {
  seedDoc(`tournaments/${id}`, {
    name: `Tournament ${id}`,
    status: opts.status ?? 'COMPLETED',
    participants: opts.participants ?? [],
    waitlist: opts.waitlist ?? [],
    adminIds: opts.adminIds ?? []
  });
}

beforeEach(() => {
  mockStore = new MockFirestore();
});

// ─── mergeUsers: validation ──────────────────────────────────────────────────

describe('mergeUsers — validation', () => {
  it('rejects merging a user with themselves', async () => {
    seedUser('a');
    const result = await mergeUsers('a', 'a');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/themselves/i);
  });

  it('rejects when source does not exist', async () => {
    seedUser('target');
    const result = await mergeUsers('ghost', 'target');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Source user not found');
  });

  it('rejects when target does not exist', async () => {
    seedUser('source');
    const result = await mergeUsers('source', 'ghost');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Target user not found');
  });

  it('rejects when source was already merged', async () => {
    seedUser('source', { mergedTo: 'someone' } as Partial<UserProfile>);
    seedUser('target');
    const result = await mergeUsers('source', 'target');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Source user was already merged');
  });

  // A merged-away target is a dead profile: rankings skip mergedTo docs, so
  // tournaments moved onto it would be silently lost. The UI filters these
  // candidates, but the function must validate too (stale cache / direct call).
  it('rejects merging INTO an already-merged (dead) target', async () => {
    seedUser('source', { tournaments: [tournamentRecord('t1')] } as Partial<UserProfile>);
    seedUser('dead-target', { mergedTo: 'final-target' } as Partial<UserProfile>);
    seedUser('final-target');

    const result = await mergeUsers('source', 'dead-target');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/target user was already merged/i);

    // Nothing was written
    expect(readDoc<UserProfile>('users/source').mergedTo).toBeUndefined();
  });

  // After A→B, merging B→A would set A.mergedTo=B and B.mergedTo=A — a cycle
  // where BOTH profiles are merged-away and all data is unreachable. Blocked
  // by the target.mergedTo check (A is already merged-away).
  it('rejects a merge that creates a cycle (A→B, then B→A)', async () => {
    seedUser('a');
    seedUser('b');

    const first = await mergeUsers('a', 'b');
    expect(first.success).toBe(true);

    const second = await mergeUsers('b', 'a');
    expect(second.success).toBe(false);

    const a = readDoc<UserProfile>('users/a');
    const b = readDoc<UserProfile>('users/b');
    // At least one profile must remain alive (not merged-away)
    expect(!a.mergedTo || !b.mergedTo).toBe(true);
  });
});

// ─── mergeUsers: profile merge ───────────────────────────────────────────────

describe('mergeUsers — profile merge', () => {
  it('marks source as mergedTo and appends to target mergedFrom', async () => {
    seedUser('source');
    seedUser('target', { mergedFrom: ['earlier-merge'] } as Partial<UserProfile>);

    const result = await mergeUsers('source', 'target');
    expect(result.success).toBe(true);

    expect(readDoc<UserProfile>('users/source').mergedTo).toBe('target');
    expect(readDoc<UserProfile>('users/target').mergedFrom).toEqual(['earlier-merge', 'source']);
  });

  it('merges tournaments deduplicating by tournamentId (target wins on conflict)', async () => {
    const sourceShared = { ...tournamentRecord('shared', 5), origin: 'source' };
    const targetShared = { ...tournamentRecord('shared', 99), origin: 'target' };
    seedUser('source', { tournaments: [sourceShared, tournamentRecord('only-source')] } as Partial<UserProfile>);
    seedUser('target', { tournaments: [targetShared] } as Partial<UserProfile>);

    const result = await mergeUsers('source', 'target');
    expect(result.success).toBe(true);

    const target = readDoc<UserProfile>('users/target');
    expect(target.tournaments).toHaveLength(2);
    const shared = target.tournaments!.find((t) => t.tournamentId === 'shared') as Record<string, unknown>;
    expect(shared.origin).toBe('target'); // target's version preserved
    expect(shared.rankingDelta).toBe(99);
    expect(target.tournaments!.some((t) => t.tournamentId === 'only-source')).toBe(true);
  });

  it('preserves unrelated fields on both profiles (merge, not replace)', async () => {
    seedUser('source', { email: 'source@x.com', country: 'ES' } as Partial<UserProfile>);
    seedUser('target', { email: 'target@x.com', isAdmin: true } as Partial<UserProfile>);

    await mergeUsers('source', 'target');

    const source = readDoc<UserProfile>('users/source');
    const target = readDoc<UserProfile>('users/target');
    expect(source.email).toBe('source@x.com');
    expect(source.country).toBe('ES');
    expect(target.email).toBe('target@x.com');
    expect(target.isAdmin).toBe(true);
  });

  it('handles a source with no tournaments array', async () => {
    seedUser('source');
    seedUser('target');

    const result = await mergeUsers('source', 'target');
    expect(result.success).toBe(true);
    expect(result.tournamentsUpdated).toBe(0);
    expect(readDoc<UserProfile>('users/target').tournaments).toEqual([]);
  });

  it('concurrent merges of the same source — only one wins', async () => {
    seedUser('source', { tournaments: [tournamentRecord('t1')] } as Partial<UserProfile>);
    seedUser('target-1');
    seedUser('target-2');

    const [r1, r2] = await Promise.all([
      mergeUsers('source', 'target-1'),
      mergeUsers('source', 'target-2')
    ]);

    const successes = [r1, r2].filter((r) => r.success);
    expect(successes).toHaveLength(1);

    const source = readDoc<UserProfile>('users/source');
    const winner = r1.success ? 'target-1' : 'target-2';
    const loser = r1.success ? 'target-2' : 'target-1';
    expect(source.mergedTo).toBe(winner);
    // Loser must not have received mergedFrom
    expect(readDoc<UserProfile>(`users/${loser}`).mergedFrom).toBeUndefined();
  });
});

// ─── mergeUsers: tournament doc remapping ────────────────────────────────────

describe('mergeUsers — tournament remapping', () => {
  it('remaps participant.userId and partner.userId in completed tournaments', async () => {
    seedUser('source', { tournaments: [tournamentRecord('t1'), tournamentRecord('t2')] } as Partial<UserProfile>);
    seedUser('target', { authProvider: 'google', photoURL: 'https://x/photo.jpg' } as Partial<UserProfile>);

    seedTournamentDoc('t1', {
      participants: [
        { id: 'p1', userId: 'source', name: 'Source', type: 'GUEST' },
        { id: 'p2', userId: 'other', name: 'Other' }
      ]
    });
    seedTournamentDoc('t2', {
      participants: [
        { id: 'p1', userId: 'other', name: 'Other', partner: { userId: 'source', name: 'Source', type: 'GUEST' } }
      ]
    });

    const result = await mergeUsers('source', 'target');
    expect(result.success).toBe(true);
    expect(result.tournamentsUpdated).toBe(2);

    const t1 = readDoc('tournaments/t1') as { participants: Array<Record<string, any>> };
    expect(t1.participants[0].userId).toBe('target');
    expect(t1.participants[0].photoURL).toBe('https://x/photo.jpg');
    expect(t1.participants[0].type).toBe('REGISTERED');
    expect(t1.participants[1].userId).toBe('other'); // untouched

    const t2 = readDoc('tournaments/t2') as { participants: Array<Record<string, any>> };
    expect(t2.participants[0].partner.userId).toBe('target');
    expect(t2.participants[0].partner.type).toBe('REGISTERED');
  });

  it('does not upgrade participant type when target is a guest (no authProvider)', async () => {
    seedUser('source', { tournaments: [tournamentRecord('t1')] } as Partial<UserProfile>);
    seedUser('target'); // guest

    seedTournamentDoc('t1', {
      participants: [{ id: 'p1', userId: 'source', name: 'Source', type: 'GUEST' }]
    });

    await mergeUsers('source', 'target');

    const t1 = readDoc('tournaments/t1') as { participants: Array<Record<string, any>> };
    expect(t1.participants[0].userId).toBe('target');
    expect(t1.participants[0].type).toBe('GUEST');
  });

  it('remaps ACTIVE tournament registrations not present in source.tournaments', async () => {
    // Records in source.tournaments only exist for COMPLETED tournaments;
    // active registrations must be discovered via the status query.
    seedUser('source');
    seedUser('target');

    seedTournamentDoc('active-1', {
      status: 'GROUP_STAGE',
      participants: [{ id: 'p1', userId: 'source', name: 'Source' }]
    });
    seedTournamentDoc('active-2', {
      status: 'DRAFT',
      waitlist: [{ userId: 'source', name: 'Source' }]
    });
    seedTournamentDoc('unrelated', {
      status: 'GROUP_STAGE',
      participants: [{ id: 'p1', userId: 'other', name: 'Other' }]
    });

    const result = await mergeUsers('source', 'target');
    expect(result.success).toBe(true);
    expect(result.tournamentsUpdated).toBe(2);

    const active1 = readDoc('tournaments/active-1') as { participants: Array<Record<string, any>> };
    expect(active1.participants[0].userId).toBe('target');

    const active2 = readDoc('tournaments/active-2') as { waitlist: Array<Record<string, any>> };
    expect(active2.waitlist[0].userId).toBe('target');

    const unrelated = readDoc('tournaments/unrelated') as { participants: Array<Record<string, any>> };
    expect(unrelated.participants[0].userId).toBe('other');
  });

  it('survives a tournament record pointing at a deleted tournament doc', async () => {
    seedUser('source', { tournaments: [tournamentRecord('deleted-tournament')] } as Partial<UserProfile>);
    seedUser('target');

    const result = await mergeUsers('source', 'target');
    expect(result.success).toBe(true);
    expect(result.tournamentsUpdated).toBe(0);
  });

  it('caps tournament doc updates at 50 (documents current lossy behavior)', async () => {
    const records = Array.from({ length: 60 }, (_, i) => tournamentRecord(`t${i}`));
    seedUser('source', { tournaments: records } as Partial<UserProfile>);
    seedUser('target');

    for (let i = 0; i < 60; i++) {
      seedTournamentDoc(`t${i}`, {
        participants: [{ id: 'p1', userId: 'source', name: 'Source' }]
      });
    }

    const result = await mergeUsers('source', 'target');
    expect(result.success).toBe(true);
    // Only the first 50 are remapped — the remaining 10 keep pointing at the
    // merged-away source. If this cap is raised/removed, update this test.
    expect(result.tournamentsUpdated).toBe(50);

    const remapped = Array.from({ length: 60 }, (_, i) =>
      (readDoc(`tournaments/t${i}`) as { participants: Array<Record<string, any>> }).participants[0].userId
    );
    expect(remapped.filter((id) => id === 'target')).toHaveLength(50);
    expect(remapped.filter((id) => id === 'source')).toHaveLength(10);
  });
});

// ─── removeUserFromTournamentCollaborators ───────────────────────────────────

describe('removeUserFromTournamentCollaborators', () => {
  it('returns true immediately for an empty tournament list', async () => {
    const result = await removeUserFromTournamentCollaborators('user-1', []);
    expect(result).toBe(true);
  });

  it('removes the user from adminIds in every listed tournament', async () => {
    seedTournamentDoc('t1', { adminIds: ['user-1', 'other-admin'] });
    seedTournamentDoc('t2', { adminIds: ['user-1'] });

    const result = await removeUserFromTournamentCollaborators('user-1', ['t1', 't2']);
    expect(result).toBe(true);

    expect((readDoc('tournaments/t1') as { adminIds: string[] }).adminIds).toEqual(['other-admin']);
    expect((readDoc('tournaments/t2') as { adminIds: string[] }).adminIds).toEqual([]);
  });

  it('returns false when any tournament update fails (missing doc)', async () => {
    seedTournamentDoc('t1', { adminIds: ['user-1'] });

    const result = await removeUserFromTournamentCollaborators('user-1', ['t1', 'missing']);
    expect(result).toBe(false);
  });
});
