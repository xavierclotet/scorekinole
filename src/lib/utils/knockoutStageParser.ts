/**
 * Parser utility for importing knockout stage data from text format
 *
 * Format:
 * [Bracket Name]
 * Phase Name
 * Player1,Player2,scoreA,scoreB
 * Player3,Player4,scoreA,scoreB
 *
 * Phase Name 2
 * Player1,Player3,scoreA,scoreB
 *
 * [Bracket Name 2]
 * ...
 *
 * Where:
 * - [Bracket Name] identifies a bracket (e.g., [A Finals], [Gold])
 * - Phase name is a line without commas (e.g., Semifinals, Final, R16)
 * - Match line is: PlayerA,PlayerB,ScoreA,ScoreB
 */

import type { HistoricalBracketInput, HistoricalBracketRoundInput, HistoricalMatchInput } from '$lib/firebase/tournamentImport';
import type { ParsedRound } from './groupStageParser';
export type { ParsedRound };

// Types for parsed data
export interface ParsedKnockoutMatch {
	participantAName: string;
	participantBName: string;
	scoreA: number;
	scoreB: number;
	rounds: ParsedRound[];  // Optional round-level detail, empty if not provided
}

export interface ParsedKnockoutRound {
	name: string;
	matches: ParsedKnockoutMatch[];
}

export interface ParsedKnockoutBracket {
	name: string;
	label: string;
	rounds: ParsedKnockoutRound[];
}

export interface KnockoutParseResult {
	success: boolean;
	brackets: ParsedKnockoutBracket[];
	errors: string[];
	warnings: string[];
	/** Names found in matches that don't match any participant from the provided valid list */
	unknownParticipants: string[];
	totalMatches: number;
	totalRounds: number;
}

type LineType = 'bracket' | 'phase' | 'match' | 'round' | 'empty';

/**
 * Detect the type of a line
 */
function detectLineType(line: string): LineType {
	const trimmed = line.trim();

	if (!trimmed) return 'empty';

	// Bracket: [Name]
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		return 'bracket';
	}

	// 4-field lines: match or round
	const parts = trimmed.split(',');
	if (parts.length === 4) {
		const n0 = parseInt(parts[0].trim(), 10);
		const n1 = parseInt(parts[1].trim(), 10);
		const n2 = parseInt(parts[2].trim(), 10);
		const n3 = parseInt(parts[3].trim(), 10);

		// All 4 integers → round line (pointsA,pointsB,twentiesA,twentiesB)
		if (!isNaN(n0) && !isNaN(n1) && !isNaN(n2) && !isNaN(n3)) {
			return 'round';
		}

		// Last 2 integers → match line (Name,Name,ScoreA,ScoreB)
		if (!isNaN(n2) && !isNaN(n3)) {
			return 'match';
		}
	}

	// Phase: anything else (line without commas or invalid match format)
	return 'phase';
}

/**
 * Extract bracket label from name
 * "A Finals" -> "A"
 * "Gold" -> "Gold"
 * "B Finals" -> "B"
 */
function extractBracketLabel(name: string): string {
	// Try to extract single letter at start (A Finals -> A)
	const match = name.match(/^([A-Z])\s/i);
	if (match) {
		return match[1].toUpperCase();
	}

	// Try common patterns
	if (name.toLowerCase().includes('gold')) return 'Gold';
	if (name.toLowerCase().includes('silver')) return 'Silver';
	if (name.toLowerCase().includes('bronze')) return 'Bronze';

	// Return first word as label
	const firstWord = name.split(/\s+/)[0];
	return firstWord || name;
}

/**
 * Parse a match line: PlayerA,PlayerB,ScoreA,ScoreB
 */
function parseMatchLine(
	line: string,
	lineNumber: number
): { match: ParsedKnockoutMatch | null; error: string | null } {
	const parts = line.split(',');

	if (parts.length !== 4) {
		return {
			match: null,
			error: `Línea ${lineNumber}: formato de partido inválido - se esperaba "Jugador1,Jugador2,PuntosA,PuntosB" pero se encontró "${line}"`
		};
	}

	const participantAName = parts[0].trim();
	const participantBName = parts[1].trim();
	const scoreAStr = parts[2].trim();
	const scoreBStr = parts[3].trim();

	if (!participantAName) {
		return {
			match: null,
			error: `Línea ${lineNumber}: nombre del primer jugador vacío`
		};
	}

	if (!participantBName) {
		return {
			match: null,
			error: `Línea ${lineNumber}: nombre del segundo jugador vacío`
		};
	}

	const scoreA = parseInt(scoreAStr, 10);
	const scoreB = parseInt(scoreBStr, 10);

	if (isNaN(scoreA)) {
		return {
			match: null,
			error: `Línea ${lineNumber}: puntuación A inválida "${scoreAStr}" - debe ser un número`
		};
	}

	if (isNaN(scoreB)) {
		return {
			match: null,
			error: `Línea ${lineNumber}: puntuación B inválida "${scoreBStr}" - debe ser un número`
		};
	}

	return {
		match: {
			participantAName,
			participantBName,
			scoreA,
			scoreB,
			rounds: []
		},
		error: null
	};
}

/**
 * Options for knockout stage parser
 */
export interface KnockoutParseOptions {
	/** List of valid participant names for validation */
	validParticipantNames?: string[];
}

/**
 * Main parser function
 * Parses text input into structured knockout stage data
 * @param text - The text to parse
 * @param options - Optional configuration including valid participant names for validation
 */
export function parseKnockoutStageText(text: string, options?: KnockoutParseOptions): KnockoutParseResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const brackets: ParsedKnockoutBracket[] = [];

	if (!text.trim()) {
		return {
			success: false,
			brackets: [],
			errors: ['El texto está vacío'],
			warnings: [],
			unknownParticipants: [],
			totalMatches: 0,
			totalRounds: 0
		};
	}

	const lines = text.split('\n');
	let currentBracket: ParsedKnockoutBracket | null = null;
	let currentRound: ParsedKnockoutRound | null = null;
	let lastMatch: ParsedKnockoutMatch | null = null;  // For appending round lines
	let lineNumber = 0;

	for (const rawLine of lines) {
		lineNumber++;
		const line = rawLine.trim();
		const lineType = detectLineType(line);

		switch (lineType) {
			case 'empty':
				// Empty lines are separators, no action needed
				break;

			case 'round':
				// Round line: 4 integers → append to last parsed match
				if (lastMatch) {
					const parts = line.split(',');
					lastMatch.rounds.push({
						pointsA: parseInt(parts[0].trim(), 10),
						pointsB: parseInt(parts[1].trim(), 10),
						twentiesA: parseInt(parts[2].trim(), 10),
						twentiesB: parseInt(parts[3].trim(), 10)
					});
				}
				break;

			case 'bracket':
				// Finalize previous bracket if exists
				if (currentBracket) {
					if (currentRound && currentRound.matches.length > 0) {
						currentBracket.rounds.push(currentRound);
					}
					if (currentBracket.rounds.length > 0) {
						brackets.push(currentBracket);
					} else {
						warnings.push(`Bracket "${currentBracket.name}" no tiene rondas válidas`);
					}
				}

				// Start new bracket
				const bracketName = line.slice(1, -1).trim(); // Remove [ ]
				if (!bracketName) {
					errors.push(`Línea ${lineNumber}: nombre de bracket vacío`);
					currentBracket = null;
				} else {
					currentBracket = {
						name: bracketName,
						label: extractBracketLabel(bracketName),
						rounds: []
					};
				}
				currentRound = null;
				lastMatch = null;
				break;

			case 'phase':
				// If no bracket yet, create a default one
				if (!currentBracket) {
					currentBracket = {
						name: 'Finals',
						label: 'A',
						rounds: []
					};
					warnings.push(`Línea ${lineNumber}: fase sin bracket definido, asignada a "Finals"`);
				}

				// Finalize previous round if exists
				if (currentRound && currentRound.matches.length > 0) {
					currentBracket.rounds.push(currentRound);
				}

				// Start new round
				currentRound = {
					name: line,
					matches: []
				};
				lastMatch = null;
				break;

			case 'match':
				// If no bracket yet, create a default one
				if (!currentBracket) {
					currentBracket = {
						name: 'Finals',
						label: 'A',
						rounds: []
					};
					warnings.push(`Línea ${lineNumber}: partido sin bracket definido, asignado a "Finals"`);
				}

				// If no round yet, create a default one
				if (!currentRound) {
					currentRound = {
						name: 'Round',
						matches: []
					};
					warnings.push(`Línea ${lineNumber}: partido sin fase definida, asignado a "Round"`);
				}

				const { match, error } = parseMatchLine(line, lineNumber);
				if (error) {
					errors.push(error);
				} else if (match) {
					currentRound.matches.push(match);
					lastMatch = match;  // Track for round appending
				}
				break;
		}
	}

	// Finalize last bracket
	if (currentBracket) {
		if (currentRound && currentRound.matches.length > 0) {
			currentBracket.rounds.push(currentRound);
		}
		if (currentBracket.rounds.length > 0) {
			brackets.push(currentBracket);
		} else if (currentBracket.name !== 'Finals') {
			// Only warn if it was explicitly declared
			warnings.push(`Bracket "${currentBracket.name}" no tiene rondas válidas`);
		}
	}

	// Validation
	if (brackets.length === 0 && errors.length === 0) {
		errors.push('No se encontraron brackets válidos en el texto');
	}

	// Count totals
	let totalMatches = 0;
	let totalRounds = 0;
	for (const bracket of brackets) {
		totalRounds += bracket.rounds.length;
		for (const round of bracket.rounds) {
			totalMatches += round.matches.length;
		}
	}

	// Validate participant names against provided list
	const unknownParticipants: string[] = [];
	if (options?.validParticipantNames && options.validParticipantNames.length > 0) {
		const validNamesLower = new Set(options.validParticipantNames.map(n => n.toLowerCase().trim()));
		const unknownNames = new Set<string>();

		for (const bracket of brackets) {
			for (const round of bracket.rounds) {
				for (const match of round.matches) {
					// Check participant A
					if (match.participantAName && match.participantAName.toLowerCase() !== 'bye') {
						if (!validNamesLower.has(match.participantAName.toLowerCase().trim())) {
							unknownNames.add(match.participantAName);
						}
					}
					// Check participant B
					if (match.participantBName && match.participantBName.toLowerCase() !== 'bye') {
						if (!validNamesLower.has(match.participantBName.toLowerCase().trim())) {
							unknownNames.add(match.participantBName);
						}
					}
				}
			}
		}

		// Store unknown names (sorted) - warnings will be formatted by the caller
		unknownParticipants.push(...Array.from(unknownNames).sort());
	}

	return {
		success: errors.length === 0,
		brackets,
		errors,
		warnings,
		unknownParticipants,
		totalMatches,
		totalRounds
	};
}

/**
 * Serialize existing knockout stage data back to text format
 * Used when editing/duplicating tournaments to pre-populate the textarea
 */
export function serializeKnockoutStageData(
	brackets: HistoricalBracketInput[]
): string {
	if (!brackets || brackets.length === 0) {
		return '';
	}

	const lines: string[] = [];

	for (let i = 0; i < brackets.length; i++) {
		const bracket = brackets[i];

		// Add blank line between brackets (but not before first)
		if (i > 0) {
			lines.push('');
		}

		// Bracket name
		lines.push(`[${bracket.name}]`);

		for (let j = 0; j < bracket.rounds.length; j++) {
			const round = bracket.rounds[j];

			// Add blank line before each round (but not before first in bracket)
			if (j > 0) {
				lines.push('');
			}

			// Round name
			lines.push(round.name);

			// Matches (skip BYEs where one participant is missing)
			for (const match of round.matches) {
				if (!match.participantAName || !match.participantBName) continue;
				const scoreA = match.scoreA ?? 0;
				const scoreB = match.scoreB ?? 0;
				lines.push(`${match.participantAName},${match.participantBName},${scoreA},${scoreB}`);
				// Output round lines if present
				if ('rounds' in match && Array.isArray(match.rounds)) {
					for (const r of match.rounds as ParsedRound[]) {
						lines.push(`${r.pointsA},${r.pointsB},${r.twentiesA},${r.twentiesB}`);
					}
				}
			}
		}
	}

	return lines.join('\n');
}

/**
 * Convert parsed brackets to HistoricalBracketInput format
 */
export function convertToHistoricalBrackets(
	parsedBrackets: ParsedKnockoutBracket[]
): HistoricalBracketInput[] {
	return parsedBrackets.map((bracket, index) => {
		const rounds: HistoricalBracketRoundInput[] = bracket.rounds.map((round) => ({
			name: round.name,
			matches: round.matches.map((match): HistoricalMatchInput => {
				const input: HistoricalMatchInput = {
					participantAName: match.participantAName,
					participantBName: match.participantBName,
					scoreA: match.scoreA,
					scoreB: match.scoreB
				};
				// Include round-level data if present
				if (match.rounds && match.rounds.length > 0) {
					input.rounds = match.rounds;
					// Calculate twenties from rounds if not explicitly set
					input.twentiesA = match.rounds.reduce((s, r) => s + r.twentiesA, 0);
					input.twentiesB = match.rounds.reduce((s, r) => s + r.twentiesB, 0);
				}
				return input;
			})
		}));

		// Calculate sourcePositions based on bracket label/index
		// A = positions 1,2; B = positions 3,4; etc.
		const basePosition = index * 2 + 1;
		const sourcePositions = [basePosition, basePosition + 1];

		return {
			name: bracket.name,
			label: bracket.label,
			sourcePositions,
			rounds
		};
	});
}

/**
 * Generic types for BYE calculation (compatible with BracketEntry in import page)
 */
export interface GenericMatchEntry {
	id: string;
	participantAId: string;
	participantAName: string;
	participantBId: string;
	participantBName: string;
	scoreA: number;
	scoreB: number;
	twentiesA: number;
	twentiesB: number;
	isWalkover: boolean;
}

export interface GenericRoundEntry {
	id: string;
	name: string;
	matches: GenericMatchEntry[];
}

export interface GenericBracketEntry {
	name: string;
	label: string;
	sourcePositions: number[];
	rounds: GenericRoundEntry[];
}

/**
 * Add BYE matches to brackets and reorder existing matches so the bracket structure is correct.
 *
 * Algorithm:
 * - For each bracket, process rounds from first to second-to-last
 * - For each match in round N, find where its winner appears in round N+1
 * - The position in round N is determined by where the winner appears in N+1:
 *   - If winner is participantA of match M in N+1 → position = 2*M
 *   - If winner is participantB of match M in N+1 → position = 2*M+1
 * - Create BYE matches for positions that have no real match
 */
export function addByeMatchesToBrackets<T extends GenericBracketEntry>(brackets: T[]): T[] {
	for (const bracket of brackets) {
		if (bracket.rounds.length < 2) continue;

		// Process from second-to-last round BACKWARDS to first round
		// This ensures that when we process round N, round N+1 is already correctly ordered
		for (let roundIdx = bracket.rounds.length - 2; roundIdx >= 0; roundIdx--) {
			const currentRound = bracket.rounds[roundIdx];
			const nextRound = bracket.rounds[roundIdx + 1];

			// Calculate expected number of matches in current round (2x next round)
			const expectedMatches = nextRound.matches.length * 2;

			// Build a map: participant name -> their position in next round
			// Position is 2*matchIdx for participantA, 2*matchIdx+1 for participantB
			const winnerToPosition = new Map<string, number>();
			for (let nextMatchIdx = 0; nextMatchIdx < nextRound.matches.length; nextMatchIdx++) {
				const nextMatch = nextRound.matches[nextMatchIdx];
				if (nextMatch.participantAName && nextMatch.participantAName !== 'BYE') {
					winnerToPosition.set(nextMatch.participantAName, 2 * nextMatchIdx);
				}
				if (nextMatch.participantBName && nextMatch.participantBName !== 'BYE') {
					winnerToPosition.set(nextMatch.participantBName, 2 * nextMatchIdx + 1);
				}
			}

			// Assign correct positions to existing matches based on their winner
			const positionedMatches: Array<GenericMatchEntry & { _position: number }> = [];
			const usedPositions = new Set<number>();

			for (const match of currentRound.matches) {
				// Determine winner of this match
				const winner = match.scoreA > match.scoreB ? match.participantAName : match.participantBName;

				// Find where this winner appears in next round
				const position = winnerToPosition.get(winner);

				if (position !== undefined) {
					positionedMatches.push({ ...match, _position: position });
					usedPositions.add(position);
				} else {
					// Winner not found in next round - this shouldn't happen in valid data
					// Keep the match but assign a temporary position
					positionedMatches.push({ ...match, _position: -1 });
				}
			}

			// Create BYE matches for unused positions
			for (let pos = 0; pos < expectedMatches; pos++) {
				if (!usedPositions.has(pos)) {
					// Find who should be in this BYE match
					// This participant appears in next round but had no opponent in current round
					const nextMatchIdx = Math.floor(pos / 2);
					const isSlotA = pos % 2 === 0;
					const nextMatch = nextRound.matches[nextMatchIdx];

					const byeWinner = isSlotA ? nextMatch?.participantAName : nextMatch?.participantBName;

					if (byeWinner && byeWinner !== 'BYE') {
						positionedMatches.push({
							id: crypto.randomUUID(),
							participantAId: '',
							participantAName: byeWinner,
							participantBId: '',
							participantBName: 'BYE',
							scoreA: 0,
							scoreB: 0,
							twentiesA: 0,
							twentiesB: 0,
							isWalkover: false,
							_position: pos
						});
					}
				}
			}

			// Sort by position
			positionedMatches.sort((a, b) => a._position - b._position);

			// Remove temporary position field and reassign to round
			currentRound.matches = positionedMatches.map(({ _position, ...match }) => match) as typeof currentRound.matches;
		}
	}

	return brackets;
}

/**
 * Helper to get placeholder text for the textarea
 */
export function getKnockoutPlaceholderText(hasMultipleBrackets: boolean = false): string {
	if (hasMultipleBrackets) {
		return `[A - Finals]
R8
Harry Rowe,Chris Robinson,8,2
Dan Rowe,Tom Hodgetts,6,8

Semifinals
Harry Rowe,Tom Hodgetts,8,4
George McCarthy,James Temby,6,8

Final
Harry Rowe,James Temby,8,4

[B - Finals]
R8
Player5,Player6,8,0
Player7,Player8,2,8

Semifinals
Player5,Player8,8,4
Player9,Player10,6,8

Final
Player5,Player10,8,4`;
	}

	return `[Finals]
Semifinals
Harry Rowe,Chris Robinson,8,2
Dan Rowe,Tom Hodgetts,6,8

Final
Harry Rowe,Tom Hodgetts,8,4`;
}
