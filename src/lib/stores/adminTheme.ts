import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'adminTheme';

// Initialize theme from localStorage or system preference
function getInitialTheme(): Theme {
  if (!browser) return 'light';

  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored) return stored;

  // Check system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

function createAdminTheme() {
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

export const adminTheme = createAdminTheme();
