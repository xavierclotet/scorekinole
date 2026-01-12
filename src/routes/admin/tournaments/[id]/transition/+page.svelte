<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import QualifierSelection from '$lib/components/tournament/QualifierSelection.svelte';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { getTournament } from '$lib/firebase/tournaments';
  import { transitionTournament } from '$lib/utils/tournamentStateMachine';
  import {
    updateQualifiers,
    autoSelectQualifiers,
    getQualifiedParticipants,
    isValidBracketSize,
    getBracketRoundNames
  } from '$lib/firebase/tournamentTransition';
  import { generateBracket } from '$lib/firebase/tournamentBracket';
  import { updateTournament } from '$lib/firebase/tournaments';
  import type { Tournament } from '$lib/types/tournament';

  let tournament: Tournament | null = null;
  let loading = true;
  let error = false;
  let showToast = false;
  let toastMessage = '';
  let isProcessing = false;
  let showBracketPreview = false;

  // Qualifier selections per group
  let groupQualifiers: Map<number, string[]> = new Map();

  // Final stage configuration (always points mode for final stage)
  let finalPointsToWin: number = 7;
  let finalMatchesToWin: number = 1;

  $: tournamentId = $page.params.id;
  $: totalQualifiers = Array.from(groupQualifiers.values()).flat().length;
  $: isValidSize = isValidBracketSize(totalQualifiers);
  $: canProceed = totalQualifiers >= 2 && isValidSize;
  $: bracketRoundNames = totalQualifiers > 0 ? getBracketRoundNames(totalQualifiers) : [];

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
      } else if (tournament.status !== 'TRANSITION') {
        // Redirect if not in transition
        toastMessage = '⚠️ El torneo no está en fase de transición';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}`), 1500);
      } else {
        // Initialize group qualifiers from current state
        // Ensure groups is an array (Firestore may return object)
        const groups = Array.isArray(tournament.groupStage?.groups)
          ? tournament.groupStage.groups
          : Object.values(tournament.groupStage?.groups || {});

        groups.forEach((group, index) => {
          const qualified = group.standings
            .filter(s => s.qualifiedForFinal)
            .map(s => s.participantId);
          groupQualifiers.set(index, qualified);
        });
        groupQualifiers = groupQualifiers; // Trigger reactivity

        // Load final stage config from tournament if it exists
        if (tournament.finalStageConfig) {
          finalPointsToWin = tournament.finalStageConfig.pointsToWin || 7;
          finalMatchesToWin = tournament.finalStageConfig.matchesToWin || 1;
        } else {
          // Default values
          finalPointsToWin = 7;
          finalMatchesToWin = 1;
        }
      }
    } catch (err) {
      console.error('Error loading tournament:', err);
      error = true;
    } finally {
      loading = false;
    }
  }

  function handleQualifierUpdate(groupIndex: number, qualifiedIds: string[]) {
    groupQualifiers.set(groupIndex, qualifiedIds);
    groupQualifiers = groupQualifiers; // Trigger reactivity
  }

  async function handleGenerateBracket() {
    if (!tournamentId || !tournament || !canProceed) return;

    isProcessing = true;

    try {
      // First save qualifiers
      for (const [groupIndex, qualifiedIds] of groupQualifiers.entries()) {
        await updateQualifiers(tournamentId, groupIndex, qualifiedIds);
      }

      // Generate bracket with custom config (final stage is always points mode)
      const bracketSuccess = await generateBracket(tournamentId, {
        gameMode: 'points',
        pointsToWin: finalPointsToWin,
        matchesToWin: finalMatchesToWin
      });

      if (!bracketSuccess) {
        toastMessage = '❌ Error al generar bracket';
        showToast = true;
        return;
      }

      // Update status to FINAL_STAGE
      const success = await updateTournament(tournamentId, {
        status: 'FINAL_STAGE'
      });

      if (success) {
        toastMessage = '✅ Bracket generado. Avanzando a fase final...';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}/bracket`), 1500);
      } else {
        toastMessage = '❌ Error al avanzar a fase final';
        showToast = true;
      }
    } catch (err) {
      console.error('Error generating bracket:', err);
      toastMessage = '❌ Error al generar bracket';
      showToast = true;
    } finally {
      isProcessing = false;
    }
  }

  async function loadBracketPreview() {
    if (!tournamentId) return;

    try {
      const qualified = await getQualifiedParticipants(tournamentId);
      console.log('Qualified participants:', qualified);
      showBracketPreview = true;
    } catch (err) {
      console.error('Error loading bracket preview:', err);
    }
  }

  $: if (totalQualifiers > 0) {
    loadBracketPreview();
  }
</script>

<AdminGuard>
  <div class="transition-page" data-theme={$adminTheme}>
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
            <p class="subtitle">Selección de Clasificados para Fase Final</p>
          </div>
        </div>
      {/if}
    </header>

    <!-- Content -->
    <div class="page-content">
      {#if loading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Cargando fase de transición...</p>
        </div>
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Error al cargar</h3>
          <p>No se pudo cargar la fase de transición del torneo.</p>
          <button class="primary-button" on:click={() => goto('/admin/tournaments')}>
            Volver a Torneos
          </button>
        </div>
      {:else}
        <!-- Final stage configuration -->
        <div class="config-section">
          <div class="config-card">
            <h3>🏆 Configuración de Fase Final (Eliminación)</h3>
            <p class="help-text" style="margin-bottom: 1.5rem; color: #6b7280;">
              La fase final siempre será por puntos. Configura los valores por defecto (podrás ajustarlos más adelante según la ronda: semifinales, final, etc).
            </p>
            <div class="config-grid">
              <!-- Points to win -->
              <div class="config-field">
                <label for="pointsToWin">Puntos para ganar:</label>
                <input
                  id="pointsToWin"
                  type="number"
                  bind:value={finalPointsToWin}
                  min="1"
                  max="15"
                  class="number-input"
                />
              </div>

              <!-- Matches to win -->
              <div class="config-field">
                <label for="matchesToWin">Best of:</label>
                <select id="matchesToWin" bind:value={finalMatchesToWin} class="select-input">
                  <option value={1}>1 (sin revancha)</option>
                  <option value={3}>3 (gana a 2)</option>
                  <option value={5}>5 (gana a 3)</option>
                  <option value={7}>7 (gana a 4)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Qualifier selections per group -->
        <div class="groups-section">
          <div class="groups-grid">
            {#if tournament.groupStage}
              {#each tournament.groupStage.groups as group, index}
                <QualifierSelection
                  {tournament}
                  groupIndex={index}
                  on:update={(e) => handleQualifierUpdate(index, e.detail)}
                />
              {/each}
            {/if}
          </div>
        </div>

        <!-- Summary and validation -->
        <div class="summary-section">
          <div class="summary-card">
            <h3>Resumen</h3>
            <div class="summary-stats">
              <div class="stat-item">
                <span class="stat-label">Total clasificados:</span>
                <span class="stat-value">{totalQualifiers}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Tamaño del bracket:</span>
                <span class="stat-value" class:valid={isValidSize} class:invalid={!isValidSize}>
                  {#if isValidSize}
                    ✅ {totalQualifiers} participantes
                  {:else}
                    ❌ Debe ser potencia de 2 (2, 4, 8, 16, 32)
                  {/if}
                </span>
              </div>
              {#if isValidSize && totalQualifiers > 0}
                <div class="stat-item">
                  <span class="stat-label">Rondas del bracket:</span>
                  <span class="stat-value">{bracketRoundNames.join(' → ')}</span>
                </div>
              {/if}
            </div>

            {#if !isValidSize && totalQualifiers > 0}
              <div class="validation-error">
                ⚠️ El número de clasificados debe ser una potencia de 2 para generar el bracket.
                <br />
                Selecciona 2, 4, 8, 16 o 32 participantes.
              </div>
            {/if}
          </div>
        </div>

        <!-- Action buttons -->
        <div class="actions-section">
          <button
            class="action-btn generate"
            on:click={handleGenerateBracket}
            disabled={isProcessing || !canProceed}
          >
            {isProcessing ? '⏳ Generando bracket...' : '🏆 Generar Bracket y Avanzar'}
          </button>
        </div>
      {/if}
    </div>
  </div>
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} />

<style>
  .transition-page {
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .transition-page[data-theme='dark'] {
    background: #0f1419;
  }

  /* Header */
  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 1.5rem 2rem;
    transition: background-color 0.3s, border-color 0.3s;
  }

  .transition-page[data-theme='dark'] .page-header {
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

  .transition-page[data-theme='dark'] .back-button {
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
  }

  .header-content h1 {
    font-size: 1.3rem;
    margin: 0 0 0.3rem 0;
    color: #1a1a1a;
    font-weight: 700;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .header-content h1 {
    color: #e1e8ed;
  }

  .subtitle {
    font-size: 0.85rem;
    color: #666;
    margin: 0;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .subtitle {
    color: #8b9bb3;
  }

  /* Content */
  .page-content {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    max-height: calc(100vh - 200px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Scrollbar styling - Green theme */
  .page-content::-webkit-scrollbar {
    width: 10px;
  }

  .page-content::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 5px;
  }

  .page-content::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 5px;
  }

  .page-content::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
  }

  .transition-page[data-theme='dark'] .page-content::-webkit-scrollbar-track {
    background: #0f1419;
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

  .transition-page[data-theme='dark'] .error-state h3 {
    color: #e1e8ed;
  }

  .error-state p {
    color: #666;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .error-state p {
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

  /* Sections */
  .groups-section,
  .config-section,
  .summary-section,
  .actions-section {
    margin-bottom: 2rem;
  }

  .config-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .config-card h3 {
    margin: 0 0 1.5rem 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #1a1a1a;
  }

  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .config-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .config-field label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .radio-group {
    display: flex;
    gap: 1rem;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.9rem;
    color: #6b7280;
  }

  .radio-option input[type="radio"] {
    cursor: pointer;
  }

  .radio-option:has(input:checked) span {
    color: #1a1a1a;
    font-weight: 600;
  }

  .number-input,
  .select-input {
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.95rem;
    color: #1a1a1a;
    background: white;
    transition: all 0.2s;
  }

  .number-input:focus,
  .select-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  /* Dark mode for config section */
  :global([data-theme='dark']) .config-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .config-card h3 {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .config-field label {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .radio-option {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .radio-option:has(input:checked) span {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .number-input,
  :global([data-theme='dark']) .select-input {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .number-input:focus,
  :global([data-theme='dark']) .select-input:focus {
    border-color: #667eea;
  }

  .groups-section {
    min-height: 200px;
  }

  .groups-section h2 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 1rem 0;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .groups-section h2 {
    color: #e1e8ed;
  }

  .groups-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1.5rem;
  }

  .summary-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 1.5rem;
    transition: all 0.3s;
  }

  .transition-page[data-theme='dark'] .summary-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  .summary-card h3 {
    font-size: 1.2rem;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 1rem 0;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .summary-card h3 {
    color: #e1e8ed;
  }

  .summary-stats {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: #f9fafb;
    border-radius: 8px;
    transition: background-color 0.3s;
  }

  .transition-page[data-theme='dark'] .stat-item {
    background: #0f1419;
  }

  .stat-label {
    font-size: 0.9rem;
    color: #6b7280;
    font-weight: 600;
  }

  .stat-value {
    font-size: 1rem;
    color: #1a1a1a;
    font-weight: 700;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .stat-value {
    color: #e1e8ed;
  }

  .stat-value.valid {
    color: #10b981;
  }

  .stat-value.invalid {
    color: #ef4444;
  }

  .validation-error {
    margin-top: 1rem;
    padding: 1rem;
    background: #fee;
    color: #c00;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.5;
  }

  .actions-section {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .action-btn {
    padding: 1rem 2rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn.generate {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .action-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .page-content {
      padding: 1rem;
    }

    .groups-grid {
      grid-template-columns: 1fr;
    }

    .actions-section {
      flex-direction: column;
    }

    .action-btn {
      width: 100%;
    }
  }
</style>
