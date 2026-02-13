<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type {
		Tournament,
		Group,
		GroupMatch,
		GroupStanding,
		TournamentParticipant,
		BracketMatch
	} from '$lib/types/tournament';
	import { getParticipantDisplayName } from '$lib/types/tournament';
	import { isBye } from '$lib/algorithms/bracket';
	import MatchCard from './MatchCard.svelte';

	interface Props {
		tournament: Tournament;
	}

	let { tournament }: Props = $props();

	// View state
	let expandedGroups = $state<Set<string>>(new Set());
	let expandedRounds = $state<Record<string, Set<number>>>({});
	let initialized = $state(false);

	// Bracket state
	let activeBracketTab = $state<'gold' | 'silver'>('gold');
	let activeParallelBracket = $state(0);

	// Score change tracking for bracket matches
	let prevScores = $state<Map<string, { a: number; b: number }>>(new Map());
	let changedScores = $state<Set<string>>(new Set());

	// Derived data
	let isGroupStage = $derived(tournament.status === 'GROUP_STAGE');
	let isTransition = $derived(tournament.status === 'TRANSITION');
	let isFinalStage = $derived(tournament.status === 'FINAL_STAGE');

	// Bracket derived values
	let isSplitDivisions = $derived(tournament.finalStage?.mode === 'SPLIT_DIVISIONS');
	let isParallelBrackets = $derived(tournament.finalStage?.mode === 'PARALLEL_BRACKETS');
	let goldBracket = $derived(tournament.finalStage?.goldBracket);
	let silverBracket = $derived(tournament.finalStage?.silverBracket);
	let parallelBrackets = $derived(tournament.finalStage?.parallelBrackets || []);

	let currentBracket = $derived(
		isParallelBrackets
			? parallelBrackets[activeParallelBracket]?.bracket
			: (activeBracketTab === 'gold' ? goldBracket : silverBracket)
	);
	let bracketRounds = $derived(currentBracket?.rounds || []);
	let thirdPlaceMatch = $derived(currentBracket?.thirdPlaceMatch);

	let groups = $derived((() => {
		const groupsData = tournament.groupStage?.groups;
		if (!groupsData) return [];
		if (Array.isArray(groupsData)) return groupsData as Group[];
		return Object.values(groupsData) as Group[];
	})());

	let isSwiss = $derived(tournament.groupStage?.type === 'SWISS');
	let qualificationMode = $derived(
		tournament.groupStage?.qualificationMode ||
		tournament.groupStage?.rankingSystem ||
		'WINS'
	);
	let isDoubles = $derived(tournament.gameType === 'doubles');
	let gameMode = $derived(tournament.scoringMode || 'points');
	let matchesToWin = $derived(tournament.groupStage?.matchesToWin || tournament.finalStage?.matchesToWin || 1);

	let totalRounds = $derived(
		isSwiss
			? (tournament.groupStage?.numSwissRounds || tournament.numSwissRounds || 0)
			: (tournament.groupStage?.totalRounds || 0)
	);

	let activeParticipants = $derived(
		tournament.participants.filter(p => p.status === 'ACTIVE' || !p.status).length
	);

	// Round progress calculation (for group stage: show "Ronda 1/5" = current round being played or last completed)
	let roundProgress = $derived((() => {
		if (groups.length === 0) return { current: 0, total: 0, percentage: 0 };

		// Find the highest round that exists in the data
		let highestExistingRound = 0;
		let highestCompleteRound = 0;

		for (const group of groups) {
			const rounds = getGroupRounds(group);
			for (const round of rounds) {
				if (round.roundNumber > highestExistingRound) {
					highestExistingRound = round.roundNumber;
				}

				// Check if this round is complete
				const matches = Array.isArray(round.matches) ? round.matches : Object.values(round.matches || {});
				const allComplete = matches.length > 0 && matches.every((m: GroupMatch) => m.status === 'COMPLETED' || m.status === 'WALKOVER');
				if (allComplete && round.roundNumber > highestCompleteRound) {
					highestCompleteRound = round.roundNumber;
				}
			}
		}

		// Current round = the highest existing round (could be in progress or complete)
		// If no rounds exist, show 0
		const currentRound = highestExistingRound || 0;

		return {
			current: currentRound,
			total: totalRounds,
			percentage: totalRounds > 0 ? Math.round((highestCompleteRound / totalRounds) * 100) : 0
		};
	})());

	// Check if a round is fully completed
	function isRoundComplete(matches: GroupMatch[]): boolean {
		const safeMatches = Array.isArray(matches) ? matches : Object.values(matches || {});
		return safeMatches.length > 0 && safeMatches.every((m: GroupMatch) => m.status === 'COMPLETED' || m.status === 'WALKOVER');
	}

	// Track the last known highest round to detect new rounds
	let lastKnownHighestRound = $state(0);

	// Initialize expanded state
	$effect(() => {
		if (groups.length > 0 && !initialized) {
			// Expand all groups initially
			expandedGroups = new Set(groups.map(g => g.id));

			// Initialize expanded rounds - expand the first incomplete round (current round)
			// Collapse completed rounds
			groups.forEach((group: Group) => {
				const rounds = getGroupRounds(group);
				const expanded = new Set<number>();

				// Find the first incomplete round and expand it
				let foundIncomplete = false;
				for (const round of rounds) {
					if (!isRoundComplete(round.matches)) {
						expanded.add(round.roundNumber);
						foundIncomplete = true;
						break; // Only expand the first incomplete round
					}
				}

				// If all rounds are complete, expand the last one
				if (!foundIncomplete && rounds.length > 0) {
					expanded.add(rounds[rounds.length - 1].roundNumber);
				}

				expandedRounds[group.id] = expanded;
			});
			expandedRounds = { ...expandedRounds };
			lastKnownHighestRound = roundProgress.current;
			initialized = true;
		}
	});

	// Detect when a new round appears and auto-expand it, collapse the previous
	$effect(() => {
		if (initialized && roundProgress.current > lastKnownHighestRound) {
			const newRound = roundProgress.current;
			const previousRound = lastKnownHighestRound;

			// Update expanded rounds for all groups
			groups.forEach((group: Group) => {
				const currentExpanded = expandedRounds[group.id] || new Set<number>();
				const newExpanded = new Set(currentExpanded);

				// Collapse the previous round (if it exists)
				if (previousRound > 0) {
					newExpanded.delete(previousRound);
				}

				// Expand the new round
				newExpanded.add(newRound);

				expandedRounds[group.id] = newExpanded;
			});

			expandedRounds = { ...expandedRounds };
			lastKnownHighestRound = newRound;
		}
	});

	// Track score changes in bracket matches for animation
	$effect(() => {
		if (!isFinalStage) return;

		const allMatches: BracketMatch[] = [];

		// Collect all matches from brackets
		if (goldBracket?.rounds) {
			goldBracket.rounds.forEach(r => allMatches.push(...r.matches));
			if (goldBracket.thirdPlaceMatch) allMatches.push(goldBracket.thirdPlaceMatch);
		}
		if (silverBracket?.rounds) {
			silverBracket.rounds.forEach(r => allMatches.push(...r.matches));
			if (silverBracket.thirdPlaceMatch) allMatches.push(silverBracket.thirdPlaceMatch);
		}
		parallelBrackets.forEach(pb => {
			if (pb.bracket?.rounds) {
				pb.bracket.rounds.forEach(r => allMatches.push(...r.matches));
				if (pb.bracket.thirdPlaceMatch) allMatches.push(pb.bracket.thirdPlaceMatch);
			}
		});

		// Check for score changes
		const newChanged = new Set<string>();
		allMatches.forEach(match => {
			if (match.status === 'IN_PROGRESS') {
				const prev = prevScores.get(match.id);
				const currentA = match.totalPointsA || 0;
				const currentB = match.totalPointsB || 0;

				if (prev && (prev.a !== currentA || prev.b !== currentB)) {
					newChanged.add(match.id);
					// Clear animation after 600ms
					setTimeout(() => {
						changedScores.delete(match.id);
						changedScores = new Set(changedScores);
					}, 600);
				}

				prevScores.set(match.id, { a: currentA, b: currentB });
			}
		});

		if (newChanged.size > 0) {
			changedScores = new Set([...changedScores, ...newChanged]);
		}
		prevScores = new Map(prevScores);
	});

	// Helper to check if a match score changed
	function hasScoreChanged(matchId: string): boolean {
		return changedScores.has(matchId);
	}

	// Helper functions
	function getPhaseLabel(status: string | undefined): string {
		switch (status) {
			case 'GROUP_STAGE':
				return m.tournament_groupStage();
			case 'TRANSITION':
				return m.tournament_transition();
			case 'FINAL_STAGE':
				return m.tournament_finalStage();
			default:
				return '';
		}
	}

	function getModeLabel(mode: string | undefined): string {
		switch (mode) {
			case 'singles':
				return m.tournaments_singles();
			case 'doubles':
				return m.tournaments_doubles();
			default:
				return '';
		}
	}

	function getTierLabel(tier: string | undefined): string {
		switch (tier) {
			case 'CLUB':
				return m.tournaments_tierClub();
			case 'REGIONAL':
				return m.tournaments_tierRegional();
			case 'NATIONAL':
				return m.tournaments_tierNational();
			case 'MAJOR':
				return m.tournaments_tierMajor();
			default:
				return '';
		}
	}

	function translateGroupName(name: string): string {
		if (name === 'Swiss') return m.tournament_swissSystem();
		if (name === 'SINGLE_GROUP') return m.tournament_singleGroup();
		const idMatch = name.match(/^GROUP_([A-H])$/);
		if (idMatch) return `${m.tournament_group()} ${idMatch[1]}`;
		if (name === 'Grupo Único') return m.tournament_singleGroup();
		const legacyMatch = name.match(/^Grupo ([A-H])$/);
		if (legacyMatch) return `${m.tournament_group()} ${legacyMatch[1]}`;
		return name;
	}

	// Get scoring config label for bracket display (e.g., "7P", "4R", "Pg2")
	function getBracketScoringLabel(): string {
		const config = tournament.finalStage;
		if (!config) return '';

		const mode = config.scoringMode || tournament.scoringMode || 'points';
		const pointsToWin = config.pointsToWin || tournament.pointsToWin || 7;
		const roundsToPlay = config.roundsToPlay || tournament.roundsToPlay || 4;
		const matchesToWinFinal = config.matchesToWin || 1;

		let label = mode === 'rounds'
			? `${roundsToPlay}R`
			: `${pointsToWin}P`;

		if (matchesToWinFinal > 1) {
			label += ` Pg${matchesToWinFinal}`;
		}

		return label;
	}

	let bracketScoringLabel = $derived(getBracketScoringLabel());

	function getGroupRounds(group: Group): Array<{ roundNumber: number; matches: GroupMatch[] }> {
		const data = group.schedule || group.pairings;
		if (!data) return [];
		const arr = Array.isArray(data) ? data : Object.values(data);
		return arr as Array<{ roundNumber: number; matches: GroupMatch[] }>;
	}

	function getGroupMatches(group: Group): GroupMatch[] {
		const rounds = getGroupRounds(group);
		return rounds.flatMap(r => {
			const matches = r.matches;
			return Array.isArray(matches) ? matches : Object.values(matches || {});
		});
	}

	function getRoundProgress(matches: GroupMatch[]): { completed: number; total: number; percentage: number } {
		const safeMatches = Array.isArray(matches) ? matches : Object.values(matches || {});
		const total = safeMatches.length;
		const completed = safeMatches.filter(
			(m: GroupMatch) => m.status === 'COMPLETED' || m.status === 'WALKOVER'
		).length;
		return {
			completed,
			total,
			percentage: total > 0 ? Math.round((completed / total) * 100) : 0
		};
	}

	function getGroupProgress(group: Group): { completed: number; total: number; percentage: number } {
		const matches = getGroupMatches(group);
		const total = matches.length;
		const completed = matches.filter(
			(m: GroupMatch) => m.status === 'COMPLETED' || m.status === 'WALKOVER'
		).length;
		return {
			completed,
			total,
			percentage: total > 0 ? Math.round((completed / total) * 100) : 0
		};
	}

	function toggleGroup(groupId: string) {
		const newSet = new Set(expandedGroups);
		if (newSet.has(groupId)) {
			newSet.delete(groupId);
		} else {
			newSet.add(groupId);
		}
		expandedGroups = newSet;
	}

	function toggleRound(groupId: string, roundNumber: number) {
		if (!expandedRounds[groupId]) {
			expandedRounds[groupId] = new Set();
		}
		const newSet = new Set(expandedRounds[groupId]);
		if (newSet.has(roundNumber)) {
			newSet.delete(roundNumber);
		} else {
			newSet.add(roundNumber);
		}
		expandedRounds[groupId] = newSet;
		expandedRounds = { ...expandedRounds };
	}

	// Get participant object
	function getParticipant(participantId: string): TournamentParticipant | null {
		if (!participantId || participantId === 'BYE') return null;
		return tournament.participants.find(p => p.id === participantId) || null;
	}

	// Get participant name
	function getParticipantName(participantId: string): string {
		if (participantId === 'BYE') return 'BYE';
		const participant = getParticipant(participantId);
		if (!participant) return m.common_tbd?.() || 'TBD';
		return getParticipantDisplayName(participant, isDoubles);
	}

	// Check if participant is registered (has userId)
	function isRegistered(participant: TournamentParticipant | null): boolean {
		return !!participant?.userId;
	}

	// Check if partner is registered
	function isPartnerRegistered(participant: TournamentParticipant | null): boolean {
		return !!participant?.partner?.userId;
	}

	// Sort standings
	function getSortedStandings(standings: GroupStanding[]): GroupStanding[] {
		return [...standings].sort((a, b) => {
			if (a.position !== undefined && b.position !== undefined) {
				return a.position - b.position;
			}
			if (qualificationMode === 'POINTS') {
				if (b.totalPointsScored !== a.totalPointsScored) {
					return b.totalPointsScored - a.totalPointsScored;
				}
				return b.total20s - a.total20s;
			} else {
				const aPoints = isSwiss ? (a.swissPoints ?? (a.matchesWon * 2 + a.matchesTied)) : a.points;
				const bPoints = isSwiss ? (b.swissPoints ?? (b.matchesWon * 2 + b.matchesTied)) : b.points;
				if (bPoints !== aPoints) return bPoints - aPoints;
				return b.total20s - a.total20s;
			}
		});
	}

	// Format Swiss points
	function formatSwissPoints(standing: GroupStanding): string {
		const pts = standing.swissPoints ?? (standing.matchesWon * 2 + standing.matchesTied);
		return pts.toString();
	}

	// Matches in progress count (groups + brackets)
	let matchesInProgress = $derived((() => {
		let count = 0;
		// Count from groups
		groups.forEach((group: Group) => {
			const matches = getGroupMatches(group);
			count += matches.filter((m: GroupMatch) => m.status === 'IN_PROGRESS').length;
		});
		// Count from brackets
		if (tournament.finalStage?.goldBracket?.rounds) {
			for (const round of tournament.finalStage.goldBracket.rounds) {
				count += round.matches.filter((m: BracketMatch) => m.status === 'IN_PROGRESS').length;
			}
		}
		if (tournament.finalStage?.silverBracket?.rounds) {
			for (const round of tournament.finalStage.silverBracket.rounds) {
				count += round.matches.filter((m: BracketMatch) => m.status === 'IN_PROGRESS').length;
			}
		}
		return count;
	})());

	// Bracket progress
	let bracketProgress = $derived((() => {
		if (!isFinalStage) return { completed: 0, total: 0, percentage: 0 };

		let totalMatches = 0;
		let completedMatches = 0;

		function countBracketMatches(bracket: typeof goldBracket) {
			if (!bracket?.rounds) return;
			for (const round of bracket.rounds) {
				for (const match of round.matches) {
					if (!isBye(match.participantA) && !isBye(match.participantB)) {
						totalMatches++;
						if (match.status === 'COMPLETED' || match.status === 'WALKOVER') {
							completedMatches++;
						}
					}
				}
			}
			// Third place match
			if (bracket.thirdPlaceMatch && !isBye(bracket.thirdPlaceMatch.participantA) && !isBye(bracket.thirdPlaceMatch.participantB)) {
				totalMatches++;
				if (bracket.thirdPlaceMatch.status === 'COMPLETED' || bracket.thirdPlaceMatch.status === 'WALKOVER') {
					completedMatches++;
				}
			}
			// Consolation brackets
			if (bracket.consolationBrackets) {
				for (const cb of bracket.consolationBrackets) {
					if (cb.rounds) {
						for (const round of cb.rounds) {
							for (const match of round.matches) {
								if (!isBye(match.participantA) && !isBye(match.participantB)) {
									totalMatches++;
									if (match.status === 'COMPLETED' || match.status === 'WALKOVER') {
										completedMatches++;
									}
								}
							}
						}
					}
				}
			}
		}

		countBracketMatches(goldBracket);
		if (isSplitDivisions) {
			countBracketMatches(silverBracket);
		}
		if (isParallelBrackets) {
			for (const pb of parallelBrackets) {
				countBracketMatches(pb.bracket);
			}
		}

		return {
			completed: completedMatches,
			total: totalMatches,
			percentage: totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0
		};
	})());

	// Consolation brackets
	let bracketView = $state<'main' | 'consolation'>('main');
	let goldConsolationBrackets = $derived(goldBracket?.consolationBrackets || []);
	let silverConsolationBrackets = $derived(silverBracket?.consolationBrackets || []);
	let consolationBrackets = $derived(activeBracketTab === 'gold' ? goldConsolationBrackets : silverConsolationBrackets);
	let consolationEnabled = $derived(
		tournament.finalStage?.consolationEnabled ??
		tournament.finalStage?.goldBracket?.config?.consolationEnabled ??
		false
	);
	let hasConsolation = $derived(consolationEnabled && consolationBrackets.length > 0);

	// Bracket helpers
	function translateRoundName(name: string): string {
		const key = name.toLowerCase();
		const roundTranslations: Record<string, string> = {
			'final': m.tournament_final(),
			'finals': m.tournament_final(),
			'semifinal': m.tournament_semifinal(),
			'semifinals': m.tournament_semifinal(),
			'quarterfinal': m.import_quarterfinals?.() || 'Cuartos',
			'quarterfinals': m.import_quarterfinals?.() || 'Cuartos',
			'round of 16': m.import_round16?.() || 'Octavos',
			'round16': m.import_round16?.() || 'Octavos',
			'third place': m.tournament_thirdPlace?.() || '3º/4º'
		};
		return roundTranslations[key] || name.charAt(0).toUpperCase() + name.slice(1);
	}

	function isByeMatch(match: BracketMatch): boolean {
		return isBye(match.participantA) || isBye(match.participantB);
	}
</script>

<div class="live-view">
	<!-- Compact Info Bar -->
	<div class="info-bar">
		<div class="info-chips">
			<span class="info-chip phase">{getPhaseLabel(tournament.status)}</span>
			<span class="info-chip">{activeParticipants} {m.tournaments_participants()}</span>
			<span class="info-chip">{getModeLabel(tournament.gameType)}</span>
			{#if tournament.rankingConfig?.tier}
				<span class="info-chip tier-{tournament.rankingConfig.tier}">{getTierLabel(tournament.rankingConfig.tier)}</span>
			{/if}
		</div>
		<div class="info-right">
			{#if matchesInProgress > 0}
				<span class="info-chip live-chip">
					<span class="pulse-dot-mini"></span>
					{matchesInProgress} {m.tournament_inPlay?.() || 'en juego'}
				</span>
			{/if}
			{#if isGroupStage && roundProgress.total > 0}
				<div class="progress-inline">
					<span class="progress-text-mini">{m.admin_matches?.() || 'Partidos'}:</span>
					<div class="progress-bar-mini">
						<div
							class="progress-fill-mini"
							class:complete={roundProgress.percentage === 100}
							style="width: {roundProgress.percentage}%"
						></div>
					</div>
					<span class="progress-label-mini">{roundProgress.current}/{roundProgress.total}</span>
				</div>
			{/if}
			{#if isFinalStage && bracketProgress.total > 0}
				<div class="progress-inline">
					<span class="progress-text-mini">{m.admin_matches?.() || 'Partidos'}:</span>
					<div class="progress-bar-mini">
						<div
							class="progress-fill-mini"
							class:complete={bracketProgress.percentage === 100}
							style="width: {bracketProgress.percentage}%"
						></div>
					</div>
					<span class="progress-label-mini">{bracketProgress.completed}/{bracketProgress.total}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Group Stage Content -->
	{#if isGroupStage && groups.length > 0}
		<div class="groups-container">
			{#each groups as group (group.id)}
				{@const progress = getGroupProgress(group)}
				{@const isExpanded = expandedGroups.has(group.id)}
				{@const rounds = getGroupRounds(group)}
				{@const sortedStandings = getSortedStandings(group.standings || [])}

				<div class="group-card" class:expanded={isExpanded} class:complete={progress.percentage === 100}>
					<!-- Group Header -->
					<button class="group-header" onclick={() => toggleGroup(group.id)} aria-expanded={isExpanded}>
						<div class="header-left">
							<span class="expand-icon" class:rotated={isExpanded}>
								<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
								</svg>
							</span>
							<span class="group-name">{translateGroupName(group.name)}</span>
							{#if progress.percentage === 100}
								<span class="complete-badge">
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
										<polyline points="20 6 9 17 4 12" />
									</svg>
								</span>
							{/if}
						</div>
					</button>

					<!-- Group Content -->
					{#if isExpanded}
						<div class="group-content two-columns">
							<!-- Standings Table -->
							<div class="column standings-column">
								<h4 class="column-title">{m.tournament_standings()}</h4>
								<div class="standings-table">
									<table>
										<thead>
											<tr>
												<th class="pos-col">#</th>
												<th class="name-col">{m.tournament_participant()}</th>
												<th class="wins-col" title={m.tournament_matchesWon()}>{m.tournament_matchesWonShort?.() || 'V'}</th>
												{#if qualificationMode === 'WINS'}
													<th class="points-col primary" title={m.tournament_pointsStandard()}>{m.ranking_pointsShort()}</th>
												{/if}
												<th class="total-points-col" class:primary={qualificationMode === 'POINTS'} title={m.tournament_totalCrokinolePoints()}>{m.tournament_totalPointsScored()}</th>
												<th class="twenties-col" title="20s">🎯</th>
											</tr>
										</thead>
										<tbody>
											{#each sortedStandings as standing, i (standing.participantId)}
												{@const participant = getParticipant(standing.participantId)}
												<tr>
													<td class="pos-col">
														<span class="position-badge">{i + 1}</span>
													</td>
													<td class="name-col">
														<span class="participant-name">
															{#if isDoubles && participant}
																<span class="doubles-names">
																	<span>{participant.name}{#if isRegistered(participant)}<span class="registered-check" title="{participant.name} registrado">✓</span>{/if}</span>
																	<span class="separator">/</span>
																	<span>{participant.partner?.name || ''}{#if isPartnerRegistered(participant)}<span class="registered-check" title="{participant.partner?.name} registrado">✓</span>{/if}</span>
																</span>
																{#if participant.teamName}
																	<span class="team-name-label">({participant.teamName})</span>
																{/if}
															{:else}
																{getParticipantName(standing.participantId)}
																{#if isRegistered(participant)}
																	<span class="registered-check" title="Usuario registrado">✓</span>
																{/if}
															{/if}
														</span>
													</td>
													<td class="wins-col">{standing.matchesWon}</td>
													{#if qualificationMode === 'WINS'}
														<td class="points-col primary">
															<strong>{isSwiss ? formatSwissPoints(standing) : standing.points}</strong>
														</td>
													{/if}
													<td class="total-points-col" class:primary={qualificationMode === 'POINTS'}>
														<strong>{standing.totalPointsScored}</strong>
													</td>
													<td class="twenties-col">{standing.total20s || 0}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>

							<!-- Matches by Round -->
							<div class="column schedule-column">
								<h4 class="column-title">{m.tournament_schedule()}</h4>
								<div class="rounds-container">
									{#each rounds as round (round.roundNumber)}
										{@const roundProgress = getRoundProgress(round.matches)}
										{@const isRoundExpanded = expandedRounds[group.id]?.has(round.roundNumber)}
										<div class="round-section" class:complete={roundProgress.percentage === 100}>
											<button
												class="round-header"
												onclick={() => toggleRound(group.id, round.roundNumber)}
												aria-expanded={isRoundExpanded}
											>
												<div class="round-left">
													<span class="expand-icon small" class:rotated={isRoundExpanded}>
														<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
															<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
														</svg>
													</span>
													<span class="round-name">{m.tournament_round()} {round.roundNumber}</span>
													{#if roundProgress.percentage === 100}
														<span class="round-complete-icon">
															<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
																<polyline points="20 6 9 17 4 12" />
															</svg>
														</span>
													{/if}
												</div>
												<span class="round-progress">{roundProgress.completed}/{roundProgress.total}</span>
											</button>

											{#if isRoundExpanded}
												<div class="matches-list">
													{#each round.matches as match (match.id)}
														<MatchCard
															{match}
															participants={tournament.participants}
															gameMode={gameMode as 'points' | 'rounds'}
															{isDoubles}
															{matchesToWin}
														/>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else if isTransition}
		<!-- Transition Phase -->
		<div class="transition-state">
			<div class="transition-icon">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
				</svg>
			</div>
			<h3 class="transition-title">{m.tournament_transition()}</h3>
			<p class="transition-desc">{m.tournament_transitionDescription?.() || 'Preparando la fase final...'}</p>
		</div>
	{:else if isFinalStage}
		<!-- Final Stage - Bracket View -->
		<div class="bracket-section">
			<!-- Parallel Brackets Tabs (only for parallel mode) -->
			{#if isParallelBrackets && parallelBrackets.length > 0}
				<div class="division-tabs">
					{#each parallelBrackets as pb, index (pb.name || index)}
						<button
							class="division-tab"
							class:active={activeParallelBracket === index}
							onclick={() => activeParallelBracket = index}
						>
							<span class="division-label">{pb.name}</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Split Divisions: Show Gold and Silver brackets stacked -->
			{#if isSplitDivisions && !isParallelBrackets}
				<!-- GOLD BRACKET -->
				{#if goldBracket && goldBracket.rounds && goldBracket.rounds.length > 0}
					<div class="bracket-card gold-bracket">
						<div class="bracket-header gold">
							<h3 class="bracket-title">
								<span class="division-dot gold"></span>
								{m.bracket_gold()}{#if consolationEnabled && goldConsolationBrackets.length > 0} - {m.bracket_winners?.() || 'Ganadores'}{/if}
							</h3>
						</div>
					<div class="bracket-wrapper">
						<div class="bracket-grid">
							{#each goldBracket.rounds as round, roundIndex (round.name || roundIndex)}
								{@const isFinalRound = roundIndex === goldBracket.rounds.length - 1}
								<div class="bracket-column" class:has-next={roundIndex < goldBracket.rounds.length - 1} style="--round-index: {roundIndex}">
									<div class="round-header" class:final-round={isFinalRound}>
										<span class="round-name">{translateRoundName(round.name)}</span>
											{#if bracketScoringLabel}
												<span class="scoring-label">{bracketScoringLabel}</span>
											{/if}
									</div>
									<div class="round-matches">
										{#each round.matches as match, matchIndex (match.id)}
											{@const isByeA = isBye(match.participantA)}
											{@const isByeB = isBye(match.participantB)}
											{@const isByeMatchFlag = isByeA || isByeB}
											{@const winnerIsA = isByeB || match.winner === match.participantA}
											{@const winnerIsB = isByeA || (!isByeB && match.winner === match.participantB)}
											{@const participantA = getParticipant(match.participantA || '')}
											{@const participantB = getParticipant(match.participantB || '')}
											<div
												class="match-card"
												class:completed={match.status === 'COMPLETED' || match.status === 'WALKOVER'}
												class:in-progress={match.status === 'IN_PROGRESS'}
												class:pending={match.status === 'PENDING'}
												class:bye-match={isByeMatchFlag}
											>
												{#if match.status === 'IN_PROGRESS'}
													<div class="live-badge">
														<span class="live-pulse"></span>
														LIVE
													</div>
												{/if}
												<div class="match-player" class:winner={winnerIsA && !isByeMatchFlag} class:tbd={!match.participantA} class:bye={isByeA}>
													{#if match.seedA}
														<span class="seed">#{match.seedA}</span>
													{/if}
													<span class="player-name">
														{#if isByeA}
															BYE
														{:else}
															{getParticipantName(match.participantA || '')}
														{/if}
													</span>
													{#if !isByeA && (participantA?.photoURL || participantA?.partner?.photoURL)}
														<div class="player-avatars">
															{#if participantA?.photoURL}
																<img src={participantA.photoURL} alt="" class="player-avatar" />
															{/if}
															{#if isDoubles && participantA?.partner?.photoURL}
																<img src={participantA.partner.photoURL} alt="" class="player-avatar" />
															{/if}
														</div>
													{/if}
													{#if !isByeMatchFlag}
														<span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(match.id)}>
															{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																{match.totalPointsA || match.gamesWonA || 0}
															{/if}
														</span>
													{/if}
												</div>
												<div class="match-divider"></div>
												<div class="match-player" class:winner={winnerIsB && !isByeMatchFlag} class:tbd={!match.participantB} class:bye={isByeB}>
													{#if match.seedB}
														<span class="seed">#{match.seedB}</span>
													{/if}
													<span class="player-name">
														{#if isByeB}
															BYE
														{:else}
															{getParticipantName(match.participantB || '')}
														{/if}
													</span>
													{#if !isByeB && (participantB?.photoURL || participantB?.partner?.photoURL)}
														<div class="player-avatars">
															{#if participantB?.photoURL}
																<img src={participantB.photoURL} alt="" class="player-avatar" />
															{/if}
															{#if isDoubles && participantB?.partner?.photoURL}
																<img src={participantB.partner.photoURL} alt="" class="player-avatar" />
															{/if}
														</div>
													{/if}
													{#if !isByeMatchFlag}
														<span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(match.id)}>
															{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																{match.totalPointsB || match.gamesWonB || 0}
															{/if}
														</span>
													{/if}
												</div>
											</div>
										{/each}
										<!-- Pair connectors for next round -->
										{#if roundIndex < goldBracket.rounds.length - 1}
											{#each Array(Math.floor(round.matches.length / 2)) as _, pairIndex}
												<div class="pair-connector" style="--pair-index: {pairIndex}; --total-pairs: {Math.floor(round.matches.length / 2)}; --total-matches: {round.matches.length}"></div>
											{/each}
										{/if}
									</div>
								</div>
							{/each}

							<!-- Third Place Match -->
							{#if goldBracket.thirdPlaceMatch && !isByeMatch(goldBracket.thirdPlaceMatch)}
								{@const tpm = goldBracket.thirdPlaceMatch}
								{@const tpmWinnerIsA = tpm.winner === tpm.participantA}
								{@const tpmWinnerIsB = tpm.winner === tpm.participantB}
								{@const tpmParticipantA = getParticipant(tpm.participantA || '')}
								{@const tpmParticipantB = getParticipant(tpm.participantB || '')}
								<div class="bracket-column third-place-column">
									<div class="round-header third-place-header">
										<span class="round-name">{m.tournament_thirdPlace?.() || '3º/4º'}</span>
									</div>
									<div class="round-matches">
										<div
											class="match-card"
											class:completed={tpm.status === 'COMPLETED' || tpm.status === 'WALKOVER'}
											class:in-progress={tpm.status === 'IN_PROGRESS'}
											class:pending={tpm.status === 'PENDING'}
										>
											{#if tpm.status === 'IN_PROGRESS'}
												<div class="live-badge">
													<span class="live-pulse"></span>
													LIVE
												</div>
											{/if}
											<div class="match-player" class:winner={tpmWinnerIsA} class:tbd={!tpm.participantA}>
												{#if tpm.seedA}
													<span class="seed">#{tpm.seedA}</span>
												{/if}
												<span class="player-name">
													{getParticipantName(tpm.participantA || '')}
												</span>
												{#if tpmParticipantA?.photoURL || tpmParticipantA?.partner?.photoURL}
													<div class="player-avatars">
														{#if tpmParticipantA?.photoURL}
															<img src={tpmParticipantA.photoURL} alt="" class="player-avatar" />
														{/if}
														{#if isDoubles && tpmParticipantA?.partner?.photoURL}
															<img src={tpmParticipantA.partner.photoURL} alt="" class="player-avatar" />
														{/if}
													</div>
												{/if}
												<span class="player-score" class:live={tpm.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(tpm.id)}>
													{#if tpm.status === 'COMPLETED' || tpm.status === 'WALKOVER' || tpm.status === 'IN_PROGRESS'}
														{tpm.totalPointsA || tpm.gamesWonA || 0}
													{/if}
												</span>
											</div>
											<div class="match-divider"></div>
											<div class="match-player" class:winner={tpmWinnerIsB} class:tbd={!tpm.participantB}>
												{#if tpm.seedB}
													<span class="seed">#{tpm.seedB}</span>
												{/if}
												<span class="player-name">
													{getParticipantName(tpm.participantB || '')}
												</span>
												{#if tpmParticipantB?.photoURL || tpmParticipantB?.partner?.photoURL}
													<div class="player-avatars">
														{#if tpmParticipantB?.photoURL}
															<img src={tpmParticipantB.photoURL} alt="" class="player-avatar" />
														{/if}
														{#if isDoubles && tpmParticipantB?.partner?.photoURL}
															<img src={tpmParticipantB.partner.photoURL} alt="" class="player-avatar" />
														{/if}
													</div>
												{/if}
												<span class="player-score" class:live={tpm.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(tpm.id)}>
													{#if tpm.status === 'COMPLETED' || tpm.status === 'WALKOVER' || tpm.status === 'IN_PROGRESS'}
														{tpm.totalPointsB || tpm.gamesWonB || 0}
													{/if}
												</span>
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
				{/if}

				<!-- Gold Consolation Brackets -->
				{#if consolationEnabled && goldConsolationBrackets.length > 0}
					<div class="consolation-section gold">
						<div class="consolation-header">
							<h3 class="consolation-main-title gold">
								<span class="division-dot gold"></span>
								{m.bracket_gold()} - {m.bracket_consolation?.() || 'Consolación'}
							</h3>
						</div>
						<div class="consolation-grid">
							{#each goldConsolationBrackets as cb, cbIndex (cb.positionLabel || cbIndex)}
								<div class="consolation-bracket">
									<div class="consolation-bracket-header">
										<span class="consolation-label">{cb.positionLabel || `${cbIndex + 5}º-${cbIndex + 8}º`}</span>
									</div>
									{#if cb.rounds}
										<div class="consolation-matches">
											{#each cb.rounds as round (round.name)}
												{@const visibleMatches = round.matches.filter((m: BracketMatch) => !isByeMatch(m))}
												{#if visibleMatches.length > 0}
													{#each round.matches as match (match.id)}
														{#if !isByeMatch(match)}
															{@const winnerIsA = match.winner === match.participantA}
															{@const winnerIsB = match.winner === match.participantB}
															{@const cParticipantA = getParticipant(match.participantA || '')}
															{@const cParticipantB = getParticipant(match.participantB || '')}
															<div
																class="match-card compact"
																class:completed={match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																class:in-progress={match.status === 'IN_PROGRESS'}
															>
																{#if match.status === 'IN_PROGRESS'}
																	<div class="live-badge compact">
																		<span class="live-pulse"></span>
																	</div>
																{/if}
																<div class="match-player" class:winner={winnerIsA} class:tbd={!match.participantA}>
																	{#if match.seedA}
																		<span class="seed">#{match.seedA}</span>
																	{/if}
																	<span class="player-name">{getParticipantName(match.participantA || '')}</span>
																	{#if cParticipantA?.photoURL || cParticipantA?.partner?.photoURL}
																		<div class="player-avatars">
																			{#if cParticipantA?.photoURL}
																				<img src={cParticipantA.photoURL} alt="" class="player-avatar" />
																			{/if}
																			{#if isDoubles && cParticipantA?.partner?.photoURL}
																				<img src={cParticipantA.partner.photoURL} alt="" class="player-avatar" />
																			{/if}
																		</div>
																	{/if}
																	<span class="player-score">
																		{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																			{match.totalPointsA || match.gamesWonA || 0}
																		{/if}
																	</span>
																</div>
																<div class="match-divider"></div>
																<div class="match-player" class:winner={winnerIsB} class:tbd={!match.participantB}>
																	{#if match.seedB}
																		<span class="seed">#{match.seedB}</span>
																	{/if}
																	<span class="player-name">{getParticipantName(match.participantB || '')}</span>
																	{#if cParticipantB?.photoURL || cParticipantB?.partner?.photoURL}
																		<div class="player-avatars">
																			{#if cParticipantB?.photoURL}
																				<img src={cParticipantB.photoURL} alt="" class="player-avatar" />
																			{/if}
																			{#if isDoubles && cParticipantB?.partner?.photoURL}
																				<img src={cParticipantB.partner.photoURL} alt="" class="player-avatar" />
																			{/if}
																		</div>
																	{/if}
																	<span class="player-score">
																		{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																			{match.totalPointsB || match.gamesWonB || 0}
																		{/if}
																	</span>
																</div>
															</div>
														{/if}
													{/each}
												{/if}
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- SILVER BRACKET -->
				{#if silverBracket && silverBracket.rounds && silverBracket.rounds.length > 0}
					<div class="bracket-card silver-bracket">
						<div class="bracket-header silver">
							<h3 class="bracket-title">
								<span class="division-dot silver"></span>
								{m.bracket_silver()}{#if consolationEnabled && silverConsolationBrackets.length > 0} - {m.bracket_winners?.() || 'Ganadores'}{/if}
							</h3>
						</div>
						<div class="bracket-wrapper">
							<div class="bracket-grid">
								{#each silverBracket.rounds as round, roundIndex (round.name || roundIndex)}
									{@const isFinalRound = roundIndex === silverBracket.rounds.length - 1}
									<div class="bracket-column" class:has-next={roundIndex < silverBracket.rounds.length - 1} style="--round-index: {roundIndex}">
										<div class="round-header" class:final-round={isFinalRound}>
											<span class="round-name">{translateRoundName(round.name)}</span>
											{#if bracketScoringLabel}
												<span class="scoring-label">{bracketScoringLabel}</span>
											{/if}
										</div>
										<div class="round-matches">
											{#each round.matches as match (match.id)}
												{@const isByeA = isBye(match.participantA)}
												{@const isByeB = isBye(match.participantB)}
												{@const isByeMatchFlag = isByeA || isByeB}
												{@const winnerIsA = isByeB || match.winner === match.participantA}
												{@const winnerIsB = isByeA || (!isByeB && match.winner === match.participantB)}
												{@const participantA = getParticipant(match.participantA || '')}
												{@const participantB = getParticipant(match.participantB || '')}
												<div
													class="match-card"
													class:completed={match.status === 'COMPLETED' || match.status === 'WALKOVER'}
													class:in-progress={match.status === 'IN_PROGRESS'}
													class:pending={match.status === 'PENDING'}
													class:bye-match={isByeMatchFlag}
												>
													{#if match.status === 'IN_PROGRESS'}
														<div class="live-badge">
															<span class="live-pulse"></span>
															LIVE
														</div>
													{/if}
													<div class="match-player" class:winner={winnerIsA && !isByeMatchFlag} class:tbd={!match.participantA} class:bye={isByeA}>
														{#if match.seedA}
															<span class="seed">#{match.seedA}</span>
														{/if}
														<span class="player-name">
															{#if isByeA}
																BYE
															{:else}
																{getParticipantName(match.participantA || '')}
															{/if}
														</span>
														{#if !isByeA && (participantA?.photoURL || participantA?.partner?.photoURL)}
															<div class="player-avatars">
																{#if participantA?.photoURL}
																	<img src={participantA.photoURL} alt="" class="player-avatar" />
																{/if}
																{#if isDoubles && participantA?.partner?.photoURL}
																	<img src={participantA.partner.photoURL} alt="" class="player-avatar" />
																{/if}
															</div>
														{/if}
														{#if !isByeMatchFlag}
															<span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(match.id)}>
																{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																	{match.totalPointsA || match.gamesWonA || 0}
																{/if}
															</span>
														{/if}
													</div>
													<div class="match-divider"></div>
													<div class="match-player" class:winner={winnerIsB && !isByeMatchFlag} class:tbd={!match.participantB} class:bye={isByeB}>
														{#if match.seedB}
															<span class="seed">#{match.seedB}</span>
														{/if}
														<span class="player-name">
															{#if isByeB}
																BYE
															{:else}
																{getParticipantName(match.participantB || '')}
															{/if}
														</span>
														{#if !isByeB && (participantB?.photoURL || participantB?.partner?.photoURL)}
															<div class="player-avatars">
																{#if participantB?.photoURL}
																	<img src={participantB.photoURL} alt="" class="player-avatar" />
																{/if}
																{#if isDoubles && participantB?.partner?.photoURL}
																	<img src={participantB.partner.photoURL} alt="" class="player-avatar" />
																{/if}
															</div>
														{/if}
														{#if !isByeMatchFlag}
															<span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(match.id)}>
																{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																	{match.totalPointsB || match.gamesWonB || 0}
																{/if}
															</span>
														{/if}
													</div>
												</div>
											{/each}
											<!-- Pair connectors for next round -->
											{#if roundIndex < silverBracket.rounds.length - 1}
												{#each Array(Math.floor(round.matches.length / 2)) as _, pairIndex}
													<div class="pair-connector" style="--pair-index: {pairIndex}; --total-pairs: {Math.floor(round.matches.length / 2)}; --total-matches: {round.matches.length}"></div>
												{/each}
											{/if}
										</div>
									</div>
								{/each}

								<!-- Third Place Match Silver -->
								{#if silverBracket.thirdPlaceMatch && !isByeMatch(silverBracket.thirdPlaceMatch)}
									{@const tpm = silverBracket.thirdPlaceMatch}
									{@const tpmWinnerIsA = tpm.winner === tpm.participantA}
									{@const tpmWinnerIsB = tpm.winner === tpm.participantB}
									{@const tpmParticipantA = getParticipant(tpm.participantA || '')}
									{@const tpmParticipantB = getParticipant(tpm.participantB || '')}
									<div class="bracket-column third-place-column">
										<div class="round-header third-place-header">
											<span class="round-name">{m.tournament_thirdPlace?.() || '3º/4º'}</span>
										</div>
										<div class="round-matches">
											<div
												class="match-card"
												class:completed={tpm.status === 'COMPLETED' || tpm.status === 'WALKOVER'}
												class:in-progress={tpm.status === 'IN_PROGRESS'}
												class:pending={tpm.status === 'PENDING'}
											>
												{#if tpm.status === 'IN_PROGRESS'}
													<div class="live-badge">
														<span class="live-pulse"></span>
														LIVE
													</div>
												{/if}
												<div class="match-player" class:winner={tpmWinnerIsA} class:tbd={!tpm.participantA}>
													{#if tpm.seedA}
														<span class="seed">#{tpm.seedA}</span>
													{/if}
													<span class="player-name">{getParticipantName(tpm.participantA || '')}</span>
													{#if tpmParticipantA?.photoURL || tpmParticipantA?.partner?.photoURL}
														<div class="player-avatars">
															{#if tpmParticipantA?.photoURL}
																<img src={tpmParticipantA.photoURL} alt="" class="player-avatar" />
															{/if}
															{#if isDoubles && tpmParticipantA?.partner?.photoURL}
																<img src={tpmParticipantA.partner.photoURL} alt="" class="player-avatar" />
															{/if}
														</div>
													{/if}
													<span class="player-score" class:live={tpm.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(tpm.id)}>
														{#if tpm.status === 'COMPLETED' || tpm.status === 'WALKOVER' || tpm.status === 'IN_PROGRESS'}
															{tpm.totalPointsA || tpm.gamesWonA || 0}
														{/if}
													</span>
												</div>
												<div class="match-divider"></div>
												<div class="match-player" class:winner={tpmWinnerIsB} class:tbd={!tpm.participantB}>
													{#if tpm.seedB}
														<span class="seed">#{tpm.seedB}</span>
													{/if}
													<span class="player-name">{getParticipantName(tpm.participantB || '')}</span>
													{#if tpmParticipantB?.photoURL || tpmParticipantB?.partner?.photoURL}
														<div class="player-avatars">
															{#if tpmParticipantB?.photoURL}
																<img src={tpmParticipantB.photoURL} alt="" class="player-avatar" />
															{/if}
															{#if isDoubles && tpmParticipantB?.partner?.photoURL}
																<img src={tpmParticipantB.partner.photoURL} alt="" class="player-avatar" />
															{/if}
														</div>
													{/if}
													<span class="player-score" class:live={tpm.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(tpm.id)}>
														{#if tpm.status === 'COMPLETED' || tpm.status === 'WALKOVER' || tpm.status === 'IN_PROGRESS'}
															{tpm.totalPointsB || tpm.gamesWonB || 0}
														{/if}
													</span>
												</div>
											</div>
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Silver Consolation Brackets -->
					{#if consolationEnabled && silverConsolationBrackets.length > 0}
						<div class="consolation-section silver">
							<div class="consolation-header">
								<h3 class="consolation-main-title silver">
									<span class="division-dot silver"></span>
									{m.bracket_silver()} - {m.bracket_consolation?.() || 'Consolación'}
								</h3>
							</div>
							<div class="consolation-grid">
								{#each silverConsolationBrackets as cb, cbIndex (cb.positionLabel || cbIndex)}
									<div class="consolation-bracket">
										<div class="consolation-bracket-header">
											<span class="consolation-label">{cb.positionLabel || `${cbIndex + 5}º-${cbIndex + 8}º`}</span>
										</div>
										{#if cb.rounds}
											<div class="consolation-matches">
												{#each cb.rounds as round (round.name)}
													{@const visibleMatches = round.matches.filter((m: BracketMatch) => !isByeMatch(m))}
													{#if visibleMatches.length > 0}
														{#each round.matches as match (match.id)}
															{#if !isByeMatch(match)}
																{@const winnerIsA = match.winner === match.participantA}
																{@const winnerIsB = match.winner === match.participantB}
																{@const cParticipantA = getParticipant(match.participantA || '')}
																{@const cParticipantB = getParticipant(match.participantB || '')}
																<div
																	class="match-card compact"
																	class:completed={match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																	class:in-progress={match.status === 'IN_PROGRESS'}
																>
																	{#if match.status === 'IN_PROGRESS'}
																		<div class="live-badge compact">
																			<span class="live-pulse"></span>
																		</div>
																	{/if}
																	<div class="match-player" class:winner={winnerIsA} class:tbd={!match.participantA}>
																		{#if match.seedA}
																			<span class="seed">#{match.seedA}</span>
																		{/if}
																		<span class="player-name">{getParticipantName(match.participantA || '')}</span>
																		{#if cParticipantA?.photoURL || cParticipantA?.partner?.photoURL}
																			<div class="player-avatars">
																				{#if cParticipantA?.photoURL}
																					<img src={cParticipantA.photoURL} alt="" class="player-avatar" />
																				{/if}
																				{#if isDoubles && cParticipantA?.partner?.photoURL}
																					<img src={cParticipantA.partner.photoURL} alt="" class="player-avatar" />
																				{/if}
																			</div>
																		{/if}
																		<span class="player-score">
																			{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																				{match.totalPointsA || match.gamesWonA || 0}
																			{/if}
																		</span>
																	</div>
																	<div class="match-divider"></div>
																	<div class="match-player" class:winner={winnerIsB} class:tbd={!match.participantB}>
																		{#if match.seedB}
																			<span class="seed">#{match.seedB}</span>
																		{/if}
																		<span class="player-name">{getParticipantName(match.participantB || '')}</span>
																		{#if cParticipantB?.photoURL || cParticipantB?.partner?.photoURL}
																			<div class="player-avatars">
																				{#if cParticipantB?.photoURL}
																					<img src={cParticipantB.photoURL} alt="" class="player-avatar" />
																				{/if}
																				{#if isDoubles && cParticipantB?.partner?.photoURL}
																					<img src={cParticipantB.partner.photoURL} alt="" class="player-avatar" />
																				{/if}
																			</div>
																		{/if}
																		<span class="player-score">
																			{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																				{match.totalPointsB || match.gamesWonB || 0}
																			{/if}
																		</span>
																	</div>
																</div>
															{/if}
														{/each}
													{/if}
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			{:else if isParallelBrackets && parallelBrackets.length > 0}
				<!-- Parallel Brackets: Show selected bracket -->
				{@const currentPB = parallelBrackets[activeParallelBracket]}
				{#if currentPB?.bracket?.rounds && currentPB.bracket.rounds.length > 0}
					<div class="bracket-card">
						<div class="bracket-header">
							<h3 class="bracket-title">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
								</svg>
								{currentPB.name}
							</h3>
						</div>
						<div class="bracket-wrapper">
							<div class="bracket-grid">
								{#each currentPB.bracket.rounds as round, roundIndex (round.name || roundIndex)}
									{@const isFinalRound = roundIndex === currentPB.bracket.rounds.length - 1}
									<div class="bracket-column" class:has-next={roundIndex < currentPB.bracket.rounds.length - 1} style="--round-index: {roundIndex}">
										<div class="round-header" class:final-round={isFinalRound}>
											<span class="round-name">{translateRoundName(round.name)}</span>
											{#if bracketScoringLabel}
												<span class="scoring-label">{bracketScoringLabel}</span>
											{/if}
										</div>
										<div class="round-matches">
											{#each round.matches as match (match.id)}
												{@const isByeA = isBye(match.participantA)}
												{@const isByeB = isBye(match.participantB)}
												{@const isByeMatchFlag = isByeA || isByeB}
												{@const winnerIsA = isByeB || match.winner === match.participantA}
												{@const winnerIsB = isByeA || (!isByeB && match.winner === match.participantB)}
												{@const participantA = getParticipant(match.participantA || '')}
												{@const participantB = getParticipant(match.participantB || '')}
												<div
													class="match-card"
													class:completed={match.status === 'COMPLETED' || match.status === 'WALKOVER'}
													class:in-progress={match.status === 'IN_PROGRESS'}
													class:pending={match.status === 'PENDING'}
													class:bye-match={isByeMatchFlag}
												>
													{#if match.status === 'IN_PROGRESS'}
														<div class="live-badge">
															<span class="live-pulse"></span>
															LIVE
														</div>
													{/if}
													<div class="match-player" class:winner={winnerIsA && !isByeMatchFlag} class:tbd={!match.participantA} class:bye={isByeA}>
														{#if match.seedA}
															<span class="seed">#{match.seedA}</span>
														{/if}
														<span class="player-name">
															{#if isByeA}
																BYE
															{:else}
																{getParticipantName(match.participantA || '')}
															{/if}
														</span>
														{#if !isByeA && (participantA?.photoURL || participantA?.partner?.photoURL)}
															<div class="player-avatars">
																{#if participantA?.photoURL}
																	<img src={participantA.photoURL} alt="" class="player-avatar" />
																{/if}
																{#if isDoubles && participantA?.partner?.photoURL}
																	<img src={participantA.partner.photoURL} alt="" class="player-avatar" />
																{/if}
															</div>
														{/if}
														{#if !isByeMatchFlag}
															<span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(match.id)}>
																{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																	{match.totalPointsA || match.gamesWonA || 0}
																{/if}
															</span>
														{/if}
													</div>
													<div class="match-divider"></div>
													<div class="match-player" class:winner={winnerIsB && !isByeMatchFlag} class:tbd={!match.participantB} class:bye={isByeB}>
														{#if match.seedB}
															<span class="seed">#{match.seedB}</span>
														{/if}
														<span class="player-name">
															{#if isByeB}
																BYE
															{:else}
																{getParticipantName(match.participantB || '')}
															{/if}
														</span>
														{#if !isByeB && (participantB?.photoURL || participantB?.partner?.photoURL)}
															<div class="player-avatars">
																{#if participantB?.photoURL}
																	<img src={participantB.photoURL} alt="" class="player-avatar" />
																{/if}
																{#if isDoubles && participantB?.partner?.photoURL}
																	<img src={participantB.partner.photoURL} alt="" class="player-avatar" />
																{/if}
															</div>
														{/if}
														{#if !isByeMatchFlag}
															<span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(match.id)}>
																{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																	{match.totalPointsB || match.gamesWonB || 0}
																{/if}
															</span>
														{/if}
													</div>
												</div>
											{/each}
											{#if roundIndex < currentPB.bracket.rounds.length - 1}
												{#each Array(Math.floor(round.matches.length / 2)) as _, pairIndex}
													<div class="pair-connector" style="--pair-index: {pairIndex}; --total-pairs: {Math.floor(round.matches.length / 2)}; --total-matches: {round.matches.length}"></div>
												{/each}
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			{:else if goldBracket && goldBracket.rounds && goldBracket.rounds.length > 0}
				<!-- Single Bracket (no split, no parallel) -->
				<div class="bracket-card">
					<div class="bracket-header">
						<h3 class="bracket-title">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
							</svg>
							{m.bracket_winners?.() || 'Cuadro Principal'}
						</h3>
					</div>
					<div class="bracket-wrapper">
						<div class="bracket-grid">
							{#each goldBracket.rounds as round, roundIndex (round.name || roundIndex)}
								{@const isFinalRound = roundIndex === goldBracket.rounds.length - 1}
								<div class="bracket-column" class:has-next={roundIndex < goldBracket.rounds.length - 1} style="--round-index: {roundIndex}">
									<div class="round-header" class:final-round={isFinalRound}>
										<span class="round-name">{translateRoundName(round.name)}</span>
											{#if bracketScoringLabel}
												<span class="scoring-label">{bracketScoringLabel}</span>
											{/if}
									</div>
									<div class="round-matches">
										{#each round.matches as match (match.id)}
											{@const isByeA = isBye(match.participantA)}
											{@const isByeB = isBye(match.participantB)}
											{@const isByeMatchFlag = isByeA || isByeB}
											{@const winnerIsA = isByeB || match.winner === match.participantA}
											{@const winnerIsB = isByeA || (!isByeB && match.winner === match.participantB)}
											{@const participantA = getParticipant(match.participantA || '')}
											{@const participantB = getParticipant(match.participantB || '')}
											<div
												class="match-card"
												class:completed={match.status === 'COMPLETED' || match.status === 'WALKOVER'}
												class:in-progress={match.status === 'IN_PROGRESS'}
												class:pending={match.status === 'PENDING'}
												class:bye-match={isByeMatchFlag}
											>
												{#if match.status === 'IN_PROGRESS'}
													<div class="live-badge">
														<span class="live-pulse"></span>
														LIVE
													</div>
												{/if}
												<div class="match-player" class:winner={winnerIsA && !isByeMatchFlag} class:tbd={!match.participantA} class:bye={isByeA}>
													{#if match.seedA}
														<span class="seed">#{match.seedA}</span>
													{/if}
													<span class="player-name">
														{#if isByeA}
															BYE
														{:else}
															{getParticipantName(match.participantA || '')}
														{/if}
													</span>
													{#if !isByeA && (participantA?.photoURL || participantA?.partner?.photoURL)}
														<div class="player-avatars">
															{#if participantA?.photoURL}
																<img src={participantA.photoURL} alt="" class="player-avatar" />
															{/if}
															{#if isDoubles && participantA?.partner?.photoURL}
																<img src={participantA.partner.photoURL} alt="" class="player-avatar" />
															{/if}
														</div>
													{/if}
													{#if !isByeMatchFlag}
														<span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(match.id)}>
															{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																{match.totalPointsA || match.gamesWonA || 0}
															{/if}
														</span>
													{/if}
												</div>
												<div class="match-divider"></div>
												<div class="match-player" class:winner={winnerIsB && !isByeMatchFlag} class:tbd={!match.participantB} class:bye={isByeB}>
													{#if match.seedB}
														<span class="seed">#{match.seedB}</span>
													{/if}
													<span class="player-name">
														{#if isByeB}
															BYE
														{:else}
															{getParticipantName(match.participantB || '')}
														{/if}
													</span>
													{#if !isByeB && (participantB?.photoURL || participantB?.partner?.photoURL)}
														<div class="player-avatars">
															{#if participantB?.photoURL}
																<img src={participantB.photoURL} alt="" class="player-avatar" />
															{/if}
															{#if isDoubles && participantB?.partner?.photoURL}
																<img src={participantB.partner.photoURL} alt="" class="player-avatar" />
															{/if}
														</div>
													{/if}
													{#if !isByeMatchFlag}
														<span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(match.id)}>
															{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																{match.totalPointsB || match.gamesWonB || 0}
															{/if}
														</span>
													{/if}
												</div>
											</div>
										{/each}
										{#if roundIndex < goldBracket.rounds.length - 1}
											{#each Array(Math.floor(round.matches.length / 2)) as _, pairIndex}
												<div class="pair-connector" style="--pair-index: {pairIndex}; --total-pairs: {Math.floor(round.matches.length / 2)}; --total-matches: {round.matches.length}"></div>
											{/each}
										{/if}
									</div>
								</div>
							{/each}

							<!-- Third Place Match -->
							{#if goldBracket.thirdPlaceMatch && !isByeMatch(goldBracket.thirdPlaceMatch)}
								{@const tpm = goldBracket.thirdPlaceMatch}
								{@const tpmWinnerIsA = tpm.winner === tpm.participantA}
								{@const tpmWinnerIsB = tpm.winner === tpm.participantB}
								{@const tpmParticipantA = getParticipant(tpm.participantA || '')}
								{@const tpmParticipantB = getParticipant(tpm.participantB || '')}
								<div class="bracket-column third-place-column">
									<div class="round-header third-place-header">
										<span class="round-name">{m.tournament_thirdPlace?.() || '3º/4º'}</span>
									</div>
									<div class="round-matches">
										<div
											class="match-card"
											class:completed={tpm.status === 'COMPLETED' || tpm.status === 'WALKOVER'}
											class:in-progress={tpm.status === 'IN_PROGRESS'}
											class:pending={tpm.status === 'PENDING'}
										>
											{#if tpm.status === 'IN_PROGRESS'}
												<div class="live-badge">
													<span class="live-pulse"></span>
													LIVE
												</div>
											{/if}
											<div class="match-player" class:winner={tpmWinnerIsA} class:tbd={!tpm.participantA}>
												{#if tpm.seedA}
													<span class="seed">#{tpm.seedA}</span>
												{/if}
												<span class="player-name">{getParticipantName(tpm.participantA || '')}</span>
												{#if tpmParticipantA?.photoURL || tpmParticipantA?.partner?.photoURL}
													<div class="player-avatars">
														{#if tpmParticipantA?.photoURL}
															<img src={tpmParticipantA.photoURL} alt="" class="player-avatar" />
														{/if}
														{#if isDoubles && tpmParticipantA?.partner?.photoURL}
															<img src={tpmParticipantA.partner.photoURL} alt="" class="player-avatar" />
														{/if}
													</div>
												{/if}
												<span class="player-score" class:live={tpm.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(tpm.id)}>
													{#if tpm.status === 'COMPLETED' || tpm.status === 'WALKOVER' || tpm.status === 'IN_PROGRESS'}
														{tpm.totalPointsA || tpm.gamesWonA || 0}
													{/if}
												</span>
											</div>
											<div class="match-divider"></div>
											<div class="match-player" class:winner={tpmWinnerIsB} class:tbd={!tpm.participantB}>
												{#if tpm.seedB}
													<span class="seed">#{tpm.seedB}</span>
												{/if}
												<span class="player-name">{getParticipantName(tpm.participantB || '')}</span>
												{#if tpmParticipantB?.photoURL || tpmParticipantB?.partner?.photoURL}
													<div class="player-avatars">
														{#if tpmParticipantB?.photoURL}
															<img src={tpmParticipantB.photoURL} alt="" class="player-avatar" />
														{/if}
														{#if isDoubles && tpmParticipantB?.partner?.photoURL}
															<img src={tpmParticipantB.partner.photoURL} alt="" class="player-avatar" />
														{/if}
													</div>
												{/if}
												<span class="player-score" class:live={tpm.status === 'IN_PROGRESS'} class:score-changed={hasScoreChanged(tpm.id)}>
													{#if tpm.status === 'COMPLETED' || tpm.status === 'WALKOVER' || tpm.status === 'IN_PROGRESS'}
														{tpm.totalPointsB || tpm.gamesWonB || 0}
													{/if}
												</span>
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Single Bracket Consolation -->
				{#if consolationEnabled && goldConsolationBrackets.length > 0}
					<div class="consolation-section">
						<div class="consolation-header">
							<h3 class="consolation-main-title">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="12" r="10"/>
									<path d="M12 6v6l4 2"/>
								</svg>
								{m.bracket_consolation?.() || 'Consolación'}
							</h3>
						</div>
						<div class="consolation-grid">
							{#each goldConsolationBrackets as cb, cbIndex (cb.positionLabel || cbIndex)}
								<div class="consolation-bracket">
									<div class="consolation-bracket-header">
										<span class="consolation-label">{cb.positionLabel || `${cbIndex + 5}º-${cbIndex + 8}º`}</span>
									</div>
									{#if cb.rounds}
										<div class="consolation-matches">
											{#each cb.rounds as round (round.name)}
												{@const visibleMatches = round.matches.filter((m: BracketMatch) => !isByeMatch(m))}
												{#if visibleMatches.length > 0}
													{#each round.matches as match (match.id)}
														{#if !isByeMatch(match)}
															{@const winnerIsA = match.winner === match.participantA}
															{@const winnerIsB = match.winner === match.participantB}
															{@const cParticipantA = getParticipant(match.participantA || '')}
															{@const cParticipantB = getParticipant(match.participantB || '')}
															<div
																class="match-card compact"
																class:completed={match.status === 'COMPLETED' || match.status === 'WALKOVER'}
																class:in-progress={match.status === 'IN_PROGRESS'}
															>
																{#if match.status === 'IN_PROGRESS'}
																	<div class="live-badge compact">
																		<span class="live-pulse"></span>
																	</div>
																{/if}
																<div class="match-player" class:winner={winnerIsA} class:tbd={!match.participantA}>
																	{#if match.seedA}
																		<span class="seed">#{match.seedA}</span>
																	{/if}
																	<span class="player-name">{getParticipantName(match.participantA || '')}</span>
																	{#if cParticipantA?.photoURL || cParticipantA?.partner?.photoURL}
																		<div class="player-avatars">
																			{#if cParticipantA?.photoURL}
																				<img src={cParticipantA.photoURL} alt="" class="player-avatar" />
																			{/if}
																			{#if isDoubles && cParticipantA?.partner?.photoURL}
																				<img src={cParticipantA.partner.photoURL} alt="" class="player-avatar" />
																			{/if}
																		</div>
																	{/if}
																	<span class="player-score">
																		{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																			{match.totalPointsA || match.gamesWonA || 0}
																		{/if}
																	</span>
																</div>
																<div class="match-divider"></div>
																<div class="match-player" class:winner={winnerIsB} class:tbd={!match.participantB}>
																	{#if match.seedB}
																		<span class="seed">#{match.seedB}</span>
																	{/if}
																	<span class="player-name">{getParticipantName(match.participantB || '')}</span>
																	{#if cParticipantB?.photoURL || cParticipantB?.partner?.photoURL}
																		<div class="player-avatars">
																			{#if cParticipantB?.photoURL}
																				<img src={cParticipantB.photoURL} alt="" class="player-avatar" />
																			{/if}
																			{#if isDoubles && cParticipantB?.partner?.photoURL}
																				<img src={cParticipantB.partner.photoURL} alt="" class="player-avatar" />
																			{/if}
																		</div>
																	{/if}
																	<span class="player-score">
																		{#if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
																			{match.totalPointsB || match.gamesWonB || 0}
																		{/if}
																	</span>
																</div>
															</div>
														{/if}
													{/each}
												{/if}
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{:else}
				<div class="empty-bracket-state">
					<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
					</svg>
					<p>{m.tournament_noMatchesToShow?.() || 'No hay partidos para mostrar'}</p>
				</div>
			{/if}
		</div>
	{:else}
		<!-- No data state -->
		<div class="empty-state">
			<div class="empty-icon">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			</div>
			<p>{m.tournament_noDataAvailable?.() || 'No hay datos disponibles'}</p>
		</div>
	{/if}
</div>

<style>
	.live-view {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.5; transform: scale(0.8); }
	}

	/* Compact Info Bar */
	.info-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 8px;
	}

	.info-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.info-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.3rem 0.7rem;
		background: #0f1419;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 500;
		color: #8b9bb3;
		white-space: nowrap;
	}

	.info-chip.phase {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.15) 100%);
		color: #a5b4fc;
		font-weight: 600;
	}

	.info-chip.tier-MAJOR { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.info-chip.tier-NATIONAL { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
	.info-chip.tier-REGIONAL { background: rgba(16, 185, 129, 0.15); color: #10b981; }
	.info-chip.tier-CLUB { background: rgba(107, 122, 148, 0.15); color: #8b9bb3; }

	.info-chip.live-chip {
		gap: 0.35rem;
		background: rgba(245, 158, 11, 0.15);
		color: #f59e0b;
		font-weight: 600;
	}

	.pulse-dot-mini {
		width: 6px;
		height: 6px;
		background: #f59e0b;
		border-radius: 50%;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.progress-inline {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.progress-bar-mini {
		width: 60px;
		height: 4px;
		background: #2d3748;
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill-mini {
		height: 100%;
		background: #667eea;
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.progress-fill-mini.complete {
		background: #10b981;
	}

	.progress-text-mini {
		font-size: 0.75rem;
		font-weight: 500;
		color: #8b9bb3;
		white-space: nowrap;
	}

	.progress-label-mini {
		font-size: 0.75rem;
		font-weight: 600;
		color: #6b7a94;
		white-space: nowrap;
	}

	/* Two Column Layout */
	.group-content.two-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.column {
		min-width: 0;
	}

	.column-title {
		margin: 0 0 0.5rem 0;
		font-size: 0.7rem;
		font-weight: 700;
		color: #8b9bb3;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	@media (max-width: 900px) {
		.group-content.two-columns {
			grid-template-columns: 1fr;
		}
	}


	/* Groups Container */
	.groups-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Group Card */
	.group-card {
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 12px;
		overflow: hidden;
	}

	.group-card.complete {
		border-color: rgba(16, 185, 129, 0.3);
	}

	.group-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 0.75rem 1rem;
		background: #0f1419;
		border: none;
		cursor: pointer;
		transition: background 0.2s;
	}

	.group-header:hover {
		background: #151c28;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.expand-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #8b9bb3;
		transition: transform 0.2s;
	}

	.expand-icon.rotated {
		transform: rotate(90deg);
	}

	.expand-icon.small {
		width: 16px;
		height: 16px;
	}

	.group-name {
		font-size: 0.9rem;
		font-weight: 700;
		color: #e1e8ed;
	}

	.complete-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		border-radius: 50%;
		color: white;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.progress-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #8b9bb3;
	}

	.mini-progress-bar {
		width: 60px;
		height: 4px;
		background: #2d3748;
		border-radius: 2px;
		overflow: hidden;
	}

	.mini-progress-fill {
		height: 100%;
		background: #667eea;
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.mini-progress-fill.complete {
		background: #10b981;
	}

	.group-content {
		padding: 1rem;
		border-top: 1px solid #2d3748;
	}

	/* Standings Table */
	.standings-table {
		width: 100%;
		overflow-x: auto;
		background: #0f1419;
		border-radius: 8px;
	}

	.standings-table table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.75rem;
	}

	.standings-table thead {
		background: #1a2332;
	}

	.standings-table th {
		padding: 0.5rem 0.4rem;
		text-align: left;
		font-weight: 600;
		color: #8b9bb3;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		border-bottom: 1px solid #2d3748;
	}

	.standings-table th.pos-col { width: 36px; text-align: center; }
	.standings-table th.name-col { min-width: 100px; }
	.standings-table th.wins-col,
	.standings-table th.points-col,
	.standings-table th.total-points-col,
	.standings-table th.twenties-col { width: 40px; text-align: center; }

	.standings-table th.primary {
		background: rgba(16, 185, 129, 0.15);
		color: #10b981;
	}

	.standings-table tbody tr {
		border-bottom: 1px solid #1a2332;
		transition: background-color 0.15s;
	}

	.standings-table tbody tr:nth-child(odd) { background: #0f1419; }
	.standings-table tbody tr:nth-child(even) { background: #151c28; }
	.standings-table tbody tr:hover { background: #1a2332; }

	.standings-table td {
		padding: 0.5rem 0.4rem;
		color: #e1e8ed;
	}

	.standings-table td.pos-col,
	.standings-table td.wins-col,
	.standings-table td.points-col,
	.standings-table td.total-points-col,
	.standings-table td.twenties-col { text-align: center; }

	.standings-table td.primary {
		background: rgba(16, 185, 129, 0.1);
		font-weight: 700;
		color: #10b981;
	}

	.position-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 4px;
		background: #2d3748;
		color: #8b9bb3;
		font-weight: 700;
		font-size: 0.7rem;
	}

	.participant-name {
		font-weight: 500;
	}

	/* Registered User Indicators */
	.registered-check {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-left: 0.25rem;
		font-size: 0.65rem;
		color: #10b981;
		font-weight: 700;
	}

	.registered-indicators {
		display: inline-flex;
		gap: 0.15rem;
		margin-left: 0.35rem;
	}

	.doubles-names {
		display: inline;
	}

	.doubles-names .separator {
		color: #8b9bb3;
		margin: 0 0.2rem;
	}

	.team-name-label {
		display: inline;
		margin-left: 0.35rem;
		font-size: 0.7rem;
		font-style: italic;
		color: #6b7a94;
	}

	:global([data-theme='light']) .registered-check,
	:global([data-theme='violet-light']) .registered-check {
		color: #059669;
	}

	:global([data-theme='light']) .doubles-names .separator,
	:global([data-theme='violet-light']) .doubles-names .separator {
		color: #64748b;
	}

	:global([data-theme='light']) .team-name-label,
	:global([data-theme='violet-light']) .team-name-label {
		color: #64748b;
	}

	/* Rounds Container */
	.rounds-container {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.round-section {
		background: #0f1419;
		border-radius: 8px;
		overflow: hidden;
	}

	.round-section.complete {
		border-left: 3px solid #10b981;
	}

	.round-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 0.6rem 0.75rem;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background 0.15s;
	}

	.round-header:hover {
		background: #1a2332;
	}

	.round-left {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.round-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: #e1e8ed;
	}

	.round-complete-icon {
		display: flex;
		align-items: center;
		color: #10b981;
	}

	.round-progress {
		font-size: 0.75rem;
		font-weight: 500;
		color: #8b9bb3;
	}

	.matches-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border-top: 1px solid #1a2332;
	}

	/* Transition State */
	.transition-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2.5rem 1rem;
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 12px;
		text-align: center;
	}

	.transition-icon {
		color: #667eea;
		margin-bottom: 1rem;
		animation: spin 3s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.transition-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		font-weight: 700;
		color: #e1e8ed;
	}

	.transition-desc {
		margin: 0;
		font-size: 0.85rem;
		color: #8b9bb3;
	}

	/* Empty State */
	.empty-state,
	.empty-bracket-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		background: #1a2332;
		border: 1px dashed #2d3748;
		border-radius: 12px;
		text-align: center;
	}

	.empty-icon {
		color: #6b7a94;
		margin-bottom: 0.75rem;
	}

	.empty-state p,
	.empty-bracket-state p {
		margin: 0;
		font-size: 0.9rem;
		color: #6b7a94;
	}

	/* ======================= */
	/* BRACKET STYLES          */
	/* ======================= */

	.bracket-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.info-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	/* Division Tabs */
	.division-tabs {
		display: flex;
		gap: 0;
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 10px;
		padding: 0.25rem;
		overflow: hidden;
	}

	.division-tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.65rem 1.25rem;
		background: transparent;
		border: none;
		border-radius: 8px;
		font-size: 0.85rem;
		font-weight: 600;
		color: #8b9bb3;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.division-tab:hover {
		background: rgba(102, 126, 234, 0.1);
		color: #e1e8ed;
	}

	.division-tab.active {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
	}

	.division-indicator {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.division-indicator.gold { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
	.division-indicator.silver { background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%); }

	.division-label {
		font-weight: 600;
	}

	/* Bracket Card */
	.bracket-card {
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 12px;
	}

	.bracket-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: #0f1419;
		border-bottom: 1px solid #2d3748;
		border-radius: 12px 12px 0 0;
	}

	.bracket-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		color: #e1e8ed;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.bracket-title svg {
		color: #667eea;
	}

	/* Bracket Wrapper */
	.bracket-wrapper {
		overflow-x: auto;
		padding: 1rem;
	}

	.bracket-grid {
		display: flex;
		gap: 4rem;
		min-width: max-content;
		padding: 0.5rem 0;
	}

	.bracket-column {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 270px;
		position: relative;
	}

	.bracket-column.third-place-column {
		border-left: 2px dashed #2d3748;
		padding-left: 1.5rem;
		margin-left: 1rem;
	}

	.round-header {
		padding: 0.5rem 0.75rem;
		background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 15%, transparent) 0%, color-mix(in srgb, var(--primary) 10%, transparent) 100%);
		border-radius: 6px;
		text-align: center;
	}

	.round-header.third-place-header {
		background: linear-gradient(135deg, rgba(180, 83, 9, 0.15) 0%, rgba(146, 64, 14, 0.1) 100%);
	}

	.round-header.final-round {
		background: linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(202, 138, 4, 0.15) 100%);
	}

	.round-header .round-name {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.third-place-header .round-name {
		color: #b45309;
	}

	.final-round .round-name {
		color: #eab308;
	}

	.scoring-label {
		font-size: 0.55rem;
		font-weight: 600;
		color: #8b9bb3;
		background: rgba(255, 255, 255, 0.08);
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		margin-left: 0.4rem;
		letter-spacing: 0.02em;
	}

	.round-matches {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		position: relative;
		flex: 1;
		justify-content: space-around;
	}

	/* Match Card */
	.match-card {
		position: relative;
		background: #0f1419;
		border: 1px solid #2d3748;
		border-radius: 8px;
		overflow: visible;
		transition: all 0.2s ease;
	}

	.match-card.compact {
		min-width: 160px;
	}

	.match-card.pending {
		opacity: 0.7;
	}

	.match-card.completed {
		border-left: 3px solid #10b981;
	}

	.match-card.in-progress {
		border-left: 3px solid #f59e0b;
		background: rgba(245, 158, 11, 0.05);
		box-shadow: 0 0 12px rgba(245, 158, 11, 0.15);
	}

	.match-card.bye-match {
		opacity: 0.5;
		border-left: 2px dashed #4a5568;
	}

	.match-player.bye {
		font-style: italic;
	}

	.match-player.bye .player-name {
		color: #6b7a94;
	}

	/* Bracket connector lines */
	/* Horizontal line going right from each match */
	.bracket-column.has-next .match-card::after {
		content: '';
		position: absolute;
		left: 100%;
		top: 50%;
		width: 2rem;
		height: 2px;
		background: #667eea;
		transform: translateY(-50%);
		z-index: 0;
	}

	/* Vertical connector lines for pairs of matches */
	.bracket-column.has-next .match-card::before {
		content: '';
		position: absolute;
		left: calc(100% + 2rem);
		width: 2px;
		background: #667eea;
		z-index: 0;
	}

	/* Top match in pair - vertical line goes down */
	.bracket-column.has-next .match-card:nth-child(odd)::before {
		top: 50%;
	}

	/* Bottom match in pair - vertical line goes up */
	.bracket-column.has-next .match-card:nth-child(even)::before {
		bottom: 50%;
	}

	/* Dynamic vertical line height based on round index */
	.bracket-column[style*="--round-index: 0"].has-next .match-card::before {
		height: calc(100% + 0.5rem);
	}
	.bracket-column[style*="--round-index: 1"].has-next .match-card::before {
		height: calc(200% + 1.5rem);
	}
	.bracket-column[style*="--round-index: 2"].has-next .match-card::before {
		height: calc(400% + 3.5rem);
	}
	.bracket-column[style*="--round-index: 3"].has-next .match-card::before {
		height: calc(800% + 7.5rem);
	}

	/* Hide vertical line for single match columns (finals) */
	.round-matches:has(> .match-card:only-child) .match-card::before {
		display: none;
	}

	/* Horizontal connector from vertical junction to next round */
	.pair-connector {
		position: absolute;
		width: 2rem;
		height: 2px;
		background: #667eea;
		right: -4rem;
		z-index: 1;
		top: calc((var(--pair-index) * 2 + 1) / var(--total-matches) * 100%);
	}

	/* Hide connectors from last column (including third place) */
	.bracket-column:last-child .match-card::after,
	.bracket-column:last-child .match-card::before,
	.bracket-column.third-place-column .match-card::after,
	.bracket-column.third-place-column .match-card::before {
		display: none;
	}

	/* No connectors in consolation section */
	.consolation-section .match-card::after,
	.consolation-section .match-card::before {
		display: none;
	}

	/* Live Badge */
	.live-badge {
		position: absolute;
		bottom: -0.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.5rem;
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
		border-radius: 4px;
		font-size: 0.6rem;
		font-weight: 700;
		color: white;
		letter-spacing: 0.05em;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		z-index: 10;
	}

	.live-badge.compact {
		padding: 0.15rem 0.35rem;
	}

	.live-pulse {
		width: 6px;
		height: 6px;
		background: white;
		border-radius: 50%;
		animation: pulse 1.5s ease-in-out infinite;
	}

	/* Match Player Row */
	.match-player {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		transition: background 0.15s ease;
	}

	.match-card.compact .match-player {
		padding: 0.4rem 0.6rem;
	}

	.match-player:first-child {
		border-bottom: 1px solid #2d3748;
	}

	.match-player.winner {
		background: rgba(16, 185, 129, 0.1);
	}

	.match-player.winner .player-name {
		color: #10b981;
		font-weight: 700;
	}

	.match-player.tbd {
		opacity: 0.5;
	}

	.player-name {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
		font-size: 0.8rem;
		font-weight: 500;
		color: #e1e8ed;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.match-card.compact .player-name {
		font-size: 0.75rem;
	}

	.verified {
		font-size: 0.65rem;
		color: #10b981;
		font-weight: 700;
	}

	.seed {
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 600;
		color: #6b7a94;
		margin-right: 0.25rem;
	}

	.player-avatars {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		flex-shrink: 0;
		margin-left: auto;
		margin-right: 0.5rem;
	}

	.player-avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		object-fit: cover;
		border: 1.5px solid #2d3748;
	}

	.match-card.compact .player-avatar {
		width: 18px;
		height: 18px;
	}

	.match-player.winner .player-avatar {
		border-color: #10b981;
	}

	.player-score {
		font-size: 0.9rem;
		font-weight: 700;
		color: #e1e8ed;
		min-width: 20px;
		text-align: center;
	}

	.player-score.live {
		color: #f59e0b;
		animation: pulse-score 2s ease-in-out infinite;
	}

	.player-score.score-changed {
		animation: score-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
		color: #10b981 !important;
	}

	@keyframes pulse-score {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	@keyframes score-pop {
		0% { transform: scale(1); }
		30% { transform: scale(1.4); }
		100% { transform: scale(1); }
	}

	.match-divider {
		display: none;
	}

	/* Consolation Section */
	.consolation-section {
		background: #1a2332;
		border: 1px solid #2d3748;
		border-radius: 12px;
	}

	.consolation-section .consolation-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: #0f1419;
		border-bottom: 1px solid #2d3748;
		border-radius: 12px 12px 0 0;
	}

	.consolation-main-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		color: #8b9bb3;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.consolation-main-title svg {
		color: #8b9bb3;
	}

	.consolation-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		padding: 1rem;
	}

	.consolation-bracket {
		background: #0f1419;
		border: 1px solid #2d3748;
		border-radius: 8px;
		overflow: hidden;
	}

	.consolation-bracket-header {
		padding: 0.5rem 0.75rem;
		background: rgba(139, 155, 179, 0.1);
		border-bottom: 1px solid #2d3748;
	}

	.consolation-label {
		font-size: 0.7rem;
		font-weight: 700;
		color: #8b9bb3;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.consolation-matches {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
	}

	/* Light & Violet-Light themes */
	:global([data-theme='light']) .info-bar,
	:global([data-theme='violet-light']) .info-bar,
	:global([data-theme='light']) .group-card,
	:global([data-theme='violet-light']) .group-card,
	:global([data-theme='light']) .transition-state,
	:global([data-theme='violet-light']) .transition-state,
	:global([data-theme='light']) .empty-state,
	:global([data-theme='violet-light']) .empty-state {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .info-chip,
	:global([data-theme='violet-light']) .info-chip {
		background: #f7fafc;
		color: #4a5568;
	}

	:global([data-theme='light']) .info-chip.phase,
	:global([data-theme='violet-light']) .info-chip.phase {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.08) 100%);
		color: #667eea;
	}

	:global([data-theme='light']) .progress-bar-mini,
	:global([data-theme='violet-light']) .progress-bar-mini {
		background: #e2e8f0;
	}

	:global([data-theme='light']) .progress-text-mini,
	:global([data-theme='violet-light']) .progress-text-mini,
	:global([data-theme='light']) .progress-label-mini,
	:global([data-theme='violet-light']) .progress-label-mini {
		color: #718096;
	}

	:global([data-theme='light']) .group-name,
	:global([data-theme='violet-light']) .group-name,
	:global([data-theme='light']) .round-name,
	:global([data-theme='violet-light']) .round-name,
	:global([data-theme='light']) .transition-title,
	:global([data-theme='violet-light']) .transition-title {
		color: #1a202c;
	}

	:global([data-theme='light']) .column-title,
	:global([data-theme='violet-light']) .column-title {
		color: #4a5568;
	}

	:global([data-theme='light']) .progress-label,
	:global([data-theme='violet-light']) .progress-label,
	:global([data-theme='light']) .round-progress,
	:global([data-theme='violet-light']) .round-progress,
	:global([data-theme='light']) .transition-desc,
	:global([data-theme='violet-light']) .transition-desc {
		color: #718096;
	}


	:global([data-theme='light']) .group-header,
	:global([data-theme='violet-light']) .group-header {
		background: #f7fafc;
	}

	:global([data-theme='light']) .group-header:hover,
	:global([data-theme='violet-light']) .group-header:hover {
		background: #edf2f7;
	}

	:global([data-theme='light']) .expand-icon,
	:global([data-theme='violet-light']) .expand-icon {
		color: #718096;
	}

	:global([data-theme='light']) .group-content,
	:global([data-theme='violet-light']) .group-content {
		border-top-color: #e2e8f0;
	}

	:global([data-theme='light']) .progress-bar-mini,
	:global([data-theme='violet-light']) .progress-bar-mini,
	:global([data-theme='light']) .mini-progress-bar,
	:global([data-theme='violet-light']) .mini-progress-bar {
		background: #e2e8f0;
	}

	:global([data-theme='light']) .standings-table,
	:global([data-theme='violet-light']) .standings-table {
		background: #ffffff;
	}

	:global([data-theme='light']) .standings-table thead,
	:global([data-theme='violet-light']) .standings-table thead {
		background: #f7fafc;
	}

	:global([data-theme='light']) .standings-table th,
	:global([data-theme='violet-light']) .standings-table th {
		color: #718096;
		border-bottom-color: #e2e8f0;
	}

	:global([data-theme='light']) .standings-table tbody tr:nth-child(odd),
	:global([data-theme='violet-light']) .standings-table tbody tr:nth-child(odd) { background: #ffffff; }
	:global([data-theme='light']) .standings-table tbody tr:nth-child(even),
	:global([data-theme='violet-light']) .standings-table tbody tr:nth-child(even) { background: #f7fafc; }
	:global([data-theme='light']) .standings-table tbody tr:hover,
	:global([data-theme='violet-light']) .standings-table tbody tr:hover { background: #edf2f7; }
	:global([data-theme='light']) .standings-table tbody tr,
	:global([data-theme='violet-light']) .standings-table tbody tr { border-bottom-color: #edf2f7; }

	:global([data-theme='light']) .standings-table td,
	:global([data-theme='violet-light']) .standings-table td {
		color: #1a202c;
	}

	:global([data-theme='light']) .position-badge,
	:global([data-theme='violet-light']) .position-badge {
		background: #e2e8f0;
		color: #4a5568;
	}

	:global([data-theme='light']) .round-section,
	:global([data-theme='violet-light']) .round-section {
		background: #f7fafc;
	}

	:global([data-theme='light']) .round-header:hover,
	:global([data-theme='violet-light']) .round-header:hover {
		background: #edf2f7;
	}

	:global([data-theme='light']) .matches-list,
	:global([data-theme='violet-light']) .matches-list {
		border-top-color: #e2e8f0;
	}

	/* Light & Violet-Light themes - Brackets */
	:global([data-theme='light']) .division-tabs,
	:global([data-theme='violet-light']) .division-tabs {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .division-tab,
	:global([data-theme='violet-light']) .division-tab {
		color: #64748b;
	}

	:global([data-theme='light']) .division-tab:hover,
	:global([data-theme='violet-light']) .division-tab:hover {
		background: rgba(102, 126, 234, 0.08);
		color: #1e293b;
	}

	:global([data-theme='light']) .bracket-card,
	:global([data-theme='violet-light']) .bracket-card,
	:global([data-theme='light']) .consolation-section,
	:global([data-theme='violet-light']) .consolation-section {
		background: #ffffff;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .bracket-header,
	:global([data-theme='violet-light']) .bracket-header,
	:global([data-theme='light']) .consolation-section .consolation-header,
	:global([data-theme='violet-light']) .consolation-section .consolation-header {
		background: #f8fafc;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .bracket-title,
	:global([data-theme='violet-light']) .bracket-title {
		color: #1e293b;
	}

	:global([data-theme='light']) .round-header,
	:global([data-theme='violet-light']) .round-header {
		background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 10%, transparent) 0%, color-mix(in srgb, var(--primary) 6%, transparent) 100%);
	}

	:global([data-theme='light']) .third-place-header,
	:global([data-theme='violet-light']) .third-place-header {
		background: linear-gradient(135deg, rgba(180, 83, 9, 0.1) 0%, rgba(146, 64, 14, 0.06) 100%);
	}

	:global([data-theme='light']) .round-header.final-round,
	:global([data-theme='violet-light']) .round-header.final-round {
		background: linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(202, 138, 4, 0.1) 100%);
	}

	:global([data-theme='light']) .scoring-label,
	:global([data-theme='violet-light']) .scoring-label {
		color: #64748b;
		background: rgba(0, 0, 0, 0.05);
	}

	:global([data-theme='light']) .bracket-column.third-place-column,
	:global([data-theme='violet-light']) .bracket-column.third-place-column {
		border-left-color: #e2e8f0;
	}

	:global([data-theme='light']) .match-card,
	:global([data-theme='violet-light']) .match-card {
		background: #f8fafc;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .match-card.in-progress,
	:global([data-theme='violet-light']) .match-card.in-progress {
		background: rgba(245, 158, 11, 0.05);
	}

	:global([data-theme='light']) .match-card.bye-match,
	:global([data-theme='violet-light']) .match-card.bye-match {
		border-left-color: #cbd5e1;
	}

	:global([data-theme='light']) .match-player.bye .player-name,
	:global([data-theme='violet-light']) .match-player.bye .player-name {
		color: #94a3b8;
	}

	:global([data-theme='light']) .match-player,
	:global([data-theme='violet-light']) .match-player {
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .player-name,
	:global([data-theme='violet-light']) .player-name {
		color: #1e293b;
	}

	:global([data-theme='light']) .player-score,
	:global([data-theme='violet-light']) .player-score {
		color: #1e293b;
	}

	:global([data-theme='light']) .match-player.winner .player-name,
	:global([data-theme='violet-light']) .match-player.winner .player-name {
		color: #059669;
	}

	:global([data-theme='light']) .consolation-main-title,
	:global([data-theme='violet-light']) .consolation-main-title {
		color: #64748b;
	}

	:global([data-theme='light']) .consolation-bracket,
	:global([data-theme='violet-light']) .consolation-bracket {
		background: #f8fafc;
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .consolation-bracket-header,
	:global([data-theme='violet-light']) .consolation-bracket-header {
		background: rgba(100, 116, 139, 0.08);
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .consolation-label,
	:global([data-theme='violet-light']) .consolation-label {
		color: #64748b;
	}

	:global([data-theme='light']) .verified,
	:global([data-theme='violet-light']) .verified {
		color: #059669;
	}

	:global([data-theme='light']) .seed,
	:global([data-theme='violet-light']) .seed {
		color: #64748b;
	}

	:global([data-theme='light']) .player-avatar,
	:global([data-theme='violet-light']) .player-avatar {
		border-color: #e2e8f0;
	}

	:global([data-theme='light']) .match-player.winner .player-avatar,
	:global([data-theme='violet-light']) .match-player.winner .player-avatar {
		border-color: #059669;
	}

	/* Light theme bracket connectors */
	:global([data-theme='light']) .bracket-column.has-next .match-card::after,
	:global([data-theme='violet-light']) .bracket-column.has-next .match-card::after,
	:global([data-theme='light']) .bracket-column.has-next .match-card::before,
	:global([data-theme='violet-light']) .bracket-column.has-next .match-card::before,
	:global([data-theme='light']) .pair-connector,
	:global([data-theme='violet-light']) .pair-connector {
		background: #667eea;
	}

	:global([data-theme='light']) .bracket-column.third-place-column,
	:global([data-theme='violet-light']) .bracket-column.third-place-column {
		border-left-color: #e2e8f0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.info-bar {
			padding: 0.4rem 0.5rem;
			flex-direction: column;
			gap: 0.5rem;
		}

		.info-right {
			width: 100%;
			justify-content: flex-end;
		}

		.info-chip {
			padding: 0.25rem 0.5rem;
			font-size: 0.7rem;
		}

		.standings-table th,
		.standings-table td {
			padding: 0.4rem 0.25rem;
			font-size: 0.7rem;
		}

		.standings-table th {
			font-size: 0.6rem;
		}

		.position-badge {
			width: 20px;
			height: 20px;
			font-size: 0.65rem;
		}

		/* Bracket responsive */
		.division-tabs {
			flex-direction: row;
		}

		.division-tab {
			padding: 0.5rem 0.75rem;
			font-size: 0.75rem;
		}

		.bracket-column {
			min-width: 240px;
		}

		.player-name {
			font-size: 0.75rem;
		}

		.player-score {
			font-size: 0.8rem;
		}

		.round-header .round-name {
			font-size: 0.65rem;
		}

		.consolation-grid {
			grid-template-columns: 1fr;
		}

		.bracket-header,
		.consolation-section .consolation-header {
			padding: 0.6rem 0.75rem;
		}

		.bracket-title,
		.consolation-main-title {
			font-size: 0.75rem;
		}

		/* Smaller connectors on tablet */
		.bracket-grid {
			gap: 3rem;
		}

		.bracket-column.has-next .match-card::after {
			width: 1.5rem;
		}

		.bracket-column.has-next .match-card::before {
			left: calc(100% + 1.5rem);
		}

		.pair-connector {
			width: 1.5rem;
			right: -3rem;
		}
	}

	@media (max-width: 480px) {
		.division-tab {
			padding: 0.45rem 0.5rem;
			font-size: 0.7rem;
		}

		.division-indicator {
			width: 8px;
			height: 8px;
		}

		.bracket-column {
			min-width: 200px;
		}

		.match-player {
			padding: 0.4rem 0.5rem;
		}

		.player-name {
			font-size: 0.7rem;
		}

		/* Smaller connectors on mobile */
		.bracket-grid {
			gap: 2.5rem;
		}

		.bracket-column.has-next .match-card::after {
			width: 1rem;
		}

		.bracket-column.has-next .match-card::before {
			left: calc(100% + 1rem);
		}

		.pair-connector {
			width: 1rem;
			right: -2rem;
		}
	}
</style>
