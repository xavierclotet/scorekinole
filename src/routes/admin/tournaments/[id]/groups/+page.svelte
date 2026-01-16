<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import GroupsView from '$lib/components/tournament/GroupsView.svelte';
  import MatchResultDialog from '$lib/components/tournament/MatchResultDialog.svelte';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { getTournament } from '$lib/firebase/tournaments';
  import { transitionTournament } from '$lib/utils/tournamentStateMachine';
  import { updateMatchResult, markNoShow } from '$lib/firebase/tournamentMatches';
  import { isSuperAdmin } from '$lib/firebase/admin';
  import type { Tournament, GroupMatch } from '$lib/types/tournament';

  let tournament: Tournament | null = null;
  let loading = true;
  let error = false;
  let showToast = false;
  let toastMessage = '';
  let showCompleteConfirm = false;
  let isTransitioning = false;
  let showMatchDialog = false;
  let selectedMatch: GroupMatch | null = null;
  let activeGroupId: string | null = null;
  let isSuperAdminUser = false;
  let isAutoFilling = false;

  $: tournamentId = $page.params.id;

  onMount(async () => {
    await loadTournament();
    isSuperAdminUser = await isSuperAdmin();
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
      } else if (tournament.status !== 'GROUP_STAGE') {
        // Redirect if not in group stage
        toastMessage = '⚠️ El torneo no está en fase de grupos';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}`), 1500);
      }
    } catch (err) {
      console.error('Error loading tournament:', err);
      error = true;
    } finally {
      loading = false;
    }
  }

  function handleMatchClick(match: GroupMatch) {
    // Allow editing both pending and completed matches
    if (match.participantB === 'BYE') {
      toastMessage = '⚠️ No se puede editar un partido BYE';
      showToast = true;
      return;
    }

    selectedMatch = match;
    // Track which group this match belongs to
    if (match.groupId) {
      activeGroupId = match.groupId;
    }
    showMatchDialog = true;
  }

  async function handleSaveResult(event: CustomEvent) {
    if (!selectedMatch || !tournamentId) return;

    const result = event.detail;
    const success = await updateMatchResult(tournamentId, selectedMatch.id, result);

    if (success) {
      toastMessage = '✅ Resultado guardado correctamente';
      showToast = true;
      showMatchDialog = false;
      selectedMatch = null;
      await loadTournament(); // Reload to show updated standings
    } else {
      toastMessage = '❌ Error al guardar el resultado';
      showToast = true;
    }
  }

  async function handleNoShow(event: CustomEvent) {
    if (!selectedMatch || !tournamentId) return;

    const noShowParticipantId = event.detail;
    const success = await markNoShow(tournamentId, selectedMatch.id, noShowParticipantId);

    if (success) {
      toastMessage = '✅ No-show registrado correctamente';
      showToast = true;
      showMatchDialog = false;
      selectedMatch = null;
      await loadTournament(); // Reload to show updated standings
    } else {
      toastMessage = '❌ Error al registrar no-show';
      showToast = true;
    }
  }

  function handleCloseDialog() {
    showMatchDialog = false;
    selectedMatch = null;
  }

  /**
   * Auto-fill all pending matches with random results (SuperAdmin only)
   */
  async function autoFillAllMatches() {
    if (!tournament || !tournament.groupStage || !tournamentId) return;

    isAutoFilling = true;
    let filledCount = 0;

    try {
      const gameMode = tournament.groupStage.gameMode || 'rounds';
      const roundsToPlay = tournament.groupStage.roundsToPlay || 4;
      const pointsToWin = tournament.groupStage.pointsToWin || 7;
      const matchesToWin = tournament.groupStage.matchesToWin || 1;

      // Get all pending matches from all groups
      for (const group of tournament.groupStage.groups) {
        const matches = group.schedule
          ? group.schedule.flatMap(r => r.matches)
          : group.pairings
          ? group.pairings.flatMap(p => p.matches)
          : [];

        const pendingMatches = matches.filter(
          m => m.status === 'PENDING' && m.participantB !== 'BYE'
        );

        for (const match of pendingMatches) {
          // Generate random result based on game mode
          let result: {
            gamesWonA: number;
            gamesWonB: number;
            totalPointsA: number;
            totalPointsB: number;
            total20sA: number;
            total20sB: number;
          };

          if (gameMode === 'rounds') {
            // For rounds mode: distribute 2 points per round randomly
            let totalA = 0;
            let totalB = 0;
            let twentiesA = 0;
            let twentiesB = 0;

            for (let r = 0; r < roundsToPlay; r++) {
              // Randomly distribute 2 points (2-0, 1-1, 0-2)
              const distribution = Math.random();
              if (distribution < 0.4) {
                totalA += 2; // Team A wins round
                if (Math.random() < 0.15) twentiesA++;
              } else if (distribution < 0.8) {
                totalB += 2; // Team B wins round
                if (Math.random() < 0.15) twentiesB++;
              } else {
                totalA += 1; // Tie
                totalB += 1;
              }
            }

            // In rounds mode, winner is who has more points
            const winnerA = totalA > totalB ? 1 : 0;
            const winnerB = totalB > totalA ? 1 : 0;

            result = {
              gamesWonA: winnerA,
              gamesWonB: winnerB,
              totalPointsA: totalA,
              totalPointsB: totalB,
              total20sA: twentiesA,
              total20sB: twentiesB
            };
          } else {
            // For points mode: play until someone reaches pointsToWin
            let gamesA = 0;
            let gamesB = 0;
            let totalPointsA = 0;
            let totalPointsB = 0;
            let total20sA = 0;
            let total20sB = 0;

            const requiredWins = Math.ceil(matchesToWin / 2);

            while (gamesA < requiredWins && gamesB < requiredWins) {
              // Simulate a game
              let gamePointsA = 0;
              let gamePointsB = 0;

              while (gamePointsA < pointsToWin && gamePointsB < pointsToWin) {
                // Each round, distribute 2 points
                const distribution = Math.random();
                if (distribution < 0.45) {
                  gamePointsA += 2;
                  if (Math.random() < 0.1) total20sA++;
                } else if (distribution < 0.9) {
                  gamePointsB += 2;
                  if (Math.random() < 0.1) total20sB++;
                } else {
                  gamePointsA += 1;
                  gamePointsB += 1;
                }
              }

              totalPointsA += gamePointsA;
              totalPointsB += gamePointsB;

              if (gamePointsA > gamePointsB) {
                gamesA++;
              } else {
                gamesB++;
              }
            }

            result = {
              gamesWonA: gamesA,
              gamesWonB: gamesB,
              totalPointsA,
              totalPointsB,
              total20sA,
              total20sB
            };
          }

          // Save the result
          const success = await updateMatchResult(tournamentId, match.id, result);
          if (success) {
            filledCount++;
          }
        }
      }

      toastMessage = `✅ ${filledCount} partidos rellenados automáticamente`;
      showToast = true;
      await loadTournament(); // Reload to show updated results
    } catch (err) {
      console.error('Error auto-filling matches:', err);
      toastMessage = '❌ Error al rellenar partidos';
      showToast = true;
    } finally {
      isAutoFilling = false;
    }
  }

  function confirmCompleteGroups() {
    if (!tournament || !tournament.groupStage) return;

    // Check if all matches are complete
    let allComplete = true;
    for (const group of tournament.groupStage.groups) {
      const matches = group.schedule
        ? group.schedule.flatMap(r => r.matches)
        : group.pairings
        ? group.pairings.flatMap(p => p.matches)
        : [];

      const incompleteMatches = matches.filter(
        m => m.status !== 'COMPLETED' && m.status !== 'WALKOVER'
      );

      if (incompleteMatches.length > 0) {
        allComplete = false;
        toastMessage = `❌ ${group.name} tiene ${incompleteMatches.length} partidos pendientes`;
        showToast = true;
        return;
      }
    }

    if (allComplete) {
      showCompleteConfirm = true;
    }
  }

  function closeCompleteModal() {
    showCompleteConfirm = false;
  }

  async function completeGroupStage() {
    if (!tournamentId || !tournament) return;

    isTransitioning = true;
    closeCompleteModal();

    try {
      const success = await transitionTournament(tournamentId, 'TRANSITION');

      if (success) {
        toastMessage = '✅ Fase de grupos completada. Pasando a transición...';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}/transition`), 1500);
      } else {
        toastMessage = '❌ Error al completar la fase de grupos';
        showToast = true;
      }
    } catch (err) {
      console.error('Error completing group stage:', err);
      toastMessage = '❌ Error al completar la fase de grupos';
      showToast = true;
    } finally {
      isTransitioning = false;
    }
  }
</script>

<AdminGuard>
  <div class="groups-page" data-theme={$adminTheme}>
    <!-- Header -->
    <header class="page-header">
      <div class="header-top">
        <button class="back-button" on:click={() => goto(`/admin/tournaments/${tournamentId}`)}>
          ← Volver al Torneo
        </button>
        <div class="theme-toggle-wrapper">
          <ThemeToggle />
        </div>
      </div>

      {#if tournament}
        <div class="tournament-header">
          <div class="header-content">
            <h1>{tournament.name}</h1>
            <p class="subtitle">
              {tournament.groupStage?.type === 'ROUND_ROBIN' ? 'Round Robin' : 'Sistema Suizo'}
              {#if tournament.groupStage?.numGroups && tournament.groupStage.numGroups > 1}
                - {tournament.groupStage.numGroups} Grupos
              {/if}
            </p>
          </div>
          <div class="header-actions">
            {#if isSuperAdminUser}
              <button
                class="action-btn autofill"
                on:click={autoFillAllMatches}
                disabled={isAutoFilling}
                title="Solo visible para SuperAdmin - Rellenar partidos con resultados aleatorios"
              >
                {isAutoFilling ? '⏳ Rellenando...' : '🎲 Auto-rellenar'}
              </button>
            {/if}
            <button
              class="action-btn complete"
              on:click={confirmCompleteGroups}
              disabled={isTransitioning}
            >
              {isTransitioning ? '⏳ Completando...' : '✅ Completar Fase de Grupos'}
            </button>
          </div>
        </div>
      {/if}
    </header>

    <!-- Content -->
    <div class="page-content">
      {#if loading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Cargando fase de grupos...</p>
        </div>
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Error al cargar</h3>
          <p>No se pudo cargar la fase de grupos del torneo.</p>
          <button class="primary-button" on:click={() => goto('/admin/tournaments')}>
            Volver a Torneos
          </button>
        </div>
      {:else}
        <GroupsView {tournament} onMatchClick={handleMatchClick} {activeGroupId} />
      {/if}
    </div>
  </div>

  <!-- Complete Confirmation Modal -->
  {#if showCompleteConfirm && tournament}
    <div
      class="modal-backdrop"
      data-theme={$adminTheme}
      on:click={closeCompleteModal}
      on:keydown={(e) => e.key === 'Escape' && closeCompleteModal()}
      role="presentation"
    >
      <div class="confirm-modal" on:click|stopPropagation role="dialog" aria-modal="true">
        <h2>✅ Completar Fase de Grupos</h2>
        <p>¿Estás listo para finalizar la fase de grupos?</p>
        <div class="tournament-info">
          <strong>{tournament.name}</strong>
          <br />
          <span>Se calcularán las clasificaciones finales</span>
        </div>
        <p class="info-text">
          {#if tournament.phaseType === 'TWO_PHASE'}
            Después de completar, podrás seleccionar los clasificados para la fase final.
          {:else}
            El torneo pasará directamente a la fase final.
          {/if}
        </p>
        <div class="confirm-actions">
          <button class="cancel-btn" on:click={closeCompleteModal}>Cancelar</button>
          <button class="confirm-btn" on:click={completeGroupStage}>Completar</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Match Result Dialog -->
  {#if showMatchDialog && selectedMatch && tournament}
    <MatchResultDialog
      match={selectedMatch}
      participants={tournament.participants}
      tournament={tournament}
      visible={showMatchDialog}
      on:close={handleCloseDialog}
      on:save={handleSaveResult}
      on:noshow={handleNoShow}
    />
  {/if}
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} />

<style>
  .groups-page {
    min-height: 100vh;
    max-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .groups-page[data-theme='dark'] {
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

  .groups-page[data-theme='dark'] .page-header {
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

  .groups-page[data-theme='dark'] .back-button {
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
    align-items: center;
    gap: 2rem;
  }

  .header-content {
    flex: 1;
  }

  .header-content h1 {
    font-size: 1.6rem;
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
    font-weight: 700;
    transition: color 0.3s;
  }

  .groups-page[data-theme='dark'] .header-content h1 {
    color: #e1e8ed;
  }

  .subtitle {
    font-size: 1rem;
    color: #666;
    margin: 0;
    transition: color 0.3s;
  }

  .groups-page[data-theme='dark'] .subtitle {
    color: #8b9bb3;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .action-btn.complete {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .action-btn.complete:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .action-btn.complete:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn.autofill {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  .action-btn.autofill:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  }

  .action-btn.autofill:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Content */
  .page-content {
    width: 100%;
    padding: 2rem;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
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
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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

  .groups-page[data-theme='dark'] .error-state h3 {
    color: #e1e8ed;
  }

  .error-state p {
    color: #666;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .groups-page[data-theme='dark'] .error-state p {
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

  .confirm-btn {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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

  /* Responsive */
  @media (max-width: 768px) {
    .tournament-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-actions {
      width: 100%;
    }

    .action-btn {
      flex: 1;
    }

    .page-content {
      padding: 1rem;
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

    .subtitle {
      font-size: 0.85rem;
    }

    .action-btn {
      padding: 0.5rem 1rem;
      font-size: 0.8rem;
    }

    .page-content {
      padding: 1rem;
    }
  }
</style>
