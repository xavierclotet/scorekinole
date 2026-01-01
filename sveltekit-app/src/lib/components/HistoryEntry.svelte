<script lang="ts">
	import { t } from '$lib/stores/language';
	import type { MatchHistory } from '$lib/types/history';
	import Button from './Button.svelte';
	import { currentUser } from '$lib/firebase/auth';

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
	$: gameModeText = match.gameMode === 'points' ? `${$t('modePoints')} • ${$t('to')} ${match.pointsToWin}p` : `${$t('modeRounds')} • ${match.roundsToPlay} ${$t('rounds')}`;
	$: gameTypeText = match.gameType === 'singles' ? $t('singles') : $t('doubles');

	// Get all rounds from all games
	$: allRounds = match.games.flatMap(game => game.rounds);

	// Calculate total 20's per team
	$: team1Total20s = allRounds.reduce((sum, r) => sum + (r.team1Twenty || 0), 0);
	$: team2Total20s = allRounds.reduce((sum, r) => sum + (r.team2Twenty || 0), 0);
</script>

<div class="history-entry">
	<!-- Header with date and match info -->
	<div class="entry-date">
		{formatDate(match.startTime)}
	</div>
	<div class="match-summary">
		{gameTypeText} • {gameModeText} • {formatDuration(match.duration)}
	</div>

	<!-- Winner announcement -->
	<div class="winner-announcement">
		<span class="winner-name">
			{winnerName} {$t('wins')}
		</span>
		<span class="match-score">
			{match.games.filter(g => g.winner === 1).length}-{match.games.filter(g => g.winner === 2).length}
		</span>
		• ⭐
		<span class="total-score">
			{match.team1Score}-{match.team2Score}
		</span>
	</div>

	<!-- Cloud sync status -->
	{#if $currentUser}
		<div class="sync-status">
			☁️ {$t('synced')}
		</div>
	{/if}

	<!-- Rounds detail table -->
	{#if allRounds.length > 0}
		<div class="rounds-detail-table">
			<table>
				<thead>
					<tr>
						<th class="team-col"></th>
						{#each allRounds as round, i}
							<th class="round-col">
								R{round.roundNumber}
								{#if round.hammerTeam}
									<span class="hammer-icon">🔨</span>
								{/if}
							</th>
						{/each}
						<th class="total-col">TOTAL</th>
					</tr>
				</thead>
				<tbody>
					<!-- Team 1 row -->
					<tr style="border-left: 3px solid {match.team1Color}">
						<td class="team-name" style="color: {match.team1Color}">{match.team1Name}</td>
						{#each allRounds as round}
							<td class="round-points">{round.team1Points}</td>
						{/each}
						<td class="total-points">{match.team1Score}-{match.team2Score}</td>
					</tr>

					<!-- Team 2 row (if needed for 20's) -->
					{#if team1Total20s > 0 || team2Total20s > 0}
						<tr class="twenties-row">
							<td class="team-label">Total 20's</td>
							{#each allRounds as round}
								<td class="twenty-count">{round.team1Twenty || 0}</td>
							{/each}
							<td class="total-twenties">{team1Total20s}</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Actions -->
	<div class="entry-actions">
		{#if onDelete}
			<Button variant="danger" size="small" on:click={onDelete}>
				🗑️ {$t('delete')}
			</Button>
		{/if}
		{#if onRestore}
			<Button variant="primary" size="small" on:click={onRestore}>
				{$t('restore')}
			</Button>
		{/if}
		{#if onPermanentDelete}
			<Button variant="danger" size="small" on:click={onPermanentDelete}>
				{$t('deletePermanent')}
			</Button>
		{/if}
	</div>
</div>

<style>
	.history-entry {
		background: rgba(10, 14, 26, 0.95);
		border: 2px solid rgba(0, 255, 136, 0.3);
		border-radius: 12px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition: all 0.2s;
		font-family: 'Orbitron', monospace;
	}

	.history-entry:hover {
		border-color: rgba(0, 255, 136, 0.5);
		box-shadow: 0 4px 12px rgba(0, 255, 136, 0.2);
	}

	.entry-date {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 600;
	}

	.match-summary {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.winner-announcement {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.5rem 0;
	}

	.winner-name {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.9);
	}

	.match-score,
	.total-score {
		color: rgba(255, 255, 255, 0.9);
	}

	.sync-status {
		font-size: 0.8rem;
		color: var(--accent-green, #00ff88);
		font-weight: 600;
		padding: 0.25rem 0;
	}

	.rounds-detail-table {
		overflow-x: auto;
		margin: 0.5rem 0;
	}

	.rounds-detail-table table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.75rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: hidden;
	}

	.rounds-detail-table th {
		background: rgba(0, 255, 136, 0.1);
		color: #00ff88;
		padding: 0.5rem;
		font-weight: 700;
		text-align: center;
		font-size: 0.7rem;
		border-bottom: 2px solid rgba(0, 255, 136, 0.3);
	}

	.rounds-detail-table th.team-col {
		text-align: left;
		min-width: 80px;
	}

	.rounds-detail-table th.round-col {
		min-width: 50px;
	}

	.rounds-detail-table th.total-col {
		min-width: 60px;
		font-weight: 900;
	}

	.rounds-detail-table td {
		padding: 0.5rem;
		text-align: center;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.rounds-detail-table .team-name,
	.rounds-detail-table .team-label {
		text-align: left;
		font-weight: 700;
		padding-left: 0.75rem;
	}

	.rounds-detail-table .round-points {
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
	}

	.rounds-detail-table .total-points {
		font-weight: 900;
		font-size: 0.85rem;
		color: #fff;
	}

	.rounds-detail-table .twenties-row {
		background: rgba(255, 215, 0, 0.1);
		border-left: 3px solid #ffd700;
	}

	.rounds-detail-table .team-label {
		color: #ffd700;
		font-size: 0.7rem;
	}

	.rounds-detail-table .twenty-count {
		color: #ffd700;
		font-weight: 600;
	}

	.rounds-detail-table .total-twenties {
		color: #ffd700;
		font-weight: 900;
		font-size: 0.85rem;
	}

	.hammer-icon {
		font-size: 0.6rem;
		margin-left: 2px;
	}

	.entry-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	/* Responsive */
	@media (max-width: 600px) {
		.history-entry {
			padding: 0.75rem;
		}

		.rounds-detail-table table {
			font-size: 0.7rem;
		}

		.rounds-detail-table th,
		.rounds-detail-table td {
			padding: 0.35rem;
		}

		.entry-actions {
			flex-direction: column;
		}

		.entry-actions :global(button) {
			width: 100%;
		}
	}
</style>
