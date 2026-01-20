<script lang="ts">
	import { createEventDispatcher, tick, onMount } from 'svelte';
	import { t } from '$lib/stores/language';
	import { currentUser } from '$lib/firebase/auth';
	import { getTournamentByKey } from '$lib/firebase/tournaments';
	import {
		getPendingMatchesForUser,
		getAllPendingMatches,
		startTournamentMatch,
		type PendingMatchInfo
	} from '$lib/firebase/tournamentMatches';
	import {
		setTournamentContext,
		type TournamentMatchContext
	} from '$lib/stores/tournamentContext';
	import type { Tournament } from '$lib/types/tournament';
	import Button from './Button.svelte';

	export let isOpen: boolean = false;

	// LocalStorage key for saved tournament key
	const TOURNAMENT_KEY_STORAGE = 'tournamentKey';

	// Reference to key input for autofocus
	let keyInputElement: HTMLInputElement;

	const dispatch = createEventDispatcher();

	// State machine (simplified: removed confirmation step)
	// For non-logged users: key_input → loading → player_selection (with inline confirmation)
	// For logged users: key_input → loading → player_selection (auto-select match, choose side)
	type Step = 'key_input' | 'loading' | 'player_selection' | 'error';
	let currentStep: Step = 'key_input';

	// Form state
	let tournamentKey = '';
	let tournament: Tournament | null = null;
	let pendingMatches: PendingMatchInfo[] = [];
	let selectedMatch: PendingMatchInfo | null = null;
	let selectedSide: 'A' | 'B' | null = null;
	let errorMessage = '';
	let isStarting = false;

	// Matches grouped by status (for non-logged users)
	interface MatchDisplay {
		match: PendingMatchInfo;
		isInProgress: boolean;
	}
	let pendingMatchesList: MatchDisplay[] = [];
	let inProgressMatchesList: MatchDisplay[] = [];

	// Show/hide tournament key
	let showKey = false;

	// Track if selected match is being resumed (IN_PROGRESS)
	let isResumingMatch = false;

	// Accordion state for in-progress matches
	let showInProgressMatches = false;

	// Round Robin current round info
	let rrCurrentRound = 0;
	let rrTotalRounds = 0;

	// Reactive: check if user is logged in
	$: isLoggedIn = !!$currentUser;

	// Track if we're checking a saved key
	let isCheckingSavedKey = false;

	// When modal opens, check for saved tournament key
	$: if (isOpen && currentStep === 'key_input' && !isCheckingSavedKey) {
		checkSavedTournamentKey();
	}

	// Autofocus key input when modal opens (only if not checking saved key)
	$: if (isOpen && currentStep === 'key_input' && !isCheckingSavedKey) {
		// Use tick to wait for DOM update, then focus
		tick().then(() => {
			keyInputElement?.focus();
		});
	}

	function getSavedTournamentKey(): string | null {
		if (typeof window === 'undefined') return null;
		return localStorage.getItem(TOURNAMENT_KEY_STORAGE);
	}

	function saveTournamentKey(key: string): void {
		if (typeof window === 'undefined') return;
		localStorage.setItem(TOURNAMENT_KEY_STORAGE, key.toUpperCase());
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
				localStorage.removeItem(TOURNAMENT_KEY_STORAGE);
				currentStep = 'key_input';
				// Keep isCheckingSavedKey = true to prevent reactive block from re-triggering
				// It will be reset in resetState() when modal closes
				tick().then(() => {
					keyInputElement?.focus();
				});
			}
		} catch (error) {
			console.error('Error checking saved tournament key:', error);
			localStorage.removeItem(TOURNAMENT_KEY_STORAGE);
			currentStep = 'key_input';
			tick().then(() => {
				keyInputElement?.focus();
			});
		}
	}

	function close() {
		isOpen = false;
		resetState();
		dispatch('close');
	}

	function resetState() {
		currentStep = 'key_input';
		tournamentKey = '';
		tournament = null;
		pendingMatches = [];
		pendingMatchesList = [];
		inProgressMatchesList = [];
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

	async function searchTournament() {
		if (tournamentKey.length !== 6) {
			errorMessage = $t('invalidTournamentKey');
			currentStep = 'error';
			return;
		}

		currentStep = 'loading';
		errorMessage = '';

		try {
			const result = await getTournamentByKey(tournamentKey.toUpperCase());

			if (!result) {
				errorMessage = $t('tournamentNotFound');
				currentStep = 'error';
				return;
			}

			// Check tournament status
			if (result.status === 'COMPLETED' || result.status === 'CANCELLED') {
				errorMessage = $t('tournamentNotActive');
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
					errorMessage = $t('noPendingMatchesInTournament');
					currentStep = 'error';
					return;
				}

				// Build lists for player_selection view
				pendingMatchesList = [];
				inProgressMatchesList = [];

				// For Round Robin, calculate current round and filter
				const isRoundRobin = result.status === 'GROUP_STAGE' && result.groupStage?.type === 'ROUND_ROBIN';

				if (isRoundRobin && result.groupStage?.groups?.[0]?.schedule) {
					// Calculate total rounds from schedule
					const schedule = result.groupStage.groups[0].schedule;
					rrTotalRounds = schedule.length;

					// Find the first round with pending matches (current round)
					rrCurrentRound = 0;
					for (const round of schedule) {
						const hasPending = round.matches.some(m => m.status === 'PENDING' || m.status === 'IN_PROGRESS');
						if (hasPending) {
							rrCurrentRound = round.roundNumber;
							break;
						}
					}

					// Filter matches to only include current round
					for (const match of pendingMatches) {
						// Only include matches from the current round
						if (match.roundNumber !== rrCurrentRound) continue;

						const isInProgress = match.isInProgress || false;
						const matchDisplay: MatchDisplay = { match, isInProgress };

						if (isInProgress) {
							inProgressMatchesList.push(matchDisplay);
						} else {
							pendingMatchesList.push(matchDisplay);
						}
					}
				} else {
					// Non-RR: include all matches
					for (const match of pendingMatches) {
						const isInProgress = match.isInProgress || false;
						const matchDisplay: MatchDisplay = { match, isInProgress };

						if (isInProgress) {
							inProgressMatchesList.push(matchDisplay);
						} else {
							pendingMatchesList.push(matchDisplay);
						}
					}
				}

				// Go to player_selection (NO auto-select - user picks the match)
				currentStep = 'player_selection';
			} else {
				pendingMatches = await getAllPendingMatches(result);

				if (pendingMatches.length === 0) {
					errorMessage = $t('noPendingMatchesGeneral');
					currentStep = 'error';
					return;
				}

				// Build list of matches (not players)
				// Separate pending from in-progress
				pendingMatchesList = [];
				inProgressMatchesList = [];

				// For Round Robin, calculate current round and filter
				const isRoundRobin = result.status === 'GROUP_STAGE' && result.groupStage?.type === 'ROUND_ROBIN';

				if (isRoundRobin && result.groupStage?.groups?.[0]?.schedule) {
					// Calculate total rounds from schedule
					const schedule = result.groupStage.groups[0].schedule;
					rrTotalRounds = schedule.length;

					// Find the first round with pending matches (current round)
					rrCurrentRound = 0;
					for (const round of schedule) {
						const hasPending = round.matches.some(m => m.status === 'PENDING' || m.status === 'IN_PROGRESS');
						if (hasPending) {
							rrCurrentRound = round.roundNumber;
							break;
						}
					}

					// Filter matches to only include current round
					for (const match of pendingMatches) {
						// Only include matches from the current round
						if (match.roundNumber !== rrCurrentRound) continue;

						const isInProgress = match.isInProgress || false;
						const matchDisplay: MatchDisplay = { match, isInProgress };

						if (isInProgress) {
							inProgressMatchesList.push(matchDisplay);
						} else {
							pendingMatchesList.push(matchDisplay);
						}
					}
				} else {
					// Non-RR: include all matches
					for (const match of pendingMatches) {
						const isInProgress = match.isInProgress || false;
						const matchDisplay: MatchDisplay = { match, isInProgress };

						if (isInProgress) {
							inProgressMatchesList.push(matchDisplay);
						} else {
							pendingMatchesList.push(matchDisplay);
						}
					}
				}

				// Sort by participant names
				const sortByNames = (a: MatchDisplay, b: MatchDisplay) =>
					a.match.participantAName.localeCompare(b.match.participantAName);

				pendingMatchesList.sort(sortByNames);
				inProgressMatchesList.sort(sortByNames);

				currentStep = 'player_selection';
			}
		} catch (error) {
			console.error('Error searching tournament:', error);
			errorMessage = $t('connectionError');
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
			selectedMatch = null;
			selectedSide = null;
		} else if (currentStep === 'error') {
			currentStep = 'key_input';
			errorMessage = '';
		}
	}

	function changeTournament() {
		// Reset to key input and clear the saved key field (but keep in localStorage until new one is saved)
		tournamentKey = '';
		tournament = null;
		pendingMatches = [];
		pendingMatchesList = [];
		inProgressMatchesList = [];
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
				errorMessage = result.error || $t('errorStartingMatch');
				currentStep = 'error';
				isStarting = false;
				return;
			}

			// Create tournament context
			const participantId = selectedSide === 'A'
				? selectedMatch.match.participantA
				: ('participantB' in selectedMatch.match ? selectedMatch.match.participantB : '');

			// Get current user's ranking (only for logged-in users)
			let currentUserRanking: number | undefined;
			if ($currentUser && participantId) {
				const userParticipant = tournament.participants.find(p => p.id === participantId);
				if (userParticipant) {
					currentUserRanking = userParticipant.currentRanking;
				}
			}

			// Get existing match data (rounds, gamesWon) for resuming
			const match = selectedMatch.match as any;
			const existingRounds = match.rounds || [];
			const gamesWonA = match.gamesWonA || 0;
			const gamesWonB = match.gamesWonB || 0;

			console.log('🔍 TournamentMatchModal - Datos del match:', {
				matchId: match.id,
				status: match.status,
				rounds: match.rounds,
				gamesWonA: match.gamesWonA,
				gamesWonB: match.gamesWonB,
				existingRoundsExtracted: existingRounds
			});

			// Calculate current game number from existing rounds
			const maxGameNumber = existingRounds.length > 0
				? Math.max(...existingRounds.map((r: any) => r.gameNumber || 1))
				: 1;

			const context: TournamentMatchContext = {
				tournamentId: tournament.id,
				tournamentKey: tournament.key,
				tournamentName: tournament.name,
				matchId: selectedMatch.match.id,
				phase: selectedMatch.phase,
				roundNumber: selectedMatch.roundNumber,
				groupId: selectedMatch.groupId,
				bracketRoundName: selectedMatch.bracketRoundName,
				participantAId: selectedMatch.match.participantA || '',
				participantBId: 'participantB' in selectedMatch.match ? selectedMatch.match.participantB || '' : '',
				participantAName: selectedMatch.participantAName,
				participantBName: selectedMatch.participantBName,
				currentUserId: $currentUser?.id,
				currentUserParticipantId: participantId,
				currentUserSide: selectedSide,
				currentUserRanking,
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
				existingRounds: context.existingRounds,
				currentGameData: context.currentGameData
			});

			setTournamentContext(context);

			// Dispatch event to notify game page
			dispatch('matchStarted', context);
			close();
		} catch (error) {
			console.error('Error starting match:', error);
			errorMessage = $t('connectionError');
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

	function formatGameConfig(config: PendingMatchInfo['gameConfig']): string {
		const points = $t('points') || 'puntos';
		const rounds = $t('rounds') || 'rondas';
		const bestOf = $t('bestOf') || 'mejor de {games}';

		if (config.gameMode === 'points') {
			return `${config.pointsToWin} ${points}, ${bestOf.replace('{games}', config.matchesToWin.toString())}`;
		} else {
			return `${config.roundsToPlay} ${rounds}, ${bestOf.replace('{games}', config.matchesToWin.toString())}`;
		}
	}

	// Get current phase game configuration
	function getCurrentPhaseConfig(t: Tournament): { gameMode: 'points' | 'rounds'; pointsToWin?: number; roundsToPlay?: number; matchesToWin: number } | null {
		if (t.status === 'GROUP_STAGE' && t.groupStage) {
			return {
				gameMode: t.groupStage.gameMode,
				pointsToWin: t.groupStage.pointsToWin,
				roundsToPlay: t.groupStage.roundsToPlay,
				matchesToWin: t.groupStage.matchesToWin
			};
		} else if ((t.status === 'FINAL_STAGE' || t.phaseType === 'ONE_PHASE') && t.finalStage) {
			return {
				gameMode: t.finalStage.gameMode,
				pointsToWin: t.finalStage.pointsToWin,
				roundsToPlay: t.finalStage.roundsToPlay,
				matchesToWin: t.finalStage.matchesToWin
			};
		}
		return null;
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div class="modal-overlay" on:click={close} on:keydown={handleKeydown} role="button" tabindex="-1">
		<div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog">
			<div class="modal-header">
				<span class="modal-title">
					{#if currentStep === 'key_input'}
						{$t('playTournamentMatch')}
					{:else if currentStep === 'loading'}
						{$t('searching')}
					{:else if currentStep === 'player_selection'}
						{$t('selectYourMatchTitle')}
					{:else if currentStep === 'error'}
						{$t('error')}
					{/if}
				</span>
				<button class="close-btn" on:click={close} aria-label="Close">x</button>
			</div>

			<div class="modal-content">
				<!-- Step: Key Input -->
				{#if currentStep === 'key_input'}
					<div class="step-content">
						<p class="description">{$t('enterTournamentKey')}</p>

						<div class="key-input-container">
							<div class="key-input-wrapper">
								<input
									type="text"
									class="key-input"
									class:masked={!showKey}
									bind:this={keyInputElement}
									bind:value={tournamentKey}
									placeholder="******"
									maxlength="6"
									autocomplete="off"
									autocapitalize="characters"
								/>
								<button
									type="button"
									class="toggle-key-btn"
									on:click={() => showKey = !showKey}
									aria-label={showKey ? $t('hideKey') : $t('showKey')}
								>
									{showKey ? '🙈' : '👁️'}
								</button>
							</div>
						</div>

						<Button
							variant="primary"
							fullWidth
							disabled={tournamentKey.length !== 6}
							on:click={searchTournament}
						>
							{$t('searchTournament')}
						</Button>
					</div>

				<!-- Step: Loading -->
				{:else if currentStep === 'loading'}
					<div class="step-content loading">
						<div class="spinner"></div>
						<p>{$t('searchingTournament')}</p>
					</div>

				<!-- Step: Match Selection -->
				{:else if currentStep === 'player_selection' && tournament}
					<div class="step-content match-selection-content">
						<div class="match-selection-header">
							<!-- Tournament Title with Phase -->
							<div class="tournament-title-row">
								<p class="tournament-name">
									{#if tournament.edition}
										<span class="edition-number">#{tournament.edition}</span>
									{/if}
									{tournament.name}
									{#if tournament.status === 'GROUP_STAGE'}
										<span class="phase-badge group-stage">
											{$t('groupStage')}
										</span>
									{/if}
								</p>
								<button
									class="change-tournament-btn"
									on:click={changeTournament}
									title={$t('changeTournament')}
								>
									↻
								</button>
							</div>

							<!-- Game Config + System Type Row -->
							<div class="config-row">
								{#if tournament.status === 'GROUP_STAGE' && tournament.groupStage?.type === 'SWISS'}
									<!-- Swiss: solo mostrar SS y ronda actual -->
									<span class="config-box">
										SS · {$t('round')} {tournament.groupStage.currentRound}/{tournament.groupStage.totalRounds}
									</span>
								{:else if tournament.status === 'GROUP_STAGE' && tournament.groupStage?.type === 'ROUND_ROBIN' && rrCurrentRound > 0}
									<!-- Round Robin: mostrar ronda actual -->
									<span class="config-box round-highlight">
										{$t('round')} {rrCurrentRound}/{rrTotalRounds}
									</span>
								{:else}
									<!-- Fase Final: mostrar config del juego -->
									{#if getCurrentPhaseConfig(tournament)}
										{@const phaseConfig = getCurrentPhaseConfig(tournament)}
										<span class="config-box">
											{#if phaseConfig?.gameMode === 'points'}
												{phaseConfig.pointsToWin} {$t('points')}
											{:else}
												{phaseConfig?.roundsToPlay} {$t('rounds')}
											{/if}
											·
											{#if phaseConfig?.matchesToWin === 1}
												1 {$t('game')}
											{:else}
												{$t('bestOf').replace('{games}', String(phaseConfig?.matchesToWin))}
											{/if}
										</span>
									{/if}
								{/if}
							</div>
						</div>

						<!-- Show list of matches - click to start immediately -->
						<!-- Pending matches (normal) -->
						{#if pendingMatchesList.length > 0}
							<div class="matches-list-container">
								{#each pendingMatchesList as matchDisplay}
									<button
										class="match-item-btn"
										disabled={isStarting}
										on:click={() => selectMatchAndStart(matchDisplay)}
									>
										{#if matchDisplay.match.bracketRoundName}
											<span class="match-round-name">{matchDisplay.match.bracketRoundName}</span>
										{/if}
										<span class="match-player">{matchDisplay.match.participantAName}</span>
										<span class="match-vs">vs</span>
										<span class="match-player">{matchDisplay.match.participantBName}</span>
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
									on:click={() => showInProgressMatches = !showInProgressMatches}
								>
									<span class="accordion-icon">{showInProgressMatches ? '▼' : '▶'}</span>
									<span class="accordion-title">
										{$t('matchesInProgress')} ({inProgressMatchesList.length})
									</span>
									<span class="accordion-warning">⚠️</span>
								</button>

								{#if showInProgressMatches}
									<div class="in-progress-content">
										<p class="in-progress-hint">{$t('inProgressWarning')}</p>
										<div class="matches-list-container in-progress">
											{#each inProgressMatchesList as matchDisplay}
												<button
													class="match-item-btn in-progress"
													disabled={isStarting}
													on:click={() => selectMatchAndStart(matchDisplay)}
												>
													{#if matchDisplay.match.bracketRoundName}
														<span class="match-round-name">{matchDisplay.match.bracketRoundName}</span>
													{/if}
													<span class="match-player">{matchDisplay.match.participantAName}</span>
													<span class="match-vs">vs</span>
													<span class="match-player">{matchDisplay.match.participantBName}</span>
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}

						<!-- Loading indicator when starting -->
						{#if isStarting}
							<div class="starting-indicator">
								<div class="spinner small"></div>
								<span>{$t('starting')}</span>
							</div>
						{/if}
					</div>

				<!-- Step: Error -->
				{:else if currentStep === 'error'}
					<div class="step-content error">
						<div class="error-icon">!</div>
						<p class="error-message">{errorMessage}</p>

						<Button variant="secondary" fullWidth on:click={goBack}>
							{$t('tryAgain')}
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: #1a1f35;
		padding: 1.5rem;
		border-radius: 12px;
		max-width: 90%;
		width: 550px;
		max-height: 85vh;
		overflow-y: auto;
		position: relative;
		border: 2px solid rgba(0, 255, 136, 0.3);
	}

	.modal-header {
		margin-bottom: 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.modal-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: #fff;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #fff;
		line-height: 1;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.close-btn:hover {
		transform: scale(1.1);
	}

	.modal-content {
		display: flex;
		flex-direction: column;
	}

	.step-content {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.description {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.95rem;
		text-align: center;
		margin: 0;
	}

	.key-input-container {
		display: flex;
		justify-content: center;
	}

	.key-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
	}

	.key-input {
		background: rgba(0, 0, 0, 0.3);
		border: 2px solid rgba(0, 255, 136, 0.3);
		border-radius: 8px;
		padding: 1rem 3rem 1rem 1.5rem;
		font-size: 1.75rem;
		font-weight: 700;
		text-align: center;
		color: #fff;
		letter-spacing: 0.4em;
		text-transform: uppercase;
		width: 100%;
		transition: border-color 0.2s;
	}

	.key-input:focus {
		outline: none;
		border-color: var(--accent-green, #00ff88);
	}

	.key-input::placeholder {
		color: rgba(255, 255, 255, 0.3);
		letter-spacing: 0.3em;
	}

	.key-input.masked {
		-webkit-text-security: disc;
		text-security: disc;
		font-family: 'Verdana', sans-serif;
		letter-spacing: 0.25em;
	}

	.toggle-key-btn {
		position: absolute;
		right: 0.5rem;
		background: none;
		border: none;
		font-size: 1.25rem;
		cursor: pointer;
		padding: 0.25rem;
		opacity: 0.7;
		transition: opacity 0.2s;
	}

	.toggle-key-btn:hover {
		opacity: 1;
	}

	/* Loading */
	.step-content.loading {
		align-items: center;
		padding: 2rem 0;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid rgba(0, 255, 136, 0.2);
		border-top-color: var(--accent-green, #00ff88);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Tournament Title Row */
	.tournament-title-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.tournament-name {
		color: var(--accent-green, #00ff88);
		font-size: 1.15rem;
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
		color: rgba(255, 255, 255, 0.5);
		font-weight: 500;
	}

	.change-tournament-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 50%;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.6);
		font-size: 1rem;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.change-tournament-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		color: #fff;
		border-color: rgba(255, 255, 255, 0.4);
	}

	.phase-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.phase-badge.group-stage {
		background: rgba(33, 150, 243, 0.15);
		color: #90caf9;
		border: 1px solid rgba(33, 150, 243, 0.3);
	}

	.phase-badge.final-stage {
		background: rgba(255, 152, 0, 0.15);
		color: #ffcc80;
		border: 1px solid rgba(255, 152, 0, 0.3);
	}

	/* Config Row (game config + system type) */
	.config-row {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.config-box {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.65rem;
		background: rgba(0, 0, 0, 0.25);
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.75);
		font-size: 0.8rem;
		font-weight: 500;
	}

	.config-box.round-highlight {
		background: rgba(0, 188, 212, 0.2);
		border: 1px solid rgba(0, 188, 212, 0.4);
		color: #80deea;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.system-box {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.65rem;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 600;
		background: rgba(156, 39, 176, 0.15);
		color: #ce93d8;
		border: 1px solid rgba(156, 39, 176, 0.3);
	}

	.system-box.swiss {
		background: rgba(156, 39, 176, 0.15);
		color: #ce93d8;
		border: 1px solid rgba(156, 39, 176, 0.3);
	}

	.system-box.round-robin {
		background: rgba(0, 188, 212, 0.15);
		color: #80deea;
		border: 1px solid rgba(0, 188, 212, 0.3);
	}

	/* Match Selection */
	.match-selection-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.match-selection-header {
		flex-shrink: 0;
		margin-bottom: 0.5rem;
	}

	.matches-list-container {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
		overflow-y: auto;
		max-height: 300px;
	}

	@media (max-width: 500px) {
		.matches-list-container {
			grid-template-columns: 1fr;
		}
	}

	.match-item-btn {
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.75rem 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		text-align: center;
	}

	.match-item-btn:hover {
		border-color: rgba(0, 255, 136, 0.5);
		background: rgba(0, 255, 136, 0.05);
	}

	.match-player {
		color: #fff;
		font-size: 0.95rem;
		font-weight: 500;
	}

	.match-vs {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.8rem;
		font-weight: 400;
	}

	.match-round-name {
		color: #ffcc80;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.15rem 0.4rem;
		background: rgba(255, 152, 0, 0.15);
		border-radius: 3px;
		margin-bottom: 0.15rem;
	}

	.match-item-btn.in-progress {
		border-color: rgba(255, 193, 7, 0.3);
	}

	.match-item-btn.in-progress:hover {
		border-color: rgba(255, 193, 7, 0.6);
		background: rgba(255, 193, 7, 0.1);
	}

	/* In-progress matches section (accordion) */
	.in-progress-section {
		margin-top: 1rem;
	}

	.in-progress-accordion {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		background: rgba(255, 193, 7, 0.08);
		border: 1px solid rgba(255, 193, 7, 0.25);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		color: rgba(255, 193, 7, 0.9);
	}

	.in-progress-accordion:hover {
		background: rgba(255, 193, 7, 0.12);
		border-color: rgba(255, 193, 7, 0.4);
	}

	.in-progress-accordion.expanded {
		border-radius: 6px 6px 0 0;
		border-bottom-color: transparent;
	}

	.accordion-icon {
		font-size: 0.7rem;
		transition: transform 0.2s;
	}

	.accordion-title {
		flex: 1;
		text-align: left;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.accordion-warning {
		font-size: 0.9rem;
	}

	.in-progress-content {
		background: rgba(255, 193, 7, 0.05);
		border: 1px solid rgba(255, 193, 7, 0.25);
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
		color: rgba(255, 193, 7, 0.8);
		font-size: 0.75rem;
		text-align: center;
		margin: 0 0 0.75rem 0;
		line-height: 1.4;
	}

	.matches-list-container.in-progress {
		opacity: 0.9;
	}

	/* Starting indicator */
	.starting-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem;
		color: var(--accent-green, #00ff88);
		font-size: 0.95rem;
	}

	.spinner.small {
		width: 24px;
		height: 24px;
		border-width: 3px;
	}

	.match-item-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Error */
	.step-content.error {
		align-items: center;
		text-align: center;
	}

	.error-icon {
		width: 60px;
		height: 60px;
		background: rgba(255, 68, 68, 0.2);
		border: 2px solid rgba(255, 68, 68, 0.5);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		font-weight: 700;
		color: #ff4444;
	}

	.error-message {
		color: #ff4444;
		font-size: 1rem;
		margin: 0;
	}

	/* Button Row */
	.button-row {
		display: flex;
		gap: 1rem;
	}

	.button-row :global(button) {
		flex: 1;
	}

	/* Mobile */
	@media (max-width: 600px) {
		.modal {
			width: 95%;
			padding: 1rem;
		}

		.modal-title {
			font-size: 1.1rem;
		}

		.key-input {
			font-size: 1.5rem;
			width: 100%;
			padding: 0.75rem 2.5rem 0.75rem 1rem;
		}

		.matches-list-container {
			max-height: 250px;
		}
	}
</style>
