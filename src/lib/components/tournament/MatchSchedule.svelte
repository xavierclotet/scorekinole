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
  export let gameMode: 'points' | 'rounds' = 'points';
  // External state for expanded rounds (controlled by parent)
  export let expandedRoundsState: Set<number> | null = null;
  export let onExpandedRoundsChange: ((expanded: Set<number>) => void) | undefined = undefined;

  // Internal state (used when no external state is provided)
  let internalExpandedRounds: Set<number> = new Set();
  let initialized = false;

  // Use external state if provided, otherwise use internal
  $: expandedRounds = expandedRoundsState !== null ? expandedRoundsState : internalExpandedRounds;

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

  // Initialize expanded state: expand rounds that are not complete
  $: if (filteredRounds.length > 0 && !initialized && expandedRoundsState === null) {
    const initialExpanded = new Set<number>();
    filteredRounds.forEach(round => {
      const progress = getRoundProgress(round.matches);
      // Expand if not 100% complete
      if (progress.percentage < 100) {
        initialExpanded.add(round.roundNumber);
      }
    });
    // Always expand at least current round
    initialExpanded.add(currentRound);
    internalExpandedRounds = initialExpanded;
    initialized = true;
  }

  // Get round progress
  function getRoundProgress(matches: GroupMatch[]): { completed: number; total: number; percentage: number } {
    const total = matches.length;
    const completed = matches.filter(m => m.status === 'COMPLETED' || m.status === 'WALKOVER').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }

  function toggleRound(roundNumber: number) {
    const newExpanded = new Set(expandedRounds);
    if (newExpanded.has(roundNumber)) {
      newExpanded.delete(roundNumber);
    } else {
      newExpanded.add(roundNumber);
    }

    if (onExpandedRoundsChange) {
      // Notify parent of change
      onExpandedRoundsChange(newExpanded);
    } else {
      // Update internal state
      internalExpandedRounds = newExpanded;
    }
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
    {@const totalRoundsCount = safeRounds.length}
    {#each filteredRounds as round (round.roundNumber)}
      {@const progress = getRoundProgress(round.matches)}
      {@const isExpanded = expandedRounds.has(round.roundNumber)}
      {@const isComplete = progress.percentage === 100}
      {@const isLastRound = round.roundNumber === totalRoundsCount}
      <div
        class="round-section"
        class:current={round.roundNumber === currentRound}
        class:collapsed={!isExpanded}
        class:complete={isComplete}
        class:last-round={isLastRound && !isComplete}
      >
        <button
          class="round-header"
          on:click={() => toggleRound(round.roundNumber)}
          aria-expanded={isExpanded}
        >
          <div class="round-header-left">
            <span class="expand-icon" class:rotated={isExpanded}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
              </svg>
            </span>
            <div class="round-title">
              <span class="round-number">{round.roundNumber}</span>
              {#if isComplete}
                <span class="complete-badge">Completada</span>
              {:else if isLastRound}
                <span class="last-round-badge">Última ronda</span>
              {/if}
            </div>
          </div>
          <div class="round-progress">
            <span class="progress-text">{progress.completed}/{progress.total}</span>
            <div class="progress-bar">
              <div class="progress-fill" class:complete={isComplete} style="width: {progress.percentage}%"></div>
            </div>
          </div>
        </button>

        {#if isExpanded}
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
        {/if}
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
    overflow: hidden;
    transition: all 0.2s;
  }

  .round-section.current {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  }

  .round-section.complete.collapsed {
    border-color: #d1fae5;
    background: #f0fdf4;
  }

  .round-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s;
    text-align: left;
  }

  .round-header:hover {
    background: #f9fafb;
  }

  .round-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: transform 0.2s;
    flex-shrink: 0;
  }

  .expand-icon.rotated {
    transform: rotate(90deg);
  }

  .round-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .round-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    background: #f3f4f6;
    border-radius: 50%;
    font-size: 0.9rem;
    font-weight: 700;
    color: #374151;
  }

  .complete-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.5rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border-radius: 10px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .last-round-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.5rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    border-radius: 10px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .round-section.last-round {
    border-color: #fcd34d;
  }

  .round-progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .progress-text {
    font-size: 0.8rem;
    color: #6b7280;
    font-weight: 600;
    min-width: 40px;
    text-align: right;
  }

  .progress-bar {
    width: 60px;
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    transition: width 0.3s ease;
    border-radius: 3px;
  }

  .progress-fill.complete {
    background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  }

  .matches-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.75rem;
    padding: 0 1.25rem 1.25rem 1.25rem;
    border-top: 1px solid #e5e7eb;
    padding-top: 1rem;
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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

  :global([data-theme='dark']) .round-section.complete.collapsed {
    border-color: #065f46;
    background: #022c22;
  }

  :global([data-theme='dark']) .round-header:hover {
    background: #0f1419;
  }

  :global([data-theme='dark']) .expand-icon {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .round-number {
    background: #2d3748;
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .progress-text {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .progress-bar {
    background: #2d3748;
  }

  :global([data-theme='dark']) .matches-grid {
    border-top-color: #2d3748;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .match-schedule {
      gap: 0.75rem;
    }

    .round-header {
      padding: 0.75rem 1rem;
      gap: 0.5rem;
    }

    .round-header-left {
      gap: 0.375rem;
    }

    .expand-icon svg {
      width: 14px;
      height: 14px;
    }

    .round-title {
      gap: 0.375rem;
    }

    .round-number {
      width: 1.5rem;
      height: 1.5rem;
      font-size: 0.8rem;
    }

    .complete-badge,
    .last-round-badge {
      font-size: 0.6rem;
      padding: 0.1rem 0.4rem;
    }

    .progress-text {
      font-size: 0.75rem;
      min-width: 35px;
    }

    .progress-bar {
      width: 50px;
      height: 5px;
    }

    .matches-grid {
      grid-template-columns: 1fr;
      gap: 0.5rem;
      padding: 0.75rem;
    }

    .empty-state {
      padding: 2rem 1rem;
    }

    .empty-icon {
      font-size: 2.5rem;
    }

    .empty-state p {
      font-size: 0.85rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .match-schedule {
      gap: 0.5rem;
    }

    .round-header {
      padding: 0.5rem 0.75rem;
    }

    .round-number {
      width: 1.4rem;
      height: 1.4rem;
      font-size: 0.75rem;
    }

    .complete-badge,
    .last-round-badge {
      font-size: 0.55rem;
      padding: 0.1rem 0.35rem;
    }

    .progress-bar {
      width: 45px;
      height: 4px;
    }

    .matches-grid {
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.4rem;
      padding: 0.5rem 0.75rem;
    }

    .empty-state {
      padding: 1.5rem 1rem;
    }

    .empty-icon {
      font-size: 2rem;
    }
  }
</style>
