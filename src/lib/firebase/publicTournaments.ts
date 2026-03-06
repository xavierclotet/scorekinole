/**
 * Firebase functions for public tournament browsing
 * No authentication required - public read access
 */

import { db, isFirebaseEnabled } from './config';
import type { Tournament, TournamentStatus, TournamentTier } from '$lib/types/tournament';
import { normalizeTier } from '$lib/types/tournament';
import {
	collection,
	getDoc,
	doc,
	query,
	orderBy,
	where,
	Timestamp,
	onSnapshot
} from 'firebase/firestore';
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
 * Subscribe to public tournaments in real-time
 * Returns an unsubscribe function
 *
 * @param yearFilter Optional year to filter server-side (reduces Firestore reads).
 *                   tournamentDate is stored as epoch ms (normalized via migration).
 */
export function subscribeToPublicTournaments(
	onUpdate: (tournaments: TournamentListItem[]) => void,
	onError?: (error: Error) => void,
	yearFilter?: number
): () => void {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled');
		onUpdate([]);
		return () => {};
	}

	try {
		const tournamentsRef = collection(db!, 'tournaments');
		const constraints = [orderBy('tournamentDate', 'asc')];

		if (yearFilter) {
			const startOfYear = new Date(yearFilter, 0, 1).getTime();
			const startOfNextYear = new Date(yearFilter + 1, 0, 1).getTime();
			constraints.push(
				where('tournamentDate', '>=', startOfYear),
				where('tournamentDate', '<', startOfNextYear)
			);
		}

		const q = query(tournamentsRef, ...constraints);

		const unsubscribe = onSnapshot(
			q,
			(snapshot) => {
				const tournaments: TournamentListItem[] = [];

				snapshot.forEach((docSnap) => {
					const data = docSnap.data() as Tournament;

					// Extract tournamentDate
					let tournamentDate: number | undefined;
					if (data.tournamentDate) {
						tournamentDate =
							data.tournamentDate instanceof Timestamp
								? data.tournamentDate.toMillis()
								: data.tournamentDate;
					}

					// Skip test tournaments from public view
					if (data.isTest === true) return;

					// Count active participants without allocating a filtered array
					let participantsCount = 0;
					if (data.participants) {
						for (const p of data.participants) {
							if (p.status === 'ACTIVE') participantsCount++;
						}
					}

					tournaments.push({
						id: docSnap.id,
						key: data.key || '',
						name: data.name,
						edition: data.edition,
						country: data.country,
						city: data.city,
						address: data.address,
						tournamentDate,
						status: data.status,
						gameType: data.gameType,
						participantsCount,
						tier: data.rankingConfig?.enabled ? data.rankingConfig.tier : undefined,
						createdAt:
							data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
						isImported: data.isImported,
						posterUrl: data.posterUrl
					});
				});

				// No sort here — the page applies its own sort via sortTournaments()
				// Real-time update received
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
