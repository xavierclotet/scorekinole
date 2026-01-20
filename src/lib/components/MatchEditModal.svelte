<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { t } from '$lib/stores/language';
  import { adminTheme } from '$lib/stores/adminTheme';
  import type { MatchHistory, MatchGame, MatchRound } from '$lib/types/history';
  import { updateMatch } from '$lib/firebase/admin';

  export let match: MatchHistory;
  export let onClose: () => void;

  const dispatch = createEventDispatcher();

  let team1Name = match.team1Name;
  let team2Name = match.team2Name;
  let eventTitle = match.eventTitle || '';
  let matchPhase = match.matchPhase || '';
  let gameType: 'singles' | 'doubles' = match.gameType || 'singles';

  // Deep clone games to allow editing
  let editableGames: MatchGame[] = JSON.parse(JSON.stringify(match.games));

  let selectedGameIndex = 0;
  let isSaving = false;
  let errorMessage = '';

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

      dispatch('matchUpdated', { matchId: match.id });
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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="modal-backdrop" on:click={onClose} data-theme={$adminTheme}>
  <div class="modal-content" on:click|stopPropagation>
    <div class="modal-header">
      <h2>✏️ {$t('editMatch')}</h2>
      <button class="close-button" on:click={onClose}>✕</button>
    </div>

    <div class="modal-body">
      <!-- Basic Information Section -->
      <div class="section">
        <h3>ℹ️ {$t('basicInformation')}</h3>

        <div class="info-grid">
          <div class="info-item">
            <span class="label">{$t('dateLabel')}</span>
            <span class="value">{formatDate(match.startTime)}</span>
          </div>
          <div class="info-item">
            <span class="label">{$t('modeLabel')}</span>
            <span class="value">{match.gameMode === 'points' ? $t('toNPoints').replace('{n}', String(match.pointsToWin)) : $t('nRoundsMode').replace('{n}', String(match.roundsToPlay))}</span>
          </div>
          <div class="info-item">
            <span class="label">{$t('typeLabel')}</span>
            <span class="value">{match.gameType === 'singles' ? $t('singles') : $t('doubles')}</span>
          </div>
        </div>
      </div>

      <!-- Team Names & Match Info -->
      <div class="section">
        <h3>👥 {$t('teamsAndEvent')}</h3>

        <div class="form-row">
          <div class="form-group">
            <label for="team1Name">{$t('team1')}</label>
            <input
              id="team1Name"
              type="text"
              bind:value={team1Name}
              placeholder={$t('team1Placeholder')}
            />
          </div>

          <div class="form-group">
            <label for="team2Name">{$t('team2')}</label>
            <input
              id="team2Name"
              type="text"
              bind:value={team2Name}
              placeholder={$t('team2Placeholder')}
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="gameType">{$t('matchType')}</label>
            <select id="gameType" bind:value={gameType}>
              <option value="singles">{$t('singles')}</option>
              <option value="doubles">{$t('doubles')}</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="eventTitle">{$t('eventTitleLabel')}</label>
            <input
              id="eventTitle"
              type="text"
              bind:value={eventTitle}
              placeholder={$t('eventTitleExample')}
            />
          </div>

          <div class="form-group">
            <label for="matchPhase">{$t('phaseLabel')}</label>
            <input
              id="matchPhase"
              type="text"
              bind:value={matchPhase}
              placeholder={$t('phaseExample')}
            />
          </div>
        </div>
      </div>

      <!-- Games/Rounds Section -->
      <div class="section">
        <h3>🎯 {$t('gamesAndRounds')}</h3>

        <!-- Game Tabs (if multiple games) -->
        {#if editableGames.length > 1}
          <div class="game-tabs">
            {#each editableGames as game, index}
              <button
                class="game-tab"
                class:active={selectedGameIndex === index}
                on:click={() => selectedGameIndex = index}
              >
                {$t('game')} {index + 1}
                {#if game.winner}
                  <span class="winner-indicator" style="color: {game.winner === 1 ? match.team1Color : match.team2Color}">
                    👑
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}

        <!-- Selected Game Rounds -->
        {#if editableGames[selectedGameIndex]}
          <div class="rounds-container">
            <div class="rounds-header">
              <span>{$t('round')}</span>
              <span style="color: {match.team1Color}">{team1Name}</span>
              <span style="color: {match.team2Color}">{team2Name}</span>
              {#if match.show20s}
                <span>20s {team1Name.substring(0, 8)}</span>
                <span>20s {team2Name.substring(0, 8)}</span>
              {/if}
            </div>

            {#each editableGames[selectedGameIndex].rounds as round, roundIndex}
              <div class="round-row">
                <span class="round-number">{roundIndex + 1}</span>

                <input
                  type="number"
                  min="0"
                  max="2"
                  class="score-input"
                  bind:value={round.team1Points}
                  style="border-color: {match.team1Color}"
                />

                <input
                  type="number"
                  min="0"
                  max="2"
                  class="score-input"
                  bind:value={round.team2Points}
                  style="border-color: {match.team2Color}"
                />

                {#if match.show20s}
                  <input
                    type="number"
                    min="0"
                    max="12"
                    class="twenty-input"
                    bind:value={round.team1Twenty}
                  />

                  <input
                    type="number"
                    min="0"
                    max="12"
                    class="twenty-input"
                    bind:value={round.team2Twenty}
                  />
                {/if}
              </div>
            {/each}

            <div class="game-totals">
              <span>{$t('total')}:</span>
              <span style="color: {match.team1Color}; font-weight: 700;">
                {editableGames[selectedGameIndex].rounds.reduce((sum, r) => sum + r.team1Points, 0)} pts
              </span>
              <span style="color: {match.team2Color}; font-weight: 700;">
                {editableGames[selectedGameIndex].rounds.reduce((sum, r) => sum + r.team2Points, 0)} pts
              </span>
            </div>
          </div>
        {/if}
      </div>

      {#if errorMessage}
        <div class="error-message">⚠️ {errorMessage}</div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="cancel-button" on:click={onClose} disabled={isSaving}>
        {$t('cancel')}
      </button>
      <button class="save-button" on:click={saveChanges} disabled={isSaving}>
        {isSaving ? $t('savingChanges') : '💾 ' + $t('saveChangesBtn')}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    backdrop-filter: blur(4px);
  }

  .modal-content {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    transition: all 0.3s;
  }

  .modal-backdrop[data-theme='dark'] .modal-content {
    background: #1a2332;
    color: #e1e8ed;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 2rem;
    border-bottom: 1px solid #e0e0e0;
    background: linear-gradient(to bottom, #f8f9fa, #ffffff);
    border-radius: 16px 16px 0 0;
  }

  .modal-backdrop[data-theme='dark'] .modal-header {
    background: linear-gradient(to bottom, #1f2937, #1a2332);
    border-bottom-color: #2d3748;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #1a1a1a;
    font-weight: 700;
  }

  .modal-backdrop[data-theme='dark'] .modal-header h2 {
    color: #e1e8ed;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #999;
    padding: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: #f0f0f0;
    color: #333;
    transform: rotate(90deg);
  }

  .modal-backdrop[data-theme='dark'] .close-button:hover {
    background: #2d3748;
    color: #e1e8ed;
  }

  .modal-body {
    padding: 2rem;
  }

  .section {
    margin-bottom: 2rem;
  }

  .section h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    color: #333;
    font-weight: 600;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #f0f0f0;
  }

  .modal-backdrop[data-theme='dark'] .section h3 {
    color: #e1e8ed;
    border-bottom-color: #2d3748;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
  }

  .modal-backdrop[data-theme='dark'] .info-grid {
    background: #0f1419;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-item .label {
    font-size: 0.75rem;
    color: #666;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .modal-backdrop[data-theme='dark'] .info-item .label {
    color: #8b9bb3;
  }

  .info-item .value {
    font-size: 0.95rem;
    color: #333;
    font-weight: 500;
  }

  .modal-backdrop[data-theme='dark'] .info-item .value {
    color: #e1e8ed;
  }

  .form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 600;
    color: #333;
    font-size: 0.9rem;
  }

  .modal-backdrop[data-theme='dark'] .form-group label {
    color: #e1e8ed;
  }

  .form-group input,
  .form-group select {
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 1rem;
    transition: all 0.2s;
    background: white;
    color: #333;
  }

  .modal-backdrop[data-theme='dark'] .form-group input,
  .modal-backdrop[data-theme='dark'] .form-group select {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .game-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .game-tab {
    padding: 0.5rem 1rem;
    background: #f0f0f0;
    border: 2px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    transition: all 0.2s;
    color: #666;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .modal-backdrop[data-theme='dark'] .game-tab {
    background: #0f1419;
    color: #8b9bb3;
  }

  .game-tab:hover {
    background: #e0e0e0;
  }

  .modal-backdrop[data-theme='dark'] .game-tab:hover {
    background: #2d3748;
  }

  .game-tab.active {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }

  .winner-indicator {
    font-size: 1rem;
  }

  .rounds-container {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
  }

  .modal-backdrop[data-theme='dark'] .rounds-container {
    background: #0f1419;
  }

  .rounds-header {
    display: grid;
    grid-template-columns: 60px repeat(2, 1fr) repeat(2, 1fr);
    gap: 0.5rem;
    padding: 0.75rem;
    background: white;
    border-radius: 8px;
    margin-bottom: 0.5rem;
    font-weight: 700;
    font-size: 0.85rem;
    text-align: center;
  }

  .modal-backdrop[data-theme='dark'] .rounds-header {
    background: #1a2332;
  }

  .round-row {
    display: grid;
    grid-template-columns: 60px repeat(2, 1fr) repeat(2, 1fr);
    gap: 0.5rem;
    padding: 0.5rem;
    align-items: center;
  }

  .round-number {
    text-align: center;
    font-weight: 600;
    color: #666;
  }

  .modal-backdrop[data-theme='dark'] .round-number {
    color: #8b9bb3;
  }

  .score-input,
  .twenty-input {
    padding: 0.5rem;
    border: 2px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
    text-align: center;
    font-weight: 600;
    background: white;
    transition: all 0.2s;
  }

  .modal-backdrop[data-theme='dark'] .score-input,
  .modal-backdrop[data-theme='dark'] .twenty-input {
    background: #1a2332;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  .score-input:focus,
  .twenty-input:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
  }

  .game-totals {
    display: grid;
    grid-template-columns: 60px repeat(2, 1fr);
    gap: 0.5rem;
    padding: 0.75rem;
    margin-top: 0.5rem;
    background: white;
    border-radius: 8px;
    font-size: 1rem;
    text-align: center;
  }

  .modal-backdrop[data-theme='dark'] .game-totals {
    background: #1a2332;
  }

  .error-message {
    padding: 1rem;
    background: #f8d7da;
    color: #721c24;
    border-radius: 8px;
    margin-top: 1rem;
    border-left: 4px solid #f5c6cb;
  }

  .modal-backdrop[data-theme='dark'] .error-message {
    background: #4a1f1f;
    color: #f8d7da;
    border-left-color: #f5c6cb;
  }

  .modal-footer {
    display: flex;
    gap: 1rem;
    padding: 1.5rem 2rem;
    border-top: 1px solid #e0e0e0;
    background: #fafafa;
    border-radius: 0 0 16px 16px;
  }

  .modal-backdrop[data-theme='dark'] .modal-footer {
    background: #0f1419;
    border-top-color: #2d3748;
  }

  .modal-footer button {
    flex: 1;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 600;
  }

  .modal-footer button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-button {
    background: #6c757d;
    color: white;
  }

  .cancel-button:hover:not(:disabled) {
    background: #5a6268;
    transform: translateY(-1px);
  }

  .save-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  .save-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .modal-content {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      margin-top: auto;
      max-height: 95vh;
    }

    .modal-body {
      padding: 1rem;
    }

    .modal-header,
    .modal-footer {
      padding: 1rem;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .rounds-header,
    .round-row {
      grid-template-columns: 50px repeat(2, 1fr);
      font-size: 0.8rem;
    }

    .rounds-header span:nth-child(n+4),
    .round-row input:nth-child(n+4) {
      display: none;
    }

    .game-totals {
      grid-template-columns: 50px repeat(2, 1fr);
    }
  }
</style>
