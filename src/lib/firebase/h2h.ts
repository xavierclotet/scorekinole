/**
 * Head-to-head query module for cross-tournament data.
 * Queries previous tournaments where both players participated
 * and extracts H2H match data between them.
 */

import { db, isFirebaseEnabled } from './config';
import { browser } from '$app/environment';
import { getTournament } from './tournaments';
import { getUserProfileById } from './userProfile';
import type { H2HRecord } from '$lib/algorithms/probability';
import { extractH2HFromTournament, mergeH2HRecords } from '$lib/algorithms/probability';
import { getProbabilityKey } from '$lib/utils/tournamentProbability';

/**
 * Get H2H records from previous tournaments where both players participated.
 * For each userId pair, finds common tournaments, fetches them, and extracts H2H.
 *
 * @param userIdPairs Array of [userIdA, userIdB] pairs to query
 * @returns Map keyed by sorted userId pair → H2HRecord (from first userId's perspective)
 */
export async function getH2HFromPreviousTournaments(
	userIdPairs: Array<[string, string]>
): Promise<Map<string, H2HRecord>> {
	const result = new Map<string, H2HRecord>();

	if (!browser || !isFirebaseEnabled() || !db || userIdPairs.length === 0) {
		return result;
	}

	// Deduplicate pairs
	const uniquePairs = new Map<string, [string, string]>();
	for (const [a, b] of userIdPairs) {
		const key = getProbabilityKey(a, b);
		if (!uniquePairs.has(key)) {
			uniquePairs.set(key, a < b ? [a, b] : [b, a]);
		}
	}

	// 1. Collect all unique userIds and fetch their profiles
	const allUserIds = new Set<string>();
	for (const [a, b] of uniquePairs.values()) {
		allUserIds.add(a);
		allUserIds.add(b);
	}

	const profileMap = new Map<string, { tournamentIds: Set<string> }>();
	await Promise.all(
		Array.from(allUserIds).map(async (userId) => {
			try {
				const profile = await getUserProfileById(userId);
				if (profile?.tournaments?.length) {
					profileMap.set(userId, {
						tournamentIds: new Set(profile.tournaments.map((t) => t.tournamentId))
					});
				}
			} catch (err) {
				console.warn(`H2H: failed to fetch profile for ${userId}:`, err);
			}
		})
	);

	// 2. For each pair, find common tournament IDs
	const tournamentIdsToPairs = new Map<string, Array<[string, string, string]>>(); // tournamentId → [[key, userA, userB]]
	for (const [key, [userA, userB]] of uniquePairs) {
		const profileA = profileMap.get(userA);
		const profileB = profileMap.get(userB);
		if (!profileA || !profileB) continue;

		for (const tid of profileA.tournamentIds) {
			if (profileB.tournamentIds.has(tid)) {
				if (!tournamentIdsToPairs.has(tid)) {
					tournamentIdsToPairs.set(tid, []);
				}
				tournamentIdsToPairs.get(tid)!.push([key, userA, userB]);
			}
		}
	}

	if (tournamentIdsToPairs.size === 0) return result;

	// 3. Fetch unique tournament documents
	const tournamentCache = new Map<string, Awaited<ReturnType<typeof getTournament>>>();
	await Promise.all(
		Array.from(tournamentIdsToPairs.keys()).map(async (tid) => {
			try {
				const tournament = await getTournament(tid);
				if (tournament) {
					tournamentCache.set(tid, tournament);
				}
			} catch (err) {
				console.warn(`H2H: failed to fetch tournament ${tid}:`, err);
			}
		})
	);

	// 4. Extract H2H from each common tournament
	for (const [tid, pairs] of tournamentIdsToPairs) {
		const tournament = tournamentCache.get(tid);
		if (!tournament) continue;

		// Build userId → participantId mapping for this tournament
		const userToParticipant = new Map<string, string>();
		for (const p of tournament.participants) {
			if (p.userId) {
				userToParticipant.set(p.userId, p.id);
			}
		}

		for (const [key, userA, userB] of pairs) {
			const participantA = userToParticipant.get(userA);
			const participantB = userToParticipant.get(userB);
			if (!participantA || !participantB) continue;

			const h2h = extractH2HFromTournament(tournament, participantA, participantB);
			if (h2h) {
				// Merge with any existing H2H for this pair (from other tournaments)
				const existing = result.get(key);
				const merged = mergeH2HRecords(existing, h2h);
				if (merged) {
					result.set(key, merged);
				}
			}
		}
	}

	return result;
}
