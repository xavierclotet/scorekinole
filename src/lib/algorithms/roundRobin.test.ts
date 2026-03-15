import { describe, it, expect } from 'vitest';
import {
	generateRoundRobinSchedule,
	splitIntoGroups,
	assignTablesToRounds,
	assignTablesGlobally,
	calculateRoundRobinRounds,
	validateRoundRobinGroupSize
} from './roundRobin';
import type { TournamentParticipant } from '$lib/types/tournament';

/** Helper to create mock participants */
function createParticipants(count: number): TournamentParticipant[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i + 1}`,
		name: `Player ${i + 1}`,
		type: 'GUEST' as const,
		rankingSnapshot: count - i, // descending ranking
		status: 'ACTIVE' as const
	}));
}

describe('generateRoundRobinSchedule', () => {
	it('every pair plays exactly once for 20 players', () => {
		const ids = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);

		// 20 players → 19 rounds
		expect(rounds).toHaveLength(19);

		// Collect all pairs (normalized)
		const pairs = new Set<string>();
		for (const round of rounds) {
			for (const match of round.matches) {
				if (match.participantB === 'BYE') continue;
				const pair = [match.participantA, match.participantB].sort().join('-');
				// No duplicate pairs
				expect(pairs.has(pair)).toBe(false);
				pairs.add(pair);
			}
		}

		// C(20,2) = 190 unique pairs
		expect(pairs.size).toBe(190);
	});

	it('every pair plays exactly once for 25 players', () => {
		const ids = Array.from({ length: 25 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);

		// 25 is odd → 25 rounds (after adding BYE → 26 players → 25 rounds)
		expect(rounds).toHaveLength(25);

		const pairs = new Set<string>();
		for (const round of rounds) {
			for (const match of round.matches) {
				if (match.participantB === 'BYE') continue;
				const pair = [match.participantA, match.participantB].sort().join('-');
				expect(pairs.has(pair)).toBe(false);
				pairs.add(pair);
			}
		}

		// C(25,2) = 300 unique pairs
		expect(pairs.size).toBe(300);
	});

	it('BYE walkovers for odd groups: each player faces BYE exactly once', () => {
		const ids = Array.from({ length: 21 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);

		// Track BYE assignments per player
		const byeCount = new Map<string, number>();
		for (const round of rounds) {
			const byeMatches = round.matches.filter(m => m.participantB === 'BYE');
			// Exactly one BYE match per round for odd groups
			expect(byeMatches).toHaveLength(1);

			for (const match of byeMatches) {
				expect(match.status).toBe('WALKOVER');
				expect(match.winner).toBe(match.participantA);
				expect(match.gamesWonA).toBe(2);
				expect(match.gamesWonB).toBe(0);
				byeCount.set(match.participantA, (byeCount.get(match.participantA) || 0) + 1);
			}
		}

		// Each player faces BYE exactly once
		for (const id of ids) {
			expect(byeCount.get(id)).toBe(1);
		}
	});

	it('no player appears twice in the same round', () => {
		const ids = Array.from({ length: 25 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);

		for (const round of rounds) {
			const playersInRound = new Set<string>();
			for (const match of round.matches) {
				// participantA should not already be in this round
				expect(playersInRound.has(match.participantA)).toBe(false);
				playersInRound.add(match.participantA);

				if (match.participantB !== 'BYE') {
					expect(playersInRound.has(match.participantB)).toBe(false);
					playersInRound.add(match.participantB);
				}
			}
		}
	});
});

describe('assignTablesToRounds', () => {
	it('does not duplicate tables when matches exceed available tables', () => {
		// 26 players = even → 25 rounds, 13 matches per round
		// Only 8 tables available
		const ids = Array.from({ length: 26 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);
		const assigned = assignTablesToRounds(rounds, 8);

		for (const round of assigned) {
			const tablesUsed = new Set<number>();
			for (const match of round.matches) {
				if (match.participantB === 'BYE') continue;
				if (match.tableNumber !== undefined) {
					// No table should appear twice in the same round
					expect(tablesUsed.has(match.tableNumber)).toBe(false);
					tablesUsed.add(match.tableNumber);
				}
			}
			// Maximum tables used per round should not exceed totalTables
			expect(tablesUsed.size).toBeLessThanOrEqual(8);
		}
	});

	it('leaves excess matches without table assignment', () => {
		// 20 players (even) → 10 matches per round, only 6 tables
		const ids = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);
		const assigned = assignTablesToRounds(rounds, 6);

		for (const round of assigned) {
			const realMatches = round.matches.filter(m => m.participantB !== 'BYE');
			const withTable = realMatches.filter(m => m.tableNumber !== undefined);
			const withoutTable = realMatches.filter(m => m.tableNumber === undefined);

			// Exactly 6 matches should have tables
			expect(withTable).toHaveLength(6);
			// 4 matches should have no table (TBD)
			expect(withoutTable).toHaveLength(4);
		}
	});

	it('assigns tables normally when enough tables available', () => {
		// 8 players → 4 matches per round, 10 tables
		const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);
		const assigned = assignTablesToRounds(rounds, 10);

		for (const round of assigned) {
			for (const match of round.matches) {
				if (match.participantB === 'BYE') continue;
				// Every match should have a table
				expect(match.tableNumber).toBeDefined();
				expect(match.tableNumber).toBeGreaterThanOrEqual(1);
				expect(match.tableNumber).toBeLessThanOrEqual(10);
			}
		}
	});
});

describe('splitIntoGroups', () => {
	it('snake draft produces balanced groups: 30 players in 3 groups', () => {
		const participants = createParticipants(30);
		const groups = splitIntoGroups(participants, 3);

		// Each group should have 10 players
		expect(groups).toHaveLength(3);
		for (const group of groups) {
			expect(group.participants).toHaveLength(10);
		}

		// Sum of rankings per group should be close
		const groupRankingSums = groups.map(g => {
			return g.participants.reduce((sum, id) => {
				const p = participants.find(p => p.id === id)!;
				return sum + p.rankingSnapshot;
			}, 0);
		});

		// All sums should be within 3 of each other (snake draft balances well)
		const maxSum = Math.max(...groupRankingSums);
		const minSum = Math.min(...groupRankingSums);
		expect(maxSum - minSum).toBeLessThanOrEqual(3);
	});

	it('50 players across 4 groups: top 4 seeds distributed one per group', () => {
		const participants = createParticipants(50);
		const groups = splitIntoGroups(participants, 4);

		expect(groups).toHaveLength(4);

		// Groups should be balanced: 13, 13, 12, 12 or similar
		const sizes = groups.map(g => g.participants.length).sort();
		expect(sizes[0]).toBeGreaterThanOrEqual(12);
		expect(sizes[3]).toBeLessThanOrEqual(13);
		expect(sizes.reduce((a, b) => a + b)).toBe(50);

		// Top 4 seeds (highest ranking) should be in different groups
		const top4Ids = participants.slice(0, 4).map(p => p.id);
		const groupsWithTop4 = new Set<number>();
		for (let gi = 0; gi < groups.length; gi++) {
			for (const id of top4Ids) {
				if (groups[gi].participants.includes(id)) {
					groupsWithTop4.add(gi);
				}
			}
		}
		expect(groupsWithTop4.size).toBe(4);
	});

	it('rejects not enough participants for groups', () => {
		const participants = createParticipants(5);
		expect(() => splitIntoGroups(participants, 3)).toThrow();
	});
});

describe('assignTablesGlobally', () => {
	it('no table collision across groups in the same round', () => {
		// 2 groups of 10 players each, 8 tables
		const ids1 = Array.from({ length: 10 }, (_, i) => `g1p${i + 1}`);
		const ids2 = Array.from({ length: 10 }, (_, i) => `g2p${i + 1}`);

		const schedule1 = generateRoundRobinSchedule(ids1);
		const schedule2 = generateRoundRobinSchedule(ids2);

		const groups = [
			{ id: 'g1', name: 'GROUP_A', participants: ids1, standings: [], schedule: schedule1 },
			{ id: 'g2', name: 'GROUP_B', participants: ids2, standings: [], schedule: schedule2 }
		];

		assignTablesGlobally(groups, 8);

		// For each round number, check no table is used by both groups
		const maxRounds = Math.max(schedule1.length, schedule2.length);
		for (let r = 0; r < maxRounds; r++) {
			const tablesInRound = new Set<number>();
			for (const group of groups) {
				if (!group.schedule || r >= group.schedule.length) continue;
				for (const match of group.schedule[r].matches) {
					if (match.participantB === 'BYE') continue;
					if (match.tableNumber !== undefined) {
						expect(tablesInRound.has(match.tableNumber)).toBe(false);
						tablesInRound.add(match.tableNumber);
					}
				}
			}
		}
	});
});

describe('calculateRoundRobinRounds', () => {
	it('calculates correctly for even participants', () => {
		expect(calculateRoundRobinRounds(20)).toBe(19);
		expect(calculateRoundRobinRounds(30)).toBe(29);
	});

	it('calculates correctly for odd participants (adds 1)', () => {
		expect(calculateRoundRobinRounds(21)).toBe(21);
		expect(calculateRoundRobinRounds(25)).toBe(25);
	});
});

describe('round robin with doubles teams', () => {
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

	it('12 teams: complete round robin schedule', () => {
		const ids = Array.from({ length: 12 }, (_, i) => `team${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);

		// 12 teams (even) → 11 rounds
		expect(rounds).toHaveLength(11);

		// Each round has 6 matches
		for (const round of rounds) {
			const realMatches = round.matches.filter(m => m.participantB !== 'BYE');
			expect(realMatches).toHaveLength(6);
		}

		// Every pair plays exactly once: C(12,2) = 66
		const pairs = new Set<string>();
		for (const round of rounds) {
			for (const match of round.matches) {
				if (match.participantB === 'BYE') continue;
				const pair = [match.participantA, match.participantB].sort().join('-');
				expect(pairs.has(pair)).toBe(false);
				pairs.add(pair);
			}
		}
		expect(pairs.size).toBe(66);
	});

	it('20 teams: boundary limit, complete schedule with 19 rounds', () => {
		const ids = Array.from({ length: 20 }, (_, i) => `team${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);

		// 20 teams (even) → 19 rounds
		expect(rounds).toHaveLength(19);

		// Each round has 10 matches
		for (const round of rounds) {
			const realMatches = round.matches.filter(m => m.participantB !== 'BYE');
			expect(realMatches).toHaveLength(10);
		}

		// C(20,2) = 190 pairs
		const pairs = new Set<string>();
		for (const round of rounds) {
			for (const match of round.matches) {
				if (match.participantB === 'BYE') continue;
				const pair = [match.participantA, match.participantB].sort().join('-');
				expect(pairs.has(pair)).toBe(false);
				pairs.add(pair);
			}
		}
		expect(pairs.size).toBe(190);
	});

	it('25 teams in multiple groups: balanced split', () => {
		const teams = createTeams(25);
		const groups = splitIntoGroups(teams, 2);

		expect(groups).toHaveLength(2);

		// Groups should be balanced: 13 and 12
		const sizes = groups.map(g => g.participants.length).sort();
		expect(sizes).toEqual([12, 13]);
		expect(sizes[0] + sizes[1]).toBe(25);

		// Each group generates a valid schedule
		for (const group of groups) {
			const rounds = generateRoundRobinSchedule(group.participants);
			const n = group.participants.length;
			// Odd → n rounds, Even → n-1 rounds
			const expectedRounds = n % 2 === 0 ? n - 1 : n;
			expect(rounds).toHaveLength(expectedRounds);

			// No team appears twice in same round
			for (const round of rounds) {
				const seen = new Set<string>();
				for (const match of round.matches) {
					expect(seen.has(match.participantA)).toBe(false);
					seen.add(match.participantA);
					if (match.participantB !== 'BYE') {
						expect(seen.has(match.participantB)).toBe(false);
						seen.add(match.participantB);
					}
				}
			}
		}
	});
});

describe('validateRoundRobinGroupSize', () => {
	it('validates group sizes correctly', () => {
		expect(validateRoundRobinGroupSize(1)).toBe(false);
		expect(validateRoundRobinGroupSize(2)).toBe(true);
		expect(validateRoundRobinGroupSize(20)).toBe(true);
		expect(validateRoundRobinGroupSize(21)).toBe(false);
		expect(validateRoundRobinGroupSize(25, 30)).toBe(true);
	});
});

describe('assignTablesToRounds — table distribution fairness', () => {
	/** Build per-player table usage map from assigned rounds */
	function getPlayerTableUsage(rounds: ReturnType<typeof generateRoundRobinSchedule>): Map<string, Map<number, number>> {
		const usage = new Map<string, Map<number, number>>();
		for (const round of rounds) {
			for (const match of round.matches) {
				if (match.participantB === 'BYE' || match.tableNumber === undefined) continue;
				for (const player of [match.participantA, match.participantB]) {
					if (!usage.has(player)) usage.set(player, new Map());
					const pMap = usage.get(player)!;
					pMap.set(match.tableNumber, (pMap.get(match.tableNumber) || 0) + 1);
				}
			}
		}
		return usage;
	}

	it('no player plays the same table more than ceil(matches/tables)+1 times (10 players, 10 tables)', () => {
		const ids = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);
		const assigned = assignTablesToRounds(rounds, 10);
		const usage = getPlayerTableUsage(assigned);

		for (const [player, tableMap] of usage) {
			const totalMatches = Array.from(tableMap.values()).reduce((a, b) => a + b, 0);
			const maxAllowed = Math.ceil(totalMatches / 10) + 1;
			for (const [table, count] of tableMap) {
				expect(count, `${player} played table ${table} ${count} times (max allowed: ${maxAllowed})`)
					.toBeLessThanOrEqual(maxAllowed);
			}
		}
	});

	it('tables are spread across available range (8 players, 10 tables)', () => {
		const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);
		const assigned = assignTablesToRounds(rounds, 10);
		const usage = getPlayerTableUsage(assigned);

		for (const [player, tableMap] of usage) {
			const tablesUsed = tableMap.size;
			const totalMatches = Array.from(tableMap.values()).reduce((a, b) => a + b, 0);
			// Each player plays 7 matches with 10 tables — should use at least 5 different tables
			const minExpected = Math.min(totalMatches, 5);
			expect(tablesUsed, `${player} only used ${tablesUsed} different tables`)
				.toBeGreaterThanOrEqual(minExpected);
		}
	});

	it('player table usage standard deviation is low (10 players, 10 tables)', () => {
		const ids = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);
		const assigned = assignTablesToRounds(rounds, 10);
		const usage = getPlayerTableUsage(assigned);

		for (const [player, tableMap] of usage) {
			const totalMatches = Array.from(tableMap.values()).reduce((a, b) => a + b, 0);
			if (totalMatches < 3) continue;

			// Calculate std dev across all 10 tables (including 0s for unused)
			const counts: number[] = [];
			for (let t = 1; t <= 10; t++) {
				counts.push(tableMap.get(t) || 0);
			}
			const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
			const variance = counts.reduce((sum, v) => sum + (v - mean) ** 2, 0) / counts.length;
			const stdDev = Math.sqrt(variance);

			expect(stdDev, `${player} has high std dev: ${stdDev.toFixed(2)} (usage: ${JSON.stringify(counts)})`)
				.toBeLessThan(1.0);
		}
	});

	it('global table usage is balanced (10 players, 10 tables)', () => {
		const ids = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);
		const assigned = assignTablesToRounds(rounds, 10);

		// Count how many times each table is used across all rounds
		const globalUsage = new Map<number, number>();
		for (const round of assigned) {
			for (const match of round.matches) {
				if (match.tableNumber !== undefined) {
					globalUsage.set(match.tableNumber, (globalUsage.get(match.tableNumber) || 0) + 1);
				}
			}
		}

		const usageCounts = Array.from(globalUsage.values());
		if (usageCounts.length > 1) {
			const max = Math.max(...usageCounts);
			const min = Math.min(...usageCounts);
			expect(max - min, `Global table usage imbalanced: max=${max}, min=${min}`).toBeLessThanOrEqual(3);
		}
	});

	it('20 players, 10 tables: no player repeats any table more than 3 times', () => {
		const ids = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);
		const rounds = generateRoundRobinSchedule(ids);
		const assigned = assignTablesToRounds(rounds, 10);
		const usage = getPlayerTableUsage(assigned);

		for (const [player, tableMap] of usage) {
			for (const [table, count] of tableMap) {
				// With 19 matches and 10 tables, greedy can't always achieve ceil(19/10)=2
				// but 3 is a reasonable upper bound (vs 4+ without the algorithm)
				expect(count, `${player} played at table ${table} ${count} times`)
					.toBeLessThanOrEqual(3);
			}
		}

		// Additionally verify all players use at least 7 different tables (out of 10)
		for (const [player, tableMap] of usage) {
			expect(tableMap.size, `${player} only used ${tableMap.size} tables`)
				.toBeGreaterThanOrEqual(7);
		}
	});

	it('cross-group table assignment: tables do not collide across groups in same round', () => {
		// 2 groups of 8 players, 10 tables
		const ids1 = Array.from({ length: 8 }, (_, i) => `g1p${i + 1}`);
		const ids2 = Array.from({ length: 8 }, (_, i) => `g2p${i + 1}`);

		const schedule1 = generateRoundRobinSchedule(ids1);
		const schedule2 = generateRoundRobinSchedule(ids2);

		const groups = [
			{ id: 'g1', name: 'GROUP_A', participants: ids1, standings: [], schedule: schedule1 },
			{ id: 'g2', name: 'GROUP_B', participants: ids2, standings: [], schedule: schedule2 }
		];

		assignTablesGlobally(groups, 10);

		// Check no collision per round
		const maxRounds = Math.max(schedule1.length, schedule2.length);
		for (let r = 0; r < maxRounds; r++) {
			const tablesInRound = new Set<number>();
			for (const group of groups) {
				if (!group.schedule || r >= group.schedule.length) continue;
				for (const match of group.schedule[r].matches) {
					if (match.participantB === 'BYE' || match.tableNumber === undefined) continue;
					expect(tablesInRound.has(match.tableNumber), `Table ${match.tableNumber} duplicated in round ${r + 1} across groups`).toBe(false);
					tablesInRound.add(match.tableNumber);
				}
			}
		}

		// Also check distribution: each group should use diverse tables
		for (const group of groups) {
			const groupTables = new Set<number>();
			for (const round of group.schedule!) {
				for (const match of round.matches) {
					if (match.tableNumber !== undefined) groupTables.add(match.tableNumber);
				}
			}
			expect(groupTables.size, `Group ${group.name} only used ${groupTables.size} different tables`)
				.toBeGreaterThanOrEqual(4);
		}
	});

	it('cross-group with tight table constraint: 2 groups of 6, only 8 tables', () => {
		const ids1 = Array.from({ length: 6 }, (_, i) => `g1p${i + 1}`);
		const ids2 = Array.from({ length: 6 }, (_, i) => `g2p${i + 1}`);

		const schedule1 = generateRoundRobinSchedule(ids1);
		const schedule2 = generateRoundRobinSchedule(ids2);

		const groups = [
			{ id: 'g1', name: 'GROUP_A', participants: ids1, standings: [], schedule: schedule1 },
			{ id: 'g2', name: 'GROUP_B', participants: ids2, standings: [], schedule: schedule2 }
		];

		assignTablesGlobally(groups, 8);

		// 6 players = 3 matches per round × 2 groups = 6 matches per round, 8 tables → all should fit
		for (let r = 0; r < schedule1.length; r++) {
			const tablesInRound = new Set<number>();
			for (const group of groups) {
				if (!group.schedule || r >= group.schedule.length) continue;
				for (const match of group.schedule[r].matches) {
					if (match.participantB === 'BYE' || match.tableNumber === undefined) continue;
					expect(tablesInRound.has(match.tableNumber)).toBe(false);
					tablesInRound.add(match.tableNumber);
				}
			}
			// All 6 matches should have tables
			expect(tablesInRound.size).toBe(6);
		}
	});
});
