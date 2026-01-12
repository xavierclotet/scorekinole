<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import MatchResultDialog from '$lib/components/tournament/MatchResultDialog.svelte';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { getTournament } from '$lib/firebase/tournaments';
  import { updateBracketMatch, advanceWinner } from '$lib/firebase/tournamentBracket';
  import type { Tournament, BracketMatch, GroupMatch } from '$lib/types/tournament';

  let tournament: Tournament | null = null;
  let loading = true;
  let error = false;
  let showToast = false;
  let toastMessage = '';
  let showMatchDialog = false;
  let selectedMatch: BracketMatch | null = null;

  $: tournamentId = $page.params.id;
  $: bracket = tournament?.finalStage?.bracket;
  $: rounds = bracket?.rounds || [];

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

  function handleMatchClick(match: BracketMatch) {
    if (!match.participantA || !match.participantB) return;
    selectedMatch = match;
    showMatchDialog = true;
  }

  async function handleSaveMatch(event: CustomEvent) {
    if (!selectedMatch || !tournamentId || !tournament) return;

    const result = event.detail;

    try {
      // Determine winner based on games won
      let winner: string | undefined;
      if (result.gamesWonA > result.gamesWonB) {
        winner = selectedMatch.participantA;
      } else if (result.gamesWonB > result.gamesWonA) {
        winner = selectedMatch.participantB;
      }

      // Update match
      await updateBracketMatch(tournamentId, selectedMatch.id, {
        status: 'COMPLETED',
        gamesWonA: result.gamesWonA,
        gamesWonB: result.gamesWonB,
        totalPointsA: result.totalPointsA,
        totalPointsB: result.totalPointsB,
        total20sA: result.total20sA,
        total20sB: result.total20sB,
        rounds: result.rounds,
        winner
      });

      // Advance winner to next round
      if (winner) {
        await advanceWinner(tournamentId, selectedMatch.id, winner);
      }

      toastMessage = '✅ Resultado guardado';
      showToast = true;
      showMatchDialog = false;
      selectedMatch = null;

      // Reload tournament
      await loadTournament();
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
      const winner = selectedMatch.participantA === noShowParticipantId
        ? selectedMatch.participantB
        : selectedMatch.participantA;

      if (!winner) return;

      // Update match as walkover
      await updateBracketMatch(tournamentId, selectedMatch.id, {
        status: 'WALKOVER',
        winner,
        gamesWonA: selectedMatch.participantA === winner ? 2 : 0,
        gamesWonB: selectedMatch.participantB === winner ? 2 : 0,
        noShowParticipant: noShowParticipantId
      });

      // Advance winner
      await advanceWinner(tournamentId, selectedMatch.id, winner);

      toastMessage = '✅ Walkover registrado';
      showToast = true;
      showMatchDialog = false;
      selectedMatch = null;

      // Reload tournament
      await loadTournament();
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
            <p class="subtitle">Fase Final - Bracket de Eliminación</p>
          </div>
        </div>
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
        <div class="bracket-container">
          {#each rounds as round (round.roundNumber)}
            <div class="bracket-round">
              <h2 class="round-name">{round.name}</h2>
              <div class="matches-column">
                {#each round.matches as match (match.id)}
                  <div
                    class="bracket-match"
                    class:clickable={match.participantA && match.participantB}
                    on:click={() => handleMatchClick(match)}
                    on:keydown={(e) => e.key === 'Enter' && handleMatchClick(match)}
                    role="button"
                    tabindex="0"
                  >
                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantA}
                      class:tbd={!match.participantA}
                    >
                      <span class="participant-name">{getParticipantName(match.participantA)}</span>
                      {#if match.seedA}
                        <span class="seed">#{match.seedA}</span>
                      {/if}
                      {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                        <span class="score">{match.totalPointsA || 0}</span>
                        {#if tournament.show20s && match.total20sA !== undefined}
                          <span class="twenties">🎯{match.total20sA}</span>
                        {/if}
                      {/if}
                    </div>

                    <div class="vs-divider"></div>

                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantB}
                      class:tbd={!match.participantB}
                    >
                      <span class="participant-name">{getParticipantName(match.participantB)}</span>
                      {#if match.seedB}
                        <span class="seed">#{match.seedB}</span>
                      {/if}
                      {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                        <span class="score">{match.totalPointsB || 0}</span>
                        {#if tournament.show20s && match.total20sB !== undefined}
                          <span class="twenties">🎯{match.total20sB}</span>
                        {/if}
                      {/if}
                    </div>

                    {#if match.participantA && match.participantB}
                      {@const statusInfo = getStatusDisplay(match.status)}
                      <div class="status-badge" style="background: {statusInfo.color}">
                        {statusInfo.text}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
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
    padding: 2rem;
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
    align-items: center;
  }

  .bracket-round {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 250px;
    position: relative;
    flex: 1;
  }

  /* Align non-final rounds to start */
  .bracket-round:not(:last-child) {
    align-self: flex-start;
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

  .matches-column {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    justify-content: space-around;
    position: relative;
  }

  /* Centering for final round (last round) */
  .bracket-round:last-child .matches-column {
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

  /* Remove connector from final round */
  .bracket-round:last-child .bracket-match::after {
    display: none;
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
  }
</style>
