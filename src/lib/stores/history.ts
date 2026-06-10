import { writable, get } from 'svelte/store';
import type { MatchHistory, CurrentMatch, MatchRound, MatchGame } from '$lib/types/history';

// Current match in progress (in-memory only, no localStorage)
export const currentMatch = writable<CurrentMatch | null>(null);

// Start a new current match
export function startCurrentMatch() {
    const match: CurrentMatch = {
        startTime: Date.now(),
        games: [],
        rounds: []
    };
    currentMatch.set(match);
}

// Reset/clear the current match
export function resetCurrentMatch() {
    currentMatch.set(null);
}

/**
 * Restore the current match after a page reload.
 * currentMatch itself is in-memory only; loadMatchState() rebuilds it from the
 * persisted matchState so RoundsPanel / the history modal survive an F5.
 */
export function restoreCurrentMatch(match: CurrentMatch) {
    currentMatch.set(match);
}

// Add a completed game to current match and clear rounds for next game
export function addGameToCurrentMatch(game: any) {
    currentMatch.update(match => {
        if (!match) {
            // If no match exists, create one
            return {
                startTime: Date.now(),
                games: [game],
                rounds: []
            };
        }

        return {
            ...match,
            games: [...match.games, game],
            rounds: [] // Clear rounds for next game
        };
    });
}

// Add a round to current match
export function addRoundToCurrentMatch(round: MatchRound) {
    currentMatch.update(match => {
        if (!match) {
            return {
                startTime: Date.now(),
                games: [],
                rounds: [round]
            };
        }

        return {
            ...match,
            rounds: [...match.rounds, round]
        };
    });
}

// Remove the last round from current match (used by undo-last-round flow)
export function removeLastRoundFromCurrentMatch() {
    currentMatch.update(match => {
        if (!match || match.rounds.length === 0) return match;
        return {
            ...match,
            rounds: match.rounds.slice(0, -1)
        };
    });
}

// Clear rounds from current match (when starting a new game)
export function clearCurrentMatchRounds() {
    currentMatch.update(match => {
        if (!match) return match;
        return {
            ...match,
            rounds: []
        };
    });
}

// Update a round in the current match (for 20s editing)
export function updateCurrentMatchRound(roundIndex: number, updates: Partial<{ team1Points: number; team2Points: number; team1Twenty: number; team2Twenty: number }>) {
    currentMatch.update(match => {
        if (!match || !match.rounds[roundIndex]) return match;

        const updatedRounds = [...match.rounds];
        updatedRounds[roundIndex] = {
            ...updatedRounds[roundIndex],
            ...updates
        };

        return {
            ...match,
            rounds: updatedRounds
        };
    });
}

/**
 * Total rounds played across ALL games of a match.
 *
 * `roundsPlayed` (matchState) resets on every game of a multi-game match, so
 * using it for the saved match's totalRounds only counted the LAST game's
 * rounds in Bo-N matches. Each completed game keeps its own rounds array.
 */
export function countTotalRounds(games: MatchGame[]): number {
    return games.reduce((sum, game) => sum + (game.rounds?.length || 0), 0);
}

/**
 * Mirror team1/team2 fields in the in-progress match when the teams swap
 * sides (switchSides). Keeps RoundsPanel and the tournament progress sync
 * (which reads currentMatch.games[].rounds) consistent with the swapped
 * team stores.
 */
export function swapTeamsInCurrentMatch() {
    const swapRound = (r: MatchRound): MatchRound => ({
        ...r,
        team1Points: r.team2Points,
        team2Points: r.team1Points,
        team1Twenty: r.team2Twenty,
        team2Twenty: r.team1Twenty,
        hammerTeam: r.hammerTeam === 1 ? 2 : r.hammerTeam === 2 ? 1 : null
    });

    currentMatch.update(match => {
        if (!match) return match;
        return {
            ...match,
            rounds: match.rounds.map(swapRound),
            games: match.games.map(game => ({
                ...game,
                winner: game.winner === 1 ? 2 : game.winner === 2 ? 1 : game.winner,
                team1Points: game.team2Points,
                team2Points: game.team1Points,
                rounds: (game.rounds || []).map(swapRound)
            }))
        };
    });
}

/**
 * Build completed match data (does not save anywhere)
 * Returns the MatchHistory object for the caller to handle
 */
export function buildCompletedMatch(matchData: Omit<MatchHistory, 'id' | 'startTime' | 'endTime' | 'duration'>): MatchHistory {
    const current = get(currentMatch);
    const startTime = current ? current.startTime : Date.now();
    const endTime = Date.now();

    const completedMatch: MatchHistory = {
        ...matchData,
        id: `match_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        startTime,
        endTime,
        duration: endTime - startTime
    };

    // Clear current match
    currentMatch.set(null);

    return completedMatch;
}
