<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { adminTheme } from '$lib/stores/theme';
  import { goto } from '$app/navigation';
  import { getTournamentsPaginated, deleteTournament as deleteTournamentFirebase } from '$lib/firebase/tournaments';
  import { currentUser } from '$lib/firebase/auth';
  import { isSuperAdminUser } from '$lib/stores/admin';
  import type { Tournament } from '$lib/types/tournament';
  import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

  let tournaments: Tournament[] = $state([]);
  let filteredTournaments: Tournament[] = $state([]);
  let searchQuery = $state('');
  let statusFilter: 'all' | 'DRAFT' | 'GROUP_STAGE' | 'FINAL_STAGE' | 'COMPLETED' | 'CANCELLED' = $state('all');
  let creatorFilter = $state('all'); // 'all', 'mine', or a specific creator userId
  let loading = $state(true);
  let loadingMore = $state(false);
  let showDeleteConfirm = $state(false);
  let tournamentToDelete: Tournament | null = $state(null);
  let deleting = $state(false);
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType: 'success' | 'error' | 'info' | 'warning' = $state('info');
  const pageSize = 15;

  // Infinite scroll state
  let totalCount = $state(0);
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = $state(null);
  let hasMore = $state(true);
  let tableContainer: HTMLElement | null = $state(null);

  let isSearching = $derived(searchQuery.trim().length > 0);

  // Auto-load more if container doesn't have scroll
  $effect(() => {
    if (tableContainer && hasMore && !loading && !loadingMore && !isSearching) {
      if (tableContainer.scrollHeight <= tableContainer.clientHeight) {
        loadMore();
      }
    }
  });
  let isFiltering = $derived(statusFilter !== 'all');

  // Get unique creators from tournaments (for superadmin filter), excluding current user
  interface Creator {
    userId: string;
    userName: string;
  }
  let uniqueCreators = $derived(tournaments.reduce((acc: Creator[], tournament) => {
    const creator = tournament.createdBy;
    const userId = $currentUser?.id;
    // Exclude current user (already has "My tournaments" option)
    if (creator?.userId && creator?.userName && creator.userId !== userId && !acc.find(c => c.userId === creator.userId)) {
      acc.push({ userId: creator.userId, userName: creator.userName });
    }
    return acc;
  }, []).sort((a, b) => a.userName.localeCompare(b.userName)));

  onMount(async () => {
    await loadInitialTournaments();
  });

  async function loadInitialTournaments() {
    loading = true;
    tournaments = [];
    lastDoc = null;

    const result = await getTournamentsPaginated(pageSize, null);
    totalCount = result.totalCount;
    hasMore = result.hasMore;
    lastDoc = result.lastDoc;
    tournaments = result.tournaments;

    filterTournaments();
    loading = false;
  }

  async function loadMore() {
    if (loadingMore || !hasMore || isSearching) return;

    loadingMore = true;
    const result = await getTournamentsPaginated(pageSize, lastDoc);
    hasMore = result.hasMore;
    lastDoc = result.lastDoc;
    tournaments = [...tournaments, ...result.tournaments];
    filterTournaments();
    loadingMore = false;
  }

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (scrollBottom < 100 && hasMore && !loadingMore && !isSearching) {
      loadMore();
    }
  }

  function filterTournaments() {
    const user = get(currentUser);
    filteredTournaments = tournaments.filter(tournament => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        searchQuery === '' ||
        tournament.name.toLowerCase().includes(query) ||
        tournament.description?.toLowerCase().includes(query) ||
        tournament.createdBy?.userName?.toLowerCase().includes(query);

      const matchesStatus = statusFilter === 'all' || tournament.status === statusFilter;

      let matchesCreator = true;
      if (creatorFilter === 'mine') {
        matchesCreator = tournament.createdBy?.userId === user?.id;
      } else if (creatorFilter !== 'all') {
        matchesCreator = tournament.createdBy?.userId === creatorFilter;
      }

      return matchesSearch && matchesStatus && matchesCreator;
    });
  }

  $effect(() => {
    // Track dependencies
    searchQuery;
    statusFilter;
    creatorFilter;
    filterTournaments();
  });

  let displayTotal = $derived(isSearching || isFiltering || creatorFilter !== 'all' ? filteredTournaments.length : totalCount);

  function getStatusText(status: string): string {
    switch (status) {
      case 'DRAFT':
        return m.admin_draft();
      case 'GROUP_STAGE':
        return m.tournament_groupStage();
      case 'FINAL_STAGE':
        return m.tournament_finalStage();
      case 'COMPLETED':
        return m.admin_completed();
      case 'CANCELLED':
        return m.admin_cancelled();
      default:
        return status;
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('es-ES', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit'
    });
  }

  function viewTournament(tournamentId: string) {
    goto(`/admin/tournaments/${tournamentId}`);
  }

  function createTournament() {
    goto('/admin/tournaments/create');
  }

  function getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      DRAFT: '#666',
      GROUP_STAGE: '#fa709a',
      TRANSITION: '#fee140',
      FINAL_STAGE: '#30cfd0',
      COMPLETED: '#4ade80',
      CANCELLED: '#ef4444'
    };
    return colorMap[status] || '#666';
  }

  function getStatusTextColor(status: string): string {
    // Light backgrounds need dark text for contrast
    const darkTextStatuses = ['TRANSITION', 'COMPLETED', 'FINAL_STAGE'];
    return darkTextStatuses.includes(status) ? '#1f2937' : 'white';
  }

  function confirmDelete(tournament: Tournament) {
    tournamentToDelete = tournament;
    showDeleteConfirm = true;
  }

  function duplicateTournament(tournament: Tournament) {
    goto(`/admin/tournaments/create?duplicate=${tournament.id}`);
  }

  function cancelDelete() {
    showDeleteConfirm = false;
    tournamentToDelete = null;
  }

  async function deleteTournament() {
    if (!tournamentToDelete || deleting) return;

    deleting = true;

    const success = await deleteTournamentFirebase(tournamentToDelete.id);

    if (success) {
      toastMessage = m.admin_tournamentDeletedSuccess();
      toastType = 'success';
      showToast = true;
      tournaments = tournaments.filter(t => t.id !== tournamentToDelete!.id);
      totalCount = Math.max(0, totalCount - 1);
      filterTournaments();
    } else {
      toastMessage = m.admin_tournamentDeleteError();
      toastType = 'error';
      showToast = true;
    }

    deleting = false;
    showDeleteConfirm = false;
    tournamentToDelete = null;
  }
</script>

<AdminGuard>
  <div class="tournaments-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" onclick={() => goto('/admin')}>←</button>
        <div class="header-main">
          <div class="title-section">
            <h1>{m.admin_tournamentManagement()}</h1>
            <span class="count-badge">{totalCount}</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="create-btn" onclick={createTournament}>
            + {m.admin_createTournament()}
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>

    <div class="controls-section">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={m.admin_searchTournaments()}
          class="search-input"
        />
      </div>

      <div class="filter-tabs">
        <button
          class="filter-tab"
          class:active={statusFilter === 'all'}
          onclick={() => (statusFilter = 'all')}
        >
          {m.admin_all()} ({tournaments.length})
        </button>
        <button
          class="filter-tab"
          class:active={statusFilter === 'DRAFT'}
          onclick={() => (statusFilter = 'DRAFT')}
        >
          {m.admin_drafts()}
        </button>
        <button
          class="filter-tab"
          class:active={statusFilter === 'COMPLETED'}
          onclick={() => (statusFilter = 'COMPLETED')}
        >
          {m.admin_completedPlural()}
        </button>
      </div>

      {#if $isSuperAdminUser}
        <select class="creator-filter" bind:value={creatorFilter}>
          <option value="all">{m.admin_allCreators()}</option>
          <option value="mine">{m.admin_myTournaments()}</option>
          {#each uniqueCreators as creator}
            <option value={creator.userId}>{creator.userName}</option>
          {/each}
        </select>
      {/if}
    </div>

    {#if loading}
      <LoadingSpinner message={m.admin_loading()} />
    {:else if filteredTournaments.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <h3>{m.admin_noTournaments()}</h3>
        <p>
          {searchQuery || statusFilter !== 'all'
            ? m.admin_noTournamentsFiltered()
            : m.admin_useCreateButton()}
        </p>
      </div>
    {:else}
      <div class="results-info">
        {m.admin_showingOf({ showing: String(filteredTournaments.length), total: String(displayTotal) })}
      </div>

      <div class="table-container" bind:this={tableContainer} onscroll={handleScroll}>
        <table class="tournaments-table">
          <thead>
            <tr>
              <th class="name-col">{m.admin_tournamentName()}</th>
              <th class="city-col hide-small hide-mobile">{m.admin_city()}</th>
              <th class="status-col">{m.admin_status()}</th>
              <th class="type-col hide-mobile">{m.admin_type()}</th>
              <th class="mode-col hide-mobile">{m.admin_mode()}</th>
              <th class="participants-col">Players</th>
              <th class="created-col hide-small hide-mobile">{m.admin_createdBy()}</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredTournaments as tournament (tournament.id)}
              <tr class="tournament-row" onclick={() => viewTournament(tournament.id)}>
                <td class="name-cell">
                  <div class="tournament-name">
                    <div class="name-row">
                      {#if tournament.edition}
                        <span class="edition-badge">#{tournament.edition}</span>
                      {/if}
                      <strong class="tournament-title" title={tournament.name}>{tournament.name.length > 20 ? tournament.name.substring(0, 20) + '...' : tournament.name}</strong>
                      {#if tournament.tournamentDate}
                        <span class="tournament-date">{new Date(tournament.tournamentDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                      {/if}
                    </div>
                    {#if tournament.description}
                      <small class="tournament-desc">{tournament.description}</small>
                    {/if}
                  </div>
                </td>
                <td class="city-cell hide-small hide-mobile">
                  {tournament.city || '-'}
                </td>
                <td class="status-cell">
                  <span
                    class="status-badge"
                    style="background: {getStatusColor(tournament.status)}; color: {getStatusTextColor(tournament.status)};"
                  >
                    {getStatusText(tournament.status)}
                  </span>
                </td>
                <td class="type-cell hide-mobile">
                  {tournament.gameType === 'singles' ? '1v1' : '2v2'}
                </td>
                <td class="mode-cell hide-mobile">
                  {#if tournament.groupStage?.type}
                    <span class="mode-group">
                      {tournament.groupStage.type === 'SWISS' ? m.admin_swissSystem() : 'RR'}
                    </span>
                    <span class="mode-separator">+</span>
                  {/if}
                  {#if tournament.finalStage?.mode === 'SPLIT_DIVISIONS'}
                    <span class="mode-final split">{m.admin_goldSilverDivisions()}</span>
                  {:else}
                    <span class="mode-final">1F</span>
                  {/if}
                </td>
                <td class="participants-cell">
                  👥 {tournament.participants.length}
                </td>
                <td class="created-cell hide-small hide-mobile">
                  <div class="creator-info">
                    <span class="creator-name">{tournament.createdBy?.userName || '-'}</span>
                    <small class="creator-date">{formatDate(tournament.createdAt)}</small>
                  </div>
                </td>
                <td class="actions-cell">
                  <button
                    class="action-btn duplicate-btn"
                    onclick={(e) => { e.stopPropagation(); duplicateTournament(tournament); }}
                    title={m.admin_duplicateTournament()}
                  >
                    📋
                  </button>
                  <button
                    class="action-btn delete-btn"
                    onclick={(e) => { e.stopPropagation(); confirmDelete(tournament); }}
                    title={m.common_delete()}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if loadingMore}
          <LoadingSpinner size="small" message={m.admin_loadingMore()} inline={true} />
        {:else if hasMore && !isSearching && !isFiltering}
          <div class="load-more-hint">
            {m.admin_scrollToLoadMore()}
          </div>
        {:else if !hasMore && !isSearching && !isFiltering}
          <div class="end-of-list">
            {m.admin_endOfList()}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Delete Confirmation Modal -->
  {#if showDeleteConfirm && tournamentToDelete}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" data-theme={$adminTheme} onclick={() => !deleting && cancelDelete()} role="none">
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="confirm-modal" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
        <h2>{m.admin_confirmDelete()}</h2>
        <p>{m.admin_confirmCancelTournament()}</p>
        <div class="tournament-info">
          <strong>{tournamentToDelete.name}</strong>
          <br />
          <span>{tournamentToDelete.participants.length} {m.admin_participants()}</span>
          <br />
          <span>{m.admin_createdAt()}: {formatDate(tournamentToDelete.createdAt)}</span>
        </div>
        <div class="confirm-actions">
          <button class="cancel-btn" onclick={cancelDelete} disabled={deleting}>{m.common_cancel()}</button>
          <button class="delete-btn-confirm" onclick={deleteTournament} disabled={deleting}>
            {#if deleting}
              <LoadingSpinner size="small" inline={true} message={m.admin_deleting()} />
            {:else}
              {m.common_delete()}
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} type={toastType} />

<style>
  .tournaments-container {
    padding: 1.5rem 2rem;
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .tournaments-container[data-theme='dark'] {
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

  .tournaments-container[data-theme='dark'] .page-header {
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
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .tournaments-container[data-theme='dark'] .back-btn {
    background: #0f1419;
    color: #8b9bb3;
    border-color: #2d3748;
  }

  .back-btn:hover {
    transform: translateX(-2px);
    border-color: #667eea;
    color: #667eea;
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
    color: #1a1a1a;
    font-weight: 700;
    white-space: nowrap;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .title-section h1 {
    color: #e1e8ed;
  }

  .count-badge {
    padding: 0.2rem 0.6rem;
    background: #f3f4f6;
    color: #555;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    transition: all 0.3s;
  }

  .tournaments-container[data-theme='dark'] .count-badge {
    background: #0f1419;
    color: #8b9bb3;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .create-btn {
    padding: 0.35rem 0.65rem;
    background: #1a1a1a;
    color: #f5f5f5;
    border: 1px solid #333;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }

  .create-btn:hover {
    background: #2a2a2a;
    border-color: #444;
  }

  .tournaments-container[data-theme='dark'] .create-btn {
    background: #e5e7eb;
    color: #1a1a1a;
    border-color: #d1d5db;
  }

  .tournaments-container[data-theme='dark'] .create-btn:hover {
    background: #f3f4f6;
    border-color: #e5e7eb;
  }

  /* Controls */
  .controls-section {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .search-box {
    flex: 1;
    min-width: 200px;
    max-width: 300px;
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 1rem;
  }

  .search-input {
    width: 100%;
    padding: 0.5rem 0.75rem 0.5rem 2.5rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.85rem;
    background: white;
    transition: all 0.2s;
  }

  .tournaments-container[data-theme='dark'] .search-input {
    background: #1a2332;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .search-input:focus {
    outline: none;
    border-color: #fa709a;
    box-shadow: 0 0 0 2px rgba(250, 112, 154, 0.1);
  }

  .filter-tabs {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
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

  .tournaments-container[data-theme='dark'] .filter-tab {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .filter-tab:hover {
    background: #f5f5f5;
    border-color: #fa709a;
  }

  .tournaments-container[data-theme='dark'] .filter-tab:hover {
    background: #2d3748;
  }

  /* Creator filter select */
  .creator-filter {
    padding: 0.4rem 0.75rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #555;
    cursor: pointer;
    transition: all 0.2s;
    margin-left: auto;
    min-width: 140px;
  }

  .creator-filter:hover {
    border-color: #fa709a;
  }

  .creator-filter:focus {
    outline: none;
    border-color: #fa709a;
    box-shadow: 0 0 0 2px rgba(250, 112, 154, 0.1);
  }

  .tournaments-container[data-theme='dark'] .creator-filter {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .tournaments-container[data-theme='dark'] .creator-filter:hover {
    border-color: #667eea;
  }

  .tournaments-container[data-theme='dark'] .creator-filter:focus {
    border-color: #667eea;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
  }

  .tournaments-container[data-theme='dark'] .creator-filter option {
    background: #1a2332;
    color: #8b9bb3;
  }

  .filter-tab.active {
    background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    color: white;
    border-color: transparent;
    font-weight: 600;
  }

  /* Results info */
  .results-info {
    font-size: 0.75rem;
    color: #999;
    margin-bottom: 0.5rem;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .results-info {
    color: #6b7a94;
  }

  .status-badge {
    padding: 0.35rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .load-more-hint,
  .end-of-list {
    text-align: center;
    padding: 1rem;
    color: #999;
    font-size: 0.85rem;
  }

  .tournaments-container[data-theme='dark'] .load-more-hint,
  .tournaments-container[data-theme='dark'] .end-of-list {
    color: #6b7a94;
  }

  .end-of-list {
    border-top: 1px dashed #ddd;
  }

  .tournaments-container[data-theme='dark'] .end-of-list {
    border-top-color: #2d3748;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
  }

  .empty-icon {
    font-size: 5rem;
    margin-bottom: 1rem;
    opacity: 0.3;
  }

  .empty-state h3 {
    font-size: 1.5rem;
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .empty-state h3 {
    color: #e1e8ed;
  }

  .empty-state p {
    color: #666;
    margin: 0 0 1.5rem 0;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .empty-state p {
    color: #8b9bb3;
  }

  /* Responsive */
  /* Table Styles */
  .table-container {
    overflow-x: auto;
    overflow-y: auto;
    max-height: calc(100vh - 180px);
    background: white;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: all 0.3s;
  }

  .tournaments-container[data-theme='dark'] .table-container {
    background: #1a2332;
  }

  .tournaments-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .tournaments-table thead {
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 1;
    transition: all 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournaments-table thead {
    background: #0f1419;
    border-color: #2d3748;
  }

  .tournaments-table th {
    padding: 0.6rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #666;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournaments-table th {
    color: #8b9bb3;
  }

  .tournament-row {
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tournament-row:nth-child(even) {
    background: #f9fafb;
  }

  .tournaments-container[data-theme='dark'] .tournament-row {
    border-color: #2d3748;
  }

  .tournaments-container[data-theme='dark'] .tournament-row:nth-child(even) {
    background: #0f1419;
  }

  .tournament-row:hover {
    background: #f3f4f6;
  }

  .tournaments-container[data-theme='dark'] .tournament-row:hover {
    background: #243447;
  }

  .tournaments-table td {
    padding: 0.6rem 0.75rem;
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournaments-table td {
    color: #e1e8ed;
  }

  .name-cell {
    max-width: 300px;
  }

  .name-cell .tournament-name {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tournament-title {
    font-weight: 600;
  }

  .edition-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.15rem 0.4rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    min-width: 24px;
  }

  .city-cell {
    color: #666;
    font-size: 0.85rem;
  }

  .tournaments-container[data-theme='dark'] .city-cell {
    color: #8b9bb3;
  }

  .tournament-date {
    font-size: 0.75rem;
    color: #999;
    white-space: nowrap;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournament-date {
    color: #6b7a94;
  }

  .tournament-desc {
    color: #666;
    font-size: 0.85rem;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournament-desc {
    color: #8b9bb3;
  }

  /* Creator cell */
  .creator-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .creator-name {
    font-weight: 500;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
  }

  .creator-date {
    color: #999;
    font-size: 0.7rem;
  }

  .tournaments-container[data-theme='dark'] .creator-date {
    color: #6b7a94;
  }

  .status-badge {
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 600;
    display: inline-block;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .actions-cell {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .action-btn {
    padding: 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 1.2rem;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: #f3f4f6;
  }

  .tournaments-container[data-theme='dark'] .action-btn:hover {
    background: #2d3748;
  }

  .delete-btn {
    color: #ef4444;
  }

  .duplicate-btn {
    color: #3b82f6;
  }

  .mode-cell {
    white-space: nowrap;
  }

  .mode-group {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    background: #e0f2fe;
    color: #0369a1;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .tournaments-container[data-theme='dark'] .mode-group {
    background: #1e3a5f;
    color: #7dd3fc;
  }

  .mode-separator {
    margin: 0 0.25rem;
    color: #999;
    font-size: 0.75rem;
  }

  .tournaments-container[data-theme='dark'] .mode-separator {
    color: #6b7a94;
  }

  .mode-final {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    background: #f3f4f6;
    color: #374151;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .mode-final.split {
    background: linear-gradient(135deg, #fcd34d 0%, #c0c0c0 100%);
    color: #1f2937;
  }

  .tournaments-container[data-theme='dark'] .mode-final {
    background: #374151;
    color: #d1d5db;
  }

  .tournaments-container[data-theme='dark'] .mode-final.split {
    background: linear-gradient(135deg, #b8860b 0%, #808080 100%);
    color: #f9fafb;
  }

  /* Modal Styles */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .confirm-modal {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    transition: all 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .confirm-modal {
    background: #1a2332;
  }

  .confirm-modal h2 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
    font-size: 1.5rem;
    transition: color 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .confirm-modal h2 {
    color: #e1e8ed;
  }

  .confirm-modal p {
    color: #666;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .confirm-modal p {
    color: #8b9bb3;
  }

  .tournament-info {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    transition: all 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .tournament-info {
    background: #0f1419;
  }

  .tournament-info strong {
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .tournament-info strong {
    color: #e1e8ed;
  }

  .tournament-info span {
    color: #666;
    font-size: 0.9rem;
    transition: color 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .tournament-info span {
    color: #8b9bb3;
  }

  .confirm-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .cancel-btn {
    padding: 0.75rem 1.5rem;
    background: #f3f4f6;
    color: #1a1a1a;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modal-backdrop[data-theme='dark'] .cancel-btn {
    background: #0f1419;
    color: #e1e8ed;
  }

  .cancel-btn:hover {
    background: #e5e7eb;
  }

  .modal-backdrop[data-theme='dark'] .cancel-btn:hover {
    background: #2d3748;
  }

  .delete-btn-confirm {
    padding: 0.75rem 1.5rem;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 42px;
    min-width: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .delete-btn-confirm:hover {
    background: #dc2626;
  }

  @media (max-width: 640px) {
    .hide-small {
      display: none !important;
    }
  }

  @media (max-width: 768px) {
    .tournaments-container {
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
      font-size: 1rem;
    }

    .title-section h1 {
      font-size: 0.95rem;
    }

    .count-badge {
      font-size: 0.7rem;
      padding: 0.15rem 0.5rem;
    }

    .create-btn {
      padding: 0.4rem 0.75rem;
      font-size: 0.8rem;
    }

    .controls-section {
      flex-direction: column;
      gap: 0.75rem;
    }

    .search-box {
      max-width: none;
    }

    .filter-tabs {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 0.25rem;
    }

    .filter-tab {
      padding: 0.35rem 0.6rem;
      font-size: 0.75rem;
    }

    .hide-mobile {
      display: none;
    }

    .tournaments-table {
      font-size: 0.8rem;
    }

    .tournaments-table td,
    .tournaments-table th {
      padding: 0.5rem 0.4rem;
    }

    .name-cell {
      max-width: 150px;
    }

    .status-badge {
      font-size: 0.6rem;
      padding: 0.1rem 0.4rem;
    }

    .participants-cell {
      font-size: 0.8rem;
    }

    .action-btn {
      font-size: 0.9rem;
      padding: 0.35rem;
    }
  }

  @media (max-width: 480px) {
    .page-header {
      padding: 0.4rem 0.5rem;
      margin: -1rem -1rem 0.75rem -1rem;
    }

    .back-btn {
      width: 28px;
      height: 28px;
      font-size: 0.9rem;
    }

    .title-section h1 {
      font-size: 0.85rem;
    }

    .count-badge {
      font-size: 0.65rem;
    }

    .create-btn {
      padding: 0.35rem 0.6rem;
      font-size: 0.75rem;
    }

    .name-cell {
      max-width: 100px;
    }

    .tournaments-table {
      font-size: 0.75rem;
    }

    .tournaments-table td,
    .tournaments-table th {
      padding: 0.4rem 0.25rem;
    }

    .filter-tab {
      padding: 0.3rem 0.5rem;
      font-size: 0.7rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .tournaments-container {
      padding: 0.5rem 1rem;
      min-height: 100vh;
      max-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .page-header {
      padding: 0.4rem 0.75rem;
      margin: -0.5rem -1rem 0.5rem -1rem;
      flex-shrink: 0;
    }

    .back-btn {
      width: 28px;
      height: 28px;
      font-size: 0.9rem;
    }

    .title-section h1 {
      font-size: 0.9rem;
    }

    .count-badge {
      font-size: 0.65rem;
    }

    .create-btn {
      padding: 0.35rem 0.6rem;
      font-size: 0.75rem;
    }

    .controls-section {
      margin-bottom: 0.5rem;
      flex-shrink: 0;
      gap: 0.5rem;
    }

    .search-input {
      padding: 0.4rem 0.5rem 0.4rem 2rem;
      font-size: 0.8rem;
    }

    .filter-tab {
      padding: 0.3rem 0.5rem;
      font-size: 0.7rem;
    }

    .empty-state {
      padding: 1.5rem;
    }

    .empty-icon {
      font-size: 2.5rem;
    }

    .empty-state h3 {
      font-size: 1.1rem;
    }

    .empty-state p {
      font-size: 0.85rem;
    }

    .results-info {
      font-size: 0.75rem;
      margin-bottom: 0.5rem;
      flex-shrink: 0;
    }

    .table-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
    }

    .tournaments-table {
      font-size: 0.75rem;
    }

    .tournaments-table th {
      padding: 0.5rem 0.4rem;
      font-size: 0.7rem;
    }

    .tournaments-table td {
      padding: 0.6rem 0.4rem;
    }

    .tournament-title {
      font-size: 0.85rem;
    }

    .tournament-desc {
      font-size: 0.7rem;
    }

    .status-badge {
      font-size: 0.65rem;
      padding: 0.2rem 0.5rem;
    }

    .action-btn {
      font-size: 1rem;
      padding: 0.3rem;
    }

    .name-cell {
      max-width: 180px;
    }

    .confirm-modal {
      padding: 1.25rem;
      max-width: 350px;
    }

    .confirm-modal h2 {
      font-size: 1.2rem;
      margin-bottom: 0.75rem;
    }

    .confirm-modal p {
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }

    .tournament-info {
      padding: 0.75rem;
      margin-bottom: 1rem;
      font-size: 0.85rem;
    }

    .cancel-btn,
    .delete-btn-confirm {
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
    }
  }
</style>
