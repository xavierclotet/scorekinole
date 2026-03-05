import { describe, it, expect } from 'vitest';
import {
	validateTournament,
	validateParticipants,
	getPowerOfTwoSuggestions,
	validateTableAssignment
} from './tournamentValidation';
import type { TournamentParticipant } from '$lib/types/tournament';

// ============================================================================
// Helper
// ============================================================================

function createParticipants(count: number, gameType: 'singles' | 'doubles' = 'singles'): TournamentParticipant[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i + 1}`,
		name: `Player ${i + 1}`,
		type: 'GUEST' as const,
		status: 'ACTIVE' as const,
		...(gameType === 'doubles' ? { partner: `partner-${i + 1}` } : {})
	}));
}

// ============================================================================
// validateTournament
// ============================================================================

describe('validateTournament', () => {
	it('requires name', () => {
		const result = validateTournament({ gameType: 'singles', gameMode: 'rounds', matchesToWin: 1, numTables: 1, phaseType: 'ONE_PHASE' });
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('nombre'))).toBe(true);
	});

	it('requires gameType', () => {
		const result = validateTournament({ name: 'Test', gameMode: 'rounds', matchesToWin: 1, numTables: 1, phaseType: 'ONE_PHASE' });
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('tipo de juego'))).toBe(true);
	});

	it('requires gameMode', () => {
		const result = validateTournament({ name: 'Test', gameType: 'singles', matchesToWin: 1, numTables: 1, phaseType: 'ONE_PHASE' });
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('modo de juego'))).toBe(true);
	});

	it('requires matchesToWin', () => {
		const result = validateTournament({ name: 'Test', gameType: 'singles', gameMode: 'rounds', numTables: 1, phaseType: 'ONE_PHASE' });
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('partidos a ganar'))).toBe(true);
	});

	it('requires numTables >= 1', () => {
		const result = validateTournament({ name: 'Test', gameType: 'singles', gameMode: 'rounds', matchesToWin: 1, numTables: 0, phaseType: 'ONE_PHASE' });
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('mesa'))).toBe(true);
	});

	it('requires phaseType', () => {
		const result = validateTournament({ name: 'Test', gameType: 'singles', gameMode: 'rounds', matchesToWin: 1, numTables: 1 });
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('tipo de fase'))).toBe(true);
	});

	it('valid ONE_PHASE tournament passes', () => {
		const result = validateTournament({
			name: 'Test',
			gameType: 'singles',
			gameMode: 'rounds',
			roundsToPlay: 4,
			matchesToWin: 1,
			numTables: 2,
			phaseType: 'ONE_PHASE'
		});
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it('TWO_PHASE requires groupStageType', () => {
		const result = validateTournament({
			name: 'Test',
			gameType: 'singles',
			gameMode: 'rounds',
			roundsToPlay: 4,
			matchesToWin: 1,
			numTables: 2,
			phaseType: 'TWO_PHASE'
		});
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('fase de grupos'))).toBe(true);
	});

	it('TWO_PHASE + ROUND_ROBIN requires numGroups', () => {
		const result = validateTournament({
			name: 'Test',
			gameType: 'singles',
			gameMode: 'rounds',
			roundsToPlay: 4,
			matchesToWin: 1,
			numTables: 2,
			phaseType: 'TWO_PHASE',
			groupStageType: 'ROUND_ROBIN'
		});
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('número de grupos'))).toBe(true);
	});

	it('TWO_PHASE + SWISS requires >= 3 rounds', () => {
		const result = validateTournament({
			name: 'Test',
			gameType: 'singles',
			gameMode: 'rounds',
			roundsToPlay: 4,
			matchesToWin: 1,
			numTables: 2,
			phaseType: 'TWO_PHASE',
			groupStageType: 'SWISS',
			numSwissRounds: 2
		});
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('suizo'))).toBe(true);
	});

	it('points mode requires pointsToWin >= 1', () => {
		const result = validateTournament({
			name: 'Test',
			gameType: 'singles',
			gameMode: 'points',
			pointsToWin: 0,
			matchesToWin: 1,
			numTables: 2,
			phaseType: 'ONE_PHASE'
		});
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('puntos para ganar'))).toBe(true);
	});

	it('rounds mode requires roundsToPlay >= 1', () => {
		const result = validateTournament({
			name: 'Test',
			gameType: 'singles',
			gameMode: 'rounds',
			roundsToPlay: 0,
			matchesToWin: 1,
			numTables: 2,
			phaseType: 'ONE_PHASE'
		});
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('número de rondas'))).toBe(true);
	});

	it('ranking without tier produces warning', () => {
		const result = validateTournament({
			name: 'Test',
			gameType: 'singles',
			gameMode: 'rounds',
			roundsToPlay: 4,
			matchesToWin: 1,
			numTables: 2,
			phaseType: 'ONE_PHASE',
			rankingConfig: { enabled: true }
		});
		expect(result.warnings.some(w => w.includes('categoría'))).toBe(true);
	});
});

// ============================================================================
// validateParticipants
// ============================================================================

describe('validateParticipants', () => {
	it('requires at least 4 participants', () => {
		const result = validateParticipants(createParticipants(3), { phaseType: 'ONE_PHASE' });
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('4 participantes'))).toBe(true);
	});

	it('4 participants is valid', () => {
		const result = validateParticipants(createParticipants(4), { phaseType: 'ONE_PHASE' });
		expect(result.valid).toBe(true);
	});

	it('warns about duplicate names', () => {
		const participants = createParticipants(4);
		participants[2].name = 'Player 1'; // Duplicate of first player
		const result = validateParticipants(participants, { phaseType: 'ONE_PHASE' });
		expect(result.warnings.some(w => w.includes('duplicados'))).toBe(true);
	});

	it('warns about BYEs for non-power-of-2 in ONE_PHASE', () => {
		const result = validateParticipants(createParticipants(5), { phaseType: 'ONE_PHASE' });
		expect(result.warnings.some(w => w.includes('bye'))).toBe(true);
	});

	it('no BYE warning for power of 2', () => {
		const result = validateParticipants(createParticipants(8), { phaseType: 'ONE_PHASE' });
		expect(result.warnings.filter(w => w.includes('bye'))).toHaveLength(0);
	});

	it('validates doubles need partners', () => {
		const participants = createParticipants(4); // No partners
		const result = validateParticipants(participants, { gameType: 'doubles', phaseType: 'ONE_PHASE' });
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('pareja'))).toBe(true);
	});

	it('doubles with partners pass', () => {
		const participants = createParticipants(4, 'doubles');
		const result = validateParticipants(participants, { gameType: 'doubles', phaseType: 'ONE_PHASE' });
		expect(result.errors.filter(e => e.includes('pareja'))).toHaveLength(0);
	});

	it('RR validates not enough participants for groups', () => {
		const result = validateParticipants(
			createParticipants(4),
			{ phaseType: 'TWO_PHASE', groupStageType: 'ROUND_ROBIN', numGroups: 3 }
		);
		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.includes('suficientes participantes'))).toBe(true);
	});
});

// ============================================================================
// getPowerOfTwoSuggestions
// ============================================================================

describe('getPowerOfTwoSuggestions', () => {
	it('returns next power of 2 for non-powers', () => {
		const suggestions = getPowerOfTwoSuggestions(5);
		expect(suggestions[0]).toBe(8);
	});

	it('returns same value if already power of 2', () => {
		const suggestions = getPowerOfTwoSuggestions(8);
		expect(suggestions[0]).toBe(8);
	});

	it('returns up to 2 suggestions', () => {
		const suggestions = getPowerOfTwoSuggestions(5);
		expect(suggestions).toHaveLength(2);
		expect(suggestions[0]).toBe(8);
		expect(suggestions[1]).toBe(16);
	});

	it('handles small numbers', () => {
		const suggestions = getPowerOfTwoSuggestions(1);
		expect(suggestions[0]).toBe(2);
	});

	it('handles larger numbers', () => {
		const suggestions = getPowerOfTwoSuggestions(17);
		expect(suggestions[0]).toBe(32);
	});
});

// ============================================================================
// validateTableAssignment
// ============================================================================

describe('validateTableAssignment', () => {
	it('valid table number passes', () => {
		const result = validateTableAssignment(3, 5, [1, 2]);
		expect(result.valid).toBe(true);
	});

	it('table 0 is invalid', () => {
		const result = validateTableAssignment(0, 5, []);
		expect(result.valid).toBe(false);
	});

	it('table > total is invalid', () => {
		const result = validateTableAssignment(6, 5, []);
		expect(result.valid).toBe(false);
	});

	it('warns if table is occupied', () => {
		const result = validateTableAssignment(2, 5, [2, 3]);
		expect(result.valid).toBe(true);
		expect(result.warnings.some(w => w.includes('ocupada'))).toBe(true);
	});

	it('no warning if table is free', () => {
		const result = validateTableAssignment(4, 5, [2, 3]);
		expect(result.warnings).toHaveLength(0);
	});
});
