<script lang="ts">
	import { t } from '$lib/stores/language';
	import { gameSettings } from '$lib/stores/gameSettings';
	import type { MatchHistory } from '$lib/types/history';
	import Button from './Button.svelte';

	// Map language codes for date formatting
	const languageMap: Record<string, string> = {
		'es': 'es-ES',
		'ca': 'ca-ES',
		'en': 'en-US'
	};

	interface Props {
		isOpen?: boolean;
		matches?: MatchHistory[];
		onclose?: () => void;
		onconfirm?: (data: { selections: Map<string, 1 | 2 | null> }) => void;
	}

	let { isOpen = false, matches = [], onclose, onconfirm }: Props = $props();

	// Track team selection for each match
	// Don't pre-initialize - only add when user clicks a button
	let teamSelections = $state<Map<string, 1 | 2 | null>>(new Map());

	function handleTeamSelect(matchId: string, team: 1 | 2 | null) {
		teamSelections.set(matchId, team);
		teamSelections = new Map(teamSelections); // Trigger reactivity
	}

	function handleConfirm() {
		// Create map of match IDs to team selections
		const selections = new Map(teamSelections);
		onconfirm?.({ selections });
		close();
	}

	function close() {
		onclose?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}

	// Check if at least one match has been confirmed (has any button clicked)
	let atLeastOneConfirmed = $derived(
		matches.length > 0 && matches.some(match => teamSelections.has(match.id))
	);

	// Count confirmed matches (where user clicked any button)
	let confirmedCount = $derived(
		matches.filter(match => teamSelections.has(match.id)).length
	);
</script>

{#if isOpen}
	<div class="modal-overlay" onclick={close} onkeydown={handleKeydown} role="button" tabindex="-1">
		<div class="modal" onclick={stopPropagation} onkeydown={stopPropagation} role="dialog">
			<div class="modal-header">
				<h2>{$t('confirmTeamForEachMatch')}</h2>
				<button class="close-btn" onclick={close} aria-label="Close">×</button>
			</div>

			<div class="modal-content">
				<p class="description">
					{$t('selectTeamBeforeSyncing')}
				</p>

				{#if confirmedCount === 0}
					<div class="status-banner warning">
						{$t('selectAtLeastOne')}
					</div>
				{:else}
					<div class="status-banner info">
						{confirmedCount} / {matches.length} {$t('matchesSelected')}
					</div>
				{/if}

				<div class="matches-list">
					{#each matches as match (match.id)}
						{@const selected = teamSelections.get(match.id)}
						{@const locale = languageMap[$gameSettings.language] || 'es-ES'}
						{@const matchDate = new Date(match.startTime).toLocaleDateString(locale, {
							year: 'numeric',
							month: 'short',
							day: 'numeric',
							hour: '2-digit',
							minute: '2-digit'
						})}
						<div class="match-card" class:confirmed={selected !== null}>
							<div class="match-info">
								<div class="match-title">
									{match.eventTitle || 'Scorekinole'}
									{#if match.matchPhase}
										<span class="phase">- {match.matchPhase}</span>
									{/if}
								</div>
								<div class="match-date">
									📅 {matchDate}
								</div>
								<div class="teams">
									<span style="color: {match.team1Color}">{match.team1Name}</span>
									<span class="score">{match.team1Score} - {match.team2Score}</span>
									<span style="color: {match.team2Color}">{match.team2Name}</span>
								</div>
							</div>

							<div class="team-selection">
								<button
									class="team-btn"
									class:selected={selected === 1}
									onclick={() => handleTeamSelect(match.id, 1)}
									type="button"
								>
									{match.team1Name}
								</button>
								<button
									class="team-btn"
									class:selected={selected === 2}
									onclick={() => handleTeamSelect(match.id, 2)}
									type="button"
								>
									{match.team2Name}
								</button>
								<button
									class="team-btn didnt-play"
									class:selected={selected === null && teamSelections.has(match.id)}
									onclick={() => handleTeamSelect(match.id, null)}
									type="button"
									title={$t('iDidntPlay')}
								>
									❌
								</button>
							</div>
						</div>
					{/each}
				</div>

				<div class="modal-actions">
					<Button variant="secondary" onclick={close}>
						{$t('cancel')}
					</Button>
					<Button variant="primary" onclick={handleConfirm} disabled={!atLeastOneConfirmed}>
						{$t('syncSelected')}
					</Button>
				</div>
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
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		opacity: 0;
		animation: fadeIn 0.2s ease-out forwards;
	}

	@keyframes fadeIn {
		to {
			opacity: 1;
		}
	}

	.modal {
		background: #1a1f35;
		border-radius: 12px;
		border: 2px solid rgba(0, 255, 136, 0.3);
		max-width: 90%;
		width: 600px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.modal-header h2 {
		margin: 0;
		color: var(--accent-green, #00ff88);
		font-size: 1.3rem;
		font-weight: 700;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 2rem;
		cursor: pointer;
		color: #fff;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		transform: rotate(90deg);
	}

	.modal-content {
		padding: 1.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.description {
		color: rgba(255, 255, 255, 0.8);
		margin: 0 0 1rem 0;
		text-align: center;
		font-size: 0.95rem;
	}

	.status-banner {
		padding: 0.75rem 1rem;
		border-radius: 8px;
		text-align: center;
		font-weight: 600;
		margin-bottom: 1.5rem;
	}

	.status-banner.warning {
		background: rgba(255, 193, 7, 0.1);
		border: 1px solid rgba(255, 193, 7, 0.3);
		color: #ffc107;
	}

	.status-banner.success {
		background: rgba(0, 255, 136, 0.1);
		border: 1px solid rgba(0, 255, 136, 0.3);
		color: var(--accent-green, #00ff88);
	}

	.status-banner.info {
		background: rgba(33, 150, 243, 0.1);
		border: 1px solid rgba(33, 150, 243, 0.3);
		color: #2196f3;
	}

	.matches-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.match-card {
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 1rem;
		transition: all 0.3s;
	}

	.match-card.confirmed {
		border-color: rgba(0, 255, 136, 0.4);
		background: rgba(0, 255, 136, 0.05);
	}

	.match-info {
		margin-bottom: 1rem;
	}

	.match-title {
		font-weight: 700;
		color: #fff;
		margin-bottom: 0.5rem;
		font-size: 1rem;
	}

	.phase {
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
	}

	.match-date {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	.teams {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.score {
		color: rgba(255, 255, 255, 0.9);
		font-weight: 700;
		font-size: 1rem;
		padding: 0 0.5rem;
	}

	.vs {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.75rem;
	}

	.team-selection {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 0.5rem;
	}

	.team-btn {
		padding: 0.75rem 1rem;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.05);
		color: #fff;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.team-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.team-btn.selected {
		background: rgba(0, 255, 136, 0.2);
		border-color: var(--accent-green, #00ff88);
		color: var(--accent-green, #00ff88);
	}

	.team-btn.didnt-play {
		width: 60px;
		padding: 0.75rem 0.5rem;
	}

	.modal-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	/* Responsive */
	@media (max-width: 600px) {
		.modal {
			width: 95%;
			max-height: 85vh;
		}

		.modal-header {
			padding: 1rem;
		}

		.modal-header h2 {
			font-size: 1rem;
		}

		.close-btn {
			font-size: 1.6rem;
			width: 28px;
			height: 28px;
		}

		.modal-content {
			padding: 1rem;
		}

		.description {
			font-size: 0.85rem;
			margin-bottom: 0.75rem;
		}

		.status-banner {
			padding: 0.6rem 0.8rem;
			font-size: 0.85rem;
			margin-bottom: 1rem;
		}

		.matches-list {
			gap: 0.75rem;
			margin-bottom: 1rem;
		}

		.match-card {
			padding: 0.75rem;
		}

		.match-title {
			font-size: 0.9rem;
			margin-bottom: 0.4rem;
		}

		.match-date {
			font-size: 0.75rem;
			margin-bottom: 0.4rem;
		}

		.teams {
			font-size: 0.8rem;
		}

		.score {
			font-size: 0.9rem;
		}

		.team-selection {
			grid-template-columns: 1fr;
			gap: 0.4rem;
		}

		.team-btn {
			padding: 0.6rem 0.8rem;
			font-size: 0.85rem;
		}

		.team-btn.didnt-play {
			width: 100%;
			padding: 0.6rem 0.8rem;
		}

		.modal-actions {
			gap: 0.75rem;
			margin-top: 0.75rem;
			padding-top: 0.75rem;
		}
	}

	/* Portrait mobile - maximize space */
	@media (max-width: 600px) and (orientation: portrait) {
		.modal {
			max-height: 88vh;
		}

		.modal-header {
			padding: 0.75rem;
		}

		.modal-content {
			padding: 0.75rem;
		}
	}

	/* Landscape mobile - compact */
	@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
		.modal {
			max-height: 80vh;
		}

		.modal-header {
			padding: 0.75rem;
		}

		.modal-header h2 {
			font-size: 0.9rem;
		}

		.close-btn {
			font-size: 1.4rem;
			width: 24px;
			height: 24px;
		}

		.modal-content {
			padding: 0.75rem;
		}

		.description {
			font-size: 0.75rem;
			margin-bottom: 0.5rem;
		}

		.status-banner {
			padding: 0.5rem 0.6rem;
			font-size: 0.75rem;
			margin-bottom: 0.75rem;
		}

		.matches-list {
			gap: 0.5rem;
			margin-bottom: 0.75rem;
		}

		.match-card {
			padding: 0.5rem;
		}

		.match-info {
			margin-bottom: 0.5rem;
		}

		.match-title {
			font-size: 0.8rem;
			margin-bottom: 0.3rem;
		}

		.match-date {
			font-size: 0.7rem;
			margin-bottom: 0.3rem;
		}

		.teams {
			font-size: 0.75rem;
		}

		.score {
			font-size: 0.85rem;
			padding: 0 0.3rem;
		}

		.team-selection {
			grid-template-columns: 1fr 1fr auto;
			gap: 0.3rem;
		}

		.team-btn {
			padding: 0.5rem 0.6rem;
			font-size: 0.75rem;
		}

		.team-btn.didnt-play {
			width: 50px;
			padding: 0.5rem 0.3rem;
		}

		.modal-actions {
			gap: 0.5rem;
			margin-top: 0.5rem;
			padding-top: 0.5rem;
		}
	}
</style>
