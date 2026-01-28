<script lang="ts">
	import Modal from './Modal.svelte';
	import HistoryEntry from './HistoryEntry.svelte';
	import SyncConfirmModal from './SyncConfirmModal.svelte';
	import Toast from './Toast.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { team1, team2, saveTeams } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import {
		matchHistory,
		currentMatch,
		activeHistoryTab,
		permanentlyDeleteMatch,
		updateCurrentMatchRound,
		saveCurrentMatch
	} from '$lib/stores/history';
	import type { HistoryTab, MatchHistory } from '$lib/types/history';
	import { currentUser } from '$lib/firebase/auth';
	import { syncLocalMatchesToCloud, getMatchesFromCloud } from '$lib/firebase/firestore';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import type { Snippet } from 'svelte';

	interface Props {
		isOpen?: boolean;
		onClose?: () => void;
	}

	let { isOpen = false, onClose = () => {} }: Props = $props();

	// Sync state
	let isSyncing = $state(false);
	let showSyncConfirm = $state(false);
	let matchesToSync = $state<MatchHistory[]>([]);

	// Toast state
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state<'success' | 'error' | 'info' | 'warning'>('info');

	// Force re-render for duration updates
	let now = $state(Date.now());
	let interval = $state<ReturnType<typeof setInterval> | null>(null);

	// Update every second when modal is open
	$effect(() => {
		if (isOpen && $currentMatch) {
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

		return () => {
			if (interval) {
				clearInterval(interval);
			}
		};
	});

	function handleTabChange(tab: HistoryTab) {
		activeHistoryTab.set(tab);
	}

	function handleDelete(matchId: string) {
		permanentlyDeleteMatch(matchId);
	}

	// Calculate total games won by each team
	let team1GamesWon = $derived($currentMatch?.games.filter(g => g.winner === 1).length ?? 0);
	let team2GamesWon = $derived($currentMatch?.games.filter(g => g.winner === 2).length ?? 0);

	// Check if match is complete (someone reached matchesToWin)
	let isMatchComplete = $derived(team1GamesWon >= $gameSettings.matchesToWin || team2GamesWon >= $gameSettings.matchesToWin);

	// Calculate current game score (from rounds)
	let currentGameScore = $derived($currentMatch?.rounds.reduce(
		(acc, round) => ({
			team1: acc.team1 + round.team1Points,
			team2: acc.team2 + round.team2Points
		}),
		{ team1: 0, team2: 0 }
	) ?? { team1: 0, team2: 0 });

	// Calculate total 20s for current game
	let currentGame20s = $derived($currentMatch?.rounds.reduce(
		(acc, round) => ({
			team1: acc.team1 + round.team1Twenty,
			team2: acc.team2 + round.team2Twenty
		}),
		{ team1: 0, team2: 0 }
	) ?? { team1: 0, team2: 0 });

	// Format date
	let matchDate = $derived($currentMatch ? new Date($currentMatch.startTime).toLocaleDateString($gameSettings.language, {
		day: '2-digit',
		month: '2-digit',
		year: '2-digit'
	}) : '');

	let matchTime = $derived($currentMatch ? new Date($currentMatch.startTime).toLocaleTimeString($gameSettings.language, {
		hour: '2-digit',
		minute: '2-digit'
	}) : '');

	// Build complete match configuration badges for current match
	let currentMatchConfigBadges = $derived((() => {
		const badges = [];

		// Game type
		badges.push($gameSettings.gameType === 'singles' ? `👤 ${m.scoring_singles()}` : `👥 ${m.scoring_doubles()}`);

		// Game mode
		if ($gameSettings.gameMode === 'rounds') {
			badges.push(`🎯 ${$gameSettings.roundsToPlay} ${m.scoring_rounds()}`);
		} else {
			if ($gameSettings.matchesToWin > 1) {
				badges.push(`🎯 ${$gameSettings.pointsToWin}pts • Win ${$gameSettings.matchesToWin} games`);
			} else {
				badges.push(`🎯 ${$gameSettings.pointsToWin} ${m.scoring_points()}`);
			}
		}

		// Additional features
		if ($gameSettings.showHammer) badges.push('🔨 Hammer');
		if ($gameSettings.show20s) badges.push('⭐ 20s');

		return badges;
	})());

	// Calculate actual match duration (uses 'now' to trigger updates)
	let matchDurationMs = $derived($currentMatch ? (now - $currentMatch.startTime) : 0);
	let durationMinutes = $derived(Math.floor(matchDurationMs / 60000));
	let durationSeconds = $derived(Math.floor((matchDurationMs / 1000) % 60));
	let durationText = $derived(`${durationMinutes}${m.history_minuteShort()} ${durationSeconds}${m.history_secondShort()}`);


	// Get all games including the current in-progress game
	let allGames = $derived($currentMatch?.games ?? []);
	let hasCurrentGame = $derived($currentMatch?.rounds && $currentMatch.rounds.length > 0);

	// Editing state for current game rounds
	type EditingField = {
		roundIndex: number;
		team: 1 | 2;
		field: 'points' | 'twenty';
		gameIndex?: number; // undefined = current in-progress game, number = completed game
	};
	let editingField = $state<EditingField | null>(null);
	let editInputValue = $state('');
	let editInputElement = $state<HTMLInputElement | null>(null);

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

	function startEditingCompletedGame(gameIndex: number, roundIndex: number, team: 1 | 2, field: 'points' | 'twenty', currentValue: number) {
		editingField = { roundIndex, team, field, gameIndex };
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

		const { roundIndex, team, field, gameIndex } = editingField;

		if (gameIndex !== undefined) {
			// Editing a completed game
			updateCompletedGameRound(gameIndex, roundIndex, team, field, value);
		} else {
			// Editing current in-progress game
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
		}

		cancelEditing();
	}

	function updateCompletedGameRound(gameIndex: number, roundIndex: number, team: 1 | 2, field: 'points' | 'twenty', value: number) {
		currentMatch.update(match => {
			if (!match || !match.games[gameIndex] || !match.games[gameIndex].rounds[roundIndex]) return match;

			const updatedGames = [...match.games];
			const updatedRounds = [...updatedGames[gameIndex].rounds];

			// Update the specific field
			if (field === 'points') {
				updatedRounds[roundIndex] = {
					...updatedRounds[roundIndex],
					[`team${team}Points`]: value
				};

				// Recalculate game totals
				const team1Total = updatedRounds.reduce((sum, r) => sum + r.team1Points, 0);
				const team2Total = updatedRounds.reduce((sum, r) => sum + r.team2Points, 0);

				updatedGames[gameIndex] = {
					...updatedGames[gameIndex],
					rounds: updatedRounds,
					team1Points: team1Total,
					team2Points: team2Total
				};
			} else if (field === 'twenty') {
				updatedRounds[roundIndex] = {
					...updatedRounds[roundIndex],
					[`team${team}Twenty`]: value
				};

				updatedGames[gameIndex] = {
					...updatedGames[gameIndex],
					rounds: updatedRounds
				};
			}

			return {
				...match,
				games: updatedGames
			};
		});

		saveCurrentMatch();
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

	// Sync function - shows confirmation modal first
	function handleSync() {
		if (!$currentUser) {
			console.warn('User not authenticated');
			return;
		}

		// Get local matches that haven't been synced yet
		matchesToSync = $matchHistory.filter(m => m.syncStatus !== 'synced');

		if (matchesToSync.length === 0) {
			console.log('ℹ️ All matches already synced');
			// Show toast notification
			toastMessage = m.history_allMatchesAlreadySynced();
			toastType = 'info';
			showToast = true;
			// Still fetch from cloud
			fetchFromCloud();
			return;
		}

		// Show confirmation modal
		showSyncConfirm = true;
	}

	// Handle sync confirmation with team selections
	async function handleSyncConfirm(data: { selections: Map<string, 1 | 2 | null> }) {
		const selections = data.selections;
		isSyncing = true;

		try {
			// Filter only matches where user clicked any button (Team 1, Team 2, or "No jugué")
			const matchesToSyncFiltered = matchesToSync.filter(m => selections.has(m.id));
			console.log(`🔄 Syncing ${matchesToSyncFiltered.length} selected matches to cloud...`);

			const syncedMatches: MatchHistory[] = [];
			for (const match of matchesToSyncFiltered) {
				const teamSelection = selections.get(match.id);
				const result = await syncLocalMatchesToCloud([match], { manualTeamSelection: teamSelection });
				syncedMatches.push(...result);
			}

			// Update local history with synced status
			matchHistory.update(history => {
				return history.map(localMatch => {
					const syncedMatch = syncedMatches.find(sm => sm.id === localMatch.id);
					return syncedMatch || localMatch;
				});
			});

			// Save to localStorage
			if (browser) {
				localStorage.setItem('crokinoleMatchHistory', JSON.stringify(get(matchHistory)));
			}

			// Get matches from cloud
			await fetchFromCloud();

			console.log(`✅ Sync complete!`);

		} catch (error) {
			console.error('❌ Error during sync:', error);
		} finally {
			isSyncing = false;
		}
	}

	// Fetch matches from cloud and merge with local history
	async function fetchFromCloud() {
		try {
			console.log('🔄 Fetching matches from cloud...');
			const cloudMatches = await getMatchesFromCloud();
			console.log(`✅ Retrieved ${cloudMatches.length} matches from cloud`);

			// Merge cloud matches with local history
			const localMatches = get(matchHistory);
			const mergedMap = new Map<string, MatchHistory>();

			// Add cloud matches first (they are source of truth for synced matches)
			cloudMatches.forEach(m => {
				if (m && m.id) {
					mergedMap.set(m.id, m);
				}
			});

			// Add local matches that aren't in cloud (pending/local matches)
			localMatches.forEach(m => {
				if (m && m.id && !mergedMap.has(m.id)) {
					mergedMap.set(m.id, m);
				}
			});

			// Update store and localStorage
			const mergedMatches = Array.from(mergedMap.values())
				.sort((a, b) => b.startTime - a.startTime);

			matchHistory.set(mergedMatches);

			if (browser) {
				localStorage.setItem('crokinoleMatchHistory', JSON.stringify(mergedMatches));
			}

			console.log(`✅ Merged ${mergedMatches.length} total matches (${cloudMatches.length} from cloud, ${localMatches.length} local)`);
		} catch (error) {
			console.error('❌ Error fetching from cloud:', error);
		}
	}

	// Retry sync for a single match that failed
	function handleRetrySync(matchId: string) {
		if (!$currentUser) {
			console.warn('User not authenticated');
			return;
		}

		const match = $matchHistory.find(m => m.id === matchId);
		if (!match) {
			console.warn('Match not found:', matchId);
			return;
		}

		console.log('🔄 Retrying sync for match:', matchId);

		// Show sync confirmation modal with just this match
		matchesToSync = [match];
		showSyncConfirm = true;
	}
</script>

{#snippet headerActions()}
	{#if $currentUser}
		<button
			class="sync-button"
			onclick={handleSync}
			disabled={isSyncing}
			type="button"
		>
			{#if isSyncing}
				<span class="syncing">⟳</span>
			{:else}
				<span class="sync-icon">☁️</span>
			{/if}
			<span class="sync-text">{m.history_syncAll()}</span>
		</button>
	{/if}
{/snippet}

<Modal {isOpen} title={m.history_matchHistory()} onClose={onClose} {headerActions}>
	<div class="history-modal">
		<!-- Tabs Navigation -->
		<div class="tabs">
			<button
				class="tab"
				class:active={$activeHistoryTab === 'current'}
				onclick={() => handleTabChange('current')}
				type="button"
			>
				{m.history_currentMatch()}
			</button>
			<button
				class="tab"
				class:active={$activeHistoryTab === 'history'}
				onclick={() => handleTabChange('history')}
				type="button"
			>
				{m.history_matchHistory()}{#if $matchHistory && $matchHistory.length > 0} ({$matchHistory.length}){/if}
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

							<!-- Game Info: Badges with configuration -->
							<div class="game-info">
								{#each currentMatchConfigBadges as badge}
									<span class="config-badge">{badge}</span>
								{/each}
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
											<span class="winner-name">{winnerName} {m.history_gana()}</span>
											<span class="score">{winnerPoints}-{loserPoints}</span>
											{#if $gameSettings.show20s}
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
										<div class="game-table completed-game">
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
											<div class="game-row">
												<span class="team-name">
													{$team1.name}
												</span>
												{#each game.rounds as round, roundIndex}
													<span class="round-col">
														<span class="points-with-hammer">
															{#if $gameSettings.showHammer && round.hammerTeam === 1}
																<span class="hammer-indicator">🔨</span>
															{/if}
															{#if editingField && editingField.roundIndex === roundIndex && editingField.team === 1 && editingField.field === 'points' && editingField.gameIndex === gameIndex}
																<input
																	bind:this={editInputElement}
																	bind:value={editInputValue}
																	onkeydown={handleEditKeydown}
																	onblur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input"
																/>
															{:else}
																<button
																	class="editable-value"
																	onclick={() => startEditingCompletedGame(gameIndex, roundIndex, 1, 'points', round.team1Points)}
																	type="button"
																>
																	{round.team1Points}
																</button>
															{/if}
														</span>
														{#if $gameSettings.show20s}
															{#if editingField && editingField.roundIndex === roundIndex && editingField.team === 1 && editingField.field === 'twenty' && editingField.gameIndex === gameIndex}
																<input
																	bind:this={editInputElement}
																	bind:value={editInputValue}
																	onkeydown={handleEditKeydown}
																	onblur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input edit-input-twenty"
																/>
															{:else}
																<button
																	class="twenty-indicator editable-twenty"
																	onclick={() => startEditingCompletedGame(gameIndex, roundIndex, 1, 'twenty', round.team1Twenty)}
																	type="button"
																>
																	⭐{round.team1Twenty}
																</button>
															{/if}
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
												{#each game.rounds as round, roundIndex}
													<span class="round-col">
														<span class="points-with-hammer">
															{#if $gameSettings.showHammer && round.hammerTeam === 2}
																<span class="hammer-indicator">🔨</span>
															{/if}
															{#if editingField && editingField.roundIndex === roundIndex && editingField.team === 2 && editingField.field === 'points' && editingField.gameIndex === gameIndex}
																<input
																	bind:this={editInputElement}
																	bind:value={editInputValue}
																	onkeydown={handleEditKeydown}
																	onblur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input"
																/>
															{:else}
																<button
																	class="editable-value"
																	onclick={() => startEditingCompletedGame(gameIndex, roundIndex, 2, 'points', round.team2Points)}
																	type="button"
																>
																	{round.team2Points}
																</button>
															{/if}
														</span>
														{#if $gameSettings.show20s}
															{#if editingField && editingField.roundIndex === roundIndex && editingField.team === 2 && editingField.field === 'twenty' && editingField.gameIndex === gameIndex}
																<input
																	bind:this={editInputElement}
																	bind:value={editInputValue}
																	onkeydown={handleEditKeydown}
																	onblur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input edit-input-twenty"
																/>
															{:else}
																<button
																	class="twenty-indicator editable-twenty"
																	onclick={() => startEditingCompletedGame(gameIndex, roundIndex, 2, 'twenty', round.team2Twenty)}
																	type="button"
																>
																	⭐{round.team2Twenty}
																</button>
															{/if}
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
													{m.history_game()} {allGames.length + 1} <span class="in-progress-badge">({m.history_inProgress()})</span>
												</span>
												{#each $currentMatch.rounds as _, idx}
													<span class="round-col">R{idx + 1}</span>
												{/each}
												<span class="total-col">{m.history_total().toUpperCase()}</span>
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
																	onkeydown={handleEditKeydown}
																	onblur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input"
																/>
															{:else}
																<button
																	class="editable-value"
																	onclick={() => startEditing(roundIndex, 1, 'points', round.team1Points)}
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
																	onkeydown={handleEditKeydown}
																	onblur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input edit-input-twenty"
																/>
															{:else}
																<button
																	class="twenty-indicator editable-twenty"
																	onclick={() => startEditing(roundIndex, 1, 'twenty', round.team1Twenty)}
																	type="button"
																>
																	⭐{round.team1Twenty}
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
																	onkeydown={handleEditKeydown}
																	onblur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input"
																/>
															{:else}
																<button
																	class="editable-value"
																	onclick={() => startEditing(roundIndex, 2, 'points', round.team2Points)}
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
																	onkeydown={handleEditKeydown}
																	onblur={saveEdit}
																	type="number"
																	min="0"
																	class="edit-input edit-input-twenty"
																/>
															{:else}
																<button
																	class="twenty-indicator editable-twenty"
																	onclick={() => startEditing(roundIndex, 2, 'twenty', round.team2Twenty)}
																	type="button"
																>
																	⭐{round.team2Twenty}
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
							<p>{m.history_noCurrentMatch()}</p>
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
									onRetrySync={() => handleRetrySync(match.id)}
								/>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<p>{m.history_noHistory()}</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</Modal>

<!-- Sync Confirmation Modal -->
<SyncConfirmModal
	isOpen={showSyncConfirm}
	matches={matchesToSync}
	onconfirm={handleSyncConfirm}
	onclose={() => showSyncConfirm = false}
/>

<!-- Toast Notification -->
<Toast
	message={toastMessage}
	visible={showToast}
	type={toastType}
	duration={3000}
	onClose={() => showToast = false}
/>

<style>
	.history-modal {
		display: flex;
		flex-direction: column;
		height: 100%;
		max-height: 70vh;
		overflow: hidden;
	}

	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		overflow-x: auto;
		flex-shrink: 0;
		margin-bottom: 1rem;
	}

	.tab {
		padding: 0.6rem 1rem;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.tab:hover {
		color: rgba(255, 255, 255, 0.7);
	}

	.tab.active {
		color: rgba(255, 255, 255, 0.9);
		border-bottom-color: rgba(255, 255, 255, 0.5);
	}

	.tab-content {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
		padding: 0 0.5rem 1rem 0;
	}

	.current-match-tab,
	.history-tab {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.current-match-info {
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.match-header h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
	}

	.match-header .phase {
		color: rgba(255, 255, 255, 0.5);
		font-weight: 400;
		font-size: 0.9rem;
	}

	.match-datetime {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.75rem;
	}

	.game-info {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.config-badge {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
		padding: 0.2rem 0.5rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		white-space: nowrap;
	}

	/* Match Score Summary */
	.match-score-summary {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		background: rgba(0, 0, 0, 0.15);
		border-radius: 6px;
		padding: 0.75rem;
		margin: 0.25rem 0;
	}

	.game-result-summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.75);
	}

	.game-result-summary .game-number {
		font-weight: 600;
		color: rgba(255, 255, 255, 0.5);
		min-width: 28px;
	}

	.game-result-summary .winner-name {
		flex: 1;
	}

	.game-result-summary .score {
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
	}

	.game-result-summary .twenties-summary {
		color: rgba(255, 200, 100, 0.8);
		font-size: 0.75rem;
		margin-left: 0.4rem;
	}

	.match-total-summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		font-weight: 600;
		padding-top: 0.4rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		margin-top: 0.2rem;
	}

	.match-total-summary .match-label {
		color: rgba(255, 255, 255, 0.6);
	}

	.match-total-summary .match-result {
		font-size: 1rem;
	}

	.match-total-summary .match-twenties {
		color: rgba(255, 200, 100, 0.8);
		font-size: 0.85rem;
	}

	.games-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.game-table {
		background: rgba(0, 0, 0, 0.12);
		border-radius: 6px;
		overflow: hidden;
		padding: 0.65rem;
	}

	.game-table.completed-game {
		border: 1px solid rgba(255, 255, 255, 0.05);
	}

	.game-table.current-game {
		border: 1px solid rgba(100, 180, 150, 0.25);
		background: rgba(100, 180, 150, 0.03);
	}

	.in-progress-badge {
		color: rgba(100, 200, 150, 0.8);
		font-size: 0.7rem;
		font-weight: 500;
	}

	.game-row {
		display: flex;
		gap: 0.4rem;
		padding: 0.35rem 0.4rem;
		align-items: center;
	}

	.game-row .team-name {
		width: 140px;
		flex-shrink: 0;
	}

	.game-row .round-col {
		flex: 1;
		min-width: 36px;
	}

	.game-row .total-col {
		width: 70px;
		flex-shrink: 0;
	}

	.game-row.header {
		background: rgba(255, 255, 255, 0.03);
		border-radius: 4px;
		font-weight: 600;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.45);
		margin-bottom: 0.15rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.game-row .team-name {
		font-weight: 500;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.8rem;
	}

	.game-row .round-col {
		text-align: center;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.6);
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
		opacity: 0.7;
	}

	.twenty-indicator {
		font-size: 0.55rem;
		color: rgba(255, 200, 100, 0.75);
		font-weight: 600;
	}

	.round-col .twenty-indicator {
		font-size: 0.5rem;
	}

	.game-row .total-col {
		text-align: center;
		font-weight: 600;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		align-items: center;
	}

	.game-row .total-col.total-score {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.85);
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 150px;
		text-align: center;
		color: rgba(255, 255, 255, 0.35);
	}

	.empty-state p {
		font-size: 0.9rem;
	}

	/* Scrollbar styling */
	.tab-content::-webkit-scrollbar {
		width: 4px;
	}

	.tab-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.tab-content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.12);
		border-radius: 2px;
	}

	.tab-content::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	/* Editable values */
	.editable-value {
		background: transparent;
		border: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0.15rem 0.3rem;
		border-radius: 3px;
		transition: all 0.15s ease;
	}

	.editable-value:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.editable-twenty {
		background: transparent;
		border: none;
		color: rgba(255, 200, 100, 0.75);
		font: inherit;
		cursor: pointer;
		padding: 0.1rem 0.25rem;
		border-radius: 3px;
		transition: all 0.15s ease;
	}

	.editable-twenty:hover {
		background: rgba(255, 200, 100, 0.15);
	}

	.edit-input {
		width: 40px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 3px;
		padding: 0.15rem 0.25rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #fff;
		text-align: center;
	}

	.edit-input:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.35);
	}

	.edit-input-twenty {
		width: 35px;
		font-size: 0.75rem;
	}

	.edit-input::-webkit-inner-spin-button,
	.edit-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.edit-input[type=number] {
		-moz-appearance: textfield;
		appearance: textfield;
	}

	/* Sync Button */
	.sync-button {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.65);
		transition: all 0.15s ease;
		font-size: 0.7rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.sync-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.85);
	}

	.sync-button:active:not(:disabled) {
		transform: scale(0.98);
	}

	.sync-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.sync-button .sync-icon {
		font-size: 0.75rem;
	}

	.sync-button .syncing {
		display: inline-block;
		font-size: 0.75rem;
		animation: spin 1s linear infinite;
	}

	.sync-button .sync-text {
		font-weight: 500;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	/* Responsive */
	@media (max-width: 600px) {
		.history-modal {
			max-height: 75vh;
		}

		.tabs {
			margin-bottom: 0.75rem;
		}

		.tab {
			padding: 0.5rem 0.7rem;
			font-size: 0.75rem;
		}

		.match-header h3 {
			font-size: 0.85rem;
		}

		.match-header .phase {
			font-size: 0.8rem;
		}

		.match-datetime {
			font-size: 0.7rem;
		}

		.game-row .team-name {
			width: 90px;
			font-size: 0.75rem;
		}

		.game-row .round-col {
			font-size: 0.75rem;
			min-width: 32px;
		}

		.game-row .total-col {
			width: 55px;
			font-size: 0.7rem;
		}

		.game-row .total-col.total-score {
			font-size: 0.85rem;
		}

		.game-row.header {
			font-size: 0.65rem;
		}

		.current-match-info {
			padding: 0.6rem;
			gap: 0.4rem;
		}

		.game-table {
			padding: 0.5rem;
		}

		.sync-button {
			padding: 0.2rem 0.4rem;
			font-size: 0.6rem;
		}
	}

	/* Portrait mobile */
	@media (max-width: 600px) and (orientation: portrait) {
		.history-modal {
			max-height: 80vh;
		}
	}

	/* Landscape mobile */
	@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
		.history-modal {
			max-height: 70vh;
		}

		.tabs {
			margin-bottom: 0.4rem;
		}

		.tab {
			padding: 0.35rem 0.5rem;
			font-size: 0.65rem;
		}

		.match-header h3 {
			font-size: 0.75rem;
		}

		.current-match-info {
			padding: 0.4rem;
			gap: 0.3rem;
		}

		.game-table {
			padding: 0.4rem;
		}

		.game-row {
			padding: 0.25rem 0.3rem;
		}

		.game-row .team-name {
			width: 70px;
			font-size: 0.65rem;
		}

		.game-row .round-col {
			font-size: 0.65rem;
			min-width: 28px;
		}

		.game-row .total-col {
			width: 45px;
			font-size: 0.6rem;
		}

		.game-row .total-col.total-score {
			font-size: 0.75rem;
		}
	}
</style>
