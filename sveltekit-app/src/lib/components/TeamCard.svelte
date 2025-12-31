<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { vibrate } from '$lib/utils/vibration';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { team1, team2, updateTeam, resetTeams } from '$lib/stores/teams';
	import { t } from '$lib/stores/language';
	import { completeCurrentMatch, startCurrentMatch, currentMatch } from '$lib/stores/history';
	import { lastRoundPoints, completeRound, roundsPlayed } from '$lib/stores/matchState';
	import { get } from 'svelte/store';
	import type { Team } from '$lib/types/team';

	export let teamNumber: 1 | 2 = 1;

	const dispatch = createEventDispatcher();

	// Get the appropriate team store
	$: team = teamNumber === 1 ? $team1 : $team2;
	$: otherTeam = teamNumber === 1 ? $team2 : $team1;

	// Swipe gesture state
	let touchStartY = 0;
	let touchStartTime = 0;
	let isTouchDevice = false;

	// Calculate contrast color for text based on background
	function getContrastColor(hexColor: string): string {
		const r = parseInt(hexColor.slice(1, 3), 16);
		const g = parseInt(hexColor.slice(3, 5), 16);
		const b = parseInt(hexColor.slice(5, 7), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5 ? '#000000' : '#ffffff';
	}

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
		const previousT1 = get(lastRoundPoints).team1;
		const previousT2 = get(lastRoundPoints).team2;

		updateTeam(teamNumber, { points: team.points + 1 });
		vibrate(10);

		// Check for round completion (2 point difference from last round)
		checkRoundCompletion(previousT1, previousT2);
		checkWinCondition();
	}

	function decrementScore() {
		const previousT1 = get(lastRoundPoints).team1;
		const previousT2 = get(lastRoundPoints).team2;

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
			dispatch('roundComplete', {
				winningTeam: roundWinner as 0 | 1 | 2,
				team1Points: t1.points,
				team2Points: t2.points
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

		// Rotate hammer after each round
		rotateHammer();

		// Save round data with the 20s that were just entered
		completeRound(team1Points, team2Points, t1.twenty, t2.twenty);

		// Check if rounds mode is active and match should end
		checkRoundsModeWin();
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
			} else if (t2.rounds > t1.rounds) {
				updateTeam(2, { hasWon: true });
				updateTeam(1, { hasWon: false });
			}
			// In case of tie, no winner

			// Save match to history
			saveMatchToHistory();
		}
	}

	function checkWinCondition() {
		const currentTeam = teamNumber === 1 ? $team1 : $team2;
		const opponent = teamNumber === 1 ? $team2 : $team1;

		if ($gameSettings.gameMode === 'points') {
			// Points mode: first to reach pointsToWin with 2+ point lead
			const hasWon =
				currentTeam.points >= $gameSettings.pointsToWin &&
				currentTeam.points - opponent.points >= 2;

			// Check if this is a NEW win (not already won)
			const wasAlreadyWon = currentTeam.hasWon;

			updateTeam(teamNumber, { hasWon });

			// Update opponent
			const opponentNumber = teamNumber === 1 ? 2 : 1;
			updateTeam(opponentNumber, { hasWon: false });

			// If this is a new win, save match to history
			if (hasWon && !wasAlreadyWon) {
				saveMatchToHistory();
			}
		} else {
			// Rounds mode: win by rounds count at end
			// (This will be handled by round completion logic later)
		}
	}

	function saveMatchToHistory() {
		// Ensure we have a current match started
		if (!get(currentMatch)) {
			startCurrentMatch();
		}

		const t1 = get(team1);
		const t2 = get(team2);
		const settings = get(gameSettings);
		const totalRoundsPlayed = get(roundsPlayed);

		// Determine winner
		const winner = t1.hasWon ? 1 : t2.hasWon ? 2 : null;

		completeCurrentMatch({
			team1Name: t1.name || 'Team 1',
			team2Name: t2.name || 'Team 2',
			team1Color: t1.color,
			team2Color: t2.color,
			team1Score: t1.points,
			team2Score: t2.points,
			team1Rounds: t1.rounds,
			team2Rounds: t2.rounds,
			totalRounds: totalRoundsPlayed,
			winner,
			gameMode: settings.gameMode,
			gameType: settings.gameType,
			pointsToWin: settings.pointsToWin,
			roundsToPlay: settings.roundsToPlay,
			matchesToWin: settings.matchesToWin,
			games: []
		});
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
	</div>

	<div class="score-display">
		<div class="score">{team.points}</div>
	</div>

	{#if team.hasWon}
		<div class="winner-badge">{$t('winner')}</div>
	{/if}

	<div class="team-stats">
		{#if $gameSettings.show20s}
			<span title={$t('twenties')}>20s: {team.twenty}</span>
		{/if}
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
		align-items: center;
		gap: 0.5rem;
	}

	.team-name {
		background: transparent;
		border: none;
		border-bottom: 2px solid var(--text-color);
		color: var(--text-color);
		font-size: 2rem;
		font-weight: 700;
		text-align: center;
		padding: 0.25rem 0.5rem;
		max-width: 200px;
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
		font-size: 1.5rem;
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
		font-size: 8rem;
		font-weight: 900;
		line-height: 1;
		text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
	}

	.winner-badge {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: rgba(255, 215, 0, 0.9);
		color: #000;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-weight: 700;
		font-size: 0.9rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		animation: bounce 0.5s ease-in-out;
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

	.team-stats {
		display: flex;
		gap: 1.5rem;
		margin-top: 1rem;
		font-size: 1rem;
		opacity: 0.9;
	}

	.team-stats span {
		font-weight: 600;
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.team-name {
			font-size: 1.8rem;
		}

		.score {
			font-size: 6rem;
		}
	}

	@media (max-width: 480px) {
		.team-card {
			min-height: 250px;
			padding: 1rem;
		}

		.team-name {
			font-size: 1.5rem;
		}

		.score {
			font-size: 5rem;
		}

		.team-stats {
			font-size: 0.9rem;
		}
	}
</style>
