<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import {
		subscribeToPublicTournaments,
		getAvailableTournamentYears,
		getAvailableTournamentCountries,
		type TournamentListItem
	} from '$lib/firebase/publicTournaments';
	import TournamentCard from '$lib/components/TournamentCard.svelte';
	import ScorekinoleLogo from '$lib/components/ScorekinoleLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import { theme } from '$lib/stores/theme';
	import { getTranslatedCountryOptions } from '$lib/utils/countryTranslations';
	import SEO from '$lib/components/SEO.svelte';

	// Filter state
	let selectedYear = $state<number | undefined>(undefined);
	let selectedCountry = $state('');
	let selectedMode = $state<'all' | 'singles' | 'doubles'>('all');
	let selectedTier = $state<'all' | 'CLUB' | 'REGIONAL' | 'NATIONAL' | 'MAJOR'>('all');
	let timeFilter = $state<'all' | 'past' | 'future'>('all');

	// Data state
	let allTournaments: TournamentListItem[] = $state([]);
	let isLoading = $state(true);

	// Filter options
	let availableYears: number[] = $state([]);
	let availableCountries: string[] = $state([]);

	// Translated country options for the select
	let translatedCountryOptions = $derived(getTranslatedCountryOptions(availableCountries));

	// Infinite scroll state
	import { PAGE_SIZE } from '$lib/constants';
	let visibleCount = $state(PAGE_SIZE);
	let gridContainer: HTMLElement | null = $state(null);

	// Filtered tournaments
	let filteredTournaments = $derived.by(() => {
		// Exclude cancelled tournaments from public list
		let result = allTournaments.filter((t) => t.status !== 'CANCELLED');

		if (selectedYear) {
			result = result.filter((t) => {
				if (!t.tournamentDate) return false;
				return new Date(t.tournamentDate).getFullYear() === selectedYear;
			});
		}

		if (selectedCountry) {
			result = result.filter((t) => t.country === selectedCountry);
		}

		if (selectedMode !== 'all') {
			result = result.filter((t) => t.gameType === selectedMode);
		}

		if (selectedTier !== 'all') {
			result = result.filter((t) => t.tier === selectedTier);
		}

		if (timeFilter !== 'all') {
			const now = Date.now();
			if (timeFilter === 'past') {
				result = result.filter((t) => t.tournamentDate && t.tournamentDate < now);
			} else {
				result = result.filter((t) => !t.tournamentDate || t.tournamentDate >= now);
			}
		}

		// Sort by date descending (newest first)
		result.sort((a, b) => (b.tournamentDate || 0) - (a.tournamentDate || 0));

		return result;
	});

	let visibleTournaments = $derived(filteredTournaments.slice(0, visibleCount));
	let hasMore = $derived(visibleCount < filteredTournaments.length);

	// Reset visible count when filters change
	$effect(() => {
		// Access derived to track
		filteredTournaments;
		visibleCount = PAGE_SIZE;
	});

	// Auto-load more if container doesn't have scroll
	$effect(() => {
		if (gridContainer && hasMore && !isLoading) {
			setTimeout(() => {
				if (gridContainer && gridContainer.scrollHeight <= gridContainer.clientHeight + 100) {
					loadMore();
				}
			}, 0);
		}
	});

	// Subscription cleanup
	let unsubscribe: (() => void) | null = $state(null);

	onMount(async () => {
		await loadFilters();
		setupSubscription();

		return () => {
			// Cleanup subscription on unmount
			if (unsubscribe) {
				unsubscribe();
			}
		};
	});

	async function loadFilters() {
		try {
			const [years, countries] = await Promise.all([
				getAvailableTournamentYears(),
				getAvailableTournamentCountries()
			]);

			availableYears = years;
			availableCountries = countries;

			// Set default year if available
			if (availableYears.length > 0) {
				const currentYear = new Date().getFullYear();
				if (availableYears.includes(currentYear)) {
					selectedYear = currentYear;
				}
			}
		} catch (error) {
			console.error('Error loading filters:', error);
		}
	}

	function setupSubscription() {
		isLoading = true;

		unsubscribe = subscribeToPublicTournaments(
			(tournaments) => {
				allTournaments = tournaments;
				isLoading = false;
			},
			(error) => {
				console.error('Error in tournament subscription:', error);
				isLoading = false;
			}
		);
	}

	function loadMore() {
		visibleCount = Math.min(visibleCount + PAGE_SIZE, filteredTournaments.length);
	}

	function handleScroll(e: Event) {
		const target = e.target as HTMLElement;
		const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
		if (scrollBottom < 150 && hasMore) {
			loadMore();
		}
	}

	function handleTournamentClick(tournament: TournamentListItem) {
		goto(`/tournaments/${tournament.id}`);
	}

	function clearFilters() {
		selectedYear = undefined;
		selectedCountry = '';
		selectedMode = 'all';
		selectedTier = 'all';
		timeFilter = 'all';
	}

	let hasActiveFilters = $derived(
		selectedYear !== undefined || selectedCountry !== '' || selectedMode !== 'all' || selectedTier !== 'all' || timeFilter !== 'all'
	);
</script>

<SEO
	title="Live Crokinole Tournaments"
	description="Browse and follow live crokinole tournaments worldwide. Real-time scores, brackets, group standings, and results from crokinole competitions."
	keywords="crokinole tournaments, live crokinole, crokinole competition, crokinole brackets, crokinole results, scorekinole tournaments"
	canonical="https://scorekinole.web.app/tournaments"
/>

<div class="tournaments-container" data-theme={$theme}>
	<header class="page-header">
		<div class="header-row">
			<div class="header-left">
				<ScorekinoleLogo />
			</div>
			<div class="header-center">
				<div class="title-section">
					<h1>{m.tournaments_publicTournaments()}</h1>
					<span class="count-badge">{filteredTournaments.length}</span>
				</div>
			</div>
			<div class="header-right">
				<LanguageSelector />
				<ThemeToggle />
			</div>
		</div>
	</header>

	<div class="controls-section">
		<div class="filter-tabs">
			<button class="filter-tab" class:active={timeFilter === 'all'} onclick={() => (timeFilter = 'all')}>
				{m.tournaments_all()}
			</button>
			<button class="filter-tab" class:active={timeFilter === 'future'} onclick={() => (timeFilter = 'future')}>
				{m.tournaments_future()}
			</button>
			<button class="filter-tab" class:active={timeFilter === 'past'} onclick={() => (timeFilter = 'past')}>
				{m.tournaments_past()}
			</button>
		</div>

		<div class="filter-selects">
			{#if availableYears.length > 0}
				<select class="filter-select" bind:value={selectedYear}>
					<option value={undefined}>{m.tournaments_filterByYear()}</option>
					{#each availableYears as year}
						<option value={year}>{year}</option>
					{/each}
				</select>
			{/if}

			{#if translatedCountryOptions.length > 0}
				<select class="filter-select" bind:value={selectedCountry}>
					<option value="">{m.tournaments_allCountries()}</option>
					{#each translatedCountryOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			{/if}

			<select class="filter-select" bind:value={selectedMode}>
				<option value="all">{m.tournaments_allModes()}</option>
				<option value="singles">{m.tournaments_singles()}</option>
				<option value="doubles">{m.tournaments_doubles()}</option>
			</select>

			<select class="filter-select" bind:value={selectedTier}>
				<option value="all">{m.tournaments_allTiers()}</option>
				<option value="CLUB">{m.tournaments_tierClub()}</option>
				<option value="REGIONAL">{m.tournaments_tierRegional()}</option>
				<option value="NATIONAL">{m.tournaments_tierNational()}</option>
				<option value="MAJOR">{m.tournaments_tierMajor()}</option>
			</select>
		</div>

		{#if hasActiveFilters}
			<button class="clear-filters-btn" onclick={clearFilters} aria-label="Limpiar filtros" title="Limpiar filtros">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		{/if}
	</div>

	{#if isLoading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>{m.common_loading()}...</p>
		</div>
	{:else if filteredTournaments.length === 0}
		<div class="empty-state">
			<div class="empty-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
					<line x1="9" y1="14" x2="15" y2="14" />
				</svg>
			</div>
			<h3>{m.tournaments_noTournamentsFound()}</h3>
			{#if hasActiveFilters}
				<button class="reset-filters-btn" onclick={clearFilters}>
					{m.tournament_tryChangingFilters()}
				</button>
			{/if}
		</div>
	{:else}
		<div class="results-info">
			{m.tournaments_showingOf({ showing: String(visibleTournaments.length), total: String(filteredTournaments.length) })}
		</div>

		<div class="grid-container" bind:this={gridContainer} onscroll={handleScroll}>
			<div class="tournaments-grid">
				{#each visibleTournaments as tournament (tournament.id)}
					<TournamentCard {tournament} onclick={() => handleTournamentClick(tournament)} />
				{/each}
			</div>

			{#if hasMore}
				<div class="load-more-hint">{m.tournaments_scrollToLoadMore()}</div>
			{:else if filteredTournaments.length > 0}
				<div class="end-of-list">{m.tournaments_endOfList()}</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Lexend', system-ui, -apple-system, sans-serif;
	}

	.tournaments-container {
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
		position: relative;
	}

	.filter-tabs {
		display: flex;
		gap: 0.25rem;
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

	.filter-selects {
		display: flex;
		gap: 0.5rem;
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

	.clear-filters-btn {
		width: 32px;
		height: 32px;
		border-radius: 4px;
		border: 1px solid #2d3748;
		background: #1a2332;
		color: #8b9bb3;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		margin-left: auto;
	}

	.clear-filters-btn svg {
		width: 14px;
		height: 14px;
	}

	.clear-filters-btn:hover {
		border-color: #ef4444;
		color: #ef4444;
		background: rgba(239, 68, 68, 0.1);
	}

	/* Results info */
	.results-info {
		font-size: 0.75rem;
		color: #6b7a94;
		margin-bottom: 0.75rem;
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
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
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
		margin: 0 0 1rem 0;
		color: #e1e8ed;
	}

	.reset-filters-btn {
		padding: 0.5rem 1rem;
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 6px;
		color: #8b9bb3;
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.reset-filters-btn:hover {
		border-color: #667eea;
		color: #667eea;
	}

	/* Grid */
	.grid-container {
		overflow-y: auto;
		max-height: calc(100vh - 220px);
		/* Padding to prevent card hover/focus transforms from being clipped */
		padding: 0.5rem;
		margin: -0.5rem;
	}

	.tournaments-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
		gap: 1rem;
	}

	/* Scroll indicators */
	.load-more-hint,
	.end-of-list {
		text-align: center;
		padding: 1.5rem;
		color: #6b7a94;
		font-size: 0.85rem;
	}

	.end-of-list {
		border-top: 1px dashed #2d3748;
		margin-top: 1rem;
	}

	/* Responsive - 768px (tablet) */
	@media (max-width: 768px) {
		.tournaments-container {
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

		.clear-filters-btn {
			position: absolute;
			right: 0;
			top: 0;
		}

		.grid-container {
			max-height: calc(100vh - 260px);
		}
	}

	/* Responsive - 640px (large mobile) */
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

	/* Responsive - 480px (small mobile) */
	@media (max-width: 480px) {
		.tournaments-grid {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}

		.filter-tab,
		.filter-select {
			padding: 0.3rem 0.4rem;
			font-size: 0.65rem;
		}

		.filter-select {
			padding-right: 1rem;
			background-position: right 0.2rem center;
		}
	}

	/* Landscape adjustments */
	@media (orientation: landscape) and (max-height: 500px) {
		.tournaments-container {
			padding: 0.75rem 1rem;
		}

		.page-header {
			margin: -0.75rem -1rem 0.75rem -1rem;
			padding: 0.5rem 1rem;
		}

		.controls-section {
			margin-bottom: 0.5rem;
		}

		.grid-container {
			max-height: calc(100vh - 160px);
		}

		.tournaments-grid {
			gap: 0.75rem;
		}
	}

	/* Light theme (including violet-light) */
	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) {
		background: #f5f7fa;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .page-header {
		background: #ffffff;
		border-bottom-color: #e2e8f0;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .title-section h1 {
		color: #1a202c;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .count-badge {
		background: #e2e8f0;
		color: #4a5568;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .filter-tab {
		background: #ffffff;
		border-color: #e2e8f0;
		color: #4a5568;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .filter-tab:hover {
		background: #f7fafc;
		border-color: #667eea;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .filter-select {
		background-color: #ffffff;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%234a5568' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
		border-color: #e2e8f0;
		color: #1a202c;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .filter-select option {
		background: #ffffff;
		color: #1a202c;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .clear-filters-btn {
		background: #ffffff;
		border-color: #e2e8f0;
		color: #4a5568;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .clear-filters-btn:hover {
		background: rgba(239, 68, 68, 0.05);
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .results-info {
		color: #718096;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .spinner {
		border-color: #e2e8f0;
		border-top-color: #667eea;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .loading-state p {
		color: #718096;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .empty-icon svg {
		stroke: #a0aec0;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .empty-state h3 {
		color: #1a202c;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .reset-filters-btn {
		background: #ffffff;
		border-color: #e2e8f0;
		color: #4a5568;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .load-more-hint,
	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .end-of-list {
		color: #718096;
	}

	.tournaments-container:is([data-theme='light'], [data-theme='violet-light']) .end-of-list {
		border-top-color: #e2e8f0;
	}
</style>
