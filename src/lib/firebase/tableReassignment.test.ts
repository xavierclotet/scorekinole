/**
 * Table reassignment tests
 *
 * Tests for edge cases with odd players + limited tables in live tournaments:
 * - reassignFreedTable behavior
 * - RR/Swiss with odd players + limited tables combined
 * - Bracket table assignment with limited tables
 * - Integration: completion → reassignment flow (updateMatchResult)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import {
  createTestTournament,
  createSwissTournament,
  getInProgressMatches,
  getAllMatches,
  createMatchResult,
  findMatchInTournament
} from './__mocks__/testTournamentFactory';
import { generateRoundRobinSchedule, assignTablesToRounds } from '$lib/algorithms/roundRobin';
import { generateSwissPairings, assignTablesWithVariety } from '$lib/algorithms/swiss';
import { generateBracket } from '$lib/algorithms/bracket';
import type { Tournament, GroupMatch, TournamentParticipant, BracketMatch } from '$lib/types/tournament';

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

// ─── Import functions under test (AFTER mocks) ──────────────────────────────

const { updateMatchResult } = await import('./tournamentMatches');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a tournament with proper limited-table assignment.
 * Unlike createTestTournament (which wraps tables via modulo),
 * this uses the real assignTablesToRounds/assignTablesWithVariety algorithms,
 * then activates only the matches that got a table.
 */
function createLimitedTableTournament(opts: {
  numParticipants: number;
  numTables: number;
  type?: 'ROUND_ROBIN' | 'SWISS';
}): Tournament {
  const { numParticipants, numTables, type = 'ROUND_ROBIN' } = opts;

  if (type === 'SWISS') {
    const tournament = createSwissTournament({
      numParticipants,
      numTables,
      tournamentId: `test-limited-${numParticipants}-${numTables}`
    });

    // Reset: clear all table/status assignments from factory
    const group = tournament.groupStage!.groups[0];
    const pairings = group.pairings!;
    for (const round of pairings) {
      for (const m of round.matches) {
        m.status = 'PENDING';
        delete m.tableNumber;
        delete m.startedAt;
      }
    }

    // Re-assign tables using real algorithm (limited)
    const r1 = pairings[0];
    r1.matches = assignTablesWithVariety(r1.matches, numTables);

    // Activate only matches that got a table
    const now = Date.now();
    for (const m of r1.matches) {
      if (m.tableNumber && m.participantB !== 'BYE') {
        m.status = 'IN_PROGRESS';
        m.startedAt = now - 600000;
      }
    }

    return tournament;
  }

  // ROUND_ROBIN
  const tournament = createTestTournament({
    numParticipants,
    numTables,
    tournamentId: `test-limited-${numParticipants}-${numTables}`
  });

  // Reset: clear all table/status assignments from factory
  const group = tournament.groupStage!.groups[0];
  const schedule = group.schedule!;
  for (const round of schedule) {
    for (const m of round.matches) {
      m.status = 'PENDING';
      delete m.tableNumber;
      delete m.startedAt;
    }
  }

  // Re-assign tables using real algorithm (limited)
  group.schedule = assignTablesToRounds(schedule, numTables);

  // Activate only round 1 matches that got a table
  const now = Date.now();
  for (const m of group.schedule[0].matches) {
    if (m.tableNumber && m.participantB !== 'BYE') {
      m.status = 'IN_PROGRESS';
      m.startedAt = now - 600000;
    }
  }

  return tournament;
}

/** Get all matches from a specific round */
function getRoundMatches(tournament: Tournament, groupIndex: number, roundIndex: number): GroupMatch[] {
  const group = tournament.groupStage?.groups[groupIndex];
  if (!group) return [];
  const rounds = group.schedule || group.pairings || [];
  return rounds[roundIndex]?.matches || [];
}

/** Get real (non-BYE) matches from a round */
function getRealMatches(matches: GroupMatch[]): GroupMatch[] {
  return matches.filter(m => m.participantB !== 'BYE');
}

/** Get BYE matches from a round */
function getByeMatches(matches: GroupMatch[]): GroupMatch[] {
  return matches.filter(m => m.participantB === 'BYE');
}

/** Get matches with table assigned */
function getMatchesWithTable(matches: GroupMatch[]): GroupMatch[] {
  return matches.filter(m => m.tableNumber != null);
}

/** Get pending matches without table */
function getPendingWithoutTable(matches: GroupMatch[]): GroupMatch[] {
  return matches.filter(m => m.status === 'PENDING' && m.participantB !== 'BYE' && !m.tableNumber);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── A. Round Robin + Odd Players + Limited Tables (algorithm-level) ─────────

describe('RR: odd players + limited tables — table assignment', () => {
  it('5 players, 1 table: round has 2 real matches + 1 BYE, only 1 gets table', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 1);

    for (const round of assigned) {
      const realMatches = getRealMatches(round.matches);
      const byeMatches = getByeMatches(round.matches);
      const withTable = getMatchesWithTable(realMatches);

      expect(realMatches.length).toBe(2);
      expect(byeMatches.length).toBe(1);
      // Only 1 table available → 1 match gets a table
      expect(withTable.length).toBe(1);
      // BYE match never gets a table
      expect(byeMatches.every(m => m.tableNumber == null)).toBe(true);
    }
  });

  it('7 players, 2 tables: round has 3 real matches + 1 BYE, 2 get tables', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 2);

    for (const round of assigned) {
      const realMatches = getRealMatches(round.matches);
      const byeMatches = getByeMatches(round.matches);
      const withTable = getMatchesWithTable(realMatches);

      expect(realMatches.length).toBe(3);
      expect(byeMatches.length).toBe(1);
      // Only 2 tables available → 2 matches get tables
      expect(withTable.length).toBe(2);
      expect(byeMatches.every(m => m.tableNumber == null)).toBe(true);
    }
  });

  it('9 players, 3 tables: round has 4 real matches + 1 BYE, 3 get tables', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `p${i + 1}`);
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 3);

    for (const round of assigned) {
      const realMatches = getRealMatches(round.matches);
      const byeMatches = getByeMatches(round.matches);
      const withTable = getMatchesWithTable(realMatches);

      expect(realMatches.length).toBe(4);
      expect(byeMatches.length).toBe(1);
      expect(withTable.length).toBe(3);
      expect(byeMatches.every(m => m.tableNumber == null)).toBe(true);
    }
  });

  it('11 players, 4 tables: round has 5 real matches + 1 BYE, 4 get tables', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `p${i + 1}`);
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 4);

    for (const round of assigned) {
      const realMatches = getRealMatches(round.matches);
      const byeMatches = getByeMatches(round.matches);
      const withTable = getMatchesWithTable(realMatches);

      expect(realMatches.length).toBe(5);
      expect(byeMatches.length).toBe(1);
      expect(withTable.length).toBe(4);
      expect(byeMatches.every(m => m.tableNumber == null)).toBe(true);
    }
  });

  it('table numbers within a round are unique (no duplicates)', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `p${i + 1}`);
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 3);

    for (const round of assigned) {
      const tables = round.matches
        .filter(m => m.tableNumber != null)
        .map(m => m.tableNumber!);
      const uniqueTables = new Set(tables);
      expect(uniqueTables.size).toBe(tables.length);
    }
  });

  it('even players (6), 2 tables: round has 3 real matches, 2 get tables, 1 TBD', () => {
    const ids = Array.from({ length: 6 }, (_, i) => `p${i + 1}`);
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 2);

    for (const round of assigned) {
      const realMatches = getRealMatches(round.matches);
      const withTable = getMatchesWithTable(realMatches);

      expect(realMatches.length).toBe(3);
      expect(getByeMatches(round.matches).length).toBe(0);
      expect(withTable.length).toBe(2);
    }
  });
});

// ─── B. Swiss + Odd Players + Limited Tables (algorithm-level) ───────────────

describe('Swiss: odd players + limited tables — table assignment', () => {
  it('7 players, 2 tables: round has 3 real matches + 1 BYE, 2 get tables', () => {
    const participants = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i + 1}`,
      type: 'GUEST' as const,
      name: `Player ${i + 1}`,
      status: 'ACTIVE' as const,
      rankingSnapshot: 1000 - i * 10
    }));
    const standings = participants.map(p => ({
      participantId: p.id,
      position: 0,
      matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesTied: 0,
      points: 0, total20s: 0, totalPointsScored: 0
    }));

    const matches = generateSwissPairings(participants, standings, [], 1);
    const assigned = assignTablesWithVariety(matches, 2);

    const realMatches = getRealMatches(assigned);
    const byeMatches = getByeMatches(assigned);
    const withTable = getMatchesWithTable(realMatches);

    expect(realMatches.length).toBe(3);
    expect(byeMatches.length).toBe(1);
    expect(withTable.length).toBe(2);
    expect(byeMatches.every(m => m.tableNumber == null)).toBe(true);
  });

  it('9 players, 3 tables: round has 4 real matches + 1 BYE, 3 get tables', () => {
    const participants = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i + 1}`,
      type: 'GUEST' as const,
      name: `Player ${i + 1}`,
      status: 'ACTIVE' as const,
      rankingSnapshot: 1000 - i * 10
    }));
    const standings = participants.map(p => ({
      participantId: p.id,
      position: 0,
      matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesTied: 0,
      points: 0, total20s: 0, totalPointsScored: 0
    }));

    const matches = generateSwissPairings(participants, standings, [], 1);
    const assigned = assignTablesWithVariety(matches, 3);

    const realMatches = getRealMatches(assigned);
    const byeMatches = getByeMatches(assigned);
    const withTable = getMatchesWithTable(realMatches);

    expect(realMatches.length).toBe(4);
    expect(byeMatches.length).toBe(1);
    expect(withTable.length).toBe(3);
    expect(byeMatches.every(m => m.tableNumber == null)).toBe(true);
  });

  it('BYE match never assigned a table in Swiss', () => {
    const participants = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i + 1}`,
      type: 'GUEST' as const,
      name: `Player ${i + 1}`,
      status: 'ACTIVE' as const,
      rankingSnapshot: 1000 - i * 10
    }));
    const standings = participants.map(p => ({
      participantId: p.id,
      position: 0,
      matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesTied: 0,
      points: 0, total20s: 0, totalPointsScored: 0
    }));

    const matches = generateSwissPairings(participants, standings, [], 1);
    // Use lots of tables to ensure BYE still doesn't get one
    const assigned = assignTablesWithVariety(matches, 10);

    const byeMatches = getByeMatches(assigned);
    expect(byeMatches.length).toBe(1);
    expect(byeMatches[0].tableNumber).toBeUndefined();
  });
});

// ─── C. Bracket generation with odd players (algorithm-level) ────────────────

describe('Bracket: odd players — BYE handling', () => {
  function makeParticipants(n: number): TournamentParticipant[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`,
      type: 'GUEST' as const,
      name: `Player ${i + 1}`,
      status: 'ACTIVE' as const,
      rankingSnapshot: 1000 - i * 10
    }));
  }

  it('5 qualifiers: R1 has BYE matches that auto-complete, real matches are PENDING', () => {
    const bracket = generateBracket(makeParticipants(5));

    const r1 = bracket.rounds[0];
    const byeMatches = r1.matches.filter(m =>
      m.participantA === 'BYE' || m.participantB === 'BYE'
    );
    const realMatches = r1.matches.filter(m =>
      m.participantA !== 'BYE' && m.participantB !== 'BYE' &&
      m.participantA && m.participantB
    );

    // BYE matches should be auto-completed (WALKOVER)
    expect(byeMatches.length).toBeGreaterThan(0);
    expect(byeMatches.every(m => m.status === 'WALKOVER' || m.status === 'COMPLETED')).toBe(true);
    // BYE matches should never have tables
    expect(byeMatches.every(m => m.tableNumber == null)).toBe(true);

    // Real matches should exist
    expect(realMatches.length).toBeGreaterThan(0);
  });

  it('7 qualifiers: R1 has 1 BYE match + 3 real matches', () => {
    const bracket = generateBracket(makeParticipants(7));

    const r1 = bracket.rounds[0];
    const byeMatches = r1.matches.filter(m =>
      m.participantA === 'BYE' || m.participantB === 'BYE'
    );
    const realMatches = r1.matches.filter(m =>
      m.participantA !== 'BYE' && m.participantB !== 'BYE' &&
      m.participantA && m.participantB
    );

    expect(byeMatches.length).toBe(1);
    expect(realMatches.length).toBe(3);
  });

  it('8 qualifiers: no BYE matches, all 4 R1 matches are real', () => {
    const bracket = generateBracket(makeParticipants(8));

    const r1 = bracket.rounds[0];
    const byeMatches = r1.matches.filter(m =>
      m.participantA === 'BYE' || m.participantB === 'BYE'
    );

    expect(byeMatches.length).toBe(0);
    expect(r1.matches.length).toBe(4);
  });
});

// ─── D. reassignFreedTable via updateMatchResult (integration) ───────────────

describe('reassignFreedTable via updateMatchResult', () => {
  it('RR 7 players, 2 tables: completing match frees table → assigned to PENDING match', async () => {
    // Create tournament: 7 players, 2 tables
    // Round 1 has 3 real matches + 1 BYE
    // With 2 tables: 2 matches get tables, 1 is PENDING without table
    const tournament = createLimitedTableTournament({
      numParticipants: 7,
      numTables: 2
    });

    // Get round 1 matches
    const round1 = getRoundMatches(tournament, 0, 0);
    const realR1 = getRealMatches(round1);

    // Find the match without a table (TBD)
    const withoutTable = realR1.filter(m => !m.tableNumber);
    const withTable = realR1.filter(m => m.tableNumber != null);

    expect(withTable.length).toBe(2);
    expect(withoutTable.length).toBe(1);

    // Seed and complete a match that has a table
    seedTournament(tournament);
    const matchToComplete = withTable[0];
    const freedTable = matchToComplete.tableNumber!;

    const success = await updateMatchResult(
      tournament.id,
      matchToComplete.id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );
    expect(success).toBe(true);

    // Verify: completed match has playedOnTable set, tableNumber cleared
    const updated = readTournament(tournament.id);
    const completedMatch = findMatchInTournament(updated, matchToComplete.id)!;
    expect(completedMatch.status).toBe('COMPLETED');
    expect(completedMatch.playedOnTable).toBe(freedTable);
    expect(completedMatch.tableNumber).toBeUndefined();

    // Verify: the previously TBD match now has the freed table
    const previouslyTbd = findMatchInTournament(updated, withoutTable[0].id)!;
    expect(previouslyTbd.tableNumber).toBe(freedTable);
  });

  it('RR 9 players, 3 tables: completing all 3 → all freed tables go to waiting matches', async () => {
    const tournament = createLimitedTableTournament({
      numParticipants: 9,
      numTables: 3
    });

    const round1 = getRoundMatches(tournament, 0, 0);
    const realR1 = getRealMatches(round1);

    // 9 players → 4 real matches + 1 BYE per round, 3 tables → 3 with table, 1 TBD
    const withTable = realR1.filter(m => m.tableNumber != null);
    const withoutTable = realR1.filter(m => !m.tableNumber);
    expect(withTable.length).toBe(3);
    expect(withoutTable.length).toBe(1);

    seedTournament(tournament);

    // Complete the first match
    const result = await updateMatchResult(
      tournament.id,
      withTable[0].id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );
    expect(result).toBe(true);

    // The TBD match should now have a table
    const updated = readTournament(tournament.id);
    const tbd = findMatchInTournament(updated, withoutTable[0].id)!;
    expect(tbd.tableNumber).toBeDefined();
  });

  it('no PENDING matches → no crash on reassignment', async () => {
    // Create tournament with enough tables for all matches
    const tournament = createTestTournament({
      numParticipants: 5,
      numTables: 10  // Plenty of tables
    });

    seedTournament(tournament);

    // Complete a match — no PENDING matches waiting
    const matches = getInProgressMatches(tournament);
    const success = await updateMatchResult(
      tournament.id,
      matches[0].id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );
    expect(success).toBe(true);

    // Should complete without errors
    const updated = readTournament(tournament.id);
    const completed = findMatchInTournament(updated, matches[0].id)!;
    expect(completed.status).toBe('COMPLETED');
    expect(completed.playedOnTable).toBeDefined();
  });

  it('BYE match never gets a freed table', async () => {
    const tournament = createLimitedTableTournament({
      numParticipants: 7,
      numTables: 2
    });

    seedTournament(tournament);

    // Complete all IN_PROGRESS matches in round 1
    const round1 = getRoundMatches(tournament, 0, 0);
    const inProgressR1 = round1.filter(m => m.status === 'IN_PROGRESS');

    for (const match of inProgressR1) {
      await updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(2, 0, 8, 2, 1, 0)
      );
    }

    const updated = readTournament(tournament.id);
    const updatedR1 = getRoundMatches(updated, 0, 0);
    const byeMatches = getByeMatches(updatedR1);

    // BYE matches should never have a table
    expect(byeMatches.every(m => m.tableNumber == null && m.playedOnTable == null)).toBe(true);
  });

  it('playedOnTable is set and tableNumber cleared on completion', async () => {
    const tournament = createTestTournament({
      numParticipants: 5,
      numTables: 4
    });

    seedTournament(tournament);
    const matches = getInProgressMatches(tournament);
    const match = matches[0];
    const originalTable = match.tableNumber!;

    const success = await updateMatchResult(
      tournament.id,
      match.id,
      createMatchResult(2, 1, 6, 4, 1, 0)
    );
    expect(success).toBe(true);

    const updated = readTournament(tournament.id);
    const completedMatch = findMatchInTournament(updated, match.id)!;

    expect(completedMatch.status).toBe('COMPLETED');
    expect(completedMatch.playedOnTable).toBe(originalTable);
    expect(completedMatch.tableNumber).toBeUndefined();
  });

  it('Swiss 7 players, 2 tables: completing match frees table → reassigned', async () => {
    const tournament = createLimitedTableTournament({
      numParticipants: 7,
      numTables: 2,
      type: 'SWISS'
    });

    const round1 = getRoundMatches(tournament, 0, 0);
    const realR1 = getRealMatches(round1);
    const withTable = realR1.filter(m => m.tableNumber != null);
    const withoutTable = realR1.filter(m => !m.tableNumber);

    expect(withTable.length).toBe(2);
    expect(withoutTable.length).toBe(1);

    seedTournament(tournament);

    const success = await updateMatchResult(
      tournament.id,
      withTable[0].id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );
    expect(success).toBe(true);

    const updated = readTournament(tournament.id);
    const completedMatch = findMatchInTournament(updated, withTable[0].id)!;
    expect(completedMatch.playedOnTable).toBeDefined();
    expect(completedMatch.tableNumber).toBeUndefined();

    const previouslyTbd = findMatchInTournament(updated, withoutTable[0].id)!;
    expect(previouslyTbd.tableNumber).toBeDefined();
  });

  it('multiple sequential completions → all freed tables reassigned correctly', async () => {
    // 7 players, 2 tables: each completion should reassign to waiting
    const tournament = createLimitedTableTournament({
      numParticipants: 7,
      numTables: 2
    });

    seedTournament(tournament);

    // Get round 1 matches
    const round1 = getRoundMatches(tournament, 0, 0);
    const realR1 = getRealMatches(round1);
    const withTable = realR1.filter(m => m.tableNumber != null);

    // Complete first match — should reassign its table
    await updateMatchResult(
      tournament.id,
      withTable[0].id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    let updated = readTournament(tournament.id);
    let updatedR1 = getRoundMatches(updated, 0, 0);
    let pendingNoTable = getPendingWithoutTable(updatedR1);
    // After first completion: the TBD match got a table, no more TBD
    expect(pendingNoTable.length).toBe(0);

    // Complete second match
    const stillInProgress = updatedR1.filter(m => m.status === 'IN_PROGRESS');
    if (stillInProgress.length > 0) {
      await updateMatchResult(
        tournament.id,
        stillInProgress[0].id,
        createMatchResult(0, 2, 2, 8, 0, 1)
      );

      updated = readTournament(tournament.id);
      updatedR1 = getRoundMatches(updated, 0, 0);
      // Completed matches should all have playedOnTable
      const completed = updatedR1.filter(m => m.status === 'COMPLETED');
      expect(completed.every(m => m.playedOnTable != null)).toBe(true);
    }
  });

  it('concurrent completions with limited tables', async () => {
    const tournament = createLimitedTableTournament({
      numParticipants: 7,
      numTables: 2
    });

    seedTournament(tournament);

    const round1 = getRoundMatches(tournament, 0, 0);
    const inProgress = round1.filter(m => m.status === 'IN_PROGRESS');

    // Only 2 matches are IN_PROGRESS (have tables), 1 is PENDING
    expect(inProgress.length).toBe(2);

    // Complete both IN_PROGRESS matches concurrently
    const results = await Promise.all(
      inProgress.map((match, i) =>
        updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(i % 2 === 0 ? 2 : 0, i % 2 === 0 ? 0 : 2, 6, 4, 1, 0)
        )
      )
    );

    expect(results.every(r => r === true)).toBe(true);

    const updated = readTournament(tournament.id);
    const updatedR1 = getRoundMatches(updated, 0, 0);
    const completed = updatedR1.filter(m => m.status === 'COMPLETED');

    // Both IN_PROGRESS matches completed
    expect(completed.length).toBe(2);

    // All completed matches should have playedOnTable
    expect(completed.every(m => m.playedOnTable != null)).toBe(true);
    // None should have tableNumber
    expect(completed.every(m => m.tableNumber == null)).toBe(true);

    // The previously PENDING match should now have a freed table
    const pending = updatedR1.filter(m => m.status === 'PENDING' && m.participantB !== 'BYE');
    expect(pending.length).toBe(1);
    expect(pending[0].tableNumber).toBeDefined();
  });

  it('table history uses playedOnTable for fairness after completions', async () => {
    const tournament = createTestTournament({
      numParticipants: 5,
      numTables: 2
    });

    seedTournament(tournament);

    // Complete round 1 matches
    const r1Matches = getRoundMatches(tournament, 0, 0);
    const inProgress = r1Matches.filter(m => m.status === 'IN_PROGRESS');

    for (const match of inProgress) {
      await updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(2, 0, 8, 2, 1, 0)
      );
    }

    const updated = readTournament(tournament.id);
    const allMatches = getAllMatches(updated, 0);

    // Completed matches should preserve table info in playedOnTable
    const completed = allMatches.filter(m => m.status === 'COMPLETED');
    for (const m of completed) {
      expect(m.playedOnTable).toBeDefined();
      expect(m.tableNumber).toBeUndefined();
    }
  });
});

// ─── E. Regression: duplicate tableNumber after completion (Bug 1) ───────────

describe('Regression: no duplicate tableNumber in same round after completion', () => {
  it('RR 7p/2t: after completing a match, no two non-completed matches share a table', async () => {
    const tournament = createLimitedTableTournament({
      numParticipants: 7,
      numTables: 2
    });
    seedTournament(tournament);

    const round1 = getRoundMatches(tournament, 0, 0);
    const inProgress = round1.filter(m => m.status === 'IN_PROGRESS');

    // Complete one match
    await updateMatchResult(
      tournament.id,
      inProgress[0].id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    const updated = readTournament(tournament.id);
    const updatedR1 = getRoundMatches(updated, 0, 0);

    // Collect tableNumbers from all non-completed matches
    const activeTables = updatedR1
      .filter(m => m.status !== 'COMPLETED' && m.status !== 'WALKOVER' && m.tableNumber != null)
      .map(m => m.tableNumber!);
    expect(new Set(activeTables).size).toBe(activeTables.length);

    // The completed match must NOT still hold a tableNumber
    const completed = updatedR1.find(m => m.id === inProgress[0].id)!;
    expect(completed.tableNumber).toBeUndefined();
    expect(completed.playedOnTable).toBeDefined();
  });

  it('RR 9p/3t: completing 2 matches sequentially never creates table collisions', async () => {
    const tournament = createLimitedTableTournament({
      numParticipants: 9,
      numTables: 3
    });
    seedTournament(tournament);

    const round1 = getRoundMatches(tournament, 0, 0);
    const inProgress = round1.filter(m => m.status === 'IN_PROGRESS');

    // Complete two matches sequentially
    for (let i = 0; i < 2 && i < inProgress.length; i++) {
      await updateMatchResult(
        tournament.id,
        inProgress[i].id,
        createMatchResult(2, 0, 8, 2, 1, 0)
      );

      const updated = readTournament(tournament.id);
      const updatedR1 = getRoundMatches(updated, 0, 0);

      // After each completion: no duplicate tables among active matches
      const activeTables = updatedR1
        .filter(m => m.status !== 'COMPLETED' && m.status !== 'WALKOVER' && m.tableNumber != null)
        .map(m => m.tableNumber!);
      expect(new Set(activeTables).size).toBe(activeTables.length);

      // Completed matches never hold tableNumber
      const completedMatches = updatedR1.filter(m => m.status === 'COMPLETED');
      expect(completedMatches.every(m => m.tableNumber == null)).toBe(true);
      expect(completedMatches.every(m => m.playedOnTable != null)).toBe(true);
    }
  });

  it('Swiss 7p/2t: completed match releases table, no collision with reassigned match', async () => {
    const tournament = createLimitedTableTournament({
      numParticipants: 7,
      numTables: 2,
      type: 'SWISS'
    });
    seedTournament(tournament);

    const round1 = getRoundMatches(tournament, 0, 0);
    const inProgress = round1.filter(m => m.status === 'IN_PROGRESS');
    const freedTable = inProgress[0].tableNumber!;

    await updateMatchResult(
      tournament.id,
      inProgress[0].id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    const updated = readTournament(tournament.id);
    const updatedR1 = getRoundMatches(updated, 0, 0);

    // The completed match must not hold the table
    const completedMatch = updatedR1.find(m => m.id === inProgress[0].id)!;
    expect(completedMatch.tableNumber).toBeUndefined();
    expect(completedMatch.playedOnTable).toBe(freedTable);

    // Only ONE active match should hold that freed table
    const matchesWithFreedTable = updatedR1.filter(
      m => m.tableNumber === freedTable && m.status !== 'COMPLETED' && m.status !== 'WALKOVER'
    );
    expect(matchesWithFreedTable.length).toBe(1);
  });
});

// ─── F. Regression: autofill should skip TBD matches (Bug 2) ────────────────

describe('Regression: autofill filter skips matches without table', () => {
  // This tests the filtering logic used by autoFillAllMatches:
  //   m.status === 'PENDING' && m.participantB !== 'BYE' && m.tableNumber

  it('RR 7p/2t: autofillable count = matches with tables, not all pending', () => {
    const tournament = createLimitedTableTournament({
      numParticipants: 7,
      numTables: 2
    });

    const round1 = getRoundMatches(tournament, 0, 0);

    // All pending non-BYE (old buggy filter)
    const allPending = round1.filter(
      m => m.status === 'PENDING' && m.participantB !== 'BYE'
    );
    // Only playable: pending non-BYE WITH table (correct filter)
    const playable = round1.filter(
      m => m.status === 'PENDING' && m.participantB !== 'BYE' && m.tableNumber
    );

    // There should be 1 PENDING without table (TBD)
    expect(allPending.length).toBeGreaterThan(playable.length);
    // Only matches with tables are playable
    expect(playable.length).toBe(0); // All table-assigned matches are IN_PROGRESS, not PENDING
    // The IN_PROGRESS ones have tables — the PENDING ones don't
    const inProgressWithTable = round1.filter(
      m => m.status === 'IN_PROGRESS' && m.tableNumber
    );
    expect(inProgressWithTable.length).toBe(2);
  });

  it('RR 9p/3t: after 1 completion, freed table goes to PENDING → now autofillable', async () => {
    const tournament = createLimitedTableTournament({
      numParticipants: 9,
      numTables: 3
    });
    seedTournament(tournament);

    // Before any completion: PENDING matches without table should NOT be fillable
    const round1Before = getRoundMatches(tournament, 0, 0);
    const fillableBefore = round1Before.filter(
      m => m.status === 'PENDING' && m.participantB !== 'BYE' && m.tableNumber
    );
    expect(fillableBefore.length).toBe(0);

    // Complete one match → frees a table → PENDING match gets it
    const inProgress = round1Before.filter(m => m.status === 'IN_PROGRESS');
    await updateMatchResult(
      tournament.id,
      inProgress[0].id,
      createMatchResult(2, 0, 8, 2, 1, 0)
    );

    const updated = readTournament(tournament.id);
    const round1After = getRoundMatches(updated, 0, 0);

    // Now the previously-TBD match has a table and is PENDING → fillable
    const fillableAfter = round1After.filter(
      m => m.status === 'PENDING' && m.participantB !== 'BYE' && m.tableNumber
    );
    expect(fillableAfter.length).toBe(1);
    expect(fillableAfter[0].tableNumber).toBeDefined();
  });

  it('Swiss 5p/1t: only 1 match fillable at a time despite 2 real matches', () => {
    const participants = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i + 1}`,
      type: 'GUEST' as const,
      name: `Player ${i + 1}`,
      status: 'ACTIVE' as const,
      rankingSnapshot: 1000 - i * 10
    }));
    const standings = participants.map(p => ({
      participantId: p.id,
      position: 0,
      matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesTied: 0,
      points: 0, total20s: 0, totalPointsScored: 0
    }));

    const matches = generateSwissPairings(participants, standings, [], 1);
    const assigned = assignTablesWithVariety(matches, 1);

    const realMatches = getRealMatches(assigned);
    expect(realMatches.length).toBe(2);

    // With 1 table: only 1 match has a table
    const withTable = realMatches.filter(m => m.tableNumber != null);
    expect(withTable.length).toBe(1);

    // Autofill filter: PENDING + non-BYE + has table
    const fillable = assigned.filter(
      m => m.status === 'PENDING' && m.participantB !== 'BYE' && m.tableNumber
    );
    expect(fillable.length).toBe(1);

    // The TBD one is NOT fillable
    const tbd = realMatches.filter(m => !m.tableNumber);
    expect(tbd.length).toBe(1);
  });

  it('all matches have tables → all are fillable (no false negatives)', () => {
    const ids = Array.from({ length: 6 }, (_, i) => `p${i + 1}`);
    const schedule = generateRoundRobinSchedule(ids);
    // 6 players = 3 matches per round, 3 tables = perfect fit
    const assigned = assignTablesToRounds(schedule, 3);

    for (const round of assigned) {
      const fillable = round.matches.filter(
        m => m.status === 'PENDING' && m.participantB !== 'BYE' && m.tableNumber
      );
      const realMatches = getRealMatches(round.matches);
      // All real matches should be fillable
      expect(fillable.length).toBe(realMatches.length);
    }
  });
});

// ─── G. Edge cases ───────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('3 players, 1 table: round has 1 real match + 1 BYE, 1 gets table', () => {
    const ids = ['p1', 'p2', 'p3'];
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 1);

    for (const round of assigned) {
      const realMatches = getRealMatches(round.matches);
      const byeMatches = getByeMatches(round.matches);
      const withTable = getMatchesWithTable(realMatches);

      expect(realMatches.length).toBe(1);
      expect(byeMatches.length).toBe(1);
      expect(withTable.length).toBe(1);
    }
  });

  it('2 players, 1 table: every match gets a table (no BYE)', () => {
    const ids = ['p1', 'p2'];
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 1);

    expect(assigned.length).toBe(1);
    expect(assigned[0].matches.length).toBe(1);
    expect(assigned[0].matches[0].tableNumber).toBe(1);
  });

  it('tables exactly match real matches per round: all get tables', () => {
    // 8 players = 4 matches per round, 4 tables → perfect fit
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 4);

    for (const round of assigned) {
      const realMatches = getRealMatches(round.matches);
      const withTable = getMatchesWithTable(realMatches);
      expect(withTable.length).toBe(realMatches.length);
    }
  });

  it('more tables than matches: all matches get unique tables', () => {
    const ids = ['p1', 'p2', 'p3', 'p4'];
    const schedule = generateRoundRobinSchedule(ids);
    const assigned = assignTablesToRounds(schedule, 10);

    for (const round of assigned) {
      const realMatches = getRealMatches(round.matches);
      const withTable = getMatchesWithTable(realMatches);
      expect(withTable.length).toBe(realMatches.length);

      // All table numbers unique
      const tables = withTable.map(m => m.tableNumber!);
      expect(new Set(tables).size).toBe(tables.length);
    }
  });
});
