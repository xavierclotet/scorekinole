import { writable, get } from 'svelte/store';
import type { MatchHistory, CurrentMatch, HistoryTab } from '$lib/types/history';
import { browser } from '$app/environment';

// Current match in progress
export const currentMatch = writable<CurrentMatch | null>(null);

// Match history (completed matches)
export const matchHistory = writable<MatchHistory[]>([]);

// Deleted matches (soft delete)
export const deletedMatches = writable<MatchHistory[]>([]);

// Active tab in history modal
export const activeHistoryTab = writable<HistoryTab>('current');

// Load history from localStorage
export function loadHistory() {
    if (!browser) return;

    try {
        const savedHistory = localStorage.getItem('crokinoleMatchHistory');
        if (savedHistory) {
            const parsed = JSON.parse(savedHistory);
            matchHistory.set(parsed);
        }

        const savedDeleted = localStorage.getItem('crokinoleDeletedMatches');
        if (savedDeleted) {
            const parsed = JSON.parse(savedDeleted);
            deletedMatches.set(parsed);
        }

        const savedCurrent = localStorage.getItem('crokinoleCurrentMatch');
        if (savedCurrent) {
            const parsed = JSON.parse(savedCurrent);
            currentMatch.set(parsed);
        }
    } catch (e) {
        console.error('Error loading history:', e);
    }
}

// Save history to localStorage
export function saveHistory() {
    if (!browser) return;

    matchHistory.subscribe(history => {
        localStorage.setItem('crokinoleMatchHistory', JSON.stringify(history));
    })();
}

export function saveDeletedMatches() {
    if (!browser) return;

    deletedMatches.subscribe(deleted => {
        localStorage.setItem('crokinoleDeletedMatches', JSON.stringify(deleted));
    })();
}

export function saveCurrentMatch() {
    if (!browser) return;

    currentMatch.subscribe(current => {
        if (current) {
            localStorage.setItem('crokinoleCurrentMatch', JSON.stringify(current));
        } else {
            localStorage.removeItem('crokinoleCurrentMatch');
        }
    })();
}

// Add match to history
export function addMatchToHistory(match: MatchHistory) {
    matchHistory.update(history => {
        const updated = [match, ...history];
        // Keep only last 50 matches
        const limited = updated.slice(0, 50);
        localStorage.setItem('crokinoleMatchHistory', JSON.stringify(limited));
        return limited;
    });
}

// Move match to deleted
export function deleteMatch(matchId: string) {
    let deletedMatch: MatchHistory | null = null;

    matchHistory.update(history => {
        const match = history.find(m => m.id === matchId);
        if (match) {
            deletedMatch = match;
        }
        const filtered = history.filter(m => m.id !== matchId);
        localStorage.setItem('crokinoleMatchHistory', JSON.stringify(filtered));
        return filtered;
    });

    if (deletedMatch) {
        deletedMatches.update(deleted => {
            const updated = [deletedMatch!, ...deleted];
            localStorage.setItem('crokinoleDeletedMatches', JSON.stringify(updated));
            return updated;
        });
    }
}

// Restore match from deleted
export function restoreMatch(matchId: string) {
    let restoredMatch: MatchHistory | null = null;

    deletedMatches.update(deleted => {
        const match = deleted.find(m => m.id === matchId);
        if (match) {
            restoredMatch = match;
        }
        const filtered = deleted.filter(m => m.id !== matchId);
        localStorage.setItem('crokinoleDeletedMatches', JSON.stringify(filtered));
        return filtered;
    });

    if (restoredMatch) {
        matchHistory.update(history => {
            const updated = [restoredMatch!, ...history];
            localStorage.setItem('crokinoleMatchHistory', JSON.stringify(updated));
            return updated;
        });
    }
}

// Permanently delete match
export function permanentlyDeleteMatch(matchId: string) {
    deletedMatches.update(deleted => {
        const filtered = deleted.filter(m => m.id !== matchId);
        localStorage.setItem('crokinoleDeletedMatches', JSON.stringify(filtered));
        return filtered;
    });
}

// Clear all history
export function clearHistory() {
    matchHistory.set([]);
    localStorage.removeItem('crokinoleMatchHistory');
}

// Clear all deleted matches
export function clearDeletedMatches() {
    deletedMatches.set([]);
    localStorage.removeItem('crokinoleDeletedMatches');
}

// Start a new current match
export function startCurrentMatch() {
    const match: CurrentMatch = {
        startTime: Date.now(),
        games: [],
        rounds: []
    };
    currentMatch.set(match);
    saveCurrentMatch();
}

// Reset/clear the current match
export function resetCurrentMatch() {
    currentMatch.set(null);
    saveCurrentMatch();
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
    saveCurrentMatch();
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
    saveCurrentMatch();
}

// Update a round in the current match
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
    saveCurrentMatch();
}

// Complete the current match and save to history
export function completeCurrentMatch(matchData: Omit<MatchHistory, 'id' | 'startTime' | 'endTime' | 'duration'>) {
    const current = get(currentMatch);

    // If no current match exists, create one with current timestamp
    const startTime = current ? current.startTime : Date.now();
    const endTime = Date.now();
    const duration = endTime - startTime;

    const completedMatch: MatchHistory = {
        ...matchData,
        id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        startTime,
        endTime,
        duration
    };

    addMatchToHistory(completedMatch);
    currentMatch.set(null);
    saveCurrentMatch();
}
