<script lang="ts">
  import type {
    Tournament,
    Group,
    GroupMatch
  } from '$lib/types/tournament';
  import GroupStandings from './GroupStandings.svelte';
  import MatchSchedule from './MatchSchedule.svelte';

  export let tournament: Tournament;
  export let onMatchClick: ((match: GroupMatch) => void) | undefined = undefined;
  export let activeGroupId: string | null = null; // Track which group had recent activity

  let expandedGroups: Set<string> = new Set();
  let groupViews: Record<string, 'schedule' | 'standings'> = {};
  let groupExpandedRounds: Record<string, Set<number>> = {}; // Track expanded rounds per group
  let filterTable: number | null = null;
  let filterStatus: string | null = null;
  let groupsInitialized = false; // Prevent auto-expansion after user interaction
  let lastProcessedActiveGroupId: string | null = null; // Track which activeGroupId was already processed
  let previousRoundCompletionState: Record<string, Record<number, boolean>> = {}; // Track previous completion state

  // Helper functions (defined before reactive statements that use them)
  function getGroupRounds(group: Group) {
    const data = group.schedule || group.pairings;
    if (!data) return [];
    return Array.isArray(data) ? data : Object.values(data);
  }

  function getRoundProgress(matches: any[]): { completed: number; total: number; percentage: number } {
    const safeMatches = Array.isArray(matches) ? matches : Object.values(matches || {});
    const total = safeMatches.length;
    const completed = safeMatches.filter(
      (m: any) => m.status === 'COMPLETED' || m.status === 'WALKOVER'
    ).length;
    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  // Ensure groups is always an array (Firestore may return object with numeric keys)
  $: groups = ((): Group[] => {
    const groupsData = tournament.groupStage?.groups;
    if (!groupsData) return [];
    if (Array.isArray(groupsData)) return groupsData as Group[];
    // Convert object to array if needed
    return Object.values(groupsData) as Group[];
  })();

  $: currentRound = tournament.groupStage?.currentRound || 1;
  $: totalRounds = tournament.groupStage?.totalRounds || 0;
  $: isSwiss = tournament.groupStage?.type === 'SWISS';

  // Auto-expand all groups initially (only once) and initialize round states
  $: if (groups.length > 0 && !groupsInitialized) {
    // If only 1 group, expand it. Otherwise expand all for visibility
    if (groups.length === 1) {
      expandedGroups = new Set([groups[0].id]);
    } else {
      // Expand all groups by default for easy overview
      expandedGroups = new Set(groups.map((g: Group) => g.id));
    }

    // Initialize expanded rounds for each group - only expand incomplete rounds
    groups.forEach((group: Group) => {
      const rounds = getGroupRounds(group);
      const expandedRounds = new Set<number>();

      rounds.forEach((round: any) => {
        const progress = getRoundProgress(round.matches);
        // Only expand rounds that are not complete
        if (progress.percentage < 100) {
          expandedRounds.add(round.roundNumber);
        }
      });

      groupExpandedRounds[group.id] = expandedRounds;
    });
    groupExpandedRounds = groupExpandedRounds;

    groupsInitialized = true;
  }

  // If activeGroupId changes to a new value, ensure it's expanded
  $: if (activeGroupId && activeGroupId !== lastProcessedActiveGroupId) {
    lastProcessedActiveGroupId = activeGroupId;
    if (!expandedGroups.has(activeGroupId)) {
      expandedGroups = new Set([...expandedGroups, activeGroupId]);
    }
  }

  // Calculate progress for a specific group
  function getGroupProgress(group: Group): { completed: number; total: number; percentage: number } {
    let allMatches: any[] = [];

    if (group.schedule) {
      const schedule = Array.isArray(group.schedule) ? group.schedule : Object.values(group.schedule);
      allMatches = schedule.flatMap((r: any) => {
        const matches = r.matches;
        return Array.isArray(matches) ? matches : Object.values(matches || {});
      });
    } else if (group.pairings) {
      const pairings = Array.isArray(group.pairings) ? group.pairings : Object.values(group.pairings);
      allMatches = pairings.flatMap((p: any) => {
        const matches = p.matches;
        return Array.isArray(matches) ? matches : Object.values(matches || {});
      });
    }

    const total = allMatches.length;
    const completed = allMatches.filter(
      (m: any) => m.status === 'COMPLETED' || m.status === 'WALKOVER'
    ).length;

    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  // Calculate overall progress
  $: overallProgress = (() => {
    let totalMatches = 0;
    let completedMatches = 0;

    groups.forEach((group: Group) => {
      const progress = getGroupProgress(group);
      totalMatches += progress.total;
      completedMatches += progress.completed;
    });

    return {
      completed: completedMatches,
      total: totalMatches,
      percentage: totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0
    };
  })();

  // Auto-collapse rounds ONLY when they transition from incomplete to complete
  $: {
    groups.forEach((group: Group) => {
      const rounds = getGroupRounds(group);
      const currentExpanded = groupExpandedRounds[group.id];

      if (currentExpanded) {
        let hasChanges = false;
        const newExpanded = new Set(currentExpanded);

        // Initialize previous state for this group if needed
        if (!previousRoundCompletionState[group.id]) {
          previousRoundCompletionState[group.id] = {};
        }

        rounds.forEach((round: any) => {
          const progress = getRoundProgress(round.matches);
          const isComplete = progress.percentage === 100;
          const wasComplete = previousRoundCompletionState[group.id][round.roundNumber] ?? false;

          // Only collapse if it JUST became complete (wasn't complete before)
          if (isComplete && !wasComplete && newExpanded.has(round.roundNumber)) {
            newExpanded.delete(round.roundNumber);
            hasChanges = true;
          }

          // Update the previous state
          previousRoundCompletionState[group.id][round.roundNumber] = isComplete;
        });

        if (hasChanges) {
          groupExpandedRounds[group.id] = newExpanded;
          groupExpandedRounds = groupExpandedRounds;
        }
      }
    });
  }

  // Get available tables
  $: availableTables = Array.from({ length: tournament.numTables }, (_, i) => i + 1);

  function toggleGroup(groupId: string) {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    expandedGroups = newExpanded; // Create new Set to trigger reactivity
  }

  function setGroupView(groupId: string, view: 'schedule' | 'standings') {
    groupViews[groupId] = view;
    groupViews = groupViews; // Trigger reactivity
  }

  function setGroupExpandedRounds(groupId: string, expanded: Set<number>) {
    groupExpandedRounds[groupId] = expanded;
    groupExpandedRounds = groupExpandedRounds; // Trigger reactivity
  }

  function expandAll() {
    expandedGroups = new Set(groups.map((g: Group) => g.id));
  }

  function collapseAll() {
    expandedGroups = new Set();
  }

  // Wrapper to add groupId to match before calling onMatchClick
  function handleMatchClick(groupId: string, match: GroupMatch) {
    if (onMatchClick) {
      // Add groupId to the match for tracking
      onMatchClick({ ...match, groupId });
    }
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
        <span class="round-label">{totalRounds} Rondas</span>
        <div class="overall-progress">
          <span class="progress-text">{overallProgress.completed}/{overallProgress.total}</span>
          <div class="progress-bar">
            <div class="progress-fill" style="width: {overallProgress.percentage}%"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Filters and controls -->
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

    {#if groups.length > 1}
      <div class="expand-controls">
        <button class="expand-btn" on:click={expandAll} title="Expandir todos">
          <span class="icon">+</span> Todos
        </button>
        <button class="expand-btn" on:click={collapseAll} title="Colapsar todos">
          <span class="icon">−</span> Ninguno
        </button>
      </div>
    {/if}
  </div>

  <!-- Groups as accordions -->
  {#if groups.length === 0}
    <div class="no-group-state">
      <p>No hay grupos configurados</p>
    </div>
  {:else}
    <div class="groups-accordions">
      {#each groups as group (group.id)}
        {@const progress = getGroupProgress(group)}
        {@const isExpanded = expandedGroups.has(group.id)}
        {@const rounds = getGroupRounds(group)}

        <div
          class="group-accordion"
          class:expanded={isExpanded}
          class:complete={progress.percentage === 100}
          class:active={activeGroupId === group.id}
        >
          <!-- Accordion Header -->
          <button
            class="accordion-header"
            on:click={() => toggleGroup(group.id)}
            aria-expanded={isExpanded}
          >
            <div class="header-left">
              <span class="expand-icon" class:rotated={isExpanded}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                </svg>
              </span>
              <span class="group-name">{group.name}</span>
              {#if progress.percentage === 100}
                <span class="complete-badge">Completado</span>
              {/if}
            </div>
            <div class="header-right">
              <div class="progress-info">
                <span class="progress-label">{progress.completed}/{progress.total}</span>
                <div class="mini-progress-bar">
                  <div
                    class="mini-progress-fill"
                    class:complete={progress.percentage === 100}
                    style="width: {progress.percentage}%"
                  ></div>
                </div>
              </div>
            </div>
          </button>

          <!-- Accordion Content -->
          {#if isExpanded}
            <div class="accordion-content">
              <!-- View toggle for this group -->
              <div class="group-view-toggle">
                <button
                  class="toggle-btn"
                  class:active={(groupViews[group.id] || 'schedule') === 'schedule'}
                  on:click|stopPropagation={() => setGroupView(group.id, 'schedule')}
                >
                  Partidos
                </button>
                <button
                  class="toggle-btn"
                  class:active={(groupViews[group.id] || 'schedule') === 'standings'}
                  on:click|stopPropagation={() => setGroupView(group.id, 'standings')}
                >
                  Clasificación
                </button>
              </div>

              <!-- Group content -->
              <div class="group-content">
                {#if (groupViews[group.id] || 'schedule') === 'schedule'}
                  <MatchSchedule
                    {rounds}
                    participants={tournament.participants}
                    {currentRound}
                    onMatchClick={(match) => handleMatchClick(group.id, match)}
                    {filterTable}
                    {filterStatus}
                    gameMode={tournament.groupStage?.gameMode || 'rounds'}
                    expandedRoundsState={groupExpandedRounds[group.id] || null}
                    onExpandedRoundsChange={(expanded) => setGroupExpandedRounds(group.id, expanded)}
                  />
                {:else}
                  <GroupStandings
                    standings={group.standings}
                    participants={tournament.participants}
                    showElo={tournament.eloConfig.enabled}
                  />
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
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

  /* Expand/Collapse controls */
  .expand-controls {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
  }

  .expand-btn {
    padding: 0.4rem 0.75rem;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    color: #6b7280;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .expand-btn:hover {
    border-color: #667eea;
    color: #667eea;
  }

  .expand-btn .icon {
    font-weight: 700;
    font-size: 1rem;
    line-height: 1;
  }

  /* Accordion styles */
  .groups-accordions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1rem;
    align-items: start;
  }

  .group-accordion {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    transition: all 0.2s;
  }

  .group-accordion.expanded {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  }

  .group-accordion.complete {
    border-color: #10b981;
  }

  .group-accordion.active {
    border-color: #f59e0b;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
  }

  .accordion-header {
    width: 100%;
    padding: 1rem 1.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    transition: background-color 0.2s;
  }

  .accordion-header:hover {
    background: #f9fafb;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: transform 0.2s;
  }

  .expand-icon.rotated {
    transform: rotate(90deg);
  }

  .group-name {
    font-size: 1.1rem;
    font-weight: 700;
    color: #1f2937;
  }

  .complete-badge {
    padding: 0.2rem 0.6rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .header-right {
    display: flex;
    align-items: center;
  }

  .progress-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .progress-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #6b7280;
    min-width: 45px;
    text-align: right;
  }

  .mini-progress-bar {
    width: 80px;
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    overflow: hidden;
  }

  .mini-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    transition: width 0.3s ease;
    border-radius: 3px;
  }

  .mini-progress-fill.complete {
    background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  }

  .accordion-content {
    border-top: 1px solid #e5e7eb;
    padding: 1rem 1.25rem;
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .group-view-toggle {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    background: #f3f4f6;
    padding: 0.25rem;
    border-radius: 8px;
    width: fit-content;
  }

  .toggle-btn {
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #6b7280;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-btn:hover {
    color: #374151;
  }

  .toggle-btn.active {
    background: white;
    color: #667eea;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .group-content {
    margin-top: 0.5rem;
  }

  .no-group-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
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

  :global([data-theme='dark']) .expand-btn {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .expand-btn:hover {
    border-color: #667eea;
    color: #667eea;
  }

  :global([data-theme='dark']) .group-accordion {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .group-accordion.expanded {
    border-color: #667eea;
  }

  :global([data-theme='dark']) .group-accordion.complete {
    border-color: #10b981;
  }

  :global([data-theme='dark']) .accordion-header:hover {
    background: #0f1419;
  }

  :global([data-theme='dark']) .expand-icon {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .group-name {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .progress-label {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .mini-progress-bar {
    background: #2d3748;
  }

  :global([data-theme='dark']) .accordion-content {
    border-top-color: #2d3748;
  }

  :global([data-theme='dark']) .group-view-toggle {
    background: #0f1419;
  }

  :global([data-theme='dark']) .toggle-btn {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .toggle-btn:hover {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .toggle-btn.active {
    background: #1a2332;
    color: #667eea;
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
      gap: 0.5rem;
      flex-wrap: wrap;
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

    .expand-controls {
      width: 100%;
      justify-content: flex-end;
      margin-left: 0;
    }

    .expand-btn {
      padding: 0.35rem 0.6rem;
      font-size: 0.75rem;
    }

    .groups-accordions {
      grid-template-columns: 1fr;
    }

    .accordion-header {
      padding: 0.875rem 1rem;
    }

    .group-name {
      font-size: 1rem;
    }

    .progress-label {
      font-size: 0.8rem;
      min-width: 40px;
    }

    .mini-progress-bar {
      width: 60px;
    }

    .accordion-content {
      padding: 0.875rem 1rem;
    }

    .toggle-btn {
      padding: 0.4rem 0.75rem;
      font-size: 0.8rem;
    }

    .no-group-state {
      min-height: 150px;
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

    .accordion-header {
      padding: 0.6rem 0.875rem;
    }

    .group-name {
      font-size: 0.95rem;
    }

    .accordion-content {
      padding: 0.75rem 0.875rem;
    }

    .toggle-btn {
      padding: 0.35rem 0.6rem;
      font-size: 0.75rem;
    }

    .no-group-state {
      min-height: 100px;
    }
  }
</style>
