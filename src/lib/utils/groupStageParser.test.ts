import { describe, it, expect } from 'vitest';
import {
	parseGroupStageText,
	computeStandingsFromMatches,
	serializeGroupStageData,
	type ParsedGroupMatch
} from './groupStageParser';

// ============================================================================
// parseGroupStageText — standings format (classic)
// ============================================================================

describe('parseGroupStageText — standings format', () => {
	it('parses single group with participants', () => {
		const text = `Grupo 1
Harry Rowe,63,90
Chris Robinson,58,70
Dan Rowe,55,60`;

		const result = parseGroupStageText(text);
		expect(result.success).toBe(true);
		expect(result.groups).toHaveLength(1);
		expect(result.groups[0].name).toBe('Grupo 1');
		expect(result.groups[0].participants).toHaveLength(3);
		expect(result.totalParticipants).toBe(3);
	});

	it('positions are sorted by points descending', () => {
		const text = `Group 1
Player A,40,10
Player B,60,20
Player C,50,15`;

		const result = parseGroupStageText(text);
		const participants = result.groups[0].participants;
		expect(participants[0].name).toBe('Player B');
		expect(participants[0].position).toBe(1);
		expect(participants[1].name).toBe('Player C');
		expect(participants[1].position).toBe(2);
		expect(participants[2].name).toBe('Player A');
		expect(participants[2].position).toBe(3);
	});

	it('tied positions share the same position number', () => {
		const text = `Group 1
Player A,50,20
Player B,50,20
Player C,40,10`;

		const result = parseGroupStageText(text);
		const participants = result.groups[0].participants;
		expect(participants[0].position).toBe(1);
		expect(participants[1].position).toBe(1); // same points and 20s → tied
		expect(participants[2].position).toBe(3); // skips position 2
	});

	it('ties broken by 20s', () => {
		const text = `Group 1
Player A,50,15
Player B,50,20`;

		const result = parseGroupStageText(text);
		const participants = result.groups[0].participants;
		expect(participants[0].name).toBe('Player B'); // higher 20s
		expect(participants[0].position).toBe(1);
		expect(participants[1].name).toBe('Player A');
		expect(participants[1].position).toBe(2);
	});

	it('parses multiple groups separated by blank lines', () => {
		const text = `Group 1
Player A,60,20
Player B,50,15

Group 2
Player C,55,18
Player D,45,12`;

		const result = parseGroupStageText(text);
		expect(result.success).toBe(true);
		expect(result.groups).toHaveLength(2);
		expect(result.totalParticipants).toBe(4);
	});

	it('detects duplicate names', () => {
		const text = `Group 1
Player A,60,20
Player A,50,15`;

		const result = parseGroupStageText(text);
		expect(result.success).toBe(false);
		expect(result.errors.some(e => e.includes('duplicado'))).toBe(true);
	});

	it('returns error for empty text', () => {
		const result = parseGroupStageText('');
		expect(result.success).toBe(false);
		expect(result.errors.some(e => e.includes('vacío'))).toBe(true);
	});

	it('line with non-numeric fields treated as group name (not participant)', () => {
		// "Player A,abc,20" → parseInt('abc') is NaN → detected as groupName, not participant
		const text = `Group 1
Player A,abc,20
Player B,50,15`;

		const result = parseGroupStageText(text);
		// "Player A,abc,20" becomes a group name, Player B goes into that group
		expect(result.success).toBe(true);
		expect(result.totalParticipants).toBe(1); // Only Player B
	});

	it('creates default group name when missing', () => {
		const text = `Player A,60,20
Player B,50,15`;

		const result = parseGroupStageText(text);
		expect(result.success).toBe(true);
		expect(result.groups[0].name).toBe('Grupo 1');
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it('parses doubles format with partner separator', () => {
		const text = `Group 1
María / Carlos,63,90
Ana / Pedro,58,70`;

		const result = parseGroupStageText(text, 'doubles');
		expect(result.success).toBe(true);
		expect(result.groups[0].participants[0].player1Name).toBe('María');
		expect(result.groups[0].participants[0].player2Name).toBe('Carlos');
	});

	it('parses doubles with team name in parentheses', () => {
		const text = `Group 1
María / Carlos (Los Tigres),63,90`;

		const result = parseGroupStageText(text, 'doubles');
		const p = result.groups[0].participants[0];
		expect(p.teamName).toBe('Los Tigres');
		expect(p.name).toBe('Los Tigres');
		expect(p.player1Name).toBe('María');
		expect(p.player2Name).toBe('Carlos');
	});
});

// ============================================================================
// parseGroupStageText — round-based format (SS R1 / RR R1)
// ============================================================================

describe('parseGroupStageText — round-based format', () => {
	it('auto-detects round-based format (SS R1)', () => {
		const text = `SS R1
Harry,Chris,6,2
2,0,1,0
2,0,0,1
2,0,1,0
0,2,0,0`;

		const result = parseGroupStageText(text);
		expect(result.success).toBe(true);
		expect(result.groups.length).toBeGreaterThanOrEqual(1);
		expect(result.groups[0].matches).toBeDefined();
	});

	it('auto-detects RR format', () => {
		const text = `RR R1
Alice,Bob,4,4
2,0,1,0
0,2,0,1
2,0,1,0
0,2,0,0`;

		const result = parseGroupStageText(text);
		expect(result.success).toBe(true);
	});

	it('computes standings from match results', () => {
		const text = `SS R1
Harry,Chris,6,2
2,0,1,0
2,0,0,1
2,0,1,0
Dan,Tom,8,0
2,0,1,0
2,0,1,0
2,0,1,0
2,0,1,0

SS R2
Harry,Dan,4,4
2,0,1,0
0,2,0,1
2,0,1,0
0,2,0,0
Chris,Tom,6,2
2,0,1,0
0,2,0,0
2,0,0,1
2,0,1,0`;

		const result = parseGroupStageText(text, 'singles', 'WINS');
		expect(result.success).toBe(true);
		// All 4 players in one group
		expect(result.groups[0].participants).toHaveLength(4);
		// Dan: 1W+1D = 3pts, Harry: 1W+1D = 3pts, Chris: 1W+0D = 2pts, Tom: 0W = 0pts
		const standings = result.groups[0].participants;
		expect(standings[0].points).toBeGreaterThanOrEqual(standings[1].points);
	});

	it('returns error for round-based format with no matches', () => {
		const text = `SS R1`;
		const result = parseGroupStageText(text);
		expect(result.success).toBe(false);
	});

	it('infers multiple groups from disconnected components', () => {
		const text = `SS R1
Alice,Bob,6,2
2,0,1,0
2,0,0,1
2,0,1,0
Charlie,Dave,4,4
2,0,1,0
0,2,0,1
2,0,1,0
0,2,0,0

SS R2
Alice,Bob,4,4
Charlie,Dave,8,0`;

		const result = parseGroupStageText(text);
		expect(result.success).toBe(true);
		// Alice/Bob never play Charlie/Dave → 2 groups
		expect(result.groups).toHaveLength(2);
	});
});

// ============================================================================
// computeStandingsFromMatches
// ============================================================================

describe('computeStandingsFromMatches', () => {
	const players = new Set(['Alice', 'Bob', 'Charlie']);

	const matches: ParsedGroupMatch[] = [
		{
			participantAName: 'Alice',
			participantBName: 'Bob',
			scoreA: 6,
			scoreB: 2,
			rounds: [
				{ pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
				{ pointsA: 2, pointsB: 0, twentiesA: 0, twentiesB: 1 },
				{ pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
				{ pointsA: 0, pointsB: 2, twentiesA: 0, twentiesB: 0 }
			]
		},
		{
			participantAName: 'Bob',
			participantBName: 'Charlie',
			scoreA: 4,
			scoreB: 4,
			rounds: [
				{ pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
				{ pointsA: 0, pointsB: 2, twentiesA: 0, twentiesB: 1 },
				{ pointsA: 2, pointsB: 0, twentiesA: 0, twentiesB: 0 },
				{ pointsA: 0, pointsB: 2, twentiesA: 0, twentiesB: 0 }
			]
		},
		{
			participantAName: 'Alice',
			participantBName: 'Charlie',
			scoreA: 8,
			scoreB: 0,
			rounds: [
				{ pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
				{ pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
				{ pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
				{ pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 }
			]
		}
	];

	it('WINS mode: points = wins*2 + draws', () => {
		const standings = computeStandingsFromMatches(players, matches, 'WINS');
		// Alice: 2W = 4pts, Bob: 0W+1D = 1pt, Charlie: 0W+1D = 1pt
		const alice = standings.find(s => s.name === 'Alice')!;
		const bob = standings.find(s => s.name === 'Bob')!;
		const charlie = standings.find(s => s.name === 'Charlie')!;
		expect(alice.points).toBe(4);
		expect(bob.points).toBe(1);
		expect(charlie.points).toBe(1);
	});

	it('POINTS mode: points = sum of match scores', () => {
		const standings = computeStandingsFromMatches(players, matches, 'POINTS');
		const alice = standings.find(s => s.name === 'Alice')!;
		expect(alice.points).toBe(14); // 6 + 8
		const bob = standings.find(s => s.name === 'Bob')!;
		expect(bob.points).toBe(6); // 2 + 4
	});

	it('20s are accumulated from round details', () => {
		const standings = computeStandingsFromMatches(players, matches, 'WINS');
		const alice = standings.find(s => s.name === 'Alice')!;
		// Alice rounds: 1+0+1+0 + 1+1+1+1 = 6 twenties
		expect(alice.twenties).toBe(6);
	});

	it('positions are assigned correctly', () => {
		const standings = computeStandingsFromMatches(players, matches, 'WINS');
		expect(standings[0].position).toBe(1); // Alice
		// Bob and Charlie both have 1 point; order by 20s
	});

	it('BYE bonus gives wins and points for missing rounds', () => {
		const twoPlayers = new Set(['Alice', 'Bob']);
		const oneMatch: ParsedGroupMatch[] = [{
			participantAName: 'Alice',
			participantBName: 'Bob',
			scoreA: 6,
			scoreB: 2,
			rounds: []
		}];
		// totalRounds=2 means each player should have played 2 but only played 1
		const standings = computeStandingsFromMatches(twoPlayers, oneMatch, 'WINS', 2);
		const alice = standings.find(s => s.name === 'Alice')!;
		// Alice: 1 real win + 1 BYE win = 2*2 = 4 points
		expect(alice.points).toBe(4);
	});
});

// ============================================================================
// serializeGroupStageData
// ============================================================================

describe('serializeGroupStageData', () => {
	it('returns empty string for no groups', () => {
		expect(serializeGroupStageData([])).toBe('');
	});

	it('serializes single group standings', () => {
		const groups = [{
			name: 'Group 1',
			standings: [
				{ participantName: 'Alice', points: 60, total20s: 20 },
				{ participantName: 'Bob', points: 50, total20s: 15 }
			]
		}];

		const text = serializeGroupStageData(groups);
		expect(text).toContain('Group 1');
		expect(text).toContain('Alice,60,20');
		expect(text).toContain('Bob,50,15');
	});

	it('serializes multiple groups with blank line separator', () => {
		const groups = [
			{ name: 'Group 1', standings: [{ participantName: 'A', points: 10, total20s: 5 }] },
			{ name: 'Group 2', standings: [{ participantName: 'B', points: 20, total20s: 10 }] }
		];

		const text = serializeGroupStageData(groups);
		const lines = text.split('\n');
		// Should have blank line between groups
		expect(lines).toContain('');
	});

	it('serializes doubles format with player names', () => {
		const groups = [{
			name: 'Group 1',
			standings: [{
				participantName: 'Team',
				points: 60,
				total20s: 20,
				player1Name: 'Alice',
				player2Name: 'Bob',
				teamName: 'Dream Team'
			}]
		}];

		const text = serializeGroupStageData(groups, 'doubles');
		expect(text).toContain('Alice / Bob (Dream Team),60,20');
	});

	it('serializes matches with rounds when present', () => {
		const groups = [{
			name: 'Group 1',
			standings: [
				{ participantName: 'Alice', points: 60, total20s: 20 }
			],
			matches: [{
				participantAName: 'Alice',
				participantBName: 'Bob',
				scoreA: 6,
				scoreB: 2,
				rounds: [
					{ pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 }
				]
			}]
		}];

		const text = serializeGroupStageData(groups);
		expect(text).toContain('Alice,Bob,6,2');
		expect(text).toContain('2,0,1,0');
	});

	it('roundtrip: parse → serialize → parse gives same data', () => {
		const original = `Group 1
Alice,60,20
Bob,50,15`;

		const parsed = parseGroupStageText(original);
		expect(parsed.success).toBe(true);

		const serialized = serializeGroupStageData(
			parsed.groups.map(g => ({
				name: g.name,
				standings: g.participants.map(p => ({
					participantName: p.name,
					points: p.points,
					total20s: p.twenties
				}))
			}))
		);

		const reparsed = parseGroupStageText(serialized);
		expect(reparsed.success).toBe(true);
		expect(reparsed.totalParticipants).toBe(parsed.totalParticipants);
		expect(reparsed.groups[0].participants[0].name).toBe(parsed.groups[0].participants[0].name);
	});
});

// ============================================================================
// parseGroupStageText — match lines in standings format
// ============================================================================

describe('parseGroupStageText — match lines in standings format', () => {
	it('parses match lines (4-field format) within a group', () => {
		const text = `Group 1
Alice,60,20
Bob,50,15

Alice,Bob,6,2
2,0,1,0
2,0,0,1
2,0,1,0`;

		const result = parseGroupStageText(text);
		expect(result.success).toBe(true);
		// First group has participants, second group (after blank line) detected
		// Match lines should be parsed as part of some group
	});
});
