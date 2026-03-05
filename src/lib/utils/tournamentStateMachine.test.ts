import { describe, it, expect, vi } from 'vitest';

// Mock Firebase modules that tournamentStateMachine.ts imports transitively
vi.mock('$lib/firebase/tournaments', () => ({
	getTournament: vi.fn(),
	updateTournament: vi.fn()
}));
vi.mock('$lib/firebase/tournamentBracket', () => ({
	generateBracket: vi.fn()
}));
vi.mock('$lib/firebase/tournamentRanking', () => ({
	calculateFinalPositions: vi.fn(),
	calculateFinalPositionsForTournament: vi.fn(),
	syncParticipantRankings: vi.fn()
}));

import {
	canTransition,
	getEditableFields,
	canEditField
} from './tournamentStateMachine';
import type { TournamentStatus } from '$lib/types/tournament';

// ============================================================================
// canTransition
// ============================================================================

describe('canTransition', () => {
	describe('valid transitions', () => {
		it('DRAFT → GROUP_STAGE', () => {
			expect(canTransition('DRAFT', 'GROUP_STAGE')).toBe(true);
		});

		it('DRAFT → FINAL_STAGE', () => {
			expect(canTransition('DRAFT', 'FINAL_STAGE')).toBe(true);
		});

		it('DRAFT → CANCELLED', () => {
			expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
		});

		it('GROUP_STAGE → TRANSITION', () => {
			expect(canTransition('GROUP_STAGE', 'TRANSITION')).toBe(true);
		});

		it('GROUP_STAGE → CANCELLED', () => {
			expect(canTransition('GROUP_STAGE', 'CANCELLED')).toBe(true);
		});

		it('TRANSITION → FINAL_STAGE', () => {
			expect(canTransition('TRANSITION', 'FINAL_STAGE')).toBe(true);
		});

		it('TRANSITION → COMPLETED', () => {
			expect(canTransition('TRANSITION', 'COMPLETED')).toBe(true);
		});

		it('TRANSITION → CANCELLED', () => {
			expect(canTransition('TRANSITION', 'CANCELLED')).toBe(true);
		});

		it('FINAL_STAGE → COMPLETED', () => {
			expect(canTransition('FINAL_STAGE', 'COMPLETED')).toBe(true);
		});

		it('FINAL_STAGE → CANCELLED', () => {
			expect(canTransition('FINAL_STAGE', 'CANCELLED')).toBe(true);
		});
	});

	describe('invalid transitions', () => {
		it('DRAFT → COMPLETED', () => {
			expect(canTransition('DRAFT', 'COMPLETED')).toBe(false);
		});

		it('DRAFT → TRANSITION', () => {
			expect(canTransition('DRAFT', 'TRANSITION')).toBe(false);
		});

		it('COMPLETED → anything', () => {
			const statuses: TournamentStatus[] = ['DRAFT', 'GROUP_STAGE', 'TRANSITION', 'FINAL_STAGE', 'CANCELLED'];
			for (const s of statuses) {
				expect(canTransition('COMPLETED', s)).toBe(false);
			}
		});

		it('CANCELLED → anything', () => {
			const statuses: TournamentStatus[] = ['DRAFT', 'GROUP_STAGE', 'TRANSITION', 'FINAL_STAGE', 'COMPLETED'];
			for (const s of statuses) {
				expect(canTransition('CANCELLED', s)).toBe(false);
			}
		});

		it('GROUP_STAGE → DRAFT (no going back)', () => {
			expect(canTransition('GROUP_STAGE', 'DRAFT')).toBe(false);
		});

		it('FINAL_STAGE → GROUP_STAGE (no going back)', () => {
			expect(canTransition('FINAL_STAGE', 'GROUP_STAGE')).toBe(false);
		});

		it('same state is not a valid transition', () => {
			expect(canTransition('DRAFT', 'DRAFT')).toBe(false);
			expect(canTransition('GROUP_STAGE', 'GROUP_STAGE')).toBe(false);
		});
	});
});

// ============================================================================
// getEditableFields
// ============================================================================

describe('getEditableFields', () => {
	it('DRAFT has many editable fields', () => {
		const fields = getEditableFields('DRAFT');
		expect(fields).toContain('name');
		expect(fields).toContain('participants');
		expect(fields).toContain('gameType');
		expect(fields).toContain('gameMode');
		expect(fields).toContain('numTables');
		expect(fields).toContain('rankingConfig');
		expect(fields.length).toBeGreaterThan(10);
	});

	it('GROUP_STAGE allows match results', () => {
		const fields = getEditableFields('GROUP_STAGE');
		expect(fields).toContain('match results');
		expect(fields).not.toContain('name');
		expect(fields).not.toContain('participants');
	});

	it('TRANSITION allows qualifiers', () => {
		const fields = getEditableFields('TRANSITION');
		expect(fields).toContain('qualifiers');
	});

	it('FINAL_STAGE allows match results', () => {
		const fields = getEditableFields('FINAL_STAGE');
		expect(fields).toContain('match results');
	});

	it('COMPLETED has no editable fields', () => {
		expect(getEditableFields('COMPLETED')).toHaveLength(0);
	});

	it('CANCELLED has no editable fields', () => {
		expect(getEditableFields('CANCELLED')).toHaveLength(0);
	});
});

// ============================================================================
// canEditField
// ============================================================================

describe('canEditField', () => {
	it('can edit name in DRAFT', () => {
		expect(canEditField('DRAFT', 'name')).toBe(true);
	});

	it('cannot edit name in GROUP_STAGE', () => {
		expect(canEditField('GROUP_STAGE', 'name')).toBe(false);
	});

	it('can edit match results in GROUP_STAGE', () => {
		expect(canEditField('GROUP_STAGE', 'match results')).toBe(true);
	});

	it('cannot edit anything in COMPLETED', () => {
		expect(canEditField('COMPLETED', 'name')).toBe(false);
		expect(canEditField('COMPLETED', 'match results')).toBe(false);
	});

	it('can edit qualifiers in TRANSITION', () => {
		expect(canEditField('TRANSITION', 'qualifiers')).toBe(true);
	});

	it('cannot edit qualifiers in DRAFT', () => {
		expect(canEditField('DRAFT', 'qualifiers')).toBe(false);
	});
});
