<script lang="ts">
	import { team1, team2, saveTeams } from '$lib/stores/teams';
	import * as m from '$lib/paraglide/messages.js';
	import { getContrastColor } from '$lib/utils/colors';

	interface Props {
		isOpen?: boolean;
		onclose?: () => void;
	}

	let { isOpen = $bindable(false), onclose }: Props = $props();

	// Preset colors (same as ColorPickerModal)
	const presetColors: string[] = [
		'#E6BD80', // natural
		'#1B100E', // negro
		'#DADADA', // blanco
		'#BB484D', // red
		'#D06249', // orange
		'#DFC530', // yellow
		'#559D5E', // green
		'#3CBCFB', // lightblue
		'#014BC6', // blue
		'#DA85CE', // pink
		'#8B65A0'  // magenta
	];

	// Color combinations (color1, color2)
	interface ColorCombination {
		team1Color: string;
		team2Color: string;
	}

	let selectedFirstColor = $state<string | null>(null);
	let combinations = $state<ColorCombination[]>([]);

	function selectFirstColor(color: string) {
		selectedFirstColor = color;
		// Generate all combinations excluding the selected color
		combinations = presetColors
			.filter(c => c !== color)
			.map(c => ({
				team1Color: color,
				team2Color: c
			}));
	}

	function selectCombination(combination: ColorCombination) {
		team1.update(t => ({ ...t, color: combination.team1Color }));
		team2.update(t => ({ ...t, color: combination.team2Color }));
		saveTeams();
		close();
	}

	function back() {
		selectedFirstColor = null;
		combinations = [];
	}

	function close() {
		selectedFirstColor = null;
		combinations = [];
		isOpen = false;
		onclose?.();
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

{#if isOpen}
	<div class="modal-overlay" onclick={close} role="button" tabindex="-1">
		<div class="modal" onclick={stopPropagation} role="dialog">
			<div class="modal-header">
				<span class="modal-title">{m.common_presetColors()}</span>
				<button class="close-btn" onclick={close} aria-label="Close">×</button>
			</div>
			<div class="modal-content">
				{#if !selectedFirstColor}
					<!-- Step 1: Select first team color -->
					<p class="instruction">{m.common_chooseColor()}</p>
					<div class="color-grid">
						{#each presetColors as color}
							<button
								class="color-swatch"
								style="background-color: {color}"
								onclick={() => selectFirstColor(color)}
								aria-label="Select color {color}"
							/>
						{/each}
					</div>
				{:else}
					<!-- Step 2: Select combination -->
					<button class="back-btn" onclick={back}>
						← {m.common_back()}
					</button>
					<div class="combinations-grid">
						{#each combinations as combo}
							<button
								class="combination"
								onclick={() => selectCombination(combo)}
							>
								<div
									class="team-preview"
									style="background-color: {combo.team1Color}; color: {getContrastColor(combo.team1Color)}"
								>
									{$team1.name || 'Team 1'}
								</div>
								<div
									class="team-preview"
									style="background-color: {combo.team2Color}; color: {getContrastColor(combo.team2Color)}"
								>
									{$team2.name || 'Team 2'}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: #1a1f35;
		padding: 2rem;
		border-radius: 12px;
		max-width: 90%;
		width: 700px;
		max-height: 90vh;
		overflow-y: auto;
		position: relative;
	}

	.modal-header {
		margin-bottom: 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.modal-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: #fff;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 2rem;
		cursor: pointer;
		color: #fff;
		line-height: 1;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.close-btn:hover {
		transform: scale(1.1);
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.instruction {
		text-align: center;
		color: rgba(255, 255, 255, 0.8);
		font-size: 1rem;
	}

	.color-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
	}

	.color-swatch {
		width: 100%;
		aspect-ratio: 1;
		border: 3px solid transparent;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s;
		padding: 0;
	}

	.color-swatch:hover {
		transform: scale(1.05);
		border-color: #00ff88;
		box-shadow: 0 0 15px rgba(0, 255, 136, 0.5);
	}

	.back-btn {
		padding: 0.75rem 1.5rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: #fff;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		align-self: flex-start;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		border-color: #00ff88;
	}

	.combinations-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	.combination {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid transparent;
		border-radius: 12px;
		padding: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.combination:hover {
		border-color: #00ff88;
		background: rgba(255, 255, 255, 0.1);
		transform: scale(1.02);
	}

	.team-preview {
		padding: 1rem;
		border-radius: 8px;
		text-align: center;
		font-weight: 700;
		font-size: 1rem;
	}

	@media (max-width: 768px) {
		.modal {
			width: 90%;
		}

		.modal-title {
			font-size: 1.25rem;
		}

		.color-grid {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.75rem;
		}

		.combinations-grid {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}
	}

	@media (max-width: 480px) {
		.color-grid {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.5rem;
		}
	}
</style>
