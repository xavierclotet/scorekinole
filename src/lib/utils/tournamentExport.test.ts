import { describe, it, expect } from 'vitest';
import { exportTournamentText, type ExportLevel } from './tournamentExport';

// ---------------------------------------------------------------------------
// Helpers to build minimal Tournament-like objects cast via `as any`
// ---------------------------------------------------------------------------

function makeParticipant(id: string, name: string, partnerName?: string) {
	return {
		id,
		name,
		...(partnerName ? { partner: { name: partnerName } } : {})
	};
}

function makeGroupMatch(
	pA: string,
	pB: string,
	status: string,
	ptsA: number,
	ptsB: number,
	rounds?: Array<{ pointsA: number; pointsB: number; twentiesA: number; twentiesB: number }>
) {
	return {
		participantA: pA,
		participantB: pB,
		status,
		totalPointsA: ptsA,
		totalPointsB: ptsB,
		rounds: rounds ?? []
	};
}

function makeBracketRound(name: string, matches: ReturnType<typeof makeGroupMatch>[]) {
	return { roundNumber: 1, name, matches };
}

function makeBracket(
	rounds: ReturnType<typeof makeBracketRound>[],
	thirdPlaceMatch?: ReturnType<typeof makeGroupMatch>
) {
	return {
		rounds,
		totalRounds: rounds.length,
		config: {
			earlyRounds: { gameMode: 'rounds', roundsToPlay: 4, matchesToWin: 1 },
			semifinal: { gameMode: 'rounds', roundsToPlay: 4, matchesToWin: 1 },
			final: { gameMode: 'rounds', roundsToPlay: 4, matchesToWin: 1 }
		},
		...(thirdPlaceMatch ? { thirdPlaceMatch } : {})
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportTournamentText', () => {
	// ----- 1. Level 1 with RR group (standings format) -----
	it('should export level 1 RR group as standings (name,totalPoints,20s)', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [
							{ participantId: 'p1', position: 1, totalPointsScored: 50, total20s: 8, points: 4 },
							{ participantId: 'p2', position: 2, totalPointsScored: 40, total20s: 5, points: 2 },
							{ participantId: 'p3', position: 3, totalPointsScored: 30, total20s: 2, points: 0 }
						],
						schedule: []
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 1);
		const lines = result.split('\n');

		expect(lines[0]).toBe('Group A');
		expect(lines[1]).toBe('Alice,50,8');
		expect(lines[2]).toBe('Bob,40,5');
		expect(lines[3]).toBe('Charlie,30,2');
	});

	// ----- 2. Level 2 with RR group (match results with 'RR R1' headers) -----
	it('should export level 2 RR group with match results and RR R headers', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'COMPLETED', 20, 15)
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		const lines = result.split('\n');

		expect(lines[0]).toBe('RR R1');
		expect(lines[1]).toBe('Alice,Bob,20,15');
	});

	// ----- 3. Level 3 with round detail lines -----
	it('should export level 3 with round-by-round detail', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'COMPLETED', 20, 15, [
										{ pointsA: 10, pointsB: 5, twentiesA: 3, twentiesB: 1 },
										{ pointsA: 5, pointsB: 10, twentiesA: 0, twentiesB: 2 },
										{ pointsA: 5, pointsB: 0, twentiesA: 1, twentiesB: 0 }
									])
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 3);
		const lines = result.split('\n');

		expect(lines[0]).toBe('RR R1');
		expect(lines[1]).toBe('Alice,Bob,20,15');
		expect(lines[2]).toBe('10,5,3,1');
		expect(lines[3]).toBe('5,10,0,2');
		expect(lines[4]).toBe('5,0,1,0');
	});

	// ----- 4. Swiss group (SS prefix) -----
	it('should use SS prefix for Swiss groups', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'SWISS',
				groups: [
					{
						name: 'Swiss Group',
						standings: [],
						pairings: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'COMPLETED', 25, 10)
								]
							},
							{
								roundNumber: 2,
								matches: [
									makeGroupMatch('p2', 'p1', 'COMPLETED', 18, 12)
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).toContain('SS R1');
		expect(result).toContain('SS R2');
		expect(result).toContain('Alice,Bob,25,10');
		expect(result).toContain('Bob,Alice,18,12');
	});

	// ----- 5. Single bracket final stage -----
	it('should export SINGLE_BRACKET final stage with [Final] header', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie'),
				makeParticipant('p4', 'Dana')
			],
			finalStage: {
				mode: 'SINGLE_BRACKET',
				goldBracket: makeBracket([
					makeBracketRound('Semifinales', [
						makeGroupMatch('p1', 'p2', 'COMPLETED', 30, 20),
						makeGroupMatch('p3', 'p4', 'COMPLETED', 25, 22)
					]),
					makeBracketRound('Final', [
						makeGroupMatch('p1', 'p3', 'COMPLETED', 35, 28)
					])
				]),
				isComplete: true
			},
			phaseType: 'TWO_PHASE'
		} as any;

		const result = exportTournamentText(tournament, 2);
		const lines = result.split('\n');

		expect(lines[0]).toBe('[Final]');
		expect(lines[1]).toBe('Semifinales');
		expect(lines[2]).toBe('Alice,Bob,30,20');
		expect(lines[3]).toBe('Charlie,Dana,25,22');
		expect(lines[4]).toBe('Final');
		expect(lines[5]).toBe('Alice,Charlie,35,28');
	});

	// ----- 6. Split divisions (A Finals + B Finals) -----
	it('should export SPLIT_DIVISIONS with A Finals and B Finals', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie'),
				makeParticipant('p4', 'Dana')
			],
			finalStage: {
				mode: 'SPLIT_DIVISIONS',
				goldBracket: makeBracket([
					makeBracketRound('Final', [
						makeGroupMatch('p1', 'p2', 'COMPLETED', 40, 30)
					])
				]),
				silverBracket: makeBracket([
					makeBracketRound('Final', [
						makeGroupMatch('p3', 'p4', 'COMPLETED', 20, 18)
					])
				]),
				isComplete: true
			},
			phaseType: 'TWO_PHASE'
		} as any;

		const result = exportTournamentText(tournament, 2);

		expect(result).toContain('[A Finals]');
		expect(result).toContain('Alice,Bob,40,30');
		expect(result).toContain('[B Finals]');
		expect(result).toContain('Charlie,Dana,20,18');

		// A Finals should appear before B Finals
		const aPos = result.indexOf('[A Finals]');
		const bPos = result.indexOf('[B Finals]');
		expect(aPos).toBeLessThan(bPos);
	});

	// ----- 7. Parallel brackets -----
	it('should export PARALLEL_BRACKETS with each named bracket', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie'),
				makeParticipant('p4', 'Dana'),
				makeParticipant('p5', 'Eve'),
				makeParticipant('p6', 'Frank')
			],
			finalStage: {
				mode: 'PARALLEL_BRACKETS',
				goldBracket: makeBracket([]), // not used in PARALLEL mode
				parallelBrackets: [
					{
						id: 'a',
						name: 'A Finals',
						label: 'A',
						bracket: makeBracket([
							makeBracketRound('Final', [
								makeGroupMatch('p1', 'p2', 'COMPLETED', 35, 25)
							])
						]),
						sourcePositions: [1, 2]
					},
					{
						id: 'b',
						name: 'B Finals',
						label: 'B',
						bracket: makeBracket([
							makeBracketRound('Final', [
								makeGroupMatch('p3', 'p4', 'COMPLETED', 28, 22)
							])
						]),
						sourcePositions: [3, 4]
					},
					{
						id: 'c',
						name: 'C Finals',
						label: 'C',
						bracket: makeBracket([
							makeBracketRound('Final', [
								makeGroupMatch('p5', 'p6', 'COMPLETED', 15, 12)
							])
						]),
						sourcePositions: [5, 6]
					}
				],
				isComplete: true
			},
			phaseType: 'TWO_PHASE'
		} as any;

		const result = exportTournamentText(tournament, 2);

		expect(result).toContain('[A Finals]');
		expect(result).toContain('Alice,Bob,35,25');
		expect(result).toContain('[B Finals]');
		expect(result).toContain('Charlie,Dana,28,22');
		expect(result).toContain('[C Finals]');
		expect(result).toContain('Eve,Frank,15,12');

		// Order: A before B before C
		const aIdx = result.indexOf('[A Finals]');
		const bIdx = result.indexOf('[B Finals]');
		const cIdx = result.indexOf('[C Finals]');
		expect(aIdx).toBeLessThan(bIdx);
		expect(bIdx).toBeLessThan(cIdx);
	});

	// ----- 8. 3rd place match -----
	it('should export 3rd place match with "3er puesto" header', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie'),
				makeParticipant('p4', 'Dana')
			],
			finalStage: {
				mode: 'SINGLE_BRACKET',
				goldBracket: makeBracket(
					[
						makeBracketRound('Semifinales', [
							makeGroupMatch('p1', 'p2', 'COMPLETED', 30, 20),
							makeGroupMatch('p3', 'p4', 'COMPLETED', 25, 22)
						]),
						makeBracketRound('Final', [
							makeGroupMatch('p1', 'p3', 'COMPLETED', 35, 28)
						])
					],
					// 3rd place match
					makeGroupMatch('p2', 'p4', 'COMPLETED', 22, 18)
				),
				isComplete: true
			},
			phaseType: 'TWO_PHASE'
		} as any;

		const result = exportTournamentText(tournament, 2);

		expect(result).toContain('3er puesto');
		expect(result).toContain('Bob,Dana,22,18');

		// 3er puesto should appear after the Final match
		const finalIdx = result.indexOf('Alice,Charlie,35,28');
		const thirdIdx = result.indexOf('3er puesto');
		expect(finalIdx).toBeLessThan(thirdIdx);
	});

	// ----- 9. Doubles (partner names "Alice / Charlie") -----
	it('should format doubles participants as "Name / PartnerName"', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice', 'Charlie'),
				makeParticipant('p2', 'Bob', 'Dana')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [
							{ participantId: 'p1', position: 1, totalPointsScored: 30, total20s: 5, points: 2 },
							{ participantId: 'p2', position: 2, totalPointsScored: 20, total20s: 3, points: 0 }
						],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'COMPLETED', 30, 20)
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		// Level 1 standings
		const resultL1 = exportTournamentText(tournament, 1);
		expect(resultL1).toContain('Alice / Charlie,30,5');
		expect(resultL1).toContain('Bob / Dana,20,3');

		// Level 2 match results
		const resultL2 = exportTournamentText(tournament, 2);
		expect(resultL2).toContain('Alice / Charlie,Bob / Dana,30,20');
	});

	// ----- 10. Tournament with no matches (empty output) -----
	it('should return empty string for GROUP_ONLY tournament with no groups', () => {
		const tournament = {
			participants: [makeParticipant('p1', 'Alice')],
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).toBe('');
	});

	it('should return empty string for tournament with empty schedule', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: []
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const resultL2 = exportTournamentText(tournament, 2);
		expect(resultL2).toBe('');
	});

	// ----- 11. BYE matches skipped -----
	it('should skip BYE matches in group stage', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'BYE', 'WALKOVER', 0, 0),
									makeGroupMatch('p1', 'p2', 'COMPLETED', 20, 15)
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		const lines = result.split('\n').filter((l) => l.trim() !== '');

		// Should contain the header and the real match only
		expect(lines).toHaveLength(2);
		expect(lines[0]).toBe('RR R1');
		expect(lines[1]).toBe('Alice,Bob,20,15');
	});

	it('should skip bracket matches with BYE participant', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			finalStage: {
				mode: 'SINGLE_BRACKET',
				goldBracket: makeBracket([
					makeBracketRound('Cuartos', [
						makeGroupMatch('p1', 'BYE', 'WALKOVER', 0, 0),
						makeGroupMatch('p1', 'p2', 'COMPLETED', 30, 25)
					])
				]),
				isComplete: true
			},
			phaseType: 'TWO_PHASE'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).not.toContain('BYE');
		expect(result).toContain('Alice,Bob,30,25');
	});

	// ----- 12. WALKOVER matches included -----
	it('should include WALKOVER matches (non-BYE)', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'WALKOVER', 0, 0)
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).toContain('Alice,Bob,0,0');
	});

	// ----- 13. Multiple groups (header includes group name) -----
	it('should include group name in round headers when multiple groups exist', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie'),
				makeParticipant('p4', 'Dana')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Grupo A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'COMPLETED', 20, 15)
								]
							}
						]
					},
					{
						name: 'Grupo B',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p3', 'p4', 'COMPLETED', 25, 10)
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);

		// Multiple groups use "GroupName R1" format (not "RR R1")
		expect(result).toContain('Grupo A R1');
		expect(result).toContain('Grupo B R1');
		expect(result).not.toContain('RR R1');
	});

	it('should use RR prefix when only one group exists', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'COMPLETED', 20, 15)
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).toContain('RR R1');
	});

	// ----- Additional coverage: incomplete matches skipped -----
	it('should skip PENDING matches', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'COMPLETED', 20, 15),
									makeGroupMatch('p1', 'p3', 'PENDING', 0, 0)
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).toContain('Alice,Bob,20,15');
		expect(result).not.toContain('Charlie');
	});

	it('should skip IN_PROGRESS matches', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'IN_PROGRESS', 10, 5)
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		const nonEmpty = result.split('\n').filter((l) => l.trim() !== '');
		// Only header should remain, no match lines
		expect(nonEmpty).toHaveLength(1);
		expect(nonEmpty[0]).toBe('RR R1');
	});

	// ----- Level 1 standings are sorted by position -----
	it('should sort level 1 standings by position', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [
							// Deliberately out of order
							{ participantId: 'p3', position: 3, totalPointsScored: 10, total20s: 1, points: 0 },
							{ participantId: 'p1', position: 1, totalPointsScored: 50, total20s: 8, points: 4 },
							{ participantId: 'p2', position: 2, totalPointsScored: 30, total20s: 4, points: 2 }
						],
						schedule: []
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 1);
		const lines = result.split('\n');

		expect(lines[0]).toBe('Group A');
		expect(lines[1]).toContain('Alice');
		expect(lines[2]).toContain('Bob');
		expect(lines[3]).toContain('Charlie');
	});

	// ----- GROUP_ONLY phaseType suppresses final stage -----
	it('should not export final stage when phaseType is GROUP_ONLY', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [
							{ participantId: 'p1', position: 1, totalPointsScored: 30, total20s: 5, points: 2 },
							{ participantId: 'p2', position: 2, totalPointsScored: 20, total20s: 3, points: 0 }
						],
						schedule: []
					}
				]
			},
			finalStage: {
				mode: 'SINGLE_BRACKET',
				goldBracket: makeBracket([
					makeBracketRound('Final', [
						makeGroupMatch('p1', 'p2', 'COMPLETED', 35, 25)
					])
				]),
				isComplete: true
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 1);
		expect(result).not.toContain('[Final]');
		expect(result).not.toContain('35');
	});

	// ----- Combined group + bracket (TWO_PHASE) -----
	it('should export both group stage and bracket for TWO_PHASE', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie'),
				makeParticipant('p4', 'Dana')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'COMPLETED', 20, 15),
									makeGroupMatch('p3', 'p4', 'COMPLETED', 25, 10)
								]
							}
						]
					}
				]
			},
			finalStage: {
				mode: 'SINGLE_BRACKET',
				goldBracket: makeBracket([
					makeBracketRound('Final', [
						makeGroupMatch('p1', 'p3', 'COMPLETED', 30, 22)
					])
				]),
				isComplete: true
			},
			phaseType: 'TWO_PHASE'
		} as any;

		const result = exportTournamentText(tournament, 2);

		// Group stage
		expect(result).toContain('RR R1');
		expect(result).toContain('Alice,Bob,20,15');
		expect(result).toContain('Charlie,Dana,25,10');

		// Final stage
		expect(result).toContain('[Final]');
		expect(result).toContain('Alice,Charlie,30,22');

		// Group stage should appear before final stage
		const rrIdx = result.indexOf('RR R1');
		const finalIdx = result.indexOf('[Final]');
		expect(rrIdx).toBeLessThan(finalIdx);
	});

	// ----- Level 3 round detail in bracket -----
	it('should export round-by-round detail in bracket matches at level 3', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			finalStage: {
				mode: 'SINGLE_BRACKET',
				goldBracket: makeBracket([
					makeBracketRound('Final', [
						makeGroupMatch('p1', 'p2', 'COMPLETED', 30, 20, [
							{ pointsA: 15, pointsB: 10, twentiesA: 2, twentiesB: 1 },
							{ pointsA: 15, pointsB: 10, twentiesA: 1, twentiesB: 0 }
						])
					])
				]),
				isComplete: true
			},
			phaseType: 'TWO_PHASE'
		} as any;

		const result = exportTournamentText(tournament, 3);
		const lines = result.split('\n');

		expect(lines).toContain('Alice,Bob,30,20');
		expect(lines).toContain('15,10,2,1');
		expect(lines).toContain('15,10,1,0');
	});

	// ----- 3rd place match skipped when incomplete -----
	it('should skip 3rd place match when not COMPLETED or WALKOVER', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob'),
				makeParticipant('p3', 'Charlie'),
				makeParticipant('p4', 'Dana')
			],
			finalStage: {
				mode: 'SINGLE_BRACKET',
				goldBracket: makeBracket(
					[
						makeBracketRound('Final', [
							makeGroupMatch('p1', 'p3', 'COMPLETED', 35, 28)
						])
					],
					makeGroupMatch('p2', 'p4', 'PENDING', 0, 0)
				),
				isComplete: false
			},
			phaseType: 'TWO_PHASE'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).not.toContain('3er puesto');
	});

	// ----- SPLIT_DIVISIONS without silver bracket -----
	it('should handle SPLIT_DIVISIONS with no silverBracket', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			finalStage: {
				mode: 'SPLIT_DIVISIONS',
				goldBracket: makeBracket([
					makeBracketRound('Final', [
						makeGroupMatch('p1', 'p2', 'COMPLETED', 40, 30)
					])
				]),
				// No silverBracket
				isComplete: true
			},
			phaseType: 'TWO_PHASE'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).toContain('[A Finals]');
		expect(result).not.toContain('[B Finals]');
	});

	// ----- Level 2 does NOT include round detail -----
	it('should not include round-by-round detail at level 2', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeGroupMatch('p1', 'p2', 'COMPLETED', 20, 15, [
										{ pointsA: 10, pointsB: 5, twentiesA: 3, twentiesB: 1 },
										{ pointsA: 10, pointsB: 10, twentiesA: 0, twentiesB: 2 }
									])
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).toContain('Alice,Bob,20,15');
		// Round detail lines should NOT appear
		expect(result).not.toContain('10,5,3,1');
		expect(result).not.toContain('10,10,0,2');
	});

	// ----- Defaults null totalPoints to 0 -----
	it('should default null/undefined totalPoints to 0', () => {
		const tournament = {
			participants: [
				makeParticipant('p1', 'Alice'),
				makeParticipant('p2', 'Bob')
			],
			groupStage: {
				type: 'ROUND_ROBIN',
				groups: [
					{
						name: 'Group A',
						standings: [],
						schedule: [
							{
								roundNumber: 1,
								matches: [
									{
										participantA: 'p1',
										participantB: 'p2',
										status: 'COMPLETED',
										totalPointsA: undefined,
										totalPointsB: null,
										rounds: []
									}
								]
							}
						]
					}
				]
			},
			phaseType: 'GROUP_ONLY'
		} as any;

		const result = exportTournamentText(tournament, 2);
		expect(result).toContain('Alice,Bob,0,0');
	});
});
