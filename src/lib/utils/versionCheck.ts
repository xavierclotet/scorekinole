import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '$lib/constants';
import { browser } from '$app/environment';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/xavierclotet/scorekinole/releases/latest';
const GITHUB_RELEASES_PAGE = 'https://github.com/xavierclotet/scorekinole/releases/latest';
const DISMISSED_VERSION_KEY = 'scorekinole_dismissed_version';

/**
 * Build direct APK download URL for a specific version
 */
function buildApkDownloadUrl(version: string): string {
	const cleanVersion = version.replace(/^v/, '');
	return `https://github.com/xavierclotet/scorekinole/releases/download/v${cleanVersion}/scorekinole-${cleanVersion}.apk`;
}

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
 * Check if the user already dismissed the update modal for a specific version
 */
function wasVersionDismissed(version: string): boolean {
	if (!browser) return false;

	try {
		const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
		return dismissedVersion === version;
	} catch {
		return false;
	}
}

/**
 * Mark that the user dismissed the update modal for a specific version
 * Called when user clicks "Later"
 */
export function dismissVersion(version: string): void {
	if (!browser) return;

	try {
		localStorage.setItem(DISMISSED_VERSION_KEY, version);
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
 * Always checks on app start (no rate limiting)
 * Only shows update if user hasn't dismissed this specific version
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

	try {
		const response = await fetch(GITHUB_RELEASES_API, {
			headers: {
				Accept: 'application/vnd.github.v3+json'
			}
		});

		if (!response.ok) {
			console.warn('Failed to fetch latest release:', response.status);
			return result;
		}

		const data = await response.json();
		const latestVersion = data.tag_name || data.name;

		if (latestVersion) {
			const cleanVersion = latestVersion.replace(/^v/, '');
			result.latestVersion = cleanVersion;

			// Check if newer AND not already dismissed by user
			const isNewer = isNewerVersion(APP_VERSION, latestVersion);
			const wasDismissed = wasVersionDismissed(cleanVersion);

			result.updateAvailable = isNewer && !wasDismissed;

			// Set direct APK download URL when update is available
			if (result.updateAvailable) {
				result.downloadUrl = buildApkDownloadUrl(latestVersion);
				console.log(`📱 Update available: ${APP_VERSION} → ${cleanVersion}`);
			}
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
