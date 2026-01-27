<script lang="ts">
	import { team1, team2 } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		isOpen?: boolean;
		onclose?: () => void;
	}

	let { isOpen = $bindable(false), onclose }: Props = $props();

	let team1Name = $derived($team1.name || 'Team 1');
	let team2Name = $derived($team2.name || 'Team 2');

	// Calculator buttons: max depends on game type
	// Singles: 0-8 (8 discs per player)
	// Doubles: 0-12 (6 discs per player × 2 players)
	let maxTwenty = $derived($gameSettings.gameType === 'singles' ? 8 : 12);
	let numbers = $derived(Array.from({ length: maxTwenty + 1 }, (_, i) => i));

	let team1Twenty = $state<number | null>(null);
	let team2Twenty = $state<number | null>(null);

	// Track previous isOpen state to detect when dialog opens
	let wasOpen = $state(false);

	// Reset values when dialog opens (using $effect.pre to run before render)
	$effect.pre(() => {
		if (isOpen && !wasOpen) {
			// Dialog just opened - reset values
			team1Twenty = null;
			team2Twenty = null;
		}
		wasOpen = isOpen;
	});

	// Calculate if a color is dark (returns true if dark)
	function isDarkColor(hexColor: string): boolean {
		// Remove # if present
		const hex = hexColor.replace('#', '');

		// Convert to RGB
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);

		// Calculate relative luminance using WCAG formula
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

		// Return true if dark (luminance < 0.5)
		return luminance < 0.5;
	}

	// Get appropriate color: use white if team color is dark, otherwise use team color
	function getColorForDarkBackground(teamColor: string): string {
		return isDarkColor(teamColor) ? '#ffffff' : teamColor;
	}

	// Color for selected buttons (solid background with team color)
	// Use white text if team color is dark, black if light
	let team1SelectedTextColor = $derived(isDarkColor($team1.color) ? '#ffffff' : '#000000');
	let team2SelectedTextColor = $derived(isDarkColor($team2.color) ? '#ffffff' : '#000000');

	// Color for unselected buttons (transparent background over dark modal)
	// Use white if team color is dark (would be invisible), otherwise use team color
	let team1UnselectedTextColor = $derived(getColorForDarkBackground($team1.color));
	let team2UnselectedTextColor = $derived(getColorForDarkBackground($team2.color));

	// Border color: use white if team color is dark, otherwise use team color
	let team1BorderColor = $derived(getColorForDarkBackground($team1.color));
	let team2BorderColor = $derived(getColorForDarkBackground($team2.color));

	// Team header name color: use white if team color is dark, otherwise use team color
	let team1HeaderColor = $derived(getColorForDarkBackground($team1.color));
	let team2HeaderColor = $derived(getColorForDarkBackground($team2.color));

	function selectTeam1Twenty(count: number) {
		team1Twenty = count;
		// Auto-save and close when both teams have values
		if (team2Twenty !== null) {
			saveAndClose();
		}
	}

	function selectTeam2Twenty(count: number) {
		team2Twenty = count;
		// Auto-save and close when both teams have values
		if (team1Twenty !== null) {
			saveAndClose();
		}
	}

	function saveAndClose() {
		if (team1Twenty !== null && team2Twenty !== null) {
			team1.update(t => ({ ...t, twenty: team1Twenty as number }));
			team2.update(t => ({ ...t, twenty: team2Twenty as number }));
			close();
		}
	}

	function close() {
		// Only allow closing if both teams have selected a value
		if (team1Twenty === null || team2Twenty === null) {
			return; // Don't close if values not selected
		}

		// Reset values
		team1Twenty = null;
		team2Twenty = null;
		isOpen = false;
		onclose?.();
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="dialog" onclick={stopPropagation}>
			<p class="title">{m.scoring_twentyDialogTitle()}</p>
			<div class="teams">
				<div class="team-column">
					<span class="team-name" style="color: {team1HeaderColor}">{team1Name}</span>
					<div class="number-grid">
						{#each numbers as num}
							<button
								class="num-btn"
								class:selected={team1Twenty === num}
								style="--team-color: {$team1.color}; --text-selected: {team1SelectedTextColor}; --text-unselected: {team1UnselectedTextColor}; --border-color: {team1BorderColor};"
								onclick={() => selectTeam1Twenty(num)}
							>
								{num}
							</button>
						{/each}
					</div>
				</div>

				<div class="team-column">
					<span class="team-name" style="color: {team2HeaderColor}">{team2Name}</span>
					<div class="number-grid">
						{#each numbers as num}
							<button
								class="num-btn"
								class:selected={team2Twenty === num}
								style="--team-color: {$team2.color}; --text-selected: {team2SelectedTextColor}; --text-unselected: {team2UnselectedTextColor}; --border-color: {team2BorderColor};"
								onclick={() => selectTeam2Twenty(num)}
							>
								{num}
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.dialog {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 2rem;
		width: min(700px, 94vw);
		max-height: 90vh;
		overflow-y: auto;
	}

	.title {
		margin: 0 0 1.25rem 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
	}

	.teams {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 3rem;
	}

	.team-column {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.team-name {
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.number-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.num-btn {
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--border-color) 30%, transparent);
		border-radius: 8px;
		font-family: 'Lexend', sans-serif;
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--text-unselected);
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.num-btn:hover {
		background: color-mix(in srgb, var(--team-color) 15%, transparent);
		border-color: color-mix(in srgb, var(--border-color) 50%, transparent);
	}

	.num-btn:active {
		transform: scale(0.96);
	}

	.num-btn.selected {
		background: var(--team-color);
		border-color: var(--team-color);
		color: var(--text-selected);
	}

	@media (max-width: 480px) {
		.dialog {
			padding: 1.25rem;
		}

		.title {
			font-size: 0.9rem;
			margin-bottom: 1rem;
		}

		.teams {
			gap: 1.25rem;
		}

		.team-column {
			gap: 0.75rem;
		}

		.team-name {
			font-size: 0.9rem;
		}

		.number-grid {
			gap: 0.5rem;
		}

		.num-btn {
			font-size: 1.8rem;
			border-radius: 6px;
		}
	}

	@media (max-height: 500px) and (orientation: landscape) {
		.dialog {
			padding: 1rem;
			max-height: 95vh;
		}

		.title {
			font-size: 0.85rem;
			margin-bottom: 0.75rem;
		}

		.teams {
			gap: 1.5rem;
		}

		.team-column {
			gap: 0.5rem;
		}

		.team-name {
			font-size: 0.85rem;
		}

		.number-grid {
			grid-template-columns: repeat(5, 1fr);
			gap: 0.35rem;
		}

		.num-btn {
			font-size: 1.1rem;
			aspect-ratio: auto;
			padding: 0.5rem 0.4rem;
		}
	}
</style>
