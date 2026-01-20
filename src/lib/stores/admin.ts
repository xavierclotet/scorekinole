import { writable, derived } from 'svelte/store';
import { currentUser } from '$lib/firebase/auth';
import { isAdmin as checkIsAdmin, isSuperAdmin as checkIsSuperAdmin } from '$lib/firebase/admin';
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
      const [adminStatus, superAdminStatus] = await Promise.all([
        checkIsAdmin(),
        checkIsSuperAdmin()
      ]);
      isAdminUser.set(adminStatus);
      isSuperAdminUser.set(superAdminStatus);
    } else {
      isAdminUser.set(false);
      isSuperAdminUser.set(false);
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
