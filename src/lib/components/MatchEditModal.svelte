<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import { adminTheme } from '$lib/stores/theme';
  import type { MatchHistory, MatchGame } from '$lib/types/history';
  import { updateMatch } from '$lib/firebase/admin';
  import { Crown } from '@lucide/svelte';

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
  let gameType = $state<'singles' | 'doubles'>(match.gameType || 'singles');

  // Deep clone games to allow editing
  // svelte-ignore state_referenced_locally
  let editableGames = $state<MatchGame[]>(JSON.parse(JSON.stringify(match.games)));

  let selectedGameIndex = $state(0);
  let isSaving = $state(false);
  let errorMessage = $state('');

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
          <span class="meta-badge type">{match.gameMode === 'points' ? `${match.pointsToWin}p · Pg${match.matchesToWin}` : `${match.roundsToPlay}r`}</span>
          <select class="type-select" bind:value={gameType}>
            <option value="singles">{m.scoring_singles()}</option>
            <option value="doubles">{m.scoring_doubles()}</option>
          </select>
        </div>
      </div>
      <button class="close-btn" onclick={onClose} aria-label="Close">×</button>
    </header>

    <!-- Body -->
    <div class="modal-body">
      <!-- Players -->
      <div class="players-row">
        <div class="player-input">
          <span class="color-dot" style="background:{match.team1Color}"></span>
          <input type="text" bind:value={team1Name} placeholder="Jugador 1" />
        </div>
        <span class="vs">vs</span>
        <div class="player-input">
          <input type="text" bind:value={team2Name} placeholder="Jugador 2" />
          <span class="color-dot" style="background:{match.team2Color}"></span>
        </div>
      </div>

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
                <Crown size={10} class="crown-icon-svg" style="color: {game.winner === 1 ? match.team1Color : match.team2Color}" />
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Rounds table -->
      {#if editableGames[selectedGameIndex]}
        <div class="rounds-table">
          <div class="rounds-thead" class:has-20s={match.show20s}>
            <span class="col-round">#</span>
            <span class="col-player">
              <span class="color-dot small" style="background:{match.team1Color}"></span>
              {team1Name.substring(0, 10)}
            </span>
            <span class="col-player">
              <span class="color-dot small" style="background:{match.team2Color}"></span>
              {team2Name.substring(0, 10)}
            </span>
            {#if match.show20s}
              <span class="col-20s">20s</span>
              <span class="col-20s">20s</span>
            {/if}
          </div>

          <div class="rounds-tbody">
            {#each editableGames[selectedGameIndex].rounds as round, idx}
              <div class="round-row" class:has-20s={match.show20s}>
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

          <div class="rounds-tfoot" class:has-20s={match.show20s}>
            <span class="col-round">Σ</span>
            <span class="col-player total">
              {editableGames[selectedGameIndex].rounds.reduce((s, r) => s + r.team1Points, 0)}
            </span>
            <span class="col-player total">
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
    max-width: 520px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .modal {
    background: #1a2332;
    color: #e1e8ed;
  }

  /* Header */
  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .modal-header {
    border-color: #2d3748;
  }

  .header-content h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--primary);
  }

  .match-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.3rem;
  }

  .meta-badge {
    font-size: 0.65rem;
    padding: 0.1rem 0.35rem;
    background: #f3f4f6;
    border-radius: 4px;
    color: #666;
  }

  .meta-badge.type {
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
    font-weight: 600;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .meta-badge {
    background: #0f1419;
    color: #8b9bb3;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .meta-badge.type {
    background: color-mix(in srgb, var(--primary) 20%, transparent);
    color: var(--primary);
  }

  .type-select {
    font-size: 0.65rem;
    padding: 0.1rem 0.3rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    color: #555;
    cursor: pointer;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .type-select {
    background: #0f1419;
    border-color: #2d3748;
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

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .close-btn:hover {
    background: #2d3748;
    color: #e1e8ed;
  }

  /* Body */
  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Players row */
  .players-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .player-input {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .player-input input {
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    background: white;
    color: #333;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .player-input input {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .player-input input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .color-dot.small {
    width: 7px;
    height: 7px;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .color-dot {
    border-color: rgba(255, 255, 255, 0.15);
  }

  .vs {
    font-size: 0.75rem;
    color: #999;
    font-weight: 500;
    flex-shrink: 0;
  }

  /* Game selector */
  .game-selector {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .game-btn {
    padding: 0.3rem 0.6rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    color: #555;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    transition: all 0.15s;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .game-btn {
    background: #0f1419;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .game-btn:hover {
    border-color: var(--primary);
  }

  .game-btn.active {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  :global(.crown-icon-svg) {
    flex-shrink: 0;
  }

  /* Rounds table */
  .rounds-table {
    background: #f9fafb;
    border-radius: 6px;
    overflow: hidden;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .rounds-table {
    background: #0f1419;
  }

  .rounds-thead,
  .round-row,
  .rounds-tfoot {
    display: grid;
    grid-template-columns: 28px 1fr 1fr;
    gap: 0.4rem;
    padding: 0.4rem 0.6rem;
    align-items: center;
  }

  .rounds-thead.has-20s,
  .round-row.has-20s,
  .rounds-tfoot.has-20s {
    grid-template-columns: 28px 1fr 1fr 44px 44px;
  }

  .rounds-thead {
    background: white;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .rounds-thead {
    background: #1a2332;
    border-color: #2d3748;
  }

  .rounds-tfoot {
    background: white;
    border-top: 1px solid #e5e7eb;
    font-weight: 700;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .rounds-tfoot {
    background: #1a2332;
    border-color: #2d3748;
  }

  .col-round {
    text-align: center;
    color: #888;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .col-player {
    text-align: center;
    font-weight: 600;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
  }

  .col-player.total {
    font-size: 0.95rem;
  }

  .col-20s {
    text-align: center;
    font-size: 0.7rem;
    color: #888;
  }

  .col-20s.total {
    font-weight: 600;
    color: #666;
  }

  .pts-input,
  .twenty-input {
    width: 100%;
    padding: 0.3rem;
    border: 2px solid #ddd;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 700;
    text-align: center;
    background: white;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .pts-input,
  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .twenty-input {
    background: #1a2332;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  .pts-input:focus,
  .twenty-input:focus {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent);
  }

  .twenty-input {
    border-color: #ccc;
    font-weight: 500;
    font-size: 0.75rem;
  }

  /* Error */
  .error {
    padding: 0.5rem 0.75rem;
    background: #fef2f2;
    color: #dc2626;
    border-radius: 5px;
    font-size: 0.8rem;
    border-left: 3px solid #dc2626;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .error {
    background: #4d1f24;
    color: #fca5a5;
  }

  /* Footer */
  .modal-footer {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid #e5e7eb;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .modal-footer {
    border-color: #2d3748;
  }

  .btn-cancel,
  .btn-save {
    flex: 1;
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
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

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .btn-cancel {
    background: #374151;
    color: #e5e7eb;
  }

  .btn-save {
    background: var(--primary);
    color: white;
  }

  .btn-save:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent);
  }

  .btn-cancel:disabled,
  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: 480px) {
    .modal {
      max-height: 90vh;
      border-radius: 12px 12px 0 0;
      margin-top: auto;
    }

    .players-row {
      flex-direction: column;
      gap: 0.35rem;
    }

    .vs {
      display: none;
    }

    .rounds-thead,
    .round-row,
    .rounds-tfoot {
      grid-template-columns: 24px 1fr 1fr !important;
    }

    .col-20s {
      display: none;
    }
  }
</style>
