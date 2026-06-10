/**
 * Unit tests for /admin/venues backend functions (venues.ts)
 *
 * The Firestore mock replicates two behaviors the bugs depended on:
 *  - updateDoc/setDoc REJECT `undefined` values (like the real SDK), which
 *    made every edit of a venue without address fail before the fix
 *  - writeBatch applies update/delete operations atomically on commit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Venue } from '$lib/types/venue';

// ─── In-memory store ─────────────────────────────────────────────────────────

let store: Map<string, Record<string, unknown>>;

const DELETE_FIELD = Symbol('deleteField');

interface MockRef {
  path: string;
  id: string;
}

function assertNoUndefined(value: unknown, path: string): void {
  if (value === undefined) {
    throw new Error(`Unsupported field value: undefined (found in field ${path})`);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      assertNoUndefined(v, `${path}.${k}`);
    }
  }
}

function applyUpdate(ref: MockRef, data: Record<string, unknown>): void {
  const existing = store.get(ref.path);
  if (!existing) throw new Error(`No document to update: ${ref.path}`);
  assertNoUndefined(data, ref.path);
  const merged = { ...existing };
  for (const [key, value] of Object.entries(data)) {
    if (value === DELETE_FIELD) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  store.set(ref.path, merged);
}

// ─── Auth/permission mock state ──────────────────────────────────────────────

const permissions = { isAdmin: true, isSuperAdmin: true };

// ─── vi.mock setup ───────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
  db: {},
  isFirebaseEnabled: () => true
}));

vi.mock('./auth', async () => {
  const { writable } = await import('svelte/store');
  return { currentUser: writable({ id: 'owner-1', name: 'Owner One' }) };
});

vi.mock('./admin', () => ({
  isAdmin: vi.fn(async () => permissions.isAdmin),
  isSuperAdmin: vi.fn(async () => permissions.isSuperAdmin)
}));

interface WhereClause { __where: true; field: string; op: string; value: unknown }
interface OrderClause { __orderBy: true; field: string }

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collectionName: string, id: string): MockRef => ({
    path: `${collectionName}/${id}`,
    id
  }),

  collection: (_db: unknown, name: string) => ({ __collection: name }),

  where: (field: string, op: string, value: unknown): WhereClause => ({ __where: true, field, op, value }),
  orderBy: (field: string): OrderClause => ({ __orderBy: true, field }),

  query: (col: { __collection: string }, ...clauses: Array<WhereClause | OrderClause>) => ({ col, clauses }),

  getDoc: async (ref: MockRef) => {
    const data = store.get(ref.path);
    return {
      id: ref.id,
      exists: () => data !== undefined,
      data: () => (data ? structuredClone(data) : undefined)
    };
  },

  getDocs: async (q: { col: { __collection: string }; clauses: Array<WhereClause | OrderClause> }) => {
    const prefix = `${q.col.__collection}/`;
    let docs: Array<{ id: string; ref: MockRef; data: () => Record<string, unknown> }> = [];
    for (const [path, data] of store) {
      if (!path.startsWith(prefix)) continue;
      const matches = q.clauses
        .filter((c): c is WhereClause => '__where' in c)
        .every((c) => (c.op === '==' ? data[c.field] === c.value : true));
      if (matches) {
        docs.push({
          id: path.slice(prefix.length),
          ref: { path, id: path.slice(prefix.length) },
          data: () => structuredClone(data)
        });
      }
    }
    const order = q.clauses.find((c): c is OrderClause => '__orderBy' in c);
    if (order) {
      docs = docs.sort((a, b) => String(a.data()[order.field] ?? '').localeCompare(String(b.data()[order.field] ?? '')));
    }
    return { docs, size: docs.length, empty: docs.length === 0, forEach: (cb: (d: unknown) => void) => docs.forEach(cb) };
  },

  setDoc: async (ref: MockRef, data: Record<string, unknown>) => {
    assertNoUndefined(data, ref.path);
    store.set(ref.path, structuredClone(data));
  },

  updateDoc: async (ref: MockRef, data: Record<string, unknown>) => {
    applyUpdate(ref, data);
  },

  deleteDoc: async (ref: MockRef) => {
    store.delete(ref.path);
  },

  deleteField: () => DELETE_FIELD,
  serverTimestamp: () => Date.now(),

  writeBatch: () => {
    const ops: Array<() => void> = [];
    return {
      update: (ref: MockRef, data: Record<string, unknown>) => ops.push(() => applyUpdate(ref, data)),
      delete: (ref: MockRef) => ops.push(() => store.delete(ref.path)),
      commit: async () => {
        if (ops.length > 500) throw new Error('Batch too large (max 500 operations)');
        ops.forEach((op) => op());
      }
    };
  }
}));

// ─── Import functions under test (AFTER mocks) ──────────────────────────────

const {
  createVenue,
  updateVenue,
  deleteVenue,
  deleteVenueAsSuperAdmin,
  mergeVenues,
  searchVenues,
  getVenueTournamentDependencies
} = await import('./venues');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedVenue(id: string, overrides: Partial<Venue> = {}): void {
  store.set(`venues/${id}`, {
    id,
    ownerId: 'owner-1',
    ownerName: 'Owner One',
    name: `Venue ${id}`,
    city: 'Barcelona',
    country: 'ES',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides
  });
}

function seedTournament(id: string, venueId: string | undefined, overrides: Record<string, unknown> = {}): void {
  store.set(`tournaments/${id}`, {
    name: `Tournament ${id}`,
    status: 'COMPLETED',
    city: 'OldCity',
    country: 'XX',
    ...(venueId !== undefined && { venueId }),
    ...overrides
  });
}

beforeEach(() => {
  store = new Map();
  permissions.isAdmin = true;
  permissions.isSuperAdmin = true;
});

// ─── updateVenue ─────────────────────────────────────────────────────────────

describe('updateVenue', () => {
  it('clearing the address (undefined) deletes the field instead of failing', async () => {
    // Regression: address: undefined reached updateDoc verbatim and Firestore
    // rejects undefined → editing ANY venue without address always failed.
    seedVenue('v1', { address: 'Old Street 1' });

    const result = await updateVenue('v1', {
      name: 'Renamed',
      address: undefined,
      city: 'Girona',
      country: 'ES'
    });

    expect(result).toBe(true);
    const saved = store.get('venues/v1')!;
    expect(saved.name).toBe('Renamed');
    expect(saved.city).toBe('Girona');
    expect('address' in saved).toBe(false);
  });

  it('updates fields and preserves the rest', async () => {
    seedVenue('v1', { googleMapsUrl: 'https://maps/x' });

    const result = await updateVenue('v1', { name: 'New Name' });

    expect(result).toBe(true);
    const saved = store.get('venues/v1')!;
    expect(saved.name).toBe('New Name');
    expect(saved.googleMapsUrl).toBe('https://maps/x');
    expect(saved.ownerId).toBe('owner-1');
  });

  it('returns false when the venue does not exist', async () => {
    expect(await updateVenue('ghost', { name: 'X' })).toBe(false);
  });

  it('rejects a non-owner without super admin', async () => {
    permissions.isSuperAdmin = false;
    seedVenue('v1', { ownerId: 'someone-else' });

    expect(await updateVenue('v1', { name: 'Hijacked' })).toBe(false);
    expect(store.get('venues/v1')!.name).toBe('Venue v1');
  });

  it('allows a super admin to edit a venue they do not own', async () => {
    permissions.isSuperAdmin = true;
    seedVenue('v1', { ownerId: 'someone-else' });

    expect(await updateVenue('v1', { name: 'Fixed by SA' })).toBe(true);
    expect(store.get('venues/v1')!.name).toBe('Fixed by SA');
  });
});

// ─── mergeVenues ─────────────────────────────────────────────────────────────

describe('mergeVenues', () => {
  it('rejects merging a venue into itself (would delete it leaving dangling refs)', async () => {
    seedVenue('v1');
    seedTournament('t1', 'v1');

    const result = await mergeVenues('v1', 'v1');

    expect(result.success).toBe(false);
    expect(store.has('venues/v1')).toBe(true); // venue NOT deleted
    expect(store.get('tournaments/t1')!.venueId).toBe('v1');
  });

  it('fails when target venue does not exist', async () => {
    seedVenue('v1');
    const result = await mergeVenues('v1', 'ghost');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/target venue not found/i);
    expect(store.has('venues/v1')).toBe(true);
  });

  it('requires super admin', async () => {
    permissions.isSuperAdmin = false;
    seedVenue('v1');
    seedVenue('v2');

    const result = await mergeVenues('v1', 'v2');
    expect(result.success).toBe(false);
    expect(store.has('venues/v1')).toBe(true);
  });

  it('remaps tournaments to the target with denormalized location, then deletes source', async () => {
    seedVenue('v1', { address: 'Source St', city: 'OldTown', country: 'XX' });
    seedVenue('v2', { address: 'Target Ave 5', city: 'Barcelona', country: 'ES' });
    seedTournament('t1', 'v1');
    seedTournament('t2', 'v1');
    seedTournament('t-other', 'v2');
    seedTournament('t-none', undefined);

    const result = await mergeVenues('v1', 'v2');

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(2);

    for (const id of ['t1', 't2']) {
      const t = store.get(`tournaments/${id}`)!;
      expect(t.venueId).toBe('v2');
      expect(t.address).toBe('Target Ave 5');
      expect(t.city).toBe('Barcelona');
      expect(t.country).toBe('ES');
    }

    // Unrelated tournaments untouched
    expect(store.get('tournaments/t-other')!.city).toBe('OldCity');
    expect(store.get('tournaments/t-none')!.venueId).toBeUndefined();

    expect(store.has('venues/v1')).toBe(false); // source deleted
    expect(store.has('venues/v2')).toBe(true);
  });

  it('target without address denormalizes an empty string (not undefined)', async () => {
    seedVenue('v1');
    seedVenue('v2', { address: undefined as unknown as string });
    delete (store.get('venues/v2') as Record<string, unknown>).address;
    seedTournament('t1', 'v1');

    const result = await mergeVenues('v1', 'v2');

    expect(result.success).toBe(true);
    expect(store.get('tournaments/t1')!.address).toBe('');
  });

  it('merging a venue with no tournaments still deletes the source', async () => {
    seedVenue('v1');
    seedVenue('v2');

    const result = await mergeVenues('v1', 'v2');

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(0);
    expect(store.has('venues/v1')).toBe(false);
  });
});

// ─── deleteVenue / deleteVenueAsSuperAdmin ───────────────────────────────────

describe('deleteVenue', () => {
  it('owner can delete their venue', async () => {
    seedVenue('v1');
    expect(await deleteVenue('v1')).toBe(true);
    expect(store.has('venues/v1')).toBe(false);
  });

  it('non-owner cannot delete (even super admin must use the dedicated fn)', async () => {
    seedVenue('v1', { ownerId: 'someone-else' });
    expect(await deleteVenue('v1')).toBe(false);
    expect(store.has('venues/v1')).toBe(true);
  });

  it('returns false for a missing venue', async () => {
    expect(await deleteVenue('ghost')).toBe(false);
  });
});

describe('deleteVenueAsSuperAdmin', () => {
  it('requires super admin', async () => {
    permissions.isSuperAdmin = false;
    seedVenue('v1', { ownerId: 'someone-else' });
    expect(await deleteVenueAsSuperAdmin('v1')).toBe(false);
    expect(store.has('venues/v1')).toBe(true);
  });

  it('super admin deletes any venue', async () => {
    seedVenue('v1', { ownerId: 'someone-else' });
    expect(await deleteVenueAsSuperAdmin('v1')).toBe(true);
    expect(store.has('venues/v1')).toBe(false);
  });
});

// ─── createVenue ─────────────────────────────────────────────────────────────

describe('createVenue', () => {
  it('creates a venue with trimmed fields and owner info', async () => {
    const venue = await createVenue({
      name: '  Club Crokitorra  ',
      city: ' Terrassa ',
      country: 'ES',
      createdAt: 0,
      updatedAt: 0
    } as Parameters<typeof createVenue>[0]);

    expect(venue).not.toBeNull();
    expect(venue!.name).toBe('Club Crokitorra');
    expect(venue!.city).toBe('Terrassa');
    expect(venue!.ownerId).toBe('owner-1');

    const saved = store.get(`venues/${venue!.id}`)!;
    expect(saved.name).toBe('Club Crokitorra');
    // Empty optional fields must be OMITTED (setDoc rejects undefined)
    expect('address' in saved).toBe(false);
    expect('googleMapsUrl' in saved).toBe(false);
  });

  it('non-admin cannot create venues', async () => {
    permissions.isAdmin = false;
    const venue = await createVenue({
      name: 'X',
      city: 'Y',
      country: 'ES',
      createdAt: 0,
      updatedAt: 0
    } as Parameters<typeof createVenue>[0]);
    expect(venue).toBeNull();
    expect(store.size).toBe(0);
  });
});

// ─── searchVenues / dependencies ─────────────────────────────────────────────

describe('searchVenues', () => {
  it('returns empty for queries shorter than 2 chars', async () => {
    seedVenue('v1', { name: 'Alpha' });
    expect(await searchVenues('')).toEqual([]);
    expect(await searchVenues('a')).toEqual([]);
  });

  it('matches by name, city or address, only own venues, capped at 10', async () => {
    seedVenue('by-name', { name: 'Crokinole Palace' });
    seedVenue('by-city', { name: 'Other', city: 'Crokicity' });
    seedVenue('by-address', { name: 'Another', address: 'Croki Street 9' });
    seedVenue('foreign', { name: 'Crokinole Foreign', ownerId: 'someone-else' });
    for (let i = 0; i < 12; i++) seedVenue(`bulk-${i}`, { name: `Croki Bulk ${i}` });

    const results = await searchVenues('croki');

    expect(results.length).toBe(10); // capped
    expect(results.some((v) => v.id === 'foreign')).toBe(false); // own venues only
  });
});

describe('getVenueTournamentDependencies', () => {
  it('lists tournaments referencing the venue', async () => {
    seedTournament('t1', 'v1', { name: 'Open BCN', status: 'GROUP_STAGE' });
    seedTournament('t2', 'v2');

    const deps = await getVenueTournamentDependencies('v1');
    expect(deps).toEqual([{ id: 't1', name: 'Open BCN', status: 'GROUP_STAGE' }]);
  });
});
