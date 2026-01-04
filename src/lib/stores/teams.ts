import { writable } from 'svelte/store';
import type { Team } from '$lib/types/team';
import { browser } from '$app/environment';
import { roundsPlayed, lastRoundPoints } from './matchState';

const defaultTeam: Team = {
    name: '',
    color: '#00ff88',
    points: 0,
    rounds: 0,
    autoRounds: 0,
    matches: 0,
    twenty: 0,
    hasWon: false,
    hasHammer: false
};

// Create writable stores for each team
export const team1 = writable<Team>({
    ...defaultTeam,
    name: 'Team 1',
    color: '#00ff88'
});

export const team2 = writable<Team>({
    ...defaultTeam,
    name: 'Team 2',
    color: '#ff3366'
});

// Helper functions for team management
export function resetTeams() {
    // Get current teams to preserve name and color
    let currentTeam1: Team = { ...defaultTeam };
    let currentTeam2: Team = { ...defaultTeam };

    team1.subscribe(t => currentTeam1 = t)();
    team2.subscribe(t => currentTeam2 = t)();

    // Reset only points, rounds, matches, twenty, and hasWon
    // Preserve name and color
    team1.set({
        ...defaultTeam,
        name: currentTeam1.name || 'Team 1',
        color: currentTeam1.color || '#00ff88',
        hasHammer: currentTeam1.hasHammer // Also preserve hammer state
    });
    team2.set({
        ...defaultTeam,
        name: currentTeam2.name || 'Team 2',
        color: currentTeam2.color || '#ff3366',
        hasHammer: currentTeam2.hasHammer // Also preserve hammer state
    });

    // Reset round counters
    roundsPlayed.set(0);
    lastRoundPoints.set({ team1: 0, team2: 0 });

    if (browser) {
        localStorage.setItem('crokinoleRoundsPlayed', '0');
    }

    saveTeams();
}

/**
 * Validates if the loaded data matches Team interface
 * @param data - Parsed JSON data from localStorage
 * @returns True if data is a valid Team object
 */
function isValidTeam(data: unknown): data is Team {
    if (!data || typeof data !== 'object') return false;

    const team = data as Partial<Team>;

    return (
        typeof team.name === 'string' &&
        typeof team.color === 'string' &&
        typeof team.points === 'number' &&
        typeof team.rounds === 'number' &&
        typeof team.twenty === 'number' &&
        typeof team.hasWon === 'boolean' &&
        typeof team.hasHammer === 'boolean'
    );
}

/**
 * Loads team data from localStorage with validation
 * Falls back to default values if data is invalid
 */
export function loadTeams() {
    if (!browser) return;

    const saved1 = localStorage.getItem('crokinoleTeam1');
    const saved2 = localStorage.getItem('crokinoleTeam2');

    if (saved1) {
        try {
            const parsed = JSON.parse(saved1);
            if (isValidTeam(parsed)) {
                team1.set(parsed);
            } else {
                console.warn('Invalid team1 data in localStorage, using defaults');
                team1.set({ ...defaultTeam, name: 'Team 1', color: '#00ff88' });
            }
        } catch (e) {
            console.error('Error loading team1:', e);
            team1.set({ ...defaultTeam, name: 'Team 1', color: '#00ff88' });
        }
    }

    if (saved2) {
        try {
            const parsed = JSON.parse(saved2);
            if (isValidTeam(parsed)) {
                team2.set(parsed);
            } else {
                console.warn('Invalid team2 data in localStorage, using defaults');
                team2.set({ ...defaultTeam, name: 'Team 2', color: '#ff3366' });
            }
        } catch (e) {
            console.error('Error loading team2:', e);
            team2.set({ ...defaultTeam, name: 'Team 2', color: '#ff3366' });
        }
    }
}

export function saveTeams() {
    if (!browser) return;

    team1.subscribe(t => {
        localStorage.setItem('crokinoleTeam1', JSON.stringify(t));
    })();

    team2.subscribe(t => {
        localStorage.setItem('crokinoleTeam2', JSON.stringify(t));
    })();
}

// Helper to update specific team
export function updateTeam(teamNumber: 1 | 2, updates: Partial<Team>) {
    const store = teamNumber === 1 ? team1 : team2;
    store.update(team => ({ ...team, ...updates }));
    saveTeams();
}

// Helper to increment/decrement points
export function addPoints(teamNumber: 1 | 2, points: number) {
    updateTeam(teamNumber, {
        points: Math.max(0, (teamNumber === 1 ? getCurrentTeam1() : getCurrentTeam2()).points + points)
    });
}

// Helper to get current team values (for use in non-reactive contexts)
function getCurrentTeam1(): Team {
    let current: Team = { ...defaultTeam };
    team1.subscribe(t => current = t)();
    return current;
}

function getCurrentTeam2(): Team {
    let current: Team = { ...defaultTeam };
    team2.subscribe(t => current = t)();
    return current;
}

// Helper to switch team sides
export function switchSides() {
    const t1 = getCurrentTeam1();
    const t2 = getCurrentTeam2();

    team1.set(t2);
    team2.set(t1);
    saveTeams();
}

// Helper to switch team colors only
export function switchColors() {
    const t1 = getCurrentTeam1();
    const t2 = getCurrentTeam2();

    team1.update(team => ({ ...team, color: t2.color }));
    team2.update(team => ({ ...team, color: t1.color }));
    saveTeams();
}
