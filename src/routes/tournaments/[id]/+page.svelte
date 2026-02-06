<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { getTournament, subscribeTournament } from '$lib/firebase/tournaments';
	import ScorekinoleLogo from '$lib/components/ScorekinoleLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { theme } from '$lib/stores/theme';
	import type { Tournament, BracketMatch } from '$lib/types/tournament';
	import { isBye } from '$lib/algorithms/bracket';
	import { translateCountry } from '$lib/utils/countryTranslations';
	import LiveTournamentView from '$lib/components/tournament/LiveTournamentView.svelte';
	import { currentUser } from '$lib/firebase/auth';
	import { isSuperAdmin } from '$lib/firebase/admin';
	import { getYouTubeEmbedUrl } from '$lib/utils/youtube';

	let tournament = $state<Tournament | null>(null);
	let canEdit = $state(false);
	let loading = $state(true);
	let error = $state(false);
	let unsubscribe: (() => void) | null = null;

	// Video modal state
	let showVideoModal = $state(false);
	let videoMatch = $state<BracketMatch | null>(null);

	// Bracket view state (for SPLIT_DIVISIONS)
	let activeTab = $state<'gold' | 'silver'>('gold');

	// Phase tabs state
	let activePhase = $state<'groups' | 'bracket'>('groups');

	let tournamentId = $derived($page.params.id);

	// Check if tournament is LIVE
	let isLive = $derived(
		tournament?.status === 'GROUP_STAGE' ||
		tournament?.status === 'TRANSITION' ||
		tournament?.status === 'FINAL_STAGE'
	);

	let isCompleted = $derived(tournament?.status === 'COMPLETED');

	// Final standings (top 4) - uses finalPosition if available
	let finalStandings = $derived(
		tournament?.participants
			.filter(p => p.finalPosition !== undefined && p.finalPosition > 0)
			.toSorted((a, b) => (a.finalPosition || 99) - (b.finalPosition || 99))
			.slice(0, 4) || []
	);

	// Check if both phases exist
	let hasGroupStage = $derived(tournament?.groupStage && tournament.groupStage.groups.length > 0);
	let hasFinalStage = $derived(tournament?.finalStage && (tournament.status === 'FINAL_STAGE' || tournament.status === 'COMPLETED'));
	let hasBothPhases = $derived(hasGroupStage && hasFinalStage);

	// Bracket derived values
	let isSplitDivisions = $derived(tournament?.finalStage?.mode === 'SPLIT_DIVISIONS');
	let isParallelBrackets = $derived(tournament?.finalStage?.mode === 'PARALLEL_BRACKETS');
	let goldBracket = $derived(tournament?.finalStage?.goldBracket);
	let silverBracket = $derived(tournament?.finalStage?.silverBracket);
	let parallelBrackets = $derived(tournament?.finalStage?.parallelBrackets || []);

	// For parallel brackets, track which bracket tab is active
	let activeParallelBracket = $state(0);

	// Get participants who qualified to gold bracket (for marking in group standings)
	let goldQualifiedIds = $derived((() => {
		const ids = new Set<string>();
		if (goldBracket?.rounds) {
			// Get all participants from the first round of gold bracket
			const firstRound = goldBracket.rounds[0];
			if (firstRound?.matches) {
				for (const match of firstRound.matches) {
					if (match.participantA && !isBye(match.participantA)) {
						ids.add(match.participantA);
					}
					if (match.participantB && !isBye(match.participantB)) {
						ids.add(match.participantB);
					}
				}
			}
		}
		return ids;
	})());

	// Current bracket depends on mode
	let currentBracket = $derived(
		isParallelBrackets
			? parallelBrackets[activeParallelBracket]?.bracket
			: (activeTab === 'gold' ? goldBracket : silverBracket)
	);
	let rounds = $derived(currentBracket?.rounds || []);

	// Find all matches with video (for highlighting in Final Standings)
	let matchesWithVideo = $derived((() => {
		const results: Array<{ match: BracketMatch; label: string }> = [];
		if (!goldBracket?.rounds) return results;

		// Check all rounds
		for (const round of goldBracket.rounds) {
			for (const match of round.matches) {
				if (match.videoId) {
					results.push({ match, label: round.name });
				}
			}
		}

		// Check 3rd/4th place match
		if (goldBracket.thirdPlaceMatch?.videoId) {
			results.push({ match: goldBracket.thirdPlaceMatch, label: '3º/4º' });
		}

		return results;
	})());
	let thirdPlaceMatch = $derived(currentBracket?.thirdPlaceMatch);

	onMount(async () => {
		await loadTournament();

		// Subscribe to real-time updates
		if (tournamentId) {
			unsubscribe = subscribeTournament(tournamentId, (updated) => {
				if (updated) {
					tournament = JSON.parse(JSON.stringify(updated));
				}
			});
		}
	});

	// Check if group stage has match details (wins/losses) or just aggregated data
	let hasMatchDetails = $derived((() => {
		if (!tournament?.groupStage?.groups) return true;
		// Check if any standing has non-zero matchesWon or matchesLost
		for (const group of tournament.groupStage.groups) {
			for (const standing of group.standings) {
				if (standing.matchesWon > 0 || standing.matchesLost > 0) {
					return true;
				}
			}
		}
		return false;
	})());

	onDestroy(() => {
		if (unsubscribe) {
			unsubscribe();
		}
	});

	async function loadTournament() {
		loading = true;
		error = false;

		try {
			if (!tournamentId) {
				error = true;
				loading = false;
				return;
			}
			tournament = await getTournament(tournamentId);
			if (!tournament) {
				error = true;
			} else {
				// Check if user can edit (creator or superadmin)
				const user = $currentUser;
				if (user) {
					const isCreator = tournament.createdBy === user.uid;
					const superAdmin = await isSuperAdmin();
					canEdit = isCreator || superAdmin;
				}
			}
		} catch (err) {
			console.error('Error loading tournament:', err);
			error = true;
		} finally {
			loading = false;
		}
	}

	function goBack() {
		goto('/tournaments');
	}

	function getParticipantName(participantId: string | undefined): string {
		if (!participantId) return m.common_tbd();
		if (isBye(participantId)) return 'BYE';
		if (!tournament) return m.common_unknown();
		return tournament.participants.find(p => p.id === participantId)?.name || m.common_unknown();
	}

	// Get top 4 finishers from a bracket
	function getBracketTop4(pb: { winner?: string; bracket?: { rounds?: Array<{ matches?: Array<{ winner?: string; participantA?: string; participantB?: string }> }>; thirdPlaceMatch?: { winner?: string; participantA?: string; participantB?: string } } }): Array<{ position: number; participantId: string }> {
		const results: Array<{ position: number; participantId: string }> = [];
		const rounds = pb.bracket?.rounds;
		if (!rounds?.length) return results;

		// Final match: winner = 1st, loser = 2nd
		const finalRound = rounds[rounds.length - 1];
		const finalMatch = finalRound?.matches?.[0];
		if (finalMatch?.winner) {
			results.push({ position: 1, participantId: finalMatch.winner });
			// Loser is 2nd
			const loser = finalMatch.participantA === finalMatch.winner ? finalMatch.participantB : finalMatch.participantA;
			if (loser) results.push({ position: 2, participantId: loser });
		}

		// Third place match: winner = 3rd, loser = 4th
		const thirdPlace = pb.bracket?.thirdPlaceMatch;
		if (thirdPlace?.winner) {
			results.push({ position: 3, participantId: thirdPlace.winner });
			const loser = thirdPlace.participantA === thirdPlace.winner ? thirdPlace.participantB : thirdPlace.participantA;
			if (loser) results.push({ position: 4, participantId: loser });
		}

		return results;
	}

	function formatDate(timestamp: number | undefined): string {
		if (!timestamp) return '';
		return new Date(timestamp).toLocaleDateString('es-ES', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
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

	function getModeLabel(mode: string | undefined): string {
		switch (mode) {
			case 'singles': return m.tournaments_singles();
			case 'doubles': return m.tournaments_doubles();
			default: return '';
		}
	}

	function getPhaseLabel(status: string | undefined): string {
		switch (status) {
			case 'GROUP_STAGE': return m.tournament_groupStage();
			case 'TRANSITION': return m.tournament_transition();
			case 'FINAL_STAGE': return m.tournament_finalStage();
			default: return '';
		}
	}

	function translateGroupName(name: string): string {
		// Extract number from group name (e.g., "Grupo 1" or "Group 1" -> "1")
		const match = name.match(/\d+/);
		if (match) {
			return `${m.tournament_group()} ${match[0]}`;
		}
		return name;
	}

	function translateRoundName(name: string): string {
		const key = name.toLowerCase();
		const roundTranslations: Record<string, string> = {
			'final': m.tournament_final(),
			'semifinal': m.tournament_semifinal(),
			'quarterfinal': m.tournament_round() + ' 8',
			'round of 16': m.tournament_round() + ' 16',
			'round of 32': m.tournament_round() + ' 32',
			'third place': m.tournament_thirdPlace(),
		};
		return roundTranslations[key] || name.charAt(0).toUpperCase() + name.slice(1);
	}

	function isByeMatch(match: BracketMatch): boolean {
		return isBye(match.participantA) || isBye(match.participantB);
	}
</script>

<svelte:head>
	<title>{tournament?.name || 'Torneo'} - Scorekinole</title>
</svelte:head>

<div class="detail-container" data-theme={$theme}>
	<header class="page-header">
		<div class="header-row">
			<div class="header-left">
				<ScorekinoleLogo href="/tournaments" />
			</div>
			<div class="header-center">
				{#if tournament}
					<h1>{tournament.name}</h1>
				{:else}
					<h1>{m.common_loading()}...</h1>
				{/if}
			</div>
			<div class="header-right">
				{#if canEdit}
					<a href="/admin/tournaments/{tournamentId}" class="admin-link" title="Administrar torneo">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
						</svg>
					</a>
				{/if}
				<ThemeToggle />
			</div>
		</div>
	</header>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>{m.common_loading()}...</p>
		</div>
	{:else if error || !tournament}
		<div class="error-state">
			<div class="error-icon">⚠️</div>
			<h3>{m.admin_errorLoading?.() || 'Error'}</h3>
			<button class="back-button" onclick={goBack}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 12H5M12 19l-7-7 7-7" />
				</svg>
				{m.tournaments_publicTournaments()}
			</button>
		</div>
	{:else}
		{#if isLive}
			<!-- LIVE Tournament View -->
			<LiveTournamentView {tournament} />
		{:else}
			<!-- Completed Tournament View -->
			<div class="info-section">
				<!-- Completed/Draft: Full details -->
				<div class="info-grid">
					{#if tournament.tournamentDate}
						<div class="info-card">
							<span class="info-label">{m.tournament_date()}</span>
							<span class="info-value">{formatDate(tournament.tournamentDate)}</span>
						</div>
					{/if}
					{#if tournament.city || tournament.country}
						<div class="info-card">
							<span class="info-label">{m.tournament_location()}</span>
							<span class="info-value">
								{tournament.city}{tournament.city && tournament.country ? ', ' : ''}{translateCountry(tournament.country)}
							</span>
						</div>
					{/if}
					<div class="info-card">
						<span class="info-label">{m.tournaments_participants()}</span>
						<span class="info-value">{tournament.participants.length}</span>
					</div>
					<div class="info-card">
						<span class="info-label">{m.common_mode()}</span>
						<span class="info-value">{getModeLabel(tournament.gameType)}</span>
					</div>
					{#if tournament.rankingConfig?.enabled && tournament.rankingConfig.tier}
						<div class="info-card">
							<span class="info-label">Tier</span>
							<span class="info-value tier-{tournament.rankingConfig.tier}">{getTierLabel(tournament.rankingConfig.tier)}</span>
						</div>
					{/if}
				</div>

				{#if tournament.description}
					<p class="tournament-description">{tournament.description}</p>
				{/if}

				<!-- Final Standings (for completed tournaments) -->
				{#if isCompleted && isParallelBrackets && parallelBrackets.length > 0}
					<!-- For parallel brackets, show top 4 from each bracket -->
					<div class="podium-section">
						<div class="podium-header">
							<span class="podium-title">{m.tournament_finalStandings()}</span>
						</div>
						<div class="podium-grid multi">
							{#each parallelBrackets as pb}
								{@const top4 = getBracketTop4(pb)}
								{#if top4.length > 0}
									<div class="podium-group">
										<span class="podium-group-label">{pb.name}</span>
										<ol class="podium-list">
											{#each top4 as entry}
												<li class="podium-entry" data-position={entry.position}>
													<span class="podium-rank">{entry.position}</span>
													<span class="podium-name">{getParticipantName(entry.participantId)}</span>
												</li>
											{/each}
										</ol>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{:else if isCompleted && isSplitDivisions && goldBracket}
					<!-- For split divisions (Gold/Silver), show top 4 from each -->
					<div class="podium-section">
						<div class="podium-header">
							<span class="podium-title">{m.tournament_finalStandings()}</span>
						</div>
						<div class="podium-grid multi">
							{#if goldBracket}
								{@const goldTop4 = getBracketTop4({ bracket: goldBracket })}
								{#if goldTop4.length > 0}
									<div class="podium-group gold">
										<span class="podium-group-label">{m.bracket_gold()}</span>
										<ol class="podium-list">
											{#each goldTop4 as entry}
												<li class="podium-entry" data-position={entry.position}>
													<span class="podium-rank">{entry.position}</span>
													<span class="podium-name">{getParticipantName(entry.participantId)}</span>
												</li>
											{/each}
										</ol>
									</div>
								{/if}
							{/if}
							{#if silverBracket}
								{@const silverTop4 = getBracketTop4({ bracket: silverBracket })}
								{#if silverTop4.length > 0}
									<div class="podium-group silver">
										<span class="podium-group-label">{m.bracket_silver()}</span>
										<ol class="podium-list">
											{#each silverTop4 as entry}
												<li class="podium-entry" data-position={entry.position}>
													<span class="podium-rank">{entry.position}</span>
													<span class="podium-name">{getParticipantName(entry.participantId)}</span>
												</li>
											{/each}
										</ol>
									</div>
								{/if}
							{/if}
						</div>
					</div>
				{:else if isCompleted && finalStandings.length > 0}
					<div class="podium-section">
						<div class="podium-header">
							<span class="podium-title">{m.tournament_finalStandings()}</span>
						</div>
						<ol class="podium-list inline">
							{#each finalStandings as participant}
								<li class="podium-entry" data-position={participant.finalPosition}>
									<span class="podium-rank">{participant.finalPosition}</span>
									<span class="podium-name">{participant.name}</span>
								</li>
							{/each}
						</ol>
					</div>
				{:else if isCompleted && tournament.finalStage?.winner}
					<!-- Fallback: just show winner if no finalPositions -->
					<div class="podium-section">
						<div class="podium-header">
							<span class="podium-title">{m.tournament_winner()}</span>
						</div>
						<ol class="podium-list inline">
							<li class="podium-entry" data-position="1">
								<span class="podium-rank">1</span>
								<span class="podium-name">{getParticipantName(tournament.finalStage.winner)}</span>
							</li>
						</ol>
					</div>
				{/if}

				<!-- Videos Section -->
				{#if isCompleted && matchesWithVideo.length > 0}
					<div class="videos-section">
						<div class="videos-header">
							<svg class="videos-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
							</svg>
							<span class="videos-title">{m.tournament_matchVideos?.() ?? 'Videos del torneo'}</span>
						</div>
						<div class="videos-grid">
							{#each matchesWithVideo as { match, label }}
								<button
									class="video-card"
									onclick={() => { videoMatch = match; showVideoModal = true; }}
								>
									<div class="video-thumbnail">
										<div class="video-thumbnail-bg">
											<svg class="youtube-logo" viewBox="0 0 28 20" fill="currentColor">
												<path d="M27.4 3.1c-.3-1.2-1.2-2.1-2.4-2.4C22.8 0 14 0 14 0S5.2 0 3 .7C1.8 1 .9 1.9.6 3.1 0 5.3 0 10 0 10s0 4.7.6 6.9c.3 1.2 1.2 2.1 2.4 2.4 2.2.7 11 .7 11 .7s8.8 0 11-.7c1.2-.3 2.1-1.2 2.4-2.4.6-2.2.6-6.9.6-6.9s0-4.7-.6-6.9z"/>
												<path fill="#fff" d="M11.2 14.2l7.3-4.2-7.3-4.2v8.4z"/>
											</svg>
										</div>
										<div class="play-overlay">
											<div class="play-button">
												<svg viewBox="0 0 24 24" fill="currentColor">
													<polygon points="5 3 19 12 5 21 5 3"></polygon>
												</svg>
											</div>
										</div>
									</div>
									<div class="video-info">
										<span class="video-round">{label}</span>
										<span class="video-match-title">
											{getParticipantName(match.participantA)} vs {getParticipantName(match.participantB)}
										</span>
										{#if match.status === 'COMPLETED'}
											<span class="video-score">
												{match.totalPointsA || match.gamesWonA || 0} - {match.totalPointsB || match.gamesWonB || 0}
											</span>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Phase Tabs (when both phases exist) -->
		{#if hasBothPhases}
			<div class="phase-nav" role="tablist">
				<button
					class="phase-tab"
					class:active={activePhase === 'groups'}
					onclick={() => activePhase = 'groups'}
					role="tab"
					aria-selected={activePhase === 'groups'}
				>
					<span class="tab-indicator"></span>
					<span class="tab-content">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<rect x="3" y="3" width="7" height="7" rx="1.5" />
							<rect x="14" y="3" width="7" height="7" rx="1.5" />
							<rect x="3" y="14" width="7" height="7" rx="1.5" />
							<rect x="14" y="14" width="7" height="7" rx="1.5" />
						</svg>
						<span class="tab-label">{m.tournament_groupStage()}</span>
					</span>
				</button>
				<button
					class="phase-tab"
					class:active={activePhase === 'bracket'}
					onclick={() => activePhase = 'bracket'}
					role="tab"
					aria-selected={activePhase === 'bracket'}
				>
					<span class="tab-indicator"></span>
					<span class="tab-content">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M4 6h4v4H4z" />
							<path d="M4 14h4v4H4z" />
							<path d="M8 8h4v2h-4z" />
							<path d="M8 16h4v-2h-4z" />
							<path d="M12 9h4v6h-4z" />
							<path d="M16 12h4v0h-4z" />
						</svg>
						<span class="tab-label">{m.tournament_finalStage()}</span>
					</span>
				</button>
			</div>
		{/if}

		<!-- Group Stage Section -->
		{#if hasGroupStage && (!hasBothPhases || activePhase === 'groups')}
			<section class="stage-section">
				{#if !hasBothPhases}
					<h2 class="section-title">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="3" y="3" width="7" height="7" />
							<rect x="14" y="3" width="7" height="7" />
							<rect x="3" y="14" width="7" height="7" />
							<rect x="14" y="14" width="7" height="7" />
						</svg>
						{m.tournament_groupStage()}
					</h2>
				{/if}
				<div class="groups-container">
					{#each tournament.groupStage?.groups ?? [] as group}
						<div class="group-card">
							<h3 class="group-name">{translateGroupName(group.name)}</h3>
							<table class="standings-table">
								<thead>
									<tr>
										<th class="pos-col">#</th>
										<th class="name-col">{m.common_player()}</th>
										{#if hasMatchDetails}
											<th class="stat-col">V</th>
											<th class="stat-col">P</th>
										{:else}
											<th class="stat-col">20s</th>
										{/if}
										<th class="stat-col">Pts</th>
									</tr>
								</thead>
								<tbody>
									{#each group.standings.toSorted((a, b) => a.position - b.position) as standing}
										<tr class:qualified={goldQualifiedIds.has(standing.participantId)}>
											<td class="pos-col">{standing.position}</td>
											<td class="name-col">{getParticipantName(standing.participantId)}</td>
											{#if hasMatchDetails}
												<td class="stat-col">{standing.matchesWon}</td>
												<td class="stat-col">{standing.matchesLost}</td>
											{:else}
												<td class="stat-col">{standing.total20s || 0}</td>
											{/if}
											<td class="stat-col">{standing.points}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Final Stage Section -->
		{#if hasFinalStage && (!hasBothPhases || activePhase === 'bracket')}
			<section class="stage-section">
				{#if !hasBothPhases}
					<h2 class="section-title">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2" />
							<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
							<path d="M9 12l2 2 4-4" />
						</svg>
						{m.tournament_finalStage()}
					</h2>
				{/if}

					<!-- Bracket panel with integrated tabs -->
				<div class="bracket-panel" class:gold-active={activeTab === 'gold'} class:silver-active={activeTab === 'silver'}>
					<!-- Division tabs for SPLIT_DIVISIONS (not for parallel brackets) -->
					{#if isSplitDivisions && !isParallelBrackets}
						<div class="panel-header">
							<div class="division-tabs">
								<button
									class="division-tab"
									class:active={activeTab === 'gold'}
									onclick={() => activeTab = 'gold'}
								>
									<span class="tab-icon gold">●</span>
									{m.bracket_gold()}
								</button>
								<button
									class="division-tab"
									class:active={activeTab === 'silver'}
									onclick={() => activeTab = 'silver'}
								>
									<span class="tab-icon silver">●</span>
									{m.bracket_silver()}
								</button>
							</div>
						</div>
					{/if}

					<!-- Parallel brackets tabs (A/B/C Finals) -->
					{#if isParallelBrackets && parallelBrackets.length > 0}
						<div class="panel-header">
							<div class="division-tabs parallel">
								{#each parallelBrackets as pb, index}
									<button
										class="division-tab"
										class:active={activeParallelBracket === index}
										onclick={() => activeParallelBracket = index}
									>
										<span class="tab-label">{pb.label}</span>
										{pb.name}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Bracket visualization -->
					{#if currentBracket && rounds.length > 0}
						<div class="bracket-wrapper">
							<div class="bracket-container">
								{#each rounds as round, roundIndex}
									<div class="bracket-round" style="--round-index: {roundIndex}">
										<h3 class="round-name">{translateRoundName(round.name)}</h3>
										<div class="matches-column">
											{#each round.matches as match}
												{#if !isByeMatch(match)}
													<div class="bracket-match" class:completed={match.status === 'COMPLETED'} class:has-video={match.videoId}>
														<div
															class="match-participant"
															class:winner={match.winner === match.participantA}
															class:tbd={!match.participantA}
														>
															<span class="participant-name">{getParticipantName(match.participantA)}</span>
															{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																<span class="score">{match.totalPointsA || match.gamesWonA || 0}</span>
															{/if}
														</div>
														<div class="vs-divider"></div>
														<div
															class="match-participant"
															class:winner={match.winner === match.participantB}
															class:tbd={!match.participantB}
														>
															<span class="participant-name">{getParticipantName(match.participantB)}</span>
															{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																<span class="score">{match.totalPointsB || match.gamesWonB || 0}</span>
															{/if}
														</div>
														{#if match.videoId}
															<button
																class="video-badge"
																onclick={() => { videoMatch = match; showVideoModal = true; }}
																title={m.video_watchVideo?.() ?? 'Ver video'}
															>
																<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
																	<polygon points="5 3 19 12 5 21 5 3"></polygon>
																</svg>
															</button>
														{/if}
													</div>
												{/if}
											{/each}
											<!-- Horizontal connectors between pairs -->
											{#if roundIndex < rounds.length - 1}
												{#each Array(Math.floor(round.matches.filter(m => !isByeMatch(m)).length / 2)) as _, pairIndex}
													<div class="pair-connector" style="--pair-index: {pairIndex}; --total-pairs: {Math.floor(round.matches.filter(m => !isByeMatch(m)).length / 2)}; --total-matches: {round.matches.filter(m => !isByeMatch(m)).length}"></div>
												{/each}
											{/if}
										</div>
									</div>
								{/each}

								<!-- Third place match -->
								{#if thirdPlaceMatch && !isByeMatch(thirdPlaceMatch)}
									<div class="bracket-round third-place">
										<h3 class="round-name">{m.tournament_thirdFourthPlace?.() || '3º/4º'}</h3>
										<div class="matches-column">
											<div class="bracket-match" class:completed={thirdPlaceMatch.status === 'COMPLETED'} class:has-video={thirdPlaceMatch.videoId}>
												<div
													class="match-participant"
													class:winner={thirdPlaceMatch.winner === thirdPlaceMatch.participantA}
													class:tbd={!thirdPlaceMatch.participantA}
												>
													<span class="participant-name">{getParticipantName(thirdPlaceMatch.participantA)}</span>
													{#if thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'WALKOVER'}
														<span class="score">{thirdPlaceMatch.totalPointsA || thirdPlaceMatch.gamesWonA || 0}</span>
													{/if}
												</div>
												<div class="vs-divider"></div>
												<div
													class="match-participant"
													class:winner={thirdPlaceMatch.winner === thirdPlaceMatch.participantB}
													class:tbd={!thirdPlaceMatch.participantB}
												>
													<span class="participant-name">{getParticipantName(thirdPlaceMatch.participantB)}</span>
													{#if thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'WALKOVER'}
														<span class="score">{thirdPlaceMatch.totalPointsB || thirdPlaceMatch.gamesWonB || 0}</span>
													{/if}
												</div>
												{#if thirdPlaceMatch.videoId}
													<button
														class="video-badge"
														onclick={() => { videoMatch = thirdPlaceMatch; showVideoModal = true; }}
														title={m.video_watchVideo?.() ?? 'Ver video'}
													>
														<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
															<polygon points="5 3 19 12 5 21 5 3"></polygon>
														</svg>
													</button>
												{/if}
											</div>
										</div>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	{/if}
	{/if}
</div>

<!-- Video Modal -->
{#if showVideoModal && videoMatch?.videoId}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="video-modal-overlay"
		onclick={() => showVideoModal = false}
		onkeydown={(e) => e.key === 'Escape' && (showVideoModal = false)}
		role="dialog"
		aria-modal="true"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="video-modal" onclick={(e) => e.stopPropagation()}>
			<button class="video-modal-close" onclick={() => showVideoModal = false}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12"/>
				</svg>
			</button>
			<div class="video-modal-content">
				<iframe
					src={getYouTubeEmbedUrl(videoMatch.videoId)}
					title="Match video"
					frameborder="0"
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
					allowfullscreen
				></iframe>
			</div>
			<div class="video-modal-info">
				<span class="video-modal-teams">
					{getParticipantName(videoMatch.participantA)} vs {getParticipantName(videoMatch.participantB)}
				</span>
				<span class="video-modal-score">
					{videoMatch.totalPointsA || videoMatch.gamesWonA || 0} - {videoMatch.totalPointsB || videoMatch.gamesWonB || 0}
				</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.detail-container {
		min-height: 100vh;
		min-height: 100dvh;
		height: 100vh;
		height: 100dvh;
		background: #0f1419;
		padding: 1.5rem 2rem;
		padding-top: max(1.5rem, env(safe-area-inset-top, 1.5rem));
		padding-bottom: max(2rem, env(safe-area-inset-bottom, 2rem));
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
		box-sizing: border-box;
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
		flex-shrink: 0;
	}

	.header-center {
		flex: 1;
		text-align: center;
		min-width: 0;
	}

	.header-center h1 {
		font-size: 1.1rem;
		margin: 0;
		color: #e1e8ed;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-right {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.admin-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		color: #8b9bb3;
		transition: all 0.2s;
	}

	.admin-link:hover {
		background: rgba(102, 126, 234, 0.15);
		color: #667eea;
	}

	.admin-link svg {
		width: 18px;
		height: 18px;
	}

	.detail-container[data-theme='light'] .admin-link {
		color: #718096;
	}

	.detail-container[data-theme='light'] .admin-link:hover {
		background: rgba(102, 126, 234, 0.1);
		color: #667eea;
	}

	/* Loading/Error states */
	.loading-state,
	.error-state {
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

	.error-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.error-state h3 {
		color: #e1e8ed;
		margin: 0 0 1.5rem 0;
	}

	/* LIVE Banner */
	.live-banner {
		display: flex;
		justify-content: center;
		margin-bottom: 1.5rem;
	}

	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1.25rem;
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
		color: white;
		font-size: 0.9rem;
		font-weight: 700;
		border-radius: 20px;
		letter-spacing: 0.1em;
		box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
	}

	.live-dot {
		width: 10px;
		height: 10px;
		background: white;
		border-radius: 50%;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(0.8);
		}
	}

	/* Info Section */
	.info-section {
		margin-bottom: 1rem;
	}

	.winner-card {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 1.25rem;
		margin-bottom: 1.25rem;
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.1) 100%);
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: 12px;
	}

	.winner-icon {
		font-size: 2rem;
	}

	.winner-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.winner-label {
		font-size: 0.75rem;
		color: #fbbf24;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.winner-name {
		font-size: 1.25rem;
		color: #e1e8ed;
		font-weight: 700;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
	}

	.info-grid.compact {
		grid-template-columns: repeat(4, 1fr);
		max-width: 600px;
		margin: 0 auto;
	}

	.info-card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.85rem 1rem;
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 8px;
		text-align: center;
	}

	.info-label {
		font-size: 0.7rem;
		color: #6b7a94;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.info-value {
		font-size: 0.95rem;
		color: #e1e8ed;
		font-weight: 600;
	}

	.info-value.tier-MAJOR { color: #f59e0b; }
	.info-value.tier-NATIONAL { color: #8b5cf6; }
	.info-value.tier-REGIONAL { color: #10b981; }
	.info-value.tier-CLUB { color: #6b7a94; }

	/* Tournament Description */
	.tournament-description {
		margin: 1rem 0 0 0;
		padding: 0.75rem 1rem;
		font-size: 0.85rem;
		color: #8b9bb3;
		line-height: 1.5;
		background: rgba(45, 55, 72, 0.3);
		border-radius: 8px;
		border-left: 3px solid #667eea;
	}

	.detail-container[data-theme='light'] .tournament-description {
		color: #555;
		background: rgba(0, 0, 0, 0.03);
		border-left-color: #667eea;
	}

	/* Podium Section */
	.podium-section {
		margin-top: 1.25rem;
	}

	.podium-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.625rem;
	}

	.podium-title {
		font-size: 0.7rem;
		font-weight: 600;
		color: #6b7a94;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* Videos Section */
	.videos-section {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid #2d3748;
	}

	.videos-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.videos-icon {
		width: 18px;
		height: 18px;
		color: #ef4444;
	}

	.videos-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: #e1e8ed;
		letter-spacing: -0.01em;
	}

	.videos-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.video-card {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 8px;
		padding: 0.5rem;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.video-card:hover {
		border-color: #ef4444;
		background: #1e2a3d;
	}

	.video-card:hover .play-overlay {
		opacity: 1;
	}

	.video-thumbnail {
		position: relative;
		width: 80px;
		height: 45px;
		background: #0f0f0f;
		border-radius: 4px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.video-thumbnail-bg {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 50%, #1a1a1a 100%);
	}

	.youtube-logo {
		width: 28px;
		height: 20px;
		color: #cc0000;
		opacity: 0.5;
		transition: opacity 0.15s ease;
	}

	.video-card:hover .youtube-logo {
		opacity: 0.3;
	}

	.play-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.4);
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.play-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 20px;
		background: #cc0000;
		border-radius: 4px;
		color: white;
		transition: background 0.15s ease;
	}

	.play-button svg {
		width: 10px;
		height: 10px;
		margin-left: 1px;
	}

	.video-card:hover .play-button {
		background: #ff0000;
	}

	.video-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.video-round {
		font-size: 0.6rem;
		font-weight: 600;
		color: #ef4444;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		line-height: 1;
	}

	.video-match-title {
		font-size: 0.75rem;
		font-weight: 500;
		color: #e1e8ed;
		line-height: 1.25;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		max-width: 200px;
	}

	.video-score {
		font-size: 0.65rem;
		font-weight: 500;
		color: #6b7a94;
	}

	.podium-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: #2d3748;
		border-radius: 8px;
		overflow: hidden;
	}

	.podium-list.inline {
		flex-direction: row;
		flex-wrap: wrap;
		gap: 1px;
		background: transparent;
		border-radius: 0;
	}

	.podium-list.inline .podium-entry {
		flex: 1;
		min-width: 120px;
		border-radius: 6px;
	}

	.podium-entry {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		background: #1a2332;
	}

	.podium-rank {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: 700;
		color: #6b7a94;
		background: #0f1419;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.podium-name {
		font-size: 0.8rem;
		color: #c9d1d9;
		font-weight: 500;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Position-specific styling */
	.podium-entry[data-position="1"] .podium-rank {
		background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
		color: #1a1a1a;
	}

	.podium-entry[data-position="1"] .podium-name {
		color: #fbbf24;
		font-weight: 600;
	}

	.podium-entry[data-position="2"] .podium-rank {
		background: linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%);
		color: #1a1a1a;
	}

	.podium-entry[data-position="3"] .podium-rank {
		background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
		color: white;
	}

	/* Multi-bracket podium grid */
	.podium-grid {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.podium-grid.multi {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
	}

	.podium-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.podium-group-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: #667eea;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding-left: 0.25rem;
	}

	.podium-group.gold .podium-group-label {
		color: #f59e0b;
	}

	.podium-group.silver .podium-group-label {
		color: #9ca3af;
	}

	.podium-group .podium-list {
		border-radius: 6px;
	}

	.podium-group .podium-entry {
		padding: 0.4rem 0.625rem;
	}

	.podium-group .podium-rank {
		width: 18px;
		height: 18px;
		font-size: 0.65rem;
	}

	.podium-group .podium-name {
		font-size: 0.75rem;
	}

	/* Phase Navigation */
	.phase-nav {
		display: flex;
		margin-bottom: 1.5rem;
		background: transparent;
		border-bottom: 1px solid #2d3748;
		gap: 0;
	}

	.phase-tab {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: transparent;
		border: none;
		color: #6b7a94;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: color 0.2s ease;
	}

	.phase-tab .tab-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem 1.25rem;
	}

	.phase-tab .tab-indicator {
		position: absolute;
		bottom: -1px;
		left: 50%;
		transform: translateX(-50%) scaleX(0);
		width: 100%;
		max-width: 80px;
		height: 2px;
		background: #667eea;
		border-radius: 2px 2px 0 0;
		transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.phase-tab svg {
		width: 18px;
		height: 18px;
		stroke: currentColor;
		opacity: 0.7;
		transition: opacity 0.2s ease;
	}

	.phase-tab .tab-label {
		letter-spacing: -0.01em;
	}

	.phase-tab:hover {
		color: #a5b4c8;
	}

	.phase-tab:hover svg {
		opacity: 0.9;
	}

	.phase-tab.active {
		color: #e1e8ed;
		font-weight: 600;
	}

	.phase-tab.active svg {
		opacity: 1;
		stroke: #667eea;
	}

	.phase-tab.active .tab-indicator {
		transform: translateX(-50%) scaleX(1);
	}

	/* Stage Sections */
	.stage-section {
		margin-bottom: 2rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1rem;
		font-weight: 700;
		color: #e1e8ed;
		margin: 0 0 1rem 0;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid #2d3748;
	}

	.section-title svg {
		width: 20px;
		height: 20px;
		stroke: #667eea;
	}

	/* Groups */
	.groups-container {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}

	.group-card {
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 10px;
		overflow: hidden;
	}

	.group-name {
		font-size: 0.85rem;
		font-weight: 700;
		color: #e1e8ed;
		margin: 0;
		padding: 0.75rem 1rem;
		background: #0f1419;
		border-bottom: 1px solid #2d3748;
	}

	.standings-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.standings-table th,
	.standings-table td {
		padding: 0.5rem 0.6rem;
		text-align: left;
	}

	.standings-table th {
		color: #6b7a94;
		font-weight: 600;
		font-size: 0.7rem;
		text-transform: uppercase;
		border-bottom: 1px solid #2d3748;
	}

	.standings-table td {
		color: #e1e8ed;
		border-bottom: 1px solid rgba(45, 55, 72, 0.5);
	}

	.standings-table tr:last-child td {
		border-bottom: none;
	}

	/* Zebra striping */
	.standings-table tbody tr:nth-child(odd) td {
		background: rgba(255, 255, 255, 0.02);
	}

	.standings-table tbody tr:nth-child(even) td {
		background: transparent;
	}

	/* Qualified to gold bracket - subtle left border */
	.standings-table tr.qualified td:first-child {
		border-left: 2px solid #10b981;
		padding-left: calc(0.6rem - 2px);
	}

	.pos-col { width: 32px; text-align: center; }
	.name-col { flex: 1; }
	.stat-col { width: 36px; text-align: center; }

	/* Division Tabs (Gold/Silver) */
	.division-tabs {
		display: flex;
		gap: 0;
		margin-bottom: 0;
	}

	.division-tab {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: none;
		color: #6b7a94;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: color 0.2s ease;
	}

	.division-tab::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%) scaleX(0);
		width: 60%;
		height: 2px;
		border-radius: 1px;
		transition: transform 0.2s ease;
	}

	.division-tab:hover {
		color: #a5b4c8;
	}

	.division-tab.active {
		color: #e1e8ed;
		font-weight: 600;
	}

	.division-tab.active::after {
		transform: translateX(-50%) scaleX(1);
	}

	.tab-icon {
		font-size: 0.5rem;
		line-height: 1;
	}

	.tab-icon.gold { color: #f59e0b; }
	.tab-icon.silver { color: #9ca3af; }

	.division-tab.active .tab-icon.gold { color: #fbbf24; }
	.division-tab.active .tab-icon.silver { color: #d1d5db; }

	/* Gold tab underline */
	.division-tab:has(.tab-icon.gold)::after {
		background: linear-gradient(90deg, #fbbf24, #f59e0b);
	}

	/* Silver tab underline */
	.division-tab:has(.tab-icon.silver)::after {
		background: linear-gradient(90deg, #d1d5db, #9ca3af);
	}

	/* Parallel brackets tabs */
	.division-tabs.parallel {
		flex-wrap: wrap;
	}

	.division-tabs.parallel .division-tab::after {
		background: #667eea;
	}

	.division-tabs .tab-label {
		font-weight: 700;
		color: #667eea;
		font-size: 0.8rem;
	}

	.division-tab.active .tab-label {
		color: #818cf8;
	}

	/* Bracket Panel */
	.bracket-panel {
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 12px;
		overflow: hidden;
	}

	.panel-header {
		padding: 0;
		border-bottom: 1px solid #2d3748;
		background: transparent;
	}

	.bracket-panel .bracket-wrapper {
		margin: 0;
		padding: 1rem;
	}

	/* Subtle accent based on active division */
	.bracket-panel.gold-active {
		border-color: rgba(245, 158, 11, 0.25);
	}

	.bracket-panel.gold-active .panel-header {
		border-bottom-color: rgba(245, 158, 11, 0.2);
	}

	.bracket-panel.silver-active {
		border-color: rgba(156, 163, 175, 0.25);
	}

	.bracket-panel.silver-active .panel-header {
		border-bottom-color: rgba(156, 163, 175, 0.2);
	}

	/* When there's no panel header (single bracket) */
	.bracket-panel:not(:has(.panel-header)) {
		background: transparent;
		border: none;
	}

	.bracket-panel:not(:has(.panel-header)) .bracket-wrapper {
		padding: 0;
	}

	/* Bracket */
	.bracket-wrapper {
		overflow-x: auto;
		overflow-y: visible;
		padding: 1rem;
		-webkit-overflow-scrolling: touch;
	}


	.bracket-container {
		display: flex;
		gap: 5rem;
		min-width: max-content;
		padding-bottom: 1rem;
		align-items: stretch;
	}

	.bracket-round {
		display: flex;
		flex-direction: column;
		min-width: 200px;
	}

	.bracket-round.third-place {
		margin-left: 2rem;
		padding-left: 2rem;
		border-left: 2px dashed #2d3748;
	}

	/* Hide connectors in third place match */
	.bracket-round.third-place .bracket-match::before,
	.bracket-round.third-place .bracket-match::after {
		display: none;
	}

	.round-name {
		font-size: 0.8rem;
		font-weight: 700;
		color: #8b9bb3;
		margin: 0 0 0.75rem 0;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		text-align: center;
	}

	.matches-column {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		flex: 1;
		position: relative;
		min-height: 100%;
	}

	.bracket-match {
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 8px;
		transition: border-color 0.15s;
		position: relative;
	}

	/* Connector lines between rounds */
	/* Horizontal line going right from each match - half of gap (2.5rem of 5rem gap) */
	.bracket-match::after {
		content: '';
		position: absolute;
		left: 100%;
		top: 50%;
		width: 2.5rem;
		height: 2px;
		background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
		transform: translateY(-50%);
		z-index: 0;
	}

	/* Remove connector from final round */
	.bracket-round:last-child:not(.third-place) .bracket-match::after {
		display: none;
	}

	/* Vertical connector lines for pairs of matches */
	.bracket-match::before {
		content: '';
		position: absolute;
		left: calc(100% + 2.5rem);
		width: 2px;
		background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
		z-index: 0;
	}

	/* Top match in pair - vertical line goes down */
	.bracket-match:nth-child(odd)::before {
		top: 50%;
	}

	/* Bottom match in pair - vertical line goes up */
	.bracket-match:nth-child(even)::before {
		bottom: 50%;
	}

	/* Dynamic vertical line height based on round index - space-around distribution */
	.bracket-round[style*="--round-index: 0"] .bracket-match::before {
		height: calc(50% + 0.5rem);
	}
	.bracket-round[style*="--round-index: 1"] .bracket-match::before {
		height: calc(100% + 1rem);
	}
	.bracket-round[style*="--round-index: 2"] .bracket-match::before {
		height: calc(200% + 2rem);
	}
	.bracket-round[style*="--round-index: 3"] .bracket-match::before {
		height: calc(400% + 4rem);
	}
	.bracket-round[style*="--round-index: 4"] .bracket-match::before {
		height: calc(800% + 8rem);
	}

	/* Remove vertical connectors from final round */
	.bracket-round:last-child .bracket-match::before {
		display: none;
	}

	/* For single match rounds (like finals), hide the vertical line */
	.matches-column:has(> :only-child) .bracket-match::before {
		display: none;
	}

	/* Horizontal connector from the vertical line junction to next round - other half of gap */
	.pair-connector {
		position: absolute;
		width: 2.5rem;
		height: 2px;
		background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
		right: -5rem;
		z-index: 1;
		/* Position at midpoint between each pair of matches */
		top: calc((var(--pair-index) * 2 + 1) / var(--total-matches) * 100%);
		transform: translateY(-50%);
	}

	.bracket-match.completed {
		border-color: rgba(16, 185, 129, 0.3);
	}

	.match-participant {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0.75rem;
		background: #0f1419;
		transition: background 0.15s;
	}

	.match-participant:first-child {
		border-radius: 7px 7px 0 0;
	}

	.match-participant:last-child {
		border-radius: 0 0 7px 7px;
	}

	.match-participant.winner {
		background: rgba(16, 185, 129, 0.12);
	}

	.match-participant.tbd {
		opacity: 0.5;
	}

	.participant-name {
		font-size: 0.85rem;
		color: #e1e8ed;
		font-weight: 500;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.match-participant.winner .participant-name {
		color: #10b981;
		font-weight: 700;
	}

	.score {
		font-size: 0.85rem;
		font-weight: 700;
		color: #8b9bb3;
		min-width: 24px;
		text-align: right;
	}

	.match-participant.winner .score {
		color: #10b981;
	}

	.vs-divider {
		height: 1px;
		background: #2d3748;
	}

	/* Actions */
	.actions {
		margin-top: 2rem;
		text-align: center;
	}

	.back-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.back-button svg {
		width: 18px;
		height: 18px;
	}

	.back-button:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.detail-container {
			padding: 1rem;
		}

		.page-header {
			margin: -1rem -1rem 1rem -1rem;
			padding: 0.75rem 1rem;
		}

		.header-center h1 {
			font-size: 0.95rem;
		}

		.info-grid.compact {
			grid-template-columns: repeat(2, 1fr);
		}

		.groups-container {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 480px) {
		.info-grid.compact {
			grid-template-columns: 1fr 1fr;
			max-width: 100%;
		}

		.bracket-round {
			min-width: 160px;
		}

		.participant-name {
			font-size: 0.8rem;
		}

		.video-card {
			flex: 1;
			min-width: 220px;
		}

		.video-match-title {
			max-width: 160px;
		}
	}

	/* Light theme */
	.detail-container[data-theme='light'] {
		background: #f5f7fa;
	}

	.detail-container[data-theme='light'] .page-header {
		background: #ffffff;
		border-bottom-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .header-center h1 {
		color: #1a202c;
	}

	.detail-container[data-theme='light'] .loading-state p {
		color: #718096;
	}

	.detail-container[data-theme='light'] .spinner {
		border-color: #e2e8f0;
		border-top-color: #667eea;
	}

	.detail-container[data-theme='light'] .error-state h3 {
		color: #1a202c;
	}

	.detail-container[data-theme='light'] .winner-card {
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%);
		border-color: rgba(251, 191, 36, 0.25);
	}

	.detail-container[data-theme='light'] .winner-name {
		color: #1a202c;
	}

	.detail-container[data-theme='light'] .info-card {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .info-label {
		color: #718096;
	}

	.detail-container[data-theme='light'] .info-value {
		color: #1a202c;
	}

	.detail-container[data-theme='light'] .podium-title {
		color: #718096;
	}

	.detail-container[data-theme='light'] .podium-list {
		background: #e2e8f0;
	}

	.detail-container[data-theme='light'] .podium-entry {
		background: #ffffff;
	}

	.detail-container[data-theme='light'] .podium-rank {
		background: #f1f5f9;
		color: #64748b;
	}

	.detail-container[data-theme='light'] .podium-name {
		color: #334155;
	}

	.detail-container[data-theme='light'] .podium-entry[data-position="1"] .podium-name {
		color: #b45309;
	}

	.detail-container[data-theme='light'] .podium-group-label {
		color: #667eea;
	}

	.detail-container[data-theme='light'] .podium-group.gold .podium-group-label {
		color: #b45309;
	}

	.detail-container[data-theme='light'] .podium-group.silver .podium-group-label {
		color: #64748b;
	}

	.detail-container[data-theme='light'] .section-title {
		color: #1a202c;
		border-bottom-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .group-card {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .group-name {
		background: #f5f7fa;
		color: #1a202c;
		border-bottom-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .standings-table th {
		color: #718096;
		border-bottom-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .standings-table td {
		color: #1a202c;
		border-bottom-color: rgba(226, 232, 240, 0.6);
	}

	.detail-container[data-theme='light'] .standings-table tbody tr:nth-child(odd) td {
		background: rgba(0, 0, 0, 0.02);
	}

	.detail-container[data-theme='light'] .standings-table tbody tr:nth-child(even) td {
		background: transparent;
	}

	.detail-container[data-theme='light'] .phase-nav {
		border-bottom-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .phase-tab {
		color: #718096;
	}

	.detail-container[data-theme='light'] .phase-tab:hover {
		color: #4a5568;
	}

	.detail-container[data-theme='light'] .phase-tab.active {
		color: #1a202c;
	}

	.detail-container[data-theme='light'] .phase-tab .tab-indicator {
		background: #667eea;
	}

	.detail-container[data-theme='light'] .division-tab {
		color: #718096;
	}

	.detail-container[data-theme='light'] .division-tab:hover {
		color: #4a5568;
	}

	.detail-container[data-theme='light'] .division-tab.active {
		color: #1a202c;
	}

	.detail-container[data-theme='light'] .division-tab .tab-icon.gold {
		color: #d97706;
	}

	.detail-container[data-theme='light'] .division-tab .tab-icon.silver {
		color: #6b7280;
	}

	.detail-container[data-theme='light'] .bracket-panel {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .panel-header {
		border-bottom-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .bracket-panel.gold-active {
		border-color: rgba(217, 119, 6, 0.3);
	}

	.detail-container[data-theme='light'] .bracket-panel.gold-active .panel-header {
		border-bottom-color: rgba(217, 119, 6, 0.15);
	}

	.detail-container[data-theme='light'] .bracket-panel.silver-active {
		border-color: rgba(107, 114, 128, 0.25);
	}

	.detail-container[data-theme='light'] .bracket-panel.silver-active .panel-header {
		border-bottom-color: rgba(107, 114, 128, 0.15);
	}

	.detail-container[data-theme='light'] .bracket-round.third-place {
		border-left-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .round-name {
		color: #4a5568;
	}

	.detail-container[data-theme='light'] .bracket-match {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .match-participant {
		background: #f5f7fa;
	}

	.detail-container[data-theme='light'] .match-participant.winner {
		background: rgba(16, 185, 129, 0.08);
	}

	.detail-container[data-theme='light'] .participant-name {
		color: #1a202c;
	}

	.detail-container[data-theme='light'] .score {
		color: #4a5568;
	}

	.detail-container[data-theme='light'] .vs-divider {
		background: #e2e8f0;
	}

	/* Light theme connector lines - same gradient, works on both themes */
	.detail-container[data-theme='light'] .bracket-match::after,
	.detail-container[data-theme='light'] .bracket-match::before,
	.detail-container[data-theme='light'] .pair-connector {
		background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
	}

	/* Light theme videos section */
	.detail-container[data-theme='light'] .videos-section {
		border-top-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .videos-title {
		color: #1a202c;
	}

	.detail-container[data-theme='light'] .video-card {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container[data-theme='light'] .video-card:hover {
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
	}

	.detail-container[data-theme='light'] .video-match-title {
		color: #1a202c;
	}

	.detail-container[data-theme='light'] .video-score {
		color: #718096;
	}

	/* Video Badge */
	.video-badge {
		position: absolute;
		top: 50%;
		right: -28px;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
		border: none;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		z-index: 5;
	}

	.video-badge svg {
		width: 10px;
		height: 10px;
	}

	.video-badge:hover {
		transform: translateY(-50%) scale(1.15);
		box-shadow: 0 3px 8px rgba(239, 68, 68, 0.4);
	}

	.bracket-match.has-video {
		position: relative;
	}

	/* Video Modal */
	.video-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.video-modal {
		background: #1a2332;
		border-radius: 12px;
		width: min(90vw, 900px);
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #2d3748;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.video-modal-close {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: rgba(0, 0, 0, 0.5);
		border: none;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		transition: background 0.15s ease;
		z-index: 10;
	}

	.video-modal-close:hover {
		background: rgba(0, 0, 0, 0.7);
	}

	.video-modal-content {
		position: relative;
		width: 100%;
		padding-top: 56.25%; /* 16:9 aspect ratio */
		background: #000;
	}

	.video-modal-content iframe {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border: none;
	}

	.video-modal-info {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		background: #0f1419;
		border-top: 1px solid #2d3748;
	}

	.video-modal-teams {
		font-size: 0.875rem;
		font-weight: 500;
		color: #e1e8ed;
	}

	.video-modal-score {
		font-size: 0.875rem;
		font-weight: 600;
		color: #667eea;
	}

	@media (max-width: 768px) {
		.video-badge {
			width: 28px;
			height: 28px;
			bottom: -14px;
			right: 50%;
			transform: translateX(50%);
		}

		.bracket-match.has-video {
			margin-bottom: 18px;
		}

		.video-modal {
			width: 100%;
			max-width: none;
			border-radius: 0;
			max-height: 100vh;
		}

		.video-modal-info {
			flex-direction: column;
			gap: 0.25rem;
			text-align: center;
		}
	}

	/* Portrait fullscreen video modal */
	@media (orientation: portrait) {
		.video-modal-overlay {
			padding: 0;
		}

		.video-modal {
			width: 100%;
			height: 100%;
			max-height: 100%;
			border-radius: 0;
			border: none;
			display: flex;
			flex-direction: column;
		}

		.video-modal-content {
			flex: 1;
			padding-top: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			background: #000;
		}

		.video-modal-content iframe {
			position: relative;
			width: 100%;
			height: auto;
			aspect-ratio: 16 / 9;
			max-height: 100%;
		}

		.video-modal-close {
			top: max(12px, env(safe-area-inset-top, 12px));
			right: 12px;
			background: rgba(0, 0, 0, 0.7);
		}

		.video-modal-info {
			flex-shrink: 0;
			padding: 1rem;
			padding-bottom: max(1rem, env(safe-area-inset-bottom, 1rem));
		}
	}
</style>
