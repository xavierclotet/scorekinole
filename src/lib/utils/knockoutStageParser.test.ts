import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	parseKnockoutStageText,
	serializeKnockoutStageData,
	convertToHistoricalBrackets,
	addByeMatchesToBrackets,
	getKnockoutPlaceholderText,
	type GenericBracketEntry,
	type GenericMatchEntry,
	type GenericRoundEntry
} from './knockoutStageParser';
import type { HistoricalBracketInput } from '$lib/firebase/tournamentImport';

// ─── parseKnockoutStageText ─────────────────────────────────────────────────

describe('parseKnockoutStageText', () => {
	it('returns error for empty text', () => {
		const result = parseKnockoutStageText('');
		expect(result.success).toBe(false);
		expect(result.errors).toContain('El texto está vacío');
		expect(result.brackets).toHaveLength(0);
		expect(result.totalMatches).toBe(0);
		expect(result.totalRounds).toBe(0);
	});

	it('returns error for whitespace-only text', () => {
		const result = parseKnockoutStageText('   \n\n  \t  ');
		expect(result.success).toBe(false);
		expect(result.errors).toContain('El texto está vacío');
	});

	it('parses a single bracket with two rounds and three matches', () => {
		const text = `[Finals]
Semifinals
A,B,8,2
C,D,6,8

Final
A,D,8,4`;

		const result = parseKnockoutStageText(text);
		expect(result.success).toBe(true);
		expect(result.brackets).toHaveLength(1);
		expect(result.brackets[0].name).toBe('Finals');
		expect(result.brackets[0].label).toBe('Finals');
		expect(result.brackets[0].rounds).toHaveLength(2);
		expect(result.totalMatches).toBe(3);
		expect(result.totalRounds).toBe(2);

		// Semifinals
		const semis = result.brackets[0].rounds[0];
		expect(semis.name).toBe('Semifinals');
		expect(semis.matches).toHaveLength(2);
		expect(semis.matches[0].participantAName).toBe('A');
		expect(semis.matches[0].participantBName).toBe('B');
		expect(semis.matches[0].scoreA).toBe(8);
		expect(semis.matches[0].scoreB).toBe(2);

		// Final
		const final = result.brackets[0].rounds[1];
		expect(final.name).toBe('Final');
		expect(final.matches).toHaveLength(1);
		expect(final.matches[0].participantAName).toBe('A');
		expect(final.matches[0].participantBName).toBe('D');
	});

	it('parses multiple brackets', () => {
		const text = `[A Finals]
Semifinals
A,B,8,2
C,D,6,8

Final
A,D,8,4

[B Finals]
Semifinals
E,F,8,4
G,H,2,8

Final
E,H,8,6`;

		const result = parseKnockoutStageText(text);
		expect(result.success).toBe(true);
		expect(result.brackets).toHaveLength(2);
		expect(result.brackets[0].name).toBe('A Finals');
		expect(result.brackets[0].label).toBe('A');
		expect(result.brackets[1].name).toBe('B Finals');
		expect(result.brackets[1].label).toBe('B');
		expect(result.totalMatches).toBe(6);
		expect(result.totalRounds).toBe(4);
	});

	it('appends round detail lines to the preceding match', () => {
		const text = `[Finals]
Semifinals
A,B,8,4
5,3,1,0
3,1,0,0
C,D,6,8

Final
A,D,8,4`;

		const result = parseKnockoutStageText(text);
		expect(result.success).toBe(true);

		const firstMatch = result.brackets[0].rounds[0].matches[0];
		expect(firstMatch.rounds).toHaveLength(2);
		expect(firstMatch.rounds[0]).toEqual({ pointsA: 5, pointsB: 3, twentiesA: 1, twentiesB: 0 });
		expect(firstMatch.rounds[1]).toEqual({ pointsA: 3, pointsB: 1, twentiesA: 0, twentiesB: 0 });

		// Second match should have no rounds
		const secondMatch = result.brackets[0].rounds[0].matches[1];
		expect(secondMatch.rounds).toHaveLength(0);
	});

	it('creates default "Finals" bracket with warning when no bracket header', () => {
		const text = `Semifinals
A,B,8,2
C,D,6,8

Final
A,D,8,4`;

		const result = parseKnockoutStageText(text);
		expect(result.success).toBe(true);
		expect(result.brackets).toHaveLength(1);
		expect(result.brackets[0].name).toBe('Finals');
		expect(result.brackets[0].label).toBe('A');
		expect(result.warnings.some(w => w.includes('Finals'))).toBe(true);
	});

	it('reports error for empty bracket name []', () => {
		const text = `[]
Semifinals
A,B,8,2`;

		const result = parseKnockoutStageText(text);
		expect(result.success).toBe(false);
		expect(result.errors.some(e => e.includes('nombre de bracket vacío'))).toBe(true);
	});

	it('warns about bracket with no valid rounds', () => {
		const text = `[A Finals]
Semifinals
A,B,8,2

[Empty Bracket]

[B Finals]
Final
C,D,6,8`;

		const result = parseKnockoutStageText(text);
		expect(result.success).toBe(true);
		expect(result.brackets).toHaveLength(2);
		expect(result.warnings.some(w => w.includes('Empty Bracket'))).toBe(true);
	});

	it('collects unknown participant names when validParticipantNames is provided', () => {
		const text = `[Finals]
Semifinals
Alice,Bob,8,2
Carol,Dave,6,8

Final
Alice,Dave,8,4`;

		const result = parseKnockoutStageText(text, {
			validParticipantNames: ['Alice', 'Bob']
		});

		expect(result.success).toBe(true);
		expect(result.unknownParticipants).toContain('Carol');
		expect(result.unknownParticipants).toContain('Dave');
		expect(result.unknownParticipants).not.toContain('Alice');
		expect(result.unknownParticipants).not.toContain('Bob');
	});

	it('excludes BYE from unknown participants check', () => {
		const text = `[Finals]
Semifinals
Alice,BYE,8,0
Bob,Carol,6,8

Final
Alice,Carol,8,4`;

		const result = parseKnockoutStageText(text, {
			validParticipantNames: ['Alice', 'Bob', 'Carol']
		});

		expect(result.unknownParticipants).toHaveLength(0);
	});

	it('returns empty unknownParticipants when no validParticipantNames provided', () => {
		const text = `[Finals]
Final
X,Y,8,2`;

		const result = parseKnockoutStageText(text);
		expect(result.unknownParticipants).toHaveLength(0);
	});

	it('extracts bracket labels correctly', () => {
		const text = `[A Finals]
Final
A,B,8,2

[Gold Medal]
Final
C,D,8,4

[Silver Medal]
Final
E,F,8,6

[Bronze Medal]
Final
G,H,8,0`;

		const result = parseKnockoutStageText(text);
		expect(result.brackets[0].label).toBe('A');
		expect(result.brackets[1].label).toBe('Gold');
		expect(result.brackets[2].label).toBe('Silver');
		expect(result.brackets[3].label).toBe('Bronze');
	});

	it('creates default round when match appears without a phase header', () => {
		const text = `[Finals]
A,B,8,2`;

		const result = parseKnockoutStageText(text);
		expect(result.success).toBe(true);
		expect(result.brackets[0].rounds[0].name).toBe('Round');
		expect(result.warnings.some(w => w.includes('sin fase definida'))).toBe(true);
	});

	it('handles case-insensitive BYE exclusion in participant validation', () => {
		const text = `[Finals]
Final
Alice,bye,8,0`;

		const result = parseKnockoutStageText(text, {
			validParticipantNames: ['Alice']
		});

		expect(result.unknownParticipants).toHaveLength(0);
	});

	it('returns unknownParticipants sorted alphabetically', () => {
		const text = `[Finals]
Final
Zara,Marta,8,2
Alice,Bob,6,8`;

		const result = parseKnockoutStageText(text, {
			validParticipantNames: ['Bob']
		});

		// Alice, Marta, Zara are unknown; should be sorted
		expect(result.unknownParticipants).toEqual(['Alice', 'Marta', 'Zara']);
	});

	it('returns empty unknownParticipants when validParticipantNames is empty array', () => {
		const text = `[Finals]
Final
Zara,Alice,8,2`;

		const result = parseKnockoutStageText(text, {
			validParticipantNames: []
		});

		// Empty valid list means validation is skipped
		expect(result.unknownParticipants).toHaveLength(0);
	});
});

// ─── serializeKnockoutStageData ─────────────────────────────────────────────

describe('serializeKnockoutStageData', () => {
	it('returns empty string for null input', () => {
		expect(serializeKnockoutStageData(null as unknown as HistoricalBracketInput[])).toBe('');
	});

	it('returns empty string for empty array', () => {
		expect(serializeKnockoutStageData([])).toBe('');
	});

	it('serializes a single bracket with matches', () => {
		const brackets: HistoricalBracketInput[] = [
			{
				name: 'Finals',
				label: 'A',
				sourcePositions: [1, 2],
				rounds: [
					{
						name: 'Semifinals',
						matches: [
							{ participantAName: 'A', participantBName: 'B', scoreA: 8, scoreB: 2 },
							{ participantAName: 'C', participantBName: 'D', scoreA: 6, scoreB: 8 }
						]
					},
					{
						name: 'Final',
						matches: [
							{ participantAName: 'A', participantBName: 'D', scoreA: 8, scoreB: 4 }
						]
					}
				]
			}
		];

		const text = serializeKnockoutStageData(brackets);
		expect(text).toContain('[Finals]');
		expect(text).toContain('Semifinals');
		expect(text).toContain('A,B,8,2');
		expect(text).toContain('C,D,6,8');
		expect(text).toContain('Final');
		expect(text).toContain('A,D,8,4');
	});

	it('skips BYE matches where participantAName is missing', () => {
		const brackets: HistoricalBracketInput[] = [
			{
				name: 'Finals',
				label: 'A',
				sourcePositions: [1, 2],
				rounds: [
					{
						name: 'Final',
						matches: [
							{ participantAName: '', participantBName: 'B', scoreA: 0, scoreB: 8 },
							{ participantAName: 'A', participantBName: 'D', scoreA: 8, scoreB: 4 }
						]
					}
				]
			}
		];

		const text = serializeKnockoutStageData(brackets);
		expect(text).not.toContain(',B,0,8');
		expect(text).toContain('A,D,8,4');
	});

	it('skips BYE matches where participantBName is missing', () => {
		const brackets: HistoricalBracketInput[] = [
			{
				name: 'Finals',
				label: 'A',
				sourcePositions: [1, 2],
				rounds: [
					{
						name: 'Final',
						matches: [
							{ participantAName: 'A', participantBName: '', scoreA: 8, scoreB: 0 },
							{ participantAName: 'C', participantBName: 'D', scoreA: 8, scoreB: 4 }
						]
					}
				]
			}
		];

		const text = serializeKnockoutStageData(brackets);
		expect(text).not.toContain('A,,8,0');
		expect(text).toContain('C,D,8,4');
	});

	it('includes round detail lines when present', () => {
		const brackets: HistoricalBracketInput[] = [
			{
				name: 'Finals',
				label: 'A',
				sourcePositions: [1, 2],
				rounds: [
					{
						name: 'Final',
						matches: [
							{
								participantAName: 'A',
								participantBName: 'B',
								scoreA: 8,
								scoreB: 4,
								rounds: [
									{ pointsA: 5, pointsB: 3, twentiesA: 1, twentiesB: 0 },
									{ pointsA: 3, pointsB: 1, twentiesA: 0, twentiesB: 0 }
								]
							}
						]
					}
				]
			}
		];

		const text = serializeKnockoutStageData(brackets);
		expect(text).toContain('A,B,8,4');
		expect(text).toContain('5,3,1,0');
		expect(text).toContain('3,1,0,0');
	});

	it('round-trips: parse -> convertToHistorical -> serialize -> parse gives same matches', () => {
		const originalText = `[A Finals]
Semifinals
Alice,Bob,8,2
Carol,Dave,6,8

Final
Alice,Dave,8,4`;

		const parsed1 = parseKnockoutStageText(originalText);
		expect(parsed1.success).toBe(true);

		const historical = convertToHistoricalBrackets(parsed1.brackets);
		const serialized = serializeKnockoutStageData(historical);
		const parsed2 = parseKnockoutStageText(serialized);

		expect(parsed2.success).toBe(true);
		expect(parsed2.totalMatches).toBe(parsed1.totalMatches);
		expect(parsed2.totalRounds).toBe(parsed1.totalRounds);

		// Verify match-level data is the same
		for (let b = 0; b < parsed1.brackets.length; b++) {
			for (let r = 0; r < parsed1.brackets[b].rounds.length; r++) {
				for (let m = 0; m < parsed1.brackets[b].rounds[r].matches.length; m++) {
					const m1 = parsed1.brackets[b].rounds[r].matches[m];
					const m2 = parsed2.brackets[b].rounds[r].matches[m];
					expect(m2.participantAName).toBe(m1.participantAName);
					expect(m2.participantBName).toBe(m1.participantBName);
					expect(m2.scoreA).toBe(m1.scoreA);
					expect(m2.scoreB).toBe(m1.scoreB);
				}
			}
		}
	});

	it('round-trips with round detail lines preserved', () => {
		const originalText = `[Finals]
Final
A,B,8,4
5,3,1,0
3,1,0,0`;

		const parsed1 = parseKnockoutStageText(originalText);
		const historical = convertToHistoricalBrackets(parsed1.brackets);
		const serialized = serializeKnockoutStageData(historical);
		const parsed2 = parseKnockoutStageText(serialized);

		expect(parsed2.brackets[0].rounds[0].matches[0].rounds).toHaveLength(2);
		expect(parsed2.brackets[0].rounds[0].matches[0].rounds[0]).toEqual({
			pointsA: 5, pointsB: 3, twentiesA: 1, twentiesB: 0
		});
	});
});

// ─── convertToHistoricalBrackets ────────────────────────────────────────────

describe('convertToHistoricalBrackets', () => {
	it('maps name, label, and sourcePositions correctly', () => {
		const parsed = parseKnockoutStageText(`[A Finals]
Final
A,B,8,2

[B Finals]
Final
C,D,8,4`);

		const historical = convertToHistoricalBrackets(parsed.brackets);
		expect(historical).toHaveLength(2);

		expect(historical[0].name).toBe('A Finals');
		expect(historical[0].label).toBe('A');
		expect(historical[0].sourcePositions).toEqual([1, 2]);

		expect(historical[1].name).toBe('B Finals');
		expect(historical[1].label).toBe('B');
		expect(historical[1].sourcePositions).toEqual([3, 4]);
	});

	it('calculates twentiesA and twentiesB from rounds', () => {
		const parsed = parseKnockoutStageText(`[Finals]
Final
A,B,8,4
5,3,1,0
3,1,2,1`);

		const historical = convertToHistoricalBrackets(parsed.brackets);
		const match = historical[0].rounds[0].matches[0];

		expect(match.twentiesA).toBe(3); // 1 + 2
		expect(match.twentiesB).toBe(1); // 0 + 1
		expect(match.rounds).toHaveLength(2);
	});

	it('does not set twenties when no round data is present', () => {
		const parsed = parseKnockoutStageText(`[Finals]
Final
A,B,8,4`);

		const historical = convertToHistoricalBrackets(parsed.brackets);
		const match = historical[0].rounds[0].matches[0];

		expect(match.twentiesA).toBeUndefined();
		expect(match.twentiesB).toBeUndefined();
	});

	it('handles third bracket with sourcePositions 5,6', () => {
		const parsed = parseKnockoutStageText(`[A Finals]
Final
A,B,8,2

[B Finals]
Final
C,D,8,4

[C Finals]
Final
E,F,8,6`);

		const historical = convertToHistoricalBrackets(parsed.brackets);
		expect(historical[2].sourcePositions).toEqual([5, 6]);
	});
});

// ─── addByeMatchesToBrackets ────────────────────────────────────────────────

describe('addByeMatchesToBrackets', () => {
	beforeEach(() => {
		vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });
	});

	function makeMatch(
		id: string,
		aName: string,
		bName: string,
		scoreA: number,
		scoreB: number
	): GenericMatchEntry {
		return {
			id,
			participantAId: aName.toLowerCase(),
			participantAName: aName,
			participantBId: bName.toLowerCase(),
			participantBName: bName,
			scoreA,
			scoreB,
			twentiesA: 0,
			twentiesB: 0,
			isWalkover: false
		};
	}

	it('skips brackets with fewer than 2 rounds', () => {
		const brackets: GenericBracketEntry[] = [
			{
				name: 'Test',
				label: 'A',
				sourcePositions: [1, 2],
				rounds: [
					{
						id: '1',
						name: 'Final',
						matches: [makeMatch('m1', 'Alice', 'Bob', 8, 2)]
					}
				]
			}
		];

		const result = addByeMatchesToBrackets(brackets);
		expect(result[0].rounds[0].matches).toHaveLength(1);
	});

	it('adds BYE matches for missing positions', () => {
		// Scenario: 3 players => Semi has 1 real match, 1 BYE needed
		// Semi: Alice vs Bob (Alice wins) => feeds into Final as participantA
		// Final: Alice vs Carol (Carol had BYE in semis)
		const brackets: GenericBracketEntry[] = [
			{
				name: 'Test',
				label: 'A',
				sourcePositions: [1, 2],
				rounds: [
					{
						id: '1',
						name: 'Semi',
						matches: [makeMatch('m1', 'Alice', 'Bob', 8, 2)]
					},
					{
						id: '2',
						name: 'Final',
						matches: [makeMatch('m2', 'Alice', 'Carol', 8, 4)]
					}
				]
			}
		];

		const result = addByeMatchesToBrackets(brackets);
		const semiMatches = result[0].rounds[0].matches;

		// Should now have 2 matches in semis
		expect(semiMatches).toHaveLength(2);

		// One of them should be a BYE match for Carol
		const byeMatch = semiMatches.find(m => m.participantBName === 'BYE');
		expect(byeMatch).toBeDefined();
		expect(byeMatch!.participantAName).toBe('Carol');
	});

	it('correctly orders matches based on where winner appears in next round', () => {
		// Semi: A vs B (A wins), C vs D (D wins)
		// Final: A vs D
		// A appears as participantA in final => position 0 in semis
		// D appears as participantB in final => position 1 in semis
		const brackets: GenericBracketEntry[] = [
			{
				name: 'Test',
				label: 'A',
				sourcePositions: [1, 2],
				rounds: [
					{
						id: '1',
						name: 'Semi',
						matches: [
							makeMatch('m1', 'C', 'D', 2, 8),  // D wins (should be position 1)
							makeMatch('m2', 'A', 'B', 8, 2)   // A wins (should be position 0)
						]
					},
					{
						id: '2',
						name: 'Final',
						matches: [makeMatch('m3', 'A', 'D', 8, 4)]
					}
				]
			}
		];

		const result = addByeMatchesToBrackets(brackets);
		const semiMatches = result[0].rounds[0].matches;

		// After reordering: A vs B should be first (position 0), C vs D second (position 1)
		expect(semiMatches[0].participantAName).toBe('A');
		expect(semiMatches[1].participantAName).toBe('C');
	});

	it('handles bracket with 3 rounds correctly', () => {
		// QF: A vs B (A wins), C vs D (C wins), E vs F (E wins), G vs H (H wins)
		// SF: A vs C (A wins), E vs H (H wins)
		// Final: A vs H
		const brackets: GenericBracketEntry[] = [
			{
				name: 'Test',
				label: 'A',
				sourcePositions: [1, 2],
				rounds: [
					{
						id: '1',
						name: 'QF',
						matches: [
							makeMatch('m1', 'A', 'B', 8, 2),
							makeMatch('m2', 'C', 'D', 8, 4),
							makeMatch('m3', 'E', 'F', 8, 6),
							makeMatch('m4', 'G', 'H', 2, 8)
						]
					},
					{
						id: '2',
						name: 'SF',
						matches: [
							makeMatch('m5', 'A', 'C', 8, 4),
							makeMatch('m6', 'E', 'H', 4, 8)
						]
					},
					{
						id: '3',
						name: 'Final',
						matches: [makeMatch('m7', 'A', 'H', 8, 6)]
					}
				]
			}
		];

		const result = addByeMatchesToBrackets(brackets);

		// QF should still have 4 matches (all positions filled)
		expect(result[0].rounds[0].matches).toHaveLength(4);
		// SF should still have 2 matches
		expect(result[0].rounds[1].matches).toHaveLength(2);
		// Final still 1
		expect(result[0].rounds[2].matches).toHaveLength(1);
	});

	it('does not add BYEs when all positions are filled', () => {
		const brackets: GenericBracketEntry[] = [
			{
				name: 'Test',
				label: 'A',
				sourcePositions: [1, 2],
				rounds: [
					{
						id: '1',
						name: 'Semi',
						matches: [
							makeMatch('m1', 'A', 'B', 8, 2),
							makeMatch('m2', 'C', 'D', 6, 8)
						]
					},
					{
						id: '2',
						name: 'Final',
						matches: [makeMatch('m3', 'A', 'D', 8, 4)]
					}
				]
			}
		];

		const result = addByeMatchesToBrackets(brackets);
		const semiMatches = result[0].rounds[0].matches;

		// No BYE matches should be added
		expect(semiMatches).toHaveLength(2);
		expect(semiMatches.every(m => m.participantBName !== 'BYE')).toBe(true);
	});
});

// ─── getKnockoutPlaceholderText ─────────────────────────────────────────────

describe('getKnockoutPlaceholderText', () => {
	it('returns single bracket placeholder by default', () => {
		const text = getKnockoutPlaceholderText();
		expect(text).toContain('[Finals]');
		expect(text).toContain('Semifinals');
		expect(text).toContain('Final');
		expect(text).not.toContain('[A - Finals]');
		expect(text).not.toContain('[B - Finals]');
	});

	it('returns single bracket placeholder when false', () => {
		const text = getKnockoutPlaceholderText(false);
		expect(text).toContain('[Finals]');
		expect(text).not.toContain('[A - Finals]');
	});

	it('returns multiple bracket placeholder when true', () => {
		const text = getKnockoutPlaceholderText(true);
		expect(text).toContain('[A - Finals]');
		expect(text).toContain('[B - Finals]');
		expect(text).toContain('R8');
		expect(text).toContain('Semifinals');
		expect(text).toContain('Final');
	});

	it('placeholder text is parseable', () => {
		const singleText = getKnockoutPlaceholderText(false);
		const singleResult = parseKnockoutStageText(singleText);
		expect(singleResult.success).toBe(true);
		expect(singleResult.brackets.length).toBeGreaterThan(0);

		const multiText = getKnockoutPlaceholderText(true);
		const multiResult = parseKnockoutStageText(multiText);
		expect(multiResult.success).toBe(true);
		expect(multiResult.brackets.length).toBe(2);
	});
});
