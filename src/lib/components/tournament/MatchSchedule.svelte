<script lang="ts">
  import type {
    GroupMatch,
    TournamentParticipant,
    RoundRobinRound,
    SwissPairing
  } from '$lib/types/tournament';
  import MatchCard from './MatchCard.svelte';
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    rounds?: RoundRobinRound[] | SwissPairing[];
    participants: TournamentParticipant[];
    currentRound?: number;
    onMatchClick?: (match: GroupMatch) => void;
    filterTable?: number | null;
    filterStatus?: string | null;
    gameMode?: 'points' | 'rounds';
    // External state for expanded rounds (controlled by parent)
    expandedRoundsState?: Set<number> | null;
    onExpandedRoundsChange?: (expanded: Set<number>) => void;
    // Total rounds configured for the tournament (for Swiss system, this is numSwissRounds)
    totalRounds?: number | null;
    // Whether this is a doubles tournament (affects name display)
    isDoubles?: boolean;
    // Number of games to win (Pg1, Pg2, etc.)
    matchesToWin?: number;
  }

  let {
    rounds = [],
    participants,
    currentRound = 1,
    onMatchClick,
    filterTable = null,
    filterStatus = null,
    gameMode = 'points',
    expandedRoundsState = null,
    onExpandedRoundsChange,
    totalRounds = null,
    isDoubles = false,
    matchesToWin = 1
  }: Props = $props();

  // Internal state (used when no external state is provided)
  let internalExpandedRounds = $state<Set<number>>(new Set());
  let initialized = $state(false);

  // Use external state if provided, otherwise use internal
  let expandedRounds = $derived(expandedRoundsState !== null ? expandedRoundsState : internalExpandedRounds);

  // Ensure rounds is always an array (Firestore may return object with numeric keys)
  let safeRounds = $derived((() => {
    if (!rounds) return [];
    if (Array.isArray(rounds)) return rounds;
    return Object.values(rounds);
  })());

  // Filter matches
  let filteredRounds = $derived((safeRounds as any[]).map(round => {
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
  }).filter(round => round.matches.length > 0));

  // Initialize expanded state: expand rounds that are not complete
  $effect(() => {
    if (filteredRounds.length > 0 && !initialized && expandedRoundsState === null) {
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
  });

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
      <p>{m.tournament_noMatchesToShow()}</p>
      {#if filterTable !== null || filterStatus !== null}
        <p class="hint">{m.tournament_tryChangingFilters()}</p>
      {/if}
    </div>
  {:else}
    {@const totalRoundsCount = totalRounds || safeRounds.length}
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
          onclick={() => toggleRound(round.roundNumber)}
          aria-expanded={isExpanded}
        >
          <div class="round-header-left">
            <span class="expand-icon" class:rotated={isExpanded}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
              </svg>
            </span>
            <div class="round-title">
              <span class="round-number">{m.tournament_round()} {round.roundNumber}</span>
              {#if isComplete}
                <span class="complete-badge">{m.tournament_completed()}</span>
              {:else if isLastRound}
                <span class="last-round-badge">{m.tournament_lastRound()}</span>
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
          <div class="matches-grid" class:doubles={isDoubles}>
            {#each round.matches as match (match.id)}
              <MatchCard
                {match}
                {participants}
                {onMatchClick}
                {gameMode}
                {isDoubles}
                {matchesToWin}
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
    gap: 0.75rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    text-align: center;
    color: #9ca3af;
  }

  .empty-icon {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0.15rem 0;
    font-size: 0.9rem;
  }

  .empty-state .hint {
    font-size: 0.8rem;
    color: #d1d5db;
  }

  .round-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.15s;
  }

  .round-section.current {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.12);
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
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background-color 0.15s;
    text-align: left;
  }

  .round-header:hover {
    background: #f9fafb;
  }

  .round-header-left {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: transform 0.15s;
    flex-shrink: 0;
  }

  .expand-icon.rotated {
    transform: rotate(90deg);
  }

  .round-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .round-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.15rem 0.5rem;
    background: #f3f4f6;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 700;
    color: #374151;
  }

  .complete-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.1rem 0.4rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border-radius: 3px;
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .last-round-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.1rem 0.4rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    border-radius: 3px;
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .round-section.last-round {
    border-color: #fcd34d;
  }

  .round-progress {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .progress-text {
    font-size: 0.7rem;
    color: #6b7280;
    font-weight: 600;
    min-width: 32px;
    text-align: right;
  }

  .progress-bar {
    width: 50px;
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s ease;
    border-radius: 2px;
  }

  .progress-fill.complete {
    background: var(--primary);
    filter: brightness(1.1);
  }

  .matches-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.4rem;
    padding: 0.5rem 0.75rem 0.75rem;
    border-top: 1px solid #e5e7eb;
    animation: slideDown 0.15s ease-out;
  }

  /* Doubles mode: wider cards to accommodate longer team names */
  .matches-grid.doubles {
    grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Dark mode support */
  :global(:is([data-theme='dark'], [data-theme='violet'])) .empty-state {
    color: #6b7280;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .empty-state .hint {
    color: #4b5563;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .round-section {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .round-section.current {
    border-color: #667eea;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .round-section.complete.collapsed {
    border-color: #065f46;
    background: #022c22;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .round-header:hover {
    background: #0f1419;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .expand-icon {
    color: #8b9bb3;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .round-number {
    background: #2d3748;
    color: #e1e8ed;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .progress-text {
    color: #8b9bb3;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .progress-bar {
    background: #2d3748;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .matches-grid {
    border-top-color: #2d3748;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .match-schedule {
      gap: 0.5rem;
    }

    .round-header {
      padding: 0.4rem 0.6rem;
      gap: 0.4rem;
    }

    .round-header-left {
      gap: 0.3rem;
    }

    .expand-icon svg {
      width: 12px;
      height: 12px;
    }

    .round-title {
      gap: 0.3rem;
    }

    .round-number {
      padding: 0.1rem 0.4rem;
      font-size: 0.7rem;
    }

    .complete-badge,
    .last-round-badge {
      font-size: 0.55rem;
      padding: 0.08rem 0.3rem;
    }

    .progress-text {
      font-size: 0.65rem;
      min-width: 28px;
    }

    .progress-bar {
      width: 40px;
      height: 3px;
    }

    .matches-grid {
      grid-template-columns: 1fr;
      gap: 0.3rem;
      padding: 0.4rem 0.5rem;
    }

    .empty-state {
      padding: 1.5rem 1rem;
    }

    .empty-icon {
      font-size: 2rem;
    }

    .empty-state p {
      font-size: 0.8rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .match-schedule {
      gap: 0.4rem;
    }

    .round-header {
      padding: 0.35rem 0.5rem;
    }

    .round-number {
      padding: 0.1rem 0.35rem;
      font-size: 0.65rem;
    }

    .complete-badge,
    .last-round-badge {
      font-size: 0.5rem;
      padding: 0.06rem 0.25rem;
    }

    .progress-bar {
      width: 35px;
      height: 3px;
    }

    .matches-grid {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.25rem;
      padding: 0.35rem 0.5rem;
    }

    .matches-grid.doubles {
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    }

    .empty-state {
      padding: 1rem;
    }

    .empty-icon {
      font-size: 1.5rem;
    }
  }
</style>
