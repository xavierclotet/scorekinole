<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let value: number = 0;
	export let min: number = 0;
	export let max: number = 100;
	export let step: number = 1;
	export let label: string = '';

	const dispatch = createEventDispatcher<{ change: number }>();

	function increment() {
		const newValue = Math.min(value + step, max);
		if (newValue !== value) {
			value = newValue;
			dispatch('change', value);
		}
	}

	function decrement() {
		const newValue = Math.max(value - step, min);
		if (newValue !== value) {
			value = newValue;
			dispatch('change', value);
		}
	}

	// Reactive statements for button states
	$: canIncrement = value < max;
	$: canDecrement = value > min;
</script>

<div class="number-control">
	{#if label}
		<label class="label">{label}</label>
	{/if}
	<div class="controls">
		<button
			class="control-btn"
			on:click|stopPropagation={decrement}
			disabled={!canDecrement}
			aria-label="Decrease"
			type="button"
		>
			-
		</button>
		<span class="value">{value}</span>
		<button
			class="control-btn"
			on:click|stopPropagation={increment}
			disabled={!canIncrement}
			aria-label="Increase"
			type="button"
		>
			+
		</button>
	</div>
</div>

<style>
	.number-control {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.label {
		color: var(--accent-green, #00ff88);
		font-size: 0.85rem;
		font-weight: 500;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.control-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid var(--accent-green, #00ff88);
		background: transparent;
		color: var(--accent-green, #00ff88);
		font-size: 1.3rem;
		font-weight: bold;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		position: relative;
		overflow: hidden;
	}

	.control-btn::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 0;
		height: 0;
		border-radius: 50%;
		background: var(--accent-green, #00ff88);
		transform: translate(-50%, -50%);
		transition: width 0.4s, height 0.4s;
		z-index: -1;
	}

	.control-btn:hover:not(:disabled)::before {
		width: 100%;
		height: 100%;
	}

	.control-btn:hover:not(:disabled) {
		color: #000;
		transform: scale(1.1);
	}

	.control-btn:active:not(:disabled) {
		transform: scale(0.95);
	}

	.control-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
		border-color: #666;
		color: #666;
	}

	.value {
		min-width: 50px;
		text-align: center;
		font-size: 1.3rem;
		font-weight: bold;
		color: var(--text-color, #fff);
		user-select: none;
	}

	/* Focus styles */
	.control-btn:focus-visible {
		outline: 2px solid var(--accent-green, #00ff88);
		outline-offset: 2px;
	}

	/* Mobile optimizations */
	@media (max-width: 600px) {
		.control-btn {
			width: 32px;
			height: 32px;
			font-size: 1.2rem;
		}

		.value {
			font-size: 1.2rem;
			min-width: 45px;
		}

		.label {
			font-size: 0.8rem;
		}
	}

	/* Landscape optimizations */
	@media (orientation: landscape) and (max-height: 600px) {
		.control-btn {
			width: 32px;
			height: 32px;
			font-size: 1.2rem;
		}

		.value {
			font-size: 1.1rem;
			min-width: 40px;
		}

		.label {
			font-size: 0.75rem;
		}

		.controls {
			gap: 0.5rem;
		}
	}
</style>
