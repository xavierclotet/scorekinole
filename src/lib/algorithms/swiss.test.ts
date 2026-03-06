import { describe, it, expect } from 'vitest';
import {
	generateSwissPairings,
	assignTablesWithVariety,
	validateSwissSystem
} from './swiss';
import type { TournamentParticipant, GroupStanding, SwissPairing } from '$lib/types/tournament';

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
