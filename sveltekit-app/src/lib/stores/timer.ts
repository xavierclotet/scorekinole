import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Timer state
export const timerRunning = writable<boolean>(false);
export const timeRemaining = writable<number>(0);

// Derived store for formatted timer display (MM:SS)
export const timerDisplay = derived(
    timeRemaining,
    ($time) => {
        const mins = Math.floor($time / 60);
        const secs = $time % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
);

// Derived store to check if timer is in warning state (< 60 seconds)
export const timerWarning = derived(
    timeRemaining,
    ($time) => $time < 60 && $time > 0
);

// Derived store to check if timer is at 0
export const timerTimeout = derived(
    timeRemaining,
    ($time) => $time === 0
);

// Interval reference (needs to be outside store for proper cleanup)
let interval: ReturnType<typeof setInterval> | null = null;

// Start the timer countdown
export function startTimer() {
    if (!browser) return;

    timerRunning.set(true);

    // Clear existing interval if any
    if (interval) {
        clearInterval(interval);
    }

    interval = setInterval(() => {
        timeRemaining.update(time => {
            if (time <= 0) {
                stopTimer();
                return 0;
            }
            return time - 1;
        });
    }, 1000);
}

// Stop/pause the timer
export function stopTimer() {
    timerRunning.set(false);

    if (interval) {
        clearInterval(interval);
        interval = null;
    }
}

// Toggle timer between running and stopped
export function toggleTimer() {
    let isRunning = false;
    timerRunning.subscribe(running => isRunning = running)();

    if (isRunning) {
        stopTimer();
    } else {
        startTimer();
    }
}

// Reset timer to specified seconds
export function resetTimer(seconds: number) {
    stopTimer();
    timeRemaining.set(seconds);
}

// Reset timer based on game settings (minutes + seconds)
export function resetTimerFromSettings(minutes: number, seconds: number) {
    const totalSeconds = minutes * 60 + seconds;
    resetTimer(totalSeconds);
}

// Cleanup function to be called when component unmounts
export function cleanupTimer() {
    stopTimer();
}
