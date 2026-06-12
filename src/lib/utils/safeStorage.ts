/**
 * localStorage wrappers that never throw.
 *
 * Raw localStorage access crashes the app on real devices:
 * - Safari with "Block All Cookies" enabled throws SecurityError on ANY
 *   localStorage access (even reads) — stores that load at app init would
 *   take down the whole page.
 * - Safari private mode (older iOS) throws QuotaExceededError on setItem.
 * - Some WebViews expose no storage at all.
 *
 * All app code should use these instead of touching localStorage directly.
 */

export function safeGetItem(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function safeSetItem(key: string, value: string): boolean {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

export function safeRemoveItem(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// Storage unavailable — nothing to remove
	}
}

let storageAvailable: boolean | null = null;

/**
 * True when localStorage can actually be written (not just present).
 * Detects Safari "Block All Cookies", private-mode quota of 0, and WebViews
 * without storage. Only call in the browser; the result is cached.
 */
export function isStorageAvailable(): boolean {
	if (storageAvailable !== null) return storageAvailable;
	try {
		const probe = '__storage_probe__';
		localStorage.setItem(probe, '1');
		localStorage.removeItem(probe);
		storageAvailable = true;
	} catch {
		storageAvailable = false;
	}
	return storageAvailable;
}
