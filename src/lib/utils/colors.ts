/**
 * Color utility functions
 */

/**
 * Check if a color is dark and needs a light background for readability
 * Returns true for very dark colors (almost black) that need a light background
 * @param color - Hex color string (with or without #)
 * @returns true if the color is very dark, false otherwise
 */
export function isColorDark(color: string | undefined): boolean {
	// Handle undefined or empty colors
	if (!color) {
		return false;
	}

	const hex = color.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);

	// Simple brightness formula: check if all RGB components are low
	// Only flag as "needs background" if it's truly dark (close to black)
	const brightness = (r + g + b) / 3;

	// Also check if it's a very dark blue/navy (low brightness but high blue component)
	const isDarkBlue = b > r && b > g && brightness < 80;

	return brightness < 60 || isDarkBlue;
}

/**
 * Calculate the luminance of a color
 * @param color - Hex color string (with or without #)
 * @returns Luminance value between 0 (dark) and 1 (light)
 */
export function getLuminance(color: string | undefined): number {
	// Handle undefined or empty colors - return neutral luminance
	if (!color) {
		return 0.5;
	}

	const hex = color.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);

	// Calculate relative luminance using the standard formula
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Get contrasting text color (black or white) for a given background color
 * @param backgroundColor - Hex color string (with or without #)
 * @returns '#000000' for light backgrounds, '#ffffff' for dark backgrounds
 */
export function getContrastColor(backgroundColor: string | undefined): string {
	// Handle undefined or empty colors - return black as default
	if (!backgroundColor) {
		return '#000000';
	}

	return getLuminance(backgroundColor) > 0.5 ? '#000000' : '#ffffff';
}
