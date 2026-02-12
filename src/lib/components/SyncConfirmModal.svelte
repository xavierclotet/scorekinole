<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { theme } from '$lib/stores/theme';
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
	<div class="overlay" data-theme={$theme} onclick={close} onkeydown={handleKeydown} role="button" tabindex="-1">
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
		background: var(--card);
		border-radius: 10px;
		border: 1px solid var(--border);
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
		border-bottom: 1px solid var(--border);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--foreground);
	}

	.counter {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--muted-foreground);
		padding: 0.15rem 0.4rem;
		background: var(--secondary);
		border-radius: 4px;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.4rem;
		color: var(--muted-foreground);
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
		background: var(--accent);
		color: var(--foreground);
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
		background: var(--muted);
		border-radius: 2px;
	}

	.match-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: var(--secondary);
		border-radius: 6px;
		margin-bottom: 0.35rem;
		transition: background 0.15s;
	}

	.match-row:last-child {
		margin-bottom: 0;
	}

	.match-row.confirmed {
		background: color-mix(in srgb, var(--primary) 10%, transparent);
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
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.phase-sep {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		opacity: 0.5;
	}

	.phase {
		font-size: 0.75rem;
		color: var(--muted-foreground);
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
		color: var(--muted-foreground);
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
		color: var(--muted-foreground);
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
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--secondary);
		color: var(--muted-foreground);
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.team-btn:hover {
		background: var(--accent);
		border-color: var(--border);
		color: var(--foreground);
	}

	.team-btn.active {
		background: color-mix(in srgb, var(--primary) 20%, transparent);
		border-color: color-mix(in srgb, var(--primary) 50%, transparent);
		color: var(--primary);
	}

	.team-btn.skip.active {
		background: var(--accent);
		border-color: var(--border);
		color: var(--muted-foreground);
	}

	.footer {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--border);
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
		background: var(--secondary);
		border: 1px solid var(--border);
		color: var(--muted-foreground);
	}

	.btn.secondary:hover {
		background: var(--accent);
		color: var(--foreground);
	}

	.btn.primary {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
		color: var(--primary);
	}

	.btn.primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--primary) 25%, transparent);
		border-color: color-mix(in srgb, var(--primary) 50%, transparent);
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
