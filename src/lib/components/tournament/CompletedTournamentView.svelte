<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Tournament, GroupMatch, BracketMatch } from '$lib/types/tournament';
  import GroupStandings from './GroupStandings.svelte';
  import MatchResultDialog from './MatchResultDialog.svelte';
  import { BYE_PARTICIPANT, isBye } from '$lib/algorithms/bracket';
  import { recalculateStandings } from '$lib/firebase/tournamentGroups';
  import { t } from '$lib/stores/language';

  const dispatch = createEventDispatcher<{ updated: void }>();

  // Track which groups are recalculating
  let recalculatingGroups = new Set<string>();

  export let tournament: Tournament;

  // Translate group name based on language
  // Handles: identifiers (SINGLE_GROUP, GROUP_A), legacy Spanish names, and Swiss
  function translateGroupName(name: string): string {
    if (name === 'Swiss') return $t('swissSystem');
    // New identifier format
    if (name === 'SINGLE_GROUP') return $t('singleGroup');
    const idMatch = name.match(/^GROUP_([A-H])$/);
    if (idMatch) {
      return `${$t('group')} ${idMatch[1]}`;
    }
    // Legacy Spanish format (for existing tournaments)
    if (name === 'Grupo Único') return $t('singleGroup');
    const legacyMatch = name.match(/^Grupo ([A-H])$/);
    if (legacyMatch) {
      return `${$t('group')} ${legacyMatch[1]}`;
    }
    return name;
  }

  let activeTab: 'groups' | 'bracket' = tournament.phaseType === 'TWO_PHASE' ? 'groups' : 'bracket';
  let showMatchDialog = false;
  let expandedResults: Set<string> = new Set(); // Track which group results are expanded
  let selectedMatch: GroupMatch | BracketMatch | null = null;

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
  let isBracketMatch = false;

  // Check if this is a split divisions tournament
  $: isSplitDivisions = tournament.finalStage?.mode === 'SPLIT_DIVISIONS';
  $: goldBracket = tournament.finalStage?.bracket;
  $: silverBracket = tournament.finalStage?.silverBracket;

  // Match configuration - determines if we show games won or total points
  $: goldMatchesToWin = tournament.finalStage?.matchesToWin || 1;
  $: silverMatchesToWin = tournament.finalStage?.silverMatchesToWin || 1;
  $: showGoldGamesWon = goldMatchesToWin > 1;
  $: showSilverGamesWon = silverMatchesToWin > 1;

  // Sort participants by final position for the final standings
  $: sortedParticipants = [...tournament.participants]
    .filter(p => p.status === 'ACTIVE' && p.finalPosition)
    .sort((a, b) => (a.finalPosition || 999) - (b.finalPosition || 999));

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
        // Dispatch event to parent to reload tournament data
        dispatch('updated');
      }
    } catch (err) {
      console.error('Error recalculating standings:', err);
    } finally {
      recalculatingGroups.delete(groupId);
      recalculatingGroups = recalculatingGroups;
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
  $: dialogMatch = selectedMatch ? {
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
  } as GroupMatch : null;
</script>

<div class="completed-view">
  <!-- Final Standings with Ranking - Compact Grid Layout -->
  <div class="final-standings-section">
    <div class="standings-grid" class:with-ranking={tournament.rankingConfig?.enabled}>
      {#each sortedParticipants as participant (participant.id)}
        {@const delta = getRankingDelta(participant)}
        {@const pos = participant.finalPosition || 0}
        <div class="standing-row" class:top-3={pos <= 3} class:first={pos === 1} class:second={pos === 2} class:third={pos === 3}>
          <span class="pos">{getPositionDisplay(pos)}</span>
          <span class="name">{participant.name}</span>
          {#if tournament.rankingConfig?.enabled}
            <span class="ranking">{participant.currentRanking}</span>
            <span class="delta" class:positive={delta > 0} class:negative={delta < 0}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
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
        on:click={() => activeTab = 'groups'}
      >
        📊 Fase de Grupos
      </button>
    {/if}
    <button
      class="tab-button"
      class:active={activeTab === 'bracket'}
      on:click={() => activeTab = 'bracket'}
    >
      🏆 Fase Final
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
                  {$t('standings')}
                  <span class="ranking-system-badge">{rankSystem === 'POINTS' ? $t('byPoints') : $t('byWins')}</span>
                </h4>
                <button
                  class="recalc-btn"
                  on:click={() => handleRecalculateStandings(group.id)}
                  disabled={recalculatingGroups.has(group.id)}
                  title={$t('recalculateStandings')}
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
                showElo={tournament.rankingConfig?.enabled}
                isSwiss={tournament.groupStage?.type === 'SWISS'}
                rankingSystem={tournament.groupStage?.rankingSystem || tournament.groupStage?.swissRankingSystem || 'WINS'}
              />
            </div>

            <!-- Match Results by Round - Collapsible -->
            <div class="matches-section">
              <button
                class="results-accordion-header"
                on:click={() => toggleResults(group.id)}
                aria-expanded={expandedResults.has(group.id)}
              >
                <span class="accordion-icon" class:expanded={expandedResults.has(group.id)}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                  </svg>
                </span>
                <span class="accordion-title">{$t('results')}</span>
                <span class="matches-count">{getGroupMatches(group).length}</span>
              </button>

              {#if expandedResults.has(group.id)}
                <div class="results-content">
                  {#each getGroupRounds(group) as round (round.roundNumber)}
                    <div class="round-group">
                      <div class="round-divider">
                        <span class="round-label">{$t('round')} {round.roundNumber}</span>
                      </div>
                      <div class="matches-list">
                        {#each round.matches as match (match.id)}
                          <button
                            class="match-row"
                            on:click={() => handleMatchClick(match, false)}
                          >
                            {#if match.tableNumber}
                              <span class="table-badge">M{match.tableNumber}</span>
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
    {:else if activeTab === 'bracket' && tournament.finalStage?.bracket}
      <!-- Bracket View -->
      <div class="bracket-section">
        <!-- Gold Bracket (or single bracket) -->
        {#if isSplitDivisions}
          <h3 class="bracket-division-title gold">🥇 Liga Oro</h3>
        {/if}
        <div class="bracket-container">
          {#each tournament.finalStage.bracket.rounds as round (round.roundNumber)}
            <div class="bracket-round">
              <h3 class="round-name">{round.name}</h3>
              <div class="matches-column">
                {#each round.matches as match (match.id)}
                  <button
                    class="bracket-match"
                    class:clickable={match.participantA && match.participantB && !isByeMatch(match)}
                    class:bye-match={isByeMatch(match)}
                    on:click={() => match.participantA && match.participantB && !isByeMatch(match) && handleMatchClick(match, true)}
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
          {#if tournament.finalStage.bracket.thirdPlaceMatch}
            {@const thirdPlaceMatch = tournament.finalStage.bracket.thirdPlaceMatch}
            <div class="bracket-round third-place-round">
              <h3 class="round-name third-place">3º y 4º Puesto</h3>
              <div class="matches-column">
                <button
                  class="bracket-match third-place-match"
                  class:clickable={thirdPlaceMatch.participantA && thirdPlaceMatch.participantB}
                  on:click={() => thirdPlaceMatch.participantA && thirdPlaceMatch.participantB && handleMatchClick(thirdPlaceMatch, true)}
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

        <!-- Silver Bracket (only for SPLIT_DIVISIONS) -->
        {#if isSplitDivisions && silverBracket}
          <h3 class="bracket-division-title silver">🥈 Liga Plata</h3>
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
                      on:click={() => match.participantA && match.participantB && !isByeMatch(match) && handleMatchClick(match, true)}
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
                <h3 class="round-name third-place silver">3º y 4º Puesto</h3>
                <div class="matches-column">
                  <button
                    class="bracket-match third-place-match"
                    class:clickable={silverThirdPlace.participantA && silverThirdPlace.participantB}
                    on:click={() => silverThirdPlace.participantA && silverThirdPlace.participantB && handleMatchClick(silverThirdPlace, true)}
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
    on:close={handleCloseDialog}
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

  .standings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.35rem;
  }

  .standings-grid.with-ranking {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
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

  .standing-row.top-3 {
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

  :global([data-theme='dark']) .standing-row.top-3 {
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

  .standing-row .delta {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    min-width: 2rem;
    text-align: center;
  }

  .standing-row .delta.positive {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .standing-row .delta.negative {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  /* Tab Navigation */
  .tab-navigation {
    display: flex;
    gap: 0;
    border-bottom: 2px solid #e5e7eb;
    margin-bottom: 1.5rem;
  }

  .tab-button {
    flex: 1;
    padding: 1rem 1.5rem;
    background: none;
    border: none;
    font-size: 1rem;
    font-weight: 600;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
  }

  .tab-button:hover {
    color: #374151;
    background: #f9fafb;
  }

  .tab-button.active {
    color: #667eea;
    border-bottom-color: #667eea;
  }

  :global([data-theme='dark']) .tab-navigation {
    border-bottom-color: #2d3748;
  }

  :global([data-theme='dark']) .tab-button {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .tab-button:hover {
    color: #e1e8ed;
    background: #0f1419;
  }

  :global([data-theme='dark']) .tab-button.active {
    color: #667eea;
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
    padding: 1rem 0;
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
    gap: 2rem;
    min-width: max-content;
    padding: 0 1rem 1rem 1rem;
  }

  .bracket-round {
    min-width: 220px;
  }

  .round-name {
    font-size: 1rem;
    font-weight: 700;
    color: #374151;
    margin: 0 0 1rem 0;
    text-align: center;
    padding: 0.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 8px;
  }

  .matches-column {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    justify-content: space-around;
    min-height: 100%;
  }

  .bracket-match {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
  }

  .bracket-match:hover:not(:disabled) {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    transition: background-color 0.2s;
  }

  .match-participant.winner {
    background: rgba(16, 185, 129, 0.1);
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
    opacity: 0.6;
    border-style: dashed;
    cursor: default;
  }

  :global([data-theme='dark']) .match-participant.bye {
    color: #6b7280;
  }

  .match-participant .participant-name {
    flex: 1;
    font-size: 0.9rem;
    color: #374151;
    font-weight: 500;
  }

  .match-participant.winner .participant-name {
    font-weight: 700;
    color: #10b981;
  }

  :global([data-theme='dark']) .match-participant .participant-name {
    color: #e1e8ed;
  }

  .match-participant .seed {
    font-size: 0.75rem;
    color: #9ca3af;
    font-weight: 600;
  }

  .match-participant .score {
    font-size: 0.9rem;
    font-weight: 700;
    color: #667eea;
    min-width: 24px;
    text-align: right;
  }

  .vs-divider {
    height: 1px;
    background: #e5e7eb;
  }

  :global([data-theme='dark']) .vs-divider {
    background: #2d3748;
  }

  /* 3rd/4th place match styles */
  .third-place-round {
    margin-left: 2rem;
    border-left: 3px dashed #d97706;
    padding-left: 2rem;
  }

  .round-name.third-place {
    background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
  }

  .third-place-match {
    border-color: #d97706;
  }

  .third-place-match:hover:not(:disabled) {
    border-color: #b45309;
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.2);
  }

  :global([data-theme='dark']) .third-place-match {
    border-color: #d97706;
  }

  :global([data-theme='dark']) .third-place-match:hover:not(:disabled) {
    border-color: #f59e0b;
    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3);
  }

  /* Division titles for Gold/Silver brackets */
  .bracket-division-title {
    font-size: 1.3rem;
    font-weight: 700;
    text-align: center;
    padding: 1rem;
    margin: 1.5rem 0 1rem 0;
    border-radius: 12px;
  }

  .bracket-division-title.gold {
    background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%);
    color: #92400e;
  }

  .bracket-division-title.silver {
    background: linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%);
    color: #374151;
    margin-top: 2.5rem;
  }

  :global([data-theme='dark']) .bracket-division-title.gold {
    background: linear-gradient(135deg, #78350f 0%, #b45309 100%);
    color: #fbbf24;
  }

  :global([data-theme='dark']) .bracket-division-title.silver {
    background: linear-gradient(135deg, #374151 0%, #6b7280 100%);
    color: #e5e7eb;
  }

  /* Silver bracket round names */
  .round-name.silver {
    background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
  }

  .round-name.third-place.silver {
    background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  }

  /* Responsive */
  @media (max-width: 850px) {
    .groups-section {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .tab-button {
      padding: 0.75rem 1rem;
      font-size: 0.9rem;
    }

    .group-card {
      padding: 1rem;
    }

    .bracket-round {
      min-width: 180px;
    }

    .match-participant {
      padding: 0.5rem 0.75rem;
    }

    .match-participant .participant-name {
      font-size: 0.85rem;
    }

    /* Switch to 1 column on narrow screens */
    .matches-list {
      grid-template-columns: 1fr;
    }
  }
</style>
