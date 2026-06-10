/**
 * Regression tests for createTournament dropping wizard-built fields.
 *
 * Bug: createTournament copies an explicit whitelist of optional fields from the
 * wizard payload. `registration`, `finalStageMinQualifiers` and `timeEstimate`
 * were missing from that whitelist, so a tournament created with registration
 * enabled silently lost the whole registration config (players could never
 * self-register), min-qualifiers fell back to 8, and the time estimate vanished.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import type { Tournament } from '$lib/types/tournament';

let mockStore: MockFirestore;

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) =>
    new MockDocumentReference(`${collection}/${id}`, id),
  setDoc: async (ref: MockDocumentReference, data: Record<string, unknown>) => {
    mockStore.setDocument(ref.path, data);
  },
  runTransaction: (_db: unknown, callback: (txn: unknown) => Promise<unknown>) =>
    mockStore.runTransaction(callback as any),
  serverTimestamp: () => Date.now(),
  Timestamp: class {}
}));

vi.mock('./config', () => ({ db: {}, isFirebaseEnabled: () => true }));

vi.mock('./auth', async () => {
  const { writable } = await import('svelte/store');
  return { currentUser: writable({ id: 'admin1', name: 'Admin', email: 'admin@x.com' }) };
});

vi.mock('./admin', () => ({
  isAdmin: async () => true,
  isSuperAdmin: async () => true // bypasses quota check
}));

vi.mock('./userProfile', () => ({ getUserProfile: async () => ({ key: 'adminkey', playerName: 'Admin' }) }));

const { createTournament } = await import('./tournaments');

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

function createdDoc(id: string): Record<string, unknown> {
  return mockStore.getDocument(`tournaments/${id}`)!.data;
}

describe('createTournament — wizard fields must survive into Firestore', () => {
  it('persists the registration config built by the wizard', async () => {
    const registration = {
      enabled: true,
      deadline: Date.now() + 86_400_000,
      maxParticipants: 16,
      entryFee: '5€',
      allowWaitlist: true,
      notifyOnRegistration: true,
      showParticipantList: true
    };

    const id = await createTournament({ key: 'ABC123', name: 'Open', registration } as Partial<Tournament>);

    expect(id).toBeTruthy();
    const doc = createdDoc(id!);
    expect(doc.registration).toEqual(registration);
  });

  it('persists finalStageMinQualifiers', async () => {
    const id = await createTournament({
      key: 'ABC123',
      name: 'Open',
      phaseType: 'TWO_PHASE',
      finalStageMinQualifiers: 16
    } as Partial<Tournament>);

    expect(id).toBeTruthy();
    expect(createdDoc(id!).finalStageMinQualifiers).toBe(16);
  });

  it('persists timeEstimate', async () => {
    const timeEstimate = { totalMinutes: 240, groupStageMinutes: 150, finalStageMinutes: 90 };
    const id = await createTournament({ key: 'ABC123', name: 'Open', timeEstimate } as unknown as Partial<Tournament>);

    expect(id).toBeTruthy();
    expect(createdDoc(id!).timeEstimate).toEqual(timeEstimate);
  });

  it('omits registration entirely when the wizard did not send one (legacy payloads)', async () => {
    const id = await createTournament({ key: 'ABC123', name: 'Open' } as Partial<Tournament>);

    expect(id).toBeTruthy();
    expect('registration' in createdDoc(id!)).toBe(false);
  });

  it('a disabled registration config (enabled:false) is still persisted as-is', async () => {
    // buildRegistrationConfig now returns { enabled: false, ... } instead of undefined
    // so edit mode can close an open registration; create mode must store it too.
    const registration = {
      enabled: false,
      allowWaitlist: true,
      notifyOnRegistration: true,
      showParticipantList: true
    };
    const id = await createTournament({ key: 'ABC123', name: 'Open', registration } as Partial<Tournament>);

    expect(id).toBeTruthy();
    expect((createdDoc(id!).registration as { enabled: boolean }).enabled).toBe(false);
  });
});
