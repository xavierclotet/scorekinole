<script lang="ts">
	import { vibrate } from '$lib/utils/vibration';
	import { getContrastColor } from '$lib/utils/colors';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { team1, team2, updateTeam, resetTeams } from '$lib/stores/teams';
	import { t } from '$lib/stores/language';
	import { completeCurrentMatch, startCurrentMatch, currentMatch, addGameToCurrentMatch, clearCurrentMatchRounds } from '$lib/stores/history';
	import { lastRoundPoints, completeRound, roundsPlayed, resetGameOnly, resetMatchState, currentMatchGames, currentMatchRounds, currentGameStartHammer, setCurrentGameStartHammer } from '$lib/stores/matchState';
	import { gameTournamentContext } from '$lib/stores/tournamentContext';
	import { get } from 'svelte/store';
	import type { Team } from '$lib/types/team';

	interface Props {
		teamNumber?: 1 | 2;
		isMatchComplete?: boolean;
		currentGameNumber?: number;
		onroundComplete?: (data: { winningTeam: 0 | 1 | 2; team1Points: number; team2Points: number }) => void;
		onchangeColor?: () => void;
		onextraRound?: (data: { roundNumber: number }) => void;
		ontournamentMatchComplete?: () => void;
	}

	let {
		teamNumber = 1,
		isMatchComplete = false,
		currentGameNumber = 1,
		onroundComplete,
		onchangeColor,
		onextraRound,
		ontournamentMatchComplete
	}: Props = $props();

	// Tournament mode detection
	let inTournamentMode = $derived(!!$gameTournamentContext);

	// Effective settings: use tournament config when in tournament mode
	let effectiveShowHammer = $derived(inTournamentMode
		? $gameTournamentContext?.gameConfig.showHammer ?? $gameSettings.showHammer
		: $gameSettings.showHammer);

	let effectiveGameMode = $derived(inTournamentMode
		? $gameTournamentContext?.gameConfig.gameMode ?? $gameSettings.gameMode
		: $gameSettings.gameMode);

	let effectiveRoundsToPlay = $derived(inTournamentMode
		? $gameTournamentContext?.gameConfig.roundsToPlay ?? $gameSettings.roundsToPlay
		: $gameSettings.roundsToPlay);

	let effectivePointsToWin = $derived(inTournamentMode
		? $gameTournamentContext?.gameConfig.pointsToWin ?? $gameSettings.pointsToWin
		: $gameSettings.pointsToWin);

	// Get the appropriate team store
	let team = $derived(teamNumber === 1 ? $team1 : $team2);
	let otherTeam = $derived(teamNumber === 1 ? $team2 : $team1);

	// Name editing state
	let isEditingName = $state(false);
	let nameInputRef = $state<HTMLInputElement | null>(null);

	// Swipe gesture state
	let touchStartX = $state(0);
	let touchStartY = $state(0);
	let touchStartTime = $state(0);
	let isTouchDevice = $state(false);

	const SWIPE_THRESHOLD = 40; // px minimum for swipe
	const SWIPE_TIMEOUT = 500; // ms maximum for swipe

	function handleTouchStart(e: TouchEvent) {
		isTouchDevice = true;
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
	}

	function handleTouchEnd(e: TouchEvent) {
		const touchEndX = e.changedTouches[0].clientX;
		const touchEndY = e.changedTouches[0].clientY;
		const deltaX = touchEndX - touchStartX;
		const deltaY = touchStartY - touchEndY;
		const deltaTime = Date.now() - touchStartTime;

		// Determine if swipe is more horizontal or vertical
		const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);

		if (deltaTime < SWIPE_TIMEOUT) {
			if (isHorizontal && Math.abs(deltaX) > SWIPE_THRESHOLD) {
				// Horizontal swipe - change score size
				if (deltaX > 0) {
					cycleMainScoreSize(1); // Right = increase
				} else {
					cycleMainScoreSize(-1); // Left = decrease
				}
			} else if (!isHorizontal && Math.abs(deltaY) > 30) {
				// Vertical swipe - change score
				if (deltaY > 0) {
					incrementScore();
				} else {
					decrementScore();
				}
			} else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < 300) {
				// Tap detection - increment score
				incrementScore();
			}
		}
	}

	function cycleMainScoreSize(direction: 1 | -1) {
		const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
		const currentIndex = sizes.indexOf($gameSettings.mainScoreSize || 'medium');
		const nextIndex = (currentIndex + direction + sizes.length) % sizes.length;
		gameSettings.update(s => ({ ...s, mainScoreSize: sizes[nextIndex] }));
		gameSettings.save();
	}

	function cycleNameSize() {
		const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
		const currentIndex = sizes.indexOf($gameSettings.nameSize || 'medium');
		const nextIndex = (currentIndex + 1) % sizes.length;
		gameSettings.update(s => ({ ...s, nameSize: sizes[nextIndex] }));
		gameSettings.save();
		vibrate(10);
	}

	// Mouse drag support for desktop
	let mouseStartX = $state(0);
	let mouseStartY = $state(0);
	let mouseStartTime = $state(0);
	let isDragging = $state(false);

	function handleMouseDown(e: MouseEvent) {
		// Ignore mouse events if this is a touch device
		if (isTouchDevice) return;

		mouseStartX = e.clientX;
		mouseStartY = e.clientY;
		mouseStartTime = Date.now();
		isDragging = true;
	}

	function handleMouseUp(e: MouseEvent) {
		// Ignore mouse events if this is a touch device
		if (isTouchDevice) return;

		if (!isDragging) return;
		isDragging = false;

		const mouseEndX = e.clientX;
		const mouseEndY = e.clientY;
		const deltaX = mouseEndX - mouseStartX;
		const deltaY = mouseStartY - mouseEndY;
		const deltaTime = Date.now() - mouseStartTime;

		// Determine if swipe is more horizontal or vertical
		const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);

		if (deltaTime < SWIPE_TIMEOUT) {
			if (isHorizontal && Math.abs(deltaX) > SWIPE_THRESHOLD) {
				// Horizontal swipe - change score size
				if (deltaX > 0) {
					cycleMainScoreSize(1); // Right = increase
				} else {
					cycleMainScoreSize(-1); // Left = decrease
				}
			} else if (!isHorizontal && Math.abs(deltaY) > 30) {
				// Vertical swipe - change score
				if (deltaY > 0) {
					incrementScore();
				} else {
					decrementScore();
				}
			} else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < 300) {
				// Click detection - increment score
				incrementScore();
			}
		}
	}

	function incrementScore() {
		// Block scoring if match is complete (including ties) or either team has won
		if (isMatchComplete) {
			return; // Don't allow score changes after match is complete
		}
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
		// Block scoring if match is complete (including ties) or either team has won
		if (isMatchComplete) {
			return; // Don't allow score changes after match is complete
		}
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

			// Call roundComplete callback BEFORE completing the round
			// This will trigger the 20s dialog if enabled
			// The actual round completion will happen when the dialog closes
			// Pass the ROUND points (changes), not total accumulated points
			onroundComplete?.({
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

		// Reset 20s counters for next round
		updateTeam(1, { twenty: 0 });
		updateTeam(2, { twenty: 0 });

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
		// Use effective game mode (tournament config when in tournament mode)
		if (effectiveGameMode !== 'rounds') return;

		const currentRoundsPlayed = get(roundsPlayed);
		const context = get(gameTournamentContext);
		const settings = get(gameSettings);

		// Determine if ties are NOT allowed:
		// - Tournament bracket matches: always require winner (extra rounds)
		// - Friendly matches: check allowTiesInRoundsMode setting
		const isBracketMatch = context?.phase === 'FINAL';
		const requireWinner = isBracketMatch || (!context && !settings.allowTiesInRoundsMode);

		// Check if we've reached the target number of rounds
		if (currentRoundsPlayed >= effectiveRoundsToPlay) {
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
			} else {
				// Tie situation - different handling based on requireWinner
				if (requireWinner) {
					// Bracket or no-tie mode: don't declare tie, continue with extra rounds
					// The tie overlay won't show because neither team hasWon
					// Players will play extra round(s) until someone wins
					console.log('🎯 Tiebreaker: continuing with extra round');
					onextraRound?.({ roundNumber: currentRoundsPlayed + 1 });
				} else {
					// Regular match with ties allowed: end as tie
					updateTeam(1, { hasWon: false });
					updateTeam(2, { hasWon: false });
					saveGameAndCheckMatchComplete(true);
				}
			}
		}
	}

	function checkPointsModeWin() {
		// Use effective game mode (tournament config when in tournament mode)
		if (effectiveGameMode !== 'points') return;

		const t1 = get(team1);
		const t2 = get(team2);

		// Check if either team reached pointsToWin AND has 2-point lead
		const pointDifference = Math.abs(t1.points - t2.points);
		const team1Won = t1.points >= effectivePointsToWin && pointDifference >= 2 && t1.points > t2.points;
		const team2Won = t2.points >= effectivePointsToWin && pointDifference >= 2 && t2.points > t1.points;

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

	function saveGameAndCheckMatchComplete(isTie: boolean = false) {
		const t1 = get(team1);
		const t2 = get(team2);
		const settings = get(gameSettings);
		const totalRoundsPlayed = get(roundsPlayed);
		const matchGames = get(currentMatchGames);
		const current = get(currentMatch);

		console.log('🟢 saveGameAndCheckMatchComplete called', { isTie });
		console.log('Settings:', settings);
		console.log('matchesToWin:', settings.matchesToWin);

		// Save this completed game
		const gameNumber = matchGames.length + 1;
		// In case of tie, winner is null
		const winner = isTie ? null : (t1.hasWon ? 1 : 2);

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
		// In points mode, need to reach required wins (majority for best-of format)
		// For "best of X", you need ceil(X/2) wins (e.g., best of 3 = need 2 wins)
		const requiredWins = Math.ceil(settings.matchesToWin / 2);
		const matchComplete = settings.gameMode === 'rounds'
			? true
			: (team1GamesWon >= requiredWins || team2GamesWon >= requiredWins);

		console.log('Match complete?', matchComplete);

		if (matchComplete) {
			console.log('✅ Match is complete! Saving to history...');
			// Increment the matches counter for the match winner
			if (team1GamesWon >= requiredWins) {
				updateTeam(1, { matches: t1.matches + 1 });
			} else if (team2GamesWon >= requiredWins) {
				updateTeam(2, { matches: t2.matches + 1 });
			}

			// IMPORTANT: Call tournament match complete callback BEFORE saving to history
			// This ensures the parent component can capture all data before currentMatch is cleared
			if (inTournamentMode) {
				console.log('🏆 Calling tournamentMatchComplete callback');
				ontournamentMatchComplete?.();
				// En modo torneo, NO guardar en historial local (ya se sincroniza a Firebase)
				// IMPORTANTE: NO llamar a resetMatchState() aquí - el handler en +page.svelte
				// necesita capturar todos los datos primero y luego hará el reset
			} else {
				// Solo guardar en historial local si NO es partido de torneo
				saveMatchToHistory();
			}
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
		// Handle ties: if equal games won, winner is null
		const matchWinner = team1GamesWon > team2GamesWon ? 1 : team2GamesWon > team1GamesWon ? 2 : null;

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
		// Get who had the hammer at the START of the previous game
		// This is the team that did NOT start (didn't throw first)
		const previousGameStartHammer = get(currentGameStartHammer);

		// Reset points and game state for next game
		updateTeam(1, { points: 0, rounds: 0, twenty: 0, hasWon: false });
		updateTeam(2, { points: 0, rounds: 0, twenty: 0, hasWon: false });

		// Reset only current game rounds (keep match history)
		resetGameOnly();

		// Alternate the hammer for the next game
		// If team 1 had hammer at start of previous game, team 2 gets it now (and vice versa)
		// This means the team that STARTED the previous game will now have the hammer
		if (previousGameStartHammer !== null) {
			const newHammerTeam = previousGameStartHammer === 1 ? 2 : 1;
			updateTeam(1, { hasHammer: newHammerTeam === 1 });
			updateTeam(2, { hasHammer: newHammerTeam === 2 });
			// Update the store to track who has hammer at start of this new game (persisted)
			setCurrentGameStartHammer(newHammerTeam);
			console.log(`🔨 Hammer alternated for new game: Team ${newHammerTeam} now has hammer (Team ${previousGameStartHammer === 1 ? 2 : 1} starts)`);
		}

		// Rounds are already cleared by addGameToCurrentMatch()
		// No need to call startCurrentMatch() again - match continues
	}

	function handleNameChange(e: Event) {
		// Block name changes in tournament mode
		if (inTournamentMode) return;
		const input = e.target as HTMLInputElement;
		const text = input.value.trim();
		updateTeam(teamNumber, { name: text });
	}

	function startEditingName(e: Event) {
		if (inTournamentMode) return;
		e.stopPropagation();
		isEditingName = true;
		// Focus the input after it renders
		setTimeout(() => {
			nameInputRef?.focus();
			nameInputRef?.select();
		}, 0);
	}

	function stopEditingName() {
		isEditingName = false;
	}

	function handleChangeColor() {
		onchangeColor?.();
	}

</script>

<div
	class="team-card score-size-{$gameSettings.mainScoreSize || 'medium'} name-size-{$gameSettings.nameSize || 'medium'}"
	class:winner={team.hasWon}
	style="--team-color: {team.color}; --text-color: {getContrastColor(team.color)}"
>
	<div class="team-header">
		<button
			class="color-btn"
			onclick={(e) => { e.stopPropagation(); handleChangeColor(); }}
			aria-label="Change color"
			title={$t('chooseColor')}
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>
		</button>
		{#if teamNumber === 2}
			<button
				class="name-size-btn"
				onclick={(e) => { e.stopPropagation(); cycleNameSize(); }}
				ontouchend={(e) => e.stopPropagation()}
				onmouseup={(e) => e.stopPropagation()}
				aria-label="Change name size"
				title="Change name size"
			>
				<span class="aa-icon">Aa</span>
			</button>
		{/if}
		<div class="name-hammer-group">
			{#if inTournamentMode}
				<div class="tournament-player-display">
					<span class="player-name-badge">{team.name}</span>
					{#if teamNumber === 1 && $gameTournamentContext?.currentUserRanking !== undefined}
						<span class="ranking-badge">#{$gameTournamentContext.currentUserRanking}</span>
					{/if}
				</div>
			{:else if isEditingName}
				<input
					bind:this={nameInputRef}
					type="text"
					class="team-name-input"
					value={team.name}
					placeholder={$t('teamName')}
					oninput={handleNameChange}
					onblur={stopEditingName}
					onkeydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
					onclick={(e) => e.stopPropagation()}
					ontouchstart={(e) => e.stopPropagation()}
					ontouchend={(e) => e.stopPropagation()}
					onmousedown={(e) => e.stopPropagation()}
					onmouseup={(e) => e.stopPropagation()}
				/>
			{:else}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="team-name-display"
					onclick={startEditingName}
					ontouchend={startEditingName}
				>
					{team.name || $t('teamName')}
				</span>
			{/if}
			{#if effectiveShowHammer && team.hasHammer}
				<div class="hammer-indicator" title={$t('hammer')}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12l-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15L22 10.64"/><path d="M20.91 11.7l-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/></svg>
				</div>
			{/if}
		</div>
	</div>

	<div
		class="score-display"
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
		onmousedown={handleMouseDown}
		onmouseup={handleMouseUp}
		role="button"
		tabindex="0"
		aria-label="{team.name} score: {team.points}"
	>
		{#if team.hasWon && currentGameNumber > 0}
			<div class="winner-badge">
				{#if isMatchComplete}
					{$t('winner')}
				{:else}
					{$t('gameWin').replace('{n}', currentGameNumber.toString())}
				{/if}
			</div>
		{/if}
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
		border-radius: 16px;
		padding: 1.5rem;
		min-height: 300px;
		user-select: none;
		transition: all 0.2s ease;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		overflow: hidden;
	}

	.team-card.winner {
		box-shadow: 0 0 40px color-mix(in srgb, var(--team-color) 50%, transparent);
	}

	.team-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		justify-content: center;
		position: absolute;
		top: 1rem;
		left: 0;
		right: 0;
		padding: 0 1rem;
		pointer-events: none;
	}

	.team-header button,
	.team-header input {
		pointer-events: auto;
	}

	.color-btn {
		position: absolute;
		left: 1rem;
		top: 0;
		background: rgba(255, 255, 255, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.25);
		color: var(--text-color);
		font-size: 1.2rem;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.color-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.color-btn:active {
		transform: scale(0.95);
	}

	.name-size-btn {
		position: absolute;
		right: 1rem;
		top: 0;
		background: rgba(255, 255, 255, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.25);
		color: var(--text-color);
		width: 36px;
		height: 36px;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.name-size-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.name-size-btn:active {
		transform: scale(0.95);
	}

	.aa-icon {
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.name-hammer-group {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		width: 100%;
		max-width: calc(100% - 100px); /* Leave space for buttons on both sides */
	}

	.team-name-input {
		background: transparent;
		border: none;
		border-bottom: 2px solid color-mix(in srgb, var(--text-color) 40%, transparent);
		color: var(--text-color);
		font-family: 'Lexend', sans-serif;
		font-size: 1.5rem;
		font-weight: 600;
		text-align: center;
		padding: 0.25rem 0.5rem;
		max-width: 70%;
		width: auto;
		min-width: 80px;
		transition: all 0.2s ease;
		line-height: 1.2;
		cursor: text;
	}

	.team-name-input:focus {
		outline: none;
		border-bottom-color: var(--text-color);
	}

	.team-name-input::placeholder {
		color: var(--text-color);
		opacity: 0.5;
	}

	.team-name-display {
		color: var(--text-color);
		font-family: 'Lexend', sans-serif;
		font-size: 1.5rem;
		font-weight: 600;
		text-align: center;
		padding: 0.25rem 0.5rem;
		max-width: 70%;
		line-height: 1.2;
		/* Allow text to wrap */
		white-space: normal;
		word-break: normal;
		overflow-wrap: break-word;
		cursor: text;
		border-bottom: 2px solid transparent;
		transition: border-color 0.2s ease;
	}

	.team-name-display:hover {
		border-bottom-color: color-mix(in srgb, var(--text-color) 40%, transparent);
	}

	/* Tournament player display */
	.tournament-player-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.player-name-badge {
		font-family: 'Lexend', sans-serif;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--text-color);
		text-align: center;
		max-width: 70%;
		line-height: 1.2;
		white-space: normal;
		word-break: normal;
		overflow-wrap: normal;
	}

	.ranking-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		background: rgba(255, 215, 0, 0.2);
		border: 1px solid rgba(255, 215, 0, 0.4);
		border-radius: 6px;
		color: var(--text-color);
	}

	.hammer-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.7;
	}

	.hammer-indicator svg {
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
	}

	.score-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		gap: 0.5rem;
		width: 100%;
		cursor: pointer;
	}

	.score-display:active .score {
		transform: scale(0.995);
	}

	.score {
		font-family: 'Lexend', sans-serif;
		font-size: 12rem;
		font-weight: 800;
		line-height: 1;
		opacity: 0.95;
		transition: font-size 0.2s ease;
	}

	/* Score size variants - base (desktop landscape) */
	.score-size-small .score { font-size: 8rem; }
	.score-size-medium .score { font-size: 12rem; }
	.score-size-large .score { font-size: 16rem; }

	/* Name size variants - base (desktop) */
	.name-size-small .team-name-input,
	.name-size-small .team-name-display,
	.name-size-small .player-name-badge { font-size: 1.5rem; }
	.name-size-medium .team-name-input,
	.name-size-medium .team-name-display,
	.name-size-medium .player-name-badge { font-size: 1.9rem; }
	.name-size-large .team-name-input,
	.name-size-large .team-name-display,
	.name-size-large .player-name-badge { font-size: 2.3rem; }

	/* Hammer size scales with name size */
	.name-size-small .hammer-indicator svg { width: 18px; height: 18px; }
	.name-size-medium .hammer-indicator svg { width: 22px; height: 22px; }
	.name-size-large .hammer-indicator svg { width: 26px; height: 26px; }

	.winner-badge {
		background: rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: var(--text-color);
		padding: 0.35rem 0.9rem;
		border-radius: 4px;
		font-family: 'Lexend', sans-serif;
		font-weight: 500;
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0.9;
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		/* Score sizes for tablet */
		.score-size-small .score { font-size: 6rem; }
		.score-size-medium .score { font-size: 8rem; }
		.score-size-large .score { font-size: 10rem; }

		/* Name sizes for tablet */
		.name-size-small .team-name-input,
	.name-size-small .team-name-display,
		.name-size-small .player-name-badge { font-size: 1.3rem; }
		.name-size-medium .team-name-input,
	.name-size-medium .team-name-display,
		.name-size-medium .player-name-badge { font-size: 1.6rem; }
		.name-size-large .team-name-input,
	.name-size-large .team-name-display,
		.name-size-large .player-name-badge { font-size: 2rem; }

		/* Hammer sizes for tablet */
		.name-size-small .hammer-indicator svg { width: 16px; height: 16px; }
		.name-size-medium .hammer-indicator svg { width: 20px; height: 20px; }
		.name-size-large .hammer-indicator svg { width: 24px; height: 24px; }

		.winner-badge {
			font-size: 0.7rem;
			padding: 0.3rem 0.8rem;
		}

		.ranking-badge {
			font-size: 0.65rem;
		}

		.color-btn,
		.name-size-btn {
			width: 32px;
			height: 32px;
		}

		.aa-icon {
			font-size: 0.8rem;
		}
	}

	@media (max-width: 480px) {
		.team-card {
			min-height: 220px;
			padding: 1rem;
			border-radius: 12px;
		}

		/* Score sizes for mobile */
		.score-size-small .score { font-size: 4.5rem; }
		.score-size-medium .score { font-size: 6rem; }
		.score-size-large .score { font-size: 8rem; }

		/* Name sizes for mobile */
		.name-size-small .team-name-input,
	.name-size-small .team-name-display,
		.name-size-small .player-name-badge { font-size: 1.2rem; }
		.name-size-medium .team-name-input,
	.name-size-medium .team-name-display,
		.name-size-medium .player-name-badge { font-size: 1.45rem; }
		.name-size-large .team-name-input,
	.name-size-large .team-name-display,
		.name-size-large .player-name-badge { font-size: 1.75rem; }

		/* Hammer sizes for mobile */
		.name-size-small .hammer-indicator svg { width: 14px; height: 14px; }
		.name-size-medium .hammer-indicator svg { width: 17px; height: 17px; }
		.name-size-large .hammer-indicator svg { width: 21px; height: 21px; }

		.winner-badge {
			font-size: 0.65rem;
			padding: 0.25rem 0.6rem;
		}

		.ranking-badge {
			font-size: 0.6rem;
			padding: 0.1rem 0.4rem;
		}

		.color-btn,
		.name-size-btn {
			width: 28px;
			height: 28px;
			border-radius: 8px;
		}

		.aa-icon {
			font-size: 0.75rem;
		}

		.team-header {
			top: 0.75rem;
		}
	}

	/* Portrait mobile - bigger scores */
	@media (max-width: 768px) and (orientation: portrait) {
		.score {
			font-size: 10rem;
		}

		/* Name sizes for portrait tablet */
		.name-size-small .team-name-input,
	.name-size-small .team-name-display,
		.name-size-small .player-name-badge { font-size: 1.4rem; }
		.name-size-medium .team-name-input,
	.name-size-medium .team-name-display,
		.name-size-medium .player-name-badge { font-size: 1.7rem; }
		.name-size-large .team-name-input,
	.name-size-large .team-name-display,
		.name-size-large .player-name-badge { font-size: 2.1rem; }

		/* Hammer sizes for portrait tablet */
		.name-size-small .hammer-indicator svg { width: 17px; height: 17px; }
		.name-size-medium .hammer-indicator svg { width: 21px; height: 21px; }
		.name-size-large .hammer-indicator svg { width: 25px; height: 25px; }
	}

	@media (max-width: 480px) and (orientation: portrait) {
		/* Score sizes for portrait mobile */
		.score-size-small .score { font-size: 6rem; }
		.score-size-medium .score { font-size: 8rem; }
		.score-size-large .score { font-size: 10rem; }

		/* Name sizes for portrait mobile */
		.name-size-small .team-name-input,
	.name-size-small .team-name-display,
		.name-size-small .player-name-badge { font-size: 1.25rem; }
		.name-size-medium .team-name-input,
	.name-size-medium .team-name-display,
		.name-size-medium .player-name-badge { font-size: 1.5rem; }
		.name-size-large .team-name-input,
	.name-size-large .team-name-display,
		.name-size-large .player-name-badge { font-size: 1.8rem; }

		/* Hammer sizes for portrait mobile */
		.name-size-small .hammer-indicator svg { width: 15px; height: 15px; }
		.name-size-medium .hammer-indicator svg { width: 18px; height: 18px; }
		.name-size-large .hammer-indicator svg { width: 22px; height: 22px; }
	}

	/* Very small portrait phones */
	@media (max-width: 380px) and (orientation: portrait) {
		/* Score sizes for very small phones */
		.score-size-small .score { font-size: 5rem; }
		.score-size-medium .score { font-size: 7rem; }
		.score-size-large .score { font-size: 9rem; }

		/* Name sizes for very small phones */
		.name-size-small .team-name-input,
	.name-size-small .team-name-display,
		.name-size-small .player-name-badge { font-size: 1.1rem; }
		.name-size-medium .team-name-input,
	.name-size-medium .team-name-display,
		.name-size-medium .player-name-badge { font-size: 1.3rem; }
		.name-size-large .team-name-input,
	.name-size-large .team-name-display,
		.name-size-large .player-name-badge { font-size: 1.55rem; }

		/* Hammer sizes for very small phones */
		.name-size-small .hammer-indicator svg { width: 13px; height: 13px; }
		.name-size-medium .hammer-indicator svg { width: 16px; height: 16px; }
		.name-size-large .hammer-indicator svg { width: 19px; height: 19px; }
	}

	/* Landscape mobile - smaller scores due to limited height */
	@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
		.team-card {
			min-height: 180px;
			padding: 0.75rem;
		}

		/* Score sizes for landscape mobile (height-limited) */
		.score-size-small .score { font-size: 3.5rem; }
		.score-size-medium .score { font-size: 5rem; }
		.score-size-large .score { font-size: 6.5rem; }

		/* Name sizes for landscape mobile */
		.name-size-small .team-name-input,
	.name-size-small .team-name-display,
		.name-size-small .player-name-badge { font-size: 1.1rem; }
		.name-size-medium .team-name-input,
	.name-size-medium .team-name-display,
		.name-size-medium .player-name-badge { font-size: 1.3rem; }
		.name-size-large .team-name-input,
	.name-size-large .team-name-display,
		.name-size-large .player-name-badge { font-size: 1.55rem; }

		/* Hammer sizes for landscape mobile */
		.name-size-small .hammer-indicator svg { width: 13px; height: 13px; }
		.name-size-medium .hammer-indicator svg { width: 16px; height: 16px; }
		.name-size-large .hammer-indicator svg { width: 19px; height: 19px; }

		.winner-badge {
			font-size: 0.6rem;
			padding: 0.2rem 0.5rem;
		}

		.ranking-badge {
			font-size: 0.55rem;
		}

		.color-btn,
		.name-size-btn {
			width: 26px;
			height: 26px;
		}

		.aa-icon {
			font-size: 0.7rem;
		}

		.team-header {
			top: 0.5rem;
		}
	}
</style>
