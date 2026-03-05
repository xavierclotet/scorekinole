import { describe, it, expect } from 'vitest';
import {
	resolveTiebreaker,
	updateHeadToHeadRecord,
	calculateMatchPoints,
	getQualifiers,
	hasTieForQualification,
	getParticipantsInTie
} from './tiebreaker';
import type { TournamentParticipant, GroupStanding } from '$lib/types/tournament';

/** Helper to create mock participants */
function createParticipants(count: number): TournamentParticipant[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i + 1}`,
		name: `Player ${i + 1}`,
		type: 'GUEST' as const,
		rankingSnapshot: (count - i) * 10,
		status: 'ACTIVE' as const
	}));
}

/** Helper to create a standing with default values */
function createStanding(
	participantId: string,
	overrides: Partial<GroupStanding> = {}
): GroupStanding {
	return {
		participantId,
		position: 0,
		matchesPlayed: 0,
		matchesWon: 0,
		matchesLost: 0,
		matchesTied: 0,
		points: 0,
		swissPoints: 0,
		total20s: 0,
		totalPointsScored: 0,
		qualifiedForFinal: false,
		...overrides
	};
}

describe('resolveTiebreaker', () => {
	describe('2-player ties', () => {
		it('resolves by H2H when one player beat the other', () => {
			const participants = createParticipants(4);
			const standings: GroupStanding[] = [
				createStanding('p1', {
					points: 4, matchesWon: 2, matchesPlayed: 3,
					headToHeadRecord: { p2: { result: 'WIN', twenties: 1 } }
				}),
				createStanding('p2', {
					points: 4, matchesWon: 2, matchesPlayed: 3,
					headToHeadRecord: { p1: { result: 'LOSS', twenties: 0 } }
				}),
				createStanding('p3', { points: 2, matchesWon: 1, matchesPlayed: 3 }),
				createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3 })
			];

			const result = resolveTiebreaker(standings, participants, false, 'WINS');

			// p1 should be above p2 (won H2H)
			const p1Pos = result.find(s => s.participantId === 'p1')!.position;
			const p2Pos = result.find(s => s.participantId === 'p2')!.position;
			expect(p1Pos).toBeLessThan(p2Pos);
		});

		it('falls through to 20s when H2H is a draw', () => {
			const participants = createParticipants(4);
			const standings: GroupStanding[] = [
				createStanding('p1', {
					points: 4, matchesWon: 2, matchesPlayed: 3,
					total20s: 5,
					headToHeadRecord: { p2: { result: 'TIE', twenties: 2 } }
				}),
				createStanding('p2', {
					points: 4, matchesWon: 2, matchesPlayed: 3,
					total20s: 8,
					headToHeadRecord: { p1: { result: 'TIE', twenties: 3 } }
				}),
				createStanding('p3', { points: 2, matchesWon: 1, matchesPlayed: 3 }),
				createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3 })
			];

			const result = resolveTiebreaker(standings, participants, false, 'WINS');

			// p2 should be above p1 (more 20s)
			const p1Pos = result.find(s => s.participantId === 'p1')!.position;
			const p2Pos = result.find(s => s.participantId === 'p2')!.position;
			expect(p2Pos).toBeLessThan(p1Pos);
		});

		it('falls through to Buchholz when H2H and 20s are equal', () => {
			const participants = createParticipants(4);
			const standings: GroupStanding[] = [
				createStanding('p1', {
					points: 4, matchesWon: 2, matchesPlayed: 3,
					total20s: 5, totalPointsScored: 20,
					headToHeadRecord: {
						p2: { result: 'TIE', twenties: 2 },
						p3: { result: 'WIN', twenties: 1 }
					}
				}),
				createStanding('p2', {
					points: 4, matchesWon: 2, matchesPlayed: 3,
					total20s: 5, totalPointsScored: 20,
					headToHeadRecord: {
						p1: { result: 'TIE', twenties: 2 },
						p4: { result: 'WIN', twenties: 1 }
					}
				}),
				createStanding('p3', { points: 2, matchesWon: 1, matchesPlayed: 3 }),
				createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3 })
			];

			const result = resolveTiebreaker(standings, participants, false, 'WINS');

			// p1 beat p3 (2 points) → buchholz includes p3's 2 points
			// p2 beat p4 (0 points) → buchholz includes p4's 0 points
			// p1's buchholz should be higher → p1 ranked above p2
			const p1Pos = result.find(s => s.participantId === 'p1')!.position;
			const p2Pos = result.find(s => s.participantId === 'p2')!.position;
			expect(p1Pos).toBeLessThan(p2Pos);
		});

		it('marks unresolved when all criteria are equal', () => {
			const participants = createParticipants(2);
			// Give them same ranking to prevent rankingSnapshot from resolving
			participants[0].rankingSnapshot = 10;
			participants[1].rankingSnapshot = 10;

			const standings: GroupStanding[] = [
				createStanding('p1', {
					points: 2, matchesWon: 1, matchesPlayed: 1,
					total20s: 3, totalPointsScored: 8
				}),
				createStanding('p2', {
					points: 2, matchesWon: 1, matchesPlayed: 1,
					total20s: 3, totalPointsScored: 8
				})
			];

			const result = resolveTiebreaker(standings, participants, false, 'WINS');

			// Both should be marked unresolved
			const p1 = result.find(s => s.participantId === 'p1')!;
			const p2 = result.find(s => s.participantId === 'p2')!;
			expect(p1.tieReason).toBe('unresolved');
			expect(p2.tieReason).toBe('unresolved');
			expect(p1.tiedWith).toContain('p2');
			expect(p2.tiedWith).toContain('p1');
		});
	});

	describe('3+ player ties (RR + WINS mini-league)', () => {
		it('resolves 3-player circular tie via mini-league 20s', () => {
			const participants = createParticipants(6);
			// p1, p2, p3 all have 6 points (3 wins each)
			// Mini-league: A beats B, B beats C, C beats A (circular → 2 pts each)
			// Differ by mini-league 20s
			const standings: GroupStanding[] = [
				createStanding('p1', {
					points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10,
					headToHeadRecord: {
						p2: { result: 'WIN', twenties: 3 },
						p3: { result: 'LOSS', twenties: 1 }
					}
				}),
				createStanding('p2', {
					points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10,
					headToHeadRecord: {
						p1: { result: 'LOSS', twenties: 0 },
						p3: { result: 'WIN', twenties: 2 }
					}
				}),
				createStanding('p3', {
					points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10,
					headToHeadRecord: {
						p1: { result: 'WIN', twenties: 4 },
						p2: { result: 'LOSS', twenties: 1 }
					}
				}),
				createStanding('p4', { points: 4, matchesWon: 2, matchesPlayed: 5 }),
				createStanding('p5', { points: 2, matchesWon: 1, matchesPlayed: 5 }),
				createStanding('p6', { points: 0, matchesWon: 0, matchesPlayed: 5 })
			];

			const result = resolveTiebreaker(standings, participants, false, 'WINS');

			// All have 2 mini-league points (1 win, 1 loss each)
			// Mini-league 20s: p3=4+1=5, p1=3+1=4, p2=2+0=2
			// Order should be: p3 (5), p1 (4), p2 (2)
			const p1Pos = result.find(s => s.participantId === 'p1')!.position;
			const p2Pos = result.find(s => s.participantId === 'p2')!.position;
			const p3Pos = result.find(s => s.participantId === 'p3')!.position;

			expect(p3Pos).toBeLessThan(p1Pos);
			expect(p1Pos).toBeLessThan(p2Pos);
		});

		it('resolves 4-player tie with clear dominator in mini-league', () => {
			const participants = createParticipants(6);
			// p1 beats all 3 others in mini-league (3-0)
			const standings: GroupStanding[] = [
				createStanding('p1', {
					points: 8, matchesWon: 4, matchesPlayed: 5, total20s: 12,
					headToHeadRecord: {
						p2: { result: 'WIN', twenties: 2 },
						p3: { result: 'WIN', twenties: 3 },
						p4: { result: 'WIN', twenties: 1 }
					}
				}),
				createStanding('p2', {
					points: 8, matchesWon: 4, matchesPlayed: 5, total20s: 10,
					headToHeadRecord: {
						p1: { result: 'LOSS', twenties: 0 },
						p3: { result: 'WIN', twenties: 2 },
						p4: { result: 'WIN', twenties: 1 }
					}
				}),
				createStanding('p3', {
					points: 8, matchesWon: 4, matchesPlayed: 5, total20s: 8,
					headToHeadRecord: {
						p1: { result: 'LOSS', twenties: 0 },
						p2: { result: 'LOSS', twenties: 1 },
						p4: { result: 'WIN', twenties: 2 }
					}
				}),
				createStanding('p4', {
					points: 8, matchesWon: 4, matchesPlayed: 5, total20s: 6,
					headToHeadRecord: {
						p1: { result: 'LOSS', twenties: 0 },
						p2: { result: 'LOSS', twenties: 0 },
						p3: { result: 'LOSS', twenties: 0 }
					}
				}),
				createStanding('p5', { points: 2, matchesWon: 1, matchesPlayed: 5 }),
				createStanding('p6', { points: 0, matchesWon: 0, matchesPlayed: 5 })
			];

			const result = resolveTiebreaker(standings, participants, false, 'WINS');

			// Mini-league: p1=6pts (3-0), p2=4pts (2-1), p3=2pts (1-2), p4=0pts (0-3)
			const p1Pos = result.find(s => s.participantId === 'p1')!.position;
			const p2Pos = result.find(s => s.participantId === 'p2')!.position;
			const p3Pos = result.find(s => s.participantId === 'p3')!.position;
			const p4Pos = result.find(s => s.participantId === 'p4')!.position;

			expect(p1Pos).toBe(1);
			expect(p2Pos).toBe(2);
			expect(p3Pos).toBe(3);
			expect(p4Pos).toBe(4);
		});
	});

	it('assigns sequential positions without gaps', () => {
		const participants = createParticipants(10);
		const standings: GroupStanding[] = participants.map((p, i) =>
			createStanding(p.id, {
				points: (10 - i) * 2,
				matchesWon: 10 - i,
				matchesPlayed: 9,
				total20s: (10 - i) * 3,
				totalPointsScored: (10 - i) * 8
			})
		);

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		// Positions should be 1 through 10 with no gaps
		const positions = result.map(s => s.position).sort((a, b) => a - b);
		expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	it('POINTS mode uses totalPointsScored as primary', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, totalPointsScored: 30
			}),
			createStanding('p2', {
				points: 2, matchesWon: 1, totalPointsScored: 35
			}),
			createStanding('p3', {
				points: 4, matchesWon: 2, totalPointsScored: 25
			}),
			createStanding('p4', {
				points: 0, matchesWon: 0, totalPointsScored: 10
			})
		];

		const result = resolveTiebreaker(standings, participants, false, 'POINTS');

		// In POINTS mode, primary = totalPointsScored: p2(35) > p1(30) > p3(25) > p4(10)
		expect(result[0].participantId).toBe('p2');
		expect(result[1].participantId).toBe('p1');
		expect(result[2].participantId).toBe('p3');
		expect(result[3].participantId).toBe('p4');
	});

	it('Swiss mode uses swissPoints as primary', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', { points: 4, swissPoints: 6, matchesWon: 3 }),
			createStanding('p2', { points: 6, swissPoints: 4, matchesWon: 2 }),
			createStanding('p3', { points: 2, swissPoints: 2, matchesWon: 1 }),
			createStanding('p4', { points: 0, swissPoints: 0, matchesWon: 0 })
		];

		const result = resolveTiebreaker(standings, participants, true, 'WINS');

		// Swiss primary = swissPoints: p1(6) > p2(4) > p3(2) > p4(0)
		expect(result[0].participantId).toBe('p1');
		expect(result[1].participantId).toBe('p2');
	});
});

describe('updateHeadToHeadRecord', () => {
	it('records WIN/LOSS correctly', () => {
		const standings = [
			createStanding('p1'),
			createStanding('p2')
		];

		const updated = updateHeadToHeadRecord(standings, 'p1', 'p2', 'p1', 2, 0);

		const p1 = updated.find(s => s.participantId === 'p1')!;
		const p2 = updated.find(s => s.participantId === 'p2')!;

		expect(p1.headToHeadRecord!['p2'].result).toBe('WIN');
		expect(p1.headToHeadRecord!['p2'].twenties).toBe(2);
		expect(p2.headToHeadRecord!['p1'].result).toBe('LOSS');
		expect(p2.headToHeadRecord!['p1'].twenties).toBe(0);
	});

	it('records TIE correctly', () => {
		const standings = [
			createStanding('p1'),
			createStanding('p2')
		];

		const updated = updateHeadToHeadRecord(standings, 'p1', 'p2', null, 1, 1);

		expect(updated.find(s => s.participantId === 'p1')!.headToHeadRecord!['p2'].result).toBe('TIE');
		expect(updated.find(s => s.participantId === 'p2')!.headToHeadRecord!['p1'].result).toBe('TIE');
	});
});

describe('calculateMatchPoints', () => {
	it('calculates correctly', () => {
		expect(calculateMatchPoints(3, 1)).toBe(7); // 3*2 + 1
		expect(calculateMatchPoints(0, 0)).toBe(0);
		expect(calculateMatchPoints(5, 0)).toBe(10);
		expect(calculateMatchPoints(0, 4)).toBe(4);
	});
});

describe('hasTieForQualification', () => {
	it('detects tie at qualification boundary (RR)', () => {
		const standings: GroupStanding[] = [
			createStanding('p1', { position: 1, points: 6 }),
			createStanding('p2', { position: 2, points: 4 }),
			createStanding('p3', { position: 3, points: 4 }),
			createStanding('p4', { position: 4, points: 2 })
		];

		// Top 2 qualify: p2 (pos 2) and p3 (pos 3) have same points
		expect(hasTieForQualification(standings, 2)).toBe(true);
		// Top 3 qualify: p3 (pos 3, 4pts) vs p4 (pos 4, 2pts) → no tie
		expect(hasTieForQualification(standings, 3)).toBe(false);
	});

	it('uses swissPoints for Swiss tournaments (Bug 3 regression)', () => {
		const standings: GroupStanding[] = [
			createStanding('p1', { position: 1, points: 6, swissPoints: 8 }),
			createStanding('p2', { position: 2, points: 4, swissPoints: 6 }),
			createStanding('p3', { position: 3, points: 2, swissPoints: 6 }),
			createStanding('p4', { position: 4, points: 0, swissPoints: 2 })
		];

		// Swiss: p2 and p3 have same swissPoints (6) → tie at boundary
		expect(hasTieForQualification(standings, 2, true, 'WINS')).toBe(true);

		// RR: p2 (4pts) vs p3 (2pts) → no tie
		expect(hasTieForQualification(standings, 2, false, 'WINS')).toBe(false);
	});

	it('returns false when all qualify', () => {
		const standings: GroupStanding[] = [
			createStanding('p1', { position: 1, points: 4 }),
			createStanding('p2', { position: 2, points: 2 })
		];

		expect(hasTieForQualification(standings, 2)).toBe(false);
		expect(hasTieForQualification(standings, 3)).toBe(false);
	});
});

describe('getParticipantsInTie', () => {
	it('finds all participants with same points at a position (RR)', () => {
		const standings: GroupStanding[] = [
			createStanding('p1', { position: 1, points: 6 }),
			createStanding('p2', { position: 2, points: 4 }),
			createStanding('p3', { position: 3, points: 4 }),
			createStanding('p4', { position: 4, points: 2 })
		];

		const tied = getParticipantsInTie(standings, 2);
		expect(tied).toContain('p2');
		expect(tied).toContain('p3');
		expect(tied).toHaveLength(2);
	});

	it('uses swissPoints for Swiss tournaments (Bug 4 regression)', () => {
		const standings: GroupStanding[] = [
			createStanding('p1', { position: 1, points: 6, swissPoints: 8 }),
			createStanding('p2', { position: 2, points: 4, swissPoints: 6 }),
			createStanding('p3', { position: 3, points: 2, swissPoints: 6 }),
			createStanding('p4', { position: 4, points: 0, swissPoints: 4 })
		];

		// Swiss: p2 and p3 have same swissPoints (6)
		const tiedSwiss = getParticipantsInTie(standings, 2, true, 'WINS');
		expect(tiedSwiss).toContain('p2');
		expect(tiedSwiss).toContain('p3');
		expect(tiedSwiss).toHaveLength(2);

		// RR: p2 has points=4, only p2 has that value
		const tiedRR = getParticipantsInTie(standings, 2, false, 'WINS');
		expect(tiedRR).toContain('p2');
		expect(tiedRR).toHaveLength(1);
	});

	it('returns empty for invalid position', () => {
		const standings: GroupStanding[] = [
			createStanding('p1', { position: 1, points: 4 })
		];

		expect(getParticipantsInTie(standings, 0)).toEqual([]);
		expect(getParticipantsInTie(standings, 5)).toEqual([]);
	});
});

describe('getQualifiers', () => {
	it('returns top N participants by position', () => {
		const standings: GroupStanding[] = [
			createStanding('p1', { position: 1 }),
			createStanding('p2', { position: 2 }),
			createStanding('p3', { position: 3 }),
			createStanding('p4', { position: 4 })
		];

		expect(getQualifiers(standings, 2)).toEqual(['p1', 'p2']);
		expect(getQualifiers(standings, 3)).toEqual(['p1', 'p2', 'p3']);
	});
});
