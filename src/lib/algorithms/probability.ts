/**
 * Win probability calculation between tournament participants
 * Uses Bradley-Terry model (Elo equivalent) with margin-of-victory support
 */

import type {
	Tournament,
	TournamentParticipant,
	GroupMatch,
	BracketMatch,
	GroupStanding
} from '$lib/types/tournament';

// --- Types ---

export interface WinProbability {
	probabilityA: number; // 0.0 to 1.0
	probabilityB: number; // 1.0 - probabilityA
	confidence: 'high' | 'medium' | 'low' | 'none';
	source: 'direct_h2h' | 'ranking' | 'mixed';
	directMatches: number;
}

export interface H2HRecord {
	totalMatches: number;
	performanceScores: number[]; // Performance per match (0.0 to 1.0, from A's perspective)
}

// --- Constants ---

/** Minimum matches to show probability indicator */
export const MIN_MATCHES_TO_SHOW = 1;

/** Number of direct matches for full H2H weight (no ranking blend) */
const FULL_H2H_WEIGHT_THRESHOLD = 5;

// --- Color Coding ---

/**
 * Get color for a probability value.
 * >75: strong green, >50: green, >40: orange, <=40: red
 * Works for both the "favored" and "underdog" side.
 */
export function probabilityColor(pct: number): string {
	if (pct >= 75) return '#059669'; // strong green (emerald-600)
	if (pct > 50) return '#10b981'; // green (emerald-500)
	if (pct > 40) return '#f59e0b'; // orange/amber
	return '#ef4444'; // red
}

// --- Core Functions ---

/**
 * Convert ranking points to win probability using Bradley-Terry/Elo formula.
 * P(A wins) = 1 / (1 + 10^((rankB - rankA) / 400))
 */
export function rankingToProbability(rankA: number, rankB: number): number {
	if (rankA === 0 && rankB === 0) return 0.5;
	return 1 / (1 + Math.pow(10, (rankB - rankA) / 400));
}

/**
 * Convert match score to performance score (includes margin of victory).
 * 8-0 → 1.0, 5-3 → 0.625, 4-4 → 0.5, 3-5 → 0.375, 0-8 → 0.0
 */
export function matchToPerformance(pointsA: number, pointsB: number): number {
	const total = pointsA + pointsB;
	if (total === 0) return 0.5;
	return pointsA / total;
}

/**
 * Calculate win probability between two participants.
 * Blends direct H2H (with margin of victory) and ranking-based probability.
 */
export function calculateWinProbability(
	rankA: number,
	rankB: number,
	h2h: H2HRecord | null
): WinProbability {
	const pRanking = rankingToProbability(rankA, rankB);
	const hasRanking = rankA > 0 || rankB > 0;

	// No H2H data: use ranking only
	if (!h2h || h2h.totalMatches === 0) {
		if (!hasRanking) {
			return {
				probabilityA: 0.5,
				probabilityB: 0.5,
				confidence: 'none',
				source: 'ranking',
				directMatches: 0
			};
		}
		return {
			probabilityA: pRanking,
			probabilityB: 1 - pRanking,
			confidence: 'low',
			source: 'ranking',
			directMatches: 0
		};
	}

	// H2H exists: compute average performance with Laplace smoothing
	const sumPerformance = h2h.performanceScores.reduce((sum, p) => sum + p, 0);
	// Laplace smoothing: add one 0.5 observation to avoid 0% or 100%
	const pH2H = (sumPerformance + 0.5) / (h2h.totalMatches + 1);

	// Blend H2H with ranking based on sample size
	const h2hWeight = Math.min(1, h2h.totalMatches / FULL_H2H_WEIGHT_THRESHOLD);

	let pFinal: number;
	let source: WinProbability['source'];

	if (h2hWeight >= 1) {
		// Enough H2H data: use H2H only
		pFinal = pH2H;
		source = 'direct_h2h';
	} else if (hasRanking) {
		// Blend H2H with ranking
		pFinal = h2hWeight * pH2H + (1 - h2hWeight) * pRanking;
		source = 'mixed';
	} else {
		// No ranking, only H2H
		pFinal = pH2H;
		source = 'direct_h2h';
	}

	// Determine confidence
	let confidence: WinProbability['confidence'];
	if (h2h.totalMatches >= 5) {
		confidence = 'high';
	} else if (h2h.totalMatches >= 3) {
		confidence = 'medium';
	} else {
		confidence = 'low';
	}

	return {
		probabilityA: pFinal,
		probabilityB: 1 - pFinal,
		confidence,
		source,
		directMatches: h2h.totalMatches
	};
}

/**
 * Extract H2H record between two participants from tournament data.
 * Searches completed group matches and bracket matches within the current tournament.
 */
export function extractH2HFromTournament(
	tournament: Tournament,
	participantAId: string,
	participantBId: string
): H2HRecord | null {
	const performanceScores: number[] = [];

	// Source 1: Group stage completed matches
	if (tournament.groupStage?.groups) {
		for (const group of tournament.groupStage.groups) {
			// Check schedule (Round Robin)
			if (group.schedule) {
				for (const round of group.schedule) {
					collectMatchPerformance(round.matches, participantAId, participantBId, performanceScores);
				}
			}
			// Check pairings (Swiss)
			if (group.pairings) {
				for (const pairing of group.pairings) {
					collectMatchPerformance(pairing.matches, participantAId, participantBId, performanceScores);
				}
			}
		}
	}

	// Source 2: Bracket stage completed matches
	if (tournament.finalStage) {
		collectBracketH2H(tournament.finalStage.goldBracket?.rounds, participantAId, participantBId, performanceScores);
		collectBracketH2H(tournament.finalStage.silverBracket?.rounds, participantAId, participantBId, performanceScores);

		// Third place matches
		if (tournament.finalStage.goldBracket?.thirdPlaceMatch) {
			collectSingleMatchPerformance(tournament.finalStage.goldBracket.thirdPlaceMatch, participantAId, participantBId, performanceScores);
		}
		if (tournament.finalStage.silverBracket?.thirdPlaceMatch) {
			collectSingleMatchPerformance(tournament.finalStage.silverBracket.thirdPlaceMatch, participantAId, participantBId, performanceScores);
		}

		// Consolation brackets
		if (tournament.finalStage.goldBracket?.consolationBrackets) {
			for (const consolation of tournament.finalStage.goldBracket.consolationBrackets) {
				collectBracketH2H(consolation.rounds, participantAId, participantBId, performanceScores);
			}
		}
		if (tournament.finalStage.silverBracket?.consolationBrackets) {
			for (const consolation of tournament.finalStage.silverBracket.consolationBrackets) {
				collectBracketH2H(consolation.rounds, participantAId, participantBId, performanceScores);
			}
		}

		// Parallel brackets
		if (tournament.finalStage.parallelBrackets) {
			for (const named of tournament.finalStage.parallelBrackets) {
				collectBracketH2H(named.bracket?.rounds, participantAId, participantBId, performanceScores);
				if (named.bracket?.thirdPlaceMatch) {
					collectSingleMatchPerformance(named.bracket.thirdPlaceMatch, participantAId, participantBId, performanceScores);
				}
				if (named.bracket?.consolationBrackets) {
					for (const consolation of named.bracket.consolationBrackets) {
						collectBracketH2H(consolation.rounds, participantAId, participantBId, performanceScores);
					}
				}
			}
		}
	}

	if (performanceScores.length === 0) return null;

	return {
		totalMatches: performanceScores.length,
		performanceScores
	};
}

/**
 * Merge multiple H2H records into one (e.g., tournament + friendly matches).
 */
export function mergeH2HRecords(...records: (H2HRecord | null)[]): H2HRecord | null {
	const allScores: number[] = [];
	for (const record of records) {
		if (record) {
			allScores.push(...record.performanceScores);
		}
	}
	if (allScores.length === 0) return null;
	return {
		totalMatches: allScores.length,
		performanceScores: allScores
	};
}

// --- Internal Helpers ---

function collectMatchPerformance(
	matches: GroupMatch[],
	participantAId: string,
	participantBId: string,
	scores: number[]
): void {
	for (const match of matches) {
		if (match.status !== 'COMPLETED') continue;
		collectSingleMatchPerformance(match, participantAId, participantBId, scores);
	}
}

function collectSingleMatchPerformance(
	match: GroupMatch | BracketMatch,
	participantAId: string,
	participantBId: string,
	scores: number[]
): void {
	if (match.status !== 'COMPLETED') return;

	const mA = 'participantA' in match ? match.participantA : undefined;
	const mB = 'participantB' in match ? match.participantB : undefined;

	if (!mA || !mB) return;

	const pointsA = match.totalPointsA ?? 0;
	const pointsB = match.totalPointsB ?? 0;

	if (mA === participantAId && mB === participantBId) {
		scores.push(matchToPerformance(pointsA, pointsB));
	} else if (mA === participantBId && mB === participantAId) {
		// Reverse: performance from A's perspective
		scores.push(matchToPerformance(pointsB, pointsA));
	}
}

function collectBracketH2H(
	rounds: { matches: BracketMatch[] }[] | undefined,
	participantAId: string,
	participantBId: string,
	scores: number[]
): void {
	if (!rounds) return;
	for (const round of rounds) {
		for (const match of round.matches) {
			collectSingleMatchPerformance(match, participantAId, participantBId, scores);
		}
	}
}
