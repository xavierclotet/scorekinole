<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import { t } from '$lib/stores/language';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { goto } from '$app/navigation';
  import { getTournamentsPaginated, deleteTournament as deleteTournamentFirebase } from '$lib/firebase/tournaments';
  import type { Tournament } from '$lib/types/tournament';
  import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

  let tournaments: Tournament[] = [];
  let filteredTournaments: Tournament[] = [];
  let searchQuery = '';
  let statusFilter: 'all' | 'DRAFT' | 'GROUP_STAGE' | 'FINAL_STAGE' | 'COMPLETED' | 'CANCELLED' = 'all';
  let loading = true;
  let loadingMore = false;
  let showDeleteConfirm = false;
  let tournamentToDelete: Tournament | null = null;
  let showToast = false;
  let toastMessage = '';
  let toastType: 'success' | 'error' | 'info' | 'warning' = 'info';
  const pageSize = 15;

  // Infinite scroll state
  let totalCount = 0;
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let hasMore = true;

  $: isSearching = searchQuery.trim().length > 0;
  $: isFiltering = statusFilter !== 'all';

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
    filteredTournaments = tournaments.filter(tournament => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        searchQuery === '' ||
        tournament.name.toLowerCase().includes(query) ||
        tournament.description?.toLowerCase().includes(query) ||
        tournament.createdBy?.userName?.toLowerCase().includes(query);

      const matchesStatus = statusFilter === 'all' || tournament.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  $: {
    searchQuery;
    statusFilter;
    filterTournaments();
  }

  $: displayTotal = isSearching || isFiltering ? filteredTournaments.length : totalCount;

  function getStatusText(status: string): string {
    switch (status) {
      case 'DRAFT':
        return $t('draft');
      case 'GROUP_STAGE':
        return $t('groupStage');
      case 'FINAL_STAGE':
        return $t('finalStage');
      case 'COMPLETED':
        return $t('completed');
      case 'CANCELLED':
        return $t('cancelled');
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
    if (!tournamentToDelete) return;

    const success = await deleteTournamentFirebase(tournamentToDelete.id);

    if (success) {
      toastMessage = $t('tournamentDeletedSuccess');
      toastType = 'success';
      showToast = true;
      tournaments = tournaments.filter(t => t.id !== tournamentToDelete!.id);
      totalCount = Math.max(0, totalCount - 1);
      filterTournaments();
    } else {
      toastMessage = $t('tournamentDeleteError');
      toastType = 'error';
      showToast = true;
    }

    showDeleteConfirm = false;
    tournamentToDelete = null;
  }
</script>

<AdminGuard>
  <div class="tournaments-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" on:click={() => goto('/admin')}>←</button>
        <div class="header-main">
          <div class="title-section">
            <h1>{$t('tournamentManagement')}</h1>
            <span class="count-badge">{totalCount}</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="create-btn" on:click={createTournament}>
            + {$t('createTournament')}
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
          placeholder={$t('searchTournaments')}
          class="search-input"
        />
      </div>

      <div class="filter-tabs">
        <button
          class="filter-tab"
          class:active={statusFilter === 'all'}
          on:click={() => (statusFilter = 'all')}
        >
          {$t('all')} ({tournaments.length})
        </button>
        <button
          class="filter-tab"
          class:active={statusFilter === 'DRAFT'}
          on:click={() => (statusFilter = 'DRAFT')}
        >
          {$t('drafts')}
        </button>
        <button
          class="filter-tab"
          class:active={statusFilter === 'COMPLETED'}
          on:click={() => (statusFilter = 'COMPLETED')}
        >
          {$t('completedPlural')}
        </button>
      </div>
    </div>

    {#if loading}
      <LoadingSpinner message={$t('loading')} />
    {:else if filteredTournaments.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <h3>{$t('noTournaments')}</h3>
        <p>
          {searchQuery || statusFilter !== 'all'
            ? $t('noTournamentsFiltered')
            : $t('useCreateButton')}
        </p>
      </div>
    {:else}
      <div class="results-info">
        {$t('showingOf').replace('{showing}', String(filteredTournaments.length)).replace('{total}', String(displayTotal))}
      </div>

      <div class="table-container" on:scroll={handleScroll}>
        <table class="tournaments-table">
          <thead>
            <tr>
              <th class="name-col">{$t('name')}</th>
              <th class="city-col hide-small hide-mobile">{$t('city')}</th>
              <th class="status-col">{$t('status')}</th>
              <th class="type-col hide-mobile">{$t('type')}</th>
              <th class="mode-col hide-mobile">{$t('mode')}</th>
              <th class="participants-col">Players</th>
              <th class="created-col hide-small hide-mobile">{$t('createdBy')}</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredTournaments as tournament (tournament.id)}
              <tr class="tournament-row" on:click={() => viewTournament(tournament.id)}>
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
                      {tournament.groupStage.type === 'SWISS' ? $t('swiss') : 'RR'}
                    </span>
                    <span class="mode-separator">+</span>
                  {/if}
                  {#if tournament.finalStage?.mode === 'SPLIT_DIVISIONS' || tournament.finalStageConfig?.mode === 'SPLIT_DIVISIONS'}
                    <span class="mode-final split">{$t('goldSilver')}</span>
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
                    on:click|stopPropagation={() => duplicateTournament(tournament)}
                    title={$t('duplicateTournament')}
                  >
                    📋
                  </button>
                  <button
                    class="action-btn delete-btn"
                    on:click|stopPropagation={() => confirmDelete(tournament)}
                    title={$t('delete')}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if loadingMore}
          <LoadingSpinner size="small" message={$t('loadingMore')} inline={true} />
        {:else if hasMore && !isSearching && !isFiltering}
          <div class="load-more-hint">
            {$t('scrollToLoadMore')}
          </div>
        {:else if !hasMore && !isSearching && !isFiltering}
          <div class="end-of-list">
            {$t('endOfList')}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Delete Confirmation Modal -->
  {#if showDeleteConfirm && tournamentToDelete}
    <div class="modal-backdrop" data-theme={$adminTheme} on:click={cancelDelete}>
      <div class="confirm-modal" on:click|stopPropagation>
        <h2>{$t('confirmDelete')}</h2>
        <p>{$t('confirmCancelTournament')}</p>
        <div class="tournament-info">
          <strong>{tournamentToDelete.name}</strong>
          <br />
          <span>{tournamentToDelete.participants.length} {$t('participants')}</span>
          <br />
          <span>{$t('createdAt')}: {formatDate(tournamentToDelete.createdAt)}</span>
        </div>
        <div class="confirm-actions">
          <button class="cancel-btn" on:click={cancelDelete}>{$t('cancel')}</button>
          <button class="delete-btn-confirm" on:click={deleteTournament}>{$t('delete')}</button>
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

  /* Tournament Grid */
  .tournaments-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .tournament-card {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 1.5rem;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .tournaments-container[data-theme='dark'] .tournament-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  .tournament-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
    border-color: #fa709a;
  }

  .tournaments-container[data-theme='dark'] .tournament-card:hover {
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .card-header h3 {
    font-size: 1.25rem;
    margin: 0;
    color: #1a1a1a;
    font-weight: 700;
    flex: 1;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .card-header h3 {
    color: #e1e8ed;
  }

  .status-badge {
    padding: 0.35rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .badge-draft {
    background: #e3f2fd;
    color: #1976d2;
  }

  .badge-group {
    background: #fff3e0;
    color: #f57c00;
  }

  .badge-final {
    background: #fce4ec;
    color: #c2185b;
  }

  .badge-completed {
    background: #e8f5e9;
    color: #388e3c;
  }

  .badge-cancelled {
    background: #f5f5f5;
    color: #757575;
  }

  .description {
    font-size: 0.9rem;
    color: #666;
    margin: 0;
    line-height: 1.4;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .description {
    color: #8b9bb3;
  }

  .card-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
  }

  .info-label {
    color: #999;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .info-label {
    color: #6b7a94;
  }

  .info-value {
    color: #333;
    font-weight: 500;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .info-value {
    color: #c5d0de;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.75rem;
    border-top: 1px solid #f0f0f0;
    transition: border-color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .card-footer {
    border-top-color: #2d3748;
  }

  .creator {
    font-size: 0.8rem;
    color: #999;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .creator {
    color: #6b7a94;
  }

  .arrow {
    font-size: 1.25rem;
    color: #999;
    transition: transform 0.2s, color 0.3s;
  }

  .tournament-card:hover .arrow {
    transform: translateX(4px);
    color: #fa709a;
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

  .create-button-alt {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .create-button-alt:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(250, 112, 154, 0.4);
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

  .tournaments-container[data-theme='dark'] .tournament-row {
    border-color: #2d3748;
  }

  .tournament-row:hover {
    background: #f9fafb;
  }

  .tournaments-container[data-theme='dark'] .tournament-row:hover {
    background: #0f1419;
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

    .tournaments-grid {
      grid-template-columns: 1fr;
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

    .loading-state,
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
