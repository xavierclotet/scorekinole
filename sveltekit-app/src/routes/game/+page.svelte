<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { language, t } from '$lib/stores/language';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { team1, team2, loadTeams, saveTeams, resetTeams, switchSides, switchColors } from '$lib/stores/teams';
	import { timeRemaining, resetTimer, cleanupTimer } from '$lib/stores/timer';
	import { loadMatchState, resetMatchState, roundsPlayed, currentGameStartHammer, twentyDialogPending, setTwentyDialogPending } from '$lib/stores/matchState';
	import { loadHistory, startCurrentMatch, currentMatch } from '$lib/stores/history';
	import TeamCard from '$lib/components/TeamCard.svelte';
	import Timer from '$lib/components/Timer.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import HistoryModal from '$lib/components/HistoryModal.svelte';
	import QuickMenu from '$lib/components/QuickMenu.svelte';
	import ColorPickerModal from '$lib/components/ColorPickerModal.svelte';
	import HammerDialog from '$lib/components/HammerDialog.svelte';
	import TwentyInputDialog from '$lib/components/TwentyInputDialog.svelte';
	import Button from '$lib/components/Button.svelte';

	let showSettings = false;
	let showHistory = false;
	let showColorPicker = false;
	let colorPickerTeam: 1 | 2 = 1;
	let showHammerDialog = false;

	// References to TeamCard components to call their methods
	let teamCard1: any;
	let teamCard2: any;

	// Round completion data stored temporarily while 20s dialog is shown
	let pendingRoundData: { winningTeam: 0 | 1 | 2; team1Points: number; team2Points: number } | null = null;

	// Bind showTwentyDialog to the store
	$: showTwentyDialog = $twentyDialogPending;

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

		// Show HammerDialog at match start (when no hammer has been assigned)
		if ($currentGameStartHammer === null && $roundsPlayed === 0) {
			showHammerDialog = true;
		}

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

	function openColorPicker(team: 1 | 2) {
		colorPickerTeam = team;
		showColorPicker = true;
	}

	function handleHammerSelected() {
		showHammerDialog = false;
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
</script>

<div class="game-page">
	<header class="game-header">
		<div class="left-section">
			<QuickMenu />
			<h1>Scorekinole</h1>
		</div>

		<div class="center-section">
			<Timer size="small" />
			<div class="game-info">
				{#if $gameSettings.gameMode === 'rounds'}
					{$team1.rounds} / {$gameSettings.roundsToPlay}
				{:else}
					{$t('matchTo')} {$gameSettings.pointsToWin} {$t('points')}
				{/if}
			</div>
		</div>

		<div class="right-section">
			<div class="language-selector">
				<button class:active={$gameSettings.language === 'es'} on:click={() => gameSettings.update(s => ({ ...s, language: 'es' }))}>ES</button>
				<button class:active={$gameSettings.language === 'ca'} on:click={() => gameSettings.update(s => ({ ...s, language: 'ca' }))}>CA</button>
				<button class:active={$gameSettings.language === 'en'} on:click={() => gameSettings.update(s => ({ ...s, language: 'en' }))}>EN</button>
			</div>
			<button class="icon-button" on:click={() => showHistory = true} aria-label="History">
				📜
			</button>
			<button class="icon-button" on:click={() => showSettings = true} aria-label="Settings">
				⚙️
			</button>
		</div>
	</header>

	<div class="teams-container">
		<TeamCard
			bind:this={teamCard1}
			teamNumber={1}
			on:changeColor={() => openColorPicker(1)}
			on:roundComplete={handleRoundComplete}
		/>
		<TeamCard
			bind:this={teamCard2}
			teamNumber={2}
			on:changeColor={() => openColorPicker(2)}
			on:roundComplete={handleRoundComplete}
		/>
	</div>
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

	.game-info {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 600;
		font-family: 'Orbitron', monospace;
		text-align: center;
	}

	.language-selector {
		display: flex;
		gap: 0.25rem;
	}

	.language-selector button {
		padding: 0.25rem 0.5rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid transparent;
		border-radius: 6px;
		color: #fff;
		cursor: pointer;
		transition: all 0.2s;
		font-weight: 600;
		font-size: 0.75rem;
	}

	.language-selector button:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.language-selector button.active {
		background: #00ff88;
		color: #000;
		border-color: #00ff88;
	}

	.icon-button {
		font-size: 1rem;
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

	/* Responsive */

	@media (max-width: 480px) {
		.game-page {
			padding: 0.3rem;
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

		.language-selector button {
			font-size: 0.7rem;
			padding: 0.2rem 0.4rem;
		}

		.icon-button {
			width: 28px;
			height: 28px;
			font-size: 0.9rem;
		}

		.teams-container {
			gap: 0.5rem;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
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

		.language-selector button {
			font-size: 0.65rem;
			padding: 0.15rem 0.3rem;
		}

		.icon-button {
			width: 24px;
			height: 24px;
			font-size: 0.8rem;
		}

		.teams-container {
			gap: 0.5rem;
		}
	}
</style>
