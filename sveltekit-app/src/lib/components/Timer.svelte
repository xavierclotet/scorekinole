<script lang="ts">
	import { timerDisplay, timerWarning, timerTimeout, toggleTimer, resetTimer } from '$lib/stores/timer';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { t } from '$lib/stores/language';

	// Props
	export let showResetButton: boolean = true;
	export let size: 'small' | 'medium' | 'large' = 'large';

	function handleTimerClick() {
		toggleTimer();
	}

	function handleTimerReset() {
		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);
	}
</script>

<div class="timer-container" class:size-small={size === 'small'} class:size-medium={size === 'medium'} class:size-large={size === 'large'}>
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
	</button>

	{#if showResetButton}
		<button class="timer-reset" on:click={handleTimerReset} aria-label="Reset timer">
			⟲
		</button>
	{/if}
</div>

<style>
	.timer-container {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		z-index: 100;
	}

	.timer-display {
		font-family: 'Orbitron', monospace;
		font-weight: 900;
		padding: 1rem 2rem;
		background: rgba(0, 255, 136, 0.1);
		border: 3px solid #00ff88;
		border-radius: 16px;
		color: #00ff88;
		cursor: pointer;
		transition: all 0.3s;
		text-align: center;
		user-select: none;
	}

	.timer-display:hover {
		transform: scale(1.05);
		box-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
	}

	.timer-display:active {
		transform: scale(0.98);
	}

	.timer-display.warning {
		background: rgba(255, 51, 102, 0.1);
		border-color: #ff3366;
		color: #ff3366;
		animation: pulse 1s ease-in-out infinite;
	}

	.timer-display.timeout {
		background: rgba(255, 51, 102, 0.2);
		border-color: #ff3366;
		color: #ff3366;
		animation: flash 0.5s ease-in-out infinite;
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
		font-size: 2rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		color: #fff;
		cursor: pointer;
		transition: all 0.2s;
		width: 60px;
		height: 60px;
		display: flex;
		align-items: center;
		justify-content: center;
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
		width: 40px;
		height: 40px;
		font-size: 1.5rem;
	}

	.size-medium .timer-display {
		font-size: 2rem;
		padding: 0.75rem 1.5rem;
		min-width: 150px;
	}

	.size-medium .timer-reset {
		width: 50px;
		height: 50px;
		font-size: 1.75rem;
	}

	.size-large .timer-display {
		font-size: 2.1rem;
		padding: 0.7rem 1.4rem;
		min-width: 140px;
	}

	.size-large .timer-reset {
		width: 42px;
		height: 42px;
		font-size: 1.4rem;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.size-large .timer-display {
			font-size: 1.75rem;
			min-width: 112px;
		}

		.size-large .timer-reset {
			width: 35px;
			height: 35px;
			font-size: 1.2rem;
		}
	}

	@media (max-width: 480px) {
		.timer-container {
			gap: 0.5rem;
		}

		.size-large .timer-display {
			font-size: 1.4rem;
			min-width: 98px;
			padding: 0.5rem 1rem;
		}

		.size-large .timer-reset {
			width: 32px;
			height: 32px;
			font-size: 1rem;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.size-large .timer-display {
			font-size: 1.2rem;
			min-width: 90px;
			padding: 0.4rem 0.8rem;
		}

		.size-large .timer-reset {
			width: 28px;
			height: 28px;
			font-size: 0.9rem;
		}
	}
</style>
