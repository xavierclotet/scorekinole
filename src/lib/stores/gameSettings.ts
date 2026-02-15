import { writable } from 'svelte/store';
import { DEFAULT_GAME_SETTINGS, APP_VERSION } from '$lib/constants';
import type { GameSettings } from '$lib/types/settings';
import { browser } from '$app/environment';

/**
 * Validates if the loaded data matches GameSettings interface
 * @param data - Parsed JSON data from localStorage
 * @returns True if data is valid GameSettings object
 */
function isValidGameSettings(data: unknown): data is GameSettings {
    if (!data || typeof data !== 'object') return false;

    const settings = data as Partial<GameSettings>;

    return (
        typeof settings.gameMode === 'string' &&
        (settings.gameMode === 'points' || settings.gameMode === 'rounds') &&
        typeof settings.pointsToWin === 'number' &&
        typeof settings.roundsToPlay === 'number' &&
        typeof settings.timerMinutes === 'number' &&
        typeof settings.timerSeconds === 'number'
    );
}

/**
 * Creates a reactive store for game settings with localStorage persistence
 * @returns Store with load/save methods for settings management
 */
function createGameSettings() {
    const { subscribe, set, update } = writable<GameSettings>(DEFAULT_GAME_SETTINGS);

    return {
        subscribe,
        set,
        update,
        /**
         * Loads settings from localStorage with validation
         * Falls back to default settings if data is invalid
         */
        load: () => {
            if (!browser) return;

            const saved = localStorage.getItem('crokinoleGame');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);

                    // Validate parsed data before setting
                    if (isValidGameSettings(parsed)) {
                        // Always update to current app version
                        const updatedSettings = { ...parsed, appVersion: APP_VERSION };
                        set(updatedSettings);

                        // If version changed, save immediately to update localStorage
                        if (parsed.appVersion !== APP_VERSION) {
                            console.log(`📦 Updating version in localStorage: ${parsed.appVersion} → ${APP_VERSION}`);
                            localStorage.setItem('crokinoleGame', JSON.stringify(updatedSettings));
                        }
                    } else {
                        console.warn('Invalid settings in localStorage, using defaults');
                        set(DEFAULT_GAME_SETTINGS);
                    }
                } catch (e) {
                    console.error('Error loading settings:', e);
                    set(DEFAULT_GAME_SETTINGS);
                }
            }
        },
        /**
         * Saves current settings to localStorage
         */
        save: () => {
            if (!browser) return;

            update(settings => {
                localStorage.setItem('crokinoleGame', JSON.stringify(settings));
                return settings;
            });
        }
    };
}

export const gameSettings = createGameSettings();
