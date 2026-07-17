/**
 * Counter scoring mode helpers.
 *
 * A simplified friendly-match mode: two independent per-team scores, each tap
 * adds a fixed increment, and the first team to reach the target score wins
 * immediately — no minimum lead required (unlike points mode). No hammer, no
 * 20s, no per-round tracking. See docs/en/COUNTER_SCORING_MODE.md.
 */

/**
 * Decide the winner of a counter-mode game from the two running scores.
 *
 * Returns 1 or 2 for the team that has reached (or exceeded) the target, or
 * null if neither has. Since scoring is applied to one team at a time, at most
 * one team crosses per tap; the both-reached branch is purely defensive and
 * awards the win to the higher score (ties resolve to team 1).
 */
export function getCounterWinner(
	team1Points: number,
	team2Points: number,
	target: number
): 1 | 2 | null {
	const t1Reached = team1Points >= target;
	const t2Reached = team2Points >= target;

	if (!t1Reached && !t2Reached) return null;
	if (t1Reached && !t2Reached) return 1;
	if (t2Reached && !t1Reached) return 2;
	return team2Points > team1Points ? 2 : 1;
}

/**
 * Whether to auto-assign the logged-in user to Team 1 in counter mode.
 *
 * Counter is a lightweight scoreboard where users don't tap the "+" assign
 * button, so a logged-in user's match would never be credited to anyone and
 * would never persist to `/matches`. When counter is active, auth is ready, a
 * user is logged in, and NEITHER team has an assigned user yet, we attribute
 * the match to that user (Team 1) so it saves and appears in admin + stats.
 */
export function shouldAutoAssignCounterUser(
	isCounterMode: boolean,
	authInitialized: boolean,
	hasLoggedInUser: boolean,
	team1HasUser: boolean,
	team2HasUser: boolean
): boolean {
	return isCounterMode && authInitialized && hasLoggedInUser && !team1HasUser && !team2HasUser;
}
