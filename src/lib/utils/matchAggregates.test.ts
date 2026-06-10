/**
 * Unit tests for matchAggregates.ts — recomputation of the denormalized
 * fields of a friendly match (/matches) from its games[].rounds detail.
 *
 * These aggregates feed the /admin/matches list (winner crown, scores,
 * games-won count) and player stats, so an editor that changes rounds
 * without recomputing them corrupts what every reader displays.
 */

import { describe, it, expect } from 'vitest';
import { toCount, sanitizeRound, recomputeMatchAggregates } from './matchAggregates';
import type { MatchGame, MatchRound } from '$lib/types/history';

function round(t1: number, t2: number, overrides: Partial<MatchRound> = {}): MatchRound {
  return {
    team1Points: t1,
    team2Points: t2,
    team1Twenty: 0,
    team2Twenty: 0,
    hammerTeam: null,
    roundNumber: 1,
    ...overrides
  };
}

function game(rounds: MatchRound[], overrides: Partial<MatchGame> = {}): MatchGame {
  return {
    team1Points: 0,
    team2Points: 0,
    gameNumber: 1,
    rounds,
    winner: null,
    ...overrides
  };
}

describe('toCount', () => {
  it('passes through non-negative integers', () => {
    expect(toCount(0)).toBe(0);
    expect(toCount(2)).toBe(2);
    expect(toCount(12)).toBe(12);
  });

  it('coerces the junk a number input can produce', () => {
    expect(toCount(null)).toBe(0); // cleared input
    expect(toCount(undefined)).toBe(0); // missing field
    expect(toCount('')).toBe(0);
    expect(toCount('3')).toBe(3); // string from raw data
    expect(toCount('abc')).toBe(0);
    expect(toCount(NaN)).toBe(0);
    expect(toCount(Infinity)).toBe(0);
    expect(toCount(-5)).toBe(0); // negatives clamped
    expect(toCount(1.6)).toBe(2); // decimals rounded
  });
});

describe('sanitizeRound', () => {
  it('sanitizes all four count fields and preserves the rest', () => {
    const dirty = round(null as unknown as number, -1, {
      team1Twenty: '' as unknown as number,
      team2Twenty: 3.4,
      hammerTeam: 2,
      roundNumber: 7
    });

    const clean = sanitizeRound(dirty);
    expect(clean).toEqual({
      team1Points: 0,
      team2Points: 0,
      team1Twenty: 0,
      team2Twenty: 3,
      hammerTeam: 2,
      roundNumber: 7
    });
  });
});

describe('recomputeMatchAggregates — single game', () => {
  it('recomputes game totals and winner from rounds', () => {
    const result = recomputeMatchAggregates([
      game([round(2, 0), round(0, 2), round(2, 0)], { team1Points: 99, team2Points: 99, winner: 2 })
    ]);

    expect(result.games[0].team1Points).toBe(4);
    expect(result.games[0].team2Points).toBe(2);
    expect(result.games[0].winner).toBe(1); // stale stored winner corrected
    expect(result.team1Score).toBe(4);
    expect(result.team2Score).toBe(2);
    expect(result.winner).toBe(1);
    expect(result.totalRounds).toBe(3);
  });

  it('a tied game has null winner → match winner null', () => {
    const result = recomputeMatchAggregates([game([round(2, 0), round(0, 2)])]);
    expect(result.games[0].winner).toBeNull();
    expect(result.winner).toBeNull();
  });

  it('sanitizes dirty round values before summing', () => {
    const result = recomputeMatchAggregates([
      game([
        round(null as unknown as number, 2),
        round('' as unknown as number, -3 as number),
        round(2, undefined as unknown as number)
      ])
    ]);

    expect(result.games[0].team1Points).toBe(2);
    expect(result.games[0].team2Points).toBe(2);
    expect(result.winner).toBeNull();
  });
});

describe('recomputeMatchAggregates — multi-game (Bo-N)', () => {
  it('match winner is the team with more games won, scores are total points', () => {
    const result = recomputeMatchAggregates([
      game([round(2, 0), round(2, 0)], { gameNumber: 1 }), // 4-0 → team 1
      game([round(0, 2), round(0, 2)], { gameNumber: 2 }), // 0-4 → team 2
      game([round(2, 0), round(2, 1)], { gameNumber: 3 }) // 4-1 → team 1
    ]);

    expect(result.games.map((g) => g.winner)).toEqual([1, 2, 1]);
    expect(result.winner).toBe(1); // 2 games vs 1
    expect(result.team1Score).toBe(8);
    expect(result.team2Score).toBe(5);
    expect(result.totalRounds).toBe(6);
  });

  it('equal games won → match winner null even with unequal points', () => {
    const result = recomputeMatchAggregates([
      game([round(2, 0)], { gameNumber: 1 }), // team 1
      game([round(0, 2), round(1, 2)], { gameNumber: 2 }) // team 2
    ]);

    expect(result.winner).toBeNull();
    expect(result.team1Score).toBe(3);
    expect(result.team2Score).toBe(4);
  });
});

describe('recomputeMatchAggregates — imported matches without round detail', () => {
  it('a game with empty rounds keeps its stored totals and winner', () => {
    const result = recomputeMatchAggregates([
      game([], { team1Points: 7, team2Points: 5, winner: 1 })
    ]);

    expect(result.games[0].team1Points).toBe(7);
    expect(result.games[0].team2Points).toBe(5);
    expect(result.games[0].winner).toBe(1);
    expect(result.team1Score).toBe(7);
    expect(result.team2Score).toBe(5);
    expect(result.winner).toBe(1);
    // No round detail → callers must NOT overwrite the stored totalRounds
    expect(result.totalRounds).toBe(0);
  });

  it('a game with undefined rounds is treated like empty rounds', () => {
    const legacyGame = { team1Points: 3, team2Points: 6, gameNumber: 1, winner: 2 } as MatchGame;
    const result = recomputeMatchAggregates([legacyGame]);

    expect(result.games[0].winner).toBe(2);
    expect(result.games[0].rounds).toEqual([]);
    expect(result.team1Score).toBe(3);
    expect(result.team2Score).toBe(6);
    expect(result.winner).toBe(2);
  });

  it('mixes detailed and detail-less games correctly', () => {
    const result = recomputeMatchAggregates([
      game([], { team1Points: 5, team2Points: 2, winner: 1, gameNumber: 1 }), // imported
      game([round(0, 2), round(0, 2)], { gameNumber: 2 }) // detailed → team 2
    ]);

    expect(result.games.map((g) => g.winner)).toEqual([1, 2]);
    expect(result.winner).toBeNull(); // 1-1 in games
    expect(result.team1Score).toBe(5);
    expect(result.team2Score).toBe(6);
    expect(result.totalRounds).toBe(2);
  });
});

describe('recomputeMatchAggregates — edge cases', () => {
  it('empty games array → zeroed aggregates (callers must guard)', () => {
    const result = recomputeMatchAggregates([]);
    expect(result.games).toEqual([]);
    expect(result.team1Score).toBe(0);
    expect(result.team2Score).toBe(0);
    expect(result.winner).toBeNull();
    expect(result.totalRounds).toBe(0);
  });

  it('does not mutate the input', () => {
    const input = [game([round(2, 0)], { team1Points: 99, winner: 2 })];
    const snapshot = structuredClone(input);

    recomputeMatchAggregates(input);
    expect(input).toEqual(snapshot);
  });

  it('preserves non-count round fields (hammer, roundNumber) and game fields', () => {
    const result = recomputeMatchAggregates([
      game([round(2, 0, { hammerTeam: 1, roundNumber: 4, team1Twenty: 3, team2Twenty: 1 })], {
        gameNumber: 9
      })
    ]);

    expect(result.games[0].gameNumber).toBe(9);
    expect(result.games[0].rounds[0]).toMatchObject({
      hammerTeam: 1,
      roundNumber: 4,
      team1Twenty: 3,
      team2Twenty: 1
    });
  });
});
