<script lang="ts">
  import { onMount } from 'svelte';
  import SuperAdminGuard from '$lib/components/SuperAdminGuard.svelte';
  import UserEditModal from '$lib/components/UserEditModal.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { goto } from '$app/navigation';
  import { adminTheme } from '$lib/stores/theme';
  import { getUsersPaginated, fetchAllUsers, deleteUser, getUsersTournamentCounts, mergeGuestToRegistered, getRegisteredUsers, removeUserFromTournamentCollaborators, type AdminUserInfo } from '$lib/firebase/admin';
  import { getUserTournamentDependencies, type UserTournamentDependencies } from '$lib/firebase/tournaments';
  import { getVenuesByOwner } from '$lib/firebase/venues';
  import type { Venue } from '$lib/types/venue';
  import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
  import { getQuotaForYear } from '$lib/types/quota';

  const currentYear = new Date().getFullYear();

  // Get quota for current year from new system, fallback to old system
  function getUserQuotaForCurrentYear(user: AdminUserInfo): number {
    // Try new quota system first
    const newSystemQuota = getQuotaForYear(user.quotaEntries, currentYear);
    if (newSystemQuota > 0) return newSystemQuota;
    // Fallback to old system
    return user.maxTournamentsPerYear ?? 0;
  }

  let users: AdminUserInfo[] = $state([]);
  let isLoading = $state(true);
  let isLoadingMore = $state(false);
  let selectedUser: AdminUserInfo | null = $state(null);
  let userToDelete: AdminUserInfo | null = $state(null);
  let isDeleting = $state(false);
  let isLoadingDependencies = $state(false);
  let tournamentDependencies: UserTournamentDependencies | null = $state(null);
  let userVenues: Venue[] = $state([]);

  // Derived: can we delete this user?
  let canDeleteUser = $derived(
    !isLoadingDependencies &&
    tournamentDependencies !== null &&
    tournamentDependencies.asOwner.length === 0 &&
    userVenues.length === 0
  );

  // Migration state
  let userToMigrate: AdminUserInfo | null = $state(null);
  let registeredUsersList: AdminUserInfo[] = $state([]);
  let selectedTargetUserId: string = $state('');
  let isMigrating = $state(false);
  let migrationError: string | null = $state(null);
  let searchQuery = $state('');
  let filterRole: 'all' | 'admin' = $state('all');
  let filterType: 'all' | 'registered' | 'guest' | 'merged' = $state('all');
  const pageSize = 15;

  // Infinite scroll state
  let totalCount = $state(0);
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = $state(null);
  let hasMore = $state(true);
  let tableContainer: HTMLElement | null = $state(null);

  // Search: load all users for searching across entire database
  let allUsersCache: AdminUserInfo[] | null = $state(null);
  let isSearchLoading = $state(false);

  let isSearching = $derived(searchQuery.trim().length > 0);
  let isFiltering = $derived(filterRole !== 'all' || filterType !== 'all');

  // Normalize text for accent-insensitive search (e.g., "nu" matches "nú")
  function normalizeText(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  let filteredUsers = $derived((isSearching && allUsersCache ? allUsersCache : users).filter((user) => {
    if (filterRole === 'admin' && !user.isAdmin) return false;

    // Type filter (registration + merged status)
    if (filterType === 'registered' && user.authProvider !== 'google') return false;
    if (filterType === 'guest' && user.authProvider === 'google') return false;
    if (filterType === 'merged' && !user.mergedFrom) return false;

    if (isSearching) {
      const q = normalizeText(searchQuery);
      return (
        normalizeText(user.playerName ?? '').includes(q) ||
        normalizeText(user.email ?? '').includes(q) ||
        normalizeText(user.userId).includes(q)
      );
    }
    return true;
  }));

  let displayTotal = $derived(isSearching || isFiltering ? filteredUsers.length : totalCount);

  // Auto-load more if container doesn't have scroll (also triggers after deletions or filter changes)
  $effect(() => {
    // Track these to re-trigger when users change or filters change
    const _ = filteredUsers.length;

    if (tableContainer && hasMore && !isLoading && !isLoadingMore && !isSearching) {
      // Use requestAnimationFrame to wait for DOM update
      requestAnimationFrame(() => {
        if (tableContainer && tableContainer.scrollHeight <= tableContainer.clientHeight) {
          loadMore();
        }
      });
    }
  });

  // Debounced search: fetch all users on first search attempt
  $effect(() => {
    const query = searchQuery.trim();
    if (query.length === 0 || allUsersCache) return;

    const timer = setTimeout(async () => {
      isSearchLoading = true;
      try {
        allUsersCache = await fetchAllUsers();
      } catch (error) {
        console.error('Error loading users for search:', error);
      } finally {
        isSearchLoading = false;
      }
    }, 300);

    return () => clearTimeout(timer);
  });

  onMount(() => {
    loadInitialUsers();
  });

  async function loadInitialUsers() {
    isLoading = true;
    users = [];
    lastDoc = null;

    try {
      const result = await getUsersPaginated(pageSize, null);
      totalCount = result.totalCount;
      hasMore = result.hasMore;
      lastDoc = result.lastDoc;
      users = result.users;

      // Fetch tournament counts for admin users
      await loadTournamentCounts(result.users);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      isLoading = false;
    }
  }

  async function loadMore() {
    if (isLoadingMore || !hasMore || isSearching) return;

    isLoadingMore = true;
    try {
      const result = await getUsersPaginated(pageSize, lastDoc);
      hasMore = result.hasMore;
      lastDoc = result.lastDoc;

      // Fetch tournament counts for admin users
      await loadTournamentCounts(result.users);

      users = [...users, ...result.users];
    } catch (error) {
      console.error('Error loading more users:', error);
    } finally {
      isLoadingMore = false;
    }
  }

  async function loadTournamentCounts(userList: AdminUserInfo[]) {
    const adminUserIds = userList.filter(u => u.isAdmin).map(u => u.userId);
    if (adminUserIds.length === 0) return;

    const counts = await getUsersTournamentCounts(adminUserIds);
    userList.forEach(user => {
      if (counts.has(user.userId)) {
        user.tournamentsCreatedCount = counts.get(user.userId);
      }
    });
  }

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (scrollBottom < 100 && hasMore && !isLoadingMore && !isSearching) {
      loadMore();
    }
  }

  function editUser(user: AdminUserInfo) {
    selectedUser = user;
  }

  function closeEditModal() {
    selectedUser = null;
  }

  async function handleUserUpdated() {
    closeEditModal();
    allUsersCache = null;
    await loadInitialUsers();
  }

  async function showDeleteConfirm(user: AdminUserInfo) {
    userToDelete = user;
    isLoadingDependencies = true;
    tournamentDependencies = null;
    userVenues = [];

    // Load dependencies in parallel
    const [tournaments, venues] = await Promise.all([
      getUserTournamentDependencies(user.userId),
      getVenuesByOwner(user.userId)
    ]);

    tournamentDependencies = tournaments;
    userVenues = venues;
    isLoadingDependencies = false;
  }

  function cancelDelete() {
    userToDelete = null;
    tournamentDependencies = null;
    userVenues = [];
    isLoadingDependencies = false;
  }

  async function confirmDelete() {
    if (!userToDelete || !canDeleteUser) return;

    isDeleting = true;

    // 1. If user is a collaborator, remove from adminIds first
    if (tournamentDependencies?.asCollaborator.length) {
      await removeUserFromTournamentCollaborators(
        userToDelete.userId,
        tournamentDependencies.asCollaborator.map((t) => t.id)
      );
    }

    // 2. Delete the user
    const success = await deleteUser(userToDelete.userId);

    if (success) {
      users = users.filter((u) => u.userId !== userToDelete!.userId);
      totalCount = Math.max(0, totalCount - 1);
      allUsersCache = null;
    }

    isDeleting = false;
    userToDelete = null;
    tournamentDependencies = null;
    userVenues = [];
  }

  function formatDate(timestamp: any): string {
    if (!timestamp) return '-';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('es-ES', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return '-';
    }
  }

  // Migration functions
  async function showMigrateModal(user: AdminUserInfo) {
    userToMigrate = user;
    selectedTargetUserId = '';
    migrationError = null;
    // Load registered users for the dropdown
    registeredUsersList = await getRegisteredUsers();
  }

  function cancelMigrate() {
    userToMigrate = null;
    selectedTargetUserId = '';
    migrationError = null;
  }

  async function confirmMigrate() {
    if (!userToMigrate || !selectedTargetUserId) return;

    isMigrating = true;
    migrationError = null;

    const result = await mergeGuestToRegistered(userToMigrate.userId, selectedTargetUserId);

    if (result.success) {
      // Update local state - mark user as merged
      users = users.map(u => {
        if (u.userId === userToMigrate!.userId) {
          return { ...u, mergedTo: selectedTargetUserId };
        }
        return u;
      });
      cancelMigrate();
      allUsersCache = null;
      // Reload to get fresh data
      await loadInitialUsers();
    } else {
      migrationError = result.error || m.admin_migrationError();
    }

    isMigrating = false;
  }

  function isGuestUser(user: AdminUserInfo): boolean {
    return user.authProvider !== 'google' && !user.mergedTo;
  }
</script>

<SuperAdminGuard>
  <div class="users-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" onclick={() => goto('/admin')}>←</button>
        <div class="header-main">
          <div class="title-section">
            <h1>{m.admin_userManagement()}</h1>
            <span class="count-badge">{totalCount}</span>
          </div>
        </div>
        <div class="header-actions">
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
          placeholder={m.admin_searchUsers()}
          class="search-input"
        />
      </div>

      <div class="filter-controls">
        <button
          class="filter-tab"
          class:active={filterRole === 'admin'}
          onclick={() => (filterRole = filterRole === 'admin' ? 'all' : 'admin')}
        >
          Admins
        </button>

        <select
          class="filter-select"
          bind:value={filterType}
        >
          <option value="all">{m.admin_allUsers()}</option>
          <option value="registered">{m.admin_registeredUsers()}</option>
          <option value="guest">{m.admin_guestUsers()}</option>
          <option value="merged">{m.admin_merged()}</option>
        </select>
      </div>
    </div>

    {#if isLoading || (isSearching && isSearchLoading && !allUsersCache)}
      <LoadingSpinner message={isSearchLoading ? m.admin_searchingAllUsers() : m.admin_loading()} />
    {:else if filteredUsers.length === 0}
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3>{m.admin_noUsersFound()}</h3>
        <p>{searchQuery || isFiltering ? 'No hay usuarios que coincidan con los filtros' : 'No hay usuarios registrados'}</p>
      </div>
    {:else}
      <div class="results-info">
        {m.admin_showingOf({ showing: String(filteredUsers.length), total: String(displayTotal) })}
      </div>

      <div class="table-container" bind:this={tableContainer} onscroll={handleScroll}>
        <table class="users-table">
          <thead>
            <tr>
              <th class="name-col">{m.admin_playerName()}</th>
              <th class="role-col">Admin</th>
              <th class="tournaments-col hide-small">{m.admin_tournaments()}</th>
              <th class="quota-col hide-small">Cuota</th>
              <th class="created-col hide-small">{m.admin_createdAt()}</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredUsers as user (user.userId)}
              <tr class="user-row" onclick={() => editUser(user)}>
                <td class="name-cell">
                  <div class="user-info">
                    {#if user.photoURL}
                      <img src={user.photoURL} alt={user.playerName} class="user-avatar" referrerpolicy="no-referrer" />
                    {:else}
                      <div class="user-avatar-placeholder">
                        {user.playerName?.charAt(0).toUpperCase() || '?'}
                      </div>
                    {/if}
                    <div class="user-details">
                      <strong class="user-name">{user.playerName || 'Sin nombre'}</strong>
                      <small class="user-email">{user.email || '-'}</small>
                    </div>
                  </div>
                </td>
                <td class="role-cell">
                  {#if user.isSuperAdmin}
                    <span class="role-badge super">Super</span>
                    <span class="tournaments-created">{user.tournamentsCreatedCount ?? 0}</span>
                  {:else if user.isAdmin}
                    <span class="role-badge admin">Admin</span>
                    <span class="tournaments-created">{user.tournamentsCreatedCount ?? 0}</span>
                  {:else}
                    <span class="role-badge user">User</span>
                  {/if}
                </td>
                <td class="tournaments-cell hide-small">
                  🏆 {user.tournaments?.length ?? 0}
                </td>
                <td class="quota-cell hide-small">
                  {#if user.isSuperAdmin}
                    <span class="quota-unlimited">∞</span>
                  {:else if user.isAdmin}
                    <span class="quota-value">{getUserQuotaForCurrentYear(user)} → {currentYear}</span>
                  {:else}
                    <span class="quota-na">-</span>
                  {/if}
                </td>
                <td class="created-cell hide-small">
                  {formatDate(user.createdAt)}
                </td>
                <td class="actions-cell">
                  {#if isGuestUser(user)}
                    <button
                      class="action-btn migrate-btn"
                      onclick={(e) => { e.stopPropagation(); showMigrateModal(user); }}
                      title={m.admin_migrateUser()}
                    >
                      🔗
                    </button>
                  {/if}
                  <button
                    class="action-btn delete-btn"
                    onclick={(e) => { e.stopPropagation(); showDeleteConfirm(user); }}
                    title={m.common_delete()}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if isLoadingMore}
          <LoadingSpinner size="small" message={m.admin_loadingMore()} inline={true} />
        {:else if hasMore && !isSearching && !isFiltering}
          <div class="load-more-hint">
            {m.admin_scrollToLoadMore()}
          </div>
        {:else if !hasMore && filteredUsers.length > 0}
          <div class="end-of-list">
            {m.admin_endOfList()}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if selectedUser}
    <UserEditModal
      user={selectedUser}
      allUsers={users}
      onClose={closeEditModal}
      onuserUpdated={handleUserUpdated}
    />
  {/if}

  {#if userToDelete}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="delete-overlay" data-theme={$adminTheme} onclick={cancelDelete} onkeydown={(e) => e.key === 'Escape' && cancelDelete()} role="presentation">
      <div class="delete-modal delete-modal-wide" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h3>{m.admin_deleteUser()}</h3>
        <div class="user-preview">
          {#if userToDelete.photoURL}
            <img src={userToDelete.photoURL} alt="" class="preview-avatar" referrerpolicy="no-referrer" />
          {:else}
            <div class="preview-avatar-placeholder">
              {userToDelete.playerName?.charAt(0).toUpperCase() || '?'}
            </div>
          {/if}
          <strong>{userToDelete.playerName || userToDelete.email || '?'}</strong>
        </div>

        <!-- Dependencies section -->
        <div class="dependencies-section">
          <h4 class="dependencies-title">{m.admin_userDependencies()}</h4>
          {#if isLoadingDependencies}
            <div class="dependencies-loading">
              <span class="loading-spinner-small"></span>
              <span>{m.admin_loadingDependencies()}</span>
            </div>
          {:else if tournamentDependencies}
            {@const hasOwner = tournamentDependencies.asOwner.length > 0}
            {@const hasVenues = userVenues.length > 0}
            {@const hasCollaborator = tournamentDependencies.asCollaborator.length > 0}
            {@const hasParticipant = tournamentDependencies.asParticipant.length > 0}
            {@const hasDependencies = hasOwner || hasVenues || hasCollaborator || hasParticipant}

            <div class="dependencies-content">
            {#if hasDependencies}
              <!-- Owner tournaments (blocking) -->
              {#if hasOwner}
                <div class="dependency-group">
                  <div class="dependency-header owner">
                    <span class="dependency-icon">👑</span>
                    <span>{m.admin_asOwner({ count: String(tournamentDependencies.asOwner.length) })}</span>
                  </div>
                  <ul class="dependency-list">
                    {#each tournamentDependencies.asOwner as tournament (tournament.id)}
                      <li class="dependency-item">
                        <span class="tournament-name">{tournament.name}</span>
                        <span class="tournament-status status-{tournament.status.toLowerCase()}">{tournament.status}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Venues (blocking) -->
              {#if hasVenues}
                <div class="dependency-group">
                  <div class="dependency-header owner">
                    <span class="dependency-icon">🏠</span>
                    <span>{m.admin_venuesAsOwner({ count: String(userVenues.length) })}</span>
                  </div>
                  <ul class="dependency-list">
                    {#each userVenues as venue (venue.id)}
                      <li class="dependency-item">
                        <span class="tournament-name">{venue.name}</span>
                        <span class="venue-city">{venue.city}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Collaborator tournaments (will be auto-removed) -->
              {#if hasCollaborator}
                <div class="dependency-group">
                  <div class="dependency-header collaborator">
                    <span class="dependency-icon">🤝</span>
                    <span>{m.admin_asCollaborator({ count: String(tournamentDependencies.asCollaborator.length) })}</span>
                  </div>
                  <p class="dependency-note">{m.admin_collaboratorWillBeRemoved()}</p>
                  <ul class="dependency-list">
                    {#each tournamentDependencies.asCollaborator as tournament (tournament.id)}
                      <li class="dependency-item">
                        <span class="tournament-name">{tournament.name}</span>
                        <span class="tournament-status status-{tournament.status.toLowerCase()}">{tournament.status}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Participant tournaments (info only) -->
              {#if hasParticipant}
                <div class="dependency-group">
                  <div class="dependency-header participant">
                    <span class="dependency-icon">🎮</span>
                    <span>{m.admin_asParticipant({ count: String(tournamentDependencies.asParticipant.length) })}</span>
                  </div>
                  <ul class="dependency-list">
                    {#each tournamentDependencies.asParticipant as tournament (tournament.id)}
                      <li class="dependency-item">
                        <span class="tournament-name">{tournament.name}</span>
                        <span class="tournament-status status-{tournament.status.toLowerCase()}">{tournament.status}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Block message if owner -->
              {#if hasOwner || hasVenues}
                <div class="block-message">
                  <span>❌</span>
                  <span>{m.admin_cannotDeleteHasOwnership()}</span>
                </div>
              {/if}
            {:else}
              <div class="no-dependencies">
                <span>✓</span>
                <span>{m.admin_noDependencies()}</span>
              </div>
            {/if}
            </div>
          {/if}
        </div>

        <p class="delete-warning">{m.admin_cannotBeUndone()}</p>
        <div class="delete-actions">
          <button class="cancel-btn" onclick={cancelDelete} disabled={isDeleting || isLoadingDependencies}>
            {m.common_cancel()}
          </button>
          <button
            class="confirm-btn"
            onclick={confirmDelete}
            disabled={isDeleting || isLoadingDependencies || !canDeleteUser}
          >
            {isDeleting ? m.admin_deleting() : m.common_delete()}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if userToMigrate}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="migrate-overlay" data-theme={$adminTheme} onclick={cancelMigrate} onkeydown={(e) => e.key === 'Escape' && cancelMigrate()} role="presentation">
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
      <div class="migrate-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h3>{m.admin_migrateUserTitle()}</h3>

        <div class="migrate-source">
          <span class="migrate-label">{m.admin_sourceUser()}</span>
          <div class="user-preview">
            <div class="preview-avatar-placeholder">
              {userToMigrate.playerName?.charAt(0).toUpperCase() || '?'}
            </div>
            <div class="user-preview-info">
              <strong>{userToMigrate.playerName}</strong>
              <small>{m.admin_tournamentsToMigrate({ n: String(userToMigrate.tournaments?.length ?? 0) })}</small>
              <small>{m.admin_rankingToMigrate({ n: String(userToMigrate.tournaments?.reduce((sum, t) => sum + (t.rankingDelta || 0), 0) ?? 0) })}</small>
            </div>
          </div>
        </div>

        <div class="migrate-arrow">↓</div>

        <div class="migrate-target">
          <span class="migrate-label">{m.admin_selectTargetUser()}</span>
          <select bind:value={selectedTargetUserId} class="target-select">
            <option value="">{m.admin_selectUser()}</option>
            {#each registeredUsersList as regUser (regUser.userId)}
              <option value={regUser.userId}>
                {regUser.playerName} ({regUser.email})
              </option>
            {/each}
          </select>
        </div>

        {#if migrationError}
          <p class="migration-error">{migrationError}</p>
        {/if}

        <div class="migrate-actions">
          <button class="cancel-btn" onclick={cancelMigrate} disabled={isMigrating}>
            {m.common_cancel()}
          </button>
          <button
            class="confirm-btn migrate-confirm-btn"
            onclick={confirmMigrate}
            disabled={isMigrating || !selectedTargetUserId}
          >
            {isMigrating ? m.admin_migrating() : m.admin_confirmMigration()}
          </button>
        </div>
      </div>
    </div>
  {/if}
</SuperAdminGuard>

<style>
  .users-container {
    padding: 1.5rem 2rem;
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) {
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

  .users-container:is([data-theme='dark'], [data-theme='violet']) .page-header {
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

  .users-container:is([data-theme='dark'], [data-theme='violet']) .back-btn {
    background: #1e293b;
    color: #cbd5e1;
    border-color: #334155;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .back-btn:hover {
    background: #334155;
    color: var(--primary);
    border-color: var(--primary);
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
    background: #f3f4f6;
    color: #555;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    transition: all 0.3s;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .count-badge {
    background: #0f1419;
    color: #8b9bb3;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
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

  .users-container:is([data-theme='dark'], [data-theme='violet']) .search-input {
    background: #1a2332;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  .filter-controls {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .filter-tab {
    padding: 0.4rem 0.75rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    color: #555;
    font-weight: 500;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .filter-tab {
    background: #1a2332;
    border-color: #2d3748;
    color: #cbd5e1;
  }

  .filter-tab:hover:not(.active) {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    border-color: var(--primary);
    color: var(--primary);
  }

  .filter-tab.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
    font-weight: 600;
  }

  .filter-select {
    padding: 0.4rem 0.75rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
    color: #555;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .filter-select {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .filter-select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  /* Results info */
  .results-info {
    font-size: 0.75rem;
    color: #999;
    margin-bottom: 0.5rem;
    transition: color 0.3s;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .results-info {
    color: #6b7a94;
  }

  /* Table */
  .table-container {
    overflow-x: auto;
    overflow-y: auto;
    max-height: calc(100vh - 180px);
    background: white;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: all 0.3s;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .table-container {
    background: #1a2332;
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .users-table thead {
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    /* position: sticky removed */
    z-index: 1;
    transition: all 0.3s;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .users-table thead {
    background: #0f1419;
    border-color: #2d3748;
  }

  .users-table th {
    padding: 0.6rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #666;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: color 0.3s;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .users-table th {
    color: #8b9bb3;
  }

  .user-row {
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .user-row {
    border-color: #2d3748;
  }

  .user-row:hover {
    background: #f9fafb;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .user-row:hover {
    background: #0f1419;
  }

  .users-table td {
    padding: 0.6rem 0.75rem;
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .users-table td {
    color: #e1e8ed;
  }

  /* Name cell */
  .name-cell {
    max-width: 250px;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
  }

  .user-avatar-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .user-details {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .user-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-email {
    font-size: 0.7rem;
    color: #999;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .user-email {
    color: #6b7a94;
  }

  /* Role cell */
  .role-badge {
    padding: 0.25rem 0.6rem;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .role-badge.super {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
  }

  .role-badge.admin {
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    color: white;
  }

  .role-badge.user {
    background: #e5e7eb;
    color: #6b7280;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .role-badge.user {
    background: #374151;
    color: #9ca3af;
  }

  .tournaments-created {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 0.4rem;
    background: #f3f4f6;
    color: #374151;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 10px;
    margin-left: 0.35rem;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .tournaments-created {
    background: #0f1419;
    color: #8b9bb3;
  }

  /* Quota cell */
  .quota-unlimited {
    color: var(--primary);
    font-weight: 700;
  }

  .quota-value {
    font-size: 0.8rem;
    color: #666;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .quota-value {
    color: #8b9bb3;
  }

  .quota-na {
    color: #ccc;
  }

  /* Created cell */
  .created-cell {
    color: #999;
    font-size: 0.8rem;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .created-cell {
    color: #6b7a94;
  }

  /* Actions cell */
  .actions-cell {
    display: flex;
    gap: 0.25rem;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    transition: all 0.2s;
    background: transparent;
  }

  .action-btn:hover {
    background: #f3f4f6;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .action-btn:hover {
    background: #2d3748;
  }

  .action-btn.delete-btn:hover {
    background: #fee2e2;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .action-btn.delete-btn:hover {
    background: #4d1f24;
  }

  .load-more-hint,
  .end-of-list {
    text-align: center;
    padding: 1rem;
    color: #999;
    font-size: 0.85rem;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .load-more-hint,
  .users-container:is([data-theme='dark'], [data-theme='violet']) .end-of-list {
    color: #6b7a94;
  }

  .end-of-list {
    border-top: 1px dashed #ddd;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .end-of-list {
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

  .users-container:is([data-theme='dark'], [data-theme='violet']) .empty-state h3 {
    color: #e1e8ed;
  }

  .empty-state p {
    color: #666;
    margin: 0;
    transition: color 0.3s;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .empty-state p {
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
    max-width: 320px;
    width: 90%;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  .delete-modal-wide {
    max-width: 450px;
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

  .user-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #f9fafb;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .user-preview {
    background: #0f1419;
  }

  .user-preview strong {
    color: #1a1a1a;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .user-preview strong {
    color: #e1e8ed;
  }

  .preview-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }

  .preview-avatar-placeholder {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .delete-warning {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0 0 1rem 0;
  }

  /* Dependencies section */
  .dependencies-section {
    margin: 1rem 0;
    text-align: left;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .dependencies-section {
    border-color: #374151;
  }

  .dependencies-title {
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
    color: #374151;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .dependencies-title {
    background: #1f2937;
    border-bottom-color: #374151;
    color: #9ca3af;
  }

  .dependencies-content {
    max-height: 200px;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .dependencies-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    color: #666;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .dependencies-loading {
    color: #9ca3af;
  }

  .loading-spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid #e5e7eb;
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .loading-spinner-small {
    border-color: #374151;
    border-top-color: var(--primary);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .dependency-group {
    margin-bottom: 0.75rem;
  }

  .dependency-group:last-child {
    margin-bottom: 0;
  }

  .dependency-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.35rem;
  }

  .dependency-header.owner {
    color: #dc2626;
  }

  .dependency-header.collaborator {
    color: #f59e0b;
  }

  .dependency-header.participant {
    color: #6b7280;
  }

  .dependency-icon {
    font-size: 0.9rem;
  }

  .dependency-note {
    font-size: 0.7rem;
    color: #6b7280;
    margin: 0 0 0.35rem 1.5rem;
    font-style: italic;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .dependency-note {
    color: #9ca3af;
  }

  .dependency-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .dependency-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0.5rem;
    background: #f9fafb;
    border-radius: 4px;
    margin-bottom: 0.25rem;
    font-size: 0.8rem;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .dependency-item {
    background: #0f1419;
  }

  .tournament-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
    color: #1a1a1a;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .tournament-name {
    color: #e1e8ed;
  }

  .tournament-status,
  .venue-city {
    font-size: 0.65rem;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .tournament-status.status-draft {
    background: #e5e7eb;
    color: #374151;
  }

  .tournament-status.status-group_stage,
  .tournament-status.status-final_stage {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .tournament-status.status-completed {
    background: #d1fae5;
    color: #059669;
  }

  .tournament-status.status-cancelled {
    background: #fee2e2;
    color: #dc2626;
  }

  .venue-city {
    background: #e5e7eb;
    color: #374151;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .venue-city {
    background: #374151;
    color: #e5e7eb;
  }

  .no-dependencies {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    color: var(--primary);
    font-size: 0.85rem;
  }

  .block-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #fee2e2;
    border-radius: 6px;
    font-size: 0.8rem;
    color: #dc2626;
    margin-top: 0.75rem;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .block-message {
    background: #4d1f24;
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

  /* Migration button */
  .action-btn.migrate-btn:hover {
    background: #dbeafe;
  }

  .users-container:is([data-theme='dark'], [data-theme='violet']) .action-btn.migrate-btn:hover {
    background: #1e3a5f;
  }

  /* Migration modal */
  .migrate-overlay {
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

  .migrate-modal {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  .migrate-overlay:is([data-theme='dark'], [data-theme='violet']) .migrate-modal {
    background: #1a2332;
    color: #e1e8ed;
  }

  .migrate-modal h3 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
    text-align: center;
    color: var(--primary);
  }

  .migrate-source,
  .migrate-target {
    margin-bottom: 0.75rem;
  }

  .migrate-label {
    display: block;
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .migrate-overlay:is([data-theme='dark'], [data-theme='violet']) .migrate-label {
    color: #8b9bb3;
  }

  .migrate-source .user-preview {
    justify-content: flex-start;
  }

  .user-preview-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .user-preview-info strong {
    color: #1a1a1a;
  }

  .migrate-overlay:is([data-theme='dark'], [data-theme='violet']) .user-preview-info strong {
    color: #e1e8ed;
  }

  .user-preview-info small {
    font-size: 0.75rem;
    color: #666;
  }

  .migrate-overlay:is([data-theme='dark'], [data-theme='violet']) .user-preview-info small {
    color: #8b9bb3;
  }

  .migrate-arrow {
    text-align: center;
    font-size: 1.5rem;
    color: var(--primary);
    margin: 0.5rem 0;
  }

  .target-select {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
    background: white;
    cursor: pointer;
  }

  .migrate-overlay:is([data-theme='dark'], [data-theme='violet']) .target-select {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .target-select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  .migration-error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0.75rem 0;
    text-align: center;
  }

  .migrate-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 1rem;
  }

  .migrate-confirm-btn {
    background: var(--primary);
  }

  .migrate-confirm-btn:hover:not(:disabled) {
    box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent);
  }

  .migrate-overlay:is([data-theme='dark'], [data-theme='violet']) .user-preview {
    background: #0f1419;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .users-container {
      padding: 1rem;
    }

    .page-header {
      margin: -1rem -1rem 1rem -1rem;
      padding: 0.75rem 1rem;
    }

    .controls-section {
      flex-direction: column;
      align-items: stretch;
    }

    .search-box {
      max-width: none;
    }

    .filter-controls {
      justify-content: center;
    }

    .hide-mobile {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .hide-small {
      display: none;
    }

    .users-table th,
    .users-table td {
      padding: 0.5rem;
    }
  }
</style>
