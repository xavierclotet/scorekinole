<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/stores/language';
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
	import type { TournamentTier } from '$lib/types/tournament';
	import RankingDetailModal from '$lib/components/RankingDetailModal.svelte';

	// Data state
	let isLoading = true;
	let users: UserWithId[] = [];
	let tournamentsMap: Map<string, TournamentInfo> = new Map();
	let rankedPlayers: RankedPlayer[] = [];

	// Filter state
	let selectedYear = new Date().getFullYear();
	let availableYears: number[] = [];
	const bestOfN = 2; // Hardcoded to 2 for now
	let filterType: 'all' | 'tier' | 'country' = 'all';
	let selectedTier: TournamentTier = 'REGIONAL';
	let selectedCountry = '';
	let availableCountries: string[] = [];

	// Modal state
	let selectedPlayer: RankedPlayer | null = null;
	let showDetailModal = false;

	// Infinite scroll state
	const ITEMS_PER_PAGE = 10;
	let visibleCount = ITEMS_PER_PAGE;
	$: visiblePlayers = rankedPlayers.slice(0, visibleCount);
	$: hasMore = visibleCount < rankedPlayers.length;

	const TIER_OPTIONS: TournamentTier[] = ['CLUB', 'REGIONAL', 'NATIONAL', 'MAJOR'];

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
			tierValue: filterType === 'tier' ? selectedTier : undefined,
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
	$: if (!isLoading && (selectedYear || filterType || selectedTier || selectedCountry || bestOfN)) {
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

	function goBack() {
		goto('/');
	}

	function getTierLabel(tier: TournamentTier): string {
		const labels: Record<TournamentTier, string> = {
			CLUB: $t('tierClub'),
			REGIONAL: $t('tierRegional'),
			NATIONAL: $t('tierNational'),
			MAJOR: $t('tierMajor')
		};
		return labels[tier];
	}

	function getPositionEmoji(position: number): string {
		if (position === 1) return '';
		if (position === 2) return '';
		if (position === 3) return '';
		return '';
	}
</script>

<svelte:head>
	<title>{$t('publicRankings')} - Scorekinole</title>
	<meta name="description" content="Crokinole Rankings - Best-of-N tournament results" />
</svelte:head>

<main class="rankings-page">
	<header class="page-header">
		<button class="back-button" on:click={goBack}>
			<span class="back-icon">&larr;</span>
			{$t('backToHome')}
		</button>
		<h1 class="page-title">{$t('publicRankings')}</h1>
	</header>

	<div class="filters-bar">
		<div class="filters-left">
			<select class="filter-select" bind:value={selectedYear} title={$t('year')}>
				{#each availableYears as year}
					<option value={year}>{year}</option>
				{/each}
				{#if availableYears.length === 0}
					<option value={selectedYear}>{selectedYear}</option>
				{/if}
			</select>
			<span class="bestof-label">{$t('bestOfN')} 2</span>
		</div>

		<div class="filters-right">
			<div class="filter-type-toggle">
				<button
					class="type-btn"
					class:active={filterType === 'all'}
					on:click={() => (filterType = 'all')}
				>
					{$t('allTournaments')}
				</button>
				<button
					class="type-btn"
					class:active={filterType === 'tier'}
					on:click={() => (filterType = 'tier')}
				>
					{$t('byTier')}
				</button>
				<button
					class="type-btn"
					class:active={filterType === 'country'}
					on:click={() => (filterType = 'country')}
				>
					{$t('byCountry')}
				</button>
			</div>

			{#if filterType === 'tier'}
				<select class="filter-select secondary" bind:value={selectedTier}>
					{#each TIER_OPTIONS as tier}
						<option value={tier}>{getTierLabel(tier)}</option>
					{/each}
				</select>
			{/if}

			{#if filterType === 'country'}
				<select class="filter-select secondary" bind:value={selectedCountry}>
					{#each availableCountries as country}
						<option value={country}>{country}</option>
					{/each}
				</select>
			{/if}
		</div>
	</div>

	<div class="rankings-content" on:scroll={handleScroll}>
		{#if isLoading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>{$t('loading')}...</p>
			</div>
		{:else if rankedPlayers.length === 0}
			<div class="empty-state">
				<p>{$t('noRankingsFound')}</p>
			</div>
		{:else}
			<div class="rankings-table">
				<div class="table-header">
					<span class="col-position">#</span>
					<span class="col-player">{$t('player')}</span>
					<span class="col-points">{$t('points')}</span>
					<span class="col-tournaments">{$t('tournamentsCount')}</span>
				</div>

				<div class="table-body">
					{#each visiblePlayers as player, index}
						<button
							class="table-row"
							class:top-3={index < 3}
							on:click={() => handlePlayerClick(player)}
						>
							<span class="col-position">
								<span class="position-number">{index + 1}</span>
								<span class="position-emoji">{getPositionEmoji(index + 1)}</span>
							</span>

							<span class="col-player">
								{#if player.photoURL}
									<img src={player.photoURL} alt="" class="player-photo" />
								{:else}
									<div class="player-avatar">
										{player.playerName.charAt(0).toUpperCase()}
									</div>
								{/if}
								<span class="player-name">{player.playerName}</span>
							</span>

							<span class="col-points">
								<span class="points-value">{player.totalPoints}</span>
								<span class="points-label">{$t('pointsShort')}</span>
							</span>

							<span class="col-tournaments">
								{player.tournamentsCount}/{bestOfN}
							</span>
						</button>
					{/each}
				</div>

				{#if !hasMore && rankedPlayers.length > 0}
					<div class="end-of-list">
						{$t('endOfList')}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</main>

<RankingDetailModal isOpen={showDetailModal} player={selectedPlayer} bestOfN={bestOfN} onClose={closeModal} />

<style>
	:global(body) {
		margin: 0;
		font-family: 'Lexend', system-ui, -apple-system, sans-serif;
		background: #0a0e1a;
		color: #fff;
	}

	.rankings-page {
		height: 100vh;
		background: #0a0e1a;
		padding: 1rem;
		padding-top: max(1rem, env(safe-area-inset-top, 1rem));
		padding-bottom: max(1rem, env(safe-area-inset-bottom, 1rem));
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.page-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
		flex-shrink: 0;
	}

	.back-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.9rem;
	}

	.back-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.back-icon {
		font-size: 1.2rem;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--accent-green, #00ff88);
		margin: 0;
		flex: 1;
	}

	.filters-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		flex-shrink: 0;
	}

	.filters-left,
	.filters-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.filter-select {
		padding: 0.4rem 1.75rem 0.4rem 0.6rem;
		background-color: rgba(255, 255, 255, 0.08);
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.5rem center;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		color: #fff;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		min-width: 70px;
	}

	.filter-select.secondary {
		background-color: rgba(0, 255, 136, 0.1);
		border-color: rgba(0, 255, 136, 0.3);
	}

	.filter-select option {
		background-color: #1a1f35;
		color: #fff;
	}

	.filter-select:focus {
		outline: none;
		border-color: var(--accent-green, #00ff88);
	}

	.filter-select:hover {
		border-color: rgba(255, 255, 255, 0.3);
	}

	.bestof-label {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
		padding: 0.4rem 0.6rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.filter-type-toggle {
		display: flex;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.type-btn {
		padding: 0.35rem 0.65rem;
		background: transparent;
		border: none;
		border-right: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.type-btn:last-child {
		border-right: none;
	}

	.type-btn:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
	}

	.type-btn.active {
		background: var(--accent-green, #00ff88);
		color: #0a0e1a;
		font-weight: 600;
	}

	.rankings-content {
		flex: 1;
		overflow-y: auto;
		min-height: 0; /* Important for flex children with overflow */
	}

	.loading-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-top-color: var(--accent-green, #00ff88);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.rankings-table {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		overflow: hidden;
	}

	.table-header {
		display: grid;
		grid-template-columns: 60px 1fr 100px 80px;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.table-body {
		display: flex;
		flex-direction: column;
	}

	.table-row {
		display: grid;
		grid-template-columns: 60px 1fr 100px 80px;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border: none;
		background: transparent;
		color: #fff;
		text-align: left;
		cursor: pointer;
		transition: background 0.2s;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		width: 100%;
		font-family: inherit;
		font-size: inherit;
	}

	.table-row:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.table-row:last-child {
		border-bottom: none;
	}

	/* Zebra striping */
	.table-row:nth-child(even) {
		background: rgba(255, 255, 255, 0.02);
	}

	.table-row.top-3 {
		background: rgba(0, 255, 136, 0.05);
	}

	.table-row.top-3:nth-child(even) {
		background: rgba(0, 255, 136, 0.07);
	}

	.table-row.top-3:hover {
		background: rgba(0, 255, 136, 0.1);
	}

	.col-position {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.position-number {
		font-weight: bold;
		min-width: 1.5rem;
	}

	.position-emoji {
		font-size: 1rem;
	}

	.col-player {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		overflow: hidden;
	}

	.player-photo {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.player-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: bold;
		font-size: 0.9rem;
		flex-shrink: 0;
	}

	.player-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.col-points {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.points-value {
		font-weight: bold;
		color: var(--accent-green, #00ff88);
	}

	.points-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.col-tournaments {
		display: flex;
		align-items: center;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
	}

	.end-of-list {
		text-align: center;
		padding: 1rem;
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.85rem;
		border-top: 1px dashed rgba(255, 255, 255, 0.1);
	}

	/* Mobile responsiveness */
	@media (max-width: 600px) {
		.page-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.back-button {
			padding: 0.4rem 0.75rem;
			font-size: 0.85rem;
		}

		.page-title {
			font-size: 1.25rem;
		}

		.filters-bar {
			flex-direction: column;
			align-items: stretch;
			gap: 0.6rem;
			padding: 0.5rem;
		}

		.filters-left,
		.filters-right {
			justify-content: center;
			gap: 0.5rem;
		}

		.filter-select {
			padding: 0.35rem 1.5rem 0.35rem 0.5rem;
			font-size: 0.8rem;
			min-width: 60px;
		}

		.filter-type-toggle {
			flex: 1;
		}

		.type-btn {
			flex: 1;
			padding: 0.35rem 0.4rem;
			font-size: 0.7rem;
		}

		.table-header {
			grid-template-columns: 50px 1fr 70px 50px;
			padding: 0.5rem 0.75rem;
			font-size: 0.65rem;
		}

		.table-row {
			grid-template-columns: 50px 1fr 70px 50px;
			padding: 0.5rem 0.75rem;
			font-size: 0.9rem;
		}

		.player-photo,
		.player-avatar {
			width: 28px;
			height: 28px;
			font-size: 0.8rem;
		}

		.col-points {
			flex-direction: column;
			align-items: flex-start;
			gap: 0;
		}

		.points-label {
			display: none;
		}

		.col-tournaments {
			font-size: 0.8rem;
		}
	}

	/* Landscape adjustments */
	@media (orientation: landscape) and (max-height: 500px) {
		.rankings-page {
			padding: 0.5rem;
		}

		.page-header {
			margin-bottom: 0.5rem;
		}

		.filters-bar {
			padding: 0.4rem 0.75rem;
			margin-bottom: 0.5rem;
			gap: 0.5rem;
		}

		.filter-select {
			padding: 0.3rem 1.5rem 0.3rem 0.5rem;
			font-size: 0.8rem;
		}

		.bestof-label {
			font-size: 0.7rem;
			padding: 0.3rem 0.5rem;
		}

		.type-btn {
			padding: 0.25rem 0.5rem;
			font-size: 0.75rem;
		}

		.table-header,
		.table-row {
			padding: 0.4rem 0.75rem;
		}
	}
</style>
