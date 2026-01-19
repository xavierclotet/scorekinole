<script lang="ts">
	import { team1, team2 } from '$lib/stores/teams';
	import { t } from '$lib/stores/language';
	import { setCurrentGameStartHammer } from '$lib/stores/matchState';
	import { createEventDispatcher } from 'svelte';

	export let isOpen: boolean = false;

	const dispatch = createEventDispatcher();

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

	// Button text: use white if team color is dark, black if light (since button bg is team color)
	$: team1TextColor = $team1.color && isDarkColor($team1.color) ? '#ffffff' : '#000000';
	$: team2TextColor = $team2.color && isDarkColor($team2.color) ? '#ffffff' : '#000000';

	// Border color: use white if team color is dark, otherwise use team color
	// @ts-expect-error - Used in template style binding
	$: team1BorderColor = $team1.color && isDarkColor($team1.color) ? '#ffffff' : $team1.color;
	// @ts-expect-error - Used in template style binding
	$: team2BorderColor = $team2.color && isDarkColor($team2.color) ? '#ffffff' : $team2.color;

	function selectStartingTeam(teamNumber: 1 | 2) {
		// The starting team does NOT have the hammer
		// The other team gets the hammer
		const hammerTeam = teamNumber === 1 ? 2 : 1;

		if (teamNumber === 1) {
			team1.update(t => ({ ...t, hasHammer: false }));
			team2.update(t => ({ ...t, hasHammer: true }));
		} else {
			team1.update(t => ({ ...t, hasHammer: true }));
			team2.update(t => ({ ...t, hasHammer: false }));
		}

		// Track who has hammer at the start of this game (for alternating in multi-game matches)
		setCurrentGameStartHammer(hammerTeam);
		console.log(`🔨 Game start: Team ${hammerTeam} has hammer, Team ${teamNumber} starts`);

		close();
	}

	function close() {
		isOpen = false;
		dispatch('close');
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="modal-overlay">
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal" on:click|stopPropagation>
			<div class="modal-header">
				<span class="modal-title">{$t('hammerDialogTitle')}</span>
			</div>
			<div class="modal-content">
				<div class="buttons">
					<button
						class="team-btn"
						style="background: {$team1.color}; border-color: {team1BorderColor}; color: {team1TextColor};"
						on:click={() => selectStartingTeam(1)}
					>
						{$team1.name || 'Team 1'}
					</button>
					<button
						class="team-btn"
						style="background: {$team2.color}; border-color: {team2BorderColor}; color: {team2TextColor};"
						on:click={() => selectStartingTeam(2)}
					>
						{$team2.name || 'Team 2'}
					</button>
				</div>
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
		width: 35%;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal-header {
		margin-bottom: 1.5rem;
	}

	.modal-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: #fff;
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.team-btn {
		padding: 1.5rem;
		border: 3px solid;
		border-radius: 12px;
		font-size: 1.25rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
		font-family: 'Orbitron', monospace;
	}

	.team-btn:hover {
		transform: scale(1.05);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.team-btn:active {
		transform: scale(0.98);
	}

	@media (max-width: 1024px) {
		.modal {
			width: 50%;
		}
	}

	@media (max-width: 768px) {
		.modal {
			width: 70%;
		}

		.modal-title {
			font-size: 1.25rem;
		}

		.team-btn {
			font-size: 1rem;
			padding: 1.25rem;
		}
	}

	@media (max-width: 480px) {
		.modal {
			width: 90%;
		}

		.team-btn {
			font-size: 0.9rem;
			padding: 1rem;
		}
	}
</style>
