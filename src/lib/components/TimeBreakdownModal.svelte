<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import { adminTheme } from '$lib/stores/theme';
  import type { TimeBreakdown } from '$lib/utils/tournamentTime';
  import { formatDuration } from '$lib/utils/tournamentTime';

  interface Props {
    visible?: boolean;
    breakdown?: TimeBreakdown | null;
    showRecalculate?: boolean;
    onrecalculate?: () => void;
  }

  let { visible = $bindable(false), breakdown = null, showRecalculate = false, onrecalculate }: Props = $props();

  function close() {
    visible = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleRecalculate() {
    onrecalculate?.();
  }

  function stopPropagation(e: Event) {
    e.stopPropagation();
  }
</script>

{#if visible && breakdown}
  <div
    class="backdrop"
    data-theme={$adminTheme}
    onclick={close}
    onkeydown={handleKeydown}
    role="button"
    tabindex="0"
  >
    <div class="modal" onclick={stopPropagation} role="dialog" aria-modal="true">
      <!-- Header -->
      <header class="modal-header">
        <div class="header-top">
          <div class="header-title">
            <div class="header-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h2>{m.time_timeBreakdown()}</h2>
          </div>
          <div class="header-actions">
            {#if showRecalculate}
              <button class="recalculate-btn" onclick={handleRecalculate} title={m.time_recalculate()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                </svg>
              </button>
            {/if}
            <button class="close-btn" onclick={close}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div class="modal-body">
        <!-- Tournament Info Bar -->
        <div class="info-bar">
          <div class="info-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>{breakdown.numParticipants}</span>
          </div>
          <div class="info-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span>{breakdown.numTables} {m.time_tables()}</span>
          </div>
          <div class="info-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <span>{breakdown.gameType === 'singles' ? m.scoring_singles() : m.scoring_doubles()}</span>
          </div>
        </div>

        <!-- Main Content Grid -->
        <div class="content-grid">
          <!-- Group Stage -->
          {#if breakdown.groupStage}
            <div class="phase-card">
              <div class="phase-header group">
                <div class="phase-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <span>{m.time_groupStage()}</span>
                <span class="phase-time">{formatDuration(breakdown.groupStage.totalMinutes)}</span>
              </div>
              <div class="phase-body">
                <div class="stat-row">
                  <span class="stat-label">{m.time_system()}</span>
                  <span class="stat-value badge">{breakdown.groupStage.type === 'ROUND_ROBIN' ? 'Round Robin' : 'Swiss'}</span>
                </div>
                {#if breakdown.groupStage.numGroups}
                  <div class="stat-row">
                    <span class="stat-label">{m.time_groups()}</span>
                    <span class="stat-value">{breakdown.groupStage.numGroups}</span>
                  </div>
                {/if}
                {#if breakdown.groupStage.numSwissRounds}
                  <div class="stat-row">
                    <span class="stat-label">{m.time_rounds()}</span>
                    <span class="stat-value">{breakdown.groupStage.numSwissRounds}</span>
                  </div>
                {/if}
                <div class="stat-row">
                  <span class="stat-label">{m.time_totalMatches()}</span>
                  <span class="stat-value">{breakdown.groupStage.totalMatches}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">{m.time_matchRounds()}</span>
                  <span class="stat-value">{breakdown.groupStage.matchRounds}</span>
                </div>

                <!-- Calculation Box -->
                <div class="calc-box">
                  <div class="calc-box-header">{m.time_matchTimeCalc()}</div>
                  <div class="calc-box-content">
                    <div class="calc-item">
                      <span>{m.time_mode()}</span>
                      <span>
                        {#if breakdown.groupStage.gameMode === 'points'}
                          {m.time_pointsMode()} ({breakdown.groupStage.pointsToWin || 7} pts)
                        {:else}
                          {m.time_roundsMode()} ({breakdown.groupStage.roundsToPlay || 4})
                        {/if}
                      </span>
                    </div>
                    <div class="calc-item">
                      <span>Best of</span>
                      <span>{breakdown.groupStage.matchesToWin}</span>
                    </div>
                    <div class="calc-formula small">
                      <span class="formula-parts">{breakdown.groupStage.minutesPerGame} min × {breakdown.groupStage.avgGamesPlayed} {m.time_games()}</span>
                      <span class="formula-result">= {breakdown.groupStage.minutesPerMatch} min/{m.time_match()}</span>
                    </div>
                    <div class="calc-item">
                      <span>{m.time_timePerRound()}</span>
                      <span>{breakdown.groupStage.minutesPerMatch} + {breakdown.groupStage.breakPerMatch} = <strong>{breakdown.groupStage.minutesPerMatch + breakdown.groupStage.breakPerMatch} min</strong></span>
                    </div>
                  </div>
                </div>

                <!-- Total Calculation -->
                <div class="total-calc">
                  <div class="total-calc-header">{m.time_totalCalc()}</div>
                  <div class="total-calc-formula">
                    <span class="tcf-rounds">{breakdown.groupStage.matchRounds} {m.time_matchRounds().toLowerCase()}</span>
                    <span class="tcf-operator">×</span>
                    <span class="tcf-time">{breakdown.groupStage.minutesPerMatch + breakdown.groupStage.breakPerMatch} min</span>
                    <span class="tcf-operator">=</span>
                    <span class="tcf-result">{formatDuration(breakdown.groupStage.totalMinutes)}</span>
                  </div>
                </div>
              </div>
            </div>
          {/if}

          <!-- Final Stage -->
          {#if breakdown.finalStage}
            <div class="phase-card">
              <div class="phase-header final">
                <div class="phase-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                    <path d="M4 22h16"/>
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                  </svg>
                </div>
                <span>{breakdown.phaseType === 'TWO_PHASE' ? m.time_finalStage() : m.time_bracket()}</span>
                <span class="phase-time">{formatDuration(breakdown.finalStage.totalMinutes)}</span>
              </div>
              <div class="phase-body">
                {#if breakdown.phaseType === 'TWO_PHASE'}
                  <div class="stat-row">
                    <span class="stat-label">{m.time_qualified()}</span>
                    <span class="stat-value">{breakdown.finalStage.qualifiedCount} {m.time_players().toLowerCase()}</span>
                  </div>
                {/if}

                <!-- Breakdown by bracket rounds -->
                <div class="phase-breakdown">
                  <div class="breakdown-header four-cols">
                    <span>{m.time_round()}</span>
                    <span>{m.time_config()}</span>
                    <span>{m.time_matches()}</span>
                    <span>{m.time_time()}</span>
                  </div>
                  {#each breakdown.finalStage.bracketRounds || [] as round}
                    <div class="breakdown-item four-cols">
                      <span class="breakdown-label">
                        {round.name}
                        {#if round.parallel === true}
                          <span class="breakdown-note">({m.time_parallel()})</span>
                        {:else if round.parallel === false}
                          <span class="breakdown-note">({m.time_sequential()})</span>
                        {/if}
                      </span>
                      <span class="breakdown-config">{round.config || '-'}</span>
                      <span class="breakdown-matches">{round.matches}</span>
                      <span class="breakdown-time">{formatDuration(round.minutes)}</span>
                    </div>
                  {/each}
                  <div class="breakdown-total four-cols">
                    <span>{m.time_total()}</span>
                    <span></span>
                    <span>{(breakdown.finalStage.bracketRounds || []).reduce((sum, r) => sum + r.matches, 0)}</span>
                    <span>{formatDuration(breakdown.finalStage.totalMinutes)}</span>
                  </div>
                </div>

                <!-- Calculation Box -->
                <div class="calc-box">
                  <div class="calc-box-header">{m.time_matchTimeCalc()}</div>
                  <div class="calc-box-content">
                    <div class="calc-item">
                      <span>{m.time_mode()}</span>
                      <span>
                        {#if breakdown.finalStage.gameMode === 'points'}
                          {m.time_pointsMode()} ({breakdown.finalStage.pointsToWin || 7} pts)
                        {:else}
                          {m.time_roundsMode()} ({breakdown.finalStage.roundsToPlay || 4})
                        {/if}
                      </span>
                    </div>
                    <div class="calc-item">
                      <span>Best of</span>
                      <span>{breakdown.finalStage.matchesToWin}</span>
                    </div>
                    <div class="calc-formula small">
                      <span class="formula-parts">{breakdown.finalStage.minutesPerGame} min × {breakdown.finalStage.avgGamesPlayed} {m.time_games()}</span>
                      <span class="formula-result">= {breakdown.finalStage.minutesPerMatch} min/{m.time_match()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Transition -->
        {#if breakdown.transitionMinutes > 0}
          <div class="transition-bar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="6" y="4" width="4" height="16"/>
              <rect x="14" y="4" width="4" height="16"/>
            </svg>
            <span>{m.time_breakBetweenPhases()}</span>
            <span class="transition-time">{formatDuration(breakdown.transitionMinutes)}</span>
          </div>
        {/if}

        <!-- Total -->
        <div class="total-section">
          <div class="total-label">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>{m.time_totalEstimatedTime()}</span>
          </div>
          <span class="total-value">{formatDuration(breakdown.totalMinutes)}</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    backdrop-filter: blur(4px);
  }

  .modal {
    background: white;
    border-radius: 16px;
    max-width: 850px;
    width: 100%;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .backdrop[data-theme='dark'] .modal {
    background: #1e293b;
  }

  /* Header */
  .modal-header {
    display: flex;
    flex-direction: column;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e2e8f0;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  }

  .backdrop[data-theme='dark'] .modal-header {
    border-bottom-color: #334155;
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border-radius: 10px;
    color: white;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: #1e293b;
  }

  .backdrop[data-theme='dark'] .modal-header h2 {
    color: #f1f5f9;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .recalculate-btn,
  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;
  }

  .recalculate-btn:hover {
    background: #dbeafe;
    color: #2563eb;
  }

  .backdrop[data-theme='dark'] .recalculate-btn:hover {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .close-btn:hover {
    background: #e2e8f0;
    color: #1e293b;
  }

  .backdrop[data-theme='dark'] .close-btn:hover {
    background: #334155;
    color: #f1f5f9;
  }

  /* Body */
  .modal-body {
    padding: 1.25rem 1.5rem;
    overflow-y: auto;
  }

  /* Info Bar */
  .info-bar {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }

  .info-chip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    background: #f1f5f9;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 500;
    color: #475569;
  }

  .backdrop[data-theme='dark'] .info-chip {
    background: #334155;
    color: #cbd5e1;
  }

  .info-chip svg {
    color: #64748b;
  }

  .backdrop[data-theme='dark'] .info-chip svg {
    color: #94a3b8;
  }

  /* Content Grid */
  .content-grid {
    display: grid;
    grid-template-columns: 2fr 3fr;  /* 40% groups, 60% final stage */
    gap: 1rem;
  }

  @media (max-width: 700px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Phase Card */
  .phase-card {
    background: #f8fafc;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }

  .backdrop[data-theme='dark'] .phase-card {
    background: #0f172a;
    border-color: #334155;
  }

  .phase-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .phase-header.group {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .phase-header.final {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  .phase-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.9;
  }

  .phase-time {
    margin-left: auto;
    font-size: 0.85rem;
    font-weight: 700;
  }

  .phase-body {
    padding: 1rem;
  }

  /* Stat Row */
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0;
    font-size: 0.8rem;
  }

  .stat-label {
    color: #64748b;
  }

  .backdrop[data-theme='dark'] .stat-label {
    color: #94a3b8;
  }

  .stat-value {
    font-weight: 600;
    color: #1e293b;
  }

  .backdrop[data-theme='dark'] .stat-value {
    color: #f1f5f9;
  }

  .stat-value.badge {
    padding: 0.15rem 0.5rem;
    background: #e0f2fe;
    color: #0369a1;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .backdrop[data-theme='dark'] .stat-value.badge {
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
  }

  /* Phase Breakdown */
  .phase-breakdown {
    margin: 0.75rem 0;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }

  .backdrop[data-theme='dark'] .phase-breakdown {
    border-color: #334155;
  }

  .breakdown-header {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #64748b;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
  }

  .breakdown-header.four-cols {
    grid-template-columns: 1fr 45px 50px 55px;
  }

  .backdrop[data-theme='dark'] .breakdown-header {
    color: #94a3b8;
    background: #0f172a;
    border-bottom-color: #334155;
  }

  .breakdown-header span:nth-child(2),
  .breakdown-header span:nth-child(3) {
    text-align: center;
  }

  .breakdown-header span:nth-child(4) {
    text-align: right;
  }

  .breakdown-item {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    border-bottom: 1px solid #e2e8f0;
    background: white;
  }

  .breakdown-item.four-cols {
    grid-template-columns: 1fr 45px 50px 55px;
  }

  .backdrop[data-theme='dark'] .breakdown-item {
    border-bottom-color: #334155;
    background: #1e293b;
  }

  .breakdown-total {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 700;
    background: #fef3c7;
    color: #92400e;
  }

  .breakdown-total.four-cols {
    grid-template-columns: 1fr 45px 50px 55px;
  }

  .backdrop[data-theme='dark'] .breakdown-total {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }

  .breakdown-total span:nth-child(2),
  .breakdown-total span:nth-child(3) {
    text-align: center;
  }

  .breakdown-total span:nth-child(4) {
    text-align: right;
  }

  .breakdown-label {
    color: #475569;
  }

  .backdrop[data-theme='dark'] .breakdown-label {
    color: #94a3b8;
  }

  .breakdown-note {
    font-size: 0.65rem;
    color: #94a3b8;
  }

  .breakdown-config {
    font-weight: 600;
    color: #3b82f6;
    text-align: center;
    min-width: 28px;
    font-size: 0.7rem;
  }

  .backdrop[data-theme='dark'] .breakdown-config {
    color: #60a5fa;
  }

  .breakdown-matches {
    font-weight: 600;
    color: #64748b;
    text-align: center;
    min-width: 20px;
  }

  .backdrop[data-theme='dark'] .breakdown-matches {
    color: #94a3b8;
  }

  .breakdown-time {
    font-weight: 600;
    color: #1e293b;
    text-align: right;
  }

  .backdrop[data-theme='dark'] .breakdown-time {
    color: #f1f5f9;
  }

  /* Calc Box */
  .calc-box {
    margin-top: 0.75rem;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    background: white;
  }

  .backdrop[data-theme='dark'] .calc-box {
    border-color: #334155;
    background: #1e293b;
  }

  .calc-box-header {
    padding: 0.5rem 0.75rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #3b82f6;
    background: #eff6ff;
    border-bottom: 1px solid #e2e8f0;
  }

  .backdrop[data-theme='dark'] .calc-box-header {
    background: rgba(59, 130, 246, 0.1);
    border-bottom-color: #334155;
  }

  .calc-box-content {
    padding: 0.5rem 0.75rem;
  }

  .calc-item {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    font-size: 0.7rem;
    color: #64748b;
  }

  .backdrop[data-theme='dark'] .calc-item {
    color: #94a3b8;
  }

  .calc-item span:last-child {
    font-weight: 500;
    color: #475569;
  }

  .backdrop[data-theme='dark'] .calc-item span:last-child {
    color: #cbd5e1;
  }

  .calc-formula {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    margin: 0.35rem 0;
    background: #f1f5f9;
    border-radius: 6px;
    font-size: 0.7rem;
  }

  .backdrop[data-theme='dark'] .calc-formula {
    background: #0f172a;
  }

  .formula-parts {
    color: #64748b;
  }

  .backdrop[data-theme='dark'] .formula-parts {
    color: #94a3b8;
  }

  .formula-result {
    font-weight: 700;
    color: #3b82f6;
  }

  .calc-formula.small {
    font-size: 0.65rem;
    padding: 0.4rem;
  }

  /* Total Calculation */
  .total-calc {
    margin-top: 0.75rem;
    border-radius: 8px;
    overflow: hidden;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  }

  .total-calc-header {
    padding: 0.4rem 0.75rem;
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.9);
    background: rgba(0, 0, 0, 0.1);
  }

  .total-calc-formula {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    font-size: 0.8rem;
    color: white;
  }

  .tcf-rounds, .tcf-time {
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    font-weight: 500;
  }

  .tcf-operator {
    font-weight: 700;
    opacity: 0.8;
  }

  .tcf-result {
    font-weight: 700;
    font-size: 0.95rem;
    padding: 0.25rem 0.6rem;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 6px;
  }

  /* Transition Bar */
  .transition-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    margin: 1rem 0;
    background: #fef3c7;
    border-radius: 8px;
    font-size: 0.8rem;
    color: #92400e;
  }

  .backdrop[data-theme='dark'] .transition-bar {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }

  .transition-time {
    margin-left: auto;
    font-weight: 700;
  }

  /* Total Section */
  .total-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    margin-top: 1rem;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border-radius: 12px;
    color: white;
  }

  .total-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    opacity: 0.95;
  }

  .total-value {
    font-size: 1.5rem;
    font-weight: 700;
  }

  /* Responsive */
  @media (max-width: 500px) {
    .modal {
      max-width: 100%;
      margin: 0.5rem;
      max-height: 95vh;
    }

    .modal-header {
      padding: 1rem;
    }

    .modal-body {
      padding: 1rem;
    }

    .info-bar {
      gap: 0.5rem;
    }

    .info-chip {
      padding: 0.3rem 0.6rem;
      font-size: 0.75rem;
    }

    .total-section {
      padding: 0.75rem 1rem;
    }

    .total-value {
      font-size: 1.25rem;
    }
  }
</style>
