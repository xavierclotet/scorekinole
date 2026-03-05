import { describe, it, expect } from 'vitest';
import { getPhaseConfig, getPhaseName } from './bracketPhaseConfig';

const bracket = {
	config: {
		earlyRounds: { gameMode: 'points', pointsToWin: 5, matchesToWin: 1 },
		semifinal: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
		final: { gameMode: 'points', pointsToWin: 9, matchesToWin: 2 }
	}
} as any;

describe('getPhaseConfig', () => {
	it('returns final config for the last round', () => {
		const result = getPhaseConfig(bracket, 4, 4);
		expect(result).toEqual({ gameMode: 'points', pointsToWin: 9, matchesToWin: 2 });
	});

	it('returns semifinal config for the penultimate round', () => {
		const result = getPhaseConfig(bracket, 3, 4);
		expect(result).toEqual({ gameMode: 'points', pointsToWin: 7, matchesToWin: 1 });
	});

	it('returns earlyRounds config for rounds before semifinal', () => {
		const result = getPhaseConfig(bracket, 1, 4);
		expect(result).toEqual({ gameMode: 'points', pointsToWin: 5, matchesToWin: 1 });
	});

	it('returns earlyRounds config for round 2 of 4', () => {
		const result = getPhaseConfig(bracket, 2, 4);
		expect(result).toEqual({ gameMode: 'points', pointsToWin: 5, matchesToWin: 1 });
	});

	it('returns semifinal config for third place match', () => {
		const result = getPhaseConfig(bracket, 4, 4, true);
		expect(result).toEqual({ gameMode: 'points', pointsToWin: 7, matchesToWin: 1 });
	});

	it('returns semifinal config for third place even if roundNumber equals totalRounds', () => {
		// isThirdPlace overrides the final detection
		const result = getPhaseConfig(bracket, 4, 4, true);
		expect(result.pointsToWin).toBe(7);
		expect(result.matchesToWin).toBe(1);
	});

	it('returns fallback config when bracket has no config', () => {
		const noConfigBracket = {} as any;
		const result = getPhaseConfig(noConfigBracket, 2, 3);
		expect(result).toEqual({ gameMode: 'points', pointsToWin: 7, matchesToWin: 1 });
	});

	it('returns fallback config when bracket.config is undefined', () => {
		const noConfigBracket = { config: undefined } as any;
		const result = getPhaseConfig(noConfigBracket, 1, 1);
		expect(result).toEqual({ gameMode: 'points', pointsToWin: 7, matchesToWin: 1 });
	});

	it('returns final config when bracket has only 1 round', () => {
		const result = getPhaseConfig(bracket, 1, 1);
		expect(result).toEqual({ gameMode: 'points', pointsToWin: 9, matchesToWin: 2 });
	});

	it('treats round 1 of 2 as semifinal', () => {
		const result = getPhaseConfig(bracket, 1, 2);
		expect(result).toEqual({ gameMode: 'points', pointsToWin: 7, matchesToWin: 1 });
	});
});

describe('getPhaseName', () => {
	it('returns Final for the last round', () => {
		expect(getPhaseName(4, 4)).toBe('Final');
	});

	it('returns Semifinales for the penultimate round', () => {
		expect(getPhaseName(3, 4)).toBe('Semifinales');
	});

	it('returns Cuartos for totalRounds - 2', () => {
		expect(getPhaseName(2, 4)).toBe('Cuartos');
	});

	it('returns Octavos for totalRounds - 3', () => {
		expect(getPhaseName(1, 4)).toBe('Octavos');
	});

	it('returns Ronda N for rounds earlier than Octavos', () => {
		expect(getPhaseName(1, 5)).toBe('Ronda 1');
	});

	it('returns 3º/4º Puesto for third place match', () => {
		expect(getPhaseName(4, 4, true)).toBe('3º/4º Puesto');
	});
});
