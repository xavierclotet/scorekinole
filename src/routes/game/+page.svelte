<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { language, t } from '$lib/stores/language';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { team1, team2, loadTeams, saveTeams, resetTeams, switchSides, switchColors } from '$lib/stores/teams';
	import { timeRemaining, resetTimer, cleanupTimer } from '$lib/stores/timer';
	import { loadMatchState, resetMatchState, roundsPlayed, currentGameStartHammer, twentyDialogPending, setTwentyDialogPending, currentGameRounds, currentMatchGames, lastRoundPoints } from '$lib/stores/matchState';
	import { loadHistory, startCurrentMatch, currentMatch } from '$lib/stores/history';
	import TeamCard from '$lib/components/TeamCard.svelte';
	import Timer from '$lib/components/Timer.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import HistoryModal from '$lib/components/HistoryModal.svelte';
	import ColorPickerModal from '$lib/components/ColorPickerModal.svelte';
	import HammerDialog from '$lib/components/HammerDialog.svelte';
	import TwentyInputDialog from '$lib/components/TwentyInputDialog.svelte';
	import Button from '$lib/components/Button.svelte';
	import { isColorDark } from '$lib/utils/colors';

	let showSettings = false;
	let showHistory = false;
	let showColorPicker = false;
	let colorPickerTeam: 1 | 2 = 1;
	let showHammerDialog = false;
	let showNewMatchConfirm = false;

	// References to TeamCard components to call their methods
	let teamCard1: any;
	let teamCard2: any;

	// Round completion data stored temporarily while 20s dialog is shown
	let pendingRoundData: { winningTeam: 0 | 1 | 2; team1Points: number; team2Points: number } | null = null;

	// Event info editing state
	let editingEventTitle = false;
	let editingMatchPhase = false;
	let eventTitleInput: HTMLInputElement;
	let matchPhaseInput: HTMLInputElement;

	// Bind showTwentyDialog to the store
	$: showTwentyDialog = $twentyDialogPending;

	// Calculate wins for each team based on rounds played in current game
	$: team1Wins = $currentGameRounds.filter(round => round.team1Points > round.team2Points).length;
	$: team2Wins = $currentGameRounds.filter(round => round.team2Points > round.team1Points).length;

	// Calculate games won in the match (for multi-game matches)
	$: team1GamesWon = $currentMatchGames.filter(game => game.winner === 1).length;
	$: team2GamesWon = $currentMatchGames.filter(game => game.winner === 2).length;

	// Check if match is complete
	// In rounds mode, match is complete after first game
	// In points mode, match is complete when someone reaches matchesToWin
	$: isMatchComplete = $gameSettings.gameMode === 'rounds'
		? (team1GamesWon >= 1 || team2GamesWon >= 1)
		: (team1GamesWon >= $gameSettings.matchesToWin || team2GamesWon >= $gameSettings.matchesToWin);

	// Show "Next Game" button when someone won AND match is not complete AND matchesToWin > 1 AND there are completed games
	$: showNextGameButton = ($team1.hasWon || $team2.hasWon) && !isMatchComplete && $gameSettings.matchesToWin > 1 && $gameSettings.gameMode === 'points' && $currentMatchGames.length > 0;

	// Calculate points for current round in progress (subtract last round's ending points from current total)
	$: team1CurrentRoundPoints = $team1.points - $lastRoundPoints.team1;
	$: team2CurrentRoundPoints = $team2.points - $lastRoundPoints.team2;

	// Debug logs for game-info visibility
	$: console.log('🔍 game-info debug:', {
		roundsPlayed: $roundsPlayed,
		currentGameRoundsLength: $currentGameRounds.length,
		shouldShow: $roundsPlayed > 0 || $currentGameRounds.length > 0
	});

	onMount(() => {
		gameSettings.load();
		loadTeams();
		loadMatchState();
		loadHistory();

		// Start current match if not already started
		if (!$currentMatch) {
			startCurrentMatch();
		}

		const unsubSettings = gameSettings.subscribe($settings => {
			language.set($settings.language);
			// Initialize timer if not set
			if ($timeRemaining === 0) {
				const totalSeconds = $settings.timerMinutes * 60 + $settings.timerSeconds;
				resetTimer(totalSeconds);
			}
		});

		return () => {
			unsubSettings();
		};
	});

	onDestroy(() => {
		cleanupTimer();
	});

	function handleResetRound() {
		team1.update(t => ({ ...t, points: 0, hasWon: false }));
		team2.update(t => ({ ...t, points: 0, hasWon: false }));
		saveTeams();

		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);
	}

	function handleResetMatch() {
		resetTeams();
		resetMatchState();

		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);
	}

	function handleNewMatchClick() {
		// If match is already complete, start new match directly without confirmation
		if (isMatchComplete) {
			handleResetMatch();
			handleMatchReset(); // Show hammer dialog if needed
		} else {
			// Match is in progress, show confirmation
			showNewMatchConfirm = true;
		}
	}

	function confirmNewMatch() {
		showNewMatchConfirm = false;
		handleResetMatch();
		handleMatchReset(); // Show hammer dialog if needed
	}

	function cancelNewMatch() {
		showNewMatchConfirm = false;
	}



	function openColorPicker(team: 1 | 2) {
		colorPickerTeam = team;
		showColorPicker = true;
	}

	function handleHammerSelected() {
		showHammerDialog = false;
	}

	function handleMatchReset() {
		// Only show hammer dialog if showHammer setting is enabled
		if ($gameSettings.showHammer) {
			// First set to false to force a re-render
			showHammerDialog = false;

			// Then use setTimeout to set to true
			setTimeout(() => {
				showHammerDialog = true;
			}, 50);
		}
	}

	function handleRoundComplete(event: CustomEvent<{ winningTeam: 0 | 1 | 2; team1Points: number; team2Points: number }>) {
		const { winningTeam, team1Points, team2Points } = event.detail;

		// Store the round data temporarily
		pendingRoundData = { winningTeam, team1Points, team2Points };

		// If show20s is enabled, show dialog first
		if ($gameSettings.show20s) {
			setTwentyDialogPending(true);
		} else {
			// If show20s is disabled, finalize round immediately
			finalizeRoundWithData();
		}
	}

	function handleTwentyInputClose() {
		// Clear the pending flag when dialog closes
		setTwentyDialogPending(false);

		// After 20s are entered, finalize the round
		finalizeRoundWithData();
	}

	function finalizeRoundWithData() {
		if (!pendingRoundData) return;

		const { winningTeam, team1Points, team2Points } = pendingRoundData;

		// Call finalizeRound on one of the TeamCard components
		// It doesn't matter which one since the function updates both teams
		if (teamCard1) {
			teamCard1.finalizeRound(winningTeam, team1Points, team2Points);
		}

		// Clear pending data
		pendingRoundData = null;
	}

	function handleNextGame() {
		// Call resetForNextGame on one of the TeamCard components
		if (teamCard1) {
			teamCard1.resetForNextGame();
		}

		// Reset timer to default value for the new game
		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);
	}

	function handleTitleClick() {
		goto('/');
	}

	// Event info editing functions
	function startEditingEventTitle() {
		editingEventTitle = true;
		setTimeout(() => {
			if (eventTitleInput) {
				eventTitleInput.focus();
				eventTitleInput.select();
			}
		}, 10);
	}

	function startEditingMatchPhase() {
		editingMatchPhase = true;
		setTimeout(() => {
			if (matchPhaseInput) {
				matchPhaseInput.focus();
				matchPhaseInput.select();
			}
		}, 10);
	}

	function saveEventTitle() {
		editingEventTitle = false;
		gameSettings.save();
	}

	function saveMatchPhase() {
		editingMatchPhase = false;
		gameSettings.save();
	}

	function handleEventTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			saveEventTitle();
		} else if (e.key === 'Escape') {
			editingEventTitle = false;
		}
	}

	function handleMatchPhaseKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			saveMatchPhase();
		} else if (e.key === 'Escape') {
			editingMatchPhase = false;
		}
	}
</script>

<div class="game-page">
	<header class="game-header">
		<div class="left-section">
			<h1 on:click|stopPropagation={handleTitleClick} class="clickable-title">
				Scorekinole
				<span class="version-badge">v{$gameSettings.appVersion}</span>
			</h1>
		</div>

		<div class="center-section">
			<div class="event-info-header">
				{#if editingEventTitle}
					<input
						bind:this={eventTitleInput}
						bind:value={$gameSettings.eventTitle}
						on:blur={saveEventTitle}
						on:keydown={handleEventTitleKeydown}
						class="event-title-input"
						placeholder={$t('eventTitle')}
					/>
				{:else if $gameSettings.eventTitle}
					<span class="event-title-header editable" on:click={startEditingEventTitle}>
						{$gameSettings.eventTitle}
					</span>
				{:else}
					<span class="event-title-header editable placeholder" on:click={startEditingEventTitle}>
						+ {$t('eventTitle')}
					</span>
				{/if}

				{#if editingMatchPhase}
					<input
						bind:this={matchPhaseInput}
						bind:value={$gameSettings.matchPhase}
						on:blur={saveMatchPhase}
						on:keydown={handleMatchPhaseKeydown}
						class="event-phase-input"
						placeholder={$t('matchPhase')}
					/>
				{:else if $gameSettings.matchPhase}
					<span class="event-phase-header editable" on:click={startEditingMatchPhase}>
						{$gameSettings.matchPhase}
					</span>
				{:else}
					<span class="event-phase-header editable placeholder" on:click={startEditingMatchPhase}>
						+ {$t('matchPhase')}
					</span>
				{/if}
			</div>
			{#if $gameSettings.showTimer}
				<Timer size="small" />
			{/if}
		</div>

		<div class="right-section">
			<button class="icon-button history-button" on:click={() => showHistory = true} aria-label="History" title={$t('matchHistory')}>
				📜
			</button>
			<button class="icon-button" on:click={() => showSettings = true} aria-label="Settings">
				⚙️
			</button>
		</div>
	</header>

	{#if ($roundsPlayed > 0 || $currentGameRounds.length > 0) && !(($team1.hasWon || $team2.hasWon) && $currentMatchGames.length === 0)}
		<div class="game-info">
			{#if $gameSettings.gameMode === 'rounds'}
				{#if $team1.hasWon || $team2.hasWon}
					{$t('roundShort')}{$roundsPlayed} / {$gameSettings.roundsToPlay}
				{:else}
					{$t('roundShort')}{$roundsPlayed + 1} / {$gameSettings.roundsToPlay}
				{/if}
			{:else}
				{@const currentGameNumber = $currentMatchGames.length + 1}
				{#if $team1.hasWon || $team2.hasWon}
					{$t('gameShort')}{currentGameNumber} • {$t('roundShort')}{$roundsPlayed} • {$gameSettings.pointsToWin} {$t('points')}
				{:else}
					{$t('gameShort')}{currentGameNumber} • {$t('roundShort')}{$roundsPlayed + 1} • {$gameSettings.pointsToWin} {$t('points')}
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Previous games results for multi-game matches -->
	{#if $gameSettings.gameMode === 'points' && $gameSettings.matchesToWin > 1 && $currentMatchGames.length > 0}
		<div class="match-score-container">
			<div class="previous-games">
				{#each $currentMatchGames as game, i}
					{@const winnerName = game.winner === 1 ? $team1.name : $team2.name}
					{@const winnerPoints = game.winner === 1 ? game.team1Points : game.team2Points}
					{@const loserPoints = game.winner === 1 ? game.team2Points : game.team1Points}
					<div class="game-result">
						<span class="game-number">P{game.gameNumber}:</span>
						<span class="winner-name">{winnerName} ganó</span>
						<span class="score">{winnerPoints}-{loserPoints}</span>
					</div>
				{/each}
				<div class="match-total">
					<span class="match-label">Match:</span>
					<span class="match-result" style="color: {team1GamesWon > team2GamesWon ? '#00ff88' : team1GamesWon === team2GamesWon ? '#888' : '#fff'};">{team1GamesWon}</span>
					<span>-</span>
					<span class="match-result" style="color: {team2GamesWon > team1GamesWon ? '#00ff88' : team1GamesWon === team2GamesWon ? '#888' : '#fff'};">{team2GamesWon}</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Score table for current game -->
	{#if $gameSettings.showScoreTable && ($currentGameRounds.length > 0 || team1CurrentRoundPoints > 0 || team2CurrentRoundPoints > 0)}
		<div class="score-table-container">
			<table class="score-table">
				<thead>
					<tr>
						<th></th>
						{#each $currentGameRounds as _, i}
							<th>R{i + 1}</th>
						{/each}
						<!-- Show current round in progress -->
						{#if team1CurrentRoundPoints > 0 || team2CurrentRoundPoints > 0}
							<th class="current-round">R{$currentGameRounds.length + 1}</th>
						{/if}
						<th class="total-col"></th>
					</tr>
				</thead>
				<tbody>
					<tr style="background: {$team1.color}20; border-left: 3px solid {$team1.color};">
						<td class="team-name" style="color: {$team1.color}; {isColorDark($team1.color) ? 'background: rgba(255, 255, 255, 0.85); padding: 2px 6px; border-radius: 4px;' : ''}">{$team1.name}</td>
						{#each $currentGameRounds as round}
							<td>{round.team1Points}</td>
						{/each}
						<!-- Show current round in progress -->
						{#if team1CurrentRoundPoints > 0 || team2CurrentRoundPoints > 0}
							<td class="current-round">{team1CurrentRoundPoints}</td>
						{/if}
						<td class="total-col" rowspan="2" style="vertical-align: middle; font-size: 1rem;">
							{$team1.points}-{$team2.points}
						</td>
					</tr>
					<tr style="background: {$team2.color}20; border-left: 3px solid {$team2.color};">
						<td class="team-name" style="color: {$team2.color}; {isColorDark($team2.color) ? 'background: rgba(255, 255, 255, 0.85); padding: 2px 6px; border-radius: 4px;' : ''}">{$team2.name}</td>
						{#each $currentGameRounds as round}
							<td>{round.team2Points}</td>
						{/each}
						<!-- Show current round in progress -->
						{#if team1CurrentRoundPoints > 0 || team2CurrentRoundPoints > 0}
							<td class="current-round">{team2CurrentRoundPoints}</td>
						{/if}
					</tr>
				</tbody>
			</table>
		</div>
	{/if}

	<div class="teams-container">
		<TeamCard
			bind:this={teamCard1}
			teamNumber={1}
			isMatchComplete={isMatchComplete}
			currentGameNumber={$currentMatchGames.length}
			on:changeColor={() => openColorPicker(1)}
			on:roundComplete={handleRoundComplete}
		/>
		<TeamCard
			bind:this={teamCard2}
			teamNumber={2}
			isMatchComplete={isMatchComplete}
			currentGameNumber={$currentMatchGames.length}
			on:changeColor={() => openColorPicker(2)}
			on:roundComplete={handleRoundComplete}
		/>
	</div>

	<!-- Next Game Button -->
	{#if showNextGameButton}
		<div class="next-game-container">
			<Button variant="primary" size="large" on:click={handleNextGame}>
				▶ {$t('nextGame')}
			</Button>
		</div>
	{/if}

	<!-- New Match Floating Button -->
	<button class="floating-button new-match-button" on:click={handleNewMatchClick} aria-label={$t('newMatchButton')} title={$t('newMatchButton')}>
		▶️
	</button>

	<!-- New Match Confirmation Modal -->
	{#if showNewMatchConfirm}
		<div class="confirm-overlay" on:click={cancelNewMatch}>
			<div class="confirm-modal" on:click|stopPropagation>
				<h3>{$t('confirmNewMatch')}</h3>
				<div class="confirm-buttons">
					<Button variant="secondary" on:click={cancelNewMatch}>
						{$t('cancel')}
					</Button>
					<Button variant="primary" on:click={confirmNewMatch}>
						{$t('confirm')}
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>

<SettingsModal isOpen={showSettings} onClose={() => showSettings = false} />
<HistoryModal isOpen={showHistory} onClose={() => showHistory = false} />
<ColorPickerModal bind:isOpen={showColorPicker} teamNumber={colorPickerTeam} />
<HammerDialog isOpen={showHammerDialog} onClose={handleHammerSelected} />
<TwentyInputDialog
	isOpen={showTwentyDialog}
	on:close={handleTwentyInputClose}
/>


<style>
	.game-page {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		padding: 0.5rem;
		padding-top: max(1rem, env(safe-area-inset-top, 1rem));
		background: linear-gradient(135deg, #0f1419 0%, #1a1f35 100%);
		color: #fff;
		overflow: hidden;
	}

	.game-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-shrink: 0;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		margin-bottom: 0.5rem;
	}

	.left-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
	}

	.center-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		flex: 1;
	}

	.right-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		justify-content: flex-end;
	}

	.game-header h1 {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 900;
		background: linear-gradient(135deg, #00ff88, #00d4ff);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		white-space: nowrap;
	}

	.clickable-title {
		cursor: pointer;
		transition: all 0.2s;
		user-select: none;
	}

	.clickable-title:hover {
		transform: scale(1.05);
		filter: drop-shadow(0 0 8px rgba(0, 255, 136, 0.5));
	}

	.clickable-title:active {
		transform: scale(0.98);
	}

	.version-badge {
		font-size: 0.5rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.4);
		margin-left: 0;
		vertical-align: baseline;
		background: rgba(255, 255, 255, 0.05);
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
		font-family: 'Lexend', sans-serif;
	}

	.event-info-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #00ff88;
		font-weight: 700;
		font-family: 'Orbitron', monospace;
		text-align: center;
		margin-bottom: 0.25rem;
		max-width: 100%;
		overflow: hidden;
	}

	.event-title-header {
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	.event-title-header.editable {
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.event-title-header.editable:hover {
		background: rgba(0, 255, 136, 0.15);
	}

	.event-title-header.placeholder {
		color: rgba(0, 255, 136, 0.4);
		font-style: italic;
	}

	.event-title-input {
		background: rgba(0, 255, 136, 0.1);
		border: 2px solid #00ff88;
		border-radius: 4px;
		padding: 0.2rem 0.4rem;
		font-size: 1rem;
		font-weight: 700;
		color: #00ff88;
		font-family: 'Orbitron', monospace;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		text-align: center;
		outline: none;
		flex: 1;
		min-width: 100px;
	}

	.event-title-input:focus {
		background: rgba(0, 255, 136, 0.2);
		box-shadow: 0 0 8px rgba(0, 255, 136, 0.4);
	}

	.event-phase-header {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.7);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.event-phase-header.editable {
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.event-phase-header.editable:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.event-phase-header.placeholder {
		color: rgba(255, 255, 255, 0.3);
		font-style: italic;
	}

	.event-phase-input {
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.5);
		border-radius: 4px;
		padding: 0.2rem 0.4rem;
		font-size: 1rem;
		font-weight: 700;
		color: #fff;
		font-family: 'Orbitron', monospace;
		text-align: center;
		outline: none;
		min-width: 80px;
	}

	.event-phase-input:focus {
		background: rgba(255, 255, 255, 0.15);
		border-color: #fff;
		box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
	}

	.event-phase-header::before {
		content: '•';
		margin-right: 1rem;
		color: rgba(0, 255, 136, 0.5);
	}

	.game-info {
		position: fixed;
		top: 3.5rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 600;
		font-family: 'Orbitron', monospace;
		text-align: center;
		padding: 0.5rem 1rem;
		background: rgba(10, 14, 26, 0.95);
		border: 2px solid rgba(0, 255, 136, 0.3);
		border-radius: 12px;
		backdrop-filter: blur(12px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 40px rgba(0, 255, 136, 0.15);
	}

	.match-score-container {
		position: fixed;
		top: 7rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
	}

	.previous-games {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(10, 14, 26, 0.95);
		border: 2px solid rgba(0, 255, 136, 0.3);
		border-radius: 12px;
		backdrop-filter: blur(12px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 40px rgba(0, 255, 136, 0.15);
		font-family: 'Orbitron', monospace;
		font-weight: 700;
	}

	.game-result {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.game-number {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.8rem;
	}

	.winner-name {
		font-weight: 700;
	}

	.score {
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.9rem;
	}

	.match-total {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-top: 0.5rem;
		margin-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
		font-size: 1rem;
	}

	.match-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
	}

	.match-result {
		font-size: 1.2rem;
	}

	.score-table-container {
		position: fixed;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
		background: rgba(10, 14, 26, 0.95);
		border: 2px solid rgba(0, 255, 136, 0.3);
		border-radius: 12px;
		backdrop-filter: blur(12px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 40px rgba(0, 255, 136, 0.15);
		padding: 0.75rem;
		max-width: 90vw;
		overflow-x: auto;
	}

	.score-table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'Orbitron', monospace;
		font-size: 0.75rem;
	}

	.score-table th {
		color: #00ff88;
		font-weight: 700;
		padding: 0.4rem 0.6rem;
		text-align: center;
		border-bottom: 1px solid rgba(0, 255, 136, 0.3);
	}

	.score-table td {
		padding: 0.4rem 0.6rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.9);
		font-weight: 600;
	}

	.score-table .team-name {
		text-align: left;
		font-weight: 700;
		font-size: 0.8rem;
		white-space: nowrap;
	}

	.score-table .total-col {
		font-weight: 700;
		font-size: 0.85rem;
		color: #00ff88;
		border-left: 1px solid rgba(0, 255, 136, 0.3);
	}

	.score-table tbody tr {
		border-radius: 6px;
	}

	.score-table .current-round {
		background: rgba(0, 255, 136, 0.15);
		font-weight: 700;
		position: relative;
	}

	.score-table th.current-round {
		color: #00d4ff;
	}

	/* Make score table smaller on mobile to not cover the score */
	@media (max-width: 800px) {
		.score-table-container {
			padding: 0.5rem;
			font-size: 0.65rem;
			bottom: 0.5rem;
		}

		.score-table {
			font-size: 0.65rem;
		}

		.score-table th {
			padding: 0.3rem 0.4rem;
			font-size: 0.65rem;
		}

		.score-table td {
			padding: 0.3rem 0.4rem;
			font-size: 0.65rem;
		}

		.score-table .team-name {
			font-size: 0.7rem;
		}

		.score-table .total-col {
			font-size: 0.75rem;
		}
	}

	.icon-button {
		font-size: 1.2rem;
		padding: 0.25rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		color: #fff;
		cursor: pointer;
		transition: all 0.2s;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-button:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.1);
	}

	.teams-container {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		overflow: hidden;
		align-items: stretch;
	}

	.next-game-container {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 100;
		animation: fadeIn 0.3s ease-out;
	}

	.next-game-container :global(button) {
		font-size: 1.2rem;
		padding: 0.8rem 1.5rem;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}

	/* Responsive */

	/* Portrait: más espacio superior */
	@media (orientation: portrait) {
		.game-page {
			padding-top: max(1.5rem, env(safe-area-inset-top, 1.5rem));
		}

		/* Hide event info in portrait to save space */
		.center-section .event-info-header {
			display: none;
		}

		/* Center the timer when event info is hidden */
		.center-section {
			justify-content: center;
		}
	}

	/* Landscape: menos espacio superior */
	@media (orientation: landscape) {
		.game-page {
			padding-top: max(0.3rem, env(safe-area-inset-top, 0.3rem));
		}
	}

	@media (max-width: 600px) {
		.teams-container {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 480px) {
		.game-page {
			padding: 0.3rem;
			padding-top: max(1.5rem, env(safe-area-inset-top, 1.5rem));
		}

		.game-header {
			padding: 0.3rem;
			gap: 0.3rem;
		}

		.game-header h1 {
			font-size: 0.75rem;
		}

		.game-info {
			font-size: 0.65rem;
		}

		.icon-button {
			width: 28px;
			height: 28px;
			font-size: 0.9rem;
		}

		.teams-container {
			gap: 0.5rem;
		}

		.event-info-header {
			font-size: 0.65rem;
		}

		.game-info {
			font-size: 0.65rem;
			padding: 0.4rem 0.8rem;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.game-page {
			padding-top: max(0.25rem, env(safe-area-inset-top, 0.25rem));
		}

		.game-header {
			padding: 0.3rem;
			margin-bottom: 0.3rem;
		}

		.game-header h1 {
			font-size: 0.85rem;
		}

		.game-info {
			font-size: 0.7rem;
		}

		.icon-button {
			width: 24px;
			height: 24px;
			font-size: 0.8rem;
		}

		.teams-container {
			gap: 0.5rem;
		}

		.event-info-header {
			font-size: 0.65rem;
		}

		.game-info {
			top: 3rem;
			font-size: 0.9rem;
			padding: 0.4rem 0.8rem;
		}
	}



	/* History Button - Destacado en left section */
	.history-button {
		background: transparent !important;
		box-shadow: 0 2px 8px rgba(0, 255, 136, 0.2);
		transition: all 0.2s;
	}

	.history-button:hover {
		transform: scale(1.05);
		background: rgba(0, 255, 136, 0.1) !important;
		box-shadow: 0 3px 12px rgba(0, 255, 136, 0.4);
	}

	/* Floating Button - New Match */
	.floating-button {
		position: fixed;
		bottom: 2rem;
		left: 2rem;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.6rem;
		width: 3rem;
		height: 3rem;
		background: linear-gradient(135deg, #4a90e2, #2563eb);
		border: none;
		border-radius: 50%;
		color: #ffd700;
		font-size: 1.5rem;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(74, 144, 226, 0.4);
		transition: all 0.2s;
		animation: fadeIn 0.3s ease-out;
	}

	.floating-button:hover {
		transform: translateY(-3px);
		box-shadow: 0 6px 16px rgba(74, 144, 226, 0.6);
	}

	.floating-button:active {
		transform: translateY(-1px);
	}

	.floating-button .icon {
		font-size: 1.8rem;
		line-height: 1;
	}

	.floating-button .label {
		font-size: 0.75rem;
		line-height: 1;
	}

	/* Confirmation Modal */
	.confirm-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		opacity: 0;
		animation: overlayFadeIn 0.15s ease-out forwards;
	}

	@keyframes overlayFadeIn {
		to {
			opacity: 1;
		}
	}

	.confirm-modal {
		background: #1a1f35;
		padding: 2rem;
		border-radius: 12px;
		border: 2px solid rgba(0, 255, 136, 0.3);
		max-width: 90%;
		width: 400px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	}

	.confirm-modal h3 {
		margin: 0 0 1.5rem 0;
		color: #fff;
		font-size: 1.1rem;
		text-align: center;
	}

	.confirm-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	/* Responsive for floating button */
	@media (max-width: 768px) {
		.floating-button {
			bottom: 1.5rem;
			left: 1.5rem;
			width: 2.8rem;
			height: 2.8rem;
			font-size: 1.4rem;
		}

		.history-button {
			font-size: 1.2rem !important;
			padding: 0.5rem 0.6rem !important;
		}

		.confirm-modal {
			width: 90%;
			padding: 1.5rem;
		}

		.confirm-modal h3 {
			font-size: 1rem;
		}
	}

	@media (orientation: landscape) {
		.confirm-modal {
			width: 350px;
			max-width: 60%;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.floating-button {
			bottom: 1rem;
			left: 1rem;
			width: 2.5rem;
			height: 2.5rem;
			font-size: 1.3rem;
		}

		.history-button {
			font-size: 1.1rem !important;
			padding: 0.4rem 0.5rem !important;
		}

		.confirm-modal {
			width: 300px;
			max-width: 50%;
			padding: 1rem;
		}

		.confirm-modal h3 {
			font-size: 0.9rem;
			margin-bottom: 1rem;
		}
	}
</style>
