/**
 * cancelTournament status guard.
 *
 * The admin tournament page only shows the cancel button for DRAFT/upcoming
 * tournaments, but a STALE TAB can hold that view while the tournament has
 * since started or completed. Cancelling a COMPLETED tournament is especially
 * harmful: the Cloud Function already distributed its ranking points.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import type { Tournament } from '$lib/types/tournament';

let mockStore: MockFirestore;

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) =>
    new MockDocumentReference(`${collection}/${id}`, id),
  getDoc: async (ref: MockDocumentReference) => {
    const stored = mockStore.getDocument(ref.path);
    return {
      exists: () => !!stored,
      data: () => (stored ? structuredClone(stored.data) : undefined)
    };
  },
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

const { cancelTournament } = await import('./tournaments');

function seedTournament(status: Tournament['status']) {
  mockStore.setDocument('tournaments/t1', {
    id: 't1',
    status,
    ownerId: 'admin1',
    name: 'Test',
    participants: []
  });
}

function storedStatus(): string {
  return mockStore.getDocument('tournaments/t1')!.data.status as string;
}

beforeEach(() => {
  mockStore = new MockFirestore();
});

describe('cancelTournament status guard', () => {
  it('cancels a DRAFT tournament', async () => {
    seedTournament('DRAFT');
    expect(await cancelTournament('t1')).toBe(true);
    expect(storedStatus()).toBe('CANCELLED');
  });

  it('cancels a live tournament (GROUP_STAGE → CANCELLED is a valid transition)', async () => {
    seedTournament('GROUP_STAGE');
    expect(await cancelTournament('t1')).toBe(true);
    expect(storedStatus()).toBe('CANCELLED');
  });

  it('REFUSES to cancel a COMPLETED tournament (stale tab — ranking points already distributed)', async () => {
    seedTournament('COMPLETED');
    expect(await cancelTournament('t1')).toBe(false);
    expect(storedStatus()).toBe('COMPLETED');
  });

  it('refuses to re-cancel an already CANCELLED tournament', async () => {
    seedTournament('CANCELLED');
    expect(await cancelTournament('t1')).toBe(false);
    expect(storedStatus()).toBe('CANCELLED');
  });

  it('returns false for a missing tournament', async () => {
    expect(await cancelTournament('nope')).toBe(false);
  });
});
