<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import TournamentKeyBadge from '$lib/components/TournamentKeyBadge.svelte';
  import CompletedTournamentView from '$lib/components/tournament/CompletedTournamentView.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import { currentUser } from '$lib/firebase/auth';
  import { getTournament, cancelTournament as cancelTournamentFirebase, updateTournament } from '$lib/firebase/tournaments';
  import { transitionTournament } from '$lib/utils/tournamentStateMachine';
  import type { Tournament } from '$lib/types/tournament';
  import Toast from '$lib/components/Toast.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { formatDuration, calculateRemainingTime, calculateTournamentTimeEstimate, calculateTimeBreakdown, type TimeBreakdown } from '$lib/utils/tournamentTime';
  import TimeBreakdownModal from '$lib/components/TimeBreakdownModal.svelte';
  import TimeProgressBar from '$lib/components/TimeProgressBar.svelte';

  let tournament: Tournament | null = $state(null);
  let loading = $state(true);
  let error = $state(false);
  let showCancelConfirm = $state(false);
  let showStartConfirm = $state(false);
  let showQuickEdit = $state(false);
  let showTimeBreakdown = $state(false);
  let timeBreakdown: TimeBreakdown | null = $state(null);
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType: 'success' | 'error' | 'info' | 'warning' = $state('info');
  let isStarting = $state(false);
  let isSavingQuickEdit = $state(false);

  // Quick edit form fields
  let editName = $state('');
  let editDate = $state('');
  let editNumTables = $state(1);
  let editShow20s = $state(false);
  let editShowHammer = $state(false);
  let editRankingEnabled = $state(false);
  let editRankingTier = $state<'CLUB' | 'REGIONAL' | 'NATIONAL' | 'MAJOR'>('CLUB');
  let editConsolationEnabled = $state(false);

  let tournamentId = $derived($page.params.id);

  // Fallback for consolationEnabled - check multiple locations due to migration
  let consolationEnabled = $derived(tournament?.finalStage?.consolationEnabled
    ?? (tournament?.finalStage as Record<string, unknown>)?.['consolationEnabled']
    ?? tournament?.finalStage?.goldBracket?.config?.consolationEnabled
    ?? false);

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
      } else {
        // Check if tournament was created by another admin and is still active
        const isActive = !['COMPLETED', 'CANCELLED'].includes(tournament.status);
        if ($currentUser && tournament.createdBy?.userId !== $currentUser.id && isActive) {
          toastMessage = m.admin_notYourTournament();
          toastType = 'warning';
          showToast = true;
        }

        if (!tournament.timeEstimate) {
          // Calculate time estimate for existing tournaments that don't have it
          // Uses tournament.timeConfig if available, otherwise defaults
          const timeEstimate = calculateTournamentTimeEstimate(tournament);
          tournament.timeEstimate = timeEstimate;
          // Save the calculated estimate to Firebase
          await updateTournament(tournamentId, { timeEstimate });
        }
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
      DRAFT: m.admin_draft(),
      GROUP_STAGE: m.tournament_groupStage(),
      TRANSITION: m.admin_transition(),
      FINAL_STAGE: m.tournament_finalStage(),
      COMPLETED: m.admin_completed(),
      CANCELLED: m.admin_cancelled()
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

  function getStatusTextColor(status: string): string {
    const darkTextStatuses = ['TRANSITION', 'COMPLETED', 'FINAL_STAGE'];
    return darkTextStatuses.includes(status) ? '#1f2937' : 'white';
  }

  function confirmStart() {
    if (!tournament) return;

    // Validation: minimum 2 participants
    if (tournament.participants.length < 2) {
      toastMessage = m.admin_minParticipantsRequired();
      toastType = 'error';
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
        await loadTournament();
      } else {
        toastMessage = m.admin_errorStartingTournament();
        toastType = 'error';
        showToast = true;
      }
    } catch (err) {
      console.error('Error starting tournament:', err);
      toastMessage = m.admin_errorStartingTournament();
      toastType = 'error';
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
      toastMessage = m.admin_tournamentCancelled();
      toastType = 'success';
      showToast = true;
      await loadTournament();
    } else {
      toastMessage = m.admin_errorCancellingTournament();
      toastType = 'error';
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
    editRankingEnabled = tournament.rankingConfig?.enabled ?? true;
    editRankingTier = tournament.rankingConfig?.tier || 'CLUB';
    // Initialize consolation toggle from current tournament state
    editConsolationEnabled = Boolean(
      tournament.finalStage?.consolationEnabled ??
      (tournament.finalStage as Record<string, unknown>)?.['consolationEnabled '] ??
      tournament.finalStage?.goldBracket?.config?.consolationEnabled ??
      false
    );

    showQuickEdit = true;
  }

  function closeQuickEdit() {
    showQuickEdit = false;
  }

  function openTimeBreakdown() {
    if (!tournament) return;
    timeBreakdown = calculateTimeBreakdown(tournament);
    showTimeBreakdown = true;
  }

  async function recalculateTime() {
    if (!tournament || !tournamentId) return;
    const timeEstimate = calculateTournamentTimeEstimate(tournament);
    tournament.timeEstimate = timeEstimate;
    // Also update the breakdown if modal is open
    timeBreakdown = calculateTimeBreakdown(tournament);
    await updateTournament(tournamentId, { timeEstimate });
    toastMessage = m.admin_timeRecalculated();
    toastType = 'success';
    showToast = true;
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
      toastMessage = m.admin_minTablesRequired({ min: String(minTables) });
      toastType = 'error';
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
        rankingConfig: {
          enabled: editRankingEnabled,
          tier: editRankingTier
        }
      };

      // Update consolationEnabled in finalStage if it exists
      if (tournament.finalStage) {
        updates.finalStage = {
          ...tournament.finalStage,
          consolationEnabled: editConsolationEnabled
        };
      }

      const success = await updateTournament(tournamentId, updates);

      if (success) {
        toastMessage = m.admin_configurationUpdated();
        toastType = 'success';
        showToast = true;
        closeQuickEdit();
        await loadTournament();
      } else {
        toastMessage = m.admin_errorSavingChanges();
        toastType = 'error';
        showToast = true;
      }
    } catch (err) {
      console.error('Error saving quick edit:', err);
      toastMessage = m.admin_errorSavingChanges();
      toastType = 'error';
      showToast = true;
    } finally {
      isSavingQuickEdit = false;
    }
  }



  // Calculate remaining time reactively
  let timeRemaining = $derived(tournament ? calculateRemainingTime(tournament) : null);
</script>

<AdminGuard>
  <div class="tournament-page" data-theme={$adminTheme}>
    <!-- Header -->
    <header class="page-header">
      {#if tournament}
        <div class="header-row">
          <button class="back-btn" onclick={() => goto('/admin/tournaments')}>
            ←
          </button>

          <div class="header-main">
            <div class="title-section">
              <h1>{tournament.edition ? `#${tournament.edition} ` : ''}{tournament.name}</h1>
              <div class="header-badges">
                <span class="status-badge" style="background: {getStatusColor(tournament.status)}; color: {getStatusTextColor(tournament.status)}">
                  {getStatusText(tournament.status)}
                </span>
                <span class="info-badge participants-badge">
                  {tournament.participants.length} {m.admin_participants()}
                </span>
                {#if tournament.status !== 'COMPLETED' && tournament.status !== 'CANCELLED'}
                  <TournamentKeyBadge tournamentKey={tournament.key} compact={true} />
                {/if}
              </div>
              {#if timeRemaining && ['GROUP_STAGE', 'TRANSITION', 'FINAL_STAGE'].includes(tournament.status)}
                <div class="header-progress">
                  <TimeProgressBar
                    percentComplete={timeRemaining.percentComplete}
                    remainingMinutes={timeRemaining.remainingMinutes}
                    showEstimatedEnd={true}
                    compact={true}
                    clickable={true}
                    onclick={openTimeBreakdown}
                  />
                </div>
              {/if}
            </div>
          </div>

          <div class="header-actions">
            {#if tournament.status === 'DRAFT'}
              <button class="action-btn primary" onclick={confirmStart} disabled={isStarting}>
                {isStarting ? m.admin_starting() + '...' : m.admin_start()}
              </button>
              <button class="action-btn" onclick={() => goto(`/admin/tournaments/create?edit=${tournamentId}`)}>
                {m.admin_edit()}
              </button>
              <button class="action-btn danger" onclick={confirmCancel}>
                {m.common_cancel()}
              </button>
            {:else if tournament.status === 'GROUP_STAGE'}
              <button class="action-btn primary" onclick={() => goto(`/admin/tournaments/${tournamentId}/groups`)}>
                {m.admin_viewGroupStage()}
              </button>
              <button class="action-btn" onclick={openQuickEdit}>
                {m.admin_edit()}
              </button>
            {:else if tournament.status === 'TRANSITION'}
              <button class="action-btn primary" onclick={() => goto(`/admin/tournaments/${tournamentId}/transition`)}>
                {m.admin_selectQualified()}
              </button>
              <button class="action-btn" onclick={openQuickEdit}>
                {m.admin_edit()}
              </button>
            {:else if tournament.status === 'FINAL_STAGE'}
              <button class="action-btn primary" onclick={() => goto(`/admin/tournaments/${tournamentId}/bracket`)}>
                {m.admin_viewBracket()}
              </button>
              <button class="action-btn" onclick={openQuickEdit}>
                {m.admin_edit()}
              </button>
            {/if}
            <ThemeToggle />
          </div>
        </div>
      {:else}
        <div class="header-row">
          <button class="back-btn" onclick={() => goto('/admin/tournaments')}>
            ←
          </button>
          <div class="header-main">
            <h1>{m.admin_loadingTournament()}...</h1>
          </div>
          <div class="header-actions">
            <ThemeToggle />
          </div>
        </div>
      {/if}
    </header>

    <!-- Content -->
    <div class="page-content">
      {#if loading}
        <LoadingSpinner message={m.admin_loadingTournament()} />
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>{m.admin_tournamentNotFound()}</h3>
          <p>{m.admin_couldNotLoadTournament()}</p>
          <button class="primary-button" onclick={() => goto('/admin/tournaments')}>
            {m.admin_backToTournaments()}
          </button>
        </div>
      {:else}
        <!-- Tournament Dashboard Content -->
        <div class="dashboard-grid">
          <!-- Completed Tournament Results Section (at the top) -->
          {#if tournament.status === 'COMPLETED'}
            <section class="dashboard-card results-card">
              <h2>📋 {m.admin_tournamentResults()}</h2>
              <CompletedTournamentView {tournament} onupdated={loadTournament} />
            </section>
          {/if}

          <!-- General Configuration Section -->
          <section class="dashboard-card">
            <h2>{m.admin_generalConfiguration()}</h2>
            <div class="config-list">
              {#if tournament.tournamentDate}
                <div class="config-item">
                  <span class="config-label">{m.admin_dateLabel()}:</span>
                  <span class="config-value">
                    {new Date(tournament.tournamentDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              {/if}

              {#if tournament.city || tournament.country}
                <div class="config-item">
                  <span class="config-label">{m.admin_location()}:</span>
                  <span class="config-value">
                    {tournament.city}{tournament.city && tournament.country ? ', ' : ''}{tournament.country || ''}
                  </span>
                </div>
              {/if}

              <div class="config-item">
                <span class="config-label">{m.admin_format()}:</span>
                <span class="config-value">
                  {tournament.phaseType === 'ONE_PHASE' ? m.admin_onePhaseFormat() : m.admin_twoPhaseFormat()}
                </span>
              </div>

              <div class="config-item">
                <span class="config-label">{m.admin_modality()}:</span>
                <span class="config-value">
                  {tournament.gameType === 'singles' ? m.admin_singles() : m.admin_doubles()}
                </span>
              </div>

              <div class="config-item">
                <span class="config-label">{m.admin_availableTables()}:</span>
                <span class="config-value">{tournament.numTables}</span>
              </div>

              <div class="config-item">
                <span class="config-label">{m.admin_track20s()}:</span>
                <span class="config-value">{tournament.show20s ? m.admin_yes() : m.admin_no()}</span>
              </div>

              <div class="config-item">
                <span class="config-label">{m.admin_showHammer()}:</span>
                <span class="config-value">{tournament.showHammer ? m.admin_yes() : m.admin_no()}</span>
              </div>

              <div class="config-item">
                <span class="config-label">{m.admin_rankingSystem()}:</span>
                <span class="config-value">
                  {#if tournament.rankingConfig?.enabled}
                    {tournament.rankingConfig.tier === 'MAJOR' ? `${m.admin_tierMajor()} (Tier 1)` :
                        tournament.rankingConfig.tier === 'NATIONAL' ? `${m.admin_tierNational()} (Tier 2)` :
                        tournament.rankingConfig.tier === 'REGIONAL' ? `${m.admin_tierRegional()} (Tier 3)` : `${m.admin_tierClub()} (Tier 4)`}
                  {:else}
                    {m.admin_disabled()}
                  {/if}
                </span>
              </div>

              {#if tournament.timeEstimate?.totalMinutes}
                <div class="config-item">
                  <span class="config-label">{m.admin_estimatedDuration()}:</span>
                  <span class="config-value duration-value">
                    ~{formatDuration(tournament.timeEstimate.totalMinutes)}
                  </span>
                </div>
              {/if}

              <div class="config-item">
                <span class="config-label">{m.admin_createdBy()}:</span>
                <span class="config-value">{tournament.createdBy?.userName || '-'}</span>
              </div>
            </div>
          </section>

          <!-- Group Stage Configuration (only for TWO_PHASE) -->
          {#if tournament.phaseType === 'TWO_PHASE' && tournament.groupStage}
            <section class="dashboard-card">
              <h2>⚔️ {m.tournament_groupStage()}</h2>
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">{m.admin_system()}:</span>
                  <span class="config-value">
                    {tournament.groupStage.type === 'ROUND_ROBIN' ? 'Round Robin' : m.tournament_swissSystem()}
                  </span>
                </div>

                {#if tournament.groupStage.type === 'ROUND_ROBIN' && tournament.groupStage.numGroups}
                  <div class="config-item">
                    <span class="config-label">{m.admin_numberOfGroups()}:</span>
                    <span class="config-value">{tournament.groupStage.numGroups}</span>
                  </div>
                {:else if tournament.groupStage.type === 'SWISS' && tournament.groupStage.numSwissRounds}
                  <div class="config-item">
                    <span class="config-label">{m.admin_swissRounds()}:</span>
                    <span class="config-value">{tournament.groupStage.numSwissRounds}</span>
                  </div>
                {/if}

                <div class="config-item">
                  <span class="config-label">{m.admin_gameMode()}:</span>
                  <span class="config-value">
                    {tournament.groupStage.gameMode === 'points'
                      ? `${m.admin_byPoints()} (${tournament.groupStage.pointsToWin})`
                      : `${m.admin_byRounds()} (${tournament.groupStage.roundsToPlay})`}
                  </span>
                </div>

                <div class="config-item">
                  <span class="config-label">{m.admin_matchesToWinLabel()}:</span>
                  <span class="config-value">{tournament.groupStage.matchesToWin}</span>
                </div>
              </div>
            </section>
          {/if}

          <!-- Final Stage Configuration -->
          <section class="dashboard-card">
            <h2>🏆 {m.time_finalStage()}</h2>

            {#if tournament.finalStage}
              <!-- ONE_PHASE or active final stage: Show finalStage data -->
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">{m.admin_structure()}:</span>
                  <span class="config-value">
                    {tournament.finalStage.mode === 'SPLIT_DIVISIONS'
                      ? m.admin_goldSilverDivisions()
                      : m.admin_singleBracket()}
                  </span>
                </div>
                <div class="config-item">
                  <span class="config-label">{m.admin_consolationRounds()}:</span>
                  <span class="config-value">
                    {#if consolationEnabled}
                      <span class="consolation-badge enabled">
                        <svg class="badge-check" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                        {m.admin_enabled()}
                      </span>
                    {:else}
                      <span class="consolation-badge disabled">{m.admin_disabled()}</span>
                    {/if}
                  </span>
                </div>

                {#if tournament.finalStage.mode === 'SPLIT_DIVISIONS' && tournament.finalStage.goldBracket?.config}
                  {@const goldConfig = tournament.finalStage.goldBracket.config}
                  {@const silverConfig = tournament.finalStage.silverBracket?.config}
                  <!-- Gold Bracket Phases -->
                  <div class="config-item bracket-header">
                    <span class="config-label">🥇 {m.admin_goldBracket()}</span>
                  </div>
                  <div class="config-item phase-config">
                    <span class="config-label">{m.admin_earlyRounds()}:</span>
                    <span class="config-value">
                      {goldConfig.earlyRounds.gameMode === 'points'
                        ? `${goldConfig.earlyRounds.pointsToWin ?? 7}p`
                        : `${goldConfig.earlyRounds.roundsToPlay ?? 4}r`}
                    </span>
                  </div>
                  <div class="config-item phase-config">
                    <span class="config-label">{m.admin_semifinals()}:</span>
                    <span class="config-value">
                      {goldConfig.semifinal.gameMode === 'points'
                        ? `${goldConfig.semifinal.pointsToWin ?? 7}p`
                        : `${goldConfig.semifinal.roundsToPlay ?? 4}r`}
                      · {m.bracket_bestOf()}{goldConfig.semifinal.matchesToWin ?? 1}
                    </span>
                  </div>
                  <div class="config-item phase-config">
                    <span class="config-label">{m.admin_final()}:</span>
                    <span class="config-value">
                      {goldConfig.final.gameMode === 'points'
                        ? `${goldConfig.final.pointsToWin ?? 9}p`
                        : `${goldConfig.final.roundsToPlay ?? 4}r`}
                      · {m.bracket_bestOf()}{goldConfig.final.matchesToWin ?? 1}
                    </span>
                  </div>

                  <!-- Silver Bracket Phases -->
                  {#if silverConfig}
                    <div class="config-item bracket-header">
                      <span class="config-label">🥈 {m.admin_silverBracket()}</span>
                    </div>
                    <div class="config-item phase-config">
                      <span class="config-label">{m.admin_earlyRounds()}:</span>
                      <span class="config-value">
                        {silverConfig.earlyRounds.gameMode === 'points'
                          ? `${silverConfig.earlyRounds.pointsToWin ?? 7}p`
                          : `${silverConfig.earlyRounds.roundsToPlay ?? 4}r`}
                      </span>
                    </div>
                    <div class="config-item phase-config">
                      <span class="config-label">{m.admin_semifinals()}:</span>
                      <span class="config-value">
                        {silverConfig.semifinal.gameMode === 'points'
                          ? `${silverConfig.semifinal.pointsToWin ?? 7}p`
                          : `${silverConfig.semifinal.roundsToPlay ?? 4}r`}
                        · {m.bracket_bestOf()}{silverConfig.semifinal.matchesToWin ?? 1}
                      </span>
                    </div>
                    <div class="config-item phase-config">
                      <span class="config-label">{m.admin_final()}:</span>
                      <span class="config-value">
                        {silverConfig.final.gameMode === 'points'
                          ? `${silverConfig.final.pointsToWin ?? 7}p`
                          : `${silverConfig.final.roundsToPlay ?? 4}r`}
                        · {m.bracket_bestOf()}{silverConfig.final.matchesToWin ?? 1}
                      </span>
                    </div>
                  {/if}
                {:else if tournament.finalStage.goldBracket?.config}
                  {@const config = tournament.finalStage.goldBracket.config}
                  <div class="config-item">
                    <span class="config-label">{m.admin_earlyRounds()}:</span>
                    <span class="config-value">
                      {config.earlyRounds.gameMode === 'points'
                        ? `${config.earlyRounds.pointsToWin ?? 7}p`
                        : `${config.earlyRounds.roundsToPlay ?? 4}r`}
                      · {m.bracket_bestOf()}{config.earlyRounds.matchesToWin ?? 1}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">{m.admin_semifinals()}:</span>
                    <span class="config-value">
                      {config.semifinal.gameMode === 'points'
                        ? `${config.semifinal.pointsToWin ?? 7}p`
                        : `${config.semifinal.roundsToPlay ?? 4}r`}
                      · {m.bracket_bestOf()}{config.semifinal.matchesToWin ?? 1}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">{m.admin_final()}:</span>
                    <span class="config-value">
                      {config.final.gameMode === 'points'
                        ? `${config.final.pointsToWin ?? 7}p`
                        : `${config.final.roundsToPlay ?? 4}r`}
                      · {m.bracket_bestOf()}{config.final.matchesToWin ?? 1}
                    </span>
                  </div>
                {:else}
                  <div class="config-item">
                    <span class="config-label">{m.admin_status()}:</span>
                    <span class="config-value">{m.admin_pendingConfiguration()}</span>
                  </div>
                {/if}
              </div>

            {:else}
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">{m.admin_status()}:</span>
                  <span class="config-value">{m.admin_pendingConfiguration()}</span>
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
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" data-theme={$adminTheme} onclick={closeStartModal} role="none" onkeydown={(e) => e.key === 'Escape' && closeStartModal()}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="confirm-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h2>🚀 {m.admin_startTournament()}</h2>
        <p>{m.admin_readyToStartTournament()}</p>
        <div class="tournament-info">
          <strong>{tournament.edition ? `${tournament.edition}º ` : ''}{tournament.name}</strong>
          <br />
          <span>{tournament.participants.length} {m.admin_participants()}</span>
          <br />
          <span>
            {tournament.phaseType === 'TWO_PHASE' && tournament.groupStage
              ? `${m.tournament_groupStage()}: ${tournament.groupStage.type === 'ROUND_ROBIN' ? 'Round Robin' : m.tournament_swissSystem()}`
              : m.admin_directElimination()}
          </span>
        </div>
        <p class="info-text">
          {tournament.phaseType === 'TWO_PHASE'
            ? m.admin_groupStageScheduleWillBeGenerated()
            : m.admin_bracketWillBeGenerated()}
        </p>
        <div class="confirm-actions">
          <button class="cancel-btn" onclick={closeStartModal}>{m.common_cancel()}</button>
          <button class="confirm-btn" onclick={startTournament}>{m.admin_startTournament()}</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Cancel Confirmation Modal -->
  {#if showCancelConfirm && tournament}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" data-theme={$adminTheme} onclick={closeCancelModal} role="none" onkeydown={(e) => e.key === 'Escape' && closeCancelModal()}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="confirm-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h2>{m.admin_confirmCancellation()}</h2>
        <p>{m.admin_confirmCancelTournament()}</p>
        <div class="tournament-info">
          <strong>{tournament.edition ? `${tournament.edition}º ` : ''}{tournament.name}</strong>
          <br />
          <span>{tournament.participants.length} {m.admin_participants()}</span>
        </div>
        <p class="warning-text">
          {m.admin_tournamentWillBeCancelled()}
        </p>
        <div class="confirm-actions">
          <button class="cancel-btn" onclick={closeCancelModal}>{m.common_back()}</button>
          <button class="delete-btn-confirm" onclick={cancelTournament}>{m.admin_cancelTournament()}</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Quick Edit Modal -->
  {#if showQuickEdit && tournament}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" data-theme={$adminTheme} onclick={closeQuickEdit} role="none" onkeydown={(e) => e.key === 'Escape' && closeQuickEdit()}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="quick-edit-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <div class="quick-edit-header">
          <div class="header-title">
            <h2>⚙️ {m.admin_tournamentSettings()}</h2>
            <span class="header-subtitle">{m.admin_modifiableConfiguration()}</span>
          </div>
          <button class="close-btn" onclick={closeQuickEdit}>×</button>
        </div>

        <div class="quick-edit-body">
          <!-- Left Column: Basic Info -->
          <div class="edit-column">
            <div class="column-header">
              <span class="column-icon">📋</span>
              <span>{m.admin_basicInfo()}</span>
            </div>
            
            <div class="field-group">
              <label for="edit-name">{m.admin_tournamentName()}</label>
              <input
                type="text"
                id="edit-name"
                bind:value={editName}
                placeholder={m.admin_tournamentName()}
              />
            </div>

            <div class="field-row">
              <div class="field-group">
                <label for="edit-date">{m.admin_dateLabel()}</label>
                <input
                  type="date"
                  id="edit-date"
                  bind:value={editDate}
                />
              </div>

              <div class="field-group">
                <label for="edit-tables">{m.admin_availableTables()}</label>
                <input
                  type="number"
                  id="edit-tables"
                  bind:value={editNumTables}
                  min={getMinTables()}
                  max="50"
                />
                <span class="field-hint">{m.common_minimum()}: {getMinTables()}</span>
              </div>
            </div>

            <!-- Ranking Section -->
            <div class="subsection">
              <div class="subsection-header">
                <span class="subsection-icon">📊</span>
                <span>{m.admin_rankingSystem()}</span>
              </div>
              
              <label class="switch-row">
                <span class="switch-label">
                  <span class="switch-icon">📈</span>
                  {m.admin_rankingSystemEnabled()}
                </span>
                <input type="checkbox" bind:checked={editRankingEnabled} class="toggle-switch" />
              </label>

              {#if editRankingEnabled}
                <div class="field-group tier-field">
                  <label for="edit-tier">{m.admin_category()}</label>
                  <select id="edit-tier" bind:value={editRankingTier}>
                    <option value="CLUB">🏠 {m.admin_tierClub()} · 15p máx</option>
                    <option value="REGIONAL">🏝️ {m.admin_tierRegional()} · 25p máx</option>
                    <option value="NATIONAL">🇪🇸 {m.admin_tierNational()} · 40p máx</option>
                    <option value="MAJOR">🏆 {m.admin_tierMajor()} · 50p máx</option>
                  </select>
                </div>
              {/if}
            </div>
          </div>

          <!-- Right Column: Options -->
          <div class="edit-column">
            <div class="column-header">
              <span class="column-icon">🎮</span>
              <span>{m.admin_gameOptions()}</span>
            </div>

            <div class="options-grid">
              <label class="option-card">
                <input type="checkbox" bind:checked={editShow20s} />
                <span class="option-icon">🎯</span>
                <span class="option-text">{m.admin_track20s()}</span>
              </label>

              <label class="option-card">
                <input type="checkbox" bind:checked={editShowHammer} />
                <span class="option-icon">🔨</span>
                <span class="option-text">{m.admin_showHammer()}</span>
              </label>
            </div>

            <!-- Final Stage Section -->
            {#if tournament.finalStage}
              <div class="subsection">
                <div class="subsection-header">
                  <span class="subsection-icon">🏆</span>
                  <span>{m.time_finalStage()}</span>
                </div>

                <label class="switch-row">
                  <span class="switch-label">
                    <span class="switch-icon">🎖️</span>
                    {m.admin_consolationRounds()}
                  </span>
                  <input type="checkbox" bind:checked={editConsolationEnabled} class="toggle-switch" />
                </label>
                <p class="option-description">
                  {m.admin_consolationRoundsDescription()}
                </p>
              </div>
            {/if}
          </div>
        </div>

        <div class="quick-edit-footer">
          <button class="btn-secondary" onclick={closeQuickEdit}>{m.common_cancel()}</button>
          <button
            class="btn-primary"
            onclick={saveQuickEdit}
            disabled={isSavingQuickEdit || !editName.trim()}
          >
            {isSavingQuickEdit ? `⏳ ${m.admin_saving()}...` : `💾 ${m.admin_saveChanges()}`}
          </button>
        </div>
      </div>
    </div>
  {/if}
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} type={toastType} />

<!-- Loading Overlay -->
{#if isStarting || isSavingQuickEdit}
  <div class="loading-overlay" data-theme={$adminTheme}>
    <div class="loading-content">
      <LoadingSpinner size="large" message={isStarting ? m.tournament_starting() : m.admin_saving()} />
    </div>
  </div>
{/if}

<TimeBreakdownModal
  bind:visible={showTimeBreakdown}
  breakdown={timeBreakdown}
  showRecalculate={true}
  onrecalculate={recalculateTime}
/>

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
    padding: 0.75rem 1rem;
    transition: background-color 0.3s, border-color 0.3s;
    flex-shrink: 0;
  }

  .tournament-page[data-theme='dark'] .page-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .back-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
    border: none;
    border-radius: 8px;
    font-size: 1.1rem;
    color: #555;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .tournament-page[data-theme='dark'] .back-btn {
    background: #0f1419;
    color: #8b9bb3;
  }

  .back-btn:hover {
    background: #e5e7eb;
    transform: translateX(-2px);
  }

  .tournament-page[data-theme='dark'] .back-btn:hover {
    background: #2d3748;
  }

  .header-main {
    flex: 1;
    min-width: 0;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .title-section h1 {
    font-size: 1.1rem;
    margin: 0;
    color: #1a1a1a;
    font-weight: 600;
    white-space: nowrap;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .title-section h1 {
    color: #e1e8ed;
  }

  .header-badges {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .header-progress {
    margin-left: 0.5rem;
  }

  .status-badge {
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    color: white;
    font-weight: 600;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  .info-badge {
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
    white-space: nowrap;
    background: #f3f4f6;
    color: #555;
    transition: all 0.3s;
  }

  .tournament-page[data-theme='dark'] .info-badge {
    background: #0f1419;
    color: #8b9bb3;
  }

  .participants-badge {
    background: #dcfce7;
    color: #166534;
  }

  .tournament-page[data-theme='dark'] .participants-badge {
    background: #14532d;
    color: #86efac;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .action-btn {
    padding: 0.4rem 0.75rem;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    background: #f3f4f6;
    color: #1a1a1a;
  }

  .tournament-page[data-theme='dark'] .action-btn {
    background: #374151;
    color: #e1e8ed;
  }

  .action-btn:hover {
    background: #e5e7eb;
  }

  .tournament-page[data-theme='dark'] .action-btn:hover {
    background: #4b5563;
  }

  .action-btn.primary,
  .tournament-page[data-theme='dark'] .action-btn.primary {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .action-btn.primary:hover:not(:disabled),
  .tournament-page[data-theme='dark'] .action-btn.primary:hover:not(:disabled) {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
    transform: translateY(-1px);
  }

  .action-btn.primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn.danger {
    background: #fee2e2;
    color: #dc2626;
  }

  .action-btn.danger:hover {
    background: #fecaca;
  }

  /* Content */
  .page-content {
    width: 100%;
    padding: 1.5rem;
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
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
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  /* Make results card span full width */
  .results-card {
    grid-column: 1 / -1;
  }

  .dashboard-card {
    background: white;
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    transition: background-color 0.3s, box-shadow 0.3s;
  }

  .tournament-page[data-theme='dark'] .dashboard-card {
    background: #1a2332;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .dashboard-card h2 {
    font-size: 0.9rem;
    margin: 0 0 0.75rem 0;
    color: #1a1a1a;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .dashboard-card h2 {
    color: #e1e8ed;
  }

  /* Configuration */
  .config-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .config-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0.6rem;
    background: #f9fafb;
    border-radius: 4px;
    font-size: 0.8rem;
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
    text-align: right;
    transition: color 0.3s;
  }

  .tournament-page[data-theme='dark'] .config-value {
    color: #e1e8ed;
  }

  .config-value.duration-value {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  /* Bracket phase configuration */
  .config-item.bracket-header {
    margin-top: 0.5rem;
    padding: 0.3rem 0.6rem;
    background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%);
    border-left: 3px solid #667eea;
  }

  .config-item.bracket-header .config-label {
    font-weight: 600;
    color: #1a1a1a;
  }

  .tournament-page[data-theme='dark'] .config-item.bracket-header .config-label {
    color: #e1e8ed;
  }

  .config-item.phase-config {
    padding-left: 1.2rem;
    font-size: 0.75rem;
  }

  .config-item.phase-config .config-label {
    font-size: 0.75rem;
  }

  .config-item.phase-config .config-value {
    font-size: 0.75rem;
  }

  /* Consolation badge */
  .consolation-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .consolation-badge.enabled {
    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    color: #166534;
    border: 1px solid #22c55e;
  }

  .tournament-page[data-theme='dark'] .consolation-badge.enabled {
    background: linear-gradient(135deg, #14532d 0%, #166534 100%);
    color: #dcfce7;
    border-color: #22c55e;
  }

  .consolation-badge.disabled {
    background: #f3f4f6;
    color: #6b7280;
  }

  .tournament-page[data-theme='dark'] .consolation-badge.disabled {
    background: #374151;
    color: #9ca3af;
  }

  .consolation-badge .badge-check {
    width: 14px;
    height: 14px;
  }

  /* Responsive */
  @media (max-width: 1024px) {
    .dashboard-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .header-row {
      flex-wrap: wrap;
    }

    .header-main {
      order: 2;
      width: 100%;
      margin-top: 0.5rem;
    }

    .header-actions {
      order: 1;
      margin-left: auto;
    }

    .title-section {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .header-badges {
      width: 100%;
    }

    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 600px) {
    .header-actions {
      flex-wrap: wrap;
      gap: 0.3rem;
    }

    .action-btn {
      padding: 0.35rem 0.6rem;
      font-size: 0.75rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .page-header {
      padding: 0.5rem 0.75rem;
    }

    .title-section h1 {
      font-size: 1rem;
    }

    .header-badges {
      gap: 0.3rem;
    }

    .status-badge,
    .info-badge {
      font-size: 0.65rem;
      padding: 0.15rem 0.4rem;
    }

    .action-btn {
      padding: 0.3rem 0.5rem;
      font-size: 0.7rem;
    }

    .page-content {
      padding: 0.75rem;
    }

    .dashboard-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .dashboard-card {
      padding: 0.75rem;
    }

    .dashboard-card h2 {
      font-size: 0.8rem;
      margin-bottom: 0.5rem;
    }

    .config-item {
      padding: 0.3rem 0.5rem;
      font-size: 0.75rem;
    }

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

  /* Quick Edit Modal - Redesigned */
  .quick-edit-modal {
    background: white;
    border-radius: 20px;
    padding: 0;
    max-width: 720px;
    width: 95%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.25);
    transition: all 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .quick-edit-modal {
    background: #1a2332;
  }

  .quick-edit-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.5rem 2rem;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    background: white;
    border-radius: 20px 20px 0 0;
    z-index: 1;
  }

  .modal-backdrop[data-theme='dark'] .quick-edit-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  .header-title {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .quick-edit-header h2 {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 700;
    color: #1a1a1a;
  }

  .modal-backdrop[data-theme='dark'] .quick-edit-header h2 {
    color: #e1e8ed;
  }

  .header-subtitle {
    font-size: 0.85rem;
    color: #888;
  }

  .modal-backdrop[data-theme='dark'] .header-subtitle {
    color: #6b7a94;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border: none;
    background: #f3f4f6;
    border-radius: 10px;
    font-size: 1.5rem;
    line-height: 1;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .modal-backdrop[data-theme='dark'] .close-btn {
    background: #0f1419;
    color: #8b9bb3;
  }

  .close-btn:hover {
    background: #e5e7eb;
    color: #1a1a1a;
    transform: scale(1.05);
  }

  .modal-backdrop[data-theme='dark'] .close-btn:hover {
    background: #2d3748;
    color: #e1e8ed;
  }

  /* 2-Column Body Layout */
  .quick-edit-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    padding: 0;
  }

  .edit-column {
    padding: 1.5rem 2rem;
  }

  .edit-column:first-child {
    border-right: 1px solid #e5e7eb;
  }

  .modal-backdrop[data-theme='dark'] .edit-column:first-child {
    border-color: #2d3748;
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    font-weight: 700;
    color: #667eea;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 1.25rem;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid rgba(102, 126, 234, 0.2);
  }

  .column-icon {
    font-size: 1rem;
  }

  /* Field Groups */
  .field-group {
    margin-bottom: 1rem;
  }

  .field-group:last-child {
    margin-bottom: 0;
  }

  .field-group label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: #555;
    margin-bottom: 0.4rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .modal-backdrop[data-theme='dark'] .field-group label {
    color: #8b9bb3;
  }

  .field-group input[type="text"],
  .field-group input[type="date"],
  .field-group input[type="number"],
  .field-group select {
    width: 100%;
    padding: 0.7rem 0.9rem;
    border: 1px solid #ddd;
    border-radius: 10px;
    font-size: 0.95rem;
    color: #1a1a1a;
    background: #f9fafb;
    transition: all 0.2s;
  }

  .modal-backdrop[data-theme='dark'] .field-group input[type="text"],
  .modal-backdrop[data-theme='dark'] .field-group input[type="date"],
  .modal-backdrop[data-theme='dark'] .field-group input[type="number"],
  .modal-backdrop[data-theme='dark'] .field-group select {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .field-group input:focus,
  .field-group select:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
  }

  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .field-hint {
    font-size: 0.7rem;
    color: #888;
    margin-top: 0.25rem;
    display: block;
  }

  .modal-backdrop[data-theme='dark'] .field-hint {
    color: #6b7a94;
  }

  /* Subsections */
  .subsection {
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid #e5e7eb;
  }

  .modal-backdrop[data-theme='dark'] .subsection {
    border-color: #2d3748;
  }

  .subsection-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #666;
    margin-bottom: 0.85rem;
  }

  .modal-backdrop[data-theme='dark'] .subsection-header {
    color: #8b9bb3;
  }

  .subsection-icon {
    font-size: 0.95rem;
  }

  /* Switch Rows */
  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    background: #f9fafb;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 0.75rem;
  }

  .modal-backdrop[data-theme='dark'] .switch-row {
    background: #0f1419;
  }

  .switch-row:hover {
    background: #f3f4f6;
  }

  .modal-backdrop[data-theme='dark'] .switch-row:hover {
    background: #1e293b;
  }

  .switch-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    color: #1a1a1a;
    font-size: 0.9rem;
  }

  .modal-backdrop[data-theme='dark'] .switch-label {
    color: #e1e8ed;
  }

  .switch-icon {
    font-size: 1rem;
  }

  /* Toggle Switch Style */
  .toggle-switch {
    appearance: none;
    -webkit-appearance: none;
    width: 44px;
    height: 24px;
    background: #d1d5db;
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: all 0.3s;
  }

  .toggle-switch::before {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    top: 3px;
    left: 3px;
    background: white;
    transition: all 0.3s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch:checked {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .toggle-switch:checked::before {
    transform: translateX(20px);
  }

  /* Option Cards (Game Options) */
  .options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .option-card {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    background: #f9fafb;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
    text-align: left;
  }

  .modal-backdrop[data-theme='dark'] .option-card {
    background: #0f1419;
  }

  .option-card:hover {
    background: #f3f4f6;
    border-color: rgba(102, 126, 234, 0.3);
  }

  .modal-backdrop[data-theme='dark'] .option-card:hover {
    background: #1e293b;
  }

  .option-card:has(input:checked) {
    background: rgba(102, 126, 234, 0.1);
    border-color: #667eea;
  }

  .modal-backdrop[data-theme='dark'] .option-card:has(input:checked) {
    background: rgba(102, 126, 234, 0.15);
  }

  .option-card input[type="checkbox"] {
    display: none;
  }

  .option-icon {
    font-size: 1.1rem;
  }

  .option-text {
    font-size: 0.8rem;
    font-weight: 600;
    color: #555;
  }

  .modal-backdrop[data-theme='dark'] .option-text {
    color: #b0bec5;
  }

  .option-card:has(input:checked) .option-text {
    color: #667eea;
  }

  .option-description {
    font-size: 0.75rem;
    color: #888;
    margin: 0;
    line-height: 1.4;
    padding: 0 0.5rem;
  }

  .modal-backdrop[data-theme='dark'] .option-description {
    color: #6b7a94;
  }

  /* Tier Field */
  .tier-field {
    margin-top: 0.5rem;
  }

  .tier-field select {
    font-size: 0.9rem;
  }

  /* Footer */
  .quick-edit-footer {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding: 1.25rem 2rem;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
    border-radius: 0 0 20px 20px;
    position: sticky;
    bottom: 0;
  }

  .modal-backdrop[data-theme='dark'] .quick-edit-footer {
    background: #0f1419;
    border-color: #2d3748;
  }

  .btn-secondary {
    padding: 0.75rem 1.5rem;
    background: white;
    color: #555;
    border: 1px solid #ddd;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.9rem;
  }

  .modal-backdrop[data-theme='dark'] .btn-secondary {
    background: #1a2332;
    border-color: #2d3748;
    color: #b0bec5;
  }

  .btn-secondary:hover {
    background: #f3f4f6;
    border-color: #ccc;
  }

  .modal-backdrop[data-theme='dark'] .btn-secondary:hover {
    background: #2d3748;
  }

  .btn-primary {
    padding: 0.75rem 1.75rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.9rem;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
  }

  .btn-primary:hover {
    opacity: 0.95;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  /* Responsive for quick edit modal */
  @media (max-width: 700px) {
    .quick-edit-modal {
      max-width: 100%;
      width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .quick-edit-header {
      border-radius: 0;
      padding: 1.25rem 1.5rem;
    }

    .quick-edit-body {
      grid-template-columns: 1fr;
    }

    .edit-column {
      padding: 1.25rem 1.5rem;
    }

    .edit-column:first-child {
      border-right: none;
      border-bottom: 1px solid #e5e7eb;
    }

    .modal-backdrop[data-theme='dark'] .edit-column:first-child {
      border-color: #2d3748;
    }

    .quick-edit-footer {
      border-radius: 0;
    }
  }

  /* Loading Overlay */
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
  }

  .loading-content {
    background: white;
    padding: 2rem 3rem;
    border-radius: 12px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .loading-overlay[data-theme='dark'] .loading-content {
    background: #1a2332;
  }

  </style>
