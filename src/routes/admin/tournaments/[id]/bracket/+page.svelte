<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import TournamentKeyBadge from '$lib/components/TournamentKeyBadge.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import MatchResultDialog from '$lib/components/tournament/MatchResultDialog.svelte';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { getTournament, subscribeTournament } from '$lib/firebase/tournaments';
  import { completeMatch, markNoShow } from '$lib/firebase/tournamentSync';
  import {
    updateBracketMatch,
    advanceWinner,
    updateSilverBracketMatch,
    advanceSilverWinner
  } from '$lib/firebase/tournamentBracket'; // For autoFill (SuperAdmin only)
  import { isSuperAdmin } from '$lib/firebase/admin';
  import type { Tournament, BracketMatch, GroupMatch } from '$lib/types/tournament';
  import { getPhaseConfig } from '$lib/utils/bracketPhaseConfig';

  let tournament: Tournament | null = null;
  let loading = true;
  let error = false;
  let showToast = false;
  let toastMessage = '';
  let showMatchDialog = false;
  let selectedMatch: BracketMatch | null = null;
  let selectedBracketType: 'gold' | 'silver' = 'gold';
  let selectedRoundNumber: number = 1;
  let selectedIsThirdPlace: boolean = false;
  let isSuperAdminUser = false;
  let isAutoFilling = false;
  let unsubscribe: (() => void) | null = null;

  // Current view for split divisions
  let activeTab: 'gold' | 'silver' = 'gold';

  $: tournamentId = $page.params.id;
  $: isSplitDivisions = tournament?.finalStage?.mode === 'SPLIT_DIVISIONS';

  // Gold bracket
  $: goldBracket = tournament?.finalStage?.bracket;
  $: goldRounds = goldBracket?.rounds || [];
  $: goldThirdPlaceMatch = goldBracket?.thirdPlaceMatch;

  // Silver bracket
  $: silverBracket = tournament?.finalStage?.silverBracket;
  $: silverRounds = silverBracket?.rounds || [];
  $: silverThirdPlaceMatch = silverBracket?.thirdPlaceMatch;

  // Active bracket based on tab
  $: bracket = activeTab === 'gold' ? goldBracket : silverBracket;
  $: rounds = activeTab === 'gold' ? goldRounds : silverRounds;
  $: thirdPlaceMatch = activeTab === 'gold' ? goldThirdPlaceMatch : silverThirdPlaceMatch;

  // Match configuration - determines if we show games won or total points
  $: matchesToWin = activeTab === 'gold'
    ? (tournament?.finalStage?.matchesToWin || 1)
    : (tournament?.finalStage?.silverMatchesToWin || 1);
  $: showGamesWon = matchesToWin > 1;

  onMount(async () => {
    await loadTournament();
    isSuperAdminUser = await isSuperAdmin();

    // Subscribe to real-time updates from Firebase
    if (tournamentId) {
      unsubscribe = subscribeTournament(tournamentId, (updated) => {
        if (updated) {
          tournament = updated;

          // Update selectedMatch if dialog is open to reflect real-time changes
          if (selectedMatch && showMatchDialog) {
            const selectedMatchId = selectedMatch.id;
            const bracket = selectedBracketType === 'gold'
              ? updated.finalStage?.bracket
              : updated.finalStage?.silverBracket;

            let foundMatch: BracketMatch | null = null;

            // Search in rounds
            for (const round of bracket?.rounds || []) {
              const found = round.matches.find(m => m.id === selectedMatchId);
              if (found) {
                foundMatch = found;
                break;
              }
            }
            // Search in third place match
            if (!foundMatch && bracket?.thirdPlaceMatch?.id === selectedMatchId) {
              foundMatch = bracket.thirdPlaceMatch;
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
      } else if (tournament.status !== 'FINAL_STAGE') {
        toastMessage = '⚠️ El torneo no está en fase final';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}`), 1500);
      } else if (!tournament.finalStage?.bracket) {
        toastMessage = '⚠️ El bracket no ha sido generado';
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

  function getParticipantName(participantId: string | undefined): string {
    if (!participantId) return 'TBD';
    if (!tournament) return 'Unknown';
    return tournament.participants.find(p => p.id === participantId)?.name || 'Unknown';
  }

  function getStatusDisplay(status: string): { text: string; color: string } {
    const statusMap: Record<string, { text: string; color: string }> = {
      PENDING: { text: 'Pendiente', color: '#6b7280' },
      IN_PROGRESS: { text: 'En curso', color: '#f59e0b' },
      COMPLETED: { text: 'Finalizado', color: '#10b981' },
      WALKOVER: { text: 'Walkover', color: '#8b5cf6' }
    };
    return statusMap[status] || { text: status, color: '#6b7280' };
  }

  function handleMatchClick(
    match: BracketMatch,
    bracketType: 'gold' | 'silver' = 'gold',
    roundNumber: number = 1,
    isThirdPlace: boolean = false
  ) {
    if (!match.participantA || !match.participantB) return;
    selectedMatch = match;
    selectedBracketType = bracketType;
    selectedRoundNumber = roundNumber;
    selectedIsThirdPlace = isThirdPlace;
    showMatchDialog = true;
  }

  async function handleSaveMatch(event: CustomEvent) {
    if (!selectedMatch || !tournamentId || !tournament) return;

    const result = event.detail;

    try {
      // Determine winner based on games won
      let winner: string;
      if (result.gamesWonA > result.gamesWonB) {
        winner = selectedMatch.participantA!;
      } else {
        winner = selectedMatch.participantB!;
      }

      // Use centralized sync service (handles both gold and silver brackets)
      const success = await completeMatch(
        tournamentId,
        selectedMatch.id,
        'FINAL',
        undefined,
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
        toastMessage = '✅ Resultado guardado';
        showMatchDialog = false;
        selectedMatch = null;
        // No need to reload - real-time subscription will update
      } else {
        toastMessage = '❌ Error al guardar resultado';
      }
      showToast = true;
    } catch (err) {
      console.error('Error saving match:', err);
      toastMessage = '❌ Error al guardar resultado';
      showToast = true;
    }
  }

  async function handleNoShow(event: CustomEvent) {
    if (!selectedMatch || !tournamentId) return;

    const noShowParticipantId = event.detail;

    try {
      // Use centralized sync service (handles both gold and silver brackets)
      const success = await markNoShow(
        tournamentId,
        selectedMatch.id,
        'FINAL',
        undefined,
        noShowParticipantId
      );

      if (success) {
        toastMessage = '✅ Walkover registrado';
        showMatchDialog = false;
        selectedMatch = null;
        // No need to reload - real-time subscription will update
      } else {
        toastMessage = '❌ Error al registrar walkover';
      }
      showToast = true;
    } catch (err) {
      console.error('Error handling no-show:', err);
      toastMessage = '❌ Error al registrar walkover';
      showToast = true;
    }
  }

  function handleCloseDialog() {
    showMatchDialog = false;
    selectedMatch = null;
  }

  /**
   * Auto-fill all pending bracket matches with random results (SuperAdmin only)
   * Simulates games until reaching pointsToWin (default 7) with 2+ point lead
   */
  async function autoFillAllMatches() {
    if (!tournament || !tournament.finalStage?.bracket || !tournamentId) return;

    isAutoFilling = true;
    let filledCount = 0;
    const currentTournamentId = tournamentId; // Store in local variable for TypeScript

    try {
      // Helper function to simulate a match for a specific bracket type
      async function simulateMatch(
        match: BracketMatch,
        bracketType: 'gold' | 'silver',
        config: { gameMode: 'points' | 'rounds'; pointsToWin: number; roundsToPlay: number; matchesToWin: number }
      ): Promise<boolean> {
        if (match.status !== 'PENDING' || !match.participantA || !match.participantB) {
          return false;
        }

        const { gameMode, pointsToWin, roundsToPlay, matchesToWin } = config;
        const isRoundsMode = gameMode === 'rounds';

        const requiredWins = Math.ceil(matchesToWin / 2);
        let gamesA = 0;
        let gamesB = 0;
        let totalPointsA = 0;
        let totalPointsB = 0;
        let total20sA = 0;
        let total20sB = 0;

        // Store all rounds with game number
        const allRounds: Array<{
          gameNumber: number;
          roundInGame: number;
          pointsA: number;
          pointsB: number;
          twentiesA: number;
          twentiesB: number;
        }> = [];

        let gameNumber = 0;
        while (gamesA < requiredWins && gamesB < requiredWins) {
          gameNumber++;
          let gamePointsA = 0;
          let gamePointsB = 0;
          let roundInGame = 0;

          // For rounds mode, play exactly roundsToPlay rounds
          // For points mode, play until reaching pointsToWin with 2+ lead
          const maxRoundsInGame = isRoundsMode ? roundsToPlay : 100; // 100 is a safety limit for points mode

          while (roundInGame < maxRoundsInGame) {
            roundInGame++;
            const distribution = Math.random();
            let roundPointsA = 0;
            let roundPointsB = 0;
            let round20sA = 0;
            let round20sB = 0;

            if (distribution < 0.45) {
              roundPointsA = 2;
              roundPointsB = 0;
              if (Math.random() < 0.12) round20sA = 1;
            } else if (distribution < 0.9) {
              roundPointsA = 0;
              roundPointsB = 2;
              if (Math.random() < 0.12) round20sB = 1;
            } else {
              roundPointsA = 1;
              roundPointsB = 1;
            }

            gamePointsA += roundPointsA;
            gamePointsB += roundPointsB;
            total20sA += round20sA;
            total20sB += round20sB;

            // Save round data
            allRounds.push({
              gameNumber,
              roundInGame,
              pointsA: roundPointsA,
              pointsB: roundPointsB,
              twentiesA: round20sA,
              twentiesB: round20sB
            });

            // Check game end condition
            if (!isRoundsMode) {
              // Points mode: check for win
              const maxPoints = Math.max(gamePointsA, gamePointsB);
              const diff = Math.abs(gamePointsA - gamePointsB);
              if (maxPoints >= pointsToWin && diff >= 2) {
                break;
              }
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

        const winner = gamesA > gamesB ? match.participantA : match.participantB;

        // Use correct functions based on bracket type
        const updateMatch = bracketType === 'silver' ? updateSilverBracketMatch : updateBracketMatch;
        const advanceMatchWinner = bracketType === 'silver' ? advanceSilverWinner : advanceWinner;

        await updateMatch(currentTournamentId, match.id, {
          status: 'COMPLETED',
          gamesWonA: gamesA,
          gamesWonB: gamesB,
          totalPointsA,
          totalPointsB,
          total20sA,
          total20sB,
          rounds: allRounds,
          winner
        });

        if (winner) {
          await advanceMatchWinner(currentTournamentId, match.id, winner);
        }

        return true;
      }

      // Process a bracket (gold or silver)
      async function processBracket(bracketType: 'gold' | 'silver'): Promise<number> {
        let bracketFilledCount = 0;
        let hasMoreMatches = true;
        const isSilver = bracketType === 'silver';

        while (hasMoreMatches) {
          hasMoreMatches = false;

          // Reload tournament to get current bracket state
          tournament = await getTournament(currentTournamentId);
          if (!tournament?.finalStage) break;

          const currentBracket = bracketType === 'gold'
            ? tournament.finalStage.bracket
            : tournament.finalStage.silverBracket;

          if (!currentBracket) break;

          const totalRounds = currentBracket.totalRounds;

          // Process rounds in order
          for (const round of currentBracket.rounds) {
            // Get phase-specific config for this round
            const phaseConfig = getPhaseConfig(
              tournament.finalStage,
              round.roundNumber,
              totalRounds,
              false, // not third place
              isSilver
            );

            for (const match of round.matches) {
              if (await simulateMatch(match, bracketType, phaseConfig)) {
                hasMoreMatches = true;
                bracketFilledCount++;
              }
            }
          }

          // Also process 3rd place match if available
          const thirdPlace = currentBracket.thirdPlaceMatch;
          if (thirdPlace) {
            // 3rd place uses semifinal config
            const thirdPlaceConfig = getPhaseConfig(
              tournament.finalStage,
              totalRounds, // doesn't matter for third place
              totalRounds,
              true, // is third place
              isSilver
            );
            if (await simulateMatch(thirdPlace, bracketType, thirdPlaceConfig)) {
              hasMoreMatches = true;
              bracketFilledCount++;
            }
          }
        }

        return bracketFilledCount;
      }

      // Process gold bracket
      filledCount += await processBracket('gold');

      // Process silver bracket if SPLIT_DIVISIONS
      if (tournament.finalStage.mode === 'SPLIT_DIVISIONS' && tournament.finalStage.silverBracket) {
        filledCount += await processBracket('silver');
      }

      toastMessage = `✅ ${filledCount} partidos rellenados automáticamente`;
      showToast = true;
      await loadTournament(); // Final reload
    } catch (err) {
      console.error('Error auto-filling bracket matches:', err);
      toastMessage = '❌ Error al rellenar partidos';
      showToast = true;
    } finally {
      isAutoFilling = false;
    }
  }

  // Convert BracketMatch to GroupMatch format for the dialog
  $: dialogMatch = selectedMatch ? {
    ...selectedMatch,
    id: selectedMatch.id,
    participantA: selectedMatch.participantA!,
    participantB: selectedMatch.participantB!,
    status: selectedMatch.status,
    gamesWonA: selectedMatch.gamesWonA,
    gamesWonB: selectedMatch.gamesWonB,
    totalPointsA: selectedMatch.totalPointsA,
    totalPointsB: selectedMatch.totalPointsB,
    total20sA: selectedMatch.total20sA,
    total20sB: selectedMatch.total20sB,
    rounds: selectedMatch.rounds,
    winner: selectedMatch.winner,
    noShowParticipant: selectedMatch.noShowParticipant
  } as GroupMatch : null;
</script>

<AdminGuard>
  <div class="bracket-page" data-theme={$adminTheme}>
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
              Fase Final - {isSplitDivisions ? 'Liga Oro / Liga Plata' : 'Bracket de Eliminación'}
            </p>
            <TournamentKeyBadge tournamentKey={tournament.key} />
          </div>
          {#if isSuperAdminUser}
            <div class="header-actions">
              <button
                class="action-btn autofill"
                on:click={autoFillAllMatches}
                disabled={isAutoFilling}
                title="Solo visible para SuperAdmin - Rellenar partidos con resultados aleatorios"
              >
                {isAutoFilling ? '⏳ Rellenando...' : '🎲 Auto-rellenar'}
              </button>
            </div>
          {/if}
        </div>

        <!-- Tabs for SPLIT_DIVISIONS -->
        {#if isSplitDivisions}
          <div class="bracket-tabs">
            <button
              class="tab-btn"
              class:active={activeTab === 'gold'}
              on:click={() => activeTab = 'gold'}
            >
              🥇 Liga Oro
              {#if goldBracket?.thirdPlaceMatch?.winner || goldRounds[goldRounds.length - 1]?.matches[0]?.winner}
                <span class="tab-complete">✓</span>
              {/if}
            </button>
            <button
              class="tab-btn"
              class:active={activeTab === 'silver'}
              on:click={() => activeTab = 'silver'}
            >
              🥈 Liga Plata
              {#if silverBracket?.thirdPlaceMatch?.winner || silverRounds[silverRounds.length - 1]?.matches[0]?.winner}
                <span class="tab-complete">✓</span>
              {/if}
            </button>
          </div>
        {/if}
      {/if}
    </header>

    <div class="page-content">
      {#if loading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Cargando bracket...</p>
        </div>
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Error al cargar</h3>
          <p>No se pudo cargar el bracket del torneo.</p>
          <button class="primary-button" on:click={() => goto('/admin/tournaments')}>
            Volver a Torneos
          </button>
        </div>
      {:else if bracket}
        <!-- Bracket title for split divisions -->
        {#if isSplitDivisions}
          <div class="bracket-title" class:gold={activeTab === 'gold'} class:silver={activeTab === 'silver'}>
            {activeTab === 'gold' ? '🥇 Liga Oro' : '🥈 Liga Plata'}
          </div>
        {/if}

        <div class="bracket-container" class:silver-bracket={activeTab === 'silver'}>
          {#each rounds as round (round.roundNumber)}
            <div class="bracket-round">
              <h2 class="round-name">{round.name}</h2>
              <div class="matches-column">
                {#each round.matches as match (match.id)}
                  {@const gamesCompleted = (match.gamesWonA || 0) + (match.gamesWonB || 0)}
                  {@const expectedCurrentGame = gamesCompleted + 1}
                  {@const maxRoundGameNumber = match.rounds?.length ? Math.max(...match.rounds.map(r => r.gameNumber || 1)) : 1}
                  {@const currentGameNumber = Math.max(expectedCurrentGame, maxRoundGameNumber)}
                  {@const currentGameRounds = match.rounds?.filter(r => (r.gameNumber || 1) === currentGameNumber) || []}
                  {@const livePointsA = currentGameRounds.reduce((sum, r) => sum + (r.pointsA || 0), 0)}
                  {@const livePointsB = currentGameRounds.reduce((sum, r) => sum + (r.pointsB || 0), 0)}
                  {@const gamesLeaderA = match.status === 'IN_PROGRESS' && (match.gamesWonA || 0) > (match.gamesWonB || 0)}
                  {@const gamesLeaderB = match.status === 'IN_PROGRESS' && (match.gamesWonB || 0) > (match.gamesWonA || 0)}
                  <div
                    class="bracket-match"
                    class:clickable={match.participantA && match.participantB}
                    on:click={() => handleMatchClick(match, activeTab, round.roundNumber, false)}
                    on:keydown={(e) => e.key === 'Enter' && handleMatchClick(match, activeTab, round.roundNumber, false)}
                    role="button"
                    tabindex="0"
                  >
                    <!-- Round count badge (top-left) - shows current round of CURRENT GAME (played + 1) -->
                    {#if match.status === 'IN_PROGRESS' && (currentGameRounds.length > 0 || match.rounds?.length)}
                      <div class="rounds-badge">R{currentGameRounds.length + 1}</div>
                    {/if}

                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantA}
                      class:tbd={!match.participantA}
                      class:games-leader={gamesLeaderA}
                    >
                      <span class="participant-name">{getParticipantName(match.participantA)}</span>
                      {#if match.seedA}
                        <span class="seed">#{match.seedA}</span>
                      {/if}
                      {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                        <span class="score">{showGamesWon ? (match.gamesWonA || 0) : (match.totalPointsA || 0)}</span>
                        {#if tournament.show20s && match.total20sA !== undefined}
                          <span class="twenties">🎯{match.total20sA}</span>
                        {/if}
                      {:else if match.status === 'IN_PROGRESS' && (match.gamesWonA !== undefined || match.rounds?.length)}
                        <!-- Solo mostrar puntos del juego actual (las partidas ganadas se ven en el badge inferior) -->
                        <span class="score in-progress">{livePointsA}</span>
                      {/if}
                    </div>

                    <div class="vs-divider"></div>

                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantB}
                      class:tbd={!match.participantB}
                      class:games-leader={gamesLeaderB}
                    >
                      <span class="participant-name">{getParticipantName(match.participantB)}</span>
                      {#if match.seedB}
                        <span class="seed">#{match.seedB}</span>
                      {/if}
                      {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                        <span class="score">{showGamesWon ? (match.gamesWonB || 0) : (match.totalPointsB || 0)}</span>
                        {#if tournament.show20s && match.total20sB !== undefined}
                          <span class="twenties">🎯{match.total20sB}</span>
                        {/if}
                      {:else if match.status === 'IN_PROGRESS' && (match.gamesWonB !== undefined || match.rounds?.length)}
                        <!-- Solo mostrar puntos del juego actual (las partidas ganadas se ven en el badge inferior) -->
                        <span class="score in-progress">{livePointsB}</span>
                      {/if}
                    </div>

                    {#if match.participantA && match.participantB}
                      {@const statusInfo = getStatusDisplay(match.status)}
                      <div class="status-badge" style="background: {statusInfo.color}">
                        {statusInfo.text}
                      </div>
                    {/if}

                    <!-- Games won badge (bottom-left) - only for multi-game matches in progress -->
                    {#if match.status === 'IN_PROGRESS' && showGamesWon && (match.gamesWonA !== undefined || match.gamesWonB !== undefined)}
                      {@const gA = match.gamesWonA || 0}
                      {@const gB = match.gamesWonB || 0}
                      {@const hasLeader = gA !== gB}
                      <div class="games-badge" class:has-leader={hasLeader} class:a-leads={gA > gB} class:b-leads={gB > gA}>
                        <span class:leading={gA > gB}>{gA}</span>
                        <span class="separator">-</span>
                        <span class:leading={gB > gA}>{gB}</span>
                      </div>
                    {/if}

                    <!-- 20s badge (bottom-right) - when in progress and show20s enabled, show current game 20s only -->
                    {#if match.status === 'IN_PROGRESS' && tournament.show20s}
                      {@const currentGame20sA = currentGameRounds.reduce((sum, r) => sum + (r.twentiesA || 0), 0)}
                      {@const currentGame20sB = currentGameRounds.reduce((sum, r) => sum + (r.twentiesB || 0), 0)}
                      <div class="twenties-badge">🎯 {currentGame20sA}-{currentGame20sB}</div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}

          <!-- 3rd/4th Place Match -->
          {#if thirdPlaceMatch}
            {@const thirdGamesCompleted = (thirdPlaceMatch.gamesWonA || 0) + (thirdPlaceMatch.gamesWonB || 0)}
            {@const thirdExpectedCurrentGame = thirdGamesCompleted + 1}
            {@const thirdMaxRoundGameNumber = thirdPlaceMatch.rounds?.length ? Math.max(...thirdPlaceMatch.rounds.map(r => r.gameNumber || 1)) : 1}
            {@const thirdCurrentGameNumber = Math.max(thirdExpectedCurrentGame, thirdMaxRoundGameNumber)}
            {@const thirdCurrentGameRounds = thirdPlaceMatch.rounds?.filter(r => (r.gameNumber || 1) === thirdCurrentGameNumber) || []}
            {@const thirdLivePointsA = thirdCurrentGameRounds.reduce((sum, r) => sum + (r.pointsA || 0), 0)}
            {@const thirdLivePointsB = thirdCurrentGameRounds.reduce((sum, r) => sum + (r.pointsB || 0), 0)}
            {@const thirdGamesLeaderA = thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdPlaceMatch.gamesWonA || 0) > (thirdPlaceMatch.gamesWonB || 0)}
            {@const thirdGamesLeaderB = thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdPlaceMatch.gamesWonB || 0) > (thirdPlaceMatch.gamesWonA || 0)}
            <div class="bracket-round third-place-round">
              <h2 class="round-name third-place">3º y 4º Puesto</h2>
              <div class="matches-column">
                <div
                  class="bracket-match third-place-match"
                  class:clickable={thirdPlaceMatch.participantA && thirdPlaceMatch.participantB}
                  on:click={() => handleMatchClick(thirdPlaceMatch, activeTab, bracket?.totalRounds || 1, true)}
                  on:keydown={(e) => e.key === 'Enter' && handleMatchClick(thirdPlaceMatch, activeTab, bracket?.totalRounds || 1, true)}
                  role="button"
                  tabindex="0"
                >
                  <!-- Round count badge (top-left) - shows current round of CURRENT GAME (played + 1) -->
                  {#if thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdCurrentGameRounds.length > 0 || thirdPlaceMatch.rounds?.length)}
                    <div class="rounds-badge">R{thirdCurrentGameRounds.length + 1}</div>
                  {/if}

                  <div
                    class="match-participant"
                    class:winner={thirdPlaceMatch.winner === thirdPlaceMatch.participantA}
                    class:tbd={!thirdPlaceMatch.participantA}
                    class:games-leader={thirdGamesLeaderA}
                  >
                    <span class="participant-name">{getParticipantName(thirdPlaceMatch.participantA)}</span>
                    {#if thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'WALKOVER'}
                      <span class="score">{showGamesWon ? (thirdPlaceMatch.gamesWonA || 0) : (thirdPlaceMatch.totalPointsA || 0)}</span>
                      {#if tournament.show20s && thirdPlaceMatch.total20sA !== undefined}
                        <span class="twenties">🎯{thirdPlaceMatch.total20sA}</span>
                      {/if}
                    {:else if thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdPlaceMatch.gamesWonA !== undefined || thirdPlaceMatch.rounds?.length)}
                      <!-- Solo mostrar puntos del juego actual -->
                      <span class="score in-progress">{thirdLivePointsA}</span>
                    {/if}
                  </div>

                  <div class="vs-divider"></div>

                  <div
                    class="match-participant"
                    class:winner={thirdPlaceMatch.winner === thirdPlaceMatch.participantB}
                    class:tbd={!thirdPlaceMatch.participantB}
                    class:games-leader={thirdGamesLeaderB}
                  >
                    <span class="participant-name">{getParticipantName(thirdPlaceMatch.participantB)}</span>
                    {#if thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'WALKOVER'}
                      <span class="score">{showGamesWon ? (thirdPlaceMatch.gamesWonB || 0) : (thirdPlaceMatch.totalPointsB || 0)}</span>
                      {#if tournament.show20s && thirdPlaceMatch.total20sB !== undefined}
                        <span class="twenties">🎯{thirdPlaceMatch.total20sB}</span>
                      {/if}
                    {:else if thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdPlaceMatch.gamesWonB !== undefined || thirdPlaceMatch.rounds?.length)}
                      <!-- Solo mostrar puntos del juego actual -->
                      <span class="score in-progress">{thirdLivePointsB}</span>
                    {/if}
                  </div>

                  {#if thirdPlaceMatch.participantA && thirdPlaceMatch.participantB}
                    {@const statusInfo = getStatusDisplay(thirdPlaceMatch.status)}
                    <div class="status-badge" style="background: {statusInfo.color}">
                      {statusInfo.text}
                    </div>
                  {/if}

                  <!-- Games won badge (bottom-left) - only for multi-game matches in progress -->
                  {#if thirdPlaceMatch.status === 'IN_PROGRESS' && showGamesWon && (thirdPlaceMatch.gamesWonA !== undefined || thirdPlaceMatch.gamesWonB !== undefined)}
                    {@const tgA = thirdPlaceMatch.gamesWonA || 0}
                    {@const tgB = thirdPlaceMatch.gamesWonB || 0}
                    {@const tHasLeader = tgA !== tgB}
                    <div class="games-badge" class:has-leader={tHasLeader} class:a-leads={tgA > tgB} class:b-leads={tgB > tgA}>
                      <span class:leading={tgA > tgB}>{tgA}</span>
                      <span class="separator">-</span>
                      <span class:leading={tgB > tgA}>{tgB}</span>
                    </div>
                  {/if}

                  <!-- 20s badge (bottom-right) - when in progress and show20s enabled, show current game 20s only -->
                  {#if thirdPlaceMatch.status === 'IN_PROGRESS' && tournament.show20s}
                    {@const thirdCurrentGame20sA = thirdCurrentGameRounds.reduce((sum, r) => sum + (r.twentiesA || 0), 0)}
                    {@const thirdCurrentGame20sB = thirdCurrentGameRounds.reduce((sum, r) => sum + (r.twentiesB || 0), 0)}
                    <div class="twenties-badge">🎯 {thirdCurrentGame20sA}-{thirdCurrentGame20sB}</div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</AdminGuard>

{#if showMatchDialog && dialogMatch && tournament}
  <MatchResultDialog
    match={dialogMatch}
    participants={tournament.participants}
    {tournament}
    visible={showMatchDialog}
    isBracket={true}
    bracketRoundNumber={selectedRoundNumber}
    bracketTotalRounds={bracket?.totalRounds || 1}
    bracketIsThirdPlace={selectedIsThirdPlace}
    bracketIsSilver={selectedBracketType === 'silver'}
    isAdmin={true}
    on:close={handleCloseDialog}
    on:save={handleSaveMatch}
    on:noshow={handleNoShow}
  />
{/if}

<Toast bind:visible={showToast} message={toastMessage} />

<style>
  .bracket-page {
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .bracket-page[data-theme='dark'] {
    background: #0f1419;
  }

  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 1.5rem 2rem;
    transition: background-color 0.3s, border-color 0.3s;
  }

  .bracket-page[data-theme='dark'] .page-header {
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

  .bracket-page[data-theme='dark'] .back-button {
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
    gap: 1rem;
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

  .header-content h1 {
    font-size: 1.3rem;
    margin: 0 0 0.3rem 0;
    color: #1a1a1a;
    font-weight: 700;
    transition: color 0.3s;
  }

  .bracket-page[data-theme='dark'] .header-content h1 {
    color: #e1e8ed;
  }

  .subtitle {
    font-size: 0.85rem;
    color: #666;
    margin: 0;
    transition: color 0.3s;
  }

  .bracket-page[data-theme='dark'] .subtitle {
    color: #8b9bb3;
  }

  .page-content {
    padding: 1.5rem;
    max-height: calc(100vh - 200px);
    overflow-y: auto;
    overflow-x: auto;
  }

  .page-content::-webkit-scrollbar {
    width: 10px;
    height: 10px;
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

  .bracket-page[data-theme='dark'] .page-content::-webkit-scrollbar-track {
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

  .bracket-page[data-theme='dark'] .error-state h3 {
    color: #e1e8ed;
  }

  .error-state p {
    color: #666;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .bracket-page[data-theme='dark'] .error-state p {
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

  .bracket-container {
    display: flex;
    gap: 6rem;
    padding: 1rem;
    min-width: max-content;
    align-items: stretch;
  }

  .bracket-round {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 250px;
    position: relative;
  }

  .round-name {
    font-size: 1.1rem;
    font-weight: 700;
    color: #1a1a1a;
    text-align: center;
    margin: 0 0 1rem 0;
    padding: 0.75rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.3s;
  }

  .bracket-page[data-theme='dark'] .round-name {
    background: #1a2332;
    color: #e1e8ed;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  /* Final round styling - gold/prominent (default) */
  .bracket-round:not(.third-place-round):last-of-type .round-name,
  .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .round-name {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f;
    box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4);
  }

  .bracket-page[data-theme='dark'] .bracket-round:not(.third-place-round):last-of-type .round-name,
  .bracket-page[data-theme='dark'] .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .round-name {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f;
  }

  /* Final round styling - silver bracket */
  .silver-bracket .bracket-round:not(.third-place-round):last-of-type .round-name,
  .silver-bracket .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .round-name {
    background: linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%);
    color: #374151;
    box-shadow: 0 4px 12px rgba(156, 163, 175, 0.4);
  }

  .bracket-page[data-theme='dark'] .silver-bracket .bracket-round:not(.third-place-round):last-of-type .round-name,
  .bracket-page[data-theme='dark'] .silver-bracket .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .round-name {
    background: linear-gradient(135deg, #6b7280 0%, #9ca3af 100%);
    color: #e5e7eb;
  }

  .matches-column {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    justify-content: space-around;
    position: relative;
    flex: 1;
  }

  /* Centering for final round (last round before 3rd place) */
  .bracket-round:not(.third-place-round):last-of-type .matches-column,
  .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .matches-column {
    justify-content: center;
  }

  .bracket-match {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.75rem;
    position: relative;
    transition: all 0.2s;
  }

  /* Connector lines between rounds */
  .bracket-match::after {
    content: '';
    position: absolute;
    left: 100%;
    top: 50%;
    width: 3rem;
    height: 2px;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    transform: translateY(-50%);
    z-index: 0;
  }

  .bracket-page[data-theme='dark'] .bracket-match::after {
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  }

  /* Remove connector from true final round (no 3rd place after) */
  .bracket-round:last-child:not(.third-place-round) .bracket-match::after {
    display: none;
  }

  /* But show connector when there's a 3rd place match after */
  .bracket-round:nth-last-child(2):not(.third-place-round) .bracket-match::after {
    display: block;
    width: 9rem;
    background: linear-gradient(90deg, #b8956e 0%, #d4a574 100%);
  }

  /* Vertical connector lines for pairs of matches */
  .bracket-match::before {
    content: '';
    position: absolute;
    left: calc(100% + 3rem);
    width: 2px;
    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
    z-index: 0;
  }

  .bracket-page[data-theme='dark'] .bracket-match::before {
    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  }

  /* Top match in pair - vertical line goes down */
  .bracket-match:nth-child(odd)::before {
    top: 50%;
    height: calc(100% + 2rem);
  }

  /* Bottom match in pair - vertical line goes up */
  .bracket-match:nth-child(even)::before {
    bottom: 50%;
    height: calc(100% + 2rem);
  }

  /* Remove vertical connectors from final round */
  .bracket-round:last-child .bracket-match::before {
    display: none;
  }

  /* For single match rounds (like finals), hide the before pseudo-element */
  .matches-column:has(> :only-child) .bracket-match::before {
    display: none;
  }

  /* Add horizontal line from vertical connector midpoint to next match */
  /* Apply to the second-to-last round (where pairs connect to next round) */
  .bracket-round:not(:last-child):not(:only-child) .matches-column::after {
    content: '';
    position: absolute;
    left: calc(100% + 3rem);
    top: 50%;
    width: 3rem;
    height: 2px;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    transform: translateY(-50%);
    z-index: 1;
  }

  .bracket-page[data-theme='dark'] .bracket-round:not(:last-child):not(:only-child) .matches-column::after {
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  }

  /* Hide connector from single-match columns (like when there's only 1 match in the round) */
  .matches-column:has(> :only-child)::after {
    display: none;
  }

  .bracket-page[data-theme='dark'] .bracket-match {
    background: #1a2332;
    border-color: #2d3748;
  }

  .bracket-match.clickable {
    cursor: pointer;
  }

  .bracket-match.clickable:hover {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
    transform: translateY(-2px);
  }

  .match-participant {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .match-participant.tbd {
    opacity: 0.5;
    font-style: italic;
  }

  .match-participant.winner {
    background: #f0fdf4;
    font-weight: 700;
    box-shadow: 0 0 0 2px #10b981;
  }

  .bracket-page[data-theme='dark'] .match-participant.winner {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
  }

  /* Líder en partidas ganadas (durante IN_PROGRESS) */
  .match-participant.games-leader {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(109, 40, 217, 0.1) 100%);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.5);
    animation: pulse-leader 2s ease-in-out infinite;
  }

  .match-participant.games-leader .participant-name {
    font-weight: 700;
    color: #7c3aed;
  }

  @keyframes pulse-leader {
    0%, 100% { box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.5); }
    50% { box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.7), 0 0 12px rgba(139, 92, 246, 0.3); }
  }

  .bracket-page[data-theme='dark'] .match-participant.games-leader {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(109, 40, 217, 0.2) 100%);
  }

  .bracket-page[data-theme='dark'] .match-participant.games-leader .participant-name {
    color: #a78bfa;
  }

  .participant-name {
    flex: 1;
    font-size: 0.9rem;
    color: #1a1a1a;
  }

  .bracket-page[data-theme='dark'] .participant-name {
    color: #e1e8ed;
  }

  .seed {
    font-size: 0.75rem;
    color: #6b7280;
    margin: 0 0.5rem;
  }

  .score {
    font-size: 1rem;
    font-weight: 700;
    color: #667eea;
    min-width: 1.5rem;
    text-align: center;
  }

  .score.in-progress {
    color: #f59e0b;
    animation: pulse-score 2s ease-in-out infinite;
  }

  @keyframes pulse-score {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }


  .twenties {
    font-size: 0.75rem;
    font-weight: 600;
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.1);
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
    margin-left: 0.25rem;
  }

  .vs-divider {
    height: 1px;
    background: #e5e7eb;
    margin: 0.5rem 0;
  }

  .bracket-page[data-theme='dark'] .vs-divider {
    background: #2d3748;
  }

  .bracket-page[data-theme='dark'] .twenties {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.15);
  }

  .status-badge {
    position: absolute;
    top: -10px;
    right: 10px;
    padding: 0.25rem 0.6rem;
    color: white;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .rounds-badge {
    position: absolute;
    top: -10px;
    left: 10px;
    padding: 0.25rem 0.5rem;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    animation: pulse-badge 2s ease-in-out infinite;
  }

  @keyframes pulse-badge {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.85; transform: scale(1.02); }
  }

  .bracket-page[data-theme='dark'] .rounds-badge {
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
  }

  .games-badge {
    position: absolute;
    bottom: -10px;
    left: 10px;
    padding: 0.25rem 0.5rem;
    background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
    color: white;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .games-badge .separator {
    opacity: 0.7;
  }

  .games-badge.has-leader {
    animation: pulse-winner 1.5s ease-in-out infinite;
  }

  .games-badge .leading {
    font-size: 0.85rem;
    color: #fef08a;
    text-shadow: 0 0 4px rgba(254, 240, 138, 0.5);
  }

  @keyframes pulse-winner {
    0%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4); }
    50% { transform: scale(1.05); box-shadow: 0 4px 12px rgba(139, 92, 246, 0.6); }
  }

  .bracket-page[data-theme='dark'] .games-badge {
    background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
  }

  .bracket-page[data-theme='dark'] .games-badge .leading {
    color: #fde047;
  }

  .twenties-badge {
    position: absolute;
    bottom: -10px;
    right: 10px;
    padding: 0.25rem 0.5rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .bracket-page[data-theme='dark'] .twenties-badge {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  }

  /* 3rd/4th place match styles */
  .third-place-round {
    margin-left: 2rem;
  }

  .round-name.third-place {
    background: linear-gradient(135deg, #d4a574 0%, #b8956e 100%);
    color: #5c4033;
    box-shadow: 0 2px 6px rgba(180, 137, 94, 0.3);
  }

  .bracket-page[data-theme='dark'] .round-name.third-place {
    background: linear-gradient(135deg, #a67c52 0%, #8b6914 100%);
    color: #fef3c7;
  }

  .third-place-match {
    border-color: #b8956e;
  }

  .third-place-match::after,
  .third-place-match::before {
    display: none !important;
  }

  .third-place-round .matches-column::after {
    display: none !important;
  }

  /* Bracket tabs for SPLIT_DIVISIONS */
  .bracket-tabs {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0.5rem;
    background: #f3f4f6;
    border-radius: 12px;
    width: fit-content;
  }

  .bracket-page[data-theme='dark'] .bracket-tabs {
    background: #0f1419;
  }

  .tab-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    background: transparent;
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tab-btn:hover {
    background: #e5e7eb;
  }

  .bracket-page[data-theme='dark'] .tab-btn {
    color: #8b9bb3;
  }

  .bracket-page[data-theme='dark'] .tab-btn:hover {
    background: #2d3748;
  }

  .tab-btn.active {
    background: white;
    color: #1a1a1a;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .bracket-page[data-theme='dark'] .tab-btn.active {
    background: #1a2332;
    color: #e1e8ed;
  }

  .tab-complete {
    color: #10b981;
    font-weight: 700;
  }

  /* Bracket title */
  .bracket-title {
    font-size: 1.5rem;
    font-weight: 700;
    text-align: center;
    padding: 1rem;
    margin-bottom: 1rem;
    border-radius: 12px;
  }

  .bracket-title.gold {
    background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%);
    color: #92400e;
  }

  .bracket-title.silver {
    background: linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%);
    color: #374151;
  }

  .bracket-page[data-theme='dark'] .bracket-title.gold {
    background: linear-gradient(135deg, #78350f 0%, #b45309 100%);
    color: #fbbf24;
  }

  .bracket-page[data-theme='dark'] .bracket-title.silver {
    background: linear-gradient(135deg, #374151 0%, #6b7280 100%);
    color: #e5e7eb;
  }

  @media (max-width: 768px) {
    .page-content {
      padding: 1rem;
    }

    .bracket-container {
      gap: 2rem;
    }

    .bracket-round {
      min-width: 200px;
    }

    .round-name {
      font-size: 1rem;
      padding: 0.6rem;
    }

    .bracket-match {
      padding: 0.6rem;
    }

    .match-participant {
      padding: 0.5rem;
    }

    .participant-name {
      font-size: 0.85rem;
    }

    .third-place-round {
      margin-left: 1rem;
    }

    .bracket-round:nth-last-child(2):not(.third-place-round) .bracket-match::after {
      width: 4rem;
    }
  }
</style>
