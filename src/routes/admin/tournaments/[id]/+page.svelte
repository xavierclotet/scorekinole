<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import TournamentKeyBadge from '$lib/components/TournamentKeyBadge.svelte';
  import CompletedTournamentView from '$lib/components/tournament/CompletedTournamentView.svelte';
  import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import { currentUser } from '$lib/firebase/auth';
  import { getTournament, cancelTournament as cancelTournamentFirebase, updateTournament } from '$lib/firebase/tournaments';
  import { transitionTournament } from '$lib/utils/tournamentStateMachine';
  import { type Tournament, getParticipantDisplayName } from '$lib/types/tournament';
  import Toast from '$lib/components/Toast.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { formatDuration, calculateRemainingTime, calculateTournamentTimeEstimate, calculateTimeBreakdown, type TimeBreakdown } from '$lib/utils/tournamentTime';
  import TimeBreakdownModal from '$lib/components/TimeBreakdownModal.svelte';
  import TimeProgressBar from '$lib/components/TimeProgressBar.svelte';
  import TournamentRulesModal from '$lib/components/tournament/TournamentRulesModal.svelte';
  import CountrySelect from '$lib/components/CountrySelect.svelte';
  import TournamentAdminsModal from '$lib/components/admin/TournamentAdminsModal.svelte';
  import VenueSelector from '$lib/components/tournament/VenueSelector.svelte';

  let tournament: Tournament | null = $state(null);
  let loading = $state(true);
  let error = $state(false);
  let showCancelConfirm = $state(false);
  let showStartConfirm = $state(false);
  let showQuickEdit = $state(false);
  let showTimeBreakdown = $state(false);
  let showRules = $state(false);
  let showAdminsModal = $state(false);
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
  let editThirdPlaceMatchEnabled = $state(true);
  let editIsTest = $state(false);

  // Metadata fields (for event info editing)
  let editDescription = $state('');
  let editEdition = $state<number | undefined>(undefined);
  let editAddress = $state('');
  let editCity = $state('');
  let editCountry = $state('');
  let editExternalLink = $state('');
  let editPosterUrl = $state('');

  let tournamentId = $derived(page.params.id);

  // Fallback for consolationEnabled - check multiple locations due to migration
  let consolationEnabled = $derived(tournament?.finalStage?.consolationEnabled
    ?? (tournament?.finalStage as Record<string, unknown>)?.['consolationEnabled']
    ?? tournament?.finalStage?.goldBracket?.config?.consolationEnabled
    ?? false);

  // Get thirdPlaceMatchEnabled from finalStage (default true)
  let thirdPlaceMatchEnabled = $derived(tournament?.finalStage?.thirdPlaceMatchEnabled ?? true);

  // Calculate max players that can play in parallel with current table count
  let playersPerTable = $derived(tournament?.gameType === 'doubles' ? 4 : 2);
  let maxPlayersForTables = $derived(editNumTables * playersPerTable);
  let tablesWarning = $derived(tournament ? tournament.participants.length > maxPlayersForTables : false);

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

  // Helper to detect if tournament is "upcoming" (isImported + future date)
  let isUpcoming = $derived(() => {
    if (!tournament?.isImported) return false;
    const now = Date.now();
    return tournament.tournamentDate && tournament.tournamentDate > now;
  });

  // Check if tournament has any actual results
  let hasResults = $derived(() => {
    if (!tournament) return false;
    // Check if any bracket match is completed
    const hasBracketResults = tournament.finalStage?.goldBracket?.rounds?.some(
      r => r.matches?.some(m => m.status === 'COMPLETED')
    );
    // Check if any group has standings with matches played
    const hasGroupResults = tournament.groupStage?.groups?.some(
      g => g.standings?.some(s => s.matchesPlayed > 0)
    );
    return hasBracketResults || hasGroupResults;
  });

  function getStatusText(status: string): string {
    // Check if it's an upcoming tournament
    if (tournament?.isImported) {
      const now = Date.now();
      if (tournament.tournamentDate && tournament.tournamentDate > now) {
        return m.tournament_upcoming(); // "Próximamente"
      }
      return m.import_imported(); // "Importado"
    }

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
    // Check if it's an upcoming or imported tournament
    if (tournament?.isImported) {
      const now = Date.now();
      if (tournament.tournamentDate && tournament.tournamentDate > now) {
        return '#8b5cf6'; // Purple for upcoming
      }
      return '#6366f1'; // Indigo for imported
    }

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
    // Upcoming and imported have dark backgrounds
    if (tournament?.isImported) {
      return 'white';
    }
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
        // Navigate directly to the appropriate page - keep loading visible
        const targetPage = nextStatus === 'GROUP_STAGE' ? 'groups' : 'bracket';
        await goto(`/admin/tournaments/${tournamentId}/${targetPage}`);
        // Don't reset isStarting - page is changing
        return;
      } else {
        toastMessage = m.admin_errorStartingTournament();
        toastType = 'error';
        showToast = true;
        isStarting = false;
      }
    } catch (err) {
      console.error('Error starting tournament:', err);
      toastMessage = m.admin_errorStartingTournament();
      toastType = 'error';
      showToast = true;
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
    // Initialize third place match toggle (default true)
    editThirdPlaceMatchEnabled = tournament.finalStage?.thirdPlaceMatchEnabled ?? true;
    // Initialize test toggle
    editIsTest = tournament.isTest ?? false;

    // Initialize metadata fields
    editDescription = tournament.description || '';
    editEdition = tournament.edition;
    editAddress = tournament.address || '';
    editCity = tournament.city || '';
    editCountry = tournament.country || '';
    editExternalLink = tournament.externalLink || '';
    editPosterUrl = tournament.posterUrl || '';

    showQuickEdit = true;
  }

  function closeQuickEdit() {
    showQuickEdit = false;
  }

  function handleVenueSelect(venue: { address?: string; city: string; country: string }) {
    editAddress = venue.address || '';
    editCity = venue.city;
    editCountry = venue.country;
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

  async function saveQuickEdit() {
    if (!tournamentId || !tournament) return;

    // Ensure at least 1 table
    if (editNumTables < 1) {
      editNumTables = 1;
    }

    isSavingQuickEdit = true;

    try {
      const updates: Partial<Tournament> = {
        name: editName.trim(),
        tournamentDate: editDate ? new Date(editDate).getTime() : undefined,
        numTables: editNumTables,
        show20s: editShow20s,
        showHammer: editShowHammer,
        isTest: editIsTest,
        rankingConfig: {
          enabled: editRankingEnabled,
          tier: editRankingTier
        },
        // Metadata fields
        description: editDescription.trim() || undefined,
        edition: editEdition || undefined,
        address: editAddress.trim() || undefined,
        city: editCity.trim() || undefined,
        country: editCountry.trim() || undefined,
        externalLink: editExternalLink.trim() || undefined,
        posterUrl: editPosterUrl.trim() || undefined
      };

      // Update finalStage options if it exists
      if (tournament.finalStage) {
        updates.finalStage = {
          ...tournament.finalStage,
          consolationEnabled: editConsolationEnabled,
          thirdPlaceMatchEnabled: editThirdPlaceMatchEnabled
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
                {#if tournament.isImported}
                  <span class="info-badge imported-badge">
                    📥 {m.import_imported()}
                  </span>
                {/if}
                {#if tournament.isTest}
                  <span class="info-badge test-badge">
                    🧪 {m.tournament_test()}
                  </span>
                {/if}
                <span class="info-badge participants-badge">
                  {tournament.participants.length} {m.admin_participants()}
                </span>
                {#if tournament.status !== 'COMPLETED' && tournament.status !== 'CANCELLED'}
                  <TournamentKeyBadge tournamentKey={tournament.key} compact={true} showQRButton={true} />
                {/if}
              </div>
            </div>
          </div>

          <div class="header-actions">
            {#if isUpcoming()}
              <!-- Upcoming tournament: show "Complete Configuration" button -->
              <button class="action-btn primary upcoming" onclick={() => goto(`/admin/tournaments/import?edit=${tournamentId}`)}>
                {m.tournament_completeConfiguration()}
              </button>
              <button class="action-btn danger" onclick={confirmCancel}>
                {m.common_cancel()}
              </button>
            {:else if tournament.status === 'DRAFT'}
              <button class="action-btn primary" onclick={confirmStart} disabled={isStarting}>
                {isStarting ? m.admin_starting() + '...' : m.admin_start()}
              </button>
              <button class="action-btn" onclick={() => goto(tournament.isImported ? `/admin/tournaments/import?edit=${tournamentId}` : `/admin/tournaments/create?edit=${tournamentId}`)}>
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
            {:else if tournament.status === 'COMPLETED'}
              <button class="action-btn" onclick={openQuickEdit}>
                {m.admin_edit()}
              </button>
            {/if}
            <button
              class="icon-btn"
              title={m.admin_tournamentAdmins()}
              onclick={() => showAdminsModal = true}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </button>
            <a href="/tournaments/{tournamentId}" class="public-link" title="Ver página pública">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </a>
            <ThemeToggle />
          </div>
        </div>

        {#if timeRemaining && ['GROUP_STAGE', 'TRANSITION', 'FINAL_STAGE'].includes(tournament.status)}
          <div class="header-progress-bar">
            <TimeProgressBar
              percentComplete={timeRemaining.percentComplete}
              remainingMinutes={timeRemaining.remainingMinutes}
              showEstimatedEnd={true}
              compact={false}
              clickable={true}
              onclick={openTimeBreakdown}
            />
          </div>
        {/if}
      {:else}
        <div class="header-row">
          <button class="back-btn" onclick={() => goto('/admin/tournaments')}>
            ←
          </button>
          <div class="header-main"></div>
          <div class="header-actions">
            <ThemeToggle />
          </div>
        </div>
      {/if}
    </header>

    <!-- Loading Overlay -->
    <LoadingOverlay show={loading} message={m.admin_loadingTournament()} />

    <!-- Content -->
    <div class="page-content">
      {#if loading}
        <!-- Content hidden while loading -->
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
          <!-- Completed Tournament Results Section (at the top) - hide for upcoming/no results -->
          {#if tournament.status === 'COMPLETED' && !isUpcoming() && hasResults()}
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

              {#if tournament.externalLink}
                <div class="config-item">
                  <span class="config-label">{m.import_externalLink()}:</span>
                  <span class="config-value">
                    <a href={tournament.externalLink} target="_blank" rel="noopener noreferrer" class="external-link-value">
                      {new URL(tournament.externalLink).hostname} ↗
                    </a>
                  </span>
                </div>
              {/if}

              <div class="config-item">
                <span class="config-label">{m.admin_createdBy()}:</span>
                <span class="config-value">{tournament.createdBy?.userName || '-'}</span>
              </div>
            </div>
            <button class="rules-btn" onclick={() => showRules = true}>
              📋 {m.rules_viewRules()}
            </button>
          </section>

          <!-- Participants Section (only for DRAFT) -->
          {#if tournament.status === 'DRAFT' && tournament.participants.length > 0}
            <section class="dashboard-card participants-card">
              <h2>👥 {m.admin_participants()} ({tournament.participants.length})</h2>
              <div class="participants-grid">
                {#each tournament.participants as p}
                  <span class="participant-chip" class:guest={p.type === 'GUEST'}>
                    {getParticipantDisplayName(p, tournament.gameType === 'doubles')}
                  </span>
                {/each}
              </div>
              <button class="edit-participants-btn" onclick={() => goto(tournament.isImported ? `/admin/tournaments/import?edit=${tournamentId}` : `/admin/tournaments/create?edit=${tournamentId}&step=4`)}>
                ✏️ {m.admin_editParticipants()}
              </button>
            </section>
          {/if}

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
                <div class="config-item">
                  <span class="config-label">{m.wizard_thirdPlaceMatch()}:</span>
                  <span class="config-value">
                    {#if thirdPlaceMatchEnabled}
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
                        : `${goldConfig.semifinal.roundsToPlay ?? 4}r`}{(goldConfig.semifinal.matchesToWin ?? 1) > 1 ? ` · Pg${goldConfig.semifinal.matchesToWin}` : ''}
                    </span>
                  </div>
                  <div class="config-item phase-config">
                    <span class="config-label">{m.admin_final()}:</span>
                    <span class="config-value">
                      {goldConfig.final.gameMode === 'points'
                        ? `${goldConfig.final.pointsToWin ?? 9}p`
                        : `${goldConfig.final.roundsToPlay ?? 4}r`}{(goldConfig.final.matchesToWin ?? 1) > 1 ? ` · Pg${goldConfig.final.matchesToWin}` : ''}
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
                          : `${silverConfig.semifinal.roundsToPlay ?? 4}r`}{(silverConfig.semifinal.matchesToWin ?? 1) > 1 ? ` · Pg${silverConfig.semifinal.matchesToWin}` : ''}
                      </span>
                    </div>
                    <div class="config-item phase-config">
                      <span class="config-label">{m.admin_final()}:</span>
                      <span class="config-value">
                        {silverConfig.final.gameMode === 'points'
                          ? `${silverConfig.final.pointsToWin ?? 7}p`
                          : `${silverConfig.final.roundsToPlay ?? 4}r`}{(silverConfig.final.matchesToWin ?? 1) > 1 ? ` · Pg${silverConfig.final.matchesToWin}` : ''}
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
                        : `${config.earlyRounds.roundsToPlay ?? 4}r`}{(config.earlyRounds.matchesToWin ?? 1) > 1 ? ` · Pg${config.earlyRounds.matchesToWin}` : ''}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">{m.admin_semifinals()}:</span>
                    <span class="config-value">
                      {config.semifinal.gameMode === 'points'
                        ? `${config.semifinal.pointsToWin ?? 7}p`
                        : `${config.semifinal.roundsToPlay ?? 4}r`}{(config.semifinal.matchesToWin ?? 1) > 1 ? ` · Pg${config.semifinal.matchesToWin}` : ''}
                    </span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">{m.admin_final()}:</span>
                    <span class="config-value">
                      {config.final.gameMode === 'points'
                        ? `${config.final.pointsToWin ?? 7}p`
                        : `${config.final.roundsToPlay ?? 4}r`}{(config.final.matchesToWin ?? 1) > 1 ? ` · Pg${config.final.matchesToWin}` : ''}
                    </span>
                  </div>
                {:else}
                  <div class="config-item">
                    <span class="config-label">{m.admin_status()}:</span>
                    <span class="config-value">{m.admin_pendingConfiguration()}</span>
                  </div>
                {/if}
              </div>
              <p class="legend">{m.rules_legendPg()}</p>

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
    <div class="modal-backdrop" data-theme={$adminTheme} onmousedown={(e) => e.target === e.currentTarget && closeQuickEdit()} role="none" onkeydown={(e) => e.key === 'Escape' && closeQuickEdit()}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="quick-edit-modal" class:compact={tournament.status === 'COMPLETED'} role="dialog" aria-modal="true" tabindex="-1">
        <div class="quick-edit-header">
          <h2>{m.admin_tournamentSettings({ name: tournament.name })}</h2>
          <button class="close-btn" onclick={closeQuickEdit}>×</button>
        </div>

        <div class="quick-edit-body" class:single-column={tournament.status === 'COMPLETED'}>
          {#if tournament.status === 'COMPLETED'}
            <!-- Compact layout for completed tournaments -->
            <div class="qe-row">
              <div class="qe-field" style="width: 80px;">
                <label for="edit-edition">{m.wizard_edition()}</label>
                <input type="number" id="edit-edition" bind:value={editEdition} min="1" placeholder="—" />
              </div>
              <div class="qe-field" style="flex: 1;">
                <label for="edit-name">{m.admin_tournamentName()}</label>
                <input type="text" id="edit-name" bind:value={editName} placeholder={m.admin_tournamentName()} />
              </div>
              <div class="qe-field" style="width: 140px;">
                <label for="edit-date">{m.wizard_date()}</label>
                <input type="date" id="edit-date" bind:value={editDate} />
              </div>
            </div>

            <div class="qe-venue">
              <VenueSelector address={editAddress} city={editCity} country={editCountry} onselect={handleVenueSelect} theme={$adminTheme} />
            </div>

            <div class="qe-field">
              <label for="edit-description">{m.wizard_description()}</label>
              <textarea id="edit-description" bind:value={editDescription} placeholder={m.wizard_descriptionOptional()} rows="2"></textarea>
            </div>

            <div class="qe-grid cols-2">
              <div class="qe-field">
                <label for="edit-external-link-c">{m.admin_externalLink()}</label>
                <input type="url" id="edit-external-link-c" bind:value={editExternalLink} placeholder="https://..." />
              </div>
              <div class="qe-field">
                <label for="edit-poster-url-c">{m.admin_posterUrl()}</label>
                <input type="url" id="edit-poster-url-c" bind:value={editPosterUrl} placeholder="https://..." />
              </div>
            </div>

            <div class="qe-row qe-footer-row">
              <label class="qe-toggle">
                <input type="checkbox" bind:checked={editIsTest} />
                <span>{m.tournament_isTest()}</span>
              </label>
              <div class="qe-actions">
                <button class="qe-btn secondary" onclick={closeQuickEdit}>{m.common_cancel()}</button>
                <button class="qe-btn primary" onclick={saveQuickEdit} disabled={isSavingQuickEdit || !editName.trim()}>
                  {isSavingQuickEdit ? m.admin_saving() : m.admin_saveChanges()}
                </button>
              </div>
            </div>
          {:else}
            <!-- Full layout for active tournaments -->
            <div class="qe-section">
              <div class="qe-section-title">{m.admin_basicInfo()}</div>
              <div class="qe-grid cols-3">
                <div class="qe-field span-2">
                  <label for="edit-name">{m.admin_tournamentName()}</label>
                  <input type="text" id="edit-name" bind:value={editName} />
                </div>
                <div class="qe-field">
                  <label for="edit-date">{m.admin_dateLabel()}</label>
                  <input type="date" id="edit-date" bind:value={editDate} />
                </div>
              </div>
              <div class="qe-grid cols-edition-tables-venue">
                <div class="qe-field">
                  <label for="edit-edition">{m.wizard_edition()}</label>
                  <input type="number" id="edit-edition" bind:value={editEdition} min="1" placeholder="1, 2..." />
                </div>
                <div class="qe-field">
                  <label for="edit-tables">{m.admin_availableTables()}</label>
                  <input type="number" id="edit-tables" bind:value={editNumTables} min="1" max="50" />
                  <span class="qe-hint" class:warning={tablesWarning}>
                    {#if tablesWarning}{m.wizard_someRest({ max: maxPlayersForTables })}{:else}{maxPlayersForTables} {m.time_parallel()}{/if}
                  </span>
                </div>
                <div class="qe-field">
                  <span class="qe-label">{m.admin_location()}</span>
                  <div class="qe-venue-inline">
                    <VenueSelector address={editAddress} city={editCity} country={editCountry} onselect={handleVenueSelect} theme={$adminTheme} />
                  </div>
                </div>
              </div>
              <div class="qe-field">
                <label for="edit-description">{m.wizard_description()}</label>
                <textarea id="edit-description" bind:value={editDescription} placeholder={m.wizard_descriptionOptional()} rows="2"></textarea>
              </div>
              <div class="qe-grid cols-2">
                <div class="qe-field">
                  <label for="edit-external-link">{m.admin_externalLink()}</label>
                  <input type="url" id="edit-external-link" bind:value={editExternalLink} placeholder="https://..." />
                </div>
                <div class="qe-field">
                  <label for="edit-poster-url">{m.admin_posterUrl()}</label>
                  <input type="url" id="edit-poster-url" bind:value={editPosterUrl} placeholder="https://..." />
                </div>
              </div>
            </div>

            <div class="qe-divider"></div>

            <div class="qe-columns">
              <div class="qe-col">
                <div class="qe-section-title">{m.admin_gameOptions()}</div>
                <div class="qe-toggles">
                  <label class="qe-toggle-card">
                    <input type="checkbox" bind:checked={editShow20s} />
                    <span>{m.admin_track20s()}</span>
                  </label>
                  <label class="qe-toggle-card">
                    <input type="checkbox" bind:checked={editShowHammer} />
                    <span>{m.admin_showHammer()}</span>
                  </label>
                </div>

                {#if tournament.finalStage}
                  <div class="qe-subsection">
                    <div class="qe-subsection-title">{m.time_finalStage()}</div>
                    <label class="qe-toggle-row">
                      <span>{m.admin_consolationRounds()}</span>
                      <input type="checkbox" bind:checked={editConsolationEnabled} class="qe-switch" />
                    </label>
                    <label class="qe-toggle-row">
                      <span>{m.wizard_thirdPlaceMatch()}</span>
                      <input type="checkbox" bind:checked={editThirdPlaceMatchEnabled} class="qe-switch" />
                    </label>
                  </div>
                {/if}
              </div>

              <div class="qe-col">
                <div class="qe-section-title">{m.admin_rankingSystem()}</div>
                <label class="qe-toggle-row">
                  <span>{m.admin_rankingSystemEnabled()}</span>
                  <input type="checkbox" bind:checked={editRankingEnabled} class="qe-switch" />
                </label>
                {#if editRankingEnabled}
                  <div class="qe-field">
                    <label for="edit-tier">{m.admin_category()}</label>
                    <select id="edit-tier" bind:value={editRankingTier}>
                      <option value="CLUB">{m.admin_tierClub()} · 15p</option>
                      <option value="REGIONAL">{m.admin_tierRegional()} · 25p</option>
                      <option value="NATIONAL">{m.admin_tierNational()} · 40p</option>
                      <option value="MAJOR">{m.admin_tierMajor()} · 50p</option>
                    </select>
                  </div>
                {/if}

                <div class="qe-subsection">
                  <div class="qe-subsection-title">{m.tournament_isTest()}</div>
                  <label class="qe-toggle-row">
                    <span class="qe-hint-text">{m.tournament_isTestHint()}</span>
                    <input type="checkbox" bind:checked={editIsTest} class="qe-switch" />
                  </label>
                </div>
              </div>
            </div>

            <div class="qe-footer">
              <button class="qe-btn secondary" onclick={closeQuickEdit}>{m.common_cancel()}</button>
              <button class="qe-btn primary" onclick={saveQuickEdit} disabled={isSavingQuickEdit || !editName.trim()}>
                {isSavingQuickEdit ? m.admin_saving() + '...' : m.admin_saveChanges()}
              </button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} type={toastType} />

<!-- Action Loading Overlay -->
<LoadingOverlay show={isStarting || isSavingQuickEdit} message={isStarting ? m.tournament_starting() : m.admin_saving()} />

<TimeBreakdownModal
  bind:visible={showTimeBreakdown}
  breakdown={timeBreakdown}
  showRecalculate={true}
  onrecalculate={recalculateTime}
/>

{#if showRules && tournament}
  <TournamentRulesModal
    {tournament}
    theme={$adminTheme}
    onclose={() => showRules = false}
  />
{/if}

{#if showAdminsModal && tournament}
  <TournamentAdminsModal
    {tournament}
    onClose={() => showAdminsModal = false}
    onUpdated={loadTournament}
  />
{/if}

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

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) {
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

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .page-header {
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

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .back-btn {
    background: #0f1419;
    color: #8b9bb3;
  }

  .back-btn:hover {
    background: #e5e7eb;
    transform: translateX(-2px);
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .back-btn:hover {
    background: #2d3748;
  }

  .header-main {
    flex: 1;
    min-width: 0;
  }

  .title-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
  }

  .title-section h1 {
    font-size: 1.1rem;
    margin: 0;
    color: #1a1a1a;
    font-weight: 600;
    white-space: nowrap;
    transition: color 0.3s;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .title-section h1 {
    color: #e1e8ed;
  }

  .header-badges {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .header-progress-bar {
    padding: 0.5rem 1rem 0.75rem;
    background: linear-gradient(to bottom, transparent, rgba(102, 126, 234, 0.03));
    border-bottom: 1px solid #e5e7eb;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .header-progress-bar {
    background: linear-gradient(to bottom, transparent, rgba(102, 126, 234, 0.05));
    border-color: #2d3748;
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

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .info-badge {
    background: #0f1419;
    color: #8b9bb3;
  }

  .participants-badge {
    background: #dcfce7;
    color: #166534;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .participants-badge {
    background: #14532d;
    color: #86efac;
  }

  .imported-badge {
    background: #fef3c7;
    color: #92400e;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .imported-badge {
    background: #78350f;
    color: #fde68a;
  }

  .test-badge {
    background: #fef3c7;
    color: #92400e;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .test-badge {
    background: #78350f;
    color: #fde68a;
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

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .action-btn {
    background: #374151;
    color: #e1e8ed;
  }

  .action-btn:hover {
    background: #e5e7eb;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .action-btn:hover {
    background: #4b5563;
  }

  .action-btn.primary,
  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .action-btn.primary {
    background: var(--primary);
    color: white;
  }

  .action-btn.primary:hover:not(:disabled),
  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .action-btn.primary:hover:not(:disabled) {
    filter: brightness(1.1);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 40%, transparent);
    transform: translateY(-1px);
  }

  .action-btn.primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn.upcoming,
  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .action-btn.upcoming {
    background: #8b5cf6;
    color: white;
  }

  .action-btn.upcoming:hover,
  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .action-btn.upcoming:hover {
    background: #7c3aed;
  }

  .action-btn.danger {
    background: #fee2e2;
    color: #dc2626;
  }

  .action-btn.danger:hover {
    background: #fecaca;
  }

  .icon-btn,
  .public-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    color: #6b7280;
    transition: all 0.2s;
    border: none;
    background: transparent;
    cursor: pointer;
    text-decoration: none;
  }

  .icon-btn:hover,
  .public-link:hover {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary);
  }

  .icon-btn svg,
  .public-link svg {
    width: 18px;
    height: 18px;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .icon-btn,
  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .public-link {
    color: #8b9bb3;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .icon-btn:hover,
  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .public-link:hover {
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
  }

  /* Content */
  .page-content {
    width: 100%;
    padding: 1.5rem;
    flex: 1;
    min-height: 0;
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

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .error-state h3 {
    color: #e1e8ed;
  }

  .error-state p {
    color: #666;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .error-state p {
    color: #8b9bb3;
  }

  .primary-button {
    padding: 0.75rem 2rem;
    background: var(--primary);
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

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .dashboard-card {
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

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .dashboard-card h2 {
    color: #e1e8ed;
  }

  /* Configuration */
  .config-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  /* Participants section */
  .participants-card {
    border: 1px dashed #d1d5db;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .participants-card {
    border-color: #475569;
  }

  .participants-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }

  .participant-chip {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
    border-radius: 4px;
    white-space: nowrap;
    border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  }

  .participant-chip.guest {
    background: #fef3c7;
    color: #92400e;
    border-color: #fcd34d;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .participant-chip {
    background: color-mix(in srgb, var(--primary) 20%, transparent);
    color: var(--primary);
    border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .participant-chip.guest {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.3);
  }

  .edit-participants-btn {
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    color: #6b7280;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .edit-participants-btn:hover {
    background: #f9fafb;
    border-color: var(--primary);
    color: var(--primary);
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .edit-participants-btn {
    border-color: #475569;
    color: #94a3b8;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .edit-participants-btn:hover {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    border-color: var(--primary);
    color: var(--primary);
  }

  .rules-btn {
    margin-top: 1rem;
    width: 100%;
    padding: 0.55rem 1rem;
    background: transparent;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-family: 'Lexend', sans-serif;
    font-size: 0.8rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.15s;
  }

  .rules-btn:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .rules-btn {
    border-color: #374151;
    color: rgba(255, 255, 255, 0.8);
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .rules-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: #4b5563;
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

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .config-item {
    background: #0f1419;
  }

  .config-label {
    color: #666;
    font-weight: 500;
    transition: color 0.3s;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .config-label {
    color: #8b9bb3;
  }

  .config-value {
    color: #1a1a1a;
    font-weight: 600;
    text-align: right;
    transition: color 0.3s;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .config-value {
    color: #e1e8ed;
  }

  .config-value.duration-value {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.5rem;
    background: var(--primary);
    color: white;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .external-link-value {
    color: var(--primary);
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s;
  }

  .external-link-value:hover {
    color: #5a6fd6;
    text-decoration: underline;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .external-link-value {
    color: #8b9fd6;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .external-link-value:hover {
    color: #a8b8e0;
  }

  /* Bracket phase configuration */
  .config-item.bracket-header {
    margin-top: 0.5rem;
    padding: 0.3rem 0.6rem;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border-left: 3px solid var(--primary);
  }

  .config-item.bracket-header .config-label {
    font-weight: 600;
    color: #1a1a1a;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .config-item.bracket-header .config-label {
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

  .legend {
    font-size: 0.7rem;
    color: #888;
    margin: 0.75rem 0 0;
    text-align: right;
    font-style: italic;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .legend {
    color: #6b7a94;
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
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 50%, transparent);
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .consolation-badge.enabled {
    background: color-mix(in srgb, var(--primary) 25%, transparent);
    color: var(--primary);
    border-color: color-mix(in srgb, var(--primary) 60%, transparent);
  }

  .consolation-badge.disabled {
    background: #f3f4f6;
    color: #6b7280;
  }

  .tournament-page:is([data-theme='dark'], [data-theme='violet']) .consolation-badge.disabled {
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
    .page-header {
      padding: 0.5rem 0.75rem;
    }

    .header-row {
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .back-btn {
      width: 32px;
      height: 32px;
      font-size: 1rem;
    }

    .header-main {
      flex: 1;
      min-width: 0;
    }

    .title-section {
      gap: 0.25rem;
    }

    .title-section h1 {
      font-size: 0.95rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .header-badges {
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .status-badge,
    .info-badge {
      font-size: 0.6rem;
      padding: 0.15rem 0.4rem;
    }

    .header-actions {
      flex-shrink: 0;
      gap: 0.25rem;
    }

    .action-btn {
      padding: 0.3rem 0.5rem;
      font-size: 0.7rem;
      white-space: nowrap;
    }

    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 540px) {
    .header-row {
      row-gap: 0.5rem;
    }

    .header-main {
      order: 2;
      flex-basis: 100%;
    }

    .header-actions {
      order: 1;
      margin-left: auto;
    }

    .title-section h1 {
      font-size: 0.9rem;
    }

    .action-btn {
      padding: 0.35rem 0.6rem;
      font-size: 0.7rem;
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

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal {
    background: #1a2332;
  }

  .confirm-modal h2 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
    font-size: 1.5rem;
    transition: color 0.3s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal h2 {
    color: #e1e8ed;
  }

  .confirm-modal p {
    color: #666;
    margin-bottom: 1rem;
    transition: color 0.3s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal p {
    color: #8b9bb3;
  }

  .tournament-info {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    transition: all 0.3s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .tournament-info {
    background: #0f1419;
  }

  .tournament-info strong {
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .tournament-info strong {
    color: #e1e8ed;
  }

  .tournament-info span {
    color: #666;
    font-size: 0.9rem;
    transition: color 0.3s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .tournament-info span {
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

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .info-text {
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

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .cancel-btn {
    background: #0f1419;
    color: #e1e8ed;
  }

  .cancel-btn:hover {
    background: #e5e7eb;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .cancel-btn:hover {
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
    background: var(--primary);
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
    border-radius: 12px;
    width: 94%;
    max-width: 960px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .quick-edit-modal {
    background: #1a2332;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  }

  .quick-edit-modal.compact {
    max-width: 700px;
  }

  .quick-edit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    background: white;
    border-radius: 12px 12px 0 0;
    z-index: 1;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .quick-edit-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  .quick-edit-header h2 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #374151;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .quick-edit-header h2 {
    color: #e1e8ed;
  }

  .close-btn {
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 1.1rem;
    color: #9ca3af;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .close-btn:hover {
    background: #2d3748;
    color: #e1e8ed;
  }

  .quick-edit-body {
    padding: 1.25rem;
  }

  .quick-edit-body.single-column {
    padding: 1rem 1.25rem;
  }

  /* Compact layout (completed) */
  .qe-row {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.875rem;
  }

  .qe-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .qe-field label,
  .qe-label {
    font-size: 0.65rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-field label,
  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-label {
    color: #8b9bb3;
  }

  .qe-field input,
  .qe-field select,
  .qe-field textarea {
    padding: 0.5rem 0.625rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.8rem;
    background: #f9fafb;
    color: #1f2937;
    font-family: inherit;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-field input,
  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-field select,
  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-field textarea {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .qe-field input:focus,
  .qe-field select:focus,
  .qe-field textarea:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  .qe-field textarea {
    resize: vertical;
    min-height: 80px;
  }

  .qe-venue {
    margin-bottom: 0.875rem;
    padding: 0.5rem;
    background: #f3f4f6;
    border-radius: 8px;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-venue {
    background: #0f1419;
  }

  .qe-footer-row {
    margin-top: 1rem;
    padding-top: 0.875rem;
    border-top: 1px solid #e5e7eb;
    align-items: center;
    justify-content: space-between;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-footer-row {
    border-color: #2d3748;
  }

  .qe-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.8rem;
    color: #6b7280;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-toggle {
    color: #9ca3af;
  }

  .qe-toggle input {
    accent-color: var(--primary);
  }

  .qe-actions {
    display: flex;
    gap: 0.5rem;
  }

  .qe-btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }

  .qe-btn.secondary {
    background: #f3f4f6;
    color: #4b5563;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-btn.secondary {
    background: #2d3748;
    color: #9ca3af;
  }

  .qe-btn.secondary:hover {
    background: #e5e7eb;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-btn.secondary:hover {
    background: #374151;
  }

  .qe-btn.primary {
    background: var(--primary);
    color: white;
  }

  .qe-btn.primary:hover {
    background: #5a6fd6;
  }

  .qe-btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Full layout (active) */
  .qe-section {
    margin-bottom: 1rem;
  }

  .qe-section-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--primary);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 0.75rem;
  }

  .qe-grid {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .qe-grid.cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }

  .qe-grid.cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }

  .qe-grid.cols-edition-tables-venue {
    grid-template-columns: 90px 120px 1fr;
  }

  .qe-grid .span-2 {
    grid-column: span 2;
  }

  .qe-hint {
    font-size: 0.65rem;
    color: #9ca3af;
    margin-top: 0.2rem;
  }

  .qe-hint.warning {
    color: #d97706;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-hint {
    color: #6b7a94;
  }

  .qe-venue-inline {
    background: #f3f4f6;
    border-radius: 6px;
    padding: 0.35rem;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-venue-inline {
    background: #0f1419;
  }

  .qe-divider {
    height: 1px;
    background: #e5e7eb;
    margin: 1rem 0;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-divider {
    background: #2d3748;
  }

  .qe-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .qe-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .qe-toggles {
    display: flex;
    gap: 0.5rem;
  }

  .qe-toggle-card {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: #f3f4f6;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.8rem;
    color: #374151;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-toggle-card {
    background: #0f1419;
    color: #e1e8ed;
  }

  .qe-toggle-card:hover {
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
  }

  .qe-toggle-card:has(input:checked) {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }

  .qe-toggle-card input {
    accent-color: var(--primary);
  }

  .qe-subsection {
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-subsection {
    border-color: #2d3748;
  }

  .qe-subsection-title {
    font-size: 0.65rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 0.5rem;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-subsection-title {
    color: #8b9bb3;
  }

  .qe-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    color: #374151;
    margin-bottom: 0.375rem;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-toggle-row {
    background: #0f1419;
    color: #e1e8ed;
  }

  .qe-toggle-row:hover {
    background: #f3f4f6;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-toggle-row:hover {
    background: #1e293b;
  }

  .qe-hint-text {
    font-size: 0.75rem;
    color: #6b7280;
    flex: 1;
    padding-right: 0.5rem;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-hint-text {
    color: #8b9bb3;
  }

  .qe-switch {
    appearance: none;
    -webkit-appearance: none;
    width: 36px;
    height: 20px;
    background: #d1d5db;
    border-radius: 10px;
    position: relative;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .qe-switch::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    top: 2px;
    left: 2px;
    background: white;
    transition: all 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .qe-switch:checked {
    background: var(--primary);
  }

  .qe-switch:checked::before {
    transform: translateX(16px);
  }

  .qe-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .qe-footer {
    border-color: #2d3748;
  }

  /* Responsive */
  @media (max-width: 700px) {
    .quick-edit-modal {
      max-width: 100%;
      width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .quick-edit-header {
      border-radius: 0;
    }

    .qe-grid.cols-3 {
      grid-template-columns: 1fr 1fr;
    }

    .qe-grid .span-2 {
      grid-column: span 2;
    }

    .qe-columns {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .qe-row {
      flex-wrap: wrap;
    }
  }
</style>
