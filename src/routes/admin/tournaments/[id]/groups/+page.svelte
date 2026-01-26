<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import TournamentKeyBadge from '$lib/components/TournamentKeyBadge.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import GroupsView from '$lib/components/tournament/GroupsView.svelte';
  import MatchResultDialog from '$lib/components/tournament/MatchResultDialog.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import { t } from '$lib/stores/language';
  import TimeProgressBar from '$lib/components/TimeProgressBar.svelte';
  import TimeBreakdownModal from '$lib/components/TimeBreakdownModal.svelte';
  import { calculateRemainingTime, calculateTimeBreakdown, calculateTournamentTimeEstimate, type TimeBreakdown } from '$lib/utils/tournamentTime';
  import { getTournament, subscribeTournament, updateTournament } from '$lib/firebase/tournaments';
  import { transitionTournament } from '$lib/utils/tournamentStateMachine';
  import { completeMatch, markNoShow } from '$lib/firebase/tournamentSync';
  import { updateMatchResult } from '$lib/firebase/tournamentMatches'; // For autoFill (SuperAdmin only)
  import { generateSwissPairings } from '$lib/firebase/tournamentGroups';
  import { isSuperAdmin } from '$lib/firebase/admin';
  import { getUserProfile } from '$lib/firebase/userProfile';
  import type { Tournament, GroupMatch } from '$lib/types/tournament';

  let tournament: Tournament | null = null;
  let loading = true;
  let error = false;
  let showToast = false;
  let toastMessage = '';
  let toastType: 'success' | 'error' | 'info' | 'warning' = 'info';
  let showCompleteConfirm = false;
  let isTransitioning = false;
  let showMatchDialog = false;
  let selectedMatch: GroupMatch | null = null;
  let activeGroupId: string | null = null;
  let isSuperAdminUser = false;
  let canAutofillUser = false;
  let isAutoFilling = false;
  let unsubscribe: (() => void) | null = null;
  let showTimeBreakdown = false;
  let timeBreakdown: TimeBreakdown | null = null;

  $: tournamentId = $page.params.id;
  $: timeRemaining = tournament ? calculateRemainingTime(tournament) : null;

  // Translate group name based on language
  // Handles: identifiers (SINGLE_GROUP, GROUP_A), legacy Spanish names, and Swiss
  function translateGroupName(name: string): string {
    if (name === 'Swiss') return $t('swissSystem');
    // New identifier format
    if (name === 'SINGLE_GROUP') return $t('singleGroup');
    const idMatch = name.match(/^GROUP_([A-H])$/);
    if (idMatch) {
      return `${$t('group')} ${idMatch[1]}`;
    }
    // Legacy Spanish format (for existing tournaments)
    if (name === 'Grupo Único') return $t('singleGroup');
    const legacyMatch = name.match(/^Grupo ([A-H])$/);
    if (legacyMatch) {
      return `${$t('group')} ${legacyMatch[1]}`;
    }
    return name;
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
    timeBreakdown = calculateTimeBreakdown(tournament);
    await updateTournament(tournamentId, { timeEstimate });
    toastMessage = $t('timeRecalculated');
    toastType = 'success';
    showToast = true;
  }

  onMount(async () => {
    await loadTournament();
    isSuperAdminUser = await isSuperAdmin();
    const profile = await getUserProfile();
    canAutofillUser = profile?.canAutofill === true;

    // Subscribe to real-time updates from Firebase
    if (tournamentId) {
      unsubscribe = subscribeTournament(tournamentId, (updated) => {
        if (updated) {
          tournament = updated;

          // Update selectedMatch if dialog is open to reflect real-time changes
          if (selectedMatch && showMatchDialog && tournament?.groupStage?.groups) {
            const selectedMatchId = selectedMatch.id;
            let foundMatch: GroupMatch | null = null;

            // Search in all groups
            for (const group of tournament.groupStage.groups) {
              // Check schedule (Round Robin)
              if (group.schedule) {
                for (const round of group.schedule) {
                  const found = round.matches.find(m => m.id === selectedMatchId);
                  if (found) {
                    foundMatch = found;
                    break;
                  }
                }
              }
              // Check pairings (Swiss)
              if (!foundMatch && group.pairings) {
                for (const pairing of group.pairings) {
                  const found = pairing.matches.find(m => m.id === selectedMatchId);
                  if (found) {
                    foundMatch = found;
                    break;
                  }
                }
              }
              if (foundMatch) break;
            }

            if (foundMatch) {
              selectedMatch = foundMatch;
            }
          }
        }
      });
    }
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
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
        toastMessage = $t('tournamentNotInGroupStage');
        toastType = 'warning';
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
      toastMessage = $t('cannotEditByeMatch');
      toastType = 'warning';
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

  async function handleGenerateNextRound() {
    if (!tournament || !tournamentId) return;

    const currentRound = tournament.groupStage?.currentRound || 1;
    const nextRound = currentRound + 1;

    const success = await generateSwissPairings(tournamentId, nextRound);

    if (success) {
      toastMessage = $t('swissRoundGeneratedSuccess').replace('{n}', String(nextRound));
      toastType = 'success';
      showToast = true;
      await loadTournament();
    } else {
      toastMessage = $t('errorGeneratingSwissRound');
      toastType = 'error';
      showToast = true;
    }
  }

  async function handleSaveResult(event: CustomEvent) {
    if (!selectedMatch || !tournamentId) return;

    const result = event.detail;

    // Determine winner based on game mode
    const gameMode = tournament?.groupStage?.gameMode || 'rounds';
    let winner: string;

    if (gameMode === 'rounds') {
      // In rounds mode, compare total points
      winner = (result.totalPointsA || 0) > (result.totalPointsB || 0)
        ? selectedMatch.participantA
        : selectedMatch.participantB;
    } else {
      // In points mode, compare games won
      winner = result.gamesWonA > result.gamesWonB
        ? selectedMatch.participantA
        : selectedMatch.participantB;
    }

    const success = await completeMatch(
      tournamentId,
      selectedMatch.id,
      'GROUP',
      activeGroupId || undefined,
      {
        rounds: result.rounds || [],
        winner,
        gamesWonA: result.gamesWonA,
        gamesWonB: result.gamesWonB,
        totalPointsA: result.totalPointsA || 0,
        totalPointsB: result.totalPointsB || 0,
        total20sA: result.total20sA || 0,
        total20sB: result.total20sB || 0
      }
    );

    if (success) {
      toastMessage = $t('resultSavedSuccessfully');
      toastType = 'success';
      showToast = true;
      showMatchDialog = false;
      selectedMatch = null;
      // No need to reload - real-time subscription will update
    } else {
      toastMessage = $t('errorSavingResult');
      toastType = 'error';
      showToast = true;
    }
  }

  async function handleNoShow(event: CustomEvent) {
    if (!selectedMatch || !tournamentId) return;

    const noShowParticipantId = event.detail;
    const success = await markNoShow(
      tournamentId,
      selectedMatch.id,
      'GROUP',
      activeGroupId || undefined,
      noShowParticipantId
    );

    if (success) {
      toastMessage = $t('noShowRegisteredSuccessfully');
      toastType = 'success';
      showToast = true;
      showMatchDialog = false;
      selectedMatch = null;
      // No need to reload - real-time subscription will update
    } else {
      toastMessage = $t('errorRegisteringNoShow');
      toastType = 'error';
      showToast = true;
    }
  }

  function handleCloseDialog() {
    showMatchDialog = false;
    selectedMatch = null;
  }

  /**
   * Auto-fill pending matches with random results (SuperAdmin only)
   * For Swiss system: only fills matches of the current round
   * For Round Robin: fills all pending matches
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
      const isSwiss = tournament.groupStage.type === 'SWISS';
      const currentRound = tournament.groupStage.currentRound || 1;

      // Get matches to fill based on tournament type
      for (const group of tournament.groupStage.groups) {
        let matches: GroupMatch[];

        if (isSwiss && group.pairings) {
          // Swiss: only get matches from current round
          const currentRoundPairing = group.pairings.find(p => p.roundNumber === currentRound);
          matches = currentRoundPairing ? currentRoundPairing.matches : [];
        } else if (group.schedule) {
          // Round Robin: get all matches
          matches = group.schedule.flatMap(r => r.matches);
        } else if (group.pairings) {
          // Fallback for Swiss without current round filter
          matches = group.pairings.flatMap(p => p.matches);
        } else {
          matches = [];
        }

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
            rounds: Array<{
              gameNumber: number;
              roundInGame: number;
              pointsA: number | null;
              pointsB: number | null;
              twentiesA: number;
              twentiesB: number;
            }>;
          };

          if (gameMode === 'rounds') {
            // For rounds mode: distribute 2 points per round randomly
            let totalA = 0;
            let totalB = 0;
            let twentiesA = 0;
            let twentiesB = 0;
            const rounds: Array<{
              gameNumber: number;
              roundInGame: number;
              pointsA: number | null;
              pointsB: number | null;
              twentiesA: number;
              twentiesB: number;
            }> = [];

            for (let r = 0; r < roundsToPlay; r++) {
              // Randomly distribute 2 points (2-0, 1-1, 0-2)
              const distribution = Math.random();
              let roundPointsA = 0;
              let roundPointsB = 0;

              // Generate 20s more realistically (0-3 per player per round)
              // Higher chance of getting at least one 20
              const generate20s = () => {
                const roll = Math.random();
                if (roll < 0.35) return 0;      // 35% chance of 0
                if (roll < 0.65) return 1;      // 30% chance of 1
                if (roll < 0.85) return 2;      // 20% chance of 2
                return 3;                        // 15% chance of 3
              };

              let roundTwentiesA = generate20s();
              let roundTwentiesB = generate20s();

              if (distribution < 0.4) {
                roundPointsA = 2; // Team A wins round
              } else if (distribution < 0.8) {
                roundPointsB = 2; // Team B wins round
              } else {
                roundPointsA = 1; // Tie
                roundPointsB = 1;
              }

              totalA += roundPointsA;
              totalB += roundPointsB;
              twentiesA += roundTwentiesA;
              twentiesB += roundTwentiesB;

              rounds.push({
                gameNumber: 1,
                roundInGame: r + 1,
                pointsA: roundPointsA,
                pointsB: roundPointsB,
                twentiesA: roundTwentiesA,
                twentiesB: roundTwentiesB
              });
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
              total20sB: twentiesB,
              rounds
            };
          } else {
            // For points mode: play until someone reaches pointsToWin
            let gamesA = 0;
            let gamesB = 0;
            let totalPointsA = 0;
            let totalPointsB = 0;
            let total20sA = 0;
            let total20sB = 0;
            const rounds: Array<{
              gameNumber: number;
              roundInGame: number;
              pointsA: number | null;
              pointsB: number | null;
              twentiesA: number;
              twentiesB: number;
            }> = [];

            const requiredWins = Math.ceil(matchesToWin / 2);
            let gameNumber = 0;

            while (gamesA < requiredWins && gamesB < requiredWins) {
              gameNumber++;
              // Simulate a game
              let gamePointsA = 0;
              let gamePointsB = 0;
              let roundInGame = 0;

              while (gamePointsA < pointsToWin && gamePointsB < pointsToWin) {
                roundInGame++;
                // Each round, distribute 2 points
                const distribution = Math.random();
                let roundPointsA = 0;
                let roundPointsB = 0;
                let roundTwentiesA = 0;
                let roundTwentiesB = 0;

                // Generate 20s more realistically (0-3 per player per round)
                const generate20s = () => {
                  const roll = Math.random();
                  if (roll < 0.35) return 0;      // 35% chance of 0
                  if (roll < 0.65) return 1;      // 30% chance of 1
                  if (roll < 0.85) return 2;      // 20% chance of 2
                  return 3;                        // 15% chance of 3
                };

                roundTwentiesA = generate20s();
                roundTwentiesB = generate20s();

                if (distribution < 0.45) {
                  roundPointsA = 2;
                } else if (distribution < 0.9) {
                  roundPointsB = 2;
                } else {
                  roundPointsA = 1;
                  roundPointsB = 1;
                }

                gamePointsA += roundPointsA;
                gamePointsB += roundPointsB;
                total20sA += roundTwentiesA;
                total20sB += roundTwentiesB;

                rounds.push({
                  gameNumber,
                  roundInGame,
                  pointsA: roundPointsA,
                  pointsB: roundPointsB,
                  twentiesA: roundTwentiesA,
                  twentiesB: roundTwentiesB
                });
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
              total20sB,
              rounds
            };
          }

          // Save the result
          const success = await updateMatchResult(tournamentId, match.id, result);
          if (success) {
            filledCount++;
          }
        }
      }

      toastMessage = isSwiss
        ? $t('matchesFilledForRound').replace('{n}', String(filledCount)).replace('{round}', String(currentRound))
        : $t('matchesFilledAuto').replace('{n}', String(filledCount));
      toastType = 'success';
      showToast = true;
      await loadTournament(); // Reload to show updated results
    } catch (err) {
      console.error('Error auto-filling matches:', err);
      toastMessage = $t('errorFillingMatchesGeneric');
      toastType = 'error';
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
        toastMessage = $t('groupHasPendingMatches').replace('{group}', translateGroupName(group.name)).replace('{n}', String(incompleteMatches.length));
        toastType = 'error';
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
        toastMessage = $t('groupStageCompletedTransition');
        toastType = 'success';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}/transition`), 1500);
      } else {
        toastMessage = $t('errorCompletingGroupStage');
        toastType = 'error';
        showToast = true;
      }
    } catch (err) {
      console.error('Error completing group stage:', err);
      toastMessage = $t('errorCompletingGroupStage');
      toastType = 'error';
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
      {#if tournament}
        <div class="header-row">
          <button class="back-btn" on:click={() => goto(`/admin/tournaments/${tournamentId}`)}>←</button>
          <div class="header-main">
            <div class="title-section">
              <h1>{tournament.edition ? `#${tournament.edition} ` : ''}{tournament.name}</h1>
              <div class="header-badges">
                <span class="info-badge phase-badge">
                  {tournament.groupStage?.type === 'ROUND_ROBIN' ? $t('roundRobin') : $t('swissSystem')}
                  {#if tournament.groupStage?.numGroups && tournament.groupStage.numGroups > 1}
                    · {tournament.groupStage.numGroups} {$t('groups')}
                  {/if}
                </span>
                {#if tournament.status !== 'COMPLETED'}
                  <TournamentKeyBadge tournamentKey={tournament.key} compact={true} />
                {/if}
              </div>
              {#if timeRemaining && tournament.status !== 'COMPLETED'}
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
            {#if tournament.groupStage}
              {@const isSwiss = tournament.groupStage.type === 'SWISS'}
              {@const currentRound = tournament.groupStage.currentRound || 1}
              {@const totalSwissRounds = tournament.groupStage.numSwissRounds || tournament.numSwissRounds || 0}
              {@const allSwissRoundsComplete = isSwiss && currentRound >= totalSwissRounds && tournament.groupStage.groups.every(g => {
                const currentPairing = g.pairings?.find(p => p.roundNumber === currentRound);
                return currentPairing?.matches.every(m => m.status === 'COMPLETED' || m.status === 'WALKOVER' || m.participantB === 'BYE');
              })}
              {@const allRoundRobinComplete = !isSwiss && tournament.groupStage.groups.every(g => {
                const matches = g.schedule?.flatMap(r => r.matches) || [];
                return matches.every(m => m.status === 'COMPLETED' || m.status === 'WALKOVER' || m.participantB === 'BYE');
              })}
              {@const allMatchesComplete = allSwissRoundsComplete || allRoundRobinComplete}
              {#if (isSuperAdminUser || canAutofillUser) && !allMatchesComplete}
                <button
                  class="action-btn autofill"
                  on:click={autoFillAllMatches}
                  disabled={isAutoFilling}
                  title={isSwiss
                    ? `${$t('autoFillMatchesTitle')} - ${$t('round')} ${currentRound}`
                    : $t('autoFillMatchesTitle')}
                >
                  {#if isAutoFilling}
                    ⏳
                  {:else}
                    🎲
                  {/if}
                </button>
              {/if}
              {#if allMatchesComplete}
                <button
                  class="final-stage-btn"
                  on:click={confirmCompleteGroups}
                  disabled={isTransitioning}
                  title={$t('completeGroupStage')}
                >
                  <span class="btn-text">{$t('toFinalStage')}</span>
                  <span class="btn-icon">
                    {#if isTransitioning}
                      <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
                      </svg>
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    {/if}
                  </span>
                </button>
              {/if}
            {/if}
            <ThemeToggle />
          </div>
        </div>
      {/if}
    </header>

    <!-- Content -->
    <div class="page-content">
      {#if loading}
        <LoadingSpinner message={$t('loadingGroupStage')} />
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>{$t('errorLoading')}</h3>
          <p>{$t('couldNotLoadGroupStage')}</p>
          <button class="primary-button" on:click={() => goto('/admin/tournaments')}>
            {$t('backToTournaments')}
          </button>
        </div>
      {:else}
        <GroupsView {tournament} onMatchClick={handleMatchClick} {activeGroupId} onGenerateNextRound={handleGenerateNextRound} />
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
        <h2>✅ {$t('completeGroupStage')}</h2>
        <p>{$t('readyToCompleteGroups')}</p>
        <div class="tournament-info">
          <strong>{tournament.name}</strong>
          <br />
          <span>{$t('finalStandingsWillBeCalculated')}</span>
        </div>
        <p class="info-text">
          {#if tournament.phaseType === 'TWO_PHASE'}
            {$t('selectQualifiersAfter')}
          {:else}
            {$t('tournamentWillAdvanceDirectly')}
          {/if}
        </p>
        <div class="confirm-actions">
          <button class="cancel-btn" on:click={closeCompleteModal}>{$t('cancel')}</button>
          <button class="confirm-btn" on:click={completeGroupStage}>{$t('complete')}</button>
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
      isAdmin={true}
      on:close={handleCloseDialog}
      on:save={handleSaveResult}
      on:noshow={handleNoShow}
    />
  {/if}
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} type={toastType} />

<!-- Loading Overlay -->
{#if isTransitioning}
  <div class="loading-overlay" data-theme={$adminTheme}>
    <div class="loading-content">
      <LoadingSpinner size="large" message="Completando fase de grupos..." />
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
    padding: 0.75rem 1.5rem;
    transition: background-color 0.3s, border-color 0.3s;
    flex-shrink: 0;
  }

  .groups-page[data-theme='dark'] .page-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .back-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #555;
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .groups-page[data-theme='dark'] .back-btn {
    background: #0f1419;
    color: #8b9bb3;
    border-color: #2d3748;
  }

  .back-btn:hover {
    transform: translateX(-2px);
    border-color: #667eea;
    color: #667eea;
  }

  .header-main {
    flex: 1;
    min-width: 0;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .title-section h1 {
    font-size: 1.1rem;
    margin: 0;
    color: #1a1a1a;
    font-weight: 700;
    white-space: nowrap;
    transition: color 0.3s;
  }

  .groups-page[data-theme='dark'] .title-section h1 {
    color: #e1e8ed;
  }

  .header-badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .header-progress {
    margin-left: 0.5rem;
  }

  .info-badge {
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .info-badge.phase-badge {
    background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    color: #78350f;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .action-btn {
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  /* Final Stage Button - Professional CTA */
  .final-stage-btn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 1rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-family: 'Lexend', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
  }

  .final-stage-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
  }

  .final-stage-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
  }

  .final-stage-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .final-stage-btn .btn-text {
    white-space: nowrap;
  }

  .final-stage-btn .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    transition: transform 0.2s ease;
  }

  .final-stage-btn:hover:not(:disabled) .btn-icon {
    transform: translateX(2px);
  }

  .final-stage-btn .btn-icon svg {
    width: 0.75rem;
    height: 0.75rem;
  }

  .final-stage-btn .btn-icon .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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
    padding: 1.5rem;
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
    .page-header {
      padding: 0.5rem 0.75rem;
    }

    .header-row {
      gap: 0.5rem;
    }

    .back-btn {
      width: 32px;
      height: 32px;
      font-size: 1rem;
    }

    .title-section {
      gap: 0.5rem;
    }

    .title-section h1 {
      font-size: 0.95rem;
    }

    .header-badges {
      gap: 0.35rem;
    }

    .info-badge {
      font-size: 0.65rem;
      padding: 0.15rem 0.4rem;
    }

    .action-btn {
      padding: 0.4rem 0.5rem;
      font-size: 0.9rem;
    }

    .page-content {
      padding: 1rem;
    }
  }

  /* Extra small screens */
  @media (max-width: 480px) {
    .page-header {
      padding: 0.4rem 0.5rem;
    }

    .back-btn {
      width: 28px;
      height: 28px;
      font-size: 0.9rem;
    }

    .title-section h1 {
      font-size: 0.85rem;
    }

    .info-badge {
      font-size: 0.6rem;
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

  .loading-overlay .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e5e7eb;
    border-top-color: #10b981;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    font-size: 1.1rem;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 0.5rem;
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
