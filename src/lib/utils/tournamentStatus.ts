import type { TournamentStatus } from '$lib/types/tournament';

/**
 * Whether a saved tournament key should be cleared when the user tries to
 * join a tournament with this status.
 *
 * "Active" — keep the key — means the tournament is in any phase where the
 * user could still legitimately play matches (or is between phases waiting
 * for the bracket). Only definitively-finished or not-yet-playable states
 * cause the key to be wiped, forcing a fresh prompt.
 *
 * Deny-list (kept consistent across `/game` join flow and the
 * TournamentMatchModal saved-key check) so adding a new in-flight status
 * later does not silently start clearing keys.
 */
const FINISHED_OR_NOT_PLAYABLE: readonly TournamentStatus[] = [
	'COMPLETED',
	'CANCELLED',
	'DRAFT'
];

export function shouldClearSavedTournamentKey(status: TournamentStatus): boolean {
	return FINISHED_OR_NOT_PLAYABLE.includes(status);
}

export function isTournamentKeyStillValid(status: TournamentStatus): boolean {
	return !shouldClearSavedTournamentKey(status);
}
