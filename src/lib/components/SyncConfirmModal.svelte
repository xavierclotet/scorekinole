<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { gameSettings } from '$lib/stores/gameSettings';
	import type { MatchHistory } from '$lib/types/history';
	import { isColorDark } from '$lib/utils/colors';

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

	let teamSelections = $state<Map<string, 1 | 2 | null>>(new Map());

	function handleTeamSelect(matchId: string, team: 1 | 2 | null) {
		teamSelections.set(matchId, team);
		teamSelections = new Map(teamSelections);
	}

	function handleConfirm() {
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

	let confirmedCount = $derived(
		matches.filter(match => teamSelections.has(match.id)).length
	);

	let canConfirm = $derived(confirmedCount > 0);
</script>

{#if isOpen}
	<div class="overlay" onclick={close} onkeydown={handleKeydown} role="button" tabindex="-1">
		<div class="modal" onclick={stopPropagation} onkeydown={stopPropagation} role="dialog" tabindex="-1">
			<div class="header">
				<div class="header-title">
					<span class="title">{m.sync_confirmTeamForEachMatch()}</span>
					<span class="counter">{confirmedCount}/{matches.length}</span>
				</div>
				<button class="close-btn" onclick={close} type="button">×</button>
			</div>

			<div class="content">
				{#each matches as match (match.id)}
					{@const selected = teamSelections.get(match.id)}
					{@const isConfirmed = teamSelections.has(match.id)}
					{@const locale = languageMap[$gameSettings.language] || 'es-ES'}
					{@const matchDate = new Date(match.startTime).toLocaleDateString(locale, {
						day: '2-digit',
						month: '2-digit',
						year: '2-digit',
						hour: '2-digit',
						minute: '2-digit'
					})}
					<div class="match-row" class:confirmed={isConfirmed}>
						<div class="match-info">
							<div class="match-header">
								<span class="event-name">{match.eventTitle || 'Scorekinole'}</span>
								{#if match.matchPhase}
									<span class="phase-sep">·</span>
									<span class="phase">{match.matchPhase}</span>
								{/if}
							</div>
							<div class="match-details">
								<span class="date">{matchDate}</span>
								<span class="teams-display">
									<span
										class="team-name"
										class:dark-color={isColorDark(match.team1Color)}
										style="color: {match.team1Color}"
									>{match.team1Name}</span>
									<span class="score">{match.team1Score}-{match.team2Score}</span>
									<span
										class="team-name"
										class:dark-color={isColorDark(match.team2Color)}
										style="color: {match.team2Color}"
									>{match.team2Name}</span>
								</span>
							</div>
						</div>
						<div class="team-buttons">
							<button
								class="team-btn"
								class:active={selected === 1}
								onclick={() => handleTeamSelect(match.id, 1)}
								type="button"
								title={match.team1Name}
							>1</button>
							<button
								class="team-btn"
								class:active={selected === 2}
								onclick={() => handleTeamSelect(match.id, 2)}
								type="button"
								title={match.team2Name}
							>2</button>
							<button
								class="team-btn skip"
								class:active={selected === null && isConfirmed}
								onclick={() => handleTeamSelect(match.id, null)}
								type="button"
								title={m.sync_iDidntPlay()}
							>—</button>
						</div>
					</div>
				{/each}
			</div>

			<div class="footer">
				<button class="btn secondary" onclick={close} type="button">
					{m.common_cancel()}
				</button>
				<button class="btn primary" onclick={handleConfirm} disabled={!canConfirm} type="button">
					{m.sync_syncSelected()}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal {
		background: #1a1d24;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		width: 420px;
		max-width: 92%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.title {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
	}

	.counter {
		font-size: 0.7rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.4);
		padding: 0.15rem 0.4rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.4rem;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.8);
	}

	.content {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.content::-webkit-scrollbar {
		width: 4px;
	}

	.content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
	}

	.match-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 6px;
		margin-bottom: 0.35rem;
		transition: background 0.15s;
	}

	.match-row:last-child {
		margin-bottom: 0;
	}

	.match-row.confirmed {
		background: rgba(76, 175, 80, 0.06);
	}

	.match-info {
		flex: 1;
		min-width: 0;
	}

	.match-header {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-bottom: 0.25rem;
	}

	.event-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.85);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.phase-sep {
		color: rgba(255, 255, 255, 0.2);
		font-size: 0.75rem;
	}

	.phase {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.45);
		font-weight: 500;
	}

	.match-details {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.date {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.35);
	}

	.teams-display {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
	}

	.team-name {
		font-weight: 500;
		max-width: 80px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.team-name.dark-color {
		background: rgba(255, 255, 255, 0.85);
		padding: 0.1rem 0.3rem;
		border-radius: 2px;
	}

	.score {
		color: rgba(255, 255, 255, 0.6);
		font-weight: 600;
		font-size: 0.7rem;
	}

	.team-buttons {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.team-btn {
		width: 28px;
		height: 28px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.03);
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.team-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.8);
	}

	.team-btn.active {
		background: rgba(76, 175, 80, 0.2);
		border-color: rgba(76, 175, 80, 0.5);
		color: #4caf50;
	}

	.team-btn.skip.active {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.6);
	}

	.footer {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.btn {
		flex: 1;
		padding: 0.55rem 0.75rem;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn.secondary {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
	}

	.btn.secondary:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
	}

	.btn.primary {
		background: rgba(76, 175, 80, 0.15);
		border: 1px solid rgba(76, 175, 80, 0.3);
		color: #4caf50;
	}

	.btn.primary:hover:not(:disabled) {
		background: rgba(76, 175, 80, 0.25);
		border-color: rgba(76, 175, 80, 0.5);
	}

	.btn.primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Mobile */
	@media (max-width: 480px) {
		.modal {
			max-height: 85vh;
		}

		.header {
			padding: 0.7rem 0.85rem;
		}

		.title {
			font-size: 0.85rem;
		}

		.content {
			padding: 0.4rem;
		}

		.match-row {
			padding: 0.5rem 0.6rem;
			gap: 0.5rem;
		}

		.event-name {
			font-size: 0.75rem;
		}

		.team-name {
			max-width: 60px;
		}

		.team-btn {
			width: 26px;
			height: 26px;
			font-size: 0.65rem;
		}

		.footer {
			padding: 0.6rem 0.85rem;
		}

		.btn {
			padding: 0.5rem 0.6rem;
			font-size: 0.75rem;
		}
	}

	/* Landscape mobile */
	@media (orientation: landscape) and (max-height: 500px) {
		.modal {
			max-height: 90vh;
		}

		.header {
			padding: 0.5rem 0.75rem;
		}

		.title {
			font-size: 0.8rem;
		}

		.match-row {
			padding: 0.4rem 0.5rem;
			margin-bottom: 0.25rem;
		}

		.event-name {
			font-size: 0.7rem;
		}

		.match-details {
			gap: 0.35rem;
		}

		.team-btn {
			width: 24px;
			height: 24px;
			font-size: 0.6rem;
		}

		.footer {
			padding: 0.5rem 0.75rem;
		}

		.btn {
			padding: 0.4rem 0.5rem;
			font-size: 0.7rem;
		}
	}
</style>
