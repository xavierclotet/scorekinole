/**
 * Concurrency tests for updateGroupStandings / updateGroupStageTiebreakerPriority.
 *
 * Bug: the transition page saved manual tie resolutions by writing the ENTIRE
 * groupStage from its page-load snapshot (updateTournamentPublic), so two admins
 * resolving ties in different groups silently reverted each other. The finalize
 * page did the same just to change tiebreakerPriority.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import type { Tournament, GroupStanding } from '$lib/types/tournament';

let mockStore: MockFirestore;

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) =>
    new MockDocumentReference(`${collection}/${id}`, id),
  runTransaction: (
    _db: unknown,
    callback: (txn: unknown) => Promise<unknown>,
    options?: { maxAttempts?: number }
  ) => mockStore.runTransaction(callback as any, options?.maxAttempts ? options.maxAttempts - 1 : undefined),
  serverTimestamp: () => Date.now()
}));

vi.mock('./config', () => ({ db: {}, isFirebaseEnabled: () => true }));

vi.mock('./tournaments', () => ({
  getTournament: vi.fn(),
  parseTournamentData: (data: unknown) => data
}));

const { updateGroupStandings, updateGroupStageTiebreakerPriority, updateQualifiers } =
  await import('./tournamentTransition');

function standing(participantId: string, position: number, overrides: Partial<GroupStanding> = {}): GroupStanding {
  return {
    participantId,
    position,
    matchesPlayed: 3,
    matchesWon: 3 - position + 1,
    matchesLost: position - 1,
    matchesTied: 0,
    points: (3 - position + 1) * 2,
    total20s: 0,
    totalPointsScored: 10,
    qualifiedForFinal: false,
    ...overrides
  } as GroupStanding;
}

function makeTwoGroupTournament(): Tournament {
  return {
    id: 'tr1',
    status: 'TRANSITION',
    phaseType: 'TWO_PHASE',
    participants: [],
    groupStage: {
      type: 'ROUND_ROBIN',
      isComplete: true,
      currentRound: 3,
      totalRounds: 3,
      tiebreakerPriority: ['h2h', 'total20s'],
      groups: [
        { id: 'g0', name: 'Grupo A', participants: ['a1', 'a2'], standings: [standing('a1', 1), standing('a2', 2)], schedule: [] },
        { id: 'g1', name: 'Grupo B', participants: ['b1', 'b2'], standings: [standing('b1', 1), standing('b2', 2)], schedule: [] }
      ]
    }
  } as unknown as Tournament;
}

function seed(t: Tournament) {
  mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);
  mockStore.resetStats();
}

function readGroups(id = 'tr1') {
  return (mockStore.getDocument(`tournaments/${id}`)!.data as unknown as Tournament).groupStage!.groups;
}

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

describe('updateGroupStandings', () => {
  it('updates only the target group', async () => {
    seed(makeTwoGroupTournament());

    const newStandings = [standing('a2', 1), standing('a1', 2)]; // tie resolved: swapped
    const ok = await updateGroupStandings('tr1', 0, newStandings);

    expect(ok).toBe(true);
    const groups = readGroups();
    expect((groups[0].standings as GroupStanding[])[0].participantId).toBe('a2');
    // Group B untouched
    expect((groups[1].standings as GroupStanding[])[0].participantId).toBe('b1');
  });

  it('two admins resolving ties in DIFFERENT groups at once — both changes survive', async () => {
    seed(makeTwoGroupTournament());

    const [okA, okB] = await Promise.all([
      updateGroupStandings('tr1', 0, [standing('a2', 1), standing('a1', 2)]),
      updateGroupStandings('tr1', 1, [standing('b2', 1), standing('b1', 2)])
    ]);

    expect(okA).toBe(true);
    expect(okB).toBe(true);
    const groups = readGroups();
    // The old whole-groupStage write lost whichever update committed first.
    expect((groups[0].standings as GroupStanding[])[0].participantId).toBe('a2');
    expect((groups[1].standings as GroupStanding[])[0].participantId).toBe('b2');
  });

  it('standings save concurrent with a qualifier update — both survive', async () => {
    seed(makeTwoGroupTournament());

    const [okStandings, okQualifiers] = await Promise.all([
      updateGroupStandings('tr1', 0, [standing('a2', 1), standing('a1', 2)]),
      updateQualifiers('tr1', 1, ['b1'])
    ]);

    expect(okStandings).toBe(true);
    expect(okQualifiers).toBe(true);
    const groups = readGroups();
    expect((groups[0].standings as GroupStanding[])[0].participantId).toBe('a2');
    expect((groups[1].standings as GroupStanding[]).find(s => s.participantId === 'b1')!.qualifiedForFinal).toBe(true);
  });

  it('fails cleanly when the group does not exist', async () => {
    seed(makeTwoGroupTournament());
    const ok = await updateGroupStandings('tr1', 7, [standing('x', 1)]);
    expect(ok).toBe(false);
  });
});

describe('updateGroupStageTiebreakerPriority', () => {
  it('writes only the tiebreakerPriority field (groups untouched)', async () => {
    seed(makeTwoGroupTournament());

    const ok = await updateGroupStageTiebreakerPriority('tr1', ['total20s', 'h2h']);

    expect(ok).toBe(true);
    const t = mockStore.getDocument('tournaments/tr1')!.data as unknown as Tournament;
    expect(t.groupStage!.tiebreakerPriority).toEqual(['total20s', 'h2h']);
    // Standings untouched
    expect((t.groupStage!.groups[0].standings as GroupStanding[])[0].participantId).toBe('a1');
  });
});
