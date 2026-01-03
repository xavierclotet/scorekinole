<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import HistoryEntry from './HistoryEntry.svelte';
	import { t } from '$lib/stores/language';
	import { team1, team2, saveTeams } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import {
		matchHistory,
		deletedMatches,
		currentMatch,
		activeHistoryTab,
		deleteMatch,
		restoreMatch,
		permanentlyDeleteMatch,
		clearDeletedMatches,
		updateCurrentMatchRound
	} from '$lib/stores/history';
	import type { HistoryTab } from '$lib/types/history';
	import { onDestroy } from 'svelte';

	export let isOpen: boolean = false;
	export let onClose: () => void = () => {};

	// Contrast calculation functions
	function getLuminance(color: string): number {
		const hex = color.replace('#', '');
		const r = parseInt(hex.substr(0, 2), 16) / 255;
		const g = parseInt(hex.substr(2, 2), 16) / 255;
		const b = parseInt(hex.substr(4, 2), 16) / 255;

		const [rs, gs, bs] = [r, g, b].map(c =>
			c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
		);

		return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
	}

	function getContrastColor(bgColor: string): string {
		const luminance = getLuminance(bgColor);
		return luminance > 0.5 ? '#000000' : '#FFFFFF';
	}

	// Force re-render for duration updates
	// @ts-expect-error - Used in reactive declarations
	let now = Date.now();
	let interval: ReturnType<typeof setInterval> | null = null;

	// Update every second when modal is open
	$: if (isOpen && $currentMatch) {
		if (!interval) {
			interval = setInterval(() => {
				now = Date.now();
			}, 1000);
		}
	} else {
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
	}

	onDestroy(() => {
		if (interval) {
			clearInterval(interval);
		}
	});

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

	function handleClearDeleted() {
		clearDeletedMatches();
	}

	// Calculate total games won by each team
	$: team1GamesWon = $currentMatch?.games.filter(g => g.winner === 1).length ?? 0;
	$: team2GamesWon = $currentMatch?.games.filter(g => g.winner === 2).length ?? 0;

	// Check if match is complete (someone reached matchesToWin)
	$: isMatchComplete = team1GamesWon >= $gameSettings.matchesToWin || team2GamesWon >= $gameSettings.matchesToWin;

	// Calculate current game score (from rounds)
	$: currentGameScore = $currentMatch?.rounds.reduce(
		(acc, round) => ({
			team1: acc.team1 + round.team1Points,
			team2: acc.team2 + round.team2Points
		}),
		{ team1: 0, team2: 0 }
	) ?? { team1: 0, team2: 0 };

	// Calculate total 20s for current game
	$: currentGame20s = $currentMatch?.rounds.reduce(
		(acc, round) => ({
			team1: acc.team1 + round.team1Twenty,
			team2: acc.team2 + round.team2Twenty
		}),
		{ team1: 0, team2: 0 }
	) ?? { team1: 0, team2: 0 };

	// Format date
	$: matchDate = $currentMatch ? new Date($currentMatch.startTime).toLocaleDateString($gameSettings.language, {
		day: '2-digit',
		month: '2-digit',
		year: '2-digit'
	}) : '';

	$: matchTime = $currentMatch ? new Date($currentMatch.startTime).toLocaleTimeString($gameSettings.language, {
		hour: '2-digit',
		minute: '2-digit'
	}) : '';

	// Format game info line
	$: gameTypeText = $gameSettings.gameType === 'singles' ? $t('singles') : $t('doubles');
	$: gameModeText = $gameSettings.gameMode === 'points'
		? `${$t('to')} ${$gameSettings.pointsToWin}${$t('points').toLowerCase()}`
		: `${$gameSettings.roundsToPlay} ${$t('rounds').toLowerCase()}`;

	// Calculate actual match duration (uses 'now' to trigger updates)
	$: matchDurationMs = $currentMatch ? (now - $currentMatch.startTime) : 0;
	$: durationMinutes = Math.floor(matchDurationMs / 60000);
	$: durationSeconds = Math.floor((matchDurationMs / 1000) % 60);
	$: durationText = `${durationMinutes}${$t('minuteShort')} ${durationSeconds}${$t('secondShort')}`;

	// Match status text
	$: matchStatusText = team1GamesWon > team2GamesWon
		? `${$team1.name} ${$t('wins')} ${team1GamesWon}-${team2GamesWon}`
		: team2GamesWon > team1GamesWon
		? `${$team2.name} ${$t('wins')} ${team2GamesWon}-${team1GamesWon}`
		: `${team1GamesWon}-${team2GamesWon}`;

	// Get all games including the current in-progress game
	$: allGames = $currentMatch?.games ?? [];
	$: hasCurrentGame = $currentMatch?.rounds && $currentMatch.rounds.length > 0;

	// Editing state for current game rounds
	type EditingField = {
		roundIndex: number;
		team: 1 | 2;
		field: 'points' | 'twenty';
	};
	let editingField: EditingField | null = null;
	let editInputValue: string = '';
	let editInputElement: HTMLInputElement | null = null;

	function startEditing(roundIndex: number, team: 1 | 2, field: 'points' | 'twenty', currentValue: number) {
		editingField = { roundIndex, team, field };
		editInputValue = currentValue.toString();

		// Focus the input after it's rendered
		setTimeout(() => {
			if (editInputElement) {
				editInputElement.focus();
				editInputElement.select();
			}
		}, 10);
	}

	function cancelEditing() {
		editingField = null;
		editInputValue = '';
	}

	function saveEdit() {
		if (!editingField || !$currentMatch) return;

		const value = parseInt(editInputValue, 10);
		if (isNaN(value) || value < 0) {
			cancelEditing();
			return;
		}

		const { roundIndex, team, field } = editingField;
		const updates: any = {};

		if (field === 'points') {
			updates[`team${team}Points`] = value;

			// Also update the team points in the actual game state
			// We need to recalculate total points based on all rounds
			updateTeamPointsFromRounds(roundIndex, team, value);
		} else if (field === 'twenty') {
			updates[`team${team}Twenty`] = value;
		}

		updateCurrentMatchRound(roundIndex, updates);
		cancelEditing();
	}

	function updateTeamPointsFromRounds(changedRoundIndex: number, team: 1 | 2, newPoints: number) {
		if (!$currentMatch) return;

		// Calculate total points for the team including the changed round
		let totalPoints = 0;
		$currentMatch.rounds.forEach((round, idx) => {
			if (idx === changedRoundIndex) {
				totalPoints += newPoints;
			} else {
				totalPoints += team === 1 ? round.team1Points : round.team2Points;
			}
		});

		// Update the team store with new total
		const teamStore = team === 1 ? team1 : team2;
		teamStore.update(t => ({ ...t, points: totalPoints }));
		saveTeams();
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			saveEdit();
		} else if (e.key === 'Escape') {
			cancelEditing();
		}
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
				{$t('matchHistory')}{#if $matchHistory && $matchHistory.length > 0} ({$matchHistory.length}){/if}
			</button>
			<button
				class="tab"
				class:active={$activeHistoryTab === 'deleted'}
				on:click={() => handleTabChange('deleted')}
				type="button"
			>
				{$t('deleted')}{#if $deletedMatches && $deletedMatches.length > 0} ({$deletedMatches.length}){/if}
			</button>
		</div>

		<!-- Tab Content -->
		<div class="tab-content">
			{#if $activeHistoryTab === 'current'}
				<!-- Current Match Tab -->
				<div class="current-match-tab">
					{#if $currentMatch && (allGames.length > 0 || hasCurrentGame)}
						<div class="current-match-info">
							<!-- Header: Title - Phase -->
							<div class="match-header">
								<h3>
									{$gameSettings.eventTitle || 'Scorekinole'}
									{#if $gameSettings.matchPhase}
										<span class="phase"> - {$gameSettings.matchPhase}</span>
									{/if}
								</h3>
							</div>

							<!-- Date and Time -->
							<div class="match-datetime">
								{matchDate} {matchTime}
							</div>

							<!-- Game Info: Individual • A 7p • Duration (Ej: 10m 9s) -->
							<div class="game-info">
								{gameTypeText} • {gameModeText} • {durationText}
							</div>

							<!-- Match Score Summary (like score-container) -->
							{#if allGames.length > 0 && isMatchComplete}
								<div class="match-score-summary">
									<!-- Previous completed games -->
									{#each allGames as game}
										{@const winnerName = game.winner === 1 ? $team1.name : $team2.name}
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
									<!-- Match total (only show for multi-game matches in points mode) -->
									{#if $gameSettings.gameMode === 'points' && $gameSettings.matchesToWin > 1}
										<div class="match-total-summary">
											<span class="match-label">Match:</span>
											<span class="match-result" style="color: {team1GamesWon > team2GamesWon ? '#00ff88' : team1GamesWon === team2GamesWon ? '#888' : '#fff'};">{team1GamesWon}</span>
											<span>-</span>
											<span class="match-result" style="color: {team2GamesWon > team1GamesWon ? '#00ff88' : team1GamesWon === team2GamesWon ? '#888' : '#fff'};">{team2GamesWon}</span>
											{#if $gameSettings.show20s}
												{@const total20s = allGames.reduce((sum, g) => sum + (g.rounds?.reduce((s, r) => s + r.team1Twenty + r.team2Twenty, 0) ?? 0), 0)}
												{#if total20s > 0}
													<span class="match-twenties"> • ⭐ {total20s}</span>
												{/if}
											{/if}
										</div>
									{/if}
								</div>
							{/if}

							<!-- Games Table -->
							{#if allGames.length > 0 || hasCurrentGame}
								<div class="games-section">
									{#each allGames as game, gameIndex}
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
													{$team1.name}
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
													{$team2.name}
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

									<!-- Current in-progress game -->
									{#if hasCurrentGame}
										<div class="game-table current-game">
											<!-- Table Header -->
											<div class="game-row header">
												<span class="team-name">
													{$t('game')} {allGames.length + 1} <span class="in-progress-badge">({$t('inProgress')})</span>
												</span>
												{#each $currentMatch.rounds as _, idx}
													<span class="round-col">R{idx + 1}</span>
												{/each}
												<span class="total-col">{$t('total').toUpperCase()}</span>
											</div>

											<!-- Team 1 Row -->
											<div class="game-row">
												<span class="team-name">
													{$team1.name}
												</span>
												{#each $currentMatch.rounds as round, roundIndex}
													<span class="round-col">
														<span class="points-with-hammer">
															{#if round.hammerTeam === 1}
																<span class="hammer-indicator">🔨</span>
															{/if}
															{#if editingField && editingField.roundIndex === roundIndex && editingField.team === 1 && editingField.field === 'points'}
																<input
																	bind:this={editInputElement}
																	bind:value={editInputValue}
																	on:keydown={handleEditKeydown}
																	on:blur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input"
																/>
															{:else}
																<button
																	class="editable-value"
																	on:click={() => startEditing(roundIndex, 1, 'points', round.team1Points)}
																	type="button"
																>
																	{round.team1Points}
																</button>
															{/if}
														</span>
														{#if $gameSettings.show20s}
															{#if editingField && editingField.roundIndex === roundIndex && editingField.team === 1 && editingField.field === 'twenty'}
																<input
																	bind:this={editInputElement}
																	bind:value={editInputValue}
																	on:keydown={handleEditKeydown}
																	on:blur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input edit-input-twenty"
																/>
															{:else if round.team1Twenty > 0}
																<button
																	class="twenty-indicator editable-twenty"
																	on:click={() => startEditing(roundIndex, 1, 'twenty', round.team1Twenty)}
																	type="button"
																>
																	⭐{round.team1Twenty}
																</button>
															{:else}
																<button
																	class="twenty-indicator-add"
																	on:click={() => startEditing(roundIndex, 1, 'twenty', 0)}
																	type="button"
																	title={$t('track20s')}
																>
																	⭐+
																</button>
															{/if}
														{/if}
													</span>
												{/each}
												<span class="total-col total-score">
													{currentGameScore.team1}
													{#if $gameSettings.show20s && currentGame20s.team1 > 0}
														<span class="twenty-indicator">⭐{currentGame20s.team1}</span>
													{/if}
												</span>
											</div>

											<!-- Team 2 Row -->
											<div class="game-row">
												<span class="team-name">
													{$team2.name}
												</span>
												{#each $currentMatch.rounds as round, roundIndex}
													<span class="round-col">
														<span class="points-with-hammer">
															{#if round.hammerTeam === 2}
																<span class="hammer-indicator">🔨</span>
															{/if}
															{#if editingField && editingField.roundIndex === roundIndex && editingField.team === 2 && editingField.field === 'points'}
																<input
																	bind:this={editInputElement}
																	bind:value={editInputValue}
																	on:keydown={handleEditKeydown}
																	on:blur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input"
																/>
															{:else}
																<button
																	class="editable-value"
																	on:click={() => startEditing(roundIndex, 2, 'points', round.team2Points)}
																	type="button"
																>
																	{round.team2Points}
																</button>
															{/if}
														</span>
														{#if $gameSettings.show20s}
															{#if editingField && editingField.roundIndex === roundIndex && editingField.team === 2 && editingField.field === 'twenty'}
																<input
																	bind:this={editInputElement}
																	bind:value={editInputValue}
																	on:keydown={handleEditKeydown}
																	on:blur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input edit-input-twenty"
																/>
															{:else if round.team2Twenty > 0}
																<button
																	class="twenty-indicator editable-twenty"
																	on:click={() => startEditing(roundIndex, 2, 'twenty', round.team2Twenty)}
																	type="button"
																>
																	⭐{round.team2Twenty}
																</button>
															{:else}
																<button
																	class="twenty-indicator-add"
																	on:click={() => startEditing(roundIndex, 2, 'twenty', 0)}
																	type="button"
																	title={$t('track20s')}
																>
																	⭐+
																</button>
															{/if}
														{/if}
													</span>
												{/each}
												<span class="total-col total-score">
													{currentGameScore.team2}
													{#if $gameSettings.show20s && currentGame20s.team2 > 0}
														<span class="twenty-indicator">⭐{currentGame20s.team2}</span>
													{/if}
												</span>
											</div>
										</div>
									{/if}
								</div>
							{/if}
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
								{$t('permanentDelete')}
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
</Modal>

<style>
	.history-modal {
		display: flex;
		flex-direction: column;
		min-height: 400px;
		max-height: 70vh;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		border-bottom: 2px solid rgba(255, 255, 255, 0.1);
		overflow-x: auto;
		flex-shrink: 0;
		margin-bottom: 1.5rem;
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
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.match-header h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--accent-green, #00ff88);
	}

	.match-header .phase {
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		font-size: 0.95rem;
	}

	.match-datetime {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.85rem;
	}

	.game-info {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.9rem;
		font-weight: 500;
	}

	/* Match Score Summary (like score-container) */
	.match-score-summary {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		padding: 1rem;
		margin: 0.5rem 0;
	}

	.game-result-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
		color: rgba(255, 255, 255, 0.9);
	}

	.game-result-summary .game-number {
		font-weight: 700;
		color: var(--accent-green, #00ff88);
		min-width: 30px;
	}

	.game-result-summary .winner-name {
		flex: 1;
	}

	.game-result-summary .score {
		font-weight: 700;
		color: rgba(255, 255, 255, 0.8);
	}

	.game-result-summary .twenties-summary {
		color: var(--accent-green, #00ff88);
		font-size: 0.9rem;
		margin-left: 0.5rem;
	}

	.match-total-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.1rem;
		font-weight: 700;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
		margin-top: 0.25rem;
	}

	.match-total-summary .match-label {
		color: rgba(255, 255, 255, 0.9);
	}

	.match-total-summary .match-result {
		font-size: 1.2rem;
	}

	.match-total-summary .match-twenties {
		color: var(--accent-green, #00ff88);
		font-size: 1rem;
	}

	.games-section {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		margin-top: 1rem;
	}

	.games-section h4 {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.9);
		border-bottom: 2px solid rgba(255, 255, 255, 0.1);
		padding-bottom: 0.5rem;
	}

	.game-table {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		overflow: hidden;
		padding: 1rem;
	}

	.game-table.current-game {
		border: 2px solid var(--accent-green, #00ff88);
	}

	.game-title {
		font-weight: 700;
		font-size: 1rem;
		margin-bottom: 0.75rem;
		color: rgba(255, 255, 255, 0.9);
	}

	.in-progress-badge {
		color: var(--accent-green, #00ff88);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.game-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		align-items: center;
	}

	.game-row .team-name {
		width: 160px;
		flex-shrink: 0;
	}

	.game-row .round-col {
		flex: 1;
		min-width: 40px;
	}

	.game-row .total-col {
		width: 80px;
		flex-shrink: 0;
	}

	.game-row.header {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		font-weight: 700;
		font-size: 0.85rem;
		color: var(--accent-green, #00ff88);
		margin-bottom: 0.25rem;
	}

	/* Move specific styling to the flexbox children */
	.game-row .team-name {
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: #f0f0f0;
	}

	.game-row .round-col {
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

	/* Editable values */
	.editable-value {
		background: transparent;
		border: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.editable-value:hover {
		background: rgba(0, 255, 136, 0.15);
		color: var(--accent-green, #00ff88);
	}

	.editable-twenty {
		background: transparent;
		border: none;
		color: var(--accent-green, #00ff88);
		font: inherit;
		cursor: pointer;
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.editable-twenty:hover {
		background: rgba(0, 255, 136, 0.2);
		transform: scale(1.1);
	}

	.twenty-indicator-add {
		background: transparent;
		border: 1px dashed rgba(0, 255, 136, 0.3);
		color: rgba(0, 255, 136, 0.5);
		font-size: 0.65rem;
		cursor: pointer;
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
		transition: all 0.2s;
		font-weight: 600;
	}

	.twenty-indicator-add:hover {
		background: rgba(0, 255, 136, 0.1);
		border-color: rgba(0, 255, 136, 0.5);
		color: var(--accent-green, #00ff88);
		transform: scale(1.05);
	}

	.edit-input {
		width: 45px;
		background: rgba(0, 255, 136, 0.1);
		border: 2px solid var(--accent-green, #00ff88);
		border-radius: 4px;
		padding: 0.2rem 0.3rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: #fff;
		text-align: center;
		font-family: 'Orbitron', monospace;
	}

	.edit-input:focus {
		outline: none;
		background: rgba(0, 255, 136, 0.2);
		box-shadow: 0 0 8px rgba(0, 255, 136, 0.4);
	}

	.edit-input-twenty {
		width: 40px;
		font-size: 0.85rem;
	}

	/* Remove spinner from number inputs */
	.edit-input::-webkit-inner-spin-button,
	.edit-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.edit-input[type=number] {
		-moz-appearance: textfield;
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
