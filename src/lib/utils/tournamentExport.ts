/**
 * Export a completed LIVE tournament as human-readable text
 * Format compatible with the import wizard text parsers
 *
 * Group headers: "RR R1" or "SS R1" (Round Robin / Swiss System)
 * Match lines: NombreA,NombreB,ptsA,ptsB
 * Round detail (level 3): pA,pB,20A,20B
 *
 * Bracket headers: [Bracket Name]
 * Round name line: Cuartos, Semifinales, Final, etc.
 * Match lines: same format as groups
 */

import type { Tournament, BracketMatch, GroupMatch, BracketWithConfig } from '$lib/types/tournament';

export type ExportLevel = 1 | 2 | 3;

/**
 * Build id→name map from tournament participants
 */
function buildIdToName(tournament: Tournament): Map<string, string> {
	const map = new Map<string, string>();
	for (const p of tournament.participants) {
		map.set(p.id, p.partner ? `${p.name} / ${p.partner.name}` : p.name);
	}
	return map;
}

/**
 * Format a single match as text line(s)
 */
function formatMatch(
	match: GroupMatch | BracketMatch,
	idToName: Map<string, string>,
	level: ExportLevel
): string[] {
	const nameA = idToName.get(match.participantA || '');
	const nameB = idToName.get(match.participantB || '');

	// Skip BYE or incomplete matches
	if (!nameA || !nameB || match.participantA === 'BYE' || match.participantB === 'BYE') {
		return [];
	}
	if (match.status !== 'COMPLETED' && match.status !== 'WALKOVER') {
		return [];
	}

	const lines: string[] = [];

	// Match summary line: nameA,nameB,scoreA,scoreB
	lines.push(`${nameA},${nameB},${match.totalPointsA ?? 0},${match.totalPointsB ?? 0}`);

	// Level 3: round-by-round detail lines
	if (level >= 3 && match.rounds && match.rounds.length > 0) {
		for (const r of match.rounds) {
			lines.push(`${r.pointsA ?? 0},${r.pointsB ?? 0},${r.twentiesA ?? 0},${r.twentiesB ?? 0}`);
		}
	}

	return lines;
}

/**
 * Format a bracket as text lines
 */
function formatBracket(
	bracket: BracketWithConfig,
	name: string,
	idToName: Map<string, string>,
	level: ExportLevel
): string[] {
	const lines: string[] = [];
	lines.push(`[${name}]`);

	for (const round of bracket.rounds) {
		lines.push(round.name);
		for (const match of round.matches) {
			lines.push(...formatMatch(match, idToName, level));
		}
	}

	// 3rd place match
	if (bracket.thirdPlaceMatch) {
		const matchLines = formatMatch(bracket.thirdPlaceMatch, idToName, level);
		if (matchLines.length > 0) {
			lines.push('3er puesto');
			lines.push(...matchLines);
		}
	}

	return lines;
}

/**
 * Export tournament data as human-readable text
 *
 * @param level
 *   1 = Group standings only (name,points,20s) + bracket match results
 *   2 = Group match results per round + bracket match results
 *   3 = Everything with round-by-round detail (pA,pB,20A,20B)
 */
export function exportTournamentText(
	tournament: Tournament,
	level: ExportLevel
): string {
	const idToName = buildIdToName(tournament);
	const lines: string[] = [];

	// --- Group Stage ---
	if (tournament.groupStage) {
		const gs = tournament.groupStage;
		const prefix = gs.type === 'SWISS' ? 'SS' : 'RR';

		if (level === 1) {
			// Standings format: one group per block
			for (const group of gs.groups) {
				lines.push(group.name);
				for (const s of [...group.standings].sort((a, b) => a.position - b.position)) {
					const name = idToName.get(s.participantId) || 'Unknown';
					lines.push(`${name},${s.totalPointsScored ?? s.points ?? 0},${s.total20s ?? 0}`);
				}
				lines.push('');
			}
		} else {
			// Match results per round
			for (const group of gs.groups) {
				const source = group.schedule || group.pairings || [];
				for (const round of source) {
					const header = gs.groups.length === 1
						? `${prefix} R${round.roundNumber}`
						: `${group.name} R${round.roundNumber}`;
					lines.push(header);
					for (const match of round.matches) {
						lines.push(...formatMatch(match, idToName, level));
					}
					lines.push('');
				}
			}
		}
	}

	// --- Final Stage ---
	if (tournament.finalStage && tournament.phaseType !== 'GROUP_ONLY') {
		const fs = tournament.finalStage;

		if (fs.mode === 'PARALLEL_BRACKETS' && fs.parallelBrackets) {
			for (const nb of fs.parallelBrackets) {
				lines.push(...formatBracket(nb.bracket, nb.name, idToName, level));
				lines.push('');
			}
		} else if (fs.mode === 'SPLIT_DIVISIONS') {
			lines.push(...formatBracket(fs.goldBracket, 'A Finals', idToName, level));
			lines.push('');
			if (fs.silverBracket) {
				lines.push(...formatBracket(fs.silverBracket, 'B Finals', idToName, level));
				lines.push('');
			}
		} else {
			// SINGLE_BRACKET
			lines.push(...formatBracket(fs.goldBracket, 'Final', idToName, level));
			lines.push('');
		}
	}

	return lines.join('\n').trim();
}
