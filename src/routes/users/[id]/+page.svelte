<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { getUserProfileById, getUserProfileByKey, type UserProfile } from '$lib/firebase/userProfile';
	import { getTournamentMatchesForUser } from '$lib/firebase/firestore';
	import type { MatchHistory } from '$lib/types/history';
	import type { TournamentRecord } from '$lib/types/tournament';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import PullToRefresh from '$lib/components/PullToRefresh.svelte';
	import { theme } from '$lib/stores/theme';
	import { CircleAlert } from '@lucide/svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import SEO from '$lib/components/SEO.svelte';
	import PlayerStatsContent from '$lib/components/PlayerStatsContent.svelte';

	let urlParam = $derived(page.params.id);

	// Resolved Firestore user ID (after key lookup if needed)
	let resolvedUserId = $state<string | null>(null);

	function isLikelyKey(param: string): boolean {
		return /^[A-Za-z0-9]{6}$/.test(param);
	}

	// Data state
	let isLoading = $state(true);
	let profile = $state<UserProfile | null>(null);
	let matches: MatchHistory[] = $state([]);
	let tournamentRecords: TournamentRecord[] = $state([]);
	let notFound = $state(false);

	onMount(() => {
		loadData();
	});

	async function loadData() {
		isLoading = true;
		notFound = false;
		try {
			const timeout = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Timeout')), 15000)
			);

			// Resolve user: try key first (6-char), then Firebase ID
			let userProfile: UserProfile | null = null;
			let userId: string;

			if (isLikelyKey(urlParam)) {
				const result = await Promise.race([getUserProfileByKey(urlParam), timeout]);
				if (result) {
					userProfile = result;
					userId = result.odId;
				} else {
					notFound = true;
					return;
				}
			} else {
				userId = urlParam;
				userProfile = await Promise.race([getUserProfileById(userId), timeout]) as UserProfile | null;
			}

			if (!userProfile) {
				notFound = true;
				return;
			}

			resolvedUserId = userId;
			profile = userProfile;

			const tournamentMatches = await Promise.race([
				getTournamentMatchesForUser(userId),
				timeout
			]) as MatchHistory[];

			matches = tournamentMatches;
			tournamentRecords = userProfile.tournaments ?? [];
		} catch (error) {
			console.error('Error loading user profile:', error);
			notFound = true;
		} finally {
			isLoading = false;
		}
	}

	// Count perfect rounds (all 20s in a round)
	let perfectRounds = $derived((() => {
		if (!resolvedUserId) return 0;
		let count = 0;
		for (const match of matches) {
			let team: 1 | 2 | null = null;
			if (match.players?.team1?.userId === resolvedUserId) team = 1;
			else if (match.players?.team2?.userId === resolvedUserId) team = 2;
			else if (match.players?.team1?.partner?.userId === resolvedUserId) team = 1;
			else if (match.players?.team2?.partner?.userId === resolvedUserId) team = 2;
			if (!team) continue;
			const max = match.gameType === 'doubles' ? 12 : 8;
			for (const game of match.games ?? []) {
				for (const round of game.rounds ?? []) {
					if ((team === 1 ? round.team1Twenty : round.team2Twenty) === max) count++;
				}
			}
		}
		return count;
	})());

	// Country flag helper — returns emoji flag for standard ISO 2-letter codes
	// Non-standard codes (e.g. CAT) have no emoji, use SVG instead
	function getCountryFlag(countryCode: string): string | null {
		const code = countryCode.toUpperCase();
		if (code.length !== 2) return null;
		return code
			.split('')
			.map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
			.join('');
	}

	// SVG flag path for non-standard country codes (e.g. Catalonia)
	const FLAG_SVG: Record<string, string> = {
		'CAT': '/flags/cat.svg'
	};

	function getCountryFlagSvg(countryCode: string): string | undefined {
		return FLAG_SVG[countryCode.toUpperCase()];
	}
</script>

<SEO
	title={profile ? `${profile.playerName} - Crokinole Stats | Scorekinole` : 'Player Profile - Scorekinole'}
	description={profile ? `Crokinole tournament statistics for ${profile.playerName}. View match history, win rate, and 20s accuracy.` : 'Player profile and statistics.'}
	canonical="https://scorekinole.web.app/users/{urlParam}"
/>

<div class="profile-container" data-theme={$theme}>
	<header class="page-header">
		<div class="header-row">
			<div class="header-left">
				<button class="back-btn" onclick={() => goto('/ranking')}>
					<ArrowLeft class="size-4" />
					<span>{m.common_rankings()}</span>
				</button>
			</div>
			<div class="header-center">
				<h1>{m.profile_playerProfile()}</h1>
			</div>
			<div class="header-right">
				<ThemeToggle />
			</div>
		</div>
	</header>

	{#if !isLoading && profile}
		<!-- Profile Header Card -->
		<div class="profile-header-card">
			<div class="profile-avatar-section">
				{#if profile.photoURL}
					<img src={profile.photoURL} alt="" class="profile-avatar" referrerpolicy="no-referrer" />
				{:else}
					<div class="profile-avatar-placeholder">
						{profile.playerName.charAt(0).toUpperCase()}
					</div>
				{/if}
			</div>
			<div class="profile-info">
				<div class="profile-name-row">
					<span class="profile-name">{profile.playerName}</span>
					{#if profile.country}
						{@const emojiFlag = getCountryFlag(profile.country)}
						{@const svgFlag = getCountryFlagSvg(profile.country)}
						{#if svgFlag}
							<img class="profile-country-flag" src={svgFlag} alt={profile.country} />
						{:else if emojiFlag}
							<span class="profile-country">{emojiFlag}</span>
						{/if}
					{/if}
					{#if perfectRounds > 0}
						<span class="perfect-badge" title={perfectRounds === 1 ? m.stats_perfectRound() : m.stats_perfectRounds()}>💎 {perfectRounds}</span>
					{/if}
				</div>
				<div class="profile-stats-row">
					{#if tournamentRecords.length > 0}
						<div class="profile-stat">
							<span class="profile-stat-value">{tournamentRecords.length}</span>
							<span class="profile-stat-label">{m.profile_tournamentsPlayed()}</span>
						</div>
						<div class="profile-stat">
							<span class="profile-stat-value">{matches.length}</span>
							<span class="profile-stat-label">{m.profile_tournamentMatches()}</span>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<PullToRefresh onrefresh={loadData}>
	{#if isLoading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>{m.common_loading()}...</p>
		</div>
	{:else if notFound}
		<div class="empty-state">
			<div class="empty-icon">
				<CircleAlert class="size-10" />
			</div>
			<h3>{m.profile_userNotFound()}</h3>
		</div>
	{:else if profile && resolvedUserId}
		<PlayerStatsContent
			{matches}
			userId={resolvedUserId}
			{tournamentRecords}
			show20s={true}
			showFriendlyFilter={false}
			showPerfectBadge={false}
		/>
	{/if}
	</PullToRefresh>
</div>

<style>
	.profile-container {
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
		flex-shrink: 0;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		color: var(--muted-foreground);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 6px;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.back-btn:hover {
		color: var(--foreground);
		background: color-mix(in srgb, var(--foreground) 8%, transparent);
	}

	.back-btn:active {
		transform: scale(0.97);
	}

	.header-center {
		flex: 1;
		text-align: center;
	}

	.header-center h1 {
		font-size: 1.1rem;
		margin: 0;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	/* Profile Header Card */
	.profile-header-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.5rem;
		background: var(--card);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.profile-avatar-section {
		flex-shrink: 0;
	}

	.profile-avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid var(--border);
	}

	.profile-avatar-placeholder {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 60%, #6366f1));
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.4rem;
		font-weight: 700;
	}

	.profile-info {
		flex: 1;
		min-width: 0;
	}

	.profile-name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.profile-name {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--foreground);
	}

	.profile-country {
		font-size: 1.2rem;
	}

	.profile-country-flag {
		height: 1.2em;
		width: auto;
		vertical-align: middle;
		border-radius: 2px;
	}

	.perfect-badge {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
		padding: 0.15rem 0.5rem;
		border-radius: 99px;
		white-space: nowrap;
	}

	.profile-stats-row {
		display: flex;
		gap: 1.5rem;
		margin-top: 0.35rem;
	}

	.profile-stat {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
	}

	.profile-stat-value {
		font-size: 1rem;
		font-weight: 800;
		color: var(--primary);
	}

	.profile-stat-label {
		font-size: 0.7rem;
		color: var(--muted-foreground);
		text-transform: lowercase;
	}

	/* Make PullToRefresh wrapper fill remaining flex space */
	.profile-container :global(.pull-to-refresh-wrapper) {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.profile-container :global(.pull-content) {
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
		.profile-header-card { padding: 0.75rem 1rem; }
		.profile-avatar, .profile-avatar-placeholder { width: 44px; height: 44px; font-size: 1.1rem; }
		.profile-name { font-size: 1rem; }
	}
</style>
