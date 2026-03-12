<script lang="ts">
  import type { GroupMatch, TournamentParticipant } from '$lib/types/tournament';
  import { getParticipantDisplayName } from '$lib/types/tournament';
  import type { WinProbability } from '$lib/algorithms/probability';
  import { probabilityColor } from '$lib/algorithms/probability';
  import * as m from '$lib/paraglide/messages.js';
  import { Timer } from '@lucide/svelte';
  import * as Popover from '$lib/components/ui/popover';

  interface Props {
    match: GroupMatch;
    participants: TournamentParticipant[];
    onMatchClick?: (match: GroupMatch) => void;
    compact?: boolean;
    gameMode?: 'points' | 'rounds'; // Game mode to determine what to display
    isDoubles?: boolean; // Whether this is a doubles tournament
    matchesToWin?: number; // Number of games to win (Pg1, Pg2, etc.)
    winProbability?: WinProbability | null; // Win probability for pending matches
    locked?: boolean; // Whether this match is locked (round not yet playable)
    enablePopover?: boolean; // Show round details popover on click
  }

  let {
    match,
    participants,
    onMatchClick,
    compact = false,
    gameMode = 'points',
    isDoubles = false,
    matchesToWin = 1,
    winProbability = null,
    locked = false,
    enablePopover = false
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
  let isClickable = $derived(onMatchClick !== undefined && !isBye && !locked);

  // Check if match is a tie (no winner but match is completed)
  let isTie = $derived((match.status === 'COMPLETED' || match.status === 'WALKOVER') && !match.winner);

  // Check if match has a winner (for loser styling)
  let isMatchDecided = $derived((match.status === 'COMPLETED' || match.status === 'WALKOVER') && match.winner);

  // Get current hammer holder: only show during IN_PROGRESS matches
  function getMatchHammer(): string | null {
    if (match.status !== 'IN_PROGRESS') return null;
    if (match.currentHammer) return match.currentHammer;
    if (match.rounds?.length) {
      const lastRound = match.rounds[match.rounds.length - 1];
      if (lastRound.hammer) return lastRound.hammer;
    }
    return null;
  }

  let hammerHolder = $derived(getMatchHammer());

  // Popover: round details
  let showPopover = $derived(
    enablePopover &&
    (match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS') &&
    (match.rounds?.length ?? 0) > 0 &&
    !isBye
  );

  let gameGroups = $derived.by(() => {
    if (!match.rounds?.length) return [];
    const map = new Map<number, NonNullable<typeof match.rounds>>();
    for (const r of match.rounds) {
      const gn = r.gameNumber || 1;
      if (!map.has(gn)) map.set(gn, []);
      map.get(gn)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([gameNum, rounds]) => ({
        gameNumber: gameNum,
        rounds: rounds.sort((a, b) => a.roundInGame - b.roundInGame)
      }));
  });

  let hasAny20s = $derived(match.rounds?.some(r => (r.twentiesA || 0) > 0 || (r.twentiesB || 0) > 0) ?? false);

  function getShortName(participantId: string): string {
    if (participantId === 'BYE') return 'BYE';
    const participant = participantMap.get(participantId);
    if (!participant) return '?';
    const fullName = getParticipantDisplayName(participant, isDoubles);
    return fullName;
  }
</script>

{#snippet cardInner()}
  <!-- Main row: players + score -->
  <div class="match-row">
    <div class="participant left" class:winner={match.winner === match.participantA} class:loser={isMatchDecided && match.winner !== match.participantA} class:tie={isTie} class:disqualified={isDisqualifiedA} class:has-hammer={hammerHolder === match.participantA}>
      <span class="name">{getParticipantName(match.participantA)}</span>
      {#if isDisqualifiedA}
        <span class="dsq-badge">DSQ</span>
      {/if}
    </div>

    <div class="score-center">
      <div class="score-line">
        {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
          {#if showTotalPoints}
            <span class="score" class:winner-a={match.winner === match.participantA} class:loser-a={isMatchDecided && match.winner !== match.participantA}>{match.totalPointsA || 0}</span>
            <span class="sep">-</span>
            <span class="score" class:winner-b={match.winner === match.participantB} class:loser-b={isMatchDecided && match.winner !== match.participantB && !isBye}>{isBye ? '-' : (match.totalPointsB || 0)}</span>
          {:else}
            <span class="score" class:winner-a={match.winner === match.participantA} class:loser-a={isMatchDecided && match.winner !== match.participantA}>{match.gamesWonA || 0}</span>
            <span class="sep">-</span>
            <span class="score" class:winner-b={match.winner === match.participantB} class:loser-b={isMatchDecided && match.winner !== match.participantB && !isBye}>{isBye ? '-' : (match.gamesWonB || 0)}</span>
          {/if}
        {:else if match.status === 'IN_PROGRESS'}
          <span class="score live" class:score-changed={scoreChangedA}>{currentScoreA}</span>
          <span class="sep">-</span>
          <span class="score live" class:score-changed={scoreChangedB}>{isBye ? '-' : currentScoreB}</span>
        {:else}
          <span class="pending">vs</span>
        {/if}
      </div>
      {#if (match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS') && !isBye}
        <div class="t20-line">
          <span class="t20">{match.total20sA ?? 0}</span>
          <span class="t20-sep">·</span>
          <span class="t20">{match.total20sB ?? 0}</span>
        </div>
      {/if}
      {#if match.status === 'IN_PROGRESS' && winProbability && winProbability.confidence !== 'none' && winProbability.confidence !== 'low'}
        {@const pctA = Math.round(winProbability.probabilityA * 100)}
        {@const pctB = Math.round(winProbability.probabilityB * 100)}
        <div class="probability-indicator live-prob">
          <span class="prob-value" style="color: {probabilityColor(pctA)}">{pctA}</span>
          <div class="prob-bar">
            <div class="prob-fill-a" style="width: {pctA}%"></div>
          </div>
          <span class="prob-value" style="color: {probabilityColor(pctB)}">{pctB}</span>
        </div>
      {/if}
      {#if match.status === 'PENDING' && winProbability && winProbability.confidence !== 'none' && winProbability.confidence !== 'low'}
        {@const pctA = Math.round(winProbability.probabilityA * 100)}
        {@const pctB = Math.round(winProbability.probabilityB * 100)}
        <div class="probability-indicator">
          <span class="prob-value" style="color: {probabilityColor(pctA)}">{pctA}</span>
          <div class="prob-bar">
            <div class="prob-fill-a" style="width: {pctA}%"></div>
          </div>
          <span class="prob-value" style="color: {probabilityColor(pctB)}">{pctB}</span>
        </div>
      {/if}
    </div>

    <div class="participant right" class:winner={match.winner === match.participantB} class:loser={isMatchDecided && match.winner !== match.participantB && !isBye} class:tie={isTie} class:bye-participant={isBye} class:disqualified={isDisqualifiedB} class:has-hammer={hammerHolder === match.participantB}>
      {#if isDisqualifiedB}
        <span class="dsq-badge">DSQ</span>
      {/if}
      <span class="name">{getParticipantName(match.participantB)}</span>
    </div>
  </div>

  <!-- Meta row: table, round/duration, 20s, status -->
  {#if !isBye}
    <div class="match-meta">
      <div class="meta-left">
        {#if match.tableNumber || match.playedOnTable}
          <span class="table-num">{m.tournament_tableShort()}{match.tableNumber || match.playedOnTable}</span>
        {:else}
          <span class="table-num tbd">{match.status === 'PENDING' ? 'TBD' : '—'}</span>
        {/if}
        {#if match.status === 'IN_PROGRESS'}
          {@const currentRound = (match.rounds?.length ?? 0) + 1}
          <span class="round-indicator">R{currentRound}</span>
        {:else if (match.status === 'COMPLETED' || match.status === 'WALKOVER') && match.duration}
          {@const totalSec = Math.round(match.duration / 1000)}
          {@const min = Math.floor(totalSec / 60)}
          {@const sec = totalSec % 60}
          <span class="duration-indicator"><Timer size={11} />{min}:{sec.toString().padStart(2, '0')}</span>
        {/if}
      </div>
      <div class="meta-right">
        {#if showPopover}
          <span class="info-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </span>
        {/if}
        <span class="status-dot" style="background: {statusInfo.color}" title={statusInfo.text}></span>
      </div>
    </div>
  {/if}

  {#if match.noShowParticipant}
    <div class="no-show-warning">
      ⚠️ {getParticipantName(match.noShowParticipant)}
    </div>
  {/if}
{/snippet}

{#snippet roundDetailsContent()}
  <div class="round-details">
    {#each gameGroups as game}
      {@const gameTotalA = game.rounds.reduce((s, r) => s + (r.pointsA || 0), 0)}
      {@const gameTotalB = game.rounds.reduce((s, r) => s + (r.pointsB || 0), 0)}
      {@const game20sA = game.rounds.reduce((s, r) => s + (r.twentiesA || 0), 0)}
      {@const game20sB = game.rounds.reduce((s, r) => s + (r.twentiesB || 0), 0)}
      {@const gameWinnerA = gameTotalA > gameTotalB}
      {@const gameWinnerB = gameTotalB > gameTotalA}
      {#if gameGroups.length > 1}
        <div class="game-label">P{game.gameNumber}</div>
      {/if}
      <table class="rounds-table">
        <thead>
          <tr>
            <th class="name-col"></th>
            {#each game.rounds as _, ri}
              <th class="round-col">R{ri + 1}</th>
            {/each}
            <th class="total-col">T</th>
          </tr>
        </thead>
        <tbody>
          <tr class={[gameWinnerA && "winner-row", gameWinnerB && "loser-row"]}>
            <td class="name-col">{getShortName(match.participantA)}</td>
            {#each game.rounds as round}
              <td class={["round-col", (round.pointsA || 0) > (round.pointsB || 0) && "round-win"]}>{round.pointsA ?? '-'}{#if hasAny20s}<span class="t20-inline"> / {round.twentiesA || 0}</span>{/if}</td>
            {/each}
            <td class="total-col">{gameTotalA}{#if hasAny20s}<span class="t20-inline"> / {game20sA}</span>{/if}</td>
          </tr>
          <tr class={[gameWinnerB && "winner-row", gameWinnerA && "loser-row"]}>
            <td class="name-col">{getShortName(match.participantB)}</td>
            {#each game.rounds as round}
              <td class={["round-col", (round.pointsB || 0) > (round.pointsA || 0) && "round-win"]}>{round.pointsB ?? '-'}{#if hasAny20s}<span class="t20-inline"> / {round.twentiesB || 0}</span>{/if}</td>
            {/each}
            <td class="total-col">{gameTotalB}{#if hasAny20s}<span class="t20-inline"> / {game20sB}</span>{/if}</td>
          </tr>
        </tbody>
      </table>
    {/each}
  </div>
{/snippet}

{#if showPopover}
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <div
          {...props}
          class={["match-card", "clickable", compact && "compact", isBye && "bye", locked && "locked",
            match.status === 'COMPLETED' && "completed",
            match.status === 'WALKOVER' && "walkover",
            match.status === 'IN_PROGRESS' && "in-progress"]}
        >
          {@render cardInner()}
        </div>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-auto max-w-[90vw] p-0" style="min-width: var(--bits-popover-anchor-width, auto)" align="center" sideOffset={8}>
      {@render roundDetailsContent()}
    </Popover.Content>
  </Popover.Root>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="match-card"
    class:compact
    class:clickable={isClickable}
    class:bye={isBye}
    class:locked={locked}
    class:completed={match.status === 'COMPLETED'}
    class:walkover={match.status === 'WALKOVER'}
    class:in-progress={match.status === 'IN_PROGRESS'}
    onclick={() => isClickable && onMatchClick && onMatchClick(match)}
    onkeydown={(e) => isClickable && e.key === 'Enter' && onMatchClick && onMatchClick(match)}
    role={isClickable ? 'button' : undefined}
    tabindex={isClickable ? 0 : undefined}
  >
    {@render cardInner()}
  </div>
{/if}

<style>
  .match-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
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

  .match-card.locked {
    opacity: 0.45;
    pointer-events: none;
    background: #f3f4f6;
  }

  /* Main row: players + score */
  .match-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Meta row: table, round/duration, 20s, status */
  .match-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.35rem;
    margin-top: 0.35rem;
    border-top: 1px solid #f0f0f0;
  }

  .meta-left {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .meta-right {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .table-num {
    font-size: 0.6rem;
    font-weight: 700;
    color: white;
    background: var(--primary);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    min-width: 1.4rem;
    text-align: center;
  }

  .table-num.tbd {
    background: #9ca3af;
    color: white;
    font-style: italic;
  }

  .round-indicator {
    font-size: 0.6rem;
    font-weight: 700;
    color: #92400e;
    background: rgba(245, 158, 11, 0.2);
    border-radius: 3px;
    padding: 0.1rem 0.35rem;
    letter-spacing: 0.03em;
  }

  .duration-indicator {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.65rem;
    font-weight: 500;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
  }

  .t20 {
    font-size: 0.6rem;
    font-weight: 600;
    color: #9ca3af;
    font-variant-numeric: tabular-nums;
    min-width: 0.7rem;
    text-align: center;
  }

  .t20-sep {
    font-size: 0.5rem;
    color: #d1d5db;
  }

  .participant {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.4rem;
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
    color: #dc2626;
    font-weight: 600;
  }

  .participant.tie .name {
    color: #6b7280;
  }

  .participant.bye-participant {
    flex: 0 0 auto;
  }

  .participant.bye-participant .name {
    font-style: italic;
    opacity: 0.6;
  }

  /* In BYE matches, shrink the score center and let the real player name breathe */
  .match-card.bye .score-center {
    min-width: 2rem;
    padding: 0.15rem 0.3rem;
  }

  .participant.has-hammer {
    position: relative;
    background: #dcfce7;
    border-radius: 4px;
    padding: 2px 6px;
  }

  .participant.has-hammer::after {
    content: '🔨';
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.85rem;
    opacity: 0.8;
    pointer-events: none;
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
    flex-direction: column;
    align-items: center;
    gap: 0;
    padding: 0.2rem 0.5rem;
    background: #f3f4f6;
    border-radius: 6px;
    min-width: 3.2rem;
  }

  .score-line {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    justify-content: center;
  }

  .t20-line {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    justify-content: center;
    margin-top: 1px;
  }

  .score-center .score {
    font-size: 0.95rem;
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
    color: #dc2626;
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

  /* Win probability indicator */
  .probability-indicator {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    width: 100%;
    max-width: 4rem;
  }

  .probability-indicator .prob-value {
    font-size: 0.5rem;
    color: #9ca3af;
    font-weight: 600;
    min-width: 0.9rem;
    text-align: center;
  }

  .probability-indicator .prob-bar {
    flex: 1;
    height: 3px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
  }

  .probability-indicator .prob-fill-a {
    height: 100%;
    background: var(--primary, #667eea);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .probability-indicator.live-prob {
    opacity: 0.6;
    margin-top: 1px;
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

  :global(:is([data-theme='dark'], [data-theme='violet'])) .round-indicator {
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.15);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.walkover {
    background: rgba(220, 38, 38, 0.1);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant.has-hammer {
    background: rgba(16, 185, 129, 0.15);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant.disqualified .name {
    color: #f87171 !important;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.bye {
    background: #0f1419;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.locked {
    background: #0f1419;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant .name {
    color: #e1e8ed;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant.winner .name {
    color: #10b981;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .participant.loser .name {
    color: #f87171;
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
    color: #f87171;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center .pending {
    color: #6b7280;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .probability-indicator .prob-value {
    color: #6b7280;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .probability-indicator .prob-bar {
    background: #374151;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .score-center .score.live {
    color: #fbbf24;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .no-show-warning {
    background: rgba(254, 243, 199, 0.15);
    color: #fbbf24;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-meta {
    border-top-color: rgba(255, 255, 255, 0.08);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .t20-sep {
    color: #4a5568;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .duration-indicator {
    color: #8b9bb3;
  }

  /* Info hint icon */
  .info-hint {
    display: inline-flex;
    align-items: center;
    color: #9ca3af;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .match-card.clickable:hover .info-hint {
    opacity: 1;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .info-hint {
    color: #6b7280;
  }

  /* Round details popover (rendered in portal, needs :global) */
  :global(.round-details) {
    padding: 0.6rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  :global(.game-label) {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    padding: 0.15rem 0;
    border-bottom: 1px solid #e5e7eb;
    margin-top: 0.25rem;
  }

  :global(.game-label:first-child) {
    margin-top: 0;
  }

  :global(.rounds-table) {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  :global(.rounds-table th) {
    font-size: 0.55rem;
    font-weight: 600;
    color: #9ca3af;
    padding: 0.15rem 0.4rem;
    text-align: center;
  }

  :global(.rounds-table td) {
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
    text-align: center;
    color: #374151;
  }

  :global(.rounds-table .name-col) {
    text-align: left;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 6rem;
    padding-right: 0.6rem;
  }

  :global(.rounds-table .round-col) {
    width: 3.2rem;
    white-space: nowrap;
    text-align: center;
  }

  :global(.rounds-table .total-col) {
    font-weight: 700;
    border-left: 1.5px solid #e5e7eb;
  }

  :global(.rounds-table .t20-inline) {
    font-size: 0.55rem;
    color: #d97706;
    font-weight: 600;
  }

  :global(.rounds-table .winner-row td) {
    color: #059669;
    font-weight: 600;
  }

  :global(.rounds-table .loser-row td) {
    color: #9ca3af;
  }

  :global(.rounds-table .round-win) {
    background: rgba(16, 185, 129, 0.08);
    font-weight: 700;
  }


  /* Round details dark mode */
  :global(:is([data-theme='dark'], [data-theme='violet']) .game-label) {
    color: #9ca3af;
    border-bottom-color: #374151;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table th) {
    color: #6b7280;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table td) {
    color: #e1e8ed;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .total-col) {
    border-left-color: #374151;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .winner-row td) {
    color: #10b981;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .loser-row td) {
    color: #6b7280;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .round-win) {
    background: rgba(16, 185, 129, 0.12);
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .t20-inline) {
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
      font-size: 0.55rem;
      padding: 0.1rem 0.25rem;
      min-width: 1.2rem;
    }

    .participant .name {
      font-size: 0.75rem;
    }

    .t20 {
      font-size: 0.6rem;
    }

    .score-center {
      padding: 0.15rem 0.35rem;
      min-width: 2.5rem;
    }

    .score-center .score {
      font-size: 0.85rem;
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
