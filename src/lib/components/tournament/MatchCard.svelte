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
  <!-- Status bar: table, round/duration, status -->
  {#if !isBye}
    <div class="match-status-bar">
      <div class="status-left">
        {#if match.tableNumber || match.playedOnTable}
          <span class="table-badge">{m.tournament_tableShort()}{match.tableNumber || match.playedOnTable}</span>
        {:else}
          <span class="table-badge tbd">{match.status === 'PENDING' ? 'TBD' : '—'}</span>
        {/if}
        {#if match.status === 'IN_PROGRESS'}
          {@const currentRound = (match.rounds?.length ?? 0) + 1}
          <span class="live-dot"></span>
          <span class="round-tag">R{currentRound}</span>
        {:else if (match.status === 'COMPLETED' || match.status === 'WALKOVER') && match.duration}
          {@const totalSec = Math.round(match.duration / 1000)}
          {@const min = Math.floor(totalSec / 60)}
          {@const sec = totalSec % 60}
          <span class="duration-tag"><Timer size={10} />{min}:{sec.toString().padStart(2, '0')}</span>
        {/if}
      </div>
      <div class="status-right">
        {#if showPopover}
          <span class="info-hint">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </span>
        {/if}
        <span class="status-indicator" style="background: {statusInfo.color}" title={statusInfo.text}></span>
      </div>
    </div>
  {/if}

  <!-- Player rows -->
  <div class="players">
    <!-- Player A -->
    <div class="player-row" class:winner={match.winner === match.participantA} class:loser={isMatchDecided && match.winner !== match.participantA} class:tie={isTie} class:disqualified={isDisqualifiedA} class:has-hammer={hammerHolder === match.participantA}>
      <span class="player-name">{getParticipantName(match.participantA)}</span>
      {#if isDisqualifiedA}<span class="dsq-badge">DSQ</span>{/if}
      {#if (match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS') && !isBye}
        <span class="twenties">{match.total20sA ?? 0}</span>
      {/if}
      <span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={scoreChangedA}>
        {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
          {showTotalPoints ? (match.totalPointsA || 0) : (match.gamesWonA || 0)}
        {:else if match.status === 'IN_PROGRESS'}
          {currentScoreA}
        {:else}
          —
        {/if}
      </span>
    </div>

    <!-- Divider -->
    <div class="player-divider"></div>

    <!-- Player B -->
    <div class="player-row" class:winner={match.winner === match.participantB} class:loser={isMatchDecided && match.winner !== match.participantB && !isBye} class:tie={isTie} class:bye-row={isBye} class:disqualified={isDisqualifiedB} class:has-hammer={hammerHolder === match.participantB}>
      <span class="player-name">{getParticipantName(match.participantB)}</span>
      {#if isDisqualifiedB}<span class="dsq-badge">DSQ</span>{/if}
      {#if (match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS') && !isBye}
        <span class="twenties">{match.total20sB ?? 0}</span>
      {/if}
      <span class="player-score" class:live={match.status === 'IN_PROGRESS'} class:score-changed={scoreChangedB}>
        {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
          {isBye ? '—' : (showTotalPoints ? (match.totalPointsB || 0) : (match.gamesWonB || 0))}
        {:else if match.status === 'IN_PROGRESS'}
          {isBye ? '—' : currentScoreB}
        {:else}
          —
        {/if}
      </span>
    </div>
  </div>

  <!-- Probability split bar -->
  {#if (match.status === 'IN_PROGRESS' || match.status === 'PENDING') && winProbability && winProbability.confidence !== 'none' && winProbability.confidence !== 'low'}
    {@const pctA = Math.round(winProbability.probabilityA * 100)}
    {@const pctB = Math.round(winProbability.probabilityB * 100)}
    <div class="prob-row" class:live-prob={match.status === 'IN_PROGRESS'}>
      <span class="prob-pct prob-a" style="color: {probabilityColor(pctA)}">{pctA}%</span>
      <div class="prob-track">
        <div class="prob-seg seg-a" style="width: {pctA}%; background: {probabilityColor(pctA)}"></div>
        <div class="prob-seg seg-b" style="width: {pctB}%; background: {probabilityColor(pctB)}"></div>
      </div>
      <span class="prob-pct prob-b" style="color: {probabilityColor(pctB)}">{pctB}%</span>
    </div>
  {/if}

  <!-- No-show warning -->
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
            match.status === 'PENDING' && "pending",
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
    class:pending={match.status === 'PENDING'}
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
  /* ── Card container ── */
  .match-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: all 0.15s;
    overflow: hidden;
  }

  .match-card.compact {
    /* Slightly tighter player rows */
  }

  .match-card.clickable {
    cursor: pointer;
  }

  .match-card.clickable:hover {
    border-color: #667eea;
    background: color-mix(in srgb, #667eea 4%, var(--card));
  }

  /* ── Status glow: pending (slate) ── */
  .match-card.pending {
    border-color: color-mix(in srgb, #6b7280 25%, var(--border));
    background: color-mix(in srgb, #6b7280 3%, var(--card));
    box-shadow: 0 0 0 0.5px color-mix(in srgb, #6b7280 8%, transparent),
                0 0 5px -1px color-mix(in srgb, #6b7280 5%, transparent);
  }

  .match-card.pending .match-status-bar {
    background: color-mix(in srgb, #6b7280 5%, transparent);
    border-bottom-color: color-mix(in srgb, #6b7280 10%, transparent);
  }

  /* ── Status glow: completed (green) ── */
  .match-card.completed {
    border-color: color-mix(in srgb, #10b981 35%, var(--border));
    background: color-mix(in srgb, #10b981 4%, var(--card));
    box-shadow: 0 0 0 0.5px color-mix(in srgb, #10b981 12%, transparent),
                0 0 6px -1px color-mix(in srgb, #10b981 8%, transparent);
  }

  .match-card.completed .match-status-bar {
    background: color-mix(in srgb, #10b981 8%, transparent);
    border-bottom-color: color-mix(in srgb, #10b981 15%, transparent);
  }

  /* ── Status glow: in-progress (amber, animated) ── */
  .match-card.in-progress {
    border-color: color-mix(in srgb, #f59e0b 45%, var(--border));
    background: color-mix(in srgb, #f59e0b 5%, var(--card));
    animation: live-glow 3s ease-in-out infinite;
  }

  .match-card.in-progress .match-status-bar {
    background: color-mix(in srgb, #f59e0b 10%, transparent);
    border-bottom-color: color-mix(in srgb, #f59e0b 20%, transparent);
  }

  @keyframes live-glow {
    0%, 100% {
      box-shadow: 0 0 0 0.5px color-mix(in srgb, #f59e0b 12%, transparent),
                  0 0 6px -1px color-mix(in srgb, #f59e0b 8%, transparent);
    }
    50% {
      box-shadow: 0 0 0 1px color-mix(in srgb, #f59e0b 28%, transparent),
                  0 0 14px -1px color-mix(in srgb, #f59e0b 16%, transparent);
    }
  }

  /* ── Status glow: walkover (red) ── */
  .match-card.walkover {
    border-color: color-mix(in srgb, #dc2626 35%, var(--border));
    background: color-mix(in srgb, #dc2626 4%, var(--card));
    box-shadow: 0 0 0 0.5px color-mix(in srgb, #dc2626 12%, transparent),
                0 0 6px -1px color-mix(in srgb, #dc2626 8%, transparent);
  }

  .match-card.walkover .match-status-bar {
    background: color-mix(in srgb, #dc2626 8%, transparent);
    border-bottom-color: color-mix(in srgb, #dc2626 15%, transparent);
  }

  .match-card.bye {
    opacity: 0.55;
  }

  .match-card.locked {
    opacity: 0.4;
    pointer-events: none;
  }

  /* ── Status bar ── */
  .match-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 8px;
    gap: 6px;
    background: color-mix(in srgb, var(--foreground) 3%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .status-right {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .table-badge {
    font-size: 0.54rem;
    font-weight: 700;
    color: #e2e8f0;
    background: #334155;
    padding: 1px 6px;
    border-radius: 4px;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
    border: 1px solid color-mix(in srgb, #475569 60%, transparent);
  }

  .table-badge.tbd {
    color: var(--muted-foreground);
    background: color-mix(in srgb, var(--foreground) 6%, transparent);
    border-color: color-mix(in srgb, var(--foreground) 10%, transparent);
    font-style: italic;
  }

  .live-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #f59e0b;
    flex-shrink: 0;
    animation: live-dot-pulse 1.5s ease-in-out infinite;
  }

  @keyframes live-dot-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(0.7); }
  }

  .round-tag {
    font-size: 0.58rem;
    font-weight: 700;
    color: #92400e;
    background: color-mix(in srgb, #f59e0b 20%, transparent);
    padding: 1px 5px;
    border-radius: 3px;
    letter-spacing: 0.03em;
  }

  .duration-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.6rem;
    font-weight: 500;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }

  .status-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .info-hint {
    display: inline-flex;
    align-items: center;
    color: var(--muted-foreground);
    opacity: 0.5;
    transition: opacity 0.15s;
  }

  .match-card.clickable:hover .info-hint {
    opacity: 1;
  }

  /* ── Player rows ── */
  .players {
    padding: 0;
  }

  .player-row {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    gap: 6px;
    min-height: 26px;
  }

  .match-card.compact .player-row {
    padding: 3px 7px;
    min-height: 22px;
  }

  .player-divider {
    height: 1px;
    margin: 0 8px;
    background: color-mix(in srgb, var(--border) 40%, transparent);
  }

  .player-name {
    flex: 1;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--card-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .twenties {
    font-size: 0.52rem;
    font-weight: 700;
    color: #d97706;
    min-width: 1rem;
    height: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    border-radius: 50%;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .player-score {
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--card-foreground);
    font-variant-numeric: tabular-nums;
    min-width: 1.6rem;
    text-align: right;
    flex-shrink: 0;
    letter-spacing: -0.02em;
  }

  /* ── Winner / Loser / Tie states ── */
  .player-row.winner .player-name {
    color: #059669;
    font-weight: 700;
  }
  .player-row.winner .player-score {
    color: #059669;
  }

  .player-row.loser .player-name {
    color: #dc2626;
    opacity: 0.75;
  }
  .player-row.loser .player-score {
    color: #dc2626;
    opacity: 0.75;
  }

  .player-row.tie .player-name,
  .player-row.tie .player-score {
    color: var(--muted-foreground);
  }

  /* ── Hammer ── */
  .player-row.has-hammer {
    background: color-mix(in srgb, #10b981 7%, transparent);
  }

  /* ── DSQ ── */
  .player-row.disqualified .player-name {
    text-decoration: line-through;
    color: #dc2626;
    opacity: 0.7;
  }

  .dsq-badge {
    font-size: 0.5rem;
    font-weight: 700;
    color: white;
    background: #dc2626;
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  /* ── BYE ── */
  .player-row.bye-row .player-name {
    font-style: italic;
    opacity: 0.5;
  }
  .player-row.bye-row .player-score {
    opacity: 0.3;
  }

  /* ── Live score animations ── */
  .player-score.live {
    color: #f59e0b;
    animation: pulse-score 2s ease-in-out infinite;
  }

  .player-score.score-changed {
    animation: score-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    color: #10b981;
  }

  @keyframes pulse-score {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.65; }
  }

  @keyframes score-pop {
    0% { transform: scale(1); }
    30% { transform: scale(1.35); }
    100% { transform: scale(1); }
  }

  /* ── Probability split bar ── */
  .prob-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 5px;
    border-top: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
  }

  .prob-row.live-prob {
    opacity: 0.65;
  }

  .prob-pct {
    font-size: 0.55rem;
    font-weight: 700;
    min-width: 1.6rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }

  .prob-pct.prob-a {
    text-align: right;
  }

  .prob-pct.prob-b {
    text-align: left;
  }

  .prob-track {
    flex: 1;
    height: 5px;
    display: flex;
    border-radius: 3px;
    overflow: hidden;
    gap: 1.5px;
    background: color-mix(in srgb, var(--foreground) 4%, transparent);
  }

  .prob-seg {
    height: 100%;
    transition: width 0.4s ease;
    opacity: 0.75;
  }

  .prob-seg.seg-a {
    border-radius: 3px 0 0 3px;
  }

  .prob-seg.seg-b {
    border-radius: 0 3px 3px 0;
  }

  /* ── No-show warning ── */
  .no-show-warning {
    margin: 0 8px 4px;
    padding: 2px 6px;
    background: #fef3c7;
    color: #92400e;
    border-radius: 3px;
    font-size: 0.6rem;
    text-align: center;
  }

  /* ── Dark mode ── */
  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.clickable:hover {
    border-color: #667eea;
    background: color-mix(in srgb, #667eea 6%, var(--card));
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.pending {
    border-color: color-mix(in srgb, #6b7280 20%, var(--border));
    background: color-mix(in srgb, #6b7280 5%, var(--card));
    box-shadow: 0 0 0 0.5px color-mix(in srgb, #6b7280 10%, transparent),
                0 0 6px -1px color-mix(in srgb, #6b7280 6%, transparent);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.completed {
    border-color: color-mix(in srgb, #10b981 30%, var(--border));
    background: color-mix(in srgb, #10b981 6%, var(--card));
    box-shadow: 0 0 0 0.5px color-mix(in srgb, #10b981 15%, transparent),
                0 0 8px -1px color-mix(in srgb, #10b981 10%, transparent);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.in-progress {
    border-color: color-mix(in srgb, #f59e0b 35%, var(--border));
    background: color-mix(in srgb, #f59e0b 7%, var(--card));
    animation-name: live-glow-dark;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .match-card.walkover {
    border-color: color-mix(in srgb, #dc2626 30%, var(--border));
    background: color-mix(in srgb, #dc2626 6%, var(--card));
    box-shadow: 0 0 0 0.5px color-mix(in srgb, #dc2626 15%, transparent),
                0 0 8px -1px color-mix(in srgb, #dc2626 10%, transparent);
  }

  @keyframes live-glow-dark {
    0%, 100% {
      box-shadow: 0 0 0 0.5px color-mix(in srgb, #f59e0b 18%, transparent),
                  0 0 8px -1px color-mix(in srgb, #f59e0b 12%, transparent);
    }
    50% {
      box-shadow: 0 0 0 1px color-mix(in srgb, #f59e0b 35%, transparent),
                  0 0 18px -1px color-mix(in srgb, #f59e0b 22%, transparent);
    }
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .live-dot {
    background: #fbbf24;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .round-tag {
    color: #fbbf24;
    background: color-mix(in srgb, #f59e0b 15%, transparent);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .table-badge {
    color: #cbd5e1;
    background: #475569;
    border-color: color-mix(in srgb, #64748b 40%, transparent);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .table-badge.tbd {
    color: #6b7280;
    background: color-mix(in srgb, #fff 4%, transparent);
    border-color: color-mix(in srgb, #fff 8%, transparent);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .player-row.winner .player-name,
  :global(:is([data-theme='dark'], [data-theme='violet'])) .player-row.winner .player-score {
    color: #10b981;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .player-row.loser .player-name,
  :global(:is([data-theme='dark'], [data-theme='violet'])) .player-row.loser .player-score {
    color: #f87171;
    opacity: 0.8;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .player-row.tie .player-name,
  :global(:is([data-theme='dark'], [data-theme='violet'])) .player-row.tie .player-score {
    color: #8b9bb3;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .player-score.live {
    color: #fbbf24;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .player-row.disqualified .player-name {
    color: #f87171;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .player-row.has-hammer {
    background: color-mix(in srgb, #10b981 8%, transparent);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .twenties {
    color: #fbbf24;
    background: color-mix(in srgb, #f59e0b 10%, transparent);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .no-show-warning {
    background: color-mix(in srgb, #fbbf24 10%, transparent);
    color: #fbbf24;
  }

  /* ── Round details popover (portal — needs :global) ── */
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

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .player-row {
      padding: 3px 6px;
      gap: 5px;
      min-height: 24px;
    }

    .match-status-bar {
      padding: 2px 6px;
    }

    .player-name {
      font-size: 0.72rem;
    }

    .player-score {
      font-size: 0.85rem;
      min-width: 1.4rem;
    }

    .table-badge {
      font-size: 0.52rem;
      padding: 1px 4px;
    }

    .twenties {
      font-size: 0.48rem;
      min-width: 0.85rem;
      height: 0.85rem;
    }

    .status-indicator {
      width: 5px;
      height: 5px;
    }

    .no-show-warning {
      font-size: 0.55rem;
      margin: 0 6px 3px;
    }
  }

  /* Mobile landscape */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .player-row {
      padding: 2px 5px;
      gap: 4px;
      min-height: 20px;
    }

    .match-status-bar {
      padding: 2px 5px;
    }

    .player-name {
      font-size: 0.68rem;
    }

    .player-score {
      font-size: 0.78rem;
      min-width: 1.2rem;
    }

    .table-badge {
      font-size: 0.5rem;
    }
  }
</style>
