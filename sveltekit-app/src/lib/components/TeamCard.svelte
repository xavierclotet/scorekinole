<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { vibrate } from '$lib/utils/vibration';
	import { getContrastColor } from '$lib/utils/colors';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { team1, team2, updateTeam, resetTeams } from '$lib/stores/teams';
	import { t } from '$lib/stores/language';
	import { completeCurrentMatch, startCurrentMatch, currentMatch, addGameToCurrentMatch, clearCurrentMatchRounds } from '$lib/stores/history';
	import { lastRoundPoints, completeRound, roundsPlayed, resetGameOnly, resetMatchState, currentMatchGames, currentMatchRounds } from '$lib/stores/matchState';
	import { get } from 'svelte/store';
	import type { Team } from '$lib/types/team';

	export let teamNumber: 1 | 2 = 1;
	export let isMatchComplete: boolean = false;
	export let currentGameNumber: number = 1;

	const dispatch = createEventDispatcher();

	// Get the appropriate team store
	$: team = teamNumber === 1 ? $team1 : $team2;
	$: otherTeam = teamNumber === 1 ? $team2 : $team1;

	// Swipe gesture state
	let touchStartY = 0;
	let touchStartTime = 0;
	let isTouchDevice = false;

	function handleTouchStart(e: TouchEvent) {
		// Ignore if touch started on a button
		const target = e.target as HTMLElement;
		if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return;

		isTouchDevice = true;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
	}

	function handleTouchEnd(e: TouchEvent) {
		// Ignore if touch started on a button
		const target = e.target as HTMLElement;
		if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return;

		const touchEndY = e.changedTouches[0].clientY;
		const deltaY = touchStartY - touchEndY;
		const deltaTime = Date.now() - touchStartTime;

		// Swipe detection: minimum 30px, maximum 500ms
		if (Math.abs(deltaY) > 30 && deltaTime < 500) {
			if (deltaY > 0) {
				// Swipe up - increment
				incrementScore();
			} else {
				// Swipe down - decrement
				decrementScore();
			}
		} else if (Math.abs(deltaY) < 10 && deltaTime < 300) {
			// Tap detection - increment score
			incrementScore();
		}
	}

	// Mouse drag support for desktop
	let mouseStartY = 0;
	let mouseStartTime = 0;
	let isDragging = false;

	function handleMouseDown(e: MouseEvent) {
		// Ignore if mouse started on a button or input
		const target = e.target as HTMLElement;
		if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return;

		// Ignore mouse events if this is a touch device
		if (isTouchDevice) return;

		mouseStartY = e.clientY;
		mouseStartTime = Date.now();
		isDragging = true;
	}

	function handleMouseUp(e: MouseEvent) {
		// Ignore mouse events if this is a touch device
		if (isTouchDevice) return;

		if (!isDragging) return;
		isDragging = false;

		const mouseEndY = e.clientY;
		const deltaY = mouseStartY - mouseEndY;
		const deltaTime = Date.now() - mouseStartTime;

		if (Math.abs(deltaY) > 30 && deltaTime < 500) {
			if (deltaY > 0) {
				incrementScore();
			} else {
				decrementScore();
			}
		} else if (Math.abs(deltaY) < 10 && deltaTime < 300) {
			// Click detection - increment score
			incrementScore();
		}
	}

	function incrementScore() {
		// Block scoring if either team has already won
		const t1 = get(team1);
		const t2 = get(team2);
		if (t1.hasWon || t2.hasWon) {
			return; // Don't allow score changes after match is won
		}

		const previousT1 = get(lastRoundPoints).team1;
		const previousT2 = get(lastRoundPoints).team2;

		updateTeam(teamNumber, { points: team.points + 1 });
		vibrate(10);

		// Check for round completion (2 point difference from last round)
		checkRoundCompletion(previousT1, previousT2);
		checkWinCondition();
	}

	function decrementScore() {
		// Block scoring if either team has already won
		const t1 = get(team1);
		const t2 = get(team2);
		if (t1.hasWon || t2.hasWon) {
			return; // Don't allow score changes after match is won
		}

		const previousT1 = get(lastRoundPoints).team1;
		const previousT2 = get(lastRoundPoints).team2;

		// Prevent decrementing if we're at the last completed round score
		// This means no "partial" points have been added yet in the current round
		if (t1.points === previousT1 && t2.points === previousT2) {
			return; // Don't allow decrementing a completed round score
		}

		updateTeam(teamNumber, { points: Math.max(0, team.points - 1) });
		vibrate(10);

		// Check for round completion (2 point difference from last round)
		checkRoundCompletion(previousT1, previousT2);
		checkWinCondition();
	}

	function checkRoundCompletion(previousT1: number, previousT2: number) {
		const t1 = get(team1);
		const t2 = get(team2);

		const team1Change = t1.points - previousT1;
		const team2Change = t2.points - previousT2;
		const totalChange = team1Change + team2Change;

		// Round completes when total change is EXACTLY 2
		// Examples: 0-0 → 2-0, or 0-0 → 0-2, or 0-0 → 1-1
		if (totalChange === 2) {
			// Determine round winner
			const roundWinner = team1Change > team2Change ? 1 : team2Change > team1Change ? 2 : 0;

			// Dispatch roundComplete event BEFORE completing the round
			// This will trigger the 20s dialog if enabled
			// The actual round completion will happen when the dialog closes
			// Pass the ROUND points (changes), not total accumulated points
			dispatch('roundComplete', {
				winningTeam: roundWinner as 0 | 1 | 2,
				team1Points: team1Change,
				team2Points: team2Change
			});
		}
	}

	// Export function to complete round after 20s are entered
	export function finalizeRound(winningTeam: 0 | 1 | 2, team1Points: number, team2Points: number) {
		const t1 = get(team1);
		const t2 = get(team2);

		// Increment rounds won counter
		if (winningTeam === 1) {
			updateTeam(1, { rounds: t1.rounds + 1 });
		} else if (winningTeam === 2) {
			updateTeam(2, { rounds: t2.rounds + 1 });
		}

		// Determine who has hammer BEFORE rotating
		const hammerTeam = t1.hasHammer ? 1 : t2.hasHammer ? 2 : null;

		// Rotate hammer after each round
		rotateHammer();

		// Save round data with the 20s that were just entered and who had hammer
		completeRound(team1Points, team2Points, t1.twenty, t2.twenty, hammerTeam);

		// Check if rounds mode is active and match should end
		checkRoundsModeWin();

		// Check if points mode is active and someone won
		checkPointsModeWin();
	}

	function rotateHammer() {
		const t1 = get(team1);
		const t2 = get(team2);

		// Swap hammer: team with hammer loses it, team without gains it
		updateTeam(1, { hasHammer: !t1.hasHammer });
		updateTeam(2, { hasHammer: !t2.hasHammer });
	}

	function checkRoundsModeWin() {
		if ($gameSettings.gameMode !== 'rounds') return;

		const currentRoundsPlayed = get(roundsPlayed);

		// Check if we've reached the target number of rounds
		if (currentRoundsPlayed >= $gameSettings.roundsToPlay) {
			const t1 = get(team1);
			const t2 = get(team2);

			// Determine winner by rounds won
			if (t1.rounds > t2.rounds) {
				updateTeam(1, { hasWon: true });
				updateTeam(2, { hasWon: false });
				// Check if this game win completes the match
				saveGameAndCheckMatchComplete();
			} else if (t2.rounds > t1.rounds) {
				updateTeam(2, { hasWon: true });
				updateTeam(1, { hasWon: false });
				// Check if this game win completes the match
				saveGameAndCheckMatchComplete();
			}
			// In case of tie, no winner - don't save game
		}
	}

	function checkPointsModeWin() {
		if ($gameSettings.gameMode !== 'points') return;

		const t1 = get(team1);
		const t2 = get(team2);

		// Check if either team reached pointsToWin AND has 2-point lead
		const pointDifference = Math.abs(t1.points - t2.points);
		const team1Won = t1.points >= $gameSettings.pointsToWin && pointDifference >= 2 && t1.points > t2.points;
		const team2Won = t2.points >= $gameSettings.pointsToWin && pointDifference >= 2 && t2.points > t1.points;

		if (team1Won && !t1.hasWon) {
			updateTeam(1, { hasWon: true });
			updateTeam(2, { hasWon: false });
			// Check if this game win completes the match
			saveGameAndCheckMatchComplete();
		} else if (team2Won && !t2.hasWon) {
			updateTeam(2, { hasWon: true });
			updateTeam(1, { hasWon: false });
			// Check if this game win completes the match
			saveGameAndCheckMatchComplete();
		}
	}

	function checkWinCondition() {
		// Victory is now checked only when a round completes, not on every point change
		// See checkPointsModeWin() and checkRoundsModeWin()
	}

	function saveGameAndCheckMatchComplete() {
		const t1 = get(team1);
		const t2 = get(team2);
		const settings = get(gameSettings);
		const totalRoundsPlayed = get(roundsPlayed);
		const matchGames = get(currentMatchGames);
		const current = get(currentMatch);

		console.log('🟢 saveGameAndCheckMatchComplete called');
		console.log('Settings:', settings);
		console.log('matchesToWin:', settings.matchesToWin);

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

		console.log('New game:', newGame);

		// Add game to currentMatchGames (for backwards compatibility)
		currentMatchGames.update(games => [...games, newGame]);

		// Add game with rounds to currentMatch for history display
		const rounds = get(currentMatchRounds);
		const gameWithRounds = {
			...newGame,
			rounds: rounds
		};
		addGameToCurrentMatch(gameWithRounds);

		console.log('Game saved with rounds:', rounds.length);

		// Check if someone won the match
		const team1GamesWon = matchGames.filter(g => g.winner === 1).length + (winner === 1 ? 1 : 0);
		const team2GamesWon = matchGames.filter(g => g.winner === 2).length + (winner === 2 ? 1 : 0);

		console.log('Team 1 games won:', team1GamesWon);
		console.log('Team 2 games won:', team2GamesWon);
		console.log('Game mode:', settings.gameMode);

		// In rounds mode, match is complete after first game
		// In points mode, need to reach matchesToWin
		const matchComplete = settings.gameMode === 'rounds'
			? true
			: (team1GamesWon >= settings.matchesToWin || team2GamesWon >= settings.matchesToWin);

		console.log('Match complete?', matchComplete);

		if (matchComplete) {
			console.log('✅ Match is complete! Saving to history...');
			// Increment the matches counter for the match winner
			if (team1GamesWon >= settings.matchesToWin) {
				updateTeam(1, { matches: t1.matches + 1 });
			} else if (team2GamesWon >= settings.matchesToWin) {
				updateTeam(2, { matches: t2.matches + 1 });
			}

			// Match is complete, save to history
			saveMatchToHistory();
		} else {
			console.log('❌ Match is NOT complete');
		}
		// If match is NOT complete, don't reset automatically
		// User will click "Next Game" button to continue
	}

	function saveMatchToHistory() {
		const t1 = get(team1);
		const t2 = get(team2);
		const settings = get(gameSettings);
		const current = get(currentMatch);

		console.log('🔵 saveMatchToHistory called');
		console.log('Current match:', current);

		// Ensure we have a current match
		if (!current) {
			console.error('❌ No current match to save');
			return;
		}

		console.log('Current match games:', current.games);
		console.log('First game rounds:', current.games[0]?.rounds);

		// Determine match winner based on games won
		const team1GamesWon = current.games.filter(g => g.winner === 1).length;
		const team2GamesWon = current.games.filter(g => g.winner === 2).length;
		const matchWinner = team1GamesWon > team2GamesWon ? 1 : 2;

		console.log('Team 1 games won:', team1GamesWon);
		console.log('Team 2 games won:', team2GamesWon);
		console.log('Match winner:', matchWinner);
		console.log('Calling completeCurrentMatch...');

		// Use games from currentMatch which already have rounds
		completeCurrentMatch({
			team1Name: t1.name || 'Team 1',
			team2Name: t2.name || 'Team 2',
			team1Color: t1.color,
			team2Color: t2.color,
			team1Score: current.games.reduce((sum, g) => sum + g.team1Points, 0),
			team2Score: current.games.reduce((sum, g) => sum + g.team2Points, 0),
			totalRounds: get(roundsPlayed),
			matchesToWin: settings.matchesToWin,
			winner: matchWinner,
			gameMode: settings.gameMode,
			gameType: settings.gameType,
			pointsToWin: settings.pointsToWin,
			roundsToPlay: settings.roundsToPlay,
			eventTitle: settings.eventTitle,
			matchPhase: settings.matchPhase,
			showHammer: settings.showHammer,
			show20s: settings.show20s,
			games: current.games
		});
	}

	export function resetForNextGame() {
		// Reset points and game state for next game
		updateTeam(1, { points: 0, rounds: 0, twenty: 0, hasWon: false });
		updateTeam(2, { points: 0, rounds: 0, twenty: 0, hasWon: false });

		// Reset only current game rounds (keep match history)
		resetGameOnly();

		// Rounds are already cleared by addGameToCurrentMatch()
		// No need to call startCurrentMatch() again - match continues
	}

	function handleNameChange(e: Event) {
		const input = e.target as HTMLInputElement;
		updateTeam(teamNumber, { name: input.value });
	}

	function handleChangeColor() {
		dispatch('changeColor');
	}

</script>

<div
	class="team-card"
	class:winner={team.hasWon}
	style="--team-color: {team.color}; --text-color: {getContrastColor(team.color)}"
	on:touchstart={handleTouchStart}
	on:touchend={handleTouchEnd}
	on:mousedown={handleMouseDown}
	on:mouseup={handleMouseUp}
	role="button"
	tabindex="0"
	aria-label="{team.name} score: {team.points}"
>
	<div class="team-header">
		<button
			class="color-btn"
			on:click|stopPropagation={handleChangeColor}
			aria-label="Change color"
			title={$t('chooseColor')}
		>
			🎨
		</button>
		<div class="name-hammer-group">
			<div class="name-row">
				<input
					type="text"
					class="team-name"
					value={team.name}
					on:input={handleNameChange}
					placeholder={$t('teamName')}
					aria-label="Team name"
				/>
				{#if team.hasHammer}
					<div class="hammer-indicator" title={$t('hammer')}>🔨</div>
				{/if}
			</div>
			{#if team.hasWon && currentGameNumber > 0}
				<div class="winner-badge">
					{#if isMatchComplete}
						{$t('winner')}
					{:else}
						{$t('gameWin').replace('{n}', currentGameNumber.toString())}
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<div class="score-display">
		<div class="score">{team.points}</div>
	</div>
</div>

<style>
	.team-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background-color: var(--team-color);
		color: var(--text-color);
		border-radius: 12px;
		padding: 1.5rem;
		min-height: 300px;
		cursor: pointer;
		user-select: none;
		transition: all 0.3s ease;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.team-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
	}

	.team-card:active {
		transform: translateY(0);
	}

	.team-card.winner {
		animation: pulse-winner 1s ease-in-out infinite;
		box-shadow: 0 0 30px var(--team-color);
	}

	@keyframes pulse-winner {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.02);
		}
	}

	.team-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		justify-content: center;
		margin-bottom: 1rem;
		position: relative;
	}

	.color-btn {
		position: absolute;
		left: 0;
		background: rgba(255, 255, 255, 0.2);
		border: 2px solid var(--text-color);
		color: var(--text-color);
		font-size: 1.5rem;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.color-btn:hover {
		background: rgba(255, 255, 255, 0.3);
		transform: scale(1.1);
	}

	.color-btn:active {
		transform: scale(0.95);
	}

	.name-hammer-group {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.team-name {
		background: transparent;
		border: none;
		border-bottom: 2px solid var(--text-color);
		color: var(--text-color);
		font-size: 2.4rem;
		font-weight: 700;
		text-align: center;
		padding: 0.25rem 0.5rem;
		max-width: 350px;
		width: 100%;
		transition: all 0.2s;
	}

	.team-name:focus {
		outline: none;
		border-bottom-width: 3px;
		transform: scale(1.05);
	}

	.team-name::placeholder {
		color: var(--text-color);
		opacity: 0.6;
	}

	.hammer-indicator {
		font-size: 2.2rem;
		animation: swing 1s ease-in-out infinite;
	}

	@keyframes swing {
		0%,
		100% {
			transform: rotate(-10deg);
		}
		50% {
			transform: rotate(10deg);
		}
	}

	.score-display {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 2rem 0;
	}

	.score {
		font-size: 9.6rem;
		font-weight: 900;
		line-height: 1;
		text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
	}

	.winner-badge {
		background: linear-gradient(135deg, #ffd700, #ffed4e);
		color: #000;
		padding: 0.4rem 1rem;
		border-radius: 20px;
		font-weight: 900;
		font-size: 0.85rem;
		letter-spacing: 0.05em;
		box-shadow:
			0 4px 12px rgba(255, 215, 0, 0.4),
			0 0 20px rgba(255, 215, 0, 0.3);
		animation: winnerGlow 1.5s ease-in-out infinite;
	}

	@keyframes winnerGlow {
		0%, 100% {
			box-shadow:
				0 4px 12px rgba(255, 215, 0, 0.4),
				0 0 20px rgba(255, 215, 0, 0.3);
		}
		50% {
			box-shadow:
				0 4px 16px rgba(255, 215, 0, 0.6),
				0 0 30px rgba(255, 215, 0, 0.5);
		}
	}

	@keyframes bounce {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.team-name {
			font-size: 2.16rem;
		}

		.score {
			font-size: 7.2rem;
		}

		.winner-badge {
			font-size: 0.8rem;
			padding: 0.35rem 0.85rem;
		}
	}

	@media (max-width: 480px) {
		.team-card {
			min-height: 250px;
			padding: 1rem;
		}

		.team-name {
			font-size: 1.8rem;
		}

		.score {
			font-size: 6rem;
		}

		.winner-badge {
			font-size: 0.75rem;
			padding: 0.3rem 0.75rem;
		}

		.hammer-indicator {
			font-size: 1.2rem;
		}
	}

	/* Portrait mobile - score grande aprovechando altura */
	@media (max-width: 768px) and (orientation: portrait) {
		.score {
			font-size: 9.6rem;
		}

		.team-name {
			font-size: 2.4rem;
		}
	}

	@media (max-width: 480px) and (orientation: portrait) {
		.score {
			font-size: 8rem;
		}

		.team-name {
			font-size: 2rem;
		}
	}

	/* Landscape mobile - score más pequeño por altura limitada */
	@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
		.team-card {
			min-height: 200px;
			padding: 0.75rem;
		}

		.team-name {
			font-size: 1.6rem;
		}

		.score {
			font-size: 5rem;
			margin: 1rem 0;
		}

		.winner-badge {
			font-size: 0.7rem;
			padding: 0.25rem 0.6rem;
		}

		.hammer-indicator {
			font-size: 1rem;
		}
	}
</style>
