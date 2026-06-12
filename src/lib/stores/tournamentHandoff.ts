/**
 * One-shot in-memory handoff of a Tournament between routes.
 *
 * The admin tournament list already holds the full tournament docs; when the
 * user clicks a row, the detail page would otherwise show a spinner while
 * re-fetching the same doc from the server. The list deposits the tournament
 * here right before goto(), and the detail page paints it instantly, then
 * revalidates from the server in the background.
 *
 * Module-level (not persisted): survives exactly one client-side navigation,
 * which is all it is for. A hard reload simply falls back to the normal fetch.
 */
import type { Tournament } from '$lib/types/tournament';

let handoff: Tournament | null = null;

export function setTournamentHandoff(tournament: Tournament): void {
	handoff = tournament;
}

/** Returns the deposited tournament if it matches `id`, consuming it. */
export function takeTournamentHandoff(id: string): Tournament | null {
	const tournament = handoff;
	handoff = null;
	return tournament && tournament.id === id ? tournament : null;
}
