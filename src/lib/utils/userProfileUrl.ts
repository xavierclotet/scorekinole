/**
 * Generates user profile URLs with optional tournament filter for doubles.
 *
 * URL scheme (StackOverflow-style slug + key):
 * - `/users/xavi-clotet-4A7ZV2` — friendly form: name slug + 6-char user key.
 *   Only the trailing key is used to resolve the user; the slug is cosmetic,
 *   so renames never break shared links.
 * - `/users/4A7ZV2` — bare key (legacy links keep working).
 * - `/users/<firebase-uid>` — fallback for profiles without a key.
 */

interface UserIdentifier {
	name?: string;
	userId?: string;
	userKey?: string;
}

interface PartnerIdentifier {
	name?: string;
	userId?: string;
	userKey?: string;
}

/**
 * Slugify a player name for use in profile URLs:
 * lowercase, diacritics stripped, anything non-alphanumeric collapsed to "-".
 * Returns '' when nothing usable remains (e.g. emoji-only names).
 */
export function slugifyPlayerName(name: string): string {
	return name
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // strip combining diacritics (á → a, ñ → n)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
		.replace(/-+$/g, '');
}

/**
 * Build the /users/[id] route param for a user.
 * - With a key: `slug-KEY` (or bare `KEY` if the name yields no slug)
 * - Without a key: the Firebase UID (slug omitted — the UID is the only resolvable token)
 * - Returns null when there is nothing to link to.
 */
export function buildUserProfileParam(
	name: string | undefined | null,
	userKey: string | undefined | null,
	userId?: string | null
): string | null {
	if (userKey) {
		const slug = name ? slugifyPlayerName(name) : '';
		return slug ? `${slug}-${userKey}` : userKey;
	}
	return userId || null;
}

/**
 * Extract the 6-char user key from a /users/[id] route param.
 * Matches both `xavi-clotet-4A7ZV2` (trailing token) and bare `4A7ZV2`.
 * Returns null for anything else (e.g. a Firebase UID — 20+ chars, no dashes).
 */
export function extractUserKeyFromParam(param: string): string | null {
	const match = param.match(/(?:^|-)([A-Za-z0-9]{6})$/);
	return match ? match[1] : null;
}

/**
 * Build profile URL for a tournament participant.
 * - Uses `userKey` (6-char) when available — with a name slug prefix — falls back to `userId`
 * - Appends `?tournament=` only for doubles tournaments
 */
export function getUserProfileUrl(
	user: UserIdentifier,
	options?: { isDoubles?: boolean; tournamentName?: string }
): string | null {
	const param = buildUserProfileParam(user.name, user.userKey, user.userId);
	if (!param) return null;

	const base = `/users/${param}`;
	if (options?.isDoubles && options.tournamentName) {
		return `${base}?tournament=${encodeURIComponent(options.tournamentName)}`;
	}
	return base;
}

/**
 * Build profile URL for a partner in a doubles tournament.
 */
export function getPartnerProfileUrl(
	partner: PartnerIdentifier,
	tournamentName?: string
): string | null {
	const param = buildUserProfileParam(partner.name, partner.userKey, partner.userId);
	if (!param) return null;

	const base = `/users/${param}`;
	if (tournamentName) {
		return `${base}?tournament=${encodeURIComponent(tournamentName)}`;
	}
	return base;
}
