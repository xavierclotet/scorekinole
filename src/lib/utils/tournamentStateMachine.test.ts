import { describe, it, expect, vi, beforeEach } from 'vitest';

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
	canEditField,
	transitionTournament
} from './tournamentStateMachine';
import type { TournamentStatus, Tournament } from '$lib/types/tournament';
import { getTournament, updateTournament } from '$lib/firebase/tournaments';
import { generateBracket } from '$lib/firebase/tournamentBracket';
import { calculateFinalPositions, calculateFinalPositionsForTournament } from '$lib/firebase/tournamentRanking';

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

// ============================================================================
// transitionTournament — mocked edge cases
// ============================================================================

describe('transitionTournament', () => {
	const mockGetTournament = vi.mocked(getTournament);
	const mockUpdateTournament = vi.mocked(updateTournament);
	const mockGenerateBracket = vi.mocked(generateBracket);
	const mockCalculateFinalPositions = vi.mocked(calculateFinalPositions);
	const mockCalculateFinalPositionsForTournament = vi.mocked(calculateFinalPositionsForTournament);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns false when tournament not found', async () => {
		mockGetTournament.mockResolvedValue(null);
		const result = await transitionTournament('non-existent', 'GROUP_STAGE');
		expect(result).toBe(false);
	});

	it('returns false for invalid transition (DRAFT → COMPLETED)', async () => {
		mockGetTournament.mockResolvedValue({
			id: 't1',
			status: 'DRAFT',
			participants: []
		} as unknown as Tournament);
		const result = await transitionTournament('t1', 'COMPLETED');
		expect(result).toBe(false);
		expect(mockUpdateTournament).not.toHaveBeenCalled();
	});

	it('cancels a DRAFT tournament via simple status update', async () => {
		mockGetTournament.mockResolvedValue({
			id: 't1',
			status: 'DRAFT',
			participants: []
		} as unknown as Tournament);
		mockUpdateTournament.mockResolvedValue(true);

		const result = await transitionTournament('t1', 'CANCELLED');
		expect(result).toBe(true);
		expect(mockUpdateTournament).toHaveBeenCalledWith('t1', { status: 'CANCELLED' });
	});

	it('cancels a GROUP_STAGE tournament', async () => {
		mockGetTournament.mockResolvedValue({
			id: 't1',
			status: 'GROUP_STAGE',
			participants: []
		} as unknown as Tournament);
		mockUpdateTournament.mockResolvedValue(true);

		const result = await transitionTournament('t1', 'CANCELLED');
		expect(result).toBe(true);
	});

	it('FINAL_STAGE → COMPLETED fails when final match not complete', async () => {
		mockGetTournament.mockResolvedValue({
			id: 't1',
			status: 'FINAL_STAGE',
			participants: [],
			finalStage: {
				goldBracket: {
					rounds: [
						{
							matches: [
								{ status: 'PENDING', participantA: 'p1', participantB: 'p2' }
							]
						}
					]
				}
			}
		} as unknown as Tournament);

		const result = await transitionTournament('t1', 'COMPLETED');
		expect(result).toBe(false);
		// Should not call updateTournament since final isn't complete
	});

	it('FINAL_STAGE → COMPLETED succeeds when final match is completed', async () => {
		mockGetTournament.mockResolvedValue({
			id: 't1',
			status: 'FINAL_STAGE',
			participants: [],
			finalStage: {
				goldBracket: {
					rounds: [
						{
							matches: [
								{ status: 'COMPLETED', participantA: 'p1', participantB: 'p2', winner: 'p1' }
							]
						}
					]
				}
			}
		} as unknown as Tournament);
		mockCalculateFinalPositions.mockResolvedValue({} as any);
		mockUpdateTournament.mockResolvedValue(true);

		const result = await transitionTournament('t1', 'COMPLETED');
		expect(result).toBe(true);
		expect(mockUpdateTournament).toHaveBeenCalledWith('t1', expect.objectContaining({
			status: 'COMPLETED',
			completedAt: expect.any(Number)
		}));
	});

	it('FINAL_STAGE → COMPLETED also works with WALKOVER final', async () => {
		mockGetTournament.mockResolvedValue({
			id: 't1',
			status: 'FINAL_STAGE',
			participants: [],
			finalStage: {
				goldBracket: {
					rounds: [
						{
							matches: [
								{ status: 'WALKOVER', participantA: 'p1', participantB: 'p2', winner: 'p1' }
							]
						}
					]
				}
			}
		} as unknown as Tournament);
		mockCalculateFinalPositions.mockResolvedValue({} as any);
		mockUpdateTournament.mockResolvedValue(true);

		const result = await transitionTournament('t1', 'COMPLETED');
		expect(result).toBe(true);
	});

	it('TRANSITION → COMPLETED for GROUP_ONLY calls calculateFinalPositionsForTournament', async () => {
		const participants = [
			{ id: 'p1', name: 'P1', status: 'ACTIVE' },
			{ id: 'p2', name: 'P2', status: 'ACTIVE' }
		];
		mockGetTournament.mockResolvedValue({
			id: 't1',
			status: 'TRANSITION',
			phaseType: 'GROUP_ONLY',
			participants
		} as unknown as Tournament);
		mockCalculateFinalPositionsForTournament.mockReturnValue(participants as any);
		mockUpdateTournament.mockResolvedValue(true);

		const result = await transitionTournament('t1', 'COMPLETED');
		expect(result).toBe(true);
		expect(mockCalculateFinalPositionsForTournament).toHaveBeenCalled();
		expect(mockUpdateTournament).toHaveBeenCalledWith('t1', expect.objectContaining({
			status: 'COMPLETED',
			participants: expect.any(Array)
		}));
	});

	it('GROUP_STAGE → TRANSITION fails if there are incomplete matches', async () => {
		mockGetTournament.mockResolvedValue({
			id: 't1',
			status: 'GROUP_STAGE',
			participants: [],
			groupStage: {
				groups: [{
					name: 'Group A',
					schedule: [
						{
							matches: [
								{ status: 'COMPLETED' },
								{ status: 'PENDING' }  // Not complete!
							]
						}
					]
				}]
			}
		} as unknown as Tournament);

		const result = await transitionTournament('t1', 'TRANSITION');
		expect(result).toBe(false);
	});

	it('GROUP_STAGE → TRANSITION succeeds when all matches are COMPLETED or WALKOVER', async () => {
		mockGetTournament.mockResolvedValue({
			id: 't1',
			status: 'GROUP_STAGE',
			participants: [],
			groupStage: {
				groups: [{
					name: 'Group A',
					schedule: [
						{
							matches: [
								{ status: 'COMPLETED' },
								{ status: 'WALKOVER' }
							]
						}
					]
				}]
			}
		} as unknown as Tournament);
		mockUpdateTournament.mockResolvedValue(true);

		const result = await transitionTournament('t1', 'TRANSITION');
		expect(result).toBe(true);
		expect(mockUpdateTournament).toHaveBeenCalledWith('t1', expect.objectContaining({
			status: 'TRANSITION'
		}));
	});
});
