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

export interface ParsedGroup {
	name: string;
	participants: ParsedParticipant[];
}

export interface ParseResult {
	success: boolean;
	groups: ParsedGroup[];
	errors: string[];
	warnings: string[];
	totalParticipants: number;
}

/**
 * Check if a line looks like a group name (not a participant line)
 * Group names don't have commas with numeric values after them
 */
function isGroupNameLine(line: string): boolean {
	// A participant line has format: Name,Number,Number
	// A group name line does NOT match this pattern
	const participantPattern = /^.+,\s*\d+\s*,\s*\d+\s*$/;
	return !participantPattern.test(line);
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
	let currentPosition = 1;

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

/**
 * Main parser function
 * Parses text input into structured group stage data
 * @param text - The raw text to parse
 * @param gameType - 'singles' or 'doubles' to determine parsing format
 */
export function parseGroupStageText(
	text: string,
	gameType: 'singles' | 'doubles' = 'singles'
): ParseResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const groups: ParsedGroup[] = [];
	const allParticipantNames = new Set<string>();

	if (!text.trim()) {
		return {
			success: false,
			groups: [],
			errors: ['El texto está vacío'],
			warnings: [],
			totalParticipants: 0
		};
	}

	// Split into lines and track line numbers for error messages
	const lines = text.split('\n');
	let currentGroup: { name: string; participants: Omit<ParsedParticipant, 'position'>[] } | null = null;
	let lineNumber = 0;

	for (const rawLine of lines) {
		lineNumber++;
		const line = rawLine.trim();

		// Skip empty lines (they act as group separators)
		if (!line) {
			// Finalize current group if it has participants
			if (currentGroup && currentGroup.participants.length > 0) {
				groups.push({
					name: currentGroup.name,
					participants: calculatePositions(currentGroup.participants)
				});
				currentGroup = null;
			}
			continue;
		}

		// Check if this is a group name line or a participant line
		if (isGroupNameLine(line)) {
			// Finalize previous group if exists
			if (currentGroup && currentGroup.participants.length > 0) {
				groups.push({
					name: currentGroup.name,
					participants: calculatePositions(currentGroup.participants)
				});
			}

			// Start new group
			currentGroup = {
				name: line,
				participants: []
			};
		} else {
			// This is a participant line
			if (!currentGroup) {
				// No group started yet, create a default one
				currentGroup = {
					name: 'Grupo 1',
					participants: []
				};
				warnings.push(`Línea ${lineNumber}: participante sin grupo definido, asignado a "Grupo 1"`);
			}

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
	if (currentGroup && currentGroup.participants.length > 0) {
		groups.push({
			name: currentGroup.name,
			participants: calculatePositions(currentGroup.participants)
		});
	}

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

/**
 * Serialize existing group stage data back to text format
 * Used when editing/duplicating tournaments to pre-populate the textarea
 * @param groups - The groups with standings to serialize
 * @param gameType - 'singles' or 'doubles' to determine output format
 */
export function serializeGroupStageData(
	groups: Array<{ name: string; standings: Array<StandingData> }>,
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
	}

	return lines.join('\n');
}

/**
 * Helper to get placeholder text for the textarea based on game type
 */
export function getPlaceholderText(gameType: 'singles' | 'doubles'): string {
	if (gameType === 'doubles') {
		return `Group 1
María / Carlos (Los Tigres),63,90
Ana / Pedro,58,70
Juan / Luis (Dream Team),51,77

Group 2
Sara / Elena,61,128
Pablo / Miguel (Team Alpha),49,115`;
	}

	return `Group 1
Harry Rowe,63,90
Chris Robinson,58,70
Tom Hodgetts,51,77

Group 2
Dan Rowe,61,128
Antonio Cuaresma,49,115`;
}
