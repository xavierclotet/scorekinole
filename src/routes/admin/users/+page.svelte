<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import UserEditModal from '$lib/components/UserEditModal.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { t } from '$lib/stores/language';
  import { goto } from '$app/navigation';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { getAllUsers, getUserMatchCount, type AdminUserInfo } from '$lib/firebase/admin';

  let users: AdminUserInfo[] = [];
  let isLoading = true;
  let errorMessage = '';
  let selectedUser: AdminUserInfo | null = null;
  let searchQuery = '';

  // Filtered users based on search
  $: filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.playerName?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.userId.toLowerCase().includes(query)
    );
  });

  onMount(async () => {
    await loadUsers();
  });

  async function loadUsers() {
    isLoading = true;
    errorMessage = '';

    try {
      users = await getAllUsers();

      // Load match count for each user in parallel
      await Promise.all(
        users.map(async (user) => {
          user.matchCount = await getUserMatchCount(user.userId);
        })
      );

      // Trigger reactivity
      users = users;
    } catch (error) {
      console.error('Error loading users:', error);
      errorMessage = 'Failed to load users';
    } finally {
      isLoading = false;
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
    await loadUsers();
  }

  function formatDate(timestamp: any): string {
    if (!timestamp) return 'N/A';

    try {
      // Handle Firestore Timestamp
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString();
    } catch {
      return 'N/A';
    }
  }

  function truncateId(id: string): string {
    return id.length > 12 ? id.substring(0, 12) + '...' : id;
  }
</script>

<AdminGuard>
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
      <span class="user-count">
        {filteredUsers.length} {$t('users')}
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
        <button on:click={loadUsers}>{$t('retry')}</button>
      </div>
    {:else if filteredUsers.length === 0}
      <div class="empty-state">
        <p>{$t('noUsersFound')}</p>
      </div>
    {:else}
      <div class="table-container">
        <table class="users-table">
          <thead>
            <tr>
              <th>Foto</th>
              <th>{$t('playerName')}</th>
              <th>{$t('email')}</th>
              <th>Partidas</th>
              <th>{$t('createdAt')}</th>
              <th>Admin</th>
              <th>{$t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredUsers as user (user.userId)}
              <tr>
                <td class="photo-cell">
                  {#if user.photoURL}
                    <img src={user.photoURL} alt={user.playerName} class="user-avatar" />
                  {:else}
                    <div class="user-avatar-placeholder">
                      {user.playerName?.charAt(0).toUpperCase() || '?'}
                    </div>
                  {/if}
                </td>
                <td class="name-cell" title={user.userId}>{user.playerName || 'N/A'}</td>
                <td class="email-cell">{user.email || 'N/A'}</td>
                <td class="matches-cell">
                  <span class="match-count">{user.matchCount ?? 0}</span>
                </td>
                <td class="date-cell">{formatDate(user.createdAt)}</td>
                <td class="admin-cell">
                  {#if user.isAdmin}
                    <span class="admin-badge">✓ Admin</span>
                  {:else}
                    <span class="user-badge">User</span>
                  {/if}
                </td>
                <td class="actions-cell">
                  <button class="edit-btn" on:click={() => editUser(user)}>
                    ✏️ {$t('edit')}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
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
</AdminGuard>

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
    overflow: hidden;
    border: 1px solid #e0e0e0;
    transition: all 0.3s;
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

  .matches-cell {
    text-align: center;
    padding: 1rem 0.75rem;
  }

  .match-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    padding: 0.3rem 0.65rem;
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    font-size: 0.8rem;
    font-weight: 700;
    border-radius: 16px;
    box-shadow: 0 2px 4px rgba(245, 87, 108, 0.2);
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
    padding-left: 1.25rem;
  }

  .edit-btn {
    padding: 0.5rem 1.25rem;
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

  /* Responsive */
  @media (max-width: 1200px) {
    .users-table th,
    .users-table td {
      padding: 0.85rem 1rem;
      font-size: 0.85rem;
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
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .users-table {
      min-width: 700px;
    }

    .users-table th,
    .users-table td {
      padding: 0.7rem 0.8rem;
      font-size: 0.8rem;
    }

    .photo-cell {
      width: 60px;
      padding-left: 1rem;
    }

    .user-avatar,
    .user-avatar-placeholder {
      width: 36px;
      height: 36px;
      font-size: 0.9rem;
    }

    .edit-btn {
      padding: 0.45rem 1rem;
      font-size: 0.8rem;
    }

    .actions-cell {
      padding-left: 0.8rem;
    }
  }
</style>
