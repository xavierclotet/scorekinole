<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { language } from '$lib/stores/language';
	import * as m from '$lib/paraglide/messages.js';
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
	import { APP_VERSION } from '$lib/constants';
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
		abandonMatch as abandonTournamentMatchSync,
		subscribeToMatchStatus
	} from '$lib/firebase/tournamentSync';

	let showSettings = $state(false);
	let showHistory = $state(false);
	let showColorPicker = $state(false);
	let colorPickerTeam = $state<1 | 2>(1);
	let showHammerDialog = $state(false);
	let showNewMatchConfirm = $state(false);
	let showTournamentModal = $state(false);
	let showTournamentExitConfirm = $state(false);
	let showTournamentResetConfirm = $state(false);
	let isResettingTournament = $state(false);
	let showMatchCompletedExternally = $state(false);
	let externalMatchWinner = $state<string | null>(null);

	// Unsubscribe function for match status listener
	let unsubscribeMatchStatus: (() => void) | null = null;

	// Tournament mode state
	let inTournamentMode = $derived(!!$gameTournamentContext);

	// Effective settings: use tournament config when in tournament mode, otherwise gameSettings
	let effectiveShowHammer = $derived(inTournamentMode
		? $gameTournamentContext?.gameConfig.showHammer ?? $gameSettings.showHammer
		: $gameSettings.showHammer);
	let effectiveShow20s = $derived(inTournamentMode
		? $gameTournamentContext?.gameConfig.show20s ?? $gameSettings.show20s
		: $gameSettings.show20s);

	// Tournament match format string (e.g., "4R", "7p", "7p Bo3")
	let tournamentMatchFormat = $derived((() => {
		if (!$gameTournamentContext) return '';
		const config = $gameTournamentContext.gameConfig;
		if (config.gameMode === 'rounds') {
			return `${config.roundsToPlay || 4}R`;
		} else {
			const points = config.pointsToWin || 7;
			const matches = config.matchesToWin || 1;
			if (matches > 1) {
				return `${points}p Bo${matches}`;
			}
			return `${points}p`;
		}
	})());

	// Friendly match format string (e.g., "4R", "7p", "7p ×2")
	let friendlyMatchFormat = $derived((() => {
		if (inTournamentMode) return '';
		if ($gameSettings.gameMode === 'rounds') {
			return `${$gameSettings.roundsToPlay || 4}R`;
		} else {
			const points = $gameSettings.pointsToWin || 7;
			const matches = $gameSettings.matchesToWin || 1;
			if (matches > 1) {
				return `${points}p ×${matches}`;
			}
			return `${points}p`;
		}
	})());

	// Track if tournament match completion has been sent
	let tournamentMatchCompletedSent = $state(false);

	// References to TeamCard components to call their methods
	let teamCard1: any;
	let teamCard2: any;

	// Round completion data stored temporarily while 20s dialog is shown
	let pendingRoundData = $state<{ winningTeam: 0 | 1 | 2; team1Points: number; team2Points: number } | null>(null);

	// Event info editing state
	let editingEventTitle = $state(false);
	let editingMatchPhase = $state(false);
	let eventTitleInput = $state<HTMLInputElement | null>(null);
	let matchPhaseInput = $state<HTMLInputElement | null>(null);

	// Match score indicator - swipe to cycle size
	let swipeStartX = $state(0);
	let swipeStartY = $state(0);
	const SWIPE_THRESHOLD = 30; // px minimum to trigger swipe

	function handleMatchScoreSwipeStart(e: TouchEvent | MouseEvent) {
		if ('touches' in e) {
			swipeStartX = e.touches[0].clientX;
			swipeStartY = e.touches[0].clientY;
		} else {
			swipeStartX = e.clientX;
			swipeStartY = e.clientY;
		}
	}

	function handleMatchScoreSwipeEnd(e: TouchEvent | MouseEvent) {
		let endX: number;
		let endY: number;

		if ('changedTouches' in e) {
			endX = e.changedTouches[0].clientX;
			endY = e.changedTouches[0].clientY;
		} else {
			endX = e.clientX;
			endY = e.clientY;
		}

		const deltaX = endX - swipeStartX;
		const deltaY = Math.abs(endY - swipeStartY);

		// Only trigger if horizontal movement > threshold and more horizontal than vertical
		if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > deltaY) {
			if (deltaX > 0) {
				// Swipe right - increase size
				cycleMatchScoreSize(1);
			} else {
				// Swipe left - decrease size
				cycleMatchScoreSize(-1);
			}
		}
	}

	function cycleMatchScoreSize(direction: 1 | -1) {
		const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
		const currentIndex = sizes.indexOf($gameSettings.matchScoreSize || 'medium');
		const nextIndex = (currentIndex + direction + sizes.length) % sizes.length;
		gameSettings.update(s => ({ ...s, matchScoreSize: sizes[nextIndex] }));
		gameSettings.save();
	}

	// Bind showTwentyDialog to the store
	let showTwentyDialog = $derived($twentyDialogPending);

	// Calculate wins for each team based on rounds played in current game
	let team1Wins = $derived($currentGameRounds.filter(round => round.team1Points > round.team2Points).length);
	let team2Wins = $derived($currentGameRounds.filter(round => round.team2Points > round.team1Points).length);

	// Calculate games won in the match (for multi-game matches)
	// Note: currentMatchGames is updated immediately when a game ends (in saveGameAndCheckMatchComplete)
	// so team1GamesWon/team2GamesWon already include the just-finished game
	let team1GamesWon = $derived($currentMatchGames.filter(game => game.winner === 1).length);
	let team2GamesWon = $derived($currentMatchGames.filter(game => game.winner === 2).length);

	// Check if match is complete
	// In rounds mode, match is complete after first game (includes ties)
	// In points mode, match is complete when someone reaches the required wins
	// matchesToWin semantics differ:
	// - Tournaments use "Best of X" format (e.g., 3 = best of 3 = need 2 wins)
	// - Friendly matches use direct count (e.g., 2 = first to 2 wins)
	let requiredWinsToComplete = $derived(inTournamentMode
		? Math.ceil($gameSettings.matchesToWin / 2)
		: $gameSettings.matchesToWin);
	let isMatchComplete = $derived($gameSettings.gameMode === 'rounds'
		? (team1GamesWon >= 1 || team2GamesWon >= 1 || ($currentMatchGames.length > 0 && !$team1.hasWon && !$team2.hasWon))
		: (team1GamesWon >= requiredWinsToComplete || team2GamesWon >= requiredWinsToComplete));

	// Bracket tiebreaker state - when in bracket mode and tied, we play extra rounds
	let isInExtraRounds = $state(false);
	let isBracketMatch = $derived($gameTournamentContext?.phase === 'FINAL');

	// Whether a winner is required (no ties allowed):
	// - Tournament bracket matches: always require winner
	// - Friendly matches: check allowTiesInRoundsMode setting
	let requireWinner = $derived(isBracketMatch || (!$gameTournamentContext && !$gameSettings.allowTiesInRoundsMode));

	// Handle extra round event from TeamCard (bracket tiebreaker)
	function handleExtraRound({ roundNumber }: { roundNumber: number }) {
		console.log('🎯 Extra round triggered:', roundNumber);
		isInExtraRounds = true;
	}

	// Check if match ended in a tie (rounds mode only)
	// A tie occurs when the game completed but neither team won (both hasWon = false and game saved)
	// When requireWinner is true, we don't show tie - instead extra rounds are played
	let isTieMatch = $derived($gameSettings.gameMode === 'rounds' &&
		$currentMatchGames.length > 0 &&
		!$team1.hasWon &&
		!$team2.hasWon &&
		!requireWinner); // Don't show tie overlay when winner is required

	// Show "Next Game" button when someone won the current game AND match is not complete AND it's a multi-game match
	// Note: We removed the "$currentMatchGames.length > 0" requirement because:
	// 1. When the first game ends, saveGameAndCheckMatchComplete adds it to currentMatchGames
	// 2. But on page reload, we don't restore the current completed game to currentMatchGames (to avoid double-counting)
	// 3. The other conditions are sufficient: hasWon + !isMatchComplete + matchesToWin > 1 + points mode
	let showNextGameButton = $derived(($team1.hasWon || $team2.hasWon) && !isMatchComplete && $gameSettings.matchesToWin > 1 && $gameSettings.gameMode === 'points');

	// Handler for tournament match complete event from TeamCard
	// This is called BEFORE currentMatch is cleared, ensuring we have all data
	function handleTournamentMatchCompleteFromEvent() {
		if (!tournamentMatchCompletedSent) {
			handleTournamentMatchComplete();
		}
	}

	// Calculate points for current round in progress (subtract last round's ending points from current total)
	let team1CurrentRoundPoints = $derived($team1.points - $lastRoundPoints.team1);
	let team2CurrentRoundPoints = $derived($team2.points - $lastRoundPoints.team2);

	onMount(() => {
		gameSettings.load();
		loadTeams();
		loadMatchState();
		loadHistory();

		// Load tournament context if any
		const savedContext = loadTournamentContext();
		if (savedContext) {
			applyTournamentConfig(savedContext);
			// Subscribe to match status changes (detect if admin completes match externally)
			setupMatchStatusSubscription(savedContext);
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
	 * Setup subscription to listen for match status changes
	 * Detects if admin completes the match externally (e.g., force finish due to time)
	 */
	function setupMatchStatusSubscription(context: TournamentMatchContext) {
		// Cleanup previous subscription if any
		if (unsubscribeMatchStatus) {
			unsubscribeMatchStatus();
		}

		unsubscribeMatchStatus = subscribeToMatchStatus(
			context.tournamentId,
			context.matchId,
			context.phase,
			context.groupId,
			(status, winner, matchParticipants) => {
				console.log('📡 Match status update from Firebase:', { status, winner, matchParticipants });

				// If match was completed externally (by admin) and we haven't sent our completion
				if ((status === 'COMPLETED' || status === 'WALKOVER') && !tournamentMatchCompletedSent) {
					console.log('⚠️ Match completed externally by admin!');

					// Find winner name
					if (winner) {
						const ctx = get(gameTournamentContext);
						const t1 = get(team1);
						const t2 = get(team2);
						console.log('🔍 Looking for winner name:', {
							winner,
							ctxParticipantAId: ctx?.participantAId,
							ctxParticipantBId: ctx?.participantBId,
							matchParticipantA: matchParticipants?.participantA,
							matchParticipantB: matchParticipants?.participantB,
							team1Name: t1.name,
							team2Name: t2.name
						});

						// Match winner ID with context participant IDs
						if (ctx) {
							if (winner === ctx.participantAId) {
								externalMatchWinner = ctx.participantAName;
							} else if (winner === ctx.participantBId) {
								externalMatchWinner = ctx.participantBName;
							}
							// Fallback: Check Firebase match participant IDs (in case context IDs are stale)
							else if (matchParticipants) {
								if (winner === matchParticipants.participantA) {
									externalMatchWinner = ctx.participantAName || winner;
								} else if (winner === matchParticipants.participantB) {
									externalMatchWinner = ctx.participantBName || winner;
								} else {
									// Bug: winner doesn't match any known ID
									externalMatchWinner = ctx.participantAName || ctx.participantBName || winner;
									console.log('⚠️ BUG: Winner ID does not match context IDs nor Firebase match IDs');
								}
							} else {
								externalMatchWinner = ctx.participantAName || ctx.participantBName || winner;
								console.log('⚠️ No matchParticipants available');
							}
						} else {
							externalMatchWinner = t1.name || t2.name || winner;
						}
					}

					// Show modal and prevent further scoring
					showMatchCompletedExternally = true;
					tournamentMatchCompletedSent = true;

					// Cleanup subscription
					if (unsubscribeMatchStatus) {
						unsubscribeMatchStatus();
						unsubscribeMatchStatus = null;
					}
				}
			}
		);
	}

	/**
	 * Handle acknowledgment of externally completed match
	 */
	function handleExternalCompletionAck() {
		showMatchCompletedExternally = false;
		clearTournamentContext();
		isInExtraRounds = false;
		// Reset to normal game mode
		resetTeams();
		resetMatchState();
	}

	/**
	 * Apply tournament configuration to game settings and teams
	 */
	function applyTournamentConfig(context: TournamentMatchContext) {
		const config = context.gameConfig;
		const isUserSideA = context.currentUserSide === 'A';

		// Reset completion flag when starting/resuming a tournament match
		tournamentMatchCompletedSent = false;
		isInExtraRounds = false;
		console.log('🔄 tournamentMatchCompletedSent reset to false, isInExtraRounds reset to false');

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
	function handleTournamentMatchStarted(context: TournamentMatchContext) {
		applyTournamentConfig(context);

		// Subscribe to match status changes (detect if admin completes match externally)
		setupMatchStatusSubscription(context);

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
		isInExtraRounds = false;

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
		isInExtraRounds = false;
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

		// Determine winner based on accurate game counts (null for ties)
		const winner = finalGamesWonA > finalGamesWonB
			? context.participantAId
			: finalGamesWonB > finalGamesWonA
				? context.participantBId
				: null;

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

		// NO reseteamos el estado aquí - dejamos que el usuario vea el resultado final
		// El reset se hará cuando se inicie un nuevo partido de torneo
		// Solo limpiamos el contexto del torneo para que no se vuelva a enviar
		clearTournamentContext();
		isInExtraRounds = false;
	}

	onDestroy(() => {
		cleanupTimer();
		// Cleanup match status subscription
		if (unsubscribeMatchStatus) {
			unsubscribeMatchStatus();
			unsubscribeMatchStatus = null;
		}
	});

	function handleResetRound() {
		team1.update(t => ({ ...t, points: 0, hasWon: false }));
		team2.update(t => ({ ...t, points: 0, hasWon: false }));
		saveTeams();
		isInExtraRounds = false;

		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);
	}

	function handleResetMatch() {
		resetTeams();
		resetMatchState();
		isInExtraRounds = false;

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
			isInExtraRounds = false;

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
		// Only show hammer dialog if showHammer setting is enabled (respecting tournament config)
		if (effectiveShowHammer) {
			// First set to false to force a re-render
			showHammerDialog = false;

			// Then use setTimeout to set to true
			setTimeout(() => {
				showHammerDialog = true;
			}, 50);
		}
	}

	function handleRoundComplete({ winningTeam, team1Points, team2Points }: { winningTeam: 0 | 1 | 2; team1Points: number; team2Points: number }) {

		// Store the round data temporarily
		pendingRoundData = { winningTeam, team1Points, team2Points };

		// Determine if show20s is enabled - tournament config takes priority
		const tournamentContext = get(gameTournamentContext);
		const shouldShow20s = tournamentContext
			? tournamentContext.gameConfig.show20s
			: $gameSettings.show20s;

		console.log('🎯 handleRoundComplete:', {
			inTournamentMode: !!tournamentContext,
			tournamentShow20s: tournamentContext?.gameConfig.show20s,
			gameSettingsShow20s: $gameSettings.show20s,
			shouldShow20s
		});

		// If show20s is enabled, show dialog first
		if (shouldShow20s) {
			console.log('✅ Showing 20s dialog');
			setTwentyDialogPending(true);
		} else {
			console.log('⏭️ Skipping 20s dialog, finalizing round immediately');
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

			console.log('🔄 Post-round sync check:', {
				hasSavedData: !!savedData,
				tournamentMatchCompletedSent,
				allRoundsLength: savedData?.allRounds?.length
			});

			// Sincronizar a Firebase SOLO si el match no ha sido completado
			// Si tournamentMatchCompletedSent es true, completeMatch ya envió los datos finales
			// y no debemos sobrescribirlos con syncMatchProgress (evita race condition)
			if (savedData && !tournamentMatchCompletedSent) {
				await syncTournamentRounds(savedData.allRounds, savedData.gamesWonA, savedData.gamesWonB);
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
		const currentGameNumber = context.currentGameData?.currentGameNumber || 1;

		console.log('🔍 SYNC - current.games:', current?.games?.length || 0, 'currentRounds:', currentRounds.length, 'contextExistingRounds:', context.existingRounds?.length || 0);
		if (current?.games?.length) {
			console.log('🔍 SYNC - partidas guardadas:', current.games.map((g, i) => `P${i+1}: ${g.rounds?.length || 0} rondas`));
		}

		// IMPORTANT: Get ONLY rounds from PREVIOUS games (not current game) from context.existingRounds
		// This is needed for resumed matches where previous games are stored in Firebase
		// We NEVER use existingRounds for the current game - always use currentRounds as the source of truth
		const existingPreviousRounds = context.existingRounds?.filter(r => r.gameNumber < currentGameNumber) || [];
		const hasExistingPreviousRounds = existingPreviousRounds.length > 0;
		const hasCurrentGamesWithRounds = current?.games?.some(g => g?.rounds?.length > 0);

		// If we have previous rounds from context but not in current.games, use context as source
		if (hasExistingPreviousRounds && !hasCurrentGamesWithRounds) {
			console.log('📋 Using context.existingRounds for previous games (resumed match)');
			existingPreviousRounds.forEach(round => {
				allRounds.push({
					gameNumber: round.gameNumber,
					roundInGame: round.roundInGame,
					pointsA: round.pointsA,
					pointsB: round.pointsB,
					twentiesA: round.twentiesA,
					twentiesB: round.twentiesB
				});
			});
		} else {
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
		}

		// Add current game rounds from currentRounds store
		// BUT only if the current game is NOT already saved in current.games
		// When a game completes, it's saved to current.games WITH its rounds,
		// but currentRounds store isn't cleared immediately, causing duplication
		const currentGameAlreadyInGames = current?.games?.some((game, idx) => {
			// Check if game at index (currentGameNumber - 1) has rounds
			return idx === currentGameNumber - 1 && game?.rounds?.length > 0;
		}) || false;

		if (currentRounds && Array.isArray(currentRounds) && currentRounds.length > 0 && !currentGameAlreadyInGames) {
			currentRounds.forEach((round, roundIndex) => {
				const pointsA = isUserSideA ? round.team1Points : round.team2Points;
				const pointsB = isUserSideA ? round.team2Points : round.team1Points;
				const twentiesA = isUserSideA ? (round.team1Twenty || 0) : (round.team2Twenty || 0);
				const twentiesB = isUserSideA ? (round.team2Twenty || 0) : (round.team1Twenty || 0);

				allRounds.push({
					gameNumber: currentGameNumber,
					roundInGame: roundIndex + 1,
					pointsA,
					pointsB,
					twentiesA,
					twentiesB
				});
			});
		}

		// Calculate games won directly from allRounds (more reliable than currentMatchGames)
		// This ensures correct sync even after resume when stores might not be fully restored
		const gamePointsMap = new Map<number, { pointsA: number; pointsB: number }>();
		allRounds.forEach(round => {
			const gameNum = round.gameNumber;
			if (!gamePointsMap.has(gameNum)) {
				gamePointsMap.set(gameNum, { pointsA: 0, pointsB: 0 });
			}
			const game = gamePointsMap.get(gameNum)!;
			game.pointsA += round.pointsA || 0;
			game.pointsB += round.pointsB || 0;
		});

		// Determine winner for each completed game
		const pointsToWin = context.gameConfig?.pointsToWin || $gameSettings.pointsToWin || 7;
		const gameMode = context.gameConfig?.gameMode || $gameSettings.gameMode;
		const roundsToPlay = context.gameConfig?.roundsToPlay || $gameSettings.roundsToPlay || 4;
		let gamesWonA = 0;
		let gamesWonB = 0;

		console.log('🎮 Calculating gamesWon:', { gameMode, roundsToPlay, pointsToWin, allRoundsCount: allRounds.length, gamePointsMapSize: gamePointsMap.size });

		gamePointsMap.forEach(({ pointsA, pointsB }, gameNumber) => {
			const gameRounds = allRounds.filter(r => r.gameNumber === gameNumber);
			console.log(`🎮 Game ${gameNumber}: rounds=${gameRounds.length}, pointsA=${pointsA}, pointsB=${pointsB}`);
			let gameComplete = false;
			let winnerA = false;

			// Check if this is a bracket match (requires tiebreaker on tie)
			const isBracketMatch = context?.phase === 'FINAL';

			if (gameMode === 'rounds') {
				// In rounds mode, game is complete when:
				// - All rounds are played AND there's a winner (pointsA != pointsB)
				// - OR in bracket mode with tie: game is NOT complete until someone wins
				const hasEnoughRounds = gameRounds.length >= roundsToPlay;
				const hasClearWinner = pointsA !== pointsB;

				if (isBracketMatch) {
					// Bracket: game is only complete when there's a clear winner
					// (tie requires extra rounds)
					gameComplete = hasEnoughRounds && hasClearWinner;
				} else {
					// Regular match: game is complete when rounds are done (tie is valid end state)
					gameComplete = hasEnoughRounds;
				}

				if (gameComplete && hasClearWinner) {
					winnerA = pointsA > pointsB;
				}
			} else {
				// In points mode, game is complete when someone reaches pointsToWin with 2+ lead
				if (pointsA >= pointsToWin && (pointsA - pointsB >= 2)) {
					gameComplete = true;
					winnerA = true;
				} else if (pointsB >= pointsToWin && (pointsB - pointsA >= 2)) {
					gameComplete = true;
					winnerA = false;
				}
			}

			if (gameComplete) {
				if (winnerA) {
					gamesWonA++;
				} else {
					gamesWonB++;
				}
			}
		});

		// Fallback: also check currentMatchGames in case games were recorded there
		// but not yet reflected in allRounds (edge case)
		const matchGames = get(currentMatchGames);
		const t1GamesWon = matchGames.filter(game => game.winner === 1).length;
		const t2GamesWon = matchGames.filter(game => game.winner === 2).length;
		const storeGamesWonA = isUserSideA ? t1GamesWon : t2GamesWon;
		const storeGamesWonB = isUserSideA ? t2GamesWon : t1GamesWon;

		// Use the higher value (in case one source has more complete data)
		if (storeGamesWonA > gamesWonA || storeGamesWonB > gamesWonB) {
			gamesWonA = Math.max(gamesWonA, storeGamesWonA);
			gamesWonB = Math.max(gamesWonB, storeGamesWonB);
		}

		console.log('💾 Guardando progreso torneo a localStorage:', {
			allRounds: allRounds.length,
			roundsDetail: allRounds.map(r => ({ gameNumber: r.gameNumber, roundInGame: r.roundInGame, pointsA: r.pointsA, pointsB: r.pointsB })),
			gamesWonA,
			gamesWonB,
			storeGamesWonA,
			storeGamesWonB,
			gameMode,
			pointsToWin,
			gamePointsPerGame: Array.from(gamePointsMap.entries()).map(([gn, pts]) => ({ game: gn, ...pts }))
		});

		// Calculate the actual current game number based on completed games
		const actualCurrentGameNumber = gamesWonA + gamesWonB + 1;

		updateTournamentContext({
			existingRounds: allRounds,
			currentGameData: {
				gamesWonA,
				gamesWonB,
				currentGameNumber: actualCurrentGameNumber
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
		{#if inTournamentMode}
			<!-- Tournament mode header - same style as normal mode -->
			<div class="header-left">
				<span class="header-title tournament-title">
					<svg class="tournament-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
					{$gameTournamentContext?.tournamentName}
				</span>
			</div>

			<div class="header-center">
				<span class="header-phase">
					{#if $gameTournamentContext?.phase === 'GROUP'}
						{m.tournament_groupStage() || 'Fase de Grupos'}
					{:else}
						{$gameTournamentContext?.bracketRoundName || 'Bracket'}
						{#if $gameTournamentContext?.bracketType === 'gold'}
							<span class="bracket-type gold">{m.scoring_gold()}</span>
						{:else if $gameTournamentContext?.bracketType === 'silver'}
							<span class="bracket-type silver">{m.scoring_silver()}</span>
						{/if}
					{/if}
				</span>
				{#if tournamentMatchFormat}
					<span class="header-format">{tournamentMatchFormat}</span>
				{/if}
				{#if $gameSettings.showTimer}
					<Timer size="small" />
				{/if}
			</div>

			<div class="header-right">
				<button class="header-btn" onclick={handleSwitchSides} aria-label={m.scoring_switchSides()} title={m.scoring_switchSides()}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/></svg>
				</button>
				<button class="header-btn header-btn-danger" onclick={handleTournamentExit} aria-label={m.tournament_exitMode()} title={m.tournament_exitMode()}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
		{:else}
			<!-- Normal mode header - clean minimal design -->
			<div class="header-left">
				<button class="header-logo" onclick={handleTitleClick}>
					Scorekinole
					<span class="header-logo-suffix">
						<span class="header-logo-arena">Arena</span>
						<span class="header-logo-version">v{APP_VERSION}</span>
					</span>
				</button>
			</div>

			<div class="header-center">
				{#if editingEventTitle}
					<input
						bind:this={eventTitleInput}
						bind:value={$gameSettings.eventTitle}
						onblur={saveEventTitle}
						onkeydown={handleEventTitleKeydown}
						class="header-input"
						placeholder={m.scoring_eventTitle()}
					/>
				{:else if $gameSettings.eventTitle && $gameSettings.eventTitle !== 'Scorekinole'}
					<button class="header-title" onclick={startEditingEventTitle}>
						{$gameSettings.eventTitle}
					</button>
				{/if}

				{#if $gameSettings.matchPhase || editingMatchPhase}
					{#if $gameSettings.eventTitle && $gameSettings.eventTitle !== 'Scorekinole'}
						<span class="header-separator">·</span>
					{/if}
					{#if editingMatchPhase}
						<input
							bind:this={matchPhaseInput}
							bind:value={$gameSettings.matchPhase}
							onblur={saveMatchPhase}
							onkeydown={handleMatchPhaseKeydown}
							class="header-input header-input-small"
							placeholder={m.scoring_matchPhase()}
						/>
					{:else}
						<button class="header-phase" onclick={startEditingMatchPhase}>
							{$gameSettings.matchPhase}
						</button>
					{/if}
				{/if}

				{#if friendlyMatchFormat}
					<span class="header-format">{friendlyMatchFormat}</span>
				{/if}

				{#if $gameSettings.showTimer}
					<Timer size="small" />
				{/if}
			</div>

			<div class="header-right">
				<button class="header-btn" onclick={() => showHistory = true} aria-label="History" title={m.history_matchHistory()}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
				</button>
				<button class="header-btn" onclick={() => showSettings = true} aria-label="Settings" title={m.common_settings()}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
				</button>
			</div>
		{/if}
	</header>




	<div class="teams-container">
		<TeamCard
			bind:this={teamCard1}
			teamNumber={1}
			isMatchComplete={isMatchComplete}
			currentGameNumber={$currentMatchGames.length}
			onchangeColor={() => openColorPicker(1)}
			onroundComplete={handleRoundComplete}
			ontournamentMatchComplete={handleTournamentMatchCompleteFromEvent}
			onextraRound={handleExtraRound}
		/>

		<!-- Tie Overlay - shown between the two cards when match ends in tie -->
		{#if isTieMatch}
			<div class="tie-overlay">
				<div class="tie-badge">
					{m.scoring_tie() || 'EMPATE'}
				</div>
			</div>
		{/if}

		<!-- Extra Round Indicator - shown in bracket mode when playing tiebreaker -->
		{#if isInExtraRounds && !$team1.hasWon && !$team2.hasWon}
			<div class="extra-round-indicator">
				<div class="extra-round-badge">
					{m.scoring_extraRound() || 'RONDA EXTRA'}
				</div>
			</div>
		{/if}

		<TeamCard
			bind:this={teamCard2}
			teamNumber={2}
			isMatchComplete={isMatchComplete}
			currentGameNumber={$currentMatchGames.length}
			onchangeColor={() => openColorPicker(2)}
			onroundComplete={handleRoundComplete}
			ontournamentMatchComplete={handleTournamentMatchCompleteFromEvent}
			onextraRound={handleExtraRound}
		/>
	</div>

	<!-- Floating Match Score Indicators - swipe horizontally to resize -->
	{#if $gameSettings.gameMode === 'points' && $gameSettings.matchesToWin > 1}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="match-score-left match-score-{$gameSettings.matchScoreSize || 'medium'}"
			onmousedown={handleMatchScoreSwipeStart}
			onmouseup={handleMatchScoreSwipeEnd}
			ontouchstart={handleMatchScoreSwipeStart}
			ontouchend={handleMatchScoreSwipeEnd}
			role="status"
			aria-label="Match score - swipe to resize"
		>{team1GamesWon}</div>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="match-score-right match-score-{$gameSettings.matchScoreSize || 'medium'}"
			onmousedown={handleMatchScoreSwipeStart}
			onmouseup={handleMatchScoreSwipeEnd}
			ontouchstart={handleMatchScoreSwipeStart}
			ontouchend={handleMatchScoreSwipeEnd}
			role="status"
			aria-label="Match score - swipe to resize"
		>{team2GamesWon}</div>
	{/if}

	<!-- Next Game Button -->
	{#if showNextGameButton}
		<div class="next-game-container">
			<button class="next-game-button" onclick={handleNextGame}>
				{m.scoring_nextGame()}
			</button>
		</div>
	{/if}

	<!-- New Match Floating Button - hide in tournament mode -->
	{#if !inTournamentMode}
		<button class="floating-button new-match-button" onclick={handleNewMatchClick} aria-label={m.scoring_newMatchButton()} title={m.scoring_newMatchButton()}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
		</button>

		<!-- Tournament Mode Button -->
		<button
			class="floating-button tournament-button"
			onclick={() => showTournamentModal = true}
			aria-label={m.tournament_playMatch() || 'Jugar partido de torneo'}
			title={m.tournament_playMatch() || 'Jugar partido de torneo'}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
		</button>
	{:else}
		<!-- Tournament Reset Button - only in tournament mode -->
		<button
			class="floating-button reset-tournament-button"
			onclick={handleTournamentResetClick}
			aria-label={m.scoring_resetMatch() || 'Reiniciar partido'}
			title={m.scoring_resetMatch() || 'Reiniciar partido'}
			disabled={isResettingTournament}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
		</button>
	{/if}

	<!-- New Match Confirmation Modal -->
	{#if showNewMatchConfirm}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="newmatch-overlay" onclick={cancelNewMatch}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="newmatch-dialog" onclick={(e) => e.stopPropagation()}>
				<div class="newmatch-icon">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
				</div>
				<p class="newmatch-title">{m.scoring_confirmNewMatch()}</p>
				<div class="newmatch-buttons">
					<button class="newmatch-btn cancel" onclick={cancelNewMatch}>
						{m.common_cancel()}
					</button>
					<button class="newmatch-btn confirm" onclick={confirmNewMatch}>
						{m.common_confirm()}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Tournament Exit Confirmation Modal -->
	{#if showTournamentExitConfirm}
		{@const hasProgress = $roundsPlayed > 0 || $currentGameRounds.length > 0 || $currentMatchGames.length > 0}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="exit-overlay" onclick={cancelTournamentExit}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="exit-dialog" onclick={(e) => e.stopPropagation()}>
				<p class="exit-title">{m.tournament_exitMessage() || '¿Qué quieres hacer con este partido?'}</p>

				{#if hasProgress}
					<div class="exit-actions">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="exit-action pause" onclick={pauseTournamentMatch}>
							<div class="action-icon">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
							</div>
							<div class="action-content">
								<span class="action-label">{m.tournament_pauseMatch() || 'Pausar partido'}</span>
								<span class="action-hint">{m.tournament_pauseMatchDesc() || 'Guarda el progreso. Tú u otro jugador podréis continuar.'}</span>
							</div>
						</div>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="exit-action abandon" onclick={confirmTournamentExit}>
							<div class="action-icon">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
							</div>
							<div class="action-content">
								<span class="action-label">{m.tournament_abandonMatch() || 'Abandonar partido'}</span>
								<span class="action-hint">{m.tournament_abandonMatchDesc() || 'Se perderá el progreso y otro podrá jugarlo desde cero.'}</span>
							</div>
						</div>
					</div>
				{:else}
					<p class="exit-info">{m.scoring_noProgressWarning() || 'El partido no tiene progreso. ¿Quieres salir?'}</p>
				{/if}

				<div class="exit-footer">
					<button class="exit-btn cancel" onclick={cancelTournamentExit}>
						{m.common_cancel()}
					</button>
					{#if !hasProgress}
						<button class="exit-btn confirm" onclick={confirmTournamentExit}>
							{m.scoring_exit() || 'Salir'}
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Tournament Reset Confirmation Modal -->
	{#if showTournamentResetConfirm}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="reset-overlay" onclick={cancelTournamentReset}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="reset-dialog" onclick={(e) => e.stopPropagation()}>
				<div class="reset-icon">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
				</div>
				<p class="reset-title">{m.scoring_confirmResetMatch() || '¿Reiniciar partido?'}</p>
				<p class="reset-desc">{m.scoring_resetMatchDesc() || 'Se pondrán todos los puntos, rondas y 20s a 0'}</p>
				<div class="reset-buttons">
					<button class="reset-btn cancel" onclick={cancelTournamentReset} disabled={isResettingTournament}>
						{m.common_cancel()}
					</button>
					<button class="reset-btn confirm" onclick={confirmTournamentReset} disabled={isResettingTournament}>
						{isResettingTournament ? '...' : (m.scoring_resetMatch() || 'Reiniciar')}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Match Completed Externally Modal (admin force-finished) -->
	{#if showMatchCompletedExternally}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="external-complete-overlay">
			<div class="external-complete-dialog">
				<div class="external-complete-icon">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/>
						<polyline points="12 6 12 12 16 14"/>
					</svg>
				</div>
				<h3 class="external-complete-title">{m.tournament_matchCompletedByAdmin()}</h3>
				<p class="external-complete-desc">{m.tournament_matchCompletedByAdminDesc()}</p>
				{#if externalMatchWinner}
					<div class="external-complete-winner">
						<span class="winner-label">{m.tournament_winnerLabel({ name: '' })}</span>
						<span class="winner-name">{externalMatchWinner}</span>
					</div>
				{/if}
				<button class="external-complete-btn" onclick={handleExternalCompletionAck}>
					{m.common_understood()}
				</button>
			</div>
		</div>
	{/if}
</div>

<SettingsModal isOpen={showSettings} onClose={() => showSettings = false} />
<HistoryModal isOpen={showHistory} onClose={() => showHistory = false} />
<ColorPickerModal bind:isOpen={showColorPicker} teamNumber={colorPickerTeam} />
<HammerDialog isOpen={showHammerDialog} onclose={handleHammerSelected} />
<TwentyInputDialog
	isOpen={showTwentyDialog}
	onclose={handleTwentyInputClose}
/>

<!-- Tournament Match Modal -->
<TournamentMatchModal
	isOpen={showTournamentModal}
	onclose={() => showTournamentModal = false}
	onmatchstarted={handleTournamentMatchStarted}
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
		padding-top: max(0.5rem, env(safe-area-inset-top, 0.5rem));
		background: linear-gradient(135deg, #0f1419 0%, #1a1f35 100%);
		color: #fff;
		overflow: hidden;
	}

	.game-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-shrink: 0;
		padding: 0.4rem 0.6rem;
		margin-bottom: 0.5rem;
		min-height: 40px;
	}

	/* Tournament mode header styling */
	.game-header.tournament-mode {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 10px;
	}

	/* Tournament title with icon */
	.tournament-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: default;
	}

	.tournament-title:hover {
		background: none;
	}

	.tournament-icon {
		color: rgba(255, 255, 255, 0.5);
		flex-shrink: 0;
	}

	/* Normal mode header - minimal clean design */
	.header-left,
	.header-right {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: 0.25rem;
	}

	.header-center {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.15rem;
		flex: 1;
		min-width: 0;
	}

	.header-logo {
		font-family: 'Lexend', sans-serif;
		font-size: 1.15rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.85);
		background: none;
		border: none;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
		letter-spacing: 0.01em;
		position: relative;
		display: flex;
		align-items: baseline;
	}

	.header-logo-suffix {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		margin-left: 0.2rem;
		position: relative;
		top: -0.15rem;
	}

	.header-logo-arena {
		font-style: italic;
		font-weight: 700;
		font-size: 0.65rem;
		color: #e85a5a;
		transform: rotate(-8deg);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		line-height: 1;
	}

	.header-logo-version {
		font-style: italic;
		font-weight: 500;
		font-size: 0.5rem;
		color: rgba(255, 255, 255, 0.55);
		transform: rotate(-8deg);
		letter-spacing: 0.05em;
		line-height: 1;
		margin-top: 0.12rem;
		margin-left: 0.1rem;
	}

	.header-logo:hover {
		color: rgba(255, 255, 255, 1);
		background: rgba(255, 255, 255, 0.06);
	}

	.header-logo:hover .header-logo-arena {
		color: #ff6b6b;
	}

	.header-logo:hover .header-logo-version {
		color: rgba(255, 255, 255, 0.5);
	}

	.header-logo:active {
		transform: scale(0.97);
	}

	.header-title {
		font-family: 'Lexend', sans-serif;
		font-size: 1.3rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
		background: none;
		border: none;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.15s;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 280px;
		letter-spacing: 0.02em;
	}

	.header-title:hover {
		background: rgba(255, 255, 255, 0.08);
		color: white;
	}

	.header-title-placeholder {
		color: rgba(255, 255, 255, 0.35);
	}

	.header-separator {
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.9rem;
		font-weight: 300;
	}

	.header-phase {
		font-family: 'Lexend', sans-serif;
		font-size: 1.3rem;
		font-weight: 600;
		color: white;
		background: transparent;
		border: none;
		padding: 0;
		cursor: default;
		white-space: nowrap;
		text-transform: capitalize;
		letter-spacing: -0.01em;
	}

	.header-format {
		font-family: 'Lexend', sans-serif;
		font-size: 1.2rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.6);
		background: transparent;
		padding: 0;
		white-space: nowrap;
		margin-left: 0.5rem;
	}

	.header-format::before {
		content: '·';
		margin-right: 0.5rem;
		opacity: 0.4;
	}

	.bracket-type {
		font-size: 0.85em;
		font-weight: 500;
		margin-left: 0.35rem;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
	}

	.bracket-type.gold {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
	}

	.bracket-type.silver {
		color: #94a3b8;
		background: rgba(148, 163, 184, 0.15);
	}

	.header-input {
		font-family: 'Lexend', sans-serif;
		font-size: 1.1rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		outline: none;
		text-align: center;
		min-width: 100px;
		max-width: 250px;
	}

	.header-input:focus {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.4);
	}

	.header-input-small {
		font-size: 0.9rem;
		font-weight: 500;
		min-width: 70px;
		max-width: 120px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Header buttons - minimal */
	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: none;
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: all 0.15s;
	}

	.header-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.85);
	}

	.header-btn:active {
		transform: scale(0.95);
	}

	.header-btn-danger {
		color: rgba(255, 100, 100, 0.7);
	}

	.header-btn-danger:hover {
		background: rgba(255, 80, 80, 0.12);
		color: rgba(255, 100, 100, 0.95);
	}

	.teams-container {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		overflow: hidden;
		align-items: stretch;
		position: relative;
	}

	/* Tie Overlay - positioned between names and score */
	.tie-overlay {
		position: absolute;
		top: 28%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 100;
		pointer-events: none;
	}

	.tie-badge {
		background: linear-gradient(135deg, rgba(107, 114, 128, 0.95) 0%, rgba(75, 85, 99, 0.95) 100%);
		backdrop-filter: blur(12px);
		border: 2px solid rgba(255, 255, 255, 0.3);
		color: white;
		padding: 0.6rem 1.25rem;
		border-radius: 10px;
		font-family: 'Lexend', sans-serif;
		font-weight: 700;
		font-size: 1rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
		animation: tie-pulse 2s ease-in-out infinite;
	}

	@keyframes tie-pulse {
		0%, 100% {
			transform: scale(1);
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
		}
		50% {
			transform: scale(1.02);
			box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		}
	}

	/* Responsive adjustments for tie overlay */
	@media (max-width: 768px) and (orientation: portrait) {
		.tie-overlay {
			top: 22%;
		}

		.tie-badge {
			padding: 0.5rem 1rem;
			font-size: 0.9rem;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.tie-overlay {
			top: 25%;
		}

		.tie-badge {
			padding: 0.4rem 0.8rem;
			font-size: 0.8rem;
			border-radius: 8px;
		}
	}

	/* Extra Round Indicator - for bracket tiebreaker */
	.extra-round-indicator {
		position: absolute;
		top: 28%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 100;
		pointer-events: none;
	}

	.extra-round-badge {
		background: linear-gradient(135deg, rgba(245, 158, 11, 0.95) 0%, rgba(217, 119, 6, 0.95) 100%);
		backdrop-filter: blur(12px);
		border: 2px solid rgba(255, 255, 255, 0.4);
		color: white;
		padding: 0.6rem 1.25rem;
		border-radius: 10px;
		font-family: 'Lexend', sans-serif;
		font-weight: 700;
		font-size: 1rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		box-shadow: 0 8px 32px rgba(245, 158, 11, 0.4);
		animation: extra-round-pulse 1.5s ease-in-out infinite;
	}

	@keyframes extra-round-pulse {
		0%, 100% {
			transform: scale(1);
			box-shadow: 0 8px 32px rgba(245, 158, 11, 0.4);
		}
		50% {
			transform: scale(1.05);
			box-shadow: 0 12px 40px rgba(245, 158, 11, 0.6);
		}
	}

	@media (max-width: 768px) and (orientation: portrait) {
		.extra-round-indicator {
			top: 22%;
		}

		.extra-round-badge {
			padding: 0.5rem 1rem;
			font-size: 0.9rem;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.extra-round-indicator {
			top: 25%;
		}

		.extra-round-badge {
			padding: 0.4rem 0.8rem;
			font-size: 0.8rem;
			border-radius: 8px;
		}
	}

	/* Match Score Indicators - positioned on each side, swipe to resize */
	.match-score-left,
	.match-score-right {
		position: fixed;
		bottom: 8px;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-family: 'Lexend', sans-serif;
		line-height: 1;
		color: rgba(255, 255, 255, 0.9);
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
		cursor: ew-resize;
		transition: all 0.2s ease;
		-webkit-tap-highlight-color: transparent;
		touch-action: none;
		user-select: none;
	}

	.match-score-left {
		left: 50%;
		transform: translateX(calc(-50% - 20px));
	}

	.match-score-right {
		left: 50%;
		transform: translateX(calc(-50% + 20px));
	}

	/* Match Score Sizes */
	.match-score-small {
		width: 32px;
		height: 28px;
		font-size: 1.1rem;
		border-radius: 6px;
	}

	.match-score-small.match-score-left {
		transform: translateX(calc(-50% - 20px));
	}

	.match-score-small.match-score-right {
		transform: translateX(calc(-50% + 20px));
	}

	.match-score-medium {
		width: 44px;
		height: 38px;
		font-size: 1.5rem;
		border-radius: 10px;
	}

	.match-score-medium.match-score-left {
		transform: translateX(calc(-50% - 26px));
	}

	.match-score-medium.match-score-right {
		transform: translateX(calc(-50% + 26px));
	}

	.match-score-large {
		width: 56px;
		height: 48px;
		font-size: 1.9rem;
		border-radius: 12px;
	}

	.match-score-large.match-score-left {
		transform: translateX(calc(-50% - 32px));
	}

	.match-score-large.match-score-right {
		transform: translateX(calc(-50% + 32px));
	}

	.next-game-container {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 100;
		animation: nextGameFadeIn 0.4s ease-out;
	}

	.next-game-button {
		font-family: 'Lexend', sans-serif;
		font-size: 1.1rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		padding: 1rem 2.5rem;
		background: #fff;
		color: #1a1f35;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 20px rgba(255, 255, 255, 0.2);
	}

	.next-game-button:hover {
		transform: scale(1.03);
		box-shadow: 0 6px 28px rgba(255, 255, 255, 0.3);
	}

	.next-game-button:active {
		transform: scale(0.98);
	}

	@keyframes nextGameFadeIn {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
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

	/* Portrait: el env(safe-area-inset-top) maneja notches automáticamente */
	@media (orientation: portrait) {
		.game-page {
			padding-top: max(0.5rem, env(safe-area-inset-top, 0.5rem));
		}

		/* Simplify header in portrait */
		.header-title {
			max-width: 220px;
		}

		.header-phase {
			font-size: 0.95rem;
		}

		.header-format {
			font-size: 0.85rem;
		}

		.header-separator {
			display: none;
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

		/* In portrait/single column, match score stays at bottom */
		.match-score-left,
		.match-score-right {
			bottom: 8px;
		}

		/* Slightly smaller gaps on mobile */
		.match-score-small.match-score-left { transform: translateX(calc(-50% - 12px)); }
		.match-score-small.match-score-right { transform: translateX(calc(-50% + 12px)); }
		.match-score-medium.match-score-left { transform: translateX(calc(-50% - 18px)); }
		.match-score-medium.match-score-right { transform: translateX(calc(-50% + 18px)); }
		.match-score-large.match-score-left { transform: translateX(calc(-50% - 24px)); }
		.match-score-large.match-score-right { transform: translateX(calc(-50% + 24px)); }
	}

	@media (max-width: 480px) {
		.game-page {
			padding: 0.3rem;
			padding-top: max(0.3rem, env(safe-area-inset-top, 0.3rem));
		}

		.game-header {
			padding: 0.25rem 0.4rem;
		}

		.header-title {
			font-size: 0.75rem;
			max-width: 180px;
		}

		.header-phase {
			font-size: 0.85rem;
		}

		.header-format {
			font-size: 0.75rem;
		}

		.header-btn {
			width: 28px;
			height: 28px;
		}

		.teams-container {
			gap: 0.5rem;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.game-page {
			padding-top: max(0.25rem, env(safe-area-inset-top, 0.25rem));
		}

		.game-header {
			padding: 0.2rem 0.4rem;
			margin-bottom: 0.3rem;
			min-height: 32px;
		}

		.header-title {
			font-size: 0.75rem;
		}

		.header-phase {
			font-size: 0.85rem;
		}

		.header-format {
			font-size: 0.75rem;
		}

		.header-btn {
			width: 26px;
			height: 26px;
		}

		.teams-container {
			gap: 0.5rem;
		}
	}


	/* Floating Button - Base */
	.floating-button {
		position: fixed;
		bottom: 1.5rem;
		left: 1.5rem;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		color: rgba(255, 255, 255, 0.85);
		font-size: 1.25rem;
		cursor: pointer;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
		transition: all 0.2s ease;
	}

	.floating-button:hover {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-2px);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
	}

	.floating-button:active {
		transform: translateY(0);
	}

	/* Tournament Button */
	.tournament-button {
		left: auto;
		right: 1.5rem;
	}

	/* Reset Tournament Button */
	.reset-tournament-button {
		left: 1.5rem;
		right: auto;
		color: rgba(255, 120, 120, 0.9);
		border-color: rgba(255, 120, 120, 0.25);
	}

	.reset-tournament-button:hover {
		background: rgba(255, 100, 100, 0.15);
		border-color: rgba(255, 100, 100, 0.4);
	}

	.reset-tournament-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		transform: none;
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

	.confirm-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	/* New match dialog */
	.newmatch-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.newmatch-dialog {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.75rem;
		width: min(340px, 85vw);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.newmatch-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(100, 180, 120, 0.12);
		border-radius: 50%;
		color: #7cc98e;
	}

	.newmatch-title {
		margin: 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.85);
		text-align: center;
	}

	.newmatch-buttons {
		display: flex;
		gap: 0.75rem;
		width: 100%;
		margin-top: 0.5rem;
	}

	.newmatch-btn {
		flex: 1;
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		font-weight: 500;
		padding: 0.7rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.newmatch-btn.cancel {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.7);
	}

	.newmatch-btn.cancel:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.newmatch-btn.confirm {
		background: rgba(100, 180, 120, 0.15);
		border: 1px solid rgba(100, 180, 120, 0.3);
		color: #8cd89c;
	}

	.newmatch-btn.confirm:hover {
		background: rgba(100, 180, 120, 0.25);
		border-color: rgba(100, 180, 120, 0.45);
	}

	.newmatch-btn:active {
		transform: scale(0.98);
	}

	/* Tournament reset dialog */
	.reset-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.reset-dialog {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.75rem;
		width: min(360px, 85vw);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.reset-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(220, 160, 80, 0.12);
		border-radius: 50%;
		color: #d4a856;
	}

	.reset-title {
		margin: 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.85);
		text-align: center;
	}

	.reset-desc {
		margin: 0;
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
		line-height: 1.4;
	}

	.reset-buttons {
		display: flex;
		gap: 0.75rem;
		width: 100%;
		margin-top: 0.75rem;
	}

	.reset-btn {
		flex: 1;
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		font-weight: 500;
		padding: 0.7rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.reset-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.reset-btn.cancel {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.7);
	}

	.reset-btn.cancel:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.reset-btn.confirm {
		background: rgba(220, 160, 80, 0.15);
		border: 1px solid rgba(220, 160, 80, 0.3);
		color: #e4b866;
	}

	.reset-btn.confirm:hover:not(:disabled) {
		background: rgba(220, 160, 80, 0.25);
		border-color: rgba(220, 160, 80, 0.45);
	}

	.reset-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	/* Tournament exit dialog */
	.exit-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.exit-dialog {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.5rem;
		width: min(420px, 90vw);
	}

	.exit-title {
		margin: 0 0 1.25rem 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
	}

	.exit-info {
		margin: 0 0 1.25rem 0;
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
	}

	.exit-actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.exit-action {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.exit-action .action-icon {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
	}

	.exit-action .action-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.exit-action .action-label {
		font-family: 'Lexend', sans-serif;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.exit-action .action-hint {
		font-family: 'Lexend', sans-serif;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
		line-height: 1.35;
	}

	.exit-action.pause {
		background: rgba(80, 180, 220, 0.08);
		border: 1px solid rgba(80, 180, 220, 0.2);
	}

	.exit-action.pause:hover {
		background: rgba(80, 180, 220, 0.15);
		border-color: rgba(80, 180, 220, 0.35);
	}

	.exit-action.pause:active {
		transform: scale(0.99);
	}

	.exit-action.pause .action-icon {
		background: rgba(80, 180, 220, 0.15);
		color: #70c4e0;
	}

	.exit-action.pause .action-label {
		color: #8cd0ec;
	}

	.exit-action.abandon {
		background: rgba(220, 90, 90, 0.08);
		border: 1px solid rgba(220, 90, 90, 0.2);
	}

	.exit-action.abandon:hover {
		background: rgba(220, 90, 90, 0.15);
		border-color: rgba(220, 90, 90, 0.35);
	}

	.exit-action.abandon:active {
		transform: scale(0.99);
	}

	.exit-action.abandon .action-icon {
		background: rgba(220, 90, 90, 0.15);
		color: #e07070;
	}

	.exit-action.abandon .action-label {
		color: #ec8c8c;
	}

	.exit-footer {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
	}

	.exit-btn {
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		font-weight: 500;
		padding: 0.65rem 1.25rem;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.exit-btn.cancel {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.7);
	}

	.exit-btn.cancel:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.exit-btn.confirm {
		background: rgba(220, 90, 90, 0.15);
		border: 1px solid rgba(220, 90, 90, 0.3);
		color: #ec8c8c;
	}

	.exit-btn.confirm:hover {
		background: rgba(220, 90, 90, 0.25);
		border-color: rgba(220, 90, 90, 0.45);
	}

	.exit-btn:active {
		transform: scale(0.98);
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

		.confirm-modal {
			width: 90%;
			padding: 1.5rem;
		}
	}

	@media (orientation: landscape) {
		.confirm-modal {
			width: 350px;
			max-width: 60%;
		}

		.exit-dialog {
			width: min(450px, 70vw);
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

		.confirm-modal {
			width: 300px;
			max-width: 50%;
			padding: 1rem;
		}

		.exit-dialog {
			padding: 1.25rem;
			width: min(400px, 65vw);
		}

		.exit-title {
			font-size: 0.9rem;
			margin-bottom: 1rem;
		}

		.exit-action {
			padding: 0.75rem;
			gap: 0.75rem;
		}

		.exit-action .action-icon {
			width: 30px;
			height: 30px;
		}

		.exit-action .action-icon svg {
			width: 16px;
			height: 16px;
		}

		.exit-action .action-label {
			font-size: 0.85rem;
		}

		.exit-action .action-hint {
			font-size: 0.7rem;
		}

		.newmatch-dialog {
			padding: 1.25rem;
			width: min(300px, 55vw);
		}

		.newmatch-icon {
			width: 40px;
			height: 40px;
		}

		.newmatch-icon svg {
			width: 20px;
			height: 20px;
		}

		.newmatch-title {
			font-size: 0.9rem;
		}

		.newmatch-btn {
			font-size: 0.85rem;
			padding: 0.6rem 0.85rem;
		}

		.reset-dialog {
			padding: 1.25rem;
			width: min(320px, 55vw);
		}

		.reset-icon {
			width: 40px;
			height: 40px;
		}

		.reset-icon svg {
			width: 20px;
			height: 20px;
		}

		.reset-title {
			font-size: 0.9rem;
		}

		.reset-desc {
			font-size: 0.8rem;
		}

		.reset-btn {
			font-size: 0.85rem;
			padding: 0.6rem 0.85rem;
		}
	}

	@media (max-width: 480px) {
		.exit-dialog {
			padding: 1.25rem;
		}

		.exit-title {
			font-size: 0.9rem;
		}

		.exit-action {
			padding: 0.85rem;
			gap: 0.75rem;
		}

		.exit-action .action-icon {
			width: 32px;
			height: 32px;
		}

		.exit-action .action-icon svg {
			width: 18px;
			height: 18px;
		}

		.exit-action .action-label {
			font-size: 0.9rem;
		}

		.exit-action .action-hint {
			font-size: 0.75rem;
		}
	}

	/* Match completed externally modal (admin force-finished) */
	.external-complete-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 3000;
		animation: overlayFadeIn 0.2s ease-out;
	}

	.external-complete-dialog {
		background: linear-gradient(145deg, #1a1d24 0%, #141620 100%);
		border: 1px solid rgba(245, 158, 11, 0.3);
		border-radius: 16px;
		padding: 2rem;
		width: min(380px, 90vw);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		text-align: center;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5),
					0 0 60px rgba(245, 158, 11, 0.1);
	}

	.external-complete-icon {
		width: 72px;
		height: 72px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(245, 158, 11, 0.15);
		border-radius: 50%;
		color: #f59e0b;
	}

	.external-complete-title {
		margin: 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1.25rem;
		font-weight: 600;
		color: #f59e0b;
	}

	.external-complete-desc {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.7);
		line-height: 1.5;
	}

	.external-complete-winner {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		background: rgba(16, 185, 129, 0.15);
		border: 1px solid rgba(16, 185, 129, 0.3);
		border-radius: 10px;
		padding: 0.75rem 1.5rem;
		margin-top: 0.5rem;
	}

	.external-complete-winner .winner-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.external-complete-winner .winner-name {
		font-size: 1.1rem;
		font-weight: 600;
		color: #10b981;
	}

	.external-complete-btn {
		width: 100%;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		padding: 0.875rem 1.5rem;
		border: none;
		border-radius: 8px;
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
		color: white;
		cursor: pointer;
		transition: all 0.15s ease;
		margin-top: 0.5rem;
	}

	.external-complete-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
	}
</style>
