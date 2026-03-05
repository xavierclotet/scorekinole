import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/algorithms/probability', () => ({
	calculateWinProbability: vi.fn(
		() =>
			({
				probabilityA: 0.6,
				probabilityB: 0.4,
				confidence: 'medium',
				source: 'ranking',
				directMatches: 0
			}) as any
	),
	extractH2HFromTournament: vi.fn(() => null),
	mergeH2HRecords: vi.fn((a: any, b: any) => a || b || null)
}));

import {
	getProbabilityKey,
	getMatchProbability,
	computeTournamentProbabilities,
	getPendingUserIdPairs
} from './tournamentProbability';
import { calculateWinProbability } from '$lib/algorithms/probability';
import type { WinProbability } from '$lib/algorithms/probability';

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getProbabilityKey
// ---------------------------------------------------------------------------
describe('getProbabilityKey', () => {
	it('returns a:b when a < b lexicographically', () => {
		expect(getProbabilityKey('alice', 'bob')).toBe('alice:bob');
	});

	it('returns a:b when called as (b, a)', () => {
		expect(getProbabilityKey('bob', 'alice')).toBe('alice:bob');
	});

	it('is commutative — both orderings yield the same key', () => {
		const k1 = getProbabilityKey('p1', 'p2');
		const k2 = getProbabilityKey('p2', 'p1');
		expect(k1).toBe(k2);
	});

	it('handles same id', () => {
		expect(getProbabilityKey('x', 'x')).toBe('x:x');
	});
});

// ---------------------------------------------------------------------------
// getMatchProbability
// ---------------------------------------------------------------------------
describe('getMatchProbability', () => {
	const sampleProb: WinProbability = {
		probabilityA: 0.7,
		probabilityB: 0.3,
		confidence: 'high',
		source: 'direct_h2h',
		directMatches: 5
	};

	it('returns the probability as-is when A < B (key order matches)', () => {
		const map = new Map<string, WinProbability>();
		map.set('a:b', sampleProb);

		const result = getMatchProbability(map, 'a', 'b');
		expect(result).not.toBeNull();
		expect(result!.probabilityA).toBe(0.7);
		expect(result!.probabilityB).toBe(0.3);
	});

	it('flips probabilities when A > B (reverse lookup)', () => {
		const map = new Map<string, WinProbability>();
		map.set('a:b', sampleProb);

		const result = getMatchProbability(map, 'b', 'a');
		expect(result).not.toBeNull();
		expect(result!.probabilityA).toBe(0.3);
		expect(result!.probabilityB).toBe(0.7);
	});

	it('preserves other fields when flipping', () => {
		const map = new Map<string, WinProbability>();
		map.set('a:b', sampleProb);

		const result = getMatchProbability(map, 'b', 'a');
		expect(result!.confidence).toBe('high');
		expect(result!.source).toBe('direct_h2h');
		expect(result!.directMatches).toBe(5);
	});

	it('returns null when key is not in the map', () => {
		const map = new Map<string, WinProbability>();
		const result = getMatchProbability(map, 'x', 'y');
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// computeTournamentProbabilities
// ---------------------------------------------------------------------------
describe('computeTournamentProbabilities', () => {
	it('computes probabilities for pending group stage matches', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', userId: 'u1', rankingSnapshot: 100 },
				{ id: 'p2', name: 'Bob', userId: 'u2', rankingSnapshot: 80 }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'PENDING' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const result = computeTournamentProbabilities(tournament);
		expect(result.size).toBe(1);
		expect(result.has('p1:p2')).toBe(true);
		expect(calculateWinProbability).toHaveBeenCalledOnce();
		expect(calculateWinProbability).toHaveBeenCalledWith(100, 80, null);
	});

	it('computes probabilities for IN_PROGRESS matches', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', rankingSnapshot: 90 },
				{ id: 'p2', name: 'Bob', rankingSnapshot: 70 }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'IN_PROGRESS' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const result = computeTournamentProbabilities(tournament);
		expect(result.size).toBe(1);
		expect(result.has('p1:p2')).toBe(true);
	});

	it('skips COMPLETED matches', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', rankingSnapshot: 100 },
				{ id: 'p2', name: 'Bob', rankingSnapshot: 80 }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'COMPLETED' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const result = computeTournamentProbabilities(tournament);
		expect(result.size).toBe(0);
		expect(calculateWinProbability).not.toHaveBeenCalled();
	});

	it('skips WALKOVER matches', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', rankingSnapshot: 100 },
				{ id: 'p2', name: 'Bob', rankingSnapshot: 80 }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'WALKOVER' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const result = computeTournamentProbabilities(tournament);
		expect(result.size).toBe(0);
	});

	it('skips BYE matches (participantB === "BYE")', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', rankingSnapshot: 100 },
				{ id: 'BYE', name: 'BYE' }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'BYE', status: 'PENDING' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const result = computeTournamentProbabilities(tournament);
		expect(result.size).toBe(0);
	});

	it('returns empty map when there are no pending matches', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', rankingSnapshot: 100 },
				{ id: 'p2', name: 'Bob', rankingSnapshot: 80 }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'COMPLETED' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const result = computeTournamentProbabilities(tournament);
		expect(result.size).toBe(0);
	});

	it('handles groups with pairings (Swiss-style) instead of schedule', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', rankingSnapshot: 100 },
				{ id: 'p2', name: 'Bob', rankingSnapshot: 80 }
			],
			groupStage: {
				groups: [
					{
						pairings: [
							{
								round: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'PENDING' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const result = computeTournamentProbabilities(tournament);
		expect(result.size).toBe(1);
		expect(result.has('p1:p2')).toBe(true);
	});

	it('collects pending matches from bracket (finalStage) goldBracket rounds', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', rankingSnapshot: 100 },
				{ id: 'p2', name: 'Bob', rankingSnapshot: 80 }
			],
			groupStage: null,
			finalStage: {
				goldBracket: {
					rounds: [
						{
							matches: [
								{
									participantA: 'p1',
									participantB: 'p2',
									status: 'PENDING',
									position: 1
								}
							]
						}
					]
				}
			}
		} as any;

		const result = computeTournamentProbabilities(tournament);
		expect(result.size).toBe(1);
		expect(result.has('p1:p2')).toBe(true);
	});

	it('collects pending matches from silverBracket and thirdPlaceMatch', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', rankingSnapshot: 100 },
				{ id: 'p2', name: 'Bob', rankingSnapshot: 80 },
				{ id: 'p3', name: 'Carol', rankingSnapshot: 60 },
				{ id: 'p4', name: 'Dave', rankingSnapshot: 50 }
			],
			groupStage: null,
			finalStage: {
				goldBracket: {
					rounds: [],
					thirdPlaceMatch: {
						participantA: 'p3',
						participantB: 'p4',
						status: 'PENDING',
						position: 1
					}
				},
				silverBracket: {
					rounds: [
						{
							matches: [
								{
									participantA: 'p1',
									participantB: 'p2',
									status: 'PENDING',
									position: 1
								}
							]
						}
					]
				}
			}
		} as any;

		const result = computeTournamentProbabilities(tournament);
		expect(result.size).toBe(2);
		expect(result.has('p1:p2')).toBe(true);
		expect(result.has('p3:p4')).toBe(true);
	});

	it('uses default 0 ranking when rankingSnapshot is undefined', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice' },
				{ id: 'p2', name: 'Bob' }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'PENDING' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		computeTournamentProbabilities(tournament);
		expect(calculateWinProbability).toHaveBeenCalledWith(0, 0, null);
	});

	it('de-duplicates pairs across multiple groups', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', rankingSnapshot: 100 },
				{ id: 'p2', name: 'Bob', rankingSnapshot: 80 }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'PENDING' }
								]
							}
						]
					},
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p2', participantB: 'p1', status: 'PENDING' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const result = computeTournamentProbabilities(tournament);
		// Both matches produce the same key 'p1:p2', so only one probability computed
		expect(result.size).toBe(1);
		expect(calculateWinProbability).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// getPendingUserIdPairs
// ---------------------------------------------------------------------------
describe('getPendingUserIdPairs', () => {
	it('extracts userId pairs from pending group matches', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', userId: 'u1' },
				{ id: 'p2', name: 'Bob', userId: 'u2' }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'PENDING' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const pairs = getPendingUserIdPairs(tournament);
		expect(pairs).toHaveLength(1);
		// userId pair should be sorted lexicographically
		expect(pairs[0]).toEqual(['u1', 'u2']);
	});

	it('skips participants without userId (guest players)', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', userId: 'u1' },
				{ id: 'p2', name: 'Guest Bob' } // no userId
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'PENDING' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const pairs = getPendingUserIdPairs(tournament);
		expect(pairs).toHaveLength(0);
	});

	it('skips completed matches', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', userId: 'u1' },
				{ id: 'p2', name: 'Bob', userId: 'u2' }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'p2', status: 'COMPLETED' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const pairs = getPendingUserIdPairs(tournament);
		expect(pairs).toHaveLength(0);
	});

	it('includes IN_PROGRESS matches', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', userId: 'u1' },
				{ id: 'p2', name: 'Bob', userId: 'u2' }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{
										participantA: 'p1',
										participantB: 'p2',
										status: 'IN_PROGRESS'
									}
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const pairs = getPendingUserIdPairs(tournament);
		expect(pairs).toHaveLength(1);
	});

	it('collects pairs from bracket stage', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', userId: 'u1' },
				{ id: 'p2', name: 'Bob', userId: 'u2' }
			],
			groupStage: null,
			finalStage: {
				goldBracket: {
					rounds: [
						{
							matches: [
								{
									participantA: 'p1',
									participantB: 'p2',
									status: 'PENDING',
									position: 1
								}
							]
						}
					]
				}
			}
		} as any;

		const pairs = getPendingUserIdPairs(tournament);
		expect(pairs).toHaveLength(1);
		expect(pairs[0]).toEqual(['u1', 'u2']);
	});

	it('skips BYE matches in group stage', () => {
		const tournament = {
			participants: [
				{ id: 'p1', name: 'Alice', userId: 'u1' },
				{ id: 'BYE', name: 'BYE' }
			],
			groupStage: {
				groups: [
					{
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{ participantA: 'p1', participantB: 'BYE', status: 'PENDING' }
								]
							}
						]
					}
				]
			},
			finalStage: null
		} as any;

		const pairs = getPendingUserIdPairs(tournament);
		expect(pairs).toHaveLength(0);
	});
});
