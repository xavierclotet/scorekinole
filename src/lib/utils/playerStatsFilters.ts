/**
 * Pure helpers for the player-profile match filters.
 * No Svelte dependencies — fully unit-testable.
 */

import type { MatchHistory } from '$lib/types/history';

/**
 * Distinct years that actually have matches, newest first.
 *
 * `startTime` is typed as `number` but can arrive as `undefined`/`NaN` for
 * imported tournaments that carry no start/completed/updated timestamp
 * (`startTime = match.startedAt ?? completedAt` in firestore.ts). Those would
 * otherwise surface a `NaN` entry in the year dropdown, so we drop them here.
 */
export function getMatchYears(matches: MatchHistory[]): number[] {
	const years = new Set<number>();
	for (const match of matches) {
		const year = new Date(match.startTime).getFullYear();
		if (Number.isFinite(year)) years.add(year);
	}
	return Array.from(years).sort((a, b) => b - a);
}

/**
 * Default value for the year filter when the profile first loads.
 *
 * Historically this defaulted to the current calendar year, which meant a
 * player with no matches *this* year opened to a blank profile (empty list,
 * zeroed stats, empty charts) even with a rich history in prior years.
 *
 * Rules:
 *  - A tournament-specific view (`?tournament=...`) shows all years so the
 *    requested event is never filtered out by year.
 *  - Otherwise prefer the current year when it has matches (keeps the
 *    "current season" default for active players)...
 *  - ...and fall back to the most recent year that actually has matches.
 *  - No matches at all → all years (empty string).
 */
export function pickDefaultYearFilter(
	matches: MatchHistory[],
	currentYear: number,
	hasTournamentFilter: boolean,
): string {
	if (hasTournamentFilter) return '';

	const years = getMatchYears(matches);
	if (years.length === 0) return '';
	if (years.includes(currentYear)) return String(currentYear);

	// years is sorted newest-first, so index 0 is the most recent year with data.
	return String(years[0]);
}
