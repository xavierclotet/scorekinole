<script lang="ts">
	import type { TournamentListItem } from '$lib/firebase/publicTournaments';
	import * as m from '$lib/paraglide/messages.js';
	import { translateCountry } from '$lib/utils/countryTranslations';

	interface Props {
		tournament: TournamentListItem;
		onclick?: () => void;
	}

	let { tournament, onclick }: Props = $props();

	const statusColors: Record<string, string> = {
		DRAFT: '#6b7280',
		GROUP_STAGE: '#f59e0b',
		TRANSITION: '#8b5cf6',
		FINAL_STAGE: '#3b82f6',
		COMPLETED: '#10b981',
		CANCELLED: '#ef4444'
	};

	// Use translated status labels
	const getStatusLabel = (status: string): string => {
		const labels: Record<string, () => string> = {
			DRAFT: () => m.admin_draft(),
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

	function getGoogleCalendarUrl(): string {
		if (!tournament.tournamentDate) return '#';
		const date = new Date(tournament.tournamentDate);
		// Format: YYYYMMDD for all-day event
		const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
		// End date is next day for all-day event
		const nextDay = new Date(date);
		nextDay.setDate(nextDay.getDate() + 1);
		const endDateStr = nextDay.toISOString().split('T')[0].replace(/-/g, '');
		
		const params = new URLSearchParams({
			action: 'TEMPLATE',
			text: tournament.name,
			dates: `${dateStr}/${endDateStr}`,
			location: `${tournament.city}, ${tournament.country}`,
			details: `Torneo de Crokinole: ${tournament.name}`
		});
		return `https://calendar.google.com/calendar/render?${params.toString()}`;
	}

	const isPast = $derived(tournament.tournamentDate && tournament.tournamentDate < Date.now());
</script>

<button class="card" class:past={isPast} {onclick}>
	<div class="card-main">
		<div class="logo">
			<span class="logo-text">{getInitials(tournament.name)}</span>
		</div>

		<div class="info">
			<div class="title-row">
				{#if tournament.edition}
					<span class="edition">#{tournament.edition}</span>
				{/if}
				<h3 class="name">{tournament.name}</h3>
			</div>

			<div class="meta">
				<a 
					class="location" 
					href="https://www.google.com/maps/search/?api=1&query={encodeURIComponent(tournament.city + ', ' + tournament.country)}"
					target="_blank"
					rel="noopener noreferrer"
					onclick={(e) => e.stopPropagation()}
					title={m.tournaments_viewInMaps()}
				>
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
						<circle cx="12" cy="10" r="3" />
					</svg>
					<span class="location-text">{tournament.city}, {translateCountry(tournament.country)}</span>
					<svg class="external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" y1="14" x2="21" y2="3" />
					</svg>
				</a>
				<a 
					class="date-link"
					href={getGoogleCalendarUrl()}
					target="_blank"
					rel="noopener noreferrer"
					onclick={(e) => e.stopPropagation()}
					title={m.tournaments_addToCalendar()}
				>
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
						<line x1="16" y1="2" x2="16" y2="6" />
						<line x1="8" y1="2" x2="8" y2="6" />
						<line x1="3" y1="10" x2="21" y2="10" />
					</svg>
					<span class="date-text">{formatDate(tournament.tournamentDate)}</span>
					<svg class="external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" y1="14" x2="21" y2="3" />
					</svg>
				</a>
			</div>
		</div>
	</div>

	<div class="card-footer">
		<div class="badges">
			<span class="badge mode">{tournament.gameType === 'singles' ? '1v1' : '2v2'}</span>
			<span class="badge status" style="--status-color: {statusColors[tournament.status]}">
				{getStatusLabel(tournament.status)}
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
		font-family: inherit;
		overflow: hidden;
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

	.card-main {
		display: flex;
		gap: 0.875rem;
		padding: 1rem;
	}

	.logo {
		width: 52px;
		height: 52px;
		border-radius: 10px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
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
		gap: 0.25rem;
	}

	.location {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: #8b9bb3;
	}

	.location {
		text-decoration: none;
		transition: color 0.2s ease;
		cursor: pointer;
	}

	.location-text {
		border-bottom: 1px dashed transparent;
		transition: border-color 0.2s ease;
	}

	.location:hover .location-text {
		border-bottom-color: #667eea;
	}

	.external-icon {
		width: 10px;
		height: 10px;
		opacity: 0.6;
		transition: opacity 0.2s ease;
		flex-shrink: 0;
	}

	.location:hover {
		color: #667eea;
	}

	.location:hover .external-icon,
	.date-link:hover .external-icon {
		opacity: 1;
	}

	.date-link {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
		color: #8b9bb3;
		text-decoration: none;
		transition: color 0.2s ease;
		cursor: pointer;
	}

	.date-text {
		border-bottom: 1px dashed transparent;
		transition: border-color 0.2s ease;
	}

	.date-link:hover {
		color: #667eea;
	}

	.date-link:hover .date-text {
		border-bottom-color: #667eea;
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

	@media (max-width: 480px) {
		.card-main {
			padding: 0.875rem;
			gap: 0.75rem;
		}

		.logo {
			width: 46px;
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
	}

	/* Light theme */
	:global([data-theme='light']) .card {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .card:hover {
		border-color: #cbd5e0;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
</style>
