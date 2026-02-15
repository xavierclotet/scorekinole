<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import OfflineIndicator from '$lib/components/OfflineIndicator.svelte';
  import { setSyncStatus } from '$lib/utils/networkStatus';
  import TournamentKeyBadge from '$lib/components/TournamentKeyBadge.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import GroupsView from '$lib/components/tournament/GroupsView.svelte';
  import MatchResultDialog from '$lib/components/tournament/MatchResultDialog.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import * as m from '$lib/paraglide/messages.js';
  import TimeProgressBar from '$lib/components/TimeProgressBar.svelte';
  import TimeBreakdownModal from '$lib/components/TimeBreakdownModal.svelte';
  import { calculateRemainingTime, calculateTimeBreakdown, calculateTournamentTimeEstimate, type TimeBreakdown } from '$lib/utils/tournamentTime';
  import { getTournament, subscribeTournament, updateTournament } from '$lib/firebase/tournaments';
  import { transitionTournament } from '$lib/utils/tournamentStateMachine';
  import { completeMatch, markNoShow } from '$lib/firebase/tournamentSync';
  import { updateMatchResult } from '$lib/firebase/tournamentMatches'; // For autoFill (SuperAdmin only)
  import { generateSwissPairings } from '$lib/firebase/tournamentGroups';
  import { disqualifyParticipant } from '$lib/firebase/tournamentParticipants';
  import type { Tournament, GroupMatch } from '$lib/types/tournament';
  import { Check, X } from '@lucide/svelte';

  let tournament: Tournament | null = $state(null);
  let loading = $state(true);
  let error = $state(false);
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType: 'success' | 'error' | 'info' | 'warning' = $state('info');
  let showCompleteConfirm = $state(false);
  let isTransitioning = $state(false);
  let showMatchDialog = $state(false);
  let selectedMatch: GroupMatch | null = $state(null);
  let activeGroupId: string | null = $state(null);
  let isAutoFilling = $state(false);
  let unsubscribe: (() => void) | null = $state(null);
  let showTimeBreakdown = $state(false);
  let timeBreakdown: TimeBreakdown | null = $state(null);

  // Disqualify confirmation
  let showDisqualifyConfirm = $state(false);
  let disqualifyTarget = $state<{ id: string; name: string } | null>(null);
  let isDisqualifying = $state(false);

  // Swiss rounds configuration
  let editedSwissRounds = $state(0);
  let isSavingSwissRounds = $state(false);

  let tournamentId = $derived(page.params.id);

  // Computed: whether Swiss rounds can be edited (value must be > current round)
  let isSwissTournament = $derived(tournament?.groupStage?.type === 'SWISS');
  let currentSwissRound = $derived(tournament?.groupStage?.currentRound || 1);
  let totalSwissRoundsValue = $derived(tournament?.groupStage?.numSwissRounds || tournament?.numSwissRounds || 0);
  let canSaveSwissRounds = $derived(editedSwissRounds > currentSwissRound && editedSwissRounds !== totalSwissRoundsValue);
  let timeRemaining = $derived(tournament ? calculateRemainingTime(tournament) : null);

  // Initialize editedSwissRounds when tournament loads
  $effect(() => {
    if (totalSwissRoundsValue > 0 && editedSwissRounds === 0) {
      editedSwissRounds = totalSwissRoundsValue;
    }
  });

  // Translate group name based on language
  // Handles: identifiers (SINGLE_GROUP, GROUP_A), legacy Spanish names, and Swiss
  function translateGroupName(name: string): string {
    if (name === 'Swiss') return m.admin_swissSystem();
    // New identifier format
    if (name === 'SINGLE_GROUP') return m.tournament_singleGroup();
    const idMatch = name.match(/^GROUP_([A-H])$/);
    if (idMatch) {
      return `${m.tournament_group()} ${idMatch[1]}`;
    }
    // Legacy Spanish format (for existing tournaments)
    if (name === 'Grupo Único') return m.tournament_singleGroup();
    const legacyMatch = name.match(/^Grupo ([A-H])$/);
    if (legacyMatch) {
      return `${m.tournament_group()} ${legacyMatch[1]}`;
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
    toastMessage = m.admin_timeRecalculated();
    toastType = 'success';
    showToast = true;
  }

  async function saveSwissRounds() {
    if (!tournament || !tournamentId || !tournament.groupStage) return;
    if (editedSwissRounds <= currentSwissRound) {
      toastMessage = m.admin_swissRoundsMinError({ n: currentSwissRound });
      toastType = 'error';
      showToast = true;
      return;
    }

    isSavingSwissRounds = true;
    try {
      await updateTournament(tournamentId, {
        numSwissRounds: editedSwissRounds,
        groupStage: {
          ...tournament.groupStage,
          numSwissRounds: editedSwissRounds,
          totalRounds: editedSwissRounds
        }
      });
      toastMessage = m.admin_swissRoundsUpdated({ n: editedSwissRounds });
      toastType = 'success';
      showToast = true;
    } catch (err) {
      console.error('Error saving Swiss rounds:', err);
      toastMessage = m.admin_errorSavingChanges();
      toastType = 'error';
      showToast = true;
    } finally {
      isSavingSwissRounds = false;
    }
  }

  onMount(async () => {
    await loadTournament();

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
        toastMessage = m.admin_tournamentNotInGroupStage();
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
      toastMessage = m.admin_cannotEditByeMatch();
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
      toastMessage = m.admin_swissRoundGeneratedSuccess({ n: nextRound });
      toastType = 'success';
      showToast = true;
      await loadTournament();
    } else {
      toastMessage = m.admin_errorGeneratingSwissRound();
      toastType = 'error';
      showToast = true;
    }
  }

  async function handleSaveResult(result: {
    gamesWonA: number;
    gamesWonB: number;
    totalPointsA?: number;
    totalPointsB?: number;
    total20sA?: number;
    total20sB?: number;
    rounds?: Array<{
      gameNumber: number;
      roundInGame: number;
      pointsA: number | null;
      pointsB: number | null;
      twentiesA: number;
      twentiesB: number;
    }>;
  }) {
    if (!selectedMatch || !tournamentId) return;

    setSyncStatus('syncing');

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
      toastMessage = m.admin_resultSavedSuccessfully();
      toastType = 'success';
      showToast = true;
      showMatchDialog = false;
      selectedMatch = null;
      setSyncStatus('success');
      // No need to reload - real-time subscription will update
    } else {
      toastMessage = m.admin_errorSavingResult();
      toastType = 'error';
      showToast = true;
      setSyncStatus('error');
    }
  }

  async function handleNoShow(noShowParticipantId: string) {
    if (!selectedMatch || !tournamentId) return;
    const success = await markNoShow(
      tournamentId,
      selectedMatch.id,
      'GROUP',
      activeGroupId || undefined,
      noShowParticipantId
    );

    if (success) {
      toastMessage = m.admin_noShowRegisteredSuccessfully();
      toastType = 'success';
      showToast = true;
      showMatchDialog = false;
      selectedMatch = null;
      // No need to reload - real-time subscription will update
    } else {
      toastMessage = m.admin_errorRegisteringNoShow();
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

    // Collect all matches to process for batch writing
    const matchesToProcess: Array<{ matchId: string; result: {
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
    }}> = [];

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

            const requiredWins = matchesToWin;
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

          // Collect match data for batch processing
          matchesToProcess.push({ matchId: match.id, result });
        }
      }

      // Execute writes sequentially to avoid race conditions
      // (Each updateMatchResult reads/modifies/writes the entire groupStage)
      for (const { matchId, result } of matchesToProcess) {
        const success = await updateMatchResult(tournamentId, matchId, result);
        if (success) filledCount++;
      }

      toastMessage = isSwiss
        ? m.admin_matchesFilledForRound({ n: filledCount, round: currentRound })
        : m.admin_matchesFilledAuto({ n: filledCount });
      toastType = 'success';
      showToast = true;
      await loadTournament(); // Reload to show updated results
    } catch (err) {
      console.error('Error auto-filling matches:', err);
      toastMessage = m.admin_errorFillingMatchesGeneric();
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
        toastMessage = m.admin_groupHasPendingMatches({ group: translateGroupName(group.name), n: incompleteMatches.length });
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
        toastMessage = m.admin_groupStageCompletedTransition();
        toastType = 'success';
        showToast = true;
        // Keep loading visible during navigation - don't reset isTransitioning
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}/transition`), 1500);
        return; // Exit without resetting isTransitioning
      } else {
        toastMessage = m.admin_errorCompletingGroupStage();
        toastType = 'error';
        showToast = true;
        isTransitioning = false;
      }
    } catch (err) {
      console.error('Error completing group stage:', err);
      toastMessage = m.admin_errorCompletingGroupStage();
      toastType = 'error';
      showToast = true;
      isTransitioning = false;
    }
  }

  function handleDisqualify(participantId: string, participantName: string) {
    disqualifyTarget = { id: participantId, name: participantName };
    showDisqualifyConfirm = true;
  }

  function closeDisqualifyModal() {
    showDisqualifyConfirm = false;
    disqualifyTarget = null;
  }

  async function confirmDisqualify() {
    if (!disqualifyTarget || !tournamentId) return;

    isDisqualifying = true;
    try {
      const success = await disqualifyParticipant(tournamentId, disqualifyTarget.id);
      if (success) {
        toastMessage = m.admin_disqualifySuccess({ name: disqualifyTarget.name });
        toastType = 'success';
        showToast = true;
        closeDisqualifyModal();
        // Close the match dialog too
        showMatchDialog = false;
        selectedMatch = null;
      } else {
        toastMessage = m.admin_errorSavingChanges();
        toastType = 'error';
        showToast = true;
      }
    } catch (err) {
      console.error('Error disqualifying participant:', err);
      toastMessage = m.admin_errorSavingChanges();
      toastType = 'error';
      showToast = true;
    } finally {
      isDisqualifying = false;
    }
  }
</script>

<AdminGuard>
  <div class="groups-page" data-theme={$adminTheme}>
    <!-- Header -->
    <header class="page-header">
      {#if tournament}
        <div class="header-row">
          <button class="back-btn" onclick={() => goto(`/admin/tournaments/${tournamentId}`)}>←</button>
          <div class="header-main">
            <div class="title-section">
              <h1>{tournament.edition ? `#${tournament.edition} ` : ''}{tournament.name}</h1>
              <div class="header-badges">
                <span class="info-badge phase-badge">
                  {tournament.groupStage?.type === 'ROUND_ROBIN' ? m.admin_roundRobin() : m.tournament_swissSystem()}
                  {#if tournament.groupStage?.numGroups && tournament.groupStage.numGroups > 1}
                    · {tournament.groupStage.numGroups} {m.tournament_groups()}
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
                    onclick={openTimeBreakdown}
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
              {#if !allMatchesComplete}
                <button
                  class="action-btn autofill"
                  onclick={autoFillAllMatches}
                  disabled={isAutoFilling}
                  title={isSwiss
                    ? `${m.admin_autoFillMatchesTitle()} - ${m.tournament_round()} ${currentRound}`
                    : m.admin_autoFillMatchesTitle()}
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
                  onclick={confirmCompleteGroups}
                  disabled={isTransitioning}
                  title={m.admin_completeGroupStage()}
                >
                  <span class="btn-text">{m.admin_toFinalStage()}</span>
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
            <a href="/tournaments/{tournamentId}" class="public-link" title="Ver página pública">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </a>
            <OfflineIndicator />
            <ThemeToggle />
          </div>
        </div>
      {/if}
    </header>

    <!-- Content -->
    <div class="page-content">
      {#if loading}
        <LoadingSpinner message={m.admin_loadingGroupStage()} />
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>{m.admin_errorLoading()}</h3>
          <p>{m.admin_couldNotLoadGroupStage()}</p>
          <button class="primary-button" onclick={() => goto('/admin/tournaments')}>
            {m.admin_backToTournaments()}
          </button>
        </div>
      {:else}
        <!-- Swiss Rounds Configuration -->
        {#if isSwissTournament}
          <div class="swiss-config-section" data-theme={$adminTheme}>
            <div class="swiss-config-card">
              <div class="swiss-config-header">
                <span class="config-icon">⚙️</span>
                <span class="config-title">{m.admin_swissRoundsConfig()}</span>
              </div>
              <div class="swiss-config-content">
                <div class="config-row">
                  <label for="swissRoundsInput">{m.admin_swissRounds()}</label>
                  <div class="config-input-group">
                    <input
                      id="swissRoundsInput"
                      type="number"
                      bind:value={editedSwissRounds}
                      min={currentSwissRound + 1}
                      max={20}
                    />
                    <span class="current-round-hint">
                      ({m.tournament_round()} {currentSwissRound}/{totalSwissRoundsValue})
                    </span>
                  </div>
                </div>
                <button
                  class="save-swiss-btn"
                  onclick={saveSwissRounds}
                  disabled={!canSaveSwissRounds || isSavingSwissRounds}
                >
                  {#if isSavingSwissRounds}
                    {m.admin_saving()}
                  {:else}
                    {m.admin_saveChanges()}
                  {/if}
                </button>
              </div>
            </div>
          </div>
        {/if}

        <GroupsView {tournament} onMatchClick={handleMatchClick} {activeGroupId} onGenerateNextRound={handleGenerateNextRound} onDisqualify={handleDisqualify} />
      {/if}
    </div>
  </div>

  <!-- Complete Confirmation Modal -->
  {#if showCompleteConfirm && tournament}
    <div
      class="modal-backdrop"
      data-theme={$adminTheme}
      onclick={closeCompleteModal}
      onkeydown={(e) => e.key === 'Escape' && closeCompleteModal()}
      role="presentation"
    >
      <div class="confirm-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div class="modal-header">
          <div class="header-icon">
            <Check size={18} strokeWidth={2.5} />
          </div>
          <h2>{m.admin_completeGroupStage()}</h2>
          <button class="close-btn" onclick={closeCompleteModal} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div class="modal-body">
          <div class="tournament-name">{tournament.name}</div>
          <p class="info-text">
            {#if tournament.phaseType === 'TWO_PHASE'}
              {m.admin_selectQualifiersAfter()}
            {:else}
              {m.admin_tournamentWillAdvanceDirectly()}
            {/if}
          </p>
        </div>
        <div class="confirm-actions">
          <button class="cancel-btn" onclick={closeCompleteModal}>{m.common_cancel()}</button>
          <button class="confirm-btn" onclick={completeGroupStage}>{m.admin_complete()}</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Disqualify Confirmation Modal -->
  {#if showDisqualifyConfirm && disqualifyTarget}
    <div
      class="modal-backdrop"
      style="z-index: 1100;"
      data-theme={$adminTheme}
      onclick={closeDisqualifyModal}
      onkeydown={(e) => e.key === 'Escape' && closeDisqualifyModal()}
      role="presentation"
    >
      <div class="confirm-modal disqualify-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div class="modal-header danger">
          <div class="header-icon danger">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <h2>{m.admin_disqualifyConfirmTitle()}</h2>
          <button class="close-btn" onclick={closeDisqualifyModal} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div class="modal-body">
          <div class="tournament-name">{disqualifyTarget.name}</div>
          <p class="info-text">{m.admin_disqualifyConfirm({ name: disqualifyTarget.name })}</p>
          <p class="warning-text">{m.admin_disqualifyWarning()}</p>
        </div>
        <div class="confirm-actions">
          <button class="cancel-btn" onclick={closeDisqualifyModal}>{m.common_cancel()}</button>
          <button class="confirm-btn danger" onclick={confirmDisqualify} disabled={isDisqualifying}>
            {#if isDisqualifying}
              {m.admin_disqualifying?.() || '...'}
            {:else}
              {m.admin_disqualify()}
            {/if}
          </button>
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
      onclose={handleCloseDialog}
      onsave={handleSaveResult}
      onnoshow={handleNoShow}
      ondisqualify={handleDisqualify}
    />
  {/if}
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} type={toastType} />

<!-- Loading Overlay -->
{#if isTransitioning}
  <div class="loading-overlay" data-theme={$adminTheme}>
    <div class="loading-content">
      <LoadingSpinner size="large" message={m.admin_completingGroupStage()} />
    </div>
  </div>
{/if}

{#if isAutoFilling}
  <div class="loading-overlay" data-theme={$adminTheme}>
    <div class="loading-content">
      <LoadingSpinner size="large" message={m.admin_autoFillingMatches()} />
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
  .groups-page {
    min-height: 100vh;
    max-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .groups-page:is([data-theme='dark'], [data-theme='violet']) {
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

  .groups-page:is([data-theme='dark'], [data-theme='violet']) .page-header {
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

  .groups-page:is([data-theme='dark'], [data-theme='violet']) .back-btn {
    background: #0f1419;
    color: #8b9bb3;
    border-color: #2d3748;
  }

  .back-btn:hover {
    transform: translateX(-2px);
    border-color: var(--primary);
    color: var(--primary);
  }

  .public-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: #f3f4f6;
    color: #6b7280;
    transition: all 0.15s ease;
  }

  .public-link:hover {
    background: #e0f2fe;
    color: #0284c7;
  }

  .public-link svg {
    width: 16px;
    height: 16px;
  }

  .groups-page:is([data-theme='dark'], [data-theme='violet']) .public-link {
    background: #1f2937;
    color: #9ca3af;
  }

  .groups-page:is([data-theme='dark'], [data-theme='violet']) .public-link:hover {
    background: #0c4a6e;
    color: #7dd3fc;
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

  .groups-page:is([data-theme='dark'], [data-theme='violet']) .title-section h1 {
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
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-family: 'Lexend', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 25%, transparent);
  }

  .final-stage-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--primary) 35%, transparent);
  }

  .final-stage-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 25%, transparent);
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
    background: var(--primary);
    color: white;
  }

  .action-btn.autofill:hover:not(:disabled) {
    transform: translateY(-2px);
    filter: brightness(1.1);
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
    border-top-color: var(--primary);
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

  .groups-page:is([data-theme='dark'], [data-theme='violet']) .error-state h3 {
    color: #e1e8ed;
  }

  .error-state p {
    color: #666;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .groups-page:is([data-theme='dark'], [data-theme='violet']) .error-state p {
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
    border-radius: 10px;
    max-width: 340px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal {
    background: #1a2332;
  }

  .confirm-modal .modal-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal .modal-header {
    border-color: #2d3748;
  }

  .confirm-modal .header-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--primary);
    border-radius: 6px;
    color: white;
    flex-shrink: 0;
  }

  .confirm-modal h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #1a1a1a;
    flex: 1;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal h2 {
    color: #e1e8ed;
  }

  .confirm-modal .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s;
  }

  .confirm-modal .close-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal .close-btn:hover {
    background: #2d3748;
    color: #e1e8ed;
  }

  .confirm-modal .modal-body {
    padding: 1rem;
  }

  .confirm-modal .tournament-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--primary);
    margin-bottom: 0.5rem;
  }

  .confirm-modal .info-text {
    color: #64748b;
    font-size: 0.8rem;
    margin: 0;
    line-height: 1.4;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-modal .info-text {
    color: #8b9bb3;
  }

  .confirm-actions {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid #e5e7eb;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .confirm-actions {
    border-color: #2d3748;
  }

  .cancel-btn {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: #f3f4f6;
    color: #374151;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
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

  .confirm-btn {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .confirm-btn:hover {
    filter: brightness(1.1);
  }

  .confirm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Danger styles for disqualify modal */
  .modal-header.danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  }

  .header-icon.danger {
    background: rgba(255, 255, 255, 0.2);
  }

  .modal-header.danger h2 {
    color: white;
  }

  .modal-header.danger .close-btn {
    color: rgba(255, 255, 255, 0.8);
  }

  .modal-header.danger .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .warning-text {
    color: #dc2626;
    font-size: 0.75rem;
    margin: 0.5rem 0 0 0;
    line-height: 1.4;
    padding: 0.5rem;
    background: #fef2f2;
    border-radius: 4px;
  }

  .modal-backdrop:is([data-theme='dark'], [data-theme='violet']) .warning-text {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .confirm-btn.danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  }

  .confirm-btn.danger:hover:not(:disabled) {
    filter: brightness(1.1);
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

  .loading-overlay:is([data-theme='dark'], [data-theme='violet']) .loading-content {
    background: #1a2332;
  }

  .loading-overlay .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e5e7eb;
    border-top-color: var(--primary);
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

  .loading-overlay:is([data-theme='dark'], [data-theme='violet']) .loading-text {
    color: #e1e8ed;
  }

  .loading-subtext {
    font-size: 0.85rem;
    color: #6b7280;
    margin: 0;
  }

  .loading-overlay:is([data-theme='dark'], [data-theme='violet']) .loading-subtext {
    color: #8b9bb3;
  }

  /* Swiss Config Section */
  .swiss-config-section {
    margin-bottom: 1rem;
  }

  .swiss-config-card {
    background: white;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    padding: 0.75rem 1rem;
    transition: all 0.3s;
  }

  .swiss-config-section:is([data-theme='dark'], [data-theme='violet']) .swiss-config-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  .swiss-config-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .config-icon {
    font-size: 1rem;
  }

  .config-title {
    font-weight: 600;
    font-size: 0.85rem;
    color: #1a1a1a;
    transition: color 0.3s;
  }

  .swiss-config-section:is([data-theme='dark'], [data-theme='violet']) .config-title {
    color: #e1e8ed;
  }

  .swiss-config-content {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .config-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .config-row label {
    font-size: 0.8rem;
    color: #666;
    white-space: nowrap;
    transition: color 0.3s;
  }

  .swiss-config-section:is([data-theme='dark'], [data-theme='violet']) .config-row label {
    color: #8b9bb3;
  }

  .config-input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .config-input-group input {
    width: 60px;
    padding: 0.4rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.85rem;
    text-align: center;
    background: white;
    color: #1a1a1a;
    transition: all 0.2s;
  }

  .swiss-config-section:is([data-theme='dark'], [data-theme='violet']) .config-input-group input {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .config-input-group input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
  }

  .current-round-hint {
    font-size: 0.75rem;
    color: #888;
    white-space: nowrap;
    transition: color 0.3s;
  }

  .swiss-config-section:is([data-theme='dark'], [data-theme='violet']) .current-round-hint {
    color: #6b7280;
  }

  .save-swiss-btn {
    padding: 0.4rem 0.75rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .save-swiss-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
  }

  .save-swiss-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .swiss-config-content {
      flex-direction: column;
      align-items: flex-start;
    }

    .config-row {
      width: 100%;
      justify-content: space-between;
    }

    .save-swiss-btn {
      width: 100%;
      margin-top: 0.5rem;
    }
  }
</style>
