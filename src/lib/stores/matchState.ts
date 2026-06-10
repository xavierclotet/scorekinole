import { writable, get } from 'svelte/store';
import type { MatchState, GameData, RoundData } from '$lib/types/team';
import { browser } from '$app/environment';
import { resetCurrentMatch, addRoundToCurrentMatch, removeLastRoundFromCurrentMatch, swapTeamsInCurrentMatch, restoreCurrentMatch } from './history';
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
            const parsed = JSON.parse(saved);

            // Defensive merge with defaults to handle version migrations
            // (new fields added in later versions get their default values)
            const state: MatchState = { ...defaultMatchState, ...parsed };

            // Ensure arrays are actually arrays (guard against corrupted data)
            if (!Array.isArray(state.currentMatchGames)) state.currentMatchGames = [];
            if (!Array.isArray(state.currentMatchRounds)) state.currentMatchRounds = [];
            if (!Array.isArray(state.currentGameRounds)) state.currentGameRounds = [];

            matchState.set(state);

            // Update individual stores with fallback to defaults
            matchStartedBy.set(state.matchStartedBy ?? null);
            lastGameHammerTeam.set(state.lastGameHammerTeam ?? null);
            currentGameStartHammer.set(state.currentGameStartHammer ?? null);
            currentTwentyTeam.set(state.currentTwentyTeam ?? 0);
            twentyDialogPending.set(state.twentyDialogPending ?? false);
            matchStartTime.set(state.matchStartTime ?? null);
            currentMatchGames.set(state.currentMatchGames);
            currentMatchRounds.set(state.currentMatchRounds);
            currentGameRounds.set(state.currentGameRounds);

            // Migrate from old separate roundsPlayed if needed
            const savedRounds = localStorage.getItem('crokinoleRoundsPlayed');
            if (savedRounds && state.roundsPlayed === undefined) {
                state.roundsPlayed = parseInt(savedRounds, 10);
                // Clean up old key
                localStorage.removeItem('crokinoleRoundsPlayed');
                matchState.set(state);
            }

            roundsPlayed.set(state.roundsPlayed ?? 0);

            // Rebuild the lastRoundPoints baseline from the restored rounds.
            // lastRoundPoints is not persisted; without this, a reload mid-game
            // leaves the baseline at 0-0 while team points keep their restored
            // values, so checkRoundCompletion (totalChange === 2) could never
            // fire again and no further round would ever complete.
            const baseline = state.currentGameRounds.reduce(
                (acc, r) => ({
                    team1: acc.team1 + (r.team1Points || 0),
                    team2: acc.team2 + (r.team2Points || 0)
                }),
                { team1: 0, team2: 0 }
            );
            lastRoundPoints.set(baseline);

            // Rebuild the in-memory currentMatch (history store). RoundsPanel and
            // the history modal read from it, but it was never restored after a
            // reload — the rounds were persisted right here in matchState, yet the
            // panel went blank on F5 (and saveGameAndCheckMatchComplete saw an
            // empty match). Must run BEFORE the game page's onMount fallback
            // `if (!$currentMatch) startCurrentMatch()` so it isn't replaced by
            // a fresh empty match.
            const toMatchRound = (r: RoundData): MatchRound => ({
                team1Points: r.team1Points,
                team2Points: r.team2Points,
                team1Twenty: r.team1Twenty,
                team2Twenty: r.team2Twenty,
                hammerTeam: r.hammerTeam ?? null,
                roundNumber: r.roundNumber
            });

            if (state.currentGameRounds.length > 0 || state.currentMatchGames.length > 0) {
                restoreCurrentMatch({
                    startTime: state.matchStartTime ?? Date.now(),
                    games: state.currentMatchGames.map((g, i) => ({
                        gameNumber: g.gameNumber || i + 1,
                        winner: g.winner === 1 || g.winner === 2 ? g.winner : null,
                        team1Points: g.team1Points,
                        team2Points: g.team2Points,
                        rounds: (g.rounds ?? []).map(toMatchRound)
                    })),
                    rounds: state.currentGameRounds.map(toMatchRound)
                });
            }
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

/**
 * Undo the last completed round of the current game.
 *
 * Atomic local revert: pops the last round from currentGameRounds /
 * currentMatchRounds / matchState / currentMatch.rounds, decrements
 * roundsPlayed, and subtracts that round's points from lastRoundPoints.
 *
 * Returns the popped round so the caller can revert team-level state
 * (accumulated points, rounds-won counter, hammer rotation). Returns
 * null when there is no round to undo.
 *
 * NOTE: this only handles local store state. Tournament-mode callers must
 * additionally sync the revert to Firestore via runTransaction.
 */
export function undoLastRound(): RoundData | null {
    const rounds = get(currentGameRounds);
    if (rounds.length === 0) return null;

    const popped = rounds[rounds.length - 1];

    currentGameRounds.update(r => r.slice(0, -1));
    currentMatchRounds.update(r => r.slice(0, -1));

    roundsPlayed.update(n => Math.max(0, n - 1));
    const newCount = get(roundsPlayed);

    matchState.update(state => ({
        ...state,
        currentGameRounds: state.currentGameRounds.slice(0, -1),
        currentMatchRounds: state.currentMatchRounds.slice(0, -1),
        roundsPlayed: newCount
    }));

    lastRoundPoints.update(p => ({
        team1: Math.max(0, p.team1 - popped.team1Points),
        team2: Math.max(0, p.team2 - popped.team2Points)
    }));

    removeLastRoundFromCurrentMatch();

    saveMatchState();
    return popped;
}

/**
 * Update the 20s of an already-completed round (RoundsPanel edit flow).
 *
 * Patches currentGameRounds, currentMatchRounds AND the matchState object,
 * then persists. currentMatchRounds is what saveGameAndCheckMatchComplete
 * reads to compute a game's 20s totals, and matchState is what survives a
 * reload — editing only currentGameRounds (the old behaviour) produced stale
 * game totals and lost the edit on refresh.
 */
export function updateRoundTwenties(roundIndex: number, team1Twenty: number, team2Twenty: number) {
    const patch = (rounds: RoundData[]): RoundData[] => {
        if (!rounds[roundIndex]) return rounds;
        const updated = [...rounds];
        updated[roundIndex] = { ...updated[roundIndex], team1Twenty, team2Twenty };
        return updated;
    };

    currentGameRounds.update(patch);
    currentMatchRounds.update(patch);
    matchState.update(state => ({
        ...state,
        currentGameRounds: patch(state.currentGameRounds),
        currentMatchRounds: patch(state.currentMatchRounds)
    }));
    saveMatchState();
}

function swapRoundTeams(round: RoundData): RoundData {
    return {
        ...round,
        team1Points: round.team2Points,
        team2Points: round.team1Points,
        team1Twenty: round.team2Twenty,
        team2Twenty: round.team1Twenty,
        hammerTeam: round.hammerTeam === 1 ? 2 : round.hammerTeam === 2 ? 1 : null
    };
}

function swapGameTeams(game: GameData): GameData {
    return {
        ...game,
        winner: game.winner === 1 ? 2 : game.winner === 2 ? 1 : game.winner,
        team1Points: game.team2Points,
        team2Points: game.team1Points,
        team1Rounds: game.team2Rounds,
        team2Rounds: game.team1Rounds,
        team1Twenty: game.team2Twenty,
        team2Twenty: game.team1Twenty,
        // Games persist their rounds (for RoundsPanel reload survival) — mirror them too
        rounds: game.rounds ? game.rounds.map(swapRoundTeams) : game.rounds
    };
}

function swapTeamNumber(n: number | null): number | null {
    return n === 1 ? 2 : n === 2 ? 1 : n;
}

/**
 * Mirror all team-coded match state when the teams swap sides (switchSides).
 *
 * The team stores are swapped by teams.switchSides(), but the round history,
 * lastRoundPoints baseline and hammer tracking are keyed by team NUMBER
 * (card position). Without this mirror, after a mid-game side switch:
 * - checkRoundCompletion compares the new team1 points against the old
 *   team1 baseline → rounds fire with wrong (even negative) points or never
 * - in tournament mode the flipped currentUserSide remaps ALL previously
 *   recorded rounds, swapping A/B scores in the Firestore sync
 */
export function swapTeamsInMatchState() {
    currentGameRounds.update(rounds => rounds.map(swapRoundTeams));
    currentMatchRounds.update(rounds => rounds.map(swapRoundTeams));
    currentMatchGames.update(games => games.map(swapGameTeams));
    lastRoundPoints.update(p => ({ team1: p.team2, team2: p.team1 }));
    currentGameStartHammer.update(swapTeamNumber);
    lastGameHammerTeam.update(swapTeamNumber);

    matchState.update(state => ({
        ...state,
        currentGameRounds: state.currentGameRounds.map(swapRoundTeams),
        currentMatchRounds: state.currentMatchRounds.map(swapRoundTeams),
        currentMatchGames: state.currentMatchGames.map(swapGameTeams),
        currentGameStartHammer: swapTeamNumber(state.currentGameStartHammer),
        lastGameHammerTeam: swapTeamNumber(state.lastGameHammerTeam)
    }));

    swapTeamsInCurrentMatch();
    saveMatchState();
}

// Update currentMatch with new round data
function updateCurrentMatchRounds(team1Points: number, team2Points: number, team1Twenty: number, team2Twenty: number, hammerTeam: 1 | 2 | null, roundNumber: number) {
    if (!browser) return;

    const newRound: MatchRound = {
        team1Points,
        team2Points,
        team1Twenty,
        team2Twenty,
        hammerTeam,
        roundNumber
    };

    addRoundToCurrentMatch(newRound);
}
