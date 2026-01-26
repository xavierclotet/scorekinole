<script lang="ts">
	import { timerDisplay, timerWarning, timerCritical, timerTimeout, toggleTimer, resetTimer } from '$lib/stores/timer';
	import { gameSettings } from '$lib/stores/gameSettings';

	interface Props {
		showResetButton?: boolean;
		size?: 'small' | 'medium' | 'large';
	}

	let { showResetButton = true, size = 'large' }: Props = $props();

	let timerContainer: HTMLDivElement | undefined = $state();
	let isDragging = $state(false);
	let hasMoved = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let offsetX = $state(0);
	let offsetY = $state(0);

	// Position from settings or default (centered)
	let posX = $derived($gameSettings.timerX);
	let posY = $derived($gameSettings.timerY);

	function handleTimerClick() {
		// Only toggle if it wasn't a drag (didn't move)
		if (!hasMoved) {
			toggleTimer();
		}
	}

	function handleTimerReset() {
		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);
	}

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

		// Check if moved enough to be considered a drag (not a click)
		const deltaX = Math.abs(clientX - startX);
		const deltaY = Math.abs(clientY - startY);

		if (deltaX > 5 || deltaY > 5) {
			hasMoved = true;
			const newX = clientX - offsetX;
			const newY = clientY - offsetY;

			// Update position in settings
			gameSettings.update(s => ({ ...s, timerX: newX, timerY: newY }));
		}
	}

	function handleDragEnd() {
		if (isDragging) {
			// Save position to localStorage
			gameSettings.save();

			// Small delay before allowing clicks again
			setTimeout(() => {
				isDragging = false;
			}, 100);
		}
	}

	$effect(() => {
		// Add global listeners for drag
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
	role="button"
	tabindex="-1"
>
	<div class="timer-wrapper" class:warning={$timerWarning} class:critical={$timerCritical} class:timeout={$timerTimeout}>
		<button
			class="timer-display"
			onclick={handleTimerClick}
			aria-label="Timer - Click to toggle"
		>
			<span class="timer-time">{$timerDisplay}</span>
		</button>
		{#if showResetButton}
			<button class="timer-reset" onclick={(e) => { e.stopPropagation(); handleTimerReset(); }} aria-label="Reset timer">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
					<path d="M3 3v5h5"/>
				</svg>
			</button>
		{/if}
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

	/* Warning: < 60s, >= 30s - orange tint */
	.timer-wrapper.warning {
		background: rgba(60, 40, 25, 0.9);
		border-color: rgba(255, 180, 100, 0.3);
		animation: timerPulseWarning 2s ease-in-out infinite;
	}

	.timer-wrapper.warning .timer-display {
		color: rgba(255, 200, 130, 0.95);
	}

	.timer-wrapper.warning .timer-reset {
		border-color: rgba(255, 180, 100, 0.2);
		color: rgba(255, 180, 100, 0.7);
	}

	/* Critical: < 30s - reddish */
	.timer-wrapper.critical {
		background: rgba(80, 35, 30, 0.9);
		border-color: rgba(255, 120, 100, 0.35);
		animation: timerPulseCritical 1.2s ease-in-out infinite;
	}

	.timer-wrapper.critical .timer-display {
		color: rgba(255, 150, 130, 0.95);
	}

	.timer-wrapper.critical .timer-reset {
		border-color: rgba(255, 120, 100, 0.25);
		color: rgba(255, 130, 110, 0.75);
	}

	/* Timeout: = 0 - flashing red */
	.timer-wrapper.timeout {
		background: rgba(200, 50, 50, 0.6);
		border-color: rgba(255, 80, 80, 0.4);
		animation: timerFlash 0.8s ease-in-out infinite;
	}

	.timer-wrapper.timeout .timer-display {
		color: #ff7070;
	}

	.timer-wrapper.timeout .timer-reset {
		border-color: rgba(255, 80, 80, 0.3);
		color: rgba(255, 120, 120, 0.8);
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
		cursor: pointer;
		transition: all 0.15s ease;
		user-select: none;
		text-align: center;
	}

	.timer-time {
		letter-spacing: 0.02em;
		display: inline-block;
		width: 5.5ch;
		font-feature-settings: "tnum" 1;
	}

	.timer-display:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.timer-display:active {
		background: rgba(255, 255, 255, 0.12);
	}

	.timer-reset {
		padding: 0.5rem;
		background: transparent;
		border: none;
		border-left: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.timer-reset:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
	}

	.timer-reset:active {
		background: rgba(255, 255, 255, 0.12);
	}

	.timer-reset svg {
		display: block;
	}

	/* Size variants */
	.size-small .timer-display {
		font-size: 1.1rem;
		padding: 0.4rem 0.75rem;
	}

	.size-small .timer-reset {
		padding: 0.4rem;
	}

	.size-small .timer-reset svg {
		width: 16px;
		height: 16px;
	}

	.size-medium .timer-display {
		font-size: 1.5rem;
		padding: 0.55rem 1rem;
	}

	.size-medium .timer-reset {
		padding: 0.55rem;
	}

	.size-medium .timer-reset svg {
		width: 18px;
		height: 18px;
	}

	.size-large .timer-display {
		font-size: 1.8rem;
		padding: 0.7rem 1.2rem;
	}

	.size-large .timer-reset {
		padding: 0.7rem;
	}

	.size-large .timer-reset svg {
		width: 20px;
		height: 20px;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.size-large .timer-display {
			font-size: 1.6rem;
			padding: 0.6rem 1rem;
		}

		.size-large .timer-reset {
			padding: 0.6rem;
		}

		.size-large .timer-reset svg {
			width: 18px;
			height: 18px;
		}
	}

	@media (max-width: 480px) {
		.size-large .timer-display {
			font-size: 1.4rem;
			padding: 0.5rem 0.85rem;
		}

		.size-large .timer-reset {
			padding: 0.5rem;
		}

		.size-large .timer-reset svg {
			width: 16px;
			height: 16px;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.size-large .timer-display {
			font-size: 1.2rem;
			padding: 0.45rem 0.8rem;
		}

		.size-large .timer-reset {
			padding: 0.45rem;
		}

		.size-large .timer-reset svg {
			width: 14px;
			height: 14px;
		}
	}
</style>
