<script lang="ts">
	import { tick } from 'svelte';
	import { QrCode } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { theme } from '$lib/stores/theme';
	import { currentUser } from '$lib/firebase/auth';
	import QRScanner from './QRScanner.svelte';
	import { getTournamentByKey } from '$lib/firebase/tournaments';
	import {
		getPendingMatchesForUser,
		getAllPendingMatches,
		startTournamentMatch,
		resumeTournamentMatch,
		type PendingMatchInfo
	} from '$lib/firebase/tournamentMatches';
	import {
		setTournamentContext,
		type TournamentMatchContext
	} from '$lib/stores/tournamentContext';
	import type { Tournament } from '$lib/types/tournament';
	import {
		gameSettings
	} from '$lib/stores/gameSettings';

	interface Props {
		isOpen?: boolean;
		onclose?: () => void;
		onmatchstarted?: (context: TournamentMatchContext) => void;
	}

	let { isOpen = $bindable(false), onclose, onmatchstarted }: Props = $props();

	// Reference to key input for autofocus
	let keyInputElement: HTMLInputElement | undefined = $state();

	// State machine (simplified: removed confirmation step)
	// For non-logged users: key_input → loading → player_selection (with inline confirmation)
	// For logged users: key_input → loading → player_selection (auto-select match, choose side)
	type Step = 'key_input' | 'loading' | 'player_selection' | 'error';
	let currentStep = $state<Step>('key_input');

	// Form state
	let tournamentKey = $state('');
	let tournament = $state<Tournament | null>(null);
	let pendingMatches = $state<PendingMatchInfo[]>([]);
	let selectedMatch = $state<PendingMatchInfo | null>(null);
	let selectedSide = $state<'A' | 'B' | null>(null);
	let errorMessage = $state('');
	let isStarting = $state(false);

	// Matches grouped by status (for non-logged users)
	interface MatchDisplay {
		match: PendingMatchInfo;
		isInProgress: boolean;
	}
	let pendingMatchesList = $state<MatchDisplay[]>([]);
	let inProgressMatchesList = $state<MatchDisplay[]>([]);

	// Matches grouped by group (for multi-group tournaments)
	interface GroupedMatches {
		groupId: string;
		groupName: string;
		currentRound: number;
		totalRounds: number;
		matches: MatchDisplay[];
	}
	let pendingMatchesByGroup = $state<GroupedMatches[]>([]);
	let inProgressMatchesByGroup = $state<GroupedMatches[]>([]);
	let hasMultipleGroups = $state(false);
	let hasSplitDivisions = $state(false);  // True when in FINAL_STAGE with SPLIT_DIVISIONS mode (Oro/Plata)

	// Show/hide tournament key
	let showKey = $state(false);

	// QR Scanner state
	let showScanner = $state(false);

	// Track if selected match is being resumed (IN_PROGRESS)
	let isResumingMatch = $state(false);

	// Accordion state for in-progress matches
	let showInProgressMatches = $state(false);

	// Round Robin current round info
	let rrCurrentRound = $state(0);
	let rrTotalRounds = $state(0);

	// Reactive: check if user is logged in
	let isLoggedIn = $derived(!!$currentUser);

	// Track if we're checking a saved key
	let isCheckingSavedKey = $state(false);

	// When modal opens, check for saved tournament key
	$effect(() => {
		if (isOpen && currentStep === 'key_input' && !isCheckingSavedKey) {
			checkSavedTournamentKey();
		}
	});

	// Autofocus key input when modal opens (only if not checking saved key)
	$effect(() => {
		if (isOpen && currentStep === 'key_input' && !isCheckingSavedKey) {
			// Use tick to wait for DOM update, then focus
			tick().then(() => {
				keyInputElement?.focus();
			});
		}
	});

	function getSavedTournamentKey(): string | null {
		return $gameSettings.tournamentKey || null;
	}

	function saveTournamentKey(key: string): void {
		gameSettings.update(s => ({ ...s, tournamentKey: key.toUpperCase() }));
	}

	async function checkSavedTournamentKey() {
		const savedKey = getSavedTournamentKey();
		if (!savedKey) return;

		isCheckingSavedKey = true;
		currentStep = 'loading';

		try {
			const result = await getTournamentByKey(savedKey);

			// Check if tournament exists and is active (IN_PROGRESS or GROUP_STAGE or FINAL_STAGE)
			if (result && result.status !== 'COMPLETED' && result.status !== 'CANCELLED' && result.status !== 'DRAFT') {
				// Tournament is active, use the saved key
				tournamentKey = savedKey;
				await searchTournament();
			} else {
				// Tournament not found or not active, clear saved key and show key input
				console.log('🔑 Saved tournament key no longer active, clearing...');
				gameSettings.update(s => ({ ...s, tournamentKey: undefined }));
				currentStep = 'key_input';
				// Keep isCheckingSavedKey = true to prevent reactive block from re-triggering
				// It will be reset in resetState() when modal closes
				tick().then(() => {
					keyInputElement?.focus();
				});
			}
		} catch (error) {
			console.error('Error checking saved tournament key:', error);
			gameSettings.update(s => ({ ...s, tournamentKey: undefined }));
			currentStep = 'key_input';
			tick().then(() => {
				keyInputElement?.focus();
			});
		}
	}

	function close() {
		isOpen = false;
		resetState();
		onclose?.();
	}

	function resetState() {
		currentStep = 'key_input';
		tournamentKey = '';
		tournament = null;
		pendingMatches = [];
		pendingMatchesList = [];
		inProgressMatchesList = [];
		pendingMatchesByGroup = [];
		inProgressMatchesByGroup = [];
		hasMultipleGroups = false;
		hasSplitDivisions = false;
		selectedMatch = null;
		selectedSide = null;
		errorMessage = '';
		isStarting = false;
		showKey = false;
		isResumingMatch = false;
		showInProgressMatches = false;
		rrCurrentRound = 0;
		rrTotalRounds = 0;
		isCheckingSavedKey = false;
	}

	// Translate group name based on language
	// Handles: identifiers (SINGLE_GROUP, GROUP_A), legacy Spanish names, and Swiss
	function translateGroupName(name: string): string {
		if (name === 'Swiss') return m.tournament_swissSystem();
		// New identifier format
		if (name === 'SINGLE_GROUP') return m.tournament_singleGroup();
		const idMatch = name.match(/^GROUP_([A-H])$/);
		if (idMatch) {
			return `${m.tournament_group()} ${idMatch[1]}`;
		}
		// Legacy Spanish format (for existing tournaments)
		if (name === 'Grupo Único') return m.tournament_singleGroup();
		const legacyMatch = name.match(/^Grupo ([A-H])$/);
		if (legacyMatch) {
			return `${m.tournament_group()} ${legacyMatch[1]}`;
		}
		return name;
	}

	// Translate error messages from Firebase functions
	function translateError(error: string | undefined): string {
		if (!error) return m.tournament_errorStarting();
		if (error.includes('already been completed')) return m.tournament_errorMatchCompleted();
		if (error.includes('already in progress')) return m.tournament_errorMatchInProgress();
		if (error.includes('not found')) return m.tournament_errorMatchNotFound();
		return m.tournament_errorStarting();
	}

	function processMatchesForDisplay(result: Tournament, matches: PendingMatchInfo[]) {
		// Reset all lists
		pendingMatchesList = [];
		inProgressMatchesList = [];
		pendingMatchesByGroup = [];
		inProgressMatchesByGroup = [];

		const isRoundRobin = result.status === 'GROUP_STAGE' && result.groupStage?.type === 'ROUND_ROBIN';
		const numGroups = result.groupStage?.groups?.length || 1;
		hasMultipleGroups = numGroups > 1;

		if (isRoundRobin && result.groupStage?.groups) {
			// For Round Robin with multiple groups, group matches by group and calculate current round per group
			const pendingByGroup = new Map<string, { groupName: string; currentRound: number; totalRounds: number; matches: MatchDisplay[] }>();
			const inProgressByGroup = new Map<string, { groupName: string; currentRound: number; totalRounds: number; matches: MatchDisplay[] }>();

			// Calculate current round for each group
			for (const group of result.groupStage.groups) {
				if (!group.schedule) continue;

				const totalRounds = group.schedule.length;
				let currentRound = 0;

				// Find the first round with pending/in-progress matches
				for (const round of group.schedule) {
					const hasPending = round.matches.some(m => m.status === 'PENDING' || m.status === 'IN_PROGRESS');
					if (hasPending) {
						currentRound = round.roundNumber;
						break;
					}
				}

				// Store for later use - translate group name for display
				const translatedName = translateGroupName(group.name);
				pendingByGroup.set(group.id, { groupName: translatedName, currentRound, totalRounds, matches: [] });
				inProgressByGroup.set(group.id, { groupName: translatedName, currentRound, totalRounds, matches: [] });
			}

			// Distribute matches to their groups, filtering by current round
			for (const match of matches) {
				const groupId = match.groupId || '';
				const groupData = pendingByGroup.get(groupId);
				if (!groupData) continue;

				// Only include matches from the current round of this group
				if (match.roundNumber !== groupData.currentRound) continue;

				const isInProgress = match.isInProgress || false;
				const matchDisplay: MatchDisplay = { match, isInProgress };

				if (isInProgress) {
					inProgressByGroup.get(groupId)?.matches.push(matchDisplay);
				} else {
					pendingByGroup.get(groupId)?.matches.push(matchDisplay);
				}
			}

			// Sort function by table number
			const sortByTable = (a: MatchDisplay, b: MatchDisplay) =>
				(a.match.tableNumber || 999) - (b.match.tableNumber || 999);

			// Convert maps to arrays, only including groups with matches, and sort matches by table
			pendingMatchesByGroup = Array.from(pendingByGroup.entries())
				.filter(([_, data]) => data.matches.length > 0)
				.map(([groupId, data]) => ({
					groupId,
					groupName: data.groupName,
					currentRound: data.currentRound,
					totalRounds: data.totalRounds,
					matches: data.matches.sort(sortByTable)
				}))
				.sort((a, b) => a.groupName.localeCompare(b.groupName));

			inProgressMatchesByGroup = Array.from(inProgressByGroup.entries())
				.filter(([_, data]) => data.matches.length > 0)
				.map(([groupId, data]) => ({
					groupId,
					groupName: data.groupName,
					currentRound: data.currentRound,
					totalRounds: data.totalRounds,
					matches: data.matches.sort(sortByTable)
				}))
				.sort((a, b) => a.groupName.localeCompare(b.groupName));

			// Also populate flat lists (for single group or fallback)
			if (!hasMultipleGroups && result.groupStage?.groups?.[0]?.schedule) {
				const schedule = result.groupStage.groups[0].schedule;
				rrTotalRounds = schedule.length;
				rrCurrentRound = pendingByGroup.get(result.groupStage.groups[0].id)?.currentRound || 0;
			}

			// Flatten for single group display (already sorted within groups)
			pendingMatchesList = pendingMatchesByGroup.flatMap(g => g.matches);
			inProgressMatchesList = inProgressMatchesByGroup.flatMap(g => g.matches);

		} else {
			// Check if we're in FINAL_STAGE with SPLIT_DIVISIONS (Oro/Plata)
			const isFinalWithSplit = result.status === 'FINAL_STAGE' &&
				result.finalStage?.mode === 'SPLIT_DIVISIONS' &&
				!!result.finalStage?.silverBracket;

			hasSplitDivisions = isFinalWithSplit;

			if (isFinalWithSplit) {
				// Group matches by Gold/Silver bracket
				const pendingByBracket = new Map<string, { groupName: string; currentRound: number; totalRounds: number; matches: MatchDisplay[] }>();
				const inProgressByBracket = new Map<string, { groupName: string; currentRound: number; totalRounds: number; matches: MatchDisplay[] }>();

				// Initialize Gold and Silver groups
				pendingByBracket.set('gold', { groupName: m.tournament_goldLeague(), currentRound: 0, totalRounds: 0, matches: [] });
				pendingByBracket.set('silver', { groupName: m.tournament_silverLeague(), currentRound: 0, totalRounds: 0, matches: [] });
				inProgressByBracket.set('gold', { groupName: m.tournament_goldLeague(), currentRound: 0, totalRounds: 0, matches: [] });
				inProgressByBracket.set('silver', { groupName: m.tournament_silverLeague(), currentRound: 0, totalRounds: 0, matches: [] });

				// Distribute matches
				for (const match of matches) {
					const bracketId = match.isSilverBracket ? 'silver' : 'gold';
					const isInProgress = match.isInProgress || false;
					const matchDisplay: MatchDisplay = { match, isInProgress };

					if (isInProgress) {
						inProgressByBracket.get(bracketId)?.matches.push(matchDisplay);
					} else {
						pendingByBracket.get(bracketId)?.matches.push(matchDisplay);
					}
				}

				// Sort function by table number
				const sortByTable = (a: MatchDisplay, b: MatchDisplay) =>
					(a.match.tableNumber || 999) - (b.match.tableNumber || 999);

				// Convert maps to arrays, Gold first then Silver
				const bracketOrder = ['gold', 'silver'];
				pendingMatchesByGroup = bracketOrder
					.map(bracketId => {
						const data = pendingByBracket.get(bracketId)!;
						return {
							groupId: bracketId,
							groupName: data.groupName,
							currentRound: data.currentRound,
							totalRounds: data.totalRounds,
							matches: data.matches.sort(sortByTable)
						};
					})
					.filter(g => g.matches.length > 0);

				inProgressMatchesByGroup = bracketOrder
					.map(bracketId => {
						const data = inProgressByBracket.get(bracketId)!;
						return {
							groupId: bracketId,
							groupName: data.groupName,
							currentRound: data.currentRound,
							totalRounds: data.totalRounds,
							matches: data.matches.sort(sortByTable)
						};
					})
					.filter(g => g.matches.length > 0);

				// Also populate flat lists
				pendingMatchesList = pendingMatchesByGroup.flatMap(g => g.matches);
				inProgressMatchesList = inProgressMatchesByGroup.flatMap(g => g.matches);

			} else {
				// Non-RR, non-split: use flat list
				hasSplitDivisions = false;

				for (const match of matches) {
					const isInProgress = match.isInProgress || false;
					const matchDisplay: MatchDisplay = { match, isInProgress };

					if (isInProgress) {
						inProgressMatchesList.push(matchDisplay);
					} else {
						pendingMatchesList.push(matchDisplay);
					}
				}

				// Sort by table number
				const sortByTable = (a: MatchDisplay, b: MatchDisplay) =>
					(a.match.tableNumber || 999) - (b.match.tableNumber || 999);
				pendingMatchesList.sort(sortByTable);
				inProgressMatchesList.sort(sortByTable);
			}
		}
	}

	async function searchTournament() {
		if (tournamentKey.length !== 6) {
			errorMessage = m.tournament_invalidKey();
			currentStep = 'error';
			return;
		}

		currentStep = 'loading';
		errorMessage = '';

		try {
			const result = await getTournamentByKey(tournamentKey.toUpperCase());

			if (!result) {
				errorMessage = m.tournament_notFound();
				currentStep = 'error';
				return;
			}

			// Check tournament status
			if (result.status === 'COMPLETED' || result.status === 'CANCELLED') {
				errorMessage = m.tournament_notActive();
				currentStep = 'error';
				return;
			}

			// Save the tournament key for future use
			saveTournamentKey(tournamentKey);
			isCheckingSavedKey = false;

			tournament = result;

			// Get pending matches
			if (isLoggedIn && $currentUser) {
				pendingMatches = await getPendingMatchesForUser(result, $currentUser.id);

				if (pendingMatches.length === 0) {
					errorMessage = m.tournament_noPendingMatchesUser();
					currentStep = 'error';
					return;
				}

				// Process matches
				processMatchesForDisplay(result, pendingMatches);

				// Go to player_selection (NO auto-select - user picks the match)
				currentStep = 'player_selection';
			} else {
				pendingMatches = await getAllPendingMatches(result);

				if (pendingMatches.length === 0) {
					errorMessage = m.tournament_noPendingMatchesGeneral();
					currentStep = 'error';
					return;
				}

				// Process matches (already sorted by table number)
				processMatchesForDisplay(result, pendingMatches);

				currentStep = 'player_selection';
			}
		} catch (error) {
			console.error('Error searching tournament:', error);
			// Clear saved key on error so user can retry with a different key
			gameSettings.update(s => ({ ...s, tournamentKey: undefined }));
			tournamentKey = '';
			errorMessage = m.tournament_connectionError();
			currentStep = 'error';
		}
	}

	async function selectMatchAndStart(matchDisplay: MatchDisplay) {
		selectedMatch = matchDisplay.match;
		isResumingMatch = matchDisplay.isInProgress;

		// For logged-in users, auto-detect their side
		if (isLoggedIn && $currentUser && tournament) {
			const userParticipant = tournament.participants.find(p => p.userId === $currentUser?.id);
			if (userParticipant) {
				if (selectedMatch.match.participantA === userParticipant.id) {
					selectedSide = 'A';
				} else if ('participantB' in selectedMatch.match && selectedMatch.match.participantB === userParticipant.id) {
					selectedSide = 'B';
				} else {
					// User is not in this match - default to A
					selectedSide = 'A';
				}
			} else {
				selectedSide = 'A';
			}
		} else {
			// Non-logged user - default to A (doesn't matter who they are)
			selectedSide = 'A';
		}

		// Start match immediately
		await startMatch();
	}

	function goBack() {
		if (currentStep === 'player_selection') {
			// Go back to key input
			currentStep = 'key_input';
			tournament = null;
			pendingMatches = [];
			pendingMatchesList = [];
			inProgressMatchesList = [];
			pendingMatchesByGroup = [];
			inProgressMatchesByGroup = [];
			hasMultipleGroups = false;
			hasSplitDivisions = false;
			selectedMatch = null;
			selectedSide = null;
		} else if (currentStep === 'error') {
			currentStep = 'key_input';
			errorMessage = '';
		}
	}

	function refreshMatches() {
		// Reset to key input and clear the saved key field (but keep in localStorage until new one is saved)
		tournamentKey = '';
		tournament = null;
		pendingMatches = [];
		pendingMatchesList = [];
		inProgressMatchesList = [];
		pendingMatchesByGroup = [];
		inProgressMatchesByGroup = [];
		hasMultipleGroups = false;
		hasSplitDivisions = false;
		selectedMatch = null;
		selectedSide = null;
		currentStep = 'key_input';
		tick().then(() => {
			keyInputElement?.focus();
		});
	}

	async function startMatch() {
		if (!tournament || !selectedMatch || !selectedSide) return;

		isStarting = true;

		try {
			const result = await startTournamentMatch(
				tournament.id,
				selectedMatch.match.id,
				selectedMatch.phase,
				selectedMatch.groupId,
				isResumingMatch  // forceResume: allow resuming IN_PROGRESS matches
			);

			if (!result.success) {
				errorMessage = translateError(result.error);
				currentStep = 'error';
				isStarting = false;
				return;
			}

			// Create tournament context
			const participantId = selectedSide === 'A'
				? selectedMatch.match.participantA
				: ('participantB' in selectedMatch.match ? selectedMatch.match.participantB : '');

			// Get existing match data (rounds, gamesWon) for resuming
			// IMPORTANT: When resuming, fetch fresh data from Firebase to get latest rounds
			let existingRounds: any[] = [];
			let gamesWonA = 0;
			let gamesWonB = 0;

			if (isResumingMatch) {
				// Fetch fresh match data from Firebase
				console.log('🔄 Resuming match - fetching fresh data from Firebase...');
				const resumeResult = await resumeTournamentMatch(
					tournament.id,
					selectedMatch.match.id,
					selectedMatch.phase,
					selectedMatch.groupId
				);

				if (resumeResult.success && resumeResult.match) {
					const freshMatch = resumeResult.match as any;
					existingRounds = freshMatch.rounds || [];
					gamesWonA = freshMatch.gamesWonA || 0;
					gamesWonB = freshMatch.gamesWonB || 0;
					console.log('✅ Fresh match data retrieved:', {
						rounds: existingRounds.length,
						gamesWonA,
						gamesWonB
					});
				} else {
					// Fallback to cached data if fresh fetch fails
					console.warn('⚠️ Could not fetch fresh data, using cached match data');
					const match = selectedMatch.match as any;
					existingRounds = match.rounds || [];
					gamesWonA = match.gamesWonA || 0;
					gamesWonB = match.gamesWonB || 0;
				}
			} else {
				// For new matches, use the cached data (should be empty anyway)
				const match = selectedMatch.match as any;
				existingRounds = match.rounds || [];
				gamesWonA = match.gamesWonA || 0;
				gamesWonB = match.gamesWonB || 0;
			}

			console.log('🔍 TournamentMatchModal - Datos del match:', {
				matchId: selectedMatch.match.id,
				isResumingMatch,
				existingRoundsCount: existingRounds.length,
				gamesWonA,
				gamesWonB
			});

			// Calculate current game number from existing rounds
			const maxGameNumber = existingRounds.length > 0
				? Math.max(...existingRounds.map((r: any) => r.gameNumber || 1))
				: 1;

			// Determine bracket type (gold or silver) - consolation matches belong to their parent bracket
			const bracketType: 'gold' | 'silver' | undefined =
				selectedMatch.isSilverBracket ? 'silver' :
				selectedMatch.phase === 'FINAL' ? 'gold' : undefined;

			const context: TournamentMatchContext = {
				tournamentId: tournament.id,
				tournamentKey: tournament.key,
				tournamentName: tournament.name,
				matchId: selectedMatch.match.id,
				phase: selectedMatch.phase,
				roundNumber: selectedMatch.roundNumber,
				totalRounds: tournament.groupStage?.totalRounds,
				groupId: selectedMatch.groupId,
				groupName: selectedMatch.groupName,
				groupStageType: tournament.groupStage?.type,
				bracketRoundName: selectedMatch.bracketRoundName,
				bracketType,
				isConsolation: selectedMatch.isConsolation || false,
				participantAId: selectedMatch.match.participantA || '',
				participantBId: 'participantB' in selectedMatch.match ? selectedMatch.match.participantB || '' : '',
				participantAName: selectedMatch.participantAName,
				participantBName: selectedMatch.participantBName,
				participantAPhotoURL: selectedMatch.participantAPhotoURL,
				participantBPhotoURL: selectedMatch.participantBPhotoURL,
				participantAPartnerPhotoURL: selectedMatch.participantAPartnerPhotoURL,
				participantBPartnerPhotoURL: selectedMatch.participantBPartnerPhotoURL,
				currentUserId: $currentUser?.id,
				currentUserParticipantId: participantId,
				currentUserSide: selectedSide,
				gameConfig: selectedMatch.gameConfig,
				matchStartedAt: Date.now(),
				existingRounds: existingRounds.length > 0 ? existingRounds : undefined,
				currentGameData: (gamesWonA > 0 || gamesWonB > 0 || existingRounds.length > 0) ? {
					gamesWonA,
					gamesWonB,
					currentGameNumber: maxGameNumber
				} : undefined
			};

			console.log('📦 Context creado para /game:', {
				bracketRoundName: context.bracketRoundName,
				phase: context.phase,
				isConsolation: selectedMatch.isConsolation,
				existingRounds: context.existingRounds,
				currentGameData: context.currentGameData,
				participantAPhotoURL: context.participantAPhotoURL,
				participantBPhotoURL: context.participantBPhotoURL,
				participantAPartnerPhotoURL: context.participantAPartnerPhotoURL,
				participantBPartnerPhotoURL: context.participantBPartnerPhotoURL
			});

			setTournamentContext(context);

			// Notify game page via callback
			onmatchstarted?.(context);
			close();
		} catch (error) {
			console.error('Error starting match:', error);
			errorMessage = m.tournament_connectionError();
			currentStep = 'error';
		} finally {
			isStarting = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			close();
		}
		if (event.key === 'Enter' && currentStep === 'key_input' && tournamentKey.length === 6) {
			searchTournament();
		}
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}

	function toggleShowKey() {
		showKey = !showKey;
	}

	function handleScanResult(data: string) {
		// Extract tournament key from scanned data
		const key = extractKeyFromScan(data);
		if (key && key.length === 6) {
			tournamentKey = key.toUpperCase();
			showScanner = false;
			searchTournament();
		}
	}

	function extractKeyFromScan(data: string): string | null {
		// If it's a URL, extract the key parameter
		if (data.includes('key=')) {
			const match = data.match(/[?&]key=([A-Za-z0-9]{6})/);
			return match ? match[1] : null;
		}
		// If it's a direct 6-char code
		if (/^[A-Za-z0-9]{6}$/.test(data.trim())) {
			return data.trim();
		}
		return null;
	}

	function toggleInProgressMatches() {
		showInProgressMatches = !showInProgressMatches;
	}

	// Unused function removed or commented out
	/* function formatGameConfig(config: PendingMatchInfo['gameConfig']): string {
		const points = m.scoring_points();
		const rounds = m.scoring_rounds();
		const bestOf = m.tournament_bestOf({ games: String(config.matchesToWin) });

		if (config.gameMode === 'points') {
			return `${config.pointsToWin} ${points}, ${bestOf}`;
		} else {
			return `${config.roundsToPlay} ${rounds}, ${bestOf}`;
		}
	} */

	// Get current phase game configuration (default final config for backward compatibility)
	// Unused function removed or commented out
	/* function getCurrentPhaseConfig(t: Tournament): { gameMode: 'points' | 'rounds'; pointsToWin?: number; roundsToPlay?: number; matchesToWin: number } | null {
		if (t.status === 'GROUP_STAGE' && t.groupStage) {
			return {
				gameMode: t.groupStage.gameMode,
				pointsToWin: t.groupStage.pointsToWin,
				roundsToPlay: t.groupStage.roundsToPlay,
				matchesToWin: t.groupStage.matchesToWin
			};
		} else if ((t.status === 'FINAL_STAGE' || t.phaseType === 'ONE_PHASE') && t.finalStage?.goldBracket?.config) {
			// Return the final phase config as default
			const finalConfig = t.finalStage.goldBracket.config.final;
			return {
				gameMode: finalConfig.gameMode,
				pointsToWin: finalConfig.pointsToWin,
				roundsToPlay: finalConfig.roundsToPlay,
				matchesToWin: finalConfig.matchesToWin
			};
		}
		return null;
	} */
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" data-theme={$theme} onclick={close}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal" onclick={stopPropagation}>
			<div class="modal-header">
				<div class="header-icon">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
						<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
						<path d="M4 22h16"></path>
						<path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
						<path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
						<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
					</svg>
				</div>
				<span class="modal-title">
					{#if currentStep === 'key_input' || currentStep === 'error'}
						{m.tournament_playMatch()}
					{:else if currentStep === 'loading'}
						{m.tournament_searching()}
					{:else if currentStep === 'player_selection'}
						{m.tournament_selectYourMatch()}
					{/if}
				</span>
				<button class="close-btn" onclick={close} aria-label="Close">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>

			<div class="modal-content">
				<!-- Step: Key Input -->
				{#if currentStep === 'key_input'}
					<div class="step-content key-step">
						<div class="key-icon-wrapper">
							<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="7.5" cy="15.5" r="5.5"></circle>
								<path d="m21 2-9.6 9.6"></path>
								<path d="m15.5 7.5 3 3L22 7l-3-3"></path>
							</svg>
						</div>

						<p class="key-description">{m.tournament_enterKey()}</p>
						<p class="key-hint">{m.tournament_keyHint()}</p>

						<div class="key-input-group">
							<!-- QR Scanner Button -->
							<button
								class="scan-btn"
								onclick={() => showScanner = true}
								title={m.tournament_scanQR()}
								aria-label={m.tournament_scanQR()}
							>
								<QrCode size={18} />
							</button>
							<div class="key-input-wrapper">
								<input
									type="text"
									class="key-input"
									class:masked={!showKey}
									bind:this={keyInputElement}
									bind:value={tournamentKey}
									placeholder="ABC123"
									maxlength="6"
									autocomplete="off"
									autocapitalize="characters"
								/>
								<button
									type="button"
									class="toggle-key-btn"
									onclick={toggleShowKey}
									aria-label={showKey ? m.tournament_hideKey() : m.tournament_showKey()}
								>
									{#if showKey}
										<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
											<line x1="1" y1="1" x2="23" y2="23"></line>
										</svg>
									{:else}
										<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
											<circle cx="12" cy="12" r="3"></circle>
										</svg>
									{/if}
								</button>
							</div>

							<button
								class="search-btn"
								disabled={tournamentKey.length !== 6}
								onclick={searchTournament}
								aria-label="Search tournament"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="9 18 15 12 9 6"></polyline>
								</svg>
							</button>
						</div>
					</div>

				<!-- Step: Loading -->
				{:else if currentStep === 'loading'}
					<div class="step-content loading">
						<div class="spinner-container">
							<div class="spinner"></div>
						</div>
						<p class="loading-text">{m.tournament_searchingTournament()}</p>
					</div>

				<!-- Step: Match Selection -->
				{:else if currentStep === 'player_selection' && tournament}
					<div class="step-content match-selection-content">
						<div class="match-selection-header">
							<!-- Tournament Title with Phase and Config Badges -->
							<div class="tournament-title-row">
								<p class="tournament-name">
									{#if tournament.edition}
										<span class="edition-number">#{tournament.edition}</span>
									{/if}
									{tournament.name}
								</p>
								<button
									class="refresh-matches-btn"
									onclick={refreshMatches}
									title={m.tournament_refreshMatches()}
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="23 4 23 10 17 10"></polyline>
										<polyline points="1 20 1 14 7 14"></polyline>
										<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
									</svg>
								</button>
							</div>

							<!-- Phase Badge -->
							<div class="badges-row">
								<!-- Game Type Badge (Singles/Doubles) -->
								<span class="game-type-badge" class:doubles={tournament.gameType === 'doubles'}>
									{tournament.gameType === 'doubles' ? m.admin_doubles() : m.admin_singles()}
								</span>
								{#if tournament.status === 'GROUP_STAGE'}
									<span class="phase-badge group-stage">{m.tournament_groupStage()}</span>
									{#if tournament.groupStage?.type === 'SWISS'}
										<span class="config-badge">SS · R{tournament.groupStage.currentRound}/{tournament.groupStage.totalRounds}</span>
									{:else if tournament.groupStage?.type === 'ROUND_ROBIN' && rrCurrentRound > 0 && !hasMultipleGroups}
										<span class="config-badge">R{rrCurrentRound}/{rrTotalRounds}</span>
									{/if}
								{/if}
							</div>
						</div>

						<!-- Show list of matches - click to start immediately -->
						<!-- Multi-group display (Round Robin groups or Oro/Plata brackets) -->
						{#if (hasMultipleGroups || hasSplitDivisions) && pendingMatchesByGroup.length > 0}
							<div class="groups-container">
								{#each pendingMatchesByGroup as group}
									<div class="group-section">
										<div class="group-header" class:gold-league={group.groupId === 'gold'} class:silver-league={group.groupId === 'silver'}>
											<span class="group-name">{group.groupName}</span>
											{#if group.currentRound > 0}
												<span class="group-round">{m.scoring_round()} {group.currentRound}/{group.totalRounds}</span>
											{/if}
										</div>
										<div class="matches-list">
											{#each group.matches as matchDisplay}
												<button
													class="match-row-btn two-rows"
													class:no-table={!matchDisplay.match.tableNumber}
													disabled={isStarting || !matchDisplay.match.tableNumber}
													onclick={() => selectMatchAndStart(matchDisplay)}
												>
													<div class="match-row-top">
														{#if hasSplitDivisions && matchDisplay.match.bracketRoundName}
															<span class="bracket-round">{matchDisplay.match.bracketRoundName}</span>
														{/if}
														<span class="table-num" class:tbd={!matchDisplay.match.tableNumber}>{matchDisplay.match.tableNumber ? `${m.tournament_tableShort()}${matchDisplay.match.tableNumber}` : 'TBD'}</span>
														<span class="match-config">
															{#if matchDisplay.match.gameConfig.gameMode === 'points'}
																{matchDisplay.match.gameConfig.pointsToWin}P
															{:else}
																{matchDisplay.match.gameConfig.roundsToPlay}R
															{/if}
															{#if matchDisplay.match.gameConfig.matchesToWin > 1}{m.bracket_bestOf()}{matchDisplay.match.gameConfig.matchesToWin}{/if}
														</span>
													</div>
													<div class="match-row-bottom">
														<span class="player-with-avatar left">
															{#if matchDisplay.match.participantAPhotoURL}
																<img src={matchDisplay.match.participantAPhotoURL} alt="" class="player-avatar" />
															{/if}
															{#if matchDisplay.match.participantAPartnerPhotoURL}
																<img src={matchDisplay.match.participantAPartnerPhotoURL} alt="" class="player-avatar" />
															{/if}
															<span class="player-name">{matchDisplay.match.participantAName}</span>
														</span>
														<span class="vs-badge">vs</span>
														<span class="player-with-avatar right">
															<span class="player-name">{matchDisplay.match.participantBName}</span>
															{#if matchDisplay.match.participantBPartnerPhotoURL}
																<img src={matchDisplay.match.participantBPartnerPhotoURL} alt="" class="player-avatar" />
															{/if}
															{#if matchDisplay.match.participantBPhotoURL}
																<img src={matchDisplay.match.participantBPhotoURL} alt="" class="player-avatar" />
															{/if}
														</span>
													</div>
												</button>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						<!-- Single group or non-RR display -->
						{:else if pendingMatchesList.length > 0}
							<div class="matches-list">
								{#each pendingMatchesList as matchDisplay}
									<button
										class="match-row-btn two-rows"
										class:no-table={!matchDisplay.match.tableNumber}
										disabled={isStarting || !matchDisplay.match.tableNumber}
										onclick={() => selectMatchAndStart(matchDisplay)}
									>
										<div class="match-row-top">
											{#if matchDisplay.match.bracketRoundName}
												<span class="bracket-round">{matchDisplay.match.bracketRoundName}</span>
											{/if}
											<span class="table-num" class:tbd={!matchDisplay.match.tableNumber}>{matchDisplay.match.tableNumber ? `${m.tournament_tableShort()}${matchDisplay.match.tableNumber}` : 'TBD'}</span>
											<span class="match-config">
												{#if matchDisplay.match.gameConfig.gameMode === 'points'}
													{matchDisplay.match.gameConfig.pointsToWin}P
												{:else}
													{matchDisplay.match.gameConfig.roundsToPlay}R
												{/if}
												{#if matchDisplay.match.gameConfig.matchesToWin > 1}{m.bracket_bestOf()}{matchDisplay.match.gameConfig.matchesToWin}{/if}
											</span>
										</div>
										<div class="match-row-bottom">
											<span class="player-with-avatar left">
												{#if matchDisplay.match.participantAPhotoURL}
													<img src={matchDisplay.match.participantAPhotoURL} alt="" class="player-avatar" />
												{/if}
												{#if matchDisplay.match.participantAPartnerPhotoURL}
													<img src={matchDisplay.match.participantAPartnerPhotoURL} alt="" class="player-avatar" />
												{/if}
												<span class="player-name">{matchDisplay.match.participantAName}</span>
											</span>
											<span class="vs-badge">vs</span>
											<span class="player-with-avatar right">
												<span class="player-name">{matchDisplay.match.participantBName}</span>
												{#if matchDisplay.match.participantBPartnerPhotoURL}
													<img src={matchDisplay.match.participantBPartnerPhotoURL} alt="" class="player-avatar" />
												{/if}
												{#if matchDisplay.match.participantBPhotoURL}
													<img src={matchDisplay.match.participantBPhotoURL} alt="" class="player-avatar" />
												{/if}
											</span>
										</div>
									</button>
								{/each}
							</div>
						{/if}

						<!-- In-progress matches (accordion) -->
						{#if inProgressMatchesList.length > 0}
							<div class="in-progress-section">
								<button
									class="in-progress-accordion"
									class:expanded={showInProgressMatches}
									onclick={toggleInProgressMatches}
								>
									<span class="accordion-icon">
										<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
											{#if showInProgressMatches}
												<path d="M7 10l5 5 5-5z"/>
											{:else}
												<path d="M10 17l5-5-5-5z"/>
											{/if}
										</svg>
									</span>
									<span class="accordion-title">
										{m.tournament_matchesInProgress()} ({inProgressMatchesList.length})
									</span>
									<span class="accordion-warning">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
											<line x1="12" y1="9" x2="12" y2="13"></line>
											<line x1="12" y1="17" x2="12.01" y2="17"></line>
										</svg>
									</span>
								</button>

								{#if showInProgressMatches}
									<div class="in-progress-content">
										<p class="in-progress-hint">{m.tournament_inProgressWarning()}</p>
										<!-- Multi-group in-progress display (Round Robin groups or Oro/Plata brackets) -->
										{#if (hasMultipleGroups || hasSplitDivisions) && inProgressMatchesByGroup.length > 0}
											<div class="groups-container in-progress">
												{#each inProgressMatchesByGroup as group}
													<div class="group-section">
														<div class="group-header in-progress" class:gold-league={group.groupId === 'gold'} class:silver-league={group.groupId === 'silver'}>
															<span class="group-name">{group.groupName}</span>
															{#if group.currentRound > 0}
																<span class="group-round">{m.scoring_round()} {group.currentRound}/{group.totalRounds}</span>
															{/if}
														</div>
														<div class="matches-list in-progress">
															{#each group.matches as matchDisplay}
																<button
																	class="match-row-btn in-progress two-rows"
																	disabled={isStarting}
																	onclick={() => selectMatchAndStart(matchDisplay)}
																>
																	<div class="match-row-top">
																		{#if hasSplitDivisions && matchDisplay.match.bracketRoundName}
																			<span class="bracket-round">{matchDisplay.match.bracketRoundName}</span>
																		{/if}
																		<span class="table-num" class:tbd={!matchDisplay.match.tableNumber}>{matchDisplay.match.tableNumber ? `${m.tournament_tableShort()}${matchDisplay.match.tableNumber}` : 'TBD'}</span>
																		<span class="match-config">
																			{#if matchDisplay.match.gameConfig.gameMode === 'points'}
																				{matchDisplay.match.gameConfig.pointsToWin}P
																			{:else}
																				{matchDisplay.match.gameConfig.roundsToPlay}R
																			{/if}
																			{#if matchDisplay.match.gameConfig.matchesToWin > 1}{m.bracket_bestOf()}{matchDisplay.match.gameConfig.matchesToWin}{/if}
																		</span>
																	</div>
																	<div class="match-row-bottom">
																		<span class="player-with-avatar left">
																			{#if matchDisplay.match.participantAPhotoURL}
																				<img src={matchDisplay.match.participantAPhotoURL} alt="" class="player-avatar" />
																			{/if}
																			{#if matchDisplay.match.participantAPartnerPhotoURL}
																				<img src={matchDisplay.match.participantAPartnerPhotoURL} alt="" class="player-avatar" />
																			{/if}
																			<span class="player-name">{matchDisplay.match.participantAName}</span>
																		</span>
																		<span class="vs-badge">vs</span>
																		<span class="player-with-avatar right">
																			<span class="player-name">{matchDisplay.match.participantBName}</span>
																			{#if matchDisplay.match.participantBPartnerPhotoURL}
																				<img src={matchDisplay.match.participantBPartnerPhotoURL} alt="" class="player-avatar" />
																			{/if}
																			{#if matchDisplay.match.participantBPhotoURL}
																				<img src={matchDisplay.match.participantBPhotoURL} alt="" class="player-avatar" />
																			{/if}
																		</span>
																	</div>
																</button>
															{/each}
														</div>
													</div>
												{/each}
											</div>
										{:else}
											<div class="matches-list in-progress">
												{#each inProgressMatchesList as matchDisplay}
													<button
														class="match-row-btn in-progress two-rows"
														disabled={isStarting}
														onclick={() => selectMatchAndStart(matchDisplay)}
													>
														<div class="match-row-top">
															{#if matchDisplay.match.bracketRoundName}
																<span class="bracket-round">{matchDisplay.match.bracketRoundName}</span>
															{/if}
															<span class="table-num" class:tbd={!matchDisplay.match.tableNumber}>{matchDisplay.match.tableNumber ? `${m.tournament_tableShort()}${matchDisplay.match.tableNumber}` : 'TBD'}</span>
															<span class="match-config">
																{#if matchDisplay.match.gameConfig.gameMode === 'points'}
																	{matchDisplay.match.gameConfig.pointsToWin}P
																{:else}
																	{matchDisplay.match.gameConfig.roundsToPlay}R
																{/if}
																{#if matchDisplay.match.gameConfig.matchesToWin > 1}{m.bracket_bestOf()}{matchDisplay.match.gameConfig.matchesToWin}{/if}
															</span>
														</div>
														<div class="match-row-bottom">
															<span class="player-with-avatar left">
																{#if matchDisplay.match.participantAPhotoURL}
																	<img src={matchDisplay.match.participantAPhotoURL} alt="" class="player-avatar" />
																{/if}
																{#if matchDisplay.match.participantAPartnerPhotoURL}
																	<img src={matchDisplay.match.participantAPartnerPhotoURL} alt="" class="player-avatar" />
																{/if}
																<span class="player-name">{matchDisplay.match.participantAName}</span>
															</span>
															<span class="vs-badge">vs</span>
															<span class="player-with-avatar right">
																<span class="player-name">{matchDisplay.match.participantBName}</span>
																{#if matchDisplay.match.participantBPartnerPhotoURL}
																	<img src={matchDisplay.match.participantBPartnerPhotoURL} alt="" class="player-avatar" />
																{/if}
																{#if matchDisplay.match.participantBPhotoURL}
																	<img src={matchDisplay.match.participantBPhotoURL} alt="" class="player-avatar" />
																{/if}
															</span>
														</div>
													</button>
												{/each}
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}

						<!-- Loading indicator when starting -->
						{#if isStarting}
							<div class="starting-indicator">
								<div class="spinner small"></div>
								<span>{m.tournament_starting()}</span>
							</div>
						{/if}
					</div>

				<!-- Step: Error -->
				{:else if currentStep === 'error'}
					<div class="step-content error">
						<div class="error-icon">
							<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10"></circle>
								<line x1="12" y1="8" x2="12" y2="12"></line>
								<line x1="12" y1="16" x2="12.01" y2="16"></line>
							</svg>
						</div>
						<p class="error-message">{errorMessage}</p>

						<button class="retry-btn" onclick={goBack}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="1 4 1 10 7 10"></polyline>
								<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
							</svg>
							{m.tournament_tryAgain()}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- QR Scanner Modal -->
<QRScanner
	bind:isOpen={showScanner}
	onScan={handleScanResult}
	onClose={() => showScanner = false}
/>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.5rem;
		width: min(780px, 96vw);
		max-height: 85vh;
		overflow-y: auto;
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.header-icon {
		width: 36px;
		height: 36px;
		background: rgba(59, 130, 246, 0.15);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #60a5fa;
		flex-shrink: 0;
	}

	.modal-title {
		flex: 1;
		font-family: 'Lexend', sans-serif;
		font-size: 1.1rem;
		font-weight: 600;
		color: #fff;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.5);
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.modal-content {
		display: flex;
		flex-direction: column;
	}

	.step-content {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.step-content.key-step {
		align-items: center;
		padding: 0.5rem 0 1rem;
	}

	.key-icon-wrapper {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
		color: var(--primary);
	}

	.key-description {
		font-family: 'Lexend', sans-serif;
		color: rgba(255, 255, 255, 0.9);
		font-size: 1.05rem;
		font-weight: 500;
		text-align: center;
		margin: 0 0 0.25rem;
	}

	.key-hint {
		font-family: 'Lexend', sans-serif;
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.8rem;
		text-align: center;
		margin: 0 0 1.25rem;
	}

	/* Key Input */
	.key-input-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		max-width: 280px;
	}

	.key-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1;
	}

	.key-input {
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		padding: 0.75rem 2.5rem 0.75rem 1rem;
		font-family: 'Lexend', sans-serif;
		font-size: 1.1rem;
		font-weight: 600;
		text-align: center;
		color: #fff;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		width: 100%;
		transition: all 0.15s ease;
	}

	.key-input:focus {
		outline: none;
		border-color: color-mix(in srgb, var(--primary) 40%, transparent);
		background: color-mix(in srgb, var(--primary) 5%, transparent);
	}

	.key-input::placeholder {
		color: rgba(255, 255, 255, 0.2);
		letter-spacing: 0.15em;
		font-weight: 400;
	}

	.key-input.masked {
		-webkit-text-security: disc;
		font-family: 'Verdana', sans-serif;
		letter-spacing: 0.2em;
	}

	.toggle-key-btn {
		position: absolute;
		right: 0.5rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.35rem;
		color: rgba(255, 255, 255, 0.35);
		transition: color 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toggle-key-btn:hover {
		color: rgba(255, 255, 255, 0.6);
	}

	/* Scan Button */
	.scan-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.scan-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		border-color: rgba(255, 255, 255, 0.2);
	}

	.scan-btn:active {
		transform: scale(0.95);
	}

	/* Search Button */
	.search-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		background: var(--primary);
		border: none;
		border-radius: 10px;
		color: var(--primary-foreground);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.search-btn:hover:not(:disabled) {
		background: var(--primary);
		filter: brightness(1.1);
		transform: translateX(2px);
	}

	.search-btn:active:not(:disabled) {
		transform: scale(0.95);
	}

	.search-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Loading */
	.step-content.loading {
		align-items: center;
		padding: 2.5rem 0;
	}

	.spinner-container {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(59, 130, 246, 0.2);
		border-top-color: #60a5fa;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.loading-text {
		font-family: 'Lexend', sans-serif;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
		margin: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Match Selection Header */
	.match-selection-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.match-selection-header {
		flex-shrink: 0;
		margin-bottom: 1rem;
	}

	.tournament-title-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.tournament-name {
		font-family: 'Lexend', sans-serif;
		color: #60a5fa;
		font-size: 1.05rem;
		font-weight: 600;
		text-align: center;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.edition-number {
		color: rgba(255, 255, 255, 0.4);
		font-weight: 500;
	}

	.refresh-matches-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 50%;
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.4);
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.refresh-matches-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		border-color: rgba(255, 255, 255, 0.2);
	}

	/* Badges Row */
	.badges-row {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.4rem;
		flex-wrap: wrap;
	}

	.phase-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-family: 'Lexend', sans-serif;
		font-size: 0.68rem;
		font-weight: 600;
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.phase-badge.group-stage {
		background: rgba(59, 130, 246, 0.12);
		color: #93c5fd;
		border-color: rgba(59, 130, 246, 0.25);
	}

	.config-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-family: 'Lexend', sans-serif;
		font-size: 0.68rem;
		font-weight: 600;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.55);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.game-type-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-family: 'Lexend', sans-serif;
		font-size: 0.68rem;
		font-weight: 600;
		background: rgba(34, 197, 94, 0.12);
		color: #86efac;
		border: 1px solid rgba(34, 197, 94, 0.25);
	}

	.game-type-badge.doubles {
		background: rgba(168, 85, 247, 0.12);
		color: #d8b4fe;
		border-color: rgba(168, 85, 247, 0.25);
	}

	/* Groups Container */
	.groups-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
		max-height: 350px;
	}

	.groups-container.in-progress {
		max-height: none;
	}

	.group-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.4rem 0.6rem;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.2);
		border-radius: 6px;
	}

	.group-header.in-progress {
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		border-color: color-mix(in srgb, var(--primary) 20%, transparent);
	}

	/* Liga Oro - Gold gradient */
	.group-header.gold-league {
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(217, 119, 6, 0.15) 100%);
		border-color: rgba(251, 191, 36, 0.35);
	}

	.group-header.gold-league .group-name {
		color: #fcd34d;
	}

	/* Liga Plata - Silver gradient */
	.group-header.silver-league {
		background: linear-gradient(135deg, rgba(156, 163, 175, 0.15) 0%, rgba(107, 114, 128, 0.15) 100%);
		border-color: rgba(156, 163, 175, 0.35);
	}

	.group-header.silver-league .group-name {
		color: #d1d5db;
	}

	.group-name {
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		font-weight: 600;
		color: #93c5fd;
	}

	.group-header.in-progress .group-name {
		color: var(--primary);
	}

	.group-round {
		font-family: 'Lexend', sans-serif;
		font-size: 0.7rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		background: rgba(0, 0, 0, 0.2);
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
	}

	/* Match List - Grid Layout */
	.matches-list {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		overflow-y: auto;
		max-height: 320px;
	}

	.group-section .matches-list {
		max-height: none;
		overflow-y: visible;
	}

	@media (max-width: 560px) {
		.matches-list {
			grid-template-columns: 1fr;
		}
	}

	.match-row-btn {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 0.85rem 0.7rem;
		cursor: pointer;
		transition: all 0.15s ease;
		color: #e5e7eb;
	}

	.match-row-btn:hover {
		border-color: rgba(96, 165, 250, 0.4);
		background: rgba(96, 165, 250, 0.06);
	}

	.match-row-btn:active {
		transform: scale(0.995);
	}

	.match-row-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.match-row-btn .table-num {
		font-family: 'Lexend', sans-serif;
		font-size: 0.65rem;
		font-weight: 700;
		color: #fff;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		min-width: 1.8rem;
		text-align: center;
		flex-shrink: 0;
	}

	.match-row-btn .table-num.tbd {
		background: linear-gradient(135deg, #78716c 0%, #57534e 100%);
		color: rgba(255, 255, 255, 0.7);
	}

	.match-row-btn.no-table {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.match-row-btn.no-table:hover {
		border-color: rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
	}

	.match-row-btn .player-with-avatar {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.match-row-btn .player-with-avatar.left {
		justify-content: flex-end;
	}

	.match-row-btn .player-with-avatar.right {
		justify-content: flex-start;
	}

	.match-row-btn .player-name {
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		font-weight: 500;
		color: #e5e7eb;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.match-row-btn .player-avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.match-row-btn .vs-badge {
		font-family: 'Lexend', sans-serif;
		font-size: 0.7rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.4);
		text-transform: uppercase;
		padding: 0.15rem 0.4rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		flex-shrink: 0;
	}

	.match-row-btn .bracket-round {
		font-family: 'Lexend', sans-serif;
		color: var(--primary);
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		padding: 0.15rem 0.35rem;
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		border-radius: 3px;
		flex-shrink: 0;
	}

	/* Two-row layout for matches */
	.match-row-btn.two-rows {
		flex-direction: column;
		align-items: stretch;
		gap: 0.4rem;
		padding: 0.6rem 0.7rem;
	}

	.match-row-top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.match-row-bottom {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.match-config {
		margin-left: auto;
		font-family: 'Lexend', sans-serif;
		font-size: 0.6rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.5);
		background: rgba(255, 255, 255, 0.06);
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		flex-shrink: 0;
	}

	/* In-progress matches */
	.match-row-btn.in-progress {
		border-color: color-mix(in srgb, var(--primary) 25%, transparent);
		background: color-mix(in srgb, var(--primary) 4%, transparent);
	}

	.match-row-btn.in-progress:hover {
		border-color: color-mix(in srgb, var(--primary) 45%, transparent);
		background: color-mix(in srgb, var(--primary) 8%, transparent);
	}

	.match-row-btn.in-progress .table-num {
		background: var(--primary);
	}

	.matches-list.in-progress {
		opacity: 0.95;
	}

	/* In-progress Section */
	.in-progress-section {
		margin-top: 1rem;
	}

	.in-progress-accordion {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
		color: var(--primary);
	}

	.in-progress-accordion:hover {
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		border-color: color-mix(in srgb, var(--primary) 35%, transparent);
	}

	.in-progress-accordion.expanded {
		border-radius: 6px 6px 0 0;
		border-bottom-color: transparent;
	}

	.accordion-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.2s ease;
	}

	.accordion-title {
		flex: 1;
		text-align: left;
		font-family: 'Lexend', sans-serif;
		font-size: 0.8rem;
		font-weight: 500;
	}

	.accordion-warning {
		display: flex;
		align-items: center;
		color: var(--primary);
	}

	.in-progress-content {
		background: color-mix(in srgb, var(--primary) 4%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
		border-top: none;
		border-radius: 0 0 6px 6px;
		padding: 0.75rem;
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-5px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.in-progress-hint {
		font-family: 'Lexend', sans-serif;
		color: var(--primary);
		opacity: 0.7;
		font-size: 0.7rem;
		text-align: center;
		margin: 0 0 0.75rem 0;
		line-height: 1.4;
	}

	/* Starting Indicator */
	.starting-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem;
		font-family: 'Lexend', sans-serif;
		color: #60a5fa;
		font-size: 0.9rem;
	}

	.spinner.small {
		width: 20px;
		height: 20px;
		border-width: 2px;
	}

	/* Error */
	.step-content.error {
		align-items: center;
		text-align: center;
		padding: 1.5rem 0;
		gap: 1rem;
	}

	.error-icon {
		width: 56px;
		height: 56px;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #f87171;
	}

	.error-message {
		font-family: 'Lexend', sans-serif;
		color: #f87171;
		font-size: 0.95rem;
		margin: 0;
		padding: 0 1rem;
		line-height: 1.4;
	}

	.retry-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.65rem 1.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: all 0.15s ease;
		margin-top: 0.5rem;
	}

	.retry-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.retry-btn:active {
		transform: scale(0.98);
	}

	/* Mobile */
	@media (max-width: 600px) {
		.modal {
			padding: 1.25rem;
		}

		.modal-header {
			margin-bottom: 1rem;
			padding-bottom: 0.75rem;
		}

		.header-icon {
			width: 32px;
			height: 32px;
		}

		.header-icon svg {
			width: 16px;
			height: 16px;
		}

		.modal-title {
			font-size: 1rem;
		}

		.key-input {
			font-size: 1rem;
			padding: 0.7rem 2.25rem 0.7rem 0.85rem;
		}

		.key-input-group {
			max-width: 240px;
		}

		.key-icon-wrapper {
			width: 48px;
			height: 48px;
			margin-bottom: 0.75rem;
		}

		.key-icon-wrapper svg {
			width: 24px;
			height: 24px;
		}

		.key-description {
			font-size: 0.95rem;
		}

		.search-btn {
			width: 40px;
			height: 40px;
		}

		.matches-list {
			max-height: 250px;
		}

		.match-row-btn {
			padding: 0.75rem 0.6rem;
			gap: 0.5rem;
		}

		.match-row-btn .table-num {
			font-size: 0.6rem;
			padding: 0.15rem 0.3rem;
			min-width: 1.5rem;
		}

		.match-row-btn .player-name {
			font-size: 0.8rem;
		}

		.match-row-btn .player-avatar {
			width: 20px;
			height: 20px;
		}

		.match-row-btn .player-with-avatar {
			gap: 0.3rem;
		}

		.match-row-btn .vs-badge {
			font-size: 0.65rem;
			padding: 0.1rem 0.3rem;
		}
	}
</style>
