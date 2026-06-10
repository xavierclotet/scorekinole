/**
 * Tests for disqualifyParticipant standings propagation.
 *
 * Bug: DSQ converted the player's PENDING group matches into WALKOVERs but never
 * recalculated the group standings, so the opponents' walkover wins were missing.
 * In GROUP_ONLY tournaments the finalize flow computes final positions (and the
 * Cloud Function awards ranking points) directly from those stale standings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import type { Tournament, GroupStanding } from '$lib/types/tournament';

// ─── Shared mock state ───────────────────────────────────────────────────────

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

// ─── vi.mock setup ───────────────────────────────────────────────────────────

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

// ─── Import function under test (AFTER mocks) ───────────────────────────────

const { disqualifyParticipant } = await import('./tournamentParticipants');

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * GROUP_ONLY round-robin, 3 players. p1 beat p2; the matches involving p3 are
 * still PENDING. Standings reflect only the completed match (stale on purpose).
 */
function makeGroupOnlyTournament(): Tournament {
  return {
    id: 'dsq-t1',
    status: 'GROUP_STAGE',
    phaseType: 'GROUP_ONLY',
    show20s: true,
    participants: [
      { id: 'p1', type: 'GUEST', name: 'P1', rankingSnapshot: 0, status: 'ACTIVE' },
      { id: 'p2', type: 'GUEST', name: 'P2', rankingSnapshot: 0, status: 'ACTIVE' },
      { id: 'p3', type: 'GUEST', name: 'P3', rankingSnapshot: 0, status: 'ACTIVE' }
    ],
    groupStage: {
      type: 'ROUND_ROBIN',
      qualificationMode: 'WINS',
      currentRound: 1,
      totalRounds: 3,
      isComplete: false,
      groups: [{
        id: 'group-0',
        name: 'Grupo A',
        participants: ['p1', 'p2', 'p3'],
        standings: [
          { participantId: 'p1', position: 1, matchesPlayed: 1, matchesWon: 1, matchesLost: 0, matchesTied: 0, points: 2, total20s: 1, totalPointsScored: 8, qualifiedForFinal: false },
          { participantId: 'p2', position: 2, matchesPlayed: 1, matchesWon: 0, matchesLost: 1, matchesTied: 0, points: 0, total20s: 0, totalPointsScored: 2, qualifiedForFinal: false },
          { participantId: 'p3', position: 3, matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesTied: 0, points: 0, total20s: 0, totalPointsScored: 0, qualifiedForFinal: false }
        ],
        schedule: [
          {
            roundNumber: 1,
            matches: [{
              id: 'gm1', groupId: 'group-0', participantA: 'p1', participantB: 'p2',
              status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 2, total20sA: 1, total20sB: 0
            }]
          },
          {
            roundNumber: 2,
            matches: [{
              id: 'gm2', groupId: 'group-0', participantA: 'p1', participantB: 'p3',
              status: 'PENDING', totalPointsA: 0, totalPointsB: 0, total20sA: 0, total20sB: 0
            }]
          },
          {
            roundNumber: 3,
            matches: [{
              id: 'gm3', groupId: 'group-0', participantA: 'p2', participantB: 'p3',
              status: 'PENDING', totalPointsA: 0, totalPointsB: 0, total20sA: 0, total20sB: 0
            }]
          }
        ]
      }]
    }
  } as unknown as Tournament;
}

/** Recursively assert no `undefined` value anywhere (real Firestore throws on them) */
function expectNoUndefined(obj: unknown, path = 'doc'): void {
  if (obj === null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => expectNoUndefined(v, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    expect(value, `${path}.${key} must not be undefined`).not.toBeUndefined();
    expectNoUndefined(value, `${path}.${key}`);
  }
}

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('disqualifyParticipant — group standings propagation', () => {
  it('marks the DSQ player and converts their pending matches to walkovers', async () => {
    seedTournament(makeGroupOnlyTournament());

    const ok = await disqualifyParticipant('dsq-t1', 'p3');

    expect(ok).toBe(true);
    const t = readTournament('dsq-t1');
    expect(t.participants.find(p => p.id === 'p3')!.status).toBe('DISQUALIFIED');

    const matches = t.groupStage!.groups[0].schedule!.flatMap(r => r.matches);
    const gm2 = matches.find(m => m.id === 'gm2')!;
    const gm3 = matches.find(m => m.id === 'gm3')!;
    expect(gm2.status).toBe('WALKOVER');
    expect(gm2.winner).toBe('p1');
    expect(gm3.status).toBe('WALKOVER');
    expect(gm3.winner).toBe('p2');
  });

  it('recalculates standings in the same transaction (walkover wins counted)', async () => {
    seedTournament(makeGroupOnlyTournament());

    await disqualifyParticipant('dsq-t1', 'p3');

    const t = readTournament('dsq-t1');
    const standings = t.groupStage!.groups[0].standings as GroupStanding[];
    const byId = (id: string) => standings.find(s => s.participantId === id)!;

    // p1: won vs p2 + walkover vs p3 → 2 wins
    expect(byId('p1').matchesWon).toBe(2);
    expect(byId('p1').matchesPlayed).toBe(2);
    // p2: lost vs p1 + walkover win vs p3 → 1 win
    expect(byId('p2').matchesWon).toBe(1);
    expect(byId('p2').matchesPlayed).toBe(2);
    // p3 (DSQ): lost both
    expect(byId('p3').matchesLost).toBe(2);
    expect(byId('p3').matchesWon).toBe(0);

    // Positions follow the new results
    expect(byId('p1').position).toBe(1);
    expect(byId('p2').position).toBe(2);
    expect(byId('p3').position).toBe(3);
  });

  it('writes no undefined values (resolveTiebreaker leaves optional fields)', async () => {
    seedTournament(makeGroupOnlyTournament());

    await disqualifyParticipant('dsq-t1', 'p3');

    expectNoUndefined(readTournament('dsq-t1'));
  });

  it('does not touch standings of groups the player is not in', async () => {
    const t = makeGroupOnlyTournament();
    (t.groupStage!.groups as unknown[]).push({
      id: 'group-1',
      name: 'Grupo B',
      participants: ['p4', 'p5'],
      standings: [
        { participantId: 'p4', position: 1, matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesTied: 0, points: 0, total20s: 0, totalPointsScored: 0, qualifiedForFinal: false },
        { participantId: 'p5', position: 2, matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesTied: 0, points: 99, total20s: 0, totalPointsScored: 0, qualifiedForFinal: false }
      ],
      schedule: []
    });
    seedTournament(t);

    await disqualifyParticipant('dsq-t1', 'p3');

    const after = readTournament('dsq-t1');
    // Group B untouched (its sentinel value survives — no recalculation ran there)
    const groupB = after.groupStage!.groups.find(g => g.id === 'group-1')!;
    expect((groupB.standings as GroupStanding[]).find(s => s.participantId === 'p5')!.points).toBe(99);
  });
});
