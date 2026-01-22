import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

// Initialize theme from localStorage or system preference
function getInitialTheme(): Theme {
  if (!browser) return 'light';

  // Check both new and old storage keys for backwards compatibility
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored) return stored;

  // Migration: check old key
  const oldStored = localStorage.getItem('adminTheme') as Theme | null;
  if (oldStored) {
    localStorage.setItem(STORAGE_KEY, oldStored);
    localStorage.removeItem('adminTheme');
    return oldStored;
  }

  // Check system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

function createTheme() {
  const { subscribe, set, update } = writable<Theme>(getInitialTheme());

  return {
    subscribe,
    toggle: () => {
      update(current => {
        const newTheme = current === 'light' ? 'dark' : 'light';
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
