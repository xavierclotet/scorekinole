import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { vibratePattern } from '$lib/utils/vibration';

// Timer state
export const timerRunning = writable<boolean>(false);
export const timeRemaining = writable<number>(0);

// Audio context for beep sound
let audioContext: AudioContext | null = null;

function playTimeoutBeep() {
    if (!browser) return;

    try {
        // Create audio context on first use
        if (!audioContext) {
            audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        }

        // Resume if suspended (required on mobile)
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        // Create oscillator for beep
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Configure beep sound - two short beeps
        oscillator.frequency.value = 880; // A5 note
        oscillator.type = 'sine';

        // Set volume
        gainNode.gain.value = 0.3;

        // Play beep pattern: beep-pause-beep
        const now = audioContext.currentTime;
        oscillator.start(now);

        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.setValueAtTime(0, now + 0.15);
        gainNode.gain.setValueAtTime(0.3, now + 0.25);
        gainNode.gain.setValueAtTime(0, now + 0.4);

        oscillator.stop(now + 0.5);
    } catch {
        // Audio not supported or blocked
    }
}

function triggerTimeoutAlert() {
    // Vibrate pattern: three short pulses
    vibratePattern([100, 80, 100, 80, 100]);

    // Play beep sound
    playTimeoutBeep();
}

// Derived store for formatted timer display (MM:SS)
export const timerDisplay = derived(
    timeRemaining,
    ($time) => {
        const mins = Math.floor($time / 60);
        const secs = $time % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
);

// Derived store to check if timer is in warning state (< 60 seconds, >= 30 seconds)
export const timerWarning = derived(
    timeRemaining,
    ($time) => $time < 60 && $time >= 30
);

// Derived store to check if timer is in critical state (< 30 seconds, > 0)
export const timerCritical = derived(
    timeRemaining,
    ($time) => $time < 30 && $time > 0
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
            if (time <= 1) {
                stopTimer();
                if (time === 1) {
                    // Trigger alert when reaching 0
                    triggerTimeoutAlert();
                }
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
