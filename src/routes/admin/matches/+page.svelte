<script lang="ts">
  import SuperAdminGuard from '$lib/components/SuperAdminGuard.svelte';
  import MatchEditModal from '$lib/components/MatchEditModal.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { tick } from 'svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { goto } from '$app/navigation';
  import { adminTheme } from '$lib/stores/theme';
  import { currentUser } from '$lib/firebase/auth';
  import { getMatchesPaginated, fetchAllMatches, adminDeleteMatch, getEarliestMatchYear } from '$lib/firebase/admin';
  import type { MatchHistory } from '$lib/types/history';
  import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Crown from '@lucide/svelte/icons/crown';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Target from '@lucide/svelte/icons/target';

  let matches: MatchHistory[] = $state([]);
  let isLoading = $state(true);
  let isLoadingMore = $state(false);
  let isDeleting = $state(false);
  let errorMessage = $state('');
  let selectedMatch: MatchHistory | null = $state(null);
  let filterType: 'all' | 'singles' | 'doubles' = $state('all');
  let playerFilter = $state('');
  let matchToDelete: MatchHistory | null = $state(null);
  const pageSize = 15;

  // Year filter: scopes all server queries (paginated list, count, search fetch)
  // to one calendar year so the page never pulls the whole collection at once.
  const currentYear = new Date().getFullYear();
  let selectedYear = $state<number | 'all'>(currentYear);
  let availableYears = $state<number[]>([currentYear]);
  const yearQuery = (): number | null => (selectedYear === 'all' ? null : selectedYear);

  // Infinite scroll state
  let totalCount = $state(0);
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = $state(null);
  let hasMore = $state(true);
  let tableContainer: HTMLElement | null = $state(null);

  // Full year set, loaded lazily the first time the player combobox opens, so it
  // can list every player of the year and filter completely — instead of only
  // the pages loaded so far. Null until loaded; once set, the table renders over it.
  let allMatchesCache: MatchHistory[] | null = $state(null);
  let isPlayerListLoading = $state(false);

  // Searchable player combobox state
  let playerComboOpen = $state(false);
  let playerTriggerRef = $state<HTMLButtonElement | null>(null);

  // Derived counts — same source as filteredMatches so the tab counters
  // stay coherent with what the list is actually showing
  let countSource = $derived(allMatchesCache ?? matches);
  let singlesCount = $derived(countSource.filter(m => (m.gameType || 'singles') === 'singles').length);
  let doublesCount = $derived(countSource.filter(m => m.gameType === 'doubles').length);

  // Extract unique players from matches (by userId or name)
  interface PlayerOption {
    id: string;
    name: string;
    isRegistered: boolean;
  }
  // All player ids of a match: both teams AND their doubles partners
  function getMatchPlayerIds(match: MatchHistory): string[] {
    const ids = [
      match.players?.team1?.userId || match.team1Name,
      match.players?.team2?.userId || match.team2Name
    ];
    const partner1 = match.players?.team1?.partner;
    if (partner1?.name) ids.push(partner1.userId || partner1.name);
    const partner2 = match.players?.team2?.partner;
    if (partner2?.name) ids.push(partner2.userId || partner2.name);
    return ids.filter(Boolean) as string[];
  }

  let uniquePlayers = $derived((() => {
    const playerMap = new Map<string, PlayerOption>();
    const addPlayer = (id: string | undefined | null, name: string | undefined, isRegistered: boolean) => {
      if (!id || !name || playerMap.has(id)) return;
      playerMap.set(id, { id, name, isRegistered });
    };

    // Use the full cache when available so the dropdown lists every player
    for (const match of allMatchesCache ?? matches) {
      addPlayer(
        match.players?.team1?.userId || match.team1Name,
        match.players?.team1?.name || match.team1Name,
        !!match.players?.team1?.userId
      );
      addPlayer(
        match.players?.team2?.userId || match.team2Name,
        match.players?.team2?.name || match.team2Name,
        !!match.players?.team2?.userId
      );

      // Doubles partners were invisible to the filter
      const partner1 = match.players?.team1?.partner;
      if (partner1?.name) addPlayer(partner1.userId || partner1.name, partner1.name, !!partner1.userId);
      const partner2 = match.players?.team2?.partner;
      if (partner2?.name) addPlayer(partner2.userId || partner2.name, partner2.name, !!partner2.userId);
    }

    return Array.from(playerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  })());

  let isFiltering = $derived(filterType !== 'all');
  let isPlayerFiltering = $derived(playerFilter !== '');
  let selectedPlayerName = $derived(uniquePlayers.find((p) => p.id === playerFilter)?.name ?? '');

  // Auto-load more if container doesn't have scroll (also when a filter
  // shrinks the visible rows — filters apply client-side over loaded pages,
  // so we must keep paginating or the filtered results stay incomplete)
  $effect(() => {
    // Track so the effect re-runs when filters change the visible rows
    const _ = filteredMatches.length;

    if (tableContainer && hasMore && !isLoading && !isLoadingMore && !allMatchesCache) {
      // Wait for the DOM to reflect the new rows before measuring scroll
      requestAnimationFrame(() => {
        if (tableContainer && tableContainer.scrollHeight <= tableContainer.clientHeight) {
          loadMore();
        }
      });
    }
  });

  // Filtered matches. Once the full year set is loaded (player combobox opened),
  // filter over it so type/player filters are complete; otherwise over the
  // paginated pages loaded so far.
  let filteredMatches = $derived((allMatchesCache ?? matches).filter((match) => {
    const matchType = match.gameType || 'singles';
    if (filterType === 'singles' && matchType !== 'singles') return false;
    if (filterType === 'doubles' && matchType !== 'doubles') return false;

    if (isPlayerFiltering && !getMatchPlayerIds(match).includes(playerFilter)) {
      return false;
    }
    return true;
  }));

  let displayTotal = $derived(isFiltering || isPlayerFiltering ? filteredMatches.length : totalCount);

  // Lazily load the full year set the first time the player combobox opens, so
  // it lists every player of the year and player filtering is complete.
  async function ensureFullSetLoaded() {
    if (allMatchesCache || isPlayerListLoading) return;
    isPlayerListLoading = true;
    try {
      allMatchesCache = await fetchAllMatches(yearQuery());
    } catch (error) {
      console.error('Error loading matches for player filter:', error);
    } finally {
      isPlayerListLoading = false;
    }
  }

  $effect(() => {
    if (playerComboOpen) ensureFullSetLoaded();
  });

  // Wait for auth before loading - prevents race condition where
  // onMount fires before currentUser is set by the auth listener
  let initialLoadDone = false;

  $effect(() => {
    if ($currentUser && !initialLoadDone) {
      initialLoadDone = true;
      loadInitialMatches();
      loadAvailableYears();
    }
  });

  // Build the year-filter options from the oldest match up to the current year.
  async function loadAvailableYears() {
    const earliest = await getEarliestMatchYear();
    if (earliest && earliest < currentYear) {
      const years: number[] = [];
      for (let y = currentYear; y >= earliest; y--) years.push(y);
      availableYears = years;
    } else {
      availableYears = [currentYear];
    }
  }

  // Reload from scratch when the selected year changes. Invalidates the full-set
  // cache (re-fetched scoped to the new year when the combobox reopens) and
  // clears the player filter, since the player may not exist in the new year.
  function onYearChange() {
    allMatchesCache = null;
    playerFilter = '';
    loadInitialMatches();
  }

  // Select a player from the combobox (empty id = all players), then close + refocus.
  function selectPlayer(id: string) {
    playerFilter = id;
    playerComboOpen = false;
    tick().then(() => playerTriggerRef?.focus());
  }

  async function loadInitialMatches() {
    isLoading = true;
    errorMessage = '';
    matches = [];
    lastDoc = null;

    try {
      const result = await getMatchesPaginated(pageSize, null, yearQuery());
      totalCount = result.totalCount;
      hasMore = result.hasMore;
      lastDoc = result.lastDoc;
      matches = result.matches;
    } catch (error) {
      console.error('Error loading matches:', error);
      errorMessage = 'Failed to load matches';
    } finally {
      isLoading = false;
    }
  }

  async function loadMore() {
    if (isLoadingMore || !hasMore || allMatchesCache) return;

    isLoadingMore = true;
    try {
      const result = await getMatchesPaginated(pageSize, lastDoc, yearQuery());
      hasMore = result.hasMore;
      lastDoc = result.lastDoc;
      matches = [...matches, ...result.matches];
    } catch (error) {
      console.error('Error loading more matches:', error);
    } finally {
      isLoadingMore = false;
    }
  }

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (scrollBottom < 100 && hasMore && !isLoadingMore && !allMatchesCache) {
      loadMore();
    }
  }

  function editMatch(match: MatchHistory) {
    selectedMatch = match;
  }

  function closeEditModal() {
    selectedMatch = null;
  }

  async function handleMatchUpdated() {
    closeEditModal();
    allMatchesCache = null;
    await loadInitialMatches();
  }

  function confirmDelete(match: MatchHistory) {
    matchToDelete = match;
  }

  let deleteError = $state('');

  async function deleteMatch() {
    if (!matchToDelete) return;

    isDeleting = true;
    deleteError = '';
    const success = await adminDeleteMatch(matchToDelete.id);

    if (success) {
      matches = matches.filter((m) => m.id !== matchToDelete!.id);
      if (allMatchesCache) {
        allMatchesCache = allMatchesCache.filter((m) => m.id !== matchToDelete!.id);
      }
      totalCount = Math.max(0, totalCount - 1);
      matchToDelete = null;
    } else {
      // Keep the modal open so the admin sees the failure
      deleteError = m.admin_deleteMatchError();
    }

    isDeleting = false;
  }

  function cancelDelete() {
    matchToDelete = null;
    deleteError = '';
  }

  function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getMatchType(match: MatchHistory): string {
    return match.gameType || 'singles';
  }

  function getMatchTypeLabel(match: MatchHistory): string {
    const type = getMatchType(match);
    return type === 'doubles' ? m.scoring_doubles() : m.scoring_singles();
  }

  function getGameModeInfo(match: MatchHistory): string {
    if (match.gameMode === 'points') {
      return `${match.pointsToWin}p · Pg${match.matchesToWin}`;
    } else if (match.gameMode === 'rounds') {
      return `${match.roundsToPlay}r`;
    }
    return match.gameMode || 'N/A';
  }
</script>

<!-- Escape closes the delete dialog: the overlay div is not focusable, so its
     own onkeydown only fires if focus happens to be inside the modal -->
<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && matchToDelete && !isDeleting) cancelDelete(); }} />

<SuperAdminGuard>
  <div class="matches-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" onclick={() => goto('/admin')}>
          <ArrowLeft size={16} />
        </button>
        <div class="header-main">
          <div class="title-section">
            <h1>{m.admin_matchManagement()}</h1>
            <span class="count-badge">{totalCount}</span>
          </div>
        </div>
        <div class="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <div class="filters-row">
        <div class="filter-tabs">
          <button
            class="filter-tab"
            class:active={filterType === 'all'}
            onclick={() => (filterType = 'all')}
          >
            {m.admin_all()} ({countSource.length})
          </button>
          <button
            class="filter-tab"
            class:active={filterType === 'singles'}
            onclick={() => (filterType = 'singles')}
          >
            {m.scoring_singles()} ({singlesCount})
          </button>
          <button
            class="filter-tab"
            class:active={filterType === 'doubles'}
            onclick={() => (filterType = 'doubles')}
          >
            {m.scoring_doubles()} ({doublesCount})
          </button>
        </div>

        <select bind:value={selectedYear} onchange={onYearChange} class="player-filter year-filter">
          {#each availableYears as y}
            <option value={y}>{y}</option>
          {/each}
          <option value="all">{m.admin_allYears()}</option>
        </select>

        <div class="player-combo">
          <Popover.Root bind:open={playerComboOpen}>
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  bind:ref={playerTriggerRef}
                  variant="outline"
                  role="combobox"
                  aria-expanded={playerComboOpen}
                  class="player-combo-trigger"
                >
                  <span class="player-combo-label">
                    {isPlayerFiltering ? selectedPlayerName : m.admin_allPlayers()}
                  </span>
                  <ChevronsUpDown class="combo-chevron" />
                </Button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content class="w-[260px] p-0" align="end">
              <Command.Root>
                <Command.Input placeholder={m.admin_filterByPlayer()} />
                <Command.List>
                  {#if isPlayerListLoading}
                    <Command.Loading>{m.common_loading()}</Command.Loading>
                  {:else}
                    <Command.Empty>{m.admin_noPlayersFound()}</Command.Empty>
                    <Command.Group>
                      <Command.Item value={m.admin_allPlayers()} onSelect={() => selectPlayer('')}>
                        {m.admin_allPlayers()}
                      </Command.Item>
                      {#each uniquePlayers as player (player.id)}
                        <Command.Item value={player.name} onSelect={() => selectPlayer(player.id)}>
                          {player.name}
                        </Command.Item>
                      {/each}
                    </Command.Group>
                  {/if}
                </Command.List>
              </Command.Root>
            </Popover.Content>
          </Popover.Root>
        </div>
      </div>
    </header>

    {#if isLoading}
      <LoadingSpinner message={m.common_loading()} />
    {:else if errorMessage}
      <div class="error-box">
        <CircleAlert size={40} class="error-icon-svg" />
        <h3>{m.common_error()}</h3>
        <p>{errorMessage}</p>
        <button class="retry-btn" onclick={loadInitialMatches}>{m.admin_retry()}</button>
      </div>
    {:else if filteredMatches.length === 0}
      <div class="empty-state">
        <Target size={48} class="empty-icon-svg" />
        <h3>{m.admin_noMatchesFound()}</h3>
        <p>{isFiltering || isPlayerFiltering ? m.admin_noMatchesFilter() : m.admin_noMatchesYet()}</p>
      </div>
    {:else}
      <div class="results-info">
        {m.admin_showingOf({ showing: String(filteredMatches.length), total: String(displayTotal) })}
      </div>

      <div class="table-container" bind:this={tableContainer} onscroll={handleScroll}>
        <table class="matches-table">
          <thead>
            <tr>
              <th class="players-col">{m.admin_players()}</th>
              <th class="result-col">{m.admin_result()}</th>
              <th class="type-col hide-mobile">{m.admin_type()}</th>
              <th class="mode-col hide-mobile">{m.admin_mode()}</th>
              <th class="date-col hide-mobile">{m.admin_date()}</th>
              <th class="duration-col hide-small">{m.admin_duration()}</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredMatches as match (match.id)}
              <tr class="match-row" onclick={() => editMatch(match)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') editMatch(match); }} role="button" tabindex="0">
                <td class="players-cell">
                  <div class="players-info">
                    <div class="player-row">
                      <span class="color-dot" style="background:{match.team1Color}"></span>
                      <span class="player-name" class:winner={match.winner === 1}>{match.team1Name}</span>
                      {#if match.winner === 1}<Crown size={10} class="winner-icon-svg" />{/if}
                    </div>
                    <div class="player-row">
                      <span class="color-dot" style="background:{match.team2Color}"></span>
                      <span class="player-name" class:winner={match.winner === 2}>{match.team2Name}</span>
                      {#if match.winner === 2}<Crown size={10} class="winner-icon-svg" />{/if}
                    </div>
                  </div>
                </td>
                <td class="result-cell">
                  {#if match.matchesToWin > 1}
                    <!-- games may be missing on imported matches without round detail -->
                    <div class="score-compact">
                      <span class="score-value" class:winner={match.winner === 1}>{(match.games ?? []).filter(g => g.winner === 1).length}</span>
                      <span class="score-sep">-</span>
                      <span class="score-value" class:winner={match.winner === 2}>{(match.games ?? []).filter(g => g.winner === 2).length}</span>
                    </div>
                  {:else}
                    <div class="score-compact">
                      <span class="score-value" class:winner={match.winner === 1}>{match.team1Score}</span>
                      <span class="score-sep">-</span>
                      <span class="score-value" class:winner={match.winner === 2}>{match.team2Score}</span>
                    </div>
                  {/if}
                </td>
                <td class="type-cell hide-mobile">
                  <span class="type-badge">
                    {getMatchTypeLabel(match)}
                  </span>
                </td>
                <td class="mode-cell hide-mobile">
                  <span class="mode-text">{getGameModeInfo(match)}</span>
                </td>
                <td class="date-cell hide-mobile">
                  <div class="date-info">
                    <span class="date-text">{formatDate(match.startTime)}</span>
                    <small class="time-text">{formatTime(match.startTime)}</small>
                  </div>
                </td>
                <td class="duration-cell hide-small">
                  <span class="duration-text">{formatDuration(match.duration)}</span>
                </td>
                <td class="actions-cell">
                  <button
                    class="action-btn delete-btn"
                    onclick={(e) => { e.stopPropagation(); confirmDelete(match); }}
                    title={m.common_delete()}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if isLoadingMore}
          <LoadingSpinner size="small" message={m.admin_loadingMore()} inline={true} />
        {:else if hasMore && !allMatchesCache && !isFiltering && !isPlayerFiltering}
          <div class="load-more-hint">
            {m.admin_scrollToLoadMore()}
          </div>
        {:else if !hasMore && filteredMatches.length > 0}
          <div class="end-of-list">
            {m.admin_endOfList()}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if selectedMatch}
    <MatchEditModal
      match={selectedMatch}
      onClose={closeEditModal}
      onmatchupdated={handleMatchUpdated}
    />
  {/if}

  {#if matchToDelete}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="delete-overlay" data-theme={$adminTheme} onclick={cancelDelete} onkeydown={(e) => { if (e.key === 'Escape') cancelDelete(); }} role="presentation">
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="delete-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h3>{m.admin_deleteMatch()}</h3>
        <div class="match-preview">
          <div class="preview-players">
            <span class="color-dot" style="background: {matchToDelete.team1Color}"></span>
            <strong>{matchToDelete.team1Name}</strong>
            <span class="preview-vs">vs</span>
            <strong>{matchToDelete.team2Name}</strong>
            <span class="color-dot" style="background: {matchToDelete.team2Color}"></span>
          </div>
          <small class="preview-date">{formatDate(matchToDelete.startTime)}</small>
        </div>
        <p class="delete-warning">{m.admin_cannotBeUndone()}</p>
        {#if deleteError}
          <p class="delete-error">⚠️ {deleteError}</p>
        {/if}
        <div class="delete-actions">
          <button class="cancel-btn" onclick={cancelDelete} disabled={isDeleting}>
            {m.common_cancel()}
          </button>
          <button class="confirm-btn" onclick={deleteMatch} disabled={isDeleting}>
            {isDeleting ? m.admin_deleting() : m.common_delete()}
          </button>
        </div>
      </div>
    </div>
  {/if}
</SuperAdminGuard>

<style>
  .matches-container {
    padding: 1.5rem 2rem;
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) {
    background: #0f1419;
  }

  /* Header */
  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem 1.5rem;
    margin: -1.5rem -2rem 1.5rem -2rem;
    transition: background-color 0.3s, border-color 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .page-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .back-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #555;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .back-btn {
    background: #0f1419;
    color: #fff;
    border-color: #2d3748;
  }

  .back-btn:hover {
    transform: translateX(-2px);
    border-color: var(--primary);
    color: var(--primary);
  }

  .header-main {
    flex: 1;
    min-width: 0;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .title-section h1 {
    font-size: 1.1rem;
    margin: 0;
    color: var(--primary);
    font-weight: 700;
    white-space: nowrap;
  }

  .count-badge {
    padding: 0.2rem 0.6rem;
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Filters row (inside header) */
  .filters-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
    margin-top: 0.75rem;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .filters-row {
    border-top-color: #2d3748;
  }

  .filter-tabs {
    display: flex;
    gap: 0.25rem;
    flex-wrap: nowrap;
  }

  .filter-tab {
    padding: 0.4rem 0.75rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
    color: #555;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .filter-tab {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .filter-tab:hover:not(.active) {
    background: #f5f5f5;
    border-color: var(--primary);
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .filter-tab:hover:not(.active) {
    background: #2d3748;
  }

  .filter-tab.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
    font-weight: 600;
    box-shadow: 0 2px 4px color-mix(in srgb, var(--primary) 40%, transparent);
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .filter-tab.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  /* Player filter */
  .player-filter {
    padding: 0.4rem 0.75rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #555;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 100px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .player-filter:hover {
    border-color: var(--primary);
  }

  .player-filter:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .player-filter {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .player-filter option {
    background: #1a2332;
    color: #8b9bb3;
  }

  /* Player combobox (searchable filter) — replaces the old free-text search */
  .player-combo {
    width: 180px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .player-combo :global(button) {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 400;
  }

  .player-combo-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .player-combo :global(.combo-chevron) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: 0.5;
  }

  /* Results info */
  .results-info {
    font-size: 0.75rem;
    color: #999;
    margin-bottom: 0.5rem;
    transition: color 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .results-info {
    color: #6b7a94;
  }

  /* Table */
  .table-container {
    overflow-x: auto;
    overflow-y: auto;
    max-height: calc(100vh - 220px);
    background: white;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: all 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .table-container {
    background: #1a2332;
  }

  .matches-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .matches-table thead {
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    /* position: sticky removed */
    z-index: 1;
    transition: all 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .matches-table thead {
    background: #0f1419;
    border-color: #2d3748;
  }

  .matches-table th {
    padding: 0.6rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #666;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: color 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .matches-table th {
    color: #8b9bb3;
  }

  .match-row {
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .match-row {
    border-color: #2d3748;
  }

  .match-row:hover {
    background: #f9fafb;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .match-row:hover {
    background: #0f1419;
  }

  .matches-table td {
    padding: 0.6rem 0.75rem;
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .matches-table td {
    color: #e1e8ed;
  }

  /* Players cell */
  .players-cell {
    max-width: 200px;
  }

  .players-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .player-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* Color dot chip instead of colored text */
  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .color-dot {
    border-color: rgba(255, 255, 255, 0.15);
  }

  .player-name {
    font-size: 0.82rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .player-name.winner {
    font-weight: 700;
  }

  :global(.winner-icon-svg) {
    color: #f59e0b;
    flex-shrink: 0;
  }

  /* Result cell */
  .result-cell {
    text-align: left;
  }

  .score-compact {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .score-value {
    color: #666;
    transition: color 0.3s;
  }

  .score-value.winner {
    color: #10b981;
    font-weight: 700;
  }

  .score-sep {
    color: #ccc;
    font-weight: 400;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .score-value {
    color: #8b9bb3;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .score-value.winner {
    color: #34d399;
  }

  /* Type cell */
  .type-badge {
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 600;
    background: var(--primary);
    color: white;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  /* Mode cell */
  .mode-text {
    color: #666;
    font-size: 0.8rem;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .mode-text {
    color: #8b9bb3;
  }

  /* Date cell */
  .date-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .date-text {
    font-size: 0.8rem;
  }

  .time-text {
    color: #888;
    font-size: 0.7rem;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .time-text {
    color: #6b7a94;
  }

  /* Duration cell */
  .duration-text {
    color: #666;
    font-size: 0.8rem;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .duration-text {
    color: #8b9bb3;
  }

  /* Actions cell */
  .actions-cell {
    text-align: center;
    vertical-align: middle;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    background: transparent;
    color: #999;
  }

  .action-btn:hover {
    background: #f3f4f6;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .action-btn:hover {
    background: #2d3748;
  }

  .action-btn.delete-btn:hover {
    color: #ef4444;
    background: #fee2e2;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .action-btn.delete-btn:hover {
    background: #4d1f24;
  }

  /* Load more / End of list */
  .load-more-hint,
  .end-of-list {
    text-align: center;
    padding: 1rem;
    color: #999;
    font-size: 0.85rem;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .load-more-hint,
  .matches-container:is([data-theme='dark'], [data-theme='violet']) .end-of-list {
    color: #6b7a94;
  }

  .end-of-list {
    border-top: 1px dashed #ddd;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .end-of-list {
    border-top-color: #2d3748;
  }

  /* Error state */
  .error-box {
    text-align: center;
    padding: 3rem 2rem;
    background: white;
    border-radius: 8px;
    transition: all 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .error-box {
    background: #1a2332;
  }

  :global(.error-icon-svg) {
    color: #dc2626;
    margin-bottom: 1rem;
  }

  .error-box h3 {
    margin: 0 0 0.5rem 0;
    color: #dc2626;
  }

  .error-box p {
    color: #666;
    margin: 0 0 1rem 0;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .error-box p {
    color: #8b9bb3;
  }

  .retry-btn {
    padding: 0.5rem 1.5rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .retry-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent);
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
  }

  :global(.empty-icon-svg) {
    color: #ccc;
    margin-bottom: 1rem;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) :global(.empty-icon-svg) {
    color: #4a5568;
  }

  .empty-state h3 {
    font-size: 1.5rem;
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .empty-state h3 {
    color: #e1e8ed;
  }

  .empty-state p {
    color: #666;
    margin: 0;
    transition: color 0.3s;
  }

  .matches-container:is([data-theme='dark'], [data-theme='violet']) .empty-state p {
    color: #8b9bb3;
  }

  /* Delete modal */
  .delete-overlay {
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
  }

  .delete-modal {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    max-width: 360px;
    width: 90%;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .delete-modal {
    background: #1a2332;
    color: #e1e8ed;
  }

  .delete-modal h3 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
    color: var(--primary);
  }

  .match-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #f9fafb;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .match-preview {
    background: #0f1419;
  }

  .preview-players {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .preview-players strong {
    color: #1a1a1a;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .preview-players strong {
    color: #e1e8ed;
  }

  .preview-vs {
    color: #999;
    font-weight: 400;
    font-size: 0.8rem;
  }

  .preview-date {
    color: #888;
    font-size: 0.8rem;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .preview-date {
    color: #6b7a94;
  }

  .delete-warning {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0 0 1rem 0;
  }

  .delete-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    margin: 0 0 0.75rem 0;
    font-size: 0.8rem;
    text-align: left;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .delete-error {
    background: #4d1f24;
    border-color: #7f1d1d;
    color: #fca5a5;
  }

  .delete-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .cancel-btn {
    padding: 0.5rem 1rem;
    background: #e5e7eb;
    color: #374151;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-btn:hover:not(:disabled) {
    background: #d1d5db;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .cancel-btn {
    background: #374151;
    color: #e5e7eb;
  }

  .confirm-btn {
    padding: 0.5rem 1rem;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .confirm-btn:hover:not(:disabled) {
    background: #b91c1c;
  }

  .cancel-btn:disabled,
  .confirm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .matches-container {
      padding: 1rem;
    }

    .page-header {
      padding: 0.5rem 0.75rem;
      margin: -1rem -1rem 1rem -1rem;
    }

    .header-row {
      gap: 0.5rem;
    }

    .back-btn {
      width: 32px;
      height: 32px;
    }

    .filters-row {
      flex-direction: column;
      width: 100%;
      gap: 0.5rem;
    }

    .filter-tabs {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 0.25rem;
      flex-wrap: nowrap;
    }

    .filter-tab {
      padding: 0.35rem 0.6rem;
      font-size: 0.75rem;
      flex-shrink: 0;
    }

    .player-filter {
      width: 100%;
      padding: 0.35rem 0.5rem;
      font-size: 0.75rem;
      margin-left: 0;
    }

    .player-combo {
      width: 100%;
      margin-left: 0;
    }

    .table-container {
      max-height: calc(100vh - 260px);
    }

    .hide-mobile {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .hide-small {
      display: none;
    }

    .matches-table th,
    .matches-table td {
      padding: 0.5rem;
    }
  }
</style>
