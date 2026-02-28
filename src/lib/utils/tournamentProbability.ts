/**
 * Tournament-level probability computation helper.
 * Computes win probabilities for all pending matches in a tournament.
 */

import type {
	Tournament,
	GroupMatch,
	BracketMatch
} from '$lib/types/tournament';
import type { WinProbability, H2HRecord } from '$lib/algorithms/probability';
import {
	calculateWinProbability,
	extractH2HFromTournament,
	mergeH2HRecords
} from '$lib/algorithms/probability';

/**
 * Generate a stable key for a participant pair (sorted alphabetically).
 */
export function getProbabilityKey(idA: string, idB: string): string {
	return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

/**
 * Look up the probability for a specific match, oriented correctly for A and B.
 */
export function getMatchProbability(
	map: Map<string, WinProbability>,
	participantAId: string,
	participantBId: string
): WinProbability | null {
	const key = getProbabilityKey(participantAId, participantBId);
	const prob = map.get(key);
	if (!prob) return null;

	// If the key is ordered as A:B, return as-is
	// If the key is ordered as B:A, flip the probabilities
	if (participantAId < participantBId) {
		return prob;
	} else {
		return {
			...prob,
			probabilityA: prob.probabilityB,
			probabilityB: prob.probabilityA
		};
	}
}

/**
 * Compute win probabilities for all pending matches in a tournament.
 *
 * @param tournament The tournament document (already loaded)
 * @param firestoreH2H Optional H2H from friendly matches (async, keyed by sorted userId pair)
 * @returns Map of probability key → WinProbability
 */
export function computeTournamentProbabilities(
	tournament: Tournament,
	firestoreH2H?: Map<string, H2HRecord>
): Map<string, WinProbability> {
	const probabilities = new Map<string, WinProbability>();
	const participantMap = new Map(tournament.participants.map((p) => [p.id, p]));

	// Build userId → participantId mapping for Firestore H2H lookup
	const userIdToParticipantId = new Map<string, string>();
	for (const p of tournament.participants) {
		if (p.userId) {
			userIdToParticipantId.set(p.userId, p.id);
		}
	}
	const participantIdToUserId = new Map<string, string>();
	for (const p of tournament.participants) {
		if (p.userId) {
			participantIdToUserId.set(p.id, p.userId);
		}
	}

	// Collect all pending match pairs
	const pendingPairs = new Set<string>();

	// Group stage
	if (tournament.groupStage?.groups) {
		for (const group of tournament.groupStage.groups) {
			const matches = group.schedule
				? group.schedule.flatMap((r) => r.matches)
				: group.pairings
					? group.pairings.flatMap((p) => p.matches)
					: [];

			for (const match of matches) {
				if (match.status === 'PENDING' && match.participantA && match.participantB && match.participantB !== 'BYE') {
					pendingPairs.add(getProbabilityKey(match.participantA, match.participantB));
				}
			}
		}
	}

	// Bracket stage - all bracket types
	collectPendingBracketPairs(tournament.finalStage?.goldBracket?.rounds, pendingPairs);
	collectPendingBracketPairs(tournament.finalStage?.silverBracket?.rounds, pendingPairs);

	if (tournament.finalStage?.goldBracket?.thirdPlaceMatch) {
		addPendingMatch(tournament.finalStage.goldBracket.thirdPlaceMatch, pendingPairs);
	}
	if (tournament.finalStage?.silverBracket?.thirdPlaceMatch) {
		addPendingMatch(tournament.finalStage.silverBracket.thirdPlaceMatch, pendingPairs);
	}

	// Consolation brackets
	for (const bracket of [tournament.finalStage?.goldBracket, tournament.finalStage?.silverBracket]) {
		if (bracket?.consolationBrackets) {
			for (const consolation of bracket.consolationBrackets) {
				collectPendingBracketPairs(consolation.rounds, pendingPairs);
			}
		}
	}

	// Parallel brackets
	if (tournament.finalStage?.parallelBrackets) {
		for (const named of tournament.finalStage.parallelBrackets) {
			collectPendingBracketPairs(named.bracket?.rounds, pendingPairs);
			if (named.bracket?.thirdPlaceMatch) {
				addPendingMatch(named.bracket.thirdPlaceMatch, pendingPairs);
			}
			if (named.bracket?.consolationBrackets) {
				for (const consolation of named.bracket.consolationBrackets) {
					collectPendingBracketPairs(consolation.rounds, pendingPairs);
				}
			}
		}
	}

	// Compute probability for each pending pair
	for (const key of pendingPairs) {
		const [idA, idB] = key.split(':');
		if (idA === idB) continue;
		const participantA = participantMap.get(idA);
		const participantB = participantMap.get(idB);

		if (!participantA || !participantB) continue;

		// Source 1: Tournament-local H2H
		const tournamentH2H = extractH2HFromTournament(tournament, idA, idB);

		// Source 2: Firestore friendly match H2H (if available, keyed by userId pair)
		let friendlyH2H: H2HRecord | null = null;
		if (firestoreH2H) {
			const userIdA = participantIdToUserId.get(idA);
			const userIdB = participantIdToUserId.get(idB);
			if (userIdA && userIdB) {
				const userKey = getProbabilityKey(userIdA, userIdB);
				const record = firestoreH2H.get(userKey);
				if (record) {
					// Ensure the record is oriented correctly (from A's perspective)
					if (userIdA < userIdB) {
						friendlyH2H = record;
					} else {
						// Flip performance scores
						friendlyH2H = {
							totalMatches: record.totalMatches,
							performanceScores: record.performanceScores.map((s) => 1 - s)
						};
					}
				}
			}
		}

		// Merge all H2H sources
		const mergedH2H = mergeH2HRecords(tournamentH2H, friendlyH2H);

		// Rankings
		const rankA = participantA.rankingSnapshot ?? 0;
		const rankB = participantB.rankingSnapshot ?? 0;

		const probability = calculateWinProbability(rankA, rankB, mergedH2H);
		probabilities.set(key, probability);
	}

	return probabilities;
}

/**
 * Get unique userId pairs from pending matches (for Firestore H2H queries).
 */
export function getPendingUserIdPairs(tournament: Tournament): Array<[string, string]> {
	const pairs = new Set<string>();
	const participantMap = new Map(tournament.participants.map((p) => [p.id, p]));

	const addPair = (idA: string, idB: string) => {
		const pA = participantMap.get(idA);
		const pB = participantMap.get(idB);
		if (pA?.userId && pB?.userId) {
			const key = getProbabilityKey(pA.userId, pB.userId);
			pairs.add(key);
		}
	};

	// Group stage
	if (tournament.groupStage?.groups) {
		for (const group of tournament.groupStage.groups) {
			const matches = group.schedule
				? group.schedule.flatMap((r) => r.matches)
				: group.pairings
					? group.pairings.flatMap((p) => p.matches)
					: [];

			for (const match of matches) {
				if (match.status === 'PENDING' && match.participantA && match.participantB && match.participantB !== 'BYE') {
					addPair(match.participantA, match.participantB);
				}
			}
		}
	}

	// Bracket stage
	const collectFromBracket = (rounds?: { matches: BracketMatch[] }[]) => {
		if (!rounds) return;
		for (const round of rounds) {
			for (const match of round.matches) {
				if (match.status === 'PENDING' && match.participantA && match.participantB) {
					addPair(match.participantA, match.participantB);
				}
			}
		}
	};

	collectFromBracket(tournament.finalStage?.goldBracket?.rounds);
	collectFromBracket(tournament.finalStage?.silverBracket?.rounds);

	return Array.from(pairs).map((key) => key.split(':') as [string, string]);
}

// --- Internal Helpers ---

function collectPendingBracketPairs(
	rounds: { matches: BracketMatch[] }[] | undefined,
	pairs: Set<string>
): void {
	if (!rounds) return;
	for (const round of rounds) {
		for (const match of round.matches) {
			addPendingMatch(match, pairs);
		}
	}
}

function addPendingMatch(match: BracketMatch, pairs: Set<string>): void {
	if (match.status === 'PENDING' && match.participantA && match.participantB) {
		pairs.add(getProbabilityKey(match.participantA, match.participantB));
	}
}
