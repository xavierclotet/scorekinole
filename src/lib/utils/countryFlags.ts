/**
 * Country flag utilities.
 * Uses waving flag icons from flagcdn.com for cross-platform support
 * (emoji flags don't render on Windows).
 * Non-standard codes (e.g. CAT) use local SVGs in /flags/.
 */

/** Local SVG overrides for non-standard country codes */
const LOCAL_FLAGS: Record<string, string> = {
	'CAT': '/flags/cat.svg',
};

/** Available waving flag sizes (width x height, 4:3 aspect ratio) */
type FlagSize = '16x12' | '24x18' | '32x24' | '48x36' | '64x48';

/**
 * Get waving flag image URL for a country code.
 * @param countryCode ISO 3166-1 alpha-2 code (or CAT for Catalonia)
 * @param size Waving flag size (default: 24x18 for inline use)
 */
export function getFlagUrl(countryCode: string, size: FlagSize = '24x18'): string {
	const code = countryCode.toUpperCase();
	if (LOCAL_FLAGS[code]) return LOCAL_FLAGS[code];
	return `https://flagcdn.com/${size}/${code.toLowerCase()}.png`;
}
