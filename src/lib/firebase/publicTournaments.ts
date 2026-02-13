/**
 * Firebase functions for public tournament browsing
 * No authentication required - public read access
 */

import { db, isFirebaseEnabled } from './config';
import type { Tournament, TournamentStatus, TournamentTier } from '$lib/types/tournament';
import {
	collection,
	getDocs,
	getDoc,
	doc,
	query,
	orderBy,
	Timestamp,
	onSnapshot
} from 'firebase/firestore';
import { browser } from '$app/environment';

/**
 * Minimal tournament info for listing display
 */
export interface TournamentListItem {
	id: string;
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
 * Get all public tournaments with client-side filtering
 * Returns tournaments sorted by tournamentDate ascending (upcoming first)
 */
export async function getPublicTournaments(
	filters: TournamentFilters = {}
): Promise<TournamentListItem[]> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled');
		return [];
	}

	try {
		const tournamentsRef = collection(db!, 'tournaments');
		const q = query(tournamentsRef, orderBy('tournamentDate', 'asc'));
		const snapshot = await getDocs(q);

		const now = Date.now();
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

			// Apply filters
			// Year filter
			if (filters.year && tournamentDate) {
				const tournamentYear = new Date(tournamentDate).getFullYear();
				if (tournamentYear !== filters.year) return;
			}

			// Country filter
			if (filters.country && data.country !== filters.country) return;

			// Game type filter
			if (filters.gameType && filters.gameType !== 'all' && data.gameType !== filters.gameType)
				return;

			// Time filter (past/future)
			if (filters.timeFilter && filters.timeFilter !== 'all' && tournamentDate) {
				if (filters.timeFilter === 'past' && tournamentDate > now) return;
				if (filters.timeFilter === 'future' && tournamentDate <= now) return;
			}

			// Skip test tournaments from public view
			if (data.isTest === true) return;

			// Count active participants
			const participantsCount = data.participants?.filter((p) => p.status === 'ACTIVE').length || 0;

			tournaments.push({
				id: docSnap.id,
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

		// Sort: future tournaments first (by date asc), then past (by date desc)
		tournaments.sort((a, b) => {
			const aDate = a.tournamentDate || 0;
			const bDate = b.tournamentDate || 0;
			const aIsFuture = aDate > now;
			const bIsFuture = bDate > now;

			// Future tournaments come first
			if (aIsFuture && !bIsFuture) return -1;
			if (!aIsFuture && bIsFuture) return 1;

			// Within same category, sort appropriately
			if (aIsFuture && bIsFuture) {
				// Future: ascending (closest first)
				return aDate - bDate;
			} else {
				// Past: descending (most recent first)
				return bDate - aDate;
			}
		});

		console.log(`✅ Retrieved ${tournaments.length} public tournaments`);
		return tournaments;
	} catch (error) {
		console.error('❌ Error getting public tournaments:', error);
		return [];
	}
}

/**
 * Subscribe to public tournaments in real-time
 * Returns an unsubscribe function
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
		const tournamentsRef = collection(db!, 'tournaments');
		const q = query(tournamentsRef, orderBy('tournamentDate', 'asc'));

		const unsubscribe = onSnapshot(
			q,
			(snapshot) => {
				const now = Date.now();
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

					// Count active participants
					const participantsCount =
						data.participants?.filter((p) => p.status === 'ACTIVE').length || 0;

					tournaments.push({
						id: docSnap.id,
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

				// Sort: future tournaments first (by date asc), then past (by date desc)
				tournaments.sort((a, b) => {
					const aDate = a.tournamentDate || 0;
					const bDate = b.tournamentDate || 0;
					const aIsFuture = aDate > now;
					const bIsFuture = bDate > now;

					// Future tournaments come first
					if (aIsFuture && !bIsFuture) return -1;
					if (!aIsFuture && bIsFuture) return 1;

					// Within same category, sort appropriately
					if (aIsFuture && bIsFuture) {
						// Future: ascending (closest first)
						return aDate - bDate;
					} else {
						// Past: descending (most recent first)
						return bDate - aDate;
					}
				});

				console.log(`✅ Real-time update: ${tournaments.length} public tournaments`);
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
 * Get available years from tournaments (for year filter dropdown)
 */
export async function getAvailableTournamentYears(): Promise<number[]> {
	if (!browser || !isFirebaseEnabled()) {
		return [new Date().getFullYear()];
	}

	try {
		const tournamentsRef = collection(db!, 'tournaments');
		const snapshot = await getDocs(tournamentsRef);

		const years = new Set<number>();
		snapshot.forEach((docSnap) => {
			const data = docSnap.data();
			if (data.tournamentDate) {
				const date =
					data.tournamentDate instanceof Timestamp
						? data.tournamentDate.toMillis()
						: data.tournamentDate;
				years.add(new Date(date).getFullYear());
			}
		});

		// Sort descending (newest first)
		return Array.from(years).sort((a, b) => b - a);
	} catch (error) {
		console.error('❌ Error getting tournament years:', error);
		return [new Date().getFullYear()];
	}
}

/**
 * Get available countries from tournaments (for country filter dropdown)
 */
export async function getAvailableTournamentCountries(): Promise<string[]> {
	if (!browser || !isFirebaseEnabled()) {
		return [];
	}

	try {
		const tournamentsRef = collection(db!, 'tournaments');
		const snapshot = await getDocs(tournamentsRef);

		const countries = new Set<string>();
		snapshot.forEach((docSnap) => {
			const data = docSnap.data();
			if (data.country) {
				countries.add(data.country);
			}
		});

		return Array.from(countries).sort();
	} catch (error) {
		console.error('❌ Error getting tournament countries:', error);
		return [];
	}
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
