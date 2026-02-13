import { writable, derived } from 'svelte/store';
import { currentUser, authInitialized } from '$lib/firebase/auth';
import { getUserProfile } from '$lib/firebase/userProfile';
import { browser } from '$app/environment';

/**
 * Admin state interface
 */
interface AdminState {
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canAutofill: boolean;
}

const defaultState: AdminState = {
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  canAutofill: false
};

/**
 * Combined admin state store
 * Uses derived with async setter to handle all state transitions correctly
 */
export const adminState = derived<
  [typeof authInitialized, typeof currentUser],
  AdminState
>(
  [authInitialized, currentUser],
  ([$authInitialized, $currentUser], set) => {
    // Don't do anything on server
    if (!browser) {
      set(defaultState);
      return;
    }

    // Auth not initialized yet - keep loading
    if (!$authInitialized) {
      set({ ...defaultState, loading: true });
      return;
    }

    // Auth initialized but no user - not admin, done loading
    if (!$currentUser) {
      set({ loading: false, isAdmin: false, isSuperAdmin: false, canAutofill: false });
      return;
    }

    // User exists - need to check profile (async)
    // Set loading while we fetch
    set({ ...defaultState, loading: true });

    getUserProfile()
      .then((profile) => {
        set({
          loading: false,
          isAdmin: profile?.isAdmin === true,
          isSuperAdmin: profile?.isSuperAdmin === true,
          canAutofill: profile?.canAutofill === true
        });
      })
      .catch((error) => {
        console.error('Error checking admin status:', error);
        set({ loading: false, isAdmin: false, isSuperAdmin: false, canAutofill: false });
      });
  },
  defaultState
);

/**
 * Loading state for admin check (derived from adminState)
 */
export const adminCheckLoading = derived(adminState, ($state) => $state.loading);

/**
 * Admin status (derived from adminState)
 */
export const isAdminUser = derived(adminState, ($state) => $state.isAdmin);

/**
 * Super Admin status (derived from adminState)
 */
export const isSuperAdminUser = derived(adminState, ($state) => $state.isSuperAdmin);

/**
 * Can use autofill buttons (derived from adminState)
 */
export const canAutofillUser = derived(adminState, ($state) => $state.canAutofill);

/**
 * Derived store: Can access admin panel
 */
export const canAccessAdmin = derived(
  [adminState, currentUser],
  ([$adminState, $currentUser]) => {
    return $currentUser !== null && $adminState.isAdmin === true;
  }
);

/**
 * Derived store: Can access super admin features (users/matches management)
 */
export const canAccessSuperAdmin = derived(
  [adminState, currentUser],
  ([$adminState, $currentUser]) => {
    return $currentUser !== null && $adminState.isSuperAdmin === true;
  }
);
