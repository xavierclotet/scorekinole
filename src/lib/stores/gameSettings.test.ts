import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock constants
vi.mock('$lib/constants', () => ({
	APP_VERSION: '2.4.81',
	DEFAULT_GAME_SETTINGS: {
		appVersion: '2.4.81',
		pointsToWin: 7,
		timerMinutes: 10,
		timerSeconds: 0,
		showTimer: true,
		matchesToWin: 1,
		show20s: false,
		showHammer: false,
		showScoreTable: true,
		gameType: 'singles',
		gameMode: 'rounds',
		roundsToPlay: 4,
		allowTiesInRoundsMode: true,
		eventTitle: 'Event',
		matchPhase: 'Fase'
	}
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
import { gameSettings } from '../stores/gameSettings';

beforeEach(() => {
	localStorageMock.store = {};
	localStorageMock.getItem.mockClear();
	localStorageMock.setItem.mockClear();
	// Reset to defaults
	gameSettings.set({
		appVersion: '2.4.81',
		pointsToWin: 7,
		timerMinutes: 10,
		timerSeconds: 0,
		showTimer: true,
		matchesToWin: 1,
		show20s: false,
		showHammer: false,
		showScoreTable: true,
		gameType: 'singles',
		gameMode: 'rounds',
		roundsToPlay: 4,
		allowTiesInRoundsMode: true,
		eventTitle: 'Event',
		matchPhase: 'Fase'
	} as any);
});

describe('gameSettings store', () => {
	it('default settings have correct values', () => {
		const settings = get(gameSettings);
		expect(settings.appVersion).toBe('2.4.81');
		expect(settings.pointsToWin).toBe(7);
		expect(settings.timerMinutes).toBe(10);
		expect(settings.timerSeconds).toBe(0);
		expect(settings.showTimer).toBe(true);
		expect(settings.matchesToWin).toBe(1);
		expect(settings.show20s).toBe(false);
		expect(settings.showHammer).toBe(false);
		expect(settings.showScoreTable).toBe(true);
		expect(settings.gameType).toBe('singles');
		expect(settings.gameMode).toBe('rounds');
		expect(settings.roundsToPlay).toBe(4);
		expect(settings.allowTiesInRoundsMode).toBe(true);
		expect(settings.eventTitle).toBe('Event');
		expect(settings.matchPhase).toBe('Fase');
	});

	it('load() reads from localStorage and sets valid data', () => {
		const savedSettings = {
			appVersion: '2.4.81',
			pointsToWin: 15,
			timerMinutes: 5,
			timerSeconds: 30,
			showTimer: false,
			matchesToWin: 3,
			show20s: true,
			showHammer: true,
			showScoreTable: false,
			gameType: 'doubles',
			gameMode: 'points',
			roundsToPlay: 8,
			allowTiesInRoundsMode: false,
			eventTitle: 'Torneig',
			matchPhase: 'Final'
		};
		localStorageMock.store['crokinoleGame'] = JSON.stringify(savedSettings);

		gameSettings.load();

		const settings = get(gameSettings);
		expect(settings.pointsToWin).toBe(15);
		expect(settings.timerMinutes).toBe(5);
		expect(settings.timerSeconds).toBe(30);
		expect(settings.showTimer).toBe(false);
		expect(settings.matchesToWin).toBe(3);
		expect(settings.show20s).toBe(true);
		expect(settings.showHammer).toBe(true);
		expect(settings.gameType).toBe('doubles');
		expect(settings.gameMode).toBe('points');
		expect(settings.roundsToPlay).toBe(8);
		expect(settings.allowTiesInRoundsMode).toBe(false);
		expect(settings.eventTitle).toBe('Torneig');
		expect(settings.matchPhase).toBe('Final');
		expect(localStorageMock.getItem).toHaveBeenCalledWith('crokinoleGame');
	});

	it('load() falls back to defaults for invalid data (missing gameMode)', () => {
		const invalidSettings = {
			appVersion: '2.4.81',
			pointsToWin: 15,
			timerMinutes: 5,
			timerSeconds: 30
			// gameMode is missing — validation requires it to be 'points' or 'rounds'
		};
		localStorageMock.store['crokinoleGame'] = JSON.stringify(invalidSettings);

		gameSettings.load();

		const settings = get(gameSettings);
		// Should fall back to defaults
		expect(settings.pointsToWin).toBe(7);
		expect(settings.timerMinutes).toBe(10);
		expect(settings.gameMode).toBe('rounds');
	});

	it('load() falls back to defaults for non-JSON data', () => {
		localStorageMock.store['crokinoleGame'] = 'this is not valid JSON!!!';

		gameSettings.load();

		const settings = get(gameSettings);
		// Should fall back to defaults after JSON.parse throws
		expect(settings.pointsToWin).toBe(7);
		expect(settings.timerMinutes).toBe(10);
		expect(settings.gameMode).toBe('rounds');
		expect(settings.appVersion).toBe('2.4.81');
	});

	it('load() updates appVersion when different and saves to localStorage', () => {
		const oldSettings = {
			appVersion: '2.3.50',
			pointsToWin: 15,
			timerMinutes: 5,
			timerSeconds: 30,
			showTimer: true,
			matchesToWin: 2,
			show20s: true,
			showHammer: false,
			showScoreTable: true,
			gameType: 'singles',
			gameMode: 'points',
			roundsToPlay: 4,
			allowTiesInRoundsMode: true,
			eventTitle: 'Old Event',
			matchPhase: 'Semifinal'
		};
		localStorageMock.store['crokinoleGame'] = JSON.stringify(oldSettings);

		gameSettings.load();

		const settings = get(gameSettings);
		// appVersion should be updated to current
		expect(settings.appVersion).toBe('2.4.81');
		// Other settings should be preserved from saved data
		expect(settings.pointsToWin).toBe(15);
		expect(settings.gameMode).toBe('points');
		expect(settings.eventTitle).toBe('Old Event');
		// Should have saved the updated version to localStorage
		expect(localStorageMock.setItem).toHaveBeenCalledWith(
			'crokinoleGame',
			expect.stringContaining('"appVersion":"2.4.81"')
		);
	});

	it('load() does nothing when no saved data exists', () => {
		// localStorage is empty (no 'crokinoleGame' key)
		gameSettings.load();

		const settings = get(gameSettings);
		// Should remain at the defaults we set in beforeEach
		expect(settings.pointsToWin).toBe(7);
		expect(settings.timerMinutes).toBe(10);
		expect(settings.gameMode).toBe('rounds');
		// setItem should NOT have been called (no version migration needed)
		expect(localStorageMock.setItem).not.toHaveBeenCalled();
	});

	it('save() persists current settings to localStorage', () => {
		gameSettings.update((s) => ({ ...s, pointsToWin: 20, eventTitle: 'My Tournament' }));

		gameSettings.save();

		expect(localStorageMock.setItem).toHaveBeenCalledWith(
			'crokinoleGame',
			expect.any(String)
		);
		const savedJson = localStorageMock.setItem.mock.calls[0][1];
		const parsed = JSON.parse(savedJson);
		expect(parsed.pointsToWin).toBe(20);
		expect(parsed.eventTitle).toBe('My Tournament');
		expect(parsed.appVersion).toBe('2.4.81');
	});

	it('set/update works: changing pointsToWin reflects in get()', () => {
		// Test set()
		gameSettings.set({ ...get(gameSettings), pointsToWin: 100 });
		expect(get(gameSettings).pointsToWin).toBe(100);

		// Test update()
		gameSettings.update((s) => ({ ...s, pointsToWin: 42 }));
		expect(get(gameSettings).pointsToWin).toBe(42);

		// Other values should be unaffected
		expect(get(gameSettings).timerMinutes).toBe(10);
		expect(get(gameSettings).gameMode).toBe('rounds');
	});
});
