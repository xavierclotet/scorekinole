/**
 * Screen Wake Lock utility
 * Prevents the screen from turning off during active match scoring.
 * Re-acquires the lock automatically when the page regains visibility.
 */

let wakeLock: WakeLockSentinel | null = null;
let isRequested = false;

function onVisibilityChange() {
	if (document.visibilityState === 'visible' && isRequested) {
		acquireLock();
	}
}

async function acquireLock() {
	try {
		wakeLock = await navigator.wakeLock.request('screen');
		wakeLock.addEventListener('release', () => {
			wakeLock = null;
		});
	} catch {
		// Permission denied or API not available — silent no-op
	}
}

/**
 * Request a screen wake lock. The lock persists until releaseWakeLock() is called.
 * Automatically re-acquires after tab switch (visibilitychange).
 */
export async function requestWakeLock() {
	if (!('wakeLock' in navigator)) return;
	isRequested = true;
	document.addEventListener('visibilitychange', onVisibilityChange);
	await acquireLock();
}

/**
 * Release the screen wake lock and stop re-acquiring on visibility change.
 */
export async function releaseWakeLock() {
	isRequested = false;
	document.removeEventListener('visibilitychange', onVisibilityChange);
	if (wakeLock) {
		await wakeLock.release();
		wakeLock = null;
	}
}
