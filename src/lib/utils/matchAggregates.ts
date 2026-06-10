/**
 * Recompute the denormalized aggregate fields of a friendly match
 * (/matches collection) from its games[].rounds detail.
 *
 * MatchHistory stores several fields that DERIVE from the rounds:
 *   - games[].team1Points / team2Points  (sum of the game's round points)
 *   - games[].winner                     (by game points)
 *   - team1Score / team2Score            (sum of game points across games)
 *   - winner                             (team with more games won, null on tie)
 *   - totalRounds                        (rounds across all games)
 *
 * The semantics mirror TeamCard.saveMatchToHistory / buildCompletedMatch.
 * Any editor that mutates round values (e.g. MatchEditModal in /admin/matches)
 * MUST write these recomputed fields together with `games`, otherwise the
 * stored aggregates silently desynchronize from the round detail.
 *
 * Imported matches may have games WITHOUT round detail (empty rounds[]);
 * those games keep their stored totals and winner untouched.
 */

import type { MatchGame, MatchRound } from '$lib/types/history';

/**
 * Coerce a round cell to a non-negative integer. Number inputs bound with
 * bind:value can yield null/''/undefined when cleared, and nothing stops a
 * keyboard user from typing negatives or decimals.
 */
export function toCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function sanitizeRound(round: MatchRound): MatchRound {
  return {
    ...round,
    team1Points: toCount(round.team1Points),
    team2Points: toCount(round.team2Points),
    team1Twenty: toCount(round.team1Twenty),
    team2Twenty: toCount(round.team2Twenty)
  };
}

export interface MatchAggregates {
  games: MatchGame[];
  team1Score: number;
  team2Score: number;
  winner: 1 | 2 | null;
  /** 0 when no game has round detail — callers should skip the update then */
  totalRounds: number;
}

export function recomputeMatchAggregates(games: MatchGame[]): MatchAggregates {
  const recomputedGames: MatchGame[] = games.map((game) => {
    const rounds = (game.rounds || []).map(sanitizeRound);

    // No round detail (imported match): keep stored totals and winner
    if (rounds.length === 0) {
      return { ...game, rounds: game.rounds || [] };
    }

    const team1Points = rounds.reduce((sum, r) => sum + r.team1Points, 0);
    const team2Points = rounds.reduce((sum, r) => sum + r.team2Points, 0);

    return {
      ...game,
      rounds,
      team1Points,
      team2Points,
      winner: team1Points > team2Points ? 1 : team2Points > team1Points ? 2 : null
    };
  });

  const team1Score = recomputedGames.reduce((sum, g) => sum + toCount(g.team1Points), 0);
  const team2Score = recomputedGames.reduce((sum, g) => sum + toCount(g.team2Points), 0);

  const team1GamesWon = recomputedGames.filter((g) => g.winner === 1).length;
  const team2GamesWon = recomputedGames.filter((g) => g.winner === 2).length;
  const winner = team1GamesWon > team2GamesWon ? 1 : team2GamesWon > team1GamesWon ? 2 : null;

  const totalRounds = recomputedGames.reduce((sum, g) => sum + (g.rounds?.length || 0), 0);

  return { games: recomputedGames, team1Score, team2Score, winner, totalRounds };
}
