<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
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

	// Reference to key input for autofocus
	let keyInputElement: HTMLInputElement;

	const dispatch = createEventDispatcher();

	// State machine (simplified: removed sync_options step, always use real_time)
	// For non-logged users: key_input → loading → player_selection → confirmation
	// For logged users: key_input → loading → confirmation (auto-select)
	type Step = 'key_input' | 'loading' | 'player_selection' | 'confirmation' | 'error';
	let currentStep: Step = 'key_input';

	// Form state
	let tournamentKey = '';
	let tournament: Tournament | null = null;
	let pendingMatches: PendingMatchInfo[] = [];
	let selectedMatch: PendingMatchInfo | null = null;
	let selectedSide: 'A' | 'B' | null = null;
	let errorMessage = '';
	let isStarting = false;

	// Players with pending matches (for non-logged users)
	interface PlayerWithMatch {
		participantId: string;
		name: string;
		match: PendingMatchInfo;
		side: 'A' | 'B';
		isInProgress?: boolean;  // True if match is IN_PROGRESS
	}
	let playersWithPendingMatches: PlayerWithMatch[] = [];

	// Separate lists for pending and in-progress matches
	let pendingPlayers: PlayerWithMatch[] = [];
	let inProgressPlayers: PlayerWithMatch[] = [];

	// Show/hide tournament key
	let showKey = false;

	// Track if selected match is being resumed (IN_PROGRESS)
	let isResumingMatch = false;

	// Reactive: check if user is logged in
	$: isLoggedIn = !!$currentUser;

	// Autofocus key input when modal opens
	$: if (isOpen && currentStep === 'key_input') {
		// Use tick to wait for DOM update, then focus
		tick().then(() => {
			keyInputElement?.focus();
		});
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
		playersWithPendingMatches = [];
		pendingPlayers = [];
		inProgressPlayers = [];
		selectedMatch = null;
		selectedSide = null;
		errorMessage = '';
		isStarting = false;
		showKey = false;
		isResumingMatch = false;
	}

	async function searchTournament() {
		if (tournamentKey.length !== 6) {
			errorMessage = $t('invalidTournamentKey') || 'La clave debe tener 6 caracteres';
			currentStep = 'error';
			return;
		}

		currentStep = 'loading';
		errorMessage = '';

		try {
			const result = await getTournamentByKey(tournamentKey.toUpperCase());

			if (!result) {
				errorMessage = $t('tournamentNotFound') || 'Torneo no encontrado';
				currentStep = 'error';
				return;
			}

			// Check tournament status
			if (result.status === 'COMPLETED' || result.status === 'CANCELLED') {
				errorMessage = $t('tournamentNotActive') || 'Este torneo ya no esta activo';
				currentStep = 'error';
				return;
			}

			tournament = result;

			// Get pending matches
			if (isLoggedIn && $currentUser) {
				pendingMatches = await getPendingMatchesForUser(result, $currentUser.id);

				if (pendingMatches.length === 0) {
					errorMessage = $t('noPendingMatches') || 'No tienes partidos pendientes en este torneo';
					currentStep = 'error';
					return;
				}

				// Auto-select first match for logged-in user
				selectedMatch = pendingMatches[0];

				// Determine which side the user is on
				const userParticipant = result.participants.find(p => p.userId === $currentUser?.id);
				if (userParticipant) {
					if (selectedMatch.match.participantA === userParticipant.id) {
						selectedSide = 'A';
					} else if ('participantB' in selectedMatch.match && selectedMatch.match.participantB === userParticipant.id) {
						selectedSide = 'B';
					}
				}

				// Go directly to confirmation (skip sync_options)
				currentStep = 'confirmation';
			} else {
				pendingMatches = await getAllPendingMatches(result);

				if (pendingMatches.length === 0) {
					errorMessage = $t('noPendingMatches') || 'No hay partidos pendientes en este torneo';
					currentStep = 'error';
					return;
				}

				// Build list of unique players with pending matches
				// Separate pending from in-progress
				const pendingPlayerMap = new Map<string, PlayerWithMatch>();
				const inProgressPlayerMap = new Map<string, PlayerWithMatch>();

				for (const match of pendingMatches) {
					const isInProgress = match.isInProgress || false;
					const targetMap = isInProgress ? inProgressPlayerMap : pendingPlayerMap;

					// Add participant A
					const participantA = match.match.participantA;
					if (participantA && !targetMap.has(participantA)) {
						targetMap.set(participantA, {
							participantId: participantA,
							name: match.participantAName,
							match,
							side: 'A',
							isInProgress
						});
					}
					// Add participant B
					const participantB = 'participantB' in match.match ? match.match.participantB : null;
					if (participantB && !targetMap.has(participantB)) {
						targetMap.set(participantB, {
							participantId: participantB,
							name: match.participantBName,
							match,
							side: 'B',
							isInProgress
						});
					}
				}

				pendingPlayers = Array.from(pendingPlayerMap.values()).sort((a, b) =>
					a.name.localeCompare(b.name)
				);
				inProgressPlayers = Array.from(inProgressPlayerMap.values()).sort((a, b) =>
					a.name.localeCompare(b.name)
				);

				// Combined for backward compatibility
				playersWithPendingMatches = [...pendingPlayers, ...inProgressPlayers];

				currentStep = 'player_selection';
			}
		} catch (error) {
			console.error('Error searching tournament:', error);
			errorMessage = $t('networkError') || 'Error de conexion';
			currentStep = 'error';
		}
	}

	function selectPlayer(player: PlayerWithMatch) {
		selectedMatch = player.match;
		selectedSide = player.side;
		isResumingMatch = player.isInProgress || false;
		currentStep = 'confirmation';
	}

	function goBack() {
		if (currentStep === 'confirmation') {
			if (isLoggedIn) {
				// Logged-in user: go back to key input
				currentStep = 'key_input';
				tournament = null;
				pendingMatches = [];
				playersWithPendingMatches = [];
				selectedMatch = null;
				selectedSide = null;
			} else {
				// Non-logged-in user: go back to player selection
				currentStep = 'player_selection';
				selectedMatch = null;
				selectedSide = null;
			}
		} else if (currentStep === 'player_selection') {
			// Go back to key input
			currentStep = 'key_input';
			tournament = null;
			pendingMatches = [];
			playersWithPendingMatches = [];
		} else if (currentStep === 'error') {
			currentStep = 'key_input';
			errorMessage = '';
		}
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
				errorMessage = result.error || 'Error al iniciar el partido';
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
			errorMessage = $t('networkError') || 'Error de conexion';
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
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div class="modal-overlay" on:click={close} on:keydown={handleKeydown} role="button" tabindex="-1">
		<div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog">
			<div class="modal-header">
				<span class="modal-title">
					{#if currentStep === 'key_input'}
						{$t('playTournamentMatch') || 'Jugar Partido de Torneo'}
					{:else if currentStep === 'loading'}
						{$t('searching') || 'Buscando...'}
					{:else if currentStep === 'player_selection'}
						{$t('whichPlayerAreYou') || '¿Quién eres?'}
					{:else if currentStep === 'confirmation'}
						{$t('confirmMatch') || 'Confirmar partido'}
					{:else if currentStep === 'error'}
						{$t('error') || 'Error'}
					{/if}
				</span>
				<button class="close-btn" on:click={close} aria-label="Close">x</button>
			</div>

			<div class="modal-content">
				<!-- Step: Key Input -->
				{#if currentStep === 'key_input'}
					<div class="step-content">
						<p class="description">{$t('enterTournamentKey') || 'Introduce la clave del torneo (6 caracteres)'}</p>

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
									aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}
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
							{$t('searchTournament') || 'Buscar Torneo'}
						</Button>
					</div>

				<!-- Step: Loading -->
				{:else if currentStep === 'loading'}
					<div class="step-content loading">
						<div class="spinner"></div>
						<p>{$t('searchingTournament') || 'Buscando torneo...'}</p>
					</div>

				<!-- Step: Player Selection (for non-logged-in users) -->
				{:else if currentStep === 'player_selection'}
					<div class="step-content player-selection-content">
						<div class="player-selection-header">
							<p class="tournament-name">{tournament?.name}</p>
						</div>

						<!-- Pending matches (normal) -->
						{#if pendingPlayers.length > 0}
							<div class="players-grid">
								{#each pendingPlayers as player}
									<button
										class="player-item"
										on:click={() => selectPlayer(player)}
									>
										<span class="player-name">{player.name}</span>
									</button>
								{/each}
							</div>
						{/if}

						<!-- In-progress matches (emergency resume) -->
						{#if inProgressPlayers.length > 0}
							<div class="in-progress-section">
								<div class="in-progress-warning">
									<span class="warning-icon">⚠️</span>
									<span class="warning-text">{$t('inProgressWarning') || 'Partidos en curso - solo usar en caso excepcional (ej: app cerrada por error)'}</span>
								</div>
								<div class="players-grid in-progress">
									{#each inProgressPlayers as player}
										<button
											class="player-item in-progress"
											on:click={() => selectPlayer(player)}
										>
											<span class="player-name">{player.name}</span>
											<span class="in-progress-badge">{$t('inProgress') || 'En curso'}</span>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>

				<!-- Step: Confirmation -->
				{:else if currentStep === 'confirmation' && selectedMatch && tournament}
					<div class="step-content">
						<div class="confirmation-details">
							<div class="detail-row">
								<span class="detail-label">{$t('tournament') || 'Torneo'}:</span>
								<span class="detail-value">{tournament.name}</span>
							</div>
							<div class="detail-row">
								<span class="detail-label">{$t('phase') || 'Fase'}:</span>
								<span class="detail-value">
									{selectedMatch.phase === 'GROUP' ? ($t('groupStage') || 'Fase de Grupos') : selectedMatch.bracketRoundName}
								</span>
							</div>
							<div class="detail-row">
								<span class="detail-label">{$t('match') || 'Partido'}:</span>
								<span class="detail-value">{selectedMatch.participantAName} vs {selectedMatch.participantBName}</span>
							</div>
							<div class="detail-row">
								<span class="detail-label">{$t('youPlay') || 'Tu juegas como'}:</span>
								<span class="detail-value highlight">
									{selectedSide === 'A' ? selectedMatch.participantAName : selectedMatch.participantBName}
								</span>
							</div>
							<div class="detail-row">
								<span class="detail-label">{$t('gameMode') || 'Modo'}:</span>
								<span class="detail-value">{formatGameConfig(selectedMatch.gameConfig)}</span>
							</div>
						</div>

						<div class="button-row">
							<Button variant="secondary" on:click={goBack} disabled={isStarting}>
								{$t('back') || 'Volver'}
							</Button>
							<Button variant="primary" on:click={startMatch} disabled={isStarting}>
								{#if isStarting}
									{$t('starting') || 'Iniciando...'}
								{:else}
									{$t('startMatch') || 'Iniciar Partido'}
								{/if}
							</Button>
						</div>
					</div>

				<!-- Step: Error -->
				{:else if currentStep === 'error'}
					<div class="step-content error">
						<div class="error-icon">!</div>
						<p class="error-message">{errorMessage}</p>

						<Button variant="secondary" fullWidth on:click={goBack}>
							{$t('tryAgain') || 'Intentar de nuevo'}
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
		width: 450px;
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
		width: 280px;
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

	/* Match Selection */
	.tournament-name {
		color: var(--accent-green, #00ff88);
		font-size: 1.1rem;
		font-weight: 600;
		text-align: center;
		margin: 0;
	}

	.matches-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: 300px;
		overflow-y: auto;
	}

	.match-item {
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.match-item:hover {
		border-color: rgba(0, 255, 136, 0.5);
		background: rgba(0, 255, 136, 0.05);
	}

	.match-item.selected {
		border-color: var(--accent-green, #00ff88);
		background: rgba(0, 255, 136, 0.1);
	}

	.match-players {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.player-name {
		color: #fff;
		font-weight: 500;
	}

	.vs {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.85rem;
	}

	.match-info {
		display: flex;
		gap: 0.5rem;
	}

	.phase-badge {
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-weight: 500;
	}

	.phase-badge.group {
		background: rgba(255, 193, 7, 0.2);
		color: #ffc107;
	}

	.phase-badge.final {
		background: rgba(0, 255, 136, 0.2);
		color: var(--accent-green, #00ff88);
	}

	/* Player Selection */
	.player-selection-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.player-selection-header {
		flex-shrink: 0;
	}

	.players-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	@media (max-width: 400px) {
		.players-grid {
			grid-template-columns: 1fr;
		}
	}

	.player-item {
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.75rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.player-item:hover {
		border-color: rgba(0, 255, 136, 0.5);
		background: rgba(0, 255, 136, 0.05);
	}

	.player-item .player-name {
		color: #fff;
		font-size: 0.95rem;
		font-weight: 500;
	}

	/* In-progress matches section */
	.in-progress-section {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px dashed rgba(255, 193, 7, 0.3);
	}

	.in-progress-warning {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		background: rgba(255, 193, 7, 0.1);
		border: 1px solid rgba(255, 193, 7, 0.3);
		border-radius: 8px;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.warning-icon {
		font-size: 1.1rem;
		flex-shrink: 0;
	}

	.warning-text {
		color: #ffc107;
		font-size: 0.85rem;
		line-height: 1.4;
	}

	.players-grid.in-progress {
		opacity: 0.85;
	}

	.player-item.in-progress {
		border-color: rgba(255, 193, 7, 0.3);
		flex-direction: column;
		gap: 0.25rem;
	}

	.player-item.in-progress:hover {
		border-color: rgba(255, 193, 7, 0.6);
		background: rgba(255, 193, 7, 0.1);
	}

	.in-progress-badge {
		font-size: 0.7rem;
		color: #ffc107;
		background: rgba(255, 193, 7, 0.2);
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.5px;
	}

	/* Participant Selection */
	.participant-options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.participant-option {
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 1.25rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: center;
	}

	.participant-option:hover {
		border-color: rgba(0, 255, 136, 0.5);
	}

	.participant-option.selected {
		border-color: var(--accent-green, #00ff88);
		background: rgba(0, 255, 136, 0.1);
	}

	.participant-name {
		color: #fff;
		font-size: 1.1rem;
		font-weight: 600;
	}

	/* Confirmation */
	.confirmation-details {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.detail-label {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
	}

	.detail-value {
		color: #fff;
		font-weight: 500;
		text-align: right;
	}

	.detail-value.highlight {
		color: var(--accent-green, #00ff88);
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
			width: 250px;
			padding: 0.75rem 1rem;
		}

		.matches-list,
		.players-list {
			max-height: 250px;
		}
	}
</style>
