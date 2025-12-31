<script lang="ts">
	import { t } from '$lib/stores/language';
	import type { MatchHistory } from '$lib/types/history';
	import Button from './Button.svelte';

	export let match: MatchHistory;
	export let onRestore: (() => void) | null = null;
	export let onDelete: (() => void) | null = null;
	export let onPermanentDelete: (() => void) | null = null;

	function formatDuration(milliseconds: number): string {
		const seconds = Math.floor(milliseconds / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		}
		return `${minutes}m ${seconds % 60}s`;
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	$: winnerName = match.winner === 1 ? match.team1Name : match.winner === 2 ? match.team2Name : '-';
	$: isTie = match.winner === null;
</script>

<div class="history-entry">
	<div class="entry-header">
		<div class="match-info">
			<div class="teams">
				<span class="team" style="color: {match.team1Color}">
					{match.team1Name}
				</span>
				<span class="vs">vs</span>
				<span class="team" style="color: {match.team2Color}">
					{match.team2Name}
				</span>
			</div>
			{#if match.eventTitle}
				<div class="event-title">{match.eventTitle}</div>
			{/if}
		</div>
		<div class="match-score">
			<span class="score" class:winner={match.winner === 1}>{match.team1Score}</span>
			<span class="separator">-</span>
			<span class="score" class:winner={match.winner === 2}>{match.team2Score}</span>
		</div>
	</div>

	<div class="entry-details">
		<div class="detail-row">
			<span class="label">{$t('duration')}:</span>
			<span class="value">{formatDuration(match.duration)}</span>
		</div>
		<div class="detail-row">
			<span class="label">{$t('gameMode')}:</span>
			<span class="value">
				{match.gameMode === 'points' ? $t('modePoints') : $t('modeRounds')}
			</span>
		</div>
		<div class="detail-row">
			<span class="label">{$t('gameType')}:</span>
			<span class="value">
				{match.gameType === 'singles' ? $t('singles') : $t('doubles')}
			</span>
		</div>
		{#if match.totalRounds !== undefined}
			<div class="detail-row">
				<span class="label">{$t('rounds')}:</span>
				<span class="value">{match.totalRounds}</span>
			</div>
		{/if}
		{#if match.gameMode === 'rounds' && match.team1Rounds !== undefined && match.team2Rounds !== undefined}
			<div class="detail-row">
				<span class="label">{$t('roundsWon')}:</span>
				<span class="value">{match.team1Rounds} - {match.team2Rounds}</span>
			</div>
		{/if}
		<div class="detail-row">
			<span class="label">{isTie ? $t('tie') : $t('winner')}:</span>
			<span class="value winner-text">{winnerName}</span>
		</div>
	</div>

	<div class="entry-meta">
		<span class="date">{formatDate(match.startTime)}</span>
		<div class="actions">
			{#if onRestore}
				<Button variant="primary" size="small" on:click={onRestore}>
					{$t('restore')}
				</Button>
			{/if}
			{#if onDelete}
				<Button variant="danger" size="small" on:click={onDelete}>
					{$t('delete')}
				</Button>
			{/if}
			{#if onPermanentDelete}
				<Button variant="danger" size="small" on:click={onPermanentDelete}>
					{$t('deletePermanent')}
				</Button>
			{/if}
		</div>
	</div>
</div>

<style>
	.history-entry {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		transition: all 0.2s;
	}

	.history-entry:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.entry-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}

	.match-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.teams {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.team {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.vs {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.9rem;
	}

	.event-title {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.7);
		font-style: italic;
	}

	.match-score {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 2rem;
		font-weight: 900;
	}

	.score {
		color: rgba(255, 255, 255, 0.6);
		transition: all 0.2s;
	}

	.score.winner {
		color: var(--accent-green, #00ff88);
		transform: scale(1.1);
	}

	.separator {
		color: rgba(255, 255, 255, 0.3);
		font-size: 1.5rem;
	}

	.entry-details {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.detail-row {
		display: flex;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.label {
		color: rgba(255, 255, 255, 0.6);
	}

	.value {
		color: #fff;
		font-weight: 600;
	}

	.winner-text {
		color: var(--accent-green, #00ff88);
	}

	.entry-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.date {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	/* Responsive */
	@media (max-width: 600px) {
		.entry-header {
			flex-direction: column;
		}

		.match-score {
			font-size: 1.5rem;
		}

		.entry-details {
			grid-template-columns: 1fr;
		}

		.entry-meta {
			flex-direction: column;
			gap: 1rem;
			align-items: flex-start;
		}

		.actions {
			width: 100%;
			flex-direction: column;
		}

		.actions :global(button) {
			width: 100%;
		}
	}
</style>
