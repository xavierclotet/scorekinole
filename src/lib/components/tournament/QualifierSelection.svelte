<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Tournament } from '$lib/types/tournament';
  import { t } from '$lib/stores/language';

  export let tournament: Tournament;
  export let groupIndex: number;
  export let topN: number = 2; // Controlled from parent
  export let showTopControl: boolean = false; // Only show in first group or externally

  const dispatch = createEventDispatcher<{
    update: string[]; // Array of qualified participant IDs
  }>();

  // Modal state for player matches
  let showMatchesModal = false;
  let selectedPlayerId: string | null = null;
  let selectedPlayerMatches: Array<{
    opponent: string;
    opponentName: string;
    result: 'win' | 'loss' | 'tie';
    scoreA: number;
    scoreB: number;
    roundNumber: number;
  }> = [];

  // Ensure groups is an array (Firestore may return object)
  $: groups = Array.isArray(tournament.groupStage?.groups)
    ? tournament.groupStage.groups
    : Object.values(tournament.groupStage?.groups || {});

  // Get ranking configuration
  $: isSwiss = tournament.groupStage?.type === 'SWISS';
  $: rankingSystem = (tournament.groupStage?.rankingSystem || tournament.groupStage?.swissRankingSystem || 'WINS') as 'WINS' | 'POINTS';

  // Track previous topN to detect changes
  let previousTopN = topN;

  // Auto-select when topN prop changes from parent
  $: if (topN !== previousTopN && topN >= 1 && topN <= 10 && standings.length > 0) {
    previousTopN = topN;
    selectTop(topN);
  }

  $: group = groups[groupIndex];

  // Ensure standings is an array and sort by position
  $: standings = (() => {
    if (!group?.standings) return [];
    const arr = Array.isArray(group.standings) ? group.standings : Object.values(group.standings);
    return arr.sort((a: any, b: any) => a.position - b.position);
  })();

  $: participantMap = new Map(tournament.participants.map(p => [p.id, p]));

  // Local state for selection - NOT reactive to avoid overwriting manual changes
  let selectedParticipants = new Set<string>();
  let initialized = false;

  // Initialize selection only once when standings become available
  $: if (standings.length > 0 && !initialized) {
    initialized = true;
    const currentQualified = standings.filter((s: any) => s.qualifiedForFinal).map((s: any) => s.participantId);

    // If no qualifiers set yet, auto-select topN participants
    if (currentQualified.length === 0 && standings.length >= topN) {
      const topNList = standings
        .sort((a: any, b: any) => a.position - b.position)
        .slice(0, topN)
        .map((s: any) => s.participantId);

      selectedParticipants = new Set<string>(topNList);

      // Dispatch the auto-selection
      if (topNList.length > 0) {
        setTimeout(() => dispatch('update', topNList), 0);
      }
    } else {
      selectedParticipants = new Set<string>(currentQualified);
    }
  }

  function toggleParticipant(participantId: string) {
    // Create a new Set to ensure Svelte reactivity
    const newSet = new Set(selectedParticipants);
    if (newSet.has(participantId)) {
      newSet.delete(participantId);
    } else {
      newSet.add(participantId);
    }
    selectedParticipants = newSet; // Assign new Set to trigger reactivity
    dispatch('update', Array.from(selectedParticipants));
  }

  function selectTop(n: number) {
    selectedParticipants = new Set(
      standings
        .sort((a: any, b: any) => a.position - b.position)
        .slice(0, n)
        .map((s: any) => s.participantId)
    );
    dispatch('update', Array.from(selectedParticipants));
  }

  function getParticipantName(participantId: string): string {
    return participantMap.get(participantId)?.name || 'Unknown';
  }

  function getTiedWithNames(tiedWith: string[] | undefined): string {
    if (!tiedWith || tiedWith.length === 0) return '';
    return tiedWith.map(id => getParticipantName(id)).join(', ');
  }

  function openPlayerMatches(participantId: string, event: MouseEvent) {
    event.stopPropagation(); // Don't trigger row selection
    selectedPlayerId = participantId;
    selectedPlayerMatches = [];

    // Get all matches for this player from pairings (Swiss) or schedule (Round Robin)
    const allRounds = group?.pairings || group?.schedule || [];

    for (const round of allRounds) {
      for (const match of round.matches) {
        if (match.participantA === participantId || match.participantB === participantId) {
          // Skip BYE matches
          if (match.participantB === 'BYE' || match.participantA === 'BYE') continue;

          const isPlayerA = match.participantA === participantId;
          const opponentId = isPlayerA ? match.participantB : match.participantA;
          const playerScore = isPlayerA ? (match.totalPointsA ?? 0) : (match.totalPointsB ?? 0);
          const opponentScore = isPlayerA ? (match.totalPointsB ?? 0) : (match.totalPointsA ?? 0);

          let result: 'win' | 'loss' | 'tie' = 'tie';
          if (match.winner === participantId) {
            result = 'win';
          } else if (match.winner && match.winner !== participantId) {
            result = 'loss';
          } else if (playerScore > opponentScore) {
            result = 'win';
          } else if (playerScore < opponentScore) {
            result = 'loss';
          }

          selectedPlayerMatches.push({
            opponent: opponentId,
            opponentName: getParticipantName(opponentId),
            result,
            scoreA: playerScore,
            scoreB: opponentScore,
            roundNumber: round.roundNumber
          });
        }
      }
    }

    // Sort by round number
    selectedPlayerMatches.sort((a, b) => a.roundNumber - b.roundNumber);
    showMatchesModal = true;
  }

  function closeMatchesModal() {
    showMatchesModal = false;
    selectedPlayerId = null;
    selectedPlayerMatches = [];
  }

  $: selectedCount = selectedParticipants.size;
</script>

<div class="qualifier-selection">
  <div class="group-header">
    <h3>{group?.name}</h3>
  </div>

  <!-- Standings table with checkboxes -->
  <div class="standings-table">
    <table>
      <thead>
        <tr>
          <th class="checkbox-col"></th>
          <th class="pos-col">#</th>
          <th class="name-col">{$t('participant')}</th>
          <th class="matches-col">{$t('matchesPlayed')}</th>
          <th class="wins-col">{$t('matchesWon')}</th>
          <th class="losses-col">{$t('matchesLost')}</th>
          <th class="ties-col">{$t('matchesTied')}</th>
          {#if rankingSystem === 'WINS'}
            <th class="points-col primary-col" title={$t('pointsStandard')}>{$t('pointsShort')}</th>
          {/if}
          <th class="twenties-col">{$t('twentiesShort')}</th>
          <th class="scored-col" class:primary-col={rankingSystem === 'POINTS'} title={$t('totalCrokinolePoints')}>PT</th>
        </tr>
      </thead>
      <tbody>
        {#each standings as standing}
          {@const isSelected = selectedParticipants.has(standing.participantId)}
          {@const swissPoints = standing.swissPoints ?? (standing.matchesWon * 2 + standing.matchesTied)}
          {@const hasTie = standing.tiedWith && standing.tiedWith.length > 0}
          {@const tiedNames = getTiedWithNames(standing.tiedWith)}
          <tr
            class:selected={isSelected}
            class:has-tie={hasTie}
            on:click={() => toggleParticipant(standing.participantId)}
            role="button"
            tabindex="0"
          >
            <td class="checkbox-col">
              <input
                type="checkbox"
                checked={isSelected}
                on:click|stopPropagation
                on:change={() => toggleParticipant(standing.participantId)}
              />
            </td>
            <td class="pos-col">
              <span class="position-badge" class:selected={isSelected} class:tied={hasTie}>
                {standing.position}
              </span>
            </td>
            <td class="name-col">
              {getParticipantName(standing.participantId)}
              {#if hasTie}
                <span class="tie-indicator" title="{$t('tiedWith')}: {tiedNames}">⚠️</span>
              {/if}
            </td>
            <td class="matches-col">{standing.matchesPlayed}</td>
            <td class="wins-col">{standing.matchesWon}</td>
            <td class="losses-col">{standing.matchesLost}</td>
            <td class="ties-col">{standing.matchesTied}</td>
            {#if rankingSystem === 'WINS'}
              <td
                class="points-col primary-col clickable-pts"
                on:click={(e) => openPlayerMatches(standing.participantId, e)}
                title={$t('viewMatches')}
              >
                <strong>{isSwiss ? swissPoints : standing.points}</strong>
              </td>
            {/if}
            <td class="twenties-col">{standing.total20s}</td>
            <td class="scored-col" class:primary-col={rankingSystem === 'POINTS'}>
              {#if rankingSystem === 'POINTS'}<strong>{standing.totalPointsScored}</strong>{:else}{standing.totalPointsScored}{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<!-- Player Matches Modal -->
{#if showMatchesModal && selectedPlayerId}
  <div class="modal-overlay" on:click={closeMatchesModal} role="button" tabindex="0" on:keydown={(e) => e.key === 'Escape' && closeMatchesModal()}>
    <div class="modal-content" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>{getParticipantName(selectedPlayerId)}</h3>
        <button class="close-btn" on:click={closeMatchesModal} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        {#if selectedPlayerMatches.length === 0}
          <p class="no-matches">{$t('noMatchesYet')}</p>
        {:else}
          <div class="matches-list">
            {#each selectedPlayerMatches as match}
              <div class="match-item" class:win={match.result === 'win'} class:loss={match.result === 'loss'} class:tie={match.result === 'tie'}>
                <span class="round-badge">R{match.roundNumber}</span>
                <span class="opponent-name">{match.opponentName}</span>
                <span class="match-score">
                  <span class="score-player">{match.scoreA}</span>
                  <span class="score-sep">-</span>
                  <span class="score-opponent">{match.scoreB}</span>
                </span>
                <span class="result-badge" class:win={match.result === 'win'} class:loss={match.result === 'loss'} class:tie={match.result === 'tie'}>
                  {#if match.result === 'win'}W{:else if match.result === 'loss'}L{:else}T{/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .qualifier-selection {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.75rem;
    transition: all 0.3s;
  }

  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .group-header h3 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .selection-info {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .count {
    background: #667eea;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .standings-table {
    overflow-x: auto;
    border-radius: 4px;
  }

  /* Scrollbar styling - Green theme */
  .standings-table::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .standings-table::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  .standings-table::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 3px;
  }

  .standings-table::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  thead {
    background: #f3f4f6;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th {
    padding: 0.35rem 0.25rem;
    text-align: center;
    font-weight: 600;
    color: #6b7280;
    font-size: 0.65rem;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  tbody tr {
    cursor: pointer;
    transition: all 0.15s;
    border-bottom: 1px solid #f3f4f6;
  }

  tbody tr:hover {
    background: #f3f4f6;
  }

  tbody tr.selected {
    background: #eff6ff;
  }

  td {
    padding: 0.3rem 0.25rem;
    text-align: center;
    color: #1a1a1a;
    font-size: 0.75rem;
  }

  .checkbox-col {
    width: 28px;
  }

  .checkbox-col input[type="checkbox"] {
    width: 0.9rem;
    height: 0.9rem;
    cursor: pointer;
  }

  .pos-col {
    width: 32px;
  }

  .position-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: #e5e7eb;
    color: #374151;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .position-badge.selected {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .name-col {
    text-align: left;
    font-weight: 500;
    min-width: 100px;
  }

  .matches-col,
  .wins-col,
  .losses-col,
  .ties-col {
    width: 32px;
    font-size: 0.75rem;
  }

  .points-col {
    width: 36px;
    font-weight: 700;
  }

  .twenties-col {
    width: 36px;
    color: #f59e0b;
    font-weight: 600;
  }

  .scored-col {
    width: 40px;
    color: #6b7280;
  }

  .clickable-pts {
    cursor: pointer;
    transition: all 0.15s;
  }

  .clickable-pts:hover {
    background: rgba(102, 126, 234, 0.15) !important;
    text-decoration: underline;
  }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    max-width: 400px;
    width: 100%;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: #1a1a1a;
  }

  .modal-body {
    padding: 0.75rem;
    overflow-y: auto;
  }

  .no-matches {
    text-align: center;
    color: #6b7280;
    padding: 1rem;
    font-size: 0.85rem;
  }

  .matches-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .match-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    border-radius: 6px;
    border-left: 3px solid #e5e7eb;
  }

  .match-item.win {
    border-left-color: #10b981;
    background: rgba(16, 185, 129, 0.05);
  }

  .match-item.loss {
    border-left-color: #ef4444;
    background: rgba(239, 68, 68, 0.05);
  }

  .match-item.tie {
    border-left-color: #f59e0b;
    background: rgba(245, 158, 11, 0.05);
  }

  .round-badge {
    background: #e5e7eb;
    color: #374151;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 600;
    min-width: 1.5rem;
    text-align: center;
  }

  .opponent-name {
    flex: 1;
    font-size: 0.8rem;
    font-weight: 500;
    color: #1a1a1a;
  }

  .match-score {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    font-family: monospace;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .score-player {
    color: #1a1a1a;
  }

  .score-sep {
    color: #9ca3af;
  }

  .score-opponent {
    color: #6b7280;
  }

  .result-badge {
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 700;
    color: white;
  }

  .result-badge.win {
    background: #10b981;
  }

  .result-badge.loss {
    background: #ef4444;
  }

  .result-badge.tie {
    background: #f59e0b;
  }

  /* Tie indicator */
  .tie-indicator {
    margin-left: 0.2rem;
    cursor: help;
    font-size: 0.7rem;
  }

  tr.has-tie {
    background: rgba(245, 158, 11, 0.08);
  }

  tr.has-tie:hover {
    background: rgba(245, 158, 11, 0.15);
  }

  tr.has-tie.selected {
    background: rgba(245, 158, 11, 0.2);
  }

  .position-badge.tied {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  /* Primary column (used for ranking) */
  .primary-col {
    background: rgba(102, 126, 234, 0.08);
    color: #667eea !important;
  }

  th.primary-col {
    background: rgba(102, 126, 234, 0.15);
  }

  /* Dark mode */
  :global([data-theme='dark']) .qualifier-selection {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .group-header {
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .group-header h3 {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .quick-btn {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .quick-btn:hover {
    background: #667eea;
    color: white;
  }

  :global([data-theme='dark']) .standings-table::-webkit-scrollbar-track {
    background: #0f1419;
  }

  :global([data-theme='dark']) thead {
    background: #0f1419;
  }

  :global([data-theme='dark']) th {
    color: #8b9bb3;
    border-bottom-color: #2d3748;
  }

  :global([data-theme='dark']) tbody tr {
    border-bottom-color: #243447;
  }

  :global([data-theme='dark']) tbody tr:hover {
    background: #0f1419;
  }

  :global([data-theme='dark']) tbody tr.selected {
    background: rgba(102, 126, 234, 0.2);
  }

  :global([data-theme='dark']) td {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .scored-col {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .position-badge {
    background: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .position-badge.selected {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  /* Dark mode tie styles */
  :global([data-theme='dark']) tr.has-tie {
    background: rgba(245, 158, 11, 0.15);
  }

  :global([data-theme='dark']) tr.has-tie:hover {
    background: rgba(245, 158, 11, 0.25);
  }

  :global([data-theme='dark']) tr.has-tie.selected {
    background: rgba(245, 158, 11, 0.3);
  }

  /* Dark mode modal */
  :global([data-theme='dark']) .modal-content {
    background: #1a2332;
  }

  :global([data-theme='dark']) .modal-header {
    background: #0f1419;
    border-bottom-color: #2d3748;
  }

  :global([data-theme='dark']) .modal-header h3 {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .close-btn {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .close-btn:hover {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .no-matches {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .match-item {
    background: #0f1419;
    border-left-color: #2d3748;
  }

  :global([data-theme='dark']) .match-item.win {
    background: rgba(16, 185, 129, 0.1);
  }

  :global([data-theme='dark']) .match-item.loss {
    background: rgba(239, 68, 68, 0.1);
  }

  :global([data-theme='dark']) .match-item.tie {
    background: rgba(245, 158, 11, 0.1);
  }

  :global([data-theme='dark']) .round-badge {
    background: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .opponent-name {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .score-player {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .score-opponent {
    color: #8b9bb3;
  }

  /* Responsive */
  @media (max-width: 600px) {
    .qualifier-selection {
      padding: 0.5rem;
    }

    .group-header h3 {
      font-size: 0.8rem;
    }

    table {
      font-size: 0.7rem;
    }

    th {
      padding: 0.3rem 0.2rem;
      font-size: 0.6rem;
    }

    td {
      padding: 0.25rem 0.2rem;
      font-size: 0.7rem;
    }

    .position-badge {
      width: 1.1rem;
      height: 1.1rem;
      font-size: 0.65rem;
    }

    .name-col {
      min-width: 80px;
    }

    .matches-col,
    .wins-col,
    .losses-col,
    .ties-col {
      width: 26px;
      font-size: 0.7rem;
    }

    .checkbox-col input[type="checkbox"] {
      width: 0.8rem;
      height: 0.8rem;
    }
  }
</style>
