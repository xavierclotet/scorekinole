<script lang="ts">
  import type { Tournament, GroupMatch, BracketMatch } from '$lib/types/tournament';
  import GroupStandings from './GroupStandings.svelte';
  import MatchResultDialog from './MatchResultDialog.svelte';

  export let tournament: Tournament;

  let activeTab: 'groups' | 'bracket' = tournament.phaseType === 'TWO_PHASE' ? 'groups' : 'bracket';
  let showMatchDialog = false;
  let selectedMatch: GroupMatch | BracketMatch | null = null;
  let isBracketMatch = false;

  // Get participant name by ID
  function getParticipantName(participantId: string | undefined): string {
    if (!participantId) return 'TBD';
    return tournament.participants.find(p => p.id === participantId)?.name || 'Unknown';
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
          <div class="group-card">
            <h3 class="group-title">{group.name}</h3>

            <!-- Standings Table -->
            <div class="standings-section">
              <h4>Clasificación</h4>
              <GroupStandings
                standings={group.standings}
                participants={tournament.participants}
                showElo={tournament.eloConfig.enabled}
              />
            </div>

            <!-- Match Results -->
            <div class="matches-section">
              <h4>Resultados</h4>
              <div class="matches-list">
                {#each getGroupMatches(group) as match (match.id)}
                  {#if match.participantB !== 'BYE'}
                    <button
                      class="match-row"
                      on:click={() => handleMatchClick(match, false)}
                    >
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
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else if activeTab === 'bracket' && tournament.finalStage?.bracket}
      <!-- Bracket View -->
      <div class="bracket-section">
        <div class="bracket-container">
          {#each tournament.finalStage.bracket.rounds as round (round.roundNumber)}
            <div class="bracket-round">
              <h3 class="round-name">{round.name}</h3>
              <div class="matches-column">
                {#each round.matches as match (match.id)}
                  <button
                    class="bracket-match"
                    class:clickable={match.participantA && match.participantB}
                    on:click={() => match.participantA && match.participantB && handleMatchClick(match, true)}
                    disabled={!match.participantA || !match.participantB}
                  >
                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantA}
                      class:tbd={!match.participantA}
                    >
                      <span class="participant-name">{getParticipantName(match.participantA)}</span>
                      {#if match.seedA}
                        <span class="seed">#{match.seedA}</span>
                      {/if}
                      {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                        <span class="score">{match.totalPointsA || 0}</span>
                      {/if}
                    </div>

                    <div class="vs-divider"></div>

                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantB}
                      class:tbd={!match.participantB}
                    >
                      <span class="participant-name">{getParticipantName(match.participantB)}</span>
                      {#if match.seedB}
                        <span class="seed">#{match.seedB}</span>
                      {/if}
                      {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                        <span class="score">{match.totalPointsB || 0}</span>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
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
    border-radius: 12px;
    padding: 1.5rem;
  }

  :global([data-theme='dark']) .group-card {
    background: #0f1419;
  }

  .group-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 1.5rem 0;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid #e5e7eb;
  }

  :global([data-theme='dark']) .group-title {
    color: #e1e8ed;
    border-bottom-color: #2d3748;
  }

  .standings-section,
  .matches-section {
    margin-bottom: 1.5rem;
  }

  .standings-section h4,
  .matches-section h4 {
    font-size: 0.9rem;
    font-weight: 600;
    color: #6b7280;
    margin: 0 0 0.75rem 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  :global([data-theme='dark']) .standings-section h4,
  :global([data-theme='dark']) .matches-section h4 {
    color: #8b9bb3;
  }

  /* Matches List */
  .matches-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .match-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
    text-align: left;
  }

  .match-row:hover {
    background: #f3f4f6;
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

  .match-row .participant {
    flex: 1;
    font-size: 0.9rem;
    color: #374151;
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
    padding: 0.25rem 0.75rem;
    background: #e5e7eb;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.85rem;
    color: #374151;
    min-width: 60px;
    text-align: center;
  }

  :global([data-theme='dark']) .match-row .score {
    background: #2d3748;
    color: #e1e8ed;
  }

  /* Bracket Section */
  .bracket-section {
    overflow-x: auto;
    padding: 1rem 0;
  }

  .bracket-container {
    display: flex;
    gap: 2rem;
    min-width: fit-content;
    padding: 0 1rem;
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
  }
</style>
