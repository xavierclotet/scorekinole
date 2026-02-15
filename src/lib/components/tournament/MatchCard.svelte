<script lang="ts">
  import type { GroupMatch, TournamentParticipant } from '$lib/types/tournament';
  import { getParticipantDisplayName } from '$lib/types/tournament';
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    match: GroupMatch;
    participants: TournamentParticipant[];
    onMatchClick?: (match: GroupMatch) => void;
    compact?: boolean;
    gameMode?: 'points' | 'rounds'; // Game mode to determine what to display
    isDoubles?: boolean; // Whether this is a doubles tournament
    matchesToWin?: number; // Number of games to win (Pg1, Pg2, etc.)
  }

  let {
    match,
    participants,
    onMatchClick,
    compact = false,
    gameMode = 'points',
    isDoubles = false,
    matchesToWin = 1
  }: Props = $props();

  // If Pg1, always show total points instead of games won (0-1 doesn't make sense)
  let showTotalPoints = $derived(gameMode === 'rounds' || matchesToWin === 1);

  // Track score changes for animation
  let prevScoreA = $state<number | undefined>(undefined);
  let prevScoreB = $state<number | undefined>(undefined);
  let scoreChangedA = $state(false);
  let scoreChangedB = $state(false);

  // Current scores for display
  let currentScoreA = $derived(match.totalPointsA || 0);
  let currentScoreB = $derived(match.totalPointsB || 0);

  // Detect score changes and trigger animation
  $effect(() => {
    if (match.status === 'IN_PROGRESS') {
      if (prevScoreA !== undefined && currentScoreA !== prevScoreA) {
        scoreChangedA = true;
        setTimeout(() => scoreChangedA = false, 600);
      }
      if (prevScoreB !== undefined && currentScoreB !== prevScoreB) {
        scoreChangedB = true;
        setTimeout(() => scoreChangedB = false, 600);
      }
      prevScoreA = currentScoreA;
      prevScoreB = currentScoreB;
    }
  });

  // Create participant map for quick lookup
  let participantMap = $derived(new Map(participants.map(p => [p.id, p])));

  // Get participant name by ID (handles doubles with teamName)
  function getParticipantName(participantId: string): string {
    if (participantId === 'BYE') return 'BYE';
    const participant = participantMap.get(participantId);
    if (!participant) return 'Unknown';
    return getParticipantDisplayName(participant, isDoubles);
  }

  // Check if participant is disqualified
  function isDisqualified(participantId: string): boolean {
    const participant = participantMap.get(participantId);
    return participant?.status === 'DISQUALIFIED';
  }

  // Derived: check if either participant is disqualified
  let isDisqualifiedA = $derived(isDisqualified(match.participantA));
  let isDisqualifiedB = $derived(isDisqualified(match.participantB));
  let hasDisqualified = $derived(isDisqualifiedA || isDisqualifiedB);

  // Get status display
  function getStatusDisplay(status: string): { text: string; color: string } {
    const statusMap: Record<string, { text: string; color: string }> = {
      PENDING: { text: m.tournament_statusPending(), color: '#6b7280' },
      IN_PROGRESS: { text: m.tournament_statusInProgress(), color: '#f59e0b' },
      COMPLETED: { text: m.tournament_statusCompleted(), color: '#10b981' },
      WALKOVER: { text: m.tournament_statusWalkover(), color: '#8b5cf6' }
    };
    return statusMap[status] || { text: status, color: '#6b7280' };
  }

  let statusInfo = $derived(getStatusDisplay(match.status));
  let isBye = $derived(match.participantB === 'BYE');
  let isClickable = $derived(onMatchClick !== undefined && !isBye); // Allow editing all matches except BYE

  // Check if match is a tie (no winner but match is completed)
  let isTie = $derived((match.status === 'COMPLETED' || match.status === 'WALKOVER') && !match.winner);

  // Check if match has a winner (for loser styling)
  let isMatchDecided = $derived((match.status === 'COMPLETED' || match.status === 'WALKOVER') && match.winner);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="match-card"
  class:compact
  class:clickable={isClickable}
  class:bye={isBye}
  class:completed={match.status === 'COMPLETED'}
  class:walkover={match.status === 'WALKOVER'}
  class:in-progress={match.status === 'IN_PROGRESS'}
  onclick={() => isClickable && onMatchClick && onMatchClick(match)}
  onkeydown={(e) => isClickable && e.key === 'Enter' && onMatchClick && onMatchClick(match)}
  role={isClickable ? 'button' : undefined}
  tabindex={isClickable ? 0 : undefined}
>
  <!-- Compact single-row layout -->
  <div class="match-row">
    {#if !isBye}
      {#if match.tableNumber}
        <span class="table-num">{m.tournament_tableShort()}{match.tableNumber}</span>
      {:else if match.status === 'PENDING'}
        <span class="table-num tbd">TBD</span>
      {/if}
    {/if}

    <div class="participant left" class:winner={match.winner === match.participantA} class:loser={isMatchDecided && match.winner !== match.participantA} class:tie={isTie} class:disqualified={isDisqualifiedA}>
      <span class="name">{getParticipantName(match.participantA)}</span>
      {#if isDisqualifiedA}
        <span class="dsq-badge">DSQ</span>
      {:else if match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS'}
        <span class="t20">🎯{match.total20sA ?? 0}</span>
      {/if}
    </div>

    <div class="score-center">
      {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
        {#if showTotalPoints}
          <!-- Show total points for rounds mode OR when Pg1 (single game to win) -->
          <span class="score" class:winner-a={match.winner === match.participantA} class:loser-a={isMatchDecided && match.winner !== match.participantA}>{match.totalPointsA || 0}</span>
          <span class="sep">-</span>
          <span class="score" class:winner-b={match.winner === match.participantB} class:loser-b={isMatchDecided && match.winner !== match.participantB && !isBye}>{isBye ? '-' : (match.totalPointsB || 0)}</span>
        {:else}
          <!-- Show games won for points mode with Pg2+ -->
          <span class="score" class:winner-a={match.winner === match.participantA} class:loser-a={isMatchDecided && match.winner !== match.participantA}>{match.gamesWonA || 0}</span>
          <span class="sep">-</span>
          <span class="score" class:winner-b={match.winner === match.participantB} class:loser-b={isMatchDecided && match.winner !== match.participantB && !isBye}>{isBye ? '-' : (match.gamesWonB || 0)}</span>
        {/if}
      {:else if match.status === 'IN_PROGRESS'}
        <!-- Always show totalPoints for live matches (running score: 2-0, 3-1, etc.) -->
        <span class="score live" class:score-changed={scoreChangedA}>{currentScoreA}</span>
        <span class="sep">-</span>
        <span class="score live" class:score-changed={scoreChangedB}>{isBye ? '-' : currentScoreB}</span>
      {:else}
        <span class="pending">vs</span>
      {/if}
    </div>

    <div class="participant right" class:winner={match.winner === match.participantB} class:loser={isMatchDecided && match.winner !== match.participantB && !isBye} class:tie={isTie} class:bye-participant={isBye} class:disqualified={isDisqualifiedB}>
      {#if isDisqualifiedB}
        <span class="dsq-badge">DSQ</span>
      {:else if (match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS') && !isBye}
        <span class="t20">🎯{match.total20sB ?? 0}</span>
      {/if}
      <span class="name">{getParticipantName(match.participantB)}</span>
    </div>

    <span class="status-dot" style="background: {statusInfo.color}" title={statusInfo.text}></span>
  </div>

  {#if match.noShowParticipant}
    <div class="no-show-warning">
      ⚠️ {getParticipantName(match.noShowParticipant)}
    </div>
  {/if}
</div>

<style>
  .match-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
    transition: all 0.15s;
  }

  .match-card.compact {
    padding: 0.4rem 0.5rem;
  }

  .match-card.clickable {
    cursor: pointer;
  }

  .match-card.clickable:hover {
    border-color: #667eea;
    background: #fafbff;
  }

  .match-card.completed {
    border-left: 3px solid #10b981;
  }

  .match-card.in-progress {
    border-left: 3px solid #f59e0b;
    background: #fffbeb;
  }

  .match-card.walkover {
    border-left: 3px solid #dc2626;
    background: #fef2f2;
  }

  .match-card.bye {
    opacity: 0.6;
    background: #f9fafb;
  }

  /* Single row layout */
  .match-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .table-num {
    font-size: 0.65rem;
    font-weight: 700;
    color: white;
    background: var(--primary);
    padding: 0.15rem 0.35rem;
    border-radius: 3px;
    min-width: 1.6rem;
    text-align: center;
  }

  .table-num.tbd {
    background: #9ca3af;
    color: white;
    font-style: italic;
  }

  .participant {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    min-width: 0;
  }

  .participant.left {
    justify-content: flex-end;
    text-align: right;
  }

  .participant.right {
    justify-content: flex-start;
    text-align: left;
  }

  .participant .name {
    font-size: 0.8rem;
    font-weight: 600;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .participant.winner .name {
    color: #059669;
    font-weight: 700;
  }

  .participant.loser .name {
    color: #f59e0b;
    font-weight: 600;
  }

  .participant.tie .name {
    color: #6b7280;
  }

  .participant.bye-participant .name {
    font-style: italic;
    opacity: 0.6;
  }

  .participant .t20 {
    font-size: 0.65rem;
    color: #f59e0b;
    flex-shrink: 0;
  }

  .participant.disqualified .name {
    color: #dc2626 !important;
    text-decoration: line-through;
    opacity: 0.7;
  }

  .dsq-badge {
    font-size: 0.55rem;
    font-weight: 700;
    color: white;
    background: #dc2626;
    padding: 0.1rem 0.25rem;
    border-radius: 3px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .score-center {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.15rem 0.4rem;
    background: #f3f4f6;
    border-radius: 4px;
    min-width: 3rem;
    justify-content: center;
  }

  .score-center .score {
    font-size: 0.9rem;
    font-weight: 800;
    color: #374151;
    min-width: 0.8rem;
    text-align: center;
  }

  .score-center .score.winner-a,
  .score-center .score.winner-b {
    color: #059669;
  }

  .score-center .score.loser-a,
  .score-center .score.loser-b {
    color: #f59e0b;
  }

  .score-center .sep {
    font-size: 0.75rem;
    color: #9ca3af;
    font-weight: 600;
  }

  .score-center .pending {
    font-size: 0.7rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
  }

  .score-center .score.live {
    color: #f59e0b;
    animation: pulse-score 2s ease-in-out infinite;
    transition: transform 0.15s ease-out;
  }

  .score-center .score.score-changed {
    animation: score-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    color: #10b981;
  }

  @keyframes pulse-score {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  @keyframes score-pop {
    0% { transform: scale(1); }
    30% { transform: scale(1.4); }
    100% { transform: scale(1); }
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .no-show-warning {
    margin-top: 0.3rem;
    padding: 0.2rem 0.4rem;
    background: #fef3c7;
    color: #92400e;
    border-radius: 3px;
    font-size: 0.65rem;
    text-align: center;
  }

  /* Dark mode support */
  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.clickable:hover {
    border-color: #667eea;
    background: #1e2a3d;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.in-progress {
    background: rgba(245, 158, 11, 0.1);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.walkover {
    background: rgba(220, 38, 38, 0.1);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant.disqualified .name {
    color: #f87171 !important;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.bye {
    background: #0f1419;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant .name {
    color: #e1e8ed;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant.winner .name {
    color: #10b981;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant.loser .name {
    color: #fbbf24;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant.tie .name {
    color: #8b9bb3;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center {
    background: #2d3748;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center .score {
    color: #e1e8ed;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center .score.winner-a,
  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center .score.winner-b {
    color: #10b981;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center .score.loser-a,
  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center .score.loser-b {
    color: #fbbf24;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center .pending {
    color: #6b7280;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center .score.live {
    color: #fbbf24;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .no-show-warning {
    background: rgba(254, 243, 199, 0.15);
    color: #fbbf24;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .match-card {
      padding: 0.4rem 0.5rem;
    }

    .match-row {
      gap: 0.4rem;
    }

    .table-num {
      font-size: 0.6rem;
      padding: 0.1rem 0.25rem;
      min-width: 1.4rem;
    }

    .participant .name {
      font-size: 0.75rem;
    }

    .participant .t20 {
      font-size: 0.6rem;
    }

    .score-center {
      padding: 0.1rem 0.3rem;
      min-width: 2.5rem;
    }

    .score-center .score {
      font-size: 0.8rem;
    }

    .status-dot {
      width: 5px;
      height: 5px;
    }

    .no-show-warning {
      font-size: 0.6rem;
      padding: 0.15rem 0.3rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .match-card {
      padding: 0.35rem 0.4rem;
    }

    .match-row {
      gap: 0.35rem;
    }

    .table-num {
      font-size: 0.55rem;
      min-width: 1.2rem;
    }

    .participant .name {
      font-size: 0.7rem;
    }

    .score-center .score {
      font-size: 0.75rem;
    }
  }
</style>
