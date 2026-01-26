<script lang="ts">
	import { team1, team2 } from '$lib/stores/teams';
	import { t } from '$lib/stores/language';
	import Button from './Button.svelte';

	interface RoundData {
		team1Points?: number;
		team2Points?: number;
		team1Twenty?: number;
		team2Twenty?: number;
	}

	interface SaveData {
		roundIndex: number;
		team1Points: number;
		team2Points: number;
		team1Twenty: number;
		team2Twenty: number;
	}

	interface Props {
		isOpen?: boolean;
		roundIndex?: number;
		roundData?: RoundData | null;
		onclose?: () => void;
		onsave?: (data: SaveData) => void;
	}

	let { isOpen = $bindable(false), roundIndex = 0, roundData = null, onclose, onsave }: Props = $props();

	let team1Points = $state(0);
	let team2Points = $state(0);
	let team1Twenty = $state(0);
	let team2Twenty = $state(0);

	$effect(() => {
		if (isOpen && roundData) {
			team1Points = roundData.team1Points || 0;
			team2Points = roundData.team2Points || 0;
			team1Twenty = roundData.team1Twenty || 0;
			team2Twenty = roundData.team2Twenty || 0;
		}
	});

	function save() {
		onsave?.({
			roundIndex,
			team1Points,
			team2Points,
			team1Twenty,
			team2Twenty
		});
		close();
	}

	function close() {
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
				<span class="modal-title">{$t('edit')} {$t('round')} {roundIndex + 1}</span>
			</div>
			<div class="modal-content">
				<div class="columns">
					<!-- Team 1 Column -->
					<div class="team-column" style="--team-color: {$team1.color}">
						<div class="team-header">
							<span>{$team1.name || 'Team 1'}</span>
						</div>
						<div class="input-group">
							<label for="editTeam1Points" class="label">{$t('roundPoints')}:</label>
							<input
								id="editTeam1Points"
								type="number"
								class="input"
								bind:value={team1Points}
								min="0"
								max="20"
							/>
						</div>
						<div class="input-group">
							<label for="editTeam1Twenty" class="label">20s:</label>
							<input
								id="editTeam1Twenty"
								type="number"
								class="input"
								bind:value={team1Twenty}
								min="0"
								max="12"
							/>
						</div>
					</div>

					<!-- Team 2 Column -->
					<div class="team-column" style="--team-color: {$team2.color}">
						<div class="team-header">
							<span>{$team2.name || 'Team 2'}</span>
						</div>
						<div class="input-group">
							<label for="editTeam2Points" class="label">{$t('roundPoints')}:</label>
							<input
								id="editTeam2Points"
								type="number"
								class="input"
								bind:value={team2Points}
								min="0"
								max="20"
							/>
						</div>
						<div class="input-group">
							<label for="editTeam2Twenty" class="label">20s:</label>
							<input
								id="editTeam2Twenty"
								type="number"
								class="input"
								bind:value={team2Twenty}
								min="0"
								max="12"
							/>
						</div>
					</div>
				</div>

				<div class="actions">
					<Button variant="secondary" onclick={close}>
						{$t('cancel')}
					</Button>
					<Button variant="primary" onclick={save}>
						{$t('save')}
					</Button>
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
		width: 600px;
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

	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}

	.team-column {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.team-header {
		background: var(--team-color);
		color: #000;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		font-weight: 700;
		text-align: center;
		font-size: 1.1rem;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: #fff;
		font-size: 1rem;
		font-family: 'Orbitron', monospace;
		font-weight: 600;
		transition: all 0.2s;
	}

	.input:focus {
		outline: none;
		border-color: #00ff88;
		background: rgba(255, 255, 255, 0.15);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		margin-top: 1rem;
	}

	@media (max-width: 768px) {
		.modal {
			width: 90%;
		}

		.modal-title {
			font-size: 1.25rem;
		}

		.columns {
			grid-template-columns: 1fr;
			gap: 1rem;
		}
	}
</style>
