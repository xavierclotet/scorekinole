/**
 * Tests for createHistoricalTournament (IMPORTED tournament creation)
 *
 * Verifies the data transformation pipeline:
 * - Participant name→ID mapping
 * - Match stats accumulation (wins, losses, ties, 20s, points)
 * - H2H record building
 * - Tiebreaker resolution (uses REAL resolveTiebreaker algorithm)
 * - Bracket construction (SINGLE_BRACKET, SPLIT_DIVISIONS, PARALLEL_BRACKETS)
 * - numTables auto-calculation
 * - BYE bonus for odd players
 *
 * Firebase I/O is mocked. Only data logic is tested.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  HistoricalTournamentInput,
  HistoricalGroupStageInput,
  HistoricalFinalStageInput
} from './tournamentImport';

// ─── Mock state ─────────────────────────────────────────────────────────────

/** Captured tournament documents written via setDoc */
let capturedDocs: Record<string, Record<string, unknown>> = {};

// ─── vi.mock setup ──────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
  db: { type: 'mock-db' },
  isFirebaseEnabled: () => true
}));

// Mock auth — provide a fake current user
const mockUser = { id: 'admin-user-1', name: 'Admin User' };
vi.mock('./auth', () => {
  const { writable } = require('svelte/store');
  return {
    currentUser: writable(mockUser)
  };
});

// Mock admin — always allow import
vi.mock('./admin', () => ({
  isAdmin: async () => true,
  isSuperAdmin: async () => true
}));

// Mock user profile
vi.mock('./userProfile', () => ({
  getUserProfile: async () => ({ playerName: 'Admin Player', canImportTournaments: true }),
  getUserProfileById: async () => null
}));

// Mock firebase/firestore — capture setDoc calls
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}`, id }),
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    capturedDocs[ref.path] = data;
  },
  getDoc: async () => ({ exists: () => false }),
  getDocs: async () => ({ empty: true, forEach: () => {} }),
  collection: (_db: unknown, name: string) => ({ name }),
  query: (...args: unknown[]) => args,
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ field }),
  limit: (n: number) => ({ n }),
  serverTimestamp: () => Date.now(),
  Timestamp: class MockTimestamp {
    _ms: number;
    constructor(seconds: number, nanoseconds: number) { this._ms = seconds * 1000 + nanoseconds / 1e6; }
    toMillis() { return this._ms; }
    static fromMillis(ms: number) { const t = new MockTimestamp(0, 0); t._ms = ms; return t; }
  }
}));

// Import AFTER mocks
const { createHistoricalTournament } = await import('./tournamentImport');

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedDocs = {};
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get the first captured tournament document */
function getCapturedTournament(): Record<string, unknown> | null {
  const keys = Object.keys(capturedDocs);
  if (keys.length === 0) return null;
  return capturedDocs[keys[0]];
}

/** Base input with minimal required fields */
function baseInput(overrides?: Partial<HistoricalTournamentInput>): HistoricalTournamentInput {
  return {
    name: 'Test Imported Tournament',
    tournamentDate: Date.now() - 86400000,
    city: 'Barcelona',
    country: 'ES',
    gameType: 'singles',
    rankingConfig: { enabled: true, category: 'REGULAR', eventType: 'SINGLES' },
    phaseType: 'GROUP_ONLY',
    participants: [],
    ...overrides
  };
}

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('createHistoricalTournament: GROUP_ONLY with match data', () => {
  it('creates tournament with correct standings from match results', async () => {
    const input = baseInput({
      participants: [
        { name: 'Alice', finalPosition: 1 },
        { name: 'Bob', finalPosition: 2 },
        { name: 'Charlie', finalPosition: 3 },
        { name: 'Diana', finalPosition: 4 }
      ],
      groupStage: {
        numGroups: 1,
        qualificationMode: 'WINS',
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 6 },
            { participantName: 'Bob', position: 2, points: 4 },
            { participantName: 'Charlie', position: 3, points: 2 },
            { participantName: 'Diana', position: 4, points: 0 }
          ],
          schedule: [
            {
              roundNumber: 1,
              matches: [
                { participantAName: 'Alice', participantBName: 'Bob', scoreA: 8, scoreB: 4 },
                { participantAName: 'Charlie', participantBName: 'Diana', scoreA: 6, scoreB: 2 }
              ]
            },
            {
              roundNumber: 2,
              matches: [
                { participantAName: 'Alice', participantBName: 'Charlie', scoreA: 7, scoreB: 3 },
                { participantAName: 'Bob', participantBName: 'Diana', scoreA: 5, scoreB: 1 }
              ]
            },
            {
              roundNumber: 3,
              matches: [
                { participantAName: 'Alice', participantBName: 'Diana', scoreA: 8, scoreB: 0 },
                { participantAName: 'Bob', participantBName: 'Charlie', scoreA: 6, scoreB: 4 }
              ]
            }
          ]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    expect(id).not.toBeNull();

    const doc = getCapturedTournament();
    expect(doc).not.toBeNull();

    // Status is COMPLETED with isImported flag
    expect(doc!.status).toBe('COMPLETED');
    expect(doc!.isImported).toBe(true);
    expect(doc!.phaseType).toBe('GROUP_ONLY');

    // Group stage built correctly
    const gs = doc!.groupStage as any;
    expect(gs).toBeDefined();
    expect(gs.isComplete).toBe(true);
    expect(gs.groups.length).toBe(1);

    const group = gs.groups[0];
    expect(group.standings.length).toBe(4);

    // Standings should be sorted by tiebreaker (wins-based)
    // Alice: 3W, Bob: 2W, Charlie: 1W, Diana: 0W
    const standings = group.standings;
    expect(standings[0].matchesWon).toBe(3);
    expect(standings[0].matchesLost).toBe(0);
    expect(standings[0].matchesPlayed).toBe(3);

    // Check schedule was built
    expect(group.schedule.length).toBe(3);
    expect(group.schedule[0].matches.length).toBe(2);

    // Matches have participant IDs (not names)
    const m1 = group.schedule[0].matches[0];
    expect(m1.status).toBe('COMPLETED');
    expect(m1.totalPointsA).toBe(8);
    expect(m1.totalPointsB).toBe(4);
    expect(m1.winner).toBeDefined();
  });

  it('builds head-to-head records from match data', async () => {
    const input = baseInput({
      participants: [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ],
      groupStage: {
        numGroups: 1,
        qualificationMode: 'WINS',
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 4 },
            { participantName: 'Bob', position: 2, points: 2 },
            { participantName: 'Charlie', position: 3, points: 0 }
          ],
          schedule: [
            {
              roundNumber: 1,
              matches: [
                { participantAName: 'Alice', participantBName: 'Bob', scoreA: 8, scoreB: 4 }
              ]
            },
            {
              roundNumber: 2,
              matches: [
                { participantAName: 'Alice', participantBName: 'Charlie', scoreA: 7, scoreB: 3 }
              ]
            },
            {
              roundNumber: 3,
              matches: [
                { participantAName: 'Bob', participantBName: 'Charlie', scoreA: 6, scoreB: 2 }
              ]
            }
          ]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    expect(id).not.toBeNull();

    const doc = getCapturedTournament();
    const group = (doc!.groupStage as any).groups[0];

    // Find Alice's standing — she has position 1 (most wins after BYE bonus: 2 real + 1 BYE = 3)
    const aliceStanding = group.standings.find((s: any) => s.position === 1);
    expect(aliceStanding).toBeDefined();
    expect(aliceStanding.headToHeadRecord).toBeDefined();

    // Alice should have H2H against Bob and Charlie (BYE rounds don't create H2H)
    const h2hKeys = Object.keys(aliceStanding.headToHeadRecord);
    expect(h2hKeys.length).toBe(2);

    // Both should be WINs for Alice
    for (const key of h2hKeys) {
      expect(aliceStanding.headToHeadRecord[key].result).toBe('WIN');
    }
  });

  it('accumulates 20s from round-level data', async () => {
    const input = baseInput({
      participants: [
        { name: 'Alice' },
        { name: 'Bob' }
      ],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 2 },
            { participantName: 'Bob', position: 2, points: 0 }
          ],
          schedule: [{
            roundNumber: 1,
            matches: [{
              participantAName: 'Alice',
              participantBName: 'Bob',
              scoreA: 8,
              scoreB: 2,
              rounds: [
                { pointsA: 5, pointsB: 0, twentiesA: 2, twentiesB: 0 },
                { pointsA: 1, pointsB: 0, twentiesA: 0, twentiesB: 1 },
                { pointsA: 2, pointsB: 2, twentiesA: 1, twentiesB: 0 },
                { pointsA: 0, pointsB: 0, twentiesA: 0, twentiesB: 0 }
              ]
            }]
          }]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();
    const group = (doc!.groupStage as any).groups[0];

    // 20s summed from rounds: Alice = 2+0+1+0 = 3, Bob = 0+1+0+0 = 1
    const match = group.schedule[0].matches[0];
    expect(match.total20sA).toBe(3);
    expect(match.total20sB).toBe(1);

    // Standings should also reflect totals
    const aliceStanding = group.standings.find((s: any) => s.total20s === 3);
    expect(aliceStanding).toBeDefined();
  });

  it('handles tie in match (no winner)', async () => {
    const input = baseInput({
      participants: [
        { name: 'Alice' },
        { name: 'Bob' }
      ],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 1 },
            { participantName: 'Bob', position: 2, points: 1 }
          ],
          schedule: [{
            roundNumber: 1,
            matches: [{
              participantAName: 'Alice',
              participantBName: 'Bob',
              scoreA: 4,
              scoreB: 4
            }]
          }]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();
    const match = (doc!.groupStage as any).groups[0].schedule[0].matches[0];

    // Tie — no winner should be set
    expect(match.winner).toBeUndefined();
    expect(match.totalPointsA).toBe(4);
    expect(match.totalPointsB).toBe(4);
  });
});

describe('createHistoricalTournament: bracket modes', () => {
  it('SINGLE_BRACKET: builds bracket with correct winners', async () => {
    const input = baseInput({
      phaseType: 'TWO_PHASE',
      participants: [
        { name: 'Alice', finalPosition: 1 },
        { name: 'Bob', finalPosition: 2 },
        { name: 'Charlie', finalPosition: 3 },
        { name: 'Diana', finalPosition: 4 }
      ],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 6 },
            { participantName: 'Bob', position: 2, points: 4 },
            { participantName: 'Charlie', position: 3, points: 2 },
            { participantName: 'Diana', position: 4, points: 0 }
          ]
        }]
      },
      finalStage: {
        mode: 'SINGLE_BRACKET',
        brackets: [{
          name: 'Final',
          label: 'A',
          sourcePositions: [1, 2, 3, 4],
          rounds: [
            {
              name: 'Semifinales',
              matches: [
                { participantAName: 'Alice', participantBName: 'Diana', scoreA: 8, scoreB: 2 },
                { participantAName: 'Bob', participantBName: 'Charlie', scoreA: 7, scoreB: 5 }
              ]
            },
            {
              name: 'Final',
              matches: [
                { participantAName: 'Alice', participantBName: 'Bob', scoreA: 8, scoreB: 4 }
              ]
            }
          ]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();

    expect(doc!.phaseType).toBe('TWO_PHASE');

    const fs = doc!.finalStage as any;
    expect(fs).toBeDefined();
    expect(fs.mode).toBe('SINGLE_BRACKET');
    expect(fs.isComplete).toBe(true);

    // Gold bracket
    expect(fs.goldBracket.rounds.length).toBe(2);

    // Semis
    const semis = fs.goldBracket.rounds[0].matches;
    expect(semis.length).toBe(2);
    expect(semis[0].status).toBe('COMPLETED');
    expect(semis[0].totalPointsA).toBe(8);

    // Final — winner should be Alice's participant ID
    const finalMatch = fs.goldBracket.rounds[1].matches[0];
    expect(finalMatch.status).toBe('COMPLETED');
    expect(finalMatch.winner).toBeDefined();

    // Tournament winner should match final match winner
    expect(fs.winner).toBe(finalMatch.winner);
  });

  it('PARALLEL_BRACKETS: builds A/B/C brackets', async () => {
    const input = baseInput({
      phaseType: 'TWO_PHASE',
      participants: [
        { name: 'Alice', finalPosition: 1 },
        { name: 'Bob', finalPosition: 2 },
        { name: 'Charlie', finalPosition: 3 },
        { name: 'Diana', finalPosition: 4 }
      ],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 6 },
            { participantName: 'Bob', position: 2, points: 4 },
            { participantName: 'Charlie', position: 3, points: 2 },
            { participantName: 'Diana', position: 4, points: 0 }
          ]
        }]
      },
      finalStage: {
        mode: 'PARALLEL_BRACKETS',
        brackets: [
          {
            name: 'A Finals',
            label: 'A',
            sourcePositions: [1, 2],
            rounds: [{
              name: 'Final A',
              matches: [{ participantAName: 'Alice', participantBName: 'Bob', scoreA: 8, scoreB: 4 }]
            }]
          },
          {
            name: 'B Finals',
            label: 'B',
            sourcePositions: [3, 4],
            rounds: [{
              name: 'Final B',
              matches: [{ participantAName: 'Charlie', participantBName: 'Diana', scoreA: 6, scoreB: 2 }]
            }]
          }
        ]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();
    const fs = doc!.finalStage as any;

    expect(fs.mode).toBe('PARALLEL_BRACKETS');
    expect(fs.parallelBrackets.length).toBe(2);

    // A bracket
    const bracketA = fs.parallelBrackets[0];
    expect(bracketA.label).toBe('A');
    expect(bracketA.name).toBe('A Finals');
    expect(bracketA.bracket.rounds.length).toBe(1);
    expect(bracketA.winner).toBeDefined();

    // B bracket
    const bracketB = fs.parallelBrackets[1];
    expect(bracketB.label).toBe('B');
    expect(bracketB.winner).toBeDefined();

    // goldBracket should be first bracket (A) for compatibility
    expect(fs.goldBracket.rounds.length).toBe(1);
  });

  it('SPLIT_DIVISIONS: gold and silver brackets', async () => {
    const input = baseInput({
      phaseType: 'TWO_PHASE',
      participants: [
        { name: 'Alice', finalPosition: 1 },
        { name: 'Bob', finalPosition: 2 },
        { name: 'Charlie', finalPosition: 3 },
        { name: 'Diana', finalPosition: 4 }
      ],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 6 },
            { participantName: 'Bob', position: 2, points: 4 },
            { participantName: 'Charlie', position: 3, points: 2 },
            { participantName: 'Diana', position: 4, points: 0 }
          ]
        }]
      },
      finalStage: {
        mode: 'SPLIT_DIVISIONS',
        brackets: [
          {
            name: 'Gold',
            label: 'Gold',
            sourcePositions: [1, 2],
            rounds: [{
              name: 'Gold Final',
              matches: [{ participantAName: 'Alice', participantBName: 'Bob', scoreA: 8, scoreB: 4 }]
            }]
          },
          {
            name: 'Silver',
            label: 'Silver',
            sourcePositions: [3, 4],
            rounds: [{
              name: 'Silver Final',
              matches: [{ participantAName: 'Charlie', participantBName: 'Diana', scoreA: 6, scoreB: 2 }]
            }]
          }
        ]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();
    const fs = doc!.finalStage as any;

    expect(fs.mode).toBe('SPLIT_DIVISIONS');
    expect(fs.goldBracket).toBeDefined();
    expect(fs.silverBracket).toBeDefined();
    expect(fs.isComplete).toBe(true);

    // Gold winner
    expect(fs.winner).toBeDefined();
    // Silver winner
    expect(fs.silverWinner).toBeDefined();
    expect(fs.winner).not.toBe(fs.silverWinner);
  });
});

describe('createHistoricalTournament: numTables calculation', () => {
  it('numTables = max(numGroups, first-round bracket matches)', async () => {
    // 2 groups + single bracket with 4 first-round matches → numTables should be 4
    const input = baseInput({
      phaseType: 'TWO_PHASE',
      participants: Array.from({ length: 8 }, (_, i) => ({ name: `P${i + 1}` })),
      groupStage: {
        numGroups: 2,
        groups: [
          { name: 'A', standings: [{ participantName: 'P1', position: 1, points: 0 }] },
          { name: 'B', standings: [{ participantName: 'P5', position: 1, points: 0 }] }
        ]
      },
      finalStage: {
        mode: 'SINGLE_BRACKET',
        brackets: [{
          name: 'Final',
          label: 'A',
          sourcePositions: [1, 2, 3, 4],
          rounds: [
            {
              name: 'Cuartos',
              matches: [
                { participantAName: 'P1', participantBName: 'P8', scoreA: 8, scoreB: 2 },
                { participantAName: 'P2', participantBName: 'P7', scoreA: 7, scoreB: 3 },
                { participantAName: 'P3', participantBName: 'P6', scoreA: 6, scoreB: 4 },
                { participantAName: 'P4', participantBName: 'P5', scoreA: 5, scoreB: 3 }
              ]
            },
            {
              name: 'Final',
              matches: [
                { participantAName: 'P1', participantBName: 'P2', scoreA: 8, scoreB: 4 }
              ]
            }
          ]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();

    // 4 first-round bracket matches > 2 groups → numTables = 4
    expect(doc!.numTables).toBe(4);
  });

  it('numTables uses groups when no bracket first round', async () => {
    const input = baseInput({
      participants: Array.from({ length: 12 }, (_, i) => ({ name: `P${i + 1}` })),
      groupStage: {
        numGroups: 3,
        groups: [
          { name: 'A', standings: [{ participantName: 'P1', position: 1, points: 0 }] },
          { name: 'B', standings: [{ participantName: 'P5', position: 1, points: 0 }] },
          { name: 'C', standings: [{ participantName: 'P9', position: 1, points: 0 }] }
        ]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();

    // 3 groups, no bracket → numTables = 3
    expect(doc!.numTables).toBe(3);
  });
});

describe('createHistoricalTournament: doubles', () => {
  it('creates participants with partner fields', async () => {
    const input = baseInput({
      gameType: 'doubles',
      participants: [
        { name: 'Alice', partnerName: 'Bob', finalPosition: 1 },
        { name: 'Charlie', partnerName: 'Diana', finalPosition: 2 }
      ],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 2 },
            { participantName: 'Charlie', position: 2, points: 0 }
          ],
          schedule: [{
            roundNumber: 1,
            matches: [{
              participantAName: 'Alice',
              participantBName: 'Charlie',
              scoreA: 8,
              scoreB: 4
            }]
          }]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();

    const participants = doc!.participants as any[];
    expect(participants.length).toBe(2);

    // First participant should have partner
    const alice = participants.find((p: any) => p.name === 'Alice');
    expect(alice).toBeDefined();
    expect(alice.partner).toBeDefined();
    expect(alice.partner.name).toBe('Bob');
    expect(alice.partner.type).toBe('GUEST');

    expect(doc!.gameType).toBe('doubles');
  });

  it('resolves team name with "/" separator', async () => {
    // Doubles team names use "Name / Partner" format
    const input = baseInput({
      gameType: 'doubles',
      participants: [
        { name: 'Alice', partnerName: 'Bob' },
        { name: 'Charlie', partnerName: 'Diana' }
      ],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 2 },
            { participantName: 'Charlie', position: 2, points: 0 }
          ],
          schedule: [{
            roundNumber: 1,
            matches: [{
              // Match uses the full team name "Alice / Bob"
              participantAName: 'Alice / Bob',
              participantBName: 'Charlie / Diana',
              scoreA: 8,
              scoreB: 4
            }]
          }]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();

    const group = (doc!.groupStage as any).groups[0];
    const match = group.schedule[0].matches[0];

    // Should resolve team names via the participantMap (which maps "alice / bob" → id)
    expect(match.participantA).not.toContain('unknown');
    expect(match.participantB).not.toContain('unknown');
    expect(match.status).toBe('COMPLETED');
  });
});

describe('createHistoricalTournament: edge cases', () => {
  it('walkover match has correct status', async () => {
    const input = baseInput({
      participants: [
        { name: 'Alice' },
        { name: 'Bob' }
      ],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 2 },
            { participantName: 'Bob', position: 2, points: 0 }
          ],
          schedule: [{
            roundNumber: 1,
            matches: [{
              participantAName: 'Alice',
              participantBName: 'Bob',
              scoreA: 8,
              scoreB: 0,
              isWalkover: true
            }]
          }]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();
    const match = (doc!.groupStage as any).groups[0].schedule[0].matches[0];

    expect(match.status).toBe('WALKOVER');
  });

  it('tournament metadata is set correctly', async () => {
    const date = new Date('2024-06-15').getTime();
    const input = baseInput({
      name: 'Campionat de Catalunya 2024',
      description: 'Torneig oficial',
      edition: 5,
      tournamentDate: date,
      tournamentTime: '10:00',
      address: 'Carrer Principal 1',
      city: 'Girona',
      country: 'ES',
      externalLink: 'https://example.com/torneig',
      show20s: false,
      showHammer: true,
      isTest: false,
      participants: [{ name: 'Alice' }],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'A',
          standings: [{ participantName: 'Alice', position: 1, points: 0 }]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();

    expect(doc!.name).toBe('Campionat de Catalunya 2024');
    expect(doc!.description).toBe('Torneig oficial');
    expect(doc!.edition).toBe(5);
    expect(doc!.tournamentDate).toBe(date);
    expect(doc!.tournamentTime).toBe('10:00');
    expect(doc!.address).toBe('Carrer Principal 1');
    expect(doc!.city).toBe('Girona');
    expect(doc!.country).toBe('ES');
    expect(doc!.externalLink).toBe('https://example.com/torneig');
    expect(doc!.show20s).toBe(false);
    expect(doc!.showHammer).toBe(true);
    expect(doc!.isTest).toBe(false);
    expect(doc!.isImported).toBe(true);
    expect(doc!.startedAt).toBe(date);
    expect(doc!.completedAt).toBe(date);
  });

  it('POINTS qualification mode uses totalPointsScored for points', async () => {
    const input = baseInput({
      participants: [
        { name: 'Alice' },
        { name: 'Bob' }
      ],
      groupStage: {
        numGroups: 1,
        qualificationMode: 'POINTS',
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 8 },
            { participantName: 'Bob', position: 2, points: 4 }
          ],
          schedule: [{
            roundNumber: 1,
            matches: [{
              participantAName: 'Alice',
              participantBName: 'Bob',
              scoreA: 8,
              scoreB: 4
            }]
          }]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();
    const group = (doc!.groupStage as any).groups[0];

    // In POINTS mode, standings points = totalPointsScored (not wins*2)
    const standings = group.standings;
    const aliceStanding = standings.find((s: any) => s.totalPointsScored === 8);
    expect(aliceStanding).toBeDefined();
    // POINTS mode: points = totalPoints scored
    expect(aliceStanding.points).toBe(8);

    const gs = doc!.groupStage as any;
    expect(gs.qualificationMode).toBe('POINTS');
  });

  it('missing participant name falls back to unknown-{name}', async () => {
    const input = baseInput({
      participants: [
        { name: 'Alice' }
        // Bob is NOT in participants
      ],
      groupStage: {
        numGroups: 1,
        groups: [{
          name: 'Grupo A',
          standings: [
            { participantName: 'Alice', position: 1, points: 2 },
            { participantName: 'Bob', position: 2, points: 0 }  // Bob missing from participants
          ],
          schedule: [{
            roundNumber: 1,
            matches: [{
              participantAName: 'Alice',
              participantBName: 'Bob',  // Bob not in participant map
              scoreA: 8,
              scoreB: 4
            }]
          }]
        }]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();
    const match = (doc!.groupStage as any).groups[0].schedule[0].matches[0];

    // Alice should resolve normally
    expect(match.participantA).not.toContain('unknown');
    // Bob should get unknown fallback
    expect(match.participantB).toContain('unknown');
  });

  it('multiple groups produce independent standings', async () => {
    const input = baseInput({
      participants: [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' },
        { name: 'Diana' }
      ],
      groupStage: {
        numGroups: 2,
        groups: [
          {
            name: 'Grupo A',
            standings: [
              { participantName: 'Alice', position: 1, points: 2 },
              { participantName: 'Bob', position: 2, points: 0 }
            ],
            schedule: [{
              roundNumber: 1,
              matches: [{ participantAName: 'Alice', participantBName: 'Bob', scoreA: 8, scoreB: 4 }]
            }]
          },
          {
            name: 'Grupo B',
            standings: [
              { participantName: 'Charlie', position: 1, points: 2 },
              { participantName: 'Diana', position: 2, points: 0 }
            ],
            schedule: [{
              roundNumber: 1,
              matches: [{ participantAName: 'Charlie', participantBName: 'Diana', scoreA: 7, scoreB: 3 }]
            }]
          }
        ]
      }
    });

    const id = await createHistoricalTournament(input);
    const doc = getCapturedTournament();
    const gs = doc!.groupStage as any;

    expect(gs.groups.length).toBe(2);
    expect(gs.numGroups).toBe(2);

    // Each group has its own standings
    expect(gs.groups[0].standings.length).toBe(2);
    expect(gs.groups[1].standings.length).toBe(2);

    // Standings in group A don't reference group B participants
    const groupAIds = gs.groups[0].standings.map((s: any) => s.participantId);
    const groupBIds = gs.groups[1].standings.map((s: any) => s.participantId);
    const overlap = groupAIds.filter((id: string) => groupBIds.includes(id));
    expect(overlap.length).toBe(0);
  });
});
