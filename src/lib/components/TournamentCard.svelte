<script lang="ts">
	import type { TournamentListItem } from '$lib/firebase/publicTournaments';
	import type { TournamentParticipant } from '$lib/types/tournament';
	import * as m from '$lib/paraglide/messages.js';
	import { translateCountry } from '$lib/utils/countryTranslations';
	import LiveBadge from './LiveBadge.svelte';

	interface Props {
		tournament: TournamentListItem;
		participants?: Partial<TournamentParticipant>[];
		onclick?: () => void;
	}

	let { tournament, participants = [], onclick }: Props = $props();

	const isDraft = $derived(tournament.status === 'DRAFT');
	const showParticipants = $derived(isDraft && participants.length > 0);

	const statusColors: Record<string, string> = {
		DRAFT: '#22c55e', // Vibrant green for LIVE
		GROUP_STAGE: '#f59e0b',
		TRANSITION: '#8b5cf6',
		FINAL_STAGE: '#3b82f6',
		COMPLETED: '#10b981',
		CANCELLED: '#6b7280', // Gray for cancelled
		UPCOMING: '#8b5cf6' // Purple for upcoming
	};

	// Check if tournament is "upcoming" (isImported + future date)
	const isUpcoming = $derived(() => {
		if (!tournament.isImported) return false;
		const now = Date.now();
		return tournament.tournamentDate && tournament.tournamentDate > now;
	});

	// Get display status (considering upcoming for imported tournaments)
	const displayStatus = $derived(() => {
		if (tournament.isImported && isUpcoming()) {
			return 'UPCOMING';
		}
		return tournament.status;
	});

	// Use translated status labels
	const getStatusLabel = (status: string): string => {
		// Handle upcoming case
		if (status === 'UPCOMING') return m.tournament_upcoming();

		const labels: Record<string, () => string> = {
			DRAFT: () => m.tournaments_statusLive(), // Show "EN VIVO" instead of "Borrador"
			GROUP_STAGE: () => m.tournament_groupStage(),
			TRANSITION: () => m.admin_transition(),
			FINAL_STAGE: () => m.tournament_finalStage(),
			COMPLETED: () => m.tournament_completed(),
			CANCELLED: () => m.admin_cancelled()
		};
		return labels[status]?.() || status;
	};

	const tierColors: Record<string, string> = {
		CLUB: '#6b7280',
		REGIONAL: '#3b82f6',
		NATIONAL: '#f59e0b',
		MAJOR: '#ef4444'
	};

	// Use translated tier labels
	const getTierLabel = (tier: string): string => {
		const labels: Record<string, () => string> = {
			CLUB: () => m.tournaments_tierClub(),
			REGIONAL: () => m.tournaments_tierRegional(),
			NATIONAL: () => m.tournaments_tierNational(),
			MAJOR: () => m.tournaments_tierMajor()
		};
		return labels[tier]?.() || tier;
	};

	function formatDate(timestamp?: number): string {
		if (!timestamp) return '—';
		const date = new Date(timestamp);
		return date.toLocaleDateString('es-ES', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((word) => word[0])
			.join('')
			.substring(0, 2)
			.toUpperCase();
	}

	const isPast = $derived(tournament.tournamentDate && tournament.tournamentDate < Date.now());

	// Check if tournament is LIVE
	const isLive = $derived(
		tournament.status === 'GROUP_STAGE' ||
		tournament.status === 'TRANSITION' ||
		tournament.status === 'FINAL_STAGE'
	);
</script>

<button class="card" class:past={isPast} class:live={isLive} class:has-poster={tournament.posterUrl} {onclick}>
	{#if tournament.posterUrl}
		<div class="poster-background" style="background-image: url({tournament.posterUrl})"></div>
	{/if}
	{#if isLive}
		<div class="live-indicator">
			<LiveBadge size="small" />
		</div>
	{/if}
	<div class="card-main">
		<div class="logo">
			{#if tournament.posterUrl}
				<img class="logo-img" src={tournament.posterUrl} alt={tournament.name} />
			{:else}
				<span class="logo-text">{getInitials(tournament.name)}</span>
			{/if}
		</div>

		<div class="info">
			<div class="title-row">
				{#if tournament.edition}
					<span class="edition">#{tournament.edition}</span>
				{/if}
				<h3 class="name">{tournament.name}</h3>
			</div>

			<div class="meta">
				<span class="location">
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
						<circle cx="12" cy="10" r="3" />
					</svg>
					<span class="location-text">{tournament.city}, {translateCountry(tournament.country)}</span>
				</span>
				<span class="date-link">
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
						<line x1="16" y1="2" x2="16" y2="6" />
						<line x1="8" y1="2" x2="8" y2="6" />
						<line x1="3" y1="10" x2="21" y2="10" />
					</svg>
					<span class="date-text">{formatDate(tournament.tournamentDate)}</span>
				</span>
			</div>
		</div>

		<div class="chevron">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M9 18l6-6-6-6" />
			</svg>
		</div>
	</div>

	<div class="card-footer">
		<div class="badges">
			<span class="badge mode">{tournament.gameType === 'singles' ? '1v1' : '2v2'}</span>
			<span class="badge status" style="--status-color: {statusColors[displayStatus()]}">
				{getStatusLabel(displayStatus())}
			</span>
			{#if tournament.tier}
				<span class="badge tier" style="--tier-color: {tierColors[tournament.tier]}">
					{getTierLabel(tournament.tier)}
				</span>
			{/if}
		</div>
		<span class="participants">
			<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
				<circle cx="9" cy="7" r="4" />
				<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
				<path d="M16 3.13a4 4 0 0 1 0 7.75" />
			</svg>
			{tournament.participantsCount}
		</span>
	</div>

	{#if showParticipants}
		<div class="participants-section">
			<div class="participants-list">
				{#each participants as p}
					<span class="participant-tag" class:guest={p.type === 'GUEST'}>
						{p.name}
					</span>
				{/each}
			</div>
		</div>
	{/if}
</button>

<style>
	.card {
		display: flex;
		flex-direction: column;
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 10px;
		padding: 0;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		width: 100%;
		height: 100%;
		font-family: inherit;
		overflow: hidden;
		position: relative;
	}

	/* Poster background */
	.poster-background {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-position: center;
		opacity: 0.25;
		transition: opacity 0.3s ease;
		z-index: 0;
	}

	/* Dark overlay for better text readability */
	.poster-background::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(15, 20, 25, 0.4) 0%, rgba(15, 20, 25, 0.7) 100%);
	}

	.card.has-poster:hover .poster-background {
		opacity: 0.35;
	}

	/* Text shadow for cards with poster */
	.card.has-poster .name {
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
	}

	.card.has-poster .location,
	.card.has-poster .date-link {
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
	}

	.card.has-poster .card-main,
	.card.has-poster .card-footer,
	.card.has-poster .participants-section {
		position: relative;
		z-index: 1;
	}

	.card.has-poster .live-indicator {
		z-index: 10;
	}

	.card:hover {
		border-color: #4a5568;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transform: translateY(-2px);
	}

	.card.past {
		opacity: 0.75;
	}

	.card.past:hover {
		opacity: 1;
	}

	/* LIVE card styles */
	.card.live {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%);
		border-color: rgba(16, 185, 129, 0.35);
	}

	.card.live:hover {
		border-color: rgba(16, 185, 129, 0.5);
		box-shadow: 0 4px 16px rgba(16, 185, 129, 0.2);
	}

	.card-main {
		display: flex;
		align-items: stretch;
		gap: 0.875rem;
		padding: 1rem;
		flex: 1;
	}

	.logo {
		width: 52px;
		border-radius: 10px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		overflow: hidden;
	}

	.logo:not(:has(.logo-img)) {
		height: 52px;
		align-self: flex-start;
	}

	.logo-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.logo-text {
		color: white;
		font-weight: 700;
		font-size: 1rem;
		letter-spacing: -0.5px;
	}

	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.edition {
		font-size: 0.7rem;
		font-weight: 600;
		color: #667eea;
		background: rgba(102, 126, 234, 0.15);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.name {
		font-size: 0.95rem;
		font-weight: 600;
		color: #e1e8ed;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
	}

	.location {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: #8b9bb3;
	}

	.date-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: #8b9bb3;
	}

	.icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 1rem;
		background: rgba(0, 0, 0, 0.15);
		border-top: 1px solid #2d3748;
	}

	.badges {
		display: flex;
		gap: 0.375rem;
		flex-wrap: wrap;
	}

	.badge {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.2rem 0.45rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.badge.mode {
		background: rgba(107, 114, 128, 0.2);
		color: #9ca3af;
	}

	.badge.status {
		background: color-mix(in srgb, var(--status-color) 20%, transparent);
		color: var(--status-color);
	}

	.badge.tier {
		background: color-mix(in srgb, var(--tier-color) 20%, transparent);
		color: var(--tier-color);
	}

	.live-indicator {
		position: absolute;
		top: 3.5rem;
		right: 0.75rem;
		z-index: 10;
	}

	.participants {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: #8b9bb3;
		font-weight: 500;
	}

	.participants .icon {
		width: 15px;
		height: 15px;
	}

	/* Participants section for DRAFT */
	.participants-section {
		padding: 0.5rem 0.75rem;
		background: rgba(102, 126, 234, 0.06);
		border-top: 1px solid #2d3748;
	}

	.participants-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.participant-tag {
		font-size: 0.65rem;
		padding: 0.15rem 0.4rem;
		background: rgba(255, 255, 255, 0.08);
		color: #94a3b8;
		border-radius: 3px;
		white-space: nowrap;
	}

	.participant-tag.guest {
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
	}

	.chevron {
		display: flex;
		align-items: center;
		align-self: center;
		justify-content: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		margin-left: auto;
		border-radius: 8px;
		background: rgba(102, 126, 234, 0.08);
		color: #667eea;
		transition: all 0.2s ease;
	}

	.chevron svg {
		width: 18px;
		height: 18px;
	}

	.card:hover .chevron {
		background: #667eea;
		color: white;
		transform: translateX(2px);
	}

	.card:active .chevron {
		background: #667eea;
		color: white;
		transform: scale(0.95);
	}

	@media (max-width: 480px) {
		.card-main {
			padding: 0.875rem;
			gap: 0.75rem;
		}

		.logo {
			width: 46px;
		}

		.logo:not(:has(.logo-img)) {
			height: 46px;
		}

		.logo-text {
			font-size: 0.9rem;
		}

		.name {
			font-size: 0.9rem;
		}

		.location,
		.date-link {
			font-size: 0.75rem;
		}

		.card-footer {
			padding: 0.5rem 0.875rem;
		}

		.badge {
			font-size: 0.6rem;
			padding: 0.15rem 0.35rem;
		}

		.chevron {
			width: 28px;
			height: 28px;
			background: rgba(102, 126, 234, 0.15);
		}

		.chevron svg {
			width: 16px;
			height: 16px;
		}
	}

	/* Light theme */
	:global([data-theme='light']) .poster-background {
		opacity: 0.2;
	}

	:global([data-theme='light']) .poster-background::after {
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.75) 100%);
	}

	:global([data-theme='light']) .card.has-poster:hover .poster-background {
		opacity: 0.3;
	}

	:global([data-theme='light']) .card.has-poster .name {
		text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
	}

	:global([data-theme='light']) .card {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .card:hover {
		border-color: #cbd5e0;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	:global([data-theme='light']) .card.live {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(5, 150, 105, 0.03) 100%);
		border-color: rgba(16, 185, 129, 0.3);
	}

	:global([data-theme='light']) .card.live:hover {
		border-color: rgba(16, 185, 129, 0.45);
		box-shadow: 0 4px 16px rgba(16, 185, 129, 0.15);
	}

	:global([data-theme='light']) .name {
		color: #1a202c;
	}

	:global([data-theme='light']) .location,
	:global([data-theme='light']) .date-link {
		color: #718096;
	}

	:global([data-theme='light']) .card-footer {
		background: #f7fafc;
		border-top-color: #e2e8f0;
	}

	:global([data-theme='light']) .badge.mode {
		background: rgba(107, 114, 128, 0.12);
		color: #6b7280;
	}

	:global([data-theme='light']) .participants {
		color: #718096;
	}

	:global([data-theme='light']) .chevron {
		background: rgba(102, 126, 234, 0.08);
	}

	:global([data-theme='light']) .card:hover .chevron,
	:global([data-theme='light']) .card:active .chevron {
		background: #667eea;
		color: white;
	}

	:global([data-theme='light']) .participants-section {
		background: rgba(102, 126, 234, 0.04);
		border-top-color: #e2e8f0;
	}

	:global([data-theme='light']) .participant-tag {
		background: rgba(0, 0, 0, 0.05);
		color: #64748b;
	}

	:global([data-theme='light']) .participant-tag.guest {
		background: rgba(245, 158, 11, 0.12);
		color: #b45309;
	}

	@media (max-width: 480px) {
		:global([data-theme='light']) .chevron {
			background: rgba(102, 126, 234, 0.12);
		}
	}
</style>
