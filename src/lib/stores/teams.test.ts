import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock matchState module (teams.ts imports from it)
vi.mock('./matchState', () => ({
	roundsPlayed: {
		set: vi.fn(),
		subscribe: vi.fn((fn: any) => {
			fn(0);
			return () => {};
		})
	},
	lastRoundPoints: {
		set: vi.fn(),
		subscribe: vi.fn((fn: any) => {
			fn({ team1: 0, team2: 0 });
			return () => {};
		})
	},
	matchState: {
		update: vi.fn(),
		subscribe: vi.fn((fn: any) => {
			fn({});
			return () => {};
		})
	},
	saveMatchState: vi.fn()
}));

// Mock localStorage
const localStorageMock = {
	store: {} as Record<string, string>,
	getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
	setItem: vi.fn((key: string, value: string) => {
		localStorageMock.store[key] = value;
	}),
	removeItem: vi.fn((key: string) => {
		delete localStorageMock.store[key];
	}),
	clear: vi.fn(() => {
		localStorageMock.store = {};
	})
};
vi.stubGlobal('localStorage', localStorageMock);

import { get } from 'svelte/store';
import {
	team1,
	team2,
	resetTeams,
	addPoints,
	switchSides,
	switchColors,
	assignUserToTeam,
	unassignUserFromTeam,
	getUserTeamAssignment,
	assignPartnerToTeam,
	unassignPartnerFromTeam,
	updatePartnerName,
	updateTeam,
	loadTeams,
	saveTeams,
	clearUserAssignments,
	clearPartnerAssignments
} from './teams';
import { roundsPlayed, lastRoundPoints, matchState, saveMatchState } from './matchState';

const defaultTeam1 = {
	name: 'Team 1',
	color: '#1B100E',
	points: 0,
	rounds: 0,
	autoRounds: 0,
	matches: 0,
	twenty: 0,
	hasWon: false,
	hasHammer: false,
	userId: null,
	userPhotoURL: null,
	partner: undefined
};

const defaultTeam2 = {
	name: 'Team 2',
	color: '#BB484D',
	points: 0,
	rounds: 0,
	autoRounds: 0,
	matches: 0,
	twenty: 0,
	hasWon: false,
	hasHammer: false,
	userId: null,
	userPhotoURL: null,
	partner: undefined
};

beforeEach(() => {
	localStorageMock.clear();
	vi.clearAllMocks();
	team1.set({ ...defaultTeam1 });
	team2.set({ ...defaultTeam2 });
});

// ─────────────────────────────────────────────────────────────────────────────
// team1 / team2 stores
// ─────────────────────────────────────────────────────────────────────────────

describe('team1 and team2 stores', () => {
	it('should have correct default values', () => {
		const t1 = get(team1);
		const t2 = get(team2);

		expect(t1.name).toBe('Team 1');
		expect(t1.color).toBe('#1B100E');
		expect(t1.points).toBe(0);
		expect(t1.rounds).toBe(0);
		expect(t1.twenty).toBe(0);
		expect(t1.hasWon).toBe(false);
		expect(t1.hasHammer).toBe(false);
		expect(t1.userId).toBeNull();
		expect(t1.partner).toBeUndefined();

		expect(t2.name).toBe('Team 2');
		expect(t2.color).toBe('#BB484D');
		expect(t2.points).toBe(0);
	});

	it('should be writable with .set()', () => {
		team1.set({ ...defaultTeam1, name: 'Custom', points: 42 });
		expect(get(team1).name).toBe('Custom');
		expect(get(team1).points).toBe(42);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// updateTeam
// ─────────────────────────────────────────────────────────────────────────────

describe('updateTeam', () => {
	it('should update partial fields on team1', () => {
		updateTeam(1, { name: 'Eagles', points: 10 });
		const t1 = get(team1);
		expect(t1.name).toBe('Eagles');
		expect(t1.points).toBe(10);
		// Other fields preserved
		expect(t1.color).toBe('#1B100E');
		expect(t1.rounds).toBe(0);
	});

	it('should update partial fields on team2', () => {
		updateTeam(2, { color: '#00FF00', hasHammer: true });
		const t2 = get(team2);
		expect(t2.color).toBe('#00FF00');
		expect(t2.hasHammer).toBe(true);
		expect(t2.name).toBe('Team 2');
	});

	it('should persist to localStorage after update', () => {
		updateTeam(1, { name: 'Saved Team' });
		expect(localStorageMock.setItem).toHaveBeenCalledWith(
			'crokinoleTeam1',
			expect.stringContaining('Saved Team')
		);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// resetTeams
// ─────────────────────────────────────────────────────────────────────────────

describe('resetTeams', () => {
	it('should reset points, rounds, matches, twenty, hasWon to defaults', () => {
		team1.set({
			...defaultTeam1,
			name: 'Eagles',
			color: '#FF0000',
			points: 55,
			rounds: 3,
			autoRounds: 2,
			matches: 7,
			twenty: 4,
			hasWon: true,
			hasHammer: true,
			userId: 'user-abc',
			userPhotoURL: 'http://photo.jpg'
		});

		resetTeams();

		const t1 = get(team1);
		expect(t1.points).toBe(0);
		expect(t1.rounds).toBe(0);
		expect(t1.autoRounds).toBe(0);
		expect(t1.matches).toBe(0);
		expect(t1.twenty).toBe(0);
		expect(t1.hasWon).toBe(false);
	});

	it('should preserve name, color, hasHammer, userId, userPhotoURL, and partner', () => {
		const partner = { name: 'Partner A', userId: 'p1', userPhotoURL: 'http://p1.jpg' };
		team1.set({
			...defaultTeam1,
			name: 'Eagles',
			color: '#FF0000',
			points: 55,
			rounds: 3,
			hasHammer: true,
			userId: 'user-abc',
			userPhotoURL: 'http://photo.jpg',
			partner
		});

		resetTeams();

		const t1 = get(team1);
		expect(t1.name).toBe('Eagles');
		expect(t1.color).toBe('#FF0000');
		expect(t1.hasHammer).toBe(true);
		expect(t1.userId).toBe('user-abc');
		expect(t1.userPhotoURL).toBe('http://photo.jpg');
		expect(t1.partner).toEqual(partner);
	});

	it('should preserve hasHammer on both teams after reset', () => {
		team1.set({ ...defaultTeam1, hasHammer: true, points: 50 });
		team2.set({ ...defaultTeam2, hasHammer: false, points: 30 });

		resetTeams();

		expect(get(team1).hasHammer).toBe(true);
		expect(get(team2).hasHammer).toBe(false);
		expect(get(team1).points).toBe(0);
		expect(get(team2).points).toBe(0);
	});

	it('should reset roundsPlayed and lastRoundPoints via matchState mocks', () => {
		resetTeams();
		expect(roundsPlayed.set).toHaveBeenCalledWith(0);
		expect(lastRoundPoints.set).toHaveBeenCalledWith({ team1: 0, team2: 0 });
		expect(matchState.update).toHaveBeenCalled();
		expect(saveMatchState).toHaveBeenCalled();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// addPoints
// ─────────────────────────────────────────────────────────────────────────────

describe('addPoints', () => {
	it('should increment points on team1', () => {
		addPoints(1, 15);
		expect(get(team1).points).toBe(15);
	});

	it('should increment points on team2', () => {
		addPoints(2, 20);
		expect(get(team2).points).toBe(20);
	});

	it('should accumulate points across multiple calls', () => {
		addPoints(1, 10);
		addPoints(1, 5);
		expect(get(team1).points).toBe(15);
	});

	it('should result in exactly 0 when subtracting exact amount', () => {
		team1.set({ ...defaultTeam1, points: 5 });
		addPoints(1, -5);
		expect(get(team1).points).toBe(0);
	});

	it('should clamp at 0 when subtracting below zero', () => {
		team1.set({ ...defaultTeam1, points: 5 });
		addPoints(1, -10);
		expect(get(team1).points).toBe(0);
	});

	it('should allow subtracting points if result >= 0', () => {
		team1.set({ ...defaultTeam1, points: 20 });
		addPoints(1, -5);
		expect(get(team1).points).toBe(15);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// switchSides
// ─────────────────────────────────────────────────────────────────────────────

describe('switchSides', () => {
	it('should swap team1 and team2 completely', () => {
		team1.set({ ...defaultTeam1, name: 'Alpha', color: '#AAA', points: 10, userId: 'u1' });
		team2.set({ ...defaultTeam2, name: 'Beta', color: '#BBB', points: 20, userId: 'u2' });

		switchSides();

		const t1 = get(team1);
		const t2 = get(team2);

		expect(t1.name).toBe('Beta');
		expect(t1.color).toBe('#BBB');
		expect(t1.points).toBe(20);
		expect(t1.userId).toBe('u2');

		expect(t2.name).toBe('Alpha');
		expect(t2.color).toBe('#AAA');
		expect(t2.points).toBe(10);
		expect(t2.userId).toBe('u1');
	});

	it('should swap all scoring fields correctly', () => {
		team1.set({
			...defaultTeam1,
			name: 'A',
			color: '#AAA',
			points: 10,
			rounds: 3,
			twenty: 2,
			hasWon: true,
			matches: 5,
			hasHammer: true
		});
		team2.set({
			...defaultTeam2,
			name: 'B',
			color: '#BBB',
			points: 20,
			rounds: 1,
			twenty: 0,
			hasWon: false,
			matches: 2,
			hasHammer: false
		});

		switchSides();

		const t1 = get(team1);
		const t2 = get(team2);

		expect(t1.points).toBe(20);
		expect(t1.rounds).toBe(1);
		expect(t1.twenty).toBe(0);
		expect(t1.hasWon).toBe(false);
		expect(t1.matches).toBe(2);
		expect(t1.hasHammer).toBe(false);

		expect(t2.points).toBe(10);
		expect(t2.rounds).toBe(3);
		expect(t2.twenty).toBe(2);
		expect(t2.hasWon).toBe(true);
		expect(t2.matches).toBe(5);
		expect(t2.hasHammer).toBe(true);
	});

	it('should preserve all fields during swap including partner', () => {
		const partner1 = { name: 'P1', userId: 'p1', userPhotoURL: null };
		team1.set({ ...defaultTeam1, partner: partner1 });
		team2.set({ ...defaultTeam2, partner: undefined });

		switchSides();

		expect(get(team1).partner).toBeUndefined();
		expect(get(team2).partner).toEqual(partner1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// switchColors
// ─────────────────────────────────────────────────────────────────────────────

describe('switchColors', () => {
	it('should swap only colors, keeping everything else', () => {
		team1.set({ ...defaultTeam1, name: 'Alpha', color: '#AAA', points: 10 });
		team2.set({ ...defaultTeam2, name: 'Beta', color: '#BBB', points: 20 });

		switchColors();

		const t1 = get(team1);
		const t2 = get(team2);

		// Colors swapped
		expect(t1.color).toBe('#BBB');
		expect(t2.color).toBe('#AAA');

		// Everything else unchanged
		expect(t1.name).toBe('Alpha');
		expect(t1.points).toBe(10);
		expect(t2.name).toBe('Beta');
		expect(t2.points).toBe(20);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// assignUserToTeam
// ─────────────────────────────────────────────────────────────────────────────

describe('assignUserToTeam', () => {
	it('should set userId, name, and userPhotoURL on team1', () => {
		assignUserToTeam(1, 'uid-123', 'Alice', 'http://alice.jpg');

		const t1 = get(team1);
		expect(t1.userId).toBe('uid-123');
		expect(t1.name).toBe('Alice');
		expect(t1.userPhotoURL).toBe('http://alice.jpg');
	});

	it('should set userId with null photoURL on team2', () => {
		assignUserToTeam(2, 'uid-456', 'Bob', null);

		const t2 = get(team2);
		expect(t2.userId).toBe('uid-456');
		expect(t2.name).toBe('Bob');
		expect(t2.userPhotoURL).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// unassignUserFromTeam
// ─────────────────────────────────────────────────────────────────────────────

describe('unassignUserFromTeam', () => {
	it('should clear userId and userPhotoURL but keep name', () => {
		assignUserToTeam(1, 'uid-123', 'Alice', 'http://alice.jpg');
		unassignUserFromTeam(1);

		const t1 = get(team1);
		expect(t1.userId).toBeNull();
		expect(t1.userPhotoURL).toBeNull();
		// Name is preserved (only userId/photoURL cleared)
		expect(t1.name).toBe('Alice');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserTeamAssignment
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserTeamAssignment', () => {
	it('should return 1 when userId matches team1 player', () => {
		assignUserToTeam(1, 'uid-a', 'A', null);
		expect(getUserTeamAssignment('uid-a')).toBe(1);
	});

	it('should return 2 when userId matches team2 player', () => {
		assignUserToTeam(2, 'uid-b', 'B', null);
		expect(getUserTeamAssignment('uid-b')).toBe(2);
	});

	it('should return null when userId is not assigned to any team', () => {
		expect(getUserTeamAssignment('uid-unknown')).toBeNull();
	});

	it('should return 1 when userId matches team1 partner', () => {
		assignPartnerToTeam(1, 'Partner X', 'uid-px', null);
		expect(getUserTeamAssignment('uid-px')).toBe(1);
	});

	it('should return 2 when userId matches team2 partner', () => {
		assignPartnerToTeam(2, 'Partner Y', 'uid-py', null);
		expect(getUserTeamAssignment('uid-py')).toBe(2);
	});

	it('should prioritize player over partner (player checked first)', () => {
		assignUserToTeam(1, 'uid-same', 'Player', null);
		assignPartnerToTeam(2, 'Partner', 'uid-same', null);
		// Player on team1 is checked first
		expect(getUserTeamAssignment('uid-same')).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// assignPartnerToTeam
// ─────────────────────────────────────────────────────────────────────────────

describe('assignPartnerToTeam', () => {
	it('should set partner object with name, userId, and photoURL', () => {
		assignPartnerToTeam(1, 'Charlie', 'uid-c', 'http://charlie.jpg');

		const t1 = get(team1);
		expect(t1.partner).toBeDefined();
		expect(t1.partner!.name).toBe('Charlie');
		expect(t1.partner!.userId).toBe('uid-c');
		expect(t1.partner!.userPhotoURL).toBe('http://charlie.jpg');
	});

	it('should allow null userId and photoURL for unregistered partner', () => {
		assignPartnerToTeam(2, 'Guest Player', null, null);

		const t2 = get(team2);
		expect(t2.partner).toBeDefined();
		expect(t2.partner!.name).toBe('Guest Player');
		expect(t2.partner!.userId).toBeNull();
		expect(t2.partner!.userPhotoURL).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// unassignPartnerFromTeam
// ─────────────────────────────────────────────────────────────────────────────

describe('unassignPartnerFromTeam', () => {
	it('should set partner to undefined', () => {
		assignPartnerToTeam(1, 'Charlie', 'uid-c', null);
		expect(get(team1).partner).toBeDefined();

		unassignPartnerFromTeam(1);
		expect(get(team1).partner).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// updatePartnerName
// ─────────────────────────────────────────────────────────────────────────────

describe('updatePartnerName', () => {
	it('should update only partner name, preserving userId and photoURL', () => {
		assignPartnerToTeam(1, 'Charlie', 'uid-c', 'http://charlie.jpg');

		updatePartnerName(1, 'Charles');

		const partner = get(team1).partner;
		expect(partner!.name).toBe('Charles');
		expect(partner!.userId).toBe('uid-c');
		expect(partner!.userPhotoURL).toBe('http://charlie.jpg');
	});

	it('should create a new partner object if none existed', () => {
		expect(get(team2).partner).toBeUndefined();

		updatePartnerName(2, 'New Partner');

		const partner = get(team2).partner;
		expect(partner).toBeDefined();
		expect(partner!.name).toBe('New Partner');
		expect(partner!.userId).toBeNull();
		expect(partner!.userPhotoURL).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// clearUserAssignments
// ─────────────────────────────────────────────────────────────────────────────

describe('clearUserAssignments', () => {
	it('should clear userId, userPhotoURL, and partner from both teams', () => {
		assignUserToTeam(1, 'uid-a', 'A', 'http://a.jpg');
		assignUserToTeam(2, 'uid-b', 'B', 'http://b.jpg');
		assignPartnerToTeam(1, 'PA', 'uid-pa', null);
		assignPartnerToTeam(2, 'PB', 'uid-pb', null);

		clearUserAssignments();

		const t1 = get(team1);
		const t2 = get(team2);
		expect(t1.userId).toBeNull();
		expect(t1.userPhotoURL).toBeNull();
		expect(t1.partner).toBeUndefined();
		expect(t2.userId).toBeNull();
		expect(t2.userPhotoURL).toBeNull();
		expect(t2.partner).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// clearPartnerAssignments
// ─────────────────────────────────────────────────────────────────────────────

describe('clearPartnerAssignments', () => {
	it('should clear partner from both teams but keep player assignment', () => {
		assignUserToTeam(1, 'uid-a', 'A', null);
		assignPartnerToTeam(1, 'PA', 'uid-pa', null);
		assignPartnerToTeam(2, 'PB', 'uid-pb', null);

		clearPartnerAssignments();

		expect(get(team1).partner).toBeUndefined();
		expect(get(team2).partner).toBeUndefined();
		// Player assignment preserved
		expect(get(team1).userId).toBe('uid-a');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// loadTeams / saveTeams (localStorage integration)
// ─────────────────────────────────────────────────────────────────────────────

describe('loadTeams', () => {
	it('should load valid team data from localStorage', () => {
		const savedTeam1 = {
			...defaultTeam1,
			name: 'Loaded Team',
			points: 30,
			color: '#123456'
		};
		localStorageMock.store['crokinoleTeam1'] = JSON.stringify(savedTeam1);

		loadTeams();

		const t1 = get(team1);
		expect(t1.name).toBe('Loaded Team');
		expect(t1.points).toBe(30);
		expect(t1.color).toBe('#123456');
	});

	it('should fall back to defaults for invalid localStorage data', () => {
		localStorageMock.store['crokinoleTeam1'] = JSON.stringify({ invalid: true });

		loadTeams();

		const t1 = get(team1);
		expect(t1.name).toBe('Team 1');
		expect(t1.points).toBe(0);
	});

	it('should handle corrupted JSON gracefully', () => {
		localStorageMock.store['crokinoleTeam1'] = 'not-json{{{';

		loadTeams();

		const t1 = get(team1);
		expect(t1.name).toBe('Team 1');
		expect(t1.points).toBe(0);
	});

	it('should not modify stores if no localStorage data exists', () => {
		team1.set({ ...defaultTeam1, name: 'Keep Me' });

		loadTeams();

		expect(get(team1).name).toBe('Keep Me');
	});
});

describe('saveTeams', () => {
	it('should write both teams to localStorage', () => {
		team1.set({ ...defaultTeam1, name: 'Save1' });
		team2.set({ ...defaultTeam2, name: 'Save2' });

		saveTeams();

		expect(localStorageMock.setItem).toHaveBeenCalledWith(
			'crokinoleTeam1',
			expect.stringContaining('Save1')
		);
		expect(localStorageMock.setItem).toHaveBeenCalledWith(
			'crokinoleTeam2',
			expect.stringContaining('Save2')
		);
	});
});

// Bug #7 regression: defensive loading fills missing fields from defaults

describe('defensive loading (Bug #7)', () => {
	it('fills missing fields with defaults when loading old version data', () => {
		// Simulate old version data missing newer fields like autoRounds, partner
		const oldTeamData = {
			name: 'Old Player',
			color: '#abc123',
			points: 5,
			rounds: 2,
			twenty: 1,
			hasWon: false,
			hasHammer: true
			// Missing: autoRounds, matches, userId, userPhotoURL, partner
		};
		localStorageMock.store['crokinoleTeam1'] = JSON.stringify(oldTeamData);

		loadTeams();

		const t1 = get(team1);
		// Saved fields preserved
		expect(t1.name).toBe('Old Player');
		expect(t1.color).toBe('#abc123');
		expect(t1.points).toBe(5);
		expect(t1.rounds).toBe(2);
		expect(t1.hasHammer).toBe(true);
		// Missing fields get defaults
		expect(t1.autoRounds).toBe(0);
		expect(t1.matches).toBe(0);
		expect(t1.userId).toBeNull();
		expect(t1.userPhotoURL).toBeNull();
		expect(t1.partner).toBeUndefined();
	});

	it('fills defaults for team2 as well', () => {
		const oldTeamData = {
			name: 'Old Opponent',
			color: '#def456',
			points: 3,
			rounds: 1,
			twenty: 0,
			hasWon: false,
			hasHammer: false
		};
		localStorageMock.store['crokinoleTeam2'] = JSON.stringify(oldTeamData);

		loadTeams();

		const t2 = get(team2);
		expect(t2.name).toBe('Old Opponent');
		expect(t2.autoRounds).toBe(0);
		expect(t2.matches).toBe(0);
		expect(t2.userId).toBeNull();
	});

	it('saved fields override defaults (not the other way around)', () => {
		const savedData = {
			name: 'Custom Name',
			color: '#custom',
			points: 10,
			rounds: 5,
			twenty: 3,
			hasWon: true,
			hasHammer: false,
			autoRounds: 2,
			matches: 4,
			userId: 'user-123',
			userPhotoURL: 'https://photo.url',
			partner: { name: 'Partner', userId: 'p-1', userPhotoURL: null }
		};
		localStorageMock.store['crokinoleTeam1'] = JSON.stringify(savedData);

		loadTeams();

		const t1 = get(team1);
		expect(t1.name).toBe('Custom Name');
		expect(t1.autoRounds).toBe(2);
		expect(t1.matches).toBe(4);
		expect(t1.userId).toBe('user-123');
		expect(t1.partner?.name).toBe('Partner');
	});
});
