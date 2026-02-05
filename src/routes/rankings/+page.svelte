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
	import ScorekinoleLogo from '$lib/components/ScorekinoleLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { theme } from '$lib/stores/theme';
	import SEO from '$lib/components/SEO.svelte';

	// Data state
	let isLoading = true;
	let users: UserWithId[] = [];
	let tournamentsMap: Map<string, TournamentInfo> = new Map();
	let rankedPlayers: RankedPlayer[] = [];

	// Filter state
	let selectedYear = new Date().getFullYear();
	let availableYears: number[] = [];
	let bestOfN = 2;
	let filterType: 'all' | 'country' = 'all';
	let selectedCountry = '';
	let availableCountries: string[] = [];

	// Modal state
	let selectedPlayer: RankedPlayer | null = null;
	let showDetailModal = false;

	// Infinite scroll state
	const ITEMS_PER_PAGE = 15;
	let visibleCount = ITEMS_PER_PAGE;
	let tableContainer: HTMLElement | null = null;
	$: visiblePlayers = rankedPlayers.slice(0, visibleCount);
	$: hasMore = visibleCount < rankedPlayers.length;

	// Auto-load more if container doesn't have scroll
	$: if (tableContainer && hasMore && !isLoading) {
		// Use setTimeout to wait for DOM update after visiblePlayers changes
		setTimeout(() => {
			if (tableContainer && tableContainer.scrollHeight <= tableContainer.clientHeight) {
				loadMore();
			}
		}, 0);
	}

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		isLoading = true;
		try {
			// Load users and tournaments in parallel
			const [loadedUsers, loadedTournaments] = await Promise.all([
				getAllUsersWithTournaments(),
				getCompletedTournaments()
			]);

			users = loadedUsers;
			tournamentsMap = loadedTournaments;

			// Extract available filters
			availableYears = getAvailableYears(tournamentsMap);
			availableCountries = getAvailableCountries(tournamentsMap);

			// Set default year to most recent if current year has no tournaments
			if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
				selectedYear = availableYears[0];
			}

			// Set default country if available
			if (availableCountries.length > 0 && !selectedCountry) {
				selectedCountry = availableCountries[0];
			}

			// Calculate initial rankings
			recalculateRankings();
		} catch (error) {
			console.error('Error loading ranking data:', error);
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
		visibleCount = ITEMS_PER_PAGE; // Reset visible count when filters change
	}

	function loadMore() {
		visibleCount = Math.min(visibleCount + ITEMS_PER_PAGE, rankedPlayers.length);
	}

	function handleScroll(e: Event) {
		const target = e.target as HTMLElement;
		const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

		// Load more when 100px from bottom
		if (scrollBottom < 100 && hasMore) {
			loadMore();
		}
	}

	// Reactive recalculation when filters change
	$: if (!isLoading && (selectedYear || filterType || selectedCountry || bestOfN)) {
		recalculateRankings();
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
	canonical="https://scorekinole.web.app/rankings"
/>

<div class="rankings-container" data-theme={$theme}>
	<header class="page-header">
		<div class="header-row">
			<div class="header-left">
				<ScorekinoleLogo />
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
				{#each [2, 3, 4, 5, 6, 7, 8, 9, 10] as n}
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
		<div class="empty-state">
			<div class="empty-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M12 15l-2-5-2 5h4zm6-5l-2-5-2 5h4zm-12 0l-2-5-2 5h4z"/>
					<path d="M4 15h16v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4z"/>
				</svg>
			</div>
			<h3>{m.ranking_noRankingsFound()}</h3>
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
						<th class="points-col">{m.scoring_points()}</th>
						<th class="best-col">{m.ranking_bestResult()}</th>
						<th class="tournaments-col">{m.ranking_tournamentsCount()}</th>
					</tr>
				</thead>
				<tbody>
					{#each visiblePlayers as player, index (player.odId)}
						<tr
							class="player-row"
							class:top-1={index === 0}
							class:top-2={index === 1}
							class:top-3={index === 2}
							onclick={() => handlePlayerClick(player)}
						>
							<td class="pos-cell">
								<span class="position" class:gold={index === 0} class:silver={index === 1} class:bronze={index === 2}>
									{index + 1}
								</span>
							</td>
							<td class="player-cell">
								<div class="player-info">
									{#if player.photoURL}
										<img src={player.photoURL} alt="" class="player-avatar" />
									{:else}
										<div class="player-avatar-placeholder">
											{player.playerName.charAt(0).toUpperCase()}
										</div>
									{/if}
									<span class="player-name">{player.playerName}</span>
								</div>
							</td>
							<td class="points-cell">
								<span class="points-value">{player.totalPoints}</span><span class="points-unit">pts</span>
							</td>
							<td class="best-cell">
								{#if player.bestResult === 1}
									<span class="medal gold">🥇</span>
								{:else if player.bestResult === 2}
									<span class="medal silver">🥈</span>
								{:else if player.bestResult === 3}
									<span class="medal bronze">🥉</span>
								{:else if player.bestResult}
									<span class="best-position">{player.bestResult}º</span>
								{:else}
									<span class="best-position">-</span>
								{/if}
							</td>
							<td class="tournaments-cell">
								{player.tournamentsCount}/{bestOfN}
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
</div>

<RankingDetailModal isOpen={showDetailModal} player={selectedPlayer} bestOfN={bestOfN} onClose={closeModal} />

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
		gap: 0.75rem;
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

	/* Empty state */
	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
	}

	.empty-icon {
		margin-bottom: 1rem;
	}

	.empty-icon svg {
		width: 64px;
		height: 64px;
		stroke: #4a5568;
	}

	.empty-state h3 {
		font-size: 1.1rem;
		margin: 0;
		color: #e1e8ed;
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
	.rankings-table .best-col { width: 60px; }
	.rankings-table .tournaments-col { width: 80px; }

	.player-row {
		border-bottom: 1px solid #2d3748;
		cursor: pointer;
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

	.player-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}

	/* Points cell */
	.points-cell {
		vertical-align: middle;
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

	/* Best result cell */
	.best-cell {
		text-align: center;
		vertical-align: middle;
	}

	.medal {
		font-size: 1.1rem;
	}

	.best-position {
		color: #8b9bb3;
		font-size: 0.85rem;
		font-weight: 500;
	}

	/* Tournaments cell */
	.tournaments-cell {
		color: #8b9bb3;
		font-size: 0.85rem;
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

		.player-name {
			font-size: 0.85rem;
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

	.rankings-container[data-theme='light'] .empty-icon svg {
		stroke: #a0aec0;
	}

	.rankings-container[data-theme='light'] .empty-state h3 {
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

	.rankings-container[data-theme='light'] .player-name {
		color: #1a202c;
	}

	.rankings-container[data-theme='light'] .points-unit {
		color: #718096;
	}

	.rankings-container[data-theme='light'] .best-position {
		color: #4a5568;
	}

	.rankings-container[data-theme='light'] .tournaments-cell {
		color: #4a5568;
	}

	.rankings-container[data-theme='light'] .load-more-hint,
	.rankings-container[data-theme='light'] .end-of-list {
		color: #718096;
	}

	.rankings-container[data-theme='light'] .end-of-list {
		border-top-color: #e2e8f0;
	}
</style>
