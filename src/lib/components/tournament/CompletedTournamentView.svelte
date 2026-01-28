<script lang="ts">
  import type { Tournament, GroupMatch, BracketMatch } from '$lib/types/tournament';
  import GroupStandings from './GroupStandings.svelte';
  import MatchResultDialog from './MatchResultDialog.svelte';
  import { isBye } from '$lib/algorithms/bracket';
  import { recalculateStandings } from '$lib/firebase/tournamentGroups';
  import { calculateFinalPositions, applyRankingUpdates } from '$lib/firebase/tournamentRanking';
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    tournament: Tournament;
    onupdated?: () => void;
  }

  let { tournament, onupdated }: Props = $props();

  // Track which groups are recalculating
  let recalculatingGroups = $state(new Set<string>());
  let recalculatingPositions = $state(false);

  // Translate group name based on language
  // Handles: identifiers (SINGLE_GROUP, GROUP_A), legacy Spanish names, and Swiss
  function translateGroupName(name: string): string {
    if (name === 'Swiss') return m.tournament_swissSystem();
    // New identifier format
    if (name === 'SINGLE_GROUP') return m.tournament_singleGroup();
    const idMatch = name.match(/^GROUP_([A-H])$/);
    if (idMatch) {
      return `${m.tournament_group()} ${idMatch[1]}`;
    }
    // Legacy Spanish format (for existing tournaments)
    if (name === 'Grupo Único') return m.tournament_singleGroup();
    const legacyMatch = name.match(/^Grupo ([A-H])$/);
    if (legacyMatch) {
      return `${m.tournament_group()} ${legacyMatch[1]}`;
    }
    return name;
  }

  const initialTab = tournament.phaseType === 'TWO_PHASE' ? 'groups' : 'bracket';
  let activeTab = $state<'groups' | 'bracket'>(initialTab);
  let showMatchDialog = $state(false);
  let expandedResults = $state<Set<string>>(new Set()); // Track which group results are expanded
  let selectedMatch = $state<GroupMatch | BracketMatch | null>(null);

  // Toggle results accordion for a group
  function toggleResults(groupId: string) {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    expandedResults = newExpanded;
  }
  let isBracketMatch = $state(false);

  // Check if this is a split divisions tournament
  let isSplitDivisions = $derived(tournament.finalStage?.mode === 'SPLIT_DIVISIONS');
  let goldBracket = $derived(tournament.finalStage?.goldBracket);
  let silverBracket = $derived(tournament.finalStage?.silverBracket);

  // Debug consolation matches - detailed view of each match including rounds
  let goldConsolationMatches = $derived(
    goldBracket?.consolationBrackets?.flatMap(cb =>
      cb.rounds.flatMap(r => r.matches.map(m => ({
        id: m.id,
        participantA: getParticipantName(m.participantA),
        participantB: getParticipantName(m.participantB),
        totalPointsA: m.totalPointsA,
        totalPointsB: m.totalPointsB,
        total20sA: m.total20sA,
        total20sB: m.total20sB,
        roundsCount: m.rounds?.length ?? 0,
        rounds: m.rounds, // Include full rounds detail
        status: m.status,
        hasData: (m.totalPointsA ?? 0) > 0 || (m.totalPointsB ?? 0) > 0 || (m.total20sA ?? 0) > 0 || (m.total20sB ?? 0) > 0
      })))
    ) ?? []
  );
  $inspect('Gold consolation matches detail:', goldConsolationMatches);

  let silverConsolationMatches = $derived(
    silverBracket?.consolationBrackets?.flatMap(cb =>
      cb.rounds.flatMap(r => r.matches.map(m => ({
        id: m.id,
        participantA: getParticipantName(m.participantA),
        participantB: getParticipantName(m.participantB),
        totalPointsA: m.totalPointsA,
        totalPointsB: m.totalPointsB,
        total20sA: m.total20sA,
        total20sB: m.total20sB,
        roundsCount: m.rounds?.length ?? 0,
        rounds: m.rounds,
        status: m.status,
        hasData: (m.totalPointsA ?? 0) > 0 || (m.totalPointsB ?? 0) > 0 || (m.total20sA ?? 0) > 0 || (m.total20sB ?? 0) > 0
      })))
    ) ?? []
  );
  $inspect('Silver consolation matches detail:', silverConsolationMatches);

  // Match configuration - determines if we show games won or total points
  let goldMatchesToWin = $derived((tournament.finalStage as any)?.matchesToWin || 1);
  let silverMatchesToWin = $derived((tournament.finalStage as any)?.silverMatchesToWin || 1);
  let showGoldGamesWon = $derived(goldMatchesToWin > 1);
  let showSilverGamesWon = $derived(silverMatchesToWin > 1);

  // Sort participants by final position for the final standings
  let sortedParticipants = $derived([...tournament.participants]
    .filter(p => p.status === 'ACTIVE' && p.finalPosition)
    .sort((a, b) => (a.finalPosition || 999) - (b.finalPosition || 999)));

  // Get participant name by ID
  function getParticipantName(participantId: string | undefined): string {
    if (!participantId) return 'TBD';
    if (isBye(participantId)) return 'BYE';
    return tournament.participants.find(p => p.id === participantId)?.name || 'Unknown';
  }

  // Check if a match is a BYE match (one participant is BYE)
  function isByeMatch(match: BracketMatch): boolean {
    return isBye(match.participantA) || isBye(match.participantB);
  }

  // Get position medal/emoji
  function getPositionDisplay(position: number): string {
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return `${position}º`;
  }

  /**
   * Calculate final position for a participant in a consolation match
   * @param startPosition - Starting position for the bracket (5 for QF, 9 for R16)
   * @param totalRounds - Total rounds in the consolation bracket
   * @param roundNumber - Current round number (1-indexed)
   * @param matchPosition - Position of match in the round (0-indexed)
   * @param isWinner - Whether this participant won the match
   * @returns Final position number or null if match not completed
   */
  function getConsolationPosition(
    startPosition: number,
    totalRounds: number,
    roundNumber: number,
    matchPosition: number,
    isWinner: boolean
  ): number | null {
    const roundsFromEnd = totalRounds - roundNumber;

    if (roundsFromEnd === 0) {
      // Final round
      return isWinner ? startPosition : startPosition + 1;
    } else if (roundsFromEnd === 1) {
      // Semifinal - losers get positions startPosition+2 onwards
      return isWinner ? null : startPosition + 2 + matchPosition;
    } else if (roundsFromEnd === 2) {
      // Quarterfinal - losers get positions startPosition+4 onwards
      return isWinner ? null : startPosition + 4 + matchPosition;
    }
    // Earlier rounds - only losers get positions, winners advance
    return isWinner ? null : startPosition + Math.pow(2, totalRounds - roundNumber) + matchPosition;
  }

  // Calculate ranking delta for display
  function getRankingDelta(participant: typeof tournament.participants[0]): number {
    return participant.currentRanking - participant.rankingSnapshot;
  }

  // Handle match click to show details
  function handleMatchClick(match: GroupMatch | BracketMatch, isBracket: boolean = false) {
    selectedMatch = match;
    isBracketMatch = isBracket;
    showMatchDialog = true;
  }

  function handleCloseDialog() {
    showMatchDialog = false;
    selectedMatch = null;
  }

  // Recalculate standings for a group
  async function handleRecalculateStandings(groupId: string) {
    if (recalculatingGroups.has(groupId)) return;

    recalculatingGroups.add(groupId);
    recalculatingGroups = recalculatingGroups; // Trigger reactivity

    try {
      const success = await recalculateStandings(tournament.id, groupId);
      if (success) {
        // Emit event to parent to reload tournament data
        onupdated?.();
      }
    } catch (err) {
      console.error('Error recalculating standings:', err);
    } finally {
      recalculatingGroups.delete(groupId);
      recalculatingGroups = recalculatingGroups;
    }
  }

  // Recalculate final positions for bracket participants
  async function handleRecalculatePositions() {
    if (recalculatingPositions) return;

    recalculatingPositions = true;

    try {
      const success = await calculateFinalPositions(tournament.id);
      if (success) {
        // Also recalculate ranking if enabled
        if (tournament.rankingConfig?.enabled) {
          await applyRankingUpdates(tournament.id);
        }
        onupdated?.();
      }
    } catch (err) {
      console.error('Error recalculating positions:', err);
    } finally {
      recalculatingPositions = false;
    }
  }

  // Get all matches from group schedule or pairings
  function getGroupMatches(group: any): GroupMatch[] {
    const schedule = group.schedule || group.pairings;
    if (!schedule) return [];
    const scheduleArray = Array.isArray(schedule) ? schedule : Object.values(schedule);
    return scheduleArray.flatMap((round: any) => {
      const matches = round.matches;
      return Array.isArray(matches) ? matches : Object.values(matches || {});
    });
  }

  // Get rounds with their matches for grouped display
  function getGroupRounds(group: any): Array<{ roundNumber: number; matches: GroupMatch[] }> {
    const schedule = group.schedule || group.pairings;
    if (!schedule) return [];
    const scheduleArray = Array.isArray(schedule) ? schedule : Object.values(schedule);
    return scheduleArray.map((round: any) => ({
      roundNumber: round.roundNumber,
      matches: (Array.isArray(round.matches) ? round.matches : Object.values(round.matches || {}))
        .filter((m: GroupMatch) => m.participantB !== 'BYE')
    })).filter(r => r.matches.length > 0);
  }

  // Convert BracketMatch to GroupMatch for dialog
  let dialogMatch = $derived(selectedMatch ? {
    ...selectedMatch,
    id: selectedMatch.id,
    participantA: (selectedMatch as any).participantA || '',
    participantB: (selectedMatch as any).participantB || '',
    status: selectedMatch.status,
    gamesWonA: (selectedMatch as any).gamesWonA,
    gamesWonB: (selectedMatch as any).gamesWonB,
    totalPointsA: (selectedMatch as any).totalPointsA,
    totalPointsB: (selectedMatch as any).totalPointsB,
    total20sA: (selectedMatch as any).total20sA,
    total20sB: (selectedMatch as any).total20sB,
    rounds: (selectedMatch as any).rounds,
    winner: (selectedMatch as any).winner,
    noShowParticipant: (selectedMatch as any).noShowParticipant
  } as GroupMatch : null);
</script>

<div class="completed-view">
  <!-- Final Standings with Ranking - Compact Grid Layout -->
  <div class="final-standings-section">
    <div class="standings-header">
      <h3>{m.tournament_finalStandings()}</h3>
      <button
        class="recalc-positions-btn"
        onclick={handleRecalculatePositions}
        disabled={recalculatingPositions}
        title={m.tournament_recalculatePositions()}
      >
        {#if recalculatingPositions}
          <span class="spinner-small"></span>
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
        {/if}
        <span>{m.time_recalculate()}</span>
      </button>
    </div>
    <div class="standings-grid" class:with-ranking={tournament.rankingConfig?.enabled}>
      {#if tournament.rankingConfig?.enabled}
        <div class="standings-header-row">
          <span class="pos"></span>
          <span class="name">{m.common_name()}</span>
          <span class="ranking">Ranking</span>
          <span class="pts">Pts</span>
        </div>
      {/if}
      {#each sortedParticipants as participant (participant.id)}
        {@const pointsEarned = getRankingDelta(participant)}
        {@const pos = participant.finalPosition || 0}
        <div class="standing-row" class:top-4={pos <= 4} class:first={pos === 1} class:second={pos === 2} class:third={pos === 3} class:fourth={pos === 4} class:zebra-odd={pos > 4 && pos % 2 === 1} class:zebra-even={pos > 4 && pos % 2 === 0}>
          <span class="pos">{getPositionDisplay(pos)}</span>
          <span class="name">{participant.name}</span>
          {#if tournament.rankingConfig?.enabled}
            <span class="ranking">{participant.currentRanking}</span>
            <span class="pts">{pointsEarned > 0 ? `+${pointsEarned}` : pointsEarned}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Tab Navigation -->
  <div class="tab-navigation">
    {#if tournament.phaseType === 'TWO_PHASE'}
      <button
        class="tab-button"
        class:active={activeTab === 'groups'}
        onclick={() => activeTab = 'groups'}
      >
        <span class="tab-indicator"></span>
        <span class="tab-label">{m.tournament_groupStage()}</span>
      </button>
    {/if}
    <button
      class="tab-button"
      class:active={activeTab === 'bracket'}
      onclick={() => activeTab = 'bracket'}
    >
      <span class="tab-indicator"></span>
      <span class="tab-label">{m.tournament_finalStage()}</span>
    </button>
  </div>

  <!-- Tab Content -->
  <div class="tab-content">
    {#if activeTab === 'groups' && tournament.groupStage}
      <!-- Groups View -->
      <div class="groups-section">
        {#each tournament.groupStage.groups as group (group.id)}
          {@const rankSystem = tournament.groupStage?.rankingSystem || tournament.groupStage?.swissRankingSystem || 'WINS'}
          <div class="group-card">
            <h3 class="group-title">{translateGroupName(group.name)}</h3>

            <!-- Standings Table -->
            <div class="standings-section">
              <div class="standings-header">
                <h4>
                  {m.tournament_standings()}
                  <span class="ranking-system-badge">{rankSystem === 'POINTS' ? m.tournament_byPoints() : m.tournament_byWins()}</span>
                </h4>
                <button
                  class="recalc-btn"
                  onclick={() => handleRecalculateStandings(group.id)}
                  disabled={recalculatingGroups.has(group.id)}
                  title={m.tournament_recalculateStandings()}
                >
                  {#if recalculatingGroups.has(group.id)}
                    <span class="spinner-small"></span>
                  {:else}
                    🔄
                  {/if}
                </button>
              </div>
              <GroupStandings
                standings={group.standings}
                participants={tournament.participants}
                isSwiss={tournament.groupStage?.type === 'SWISS'}
                rankingSystem={tournament.groupStage?.rankingSystem || tournament.groupStage?.swissRankingSystem || 'WINS'}
              />
            </div>

            <!-- Match Results by Round - Collapsible -->
            <div class="matches-section">
              <button
                class="results-accordion-header"
                onclick={() => toggleResults(group.id)}
                aria-expanded={expandedResults.has(group.id)}
              >
                <span class="accordion-icon" class:expanded={expandedResults.has(group.id)}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                  </svg>
                </span>
                <span class="accordion-title">{m.tournament_results()}</span>
                <span class="matches-count">{getGroupMatches(group).length}</span>
              </button>

              {#if expandedResults.has(group.id)}
                <div class="results-content">
                  {#each getGroupRounds(group) as round (round.roundNumber)}
                    <div class="round-group">
                      <div class="round-divider">
                        <span class="round-label">{m.tournament_round()} {round.roundNumber}</span>
                      </div>
                      <div class="matches-list">
                        {#each round.matches as match (match.id)}
                          <button
                            class="match-row"
                            onclick={() => handleMatchClick(match, false)}
                          >
                            {#if match.tableNumber}
                              <span class="table-badge">{m.tournament_tableShort()}{match.tableNumber}</span>
                            {/if}
                            <span class="participant" class:winner={match.winner === match.participantA}>
                              {getParticipantName(match.participantA)}
                            </span>
                            <span class="score">
                              {match.totalPointsA ?? '-'} - {match.totalPointsB ?? '-'}
                            </span>
                            <span class="participant" class:winner={match.winner === match.participantB}>
                              {getParticipantName(match.participantB)}
                            </span>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else if activeTab === 'bracket' && goldBracket}
      <!-- Bracket View -->
      <div class="bracket-section">
        <!-- Gold Bracket (or single bracket) -->
        <div class="bracket-wrapper" class:gold={isSplitDivisions}>
          {#if isSplitDivisions}
            <div class="bracket-division-header gold">
              <span class="division-icon"></span>
              <span class="division-label">Liga Oro</span>
            </div>
          {/if}
          <div class="bracket-container">
          {#each goldBracket.rounds as round (round.roundNumber)}
            <div class="bracket-round">
              <h3 class="round-name">{round.name}</h3>
              <div class="matches-column">
                {#each round.matches as match (match.id)}
                  <button
                    class="bracket-match"
                    class:clickable={match.participantA && match.participantB && !isByeMatch(match)}
                    class:bye-match={isByeMatch(match)}
                    onclick={() => match.participantA && match.participantB && !isByeMatch(match) && handleMatchClick(match, true)}
                    disabled={!match.participantA || !match.participantB || isByeMatch(match)}
                  >
                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantA}
                      class:tbd={!match.participantA}
                      class:bye={isBye(match.participantA)}
                    >
                      <span class="participant-name">{getParticipantName(match.participantA)}</span>
                      {#if match.seedA}
                        <span class="seed">#{match.seedA}</span>
                      {/if}
                      {#if (match.status === 'COMPLETED' || match.status === 'WALKOVER') && !isByeMatch(match)}
                        <span class="score">{showGoldGamesWon ? (match.gamesWonA || 0) : (match.totalPointsA || 0)}</span>
                      {/if}
                    </div>

                    <div class="vs-divider"></div>

                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantB}
                      class:tbd={!match.participantB}
                      class:bye={isBye(match.participantB)}
                    >
                      <span class="participant-name">{getParticipantName(match.participantB)}</span>
                      {#if match.seedB}
                        <span class="seed">#{match.seedB}</span>
                      {/if}
                      {#if (match.status === 'COMPLETED' || match.status === 'WALKOVER') && !isByeMatch(match)}
                        <span class="score">{showGoldGamesWon ? (match.gamesWonB || 0) : (match.totalPointsB || 0)}</span>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/each}

          <!-- 3rd/4th Place Match (Gold) -->
          {#if goldBracket.thirdPlaceMatch}
            {@const thirdPlaceMatch = goldBracket.thirdPlaceMatch}
            <div class="bracket-round third-place-round">
              <h3 class="round-name third-place">{m.tournament_thirdPlace()}</h3>
              <div class="matches-column">
                <button
                  class="bracket-match third-place-match"
                  class:clickable={thirdPlaceMatch.participantA && thirdPlaceMatch.participantB}
                  onclick={() => thirdPlaceMatch.participantA && thirdPlaceMatch.participantB && handleMatchClick(thirdPlaceMatch, true)}
                  disabled={!thirdPlaceMatch.participantA || !thirdPlaceMatch.participantB}
                >
                  <div
                    class="match-participant"
                    class:winner={thirdPlaceMatch.winner === thirdPlaceMatch.participantA}
                    class:tbd={!thirdPlaceMatch.participantA}
                  >
                    <span class="participant-name">{getParticipantName(thirdPlaceMatch.participantA)}</span>
                    {#if thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'WALKOVER'}
                      <span class="score">{showGoldGamesWon ? (thirdPlaceMatch.gamesWonA || 0) : (thirdPlaceMatch.totalPointsA || 0)}</span>
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
                      <span class="score">{showGoldGamesWon ? (thirdPlaceMatch.gamesWonB || 0) : (thirdPlaceMatch.totalPointsB || 0)}</span>
                    {/if}
                  </div>
                </button>
              </div>
            </div>
          {/if}
          </div>

          <!-- Consolation Brackets (Gold) -->
          {#if goldBracket.consolationBrackets?.length}
            <div class="consolation-section">
              <div class="consolation-header">
                <span class="consolation-icon">🏆</span>
                <span class="consolation-label">{m.bracket_consolation()}</span>
              </div>
              {#each goldBracket.consolationBrackets as consolationBracket (consolationBracket.source)}
                <div class="consolation-bracket">
                  <div class="consolation-source-label">
                    {m.bracket_positionsRange({ start: consolationBracket.startPosition, end: consolationBracket.startPosition + (consolationBracket.numLosers || 4) - 1 })}
                  </div>
                  <div class="bracket-container consolation">
                    {#each consolationBracket.rounds as round (round.roundNumber)}
                      <div class="bracket-round">
                        <h3 class="round-name consolation">{round.name}</h3>
                        <div class="matches-column">
                          {#each round.matches as match, matchIdx (match.id)}
                            {@const hasMatchData = (match.totalPointsA ?? 0) > 0 || (match.totalPointsB ?? 0) > 0 || (match.total20sA ?? 0) > 0 || (match.total20sB ?? 0) > 0}
                            {@const isWalkover = !hasMatchData && (match.status === 'COMPLETED' || match.status === 'WALKOVER')}
                            {@const isMatchComplete = match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                            {@const positionA = isMatchComplete && match.winner ? getConsolationPosition(consolationBracket.startPosition, consolationBracket.totalRounds, round.roundNumber, matchIdx, match.winner === match.participantA) : null}
                            {@const positionB = isMatchComplete && match.winner ? getConsolationPosition(consolationBracket.startPosition, consolationBracket.totalRounds, round.roundNumber, matchIdx, match.winner === match.participantB) : null}
                            <button
                              class="bracket-match"
                              class:clickable={match.participantA && match.participantB && !isByeMatch(match)}
                              class:bye-match={isByeMatch(match)}
                              onclick={() => match.participantA && match.participantB && !isByeMatch(match) && handleMatchClick(match, true)}
                              disabled={!match.participantA || !match.participantB || isByeMatch(match)}
                            >
                              <div
                                class="match-participant"
                                class:winner={match.winner === match.participantA}
                                class:tbd={!match.participantA}
                                class:bye={isBye(match.participantA)}
                              >
                                {#if positionA}
                                  <span class="final-position">{positionA}º</span>
                                {/if}
                                <span class="participant-name">{getParticipantName(match.participantA)}</span>
                                {#if match.seedA}
                                  <span class="seed">#{match.seedA}</span>
                                {/if}
                                {#if isMatchComplete && !isByeMatch(match) && !isWalkover}
                                  <span class="score">{match.totalPointsA ?? 0}</span>
                                {/if}
                              </div>

                              {#if isWalkover}
                                <div class="walkover-badge">W.O.</div>
                              {:else}
                                <div class="vs-divider"></div>
                              {/if}

                              <div
                                class="match-participant"
                                class:winner={match.winner === match.participantB}
                                class:tbd={!match.participantB}
                                class:bye={isBye(match.participantB)}
                              >
                                {#if positionB}
                                  <span class="final-position">{positionB}º</span>
                                {/if}
                                <span class="participant-name">{getParticipantName(match.participantB)}</span>
                                {#if match.seedB}
                                  <span class="seed">#{match.seedB}</span>
                                {/if}
                                {#if isMatchComplete && !isByeMatch(match) && !isWalkover}
                                  <span class="score">{match.totalPointsB ?? 0}</span>
                                {/if}
                              </div>
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Silver Bracket (only for SPLIT_DIVISIONS) -->
        {#if isSplitDivisions && silverBracket}
          <div class="bracket-wrapper silver">
            <div class="bracket-division-header silver">
              <span class="division-icon"></span>
              <span class="division-label">Liga Plata</span>
            </div>
            <div class="bracket-container">
            {#each silverBracket.rounds as round (round.roundNumber)}
              <div class="bracket-round">
                <h3 class="round-name silver">{round.name}</h3>
                <div class="matches-column">
                  {#each round.matches as match (match.id)}
                    <button
                      class="bracket-match"
                      class:clickable={match.participantA && match.participantB && !isByeMatch(match)}
                      class:bye-match={isByeMatch(match)}
                      onclick={() => match.participantA && match.participantB && !isByeMatch(match) && handleMatchClick(match, true)}
                      disabled={!match.participantA || !match.participantB || isByeMatch(match)}
                    >
                      <div
                        class="match-participant"
                        class:winner={match.winner === match.participantA}
                        class:tbd={!match.participantA}
                        class:bye={isBye(match.participantA)}
                      >
                        <span class="participant-name">{getParticipantName(match.participantA)}</span>
                        {#if match.seedA}
                          <span class="seed">#{match.seedA}</span>
                        {/if}
                        {#if (match.status === 'COMPLETED' || match.status === 'WALKOVER') && !isByeMatch(match)}
                          <span class="score">{showSilverGamesWon ? (match.gamesWonA || 0) : (match.totalPointsA || 0)}</span>
                        {/if}
                      </div>

                      <div class="vs-divider"></div>

                      <div
                        class="match-participant"
                        class:winner={match.winner === match.participantB}
                        class:tbd={!match.participantB}
                        class:bye={isBye(match.participantB)}
                      >
                        <span class="participant-name">{getParticipantName(match.participantB)}</span>
                        {#if match.seedB}
                          <span class="seed">#{match.seedB}</span>
                        {/if}
                        {#if (match.status === 'COMPLETED' || match.status === 'WALKOVER') && !isByeMatch(match)}
                          <span class="score">{showSilverGamesWon ? (match.gamesWonB || 0) : (match.totalPointsB || 0)}</span>
                        {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/each}

            <!-- 3rd/4th Place Match (Silver) -->
            {#if silverBracket.thirdPlaceMatch}
              {@const silverThirdPlace = silverBracket.thirdPlaceMatch}
              <div class="bracket-round third-place-round">
                <h3 class="round-name third-place silver">{m.tournament_thirdPlace()}</h3>
                <div class="matches-column">
                  <button
                    class="bracket-match third-place-match"
                    class:clickable={silverThirdPlace.participantA && silverThirdPlace.participantB}
                    onclick={() => silverThirdPlace.participantA && silverThirdPlace.participantB && handleMatchClick(silverThirdPlace, true)}
                    disabled={!silverThirdPlace.participantA || !silverThirdPlace.participantB}
                  >
                    <div
                      class="match-participant"
                      class:winner={silverThirdPlace.winner === silverThirdPlace.participantA}
                      class:tbd={!silverThirdPlace.participantA}
                    >
                      <span class="participant-name">{getParticipantName(silverThirdPlace.participantA)}</span>
                      {#if silverThirdPlace.status === 'COMPLETED' || silverThirdPlace.status === 'WALKOVER'}
                        <span class="score">{showSilverGamesWon ? (silverThirdPlace.gamesWonA || 0) : (silverThirdPlace.totalPointsA || 0)}</span>
                      {/if}
                    </div>

                    <div class="vs-divider"></div>

                    <div
                      class="match-participant"
                      class:winner={silverThirdPlace.winner === silverThirdPlace.participantB}
                      class:tbd={!silverThirdPlace.participantB}
                    >
                      <span class="participant-name">{getParticipantName(silverThirdPlace.participantB)}</span>
                      {#if silverThirdPlace.status === 'COMPLETED' || silverThirdPlace.status === 'WALKOVER'}
                        <span class="score">{showSilverGamesWon ? (silverThirdPlace.gamesWonB || 0) : (silverThirdPlace.totalPointsB || 0)}</span>
                      {/if}
                    </div>
                  </button>
                </div>
              </div>
            {/if}
            </div>

            <!-- Consolation Brackets (Silver) -->
            {#if silverBracket.consolationBrackets?.length}
              <div class="consolation-section">
                <div class="consolation-header">
                  <span class="consolation-icon">🏆</span>
                  <span class="consolation-label">{m.bracket_consolation()}</span>
                </div>
                {#each silverBracket.consolationBrackets as consolationBracket (consolationBracket.source)}
                  <div class="consolation-bracket">
                    <div class="consolation-source-label">
                      {m.bracket_positionsRange({ start: consolationBracket.startPosition, end: consolationBracket.startPosition + (consolationBracket.numLosers || 4) - 1 })}
                    </div>
                    <div class="bracket-container consolation">
                      {#each consolationBracket.rounds as round (round.roundNumber)}
                        <div class="bracket-round">
                          <h3 class="round-name consolation">{round.name}</h3>
                          <div class="matches-column">
                            {#each round.matches as match, matchIdx (match.id)}
                              {@const hasMatchData = (match.totalPointsA ?? 0) > 0 || (match.totalPointsB ?? 0) > 0 || (match.total20sA ?? 0) > 0 || (match.total20sB ?? 0) > 0}
                              {@const isWalkover = !hasMatchData && (match.status === 'COMPLETED' || match.status === 'WALKOVER')}
                              {@const isMatchComplete = match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                              {@const positionA = isMatchComplete && match.winner ? getConsolationPosition(consolationBracket.startPosition, consolationBracket.totalRounds, round.roundNumber, matchIdx, match.winner === match.participantA) : null}
                              {@const positionB = isMatchComplete && match.winner ? getConsolationPosition(consolationBracket.startPosition, consolationBracket.totalRounds, round.roundNumber, matchIdx, match.winner === match.participantB) : null}
                              <button
                                class="bracket-match"
                                class:clickable={match.participantA && match.participantB && !isByeMatch(match)}
                                class:bye-match={isByeMatch(match)}
                                onclick={() => match.participantA && match.participantB && !isByeMatch(match) && handleMatchClick(match, true)}
                                disabled={!match.participantA || !match.participantB || isByeMatch(match)}
                              >
                              <div
                                  class="match-participant"
                                  class:winner={match.winner === match.participantA}
                                  class:tbd={!match.participantA}
                                  class:bye={isBye(match.participantA)}
                                >
                                  {#if positionA}
                                    <span class="final-position">{positionA}º</span>
                                  {/if}
                                  <span class="participant-name">{getParticipantName(match.participantA)}</span>
                                  {#if match.seedA}
                                    <span class="seed">#{match.seedA}</span>
                                  {/if}
                                  {#if isMatchComplete && !isByeMatch(match) && !isWalkover}
                                    <span class="score">{match.totalPointsA ?? 0}</span>
                                  {/if}
                                </div>

                                {#if isWalkover}
                                  <div class="walkover-badge">W.O.</div>
                                {:else}
                                  <div class="vs-divider"></div>
                                {/if}

                                <div
                                  class="match-participant"
                                  class:winner={match.winner === match.participantB}
                                  class:tbd={!match.participantB}
                                  class:bye={isBye(match.participantB)}
                                >
                                  {#if positionB}
                                    <span class="final-position">{positionB}º</span>
                                  {/if}
                                  <span class="participant-name">{getParticipantName(match.participantB)}</span>
                                  {#if match.seedB}
                                    <span class="seed">#{match.seedB}</span>
                                  {/if}
                                  {#if isMatchComplete && !isByeMatch(match) && !isWalkover}
                                    <span class="score">{match.totalPointsB ?? 0}</span>
                                  {/if}
                                </div>
                              </button>
                            {/each}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Match Detail Dialog (readonly) -->
{#if showMatchDialog && dialogMatch}
  <MatchResultDialog
    match={dialogMatch}
    participants={tournament.participants}
    {tournament}
    visible={showMatchDialog}
    isBracket={isBracketMatch}
    onclose={handleCloseDialog}
  />
{/if}

<style>
  .completed-view {
    width: 100%;
    overflow: hidden;
  }

  /* Final Standings Section - Compact Grid */
  .final-standings-section {
    margin-bottom: 1.5rem;
  }

  .final-standings-section > .standings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .final-standings-section > .standings-header h3 {
    font-size: 0.8rem;
    font-weight: 600;
    color: #374151;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  :global([data-theme='dark']) .final-standings-section > .standings-header h3 {
    color: #e1e8ed;
  }

  .recalc-positions-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
    color: #4b5563;
    cursor: pointer;
    transition: all 0.15s;
  }

  .recalc-positions-btn:hover:not(:disabled) {
    background: #e5e7eb;
    border-color: #667eea;
    color: #374151;
  }

  .recalc-positions-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .recalc-positions-btn svg {
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .recalc-positions-btn {
    background: #2d3748;
    border-color: #4a5568;
    color: #9ca3af;
  }

  :global([data-theme='dark']) .recalc-positions-btn:hover:not(:disabled) {
    background: #4a5568;
    border-color: #667eea;
    color: #e1e8ed;
  }

  .standings-grid {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .standings-grid.with-ranking {
    /* Same single column layout for ranking */
  }

  .standings-header-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.6rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 0.25rem;
  }

  .standings-header-row .pos {
    min-width: 1.5rem;
  }

  .standings-header-row .name {
    flex: 1;
  }

  .standings-header-row .ranking {
    min-width: 2.5rem;
    text-align: right;
  }

  .standings-header-row .pts {
    min-width: 2rem;
    text-align: center;
  }

  :global([data-theme='dark']) .standings-header-row {
    color: #8b9bb3;
    border-bottom-color: #2d3748;
  }

  .standing-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: #f9fafb;
    border-radius: 6px;
    transition: all 0.15s;
    border-left: 3px solid transparent;
  }

  :global([data-theme='dark']) .standing-row {
    background: #1a2332;
  }

  .standing-row:hover {
    background: #f3f4f6;
  }

  :global([data-theme='dark']) .standing-row:hover {
    background: #243447;
  }

  .standing-row.top-4 {
    background: linear-gradient(90deg, rgba(251, 191, 36, 0.08) 0%, transparent 100%);
  }

  .standing-row.first {
    border-left-color: #fbbf24;
    background: linear-gradient(90deg, rgba(251, 191, 36, 0.12) 0%, transparent 100%);
  }

  .standing-row.second {
    border-left-color: #9ca3af;
    background: linear-gradient(90deg, rgba(156, 163, 175, 0.1) 0%, transparent 100%);
  }

  .standing-row.third {
    border-left-color: #d97706;
    background: linear-gradient(90deg, rgba(217, 119, 6, 0.08) 0%, transparent 100%);
  }

  .standing-row.fourth {
    border-left-color: #d97706;
    background: linear-gradient(90deg, rgba(217, 119, 6, 0.08) 0%, transparent 100%);
  }

  :global([data-theme='dark']) .standing-row.top-4 {
    background: linear-gradient(90deg, rgba(251, 191, 36, 0.1) 0%, transparent 100%);
  }

  :global([data-theme='dark']) .standing-row.first {
    background: linear-gradient(90deg, rgba(251, 191, 36, 0.15) 0%, transparent 100%);
  }

  :global([data-theme='dark']) .standing-row.second {
    background: linear-gradient(90deg, rgba(156, 163, 175, 0.12) 0%, transparent 100%);
  }

  :global([data-theme='dark']) .standing-row.third {
    background: linear-gradient(90deg, rgba(217, 119, 6, 0.1) 0%, transparent 100%);
  }

  :global([data-theme='dark']) .standing-row.fourth {
    background: linear-gradient(90deg, rgba(217, 119, 6, 0.1) 0%, transparent 100%);
  }

  /* Zebra striping for positions 5+ */
  .standing-row.zebra-odd {
    background: #f9fafb;
  }

  .standing-row.zebra-even {
    background: #f3f4f6;
  }

  :global([data-theme='dark']) .standing-row.zebra-odd {
    background: #1a2332;
  }

  :global([data-theme='dark']) .standing-row.zebra-even {
    background: #1f2937;
  }

  .standing-row .pos {
    min-width: 1.5rem;
    font-weight: 700;
    font-size: 0.85rem;
    color: #6b7280;
    text-align: center;
  }

  .standing-row.first .pos,
  .standing-row.second .pos,
  .standing-row.third .pos {
    font-size: 1rem;
  }

  :global([data-theme='dark']) .standing-row .pos {
    color: #8b9bb3;
  }

  .standing-row .name {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 600;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global([data-theme='dark']) .standing-row .name {
    color: #e1e8ed;
  }

  .standing-row .ranking {
    font-size: 0.75rem;
    font-weight: 600;
    color: #667eea;
    min-width: 2.5rem;
    text-align: right;
  }

  .standing-row .pts {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    min-width: 2rem;
    text-align: center;
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  /* Tab Navigation - Professional minimal style */
  .tab-navigation {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1rem;
    padding: 0.2rem;
    background: #f3f4f6;
    border-radius: 6px;
    width: fit-content;
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    font-size: 0.8rem;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
    border-radius: 4px;
  }

  .tab-button .tab-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #d1d5db;
    transition: all 0.15s;
  }

  .tab-button .tab-label {
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.72rem;
  }

  .tab-button:hover {
    color: #374151;
    background: rgba(255, 255, 255, 0.5);
  }

  .tab-button:hover .tab-indicator {
    background: #9ca3af;
  }

  .tab-button.active {
    color: #1f2937;
    background: white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .tab-button.active .tab-indicator {
    background: #4f46e5;
  }

  :global([data-theme='dark']) .tab-navigation {
    background: #1a2332;
  }

  :global([data-theme='dark']) .tab-button {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .tab-button .tab-indicator {
    background: #4a5568;
  }

  :global([data-theme='dark']) .tab-button:hover {
    color: #e1e8ed;
    background: rgba(255, 255, 255, 0.05);
  }

  :global([data-theme='dark']) .tab-button:hover .tab-indicator {
    background: #6b7280;
  }

  :global([data-theme='dark']) .tab-button.active {
    color: #f3f4f6;
    background: #2d3748;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  :global([data-theme='dark']) .tab-button.active .tab-indicator {
    background: #818cf8;
  }

  /* Groups Section */
  .groups-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: 1.5rem;
    align-items: start;
  }

  .group-card {
    background: #f9fafb;
    border-radius: 8px;
    padding: 1rem;
  }

  :global([data-theme='dark']) .group-card {
    background: #0f1419;
  }

  .group-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #6b7280;
    margin: 0 0 0.75rem 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  :global([data-theme='dark']) .group-title {
    color: #8b9bb3;
  }

  .standings-section,
  .matches-section {
    margin-bottom: 1rem;
  }

  .standings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .standings-section h4 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .recalc-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    transition: all 0.15s;
  }

  .recalc-btn:hover:not(:disabled) {
    background: #e5e7eb;
    border-color: #667eea;
  }

  .recalc-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinner-small {
    width: 10px;
    height: 10px;
    border: 1.5px solid #d1d5db;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  :global([data-theme='dark']) .recalc-btn {
    background: #2d3748;
    border-color: #4a5568;
  }

  :global([data-theme='dark']) .recalc-btn:hover:not(:disabled) {
    background: #4a5568;
    border-color: #667eea;
  }

  :global([data-theme='dark']) .spinner-small {
    border-color: #4a5568;
    border-top-color: #667eea;
  }

  .ranking-system-badge {
    font-size: 0.6rem;
    font-weight: 600;
    padding: 0.1rem 0.35rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 3px;
    text-transform: none;
    letter-spacing: 0;
  }

  :global([data-theme='dark']) .standings-section h4 {
    color: #8b9bb3;
  }

  /* Results accordion */
  .results-accordion-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }

  .results-accordion-header:hover {
    background: #f9fafb;
    border-color: #667eea;
  }

  .accordion-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: transform 0.15s;
  }

  .accordion-icon.expanded {
    transform: rotate(90deg);
  }

  .accordion-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .matches-count {
    margin-left: auto;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    background: #f3f4f6;
    color: #6b7280;
    border-radius: 10px;
  }

  .results-content {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    animation: slideDown 0.15s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global([data-theme='dark']) .results-accordion-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .results-accordion-header:hover {
    background: #243447;
    border-color: #667eea;
  }

  :global([data-theme='dark']) .accordion-icon {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .accordion-title {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .matches-count {
    background: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .results-content {
    background: #1a2332;
    border-color: #2d3748;
  }

  /* Round groups */
  .round-group {
    margin-bottom: 0.75rem;
  }

  .round-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.4rem;
  }

  .round-divider::before,
  .round-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, #e5e7eb 20%, #e5e7eb 80%, transparent);
  }

  .round-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  :global([data-theme='dark']) .round-divider::before,
  :global([data-theme='dark']) .round-divider::after {
    background: linear-gradient(90deg, transparent, #2d3748 20%, #2d3748 80%, transparent);
  }

  :global([data-theme='dark']) .round-label {
    color: #8b9bb3;
  }

  /* Matches List */
  .matches-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.25rem;
  }

  .match-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
    text-align: left;
  }

  .match-row:hover {
    background: #f9fafb;
    border-color: #667eea;
  }

  :global([data-theme='dark']) .match-row {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .match-row:hover {
    background: #243447;
    border-color: #667eea;
  }

  .match-row .table-badge {
    font-size: 0.6rem;
    font-weight: 700;
    color: white;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 0.1rem 0.25rem;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .match-row .participant {
    flex: 1;
    font-size: 0.8rem;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .match-row .participant:last-child {
    text-align: right;
  }

  .match-row .participant.winner {
    font-weight: 700;
    color: #10b981;
  }

  :global([data-theme='dark']) .match-row .participant {
    color: #e1e8ed;
  }

  .match-row .score {
    padding: 0.15rem 0.4rem;
    background: #f3f4f6;
    border-radius: 3px;
    font-weight: 700;
    font-size: 0.75rem;
    color: #374151;
    min-width: 50px;
    text-align: center;
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .match-row .score {
    background: #2d3748;
    color: #e1e8ed;
  }

  /* Bracket Section */
  .bracket-section {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0;
    width: 100%;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: #667eea #f1f1f1;
  }

  .bracket-section::-webkit-scrollbar {
    height: 10px;
  }

  .bracket-section::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 5px;
  }

  .bracket-section::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 5px;
  }

  .bracket-section::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
  }

  .bracket-container {
    display: inline-flex;
    gap: 1.25rem;
    min-width: max-content;
    padding: 0.25rem 0;
    align-items: flex-start;
  }

  .bracket-round {
    min-width: 180px;
  }

  .round-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: #4b5563;
    margin: 0 0 0.6rem 0;
    text-align: center;
    padding: 0.35rem 0.5rem;
    background: #f3f4f6;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  :global([data-theme='dark']) .round-name {
    background: #2d3748;
    color: #9ca3af;
  }

  .matches-column {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    justify-content: space-around;
    min-height: 100%;
  }

  .bracket-match {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
  }

  .bracket-match:hover:not(:disabled) {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border-color: #667eea;
  }

  .bracket-match:disabled {
    cursor: default;
    opacity: 0.7;
  }

  :global([data-theme='dark']) .bracket-section {
    scrollbar-color: #667eea #1a2332;
  }

  :global([data-theme='dark']) .bracket-section::-webkit-scrollbar-track {
    background: #1a2332;
  }

  :global([data-theme='dark']) .bracket-match {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .bracket-match:hover:not(:disabled) {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .match-participant {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.6rem;
    transition: background-color 0.15s;
  }

  .match-participant.winner {
    background: rgba(16, 185, 129, 0.08);
  }

  .match-participant.tbd {
    opacity: 0.5;
  }

  .match-participant.bye {
    opacity: 0.4;
    font-style: italic;
    color: #9ca3af;
  }

  .bracket-match.bye-match {
    opacity: 0.5;
    border-style: dashed;
    cursor: default;
  }

  :global([data-theme='dark']) .match-participant.bye {
    color: #6b7280;
  }

  .match-participant .participant-name {
    flex: 1;
    font-size: 0.78rem;
    color: #374151;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .match-participant.winner .participant-name {
    font-weight: 600;
    color: #059669;
  }

  :global([data-theme='dark']) .match-participant .participant-name {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .match-participant.winner .participant-name {
    color: #10b981;
  }

  .match-participant .seed {
    font-size: 0.65rem;
    color: #9ca3af;
    font-weight: 500;
  }

  .match-participant .score {
    font-size: 0.8rem;
    font-weight: 700;
    color: #4f46e5;
    min-width: 20px;
    text-align: right;
  }

  :global([data-theme='dark']) .match-participant .score {
    color: #818cf8;
  }

  .vs-divider {
    height: 1px;
    background: #e5e7eb;
  }

  :global([data-theme='dark']) .vs-divider {
    background: #374151;
  }

  /* 3rd/4th place match styles */
  .third-place-round {
    margin-left: 1rem;
    border-left: 2px solid #d4a574;
    padding-left: 1rem;
  }

  .round-name.third-place {
    background: #fef3c7;
    color: #92400e;
    border-left: 2px solid #d97706;
  }

  :global([data-theme='dark']) .round-name.third-place {
    background: rgba(217, 119, 6, 0.15);
    color: #fbbf24;
  }

  .third-place-match {
    border-color: #d4a574;
  }

  .third-place-match:hover:not(:disabled) {
    border-color: #b45309;
    box-shadow: 0 2px 6px rgba(217, 119, 6, 0.15);
  }

  :global([data-theme='dark']) .third-place-match {
    border-color: #92400e;
  }

  :global([data-theme='dark']) .third-place-match:hover:not(:disabled) {
    border-color: #d97706;
    box-shadow: 0 2px 6px rgba(217, 119, 6, 0.2);
  }

  /* Bracket wrapper - Contains division header + bracket */
  .bracket-wrapper {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.75rem;
    margin-bottom: 1rem;
  }

  .bracket-wrapper.gold {
    background: linear-gradient(180deg, rgba(254, 243, 199, 0.4) 0%, #f9fafb 100%);
    border-color: #fcd34d;
  }

  .bracket-wrapper.silver {
    background: linear-gradient(180deg, rgba(229, 231, 235, 0.5) 0%, #f9fafb 100%);
    border-color: #d1d5db;
  }

  :global([data-theme='dark']) .bracket-wrapper {
    background: #0f1419;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .bracket-wrapper.gold {
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, #0f1419 100%);
    border-color: #92400e;
  }

  :global([data-theme='dark']) .bracket-wrapper.silver {
    background: linear-gradient(180deg, rgba(107, 114, 128, 0.1) 0%, #0f1419 100%);
    border-color: #4b5563;
  }

  /* Division headers for Gold/Silver brackets - Professional compact style */
  .bracket-division-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0 0.5rem 0;
    margin: 0;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 0.5rem;
  }

  .bracket-division-header .division-icon {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .bracket-division-header .division-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .bracket-division-header.gold {
    border-bottom-color: #fcd34d;
  }

  .bracket-division-header.gold .division-icon {
    background: #f59e0b;
  }

  .bracket-division-header.gold .division-label {
    color: #92400e;
  }

  .bracket-division-header.silver {
    border-bottom-color: #d1d5db;
  }

  .bracket-division-header.silver .division-icon {
    background: #6b7280;
  }

  .bracket-division-header.silver .division-label {
    color: #4b5563;
  }

  :global([data-theme='dark']) .bracket-division-header {
    border-bottom-color: #374151;
  }

  :global([data-theme='dark']) .bracket-division-header.gold {
    border-bottom-color: #92400e;
  }

  :global([data-theme='dark']) .bracket-division-header.gold .division-label {
    color: #fbbf24;
  }

  :global([data-theme='dark']) .bracket-division-header.silver {
    border-bottom-color: #4b5563;
  }

  :global([data-theme='dark']) .bracket-division-header.silver .division-label {
    color: #9ca3af;
  }

  /* Silver bracket round names */
  .round-name.silver {
    background: #e5e7eb;
    color: #4b5563;
    border-left: 2px solid #6b7280;
  }

  :global([data-theme='dark']) .round-name.silver {
    background: rgba(107, 114, 128, 0.2);
    color: #9ca3af;
  }

  .round-name.third-place.silver {
    background: #f3f4f6;
    color: #6b7280;
    border-left: 2px solid #9ca3af;
  }

  :global([data-theme='dark']) .round-name.third-place.silver {
    background: rgba(75, 85, 99, 0.2);
    color: #9ca3af;
  }

  /* Responsive */
  @media (max-width: 850px) {
    .groups-section {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .tab-navigation {
      padding: 0.15rem;
    }

    .tab-button {
      padding: 0.4rem 0.75rem;
      gap: 0.3rem;
    }

    .tab-button .tab-label {
      font-size: 0.68rem;
    }

    .tab-button .tab-indicator {
      width: 5px;
      height: 5px;
    }

    .group-card {
      padding: 0.75rem;
    }

    .bracket-container {
      gap: 0.75rem;
      padding: 0.15rem 0;
    }

    .bracket-round {
      min-width: 150px;
    }

    .round-name {
      font-size: 0.65rem;
      padding: 0.25rem 0.4rem;
      margin-bottom: 0.5rem;
    }

    .matches-column {
      gap: 0.4rem;
    }

    .match-participant {
      padding: 0.3rem 0.5rem;
      gap: 0.3rem;
    }

    .match-participant .participant-name {
      font-size: 0.72rem;
    }

    .match-participant .score {
      font-size: 0.72rem;
      min-width: 16px;
    }

    .match-participant .seed {
      font-size: 0.6rem;
    }

    .bracket-wrapper {
      padding: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .bracket-division-header {
      padding: 0 0 0.4rem 0;
      margin-bottom: 0.4rem;
    }

    .bracket-division-header .division-label {
      font-size: 0.65rem;
    }

    .bracket-division-header .division-icon {
      width: 6px;
      height: 6px;
    }

    .third-place-round {
      margin-left: 0.5rem;
      padding-left: 0.5rem;
    }

    /* Switch to 1 column on narrow screens */
    .matches-list {
      grid-template-columns: 1fr;
    }

    .consolation-section {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
    }

    .consolation-header {
      gap: 0.3rem;
      padding-bottom: 0.4rem;
      margin-bottom: 0.5rem;
    }

    .consolation-label {
      font-size: 0.65rem;
    }

    .consolation-source-label {
      font-size: 0.6rem;
      padding: 0.15rem 0.4rem;
      margin-bottom: 0.4rem;
    }
  }

  /* Consolation Brackets Section */
  .consolation-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px dashed #e5e7eb;
  }

  :global([data-theme='dark']) .consolation-section {
    border-top-color: #374151;
  }

  .consolation-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding-bottom: 0.5rem;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
  }

  :global([data-theme='dark']) .consolation-header {
    border-bottom-color: #374151;
  }

  .consolation-icon {
    font-size: 0.9rem;
    opacity: 0.7;
  }

  .consolation-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
  }

  :global([data-theme='dark']) .consolation-label {
    color: #9ca3af;
  }

  .consolation-bracket {
    margin-bottom: 1rem;
  }

  .consolation-bracket:last-child {
    margin-bottom: 0;
  }

  .consolation-source-label {
    font-size: 0.65rem;
    font-weight: 600;
    color: #4b5563;
    background: #f3f4f6;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    display: inline-block;
    margin-bottom: 0.5rem;
  }

  :global([data-theme='dark']) .consolation-source-label {
    background: #2d3748;
    color: #9ca3af;
  }

  .bracket-container.consolation {
    padding: 0.5rem 0;
  }

  .round-name.consolation {
    background: #fef3c7;
    color: #92400e;
    border-left: 2px solid #f59e0b;
  }

  :global([data-theme='dark']) .round-name.consolation {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  /* Walkover badge */
  .walkover-badge {
    font-size: 0.6rem;
    font-weight: 700;
    color: #9ca3af;
    background: #f3f4f6;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  :global([data-theme='dark']) .walkover-badge {
    background: #374151;
    color: #6b7280;
  }

  /* Final position badge in consolation brackets */
  .final-position {
    font-size: 0.65rem;
    font-weight: 700;
    color: #059669;
    background: #d1fae5;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    margin-right: 0.25rem;
  }

  :global([data-theme='dark']) .final-position {
    background: rgba(5, 150, 105, 0.2);
    color: #34d399;
  }
</style>
