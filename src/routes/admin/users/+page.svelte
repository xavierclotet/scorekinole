<script lang="ts">
  import { onMount } from 'svelte';
  import SuperAdminGuard from '$lib/components/SuperAdminGuard.svelte';
  import UserEditModal from '$lib/components/UserEditModal.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import { t } from '$lib/stores/language';
  import { goto } from '$app/navigation';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { getUsersPaginated, deleteUser, type AdminUserInfo } from '$lib/firebase/admin';
  import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

  let users: AdminUserInfo[] = [];
  let isLoading = true;
  let isLoadingMore = false;
  let selectedUser: AdminUserInfo | null = null;
  let userToDelete: AdminUserInfo | null = null;
  let isDeleting = false;
  let searchQuery = '';
  let filterRole: 'all' | 'admin' | 'user' = 'all';
  const pageSize = 15;

  // Infinite scroll state
  let totalCount = 0;
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let hasMore = true;

  $: isSearching = searchQuery.trim().length > 0;
  $: isFiltering = filterRole !== 'all';
  $: filteredUsers = users.filter((user) => {
    if (filterRole === 'admin' && !user.isAdmin) return false;
    if (filterRole === 'user' && user.isAdmin) return false;

    if (isSearching) {
      const q = searchQuery.toLowerCase();
      return (
        user.playerName?.toLowerCase().includes(q) ||
        user.email?.toLowerCase().includes(q) ||
        user.userId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  $: displayTotal = isSearching || isFiltering ? filteredUsers.length : totalCount;
  $: adminCount = users.filter(u => u.isAdmin).length;

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
      users = [...users, ...result.users];
    } catch (error) {
      console.error('Error loading more users:', error);
    } finally {
      isLoadingMore = false;
    }
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
    await loadInitialUsers();
  }

  function showDeleteConfirm(user: AdminUserInfo) {
    userToDelete = user;
  }

  function cancelDelete() {
    userToDelete = null;
  }

  async function confirmDelete() {
    if (!userToDelete) return;

    isDeleting = true;
    const success = await deleteUser(userToDelete.userId);

    if (success) {
      users = users.filter((u) => u.userId !== userToDelete!.userId);
      totalCount = Math.max(0, totalCount - 1);
    }

    isDeleting = false;
    userToDelete = null;
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
</script>

<SuperAdminGuard>
  <div class="users-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" on:click={() => goto('/admin')}>←</button>
        <div class="header-main">
          <div class="title-section">
            <h1>{$t('userManagement')}</h1>
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
          placeholder={$t('searchUsers')}
          class="search-input"
        />
      </div>

      <div class="filter-tabs">
        <button
          class="filter-tab"
          class:active={filterRole === 'all'}
          on:click={() => (filterRole = 'all')}
        >
          {$t('all')} ({users.length})
        </button>
        <button
          class="filter-tab"
          class:active={filterRole === 'admin'}
          on:click={() => (filterRole = 'admin')}
        >
          Admins ({adminCount})
        </button>
        <button
          class="filter-tab"
          class:active={filterRole === 'user'}
          on:click={() => (filterRole = 'user')}
        >
          Users ({users.length - adminCount})
        </button>
      </div>
    </div>

    {#if isLoading}
      <LoadingSpinner message={$t('loading')} />
    {:else if filteredUsers.length === 0}
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3>{$t('noUsersFound')}</h3>
        <p>{searchQuery || filterRole !== 'all' ? 'No hay usuarios que coincidan con los filtros' : 'No hay usuarios registrados'}</p>
      </div>
    {:else}
      <div class="results-info">
        {$t('showingOf').replace('{showing}', String(filteredUsers.length)).replace('{total}', String(displayTotal))}
      </div>

      <div class="table-container" on:scroll={handleScroll}>
        <table class="users-table">
          <thead>
            <tr>
              <th class="name-col">{$t('playerName')}</th>
              <th class="email-col hide-mobile">{$t('email')}</th>
              <th class="role-col">{$t('adminRole')}</th>
              <th class="ranking-col">{$t('ranking')}</th>
              <th class="tournaments-col hide-small">{$t('tournaments')}</th>
              <th class="quota-col hide-small">Cuota</th>
              <th class="created-col hide-small">{$t('createdAt')}</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredUsers as user (user.userId)}
              <tr class="user-row" on:click={() => editUser(user)}>
                <td class="name-cell">
                  <div class="user-info">
                    {#if user.photoURL}
                      <img src={user.photoURL} alt={user.playerName} class="user-avatar" />
                    {:else}
                      <div class="user-avatar-placeholder">
                        {user.playerName?.charAt(0).toUpperCase() || '?'}
                      </div>
                    {/if}
                    <div class="user-details">
                      <strong class="user-name">{user.playerName || 'Sin nombre'}</strong>
                      <small class="user-id">{user.userId.substring(0, 8)}...</small>
                    </div>
                  </div>
                </td>
                <td class="email-cell hide-mobile">
                  {user.email || '-'}
                </td>
                <td class="role-cell">
                  {#if user.isSuperAdmin}
                    <span class="role-badge super">Super</span>
                  {:else if user.isAdmin}
                    <span class="role-badge admin">Admin</span>
                  {:else}
                    <span class="role-badge user">User</span>
                  {/if}
                </td>
                <td class="ranking-cell">
                  <span class="ranking-value">{user.ranking ?? 0} <small>pts</small></span>
                </td>
                <td class="tournaments-cell hide-small">
                  🏆 {user.tournaments?.length ?? 0}
                </td>
                <td class="quota-cell hide-small">
                  {#if user.isSuperAdmin}
                    <span class="quota-unlimited">∞</span>
                  {:else if user.isAdmin}
                    <span class="quota-value">{user.maxTournamentsPerYear ?? 0}/año</span>
                  {:else}
                    <span class="quota-na">-</span>
                  {/if}
                </td>
                <td class="created-cell hide-small">
                  {formatDate(user.createdAt)}
                </td>
                <td class="actions-cell">
                  <button
                    class="action-btn edit-btn"
                    on:click|stopPropagation={() => editUser(user)}
                    title={$t('editUser')}
                  >
                    ✏️
                  </button>
                  <button
                    class="action-btn delete-btn"
                    on:click|stopPropagation={() => showDeleteConfirm(user)}
                    title={$t('delete')}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if isLoadingMore}
          <LoadingSpinner size="small" message={$t('loadingMore')} inline={true} />
        {:else if hasMore && !isSearching && !isFiltering}
          <div class="load-more-hint">
            {$t('scrollToLoadMore')}
          </div>
        {:else if !hasMore && filteredUsers.length > 0}
          <div class="end-of-list">
            Fin de la lista
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if selectedUser}
    <UserEditModal
      user={selectedUser}
      onClose={closeEditModal}
      on:userUpdated={handleUserUpdated}
    />
  {/if}

  {#if userToDelete}
    <div class="delete-overlay" data-theme={$adminTheme} on:click={cancelDelete}>
      <div class="delete-modal" on:click|stopPropagation>
        <h3>{$t('deleteUser')}</h3>
        <div class="user-preview">
          {#if userToDelete.photoURL}
            <img src={userToDelete.photoURL} alt="" class="preview-avatar" />
          {:else}
            <div class="preview-avatar-placeholder">
              {userToDelete.playerName?.charAt(0).toUpperCase() || '?'}
            </div>
          {/if}
          <strong>{userToDelete.playerName || userToDelete.email || '?'}</strong>
        </div>
        <p class="delete-warning">{$t('cannotBeUndone')}</p>
        <div class="delete-actions">
          <button class="cancel-btn" on:click={cancelDelete} disabled={isDeleting}>
            {$t('cancel')}
          </button>
          <button class="confirm-btn" on:click={confirmDelete} disabled={isDeleting}>
            {isDeleting ? $t('deleting') : $t('delete')}
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

  .users-container[data-theme='dark'] {
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

  .users-container[data-theme='dark'] .page-header {
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

  .users-container[data-theme='dark'] .back-btn {
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

  .users-container[data-theme='dark'] .title-section h1 {
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

  .users-container[data-theme='dark'] .count-badge {
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

  .users-container[data-theme='dark'] .search-input {
    background: #1a2332;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .search-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
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

  .users-container[data-theme='dark'] .filter-tab {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .filter-tab:hover {
    background: #f5f5f5;
    border-color: #667eea;
  }

  .users-container[data-theme='dark'] .filter-tab:hover {
    background: #2d3748;
  }

  .filter-tab.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

  .users-container[data-theme='dark'] .results-info {
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

  .users-container[data-theme='dark'] .table-container {
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
    position: sticky;
    top: 0;
    z-index: 1;
    transition: all 0.3s;
  }

  .users-container[data-theme='dark'] .users-table thead {
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

  .users-container[data-theme='dark'] .users-table th {
    color: #8b9bb3;
  }

  .user-row {
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .users-container[data-theme='dark'] .user-row {
    border-color: #2d3748;
  }

  .user-row:hover {
    background: #f9fafb;
  }

  .users-container[data-theme='dark'] .user-row:hover {
    background: #0f1419;
  }

  .users-table td {
    padding: 0.6rem 0.75rem;
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .users-container[data-theme='dark'] .users-table td {
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

  .user-id {
    font-size: 0.7rem;
    color: #999;
    font-family: monospace;
  }

  .users-container[data-theme='dark'] .user-id {
    color: #6b7a94;
  }

  /* Email cell */
  .email-cell {
    color: #666;
    font-size: 0.8rem;
  }

  .users-container[data-theme='dark'] .email-cell {
    color: #8b9bb3;
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

  .users-container[data-theme='dark'] .role-badge.user {
    background: #374151;
    color: #9ca3af;
  }

  /* Ranking cell */
  .ranking-value {
    display: inline-flex;
    align-items: baseline;
    gap: 0.2rem;
    padding: 0.2rem 0.5rem;
    background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
    color: #333;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 10px;
  }

  .ranking-value small {
    font-size: 0.6rem;
    font-weight: 500;
    opacity: 0.8;
  }

  /* Quota cell */
  .quota-unlimited {
    color: #10b981;
    font-weight: 700;
  }

  .quota-value {
    font-size: 0.8rem;
    color: #666;
  }

  .users-container[data-theme='dark'] .quota-value {
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

  .users-container[data-theme='dark'] .created-cell {
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

  .users-container[data-theme='dark'] .action-btn:hover {
    background: #2d3748;
  }

  .action-btn.delete-btn:hover {
    background: #fee2e2;
  }

  .users-container[data-theme='dark'] .action-btn.delete-btn:hover {
    background: #4d1f24;
  }

  .load-more-hint,
  .end-of-list {
    text-align: center;
    padding: 1rem;
    color: #999;
    font-size: 0.85rem;
  }

  .users-container[data-theme='dark'] .load-more-hint,
  .users-container[data-theme='dark'] .end-of-list {
    color: #6b7a94;
  }

  .end-of-list {
    border-top: 1px dashed #ddd;
  }

  .users-container[data-theme='dark'] .end-of-list {
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

  .users-container[data-theme='dark'] .empty-state h3 {
    color: #e1e8ed;
  }

  .empty-state p {
    color: #666;
    margin: 0;
    transition: color 0.3s;
  }

  .users-container[data-theme='dark'] .empty-state p {
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

  .delete-overlay[data-theme='dark'] .delete-modal {
    background: #1a2332;
    color: #e1e8ed;
  }

  .delete-modal h3 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
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

  .delete-overlay[data-theme='dark'] .user-preview {
    background: #0f1419;
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

  .delete-overlay[data-theme='dark'] .cancel-btn {
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

    .filter-tabs {
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
