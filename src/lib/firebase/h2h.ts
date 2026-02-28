/**
 * Head-to-head query module for friendly matches.
 * Queries Firestore to find historical matches between specific player pairs.
 */

import { db, isFirebaseEnabled } from './config';
import { browser } from '$app/environment';
import type { MatchHistory } from '$lib/types/history';
import type { H2HRecord } from '$lib/algorithms/probability';
import { matchToPerformance } from '$lib/algorithms/probability';
import { getProbabilityKey } from '$lib/utils/tournamentProbability';
import {
	collection,
	getDocs,
	query,
	where
} from 'firebase/firestore';

/**
 * Query Firestore for H2H records between multiple player pairs.
 * Uses existing indexes (players.team1.userId + status).
 *
 * @param userIdPairs Array of [userIdA, userIdB] pairs to query
 * @returns Map keyed by sorted userId pair → H2HRecord (from first userId's perspective)
 */
export async function getH2HFromFriendlyMatches(
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

	// Query all pairs in parallel
	const promises = Array.from(uniquePairs.entries()).map(async ([key, [userA, userB]]) => {
		try {
			const matches = await queryMatchesBetween(userA, userB);
			if (matches.length > 0) {
				const performanceScores = matches.map((match) => {
					const isATeam1 = match.players?.team1?.userId === userA;
					const score1 = match.team1Score ?? 0;
					const score2 = match.team2Score ?? 0;
					return isATeam1
						? matchToPerformance(score1, score2)
						: matchToPerformance(score2, score1);
				});
				result.set(key, {
					totalMatches: matches.length,
					performanceScores
				});
			}
		} catch (err) {
			console.warn(`H2H query failed for ${key}:`, err);
		}
	});

	await Promise.all(promises);
	return result;
}

/**
 * Query friendly matches between two specific users.
 * Uses existing Firestore indexes (no composite index needed).
 */
async function queryMatchesBetween(userIdA: string, userIdB: string): Promise<MatchHistory[]> {
	const matchesRef = collection(db!, 'matches');
	const matchesMap = new Map<string, MatchHistory>();

	// Query 1: A as team1, filter for B as team2
	try {
		const q1 = query(
			matchesRef,
			where('players.team1.userId', '==', userIdA),
			where('status', '==', 'active')
		);
		const snapshot1 = await getDocs(q1);
		snapshot1.forEach((docSnap) => {
			const data = docSnap.data() as MatchHistory;
			if (data.players?.team2?.userId === userIdB) {
				matchesMap.set(docSnap.id, { ...data, id: docSnap.id });
			}
		});
	} catch (err: any) {
		console.warn('H2H query A-as-team1 failed:', err.message);
	}

	// Query 2: B as team1, filter for A as team2
	try {
		const q2 = query(
			matchesRef,
			where('players.team1.userId', '==', userIdB),
			where('status', '==', 'active')
		);
		const snapshot2 = await getDocs(q2);
		snapshot2.forEach((docSnap) => {
			const data = docSnap.data() as MatchHistory;
			if (data.players?.team2?.userId === userIdA) {
				matchesMap.set(docSnap.id, { ...data, id: docSnap.id });
			}
		});
	} catch (err: any) {
		console.warn('H2H query B-as-team1 failed:', err.message);
	}

	return Array.from(matchesMap.values());
}
