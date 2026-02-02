import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

// Store for network online status
const _isOnline = writable(browser ? navigator.onLine : true);

// Store for sync status
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';
export const syncStatus = writable<SyncStatus>('idle');
export const pendingSyncCount = writable(0);

// Callbacks to execute when coming back online
const onReconnectCallbacks: Array<() => void | Promise<void>> = [];

function createNetworkStatus() {
	if (browser) {
		window.addEventListener('online', async () => {
			_isOnline.set(true);
			// Execute reconnect callbacks
			for (const callback of onReconnectCallbacks) {
				try {
					await callback();
				} catch (e) {
					console.error('Error in reconnect callback:', e);
				}
			}
		});

		window.addEventListener('offline', () => {
			_isOnline.set(false);
			// Reset sync status when going offline
			syncStatus.set('idle');
		});
	}

	return {
		subscribe: _isOnline.subscribe
	};
}

export const isOnline = createNetworkStatus();

// Register a callback to be executed when connection is restored
export function onReconnect(callback: () => void | Promise<void>) {
	onReconnectCallbacks.push(callback);
	// Return unsubscribe function
	return () => {
		const index = onReconnectCallbacks.indexOf(callback);
		if (index > -1) {
			onReconnectCallbacks.splice(index, 1);
		}
	};
}

// Derived store that combines offline and syncing states
export const connectionStatus = derived(
	[_isOnline, syncStatus],
	([$online, $sync]) => {
		if (!$online) return 'offline';
		if ($sync === 'syncing') return 'syncing';
		if ($sync === 'success') return 'synced';
		if ($sync === 'error') return 'sync-error';
		return 'online';
	}
);

// Helper to set sync status with auto-reset for success/error
export function setSyncStatus(status: SyncStatus, autoResetMs = 3000) {
	syncStatus.set(status);
	if (status === 'success' || status === 'error') {
		setTimeout(() => {
			// Only reset if still in the same status
			if (get(syncStatus) === status) {
				syncStatus.set('idle');
			}
		}, autoResetMs);
	}
}
