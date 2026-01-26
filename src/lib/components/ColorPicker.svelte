<script lang="ts">
	interface Props {
		selectedColor?: string;
	}

	let { selectedColor = $bindable('#00ff88') }: Props = $props();

	const presetColors: string[] = [
		'#00ff88', '#ff3366', '#ffaa00', '#0088ff',
		'#aa00ff', '#00ffff', '#ff0088', '#88ff00',
		'#ff6b6b', '#4ecdc4', '#45b7d1', '#f7b731',
		'#5f27cd', '#00d2d3', '#ee5a6f', '#c44569'
	];

	function selectColor(color: string) {
		selectedColor = color;
	}
</script>

<div class="color-picker">
	<div class="color-grid">
		{#each presetColors as color}
			<button
				class="color-swatch"
				class:selected={color === selectedColor}
				style="background-color: {color}"
				onclick={() => selectColor(color)}
				aria-label="Select color {color}"
				type="button"
			>
				{#if color === selectedColor}
					<span class="check-mark">✓</span>
				{/if}
			</button>
		{/each}
	</div>

	<div class="custom-color">
		<label for="customColor" class="custom-label">Color personalizado:</label>
		<input
			id="customColor"
			type="color"
			bind:value={selectedColor}
			class="color-input"
		/>
		<span class="color-value">{selectedColor.toUpperCase()}</span>
	</div>
</div>

<style>
	.color-picker {
		width: 100%;
	}

	.color-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.color-swatch {
		width: 100%;
		aspect-ratio: 1;
		border: 3px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
		overflow: hidden;
	}

	.color-swatch::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.1) 100%);
		opacity: 0;
		transition: opacity 0.2s;
	}

	.color-swatch:hover {
		transform: scale(1.1);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.color-swatch:hover::before {
		opacity: 1;
	}

	.color-swatch.selected {
		border-color: var(--accent-green, #00ff88);
		box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.3), 0 0 20px rgba(0, 255, 136, 0.5);
		transform: scale(1.05);
	}

	.check-mark {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 1.5rem;
		color: #fff;
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.5);
		font-weight: bold;
		animation: checkPop 0.3s ease;
	}

	@keyframes checkPop {
		0% {
			transform: translate(-50%, -50%) scale(0);
		}
		50% {
			transform: translate(-50%, -50%) scale(1.2);
		}
		100% {
			transform: translate(-50%, -50%) scale(1);
		}
	}

	.custom-color {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
	}

	.custom-label {
		color: var(--accent-green, #00ff88);
		font-size: 0.9rem;
		font-weight: 500;
	}

	.color-input {
		width: 60px;
		height: 40px;
		border: 2px solid var(--accent-green, #00ff88);
		border-radius: 8px;
		cursor: pointer;
		background: transparent;
		transition: all 0.2s;
	}

	.color-input:hover {
		transform: scale(1.05);
		box-shadow: 0 0 10px rgba(0, 255, 136, 0.3);
	}

	.color-input:focus {
		outline: 2px solid var(--accent-green, #00ff88);
		outline-offset: 2px;
	}

	.color-value {
		font-family: monospace;
		font-size: 0.9rem;
		color: var(--text-color, #fff);
		background: rgba(0, 0, 0, 0.3);
		padding: 0.5rem 0.75rem;
		border-radius: 4px;
		user-select: all;
	}

	/* Mobile optimizations */
	@media (max-width: 600px) {
		.color-grid {
			gap: 0.5rem;
		}

		.custom-color {
			flex-wrap: wrap;
			gap: 0.75rem;
		}

		.custom-label {
			width: 100%;
		}
	}

	/* Tablet */
	@media (min-width: 601px) and (max-width: 900px) {
		.color-grid {
			grid-template-columns: repeat(6, 1fr);
		}
	}

	/* Desktop */
	@media (min-width: 901px) {
		.color-grid {
			grid-template-columns: repeat(8, 1fr);
		}
	}
</style>
