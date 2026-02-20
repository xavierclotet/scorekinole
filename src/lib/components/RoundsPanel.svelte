<script lang="ts">
	import { currentMatch } from '$lib/stores/history';
	import { team1, team2 } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { ChevronDown, ChevronUp } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { browser } from '$app/environment';

	interface Props {
		/** Callback when user wants to edit 20s for a round */
		onedit20s?: (roundIndex: number, team1Value: number, team2Value: number) => void;
	}

	let { onedit20s }: Props = $props();

	let isExpanded = $state(false);
	let selectedGameIndex = $state(0);

	// Dragging state
	let isDragging = $state(false);
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let posX = $state(50); // percentage from left
	let posY = $state(92); // percentage from top

	// Track if we've moved enough to consider it a drag (vs a click)
	let hasMoved = $state(false);
	const DRAG_THRESHOLD = 5; // pixels before considering it a drag

	// Load position from localStorage
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem('roundsPanelPosition');
			if (saved) {
				try {
					const pos = JSON.parse(saved);
					posX = pos.x ?? 50;
					posY = pos.y ?? 92;
				} catch {}
			}
		}
	});

	function savePosition() {
		if (browser) {
			localStorage.setItem('roundsPanelPosition', JSON.stringify({ x: posX, y: posY }));
		}
	}

	// Get all games with their rounds
	let games = $derived($currentMatch?.games ?? []);
	let currentRounds = $derived($currentMatch?.rounds ?? []);

	// For display: completed games + current game (if has rounds)
	let displayGames = $derived((() => {
		const result = games.map((g, i) => ({
			gameNumber: g.gameNumber || i + 1,
			rounds: g.rounds || [],
			isCompleted: true
		}));

		// Add current game if it has rounds
		if (currentRounds.length > 0) {
			result.push({
				gameNumber: result.length + 1,
				rounds: currentRounds,
				isCompleted: false
			});
		}

		return result;
	})());

	// Total rounds across all games for the pill display
	let totalRounds = $derived(
		displayGames.reduce((sum, g) => sum + g.rounds.length, 0)
	);

	// Current game score from live team store (always up to date)
	let currentGameScore = $derived({ team1: $team1.points, team2: $team2.points });
	let hasCurrentScore = $derived($team1.points > 0 || $team2.points > 0 || currentRounds.length > 0);

	// Make sure selectedGameIndex is valid
	$effect(() => {
		if (selectedGameIndex >= displayGames.length && displayGames.length > 0) {
			selectedGameIndex = displayGames.length - 1;
		}
	});

	// Auto-select latest game when new game starts
	$effect(() => {
		if (displayGames.length > 0) {
			selectedGameIndex = displayGames.length - 1;
		}
	});

	// Multi-game mode?
	let isMultiGame = $derived(($gameSettings.matchesToWin ?? 1) > 1);

	// Games won by each team (for header display)
	let team1GamesWon = $derived(games.filter(g => g.winner === 1).length);
	let team2GamesWon = $derived(games.filter(g => g.winner === 2).length);

	// Team names for display
	let team1Name = $derived($team1.name || 'Team 1');
	let team2Name = $derived($team2.name || 'Team 2');

	// Should panel open upward? (when positioned in bottom half of screen)
	let shouldOpenUpward = $derived(posY > 50);

	function toggleExpanded() {
		// Ignore if we just finished dragging
		if (hasMoved) return;
		isExpanded = !isExpanded;
	}

	function selectGame(index: number) {
		// Ignore if we just finished dragging
		if (hasMoved) return;
		selectedGameIndex = index;
	}

	function handleRoundClick(roundIndex: number) {
		// Ignore click if we just finished dragging
		if (hasMoved) return;

		const game = displayGames[selectedGameIndex];
		if (game && game.rounds[roundIndex]) {
			const round = game.rounds[roundIndex];
			// Only allow editing current game's rounds
			if (!game.isCompleted) {
				onedit20s?.(roundIndex, round.team1Twenty, round.team2Twenty);
			}
		}
	}

	// Dragging handlers
	let initialClientX = $state(0);
	let initialClientY = $state(0);

	function handleDragStart(e: MouseEvent | TouchEvent) {
		// Store initial position to detect if we've moved enough
		if ('touches' in e) {
			initialClientX = e.touches[0].clientX;
			initialClientY = e.touches[0].clientY;
			dragStartX = e.touches[0].clientX - (posX / 100) * window.innerWidth;
			dragStartY = e.touches[0].clientY - (posY / 100) * window.innerHeight;
		} else {
			initialClientX = e.clientX;
			initialClientY = e.clientY;
			dragStartX = e.clientX - (posX / 100) * window.innerWidth;
			dragStartY = e.clientY - (posY / 100) * window.innerHeight;
		}
		isDragging = true;
		hasMoved = false;
		// Don't preventDefault here - allow clicks to work
	}

	function handleDragMove(e: MouseEvent | TouchEvent) {
		if (!isDragging) return;

		let clientX: number, clientY: number;
		if ('touches' in e) {
			clientX = e.touches[0].clientX;
			clientY = e.touches[0].clientY;
		} else {
			clientX = e.clientX;
			clientY = e.clientY;
		}

		// Check if we've moved past the threshold
		const deltaX = Math.abs(clientX - initialClientX);
		const deltaY = Math.abs(clientY - initialClientY);

		if (!hasMoved && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
			hasMoved = true;
		}

		// Only update position if we've moved past threshold
		if (hasMoved) {
			posX = Math.max(10, Math.min(90, ((clientX - dragStartX) / window.innerWidth) * 100));
			posY = Math.max(10, Math.min(95, ((clientY - dragStartY) / window.innerHeight) * 100));
		}
	}

	function handleDragEnd() {
		if (isDragging) {
			isDragging = false;
			if (hasMoved) {
				savePosition();
				// Reset hasMoved after a short delay to allow click events to check it first
				setTimeout(() => {
					hasMoved = false;
				}, 50);
			}
		}
	}

	// Global mouse/touch events for dragging
	$effect(() => {
		if (!browser || !isDragging) return;

		const onMove = (e: MouseEvent | TouchEvent) => handleDragMove(e);
		const onEnd = () => handleDragEnd();

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onEnd);
		window.addEventListener('touchmove', onMove);
		window.addEventListener('touchend', onEnd);

		return () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onEnd);
			window.removeEventListener('touchmove', onMove);
			window.removeEventListener('touchend', onEnd);
		};
	});
	let lastTourneyResult = $derived($gameSettings.lastTournamentResult);
</script>

{#if totalRounds > 0 || lastTourneyResult || hasCurrentScore}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="rounds-panel"
		class:expanded={isExpanded}
		class:open-up={shouldOpenUpward}
		class:dragging={isDragging && hasMoved}
		style="left: {posX}%; top: {posY}%; transform: translate(-50%, -50%);"
		onmousedown={handleDragStart}
		ontouchstart={handleDragStart}
	>
		<!-- Header / Pill -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="panel-header" class:tournament-result={!!lastTourneyResult}>
			<button class="toggle-btn" onclick={toggleExpanded}>
				<span class="header-text">
					{#if lastTourneyResult}
						{#if lastTourneyResult.isTie}
							<span class="result-winner tie">Empate</span>
						{:else}
							<span class="result-winner">{lastTourneyResult.winnerName}</span>
						{/if}
						<span class="games-score tournament-score">
							{#if (lastTourneyResult.matchesToWin ?? 1) > 1}
								{lastTourneyResult.scoreA}-{lastTourneyResult.scoreB}
							{:else}
								{lastTourneyResult.pointsA ?? lastTourneyResult.scoreA}-{lastTourneyResult.pointsB ?? lastTourneyResult.scoreB}
							{/if}
						</span>
					{:else}
						{m.scoring_rounds()} ({totalRounds})
						{#if hasCurrentScore}
							<span class="games-score">{currentGameScore.team1}-{currentGameScore.team2}</span>
						{:else if isMultiGame}
							<span class="games-score">{team1GamesWon}-{team2GamesWon}</span>
						{/if}
					{/if}
				</span>
				{#if isExpanded}
					{#if shouldOpenUpward}
						<ChevronUp size={14} />
					{:else}
						<ChevronDown size={14} />
					{/if}
				{:else}
					{#if shouldOpenUpward}
						<ChevronDown size={14} />
					{:else}
						<ChevronUp size={14} />
					{/if}
				{/if}
			</button>
		</div>

		{#if isExpanded}
			<div class="panel-content">
				<!-- Game tabs (only if multi-game match) -->
				{#if isMultiGame && displayGames.length > 1}
					<div class="game-tabs">
						{#each displayGames as game, index}
							<button
								class="game-tab"
								class:active={selectedGameIndex === index}
								onclick={() => selectGame(index)}
							>
								P{game.gameNumber}
							</button>
						{/each}
					</div>
				{/if}

				<!-- Rounds list -->
				<div class="rounds-list">
					{#each displayGames[selectedGameIndex]?.rounds ?? [] as round, index}
						{@const isCurrentGame = !displayGames[selectedGameIndex]?.isCompleted}
						{@const roundWinner = round.team1Points > round.team2Points ? 1 : round.team2Points > round.team1Points ? 2 : 0}
						<button
							class="round-row"
							class:editable={isCurrentGame}
							onclick={() => handleRoundClick(index)}
							disabled={!isCurrentGame}
							title={isCurrentGame ? m.scoring_edit20s() : ''}
						>
							<span class="round-number">R{round.roundNumber}</span>
							<span class="round-winner" class:tie={roundWinner === 0}>
								{#if roundWinner === 1}
									{team1Name}
								{:else if roundWinner === 2}
									{team2Name}
								{:else}
									{m.scoring_tie()}
								{/if}
							</span>
							<span class="round-20s">
								<span class="twenty-label">20s:</span>
								<span class="twenty-value">{round.team1Twenty}</span>
								<span class="twenty-separator">-</span>
								<span class="twenty-value">{round.team2Twenty}</span>
							</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.rounds-panel {
		position: fixed;
		z-index: 100;
		background: rgba(26, 29, 36, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		backdrop-filter: blur(8px);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		width: 270px;
		user-select: none;
		display: flex;
		flex-direction: column;
		cursor: grab;
	}

	.rounds-panel.dragging {
		cursor: grabbing;
	}

	.rounds-panel.expanded {
		width: 290px;
	}

	/* When panel is in lower half, open upward */
	.rounds-panel.open-up {
		flex-direction: column-reverse;
	}

	.rounds-panel.open-up .panel-content {
		border-top: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.rounds-panel.open-up .game-tabs {
		border-bottom: none;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.panel-header {
		padding: 0.4rem 0.6rem;
	}

	.toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.9);
		font-family: 'Lexend', sans-serif;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		padding: 0;
	}

	.header-text {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.games-score {
		margin-left: 0.4rem;
		padding: 0.1rem 0.4rem;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		font-weight: 700;
		font-size: 0.8rem;
	}

	.games-score.tournament-score {
		background: color-mix(in srgb, var(--primary) 20%, transparent);
		color: var(--primary);
	}

	.panel-header.tournament-result {
		background: color-mix(in srgb, var(--primary) 5%, transparent);
		border-radius: 12px;
	}

	.result-winner {
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
		max-width: 140px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-winner.tie {
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
	}

	.panel-content {
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		max-height: 200px;
		overflow-y: auto;
	}

	.game-tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.game-tab {
		flex: 1;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.6);
		font-family: 'Lexend', sans-serif;
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.game-tab:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.game-tab.active {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
		color: white;
	}

	.rounds-list {
		display: flex;
		flex-direction: column;
	}

	.round-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.7rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.8);
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		text-align: left;
		width: 100%;
		transition: background 0.15s ease;
	}

	.round-row:last-child {
		border-bottom: none;
	}

	.round-row.editable {
		cursor: pointer;
	}

	.round-row.editable:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.round-row:disabled {
		cursor: default;
		opacity: 0.7;
	}

	.round-number {
		font-weight: 600;
		color: rgba(255, 255, 255, 0.5);
		min-width: 22px;
	}

	.round-winner {
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.round-winner.tie {
		color: rgba(255, 255, 255, 0.4);
		font-style: italic;
	}

	.round-20s {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		font-weight: 600;
		font-size: 0.75rem;
		margin-left: auto;
	}

	.twenty-label {
		color: rgba(255, 255, 255, 0.4);
		font-weight: 500;
		margin-right: 0.15rem;
	}

	.twenty-value {
		min-width: 10px;
		text-align: center;
	}

	.twenty-separator {
		color: rgba(255, 255, 255, 0.4);
	}

	@media (max-width: 480px) {
		.rounds-panel {
			width: 240px;
		}

		.rounds-panel.expanded {
			width: 260px;
		}

		.panel-header {
			padding: 0.35rem 0.5rem;
		}

		.toggle-btn {
			font-size: 0.75rem;
		}

		.games-score {
			font-size: 0.75rem;
			padding: 0.05rem 0.3rem;
		}

		.round-row {
			padding: 0.35rem 0.5rem;
			font-size: 0.8rem;
			gap: 0.4rem;
		}

		.round-number {
			min-width: 20px;
		}

		.round-20s {
			font-size: 0.7rem;
		}

		.game-tab {
			font-size: 0.7rem;
			padding: 0.2rem 0.4rem;
		}
	}
</style>
