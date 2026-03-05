import { describe, it, expect } from 'vitest';
import {
	normalizeHex,
	isColorDark,
	getLuminance,
	getContrastColor
} from './colors';

// ============================================================================
// normalizeHex
// ============================================================================

describe('normalizeHex', () => {
	it('passes through valid 6-char hex', () => {
		expect(normalizeHex('#ff0000')).toBe('ff0000');
		expect(normalizeHex('00ff00')).toBe('00ff00');
		expect(normalizeHex('#AABBCC')).toBe('AABBCC');
	});

	it('expands shorthand 3-char hex', () => {
		expect(normalizeHex('#abc')).toBe('aabbcc');
		expect(normalizeHex('f00')).toBe('ff0000');
		expect(normalizeHex('#FFF')).toBe('FFFFFF');
		expect(normalizeHex('000')).toBe('000000');
	});

	it('returns null for invalid hex', () => {
		expect(normalizeHex('#xyz')).toBeNull();
		expect(normalizeHex('#gggggg')).toBeNull();
		expect(normalizeHex('')).toBeNull();
		expect(normalizeHex('#12')).toBeNull();
		expect(normalizeHex('#1234567')).toBeNull();
		expect(normalizeHex('hello')).toBeNull();
	});

	it('handles mixed case', () => {
		expect(normalizeHex('#aAbBcC')).toBe('aAbBcC');
		expect(normalizeHex('AbC')).toBe('AAbbCC');
	});
});

// ============================================================================
// isColorDark
// ============================================================================

describe('isColorDark', () => {
	it('returns false for undefined/empty', () => {
		expect(isColorDark(undefined)).toBe(false);
		expect(isColorDark('')).toBe(false);
	});

	it('black is dark', () => {
		expect(isColorDark('#000000')).toBe(true);
	});

	it('white is not dark', () => {
		expect(isColorDark('#ffffff')).toBe(false);
	});

	it('red is not very dark', () => {
		expect(isColorDark('#ff0000')).toBe(false);
	});

	it('dark navy blue is dark', () => {
		expect(isColorDark('#000033')).toBe(true);
		expect(isColorDark('#000066')).toBe(true);
	});

	// BUG 3 REGRESSION: short hex must work
	it('handles shorthand hex (#000 = black)', () => {
		expect(isColorDark('#000')).toBe(true);
	});

	it('handles shorthand hex (#fff = white)', () => {
		expect(isColorDark('#fff')).toBe(false);
	});

	// BUG 3 REGRESSION: invalid hex must not produce NaN
	it('returns false for invalid hex (not NaN)', () => {
		expect(isColorDark('#xyz')).toBe(false);
		expect(isColorDark('nothex')).toBe(false);
	});
});

// ============================================================================
// getLuminance
// ============================================================================

describe('getLuminance', () => {
	it('returns 0.5 for undefined/empty', () => {
		expect(getLuminance(undefined)).toBe(0.5);
		expect(getLuminance('')).toBe(0.5);
	});

	it('returns 0 for black', () => {
		expect(getLuminance('#000000')).toBe(0);
	});

	it('returns 1 for white', () => {
		expect(getLuminance('#ffffff')).toBe(1);
	});

	it('returns ~0.5 for middle gray', () => {
		const lum = getLuminance('#808080');
		expect(lum).toBeGreaterThan(0.45);
		expect(lum).toBeLessThan(0.55);
	});

	// BUG 3 REGRESSION
	it('handles shorthand hex', () => {
		expect(getLuminance('#000')).toBe(0);
		expect(getLuminance('#fff')).toBe(1);
	});

	it('returns 0.5 for invalid hex', () => {
		expect(getLuminance('#xyz')).toBe(0.5);
		expect(getLuminance('invalid')).toBe(0.5);
	});

	it('pure red luminance is dominated by green coefficient', () => {
		const redLum = getLuminance('#ff0000');
		const greenLum = getLuminance('#00ff00');
		// Green coefficient (0.587) > Red coefficient (0.299)
		expect(greenLum).toBeGreaterThan(redLum);
	});
});

// ============================================================================
// getContrastColor
// ============================================================================

describe('getContrastColor', () => {
	it('returns black for undefined/empty', () => {
		expect(getContrastColor(undefined)).toBe('#000000');
		expect(getContrastColor('')).toBe('#000000');
	});

	it('returns black text on white background', () => {
		expect(getContrastColor('#ffffff')).toBe('#000000');
	});

	it('returns white text on black background', () => {
		expect(getContrastColor('#000000')).toBe('#ffffff');
	});

	it('returns white text on dark blue', () => {
		expect(getContrastColor('#000080')).toBe('#ffffff');
	});

	it('returns black text on yellow', () => {
		expect(getContrastColor('#ffff00')).toBe('#000000');
	});

	// BUG 3 REGRESSION
	it('handles shorthand hex', () => {
		expect(getContrastColor('#fff')).toBe('#000000');
		expect(getContrastColor('#000')).toBe('#ffffff');
	});

	it('returns white for invalid hex (luminance defaults to 0.5, not > 0.5)', () => {
		expect(getContrastColor('#xyz')).toBe('#ffffff');
	});
});
