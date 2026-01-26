import { writable, derived } from 'svelte/store';
import { currentUser } from '$lib/firebase/auth';
import { getUserProfile } from '$lib/firebase/userProfile';
import { browser } from '$app/environment';

/**
 * Admin status store
 */
export const isAdminUser = writable<boolean>(false);

/**
 * Super Admin status store
 */
export const isSuperAdminUser = writable<boolean>(false);

/**
 * Can use autofill buttons in groups/bracket pages
 */
export const canAutofillUser = writable<boolean>(false);

/**
 * Loading state for admin check
 */
export const adminCheckLoading = writable<boolean>(true);

/**
 * Check admin status when user changes
 */
if (browser) {
  currentUser.subscribe(async (user) => {
    adminCheckLoading.set(true);

    if (user) {
      // Single Firestore read instead of two separate calls
      const profile = await getUserProfile();
      isAdminUser.set(profile?.isAdmin === true);
      isSuperAdminUser.set(profile?.isSuperAdmin === true);
      canAutofillUser.set(profile?.canAutofill === true);
    } else {
      isAdminUser.set(false);
      isSuperAdminUser.set(false);
      canAutofillUser.set(false);
    }

    adminCheckLoading.set(false);
  });
}

/**
 * Derived store: Can access admin panel
 */
export const canAccessAdmin = derived(
  [currentUser, isAdminUser],
  ([$currentUser, $isAdminUser]) => {
    return $currentUser !== null && $isAdminUser === true;
  }
);

/**
 * Derived store: Can access super admin features (users/matches management)
 */
export const canAccessSuperAdmin = derived(
  [currentUser, isSuperAdminUser],
  ([$currentUser, $isSuperAdminUser]) => {
    return $currentUser !== null && $isSuperAdminUser === true;
  }
);
