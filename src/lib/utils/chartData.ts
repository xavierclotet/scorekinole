/**
 * Chart data transformation functions.
 * Pure functions with no Svelte dependencies — fully testable.
 */

import type { MatchHistory } from '$lib/types/history';
import type { Group, GroupMatch, GroupStanding, QualificationMode, TournamentRecord } from '$lib/types/tournament';

// ============================================================================
// 1. Win/Loss Donut
// ============================================================================

export interface WinLossChartData {
	labels: string[];
	data: number[];
	colors: string[];
}

export function buildWinLossData(
	wins: number,
	losses: number,
	ties: number,
	labelWins: string,
	labelLosses: string,
	labelTies: string,
	palette?: { win: string; loss: string; tie: string },
): WinLossChartData {
	const c = palette ?? { win: '#00ff88', loss: '#ff3366', tie: '#6b7280' };
	const labels: string[] = [];
	const data: number[] = [];
	const colors: string[] = [];

	if (wins > 0) {
		labels.push(labelWins);
		data.push(wins);
		colors.push(c.win);
	}
	if (losses > 0) {
		labels.push(labelLosses);
		data.push(losses);
		colors.push(c.loss);
	}
	if (ties > 0) {
		labels.push(labelTies);
		data.push(ties);
		colors.push(c.tie);
	}

	return { labels, data, colors };
}

// ============================================================================
// 2. 20s Accuracy Trend
// ============================================================================

export interface TwentiesDataPoint {
	date: string;
	timestamp: number;
	percentage: number;
	count: number;
	opponent: string;
	mode: 'singles' | 'doubles';
}

export interface TwentiesAccuracyChartData {
	singlesPoints: TwentiesDataPoint[];
	doublesPoints: TwentiesDataPoint[];
	singlesMA: number[];
	doublesMA: number[];
}

export function buildTwentiesAccuracyData(
	matches: MatchHistory[],
	getUserTeam: (match: MatchHistory) => 1 | 2 | null,
	getOpponentName: (match: MatchHistory) => string,
): TwentiesAccuracyChartData {
	const singlesPoints: TwentiesDataPoint[] = [];
	const doublesPoints: TwentiesDataPoint[] = [];

	// Sort by time ascending
	const sorted = [...matches].sort((a, b) => a.startTime - b.startTime);

	for (const match of sorted) {
		const userTeam = getUserTeam(match);
		if (!userTeam) continue;

		let totalTwenties = 0;
		let totalRounds = 0;

		for (const game of match.games ?? []) {
			for (const round of game.rounds ?? []) {
				totalTwenties += userTeam === 1 ? round.team1Twenty : round.team2Twenty;
				totalRounds++;
			}
		}

		// Skip matches without round-level 20s data
		if (totalRounds === 0) continue;

		const maxPerRound = match.gameType === 'doubles' ? 12 : 8;
		const maxPossible = totalRounds * maxPerRound;
		if (maxPossible === 0) continue;

		const percentage = (totalTwenties / maxPossible) * 100;
		const date = new Date(match.startTime);
		const dateStr = date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

		const point: TwentiesDataPoint = {
			date: dateStr,
			timestamp: match.startTime,
			percentage: Math.round(percentage * 10) / 10,
			count: totalTwenties,
			opponent: getOpponentName(match),
			mode: match.gameType === 'doubles' ? 'doubles' : 'singles',
		};

		if (match.gameType === 'doubles') {
			doublesPoints.push(point);
		} else {
			singlesPoints.push(point);
		}
	}

	return {
		singlesPoints,
		doublesPoints,
		singlesMA: computeMovingAverage(singlesPoints.map(p => p.percentage), 5),
		doublesMA: computeMovingAverage(doublesPoints.map(p => p.percentage), 5),
	};
}

function computeMovingAverage(values: number[], window: number): number[] {
	if (values.length === 0) return [];
	const result: number[] = [];
	for (let i = 0; i < values.length; i++) {
		const start = Math.max(0, i - window + 1);
		const slice = values.slice(start, i + 1);
		const avg = slice.reduce((sum, v) => sum + v, 0) / slice.length;
		result.push(Math.round(avg * 10) / 10);
	}
	return result;
}

// ============================================================================
// 3. Ranking Evolution
// ============================================================================

export interface RankingEvolutionPoint {
	tournamentName: string;
	date: string;
	timestamp: number;
	cumulativePoints: number;
	pointsEarned: number;
	position: number;
	totalParticipants: number;
}

export function buildRankingEvolutionData(
	records: TournamentRecord[],
	year: string,
): RankingEvolutionPoint[] {
	let filtered = records;
	if (year) {
		const y = parseInt(year);
		filtered = records.filter(r => new Date(r.tournamentDate).getFullYear() === y);
	}

	// Sort by date ascending
	const sorted = [...filtered].sort((a, b) => a.tournamentDate - b.tournamentDate);

	// Calculate cumulative ranking points (simple sum, not best-of-N for the chart)
	const points: RankingEvolutionPoint[] = [];
	let cumulative = 0;

	for (const record of sorted) {
		cumulative += record.rankingDelta;
		const date = new Date(record.tournamentDate);
		points.push({
			tournamentName: record.tournamentName,
			date: date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }),
			timestamp: record.tournamentDate,
			cumulativePoints: cumulative,
			pointsEarned: record.rankingDelta,
			position: record.finalPosition,
			totalParticipants: record.totalParticipants,
		});
	}

	return points;
}

// ============================================================================
// 4. Tournament Positions
// ============================================================================

export interface TournamentPositionPoint {
	tournamentName: string;
	date: string;
	timestamp: number;
	position: number;
	totalParticipants: number;
	pointsEarned: number;
}

export function buildTournamentPositionsData(
	records: TournamentRecord[],
	year: string,
): TournamentPositionPoint[] {
	let filtered = records;
	if (year) {
		const y = parseInt(year);
		filtered = records.filter(r => new Date(r.tournamentDate).getFullYear() === y);
	}

	return [...filtered]
		.sort((a, b) => a.tournamentDate - b.tournamentDate)
		.map(r => {
			const date = new Date(r.tournamentDate);
			return {
				tournamentName: r.tournamentName,
				date: date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }),
				timestamp: r.tournamentDate,
				position: r.finalPosition,
				totalParticipants: r.totalParticipants,
				pointsEarned: r.rankingDelta,
			};
		});
}

// ============================================================================
// 5. Bump Chart (Group Stage Position Evolution)
// ============================================================================

export interface BumpChartDataset {
	participantId: string;
	participantName: string;
	positions: (number | null)[]; // position per round (null = no data yet)
}

export interface BumpChartResult {
	roundLabels: string[];
	datasets: BumpChartDataset[];
}

/**
 * Build bump chart data by replaying standings round-by-round.
 * For each round, we compute partial standings considering only matches up to that round.
 */
export function buildBumpChartData(
	group: Group,
	participantNames: Map<string, string>,
	isSwiss: boolean,
	qualificationMode: QualificationMode,
): BumpChartResult {
	const rounds = isSwiss
		? (group.pairings ?? [])
		: (group.schedule ?? []);

	if (rounds.length < 2) return { roundLabels: [], datasets: [] };

	// Find how many rounds have at least one completed match
	const completedRoundCount = rounds.filter(r =>
		(r.matches ?? []).some(m => m.status === 'COMPLETED' || m.status === 'WALKOVER')
	).length;

	if (completedRoundCount < 2) return { roundLabels: [], datasets: [] };

	const roundLabels: string[] = [];
	const participantPositions = new Map<string, (number | null)[]>();

	// Initialize participant arrays
	for (const pid of group.participants) {
		participantPositions.set(pid, []);
	}

	// Replay standings round by round
	for (let r = 0; r < completedRoundCount; r++) {
		roundLabels.push(`R${r + 1}`);
		const standings = calculateStandingsUpToRound(group, r + 1, isSwiss, qualificationMode);

		for (const pid of group.participants) {
			const standing = standings.find(s => s.participantId === pid);
			const positions = participantPositions.get(pid)!;
			positions.push(standing ? standing.position : null);
		}
	}

	const datasets: BumpChartDataset[] = [];
	for (const pid of group.participants) {
		datasets.push({
			participantId: pid,
			participantName: participantNames.get(pid) ?? pid,
			positions: participantPositions.get(pid) ?? [],
		});
	}

	return { roundLabels, datasets };
}

/**
 * Calculate standings considering only matches up to a specific round.
 * This is a pure replay of the standings logic from tournamentMatches.ts,
 * but only processing matches from rounds 0..upToRound-1.
 */
function calculateStandingsUpToRound(
	group: Group,
	upToRound: number,
	isSwiss: boolean,
	qualificationMode: QualificationMode,
): GroupStanding[] {
	// Get matches only up to the specified round
	let matches: GroupMatch[] = [];

	if (!isSwiss && group.schedule) {
		for (let i = 0; i < Math.min(upToRound, group.schedule.length); i++) {
			matches.push(...(group.schedule[i].matches ?? []));
		}
	} else if (isSwiss && group.pairings) {
		for (let i = 0; i < Math.min(upToRound, group.pairings.length); i++) {
			matches.push(...(group.pairings[i].matches ?? []));
		}
	}

	// Initialize standings
	const standingsMap = new Map<string, GroupStanding>();
	for (const pid of group.participants) {
		standingsMap.set(pid, {
			participantId: pid,
			position: 0,
			matchesPlayed: 0,
			matchesWon: 0,
			matchesLost: 0,
			matchesTied: 0,
			points: 0,
			swissPoints: isSwiss ? 0 : undefined,
			total20s: 0,
			totalPointsScored: 0,
			qualifiedForFinal: false,
		});
	}

	// Process completed matches
	for (const match of matches) {
		if (match.status !== 'COMPLETED' && match.status !== 'WALKOVER') continue;
		if (match.participantB === 'BYE') continue;

		const standingA = standingsMap.get(match.participantA);
		const standingB = standingsMap.get(match.participantB);
		if (!standingA || !standingB) continue;

		standingA.matchesPlayed++;
		standingB.matchesPlayed++;

		if (match.winner === match.participantA) {
			standingA.matchesWon++;
			standingB.matchesLost++;
			standingA.points += 2;
			if (isSwiss) standingA.swissPoints = (standingA.swissPoints || 0) + 2;
		} else if (match.winner === match.participantB) {
			standingB.matchesWon++;
			standingA.matchesLost++;
			standingB.points += 2;
			if (isSwiss) standingB.swissPoints = (standingB.swissPoints || 0) + 2;
		} else {
			standingA.matchesTied++;
			standingB.matchesTied++;
			standingA.points += 1;
			standingB.points += 1;
			if (isSwiss) {
				standingA.swissPoints = (standingA.swissPoints || 0) + 1;
				standingB.swissPoints = (standingB.swissPoints || 0) + 1;
			}
		}

		if (match.total20sA) standingA.total20s += match.total20sA;
		if (match.total20sB) standingB.total20s += match.total20sB;
		if (match.totalPointsA) standingA.totalPointsScored += match.totalPointsA;
		if (match.totalPointsB) standingB.totalPointsScored += match.totalPointsB;
	}

	// Sort standings
	const standings = Array.from(standingsMap.values()).sort((a, b) => {
		if (qualificationMode === 'POINTS') {
			if (b.totalPointsScored !== a.totalPointsScored) return b.totalPointsScored - a.totalPointsScored;
			if (b.total20s !== a.total20s) return b.total20s - a.total20s;
			return (isSwiss ? (b.swissPoints || 0) - (a.swissPoints || 0) : b.points - a.points);
		} else {
			if (isSwiss) {
				if ((b.swissPoints || 0) !== (a.swissPoints || 0)) return (b.swissPoints || 0) - (a.swissPoints || 0);
			} else {
				if (b.points !== a.points) return b.points - a.points;
			}
			if (b.total20s !== a.total20s) return b.total20s - a.total20s;
			return b.totalPointsScored - a.totalPointsScored;
		}
	});

	// Assign positions
	standings.forEach((standing, index) => {
		standing.position = index + 1;
	});

	return standings;
}

// --- Twenties Grouped Bar Chart ---

export interface TwentiesGroupedDataset {
	participantId: string;
	participantName: string;
	twentiesPerRound: number[];
}

export interface TwentiesGroupedResult {
	roundLabels: string[];
	datasets: TwentiesGroupedDataset[];
}

/**
 * Build grouped bar chart data: 20s per participant per round (bars side by side).
 */
export function buildTwentiesGroupedData(
	group: Group,
	participantNames: Map<string, string>,
	isSwiss: boolean,
): TwentiesGroupedResult {
	const rounds = isSwiss
		? (group.pairings ?? [])
		: (group.schedule ?? []);

	const completedRounds = rounds.filter(r =>
		(r.matches ?? []).some(m => m.status === 'COMPLETED' || m.status === 'WALKOVER')
	);

	if (completedRounds.length === 0) return { roundLabels: [], datasets: [] };

	const roundLabels: string[] = [];
	const participantTwenties = new Map<string, number[]>();

	for (const pid of group.participants) {
		participantTwenties.set(pid, []);
	}

	for (const round of completedRounds) {
		roundLabels.push(`R${round.roundNumber}`);
		const roundTotals = new Map<string, number>();

		for (const pid of group.participants) {
			roundTotals.set(pid, 0);
		}

		for (const match of round.matches ?? []) {
			if (match.status !== 'COMPLETED' && match.status !== 'WALKOVER') continue;
			if (match.participantA) {
				roundTotals.set(match.participantA, (roundTotals.get(match.participantA) ?? 0) + (match.total20sA ?? 0));
			}
			if (match.participantB && match.participantB !== 'BYE') {
				roundTotals.set(match.participantB, (roundTotals.get(match.participantB) ?? 0) + (match.total20sB ?? 0));
			}
		}

		for (const pid of group.participants) {
			participantTwenties.get(pid)!.push(roundTotals.get(pid) ?? 0);
		}
	}

	const datasets: TwentiesGroupedDataset[] = [];
	for (const pid of group.participants) {
		datasets.push({
			participantId: pid,
			participantName: participantNames.get(pid) ?? pid,
			twentiesPerRound: participantTwenties.get(pid) ?? [],
		});
	}

	return { roundLabels, datasets };
}

// ============================================================================
// 7. 20s Distribution (Histogram)
// ============================================================================

export interface TwentiesDistributionData {
	labels: string[];
	frequencies: number[];
	totalRounds: number;
}

export function buildTwentiesDistributionData(
	matches: MatchHistory[],
	getUserTeam: (match: MatchHistory) => 1 | 2 | null,
): TwentiesDistributionData {
	const frequencyMap = new Map<number, number>();
	let totalRounds = 0;

	for (const match of matches) {
		const userTeam = getUserTeam(match);
		if (!userTeam) continue;

		for (const game of match.games ?? []) {
			for (const round of game.rounds ?? []) {
				const twenties = userTeam === 1 ? round.team1Twenty : round.team2Twenty;
				frequencyMap.set(twenties, (frequencyMap.get(twenties) ?? 0) + 1);
				totalRounds++;
			}
		}
	}

	if (totalRounds === 0) return { labels: [], frequencies: [], totalRounds: 0 };

	const maxKey = Math.max(...frequencyMap.keys());
	const labels: string[] = [];
	const frequencies: number[] = [];

	for (let i = 0; i <= maxKey; i++) {
		labels.push(String(i));
		frequencies.push(frequencyMap.get(i) ?? 0);
	}

	return { labels, frequencies, totalRounds };
}

// ============================================================================
// 8. 20s Hammer Correlation
// ============================================================================

export interface TwentiesHammerBucket {
	avgTwenties: number;
	totalRounds: number;
	totalTwenties: number;
}

export interface TwentiesHammerData {
	withHammer: TwentiesHammerBucket;
	withoutHammer: TwentiesHammerBucket;
}

export function buildTwentiesHammerData(
	matches: MatchHistory[],
	getUserTeam: (match: MatchHistory) => 1 | 2 | null,
): TwentiesHammerData {
	let hammerTwenties = 0, hammerRounds = 0;
	let noHammerTwenties = 0, noHammerRounds = 0;

	for (const match of matches) {
		const userTeam = getUserTeam(match);
		if (!userTeam) continue;

		for (const game of match.games ?? []) {
			for (const round of game.rounds ?? []) {
				if (round.hammerTeam == null) continue;
				const twenties = userTeam === 1 ? round.team1Twenty : round.team2Twenty;
				if (round.hammerTeam === userTeam) {
					hammerTwenties += twenties;
					hammerRounds++;
				} else {
					noHammerTwenties += twenties;
					noHammerRounds++;
				}
			}
		}
	}

	return {
		withHammer: {
			avgTwenties: hammerRounds > 0 ? Math.round((hammerTwenties / hammerRounds) * 100) / 100 : 0,
			totalRounds: hammerRounds,
			totalTwenties: hammerTwenties,
		},
		withoutHammer: {
			avgTwenties: noHammerRounds > 0 ? Math.round((noHammerTwenties / noHammerRounds) * 100) / 100 : 0,
			totalRounds: noHammerRounds,
			totalTwenties: noHammerTwenties,
		},
	};
}

// ============================================================================
// 9. 20s Per Round Number Trend
// ============================================================================

export interface TwentiesPerRoundData {
	roundLabels: string[];
	averages: number[];
	counts: number[];
}

export function buildTwentiesPerRoundData(
	matches: MatchHistory[],
	getUserTeam: (match: MatchHistory) => 1 | 2 | null,
): TwentiesPerRoundData {
	const buckets = new Map<number, { sum: number; count: number }>();

	for (const match of matches) {
		const userTeam = getUserTeam(match);
		if (!userTeam) continue;

		for (const game of match.games ?? []) {
			for (const round of game.rounds ?? []) {
				const rn = round.roundNumber || 1;
				const twenties = userTeam === 1 ? round.team1Twenty : round.team2Twenty;
				const bucket = buckets.get(rn) ?? { sum: 0, count: 0 };
				bucket.sum += twenties;
				bucket.count++;
				buckets.set(rn, bucket);
			}
		}
	}

	if (buckets.size === 0) return { roundLabels: [], averages: [], counts: [] };

	const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
	const roundLabels = sortedKeys.map(k => `R${k}`);
	const averages = sortedKeys.map(k => {
		const b = buckets.get(k)!;
		return Math.round((b.sum / b.count) * 10) / 10;
	});
	const counts = sortedKeys.map(k => buckets.get(k)!.count);

	return { roundLabels, averages, counts };
}

// ============================================================================
// 10. 20s Streaks
// ============================================================================

export interface TwentiesStreakData {
	bestStreak: number;
	currentStreak: number;
	averageStreak: number;
	totalStreaks: number;
}

export function buildTwentiesStreakData(
	matches: MatchHistory[],
	getUserTeam: (match: MatchHistory) => 1 | 2 | null,
): TwentiesStreakData {
	const sorted = [...matches].sort((a, b) => a.startTime - b.startTime);

	let current = 0;
	let best = 0;
	const allStreaks: number[] = [];

	for (const match of sorted) {
		const userTeam = getUserTeam(match);
		if (!userTeam) continue;

		for (const game of match.games ?? []) {
			for (const round of game.rounds ?? []) {
				const twenties = userTeam === 1 ? round.team1Twenty : round.team2Twenty;
				if (twenties >= 1) {
					current++;
					if (current > best) best = current;
				} else {
					if (current > 0) allStreaks.push(current);
					current = 0;
				}
			}
		}
	}

	if (current > 0) allStreaks.push(current);

	const totalStreaks = allStreaks.length;
	const avg = totalStreaks > 0
		? Math.round((allStreaks.reduce((s, v) => s + v, 0) / totalStreaks) * 10) / 10
		: 0;

	return {
		bestStreak: best,
		currentStreak: current,
		averageStreak: avg,
		totalStreaks,
	};
}

// ============================================================================
// 11. 20s Gauge (Recent vs Historical)
// ============================================================================

export interface TwentiesGaugeData {
	recentPercentage: number;
	historicalPercentage: number;
	recentCount: number;
	historicalCount: number;
}

export function buildTwentiesGaugeData(
	matches: MatchHistory[],
	getUserTeam: (match: MatchHistory) => 1 | 2 | null,
): TwentiesGaugeData {
	const sorted = [...matches].sort((a, b) => b.startTime - a.startTime);

	let histTwenties = 0, histMax = 0, histCount = 0;
	let recentTwenties = 0, recentMax = 0, recentCount = 0;

	for (const match of sorted) {
		const userTeam = getUserTeam(match);
		if (!userTeam) continue;

		let matchTwenties = 0, matchMax = 0;
		let hasRounds = false;

		for (const game of match.games ?? []) {
			for (const round of game.rounds ?? []) {
				matchTwenties += userTeam === 1 ? round.team1Twenty : round.team2Twenty;
				const maxPerRound = match.gameType === 'doubles' ? 12 : 8;
				matchMax += maxPerRound;
				hasRounds = true;
			}
		}

		if (!hasRounds) continue;

		histTwenties += matchTwenties;
		histMax += matchMax;
		histCount++;

		if (recentCount < 10) {
			recentTwenties += matchTwenties;
			recentMax += matchMax;
			recentCount++;
		}
	}

	return {
		recentPercentage: recentMax > 0 ? Math.round((recentTwenties / recentMax) * 1000) / 10 : 0,
		historicalPercentage: histMax > 0 ? Math.round((histTwenties / histMax) * 1000) / 10 : 0,
		recentCount,
		historicalCount: histCount,
	};
}

// ============================================================================
// 8. Match Duration
// ============================================================================

export interface DurationDataPoint {
	date: string;
	timestamp: number;
	durationMinutes: number;
	opponent: string;
	mode: 'singles' | 'doubles';
}

export interface MatchDurationChartData {
	singlesPoints: DurationDataPoint[];
	doublesPoints: DurationDataPoint[];
	singlesAvg: number;
	doublesAvg: number;
}

export function buildMatchDurationData(
	matches: MatchHistory[],
	getOpponentName: (match: MatchHistory) => string,
): MatchDurationChartData {
	const singlesPoints: DurationDataPoint[] = [];
	const doublesPoints: DurationDataPoint[] = [];

	const sorted = [...matches].sort((a, b) => a.startTime - b.startTime);

	for (const match of sorted) {
		if (!match.duration || match.duration <= 0) continue;

		const minutes = Math.round(match.duration / 60000);
		if (minutes <= 0) continue;

		const date = new Date(match.startTime);
		const dateStr = date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

		const point: DurationDataPoint = {
			date: dateStr,
			timestamp: match.startTime,
			durationMinutes: minutes,
			opponent: getOpponentName(match),
			mode: match.gameType === 'doubles' ? 'doubles' : 'singles',
		};

		if (match.gameType === 'doubles') {
			doublesPoints.push(point);
		} else {
			singlesPoints.push(point);
		}
	}

	const singlesAvg = singlesPoints.length > 0
		? Math.round(singlesPoints.reduce((sum, p) => sum + p.durationMinutes, 0) / singlesPoints.length)
		: 0;
	const doublesAvg = doublesPoints.length > 0
		? Math.round(doublesPoints.reduce((sum, p) => sum + p.durationMinutes, 0) / doublesPoints.length)
		: 0;

	return { singlesPoints, doublesPoints, singlesAvg, doublesAvg };
}

// ============================================================================
// 12. 20s By Tournament Phase
// ============================================================================

export interface TwentiesByPhaseBucket {
	phase: string;
	avgTwenties: number;
	totalTwenties: number;
	totalRounds: number;
}

export interface TwentiesByPhaseData {
	phases: TwentiesByPhaseBucket[];
}

// Normalize matchPhase values to a canonical display name and order
// Supports: English (quarterfinals), Spanish (Cuartos), mixed case, etc.
const PHASE_MAP: Record<string, { label: string; order: number }> = {
	'R8': { label: 'Octavos', order: 0 },
	'octavos': { label: 'Octavos', order: 0 },
	'round of 16': { label: 'Octavos', order: 0 },
	'quarterfinals': { label: 'Cuartos', order: 1 },
	'cuartos': { label: 'Cuartos', order: 1 },
	'semifinals': { label: 'Semifinales', order: 2 },
	'semifinales': { label: 'Semifinales', order: 2 },
	'3er puesto': { label: '3er puesto', order: 3 },
	'third place': { label: '3er puesto', order: 3 },
	'finals': { label: 'Final', order: 4 },
	'final': { label: 'Final', order: 4 },
};

function normalizeBracketPhase(raw: string): { label: string; order: number } | null {
	return PHASE_MAP[raw.toLowerCase()] ?? null;
}

export function buildTwentiesByPhaseData(
	matches: MatchHistory[],
	getUserTeam: (match: MatchHistory) => 1 | 2 | null,
): TwentiesByPhaseData {
	const buckets = new Map<string, { sum: number; rounds: number; order: number }>();

	for (const match of matches) {
		if (!match.matchPhase || !match.eventTitle) continue;
		const normalized = normalizeBracketPhase(match.matchPhase);
		if (!normalized) continue;
		const userTeam = getUserTeam(match);
		if (!userTeam) continue;

		const { label, order } = normalized;

		for (const game of match.games ?? []) {
			for (const round of game.rounds ?? []) {
				const twenties = userTeam === 1 ? round.team1Twenty : round.team2Twenty;
				const bucket = buckets.get(label) ?? { sum: 0, rounds: 0, order };
				bucket.sum += twenties;
				bucket.rounds++;
				buckets.set(label, bucket);
			}
		}
	}

	const phases: TwentiesByPhaseBucket[] = [...buckets.entries()]
		.filter(([, b]) => b.rounds > 0)
		.map(([phase, b]) => ({
			phase,
			avgTwenties: Math.round((b.sum / b.rounds) * 100) / 100,
			totalTwenties: b.sum,
			totalRounds: b.rounds,
		}))
		.sort((a, b) => {
			const orderA = buckets.get(a.phase)!.order;
			const orderB = buckets.get(b.phase)!.order;
			return orderA - orderB;
		});

	return { phases };
}
