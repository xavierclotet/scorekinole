/**
 * Helper functions extracted from MatchPreviewDialog for testability.
 */

/**
 * Get initials from a player name.
 * Single word → first character. Multiple words → first + last initial.
 */
export function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
	return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Get the partner initials from a combined doubles name ("Player A / Player B").
 */
export function getPartnerInitials(combinedName: string): string {
	const parts = combinedName.split(' / ');
	if (parts.length >= 2) return getInitials(parts[1].trim());
	return '?';
}

/**
 * Determine whether the Play button should be shown (vs hammer selection buttons).
 *
 * When showHammer is true and the match is not resuming and not auto-alternating,
 * the user must pick who starts (hammer selection) — no separate Play button.
 */
export function shouldShowPlayButton(
	showHammer: boolean,
	isResuming: boolean,
	isAutoAlternate: boolean
): boolean {
	if (showHammer && !isResuming && !isAutoAlternate) {
		return false; // Hammer selection auto-starts the match
	}
	return true;
}

/**
 * Determine if a round in the RoundsPanel is editable.
 */
export function isRoundEditable(readonly: boolean, isGameCompleted: boolean): boolean {
	return !readonly && !isGameCompleted;
}

/**
 * Compute whether the RoundsPanel should be in readonly mode.
 *
 * This mirrors the game page template:
 *   readonly={tournamentMatchCompletedSent || !!lastTournamentResult}
 *
 * @param tournamentMatchCompletedSent - true after tournament match result has been sent
 * @param lastTournamentResult - the last tournament result object (null if none)
 */
export function isRoundsPanelReadonly(
	tournamentMatchCompletedSent: boolean,
	lastTournamentResult: unknown
): boolean {
	return tournamentMatchCompletedSent || !!lastTournamentResult;
}

/**
 * Determine the tournament match start route.
 *
 * Unified flow logic:
 * - 'preview': Always route through MatchPreviewDialog (rich: colors + hammer)
 * - 'autoHammer': Auto-apply hammer (alternate mode, skip dialog)
 * - 'hammerDialog': Fallback to plain HammerDialog (should not happen in unified flow)
 * - 'direct': No hammer needed, start directly
 *
 * @param hasMatchPreviewOptions - Whether MatchPreviewDialog already provided options
 * @param showHammer - Whether hammer selection is enabled for this match
 * @param hasExistingProgress - Whether the match has existing rounds/games (resuming)
 * @param isAutoAlternate - Whether auto-alternate mode is active with a starter ID
 */
export function determineMatchStartRoute(
	hasMatchPreviewOptions: boolean,
	showHammer: boolean,
	hasExistingProgress: boolean,
	isAutoAlternate: boolean
): 'preview' | 'autoHammer' | 'hammerDialog' | 'direct' {
	if (showHammer && !hasExistingProgress) {
		if (hasMatchPreviewOptions) return 'preview';
		if (isAutoAlternate) return 'autoHammer';
		return 'hammerDialog';
	}
	if (hasMatchPreviewOptions) return 'preview';
	if (!hasExistingProgress) return 'direct';
	return 'direct';
}

/**
 * Get the scorer name to display as a warning in MatchPreviewDialog.
 *
 * Returns the scorer's name only if the match is being scored by a DIFFERENT user.
 * Returns undefined if:
 * - There is no scorer
 * - The scorer is the current user (no need to warn about yourself)
 * - There is no current user (can't compare)
 */
export function getScorerWarningName(
	scoringBy: { userId: string; userName: string } | undefined | null,
	currentUserId: string | undefined | null
): string | undefined {
	if (!scoringBy) return undefined;
	if (scoringBy.userId === currentUserId) return undefined;
	return scoringBy.userName;
}

/**
 * Derive round points from the winner selection in TimeoutRoundModal.
 *
 * - Winner gets 2 points, loser gets 0
 * - Tie: both get 1
 * - null: no winner selected yet
 */
export function deriveTimeoutRoundPoints(roundWinner: 0 | 1 | 2 | null): {
	team1Points: number;
	team2Points: number;
	canAccept: boolean;
} {
	if (roundWinner === null) {
		return { team1Points: 0, team2Points: 0, canAccept: false };
	}
	return {
		team1Points: roundWinner === 1 ? 2 : roundWinner === 0 ? 1 : 0,
		team2Points: roundWinner === 2 ? 2 : roundWinner === 0 ? 1 : 0,
		canAccept: true
	};
}
