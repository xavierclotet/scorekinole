import { writable, get } from 'svelte/store';
import type { MatchHistory, CurrentMatch, MatchRound } from '$lib/types/history';

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
