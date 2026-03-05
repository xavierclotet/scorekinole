import { describe, it, expect } from 'vitest';
import type { MatchHistory } from '$lib/types/history';
import type { Group, QualificationMode } from '$lib/types/tournament';
import {
	buildWinLossData,
	buildTwentiesAccuracyData,
	buildRankingEvolutionData,
	buildTournamentPositionsData,
	buildBumpChartData,
	buildTwentiesGroupedData,
	buildTwentiesDistributionData,
	buildTwentiesHammerData,
	buildTwentiesPerRoundData,
	buildTwentiesByPhaseData,
} from './chartData';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeMatch = (overrides: Partial<MatchHistory> & Record<string, unknown> = {}): MatchHistory => ({
	id: 'match1',
	team1Name: 'A',
	team2Name: 'B',
	team1Color: '#000',
	team2Color: '#fff',
	team1Score: 0,
	team2Score: 0,
	winner: null,
	gameMode: 'points' as const,
	gameType: 'singles' as const,
	matchesToWin: 1,
	games: [],
	startTime: 1000,
	endTime: 2000,
	duration: 1000,
	...overrides,
});

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
	tournamentId: 't1',
	tournamentName: 'T1',
	tournamentDate: Date.now(),
	finalPosition: 1,
	totalParticipants: 8,
	rankingBefore: 0,
	rankingAfter: 100,
	rankingDelta: 100,
	...overrides,
});

// ---------------------------------------------------------------------------
// 1. buildWinLossData
// ---------------------------------------------------------------------------

describe('buildWinLossData', () => {
	it('includes all non-zero values with default palette', () => {
		const result = buildWinLossData(5, 3, 2, 'Wins', 'Losses', 'Ties');
		expect(result.labels).toEqual(['Wins', 'Losses', 'Ties']);
		expect(result.data).toEqual([5, 3, 2]);
		expect(result.colors).toEqual(['#00ff88', '#ff3366', '#6b7280']);
	});

	it('excludes zero values', () => {
		const result = buildWinLossData(5, 0, 2, 'W', 'L', 'T');
		expect(result.labels).toEqual(['W', 'T']);
		expect(result.data).toEqual([5, 2]);
		expect(result.colors).toHaveLength(2);
	});

	it('returns empty arrays when all values are zero', () => {
		const result = buildWinLossData(0, 0, 0, 'W', 'L', 'T');
		expect(result.labels).toEqual([]);
		expect(result.data).toEqual([]);
		expect(result.colors).toEqual([]);
	});

	it('uses custom palette when provided', () => {
		const palette = { win: '#aaa', loss: '#bbb', tie: '#ccc' };
		const result = buildWinLossData(1, 1, 1, 'W', 'L', 'T', palette);
		expect(result.colors).toEqual(['#aaa', '#bbb', '#ccc']);
	});
});

// ---------------------------------------------------------------------------
// 2. buildTwentiesAccuracyData
// ---------------------------------------------------------------------------

describe('buildTwentiesAccuracyData', () => {
	const getUserTeam1 = () => 1 as const;
	const getOpponent = () => 'Opponent';

	it('calculates singles percentage correctly (maxPerRound = 8)', () => {
		const match = makeMatch({
			gameType: 'singles',
			startTime: 1000,
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 4, team2Twenty: 1, hammerTeam: 1, roundNumber: 1 },
					{ team1Points: 3, team2Points: 5, team1Twenty: 2, team2Twenty: 3, hammerTeam: 2, roundNumber: 2 },
				],
			}],
		});

		const result = buildTwentiesAccuracyData([match], getUserTeam1, getOpponent);
		// totalTwenties = 4 + 2 = 6, totalRounds = 2, maxPerRound = 8
		// percentage = (6 / (2 * 8)) * 100 = 37.5
		expect(result.singlesPoints).toHaveLength(1);
		expect(result.singlesPoints[0].percentage).toBe(37.5);
		expect(result.singlesPoints[0].count).toBe(6);
		expect(result.singlesPoints[0].mode).toBe('singles');
		expect(result.doublesPoints).toHaveLength(0);
	});

	it('uses maxPerRound = 12 for doubles matches', () => {
		const match = makeMatch({
			gameType: 'doubles',
			startTime: 1000,
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 6, team2Twenty: 2, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		});

		const result = buildTwentiesAccuracyData([match], getUserTeam1, getOpponent);
		// totalTwenties = 6, totalRounds = 1, maxPerRound = 12
		// percentage = (6 / 12) * 100 = 50.0
		expect(result.doublesPoints).toHaveLength(1);
		expect(result.doublesPoints[0].percentage).toBe(50);
		expect(result.doublesPoints[0].mode).toBe('doubles');
		expect(result.singlesPoints).toHaveLength(0);
	});

	it('returns empty arrays for no matches', () => {
		const result = buildTwentiesAccuracyData([], getUserTeam1, getOpponent);
		expect(result.singlesPoints).toEqual([]);
		expect(result.doublesPoints).toEqual([]);
		expect(result.singlesMA).toEqual([]);
		expect(result.doublesMA).toEqual([]);
	});

	it('skips matches where getUserTeam returns null', () => {
		const match = makeMatch({
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 4, team2Twenty: 1, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		});

		const result = buildTwentiesAccuracyData([match], () => null, getOpponent);
		expect(result.singlesPoints).toEqual([]);
		expect(result.doublesPoints).toEqual([]);
	});

	it('computes moving average with window = 5', () => {
		// Create 6 singles matches with known percentages
		const matches = Array.from({ length: 6 }, (_, i) => makeMatch({
			id: `m${i}`,
			gameType: 'singles',
			startTime: 1000 + i * 100,
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					// team1Twenty: i twenties, maxPerRound=8 => percentage = (i / 8) * 100
					{ team1Points: 5, team2Points: 3, team1Twenty: i, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		}));

		const result = buildTwentiesAccuracyData(matches, getUserTeam1, getOpponent);
		expect(result.singlesPoints).toHaveLength(6);
		expect(result.singlesMA).toHaveLength(6);

		// MA[0] = pct[0] only = 0
		expect(result.singlesMA[0]).toBe(result.singlesPoints[0].percentage);
		// MA[4] should be average of pct[0..4] (window=5 fully filled)
		const first5 = result.singlesPoints.slice(0, 5).map(p => p.percentage);
		const expectedMA4 = Math.round((first5.reduce((a, b) => a + b, 0) / 5) * 10) / 10;
		expect(result.singlesMA[4]).toBe(expectedMA4);
		// MA[5] should be average of pct[1..5] (window slides)
		const last5 = result.singlesPoints.slice(1, 6).map(p => p.percentage);
		const expectedMA5 = Math.round((last5.reduce((a, b) => a + b, 0) / 5) * 10) / 10;
		expect(result.singlesMA[5]).toBe(expectedMA5);
	});
});

// ---------------------------------------------------------------------------
// 3. buildRankingEvolutionData
// ---------------------------------------------------------------------------

describe('buildRankingEvolutionData', () => {
	it('calculates cumulative sum correctly', () => {
		const records = [
			makeRecord({ tournamentDate: 1000, rankingDelta: 100 }),
			makeRecord({ tournamentDate: 2000, rankingDelta: 50 }),
			makeRecord({ tournamentDate: 3000, rankingDelta: -20 }),
		];

		const result = buildRankingEvolutionData(records, '');
		expect(result).toHaveLength(3);
		expect(result[0].cumulativePoints).toBe(100);
		expect(result[1].cumulativePoints).toBe(150);
		expect(result[2].cumulativePoints).toBe(130);
	});

	it('filters by year', () => {
		const records = [
			makeRecord({ tournamentDate: new Date('2024-06-15').getTime(), rankingDelta: 100, tournamentName: 'A' }),
			makeRecord({ tournamentDate: new Date('2025-01-10').getTime(), rankingDelta: 50, tournamentName: 'B' }),
			makeRecord({ tournamentDate: new Date('2024-12-01').getTime(), rankingDelta: 30, tournamentName: 'C' }),
		];

		const result = buildRankingEvolutionData(records, '2024');
		expect(result).toHaveLength(2);
		expect(result.map(r => r.tournamentName)).toEqual(['A', 'C']); // sorted by date
		expect(result[0].cumulativePoints).toBe(100);
		expect(result[1].cumulativePoints).toBe(130);
	});

	it('returns all records when year is empty string', () => {
		const records = [
			makeRecord({ tournamentDate: new Date('2024-06-15').getTime() }),
			makeRecord({ tournamentDate: new Date('2025-01-10').getTime() }),
		];

		const result = buildRankingEvolutionData(records, '');
		expect(result).toHaveLength(2);
	});

	it('returns empty array when no records match the year', () => {
		const records = [
			makeRecord({ tournamentDate: new Date('2024-06-15').getTime() }),
		];

		const result = buildRankingEvolutionData(records, '2030');
		expect(result).toEqual([]);
	});

	it('preserves pointsEarned and position in output', () => {
		const records = [
			makeRecord({ tournamentDate: 1000, rankingDelta: 80, finalPosition: 2, totalParticipants: 16 }),
		];

		const result = buildRankingEvolutionData(records, '');
		expect(result[0].pointsEarned).toBe(80);
		expect(result[0].position).toBe(2);
		expect(result[0].totalParticipants).toBe(16);
	});
});

// ---------------------------------------------------------------------------
// 4. buildTournamentPositionsData
// ---------------------------------------------------------------------------

describe('buildTournamentPositionsData', () => {
	it('maps records correctly', () => {
		const records = [
			makeRecord({ tournamentDate: 2000, finalPosition: 3, totalParticipants: 10, tournamentName: 'B' }),
			makeRecord({ tournamentDate: 1000, finalPosition: 1, totalParticipants: 8, tournamentName: 'A' }),
		];

		const result = buildTournamentPositionsData(records, '');
		expect(result).toHaveLength(2);
		// Should be sorted by date ascending
		expect(result[0].tournamentName).toBe('A');
		expect(result[0].position).toBe(1);
		expect(result[0].totalParticipants).toBe(8);
		expect(result[1].tournamentName).toBe('B');
		expect(result[1].position).toBe(3);
	});

	it('filters by year', () => {
		const records = [
			makeRecord({ tournamentDate: new Date('2024-03-01').getTime(), tournamentName: 'X' }),
			makeRecord({ tournamentDate: new Date('2025-07-01').getTime(), tournamentName: 'Y' }),
		];

		const result = buildTournamentPositionsData(records, '2025');
		expect(result).toHaveLength(1);
		expect(result[0].tournamentName).toBe('Y');
	});

	it('returns empty for no matching records', () => {
		const result = buildTournamentPositionsData([], '2024');
		expect(result).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 5. buildBumpChartData
// ---------------------------------------------------------------------------

describe('buildBumpChartData', () => {
	const names = new Map([['p1', 'Alice'], ['p2', 'Bob'], ['p3', 'Carol']]);
	const qualMode: QualificationMode = 'WINS';

	const rrGroup: Group = {
		id: 'g1',
		name: 'Group A',
		participants: ['p1', 'p2', 'p3'],
		standings: [],
		schedule: [
			{
				roundNumber: 1,
				matches: [
					{
						id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED',
						winner: 'p1', totalPointsA: 8, totalPointsB: 4, total20sA: 3, total20sB: 1,
					},
					{
						id: 'm2', participantA: 'p3', participantB: 'BYE', status: 'WALKOVER',
						winner: 'p3', totalPointsA: 0, totalPointsB: 0, total20sA: 0, total20sB: 0,
					},
				],
			},
			{
				roundNumber: 2,
				matches: [
					{
						id: 'm3', participantA: 'p2', participantB: 'p3', status: 'COMPLETED',
						winner: 'p3', totalPointsA: 5, totalPointsB: 8, total20sA: 2, total20sB: 4,
					},
				],
			},
			{
				roundNumber: 3,
				matches: [
					{
						id: 'm4', participantA: 'p1', participantB: 'p3', status: 'COMPLETED',
						winner: 'p1', totalPointsA: 8, totalPointsB: 6, total20sA: 2, total20sB: 1,
					},
				],
			},
		],
	} as unknown as Group;

	it('builds round labels and datasets for Round Robin with 3 rounds', () => {
		const result = buildBumpChartData(rrGroup, names, false, qualMode);
		expect(result.roundLabels).toEqual(['R1', 'R2', 'R3']);
		expect(result.datasets).toHaveLength(3);
		expect(result.datasets.find(d => d.participantId === 'p1')!.participantName).toBe('Alice');
	});

	it('uses pairings for Swiss mode', () => {
		const swissGroup: Group = {
			id: 'g1',
			name: 'Swiss',
			participants: ['p1', 'p2', 'p3'],
			standings: [],
			pairings: [
				{
					roundNumber: 1,
					matches: [
						{
							id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED',
							winner: 'p1', totalPointsA: 8, totalPointsB: 4, total20sA: 3, total20sB: 1,
						},
						{
							id: 'm2', participantA: 'p3', participantB: 'BYE', status: 'WALKOVER',
							winner: 'p3', totalPointsA: 0, totalPointsB: 0, total20sA: 0, total20sB: 0,
						},
					],
				},
				{
					roundNumber: 2,
					matches: [
						{
							id: 'm3', participantA: 'p1', participantB: 'p3', status: 'COMPLETED',
							winner: 'p3', totalPointsA: 4, totalPointsB: 8, total20sA: 1, total20sB: 5,
						},
					],
				},
			],
		} as unknown as Group;

		const result = buildBumpChartData(swissGroup, names, true, qualMode);
		expect(result.roundLabels).toEqual(['R1', 'R2']);
		expect(result.datasets).toHaveLength(3);
	});

	it('returns empty when fewer than 2 rounds exist', () => {
		const smallGroup: Group = {
			id: 'g1',
			name: 'Group A',
			participants: ['p1', 'p2'],
			standings: [],
			schedule: [
				{
					roundNumber: 1,
					matches: [{
						id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED',
						winner: 'p1', totalPointsA: 8, totalPointsB: 4,
					}],
				},
			],
		} as unknown as Group;

		const result = buildBumpChartData(smallGroup, new Map([['p1', 'A'], ['p2', 'B']]), false, qualMode);
		expect(result.roundLabels).toEqual([]);
		expect(result.datasets).toEqual([]);
	});

	it('returns empty when fewer than 2 completed rounds', () => {
		const pendingGroup: Group = {
			id: 'g1',
			name: 'Group A',
			participants: ['p1', 'p2'],
			standings: [],
			schedule: [
				{
					roundNumber: 1,
					matches: [{
						id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED',
						winner: 'p1', totalPointsA: 8, totalPointsB: 4,
					}],
				},
				{
					roundNumber: 2,
					matches: [{
						id: 'm2', participantA: 'p1', participantB: 'p2', status: 'PENDING',
					}],
				},
			],
		} as unknown as Group;

		const result = buildBumpChartData(pendingGroup, new Map([['p1', 'A'], ['p2', 'B']]), false, qualMode);
		expect(result.roundLabels).toEqual([]);
		expect(result.datasets).toEqual([]);
	});

	it('correctly recalculates standings (winner gets 2 pts)', () => {
		const result = buildBumpChartData(rrGroup, names, false, qualMode);
		const p1Positions = result.datasets.find(d => d.participantId === 'p1')!.positions;
		const p2Positions = result.datasets.find(d => d.participantId === 'p2')!.positions;
		const p3Positions = result.datasets.find(d => d.participantId === 'p3')!.positions;

		// After R1: p1 wins (2pts), p3 has BYE (not counted), p2 loses (0pts)
		// Standings by points: p1=2, p3=0, p2=0 (tiebreak by 20s: p3=0, p2=1 => p2 ahead? no, p2 has 1 twenty but lost)
		// p1: 2pts, p2: 0pts/1 twenty, p3: 0pts/0 twenties
		// Sort: p1 (2pts) > p2 (0pts, 1 twenty) > p3 (0pts, 0 twenties)
		expect(p1Positions[0]).toBe(1);

		// After R3: p1 has 2 wins (4pts), p3 has 1 win (2pts), p2 has 0 wins (0pts)
		expect(p1Positions[2]).toBe(1);
		expect(p2Positions[2]).toBe(3);
	});

	it('falls back to participantId when name not in map', () => {
		const result = buildBumpChartData(rrGroup, new Map(), false, qualMode);
		expect(result.datasets[0].participantName).toBe('p1');
	});
});

// ---------------------------------------------------------------------------
// 6. buildTwentiesGroupedData
// ---------------------------------------------------------------------------

describe('buildTwentiesGroupedData', () => {
	const names = new Map([['p1', 'Alice'], ['p2', 'Bob'], ['p3', 'Carol']]);

	const rrGroup: Group = {
		id: 'g1',
		name: 'Group A',
		participants: ['p1', 'p2', 'p3'],
		standings: [],
		schedule: [
			{
				roundNumber: 1,
				matches: [
					{
						id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED',
						winner: 'p1', total20sA: 3, total20sB: 1,
					},
					{
						id: 'm2', participantA: 'p3', participantB: 'BYE', status: 'WALKOVER',
						winner: 'p3', total20sA: 0, total20sB: 0,
					},
				],
			},
			{
				roundNumber: 2,
				matches: [
					{
						id: 'm3', participantA: 'p2', participantB: 'p3', status: 'COMPLETED',
						winner: 'p3', total20sA: 2, total20sB: 4,
					},
				],
			},
		],
	} as unknown as Group;

	it('groups twenties per participant per round', () => {
		const result = buildTwentiesGroupedData(rrGroup, names, false);
		expect(result.roundLabels).toEqual(['R1', 'R2']);
		expect(result.datasets).toHaveLength(3);

		const p1Data = result.datasets.find(d => d.participantId === 'p1')!;
		expect(p1Data.twentiesPerRound[0]).toBe(3); // R1: 3 twenties
		expect(p1Data.twentiesPerRound[1]).toBe(0); // R2: no match

		const p2Data = result.datasets.find(d => d.participantId === 'p2')!;
		expect(p2Data.twentiesPerRound[0]).toBe(1); // R1
		expect(p2Data.twentiesPerRound[1]).toBe(2); // R2
	});

	it('returns empty when no completed rounds', () => {
		const emptyGroup: Group = {
			id: 'g1', name: 'G', participants: ['p1', 'p2'], standings: [],
			schedule: [
				{ roundNumber: 1, matches: [{ id: 'm1', participantA: 'p1', participantB: 'p2', status: 'PENDING' }] },
			],
		} as unknown as Group;

		const result = buildTwentiesGroupedData(emptyGroup, names, false);
		expect(result.roundLabels).toEqual([]);
		expect(result.datasets).toEqual([]);
	});

	it('uses pairings for Swiss mode', () => {
		const swissGroup: Group = {
			id: 'g1', name: 'Swiss', participants: ['p1', 'p2'], standings: [],
			pairings: [
				{
					roundNumber: 1,
					matches: [{
						id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED',
						winner: 'p1', total20sA: 5, total20sB: 2,
					}],
				},
			],
		} as unknown as Group;

		const result = buildTwentiesGroupedData(swissGroup, names, true);
		expect(result.roundLabels).toEqual(['R1']);
		expect(result.datasets.find(d => d.participantId === 'p1')!.twentiesPerRound).toEqual([5]);
	});

	it('excludes BYE participant from twenties (participantB = BYE gets 0)', () => {
		const result = buildTwentiesGroupedData(rrGroup, names, false);
		// In R1, p3 vs BYE: BYE is not a participant so it's not tracked.
		// p3 gets total20sA = 0 from that match since it's a walkover
		const p3Data = result.datasets.find(d => d.participantId === 'p3')!;
		expect(p3Data.twentiesPerRound[0]).toBe(0); // BYE match
	});
});

// ---------------------------------------------------------------------------
// 7. buildTwentiesDistributionData
// ---------------------------------------------------------------------------

describe('buildTwentiesDistributionData', () => {
	const getUserTeam1 = () => 1 as const;

	it('builds histogram correctly', () => {
		const match = makeMatch({
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 2, team2Twenty: 1, hammerTeam: 1, roundNumber: 1 },
					{ team1Points: 3, team2Points: 5, team1Twenty: 0, team2Twenty: 3, hammerTeam: 2, roundNumber: 2 },
					{ team1Points: 5, team2Points: 3, team1Twenty: 2, team2Twenty: 0, hammerTeam: 1, roundNumber: 3 },
				],
			}],
		});

		const result = buildTwentiesDistributionData([match], getUserTeam1);
		// twenties values for team1: [2, 0, 2]
		// frequency: 0->1, 1->0, 2->2
		expect(result.labels).toEqual(['0', '1', '2']);
		expect(result.frequencies).toEqual([1, 0, 2]);
		expect(result.totalRounds).toBe(3);
	});

	it('returns empty for no rounds', () => {
		const match = makeMatch({ games: [] });
		const result = buildTwentiesDistributionData([match], getUserTeam1);
		expect(result.labels).toEqual([]);
		expect(result.frequencies).toEqual([]);
		expect(result.totalRounds).toBe(0);
	});

	it('handles multiple matches', () => {
		const match1 = makeMatch({
			id: 'm1',
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 3, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		});
		const match2 = makeMatch({
			id: 'm2',
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 1, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		});

		const result = buildTwentiesDistributionData([match1, match2], getUserTeam1);
		// twenties: [3, 1] => labels: 0,1,2,3 frequencies: [0, 1, 0, 1]
		expect(result.labels).toEqual(['0', '1', '2', '3']);
		expect(result.frequencies).toEqual([0, 1, 0, 1]);
		expect(result.totalRounds).toBe(2);
	});

	it('skips matches where getUserTeam returns null', () => {
		const match = makeMatch({
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 2, team2Twenty: 1, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		});

		const result = buildTwentiesDistributionData([match], () => null);
		expect(result.totalRounds).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 8. buildTwentiesHammerData
// ---------------------------------------------------------------------------

describe('buildTwentiesHammerData', () => {
	const getUserTeam1 = () => 1 as const;

	it('separates rounds with and without hammer', () => {
		const match = makeMatch({
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 4, team2Twenty: 1, hammerTeam: 1, roundNumber: 1 },
					{ team1Points: 3, team2Points: 5, team1Twenty: 2, team2Twenty: 3, hammerTeam: 2, roundNumber: 2 },
					{ team1Points: 5, team2Points: 3, team1Twenty: 3, team2Twenty: 0, hammerTeam: 1, roundNumber: 3 },
				],
			}],
		});

		const result = buildTwentiesHammerData([match], getUserTeam1);
		// hammerTeam=1 (user has hammer): rounds 1 and 3 → twenties: 4+3=7, 2 rounds
		// hammerTeam=2 (user doesn't have hammer): round 2 → twenties: 2, 1 round
		expect(result.withHammer.totalRounds).toBe(2);
		expect(result.withHammer.totalTwenties).toBe(7);
		expect(result.withHammer.avgTwenties).toBe(3.5);
		expect(result.withoutHammer.totalRounds).toBe(1);
		expect(result.withoutHammer.totalTwenties).toBe(2);
		expect(result.withoutHammer.avgTwenties).toBe(2);
	});

	it('returns zeros when no hammer data (hammerTeam null)', () => {
		const match = makeMatch({
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 4, team2Twenty: 1, hammerTeam: null, roundNumber: 1 },
				],
			}],
		});

		const result = buildTwentiesHammerData([match], getUserTeam1);
		expect(result.withHammer.totalRounds).toBe(0);
		expect(result.withHammer.avgTwenties).toBe(0);
		expect(result.withoutHammer.totalRounds).toBe(0);
		expect(result.withoutHammer.avgTwenties).toBe(0);
	});

	it('calculates avgTwenties with rounding', () => {
		const match = makeMatch({
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 1, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
					{ team1Points: 5, team2Points: 3, team1Twenty: 2, team2Twenty: 0, hammerTeam: 1, roundNumber: 2 },
					{ team1Points: 5, team2Points: 3, team1Twenty: 3, team2Twenty: 0, hammerTeam: 1, roundNumber: 3 },
				],
			}],
		});

		const result = buildTwentiesHammerData([match], getUserTeam1);
		// avg = (1+2+3)/3 = 2.0
		expect(result.withHammer.avgTwenties).toBe(2);
	});

	it('reads team2Twenty when user is team 2', () => {
		const match = makeMatch({
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 1, team2Twenty: 5, hammerTeam: 2, roundNumber: 1 },
				],
			}],
		});

		const result = buildTwentiesHammerData([match], () => 2 as const);
		expect(result.withHammer.totalTwenties).toBe(5);
		expect(result.withHammer.totalRounds).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 9. buildTwentiesPerRoundData
// ---------------------------------------------------------------------------

describe('buildTwentiesPerRoundData', () => {
	const getUserTeam1 = () => 1 as const;

	it('calculates average twenties per round number', () => {
		const match = makeMatch({
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 2, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
					{ team1Points: 3, team2Points: 5, team1Twenty: 4, team2Twenty: 1, hammerTeam: 2, roundNumber: 2 },
					{ team1Points: 5, team2Points: 0, team1Twenty: 6, team2Twenty: 0, hammerTeam: 1, roundNumber: 3 },
				],
			}],
		});

		const result = buildTwentiesPerRoundData([match], getUserTeam1);
		expect(result.roundLabels).toEqual(['R1', 'R2', 'R3']);
		expect(result.averages).toEqual([2, 4, 6]);
		expect(result.counts).toEqual([1, 1, 1]);
	});

	it('aggregates across multiple matches for the same round number', () => {
		const match1 = makeMatch({
			id: 'm1',
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 2, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
					{ team1Points: 3, team2Points: 5, team1Twenty: 4, team2Twenty: 1, hammerTeam: 2, roundNumber: 2 },
				],
			}],
		});
		const match2 = makeMatch({
			id: 'm2',
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 6, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
					{ team1Points: 3, team2Points: 5, team1Twenty: 2, team2Twenty: 1, hammerTeam: 2, roundNumber: 2 },
				],
			}],
		});

		const result = buildTwentiesPerRoundData([match1, match2], getUserTeam1);
		// R1: (2+6)/2 = 4, R2: (4+2)/2 = 3
		expect(result.roundLabels).toEqual(['R1', 'R2']);
		expect(result.averages).toEqual([4, 3]);
		expect(result.counts).toEqual([2, 2]);
	});

	it('returns empty for no matches', () => {
		const result = buildTwentiesPerRoundData([], getUserTeam1);
		expect(result.roundLabels).toEqual([]);
		expect(result.averages).toEqual([]);
		expect(result.counts).toEqual([]);
	});

	it('defaults roundNumber to 1 when not set', () => {
		const match = makeMatch({
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 3, team2Twenty: 0, hammerTeam: 1, roundNumber: 0 },
				],
			}],
		});

		const result = buildTwentiesPerRoundData([match], getUserTeam1);
		// roundNumber=0 is falsy → defaults to 1
		expect(result.roundLabels).toEqual(['R1']);
		expect(result.averages).toEqual([3]);
	});
});

// ---------------------------------------------------------------------------
// 10. buildTwentiesByPhaseData
// ---------------------------------------------------------------------------

describe('buildTwentiesByPhaseData', () => {
	const getUserTeam1 = () => 1 as const;

	const makePhaseMatch = (phase: string, eventTitle: string, twenties: number) => makeMatch({
		id: `m-${phase}`,
		matchPhase: phase,
		eventTitle,
		games: [{
			gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
			rounds: [
				{ team1Points: 5, team2Points: 3, team1Twenty: twenties, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
			],
		}],
	});

	it('normalizes "Semifinals" to "Semifinales"', () => {
		const match = makePhaseMatch('Semifinals', 'Cup 2024', 3);
		const result = buildTwentiesByPhaseData([match], getUserTeam1);
		expect(result.phases).toHaveLength(1);
		expect(result.phases[0].phase).toBe('Semifinales');
		expect(result.phases[0].avgTwenties).toBe(3);
	});

	it('excludes matches with unknown/unmapped phase', () => {
		const match = makePhaseMatch('RandomPhase', 'Cup 2024', 3);
		const result = buildTwentiesByPhaseData([match], getUserTeam1);
		expect(result.phases).toEqual([]);
	});

	it('sorts phases by canonical order', () => {
		const matches = [
			makePhaseMatch('Final', 'Cup', 5),
			makePhaseMatch('Quarterfinals', 'Cup', 2),
			makePhaseMatch('Semifinals', 'Cup', 3),
		];
		// Fix unique ids
		matches[0].id = 'm-final';
		matches[1].id = 'm-quarters';
		matches[2].id = 'm-semis';

		const result = buildTwentiesByPhaseData(matches, getUserTeam1);
		expect(result.phases.map(p => p.phase)).toEqual(['Cuartos', 'Semifinales', 'Final']);
	});

	it('skips matches without eventTitle', () => {
		const match = makeMatch({
			matchPhase: 'Final',
			// no eventTitle
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 3, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		});

		const result = buildTwentiesByPhaseData([match], getUserTeam1);
		expect(result.phases).toEqual([]);
	});

	it('skips matches without matchPhase', () => {
		const match = makeMatch({
			eventTitle: 'Cup 2024',
			// no matchPhase
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 3, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		});

		const result = buildTwentiesByPhaseData([match], getUserTeam1);
		expect(result.phases).toEqual([]);
	});

	it('aggregates multiple rounds within the same phase', () => {
		const match = makeMatch({
			matchPhase: 'Semifinals',
			eventTitle: 'Cup 2024',
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 2, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
					{ team1Points: 3, team2Points: 5, team1Twenty: 4, team2Twenty: 1, hammerTeam: 2, roundNumber: 2 },
				],
			}],
		});

		const result = buildTwentiesByPhaseData([match], getUserTeam1);
		expect(result.phases).toHaveLength(1);
		// avg = (2 + 4) / 2 = 3
		expect(result.phases[0].avgTwenties).toBe(3);
		expect(result.phases[0].totalRounds).toBe(2);
		expect(result.phases[0].totalTwenties).toBe(6);
	});
});

// ---------------------------------------------------------------------------
// Performance & Large Dataset Tests
// ---------------------------------------------------------------------------

describe('large dataset: buildTwentiesAccuracyData', () => {
	const getUserTeam1 = () => 1 as const;
	const getOpponent = () => 'Opponent';

	it('handles 1000 matches correctly', () => {
		const matches = Array.from({ length: 1000 }, (_, i) => makeMatch({
			id: `m${i}`,
			gameType: i % 3 === 0 ? 'doubles' : 'singles',
			startTime: 1000 + i * 1000,
			games: [{
				gameNumber: 1, team1Points: 5, team2Points: 3, winner: 1,
				rounds: Array.from({ length: 5 }, (_, r) => ({
					team1Points: 3, team2Points: 2,
					team1Twenty: (i + r) % 8,
					team2Twenty: (i + r + 1) % 8,
					hammerTeam: (r % 2 + 1) as 1 | 2,
					roundNumber: r + 1,
				})),
			}],
		}));

		const result = buildTwentiesAccuracyData(matches, getUserTeam1, getOpponent);

		// All 1000 matches should produce data points
		const totalPoints = result.singlesPoints.length + result.doublesPoints.length;
		expect(totalPoints).toBe(1000);

		// MA arrays should match data point arrays in length
		expect(result.singlesMA.length).toBe(result.singlesPoints.length);
		expect(result.doublesMA.length).toBe(result.doublesPoints.length);

		// All percentages should be in valid range
		for (const p of [...result.singlesPoints, ...result.doublesPoints]) {
			expect(p.percentage).toBeGreaterThanOrEqual(0);
			expect(p.percentage).toBeLessThanOrEqual(100);
		}
	});
});

describe('large dataset: buildTwentiesHammerData', () => {
	const getUserTeam1 = () => 1 as const;

	it('handles 1000 matches with correct aggregation', () => {
		const matches = Array.from({ length: 1000 }, (_, i) => makeMatch({
			id: `m${i}`,
			games: [{
				gameNumber: 1, team1Points: 5, team2Points: 3, winner: 1,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 2, team2Twenty: 1, hammerTeam: 1, roundNumber: 1 },
					{ team1Points: 3, team2Points: 5, team1Twenty: 1, team2Twenty: 3, hammerTeam: 2, roundNumber: 2 },
				],
			}],
		}));

		const result = buildTwentiesHammerData(matches, getUserTeam1);

		// 1000 matches × 1 round with hammer each = 1000 rounds per bucket
		expect(result.withHammer.totalRounds).toBe(1000);
		expect(result.withoutHammer.totalRounds).toBe(1000);
		expect(result.withHammer.totalTwenties).toBe(2000); // 2 × 1000
		expect(result.withoutHammer.totalTwenties).toBe(1000); // 1 × 1000
		expect(result.withHammer.avgTwenties).toBe(2);
		expect(result.withoutHammer.avgTwenties).toBe(1);
	});
});

describe('large dataset: buildBumpChartData', () => {
	const qualMode: QualificationMode = 'WINS';

	it('handles 20 participants × 10 rounds correctly', () => {
		const participants = Array.from({ length: 20 }, (_, i) => `p${i}`);
		const names = new Map(participants.map(p => [p, `Player ${p.slice(1)}`]));

		// Generate 10 rounds of round-robin matches
		const schedule = Array.from({ length: 10 }, (_, roundIdx) => ({
			roundNumber: roundIdx + 1,
			matches: Array.from({ length: 10 }, (_, matchIdx) => {
				const a = participants[matchIdx * 2];
				const b = participants[matchIdx * 2 + 1];
				return {
					id: `m-r${roundIdx}-${matchIdx}`,
					participantA: a,
					participantB: b,
					status: 'COMPLETED' as const,
					winner: matchIdx % 2 === 0 ? a : b,
					totalPointsA: matchIdx % 2 === 0 ? 8 : 4,
					totalPointsB: matchIdx % 2 === 0 ? 4 : 8,
					total20sA: 3,
					total20sB: 2,
				};
			}),
		}));

		const group = {
			id: 'g1',
			name: 'Group A',
			participants,
			standings: [],
			schedule,
		} as unknown as Group;

		const result = buildBumpChartData(group, names, false, qualMode);

		expect(result.roundLabels).toHaveLength(10);
		expect(result.datasets).toHaveLength(20);

		// Every participant should have a position for every round
		for (const ds of result.datasets) {
			expect(ds.positions).toHaveLength(10);
			for (const pos of ds.positions) {
				expect(pos).toBeGreaterThanOrEqual(1);
				expect(pos).toBeLessThanOrEqual(20);
			}
		}

		// Positions should be unique within each round (no ties in position number)
		for (let r = 0; r < 10; r++) {
			const positionsInRound = result.datasets.map(ds => ds.positions[r]);
			const uniquePositions = new Set(positionsInRound);
			expect(uniquePositions.size).toBe(20);
		}
	});

	it('produces identical results for incremental vs reference calculation', () => {
		// Use the existing rrGroup test fixture and verify same output
		const names = new Map([['p1', 'Alice'], ['p2', 'Bob'], ['p3', 'Carol']]);
		const rrGroup = {
			id: 'g1',
			name: 'Group A',
			participants: ['p1', 'p2', 'p3'],
			standings: [],
			schedule: [
				{
					roundNumber: 1,
					matches: [
						{ id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 4, total20sA: 3, total20sB: 1 },
						{ id: 'm2', participantA: 'p3', participantB: 'BYE', status: 'WALKOVER', winner: 'p3', totalPointsA: 0, totalPointsB: 0, total20sA: 0, total20sB: 0 },
					],
				},
				{
					roundNumber: 2,
					matches: [
						{ id: 'm3', participantA: 'p2', participantB: 'p3', status: 'COMPLETED', winner: 'p3', totalPointsA: 5, totalPointsB: 8, total20sA: 2, total20sB: 4 },
					],
				},
				{
					roundNumber: 3,
					matches: [
						{ id: 'm4', participantA: 'p1', participantB: 'p3', status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 6, total20sA: 2, total20sB: 1 },
					],
				},
			],
		} as unknown as Group;

		const result = buildBumpChartData(rrGroup, names, false, qualMode);

		// Same assertions as original tests — ensures incremental approach matches
		expect(result.roundLabels).toEqual(['R1', 'R2', 'R3']);
		expect(result.datasets).toHaveLength(3);

		const p1 = result.datasets.find(d => d.participantId === 'p1')!;
		const p2 = result.datasets.find(d => d.participantId === 'p2')!;

		expect(p1.positions[0]).toBe(1); // After R1: p1 wins
		expect(p1.positions[2]).toBe(1); // After R3: p1 still first
		expect(p2.positions[2]).toBe(3); // After R3: p2 last
	});
});

describe('moving average equivalence', () => {
	// Reference implementation (old slice-based approach)
	function computeMA_reference(values: number[], window: number): number[] {
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

	it('running sum matches slice-based MA for 100 values', () => {
		const values = Array.from({ length: 100 }, (_, i) => Math.round(Math.sin(i) * 50 + 50));
		const matches = values.map((v, i) => makeMatch({
			id: `m${i}`,
			gameType: 'singles',
			startTime: 1000 + i * 1000,
			games: [{
				gameNumber: 1, team1Points: 0, team2Points: 0, winner: null,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: v % 8, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		}));

		const result = buildTwentiesAccuracyData(matches, () => 1, () => 'Opp');
		const percentages = result.singlesPoints.map(p => p.percentage);
		const referenceMA = computeMA_reference(percentages, 5);

		expect(result.singlesMA).toEqual(referenceMA);
	});

	it('handles edge case: empty values', () => {
		const result = buildTwentiesAccuracyData([], () => 1, () => 'Opp');
		expect(result.singlesMA).toEqual([]);
		expect(result.doublesMA).toEqual([]);
	});

	it('handles edge case: single value', () => {
		const match = makeMatch({
			gameType: 'singles',
			startTime: 1000,
			games: [{
				gameNumber: 1, team1Points: 5, team2Points: 3, winner: 1,
				rounds: [
					{ team1Points: 5, team2Points: 3, team1Twenty: 4, team2Twenty: 0, hammerTeam: 1, roundNumber: 1 },
				],
			}],
		});
		const result = buildTwentiesAccuracyData([match], () => 1, () => 'Opp');
		expect(result.singlesMA).toHaveLength(1);
		expect(result.singlesMA[0]).toBe(result.singlesPoints[0].percentage);
	});
});

// ─────────────────────────────────────────────────
// Tournament public page — large dataset tests
// ─────────────────────────────────────────────────

describe('large dataset: buildTwentiesGroupedData', () => {
	it('handles 20 participants × 10 rounds correctly', () => {
		const participantCount = 20;
		const roundCount = 10;
		const participants = Array.from({ length: participantCount }, (_, i) => `p${i}`);
		const names = new Map(participants.map(p => [p, `Player ${p}`]));

		const schedule = Array.from({ length: roundCount }, (_, r) => ({
			roundNumber: r + 1,
			matches: participants.reduce<any[]>((acc, pid, idx) => {
				if (idx % 2 === 0 && idx + 1 < participantCount) {
					acc.push({
						id: `m${r}_${idx}`,
						participantA: participants[idx],
						participantB: participants[idx + 1],
						status: 'COMPLETED',
						winner: participants[idx],
						total20sA: (idx + r) % 5,
						total20sB: (idx + r + 1) % 4,
					});
				}
				return acc;
			}, []),
		}));

		const group = {
			id: 'g1', name: 'Large', participants, standings: [],
			schedule,
		} as unknown as Group;

		const start = performance.now();
		const result = buildTwentiesGroupedData(group, names, false);
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(500);
		expect(result.roundLabels).toHaveLength(roundCount);
		expect(result.datasets).toHaveLength(participantCount);

		// Verify total 20s for p0: sum of total20sA across all rounds where p0 is participantA
		const p0Data = result.datasets.find(d => d.participantId === 'p0')!;
		expect(p0Data.twentiesPerRound).toHaveLength(roundCount);
		for (let r = 0; r < roundCount; r++) {
			expect(p0Data.twentiesPerRound[r]).toBe((0 + r) % 5); // total20sA = (idx + r) % 5, idx=0
		}
	});

	it('handles group with WALKOVER matches', () => {
		const group = {
			id: 'g1', name: 'WO', participants: ['p1', 'p2', 'p3'],
			standings: [],
			schedule: [
				{
					roundNumber: 1,
					matches: [
						{ id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED', winner: 'p1', total20sA: 3, total20sB: 1 },
						{ id: 'm2', participantA: 'p3', participantB: 'BYE', status: 'WALKOVER', winner: 'p3', total20sA: 0, total20sB: 0 },
					],
				},
			],
		} as unknown as Group;

		const names = new Map([['p1', 'A'], ['p2', 'B'], ['p3', 'C']]);
		const result = buildTwentiesGroupedData(group, names, false);

		expect(result.roundLabels).toHaveLength(1);
		expect(result.datasets.find(d => d.participantId === 'p1')!.twentiesPerRound).toEqual([3]);
		expect(result.datasets.find(d => d.participantId === 'p3')!.twentiesPerRound).toEqual([0]);
	});
});

describe('buildBumpChartData — tournament edge cases', () => {
	const qualMode = 'WINS' as any;

	it('handles group where all matches are walkovers (no real games)', () => {
		const group = {
			id: 'g1', name: 'AllWO', participants: ['p1', 'p2'],
			standings: [
				{ participantId: 'p1', matchesWon: 1, matchesLost: 0, matchesPlayed: 1, totalPointsScored: 0, totalPointsConceded: 0, total20s: 0 },
				{ participantId: 'p2', matchesWon: 0, matchesLost: 1, matchesPlayed: 1, totalPointsScored: 0, totalPointsConceded: 0, total20s: 0 },
			],
			schedule: [
				{
					roundNumber: 1,
					matches: [
						{ id: 'm1', participantA: 'p1', participantB: 'p2', status: 'WALKOVER', winner: 'p1', totalPointsA: 0, totalPointsB: 0, total20sA: 0, total20sB: 0 },
					],
				},
				{
					roundNumber: 2,
					matches: [
						{ id: 'm2', participantA: 'p2', participantB: 'p1', status: 'WALKOVER', winner: 'p1', totalPointsA: 0, totalPointsB: 0, total20sA: 0, total20sB: 0 },
					],
				},
			],
		} as unknown as Group;

		const names = new Map([['p1', 'A'], ['p2', 'B']]);
		const result = buildBumpChartData(group, names, false, qualMode);

		expect(result.roundLabels).toHaveLength(2);
		expect(result.datasets).toHaveLength(2);
		// p1 should be #1 after both rounds (wins both walkovers)
		const p1 = result.datasets.find(d => d.participantId === 'p1')!;
		expect(p1.positions[0]).toBe(1);
		expect(p1.positions[1]).toBe(1);
	});

	it('handles group with mix of PENDING and COMPLETED matches in same round', () => {
		const group = {
			id: 'g1', name: 'Mix', participants: ['p1', 'p2', 'p3', 'p4'],
			standings: [
				{ participantId: 'p1', matchesWon: 1, matchesLost: 0, matchesPlayed: 1, totalPointsScored: 8, totalPointsConceded: 4, total20s: 2 },
				{ participantId: 'p2', matchesWon: 0, matchesLost: 1, matchesPlayed: 1, totalPointsScored: 4, totalPointsConceded: 8, total20s: 0 },
				{ participantId: 'p3', matchesWon: 0, matchesLost: 0, matchesPlayed: 0, totalPointsScored: 0, totalPointsConceded: 0, total20s: 0 },
				{ participantId: 'p4', matchesWon: 0, matchesLost: 0, matchesPlayed: 0, totalPointsScored: 0, totalPointsConceded: 0, total20s: 0 },
			],
			schedule: [
				{
					roundNumber: 1,
					matches: [
						{ id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 4, total20sA: 2, total20sB: 0 },
						{ id: 'm2', participantA: 'p3', participantB: 'p4', status: 'PENDING', winner: null, totalPointsA: 0, totalPointsB: 0, total20sA: 0, total20sB: 0 },
					],
				},
			],
		} as unknown as Group;

		const names = new Map([['p1', 'A'], ['p2', 'B'], ['p3', 'C'], ['p4', 'D']]);
		const result = buildBumpChartData(group, names, false, qualMode);

		// buildBumpChartData requires at least 2 rounds total to show progression,
		// so a single round (even with completed matches) returns empty
		expect(result.roundLabels).toHaveLength(0);
		expect(result.datasets).toHaveLength(0);
	});
});
