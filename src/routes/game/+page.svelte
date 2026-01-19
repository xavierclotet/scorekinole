<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { get } from 'svelte/store';
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
	import TournamentMatchModal from '$lib/components/TournamentMatchModal.svelte';
	import Button from '$lib/components/Button.svelte';
	import { isColorDark } from '$lib/utils/colors';
	import {
		gameTournamentContext,
		loadTournamentContext,
		clearTournamentContext,
		updateTournamentContext,
		type TournamentMatchContext
	} from '$lib/stores/tournamentContext';
	import {
		syncMatchProgress,
		completeMatch as completeTournamentMatchSync,
		abandonMatch as abandonTournamentMatchSync
	} from '$lib/firebase/tournamentSync';

	let showSettings = false;
	let showHistory = false;
	let showColorPicker = false;
	let colorPickerTeam: 1 | 2 = 1;
	let showHammerDialog = false;
	let showNewMatchConfirm = false;
	let showTournamentModal = false;
	let showTournamentExitConfirm = false;
	let showTournamentResetConfirm = false;
	let isResettingTournament = false;

	// Tournament mode state
	$: inTournamentMode = !!$gameTournamentContext;

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
	// In points mode, match is complete when someone reaches the required wins
	// matchesToWin = number of games needed to win the match (e.g., 2 = first to win 2 games)
	$: requiredWinsToComplete = $gameSettings.matchesToWin;
	$: isMatchComplete = $gameSettings.gameMode === 'rounds'
		? (team1GamesWon >= 1 || team2GamesWon >= 1)
		: (team1GamesWon >= requiredWinsToComplete || team2GamesWon >= requiredWinsToComplete);

	// Show "Next Game" button when someone won the current game AND match is not complete AND it's a multi-game match
	// Note: We removed the "$currentMatchGames.length > 0" requirement because:
	// 1. When the first game ends, saveGameAndCheckMatchComplete adds it to currentMatchGames
	// 2. But on page reload, we don't restore the current completed game to currentMatchGames (to avoid double-counting)
	// 3. The other conditions are sufficient: hasWon + !isMatchComplete + matchesToWin > 1 + points mode
	$: showNextGameButton = ($team1.hasWon || $team2.hasWon) && !isMatchComplete && $gameSettings.matchesToWin > 1 && $gameSettings.gameMode === 'points';

	// Track if tournament match completion has been sent
	let tournamentMatchCompletedSent = false;

	// Handler for tournament match complete event from TeamCard
	// This is called BEFORE currentMatch is cleared, ensuring we have all data
	function handleTournamentMatchCompleteFromEvent() {
		if (!tournamentMatchCompletedSent) {
			handleTournamentMatchComplete();
		}
	}

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

		// Load tournament context if any
		const savedContext = loadTournamentContext();
		if (savedContext) {
			applyTournamentConfig(savedContext);
		}

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

	/**
	 * Apply tournament configuration to game settings and teams
	 */
	function applyTournamentConfig(context: TournamentMatchContext) {
		const config = context.gameConfig;
		const isUserSideA = context.currentUserSide === 'A';

		console.log('🎯 applyTournamentConfig llamado:', {
			existingRounds: context.existingRounds,
			currentGameData: context.currentGameData,
			isUserSideA,
			gameConfig: config
		});

		// Apply game settings from tournament
		gameSettings.update(s => ({
			...s,
			gameMode: config.gameMode,
			pointsToWin: config.pointsToWin || 7,
			roundsToPlay: config.roundsToPlay || 4,
			matchesToWin: config.matchesToWin,
			show20s: config.show20s,
			showHammer: config.showHammer,
			gameType: config.gameType,
			eventTitle: context.tournamentName,
			matchPhase: context.bracketRoundName || (context.phase === 'GROUP' ? 'Fase de Grupos' : 'Bracket')
		}));

		// PRIMERO: Reset match state (esto limpia todo)
		resetMatchState();
		startCurrentMatch();

		// Calculate initial points from existing rounds if resuming
		let initialPoints1 = 0;
		let initialPoints2 = 0;
		let initialRounds1 = 0;
		let initialRounds2 = 0;
		let initialMatches1 = 0;
		let initialMatches2 = 0;

		if (context.existingRounds && context.existingRounds.length > 0) {
			// Get current game data
			const currentGameData = context.currentGameData;
			const currentGameNumber = currentGameData?.currentGameNumber || 1;

			// Get rounds for current game only
			const currentGameRoundsData = context.existingRounds.filter(r => r.gameNumber === currentGameNumber);

			console.log('📊 Procesando rondas existentes:', {
				totalRounds: context.existingRounds.length,
				currentGameNumber,
				roundsForCurrentGame: currentGameRoundsData.length,
				rawRounds: currentGameRoundsData
			});

			currentGameRoundsData.forEach(r => {
				const pointsA = r.pointsA || 0;
				const pointsB = r.pointsB || 0;

				// Map A/B to team1/team2 based on user side
				if (isUserSideA) {
					initialPoints1 += pointsA;
					initialPoints2 += pointsB;
					if (pointsA > pointsB) initialRounds1++;
					else if (pointsB > pointsA) initialRounds2++;
				} else {
					initialPoints1 += pointsB;
					initialPoints2 += pointsA;
					if (pointsB > pointsA) initialRounds1++;
					else if (pointsA > pointsB) initialRounds2++;
				}
			});

			// Set games won (matches in team terminology)
			if (currentGameData) {
				if (isUserSideA) {
					initialMatches1 = currentGameData.gamesWonA;
					initialMatches2 = currentGameData.gamesWonB;
				} else {
					initialMatches1 = currentGameData.gamesWonB;
					initialMatches2 = currentGameData.gamesWonA;
				}
			}

			console.log('📥 Valores calculados para restaurar:', {
				initialPoints1, initialPoints2,
				initialRounds1, initialRounds2,
				initialMatches1, initialMatches2
			});
		} else {
			console.log('🆕 Partido nuevo - sin datos existentes');
		}

		// Set team names and initial state from tournament participants
		// Note: team1 = user's perspective (A if userSideA, else B)
		const team1Name = isUserSideA ? context.participantAName : context.participantBName;
		const team2Name = isUserSideA ? context.participantBName : context.participantAName;

		// Check if current game was already completed (to restore hasWon state)
		// This happens when user reloads while waiting to click "Next Game"
		let team1HasWon = false;
		let team2HasWon = false;
		if (config.gameMode === 'points' && context.currentGameData) {
			const currentGameNumber = context.currentGameData.currentGameNumber || 1;
			const currentGameRoundsData = context.existingRounds?.filter(r => r.gameNumber === currentGameNumber) || [];

			// Check if current game reached winning score
			const pointsToWin = config.pointsToWin || 7;
			if (initialPoints1 >= pointsToWin && (initialPoints1 - initialPoints2 >= 2)) {
				team1HasWon = true;
			} else if (initialPoints2 >= pointsToWin && (initialPoints2 - initialPoints1 >= 2)) {
				team2HasWon = true;
			}
		}

		// DESPUÉS del reset: aplicar los valores iniciales
		team1.update(t => ({
			...t,
			name: team1Name,
			points: initialPoints1,
			rounds: initialRounds1,
			matches: initialMatches1,
			twenty: 0,
			hasWon: team1HasWon
		}));

		team2.update(t => ({
			...t,
			name: team2Name,
			points: initialPoints2,
			rounds: initialRounds2,
			matches: initialMatches2,
			twenty: 0,
			hasWon: team2HasWon
		}));

		saveTeams();
		gameSettings.save();

		// IMPORTANTE: Actualizar lastRoundPoints para que checkRoundCompletion funcione correctamente
		// Esto indica que los puntos actuales son el "final de la última ronda"
		lastRoundPoints.set({ team1: initialPoints1, team2: initialPoints2 });

		// IMPORTANTE: Restaurar las rondas existentes en currentGameRounds y roundsPlayed
		// Esto es necesario para que saveTournamentProgressToLocalStorage tenga todas las rondas
		if (context.existingRounds && context.existingRounds.length > 0) {
			const currentGameData = context.currentGameData;
			const currentGameNumber = currentGameData?.currentGameNumber || 1;
			const currentGameRoundsData = context.existingRounds.filter(r => r.gameNumber === currentGameNumber);

			// Convertir rondas del formato torneo al formato del store
			const restoredRounds = currentGameRoundsData.map((r, index) => {
				const pointsA = r.pointsA || 0;
				const pointsB = r.pointsB || 0;
				const twentiesA = r.twentiesA || 0;
				const twentiesB = r.twentiesB || 0;

				return {
					roundNumber: index + 1,
					team1Points: isUserSideA ? pointsA : pointsB,
					team2Points: isUserSideA ? pointsB : pointsA,
					team1Twenty: isUserSideA ? twentiesA : twentiesB,
					team2Twenty: isUserSideA ? twentiesB : twentiesA,
					hammerTeam: null as 1 | 2 | null,
					timestamp: Date.now()
				};
			});

			// Restaurar en los stores
			currentGameRounds.set(restoredRounds);
			roundsPlayed.set(restoredRounds.length);

			// IMPORTANTE: Restaurar los juegos completados en currentMatchGames
			// Esto es necesario para que showNextGameButton funcione correctamente
			const completedGames: Array<{
				gameNumber: number;
				winner: 1 | 2;
				team1Points: number;
				team2Points: number;
				timestamp: number;
			}> = [];

			// Reconstruct completed games from existingRounds (games before current)
			for (let gameNum = 1; gameNum < currentGameNumber; gameNum++) {
				const gameRounds = context.existingRounds.filter(r => r.gameNumber === gameNum);
				if (gameRounds.length > 0) {
					const gameTotalA = gameRounds.reduce((sum, r) => sum + (r.pointsA || 0), 0);
					const gameTotalB = gameRounds.reduce((sum, r) => sum + (r.pointsB || 0), 0);
					const team1Pts = isUserSideA ? gameTotalA : gameTotalB;
					const team2Pts = isUserSideA ? gameTotalB : gameTotalA;

					completedGames.push({
						gameNumber: gameNum,
						winner: team1Pts > team2Pts ? 1 : 2,
						team1Points: team1Pts,
						team2Points: team2Pts,
						timestamp: Date.now()
					});
				}
			}

			// NOTA: NO añadimos el juego actual (aunque esté completo con hasWon=true) a completedGames.
			// El juego actual se guarda en currentMatchGames cuando el usuario pulsa "Siguiente Partida".
			// Si añadimos aquí, se contaría dos veces (una aquí, otra cuando pulse el botón).
			// El botón "Siguiente Partida" aparecerá porque:
			// - hasWon = true (detectado arriba)
			// - completedGames.length > 0 (si hay juegos previos) O es el primer juego y lo guardamos abajo

			// Si es el primer juego que termina y no hay juegos previos, necesitamos que
			// currentMatchGames tenga al menos 1 elemento para que showNextGameButton funcione.
			// Pero NO podemos añadirlo aquí porque entonces se duplicará cuando pulse "Siguiente Partida".
			// La solución es modificar la condición de showNextGameButton para no requerir currentMatchGames.length > 0
			// cuando hasWon es true en un match multijuego.

			if (completedGames.length > 0) {
				currentMatchGames.set(completedGames);
				console.log('🎮 Juegos completados restaurados en currentMatchGames:', completedGames.length);
			}

			console.log('📋 Rondas restauradas en currentGameRounds:', restoredRounds.length);
		}

		console.log('✅ Estado final de equipos:', {
			team1: { name: team1Name, points: initialPoints1, matches: initialMatches1 },
			team2: { name: team2Name, points: initialPoints2, matches: initialMatches2 },
			lastRoundPoints: { team1: initialPoints1, team2: initialPoints2 },
			currentGameRoundsRestored: context.existingRounds?.filter(r => r.gameNumber === (context.currentGameData?.currentGameNumber || 1)).length || 0
		});

		// Reset timer
		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);
	}

	/**
	 * Handle tournament match started from modal
	 */
	function handleTournamentMatchStarted(event: CustomEvent<TournamentMatchContext>) {
		const context = event.detail;
		applyTournamentConfig(context);

		// Show hammer dialog only if enabled AND match is starting fresh (no existing rounds)
		// Don't show when resuming a match that already has progress
		const hasExistingProgress =
			(context.existingRounds && context.existingRounds.length > 0) ||
			(context.currentGameData && (context.currentGameData.gamesWonA > 0 || context.currentGameData.gamesWonB > 0));

		if (context.gameConfig.showHammer && !hasExistingProgress) {
			setTimeout(() => {
				showHammerDialog = true;
			}, 100);
		}
	}

	/**
	 * Handle switching sides in tournament mode
	 * Also updates the tournament context to track which side the user is on
	 */
	function handleSwitchSides() {
		switchSides();
		// En modo torneo, también actualizar el lado del usuario en el contexto
		if ($gameTournamentContext) {
			const newSide = $gameTournamentContext.currentUserSide === 'A' ? 'B' : 'A';
			updateTournamentContext({ currentUserSide: newSide });
		}
	}

	/**
	 * Handle exit from tournament mode - show confirmation dialog
	 */
	function handleTournamentExit() {
		showTournamentExitConfirm = true;
	}

	/**
	 * Pause the tournament match (keep progress, can resume later)
	 */
	function pauseTournamentMatch() {
		// Don't call abandonTournamentMatch - the match stays IN_PROGRESS in Firebase
		// The rounds are already synced, so another user (or this user) can resume later

		// Clear local context only
		clearTournamentContext();
		showTournamentExitConfirm = false;

		// Reset local game state
		resetTeams();
		resetMatchState();

		console.log('⏸️ Tournament match paused - progress preserved in Firebase');
	}

	/**
	 * Confirm abandoning the tournament match (resets to PENDING, loses progress)
	 */
	async function confirmTournamentExit() {
		const context = $gameTournamentContext;
		if (context) {
			try {
				// Abandon the match in Firebase (set back to PENDING, clears progress)
				await abandonTournamentMatchSync(
					context.tournamentId,
					context.matchId,
					context.phase,
					context.groupId
				);
				console.log('🗑️ Tournament match abandoned - progress cleared');
			} catch (error) {
				console.error('Error abandoning match:', error);
			}
		}

		// Clear local context
		clearTournamentContext();
		showTournamentExitConfirm = false;

		// Reset game state
		resetTeams();
		resetMatchState();
	}

	/**
	 * Cancel tournament exit
	 */
	function cancelTournamentExit() {
		showTournamentExitConfirm = false;
	}

	/**
	 * Handle tournament match completion - send results to Firebase
	 */
	async function handleTournamentMatchComplete() {
		const context = $gameTournamentContext;
		if (!context || tournamentMatchCompletedSent) return;

		tournamentMatchCompletedSent = true;
		console.log('🏆 Tournament match complete, sending results...');

		// IMPORTANT: First, save the current game data to ensure we have all rounds
		// This must happen BEFORE currentMatch gets cleared by completeCurrentMatch
		const savedData = saveTournamentProgressToLocalStorage();

		const isUserSideA = context.currentUserSide === 'A';

		// Use games won from savedData (calculated with get() for accuracy)
		const finalGamesWonA = savedData?.gamesWonA ?? (isUserSideA ? team1GamesWon : team2GamesWon);
		const finalGamesWonB = savedData?.gamesWonB ?? (isUserSideA ? team2GamesWon : team1GamesWon);

		// Determine winner based on accurate game counts
		const winner = finalGamesWonA > finalGamesWonB
			? context.participantAId
			: context.participantBId;

		// Use the rounds from the saved context (which includes all games)
		// This is more reliable than reading from currentMatch which may be cleared
		const contextRounds = savedData?.allRounds || context.existingRounds || [];

		console.log('🔍 handleTournamentMatchComplete - using context rounds:', {
			savedDataRounds: savedData?.allRounds?.length || 0,
			contextExistingRounds: context.existingRounds?.length || 0,
			totalRounds: contextRounds.length
		});

		// Calculate totals from context rounds
		let totalPointsA = 0;
		let totalPointsB = 0;
		let total20sA = 0;
		let total20sB = 0;

		// Group rounds by game to calculate game-level points
		const gamePointsMap = new Map<number, { pointsA: number; pointsB: number }>();

		contextRounds.forEach((round: any) => {
			const gameNum = round.gameNumber || 1;
			if (!gamePointsMap.has(gameNum)) {
				gamePointsMap.set(gameNum, { pointsA: 0, pointsB: 0 });
			}
			const game = gamePointsMap.get(gameNum)!;
			game.pointsA += round.pointsA || 0;
			game.pointsB += round.pointsB || 0;
			total20sA += round.twentiesA || 0;
			total20sB += round.twentiesB || 0;
		});

		// Sum up game points
		gamePointsMap.forEach(game => {
			totalPointsA += game.pointsA;
			totalPointsB += game.pointsB;
		});

		// Use context rounds directly as allRounds (they already have correct structure)
		const allRounds = contextRounds.map((r: any) => ({
			gameNumber: r.gameNumber || 1,
			roundInGame: r.roundInGame || 1,
			pointsA: r.pointsA,
			pointsB: r.pointsB,
			twentiesA: r.twentiesA || 0,
			twentiesB: r.twentiesB || 0
		}));

		console.log('📤 Sending to Firebase:', {
			allRoundsCount: allRounds.length,
			roundsByGame: allRounds.reduce((acc, r) => {
				acc[r.gameNumber] = (acc[r.gameNumber] || 0) + 1;
				return acc;
			}, {} as Record<number, number>),
			gamesWonA: finalGamesWonA,
			gamesWonB: finalGamesWonB,
			totalPointsA,
			totalPointsB
		});

		try {
			const success = await completeTournamentMatchSync(
				context.tournamentId,
				context.matchId,
				context.phase,
				context.groupId,
				{
					winner,
					gamesWonA: finalGamesWonA,
					gamesWonB: finalGamesWonB,
					totalPointsA,
					totalPointsB,
					total20sA,
					total20sB,
					rounds: allRounds
				}
			);

			if (success) {
				console.log('✅ Tournament match results saved successfully');
			} else {
				console.error('❌ Failed to save tournament match results');
			}
		} catch (error) {
			console.error('Error completing tournament match:', error);
		}

		// IMPORTANTE: Limpiar el estado del partido DESPUÉS de enviar a Firebase
		// Esto evita que resetMatchState() borre los datos antes de capturarlos
		resetMatchState();
		resetTeams();

		// Clear tournament context after completion
		clearTournamentContext();
	}

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

	// Tournament reset functions
	function handleTournamentResetClick() {
		showTournamentResetConfirm = true;
	}

	function cancelTournamentReset() {
		showTournamentResetConfirm = false;
	}

	async function confirmTournamentReset() {
		const context = $gameTournamentContext;
		if (!context) {
			showTournamentResetConfirm = false;
			return;
		}

		isResettingTournament = true;

		try {
			// Reset local state first
			resetTeams();
			resetMatchState();

			// Restore team names from tournament context
			const isUserSideA = context.currentUserSide === 'A';
			const team1Name = isUserSideA ? context.participantAName : context.participantBName;
			const team2Name = isUserSideA ? context.participantBName : context.participantAName;

			team1.update(t => ({ ...t, name: team1Name, points: 0, rounds: 0, matches: 0, twenty: 0, hasWon: false }));
			team2.update(t => ({ ...t, name: team2Name, points: 0, rounds: 0, matches: 0, twenty: 0, hasWon: false }));
			saveTeams();

			// Reset lastRoundPoints
			lastRoundPoints.set({ team1: 0, team2: 0 });

			// Reset timer
			const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
			resetTimer(totalSeconds);

			// Sync empty state to Firebase when resetting
			// This ensures the bracket view shows the reset state
			await syncTournamentRounds([], 0, 0);
			console.log('📤 Reset: Synced empty rounds to Firebase');

			// Clear existing rounds from context
			updateTournamentContext({
				existingRounds: undefined,
				currentGameData: undefined
			});

			// Reset the match completion flag
			tournamentMatchCompletedSent = false;

		} catch (error) {
			console.error('Error resetting tournament match:', error);
		} finally {
			isResettingTournament = false;
			showTournamentResetConfirm = false;
		}
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

	async function finalizeRoundWithData() {
		if (!pendingRoundData) return;

		const { winningTeam, team1Points, team2Points } = pendingRoundData;

		// Call finalizeRound on one of the TeamCard components
		// It doesn't matter which one since the function updates both teams
		if (teamCard1) {
			teamCard1.finalizeRound(winningTeam, team1Points, team2Points);
		}

		// Clear pending data
		pendingRoundData = null;

		// En modo torneo, guardar a localStorage y sincronizar a Firebase (siempre real-time)
		if (inTournamentMode) {
			await tick();
			const savedData = saveTournamentProgressToLocalStorage();

			// Sincronizar a Firebase SOLO si el match no ha sido completado
			// Si tournamentMatchCompletedSent es true, completeMatch ya envió los datos finales
			// y no debemos sobrescribirlos con syncMatchProgress (evita race condition)
			if (savedData && !tournamentMatchCompletedSent) {
				syncTournamentRounds(savedData.allRounds, savedData.gamesWonA, savedData.gamesWonB);
			}
		}
	}

	/**
	 * Guarda el progreso del torneo a localStorage para persistencia al recargar
	 * Retorna los datos guardados para poder usarlos en el sync a Firebase
	 */
	function saveTournamentProgressToLocalStorage(): { allRounds: TournamentMatchContext['existingRounds']; gamesWonA: number; gamesWonB: number } | null {
		const context = $gameTournamentContext;
		if (!context) return null;

		const isUserSideA = context.currentUserSide === 'A';
		const allRounds: Array<{
			gameNumber: number;
			roundInGame: number;
			pointsA: number | null;
			pointsB: number | null;
			twentiesA: number;
			twentiesB: number;
		}> = [];

		// Use currentMatch which has games with rounds (currentMatchGames doesn't have rounds)
		const current = get(currentMatch);
		const currentRounds = get(currentGameRounds);

		console.log('🔍 SYNC - current.games:', current?.games?.length || 0, 'currentRounds:', currentRounds.length);
		if (current?.games?.length) {
			console.log('🔍 SYNC - partidas guardadas:', current.games.map((g, i) => `P${i+1}: ${g.rounds?.length || 0} rondas`));
		}

		// Process completed games from currentMatch (which has rounds per game)
		if (current?.games && Array.isArray(current.games)) {
			current.games.forEach((game, gameIndex) => {
				if (game?.rounds && Array.isArray(game.rounds)) {
					game.rounds.forEach((round, roundIndex) => {
						const pointsA = isUserSideA ? round.team1Points : round.team2Points;
						const pointsB = isUserSideA ? round.team2Points : round.team1Points;
						const twentiesA = isUserSideA ? (round.team1Twenty || 0) : (round.team2Twenty || 0);
						const twentiesB = isUserSideA ? (round.team2Twenty || 0) : (round.team1Twenty || 0);

						allRounds.push({
							gameNumber: gameIndex + 1,
							roundInGame: roundIndex + 1,
							pointsA,
							pointsB,
							twentiesA,
							twentiesB
						});
					});
				}
			});
		}

		// Add current game rounds (for the game in progress)
		// BUT only if the current game hasn't already been saved to current.games
		// (this happens when the game just completed but resetForNextGame hasn't been called yet)
		const completedGamesCount = current?.games?.length || 0;
		const lastCompletedGame = current?.games?.[completedGamesCount - 1];
		const currentGameAlreadySaved = lastCompletedGame?.rounds?.length === currentRounds?.length &&
			currentRounds?.length > 0 &&
			lastCompletedGame?.rounds?.every((r: any, i: number) =>
				r.team1Points === currentRounds[i]?.team1Points &&
				r.team2Points === currentRounds[i]?.team2Points
			);

		if (currentRounds && Array.isArray(currentRounds) && !currentGameAlreadySaved) {
			currentRounds.forEach((round, roundIndex) => {
				const pointsA = isUserSideA ? round.team1Points : round.team2Points;
				const pointsB = isUserSideA ? round.team2Points : round.team1Points;
				const twentiesA = isUserSideA ? (round.team1Twenty || 0) : (round.team2Twenty || 0);
				const twentiesB = isUserSideA ? (round.team2Twenty || 0) : (round.team1Twenty || 0);

				allRounds.push({
					gameNumber: completedGamesCount + 1,
					roundInGame: roundIndex + 1,
					pointsA,
					pointsB,
					twentiesA,
					twentiesB
				});
			});
		}

		// Calculate current game data - use get() to ensure we have the latest values
		// (reactive $: variables might not be updated inside setTimeout)
		const matchGames = get(currentMatchGames);
		const t1GamesWon = matchGames.filter(game => game.winner === 1).length;
		const t2GamesWon = matchGames.filter(game => game.winner === 2).length;
		const gamesWonA = isUserSideA ? t1GamesWon : t2GamesWon;
		const gamesWonB = isUserSideA ? t2GamesWon : t1GamesWon;

		console.log('💾 Guardando progreso torneo a localStorage:', {
			allRounds: allRounds.length,
			roundsDetail: allRounds.map(r => ({ gameNumber: r.gameNumber, roundInGame: r.roundInGame, pointsA: r.pointsA, pointsB: r.pointsB })),
			gamesWonA,
			gamesWonB,
			matchGames: matchGames.length,
			t1GamesWon,
			t2GamesWon
		});

		updateTournamentContext({
			existingRounds: allRounds,
			currentGameData: {
				gamesWonA,
				gamesWonB,
				currentGameNumber: completedGamesCount + 1
			}
		});

		return { allRounds, gamesWonA, gamesWonB };
	}

	/**
	 * Sync current rounds to Firebase for real-time updates
	 */
	async function syncTournamentRounds(
		allRounds: TournamentMatchContext['existingRounds'],
		gamesWonA: number,
		gamesWonB: number
	) {
		const context = $gameTournamentContext;
		if (!context || !allRounds) return;

		console.log('📤 Syncing rounds to Firebase:', { roundsCount: allRounds.length, gamesWonA, gamesWonB });

		try {
			const success = await syncMatchProgress(
				context.tournamentId,
				context.matchId,
				context.phase,
				context.groupId,
				{
					rounds: allRounds,
					gamesWonA,
					gamesWonB
				}
			);

			if (success) {
				console.log('✅ Tournament rounds synced in real-time');
			} else {
				console.warn('⚠️ Failed to sync tournament rounds');
			}
		} catch (error) {
			console.error('❌ Error syncing tournament rounds:', error);
		}
	}

	async function handleNextGame() {
		// En modo torneo, guardamos a localStorage ANTES del reset
		// Esto es importante porque resetForNextGame() limpia currentGameRounds
		if (inTournamentMode) {
			const preResetData = saveTournamentProgressToLocalStorage();
			if (preResetData) {
				console.log('📦 Pre-reset tournament data:', {
					rounds: preResetData.allRounds.length,
					gamesWonA: preResetData.gamesWonA,
					gamesWonB: preResetData.gamesWonB
				});

				// Siempre sincronizar a Firebase (modo real-time único)
				await syncTournamentRounds(preResetData.allRounds, preResetData.gamesWonA, preResetData.gamesWonB);
				console.log('📤 Synced completed game to Firebase');
			}
		}

		// Call resetForNextGame on one of the TeamCard components
		if (teamCard1) {
			teamCard1.resetForNextGame();
		}

		// Reset timer to default value for the new game
		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);

		// Actualizar el contexto local con el nuevo número de juego
		if (inTournamentMode) {
			const current = get(currentMatch);
			const completedGamesCount = current?.games?.length || 0;
			const matchGames = get(currentMatchGames);
			const isUserSideA = $gameTournamentContext?.currentUserSide === 'A';
			const t1GamesWon = matchGames.filter(game => game.winner === 1).length;
			const t2GamesWon = matchGames.filter(game => game.winner === 2).length;

			updateTournamentContext({
				currentGameData: {
					gamesWonA: isUserSideA ? t1GamesWon : t2GamesWon,
					gamesWonB: isUserSideA ? t2GamesWon : t1GamesWon,
					currentGameNumber: completedGamesCount + 1
				}
			});
		}
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
	<header class="game-header" class:tournament-mode={inTournamentMode}>
		<div class="left-section">
			{#if inTournamentMode}
				<div class="tournament-header-info">
					<span class="tournament-icon">🏆</span>
					<span class="tournament-name-header">{$gameTournamentContext?.tournamentName}</span>
				</div>
			{:else}
				<h1 on:click|stopPropagation={handleTitleClick} class="clickable-title">
					Scorekinole
					<span class="version-badge">v{$gameSettings.appVersion}</span>
				</h1>
			{/if}
		</div>

		<div class="center-section">
			{#if inTournamentMode}
				<!-- Tournament mode: show phase info -->
				<div class="tournament-phase-info">
					<span class="phase-badge-header">
						{$gameTournamentContext?.phase === 'GROUP'
							? ($t('groupStage') || 'Fase de Grupos')
							: ($gameTournamentContext?.bracketRoundName || 'Bracket')}
					</span>
				</div>
			{:else}
				<!-- Normal mode: editable event info -->
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
			{/if}
			{#if $gameSettings.showTimer}
				<Timer size="small" />
			{/if}
		</div>

		<div class="right-section">
			<!-- History button always visible -->
			<button class="icon-button history-button" on:click={() => showHistory = true} aria-label="History" title={$t('matchHistory')}>
				📜
			</button>
			{#if inTournamentMode}
				<!-- Tournament mode: switch sides and exit buttons -->
				<button class="icon-button switch-sides-button" on:click={handleSwitchSides} aria-label={$t('switchSides')} title={$t('switchSides')}>
					⇄
				</button>
				<button class="icon-button exit-tournament-button" on:click={handleTournamentExit} aria-label={$t('exitTournamentMode')} title={$t('exitTournamentMode')}>
					✕
				</button>
			{:else}
				<!-- Normal mode: settings button -->
				<button class="icon-button" on:click={() => showSettings = true} aria-label="Settings">
					⚙️
				</button>
			{/if}
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
			on:tournamentMatchComplete={handleTournamentMatchCompleteFromEvent}
		/>
		<TeamCard
			bind:this={teamCard2}
			teamNumber={2}
			isMatchComplete={isMatchComplete}
			currentGameNumber={$currentMatchGames.length}
			on:changeColor={() => openColorPicker(2)}
			on:roundComplete={handleRoundComplete}
			on:tournamentMatchComplete={handleTournamentMatchCompleteFromEvent}
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

	<!-- New Match Floating Button - hide in tournament mode -->
	{#if !inTournamentMode}
		<button class="floating-button new-match-button" on:click={handleNewMatchClick} aria-label={$t('newMatchButton')} title={$t('newMatchButton')}>
			▶️
		</button>

		<!-- Tournament Mode Button -->
		<button
			class="floating-button tournament-button"
			on:click={() => showTournamentModal = true}
			aria-label={$t('playTournamentMatch') || 'Jugar partido de torneo'}
			title={$t('playTournamentMatch') || 'Jugar partido de torneo'}
		>
			🏆
		</button>
	{:else}
		<!-- Tournament Reset Button - only in tournament mode -->
		<button
			class="floating-button reset-tournament-button"
			on:click={handleTournamentResetClick}
			aria-label={$t('resetMatch') || 'Reiniciar partido'}
			title={$t('resetMatch') || 'Reiniciar partido'}
			disabled={isResettingTournament}
		>
			🔄
		</button>
	{/if}

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

	<!-- Tournament Exit Confirmation Modal -->
	{#if showTournamentExitConfirm}
		{@const hasProgress = $roundsPlayed > 0 || $currentGameRounds.length > 0 || $currentMatchGames.length > 0}
		<div class="confirm-overlay" on:click={cancelTournamentExit}>
			<div class="confirm-modal tournament-exit-modal" on:click|stopPropagation>
				<h3>{$t('exitTournamentMessage') || '¿Qué quieres hacer con este partido?'}</h3>

				{#if hasProgress}
					<div class="exit-options">
						<div class="exit-option pause-option" on:click={pauseTournamentMatch}>
							<span class="option-icon">⏸️</span>
							<div class="option-text">
								<span class="option-title">{$t('pauseMatch') || 'Pausar partido'}</span>
								<span class="option-desc">{$t('pauseMatchDesc') || 'Guarda el progreso. Tú u otro jugador podréis continuar.'}</span>
							</div>
						</div>
						<div class="exit-option abandon-option" on:click={confirmTournamentExit}>
							<span class="option-icon">🗑️</span>
							<div class="option-text">
								<span class="option-title">{$t('abandonMatch') || 'Abandonar partido'}</span>
								<span class="option-desc">{$t('abandonMatchDesc') || 'Se perderá el progreso y otro podrá jugarlo desde cero.'}</span>
							</div>
						</div>
					</div>
				{:else}
					<p class="exit-warning">{$t('noProgressWarning') || 'El partido no tiene progreso. ¿Quieres salir?'}</p>
				{/if}

				<div class="confirm-buttons single-button">
					<Button variant="secondary" on:click={cancelTournamentExit}>
						{$t('cancel')}
					</Button>
					{#if !hasProgress}
						<Button variant="danger" on:click={confirmTournamentExit}>
							{$t('exit') || 'Salir'}
						</Button>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Tournament Reset Confirmation Modal -->
	{#if showTournamentResetConfirm}
		<div class="confirm-overlay" on:click={cancelTournamentReset}>
			<div class="confirm-modal tournament-reset-modal" on:click|stopPropagation>
				<h3>{$t('confirmResetMatch') || '¿Reiniciar partido?'}</h3>
				<p class="reset-warning">{$t('resetMatchDesc') || 'Se pondrán todos los puntos, rondas y 20s a 0'}</p>
				<div class="confirm-buttons">
					<Button variant="secondary" on:click={cancelTournamentReset} disabled={isResettingTournament}>
						{$t('cancel')}
					</Button>
					<Button variant="danger" on:click={confirmTournamentReset} disabled={isResettingTournament}>
						{isResettingTournament ? '...' : ($t('resetMatch') || 'Reiniciar')}
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>

<SettingsModal isOpen={showSettings} onClose={() => showSettings = false} />
<HistoryModal isOpen={showHistory} onClose={() => showHistory = false} />
<ColorPickerModal bind:isOpen={showColorPicker} teamNumber={colorPickerTeam} />
<HammerDialog isOpen={showHammerDialog} on:close={handleHammerSelected} />
<TwentyInputDialog
	isOpen={showTwentyDialog}
	on:close={handleTwentyInputClose}
/>

<!-- Tournament Match Modal -->
<TournamentMatchModal
	isOpen={showTournamentModal}
	on:close={() => showTournamentModal = false}
	on:matchStarted={handleTournamentMatchStarted}
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
		transition: all 0.3s ease;
	}

	/* Tournament mode header styling */
	.game-header.tournament-mode {
		background: linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 200, 100, 0.1));
		border: 2px solid rgba(0, 255, 136, 0.3);
	}

	/* Tournament header info (left section) */
	.tournament-header-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tournament-icon {
		font-size: 1.2rem;
	}

	.tournament-name-header {
		font-size: 0.9rem;
		font-weight: 700;
		color: #00ff88;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 150px;
	}

	/* Tournament phase badge (center section) */
	.tournament-phase-info {
		display: flex;
		align-items: center;
	}

	.phase-badge-header {
		font-size: 0.8rem;
		font-weight: 600;
		padding: 0.25rem 0.75rem;
		background: rgba(0, 255, 136, 0.2);
		color: #00ff88;
		border-radius: 12px;
		border: 1px solid rgba(0, 255, 136, 0.3);
	}

	/* Exit tournament button */
	.exit-tournament-button {
		background: rgba(255, 68, 68, 0.2) !important;
		border: 1px solid rgba(255, 68, 68, 0.4) !important;
		color: #ff6666 !important;
		font-size: 1.2rem !important;
		font-weight: bold;
	}

	.exit-tournament-button:hover {
		background: rgba(255, 68, 68, 0.3) !important;
	}

	/* Switch sides button */
	.switch-sides-button {
		background: rgba(100, 149, 237, 0.2) !important;
		border: 1px solid rgba(100, 149, 237, 0.4) !important;
		color: #6495ed !important;
		font-size: 1.2rem !important;
		font-weight: bold;
	}

	.switch-sides-button:hover {
		background: rgba(100, 149, 237, 0.3) !important;
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

	/* Tournament Button - positioned to the right of new match button */
	.tournament-button {
		left: auto;
		right: 2rem;
		background: linear-gradient(135deg, #00ff88, #00d4ff);
		box-shadow: 0 4px 12px rgba(0, 255, 136, 0.4);
	}

	.tournament-button:hover {
		box-shadow: 0 6px 16px rgba(0, 255, 136, 0.6);
	}

	/* Reset Tournament Button - positioned bottom left */
	.reset-tournament-button {
		left: 2rem;
		right: auto;
		background: linear-gradient(135deg, #ff6b6b, #ff8e53);
		box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
	}

	.reset-tournament-button:hover {
		box-shadow: 0 6px 16px rgba(255, 107, 107, 0.6);
	}

	.reset-tournament-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Tournament Reset Modal */
	.tournament-reset-modal .reset-warning {
		color: #ff6b6b;
		font-size: 0.9rem;
		margin-bottom: 1.5rem;
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

	/* Tournament exit modal */
	.tournament-exit-modal {
		border-color: rgba(255, 200, 68, 0.4);
		width: 450px;
	}

	.exit-warning {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.9rem;
		text-align: center;
		margin: 0 0 1.5rem 0;
	}

	.exit-options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.exit-option {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.exit-option .option-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.exit-option .option-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.exit-option .option-title {
		font-weight: 700;
		font-size: 0.95rem;
	}

	.exit-option .option-desc {
		font-size: 0.8rem;
		opacity: 0.7;
		line-height: 1.3;
	}

	.pause-option {
		background: rgba(0, 200, 255, 0.1);
		border: 2px solid rgba(0, 200, 255, 0.3);
	}

	.pause-option:hover {
		background: rgba(0, 200, 255, 0.2);
		border-color: rgba(0, 200, 255, 0.5);
	}

	.pause-option .option-title {
		color: #00d4ff;
	}

	.abandon-option {
		background: rgba(255, 68, 68, 0.1);
		border: 2px solid rgba(255, 68, 68, 0.3);
	}

	.abandon-option:hover {
		background: rgba(255, 68, 68, 0.2);
		border-color: rgba(255, 68, 68, 0.5);
	}

	.abandon-option .option-title {
		color: #ff6666;
	}

	.confirm-buttons.single-button {
		display: flex;
		justify-content: center;
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

		.tournament-button {
			left: auto;
			right: 1.5rem;
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

		/* Tournament header responsive */
		.tournament-name-header {
			max-width: 100px;
			font-size: 0.8rem;
		}

		.phase-badge-header {
			font-size: 0.7rem;
			padding: 0.2rem 0.5rem;
		}
	}

	@media (orientation: landscape) {
		.confirm-modal {
			width: 350px;
			max-width: 60%;
		}

		.tournament-exit-modal {
			width: 450px;
			max-width: 70%;
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

		.tournament-button {
			left: auto;
			right: 1rem;
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

		.tournament-exit-modal {
			width: 400px;
			max-width: 65%;
		}

		.exit-option {
			padding: 0.75rem;
		}

		.exit-option .option-icon {
			font-size: 1.2rem;
		}

		.exit-option .option-title {
			font-size: 0.85rem;
		}

		.exit-option .option-desc {
			font-size: 0.7rem;
		}
	}

	@media (max-width: 480px) {
		.exit-option {
			padding: 0.75rem;
		}

		.exit-option .option-icon {
			font-size: 1.2rem;
		}

		.exit-option .option-title {
			font-size: 0.85rem;
		}

		.exit-option .option-desc {
			font-size: 0.75rem;
		}
	}
</style>
