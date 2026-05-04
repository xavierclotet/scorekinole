import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import {
  createTestTournament,
  completeTestTournament,
  findMatchInTournament
} from './__mocks__/testTournamentFactory';
import type { Tournament } from '$lib/types/tournament';

let mockStore: MockFirestore;

function seedTournament(tournament: Tournament): void {
  mockStore.setDocument(`tournaments/${tournament.id}`, tournament as unknown as Record<string, unknown>);
  mockStore.resetStats();
}

function readTournament(tournamentId: string): Tournament {
  const doc = mockStore.getDocument(`tournaments/${tournamentId}`);
  if (!doc) throw new Error(`Tournament ${tournamentId} not found`);
  return doc.data as unknown as Tournament;
}

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

vi.mock('./config', () => ({
  db: {},
  isFirebaseEnabled: () => true
}));

vi.mock('./tournaments', () => ({
  parseTournamentData: (data: unknown) => data,
  getTournament: vi.fn()
}));

// Allow toggling the superadmin response per-test
const isSuperAdminMock = vi.fn();
vi.mock('./admin', () => ({
  isSuperAdmin: () => isSuperAdminMock()
}));

const { editCompletedMatch20s } = await import('./tournamentMatches');

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
  isSuperAdminMock.mockResolvedValue(true);
});

describe('editCompletedMatch20s — group match', () => {
  it('updates rounds[].twentiesA/B and recalculates total20s for a group match', async () => {
    const t = completeTestTournament(createTestTournament({ numParticipants: 4 }));
    seedTournament(t);

    const match = t.groupStage!.groups[0].schedule![0].matches[0];
    const matchId = match.id;
    const groupIndex = 0;

    // Original twenties: each round has twentiesA=1, twentiesB=0; total20sA=4, total20sB=0
    expect(match.total20sA).toBe(4);

    await editCompletedMatch20s(t.id, matchId, { type: 'group', groupIndex }, [
      { gameNumber: 1, roundInGame: 1, twentiesA: 0, twentiesB: 2 },
      { gameNumber: 1, roundInGame: 2, twentiesA: 1, twentiesB: 1 },
      { gameNumber: 1, roundInGame: 3, twentiesA: 2, twentiesB: 0 },
      { gameNumber: 1, roundInGame: 4, twentiesA: 0, twentiesB: 1 }
    ]);

    const after = readTournament(t.id);
    const updated = findMatchInTournament(after, matchId);
    expect(updated).toBeDefined();
    expect(updated!.rounds!.map(r => r.twentiesA)).toEqual([0, 1, 2, 0]);
    expect(updated!.rounds!.map(r => r.twentiesB)).toEqual([2, 1, 0, 1]);
    expect(updated!.total20sA).toBe(3);
    expect(updated!.total20sB).toBe(4);
    // Winner / scores untouched
    expect(updated!.winner).toBe(match.participantA);
    expect(updated!.gamesWonA).toBe(1);
    expect(updated!.totalPointsA).toBe(16);
  });
});

describe('editCompletedMatch20s — guards', () => {
  it('rejects when caller is not super-admin', async () => {
    isSuperAdminMock.mockResolvedValueOnce(false);
    const t = completeTestTournament(createTestTournament({ numParticipants: 4 }));
    seedTournament(t);
    const match = t.groupStage!.groups[0].schedule![0].matches[0];
    await expect(
      editCompletedMatch20s(t.id, match.id, { type: 'group', groupIndex: 0 }, [
        { gameNumber: 1, roundInGame: 1, twentiesA: 0, twentiesB: 0 }
      ])
    ).rejects.toThrow(/super-admin/);
  });

  it('rejects when tournament is not COMPLETED', async () => {
    const t = createTestTournament({ numParticipants: 4 }); // remains IN_PROGRESS
    seedTournament(t);
    const match = t.groupStage!.groups[0].schedule![0].matches[0];
    // Force the match into COMPLETED state with rounds for this test
    match.status = 'COMPLETED';
    match.rounds = [
      { gameNumber: 1, roundInGame: 1, pointsA: 4, pointsB: 2, twentiesA: 1, twentiesB: 0 }
    ];
    mockStore.setDocument(`tournaments/${t.id}`, t as unknown as Record<string, unknown>);
    await expect(
      editCompletedMatch20s(t.id, match.id, { type: 'group', groupIndex: 0 }, [
        { gameNumber: 1, roundInGame: 1, twentiesA: 0, twentiesB: 0 }
      ])
    ).rejects.toThrow(/COMPLETED/);
  });

  it('rejects when match is WALKOVER', async () => {
    const t = completeTestTournament(createTestTournament({ numParticipants: 4 }));
    const match = t.groupStage!.groups[0].schedule![0].matches[0];
    match.status = 'WALKOVER';
    seedTournament(t);
    await expect(
      editCompletedMatch20s(t.id, match.id, { type: 'group', groupIndex: 0 }, [
        { gameNumber: 1, roundInGame: 1, twentiesA: 0, twentiesB: 0 }
      ])
    ).rejects.toThrow(/COMPLETED/);
  });

  it('rejects negative twenties value', async () => {
    const t = completeTestTournament(createTestTournament({ numParticipants: 4 }));
    seedTournament(t);
    const match = t.groupStage!.groups[0].schedule![0].matches[0];
    await expect(
      editCompletedMatch20s(t.id, match.id, { type: 'group', groupIndex: 0 }, [
        { gameNumber: 1, roundInGame: 1, twentiesA: -1, twentiesB: 0 }
      ])
    ).rejects.toThrow(/Invalid twentiesA/);
  });

  it('rejects unknown round (gameNumber, roundInGame) pair', async () => {
    const t = completeTestTournament(createTestTournament({ numParticipants: 4 }));
    seedTournament(t);
    const match = t.groupStage!.groups[0].schedule![0].matches[0];
    await expect(
      editCompletedMatch20s(t.id, match.id, { type: 'group', groupIndex: 0 }, [
        { gameNumber: 9, roundInGame: 9, twentiesA: 0, twentiesB: 0 }
      ])
    ).rejects.toThrow(/not found/);
  });
});

describe('editCompletedMatch20s — bracket match', () => {
  it('updates twenties on a gold bracket main-round match', async () => {
    const t = completeTestTournament(createTestTournament({ numParticipants: 4 })) as Tournament;
    // Bolt on a minimal finalStage with one match
    (t as any).finalStage = {
      mode: 'SINGLE_BRACKET',
      isComplete: true,
      goldBracket: {
        rounds: [
          {
            roundNumber: 1,
            name: 'Final',
            matches: [
              {
                id: 'br-final',
                position: 0,
                participantA: 'player-1',
                participantB: 'player-2',
                status: 'COMPLETED',
                winner: 'player-1',
                gamesWonA: 1,
                gamesWonB: 0,
                totalPointsA: 16,
                totalPointsB: 8,
                total20sA: 4,
                total20sB: 0,
                rounds: [
                  { gameNumber: 1, roundInGame: 1, pointsA: 4, pointsB: 2, twentiesA: 1, twentiesB: 0 },
                  { gameNumber: 1, roundInGame: 2, pointsA: 4, pointsB: 2, twentiesA: 1, twentiesB: 0 },
                  { gameNumber: 1, roundInGame: 3, pointsA: 4, pointsB: 2, twentiesA: 1, twentiesB: 0 },
                  { gameNumber: 1, roundInGame: 4, pointsA: 4, pointsB: 2, twentiesA: 1, twentiesB: 0 }
                ]
              }
            ]
          }
        ],
        totalRounds: 1,
        config: { gameMode: 'rounds', roundsToPlay: 4, pointsToWin: 7, matchesToWin: 1 } as any
      }
    };
    seedTournament(t);

    await editCompletedMatch20s(
      t.id,
      'br-final',
      { type: 'bracket', bracketKey: 'gold', section: 'main' },
      [
        { gameNumber: 1, roundInGame: 1, twentiesA: 0, twentiesB: 3 },
        { gameNumber: 1, roundInGame: 2, twentiesA: 0, twentiesB: 0 },
        { gameNumber: 1, roundInGame: 3, twentiesA: 0, twentiesB: 0 },
        { gameNumber: 1, roundInGame: 4, twentiesA: 0, twentiesB: 0 }
      ]
    );

    const after = readTournament(t.id);
    const fs = (after as any).finalStage;
    const m = fs.goldBracket.rounds[0].matches[0];
    expect(m.total20sA).toBe(0);
    expect(m.total20sB).toBe(3);
    expect(m.winner).toBe('player-1'); // unchanged
  });
});
