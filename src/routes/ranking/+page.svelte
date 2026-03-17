<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import {
		getAllUsersWithTournaments,
		getCompletedTournaments,
		getAvailableCountries,
		getAvailableYears,
		calculateRankings,
		type UserWithId,
		type TournamentInfo,
		type RankedPlayer,
		type RankingFilters
	} from '$lib/firebase/rankings';
	import RankingDetailModal from '$lib/components/RankingDetailModal.svelte';
	import AppMenu from '$lib/components/AppMenu.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import PullToRefresh from '$lib/components/PullToRefresh.svelte';
	import { getFlagUrl } from '$lib/utils/countryFlags';
	import { theme } from '$lib/stores/theme';
	import SEO from '$lib/components/SEO.svelte';
	import { ChevronRight } from '@lucide/svelte';

	// Data state
	let isLoading = $state(true);
	let users = $state<UserWithId[]>([]);
	let tournamentsMap = $state<Map<string, TournamentInfo>>(new Map());
	let rankedPlayers = $state<RankedPlayer[]>([]);

	// Filter state
	let selectedYear = $state(new Date().getFullYear());
	let availableYears = $state<number[]>([]);
	let bestOfN = $state(2);
	let filterType = $state<'all' | 'country'>('all');
	let selectedCountry = $state('');
	let availableCountries = $derived(
		tournamentsMap.size > 0 ? getAvailableCountries(tournamentsMap, selectedYear) : []
	);

	// Modal state
	let selectedPlayer = $state<RankedPlayer | null>(null);
	let showDetailModal = $state(false);

	// Infinite scroll state
	import { PAGE_SIZE } from '$lib/constants';
	let visibleCount = $state(PAGE_SIZE);
	let tableContainer = $state<HTMLElement | null>(null);
	let visiblePlayers = $derived(rankedPlayers.slice(0, visibleCount));
	let hasMore = $derived(visibleCount < rankedPlayers.length);

	// Auto-load more if container doesn't have scroll (also triggers when filters change)
	$effect(() => {
		if (tableContainer && hasMore && !isLoading && rankedPlayers.length >= 0) {
			// Use setTimeout to wait for DOM update after visiblePlayers changes
			setTimeout(() => {
				if (tableContainer && tableContainer.scrollHeight <= tableContainer.clientHeight) {
					loadMore();
				}
			}, 0);
		}
	});

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		isLoading = true;
		// Add a timeout fallback
		const timeout = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('Timeout loading data')), 15000)
		);

		try {
			// Load users and tournaments in parallel with timeout
			const [loadedUsers, loadedTournaments] = await Promise.race([
				Promise.all([
					getAllUsersWithTournaments(),
					getCompletedTournaments()
				]),
				timeout
			]) as [UserWithId[], Map<string, TournamentInfo>];

			users = loadedUsers;
			tournamentsMap = loadedTournaments;

			// Extract available years
			availableYears = getAvailableYears(tournamentsMap);

			// Set default year to most recent if current year has no tournaments
			if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
				selectedYear = availableYears[0];
			}

			// Set default country if available (availableCountries is $derived)
			if (availableCountries.length > 0 && !selectedCountry) {
				selectedCountry = availableCountries[0];
			}

			// Rankings will be calculated by the $effect when isLoading becomes false
		} catch (error) {
			console.error('Error loading ranking data:', error);
			// In case of error (or if dev server is stuck), stop loading
			// Maybe show a toast or message in future
		} finally {
			isLoading = false;
		}
	}

	function recalculateRankings() {
		const filters: RankingFilters = {
			year: selectedYear,
			filterType,
			countryValue: filterType === 'country' ? selectedCountry : undefined,
			bestOfN
		};

		rankedPlayers = calculateRankings(users, tournamentsMap, filters);
		visibleCount = PAGE_SIZE; // Reset visible count when filters change
	}

	function loadMore() {
		visibleCount = Math.min(visibleCount + PAGE_SIZE, rankedPlayers.length);
	}

	function handleScroll(e: Event) {
		const target = e.target as HTMLElement;
		const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

		// Load more when 100px from bottom
		if (scrollBottom < 100 && hasMore) {
			loadMore();
		}
	}

	// Reset country selection when available countries change and current selection is invalid
	$effect(() => {
		if (selectedCountry && availableCountries.length > 0 && !availableCountries.includes(selectedCountry)) {
			selectedCountry = availableCountries[0] || '';
		}
	});

	// Reactive recalculation when filters change
	$effect(() => {
		if (!isLoading && (selectedYear || filterType || selectedCountry || bestOfN)) {
			recalculateRankings();
		}
	});

	// Tournament columns: all unique tournaments from ranked players, sorted by date
	interface TournamentColumn {
		id: string;
		name: string;
		displayName: string;
		date: number;
		key?: string;
	}

	let tournamentColumns = $derived((() => {
		const seen = new Map<string, TournamentColumn>();
		for (const player of rankedPlayers) {
			for (const t of [...player.tournaments, ...player.otherTournaments]) {
				if (!seen.has(t.tournamentId)) {
					const info = tournamentsMap.get(t.tournamentId);
					const editionPrefix = info?.edition ? `${info.edition}·` : '';
					seen.set(t.tournamentId, {
						id: t.tournamentId,
						name: t.tournamentName,
						displayName: `${editionPrefix}${info?.shortName || t.tournamentName}`,
						date: t.tournamentDate,
						key: info?.key ?? t.tournamentId
					});
				}
			}
		}
		return Array.from(seen.values()).sort((a, b) => a.date - b.date);
	})());

	// Pre-build a lookup: playerId → tournamentId → points
	let playerTournamentPoints = $derived((() => {
		const map = new Map<string, Map<string, number>>();
		for (const player of rankedPlayers) {
			const playerMap = new Map<string, number>();
			for (const t of [...player.tournaments, ...player.otherTournaments]) {
				playerMap.set(t.tournamentId, t.rankingDelta);
			}
			map.set(player.odId, playerMap);
		}
		return map;
	})());

	function getPlayerTournamentPoints(playerId: string, tournamentId: string): number | null {
		return playerTournamentPoints.get(playerId)?.get(tournamentId) ?? null;
	}

	function handlePlayerClick(player: RankedPlayer) {
		selectedPlayer = player;
		showDetailModal = true;
	}

	function closeModal() {
		showDetailModal = false;
		selectedPlayer = null;
	}
</script>

<SEO
	title="Crokinole Player Rankings"
	description="Official crokinole player rankings based on tournament results. Track the best crokinole players, their performance history, and tournament achievements worldwide."
	keywords="crokinole rankings, crokinole players, crokinole leaderboard, best crokinole players, tournament rankings, scorekinole rankings"
	canonical="https://scorekinole.web.app/ranking"
/>

<div class="rankings-container" data-theme={$theme}>
	<header class="page-header">
		<div class="header-row">
			<div class="header-left">
				<AppMenu showHome homeHref="/" currentPage="ranking" />
			</div>
			<div class="header-center">
				<div class="title-section">
					<h1>{m.ranking_publicRankings()}</h1>
					<span class="count-badge">{rankedPlayers.length}</span>
				</div>
			</div>
			<div class="header-right">
				<ThemeToggle />
			</div>
		</div>
	</header>

	<PullToRefresh onrefresh={loadData}>
	<div class="controls-section">
		<div class="filter-tabs">
			<button
				class="filter-tab"
				class:active={filterType === 'all'}
				onclick={() => (filterType = 'all')}
			>
				{m.ranking_allTournaments()}
			</button>
			<button
				class="filter-tab"
				class:active={filterType === 'country'}
				onclick={() => (filterType = 'country')}
			>
				{m.ranking_byCountry()}
			</button>
		</div>

		<div class="filter-selects">
			<select class="filter-select year-filter" bind:value={selectedYear}>
				{#each availableYears as year}
					<option value={year}>{year}</option>
				{/each}
				{#if availableYears.length === 0}
					<option value={selectedYear}>{selectedYear}</option>
				{/if}
			</select>

			{#if filterType === 'country'}
				<select class="filter-select" bind:value={selectedCountry}>
					{#each availableCountries as country}
						<option value={country}>{country}</option>
					{/each}
				</select>
			{/if}
		</div>

		<div class="bestof-control">
			<label for="bestof-select">{m.ranking_bestOf()}</label>
			<select id="bestof-select" class="bestof-select" bind:value={bestOfN}>
				<option value={0}>{m.ranking_allTournaments()}</option>
				{#each [2, 3, 4, 5] as n}
					<option value={n}>{n}</option>
				{/each}
			</select>
			<span class="bestof-suffix">{m.ranking_bestOfTournaments()}</span>
		</div>
	</div>

	{#if isLoading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>{m.common_loading()}...</p>
		</div>
	{:else if rankedPlayers.length === 0}
		<div class="flex items-center justify-center min-h-[calc(100vh-280px)] p-8">
			<div class="flex flex-col items-center text-center max-w-[300px]">
				<div class="empty-icon w-20 h-20 mb-6 p-5 rounded-full flex items-center justify-center">
					<svg class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" />
						<path d="M12 2a4 4 0 0 0-4 4c0 1.5.8 2.8 2 3.5L12 15l2-5.5A4 4 0 0 0 12 2z" />
					</svg>
				</div>
				<h3 class="empty-title text-lg font-semibold">{m.ranking_noRankingsFound()}</h3>
			</div>
		</div>
	{:else}
		<div class="results-info">
			{m.admin_showingOf({ showing: String(visiblePlayers.length), total: String(rankedPlayers.length) })}
		</div>

		<div class="table-container" bind:this={tableContainer} onscroll={handleScroll}>
			<table class="rankings-table">
				<thead>
					<tr>
						<th class="pos-col">#</th>
						<th class="player-col">{m.tournament_playerColumn()}</th>
						{#each tournamentColumns as col (col.id)}
							<th class="tournament-pts-col" title={col.name}>
								<span class="tournament-col-name">{col.displayName}</span>
							</th>
						{/each}
						<th class="points-col">{m.scoring_points()}</th>
					</tr>
				</thead>
				<tbody>
					{#each visiblePlayers as player, index (player.odId)}
						<tr
							class="player-row"
							class:top-1={index === 0}
							class:top-2={index === 1}
							class:top-3={index === 2}
						>
							<td class="pos-cell">
								<span class="position" class:gold={index === 0} class:silver={index === 1} class:bronze={index === 2}>
									{index + 1}
								</span>
							</td>
							<td class="player-cell">
								<div class="player-info">
									{#if player.photoURL}
										<img src={player.photoURL} alt="" class="player-avatar" referrerpolicy="no-referrer" />
									{:else}
										<div class="player-avatar-placeholder">
											{player.playerName.charAt(0).toUpperCase()}
										</div>
									{/if}
									<a href="/users/{player.key || player.odId}" class="player-name-link">
										{player.playerName}
										{#if player.country}
											<img class="player-country-flag" src={getFlagUrl(player.country)} alt={player.country} />
										{/if}
									</a>
								</div>
							</td>
							{#each tournamentColumns as col (col.id)}
								{@const pts = getPlayerTournamentPoints(player.odId, col.id)}
								<td class="tournament-pts-cell" class:has-points={pts !== null} class:counted={player.tournaments.some(t => t.tournamentId === col.id)}>
									{#if pts !== null}
										<span class="tournament-pts-value">{pts}</span>
									{:else}
										<span class="tournament-pts-empty">–</span>
									{/if}
								</td>
							{/each}
							<td class="points-cell">
								<button class="points-button" onclick={() => handlePlayerClick(player)}>
									<span class="points-value">{player.totalPoints}</span><span class="points-unit">pts</span>
									<ChevronRight class="points-chevron" />
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if hasMore}
				<div class="load-more-hint">
					{m.admin_scrollToLoadMore()}
				</div>
			{:else if rankedPlayers.length > 0}
				<div class="end-of-list">
					{m.admin_endOfList()}
				</div>
			{/if}
		</div>
	{/if}
	</PullToRefresh>
</div>

<RankingDetailModal isOpen={showDetailModal} player={selectedPlayer} year={selectedYear} onClose={closeModal} />

<style>
	:global(body) {
		margin: 0;
		font-family: 'Lexend', system-ui, -apple-system, sans-serif;
	}

	.rankings-container {
		min-height: 100vh;
		background: #0f1419;
		padding: 1.5rem 2rem;
		padding-top: max(1.5rem, env(safe-area-inset-top, 1.5rem));
		padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem));
	}

	/* Header */
	.page-header {
		background: #1a2332;
		border-bottom: 1px solid #2d3748;
		padding: 0.75rem 1.5rem;
		margin: -1.5rem -2rem 1.5rem -2rem;
	}

	.header-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-shrink: 0;
	}

	.header-center {
		flex: 1;
		display: flex;
		justify-content: left;
		min-width: 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.title-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.title-section h1 {
		font-size: 1.1rem;
		margin: 0;
		color: #e1e8ed;
		font-weight: 700;
		white-space: nowrap;
	}

	.count-badge {
		padding: 0.2rem 0.6rem;
		background: #0f1419;
		color: #8b9bb3;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	/* Controls */
	.controls-section {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.filter-tabs {
		display: flex;
		gap: 0.25rem;
	}

	.filter-selects {
		display: flex;
		gap: 0.5rem;
	}

	.filter-tab {
		padding: 0.4rem 0.75rem;
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 4px;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.2s;
		color: #8b9bb3;
	}

	.filter-tab:hover {
		background: #2d3748;
		border-color: #667eea;
	}

	.filter-tab.active {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border-color: transparent;
		font-weight: 600;
	}

	.filter-select {
		padding: 0.4rem 2rem 0.4rem 0.75rem;
		background-color: #1a2332;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%238b9bb3' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.5rem center;
		border: 1px solid #2d3748;
		border-radius: 4px;
		color: #e1e8ed;
		font-size: 0.8rem;
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
	}

	.filter-select:focus {
		outline: none;
		border-color: #667eea;
	}

	.filter-select option {
		background: #1a2332;
		color: #e1e8ed;
	}

	.bestof-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}

	.bestof-control label,
	.bestof-suffix {
		color: #8b9bb3;
		font-size: 0.8rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.bestof-select {
		padding: 0.35rem 1.8rem 0.35rem 0.5rem;
		background-color: #1a2332;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%238b9bb3' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.4rem center;
		border: 1px solid #2d3748;
		border-radius: 4px;
		color: #e1e8ed;
		max-width: 5rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		min-width: 50px;
	}

	.bestof-select:focus {
		outline: none;
		border-color: #667eea;
	}

	.bestof-select option {
		background: #1a2332;
		color: #e1e8ed;
	}

	/* Results info */
	.results-info {
		font-size: 0.75rem;
		color: #6b7a94;
		margin-bottom: 0.5rem;
	}

	/* Loading state */
	.loading-state {
		text-align: center;
		padding: 4rem 2rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		margin: 0 auto 1rem;
		border: 3px solid #2d3748;
		border-top: 3px solid #667eea;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.loading-state p {
		color: #8b9bb3;
	}

	/* Empty state (theme-dependent styles only) */
	.empty-icon {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
	}

	.empty-icon svg {
		stroke: #667eea;
	}

	.empty-title {
		color: #e1e8ed;
		margin: 0;
	}

	/* Table */
	.table-container {
		overflow-x: auto;
		overflow-y: auto;
		max-height: calc(100vh - 220px);
		background: #1a2332;
		border-radius: 6px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.rankings-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.rankings-table thead {
		background: #0f1419;
		border-bottom: 1px solid #2d3748;
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.rankings-table th {
		padding: 0.6rem 0.75rem;
		text-align: left;
		font-weight: 600;
		color: #8b9bb3;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.rankings-table .pos-col { width: 50px; text-align: center; }
	.rankings-table .points-col { width: 90px; }

	/* Tournament point columns */
	.rankings-table .tournament-pts-col {
		text-align: center;
		padding: 0.4rem 0.5rem;
		max-width: 120px;
	}

	.tournament-col-name {
		font-size: 0.65rem;
		letter-spacing: 0;
		line-height: 1.2;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tournament-pts-cell {
		text-align: center;
		padding: 0.4rem 0.25rem;
		vertical-align: middle;
	}

	.tournament-pts-value {
		font-size: 0.8rem;
		font-weight: 600;
		color: #8b9bb3;
	}

	.tournament-pts-cell.counted .tournament-pts-value {
		color: #fbbf24;
		font-weight: 700;
	}

	.tournament-pts-empty {
		font-size: 0.75rem;
		color: #3a4556;
	}

	.player-row {
		border-bottom: 1px solid #2d3748;
		transition: all 0.15s;
	}

	.player-row:nth-child(even):not(.top-1):not(.top-2):not(.top-3) {
		background: rgba(15, 20, 25, 0.5);
	}

	.player-row:hover {
		background: #0f1419;
	}

	.player-row.top-1 {
		background: rgba(255, 215, 0, 0.08);
	}

	.player-row.top-1:hover {
		background: rgba(255, 215, 0, 0.12);
	}

	.player-row.top-2 {
		background: rgba(192, 192, 192, 0.06);
	}

	.player-row.top-2:hover {
		background: rgba(192, 192, 192, 0.1);
	}

	.player-row.top-3 {
		background: rgba(205, 127, 50, 0.06);
	}

	.player-row.top-3:hover {
		background: rgba(205, 127, 50, 0.1);
	}

	.rankings-table td {
		padding: 0.5rem 0.75rem;
		color: #e1e8ed;
	}

	/* Position cell */
	.pos-cell {
		text-align: center;
	}

	.position {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		font-weight: 700;
		font-size: 0.8rem;
		background: #2d3748;
		color: #8b9bb3;
	}

	.position.gold {
		background: linear-gradient(135deg, #ffd700 0%, #ffb800 100%);
		color: #1a1a1a;
	}

	.position.silver {
		background: linear-gradient(135deg, #c0c0c0 0%, #a8a8a8 100%);
		color: #1a1a1a;
	}

	.position.bronze {
		background: linear-gradient(135deg, #cd7f32 0%, #b8702e 100%);
		color: #fff;
	}

	/* Player cell */
	.player-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.player-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.player-avatar-placeholder {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: 600;
		flex-shrink: 0;
	}

	.player-name-link {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
		color: var(--primary, #667eea);
		text-decoration: none;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}

	.player-country-flag {
		height: 0.85em;
		width: auto;
		flex-shrink: 0;
		border-radius: 1px;
	}

	.player-name-link:hover {
		text-decoration: underline;
		opacity: 0.85;
	}

	/* Points cell */
	.points-cell {
		vertical-align: middle;
	}

	.points-button {
		background: rgba(251, 191, 36, 0.08);
		border: 1px solid rgba(251, 191, 36, 0.2);
		padding: 3px 6px 3px 8px;
		border-radius: 99px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 1px;
		transition: all 0.15s;
		font-family: inherit;
	}

	.points-button:hover {
		background: rgba(251, 191, 36, 0.15);
		border-color: rgba(251, 191, 36, 0.35);
	}

	.points-button :global(.points-chevron) {
		width: 14px;
		height: 14px;
		color: rgba(251, 191, 36, 0.5);
		flex-shrink: 0;
	}

	.points-value {
		font-weight: 700;
		color: #fbbf24;
		font-size: 0.9rem;
	}

	.points-unit {
		font-size: 0.7rem;
		color: #6b7a94;
		margin-left: 0.25rem;
	}

	/* Scroll indicators */
	.load-more-hint,
	.end-of-list {
		text-align: center;
		padding: 1rem;
		color: #6b7a94;
		font-size: 0.85rem;
	}

	.end-of-list {
		border-top: 1px dashed #2d3748;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.rankings-container {
			padding: 1rem;
		}

		.page-header {
			margin: -1rem -1rem 1rem -1rem;
			padding: 0.75rem 1rem;
		}

		.filter-tabs,
		.filter-selects {
			display: contents;
		}

		.bestof-control {
			margin-left: auto;
		}

		.table-container {
			max-height: calc(100vh - 200px);
		}
	}

	@media (max-width: 640px) {
		.title-section h1 {
			font-size: 1rem;
		}

		.filter-tab {
			padding: 0.35rem 0.5rem;
			font-size: 0.75rem;
		}

		.filter-select {
			font-size: 0.7rem;
			padding: 0.35rem 1.2rem 0.35rem 0.4rem;
			background-position: right 0.3rem center;
		}
	}

	@media (max-width: 480px) {
		.filter-tab,
		.filter-select {
			padding: 0.3rem 0.4rem;
			font-size: 0.65rem;
		}

		.filter-select {
			padding-right: 1rem;
			background-position: right 0.2rem center;
		}

		.bestof-control {
			font-size: 0.7rem;
			gap: 0.3rem;
		}

		.bestof-control label,
		.bestof-suffix {
			font-size: 0.65rem;
		}

		.bestof-select {
			padding: 0.3rem 1.2rem 0.3rem 0.4rem;
			font-size: 0.7rem;
			min-width: 40px;
		}

		.rankings-table th,
		.rankings-table td {
			padding: 0.4rem 0.5rem;
		}

		.player-avatar,
		.player-avatar-placeholder {
			width: 28px;
			height: 28px;
			font-size: 0.75rem;
		}

		.player-name-link {
			font-size: 0.85rem;
		}

		.points-button {
			padding: 2px 4px 2px 6px;
		}

		.points-button :global(.points-chevron) {
			width: 12px;
			height: 12px;
		}

		.position {
			width: 24px;
			height: 24px;
			font-size: 0.75rem;
		}
	}

	/* Landscape adjustments */
	@media (orientation: landscape) and (max-height: 500px) {
		.rankings-container {
			padding: 0.75rem 1rem;
		}

		.page-header {
			margin: -0.75rem -1rem 0.75rem -1rem;
			padding: 0.5rem 1rem;
		}

		.controls-section {
			margin-bottom: 0.5rem;
		}

		.table-container {
			max-height: calc(100vh - 140px);
		}

		.rankings-table th,
		.rankings-table td {
			padding: 0.35rem 0.5rem;
		}
	}

	/* Light theme */
	.rankings-container[data-theme='light'] {
		background: #f5f7fa;
	}

	.rankings-container[data-theme='light'] .page-header {
		background: #ffffff;
		border-bottom-color: #e2e8f0;
	}

	.rankings-container[data-theme='light'] .title-section h1 {
		color: #1a202c;
	}

	.rankings-container[data-theme='light'] .count-badge {
		background: #e2e8f0;
		color: #4a5568;
	}

	.rankings-container[data-theme='light'] .filter-tab {
		background: #ffffff;
		border-color: #e2e8f0;
		color: #4a5568;
	}

	.rankings-container[data-theme='light'] .filter-tab:hover {
		background: #f7fafc;
		border-color: #667eea;
	}

	.rankings-container[data-theme='light'] .filter-select,
	.rankings-container[data-theme='light'] .bestof-select {
		background-color: #ffffff;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%234a5568' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
		border-color: #e2e8f0;
		color: #1a202c;
	}

	.rankings-container[data-theme='light'] .filter-select option,
	.rankings-container[data-theme='light'] .bestof-select option {
		background: #ffffff;
		color: #1a202c;
	}

	.rankings-container[data-theme='light'] .bestof-control label,
	.rankings-container[data-theme='light'] .bestof-suffix {
		color: #4a5568;
	}

	.rankings-container[data-theme='light'] .results-info {
		color: #718096;
	}

	.rankings-container[data-theme='light'] .spinner {
		border-color: #e2e8f0;
		border-top-color: #667eea;
	}

	.rankings-container[data-theme='light'] .loading-state p {
		color: #718096;
	}

	.rankings-container[data-theme='light'] .empty-icon {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
	}

	.rankings-container[data-theme='light'] .empty-icon svg {
		stroke: #a0aec0;
	}

	.rankings-container[data-theme='light'] .empty-title {
		color: #1a202c;
	}

	.rankings-container[data-theme='light'] .table-container {
		background: #ffffff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.rankings-container[data-theme='light'] .rankings-table thead {
		background: #f7fafc;
		border-bottom-color: #e2e8f0;
	}

	.rankings-container[data-theme='light'] .rankings-table th {
		color: #4a5568;
	}

	.rankings-container[data-theme='light'] .player-row {
		border-bottom-color: #e2e8f0;
	}

	.rankings-container[data-theme='light'] .player-row:nth-child(even):not(.top-1):not(.top-2):not(.top-3) {
		background: rgba(247, 250, 252, 0.5);
	}

	.rankings-container[data-theme='light'] .player-row:hover {
		background: #f7fafc;
	}

	.rankings-container[data-theme='light'] .player-row.top-1:hover {
		background: rgba(255, 215, 0, 0.15);
	}

	.rankings-container[data-theme='light'] .player-row.top-2:hover {
		background: rgba(192, 192, 192, 0.15);
	}

	.rankings-container[data-theme='light'] .player-row.top-3:hover {
		background: rgba(205, 127, 50, 0.15);
	}

	.rankings-container[data-theme='light'] .rankings-table td {
		color: #1a202c;
	}

	.rankings-container[data-theme='light'] .position {
		background: #e2e8f0;
		color: #4a5568;
	}

	.rankings-container[data-theme='light'] .points-button {
		background: rgba(217, 119, 6, 0.06);
		border-color: rgba(217, 119, 6, 0.2);
	}

	.rankings-container[data-theme='light'] .points-button:hover {
		background: rgba(217, 119, 6, 0.12);
		border-color: rgba(217, 119, 6, 0.35);
	}

	.rankings-container[data-theme='light'] .points-button :global(.points-chevron) {
		color: rgba(217, 119, 6, 0.4);
	}

	.rankings-container[data-theme='light'] .points-unit {
		color: #718096;
	}

	.rankings-container[data-theme='light'] .tournament-pts-value {
		color: #718096;
	}

	.rankings-container[data-theme='light'] .tournament-pts-cell.counted .tournament-pts-value {
		color: #b45309;
		font-weight: 700;
	}

	.rankings-container[data-theme='light'] .tournament-pts-empty {
		color: #cbd5e0;
	}

	.rankings-container[data-theme='light'] .load-more-hint,
	.rankings-container[data-theme='light'] .end-of-list {
		color: #718096;
	}

	.rankings-container[data-theme='light'] .end-of-list {
		border-top-color: #e2e8f0;
	}
</style>
