import { writable, get } from 'svelte/store';
import type { MatchState, GameData, RoundData } from '$lib/types/team';
import { browser } from '$app/environment';
import { currentMatch, saveCurrentMatch } from './history';
import type { MatchRound } from '$lib/types/history';

const defaultMatchState: MatchState = {
    matchStartedBy: null,
    lastGameHammerTeam: null,
    currentGameStartHammer: null,
    currentTwentyTeam: 0,
    twentyDialogPending: false,
    matchStartTime: null,
    currentMatchGames: [],
    currentMatchRounds: [],
    currentGameRounds: []
};

// Track last round points for round completion detection
export const lastRoundPoints = writable<{ team1: number; team2: number }>({ team1: 0, team2: 0 });

// Global round counter (shared by both teams)
export const roundsPlayed = writable<number>(0);

// Main match state store
export const matchState = writable<MatchState>(defaultMatchState);

// Individual stores for frequently accessed values
export const matchStartedBy = writable<string | null>(null);
export const lastGameHammerTeam = writable<number | null>(null);
export const currentGameStartHammer = writable<number | null>(null);
export const currentTwentyTeam = writable<number>(0);
export const twentyDialogPending = writable<boolean>(false);
export const matchStartTime = writable<number | null>(null);
export const currentMatchGames = writable<GameData[]>([]);
export const currentMatchRounds = writable<RoundData[]>([]);
export const currentGameRounds = writable<RoundData[]>([]);

// Load match state from localStorage
export function loadMatchState() {
    if (!browser) return;

    const saved = localStorage.getItem('crokinoleMatchState');
    if (saved) {
        try {
            const state: MatchState = JSON.parse(saved);
            matchState.set(state);

            // Update individual stores with fallback to defaults
            matchStartedBy.set(state.matchStartedBy ?? null);
            lastGameHammerTeam.set(state.lastGameHammerTeam ?? null);
            currentGameStartHammer.set(state.currentGameStartHammer ?? null);
            currentTwentyTeam.set(state.currentTwentyTeam ?? 0);
            twentyDialogPending.set(state.twentyDialogPending ?? false);
            matchStartTime.set(state.matchStartTime ?? null);
            currentMatchGames.set(state.currentMatchGames ?? []);
            currentMatchRounds.set(state.currentMatchRounds ?? []);
            currentGameRounds.set(state.currentGameRounds ?? []);
        } catch (e) {
            console.error('Error loading match state:', e);
        }
    }

    // Load roundsPlayed separately
    const savedRounds = localStorage.getItem('crokinoleRoundsPlayed');
    if (savedRounds) {
        try {
            roundsPlayed.set(parseInt(savedRounds, 10));
        } catch (e) {
            console.error('Error loading rounds played:', e);
        }
    }
}

// Save match state to localStorage
export function saveMatchState() {
    if (!browser) return;

    matchState.subscribe(state => {
        localStorage.setItem('crokinoleMatchState', JSON.stringify(state));
    })();
}

// Reset match state to defaults
export function resetMatchState() {
    matchState.set(defaultMatchState);
    matchStartedBy.set(null);
    lastGameHammerTeam.set(null);
    currentGameStartHammer.set(null);
    currentTwentyTeam.set(0);
    twentyDialogPending.set(false);
    matchStartTime.set(null);
    currentMatchGames.set([]);
    currentMatchRounds.set([]);
    currentGameRounds.set([]);
    roundsPlayed.set(0);
    lastRoundPoints.set({ team1: 0, team2: 0 });
    saveMatchState();
}

// Add a new game to the match
export function addGame(game: GameData) {
    currentMatchGames.update(games => [...games, game]);
    matchState.update(state => ({
        ...state,
        currentMatchGames: [...state.currentMatchGames, game]
    }));
    saveMatchState();
}

// Add a new round to current game
export function addRound(round: RoundData) {
    currentGameRounds.update(rounds => [...rounds, round]);
    currentMatchRounds.update(rounds => [...rounds, round]);
    matchState.update(state => ({
        ...state,
        currentGameRounds: [...state.currentGameRounds, round],
        currentMatchRounds: [...state.currentMatchRounds, round]
    }));
    saveMatchState();
}

// Start a new match
export function startMatch(startedBy: string, hammerTeam: number) {
    matchStartedBy.set(startedBy);
    currentGameStartHammer.set(hammerTeam);
    matchStartTime.set(Date.now());

    matchState.update(state => ({
        ...state,
        matchStartedBy: startedBy,
        currentGameStartHammer: hammerTeam,
        matchStartTime: Date.now()
    }));

    saveMatchState();
}

// Set the current 20s team
export function setTwentyTeam(teamNumber: number) {
    currentTwentyTeam.set(teamNumber);
    matchState.update(state => ({
        ...state,
        currentTwentyTeam: teamNumber
    }));
    saveMatchState();
}

// Set whether the twenty dialog is pending
export function setTwentyDialogPending(pending: boolean) {
    twentyDialogPending.set(pending);
    matchState.update(state => ({
        ...state,
        twentyDialogPending: pending
    }));
    saveMatchState();
}

// Complete a round (when 2 point difference detected)
export function completeRound(team1Points: number, team2Points: number, team1Twenty: number, team2Twenty: number) {
    // Increment global round counter
    roundsPlayed.update(n => {
        const newValue = n + 1;
        // Save to localStorage
        if (browser) {
            localStorage.setItem('crokinoleRoundsPlayed', newValue.toString());
        }
        return newValue;
    });

    const currentRoundNumber = get(roundsPlayed);

    const round: RoundData = {
        roundNumber: currentRoundNumber,
        team1Points,
        team2Points,
        team1Twenty,
        team2Twenty,
        timestamp: Date.now()
    };

    addRound(round);
    lastRoundPoints.set({ team1: team1Points, team2: team2Points });

    // Also update currentMatch rounds for the history modal
    updateCurrentMatchRounds(team1Points, team2Points, currentRoundNumber);
}

// Update currentMatch with new round data
function updateCurrentMatchRounds(team1Points: number, team2Points: number, roundNumber: number) {
    if (!browser) return;

    currentMatch.update(match => {
        if (!match) return match;

        const newRound: MatchRound = {
            team1Points,
            team2Points,
            roundNumber
        };

        return {
            ...match,
            rounds: [...match.rounds, newRound]
        };
    });

    saveCurrentMatch();
}
