<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { Tournament } from '$lib/types/tournament';
	import LiveBadge from '../LiveBadge.svelte';

	interface Props {
		tournament: Tournament;
	}

	let { tournament }: Props = $props();

	function getPhaseLabel(status: string | undefined): string {
		switch (status) {
			case 'GROUP_STAGE': return m.tournament_groupStage();
			case 'TRANSITION': return m.tournament_transition();
			case 'FINAL_STAGE': return m.tournament_finalStage();
			default: return '';
		}
	}

	function getModeLabel(mode: string | undefined): string {
		switch (mode) {
			case 'singles': return m.tournaments_singles();
			case 'doubles': return m.tournaments_doubles();
			default: return '';
		}
	}

	function getTierLabel(tier: string | undefined): string {
		switch (tier) {
			case 'CLUB': return m.tournaments_tierClub();
			case 'REGIONAL': return m.tournaments_tierRegional();
			case 'NATIONAL': return m.tournaments_tierNational();
			case 'MAJOR': return m.tournaments_tierMajor();
			default: return '';
		}
	}

	let activeParticipants = $derived(
		tournament.participants.filter(p => p.status === 'ACTIVE').length
	);
</script>

<div class="live-view">
	<!-- LIVE Badge -->
	<div class="live-header">
		<LiveBadge size="large" />
	</div>

	<!-- Key Stats -->
	<div class="stats-grid">
		<div class="stat-card">
			<span class="stat-value">{activeParticipants}</span>
			<span class="stat-label">{m.tournaments_participants()}</span>
		</div>
		<div class="stat-card highlight">
			<span class="stat-value">{getPhaseLabel(tournament.status)}</span>
			<span class="stat-label">{m.tournament_phase()}</span>
		</div>
		<div class="stat-card">
			<span class="stat-value">{getModeLabel(tournament.gameType)}</span>
			<span class="stat-label">{m.common_mode()}</span>
		</div>
		{#if tournament.rankingConfig?.tier}
			<div class="stat-card">
				<span class="stat-value tier-{tournament.rankingConfig.tier}">{getTierLabel(tournament.rankingConfig.tier)}</span>
				<span class="stat-label">Tier</span>
			</div>
		{/if}
	</div>

	<!-- Coming soon message -->
	<div class="coming-soon">
		<div class="coming-soon-icon">🚧</div>
		<p class="coming-soon-text">Coming soon...</p>
		<p class="coming-soon-desc">Live tournament details will be available here</p>
	</div>
</div>

<style>
	.live-view {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.live-header {
		display: flex;
		justify-content: center;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 1rem 0.75rem;
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 10px;
		text-align: center;
	}

	.stat-card.highlight {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.1) 100%);
		border-color: rgba(102, 126, 234, 0.3);
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: 700;
		color: #e1e8ed;
	}

	.stat-value.tier-MAJOR { color: #f59e0b; }
	.stat-value.tier-NATIONAL { color: #8b5cf6; }
	.stat-value.tier-REGIONAL { color: #10b981; }
	.stat-value.tier-CLUB { color: #6b7a94; }

	.stat-label {
		font-size: 0.7rem;
		color: #6b7a94;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.coming-soon {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem 1rem;
		background: #1a2332;
		border: 1px dashed #2d3748;
		border-radius: 12px;
		text-align: center;
	}

	.coming-soon-icon {
		font-size: 2.5rem;
		margin-bottom: 0.75rem;
	}

	.coming-soon-text {
		font-size: 1.1rem;
		font-weight: 600;
		color: #e1e8ed;
		margin: 0 0 0.35rem 0;
	}

	.coming-soon-desc {
		font-size: 0.85rem;
		color: #6b7a94;
		margin: 0;
	}

	/* Light theme */
	:global([data-theme='light']) .stat-card {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .stat-card.highlight {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.06) 100%);
	}

	:global([data-theme='light']) .stat-value {
		color: #1a202c;
	}

	:global([data-theme='light']) .stat-label {
		color: #718096;
	}

	:global([data-theme='light']) .coming-soon {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .coming-soon-text {
		color: #1a202c;
	}

	:global([data-theme='light']) .coming-soon-desc {
		color: #718096;
	}
</style>
