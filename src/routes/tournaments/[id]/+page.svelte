<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { getTournament, subscribeTournament, getTournamentByKey } from '$lib/firebase/tournaments';
	import ScorekinoleLogo from '$lib/components/ScorekinoleLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	import { theme } from '$lib/stores/theme';
	import type { Tournament, BracketMatch, GroupMatch } from '$lib/types/tournament';
	import { isBye } from '$lib/algorithms/bracket';
	import { translateCountry } from '$lib/utils/countryTranslations';
	import LiveTournamentView from '$lib/components/tournament/LiveTournamentView.svelte';
	import LiveBadge from '$lib/components/LiveBadge.svelte';
	import { currentUser } from '$lib/firebase/auth';
	import { isSuperAdmin } from '$lib/firebase/admin';
	import { getYouTubeEmbedUrl } from '$lib/utils/youtube';
	import { translateText } from '$lib/utils/translate';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { calculateRankingPoints } from '$lib/algorithms/ranking';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { Check, ChevronsUpDown, Share2 } from '@lucide/svelte';
	import { PRODUCTION_URL } from '$lib/constants';

	let tournament = $state<Tournament | null>(null);
	let canEdit = $state(false);
	let loading = $state(true);
	let error = $state(false);
	let unsubscribe: (() => void) | null = null;

	// Video modal state
	let showVideoModal = $state(false);
	let videoMatch = $state<BracketMatch | null>(null);

	// Match detail modal state
	let showMatchDetail = $state(false);
	let selectedMatch = $state<BracketMatch | null>(null);

	// Translation state
	let translating = $state(false);
	let translatedDescription = $state<string | null>(null);
	let translationError = $state<string | null>(null);
	let showTranslation = $state(false);

	// Bracket view state (for SPLIT_DIVISIONS)
	let activeTab = $state<'gold' | 'silver'>('gold');

	// Phase tabs state
	let activePhase = $state<'groups' | 'bracket'>('groups');

	// Track which groups have matches expanded
	let expandedGroupMatches = $state<Set<string>>(new Set());

	// Player filter for single-group results
	let selectedPlayerFilter = $state<string | undefined>(undefined);
	let playerFilterOpen = $state(false);

	let urlParam = $derived(page.params.id);
	// Resolved Firestore document ID (after key lookup if needed)
	let resolvedDocId = $state<string | null>(null);
	// Share button state
	let shareCopied = $state(false);

	function isLikelyKey(param: string): boolean {
		return /^[A-Za-z0-9]{6}$/.test(param);
	}

	// Check if tournament is LIVE
	let isLive = $derived(
		tournament?.status === 'GROUP_STAGE' ||
		tournament?.status === 'TRANSITION' ||
		tournament?.status === 'FINAL_STAGE'
	);

	let isCompleted = $derived(tournament?.status === 'COMPLETED');

	// Check if tournament is upcoming (imported with future date)
	let isUpcoming = $derived(
		tournament?.isImported &&
		tournament.tournamentDate &&
		tournament.tournamentDate > Date.now()
	);

	// Check if tournament has any results (completed matches or standings with played matches)
	let hasResults = $derived((() => {
		if (!tournament) return false;
		// Check if any bracket match is completed
		const hasBracketResults = tournament.finalStage?.goldBracket?.rounds?.some(
			r => r.matches?.some(m => m.status === 'COMPLETED')
		);
		// Check if any group has standings with matches played
		const hasGroupResults = tournament.groupStage?.groups?.some(
			g => g.standings?.some(s => s.matchesPlayed > 0)
		);
		return hasBracketResults || hasGroupResults;
	})());

	// Debug logging for visibility conditions
	$effect(() => {
		if (tournament) {
			console.log('🔍 Tournament Debug:', {
				name: tournament.name,
				status: tournament.status,
				isImported: tournament.isImported,
				tournamentDate: tournament.tournamentDate,
				now: Date.now(),
				isFuture: tournament.tournamentDate ? tournament.tournamentDate > Date.now() : false,
				isUpcoming,
				isCompleted,
				hasResults,
				hasGroupStage,
				hasFinalStage,
				hasBothPhases,
				goldBracketRoundsLength: tournament.finalStage?.goldBracket?.rounds?.length ?? 0,
				groupsLength: tournament.groupStage?.groups?.length ?? 0,
				groupsHaveStandings: tournament.groupStage?.groups?.some(g => g.standings?.length > 0) ?? false,
				shouldShowUpcomingNotice: isUpcoming || (!isCompleted && !hasResults),
				shouldShowPhaseTabs: hasBothPhases && hasResults,
				shouldShowGroupStage: hasGroupStage && hasResults,
				shouldShowFinalStage: hasFinalStage && hasResults
			});
		}
	});

	// Final standings - uses finalPosition if available
	// Exclude disqualified participants (they don't have positions in final classification)
	let finalStandings = $derived(
		tournament?.participants
			.filter(p => p.finalPosition !== undefined && p.finalPosition > 0 && (p.status === 'ACTIVE' || !p.status))
			.toSorted((a, b) => (a.finalPosition || 99) - (b.finalPosition || 99)) || []
	);

	// Get ranking points earned based on final position and tier
	function getRankingPoints(position: number): number {
		if (!tournament?.rankingConfig?.enabled) return 0;
		const tier = tournament.rankingConfig.tier || 'CLUB';
		const totalParticipants = tournament.participants.filter(p => p.status === 'ACTIVE' || !p.status).length;
		return calculateRankingPoints(position, tier, totalParticipants, tournament.gameType);
	}

	// Check if both phases exist (with actual content)
	let hasGroupStage = $derived(
		tournament?.groupStage &&
		(tournament.groupStage.groups?.length ?? 0) > 0 &&
		tournament.groupStage.groups?.some(g => g.standings && g.standings.length > 0)
	);
	let hasFinalStage = $derived(
		tournament?.finalStage &&
		tournament.finalStage.goldBracket?.rounds?.length > 0 &&
		(tournament.status === 'FINAL_STAGE' || tournament.status === 'COMPLETED')
	);
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

	// Consolation brackets support
	let goldConsolationBrackets = $derived(goldBracket?.consolationBrackets || []);
	let silverConsolationBrackets = $derived(silverBracket?.consolationBrackets || []);

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

	// Qualification mode for group stage (WINS = victory points, POINTS = total crokinole points)
	let qualificationMode = $derived(tournament?.groupStage?.qualificationMode || 'WINS');

	// Single group detection for 2-column layout
	let isSingleGroup = $derived((tournament?.groupStage?.groups?.length ?? 0) === 1);

	// Check if translation button should be shown (always show if there's a description)
	let canTranslate = $derived(!!tournament?.description);

	// Translate description function
	async function handleTranslate() {
		if (!tournament?.description) return;

		translating = true;
		translationError = null;

		// Use auto-detection - MyMemory API supports 'autodetect' as source language
		const result = await translateText(
			tournament.description,
			'autodetect',
			getLocale()
		);

		if (result.success && result.translatedText) {
			translatedDescription = result.translatedText;
			showTranslation = true;
		} else {
			translationError = result.error || 'Error al traducir';
		}

		translating = false;
	}

	onMount(async () => {
		await loadTournament();

		// Subscribe to real-time updates using the resolved Firestore doc ID
		if (resolvedDocId) {
			unsubscribe = subscribeTournament(resolvedDocId, (updated) => {
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
			if (!urlParam) {
				error = true;
				loading = false;
				return;
			}

			// Detect if URL param is a 6-char key or a full Firestore doc ID
			if (isLikelyKey(urlParam)) {
				tournament = await getTournamentByKey(urlParam);
			} else {
				// Backward compatibility: full Firestore doc ID
				tournament = await getTournament(urlParam);
			}

			if (!tournament) {
				error = true;
			} else {
				resolvedDocId = tournament.id;
				// Check if user can edit (owner, collaborator, or superadmin)
				const user = $currentUser;
				if (user) {
					const ownerId = tournament.ownerId || tournament.createdBy?.userId;
					const isOwner = ownerId === user.id;
					const isCollaborator = tournament.adminIds?.includes(user.id) || false;
					const superAdmin = await isSuperAdmin();
					canEdit = isOwner || isCollaborator || superAdmin;
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

	async function shareTournament() {
		if (!tournament) return;
		const shareUrl = `${PRODUCTION_URL}/tournaments/${tournament.key}`;
		const shareTitle = tournament.name;

		if (navigator.share) {
			try {
				await navigator.share({ title: shareTitle, url: shareUrl });
			} catch {
				// User cancelled share dialog - ignore
			}
		} else {
			try {
				await navigator.clipboard.writeText(shareUrl);
				shareCopied = true;
				setTimeout(() => { shareCopied = false; }, 2000);
			} catch {
				// Fallback: do nothing
			}
		}
	}

	function getParticipantName(participantId: string | undefined): string {
		if (!participantId) return m.common_tbd();
		if (isBye(participantId)) return 'BYE';
		// Check for unknown-BYE (from imported tournaments with BYE matches)
		if (participantId.toUpperCase().includes('BYE')) return 'BYE';
		if (!tournament) return m.common_unknown();
		const participant = tournament.participants.find(p => p.id === participantId);
		if (!participant) return m.common_unknown();

		// For doubles: show teamName if exists, otherwise "Player1 / Player2"
		if (participant.partner) {
			return participant.teamName || `${participant.name} / ${participant.partner.name}`;
		}
		return participant.name;
	}

	// Get full participant object
	function getParticipant(participantId: string | undefined) {
		if (!participantId || isBye(participantId) || !tournament) return null;
		return tournament.participants.find(p => p.id === participantId) || null;
	}

	// Get participant ranking snapshot (seeding points)
	function getParticipantRanking(participantId: string | undefined): number {
		const participant = getParticipant(participantId);
		return participant?.rankingSnapshot || 0;
	}

	// Check if this is a doubles tournament
	let isDoubles = $derived(tournament?.gameType === 'doubles');

	// Get initials from a player name (e.g. "Juan Antonio García" → "JG", "María" → "M")
	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/);
		if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
		return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
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

	function formatDate(timestamp: number | undefined, time?: string): string {
		if (!timestamp) return '';
		const dateStr = new Date(timestamp).toLocaleDateString('es-ES', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
		if (time) {
			return `${dateStr}, ${time}`;
		}
		return dateStr;
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
			// Singular forms (legacy)
			'final': m.tournament_final(),
			'semifinal': m.tournament_semifinal(),
			'quarterfinal': m.import_quarterfinals(),
			'round of 16': m.import_round16(),
			'round of 32': m.tournament_round() + ' 32',
			'third place': m.tournament_thirdPlace(),
			// Plural forms (from getRoundName in bracket.ts)
			'finals': m.tournament_final(),
			'semifinals': m.tournament_semifinal(),
			'quarterfinals': m.import_quarterfinals(),
			'round16': m.import_round16(),
			'round32': m.tournament_round() + ' 32',
			'round64': m.tournament_round() + ' 64',
		};
		return roundTranslations[key] || name.charAt(0).toUpperCase() + name.slice(1);
	}

	function isByeMatch(match: BracketMatch): boolean {
		return isBye(match.participantA) || isBye(match.participantB);
	}

	function toggleGroupMatches(groupId: string) {
		const newSet = new Set(expandedGroupMatches);
		if (newSet.has(groupId)) {
			newSet.delete(groupId);
		} else {
			newSet.add(groupId);
		}
		expandedGroupMatches = newSet;
	}

	function getGroupRounds(group: any): any[] {
		// Get rounds with their matches
		if (group.schedule) {
			return group.schedule;
		} else if (group.pairings) {
			return group.pairings;
		}
		return [];
	}
</script>

<!-- Snippet for participant avatar (handles both singles and doubles) -->
{#snippet participantAvatar(participantId: string | undefined, size: 'sm' | 'md' | 'lg' = 'md')}
	{@const participant = getParticipant(participantId)}
	{@const sizeClass = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : 'avatar-md'}
	{#if participant}
		{#if isDoubles && participant.partner}
			<!-- Doubles: always show both slots (photo or initials fallback) -->
			<div class="pair-avatars {sizeClass}">
				{#if participant.photoURL}
					<img src={participant.photoURL} alt={participant.name} class="avatar-img first" referrerpolicy="no-referrer" />
				{:else}
					<div class="avatar-img avatar-placeholder first">{getInitials(participant.name)}</div>
				{/if}
				{#if participant.partner.photoURL}
					<img src={participant.partner.photoURL} alt={participant.partner.name} class="avatar-img second" referrerpolicy="no-referrer" />
				{:else}
					<div class="avatar-img avatar-placeholder second partner-placeholder">{getInitials(participant.partner.name)}</div>
				{/if}
			</div>
		{:else}
			<!-- Singles: always show (photo or initials fallback) -->
			<div class="single-avatar {sizeClass}">
				{#if participant.photoURL}
					<img src={participant.photoURL} alt={participant.name} class="avatar-img" referrerpolicy="no-referrer" />
				{:else}
					<div class="avatar-img avatar-placeholder">{getInitials(participant.name)}</div>
				{/if}
			</div>
		{/if}
	{/if}
{/snippet}

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
					<h1>{#if tournament.edition}<span class="edition">{m.common_editionLabel({ n: String(tournament.edition) })} · </span> {/if} {tournament.name}</h1>
				{:else}
					<h1>{m.common_loading()}...</h1>
				{/if}
			</div>
			<div class="header-right">
				{#if tournament}
					<button
						class="share-btn"
						title={m.tournament_shareTournament()}
						onclick={shareTournament}
					>
						{#if shareCopied}
							<Check size={18} />
						{:else}
							<Share2 size={18} />
						{/if}
					</button>
				{/if}

				{#if canEdit}
					<a href="/admin/tournaments/{resolvedDocId}" class="admin-link" title="Administrar torneo">
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
		{#if tournament.posterUrl}
			<div class="hero-banner">
				<img src={tournament.posterUrl} alt={tournament.name} class="hero-image" loading="lazy" />
				<div class="hero-overlay"></div>
				{#if isLive}
					<div class="hero-live-badge">
						<LiveBadge size="large" />
					</div>
				{/if}
				<div class="hero-content">
					<div class="hero-badge">
						{#if tournament.edition}
							<span class="edition">#{tournament.edition}</span>
						{/if}
						{#if tournament.rankingConfig?.tier}
							<span class="tier tier-{tournament.rankingConfig.tier}">{getTierLabel(tournament.rankingConfig.tier)}</span>
						{/if}
					</div>
					<h2 class="hero-title">{tournament.name}</h2>
					{#if tournament.tournamentDate}
						<div class="hero-date">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
								<line x1="16" y1="2" x2="16" y2="6"/>
								<line x1="8" y1="2" x2="8" y2="6"/>
								<line x1="3" y1="10" x2="21" y2="10"/>
							</svg>
							<span>{formatDate(tournament.tournamentDate, tournament.tournamentTime)}</span>
						</div>
					{/if}
					{#if tournament.city}
						<div class="hero-location">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
								<circle cx="12" cy="10" r="3"/>
							</svg>
							<span>{tournament.city}{tournament.country ? `, ${translateCountry(tournament.country)}` : ''}</span>
						</div>
					{/if}
				</div>
				{#if tournament.externalLink}
					<a href={tournament.externalLink} target="_blank" rel="noopener noreferrer" class="hero-link" onclick={(e) => e.stopPropagation()}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
							<polyline points="15 3 21 3 21 9"/>
							<line x1="10" y1="14" x2="21" y2="3"/>
						</svg>
						<span>{m.common_moreInfo()}</span>
					</a>
				{/if}
			</div>
		{/if}

		{#if isLive}
			<!-- LIVE Tournament View -->
			<LiveTournamentView {tournament} />
		{:else}
			<!-- Completed Tournament View -->
			<div class="info-section">
				<!-- Completed/Draft: Full details -->
				<div class="info-grid">
					{#if tournament.tournamentDate}
						{@const eventDate = new Date(tournament.tournamentDate)}
						{@const datePart = eventDate.toISOString().split('T')[0].replace(/-/g, '')}
						{@const hasTime = !!tournament.tournamentTime}
						{@const isFinished = tournament.status === 'COMPLETED'}
						{@const startedDate = tournament.startedAt ? new Date(tournament.startedAt) : null}
						{@const realStartTime = isFinished && !tournament.isImported && startedDate ? `${String(startedDate.getHours()).padStart(2, '0')}:${String(startedDate.getMinutes()).padStart(2, '0')}` : null}
						{@const displayStartTime = tournament.tournamentTime || realStartTime}
						{@const completedDate = tournament.completedAt ? new Date(tournament.completedAt) : null}
						{@const realEndTime = isFinished && !tournament.isImported && completedDate ? `${String(completedDate.getHours()).padStart(2, '0')}:${String(completedDate.getMinutes()).padStart(2, '0')}` : null}
						{@const hasDisplayTime = !!(displayStartTime || hasTime)}
						{@const timePart = hasDisplayTime && displayStartTime ? displayStartTime.replace(':', '') + '00' : (hasTime && tournament.tournamentTime ? tournament.tournamentTime.replace(':', '') + '00' : '')}
						{@const dateStr = hasDisplayTime ? `${datePart}T${timePart}` : datePart}
						{@const durationMinutes = (tournament.timeEstimate?.totalMinutes || 480) + 30}
						{@const startHour = hasDisplayTime && displayStartTime ? parseInt(displayStartTime.split(':')[0]) : 0}
						{@const startMin = hasDisplayTime && displayStartTime ? parseInt(displayStartTime.split(':')[1]) : 0}
						{@const endTotalMin = startHour * 60 + startMin + durationMinutes}
						{@const estEndH = String(Math.min(23, Math.floor(endTotalMin / 60))).padStart(2, '0')}
						{@const estEndM = String(endTotalMin % 60).padStart(2, '0')}
						{@const endTime = realEndTime || `${estEndH}:${estEndM}`}
						{@const endH = realEndTime ? String(completedDate!.getHours()).padStart(2, '0') : estEndH}
						{@const endM = realEndTime ? String(completedDate!.getMinutes()).padStart(2, '0') : estEndM}
						{@const endDateStr = hasDisplayTime ? `${datePart}T${endH}${endM}00` : new Date(eventDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, '')}
						{#if isFinished}
							<div class="info-card calendar-card calendar-static">
								<span class="info-label">
									<svg class="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
										<line x1="16" y1="2" x2="16" y2="6"/>
										<line x1="8" y1="2" x2="8" y2="6"/>
										<line x1="3" y1="10" x2="21" y2="10"/>
									</svg>
									{m.tournament_date()}
								</span>
								<span class="info-value calendar-value">
									<span>{formatDate(tournament.tournamentDate, displayStartTime || undefined)}{hasDisplayTime ? ` - ${endTime}` : ''}</span>
								</span>
							</div>
						{:else}
							{@const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(tournament.name)}&dates=${dateStr}/${endDateStr}${tournament.description ? `&details=${encodeURIComponent(tournament.description)}` : ''}${tournament.city ? `&location=${encodeURIComponent((tournament.address ? tournament.address + ', ' : '') + tournament.city + (tournament.country ? ', ' + tournament.country : ''))}` : ''}`}
							<a
								href={calendarUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="info-card calendar-card"
							>
								<span class="info-label">
									<svg class="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
										<line x1="16" y1="2" x2="16" y2="6"/>
										<line x1="8" y1="2" x2="8" y2="6"/>
										<line x1="3" y1="10" x2="21" y2="10"/>
									</svg>
									{m.tournament_date()}
								</span>
								<span class="info-value calendar-value">
									<span>{formatDate(tournament.tournamentDate, displayStartTime || undefined)}{hasDisplayTime ? ` - ${endTime}` : ''}</span>
									<svg class="external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
										<polyline points="15 3 21 3 21 9"/>
										<line x1="10" y1="14" x2="21" y2="3"/>
									</svg>
								</span>
							</a>
						{/if}
					{/if}
					{#if tournament.city || tournament.country}
						<a
							href="https://www.google.com/maps/search/?api=1&query={encodeURIComponent((tournament.address ? tournament.address + ', ' : '') + (tournament.city || '') + ', ' + (tournament.country || ''))}"
							target="_blank"
							rel="noopener noreferrer"
							class="info-card location-card"
						>
							<span class="info-label">
								<svg class="location-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
									<circle cx="12" cy="10" r="3"/>
								</svg>
								{m.tournament_location()}
							</span>
							<span class="info-value location-value">
								<span>{tournament.city}{tournament.city && tournament.country ? ', ' : ''}{translateCountry(tournament.country)}</span>
								<svg class="external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
									<polyline points="15 3 21 3 21 9"/>
									<line x1="10" y1="14" x2="21" y2="3"/>
								</svg>
							</span>
						</a>
					{/if}
					{#if tournament.participants.length > 0}
						<div class="info-card">
							<span class="info-label">{m.tournaments_participants()}</span>
							<span class="info-value">{tournament.participants.length}</span>
						</div>
					{/if}
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
					<div class="description-section">
						<div class="description-header">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10"/>
								<line x1="12" y1="16" x2="12" y2="12"/>
								<line x1="12" y1="8" x2="12.01" y2="8"/>
							</svg>
							<span>{m.wizard_information()}</span>
							{#if canTranslate}
								<button
									class="translate-btn"
									onclick={handleTranslate}
									disabled={translating}
									title={m.common_translate?.() ?? 'Traducir'}
								>
									{#if translating}
										<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
										</svg>
									{:else}
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
										</svg>
									{/if}
								</button>
							{/if}
						</div>
						{#if showTranslation && translatedDescription}
							<p class="tournament-description translated">{translatedDescription}</p>
							<button class="show-original-btn" onclick={() => showTranslation = false}>
								{m.common_showOriginal?.() ?? 'Ver original'}
							</button>
						{:else}
							<p class="tournament-description">{tournament.description}</p>
							{#if translatedDescription}
								<button class="show-translated-btn" onclick={() => showTranslation = true}>
									{m.common_showTranslation?.() ?? 'Ver traducción'}
								</button>
							{/if}
						{/if}
						{#if translationError}
							<p class="translation-error">{translationError}</p>
						{/if}
					</div>
				{/if}

				<!-- Final Standings (for completed tournaments) -->
				{#if isCompleted && !tournament.isImported && finalStandings.length > 0}
					<!-- LIVE tournaments: show all participants with ranking points -->
					{@const halfIndex = Math.ceil(finalStandings.length / 2)}
					{@const leftColumn = finalStandings.slice(0, halfIndex)}
					{@const rightColumn = finalStandings.slice(halfIndex)}
					<div class="podium-section full-standings">
						<div class="podium-header">
							<span class="podium-title">{m.tournament_finalStandings()}</span>
						</div>
						<div class="standings-grid">
							<div class="standings-column">
								{#each leftColumn as participant}
									{@const rankingPts = getRankingPoints(participant.finalPosition || 0)}
									{@const isMedal = participant.finalPosition && participant.finalPosition <= 3}
									<div class="standing-row" class:top-4={participant.finalPosition && participant.finalPosition <= 4}>
										<span class="pos" class:medal={isMedal}>
											{#if participant.finalPosition === 1}
												🥇
											{:else if participant.finalPosition === 2}
												🥈
											{:else if participant.finalPosition === 3}
												🥉
											{:else}
												{participant.finalPosition}º
											{/if}
										</span>
										<div class="participant-cell">
											<span class="name">{getParticipantName(participant.id)}</span>
											{@render participantAvatar(participant.id, 'sm')}
										</div>
										{#if tournament.rankingConfig?.enabled}
											<span class="pts" class:zero={rankingPts === 0}>
												{rankingPts > 0 ? `+${rankingPts}` : '0'}
											</span>
										{/if}
									</div>
								{/each}
							</div>
							<div class="standings-column">
								{#each rightColumn as participant}
									{@const rankingPts = getRankingPoints(participant.finalPosition || 0)}
									{@const isMedal = participant.finalPosition && participant.finalPosition <= 3}
									<div class="standing-row" class:top-4={participant.finalPosition && participant.finalPosition <= 4}>
										<span class="pos" class:medal={isMedal}>
											{#if participant.finalPosition === 1}
												🥇
											{:else if participant.finalPosition === 2}
												🥈
											{:else if participant.finalPosition === 3}
												🥉
											{:else}
												{participant.finalPosition}º
											{/if}
										</span>
										<div class="participant-cell">
											<span class="name">{getParticipantName(participant.id)}</span>
											{@render participantAvatar(participant.id, 'sm')}
										</div>
										{#if tournament.rankingConfig?.enabled}
											<span class="pts" class:zero={rankingPts === 0}>
												{rankingPts > 0 ? `+${rankingPts}` : '0'}
											</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>
				{:else if isCompleted && tournament.isImported && isParallelBrackets && parallelBrackets.length > 0}
					<!-- IMPORTED: parallel brackets - show top 4 from each -->
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
													<span class="podium-rank" class:medal={entry.position <= 3}>
														{#if entry.position === 1}🥇{:else if entry.position === 2}🥈{:else if entry.position === 3}🥉{:else}{entry.position}{/if}
													</span>
													{@render participantAvatar(entry.participantId, 'sm')}
													<span class="podium-name">{getParticipantName(entry.participantId)}</span>
												</li>
											{/each}
										</ol>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{:else if isCompleted && tournament.isImported && isSplitDivisions && goldBracket}
					<!-- IMPORTED: split divisions - show top 4 from gold/silver -->
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
													<span class="podium-rank" class:medal={entry.position <= 3}>
														{#if entry.position === 1}🥇{:else if entry.position === 2}🥈{:else if entry.position === 3}🥉{:else}{entry.position}{/if}
													</span>
													{@render participantAvatar(entry.participantId, 'sm')}
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
												{@const silverPosition = entry.position + 4}
												<li class="podium-entry" data-position={entry.position}>
													<span class="podium-rank">
														{silverPosition}º
													</span>
													{@render participantAvatar(entry.participantId, 'sm')}
													<span class="podium-name">{getParticipantName(entry.participantId)}</span>
												</li>
											{/each}
										</ol>
									</div>
								{/if}
							{/if}
						</div>
					</div>
				{:else if isCompleted && tournament.isImported && goldBracket}
					<!-- IMPORTED: single bracket - show top 4 -->
					{@const top4 = getBracketTop4({ bracket: goldBracket })}
					{#if top4.length > 0}
						<div class="podium-section">
							<div class="podium-header">
								<span class="podium-title">{m.tournament_finalStandings()}</span>
							</div>
							<ol class="podium-list inline">
								{#each top4 as entry}
									<li class="podium-entry" data-position={entry.position}>
										<span class="podium-rank" class:medal={entry.position <= 3}>
											{#if entry.position === 1}🥇{:else if entry.position === 2}🥈{:else if entry.position === 3}🥉{:else}{entry.position}º{/if}
										</span>
										{@render participantAvatar(entry.participantId, 'md')}
										<span class="podium-name">{getParticipantName(entry.participantId)}</span>
									</li>
								{/each}
							</ol>
						</div>
					{/if}
				{:else if isCompleted && tournament.finalStage?.winner}
					<!-- Fallback: just show winner if no finalPositions -->
					<div class="podium-section">
						<div class="podium-header">
							<span class="podium-title">{m.tournament_winner()}</span>
						</div>
						<ol class="podium-list inline">
							<li class="podium-entry" data-position="1">
								<span class="podium-rank">1</span>
								{@render participantAvatar(tournament.finalStage.winner, 'md')}
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
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Phase Tabs (when both phases exist and have results) -->
		{#if hasBothPhases && hasResults}
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
		{#if hasGroupStage && hasResults && (!hasBothPhases || activePhase === 'groups')}
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
				<div class="groups-container" class:single-group={isSingleGroup}>
					{#each tournament.groupStage?.groups ?? [] as group, groupIndex}
						{@const groupRounds = getGroupRounds(group)}
						{#if isSingleGroup && groupRounds.length > 0}
							<!-- Single group: 2-column layout -->
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
								<div class="group-card">
									<h3 class="group-name">{m.ranking_standings?.() ?? 'Clasificación'}</h3>
									<div class="standings-table-wrapper">
										<table class="standings-table">
											<thead>
												<tr>
													<th class="pos-col">#</th>
													<th class="name-col">{m.common_player()}</th>
													{#if hasMatchDetails}
														<th class="stat-col" title="Victorias">V</th>
														<th class="stat-col" title="Empates">E</th>
														<th class="stat-col" title="Derrotas">P</th>
													{/if}
													<th class="stat-col" class:primary-col={qualificationMode === 'POINTS'} title="Puntos totales de crokinole">PT</th>
													<th class="stat-col" class:primary-col={qualificationMode === 'WINS'} title="Puntos por victoria">PV</th>
													<th class="stat-col" title="20s totales">20s</th>
												</tr>
											</thead>
											<tbody>
												{#each group.standings.toSorted((a, b) => a.position - b.position) as standing}
													<tr class:qualified={goldQualifiedIds.has(standing.participantId)}>
														<td class="pos-col">{standing.position}</td>
														<td class="name-col">
															<div class="name-cell">
																{@render participantAvatar(standing.participantId, 'sm')}
																<span class="name-text">{getParticipantName(standing.participantId)}</span>
																{#if getParticipantRanking(standing.participantId) > 0}
																	<span class="ranking-pts">{getParticipantRanking(standing.participantId)}</span>
																{/if}
															</div>
														</td>
														{#if hasMatchDetails}
															<td class="stat-col">{standing.matchesWon ?? 0}</td>
															<td class="stat-col">{standing.matchesTied ?? 0}</td>
															<td class="stat-col">{standing.matchesLost ?? 0}</td>
														{/if}
														<td class="stat-col" class:primary-col={qualificationMode === 'POINTS'}>{standing.totalPointsScored || standing.points || 0}</td>
														<td class="stat-col" class:primary-col={qualificationMode === 'WINS'}>{standing.points}</td>
														<td class="stat-col">{standing.total20s ?? 0}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
									<div class="standings-legend">
										<span class="legend-item"><strong>PT</strong> Puntos totales</span>
										<span class="legend-item"><strong>PV</strong> Puntos por victoria (2/1/0)</span>
									</div>
								</div>
								<div class="group-card flex flex-col">
									<div class="group-name flex items-center justify-between gap-2">
										<span class="text-sm font-bold m-0">{m.tournament_results?.() ?? 'Resultados'}</span>
										<Popover.Root bind:open={playerFilterOpen}>
											<Popover.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														variant="outline"
														size="sm"
														class="h-7 w-40 justify-between text-xs filter-button"
													>
														<span class="truncate">
															{selectedPlayerFilter ? getParticipantName(selectedPlayerFilter) : m.admin_allPlayers()}
														</span>
														<ChevronsUpDown class="ml-1 size-3 shrink-0 opacity-50" />
													</Button>
												{/snippet}
											</Popover.Trigger>
											<Popover.Content class="w-52 p-0" align="end">
												<Command.Root>
													<Command.Input placeholder={m.common_search?.() ?? 'Buscar...'} class="h-8 text-xs" />
													<Command.List class="max-h-60">
														<Command.Empty>{m.common_noResults?.() ?? 'Sin resultados'}</Command.Empty>
														<Command.Group>
															<Command.Item
																value="all"
																onSelect={() => {
																	selectedPlayerFilter = undefined;
																	playerFilterOpen = false;
																}}
															>
																<Check class={['mr-2 size-3', !selectedPlayerFilter ? 'opacity-100' : 'opacity-0']} />
																{m.admin_allPlayers()}
															</Command.Item>
															{#each (tournament?.participants ?? []).toSorted((a, b) => (a.name ?? '').localeCompare(b.name ?? '')) as participant}
																<Command.Item
																	value={participant.name ?? participant.id}
																	onSelect={() => {
																		selectedPlayerFilter = participant.id;
																		playerFilterOpen = false;
																	}}
																>
																	<Check class={['mr-2 size-3', selectedPlayerFilter === participant.id ? 'opacity-100' : 'opacity-0']} />
																	{getParticipantName(participant.id)}
																</Command.Item>
															{/each}
														</Command.Group>
													</Command.List>
												</Command.Root>
											</Popover.Content>
										</Popover.Root>
									</div>
									<div class="p-3 flex-1 overflow-y-auto">
										{#each selectedPlayerFilter
											? groupRounds.map(r => ({
												...r,
												matches: r.matches.filter((m: GroupMatch) =>
													m.participantA === selectedPlayerFilter ||
													m.participantB === selectedPlayerFilter
												)
											})).filter(r => r.matches.length > 0)
											: groupRounds as round}
											<div class="round-section [&:not(:last-child)]:mb-3">
												<h4 class="round-title">{m.tournament_round()} {round.roundNumber}</h4>
												<div class="matches-list flex flex-col gap-1.5">
													{#each round.matches as match}
														{#if match.participantB !== 'BYE'}
															<button
																class={['match-result-row max-w-full', match.status === 'COMPLETED' && 'completed', match.rounds?.length && 'has-detail']}
																onclick={() => { if (match.rounds?.length) { selectedMatch = match as unknown as BracketMatch; showMatchDetail = true; } }}
																disabled={!match.rounds?.length}
															>
																{#if match.tableNumber != null}
																	<span class="match-table">{m.tournament_tableShort()}{match.tableNumber}</span>
																{/if}
																<span class="match-player match-player-a" class:winner={match.winner === match.participantA}>
																	<span class="match-player-name">{getParticipantName(match.participantA)}</span>
																	{@render participantAvatar(match.participantA, 'sm')}
																</span>
																<span class="match-score">
																	{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																		{match.totalPointsA ?? match.gamesWonA ?? 0} - {match.totalPointsB ?? match.gamesWonB ?? 0}
																	{:else}
																		vs
																	{/if}
																</span>
																<span class="match-player match-player-b" class:winner={match.winner === match.participantB}>
																	{@render participantAvatar(match.participantB, 'sm')}
																	<span class="match-player-name">{getParticipantName(match.participantB)}</span>
																</span>
															</button>
														{/if}
													{/each}
												</div>
											</div>
										{/each}
									</div>
								</div>
							</div>
						{:else}
							<!-- Multiple groups: stacked layout with toggle -->
							<div class="group-card">
								<h3 class="group-name">{translateGroupName(group.name)}</h3>
								<div class="standings-table-wrapper">
									<table class="standings-table">
										<thead>
											<tr>
												<th class="pos-col">#</th>
												<th class="name-col">{m.common_player()}</th>
												{#if hasMatchDetails}
													<th class="stat-col" title="Victorias">V</th>
													<th class="stat-col" title="Empates">E</th>
													<th class="stat-col" title="Derrotas">P</th>
												{/if}
												<th class="stat-col" class:primary-col={qualificationMode === 'POINTS'} title="Puntos totales de crokinole">PT</th>
												<th class="stat-col" class:primary-col={qualificationMode === 'WINS'} title="Puntos por victoria">PV</th>
												<th class="stat-col" title="20s totales">20s</th>
											</tr>
										</thead>
										<tbody>
											{#each group.standings.toSorted((a, b) => a.position - b.position) as standing}
												<tr class:qualified={goldQualifiedIds.has(standing.participantId)}>
													<td class="pos-col">{standing.position}</td>
													<td class="name-col">
														<div class="name-cell">
															{@render participantAvatar(standing.participantId, 'sm')}
															<span class="name-text">{getParticipantName(standing.participantId)}</span>
															{#if getParticipantRanking(standing.participantId) > 0}
																<span class="ranking-pts">{getParticipantRanking(standing.participantId)}</span>
															{/if}
														</div>
													</td>
													{#if hasMatchDetails}
														<td class="stat-col">{standing.matchesWon ?? 0}</td>
														<td class="stat-col">{standing.matchesTied ?? 0}</td>
														<td class="stat-col">{standing.matchesLost ?? 0}</td>
													{/if}
													<td class="stat-col" class:primary-col={qualificationMode === 'POINTS'}>{standing.totalPointsScored || standing.points || 0}</td>
													<td class="stat-col" class:primary-col={qualificationMode === 'WINS'}>{standing.points}</td>
													<td class="stat-col">{standing.total20s ?? 0}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
								{#if groupIndex === 0}
									<div class="standings-legend">
										<span class="legend-item"><strong>PT</strong> Puntos totales</span>
										<span class="legend-item"><strong>PV</strong> Puntos por victoria (2/1/0)</span>
									</div>
								{/if}

								<!-- Match Results Toggle -->
								{#if groupRounds.length > 0}
									<button
										class="view-matches-btn"
										onclick={() => toggleGroupMatches(group.id)}
									>
										{#if expandedGroupMatches.has(group.id)}
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<polyline points="18 15 12 9 6 15"></polyline>
											</svg>
											{m.tournament_hideMatches?.() ?? 'Ocultar partidos'}
										{:else}
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<polyline points="6 9 12 15 18 9"></polyline>
											</svg>
											{m.tournament_showMatches?.() ?? 'Ver partidos'}
										{/if}
									</button>

									{#if expandedGroupMatches.has(group.id)}
										<div class="group-matches-section">
											{#each groupRounds as round}
												<div class="round-section">
													<h4 class="round-title">{m.tournament_round()} {round.roundNumber}</h4>
													<div class="matches-list">
														{#each round.matches as match}
															{#if match.participantB !== 'BYE'}
																<button
																	class={['match-result-row', match.status === 'COMPLETED' && 'completed', match.rounds?.length && 'has-detail']}
																	onclick={() => { if (match.rounds?.length) { selectedMatch = match as unknown as BracketMatch; showMatchDetail = true; } }}
																	disabled={!match.rounds?.length}
																>
																	{#if match.tableNumber}
																		<span class="match-table">{m.tournament_tableShort()}{match.tableNumber}</span>
																	{/if}
																	<span class="match-player match-player-a" class:winner={match.winner === match.participantA}>
																		<span class="match-player-name">{getParticipantName(match.participantA)}</span>
																		{@render participantAvatar(match.participantA, 'sm')}
																	</span>
																	<span class="match-score">
																		{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																			{match.totalPointsA ?? match.gamesWonA ?? 0} - {match.totalPointsB ?? match.gamesWonB ?? 0}
																		{:else}
																			vs
																		{/if}
																	</span>
																	<span class="match-player match-player-b" class:winner={match.winner === match.participantB}>
																		{@render participantAvatar(match.participantB, 'sm')}
																		<span class="match-player-name">{getParticipantName(match.participantB)}</span>
																	</span>
																</button>
															{/if}
														{/each}
													</div>
												</div>
											{/each}
										</div>
									{/if}
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}

		<!-- Final Stage Section -->
		{#if hasFinalStage && hasResults && (!hasBothPhases || activePhase === 'bracket')}
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

					<!-- Bracket panels - vertical layout without tabs for SPLIT_DIVISIONS -->
				{#if isSplitDivisions && !isParallelBrackets}
					<!-- Gold Bracket -->
					{#if goldBracket && goldBracket.rounds?.length > 0}
						<div class="bracket-division-section gold">
							<div class="division-header">
								<span class="division-icon gold">●</span>
								<span class="division-name">{m.bracket_gold()}</span>
							</div>
							<div class="bracket-wrapper">
								<div class="bracket-container">
									{#each goldBracket.rounds as round, roundIndex}
										{@const visibleMatches = round.matches.filter(m => !isByeMatch(m))}
										{@const hasEnoughVisibleMatches = visibleMatches.length > 0 && visibleMatches.length >= round.matches.length / 2}
										{#if hasEnoughVisibleMatches}
										<div class="bracket-round" style="--round-index: {roundIndex}; --round-mult: {Math.pow(2, roundIndex)}">
											<h3 class="round-name">{translateRoundName(round.name)}</h3>
											<div class="matches-column">
												{#each round.matches as match}
													{@const isByeA = match.participantA?.toUpperCase().includes('BYE')}
													{@const isByeB = match.participantB?.toUpperCase().includes('BYE')}
													{@const winnerIsA = isByeB || match.winner === match.participantA}
													{@const winnerIsB = isByeA || (!isByeB && match.winner === match.participantB)}
													{#if !isByeMatch(match)}
														<!-- svelte-ignore a11y_click_events_have_key_events -->
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div
															class={['bracket-match', match.status === 'COMPLETED' && 'completed', match.videoId && 'has-video', match.rounds?.length && 'has-detail']}
															onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
														>
															<div
																class="match-participant"
																class:winner={winnerIsA}
																class:tbd={!match.participantA}
															>
																{@render participantAvatar(match.participantA, "sm")}
																<span class="participant-name">{getParticipantName(match.participantA)}</span>
																{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																	<span class="score">{match.totalPointsA || match.gamesWonA || 0}</span>
																{/if}
															</div>
															<div class="vs-divider"></div>
															<div
																class="match-participant"
																class:winner={winnerIsB}
																class:tbd={!match.participantB}
															>
																{@render participantAvatar(match.participantB, "sm")}
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
												{#if roundIndex < goldBracket.rounds.length - 1}
													{#each Array(Math.floor(round.matches.filter(m => !isByeMatch(m)).length / 2)) as _, pairIndex}
														<div class="pair-connector" style="--pair-index: {pairIndex}; --total-pairs: {Math.floor(round.matches.filter(m => !isByeMatch(m)).length / 2)}; --total-matches: {round.matches.filter(m => !isByeMatch(m)).length}"></div>
													{/each}
												{/if}
											</div>
										</div>
										{/if}
									{/each}

									<!-- Gold third place match -->
									{#if goldBracket.thirdPlaceMatch && !isByeMatch(goldBracket.thirdPlaceMatch)}
										{@const thirdMatch = goldBracket.thirdPlaceMatch}
										<div class="bracket-round third-place">
											<h3 class="round-name">{m.tournament_thirdFourthPlace?.() || '3º/4º'}</h3>
											<div class="matches-column">
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div
													class={['bracket-match', thirdMatch.status === 'COMPLETED' && 'completed', thirdMatch.videoId && 'has-video', thirdMatch.rounds?.length && 'has-detail']}
													onclick={() => { if (thirdMatch.rounds?.length) { selectedMatch = thirdMatch; showMatchDetail = true; } }}
												>
													<div
														class="match-participant"
														class:winner={thirdMatch.winner === thirdMatch.participantA}
														class:tbd={!thirdMatch.participantA}
													>
														{@render participantAvatar(thirdMatch.participantA, "sm")}
														<span class="participant-name">{getParticipantName(thirdMatch.participantA)}</span>
														{#if thirdMatch.status === 'COMPLETED' || thirdMatch.status === 'WALKOVER'}
															<span class="score">{thirdMatch.totalPointsA || thirdMatch.gamesWonA || 0}</span>
														{/if}
													</div>
													<div class="vs-divider"></div>
													<div
														class="match-participant"
														class:winner={thirdMatch.winner === thirdMatch.participantB}
														class:tbd={!thirdMatch.participantB}
													>
														{@render participantAvatar(thirdMatch.participantB, "sm")}
														<span class="participant-name">{getParticipantName(thirdMatch.participantB)}</span>
														{#if thirdMatch.status === 'COMPLETED' || thirdMatch.status === 'WALKOVER'}
															<span class="score">{thirdMatch.totalPointsB || thirdMatch.gamesWonB || 0}</span>
														{/if}
													</div>
													{#if thirdMatch.videoId}
														<button
															class="video-badge"
															onclick={() => { videoMatch = thirdMatch; showVideoModal = true; }}
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

							<!-- Gold consolation brackets inline -->
							{#if goldConsolationBrackets.length > 0}
								{@const r16Bracket = goldConsolationBrackets.find(c => c.source === 'R16')}
								{@const qfBracket = goldConsolationBrackets.find(c => c.source === 'QF')}
								<div class="consolation-inline">
									<div class="consolation-inline-header">
										🏅 {m.bracket_consolationBrackets?.() ?? 'Rondas de consolación'}
									</div>
									<div class="consolation-unified">
										<!-- R16 consolation rounds -->
										{#if r16Bracket}
											{#each r16Bracket.rounds as round, roundIndex}
												<div class="consolation-round" data-source="R16">
													<div class="round-header">
														{m.tournament_round()} {roundIndex + 1}
														{#if roundIndex === r16Bracket.rounds.length - 1}
															<span class="position-badge">{round.name}</span>
														{/if}
													</div>
													<div class="matches-container">
														{#each round.matches as match}
															{#if !isByeMatch(match)}
																<!-- svelte-ignore a11y_click_events_have_key_events -->
																<!-- svelte-ignore a11y_no_static_element_interactions -->
																<div
																	class={['consolation-match', match.status === 'COMPLETED' && 'completed', match.rounds?.length && 'has-detail']}
																	onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
																>
																	<div
																		class="match-participant"
																		class:winner={match.winner === match.participantA}
																		class:tbd={!match.participantA}
																	>
																		{@render participantAvatar(match.participantA, "sm")}
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
																		{@render participantAvatar(match.participantB, "sm")}
																		<span class="participant-name">{getParticipantName(match.participantB)}</span>
																		{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																			<span class="score">{match.totalPointsB || match.gamesWonB || 0}</span>
																		{/if}
																	</div>
																</div>
															{/if}
														{/each}
													</div>
												</div>
											{/each}
										{/if}
										<!-- QF consolation rounds -->
										{#if qfBracket}
											{#each qfBracket.rounds as round, roundIndex}
												<div class="consolation-round" class:qf-start={roundIndex === 0} data-source="QF">
													<div class="round-header">
														{m.tournament_round()} {roundIndex + 1}
														{#if roundIndex === qfBracket.rounds.length - 1}
															<span class="position-badge">{round.name}</span>
														{/if}
													</div>
													<div class="matches-container">
														{#each round.matches as match}
															{#if !isByeMatch(match)}
																<!-- svelte-ignore a11y_click_events_have_key_events -->
																<!-- svelte-ignore a11y_no_static_element_interactions -->
																<div
																	class={['consolation-match', match.status === 'COMPLETED' && 'completed', match.rounds?.length && 'has-detail']}
																	onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
																>
																	<div
																		class="match-participant"
																		class:winner={match.winner === match.participantA}
																		class:tbd={!match.participantA}
																	>
																		{@render participantAvatar(match.participantA, "sm")}
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
																		{@render participantAvatar(match.participantB, "sm")}
																		<span class="participant-name">{getParticipantName(match.participantB)}</span>
																		{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																			<span class="score">{match.totalPointsB || match.gamesWonB || 0}</span>
																		{/if}
																	</div>
																</div>
															{/if}
														{/each}
													</div>
												</div>
											{/each}
										{/if}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Silver Bracket -->
					{#if silverBracket && silverBracket.rounds?.length > 0}
						<div class="bracket-division-section silver">
							<div class="division-header">
								<span class="division-icon silver">●</span>
								<span class="division-name">{m.bracket_silver()}</span>
							</div>
							<div class="bracket-wrapper">
								<div class="bracket-container">
									{#each silverBracket.rounds as round, roundIndex}
										{@const visibleMatches = round.matches.filter(m => !isByeMatch(m))}
										{@const hasEnoughVisibleMatches = visibleMatches.length > 0 && visibleMatches.length >= round.matches.length / 2}
										{#if hasEnoughVisibleMatches}
										<div class="bracket-round" style="--round-index: {roundIndex}; --round-mult: {Math.pow(2, roundIndex)}">
											<h3 class="round-name">{translateRoundName(round.name)}</h3>
											<div class="matches-column">
												{#each round.matches as match}
													{@const isByeA = match.participantA?.toUpperCase().includes('BYE')}
													{@const isByeB = match.participantB?.toUpperCase().includes('BYE')}
													{@const winnerIsA = isByeB || match.winner === match.participantA}
													{@const winnerIsB = isByeA || (!isByeB && match.winner === match.participantB)}
													{#if !isByeMatch(match)}
														<!-- svelte-ignore a11y_click_events_have_key_events -->
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div
															class={['bracket-match', match.status === 'COMPLETED' && 'completed', match.videoId && 'has-video', match.rounds?.length && 'has-detail']}
															onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
														>
															<div
																class="match-participant"
																class:winner={winnerIsA}
																class:tbd={!match.participantA}
															>
																{@render participantAvatar(match.participantA, "sm")}
																<span class="participant-name">{getParticipantName(match.participantA)}</span>
																{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																	<span class="score">{match.totalPointsA || match.gamesWonA || 0}</span>
																{/if}
															</div>
															<div class="vs-divider"></div>
															<div
																class="match-participant"
																class:winner={winnerIsB}
																class:tbd={!match.participantB}
															>
																{@render participantAvatar(match.participantB, "sm")}
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
												{#if roundIndex < silverBracket.rounds.length - 1}
													{#each Array(Math.floor(round.matches.filter(m => !isByeMatch(m)).length / 2)) as _, pairIndex}
														<div class="pair-connector" style="--pair-index: {pairIndex}; --total-pairs: {Math.floor(round.matches.filter(m => !isByeMatch(m)).length / 2)}; --total-matches: {round.matches.filter(m => !isByeMatch(m)).length}"></div>
													{/each}
												{/if}
											</div>
										</div>
										{/if}
									{/each}

									<!-- Silver third place match -->
									{#if silverBracket.thirdPlaceMatch && !isByeMatch(silverBracket.thirdPlaceMatch)}
										{@const thirdMatch = silverBracket.thirdPlaceMatch}
										<div class="bracket-round third-place">
											<h3 class="round-name">{m.tournament_thirdFourthPlace?.() || '3º/4º'}</h3>
											<div class="matches-column">
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div
													class={['bracket-match', thirdMatch.status === 'COMPLETED' && 'completed', thirdMatch.videoId && 'has-video', thirdMatch.rounds?.length && 'has-detail']}
													onclick={() => { if (thirdMatch.rounds?.length) { selectedMatch = thirdMatch; showMatchDetail = true; } }}
												>
													<div
														class="match-participant"
														class:winner={thirdMatch.winner === thirdMatch.participantA}
														class:tbd={!thirdMatch.participantA}
													>
														{@render participantAvatar(thirdMatch.participantA, "sm")}
														<span class="participant-name">{getParticipantName(thirdMatch.participantA)}</span>
														{#if thirdMatch.status === 'COMPLETED' || thirdMatch.status === 'WALKOVER'}
															<span class="score">{thirdMatch.totalPointsA || thirdMatch.gamesWonA || 0}</span>
														{/if}
													</div>
													<div class="vs-divider"></div>
													<div
														class="match-participant"
														class:winner={thirdMatch.winner === thirdMatch.participantB}
														class:tbd={!thirdMatch.participantB}
													>
														{@render participantAvatar(thirdMatch.participantB, "sm")}
														<span class="participant-name">{getParticipantName(thirdMatch.participantB)}</span>
														{#if thirdMatch.status === 'COMPLETED' || thirdMatch.status === 'WALKOVER'}
															<span class="score">{thirdMatch.totalPointsB || thirdMatch.gamesWonB || 0}</span>
														{/if}
													</div>
													{#if thirdMatch.videoId}
														<button
															class="video-badge"
															onclick={() => { videoMatch = thirdMatch; showVideoModal = true; }}
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

							<!-- Silver consolation brackets inline -->
							{#if silverConsolationBrackets.length > 0}
								{@const r16Bracket = silverConsolationBrackets.find(c => c.source === 'R16')}
								{@const qfBracket = silverConsolationBrackets.find(c => c.source === 'QF')}
								<div class="consolation-inline">
									<div class="consolation-inline-header">
										🏅 {m.bracket_consolationBrackets?.() ?? 'Rondas de consolación'}
									</div>
									<div class="consolation-unified">
										<!-- R16 consolation rounds -->
										{#if r16Bracket}
											{#each r16Bracket.rounds as round, roundIndex}
												<div class="consolation-round" data-source="R16">
													<div class="round-header">
														{m.tournament_round()} {roundIndex + 1}
														{#if roundIndex === r16Bracket.rounds.length - 1}
															<span class="position-badge">{round.name}</span>
														{/if}
													</div>
													<div class="matches-container">
														{#each round.matches as match}
															{#if !isByeMatch(match)}
																<!-- svelte-ignore a11y_click_events_have_key_events -->
																<!-- svelte-ignore a11y_no_static_element_interactions -->
																<div
																	class={['consolation-match', match.status === 'COMPLETED' && 'completed', match.rounds?.length && 'has-detail']}
																	onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
																>
																	<div
																		class="match-participant"
																		class:winner={match.winner === match.participantA}
																		class:tbd={!match.participantA}
																	>
																		{@render participantAvatar(match.participantA, "sm")}
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
																		{@render participantAvatar(match.participantB, "sm")}
																		<span class="participant-name">{getParticipantName(match.participantB)}</span>
																		{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																			<span class="score">{match.totalPointsB || match.gamesWonB || 0}</span>
																		{/if}
																	</div>
																</div>
															{/if}
														{/each}
													</div>
												</div>
											{/each}
										{/if}
										<!-- QF consolation rounds -->
										{#if qfBracket}
											{#each qfBracket.rounds as round, roundIndex}
												<div class="consolation-round" class:qf-start={roundIndex === 0} data-source="QF">
													<div class="round-header">
														{m.tournament_round()} {roundIndex + 1}
														{#if roundIndex === qfBracket.rounds.length - 1}
															<span class="position-badge">{round.name}</span>
														{/if}
													</div>
													<div class="matches-container">
														{#each round.matches as match}
															{#if !isByeMatch(match)}
																<!-- svelte-ignore a11y_click_events_have_key_events -->
																<!-- svelte-ignore a11y_no_static_element_interactions -->
																<div
																	class={['consolation-match', match.status === 'COMPLETED' && 'completed', match.rounds?.length && 'has-detail']}
																	onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
																>
																	<div
																		class="match-participant"
																		class:winner={match.winner === match.participantA}
																		class:tbd={!match.participantA}
																	>
																		{@render participantAvatar(match.participantA, "sm")}
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
																		{@render participantAvatar(match.participantB, "sm")}
																		<span class="participant-name">{getParticipantName(match.participantB)}</span>
																		{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																			<span class="score">{match.totalPointsB || match.gamesWonB || 0}</span>
																		{/if}
																	</div>
																</div>
															{/if}
														{/each}
													</div>
												</div>
											{/each}
										{/if}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				{:else if isParallelBrackets && parallelBrackets.length > 0}
					<!-- Parallel brackets (A/B/C Finals) - keep tabs -->
					<div class="bracket-panel">
						<div class="panel-header">
							<div class="division-tabs parallel">
								{#each parallelBrackets as pb, index}
									<button
										class="division-tab"
										class:active={activeParallelBracket === index}
										onclick={() => activeParallelBracket = index}
									>
										{pb.name}
									</button>
								{/each}
							</div>
						</div>
						{#if currentBracket && rounds.length > 0}
							<div class="bracket-wrapper">
								<div class="bracket-container">
									{#each rounds as round, roundIndex}
										{@const visibleMatches = round.matches.filter(m => !isByeMatch(m))}
										{@const hasEnoughVisibleMatches = visibleMatches.length > 0 && visibleMatches.length >= round.matches.length / 2}
										{#if hasEnoughVisibleMatches}
										<div class="bracket-round" style="--round-index: {roundIndex}; --round-mult: {Math.pow(2, roundIndex)}">
											<h3 class="round-name">{translateRoundName(round.name)}</h3>
											<div class="matches-column">
												{#each round.matches as match}
													{@const isByeA = match.participantA?.toUpperCase().includes('BYE')}
													{@const isByeB = match.participantB?.toUpperCase().includes('BYE')}
													{@const winnerIsA = isByeB || match.winner === match.participantA}
													{@const winnerIsB = isByeA || (!isByeB && match.winner === match.participantB)}
													{#if !isByeMatch(match)}
														<!-- svelte-ignore a11y_click_events_have_key_events -->
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div
															class={['bracket-match', match.status === 'COMPLETED' && 'completed', match.videoId && 'has-video', match.rounds?.length && 'has-detail']}
															onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
														>
															<div
																class="match-participant"
																class:winner={winnerIsA}
																class:tbd={!match.participantA}
															>
																{@render participantAvatar(match.participantA, "sm")}
																<span class="participant-name">{getParticipantName(match.participantA)}</span>
																{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																	<span class="score">{match.totalPointsA || match.gamesWonA || 0}</span>
																{/if}
															</div>
															<div class="vs-divider"></div>
															<div
																class="match-participant"
																class:winner={winnerIsB}
																class:tbd={!match.participantB}
															>
																{@render participantAvatar(match.participantB, "sm")}
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
										{/if}
									{/each}

									<!-- Third place match -->
									{#if thirdPlaceMatch && !isByeMatch(thirdPlaceMatch)}
										<div class="bracket-round third-place">
											<h3 class="round-name">{m.tournament_thirdFourthPlace?.() || '3º/4º'}</h3>
											<div class="matches-column">
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div
													class={['bracket-match', thirdPlaceMatch.status === 'COMPLETED' && 'completed', thirdPlaceMatch.videoId && 'has-video', thirdPlaceMatch.rounds?.length && 'has-detail']}
													onclick={() => { if (thirdPlaceMatch.rounds?.length) { selectedMatch = thirdPlaceMatch; showMatchDetail = true; } }}
												>
													<div
														class="match-participant"
														class:winner={thirdPlaceMatch.winner === thirdPlaceMatch.participantA}
														class:tbd={!thirdPlaceMatch.participantA}
													>
														{@render participantAvatar(thirdPlaceMatch.participantA, "sm")}
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
														{@render participantAvatar(thirdPlaceMatch.participantB, "sm")}
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
				{:else if goldBracket && goldBracket.rounds?.length > 0}
					<!-- Single bracket mode (no split divisions, no parallel) -->
					<div class="bracket-panel">
						<div class="bracket-wrapper">
							<div class="bracket-container">
								{#each goldBracket.rounds as round, roundIndex}
									{@const visibleMatches = round.matches.filter(m => !isByeMatch(m))}
									{@const hasEnoughVisibleMatches = visibleMatches.length > 0 && visibleMatches.length >= round.matches.length / 2}
									{#if hasEnoughVisibleMatches}
									<div class="bracket-round" style="--round-index: {roundIndex}; --round-mult: {Math.pow(2, roundIndex)}">
										<h3 class="round-name">{translateRoundName(round.name)}</h3>
										<div class="matches-column">
											{#each round.matches as match}
												{@const isByeA = match.participantA?.toUpperCase().includes('BYE')}
												{@const isByeB = match.participantB?.toUpperCase().includes('BYE')}
												{@const winnerIsA = isByeB || match.winner === match.participantA}
												{@const winnerIsB = isByeA || (!isByeB && match.winner === match.participantB)}
												{#if !isByeMatch(match)}
													<!-- svelte-ignore a11y_click_events_have_key_events -->
													<!-- svelte-ignore a11y_no_static_element_interactions -->
													<div
														class={['bracket-match', match.status === 'COMPLETED' && 'completed', match.videoId && 'has-video', match.rounds?.length && 'has-detail']}
														onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
													>
														<div
															class="match-participant"
															class:winner={winnerIsA}
															class:tbd={!match.participantA}
														>
															{@render participantAvatar(match.participantA, "sm")}
															<span class="participant-name">{getParticipantName(match.participantA)}</span>
															{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																<span class="score">{match.totalPointsA || match.gamesWonA || 0}</span>
															{/if}
														</div>
														<div class="vs-divider"></div>
														<div
															class="match-participant"
															class:winner={winnerIsB}
															class:tbd={!match.participantB}
														>
															{@render participantAvatar(match.participantB, "sm")}
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
											{#if roundIndex < goldBracket.rounds.length - 1}
												{#each Array(Math.floor(round.matches.filter(m => !isByeMatch(m)).length / 2)) as _, pairIndex}
													<div class="pair-connector" style="--pair-index: {pairIndex}; --total-pairs: {Math.floor(round.matches.filter(m => !isByeMatch(m)).length / 2)}; --total-matches: {round.matches.filter(m => !isByeMatch(m)).length}"></div>
												{/each}
											{/if}
										</div>
									</div>
									{/if}
								{/each}

								<!-- Third place match -->
								{#if goldBracket.thirdPlaceMatch && !isByeMatch(goldBracket.thirdPlaceMatch)}
									{@const thirdMatch = goldBracket.thirdPlaceMatch}
									<div class="bracket-round third-place">
										<h3 class="round-name">{m.tournament_thirdFourthPlace?.() || '3º/4º'}</h3>
										<div class="matches-column">
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div
												class={['bracket-match', thirdMatch.status === 'COMPLETED' && 'completed', thirdMatch.videoId && 'has-video', thirdMatch.rounds?.length && 'has-detail']}
												onclick={() => { if (thirdMatch.rounds?.length) { selectedMatch = thirdMatch; showMatchDetail = true; } }}
											>
												<div
													class="match-participant"
													class:winner={thirdMatch.winner === thirdMatch.participantA}
													class:tbd={!thirdMatch.participantA}
												>
													{@render participantAvatar(thirdMatch.participantA, "sm")}
													<span class="participant-name">{getParticipantName(thirdMatch.participantA)}</span>
													{#if thirdMatch.status === 'COMPLETED' || thirdMatch.status === 'WALKOVER'}
														<span class="score">{thirdMatch.totalPointsA || thirdMatch.gamesWonA || 0}</span>
													{/if}
												</div>
												<div class="vs-divider"></div>
												<div
													class="match-participant"
													class:winner={thirdMatch.winner === thirdMatch.participantB}
													class:tbd={!thirdMatch.participantB}
												>
													{@render participantAvatar(thirdMatch.participantB, "sm")}
													<span class="participant-name">{getParticipantName(thirdMatch.participantB)}</span>
													{#if thirdMatch.status === 'COMPLETED' || thirdMatch.status === 'WALKOVER'}
														<span class="score">{thirdMatch.totalPointsB || thirdMatch.gamesWonB || 0}</span>
													{/if}
												</div>
												{#if thirdMatch.videoId}
													<button
														class="video-badge"
														onclick={() => { videoMatch = thirdMatch; showVideoModal = true; }}
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

						<!-- Single bracket consolation brackets -->
						{#if goldConsolationBrackets.length > 0}
							{@const r16Bracket = goldConsolationBrackets.find(c => c.source === 'R16')}
							{@const qfBracket = goldConsolationBrackets.find(c => c.source === 'QF')}
							<div class="consolation-inline">
								<div class="consolation-inline-header">
									🏅 {m.bracket_consolationBrackets?.() ?? 'Rondas de consolación'}
								</div>
								<div class="consolation-unified">
									<!-- R16 consolation rounds -->
									{#if r16Bracket}
										{#each r16Bracket.rounds as round, roundIndex}
											<div class="consolation-round" data-source="R16">
												<div class="round-header">
													{m.tournament_round()} {roundIndex + 1}
													{#if roundIndex === r16Bracket.rounds.length - 1}
														<span class="position-badge">{round.name}</span>
													{/if}
												</div>
												<div class="matches-container">
													{#each round.matches as match}
														{#if !isByeMatch(match)}
															<!-- svelte-ignore a11y_click_events_have_key_events -->
															<!-- svelte-ignore a11y_no_static_element_interactions -->
															<div
																class={['consolation-match', match.status === 'COMPLETED' && 'completed', match.rounds?.length && 'has-detail']}
																onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
															>
																<div
																	class="match-participant"
																	class:winner={match.winner === match.participantA}
																	class:tbd={!match.participantA}
																>
																	{@render participantAvatar(match.participantA, "sm")}
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
																	{@render participantAvatar(match.participantB, "sm")}
																	<span class="participant-name">{getParticipantName(match.participantB)}</span>
																	{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																		<span class="score">{match.totalPointsB || match.gamesWonB || 0}</span>
																	{/if}
																</div>
															</div>
														{/if}
													{/each}
												</div>
											</div>
										{/each}
									{/if}
									<!-- QF consolation rounds -->
									{#if qfBracket}
										{#each qfBracket.rounds as round, roundIndex}
											<div class="consolation-round" class:qf-start={roundIndex === 0} data-source="QF">
												<div class="round-header">
													{m.tournament_round()} {roundIndex + 1}
													{#if roundIndex === qfBracket.rounds.length - 1}
														<span class="position-badge">{round.name}</span>
													{/if}
												</div>
												<div class="matches-container">
													{#each round.matches as match}
														{#if !isByeMatch(match)}
															<!-- svelte-ignore a11y_click_events_have_key_events -->
															<!-- svelte-ignore a11y_no_static_element_interactions -->
															<div
																class={['consolation-match', match.status === 'COMPLETED' && 'completed', match.rounds?.length && 'has-detail']}
																onclick={() => { if (match.rounds?.length) { selectedMatch = match; showMatchDetail = true; } }}
															>
																<div
																	class="match-participant"
																	class:winner={match.winner === match.participantA}
																	class:tbd={!match.participantA}
																>
																	{@render participantAvatar(match.participantA, "sm")}
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
																	{@render participantAvatar(match.participantB, "sm")}
																	<span class="participant-name">{getParticipantName(match.participantB)}</span>
																	{#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																		<span class="score">{match.totalPointsB || match.gamesWonB || 0}</span>
																	{/if}
																</div>
															</div>
														{/if}
													{/each}
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/if}
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
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="video-modal" onclick={(e) => e.stopPropagation()} role="document">
			<button class="video-modal-close" onclick={() => showVideoModal = false} aria-label={m.common_close?.() ?? 'Close'}>
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

<!-- Match Detail Modal -->
{#if showMatchDetail && selectedMatch}
	{@const roundsByGame = selectedMatch.rounds?.reduce((acc, r) => {
		if (!acc[r.gameNumber]) acc[r.gameNumber] = [];
		acc[r.gameNumber].push(r);
		return acc;
	}, {} as Record<number, typeof selectedMatch.rounds>) ?? {}}
	{@const gameNumbers = Object.keys(roundsByGame).map(Number).sort((a, b) => a - b)}
	{@const show20s = tournament?.show20s ?? false}
	{@const showHammer = tournament?.showHammer ?? false}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="match-detail-overlay"
		data-theme={$theme}
		onclick={() => showMatchDetail = false}
		onkeydown={(e) => e.key === 'Escape' && (showMatchDetail = false)}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="match-detail-modal" onclick={(e) => e.stopPropagation()}>
			<div class="match-detail-header">
				<button class="match-detail-close" onclick={() => showMatchDetail = false} aria-label="Cerrar">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M18 6L6 18M6 6l12 12"/>
					</svg>
				</button>
				<div class="match-detail-score-block">
					<div class="match-detail-final-score">
						<span class="final-score" class:winner={selectedMatch.winner === selectedMatch.participantA}>
							{selectedMatch.totalPointsA ?? selectedMatch.gamesWonA ?? 0}
						</span>
						<span class="score-sep">:</span>
						<span class="final-score" class:winner={selectedMatch.winner === selectedMatch.participantB}>
							{selectedMatch.totalPointsB ?? selectedMatch.gamesWonB ?? 0}
						</span>
					</div>
				</div>
				<div class="match-detail-players">
					<div class="md-player md-player-a" class:is-winner={selectedMatch.winner === selectedMatch.participantA}>
						<span class="md-player-tag">A</span>
						<span class="md-player-name">{getParticipantName(selectedMatch.participantA)}</span>
						{#if selectedMatch.winner === selectedMatch.participantA}
							<span class="md-winner-badge">W</span>
						{/if}
					</div>
					<div class="md-player md-player-b" class:is-winner={selectedMatch.winner === selectedMatch.participantB}>
						<span class="md-player-tag">B</span>
						<span class="md-player-name">{getParticipantName(selectedMatch.participantB)}</span>
						{#if selectedMatch.winner === selectedMatch.participantB}
							<span class="md-winner-badge">W</span>
						{/if}
					</div>
				</div>
			</div>

			<div class="match-detail-body">
				{#each gameNumbers as gameNum}
					{@const gameRounds = roundsByGame[gameNum] || []}
					{@const gameTotalA = gameRounds.reduce((sum, r) => sum + (r.pointsA ?? 0), 0)}
					{@const gameTotalB = gameRounds.reduce((sum, r) => sum + (r.pointsB ?? 0), 0)}
					{@const game20sA = gameRounds.reduce((sum, r) => sum + (r.twentiesA ?? 0), 0)}
					{@const game20sB = gameRounds.reduce((sum, r) => sum + (r.twentiesB ?? 0), 0)}
					<div class="game-section">
						{#if gameNumbers.length > 1}
							<div class="game-header">
								<span class="game-label">{m.history_game?.()} {gameNum}</span>
								<span class="game-score">{gameTotalA} - {gameTotalB}</span>
							</div>
						{/if}
						<table class="rounds-table horizontal">
							<thead>
								<tr>
									<th class="player-col"></th>
									{#each gameRounds as round}
										<th class="round-col">R{round.roundInGame}</th>
									{/each}
									<th class="total-col">{m.history_total?.() ?? 'Total'}</th>
								</tr>
							</thead>
							<tbody>
								<!-- Hammer row (if showHammer and any round has hammer data) -->
								{#if showHammer && gameRounds.some(r => r.hammerSide)}
									<tr class="hammer-row">
										<td class="player-col hammer-label">🔨</td>
										{#each gameRounds as round}
											<td class="round-col hammer-cell">
												{#if round.hammerSide === 'A'}
													<span class="hammer-indicator">▲</span>
												{:else if round.hammerSide === 'B'}
													<span class="hammer-indicator">▼</span>
												{:else}
													<span class="hammer-indicator empty">-</span>
												{/if}
											</td>
										{/each}
										<td class="total-col"></td>
									</tr>
								{/if}
								<!-- Player A row -->
								<tr class:row-winner={gameTotalA > gameTotalB}>
									<td class="player-col">{getParticipantName(selectedMatch.participantA)}</td>
									{#each gameRounds as round}
										<td class="round-col" class:round-winner={(round.pointsA ?? 0) > (round.pointsB ?? 0)}>
											<span class="round-points">{round.pointsA ?? '-'}</span>
											{#if show20s && round.twentiesA > 0}
												<span class="round-twenties">{round.twentiesA}</span>
											{/if}
										</td>
									{/each}
									<td class="total-col" class:game-winner={gameTotalA > gameTotalB}>
										<span class="total-points">{gameTotalA}</span>
										{#if show20s && game20sA > 0}
											<span class="total-twenties">{game20sA}</span>
										{/if}
									</td>
								</tr>
								<!-- Player B row -->
								<tr class:row-winner={gameTotalB > gameTotalA}>
									<td class="player-col">{getParticipantName(selectedMatch.participantB)}</td>
									{#each gameRounds as round}
										<td class="round-col" class:round-winner={(round.pointsB ?? 0) > (round.pointsA ?? 0)}>
											<span class="round-points">{round.pointsB ?? '-'}</span>
											{#if show20s && round.twentiesB > 0}
												<span class="round-twenties">{round.twentiesB}</span>
											{/if}
										</td>
									{/each}
									<td class="total-col" class:game-winner={gameTotalB > gameTotalA}>
										<span class="total-points">{gameTotalB}</span>
										{#if show20s && game20sB > 0}
											<span class="total-twenties">{game20sB}</span>
										{/if}
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				{/each}
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

	.header-center h1 .edition {
		font-weight: 400;
		opacity: 0.7;
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

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .admin-link {
		color: #718096;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .admin-link:hover {
		background: rgba(102, 126, 234, 0.1);
		color: #667eea;
	}

	.share-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		color: #8b9bb3;
		background: none;
		border: none;
		cursor: pointer;
		transition: all 0.2s;
	}

	.share-btn:hover {
		background: rgba(102, 126, 234, 0.15);
		color: #667eea;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .share-btn {
		color: #718096;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .share-btn:hover {
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

	/* External Link Card */
	.link-card {
		text-decoration: none;
		cursor: pointer;
		transition: all 0.2s ease;
		border-color: rgba(102, 126, 234, 0.3);
	}

	.link-card:hover {
		background: #1e2a3d;
		border-color: #667eea;
		transform: translateY(-1px);
	}

	.link-value {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		color: #667eea !important;
	}

	.link-text {
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.external-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		opacity: 0.7;
		transition: opacity 0.15s;
	}



	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .link-card {
		border-color: rgba(102, 126, 234, 0.25);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .link-card:hover {
		background: #f0f4ff;
		border-color: #667eea;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .link-value {
		color: #5a67d8 !important;
	}

	/* Location Card */
	.location-card {
		text-decoration: none;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid rgba(102, 126, 234, 0.2);
	}

	.location-card:hover {
		background: rgba(102, 126, 234, 0.15);
		border-color: rgba(102, 126, 234, 0.4);
	}

	.location-card .info-label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.location-icon {
		width: 14px;
		height: 14px;
		color: #667eea;
		flex-shrink: 0;
	}

	.location-value {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #667eea !important;
	}

	.location-value .external-icon {
		width: 12px;
		height: 12px;
		opacity: 0.6;
		transition: opacity 0.15s;
	}

	.location-card:hover .external-icon {
		opacity: 1;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .location-card {
		border-color: rgba(102, 126, 234, 0.2);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .location-card:hover {
		background: rgba(102, 126, 234, 0.08);
		border-color: rgba(102, 126, 234, 0.3);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .location-value {
		color: #5a67d8 !important;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .location-icon {
		color: #5a67d8;
	}

	/* Calendar Card */
	.calendar-card {
		text-decoration: none;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid rgba(16, 185, 129, 0.2);
	}

	.calendar-card:hover:not(.calendar-static) {
		background: rgba(16, 185, 129, 0.15);
		border-color: rgba(16, 185, 129, 0.4);
	}

	.calendar-static {
		cursor: default;
	}

	.calendar-card .info-label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.calendar-icon {
		width: 14px;
		height: 14px;
		color: #10b981;
		flex-shrink: 0;
	}

	.calendar-value {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #10b981 !important;
	}

	.calendar-value .external-icon {
		width: 12px;
		height: 12px;
		opacity: 0.6;
		transition: opacity 0.15s;
	}

	.calendar-card:hover .external-icon {
		opacity: 1;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .calendar-card {
		border-color: rgba(16, 185, 129, 0.2);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .calendar-card:hover:not(.calendar-static) {
		background: rgba(16, 185, 129, 0.08);
		border-color: rgba(16, 185, 129, 0.3);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .calendar-value {
		color: #059669 !important;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .calendar-icon {
		color: #059669;
	}

	/* Hero Banner */
	.hero-banner {
		display: block;
		position: relative;
		width: 100%;
		height: 280px;
		overflow: hidden;
		text-decoration: none;
		margin-bottom: 1rem;
	}

	.hero-image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center top;
	}

	.hero-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to bottom,
			rgba(0, 0, 0, 0.2) 0%,
			rgba(0, 0, 0, 0.4) 50%,
			rgba(0, 0, 0, 0.85) 100%
		);
	}

	.hero-live-badge {
		position: absolute;
		bottom: 1rem;
		right: 1rem;
		z-index: 10;
	}

	.hero-content {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 1.25rem;
		color: white;
	}

	.hero-badge {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.hero-badge .edition {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.5rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.hero-badge .tier {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.hero-badge .tier-CLUB { background: #6b7280; }
	.hero-badge .tier-REGIONAL { background: #3b82f6; }
	.hero-badge .tier-NATIONAL { background: #8b5cf6; }
	.hero-badge .tier-MAJOR { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }

	.hero-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.hero-date,
	.hero-location {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		opacity: 0.9;
		margin-bottom: 0.25rem;
	}

	.hero-date svg,
	.hero-location svg {
		width: 14px;
		height: 14px;
		opacity: 0.8;
	}

	.hero-link {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.6rem;
		background: rgba(255, 255, 255, 0.15);
		backdrop-filter: blur(8px);
		border-radius: 6px;
		font-size: 0.7rem;
		color: white;
		text-decoration: none;
		opacity: 0;
		transition: opacity 0.2s ease, background 0.2s ease;
	}

	.hero-link:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.hero-banner:hover .hero-link {
		opacity: 1;
	}

	.hero-link svg {
		width: 14px;
		height: 14px;
	}

	@media (max-width: 480px) {
		.hero-banner {
			height: 240px;
		}

		.hero-title {
			font-size: 1.1rem;
		}

		.hero-link {
			opacity: 1;
		}
	}

	/* Description Section */
	.description-section {
		margin-top: 1rem;
	}

	.description-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #667eea;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.description-header svg {
		width: 14px;
		height: 14px;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .description-header {
		color: #5a67d8;
	}

	/* Tournament Description */
	.tournament-description {
		margin: 0;
		padding: 0.875rem 1rem;
		font-size: 0.875rem;
		color: #9ca3af;
		line-height: 1.6;
		background: rgba(30, 41, 59, 0.4);
		border-radius: 8px;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .tournament-description {
		color: #4b5563;
		background: #f8fafc;
	}

	/* Translation */
	.translate-btn {
		margin-left: auto;
		padding: 0.25rem 0.5rem;
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.3);
		border-radius: 4px;
		color: #667eea;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.65rem;
		transition: all 0.2s ease;
	}

	.translate-btn:hover:not(:disabled) {
		background: rgba(102, 126, 234, 0.2);
	}

	.translate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.translate-btn svg {
		width: 14px;
		height: 14px;
	}

	.translate-btn .spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.tournament-description.translated {
		border-left: 3px solid #667eea;
	}

	.show-original-btn,
	.show-translated-btn {
		margin-top: 0.5rem;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid rgba(102, 126, 234, 0.3);
		border-radius: 4px;
		color: #667eea;
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.show-original-btn:hover,
	.show-translated-btn:hover {
		background: rgba(102, 126, 234, 0.1);
	}

	.translation-error {
		margin-top: 0.5rem;
		padding: 0.5rem;
		background: rgba(239, 68, 68, 0.1);
		border-radius: 4px;
		color: #ef4444;
		font-size: 0.75rem;
	}

	/* Podium Section */
	.podium-section {
		margin-top: 1.25rem;
	}

	.podium-section.full-standings {
		margin-top: 0.75rem;
	}

	.standings-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem 1rem;
	}

	@media (max-width: 480px) {
		.standings-grid {
			grid-template-columns: 1fr;
		}
	}

	.standings-column {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.standing-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.4rem;
		border-radius: 4px;
		font-size: 0.75rem;
	}

	.standing-row.top-4 {
		background: rgba(16, 185, 129, 0.08);
	}

	.standing-row .pos {
		min-width: 1.5rem;
		text-align: center;
		font-weight: 600;
		color: #8b9bb3;
		font-size: 0.7rem;
	}

	.standing-row .pos.medal {
		font-size: 1.3rem;
		line-height: 1;
	}

	.standing-row .participant-cell {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}

	.standing-row .name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: #e1e8ed;
	}

	.standing-row .pts {
		font-weight: 600;
		color: #10b981;
		font-size: 0.7rem;
		min-width: 2rem;
		text-align: right;
	}

	.standing-row .pts.zero {
		color: #6b7a94;
	}

	/* Light mode */
	:global([data-theme='light']) .standing-row .name,
	:global([data-theme='violet-light']) .standing-row .name {
		color: #374151;
	}

	:global([data-theme='light']) .standing-row.top-4,
	:global([data-theme='violet-light']) .standing-row.top-4 {
		background: rgba(16, 185, 129, 0.1);
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
	}

	.podium-rank.medal {
		width: auto;
		height: auto;
		background: transparent !important;
		font-size: 1.3rem;
		line-height: 1;
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

	.podium-points {
		font-size: 0.7rem;
		font-weight: 600;
		color: #10b981;
		background: rgba(16, 185, 129, 0.15);
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		flex-shrink: 0;
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

	/* Participant avatars */
	.single-avatar,
	.pair-avatars {
		flex-shrink: 0;
	}

	.avatar-sm { --avatar-size: 24px; }
	.avatar-md { --avatar-size: 32px; }
	.avatar-lg { --avatar-size: 40px; }

	.single-avatar {
		width: var(--avatar-size);
		height: var(--avatar-size);
	}

	.single-avatar .avatar-img {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
	}

	.avatar-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--primary);
		color: var(--primary-foreground);
		font-weight: 600;
		font-size: calc(var(--avatar-size) * 0.4);
		user-select: none;
	}

	/* Singles: placeholder fills the container */
	.single-avatar .avatar-placeholder {
		width: 100%;
		height: 100%;
	}

	/* Partner in doubles gets a slightly different shade to distinguish the two */
	.partner-placeholder {
		background: color-mix(in srgb, var(--primary) 60%, var(--muted-foreground));
	}

	/* Pair avatars - overlapping */
	.pair-avatars {
		display: flex;
		align-items: center;
		width: calc(var(--avatar-size) * 1.55);
		height: var(--avatar-size);
		position: relative;
	}

	.pair-avatars .avatar-img {
		width: var(--avatar-size);
		height: var(--avatar-size);
		border-radius: 50%;
		object-fit: cover;
		position: absolute;
		border: 2px solid #1a2332;
	}

	.pair-avatars .first {
		left: 0;
		z-index: 2;
	}

	.pair-avatars .second {
		left: calc(var(--avatar-size) * 0.55);
		z-index: 1;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .pair-avatars .avatar-img {
		border-color: #ffffff;
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
		font-size: 1.1rem;
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

	/* Single group: 2-column layout */
	.groups-container.single-group {
		display: block;
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

	.standings-table-wrapper {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.standings-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
		table-layout: fixed;
	}

	.standings-table th,
	.standings-table td {
		padding: 0.4rem 0.35rem;
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
		padding-left: calc(0.35rem - 2px);
	}

	.standings-table .pos-col { width: 24px; text-align: center; }
	.standings-table .name-col { text-align: left; overflow: hidden; }
	.standings-table .stat-col { width: 32px; text-align: center !important; font-variant-numeric: tabular-nums; }

	.name-cell {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.name-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.ranking-pts {
		font-size: 0.6rem;
		color: #9ca3af;
		font-weight: 500;
		margin-left: 0.2rem;
		opacity: 0.8;
	}

	/* Primary column (used for qualification ranking) - highlighted with border */
	.standings-table th.primary-col,
	.standings-table td.primary-col {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
		font-weight: 700;
		border-left: 2px solid var(--primary);
		border-right: 2px solid var(--primary);
	}

	.standings-table th.primary-col {
		background: color-mix(in srgb, var(--primary) 25%, transparent);
		border-top: 2px solid var(--primary);
	}

	.standings-table tbody tr:last-child td.primary-col {
		border-bottom: 2px solid var(--primary);
	}

	/* Row hover for better readability */
	.standings-table tbody tr:hover td {
		background: rgba(255, 255, 255, 0.06);
	}

	.standings-table tbody tr:hover td.primary-col {
		background: color-mix(in srgb, var(--primary) 25%, transparent);
	}

	/* Standings Legend */
	.standings-legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem 1rem;
		margin-top: 0.5rem;
		padding: 0.4rem 0.5rem;
		font-size: 0.65rem;
		color: #6b7a94;
	}

	.legend-item {
		white-space: nowrap;
	}

	.legend-item strong {
		color: #8b9bb3;
		margin-right: 0.2rem;
	}

	/* View Matches Button */
	.view-matches-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.6rem;
		margin-top: 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid #2d3748;
		border-radius: 6px;
		color: #8b9bb3;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.view-matches-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: #e1e8ed;
	}

	/* Filter Button (player filter in single group) */
	.filter-button {
		background: #1a2332 !important;
		border-color: #2d3748 !important;
	}

	.filter-button:hover {
		background: #2d3748 !important;
	}

	/* Group Matches Section */
	.group-matches-section {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #2d3748;
	}

	.round-section {
		margin-bottom: 1rem;
	}

	.round-section:last-child {
		margin-bottom: 0;
	}

	.round-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: #8b9bb3;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin: 0 0 0.5rem 0;
		padding: 0.4rem 0.6rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 4px;
		border-left: 2px solid hsl(var(--primary));
	}

	.matches-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.match-result-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		font-size: 0.8rem;
		/* Two columns with flex-wrap - each item takes ~50% minus gap */
		flex: 1 1 calc(50% - 0.2rem);
		min-width: 200px;
		max-width: 100%;
	}

	.match-result-row.completed {
		background: rgba(0, 0, 0, 0.3);
	}

	.match-table {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		padding: 0.15rem 0.35rem;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.match-player {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex: 1;
		min-width: 0;
		color: #8b9bb3;
	}

	.match-player-a {
		flex-direction: row-reverse;
	}

	.match-player-b {
		flex-direction: row;
	}

	.match-player-name {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.match-player-a .match-player-name {
		text-align: right;
	}

	.match-player-b .match-player-name {
		text-align: left;
	}

	.match-player.winner {
		color: #10b981;
		font-weight: 600;
	}

	.match-score {
		flex-shrink: 0;
		min-width: 50px;
		text-align: center;
		font-weight: 600;
		color: #e1e8ed;
	}

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



	/* Gold tab underline */


	/* Parallel brackets tabs */
	.division-tabs.parallel {
		flex-wrap: wrap;
	}

	.division-tabs.parallel .division-tab::after {
		background: #667eea;
	}



	/* Bracket Division Section (vertical layout for gold/silver) */
	.bracket-division-section {
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 12px;
		overflow: hidden;
		margin-bottom: 1.5rem;
	}

	.bracket-division-section:last-child {
		margin-bottom: 0;
	}

	.bracket-division-section.gold {
		border-color: rgba(245, 158, 11, 0.3);
	}

	.bracket-division-section.silver {
		border-color: rgba(156, 163, 175, 0.3);
	}

	.division-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(0, 0, 0, 0.2);
		border-bottom: 1px solid #2d3748;
	}

	.bracket-division-section.gold .division-header {
		border-bottom-color: rgba(245, 158, 11, 0.2);
	}

	.bracket-division-section.silver .division-header {
		border-bottom-color: rgba(156, 163, 175, 0.2);
	}

	.division-icon {
		font-size: 0.75rem;
	}

	.division-icon.gold {
		color: #f59e0b;
	}

	.division-icon.silver {
		color: #9ca3af;
	}

	.division-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: #e1e8ed;
	}

	.bracket-division-section .bracket-wrapper {
		padding: 1rem;
	}

	/* Consolation brackets shown inline below main bracket */
	.consolation-inline {
		padding: 1rem;
		border-top: 1px dashed rgba(255, 255, 255, 0.1);
		margin-top: 0.5rem;
		background: rgba(0, 0, 0, 0.15);
		border-radius: 0 0 12px 12px;
	}

	.consolation-inline-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #8b9bb3;
	}

	.consolation-unified {
		display: flex;
		flex-direction: row;
		gap: 3rem;
		overflow-x: auto;
		padding: 0.5rem 0;
		align-items: flex-start;
		-webkit-overflow-scrolling: touch;
	}

	.consolation-round {
		min-width: 180px;
		flex-shrink: 0;
	}

	.consolation-round .round-header {
		font-size: 0.75rem;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		margin-bottom: 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 2px solid rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.consolation-round .round-header .position-badge {
		font-size: 0.65rem;
		font-weight: 700;
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		text-transform: none;
	}

	.consolation-round .matches-container {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Visual separator between R16 and QF sections */
	.consolation-round.qf-start {
		position: relative;
		margin-left: 1.5rem;
		padding-left: 1.5rem;
	}

	.consolation-round.qf-start::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2px;
		background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.15) 20%, rgba(255, 255, 255, 0.15) 80%, transparent);
	}

	.consolation-match {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.5rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.consolation-match:hover {
		border-color: rgba(255, 255, 255, 0.2);
		background: rgba(0, 0, 0, 0.4);
	}

	.consolation-match.completed {
		border-color: rgba(16, 185, 129, 0.3);
	}

	.consolation-match .match-participant {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0.25rem 0;
		font-size: 0.8rem;
	}

	.consolation-match .participant-name {
		color: #94a3b8;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.consolation-match .match-participant.winner .participant-name {
		color: #10b981;
		font-weight: 600;
	}

	.consolation-match .score {
		color: #64748b;
		font-weight: 500;
		margin-left: 0.5rem;
	}

	.consolation-match .match-participant.winner .score {
		color: #10b981;
	}

	.consolation-match .vs-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0.25rem 0;
	}

	/* Position labels for consolation matches */
	.consolation-match-wrapper {
		position: relative;
	}

	.position-label {
		position: absolute;
		top: -0.4rem;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.6rem;
		font-weight: 700;
		color: #fff;
		padding: 0.1rem 0.35rem;
		background: #6366f1;
		border-radius: 3px;
		white-space: nowrap;
		z-index: 5;
	}

	/* Legacy styles - keep for backwards compatibility */




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



	.bracket-panel.silver-active {
		border-color: rgba(156, 163, 175, 0.25);
	}



	/* When there's no panel header (single bracket) */
	.bracket-panel:not(:has(.panel-header)) {
		background: transparent;
		border: none;
	}

	.bracket-panel:not(:has(.panel-header)) .bracket-wrapper {
		padding: 0;
	}

	/* Bracket view toggle (main/consolation) */
	.bracket-view-toggle {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		margin: 0 1rem 1rem;
	}

	.view-toggle-btn {
		flex: 1;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid #2d3748;
		border-radius: 6px;
		color: #8b9bb3;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.view-toggle-btn:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: #4a5568;
	}

	.view-toggle-btn.active {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-color: transparent;
		color: white;
	}

	/* Consolation section */
	.consolation-section {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		padding: 1rem;
	}

	.consolation-bracket-card {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 12px;
		padding: 1rem;
	}

	.consolation-bracket-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: #e1e8ed;
		margin: 0 0 1rem 0;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid #2d3748;
	}

	.bracket-wrapper.consolation {
		padding: 0.5rem 0;
		overflow-y: hidden;
	}



	/* Bracket - horizontal scroll only, no vertical */
	.bracket-wrapper {
		overflow-x: auto;
		overflow-y: hidden;
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
		/* Bronze connector handles spacing */
	}

	.bracket-round.third-place .round-name {
		background: linear-gradient(135deg, #d4a574 0%, #b8956e 100%);
		color: #5c4033;
		padding: 0.3rem 0.8rem;
		border-radius: 6px;
		box-shadow: 0 2px 6px rgba(180, 137, 94, 0.3);
	}

	/* Final round (last round before 3rd place, or last round if no 3rd place) - golden styling */
	.bracket-round:last-child:not(.third-place) .round-name,
	.bracket-round:nth-last-child(2):not(.third-place):has(+ .third-place) .round-name {
		background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
		color: #78350f;
		padding: 0.3rem 0.8rem;
		border-radius: 6px;
		box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
	}

	/* Bronze connector from final to 3rd place */
	.bracket-round:nth-last-child(2):not(.third-place):has(+ .third-place) .bracket-match::after {
		display: block;
		width: 4.5rem;
		background: linear-gradient(90deg, #b8956e 0%, #d4a574 100%);
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
	/* Each subsequent round doubles: 2^roundIndex * base */
	.bracket-match::before {
		height: calc(var(--round-mult) * (50% + 0.25rem));
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
		gap: 0.4rem;
		padding: 0.6rem 0.75rem;
		background: #1a1f2e;
		transition: all 0.15s;
	}

	.match-participant:first-child {
		border-radius: 7px 7px 0 0;
	}

	.match-participant:last-child {
		border-radius: 0 0 7px 7px;
	}

	.match-participant.winner {
		background: #1a1f2e;
	}

	.match-participant.tbd {
		opacity: 0.5;
	}

	.participant-name {
		font-size: 0.85rem;
		color: #6b7280;
		font-weight: 500;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Winner styling - green name and score */
	.match-participant.winner .participant-name {
		color: #10b981;
		font-weight: 600;
	}

	/* Loser styling - muted red/gray name */
	.bracket-match.completed .match-participant:not(.winner) .participant-name {
		color: #9ca3af;
	}

	.score {
		font-size: 0.85rem;
		font-weight: 700;
		color: #6b7280;
		min-width: 24px;
		text-align: right;
	}

	/* Winner score - green */
	.match-participant.winner .score {
		color: #10b981;
	}

	/* Loser score - muted */
	.bracket-match.completed .match-participant:not(.winner) .score {
		color: #6b7280;
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

		/* Standings table mobile optimizations */
		.standings-table {
			font-size: 0.7rem;
		}

		.standings-table th,
		.standings-table td {
			padding: 0.3rem 0.2rem;
		}

		.standings-table .pos-col { width: 20px; }
		.standings-table .stat-col { width: 24px; }

		/* Match result row mobile - match standings table font size */
		.match-result-row,
		button.match-result-row {
			font-size: 0.7rem;
		}
	}

	/* Light theme */
	.detail-container:is([data-theme='light'], [data-theme='violet-light']) {
		background: #f5f7fa;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .page-header {
		background: #ffffff;
		border-bottom-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .header-center h1 {
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .loading-state p {
		color: #718096;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .spinner {
		border-color: #e2e8f0;
		border-top-color: #667eea;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .error-state h3 {
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .winner-card {
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%);
		border-color: rgba(251, 191, 36, 0.25);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .winner-name {
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .info-card {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .info-label {
		color: #718096;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .info-value {
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-title {
		color: #718096;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-list {
		background: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-entry {
		background: #ffffff;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-rank {
		background: #f1f5f9;
		color: #64748b;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-name {
		color: #334155;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-entry[data-position="1"] .podium-name {
		color: #b45309;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-group-label {
		color: #667eea;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-group.gold .podium-group-label {
		color: #b45309;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-group.silver .podium-group-label {
		color: #64748b;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .podium-points {
		color: #059669;
		background: rgba(16, 185, 129, 0.1);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .section-title {
		color: #1a202c;
		border-bottom-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .group-card {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-column,
	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .matches-column {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .group-matches-inline {
		background: transparent;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .group-name {
		background: #f5f7fa;
		color: #1a202c;
		border-bottom-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-table th {
		color: #718096;
		border-bottom-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-table td {
		color: #1a202c;
		border-bottom-color: rgba(226, 232, 240, 0.6);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-table tbody tr:nth-child(odd) td {
		background: rgba(0, 0, 0, 0.02);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-table tbody tr:nth-child(even) td {
		background: transparent;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-table th.primary-col,
	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-table td.primary-col {
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		color: var(--primary);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-table th.primary-col {
		background: color-mix(in srgb, var(--primary) 20%, transparent);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-table tbody tr:hover td {
		background: rgba(0, 0, 0, 0.04);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-table tbody tr:hover td.primary-col {
		background: color-mix(in srgb, var(--primary) 22%, transparent);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standings-legend {
		color: #718096;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .legend-item strong {
		color: #4a5568;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .view-matches-btn {
		background: rgba(0, 0, 0, 0.02);
		border-color: #e2e8f0;
		color: #64748b;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .view-matches-btn:hover {
		background: rgba(0, 0, 0, 0.05);
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .filter-button {
		background: #ffffff !important;
		border-color: #e2e8f0 !important;
		color: #1a202c !important;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .filter-button:hover {
		background: #f1f5f9 !important;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .group-matches-section {
		border-top-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .round-title {
		color: #64748b;
		background: rgba(0, 0, 0, 0.03);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-result-row {
		background: rgba(0, 0, 0, 0.02);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-result-row.completed {
		background: rgba(0, 0, 0, 0.04);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-table {
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		color: var(--primary);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-player {
		color: #64748b;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-player.winner {
		color: #059669;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-score {
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .phase-nav {
		border-bottom-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .phase-tab {
		color: #718096;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .phase-tab:hover {
		color: #4a5568;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .phase-tab.active {
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .phase-tab .tab-indicator {
		background: #667eea;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .division-tab {
		color: #718096;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .division-tab:hover {
		color: #4a5568;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .division-tab.active {
		color: #1a202c;
	}



	/* Bracket division section light theme */
	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-division-section {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-division-section.gold {
		border-color: rgba(217, 119, 6, 0.35);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-division-section.silver {
		border-color: rgba(107, 114, 128, 0.35);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .division-header {
		background: rgba(0, 0, 0, 0.02);
		border-bottom-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-division-section.gold .division-header {
		border-bottom-color: rgba(217, 119, 6, 0.2);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-division-section.silver .division-header {
		border-bottom-color: rgba(107, 114, 128, 0.2);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .division-name {
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .division-icon.gold {
		color: #d97706;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .division-icon.silver {
		color: #6b7280;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-inline {
		border-top-color: rgba(0, 0, 0, 0.08);
		background: rgba(0, 0, 0, 0.02);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-inline-header {
		color: #4a5568;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-round .round-header {
		color: #4a5568;
		border-bottom-color: rgba(0, 0, 0, 0.1);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-round.qf-start::before {
		background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.1) 20%, rgba(0, 0, 0, 0.1) 80%, transparent);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-match {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-match:hover {
		border-color: #cbd5e1;
		background: #f8fafc;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-match.completed {
		border-color: rgba(16, 185, 129, 0.3);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-match .participant-name {
		color: #64748b;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-match .match-participant.winner .participant-name {
		color: #059669;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-match .score {
		color: #94a3b8;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-match .match-participant.winner .score {
		color: #059669;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-match .vs-divider {
		background: rgba(0, 0, 0, 0.08);
	}



	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-panel {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .panel-header {
		border-bottom-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-panel.gold-active {
		border-color: rgba(217, 119, 6, 0.3);
	}



	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-panel.silver-active {
		border-color: rgba(107, 114, 128, 0.25);
	}



	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-round.third-place {
		border-left-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-view-toggle {
		background: rgba(0, 0, 0, 0.03);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .view-toggle-btn {
		border-color: #e2e8f0;
		color: #64748b;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .view-toggle-btn:hover {
		background: rgba(0, 0, 0, 0.05);
		border-color: #cbd5e1;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-section {
		background: transparent;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-bracket-card {
		background: rgba(0, 0, 0, 0.02);
		border: 1px solid #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .consolation-bracket-title {
		color: #1a202c;
		border-bottom-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .round-name {
		color: #4a5568;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-match {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-participant {
		background: #f8fafc;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-participant.winner {
		background: #f8fafc;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .participant-name {
		color: #9ca3af;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-participant.winner .participant-name {
		color: #059669;
		font-weight: 600;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-match.completed .match-participant:not(.winner) .participant-name {
		color: #9ca3af;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .score {
		color: #9ca3af;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .match-participant.winner .score {
		color: #059669;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .vs-divider {
		background: #e2e8f0;
	}

	/* Light theme connector lines - same gradient, works on both themes */
	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-match::after,
	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .bracket-match::before,
	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .pair-connector {
		background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
	}

	/* Light theme videos section */
	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .videos-section {
		border-top-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .videos-title {
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .video-card {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .video-card:hover {
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .video-match-title {
		color: #1a202c;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .video-score {
		color: #718096;
	}

	/* Video Badge */
	.video-badge {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
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
		transform: translate(-50%, -50%) scale(1.15);
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
			width: 26px;
			height: 26px;
		}

		.video-badge svg {
			width: 12px;
			height: 12px;
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

	/* Match Detail Modal */
	.match-detail-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.match-detail-modal {
		background: #111827;
		border-radius: 20px;
		width: min(94vw, 560px);
		max-height: 85vh;
		overflow: hidden;
		position: relative;
		box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
	}

	.match-detail-close {
		position: absolute;
		top: 12px;
		right: 12px;
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 8px;
		width: 30px;
		height: 30px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.7);
		transition: all 0.12s ease;
		z-index: 10;
	}

	.match-detail-close:hover {
		background: rgba(255, 255, 255, 0.25);
		color: #fff;
	}

	.match-detail-header {
		padding: 1.5rem 1.25rem 1.25rem;
		background: var(--primary);
		text-align: center;
	}

	.match-detail-score-block {
		margin-bottom: 1rem;
	}

	.match-detail-players {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.md-player {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 10px;
	}

	.md-player.is-winner {
		background: rgba(255, 255, 255, 0.15);
	}

	.md-player-tag {
		width: 22px;
		height: 22px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.625rem;
		font-weight: 800;
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.7);
	}

	.md-player-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.md-winner-badge {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #10b981;
		color: white;
		font-size: 0.5625rem;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.match-detail-final-score {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.match-detail-final-score .final-score {
		font-size: 2.5rem;
		font-weight: 800;
		color: rgba(255, 255, 255, 0.4);
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.match-detail-final-score .final-score.winner {
		color: white;
	}

	.match-detail-final-score .score-sep {
		font-size: 2rem;
		font-weight: 300;
		color: rgba(255, 255, 255, 0.2);
	}

	.match-detail-body {
		padding: 0.875rem;
		overflow-y: auto;
		flex: 1;
	}

	.game-section {
		margin-bottom: 0.75rem;
	}

	.game-section:last-child {
		margin-bottom: 0;
	}

	.game-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 8px;
		margin-bottom: 0.5rem;
	}

	.game-label {
		font-size: 0.75rem;
		font-weight: 700;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.game-score {
		font-size: 0.9375rem;
		font-weight: 800;
		color: #e2e8f0;
		font-variant-numeric: tabular-nums;
	}

	.rounds-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9375rem;
	}

	.rounds-table.horizontal {
		table-layout: auto;
	}

	.rounds-table th {
		padding: 0.4rem 0.3rem;
		text-align: center;
		font-weight: 700;
		color: #475569;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border-bottom: 1px solid #1e293b;
	}

	.rounds-table td {
		padding: 0.5rem 0.3rem;
		text-align: center;
		color: #94a3b8;
		font-variant-numeric: tabular-nums;
	}

	.rounds-table tbody tr {
		border-bottom: 1px solid rgba(30, 41, 59, 0.5);
	}

	.rounds-table tbody tr:last-child {
		border-bottom: none;
	}

	.rounds-table .player-col {
		text-align: left;
		font-weight: 700;
		color: #e2e8f0;
		padding-left: 0.5rem;
		padding-right: 0.5rem;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.8125rem;
	}

	.rounds-table .round-col {
		min-width: 32px;
		vertical-align: middle;
	}

	.rounds-table .round-col.round-winner .round-points {
		color: #34d399;
		font-weight: 800;
	}

	.rounds-table .round-points {
		display: block;
		line-height: 1.2;
	}

	.rounds-table .round-twenties {
		display: block;
		font-size: 0.5625rem;
		color: #64748b;
		line-height: 1;
		margin-top: 1px;
	}

	/* Hammer row */
	.rounds-table .hammer-row {
		background: rgba(255, 255, 255, 0.02);
		border-bottom: 1px solid rgba(30, 41, 59, 0.3) !important;
	}

	.rounds-table .hammer-row td {
		padding: 0.25rem 0.3rem;
		font-size: 0.7rem;
	}

	.rounds-table .hammer-label {
		font-size: 0.7rem;
		color: #64748b;
	}

	.rounds-table .hammer-cell {
		color: #64748b;
	}

	.rounds-table .hammer-indicator {
		font-size: 0.6rem;
		color: #f59e0b;
	}

	.rounds-table .hammer-indicator.empty {
		color: #334155;
	}

	.rounds-table .total-col {
		font-weight: 700;
		color: #e2e8f0;
		border-left: 1px solid #1e293b;
		padding-left: 0.5rem;
		vertical-align: middle;
	}

	.rounds-table .total-points {
		display: block;
		line-height: 1.2;
	}

	.rounds-table .total-twenties {
		display: block;
		font-size: 0.5625rem;
		color: #64748b;
		line-height: 1;
		margin-top: 1px;
		font-weight: 500;
	}

	.rounds-table .total-col.game-winner .total-points {
		color: #34d399;
	}

	.rounds-table tr.row-winner .player-col {
		color: #34d399;
	}

	/* Match result row clickable styles */
	button.match-result-row {
		background: transparent;
		border: none;
		cursor: default;
		font-family: inherit;
		font-size: 0.8rem;
		text-align: inherit;
		width: 100%;
	}

	button.match-result-row.has-detail {
		cursor: pointer;
	}

	button.match-result-row.has-detail:hover {
		background: rgba(255, 255, 255, 0.06);
	}

	button.match-result-row:disabled {
		cursor: default;
		opacity: 1;
	}

	/* Bracket match clickable styles */
	.bracket-match.has-detail {
		cursor: pointer;
		transition: transform 0.1s ease, box-shadow 0.1s ease;
	}

	.bracket-match.has-detail:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	/* Light theme for match detail modal */
	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .match-detail-modal {
		background: #fff;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .match-detail-header {
		background: var(--primary);
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .match-detail-close {
		background: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.7);
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .match-detail-close:hover {
		background: rgba(255, 255, 255, 0.25);
		color: #fff;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .match-detail-final-score .final-score {
		color: rgba(255, 255, 255, 0.4);
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .match-detail-final-score .final-score.winner {
		color: white;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .match-detail-final-score .score-sep {
		color: rgba(255, 255, 255, 0.2);
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .game-header {
		background: #f8fafc;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .game-label {
		color: #94a3b8;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .game-score {
		color: #0f172a;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table th {
		color: #94a3b8;
		border-bottom-color: #e2e8f0;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table td {
		color: #64748b;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table tbody tr {
		border-bottom-color: #f1f5f9;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table .player-col {
		color: #0f172a;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table .total-col {
		color: #0f172a;
		border-left-color: #e2e8f0;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table .round-twenties,
	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table .total-twenties {
		color: #94a3b8;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table tr.row-winner .player-col {
		color: #059669;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table .round-col.round-winner .round-points {
		color: #059669;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .rounds-table .total-col.game-winner .total-points {
		color: #059669;
	}

	.match-detail-overlay:is([data-theme='light'], [data-theme='violet-light']) .md-player.is-winner {
		background: rgba(255, 255, 255, 0.18);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) button.match-result-row.has-detail:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	/* Responsive match detail modal */
	@media (max-width: 480px) {
		.match-detail-modal {
			width: 100%;
			max-height: 90vh;
			border-radius: 20px 20px 0 0;
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
		}

		.match-detail-overlay {
			align-items: flex-end;
			padding: 0;
		}

		.md-player-name {
			max-width: 140px;
			font-size: 0.8125rem;
		}

		.match-detail-final-score .final-score {
			font-size: 2rem;
		}

		.rounds-table .player-col {
			max-width: 120px;
		}

		.rounds-table {
			font-size: 0.75rem;
		}

		.rounds-table th {
			font-size: 0.65rem;
		}
	}
	/* Final Standings Zebra Striping */
	.standings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
		margin-top: 1rem;
	}

	.standings-column {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.standing-row {
		display: flex;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		transition: background-color 0.2s;
	}

	/* Zebra striping - exclude top 4 (which have special styling) */
	.standing-row:not(.top-4):nth-child(odd) {
		background-color: rgba(255, 255, 255, 0.03);
	}

	.standing-row:not(.top-4):hover {
		background-color: rgba(255, 255, 255, 0.08);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standing-row:not(.top-4):nth-child(odd) {
		background-color: rgba(0, 0, 0, 0.03);
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standing-row:not(.top-4):hover {
		background-color: rgba(0, 0, 0, 0.06);
	}

	.standing-row.top-4 {
		font-weight: 600;
	}

	.standing-row .pos {
		width: 2.5rem;
		font-weight: 600;
		color: #8b9bb3;
	}

	.standing-row .pos.medal {
		font-size: 1.1rem;
	}

	.standing-row .participant-cell {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.standing-row .name {
		color: #e1e8ed;
		font-size: 0.95rem;
	}

	.detail-container:is([data-theme='light'], [data-theme='violet-light']) .standing-row .name {
		color: #1a202c;
	}

	.standing-row .pts {
		font-weight: 700;
		color: #10b981;
		font-variant-numeric: tabular-nums;
	}

	.standing-row .pts.zero {
		color: #64748b;
		opacity: 0.6;
	}
</style>
