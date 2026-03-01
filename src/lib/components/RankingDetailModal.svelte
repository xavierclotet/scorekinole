<script lang="ts">
	import Modal from './Modal.svelte';
	import TierBadge from './TierBadge.svelte';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { RankedPlayer } from '$lib/firebase/rankings';

	interface Props {
		isOpen?: boolean;
		player?: RankedPlayer | null;
		year?: number;
		onClose?: () => void;
	}

	let { isOpen = false, player = null, year = new Date().getFullYear(), onClose = () => {} }: Props = $props();

	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<Modal {isOpen} title={player ? `${m.ranking_of()} ${player.playerName} ${year}` : ''} {onClose}>
	{#if player}
		<div class="ranking-detail" data-theme={$theme}>
			<div class="tournaments-list">
				{#each player.tournaments as tournament}
					<a class="tournament-row" href="/tournaments/{tournament.key || tournament.tournamentId}">
						<div class="tournament-left">
							<div class="position-badge" class:gold={tournament.finalPosition === 1} class:silver={tournament.finalPosition === 2} class:bronze={tournament.finalPosition === 3}>
								<span class="position-number">{tournament.finalPosition}º</span>
								<span class="position-total">/{tournament.totalParticipants}</span>
							</div>
						</div>
						<div class="tournament-center">
							<div class="tournament-main">
								<span class="tournament-name">{tournament.tournamentName}</span>
								{#if tournament.tier}
									<TierBadge tier={tournament.tier} />
								{/if}
							</div>
							<div class="tournament-meta">
								<span class="tournament-date">{formatDate(tournament.tournamentDate)}</span>
							</div>
						</div>
						<div class="tournament-right">
							<span class="tournament-points">+{tournament.rankingDelta}</span>
						</div>
					</a>
				{/each}
			</div>

			{#if player.tournaments.length > 0}
				<div class="total-row">
					<div class="total-left">
						{#if player.tournaments.length > 1}
							<span class="total-calc">{player.tournaments.map((t) => t.rankingDelta).join(' + ')}</span>
						{:else}
							<span class="total-label">{m.ranking_totalSum()}</span>
						{/if}
					</div>
					<div class="total-right">
						<span class="total-value">{player.totalPoints}</span>
						<span class="total-unit">{m.ranking_pointsShort()}</span>
					</div>
				</div>
			{/if}

			{#if player.otherTournaments?.length}
				<div class="other-section">
					<div class="other-header">{m.ranking_otherTournaments({ year: String(year) })}</div>
					<div class="tournaments-list">
						{#each player.otherTournaments as tournament}
							<a class="tournament-row other" href="/tournaments/{tournament.key || tournament.tournamentId}">
								<div class="tournament-left">
									<div class="position-badge" class:gold={tournament.finalPosition === 1} class:silver={tournament.finalPosition === 2} class:bronze={tournament.finalPosition === 3}>
										<span class="position-number">{tournament.finalPosition}º</span>
										<span class="position-total">/{tournament.totalParticipants}</span>
									</div>
								</div>
								<div class="tournament-center">
									<div class="tournament-main">
										<span class="tournament-name">{tournament.tournamentName}</span>
										{#if tournament.tier}
											<TierBadge tier={tournament.tier} />
										{/if}
									</div>
									<div class="tournament-meta">
										<span class="tournament-date">{formatDate(tournament.tournamentDate)}</span>
									</div>
								</div>
								<div class="tournament-right">
									<span class="tournament-points other-points">+{tournament.rankingDelta}</span>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</Modal>

<style>
	.ranking-detail {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.tournaments-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.tournament-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
		transition: background 0.15s ease;
	}

	.tournament-row:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.tournament-left {
		flex-shrink: 0;
	}

	.position-badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		padding: 0.3rem 0.4rem;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.position-badge.gold {
		background: rgba(255, 215, 0, 0.15);
		border-color: rgba(255, 215, 0, 0.4);
	}

	.position-badge.silver {
		background: rgba(192, 192, 192, 0.15);
		border-color: rgba(192, 192, 192, 0.4);
	}

	.position-badge.bronze {
		background: rgba(205, 127, 50, 0.15);
		border-color: rgba(205, 127, 50, 0.4);
	}

	.position-number {
		font-size: 1.1rem;
		font-weight: bold;
		color: white;
		line-height: 1;
	}

	.position-badge.gold .position-number {
		color: #ffd700;
	}

	.position-badge.silver .position-number {
		color: #c0c0c0;
	}

	.position-badge.bronze .position-number {
		color: #cd7f32;
	}

	.position-total {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.5);
		line-height: 1;
	}

	.tournament-center {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.tournament-main {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.tournament-name {
		font-weight: 500;
		color: white;
		font-size: 0.9rem;
	}

	.tournament-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tournament-date {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.45);
	}

	.tournament-right {
		flex-shrink: 0;
	}

	.tournament-points {
		font-weight: 700;
		font-size: 1rem;
		color: var(--accent-green, #00ff88);
	}

	/* Total row — scoreboard style */
	.total-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.7rem 0.85rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 8px;
		border-left: 3px solid rgba(0, 255, 136, 0.5);
	}

	.total-left {
		min-width: 0;
	}

	.total-calc {
		font-size: 0.8rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.4);
		font-variant-numeric: tabular-nums;
	}

	.total-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.total-right {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		flex-shrink: 0;
	}

	.total-value {
		font-weight: 800;
		color: var(--accent-green, #00ff88);
		font-size: 1.5rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
	}

	.total-unit {
		font-size: 0.65rem;
		font-weight: 700;
		color: rgba(0, 255, 136, 0.4);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Other tournaments section */
	.other-section {
		margin-top: 0.25rem;
		padding-top: 0.75rem;
		border-top: 1px dashed rgba(255, 255, 255, 0.1);
	}

	.other-header {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.35);
		margin-bottom: 0.5rem;
	}

	.tournament-row.other {
		opacity: 0.55;
	}

	.other-points {
		color: rgba(255, 255, 255, 0.4) !important;
	}

	/* Mobile responsiveness */
	@media (max-width: 600px) {
		.tournament-row {
			padding: 0.5rem;
			gap: 0.5rem;
		}

		.position-badge {
			min-width: 38px;
			padding: 0.25rem 0.35rem;
		}

		.position-number {
			font-size: 1rem;
		}

		.tournament-name {
			font-size: 0.85rem;
		}

		.tournament-points {
			font-size: 0.9rem;
		}

		.total-row {
			padding: 0.6rem 0.75rem;
		}

		.total-value {
			font-size: 1.3rem;
		}
	}

	/* Light theme */
	.ranking-detail[data-theme='light'] .tournament-row {
		background: rgba(0, 0, 0, 0.03);
	}

	.ranking-detail[data-theme='light'] .tournament-row:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	.ranking-detail[data-theme='light'] .position-badge {
		background: rgba(0, 0, 0, 0.05);
		border-color: rgba(0, 0, 0, 0.1);
	}

	.ranking-detail[data-theme='light'] .position-badge.gold {
		background: rgba(255, 215, 0, 0.15);
		border-color: rgba(255, 215, 0, 0.4);
	}

	.ranking-detail[data-theme='light'] .position-badge.silver {
		background: rgba(192, 192, 192, 0.2);
		border-color: rgba(192, 192, 192, 0.5);
	}

	.ranking-detail[data-theme='light'] .position-badge.bronze {
		background: rgba(205, 127, 50, 0.15);
		border-color: rgba(205, 127, 50, 0.4);
	}

	.ranking-detail[data-theme='light'] .position-number {
		color: #1a202c;
	}

	.ranking-detail[data-theme='light'] .position-badge.gold .position-number {
		color: #b8860b;
	}

	.ranking-detail[data-theme='light'] .position-badge.silver .position-number {
		color: #6b7280;
	}

	.ranking-detail[data-theme='light'] .position-badge.bronze .position-number {
		color: #a0522d;
	}

	.ranking-detail[data-theme='light'] .position-total {
		color: rgba(0, 0, 0, 0.45);
	}

	.ranking-detail[data-theme='light'] .tournament-name {
		color: #1a202c;
	}

	.ranking-detail[data-theme='light'] .tournament-date {
		color: rgba(0, 0, 0, 0.5);
	}

	.ranking-detail[data-theme='light'] .tournament-points {
		color: #059669;
	}

	.ranking-detail[data-theme='light'] .total-row {
		background: rgba(0, 0, 0, 0.025);
		border-left-color: rgba(5, 150, 105, 0.5);
	}

	.ranking-detail[data-theme='light'] .total-calc {
		color: rgba(0, 0, 0, 0.4);
	}

	.ranking-detail[data-theme='light'] .total-label {
		color: rgba(0, 0, 0, 0.5);
	}

	.ranking-detail[data-theme='light'] .total-value {
		color: #059669;
	}

	.ranking-detail[data-theme='light'] .total-unit {
		color: rgba(5, 150, 105, 0.45);
	}

	.ranking-detail[data-theme='light'] .other-section {
		border-top-color: rgba(0, 0, 0, 0.1);
	}

	.ranking-detail[data-theme='light'] .other-header {
		color: rgba(0, 0, 0, 0.35);
	}

	.ranking-detail[data-theme='light'] .other-points {
		color: rgba(0, 0, 0, 0.35) !important;
	}
</style>
