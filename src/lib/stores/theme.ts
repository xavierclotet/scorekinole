import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Extended themes: green (default) and violet variants
type Theme = 'light' | 'dark' | 'violet' | 'violet-light';

// Theme cycle order for toggle
const THEME_CYCLE: Theme[] = ['dark', 'light', 'violet', 'violet-light'];

const STORAGE_KEY = 'theme';

// Initialize theme from localStorage or system preference
function getInitialTheme(): Theme {
	if (!browser) return 'dark'; // Default to dark for SSR to match landing page

	// First check if already set by blocking script in app.html
	const htmlTheme = document.documentElement.getAttribute('data-theme') as Theme | null;
	if (htmlTheme && THEME_CYCLE.includes(htmlTheme)) return htmlTheme;

	// Check both new and old storage keys for backwards compatibility
	const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
	if (stored && THEME_CYCLE.includes(stored)) return stored;

	// Migration: check old key
	const oldStored = localStorage.getItem('adminTheme') as Theme | null;
	if (oldStored) {
		const mapped = oldStored === 'light' ? 'light' : 'dark';
		localStorage.setItem(STORAGE_KEY, mapped);
		localStorage.removeItem('adminTheme');
		return mapped;
	}

	// Check system preference
	if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark';
	}

	return 'dark'; // Default to dark to match landing page
}

function createTheme() {
	const { subscribe, set, update } = writable<Theme>(getInitialTheme());

	return {
		subscribe,
		// Toggle cycles through: dark → light → violet → violet-light → dark
		toggle: () => {
			update((current) => {
				const currentIndex = THEME_CYCLE.indexOf(current);
				const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
				const newTheme = THEME_CYCLE[nextIndex];
				if (browser) {
					localStorage.setItem(STORAGE_KEY, newTheme);
				}
				return newTheme;
			});
		},
		// Quick toggle between light/dark variants of current color
		toggleMode: () => {
			update((current) => {
				let newTheme: Theme;
				if (current === 'dark') newTheme = 'light';
				else if (current === 'light') newTheme = 'dark';
				else if (current === 'violet') newTheme = 'violet-light';
				else newTheme = 'violet';
				if (browser) {
					localStorage.setItem(STORAGE_KEY, newTheme);
				}
				return newTheme;
			});
		},
		// Quick toggle between green/violet of current mode
		toggleColor: () => {
			update((current) => {
				let newTheme: Theme;
				if (current === 'dark') newTheme = 'violet';
				else if (current === 'light') newTheme = 'violet-light';
				else if (current === 'violet') newTheme = 'dark';
				else newTheme = 'light';
				if (browser) {
					localStorage.setItem(STORAGE_KEY, newTheme);
				}
				return newTheme;
			});
		},
		set: (theme: Theme) => {
			if (browser) {
				localStorage.setItem(STORAGE_KEY, theme);
			}
			set(theme);
		}
	};
}

export const theme = createTheme();

// Backwards compatibility alias
export const adminTheme = theme;
