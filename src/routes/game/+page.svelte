<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { get } from 'svelte/store';
	import * as m from '$lib/paraglide/messages.js';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { team1, team2, loadTeams, saveTeams, resetTeams, switchSides, updateTeam } from '$lib/stores/teams';
	import { timeRemaining, resetTimer, cleanupTimer, startTimer, stopTimer } from '$lib/stores/timer';
	import { loadMatchState, resetMatchState, saveMatchState, roundsPlayed, twentyDialogPending, setTwentyDialogPending, currentGameRounds, currentMatchRounds, currentMatchGames, lastRoundPoints, matchState } from '$lib/stores/matchState';
	import { startCurrentMatch, currentMatch, updateCurrentMatchRound } from '$lib/stores/history';
	import TeamCard from '$lib/components/TeamCard.svelte';
	import Timer from '$lib/components/Timer.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import RoundsPanel from '$lib/components/RoundsPanel.svelte';
	import ColorPickerModal from '$lib/components/ColorPickerModal.svelte';
	import HammerDialog from '$lib/components/HammerDialog.svelte';
	import TwentyInputDialog from '$lib/components/TwentyInputDialog.svelte';
	import TournamentMatchModal from '$lib/components/TournamentMatchModal.svelte';
	import WinnerSplash from '$lib/components/WinnerSplash.svelte';
	import OfflineIndicator from '$lib/components/OfflineIndicator.svelte';
	import AppMenu from '$lib/components/AppMenu.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Settings, User, Users, Trophy, Play } from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { theme } from '$lib/stores/theme';
	import { onReconnect, setSyncStatus } from '$lib/utils/networkStatus';
	import {
		gameTournamentContext,
		loadTournamentContext,
		clearTournamentContext,
		updateTournamentContext,
		setTournamentContext,
		type TournamentMatchContext
	} from '$lib/stores/tournamentContext';
	import {
		syncMatchProgress,
		completeMatch as completeTournamentMatchSync,
		abandonMatch as abandonTournamentMatchSync,
		subscribeToMatchStatus
	} from '$lib/firebase/tournamentSync';
	import { getTournamentByKey } from '$lib/firebase/tournaments';
	import {
		getUserActiveMatches,
		startTournamentMatch,
		resumeTournamentMatch,
		type PendingMatchInfo
	} from '$lib/firebase/tournamentMatches';
	import { currentUser } from '$lib/firebase/auth';
	import { getPlayerName } from '$lib/firebase/userProfile';
	import { LoaderCircle } from '@lucide/svelte';
	import InvitePlayerModal from '$lib/components/InvitePlayerModal.svelte';
	import QRScanner from '$lib/components/QRScanner.svelte';
	import { QrCode } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { assignUserToTeam, unassignUserFromTeam, unassignPartnerFromTeam } from '$lib/stores/teams';
	import {
		activeInvite,
		isInviteModalOpen,
		clearActiveInvite,
		openInviteModal,
		closeInviteModal,
	} from '$lib/stores/matchInvite';
	import {
		cancelInvite	} from '$lib/firebase/matchInvites';

	let showSettings = $state(false);
	let showColorPicker = $state(false);
	let colorPickerTeam = $state<1 | 2>(1);
	let showHammerDialog = $state(false);
	let showNewMatchConfirm = $state(false);
	let showTournamentModal = $state(false);
	let isCheckingTournament = $state(false);
	let showTournamentExitConfirm = $state(false);

	let showMatchCompletedExternally = $state(false);
	let externalMatchWinner = $state<string | null>(null);

	// Invite modal state
	let currentInviteType = $state<'opponent' | 'my_partner' | 'opponent_partner'>('opponent');
	let currentInviteHostTeam = $state<1 | 2>(1);

	// QR Scanner state
	let showQRScanner = $state(false);

	// Winner splash state
	let showWinnerSplash = $state(false);
	let splashWinnerName = $state('');
	let splashLabel = $state('');
	let splashScore = $state('');

	// Unsubscribe function for match status listener
	let unsubscribeMatchStatus: (() => void) | null = null;

	// Tournament mode state
	let inTournamentMode = $derived(!!$gameTournamentContext);

	// Whether to show the assign/invite button for each team
	// Show button in all cases when logged in (different actions based on state)
	let canAssignUserToTeam1 = $derived(!inTournamentMode && !!$currentUser);
	let canAssignUserToTeam2 = $derived(!inTournamentMode && !!$currentUser);

	// Whether to show partner assignment button (only in doubles mode, not tournament mode)
	let canAssignPartnerToTeam1 = $derived(!inTournamentMode && !!$currentUser && $gameSettings.gameType === 'doubles');
	let canAssignPartnerToTeam2 = $derived(!inTournamentMode && !!$currentUser && $gameSettings.gameType === 'doubles');

	// Friendly match header info
	let friendlyMatchTitle = $derived(
		$gameSettings.gameType === 'doubles'
			? m.scoring_friendlyDoubles()
			: m.scoring_friendlySingles()
	);
	let friendlyMatchMode = $derived(
		$gameSettings.gameMode === 'rounds'
			? m.scoring_friendlyModeRounds({ n: $gameSettings.roundsToPlay ?? 4 })
			: (($gameSettings.matchesToWin ?? 1) > 1
				? m.scoring_friendlyModePointsFtw({ points: $gameSettings.pointsToWin ?? 7, matches: $gameSettings.matchesToWin ?? 1 })
				: m.scoring_friendlyModePoints({ n: $gameSettings.pointsToWin ?? 7 }))
	);

	// Effective settings: use tournament config when in tournament mode, otherwise gameSettings
	let effectiveShowHammer = $derived(inTournamentMode
		? $gameTournamentContext?.gameConfig.showHammer ?? $gameSettings.showHammer
		: $gameSettings.showHammer);
	let effectiveShow20s = $derived(inTournamentMode
		? $gameTournamentContext?.gameConfig.show20s ?? $gameSettings.show20s
		: $gameSettings.show20s);
	let effectiveShowRoundsPanel = $derived(
		inTournamentMode ||
		effectiveShow20s ||
		$gameSettings.gameMode === 'rounds' ||
		($gameSettings.matchesToWin ?? 1) > 1 ||
		!!$gameSettings.lastTournamentResult
	);

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
				return `${points}p ${m.bracket_bestOf()}${matches}`;
			}
			return `${points}p`;
		}
	})());

	// Track if tournament match completion has been sent
	let tournamentMatchCompletedSent = $state(false);

	// Track if we just exited tournament mode (to prevent auto-restoration)
	// This flag prevents restoring friendly match data until user explicitly clicks "New Match"
	let justExitedTournamentMode = $state(false);

	// localStorage key for pre-tournament team data backup
	const PRE_TOURNAMENT_BACKUP_KEY = 'crokinolePreTournamentBackup';

	// Reference to TeamCard component to call its methods (only need one since it updates both teams)
	let teamCard1: any;

	// Round completion data stored temporarily while 20s dialog is shown
	let pendingRoundData = $state<{ winningTeam: 0 | 1 | 2; team1Points: number; team2Points: number } | null>(null);

	// 20s editing state (for RoundsPanel)
	let isEditing20s = $state(false);
	let editing20sRoundIndex = $state(-1);
	let editing20sTeam1Value = $state(0);
	let editing20sTeam2Value = $state(0);

	// Bind showTwentyDialog to the store
	let showTwentyDialog = $derived($twentyDialogPending);

	// Calculate games won in the match (for multi-game matches)
	// Note: currentMatchGames is updated immediately when a game ends (in saveGameAndCheckMatchComplete)
	// so team1GamesWon/team2GamesWon already include the just-finished game
	let team1GamesWon = $derived($currentMatchGames.filter(game => game.winner === 1).length);
	let team2GamesWon = $derived($currentMatchGames.filter(game => game.winner === 2).length);

	// Check if match is complete
	// In rounds mode, match is complete after first game (includes ties)
	// In points mode, match is complete when someone reaches the required wins
	// matchesToWin = "First to X wins" for both tournaments and friendly matches
	let requiredWinsToComplete = $derived($gameSettings.matchesToWin ?? 1);
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
	let showNextGameButton = $derived(($team1.hasWon || $team2.hasWon) && !isMatchComplete && ($gameSettings.matchesToWin ?? 1) > 1 && $gameSettings.gameMode === 'points');

	// Auto-stop timer when match completes
	$effect(() => {
		if (isMatchComplete) {
			stopTimer();
		}
	});

	// Winner/Tie splash state
	let splashIsTie = $state(false);

	// Detect win or tie moment (false → true transition)
	// Uses plain vars so writes don't retrigger the effect
	let _prevT1Won: boolean | undefined = undefined;
	let _prevT2Won: boolean | undefined = undefined;
	let _prevIsTie: boolean | undefined = undefined;
	$effect(() => {
		const t1 = $team1.hasWon;
		const t2 = $team2.hasWon;
		const tie = isTieMatch;
		const gameNum = $currentMatchGames.length;
		const matchDone = isMatchComplete;

		if (_prevT1Won === undefined) {
			// First run — record initial state, don't trigger splash
			_prevT1Won = t1;
			_prevT2Won = t2;
			_prevIsTie = tie;
			return;
		}

		if (!showWinnerSplash) {
			if (t1 && !_prevT1Won) {
				splashWinnerName = $team1.name;
				splashScore = `${$team1.points} · ${$team2.points}`;
				splashLabel = matchDone ? m.scoring_winner() : m.scoring_gameWin({ n: gameNum.toString() });
				splashIsTie = false;
				showWinnerSplash = true;
			} else if (t2 && !_prevT2Won) {
				splashWinnerName = $team2.name;
				splashScore = `${$team2.points} · ${$team1.points}`;
				splashLabel = matchDone ? m.scoring_winner() : m.scoring_gameWin({ n: gameNum.toString() });
				splashIsTie = false;
				showWinnerSplash = true;
			} else if (tie && !_prevIsTie) {
				splashWinnerName = '';
				splashScore = `${$team1.points} · ${$team2.points}`;
				splashLabel = m.scoring_tie();
				splashIsTie = true;
				showWinnerSplash = true;
			}
		}

		_prevT1Won = t1;
		_prevT2Won = t2;
		_prevIsTie = tie;
	});

	// Handler for tournament match complete event from TeamCard
	// This is called BEFORE currentMatch is cleared, ensuring we have all data
	function handleTournamentMatchCompleteFromEvent() {
		if (!tournamentMatchCompletedSent) {
			handleTournamentMatchComplete();
		}
	}

	// React to URL key parameter (works on initial load AND client-side navigation)
	$effect(() => {
		const urlKey = page.url.searchParams.get('key');
		if (urlKey && /^[A-Za-z0-9]{6}$/i.test(urlKey)) {
			// Save the key natively in the gameSettings
			gameSettings.update(s => ({ ...s, tournamentKey: urlKey.toUpperCase() }));
			// Clean up the URL (remove the key parameter)
			const newUrl = new URL(window.location.href);
			newUrl.searchParams.delete('key');
			window.history.replaceState({}, '', newUrl.pathname);
			// Use the same logic as clicking the tournament button (auto-start if 1 match)
			handleJoinTournament();
		}
	});

	onMount(() => {
		gameSettings.load();
		loadTeams();
		loadMatchState();

		// Load tournament context if any and sync with Firebase (source of truth)
		const savedContext = loadTournamentContext();
		if (savedContext) {
			// First apply the saved context (for offline support)
			applyTournamentConfig(savedContext);

			// Subscribe to match status changes (detect if admin completes match externally)
			setupMatchStatusSubscription(savedContext);

			// Then sync with Firebase to get the latest data (source of truth)
			syncWithFirebaseOnLoad(savedContext);
		}

		// Start current match if not already started
		if (!$currentMatch) {
			startCurrentMatch();
		}

		const unsubSettings = gameSettings.subscribe($settings => {
			// Initialize timer if not set
			if ($timeRemaining === 0) {
				const totalSeconds = $settings.timerMinutes * 60 + $settings.timerSeconds;
				resetTimer(totalSeconds);
			}
		});

		// Auto-sync tournament data when connection is restored
		const unsubReconnect = onReconnect(async () => {
			const context = get(gameTournamentContext);
			if (context && !tournamentMatchCompletedSent) {
				console.log('🔄 Connection restored - syncing tournament data...');
				setSyncStatus('syncing');
				try {
					const savedData = saveTournamentProgressToLocalStorage();
					if (savedData) {
						await syncTournamentRounds(savedData.allRounds, savedData.gamesWonA, savedData.gamesWonB);
						setSyncStatus('success');
						console.log('✅ Tournament data synced after reconnect');
					} else {
						setSyncStatus('idle');
					}
				} catch (error) {
					console.error('❌ Failed to sync after reconnect:', error);
					setSyncStatus('error');
				}
			}
		});

		// Keyboard shortcuts for page-specific actions (QR Scanner, Settings)
		function handleKeyboardShortcuts(e: KeyboardEvent) {
			// Skip if any modal is open or if typing in an input
			const hasModalOpen = showSettings || showQRScanner || showColorPicker || showHammerDialog ||
				showNewMatchConfirm || showTournamentModal || showTournamentExitConfirm ||
				showMatchCompletedExternally || $isInviteModalOpen;

			if (hasModalOpen) return;
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

			const isMod = e.ctrlKey || e.metaKey;

			// Ctrl/Cmd + Q - QR Scanner
			if (isMod && e.key.toLowerCase() === 'q') {
				e.preventDefault();
				showQRScanner = true;
				return;
			}

			// Ctrl/Cmd + , - Settings
			if (isMod && e.key === ',') {
				e.preventDefault();
				showSettings = true;
				return;
			}
		}

		window.addEventListener('keydown', handleKeyboardShortcuts);

		return () => {
			unsubSettings();
			unsubReconnect();
			window.removeEventListener('keydown', handleKeyboardShortcuts);
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
	 * Exit tournament mode - clears context only
	 * Restores pre-tournament friendly backup automatically.
	 */
	function exitTournamentMode() {
		clearTournamentContext();
		// Clear event title/phase since we're no longer in tournament mode.
		// Also restore gameType from backup immediately to avoid showing partner buttons
		// incorrectly when the tournament was doubles but the friendly mode was singles.
		const backupStr = localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY);
		const backup = backupStr
			? (() => {
					try {
						return JSON.parse(backupStr);
					} catch {
						return null;
					}
				})()
			: null;
		gameSettings.update((s) => ({
			...s,
			eventTitle: '',
			matchPhase: '',
			...(backup?.gameType ? { gameType: backup.gameType } : {})
		}));
		
		// Immediately restore pre-tournament data instead of marking it
		// to require a new match click from the user.
		justExitedTournamentMode = false;
		restorePreTournamentData(true);
	}

	/**
	 * Restore pre-tournament settings and team data from backup
	 * Called when starting a new friendly match after a tournament
	 * @param force - If true, restore even if justExitedTournamentMode is true
	 */
	function restorePreTournamentData(force = false) {

		const backupStr = localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY);
		if (!backupStr) return;

		try {
			const backup = JSON.parse(backupStr);

			// Restore team data (including user assignments)
			updateTeam(1, {
				name: backup.team1Name,
				color: backup.team1Color,
				userId: backup.team1UserId ?? null,
				userPhotoURL: backup.team1UserPhotoURL ?? null,
				partner: backup.team1Partner ?? undefined
			});
			updateTeam(2, {
				name: backup.team2Name,
				color: backup.team2Color,
				userId: backup.team2UserId ?? null,
				userPhotoURL: backup.team2UserPhotoURL ?? null,
				partner: backup.team2Partner ?? undefined
			});

			// Restore game settings
			gameSettings.update((s) => ({
				...s,
				gameMode: backup.gameMode ?? s.gameMode,
				pointsToWin: backup.pointsToWin ?? s.pointsToWin,
				roundsToPlay: backup.roundsToPlay ?? s.roundsToPlay,
				matchesToWin: backup.matchesToWin ?? s.matchesToWin,
				show20s: backup.show20s ?? s.show20s,
				showHammer: backup.showHammer ?? s.showHammer,
				gameType: backup.gameType ?? s.gameType,
				timerMinutes: backup.timerMinutes ?? s.timerMinutes,
				timerSeconds: backup.timerSeconds ?? s.timerSeconds,
				showTimer: backup.showTimer ?? s.showTimer
			}));

			// Reset and stop timer with restored settings
			const totalSeconds = (backup.timerMinutes ?? 5) * 60 + (backup.timerSeconds ?? 0);
			resetTimer(totalSeconds);

			gameSettings.save(); // Persistir la restauración en localStorage
			localStorage.removeItem(PRE_TOURNAMENT_BACKUP_KEY);
			console.log('♻️ Restored pre-tournament data:', backup);
		} catch (e) {
			console.error('Failed to restore pre-tournament backup:', e);
			localStorage.removeItem(PRE_TOURNAMENT_BACKUP_KEY);
		}
	}

	/**
	 * Handle acknowledgment of externally completed match
	 */
	function handleExternalCompletionAck() {
		showMatchCompletedExternally = false;
		exitTournamentMode();
		isInExtraRounds = false;
		// Reset to normal game mode
		resetTeams();
		resetMatchState();
	}

	/**
	 * Sync with Firebase on page load to get the latest match state (source of truth)
	 * This ensures that if the page is reloaded, we restore the match state from Firebase
	 */
	async function syncWithFirebaseOnLoad(savedContext: TournamentMatchContext) {
		try {
			const result = await resumeTournamentMatch(
				savedContext.tournamentId,
				savedContext.matchId,
				savedContext.phase,
				savedContext.groupId
			);

			if (!result.success || !result.match) {
				console.warn('⚠️ Could not sync with Firebase:', result.error);
				return;
			}

			const firebaseMatch = result.match;

			// Check if match is already completed - if so, show modal and exit tournament mode
			if (firebaseMatch.status === 'COMPLETED' || firebaseMatch.status === 'WALKOVER') {
				externalMatchWinner = firebaseMatch.winner === savedContext.participantAId
					? savedContext.participantAName
					: savedContext.participantBName;
				showMatchCompletedExternally = true;
				return;
			}

			// Check if Firebase has more recent data (more rounds)
			const firebaseRounds = (firebaseMatch as any).rounds || [];
			const localRounds = savedContext.existingRounds || [];

			// Check if user has added local rounds that aren't in Firebase yet
			const currentLocalRounds = get(currentGameRounds);
			const hasMoreLocalRounds = currentLocalRounds.length > firebaseRounds.length;

			// If user has more local rounds than Firebase, DON'T overwrite - user's data is newer
			if (hasMoreLocalRounds) {
				console.log('⏭️ User has more local rounds than Firebase - keeping local data as source of truth');
				// Just update the context with local rounds for persistence
				updateTournamentContext({
					existingRounds: currentLocalRounds.map((r, idx) => ({
						gameNumber: savedContext.currentGameData?.currentGameNumber || 1,
						roundInGame: idx + 1,
						pointsA: savedContext.currentUserSide === 'A' ? r.team1Points : r.team2Points,
						pointsB: savedContext.currentUserSide === 'A' ? r.team2Points : r.team1Points,
						twentiesA: savedContext.currentUserSide === 'A' ? (r.team1Twenty || 0) : (r.team2Twenty || 0),
						twentiesB: savedContext.currentUserSide === 'A' ? (r.team2Twenty || 0) : (r.team1Twenty || 0)
					}))
				});
				return;
			}

			// If Firebase has more/different data and user hasn't added local rounds, update
			if (firebaseRounds.length !== localRounds.length ||
				(firebaseMatch as any).gamesWonA !== savedContext.currentGameData?.gamesWonA ||
				(firebaseMatch as any).gamesWonB !== savedContext.currentGameData?.gamesWonB) {

				console.log('🔄 Firebase has updated data, reapplying...');

				// Update context with Firebase data
				const updatedContext: TournamentMatchContext = {
					...savedContext,
					existingRounds: firebaseRounds,
					currentGameData: {
						gamesWonA: (firebaseMatch as any).gamesWonA || 0,
						gamesWonB: (firebaseMatch as any).gamesWonB || 0,
						currentGameNumber: ((firebaseMatch as any).gamesWonA || 0) + ((firebaseMatch as any).gamesWonB || 0) + 1
					}
				};

				// Update the store and localStorage
				setTournamentContext(updatedContext);

				// Reapply config with updated data
				applyTournamentConfig(updatedContext);

				console.log('✅ Match state synced from Firebase');
			} else {
				console.log('✅ Local data matches Firebase, no sync needed');
			}
		} catch (error) {
			console.error('❌ Error syncing with Firebase on load:', error);
			// Continue with local data if Firebase sync fails
		}
	}

	// Track if tournament config has been applied to avoid race conditions
	let lastAppliedContextId: string | null = null;

	/**
	 * Apply tournament configuration to game settings and teams
	 */
	function applyTournamentConfig(context: TournamentMatchContext, forceApply = false) {
		const config = context.gameConfig;
		const isUserSideA = context.currentUserSide === 'A';

		// Create a unique ID for this context based on rounds count
		const contextId = `${context.matchId}-${context.existingRounds?.length || 0}`;

		// Skip if we already applied this exact context (prevent race conditions with async sync)
		// But allow if user might have added new rounds locally
		const currentLocalRounds = get(currentGameRounds);
		if (!forceApply && lastAppliedContextId === contextId && currentLocalRounds.length > 0) {
			console.log('⏭️ Skipping duplicate applyTournamentConfig - already applied and have local rounds');
			return;
		}
		lastAppliedContextId = contextId;

		// Reset completion flag when starting/resuming a tournament match
		tournamentMatchCompletedSent = false;
		isInExtraRounds = false;

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
			matchPhase: context.bracketRoundName || (context.phase === 'GROUP' ? 'Fase de Grupos' : 'Bracket'),
			lastTournamentResult: null
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
			// Check if current game reached winning score
			const pointsToWin = config.pointsToWin || 7;
			if (initialPoints1 >= pointsToWin && (initialPoints1 - initialPoints2 >= 2)) {
				team1HasWon = true;
			} else if (initialPoints2 >= pointsToWin && (initialPoints2 - initialPoints1 >= 2)) {
				team2HasWon = true;
			}
		}

		// DESPUÉS del reset: aplicar los valores iniciales
		// IMPORTANTE: Limpiar datos de friendly matches (userId, partner, etc.)
		// para evitar mezclar con datos del torneo
		team1.update(t => ({
			...t,
			name: team1Name,
			points: initialPoints1,
			rounds: initialRounds1,
			matches: initialMatches1,
			twenty: 0,
			hasWon: team1HasWon,
			// Limpiar datos de friendly matches
			userId: null,
			userPhotoURL: null,
			partner: undefined
		}));

		team2.update(t => ({
			...t,
			name: team2Name,
			points: initialPoints2,
			rounds: initialRounds2,
			matches: initialMatches2,
			twenty: 0,
			hasWon: team2HasWon,
			// Limpiar datos de friendly matches
			userId: null,
			userPhotoURL: null,
			partner: undefined
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

			// Restaurar en los stores (tanto individual como matchState para mantenerlos sincronizados)
			currentGameRounds.set(restoredRounds);
			currentMatchRounds.set(restoredRounds); // CRÍTICO: También restaurar currentMatchRounds para saveGameAndCheckMatchComplete
			roundsPlayed.set(restoredRounds.length);
			// IMPORTANTE: También actualizar matchState para que addRound() funcione correctamente
			matchState.update(state => ({
				...state,
				currentGameRounds: restoredRounds,
				currentMatchRounds: restoredRounds,
				roundsPlayed: restoredRounds.length
			}));
			// CRÍTICO: Guardar a localStorage para que loadMatchState no sobrescriba con datos vacíos
			saveMatchState();

			// IMPORTANTE: Restaurar los juegos completados en currentMatchGames
			// Esto es necesario para que showNextGameButton funcione correctamente
			const completedGames: Array<{
				gameNumber: number;
				winner: 1 | 2;
				team1Points: number;
				team2Points: number;
				team1Rounds: number;
				team2Rounds: number;
				team1Twenty: number;
				team2Twenty: number;
				timestamp: number;
			}> = [];

			// Reconstruct completed games from existingRounds (games before current)
			for (let gameNum = 1; gameNum < currentGameNumber; gameNum++) {
				const gameRounds = context.existingRounds.filter(r => r.gameNumber === gameNum);
				if (gameRounds.length > 0) {
					const gameTotalA = gameRounds.reduce((sum, r) => sum + (r.pointsA || 0), 0);
					const gameTotalB = gameRounds.reduce((sum, r) => sum + (r.pointsB || 0), 0);
					const gameTwentyA = gameRounds.reduce((sum, r) => sum + (r.twentiesA || 0), 0);
					const gameTwentyB = gameRounds.reduce((sum, r) => sum + (r.twentiesB || 0), 0);
					const team1Pts = isUserSideA ? gameTotalA : gameTotalB;
					const team2Pts = isUserSideA ? gameTotalB : gameTotalA;
					const team1Twenty = isUserSideA ? gameTwentyA : gameTwentyB;
					const team2Twenty = isUserSideA ? gameTwentyB : gameTwentyA;

					// Count rounds won by each team
					let team1RoundsWon = 0;
					let team2RoundsWon = 0;
					gameRounds.forEach(r => {
						const ptsA = r.pointsA || 0;
						const ptsB = r.pointsB || 0;
						if (isUserSideA) {
							if (ptsA > ptsB) team1RoundsWon++;
							else if (ptsB > ptsA) team2RoundsWon++;
						} else {
							if (ptsB > ptsA) team1RoundsWon++;
							else if (ptsA > ptsB) team2RoundsWon++;
						}
					});

					completedGames.push({
						gameNumber: gameNum,
						winner: team1Pts > team2Pts ? 1 : 2,
						team1Points: team1Pts,
						team2Points: team2Pts,
						team1Rounds: team1RoundsWon,
						team2Rounds: team2RoundsWon,
						team1Twenty,
						team2Twenty,
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
			}

			// CRÍTICO: Actualizar currentMatch (history store) con las rondas restauradas
			// El RoundsPanel lee de $currentMatch.rounds y $currentMatch.games
			currentMatch.update(m => ({
				...(m ?? { startTime: Date.now() }),
				rounds: restoredRounds,
				games: completedGames.map(g => ({
					gameNumber: g.gameNumber,
					winner: g.winner as 1 | 2 | null,
					team1Points: g.team1Points,
					team2Points: g.team2Points,
					rounds: context.existingRounds
						.filter((r: any) => r.gameNumber === g.gameNumber)
						.map((r: any, idx: number) => ({
							roundNumber: idx + 1,
							team1Points: isUserSideA ? (r.pointsA || 0) : (r.pointsB || 0),
							team2Points: isUserSideA ? (r.pointsB || 0) : (r.pointsA || 0),
							team1Twenty: isUserSideA ? (r.twentiesA || 0) : (r.twentiesB || 0),
							team2Twenty: isUserSideA ? (r.twentiesB || 0) : (r.twentiesA || 0),
							hammerTeam: null as 1 | 2 | null
						}))
				}))
			}));
		}

		// Reset and auto-start timer for tournament match
		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);
		if ($gameSettings.showTimer) {
			startTimer();
		}
	}

	/**
	 * Handle tournament match started from modal
	 */
	function handleTournamentMatchStarted(context: TournamentMatchContext) {
		// Clear the "just exited tournament" flag since we're starting a new tournament match
		justExitedTournamentMode = false;

		// Save current (friendly) data as backup ONLY if no backup exists
		// This preserves the original friendly settings across multiple tournament matches
		if (!localStorage.getItem(PRE_TOURNAMENT_BACKUP_KEY)) {
			const backup = {
				// Team data (including user assignments)
				team1Name: $team1.name,
				team1Color: $team1.color,
				team1UserId: $team1.userId,
				team1UserPhotoURL: $team1.userPhotoURL,
				team1Partner: $team1.partner,
				team2Name: $team2.name,
				team2Color: $team2.color,
				team2UserId: $team2.userId,
				team2UserPhotoURL: $team2.userPhotoURL,
				team2Partner: $team2.partner,
				// Game settings
				gameMode: $gameSettings.gameMode,
				pointsToWin: $gameSettings.pointsToWin,
				roundsToPlay: $gameSettings.roundsToPlay,
				matchesToWin: $gameSettings.matchesToWin,
				show20s: $gameSettings.show20s,
				showHammer: $gameSettings.showHammer,
				gameType: $gameSettings.gameType,
				// Timer settings
				timerMinutes: $gameSettings.timerMinutes,
				timerSeconds: $gameSettings.timerSeconds,
				showTimer: $gameSettings.showTimer
			};
			localStorage.setItem(PRE_TOURNAMENT_BACKUP_KEY, JSON.stringify(backup));
			console.log('💾 Saved pre-tournament data to localStorage:', backup);
		}

		// Apply tournament config (context already set by modal)
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
	 * Handle QR scan result - can be tournament key or friendly invite code
	 */
	function handleQRScanResult(data: string) {
		showQRScanner = false;

		// Try to extract tournament key from URL (?key=ABC123)
		const keyMatch = data.match(/[?&]key=([A-Za-z0-9]{6})/i);
		if (keyMatch) {
			// Tournament key - open tournament modal with pre-filled key
			const key = keyMatch[1].toUpperCase();
			gameSettings.update(s => ({ ...s, tournamentKey: key }));
			showTournamentModal = true;
			return;
		}

		// Try to extract friendly invite code from URL (?invite=ABC123)
		const inviteMatch = data.match(/[?&]invite=([A-Za-z0-9]{6})/i);
		if (inviteMatch) {
			// Friendly invite - redirect to join page
			const code = inviteMatch[1].toUpperCase();
			goto(`/join?invite=${code}`);
			return;
		}

		// Direct 6-char code - could be either, assume tournament key for now
		if (/^[A-Za-z0-9]{6}$/i.test(data.trim())) {
			const code = data.trim().toUpperCase();
			gameSettings.update(s => ({ ...s, tournamentKey: code }));
			showTournamentModal = true;
			return;
		}

		// Unknown format - just open tournament modal
		showTournamentModal = true;
	}

	/**
	 * Handle join tournament button click
	 * If user is logged in and has a saved tournament key with exactly 1 active match,
	 * auto-start the match without showing the modal
	 */
	async function handleJoinTournament() {
		const savedKey = $gameSettings.tournamentKey;

		console.log('🎯 handleJoinTournament:', { savedKey, currentUser: $currentUser?.id });

		// If no saved key or user not logged in, show modal
		if (!savedKey || !$currentUser) {
			console.log('❌ No saved key or not logged in, showing modal');
			showTournamentModal = true;
			return;
		}

		isCheckingTournament = true;

		try {
			// Fetch tournament by key (returns Tournament | null directly)
			console.log('🔍 Fetching tournament by key:', savedKey);
			const tournament = await getTournamentByKey(savedKey);
			if (!tournament) {
				console.log('❌ Tournament not found');
				showTournamentModal = true;
				return;
			}

			console.log('✅ Tournament found:', { id: tournament.id, status: tournament.status });

			// Check tournament is active
			if (!['IN_PROGRESS', 'GROUP_STAGE', 'FINAL_STAGE'].includes(tournament.status)) {
				console.log('❌ Tournament not active, clearing key');
				gameSettings.update(s => ({ ...s, tournamentKey: undefined }));
				showTournamentModal = true;
				return;
			}

			// Get user's active matches (PENDING or IN_PROGRESS)
			console.log('🔍 Getting user active matches for userId:', $currentUser.id);
			const allUserMatches = await getUserActiveMatches(tournament, $currentUser.id);
			console.log('📊 User matches found (all rounds):', allUserMatches.length, allUserMatches);

			// Filter to current round only (for Round Robin group stage)
			let userMatches = allUserMatches;
			if (tournament.status === 'GROUP_STAGE' && tournament.groupStage?.type === 'ROUND_ROBIN' && tournament.groupStage?.groups) {
				// Calculate current round per group (first round with PENDING/IN_PROGRESS matches)
				const currentRoundByGroup = new Map<string, number>();
				for (const group of tournament.groupStage.groups) {
					if (!group.schedule) continue;
					for (const round of group.schedule) {
						if (round.matches.some(m => m.status === 'PENDING' || m.status === 'IN_PROGRESS')) {
							currentRoundByGroup.set(group.id, round.roundNumber);
							break;
						}
					}
				}
				// Keep only matches from the current round of their group
				userMatches = allUserMatches.filter(m => {
					if (!m.groupId || !m.roundNumber) return true; // Non-group matches pass through
					const currentRound = currentRoundByGroup.get(m.groupId);
					return currentRound !== undefined && m.roundNumber === currentRound;
				});
				console.log('📊 User matches (current round):', userMatches.length);
			}

			// If exactly 1 PENDING match (not already in progress), auto-start
			const pendingOnly = userMatches.filter(m => !m.isInProgress);
			if (pendingOnly.length === 1 && userMatches.length === 1) {
				console.log('🚀 Auto-starting single pending match');
				await autoStartMatch(tournament, pendingOnly[0]);
				return;
			}

			// Otherwise show modal (0 or 2+ matches)
			console.log('📋 Showing modal (matches !== 1)');
			showTournamentModal = true;
		} catch (error) {
			console.error('Error checking tournament:', error);
			showTournamentModal = true;
		} finally {
			isCheckingTournament = false;
		}
	}

	/**
	 * Auto-start a tournament match without showing the modal
	 */
	async function autoStartMatch(tournament: any, matchInfo: PendingMatchInfo) {
		console.log('🎮 autoStartMatch called:', { matchId: matchInfo.match.id, status: matchInfo.match.status });
		const isResuming = matchInfo.match.status === 'IN_PROGRESS';

		// Start or resume match in Firebase
		console.log('🔄 Starting match in Firebase...', { isResuming });
		const result = await startTournamentMatch(
			tournament.id,
			matchInfo.match.id,
			matchInfo.phase,
			matchInfo.groupId,
			isResuming
		);

		console.log('📡 startTournamentMatch result:', result);

		if (!result.success) {
			console.log('❌ Failed to start match, showing modal');
			showTournamentModal = true;
			return;
		}

		// Get existing rounds if resuming
		let existingRounds: any[] = [];
		let gamesWonA = 0;
		let gamesWonB = 0;

		if (isResuming) {
			const resumeResult = await resumeTournamentMatch(
				tournament.id,
				matchInfo.match.id,
				matchInfo.phase,
				matchInfo.groupId
			);
			if (resumeResult.success && resumeResult.match) {
				existingRounds = resumeResult.match.rounds || [];
				gamesWonA = resumeResult.match.gamesWonA || 0;
				gamesWonB = resumeResult.match.gamesWonB || 0;
			}
		}

		// Detect user side
		const userParticipant = tournament.participants.find((p: any) => p.userId === $currentUser?.id);
		const side: 'A' | 'B' = userParticipant?.id === matchInfo.match.participantA ? 'A' : 'B';

		// Calculate current game number
		const maxGameNumber = existingRounds.length > 0
			? Math.max(...existingRounds.map((r: any) => r.gameNumber || 1))
			: 1;

		// Determine bracket type
		const bracketType: 'gold' | 'silver' | undefined =
			matchInfo.isSilverBracket ? 'silver' :
			matchInfo.phase === 'FINAL' ? 'gold' : undefined;

		// Get group stage info if applicable
		const groupStageType = tournament.groupStage?.type;
		const totalRounds = tournament.groupStage?.totalRounds;

		// Build tournament context
		const context: TournamentMatchContext = {
			tournamentId: tournament.id,
			tournamentKey: tournament.key,
			tournamentName: tournament.name,
			matchId: matchInfo.match.id,
			phase: matchInfo.phase,
			roundNumber: matchInfo.roundNumber,
			totalRounds,
			groupId: matchInfo.groupId,
			groupName: matchInfo.groupName,
			groupStageType,
			bracketRoundName: matchInfo.bracketRoundName,
			bracketType,
			isConsolation: matchInfo.isConsolation || false,
			participantAId: matchInfo.match.participantA || '',
			participantBId: 'participantB' in matchInfo.match ? matchInfo.match.participantB || '' : '',
			participantAName: matchInfo.participantAName,
			participantBName: matchInfo.participantBName,
			participantAPhotoURL: matchInfo.participantAPhotoURL,
			participantBPhotoURL: matchInfo.participantBPhotoURL,
			participantAPartnerPhotoURL: matchInfo.participantAPartnerPhotoURL,
			participantBPartnerPhotoURL: matchInfo.participantBPartnerPhotoURL,
			currentUserId: $currentUser?.id,
			currentUserParticipantId: userParticipant?.id,
			currentUserSide: side,
			gameConfig: matchInfo.gameConfig,
			matchStartedAt: Date.now(),
			existingRounds: existingRounds.length > 0 ? existingRounds : undefined,
			currentGameData: (gamesWonA > 0 || gamesWonB > 0 || existingRounds.length > 0) ? {
				gamesWonA,
				gamesWonB,
				currentGameNumber: maxGameNumber
			} : undefined
		};

		setTournamentContext(context);
		handleTournamentMatchStarted(context);
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
		exitTournamentMode();
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
		exitTournamentMode();
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

		stopTimer();
		tournamentMatchCompletedSent = true;

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
		
		// Guardamos el resultado justo antes de salir para que RingsPanel lo tenga
		if (context) {
			gameSettings.update(s => ({
				...s,
				lastTournamentResult: {
					winnerName: winner === context.participantAId ? context.participantAName : (winner === context.participantBId ? context.participantBName : null),
					scoreA: finalGamesWonA,
					scoreB: finalGamesWonB,
					isTie: winner === null,
					team1Name: context.participantAName,
					team2Name: context.participantBName,
					pointsA: isUserSideA ? totalPointsA : totalPointsB,
					pointsB: isUserSideA ? totalPointsB : totalPointsA,
					matchesToWin: context.gameConfig.matchesToWin ?? 1
				}
			}));
		}

		exitTournamentMode();
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

	function handleResetMatch() {
		// Clear any stale tournament context when starting a new friendly match
		if ($gameTournamentContext) {
			exitTournamentMode();
		}

		// Clear the last tournament result block if there was one
		gameSettings.update(s => ({ ...s, lastTournamentResult: null }));

		resetTeams();
		resetMatchState();
		isInExtraRounds = false;

		const totalSeconds = $gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds;
		resetTimer(totalSeconds);

		// Auto-start timer if enabled
		if ($gameSettings.showTimer) {
			startTimer();
		}
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

	// ─────────────────────────────────────────────────────────────────────────────
	// Match Invitation Handlers (Friendly Mode)
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Handle when user wants to assign themselves to a team
	 */
	async function handleAssignUser(teamNumber: 1 | 2) {
		if (!$currentUser) return;

		// Check if user is already assigned to the OTHER team
		const otherTeamData = teamNumber === 1 ? $team2 : $team1;
		const thisTeamData = teamNumber === 1 ? $team1 : $team2;

		// If user is assigned to the other team and clicking on empty team, open invite modal for opponent
		if (otherTeamData.userId === $currentUser.id && !thisTeamData.userId) {
			// Set invite type to opponent (player on the other team)
			currentInviteType = 'opponent';
			currentInviteHostTeam = teamNumber === 1 ? 2 : 1; // Host is the team user is on
			openInviteModal();
			return;
		}

		// Otherwise, assign the user to this team
		const playerName = await getPlayerName();
		const displayName = playerName || $currentUser.name || 'Player';

		assignUserToTeam(teamNumber, $currentUser.id, displayName, $currentUser.photoURL);
	}

	/**
	 * Handle when user wants to unassign from a team
	 */
	function handleUnassignUser(teamNumber: 1 | 2) {
		unassignUserFromTeam(teamNumber);

		// If there's an active invite and user unassigns from the host team, cancel the invite
		if ($activeInvite && $activeInvite.hostTeamNumber === teamNumber) {
			handleCancelInvite();
		}
	}

	/**
	 * Handle when user wants to invite a partner to a team (doubles mode)
	 * Opens the invite modal with the appropriate invite type
	 */
	function handleAssignPartner(teamNumber: 1 | 2) {
		if (!$currentUser) return;

		// Determine which team the user is on
		const userTeam = $team1.userId === $currentUser.id ? 1 : $team2.userId === $currentUser.id ? 2 : null;

		if (!userTeam) {
			// User not assigned to any team yet - they should assign themselves first
			console.warn('User must assign themselves to a team before inviting partners');
			return;
		}

		// Set the host team (user's team) for the invite
		currentInviteHostTeam = userTeam;

		// Determine invite type based on which team's partner button was clicked
		if (teamNumber === userTeam) {
			// Clicking on partner of MY team
			currentInviteType = 'my_partner';
		} else {
			// Clicking on partner of OTHER team
			currentInviteType = 'opponent_partner';
		}

		// Open the invite modal
		openInviteModal();
	}

	/**
	 * Handle when user wants to unassign partner from a team
	 */
	function handleUnassignPartner(teamNumber: 1 | 2) {
		unassignPartnerFromTeam(teamNumber);
	}

	/**
	 * Handle canceling an active invite
	 * Handles race condition: if guest already accepted, don't clear the invite
	 */
	async function handleCancelInvite() {
		if ($activeInvite) {
			const result = await cancelInvite($activeInvite.id);

			if (result === 'already_accepted') {
				// Guest already accepted! Don't clear - the subscription will update the UI
				// The invite modal will show the accepted state with guest info
				console.log('Cannot cancel: guest already accepted the invite');
				return;
			}

			// Successfully cancelled or other error - clear and close
			clearActiveInvite($activeInvite.inviteType);
		}
		closeInviteModal();
	}

	/**
	 * Handle closing the invite modal
	 */
	function handleCloseInviteModal() {
		closeInviteModal();
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
		// If we're in edit mode, just close and reset
		if (isEditing20s) {
			isEditing20s = false;
			editing20sRoundIndex = -1;
			return;
		}

		// Clear the pending flag when dialog closes
		setTwentyDialogPending(false);

		// After 20s are entered, finalize the round
		finalizeRoundWithData();
	}

	// Handle 20s editing from RoundsPanel
	function handleEdit20s(roundIndex: number, team1Value: number, team2Value: number) {
		editing20sRoundIndex = roundIndex;
		editing20sTeam1Value = team1Value;
		editing20sTeam2Value = team2Value;
		isEditing20s = true;
	}

	// Handle 20s edit confirmation
	// NOTE: We do NOT reset isEditing20s here - handleTwentyInputClose() will do it
	// This prevents a race condition where handleTwentyInputClose sees isEditing20s=false
	// and incorrectly calls finalizeRoundWithData() for pending round data
	function handleEdit20sConfirm(team1Value: number, team2Value: number) {
		if (editing20sRoundIndex >= 0) {
			updateCurrentMatchRound(editing20sRoundIndex, {
				team1Twenty: team1Value,
				team2Twenty: team2Value
			});
		}
		// Do NOT set isEditing20s = false here!
		// handleTwentyInputClose() will handle cleanup
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
			hammerSide?: 'A' | 'B' | null;
		}> = [];

		// Use currentMatch which has games with rounds (currentMatchGames doesn't have rounds)
		const current = get(currentMatch);
		const currentRounds = get(currentGameRounds);
		const currentGameNumber = context.currentGameData?.currentGameNumber || 1;

		// IMPORTANT: Get ONLY rounds from PREVIOUS games (not current game) from context.existingRounds
		// This is needed for resumed matches where previous games are stored in Firebase
		// We NEVER use existingRounds for the current game - always use currentRounds as the source of truth
		const existingPreviousRounds = context.existingRounds?.filter(r => r.gameNumber < currentGameNumber) || [];
		const hasExistingPreviousRounds = existingPreviousRounds.length > 0;
		const hasCurrentGamesWithRounds = current?.games?.some(g => g?.rounds?.length > 0);

		// If we have previous rounds from context but not in current.games, use context as source
		if (hasExistingPreviousRounds && !hasCurrentGamesWithRounds) {
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
							// Convert hammerTeam (1 or 2) to hammerSide ('A' or 'B') based on user side
							let hammerSide: 'A' | 'B' | null = null;
							if (round.hammerTeam === 1) {
								hammerSide = isUserSideA ? 'A' : 'B';
							} else if (round.hammerTeam === 2) {
								hammerSide = isUserSideA ? 'B' : 'A';
							}

							allRounds.push({
								gameNumber: gameIndex + 1,
								roundInGame: roundIndex + 1,
								pointsA,
								pointsB,
								twentiesA,
								twentiesB,
								hammerSide
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
				// Convert hammerTeam (1 or 2) to hammerSide ('A' or 'B') based on user side
				let hammerSide: 'A' | 'B' | null = null;
				if (round.hammerTeam === 1) {
					hammerSide = isUserSideA ? 'A' : 'B';
				} else if (round.hammerTeam === 2) {
					hammerSide = isUserSideA ? 'B' : 'A';
				}

				allRounds.push({
					gameNumber: currentGameNumber,
					roundInGame: roundIndex + 1,
					pointsA,
					pointsB,
					twentiesA,
					twentiesB,
					hammerSide
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
			let hasClearWinner = pointsA !== pointsB;

			// Check if this is a bracket match (requires tiebreaker on tie)
			const isBracketMatch = context?.phase === 'FINAL';

			if (gameMode === 'rounds') {
				// In rounds mode, game is complete when:
				// - All rounds are played AND there's a winner (pointsA != pointsB)
				// - OR in bracket mode with tie: game is NOT complete until someone wins
				const hasEnoughRounds = gameRounds.length >= roundsToPlay;

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

			if (gameComplete && hasClearWinner) {
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
			if (preResetData && preResetData.allRounds) {
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
		// Auto-start timer for next game
		if ($gameSettings.showTimer) {
			startTimer();
		}

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
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="game-page" data-theme={$theme}>
	<header class="game-header" class:tournament-mode={inTournamentMode}>
		{#if inTournamentMode}
			<!-- Tournament mode header -->
			<div class="header-left tournament-header-left">
				<!-- Tournament info - flexible layout -->
				<div class="tournament-info">
					<div class="tournament-name-badge">
						<Trophy class="size-4 text-primary/80 shrink-0" />
						<span class="tournament-name-text">{$gameTournamentContext?.tournamentName}</span>
						{#if $gameTournamentContext?.gameConfig?.gameType === 'doubles'}
							<Users class="size-3.5 tournament-mode-icon" />
						{:else}
							<User class="size-3.5 tournament-mode-icon" />
						{/if}
					</div>
					<span class="tournament-phase">
						{#if $gameTournamentContext?.phase === 'GROUP'}
							{#if $gameTournamentContext.groupStageType === 'SWISS'}SS{:else}RR{/if}
							{#if $gameTournamentContext.roundNumber && $gameTournamentContext.totalRounds}
								R{$gameTournamentContext.roundNumber}/{$gameTournamentContext.totalRounds}
							{/if}
							{#if $gameTournamentContext.groupName}
								<span class="text-muted-foreground/60">({$gameTournamentContext.groupName})</span>
							{/if}
						{:else}
							{$gameTournamentContext?.bracketRoundName || 'Bracket'}
							{#if $gameTournamentContext?.bracketType === 'gold'}
								<span class="text-amber-500 font-semibold ml-1">{m.scoring_gold()}</span>
							{:else if $gameTournamentContext?.bracketType === 'silver'}
								<span class="text-slate-400 font-semibold ml-1">{m.scoring_silver()}</span>
							{/if}
						{/if}
						{#if tournamentMatchFormat}
							<span class="text-muted-foreground/50 ml-1">· {tournamentMatchFormat}</span>
						{/if}
					</span>
				</div>
			</div>

			{#if $gameSettings.showTimer}
				<Timer size="small" />
			{/if}

			<div class="header-right">
				<OfflineIndicator />
				<ThemeToggle />
				<button class="header-btn" onclick={handleSwitchSides} aria-label={m.scoring_switchSides()} title={m.scoring_switchSides()}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/></svg>
				</button>
				<button class="header-btn header-btn-danger" onclick={handleTournamentExit} aria-label={m.tournament_exitMode()} title={m.tournament_exitMode()}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
		{:else}
			<!-- Normal/Friendly mode header -->
			<div class="header-left">
				<AppMenu showHome homeHref="/" currentPage="game">
					<DropdownMenu.Item onclick={() => showQRScanner = true} class="cursor-pointer !pl-3 !pr-4 !py-2.5 !gap-2 rounded-lg transition-colors duration-150 hover:bg-accent group">
						<div class="flex items-center justify-center size-8 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
							<QrCode class="size-4 text-primary" />
						</div>
						<span class="flex-1 font-medium">{m.scan_title()}</span>
						<DropdownMenu.Shortcut>Ctrl+Q</DropdownMenu.Shortcut>
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => showSettings = true} class="cursor-pointer !pl-3 !pr-4 !py-2.5 !gap-2 rounded-lg transition-colors duration-150 hover:bg-accent group">
						<div class="flex items-center justify-center size-8 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
							<Settings class="size-4 text-primary" />
						</div>
						<span class="flex-1 font-medium">{m.common_settings()}</span>
						<DropdownMenu.Shortcut>Ctrl+,</DropdownMenu.Shortcut>
					</DropdownMenu.Item>
				</AppMenu>
				<!-- Friendly match info badge -->
				<div class="flex items-center gap-2.5">
					<div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 max-sm:px-2.5 max-sm:py-1">
						{#if $gameSettings.gameType === 'doubles'}
							<Users class="size-4 text-primary/80 max-sm:size-3.5" />
						{:else}
							<User class="size-4 text-primary/80 max-sm:size-3.5" />
						{/if}
						<span class="text-base font-semibold text-primary max-sm:text-sm">{friendlyMatchTitle}</span>
					</div>
					<span class="text-muted-foreground/40 text-base max-sm:text-sm">·</span>
					<span class="text-base font-medium text-muted-foreground max-sm:text-sm">{friendlyMatchMode}</span>
				</div>
			</div>

			{#if $gameSettings.showTimer}
				<Timer size="small" />
			{/if}

			<div class="header-right">
				<OfflineIndicator />
				<ThemeToggle />
			</div>
		{/if}
	</header>

	<!-- Rounds Panel - show when: 20s enabled, rounds mode, multi-game, OR displaying a tournament result -->
	{#if effectiveShowRoundsPanel && ($currentMatch?.rounds?.length || $currentMatch?.games?.length || $gameSettings.lastTournamentResult || (inTournamentMode && ($team1.points > 0 || $team2.points > 0)))}
		<RoundsPanel onedit20s={effectiveShow20s ? handleEdit20s : undefined} />
	{/if}

	<div class="teams-container">
		<TeamCard
			bind:this={teamCard1}
			teamNumber={1}
			isMatchComplete={isMatchComplete}
			canAssignUser={canAssignUserToTeam1}
			canAssignPartner={canAssignPartnerToTeam1}
			onchangeColor={() => openColorPicker(1)}
			onroundComplete={handleRoundComplete}
			ontournamentMatchComplete={handleTournamentMatchCompleteFromEvent}
			onextraRound={handleExtraRound}
			onassignUser={() => handleAssignUser(1)}
			onunassignUser={() => handleUnassignUser(1)}
			onassignPartner={() => handleAssignPartner(1)}
			onunassignPartner={() => handleUnassignPartner(1)}
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
			teamNumber={2}
			isMatchComplete={isMatchComplete}
			canAssignUser={canAssignUserToTeam2}
			canAssignPartner={canAssignPartnerToTeam2}
			onchangeColor={() => openColorPicker(2)}
			onroundComplete={handleRoundComplete}
			ontournamentMatchComplete={handleTournamentMatchCompleteFromEvent}
			onextraRound={handleExtraRound}
			onassignUser={() => handleAssignUser(2)}
			onunassignUser={() => handleUnassignUser(2)}
			onassignPartner={() => handleAssignPartner(2)}
			onunassignPartner={() => handleUnassignPartner(2)}
		/>
	</div>


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
			<Play size={20} />
			<span class="floating-btn-label">{m.scoring_newMatchShort()}</span>
		</button>

		<!-- Tournament Mode Button -->
		<button
			class="floating-button tournament-button"
			onclick={handleJoinTournament}
			aria-label={m.tournament_playMatch() || 'Jugar partido de torneo'}
			title={m.tournament_playMatch() || 'Jugar partido de torneo'}
			disabled={isCheckingTournament}
		>
			{#if isCheckingTournament}
				<LoaderCircle size={20} class="animate-spin" />
			{:else}
				<Trophy size={20} />
			{/if}
			<span class="floating-btn-label">{m.tournament_playShort()}</span>
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
<ColorPickerModal bind:isOpen={showColorPicker} teamNumber={colorPickerTeam} />
<HammerDialog isOpen={showHammerDialog} onclose={handleHammerSelected} />
<TwentyInputDialog
	isOpen={showTwentyDialog || isEditing20s}
	editMode={isEditing20s}
	initialTeam1Value={editing20sTeam1Value}
	initialTeam2Value={editing20sTeam2Value}
	roundNumber={editing20sRoundIndex >= 0 ? ($currentMatch?.rounds?.[editing20sRoundIndex]?.roundNumber ?? editing20sRoundIndex + 1) : 0}
	onclose={handleTwentyInputClose}
	oneditConfirm={handleEdit20sConfirm}
/>

<!-- Tournament Match Modal -->
<TournamentMatchModal
	isOpen={showTournamentModal}
	onclose={() => showTournamentModal = false}
	onmatchstarted={handleTournamentMatchStarted}
/>

<!-- Match Invite Modal (Friendly Mode) -->
<InvitePlayerModal
	isOpen={$isInviteModalOpen}
	hostTeamNumber={currentInviteHostTeam}
	inviteType={currentInviteType}
	onclose={handleCloseInviteModal}
/>

<!-- QR Scanner Modal -->
<QRScanner
	bind:isOpen={showQRScanner}
	onScan={handleQRScanResult}
	onClose={() => showQRScanner = false}
/>

<!-- Winner / Tie Splash -->
<WinnerSplash
	bind:isVisible={showWinnerSplash}
	winnerName={splashWinnerName}
	label={splashLabel}
	score={splashScore}
	isTie={splashIsTie}
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
		background: linear-gradient(135deg, var(--game-bg-start) 0%, var(--game-bg-end) 100%);
		color: var(--game-text);
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
		background: var(--game-surface);
		border: 1px solid var(--game-border);
		border-radius: 10px;
	}

	/* Tournament header layout */
	/* Strict viewport lock for Game Page ONLY */
	:global(html), :global(body) {
		overflow: hidden;
		position: fixed;
		width: 100%;
		height: 100%;
	}

	.tournament-header-left {
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.tournament-info {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex-wrap: wrap;
	}

	.tournament-name-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		border-radius: 0.5rem;
		max-width: 100%;
		min-width: 0;
	}

	.tournament-name-text {
		font-size: 1rem;
		font-weight: 600;
		color: var(--primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tournament-phase {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--muted-foreground);
		white-space: nowrap;
	}

	.tournament-mode-icon {
		color: var(--muted-foreground);
		opacity: 0.6;
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.tournament-name-badge {
			padding: 0.25rem 0.625rem;
		}

		.tournament-name-text {
			font-size: 0.875rem;
		}

		.tournament-phase {
			font-size: 0.8rem;
		}
	}

	
	/* Friendly mode header styling */
	.friendly-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: default;
		max-width: 300px;
	}

	.friendly-title:hover {
		background: none;
	}

	.friendly-title-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Normal mode header - minimal clean design */
	.header-left,
	.header-right {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: 1rem;
	}



	.header-title {
		font-family: 'Lexend', sans-serif;
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--primary);
		background: none;
		border: none;
		padding: 0.3rem 0.6rem;
		border-radius: 6px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 400px;
		letter-spacing: 0.02em;
	}

	.header-title-placeholder {
		color: var(--game-text-dim);
	}

	.header-separator {
		color: var(--game-text-dim);
		font-size: 0.9rem;
		font-weight: 300;
	}

	.header-phase {
		font-family: 'Lexend', sans-serif;
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--primary);
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
		color: var(--primary);
		opacity: 0.7;
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
		color: var(--game-text);
		opacity: 0.95;
		background: var(--game-surface-hover);
		border: 1px solid var(--game-border);
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		outline: none;
		text-align: center;
		min-width: 100px;
		max-width: 250px;
	}

	.header-input:focus {
		background: var(--game-btn-bg-hover);
		border-color: var(--game-text-muted);
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
		color: var(--game-text-muted);
		cursor: pointer;
		transition: all 0.15s;
	}

	.header-btn:hover {
		background: var(--game-surface-hover);
		color: var(--game-text);
		opacity: 0.85;
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
			padding-top: 0.5rem;
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
	}

	@media (max-width: 640px) {
		.header-phase {
			display: none;
		}
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


	/* Floating Button - Extended FAB */
	.floating-button {
		position: fixed;
		bottom: 1.5rem;
		left: 1.5rem;
		z-index: 1000;
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		height: 48px;
		padding: 0 1.15rem;
		border: none;
		border-radius: 28px;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
	}

	.floating-btn-label {
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		line-height: 1;
		white-space: nowrap;
	}

	.floating-button:hover {
		transform: translateY(-2px);
	}

	.floating-button:active {
		transform: scale(0.96);
		transition: transform 0.08s ease;
	}

	/* New Match Button - solid primary, lightness capped so white text always works */
	.new-match-button {
		background: oklch(from var(--primary) clamp(0.35, l, 0.52) c h);
		color: white;
		box-shadow:
			0 4px 14px color-mix(in srgb, var(--primary) 45%, transparent),
			0 1px 4px rgba(0, 0, 0, 0.15);
	}

	.new-match-button:hover {
		box-shadow:
			0 6px 20px color-mix(in srgb, var(--primary) 55%, transparent),
			0 2px 6px rgba(0, 0, 0, 0.15);
	}

	/* Tournament Button - solid amber/gold */
	.tournament-button {
		left: auto;
		right: 1.5rem;
		background: oklch(63% 0.15 75);
		color: white;
		box-shadow:
			0 4px 14px color-mix(in srgb, oklch(63% 0.15 75) 45%, transparent),
			0 1px 4px rgba(0, 0, 0, 0.15);
	}

	.tournament-button:hover {
		box-shadow:
			0 6px 20px color-mix(in srgb, oklch(63% 0.15 75) 55%, transparent),
			0 2px 6px rgba(0, 0, 0, 0.15);
	}

	.tournament-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	/* Invite Player Button */
	.invite-button {
		left: auto;
		right: 9.5rem;
		background: rgba(100, 200, 150, 0.15);
		color: rgba(100, 200, 150, 0.9);
		border: 1px solid rgba(100, 200, 150, 0.25);
	}

	.invite-button:hover {
		background: rgba(100, 200, 150, 0.25);
		border-color: rgba(100, 200, 150, 0.4);
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
		background: var(--card);
		border: 1px solid var(--game-border);
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
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		border-radius: 50%;
		color: var(--primary);
	}

	.newmatch-title {
		margin: 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		color: var(--game-text);
		opacity: 0.85;
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
		background: var(--game-btn-bg);
		border: 1px solid var(--game-btn-border);
		color: var(--game-text-muted);
	}

	.newmatch-btn.cancel:hover {
		background: var(--game-btn-bg-hover);
		color: var(--game-text);
	}

	.newmatch-btn.confirm {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
		color: var(--primary);
	}

	.newmatch-btn.confirm:hover {
		background: color-mix(in srgb, var(--primary) 25%, transparent);
		border-color: color-mix(in srgb, var(--primary) 45%, transparent);
	}

	.newmatch-btn:active {
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
			height: 44px;
			padding: 0 0.95rem;
			gap: 0.4rem;
		}

		.floating-btn-label {
			font-size: 0.78rem;
		}

		.tournament-button {
			left: auto;
			right: 1.5rem;
		}

		.invite-button {
			right: 8.5rem;
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
			height: 40px;
			padding: 0 0.85rem;
			gap: 0.35rem;
		}

		.floating-btn-label {
			font-size: 0.72rem;
		}

		.tournament-button {
			left: auto;
			right: 1rem;
		}

		.invite-button {
			right: 8rem;
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
