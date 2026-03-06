import { describe, it, expect } from 'vitest';
import {
	calculateRoundRobinMatches,
	calculateSwissMatches,
	getSuggestedQualifiersForSwiss,
	getSuggestedQualifiersForRoundRobin,
	calculateBracketMatches,
	getBracketRoundName,
	formatDuration,
	calculateTimeBreakdown,
	calculateRemainingTime,
	calculateTournamentTimeEstimate
} from './tournamentTime';
import type { Tournament } from '$lib/types/tournament';

// ============================================================================
// calculateRoundRobinMatches
// ============================================================================

describe('calculateRoundRobinMatches', () => {
	it('returns 0 for fewer than 2 participants', () => {
		expect(calculateRoundRobinMatches(0, 1)).toBe(0);
		expect(calculateRoundRobinMatches(1, 1)).toBe(0);
	});

	it('returns 0 for 0 groups', () => {
		expect(calculateRoundRobinMatches(4, 0)).toBe(0);
	});

	it('single group: N*(N-1)/2', () => {
		expect(calculateRoundRobinMatches(4, 1)).toBe(6);   // 4*3/2
		expect(calculateRoundRobinMatches(5, 1)).toBe(10);  // 5*4/2
		expect(calculateRoundRobinMatches(6, 1)).toBe(15);  // 6*5/2
		expect(calculateRoundRobinMatches(10, 1)).toBe(45); // 10*9/2
	});

	it('even split: 2 groups with even number', () => {
		// 8 players / 2 groups = 4+4 → 6+6 = 12
		expect(calculateRoundRobinMatches(8, 2)).toBe(12);
		// 10 players / 2 groups = 5+5 → 10+10 = 20
		expect(calculateRoundRobinMatches(10, 2)).toBe(20);
	});

	// BUG 1 REGRESSION: uneven groups must use real per-group sizes
	it('uneven split: 7 players in 2 groups → 4+3 = 6+3 = 9 (not 12)', () => {
		// Snake draft: group 0 gets 4, group 1 gets 3
		// 4*3/2 + 3*2/2 = 6 + 3 = 9
		expect(calculateRoundRobinMatches(7, 2)).toBe(9);
	});

	it('uneven split: 9 players in 2 groups → 5+4 = 10+6 = 16', () => {
		expect(calculateRoundRobinMatches(9, 2)).toBe(16);
	});

	it('uneven split: 11 players in 3 groups → 4+4+3 = 6+6+3 = 15', () => {
		// 11/3 = 3 remainder 2 → sizes: 4,4,3
		expect(calculateRoundRobinMatches(11, 3)).toBe(15);
	});

	it('uneven split: 13 players in 4 groups → 4+3+3+3 = 6+3+3+3 = 15', () => {
		// 13/4 = 3 remainder 1 → sizes: 4,3,3,3
		expect(calculateRoundRobinMatches(13, 4)).toBe(15);
	});

	it('many groups: 20 players in 4 groups = 5+5+5+5 → 40', () => {
		expect(calculateRoundRobinMatches(20, 4)).toBe(40);
	});

	it('2 players in 1 group = 1 match', () => {
		expect(calculateRoundRobinMatches(2, 1)).toBe(1);
	});

	it('3 players in 1 group = 3 matches', () => {
		expect(calculateRoundRobinMatches(3, 1)).toBe(3);
	});
});

// ============================================================================
// calculateSwissMatches
// ============================================================================

describe('calculateSwissMatches', () => {
	it('returns 0 for fewer than 2 participants', () => {
		expect(calculateSwissMatches(0, 5)).toBe(0);
		expect(calculateSwissMatches(1, 5)).toBe(0);
	});

	it('returns 0 for 0 rounds', () => {
		expect(calculateSwissMatches(8, 0)).toBe(0);
	});

	it('even number: N/2 matches per round', () => {
		expect(calculateSwissMatches(8, 5)).toBe(20);  // 4 * 5
		expect(calculateSwissMatches(10, 5)).toBe(25); // 5 * 5
		expect(calculateSwissMatches(16, 5)).toBe(40); // 8 * 5
	});

	// BUG 2 REGRESSION: odd participants should NOT count BYE as a match
	it('odd number: floor(N/2) matches per round (BYE excluded)', () => {
		expect(calculateSwissMatches(7, 5)).toBe(15);  // 3 * 5 (not 4*5=20)
		expect(calculateSwissMatches(9, 5)).toBe(20);  // 4 * 5 (not 5*5=25)
		expect(calculateSwissMatches(11, 5)).toBe(25); // 5 * 5
	});

	it('single round', () => {
		expect(calculateSwissMatches(6, 1)).toBe(3);
	});

	it('2 participants, 3 rounds', () => {
		expect(calculateSwissMatches(2, 3)).toBe(3); // 1 * 3
	});
});

// ============================================================================
// getSuggestedQualifiersForSwiss
// ============================================================================

describe('getSuggestedQualifiersForSwiss', () => {
	it('returns 0 for < 2 participants', () => {
		expect(getSuggestedQualifiersForSwiss(0)).toBe(0);
		expect(getSuggestedQualifiersForSwiss(1)).toBe(0);
	});

	it('returns 2 for 2-3 participants', () => {
		expect(getSuggestedQualifiersForSwiss(2)).toBe(2);
		expect(getSuggestedQualifiersForSwiss(3)).toBe(2);
	});

	it('returns 4 for 8 participants (special case)', () => {
		expect(getSuggestedQualifiersForSwiss(8)).toBe(4);
	});

	it('returns 8 for 16 participants (special case)', () => {
		expect(getSuggestedQualifiersForSwiss(16)).toBe(8);
	});

	it('returns power of 2 <= half of participants', () => {
		expect(getSuggestedQualifiersForSwiss(12)).toBe(4); // half=6 → 4
		expect(getSuggestedQualifiersForSwiss(20)).toBe(8); // half=10 → 8
		expect(getSuggestedQualifiersForSwiss(30)).toBe(8); // half=15 → 8
	});

	it('never exceeds participant count', () => {
		expect(getSuggestedQualifiersForSwiss(4)).toBeLessThanOrEqual(4);
		expect(getSuggestedQualifiersForSwiss(5)).toBeLessThanOrEqual(5);
	});
});

// ============================================================================
// getSuggestedQualifiersForRoundRobin
// ============================================================================

describe('getSuggestedQualifiersForRoundRobin', () => {
	it('returns 0 for < 2 participants', () => {
		expect(getSuggestedQualifiersForRoundRobin(0, 1)).toBe(0);
		expect(getSuggestedQualifiersForRoundRobin(1, 1)).toBe(0);
	});

	it('multiple groups: 2 per group', () => {
		expect(getSuggestedQualifiersForRoundRobin(8, 2)).toBe(4);  // 2*2
		expect(getSuggestedQualifiersForRoundRobin(12, 3)).toBe(6); // 3*2
		expect(getSuggestedQualifiersForRoundRobin(16, 4)).toBe(8); // 4*2
	});

	it('single group: uses power of 2 logic', () => {
		expect(getSuggestedQualifiersForRoundRobin(8, 1)).toBe(4);
		expect(getSuggestedQualifiersForRoundRobin(16, 1)).toBe(8);
	});

	it('does not exceed participant count', () => {
		expect(getSuggestedQualifiersForRoundRobin(3, 2)).toBeLessThanOrEqual(3);
	});
});

// ============================================================================
// calculateBracketMatches
// ============================================================================

describe('calculateBracketMatches', () => {
	it('returns 0 for < 2 participants', () => {
		expect(calculateBracketMatches(0)).toBe(0);
		expect(calculateBracketMatches(1)).toBe(0);
	});

	it('2 participants: 1 match (no 3rd place)', () => {
		expect(calculateBracketMatches(2)).toBe(1);
	});

	it('3 participants: 2 matches (no 3rd place since < 4)', () => {
		expect(calculateBracketMatches(3)).toBe(2);
	});

	it('4 participants with 3rd place: 4 matches (3+1)', () => {
		expect(calculateBracketMatches(4, true)).toBe(4);
	});

	it('4 participants without 3rd place: 3 matches', () => {
		expect(calculateBracketMatches(4, false)).toBe(3);
	});

	it('8 participants with 3rd place: 8 matches (7+1)', () => {
		expect(calculateBracketMatches(8, true)).toBe(8);
	});

	it('16 participants: 16 matches (15+1)', () => {
		expect(calculateBracketMatches(16)).toBe(16);
	});

	it('default includes 3rd place', () => {
		expect(calculateBracketMatches(8)).toBe(8);
	});
});

// ============================================================================
// getBracketRoundName
// ============================================================================

describe('getBracketRoundName', () => {
	it('returns "final" for 2 participants', () => {
		expect(getBracketRoundName(2)).toBe('final');
	});

	it('returns "semifinals" for 4 participants', () => {
		expect(getBracketRoundName(4)).toBe('semifinals');
	});

	it('returns "quarterfinals" for 8 participants', () => {
		expect(getBracketRoundName(8)).toBe('quarterfinals');
	});

	it('returns "round16" for 16 participants', () => {
		expect(getBracketRoundName(16)).toBe('round16');
	});

	it('returns "round32" for 32 participants', () => {
		expect(getBracketRoundName(32)).toBe('round32');
	});

	it('returns "round64" for 64 participants', () => {
		expect(getBracketRoundName(64)).toBe('round64');
	});

	it('returns generic format for non-standard sizes', () => {
		expect(getBracketRoundName(128)).toBe('round128');
		expect(getBracketRoundName(3)).toBe('round3');
	});
});

// ============================================================================
// formatDuration
// ============================================================================

describe('formatDuration', () => {
	it('returns "0m" for 0 or negative minutes', () => {
		expect(formatDuration(0)).toBe('0m');
		expect(formatDuration(-5)).toBe('0m');
	});

	it('returns minutes only for < 60', () => {
		expect(formatDuration(5)).toBe('5m');
		expect(formatDuration(30)).toBe('30m');
		expect(formatDuration(59)).toBe('59m');
	});

	it('returns hours only when exact hours', () => {
		expect(formatDuration(60)).toBe('1h');
		expect(formatDuration(120)).toBe('2h');
		expect(formatDuration(180)).toBe('3h');
	});

	it('returns combined format', () => {
		expect(formatDuration(90)).toBe('1h 30m');
		expect(formatDuration(125)).toBe('2h 5m');
		expect(formatDuration(150)).toBe('2h 30m');
	});

	it('rounds fractional minutes', () => {
		expect(formatDuration(90.7)).toBe('1h 31m');
	});
});

// ============================================================================
// Helper: minimal tournament factory for calculateTimeBreakdown tests
// ============================================================================

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
	return {
		id: 'test-id',
		key: 'abc123',
		name: 'Test Tournament',
		country: 'ES',
		city: 'Barcelona',
		status: 'DRAFT',
		phaseType: 'ONE_PHASE',
		gameType: 'singles',
		show20s: true,
		showHammer: true,
		numTables: 4,
		rankingConfig: { enabled: false, tier: 'SERIES_15' },
		participants: [],
		createdAt: Date.now(),
		createdBy: { userId: 'u1', userName: 'Admin' },
		updatedAt: Date.now(),
		...overrides
	} as Tournament;
}

function makeParticipants(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i + 1}`,
		type: 'GUEST' as const,
		name: `Player ${i + 1}`,
		status: 'ACTIVE' as const
	}));
}

// ============================================================================
// calculateTimeBreakdown — edge cases
// ============================================================================

describe('calculateTimeBreakdown', () => {
	it('returns 0 totalMinutes for tournament with 0 participants', () => {
		const t = makeTournament({ participants: [] });
		const breakdown = calculateTimeBreakdown(t);
		expect(breakdown.totalMinutes).toBe(0);
		expect(breakdown.numParticipants).toBe(0);
	});

	it('returns 0 totalMinutes for tournament with 1 participant', () => {
		const t = makeTournament({ participants: makeParticipants(1) });
		const breakdown = calculateTimeBreakdown(t);
		// 1 participant can't form a bracket
		expect(breakdown.totalMinutes).toBe(0);
	});

	it('calculates ONE_PHASE bracket for 2 participants (minimum valid)', () => {
		const t = makeTournament({
			participants: makeParticipants(2),
			phaseType: 'ONE_PHASE',
			finalStage: {
				mode: 'SINGLE_BRACKET',
				thirdPlaceMatchEnabled: false
			} as any
		});
		const breakdown = calculateTimeBreakdown(t);
		expect(breakdown.finalStage).toBeDefined();
		expect(breakdown.finalStage!.qualifiedCount).toBe(2);
		expect(breakdown.finalStage!.totalMatches).toBe(1); // Just the final
		expect(breakdown.totalMinutes).toBeGreaterThan(0);
	});

	it('calculates ONE_PHASE bracket for 50 participants', () => {
		const t = makeTournament({
			participants: makeParticipants(50),
			phaseType: 'ONE_PHASE',
			numTables: 8,
			finalStage: {
				mode: 'SINGLE_BRACKET',
				thirdPlaceMatchEnabled: true,
				goldBracket: {
					config: {
						earlyRounds: { gameMode: 'rounds', roundsToPlay: 4, matchesToWin: 1 },
						semifinal: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
						final: { gameMode: 'points', pointsToWin: 9, matchesToWin: 1 }
					}
				}
			} as any
		});
		const breakdown = calculateTimeBreakdown(t);
		expect(breakdown.finalStage).toBeDefined();
		expect(breakdown.finalStage!.qualifiedCount).toBe(50);
		// 50 participants → 49 matches + 1 third place = 50
		expect(breakdown.finalStage!.totalMatches).toBe(50);
		expect(breakdown.finalStage!.bracketRounds.length).toBeGreaterThanOrEqual(4); // R64, R32, QF, SF, F
		expect(breakdown.totalMinutes).toBeGreaterThan(0);
	});

	it('calculates GROUP_ONLY tournament (no final stage)', () => {
		const t = makeTournament({
			participants: makeParticipants(10),
			phaseType: 'GROUP_ONLY',
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [],
				currentRound: 1,
				totalRounds: 9,
				isComplete: false,
				gameMode: 'rounds',
				roundsToPlay: 4,
				matchesToWin: 1,
				numGroups: 1,
				qualificationMode: 'WINS'
			} as any
		});
		const breakdown = calculateTimeBreakdown(t);
		expect(breakdown.groupStage).toBeDefined();
		expect(breakdown.finalStage).toBeUndefined();
		expect(breakdown.transitionMinutes).toBe(0);
		expect(breakdown.totalMinutes).toBe(breakdown.groupStage!.totalMinutes);
	});

	it('handles TWO_PHASE with SPLIT_DIVISIONS', () => {
		const t = makeTournament({
			participants: makeParticipants(16),
			phaseType: 'TWO_PHASE',
			numTables: 4,
			groupStage: {
				type: 'SWISS',
				groups: [],
				currentRound: 1,
				totalRounds: 5,
				isComplete: false,
				gameMode: 'rounds',
				roundsToPlay: 4,
				matchesToWin: 1,
				numSwissRounds: 5,
				qualificationMode: 'WINS'
			} as any,
			finalStage: {
				mode: 'SPLIT_DIVISIONS',
				thirdPlaceMatchEnabled: true,
				goldBracket: { config: {} }
			} as any
		});
		const breakdown = calculateTimeBreakdown(t);
		expect(breakdown.groupStage).toBeDefined();
		expect(breakdown.finalStage).toBeDefined();
		// Split divisions: half go to gold
		expect(breakdown.finalStage!.qualifiedCount).toBe(8);
		expect(breakdown.transitionMinutes).toBeGreaterThan(0); // TWO_PHASE has transition
		expect(breakdown.totalMinutes).toBe(
			breakdown.groupStage!.totalMinutes + breakdown.transitionMinutes + breakdown.finalStage!.totalMinutes
		);
	});

	it('handles doubles tournament (different base minutes)', () => {
		const t = makeTournament({
			participants: makeParticipants(8),
			gameType: 'doubles',
			phaseType: 'ONE_PHASE',
			numTables: 2,
			finalStage: {
				mode: 'SINGLE_BRACKET',
				thirdPlaceMatchEnabled: true,
				goldBracket: { config: {} }
			} as any
		});
		const breakdownDoubles = calculateTimeBreakdown(t);
		// Compare with singles
		const tSingles = makeTournament({
			participants: makeParticipants(8),
			gameType: 'singles',
			phaseType: 'ONE_PHASE',
			numTables: 2,
			finalStage: {
				mode: 'SINGLE_BRACKET',
				thirdPlaceMatchEnabled: true,
				goldBracket: { config: {} }
			} as any
		});
		const breakdownSingles = calculateTimeBreakdown(tSingles);
		// Doubles should take longer (13 min/4 rounds vs 10 min/4 rounds)
		expect(breakdownDoubles.totalMinutes).toBeGreaterThan(breakdownSingles.totalMinutes);
	});
});

// ============================================================================
// calculateRemainingTime — edge cases
// ============================================================================

describe('calculateRemainingTime', () => {
	it('returns 0% complete and 0 remaining when no timeEstimate', () => {
		const t = makeTournament({ participants: makeParticipants(8) });
		// No timeEstimate set
		const result = calculateRemainingTime(t);
		expect(result.remainingMinutes).toBe(0);
		expect(result.percentComplete).toBe(0);
	});

	it('returns 0% for tournament with timeEstimate but no matches played', () => {
		const t = makeTournament({
			participants: makeParticipants(8),
			phaseType: 'ONE_PHASE',
			status: 'FINAL_STAGE',
			timeEstimate: { totalMinutes: 120, calculatedAt: Date.now() },
			finalStage: {
				mode: 'SINGLE_BRACKET',
				thirdPlaceMatchEnabled: true,
				goldBracket: {
					rounds: [
						{
							roundNumber: 1,
							name: 'quarterfinals',
							matches: [
								{ participantA: 'p1', participantB: 'p2', status: 'PENDING' },
								{ participantA: 'p3', participantB: 'p4', status: 'PENDING' },
								{ participantA: 'p5', participantB: 'p6', status: 'PENDING' },
								{ participantA: 'p7', participantB: 'p8', status: 'PENDING' }
							]
						},
						{
							roundNumber: 2,
							name: 'semifinals',
							matches: [
								{ participantA: null, participantB: null, status: 'PENDING' },
								{ participantA: null, participantB: null, status: 'PENDING' }
							]
						},
						{
							roundNumber: 3,
							name: 'final',
							matches: [
								{ participantA: null, participantB: null, status: 'PENDING' }
							]
						}
					]
				}
			} as any
		});
		const result = calculateRemainingTime(t);
		expect(result.percentComplete).toBe(0);
		expect(result.remainingMinutes).toBeGreaterThan(0);
	});

	it('returns 100% when all bracket matches are completed', () => {
		const t = makeTournament({
			participants: makeParticipants(4),
			phaseType: 'ONE_PHASE',
			status: 'COMPLETED',
			timeEstimate: { totalMinutes: 60, calculatedAt: Date.now() },
			finalStage: {
				mode: 'SINGLE_BRACKET',
				thirdPlaceMatchEnabled: true,
				goldBracket: {
					rounds: [
						{
							roundNumber: 1,
							name: 'semifinals',
							matches: [
								{ participantA: 'p1', participantB: 'p2', status: 'COMPLETED', winner: 'p1' },
								{ participantA: 'p3', participantB: 'p4', status: 'COMPLETED', winner: 'p3' }
							]
						},
						{
							roundNumber: 2,
							name: 'final',
							matches: [
								{ participantA: 'p1', participantB: 'p3', status: 'COMPLETED', winner: 'p1' }
							]
						}
					],
					thirdPlaceMatch: { participantA: 'p2', participantB: 'p4', status: 'COMPLETED', winner: 'p2' }
				}
			} as any
		});
		const result = calculateRemainingTime(t);
		expect(result.percentComplete).toBe(100);
		expect(result.remainingMinutes).toBe(0);
	});

	it('handles group stage progress correctly', () => {
		const t = makeTournament({
			participants: makeParticipants(4),
			phaseType: 'GROUP_ONLY',
			status: 'GROUP_STAGE',
			timeEstimate: { totalMinutes: 60, calculatedAt: Date.now() },
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [{
					id: 'g1',
					name: 'Group A',
					participants: ['p1', 'p2', 'p3', 'p4'],
					schedule: [
						{
							roundNumber: 1,
							matches: [
								{ participantA: 'p1', participantB: 'p2', status: 'COMPLETED' },
								{ participantA: 'p3', participantB: 'p4', status: 'COMPLETED' }
							]
						},
						{
							roundNumber: 2,
							matches: [
								{ participantA: 'p1', participantB: 'p3', status: 'PENDING' },
								{ participantA: 'p2', participantB: 'p4', status: 'PENDING' }
							]
						},
						{
							roundNumber: 3,
							matches: [
								{ participantA: 'p1', participantB: 'p4', status: 'PENDING' },
								{ participantA: 'p2', participantB: 'p3', status: 'PENDING' }
							]
						}
					],
					standings: []
				}],
				currentRound: 2,
				totalRounds: 3,
				isComplete: false,
				gameMode: 'rounds',
				roundsToPlay: 4,
				matchesToWin: 1,
				numGroups: 1,
				qualificationMode: 'WINS'
			} as any
		});
		const result = calculateRemainingTime(t);
		// 2 of 6 matches completed → ~33%
		expect(result.percentComplete).toBeGreaterThan(20);
		expect(result.percentComplete).toBeLessThan(50);
		expect(result.remainingMinutes).toBeGreaterThan(0);
	});

	it('handles BYE matches in group stage (not counted)', () => {
		const t = makeTournament({
			participants: makeParticipants(3),
			phaseType: 'GROUP_ONLY',
			status: 'GROUP_STAGE',
			timeEstimate: { totalMinutes: 30, calculatedAt: Date.now() },
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [{
					id: 'g1',
					name: 'Group A',
					participants: ['p1', 'p2', 'p3'],
					schedule: [
						{
							roundNumber: 1,
							matches: [
								{ participantA: 'p1', participantB: 'p2', status: 'COMPLETED' },
								{ participantA: 'p3', participantB: 'BYE', status: 'WALKOVER' }
							]
						},
						{
							roundNumber: 2,
							matches: [
								{ participantA: 'p1', participantB: 'p3', status: 'COMPLETED' },
								{ participantA: 'p2', participantB: 'BYE', status: 'WALKOVER' }
							]
						},
						{
							roundNumber: 3,
							matches: [
								{ participantA: 'p2', participantB: 'p3', status: 'COMPLETED' },
								{ participantA: 'p1', participantB: 'BYE', status: 'WALKOVER' }
							]
						}
					],
					standings: []
				}],
				currentRound: 3,
				totalRounds: 3,
				isComplete: true,
				gameMode: 'rounds',
				roundsToPlay: 4,
				matchesToWin: 1,
				numGroups: 1,
				qualificationMode: 'WINS'
			} as any
		});
		const result = calculateRemainingTime(t);
		// All real matches complete, BYEs skipped → 100%
		expect(result.percentComplete).toBe(100);
		expect(result.remainingMinutes).toBe(0);
	});
});

// ============================================================================
// calculateTournamentTimeEstimate — edge cases
// ============================================================================

describe('calculateTournamentTimeEstimate', () => {
	it('returns totalMinutes >= 0 always', () => {
		const t = makeTournament({ participants: [] });
		const estimate = calculateTournamentTimeEstimate(t);
		expect(estimate.totalMinutes).toBeGreaterThanOrEqual(0);
		expect(estimate.calculatedAt).toBeGreaterThan(0);
	});

	it('includes groupStageMinutes for TWO_PHASE', () => {
		const t = makeTournament({
			participants: makeParticipants(8),
			phaseType: 'TWO_PHASE',
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [],
				currentRound: 1,
				totalRounds: 7,
				isComplete: false,
				gameMode: 'rounds',
				roundsToPlay: 4,
				matchesToWin: 1,
				numGroups: 1,
				qualificationMode: 'WINS'
			} as any,
			finalStage: {
				mode: 'SINGLE_BRACKET',
				thirdPlaceMatchEnabled: true,
				goldBracket: { config: {} }
			} as any
		});
		const estimate = calculateTournamentTimeEstimate(t);
		expect(estimate.groupStageMinutes).toBeDefined();
		expect(estimate.groupStageMinutes!).toBeGreaterThan(0);
		expect(estimate.finalStageMinutes).toBeDefined();
		expect(estimate.finalStageMinutes!).toBeGreaterThan(0);
		expect(estimate.totalMinutes).toBe(
			estimate.groupStageMinutes! + estimate.finalStageMinutes! + 30 // 30 = breakBetweenPhases default
		);
	});

	it('scales with number of tables (more tables → less time)', () => {
		const base = {
			participants: makeParticipants(16),
			phaseType: 'ONE_PHASE' as const,
			finalStage: {
				mode: 'SINGLE_BRACKET',
				thirdPlaceMatchEnabled: true,
				goldBracket: { config: {} }
			} as any
		};
		const t2tables = makeTournament({ ...base, numTables: 2 });
		const t8tables = makeTournament({ ...base, numTables: 8 });
		const est2 = calculateTournamentTimeEstimate(t2tables);
		const est8 = calculateTournamentTimeEstimate(t8tables);
		expect(est2.totalMinutes).toBeGreaterThan(est8.totalMinutes);
	});

	it('50 player Swiss 5 rounds + bracket gives reasonable estimate', () => {
		const t = makeTournament({
			participants: makeParticipants(50),
			phaseType: 'TWO_PHASE',
			numTables: 10,
			groupStage: {
				type: 'SWISS',
				groups: [],
				currentRound: 1,
				totalRounds: 5,
				isComplete: false,
				gameMode: 'rounds',
				roundsToPlay: 4,
				matchesToWin: 1,
				numSwissRounds: 5,
				qualificationMode: 'WINS'
			} as any,
			finalStage: {
				mode: 'SINGLE_BRACKET',
				thirdPlaceMatchEnabled: true,
				goldBracket: { config: {} }
			} as any
		});
		const estimate = calculateTournamentTimeEstimate(t);
		// Should be a reasonable duration (2-6 hours for 50 players)
		expect(estimate.totalMinutes).toBeGreaterThan(60);  // At least 1 hour
		expect(estimate.totalMinutes).toBeLessThan(600);    // Less than 10 hours
	});
});
