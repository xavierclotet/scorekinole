<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { theme } from '$lib/stores/theme';
	import { team1, team2 } from '$lib/stores/teams';

	interface Props {
		isOpen?: boolean;
		teamNumber?: 1 | 2;
	}

	let { isOpen = $bindable(false), teamNumber = 1 }: Props = $props();

	// Color presets (same as original app)
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

	// Get current team color and name
	let currentTeam = $derived(teamNumber === 1 ? $team1 : $team2);
	let currentTeamColor = $derived(currentTeam.color);
	let currentTeamName = $derived(currentTeam.name);

	function selectColor(color: string) {
		// Apply color immediately
		if (teamNumber === 1) {
			team1.update(t => ({ ...t, color }));
		} else {
			team2.update(t => ({ ...t, color }));
		}
		// Close modal after selection
		closeModal();
	}

	function closeModal() {
		isOpen = false;
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-overlay" data-theme={$theme} onclick={closeModal} role="button" tabindex="-1">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-content" onclick={stopPropagation} role="dialog" tabindex="-1">
			<h2>{m.scoring_colorFor()} {currentTeamName}</h2>
			<button class="close-btn" onclick={closeModal} aria-label="Close">×</button>

			<!-- Preset Colors Grid -->
			<div class="color-grid">
				{#each presetColors as color}
					<button
						class="color-swatch"
						class:selected={color === currentTeamColor}
						style="background-color: {color}"
						onclick={() => selectColor(color)}
						aria-label="Select color {color}"
					></button>
				{/each}
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
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-content {
		background: var(--card);
		border: 2px solid color-mix(in srgb, var(--primary) 30%, transparent);
		border-radius: 16px;
		padding: 2rem;
		max-width: 600px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
		position: relative;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	h2 {
		color: var(--primary);
		font-size: 1.8rem;
		margin: 0 0 2rem 0;
		text-align: center;
	}

	.close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: none;
		border: none;
		font-size: 2rem;
		cursor: pointer;
		color: var(--muted-foreground);
		transition: color 0.2s;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		color: var(--destructive);
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
		position: relative;
	}

	.color-swatch:hover {
		transform: scale(1.1);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.color-swatch.selected {
		border-color: var(--primary);
		box-shadow: 0 0 20px color-mix(in srgb, var(--primary) 60%, transparent);
		transform: scale(1.05);
	}

	/* Responsive */
	@media (max-width: 480px) {
		.modal-content {
			padding: 1.5rem;
		}

		h2 {
			font-size: 1.5rem;
		}

		.color-grid {
			grid-template-columns: repeat(4, 1fr);
			gap: 0.5rem;
		}

		.color-swatch {
			border-radius: 8px;
		}
	}
</style>
