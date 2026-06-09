/**
 * Whether a team's score can be decremented one point.
 *
 * Points belonging to COMPLETED rounds (the lastRoundPoints baseline) can
 * only be reverted by undoing the whole round — the swipe-down at the exact
 * boundary in TeamCard. Allowing partial decrements below the baseline
 * desynced round detection and produced rounds with negative points that
 * were synced verbatim to Firestore in tournament mode.
 *
 * Only points added during the current (in-progress) round are decrementable.
 */
export function canDecrementScore(teamPoints: number, teamBaseline: number): boolean {
	return teamPoints > teamBaseline;
}
