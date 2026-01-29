<script lang="ts">
  import type { Tournament } from '$lib/types/tournament';
  import { formatDuration, calculateTimeBreakdown } from '$lib/utils/tournamentTime';
  import * as m from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime';

  interface Props {
    tournament: Tournament;
    theme?: 'light' | 'dark';
    onclose: () => void;
  }

  let { tournament, theme = 'dark', onclose }: Props = $props();

  // Calculate time breakdown for phase durations
  let timeBreakdown = $derived(calculateTimeBreakdown(tournament));

  // Format tournament date in short format
  let formattedDate = $derived(
    tournament.tournamentDate
      ? new Date(tournament.tournamentDate).toLocaleDateString(getLocale(), {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit'
        })
      : null
  );

  // Calculate estimated end time
  let estimatedEndTime = $derived((() => {
    if (!timeBreakdown.totalMinutes) return null;

    let startTime: number;

    if (tournament.startedAt) {
      // Tournament already started - use actual start time
      startTime = tournament.startedAt;
    } else if (tournament.tournamentDate) {
      // Tournament scheduled - check if it's today
      const tournamentDay = new Date(tournament.tournamentDate);
      const today = new Date();
      const isToday = tournamentDay.toDateString() === today.toDateString();

      if (isToday) {
        // Today - use current time as estimated start
        startTime = Date.now();
      } else {
        // Future date - assume 10:00 start
        tournamentDay.setHours(10, 0, 0, 0);
        startTime = tournamentDay.getTime();
      }
    } else {
      // No date - use current time
      startTime = Date.now();
    }

    const endDate = new Date(startTime + timeBreakdown.totalMinutes * 60 * 1000);
    return endDate.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
  })());

  // Build location string (city only)
  let location = $derived(tournament.city || null);

  // Get group stage system explanation
  let groupSystemExplanation = $derived((() => {
    if (!tournament.groupStage) return null;
    const numGroups = tournament.groupStage.numGroups || 1;
    if (tournament.groupStage.type === 'ROUND_ROBIN') {
      return numGroups === 1
        ? m.rules_roundRobinSingleGroup()
        : m.rules_roundRobinMultiGroup({ n: numGroups });
    } else if (tournament.groupStage.type === 'SWISS') {
      return m.rules_swissExplanation({ n: tournament.groupStage.numSwissRounds || 5 });
    }
    return null;
  })());


  // Get final stage description
  let finalStageDesc = $derived((() => {
    if (!tournament.finalStage) return null;
    const mode = tournament.finalStage.mode;
    const hasConsolation = tournament.finalStage.consolationEnabled;

    if (mode === 'SPLIT_DIVISIONS') {
      return hasConsolation
        ? m.rules_goldSilverWithConsolation()
        : m.rules_goldSilverBrackets();
    } else {
      return hasConsolation
        ? m.rules_singleBracketWithConsolation()
        : m.rules_singleBracketElimination();
    }
  })());

  // Get game mode description for a phase
  function getGameModeDesc(gameMode: 'points' | 'rounds', points?: number, rounds?: number, matchesToWin?: number): string {
    const modeStr = gameMode === 'points'
      ? m.rules_pointsMode({ n: points || 7 })
      : m.rules_roundsMode({ n: rounds || 4 });

    if (matchesToWin && matchesToWin > 1) {
      return `${modeStr} (${m.bracket_bestOf()}${matchesToWin})`;
    }
    return modeStr;
  }

  // Group stage game mode
  let groupGameMode = $derived(
    tournament.groupStage
      ? getGameModeDesc(
          tournament.groupStage.gameMode,
          tournament.groupStage.pointsToWin,
          tournament.groupStage.roundsToPlay,
          tournament.groupStage.matchesToWin
        )
      : null
  );

  // Calculate tables/players info
  let tablesInfo = $derived((() => {
    const numPlayers = tournament.participants.length;
    const numTables = tournament.numTables;
    const isSingles = tournament.gameType === 'singles';

    // Matches per round (floor because odd number = 1 BYE)
    const matchesPerRound = Math.floor(numPlayers / 2);
    const hasOddBye = numPlayers % 2 === 1;

    // Can all matches play at once?
    const allPlayAtOnce = matchesPerRound <= numTables;

    return {
      numPlayers,
      numTables,
      matchesPerRound,
      hasOddBye,
      allPlayAtOnce,
      isSingles
    };
  })());

  // Get ranking tier display name and max points
  let rankingInfo = $derived((() => {
    if (!tournament.rankingConfig?.enabled) return null;
    const tierMap: Record<string, { name: string; maxPoints: number }> = {
      'CLUB': { name: m.admin_tierClub(), maxPoints: 15 },
      'REGIONAL': { name: m.admin_tierRegional(), maxPoints: 25 },
      'NATIONAL': { name: m.admin_tierNational(), maxPoints: 40 },
      'MAJOR': { name: m.admin_tierMajor(), maxPoints: 50 }
    };
    return tierMap[tournament.rankingConfig.tier || 'CLUB'];
  })());

  // Check if tournament has split divisions (Gold/Silver)
  let hasSplitDivisions = $derived(tournament.finalStage?.mode === 'SPLIT_DIVISIONS');

  // Helper to convert markdown bold to HTML
  function formatText(text: string): string {
    return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="modal-backdrop"
  data-theme={theme}
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  role="none"
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="rules-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
    <!-- Header with logo -->
    <div class="modal-header">
      <div class="logo">
        <span class="logo-text">Scorekinole</span>
        <span class="logo-suffix">
          <span class="logo-arena">Arena</span>
        </span>
      </div>
      <button class="close-btn" onclick={onclose} aria-label="Cerrar">×</button>
    </div>

    <!-- Tournament title section -->
    <div class="tournament-title">
      <h1>
        {m.rules_rulesOf()}
        {#if tournament.edition}
          <span class="edition">#{tournament.edition}</span>
        {/if}
        {tournament.name}
      </h1>
      {#if location || formattedDate}
        <div class="subtitle">
          {#if location}
            <span class="location">{location}</span>
          {/if}
          {#if location && formattedDate}
            <span class="separator">·</span>
          {/if}
          {#if formattedDate}
            <span class="date">{formattedDate}</span>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Rules content -->
    <div class="rules-content">
      <!-- Format overview -->
      <section class="rules-section">
        <h2>{m.rules_format()}</h2>
        <p>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html formatText(m.rules_tournamentParticipants({ n: tournament.participants.length }))}
          <strong>{tournament.gameType === 'singles' ? m.admin_singles() : m.admin_doubles()}</strong>.
          {#if tournament.phaseType === 'TWO_PHASE'}
            {m.rules_twoPhaseIntro()}
          {:else}
            {m.rules_onePhaseIntro()}
          {/if}
        </p>
      </section>

      <!-- Tables info -->
      <section class="rules-section">
        <h2>{m.rules_tables()}</h2>
        <p>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {#if tablesInfo.allPlayAtOnce}
            {@html formatText(
              tablesInfo.isSingles
                ? m.rules_tablesAllPlaySingles({ players: tablesInfo.numPlayers, tables: tablesInfo.numTables, matches: tablesInfo.matchesPerRound })
                : m.rules_tablesAllPlayDoubles({ players: tablesInfo.numPlayers, tables: tablesInfo.numTables, matches: tablesInfo.matchesPerRound })
            )}
          {:else}
            {@html formatText(
              tablesInfo.isSingles
                ? m.rules_tablesSomeWaitSingles({ players: tablesInfo.numPlayers, tables: tablesInfo.numTables, matches: tablesInfo.matchesPerRound })
                : m.rules_tablesSomeWaitDoubles({ players: tablesInfo.numPlayers, tables: tablesInfo.numTables, matches: tablesInfo.matchesPerRound })
            )}
          {/if}
          {#if tablesInfo.hasOddBye}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html formatText(
              tablesInfo.isSingles
                ? m.rules_tablesOddByeSingles()
                : m.rules_tablesOddByeDoubles()
            )}
          {/if}
        </p>
      </section>

      <!-- Group Stage (if TWO_PHASE) -->
      {#if tournament.phaseType === 'TWO_PHASE' && tournament.groupStage}
        <section class="rules-section">
          <h2>
            {m.rules_groupStage()}
            {#if timeBreakdown.groupStage}
              <span class="phase-duration">(⏱ ~{formatDuration(timeBreakdown.groupStage.totalMinutes)})</span>
            {/if}
          </h2>
          <p>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html formatText(groupSystemExplanation || '')}.
            {m.rules_groupGameMode({ mode: groupGameMode || '' })}.
          </p>
        </section>
      {/if}

      <!-- Final Stage -->
      <section class="rules-section">
        <h2>
          {m.rules_finalStage()}
          {#if timeBreakdown.finalStage}
            <span class="phase-duration">(⏱ ~{formatDuration(timeBreakdown.finalStage.totalMinutes)})</span>
          {/if}
        </h2>
        <p>
          {#if tournament.phaseType === 'TWO_PHASE'}
            {m.rules_qualifiersAdvance()}.
          {/if}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html formatText(finalStageDesc || '')}.
        </p>

        {#if tournament.finalStage?.goldBracket?.config}
          {@const goldConfig = tournament.finalStage.goldBracket.config}
          {@const silverConfig = tournament.finalStage.silverBracket?.config}

          {#if hasSplitDivisions}
            <div class="brackets-row">
              <!-- Gold Bracket details -->
              <div class="bracket-details">
                <h3>🥇 {m.admin_goldBracket()}</h3>
                <ul class="phase-list">
                  <li>
                    <strong>{m.admin_earlyRounds()}:</strong>
                    {getGameModeDesc(goldConfig.earlyRounds.gameMode, goldConfig.earlyRounds.pointsToWin, goldConfig.earlyRounds.roundsToPlay, goldConfig.earlyRounds.matchesToWin)}
                  </li>
                  <li>
                    <strong>{m.admin_semifinals()}:</strong>
                    {getGameModeDesc(goldConfig.semifinal.gameMode, goldConfig.semifinal.pointsToWin, goldConfig.semifinal.roundsToPlay, goldConfig.semifinal.matchesToWin)}
                  </li>
                  <li>
                    <strong>{m.admin_final()}:</strong>
                    {getGameModeDesc(goldConfig.final.gameMode, goldConfig.final.pointsToWin, goldConfig.final.roundsToPlay, goldConfig.final.matchesToWin)}
                  </li>
                </ul>
              </div>

              <!-- Silver Bracket details -->
              {#if silverConfig}
                <div class="bracket-details silver">
                  <h3>🥈 {m.admin_silverBracket()}</h3>
                  <ul class="phase-list">
                    <li>
                      <strong>{m.admin_earlyRounds()}:</strong>
                      {getGameModeDesc(silverConfig.earlyRounds.gameMode, silverConfig.earlyRounds.pointsToWin, silverConfig.earlyRounds.roundsToPlay, silverConfig.earlyRounds.matchesToWin)}
                    </li>
                    <li>
                      <strong>{m.admin_semifinals()}:</strong>
                      {getGameModeDesc(silverConfig.semifinal.gameMode, silverConfig.semifinal.pointsToWin, silverConfig.semifinal.roundsToPlay, silverConfig.semifinal.matchesToWin)}
                    </li>
                    <li>
                      <strong>{m.admin_final()}:</strong>
                      {getGameModeDesc(silverConfig.final.gameMode, silverConfig.final.pointsToWin, silverConfig.final.roundsToPlay, silverConfig.final.matchesToWin)}
                    </li>
                  </ul>
                </div>
              {/if}
            </div>
          {:else}
            <!-- Single bracket details -->
            <ul class="phase-list">
              <li>
                <strong>{m.admin_earlyRounds()}:</strong>
                {getGameModeDesc(goldConfig.earlyRounds.gameMode, goldConfig.earlyRounds.pointsToWin, goldConfig.earlyRounds.roundsToPlay, goldConfig.earlyRounds.matchesToWin)}
              </li>
              <li>
                <strong>{m.admin_semifinals()}:</strong>
                {getGameModeDesc(goldConfig.semifinal.gameMode, goldConfig.semifinal.pointsToWin, goldConfig.semifinal.roundsToPlay, goldConfig.semifinal.matchesToWin)}
              </li>
              <li>
                <strong>{m.admin_final()}:</strong>
                {getGameModeDesc(goldConfig.final.gameMode, goldConfig.final.pointsToWin, goldConfig.final.roundsToPlay, goldConfig.final.matchesToWin)}
              </li>
            </ul>
          {/if}
        {/if}

      </section>

      <!-- Consolation explanation (if enabled) -->
      {#if tournament.finalStage?.consolationEnabled}
        <section class="rules-section">
          <h2>{m.rules_consolation()}</h2>
          <p>{m.rules_consolationExplanation()}</p>
        </section>
      {/if}

      <!-- Ranking section -->
      <section class="rules-section">
        <h2>{m.admin_rankingSystem()}</h2>
        {#if rankingInfo}
          <p>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html formatText(m.rules_rankingPoints({ tier: rankingInfo.name, maxPoints: rankingInfo.maxPoints }))}
          </p>
        {:else}
          <p>{m.rules_rankingNotEnabled()}</p>
        {/if}
      </section>

      <!-- Total duration and estimated end -->
      <section class="rules-section summary">
        <div class="summary-row">
          <span class="summary-label">{m.rules_totalDuration()}</span>
          <span class="summary-value">~{formatDuration(timeBreakdown.totalMinutes)}</span>
        </div>
        {#if estimatedEndTime}
          <div class="summary-row">
            <span class="summary-label">{m.rules_estimatedEnd()}</span>
            <span class="summary-value">~{estimatedEndTime}h</span>
          </div>
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .rules-modal {
    background: var(--bg-primary, #1a1a2e);
    border-radius: 16px;
    max-width: 680px;
    width: 100%;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .logo {
    display: flex;
    align-items: baseline;
  }

  .logo-text {
    font-family: 'Lexend', sans-serif;
    font-size: 1.1rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    letter-spacing: 0.01em;
  }

  .logo-suffix {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-left: 0.15rem;
    position: relative;
    top: -0.12rem;
  }

  .logo-arena {
    font-style: italic;
    font-weight: 700;
    font-size: 0.55rem;
    color: #e85a5a;
    transform: rotate(-8deg);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1;
  }

  .close-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: rgba(255, 255, 255, 0.9);
  }

  .tournament-title {
    padding: 1.25rem 1.5rem 1rem;
    text-align: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .tournament-title h1 {
    font-family: 'Lexend', sans-serif;
    font-size: 1.35rem;
    font-weight: 600;
    color: white;
    margin: 0;
    line-height: 1.3;
  }

  .edition {
    color: #fa709a;
    margin-right: 0.35rem;
  }

  .subtitle {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .separator {
    margin: 0 0.4rem;
    opacity: 0.5;
  }

  .rules-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.5rem;
  }

  .rules-section {
    margin-bottom: 1.25rem;
  }

  .rules-section:last-child {
    margin-bottom: 0;
  }

  .rules-section h2 {
    font-family: 'Lexend', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 0.5rem;
  }

  .phase-duration {
    font-weight: 500;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.45);
    text-transform: none;
    letter-spacing: normal;
    margin-left: 0.5rem;
  }

  .rules-section p {
    font-size: 0.95rem;
    line-height: 1.55;
    color: rgba(255, 255, 255, 0.85);
    margin: 0;
  }

  .rules-section strong {
    color: white;
    font-weight: 600;
  }

  .phase-list {
    margin: 0.75rem 0 0;
    padding-left: 1.25rem;
    list-style: none;
  }

  .phase-list li {
    position: relative;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 0.4rem;
    padding-left: 0.5rem;
  }

  .phase-list li::before {
    content: '›';
    position: absolute;
    left: -0.75rem;
    color: #fa709a;
    font-weight: bold;
  }

  .brackets-row {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  .bracket-details {
    flex: 1;
    padding: 0.75rem;
    background: rgba(255, 215, 0, 0.08);
    border-radius: 8px;
    border-left: 3px solid #ffd700;
  }

  .bracket-details.silver {
    background: rgba(192, 192, 192, 0.08);
    border-left-color: #c0c0c0;
  }

  .bracket-details h3 {
    font-family: 'Lexend', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin: 0 0 0.5rem;
  }

  .bracket-details .phase-list {
    margin: 0;
  }

  .summary {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 10px;
    padding: 1rem !important;
    margin-top: 1rem;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0;
  }

  .summary-row:first-child {
    padding-top: 0;
  }

  .summary-row:last-child {
    padding-bottom: 0;
  }

  .summary-label {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .summary-value {
    font-family: 'Lexend', sans-serif;
    font-size: 1rem;
    font-weight: 600;
    color: white;
  }

  /* Light theme support */
  .modal-backdrop[data-theme='light'] .rules-modal {
    background: #ffffff;
  }

  .modal-backdrop[data-theme='light'] .modal-header {
    border-bottom-color: rgba(0, 0, 0, 0.08);
  }

  .modal-backdrop[data-theme='light'] .logo-text {
    color: #1a1a2e;
  }

  .modal-backdrop[data-theme='light'] .close-btn {
    color: rgba(0, 0, 0, 0.4);
  }

  .modal-backdrop[data-theme='light'] .close-btn:hover {
    color: rgba(0, 0, 0, 0.8);
  }

  .modal-backdrop[data-theme='light'] .tournament-title {
    border-bottom-color: rgba(0, 0, 0, 0.06);
  }

  .modal-backdrop[data-theme='light'] .tournament-title h1 {
    color: #1a1a2e;
  }

  .modal-backdrop[data-theme='light'] .edition {
    color: #d63384;
  }

  .modal-backdrop[data-theme='light'] .subtitle {
    color: rgba(0, 0, 0, 0.55);
  }

  .modal-backdrop[data-theme='light'] .rules-section h2 {
    color: rgba(0, 0, 0, 0.5);
  }

  .modal-backdrop[data-theme='light'] .rules-section p {
    color: rgba(0, 0, 0, 0.8);
  }

  .modal-backdrop[data-theme='light'] .rules-section strong {
    color: #1a1a2e;
  }

  .modal-backdrop[data-theme='light'] .phase-list li {
    color: rgba(0, 0, 0, 0.75);
  }

  .modal-backdrop[data-theme='light'] .phase-duration {
    color: rgba(0, 0, 0, 0.4);
  }

  .modal-backdrop[data-theme='light'] .bracket-details {
    background: rgba(255, 215, 0, 0.12);
    border-left-color: #d4a800;
  }

  .modal-backdrop[data-theme='light'] .bracket-details.silver {
    background: rgba(128, 128, 128, 0.1);
    border-left-color: #808080;
  }

  .modal-backdrop[data-theme='light'] .bracket-details h3 {
    color: #1a1a2e;
  }

  .modal-backdrop[data-theme='light'] .bracket-details .phase-list li {
    color: rgba(0, 0, 0, 0.7);
  }

  .modal-backdrop[data-theme='light'] .summary {
    background: rgba(0, 0, 0, 0.03);
  }

  .modal-backdrop[data-theme='light'] .summary-label {
    color: rgba(0, 0, 0, 0.6);
  }

  .modal-backdrop[data-theme='light'] .summary-value {
    color: #1a1a2e;
  }

  /* Scrollbar styling */
  .rules-content::-webkit-scrollbar {
    width: 6px;
  }

  .rules-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .rules-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }

  .rules-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .modal-backdrop[data-theme='light'] .rules-content::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
  }

  .modal-backdrop[data-theme='light'] .rules-content::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.25);
  }

  /* Mobile adjustments */
  @media (max-width: 540px) {
    .brackets-row {
      flex-direction: column;
    }
  }

  @media (max-width: 480px) {
    .rules-modal {
      max-height: 90vh;
      border-radius: 12px;
    }

    .tournament-title h1 {
      font-size: 1.15rem;
    }

    .rules-content {
      padding: 0.875rem 1.25rem;
    }

    .rules-section p {
      font-size: 0.9rem;
    }
  }
</style>
