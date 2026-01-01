<script lang="ts">
	import { t } from '$lib/stores/language';
	import { resetTeams, switchSides, switchColors, team1, team2, updateTeam } from '$lib/stores/teams';
	import { resetMatchState, resetGameOnly, currentMatchGames, roundsPlayed, addGame, saveMatchState } from '$lib/stores/matchState';
	import { resetTimerFromSettings } from '$lib/stores/timer';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { currentUser, signOut } from '$lib/firebase/auth';
	import { completeCurrentMatch, startCurrentMatch, currentMatch } from '$lib/stores/history';
	import { get } from 'svelte/store';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// Menu open/close state
	let isOpen = false;
	let isMatchComplete = false;

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}

	// Calculate if match is complete
	$: {
		const matchGames = $currentMatchGames;
		const settings = $gameSettings;
		const team1GamesWon = matchGames.filter(g => g.winner === 1).length;
		const team2GamesWon = matchGames.filter(g => g.winner === 2).length;
		isMatchComplete = team1GamesWon >= settings.matchesToWin || team2GamesWon >= settings.matchesToWin;
	}

	// Reset round: clear points and reset timer
	function handleResetRound() {
		resetTeams();
		const settings = get(gameSettings);
		resetTimerFromSettings(settings.timerMinutes, settings.timerSeconds);
		closeMenu();
	}

	// Next game: save current game and start next one
	function handleNextGame() {
		const t1 = get(team1);
		const t2 = get(team2);
		const settings = get(gameSettings);
		const matchGames = get(currentMatchGames);

		// Check if someone won
		if (!t1.hasWon && !t2.hasWon) {
			// No winner yet, can't proceed to next game
			closeMenu();
			return;
		}

		// Save this completed game
		const gameNumber = matchGames.length + 1;
		const winner = t1.hasWon ? 1 : 2;

		const newGame = {
			gameNumber,
			winner,
			team1Points: t1.points,
			team2Points: t2.points,
			team1Rounds: t1.rounds,
			team2Rounds: t2.rounds,
			team1Twenty: t1.twenty,
			team2Twenty: t2.twenty,
			timestamp: Date.now()
		};

		// Add game to currentMatchGames and save to localStorage
		addGame(newGame);

		// Check if someone won the match (reached matchesToWin)
		const team1GamesWon = matchGames.filter(g => g.winner === 1).length + (winner === 1 ? 1 : 0);
		const team2GamesWon = matchGames.filter(g => g.winner === 2).length + (winner === 2 ? 1 : 0);

		const matchComplete = team1GamesWon >= settings.matchesToWin || team2GamesWon >= settings.matchesToWin;

		if (matchComplete) {
			// Match is complete, save to history
			saveMatchToHistory();
		} else {
			// Match continues, reset for next game
			resetForNextGame();
		}

		closeMenu();
	}

	function saveMatchToHistory() {
		// Ensure we have a current match started
		if (!get(currentMatch)) {
			startCurrentMatch();
		}

		const t1 = get(team1);
		const t2 = get(team2);
		const settings = get(gameSettings);
		const matchGames = get(currentMatchGames);
		const current = get(currentMatch);

		// Determine match winner based on games won
		const team1GamesWon = matchGames.filter(g => g.winner === 1).length;
		const team2GamesWon = matchGames.filter(g => g.winner === 2).length;
		const matchWinner = team1GamesWon > team2GamesWon ? 1 : 2;

		// Convert GameData to MatchGame with rounds from currentMatch
		const gamesWithRounds = matchGames.map(game => ({
			team1Points: game.team1Points,
			team2Points: game.team2Points,
			gameNumber: game.gameNumber,
			winner: game.winner,
			rounds: current?.rounds || [] // All rounds from currentMatch
		}));

		completeCurrentMatch({
			team1Name: t1.name || 'Team 1',
			team2Name: t2.name || 'Team 2',
			team1Color: t1.color,
			team2Color: t2.color,
			winner: matchWinner,
			team1Score: matchGames.reduce((sum, g) => sum + g.team1Points, 0),
			team2Score: matchGames.reduce((sum, g) => sum + g.team2Points, 0),
			totalRounds: get(roundsPlayed),
			matchesToWin: settings.matchesToWin,
			gameMode: settings.gameMode,
			gameType: settings.gameType,
			pointsToWin: settings.pointsToWin,
			roundsToPlay: settings.roundsToPlay,
			eventTitle: settings.eventTitle,
			matchPhase: settings.matchPhase,
			games: gamesWithRounds
		});
	}

	function resetForNextGame() {
		// Reset points and game state for next game
		updateTeam(1, { points: 0, rounds: 0, twenty: 0, hasWon: false });
		updateTeam(2, { points: 0, rounds: 0, twenty: 0, hasWon: false });

		// Reset only current game rounds (keep match history)
		resetGameOnly();

		// Start a new game
		startCurrentMatch();
	}

	// Reset match: clear everything
	function handleResetMatch() {
		resetTeams();
		resetMatchState();
		const settings = get(gameSettings);
		resetTimerFromSettings(settings.timerMinutes, settings.timerSeconds);
		closeMenu();

		// Emit event to show hammer dialog
		dispatch('matchReset');
	}

	// Switch team sides
	function handleSwitchSides() {
		switchSides();
		closeMenu();
	}

	// Switch team colors
	function handleSwitchColors() {
		switchColors();
		closeMenu();
	}

	// Auth actions
	async function handleSignOut() {
		await signOut();
		closeMenu();
	}

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (isOpen && !target.closest('.quick-menu-container')) {
			closeMenu();
		}
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="quick-menu-container">
	<button class="menu-button" on:click|stopPropagation={toggleMenu} aria-label="Quick menu">
		☰
	</button>

	{#if isOpen}
		<div class="quick-menu" on:click|stopPropagation>
			<!-- Auth section -->
			{#if $currentUser}
				<button class="quick-menu-item" on:click={handleSignOut}>
					<span class="icon">↪</span>
					<span>{$t('logout')}</span>
				</button>
				<div class="divider"></div>
			{/if}

			<!-- Game actions -->
			{#if $gameSettings.gameMode === 'points'}
				<!-- Show "Next Game" only when someone won, matchesToWin > 1, and match is NOT complete -->
				{#if ($team1.hasWon || $team2.hasWon) && $gameSettings.matchesToWin > 1 && !isMatchComplete}
					<button class="quick-menu-item" on:click={handleNextGame}>
						<span class="icon">▶</span>
						<span>{$t('nextGame')}</span>
					</button>
				{/if}
			{/if}

			<button class="quick-menu-item" on:click={handleResetMatch}>
				<span class="icon">⟲</span>
				<span>{$t('newMatch')}</span>
			</button>

			<button class="quick-menu-item" on:click={handleSwitchSides}>
				<span class="icon">⇄</span>
				<span>{$t('switchSides')}</span>
			</button>

			<button class="quick-menu-item" on:click={handleSwitchColors}>
				<span class="icon">🎨</span>
				<span>{$t('switchColors')}</span>
			</button>
		</div>
	{/if}
</div>

<style>
	.quick-menu-container {
		position: relative;
	}

	.menu-button {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		color: #fff;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.menu-button:hover {
		background: rgba(255, 255, 255, 0.15);
		transform: scale(1.05);
	}

	.menu-button:active {
		transform: scale(0.95);
	}

	.quick-menu {
		position: absolute;
		top: 40px;
		left: 0;
		background: rgba(26, 31, 53, 0.98);
		border: 2px solid rgba(0, 255, 136, 0.3);
		border-radius: 12px;
		padding: 0.5rem;
		min-width: 200px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 1000;
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.quick-menu-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: #fff;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.quick-menu-item:hover {
		background: rgba(0, 255, 136, 0.1);
		color: #00ff88;
	}

	.quick-menu-item:active {
		transform: scale(0.98);
	}

	.icon {
		font-size: 1.25rem;
		width: 24px;
		text-align: center;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0.5rem 0;
	}

	/* Responsive */
	@media (max-width: 480px) {
		.menu-button {
			width: 28px;
			height: 28px;
			font-size: 0.9rem;
		}

		.quick-menu {
			top: 36px;
			min-width: 180px;
		}

		.quick-menu-item {
			font-size: 0.9rem;
			padding: 0.6rem 0.8rem;
		}

		.icon {
			font-size: 1.1rem;
			width: 20px;
		}
	}
</style>
