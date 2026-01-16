<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import CompletedTournamentView from '$lib/components/tournament/CompletedTournamentView.svelte';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { getTournament, cancelTournament as cancelTournamentFirebase, updateTournament } from '$lib/firebase/tournaments';
  import { transitionTournament } from '$lib/utils/tournamentStateMachine';
  import type { Tournament } from '$lib/types/tournament';
  import Toast from '$lib/components/Toast.svelte';

  let tournament: Tournament | null = null;
  let loading = true;
  let error = false;
  let showCancelConfirm = false;
  let showStartConfirm = false;
  let showQuickEdit = false;
  let showToast = false;
  let toastMessage = '';
  let isStarting = false;
  let isSavingQuickEdit = false;

  // Quick edit form fields
  let editName = '';
  let editDate = '';
  let editNumTables = 1;
  let editShow20s = false;
  let editShowHammer = false;
  let editEloEnabled = false;
  let editEloKFactor = 2.0;
  let editEloMaxDelta = 25;

  $: tournamentId = $page.params.id;

  onMount(async () => {
    await loadTournament();
  });

  async function loadTournament() {
    loading = true;
    error = false;

    try {
      if (!tournamentId) {
        error = true;
        loading = false;
        return;
      }
      tournament = await getTournament(tournamentId);

      if (!tournament) {
        error = true;
      }
    } catch (err) {
      console.error('Error loading tournament:', err);
      error = true;
    } finally {
      loading = false;
    }
  }

  function getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      DRAFT: 'Borrador',
      GROUP_STAGE: 'Fase de Grupos',
      TRANSITION: 'Transición',
      FINAL_STAGE: 'Fase Final',
      COMPLETED: 'Completado',
      CANCELLED: 'Cancelado'
    };
    return statusMap[status] || status;
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

  function confirmStart() {
    if (!tournament) return;

    // Validation: minimum 4 participants
    if (tournament.participants.length < 4) {
      toastMessage = '❌ Se requieren al menos 4 participantes para iniciar el torneo';
      showToast = true;
      return;
    }

    showStartConfirm = true;
  }

  function closeStartModal() {
    showStartConfirm = false;
  }

  async function startTournament() {
    if (!tournamentId || !tournament) return;

    isStarting = true;
    closeStartModal();

    try {
      // Determine next status based on tournament phase type
      const nextStatus = tournament.phaseType === 'TWO_PHASE' ? 'GROUP_STAGE' : 'FINAL_STAGE';

      const success = await transitionTournament(tournamentId, nextStatus);

      if (success) {
        toastMessage = '✅ Torneo iniciado correctamente';
        showToast = true;
        await loadTournament();
      } else {
        toastMessage = '❌ Error al iniciar el torneo. Verifica la configuración.';
        showToast = true;
      }
    } catch (err) {
      console.error('Error starting tournament:', err);
      toastMessage = '❌ Error al iniciar el torneo';
      showToast = true;
    } finally {
      isStarting = false;
    }
  }

  function confirmCancel() {
    showCancelConfirm = true;
  }

  function closeCancelModal() {
    showCancelConfirm = false;
  }

  async function cancelTournament() {
    if (!tournamentId) return;

    const success = await cancelTournamentFirebase(tournamentId);

    if (success) {
      toastMessage = '✅ Torneo cancelado correctamente';
      showToast = true;
      await loadTournament();
    } else {
      toastMessage = '❌ Error al cancelar el torneo';
      showToast = true;
    }

    showCancelConfirm = false;
  }

  // Quick Edit functions
  function openQuickEdit() {
    if (!tournament) return;

    // Initialize form with current values
    editName = tournament.name;
    editDate = tournament.tournamentDate
      ? new Date(tournament.tournamentDate).toISOString().split('T')[0]
      : '';
    editNumTables = tournament.numTables;
    editShow20s = tournament.show20s;
    editShowHammer = tournament.showHammer;
    editEloEnabled = tournament.eloConfig.enabled;
    editEloKFactor = tournament.eloConfig.kFactor;
    editEloMaxDelta = tournament.eloConfig.maxDelta;

    showQuickEdit = true;
  }

  function closeQuickEdit() {
    showQuickEdit = false;
  }

  function getMinTables(): number {
    if (!tournament) return 1;
    // Calculate minimum tables needed based on participants
    const numParticipants = tournament.participants.length;
    return Math.max(1, Math.ceil(numParticipants / 2));
  }

  async function saveQuickEdit() {
    if (!tournamentId || !tournament) return;

    // Validate minimum tables
    const minTables = getMinTables();
    if (editNumTables < minTables) {
      toastMessage = `❌ Se necesitan mínimo ${minTables} mesas para ${tournament.participants.length} participantes`;
      showToast = true;
      return;
    }

    isSavingQuickEdit = true;

    try {
      const updates: Partial<Tournament> = {
        name: editName.trim(),
        tournamentDate: editDate ? new Date(editDate).getTime() : undefined,
        numTables: editNumTables,
        show20s: editShow20s,
        showHammer: editShowHammer,
        eloConfig: {
          enabled: editEloEnabled,
          initialElo: tournament.eloConfig.initialElo,
          kFactor: editEloKFactor,
          maxDelta: editEloMaxDelta
        }
      };

      const success = await updateTournament(tournamentId, updates);

      if (success) {
        toastMessage = '✅ Configuración actualizada';
        showToast = true;
        closeQuickEdit();
        await loadTournament();
      } else {
        toastMessage = '❌ Error al guardar los cambios';
        showToast = true;
      }
    } catch (err) {
      console.error('Error saving quick edit:', err);
      toastMessage = '❌ Error al guardar los cambios';
      showToast = true;
    } finally {
      isSavingQuickEdit = false;
    }
  }

  // Check if tournament can be quick-edited (active states only)
  $: canQuickEdit = tournament && ['GROUP_STAGE', 'TRANSITION', 'FINAL_STAGE'].includes(tournament.status);
</script>

<AdminGuard>
  <div class="tournament-page" data-theme={$adminTheme}>
    <!-- Header -->
    <header class="page-header">
      <div class="header-top">
        <button class="back-button" on:click={() => goto('/admin/tournaments')}>
          ← Volver a Torneos
        </button>
        <div class="theme-toggle-wrapper">
          <ThemeToggle />
        </div>
      </div>

      {#if tournament}
        <div class="tournament-header">
          <div class="header-content">
            <div class="title-row">
              <h1>{tournament.edition ? `#${tournament.edition} ` : ''}{tournament.name}</h1>
              {#if tournament.tournamentDate}
                <span class="tournament-date">{new Date(tournament.tournamentDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              {/if}
            </div>
            {#if tournament.city && tournament.country}
              <p class="location">{tournament.city} ({tournament.country})</p>
            {/if}
            {#if tournament.description}
              <p class="description">{tournament.description}</p>
            {/if}
            <div class="tournament-meta">
            

               <span class="meta-item">
                🔑 {tournament.key}
              </span>
            </div>
          </div>
          <div class="header-right">
            <div class="status-badge" style="background: {getStatusColor(tournament.status)}">
              {getStatusText(tournament.status)}
            </div>
            <div class="header-actions">
              {#if tournament.status === 'DRAFT'}
                <button class="header-action-btn start" on:click={confirmStart} disabled={isStarting}>
                  {isStarting ? '⏳ Iniciando...' : '🚀 Iniciar'}
                </button>
                <button class="header-action-btn edit" on:click={() => goto(`/admin/tournaments/create?edit=${tournamentId}`)}>
                  ✏️ Editar
                </button>
                <button class="header-action-btn danger" on:click={confirmCancel}>
                  🗑️ Cancelar
                </button>
              {:else if tournament.status === 'GROUP_STAGE'}
                <button class="header-action-btn primary" on:click={() => goto(`/admin/tournaments/${tournamentId}/groups`)}>
                  📊 Ver Fase de Grupos
                </button>
                <button class="header-action-btn edit" on:click={openQuickEdit}>
                  ⚙️ Ajustes
                </button>
              {:else if tournament.status === 'TRANSITION'}
                <button class="header-action-btn primary" on:click={() => goto(`/admin/tournaments/${tournamentId}/transition`)}>
                  ⚡ Seleccionar Clasificados
                </button>
                <button class="header-action-btn edit" on:click={openQuickEdit}>
                  ⚙️ Ajustes
                </button>
              {:else if tournament.status === 'FINAL_STAGE'}
                <button class="header-action-btn primary" on:click={() => goto(`/admin/tournaments/${tournamentId}/bracket`)}>
                  🏆 Ver Bracket
                </button>
                <button class="header-action-btn edit" on:click={openQuickEdit}>
                  ⚙️ Ajustes
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </header>

    <!-- Content -->
    <div class="page-content">
      {#if loading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Cargando torneo...</p>
        </div>
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Torneo no encontrado</h3>
          <p>No se pudo cargar el torneo. Es posible que no exista o no tengas permisos.</p>
          <button class="primary-button" on:click={() => goto('/admin/tournaments')}>
            Volver a Torneos
          </button>
        </div>
      {:else}
        <!-- Tournament Dashboard Content -->
        <div class="dashboard-grid">
          <!-- Completed Tournament Results Section (at the top) -->
          {#if tournament.status === 'COMPLETED'}
            <section class="dashboard-card results-card">
              <h2>📋 Resultados del Torneo</h2>
              <CompletedTournamentView {tournament} />
            </section>
          {/if}

          <!-- General Configuration Section -->
          <section class="dashboard-card">
            <h2>Configuración General</h2>
            <div class="config-list">
              <div class="config-item">
                <span class="config-label">Formato:</span>
                <span class="config-value">
                  {tournament.phaseType === 'ONE_PHASE' ? '1 Fase (Solo Final)' : '2 Fases (Grupos + Final)'}
                </span>
              </div>

              <div class="config-item">
                <span class="config-label">🎮 Modalidad:</span>
                <span class="config-value">
                  {tournament.gameType === 'singles' ? 'Singles' : 'Dobles'}
                </span>
              </div>

              <div class="config-item">
                <span class="config-label">🪑 Mesas Disponibles:</span>
                <span class="config-value">{tournament.numTables}</span>
              </div>

              <div class="config-item">
                <span class="config-label">🎯 Contar 20s:</span>
                <span class="config-value">{tournament.show20s ? '✅ Sí' : '❌ No'}</span>
              </div>

              <div class="config-item">
                <span class="config-label">🔨 Mostrar Hammer:</span>
                <span class="config-value">{tournament.showHammer ? '✅ Sí' : '❌ No'}</span>
              </div>

              <div class="config-item">
                <span class="config-label">📊 Sistema ELO:</span>
                <span class="config-value">{tournament.eloConfig.enabled ? '✅ Activado' : '❌ Desactivado'}</span>
              </div>
            </div>
          </section>

          <!-- Group Stage Configuration (only for TWO_PHASE) -->
          {#if tournament.phaseType === 'TWO_PHASE' && tournament.groupStage}
            <section class="dashboard-card">
              <h2>⚔️ Fase de Grupos</h2>
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">Sistema:</span>
                  <span class="config-value">
                    {tournament.groupStage.type === 'ROUND_ROBIN' ? 'Round Robin' : 'Sistema Suizo'}
                  </span>
                </div>

                {#if tournament.groupStage.type === 'ROUND_ROBIN' && tournament.groupStage.numGroups}
                  <div class="config-item">
                    <span class="config-label">Número de Grupos:</span>
                    <span class="config-value">{tournament.groupStage.numGroups}</span>
                  </div>
                {:else if tournament.groupStage.type === 'SWISS' && tournament.groupStage.numSwissRounds}
                  <div class="config-item">
                    <span class="config-label">Rondas Suizas:</span>
                    <span class="config-value">{tournament.groupStage.numSwissRounds}</span>
                  </div>
                {/if}

                <div class="config-item">
                  <span class="config-label">Modo de Juego:</span>
                  <span class="config-value">
                    {tournament.groupStage.gameMode === 'points'
                      ? `Por Puntos (${tournament.groupStage.pointsToWin})`
                      : `Por Rondas (${tournament.groupStage.roundsToPlay})`}
                  </span>
                </div>

                <div class="config-item">
                  <span class="config-label">Partidos a Ganar:</span>
                  <span class="config-value">Best of {tournament.groupStage.matchesToWin}</span>
                </div>
              </div>
            </section>
          {/if}

          <!-- Final Stage Configuration -->
          <section class="dashboard-card final-stage-card">
            <h2>🏆 Fase Final</h2>

            {#if tournament.phaseType === 'TWO_PHASE' && tournament.finalStageConfig}
              <!-- TWO_PHASE: Show finalStageConfig -->
              <div class="config-list">
                <div class="config-item highlight">
                  <span class="config-label">Estructura:</span>
                  <span class="config-value">
                    {tournament.finalStageConfig.mode === 'SPLIT_DIVISIONS'
                      ? '🥇🥈 Divisiones Oro / Plata'
                      : '🎯 Bracket Único'}
                  </span>
                </div>
              </div>

              {#if tournament.finalStageConfig.mode === 'SPLIT_DIVISIONS'}
                <!-- Split Divisions: Gold and Silver brackets -->
                <div class="bracket-configs">
                  <div class="bracket-config gold">
                    <h3>🥇 Bracket Oro</h3>
                    <div class="config-list">
                      <div class="config-item">
                        <span class="config-label">Modo de Juego:</span>
                        <span class="config-value">
                          {tournament.finalStageConfig.gameMode === 'points'
                            ? `Por Puntos (${tournament.finalStageConfig.pointsToWin})`
                            : `Por Rondas (${tournament.finalStageConfig.roundsToPlay})`}
                        </span>
                      </div>
                      <div class="config-item">
                        <span class="config-label">Partidos a Ganar:</span>
                        <span class="config-value">Best of {tournament.finalStageConfig.matchesToWin}</span>
                      </div>
                    </div>
                  </div>

                  <div class="bracket-config silver">
                    <h3>🥈 Bracket Plata</h3>
                    <div class="config-list">
                      <div class="config-item">
                        <span class="config-label">Modo de Juego:</span>
                        <span class="config-value">
                          {tournament.finalStageConfig.silverGameMode === 'points'
                            ? `Por Puntos (${tournament.finalStageConfig.silverPointsToWin})`
                            : `Por Rondas (${tournament.finalStageConfig.silverRoundsToPlay})`}
                        </span>
                      </div>
                      <div class="config-item">
                        <span class="config-label">Partidos a Ganar:</span>
                        <span class="config-value">Best of {tournament.finalStageConfig.silverMatchesToWin}</span>
                      </div>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- Single Bracket -->
                <div class="config-list">
                  <div class="config-item">
                    <span class="config-label">Modo de Juego:</span>
                    <span class="config-value">
                      {tournament.finalStageConfig.gameMode === 'points'
                        ? `Por Puntos (${tournament.finalStageConfig.pointsToWin})`
                        : `Por Rondas (${tournament.finalStageConfig.roundsToPlay})`}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">Partidos a Ganar:</span>
                    <span class="config-value">Best of {tournament.finalStageConfig.matchesToWin}</span>
                  </div>
                </div>
              {/if}

            {:else if tournament.finalStage}
              <!-- ONE_PHASE or active final stage: Show finalStage data -->
              <div class="config-list">
                <div class="config-item highlight">
                  <span class="config-label">Estructura:</span>
                  <span class="config-value">
                    {tournament.finalStage.mode === 'SPLIT_DIVISIONS'
                      ? '🥇🥈 Divisiones Oro / Plata'
                      : '🎯 Bracket Único'}
                  </span>
                </div>
              </div>

              {#if tournament.finalStage.mode === 'SPLIT_DIVISIONS'}
                <!-- Split Divisions: Gold and Silver brackets -->
                <div class="bracket-configs">
                  <div class="bracket-config gold">
                    <h3>🥇 Bracket Oro</h3>
                    <div class="config-list">
                      <div class="config-item">
                        <span class="config-label">Modo de Juego:</span>
                        <span class="config-value">
                          {tournament.finalStage.gameMode === 'points'
                            ? `Por Puntos (${tournament.finalStage.pointsToWin})`
                            : `Por Rondas (${tournament.finalStage.roundsToPlay})`}
                        </span>
                      </div>
                      <div class="config-item">
                        <span class="config-label">Partidos a Ganar:</span>
                        <span class="config-value">Best of {tournament.finalStage.matchesToWin}</span>
                      </div>
                    </div>
                  </div>

                  <div class="bracket-config silver">
                    <h3>🥈 Bracket Plata</h3>
                    <div class="config-list">
                      <div class="config-item">
                        <span class="config-label">Modo de Juego:</span>
                        <span class="config-value">
                          {tournament.finalStage.silverGameMode === 'points'
                            ? `Por Puntos (${tournament.finalStage.silverPointsToWin})`
                            : `Por Rondas (${tournament.finalStage.silverRoundsToPlay})`}
                        </span>
                      </div>
                      <div class="config-item">
                        <span class="config-label">Partidos a Ganar:</span>
                        <span class="config-value">Best of {tournament.finalStage.silverMatchesToWin}</span>
                      </div>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- Single Bracket -->
                <div class="config-list">
                  <div class="config-item">
                    <span class="config-label">Modo de Juego:</span>
                    <span class="config-value">
                      {tournament.finalStage.gameMode === 'points'
                        ? `Por Puntos (${tournament.finalStage.pointsToWin})`
                        : `Por Rondas (${tournament.finalStage.roundsToPlay})`}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">Partidos a Ganar:</span>
                    <span class="config-value">Best of {tournament.finalStage.matchesToWin}</span>
                  </div>
                </div>
              {/if}

            {:else}
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">Estado:</span>
                  <span class="config-value">Pendiente de configurar</span>
                </div>
              </div>
            {/if}
          </section>

        </div>
      {/if}
    </div>
  </div>

  <!-- Start Confirmation Modal -->
  {#if showStartConfirm && tournament}
    <div class="modal-backdrop" data-theme={$adminTheme} on:click={closeStartModal} role="button" tabindex="0" on:keydown={(e) => e.key === 'Escape' && closeStartModal()}>
      <div class="confirm-modal" on:click|stopPropagation role="dialog" aria-modal="true">
        <h2>🚀 Iniciar Torneo</h2>
        <p>¿Estás listo para iniciar el torneo?</p>
        <div class="tournament-info">
          <strong>{tournament.edition ? `${tournament.edition}º ` : ''}{tournament.name}</strong>
          <br />
          <span>{tournament.participants.length} participantes</span>
          <br />
          <span>
            {tournament.phaseType === 'TWO_PHASE' && tournament.groupStage
              ? `Fase de Grupos: ${tournament.groupStage.type === 'ROUND_ROBIN' ? 'Round Robin' : 'Suizo'}`
              : 'Eliminación Directa'}
          </span>
        </div>
        <p class="info-text">
          {tournament.phaseType === 'TWO_PHASE'
            ? 'Se generará el calendario de la fase de grupos y se calcularán las posiciones esperadas según ELO.'
            : 'Se generará el bracket de eliminación directa con los participantes registrados.'}
        </p>
        <div class="confirm-actions">
          <button class="cancel-btn" on:click={closeStartModal}>Cancelar</button>
          <button class="confirm-btn" on:click={startTournament}>Iniciar Torneo</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Cancel Confirmation Modal -->
  {#if showCancelConfirm && tournament}
    <div class="modal-backdrop" data-theme={$adminTheme} on:click={closeCancelModal} role="button" tabindex="0" on:keydown={(e) => e.key === 'Escape' && closeCancelModal()}>
      <div class="confirm-modal" on:click|stopPropagation role="dialog" aria-modal="true">
        <h2>Confirmar Cancelación</h2>
        <p>¿Estás seguro de que deseas cancelar este torneo?</p>
        <div class="tournament-info">
          <strong>{tournament.edition ? `${tournament.edition}º ` : ''}{tournament.name}</strong>
          <br />
          <span>{tournament.participants.length} participantes</span>
        </div>
        <p class="warning-text">
          El torneo quedará marcado como cancelado y no se podrá reactivar.
        </p>
        <div class="confirm-actions">
          <button class="cancel-btn" on:click={closeCancelModal}>Volver</button>
          <button class="delete-btn-confirm" on:click={cancelTournament}>Cancelar Torneo</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Quick Edit Modal -->
  {#if showQuickEdit && tournament}
    <div class="modal-backdrop" data-theme={$adminTheme} on:click={closeQuickEdit} role="button" tabindex="0" on:keydown={(e) => e.key === 'Escape' && closeQuickEdit()}>
      <div class="quick-edit-modal" on:click|stopPropagation role="dialog" aria-modal="true">
        <div class="quick-edit-header">
          <h2>⚙️ Ajustes del Torneo</h2>
          <button class="close-btn" on:click={closeQuickEdit}>×</button>
        </div>

        <p class="quick-edit-subtitle">Configuración modificable durante el torneo</p>

        <div class="quick-edit-form">
          <!-- Basic Info Section -->
          <div class="form-section">
            <h3>📋 Información Básica</h3>

            <div class="form-group">
              <label for="edit-name">Nombre del Torneo</label>
              <input
                type="text"
                id="edit-name"
                bind:value={editName}
                placeholder="Nombre del torneo"
              />
            </div>

            <div class="form-group">
              <label for="edit-date">Fecha</label>
              <input
                type="date"
                id="edit-date"
                bind:value={editDate}
              />
            </div>

            <div class="form-group">
              <label for="edit-tables">Mesas Disponibles</label>
              <div class="input-with-hint">
                <input
                  type="number"
                  id="edit-tables"
                  bind:value={editNumTables}
                  min={getMinTables()}
                  max="50"
                />
                <span class="hint">Mínimo: {getMinTables()} ({tournament.participants.length} participantes)</span>
              </div>
            </div>
          </div>

          <!-- Game Options Section -->
          <div class="form-section">
            <h3>🎮 Opciones de Partida</h3>

            <div class="toggle-group">
              <label class="toggle-item">
                <input type="checkbox" bind:checked={editShow20s} />
                <span class="toggle-label">
                  <span class="toggle-icon">🎯</span>
                  Contar 20s
                </span>
              </label>

              <label class="toggle-item">
                <input type="checkbox" bind:checked={editShowHammer} />
                <span class="toggle-label">
                  <span class="toggle-icon">🔨</span>
                  Mostrar Hammer
                </span>
              </label>
            </div>
          </div>

          <!-- ELO Section -->
          <div class="form-section">
            <h3>📊 Sistema ELO</h3>

            <label class="toggle-item elo-toggle">
              <input type="checkbox" bind:checked={editEloEnabled} />
              <span class="toggle-label">
                <span class="toggle-icon">📈</span>
                Sistema ELO Activado
              </span>
            </label>

            {#if editEloEnabled}
              <div class="elo-params">
                <div class="form-group inline">
                  <label for="edit-kfactor">Factor K</label>
                  <input
                    type="number"
                    id="edit-kfactor"
                    bind:value={editEloKFactor}
                    min="0.5"
                    max="10"
                    step="0.5"
                  />
                </div>

                <div class="form-group inline">
                  <label for="edit-maxdelta">Delta Máximo (±)</label>
                  <input
                    type="number"
                    id="edit-maxdelta"
                    bind:value={editEloMaxDelta}
                    min="5"
                    max="100"
                    step="5"
                  />
                </div>
              </div>
            {/if}
          </div>
        </div>

        <div class="quick-edit-actions">
          <button class="cancel-btn" on:click={closeQuickEdit}>Cancelar</button>
          <button
            class="confirm-btn"
            on:click={saveQuickEdit}
            disabled={isSavingQuickEdit || !editName.trim()}
          >
            {isSavingQuickEdit ? '⏳ Guardando...' : '💾 Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} />

<style>
  .tournament-page {
    min-height: 100vh;
    max-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tournament-page[data-theme='dark'] {
    background: #0f1419;
  }

  /* Header */
  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 1.5rem 2rem;
    transition: background-color 0.3s, border-color 0.3s;
    flex-shrink: 0;
  }

  .tournament-page[data-theme='dark'] .page-header {
    background: #1a2332;
    border-color: #2d3748;
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
  }

  .tournament-page[data-theme='dark'] .back-button {
    background: #0f1419;
    color: #8b9bb3;
    border-color: #2d3748;
  }

  .back-button:hover {
    transform: translateX(-3px);
  }

  .tournament-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
  }

  .header-content {
    flex: 1;
  }

  .header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .header-action-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .header-action-btn.start,
  .header-action-btn.primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .header-action-btn.start:hover:not(:disabled),
  .header-action-btn.primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .header-action-btn.start:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .header-action-btn.edit {
    background: #f3f4f6;
    color: #1a1a1a;
  }

  .tournament-page[data-theme='dark'] .header-action-btn.edit {
    background: #0f1419;
    color: #e1e8ed;
  }

  .header-action-btn.edit:hover {
    background: #e5e7eb;
  }

  .tournament-page[data-theme='dark'] .header-action-btn.edit:hover {
    background: #2d3748;
  }

  .header-action-btn.danger {
    background: #fee2e2;
    color: #dc2626;
  }

  .header-action-btn.danger:hover {
    background: #fecaca;
  }

  .title-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .header-content h1 {
    font-size: 1.6rem;
    margin: 0;
    color: #1a1a1a;
    font-weight: 700;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .header-content h1 {
    color: #e1e8ed;
  }

  .tournament-date {
    font-size: 0.9rem;
    color: #999;
    font-weight: 400;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .tournament-date {
    color: #6b7a94;
  }

  .location {
    font-size: 0.95rem;
    color: #888;
    margin: 0.25rem 0 0.5rem 0;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .location {
    color: #6b7a94;
  }

  .description {
    font-size: 1rem;
    color: #666;
    margin: 0 0 1rem 0;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .description {
    color: #8b9bb3;
  }

  .tournament-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 1rem;
  }

  .meta-item {
    font-size: 0.9rem;
    color: #666;
    padding: 0.4rem 0.8rem;
    background: #f3f4f6;
    border-radius: 6px;
    transition: all 0.3s;
  }

  .tournament-page[data-theme='dark'] .meta-item {
    background: #0f1419;
    color: #8b9bb3;
  }

  .status-badge {
    padding: 0.6rem 1.2rem;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  /* Content */
  .page-content {
    width: 100%;
    padding: 1.5rem;
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #e5e7eb;
    border-top-color: #fa709a;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .error-state h3 {
    color: #1a1a1a;
    margin-bottom: 0.5rem;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .error-state h3 {
    color: #e1e8ed;
  }

  .error-state p {
    color: #666;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .error-state p {
    color: #8b9bb3;
  }

  .primary-button {
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
  }

  .primary-button:hover {
    transform: translateY(-2px);
  }

  /* Dashboard Grid */
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }

  /* Make results card span full width */
  .results-card {
    grid-column: 1 / -1;
  }

  .dashboard-card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    transition: background-color 0.3s, box-shadow 0.3s;
  }

  .tournament-page[data-theme='dark'] .dashboard-card {
    background: #1a2332;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .dashboard-card h2 {
    font-size: 1.3rem;
    margin: 0 0 1rem 0;
    color: #1a1a1a;
    font-weight: 600;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .dashboard-card h2 {
    color: #e1e8ed;
  }

  /* Configuration */
  .config-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .config-item {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem;
    background: #f9fafb;
    border-radius: 8px;
    transition: background-color 0.3s;
  }

  .tournament-page[data-theme='dark'] .config-item {
    background: #0f1419;
  }

  .config-label {
    color: #666;
    font-weight: 500;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .config-label {
    color: #8b9bb3;
  }

  .config-value {
    color: #1a1a1a;
    font-weight: 600;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .config-value {
    color: #e1e8ed;
  }

  /* Final Stage Card */
  .final-stage-card .config-item.highlight {
    background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
    border: 1px solid #c7d2fe;
  }

  .tournament-page[data-theme='dark'] .final-stage-card .config-item.highlight {
    background: linear-gradient(135deg, #1e293b 0%, #1a2744 100%);
    border: 1px solid #3b4a6b;
  }

  .bracket-configs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1rem;
  }

  .bracket-config {
    padding: 1rem;
    border-radius: 10px;
    border: 2px solid;
  }

  .bracket-config.gold {
    background: linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%);
    border-color: #fbbf24;
  }

  .tournament-page[data-theme='dark'] .bracket-config.gold {
    background: linear-gradient(135deg, #422006 0%, #451a03 100%);
    border-color: #b45309;
  }

  .bracket-config.silver {
    background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
    border-color: #94a3b8;
  }

  .tournament-page[data-theme='dark'] .bracket-config.silver {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    border-color: #64748b;
  }

  .bracket-config h3 {
    font-size: 1rem;
    margin: 0 0 0.75rem 0;
    color: #1a1a1a;
    font-weight: 600;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .bracket-config h3 {
    color: #e1e8ed;
  }

  .bracket-config .config-list {
    gap: 0.5rem;
  }

  .bracket-config .config-item {
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.6);
    font-size: 0.9rem;
  }

  .tournament-page[data-theme='dark'] .bracket-config .config-item {
    background: rgba(0, 0, 0, 0.2);
  }

  .bracket-config .config-label,
  .bracket-config .config-value {
    font-size: 0.85rem;
  }

  /* Responsive */
  @media (max-width: 600px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }

    .tournament-header {
      flex-direction: column;
    }

    .header-right {
      width: 100%;
      align-items: flex-start;
    }

    .header-actions {
      width: 100%;
      flex-wrap: wrap;
    }

    .header-action-btn {
      flex: 1;
      min-width: 100px;
    }

    .status-badge {
      align-self: flex-start;
    }

    .bracket-configs {
      grid-template-columns: 1fr;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .page-header {
      padding: 0.75rem 1rem;
    }

    .header-top {
      margin-bottom: 0.75rem;
    }

    .back-button {
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
    }

    .header-content h1 {
      font-size: 1.3rem;
      margin-bottom: 0.25rem;
    }

    .description {
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .tournament-meta {
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .meta-item {
      font-size: 0.75rem;
      padding: 0.3rem 0.6rem;
    }

    .status-badge {
      padding: 0.4rem 0.8rem;
      font-size: 0.75rem;
    }

    .page-content {
      padding: 1rem;
    }

    .dashboard-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .dashboard-card {
      padding: 1rem;
    }

    .dashboard-card h2 {
      font-size: 1.1rem;
      margin-bottom: 0.75rem;
    }

    .config-item {
      padding: 0.5rem;
    }

    .config-label,
    .config-value {
      font-size: 0.85rem;
    }

    .header-action-btn {
      padding: 0.4rem 0.75rem;
      font-size: 0.75rem;
    }

    .loading-state,
    .error-state {
      min-height: 200px;
      padding: 1rem;
    }

    .error-icon {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }

    .error-state h3 {
      font-size: 1.1rem;
      margin-bottom: 0.25rem;
    }

    .error-state p {
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }

    .primary-button {
      padding: 0.6rem 1.5rem;
      font-size: 0.85rem;
    }

    .bracket-configs {
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .bracket-config {
      padding: 0.75rem;
    }

    .bracket-config h3 {
      font-size: 0.9rem;
      margin-bottom: 0.5rem;
    }

    .bracket-config .config-item {
      padding: 0.4rem 0.5rem;
    }

    .bracket-config .config-label,
    .bracket-config .config-value {
      font-size: 0.75rem;
    }
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
    margin-bottom: 1rem;
    transition: color 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .confirm-modal p {
    color: #8b9bb3;
  }

  .tournament-info {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
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

  .warning-text {
    color: #dc2626 !important;
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 1.5rem;
  }

  .info-text {
    color: #666;
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
    line-height: 1.5;
    transition: color 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .info-text {
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

  .confirm-btn {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .confirm-btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Quick Edit Modal */
  .quick-edit-modal {
    background: white;
    border-radius: 16px;
    padding: 0;
    max-width: 500px;
    width: 95%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    transition: all 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .quick-edit-modal {
    background: #1a2332;
  }

  .quick-edit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    background: white;
    border-radius: 16px 16px 0 0;
    z-index: 1;
  }

  .modal-backdrop[data-theme='dark'] .quick-edit-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  .quick-edit-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #1a1a1a;
  }

  .modal-backdrop[data-theme='dark'] .quick-edit-header h2 {
    color: #e1e8ed;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: #f3f4f6;
    border-radius: 8px;
    font-size: 1.5rem;
    line-height: 1;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-backdrop[data-theme='dark'] .close-btn {
    background: #0f1419;
    color: #8b9bb3;
  }

  .close-btn:hover {
    background: #e5e7eb;
    color: #1a1a1a;
  }

  .modal-backdrop[data-theme='dark'] .close-btn:hover {
    background: #2d3748;
    color: #e1e8ed;
  }

  .quick-edit-subtitle {
    padding: 0 1.5rem;
    margin: 0.75rem 0 0 0;
    font-size: 0.85rem;
    color: #888;
  }

  .modal-backdrop[data-theme='dark'] .quick-edit-subtitle {
    color: #6b7a94;
  }

  .quick-edit-form {
    padding: 1rem 1.5rem;
  }

  .form-section {
    margin-bottom: 1.5rem;
  }

  .form-section:last-child {
    margin-bottom: 0;
  }

  .form-section h3 {
    font-size: 0.9rem;
    font-weight: 600;
    color: #666;
    margin: 0 0 0.75rem 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .modal-backdrop[data-theme='dark'] .form-section h3 {
    color: #8b9bb3;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    color: #555;
    margin-bottom: 0.4rem;
  }

  .modal-backdrop[data-theme='dark'] .form-group label {
    color: #8b9bb3;
  }

  .form-group input[type="text"],
  .form-group input[type="date"],
  .form-group input[type="number"] {
    width: 100%;
    padding: 0.65rem 0.85rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 0.95rem;
    color: #1a1a1a;
    background: #f9fafb;
    transition: all 0.2s;
  }

  .modal-backdrop[data-theme='dark'] .form-group input[type="text"],
  .modal-backdrop[data-theme='dark'] .form-group input[type="date"],
  .modal-backdrop[data-theme='dark'] .form-group input[type="number"] {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .form-group input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
  }

  .input-with-hint {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .input-with-hint input {
    width: auto;
  }

  .hint {
    font-size: 0.75rem;
    color: #888;
  }

  .modal-backdrop[data-theme='dark'] .hint {
    color: #6b7a94;
  }

  /* Toggle items */
  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toggle-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #f9fafb;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modal-backdrop[data-theme='dark'] .toggle-item {
    background: #0f1419;
  }

  .toggle-item:hover {
    background: #f3f4f6;
  }

  .modal-backdrop[data-theme='dark'] .toggle-item:hover {
    background: #1e293b;
  }

  .toggle-item input[type="checkbox"] {
    width: 20px;
    height: 20px;
    accent-color: #667eea;
    cursor: pointer;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    color: #1a1a1a;
  }

  .modal-backdrop[data-theme='dark'] .toggle-label {
    color: #e1e8ed;
  }

  .toggle-icon {
    font-size: 1.1rem;
  }

  .elo-toggle {
    margin-bottom: 0.75rem;
  }

  .elo-params {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding: 1rem;
    background: #f0f4ff;
    border-radius: 10px;
    border: 1px solid #c7d2fe;
  }

  .modal-backdrop[data-theme='dark'] .elo-params {
    background: #1e293b;
    border-color: #3b4a6b;
  }

  .form-group.inline {
    margin-bottom: 0;
  }

  .form-group.inline label {
    font-size: 0.8rem;
    margin-bottom: 0.3rem;
  }

  .form-group.inline input {
    padding: 0.5rem 0.65rem;
    font-size: 0.9rem;
  }

  /* Quick Edit Actions */
  .quick-edit-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
    border-radius: 0 0 16px 16px;
    position: sticky;
    bottom: 0;
  }

  .modal-backdrop[data-theme='dark'] .quick-edit-actions {
    background: #0f1419;
    border-color: #2d3748;
  }

  /* Responsive for quick edit modal */
  @media (max-width: 600px) {
    .quick-edit-modal {
      width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .quick-edit-header {
      border-radius: 0;
    }

    .quick-edit-actions {
      border-radius: 0;
    }

    .elo-params {
      grid-template-columns: 1fr;
    }
  }
</style>
