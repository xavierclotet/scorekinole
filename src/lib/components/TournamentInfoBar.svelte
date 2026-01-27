<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { gameTournamentContext, clearTournamentContext } from '$lib/stores/tournamentContext';
	import { abandonTournamentMatch } from '$lib/firebase/tournamentMatches';
	import Button from './Button.svelte';

	interface Props {
		onexit?: (data: { action: 'pause' | 'abandon' }) => void;
	}

	let { onexit }: Props = $props();

	let showExitDialog = $state(false);
	let isExiting = $state(false);

	let context = $derived($gameTournamentContext);
	let phaseText = $derived(context?.phase === 'GROUP'
		? (m.tournament_groupStage())
		: (context?.bracketRoundName || 'Bracket'));

	function handleExitClick() {
		showExitDialog = true;
	}

	function cancelExit() {
		showExitDialog = false;
	}

	async function pauseMatch() {
		// Keep IN_PROGRESS in Firebase, save local progress
		showExitDialog = false;
		clearTournamentContext();
		onexit?.({ action: 'pause' });
	}

	async function abandonMatch() {
		if (!context) return;

		isExiting = true;

		try {
			// Revert to PENDING in Firebase
			await abandonTournamentMatch(
				context.tournamentId,
				context.matchId,
				context.phase,
				context.groupId
			);

			showExitDialog = false;
			clearTournamentContext();
			onexit?.({ action: 'abandon' });
		} catch (error) {
			console.error('Error abandoning match:', error);
		} finally {
			isExiting = false;
		}
	}
</script>

{#if context}
	<div class="tournament-info-bar">
		<div class="info-content">
			<div class="tournament-badge">
				<span class="trophy-icon">T</span>
			</div>
			<div class="info-text">
				<span class="tournament-name">{context.tournamentName}</span>
				<span class="match-info">{phaseText}</span>
			</div>
		</div>

		<button class="exit-btn" onclick={handleExitClick} title={m.tournament_exitMode()}>
			<span class="exit-icon">X</span>
		</button>
	</div>

	<!-- Exit Confirmation Dialog -->
	{#if showExitDialog}
		<div class="dialog-overlay" onclick={cancelExit} onkeydown={(e) => e.key === 'Escape' && cancelExit()} role="button" tabindex="-1">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="dialog" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog">
				<h3 class="dialog-title">{m.tournament_exitMode()}</h3>
				<p class="dialog-message">{m.tournament_exitMessage()}</p>

				<div class="dialog-options">
					<button class="option-btn pause" onclick={pauseMatch} disabled={isExiting}>
						<span class="option-icon">II</span>
						<div class="option-text">
							<span class="option-title">{m.tournament_pauseMatch()}</span>
							<span class="option-desc">{m.tournament_pauseMatchDesc()}</span>
						</div>
					</button>

					<button class="option-btn abandon" onclick={abandonMatch} disabled={isExiting}>
						<span class="option-icon">!</span>
						<div class="option-text">
							<span class="option-title">{m.tournament_abandonMatch()}</span>
							<span class="option-desc">{m.tournament_abandonMatchDesc()}</span>
						</div>
					</button>
				</div>

				<Button variant="secondary" fullWidth onclick={cancelExit} disabled={isExiting}>
					{m.common_cancel()}
				</Button>
			</div>
		</div>
	{/if}
{/if}

<style>
	.tournament-info-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		background: linear-gradient(135deg, rgba(0, 255, 136, 0.15) 0%, rgba(0, 200, 100, 0.1) 100%);
		border-bottom: 2px solid rgba(0, 255, 136, 0.4);
		padding: 0.5rem 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		z-index: 100;
		backdrop-filter: blur(10px);
	}

	.info-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.tournament-badge {
		width: 32px;
		height: 32px;
		background: var(--accent-green, #00ff88);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.trophy-icon {
		font-size: 1.2rem;
		color: #000;
		font-weight: 700;
	}

	.info-text {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.tournament-name {
		color: #fff;
		font-weight: 600;
		font-size: 0.9rem;
		line-height: 1.2;
	}

	.match-info {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.75rem;
	}

	.exit-btn {
		width: 32px;
		height: 32px;
		background: rgba(255, 68, 68, 0.2);
		border: 1px solid rgba(255, 68, 68, 0.4);
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.exit-btn:hover {
		background: rgba(255, 68, 68, 0.3);
		border-color: rgba(255, 68, 68, 0.6);
	}

	.exit-icon {
		color: #ff4444;
		font-weight: 700;
		font-size: 0.9rem;
	}

	/* Exit Dialog */
	.dialog-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.dialog {
		background: #1a1f35;
		padding: 1.5rem;
		border-radius: 12px;
		max-width: 90%;
		width: 400px;
		border: 2px solid rgba(255, 255, 255, 0.1);
	}

	.dialog-title {
		color: #fff;
		font-size: 1.25rem;
		margin: 0 0 0.5rem 0;
		text-align: center;
	}

	.dialog-message {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.95rem;
		margin: 0 0 1.5rem 0;
		text-align: center;
	}

	.dialog-options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.option-btn {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.option-btn:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.3);
	}

	.option-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.option-btn.pause:hover:not(:disabled) {
		border-color: rgba(255, 193, 7, 0.5);
		background: rgba(255, 193, 7, 0.05);
	}

	.option-btn.abandon:hover:not(:disabled) {
		border-color: rgba(255, 68, 68, 0.5);
		background: rgba(255, 68, 68, 0.05);
	}

	.option-icon {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1rem;
		flex-shrink: 0;
	}

	.pause .option-icon {
		background: rgba(255, 193, 7, 0.2);
		color: #ffc107;
	}

	.abandon .option-icon {
		background: rgba(255, 68, 68, 0.2);
		color: #ff4444;
	}

	.option-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.option-title {
		color: #fff;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.option-desc {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.8rem;
	}

	/* Mobile */
	@media (max-width: 600px) {
		.tournament-info-bar {
			padding: 0.4rem 0.75rem;
		}

		.tournament-badge {
			width: 28px;
			height: 28px;
		}

		.trophy-icon {
			font-size: 1rem;
		}

		.tournament-name {
			font-size: 0.8rem;
		}

		.match-info {
			font-size: 0.7rem;
		}

		.exit-btn {
			width: 28px;
			height: 28px;
		}

		.dialog {
			padding: 1rem;
		}

		.dialog-title {
			font-size: 1.1rem;
		}
	}

	/* Landscape mobile */
	@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
		.tournament-info-bar {
			padding: 0.3rem 0.5rem;
		}

		.tournament-badge {
			width: 24px;
			height: 24px;
		}

		.trophy-icon {
			font-size: 0.9rem;
		}

		.info-text {
			flex-direction: row;
			gap: 0.5rem;
			align-items: center;
		}

		.tournament-name {
			font-size: 0.75rem;
		}

		.match-info {
			font-size: 0.7rem;
		}

		.exit-btn {
			width: 24px;
			height: 24px;
		}
	}
</style>
