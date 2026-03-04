import { describe, it, expect } from 'vitest';
import {
	generateConsolationBracketStructure,
	replaceLoserPlaceholder,
	getBracketSeeding,
	generateBracket,
	cascadeByeWins,
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
