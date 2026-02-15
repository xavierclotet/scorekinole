import { writable } from 'svelte/store';
import type { Team } from '$lib/types/team';
import { browser } from '$app/environment';
import { roundsPlayed, lastRoundPoints, matchState, saveMatchState } from './matchState';

const defaultTeam: Team = {
    name: '',
    color: '#1B100E',
    points: 0,
    rounds: 0,
    autoRounds: 0,
    matches: 0,
    twenty: 0,
    hasWon: false,
    hasHammer: false,
    // User association fields (for friendly matches)
    userId: null,
    userPhotoURL: null,
    // Partner (for doubles friendly matches)
    partner: undefined
};

// Create writable stores for each team
export const team1 = writable<Team>({
    ...defaultTeam,
    name: 'Team 1',
    color: '#1B100E'
});

export const team2 = writable<Team>({
    ...defaultTeam,
    name: 'Team 2',
    color: '#BB484D'
});

// Helper functions for team management
export function resetTeams() {
    // Get current teams to preserve name and color
    let currentTeam1: Team = { ...defaultTeam };
    let currentTeam2: Team = { ...defaultTeam };

    team1.subscribe(t => currentTeam1 = t)();
    team2.subscribe(t => currentTeam2 = t)();

    // Reset only points, rounds, matches, twenty, and hasWon
    // Preserve name, color, user assignment, and partner
    team1.set({
        ...defaultTeam,
        name: currentTeam1.name || 'Team 1',
        color: currentTeam1.color || '#00ff88',
        hasHammer: currentTeam1.hasHammer, // Also preserve hammer state
        userId: currentTeam1.userId,       // Preserve user assignment
        userPhotoURL: currentTeam1.userPhotoURL,
        partner: currentTeam1.partner      // Preserve partner assignment
    });
    team2.set({
        ...defaultTeam,
        name: currentTeam2.name || 'Team 2',
        color: currentTeam2.color || '#ff3366',
        hasHammer: currentTeam2.hasHammer, // Also preserve hammer state
        userId: currentTeam2.userId,       // Preserve user assignment
        userPhotoURL: currentTeam2.userPhotoURL,
        partner: currentTeam2.partner      // Preserve partner assignment
    });

    // Reset round counters
    roundsPlayed.set(0);
    lastRoundPoints.set({ team1: 0, team2: 0 });
    matchState.update(state => ({ ...state, roundsPlayed: 0 }));
    saveMatchState();

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

// ─────────────────────────────────────────────────────────────────────────────
// User Assignment Functions (for friendly matches)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assign a user to a team
 * Used in friendly matches to link a registered user to a team
 */
export function assignUserToTeam(
    teamNumber: 1 | 2,
    userId: string,
    userName: string,
    userPhotoURL: string | null
): void {
    updateTeam(teamNumber, {
        userId,
        name: userName,
        userPhotoURL
    });
}

/**
 * Unassign a user from a team
 * Keeps the team name but removes userId association
 */
export function unassignUserFromTeam(teamNumber: 1 | 2): void {
    updateTeam(teamNumber, {
        userId: null,
        userPhotoURL: null
    });
}

/**
 * Clear all user assignments from both teams (including partners)
 * Called when starting a new match or resetting
 */
export function clearUserAssignments(): void {
    team1.update(team => ({ ...team, userId: null, userPhotoURL: null, partner: undefined }));
    team2.update(team => ({ ...team, userId: null, userPhotoURL: null, partner: undefined }));
    saveTeams();
}

/**
 * Check if a user is assigned to any team (as player or partner)
 * Returns the team number (1 or 2) or null if not assigned
 */
export function getUserTeamAssignment(userId: string): 1 | 2 | null {
    const t1 = getCurrentTeam1();
    const t2 = getCurrentTeam2();

    // Check as player
    if (t1.userId === userId) return 1;
    if (t2.userId === userId) return 2;
    // Check as partner
    if (t1.partner?.userId === userId) return 1;
    if (t2.partner?.userId === userId) return 2;
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner Assignment Functions (for doubles friendly matches)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assign a partner to a team (for doubles mode)
 * Used in friendly doubles matches to link a second player to a team
 */
export function assignPartnerToTeam(
    teamNumber: 1 | 2,
    name: string,
    userId: string | null,
    photoURL: string | null
): void {
    updateTeam(teamNumber, {
        partner: {
            name,
            userId,
            userPhotoURL: photoURL
        }
    });
}

/**
 * Unassign a partner from a team
 * Removes the partner association completely
 */
export function unassignPartnerFromTeam(teamNumber: 1 | 2): void {
    updateTeam(teamNumber, {
        partner: undefined
    });
}

/**
 * Update partner name (preserves userId and photoURL if they exist)
 */
export function updatePartnerName(teamNumber: 1 | 2, name: string): void {
    const store = teamNumber === 1 ? team1 : team2;
    store.update(team => ({
        ...team,
        partner: team.partner
            ? { ...team.partner, name }
            : { name, userId: null, userPhotoURL: null }
    }));
    saveTeams();
}

/**
 * Clear all partner assignments from both teams
 */
export function clearPartnerAssignments(): void {
    team1.update(team => ({ ...team, partner: undefined }));
    team2.update(team => ({ ...team, partner: undefined }));
    saveTeams();
}
