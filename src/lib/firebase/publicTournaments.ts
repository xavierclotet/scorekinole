/**
 * Firebase functions for public tournament browsing
 * No authentication required - public read access
 */

import { db, isFirebaseEnabled } from './config';
import type { Tournament, TournamentStatus, TournamentTier } from '$lib/types/tournament';
import { normalizeTier } from '$lib/types/tournament';
import { collection, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { browser } from '$app/environment';

/**
 * Minimal tournament info for listing display
 */
export interface TournamentListItem {
	id: string;
	key: string;
	name: string;
	edition?: number;
	country: string;
	city: string;
	address?: string;
	tournamentDate?: number;
	status: TournamentStatus;
	gameType: 'singles' | 'doubles';
	participantsCount: number;
	tier?: TournamentTier;
	createdAt: number;
	isImported?: boolean; // true for imported/upcoming tournaments
	posterUrl?: string; // URL to tournament poster/banner image
}

/**
 * Filter options for tournament listing
 */
export interface TournamentFilters {
	year?: number;
	country?: string;
	gameType?: 'singles' | 'doubles' | 'all';
	timeFilter?: 'all' | 'past' | 'future';
}



/**
 * Convert a Firestore Timestamp (duck-typed) or epoch number to epoch ms.
 * Summaries store plain numbers; the duck-typing is defensive.
 */
function toEpochMs(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof (value as { toMillis?: unknown }).toMillis === 'function'
	) {
		return (value as { toMillis: () => number }).toMillis();
	}
	return undefined;
}

/**
 * Subscribe to public tournaments in real-time.
 * Returns an unsubscribe function.
 *
 * Reads the lightweight /tournamentSummaries collection (a few hundred bytes
 * per tournament, maintained by the syncTournamentSummary Cloud Function)
 * instead of the full tournament docs, which embed participants, groups,
 * matches and brackets. The whole collection is small enough to load at once,
 * so year filtering happens client-side. Test tournaments never get a summary.
 */
export function subscribeToPublicTournaments(
	onUpdate: (tournaments: TournamentListItem[]) => void,
	onError?: (error: Error) => void
): () => void {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled');
		onUpdate([]);
		return () => {};
	}

	try {
		// No orderBy: sorting happens client-side (sortTournaments), and a
		// Firestore orderBy would silently exclude docs missing the field.
		const summariesRef = collection(db!, 'tournamentSummaries');

		const unsubscribe = onSnapshot(
			summariesRef,
			(snapshot) => {
				const tournaments: TournamentListItem[] = [];

				snapshot.forEach((docSnap) => {
					const data = docSnap.data();

					tournaments.push({
						id: docSnap.id,
						key: typeof data.key === 'string' ? data.key : '',
						name: data.name || '',
						edition: data.edition,
						country: data.country || '',
						city: data.city || '',
						address: data.address,
						tournamentDate: toEpochMs(data.tournamentDate),
						status: data.status,
						gameType: data.gameType,
						participantsCount: data.participantsCount ?? 0,
						tier: data.tier as TournamentTier | undefined,
						createdAt: toEpochMs(data.createdAt) ?? 0,
						isImported: data.isImported,
						posterUrl: data.posterUrl
					});
				});

				// No sort here — the page applies its own sort via sortTournaments()
				onUpdate(tournaments);
			},
			(error) => {
				console.error('❌ Error in tournament subscription:', error);
				onError?.(error);
			}
		);

		return unsubscribe;
	} catch (error) {
		console.error('❌ Error setting up tournament subscription:', error);
		onError?.(error instanceof Error ? error : new Error(String(error)));
		return () => {};
	}
}

/**
 * Sort tournaments: future first (ascending/closest first), then past (descending/most recent first)
 * Pure function, testable without Firebase
 */
export function sortTournaments(
	tournaments: TournamentListItem[],
	timeFilter: 'all' | 'past' | 'future' = 'all',
	now: number = Date.now()
): TournamentListItem[] {
	const sorted = [...tournaments];
	if (timeFilter === 'future') {
		sorted.sort((a, b) => (a.tournamentDate || 0) - (b.tournamentDate || 0));
	} else if (timeFilter === 'past') {
		sorted.sort((a, b) => (b.tournamentDate || 0) - (a.tournamentDate || 0));
	} else {
		sorted.sort((a, b) => {
			const aDate = a.tournamentDate || 0;
			const bDate = b.tournamentDate || 0;
			const aIsFuture = aDate > now;
			const bIsFuture = bDate > now;
			if (aIsFuture && !bIsFuture) return -1;
			if (!aIsFuture && bIsFuture) return 1;
			if (aIsFuture) return aDate - bDate;
			return bDate - aDate;
		});
	}
	return sorted;
}

/**
 * Filter tournaments based on filter criteria
 * Pure function, testable without Firebase
 */
export function filterTournaments(
	tournaments: TournamentListItem[],
	filters: TournamentFilters & { tier?: string },
	now: number = Date.now()
): TournamentListItem[] {
	return tournaments.filter(t => {
		// Exclude cancelled
		if (t.status === 'CANCELLED') return false;

		// Year filter
		if (filters.year && t.tournamentDate) {
			if (new Date(t.tournamentDate).getFullYear() !== filters.year) return false;
		}

		// Country filter
		if (filters.country && t.country !== filters.country) return false;

		// Game type filter
		if (filters.gameType && filters.gameType !== 'all' && t.gameType !== filters.gameType) return false;

		// Tier filter (normalize legacy tier names)
		if (filters.tier && filters.tier !== 'all' && (!t.tier || normalizeTier(t.tier) !== filters.tier)) return false;

		// Time filter
		if (filters.timeFilter && filters.timeFilter !== 'all' && t.tournamentDate) {
			if (filters.timeFilter === 'past' && t.tournamentDate > now) return false;
			if (filters.timeFilter === 'future' && t.tournamentDate <= now) return false;
		}

		return true;
	});
}

/**
 * Extract available years and countries from tournament data
 * Pure function, testable without Firebase
 */
export function extractFilterOptions(tournaments: TournamentListItem[]): {
	years: number[];
	countries: string[];
} {
	const years = new Set<number>();
	const countries = new Set<string>();

	for (const t of tournaments) {
		if (t.tournamentDate) {
			years.add(new Date(t.tournamentDate).getFullYear());
		}
		if (t.country) {
			countries.add(t.country);
		}
	}

	return {
		years: Array.from(years).sort((a, b) => b - a),
		countries: Array.from(countries).sort()
	};
}

/**
 * Get single tournament by ID for detail page
 * Public access - no auth required
 */
export async function getPublicTournament(id: string): Promise<Tournament | null> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled');
		return null;
	}

	try {
		const docRef = doc(db!, 'tournaments', id);
		const docSnap = await getDoc(docRef);

		if (!docSnap.exists()) {
			return null;
		}

		return {
			...docSnap.data(),
			id: docSnap.id
		} as Tournament;
	} catch (error) {
		console.error('❌ Error getting tournament:', error);
		return null;
	}
}
