/**
 * Parser utility for importing group stage data from text format
 *
 * Singles format:
 * Group 1
 * Harry Rowe,63,90
 * Chris Robinson,58,70
 *
 * Doubles format:
 * Group 1
 * Player1 / Player2,63,90
 * María / Carlos (Los Tigres),58,70
 *
 * Where each participant line is: Name,Points,20s
 * For doubles: Player1 / Player2 (OptionalTeamName),Points,20s
 */

// Types for parsed data
export interface ParsedParticipant {
	name: string;           // Display name (teamName if set, otherwise "Player1 / Player2" for doubles)
	points: number;
	twenties: number;
	position: number;       // Auto-calculated based on points (descending)
	// For doubles
	player1Name?: string;   // First player's real name
	player2Name?: string;   // Second player's real name
	teamName?: string;      // Optional artistic team name
}

export interface ParsedRound {
	pointsA: number;
	pointsB: number;
	twentiesA: number;
	twentiesB: number;
}

export interface ParsedGroupMatch {
	participantAName: string;
	participantBName: string;
	scoreA: number;
	scoreB: number;
	rounds: ParsedRound[];
}

export interface ParsedGroup {
	name: string;
	participants: ParsedParticipant[];
	matches?: ParsedGroupMatch[];  // Optional, present if match lines were found
}

export interface ParseResult {
	success: boolean;
	groups: ParsedGroup[];
	errors: string[];
	warnings: string[];
	totalParticipants: number;
}

type GroupLineType = 'groupName' | 'participant' | 'match' | 'round';

/**
 * Detect the type of a group stage line:
 * - 'participant': 3 fields, Name,Points,20s
 * - 'match': 4 fields, Name,Name,Score,Score (not all integers)
 * - 'round': 4 fields, all integers (pointsA,pointsB,twentiesA,twentiesB)
 * - 'groupName': anything else
 */
function detectGroupLineType(line: string): GroupLineType {
	const parts = line.split(',');

	if (parts.length === 3) {
		const num1 = parseInt(parts[1].trim(), 10);
		const num2 = parseInt(parts[2].trim(), 10);
		if (!isNaN(num1) && !isNaN(num2) && parts[0].trim()) {
			return 'participant';
		}
		return 'groupName';
	}

	if (parts.length === 4) {
		const n0 = parseInt(parts[0].trim(), 10);
		const n1 = parseInt(parts[1].trim(), 10);
		const n2 = parseInt(parts[2].trim(), 10);
		const n3 = parseInt(parts[3].trim(), 10);

		// All 4 integers → round line (pointsA,pointsB,twentiesA,twentiesB)
		if (!isNaN(n0) && !isNaN(n1) && !isNaN(n2) && !isNaN(n3)) {
			return 'round';
		}

		// Last 2 integers + non-empty names → match line
		const nameA = parts[0].trim();
		const nameB = parts[1].trim();
		if (!isNaN(n2) && !isNaN(n3) && nameA && nameB) {
			return 'match';
		}
	}

	return 'groupName';
}

/**
 * Parse a doubles name in format: "Player1 / Player2" or "Player1 / Player2 (TeamName)"
 * Also accepts "Player1/Player2" without spaces
 * Returns the parsed components
 */
function parseDoublesName(rawName: string): {
	player1Name: string;
	player2Name: string;
	teamName?: string;
	displayName: string;
} | null {
	// Check for optional team name in parentheses at the end
	// Format: "Player1 / Player2 (TeamName)" or just "Player1 / Player2"
	let nameWithoutTeam = rawName;
	let teamName: string | undefined;

	const teamMatch = rawName.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
	if (teamMatch) {
		nameWithoutTeam = teamMatch[1].trim();
		teamName = teamMatch[2].trim();
	}

	// Check for "/" separator (with or without spaces)
	// Match " / " or "/" but not names that just happen to have / in them (rare)
	let player1: string;
	let player2: string;

	if (nameWithoutTeam.includes(' / ')) {
		// Format with spaces: "Player1 / Player2"
		[player1, player2] = nameWithoutTeam.split(' / ').map(s => s.trim());
	} else if (nameWithoutTeam.includes('/')) {
		// Format without spaces: "Player1/Player2"
		[player1, player2] = nameWithoutTeam.split('/').map(s => s.trim());
	} else {
		return null; // Not a doubles format
	}

	if (!player1 || !player2) {
		return null;
	}

	return {
		player1Name: player1,
		player2Name: player2,
		teamName,
		displayName: teamName || `${player1} / ${player2}`
	};
}

/**
 * Parse a participant line in format: Name,Points,20s
 * For doubles: Player1 / Player2,Points,20s or Player1 / Player2 (TeamName),Points,20s
 */
function parseParticipantLine(
	line: string,
	lineNumber: number,
	gameType: 'singles' | 'doubles' = 'singles'
): { participant: Omit<ParsedParticipant, 'position'> | null; error: string | null } {
	const parts = line.split(',');

	if (parts.length < 3) {
		const formatType = gameType === 'doubles' ? 'para dobles' : 'para singles';
		const expectedFormat = gameType === 'doubles'
			? '"María / Carlos,63,90" o "María / Carlos (Los Tigres),63,90"'
			: '"Harry Rowe,63,90"';
		return {
			participant: null,
			error: `Línea ${lineNumber}: formato inválido ${formatType} - se esperaba ${expectedFormat} pero se encontró "${line}"`
		};
	}

	const rawName = parts[0].trim();
	const pointsStr = parts[1].trim();
	const twentiesStr = parts[2].trim();

	if (!rawName) {
		return {
			participant: null,
			error: `Línea ${lineNumber}: nombre vacío`
		};
	}

	const points = parseInt(pointsStr, 10);
	const twenties = parseInt(twentiesStr, 10);

	if (isNaN(points)) {
		return {
			participant: null,
			error: `Línea ${lineNumber}: puntos inválidos "${pointsStr}" - debe ser un número`
		};
	}

	if (isNaN(twenties)) {
		return {
			participant: null,
			error: `Línea ${lineNumber}: 20s inválidos "${twentiesStr}" - debe ser un número`
		};
	}

	// For doubles, try to parse the name as a pair
	if (gameType === 'doubles') {
		const doublesInfo = parseDoublesName(rawName);

		if (doublesInfo) {
			// Valid doubles format: Player1 / Player2 or Player1 / Player2 (TeamName)
			return {
				participant: {
					name: doublesInfo.displayName,
					points,
					twenties,
					player1Name: doublesInfo.player1Name,
					player2Name: doublesInfo.player2Name,
					teamName: doublesInfo.teamName
				},
				error: null
			};
		} else {
			// Assume it's a team name only (no " / " separator)
			// In this case, we store the name as teamName and leave player names undefined
			// The user should provide the format "Player1 / Player2" or "Player1 / Player2 (TeamName)"
			return {
				participant: {
					name: rawName,
					points,
					twenties,
					teamName: rawName
					// player1Name and player2Name are undefined - this is a team name only
				},
				error: null
			};
		}
	}

	// Singles format
	return {
		participant: { name: rawName, points, twenties },
		error: null
	};
}

/**
 * Calculate positions based on points (descending order)
 * Tied participants share the same position
 */
function calculatePositions(participants: Omit<ParsedParticipant, 'position'>[]): ParsedParticipant[] {
	// Sort by points descending, then by 20s descending as tiebreaker
	const sorted = [...participants].sort((a, b) => {
		if (b.points !== a.points) return b.points - a.points;
		return b.twenties - a.twenties;
	});

	const result: ParsedParticipant[] = [];

	for (let i = 0; i < sorted.length; i++) {
		const participant = sorted[i];

		// Check if tied with previous (same points AND same 20s)
		if (i > 0 && participant.points === sorted[i - 1].points && participant.twenties === sorted[i - 1].twenties) {
			// Keep the same position as previous
			result.push({ ...participant, position: result[i - 1].position });
		} else {
			// New position (actual index + 1)
			result.push({ ...participant, position: i + 1 });
		}
	}

	return result;
}

// ============================================================================
// ROUND-BASED FORMAT (SS R1 / RR R1)
// ============================================================================

/**
 * Detect if text uses round-based format (lines like "SS R1", "RR R2")
 */
function isRoundBasedFormat(text: string): boolean {
	return text.split('\n').some(line => /^(SS|RR)\s+R\d+/i.test(line.trim()));
}

/**
 * Find connected components using Union-Find.
 * Players who played each other belong to the same group.
 */
function findConnectedComponents(matches: ParsedGroupMatch[]): Set<string>[] {
	const parent = new Map<string, string>();

	const find = (x: string): string => {
		if (!parent.has(x)) parent.set(x, x);
		if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
		return parent.get(x)!;
	};

	const union = (x: string, y: string) => {
		const px = find(x), py = find(y);
		if (px !== py) parent.set(px, py);
	};

	for (const match of matches) {
		union(match.participantAName, match.participantBName);
	}

	const groupMap = new Map<string, Set<string>>();
	for (const [player] of parent) {
		const root = find(player);
		if (!groupMap.has(root)) groupMap.set(root, new Set());
		groupMap.get(root)!.add(player);
	}

	return Array.from(groupMap.values());
}

/**
 * Compute standings from match results.
 * WINS mode: points = wins*2 + draws. POINTS mode: points = sum of match scores.
 * Twenties: summed from round-level detail lines.
 */
function computeStandingsFromMatches(
	players: Set<string>,
	matches: ParsedGroupMatch[],
	qualificationMode: 'WINS' | 'POINTS'
): ParsedParticipant[] {
	const stats = new Map<string, { wins: number; draws: number; matchPoints: number; twenties: number }>();
	for (const p of players) stats.set(p, { wins: 0, draws: 0, matchPoints: 0, twenties: 0 });

	for (const match of matches) {
		const sA = stats.get(match.participantAName);
		const sB = stats.get(match.participantBName);
		if (!sA || !sB) continue;

		if (match.scoreA > match.scoreB) { sA.wins++; }
		else if (match.scoreA < match.scoreB) { sB.wins++; }
		else { sA.draws++; sB.draws++; }

		sA.matchPoints += match.scoreA;
		sB.matchPoints += match.scoreB;

		for (const r of match.rounds) {
			sA.twenties += r.twentiesA;
			sB.twenties += r.twentiesB;
		}
	}

	const raw = Array.from(players).map(name => {
		const s = stats.get(name)!;
		const points = qualificationMode === 'POINTS' ? s.matchPoints : (s.wins * 2 + s.draws);
		return { name, points, twenties: s.twenties };
	});

	return calculatePositions(raw);
}

/**
 * Parse round-based format (SS R1 / RR R1) into ParseResult.
 * Standings are computed from match results; groups inferred via connected components.
 */
function parseRoundBasedGroupStage(
	text: string,
	qualificationMode: 'WINS' | 'POINTS' = 'WINS',
	_gameType: 'singles' | 'doubles' = 'singles'
): ParseResult {
	const allMatches: ParsedGroupMatch[] = [];
	let currentMatch: ParsedGroupMatch | null = null;

	for (const rawLine of text.split('\n')) {
		const line = rawLine.trim();
		if (!line) { currentMatch = null; continue; }

		// Round header (SS R1, RR R2, …) → just a separator
		if (/^(SS|RR)\s+R\d+/i.test(line)) { currentMatch = null; continue; }

		const lineType = detectGroupLineType(line);

		if (lineType === 'round' && currentMatch) {
			const p = line.split(',');
			currentMatch.rounds.push({
				pointsA: parseInt(p[0].trim(), 10),
				pointsB: parseInt(p[1].trim(), 10),
				twentiesA: parseInt(p[2].trim(), 10),
				twentiesB: parseInt(p[3].trim(), 10)
			});
		} else if (lineType === 'match') {
			const p = line.split(',');
			const match: ParsedGroupMatch = {
				participantAName: p[0].trim(),
				participantBName: p[1].trim(),
				scoreA: parseInt(p[2].trim(), 10),
				scoreB: parseInt(p[3].trim(), 10),
				rounds: []
			};
			allMatches.push(match);
			currentMatch = match;
		}
		// Ignore standings-style lines inside round-based format
	}

	if (allMatches.length === 0) {
		return { success: false, groups: [], errors: ['No se encontraron partidas en el texto'], warnings: [], totalParticipants: 0 };
	}

	const components = findConnectedComponents(allMatches);

	const groups: ParsedGroup[] = components.map((playerSet, idx) => {
		const groupMatches = allMatches.filter(m =>
			playerSet.has(m.participantAName) && playerSet.has(m.participantBName)
		);
		return {
			name: components.length > 1 ? `Grupo ${idx + 1}` : 'Grupo 1',
			participants: computeStandingsFromMatches(playerSet, groupMatches, qualificationMode),
			matches: groupMatches
		};
	});

	const totalParticipants = groups.reduce((s, g) => s + g.participants.length, 0);
	return { success: true, groups, errors: [], warnings: [], totalParticipants };
}

// ============================================================================

/**
 * Main parser function
 * Parses text input into structured group stage data.
 * Auto-detects format: round-based (SS R1/RR R1) or standings (Group 1 / Name,pts,20s).
 * @param text - The raw text to parse
 * @param gameType - 'singles' or 'doubles' to determine parsing format
 * @param qualificationMode - How standings are computed in round-based format
 */
export function parseGroupStageText(
	text: string,
	gameType: 'singles' | 'doubles' = 'singles',
	qualificationMode: 'WINS' | 'POINTS' = 'WINS'
): ParseResult {
	if (!text.trim()) {
		return { success: false, groups: [], errors: ['El texto está vacío'], warnings: [], totalParticipants: 0 };
	}

	// Auto-detect round-based format (SS R1 / RR R1)
	if (isRoundBasedFormat(text)) {
		return parseRoundBasedGroupStage(text, qualificationMode, gameType);
	}

	const errors: string[] = [];
	const warnings: string[] = [];
	const groups: ParsedGroup[] = [];
	const allParticipantNames = new Set<string>();

	// Split into lines and track line numbers for error messages
	const lines = text.split('\n');
	let currentGroup: { name: string; participants: Omit<ParsedParticipant, 'position'>[]; matches: ParsedGroupMatch[] } | null = null;
	let currentMatch: ParsedGroupMatch | null = null;
	let lineNumber = 0;

	function finalizeCurrentGroup() {
		if (!currentGroup || currentGroup.participants.length === 0) return;
		const group: ParsedGroup = {
			name: currentGroup.name,
			participants: calculatePositions(currentGroup.participants)
		};
		if (currentGroup.matches.length > 0) {
			group.matches = currentGroup.matches;
		}
		groups.push(group);
	}

	for (const rawLine of lines) {
		lineNumber++;
		const line = rawLine.trim();

		// Skip empty lines (they act as group separators)
		if (!line) {
			// Finalize current group if it has participants
			if (currentGroup && currentGroup.participants.length > 0) {
				finalizeCurrentGroup();
				currentGroup = null;
				currentMatch = null;
			}
			continue;
		}

		const lineType = detectGroupLineType(line);

		if (lineType === 'round') {
			// Round line: 4 integers → add to current match
			if (currentMatch) {
				const parts = line.split(',');
				currentMatch.rounds.push({
					pointsA: parseInt(parts[0].trim(), 10),
					pointsB: parseInt(parts[1].trim(), 10),
					twentiesA: parseInt(parts[2].trim(), 10),
					twentiesB: parseInt(parts[3].trim(), 10)
				});
			}
			// If no currentMatch, silently skip round lines
			continue;
		}

		if (lineType === 'match') {
			// Match line: Name,Name,Score,Score → add to group matches
			if (!currentGroup) {
				currentGroup = { name: 'Grupo 1', participants: [], matches: [] };
				warnings.push(`Línea ${lineNumber}: partida sin grupo definido, asignada a "Grupo 1"`);
			}
			const parts = line.split(',');
			const newMatch: ParsedGroupMatch = {
				participantAName: parts[0].trim(),
				participantBName: parts[1].trim(),
				scoreA: parseInt(parts[2].trim(), 10),
				scoreB: parseInt(parts[3].trim(), 10),
				rounds: []
			};
			currentGroup.matches.push(newMatch);
			currentMatch = newMatch;
			continue;
		}

		if (lineType === 'groupName') {
			// Finalize previous group if exists
			finalizeCurrentGroup();

			// Start new group
			currentGroup = {
				name: line,
				participants: [],
				matches: []
			};
			currentMatch = null;
		} else {
			// This is a participant line
			if (!currentGroup) {
				// No group started yet, create a default one
				currentGroup = {
					name: 'Grupo 1',
					participants: [],
					matches: []
				};
				warnings.push(`Línea ${lineNumber}: participante sin grupo definido, asignado a "Grupo 1"`);
			}

			currentMatch = null; // Participant lines reset current match context

			const { participant, error } = parseParticipantLine(line, lineNumber, gameType);

			if (error) {
				errors.push(error);
			} else if (participant) {
				// Check for duplicate names
				const normalizedName = participant.name.toLowerCase().trim();
				if (allParticipantNames.has(normalizedName)) {
					errors.push(`Línea ${lineNumber}: nombre duplicado "${participant.name}"`);
				} else {
					allParticipantNames.add(normalizedName);
					currentGroup.participants.push(participant);
				}
			}
		}
	}

	// Finalize last group if exists
	finalizeCurrentGroup();

	// Validation: check that each group has at least 1 participant
	for (const group of groups) {
		if (group.participants.length === 0) {
			errors.push(`Grupo "${group.name}" no tiene participantes`);
		}
	}

	// Check if we have any groups
	if (groups.length === 0 && errors.length === 0) {
		errors.push('No se encontraron grupos válidos en el texto');
	}

	const totalParticipants = groups.reduce((sum, g) => sum + g.participants.length, 0);

	return {
		success: errors.length === 0,
		groups,
		errors,
		warnings,
		totalParticipants
	};
}

/**
 * Standing data that may include doubles info
 */
interface StandingData {
	participantName: string;
	points: number;
	total20s: number;
	// For doubles
	player1Name?: string;
	player2Name?: string;
	teamName?: string;
}

interface SerializableGroupMatch {
	participantAName: string;
	participantBName: string;
	scoreA: number;
	scoreB: number;
	rounds?: ParsedRound[];
}

/**
 * Serialize existing group stage data back to text format
 * Used when editing/duplicating tournaments to pre-populate the textarea
 * @param groups - The groups with standings (and optional matches) to serialize
 * @param gameType - 'singles' or 'doubles' to determine output format
 */
export function serializeGroupStageData(
	groups: Array<{ name: string; standings: Array<StandingData>; matches?: SerializableGroupMatch[] }>,
	gameType: 'singles' | 'doubles' = 'singles'
): string {
	if (!groups || groups.length === 0) {
		return '';
	}

	const lines: string[] = [];

	for (let i = 0; i < groups.length; i++) {
		const group = groups[i];

		// Add blank line between groups (but not before first)
		if (i > 0) {
			lines.push('');
		}

		// Group name
		lines.push(group.name);

		// Sort standings by position (or points if no position)
		const sortedStandings = [...group.standings].sort((a, b) => {
			// If we have explicit positions, use them
			// Otherwise sort by points descending
			return (b.points || 0) - (a.points || 0);
		});

		// Participants
		for (const standing of sortedStandings) {
			let name: string;

			if (gameType === 'doubles' && standing.player1Name && standing.player2Name) {
				// Format: "Player1 / Player2" or "Player1 / Player2 (TeamName)"
				const pairName = `${standing.player1Name} / ${standing.player2Name}`;
				name = standing.teamName ? `${pairName} (${standing.teamName})` : pairName;
			} else {
				// Singles or no pair info - use participantName as-is
				name = standing.participantName;
			}

			lines.push(`${name},${standing.points || 0},${standing.total20s || 0}`);
		}

		// Optional matches with rounds
		if (group.matches && group.matches.length > 0) {
			lines.push('');
			for (const match of group.matches) {
				lines.push(`${match.participantAName},${match.participantBName},${match.scoreA},${match.scoreB}`);
				if (match.rounds && match.rounds.length > 0) {
					for (const round of match.rounds) {
						lines.push(`${round.pointsA},${round.pointsB},${round.twentiesA},${round.twentiesB}`);
					}
				}
			}
		}
	}

	return lines.join('\n');
}

/**
 * Helper to get placeholder text for the textarea.
 * Shows round-based format (SS/RR) as primary option, standings as fallback.
 */
export function getPlaceholderText(gameType: 'singles' | 'doubles'): string {
	if (gameType === 'doubles') {
		return `SS R1
María / Carlos,4,2
0,2,0,1
2,0,1,0
2,0,2,0
2,0,1,0
Ana / Pedro,6,2
2,0,1,0
2,0,0,1
2,0,1,0
0,2,0,1

SS R2
...

--- O formato clásico con standings ---

Grupo 1
María / Carlos (Los Tigres),63,90
Ana / Pedro,58,70`;
	}

	return `SS R1
Harry Rowe,Chris Robinson,4,4
2,0,1,0
0,2,0,1
2,0,1,0
0,2,0,1
Dan Rowe,Tom Hodgetts,6,2
2,0,1,0
2,0,0,1
2,0,1,0

SS R2
...

--- O formato clásico con standings ---

Grupo 1
Harry Rowe,63,90
Chris Robinson,58,70`;
}
