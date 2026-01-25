<script lang="ts">
  import type {
    Tournament,
    Group,
    GroupMatch
  } from '$lib/types/tournament';
  import GroupStandings from './GroupStandings.svelte';
  import MatchSchedule from './MatchSchedule.svelte';
  import { t } from '$lib/stores/language';

  export let tournament: Tournament;
  export let onMatchClick: ((match: GroupMatch) => void) | undefined = undefined;
  export let activeGroupId: string | null = null; // Track which group had recent activity
  export let onGenerateNextRound: (() => Promise<void>) | undefined = undefined;

  let expandedGroups: Set<string> = new Set();
  let generatingRound = false;
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

  // Ensure groups is always an array (Firestore may return object with numeric keys)
  $: groups = ((): Group[] => {
    const groupsData = tournament.groupStage?.groups;
    if (!groupsData) return [];
    if (Array.isArray(groupsData)) return groupsData as Group[];
    // Convert object to array if needed
    return Object.values(groupsData) as Group[];
  })();

  $: currentRound = tournament.groupStage?.currentRound || 1;
  $: isSwiss = tournament.groupStage?.type === 'SWISS';
  // Support both new rankingSystem and legacy swissRankingSystem
  $: rankingSystem = tournament.groupStage?.rankingSystem || tournament.groupStage?.swissRankingSystem || 'WINS';
  // @deprecated - keep for backwards compatibility
  $: swissRankingSystem = rankingSystem;
  // For Swiss system, prefer numSwissRounds; fallback to totalRounds for round-robin
  $: totalRounds = isSwiss
    ? (tournament.groupStage?.numSwissRounds || tournament.groupStage?.totalRounds || tournament.numSwissRounds || 0)
    : (tournament.groupStage?.totalRounds || 0);

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

  // Calculate overall progress (matches)
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

  // Calculate rounds progress for Swiss system
  $: roundsProgress = (() => {
    if (!isSwiss || totalRounds === 0) return null;

    // Count completed rounds (all matches in round are complete)
    let completedRounds = 0;
    groups.forEach((group: Group) => {
      const rounds = getGroupRounds(group);
      rounds.forEach((round: any) => {
        const progress = getRoundProgress(round.matches);
        if (progress.percentage === 100) {
          completedRounds++;
        }
      });
    });

    // For single group Swiss, just count the rounds
    const completed = groups.length === 1 ? completedRounds : Math.floor(completedRounds / groups.length);

    return {
      completed,
      total: totalRounds,
      percentage: totalRounds > 0 ? Math.round((completed / totalRounds) * 100) : 0
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

  // Expand all rounds in all groups
  function expandAllRounds() {
    groups.forEach((group: Group) => {
      const rounds = getGroupRounds(group);
      const allRoundNumbers = new Set(rounds.map((r: any) => r.roundNumber));
      groupExpandedRounds[group.id] = allRoundNumbers;
    });
    groupExpandedRounds = groupExpandedRounds;
  }

  // Collapse all rounds in all groups
  function collapseAllRounds() {
    groups.forEach((group: Group) => {
      groupExpandedRounds[group.id] = new Set();
    });
    groupExpandedRounds = groupExpandedRounds;
  }

  // Check if any round is expanded
  $: anyRoundExpanded = Object.values(groupExpandedRounds).some(
    (rounds: Set<number>) => rounds.size > 0
  );

  // Check if any group is expanded
  $: anyGroupExpanded = expandedGroups.size > 0;

  // Wrapper to add groupId to match before calling onMatchClick
  function handleMatchClick(groupId: string, match: GroupMatch) {
    if (onMatchClick) {
      // Add groupId to the match for tracking
      onMatchClick({ ...match, groupId });
    }
  }

  // Check if we can generate the next Swiss round
  $: canGenerateNextRound = isSwiss &&
    roundsProgress &&
    overallProgress.percentage === 100 &&
    roundsProgress.completed < roundsProgress.total &&
    onGenerateNextRound;

  async function handleGenerateNextRound() {
    if (!onGenerateNextRound || generatingRound) return;
    generatingRound = true;
    try {
      await onGenerateNextRound();
    } finally {
      generatingRound = false;
    }
  }
</script>

<div class="groups-view">
  <!-- Header with progress (hidden for single-group Swiss as info moves to group header) -->
  {#if !(isSwiss && groups.length === 1)}
    <div class="view-header">
      <div class="header-content">
        <h2>
          {isSwiss ? $t('swissSystem') : $t('groupStage')}
        </h2>
        <div class="round-info">
          {#if isSwiss && roundsProgress}
            <div class="overall-progress">
              <span class="progress-text">{$t('round')} {roundsProgress.completed + (overallProgress.percentage < 100 ? 1 : 0)}/{roundsProgress.total}</span>
              <div class="progress-bar">
                <div class="progress-fill" style="width: {roundsProgress.percentage}%"></div>
              </div>
            </div>
          {:else}
            <span class="round-label">{$t('nRounds').replace('{n}', String(totalRounds))}</span>
            <div class="overall-progress">
              <span class="progress-text">{overallProgress.completed}/{overallProgress.total}</span>
            <div class="progress-bar">
              <div class="progress-fill" style="width: {overallProgress.percentage}%"></div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
  {/if}

  <!-- Filters and controls -->
  <div class="filters-bar">
    <div class="filter-group">
      <label for="table-filter">{$t('tableLabel')}</label>
      <select id="table-filter" bind:value={filterTable}>
        <option value={null}>{$t('all')}</option>
        {#each availableTables as table}
          <option value={table}>{$t('tableN').replace('{n}', String(table))}</option>
        {/each}
      </select>
    </div>

    <div class="filter-group">
      <label for="status-filter">{$t('statusLabel')}</label>
      <select id="status-filter" bind:value={filterStatus}>
        <option value={null}>{$t('all')}</option>
        <option value="PENDING">{$t('statusPending')}</option>
        <option value="IN_PROGRESS">{$t('statusInProgress')}</option>
        <option value="COMPLETED">{$t('statusCompleted')}</option>
        <option value="WALKOVER">{$t('statusWalkover')}</option>
      </select>
    </div>

    <div class="toggle-controls">
      {#if groups.length > 1}
        <button
          class="toggle-btn"
          on:click={anyGroupExpanded ? collapseAll : expandAll}
          title={anyGroupExpanded ? $t('collapseAllGroups') : $t('expandAllGroups')}
        >
          {#if anyGroupExpanded}
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clip-rule="evenodd" />
            </svg>
            {$t('collapseAllGroups')}
          {:else}
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
            </svg>
            {$t('expandAllGroups')}
          {/if}
        </button>
      {/if}

      <button
        class="toggle-btn"
        on:click={anyRoundExpanded ? collapseAllRounds : expandAllRounds}
        title={anyRoundExpanded ? $t('collapseAllRoundsTooltip') : $t('expandAllRounds')}
      >
        {#if anyRoundExpanded}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clip-rule="evenodd" />
          </svg>
          {$t('collapseAllRounds')}
        {:else}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
          </svg>
          {$t('expandAllRounds')}
        {/if}
      </button>
    </div>
  </div>

  <!-- Groups as accordions -->
  {#if groups.length === 0}
    <div class="no-group-state">
      <p>{$t('noGroupsConfigured')}</p>
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
              <span class="group-name">{translateGroupName(group.name)}</span>
              {#if progress.percentage === 100}
                <span class="complete-badge">{$t('completed')}</span>
              {/if}
            </div>
            <div class="header-right">
              <div class="progress-info">
                {#if isSwiss && groups.length === 1 && roundsProgress}
                  <span class="progress-label">{$t('round')} {roundsProgress.completed + (overallProgress.percentage < 100 ? 1 : 0)}/{roundsProgress.total}</span>
                  <div class="mini-progress-bar">
                    <div
                      class="mini-progress-fill"
                      class:complete={roundsProgress.percentage === 100}
                      style="width: {roundsProgress.percentage}%"
                    ></div>
                  </div>
                {:else}
                  <span class="progress-label">{progress.completed}/{progress.total}</span>
                  <div class="mini-progress-bar">
                    <div
                      class="mini-progress-fill"
                      class:complete={progress.percentage === 100}
                      style="width: {progress.percentage}%"
                    ></div>
                  </div>
                {/if}
              </div>
            </div>
          </button>

          <!-- Accordion Content -->
          {#if isExpanded}
            <div class="accordion-content">
              <!-- View toggle and actions for this group -->
              <div class="group-actions-row">
                <div class="group-view-toggle">
                  <button
                    class="toggle-btn"
                    class:active={(groupViews[group.id] || 'schedule') === 'schedule'}
                    on:click|stopPropagation={() => setGroupView(group.id, 'schedule')}
                  >
                    {$t('schedule')}
                  </button>
                  <button
                    class="toggle-btn"
                    class:active={(groupViews[group.id] || 'schedule') === 'standings'}
                    on:click|stopPropagation={() => setGroupView(group.id, 'standings')}
                  >
                    {$t('standings')}
                  </button>
                </div>

                {#if canGenerateNextRound}
                  <button
                    class="generate-next-round-btn"
                    on:click|stopPropagation={handleGenerateNextRound}
                    disabled={generatingRound}
                  >
                    {#if generatingRound}
                      <span class="spinner"></span>
                      {$t('generatingRound')}
                    {:else}
                      {$t('generateRound').replace('{n}', String((roundsProgress?.completed || 0) + 1))}
                    {/if}
                  </button>
                {/if}
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
                    {totalRounds}
                  />
                {:else}
                  <GroupStandings
                    standings={group.standings}
                    participants={tournament.participants}
                    showElo={tournament.rankingConfig?.enabled}
                    {isSwiss}
                    {rankingSystem}
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
    gap: 0.75rem;
  }

  .view-header {
    background: white;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .header-content h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #1f2937;
  }

  .round-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .round-label {
    font-size: 0.8rem;
    color: #6b7280;
    font-weight: 600;
    min-width: 80px;
  }

  .overall-progress {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 1;
  }

  .progress-text {
    font-size: 0.75rem;
    color: #374151;
    font-weight: 600;
    min-width: 50px;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    overflow: hidden;
    max-width: 200px;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    transition: width 0.3s ease;
    border-radius: 3px;
  }

  .filters-bar {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .filter-group label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }

  .filter-group select {
    padding: 0.3rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    color: #1f2937;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .filter-group select:hover {
    border-color: #9ca3af;
  }

  .filter-group select:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
  }

  /* Expand/Collapse controls for groups */
  /* Toggle controls container - positioned to the right */
  .toggle-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .toggle-btn {
    padding: 0.25rem 0.5rem;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    color: #6b7280;
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .toggle-btn:hover {
    border-color: #059669;
    color: #059669;
  }

  .toggle-btn svg {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
  }

  /* Accordion styles */
  .groups-accordions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 0.6rem;
    align-items: start;
  }

  .group-accordion {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.15s;
  }

  .group-accordion.expanded {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
  }

  .group-accordion.complete {
    border-color: #10b981;
  }

  .group-accordion.active {
    border-color: #f59e0b;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.15);
  }

  .accordion-header {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    transition: background-color 0.15s;
  }

  .accordion-header:hover {
    background: #f9fafb;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: transform 0.15s;
  }

  .expand-icon.rotated {
    transform: rotate(90deg);
  }

  .expand-icon svg {
    width: 14px;
    height: 14px;
  }

  .group-name {
    font-size: 0.9rem;
    font-weight: 700;
    color: #1f2937;
  }

  .complete-badge {
    padding: 0.1rem 0.4rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border-radius: 3px;
    font-size: 0.6rem;
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
    gap: 0.5rem;
  }

  .progress-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #6b7280;
    min-width: 35px;
    text-align: right;
  }

  .mini-progress-bar {
    width: 50px;
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
  }

  .mini-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    transition: width 0.3s ease;
    border-radius: 2px;
  }

  .mini-progress-fill.complete {
    background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  }

  .accordion-content {
    border-top: 1px solid #e5e7eb;
    padding: 0.5rem 0.75rem;
    animation: slideDown 0.15s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .group-actions-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .group-view-toggle {
    display: flex;
    gap: 0.25rem;
    background: #f3f4f6;
    padding: 0.15rem;
    border-radius: 4px;
    width: fit-content;
  }

  .generate-next-round-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
    box-shadow: 0 1px 4px rgba(102, 126, 234, 0.25);
  }

  .generate-next-round-btn:hover:not(:disabled) {
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
  }

  .generate-next-round-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinner {
    width: 10px;
    height: 10px;
    border: 1.5px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .toggle-btn {
    padding: 0.3rem 0.6rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #6b7280;
    font-weight: 600;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .toggle-btn:hover {
    color: #374151;
  }

  .toggle-btn.active {
    background: white;
    color: #667eea;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .group-content {
    margin-top: 0.25rem;
  }

  .no-group-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    text-align: center;
    color: #9ca3af;
    font-size: 0.9rem;
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

  :global([data-theme='dark']) .toggle-btn {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .toggle-btn:hover {
    border-color: #10b981;
    color: #10b981;
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

  :global([data-theme='dark']) .generate-next-round-btn {
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .groups-view {
      gap: 0.5rem;
    }

    .view-header {
      padding: 0.5rem 0.75rem;
    }

    .header-content h2 {
      font-size: 0.95rem;
      margin-bottom: 0.35rem;
    }

    .round-info {
      gap: 0.5rem;
    }

    .round-label {
      font-size: 0.7rem;
      min-width: 60px;
    }

    .overall-progress {
      gap: 0.4rem;
    }

    .progress-text {
      font-size: 0.65rem;
      min-width: 40px;
    }

    .progress-bar {
      max-width: 120px;
      height: 4px;
    }

    .filters-bar {
      gap: 0.4rem;
    }

    .filter-group {
      gap: 0.2rem;
    }

    .filter-group label {
      font-size: 0.65rem;
    }

    .filter-group select {
      padding: 0.2rem 0.35rem;
      font-size: 0.65rem;
    }

    .expand-btn {
      padding: 0.2rem 0.4rem;
      font-size: 0.6rem;
    }

    .toggle-btn {
      padding: 0.2rem 0.4rem;
      font-size: 0.6rem;
    }

    .groups-accordions {
      grid-template-columns: 1fr;
      gap: 0.4rem;
    }

    .accordion-header {
      padding: 0.4rem 0.5rem;
    }

    .group-name {
      font-size: 0.8rem;
    }

    .complete-badge {
      font-size: 0.5rem;
      padding: 0.06rem 0.3rem;
    }

    .progress-label {
      font-size: 0.6rem;
      min-width: 28px;
    }

    .mini-progress-bar {
      width: 40px;
      height: 3px;
    }

    .accordion-content {
      padding: 0.4rem 0.5rem;
    }

    .group-actions-row {
      gap: 0.35rem;
      margin-bottom: 0.35rem;
    }

    .toggle-btn {
      padding: 0.2rem 0.4rem;
      font-size: 0.6rem;
    }

    .generate-next-round-btn {
      padding: 0.25rem 0.5rem;
      font-size: 0.65rem;
    }

    .no-group-state {
      min-height: 80px;
      font-size: 0.8rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .groups-view {
      gap: 0.4rem;
    }

    .view-header {
      padding: 0.4rem 0.5rem;
    }

    .header-content h2 {
      font-size: 0.85rem;
      margin-bottom: 0.25rem;
    }

    .progress-bar {
      height: 3px;
    }

    .accordion-header {
      padding: 0.3rem 0.4rem;
    }

    .group-name {
      font-size: 0.75rem;
    }

    .accordion-content {
      padding: 0.35rem 0.4rem;
    }

    .toggle-btn {
      padding: 0.15rem 0.3rem;
      font-size: 0.55rem;
    }

    .no-group-state {
      min-height: 60px;
    }
  }
</style>
