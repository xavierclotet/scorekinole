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
  import { t } from '$lib/stores/language';
  import { formatDuration, calculateRemainingTime, calculateTournamentTimeEstimate, calculateTimeBreakdown, type TimeBreakdown } from '$lib/utils/tournamentTime';
  import TimeBreakdownModal from '$lib/components/TimeBreakdownModal.svelte';
  import TimeProgressBar from '$lib/components/TimeProgressBar.svelte';

  let tournament: Tournament | null = null;
  let loading = true;
  let error = false;
  let showCancelConfirm = false;
  let showStartConfirm = false;
  let showQuickEdit = false;
  let showTimeBreakdown = false;
  let timeBreakdown: TimeBreakdown | null = null;
  let showToast = false;
  let toastMessage = '';
  let toastType: 'success' | 'error' | 'info' | 'warning' = 'info';
  let isStarting = false;
  let isSavingQuickEdit = false;

  // Quick edit form fields
  let editName = '';
  let editDate = '';
  let editNumTables = 1;
  let editShow20s = false;
  let editShowHammer = false;
  let editRankingEnabled = false;

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
      } else {
        // Check if tournament was created by another admin and is still active
        const isActive = !['COMPLETED', 'CANCELLED'].includes(tournament.status);
        if ($currentUser && tournament.createdBy?.userId !== $currentUser.id && isActive) {
          toastMessage = $t('notYourTournament');
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
      DRAFT: $t('draft'),
      GROUP_STAGE: $t('groupStage'),
      TRANSITION: $t('transition'),
      FINAL_STAGE: $t('finalStage'),
      COMPLETED: $t('completed'),
      CANCELLED: $t('cancelled')
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
      toastMessage = $t('minParticipantsRequired');
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
        toastMessage = $t('errorStartingTournament');
        toastType = 'error';
        showToast = true;
      }
    } catch (err) {
      console.error('Error starting tournament:', err);
      toastMessage = $t('errorStartingTournament');
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
      toastMessage = $t('tournamentCancelled');
      toastType = 'success';
      showToast = true;
      await loadTournament();
    } else {
      toastMessage = $t('errorCancellingTournament');
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
    toastMessage = $t('timeRecalculated');
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
      toastMessage = $t('minTablesRequired').replace('{min}', String(minTables)).replace('{participants}', String(tournament.participants.length));
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
          tier: tournament.rankingConfig?.tier || 'CLUB'
        }
      };

      const success = await updateTournament(tournamentId, updates);

      if (success) {
        toastMessage = $t('configurationUpdated');
        toastType = 'success';
        showToast = true;
        closeQuickEdit();
        await loadTournament();
      } else {
        toastMessage = $t('errorSavingChanges');
        toastType = 'error';
        showToast = true;
      }
    } catch (err) {
      console.error('Error saving quick edit:', err);
      toastMessage = $t('errorSavingChanges');
      toastType = 'error';
      showToast = true;
    } finally {
      isSavingQuickEdit = false;
    }
  }

  // Check if tournament can be quick-edited (active states only)
  $: canQuickEdit = tournament && ['GROUP_STAGE', 'TRANSITION', 'FINAL_STAGE'].includes(tournament.status);

  // Calculate remaining time reactively
  $: timeRemaining = tournament ? calculateRemainingTime(tournament) : null;
</script>

<AdminGuard>
  <div class="tournament-page" data-theme={$adminTheme}>
    <!-- Header -->
    <header class="page-header">
      {#if tournament}
        <div class="header-row">
          <button class="back-btn" on:click={() => goto('/admin/tournaments')}>
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
                  {tournament.participants.length} {$t('participants')}
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
                    on:click={openTimeBreakdown}
                  />
                </div>
              {/if}
            </div>
          </div>

          <div class="header-actions">
            {#if tournament.status === 'DRAFT'}
              <button class="action-btn primary" on:click={confirmStart} disabled={isStarting}>
                {isStarting ? $t('starting') + '...' : $t('start')}
              </button>
              <button class="action-btn" on:click={() => goto(`/admin/tournaments/create?edit=${tournamentId}`)}>
                {$t('edit')}
              </button>
              <button class="action-btn danger" on:click={confirmCancel}>
                {$t('cancel')}
              </button>
            {:else if tournament.status === 'GROUP_STAGE'}
              <button class="action-btn primary" on:click={() => goto(`/admin/tournaments/${tournamentId}/groups`)}>
                {$t('viewGroupStage')}
              </button>
              <button class="action-btn" on:click={openQuickEdit}>
                {$t('edit')}
              </button>
            {:else if tournament.status === 'TRANSITION'}
              <button class="action-btn primary" on:click={() => goto(`/admin/tournaments/${tournamentId}/transition`)}>
                {$t('selectQualified')}
              </button>
              <button class="action-btn" on:click={openQuickEdit}>
                {$t('edit')}
              </button>
            {:else if tournament.status === 'FINAL_STAGE'}
              <button class="action-btn primary" on:click={() => goto(`/admin/tournaments/${tournamentId}/bracket`)}>
                {$t('viewBracket')}
              </button>
              <button class="action-btn" on:click={openQuickEdit}>
                {$t('edit')}
              </button>
            {/if}
            <ThemeToggle />
          </div>
        </div>
      {:else}
        <div class="header-row">
          <button class="back-btn" on:click={() => goto('/admin/tournaments')}>
            ←
          </button>
          <div class="header-main">
            <h1>{$t('loadingTournament')}...</h1>
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
        <LoadingSpinner message={$t('loadingTournament')} />
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>{$t('tournamentNotFound')}</h3>
          <p>{$t('couldNotLoadTournament')}</p>
          <button class="primary-button" on:click={() => goto('/admin/tournaments')}>
            {$t('backToTournaments')}
          </button>
        </div>
      {:else}
        <!-- Tournament Dashboard Content -->
        <div class="dashboard-grid">
          <!-- Completed Tournament Results Section (at the top) -->
          {#if tournament.status === 'COMPLETED'}
            <section class="dashboard-card results-card">
              <h2>📋 {$t('tournamentResults')}</h2>
              <CompletedTournamentView {tournament} on:updated={loadTournament} />
            </section>
          {/if}

          <!-- General Configuration Section -->
          <section class="dashboard-card">
            <h2>{$t('generalConfiguration')}</h2>
            <div class="config-list">
              {#if tournament.tournamentDate}
                <div class="config-item">
                  <span class="config-label">{$t('date')}:</span>
                  <span class="config-value">
                    {new Date(tournament.tournamentDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              {/if}

              {#if tournament.city || tournament.country}
                <div class="config-item">
                  <span class="config-label">{$t('location')}:</span>
                  <span class="config-value">
                    {tournament.city}{tournament.city && tournament.country ? ', ' : ''}{tournament.country || ''}
                  </span>
                </div>
              {/if}

              <div class="config-item">
                <span class="config-label">{$t('format')}:</span>
                <span class="config-value">
                  {tournament.phaseType === 'ONE_PHASE' ? $t('onePhaseFormat') : $t('twoPhaseFormat')}
                </span>
              </div>

              <div class="config-item">
                <span class="config-label">{$t('modality')}:</span>
                <span class="config-value">
                  {tournament.gameType === 'singles' ? $t('singles') : $t('doubles')}
                </span>
              </div>

              <div class="config-item">
                <span class="config-label">{$t('availableTables')}:</span>
                <span class="config-value">{tournament.numTables}</span>
              </div>

              <div class="config-item">
                <span class="config-label">{$t('track20s')}:</span>
                <span class="config-value">{tournament.show20s ? $t('yes') : $t('no')}</span>
              </div>

              <div class="config-item">
                <span class="config-label">{$t('showHammer')}:</span>
                <span class="config-value">{tournament.showHammer ? $t('yes') : $t('no')}</span>
              </div>

              <div class="config-item">
                <span class="config-label">{$t('rankingSystem')}:</span>
                <span class="config-value">
                  {#if tournament.rankingConfig?.enabled}
                    {tournament.rankingConfig.tier === 'MAJOR' ? `${$t('tierMajor')} (Tier 1)` :
                        tournament.rankingConfig.tier === 'NATIONAL' ? `${$t('tierNational')} (Tier 2)` :
                        tournament.rankingConfig.tier === 'REGIONAL' ? `${$t('tierRegional')} (Tier 3)` : `${$t('tierClub')} (Tier 4)`}
                  {:else}
                    {$t('disabled')}
                  {/if}
                </span>
              </div>

              {#if tournament.timeEstimate?.totalMinutes}
                <div class="config-item">
                  <span class="config-label">{$t('estimatedDuration')}:</span>
                  <span class="config-value duration-value">
                    ~{formatDuration(tournament.timeEstimate.totalMinutes)}
                  </span>
                </div>
              {/if}

              <div class="config-item">
                <span class="config-label">{$t('createdBy')}:</span>
                <span class="config-value">{tournament.createdBy?.userName || '-'}</span>
              </div>
            </div>
          </section>

          <!-- Group Stage Configuration (only for TWO_PHASE) -->
          {#if tournament.phaseType === 'TWO_PHASE' && tournament.groupStage}
            <section class="dashboard-card">
              <h2>⚔️ {$t('groupStage')}</h2>
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">{$t('system')}:</span>
                  <span class="config-value">
                    {tournament.groupStage.type === 'ROUND_ROBIN' ? 'Round Robin' : $t('swissSystem')}
                  </span>
                </div>

                {#if tournament.groupStage.type === 'ROUND_ROBIN' && tournament.groupStage.numGroups}
                  <div class="config-item">
                    <span class="config-label">{$t('numberOfGroups')}:</span>
                    <span class="config-value">{tournament.groupStage.numGroups}</span>
                  </div>
                {:else if tournament.groupStage.type === 'SWISS' && tournament.groupStage.numSwissRounds}
                  <div class="config-item">
                    <span class="config-label">{$t('swissRounds')}:</span>
                    <span class="config-value">{tournament.groupStage.numSwissRounds}</span>
                  </div>
                {/if}

                <div class="config-item">
                  <span class="config-label">{$t('gameMode')}:</span>
                  <span class="config-value">
                    {tournament.groupStage.gameMode === 'points'
                      ? `${$t('byPoints')} (${tournament.groupStage.pointsToWin})`
                      : `${$t('byRounds')} (${tournament.groupStage.roundsToPlay})`}
                  </span>
                </div>

                <div class="config-item">
                  <span class="config-label">{$t('matchesToWinLabel')}:</span>
                  <span class="config-value">Best of {tournament.groupStage.matchesToWin}</span>
                </div>
              </div>
            </section>
          {/if}

          <!-- Final Stage Configuration -->
          <section class="dashboard-card">
            <h2>🏆 {$t('finalStage')}</h2>

            {#if tournament.phaseType === 'TWO_PHASE' && tournament.finalStageConfig}
              <!-- TWO_PHASE: Show finalStageConfig -->
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">{$t('structure')}:</span>
                  <span class="config-value">
                    {tournament.finalStageConfig.mode === 'SPLIT_DIVISIONS'
                      ? $t('goldSilverDivisions')
                      : $t('singleBracket')}
                  </span>
                </div>

                {#if tournament.finalStageConfig.mode === 'SPLIT_DIVISIONS'}
                  <div class="config-item">
                    <span class="config-label">🥇 {$t('goldBracket')}:</span>
                    <span class="config-value">
                      {tournament.finalStageConfig.gameMode === 'points'
                        ? `${$t('byPoints')} (${tournament.finalStageConfig.pointsToWin})`
                        : `${$t('byRounds')} (${tournament.finalStageConfig.roundsToPlay})`}
                      · Bo{tournament.finalStageConfig.matchesToWin}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">🥈 {$t('silverBracket')}:</span>
                    <span class="config-value">
                      {tournament.finalStageConfig.silverGameMode === 'points'
                        ? `${$t('byPoints')} (${tournament.finalStageConfig.silverPointsToWin})`
                        : `${$t('byRounds')} (${tournament.finalStageConfig.silverRoundsToPlay})`}
                      · Bo{tournament.finalStageConfig.silverMatchesToWin}
                    </span>
                  </div>
                {:else}
                  <div class="config-item">
                    <span class="config-label">{$t('gameMode')}:</span>
                    <span class="config-value">
                      {tournament.finalStageConfig.gameMode === 'points'
                        ? `${$t('byPoints')} (${tournament.finalStageConfig.pointsToWin})`
                        : `${$t('byRounds')} (${tournament.finalStageConfig.roundsToPlay})`}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">{$t('matchesToWinLabel')}:</span>
                    <span class="config-value">Best of {tournament.finalStageConfig.matchesToWin}</span>
                  </div>
                {/if}
              </div>

            {:else if tournament.finalStage}
              <!-- ONE_PHASE or active final stage: Show finalStage data -->
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">{$t('structure')}:</span>
                  <span class="config-value">
                    {tournament.finalStage.mode === 'SPLIT_DIVISIONS'
                      ? $t('goldSilverDivisions')
                      : $t('singleBracket')}
                  </span>
                </div>

                {#if tournament.finalStage.mode === 'SPLIT_DIVISIONS'}
                  <div class="config-item">
                    <span class="config-label">🥇 {$t('goldBracket')}:</span>
                    <span class="config-value">
                      {tournament.finalStage.gameMode === 'points'
                        ? `${$t('byPoints')} (${tournament.finalStage.pointsToWin})`
                        : `${$t('byRounds')} (${tournament.finalStage.roundsToPlay})`}
                      · Bo{tournament.finalStage.matchesToWin}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">🥈 {$t('silverBracket')}:</span>
                    <span class="config-value">
                      {tournament.finalStage.silverGameMode === 'points'
                        ? `${$t('byPoints')} (${tournament.finalStage.silverPointsToWin})`
                        : `${$t('byRounds')} (${tournament.finalStage.silverRoundsToPlay})`}
                      · Bo{tournament.finalStage.silverMatchesToWin}
                    </span>
                  </div>
                {:else}
                  <div class="config-item">
                    <span class="config-label">{$t('gameMode')}:</span>
                    <span class="config-value">
                      {tournament.finalStage.gameMode === 'points'
                        ? `${$t('byPoints')} (${tournament.finalStage.pointsToWin || 7})`
                        : `${$t('byRounds')} (${tournament.finalStage.roundsToPlay || 4})`}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">{$t('matchesToWinLabel')}:</span>
                    <span class="config-value">Best of {tournament.finalStage.matchesToWin || 1}</span>
                  </div>
                {/if}
              </div>

            {:else}
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">{$t('status')}:</span>
                  <span class="config-value">{$t('pendingConfiguration')}</span>
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
        <h2>🚀 {$t('startTournament')}</h2>
        <p>{$t('readyToStartTournament')}</p>
        <div class="tournament-info">
          <strong>{tournament.edition ? `${tournament.edition}º ` : ''}{tournament.name}</strong>
          <br />
          <span>{tournament.participants.length} {$t('participants')}</span>
          <br />
          <span>
            {tournament.phaseType === 'TWO_PHASE' && tournament.groupStage
              ? `${$t('groupStage')}: ${tournament.groupStage.type === 'ROUND_ROBIN' ? 'Round Robin' : $t('swissSystem')}`
              : $t('directElimination')}
          </span>
        </div>
        <p class="info-text">
          {tournament.phaseType === 'TWO_PHASE'
            ? $t('groupStageScheduleWillBeGenerated')
            : $t('bracketWillBeGenerated')}
        </p>
        <div class="confirm-actions">
          <button class="cancel-btn" on:click={closeStartModal}>{$t('cancel')}</button>
          <button class="confirm-btn" on:click={startTournament}>{$t('startTournament')}</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Cancel Confirmation Modal -->
  {#if showCancelConfirm && tournament}
    <div class="modal-backdrop" data-theme={$adminTheme} on:click={closeCancelModal} role="button" tabindex="0" on:keydown={(e) => e.key === 'Escape' && closeCancelModal()}>
      <div class="confirm-modal" on:click|stopPropagation role="dialog" aria-modal="true">
        <h2>{$t('confirmCancellation')}</h2>
        <p>{$t('confirmCancelTournament')}</p>
        <div class="tournament-info">
          <strong>{tournament.edition ? `${tournament.edition}º ` : ''}{tournament.name}</strong>
          <br />
          <span>{tournament.participants.length} {$t('participants')}</span>
        </div>
        <p class="warning-text">
          {$t('tournamentWillBeCancelled')}
        </p>
        <div class="confirm-actions">
          <button class="cancel-btn" on:click={closeCancelModal}>{$t('back')}</button>
          <button class="delete-btn-confirm" on:click={cancelTournament}>{$t('cancelTournament')}</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Quick Edit Modal -->
  {#if showQuickEdit && tournament}
    <div class="modal-backdrop" data-theme={$adminTheme} on:click={closeQuickEdit} role="button" tabindex="0" on:keydown={(e) => e.key === 'Escape' && closeQuickEdit()}>
      <div class="quick-edit-modal" on:click|stopPropagation role="dialog" aria-modal="true">
        <div class="quick-edit-header">
          <h2>⚙️ {$t('tournamentSettings')}</h2>
          <button class="close-btn" on:click={closeQuickEdit}>×</button>
        </div>

        <p class="quick-edit-subtitle">{$t('modifiableConfiguration')}</p>

        <div class="quick-edit-form">
          <!-- Basic Info Section -->
          <div class="form-section">
            <h3>📋 {$t('basicInfo')}</h3>

            <div class="form-group">
              <label for="edit-name">{$t('tournamentName')}</label>
              <input
                type="text"
                id="edit-name"
                bind:value={editName}
                placeholder={$t('tournamentName')}
              />
            </div>

            <div class="form-group">
              <label for="edit-date">{$t('date')}</label>
              <input
                type="date"
                id="edit-date"
                bind:value={editDate}
              />
            </div>

            <div class="form-group">
              <label for="edit-tables">{$t('availableTables')}</label>
              <div class="input-with-hint">
                <input
                  type="number"
                  id="edit-tables"
                  bind:value={editNumTables}
                  min={getMinTables()}
                  max="50"
                />
                <span class="hint">{$t('minimum')}: {getMinTables()} ({tournament.participants.length} {$t('participants')})</span>
              </div>
            </div>
          </div>

          <!-- Game Options Section -->
          <div class="form-section">
            <h3>🎮 {$t('gameOptions')}</h3>

            <div class="toggle-group">
              <label class="toggle-item">
                <input type="checkbox" bind:checked={editShow20s} />
                <span class="toggle-label">
                  <span class="toggle-icon">🎯</span>
                  {$t('track20s')}
                </span>
              </label>

              <label class="toggle-item">
                <input type="checkbox" bind:checked={editShowHammer} />
                <span class="toggle-label">
                  <span class="toggle-icon">🔨</span>
                  {$t('showHammer')}
                </span>
              </label>
            </div>
          </div>

          <!-- Ranking Section -->
          <div class="form-section">
            <h3>📊 {$t('rankingSystem')}</h3>

            <label class="toggle-item ranking-toggle">
              <input type="checkbox" bind:checked={editRankingEnabled} />
              <span class="toggle-label">
                <span class="toggle-icon">📈</span>
                {$t('rankingSystemEnabled')}
              </span>
            </label>

            {#if editRankingEnabled && tournament.rankingConfig?.tier}
              <p class="ranking-info">
                {$t('category')}: <strong>{tournament.rankingConfig.tier}</strong>
              </p>
            {/if}
          </div>
        </div>

        <div class="quick-edit-actions">
          <button class="cancel-btn" on:click={closeQuickEdit}>{$t('cancel')}</button>
          <button
            class="confirm-btn"
            on:click={saveQuickEdit}
            disabled={isSavingQuickEdit || !editName.trim()}
          >
            {isSavingQuickEdit ? `⏳ ${$t('saving')}...` : `💾 ${$t('saveChanges')}`}
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
      <LoadingSpinner size="large" message={isStarting ? 'Iniciando torneo...' : 'Guardando cambios...'} />
    </div>
  </div>
{/if}

<TimeBreakdownModal
  bind:visible={showTimeBreakdown}
  breakdown={timeBreakdown}
  showRecalculate={true}
  on:recalculate={recalculateTime}
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

  .ranking-toggle {
    margin-bottom: 0.75rem;
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
  }

  /* Time estimation card */
  .time-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .time-header h2 {
    margin: 0;
  }

  .time-actions {
    display: flex;
    gap: 0.5rem;
  }

  .details-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    background: #f1f5f9;
    color: #64748b;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .details-btn:hover {
    background: #e2e8f0;
    color: #334155;
  }

  .tournament-page[data-theme='dark'] .details-btn {
    background: #334155;
    color: #94a3b8;
  }

  .tournament-page[data-theme='dark'] .details-btn:hover {
    background: #475569;
    color: #e2e8f0;
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

  .loading-overlay[data-theme='dark'] .loading-text {
    color: #e1e8ed;
  }

  .loading-subtext {
    font-size: 0.85rem;
    color: #6b7280;
    margin: 0;
  }

  .loading-overlay[data-theme='dark'] .loading-subtext {
    color: #8b9bb3;
  }

  </style>
