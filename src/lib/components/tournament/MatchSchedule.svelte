<script lang="ts">
  import type {
    GroupMatch,
    TournamentParticipant,
    RoundRobinRound,
    SwissPairing
  } from '$lib/types/tournament';
  import MatchCard from './MatchCard.svelte';

  export let rounds: RoundRobinRound[] | SwissPairing[] = [];
  export let participants: TournamentParticipant[];
  export let currentRound: number = 1;
  export let onMatchClick: ((match: GroupMatch) => void) | undefined = undefined;
  export let filterTable: number | null = null;
  export let filterStatus: string | null = null;
  export let gameMode: 'points' | 'rounds' = 'points'; // NEW: Game mode

  // Ensure rounds is always an array (Firestore may return object with numeric keys)
  $: safeRounds = (() => {
    if (!rounds) return [];
    if (Array.isArray(rounds)) return rounds;
    return Object.values(rounds);
  })();

  // Filter matches
  $: filteredRounds = safeRounds.map(round => {
    // Ensure matches is an array
    const matches = Array.isArray(round.matches) ? round.matches : Object.values(round.matches || {});

    return {
      ...round,
      matches: matches.filter(match => {
        // Filter by table
        if (filterTable !== null && match.tableNumber !== filterTable) {
          return false;
        }
        // Filter by status
        if (filterStatus !== null && match.status !== filterStatus) {
          return false;
        }
        return true;
      })
    };
  }).filter(round => round.matches.length > 0);

  // Get round progress
  function getRoundProgress(matches: GroupMatch[]): { completed: number; total: number; percentage: number } {
    const total = matches.length;
    const completed = matches.filter(m => m.status === 'COMPLETED' || m.status === 'WALKOVER').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }
</script>

<div class="match-schedule">
  {#if filteredRounds.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📅</div>
      <p>No hay partidos que mostrar</p>
      {#if filterTable !== null || filterStatus !== null}
        <p class="hint">Prueba a cambiar los filtros</p>
      {/if}
    </div>
  {:else}
    {#each filteredRounds as round (round.roundNumber)}
      {@const progress = getRoundProgress(round.matches)}
      <div class="round-section" class:current={round.roundNumber === currentRound}>
        <div class="round-header">
          <div class="round-title">
            <h3>Ronda {round.roundNumber}</h3>
            {#if round.roundNumber === currentRound}
              <span class="current-badge">Actual</span>
            {/if}
          </div>
          <div class="round-progress">
            <span class="progress-text">{progress.completed}/{progress.total} completados</span>
            <div class="progress-bar">
              <div class="progress-fill" style="width: {progress.percentage}%"></div>
            </div>
          </div>
        </div>

        <div class="matches-grid">
          {#each round.matches as match (match.id)}
            <MatchCard
              {match}
              {participants}
              roundNumber={round.roundNumber}
              {onMatchClick}
              {gameMode}
            />
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .match-schedule {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    color: #9ca3af;
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0.25rem 0;
    font-size: 1rem;
  }

  .empty-state .hint {
    font-size: 0.9rem;
    color: #d1d5db;
  }

  .round-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 1.5rem;
    transition: all 0.2s;
  }

  .round-section.current {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  }

  .round-header {
    margin-bottom: 1.25rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .round-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .round-title h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #1f2937;
  }

  .current-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .round-progress {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .progress-text {
    font-size: 0.85rem;
    color: #6b7280;
    font-weight: 500;
    min-width: 120px;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #10b981 0%, #059669 100%);
    transition: width 0.3s ease;
    border-radius: 4px;
  }

  .matches-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  /* Dark mode support */
  :global([data-theme='dark']) .empty-state {
    color: #6b7280;
  }

  :global([data-theme='dark']) .empty-state .hint {
    color: #4b5563;
  }

  :global([data-theme='dark']) .round-section {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .round-section.current {
    border-color: #667eea;
  }

  :global([data-theme='dark']) .round-header {
    border-bottom-color: #2d3748;
  }

  :global([data-theme='dark']) .round-title h3 {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .progress-text {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .progress-bar {
    background: #2d3748;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .match-schedule {
      gap: 1rem;
    }

    .round-section {
      padding: 1rem;
    }

    .round-header {
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
    }

    .round-title {
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .round-title h3 {
      font-size: 1.1rem;
    }

    .current-badge {
      font-size: 0.7rem;
      padding: 0.2rem 0.6rem;
    }

    .round-progress {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .progress-text {
      font-size: 0.8rem;
      min-width: auto;
    }

    .progress-bar {
      width: 100%;
    }

    .matches-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .empty-state {
      padding: 3rem 1.5rem;
    }

    .empty-icon {
      font-size: 3rem;
    }

    .empty-state p {
      font-size: 0.9rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .match-schedule {
      gap: 0.75rem;
    }

    .round-section {
      padding: 0.75rem;
    }

    .round-header {
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
    }

    .round-title h3 {
      font-size: 1rem;
    }

    .current-badge {
      font-size: 0.65rem;
      padding: 0.15rem 0.5rem;
    }

    .progress-bar {
      height: 6px;
    }

    .matches-grid {
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 0.5rem;
    }

    .empty-state {
      padding: 2rem 1rem;
    }

    .empty-icon {
      font-size: 2.5rem;
    }
  }
</style>
