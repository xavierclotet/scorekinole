<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import { adminTheme } from '$lib/stores/theme';
  import type { MatchHistory, MatchGame } from '$lib/types/history';
  import { updateMatch } from '$lib/firebase/admin';

  interface Props {
    match: MatchHistory;
    onClose: () => void;
    onmatchupdated?: (data: { matchId: string }) => void;
  }

  let { match, onClose, onmatchupdated }: Props = $props();

  // svelte-ignore state_referenced_locally - Intentional: initializing editable local state from props
  let team1Name = $state(match.team1Name);
  // svelte-ignore state_referenced_locally
  let team2Name = $state(match.team2Name);
  // svelte-ignore state_referenced_locally
  let eventTitle = $state(match.eventTitle || '');
  // svelte-ignore state_referenced_locally
  let matchPhase = $state(match.matchPhase || '');
  // svelte-ignore state_referenced_locally
  let gameType = $state<'singles' | 'doubles'>(match.gameType || 'singles');

  // Deep clone games to allow editing
  // svelte-ignore state_referenced_locally
  let editableGames = $state<MatchGame[]>(JSON.parse(JSON.stringify(match.games)));

  let selectedGameIndex = $state(0);
  let isSaving = $state(false);
  let errorMessage = $state('');
  let activeTab: 'info' | 'rounds' = $state('info');

  async function saveChanges() {
    if (!team1Name.trim() || !team2Name.trim()) {
      errorMessage = 'Team names cannot be empty';
      return;
    }

    isSaving = true;
    errorMessage = '';

    try {
      const updates: Partial<MatchHistory> = {
        team1Name,
        team2Name,
        eventTitle: eventTitle.trim() || undefined,
        matchPhase: matchPhase.trim() || undefined,
        gameType,
        games: editableGames
      };

      const success = await updateMatch(match.id, updates);
      if (!success) {
        throw new Error('Failed to update match');
      }

      onmatchupdated?.({ matchId: match.id });
      onClose();
    } catch (error) {
      console.error('Error saving match:', error);
      errorMessage = error instanceof Error ? error.message : 'Failed to save changes';
    } finally {
      isSaving = false;
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function stopPropagation(e: Event) {
    e.stopPropagation();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<div
  class="modal-overlay"
  onclick={onClose}
  onkeydown={handleKeydown}
  data-theme={$adminTheme}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
  <div class="modal" onclick={stopPropagation} role="document">
    <!-- Header -->
    <header class="modal-header">
      <div class="header-content">
        <h2>{m.admin_editMatch()}</h2>
        <div class="match-meta">
          <span class="meta-badge">{formatDate(match.startTime)}</span>
          <span class="meta-badge type">{match.gameType === 'doubles' ? m.scoring_doubles() : m.scoring_singles()}</span>
        </div>
      </div>
      <button class="close-btn" onclick={onClose} aria-label="Close">×</button>
    </header>

    <!-- Tabs -->
    <nav class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'info'}
        onclick={() => activeTab = 'info'}
      >
        {m.admin_basicInfo()}
      </button>
      <button
        class="tab"
        class:active={activeTab === 'rounds'}
        onclick={() => activeTab = 'rounds'}
      >
        {m.admin_gamesAndRounds()}
      </button>
    </nav>

    <!-- Body -->
    <div class="modal-body">
      {#if activeTab === 'info'}
        <!-- Info Tab -->
        <div class="form-section">
          <div class="players-row">
            <div class="player-input" style="--player-color: {match.team1Color}">
              <label>
                <span class="label-text">{m.admin_team1()}</span>
                <input type="text" bind:value={team1Name} placeholder="Jugador 1" />
              </label>
            </div>
            <span class="vs">vs</span>
            <div class="player-input" style="--player-color: {match.team2Color}">
              <label>
                <span class="label-text">{m.admin_team2()}</span>
                <input type="text" bind:value={team2Name} placeholder="Jugador 2" />
              </label>
            </div>
          </div>

          <div class="form-grid">
            <label class="form-field">
              <span class="label-text">{m.admin_eventTitleLabel()}</span>
              <input type="text" bind:value={eventTitle} placeholder={m.admin_eventTitleExample()} />
            </label>
            <label class="form-field">
              <span class="label-text">{m.admin_phaseLabel()}</span>
              <input type="text" bind:value={matchPhase} placeholder={m.admin_phaseExample()} />
            </label>
            <label class="form-field">
              <span class="label-text">{m.admin_matchType()}</span>
              <select bind:value={gameType}>
                <option value="singles">{m.scoring_singles()}</option>
                <option value="doubles">{m.scoring_doubles()}</option>
              </select>
            </label>
            <div class="form-field readonly">
              <span class="label-text">{m.admin_modeLabel()}</span>
              <span class="readonly-value">
                {match.gameMode === 'points' ? `${match.pointsToWin} pts` : `${match.roundsToPlay} rondas`}
              </span>
            </div>
          </div>
        </div>

      {:else}
        <!-- Rounds Tab -->
        <div class="rounds-section">
          <!-- Game selector if multiple games -->
          {#if editableGames.length > 1}
            <div class="game-selector">
              {#each editableGames as game, idx}
                <button
                  class="game-btn"
                  class:active={selectedGameIndex === idx}
                  onclick={() => selectedGameIndex = idx}
                >
                  {m.history_game()} {idx + 1}
                  {#if game.winner}
                    <span class="crown" style="color: {game.winner === 1 ? match.team1Color : match.team2Color}">👑</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}

          <!-- Rounds table -->
          {#if editableGames[selectedGameIndex]}
            <div class="rounds-table">
              <div class="rounds-thead">
                <span class="col-round">#</span>
                <span class="col-player" style="color: {match.team1Color}">{team1Name.substring(0, 12)}</span>
                <span class="col-player" style="color: {match.team2Color}">{team2Name.substring(0, 12)}</span>
                {#if match.show20s}
                  <span class="col-20s">20s</span>
                  <span class="col-20s">20s</span>
                {/if}
              </div>

              <div class="rounds-tbody">
                {#each editableGames[selectedGameIndex].rounds as round, idx}
                  <div class="round-row">
                    <span class="col-round">{idx + 1}</span>
                    <div class="col-player">
                      <input
                        type="number"
                        min="0"
                        max="2"
                        bind:value={round.team1Points}
                        class="pts-input"
                        style="border-color: {match.team1Color}"
                      />
                    </div>
                    <div class="col-player">
                      <input
                        type="number"
                        min="0"
                        max="2"
                        bind:value={round.team2Points}
                        class="pts-input"
                        style="border-color: {match.team2Color}"
                      />
                    </div>
                    {#if match.show20s}
                      <div class="col-20s">
                        <input type="number" min="0" max="12" bind:value={round.team1Twenty} class="twenty-input" />
                      </div>
                      <div class="col-20s">
                        <input type="number" min="0" max="12" bind:value={round.team2Twenty} class="twenty-input" />
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="rounds-tfoot">
                <span class="col-round">Σ</span>
                <span class="col-player total" style="color: {match.team1Color}">
                  {editableGames[selectedGameIndex].rounds.reduce((s, r) => s + r.team1Points, 0)}
                </span>
                <span class="col-player total" style="color: {match.team2Color}">
                  {editableGames[selectedGameIndex].rounds.reduce((s, r) => s + r.team2Points, 0)}
                </span>
                {#if match.show20s}
                  <span class="col-20s total">
                    {editableGames[selectedGameIndex].rounds.reduce((s, r) => s + (r.team1Twenty || 0), 0)}
                  </span>
                  <span class="col-20s total">
                    {editableGames[selectedGameIndex].rounds.reduce((s, r) => s + (r.team2Twenty || 0), 0)}
                  </span>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if errorMessage}
        <div class="error">{errorMessage}</div>
      {/if}
    </div>

    <!-- Footer -->
    <footer class="modal-footer">
      <button class="btn-cancel" onclick={onClose} disabled={isSaving}>
        {m.common_cancel()}
      </button>
      <button class="btn-save" onclick={saveChanges} disabled={isSaving}>
        {isSaving ? m.admin_savingChanges() : m.admin_saveChangesBtn()}
      </button>
    </footer>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 580px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .modal-overlay[data-theme='dark'] .modal {
    background: #1a2332;
    color: #e1e8ed;
  }

  /* Header */
  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-overlay[data-theme='dark'] .modal-header {
    border-color: #2d3748;
  }

  .header-content h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #1a1a1a;
  }

  .modal-overlay[data-theme='dark'] .header-content h2 {
    color: #e1e8ed;
  }

  .match-meta {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }

  .meta-badge {
    font-size: 0.7rem;
    padding: 0.15rem 0.4rem;
    background: #f3f4f6;
    border-radius: 4px;
    color: #666;
  }

  .meta-badge.type {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .modal-overlay[data-theme='dark'] .meta-badge {
    background: #0f1419;
    color: #8b9bb3;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    font-size: 1.4rem;
    color: #999;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .close-btn:hover {
    background: #f3f4f6;
    color: #333;
  }

  .modal-overlay[data-theme='dark'] .close-btn:hover {
    background: #2d3748;
    color: #e1e8ed;
  }

  /* Tabs */
  .tabs {
    display: flex;
    border-bottom: 1px solid #e5e7eb;
    padding: 0 1.25rem;
  }

  .modal-overlay[data-theme='dark'] .tabs {
    border-color: #2d3748;
  }

  .tab {
    padding: 0.6rem 1rem;
    background: none;
    border: none;
    font-size: 0.85rem;
    font-weight: 500;
    color: #666;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: all 0.15s;
  }

  .tab:hover {
    color: #333;
  }

  .modal-overlay[data-theme='dark'] .tab {
    color: #8b9bb3;
  }

  .modal-overlay[data-theme='dark'] .tab:hover {
    color: #e1e8ed;
  }

  .tab.active {
    color: #667eea;
    border-bottom-color: #667eea;
    font-weight: 600;
  }

  /* Body */
  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
  }

  /* Info Tab */
  .form-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .players-row {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
  }

  .player-input {
    flex: 1;
  }

  .player-input label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .modal-overlay[data-theme='dark'] .player-input label {
    color: #8b9bb3;
  }

  .player-input input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 2px solid var(--player-color, #ddd);
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    background: white;
    color: var(--player-color, #333);
  }

  .modal-overlay[data-theme='dark'] .player-input input {
    background: #0f1419;
  }

  .player-input input:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
  }

  .vs {
    font-size: 0.8rem;
    color: #999;
    font-weight: 500;
    padding-bottom: 0.6rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .form-field input,
  .form-field select {
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: 1px solid #ddd;
    border-radius: 5px;
    font-size: 0.85rem;
    background: white;
    color: #333;
  }

  .modal-overlay[data-theme='dark'] .form-field input,
  .modal-overlay[data-theme='dark'] .form-field select {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .form-field input:focus,
  .form-field select:focus {
    outline: none;
    border-color: #667eea;
  }

  .form-field.readonly .readonly-value {
    display: block;
    padding: 0.45rem 0.6rem;
    background: #f9fafb;
    border-radius: 5px;
    font-size: 0.85rem;
    color: #666;
  }

  .modal-overlay[data-theme='dark'] .form-field.readonly .readonly-value {
    background: #0f1419;
    color: #8b9bb3;
  }

  /* Rounds Tab */
  .rounds-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .game-selector {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .game-btn {
    padding: 0.35rem 0.65rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
    color: #555;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    transition: all 0.15s;
  }

  .modal-overlay[data-theme='dark'] .game-btn {
    background: #0f1419;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .game-btn:hover {
    border-color: #667eea;
  }

  .game-btn.active {
    background: #667eea;
    border-color: #667eea;
    color: white;
  }

  .crown {
    font-size: 0.75rem;
  }

  /* Rounds table */
  .rounds-table {
    background: #f9fafb;
    border-radius: 6px;
    overflow: hidden;
  }

  .modal-overlay[data-theme='dark'] .rounds-table {
    background: #0f1419;
  }

  .rounds-thead,
  .round-row,
  .rounds-tfoot {
    display: grid;
    grid-template-columns: 32px 1fr 1fr;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    align-items: center;
  }

  .rounds-table:has(.col-20s) .rounds-thead,
  .rounds-table:has(.col-20s) .round-row,
  .rounds-table:has(.col-20s) .rounds-tfoot {
    grid-template-columns: 32px 1fr 1fr 50px 50px;
  }

  .rounds-thead {
    background: white;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-overlay[data-theme='dark'] .rounds-thead {
    background: #1a2332;
    border-color: #2d3748;
  }

  .rounds-tfoot {
    background: white;
    border-top: 1px solid #e5e7eb;
    font-weight: 700;
  }

  .modal-overlay[data-theme='dark'] .rounds-tfoot {
    background: #1a2332;
    border-color: #2d3748;
  }

  .col-round {
    text-align: center;
    color: #888;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .col-player {
    text-align: center;
    font-weight: 600;
    font-size: 0.8rem;
  }

  .col-player.total {
    font-size: 1rem;
  }

  .col-20s {
    text-align: center;
    font-size: 0.75rem;
    color: #888;
  }

  .col-20s.total {
    font-weight: 600;
    color: #666;
  }

  .pts-input,
  .twenty-input {
    width: 100%;
    padding: 0.35rem;
    border: 2px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 700;
    text-align: center;
    background: white;
  }

  .modal-overlay[data-theme='dark'] .pts-input,
  .modal-overlay[data-theme='dark'] .twenty-input {
    background: #1a2332;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  .pts-input:focus,
  .twenty-input:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
  }

  .twenty-input {
    border-color: #ccc;
    font-weight: 500;
    font-size: 0.8rem;
  }

  /* Error */
  .error {
    margin-top: 0.75rem;
    padding: 0.6rem 0.75rem;
    background: #fef2f2;
    color: #dc2626;
    border-radius: 5px;
    font-size: 0.85rem;
    border-left: 3px solid #dc2626;
  }

  .modal-overlay[data-theme='dark'] .error {
    background: #4d1f24;
    color: #fca5a5;
  }

  /* Footer */
  .modal-footer {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-top: 1px solid #e5e7eb;
  }

  .modal-overlay[data-theme='dark'] .modal-footer {
    border-color: #2d3748;
  }

  .btn-cancel,
  .btn-save {
    flex: 1;
    padding: 0.55rem 1rem;
    font-size: 0.9rem;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-cancel {
    background: #e5e7eb;
    color: #374151;
  }

  .btn-cancel:hover:not(:disabled) {
    background: #d1d5db;
  }

  .modal-overlay[data-theme='dark'] .btn-cancel {
    background: #374151;
    color: #e5e7eb;
  }

  .btn-save {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .btn-save:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  .btn-cancel:disabled,
  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: 600px) {
    .modal {
      max-height: 90vh;
      border-radius: 12px 12px 0 0;
      margin-top: auto;
    }

    .players-row {
      flex-direction: column;
      gap: 0.5rem;
    }

    .vs {
      display: none;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .rounds-thead,
    .round-row,
    .rounds-tfoot {
      grid-template-columns: 28px 1fr 1fr !important;
    }

    .col-20s {
      display: none;
    }
  }
</style>
