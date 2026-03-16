/**
 * Tests for computeAutoStartParticipant
 *
 * Validates the alternation logic for automatically determining
 * which participant starts (non-hammer side) in group stage matches
 * when whoStarts is set to 'alternate'.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Tournament, GroupMatch } from '$lib/types/tournament';

// Mock SvelteKit/Firebase modules to allow importing tournamentMatches
vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('./config', () => ({ db: null, isFirebaseEnabled: () => false }));
vi.mock('./tournaments', () => ({ getTournament: vi.fn(), parseTournamentData: vi.fn() }));
vi.mock('./timeConfig', () => ({ DEFAULT_TIME_CONFIG: { minutesPer4RoundsSingles: 10, minutesPer4RoundsDoubles: 15 } }));
vi.mock('$lib/algorithms/tiebreaker', () => ({
  resolveTiebreaker: vi.fn(),
  updateHeadToHeadRecord: vi.fn(),
  calculateMatchPoints: vi.fn()
}));
vi.mock('./cleanUndefined', () => ({ cleanUndefined: (x: any) => x }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn()
}));

const { computeAutoStartParticipant } = await import('./tournamentMatches');

interface CreateTournamentOpts {
  numGroups?: number;
  useSwiss?: boolean;
  multipleRounds?: GroupMatch[][];  // array of rounds, each containing matches
}

/**
 * Helper to create a minimal tournament with group matches
 */
function createTournament(matches: Partial<GroupMatch>[], opts?: CreateTournamentOpts): Tournament {
  const numGroups = opts?.numGroups || 1;
  const useSwiss = opts?.useSwiss || false;
  const groups = [];

  function buildMatches(list: Partial<GroupMatch>[], prefix: string): GroupMatch[] {
    return list.map((m, i) => ({
      id: `${prefix}m${i}`,
      participantA: m.participantA || 'pA',
      participantB: m.participantB || 'pB',
      status: m.status || 'COMPLETED',
      rounds: m.rounds || [],
      ...m
    })) as GroupMatch[];
  }

  if (opts?.multipleRounds) {
    // Multiple rounds in a single group
    const scheduleOrPairings = opts.multipleRounds.map((roundMatches, ri) => ({
      roundNumber: ri + 1,
      matches: buildMatches(roundMatches, `r${ri}`)
    }));
    groups.push({
      id: 'g1',
      name: 'Grupo A',
      participants: [],
      ...(useSwiss ? { pairings: scheduleOrPairings } : { schedule: scheduleOrPairings }),
      standings: []
    });
  } else if (numGroups === 1) {
    const data = useSwiss
      ? { pairings: [{ roundNumber: 1, matches: buildMatches(matches, '') }] }
      : { schedule: [{ roundNumber: 1, matches: buildMatches(matches, '') }] };
    groups.push({ id: 'g1', name: 'Grupo A', participants: [], ...data, standings: [] });
  } else {
    // Split matches across groups
    const half = Math.ceil(matches.length / 2);
    const g1Matches = matches.slice(0, half);
    const g2Matches = matches.slice(half);

    const data1 = useSwiss
      ? { pairings: [{ roundNumber: 1, matches: buildMatches(g1Matches, 'g1') }] }
      : { schedule: [{ roundNumber: 1, matches: buildMatches(g1Matches, 'g1') }] };
    groups.push({ id: 'g1', name: 'Grupo A', participants: [], ...data1, standings: [] });

    const data2 = useSwiss
      ? { pairings: [{ roundNumber: 1, matches: buildMatches(g2Matches, 'g2') }] }
      : { schedule: [{ roundNumber: 1, matches: buildMatches(g2Matches, 'g2') }] };
    groups.push({ id: 'g2', name: 'Grupo B', participants: [], ...data2, standings: [] });
  }

  return {
    id: 't1',
    key: 'TEST01',
    name: 'Test Tournament',
    country: 'España',
    city: 'Barcelona',
    status: 'GROUP_STAGE',
    phaseType: 'TWO_PHASE',
    gameType: 'singles',
    show20s: true,
    showHammer: true,
    numTables: 4,
    rankingConfig: { enabled: false },
    participants: [],
    groupStage: {
      type: useSwiss ? 'SWISS' : 'ROUND_ROBIN',
      groups,
      currentRound: 1,
      totalRounds: 3,
      isComplete: false,
      gameMode: 'rounds',
      roundsToPlay: 4,
      matchesToWin: 1,
      whoStarts: 'alternate'
    },
    createdAt: Date.now(),
    createdBy: { userId: 'u1', userName: 'Admin' },
    updatedAt: Date.now()
  } as Tournament;
}

/**
 * Helper to create a round entry with hammer info
 */
function roundWithHammer(hammer: string) {
  return {
    gameNumber: 1,
    roundInGame: 1,
    pointsA: 0,
    pointsB: 0,
    twentiesA: 0,
    twentiesB: 0,
    hammer
  };
}

describe('computeAutoStartParticipant', () => {
  it('should pick lexicographically smaller ID when no completed matches', () => {
    const tournament = createTournament([]);

    // No completed matches → tiebreaker
    const result = computeAutoStartParticipant(tournament, 'pB', 'pA');
    expect(result).toBe('pA'); // 'pA' < 'pB'
  });

  it('should pick player B when player A has started more', () => {
    // Match where hammer was on pB → starter was pA
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pB')] // hammer on pB → pA started
      }
    ]);

    // pA has 1 start, pB has 0 → pB should start
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pB');
  });

  it('should use lexicographic tiebreaker when starts are equal', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pB')] // pA started
      },
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pA')] // pB started
      }
    ]);

    // Both have 1 start → tiebreaker
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pA'); // 'pA' < 'pB'
  });

  it('should count starts correctly across multiple groups', () => {
    // Group 1: pA started (hammer on pB)
    // Group 2: pA started again (hammer on pB)
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pC',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pC')] // pA started
      },
      {
        participantA: 'pB',
        participantB: 'pC',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pC')] // pB started
      }
    ], { numGroups: 2 });

    // pA started 1 (group 1), pB started 1 (group 2) → tie → lexicographic
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pA');
  });

  it('should skip matches with no hammer info (walkovers)', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [] // No rounds → walkover
      },
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [{ gameNumber: 1, roundInGame: 1, pointsA: 0, pointsB: 0, twentiesA: 0, twentiesB: 0, hammer: null }]
      },
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pB')] // pA started
      }
    ]);

    // Only 1 valid match counted (pA started once)
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pB'); // pB has 0 starts
  });

  it('should handle 3+ players correctly per-pair', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pC',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pC')] // pA started
      },
      {
        participantA: 'pB',
        participantB: 'pC',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pB')] // pC started
      },
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pA')] // pB started
      }
    ]);

    // For pA vs pB:
    // pA started: 1 (vs pC, hammer was pC → pA started)
    // pB started: 1 (vs pA, hammer was pA → pB started)
    const resultAB = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(resultAB).toBe('pA'); // tie → lexicographic

    // For pA vs pC:
    // pA started: 1 (vs pC)
    // pC started: 1 (vs pB)
    const resultAC = computeAutoStartParticipant(tournament, 'pA', 'pC');
    expect(resultAC).toBe('pA'); // tie → lexicographic

    // For pB vs pC:
    // pB started: 1 (vs pA, hammer was pA → pB started)
    // pC started: 1 (vs pB, hammer was pB → pC started)
    const resultBC = computeAutoStartParticipant(tournament, 'pB', 'pC');
    expect(resultBC).toBe('pB'); // tie → lexicographic
  });

  it('should pick the player with fewer starts among 3+ players', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pC',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pC')] // pA started
      },
      {
        participantA: 'pA',
        participantB: 'pD',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pD')] // pA started (2nd time)
      },
      {
        participantA: 'pB',
        participantB: 'pC',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pC')] // pB started
      }
    ]);

    // pA started 2 times, pB started 1 time → pB should start
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pB');
  });

  it('should skip PENDING and IN_PROGRESS matches', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'IN_PROGRESS',
        rounds: [roundWithHammer('pB')]
      },
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'PENDING',
        rounds: []
      }
    ]);

    // No COMPLETED matches → tie → lexicographic
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pA');
  });

  it('should work with Swiss pairings (not just Round Robin schedule)', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pB')] // pA started
      },
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pA')] // pB started
      },
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pB')] // pA started again
      }
    ], { useSwiss: true });

    // pA started 2 times, pB started 1 → pB should start
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pB');
  });

  it('should skip WALKOVER status matches', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'WALKOVER',
        rounds: [roundWithHammer('pB')]
      }
    ]);

    // WALKOVER is not COMPLETED → not counted → tie → lexicographic
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pA');
  });

  it('should return deterministic result regardless of argument order', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pB')] // pA started
      }
    ]);

    // pA=1, pB=0 → pB starts regardless of argument order
    const result1 = computeAutoStartParticipant(tournament, 'pA', 'pB');
    const result2 = computeAutoStartParticipant(tournament, 'pB', 'pA');
    expect(result1).toBe('pB');
    expect(result2).toBe('pB');
  });

  it('should handle tournament with no groupStage gracefully', () => {
    const tournament = createTournament([]);
    // Remove groupStage to simulate a ONE_PHASE tournament
    (tournament as any).groupStage = undefined;

    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pA'); // tie → lexicographic
  });

  it('should count across multiple rounds in a group schedule', () => {
    const tournament = createTournament([], {
      multipleRounds: [
        // Round 1
        [
          {
            participantA: 'pA',
            participantB: 'pB',
            status: 'COMPLETED',
            rounds: [roundWithHammer('pB')]  // pA started
          } as GroupMatch
        ],
        // Round 2
        [
          {
            participantA: 'pA',
            participantB: 'pB',
            status: 'COMPLETED',
            rounds: [roundWithHammer('pB')]  // pA started again
          } as GroupMatch
        ]
      ]
    });

    // pA started 2 times, pB started 0 → pB should start
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pB');
  });

  it('should count across multiple Swiss rounds (pairings)', () => {
    const tournament = createTournament([], {
      useSwiss: true,
      multipleRounds: [
        // Round 1
        [
          {
            participantA: 'pA',
            participantB: 'pB',
            status: 'COMPLETED',
            rounds: [roundWithHammer('pA')]  // pB started
          } as GroupMatch
        ],
        // Round 2
        [
          {
            participantA: 'pB',
            participantB: 'pA',
            status: 'COMPLETED',
            rounds: [roundWithHammer('pA')]  // pB started
          } as GroupMatch
        ]
      ]
    });

    // pB started 2 times, pA started 0 → pA should start
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pA');
  });

  it('should only count first round hammer (not subsequent rounds in a game)', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [
          roundWithHammer('pB'),  // Round 1: pA started (this is the one that counts)
          roundWithHammer('pA'),  // Round 2: hammer switched (should be ignored for start counting)
          roundWithHammer('pB'),  // Round 3
          roundWithHammer('pA'),  // Round 4
        ]
      }
    ]);

    // Only round[0].hammer matters → pA started 1, pB started 0
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pB');
  });

  it('should handle large tournament (10 players, realistic scenario)', () => {
    // Simulate a 10-player RR group where each player has played some matches
    const matches: Partial<GroupMatch>[] = [
      // Round 1
      { participantA: 'p1', participantB: 'p2', status: 'COMPLETED', rounds: [roundWithHammer('p2')] }, // p1 started
      { participantA: 'p3', participantB: 'p4', status: 'COMPLETED', rounds: [roundWithHammer('p3')] }, // p4 started
      { participantA: 'p5', participantB: 'p6', status: 'COMPLETED', rounds: [roundWithHammer('p5')] }, // p6 started
      { participantA: 'p7', participantB: 'p8', status: 'COMPLETED', rounds: [roundWithHammer('p8')] }, // p7 started
      // Round 2
      { participantA: 'p1', participantB: 'p3', status: 'COMPLETED', rounds: [roundWithHammer('p1')] }, // p3 started
      { participantA: 'p2', participantB: 'p4', status: 'COMPLETED', rounds: [roundWithHammer('p4')] }, // p2 started
      { participantA: 'p5', participantB: 'p7', status: 'COMPLETED', rounds: [roundWithHammer('p7')] }, // p5 started
      { participantA: 'p6', participantB: 'p8', status: 'COMPLETED', rounds: [roundWithHammer('p6')] }, // p8 started
    ];

    const tournament = createTournament(matches);

    // p1 starts: round1 (vs p2) = 1
    // p3 starts: round2 (vs p1) = 1
    // For p1 vs p3: both started 1 time → tie → p1 < p3
    expect(computeAutoStartParticipant(tournament, 'p1', 'p3')).toBe('p1');

    // p2 starts: round2 (vs p4) = 1
    // p5 starts: round1 (vs p6, hammer p5 → p6 started) NO, hammer is p5, other is p6 → p6 started
    // Wait: { participantA: 'p5', participantB: 'p6', rounds: [roundWithHammer('p5')] }
    // hammer = p5, so starter = p6 (the OTHER player)
    // p5 starts in round2: { p5 vs p7, hammer = p7 → p5 started }
    // p5 started: 1 (round2 vs p7)
    // p2 started: 1 (round2 vs p4)
    // p2 vs p5: tie → p2 < p5
    expect(computeAutoStartParticipant(tournament, 'p2', 'p5')).toBe('p2');

    // p7 started: round1 (vs p8, hammer p8 → p7 started) = 1
    // p6 started: round1 (vs p5, hammer p5 → p6 started) = 1
    // p6 vs p7: tie → p6 < p7
    expect(computeAutoStartParticipant(tournament, 'p6', 'p7')).toBe('p6');
  });

  it('should handle mixed completed and walkover matches in Swiss', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: [roundWithHammer('pA')]  // pB started
      },
      {
        participantA: 'pA',
        participantB: 'BYE',
        status: 'WALKOVER',
        rounds: []
      },
      {
        participantA: 'pB',
        participantB: 'BYE',
        status: 'WALKOVER',
        rounds: []
      }
    ], { useSwiss: true });

    // Only first match counts: pB started 1, pA started 0 → pA should start
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pA');
  });

  it('should handle empty rounds array (admin-entered result with no round data)', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: []  // Admin entered result without round-by-round data
      }
    ]);

    // Empty rounds → no hammer data → not counted → tie → lexicographic
    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pA');
  });

  it('should handle undefined rounds (legacy match data)', () => {
    const tournament = createTournament([
      {
        participantA: 'pA',
        participantB: 'pB',
        status: 'COMPLETED',
        rounds: undefined as any  // Legacy: no rounds field
      }
    ]);

    const result = computeAutoStartParticipant(tournament, 'pA', 'pB');
    expect(result).toBe('pA'); // tie → lexicographic
  });
});
