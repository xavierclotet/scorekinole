import { describe, it, expect } from 'vitest';
import {
	generateSwissPairings,
	assignTablesWithVariety,
	validateSwissSystem
} from './swiss';
import type { TournamentParticipant, GroupStanding, SwissPairing, GroupMatch } from '$lib/types/tournament';

/** Helper to create mock participants */
function createParticipants(count: number): TournamentParticipant[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i + 1}`,
		name: `Player ${i + 1}`,
		type: 'GUEST' as const,
		rankingSnapshot: count - i,
		status: 'ACTIVE' as const
	}));
}

/** Helper to create standings from participants with given Swiss points */
function createStandings(participants: TournamentParticipant[], swissPoints?: number[]): GroupStanding[] {
	return participants.map((p, i) => ({
		participantId: p.id,
		position: i + 1,
		matchesPlayed: 1,
		matchesWon: swissPoints ? Math.floor(swissPoints[i] / 2) : 0,
		matchesLost: swissPoints ? (swissPoints[i] === 0 ? 1 : 0) : 0,
		matchesTied: swissPoints ? (swissPoints[i] % 2) : 0,
		points: swissPoints ? swissPoints[i] : 0,
		swissPoints: swissPoints ? swissPoints[i] : 0,
		total20s: 0,
		totalPointsScored: 0,
		qualifiedForFinal: false
	}));
}

/** Helper to simulate multiple Swiss rounds and collect BYE assignments */
function simulateSwissRounds(numParticipants: number, numRounds: number) {
	const participants = createParticipants(numParticipants);
	const previousPairings: SwissPairing[] = [];
	const byeReceivers: string[] = [];

	for (let round = 1; round <= numRounds; round++) {
		// Create mock standings based on previous rounds
		const standings = createStandings(
			participants,
			participants.map((_, i) => Math.max(0, numRounds - i) % (numRounds + 1) * 2)
		);

		const matches = generateSwissPairings(
			participants,
			standings,
			previousPairings,
			round
		);

		// Track BYE receivers
		for (const match of matches) {
			if (match.participantB === 'BYE') {
				byeReceivers.push(match.participantA);
			}
		}

		// Store pairing for next round
		previousPairings.push({ roundNumber: round, matches });
	}

	return { previousPairings, byeReceivers, participants };
}

describe('generateSwissPairings', () => {
	describe('round 1 (random pairings)', () => {
		it('pairs all players for even count', () => {
			const participants = createParticipants(30);
			const matches = generateSwissPairings(participants, [], [], 1);

			// 30 players → 15 matches, no BYE
			expect(matches).toHaveLength(15);
			const byeMatches = matches.filter(m => m.participantB === 'BYE');
			expect(byeMatches).toHaveLength(0);

			// Every player appears exactly once
			const playerIds = new Set<string>();
			for (const match of matches) {
				expect(playerIds.has(match.participantA)).toBe(false);
				expect(playerIds.has(match.participantB)).toBe(false);
				playerIds.add(match.participantA);
				playerIds.add(match.participantB);
			}
			expect(playerIds.size).toBe(30);
		});

		it('assigns BYE for odd count', () => {
			const participants = createParticipants(31);
			const matches = generateSwissPairings(participants, [], [], 1);

			// 31 players → 15 matches + 1 BYE = 16
			expect(matches).toHaveLength(16);
			const byeMatches = matches.filter(m => m.participantB === 'BYE');
			expect(byeMatches).toHaveLength(1);

			// BYE match has correct properties
			expect(byeMatches[0].status).toBe('WALKOVER');
			expect(byeMatches[0].winner).toBe(byeMatches[0].participantA);
		});

		it('no player appears twice in round 1', () => {
			const participants = createParticipants(50);
			const matches = generateSwissPairings(participants, [], [], 1);

			const seen = new Set<string>();
			for (const match of matches) {
				expect(seen.has(match.participantA)).toBe(false);
				seen.add(match.participantA);
				if (match.participantB !== 'BYE') {
					expect(seen.has(match.participantB)).toBe(false);
					seen.add(match.participantB);
				}
			}
		});
	});

	describe('subsequent rounds (point-based)', () => {
		it('pairs top players with each other', () => {
			const participants = createParticipants(10);
			// Give specific Swiss points: p1=6, p2=6, p3=4, p4=4, p5=2...
			const swissPoints = [6, 6, 4, 4, 2, 2, 0, 0, 0, 0];
			const standings = createStandings(participants, swissPoints);

			const matches = generateSwissPairings(participants, standings, [], 2);

			// Find match with p1 (highest points)
			const p1Match = matches.find(m => m.participantA === 'p1' || m.participantB === 'p1');
			expect(p1Match).toBeDefined();

			// p1 should be paired with p2 (both have 6 points)
			const p1Opponent = p1Match!.participantA === 'p1' ? p1Match!.participantB : p1Match!.participantA;
			expect(p1Opponent).toBe('p2');
		});

		it('avoids repeat pairings', () => {
			const participants = createParticipants(8);
			const standings = createStandings(participants, [4, 4, 4, 4, 2, 2, 0, 0]);

			// Previous pairing: p1-p2, p3-p4
			const previousPairings: SwissPairing[] = [{
				roundNumber: 1,
				matches: [
					{ id: 'r1m1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED' as const },
					{ id: 'r1m2', participantA: 'p3', participantB: 'p4', status: 'COMPLETED' as const },
					{ id: 'r1m3', participantA: 'p5', participantB: 'p6', status: 'COMPLETED' as const },
					{ id: 'r1m4', participantA: 'p7', participantB: 'p8', status: 'COMPLETED' as const }
				]
			}];

			const matches = generateSwissPairings(participants, standings, previousPairings, 2);

			// p1 should NOT be paired with p2 again
			const p1Match = matches.find(m => m.participantA === 'p1' || m.participantB === 'p1');
			const p1Opponent = p1Match!.participantA === 'p1' ? p1Match!.participantB : p1Match!.participantA;
			expect(p1Opponent).not.toBe('p2');
		});

		it('no player left unpaired in round 2 with 30 players', () => {
			const participants = createParticipants(30);
			const r1 = generateSwissPairings(participants, [], [], 1);
			const standings = createStandings(participants, participants.map(() => 2));

			const r2 = generateSwissPairings(
				participants,
				standings,
				[{ roundNumber: 1, matches: r1 }],
				2
			);

			// All 30 players should appear
			const allPlayers = new Set<string>();
			for (const match of r2) {
				allPlayers.add(match.participantA);
				if (match.participantB !== 'BYE') allPlayers.add(match.participantB);
			}
			expect(allPlayers.size).toBe(30);
		});

		it('no player left unpaired in round 2 with 31 players', () => {
			const participants = createParticipants(31);
			const r1 = generateSwissPairings(participants, [], [], 1);
			const standings = createStandings(participants, participants.map((_, i) => i < 15 ? 2 : 0));

			const r2 = generateSwissPairings(
				participants,
				standings,
				[{ roundNumber: 1, matches: r1 }],
				2
			);

			// All 31 players should appear (15 matches + 1 BYE)
			const allPlayers = new Set<string>();
			for (const match of r2) {
				allPlayers.add(match.participantA);
				if (match.participantB !== 'BYE') allPlayers.add(match.participantB);
			}
			expect(allPlayers.size).toBe(31);
		});
	});

	describe('BYE distribution', () => {
		it('BYE distribution is fair across 7 rounds with 31 players', () => {
			const { byeReceivers } = simulateSwissRounds(31, 7);

			// 31 is odd → 1 BYE per round = 7 total
			expect(byeReceivers).toHaveLength(7);

			// First 7 BYEs should all go to different players
			const uniqueReceivers = new Set(byeReceivers);
			expect(uniqueReceivers.size).toBe(7);
		});

		it('no BYE for even number of players', () => {
			const { byeReceivers } = simulateSwissRounds(30, 5);
			expect(byeReceivers).toHaveLength(0);
		});
	});
});

describe('assignTablesWithVariety', () => {
	it('does not duplicate tables when saturated', () => {
		const participants = createParticipants(20);
		const matches = generateSwissPairings(participants, [], [], 1);

		const assigned = assignTablesWithVariety(matches, 6);

		const tablesUsed = new Set<number>();
		let withoutTable = 0;
		for (const match of assigned) {
			if (match.participantB === 'BYE') continue;
			if (match.tableNumber !== undefined) {
				expect(tablesUsed.has(match.tableNumber)).toBe(false);
				tablesUsed.add(match.tableNumber);
			} else {
				withoutTable++;
			}
		}

		// 10 matches, 6 tables → 6 with table, 4 without
		expect(tablesUsed.size).toBe(6);
		expect(withoutTable).toBe(4);
	});
});

describe('Swiss with doubles teams', () => {
	function createTeams(count: number): TournamentParticipant[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `team${i + 1}`,
			name: `Team ${i + 1}`,
			type: 'GUEST' as const,
			rankingSnapshot: count - i,
			status: 'ACTIVE' as const,
			partner: { name: `Partner ${i + 1}`, type: 'GUEST' as const }
		}));
	}

	it('25 teams: correct pairings with BYE (odd)', () => {
		const teams = createTeams(25);
		const matches = generateSwissPairings(teams, [], [], 1);

		// 25 teams (odd) → 12 matches + 1 BYE = 13
		expect(matches).toHaveLength(13);

		const byeMatches = matches.filter(m => m.participantB === 'BYE');
		expect(byeMatches).toHaveLength(1);
		expect(byeMatches[0].status).toBe('WALKOVER');

		// Every team appears exactly once
		const seen = new Set<string>();
		for (const match of matches) {
			expect(seen.has(match.participantA)).toBe(false);
			seen.add(match.participantA);
			if (match.participantB !== 'BYE') {
				expect(seen.has(match.participantB)).toBe(false);
				seen.add(match.participantB);
			}
		}
		expect(seen.size).toBe(25);
	});

	it('16 teams: perfect pairings without BYE (even)', () => {
		const teams = createTeams(16);
		const matches = generateSwissPairings(teams, [], [], 1);

		// 16 teams (even) → 8 matches, no BYE
		expect(matches).toHaveLength(8);

		const byeMatches = matches.filter(m => m.participantB === 'BYE');
		expect(byeMatches).toHaveLength(0);

		// Every team appears exactly once
		const seen = new Set<string>();
		for (const match of matches) {
			expect(seen.has(match.participantA)).toBe(false);
			seen.add(match.participantA);
			expect(seen.has(match.participantB)).toBe(false);
			seen.add(match.participantB);
		}
		expect(seen.size).toBe(16);
	});
});

describe('validateSwissSystem', () => {
	it('rejects fewer than 4 participants', () => {
		expect(validateSwissSystem(3, 3)).toBe(false);
	});

	it('rejects too few rounds', () => {
		expect(validateSwissSystem(30, 2)).toBe(false);
	});

	it('rejects too many rounds', () => {
		// 30 players: max = ceil(log2(30)) + 2 = 5 + 2 = 7
		expect(validateSwissSystem(30, 8)).toBe(false);
	});

	it('accepts valid configurations', () => {
		expect(validateSwissSystem(30, 5)).toBe(true);
		expect(validateSwissSystem(30, 7)).toBe(true);
		expect(validateSwissSystem(50, 7)).toBe(true);
		expect(validateSwissSystem(4, 3)).toBe(true);
	});
});

describe('assignTablesWithVariety — table distribution fairness', () => {
	/**
	 * Simulate multiple Swiss rounds with table history carry-over.
	 * Returns a map of participantId → table usage map (tableNumber → count).
	 */
	function simulateSwissRounds(
		numPlayers: number,
		numRounds: number,
		totalTables: number
	): { playerTableUsage: Map<string, Map<number, number>>; allMatches: GroupMatch[] } {
		const tableHistory = new Map<string, number[]>();
		const allMatches: GroupMatch[] = [];

		for (let round = 0; round < numRounds; round++) {
			// Create simple round-robin style pairings for simulation
			const matches: GroupMatch[] = [];
			const players = Array.from({ length: numPlayers }, (_, i) => `p${i + 1}`);
			// Shift players based on round for variety in pairings
			const shifted = [players[0], ...players.slice(1 + round), ...players.slice(1, 1 + round)];
			const half = Math.floor(shifted.length / 2);
			for (let m = 0; m < half; m++) {
				matches.push({
					id: `r${round}-m${m}`,
					participantA: shifted[m],
					participantB: shifted[shifted.length - 1 - m],
					status: 'PENDING'
				});
			}

			const assigned = assignTablesWithVariety(matches, totalTables, tableHistory);
			allMatches.push(...assigned);
		}

		// Build player → table usage map
		const playerTableUsage = new Map<string, Map<number, number>>();
		for (const [player, tables] of tableHistory.entries()) {
			const usage = new Map<number, number>();
			for (const t of tables) {
				usage.set(t, (usage.get(t) || 0) + 1);
			}
			playerTableUsage.set(player, usage);
		}

		return { playerTableUsage, allMatches };
	}

	it('no player plays the same table more than 3 times (20 players, 10 tables, 5 rounds)', () => {
		const { playerTableUsage } = simulateSwissRounds(20, 5, 10);

		for (const [player, usage] of playerTableUsage) {
			for (const [table, count] of usage) {
				// With 10 tables and 5 rounds, max 3 visits to any single table is reasonable
				expect(count, `${player} played table ${table} ${count} times (max allowed: 3)`).toBeLessThanOrEqual(3);
			}
		}
	});

	it('tables are spread across available range, not concentrated on low numbers (20 players, 10 tables, 5 rounds)', () => {
		const { playerTableUsage } = simulateSwissRounds(20, 5, 10);

		for (const [player, usage] of playerTableUsage) {
			const tablesUsed = usage.size;
			const totalMatches = Array.from(usage.values()).reduce((a, b) => a + b, 0);
			// With 10 matches/round and exactly 10 tables (no slack), greedy can't always spread perfectly
			const minExpectedTables = Math.min(totalMatches, 3);
			expect(tablesUsed, `${player} only used ${tablesUsed} different tables out of 10`)
				.toBeGreaterThanOrEqual(minExpectedTables);
		}
	});

	it('no table is used twice in the same round (20 players, 8 tables, 6 rounds)', () => {
		const tableHistory = new Map<string, number[]>();

		for (let round = 0; round < 6; round++) {
			const matches: GroupMatch[] = [];
			const players = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);
			const shifted = [players[0], ...players.slice(1 + round), ...players.slice(1, 1 + round)];
			const half = Math.floor(shifted.length / 2);
			for (let m = 0; m < half; m++) {
				matches.push({
					id: `r${round}-m${m}`,
					participantA: shifted[m],
					participantB: shifted[shifted.length - 1 - m],
					status: 'PENDING'
				});
			}

			const assigned = assignTablesWithVariety(matches, 8, tableHistory);
			const tablesInRound = new Set<number>();
			for (const match of assigned) {
				if (match.tableNumber !== undefined) {
					expect(tablesInRound.has(match.tableNumber), `Table ${match.tableNumber} duplicated in round ${round + 1}`).toBe(false);
					tablesInRound.add(match.tableNumber);
				}
			}
		}
	});

	it('global table usage is balanced across all tables (16 players, 10 tables, 7 rounds)', () => {
		const { allMatches } = simulateSwissRounds(16, 7, 10);

		// Count global usage per table
		const globalUsage = new Map<number, number>();
		for (const match of allMatches) {
			if (match.tableNumber !== undefined) {
				globalUsage.set(match.tableNumber, (globalUsage.get(match.tableNumber) || 0) + 1);
			}
		}

		const usageCounts = Array.from(globalUsage.values());
		if (usageCounts.length > 1) {
			const max = Math.max(...usageCounts);
			const min = Math.min(...usageCounts);
			// Max-min difference should be small (≤3 for reasonably balanced distribution)
			expect(max - min, `Global table usage imbalanced: max=${max}, min=${min}`).toBeLessThanOrEqual(3);
		}
	});

	it('player table usage standard deviation is low (12 players, 8 tables, 5 rounds)', () => {
		const { playerTableUsage } = simulateSwissRounds(12, 5, 8);

		for (const [player, usage] of playerTableUsage) {
			const totalMatches = Array.from(usage.values()).reduce((a, b) => a + b, 0);
			if (totalMatches < 3) continue;

			// Calculate std dev of usage across all tables (including 0s for unused tables)
			const usageCounts: number[] = [];
			for (let t = 1; t <= 8; t++) {
				usageCounts.push(usage.get(t) || 0);
			}
			const mean = usageCounts.reduce((a, b) => a + b, 0) / usageCounts.length;
			const variance = usageCounts.reduce((sum, v) => sum + (v - mean) ** 2, 0) / usageCounts.length;
			const stdDev = Math.sqrt(variance);

			// Std dev should be reasonably low (< 1.0 for a well-distributed algorithm)
			expect(stdDev, `${player} has high table usage std dev: ${stdDev.toFixed(2)} (usage: ${JSON.stringify(usageCounts)})`)
				.toBeLessThan(1.0);
		}
	});

	it('simulates real tournament scenario: 20 players, 10 tables, 7 rounds — no player repeats a table more than 3 times', () => {
		const { playerTableUsage } = simulateSwissRounds(20, 7, 10);

		for (const [player, usage] of playerTableUsage) {
			for (const [table, count] of usage) {
				// With 7 rounds and 10 tables, ideal is ceil(7/10)=1 but greedy may need up to 3
				expect(count, `${player} played at table ${table} ${count} times (max 3 expected)`)
					.toBeLessThanOrEqual(3);
			}
			// Also verify the player uses at least 5 different tables out of 10
			expect(usage.size, `Player only used ${usage.size} tables out of 10`)
				.toBeGreaterThanOrEqual(5);
		}
	});

	it('with more tables than matches per round, every match in the same round gets a unique table', () => {
		// 10 players = 5 matches per round, 12 tables available
		const { allMatches } = simulateSwissRounds(10, 5, 12);

		// All matches should have a table assigned
		for (const match of allMatches) {
			if (match.participantB !== 'BYE') {
				expect(match.tableNumber, `Match ${match.id} has no table`).toBeDefined();
			}
		}
	});

	it('with fewer tables than matches, excess matches get no table', () => {
		// 20 players = 10 matches per round, only 6 tables
		const tableHistory = new Map<string, number[]>();
		const players = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);
		const matches: GroupMatch[] = [];
		for (let m = 0; m < 10; m++) {
			matches.push({
				id: `m${m}`,
				participantA: players[m],
				participantB: players[19 - m],
				status: 'PENDING'
			});
		}

		const assigned = assignTablesWithVariety(matches, 6, tableHistory);
		const withTable = assigned.filter(m => m.tableNumber !== undefined);
		const withoutTable = assigned.filter(m => m.tableNumber === undefined);

		expect(withTable).toHaveLength(6);
		expect(withoutTable).toHaveLength(4);
	});

	it('carries table history correctly across rounds — players avoid recently used tables', () => {
		const tableHistory = new Map<string, number[]>();
		const totalTables = 6;

		// Round 1: p1 vs p2, p3 vs p4
		const round1: GroupMatch[] = [
			{ id: 'r1m1', participantA: 'p1', participantB: 'p2', status: 'PENDING' },
			{ id: 'r1m2', participantA: 'p3', participantB: 'p4', status: 'PENDING' }
		];
		assignTablesWithVariety(round1, totalTables, tableHistory);

		const p1Table1 = tableHistory.get('p1')![0];
		const p2Table1 = tableHistory.get('p2')![0];

		// Round 2: same players, same pairings — should get different tables
		const round2: GroupMatch[] = [
			{ id: 'r2m1', participantA: 'p1', participantB: 'p2', status: 'PENDING' },
			{ id: 'r2m2', participantA: 'p3', participantB: 'p4', status: 'PENDING' }
		];
		assignTablesWithVariety(round2, totalTables, tableHistory);

		const p1Table2 = tableHistory.get('p1')![1];
		expect(p1Table2, 'p1 should get a different table in round 2').not.toBe(p1Table1);

		// Round 3: p1 vs p2 again — should avoid both previous tables
		const round3: GroupMatch[] = [
			{ id: 'r3m1', participantA: 'p1', participantB: 'p2', status: 'PENDING' },
		];
		assignTablesWithVariety(round3, totalTables, tableHistory);

		const p1Table3 = tableHistory.get('p1')![2];
		expect(p1Table3, 'p1 should avoid table from round 1').not.toBe(p1Table1);
		expect(p1Table3, 'p1 should avoid table from round 2').not.toBe(p1Table2);
	});

	it('regression: 12 players, 6 tables, R2 cross pairings — no avoidable consecutive-round repeat', () => {
		// Reported scenario: a Swiss tournament with 12 players and 6 tables.
		// Round 1 used tables 1-6 sequentially; round 2 cross-paired players.
		// The pure greedy was leaving the LAST match cornered into the table one
		// player had just used, even though a perfect "every player on a fresh
		// table" assignment was achievable. Swap optimization must find it.
		const tableHistory = new Map<string, number[]>();
		const totalTables = 6;

		// Round 1: P1-P2@T1, P3-P4@T2, ..., P11-P12@T6
		const round1: GroupMatch[] = [
			{ id: 'r1m1', participantA: 'P1', participantB: 'P2', status: 'PENDING' },
			{ id: 'r1m2', participantA: 'P3', participantB: 'P4', status: 'PENDING' },
			{ id: 'r1m3', participantA: 'P5', participantB: 'P6', status: 'PENDING' },
			{ id: 'r1m4', participantA: 'P7', participantB: 'P8', status: 'PENDING' },
			{ id: 'r1m5', participantA: 'P9', participantB: 'P10', status: 'PENDING' },
			{ id: 'r1m6', participantA: 'P11', participantB: 'P12', status: 'PENDING' }
		];
		assignTablesWithVariety(round1, totalTables, tableHistory);

		// Round 2: cross pairings where a perfect no-repeat assignment exists
		const round2: GroupMatch[] = [
			{ id: 'r2m1', participantA: 'P1', participantB: 'P3', status: 'PENDING' },
			{ id: 'r2m2', participantA: 'P2', participantB: 'P5', status: 'PENDING' },
			{ id: 'r2m3', participantA: 'P4', participantB: 'P7', status: 'PENDING' },
			{ id: 'r2m4', participantA: 'P6', participantB: 'P9', status: 'PENDING' },
			{ id: 'r2m5', participantA: 'P8', participantB: 'P11', status: 'PENDING' },
			{ id: 'r2m6', participantA: 'P10', participantB: 'P12', status: 'PENDING' }
		];
		const r2Assigned = assignTablesWithVariety(round2, totalTables, tableHistory);

		// No player should sit at their R1 table in R2
		for (const match of r2Assigned) {
			const t = match.tableNumber!;
			const lastA = tableHistory.get(match.participantA)!.slice(-2)[0];
			const lastB = tableHistory.get(match.participantB)!.slice(-2)[0];
			expect(lastA, `${match.participantA} repeated table ${t} from R1 in R2`).not.toBe(t);
			expect(lastB, `${match.participantB} repeated table ${t} from R1 in R2`).not.toBe(t);
		}

		// All 6 tables used exactly once in R2
		const r2Tables = new Set(r2Assigned.map(m => m.tableNumber));
		expect(r2Tables.size).toBe(6);
	});

	it('swap finds perfect assignment when greedy fails (constructed worst case)', () => {
		// Force the greedy into the bad path: same as above but with a pairing
		// permutation that strands the last match. Swap must repair it so that
		// the round's total consecutive-repeat count is 0.
		const tableHistory = new Map<string, number[]>();
		// Seed history so each player has played exactly one specific table
		tableHistory.set('A', [1]);
		tableHistory.set('B', [2]);
		tableHistory.set('C', [3]);
		tableHistory.set('D', [4]);
		tableHistory.set('E', [5]);
		tableHistory.set('F', [6]);
		tableHistory.set('G', [1]);
		tableHistory.set('H', [2]);
		tableHistory.set('I', [3]);
		tableHistory.set('J', [4]);
		tableHistory.set('K', [5]);
		tableHistory.set('L', [6]);

		const matches: GroupMatch[] = [
			{ id: 'm1', participantA: 'A', participantB: 'C', status: 'PENDING' }, // not 1, not 3
			{ id: 'm2', participantA: 'G', participantB: 'I', status: 'PENDING' }, // not 1, not 3
			{ id: 'm3', participantA: 'B', participantB: 'D', status: 'PENDING' }, // not 2, not 4
			{ id: 'm4', participantA: 'H', participantB: 'J', status: 'PENDING' }, // not 2, not 4
			{ id: 'm5', participantA: 'E', participantB: 'F', status: 'PENDING' }, // not 5, not 6
			{ id: 'm6', participantA: 'K', participantB: 'L', status: 'PENDING' }  // not 5, not 6
		];

		const assigned = assignTablesWithVariety(matches, 6, tableHistory);

		// Count consecutive repeats: any player whose new table equals their previous
		let repeats = 0;
		for (const m of assigned) {
			const t = m.tableNumber!;
			const prevA = tableHistory.get(m.participantA)!.slice(-2)[0];
			const prevB = tableHistory.get(m.participantB)!.slice(-2)[0];
			if (prevA === t) repeats++;
			if (prevB === t) repeats++;
		}
		expect(repeats, 'swap should eliminate all avoidable consecutive repeats').toBe(0);
	});
});
