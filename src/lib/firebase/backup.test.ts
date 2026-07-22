/**
 * Unit tests for /admin/tools/backup backend (backup.ts)
 *
 * Covers the Timestamp serialize/deserialize round-trip, export document
 * collection, and restore batching/validation. The Timestamp mock mirrors
 * the real class closely enough for instanceof checks and ms precision.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Firestore ──────────────────────────────────────────────────────────

let store: Map<string, Record<string, unknown>>;
let batchCommits: number;
let denyCollections: Set<string>;

class FakeTimestamp {
  constructor(
    public seconds: number,
    public nanoseconds: number
  ) {}

  static fromDate(date: Date): FakeTimestamp {
    const ms = date.getTime();
    if (isNaN(ms)) throw new Error('Invalid date for Timestamp');
    return new FakeTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + Math.round(this.nanoseconds / 1e6));
  }
}

const permissions = { isSuperAdmin: true };

vi.mock('$lib/firebase/config', () => ({ db: {} }));

vi.mock('./admin', () => ({
  isSuperAdmin: vi.fn(async () => permissions.isSuperAdmin)
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: FakeTimestamp,

  collection: (_db: unknown, name: string) => ({ __collection: name }),

  doc: (_db: unknown, collectionName: string, id: string) => ({
    path: `${collectionName}/${id}`,
    id
  }),

  limit: (n: number) => ({ __limit: n }),

  query: (col: { __collection: string }, ...clauses: Array<{ __limit?: number }>) => ({
    __collection: col.__collection,
    __limit: clauses.find((c) => c.__limit !== undefined)?.__limit
  }),

  getCountFromServer: async (col: { __collection: string }) => {
    const prefix = `${col.__collection}/`;
    let count = 0;
    for (const path of store.keys()) if (path.startsWith(prefix)) count++;
    return { data: () => ({ count }) };
  },

  getDocs: async (col: { __collection: string; __limit?: number }) => {
    if (denyCollections.has(col.__collection)) {
      const err = new Error('Missing or insufficient permissions.');
      (err as { code?: string }).code = 'permission-denied';
      throw err;
    }
    const prefix = `${col.__collection}/`;
    let docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
    for (const [path, data] of store) {
      if (path.startsWith(prefix)) {
        // No structuredClone here: it would strip the FakeTimestamp prototype
        // and break the `instanceof Timestamp` check in serializeValue
        docs.push({ id: path.slice(prefix.length), data: () => data });
      }
    }
    if (col.__limit !== undefined) docs = docs.slice(0, col.__limit);
    return { docs, forEach: (cb: (d: unknown) => void) => docs.forEach(cb) };
  },

  writeBatch: () => {
    const ops: Array<{ path: string; data: Record<string, unknown> }> = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) => ops.push({ path: ref.path, data }),
      commit: async () => {
        if (ops.length > 500) throw new Error('Batch too large');
        ops.forEach((op) => store.set(op.path, op.data));
        batchCommits++;
      }
    };
  }
}));

const { FIRESTORE_COLLECTIONS, exportCollections, previewCollectionDocs, restoreDocuments } =
  await import('./backup');

beforeEach(() => {
  store = new Map();
  batchCommits = 0;
  denyCollections = new Set();
  permissions.isSuperAdmin = true;
});

// ─── Collection list ─────────────────────────────────────────────────────────

describe('FIRESTORE_COLLECTIONS', () => {
  it("includes 'pairs' (doubles pair history was silently missing from backups)", () => {
    expect(FIRESTORE_COLLECTIONS).toContain('pairs');
  });

  it('includes every core data collection', () => {
    for (const name of ['tournaments', 'users', 'matches', 'venues', 'matchInvites']) {
      expect(FIRESTORE_COLLECTIONS).toContain(name);
    }
  });

  it("excludes 'pageViews' (client writes are rules-denied — a restore would hang; raw IPs are 90-day retention only)", () => {
    expect(FIRESTORE_COLLECTIONS).not.toContain('pageViews');
  });

  it("includes 'pageViewStats' (the aggregate holds no IPs)", () => {
    expect(FIRESTORE_COLLECTIONS).toContain('pageViewStats');
  });
});

// ─── exportCollections ───────────────────────────────────────────────────────

describe('exportCollections', () => {
  it('exports documents keyed by id with metadata counts', async () => {
    store.set('users/u1', { playerName: 'Ana' });
    store.set('users/u2', { playerName: 'Bo' });
    store.set('venues/v1', { name: 'Club' });

    const backup = await exportCollections(['users', 'venues']);

    expect(backup.metadata.documentCount).toBe(3);
    expect(backup.metadata.collections).toEqual(['users', 'venues']);
    expect(Object.keys(backup.data.users)).toEqual(['u1', 'u2']);
    expect(backup.data.users.u1.playerName).toBe('Ana');
    expect(backup.data.venues.v1.name).toBe('Club');
  });

  it('serializes Timestamps (top-level, nested and inside arrays) to markers', async () => {
    const ts = FakeTimestamp.fromDate(new Date('2026-06-10T12:30:00.123Z'));
    store.set('users/u1', {
      createdAt: ts,
      nested: { updatedAt: ts },
      history: [{ at: ts }, 'plain', 5]
    });

    const backup = await exportCollections(['users']);
    const u1 = backup.data.users.u1;

    const expected = { __timestamp: true, value: '2026-06-10T12:30:00.123Z' };
    expect(u1.createdAt).toEqual(expected);
    expect(u1.nested.updatedAt).toEqual(expected);
    expect(u1.history[0].at).toEqual(expected);
    expect(u1.history[1]).toBe('plain');
    expect(u1.history[2]).toBe(5);
  });

  it('preserves null and primitive values', async () => {
    store.set('users/u1', { a: null, b: 0, c: false, d: '' });
    const backup = await exportCollections(['users']);
    expect(backup.data.users.u1).toEqual({ a: null, b: 0, c: false, d: '' });
  });

  it('requires super admin', async () => {
    permissions.isSuperAdmin = false;
    await expect(exportCollections(['users'])).rejects.toThrow(/super admin/i);
  });

  it('skips a collection whose read is denied and still exports the rest', async () => {
    store.set('users/u1', { playerName: 'Ana' });
    store.set('pairs/p1', { points: 1 });
    denyCollections.add('pairs'); // e.g. a rules gap on one collection

    const backup = await exportCollections(['users', 'pairs']);

    // The whole export must NOT abort because one collection is unreadable.
    expect(backup.metadata.collections).toEqual(['users']);
    expect(backup.metadata.skipped?.map((s) => s.name)).toEqual(['pairs']);
    expect(backup.data.pairs).toBeUndefined();
    expect(backup.data.users.u1.playerName).toBe('Ana');
    expect(backup.metadata.documentCount).toBe(1);
  });
});

// ─── previewCollectionDocs ───────────────────────────────────────────────────

describe('previewCollectionDocs', () => {
  it('returns at most maxDocs documents plus the real total', async () => {
    for (let i = 0; i < 120; i++) store.set(`pageViews/pv${i}`, { n: i });

    const result = await previewCollectionDocs('pageViews', 50);

    expect(Object.keys(result.docs)).toHaveLength(50);
    expect(result.total).toBe(120);
  });

  it('returns everything when the collection is smaller than the cap', async () => {
    store.set('venues/v1', { name: 'Club' });
    store.set('venues/v2', { name: 'Bar' });

    const result = await previewCollectionDocs('venues', 50);
    expect(Object.keys(result.docs)).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('serializes Timestamps in the preview too', async () => {
    store.set('users/u1', { createdAt: FakeTimestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')) });

    const result = await previewCollectionDocs('users', 10);
    expect(result.docs.u1.createdAt).toEqual({ __timestamp: true, value: '2026-01-01T00:00:00.000Z' });
  });

  it('requires super admin', async () => {
    permissions.isSuperAdmin = false;
    await expect(previewCollectionDocs('users')).rejects.toThrow(/super admin/i);
  });
});

// ─── restoreDocuments ────────────────────────────────────────────────────────

describe('restoreDocuments', () => {
  it('restores documents and deserializes Timestamp markers (ms-precision round trip)', async () => {
    const docs = {
      u1: {
        playerName: 'Ana',
        createdAt: { __timestamp: true, value: '2026-06-10T12:30:00.123Z' },
        nested: { history: [{ at: { __timestamp: true, value: '2025-01-01T00:00:00.000Z' } }] }
      }
    };

    const count = await restoreDocuments('users', docs);
    expect(count).toBe(1);

    const restored = store.get('users/u1')!;
    expect(restored.playerName).toBe('Ana');
    expect(restored.createdAt).toBeInstanceOf(FakeTimestamp);
    expect((restored.createdAt as FakeTimestamp).toDate().toISOString()).toBe('2026-06-10T12:30:00.123Z');
    const nestedTs = (restored.nested as any).history[0].at;
    expect(nestedTs).toBeInstanceOf(FakeTimestamp);
  });

  it('keeps a corrupted timestamp marker as-is instead of aborting the restore', async () => {
    const docs = {
      u1: { createdAt: { __timestamp: true, value: 'not-a-date' }, name: 'Ana' }
    };

    const count = await restoreDocuments('users', docs);
    expect(count).toBe(1);
    const restored = store.get('users/u1')!;
    expect(restored.createdAt).toEqual({ __timestamp: true, value: 'not-a-date' });
    expect(restored.name).toBe('Ana');
  });

  it('chunks restores into batches of 500 with cumulative progress', async () => {
    const docs: Record<string, any> = {};
    for (let i = 0; i < 1200; i++) docs[`d${i}`] = { n: i };

    const progress: Array<[number, number]> = [];
    const count = await restoreDocuments('matches', docs, (restored, total) => {
      progress.push([restored, total]);
    });

    expect(count).toBe(1200);
    expect(batchCommits).toBe(3); // 500 + 500 + 200
    expect(progress).toEqual([
      [500, 1200],
      [1000, 1200],
      [1200, 1200]
    ]);
    expect(store.size).toBe(1200);
  });

  it('rejects unknown collection names (file content is untrusted)', async () => {
    await expect(restoreDocuments('evilCollection', { d1: { x: 1 } })).rejects.toThrow(/desconocida/i);
    expect(store.size).toBe(0);
  });

  it("rejects 'pageViews' from an old backup file (client writes are rules-denied — would hang, not error, under persistentLocalCache)", async () => {
    await expect(restoreDocuments('pageViews', { pv1: { path: '/' } })).rejects.toThrow(/desconocida/i);
    expect(store.size).toBe(0);
  });

  it('rejects malformed document data BEFORE writing anything (no partial restore)', async () => {
    const docs: Record<string, any> = {};
    for (let i = 0; i < 600; i++) docs[`d${i}`] = { n: i };
    docs.bad = null; // would have thrown mid-loop after the first batch committed

    await expect(restoreDocuments('matches', docs)).rejects.toThrow(/inválido/i);
    expect(store.size).toBe(0);
    expect(batchCommits).toBe(0);
  });

  it('rejects array document data', async () => {
    await expect(restoreDocuments('matches', { d1: [1, 2, 3] })).rejects.toThrow(/inválido/i);
  });

  it('requires super admin', async () => {
    permissions.isSuperAdmin = false;
    await expect(restoreDocuments('users', { u1: { a: 1 } })).rejects.toThrow(/super admin/i);
    expect(store.size).toBe(0);
  });

  it('returns 0 for an empty document map', async () => {
    expect(await restoreDocuments('users', {})).toBe(0);
    expect(batchCommits).toBe(0);
  });

  it('full export → restore round trip is lossless (ms precision)', async () => {
    const ts = FakeTimestamp.fromDate(new Date('2026-03-15T18:45:30.500Z'));
    store.set('tournaments/t1', {
      name: 'Open',
      createdAt: ts,
      participants: [{ name: 'Ana', joinedAt: ts }],
      config: { rounds: 5, flags: { live: true } }
    });

    const backup = await exportCollections(['tournaments']);

    // Simulate the JSON file round trip (Blob → download → upload → parse)
    const json = JSON.parse(JSON.stringify(backup)) as typeof backup;

    store.clear();
    await restoreDocuments('tournaments', json.data.tournaments);

    const restored = store.get('tournaments/t1')!;
    expect(restored.name).toBe('Open');
    expect((restored.createdAt as FakeTimestamp).toDate().toISOString()).toBe('2026-03-15T18:45:30.500Z');
    expect((restored.participants as any)[0].joinedAt).toBeInstanceOf(FakeTimestamp);
    expect(restored.config).toEqual({ rounds: 5, flags: { live: true } });
  });
});
