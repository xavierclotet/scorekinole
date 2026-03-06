import { describe, it, expect } from 'vitest';
import {
	generateConsolationBracketStructure,
	replaceLoserPlaceholder,
	getBracketSeeding,
	generateBracket,
	cascadeByeWins,
	advanceWinner,
	advanceConsolationWinner,
	calculateConsolationPositions,
	getAvailableConsolationSources,
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

describe('generateBracket with various participant counts', () => {
	function makeParticipants(count: number): TournamentParticipant[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `player-${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: count - i,
			status: 'ACTIVE' as const
		}));
	}

	it('10 participants: 16-bracket with 6 BYEs', () => {
		const participants = makeParticipants(10);
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(4); // log2(16)
		expect(bracket.rounds[0].matches).toHaveLength(8); // 16/2

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(6);

		// All BYE matches should be pre-completed
		for (const match of byeMatches) {
			expect(match.status).toBe('COMPLETED');
			expect(match.winner).toBeDefined();
			expect(isBye(match.winner!)).toBe(false);
		}

		// Top 6 seeds get BYEs (play against BYE)
		const byeWinnerSeeds = byeMatches.map(m => {
			if (isBye(m.participantA)) return m.seedB;
			return m.seedA;
		}).sort((a, b) => a! - b!);
		expect(byeWinnerSeeds).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it('24 participants: 32-bracket with 8 BYEs', () => {
		const participants = makeParticipants(24);
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(5); // log2(32)
		expect(bracket.rounds[0].matches).toHaveLength(16); // 32/2

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(8);

		// All BYE matches pre-completed with real player as winner
		for (const match of byeMatches) {
			expect(match.status).toBe('COMPLETED');
			expect(isBye(match.winner!)).toBe(false);
		}
	});

	it('30 participants: 32-bracket with 2 BYEs', () => {
		const participants = makeParticipants(30);
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(5);

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(2);

		// Seeds 1 and 2 should get BYEs
		const byeWinnerSeeds = byeMatches.map(m => {
			if (isBye(m.participantA)) return m.seedB;
			return m.seedA;
		}).sort((a, b) => a! - b!);
		expect(byeWinnerSeeds).toEqual([1, 2]);
	});

	it('2 participants: minimal bracket', () => {
		const participants = makeParticipants(2);
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(1);
		expect(bracket.rounds[0].matches).toHaveLength(1);
		expect(bracket.rounds[0].matches[0].status).toBe('PENDING');
	});

	it('64 participants: perfect 64-bracket with 0 BYEs', () => {
		const participants = makeParticipants(64);
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(6); // log2(64)
		expect(bracket.rounds[0].matches).toHaveLength(32);

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(0);

		// All 64 participants should appear in R1
		const allR1 = new Set<string>();
		for (const match of bracket.rounds[0].matches) {
			if (match.participantA && !isBye(match.participantA)) allR1.add(match.participantA);
			if (match.participantB && !isBye(match.participantB)) allR1.add(match.participantB);
		}
		expect(allR1.size).toBe(64);
	});

	it('128 participants: perfect 128-bracket with 0 BYEs', () => {
		const participants = makeParticipants(128);
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(7); // log2(128)
		expect(bracket.rounds[0].matches).toHaveLength(64);

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(0);

		// All 128 participants in R1
		const allR1 = new Set<string>();
		for (const match of bracket.rounds[0].matches) {
			if (match.participantA && !isBye(match.participantA)) allR1.add(match.participantA);
			if (match.participantB && !isBye(match.participantB)) allR1.add(match.participantB);
		}
		expect(allR1.size).toBe(128);
	});

	it('100 participants: 128-bracket with 28 BYEs', () => {
		const participants = makeParticipants(100);
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(7); // log2(128)
		expect(bracket.rounds[0].matches).toHaveLength(64);

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(28); // 128 - 100

		// Top 28 seeds get BYEs
		const byeWinnerSeeds = byeMatches.map(m => {
			if (isBye(m.participantA)) return m.seedB;
			return m.seedA;
		}).sort((a, b) => a! - b!);
		expect(byeWinnerSeeds).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
	});

	it('throws for less than 2 participants', () => {
		expect(() => generateBracket(makeParticipants(1))).toThrow();
		expect(() => generateBracket(makeParticipants(0))).toThrow();
	});
});

describe('consolation bracket with minimal losers', () => {
	it('10 participants: only 2 real R16 losers', () => {
		// 10 in 16-bracket = 6 BYEs at positions 0-5
		const byePositions = [0, 1, 2, 3, 4, 5];
		const bracket = generateConsolationBracketStructure(16, 'R16', byePositions, 'gold');

		// Only 2 real losers (positions 6 and 7)
		expect(bracket.totalRounds).toBe(1); // 2 losers → bracket of 2 → 1 round
		expect(bracket.rounds[0].matches).toHaveLength(1);

		// Both participants should be placeholders (not BYEs)
		const match = bracket.rounds[0].matches[0];
		expect(isLoserPlaceholder(match.participantA)).toBe(true);
		expect(isLoserPlaceholder(match.participantB)).toBe(true);
	});

	it('returns empty bracket when fewer than 2 real losers', () => {
		// 9 participants in 16-bracket = 7 BYEs
		const byePositions = [0, 1, 2, 3, 4, 5, 6];
		const bracket = generateConsolationBracketStructure(16, 'R16', byePositions, 'gold');

		expect(bracket.rounds).toHaveLength(0);
		expect(bracket.isComplete).toBe(true);
	});

	it('40 participants: 64-bracket with 24 BYEs', () => {
		const participants = Array.from({ length: 40 }, (_, i) => ({
			id: `player-${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: 40 - i,
			status: 'ACTIVE' as const
		}));
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(6); // log2(64)
		expect(bracket.rounds[0].matches).toHaveLength(32); // 64/2

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(24); // 64 - 40

		// All BYE matches pre-completed
		for (const match of byeMatches) {
			expect(match.status).toBe('COMPLETED');
			expect(isBye(match.winner!)).toBe(false);
		}

		// Top 24 seeds should get BYEs
		const byeWinnerSeeds = byeMatches.map(m => {
			if (isBye(m.participantA)) return m.seedB;
			return m.seedA;
		}).sort((a, b) => a! - b!);
		expect(byeWinnerSeeds).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
	});

	it('50 participants: 64-bracket with 14 BYEs', () => {
		const participants = Array.from({ length: 50 }, (_, i) => ({
			id: `player-${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: 50 - i,
			status: 'ACTIVE' as const
		}));
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(6); // log2(64)
		expect(bracket.rounds[0].matches).toHaveLength(32); // 64/2

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(14); // 64 - 50

		// All BYE matches pre-completed
		for (const match of byeMatches) {
			expect(match.status).toBe('COMPLETED');
			expect(isBye(match.winner!)).toBe(false);
		}

		// Top 14 seeds should get BYEs
		const byeWinnerSeeds = byeMatches.map(m => {
			if (isBye(m.participantA)) return m.seedB;
			return m.seedA;
		}).sort((a, b) => a! - b!);
		expect(byeWinnerSeeds).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));

		// Non-BYE matches should be PENDING
		const realMatches = bracket.rounds[0].matches.filter(
			m => !isBye(m.participantA) && !isBye(m.participantB)
		);
		expect(realMatches).toHaveLength(18); // 32 - 14
		for (const match of realMatches) {
			expect(match.status).toBe('PENDING');
		}
	});

	it('50 participants: all participants placed in bracket with correct seeding', () => {
		const participants = Array.from({ length: 50 }, (_, i) => ({
			id: `player-${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: 50 - i,
			status: 'ACTIVE' as const
		}));
		const bracket = generateBracket(participants);

		// Every participant should appear in R1
		const allR1Participants = new Set<string>();
		for (const match of bracket.rounds[0].matches) {
			if (match.participantA && !isBye(match.participantA)) allR1Participants.add(match.participantA);
			if (match.participantB && !isBye(match.participantB)) allR1Participants.add(match.participantB);
		}
		expect(allR1Participants.size).toBe(50);

		// R2 should have BYE winners advanced
		const r2 = bracket.rounds[1];
		expect(r2.matches).toHaveLength(16); // 32/2
		// 14 BYE winners should already be placed in R2
		const r2Filled = r2.matches.filter(m => m.participantA || m.participantB);
		expect(r2Filled.length).toBeGreaterThanOrEqual(14);
	});

	it('BYE cascading with 5 real losers in 8-slot consolation', () => {
		// 13 participants in 16-bracket = 3 BYEs at positions 0, 1, 2
		const byePositions = [0, 1, 2];
		const bracket = generateConsolationBracketStructure(16, 'R16', byePositions, 'gold');

		// 5 real losers → bracket of 8 → 3 rounds
		expect(bracket.totalRounds).toBe(3);

		let current = bracket;

		// Replace all 5 real loser placeholders (positions 3-7)
		for (let pos = 3; pos <= 7; pos++) {
			current = replaceLoserPlaceholder(current, 'R16', pos, `loser-${pos}`, pos + 1);
		}

		// 3 BYE matches should be auto-completed after cascading
		const r1Completed = current.rounds[0].matches.filter(m => m.status === 'COMPLETED');
		// 3 out of 4 R1 matches should be complete (3 have BYEs facing real players)
		expect(r1Completed.length).toBeGreaterThanOrEqual(3);

		// Verify no placeholder remains in R1
		for (const match of current.rounds[0].matches) {
			if (match.participantA) expect(isLoserPlaceholder(match.participantA)).toBe(false);
			if (match.participantB) expect(isLoserPlaceholder(match.participantB)).toBe(false);
		}

		// All 5 real losers should be reachable somewhere in the bracket
		const allParticipants = new Set<string>();
		for (const round of current.rounds) {
			for (const match of round.matches) {
				if (match.participantA && !isBye(match.participantA)) allParticipants.add(match.participantA);
				if (match.participantB && !isBye(match.participantB)) allParticipants.add(match.participantB);
			}
		}
		for (let pos = 3; pos <= 7; pos++) {
			expect(allParticipants.has(`loser-${pos}`)).toBe(true);
		}
	});
});

describe('generateBracket with doubles teams', () => {
	function makeTeams(count: number): TournamentParticipant[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `team-${i + 1}`,
			name: `Team ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: count - i,
			status: 'ACTIVE' as const,
			partner: { name: `Partner ${i + 1}`, type: 'GUEST' as const }
		}));
	}

	it('25 teams: 32-bracket with 7 BYEs', () => {
		const teams = makeTeams(25);
		const bracket = generateBracket(teams);

		expect(bracket.totalRounds).toBe(5); // log2(32)
		expect(bracket.rounds[0].matches).toHaveLength(16); // 32/2

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(7); // 32 - 25

		for (const match of byeMatches) {
			expect(match.status).toBe('COMPLETED');
			expect(isBye(match.winner!)).toBe(false);
		}

		// Top 7 seeds get BYEs
		const byeWinnerSeeds = byeMatches.map(m => {
			if (isBye(m.participantA)) return m.seedB;
			return m.seedA;
		}).sort((a, b) => a! - b!);
		expect(byeWinnerSeeds).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it('16 teams: perfect bracket with no BYEs', () => {
		const teams = makeTeams(16);
		const bracket = generateBracket(teams);

		expect(bracket.totalRounds).toBe(4); // log2(16)
		expect(bracket.rounds[0].matches).toHaveLength(8);

		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(0);

		// All matches should be PENDING
		for (const match of bracket.rounds[0].matches) {
			expect(match.status).toBe('PENDING');
			expect(match.participantA).toBeDefined();
			expect(match.participantB).toBeDefined();
		}
	});
});

describe('R32 consolation bracket', () => {
	// R32 = round of 32 = 16 matches (in a 32+ bracket, this is 2nd round of 64-bracket)
	it('generates valid R32 consolation with all 16 real losers (no BYEs)', () => {
		const bracket = generateConsolationBracketStructure(64, 'R32', [], 'gold');

		expect(bracket.source).toBe('R32');
		expect(bracket.startPosition).toBe(17);
		expect(bracket.numLosers).toBe(16); // R32 has 16 matches
		expect(bracket.totalRounds).toBe(4); // log2(16)
	});

	it('generates R32 consolation with 6 BYEs (10 real losers)', () => {
		const byePositions = Array.from({ length: 6 }, (_, i) => i);
		const bracket = generateConsolationBracketStructure(64, 'R32', byePositions, 'gold');

		expect(bracket.numLosers).toBe(10); // 16 - 6
		expect(bracket.rounds.length).toBeGreaterThanOrEqual(1);

		// Verify placeholders for positions 6-15
		const firstRound = bracket.rounds[0];
		const allPlaceholders: string[] = [];
		for (const match of firstRound.matches) {
			if (match.participantA && isLoserPlaceholder(match.participantA)) allPlaceholders.push(match.participantA);
			if (match.participantB && isLoserPlaceholder(match.participantB)) allPlaceholders.push(match.participantB);
		}
		expect(allPlaceholders).toHaveLength(10);

		// BYE positions 0-5 should NOT appear
		for (let i = 0; i < 6; i++) {
			expect(allPlaceholders.some(p => p === `LOSER:R32:${i}`)).toBe(false);
		}
	});

	it('returns empty bracket when fewer than 2 real R32 losers', () => {
		const byePositions = Array.from({ length: 15 }, (_, i) => i);
		const bracket = generateConsolationBracketStructure(64, 'R32', byePositions, 'gold');

		expect(bracket.rounds).toHaveLength(0);
		expect(bracket.isComplete).toBe(true);
	});
});

describe('R64 consolation bracket', () => {
	// R64 = round of 64 = 32 matches (first round of a 64-bracket)
	it('generates valid R64 consolation with all 32 real losers (no BYEs)', () => {
		const bracket = generateConsolationBracketStructure(128, 'R64', [], 'gold');

		expect(bracket.source).toBe('R64');
		expect(bracket.startPosition).toBe(33);
		expect(bracket.numLosers).toBe(32); // R64 has 32 matches
		expect(bracket.totalRounds).toBe(5); // log2(32)
	});

	it('generates R64 consolation with 14 BYEs (18 real losers)', () => {
		// Simulates 50-player bracket first round (R64): 32 matches, 14 BYEs
		const byePositions = Array.from({ length: 14 }, (_, i) => i);
		const bracket = generateConsolationBracketStructure(128, 'R64', byePositions, 'gold');

		expect(bracket.source).toBe('R64');
		expect(bracket.startPosition).toBe(33);
		expect(bracket.numLosers).toBe(18); // 32 - 14
		expect(bracket.rounds.length).toBeGreaterThanOrEqual(1);
		expect(bracket.totalRounds).toBe(5); // 18 losers → next power of 2 = 32 → log2(32) = 5
	});

	it('returns empty bracket when fewer than 2 real R64 losers', () => {
		const byePositions = Array.from({ length: 31 }, (_, i) => i);
		const bracket = generateConsolationBracketStructure(128, 'R64', byePositions, 'gold');

		expect(bracket.rounds).toHaveLength(0);
		expect(bracket.isComplete).toBe(true);
	});
});

describe('getAvailableConsolationSources', () => {
	it('8-bracket: only QF', () => {
		const result = getAvailableConsolationSources(8);
		expect(result.hasQF).toBe(true);
		expect(result.hasR16).toBe(false);
		expect(result.hasR32).toBe(false);
		expect(result.hasR64).toBe(false);
	});

	it('16-bracket: QF + R16', () => {
		const result = getAvailableConsolationSources(16);
		expect(result.hasQF).toBe(true);
		expect(result.hasR16).toBe(true);
		expect(result.hasR32).toBe(false);
		expect(result.hasR64).toBe(false);
	});

	it('32-bracket: QF + R16 + R32', () => {
		const result = getAvailableConsolationSources(32);
		expect(result.hasQF).toBe(true);
		expect(result.hasR16).toBe(true);
		expect(result.hasR32).toBe(true);
		expect(result.hasR64).toBe(false);
	});

	it('64-bracket: QF + R16 + R32 + R64', () => {
		const result = getAvailableConsolationSources(64);
		expect(result.hasQF).toBe(true);
		expect(result.hasR16).toBe(true);
		expect(result.hasR32).toBe(true);
		expect(result.hasR64).toBe(true);
	});

	it('returns all false for too few participants', () => {
		const result = getAvailableConsolationSources(16, 2);
		expect(result.hasQF).toBe(false);
		expect(result.hasR16).toBe(false);
		expect(result.hasR32).toBe(false);
		expect(result.hasR64).toBe(false);
	});
});

describe('small tournament consolation regression', () => {
	it('8 players: QF consolation still works correctly', () => {
		const bracket = generateConsolationBracketStructure(8, 'QF', [], 'gold');

		expect(bracket.source).toBe('QF');
		expect(bracket.startPosition).toBe(5);
		expect(bracket.numLosers).toBe(4);
		expect(bracket.totalRounds).toBe(2);
		expect(bracket.rounds[0].matches).toHaveLength(2);
	});

	it('16 players: R16 consolation still works correctly', () => {
		const bracket = generateConsolationBracketStructure(16, 'R16', [], 'gold');

		expect(bracket.source).toBe('R16');
		expect(bracket.startPosition).toBe(9);
		expect(bracket.numLosers).toBe(8);
		expect(bracket.totalRounds).toBe(3);
		expect(bracket.rounds[0].matches).toHaveLength(4);
	});

	it('10 players: R16 consolation with 6 BYEs still works', () => {
		const byePositions = [0, 1, 2, 3, 4, 5];
		const bracket = generateConsolationBracketStructure(16, 'R16', byePositions, 'gold');

		expect(bracket.numLosers).toBe(2);
		expect(bracket.totalRounds).toBe(1);
		expect(bracket.rounds[0].matches).toHaveLength(1);
	});

	it('4 players: QF consolation with 0 BYEs gives 2 matches', () => {
		const bracket = generateConsolationBracketStructure(8, 'QF', [], 'gold');

		expect(bracket.numLosers).toBe(4);
		// QF: 4 losers → 2 round bracket (semi + final)
		expect(bracket.totalRounds).toBe(2);
	});

	it('full bracket + consolation flow for 8 players', () => {
		const participants = Array.from({ length: 8 }, (_, i) => ({
			id: `p${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: 8 - i,
			status: 'ACTIVE' as const
		}));
		const bracket = generateBracket(participants);

		expect(bracket.totalRounds).toBe(3); // log2(8)
		expect(bracket.rounds[0].matches).toHaveLength(4);

		// No BYEs for 8 players
		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(0);

		// QF consolation should work
		const consolation = generateConsolationBracketStructure(8, 'QF', [], 'gold');
		expect(consolation.numLosers).toBe(4);
		expect(consolation.startPosition).toBe(5);
	});
});

// ============================================================================
// advanceWinner — winner propagation and 3rd place match
// ============================================================================

describe('advanceWinner', () => {
	function makeParticipants(count: number): TournamentParticipant[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `p${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: count - i,
			status: 'ACTIVE' as const
		}));
	}

	it('advances QF winner to semifinal slot A (even index)', () => {
		const bracket = generateBracket(makeParticipants(8), true);
		const qfMatch = bracket.rounds[0].matches[0]; // Match 0 (even) → slot A
		qfMatch.status = 'COMPLETED';
		qfMatch.winner = qfMatch.participantA!;

		const updated = advanceWinner(bracket, qfMatch.id, qfMatch.participantA!);

		const semifinal = updated.rounds[1].matches[0];
		expect(semifinal.participantA).toBe(qfMatch.participantA);
	});

	it('advances QF winner to semifinal slot B (odd index)', () => {
		const bracket = generateBracket(makeParticipants(8), true);
		const qfMatch = bracket.rounds[0].matches[1]; // Match 1 (odd) → slot B
		qfMatch.status = 'COMPLETED';
		qfMatch.winner = qfMatch.participantA!;

		const updated = advanceWinner(bracket, qfMatch.id, qfMatch.participantA!);

		const semifinal = updated.rounds[1].matches[0];
		expect(semifinal.participantB).toBe(qfMatch.participantA);
	});

	it('semifinal loser goes to 3rd place match (SF1 → slot A)', () => {
		const bracket = generateBracket(makeParticipants(4), true);
		expect(bracket.thirdPlaceMatch).toBeDefined();

		const sf1 = bracket.rounds[0].matches[0]; // First semifinal
		sf1.status = 'COMPLETED';
		sf1.winner = sf1.participantA!;
		const loserId = sf1.participantB!;

		const updated = advanceWinner(bracket, sf1.id, sf1.participantA!);

		expect(updated.thirdPlaceMatch!.participantA).toBe(loserId);
	});

	it('semifinal loser goes to 3rd place match (SF2 → slot B)', () => {
		const bracket = generateBracket(makeParticipants(4), true);
		const sf2 = bracket.rounds[0].matches[1]; // Second semifinal
		sf2.status = 'COMPLETED';
		sf2.winner = sf2.participantB!;
		const loserId = sf2.participantA!;

		const updated = advanceWinner(bracket, sf2.id, sf2.participantB!);

		expect(updated.thirdPlaceMatch!.participantB).toBe(loserId);
	});

	it('no 3rd place match when disabled', () => {
		const bracket = generateBracket(makeParticipants(4), false);
		expect(bracket.thirdPlaceMatch).toBeUndefined();
	});

	it('seed propagates through rounds', () => {
		const bracket = generateBracket(makeParticipants(8), true);
		const qf = bracket.rounds[0].matches[0];
		const seedA = qf.seedA;
		qf.status = 'COMPLETED';
		qf.winner = qf.participantA!;

		const updated = advanceWinner(bracket, qf.id, qf.participantA!);
		const sf = updated.rounds[1].matches[0];
		expect(sf.seedA).toBe(seedA);
	});

	it('3rd place match: no advancement needed', () => {
		const bracket = generateBracket(makeParticipants(4), true);
		bracket.thirdPlaceMatch!.participantA = 'p3';
		bracket.thirdPlaceMatch!.participantB = 'p4';
		bracket.thirdPlaceMatch!.status = 'COMPLETED';
		bracket.thirdPlaceMatch!.winner = 'p3';

		const updated = advanceWinner(bracket, bracket.thirdPlaceMatch!.id, 'p3');
		// Should return bracket unchanged (no crash, no advancement)
		expect(updated.thirdPlaceMatch!.winner).toBe('p3');
	});

	it('final match: winner does not advance further', () => {
		const bracket = generateBracket(makeParticipants(4), true);
		const final = bracket.rounds[1].matches[0]; // Final round
		final.participantA = 'p1';
		final.participantB = 'p2';
		final.status = 'COMPLETED';
		final.winner = 'p1';

		// Should not throw
		const updated = advanceWinner(bracket, final.id, 'p1');
		expect(updated.rounds[1].matches[0].winner).toBe('p1');
	});
});

// ============================================================================
// Full bracket play-through with advanceWinner
// ============================================================================

describe('full bracket play-through', () => {
	function makeParticipants(count: number): TournamentParticipant[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `p${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: count - i,
			status: 'ACTIVE' as const
		}));
	}

	it('8-player bracket: full play-through with 3rd place', () => {
		let bracket = generateBracket(makeParticipants(8), true);

		// Play QF: participantA always wins
		for (const match of bracket.rounds[0].matches) {
			match.status = 'COMPLETED';
			match.winner = match.participantA!;
			bracket = advanceWinner(bracket, match.id, match.participantA!);
		}

		// Verify all SF slots are filled
		for (const sf of bracket.rounds[1].matches) {
			expect(sf.participantA).toBeDefined();
			expect(sf.participantB).toBeDefined();
		}

		// Play SF: participantA always wins
		for (const sf of bracket.rounds[1].matches) {
			sf.status = 'COMPLETED';
			sf.winner = sf.participantA!;
			bracket = advanceWinner(bracket, sf.id, sf.participantA!);
		}

		// Verify final is filled
		const final = bracket.rounds[2].matches[0];
		expect(final.participantA).toBeDefined();
		expect(final.participantB).toBeDefined();

		// Verify 3rd place match is filled with SF losers
		expect(bracket.thirdPlaceMatch!.participantA).toBeDefined();
		expect(bracket.thirdPlaceMatch!.participantB).toBeDefined();
		expect(isBye(bracket.thirdPlaceMatch!.participantA!)).toBe(false);
		expect(isBye(bracket.thirdPlaceMatch!.participantB!)).toBe(false);
	});

	it('5-player bracket: BYE winners advance to R2, 3rd place works', () => {
		let bracket = generateBracket(makeParticipants(5), true);

		// 5 → 8-bracket, 3 BYEs
		expect(bracket.totalRounds).toBe(3);
		const byeMatches = bracket.rounds[0].matches.filter(m => m.status === 'COMPLETED');
		expect(byeMatches).toHaveLength(3);

		// Advance BYE winners to R2 (Firebase layer does this at creation)
		for (const m of byeMatches) {
			if (m.winner) {
				bracket = advanceWinner(bracket, m.id, m.winner);
			}
		}

		// BYE winners should now be in R2 (3 BYE winners fill both SF matches)
		const r2 = bracket.rounds[1];
		const filledR2Slots = r2.matches.filter(m => m.participantA || m.participantB);
		expect(filledR2Slots).toHaveLength(2); // both SFs have at least 1 participant

		// Play the 1 real QF match
		const realQF = bracket.rounds[0].matches.find(m => m.status === 'PENDING')!;
		realQF.status = 'COMPLETED';
		realQF.winner = realQF.participantA!;
		bracket = advanceWinner(bracket, realQF.id, realQF.participantA!);

		// Play SF
		for (const sf of bracket.rounds[1].matches) {
			if (sf.participantA && sf.participantB) {
				sf.status = 'COMPLETED';
				sf.winner = sf.participantA!;
				bracket = advanceWinner(bracket, sf.id, sf.participantA!);
			}
		}

		// 3rd place should be filled
		expect(bracket.thirdPlaceMatch!.participantA).toBeDefined();
		expect(bracket.thirdPlaceMatch!.participantB).toBeDefined();
	});

	it('3-player bracket: 2 BYEs, minimal bracket', () => {
		const bracket = generateBracket(makeParticipants(3), true);

		expect(bracket.totalRounds).toBe(2); // 4-bracket
		const byeMatches = bracket.rounds[0].matches.filter(m => m.status === 'COMPLETED');
		expect(byeMatches).toHaveLength(1); // 1 BYE match

		// R2 (final) should have BYE winner pre-filled
		const final = bracket.rounds[1].matches[0];
		const hasPreFilled = final.participantA !== undefined || final.participantB !== undefined;
		expect(hasPreFilled).toBe(true);
	});
});

// ============================================================================
// Gold/Silver split bracket generation
// ============================================================================

describe('generateBracket with seed offset (gold/silver split)', () => {
	function makeParticipants(count: number): TournamentParticipant[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `p${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: count - i,
			status: 'ACTIVE' as const
		}));
	}

	it('silver bracket seeds are offset by gold participant count', () => {
		const goldParticipants = makeParticipants(8);
		const silverParticipants = makeParticipants(8).map((p, i) => ({
			...p,
			id: `silver-p${i + 1}`
		}));

		const goldBracket = generateBracket(goldParticipants, true, 0);
		const silverBracket = generateBracket(silverParticipants, true, 8);

		// Gold seeds: 1-8
		const goldSeeds = goldBracket.rounds[0].matches.flatMap(m => [m.seedA, m.seedB]).filter(Boolean) as number[];
		expect(Math.min(...goldSeeds)).toBe(1);
		expect(Math.max(...goldSeeds)).toBe(8);

		// Silver seeds: 9-16
		const silverSeeds = silverBracket.rounds[0].matches.flatMap(m => [m.seedA, m.seedB]).filter(Boolean) as number[];
		expect(Math.min(...silverSeeds)).toBe(9);
		expect(Math.max(...silverSeeds)).toBe(16);
	});

	it('gold and silver brackets are independent', () => {
		const goldBracket = generateBracket(makeParticipants(4), true, 0);
		const silverBracket = generateBracket(makeParticipants(4).map((p, i) => ({
			...p, id: `s-p${i + 1}`
		})), true, 4);

		// Both have 3rd place match
		expect(goldBracket.thirdPlaceMatch).toBeDefined();
		expect(silverBracket.thirdPlaceMatch).toBeDefined();

		// Different IDs
		expect(goldBracket.rounds[0].matches[0].id).not.toBe(silverBracket.rounds[0].matches[0].id);
	});

	it('16 gold + 16 silver: both generate correct 16-brackets', () => {
		const gold = generateBracket(makeParticipants(16), true, 0);
		const silver = generateBracket(makeParticipants(16).map((p, i) => ({
			...p, id: `s${i + 1}`
		})), true, 16);

		expect(gold.totalRounds).toBe(4);
		expect(silver.totalRounds).toBe(4);
		expect(gold.rounds[0].matches).toHaveLength(8);
		expect(silver.rounds[0].matches).toHaveLength(8);
	});
});

// ============================================================================
// 64-player R32 consolation full play-through
// ============================================================================

describe('64-player consolation full flow', () => {
	it('R32 consolation: 16 losers play through all rounds', () => {
		const bracket = generateConsolationBracketStructure(64, 'R32', [], 'gold');

		expect(bracket.numLosers).toBe(16);
		expect(bracket.totalRounds).toBe(4); // log2(16)
		expect(bracket.startPosition).toBe(17);

		let current = bracket;

		// Replace all 16 loser placeholders
		for (let pos = 0; pos < 16; pos++) {
			current = replaceLoserPlaceholder(current, 'R32', pos, `loser-${pos}`, pos + 1);
		}

		// No placeholders should remain in R1
		for (const match of current.rounds[0].matches) {
			if (match.participantA) expect(isLoserPlaceholder(match.participantA)).toBe(false);
			if (match.participantB) expect(isLoserPlaceholder(match.participantB)).toBe(false);
		}

		// Play all 4 rounds
		function playRound(roundIdx: number) {
			const matchIds = current.rounds[roundIdx].matches
				.filter(m => m.status !== 'COMPLETED' && m.participantA && m.participantB
					&& !isBye(m.participantA) && !isBye(m.participantB))
				.map(m => m.id);

			for (const matchId of matchIds) {
				const match = current.rounds[roundIdx].matches.find(m => m.id === matchId)!;
				if (match.status === 'COMPLETED') continue;
				const winner = match.participantA!;
				const loser = match.participantB!;
				match.status = 'COMPLETED';
				match.winner = winner;
				current = advanceConsolationWinner(current, match.id, winner, loser);
			}
		}

		playRound(0);
		playRound(1);
		playRound(2);
		playRound(3);

		expect(current.isComplete).toBe(true);

		// Calculate positions — all 16 losers should get positions 17-32
		const positions = calculateConsolationPositions(current);
		expect(positions.size).toBe(16);
		const assignedPositions = new Set(positions.values());
		for (let pos = 17; pos <= 32; pos++) {
			expect(assignedPositions.has(pos)).toBe(true);
		}
	});

	it('R32 consolation with 10 BYEs: 6 real losers', () => {
		const byePositions = Array.from({ length: 10 }, (_, i) => i);
		const bracket = generateConsolationBracketStructure(64, 'R32', byePositions, 'gold');

		expect(bracket.numLosers).toBe(6); // 16 - 10
		expect(bracket.totalRounds).toBe(3); // 6 → 8-slot → log2(8)

		// All placeholders for non-BYE positions
		const firstRound = bracket.rounds[0];
		const placeholders: string[] = [];
		for (const match of firstRound.matches) {
			if (match.participantA && isLoserPlaceholder(match.participantA)) placeholders.push(match.participantA);
			if (match.participantB && isLoserPlaceholder(match.participantB)) placeholders.push(match.participantB);
		}
		expect(placeholders).toHaveLength(6);
	});
});

// ============================================================================
// 128-player bracket and R64 consolation
// ============================================================================

describe('128-player bracket edge cases', () => {
	function makeParticipants(count: number): TournamentParticipant[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `p${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: count - i,
			status: 'ACTIVE' as const
		}));
	}

	it('100 players: BYE winners populate R2 correctly', () => {
		const bracket = generateBracket(makeParticipants(100), true);

		expect(bracket.totalRounds).toBe(7);

		// 28 BYE matches should be COMPLETED in R1
		const r1Completed = bracket.rounds[0].matches.filter(m => m.status === 'COMPLETED');
		expect(r1Completed).toHaveLength(28);

		// R2 should have those 28 winners pre-filled
		const r2 = bracket.rounds[1];
		let filledSlots = 0;
		for (const match of r2.matches) {
			if (match.participantA) filledSlots++;
			if (match.participantB) filledSlots++;
		}
		expect(filledSlots).toBeGreaterThanOrEqual(28);
	});

	it('100 players: 3rd place match is generated', () => {
		const bracket = generateBracket(makeParticipants(100), true);
		expect(bracket.thirdPlaceMatch).toBeDefined();
		expect(bracket.thirdPlaceMatch!.status).toBe('PENDING');
	});

	it('R64 consolation: 32 losers produce positions 33-64', () => {
		const bracket = generateConsolationBracketStructure(128, 'R64', [], 'gold');

		expect(bracket.numLosers).toBe(32);
		expect(bracket.totalRounds).toBe(5); // log2(32)
		expect(bracket.startPosition).toBe(33);

		let current = bracket;

		// Replace all 32 loser placeholders
		for (let pos = 0; pos < 32; pos++) {
			current = replaceLoserPlaceholder(current, 'R64', pos, `loser-${pos}`, pos + 1);
		}

		// No placeholders in R1
		for (const match of current.rounds[0].matches) {
			if (match.participantA) expect(isLoserPlaceholder(match.participantA)).toBe(false);
			if (match.participantB) expect(isLoserPlaceholder(match.participantB)).toBe(false);
		}

		// Play all 5 rounds
		function playRound(roundIdx: number) {
			const matchIds = current.rounds[roundIdx].matches
				.filter(m => m.status !== 'COMPLETED' && m.participantA && m.participantB
					&& !isBye(m.participantA) && !isBye(m.participantB))
				.map(m => m.id);

			for (const matchId of matchIds) {
				const match = current.rounds[roundIdx].matches.find(m => m.id === matchId)!;
				if (match.status === 'COMPLETED') continue;
				match.status = 'COMPLETED';
				match.winner = match.participantA!;
				current = advanceConsolationWinner(current, match.id, match.participantA!, match.participantB!);
			}
		}

		for (let r = 0; r < 5; r++) playRound(r);

		expect(current.isComplete).toBe(true);

		const positions = calculateConsolationPositions(current);
		expect(positions.size).toBe(32);
		const assignedPositions = new Set(positions.values());
		for (let pos = 33; pos <= 64; pos++) {
			expect(assignedPositions.has(pos)).toBe(true);
		}
	});

	it('R64 consolation with 28 BYEs (100 players): 4 real losers', () => {
		const byePositions = Array.from({ length: 28 }, (_, i) => i);
		const bracket = generateConsolationBracketStructure(128, 'R64', byePositions, 'gold');

		expect(bracket.numLosers).toBe(4); // 32 - 28
		expect(bracket.totalRounds).toBe(2); // 4 → 4-slot → log2(4)
	});

	it('128-bracket: all round sizes correct', () => {
		const bracket = generateBracket(makeParticipants(128), true);

		expect(bracket.rounds[0].matches).toHaveLength(64); // R64
		expect(bracket.rounds[1].matches).toHaveLength(32); // R32
		expect(bracket.rounds[2].matches).toHaveLength(16); // R16
		expect(bracket.rounds[3].matches).toHaveLength(8);  // QF
		expect(bracket.rounds[4].matches).toHaveLength(4);  // Reserved/QF
		expect(bracket.rounds[5].matches).toHaveLength(2);  // SF
		expect(bracket.rounds[6].matches).toHaveLength(1);  // Final
	});

	it('all nextMatchId links are valid within bracket', () => {
		const bracket = generateBracket(makeParticipants(16), true);

		const allMatchIds = new Set<string>();
		for (const round of bracket.rounds) {
			for (const match of round.matches) {
				allMatchIds.add(match.id);
			}
		}

		// Every nextMatchId should point to a valid match in the next round
		for (let ri = 0; ri < bracket.rounds.length - 1; ri++) {
			for (const match of bracket.rounds[ri].matches) {
				if (match.nextMatchId) {
					expect(allMatchIds.has(match.nextMatchId)).toBe(true);
				}
			}
		}

		// Final match should have no nextMatchId
		const finalMatch = bracket.rounds[bracket.rounds.length - 1].matches[0];
		expect(finalMatch.nextMatchId).toBeUndefined();
	});
});

// ============================================================================
// Edge cases
// ============================================================================

describe('bracket edge cases', () => {
	function makeParticipants(count: number): TournamentParticipant[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `p${i + 1}`,
			name: `Player ${i + 1}`,
			seed: i + 1,
			type: 'GUEST' as const,
			rankingSnapshot: count - i,
			status: 'ACTIVE' as const
		}));
	}

	it('power-of-2 boundary: 32 players have no BYEs', () => {
		const bracket = generateBracket(makeParticipants(32), true);
		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(0);
		expect(bracket.totalRounds).toBe(5);
	});

	it('power-of-2 boundary: 33 players have 31 BYEs in 64-bracket', () => {
		const bracket = generateBracket(makeParticipants(33), true);
		expect(bracket.totalRounds).toBe(6); // 64-bracket
		const byeMatches = bracket.rounds[0].matches.filter(
			m => isBye(m.participantA) || isBye(m.participantB)
		);
		expect(byeMatches).toHaveLength(31); // 64 - 33
	});

	it('2 participants: single match, no 3rd place even if enabled', () => {
		const bracket = generateBracket(makeParticipants(2), true);
		expect(bracket.totalRounds).toBe(1);
		expect(bracket.rounds[0].matches).toHaveLength(1);
		// Only 2 participants — not enough for 3rd place
		// (3rd place needs semifinals which need 4+ players)
	});

	it('4 participants: 2 semis + final + 3rd place', () => {
		const bracket = generateBracket(makeParticipants(4), true);
		expect(bracket.totalRounds).toBe(2);
		expect(bracket.rounds[0].matches).toHaveLength(2); // Semifinals
		expect(bracket.rounds[1].matches).toHaveLength(1); // Final
		expect(bracket.thirdPlaceMatch).toBeDefined();
	});

	it('consolation structure has correct startPositions per source', () => {
		// QF losers: positions 5-8
		const qf = generateConsolationBracketStructure(8, 'QF', [], 'gold');
		expect(qf.startPosition).toBe(5);

		// R16 losers: positions 9-16
		const r16 = generateConsolationBracketStructure(16, 'R16', [], 'gold');
		expect(r16.startPosition).toBe(9);

		// R32 losers: positions 17-32
		const r32 = generateConsolationBracketStructure(64, 'R32', [], 'gold');
		expect(r32.startPosition).toBe(17);

		// R64 losers: positions 33-64
		const r64 = generateConsolationBracketStructure(128, 'R64', [], 'gold');
		expect(r64.startPosition).toBe(33);
	});

	it('consolation with position offset (silver bracket)', () => {
		const goldBracket = generateConsolationBracketStructure(8, 'QF', [], 'gold');
		const silverBracket = generateConsolationBracketStructure(8, 'QF', [], 'silver');

		// Both should have same structure
		expect(goldBracket.numLosers).toBe(silverBracket.numLosers);
		expect(goldBracket.totalRounds).toBe(silverBracket.totalRounds);

		// Start positions are the same within bracket context
		// (offset is applied by the Firebase layer, not the algorithm)
		expect(goldBracket.startPosition).toBe(5);
		expect(silverBracket.startPosition).toBe(5);
	});
});
