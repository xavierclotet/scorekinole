import { describe, it, expect } from 'vitest';
import { PRESET_COLORS } from './constants';

describe('PRESET_COLORS', () => {
	it('has exactly 11 entries', () => {
		expect(PRESET_COLORS).toHaveLength(11);
	});

	it('all entries are valid 6-digit hex colors', () => {
		const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
		for (const color of PRESET_COLORS) {
			expect(color).toMatch(hexColorRegex);
		}
	});

	it('has no duplicate colors', () => {
		const unique = new Set(PRESET_COLORS);
		expect(unique.size).toBe(PRESET_COLORS.length);
	});
});
