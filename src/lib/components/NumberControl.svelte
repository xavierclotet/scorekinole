<script lang="ts">
	interface Props {
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		label?: string;
		disabled?: boolean;
		onchange?: (value: number) => void;
	}

	let {
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		label = '',
		disabled = false,
		onchange
	}: Props = $props();

	function increment(e: MouseEvent) {
		e.stopPropagation();
		if (disabled) return;
		const newValue = Math.min(value + step, max);
		if (newValue !== value) {
			value = newValue;
			onchange?.(value);
		}
	}

	function decrement(e: MouseEvent) {
		e.stopPropagation();
		if (disabled) return;
		const newValue = Math.max(value - step, min);
		if (newValue !== value) {
			value = newValue;
			onchange?.(value);
		}
	}

	// Derived values for button states
	let canIncrement = $derived(value < max && !disabled);
	let canDecrement = $derived(value > min && !disabled);
</script>

<div class="number-control">
	{#if label}
		<span class="label">{label}</span>
	{/if}
	<div class="controls">
		<button
			class="control-btn"
			onclick={decrement}
			disabled={!canDecrement}
			aria-label="Decrease"
			type="button"
		>
			-
		</button>
		<span class="value">{value}</span>
		<button
			class="control-btn"
			onclick={increment}
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
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.8rem;
		font-weight: 500;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.control-btn {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.8);
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.control-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.control-btn:active:not(:disabled) {
		transform: scale(0.95);
		background: rgba(255, 255, 255, 0.2);
	}

	.control-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.value {
		min-width: 36px;
		text-align: center;
		font-size: 1.1rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		user-select: none;
	}

	/* Focus styles */
	.control-btn:focus-visible {
		outline: 2px solid rgba(255, 255, 255, 0.4);
		outline-offset: 2px;
	}

	/* Mobile optimizations */
	@media (max-width: 600px) {
		.control-btn {
			width: 26px;
			height: 26px;
			font-size: 0.95rem;
		}

		.value {
			font-size: 1rem;
			min-width: 32px;
		}

		.label {
			font-size: 0.75rem;
		}
	}

	/* Landscape optimizations */
	@media (orientation: landscape) and (max-height: 600px) {
		.control-btn {
			width: 24px;
			height: 24px;
			font-size: 0.9rem;
		}

		.value {
			font-size: 0.95rem;
			min-width: 28px;
		}

		.label {
			font-size: 0.7rem;
		}

		.controls {
			gap: 0.4rem;
		}
	}
</style>
