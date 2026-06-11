/**
 * Table rotation quality tests — Round Robin (single & multi group).
 *
 * The fair-table-rotation requirement: players should repeat tables as little
 * as possible (a "round robin of tables"). Concretely:
 *  - within a round no table is used twice (across ALL groups),
 *  - a player should not repeat a table while they still have unvisited tables
 *    (cycle property), whenever the pairing/cross-group constraints allow it,
 *  - usage per player stays balanced (max usage bounded by ceil(matches/tables)).
 *
 * Swiss rotation is covered in groupStageAdmin.test.ts (integration through
 * generateSwissPairings + playedOnTable history). These tests cover the
 * upfront RR assignment: assignTablesToRounds (single group) and
 * assignTablesGlobally (cross-group coordination), exactly as called by
 * tournamentStateMachine.startGroupStage().
 */
import { describe, it, expect } from 'vitest';
import {
	generateRoundRobinSchedule,
	assignTablesToRounds,
	assignTablesGlobally
} from './roundRobin';
import type { Group, RoundRobinRound } from '$lib/types/tournament';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIds(n: number, prefix = 'p'): string[] {
	return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

/** participantId → list of tables they were assigned across all rounds */
function tableUsage(rounds: RoundRobinRound[]): Map<string, number[]> {
	const usage = new Map<string, number[]>();
	for (const round of rounds) {
		for (const match of round.matches) {
			if (!match.tableNumber || match.participantB === 'BYE') continue;
			for (const pid of [match.participantA, match.participantB]) {
				if (!usage.has(pid)) usage.set(pid, []);
				usage.get(pid)!.push(match.tableNumber);
			}
		}
	}
	return usage;
}

function maxUsageOfSingleTable(tables: number[]): number {
	const counts = new Map<number, number>();
	for (const t of tables) counts.set(t, (counts.get(t) || 0) + 1);
	return Math.max(...counts.values());
}

function assertNoDuplicateTablesPerRound(groups: { schedule?: RoundRobinRound[] }[]) {
	const byRound = new Map<number, number[]>();
	for (const group of groups) {
		for (const round of group.schedule || []) {
			if (!byRound.has(round.roundNumber)) byRound.set(round.roundNumber, []);
			for (const match of round.matches) {
				if (match.tableNumber) byRound.get(round.roundNumber)!.push(match.tableNumber);
			}
		}
	}
	for (const [roundNumber, tables] of byRound) {
		expect(
			new Set(tables).size,
			`round ${roundNumber} reuses a table: [${tables.join(',')}]`
		).toBe(tables.length);
	}
}

// ─── Single group RR ─────────────────────────────────────────────────────────

describe('RR single group — table rotation quality', () => {
	it('8 players, 4 tables (saturated): everyone visits all 4 tables, bounded repeats', () => {
		// Saturated case: 4 matches/round = all 4 tables busy every round, so the
		// per-round assignment is a perfect matching and the ideal global balance
		// (2,2,2,1 per player) is not always reachable. Guarantees asserted:
		// every player still visits ALL tables across the 7 rounds, and nobody
		// plays a single table more than 3 of their 7 matches.
		const schedule = generateRoundRobinSchedule(makeIds(8));
		const assigned = assignTablesToRounds(schedule, 4);

		assertNoDuplicateTablesPerRound([{ schedule: assigned }]);

		const usage = tableUsage(assigned);
		expect(usage.size).toBe(8);
		for (const [pid, tables] of usage) {
			expect(tables.length).toBe(7); // 7 rounds, all with table
			expect(new Set(tables).size, `${pid} visited [${tables.join(',')}]`).toBe(4);
			expect(maxUsageOfSingleTable(tables), `${pid} overused a table [${tables.join(',')}]`).toBeLessThanOrEqual(3);
		}
	});

	it('4 players, 4 tables: at most one forced repeat per player', () => {
		// NOTE: zero repeats is impossible here — by round 3 each player's
		// unvisited tables are exactly the ones their opponent already used,
		// so one player of each round-3 match must repeat. The requirement is
		// MINIMAL repetition: nobody repeats more than once, nobody plays a
		// single table 3 times.
		const schedule = generateRoundRobinSchedule(makeIds(4));
		const assigned = assignTablesToRounds(schedule, 4);

		const usage = tableUsage(assigned);
		for (const [pid, tables] of usage) {
			expect(tables.length).toBe(3);
			expect(new Set(tables).size, `${pid} over-repeated: [${tables.join(',')}]`).toBeGreaterThanOrEqual(2);
			expect(maxUsageOfSingleTable(tables)).toBeLessThanOrEqual(2);
		}
	});

	it('6 players, 3 tables: full cycle, balanced usage', () => {
		const schedule = generateRoundRobinSchedule(makeIds(6));
		const assigned = assignTablesToRounds(schedule, 3);

		assertNoDuplicateTablesPerRound([{ schedule: assigned }]);

		const usage = tableUsage(assigned);
		for (const [pid, tables] of usage) {
			expect(tables.length).toBe(5); // 5 rounds
			expect(new Set(tables).size, `${pid} visited [${tables.join(',')}]`).toBe(3);
			expect(maxUsageOfSingleTable(tables)).toBeLessThanOrEqual(2);
		}
	});

	it('5 players (BYE), 2 tables: balanced 2-table rotation', () => {
		const schedule = generateRoundRobinSchedule(makeIds(5));
		const assigned = assignTablesToRounds(schedule, 2);

		assertNoDuplicateTablesPerRound([{ schedule: assigned }]);

		const usage = tableUsage(assigned);
		for (const [pid, tables] of usage) {
			expect(tables.length).toBe(4); // 4 real matches each (1 BYE round)
			expect(new Set(tables).size, `${pid} stuck on one table: [${tables.join(',')}]`).toBe(2);
			expect(maxUsageOfSingleTable(tables)).toBeLessThanOrEqual(2);
		}
	});
});

// ─── Multi-group RR (cross-group coordination) ──────────────────────────────

function makeGroups(sizes: number[]): Group[] {
	return sizes.map((size, gi) => {
		const ids = makeIds(size, `g${gi + 1}p`);
		return {
			id: `group-${gi + 1}`,
			name: `Grupo ${String.fromCharCode(65 + gi)}`,
			participants: ids,
			schedule: generateRoundRobinSchedule(ids),
			standings: []
		} as Group;
	});
}

describe('RR multi-group — cross-group table coordination + rotation', () => {
	it('2 groups of 4, 4 tables: no table reused in the same round across groups', () => {
		const groups = assignTablesGlobally(makeGroups([4, 4]), 4);

		assertNoDuplicateTablesPerRound(groups);

		// All 4 matches per round get a table (2 per group, exactly 4 tables)
		for (const group of groups) {
			for (const round of group.schedule!) {
				const withTable = round.matches.filter(m => m.participantB !== 'BYE' && m.tableNumber);
				expect(withTable.length).toBe(2);
			}
		}

		// Rotation: nobody plays the same table in all 3 of their matches —
		// not even in the second group, which picks from leftover tables
		for (const group of groups) {
			const usage = tableUsage(group.schedule!);
			for (const [pid, tables] of usage) {
				expect(tables.length).toBe(3);
				expect(
					new Set(tables).size,
					`${pid} stuck on table(s) [${tables.join(',')}]`
				).toBeGreaterThanOrEqual(2);
			}
		}
	});

	it('3 groups of 4, 6 tables: unique per round, everyone rotates', () => {
		const groups = assignTablesGlobally(makeGroups([4, 4, 4]), 6);

		assertNoDuplicateTablesPerRound(groups);

		for (const group of groups) {
			const usage = tableUsage(group.schedule!);
			for (const [pid, tables] of usage) {
				expect(tables.length).toBe(3);
				expect(maxUsageOfSingleTable(tables), `${pid}: [${tables.join(',')}]`).toBeLessThanOrEqual(2);
			}
		}
	});

	it('2 groups of 5 (BYE rounds), 4 tables: BYEs skipped, no cross-group collisions', () => {
		const groups = assignTablesGlobally(makeGroups([5, 5]), 4);

		assertNoDuplicateTablesPerRound(groups);

		for (const group of groups) {
			for (const round of group.schedule!) {
				for (const match of round.matches) {
					if (match.participantB === 'BYE') {
						expect(match.tableNumber).toBeUndefined();
					}
				}
			}
			const usage = tableUsage(group.schedule!);
			for (const [pid, tables] of usage) {
				expect(tables.length).toBe(4); // 4 real matches each
				expect(
					new Set(tables).size,
					`${pid} barely rotated: [${tables.join(',')}]`
				).toBeGreaterThanOrEqual(2);
			}
		}
	});

	it('2 groups of 4, only 3 tables: shortage handled, no duplicates, TBD allowed', () => {
		const groups = assignTablesGlobally(makeGroups([4, 4]), 3);

		assertNoDuplicateTablesPerRound(groups);

		// 4 matches per round but only 3 tables → exactly 3 assigned, 1 TBD
		const byRound = new Map<number, number>();
		for (const group of groups) {
			for (const round of group.schedule!) {
				const assigned = round.matches.filter(m => m.participantB !== 'BYE' && m.tableNumber).length;
				byRound.set(round.roundNumber, (byRound.get(round.roundNumber) || 0) + assigned);
			}
		}
		for (const [roundNumber, count] of byRound) {
			expect(count, `round ${roundNumber} should use exactly the 3 tables`).toBe(3);
		}
	});
});
