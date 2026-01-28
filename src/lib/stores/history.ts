import { writable, get } from 'svelte/store';
import type { MatchHistory, CurrentMatch, HistoryTab } from '$lib/types/history';
import { browser } from '$app/environment';

// Current match in progress
export const currentMatch = writable<CurrentMatch | null>(null);

// Match history (completed matches)
export const matchHistory = writable<MatchHistory[]>([]);

// Active tab in history modal
export const activeHistoryTab = writable<HistoryTab>('current');

// Load history from localStorage
export function loadHistory() {
    if (!browser) return;

    try {
        const savedHistory = localStorage.getItem('crokinoleMatchHistory');
        if (savedHistory) {
            const parsed = JSON.parse(savedHistory);
            // Remove duplicates by ID (in case localStorage is corrupted)
            const deduped = deduplicateMatches(parsed);
            matchHistory.set(deduped);
            // Save cleaned data back
            if (deduped.length !== parsed.length) {
                console.log(`🧹 Cleaned ${parsed.length - deduped.length} duplicate matches from history`);
                localStorage.setItem('crokinoleMatchHistory', JSON.stringify(deduped));
            }
        }

        // Clean up old deleted matches key if exists
        localStorage.removeItem('crokinoleDeletedMatches');

        const savedCurrent = localStorage.getItem('crokinoleCurrentMatch');
        if (savedCurrent) {
            const parsed = JSON.parse(savedCurrent);
            currentMatch.set(parsed);
        }
    } catch (e) {
        console.error('Error loading history:', e);
    }
}

// Helper function to remove duplicate matches by ID
function deduplicateMatches(matches: MatchHistory[]): MatchHistory[] {
    // Ensure matches is an array (localStorage may be corrupted or stored as object)
    if (!matches || !Array.isArray(matches)) {
        // If it's an object, try to convert to array
        if (matches && typeof matches === 'object') {
            matches = Object.values(matches);
        } else {
            return [];
        }
    }

    const seen = new Map<string, MatchHistory>();

    matches.forEach(match => {
        if (match && match.id && !seen.has(match.id)) {
            seen.set(match.id, match);
        }
    });

    return Array.from(seen.values());
}

// Save history to localStorage
export function saveHistory() {
    if (!browser) return;

    matchHistory.subscribe(history => {
        localStorage.setItem('crokinoleMatchHistory', JSON.stringify(history));
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
        // Ensure history is an array (in case it's null or undefined)
        const currentHistory = Array.isArray(history) ? history : [];
        const updated = [match, ...currentHistory];
        // Keep only last 50 matches
        const limited = updated.slice(0, 50);
        localStorage.setItem('crokinoleMatchHistory', JSON.stringify(limited));
        return limited;
    });
}

// Permanently delete match from history
export function permanentlyDeleteMatch(matchId: string) {
    matchHistory.update(history => {
        const filtered = history.filter(m => m.id !== matchId);
        localStorage.setItem('crokinoleMatchHistory', JSON.stringify(filtered));
        return filtered;
    });
}

// Clear all history
export function clearHistory() {
    matchHistory.set([]);
    localStorage.removeItem('crokinoleMatchHistory');
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
        id: `match_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        startTime,
        endTime,
        duration
    };

    addMatchToHistory(completedMatch);

    currentMatch.set(null);
    saveCurrentMatch();

    // Switch to history tab automatically
    activeHistoryTab.set('history');
}
