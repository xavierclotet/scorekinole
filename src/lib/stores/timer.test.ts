import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock vibration utility
vi.mock('$lib/utils/vibration', () => ({
	vibratePattern: vi.fn()
}));

import { get } from 'svelte/store';
import {
	timerRunning,
	timeRemaining,
	timerDisplay,
	timerWarning,
	timerCritical,
	timerTimeout,
	startTimer,
	stopTimer,
	toggleTimer,
	resetTimer,
	resetTimerFromSettings,
	cleanupTimer
} from './timer';

beforeEach(() => {
	vi.useFakeTimers();
	// Reset state
	stopTimer();
	timeRemaining.set(0);
	timerRunning.set(false);
});

afterEach(() => {
	stopTimer();
	vi.useRealTimers();
});

describe('timer store', () => {
	// 1. resetTimer: sets timeRemaining, stops timer
	it('resetTimer sets timeRemaining and stops the timer', () => {
		timerRunning.set(true);
		resetTimer(300);

		expect(get(timeRemaining)).toBe(300);
		expect(get(timerRunning)).toBe(false);
	});

	// 2. resetTimerFromSettings: converts minutes+seconds
	it('resetTimerFromSettings converts minutes and seconds to total seconds', () => {
		resetTimerFromSettings(10, 30);
		expect(get(timeRemaining)).toBe(630);
	});

	// 3. timerDisplay: formats 600 as "10:00"
	it('timerDisplay formats 600 seconds as "10:00"', () => {
		timeRemaining.set(600);
		expect(get(timerDisplay)).toBe('10:00');
	});

	// 4. timerDisplay: formats 65 as "01:05"
	it('timerDisplay formats 65 seconds as "01:05"', () => {
		timeRemaining.set(65);
		expect(get(timerDisplay)).toBe('01:05');
	});

	// 5. timerDisplay: formats 0 as "00:00"
	it('timerDisplay formats 0 seconds as "00:00"', () => {
		timeRemaining.set(0);
		expect(get(timerDisplay)).toBe('00:00');
	});

	// 6. timerWarning: true at 45s, false at 61s, false at 29s
	it('timerWarning is true when timeRemaining is in [30, 60) range', () => {
		timeRemaining.set(45);
		expect(get(timerWarning)).toBe(true);

		timeRemaining.set(61);
		expect(get(timerWarning)).toBe(false);

		timeRemaining.set(29);
		expect(get(timerWarning)).toBe(false);
	});

	// 7. timerCritical: true at 15s, false at 31s, false at 0s
	it('timerCritical is true when timeRemaining is in (0, 30) range', () => {
		timeRemaining.set(15);
		expect(get(timerCritical)).toBe(true);

		timeRemaining.set(31);
		expect(get(timerCritical)).toBe(false);

		timeRemaining.set(0);
		expect(get(timerCritical)).toBe(false);
	});

	// 8. timerTimeout: true at 0s, false at 1s
	it('timerTimeout is true only when timeRemaining equals 0', () => {
		timeRemaining.set(0);
		expect(get(timerTimeout)).toBe(true);

		timeRemaining.set(1);
		expect(get(timerTimeout)).toBe(false);
	});

	// 9. startTimer: sets timerRunning=true, decrements after 1 tick
	it('startTimer sets timerRunning to true and decrements timeRemaining each second', () => {
		timeRemaining.set(10);
		startTimer();

		expect(get(timerRunning)).toBe(true);
		expect(get(timeRemaining)).toBe(10);

		vi.advanceTimersByTime(1000);
		expect(get(timeRemaining)).toBe(9);

		vi.advanceTimersByTime(1000);
		expect(get(timeRemaining)).toBe(8);
	});

	// 10. stopTimer: sets timerRunning=false
	it('stopTimer sets timerRunning to false and halts countdown', () => {
		timeRemaining.set(10);
		startTimer();
		expect(get(timerRunning)).toBe(true);

		stopTimer();
		expect(get(timerRunning)).toBe(false);

		const remaining = get(timeRemaining);
		vi.advanceTimersByTime(3000);
		expect(get(timeRemaining)).toBe(remaining);
	});

	// 11. toggleTimer: starts if stopped, stops if running
	it('toggleTimer starts the timer if stopped, stops it if running', () => {
		timeRemaining.set(60);

		// Toggle on
		toggleTimer();
		expect(get(timerRunning)).toBe(true);

		vi.advanceTimersByTime(1000);
		expect(get(timeRemaining)).toBe(59);

		// Toggle off
		toggleTimer();
		expect(get(timerRunning)).toBe(false);

		const remaining = get(timeRemaining);
		vi.advanceTimersByTime(2000);
		expect(get(timeRemaining)).toBe(remaining);
	});

	// 12. Timer stops at 0 and triggers timeout
	it('timer stops automatically at 0 and sets timerRunning to false', () => {
		timeRemaining.set(2);
		startTimer();

		vi.advanceTimersByTime(1000);
		expect(get(timeRemaining)).toBe(1);
		expect(get(timerRunning)).toBe(true);

		vi.advanceTimersByTime(1000);
		expect(get(timeRemaining)).toBe(0);
		expect(get(timerRunning)).toBe(false);
		expect(get(timerTimeout)).toBe(true);

		// Ensure it doesn't go negative
		vi.advanceTimersByTime(3000);
		expect(get(timeRemaining)).toBe(0);
	});
});
