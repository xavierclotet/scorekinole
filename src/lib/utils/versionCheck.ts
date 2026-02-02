import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '$lib/constants';
import { browser } from '$app/environment';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/xavierclotet/scorekinole/releases/latest';
const GITHUB_RELEASES_PAGE = 'https://github.com/xavierclotet/scorekinole/releases/latest';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Check once per day
const STORAGE_KEY = 'scorekinole_last_version_check';

export interface VersionCheckResult {
	updateAvailable: boolean;
	latestVersion: string | null;
	downloadUrl: string;
}

/**
 * Compare two semantic versions
 * Returns true if latest is newer than current
 */
function isNewerVersion(current: string, latest: string): boolean {
	const currentParts = current.replace(/^v/, '').split('.').map(Number);
	const latestParts = latest.replace(/^v/, '').split('.').map(Number);

	for (let i = 0; i < 3; i++) {
		const currentPart = currentParts[i] || 0;
		const latestPart = latestParts[i] || 0;

		if (latestPart > currentPart) return true;
		if (latestPart < currentPart) return false;
	}

	return false;
}

/**
 * Check if we should perform a version check (rate limiting)
 */
function shouldCheckVersion(): boolean {
	if (!browser) return false;

	try {
		const lastCheck = localStorage.getItem(STORAGE_KEY);
		if (!lastCheck) return true;

		const lastCheckTime = parseInt(lastCheck, 10);
		return Date.now() - lastCheckTime > CHECK_INTERVAL_MS;
	} catch {
		return true;
	}
}

/**
 * Mark that we performed a version check
 */
function markVersionChecked(): void {
	if (!browser) return;

	try {
		localStorage.setItem(STORAGE_KEY, Date.now().toString());
	} catch {
		// Ignore storage errors
	}
}

/**
 * Check if running on native mobile platform
 */
export function isNativeMobile(): boolean {
	if (!browser) return false;

	try {
		return Capacitor.isNativePlatform();
	} catch {
		return false;
	}
}

/**
 * Check for available updates from GitHub releases
 * Only runs on native mobile platforms, once per day
 */
export async function checkForUpdates(): Promise<VersionCheckResult> {
	const result: VersionCheckResult = {
		updateAvailable: false,
		latestVersion: null,
		downloadUrl: GITHUB_RELEASES_PAGE
	};

	// Only check on native mobile platforms
	if (!isNativeMobile()) {
		return result;
	}

	// Rate limit checks
	if (!shouldCheckVersion()) {
		return result;
	}

	try {
		const response = await fetch(GITHUB_RELEASES_API, {
			headers: {
				'Accept': 'application/vnd.github.v3+json'
			}
		});

		if (!response.ok) {
			console.warn('Failed to fetch latest release:', response.status);
			return result;
		}

		const data = await response.json();
		const latestVersion = data.tag_name || data.name;

		if (latestVersion) {
			result.latestVersion = latestVersion.replace(/^v/, '');
			result.updateAvailable = isNewerVersion(APP_VERSION, latestVersion);
		}

		// Mark as checked regardless of result
		markVersionChecked();

		if (result.updateAvailable) {
			console.log(`📱 Update available: ${APP_VERSION} → ${result.latestVersion}`);
		}

		return result;
	} catch (error) {
		console.warn('Version check failed:', error);
		return result;
	}
}

/**
 * Get the download URL for the latest release
 */
export function getDownloadUrl(): string {
	return GITHUB_RELEASES_PAGE;
}
