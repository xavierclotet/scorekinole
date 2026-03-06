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

describe('large tournament (50 players)', () => {
	it('assigns positions 1-50 without gaps for 50 players with distinct points', () => {
		const participants = createParticipants(50);
		const standings: GroupStanding[] = participants.map((p, i) =>
			createStanding(p.id, {
				points: (50 - i) * 2,
				matchesWon: 50 - i,
				matchesPlayed: 49,
				total20s: (50 - i) * 3,
				totalPointsScored: (50 - i) * 8
			})
		);

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		// Positions 1-50 with no gaps
		const positions = result.map(s => s.position).sort((a, b) => a - b);
		expect(positions).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

		// Best player should be position 1
		expect(result.find(s => s.participantId === 'p1')!.position).toBe(1);
		// Worst player should be position 50
		expect(result.find(s => s.participantId === 'p50')!.position).toBe(50);
	});

	it('resolves ties among 50 players with shared points via secondary criteria', () => {
		const participants = createParticipants(50);
		// Create groups of tied players: top 10 have 20pts, next 10 have 16pts, etc.
		const standings: GroupStanding[] = participants.map((p, i) => {
			const tier = Math.floor(i / 10);
			return createStanding(p.id, {
				points: (4 - tier) * 4 + 4,
				matchesWon: (4 - tier) * 2 + 2,
				matchesPlayed: 49,
				total20s: (50 - i) * 2, // unique 20s within each tier
				totalPointsScored: (50 - i) * 5
			});
		});

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		// All 50 positions assigned
		const positions = result.map(s => s.position).sort((a, b) => a - b);
		expect(positions).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

		// Within each tier, player with more 20s should rank higher
		// Check first tier (p1-p10, all 20pts): p1 has most 20s
		const p1Pos = result.find(s => s.participantId === 'p1')!.position;
		const p10Pos = result.find(s => s.participantId === 'p10')!.position;
		expect(p1Pos).toBeLessThan(p10Pos);
	});
});

describe('sub-tie detection in mini-league', () => {
	it('detects sub-tie when 2 of 3 players tie in mini-league', () => {
		const participants = createParticipants(6);
		// p1, p2, p3 all have 6 points, circular H2H
		// Mini-league: all have 2 points (1W 1L each)
		// BUT: p1 and p2 have same mini-league 20s, p3 has different
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10,
				headToHeadRecord: {
					p2: { result: 'WIN', twenties: 2 },
					p3: { result: 'LOSS', twenties: 1 }
				}
			}),
			createStanding('p2', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 1 },
					p3: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p3', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10,
				headToHeadRecord: {
					p1: { result: 'WIN', twenties: 4 },
					p2: { result: 'LOSS', twenties: 0 }
				}
			}),
			createStanding('p4', { points: 4, matchesWon: 2, matchesPlayed: 5 }),
			createStanding('p5', { points: 2, matchesWon: 1, matchesPlayed: 5 }),
			createStanding('p6', { points: 0, matchesWon: 0, matchesPlayed: 5 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		// Mini-league 20s: p3=4+0=4, p1=2+1=3, p2=1+2=3
		// p1 and p2 have same mini-league 20s (sub-tie)
		// p3 should be first of the three
		const p3Pos = result.find(s => s.participantId === 'p3')!.position;
		const p1Pos = result.find(s => s.participantId === 'p1')!.position;
		const p2Pos = result.find(s => s.participantId === 'p2')!.position;
		expect(p3Pos).toBeLessThan(p1Pos);
		expect(p3Pos).toBeLessThan(p2Pos);
		// p1 and p2 should have a sub-tie resolution via H2H between them
		// p1 beat p2 → p1 should be above p2
		expect(p1Pos).toBeLessThan(p2Pos);
	});

	it('resolves 3-player tie with all identical mini-league stats via global 20s', () => {
		const participants = createParticipants(6);
		// Equal ranking to prevent rankingSnapshot from resolving
		participants.forEach(p => { p.rankingSnapshot = 10; });

		// p1, p2, p3: circular H2H, same mini-league points, same mini-league 20s
		// Differ only in global total 20s
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 15,
				headToHeadRecord: {
					p2: { result: 'WIN', twenties: 2 },
					p3: { result: 'LOSS', twenties: 2 }
				}
			}),
			createStanding('p2', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 12,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 2 },
					p3: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p3', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10,
				headToHeadRecord: {
					p1: { result: 'WIN', twenties: 2 },
					p2: { result: 'LOSS', twenties: 2 }
				}
			}),
			createStanding('p4', { points: 4, matchesWon: 2, matchesPlayed: 5 }),
			createStanding('p5', { points: 2, matchesWon: 1, matchesPlayed: 5 }),
			createStanding('p6', { points: 0, matchesWon: 0, matchesPlayed: 5 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		// All mini-league stats identical → fallback to global 20s: p1(15) > p2(12) > p3(10)
		const p1Pos = result.find(s => s.participantId === 'p1')!.position;
		const p2Pos = result.find(s => s.participantId === 'p2')!.position;
		const p3Pos = result.find(s => s.participantId === 'p3')!.position;
		expect(p1Pos).toBeLessThan(p2Pos);
		expect(p2Pos).toBeLessThan(p3Pos);
	});

	it('handles sub-tie where 2 of 4 players share mini-league rank', () => {
		const participants = createParticipants(6);

		// 4-way tie at 6 points
		// p1: beats all → 6 mini-league pts (clear #1)
		// p2: beats p3,p4 loses to p1 → 4 mini-league pts
		// p3: beats p4, loses to p1,p2 → 2 mini-league pts (tied 20s with p4 scenario)
		// p4: beats nobody loses to all → 0 mini-league pts (clear last)
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 12,
				headToHeadRecord: {
					p2: { result: 'WIN', twenties: 2 },
					p3: { result: 'WIN', twenties: 2 },
					p4: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p2', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p3: { result: 'WIN', twenties: 2 },
					p4: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p3', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 8,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p2: { result: 'LOSS', twenties: 0 },
					p4: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p4', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 6,
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

		// Mini-league: p1 (6pts), p2 (4pts), p3 (2pts), p4 (0pts) → clear order
		const p1Pos = result.find(s => s.participantId === 'p1')!.position;
		const p2Pos = result.find(s => s.participantId === 'p2')!.position;
		const p3Pos = result.find(s => s.participantId === 'p3')!.position;
		const p4Pos = result.find(s => s.participantId === 'p4')!.position;
		expect(p1Pos).toBeLessThan(p2Pos);
		expect(p2Pos).toBeLessThan(p3Pos);
		expect(p3Pos).toBeLessThan(p4Pos);
	});
});

// ============================================================================
// Custom tiebreakerPriority — all criterion orders
// ============================================================================

describe('custom tiebreakerPriority (2-player)', () => {
	it('buchholz-first priority resolves tie by Buchholz before H2H', () => {
		const participants = createParticipants(4);
		// p1 beat p3 (2pts) → buchholz includes p3's 2pts
		// p2 beat p4 (0pts) → buchholz includes p4's 0pts
		// p1 also beat p2 in H2H (but buchholz resolves first)
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p2: { result: 'LOSS', twenties: 0 }, // p1 LOST to p2 in H2H
					p3: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'WIN', twenties: 2 }, // p2 WON H2H
					p4: { result: 'WIN', twenties: 1 }
				}
			}),
			createStanding('p3', { points: 2, matchesWon: 1, matchesPlayed: 3 }),
			createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3 })
		];

		// Default priority ['h2h', ...]: p2 wins (beat p1 in H2H)
		const defaultResult = resolveTiebreaker(standings, participants, false, 'WINS');
		expect(defaultResult.find(s => s.participantId === 'p2')!.position)
			.toBeLessThan(defaultResult.find(s => s.participantId === 'p1')!.position);

		// Buchholz-first ['buchholz', 'h2h', 'total20s', 'totalPoints']:
		// p1 buchholz = p3's 2pts = 2, p2 buchholz = p4's 0pts = 0 → p1 wins by buchholz
		const buchFirst = resolveTiebreaker(standings, participants, false, 'WINS', true,
			['buchholz', 'h2h', 'total20s', 'totalPoints']);
		expect(buchFirst.find(s => s.participantId === 'p1')!.position)
			.toBeLessThan(buchFirst.find(s => s.participantId === 'p2')!.position);
	});

	it('total20s-first priority resolves before H2H', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 10, totalPointsScored: 20,
				headToHeadRecord: { p2: { result: 'WIN', twenties: 3 } }
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 15, totalPointsScored: 20,
				headToHeadRecord: { p1: { result: 'LOSS', twenties: 1 } }
			}),
			createStanding('p3', { points: 2, matchesWon: 1, matchesPlayed: 3 }),
			createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3 })
		];

		// Default ['h2h', ...]: p1 wins (beat p2 in H2H)
		const defaultResult = resolveTiebreaker(standings, participants, false, 'WINS');
		expect(defaultResult.find(s => s.participantId === 'p1')!.position)
			.toBeLessThan(defaultResult.find(s => s.participantId === 'p2')!.position);

		// 20s-first ['total20s', 'h2h', 'totalPoints', 'buchholz']: p2 wins (15 > 10 20s)
		const twentiesFirst = resolveTiebreaker(standings, participants, false, 'WINS', true,
			['total20s', 'h2h', 'totalPoints', 'buchholz']);
		expect(twentiesFirst.find(s => s.participantId === 'p2')!.position)
			.toBeLessThan(twentiesFirst.find(s => s.participantId === 'p1')!.position);
	});

	it('totalPoints-first priority resolves before H2H and 20s (WINS mode)', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 10, totalPointsScored: 25,
				headToHeadRecord: { p2: { result: 'LOSS', twenties: 0 } }
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 15, totalPointsScored: 18,
				headToHeadRecord: { p1: { result: 'WIN', twenties: 3 } }
			}),
			createStanding('p3', { points: 2, matchesWon: 1, matchesPlayed: 3 }),
			createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3 })
		];

		// totalPoints-first: p1 wins (25 > 18 total points)
		const tpFirst = resolveTiebreaker(standings, participants, false, 'WINS', true,
			['totalPoints', 'h2h', 'total20s', 'buchholz']);
		expect(tpFirst.find(s => s.participantId === 'p1')!.position)
			.toBeLessThan(tpFirst.find(s => s.participantId === 'p2')!.position);
	});

	it('totalPoints criterion is skipped in POINTS mode (already primary)', () => {
		const participants = createParticipants(4);
		// In POINTS mode, primary = totalPointsScored. Same totalPointsScored = same group
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, totalPointsScored: 30, total20s: 5,
				headToHeadRecord: { p2: { result: 'WIN', twenties: 2 } }
			}),
			createStanding('p2', {
				points: 4, totalPointsScored: 30, total20s: 8,
				headToHeadRecord: { p1: { result: 'LOSS', twenties: 1 } }
			}),
			createStanding('p3', { points: 2, totalPointsScored: 20 }),
			createStanding('p4', { points: 0, totalPointsScored: 10 })
		];

		// Priority ['totalPoints', 'total20s', ...]: totalPoints is SKIPPED in POINTS mode
		// Falls through to total20s: p2 (8) > p1 (5)
		const result = resolveTiebreaker(standings, participants, false, 'POINTS', true,
			['totalPoints', 'total20s', 'h2h', 'buchholz']);
		expect(result.find(s => s.participantId === 'p2')!.position)
			.toBeLessThan(result.find(s => s.participantId === 'p1')!.position);
	});
});

describe('custom tiebreakerPriority (3+ player)', () => {
	it('buchholz-first with 3 players in Swiss mode', () => {
		const participants = createParticipants(6);
		// 3-way tie at 4 swissPoints. Give each different buchholz values.
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 4,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p3: { result: 'WIN', twenties: 1 },
					p5: { result: 'WIN', twenties: 1 }
				}
			}),
			createStanding('p2', {
				points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 4,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p4: { result: 'WIN', twenties: 1 },
					p6: { result: 'WIN', twenties: 1 }
				}
			}),
			createStanding('p3', {
				points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 4,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p5: { result: 'WIN', twenties: 1 },
					p6: { result: 'WIN', twenties: 1 }
				}
			}),
			createStanding('p4', { points: 2, swissPoints: 2, matchesWon: 1, matchesPlayed: 4 }),
			createStanding('p5', { points: 2, swissPoints: 2, matchesWon: 1, matchesPlayed: 4 }),
			createStanding('p6', { points: 0, swissPoints: 0, matchesWon: 0, matchesPlayed: 4 })
		];

		// Swiss: p1 opponents p3(4)+p5(2)=6, p2 opponents p4(2)+p6(0)=2, p3 opponents p5(2)+p6(0)=2
		// With buchholz-first: p1 (6) > p2 (2) = p3 (2)
		const result = resolveTiebreaker(standings, participants, true, 'WINS', true,
			['buchholz', 'total20s', 'totalPoints', 'h2h']);

		const p1Pos = result.find(s => s.participantId === 'p1')!.position;
		const p2Pos = result.find(s => s.participantId === 'p2')!.position;
		const p3Pos = result.find(s => s.participantId === 'p3')!.position;
		expect(p1Pos).toBeLessThan(p2Pos);
		expect(p1Pos).toBeLessThan(p3Pos);
	});

	it('RR+WINS: custom priority with h2h last (mini-league deferred)', () => {
		const participants = createParticipants(6);
		// 3-way tie with different total20s and totalPointsScored
		// When h2h is last, mini-league is checked last
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 8, totalPointsScored: 25,
				headToHeadRecord: {
					p2: { result: 'WIN', twenties: 2 },
					p3: { result: 'LOSS', twenties: 1 }
				}
			}),
			createStanding('p2', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 12, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p3: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p3', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10, totalPointsScored: 22,
				headToHeadRecord: {
					p1: { result: 'WIN', twenties: 4 },
					p2: { result: 'LOSS', twenties: 1 }
				}
			}),
			createStanding('p4', { points: 4, matchesWon: 2, matchesPlayed: 5 }),
			createStanding('p5', { points: 2, matchesWon: 1, matchesPlayed: 5 }),
			createStanding('p6', { points: 0, matchesWon: 0, matchesPlayed: 5 })
		];

		// Priority ['total20s', 'totalPoints', 'buchholz', 'h2h']:
		// total20s first: p2(12) > p3(10) > p1(8)
		const result = resolveTiebreaker(standings, participants, false, 'WINS', true,
			['total20s', 'totalPoints', 'buchholz', 'h2h']);

		const p1Pos = result.find(s => s.participantId === 'p1')!.position;
		const p2Pos = result.find(s => s.participantId === 'p2')!.position;
		const p3Pos = result.find(s => s.participantId === 'p3')!.position;
		expect(p2Pos).toBeLessThan(p3Pos);
		expect(p3Pos).toBeLessThan(p1Pos);
	});
});

// ============================================================================
// show20s=false edge cases
// ============================================================================

describe('show20s=false', () => {
	it('2-player tie: skips total20s criterion, falls to totalPoints', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 1, totalPointsScored: 30,
				headToHeadRecord: { p2: { result: 'TIE', twenties: 0 } }
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 10, totalPointsScored: 20,
				headToHeadRecord: { p1: { result: 'TIE', twenties: 0 } }
			}),
			createStanding('p3', { points: 2, matchesWon: 1, matchesPlayed: 3 }),
			createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3 })
		];

		// With show20s=true: H2H tied, p2 wins by 20s (10 > 1)
		const with20s = resolveTiebreaker(standings, participants, false, 'WINS', true);
		expect(with20s.find(s => s.participantId === 'p2')!.position)
			.toBeLessThan(with20s.find(s => s.participantId === 'p1')!.position);

		// With show20s=false: H2H tied, 20s SKIPPED, p1 wins by totalPoints (30 > 20)
		const no20s = resolveTiebreaker(standings, participants, false, 'WINS', false);
		expect(no20s.find(s => s.participantId === 'p1')!.position)
			.toBeLessThan(no20s.find(s => s.participantId === 'p2')!.position);
	});

	it('3-player tie RR+WINS with show20s=false: mini-league 20s skipped', () => {
		const participants = createParticipants(6);
		// Circular tie: all 2 mini-league points. Mini-league 20s differ but show20s=false
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10, totalPointsScored: 25,
				headToHeadRecord: {
					p2: { result: 'WIN', twenties: 3 },
					p3: { result: 'LOSS', twenties: 0 }
				}
			}),
			createStanding('p2', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10, totalPointsScored: 22,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p3: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p3', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'WIN', twenties: 4 },
					p2: { result: 'LOSS', twenties: 1 }
				}
			}),
			createStanding('p4', { points: 4, matchesWon: 2, matchesPlayed: 5 }),
			createStanding('p5', { points: 2, matchesWon: 1, matchesPlayed: 5 }),
			createStanding('p6', { points: 0, matchesWon: 0, matchesPlayed: 5 })
		];

		// show20s=false: mini-league points are equal (2 each), mini-league 20s skipped
		// Falls to totalPoints (WINS mode): p1(25) > p2(22) > p3(20)
		const result = resolveTiebreaker(standings, participants, false, 'WINS', false);

		const p1Pos = result.find(s => s.participantId === 'p1')!.position;
		const p2Pos = result.find(s => s.participantId === 'p2')!.position;
		const p3Pos = result.find(s => s.participantId === 'p3')!.position;
		expect(p1Pos).toBeLessThan(p2Pos);
		expect(p2Pos).toBeLessThan(p3Pos);
	});

	it('Swiss with show20s=false: skips 20s, uses totalPoints then buchholz', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 1, totalPointsScored: 30,
				headToHeadRecord: { p3: { result: 'WIN', twenties: 0 } }
			}),
			createStanding('p2', {
				points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 10, totalPointsScored: 20,
				headToHeadRecord: { p4: { result: 'WIN', twenties: 0 } }
			}),
			createStanding('p3', { points: 2, swissPoints: 2, matchesWon: 1, matchesPlayed: 3 }),
			createStanding('p4', { points: 0, swissPoints: 0, matchesWon: 0, matchesPlayed: 3 })
		];

		// Swiss + show20s=false: 20s skipped. totalPoints: p1(30) > p2(20)
		const result = resolveTiebreaker(standings, participants, true, 'WINS', false);
		expect(result.find(s => s.participantId === 'p1')!.position)
			.toBeLessThan(result.find(s => s.participantId === 'p2')!.position);
	});
});

// ============================================================================
// POINTS mode tiebreakers (3+ players)
// ============================================================================

describe('POINTS mode tiebreakers', () => {
	it('3-player tie in POINTS mode resolves by total20s then H2H', () => {
		const participants = createParticipants(6);
		// All tied at 30 totalPointsScored (primary in POINTS mode)
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, totalPointsScored: 30, total20s: 8,
				headToHeadRecord: {
					p2: { result: 'WIN', twenties: 2 },
					p3: { result: 'LOSS', twenties: 1 }
				}
			}),
			createStanding('p2', {
				points: 4, totalPointsScored: 30, total20s: 12,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p3: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p3', {
				points: 4, totalPointsScored: 30, total20s: 5,
				headToHeadRecord: {
					p1: { result: 'WIN', twenties: 3 },
					p2: { result: 'LOSS', twenties: 1 }
				}
			}),
			createStanding('p4', { points: 2, totalPointsScored: 20 }),
			createStanding('p5', { points: 1, totalPointsScored: 15 }),
			createStanding('p6', { points: 0, totalPointsScored: 10 })
		];

		// POINTS mode 3+: sort by total20s → p2(12) > p1(8) > p3(5)
		const result = resolveTiebreaker(standings, participants, false, 'POINTS');
		const p1Pos = result.find(s => s.participantId === 'p1')!.position;
		const p2Pos = result.find(s => s.participantId === 'p2')!.position;
		const p3Pos = result.find(s => s.participantId === 'p3')!.position;
		expect(p2Pos).toBeLessThan(p1Pos);
		expect(p1Pos).toBeLessThan(p3Pos);
	});

	it('POINTS mode: 2-player tie resolved by total20s, not totalPoints', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, totalPointsScored: 30, total20s: 5,
				headToHeadRecord: { p2: { result: 'TIE', twenties: 1 } }
			}),
			createStanding('p2', {
				points: 4, totalPointsScored: 30, total20s: 8,
				headToHeadRecord: { p1: { result: 'TIE', twenties: 2 } }
			}),
			createStanding('p3', { points: 2, totalPointsScored: 20 }),
			createStanding('p4', { points: 0, totalPointsScored: 10 })
		];

		// H2H tied → total20s: p2(8) > p1(5)
		const result = resolveTiebreaker(standings, participants, false, 'POINTS');
		expect(result.find(s => s.participantId === 'p2')!.position)
			.toBeLessThan(result.find(s => s.participantId === 'p1')!.position);
	});
});

// ============================================================================
// Partial resolution in multi-player ties
// ============================================================================

describe('partial resolution in multi-player ties', () => {
	it('3-player tie: 2 resolve via different 20s, 1 remains unresolved', () => {
		const participants = createParticipants(6);
		participants.forEach(p => { p.rankingSnapshot = 10; }); // Same ranking → won't break tie

		// p1, p2, p3 all have 6 points. All circular in H2H.
		// All same mini-league points (2 each), same mini-league 20s.
		// p1 and p2 have same global 20s, p3 has different → p3 resolves, p1/p2 remain tied
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10, totalPointsScored: 20,
				headToHeadRecord: {
					p2: { result: 'WIN', twenties: 2 },
					p3: { result: 'LOSS', twenties: 2 }
				}
			}),
			createStanding('p2', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 2 },
					p3: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p3', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 15, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'WIN', twenties: 2 },
					p2: { result: 'LOSS', twenties: 2 }
				}
			}),
			createStanding('p4', { points: 4, matchesWon: 2, matchesPlayed: 5 }),
			createStanding('p5', { points: 2, matchesWon: 1, matchesPlayed: 5 }),
			createStanding('p6', { points: 0, matchesWon: 0, matchesPlayed: 5 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		// p3 has most 20s (15) → resolves first to position 1
		const p3 = result.find(s => s.participantId === 'p3')!;
		expect(p3.position).toBe(1);

		// p1 and p2 have same 20s (10) → sub-tie
		// p1 beat p2 in H2H → p1 above p2 (resolved via H2H in sub-tie pass)
		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;
		expect(p1.position).toBeLessThan(p2.position);
	});

	it('4-player tie: 2 resolve clearly, 2 remain as unresolved sub-tie', () => {
		const participants = createParticipants(6);
		participants.forEach(p => { p.rankingSnapshot = 10; });

		// 4-way tie at 6 points, circular H2H with equal mini-league
		// Different total 20s: p1(20) > p2(15) > p3(10) = p4(10)
		// p3 and p4 have no H2H record → unresolved
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 20, totalPointsScored: 30,
				headToHeadRecord: {
					p2: { result: 'WIN', twenties: 2 },
					p3: { result: 'WIN', twenties: 2 },
					p4: { result: 'LOSS', twenties: 1 }
				}
			}),
			createStanding('p2', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 15, totalPointsScored: 25,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p3: { result: 'LOSS', twenties: 1 },
					p4: { result: 'WIN', twenties: 2 }
				}
			}),
			createStanding('p3', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p2: { result: 'WIN', twenties: 2 }
					// No record vs p4
				}
			}),
			createStanding('p4', {
				points: 6, matchesWon: 3, matchesPlayed: 5, total20s: 10, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'WIN', twenties: 2 },
					p2: { result: 'LOSS', twenties: 0 }
					// No record vs p3
				}
			}),
			createStanding('p5', { points: 2, matchesWon: 1, matchesPlayed: 5 }),
			createStanding('p6', { points: 0, matchesWon: 0, matchesPlayed: 5 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		// p1 has most global 20s (20) → position 1
		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;
		expect(p1.position).toBe(1);
		// p2 has 15 20s → position 2
		expect(p2.position).toBe(2);

		// p3 and p4 have same 20s (10), same totalPoints (20), no H2H → unresolved
		const p3 = result.find(s => s.participantId === 'p3')!;
		const p4 = result.find(s => s.participantId === 'p4')!;
		expect(p3.tieReason).toBe('unresolved');
		expect(p4.tieReason).toBe('unresolved');
		expect(p3.tiedWith).toContain('p4');
		expect(p4.tiedWith).toContain('p3');
	});
});

describe('edge cases: complete ties (all criteria identical)', () => {
	it('marks 2 players as unresolved when tied on everything (RR WINS)', () => {
		const participants = createParticipants(4);
		// p1 and p2: same points, tied H2H, same 20s, same totalPoints, same Buchholz
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p2: { result: 'TIE', twenties: 2 },
					p3: { result: 'WIN', twenties: 1 },
				}
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'TIE', twenties: 2 },
					p3: { result: 'WIN', twenties: 1 },
				}
			}),
			createStanding('p3', {
				points: 0, matchesWon: 0, matchesPlayed: 3,
				total20s: 0, totalPointsScored: 6,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p2: { result: 'LOSS', twenties: 0 },
				}
			}),
			createStanding('p4', { points: 2, matchesWon: 1, matchesPlayed: 3, total20s: 3, totalPointsScored: 12 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		// Both should be marked as unresolved
		expect(p1.tieReason).toBe('unresolved');
		expect(p2.tieReason).toBe('unresolved');
		expect(p1.tiedWith).toContain('p2');
		expect(p2.tiedWith).toContain('p1');

		// Both should be in positions 1-2 (above p4 and p3)
		expect(p1.position).toBeLessThanOrEqual(2);
		expect(p2.position).toBeLessThanOrEqual(2);
	});

	it('marks 2 players as unresolved when tied on everything (Swiss WINS)', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p2: { result: 'TIE', twenties: 2 },
					p3: { result: 'WIN', twenties: 1 },
				}
			}),
			createStanding('p2', {
				points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'TIE', twenties: 2 },
					p3: { result: 'WIN', twenties: 1 },
				}
			}),
			createStanding('p3', {
				points: 0, swissPoints: 0, matchesWon: 0, matchesPlayed: 3,
				total20s: 0, totalPointsScored: 6,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p2: { result: 'LOSS', twenties: 0 },
				}
			}),
			createStanding('p4', { points: 2, swissPoints: 2, matchesWon: 1, matchesPlayed: 3 })
		];

		const result = resolveTiebreaker(standings, participants, true, 'WINS');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		expect(p1.tieReason).toBe('unresolved');
		expect(p2.tieReason).toBe('unresolved');
		expect(p1.tiedWith).toContain('p2');
		expect(p2.tiedWith).toContain('p1');
	});

	it('marks 2 players as unresolved when tied on everything (POINTS mode)', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 30,
				headToHeadRecord: {
					p2: { result: 'TIE', twenties: 2 },
					p3: { result: 'WIN', twenties: 1 },
				}
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 30,
				headToHeadRecord: {
					p1: { result: 'TIE', twenties: 2 },
					p3: { result: 'WIN', twenties: 1 },
				}
			}),
			createStanding('p3', {
				points: 0, matchesWon: 0, matchesPlayed: 3,
				total20s: 0, totalPointsScored: 10,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p2: { result: 'LOSS', twenties: 0 },
				}
			}),
			createStanding('p4', { points: 2, matchesWon: 1, matchesPlayed: 3, totalPointsScored: 20 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'POINTS');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		expect(p1.tieReason).toBe('unresolved');
		expect(p2.tieReason).toBe('unresolved');
	});

	it('uses rankingSnapshot as fallback order for fully tied players', () => {
		// p1 has rankingSnapshot 40, p2 has 30 (from createParticipants)
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p2: { result: 'TIE', twenties: 2 },
					p3: { result: 'WIN', twenties: 1 },
				}
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'TIE', twenties: 2 },
					p3: { result: 'WIN', twenties: 1 },
				}
			}),
			createStanding('p3', { points: 0, matchesWon: 0, matchesPlayed: 3 }),
			createStanding('p4', { points: 2, matchesWon: 1, matchesPlayed: 3 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		// p1 has higher rankingSnapshot (40 vs 30), so should display first
		expect(p1.position).toBeLessThan(p2.position);
		// But still marked as unresolved
		expect(p1.tieReason).toBe('unresolved');
	});

	it('marks 3 players as unresolved when all tied on everything (RR WINS)', () => {
		const participants = createParticipants(6);
		// Circular tie: A beats B, B beats C, C beats A — all same 20s and points
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 6, matchesWon: 3, matchesPlayed: 5,
				total20s: 10, totalPointsScored: 30,
				headToHeadRecord: {
					p2: { result: 'WIN', twenties: 2 },
					p3: { result: 'LOSS', twenties: 2 },
					p4: { result: 'WIN', twenties: 2 },
				}
			}),
			createStanding('p2', {
				points: 6, matchesWon: 3, matchesPlayed: 5,
				total20s: 10, totalPointsScored: 30,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 2 },
					p3: { result: 'WIN', twenties: 2 },
					p4: { result: 'WIN', twenties: 2 },
				}
			}),
			createStanding('p3', {
				points: 6, matchesWon: 3, matchesPlayed: 5,
				total20s: 10, totalPointsScored: 30,
				headToHeadRecord: {
					p1: { result: 'WIN', twenties: 2 },
					p2: { result: 'LOSS', twenties: 2 },
					p4: { result: 'WIN', twenties: 2 },
				}
			}),
			createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 5 }),
			createStanding('p5', { points: 4, matchesWon: 2, matchesPlayed: 5 }),
			createStanding('p6', { points: 2, matchesWon: 1, matchesPlayed: 5 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;
		const p3 = result.find(s => s.participantId === 'p3')!;

		// All 3 have identical mini-league (each has 2 pts = 1W 1L), same 20s, same totalPoints
		// Should be marked unresolved
		expect(p1.tieReason).toBe('unresolved');
		expect(p2.tieReason).toBe('unresolved');
		expect(p3.tieReason).toBe('unresolved');
		// Each should reference the other two
		expect(p1.tiedWith).toContain('p2');
		expect(p1.tiedWith).toContain('p3');
	});

	it('handles 2 players with no H2H record (did not play each other in Swiss)', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p3: { result: 'WIN', twenties: 3 },
				}
			}),
			createStanding('p2', {
				points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p4: { result: 'WIN', twenties: 3 },
				}
			}),
			createStanding('p3', {
				points: 0, swissPoints: 0, matchesWon: 0, matchesPlayed: 3,
				total20s: 0, totalPointsScored: 6,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
				}
			}),
			createStanding('p4', {
				points: 0, swissPoints: 0, matchesWon: 0, matchesPlayed: 3,
				total20s: 0, totalPointsScored: 6,
				headToHeadRecord: {
					p2: { result: 'LOSS', twenties: 0 },
				}
			})
		];

		const result = resolveTiebreaker(standings, participants, true, 'WINS');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		// Same 20s, same totalPoints; Buchholz: p1 faced p3 (0pts), p2 faced p4 (0pts) — same
		// No H2H between p1 and p2 → unresolved
		expect(p1.tieReason).toBe('unresolved');
		expect(p2.tieReason).toBe('unresolved');
	});
});

describe('edge cases: hasTieForQualification with resolved ties', () => {
	it('returns true even when tie was resolved by tiebreakers (same primaryValue)', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3, position: 1, total20s: 10,
				headToHeadRecord: { p2: { result: 'WIN', twenties: 5 } }
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3, position: 2, total20s: 5,
				headToHeadRecord: { p1: { result: 'LOSS', twenties: 2 } }
			}),
			createStanding('p3', { points: 2, matchesWon: 1, matchesPlayed: 3, position: 3 }),
			createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3, position: 4 })
		];

		// Qualify top 1: p1 and p2 share primaryValue(4), so hasTieForQualification is true
		// even though tiebreaker resolved p1 > p2
		const hasTie = hasTieForQualification(standings, 1, false, 'WINS');
		expect(hasTie).toBe(true);
	});

	it('returns false when qualification line is between different primaryValues', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', { points: 6, matchesWon: 3, matchesPlayed: 3, position: 1 }),
			createStanding('p2', { points: 4, matchesWon: 2, matchesPlayed: 3, position: 2 }),
			createStanding('p3', { points: 2, matchesWon: 1, matchesPlayed: 3, position: 3 }),
			createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3, position: 4 })
		];

		// Top 2: p2(4 pts) vs p3(2 pts) — no tie
		expect(hasTieForQualification(standings, 2, false, 'WINS')).toBe(false);
	});
});

describe('edge cases: Buchholz with BYE opponents', () => {
	it('BYE opponent contributes 0 to Buchholz', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p2: { result: 'TIE', twenties: 2 },
					BYE: { result: 'WIN', twenties: 0 },
				}
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'TIE', twenties: 2 },
					p3: { result: 'WIN', twenties: 2 },
				}
			}),
			createStanding('p3', {
				points: 2, matchesWon: 1, matchesPlayed: 3,
				headToHeadRecord: {
					p2: { result: 'LOSS', twenties: 0 },
				}
			}),
			createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'WINS');

		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;

		// p1 Buchholz: p2(4pts) + BYE(not found, 0) = 4
		// p2 Buchholz: p1(4pts) + p3(2pts) = 6
		// p2 has higher Buchholz → ranked above p1
		expect(p2.position).toBeLessThan(p1.position);
		// Buchholz resolved it, so no unresolved tie
		expect(p1.tieReason).toBeUndefined();
		expect(p2.tieReason).toBeUndefined();
	});
});

describe('edge cases: show20s=false with complete tie', () => {
	it('skips 20s and reaches unresolved faster (2-player RR WINS)', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 10, totalPointsScored: 20,
				headToHeadRecord: {
					p2: { result: 'TIE', twenties: 5 },
					p3: { result: 'WIN', twenties: 3 },
				}
			}),
			createStanding('p2', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 3, totalPointsScored: 20,
				headToHeadRecord: {
					p1: { result: 'TIE', twenties: 1 },
					p3: { result: 'WIN', twenties: 1 },
				}
			}),
			createStanding('p3', { points: 0, matchesWon: 0, matchesPlayed: 3 }),
			createStanding('p4', { points: 2, matchesWon: 1, matchesPlayed: 3 })
		];

		// With show20s=true, p1 wins (10 vs 3 total 20s)
		const resultWith20s = resolveTiebreaker(standings, participants, false, 'WINS', true);
		const p1With = resultWith20s.find(s => s.participantId === 'p1')!;
		expect(p1With.position).toBe(1);
		expect(p1With.tieReason).toBeUndefined();

		// With show20s=false, 20s is skipped → same totalPoints → same Buchholz → unresolved
		const resultNo20s = resolveTiebreaker(standings, participants, false, 'WINS', false);
		const p1No = resultNo20s.find(s => s.participantId === 'p1')!;
		const p2No = resultNo20s.find(s => s.participantId === 'p2')!;
		expect(p1No.tieReason).toBe('unresolved');
		expect(p2No.tieReason).toBe('unresolved');
	});
});

describe('edge cases: large number tied players with identical stats', () => {
	it('handles 5 players all tied on everything in Swiss', () => {
		const participants = createParticipants(10);
		// 5 players all with identical stats. All face the SAME opponent (p6) so Buchholz is identical.
		const tiedStandings = Array.from({ length: 5 }, (_, i) =>
			createStanding(`p${i + 1}`, {
				points: 6, swissPoints: 6, matchesWon: 3, matchesPlayed: 5,
				total20s: 8, totalPointsScored: 24,
				headToHeadRecord: {
					p6: { result: 'WIN', twenties: 2 },
				}
			})
		);
		const otherStandings = [
			createStanding('p6', {
				points: 0, swissPoints: 0, matchesWon: 0, matchesPlayed: 5,
				total20s: 0, totalPointsScored: 0,
				headToHeadRecord: {
					p1: { result: 'LOSS', twenties: 0 },
					p2: { result: 'LOSS', twenties: 0 },
					p3: { result: 'LOSS', twenties: 0 },
					p4: { result: 'LOSS', twenties: 0 },
					p5: { result: 'LOSS', twenties: 0 },
				}
			}),
			createStanding('p7', { points: 4, swissPoints: 4, matchesWon: 2, matchesPlayed: 5 }),
			createStanding('p8', { points: 3, swissPoints: 3, matchesWon: 1, matchesPlayed: 5 }),
			createStanding('p9', { points: 2, swissPoints: 2, matchesWon: 1, matchesPlayed: 5 }),
			createStanding('p10', { points: 1, swissPoints: 1, matchesWon: 0, matchesPlayed: 5 }),
		];

		const result = resolveTiebreaker([...tiedStandings, ...otherStandings], participants, true, 'WINS');

		// All 5 tied players: same swissPoints, same 20s, same totalPoints, same Buchholz (all faced p6 with 0 pts)
		// No H2H between them → unresolved
		for (let i = 1; i <= 5; i++) {
			const p = result.find(s => s.participantId === `p${i}`)!;
			expect(p.tieReason).toBe('unresolved');
			expect(p.tiedWith!.length).toBe(4);
			expect(p.position).toBeLessThanOrEqual(5);
		}
	});
});

describe('edge cases: POINTS mode primary value', () => {
	it('groups by totalPointsScored, not victory points, in POINTS mode', () => {
		const participants = createParticipants(4);
		const standings: GroupStanding[] = [
			createStanding('p1', {
				points: 4, matchesWon: 2, matchesPlayed: 3,
				total20s: 5, totalPointsScored: 30,
				headToHeadRecord: { p2: { result: 'WIN', twenties: 3 } }
			}),
			createStanding('p2', {
				points: 2, matchesWon: 1, matchesPlayed: 3,
				total20s: 8, totalPointsScored: 30,
				headToHeadRecord: { p1: { result: 'LOSS', twenties: 2 } }
			}),
			createStanding('p3', { points: 6, matchesWon: 3, matchesPlayed: 3, totalPointsScored: 20 }),
			createStanding('p4', { points: 0, matchesWon: 0, matchesPlayed: 3, totalPointsScored: 10 })
		];

		const result = resolveTiebreaker(standings, participants, false, 'POINTS');

		// In POINTS mode, primary is totalPointsScored, NOT victory points
		// p1 and p2 both have 30 → tied, resolved by H2H (p1 beat p2)
		const p1 = result.find(s => s.participantId === 'p1')!;
		const p2 = result.find(s => s.participantId === 'p2')!;
		const p3 = result.find(s => s.participantId === 'p3')!;

		expect(p1.position).toBe(1);
		expect(p2.position).toBe(2);
		expect(p3.position).toBe(3); // 20 total points < 30
	});
});
