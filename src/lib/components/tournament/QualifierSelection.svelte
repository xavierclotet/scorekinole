<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Tournament } from '$lib/types/tournament';

  export let tournament: Tournament;
  export let groupIndex: number;

  const dispatch = createEventDispatcher<{
    update: string[]; // Array of qualified participant IDs
  }>();

  let topNValue = 4; // Default to top 4

  // Ensure groups is an array (Firestore may return object)
  $: groups = Array.isArray(tournament.groupStage?.groups)
    ? tournament.groupStage.groups
    : Object.values(tournament.groupStage?.groups || {});

  // Auto-select when topNValue changes
  $: if (topNValue >= 1 && topNValue <= 10 && standings.length > 0) {
    selectTop(topNValue);
  }

  $: group = groups[groupIndex];

  // Ensure standings is an array and sort by position
  $: standings = (() => {
    if (!group?.standings) return [];
    const arr = Array.isArray(group.standings) ? group.standings : Object.values(group.standings);
    return arr.sort((a: any, b: any) => a.position - b.position);
  })();

  $: participantMap = new Map(tournament.participants.map(p => [p.id, p]));

  // Local state for selection (make it reactive to standings changes)
  // If no qualifiers set yet, auto-select top 2 by default
  $: selectedParticipants = (() => {
    const currentQualified = standings.filter((s: any) => s.qualifiedForFinal).map((s: any) => s.participantId);

    // If no qualifiers selected yet, auto-select top 2
    if (currentQualified.length === 0 && standings.length >= 2) {
      const top2 = standings
        .sort((a: any, b: any) => a.position - b.position)
        .slice(0, 2)
        .map((s: any) => s.participantId);

      // Dispatch the auto-selection
      if (top2.length > 0) {
        setTimeout(() => dispatch('update', top2), 0);
      }

      return new Set<string>(top2);
    }

    return new Set<string>(currentQualified);
  })();

  function toggleParticipant(participantId: string) {
    if (selectedParticipants.has(participantId)) {
      selectedParticipants.delete(participantId);
    } else {
      selectedParticipants.add(participantId);
    }
    selectedParticipants = selectedParticipants; // Trigger reactivity
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

  function clearSelection() {
    selectedParticipants = new Set();
    dispatch('update', Array.from(selectedParticipants));
  }

  function getParticipantName(participantId: string): string {
    return participantMap.get(participantId)?.name || 'Unknown';
  }

  $: selectedCount = selectedParticipants.size;
</script>

<div class="qualifier-selection">
  <div class="group-header">
    <h3>{group?.name}</h3>
    <div class="selection-info">
      <span class="count">{selectedCount} clasificados</span>
      <label class="top-n-label">
        <span>Top</span>
        <input
          type="number"
          class="top-n-input"
          bind:value={topNValue}
          min="1"
          max="10"
        />
      </label>
      <button class="quick-btn clear" on:click={clearSelection}>✕</button>
    </div>
  </div>

  <!-- Standings table with checkboxes -->
  <div class="standings-table">
    <table>
      <thead>
        <tr>
          <th class="checkbox-col"></th>
          <th class="pos-col">#</th>
          <th class="name-col">Participante</th>
          <th class="matches-col">PJ</th>
          <th class="wins-col">G</th>
          <th class="losses-col">P</th>
          <th class="ties-col">E</th>
          <th class="points-col">Pts</th>
          <th class="twenties-col">20s</th>
          <th class="scored-col">Puntos</th>
        </tr>
      </thead>
      <tbody>
        {#each standings as standing}
          {@const isSelected = selectedParticipants.has(standing.participantId)}
          <tr
            class:selected={isSelected}
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
              <span class="position-badge" class:selected={isSelected}>
                {standing.position}
              </span>
            </td>
            <td class="name-col">{getParticipantName(standing.participantId)}</td>
            <td class="matches-col">{standing.matchesPlayed}</td>
            <td class="wins-col">{standing.matchesWon}</td>
            <td class="losses-col">{standing.matchesLost}</td>
            <td class="ties-col">{standing.matchesTied}</td>
            <td class="points-col"><strong>{standing.points}</strong></td>
            <td class="twenties-col">{standing.total20s}</td>
            <td class="scored-col">{standing.totalPointsScored}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .qualifier-selection {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 1.5rem;
    transition: all 0.3s;
  }

  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .group-header h3 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 700;
    color: #1a1a1a;
  }

  .selection-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .count {
    background: #667eea;
    color: white;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .quick-select {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .top-n-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  :global([data-theme='dark']) .top-n-label {
    color: #e1e8ed;
  }

  .top-n-input {
    width: 50px;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: center;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    color: #1a1a1a;
    transition: all 0.2s;
  }

  .top-n-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.15);
  }

  :global([data-theme='dark']) .top-n-input {
    background: #0f1419;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .top-n-input:focus {
    border-color: #667eea;
  }

  .quick-btn {
    padding: 0.4rem 0.8rem;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #1a1a1a;
    cursor: pointer;
    transition: all 0.2s;
  }

  .quick-btn:hover {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }

  .quick-btn.clear {
    background: #fee;
    border-color: #fcc;
    color: #c00;
  }

  .quick-btn.clear:hover {
    background: #fcc;
  }

  .standings-table {
    max-height: 400px;
    overflow-y: auto;
    overflow-x: auto;
    border-radius: 8px;
  }

  /* Scrollbar styling - Green theme */
  .standings-table::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .standings-table::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  .standings-table::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 4px;
  }

  .standings-table::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  thead {
    background: #f9fafb;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th {
    padding: 0.75rem 0.5rem;
    text-align: center;
    font-weight: 700;
    color: #6b7280;
    font-size: 0.85rem;
    border-bottom: 2px solid #e5e7eb;
    white-space: nowrap;
  }

  tbody tr {
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 1px solid #f3f4f6;
  }

  tbody tr:hover {
    background: #f9fafb;
  }

  tbody tr.selected {
    background: #eff6ff;
  }

  td {
    padding: 0.6rem 0.5rem;
    text-align: center;
    color: #1a1a1a;
  }

  .checkbox-col {
    width: 40px;
  }

  .checkbox-col input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    cursor: pointer;
  }

  .pos-col {
    width: 50px;
  }

  .position-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 50%;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .position-badge.selected {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  }

  .name-col {
    text-align: left;
    font-weight: 600;
    min-width: 150px;
  }

  .matches-col,
  .wins-col,
  .losses-col,
  .ties-col {
    width: 50px;
    font-size: 0.85rem;
  }

  .points-col {
    width: 60px;
    font-weight: 700;
    color: #667eea;
  }

  .twenties-col {
    width: 60px;
    color: #f59e0b;
    font-weight: 600;
  }

  .scored-col {
    width: 80px;
    color: #6b7280;
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
    border-bottom-color: #2d3748;
  }

  :global([data-theme='dark']) tbody tr:hover {
    background: #2d3748;
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

  /* Responsive */
  @media (max-width: 600px) {
    .qualifier-selection {
      padding: 1rem;
    }

    .group-header h3 {
      font-size: 1.1rem;
    }

    table {
      font-size: 0.8rem;
    }

    th {
      padding: 0.6rem 0.4rem;
      font-size: 0.75rem;
    }

    td {
      padding: 0.5rem 0.4rem;
    }

    .position-badge {
      width: 1.5rem;
      height: 1.5rem;
      font-size: 0.75rem;
    }

    .name-col {
      min-width: 120px;
      font-size: 0.85rem;
    }

    .matches-col,
    .wins-col,
    .losses-col,
    .ties-col {
      width: 40px;
      font-size: 0.75rem;
    }

    .checkbox-col input[type="checkbox"] {
      width: 1rem;
      height: 1rem;
    }
  }
</style>
