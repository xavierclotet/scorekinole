<script lang="ts">
	import { timerDisplay, timerWarning, timerTimeout, toggleTimer, resetTimer } from '$lib/stores/timer';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { t } from '$lib/stores/language';
	import { onMount } from 'svelte';

	// Props
	export let showResetButton: boolean = true;
	export let size: 'small' | 'medium' | 'large' = 'large';

	let timerContainer: HTMLDivElement;
	let isDragging = false;
	let hasMoved = false;
	let dragStartTime = 0;
	let startX = 0;
	let startY = 0;
	let offsetX = 0;
	let offsetY = 0;

	// Position from settings or default (centered)
	$: posX = $gameSettings.timerX;
	$: posY = $gameSettings.timerY;

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
		isDragging = true;
		hasMoved = false;
		dragStartTime = Date.now();

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

	onMount(() => {
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
	on:mousedown={handleDragStart}
	on:touchstart={handleDragStart}
	role="button"
	tabindex="-1"
>
	<button
		class="timer-display"
		class:warning={$timerWarning}
		class:timeout={$timerTimeout}
		on:click={handleTimerClick}
		aria-label="Timer - Click to toggle"
	>
		{#if $timerTimeout}
			<span class="timeout-text">{$t('timeOut')}</span>
		{:else}
			{$timerDisplay}
		{/if}

		{#if showResetButton}
			<button class="timer-reset" on:click|stopPropagation={handleTimerReset} aria-label="Reset timer">
				⟲
			</button>
		{/if}
	</button>
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

	.timer-container.dragging .timer-display {
		transition: none;
		opacity: 0.9;
	}

	.timer-display {
		font-family: 'Orbitron', monospace;
		font-weight: 900;
		padding: 1rem 2rem;
		background: rgba(10, 14, 26, 0.95);
		backdrop-filter: blur(8px);
		border: 3px solid #00ff88;
		border-radius: 16px;
		color: #00ff88;
		cursor: pointer;
		transition: all 0.3s;
		user-select: none;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		position: relative;
	}

	.timer-display:hover {
		transform: scale(1.05);
		box-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
	}

	.timer-display:active {
		transform: scale(0.98);
	}

	.timer-display.warning {
		background: rgba(26, 10, 14, 0.95);
		backdrop-filter: blur(8px);
		border-color: #ff3366;
		color: #ff3366;
		animation: pulse 1s ease-in-out infinite;
		box-shadow: 0 4px 16px rgba(255, 51, 102, 0.3);
	}

	.timer-display.timeout {
		background: rgba(26, 10, 14, 0.95);
		backdrop-filter: blur(8px);
		border-color: #ff3366;
		color: #ff3366;
		animation: flash 0.5s ease-in-out infinite;
		box-shadow: 0 4px 16px rgba(255, 51, 102, 0.4);
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
			box-shadow: 0 0 20px rgba(255, 51, 102, 0.3);
		}
		50% {
			transform: scale(1.05);
			box-shadow: 0 0 40px rgba(255, 51, 102, 0.6);
		}
	}

	@keyframes flash {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.timeout-text {
		font-size: 0.6em;
		letter-spacing: 0.1em;
	}

	.timer-reset {
		font-size: 1.1rem;
		padding: 0.2rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		color: #fff;
		cursor: pointer;
		transition: all 0.2s;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.timer-reset:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: rotate(180deg);
	}

	.timer-reset:active {
		transform: rotate(180deg) scale(0.95);
	}

	/* Size variants */
	.size-small .timer-display {
		font-size: 1.5rem;
		padding: 0.5rem 1rem;
		min-width: 100px;
	}

	.size-small .timer-reset {
		width: 20px;
		height: 20px;
		font-size: 0.9rem;
	}

	.size-medium .timer-display {
		font-size: 2rem;
		padding: 0.75rem 1.5rem;
		min-width: 150px;
	}

	.size-medium .timer-reset {
		width: 22px;
		height: 22px;
		font-size: 1rem;
	}

	.size-large .timer-display {
		font-size: 2.1rem;
		padding: 0.7rem 1.4rem;
		min-width: 140px;
	}

	.size-large .timer-reset {
		width: 24px;
		height: 24px;
		font-size: 1.1rem;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.size-large .timer-display {
			font-size: 1.75rem;
			min-width: 112px;
		}

		.size-large .timer-reset {
			width: 22px;
			height: 22px;
			font-size: 1rem;
		}
	}

	@media (max-width: 480px) {
		.size-large .timer-display {
			font-size: 1.4rem;
			min-width: 98px;
			padding: 0.5rem 1rem;
		}

		.size-large .timer-reset {
			width: 20px;
			height: 20px;
			font-size: 0.9rem;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.size-large .timer-display {
			font-size: 1.2rem;
			min-width: 90px;
			padding: 0.4rem 0.8rem;
		}

		.size-large .timer-reset {
			width: 18px;
			height: 18px;
			font-size: 0.8rem;
		}
	}
</style>
