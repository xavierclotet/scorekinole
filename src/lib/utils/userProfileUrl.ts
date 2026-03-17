/**
 * Generates user profile URLs with optional tournament filter for doubles.
 */

interface UserIdentifier {
	userId?: string;
	userKey?: string;
}

interface PartnerIdentifier {
	userId?: string;
	userKey?: string;
}

/**
 * Build profile URL for a tournament participant.
 * - Uses `userKey` (6-char) when available, falls back to `userId` (Firebase UID)
 * - Appends `?tournament=` only for doubles tournaments
 */
export function getUserProfileUrl(
	user: UserIdentifier,
	options?: { isDoubles?: boolean; tournamentName?: string }
): string | null {
	const id = user.userKey || user.userId;
	if (!id) return null;

	const base = `/users/${id}`;
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
	const id = partner.userKey || partner.userId;
	if (!id) return null;

	const base = `/users/${id}`;
	if (tournamentName) {
		return `${base}?tournament=${encodeURIComponent(tournamentName)}`;
	}
	return base;
}
