<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { currentUser } from '$lib/firebase/auth';
	import { getMatchesFromCloud, getUserTournamentMatches } from '$lib/firebase/firestore';
	import type { MatchHistory } from '$lib/types/history';
	import ScorekinoleLogo from '$lib/components/ScorekinoleLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import { theme } from '$lib/stores/theme';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { ChevronLeft, ChevronRight, Trophy, Users, User } from '@lucide/svelte';
	import SEO from '$lib/components/SEO.svelte';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';

	// Data state
	let isLoading = $state(true);
	let matches: MatchHistory[] = $state([]);

	// Filter state
	let filterType: 'all' | 'friendly' | 'tournament' = $state('all');
	let filterMode: 'all' | 'singles' | 'doubles' = $state('all');
	let filterResult: 'all' | 'won' | 'lost' | 'tied' = $state('all');
	let filterOpponent = $state('');

	// Expanded matches for detail view
	let expandedMatches = new SvelteSet<string>();

	// Redirect if not logged in
	$effect(() => {
		if (!$currentUser && !isLoading) {
			goto('/');
		}
	});

	onMount(async () => {
		if (!$currentUser) {
			isLoading = false;
			return;
		}
		await loadMatches();
	});

	async function loadMatches() {
		isLoading = true;
		try {
			// Load both friendly matches and tournament matches in parallel
			const [friendlyMatches, tournamentMatches] = await Promise.all([
				getMatchesFromCloud(),
				getUserTournamentMatches()
			]);

			// Combine and deduplicate by ID, then sort by startTime (most recent first)
			const matchMap = new Map<string, MatchHistory>();
			for (const match of [...friendlyMatches, ...tournamentMatches]) {
				if (!matchMap.has(match.id)) {
					matchMap.set(match.id, match);
				}
			}
			matches = Array.from(matchMap.values()).sort((a, b) => b.startTime - a.startTime);
		} catch (error) {
			console.error('Error loading matches:', error);
			matches = [];
		} finally {
			isLoading = false;
		}
	}

	// Determine if match is tournament or friendly
	// Tournament match IDs start with "tournament_" (from getUserTournamentMatches)
	function isTournamentMatch(match: MatchHistory): boolean {
		return match.id.startsWith('tournament_');
	}

	// Get user's team in a match
	function getUserTeam(match: MatchHistory): 1 | 2 | null {
		if (!$currentUser) return null;
		if (match.players?.team1?.userId === $currentUser.id) return 1;
		if (match.players?.team2?.userId === $currentUser.id) return 2;
		return null;
	}

	// Get opponent name
	function getOpponentName(match: MatchHistory): string {
		const userTeam = getUserTeam(match);
		if (userTeam === 1) return match.team2Name || 'Unknown';
		if (userTeam === 2) return match.team1Name || 'Unknown';
		// Fallback: show both if user team unknown
		return `${match.team1Name} vs ${match.team2Name}`;
	}

	// Get unique opponents from matches
	let uniqueOpponents = $derived((() => {
		const opponents = new SvelteSet<string>();
		for (const match of matches) {
			const userTeam = getUserTeam(match);
			if (userTeam === 1 && match.team2Name) opponents.add(match.team2Name);
			if (userTeam === 2 && match.team1Name) opponents.add(match.team1Name);
		}
		return Array.from(opponents).sort();
	})());

	// Apply filters
	let filteredMatches = $derived((() => {
		return matches.filter((match) => {
			// Type filter
			if (filterType === 'tournament' && !isTournamentMatch(match)) return false;
			if (filterType === 'friendly' && isTournamentMatch(match)) return false;

			// Mode filter
			if (filterMode === 'singles' && match.gameType !== 'singles') return false;
			if (filterMode === 'doubles' && match.gameType !== 'doubles') return false;

			// Result filter
			if (filterResult !== 'all') {
				const userTeam = getUserTeam(match);
				if (filterResult === 'won' && match.winner !== userTeam) return false;
				if (filterResult === 'lost' && (match.winner === userTeam || match.winner === null)) return false;
				if (filterResult === 'tied' && match.winner !== null) return false;
			}

			// Opponent filter
			if (filterOpponent) {
				const opponent = getOpponentName(match);
				if (!opponent.toLowerCase().includes(filterOpponent.toLowerCase())) return false;
			}

			return true;
		});
	})());

	// Calculate statistics from filtered matches
	let stats = $derived((() => {
		let total = 0;
		let wins = 0;
		let ties = 0;
		let losses = 0;

		// Separate tracking for singles and doubles
		let singlesTwenties = 0;
		let singlesRounds = 0;
		let doublesTwenties = 0;
		let doublesRounds = 0;

		for (const match of filteredMatches) {
			const userTeam = getUserTeam(match);
			if (!userTeam) continue;

			total++;
			if (match.winner === userTeam) {
				wins++;
			} else if (match.winner === null) {
				ties++;
			} else {
				losses++;
			}

			const isDoubles = match.gameType === 'doubles';

			// Check if match has detailed rounds or just totals (imported tournaments)
			const hasDetailedRounds = (match.games ?? []).some(g => (g.rounds ?? []).length > 0);

			if (hasDetailedRounds) {
				// Sum 20s and count rounds separately for singles/doubles
				for (const game of match.games ?? []) {
					for (const round of game.rounds ?? []) {
						const roundTwenties = userTeam === 1 ? round.team1Twenty : round.team2Twenty;
						if (isDoubles) {
							doublesTwenties += roundTwenties;
							doublesRounds++;
						} else {
							singlesTwenties += roundTwenties;
							singlesRounds++;
						}
					}
				}
			} else {
				// Imported tournament: use total20sTeam1/2 if available
				const total20s = userTeam === 1 ? (match.total20sTeam1 ?? 0) : (match.total20sTeam2 ?? 0);
				if (total20s > 0) {
					// Estimate rounds from total points (2 points distributed per round)
					const totalPointsInMatch = (match.games ?? []).reduce(
						(sum, g) => sum + g.team1Points + g.team2Points, 0
					);
					// Each round distributes 2 points total
					const estimatedRounds = Math.max(1, Math.ceil(totalPointsInMatch / 2));

					if (isDoubles) {
						doublesTwenties += total20s;
						doublesRounds += estimatedRounds;
					} else {
						singlesTwenties += total20s;
						singlesRounds += estimatedRounds;
					}
				}
			}
		}

		// Calculate percentages: max 8 per round for singles, 12 for doubles
		const singlesMaxPossible = singlesRounds * 8;
		const doublesMaxPossible = doublesRounds * 12;

		const singlesPercentage = singlesMaxPossible > 0
			? ((singlesTwenties / singlesMaxPossible) * 100).toFixed(1)
			: null;
		const doublesPercentage = doublesMaxPossible > 0
			? ((doublesTwenties / doublesMaxPossible) * 100).toFixed(1)
			: null;

		// Combined percentage (weighted correctly)
		const totalTwenties = singlesTwenties + doublesTwenties;
		const totalMaxPossible = singlesMaxPossible + doublesMaxPossible;
		const combinedPercentage = totalMaxPossible > 0
			? ((totalTwenties / totalMaxPossible) * 100).toFixed(1)
			: '0';

		return {
			total,
			wins,
			ties,
			losses,
			winRate: total > 0 ? ((wins / total) * 100).toFixed(0) : '0',
			tieRate: total > 0 ? ((ties / total) * 100).toFixed(0) : '0',
			lossRate: total > 0 ? ((losses / total) * 100).toFixed(0) : '0',
			singlesTwenties,
			singlesRounds,
			singlesPercentage,
			doublesTwenties,
			doublesRounds,
			doublesPercentage,
			totalTwenties,
			combinedPercentage
		};
	})());

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
	}

	function toggleExpand(matchId: string) {
		if (expandedMatches.has(matchId)) {
			expandedMatches.delete(matchId);
		} else {
			expandedMatches.add(matchId);
		}
	}

	// Get result info for a match
	function getResultInfo(match: MatchHistory): { won: boolean; tied: boolean; score: string } {
		const userTeam = getUserTeam(match);
		const won = match.winner === userTeam;
		const tied = match.winner === null;

		// If matchesToWin === 1, show points from the single game
		// Otherwise show games won (e.g., "2-0", "2-1")
		if (match.matchesToWin === 1 && match.games?.length === 1) {
			const game = match.games[0];
			const userPoints = userTeam === 1 ? game.team1Points : game.team2Points;
			const oppPoints = userTeam === 1 ? game.team2Points : game.team1Points;
			return { won, tied, score: `${userPoints}-${oppPoints}` };
		}

		// Multiple games - show games score
		const team1Games = match.games?.filter((g) => g.winner === 1).length ?? 0;
		const team2Games = match.games?.filter((g) => g.winner === 2).length ?? 0;

		if (!userTeam) {
			return { won: false, tied: false, score: `${team1Games}-${team2Games}` };
		}

		const userGames = userTeam === 1 ? team1Games : team2Games;
		const oppGames = userTeam === 1 ? team2Games : team1Games;

		return { won, tied, score: `${userGames}-${oppGames}` };
	}

	// Get 20s for user in match
	function getMatchTwenties(match: MatchHistory): number {
		const userTeam = getUserTeam(match);
		if (!userTeam) return 0;

		// First try to get from detailed rounds
		const fromRounds = match.games?.reduce(
			(sum, game) =>
				sum +
				(game.rounds?.reduce(
					(s, r) => s + (userTeam === 1 ? r.team1Twenty : r.team2Twenty),
					0
				) ?? 0),
			0
		) ?? 0;

		// If no rounds data, use total20s from imported tournaments
		if (fromRounds === 0) {
			return userTeam === 1 ? (match.total20sTeam1 ?? 0) : (match.total20sTeam2 ?? 0);
		}

		return fromRounds;
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
				<button class="back-btn" onclick={() => goto('/')} aria-label="Go back">
					<ChevronLeft class="size-5" />
				</button>
				<ScorekinoleLogo />
			</div>
			<div class="header-center">
				<h1>{m.stats_myStatistics()}</h1>
			</div>
			<div class="header-right">
				<LanguageSelector />
				<ThemeToggle />
			</div>
		</div>
	</header>

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
	{:else if matches.length === 0}
		<div class="empty-state">
			<div class="empty-icon">
				<Trophy class="size-10" />
			</div>
			<h3>{m.stats_noMatchesYet()}</h3>
		</div>
	{:else}
		<!-- Filters -->
		<div class="filters-section">
			<select class="filter-select" bind:value={filterType}>
				<option value="all">{m.stats_allTypes()}</option>
				<option value="friendly">{m.stats_friendlyOnly()}</option>
				<option value="tournament">{m.stats_tournamentOnly()}</option>
			</select>

			<select class="filter-select" bind:value={filterMode}>
				<option value="all">{m.stats_allModes()}</option>
				<option value="singles">{m.scoring_singles()}</option>
				<option value="doubles">{m.scoring_doubles()}</option>
			</select>

			<select class="filter-select" bind:value={filterResult}>
				<option value="all">{m.stats_allResults()}</option>
				<option value="won">{m.stats_wins()}</option>
				<option value="lost">{m.stats_losses()}</option>
				<option value="tied">{m.stats_ties()}</option>
			</select>

			{#if uniqueOpponents.length > 0}
				<select class="filter-select opponent-filter" bind:value={filterOpponent}>
					<option value="">{m.stats_anyOpponent()}</option>
					{#each uniqueOpponents as opponent (opponent)}
						<option value={opponent}>{opponent}</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- Stats Cards -->
		<div class="stats-cards">
			<div class="stat-card">
				<span class="stat-value">{stats.total}</span>
				<span class="stat-label">{m.stats_matchesPlayed()}</span>
			</div>
			<div class="stat-card won">
				<span class="stat-value">{stats.wins}</span>
				<span class="stat-percent">{stats.winRate}%</span>
				<span class="stat-label">{m.stats_wins()}</span>
			</div>
			<div class="stat-card tied">
				<span class="stat-value">{stats.ties}</span>
				<span class="stat-percent">{stats.tieRate}%</span>
				<span class="stat-label">{m.stats_ties()}</span>
			</div>
			<div class="stat-card lost">
				<span class="stat-value">{stats.losses}</span>
				<span class="stat-percent">{stats.lossRate}%</span>
				<span class="stat-label">{m.stats_losses()}</span>
			</div>
			<!-- 20s Stats - Show separately for singles and doubles -->
			{#if stats.singlesPercentage !== null && stats.doublesPercentage !== null}
				<!-- Both singles and doubles matches exist -->
				<div class="stat-card twenties split">
					<div class="split-stats">
						<div class="split-stat">
							<User class="size-3" />
							<span class="split-value">{stats.singlesPercentage}%</span>
						</div>
						<div class="split-stat">
							<Users class="size-3" />
							<span class="split-value">{stats.doublesPercentage}%</span>
						</div>
					</div>
					<span class="stat-percent">⭐ {stats.totalTwenties}</span>
					<span class="stat-label">{m.stats_twentiesAccuracy()}</span>
				</div>
			{:else if stats.singlesPercentage !== null}
				<!-- Only singles -->
				<div class="stat-card twenties">
					<span class="stat-value">{stats.singlesPercentage}%</span>
					<span class="stat-percent">⭐ {stats.singlesTwenties}</span>
					<span class="stat-label">{m.stats_twentiesAccuracy()}</span>
				</div>
			{:else if stats.doublesPercentage !== null}
				<!-- Only doubles -->
				<div class="stat-card twenties">
					<span class="stat-value">{stats.doublesPercentage}%</span>
					<span class="stat-percent">⭐ {stats.doublesTwenties}</span>
					<span class="stat-label">{m.stats_twentiesAccuracy()}</span>
				</div>
			{:else}
				<!-- No matches with 20s data -->
				<div class="stat-card twenties">
					<span class="stat-value">-</span>
					<span class="stat-label">{m.stats_twentiesAccuracy()}</span>
				</div>
			{/if}
		</div>

		<!-- Match List -->
		{#if filteredMatches.length === 0}
			<div class="empty-state small">
				<p>{m.stats_noMatchesFiltered()}</p>
			</div>
		{:else}
			<div class="match-list">
				{#each filteredMatches as match (match.id)}
					{@const result = getResultInfo(match)}
					{@const isExpanded = expandedMatches.has(match.id)}
					{@const twenties = getMatchTwenties(match)}
					<div class="match-item" class:expanded={isExpanded}>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="match-header"
							onclick={() => toggleExpand(match.id)}
							onkeydown={(e) => e.key === 'Enter' && toggleExpand(match.id)}
							role="button"
							tabindex="0"
						>
							<div class="expand-icon" class:rotated={isExpanded}>
								<ChevronRight class="size-4" />
							</div>
							<div class="match-info">
								<div class="match-date">
									{#if isTournamentMatch(match) && match.eventTitle}
										<span class="tournament-name">{match.eventTitle}</span> ·
									{/if}
									{formatDate(match.startTime)}
								</div>
								<div class="match-chips">
									{#if isTournamentMatch(match)}
										<span class="chip tournament">
											<Trophy class="size-3" />
											{m.stats_tournament()}
										</span>
									{:else}
										<span class="chip friendly">{m.stats_friendly()}</span>
									{/if}
									<span class="chip mode">
										{#if match.gameType === 'doubles'}
											<Users class="size-3" />
										{:else}
											<User class="size-3" />
										{/if}
										{match.gameType === 'doubles' ? m.scoring_doubles() : m.scoring_singles()}
									</span>
								</div>
								<div class="match-opponent">
									vs {getOpponentName(match)}
								</div>
							</div>
							<div class="match-result" class:won={result.won} class:lost={!result.won && !result.tied}>
								<span class="result-label">
									{result.won ? m.stats_won() : result.tied ? 'Tie' : m.stats_lost()}
								</span>
								<span class="result-score">{result.score}</span>
								{#if twenties > 0}
									<span class="result-twenties">⭐{twenties}</span>
								{/if}
							</div>
						</div>

						{#if isExpanded}
							<div class="match-detail">
								{#if match.matchPhase}
									<div class="event-info">
										<span class="event-phase">{match.matchPhase}</span>
									</div>
								{/if}

								<!-- Games Table -->
								{#if match.games && match.games.length > 0}
									<div class="games-section">
										{#each match.games as game, gameIndex (gameIndex)}
											<div class="game-table">
												<div class="game-row header">
													<span class="team-name">{m.history_game()} {gameIndex + 1}</span>
													{#each game.rounds || [] as _, idx (idx)}
														<span class="round-col">R{idx + 1}</span>
													{/each}
													<span class="total-col">{m.history_total()}</span>
												</div>

												<!-- Team 1 Row -->
												<div class="game-row" class:winner-row={game.winner === 1}>
													<span class="team-name">{match.team1Name}</span>
													{#each game.rounds || [] as round, rIdx (rIdx)}
														<span class="round-col">
															<span class="points-with-hammer">
																{#if match.showHammer && round.hammerTeam === 1}
																	<span class="hammer">🔨</span>
																{/if}
																{round.team1Points}
															</span>
															{#if match.show20s ?? $gameSettings.show20s}
																<span class="twenty">⭐{round.team1Twenty}</span>
															{/if}
														</span>
													{/each}
													<span class="total-col total-score" class:winner={game.winner === 1}>
														{game.team1Points}
														{#if match.show20s ?? $gameSettings.show20s}
															{@const total20s = (game.rounds || []).reduce((sum, r) => sum + r.team1Twenty, 0)}
															{#if total20s > 0}
																<span class="twenty">⭐{total20s}</span>
															{/if}
														{/if}
													</span>
												</div>

												<!-- Team 2 Row -->
												<div class="game-row" class:winner-row={game.winner === 2}>
													<span class="team-name">{match.team2Name}</span>
													{#each game.rounds || [] as round, rIdx2 (rIdx2)}
														<span class="round-col">
															<span class="points-with-hammer">
																{#if match.showHammer && round.hammerTeam === 2}
																	<span class="hammer">🔨</span>
																{/if}
																{round.team2Points}
															</span>
															{#if match.show20s ?? $gameSettings.show20s}
																<span class="twenty">⭐{round.team2Twenty}</span>
															{/if}
														</span>
													{/each}
													<span class="total-col total-score" class:winner={game.winner === 2}>
														{game.team2Points}
														{#if match.show20s ?? $gameSettings.show20s}
															{@const total20s = (game.rounds || []).reduce((sum, r) => sum + r.team2Twenty, 0)}
															{#if total20s > 0}
																<span class="twenty">⭐{total20s}</span>
															{/if}
														{/if}
													</span>
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.stats-container {
		min-height: 100vh;
		max-height: 100vh;
		overflow-y: auto;
		background: var(--background);
		color: var(--foreground);
		padding: 1.5rem 2rem;
		padding-top: max(1.5rem, env(safe-area-inset-top, 1.5rem));
		padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem));
	}

	/* Header */
	.page-header {
		background: var(--card);
		border-bottom: 1px solid var(--border);
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
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: var(--muted);
		border: none;
		color: var(--foreground);
		cursor: pointer;
		transition: all 0.15s;
	}

	.back-btn:hover {
		background: var(--accent);
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

	.empty-state.small {
		padding: 2rem 1rem;
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

	/* Stats Cards */
	.stats-cards {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.stat-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.75rem 0.5rem;
		text-align: center;
	}

	.stat-value {
		display: block;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--primary);
		line-height: 1.1;
	}

	.stat-percent {
		display: block;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--muted-foreground);
		margin-top: 0.1rem;
	}

	.stat-label {
		display: block;
		font-size: 0.65rem;
		color: var(--muted-foreground);
		margin-top: 0.2rem;
		text-transform: capitalize;
	}

	/* Stat card variants */
	.stat-card.won .stat-value {
		color: #22c55e;
	}

	.stat-card.won .stat-percent {
		color: #22c55e;
	}

	.stat-card.tied .stat-value {
		color: var(--muted-foreground);
	}

	.stat-card.lost .stat-value {
		color: #ef4444;
	}

	.stat-card.lost .stat-percent {
		color: #ef4444;
	}

	.stat-card.twenties .stat-value {
		color: rgba(255, 200, 0, 0.9);
	}

	/* Split stats for showing both singles and doubles */
	.stat-card.split {
		padding: 0.5rem 0.25rem;
	}

	.split-stats {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 0.1rem;
	}

	.split-stat {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		color: rgba(255, 200, 0, 0.9);
	}

	.split-value {
		font-size: 1rem;
		font-weight: 700;
	}

	/* Filters */
	.filters-section {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.filter-select {
		padding: 0.5rem 2rem 0.5rem 0.75rem;
		background-color: var(--card);
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%238b9bb3' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.5rem center;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--foreground);
		font-size: 0.85rem;
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
	}

	.filter-select:focus {
		outline: none;
		border-color: var(--primary);
	}

	.opponent-filter {
		flex: 1;
		min-width: 120px;
	}

	/* Match List */
	.match-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.match-item {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
		transition: all 0.2s;
	}

	.match-item:hover {
		border-color: var(--primary);
	}

	.match-item.expanded {
		border-color: var(--primary);
	}

	.match-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		cursor: pointer;
	}

	.expand-icon {
		flex-shrink: 0;
		color: var(--muted-foreground);
		transition: transform 0.2s;
	}

	.expand-icon.rotated {
		transform: rotate(90deg);
	}

	.match-info {
		flex: 1;
		min-width: 0;
	}

	.match-date {
		font-size: 0.7rem;
		color: var(--muted-foreground);
		margin-bottom: 0.25rem;
	}

	.tournament-name {
		color: var(--foreground);
		font-weight: 500;
	}

	.match-chips {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.25rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.15rem 0.5rem;
		font-size: 0.65rem;
		font-weight: 500;
		border-radius: 4px;
		white-space: nowrap;
	}

	.chip.tournament {
		background: color-mix(in srgb, #22c55e 15%, transparent);
		color: #22c55e;
	}

	.chip.friendly {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
	}

	.chip.mode {
		background: var(--muted);
		color: var(--muted-foreground);
	}

	.match-opponent {
		font-size: 0.85rem;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.match-result {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.15rem;
		flex-shrink: 0;
	}

	.result-label {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
	}

	.match-result.won .result-label {
		background: color-mix(in srgb, #22c55e 15%, transparent);
		color: #22c55e;
	}

	.match-result.lost .result-label {
		background: color-mix(in srgb, #ef4444 15%, transparent);
		color: #ef4444;
	}

	.result-score {
		font-size: 1rem;
		font-weight: 700;
	}

	.result-twenties {
		font-size: 0.7rem;
		color: rgba(255, 200, 0, 0.9);
	}

	/* Match Detail */
	.match-detail {
		border-top: 1px solid var(--border);
		padding: 0.75rem 1rem;
		background: var(--muted);
	}

	.event-info {
		margin-bottom: 0.75rem;
		font-size: 0.85rem;
	}

	.event-title {
		font-weight: 600;
	}

	.event-phase {
		color: var(--muted-foreground);
	}

	/* Games Section */
	.games-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.game-table {
		background: var(--card);
		border-radius: 6px;
		overflow: hidden;
	}

	.game-row {
		display: flex;
		gap: 0.4rem;
		padding: 0.4rem 0.5rem;
		align-items: center;
	}

	.game-row.header {
		background: var(--secondary);
		font-weight: 600;
		font-size: 0.7rem;
		color: var(--muted-foreground);
	}

	.game-row .team-name {
		width: 100px;
		flex-shrink: 0;
		font-weight: 500;
		font-size: 0.75rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.game-row .round-col {
		flex: 1;
		min-width: 32px;
		text-align: center;
		font-size: 0.8rem;
		color: var(--muted-foreground);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		align-items: center;
	}

	.points-with-hammer {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		justify-content: center;
	}

	.hammer {
		font-size: 0.65rem;
	}

	.twenty {
		font-size: 0.6rem;
		color: rgba(255, 200, 0, 0.9);
	}

	.game-row .total-col {
		min-width: 40px;
		text-align: center;
		font-weight: 600;
		font-size: 0.7rem;
		color: var(--muted-foreground);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		align-items: center;
	}

	.game-row .total-col.total-score {
		font-size: 0.9rem;
		color: var(--foreground);
	}

	.game-row .total-col.total-score.winner {
		color: var(--primary);
	}

	.game-row.winner-row {
		background: color-mix(in srgb, var(--primary) 8%, transparent);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.stats-container {
			padding: 1rem;
		}

		.page-header {
			margin: -1rem -1rem 1rem -1rem;
			padding: 0.75rem 1rem;
		}

		.header-center h1 {
			font-size: 1rem;
		}

		.stats-cards {
			grid-template-columns: repeat(5, 1fr);
			gap: 0.35rem;
		}

		.stat-card {
			padding: 0.5rem 0.25rem;
		}

		.stat-value {
			font-size: 1.1rem;
		}

		.stat-percent {
			font-size: 0.6rem;
		}

		.stat-label {
			font-size: 0.55rem;
		}

		.game-row .team-name {
			width: 80px;
			font-size: 0.7rem;
		}
	}

	@media (max-width: 400px) {
		.stats-cards {
			grid-template-columns: repeat(5, 1fr);
			gap: 0.25rem;
		}

		.stat-card {
			padding: 0.4rem 0.15rem;
		}

		.stat-value {
			font-size: 1rem;
		}

		.stat-percent {
			font-size: 0.55rem;
		}

		.stat-label {
			font-size: 0.5rem;
		}

		.filter-select {
			font-size: 0.75rem;
			padding: 0.4rem 1.5rem 0.4rem 0.5rem;
		}
	}
</style>
