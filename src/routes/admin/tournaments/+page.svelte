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
  let statusFilter: 'all' | 'UPCOMING' | 'COMPLETED' = $state('all');
  let importedFilter: 'all' | 'imported' | 'live' = $state('all'); // 'all', 'imported', 'live'
  let testFilter: 'all' | 'real' | 'test' = $state('all'); // 'all', 'real' (no test), 'test' (only test)
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
  let isFiltering = $derived(statusFilter !== 'all' || importedFilter !== 'all' || testFilter !== 'all');

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

  // Helper to get user's role in tournament
  function getUserRole(tournament: Tournament): 'owner' | 'collaborator' | 'none' {
    const userId = $currentUser?.id;
    if (!userId) return 'none';

    const ownerId = tournament.ownerId || tournament.createdBy?.userId;
    if (ownerId === userId) return 'owner';
    if (tournament.adminIds?.includes(userId)) return 'collaborator';
    return 'none';
  }

  // Helper to get collaborator count
  function getCollaboratorCount(tournament: Tournament): number {
    return tournament.adminIds?.length || 0;
  }

  onMount(async () => {
    // Load testFilter from localStorage
    const savedTestFilter = localStorage.getItem('adminTestFilter');
    if (savedTestFilter && ['all', 'real', 'test'].includes(savedTestFilter)) {
      testFilter = savedTestFilter as 'all' | 'real' | 'test';
    }
    await loadInitialTournaments();
  });

  // Save testFilter to localStorage when it changes
  $effect(() => {
    localStorage.setItem('adminTestFilter', testFilter);
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

  // Helper to check if tournament has a future date
  function hasFutureDate(tournament: Tournament): boolean {
    const now = Date.now();
    return tournament.tournamentDate != null && tournament.tournamentDate > now;
  }

  // Helper to check if tournament is upcoming (future date + isImported)
  function isUpcomingTournament(tournament: Tournament): boolean {
    if (!tournament.isImported) return false;
    return hasFutureDate(tournament);
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

      // Status filter
      let matchesStatus = false;
      if (statusFilter === 'all') {
        matchesStatus = true;
      } else if (statusFilter === 'UPCOMING') {
        // UPCOMING filter: show tournaments with future date (upcoming or draft with future date)
        matchesStatus = hasFutureDate(tournament);
      } else if (statusFilter === 'COMPLETED') {
        // COMPLETED filter: show truly completed tournaments (not upcoming ones)
        matchesStatus = tournament.status === 'COMPLETED' && !isUpcomingTournament(tournament);
      }

      // Imported filter
      let matchesImported = true;
      if (importedFilter === 'imported') {
        matchesImported = tournament.isImported === true;
      } else if (importedFilter === 'live') {
        matchesImported = !tournament.isImported;
      }

      // Test filter
      let matchesTest = true;
      if (testFilter === 'real') {
        matchesTest = !tournament.isTest;
      } else if (testFilter === 'test') {
        matchesTest = tournament.isTest === true;
      }

      let matchesCreator = true;
      if (creatorFilter === 'mine') {
        matchesCreator = tournament.createdBy?.userId === user?.id;
      } else if (creatorFilter !== 'all') {
        matchesCreator = tournament.createdBy?.userId === creatorFilter;
      }

      return matchesSearch && matchesStatus && matchesImported && matchesTest && matchesCreator;
    });
  }

  $effect(() => {
    // Track dependencies
    searchQuery;
    statusFilter;
    importedFilter;
    testFilter;
    creatorFilter;
    filterTournaments();
  });

  let displayTotal = $derived(isSearching || isFiltering || creatorFilter !== 'all' ? filteredTournaments.length : totalCount);

  function getStatusText(tournament: Tournament): string {
    // For imported tournaments with future date, show "Upcoming"
    if (tournament.isImported && tournament.tournamentDate && tournament.tournamentDate > Date.now()) {
      return m.tournament_upcoming(); // "Próximamente" / "Confirmed"
    }

    // Show the actual tournament status
    switch (tournament.status) {
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
        return tournament.status;
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

  function importTournament() {
    goto('/admin/tournaments/import');
  }

  function getStatusColor(tournament: Tournament): string {
    // For imported tournaments with future date, show purple (upcoming)
    if (tournament.isImported && tournament.tournamentDate && tournament.tournamentDate > Date.now()) {
      return '#8b5cf6'; // Purple for upcoming
    }

    // Use standard status colors
    const colorMap: Record<string, string> = {
      DRAFT: '#666',
      GROUP_STAGE: '#fa709a',
      TRANSITION: '#fee140',
      FINAL_STAGE: '#30cfd0',
      COMPLETED: '#4ade80',
      CANCELLED: '#ef4444'
    };
    return colorMap[tournament.status] || '#666';
  }

  function getStatusTextColor(tournament: Tournament): string {
    // For imported tournaments with future date (purple background), use white text
    if (tournament.isImported && tournament.tournamentDate && tournament.tournamentDate > Date.now()) {
      return 'white';
    }
    // Light backgrounds need dark text for contrast
    const darkTextStatuses = ['TRANSITION', 'COMPLETED', 'FINAL_STAGE'];
    return darkTextStatuses.includes(tournament.status) ? '#1f2937' : 'white';
  }

  function confirmDelete(tournament: Tournament) {
    tournamentToDelete = tournament;
    showDeleteConfirm = true;
  }

  function duplicateTournament(tournament: Tournament) {
    // Use import wizard for imported tournaments, create wizard for live tournaments
    if (tournament.isImported) {
      goto(`/admin/tournaments/import?duplicate=${tournament.id}`);
    } else {
      goto(`/admin/tournaments/create?duplicate=${tournament.id}`);
    }
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
          <button class="import-btn" onclick={importTournament} title={m.import_importTournament()}>
            <span class="btn-icon">📥</span>
            <span class="btn-text">{m.import_importTournament()}</span>
          </button>
          <button class="create-btn" onclick={createTournament} title={m.admin_createTournament()}>
            <span class="btn-icon">+</span>
            <span class="btn-text">{m.admin_createTournament()}</span>
          </button>
          <ThemeToggle />
        </div>
      </div>

      <div class="filters-row">
        <!-- Status filter tabs -->
        <div class="filter-tabs">
          <button
            class="filter-tab"
            class:active={statusFilter === 'all'}
            onclick={() => (statusFilter = 'all')}
          >
            {m.admin_all()}
          </button>
          <button
            class="filter-tab"
            class:active={statusFilter === 'UPCOMING'}
            onclick={() => (statusFilter = 'UPCOMING')}
          >
            {m.tournament_upcoming()}
          </button>
          <button
            class="filter-tab"
            class:active={statusFilter === 'COMPLETED'}
            onclick={() => (statusFilter = 'COMPLETED')}
          >
            {m.admin_completedPlural()}
          </button>
        </div>

        <!-- Type filter tabs (secondary) -->
        <div class="filter-tabs secondary">
          <button
            class="filter-tab"
            class:active={importedFilter === 'all'}
            onclick={() => (importedFilter = 'all')}
          >
            {m.admin_all()}
          </button>
          <button
            class="filter-tab"
            class:active={importedFilter === 'live'}
            onclick={() => (importedFilter = 'live')}
          >
            {m.admin_filterLive()}
          </button>
          <button
            class="filter-tab"
            class:active={importedFilter === 'imported'}
            onclick={() => (importedFilter = 'imported')}
          >
            {m.admin_filterImported()}
          </button>
        </div>

        <!-- Test filter tabs (tertiary) -->
        <div class="filter-tabs tertiary">
          <button
            class="filter-tab"
            class:active={testFilter === 'all'}
            onclick={() => (testFilter = 'all')}
          >
            {m.admin_all()}
          </button>
          <button
            class="filter-tab"
            class:active={testFilter === 'real'}
            onclick={() => (testFilter = 'real')}
          >
            {m.tournament_realOnly()}
          </button>
          <button
            class="filter-tab"
            class:active={testFilter === 'test'}
            onclick={() => (testFilter = 'test')}
          >
            {m.tournament_testOnly()}
          </button>
        </div>

        <!-- Creator filter (superadmin only) -->
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
              <th class="created-col hide-small hide-mobile">{m.admin_owner()}</th>
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
                      {#if tournament.isTest}
                        <span class="test-indicator" title={m.tournament_isTestHint()}>🧪</span>
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
                    style="background: {getStatusColor(tournament)}; color: {getStatusTextColor(tournament)};"
                  >
                    {getStatusText(tournament)}
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
                  {#if tournament.finalStage?.mode === 'PARALLEL_BRACKETS'}
                    <span class="mode-final">{tournament.finalStage.parallelBrackets?.length || 1}B</span>
                  {:else if tournament.finalStage?.mode === 'SPLIT_DIVISIONS'}
                    <span class="mode-final">2B</span>
                  {:else}
                    <span class="mode-final">1B</span>
                  {/if}
                </td>
                <td class="participants-cell">
                  👥 {tournament.participants.length}
                </td>
                <td class="created-cell hide-small hide-mobile">
                  <div class="creator-info">
                    <div class="creator-row">
                      <span class="creator-name">{tournament.ownerName || tournament.createdBy?.userName || '-'}</span>
                      {#if getUserRole(tournament) === 'owner'}
                        <span class="role-badge owner" title={m.admin_youAreOwner()}>👑</span>
                      {:else if getUserRole(tournament) === 'collaborator'}
                        <span class="role-badge collaborator" title={m.admin_youAreCollaborator()}>🤝</span>
                      {/if}
                      {#if getCollaboratorCount(tournament) > 0}
                        <span class="collab-count" title={m.admin_collaboratorsCount({ count: String(getCollaboratorCount(tournament)) })}>+{getCollaboratorCount(tournament)}</span>
                      {/if}
                    </div>
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .page-header {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .back-btn {
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
    transition: color 0.3s;
  }

  .count-badge {
    padding: 0.2rem 0.6rem;
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    transition: all 0.3s;
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
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .btn-icon {
    display: none;
  }

  .btn-text {
    display: inline;
  }

  .create-btn:hover {
    background: #2a2a2a;
    border-color: #444;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .create-btn {
    background: #e5e7eb;
    color: #1a1a1a;
    border-color: #d1d5db;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .create-btn:hover {
    background: #f3f4f6;
    border-color: #e5e7eb;
  }

  .import-btn {
    padding: 0.35rem 0.65rem;
    background: transparent;
    color: #6b7280;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    letter-spacing: 0.02em;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .import-btn:hover {
    background: #f3f4f6;
    color: #374151;
    border-color: #9ca3af;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .import-btn {
    color: #9ca3af;
    border-color: #4b5563;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .import-btn:hover {
    background: #374151;
    color: #e5e7eb;
    border-color: #6b7280;
  }

  /* Controls */
  .controls-section {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.75rem;
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .search-input {
    background: #1a2332;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  .filters-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
    margin-top: 0.75rem;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .filters-row {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .filter-tab {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .filter-tab:hover {
    background: #f5f5f5;
    border-color: var(--primary);
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .filter-tab:hover {
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
    min-width: 100px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .creator-filter:hover {
    border-color: var(--primary);
  }

  .creator-filter:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .creator-filter {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .creator-filter:hover {
    border-color: var(--primary);
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .creator-filter:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent);
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .creator-filter option {
    background: #1a2332;
    color: #8b9bb3;
  }

  .filter-tab.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
    font-weight: 600;
    box-shadow: 0 2px 4px color-mix(in srgb, var(--primary) 40%, transparent);
  }

  /* Dark/violet theme override for active tabs - ensures primary takes precedence */
  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .filter-tab.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  /* Secondary filter tabs (type filter) - slightly different opacity */
  .filter-tabs.secondary .filter-tab.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
    box-shadow: 0 2px 4px color-mix(in srgb, var(--primary) 35%, transparent);
  }

  /* Tertiary filter tabs (test filter) */
  .filter-tabs.tertiary .filter-tab.active {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
    box-shadow: 0 2px 4px color-mix(in srgb, var(--primary) 30%, transparent);
  }

  /* Test indicator */
  .test-indicator {
    font-size: 0.75rem;
    margin-left: 0.25rem;
  }

  /* Results info */
  .results-info {
    font-size: 0.75rem;
    color: #999;
    margin-bottom: 0.5rem;
    transition: color 0.3s;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .results-info {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .load-more-hint,
  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .end-of-list {
    color: #6b7a94;
  }

  .end-of-list {
    border-top: 1px dashed #ddd;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .end-of-list {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .empty-state h3 {
    color: #e1e8ed;
  }

  .empty-state p {
    color: #666;
    margin: 0 0 1.5rem 0;
    transition: color 0.3s;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .empty-state p {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .table-container {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .tournaments-table thead {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .tournaments-table th {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .tournament-row {
    border-color: #2d3748;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .tournament-row:nth-child(even) {
    background: #0f1419;
  }

  .tournament-row:hover {
    background: #f3f4f6;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .tournament-row:hover {
    background: #243447;
  }

  .tournaments-table td {
    padding: 0.6rem 0.75rem;
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .tournaments-table td {
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
    background: var(--primary);
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .city-cell {
    color: #8b9bb3;
  }

  .tournament-date {
    font-size: 0.75rem;
    color: #999;
    white-space: nowrap;
    transition: color 0.3s;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .tournament-date {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .tournament-desc {
    color: #8b9bb3;
  }

  /* Creator cell */
  .creator-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .creator-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .creator-name {
    font-weight: 500;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
  }

  .role-badge {
    font-size: 0.7rem;
    line-height: 1;
  }

  .collab-count {
    font-size: 0.65rem;
    font-weight: 600;
    color: #6366f1;
    background: rgba(99, 102, 241, 0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .collab-count {
    color: #818cf8;
    background: rgba(129, 140, 248, 0.15);
  }

  .creator-date {
    color: #999;
    font-size: 0.7rem;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .creator-date {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .action-btn:hover {
    background: #2d3748;
  }

  .delete-btn {
    color: #ef4444;
  }

  .duplicate-btn {
    color: var(--primary);
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .mode-group {
    background: #1e3a5f;
    color: #7dd3fc;
  }

  .mode-separator {
    margin: 0 0.25rem;
    color: #999;
    font-size: 0.75rem;
  }

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .mode-separator {
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

  .tournaments-container:is([data-theme='dark'], [data-theme='violet']) .mode-final {
    background: #374151;
    color: #d1d5db;
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

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal {
    background: #1a2332;
  }

  .confirm-modal h2 {
    margin: 0 0 1rem 0;
    color: var(--primary);
    font-size: 1.5rem;
    transition: color 0.3s;
  }

  .confirm-modal p {
    color: #1a1a1a;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal p {
    color: #8b9bb3;
  }

  .tournament-info {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    transition: all 0.3s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .tournament-info {
    background: #0f1419;
  }

  .tournament-info strong {
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .tournament-info strong {
    color: #e1e8ed;
  }

  .tournament-info span {
    color: #1a1a1a;
    font-size: 0.9rem;
    transition: color 0.3s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .tournament-info span {
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

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .cancel-btn {
    background: #0f1419;
    color: #e1e8ed;
  }

  .cancel-btn:hover {
    background: #e5e7eb;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .cancel-btn:hover {
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

    .count-badge {
      font-size: 0.7rem;
      padding: 0.15rem 0.5rem;
    }

    .header-actions {
      gap: 0.35rem;
    }

    .create-btn,
    .import-btn {
      padding: 0.4rem 0.6rem;
      font-size: 0.85rem;
    }

    .btn-icon {
      display: inline;
    }

    .btn-text {
      display: none;
    }

    .controls-section {
      flex-direction: column;
      gap: 0.75rem;
    }

    .search-box {
      max-width: none;
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

    .creator-filter {
      width: 100%;
      padding: 0.35rem 0.5rem;
      font-size: 0.75rem;
    }

    .hide-mobile {
      display: none;
    }

    /* Hide title text on mobile, keep only count badge */
    .title-section h1 {
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

    .header-actions {
      gap: 0.35rem;
    }

    .create-btn,
    .import-btn {
      padding: 0.45rem 0.6rem;
      font-size: 0.9rem;
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

    .header-actions {
      gap: 0.35rem;
    }

    .create-btn,
    .import-btn {
      padding: 0.4rem 0.55rem;
      font-size: 0.85rem;
    }

    .btn-icon {
      display: inline;
    }

    .btn-text {
      display: none;
    }

    .title-section h1 {
      display: none;
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
