<script lang="ts">
	import { t } from '$lib/stores/language';
	import { gameSettings } from '$lib/stores/gameSettings';
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
	$: gameModeText = match.gameMode === 'points' ? `${$t('modePoints')} • ${$t('to')} ${match.pointsToWin}p` : `${$t('modeRounds')} • ${match.roundsToPlay} ${$t('rounds')}`;
	$: gameTypeText = match.gameType === 'singles' ? $t('singles') : $t('doubles');

	// Calculate games won by each team
	$: team1GamesWon = match.games.filter(g => g.winner === 1).length;
	$: team2GamesWon = match.games.filter(g => g.winner === 2).length;
</script>

<div class="history-entry">
	<!-- Header with date and delete button -->
	<div class="entry-header">
		<div class="entry-header-info">
			<div class="entry-date">
				{formatDate(match.startTime)}
			</div>
			<div class="match-summary">
				{gameTypeText} • {gameModeText} • {formatDuration(match.duration)}
			</div>
		</div>
		{#if onDelete}
			<button class="delete-button" on:click={onDelete}>
				🗑️ {$t('delete')}
			</button>
		{/if}
	</div>

	<!-- Match Score Summary -->
	<div class="match-score-summary">
		<!-- Match total on the left (only show for multi-game matches in points mode) -->
		{#if match.gameMode === 'points' && match.matchesToWin > 1}
			<div class="match-total-summary">
				<span class="match-label">Match:</span>
				<span class="match-result" style="color: {team1GamesWon > team2GamesWon ? '#00ff88' : '#fff'};">{team1GamesWon}</span>
				<span>-</span>
				<span class="match-result" style="color: {team2GamesWon > team1GamesWon ? '#00ff88' : '#fff'};">{team2GamesWon}</span>
				{#if $currentUser}
					<span class="sync-badge">☁️</span>
				{/if}
			</div>
		{/if}
		<!-- Game results on the right -->
		<div class="games-results">
			{#each match.games as game}
				{@const winnerName = game.winner === 1 ? match.team1Name : match.team2Name}
				{@const winnerPoints = game.team1Points}
				{@const loserPoints = game.team2Points}
				{@const winner20s = game.winner === 1
					? (game.rounds?.reduce((sum, r) => sum + r.team1Twenty, 0) ?? 0)
					: (game.rounds?.reduce((sum, r) => sum + r.team2Twenty, 0) ?? 0)}
				<div class="game-result-summary">
					<span class="game-number">P{game.gameNumber}:</span>
					<span class="winner-name">{winnerName} {$t('gana')}</span>
					<span class="score">{winnerPoints}-{loserPoints}</span>
					{#if $gameSettings.show20s && winner20s > 0}
						<span class="twenties-summary">⭐ {winner20s}</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Games Table (same structure as HistoryModal) -->
	{#if match.games.length > 0}
		<div class="games-section">
			{#each match.games as game, gameIndex}
				<div class="game-table">
					<!-- Table Header -->
					<div class="game-row header">
						<span class="team-name">
							{$t('game')} {gameIndex + 1}
						</span>
						{#each game.rounds as _, idx}
							<span class="round-col">R{idx + 1}</span>
						{/each}
						<span class="total-col">{$t('total').toUpperCase()}</span>
					</div>

					<!-- Team 1 Row -->
					<div class="game-row">
						<span class="team-name">
							{match.team1Name}
						</span>
						{#each game.rounds as round}
							<span class="round-col">
								<span class="points-with-hammer">
									{#if round.hammerTeam === 1}
										<span class="hammer-indicator">🔨</span>
									{/if}
									{round.team1Points}
								</span>
								{#if $gameSettings.show20s && round.team1Twenty > 0}
									<span class="twenty-indicator">⭐{round.team1Twenty}</span>
								{/if}
							</span>
						{/each}
						<span class="total-col total-score">
							{game.team1Points}
							{#if $gameSettings.show20s}
								{@const total20s = game.rounds.reduce((sum, r) => sum + r.team1Twenty, 0)}
								{#if total20s > 0}
									<span class="twenty-indicator">⭐{total20s}</span>
								{/if}
							{/if}
						</span>
					</div>

					<!-- Team 2 Row -->
					<div class="game-row">
						<span class="team-name">
							{match.team2Name}
						</span>
						{#each game.rounds as round}
							<span class="round-col">
								<span class="points-with-hammer">
									{#if round.hammerTeam === 2}
										<span class="hammer-indicator">🔨</span>
									{/if}
									{round.team2Points}
								</span>
								{#if $gameSettings.show20s && round.team2Twenty > 0}
									<span class="twenty-indicator">⭐{round.team2Twenty}</span>
								{/if}
							</span>
						{/each}
						<span class="total-col total-score">
							{game.team2Points}
							{#if $gameSettings.show20s}
								{@const total20s = game.rounds.reduce((sum, r) => sum + r.team2Twenty, 0)}
								{#if total20s > 0}
									<span class="twenty-indicator">⭐{total20s}</span>
								{/if}
							{/if}
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Actions (only for deleted matches) -->
	{#if onRestore || onPermanentDelete}
		<div class="entry-actions">
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
	{/if}
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

	.entry-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.entry-header-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
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

	.delete-button {
		background: rgba(255, 59, 48, 0.15);
		border: 1px solid rgba(255, 59, 48, 0.3);
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
		color: #ff3b30;
		font-family: 'Orbitron', monospace;
		white-space: nowrap;
	}

	.delete-button:hover {
		background: rgba(255, 59, 48, 0.25);
		border-color: rgba(255, 59, 48, 0.5);
		transform: scale(1.05);
	}

	.delete-button:active {
		transform: scale(0.95);
	}

	/* Match Score Summary */
	.match-score-summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		font-family: 'Orbitron', monospace;
		font-weight: 700;
	}

	.match-total-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		flex-shrink: 0;
	}

	.match-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
	}

	.match-result {
		font-size: 1.2rem;
	}

	.sync-badge {
		color: var(--accent-green, #00ff88);
		font-size: 1rem;
		margin-left: 0.25rem;
	}

	.games-results {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		justify-content: flex-start;
		flex: 1;
		align-items: flex-end;
	}

	.game-result-summary {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.game-number {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.7rem;
	}

	.winner-name {
		font-weight: 700;
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.75rem;
	}

	.score {
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.8rem;
	}

	.twenties-summary {
		color: var(--accent-green, #00ff88);
		font-size: 0.75rem;
	}

	/* Games Section */
	.games-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.game-table {
		background: rgba(255, 255, 255, 0.03);
		border-radius: 8px;
		overflow: hidden;
	}

	.game-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		align-items: center;
	}

	.game-row.header {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		font-weight: 700;
		font-size: 0.85rem;
		color: var(--accent-green, #00ff88);
		margin-bottom: 0.25rem;
	}

	.game-row .team-name {
		width: 160px;
		flex-shrink: 0;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: #f0f0f0;
	}

	.game-row .round-col {
		flex: 1;
		min-width: 40px;
		text-align: center;
		font-size: 0.95rem;
		color: rgba(255, 255, 255, 0.7);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		align-items: center;
	}

	.points-with-hammer {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		justify-content: center;
	}

	.hammer-indicator {
		font-size: 0.6rem;
		opacity: 0.8;
	}

	.twenty-indicator {
		font-size: 0.7rem;
		color: var(--accent-green, #00ff88);
		font-weight: 600;
	}

	.game-row .total-col {
		text-align: center;
		font-weight: 700;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.6);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		align-items: center;
	}

	.game-row .total-col.total-score {
		font-size: 1.1rem;
		color: var(--accent-green, #00ff88);
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

		.game-row .team-name {
			width: 120px;
		}

		.entry-actions {
			flex-direction: column;
		}

		.entry-actions :global(button) {
			width: 100%;
		}
	}
</style>
