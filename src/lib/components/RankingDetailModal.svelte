<script lang="ts">
	import Modal from './Modal.svelte';
	import { t } from '$lib/stores/language';
	import type { RankedPlayer } from '$lib/firebase/rankings';
	import type { TournamentTier } from '$lib/types/tournament';

	interface Props {
		isOpen?: boolean;
		player?: RankedPlayer | null;
		bestOfN?: number;
		onClose?: () => void;
	}

	let { isOpen = false, player = null, bestOfN = 2, onClose = () => {} }: Props = $props();

	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function getTierClass(tier?: TournamentTier): string {
		if (!tier) return '';
		return `tier-${tier.toLowerCase()}`;
	}
</script>

<Modal {isOpen} title={player ? `${$t('rankingOf')} ${player.playerName}` : ''} {onClose}>
	{#if player}
		<div class="ranking-detail">
			<div class="tournaments-list">
				{#each player.tournaments as tournament, index}
					<div class="tournament-row">
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
									<span class="tournament-tier {getTierClass(tournament.tier)}">
										{tournament.tier}
									</span>
								{/if}
							</div>
							<div class="tournament-meta">
								<span class="tournament-date">{formatDate(tournament.tournamentDate)}</span>
							</div>
						</div>
						<div class="tournament-right">
							<span class="tournament-points">+{tournament.rankingDelta}</span>
						</div>
					</div>
				{/each}
			</div>

			{#if player.tournaments.length > 0}
				<div class="total-row">
					{#if player.tournaments.length > 1}
						<span class="total-calculation">
							{player.tournaments.map((t) => t.rankingDelta).join(' + ')} =
						</span>
					{:else}
						<span class="total-label">{$t('totalSum')}</span>
					{/if}
					<span class="total-value">{player.totalPoints} {$t('pointsShort')}</span>
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
		border-radius: 6px;
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

	.tournament-tier {
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.tier-club {
		background: rgba(156, 163, 175, 0.25);
		color: #9ca3af;
	}

	.tier-regional {
		background: rgba(59, 130, 246, 0.25);
		color: #60a5fa;
	}

	.tier-national {
		background: rgba(168, 85, 247, 0.25);
		color: #a78bfa;
	}

	.tier-major {
		background: rgba(234, 179, 8, 0.25);
		color: #facc15;
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

	.total-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 0.75rem;
		background: rgba(0, 255, 136, 0.08);
		border-radius: 6px;
		border: 1px solid rgba(0, 255, 136, 0.2);
	}

	.total-calculation {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.total-label {
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
	}

	.total-value {
		font-weight: bold;
		color: var(--accent-green, #00ff88);
		font-size: 1.1rem;
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
			flex-direction: column;
			gap: 0.25rem;
			text-align: center;
		}
	}
</style>
