<script lang="ts">
	import type { TournamentTimer } from '$lib/types/tournament';
	import { gameSettings } from '$lib/stores/gameSettings';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		countdownTimer: TournamentTimer;
		size?: 'small' | 'medium' | 'large';
		ontimeout?: () => void;
	}

	let { countdownTimer, size = 'large', ontimeout }: Props = $props();

	let timerContainer: HTMLDivElement | undefined = $state();
	let isDragging = $state(false);
	let hasMoved = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let timerRemaining = $state(0);
	let timeoutFired = $state(false);

	// Position from settings (shared with local Timer)
	let posX = $derived($gameSettings.timerX);
	let posY = $derived($gameSettings.timerY);

	// Compute remaining time based on timer status
	$effect(() => {
		if (countdownTimer.status === 'running' && countdownTimer.endsAt) {
			const compute = () => Math.max(0, Math.ceil((countdownTimer.endsAt! - Date.now()) / 1000));
			timerRemaining = compute();
			const iv = setInterval(() => {
				timerRemaining = compute();
			}, 200);
			return () => clearInterval(iv);
		} else {
			timerRemaining = countdownTimer.remaining;
		}
	});

	// Fire timeout callback once when timer reaches 0
	$effect(() => {
		if (timerRemaining === 0 && countdownTimer.status === 'running' && !timeoutFired) {
			timeoutFired = true;
			// Vibrate + beep
			if (typeof navigator !== 'undefined' && navigator.vibrate) {
				navigator.vibrate([200, 100, 200, 100, 200]);
			}
			ontimeout?.();
		}
		// Reset fired flag if timer is restarted
		if (timerRemaining > 0 && timeoutFired) {
			timeoutFired = false;
		}
	});

	let timerDisplay = $derived.by(() => {
		const mins = Math.floor(timerRemaining / 60);
		const secs = timerRemaining % 60;
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	});

	let isWarning = $derived(timerRemaining < 60 && timerRemaining >= 30 && countdownTimer.status === 'running');
	let isCritical = $derived(timerRemaining < 30 && timerRemaining > 0 && countdownTimer.status === 'running');
	let isTimeout = $derived(timerRemaining === 0 && (countdownTimer.status === 'running' || countdownTimer.status === 'stopped'));
	let isPaused = $derived(countdownTimer.status === 'paused');

	// Drag logic (same as Timer.svelte)
	function handleDragStart(e: MouseEvent | TouchEvent) {
		if (!timerContainer) return;
		isDragging = true;
		hasMoved = false;

		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

		const rect = timerContainer.getBoundingClientRect();
		offsetX = clientX - rect.left;
		offsetY = clientY - rect.top;
		startX = clientX;
		startY = clientY;
	}

	function handleDragMove(e: MouseEvent | TouchEvent) {
		if (!isDragging) return;
		e.preventDefault();

		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

		const deltaX = Math.abs(clientX - startX);
		const deltaY = Math.abs(clientY - startY);

		if (deltaX > 5 || deltaY > 5) {
			hasMoved = true;
			const newX = clientX - offsetX;
			const newY = clientY - offsetY;
			gameSettings.update(s => ({ ...s, timerX: newX, timerY: newY }));
		}
	}

	function handleDragEnd() {
		if (isDragging) {
			gameSettings.save();
			setTimeout(() => {
				isDragging = false;
			}, 100);
		}
	}

	$effect(() => {
		const handleMouseMove = (e: MouseEvent) => handleDragMove(e);
		const handleMouseUp = () => handleDragEnd();
		const handleTouchMove = (e: TouchEvent) => handleDragMove(e);
		const handleTouchEnd = () => handleDragEnd();

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handleTouchEnd);

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			window.removeEventListener('touchmove', handleTouchMove);
			window.removeEventListener('touchend', handleTouchEnd);
		};
	});

	// Reset position on orientation change
	$effect(() => {
		let lastOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';

		function handleOrientationChange() {
			const currentOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
			if (currentOrientation !== lastOrientation) {
				lastOrientation = currentOrientation;
				gameSettings.update(s => ({ ...s, timerX: null, timerY: null }));
				gameSettings.save();
			}
		}

		window.addEventListener('resize', handleOrientationChange);
		return () => window.removeEventListener('resize', handleOrientationChange);
	});
</script>

<div
	bind:this={timerContainer}
	class="timer-container"
	class:size-small={size === 'small'}
	class:size-medium={size === 'medium'}
	class:size-large={size === 'large'}
	class:dragging={isDragging}
	class:positioned={posX !== null && posY !== null}
	style={posX !== null && posY !== null ? `left: ${posX}px; top: ${posY}px; transform: none;` : ''}
	onmousedown={handleDragStart}
	ontouchstart={handleDragStart}
	role="status"
	tabindex="-1"
>
	<div class="timer-wrapper" class:warning={isWarning} class:critical={isCritical} class:timeout={isTimeout} class:paused={isPaused}>
		<div class="timer-display">
			<span class="timer-time">{timerDisplay}</span>
			{#if isPaused}
				<span class="timer-badge paused-badge">{m.timeout_paused()}</span>
			{:else if isTimeout}
				<span class="timer-badge timeout-badge">{m.timeout_timeUp()}</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.timer-container {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 100;
		cursor: grab;
		touch-action: none;
	}

	.timer-container.positioned {
		transform: none;
	}

	.timer-container.dragging {
		cursor: grabbing;
		z-index: 200;
	}

	.timer-container.dragging .timer-wrapper {
		transition: none;
		opacity: 0.85;
	}

	.timer-wrapper {
		display: flex;
		align-items: center;
		background: rgba(30, 35, 45, 0.85);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
		overflow: hidden;
	}

	.timer-wrapper.warning {
		background: rgba(60, 40, 25, 0.9);
		border-color: rgba(255, 180, 100, 0.3);
		animation: timerPulseWarning 2s ease-in-out infinite;
	}

	.timer-wrapper.warning .timer-display {
		color: rgba(255, 200, 130, 0.95);
	}

	.timer-wrapper.critical {
		background: rgba(80, 35, 30, 0.9);
		border-color: rgba(255, 120, 100, 0.35);
		animation: timerPulseCritical 1.2s ease-in-out infinite;
	}

	.timer-wrapper.critical .timer-display {
		color: rgba(255, 150, 130, 0.95);
	}

	.timer-wrapper.timeout {
		background: rgba(200, 50, 50, 0.6);
		border-color: rgba(255, 80, 80, 0.4);
		animation: timerFlash 0.8s ease-in-out infinite;
	}

	.timer-wrapper.timeout .timer-display {
		color: #ff7070;
	}

	.timer-wrapper.paused {
		background: rgba(40, 45, 60, 0.9);
		border-color: rgba(150, 160, 200, 0.3);
	}

	.timer-wrapper.paused .timer-display {
		color: rgba(180, 190, 220, 0.8);
	}

	@keyframes timerFlash {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	@keyframes timerPulseWarning {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.85; }
	}

	@keyframes timerPulseCritical {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.75; }
	}

	.timer-display {
		font-family: 'Lexend', sans-serif;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		padding: 0.5rem 0.9rem;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.9);
		user-select: none;
		text-align: center;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.timer-time {
		letter-spacing: 0.02em;
		display: inline-block;
		width: 5.5ch;
		font-feature-settings: "tnum" 1;
	}

	.timer-badge {
		font-size: 0.6em;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.15em 0.4em;
		border-radius: 3px;
		white-space: nowrap;
	}

	.paused-badge {
		background: rgba(150, 160, 200, 0.2);
		color: rgba(180, 190, 220, 0.9);
	}

	.timeout-badge {
		background: rgba(255, 80, 80, 0.25);
		color: #ff7070;
		animation: timerFlash 0.8s ease-in-out infinite;
	}

	/* Size variants */
	.size-small .timer-display {
		font-size: 1.1rem;
		padding: 0.4rem 0.75rem;
	}

	.size-medium .timer-display {
		font-size: 1.5rem;
		padding: 0.55rem 1rem;
	}

	.size-large .timer-display {
		font-size: 1.8rem;
		padding: 0.7rem 1.2rem;
	}

	@media (max-width: 768px) {
		.size-large .timer-display {
			font-size: 1.6rem;
			padding: 0.6rem 1rem;
		}
	}

	@media (max-width: 480px) {
		.size-large .timer-display {
			font-size: 1.4rem;
			padding: 0.5rem 0.85rem;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.size-large .timer-display {
			font-size: 1.2rem;
			padding: 0.45rem 0.8rem;
		}
	}
</style>
