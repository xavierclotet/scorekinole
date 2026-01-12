<script lang="ts">
  import type {
    Tournament,
    Group,
    GroupMatch,
    TournamentParticipant
  } from '$lib/types/tournament';
  import GroupStandings from './GroupStandings.svelte';
  import MatchSchedule from './MatchSchedule.svelte';

  export let tournament: Tournament;
  export let onMatchClick: ((match: GroupMatch) => void) | undefined = undefined;

  let selectedGroupId: string | null = null;
  let selectedView: 'schedule' | 'standings' = 'schedule';
  let filterTable: number | null = null;
  let filterStatus: string | null = null;

  // Ensure groups is always an array (Firestore may return object with numeric keys)
  $: groups = (() => {
    const groupsData = tournament.groupStage?.groups;
    if (!groupsData) return [];
    if (Array.isArray(groupsData)) return groupsData;
    // Convert object to array if needed
    return Object.values(groupsData);
  })();

  $: currentRound = tournament.groupStage?.currentRound || 1;
  $: totalRounds = tournament.groupStage?.totalRounds || 0;
  $: isSwiss = tournament.groupStageType === 'SWISS';

  // Auto-select first group
  $: if (groups.length > 0 && !selectedGroupId) {
    selectedGroupId = groups[0].id;
  }

  $: selectedGroup = groups.find(g => g.id === selectedGroupId) || null;

  // Get rounds for selected group (ensure it's an array)
  $: rounds = (() => {
    if (!selectedGroup) return [];
    const data = selectedGroup.schedule || selectedGroup.pairings;
    if (!data) return [];
    return Array.isArray(data) ? data : Object.values(data);
  })();

  // Calculate overall progress
  $: overallProgress = (() => {
    let totalMatches = 0;
    let completedMatches = 0;

    groups.forEach(group => {
      let allMatches: any[] = [];

      if (group.schedule) {
        const schedule = Array.isArray(group.schedule) ? group.schedule : Object.values(group.schedule);
        allMatches = schedule.flatMap(r => {
          const matches = r.matches;
          return Array.isArray(matches) ? matches : Object.values(matches || {});
        });
      } else if (group.pairings) {
        const pairings = Array.isArray(group.pairings) ? group.pairings : Object.values(group.pairings);
        allMatches = pairings.flatMap(p => {
          const matches = p.matches;
          return Array.isArray(matches) ? matches : Object.values(matches || {});
        });
      }

      totalMatches += allMatches.length;
      completedMatches += allMatches.filter(
        m => m.status === 'COMPLETED' || m.status === 'WALKOVER'
      ).length;
    });

    return {
      completed: completedMatches,
      total: totalMatches,
      percentage: totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0
    };
  })();

  // Get available tables
  $: availableTables = Array.from({ length: tournament.numTables }, (_, i) => i + 1);

  function selectGroup(groupId: string) {
    selectedGroupId = groupId;
  }
</script>

<div class="groups-view">
  <!-- Header with progress -->
  <div class="view-header">
    <div class="header-content">
      <h2>
        {isSwiss ? 'Sistema Suizo' : 'Fase de Grupos'}
      </h2>
      <div class="round-info">
        <span class="round-label">Ronda {currentRound} de {totalRounds}</span>
        <div class="overall-progress">
          <span class="progress-text">{overallProgress.completed}/{overallProgress.total}</span>
          <div class="progress-bar">
            <div class="progress-fill" style="width: {overallProgress.percentage}%"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Filters -->
  <div class="filters-bar">
    <div class="filter-group">
      <label for="table-filter">Mesa:</label>
      <select id="table-filter" bind:value={filterTable}>
        <option value={null}>Todas</option>
        {#each availableTables as table}
          <option value={table}>Mesa {table}</option>
        {/each}
      </select>
    </div>

    <div class="filter-group">
      <label for="status-filter">Estado:</label>
      <select id="status-filter" bind:value={filterStatus}>
        <option value={null}>Todos</option>
        <option value="PENDING">Pendiente</option>
        <option value="IN_PROGRESS">En curso</option>
        <option value="COMPLETED">Finalizado</option>
        <option value="WALKOVER">Walkover</option>
      </select>
    </div>
  </div>

  <!-- Group tabs (only for Round Robin with multiple groups) -->
  {#if !isSwiss && groups.length > 1}
    <div class="group-tabs">
      {#each groups as group (group.id)}
        <button
          class="group-tab"
          class:active={selectedGroupId === group.id}
          on:click={() => selectGroup(group.id)}
        >
          {group.name}
        </button>
      {/each}
    </div>
  {/if}

  {#if selectedGroup}
    <!-- View toggle -->
    <div class="view-toggle">
      <button
        class="toggle-btn"
        class:active={selectedView === 'schedule'}
        on:click={() => selectedView = 'schedule'}
      >
        📅 Calendario
      </button>
      <button
        class="toggle-btn"
        class:active={selectedView === 'standings'}
        on:click={() => selectedView = 'standings'}
      >
        📊 Clasificación
      </button>
    </div>

    <!-- Content -->
    <div class="view-content">
      {#if selectedView === 'schedule'}
        <MatchSchedule
          {rounds}
          participants={tournament.participants}
          {currentRound}
          {onMatchClick}
          {filterTable}
          {filterStatus}
          gameMode={tournament.groupStage?.gameMode || 'rounds'}
        />
      {:else}
        <GroupStandings
          standings={selectedGroup.standings}
          participants={tournament.participants}
          showElo={tournament.eloConfig.enabled}
        />
      {/if}
    </div>
  {:else}
    <div class="no-group-state">
      <p>No hay grupos configurados</p>
    </div>
  {/if}
</div>

<style>
  .groups-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .view-header {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .header-content h2 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
  }

  .round-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .round-label {
    font-size: 0.95rem;
    color: #6b7280;
    font-weight: 600;
    min-width: 120px;
  }

  .overall-progress {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
  }

  .progress-text {
    font-size: 0.9rem;
    color: #374151;
    font-weight: 600;
    min-width: 80px;
  }

  .progress-bar {
    flex: 1;
    height: 10px;
    background: #e5e7eb;
    border-radius: 5px;
    overflow: hidden;
    max-width: 300px;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    transition: width 0.3s ease;
    border-radius: 5px;
  }

  .filters-bar {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-group label {
    font-size: 0.9rem;
    color: #6b7280;
    font-weight: 500;
  }

  .filter-group select {
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: white;
    color: #1f2937;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-group select:hover {
    border-color: #9ca3af;
  }

  .filter-group select:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .group-tabs {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
  }

  .group-tab {
    padding: 0.75rem 1.5rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    color: #6b7280;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .group-tab:hover {
    border-color: #667eea;
    color: #667eea;
  }

  .group-tab.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-color: transparent;
    color: white;
  }

  .view-toggle {
    display: flex;
    gap: 0.5rem;
    background: white;
    padding: 0.5rem;
    border-radius: 10px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .toggle-btn {
    flex: 1;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #6b7280;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .toggle-btn.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .view-content {
    min-height: 400px;
  }

  .no-group-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
    color: #9ca3af;
    font-size: 1.1rem;
  }

  /* Dark mode support */
  :global([data-theme='dark']) .view-header {
    background: #1a2332;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  :global([data-theme='dark']) .header-content h2 {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .round-label {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .progress-text {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .progress-bar {
    background: #2d3748;
  }

  :global([data-theme='dark']) .filter-group label {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .filter-group select {
    background: #1a2332;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .filter-group select:hover {
    border-color: #4b5563;
  }

  :global([data-theme='dark']) .group-tab {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .group-tab:hover {
    border-color: #667eea;
    color: #667eea;
  }

  :global([data-theme='dark']) .view-toggle {
    background: #1a2332;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  :global([data-theme='dark']) .toggle-btn {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .toggle-btn:hover {
    background: #0f1419;
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .no-group-state {
    color: #6b7280;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .groups-view {
      gap: 1rem;
    }

    .view-header {
      padding: 1rem;
    }

    .header-content h2 {
      font-size: 1.3rem;
      margin-bottom: 0.75rem;
    }

    .round-info {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .round-label {
      font-size: 0.85rem;
      min-width: auto;
    }

    .overall-progress {
      width: 100%;
      gap: 0.75rem;
    }

    .progress-text {
      font-size: 0.85rem;
      min-width: 70px;
    }

    .progress-bar {
      max-width: none;
    }

    .filters-bar {
      gap: 0.75rem;
    }

    .filter-group {
      gap: 0.375rem;
    }

    .filter-group label {
      font-size: 0.85rem;
    }

    .filter-group select {
      padding: 0.4rem 0.6rem;
      font-size: 0.85rem;
    }

    .group-tab {
      padding: 0.6rem 1.2rem;
      font-size: 0.85rem;
    }

    .toggle-btn {
      padding: 0.6rem 0.75rem;
      font-size: 0.85rem;
    }

    .view-content {
      min-height: 300px;
    }

    .no-group-state {
      min-height: 300px;
      font-size: 1rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .groups-view {
      gap: 0.75rem;
    }

    .view-header {
      padding: 0.75rem;
    }

    .header-content h2 {
      font-size: 1.2rem;
      margin-bottom: 0.5rem;
    }

    .round-label {
      font-size: 0.8rem;
    }

    .progress-bar {
      height: 8px;
    }

    .group-tab {
      padding: 0.5rem 1rem;
      font-size: 0.8rem;
    }

    .toggle-btn {
      padding: 0.5rem 0.6rem;
      font-size: 0.8rem;
    }

    .view-content {
      min-height: 250px;
    }
  }
</style>
