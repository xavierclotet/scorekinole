import { describe, it, expect } from 'vitest';
import {
	probabilityColor,
	rankingToProbability,
	matchToPerformance,
	calculateWinProbability,
	extractH2HFromTournament,
	mergeH2HRecords,
	type H2HRecord
} from './probability';
import type { Tournament } from '$lib/types/tournament';

// ============================================================================
// probabilityColor
// ============================================================================

describe('probabilityColor', () => {
	it('returns strong green for >= 75%', () => {
		expect(probabilityColor(75)).toBe('#059669');
		expect(probabilityColor(90)).toBe('#059669');
		expect(probabilityColor(100)).toBe('#059669');
	});

	it('returns green for > 50% and < 75%', () => {
		expect(probabilityColor(51)).toBe('#10b981');
		expect(probabilityColor(60)).toBe('#10b981');
		expect(probabilityColor(74)).toBe('#10b981');
	});

	it('returns orange/amber for > 40% and <= 50%', () => {
		expect(probabilityColor(41)).toBe('#f59e0b');
		expect(probabilityColor(50)).toBe('#f59e0b');
	});

	it('returns red for <= 40%', () => {
		expect(probabilityColor(40)).toBe('#ef4444');
		expect(probabilityColor(30)).toBe('#ef4444');
		expect(probabilityColor(0)).toBe('#ef4444');
	});

	it('boundary: exactly 75 is strong green', () => {
		expect(probabilityColor(75)).toBe('#059669');
	});

	it('boundary: exactly 50 is orange', () => {
		expect(probabilityColor(50)).toBe('#f59e0b');
	});
});

// ============================================================================
// rankingToProbability
// ============================================================================

describe('rankingToProbability', () => {
	it('returns 0.5 when both rankings are 0', () => {
		expect(rankingToProbability(0, 0)).toBe(0.5);
	});

	it('returns 0.5 when rankings are equal', () => {
		const result = rankingToProbability(20, 20);
		expect(result).toBeCloseTo(0.5, 5);
	});

	it('symmetric: P(A wins) + P(B wins) = 1', () => {
		const pA = rankingToProbability(30, 10);
		const pB = rankingToProbability(10, 30);
		expect(pA + pB).toBeCloseTo(1, 10);
	});

	it('higher ranking gives > 0.5 probability', () => {
		expect(rankingToProbability(30, 10)).toBeGreaterThan(0.5);
		expect(rankingToProbability(50, 20)).toBeGreaterThan(0.5);
	});

	it('lower ranking gives < 0.5 probability', () => {
		expect(rankingToProbability(10, 30)).toBeLessThan(0.5);
	});

	it('extreme difference gives probability close to 1', () => {
		const p = rankingToProbability(70, 0);
		expect(p).toBeGreaterThan(0.9);
	});

	it('extreme difference gives probability close to 0', () => {
		const p = rankingToProbability(0, 70);
		expect(p).toBeLessThan(0.1);
	});

	it('moderate difference gives moderate probability', () => {
		const p = rankingToProbability(25, 15);
		expect(p).toBeGreaterThan(0.5);
		expect(p).toBeLessThan(0.9);
	});
});

// ============================================================================
// matchToPerformance
// ============================================================================

describe('matchToPerformance', () => {
	it('shutout for A gives 1.0', () => {
		expect(matchToPerformance(8, 0)).toBe(1.0);
	});

	it('shutout for B gives 0.0', () => {
		expect(matchToPerformance(0, 8)).toBe(0.0);
	});

	it('tie gives 0.5', () => {
		expect(matchToPerformance(4, 4)).toBe(0.5);
	});

	it('0-0 gives 0.5', () => {
		expect(matchToPerformance(0, 0)).toBe(0.5);
	});

	it('5-3 gives 0.625', () => {
		expect(matchToPerformance(5, 3)).toBe(0.625);
	});

	it('3-5 gives 0.375', () => {
		expect(matchToPerformance(3, 5)).toBe(0.375);
	});

	it('symmetric: perf(A,B) + perf(B,A) = 1', () => {
		expect(matchToPerformance(6, 2) + matchToPerformance(2, 6)).toBeCloseTo(1, 10);
	});
});

// ============================================================================
// calculateWinProbability
// ============================================================================

describe('calculateWinProbability', () => {
	describe('no H2H data', () => {
		it('returns 0.5 with no ranking and no H2H', () => {
			const result = calculateWinProbability(0, 0, null);
			expect(result.probabilityA).toBe(0.5);
			expect(result.probabilityB).toBe(0.5);
			expect(result.confidence).toBe('none');
			expect(result.source).toBe('ranking');
			expect(result.directMatches).toBe(0);
		});

		it('uses ranking only when no H2H', () => {
			const result = calculateWinProbability(30, 10, null);
			expect(result.probabilityA).toBeGreaterThan(0.5);
			expect(result.source).toBe('ranking');
			expect(result.confidence).toBe('low');
		});

		it('probabilities sum to 1', () => {
			const result = calculateWinProbability(25, 15, null);
			expect(result.probabilityA + result.probabilityB).toBeCloseTo(1, 10);
		});
	});

	describe('with H2H data', () => {
		it('uses blended probability for few matches with ranking', () => {
			const h2h: H2HRecord = {
				totalMatches: 2,
				performanceScores: [0.75, 0.625] // A won with moderate margins
			};
			const result = calculateWinProbability(20, 20, h2h);
			expect(result.probabilityA).toBeGreaterThan(0.5);
			expect(result.source).toBe('mixed'); // Both H2H and ranking present
			expect(result.confidence).toBe('low');
		});

		it('uses direct_h2h when no ranking and few matches', () => {
			const h2h: H2HRecord = {
				totalMatches: 2,
				performanceScores: [0.75, 0.625]
			};
			const result = calculateWinProbability(0, 0, h2h);
			expect(result.probabilityA).toBeGreaterThan(0.5);
			expect(result.source).toBe('direct_h2h');
			expect(result.confidence).toBe('low');
		});

		it('uses blended source when ranking differs', () => {
			const h2h: H2HRecord = {
				totalMatches: 2,
				performanceScores: [0.75, 0.625]
			};
			const result = calculateWinProbability(30, 10, h2h);
			expect(result.source).toBe('mixed');
		});

		it('full H2H weight at 5+ matches', () => {
			const h2h: H2HRecord = {
				totalMatches: 5,
				performanceScores: [0.25, 0.375, 0.25, 0.375, 0.25] // B dominates
			};
			const result = calculateWinProbability(30, 10, h2h);
			// Even though A has higher ranking, H2H overrides at 5 matches
			expect(result.source).toBe('direct_h2h');
			expect(result.confidence).toBe('high');
			expect(result.probabilityA).toBeLessThan(0.5);
		});

		it('medium confidence at 3-4 matches', () => {
			const h2h: H2HRecord = {
				totalMatches: 3,
				performanceScores: [0.75, 0.625, 0.875]
			};
			const result = calculateWinProbability(0, 0, h2h);
			expect(result.confidence).toBe('medium');
		});

		it('empty H2H treated as no H2H', () => {
			const h2h: H2HRecord = {
				totalMatches: 0,
				performanceScores: []
			};
			const result = calculateWinProbability(20, 10, h2h);
			expect(result.source).toBe('ranking');
		});

		it('Laplace smoothing prevents 0% and 100%', () => {
			// All matches: A scored 100%
			const h2h: H2HRecord = {
				totalMatches: 5,
				performanceScores: [1.0, 1.0, 1.0, 1.0, 1.0]
			};
			const result = calculateWinProbability(0, 0, h2h);
			expect(result.probabilityA).toBeLessThan(1.0);
			expect(result.probabilityA).toBeGreaterThan(0.8);
		});
	});
});

// ============================================================================
// extractH2HFromTournament
// ============================================================================

describe('extractH2HFromTournament', () => {
	it('returns null when no matches between players', () => {
		const tournament = {
			groupStage: {
				groups: [{
					schedule: [{
						matches: [{
							participantA: 'p1',
							participantB: 'p3',
							status: 'COMPLETED',
							totalPointsA: 6,
							totalPointsB: 2
						}]
					}]
				}]
			}
		} as unknown as Tournament;

		const result = extractH2HFromTournament(tournament, 'p1', 'p2');
		expect(result).toBeNull();
	});

	it('extracts from Round Robin group matches', () => {
		const tournament = {
			groupStage: {
				groups: [{
					schedule: [{
						matches: [{
							participantA: 'p1',
							participantB: 'p2',
							status: 'COMPLETED',
							totalPointsA: 6,
							totalPointsB: 2
						}]
					}]
				}]
			}
		} as unknown as Tournament;

		const result = extractH2HFromTournament(tournament, 'p1', 'p2');
		expect(result).not.toBeNull();
		expect(result!.totalMatches).toBe(1);
		expect(result!.performanceScores[0]).toBe(0.75); // 6/(6+2)
	});

	it('extracts from Swiss pairings', () => {
		const tournament = {
			groupStage: {
				groups: [{
					pairings: [{
						matches: [{
							participantA: 'p1',
							participantB: 'p2',
							status: 'COMPLETED',
							totalPointsA: 4,
							totalPointsB: 4
						}]
					}]
				}]
			}
		} as unknown as Tournament;

		const result = extractH2HFromTournament(tournament, 'p1', 'p2');
		expect(result).not.toBeNull();
		expect(result!.performanceScores[0]).toBe(0.5); // Tie
	});

	it('extracts from bracket matches', () => {
		const tournament = {
			finalStage: {
				goldBracket: {
					rounds: [{
						matches: [{
							participantA: 'p1',
							participantB: 'p2',
							status: 'COMPLETED',
							totalPointsA: 8,
							totalPointsB: 0
						}]
					}]
				}
			}
		} as unknown as Tournament;

		const result = extractH2HFromTournament(tournament, 'p1', 'p2');
		expect(result).not.toBeNull();
		expect(result!.performanceScores[0]).toBe(1.0); // Shutout
	});

	it('skips non-COMPLETED matches', () => {
		const tournament = {
			groupStage: {
				groups: [{
					schedule: [{
						matches: [
							{
								participantA: 'p1',
								participantB: 'p2',
								status: 'PENDING',
								totalPointsA: 0,
								totalPointsB: 0
							},
							{
								participantA: 'p1',
								participantB: 'p2',
								status: 'COMPLETED',
								totalPointsA: 6,
								totalPointsB: 2
							}
						]
					}]
				}]
			}
		} as unknown as Tournament;

		const result = extractH2HFromTournament(tournament, 'p1', 'p2');
		expect(result!.totalMatches).toBe(1);
	});

	it('handles reversed participant order', () => {
		const tournament = {
			groupStage: {
				groups: [{
					schedule: [{
						matches: [{
							participantA: 'p2',
							participantB: 'p1',
							status: 'COMPLETED',
							totalPointsA: 2,
							totalPointsB: 6
						}]
					}]
				}]
			}
		} as unknown as Tournament;

		// From p1's perspective: p1 scored 6, p2 scored 2
		const result = extractH2HFromTournament(tournament, 'p1', 'p2');
		expect(result).not.toBeNull();
		expect(result!.performanceScores[0]).toBe(0.75); // 6/(6+2) from p1's perspective
	});

	it('aggregates across multiple sources', () => {
		const tournament = {
			groupStage: {
				groups: [{
					schedule: [{
						matches: [{
							participantA: 'p1',
							participantB: 'p2',
							status: 'COMPLETED',
							totalPointsA: 6,
							totalPointsB: 2
						}]
					}]
				}]
			},
			finalStage: {
				goldBracket: {
					rounds: [{
						matches: [{
							participantA: 'p1',
							participantB: 'p2',
							status: 'COMPLETED',
							totalPointsA: 4,
							totalPointsB: 4
						}]
					}]
				}
			}
		} as unknown as Tournament;

		const result = extractH2HFromTournament(tournament, 'p1', 'p2');
		expect(result!.totalMatches).toBe(2);
	});

	it('extracts from 3rd place match', () => {
		const tournament = {
			finalStage: {
				goldBracket: {
					rounds: [],
					thirdPlaceMatch: {
						participantA: 'p1',
						participantB: 'p2',
						status: 'COMPLETED',
						totalPointsA: 5,
						totalPointsB: 3
					}
				}
			}
		} as unknown as Tournament;

		const result = extractH2HFromTournament(tournament, 'p1', 'p2');
		expect(result).not.toBeNull();
		expect(result!.totalMatches).toBe(1);
		expect(result!.performanceScores[0]).toBe(0.625); // 5/8
	});

	it('returns null for empty tournament', () => {
		const tournament = {} as Tournament;
		const result = extractH2HFromTournament(tournament, 'p1', 'p2');
		expect(result).toBeNull();
	});
});

// ============================================================================
// mergeH2HRecords
// ============================================================================

describe('mergeH2HRecords', () => {
	it('returns null for all null inputs', () => {
		expect(mergeH2HRecords(null, null)).toBeNull();
	});

	it('returns single record unchanged', () => {
		const record: H2HRecord = {
			totalMatches: 2,
			performanceScores: [0.75, 0.5]
		};
		const result = mergeH2HRecords(record);
		expect(result).not.toBeNull();
		expect(result!.totalMatches).toBe(2);
		expect(result!.performanceScores).toEqual([0.75, 0.5]);
	});

	it('merges multiple records', () => {
		const r1: H2HRecord = { totalMatches: 1, performanceScores: [0.75] };
		const r2: H2HRecord = { totalMatches: 2, performanceScores: [0.5, 0.625] };
		const result = mergeH2HRecords(r1, r2);
		expect(result!.totalMatches).toBe(3);
		expect(result!.performanceScores).toEqual([0.75, 0.5, 0.625]);
	});

	it('skips null records in merge', () => {
		const r1: H2HRecord = { totalMatches: 1, performanceScores: [0.75] };
		const result = mergeH2HRecords(null, r1, null);
		expect(result!.totalMatches).toBe(1);
	});

	it('returns null when all records are null', () => {
		expect(mergeH2HRecords(null, null, null)).toBeNull();
	});
});
