/**
 * Screenshot — lightbox body-scroll-lock tests.
 *
 * Pure mirrors of the component's zoom $effect (same pattern as
 * LoginModal.errorHandling.test.ts), covering the bug fixed:
 *
 * Capturing `prev = document.body.style.overflow` before locking can save a
 * transient 'hidden' owned by ANOTHER locker (bits-ui dropdowns restore the
 * body style with a ~24ms delay after closing). Restoring that stale value on
 * lightbox close re-locks the body permanently: the wheel/scrollbar die while
 * programmatic scrollIntoView (the "Scroll to explore" button) keeps working.
 */
import { describe, it, expect } from 'vitest';

type FakeBody = { overflow: string };

// --- Mirror of the OLD effect: capture-and-restore previous value ---
function oldLightboxLock(body: FakeBody): () => void {
	const prev = body.overflow;
	body.overflow = 'hidden';
	return () => {
		body.overflow = prev;
	};
}

// --- Mirror of the NEW effect: always clear on release ---
function newLightboxLock(body: FakeBody): () => void {
	body.overflow = 'hidden';
	return () => {
		body.overflow = '';
	};
}

/**
 * Simulates the bits-ui interplay on the landing:
 * 1. dropdown open  → body.overflow = 'hidden'
 * 2. dropdown close → cleanup DELAYED ~24ms (body still 'hidden')
 * 3. user zooms screenshot within that window → lock acquires
 * 4. bits-ui delayed cleanup fires → body style reset to ''
 * 5. user closes lightbox → lock releases
 */
function runDropdownInterplay(lock: (body: FakeBody) => () => void): string {
	const body: FakeBody = { overflow: '' };
	body.overflow = 'hidden'; // 1-2: dropdown closed, cleanup still pending
	const release = lock(body); // 3: zoom while body still locked
	body.overflow = ''; // 4: bits-ui delayed cleanup resets body style
	release(); // 5: close lightbox
	return body.overflow;
}

describe('Screenshot lightbox scroll lock', () => {
	it('locks the body while zoomed', () => {
		const body: FakeBody = { overflow: '' };
		newLightboxLock(body);
		expect(body.overflow).toBe('hidden');
	});

	it('unlocks the body after closing in the normal flow', () => {
		const body: FakeBody = { overflow: '' };
		const release = newLightboxLock(body);
		release();
		expect(body.overflow).toBe('');
	});

	it('OLD behavior leaked a permanent lock after the dropdown interplay (documents the bug)', () => {
		expect(runDropdownInterplay(oldLightboxLock)).toBe('hidden');
	});

	it('NEW behavior leaves the body scrollable after the dropdown interplay', () => {
		expect(runDropdownInterplay(newLightboxLock)).toBe('');
	});
});
