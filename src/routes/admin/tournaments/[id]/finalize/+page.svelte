<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import GroupStandings from '$lib/components/tournament/GroupStandings.svelte';
  import MatchSchedule from '$lib/components/tournament/MatchSchedule.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import * as m from '$lib/paraglide/messages.js';
  import { getTournament, updateTournamentPublic } from '$lib/firebase/tournaments';
  import { recalculateStandings } from '$lib/firebase/tournamentGroups';
  import { transitionTournament } from '$lib/utils/tournamentStateMachine';
  import type { Tournament, TiebreakerCriterion, GroupMatch, Group, RoundRobinRound, SwissPairing } from '$lib/types/tournament';
  import { getParticipantDisplayName } from '$lib/types/tournament';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Trophy from '@lucide/svelte/icons/trophy';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  let tournament = $state<Tournament | null>(null);
  let loading = $state(true);
  let error = $state(false);
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType = $state<'success' | 'error' | 'info' | 'warning'>('info');
  let isFinalizing = $state(false);
  let isRecalculating = $state(false);
  let showConfirmModal = $state(false);

  // Tiebreaker priority state
  let tiebreakerPriority = $state<TiebreakerCriterion[]>([]);

  // Player filter per group for match review
  let playerFilter = $state<Record<string, string>>({});
  // Expanded rounds per group (controlled state for MatchSchedule)
  let expandedRounds = $state<Record<string, Set<number>>>({});

  let tournamentId = $derived(page.params.id);
  let isDoubles = $derived(tournament?.gameType === 'doubles');
  let qualificationMode = $derived(tournament?.groupStage?.qualificationMode ?? 'WINS');
  let show20s = $derived(tournament?.show20s !== false);

  // Filter criteria based on tournament config
  let availableCriteria = $derived.by<TiebreakerCriterion[]>(() => {
    const all: TiebreakerCriterion[] = ['h2h', 'total20s', 'totalPoints', 'buchholz'];
    return all.filter(c => {
      if (c === 'totalPoints' && qualificationMode === 'POINTS') return false;
      if (c === 'total20s' && !show20s) return false;
      return true;
    });
  });

  // Detect unresolved ties from standings
  let hasUnresolvedTies = $derived(
    tournament?.groupStage?.groups?.some(group =>
      group.standings?.some(s => s.tieReason === 'unresolved')
    ) ?? false
  );

  // Criterion labels
  const criterionLabels: Record<TiebreakerCriterion, () => string> = {
    h2h: () => m.admin_tiebreakerH2h(),
    total20s: () => m.admin_tiebreakerTotal20s(),
    totalPoints: () => m.admin_tiebreakerTotalPoints(),
    buchholz: () => m.admin_tiebreakerBuchholz()
  };

  function initPriority() {
    const saved = tournament?.groupStage?.tiebreakerPriority;
    if (saved && saved.length > 0) {
      const filtered = saved.filter(c => availableCriteria.includes(c));
      const missing = availableCriteria.filter(c => !filtered.includes(c));
      tiebreakerPriority = [...filtered, ...missing];
    } else {
      tiebreakerPriority = [...availableCriteria];
    }
  }

  function moveCriterion(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tiebreakerPriority.length) return;
    const copy = [...tiebreakerPriority];
    [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
    tiebreakerPriority = copy;
  }

  // Get participant name helper
  function getParticipantName(participantId: string): string {
    if (!tournament) return '';
    const participant = tournament.participants.find(p => p.id === participantId);
    if (!participant) return '';
    return getParticipantDisplayName(participant, isDoubles);
  }

  // Count matches per group
  function getGroupMatchCount(group: Group): number {
    let count = 0;
    if (group.schedule) {
      for (const round of group.schedule) {
        const matches = Array.isArray(round.matches) ? round.matches : Object.values(round.matches || {});
        count += matches.length;
      }
    }
    if (group.pairings) {
      for (const pairing of group.pairings) {
        const matches = Array.isArray(pairing.matches) ? pairing.matches : Object.values(pairing.matches || {});
        count += matches.length;
      }
    }
    return count;
  }

  // Filter rounds by participant
  function filterRoundsByPlayer(
    rounds: RoundRobinRound[] | SwissPairing[] | undefined,
    participantId: string | undefined
  ): RoundRobinRound[] | SwissPairing[] | undefined {
    if (!rounds || !participantId) return rounds;
    return (rounds as any[]).map(round => {
      const matches = Array.isArray(round.matches) ? round.matches : Object.values(round.matches || {});
      return {
        ...round,
        matches: matches.filter((mt: GroupMatch) =>
          mt.participantA === participantId || mt.participantB === participantId
        )
      };
    }).filter(round => round.matches.length > 0);
  }

  onMount(async () => {
    if (!tournamentId) {
      error = true;
      loading = false;
      return;
    }

    try {
      tournament = await getTournament(tournamentId);
      if (!tournament || tournament.status !== 'TRANSITION' || tournament.phaseType !== 'GROUP_ONLY') {
        error = true;
      } else {
        initPriority();
      }
    } catch (err) {
      console.error('Error loading tournament:', err);
      error = true;
    } finally {
      loading = false;
    }
  });

  async function handleRecalculateWithPriority() {
    if (!tournamentId || !tournament || !tournament.groupStage) return;
    isRecalculating = true;

    try {
      await updateTournamentPublic(tournamentId, {
        groupStage: {
          ...tournament.groupStage,
          tiebreakerPriority
        }
      });

      await recalculateStandings(tournamentId);
      tournament = await getTournament(tournamentId);
      toastMessage = m.admin_standingsRecalculated();
      toastType = 'success';
      showToast = true;
    } catch (err) {
      console.error('Error recalculating:', err);
      toastMessage = m.admin_errorRecalculating();
      toastType = 'error';
      showToast = true;
    } finally {
      isRecalculating = false;
    }
  }

  async function finalizeTournament() {
    if (!tournamentId || !tournament) return;
    isFinalizing = true;
    showConfirmModal = false;

    try {
      const success = await transitionTournament(tournamentId, 'COMPLETED');

      if (success) {
        toastMessage = m.admin_tournamentFinalized();
        toastType = 'success';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}`), 1500);
        return;
      } else {
        toastMessage = m.admin_errorFinalizingTournament();
        toastType = 'error';
        showToast = true;
        isFinalizing = false;
      }
    } catch (err) {
      console.error('Error finalizing tournament:', err);
      toastMessage = m.admin_errorFinalizingTournament();
      toastType = 'error';
      showToast = true;
      isFinalizing = false;
    }
  }
</script>

<AdminGuard tournamentId={tournamentId}>
  <div class="finalize-page" data-theme={$adminTheme}>
    {#if loading}
      <LoadingSpinner />
    {:else if error || !tournament}
      <div class="error-state">
        <p>{m.admin_tournamentNotFound()}</p>
        <button onclick={() => goto('/admin/tournaments')}>
          {m.admin_backToTournaments()}
        </button>
      </div>
    {:else}
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <button class="back-btn" onclick={() => goto(`/admin/tournaments/${tournamentId}/groups`)}>
            <ArrowLeft size={20} />
          </button>
          <div class="header-info">
            <h1>{m.admin_finalizeTournament()}</h1>
            <span class="tournament-name">{tournament.edition ? `${tournament.edition}º ` : ''}{tournament.name}</span>
          </div>
        </div>
        <div class="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <!-- Description -->
      <div class="finalize-description">
        <p>{m.admin_finalizeTournamentDesc()}</p>
      </div>

      <!-- Tiebreaker Priorities -->
      <div class="tiebreaker-card">
        <div class="tiebreaker-header">
          <span class="tiebreaker-title">{m.admin_tiebreakerPriorities()}</span>
          <button
            class="recalculate-btn"
            onclick={handleRecalculateWithPriority}
            disabled={isRecalculating || isFinalizing}
          >
            <RefreshCw size={12} class={isRecalculating ? 'spinning' : ''} />
            {m.admin_tiebreakerRecalculate()}
          </button>
        </div>
        <div class="priority-list">
          {#each tiebreakerPriority as criterion, i (criterion)}
            <div class="priority-row">
              <div class="priority-arrows">
                <button
                  class="arrow-btn"
                  onclick={() => moveCriterion(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  class="arrow-btn"
                  onclick={() => moveCriterion(i, 1)}
                  disabled={i === tiebreakerPriority.length - 1}
                  aria-label="Move down"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              <span class="priority-rank">{i + 1}</span>
              <span class="priority-name">{criterionLabels[criterion]()}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Unresolved Ties Warning -->
      {#if hasUnresolvedTies}
        <div class="warning-banner">
          <CircleAlert size={18} />
          <span>{m.admin_unresolvedTiesWarning()}</span>
        </div>
      {/if}

      <!-- Group Standings -->
      {#each tournament.groupStage?.groups ?? [] as group, i (group.id)}
        <div class="standings-card">
          {#if (tournament.groupStage?.groups?.length ?? 0) > 1}
            <h2>{group.name}</h2>
          {/if}
          <GroupStandings
            standings={group.standings ?? []}
            participants={tournament.participants}
            isSwiss={tournament.groupStage?.type === 'SWISS'}
            qualificationMode={tournament.groupStage?.qualificationMode ?? 'WINS'}
            enableTiebreaker={true}
            isDoubles={isDoubles}
            showBuchholz={true}
          />
        </div>
      {/each}

      <!-- Match Review -->
      <div class="match-review-section">
        <h2 class="section-title">{m.admin_matchReview()}</h2>
        {#each tournament.groupStage?.groups ?? [] as group (group.id)}
          {@const matchCount = getGroupMatchCount(group)}
          {@const filteredPlayerId = playerFilter[group.id] || ''}
          {@const rawRounds = group.schedule || group.pairings}
          {@const rounds = filterRoundsByPlayer(rawRounds, filteredPlayerId || undefined)}
          {@const sortedParticipants = [...group.participants].sort((a, b) => getParticipantName(a).localeCompare(getParticipantName(b)))}
          <details class="match-review-group">
            <summary class="match-review-summary">
              <span class="match-review-label">
                {#if (tournament.groupStage?.groups?.length ?? 0) > 1}
                  {group.name} — {m.admin_matchCount({ count: matchCount })}
                {:else}
                  {m.admin_matchCount({ count: matchCount })}
                {/if}
              </span>
            </summary>
            <div class="match-review-content">
              <div class="match-review-toolbar">
                <select
                  class="player-filter"
                  value={playerFilter[group.id] || ''}
                  onchange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    playerFilter[group.id] = val;
                    playerFilter = { ...playerFilter };
                    if (val && rawRounds) {
                      const allRoundNums = new Set((rawRounds as any[]).map((r: any) => r.roundNumber));
                      expandedRounds[group.id] = allRoundNums;
                      expandedRounds = { ...expandedRounds };
                    }
                  }}
                  onclick={(e) => e.stopPropagation()}
                >
                  <option value="">{m.tournament_all()}</option>
                  {#each sortedParticipants as pid}
                    <option value={pid}>{getParticipantName(pid)}</option>
                  {/each}
                </select>
              </div>
              <MatchSchedule
                rounds={rounds}
                participants={tournament.participants}
                gameMode={tournament.groupStage?.gameMode}
                isDoubles={isDoubles}
                matchesToWin={tournament.groupStage?.matchesToWin}
                groupStageType={tournament.groupStage?.type}
                expandedRoundsState={expandedRounds[group.id] ?? null}
                onExpandedRoundsChange={(newExpanded) => {
                  expandedRounds[group.id] = newExpanded;
                  expandedRounds = { ...expandedRounds };
                }}
              />
            </div>
          </details>
        {/each}
      </div>

      <!-- Actions -->
      <div class="actions-bar">
        <div></div>
        <button
          class="action-btn primary"
          onclick={() => showConfirmModal = true}
          disabled={isFinalizing || isRecalculating}
        >
          {#if isFinalizing}
            <span class="spinner-inline"></span>
          {/if}
          <Trophy size={16} />
          <span>{m.admin_finalizeTournament()}</span>
        </button>
      </div>
    {/if}

    <!-- Confirm Modal -->
    {#if showConfirmModal && tournament}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal-backdrop" onclick={() => showConfirmModal = false} role="none" onkeydown={(e) => e.key === 'Escape' && (showConfirmModal = false)}>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="confirm-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
          <h2>🏆 {m.admin_finalizeTournament()}</h2>
          <p>{m.admin_finalizeTournamentConfirm()}</p>
          {#if hasUnresolvedTies}
            <div class="warning-banner compact">
              <CircleAlert size={16} />
              <span>{m.admin_unresolvedTiesWarning()}</span>
            </div>
          {/if}
          <div class="confirm-actions">
            <button class="cancel-btn" onclick={() => showConfirmModal = false}>{m.common_cancel()}</button>
            <button class="confirm-btn" onclick={finalizeTournament}>{m.admin_finalizeTournament()}</button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Toast -->
    {#if showToast}
      <Toast
        message={toastMessage}
        type={toastType}
        onclose={() => showToast = false}
      />
    {/if}
  </div>
</AdminGuard>

<style>
  .finalize-page {
    padding: 1rem;
    min-height: 100vh;
    background: var(--background);
    color: var(--foreground);
  }

  .error-state {
    text-align: center;
    padding: 3rem 1rem;
  }

  .error-state button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--primary);
    color: var(--primary-foreground);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 0;
    margin-bottom: 1rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--card);
    color: var(--foreground);
    cursor: pointer;
    transition: background 0.15s;
  }

  .back-btn:hover {
    background: var(--accent);
  }

  .header-info h1 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
  }

  .tournament-name {
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .finalize-description {
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
    border-radius: 0.75rem;
    margin-bottom: 1rem;
  }

  .finalize-description p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--foreground);
  }

  .section-title {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
  }

  /* Tiebreaker Priorities — compact settings panel */
  .tiebreaker-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.75rem;
    margin-bottom: 1rem;
  }

  .tiebreaker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .tiebreaker-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .recalculate-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    background: transparent;
    color: var(--muted-foreground);
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .recalculate-btn:hover:not(:disabled) {
    color: var(--primary);
    border-color: var(--primary);
  }

  .recalculate-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .priority-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .priority-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    background: var(--background);
  }

  .priority-rank {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--muted-foreground);
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
    border-radius: 3px;
    flex-shrink: 0;
  }

  .priority-name {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--foreground);
  }

  .priority-arrows {
    display: flex;
    flex-shrink: 0;
    gap: 1px;
  }

  .arrow-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--muted-foreground);
    cursor: pointer;
    padding: 0;
    transition: all 0.1s;
  }

  .arrow-btn:first-child {
    border-radius: 6px 0 0 6px;
  }

  .arrow-btn:last-child {
    border-radius: 0 6px 6px 0;
    border-left: none;
  }

  .arrow-btn:hover:not(:disabled) {
    color: var(--primary);
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    z-index: 1;
  }

  .arrow-btn:disabled {
    opacity: 0.2;
    cursor: default;
  }

  /* Warning Banner */
  .warning-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--destructive) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--destructive) 30%, transparent);
    border-radius: 0.75rem;
    margin-bottom: 1rem;
    color: var(--destructive);
    font-size: 0.85rem;
  }

  .warning-banner.compact {
    margin-bottom: 0;
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
  }

  /* Standings */
  .standings-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .standings-card h2 {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
  }

  /* Match Review */
  .match-review-section {
    margin-bottom: 1rem;
  }

  .match-review-group {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    margin-bottom: 0.5rem;
    overflow: hidden;
  }

  .match-review-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.65rem 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    color: var(--foreground);
    transition: background 0.15s;
  }

  .match-review-summary:hover {
    background: var(--accent);
  }

  .match-review-label {
    flex: 1;
  }

  .match-review-content {
    padding: 0 0.75rem 0.75rem;
  }

  /* Force single-column layout so match cards have enough width for names */
  .match-review-content :global(.matches-grid) {
    grid-template-columns: 1fr;
  }

  .match-review-toolbar {
    display: flex;
    justify-content: flex-end;
    padding-bottom: 0.5rem;
  }

  .player-filter {
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--foreground);
    max-width: 160px;
    text-overflow: ellipsis;
  }

  /* Actions Bar */
  .actions-bar {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 0;
    position: sticky;
    bottom: 0;
    background: var(--background);
    border-top: 1px solid var(--border);
    z-index: 10;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    background: var(--card);
    color: var(--foreground);
  }

  .action-btn.primary {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .action-btn.primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner-inline {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Confirm Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 1rem;
  }

  .confirm-modal {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    max-width: 420px;
    width: 100%;
  }

  .confirm-modal h2 {
    font-size: 1.1rem;
    margin: 0 0 0.75rem 0;
  }

  .confirm-modal p {
    font-size: 0.85rem;
    color: var(--muted-foreground);
    margin: 0 0 1rem 0;
    line-height: 1.5;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .cancel-btn, .confirm-btn {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border);
    transition: all 0.15s;
  }

  .cancel-btn {
    background: var(--card);
    color: var(--foreground);
  }

  .cancel-btn:hover {
    background: var(--accent);
  }

  .confirm-btn {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .confirm-btn:hover {
    filter: brightness(1.1);
  }
</style>
