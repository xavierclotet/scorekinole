<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { currentUser, authInitialized } from '$lib/firebase/auth';
	import { getMatchesFromCloud, getUserTournamentMatches } from '$lib/firebase/firestore';
	import type { MatchHistory } from '$lib/types/history';
	import AppMenu from '$lib/components/AppMenu.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import PullToRefresh from '$lib/components/PullToRefresh.svelte';
	import { theme } from '$lib/stores/theme';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { User } from '@lucide/svelte';
	import SEO from '$lib/components/SEO.svelte';
	import { getUserProfile } from '$lib/firebase/userProfile';
	import type { TournamentRecord } from '$lib/types/tournament';
	import PlayerStatsContent from '$lib/components/PlayerStatsContent.svelte';

	// Data state
	let isLoading = $state(true);
	let matches: MatchHistory[] = $state([]);
	let tournamentRecords: TournamentRecord[] = $state([]);

	// Redirect if not logged in
	$effect(() => {
		if ($authInitialized && !$currentUser) {
			goto('/');
		}
	});

	// Load matches once auth is ready
	$effect(() => {
		if ($authInitialized) {
			if ($currentUser) {
				loadMatches();
			} else {
				isLoading = false;
			}
		}
	});

	import { statsCache } from '$lib/stores/statsCache';

	async function loadMatches() {
		const cache = $statsCache;
		const now = Date.now();
		let isBackground = false;

		if (cache) {
			matches = cache.matches;
			isLoading = false;
			isBackground = true;
			if (now - cache.lastUpdated < 10000) {
				return;
			}
		} else {
			isLoading = true;
		}

		await fetchMatches(isBackground);
	}

	async function fetchMatches(isBackground = false) {
		if (!isBackground) isLoading = true;
		try {
			const timeout = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Timeout loading matches')), 10000)
			);

			const [friendlyMatches, tournamentMatches, profile] = await Promise.race([
				Promise.all([
					getMatchesFromCloud(),
					getUserTournamentMatches(),
					getUserProfile(),
				]),
				timeout
			]) as [MatchHistory[], MatchHistory[], any];

			if (profile?.tournaments) {
				tournamentRecords = profile.tournaments;
			}

			const matchMap = new Map<string, MatchHistory>();
			for (const match of [...friendlyMatches, ...tournamentMatches]) {
				if (!matchMap.has(match.id)) {
					matchMap.set(match.id, match);
				}
			}
			const sortedMatches = Array.from(matchMap.values()).sort((a, b) => b.startTime - a.startTime);

			matches = sortedMatches;

			statsCache.set({
				matches: sortedMatches,
				lastUpdated: Date.now()
			});
		} catch (error) {
			console.error('Error loading matches:', error);
			if (matches.length === 0) {
				matches = [];
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<SEO
	title="My Statistics - Scorekinole"
	description="View your personal crokinole match statistics, win rate, and 20s averages."
/>

<div class="stats-container" data-theme={$theme}>
	<header class="page-header">
		<div class="header-row">
			<div class="header-left">
				<AppMenu showHome homeHref="/" currentPage="my-stats" />
			</div>
			<div class="header-center">
				<h1>{m.stats_myStatistics()}</h1>
			</div>
			<div class="header-right">
				<ThemeToggle />
			</div>
		</div>
	</header>

	<PullToRefresh onrefresh={() => fetchMatches(false)}>
	{#if isLoading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>{m.common_loading()}...</p>
		</div>
	{:else if !$currentUser}
		<div class="empty-state">
			<div class="empty-icon">
				<User class="size-10" />
			</div>
			<h3>{m.stats_loginRequired()}</h3>
		</div>
	{:else}
		<PlayerStatsContent
			{matches}
			userId={$currentUser.id}
			{tournamentRecords}
			show20s={$gameSettings.show20s}
			showFriendlyFilter={true}
		/>
	{/if}
	</PullToRefresh>
</div>

<style>
	.stats-container {
		height: 100vh;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--background);
		color: var(--foreground);
	}

	.page-header {
		background: var(--card);
		border-bottom: 1px solid var(--border);
		padding: 0.75rem 1.5rem;
		flex-shrink: 0;
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
		justify-content: center;
	}

	.header-center h1 {
		font-size: 1.1rem;
		margin: 0;
		font-weight: 700;
		white-space: nowrap;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	/* Make PullToRefresh wrapper fill remaining flex space */
	.stats-container :global(.pull-to-refresh-wrapper) {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.stats-container :global(.pull-content) {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	/* Loading and Empty states */
	.loading-state,
	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		margin: 0 auto 1rem;
		border: 3px solid var(--border);
		border-top: 3px solid var(--primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.empty-icon {
		width: 80px;
		height: 80px;
		margin: 0 auto 1.5rem;
		padding: 1.25rem;
		border-radius: 50%;
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.empty-state h3 {
		color: var(--foreground);
		font-size: 1.1rem;
		margin: 0;
	}

	@media (max-width: 640px) {
		.page-header { padding: 0.75rem 0.75rem; }
	}
</style>
