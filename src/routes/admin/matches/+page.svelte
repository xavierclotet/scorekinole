<script lang="ts">
  import { onMount } from 'svelte';
  import SuperAdminGuard from '$lib/components/SuperAdminGuard.svelte';
  import MatchEditModal from '$lib/components/MatchEditModal.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { t } from '$lib/stores/language';
  import { goto } from '$app/navigation';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { getMatchesPaginated, adminDeleteMatch } from '$lib/firebase/admin';
  import type { MatchHistory } from '$lib/types/history';
  import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

  let matches: MatchHistory[] = [];
  let isLoading = true;
  let isLoadingMore = false;
  let errorMessage = '';
  let selectedMatch: MatchHistory | null = null;
  let searchQuery = '';
  let filterStatus: 'all' | 'active' | 'deleted' = 'all';
  let showDeleteConfirm = false;
  let matchToDelete: MatchHistory | null = null;
  const pageSize = 15;

  // Infinite scroll state
  let totalCount = 0;
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let hasMore = true;

  // For search: filter locally from loaded matches
  $: isSearching = searchQuery.trim().length > 0;

  // Filtered matches
  $: filteredMatches = matches.filter((match) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      match.team1Name.toLowerCase().includes(query) ||
      match.team2Name.toLowerCase().includes(query) ||
      match.eventTitle?.toLowerCase().includes(query) ||
      match.matchPhase?.toLowerCase().includes(query) ||
      match.id.toLowerCase().includes(query);

    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && match.syncStatus !== 'deleted') ||
      (filterStatus === 'deleted' && match.syncStatus === 'deleted');

    return matchesSearch && matchesStatus;
  });

  $: displayTotal = isSearching ? filteredMatches.length : totalCount;

  onMount(async () => {
    await loadInitialMatches();
  });

  async function loadInitialMatches() {
    isLoading = true;
    errorMessage = '';
    matches = [];
    lastDoc = null;

    try {
      const result = await getMatchesPaginated(pageSize, null);
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
    if (isLoadingMore || !hasMore || isSearching) return;

    isLoadingMore = true;
    try {
      const result = await getMatchesPaginated(pageSize, lastDoc);
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

    // Load more when 100px from bottom
    if (scrollBottom < 100 && hasMore && !isLoadingMore && !isSearching) {
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
    await loadInitialMatches();
  }

  function confirmDelete(match: MatchHistory) {
    matchToDelete = match;
    showDeleteConfirm = true;
  }

  async function deleteMatch() {
    if (!matchToDelete) return;

    const success = await adminDeleteMatch(matchToDelete.id);
    if (success) {
      matches = matches.filter((m) => m.id !== matchToDelete!.id);
      totalCount = Math.max(0, totalCount - 1);
    }

    showDeleteConfirm = false;
    matchToDelete = null;
  }

  function cancelDelete() {
    showDeleteConfirm = false;
    matchToDelete = null;
  }

  function formatDuration(ms: number): string {
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
    // Use the gameType field directly from the match
    return match.gameType || 'singles';
  }

  function getGameModeInfo(match: MatchHistory): string {
    if (match.gameMode === 'points') {
      return `${match.pointsToWin}p (${match.matchesToWin} games)`;
    } else if (match.gameMode === 'rounds') {
      return `${match.roundsToPlay} rondas`;
    }
    return match.gameMode || 'N/A';
  }
</script>

<SuperAdminGuard>
  <div class="matches-container" data-theme={$adminTheme}>
    <header class="matches-header">
      <button class="back-button" on:click={() => goto('/admin')}>
        ← {$t('backToAdmin')}
      </button>
      <h1>🎯 {$t('matchManagement')}</h1>
      <div class="theme-toggle-wrapper">
        <ThemeToggle />
      </div>
    </header>

    <div class="controls">
      <div class="search-bar">
        <input
          type="text"
          placeholder={$t('searchMatches')}
          bind:value={searchQuery}
        />
      </div>
      <span class="match-count">
        {filteredMatches.length} de {displayTotal} {$t('matches')}
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
        <button on:click={loadInitialMatches}>{$t('retry')}</button>
      </div>
    {:else if filteredMatches.length === 0}
      <div class="empty-state">
        <p>{$t('noMatchesFound')}</p>
      </div>
    {:else}
      <div class="table-container" on:scroll={handleScroll}>
        <table class="matches-table">
          <thead>
            <tr>
              <th class="hide-mobile">Fecha</th>
              <th>Evento</th>
              <th>Fase</th>
              <th>Jugadores</th>
              <th>Resultado</th>
              <th class="hide-mobile">Tipo</th>
              <th class="hide-mobile">Modo</th>
              <th class="hide-mobile">Duración</th>
              <th class="hide-mobile">Guardada por</th>
              <th>{$t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredMatches as match (match.id)}
              <tr>
                <td class="date-cell hide-mobile">
                  <div class="date-time">
                    <span class="date">{formatDate(match.startTime)}</span>
                    <span class="time">{formatTime(match.startTime)}</span>
                  </div>
                </td>
                <td class="event-cell" class:empty={!match.eventTitle}>
                  {match.eventTitle || '-'}
                </td>
                <td class="phase-cell" class:empty={!match.matchPhase}>
                  {match.matchPhase || '-'}
                </td>
                <td class="players-cell">
                  <div class="player-names">
                    <span style="color: {match.team1Color}">{match.team1Name}</span>
                    <span class="vs-text">vs</span>
                    <span style="color: {match.team2Color}">{match.team2Name}</span>
                  </div>
                </td>
                <td class="result-cell">
                  {#if match.matchesToWin > 1}
                    <!-- Best of X: show games won with crown next to winner -->
                    <div class="score-display">
                      <span class="game-score">
                        <span class="game-number" style="color: {match.team1Color}">
                          {match.games.filter(g => g.winner === 1).length}
                          {#if match.winner === 1}
                            <span class="crown">👑</span>
                          {/if}
                        </span>
                        <span class="dash">-</span>
                        <span class="game-number" style="color: {match.team2Color}">
                          {match.games.filter(g => g.winner === 2).length}
                          {#if match.winner === 2}
                            <span class="crown">👑</span>
                          {/if}
                        </span>
                      </span>
                    </div>
                  {:else}
                    <!-- Single game: show total points with crown next to winner -->
                    <div class="score-display">
                      <span class="score" style="color: {match.team1Color}">
                        {match.team1Score}
                        {#if match.winner === 1}
                          <span class="crown">👑</span>
                        {/if}
                      </span>
                      <span class="dash">-</span>
                      <span class="score" style="color: {match.team2Color}">
                        {match.team2Score}
                        {#if match.winner === 2}
                          <span class="crown">👑</span>
                        {/if}
                      </span>
                    </div>
                  {/if}
                </td>
                <td class="type-cell hide-mobile">
                  <span class="type-badge">{$t(getMatchType(match))}</span>
                </td>
                <td class="mode-cell hide-mobile">
                  {getGameModeInfo(match)}
                </td>
                <td class="duration-cell hide-mobile">
                  {formatDuration(match.duration)}
                </td>
                <td class="savedby-cell hide-mobile">
                  {match.savedBy?.userName || 'N/A'}
                </td>
                <td class="actions-cell">
                  <button class="edit-btn" on:click={() => editMatch(match)}>
                    ✏️
                  </button>
                  <button class="delete-btn" on:click={() => confirmDelete(match)}>
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
        {:else if hasMore && !isSearching}
          <div class="load-more-hint">
            Scroll para cargar más partidas
          </div>
        {:else if !hasMore && !isSearching}
          <div class="end-of-list">
            Fin de la lista
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if selectedMatch}
    <MatchEditModal
      match={selectedMatch}
      onClose={closeEditModal}
      on:matchUpdated={handleMatchUpdated}
    />
  {/if}

  {#if showDeleteConfirm && matchToDelete}
    <div class="modal-backdrop" on:click={cancelDelete}>
      <div class="confirm-modal" on:click|stopPropagation>
        <h2>{$t('confirmDelete')}</h2>
        <p>{$t('deleteMatchWarning')}</p>
        <div class="match-info">
          <strong>
            {matchToDelete.team1Name} vs {matchToDelete.team2Name}
          </strong>
          <br />
          <span>{formatDate(matchToDelete.startTime)}</span>
        </div>
        <div class="confirm-actions">
          <button class="cancel-btn" on:click={cancelDelete}>
            {$t('cancel')}
          </button>
          <button class="confirm-btn" on:click={deleteMatch}>
            {$t('deleteConfirm')}
          </button>
        </div>
      </div>
    </div>
  {/if}
</SuperAdminGuard>

<style>
  .matches-container {
    width: 95%;
    max-width: 100%;
    margin: 0 auto;
    padding: 1.5rem;
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .matches-container[data-theme='dark'] {
    background: #0f1419;
  }

  .matches-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    position: relative;
  }

  .matches-header h1 {
    font-size: 1.75rem;
    margin: 0;
    flex: 1;
    color: #1a1a1a;
    font-weight: 600;
    transition: color 0.3s;
  }

  .matches-container[data-theme='dark'] .matches-header h1 {
    color: #e1e8ed;
  }

  .theme-toggle-wrapper {
    margin-left: auto;
  }

  .matches-container[data-theme='dark'] .theme-toggle-wrapper {
    --toggle-bg: rgba(255, 255, 255, 0.05);
    --toggle-color: #fbbf24;
  }

  .matches-container[data-theme='light'] .theme-toggle-wrapper {
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

  .matches-container[data-theme='dark'] .back-button {
    background: #1a2332;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  .back-button:hover {
    background: #f5f5f5;
    border-color: #999;
  }

  .matches-container[data-theme='dark'] .back-button:hover {
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

  .matches-container[data-theme='dark'] .search-bar input {
    background: #1a2332;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .search-bar input:focus {
    outline: none;
    border-color: #f5576c;
    box-shadow: 0 0 0 3px rgba(245, 87, 108, 0.1);
  }

  .matches-container[data-theme='dark'] .search-bar input::placeholder {
    color: #6b7a94;
  }

  .match-count {
    font-weight: 500;
    color: #666;
    white-space: nowrap;
    font-size: 0.85rem;
    padding: 0.5rem 0.75rem;
    background: white;
    border-radius: 6px;
    border: 1px solid #ddd;
    transition: all 0.3s;
  }

  .matches-container[data-theme='dark'] .match-count {
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

  .matches-container[data-theme='dark'] .loading,
  .matches-container[data-theme='dark'] .empty-state {
    background: #1a2332;
    color: #e1e8ed;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #f3f3f3;
    border-top-color: #f5576c;
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

  .matches-container[data-theme='dark'] .loading-more {
    color: #8b9bb3;
  }

  .load-more-hint,
  .end-of-list {
    text-align: center;
    padding: 1rem;
    color: #999;
    font-size: 0.85rem;
  }

  .matches-container[data-theme='dark'] .load-more-hint,
  .matches-container[data-theme='dark'] .end-of-list {
    color: #6b7a94;
  }

  .end-of-list {
    border-top: 1px dashed #ddd;
  }

  .matches-container[data-theme='dark'] .end-of-list {
    border-top-color: #2d3748;
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
    overflow-x: auto;
    overflow-y: auto;
    max-height: calc(100vh - 250px);
    border: 1px solid #e0e0e0;
    transition: all 0.3s;
    -webkit-overflow-scrolling: touch;
  }

  .matches-container[data-theme='dark'] .table-container {
    background: #1a2332;
    border-color: #2d3748;
  }

  .matches-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  .matches-table thead {
    background: linear-gradient(to bottom, #f8f9fa, #e9ecef);
    transition: background 0.3s;
  }

  .matches-container[data-theme='dark'] .matches-table thead {
    background: linear-gradient(to bottom, #1f2937, #111827);
  }

  .matches-table th {
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

  .matches-container[data-theme='dark'] .matches-table th {
    color: #8b9bb3;
    border-bottom-color: #374151;
  }

  .matches-table tbody tr {
    transition: all 0.15s ease;
  }

  .matches-table tbody tr:hover {
    background: #f8f9fa;
    transform: translateX(2px);
  }

  .matches-container[data-theme='dark'] .matches-table tbody tr:hover {
    background: #212d3f;
  }

  .matches-table tbody tr:not(:last-child) {
    border-bottom: 1px solid #f0f0f0;
  }

  .matches-container[data-theme='dark'] .matches-table tbody tr:not(:last-child) {
    border-bottom-color: #2d3748;
  }

  .matches-table td {
    padding: 1rem 1.25rem;
    vertical-align: middle;
    color: #333;
    font-size: 0.9rem;
    transition: color 0.3s;
  }

  .matches-container[data-theme='dark'] .matches-table td {
    color: #e1e8ed;
  }

  .event-cell {
    font-weight: 600;
    color: #2c3e50;
    font-size: 0.92rem;
    transition: color 0.3s;
  }

  .event-cell.empty {
    text-align: center;
    color: #999;
    font-weight: 400;
  }

  .matches-container[data-theme='dark'] .event-cell {
    color: #e1e8ed;
  }

  .matches-container[data-theme='dark'] .event-cell.empty {
    color: #6b7a94;
  }

  .phase-cell {
    color: #666;
    font-size: 0.88rem;
    transition: color 0.3s;
  }

  .phase-cell.empty {
    text-align: center;
    color: #999;
    font-weight: 400;
  }

  .matches-container[data-theme='dark'] .phase-cell {
    color: #8b9bb3;
  }

  .matches-container[data-theme='dark'] .phase-cell.empty {
    color: #6b7a94;
  }

  .players-cell {
    min-width: 140px;
    max-width: 180px;
  }

  .player-names {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.88rem;
  }

  .player-names span {
    font-weight: 600;
  }

  .vs-text {
    color: #999 !important;
    font-weight: 400 !important;
    font-size: 0.75rem !important;
    text-align: left;
  }

  .result-cell {
    text-align: center;
  }

  .score-display {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 1.1rem;
    font-weight: 700;
  }

  .score {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .game-score {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.1rem;
    font-weight: 700;
  }

  .game-number {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: #333;
    transition: color 0.3s;
  }

  .matches-container[data-theme='dark'] .game-number {
    color: #e1e8ed;
  }

  .crown {
    font-size: 1rem;
    line-height: 1;
    vertical-align: middle;
  }

  .dash {
    color: #999;
    font-weight: 400;
  }

  .type-cell {
    text-align: center;
  }

  .type-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.3rem 0.75rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 16px;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.2);
  }

  .mode-cell {
    color: #555;
    font-size: 0.88rem;
    transition: color 0.3s;
  }

  .matches-container[data-theme='dark'] .mode-cell {
    color: #8b9bb3;
  }

  .date-cell {
    min-width: 120px;
  }

  .date-time {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .date {
    color: #333;
    font-size: 0.88rem;
    font-weight: 500;
    transition: color 0.3s;
  }

  .matches-container[data-theme='dark'] .date {
    color: #e1e8ed;
  }

  .time {
    color: #888;
    font-size: 0.75rem;
    transition: color 0.3s;
  }

  .matches-container[data-theme='dark'] .time {
    color: #6b7a94;
  }

  .duration-cell {
    color: #666;
    font-size: 0.88rem;
    transition: color 0.3s;
  }

  .matches-container[data-theme='dark'] .duration-cell {
    color: #8b9bb3;
  }

  .savedby-cell {
    color: #555;
    font-size: 0.88rem;
    transition: color 0.3s;
  }

  .matches-container[data-theme='dark'] .savedby-cell {
    color: #8b9bb3;
  }

  .actions-cell {
    text-align: left;
    padding-left: 0.75rem;
    white-space: nowrap;
  }

  .actions-cell button {
    padding: 0.5rem 0.65rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
    transition: all 0.2s;
    margin-right: 0.35rem;
  }

  .actions-cell button:last-child {
    margin-right: 0;
  }

  .edit-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.2);
  }

  .edit-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
  }

  .delete-btn {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    box-shadow: 0 2px 4px rgba(245, 87, 108, 0.2);
  }

  .delete-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(245, 87, 108, 0.3);
  }

  .actions-cell button:active {
    transform: translateY(0);
  }

  /* Confirm Modal */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .confirm-modal {
    background: white;
    border-radius: 16px;
    padding: 2rem;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .confirm-modal h2 {
    margin: 0 0 1rem;
    color: #f5576c;
    font-size: 1.5rem;
  }

  .confirm-modal p {
    margin-bottom: 1rem;
    color: #666;
  }

  .match-info {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .confirm-actions {
    display: flex;
    gap: 0.5rem;
  }

  .confirm-actions button {
    flex: 1;
    padding: 0.75rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s;
    font-weight: 600;
  }

  .cancel-btn {
    background: #6c757d;
    color: white;
  }

  .cancel-btn:hover {
    background: #5a6268;
    transform: translateY(-1px);
  }

  .confirm-btn {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
  }

  .confirm-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(245, 87, 108, 0.3);
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .matches-container {
      padding: 0.75rem;
      width: 98%;
    }

    .matches-header {
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-rows: auto auto;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .back-button {
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
      grid-column: 1;
      grid-row: 1;
    }

    .theme-toggle-wrapper {
      grid-column: 3;
      grid-row: 1;
    }

    .matches-header h1 {
      font-size: 1.2rem;
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .controls {
      flex-direction: row;
      align-items: center;
      width: 100%;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .search-bar input {
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
    }

    .match-count {
      padding: 0.4rem 0.75rem;
      font-size: 0.85rem;
    }

    .table-container {
      max-height: calc(100vh - 150px);
    }

    .matches-table {
      min-width: 600px;
    }

    .matches-table th,
    .matches-table td {
      padding: 0.7rem 0.8rem;
      font-size: 0.8rem;
    }

    .hide-mobile {
      display: none !important;
    }

    .actions-cell button {
      padding: 0.45rem 0.65rem;
      font-size: 0.9rem;
    }
  }
</style>
