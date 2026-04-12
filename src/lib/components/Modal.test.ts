/**
 * Unit tests for Modal.svelte pure logic.
 *
 * No DOM / Svelte mount — tests mirror the inline logic from the component.
 */
import { describe, it, expect, vi } from 'vitest';

// ─── Mirrors maxWidth style computation (Modal.svelte:57) ─────────────────────

function buildMaxWidthStyle(maxWidth?: string): string | undefined {
	return maxWidth ? `max-width: min(${maxWidth}, 95%)` : undefined;
}

// ─── Mirrors handleOverlayClick (Modal.svelte) ───────────────────────────────

function handleOverlayClick(onClose: () => void) {
	onClose();
}

// ─── Mirrors handleKeydown logic (Modal.svelte) ──────────────────────────────

function handleKeydown(key: string, isOpen: boolean, onClose: () => void) {
	if (key === 'Escape' && isOpen) {
		onClose();
	}
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildMaxWidthStyle', () => {
	it('returns undefined when maxWidth is not provided', () => {
		expect(buildMaxWidthStyle()).toBeUndefined();
		expect(buildMaxWidthStyle(undefined)).toBeUndefined();
	});

	it('returns a min() expression capped at 95% when maxWidth is provided', () => {
		expect(buildMaxWidthStyle('300px')).toBe('max-width: min(300px, 95%)');
	});

	it('works with any CSS length unit', () => {
		expect(buildMaxWidthStyle('50%')).toBe('max-width: min(50%, 95%)');
		expect(buildMaxWidthStyle('20rem')).toBe('max-width: min(20rem, 95%)');
		expect(buildMaxWidthStyle('400px')).toBe('max-width: min(400px, 95%)');
	});

	it('empty string is treated as falsy → returns undefined', () => {
		expect(buildMaxWidthStyle('')).toBeUndefined();
	});
});

describe('handleOverlayClick', () => {
	it('calls onClose when overlay is clicked', () => {
		const onClose = vi.fn();
		handleOverlayClick(onClose);
		expect(onClose).toHaveBeenCalledOnce();
	});
});

describe('handleKeydown', () => {
	it('calls onClose when Escape is pressed and modal is open', () => {
		const onClose = vi.fn();
		handleKeydown('Escape', true, onClose);
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('does NOT call onClose when Escape is pressed but modal is closed', () => {
		const onClose = vi.fn();
		handleKeydown('Escape', false, onClose);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('does NOT call onClose for non-Escape keys even when open', () => {
		const onClose = vi.fn();
		handleKeydown('Enter', true, onClose);
		handleKeydown('ArrowDown', true, onClose);
		handleKeydown(' ', true, onClose);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('does NOT call onClose when key is not Escape and modal is closed', () => {
		const onClose = vi.fn();
		handleKeydown('Tab', false, onClose);
		expect(onClose).not.toHaveBeenCalled();
	});
});
