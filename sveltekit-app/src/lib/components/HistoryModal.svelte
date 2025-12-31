<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import HistoryEntry from './HistoryEntry.svelte';
	import { t } from '$lib/stores/language';
	import { team1, team2 } from '$lib/stores/teams';
	import {
		matchHistory,
		deletedMatches,
		currentMatch,
		activeHistoryTab,
		deleteMatch,
		restoreMatch,
		permanentlyDeleteMatch,
		clearHistory,
		clearDeletedMatches
	} from '$lib/stores/history';
	import type { HistoryTab } from '$lib/types/history';

	export let isOpen: boolean = false;
	export let onClose: () => void = () => {};

	function handleTabChange(tab: HistoryTab) {
		activeHistoryTab.set(tab);
	}

	function handleDelete(matchId: string) {
		deleteMatch(matchId);
	}

	function handleRestore(matchId: string) {
		restoreMatch(matchId);
	}

	function handlePermanentDelete(matchId: string) {
		permanentlyDeleteMatch(matchId);
	}

	function handleClearHistory() {
		clearHistory();
	}

	function handleClearDeleted() {
		clearDeletedMatches();
	}
</script>

<Modal {isOpen} title={$t('matchHistory')} onClose={onClose}>
	<div class="history-modal">
		<!-- Tabs Navigation -->
		<div class="tabs">
			<button
				class="tab"
				class:active={$activeHistoryTab === 'current'}
				on:click={() => handleTabChange('current')}
				type="button"
			>
				{$t('currentMatch')}
			</button>
			<button
				class="tab"
				class:active={$activeHistoryTab === 'history'}
				on:click={() => handleTabChange('history')}
				type="button"
			>
				{$t('matchHistory')} ({$matchHistory.length})
			</button>
			<button
				class="tab"
				class:active={$activeHistoryTab === 'deleted'}
				on:click={() => handleTabChange('deleted')}
				type="button"
			>
				{$t('deleted')} ({$deletedMatches.length})
			</button>
		</div>

		<!-- Tab Content -->
		<div class="tab-content">
			{#if $activeHistoryTab === 'current'}
				<!-- Current Match Tab -->
				<div class="current-match-tab">
					{#if $currentMatch && $currentMatch.rounds.length > 0}
						<div class="current-match-info">
							<p class="status-badge">{$t('inProgress')}</p>
							<div class="match-summary">
								<p><strong>{$t('roundsPlayed')}:</strong> {$currentMatch.rounds.length}</p>
								<p><strong>{$t('duration')}:</strong> {Math.floor((Date.now() - $currentMatch.startTime) / 60000)}m</p>
							</div>

							<!-- Rounds Table -->
							<div class="rounds-table">
								<div class="rounds-header">
									<span class="round-num">#</span>
									<span class="round-team">Team 1</span>
									<span class="round-team">Team 2</span>
								</div>
								{#each $currentMatch.rounds as round}
									<div class="round-row">
										<span class="round-num">{round.roundNumber}</span>
										<span class="round-points" class:winner={round.team1Points > round.team2Points}>
											{round.team1Points}
										</span>
										<span class="round-points" class:winner={round.team2Points > round.team1Points}>
											{round.team2Points}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="empty-state">
							<p>{$t('noCurrentMatch')}</p>
						</div>
					{/if}
				</div>
			{:else if $activeHistoryTab === 'history'}
				<!-- History Tab -->
				<div class="history-tab">
					{#if $matchHistory.length > 0}
						<div class="history-actions">
							<Button variant="danger" size="small" on:click={handleClearHistory}>
								{$t('delete')} {$t('matchHistory')}
							</Button>
						</div>
						<div class="history-list">
							{#each $matchHistory as match (match.id)}
								<HistoryEntry
									{match}
									onDelete={() => handleDelete(match.id)}
								/>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<p>{$t('noHistory')}</p>
						</div>
					{/if}
				</div>
			{:else if $activeHistoryTab === 'deleted'}
				<!-- Deleted Tab -->
				<div class="deleted-tab">
					{#if $deletedMatches.length > 0}
						<div class="deleted-actions">
							<Button variant="danger" size="small" on:click={handleClearDeleted}>
								{$t('deletePermanent')}
							</Button>
						</div>
						<div class="deleted-list">
							{#each $deletedMatches as match (match.id)}
								<HistoryEntry
									{match}
									onRestore={() => handleRestore(match.id)}
									onPermanentDelete={() => handlePermanentDelete(match.id)}
								/>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<p>{$t('noDeletedMatches')}</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<div class="modal-actions" slot="actions">
		<Button variant="secondary" on:click={onClose}>
			{$t('close')}
		</Button>
	</div>
</Modal>

<style>
	.history-modal {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-height: 400px;
		max-height: 70vh;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		border-bottom: 2px solid rgba(255, 255, 255, 0.1);
		overflow-x: auto;
	}

	.tab {
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: none;
		border-bottom: 3px solid transparent;
		color: rgba(255, 255, 255, 0.6);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.tab:hover {
		color: rgba(255, 255, 255, 0.8);
		background: rgba(255, 255, 255, 0.05);
	}

	.tab.active {
		color: var(--accent-green, #00ff88);
		border-bottom-color: var(--accent-green, #00ff88);
	}

	.tab-content {
		flex: 1;
		overflow-y: auto;
	}

	.current-match-tab,
	.history-tab,
	.deleted-tab {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.current-match-info {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.status-badge {
		display: inline-block;
		background: var(--accent-green, #00ff88);
		color: #000;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-weight: 700;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}

	.match-summary {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.match-summary p {
		margin: 0;
		color: rgba(255, 255, 255, 0.8);
	}

	.rounds-table {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		overflow: hidden;
	}

	.rounds-header {
		display: grid;
		grid-template-columns: 50px 1fr 1fr;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--accent-green, #00ff88);
		border-bottom: 2px solid rgba(0, 255, 136, 0.2);
	}

	.round-num {
		text-align: center;
	}

	.round-team {
		text-align: center;
	}

	.round-row {
		display: grid;
		grid-template-columns: 50px 1fr 1fr;
		gap: 0.5rem;
		padding: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.round-row:last-child {
		border-bottom: none;
	}

	.round-points {
		text-align: center;
		font-size: 1.1rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.6);
	}

	.round-points.winner {
		color: var(--accent-green, #00ff88);
		font-weight: 700;
	}

	.history-actions,
	.deleted-actions {
		display: flex;
		justify-content: flex-end;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.history-list,
	.deleted-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		text-align: center;
		color: rgba(255, 255, 255, 0.5);
	}

	.empty-state p {
		font-size: 1.1rem;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	/* Scrollbar styling */
	.tab-content::-webkit-scrollbar {
		width: 8px;
	}

	.tab-content::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
	}

	.tab-content::-webkit-scrollbar-thumb {
		background: var(--accent-green, #00ff88);
		border-radius: 4px;
	}

	.tab-content::-webkit-scrollbar-thumb:hover {
		background: var(--accent-green-light, #00ffaa);
	}

	/* Responsive */
	@media (max-width: 600px) {
		.history-modal {
			max-height: 60vh;
		}

		.tabs {
			gap: 0.25rem;
		}

		.tab {
			padding: 0.5rem 1rem;
			font-size: 0.9rem;
		}
	}
</style>
