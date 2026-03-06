/**
 * Tournament lifecycle integration tests
 *
 * Full end-to-end tests simulating LIVE tournament flow:
 * DRAFT → GROUP_STAGE → complete matches → TRANSITION → FINAL_STAGE → bracket → COMPLETED
 *
 * Also tests GROUP_ONLY flow (no bracket).
 *
 * Uses REAL algorithms (scheduling, tiebreakers, bracket generation).
 * Only Firebase I/O is mocked via MockFirestore.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import type { Tournament, GroupMatch, BracketMatch } from '$lib/types/tournament';

// ─── Shared mock state ───────────────────────────────────────────────────────

let mockStore: MockFirestore;

function seedTournament(tournament: Tournament): void {
  mockStore.setDocument(`tournaments/${tournament.id}`, tournament as unknown as Record<string, unknown>);
  mockStore.resetStats();
}

function readTournament(id: string): Tournament {
  const doc = mockStore.getDocument(`tournaments/${id}`);
  if (!doc) throw new Error(`Tournament ${id} not found`);
  return doc.data as unknown as Tournament;
}

// ─── vi.mock setup ───────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

// Mock firebase/firestore — used by completeBracketMatchAndAdvance and updateMatchResult
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) =>
    new MockDocumentReference(`${collection}/${id}`, id),
  runTransaction: (
    _db: unknown,
    callback: (txn: unknown) => Promise<unknown>,
    options?: { maxAttempts?: number }
  ) => mockStore.runTransaction(callback as any, options?.maxAttempts ? options.maxAttempts - 1 : undefined),
  serverTimestamp: () => Date.now(),
  Timestamp: class MockTimestamp {
    _ms: number;
    constructor(seconds: number, nanoseconds: number) { this._ms = seconds * 1000 + nanoseconds / 1e6; }
    toMillis() { return this._ms; }
    static fromMillis(ms: number) { const t = new MockTimestamp(0, 0); t._ms = ms; return t; }
  }
}));

vi.mock('./config', () => ({
  db: {},
  isFirebaseEnabled: () => true
}));

// Mock tournaments module — getTournament/updateTournament backed by mockStore
vi.mock('$lib/firebase/tournaments', () => ({
  getTournament: async (id: string) => {
    const doc = mockStore.getDocument(`tournaments/${id}`);
    return doc ? (doc.data as unknown as Tournament) : null;
  },
  updateTournament: async (id: string, updates: Record<string, unknown>) => {
    const doc = mockStore.getDocument(`tournaments/${id}`);
    if (!doc) return false;
    const current = doc.data as Record<string, unknown>;
    mockStore.setDocument(`tournaments/${id}`, { ...current, ...updates });
    return true;
  },
  updateTournamentPublic: async (id: string, updates: Record<string, unknown>) => {
    const doc = mockStore.getDocument(`tournaments/${id}`);
    if (!doc) return false;
    const current = doc.data as Record<string, unknown>;
    mockStore.setDocument(`tournaments/${id}`, { ...current, ...updates });
    return true;
  },
  parseTournamentData: (data: unknown) => data
}));

// Mock ranking module — stub sync, use real position calculation
vi.mock('$lib/firebase/tournamentRanking', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    syncParticipantRankings: async () => true,
    calculateFinalPositions: async (tournamentId: string) => {
      const doc = mockStore.getDocument(`tournaments/${tournamentId}`);
      if (!doc) return null;
      const tournament = doc.data as unknown as Tournament;
      const calcFn = actual.calculateFinalPositionsForTournament as (t: Tournament) => Tournament['participants'];
      const updatedParticipants = calcFn(tournament);
      const updated = { ...tournament, participants: updatedParticipants };
      mockStore.setDocument(`tournaments/${tournamentId}`, updated as unknown as Record<string, unknown>);
      return updated;
    }
  };
});

// ─── Import functions under test (AFTER mocks) ──────────────────────────────

const { transitionTournament } = await import('$lib/utils/tournamentStateMachine');
const { updateMatchResult } = await import('./tournamentMatches');
const { completeBracketMatchAndAdvance } = await import('./tournamentBracket');
const { generateSwissPairings: generateSwissPairingsAlgorithm } = await import('$lib/algorithms/swiss');
const { generateSwissPairings, recalculateStandings } = await import('./tournamentGroups');

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createDraftTournament(
  numParticipants: number,
  phaseType: 'TWO_PHASE' | 'ONE_PHASE' | 'GROUP_ONLY' = 'TWO_PHASE',
  opts?: { numGroups?: number; gameMode?: 'rounds' | 'points'; numTables?: number }
): Tournament {
  const { numGroups = 1, gameMode = 'rounds', numTables = 4 } = opts || {};

  const participants = Array.from({ length: numParticipants }, (_, i) => ({
    id: `player-${i + 1}`,
    type: 'GUEST' as const,
    name: `Player ${i + 1}`,
    status: 'ACTIVE' as const,
    rankingSnapshot: 1000 - i * 10
  }));

  const now = Date.now();
  return {
    id: 'lifecycle-test',
    key: 'LIFE01',
    name: 'Lifecycle Test Tournament',
    country: 'ES',
    city: 'Barcelona',
    status: 'DRAFT',
    phaseType,
    gameType: 'singles',
    show20s: true,
    showHammer: false,
    numTables,
    rankingConfig: { enabled: false },
    participants,
    groupStage: {
      type: 'ROUND_ROBIN',
      groups: [],
      currentRound: 0,
      totalRounds: 0,
      isComplete: false,
      gameMode,
      ...(gameMode === 'points' ? { pointsToWin: 7 } : { roundsToPlay: 4 }),
      matchesToWin: 1,
      numGroups,
      qualificationMode: 'WINS'
    },
    createdAt: now,
    createdBy: { userId: 'admin-1', userName: 'Admin' },
    updatedAt: now
  } as Tournament;
}

/** Get all IN_PROGRESS group matches */
function getGroupMatches(tournament: Tournament): GroupMatch[] {
  const matches: GroupMatch[] = [];
  for (const group of tournament.groupStage?.groups || []) {
    for (const round of (group.schedule || group.pairings || [])) {
      for (const match of round.matches) {
        if (match.status === 'IN_PROGRESS' && match.participantB !== 'BYE') {
          matches.push(match);
        }
      }
    }
  }
  return matches;
}

/** Get all PENDING group matches */
function getPendingGroupMatches(tournament: Tournament): GroupMatch[] {
  const matches: GroupMatch[] = [];
  for (const group of tournament.groupStage?.groups || []) {
    for (const round of (group.schedule || group.pairings || [])) {
      for (const match of round.matches) {
        if (match.status === 'PENDING' && match.participantB !== 'BYE') {
          matches.push(match);
        }
      }
    }
  }
  return matches;
}

/** Complete a match via updateMatchResult, A always wins */
async function completeGroupMatch(tournamentId: string, match: GroupMatch): Promise<void> {
  const ok = await updateMatchResult(tournamentId, match.id, {
    gamesWonA: 2, gamesWonB: 0,
    totalPointsA: 8, totalPointsB: 2,
    total20sA: 1, total20sB: 0
  });
  expect(ok).toBe(true);
}

/** Start all PENDING matches (set status to IN_PROGRESS) */
function startPendingMatches(tournament: Tournament): void {
  const now = Date.now();
  for (const group of tournament.groupStage?.groups || []) {
    for (const round of (group.schedule || group.pairings || [])) {
      for (const match of round.matches) {
        if (match.status === 'PENDING' && match.participantB !== 'BYE') {
          match.status = 'IN_PROGRESS';
          match.startedAt = now;
          if (!match.tableNumber) match.tableNumber = 1;
        }
      }
    }
  }
}

/** Mark top N participants as qualified in each group */
function markQualifiers(tournament: Tournament, numQualifiers: number): void {
  for (const group of tournament.groupStage?.groups || []) {
    for (const standing of group.standings) {
      standing.qualifiedForFinal = standing.position <= numQualifiers;
    }
  }
}

/** Get all pending bracket matches with both participants */
function getPendingBracketMatches(tournament: Tournament): BracketMatch[] {
  const matches: BracketMatch[] = [];
  const bracket = tournament.finalStage?.goldBracket;
  if (!bracket) return matches;

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (match.status === 'PENDING' && match.participantA && match.participantB
          && match.participantA !== 'BYE' && match.participantB !== 'BYE') {
        matches.push(match);
      }
    }
  }

  if (bracket.thirdPlaceMatch
      && bracket.thirdPlaceMatch.status === 'PENDING'
      && bracket.thirdPlaceMatch.participantA
      && bracket.thirdPlaceMatch.participantB) {
    matches.push(bracket.thirdPlaceMatch);
  }

  return matches;
}

/** Complete a bracket match and advance winner */
async function completeBracketMatch(tournamentId: string, match: BracketMatch): Promise<void> {
  const winnerId = match.participantA;
  const ok = await completeBracketMatchAndAdvance(tournamentId, match.id, {
    status: 'COMPLETED',
    winner: winnerId,
    totalPointsA: 8,
    totalPointsB: 2,
    total20sA: 1,
    total20sB: 0,
    gamesWonA: 2,
    gamesWonB: 0
  });
  expect(ok).toBe(true);
}

/** Create a Swiss DRAFT tournament */
function createDraftSwissTournament(
  numParticipants: number,
  phaseType: 'TWO_PHASE' | 'GROUP_ONLY' = 'TWO_PHASE',
  opts?: { numSwissRounds?: number; numTables?: number }
): Tournament {
  const { numSwissRounds = 3, numTables = 4 } = opts || {};

  const participants = Array.from({ length: numParticipants }, (_, i) => ({
    id: `player-${i + 1}`,
    type: 'GUEST' as const,
    name: `Player ${i + 1}`,
    status: 'ACTIVE' as const,
    rankingSnapshot: 1000 - i * 10
  }));

  const now = Date.now();
  return {
    id: 'lifecycle-test',
    key: 'LIFE01',
    name: 'Lifecycle Test Tournament',
    country: 'ES',
    city: 'Barcelona',
    status: 'DRAFT',
    phaseType,
    gameType: 'singles',
    show20s: true,
    showHammer: false,
    numTables,
    rankingConfig: { enabled: false },
    participants,
    groupStage: {
      type: 'SWISS',
      groups: [],
      currentRound: 0,
      totalRounds: numSwissRounds,
      isComplete: false,
      gameMode: 'rounds',
      roundsToPlay: 4,
      matchesToWin: 1,
      numSwissRounds,
      qualificationMode: 'WINS'
    },
    createdAt: now,
    createdBy: { userId: 'admin-1', userName: 'Admin' },
    updatedAt: now
  } as Tournament;
}

/** Advance Swiss to next round: generate pairings and activate matches */
async function advanceSwissRound(tournamentId: string): Promise<void> {
  const t = readTournament(tournamentId);
  const group = t.groupStage!.groups[0];
  const currentRoundNum = group.pairings!.length;

  // Generate next round using REAL algorithm (pass SwissPairing[], not flat matches)
  const newMatches = generateSwissPairingsAlgorithm(
    t.participants,
    group.standings,
    group.pairings!,
    currentRoundNum + 1
  );

  // Add new round to pairings
  group.pairings!.push({
    roundNumber: currentRoundNum + 1,
    matches: newMatches
  });

  // Activate non-BYE matches
  const now = Date.now();
  for (const match of newMatches) {
    if (match.participantB !== 'BYE' && match.status === 'PENDING') {
      match.status = 'IN_PROGRESS';
      match.startedAt = now;
      if (!match.tableNumber) match.tableNumber = 1;
    }
  }

  // Handle BYE walkover standings
  const byeMatch = newMatches.find(m => m.participantB === 'BYE');
  if (byeMatch && byeMatch.status === 'WALKOVER') {
    const byeStanding = group.standings.find(s => s.participantId === byeMatch.participantA);
    if (byeStanding) {
      byeStanding.matchesPlayed++;
      byeStanding.matchesWon++;
      byeStanding.points += 2;
      if (byeStanding.swissPoints !== undefined) byeStanding.swissPoints += 2;
      byeStanding.totalPointsScored += (byeMatch.totalPointsA || 8);
    }
  }

  t.groupStage!.currentRound = currentRoundNum + 1;
  mockStore.setDocument(`tournaments/${tournamentId}`, t as unknown as Record<string, unknown>);
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('GROUP_ONLY lifecycle: DRAFT → GROUP_STAGE → TRANSITION → COMPLETED', () => {
  it('6 players RR GROUP_ONLY: full lifecycle completes correctly', async () => {
    const tournament = createDraftTournament(6, 'GROUP_ONLY');
    seedTournament(tournament);

    // ── Step 1: DRAFT → GROUP_STAGE ──
    const startOk = await transitionTournament(tournament.id, 'GROUP_STAGE');
    expect(startOk).toBe(true);

    let t = readTournament(tournament.id);
    expect(t.status).toBe('GROUP_STAGE');
    expect(t.groupStage).toBeDefined();
    expect(t.groupStage!.groups.length).toBe(1);
    expect(t.groupStage!.groups[0].schedule!.length).toBeGreaterThan(0);

    // Verify standings initialized
    const standings = t.groupStage!.groups[0].standings;
    expect(standings.length).toBe(6);

    // ── Step 2: Complete all group matches ──
    // Matches start as PENDING — need to set them to IN_PROGRESS first
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    t = readTournament(tournament.id);
    let matches = getGroupMatches(t);
    expect(matches.length).toBe(15); // C(6,2) = 15

    for (const match of matches) {
      await completeGroupMatch(tournament.id, match);
    }

    // ── Step 3: GROUP_STAGE → TRANSITION ──
    const transitionOk = await transitionTournament(tournament.id, 'TRANSITION');
    expect(transitionOk).toBe(true);

    t = readTournament(tournament.id);
    expect(t.status).toBe('TRANSITION');
    expect(t.groupStage!.isComplete).toBe(true);

    // ── Step 4: TRANSITION → COMPLETED (GROUP_ONLY) ──
    const completeOk = await transitionTournament(tournament.id, 'COMPLETED');
    expect(completeOk).toBe(true);

    t = readTournament(tournament.id);
    expect(t.status).toBe('COMPLETED');
    expect(t.completedAt).toBeDefined();

    // Verify final positions assigned
    const withPositions = t.participants.filter(p => p.finalPosition !== undefined);
    expect(withPositions.length).toBe(6);

    // Positions 1-6 all assigned
    const positions = withPositions.map(p => p.finalPosition!).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('rejects TRANSITION if matches are still incomplete', async () => {
    const tournament = createDraftTournament(4, 'GROUP_ONLY');
    seedTournament(tournament);

    // Start group stage
    await transitionTournament(tournament.id, 'GROUP_STAGE');
    let t = readTournament(tournament.id);

    // Start matches but only complete SOME
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    t = readTournament(tournament.id);
    const matches = getGroupMatches(t);
    // Only complete first match
    await completeGroupMatch(tournament.id, matches[0]);

    // Attempt transition — should fail (incomplete matches)
    const transitionOk = await transitionTournament(tournament.id, 'TRANSITION');
    expect(transitionOk).toBe(false);

    t = readTournament(tournament.id);
    expect(t.status).toBe('GROUP_STAGE'); // Still in GROUP_STAGE
  });
});

describe('TWO_PHASE lifecycle: DRAFT → GROUP_STAGE → TRANSITION → FINAL_STAGE → COMPLETED', () => {
  it('8 players TWO_PHASE: full lifecycle with bracket', async () => {
    const tournament = createDraftTournament(8, 'TWO_PHASE', { numGroups: 2 });
    seedTournament(tournament);

    // ── Step 1: DRAFT → GROUP_STAGE ──
    const startOk = await transitionTournament(tournament.id, 'GROUP_STAGE');
    expect(startOk).toBe(true);

    let t = readTournament(tournament.id);
    expect(t.status).toBe('GROUP_STAGE');
    expect(t.groupStage!.groups.length).toBe(2);
    // 4 players per group
    expect(t.groupStage!.groups[0].participants.length).toBe(4);
    expect(t.groupStage!.groups[1].participants.length).toBe(4);

    // ── Step 2: Complete all group matches ──
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    t = readTournament(tournament.id);
    const matches = getGroupMatches(t);
    // 2 groups × C(4,2)=6 matches = 12 total
    expect(matches.length).toBe(12);

    for (const match of matches) {
      await completeGroupMatch(tournament.id, match);
    }

    // ── Step 3: GROUP_STAGE → TRANSITION ──
    const transitionOk = await transitionTournament(tournament.id, 'TRANSITION');
    expect(transitionOk).toBe(true);

    t = readTournament(tournament.id);
    expect(t.status).toBe('TRANSITION');

    // ── Step 4: Mark qualifiers (top 2 from each group → 4 in bracket) ──
    markQualifiers(t, 2);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    // ── Step 5: TRANSITION → FINAL_STAGE ──
    const finalOk = await transitionTournament(tournament.id, 'FINAL_STAGE');
    expect(finalOk).toBe(true);

    t = readTournament(tournament.id);
    expect(t.status).toBe('FINAL_STAGE');
    expect(t.finalStage).toBeDefined();
    expect(t.finalStage!.goldBracket).toBeDefined();

    // 4 qualified → 2 semifinal matches + 1 final + 1 third place
    const bracketRounds = t.finalStage!.goldBracket!.rounds;
    expect(bracketRounds.length).toBe(2); // Semis + Final

    // ── Step 6: Complete bracket matches round by round ──
    // Semifinals
    let bracketMatches = getPendingBracketMatches(t);
    expect(bracketMatches.length).toBeGreaterThanOrEqual(2); // 2 semis

    for (const match of bracketMatches) {
      await completeBracketMatch(tournament.id, match);
    }

    // Final + 3rd place match
    t = readTournament(tournament.id);
    bracketMatches = getPendingBracketMatches(t);

    for (const match of bracketMatches) {
      await completeBracketMatch(tournament.id, match);
    }

    // ── Step 7: Tournament auto-completes when last bracket match finishes ──
    // completeBracketMatchAndAdvance detects all brackets complete and sets status=COMPLETED
    t = readTournament(tournament.id);
    expect(t.status).toBe('COMPLETED');
    expect(t.completedAt).toBeDefined();

    // Verify final positions
    const withPositions = t.participants.filter(p => p.finalPosition !== undefined);
    expect(withPositions.length).toBeGreaterThanOrEqual(4); // At least bracket participants

    // Positions 1, 2 should exist (winner and runner-up)
    const posSet = new Set(withPositions.map(p => p.finalPosition!));
    expect(posSet.has(1)).toBe(true);
    expect(posSet.has(2)).toBe(true);
  });
});

describe('ONE_PHASE lifecycle: DRAFT → FINAL_STAGE → COMPLETED', () => {
  it('4 players ONE_PHASE: direct to bracket', async () => {
    const tournament = createDraftTournament(4, 'ONE_PHASE');
    // Remove groupStage for ONE_PHASE (no groups)
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    // ── Step 1: DRAFT → FINAL_STAGE ──
    const startOk = await transitionTournament(tournament.id, 'FINAL_STAGE');
    expect(startOk).toBe(true);

    let t = readTournament(tournament.id);
    expect(t.status).toBe('FINAL_STAGE');
    expect(t.finalStage).toBeDefined();
    expect(t.finalStage!.goldBracket).toBeDefined();

    // 4 players → 2 semis + 1 final
    const rounds = t.finalStage!.goldBracket!.rounds;
    expect(rounds.length).toBe(2);

    // ── Step 2: Complete bracket matches ──
    // Semifinals
    let bracketMatches = getPendingBracketMatches(t);
    expect(bracketMatches.length).toBe(2);

    for (const match of bracketMatches) {
      await completeBracketMatch(tournament.id, match);
    }

    // Final + 3rd place
    t = readTournament(tournament.id);
    bracketMatches = getPendingBracketMatches(t);

    for (const match of bracketMatches) {
      await completeBracketMatch(tournament.id, match);
    }

    // ── Step 3: Tournament auto-completes when last bracket match finishes ──
    t = readTournament(tournament.id);
    expect(t.status).toBe('COMPLETED');

    // All 4 participants should have final positions
    const withPositions = t.participants.filter(p => p.finalPosition !== undefined);
    expect(withPositions.length).toBe(4);

    const positions = withPositions.map(p => p.finalPosition!).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4]);
  });
});

describe('Invalid transitions', () => {
  it('rejects invalid state transitions', async () => {
    const tournament = createDraftTournament(4, 'GROUP_ONLY');
    seedTournament(tournament);

    // DRAFT → COMPLETED (invalid)
    expect(await transitionTournament(tournament.id, 'COMPLETED')).toBe(false);

    // DRAFT → TRANSITION (invalid)
    expect(await transitionTournament(tournament.id, 'TRANSITION')).toBe(false);

    const t = readTournament(tournament.id);
    expect(t.status).toBe('DRAFT'); // Unchanged
  });

  it('CANCELLED is a terminal state', async () => {
    const tournament = createDraftTournament(4, 'GROUP_ONLY');
    seedTournament(tournament);

    // Cancel tournament
    expect(await transitionTournament(tournament.id, 'CANCELLED')).toBe(true);

    let t = readTournament(tournament.id);
    expect(t.status).toBe('CANCELLED');

    // No transitions from CANCELLED
    expect(await transitionTournament(tournament.id, 'DRAFT')).toBe(false);
    expect(await transitionTournament(tournament.id, 'GROUP_STAGE')).toBe(false);

    t = readTournament(tournament.id);
    expect(t.status).toBe('CANCELLED');
  });
});

describe('Schedule generation verification', () => {
  it('startGroupStage generates correct RR schedule for 2 groups', async () => {
    const tournament = createDraftTournament(12, 'GROUP_ONLY', { numGroups: 2 });
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'GROUP_STAGE');

    const t = readTournament(tournament.id);
    const groups = t.groupStage!.groups;

    expect(groups.length).toBe(2);

    // 6 players per group
    for (const group of groups) {
      expect(group.participants.length).toBe(6);
      expect(group.schedule).toBeDefined();
      expect(group.schedule!.length).toBe(5); // 6 players → 5 rounds

      // Each round has 3 matches (6/2)
      for (const round of group.schedule!) {
        expect(round.matches.length).toBe(3);
      }

      // Standings initialized
      expect(group.standings.length).toBe(6);
      for (const s of group.standings) {
        expect(s.matchesPlayed).toBe(0);
        expect(s.points).toBe(0);
      }
    }

    // No participant overlap between groups
    const ids1 = new Set(groups[0].participants);
    const ids2 = new Set(groups[1].participants);
    for (const id of ids1) {
      expect(ids2.has(id)).toBe(false);
    }
  });

  it('startGroupStage generates correct schedule for odd participants (BYEs)', async () => {
    const tournament = createDraftTournament(5, 'GROUP_ONLY');
    seedTournament(tournament);

    await transitionTournament(tournament.id, 'GROUP_STAGE');

    const t = readTournament(tournament.id);
    const group = t.groupStage!.groups[0];

    expect(group.participants.length).toBe(5);
    // 5 players + BYE = 6 → 5 rounds
    expect(group.schedule!.length).toBe(5);

    // Each round should have a BYE match (walkover)
    for (const round of group.schedule!) {
      const byeMatches = round.matches.filter(m => m.participantB === 'BYE');
      expect(byeMatches.length).toBe(1);
      expect(byeMatches[0].status).toBe('WALKOVER');
      expect(byeMatches[0].winner).toBeDefined();
    }
  });
});

// ─── EDGE CASE TESTS ─────────────────────────────────────────────────────────

describe('TWO_PHASE lifecycle: 16 players, 4 groups → 8-player bracket', () => {
  it('full lifecycle with quarterfinals, semis, final, and 3rd place', async () => {
    const tournament = createDraftTournament(16, 'TWO_PHASE', { numGroups: 4 });
    seedTournament(tournament);

    // DRAFT → GROUP_STAGE
    expect(await transitionTournament(tournament.id, 'GROUP_STAGE')).toBe(true);

    let t = readTournament(tournament.id);
    expect(t.groupStage!.groups.length).toBe(4);
    for (const group of t.groupStage!.groups) {
      expect(group.participants.length).toBe(4);
    }

    // Complete all group matches (4 groups × C(4,2) = 24 matches)
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    t = readTournament(tournament.id);
    const matches = getGroupMatches(t);
    expect(matches.length).toBe(24);

    for (const match of matches) {
      await completeGroupMatch(tournament.id, match);
    }

    // GROUP_STAGE → TRANSITION
    expect(await transitionTournament(tournament.id, 'TRANSITION')).toBe(true);

    // Mark top 2 from each group → 8 qualified
    t = readTournament(tournament.id);
    markQualifiers(t, 2);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    // TRANSITION → FINAL_STAGE
    expect(await transitionTournament(tournament.id, 'FINAL_STAGE')).toBe(true);

    t = readTournament(tournament.id);
    const bracketRounds = t.finalStage!.goldBracket!.rounds;
    // 8 players → QF (4) + SF (2) + Final (1) = 3 rounds
    expect(bracketRounds.length).toBe(3);
    expect(bracketRounds[0].matches.length).toBe(4); // Quarterfinals
    expect(bracketRounds[1].matches.length).toBe(2); // Semifinals
    expect(bracketRounds[2].matches.length).toBe(1); // Final

    // Complete quarterfinals
    let bracketMatches = getPendingBracketMatches(t);
    expect(bracketMatches.length).toBe(4);
    for (const match of bracketMatches) {
      await completeBracketMatch(tournament.id, match);
    }

    // Complete semifinals
    t = readTournament(tournament.id);
    bracketMatches = getPendingBracketMatches(t);
    expect(bracketMatches.length).toBe(2);
    for (const match of bracketMatches) {
      await completeBracketMatch(tournament.id, match);
    }

    // Complete final + 3rd place
    t = readTournament(tournament.id);
    bracketMatches = getPendingBracketMatches(t);
    for (const match of bracketMatches) {
      await completeBracketMatch(tournament.id, match);
    }

    // Tournament auto-completes
    t = readTournament(tournament.id);
    expect(t.status).toBe('COMPLETED');
    expect(t.completedAt).toBeDefined();

    // Verify positions 1-4 assigned from bracket
    const posSet = new Set(
      t.participants.filter(p => p.finalPosition !== undefined).map(p => p.finalPosition!)
    );
    expect(posSet.has(1)).toBe(true);
    expect(posSet.has(2)).toBe(true);
    expect(posSet.has(3)).toBe(true);
    expect(posSet.has(4)).toBe(true);
  });
});

describe('TWO_PHASE lifecycle: bracket with BYEs (non-power-of-2)', () => {
  it('6 qualified → bracket of 8 with 2 BYEs cascading', async () => {
    // 3 groups × 4 = 12 players, top 2 each = 6 qualified → bracket 8 slots, 2 BYEs
    const tournament = createDraftTournament(12, 'TWO_PHASE', { numGroups: 3 });
    seedTournament(tournament);

    // DRAFT → GROUP_STAGE
    expect(await transitionTournament(tournament.id, 'GROUP_STAGE')).toBe(true);

    let t = readTournament(tournament.id);
    expect(t.groupStage!.groups.length).toBe(3);

    // Complete all group matches
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    t = readTournament(tournament.id);
    const groupMatches = getGroupMatches(t);
    for (const match of groupMatches) {
      await completeGroupMatch(tournament.id, match);
    }

    // GROUP_STAGE → TRANSITION
    expect(await transitionTournament(tournament.id, 'TRANSITION')).toBe(true);

    // Mark top 2 from each group → 6 qualified
    t = readTournament(tournament.id);
    markQualifiers(t, 2);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    // Verify 6 qualified
    t = readTournament(tournament.id);
    const qualifiedCount = t.groupStage!.groups.reduce((acc, g) =>
      acc + g.standings.filter(s => s.qualifiedForFinal).length, 0
    );
    expect(qualifiedCount).toBe(6);

    // TRANSITION → FINAL_STAGE
    expect(await transitionTournament(tournament.id, 'FINAL_STAGE')).toBe(true);

    t = readTournament(tournament.id);
    const bracket = t.finalStage!.goldBracket!;

    // 6 qualified → 8-slot bracket (next power of 2): R1 has 4 matches, 2 are BYEs
    const r1Matches = bracket.rounds[0].matches;
    expect(r1Matches.length).toBe(4);

    // BYE matches are auto-completed with 'BYE' as one participant
    const byeMatches = r1Matches.filter(m =>
      m.participantA === 'BYE' || m.participantB === 'BYE'
    );
    expect(byeMatches.length).toBe(2);

    // BYE matches should be pre-completed with the real participant as winner
    for (const bye of byeMatches) {
      expect(bye.status).toBe('COMPLETED');
      expect(bye.winner).toBeDefined();
      expect(bye.winner).not.toBe('BYE');
    }

    // Only 2 real QF matches need manual completion
    let bracketMatches = getPendingBracketMatches(t);
    expect(bracketMatches.length).toBe(2);

    while (bracketMatches.length > 0) {
      for (const match of bracketMatches) {
        await completeBracketMatch(tournament.id, match);
      }
      t = readTournament(tournament.id);
      bracketMatches = getPendingBracketMatches(t);
    }

    // Tournament auto-completes
    t = readTournament(tournament.id);
    expect(t.status).toBe('COMPLETED');

    // Verify top positions assigned
    const posSet = new Set(
      t.participants.filter(p => p.finalPosition !== undefined).map(p => p.finalPosition!)
    );
    expect(posSet.has(1)).toBe(true);
    expect(posSet.has(2)).toBe(true);
  });
});

describe('Swiss → bracket lifecycle', () => {
  it('8 players Swiss 3 rounds → top 4 to bracket', async () => {
    const tournament = createDraftSwissTournament(8, 'TWO_PHASE', { numSwissRounds: 3 });
    seedTournament(tournament);

    // DRAFT → GROUP_STAGE (generates Swiss R1)
    expect(await transitionTournament(tournament.id, 'GROUP_STAGE')).toBe(true);

    let t = readTournament(tournament.id);
    expect(t.status).toBe('GROUP_STAGE');
    expect(t.groupStage!.type).toBe('SWISS');
    expect(t.groupStage!.groups[0].pairings!.length).toBe(1); // R1

    // ── Round 1 ──
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    t = readTournament(tournament.id);
    let swissMatches = getGroupMatches(t);
    expect(swissMatches.length).toBe(4); // 8 players = 4 matches
    for (const match of swissMatches) {
      await completeGroupMatch(tournament.id, match);
    }

    // ── Round 2 ──
    await advanceSwissRound(tournament.id);
    t = readTournament(tournament.id);
    expect(t.groupStage!.groups[0].pairings!.length).toBe(2);

    swissMatches = getGroupMatches(t);
    expect(swissMatches.length).toBe(4);
    for (const match of swissMatches) {
      await completeGroupMatch(tournament.id, match);
    }

    // ── Round 3 ──
    await advanceSwissRound(tournament.id);
    t = readTournament(tournament.id);
    expect(t.groupStage!.groups[0].pairings!.length).toBe(3);

    swissMatches = getGroupMatches(t);
    expect(swissMatches.length).toBe(4);
    for (const match of swissMatches) {
      await completeGroupMatch(tournament.id, match);
    }

    // Verify standings after 3 rounds
    t = readTournament(tournament.id);
    const standings = t.groupStage!.groups[0].standings;
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(3);
    }

    // GROUP_STAGE → TRANSITION
    expect(await transitionTournament(tournament.id, 'TRANSITION')).toBe(true);

    // Mark top 4 as qualified
    t = readTournament(tournament.id);
    markQualifiers(t, 4);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    // TRANSITION → FINAL_STAGE
    expect(await transitionTournament(tournament.id, 'FINAL_STAGE')).toBe(true);

    t = readTournament(tournament.id);
    expect(t.status).toBe('FINAL_STAGE');
    expect(t.finalStage!.goldBracket).toBeDefined();

    // 4 players → SF (2 matches) + Final (1 match) = 2 rounds
    const bracketRounds = t.finalStage!.goldBracket!.rounds;
    expect(bracketRounds.length).toBe(2);
    expect(bracketRounds[0].matches.length).toBe(2); // Semifinals
    expect(bracketRounds[1].matches.length).toBe(1); // Final

    // Complete bracket
    let bracketMatches = getPendingBracketMatches(t);
    expect(bracketMatches.length).toBe(2); // Semifinals

    for (const match of bracketMatches) {
      await completeBracketMatch(tournament.id, match);
    }

    // Final + 3rd place
    t = readTournament(tournament.id);
    bracketMatches = getPendingBracketMatches(t);
    for (const match of bracketMatches) {
      await completeBracketMatch(tournament.id, match);
    }

    // Auto-completes
    t = readTournament(tournament.id);
    expect(t.status).toBe('COMPLETED');
    expect(t.completedAt).toBeDefined();

    // Positions 1-4 from bracket
    const posSet = new Set(
      t.participants.filter(p => p.finalPosition !== undefined).map(p => p.finalPosition!)
    );
    expect(posSet.has(1)).toBe(true);
    expect(posSet.has(2)).toBe(true);
    expect(posSet.has(3)).toBe(true);
    expect(posSet.has(4)).toBe(true);
  });
});

describe('GROUP_ONLY finalize: multi-group position assignment', () => {
  it('2 groups × 6 players: positions assigned independently per group', async () => {
    const tournament = createDraftTournament(12, 'GROUP_ONLY', { numGroups: 2 });
    seedTournament(tournament);

    // DRAFT → GROUP_STAGE
    expect(await transitionTournament(tournament.id, 'GROUP_STAGE')).toBe(true);

    let t = readTournament(tournament.id);
    expect(t.groupStage!.groups.length).toBe(2);
    expect(t.groupStage!.groups[0].participants.length).toBe(6);
    expect(t.groupStage!.groups[1].participants.length).toBe(6);

    // Complete all group matches
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    t = readTournament(tournament.id);
    const matches = getGroupMatches(t);
    // 2 groups × C(6,2) = 2 × 15 = 30 matches
    expect(matches.length).toBe(30);

    for (const match of matches) {
      await completeGroupMatch(tournament.id, match);
    }

    // GROUP_STAGE → TRANSITION
    expect(await transitionTournament(tournament.id, 'TRANSITION')).toBe(true);

    // TRANSITION → COMPLETED (GROUP_ONLY finalize)
    expect(await transitionTournament(tournament.id, 'COMPLETED')).toBe(true);

    t = readTournament(tournament.id);
    expect(t.status).toBe('COMPLETED');
    expect(t.completedAt).toBeDefined();

    // All 12 participants should have final positions
    const withPositions = t.participants.filter(p => p.finalPosition !== undefined);
    expect(withPositions.length).toBe(12);

    // Final positions are assigned from group standings
    // Each participant's position should be a positive integer
    for (const p of withPositions) {
      expect(p.finalPosition).toBeGreaterThanOrEqual(1);
    }

    // Position 1 should exist (at least one group winner)
    expect(withPositions.some(p => p.finalPosition === 1)).toBe(true);

    // Verify standings accuracy per group
    for (const group of t.groupStage!.groups) {
      // Each player plays 5 matches in 6-player RR
      for (const s of group.standings) {
        expect(s.matchesPlayed).toBe(5);
        expect(s.matchesPlayed).toBe(s.matchesWon + s.matchesLost + s.matchesTied);
      }

      // Group standings should have positions 1-6
      const standingPositions = group.standings.map(s => s.position).sort((a, b) => a - b);
      expect(standingPositions[0]).toBe(1);
      expect(standingPositions.length).toBe(6);
    }

    // No finalStage should exist for GROUP_ONLY
    expect(t.finalStage).toBeUndefined();
  });
});

// ─── FIRESTORE SAFETY: no undefined values in critical transitions ──────────

/** Recursively assert no undefined values exist in an object */
function assertNoUndefined(obj: any, path = 'root'): void {
  if (obj === undefined) throw new Error(`Found undefined at ${path}`);
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      assertNoUndefined(value, `${path}.${key}`);
    }
  }
}

/** Simulate what Firestore would receive: run cleanUndefined and verify no undefined remains */
function assertFirestoreSafe(obj: any, label: string): void {
  // Import cleanUndefined behavior inline — strips undefined recursively
  const cleaned = JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? '__UNDEFINED__' : v));
  const check = (o: any, path: string) => {
    if (o === '__UNDEFINED__') throw new Error(`Firestore would receive undefined at ${path}`);
    if (o && typeof o === 'object') {
      for (const [key, value] of Object.entries(o)) {
        check(value, `${path}.${key}`);
      }
    }
  };
  check(cleaned, label);
}

describe('Firestore safety: no undefined values in critical transitions', () => {
  it('Swiss groups → transition: standings have no undefined after varied results', async () => {
    const tournament = createDraftSwissTournament(8, 'TWO_PHASE', { numSwissRounds: 3 });
    seedTournament(tournament);

    // DRAFT → GROUP_STAGE
    expect(await transitionTournament(tournament.id, 'GROUP_STAGE')).toBe(true);

    // Complete round 1 with alternating winners (creates different point totals)
    let t = readTournament(tournament.id);
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    t = readTournament(tournament.id);
    const r1Matches = getGroupMatches(t);
    for (let i = 0; i < r1Matches.length; i++) {
      const match = r1Matches[i];
      const aWins = i % 2 === 0;
      await updateMatchResult(tournament.id, match.id, {
        gamesWonA: aWins ? 2 : 0,
        gamesWonB: aWins ? 0 : 2,
        totalPointsA: aWins ? 8 : 3,
        totalPointsB: aWins ? 3 : 8,
        total20sA: aWins ? 2 : 0,
        total20sB: aWins ? 0 : 1
      });
    }

    // Generate round 2 via Firebase function (triggers tiebreaker with varied points)
    const r2ok = await generateSwissPairings(tournament.id, 2);
    expect(r2ok).toBe(true);

    // Verify: no undefined values in the entire groupStage
    t = readTournament(tournament.id);
    assertNoUndefined(t.groupStage, 'groupStage');

    // Specifically check standings fields
    const standings = t.groupStage!.groups[0].standings!;
    for (const s of standings) {
      if ('tiedWith' in s) expect(s.tiedWith).not.toBeUndefined();
      if ('tieReason' in s) expect(s.tieReason).not.toBeUndefined();
    }
  });

  it('Swiss transition → bracket: bracket generation succeeds with tiebreaker standings', async () => {
    const tournament = createDraftSwissTournament(8, 'TWO_PHASE', { numSwissRounds: 2 });
    seedTournament(tournament);

    // DRAFT → GROUP_STAGE
    expect(await transitionTournament(tournament.id, 'GROUP_STAGE')).toBe(true);

    // Complete round 1
    let t = readTournament(tournament.id);
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);
    t = readTournament(tournament.id);
    for (const match of getGroupMatches(t)) {
      await completeGroupMatch(tournament.id, match);
    }

    // Generate round 2
    expect(await generateSwissPairings(tournament.id, 2)).toBe(true);

    // Activate and complete round 2
    t = readTournament(tournament.id);
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);
    t = readTournament(tournament.id);
    for (const match of getGroupMatches(t)) {
      await completeGroupMatch(tournament.id, match);
    }

    // GROUP_STAGE → TRANSITION
    expect(await transitionTournament(tournament.id, 'TRANSITION')).toBe(true);

    // Mark top 4 as qualified
    t = readTournament(tournament.id);
    markQualifiers(t, 4);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);

    // Verify groupStage is clean before bracket generation
    t = readTournament(tournament.id);
    assertNoUndefined(t.groupStage, 'groupStage');

    // TRANSITION → FINAL_STAGE (generates bracket)
    expect(await transitionTournament(tournament.id, 'FINAL_STAGE')).toBe(true);

    t = readTournament(tournament.id);
    expect(t.status).toBe('FINAL_STAGE');
    expect(t.finalStage!.goldBracket).toBeDefined();

    // Bracket matches have legitimately undefined fields (winner, etc.) for PENDING matches.
    // What matters is that updateTournament's cleanUndefined strips them before Firestore.
    // Verify the bracket was actually generated with matches.
    const bracketRounds = t.finalStage!.goldBracket!.rounds;
    expect(bracketRounds.length).toBeGreaterThanOrEqual(2);
    expect(bracketRounds[0].matches.length).toBeGreaterThan(0);
  });

  it('bracket → COMPLETED: tournament correctly marks as completed with no pending matches', async () => {
    const tournament = createDraftTournament(4, 'ONE_PHASE');
    (tournament as any).groupStage = undefined;
    seedTournament(tournament);

    // DRAFT → FINAL_STAGE
    expect(await transitionTournament(tournament.id, 'FINAL_STAGE')).toBe(true);

    let t = readTournament(tournament.id);
    expect(t.status).toBe('FINAL_STAGE');

    // Complete all bracket matches round by round
    let bracketMatches = getPendingBracketMatches(t);
    while (bracketMatches.length > 0) {
      for (const match of bracketMatches) {
        await completeBracketMatch(tournament.id, match);
      }
      t = readTournament(tournament.id);
      bracketMatches = getPendingBracketMatches(t);
    }

    // Verify COMPLETED
    expect(t.status).toBe('COMPLETED');
    expect(t.completedAt).toBeDefined();
    expect(t.finalStage!.isComplete).toBe(true);
    expect(t.finalStage!.winner).toBeDefined();

    // Verify NO pending or in-progress matches remain in any bracket round
    const bracket = t.finalStage!.goldBracket!;
    for (const round of bracket.rounds) {
      for (const match of round.matches) {
        if (match.participantA && match.participantB
            && match.participantA !== 'BYE' && match.participantB !== 'BYE') {
          expect(match.status).not.toBe('PENDING');
          expect(match.status).not.toBe('IN_PROGRESS');
        }
      }
    }

    // Verify all participants have final positions
    const withPositions = t.participants.filter(p => p.finalPosition !== undefined);
    expect(withPositions.length).toBe(4);
    const positions = withPositions.map(p => p.finalPosition!).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4]);

    // Verify no undefined in final state
    assertNoUndefined(t.finalStage, 'finalStage');
  });

  it('recalculateStandings produces Firestore-safe data', async () => {
    const tournament = createDraftSwissTournament(6, 'GROUP_ONLY', { numSwissRounds: 2 });
    seedTournament(tournament);

    expect(await transitionTournament(tournament.id, 'GROUP_STAGE')).toBe(true);

    // Complete round 1 with varied results
    let t = readTournament(tournament.id);
    startPendingMatches(t);
    mockStore.setDocument(`tournaments/${tournament.id}`, t as unknown as Record<string, unknown>);
    t = readTournament(tournament.id);
    const matches = getGroupMatches(t);
    for (let i = 0; i < matches.length; i++) {
      await updateMatchResult(tournament.id, matches[i].id, {
        gamesWonA: i % 2 === 0 ? 2 : 0,
        gamesWonB: i % 2 === 0 ? 0 : 2,
        totalPointsA: i % 2 === 0 ? 8 : 3,
        totalPointsB: i % 2 === 0 ? 3 : 8,
        total20sA: 1, total20sB: 0
      });
    }

    // Recalculate standings (triggers tiebreaker)
    expect(await recalculateStandings(tournament.id)).toBe(true);

    // Verify no undefined values
    t = readTournament(tournament.id);
    assertNoUndefined(t.groupStage, 'groupStage');
  });
});
