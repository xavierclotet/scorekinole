import { writable, derived } from 'svelte/store';
import { currentUser } from '$lib/firebase/auth';
import { isAdmin as checkIsAdmin } from '$lib/firebase/admin';
import { browser } from '$app/environment';

/**
 * Admin status store
 */
export const isAdminUser = writable<boolean>(false);

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
      const adminStatus = await checkIsAdmin();
      isAdminUser.set(adminStatus);
    } else {
      isAdminUser.set(false);
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
