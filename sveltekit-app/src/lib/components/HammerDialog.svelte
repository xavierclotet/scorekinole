<script lang="ts">
	import { team1, team2 } from '$lib/stores/teams';
	import { t } from '$lib/stores/language';
	import { createEventDispatcher } from 'svelte';

	export let isOpen: boolean = false;

	const dispatch = createEventDispatcher();

	function selectStartingTeam(teamNumber: 1 | 2) {
		// The starting team does NOT have the hammer
		// The other team gets the hammer
		if (teamNumber === 1) {
			team1.update(t => ({ ...t, hasHammer: false }));
			team2.update(t => ({ ...t, hasHammer: true }));
		} else {
			team1.update(t => ({ ...t, hasHammer: true }));
			team2.update(t => ({ ...t, hasHammer: false }));
		}

		close();
	}

	function close() {
		isOpen = false;
		dispatch('close');
	}
</script>

{#if isOpen}
	<div class="modal-overlay" on:click={close} role="button" tabindex="-1">
		<div class="modal" on:click|stopPropagation role="dialog">
			<div class="modal-header">
				<span class="modal-title">{$t('hammerDialogTitle')}</span>
			</div>
			<div class="modal-content">
				<div class="buttons">
					<button
						class="team-btn"
						style="background: {$team1.color}; border-color: {$team1.color};"
						on:click={() => selectStartingTeam(1)}
					>
						{$team1.name || 'Team 1'}
					</button>
					<button
						class="team-btn"
						style="background: {$team2.color}; border-color: {$team2.color};"
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

	.buttons {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.team-btn {
		padding: 1.5rem;
		border: 3px solid;
		border-radius: 12px;
		color: #000;
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

	@media (max-width: 768px) {
		.modal {
			width: 90%;
		}

		.modal-title {
			font-size: 1.25rem;
		}

		.team-btn {
			font-size: 1rem;
			padding: 1.25rem;
		}
	}
</style>
