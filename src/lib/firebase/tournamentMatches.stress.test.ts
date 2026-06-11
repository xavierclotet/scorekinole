/**
 * Stress tests: 50-100 concurrent matches on a single tournament document.
 *
 * Requirement: live tournament management must support 50-100 matches being
 * played at the same time (admin page + /game devices all writing to the same
 * tournament doc) while the public page follows in real time.
 *
 * The mock Firestore simulates optimistic concurrency (version check + retry),
 * which is exactly how real Firestore transactions behave under contention.
 * These tests verify ZERO lost updates at burst sizes of 50 and 100 — the
 * worst case where every device commits in the same instant. They exercise
 * the withContentionRetry() outer retry added to the hot write paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFirestore, MockDocumentReference } from './__mocks__/mockFirestore';
import {
  createMultiGroupTournament,
  getInProgressMatches,
  createMatchResult,
  findMatchInTournament
} from './__mocks__/testTournamentFactory';
import type { Tournament } from '$lib/types/tournament';

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

const { updateMatchResult, updateTournamentMatchRounds } = await import('./tournamentMatches');

beforeEach(() => {
  mockStore = new MockFirestore();
  vi.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function progressRounds(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    gameNumber: 1,
    roundInGame: i + 1,
    pointsA: i % 2 === 0 ? 2 : 0,
    pointsB: i % 2 === 0 ? 0 : 2,
    twentiesA: 1,
    twentiesB: 0
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('50-100 concurrent matches on one tournament', () => {
  it('50 simultaneous match completions — zero lost updates', async () => {
    // 40 players in 8 groups of 5 → 10 real matches per group = 80 playable
    const tournament = createMultiGroupTournament(40, 8, { tournamentId: 'stress-50' });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament).slice(0, 50);
    expect(matches.length).toBe(50);

    const results = await Promise.all(
      matches.map((match, i) => {
        const aWins = i % 2 === 0;
        return updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(aWins ? 1 : 0, aWins ? 0 : 1, aWins ? 8 : 3, aWins ? 3 : 8, 1, 0)
        );
      })
    );

    expect(results.filter(r => r === true).length).toBe(50);

    // Every single completion must be in the stored document
    const after = readTournament(tournament.id);
    for (let i = 0; i < matches.length; i++) {
      const stored = findMatchInTournament(after, matches[i].id)!;
      const aWins = i % 2 === 0;
      expect(stored.status).toBe('COMPLETED');
      expect(stored.winner).toBe(aWins ? matches[i].participantA : matches[i].participantB);
      expect(stored.totalPointsA).toBe(aWins ? 8 : 3);
      expect(stored.totalPointsB).toBe(aWins ? 3 : 8);
    }

    console.log(`  📊 50 concurrent completions: ${mockStore.totalRetries} retries, ${mockStore.totalCommits} commits`);
  }, 60000);

  it('100 simultaneous match completions — zero lost updates', async () => {
    // 48 players in 8 groups of 6 → 15 matches per group = 120 playable
    const tournament = createMultiGroupTournament(48, 8, { tournamentId: 'stress-100' });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament).slice(0, 100);
    expect(matches.length).toBe(100);

    const results = await Promise.all(
      matches.map((match, i) => {
        const aWins = i % 3 !== 0;
        return updateMatchResult(
          tournament.id,
          match.id,
          createMatchResult(aWins ? 1 : 0, aWins ? 0 : 1, aWins ? 8 : 2, aWins ? 2 : 8, 2, 1)
        );
      })
    );

    expect(results.filter(r => r === true).length).toBe(100);

    const after = readTournament(tournament.id);
    let completedCount = 0;
    for (let i = 0; i < matches.length; i++) {
      const stored = findMatchInTournament(after, matches[i].id)!;
      const aWins = i % 3 !== 0;
      expect(stored.status).toBe('COMPLETED');
      expect(stored.winner).toBe(aWins ? matches[i].participantA : matches[i].participantB);
      completedCount++;
    }
    expect(completedCount).toBe(100);

    // Standings must reflect every completion (per group: wins == completed
    // matches in that group, since there are no ties in this dataset)
    for (const group of after.groupStage!.groups) {
      const groupMatches = (group.schedule || []).flatMap(r => r.matches);
      const decided = groupMatches.filter(
        m => (m.status === 'COMPLETED' || m.status === 'WALKOVER') && m.winner
      ).length;
      const totalWins = (group.standings || []).reduce((s, st) => s + st.matchesWon, 0);
      expect(totalWins).toBe(decided);
    }

    console.log(`  📊 100 concurrent completions: ${mockStore.totalRetries} retries, ${mockStore.totalCommits} commits`);
  }, 120000);

  it('mixed burst: 40 completions + 40 live round syncs at the same time', async () => {
    const tournament = createMultiGroupTournament(48, 8, { tournamentId: 'stress-mixed' });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament);
    const toComplete = matches.slice(0, 40);
    const toSync = matches.slice(40, 80);

    const operations: Promise<boolean>[] = [
      ...toComplete.map(match =>
        updateMatchResult(tournament.id, match.id, createMatchResult(1, 0, 8, 4, 1, 0))
      ),
      ...toSync.map((match, i) =>
        updateTournamentMatchRounds(
          tournament.id,
          match.id,
          'GROUP',
          undefined,
          progressRounds((i % 3) + 1),
          { gamesWonA: 0, gamesWonB: 0 }
        )
      )
    ];

    const results = await Promise.all(operations);
    expect(results.filter(r => r === true).length).toBe(80);

    const after = readTournament(tournament.id);

    // Completions all landed
    for (const match of toComplete) {
      const stored = findMatchInTournament(after, match.id)!;
      expect(stored.status).toBe('COMPLETED');
      expect(stored.winner).toBe(match.participantA);
    }

    // Live round syncs all landed (matches still in progress, rounds attached)
    for (let i = 0; i < toSync.length; i++) {
      const stored = findMatchInTournament(after, toSync[i].id)!;
      expect(stored.status).toBe('IN_PROGRESS');
      expect(stored.rounds?.length).toBe((i % 3) + 1);
    }

    console.log(`  📊 Mixed 80-op burst: ${mockStore.totalRetries} retries, ${mockStore.totalCommits} commits`);
  }, 120000);

  it('100 concurrent live round syncs (hottest path during play)', async () => {
    const tournament = createMultiGroupTournament(48, 8, { tournamentId: 'stress-sync' });
    seedTournament(tournament);

    const matches = getInProgressMatches(tournament).slice(0, 100);
    expect(matches.length).toBe(100);

    const results = await Promise.all(
      matches.map((match, i) =>
        updateTournamentMatchRounds(
          tournament.id,
          match.id,
          'GROUP',
          undefined,
          progressRounds((i % 4) + 1),
          { gamesWonA: 0, gamesWonB: 0 }
        )
      )
    );

    expect(results.filter(r => r === true).length).toBe(100);

    const after = readTournament(tournament.id);
    for (let i = 0; i < matches.length; i++) {
      const stored = findMatchInTournament(after, matches[i].id)!;
      expect(stored.rounds?.length).toBe((i % 4) + 1);
      expect(stored.totalPointsA).toBeDefined();
    }

    console.log(`  📊 100 concurrent round syncs: ${mockStore.totalRetries} retries`);
  }, 120000);

  it('document stays well under the 1MB Firestore limit at this scale', async () => {
    const tournament = createMultiGroupTournament(48, 8, { tournamentId: 'stress-size' });
    seedTournament(tournament);

    // Complete ALL 120 matches with full per-round data
    const matches = getInProgressMatches(tournament);
    for (const match of matches) {
      await updateMatchResult(
        tournament.id,
        match.id,
        createMatchResult(1, 0, 8, 4, 2, 1, progressRounds(4))
      );
    }

    const after = readTournament(tournament.id);
    const sizeBytes = JSON.stringify(after).length;
    // Firestore hard limit is 1,048,576 bytes — keep ample headroom
    expect(sizeBytes).toBeLessThan(900_000);

    console.log(`  📊 Doc size with 120 completed matches (full rounds): ${(sizeBytes / 1024).toFixed(0)} KB`);
  }, 120000);
});
