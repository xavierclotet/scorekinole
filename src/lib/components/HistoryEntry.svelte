<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { gameSettings } from '$lib/stores/gameSettings';
	import type { MatchHistory } from '$lib/types/history';
	import Button from './Button.svelte';
	import { currentUser } from '$lib/firebase/auth';
	import { isColorDark } from '$lib/utils/colors';

	interface Props {
		match: MatchHistory;
		onRestore?: (() => void) | null;
		onDelete?: (() => void) | null;
		onPermanentDelete?: (() => void) | null;
		onRetrySync?: (() => void) | null;
	}

	let { match, onRestore = null, onDelete = null, onPermanentDelete = null, onRetrySync = null }: Props = $props();

	let isExpanded = $state(false);

	function toggleExpand() {
		isExpanded = !isExpanded;
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	// Build complete match configuration badges
	let matchConfigBadges = $derived((() => {
		const badges = [];

		// Game type
		badges.push(match.gameType === 'singles' ? `👤 ${m.scoring_singles()}` : `👥 ${m.scoring_doubles()}`);

		// Game mode
		if (match.gameMode === 'rounds') {
			badges.push(`🎯 ${match.roundsToPlay} ${m.scoring_rounds()}`);
		} else {
			if (match.matchesToWin > 1) {
				badges.push(`🎯 ${match.pointsToWin}pts • Win ${match.matchesToWin} games`);
			} else {
				badges.push(`🎯 ${match.pointsToWin} ${m.scoring_points()}`);
			}
		}

		// Additional features
		if (match.showHammer) badges.push('🔨 Hammer');
		if (match.show20s) badges.push('⭐ 20s');

		return badges;
	})());

	// Calculate games won by each team
	let team1GamesWon = $derived(match.games?.filter(g => g.winner === 1).length ?? 0);
	let team2GamesWon = $derived(match.games?.filter(g => g.winner === 2).length ?? 0);

	// Calculate total 20s for each team across all games
	let team1Total20s = $derived(match.games?.reduce((sum, g) =>
		sum + (g.rounds?.reduce((s, r) => s + r.team1Twenty, 0) ?? 0), 0) ?? 0);
	let team2Total20s = $derived(match.games?.reduce((sum, g) =>
		sum + (g.rounds?.reduce((s, r) => s + r.team2Twenty, 0) ?? 0), 0) ?? 0);

	function handleRetrySync(e: MouseEvent) {
		e.stopPropagation();
		onRetrySync?.();
	}

	function handleDelete(e: MouseEvent) {
		e.stopPropagation();
		onDelete?.();
	}

	function handleHeaderKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			toggleExpand();
		}
	}
</script>

<div class="history-entry">
	<!-- Header - Clickable to expand/collapse -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="entry-header" onclick={toggleExpand} onkeydown={handleHeaderKeydown} role="button" tabindex="0">
		<div class="expand-icon" class:expanded={isExpanded}>
			▶
		</div>
		<div class="entry-header-info">
			<div class="entry-title">
				<div class="title-line">
					<span class="title-text">{match.eventTitle || 'Scorekinole'}</span>
					{#if match.matchPhase}
						<span class="phase-separator">·</span>
						<span class="phase">{match.matchPhase}</span>
					{/if}
				</div>
				<span class="entry-date">{formatDate(match.startTime)}</span>
			</div>
			<div class="game-mode-info">
				{#each matchConfigBadges as badge}
					<span class="config-badge">{badge}</span>
				{/each}
			</div>
			<div class="teams-summary">
				<span
					class="team-name-span"
					class:dark-color={isColorDark(match.team1Color)}
					style="color: {match.team1Color}"
				>
					{match.team1Name}
				</span>
				<span class="vs">vs</span>
				<span
					class="team-name-span"
					class:dark-color={isColorDark(match.team2Color)}
					style="color: {match.team2Color}"
				>
					{match.team2Name}
				</span>
				<span class="score-divider">·</span>
				<span class="match-score-header">
					<span class="score-value" class:winner={team1GamesWon > team2GamesWon}>{team1GamesWon}</span>
					<span class="score-separator">-</span>
					<span class="score-value" class:winner={team2GamesWon > team1GamesWon}>{team2GamesWon}</span>
					{#if (match.show20s ?? $gameSettings.show20s) && (team1Total20s > 0 || team2Total20s > 0)}
						<span class="twenties-header">⭐{team1Total20s}-{team2Total20s}</span>
					{/if}
				</span>
			</div>
		</div>
		<div class="header-actions">
			{#if $currentUser}
				{#if match.syncStatus === 'synced'}
					<span class="sync-badge synced">{m.history_synced()}</span>
				{:else if match.syncStatus === 'error'}
					<button
						class="sync-badge error clickable"
						onclick={handleRetrySync}
						type="button"
						title="Click to retry sync"
					>
						❌ Error (retry)
					</button>
				{:else}
					<span class="sync-badge pending">⏳ {m.history_pending()}</span>
				{/if}
			{/if}
			{#if onDelete}
				<button class="delete-button" onclick={handleDelete} type="button">
					🗑️
				</button>
			{/if}
		</div>
	</div>

	<!-- Expandable Detail -->
	{#if isExpanded}
	<div class="match-detail">
	<!-- Games Table -->
	{#if match.games.length > 0}
		<div class="games-section">
			{#each match.games as game, gameIndex}
				<div class="game-table">
					<!-- Table Header -->
					<div class="game-row header">
						<span class="team-name">
							{m.history_game()} {gameIndex + 1}
						</span>
						{#each game.rounds as _, idx}
							<span class="round-col">R{idx + 1}</span>
						{/each}
						<span class="total-col">{m.history_total().toUpperCase()}</span>
					</div>

					<!-- Team 1 Row -->
					<div class="game-row" class:winner-row={game.winner === 1}>
						<span class="team-name">
							{match.team1Name}
						</span>
						{#each game.rounds as round}
							<span class="round-col">
								<span class="points-with-hammer">
									{#if (match.showHammer ?? true) && round.hammerTeam === 1}
										<span class="hammer-indicator">🔨</span>
									{/if}
									{round.team1Points}
								</span>
								{#if (match.show20s ?? $gameSettings.show20s)}
									<span class="twenty-indicator">⭐{round.team1Twenty}</span>
								{/if}
							</span>
						{/each}
						<span class="total-col total-score" class:winner={game.winner === 1}>
							{game.team1Points}
							{#if match.show20s ?? $gameSettings.show20s}
								{@const total20s = game.rounds.reduce((sum, r) => sum + r.team1Twenty, 0)}
								{#if total20s > 0}
									<span class="twenty-indicator">⭐{total20s}</span>
								{/if}
							{/if}
						</span>
					</div>

					<!-- Team 2 Row -->
					<div class="game-row" class:winner-row={game.winner === 2}>
						<span class="team-name">
							{match.team2Name}
						</span>
						{#each game.rounds as round}
							<span class="round-col">
								<span class="points-with-hammer">
									{#if (match.showHammer ?? true) && round.hammerTeam === 2}
										<span class="hammer-indicator">🔨</span>
									{/if}
									{round.team2Points}
								</span>
								{#if (match.show20s ?? $gameSettings.show20s)}
									<span class="twenty-indicator">⭐{round.team2Twenty}</span>
								{/if}
							</span>
						{/each}
						<span class="total-col total-score" class:winner={game.winner === 2}>
							{game.team2Points}
							{#if match.show20s ?? $gameSettings.show20s}
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
				<Button variant="primary" size="small" onclick={onRestore}>
					{m.history_restore()}
				</Button>
			{/if}
			{#if onPermanentDelete}
				<Button variant="danger" size="small" onclick={onPermanentDelete}>
					{m.history_deletePermanent()}
				</Button>
			{/if}
		</div>
	{/if}
	</div>
	{/if}
</div>

<style>
	.history-entry {
		background: var(--secondary);
		border-radius: 8px;
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		transition: all 0.2s;
	}

	.history-entry:hover {
		background: var(--accent);
	}

	.entry-header {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.entry-header:hover {
		opacity: 0.85;
	}

	.expand-icon {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted-foreground);
		font-size: 0.65rem;
		transition: transform 0.2s;
		margin-top: 0.15rem;
	}

	.expand-icon.expanded {
		transform: rotate(90deg);
	}

	.entry-header-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.entry-title {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.title-line {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.title-text {
		font-size: 0.95rem;
		color: var(--foreground);
		font-weight: 600;
	}

	.phase-separator {
		color: var(--muted-foreground);
		font-size: 0.85rem;
		font-weight: 400;
		opacity: 0.5;
	}

	.phase {
		color: var(--muted-foreground);
		font-weight: 500;
		font-size: 0.85rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.sync-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		font-size: 0.6rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.sync-badge.synced {
		background: rgba(76, 175, 80, 0.15);
		border: 1px solid rgba(76, 175, 80, 0.3);
		color: rgba(76, 175, 80, 0.9);
	}

	.sync-badge.pending {
		background: rgba(255, 152, 0, 0.15);
		border: 1px solid rgba(255, 152, 0, 0.3);
		color: rgba(255, 152, 0, 0.9);
	}

	.sync-badge.error {
		background: rgba(244, 67, 54, 0.15);
		border: 1px solid rgba(244, 67, 54, 0.3);
		color: rgba(244, 67, 54, 0.9);
	}

	.sync-badge.error.clickable {
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.sync-badge.error.clickable:hover {
		background: rgba(244, 67, 54, 0.25);
	}

	.sync-badge.error.clickable:active {
		transform: scale(0.98);
	}

	.entry-date {
		font-size: 0.7rem;
		color: var(--muted-foreground);
		font-weight: 400;
		margin-top: 0.1rem;
	}

	.game-mode-info {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.config-badge {
		font-size: 0.65rem;
		color: var(--muted-foreground);
		font-weight: 500;
		padding: 0.2rem 0.5rem;
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: 4px;
		white-space: nowrap;
	}

	.teams-summary {
		font-size: 0.85rem;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.team-name-span {
		padding: 0.1rem 0;
		border-radius: 3px;
		transition: all 0.15s ease;
	}

	.team-name-span.dark-color {
		background: rgba(255, 255, 255, 0.85);
		padding: 0.15rem 0.4rem;
	}

	.vs {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		font-weight: 400;
		opacity: 0.7;
	}

	.score-divider {
		color: var(--muted-foreground);
		font-size: 0.9rem;
		margin: 0 0.1rem;
		opacity: 0.5;
	}

	.match-score-header {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.2rem 0.5rem;
		background: var(--muted);
		border-radius: 4px;
	}

	.score-value {
		font-weight: 700;
		font-size: 0.95rem;
		min-width: 12px;
		text-align: center;
		color: var(--foreground);
	}

	.score-value.winner {
		color: var(--primary);
	}

	.score-separator {
		color: var(--muted-foreground);
		font-size: 0.85rem;
	}

	.twenties-header {
		color: rgba(255, 200, 0, 0.9);
		font-size: 0.7rem;
		font-weight: 500;
		margin-left: 0.35rem;
		opacity: 0.9;
	}

	.match-detail {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.4rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--border);
	}

	.delete-button {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid rgba(244, 67, 54, 0.2);
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		font-size: 0.65rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
		color: rgba(244, 67, 54, 0.9);
		white-space: nowrap;
	}

	.delete-button:hover {
		background: rgba(244, 67, 54, 0.2);
	}

	.delete-button:active {
		transform: scale(0.98);
	}

	/* Games Section */
	.games-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.game-table {
		background: var(--muted);
		border-radius: 6px;
		overflow: hidden;
	}

	.game-row {
		display: flex;
		gap: 0.4rem;
		padding: 0.4rem 0.5rem;
		align-items: center;
	}

	.game-row.header {
		background: var(--secondary);
		font-weight: 600;
		font-size: 0.75rem;
		color: var(--muted-foreground);
		margin-bottom: 0.15rem;
	}

	.game-row .team-name {
		width: 140px;
		flex-shrink: 0;
		font-weight: 500;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--foreground);
		font-size: 0.8rem;
	}

	.game-row .round-col {
		flex: 1;
		min-width: 36px;
		text-align: center;
		font-size: 0.85rem;
		color: var(--muted-foreground);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		align-items: center;
	}

	.points-with-hammer {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		justify-content: center;
	}

	.hammer-indicator {
		font-size: 0.7rem;
		opacity: 0.9;
	}

	.twenty-indicator {
		font-size: 0.65rem;
		color: rgba(255, 200, 0, 0.9);
		font-weight: 500;
	}

	.game-row .total-col {
		text-align: center;
		font-weight: 600;
		font-size: 0.75rem;
		color: var(--muted-foreground);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		align-items: center;
	}

	.game-row .total-col.total-score {
		font-size: 0.95rem;
		color: var(--foreground);
	}

	.game-row .total-col.total-score.winner {
		color: var(--primary);
	}

	.game-row.winner-row {
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		border-radius: 4px;
	}

	.entry-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
	}

	/* Responsive */
	@media (max-width: 600px) {
		.history-entry {
			padding: 0.65rem;
		}

		.game-row .team-name {
			width: 100px;
			font-size: 0.75rem;
		}

		.entry-actions {
			flex-direction: column;
		}

		.entry-actions :global(button) {
			width: 100%;
		}
	}
</style>
