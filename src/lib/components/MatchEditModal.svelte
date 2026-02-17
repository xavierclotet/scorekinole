<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import { adminTheme } from '$lib/stores/theme';
  import type { MatchHistory, MatchGame } from '$lib/types/history';
  import { updateMatch } from '$lib/firebase/admin';
  import { X, Save, Calculator } from '@lucide/svelte';

  interface Props {
    match: MatchHistory;
    onClose: () => void;
    onmatchupdated?: (data: { matchId: string }) => void;
  }

  let { match, onClose, onmatchupdated }: Props = $props();

  // svelte-ignore state_referenced_locally
  let team1Name = $state(match.team1Name);
  // svelte-ignore state_referenced_locally
  let team2Name = $state(match.team2Name);
  // svelte-ignore state_referenced_locally
  let gameType = $state<'singles' | 'doubles'>(match.gameType || 'singles');

  // Deep clone games to allow editing
  // svelte-ignore state_referenced_locally
  let editableGames = $state<MatchGame[]>(JSON.parse(JSON.stringify(match.games || [])));

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

  function stopPropagation(e: Event) {
    e.stopPropagation();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function getSum(game: MatchGame, field: 'team1Points' | 'team2Points' | 'team1Twenty' | 'team2Twenty') {
    return (game.rounds || []).reduce((sum, r) => sum + (r[field] || 0), 0);
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
    <header class="modal-header">
      <div class="header-content">
        <h2>{m.admin_editMatch()}</h2>
        <div class="match-meta">
          <span class="meta-badge">{match.gameMode === 'points' ? `${match.pointsToWin}p` : `${match.roundsToPlay}r`}</span>
          <select class="type-select" bind:value={gameType}>
            <option value="singles">{m.scoring_singles()}</option>
            <option value="doubles">{m.scoring_doubles()}</option>
          </select>
        </div>
      </div>
      <button class="icon-btn close-btn" onclick={onClose} aria-label="Close">
        <X size={20} />
      </button>
    </header>

    <div class="modal-body">
      <!-- Teams Header -->
      <div class="teams-section">
        <div class="team-input-group">
          <span class="color-dot" style="background:{match.team1Color}"></span>
          <input type="text" bind:value={team1Name} class="team-input" placeholder="Team 1" />
        </div>
        <div class="team-input-group">
          <span class="color-dot" style="background:{match.team2Color}"></span>
          <input type="text" bind:value={team2Name} class="team-input" placeholder="Team 2" />
        </div>
      </div>

      <!-- Games List -->
      <div class="games-container">
        {#each editableGames as game, gIndex}
          <div class="game-card">
            {#if editableGames.length > 1}
              <div class="game-label">{m.history_game()} {gIndex + 1}</div>
            {/if}

            <div class="matrix-wrapper">
              <div class="matrix-table">
                <!-- Header Row: Rounds -->
                <div class="matrix-row header">
                  <div class="matrix-cell sticky-col name-col"></div>
                  {#each game.rounds as _, rIndex}
                    <div class="matrix-cell center">{rIndex + 1}</div>
                  {/each}
                  <div class="matrix-cell center total-col">Σ</div>
                </div>

                <!-- Team 1 Row -->
                <div class="matrix-row">
                  <div class="matrix-cell sticky-col name-col">
                    <span class="color-bar" style="background:{match.team1Color}"></span>
                    <span class="t-name">{team1Name || 'Team 1'}</span>
                  </div>
                  {#each game.rounds as round}
                    <div class="matrix-cell center">
                      <input 
                        type="number" 
                        min="0" 
                        max="2" 
                        bind:value={round.team1Points} 
                        class="score-input"
                        data-color={match.team1Color}
                      />
                    </div>
                  {/each}
                  <div class="matrix-cell center total-col font-mono">
                    {getSum(game, 'team1Points')}
                  </div>
                </div>

                <!-- Team 2 Row -->
                <div class="matrix-row">
                  <div class="matrix-cell sticky-col name-col">
                    <span class="color-bar" style="background:{match.team2Color}"></span>
                    <span class="t-name">{team2Name || 'Team 2'}</span>
                  </div>
                  {#each game.rounds as round}
                    <div class="matrix-cell center">
                      <input 
                        type="number" 
                        min="0" 
                        max="2" 
                        bind:value={round.team2Points} 
                        class="score-input" 
                        data-color={match.team2Color}
                      />
                    </div>
                  {/each}
                  <div class="matrix-cell center total-col font-mono">
                    {getSum(game, 'team2Points')}
                  </div>
                </div>

                <!-- 20s Section (if enabled) -->
                {#if match.show20s}
                  <div class="matrix-divider">
                    <div class="divider-line"></div>
                    <div class="divider-icon"><Calculator size={12} /></div>
                    <div class="divider-line"></div>
                  </div>

                  <!-- Team 1 20s -->
                  <div class="matrix-row twenties-row">
                    <div class="matrix-cell sticky-col name-col">
                      <span class="sub-label">20s</span>
                    </div>
                    {#each game.rounds as round}
                      <div class="matrix-cell center">
                        <input 
                          type="number" 
                          min="0" 
                          max="12" 
                          bind:value={round.team1Twenty} 
                          class="twenty-input" 
                        />
                      </div>
                    {/each}
                    <div class="matrix-cell center total-col text-muted">
                      {getSum(game, 'team1Twenty')}
                    </div>
                  </div>

                  <!-- Team 2 20s -->
                  <div class="matrix-row twenties-row">
                    <div class="matrix-cell sticky-col name-col">
                      <span class="sub-label">20s</span>
                    </div>
                    {#each game.rounds as round}
                      <div class="matrix-cell center">
                        <input 
                          type="number" 
                          min="0" 
                          max="12" 
                          bind:value={round.team2Twenty} 
                          class="twenty-input" 
                        />
                      </div>
                    {/each}
                    <div class="matrix-cell center total-col text-muted">
                      {getSum(game, 'team2Twenty')}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      {#if errorMessage}
        <div class="error-banner">
          {errorMessage}
        </div>
      {/if}
    </div>

    <footer class="modal-footer">
      <button class="btn-ghost" onclick={onClose} disabled={isSaving}>
        {m.common_cancel()}
      </button>
      <button class="btn-primary" onclick={saveChanges} disabled={isSaving}>
        {#if isSaving}
          {m.admin_savingChanges()}...
        {:else}
          <div class="btn-content">
            <Save size={16} />
            {m.admin_saveChangesBtn()}
          </div>
        {/if}
      </button>
    </footer>
  </div>
</div>

<style>
  /* Overlay */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 1rem;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  /* Modal Window */
  .modal {
    background: var(--card);
    color: var(--card-foreground);
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border);
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  /* Header */
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
    background: var(--card);
    border-radius: 16px 16px 0 0;
  }

  .header-content h2 {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    color: var(--primary);
  }

  .match-meta {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
    align-items: center;
  }

  .meta-badge {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: var(--secondary);
    border: 1px solid var(--border);
    border-radius: 99px;
    color: var(--secondary-foreground);
  }

  .type-select {
    background: transparent;
    border: none;
    font-size: 0.75rem;
    color: var(--primary);
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 8px;
    transition: all 0.2s;
    display: flex;
  }

  .icon-btn:hover {
    background: var(--secondary);
    color: var(--foreground);
  }

  /* Body */
  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* Teams Section */
  .teams-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding-bottom: 0.5rem;
  }

  .team-input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--secondary);
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .color-bar {
    width: 4px;
    height: 12px;
    border-radius: 2px;
    flex-shrink: 0;
    margin-right: 0.5rem;
  }

  .team-input {
    background: transparent;
    border: none;
    width: 100%;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--foreground);
  }

  .team-input:focus {
    outline: none;
  }

  /* Games Container */
  .games-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .game-card {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--card);
  }

  .game-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0.5rem 1rem;
    background: var(--secondary);
    border-bottom: 1px solid var(--border);
    color: var(--muted-foreground);
  }

  /* Matrix Table */
  .matrix-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .matrix-table {
    display: flex;
    flex-direction: column;
    min-width: 100%;
    width: fit-content;
  }

  .matrix-row {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
  }

  .matrix-row:last-child {
    border-bottom: none;
  }

  .matrix-cell {
    padding: 0.6rem 0.5rem;
    min-width: 50px;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .matrix-cell.center {
    justify-content: center;
    text-align: center;
  }

  /* Sticky First Column */
  .sticky-col {
    position: sticky;
    left: 0;
    background: var(--card);
    z-index: 10;
    width: 130px;
    min-width: 130px;
    justify-content: flex-start;
    padding-left: 1rem;
    border-right: 1px solid var(--border);
    box-shadow: 2px 0 5px rgba(0,0,0,0.02);
  }

  .header .matrix-cell {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted-foreground);
  }

  .t-name {
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
  }

  .score-input {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--input);
    color: var(--foreground);
    text-align: center;
    font-weight: 700;
    font-size: 1rem;
    transition: all 0.2s;
  }

  .score-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent);
    background: var(--card); /* Visually lift input on focus */
  }

  .total-col {
    background: var(--secondary);
    font-weight: 700;
    width: 50px;
    min-width: 50px;
    color: var(--foreground);
  }

  /* 20s */
  .matrix-divider {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    background: var(--secondary);
  }

  .divider-line {
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .divider-icon {
    color: var(--muted-foreground);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 50%;
    padding: 2px;
    display: flex;
  }

  .twenties-row .score-input,
  .twenties-row .twenty-input {
    height: 28px;
    width: 36px;
    font-size: 0.8rem;
    border-color: transparent;
    background: var(--card);
  }
  
  .twenties-row .twenty-input:focus {
      border-color: var(--primary);
  }

  .sub-label {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    font-style: italic;
    padding-left: 1.5rem;
  }

  /* Footer */
  .modal-footer {
    padding: 1.25rem 1.5rem;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    background: var(--secondary);
    border-radius: 0 0 16px 16px;
  }

  .btn-ghost {
    padding: 0.6rem 1rem;
    background: transparent;
    border: 1px solid transparent;
    color: var(--muted-foreground);
    font-weight: 500;
    cursor: pointer;
    border-radius: 8px;
  }
  
  .btn-ghost:hover {
      background: rgba(0,0,0,0.05);
      color: var(--foreground);
  }

  .btn-primary {
    padding: 0.6rem 1.25rem;
    background: var(--primary);
    color: var(--primary-foreground);
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary:hover {
    filter: brightness(110%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 30%, transparent);
  }

  .btn-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Error */
  .error-banner {
    padding: 0.75rem;
    background: var(--destructive);
    color: var(--destructive-foreground);
    border-radius: 8px;
    font-size: 0.875rem;
    text-align: center;
  }

  /* Mobile */
  @media (max-width: 640px) {
    .modal {
      border-radius: 16px 16px 0 0;
      max-height: 95vh;
      bottom: 0;
      margin-top: auto;
    }

    .teams-section {
      grid-template-columns: 1fr;
    }
  }
</style>
