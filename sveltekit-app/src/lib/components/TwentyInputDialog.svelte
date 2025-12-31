<script lang="ts">
	import { team1, team2 } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { t } from '$lib/stores/language';
	import { createEventDispatcher } from 'svelte';

	export let isOpen: boolean = false;

	const dispatch = createEventDispatcher();

	$: team1Name = $team1.name || 'Team 1';
	$: team2Name = $team2.name || 'Team 2';

	// Calculator buttons: max depends on game type
	// Singles: 0-8 (8 discs per player)
	// Doubles: 0-12 (6 discs per player × 2 players)
	$: maxTwenty = $gameSettings.gameType === 'singles' ? 8 : 12;
	$: numbers = Array.from({ length: maxTwenty + 1 }, (_, i) => i);

	let team1Twenty: number | null = null;
	let team2Twenty: number | null = null;

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
		// Reset values
		team1Twenty = null;
		team2Twenty = null;
		isOpen = false;
		dispatch('close');
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="modal-overlay" on:click={close}>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal" on:click|stopPropagation>
			<div class="modal-header">
				<span class="modal-title">{$t('twentyDialogTitle')}</span>
			</div>
			<div class="modal-content">
				<!-- Team 1 Section -->
				<div class="team-section">
					<div class="team-header" style="color: {$team1.color}">
						{team1Name}
					</div>
					<div class="calculator">
						{#each numbers as num}
							<button
								class="calc-btn"
								class:selected={team1Twenty === num}
								on:click={() => selectTeam1Twenty(num)}
							>
								{num}
							</button>
						{/each}
					</div>
				</div>

				<!-- Team 2 Section -->
				<div class="team-section">
					<div class="team-header" style="color: {$team2.color}">
						{team2Name}
					</div>
					<div class="calculator">
						{#each numbers as num}
							<button
								class="calc-btn"
								class:selected={team2Twenty === num}
								on:click={() => selectTeam2Twenty(num)}
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
		width: 50%;
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

	.team-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.team-header {
		font-size: 1.25rem;
		font-weight: 700;
		text-align: center;
		font-family: 'Orbitron', monospace;
	}

	.selected-value {
		text-align: center;
		font-size: 2rem;
		font-weight: 700;
		color: #00ff88;
		font-family: 'Orbitron', monospace;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.calculator {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.75rem;
	}

	.calc-btn {
		padding: 1rem;
		background: rgba(0, 255, 136, 0.1);
		border: 2px solid #00ff88;
		border-radius: 12px;
		color: #00ff88;
		font-size: 1.25rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
		font-family: 'Orbitron', monospace;
	}

	.calc-btn:hover {
		background: rgba(0, 255, 136, 0.2);
		transform: scale(1.05);
	}

	.calc-btn:active {
		transform: scale(0.95);
	}

	.calc-btn.selected {
		background: #00ff88;
		color: #000;
		box-shadow: 0 0 20px rgba(0, 255, 136, 0.6);
		transform: scale(1.1);
	}

	@media (max-width: 768px) {
		.modal {
			width: 90%;
		}

		.modal-title {
			font-size: 1.25rem;
		}

		.calculator {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.5rem;
		}

		.calc-btn {
			padding: 1.25rem;
			font-size: 1.25rem;
		}
	}

	@media (max-width: 480px) {
		.calculator {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.4rem;
		}

		.calc-btn {
			padding: 1rem;
			font-size: 1.1rem;
		}
	}
</style>
