<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import { t } from '$lib/stores/language';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { goto } from '$app/navigation';
  import { getAllTournaments, deleteTournament as deleteTournamentFirebase } from '$lib/firebase/tournaments';
  import type { Tournament } from '$lib/types/tournament';

  let tournaments: Tournament[] = [];
  let filteredTournaments: Tournament[] = [];
  let searchQuery = '';
  let statusFilter: 'all' | 'DRAFT' | 'GROUP_STAGE' | 'FINAL_STAGE' | 'COMPLETED' | 'CANCELLED' = 'all';
  let loading = true;
  let showDeleteConfirm = false;
  let tournamentToDelete: Tournament | null = null;
  let showToast = false;
  let toastMessage = '';

  onMount(async () => {
    await loadTournaments();
  });

  async function loadTournaments() {
    loading = true;
    tournaments = await getAllTournaments(100);
    filterTournaments();
    loading = false;
  }

  function filterTournaments() {
    filteredTournaments = tournaments.filter(tournament => {
      const matchesSearch =
        searchQuery === '' ||
        tournament.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tournament.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || tournament.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  $: {
    searchQuery;
    statusFilter;
    filterTournaments();
  }

  function getStatusText(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'Borrador';
      case 'GROUP_STAGE':
        return 'Fase de Grupos';
      case 'FINAL_STAGE':
        return 'Fase Final';
      case 'COMPLETED':
        return 'Completado';
      case 'CANCELLED':
        return 'Cancelado';
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
      toastMessage = '✅ Torneo eliminado correctamente';
      showToast = true;
      await loadTournaments();
    } else {
      toastMessage = '❌ Error al eliminar el torneo';
      showToast = true;
    }

    showDeleteConfirm = false;
    tournamentToDelete = null;
  }
</script>

<AdminGuard>
  <div class="tournaments-container" data-theme={$adminTheme}>
    <header class="tournaments-header">
      <div class="header-top">
        <button class="back-button" on:click={() => goto('/admin')}>
          ← {$t('backToAdmin')}
        </button>
        <div class="theme-toggle-wrapper">
          <ThemeToggle />
        </div>
      </div>

      <div class="header-content">
        <div class="title-section">
          <h1>🏆 {$t('tournamentManagement')}</h1>
          <p class="subtitle">{$t('manageTournamentsDesc')}</p>
        </div>

        <button class="create-button" on:click={createTournament}>
          + Crear Torneo
        </button>
      </div>
    </header>

    <div class="controls-section">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Buscar torneos..."
          class="search-input"
        />
      </div>

      <div class="filter-tabs">
        <button
          class="filter-tab"
          class:active={statusFilter === 'all'}
          on:click={() => (statusFilter = 'all')}
        >
          Todos ({tournaments.length})
        </button>
        <button
          class="filter-tab"
          class:active={statusFilter === 'DRAFT'}
          on:click={() => (statusFilter = 'DRAFT')}
        >
          Borradores
        </button>
        <button
          class="filter-tab"
          class:active={statusFilter === 'GROUP_STAGE'}
          on:click={() => (statusFilter = 'GROUP_STAGE')}
        >
          En Grupos
        </button>
        <button
          class="filter-tab"
          class:active={statusFilter === 'FINAL_STAGE'}
          on:click={() => (statusFilter = 'FINAL_STAGE')}
        >
          En Final
        </button>
        <button
          class="filter-tab"
          class:active={statusFilter === 'COMPLETED'}
          on:click={() => (statusFilter = 'COMPLETED')}
        >
          Completados
        </button>
      </div>
    </div>

    {#if loading}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>{$t('loading')}...</p>
      </div>
    {:else if filteredTournaments.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <h3>No hay torneos</h3>
        <p>
          {searchQuery || statusFilter !== 'all'
            ? 'No se encontraron torneos con los filtros aplicados'
            : 'Usa el botón "Crear Torneo" para empezar'}
        </p>
      </div>
    {:else}
      <div class="results-info">
        Mostrando {filteredTournaments.length} de {tournaments.length} torneos
      </div>

      <div class="table-container">
        <table class="tournaments-table">
          <thead>
            <tr>
              <th class="name-col">Nombre</th>
              <th class="city-col hide-mobile">Ciudad</th>
              <th class="status-col">Estado</th>
              <th class="type-col hide-mobile">Tipo</th>
              <th class="mode-col hide-mobile">Modo</th>
              <th class="participants-col">Players</th>
              <th class="created-col hide-mobile">Creado</th>
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
                <td class="city-cell hide-mobile">
                  {tournament.city || '-'}
                </td>
                <td class="status-cell">
                  <span
                    class="status-badge"
                    style="background: {getStatusColor(tournament.status)}; color: white;"
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
                      {tournament.groupStage.type === 'SWISS' ? 'Suizo' : 'RR'}
                    </span>
                    <span class="mode-separator">+</span>
                  {/if}
                  {#if tournament.finalStage?.mode === 'SPLIT_DIVISIONS' || tournament.finalStageConfig?.mode === 'SPLIT_DIVISIONS'}
                    <span class="mode-final split">Oro/Plata</span>
                  {:else}
                    <span class="mode-final">1F</span>
                  {/if}
                </td>
                <td class="participants-cell">
                  👥 {tournament.participants.length}
                </td>
                <td class="created-cell hide-mobile">
                  {formatDate(tournament.createdAt)}
                </td>
                <td class="actions-cell">
                  <button
                    class="action-btn duplicate-btn"
                    on:click|stopPropagation={() => duplicateTournament(tournament)}
                    title="Duplicar torneo"
                  >
                    📋
                  </button>
                  <button
                    class="action-btn delete-btn"
                    on:click|stopPropagation={() => confirmDelete(tournament)}
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- Delete Confirmation Modal -->
  {#if showDeleteConfirm && tournamentToDelete}
    <div class="modal-backdrop" on:click={cancelDelete}>
      <div class="confirm-modal" on:click|stopPropagation>
        <h2>Confirmar Eliminación</h2>
        <p>¿Estás seguro de que deseas eliminar este torneo?</p>
        <div class="tournament-info">
          <strong>{tournamentToDelete.name}</strong>
          <br />
          <span>{tournamentToDelete.participants.length} participantes</span>
          <br />
          <span>Creado: {formatDate(tournamentToDelete.createdAt)}</span>
        </div>
        <div class="confirm-actions">
          <button class="cancel-btn" on:click={cancelDelete}>Cancelar</button>
          <button class="delete-btn-confirm" on:click={deleteTournament}>Eliminar</button>
        </div>
      </div>
    </div>
  {/if}
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} />

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
  .tournaments-header {
    margin-bottom: 2rem;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .back-button {
    padding: 0.6rem 1.2rem;
    font-size: 0.9rem;
    background: white;
    color: #555;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }

  .tournaments-container[data-theme='dark'] .back-button {
    background: #1a2332;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  .back-button:hover {
    background: #f5f5f5;
    border-color: #999;
    transform: translateX(-3px);
  }

  .tournaments-container[data-theme='dark'] .back-button:hover {
    background: #2d3748;
    border-color: #4a5568;
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
  }

  .title-section h1 {
    font-size: 2rem;
    margin: 0 0 0.25rem 0;
    color: #1a1a1a;
    font-weight: 700;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .title-section h1 {
    color: #e1e8ed;
  }

  .subtitle {
    font-size: 0.95rem;
    color: #666;
    margin: 0;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .subtitle {
    color: #8b9bb3;
  }

  .create-button {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .create-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(250, 112, 154, 0.4);
  }

  /* Controls */
  .controls-section {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .search-box {
    flex: 1;
    min-width: 250px;
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 1.2rem;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 3rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 0.95rem;
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
    box-shadow: 0 0 0 3px rgba(250, 112, 154, 0.1);
  }

  .filter-tabs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-tab {
    padding: 0.6rem 1rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
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
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 1rem;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .results-info {
    color: #8b9bb3;
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

  /* Loading state */
  .loading-state {
    text-align: center;
    padding: 4rem 2rem;
  }

  .spinner {
    width: 50px;
    height: 50px;
    margin: 0 auto 1rem;
    border: 4px solid #f0f0f0;
    border-top: 4px solid #fa709a;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .loading-state p {
    color: #666;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .loading-state p {
    color: #8b9bb3;
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
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    transition: all 0.3s;
  }

  .tournaments-container[data-theme='dark'] .table-container {
    background: #1a2332;
  }

  .tournaments-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .tournaments-table thead {
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
    transition: all 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournaments-table thead {
    background: #0f1419;
    border-color: #2d3748;
  }

  .tournaments-table th {
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    color: #666;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournaments-table th {
    color: #8b9bb3;
  }

  .tournament-row {
    border-bottom: 1px solid #e5e7eb;
    cursor: pointer;
    transition: all 0.2s;
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
    padding: 1rem;
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

  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    display: inline-block;
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

  .tournaments-container[data-theme='dark'] .confirm-modal {
    background: #1a2332;
  }

  .confirm-modal h2 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
    font-size: 1.5rem;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .confirm-modal h2 {
    color: #e1e8ed;
  }

  .confirm-modal p {
    color: #666;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .confirm-modal p {
    color: #8b9bb3;
  }

  .tournament-info {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    transition: all 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournament-info {
    background: #0f1419;
  }

  .tournament-info strong {
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournament-info strong {
    color: #e1e8ed;
  }

  .tournament-info span {
    color: #666;
    font-size: 0.9rem;
    transition: color 0.3s;
  }

  .tournaments-container[data-theme='dark'] .tournament-info span {
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

  .tournaments-container[data-theme='dark'] .cancel-btn {
    background: #0f1419;
    color: #e1e8ed;
  }

  .cancel-btn:hover {
    background: #e5e7eb;
  }

  .tournaments-container[data-theme='dark'] .cancel-btn:hover {
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

  @media (max-width: 768px) {
    .tournaments-container {
      padding: 1rem;
    }

    .header-content {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    .create-button {
      width: 100%;
    }

    .tournaments-grid {
      grid-template-columns: 1fr;
    }

    .controls-section {
      flex-direction: column;
    }

    .filter-tabs {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 0.5rem;
    }

    .hide-mobile {
      display: none;
    }

    .tournaments-table {
      font-size: 0.85rem;
    }

    .tournaments-table td,
    .tournaments-table th {
      padding: 0.75rem 0.5rem;
    }

    .name-cell {
      max-width: 150px;
    }

    .status-badge {
      font-size: 0.7rem;
      padding: 0.2rem 0.6rem;
    }

    .participants-cell {
      font-size: 0.85rem;
    }

    .action-btn {
      font-size: 1rem;
      padding: 0.4rem;
    }
  }

  @media (max-width: 480px) {
    .name-cell {
      max-width: 120px;
    }

    .tournaments-table {
      font-size: 0.8rem;
    }

    .tournaments-table td,
    .tournaments-table th {
      padding: 0.5rem 0.25rem;
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

    .tournaments-header {
      margin-bottom: 0.75rem;
      flex-shrink: 0;
    }

    .header-top {
      margin-bottom: 0.5rem;
    }

    .back-button {
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
    }

    .header-content {
      gap: 1rem;
    }

    .title-section h1 {
      font-size: 1.3rem;
      margin-bottom: 0.15rem;
    }

    .subtitle {
      font-size: 0.75rem;
    }

    .create-button {
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
    }

    .controls-section {
      margin-bottom: 0.75rem;
      flex-shrink: 0;
    }

    .search-box {
      padding: 0.5rem;
    }

    .search-input {
      padding: 0.5rem 0.5rem 0.5rem 2.5rem;
      font-size: 0.85rem;
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
