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

    // Required fields with strict type/value checks
    if (typeof settings.gameMode !== 'string' || (settings.gameMode !== 'points' && settings.gameMode !== 'rounds')) return false;
    if (typeof settings.timerMinutes !== 'number' || settings.timerMinutes < 0) return false;
    if (typeof settings.timerSeconds !== 'number' || settings.timerSeconds < 0) return false;
    if (typeof settings.gameType !== 'string' || (settings.gameType !== 'singles' && settings.gameType !== 'doubles')) return false;
    if (typeof settings.show20s !== 'boolean') return false;
    if (typeof settings.showHammer !== 'boolean') return false;

    // Optional numeric fields: valid when present
    if (settings.matchesToWin !== undefined && (typeof settings.matchesToWin !== 'number' || settings.matchesToWin < 1)) return false;
    if (settings.pointsToWin !== undefined && (typeof settings.pointsToWin !== 'number' || settings.pointsToWin < 1)) return false;
    if (settings.roundsToPlay !== undefined && (typeof settings.roundsToPlay !== 'number' || settings.roundsToPlay < 1)) return false;

    return true;
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
                            // Version updated in localStorage
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
