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
): WinLossChartData {
	const labels: string[] = [];
	const data: number[] = [];
	const colors: string[] = [];

	if (wins > 0) {
		labels.push(labelWins);
		data.push(wins);
		colors.push('#10b981');
	}
	if (losses > 0) {
		labels.push(labelLosses);
		data.push(losses);
		colors.push('#ef4444');
	}
	if (ties > 0) {
		labels.push(labelTies);
		data.push(ties);
		colors.push('#6b7280');
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
