import { browser } from '$app/environment';

/**
 * Trigger device vibration if supported
 * @param duration - Duration in milliseconds
 */
export function vibrate(duration: number = 10): void {
	if (!browser) return;

	if ('vibrate' in navigator) {
		navigator.vibrate(duration);
	}
}

/**
 * Vibrate with a pattern
 * @param pattern - Array of durations [vibrate, pause, vibrate, pause, ...]
 */
export function vibratePattern(pattern: number[]): void {
	if (!browser) return;

	if ('vibrate' in navigator) {
		navigator.vibrate(pattern);
	}
}

/**
 * Cancel ongoing vibration
 */
export function cancelVibration(): void {
	if (!browser) return;

	if ('vibrate' in navigator) {
		navigator.vibrate(0);
	}
}
