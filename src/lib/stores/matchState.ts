import { writable, get } from 'svelte/store';
import type { MatchState, GameData, RoundData } from '$lib/types/team';
import { browser } from '$app/environment';
import { currentMatch, saveCurrentMatch, resetCurrentMatch } from './history';
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
    currentGameRounds: [],
    roundsPlayed: 0
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

            // Migrate from old separate roundsPlayed if needed
            const savedRounds = localStorage.getItem('crokinoleRoundsPlayed');
            if (savedRounds && state.roundsPlayed === undefined) {
                state.roundsPlayed = parseInt(savedRounds, 10);
                // Clean up old key
                localStorage.removeItem('crokinoleRoundsPlayed');
                matchState.set(state);
            }

            roundsPlayed.set(state.roundsPlayed ?? 0);
        } catch (e) {
            console.error('Error loading match state:', e);
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
    resetCurrentMatch(); // Clear current match from history
    saveMatchState();
}

// Reset only the current game (keep match history)
export function resetGameOnly() {
    currentGameRounds.set([]);
    currentMatchRounds.set([]); // Also clear match rounds for new game
    roundsPlayed.set(0);
    lastRoundPoints.set({ team1: 0, team2: 0 });
    matchState.update(state => ({
        ...state,
        currentGameRounds: [],
        currentMatchRounds: [], // Also clear match rounds for new game
        roundsPlayed: 0
    }));
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

// Update the current game start hammer (for multi-game matches)
export function setCurrentGameStartHammer(hammerTeam: number) {
    currentGameStartHammer.set(hammerTeam);
    matchState.update(state => ({
        ...state,
        currentGameStartHammer: hammerTeam
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
export function completeRound(team1Points: number, team2Points: number, team1Twenty: number, team2Twenty: number, hammerTeam: 1 | 2 | null = null) {
    // Increment global round counter
    roundsPlayed.update(n => n + 1);
    const currentRoundNumber = get(roundsPlayed);

    // Update matchState with new roundsPlayed
    matchState.update(state => ({
        ...state,
        roundsPlayed: currentRoundNumber
    }));

    const round: RoundData = {
        roundNumber: currentRoundNumber,
        team1Points,
        team2Points,
        team1Twenty,
        team2Twenty,
        hammerTeam,
        timestamp: Date.now()
    };

    addRound(round);

    // Update lastRoundPoints by adding the round points to the previous total
    const previousPoints = get(lastRoundPoints);
    lastRoundPoints.set({
        team1: previousPoints.team1 + team1Points,
        team2: previousPoints.team2 + team2Points
    });

    // Also update currentMatch rounds for the history modal
    updateCurrentMatchRounds(team1Points, team2Points, team1Twenty, team2Twenty, hammerTeam, currentRoundNumber);
}

// Update currentMatch with new round data
function updateCurrentMatchRounds(team1Points: number, team2Points: number, team1Twenty: number, team2Twenty: number, hammerTeam: 1 | 2 | null, roundNumber: number) {
    if (!browser) return;

    currentMatch.update(match => {
        // If no match exists, create one
        if (!match) {
            return {
                startTime: Date.now(),
                games: [],
                rounds: [{
                    team1Points,
                    team2Points,
                    team1Twenty,
                    team2Twenty,
                    hammerTeam,
                    roundNumber
                }]
            };
        }

        const newRound: MatchRound = {
            team1Points,
            team2Points,
            team1Twenty,
            team2Twenty,
            hammerTeam,
            roundNumber
        };

        return {
            ...match,
            rounds: [...match.rounds, newRound]
        };
    });

    saveCurrentMatch();
}
