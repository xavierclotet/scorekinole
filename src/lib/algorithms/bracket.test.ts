import { describe, it, expect } from 'vitest';
import {
	generateConsolationBracketStructure,
	replaceLoserPlaceholder,
	getBracketSeeding,
	generateBracket,
	cascadeByeWins,
	advanceConsolationWinner,
	calculateConsolationPositions,
	nextPowerOfTwo,
	isLoserPlaceholder,
	isBye,
	BYE_PARTICIPANT
} from './bracket';
import type { TournamentParticipant } from '$lib/types/tournament';

describe('getBracketSeeding', () => {
	it('returns correct pairings for size 4', () => {
		const seeding = getBracketSeeding(4);
		expect(seeding).toEqual([
			[1, 4],
			[2, 3]
		]);
	});

	it('returns correct pairings for size 8', () => {
		const seeding = getBracketSeeding(8);
		expect(seeding).toEqual([
			[1, 8],
			[4, 5],
			[2, 7],
			[3, 6]
		]);
	});

	it('returns correct pairings for size 16', () => {
		const seeding = getBracketSeeding(16);
		expect(seeding).toHaveLength(8);
		// First seed plays last seed
		expect(seeding[0]).toEqual([1, 16]);
	});
});

describe('generateConsolationBracketStructure', () => {
	it('handles 15 teams: 7 real R16 losers + 1 BYE', () => {
		// 15 teams → 16-bracket → R16 has 8 matches, position 0 is BYE
		const byePositions = [0];
		const bracket = generateConsolationBracketStructure(16, 'R16', byePositions, 'gold');

		expect(bracket.source).toBe('R16');
		expect(bracket.startPosition).toBe(9);
		expect(bracket.numLosers).toBe(7);
		expect(bracket.rounds.length).toBeGreaterThanOrEqual(1);

		// First round should reference LOSER:R16:1 through LOSER:R16:7 (skipping position 0)
		const firstRound = bracket.rounds[0];
		const allParticipants: string[] = [];
		for (const match of firstRound.matches) {
			if (match.participantA) allParticipants.push(match.participantA);
			if (match.participantB) allParticipants.push(match.participantB);
		}

		// Should have placeholders for positions 1-7 (not 0)
		const placeholders = allParticipants.filter(p => isLoserPlaceholder(p));
		expect(placeholders).toHaveLength(7);

		// Position 0 should NOT appear in any placeholder
		expect(allParticipants.some(p => p === 'LOSER:R16:0')).toBe(false);

		// Positions 1-7 should all appear
		for (let i = 1; i <= 7; i++) {
			expect(allParticipants.some(p => p === `LOSER:R16:${i}`)).toBe(true);
		}
	});

	it('handles 16 teams: 8 real R16 losers, 0 BYEs', () => {
		const bracket = generateConsolationBracketStructure(16, 'R16', [], 'gold');

		expect(bracket.source).toBe('R16');
		expect(bracket.numLosers).toBe(8);

		const firstRound = bracket.rounds[0];
		const placeholders: string[] = [];
		for (const match of firstRound.matches) {
			if (match.participantA && isLoserPlaceholder(match.participantA)) placeholders.push(match.participantA);
			if (match.participantB && isLoserPlaceholder(match.participantB)) placeholders.push(match.participantB);
		}

		expect(placeholders).toHaveLength(8);

		// All positions 0-7 should appear
		for (let i = 0; i <= 7; i++) {
			expect(placeholders.some(p => p === `LOSER:R16:${i}`)).toBe(true);
		}
	});

	it('handles 12 teams: 4 real R16 losers', () => {
		// 12 teams → 16-bracket → 4 BYEs in R16 (positions 0,1,2,3)
		const byePositions = [0, 1, 2, 3];
		const bracket = generateConsolationBracketStructure(16, 'R16', byePositions, 'gold');

		expect(bracket.numLosers).toBe(4);

		const firstRound = bracket.rounds[0];
		const placeholders: string[] = [];
		for (const match of firstRound.matches) {
			if (match.participantA && isLoserPlaceholder(match.participantA)) placeholders.push(match.participantA);
			if (match.participantB && isLoserPlaceholder(match.participantB)) placeholders.push(match.participantB);
		}

		expect(placeholders).toHaveLength(4);

		// Only positions 4-7 should appear (non-BYE)
		for (let i = 4; i <= 7; i++) {
			expect(placeholders.some(p => p === `LOSER:R16:${i}`)).toBe(true);
		}
	});

	it('handles QF with 4 real losers, 0 BYEs', () => {
		const bracket = generateConsolationBracketStructure(8, 'QF', [], 'gold');

		expect(bracket.source).toBe('QF');
		expect(bracket.startPosition).toBe(5);
		expect(bracket.numLosers).toBe(4);

		const firstRound = bracket.rounds[0];
		const placeholders: string[] = [];
		for (const match of firstRound.matches) {
			if (match.participantA && isLoserPlaceholder(match.participantA)) placeholders.push(match.participantA);
			if (match.participantB && isLoserPlaceholder(match.participantB)) placeholders.push(match.participantB);
		}

		expect(placeholders).toHaveLength(4);
	});

	it('returns empty bracket for less than 2 real losers', () => {
		// Only 1 real loser
		const bracket = generateConsolationBracketStructure(16, 'R16', [0, 1, 2, 3, 4, 5, 6], 'gold');

		expect(bracket.rounds).toHaveLength(0);
		expect(bracket.isComplete).toBe(true);
	});
});

describe('replaceLoserPlaceholder', () => {
	it('replaces placeholder with actual loser ID', () => {
		const bracket = generateConsolationBracketStructure(16, 'R16', [0], 'gold');

		// Replace LOSER:R16:1 with actual participant
		const updated = replaceLoserPlaceholder(bracket, 'R16', 1, 'player-abc', 5);

		const firstRound = updated.rounds[0];
		const allParticipants: string[] = [];
		for (const match of firstRound.matches) {
			if (match.participantA) allParticipants.push(match.participantA);
			if (match.participantB) allParticipants.push(match.participantB);
		}

		// The placeholder should be gone
		expect(allParticipants).not.toContain('LOSER:R16:1');
		// The actual player should be present
		expect(allParticipants).toContain('player-abc');
	});

	it('auto-completes BYE match when placeholder is replaced', () => {
		// With 7 real losers, one match will have a BYE opponent
		const bracket = generateConsolationBracketStructure(16, 'R16', [0], 'gold');

		// Find which position has a BYE opponent
		const firstRound = bracket.rounds[0];
		let byeMatchPosition = -1;
		let placeholderInByeMatch = '';

		for (const match of firstRound.matches) {
			if (isBye(match.participantA) && isLoserPlaceholder(match.participantB)) {
				byeMatchPosition = match.position;
				placeholderInByeMatch = match.participantB!;
				break;
			}
			if (isBye(match.participantB) && isLoserPlaceholder(match.participantA)) {
				byeMatchPosition = match.position;
				placeholderInByeMatch = match.participantA!;
				break;
			}
		}

		expect(byeMatchPosition).not.toBe(-1);

		// Extract the match position from the placeholder (LOSER:R16:X)
		const mainBracketPos = parseInt(placeholderInByeMatch.split(':')[2]);
		const updated = replaceLoserPlaceholder(bracket, 'R16', mainBracketPos, 'player-bye-winner', 1);

		// The match should be auto-completed
		const updatedMatch = updated.rounds[0].matches[byeMatchPosition];
		expect(updatedMatch.status).toBe('COMPLETED');
		expect(updatedMatch.winner).toBe('player-bye-winner');
	});
});

describe('full consolation flow for 15 participants', () => {
	it('generates correct R16 consolation bracket', () => {
		// Create 15 participants
		const participants: TournamentParticipant[] = Array.from({ length: 15 }, (_, i) => ({
			id: `player-${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1
		}));

		const bracket = generateBracket(participants);

		// Should be a 16-bracket with 4 rounds
		expect(bracket.totalRounds).toBe(4);
		const bracketSize = nextPowerOfTwo(Math.pow(2, bracket.totalRounds));
		expect(bracketSize).toBe(16);

		// R16 is round index 0 (first round for 16-bracket)
		const r16 = bracket.rounds[0];
		expect(r16.matches).toHaveLength(8);

		// One match should have a BYE (player 1 vs BYE)
		const byeMatches = r16.matches.filter(m => isBye(m.participantA) || isBye(m.participantB));
		expect(byeMatches).toHaveLength(1);

		// The BYE match position is the bye position
		const byePosition = byeMatches[0].position;

		// Generate consolation for R16 with BYE position
		const consolation = generateConsolationBracketStructure(16, 'R16', [byePosition], 'gold');

		expect(consolation.numLosers).toBe(7);
		expect(consolation.rounds.length).toBeGreaterThanOrEqual(1);

		// Bracket size for 7 losers → next power of 2 = 8 → 3 rounds
		expect(consolation.totalRounds).toBe(3);

		// Verify all 7 non-BYE positions have placeholders
		const firstRound = consolation.rounds[0];
		const allPlaceholders: string[] = [];
		for (const match of firstRound.matches) {
			if (match.participantA && isLoserPlaceholder(match.participantA)) allPlaceholders.push(match.participantA);
			if (match.participantB && isLoserPlaceholder(match.participantB)) allPlaceholders.push(match.participantB);
		}

		expect(allPlaceholders).toHaveLength(7);

		// BYE position should not have a placeholder
		expect(allPlaceholders.some(p => p === `LOSER:R16:${byePosition}`)).toBe(false);
	});

	it('fills all 7 losers correctly with replaceLoserPlaceholder', () => {
		const consolation = generateConsolationBracketStructure(16, 'R16', [0], 'gold');
		let current = consolation;

		// Replace all 7 loser positions (1-7)
		for (let pos = 1; pos <= 7; pos++) {
			const updated = replaceLoserPlaceholder(current, 'R16', pos, `loser-${pos}`, pos + 1);
			current = updated;
		}

		// No placeholders should remain
		const firstRound = current.rounds[0];
		for (const match of firstRound.matches) {
			if (match.participantA) {
				expect(isLoserPlaceholder(match.participantA)).toBe(false);
			}
			if (match.participantB) {
				expect(isLoserPlaceholder(match.participantB)).toBe(false);
			}
		}

		// All 7 losers should be present somewhere
		const allParticipants = new Set<string>();
		for (const round of current.rounds) {
			for (const match of round.matches) {
				if (match.participantA && !isBye(match.participantA)) allParticipants.add(match.participantA);
				if (match.participantB && !isBye(match.participantB)) allParticipants.add(match.participantB);
			}
		}

		for (let pos = 1; pos <= 7; pos++) {
			expect(allParticipants.has(`loser-${pos}`)).toBe(true);
		}
	});
});

describe('loser bracket matches (positions 13-16)', () => {
	it('8-slot consolation has loser bracket matches in R2 and R3', () => {
		const bracket = generateConsolationBracketStructure(16, 'R16', [], 'gold');

		// 8 losers → 8-slot → 3 rounds
		expect(bracket.totalRounds).toBe(3);

		// R1: 4 primary matches
		expect(bracket.rounds[0].matches).toHaveLength(4);

		// R2: 2 primary + 2 LB = 4 matches
		expect(bracket.rounds[1].matches).toHaveLength(4);
		const r2Primary = bracket.rounds[1].matches.slice(0, 2);
		const r2Lb = bracket.rounds[1].matches.slice(2);
		expect(r2Lb).toHaveLength(2);
		expect(r2Lb[0].id).toContain('-lb-');
		expect(r2Lb[1].id).toContain('-lb-');

		// R3: 1 final + 1 3rd + 1 LB final + 1 LB 3rd = 4 matches
		expect(bracket.rounds[2].matches).toHaveLength(4);
		const r3Matches = bracket.rounds[2].matches;
		expect(r3Matches[0].id).toContain('-r3-m1'); // final
		expect(r3Matches[1].id).toContain('-r3-3rd-'); // 3rd place
		expect(r3Matches[2].id).toContain('-r3-lb-m'); // LB final
		expect(r3Matches[3].id).toContain('-r3-lb-3rd-'); // LB 3rd
		expect(r3Matches[3].isThirdPlace).toBe(true);
	});

	it('R1 matches have nextMatchIdForLoser pointing to R2 LB matches', () => {
		const bracket = generateConsolationBracketStructure(16, 'R16', [], 'gold');

		const r1 = bracket.rounds[0];
		const r2Lb = bracket.rounds[1].matches.slice(2);

		// M0 and M1 losers → LB0
		expect(r1.matches[0].nextMatchIdForLoser).toBe(r2Lb[0].id);
		expect(r1.matches[1].nextMatchIdForLoser).toBe(r2Lb[0].id);

		// M2 and M3 losers → LB1
		expect(r1.matches[2].nextMatchIdForLoser).toBe(r2Lb[1].id);
		expect(r1.matches[3].nextMatchIdForLoser).toBe(r2Lb[1].id);
	});

	it('R2 LB matches link to R3 LB final and LB 3rd', () => {
		const bracket = generateConsolationBracketStructure(16, 'R16', [], 'gold');

		const r2Lb = bracket.rounds[1].matches.slice(2);
		const r3 = bracket.rounds[2].matches;
		const lbFinal = r3[2]; // LB final
		const lb3rd = r3[3]; // LB 3rd

		// LB0 and LB1 winners → LB Final
		expect(r2Lb[0].nextMatchId).toBe(lbFinal.id);
		expect(r2Lb[1].nextMatchId).toBe(lbFinal.id);

		// LB0 and LB1 losers → LB 3rd
		expect(r2Lb[0].nextMatchIdForLoser).toBe(lb3rd.id);
		expect(r2Lb[1].nextMatchIdForLoser).toBe(lb3rd.id);
	});

	it('4-slot consolation does NOT have loser bracket (totalRounds=2)', () => {
		const bracket = generateConsolationBracketStructure(8, 'QF', [], 'gold');

		expect(bracket.totalRounds).toBe(2);

		// R1: 2 primary matches, no LB
		expect(bracket.rounds[0].matches).toHaveLength(2);

		// R2 (final): 1 final + 1 3rd = 2 matches only
		expect(bracket.rounds[1].matches).toHaveLength(2);
	});

	it('BYE cascading works through loser bracket with 7 real losers', () => {
		// 7 real losers, 1 BYE at position 0
		const bracket = generateConsolationBracketStructure(16, 'R16', [0], 'gold');
		let current = bracket;

		// Replace all 7 loser positions (1-7)
		for (let pos = 1; pos <= 7; pos++) {
			current = replaceLoserPlaceholder(current, 'R16', pos, `loser-${pos}`, pos + 1);
		}

		// The BYE match (seed 1 vs BYE) should auto-complete in R1
		const byeMatch = current.rounds[0].matches.find(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatch).toBeDefined();
		expect(byeMatch!.status).toBe('COMPLETED');

		// The BYE loser should cascade to the R2 LB match
		const r2Lb = current.rounds[1].matches.slice(2);
		const lbMatchWithBye = r2Lb.find(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(lbMatchWithBye).toBeDefined();
	});

	it('full flow: 8 losers produce positions 9-16 via loser bracket', () => {
		const bracket = generateConsolationBracketStructure(16, 'R16', [], 'gold');
		let current = bracket;

		// Replace all 8 loser placeholders
		for (let pos = 0; pos <= 7; pos++) {
			current = replaceLoserPlaceholder(current, 'R16', pos, `loser-${pos}`, pos + 1);
		}

		// Helper: play all playable matches in a round (re-reads from current to avoid stale refs)
		function playRound(roundIdx: number) {
			// Collect match IDs to play (avoids stale reference after advanceConsolationWinner deep-clones)
			const matchIds = current.rounds[roundIdx].matches
				.filter(m => m.status !== 'COMPLETED' && m.participantA && m.participantB
					&& !isBye(m.participantA) && !isBye(m.participantB))
				.map(m => m.id);

			for (const matchId of matchIds) {
				// Re-find match in current bracket (may have been cloned)
				const match = current.rounds[roundIdx].matches.find(m => m.id === matchId)!;
				if (match.status === 'COMPLETED') continue;
				const winner = match.participantA!;
				const loser = match.participantB!;
				match.status = 'COMPLETED';
				match.winner = winner;
				current = advanceConsolationWinner(current, match.id, winner, loser);
			}
		}

		// Play all 3 rounds
		playRound(0);
		playRound(1);
		playRound(2);

		// Bracket should be complete
		expect(current.isComplete).toBe(true);

		// Calculate positions — all 8 losers should get positions 9-16
		const positions = calculateConsolationPositions(current);
		const assignedPositions = new Set(positions.values());

		// Should have positions 9 through 16
		for (let pos = 9; pos <= 16; pos++) {
			expect(assignedPositions.has(pos)).toBe(true);
		}

		// All 8 participants should have positions
		expect(positions.size).toBe(8);
	});
});
