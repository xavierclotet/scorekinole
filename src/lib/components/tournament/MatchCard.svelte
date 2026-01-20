<script lang="ts">
  import type { GroupMatch, TournamentParticipant } from '$lib/types/tournament';

  export let match: GroupMatch;
  export let participants: TournamentParticipant[];
  export let roundNumber: number | undefined = undefined;
  export let onMatchClick: ((match: GroupMatch) => void) | undefined = undefined;
  export let compact: boolean = false;
  export let gameMode: 'points' | 'rounds' = 'points'; // NEW: Game mode to determine what to display

  // Create participant map for quick lookup
  $: participantMap = new Map(participants.map(p => [p.id, p]));

  // Get participant name by ID
  function getParticipantName(participantId: string): string {
    if (participantId === 'BYE') return 'BYE';
    return participantMap.get(participantId)?.name || 'Unknown';
  }

  // Get status display
  function getStatusDisplay(status: string): { text: string; color: string } {
    const statusMap: Record<string, { text: string; color: string }> = {
      PENDING: { text: 'Pendiente', color: '#6b7280' },
      IN_PROGRESS: { text: 'En curso', color: '#f59e0b' },
      COMPLETED: { text: 'Finalizado', color: '#10b981' },
      WALKOVER: { text: 'Walkover', color: '#8b5cf6' }
    };
    return statusMap[status] || { text: status, color: '#6b7280' };
  }

  $: statusInfo = getStatusDisplay(match.status);
  $: isBye = match.participantB === 'BYE';
  $: isClickable = onMatchClick !== undefined && !isBye; // Allow editing all matches except BYE

  // Check if match is a tie (no winner but match is completed)
  $: isTie = (match.status === 'COMPLETED' || match.status === 'WALKOVER') && !match.winner;
</script>

<div
  class="match-card"
  class:compact
  class:clickable={isClickable}
  class:bye={isBye}
  on:click={() => isClickable && onMatchClick && onMatchClick(match)}
  on:keydown={(e) => isClickable && e.key === 'Enter' && onMatchClick && onMatchClick(match)}
  role={isClickable ? 'button' : 'article'}
  tabindex={isClickable ? 0 : -1}
>
  <div class="match-header">
    <div class="header-left">
       <span class="table-badge">Mesa {match.tableNumber}</span>
    </div>
    {#if match.tableNumber}
     <span class="status-badge" style="background: {statusInfo.color}">
        {statusInfo.text}
      </span>
    {/if}
  </div>

  <div class="matchup">
    <!-- Players row -->
    <div class="players-row">
      <div class="player-name" class:winner={match.winner === match.participantA} class:tie={isTie}>
        {getParticipantName(match.participantA)}
      </div>
      <div class="vs-separator">VS</div>
      <div class="player-name" class:winner={match.winner === match.participantB} class:tie={isTie} class:bye={isBye}>
        {getParticipantName(match.participantB)}
      </div>
    </div>

    <!-- Scores row -->
    <div class="scores-row">
      <div class="player-score" class:winner={match.winner === match.participantA} class:tie={isTie}>
        {#if gameMode === 'rounds'}
          <!-- In rounds mode, show total points as main score -->
          <span class="games-won">{match.totalPointsA || 0}</span>
        {:else}
          <!-- In points mode, show games won -->
          <span class="games-won">{match.gamesWonA || 0}</span>
          {#if (match.status === 'COMPLETED' || match.status === 'WALKOVER') && match.totalPointsA !== undefined}
            <span class="total-points">({match.totalPointsA}pts)</span>
          {/if}
        {/if}
        {#if match.total20sA !== undefined && match.total20sA > 0}
          <span class="twenties">🎯 {match.total20sA}</span>
        {/if}
      </div>
      <div class="score-divider">-</div>
      <div class="player-score" class:winner={match.winner === match.participantB} class:tie={isTie}>
        {#if !isBye}
          {#if gameMode === 'rounds'}
            <!-- In rounds mode, show total points as main score -->
            <span class="games-won">{match.totalPointsB || 0}</span>
          {:else}
            <!-- In points mode, show games won -->
            <span class="games-won">{match.gamesWonB || 0}</span>
            {#if (match.status === 'COMPLETED' || match.status === 'WALKOVER') && match.totalPointsB !== undefined}
              <span class="total-points">({match.totalPointsB}pts)</span>
            {/if}
          {/if}
          {#if match.total20sB !== undefined && match.total20sB > 0}
            <span class="twenties">🎯 {match.total20sB}</span>
          {/if}
        {:else}
          <span class="bye-text">-</span>
        {/if}
      </div>
    </div>
  </div>

  {#if match.noShowParticipant}
    <div class="no-show-warning">
      ⚠️ No-show: {getParticipantName(match.noShowParticipant)}
    </div>
  {/if}
</div>

<style>
  .match-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    transition: all 0.2s;
  }

  .match-card.compact {
    padding: 0.75rem;
  }

  .match-card.clickable {
    cursor: pointer;
  }

  .match-card.clickable:hover {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
    transform: translateY(-1px);
  }

  .match-card.bye {
    opacity: 0.7;
    background: #f9fafb;
  }

  .match-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    gap: 0.5rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .round-label {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 600;
  }

  .table-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.75rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.6rem;
    color: white;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .matchup {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Players row */
  .players-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .player-name {
    flex: 1;
    font-weight: 600;
    color: #1f2937;
    font-size: 1.05rem;
    text-align: center;
    padding: 0.5rem;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .player-name.winner {
    background: #f0fdf4;
    color: #059669;
    font-weight: 700;
    font-size: 1.1rem;
    box-shadow: 0 0 0 2px #10b981;
  }

  .player-name.tie {
    background: #f3f4f6;
    color: #6b7280;
    font-weight: 700;
    font-size: 1.1rem;
    box-shadow: 0 0 0 2px #9ca3af;
  }

  .player-name.bye {
    opacity: 0.5;
    font-style: italic;
  }

  .vs-separator {
    font-size: 0.75rem;
    font-weight: 800;
    color: #9ca3af;
    letter-spacing: 0.1em;
    padding: 0.25rem 0.5rem;
    background: #f3f4f6;
    border-radius: 4px;
  }

  /* Scores row */
  .scores-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-top: 0.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .player-score {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .player-score.winner {
    background: #f0fdf4;
  }

  .player-score.tie {
    background: #f3f4f6;
  }

  .score-divider {
    font-size: 1rem;
    font-weight: 700;
    color: #d1d5db;
  }

  .games-won {
    font-size: 1.5rem;
    font-weight: 800;
    color: #1f2937;
  }

  .player-score.winner .games-won {
    color: #059669;
  }

  .total-points {
    font-size: 0.85rem;
    color: #6b7280;
    font-weight: 500;
  }

  .twenties {
    font-size: 0.85rem;
    color: #f59e0b;
    font-weight: 600;
  }

  .bye-text {
    font-size: 1.2rem;
    color: #d1d5db;
    font-weight: 600;
  }


  .no-show-warning {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #fef3c7;
    color: #92400e;
    border-radius: 4px;
    font-size: 0.85rem;
    text-align: center;
  }

  .match-footer {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #e5e7eb;
    text-align: center;
  }

  .completion-time {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  /* Dark mode support */
  :global([data-theme='dark']) .match-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .match-card.clickable:hover {
    border-color: #667eea;
  }

  :global([data-theme='dark']) .match-card.bye {
    background: #0f1419;
  }

  :global([data-theme='dark']) .round-label {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .table-badge {
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  }

  :global([data-theme='dark']) .player-name {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .player-name.winner {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
    box-shadow: 0 0 0 2px #10b981;
  }

  :global([data-theme='dark']) .player-name.tie {
    background: #2d3748;
    color: #8b9bb3;
    box-shadow: 0 0 0 2px #4b5563;
  }

  :global([data-theme='dark']) .vs-separator {
    background: #2d3748;
    color: #6b7280;
  }

  :global([data-theme='dark']) .scores-row {
    border-top-color: #2d3748;
  }

  :global([data-theme='dark']) .player-score.winner {
    background: rgba(16, 185, 129, 0.15);
  }

  :global([data-theme='dark']) .player-score.tie {
    background: #2d3748;
  }

  :global([data-theme='dark']) .score-divider {
    color: #4b5563;
  }

  :global([data-theme='dark']) .games-won {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .player-score.winner .games-won {
    color: #10b981;
  }

  :global([data-theme='dark']) .total-points {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .bye-text {
    color: #4b5563;
  }

  :global([data-theme='dark']) .match-footer {
    border-top-color: #2d3748;
  }

  :global([data-theme='dark']) .completion-time {
    color: #6b7280;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .match-card {
      padding: 0.75rem;
    }

    .match-card.compact {
      padding: 0.5rem;
    }

    .match-header {
      gap: 0.375rem;
      margin-bottom: 0.75rem;
    }

    .round-label {
      font-size: 0.7rem;
    }

    .table-badge {
      font-size: 0.75rem;
      padding: 0.3rem 0.6rem;
    }

    .status-badge {
      font-size: 0.65rem;
      padding: 0.2rem 0.5rem;
    }

    .matchup {
      gap: 0.6rem;
    }

    .players-row {
      gap: 0.75rem;
    }

    .player-name {
      font-size: 0.95rem;
      padding: 0.4rem;
    }

    .player-name.winner {
      font-size: 1rem;
    }

    .vs-separator {
      font-size: 0.7rem;
      padding: 0.2rem 0.4rem;
    }

    .scores-row {
      gap: 0.75rem;
      padding-top: 0.4rem;
    }

    .player-score {
      gap: 0.4rem;
      padding: 0.4rem;
    }

    .games-won {
      font-size: 1.3rem;
    }

    .total-points,
    .twenties {
      font-size: 0.75rem;
    }

    .score-divider {
      font-size: 0.9rem;
    }

    .bye-text {
      font-size: 1.1rem;
    }

    .no-show-warning {
      font-size: 0.75rem;
      padding: 0.375rem;
    }

    .completion-time {
      font-size: 0.7rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .match-card {
      padding: 0.5rem;
    }

    .match-header {
      margin-bottom: 0.5rem;
    }

    .table-badge {
      font-size: 0.7rem;
      padding: 0.25rem 0.5rem;
    }

    .matchup {
      gap: 0.5rem;
    }

    .players-row {
      gap: 0.6rem;
    }

    .player-name {
      font-size: 0.9rem;
      padding: 0.35rem;
    }

    .player-name.winner {
      font-size: 0.95rem;
    }

    .vs-separator {
      font-size: 0.65rem;
      padding: 0.15rem 0.35rem;
    }

    .scores-row {
      gap: 0.6rem;
      padding-top: 0.35rem;
    }

    .player-score {
      gap: 0.35rem;
      padding: 0.35rem;
    }

    .games-won {
      font-size: 1.2rem;
    }

    .bye-text {
      font-size: 1rem;
    }
  }
</style>
