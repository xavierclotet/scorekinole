<script lang="ts">
  import { onMount } from 'svelte';
  import SuperAdminGuard from '$lib/components/SuperAdminGuard.svelte';
  import UserEditModal from '$lib/components/UserEditModal.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { t } from '$lib/stores/language';
  import { goto } from '$app/navigation';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { getUsersPaginated, deleteUser, type AdminUserInfo } from '$lib/firebase/admin';
  import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

  let users: AdminUserInfo[] = [];
  let isLoading = true;
  let isLoadingMore = false;
  let errorMessage = '';
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

  // For search and filter: filter locally from loaded users
  $: isSearching = searchQuery.trim().length > 0;
  $: isFiltering = filterRole !== 'all';
  $: filteredUsers = users.filter((user) => {
    // Role filter
    if (filterRole === 'admin' && !user.isAdmin) return false;
    if (filterRole === 'user' && user.isAdmin) return false;

    // Search filter
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

  onMount(async () => {
    await loadInitialUsers();
  });

  async function loadInitialUsers() {
    isLoading = true;
    errorMessage = '';
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
      errorMessage = 'Failed to load users';
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

    // Load more when 100px from bottom
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
    if (!timestamp) return 'N/A';

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString();
    } catch {
      return 'N/A';
    }
  }
</script>

<SuperAdminGuard>
  <div class="users-container" data-theme={$adminTheme}>
    <header class="users-header">
      <button class="back-button" on:click={() => goto('/admin')}>
        ← {$t('backToAdmin')}
      </button>
      <h1>👥 {$t('userManagement')}</h1>
      <div class="theme-toggle-wrapper">
        <ThemeToggle />
      </div>
    </header>

    <div class="controls">
      <div class="search-bar">
        <input
          type="text"
          placeholder={$t('searchUsers')}
          bind:value={searchQuery}
        />
      </div>
      <div class="filter-buttons">
        <button
          class="filter-btn"
          class:active={filterRole === 'all'}
          on:click={() => (filterRole = 'all')}
        >
          {$t('filterAll')}
        </button>
        <button
          class="filter-btn"
          class:active={filterRole === 'admin'}
          on:click={() => (filterRole = 'admin')}
        >
          Admin
        </button>
        <button
          class="filter-btn"
          class:active={filterRole === 'user'}
          on:click={() => (filterRole = 'user')}
        >
          User
        </button>
      </div>
      <span class="user-count">
        {filteredUsers.length} de {displayTotal} {$t('users')}
      </span>
    </div>

    {#if isLoading}
      <div class="loading">
        <div class="spinner"></div>
        <p>{$t('loading')}</p>
      </div>
    {:else if errorMessage}
      <div class="error-box">
        <p>{errorMessage}</p>
        <button on:click={loadInitialUsers}>{$t('retry')}</button>
      </div>
    {:else if filteredUsers.length === 0}
      <div class="empty-state">
        <p>{$t('noUsersFound')}</p>
        {#if isSearching}
          <p class="search-tip">La búsqueda solo incluye usuarios ya cargados. Haz scroll para cargar más.</p>
        {/if}
      </div>
    {:else}
      <div class="table-container" on:scroll={handleScroll}>
        <table class="users-table">
          <thead>
            <tr>
              <th class="hide-small">Foto</th>
              <th>{$t('playerName')}</th>
              <th class="hide-small">{$t('email')}</th>
              <th>{$t('ranking')}</th>
              <th class="hide-small">{$t('tournaments')}</th>
              <th class="hide-small">{$t('createdAt')}</th>
              <th>Admin</th>
              <th>{$t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredUsers as user (user.userId)}
              <tr>
                <td class="photo-cell hide-small">
                  {#if user.photoURL}
                    <img src={user.photoURL} alt={user.playerName} class="user-avatar" />
                  {:else}
                    <div class="user-avatar-placeholder">
                      {user.playerName?.charAt(0).toUpperCase() || '?'}
                    </div>
                  {/if}
                </td>
                <td class="name-cell" title={user.userId}>{user.playerName || 'N/A'}</td>
                <td class="email-cell hide-small">{user.email || 'N/A'}</td>
                <td class="ranking-cell">
                  <span class="ranking-value">{user.ranking ?? 0}</span>
                </td>
                <td class="tournaments-cell hide-small">
                  <span class="tournament-count">{user.tournaments?.length ?? 0}</span>
                </td>
                <td class="date-cell hide-small">{formatDate(user.createdAt)}</td>
                <td class="admin-cell">
                  {#if user.isAdmin}
                    <span class="admin-badge">✓ Admin</span>
                  {:else}
                    <span class="user-badge">User</span>
                  {/if}
                </td>
                <td class="actions-cell">
                  <button class="edit-btn" on:click={() => editUser(user)}>
                    ✏️
                  </button>
                  <button class="delete-btn" on:click={() => showDeleteConfirm(user)}>
                    🗑️
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if isLoadingMore}
          <div class="loading-more">
            <div class="spinner small"></div>
            <span>Cargando más...</span>
          </div>
        {:else if hasMore && !isSearching && !isFiltering}
          <div class="load-more-hint">
            Scroll para cargar más usuarios
          </div>
        {:else if !hasMore && !isSearching && !isFiltering}
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
    <div class="delete-modal-overlay" data-theme={$adminTheme} on:click={cancelDelete}>
      <div class="delete-modal" on:click|stopPropagation>
        <h3>{$t('deleteUser')}</h3>
        <p>{$t('deleteUserConfirm')} <strong>{userToDelete.playerName || userToDelete.email || '?'}</strong>?</p>
        <p class="delete-warning">{$t('cannotBeUndone')}</p>
        <div class="delete-modal-actions">
          <button class="cancel-btn" on:click={cancelDelete} disabled={isDeleting}>
            {$t('cancel')}
          </button>
          <button class="confirm-delete-btn" on:click={confirmDelete} disabled={isDeleting}>
            {isDeleting ? $t('deleting') : $t('delete')}
          </button>
        </div>
      </div>
    </div>
  {/if}
</SuperAdminGuard>

<style>
  .users-container {
    width: 95%;
    max-width: 100%;
    margin: 0 auto;
    padding: 1.5rem;
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .users-container[data-theme='dark'] {
    background: #0f1419;
  }

  .users-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    position: relative;
  }

  .users-header h1 {
    font-size: 1.75rem;
    margin: 0;
    flex: 1;
    color: #1a1a1a;
    font-weight: 600;
    transition: color 0.3s;
  }

  .users-container[data-theme='dark'] .users-header h1 {
    color: #e1e8ed;
  }

  .theme-toggle-wrapper {
    margin-left: auto;
  }

  .users-container[data-theme='dark'] .theme-toggle-wrapper {
    --toggle-bg: rgba(255, 255, 255, 0.05);
    --toggle-color: #fbbf24;
  }

  .users-container[data-theme='light'] .theme-toggle-wrapper {
    --toggle-bg: white;
    --toggle-color: #3730a3;
  }

  .back-button {
    padding: 0.6rem 1.2rem;
    background: #ffffff;
    color: #333;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
    font-weight: 500;
  }

  .users-container[data-theme='dark'] .back-button {
    background: #1a2332;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  .back-button:hover {
    background: #f5f5f5;
    border-color: #999;
  }

  .users-container[data-theme='dark'] .back-button:hover {
    background: #2d3748;
    border-color: #4a5568;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .search-bar {
    flex: 1;
  }

  .search-bar input {
    width: 100%;
    padding: 0.7rem 1rem;
    font-size: 0.95rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    transition: all 0.2s;
    background: white;
    color: #333;
  }

  .users-container[data-theme='dark'] .search-bar input {
    background: #1a2332;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .search-bar input:focus {
    outline: none;
    border-color: #4CAF50;
    box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
  }

  .users-container[data-theme='dark'] .search-bar input::placeholder {
    color: #6b7a94;
  }

  .user-count {
    font-weight: 500;
    color: #666;
    white-space: nowrap;
    font-size: 0.9rem;
    padding: 0.5rem 1rem;
    background: white;
    border-radius: 6px;
    border: 1px solid #ddd;
    transition: all 0.3s;
  }

  .users-container[data-theme='dark'] .user-count {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .filter-buttons {
    display: flex;
    gap: 0.25rem;
    background: #f0f0f0;
    padding: 0.25rem;
    border-radius: 6px;
  }

  .users-container[data-theme='dark'] .filter-buttons {
    background: #1a2332;
  }

  .filter-btn {
    padding: 0.4rem 0.75rem;
    border: none;
    background: transparent;
    color: #666;
    font-size: 0.8rem;
    font-weight: 500;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-btn:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  .filter-btn.active {
    background: white;
    color: #333;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .users-container[data-theme='dark'] .filter-btn {
    color: #8b9bb3;
  }

  .users-container[data-theme='dark'] .filter-btn:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .users-container[data-theme='dark'] .filter-btn.active {
    background: #2d3748;
    color: #e1e8ed;
  }

  .search-hint {
    font-size: 0.75rem;
    color: #888;
    font-weight: 400;
    margin-left: 0.5rem;
  }

  .users-container[data-theme='dark'] .search-hint {
    color: #6b7a94;
  }

  .search-tip {
    font-size: 0.85rem;
    color: #666;
    margin-top: 0.5rem;
  }

  .users-container[data-theme='dark'] .search-tip {
    color: #8b9bb3;
  }

  .loading,
  .error-box,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
    background: white;
    border-radius: 8px;
    transition: background-color 0.3s, color 0.3s;
  }

  .users-container[data-theme='dark'] .loading,
  .users-container[data-theme='dark'] .empty-state {
    background: #1a2332;
    color: #e1e8ed;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #f3f3f3;
    border-top-color: #4CAF50;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 1rem;
  }

  .spinner.small {
    width: 24px;
    height: 24px;
    border-width: 2px;
    margin-bottom: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-box {
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
  }

  .error-box button {
    margin-top: 1rem;
    padding: 0.5rem 1.5rem;
    background: #856404;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
  }

  .table-container {
    background: white;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
    transition: all 0.3s;
    max-height: calc(100vh - 220px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .users-container[data-theme='dark'] .table-container {
    background: #1a2332;
    border-color: #2d3748;
  }

  .users-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  .users-table thead {
    background: linear-gradient(to bottom, #f8f9fa, #e9ecef);
    transition: background 0.3s;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .users-container[data-theme='dark'] .users-table thead {
    background: linear-gradient(to bottom, #1f2937, #111827);
  }

  .users-table th {
    padding: 1rem 1.25rem;
    text-align: left;
    font-weight: 600;
    color: #2c3e50;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #dee2e6;
    transition: all 0.3s;
  }

  .users-container[data-theme='dark'] .users-table th {
    color: #8b9bb3;
    border-bottom-color: #374151;
  }

  .users-table tbody tr {
    transition: all 0.15s ease;
  }

  .users-table tbody tr:hover {
    background: #f8f9fa;
    transform: translateX(2px);
  }

  .users-container[data-theme='dark'] .users-table tbody tr:hover {
    background: #212d3f;
  }

  .users-table tbody tr:not(:last-child) {
    border-bottom: 1px solid #f0f0f0;
  }

  .users-container[data-theme='dark'] .users-table tbody tr:not(:last-child) {
    border-bottom-color: #2d3748;
  }

  .users-table td {
    padding: 1rem 1.25rem;
    vertical-align: middle;
    color: #333;
    font-size: 0.9rem;
    transition: color 0.3s;
  }

  .users-container[data-theme='dark'] .users-table td {
    color: #e1e8ed;
  }

  .photo-cell {
    width: 70px;
    padding-left: 1.5rem;
  }

  .user-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #f0f0f0;
  }

  .user-avatar-placeholder {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    font-weight: 600;
    border: 2px solid #f0f0f0;
  }

  .email-cell {
    color: #555;
    font-size: 0.88rem;
    transition: color 0.3s;
  }

  .users-container[data-theme='dark'] .email-cell {
    color: #8b9bb3;
  }

  .name-cell {
    font-weight: 600;
    color: #2c3e50;
    font-size: 0.92rem;
    transition: color 0.3s;
  }

  .users-container[data-theme='dark'] .name-cell {
    color: #e1e8ed;
  }

  .ranking-cell {
    text-align: left;
    padding: 1rem 1.25rem;
  }

  .ranking-value {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    padding: 0.3rem 0.65rem;
    background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
    color: #333;
    font-size: 0.8rem;
    font-weight: 700;
    border-radius: 16px;
    box-shadow: 0 2px 4px rgba(253, 160, 133, 0.2);
  }

  .tournaments-cell {
    text-align: left;
    padding: 1rem 1.25rem;
  }

  .tournament-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    padding: 0.3rem 0.65rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 0.8rem;
    font-weight: 700;
    border-radius: 16px;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.2);
  }

  .date-cell {
    color: #888;
    font-size: 0.85rem;
    transition: color 0.3s;
  }

  .users-container[data-theme='dark'] .date-cell {
    color: #6b7a94;
  }

  .admin-cell {
    text-align: left;
    padding: 1rem 1.25rem;
  }

  .admin-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.85rem;
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    color: white;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 20px;
    letter-spacing: 0.3px;
    box-shadow: 0 2px 4px rgba(17, 153, 142, 0.2);
  }

  .user-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.85rem;
    background: #e9ecef;
    color: #6c757d;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 20px;
    letter-spacing: 0.3px;
  }

  .actions-cell {
    text-align: left;
    padding: 1rem 0.75rem;
    display: flex;
    gap: 0.5rem;
    justify-content: flex-start;
  }

  .edit-btn {
    padding: 0.5rem 0.75rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.2);
  }

  .edit-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
  }

  .edit-btn:active {
    transform: translateY(0);
  }

  .delete-btn {
    padding: 0.5rem 0.75rem;
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(238, 90, 90, 0.2);
  }

  .delete-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(238, 90, 90, 0.3);
  }

  .delete-btn:active {
    transform: translateY(0);
  }

  /* Infinite scroll indicators */
  .loading-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.5rem;
    color: #666;
    font-size: 0.9rem;
  }

  .users-container[data-theme='dark'] .loading-more {
    color: #8b9bb3;
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

  /* Responsive */
  @media (max-width: 1200px) {
    .users-table th,
    .users-table td {
      padding: 0.85rem 1rem;
      font-size: 0.85rem;
    }
  }

  @media (max-width: 900px) {
    .hide-small {
      display: none !important;
    }

    .users-table {
      min-width: auto;
    }
  }

  @media (max-width: 768px) {
    .users-container {
      padding: 1rem;
      width: 98%;
    }

    .users-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .users-header h1 {
      font-size: 1.4rem;
    }

    .controls {
      flex-direction: column;
      align-items: stretch;
      width: 100%;
    }

    .table-container {
      max-height: calc(100vh - 280px);
      overflow-x: auto;
    }

    .users-table th,
    .users-table td {
      padding: 0.7rem 0.8rem;
      font-size: 0.8rem;
    }

    .edit-btn {
      padding: 0.45rem 1rem;
      font-size: 0.8rem;
    }

    .actions-cell {
      padding-left: 0.8rem;
    }
  }

  /* Delete confirmation modal */
  .delete-modal-overlay {
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

  .delete-modal-overlay[data-theme='dark'] .delete-modal {
    background: #1a2332;
    color: #e1e8ed;
  }

  .delete-modal h3 {
    margin: 0 0 0.75rem 0;
    font-size: 1.1rem;
    color: #333;
  }

  .delete-modal-overlay[data-theme='dark'] .delete-modal h3 {
    color: #e1e8ed;
  }

  .delete-modal p {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: #555;
  }

  .delete-modal-overlay[data-theme='dark'] .delete-modal p {
    color: #8b9bb3;
  }

  .delete-warning {
    color: #e53e3e !important;
    font-size: 0.8rem !important;
    margin-bottom: 1rem !important;
  }

  .delete-modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 1rem;
  }

  .cancel-btn {
    padding: 0.5rem 1.25rem;
    background: #e2e8f0;
    color: #4a5568;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-btn:hover:not(:disabled) {
    background: #cbd5e0;
  }

  .delete-modal-overlay[data-theme='dark'] .cancel-btn {
    background: #2d3748;
    color: #e1e8ed;
  }

  .delete-modal-overlay[data-theme='dark'] .cancel-btn:hover:not(:disabled) {
    background: #4a5568;
  }

  .confirm-delete-btn {
    padding: 0.5rem 1.25rem;
    background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .confirm-delete-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(229, 62, 62, 0.3);
  }

  .confirm-delete-btn:disabled,
  .cancel-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
