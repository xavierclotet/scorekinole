<script lang="ts">
  import type { GroupMatch, TournamentParticipant, Tournament } from '$lib/types/tournament';
  import * as m from '$lib/paraglide/messages.js';
  import { adminTheme } from '$lib/stores/theme';
  import { getPhaseConfig } from '$lib/utils/bracketPhaseConfig';

  interface Props {
    match: GroupMatch;
    participants: TournamentParticipant[];
    tournament: Tournament;
    visible?: boolean;
    isBracket?: boolean;  // Whether this is a bracket match (uses final stage config)
    // Bracket phase info (for per-phase configuration)
    bracketRoundNumber?: number;
    bracketTotalRounds?: number;
    bracketIsThirdPlace?: boolean;
    bracketIsSilver?: boolean;
    isAdmin?: boolean;  // Allow editing completed matches when true
    onclose?: () => void;
    onsave?: (data: {
      gamesWonA: number;
      gamesWonB: number;
      totalPointsA?: number;
      totalPointsB?: number;
      total20sA?: number;
      total20sB?: number;
      rounds?: Array<{
        gameNumber: number;
        roundInGame: number;
        pointsA: number | null;
        pointsB: number | null;
        twentiesA: number;
        twentiesB: number;
      }>;
    }) => void;
    onnoshow?: (participantId: string) => void;
  }

  let {
    match,
    participants,
    tournament,
    visible = false,
    isBracket = false,
    bracketRoundNumber = 1,
    bracketTotalRounds = 1,
    bracketIsThirdPlace = false,
    bracketIsSilver = false,
    isAdmin = false,
    onclose,
    onsave,
    onnoshow
  }: Props = $props();

  // Participant info
  let participantMap = $derived(new Map(participants.map(p => [p.id, p])));
  let participantA = $derived(participantMap.get(match.participantA));
  let participantB = $derived(participantMap.get(match.participantB));
  let isBye = $derived(match.participantB === 'BYE');

  // Game mode - use phase-specific config if in bracket, otherwise use group stage config
  let gameConfig = $derived(isBracket && tournament.finalStage
    ? getPhaseConfig(
        tournament.finalStage,
        bracketRoundNumber,
        bracketTotalRounds,
        bracketIsThirdPlace,
        bracketIsSilver
      )
    : tournament.groupStage
    ? {
        gameMode: tournament.groupStage.gameMode,
        pointsToWin: tournament.groupStage.pointsToWin || 7,
        roundsToPlay: tournament.groupStage.roundsToPlay || 4,
        matchesToWin: tournament.groupStage.matchesToWin || 1
      }
    : {
        // Legacy fallback
        gameMode: 'rounds' as const,
        pointsToWin: 7,
        roundsToPlay: 4,
        matchesToWin: 1
      });

  let isRoundsMode = $derived(gameConfig.gameMode === 'rounds');

  // Can edit: pending matches OR admin editing completed matches
  let isMatchCompleted = $derived(match.status === 'COMPLETED' || match.status === 'WALKOVER');
  let canEdit = $derived(!isMatchCompleted || isAdmin);

  let baseNumRounds = $derived(isRoundsMode ? (gameConfig.roundsToPlay || 4) : gameConfig.matchesToWin);
  // Track extra rounds added for tiebreaker
  let extraRoundsCount = $state(0);
  let numRounds = $derived(baseNumRounds + extraRoundsCount);

  // Round-by-round data
  interface RoundData {
    gameNumber: number;        // Which game this round belongs to (for points mode brackets)
    roundInGame: number;       // Round number within current game (1, 2, 3...)
    pointsA: number | null;
    pointsB: number | null;
    twentiesA: number;
    twentiesB: number;
  }

  let rounds = $state<RoundData[]>([]);
  let initialized = $state(false);

  // Game tracking for points mode (bracket only)
  let currentGameNumber = $state(1);
  let gamesWonA = $state(0);
  let gamesWonB = $state(0);
  let currentGameComplete = $state(false);
  // Flag to prevent reactive block from double-counting gamesWon during initialization
  let gamesWonInitialized = $state(false);

  // Initialize rounds only once when dialog opens
  $effect(() => {
    if (match && visible && !initialized) {
      // Check if match already has saved rounds
      const hasSavedRounds = match.rounds && match.rounds.length > 0;

      if (hasSavedRounds) {
        // Load saved rounds (for any match type)
        console.log('🔍 Loading saved rounds:', match.rounds);
        rounds = match.rounds.map(r => ({
          gameNumber: r.gameNumber,
          roundInGame: r.roundInGame,
          pointsA: r.pointsA,
          pointsB: r.pointsB,
          twentiesA: r.twentiesA || 0,
          twentiesB: r.twentiesB || 0
        }));

        // For rounds mode: check if there were extra rounds (tiebreaker)
        if (isRoundsMode && rounds.length > baseNumRounds) {
          extraRoundsCount = rounds.length - baseNumRounds;
          console.log('📊 Restored extra rounds count:', extraRoundsCount);
        } else if (isRoundsMode && rounds.length < baseNumRounds) {
          // Pad with empty rounds if needed
          const missingRounds = baseNumRounds - rounds.length;
          for (let i = 0; i < missingRounds; i++) {
            rounds.push({
              gameNumber: 1,
              roundInGame: rounds.length + 1,
              pointsA: null,
              pointsB: null,
              twentiesA: 0,
              twentiesB: 0
            });
          }
          console.log('📊 Padded rounds to match baseNumRounds:', baseNumRounds);
        }

        // For bracket points mode, restore game tracking state
        if (isBracket && !isRoundsMode) {
          gamesWonA = match.gamesWonA || 0;
          gamesWonB = match.gamesWonB || 0;

          // Determine current game number from rounds (highest game number found)
          const maxGameNum = rounds.length > 0
            ? Math.max(...rounds.map(r => r.gameNumber || 1))
            : 1;
          currentGameNumber = maxGameNum;

          // Check if current game is already complete based on points
          const currentRounds = rounds.filter(r => r.gameNumber === currentGameNumber);
          const currentPtsA = currentRounds.reduce((sum, r) => sum + (r.pointsA ?? 0), 0);
          const currentPtsB = currentRounds.reduce((sum, r) => sum + (r.pointsB ?? 0), 0);
          const pointsToWin = gameConfig.pointsToWin || 7;
          const aWon = currentPtsA >= pointsToWin && (currentPtsA - currentPtsB >= 2);
          const bWon = currentPtsB >= pointsToWin && (currentPtsB - currentPtsA >= 2);

          // Mark current game as complete if match is finished OR if current game has a winner
          currentGameComplete = (match.status === 'COMPLETED' || match.status === 'WALKOVER') || aWon || bWon;

          // Mark games won as properly initialized to prevent reactive double-counting
          gamesWonInitialized = true;

          console.log('📊 Restored bracket points mode state:', {
            gamesWonA, gamesWonB, currentGameNumber, currentGameComplete,
            currentPtsA, currentPtsB, pointsToWin
          });
        }

        console.log('✅ Loaded rounds:', rounds);
      } else {
        // No saved rounds - initialize based on mode
        if (isBracket && !isRoundsMode) {
          // Points mode bracket: start with empty rounds (dynamic)
          rounds = [];
          currentGameNumber = 1;
          // For completed matches without rounds, load games won from match data
          if (match.status === 'COMPLETED' || match.status === 'WALKOVER') {
            gamesWonA = match.gamesWonA || 0;
            gamesWonB = match.gamesWonB || 0;
            currentGameComplete = true;
          } else {
            gamesWonA = 0;
            gamesWonB = 0;
            currentGameComplete = false;
          }
        } else {
          // Rounds mode (groups & brackets): initialize fixed rounds
          extraRoundsCount = 0;
          rounds = Array.from({ length: baseNumRounds }, (_, i) => ({
            gameNumber: 1,
            roundInGame: i + 1,
            pointsA: null,
            pointsB: null,
            twentiesA: 0,
            twentiesB: 0
          }));
        }
        console.log('⚠️ No saved rounds - initialized new rounds');
      }

      initialized = true;
    }
  });

  // Reset initialization flag and state when dialog closes
  $effect(() => {
    if (!visible) {
      initialized = false;
      gamesWonInitialized = false;
      currentGameNumber = 1;
      gamesWonA = 0;
      gamesWonB = 0;
      currentGameComplete = false;
      extraRoundsCount = 0;
    }
  });

  // Reinicializar cuando match.rounds cambia (actualización de Firebase)
  $effect(() => {
    if (visible && match?.rounds && match.rounds.length > rounds.length) {
      initialized = false;
    }
  });

  // Computed values for current game (points mode brackets only)
  let currentGameRounds = $derived(rounds.filter(r => r.gameNumber === currentGameNumber));
  let currentPointsA = $derived(currentGameRounds.reduce((sum, r) => sum + (r.pointsA ?? 0), 0));
  let currentPointsB = $derived(currentGameRounds.reduce((sum, r) => sum + (r.pointsB ?? 0), 0));

  // Game completion check (points mode brackets only)
  $effect(() => {
    if (isBracket && !isRoundsMode) {
      const pointsToWin = gameConfig.pointsToWin || 7;
      const aWins = currentPointsA >= pointsToWin && (currentPointsA - currentPointsB >= 2);
      const bWins = currentPointsB >= pointsToWin && (currentPointsB - currentPointsA >= 2);
      const gameJustCompleted = aWins || bWins;

      // If game just completed and wasn't complete before, update games won
      // BUT only if we're not in the initial load where gamesWon is already set from match data
      if (gameJustCompleted && !currentGameComplete && !gamesWonInitialized) {
        // Determine winner and update games won immediately
        if (aWins) {
          gamesWonA++;
        } else if (bWins) {
          gamesWonB++;
        }
      }

      // After first reactive run, reset the flag so future completions are counted
      if (gamesWonInitialized && gameJustCompleted) {
        gamesWonInitialized = false;
      }

      currentGameComplete = gameJustCompleted;
    } else {
      currentGameComplete = false;
    }
  });

  // Calculate totals (aggregate across all games)
  let totalPointsA = $derived(rounds.reduce((sum, r) => sum + (r.pointsA ?? 0), 0));
  let totalPointsB = $derived(rounds.reduce((sum, r) => sum + (r.pointsB ?? 0), 0));
  let total20sA = $derived(rounds.reduce((sum, r) => sum + r.twentiesA, 0));
  let total20sB = $derived(rounds.reduce((sum, r) => sum + r.twentiesB, 0));

  // Games won calculation depends on mode
  $effect(() => {
    if (isBracket && !isRoundsMode) {
      // Points mode bracket: gamesWonA/B are managed by startNextGame()
      // Don't recalculate here
    } else {
      // Rounds mode: count rounds where player scored more
      gamesWonA = rounds.filter(r => r.pointsA !== null && r.pointsB !== null && r.pointsA > r.pointsB).length;
      gamesWonB = rounds.filter(r => r.pointsA !== null && r.pointsB !== null && r.pointsB > r.pointsA).length;
    }
  });

  // Detect tiebreak situation in bracket rounds mode
  let allBaseRoundsComplete = $derived(isRoundsMode && rounds.length >= baseNumRounds &&
    rounds.slice(0, baseNumRounds).every(r => r.pointsA !== null && r.pointsB !== null));
  let isBracketTiebreak = $derived(isBracket && isRoundsMode && allBaseRoundsComplete && gamesWonA === gamesWonB);
  let needsExtraRound = $derived(isBracketTiebreak && rounds.every(r => r.pointsA !== null && r.pointsB !== null));

  // Validation - canSave derived from current state
  let canSave = $derived((() => {
    if (isBracket && !isRoundsMode) {
      // Points mode (bracket): Match must be complete (someone won enough games)
      const requiredWins = Math.ceil(gameConfig.matchesToWin / 2);
      return gamesWonA >= requiredWins || gamesWonB >= requiredWins;
    } else if (isRoundsMode) {
      // Rounds mode: All rounds must be complete
      const allRoundsPlayed = rounds.every(r => r.pointsA !== null && r.pointsB !== null);
      if (isBracket) {
        // Bracket in rounds mode: no ties allowed - must have a winner
        return allRoundsPlayed && gamesWonA !== gamesWonB;
      } else {
        // Groups in rounds mode: ties allowed
        return allRoundsPlayed;
      }
    } else {
      return false;
    }
  })());

  // Check if any result has been entered (to hide no-show buttons)
  let hasAnyResult = $derived(rounds.some(r => r.pointsA !== null || r.pointsB !== null));

  // Group rounds by game number for display (completed matches)
  let gamesByNumber = $derived(rounds.reduce((map, round) => {
    if (!map.has(round.gameNumber)) {
      map.set(round.gameNumber, []);
    }
    map.get(round.gameNumber)!.push(round);
    return map;
  }, new Map<number, RoundData[]>()));

  function handleClose() {
    onclose?.();
  }

  /**
   * Add a new round (points mode brackets only)
   */
  function addRound() {
    if (currentGameComplete) {
      // Don't allow adding rounds if current game is complete
      return;
    }

    const nextRoundInGame = currentGameRounds.length + 1;

    rounds = [
      ...rounds,
      {
        gameNumber: currentGameNumber,
        roundInGame: nextRoundInGame,
        pointsA: null,
        pointsB: null,
        twentiesA: 0,
        twentiesB: 0
      }
    ];
  }

  /**
   * Add extra round for tiebreaker (rounds mode brackets only)
   * Used when match ends in a tie and needs extra rounds until someone wins
   */
  function addExtraRound() {
    if (!isBracket || !isRoundsMode) return;
    if (!needsExtraRound) return;

    extraRoundsCount++;
    const nextRoundNum = rounds.length + 1;

    rounds = [
      ...rounds,
      {
        gameNumber: 1,
        roundInGame: nextRoundNum,
        pointsA: null,
        pointsB: null,
        twentiesA: 0,
        twentiesB: 0
      }
    ];
  }

  /**
   * Start next game (points mode brackets only)
   */
  function startNextGame() {
    if (!currentGameComplete) {
      // Game must be complete before starting next
      return;
    }

    // Games won have already been updated by the reactive statement
    // Just need to check if match is complete and start next game if not
    const requiredWins = Math.ceil(gameConfig.matchesToWin / 2);
    if (gamesWonA >= requiredWins || gamesWonB >= requiredWins) {
      // Match complete - just reset flag for UI to show match complete
      currentGameComplete = false;
      return;
    }

    // Match not complete yet - start next game
    currentGameNumber++;
    currentGameComplete = false;
  }

  function handleSave() {
    if (!canSave) return;

    // Compute aggregate totals across all games
    const result: {
      gamesWonA: number;
      gamesWonB: number;
      totalPointsA?: number;
      totalPointsB?: number;
      total20sA?: number;
      total20sB?: number;
      rounds?: Array<{
        gameNumber: number;
        roundInGame: number;
        pointsA: number | null;
        pointsB: number | null;
        twentiesA: number;
        twentiesB: number;
      }>;
    } = {
      gamesWonA,
      gamesWonB,
      totalPointsA,
      totalPointsB
    };

    if (tournament.show20s) {
      result.total20sA = total20sA;
      result.total20sB = total20sB;
    }

    // Include round-by-round data
    // - For bracket points mode: save rounds with game tracking
    // - For groups/bracket rounds mode: save rounds for editing later
    console.log('💾 Saving match result:', {
      isBracket,
      isRoundsMode,
      roundsLength: rounds.length,
      rounds,
      willIncludeRounds: rounds.length > 0
    });

    if (rounds.length > 0) {
      result.rounds = rounds;
      console.log('✅ Including rounds in result:', result.rounds);
    } else {
      console.log('⚠️ Not including rounds - empty rounds array');
    }

    onsave?.(result);
  }

  function handleNoShow(participantId: string) {
    onnoshow?.(participantId);
  }

  /**
   * Auto-complete points when one player's score is entered
   * Each round distributes exactly 2 points total
   * Only valid values: 0, 1, 2
   */
  function handlePointsChange(roundIndex: number, player: 'A' | 'B', value: number) {
    const round = rounds[roundIndex];

    // Validate input: only allow 0, 1, or 2
    if (value < 0 || value > 2 || !Number.isInteger(value)) {
      // Reset to 0 if invalid
      value = 0;
    }

    if (player === 'A') {
      round.pointsA = value;
      // Auto-complete player B's score (total must be 2)
      round.pointsB = 2 - value;
    } else {
      round.pointsB = value;
      // Auto-complete player A's score (total must be 2)
      round.pointsA = 2 - value;
    }

    // Trigger reactivity
    rounds = rounds;
  }

  /**
   * Validate and update 20s count
   * Singles: 0-8, Doubles: 0-12
   */
  function handleTwentiesChange(roundIndex: number, player: 'A' | 'B', value: number) {
    const round = rounds[roundIndex];
    const maxTwenties = tournament.gameType === 'singles' ? 8 : 12;

    // Validate input: only allow 0 to maxTwenties
    if (value < 0 || value > maxTwenties || !Number.isInteger(value)) {
      // Clamp to valid range
      value = Math.max(0, Math.min(maxTwenties, Math.floor(value)));
    }

    if (player === 'A') {
      round.twentiesA = value;
    } else {
      round.twentiesB = value;
    }

    // Trigger reactivity
    rounds = rounds;
  }

</script>

{#if visible}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="dialog-backdrop"
    data-theme={$adminTheme}
    onclick={handleClose}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
    role="presentation"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <div class="dialog-header">
        <h2>📝 {m.tournament_matchResult()}</h2>
        {#if isAdmin && isMatchCompleted}
          <span class="admin-edit-badge">✏️ {m.tournament_adminEditing()}</span>
        {/if}
        <button class="close-btn" onclick={handleClose}>✕</button>
      </div>

      <div class="dialog-content">
        <!-- Match Info -->
        <div class="match-info">
          <div class="participant-header">
            <span class="participant-name">{participantA?.name || 'Unknown'}</span>
            <span class="vs">VS</span>
            <span class="participant-name">{isBye ? 'BYE' : participantB?.name || 'Unknown'}</span>
          </div>
          {#if match.tableNumber}
            <div class="table-info">{m.tournament_tableShort()} {match.tableNumber}</div>
          {/if}
          <div class="mode-info">
            {#if isRoundsMode}
              {m.tournament_nRounds({ n: String(numRounds) })}
            {:else}
              {m.tournament_bestOf({ games: String(gameConfig.matchesToWin) })}
            {/if}
          </div>
        </div>

        {#if isBye}
          <div class="bye-notice">
            {m.tournament_byeMatchNotice()}
          </div>
        {:else if isBracket && !isRoundsMode}
          <!-- Points Mode: Dynamic Rounds with Games -->
          {#if isMatchCompleted && !isAdmin}
            <!-- Read-only view for completed matches (non-admin) -->
            {@const displayTotalA = rounds.length > 0 ? totalPointsA : (match.totalPointsA || 0)}
            {@const displayTotalB = rounds.length > 0 ? totalPointsB : (match.totalPointsB || 0)}
            {@const display20sA = rounds.length > 0 ? total20sA : (match.total20sA || 0)}
            {@const display20sB = rounds.length > 0 ? total20sB : (match.total20sB || 0)}

            <div class="match-complete-notice">
              <div class="match-winner">
                🏆 {m.tournament_matchCompletedWinner({ name: gamesWonA > gamesWonB ? participantA?.name || '' : participantB?.name || '' })}
              </div>
              <div class="match-score-summary">
                {participantA?.name} {gamesWonA} - {gamesWonB} {participantB?.name} ({m.tournament_gamesLabel()})
              </div>
            </div>

            {#if rounds.length > 0}
              <!-- Display each game with round-by-round details -->
              {#each Array.from(gamesByNumber.entries()) as [gameNum, gameRounds]}
                {@const gamePointsA = gameRounds.reduce((sum, r) => sum + (r.pointsA ?? 0), 0)}
                {@const gamePointsB = gameRounds.reduce((sum, r) => sum + (r.pointsB ?? 0), 0)}
                {@const game20sA = gameRounds.reduce((sum, r) => sum + r.twentiesA, 0)}
                {@const game20sB = gameRounds.reduce((sum, r) => sum + r.twentiesB, 0)}

                <div class="completed-game">
                  <div class="completed-game-header">
                    <span class="game-title">{m.tournament_gameN({ n: String(gameNum) })}</span>
                    <span class="game-winner">
                      {m.tournament_winnerLabel({ name: gamePointsA > gamePointsB ? participantA?.name || '' : participantB?.name || '' })} ({gamePointsA}-{gamePointsB})
                    </span>
                  </div>

                  <div class="rounds-table-container">
                    <table class="rounds-table readonly">
                      <thead>
                        <tr class="header-main">
                          <th class="player-col" rowspan="2">{m.tournament_playerColumn()}</th>
                          {#each gameRounds as _, i}
                            <th class="round-col" colspan={tournament.show20s ? 2 : 1}>R{i + 1}</th>
                          {/each}
                          <th class="total-col" colspan={tournament.show20s ? 2 : 1}>{m.time_total()}</th>
                        </tr>
                        {#if tournament.show20s}
                          <tr class="header-sub">
                            {#each gameRounds as _}
                              <th class="sub-col points-col">P</th>
                              <th class="sub-col twenties-col">🎯</th>
                            {/each}
                            <th class="sub-col points-col">P</th>
                            <th class="sub-col twenties-col">🎯</th>
                          </tr>
                        {/if}
                      </thead>
                      <tbody>
                        <!-- Player A -->
                        <tr class="player-row">
                          <td class="player-name">{participantA?.name}</td>
                          {#each gameRounds as round}
                            <td class="round-cell points-cell readonly">{round.pointsA ?? '-'}</td>
                            {#if tournament.show20s}
                              <td class="round-cell twenties-cell readonly">{round.twentiesA || 0}</td>
                            {/if}
                          {/each}
                          <td class="total-cell points-total readonly">{gamePointsA}</td>
                          {#if tournament.show20s}
                            <td class="total-cell twenties-total readonly">{game20sA}</td>
                          {/if}
                        </tr>

                        <!-- Player B -->
                        <tr class="player-row">
                          <td class="player-name">{participantB?.name}</td>
                          {#each gameRounds as round}
                            <td class="round-cell points-cell readonly">{round.pointsB ?? '-'}</td>
                            {#if tournament.show20s}
                              <td class="round-cell twenties-cell readonly">{round.twentiesB || 0}</td>
                            {/if}
                          {/each}
                          <td class="total-cell points-total readonly">{gamePointsB}</td>
                          {#if tournament.show20s}
                            <td class="total-cell twenties-total readonly">{game20sB}</td>
                          {/if}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              {/each}
            {:else}
              <!-- No round details available, show summary only -->
              <div class="summary-only-notice">
                <p>{m.tournament_noRoundDetailsAvailable()}</p>
                <div class="summary-stats">
                  <div class="stat-row">
                    <span class="stat-label">{m.tournament_totalPointsLabel()}</span>
                    <span class="stat-value">{participantA?.name} {displayTotalA} - {displayTotalB} {participantB?.name}</span>
                  </div>
                  {#if tournament.show20s}
                    <div class="stat-row">
                      <span class="stat-label">{m.tournament_totalTwentiesLabel()}</span>
                      <span class="stat-value">{participantA?.name} {display20sA} - {display20sB} {participantB?.name}</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

          {:else}
            <!-- Editable view for pending matches -->

            <!-- Show completed games first (same format as completed match view) -->
            {#each Array.from(gamesByNumber.entries()).filter(([num]) => num < currentGameNumber) as [gameNum, gameRounds]}
              {@const gamePointsA = gameRounds.reduce((sum, r) => sum + (r.pointsA ?? 0), 0)}
              {@const gamePointsB = gameRounds.reduce((sum, r) => sum + (r.pointsB ?? 0), 0)}
              {@const game20sA = gameRounds.reduce((sum, r) => sum + r.twentiesA, 0)}
              {@const game20sB = gameRounds.reduce((sum, r) => sum + r.twentiesB, 0)}

              <div class="completed-game">
                <div class="completed-game-header">
                  <span class="game-title">✓ {m.tournament_gameN({ n: String(gameNum) })}</span>
                  <span class="game-winner">
                    {m.tournament_winnerLabel({ name: gamePointsA > gamePointsB ? participantA?.name || '' : participantB?.name || '' })} ({gamePointsA}-{gamePointsB})
                  </span>
                </div>

                <div class="rounds-table-container">
                  <table class="rounds-table readonly">
                    <thead>
                      <tr class="header-main">
                        <th class="player-col" rowspan="2">{m.tournament_playerColumn()}</th>
                        {#each gameRounds as _, i}
                          <th class="round-col" colspan={tournament.show20s ? 2 : 1}>R{i + 1}</th>
                        {/each}
                        <th class="total-col" colspan={tournament.show20s ? 2 : 1}>{m.time_total()}</th>
                      </tr>
                      {#if tournament.show20s}
                        <tr class="header-sub">
                          {#each gameRounds as _}
                            <th class="sub-col points-col">P</th>
                            <th class="sub-col twenties-col">🎯</th>
                          {/each}
                          <th class="sub-col points-col">P</th>
                          <th class="sub-col twenties-col">🎯</th>
                        </tr>
                      {/if}
                    </thead>
                    <tbody>
                      <tr class="player-row">
                        <td class="player-name">{participantA?.name}</td>
                        {#each gameRounds as round}
                          <td class="round-cell points-cell readonly">{round.pointsA ?? '-'}</td>
                          {#if tournament.show20s}
                            <td class="round-cell twenties-cell readonly">{round.twentiesA || 0}</td>
                          {/if}
                        {/each}
                        <td class="total-cell points-total readonly">{gamePointsA}</td>
                        {#if tournament.show20s}
                          <td class="total-cell twenties-total readonly">{game20sA}</td>
                        {/if}
                      </tr>
                      <tr class="player-row">
                        <td class="player-name">{participantB?.name}</td>
                        {#each gameRounds as round}
                          <td class="round-cell points-cell readonly">{round.pointsB ?? '-'}</td>
                          {#if tournament.show20s}
                            <td class="round-cell twenties-cell readonly">{round.twentiesB || 0}</td>
                          {/if}
                        {/each}
                        <td class="total-cell points-total readonly">{gamePointsB}</td>
                        {#if tournament.show20s}
                          <td class="total-cell twenties-total readonly">{game20sB}</td>
                        {/if}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            {/each}

            <!-- Current game -->
            <div class="current-game-header">
              <span class="game-title">▶ {m.tournament_gameN({ n: String(currentGameNumber) })}</span>
              <span class="current-score">{currentPointsA} - {currentPointsB}</span>
              <span class="games-score">({gamesWonA}-{gamesWonB})</span>
            </div>
          {/if}

          <!-- Rounds table for current game (for pending matches or admin editing) -->
          {#if canEdit && currentGameRounds.length > 0}
            {@const current20sA = currentGameRounds.reduce((sum, r) => sum + r.twentiesA, 0)}
            {@const current20sB = currentGameRounds.reduce((sum, r) => sum + r.twentiesB, 0)}
            <div class="rounds-table-container">
              <table class="rounds-table">
                <thead>
                  <tr class="header-main">
                    <th class="player-col" rowspan="2">{m.tournament_playerColumn()}</th>
                    {#each currentGameRounds as _, i}
                      <th class="round-col" colspan={tournament.show20s ? 2 : 1}>R{i + 1}</th>
                    {/each}
                    <th class="total-col" colspan={tournament.show20s ? 2 : 1}>{m.time_total()}</th>
                  </tr>
                  {#if tournament.show20s}
                    <tr class="header-sub">
                      {#each currentGameRounds as _}
                        <th class="sub-col points-col">P</th>
                        <th class="sub-col twenties-col">🎯</th>
                      {/each}
                      <th class="sub-col points-col">P</th>
                      <th class="sub-col twenties-col">🎯</th>
                    </tr>
                  {/if}
                </thead>
                <tbody>
                  <tr class="player-row">
                    <td class="player-name">{participantA?.name}</td>
                    {#each currentGameRounds as round}
                      {@const roundIndex = rounds.findIndex(r => r === round)}
                      <td class="round-cell points-cell">
                        <div class="points-selector">
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsA === 2}
                            onclick={() => handlePointsChange(roundIndex, 'A', 2)}
                          >
                            2
                          </button>
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsA === 1}
                            onclick={() => handlePointsChange(roundIndex, 'A', 1)}
                          >
                            1
                          </button>
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsA === 0}
                            onclick={() => handlePointsChange(roundIndex, 'A', 0)}
                          >
                            0
                          </button>
                        </div>
                      </td>
                      {#if tournament.show20s}
                        <td class="round-cell twenties-cell">
                          <input
                            type="number"
                            min="0"
                            max={tournament.gameType === 'singles' ? 8 : 12}
                            value={round.twentiesA}
                            oninput={(e) => handleTwentiesChange(roundIndex, 'A', parseInt(e.currentTarget.value) || 0)}
                            class="twenties-input"
                          />
                        </td>
                      {/if}
                    {/each}
                    <td class="total-cell points-cell">
                      <span class="total-value">{currentPointsA}</span>
                    </td>
                    {#if tournament.show20s}
                      <td class="total-cell twenties-cell">
                        <span class="total-value total-twenties">{current20sA}</span>
                      </td>
                    {/if}
                  </tr>
                  <tr class="player-row">
                    <td class="player-name">{participantB?.name}</td>
                    {#each currentGameRounds as round}
                      {@const roundIndex = rounds.findIndex(r => r === round)}
                      <td class="round-cell points-cell">
                        <div class="points-selector">
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsB === 2}
                            onclick={() => handlePointsChange(roundIndex, 'B', 2)}
                          >
                            2
                          </button>
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsB === 1}
                            onclick={() => handlePointsChange(roundIndex, 'B', 1)}
                          >
                            1
                          </button>
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsB === 0}
                            onclick={() => handlePointsChange(roundIndex, 'B', 0)}
                          >
                            0
                          </button>
                        </div>
                      </td>
                      {#if tournament.show20s}
                        <td class="round-cell twenties-cell">
                          <input
                            type="number"
                            min="0"
                            max={tournament.gameType === 'singles' ? 8 : 12}
                            value={round.twentiesB}
                            oninput={(e) => handleTwentiesChange(roundIndex, 'B', parseInt(e.currentTarget.value) || 0)}
                            class="twenties-input"
                          />
                        </td>
                      {/if}
                    {/each}
                    <td class="total-cell points-cell">
                      <span class="total-value">{currentPointsB}</span>
                    </td>
                    {#if tournament.show20s}
                      <td class="total-cell twenties-cell">
                        <span class="total-value total-twenties">{current20sB}</span>
                      </td>
                    {/if}
                  </tr>
                </tbody>
              </table>
            </div>
          {/if}

          <!-- Add Round or Next Game buttons (for pending matches or admin editing) -->
          {#if canEdit}
            <div class="game-actions">
              {#if !currentGameComplete}
                <button class="add-round-btn" onclick={addRound} type="button">
                  + {m.tournament_addRound()}
                </button>
              {:else}
                <div class="game-complete-notice">
                  ✅ {m.tournament_gameCompletedNotice({ n: String(currentGameNumber) })}
                  <div class="game-result">
                    {currentPointsA > currentPointsB ? participantA?.name : participantB?.name} {m.tournament_wins()} {Math.max(currentPointsA, currentPointsB)}-{Math.min(currentPointsA, currentPointsB)}
                  </div>
                </div>

                {@const requiredWins = Math.ceil(gameConfig.matchesToWin / 2)}
                {#if gamesWonA < requiredWins && gamesWonB < requiredWins}
                  <button class="next-game-btn" onclick={startNextGame} type="button">
                    {m.tournament_startGameN({ n: String(currentGameNumber + 1) })}
                  </button>
                {:else}
                  <div class="match-complete-notice">
                    <div class="match-winner">
                      🏆 {m.tournament_matchCompleteWinner({ name: gamesWonA > gamesWonB ? participantA?.name || '' : participantB?.name || '' })}
                    </div>
                    <div class="match-stats">
                      <div class="stat-row">
                        <span class="stat-label">{m.tournament_totalPointsLabel()}</span>
                        <span class="stat-value">{participantA?.name} {totalPointsA} - {totalPointsB} {participantB?.name}</span>
                      </div>
                      {#if tournament.show20s}
                        <div class="stat-row">
                          <span class="stat-label">{m.tournament_totalTwentiesLabel()}</span>
                          <span class="stat-value">{participantA?.name} {total20sA} 🎯 - 🎯 {total20sB} {participantB?.name}</span>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/if}
            </div>
          {/if}

        {:else}
          <!-- Rounds Mode OR Group Stage -->
          {#if isMatchCompleted && !isAdmin}
            <!-- Read-only view for completed matches (non-admin) -->
            {@const displayTotalA = rounds.length > 0 ? totalPointsA : (match.totalPointsA || 0)}
            {@const displayTotalB = rounds.length > 0 ? totalPointsB : (match.totalPointsB || 0)}
            {@const display20sA = rounds.length > 0 ? total20sA : (match.total20sA || 0)}
            {@const display20sB = rounds.length > 0 ? total20sB : (match.total20sB || 0)}

            <div class="match-complete-notice">
              <div class="match-winner">
                🏆 {m.tournament_matchCompletedWinner({ name: match.winner === match.participantA ? participantA?.name || '' : participantB?.name || '' })}
              </div>
              <div class="match-score-summary">
                {participantA?.name} {displayTotalA} - {displayTotalB} {participantB?.name}
              </div>
            </div>

            {#if rounds.length > 0}
              <!-- Show round-by-round details if available -->
              <div class="rounds-table-container">
                <table class="rounds-table readonly">
                  <thead>
                    <tr class="header-main">
                      <th class="player-col" rowspan="2">{m.tournament_playerColumn()}</th>
                      {#each rounds as _, i}
                        <th class="round-col" colspan={tournament.show20s ? 2 : 1}>R{i + 1}</th>
                      {/each}
                      <th class="total-col" colspan={tournament.show20s ? 2 : 1}>{m.time_total()}</th>
                    </tr>
                    {#if tournament.show20s}
                      <tr class="header-sub">
                        {#each rounds as _}
                          <th class="sub-col points-col">P</th>
                          <th class="sub-col twenties-col">🎯</th>
                        {/each}
                        <th class="sub-col points-col">P</th>
                        <th class="sub-col twenties-col">🎯</th>
                      </tr>
                    {/if}
                  </thead>
                  <tbody>
                    <!-- Player A -->
                    <tr class="player-row">
                      <td class="player-name">{participantA?.name}</td>
                      {#each rounds as round}
                        <td class="round-cell readonly">{round.pointsA ?? '-'}</td>
                        {#if tournament.show20s}
                          <td class="round-cell readonly">{round.twentiesA || 0}</td>
                        {/if}
                      {/each}
                      <td class="total-cell readonly">{displayTotalA}</td>
                      {#if tournament.show20s}
                        <td class="total-cell readonly">{display20sA}</td>
                      {/if}
                    </tr>

                    <!-- Player B -->
                    <tr class="player-row">
                      <td class="player-name">{participantB?.name}</td>
                      {#each rounds as round}
                        <td class="round-cell readonly">{round.pointsB ?? '-'}</td>
                        {#if tournament.show20s}
                          <td class="round-cell readonly">{round.twentiesB || 0}</td>
                        {/if}
                      {/each}
                      <td class="total-cell readonly">{displayTotalB}</td>
                      {#if tournament.show20s}
                        <td class="total-cell readonly">{display20sB}</td>
                      {/if}
                    </tr>
                  </tbody>
                </table>
              </div>
            {:else}
              <!-- No round details available, show summary only -->
              <div class="summary-only-notice">
                <p>{m.tournament_noRoundDetailsAvailable()}</p>
                <div class="summary-stats">
                  <div class="stat-row">
                    <span class="stat-label">{m.tournament_totalPointsLabel()}</span>
                    <span class="stat-value">{participantA?.name} {displayTotalA} - {displayTotalB} {participantB?.name}</span>
                  </div>
                  {#if tournament.show20s}
                    <div class="stat-row">
                      <span class="stat-label">{m.tournament_totalTwentiesLabel()}</span>
                      <span class="stat-value">{participantA?.name} {display20sA} - {display20sB} {participantB?.name}</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          {:else}
            <!-- Editable view for pending matches -->
            <div class="rounds-table-container">
              <table class="rounds-table">
                <thead>
                  <tr class="header-main">
                    <th class="player-col" rowspan="2">{m.tournament_playerColumn()}</th>
                    {#each Array(numRounds) as _, i}
                      <th class="round-col" colspan={tournament.show20s ? 2 : 1}>R{i + 1}</th>
                    {/each}
                    <th class="total-col" colspan={tournament.show20s ? 2 : 1}>{m.time_total()}</th>
                  </tr>
                  {#if tournament.show20s}
                    <tr class="header-sub">
                      {#each Array(numRounds) as _}
                        <th class="sub-col points-col">P</th>
                        <th class="sub-col twenties-col">🎯</th>
                      {/each}
                      <th class="sub-col points-col">P</th>
                      <th class="sub-col twenties-col">🎯</th>
                    </tr>
                  {/if}
                </thead>
                <tbody>
                  <!-- Player A -->
                  <tr class="player-row">
                    <td class="player-name">{participantA?.name}</td>
                    {#each rounds as round, roundIndex}
                      <td class="round-cell points-cell">
                        <div class="points-selector">
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsA === 2}
                            onclick={() => handlePointsChange(roundIndex, 'A', 2)}
                          >
                            2
                          </button>
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsA === 1}
                            onclick={() => handlePointsChange(roundIndex, 'A', 1)}
                          >
                            1
                          </button>
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsA === 0}
                            onclick={() => handlePointsChange(roundIndex, 'A', 0)}
                          >
                            0
                          </button>
                        </div>
                      </td>
                      {#if tournament.show20s}
                        <td class="round-cell twenties-cell">
                          <input
                            type="number"
                            min="0"
                            max={tournament.gameType === 'singles' ? 8 : 12}
                            value={round.twentiesA}
                            oninput={(e) => handleTwentiesChange(roundIndex, 'A', parseInt(e.currentTarget.value) || 0)}
                            class="twenties-input"
                          />
                        </td>
                      {/if}
                    {/each}
                    <td class="total-cell points-cell">
                      <span class="total-value">{totalPointsA}</span>
                      {#if !isRoundsMode}
                        <span class="games-won">({gamesWonA}G)</span>
                      {/if}
                    </td>
                    {#if tournament.show20s}
                      <td class="total-cell twenties-cell">
                        <span class="total-value total-twenties">{total20sA}</span>
                      </td>
                    {/if}
                  </tr>

                  <!-- Player B -->
                  <tr class="player-row">
                    <td class="player-name">{participantB?.name}</td>
                    {#each rounds as round, roundIndex}
                      <td class="round-cell points-cell">
                        <div class="points-selector">
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsB === 2}
                            onclick={() => handlePointsChange(roundIndex, 'B', 2)}
                          >
                            2
                          </button>
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsB === 1}
                            onclick={() => handlePointsChange(roundIndex, 'B', 1)}
                          >
                            1
                          </button>
                          <button
                            type="button"
                            class="point-btn"
                            class:selected={round.pointsB === 0}
                            onclick={() => handlePointsChange(roundIndex, 'B', 0)}
                          >
                            0
                          </button>
                        </div>
                      </td>
                      {#if tournament.show20s}
                        <td class="round-cell twenties-cell">
                          <input
                            type="number"
                            min="0"
                            max={tournament.gameType === 'singles' ? 8 : 12}
                            value={round.twentiesB}
                            oninput={(e) => handleTwentiesChange(roundIndex, 'B', parseInt(e.currentTarget.value) || 0)}
                            class="twenties-input"
                          />
                        </td>
                      {/if}
                    {/each}
                    <td class="total-cell points-cell">
                      <span class="total-value">{totalPointsB}</span>
                      {#if !isRoundsMode}
                        <span class="games-won">({gamesWonB}G)</span>
                      {/if}
                    </td>
                    {#if tournament.show20s}
                      <td class="total-cell twenties-cell">
                        <span class="total-value total-twenties">{total20sB}</span>
                      </td>
                    {/if}
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Tiebreak section for bracket rounds mode -->
            {#if needsExtraRound}
              <div class="tiebreak-section">
                <div class="tiebreak-notice">
                  ⚖️ {m.tournament_tiebreakNeeded()}
                </div>
                <div class="tiebreak-score">
                  {participantA?.name} {gamesWonA} - {gamesWonB} {participantB?.name}
                </div>
                <button class="extra-round-btn" onclick={addExtraRound} type="button">
                  + {m.tournament_addExtraRound()} (R{rounds.length + 1})
                </button>
              </div>
            {:else if isRoundsMode && !canSave && (totalPointsA > 0 || totalPointsB > 0)}
              <!-- Validation messages (only for rounds mode) -->
              <div class="validation-error">
                {#if isBracket && gamesWonA === gamesWonB}
                  ⚠️ {m.tournament_tiesNotAllowedInElimination()}
                {:else}
                  ⚠️ {m.tournament_mustCompleteAllRounds()}
                {/if}
              </div>
            {/if}

            <!-- No-show section (only show if no results have been entered) -->
            {#if !hasAnyResult}
              <div class="noshow-section">
                <h3>⚠️ {m.tournament_noShowLabel()}</h3>
                <div class="noshow-buttons">
                  <button class="noshow-btn" onclick={() => handleNoShow(match.participantA)}>
                    {m.tournament_didNotShowUp({ name: participantA?.name || '' })}
                  </button>
                  <button class="noshow-btn" onclick={() => handleNoShow(match.participantB)}>
                    {m.tournament_didNotShowUp({ name: participantB?.name || '' })}
                  </button>
                </div>
              </div>
            {/if}
          {/if}
        {/if}
      </div>

      {#if canEdit}
        <div class="dialog-footer">
          <button class="cancel-btn" onclick={handleClose}>
            {m.common_cancel()}
          </button>
          {#if !isBye}
            <button class="save-btn" onclick={handleSave} disabled={!canSave}>
              {isAdmin && isMatchCompleted ? m.tournament_updateResult() : m.common_save()}
            </button>
          {/if}
        </div>
      {:else}
        <div class="dialog-footer">
          <button class="cancel-btn" onclick={handleClose}>
            {m.common_close()}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .dialog {
    background: white;
    border-radius: 12px;
    max-width: 900px;
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 1.4rem;
    color: #1a1a1a;
  }

  .admin-edit-badge {
    background: #f59e0b;
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.85rem;
    font-weight: 600;
    margin-left: auto;
    margin-right: 1rem;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #9ca3af;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: #1a1a1a;
  }

  .dialog-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .match-info {
    background: #f9fafb;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .participant-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .participant-name {
    font-size: 1.1rem;
    font-weight: 700;
    color: #1a1a1a;
  }

  .vs {
    font-size: 0.85rem;
    font-weight: 800;
    color: #9ca3af;
    padding: 0.25rem 0.5rem;
    background: white;
    border-radius: 4px;
  }

  .table-info,
  .mode-info {
    font-size: 0.9rem;
    color: #6b7280;
    font-weight: 600;
  }

  .bye-notice {
    background: #fef3c7;
    color: #92400e;
    padding: 1rem;
    border-radius: 8px;
    text-align: center;
    font-weight: 600;
  }

  /* Games Scoreboard (Points Mode) */
  .games-scoreboard {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    color: white;
  }

  .game-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .game-number {
    font-size: 1.1rem;
    font-weight: 700;
  }

  .games-won-display {
    font-size: 0.95rem;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.2);
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
  }

  .games-won-display strong {
    font-size: 1.1rem;
    font-weight: 800;
  }

  .current-game-score {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    margin: 1.5rem 0;
  }

  .score-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .player-label {
    font-size: 0.9rem;
    font-weight: 600;
    opacity: 0.9;
  }

  .points-display {
    font-size: 3rem;
    font-weight: 800;
    line-height: 1;
  }

  .score-divider {
    font-size: 2rem;
    font-weight: 300;
    opacity: 0.6;
  }

  .target-info {
    text-align: center;
    font-size: 0.85rem;
    opacity: 0.9;
    margin-top: 0.5rem;
  }

  /* Game Actions */
  .game-actions {
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }

  .add-round-btn {
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
  }

  .add-round-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .game-complete-notice {
    background: #d1fae5;
    color: #065f46;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    text-align: center;
    font-weight: 700;
    font-size: 1rem;
  }

  .game-result {
    margin-top: 0.5rem;
    font-size: 0.9rem;
    font-weight: 600;
    opacity: 0.9;
  }

  .next-game-btn {
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  }

  .next-game-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .match-complete-notice {
    background: #fef3c7;
    color: #92400e;
    padding: 1.5rem;
    border-radius: 8px;
    text-align: center;
  }

  .match-winner {
    font-weight: 700;
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }

  .match-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 2px solid rgba(146, 64, 14, 0.2);
  }

  .stat-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: center;
  }

  .stat-label {
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.8;
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 700;
  }

  .match-score-summary {
    font-size: 1.2rem;
    font-weight: 700;
    color: #92400e;
    margin-top: 0.5rem;
  }

  /* Summary only notice (when no round details available) */
  .summary-only-notice {
    background: #f3f4f6;
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    margin-top: 1rem;
  }

  .summary-only-notice p {
    color: #6b7280;
    font-size: 0.9rem;
    margin: 0 0 1rem 0;
  }

  .summary-only-notice .summary-stats {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .summary-only-notice .stat-row {
    background: white;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .dialog-backdrop[data-theme='dark'] .summary-only-notice {
    background: #0f1419;
  }

  .dialog-backdrop[data-theme='dark'] .summary-only-notice p {
    color: #8b9bb3;
  }

  .dialog-backdrop[data-theme='dark'] .summary-only-notice .stat-row {
    background: #1a2332;
  }

  /* Completed game display */
  .completed-game {
    margin: 1.5rem 0;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 8px;
    border: 1px solid rgba(146, 64, 14, 0.2);
  }

  /* Completed game summary (in-progress matches) */
  .completed-game-summary {
    background: #d1fae5;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }

  .completed-game-summary .game-header.completed {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .completed-game-summary .game-number {
    font-weight: 600;
    color: #065f46;
  }

  .completed-game-summary .game-result {
    font-weight: 500;
    color: #047857;
  }

  .completed-game-summary .winner-badge {
    font-size: 0.85em;
    opacity: 0.8;
  }

  .completed-game-summary .completed-rounds {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    width: 100%;
  }

  .completed-game-summary .completed-rounds th,
  .completed-game-summary .completed-rounds td {
    padding: 0.25rem 0.5rem;
    text-align: center;
  }

  .completed-game-summary .completed-rounds th {
    background: rgba(0, 0, 0, 0.1);
    font-weight: 600;
  }

  .completed-game-summary .completed-rounds td {
    background: rgba(255, 255, 255, 0.5);
  }

  .game-header.current .game-number {
    color: #2563eb;
  }

  .current-game-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: #dbeafe;
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .current-game-header .game-title {
    font-weight: 600;
    color: #1d4ed8;
  }

  .current-game-header .current-score {
    font-weight: 700;
    font-size: 1.1rem;
  }

  .current-game-header .games-score {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .dialog-backdrop[data-theme='dark'] .current-game-header {
    background: #1e3a5f;
  }

  .dialog-backdrop[data-theme='dark'] .current-game-header .game-title {
    color: #93c5fd;
  }

  .dialog-backdrop[data-theme='dark'] .completed-game-summary {
    background: #064e3b;
  }

  .dialog-backdrop[data-theme='dark'] .completed-game-summary .game-number {
    color: #6ee7b7;
  }

  .dialog-backdrop[data-theme='dark'] .completed-game-summary .game-result {
    color: #a7f3d0;
  }

  .completed-game-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid rgba(146, 64, 14, 0.3);
  }

  .game-title {
    font-size: 1rem;
    font-weight: 700;
    color: #92400e;
  }

  .game-winner {
    font-size: 0.9rem;
    font-weight: 600;
    color: #059669;
  }

  /* Read-only table cells */
  .rounds-table.readonly {
    opacity: 1;
  }

  .round-cell.readonly,
  .total-cell.readonly {
    text-align: center;
    font-weight: 600;
    color: #374151;
    background: rgba(243, 244, 246, 0.5);
  }

  .total-cell.readonly {
    background: rgba(209, 213, 219, 0.5);
    font-weight: 700;
  }

  /* Compact Table for Points Mode */
  .rounds-table.compact {
    font-size: 0.9rem;
  }

  .rounds-table.compact th,
  .rounds-table.compact td {
    padding: 0.5rem 0.25rem;
  }

  .round-num-col {
    min-width: 60px;
    text-align: center;
  }

  .player-col-compact {
    min-width: 100px;
    text-align: center;
  }

  .twenties-col-compact {
    min-width: 50px;
    text-align: center;
  }

  .round-num {
    text-align: center;
    font-weight: 600;
    color: #6b7280;
  }

  /* Points and Twenties inline layout */
  .points-twenties-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
  }

  .twenties-inline {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: #fffbeb;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    border: 1px solid #fbbf24;
  }

  .twenties-label {
    font-size: 0.9rem;
  }

  .twenties-input-inline {
    width: 40px;
    padding: 0.25rem;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 700;
    text-align: center;
    color: #1a1a1a;
    background: white;
  }

  .twenties-input-inline:focus {
    outline: none;
    border-color: #fbbf24;
    box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.1);
  }

  /* Dark mode for inline twenties */
  .dialog-backdrop[data-theme='dark'] .twenties-inline {
    background: rgba(251, 191, 36, 0.1);
    border-color: rgba(251, 191, 36, 0.3);
  }

  .dialog-backdrop[data-theme='dark'] .twenties-input-inline {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .dialog-backdrop[data-theme='dark'] .twenties-input-inline:focus {
    border-color: #fbbf24;
  }

  /* Rounds Table */
  .rounds-table-container {
    overflow-x: auto;
    margin-bottom: 1.5rem;
  }

  .rounds-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
  }

  .rounds-table th {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 0.75rem 0.5rem;
    font-size: 0.9rem;
    font-weight: 700;
    text-align: center;
  }

  .rounds-table th.player-col {
    text-align: left;
    padding-left: 1rem;
    min-width: 120px;
  }

  .rounds-table th.round-col {
    min-width: 70px;
  }

  .rounds-table th.sub-col {
    font-size: 0.8rem;
    padding: 0.5rem 0.25rem;
  }

  .rounds-table th.sub-col.points-col {
    min-width: 45px;
  }

  .rounds-table th.sub-col.twenties-col {
    min-width: 40px;
    background: rgba(251, 191, 36, 0.3);
  }

  .rounds-table th.total-col {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    min-width: 100px;
  }

  .rounds-table td {
    padding: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .player-row td {
    background: #fafafa;
  }

  .player-name {
    font-weight: 600;
    color: #1a1a1a;
    padding-left: 1rem !important;
  }

  .round-cell {
    text-align: center;
    padding: 0.25rem !important;
  }

  .round-cell.points-cell {
    min-width: 45px;
    max-width: 60px;
  }

  .round-cell.twenties-cell {
    min-width: 40px;
    max-width: 50px;
    background: #fffef5;
  }

  .points-selector {
    display: flex;
    gap: 0.15rem;
    justify-content: center;
    align-items: center;
  }

  .point-btn {
    padding: 0.3rem 0.4rem;
    background: #f3f4f6;
    border: 2px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 700;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
    min-width: 26px;
    line-height: 1;
  }

  .point-btn:hover {
    background: #e5e7eb;
    border-color: #9ca3af;
  }

  .point-btn.selected {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-color: #059669;
    color: white;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    transform: scale(1.05);
  }

  .twenties-input {
    width: 100%;
    max-width: 45px;
    padding: 0.5rem 0.25rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 700;
    text-align: center;
    color: #1a1a1a;
    background: #fffbeb;
    transition: all 0.2s;
  }

  .twenties-input:focus {
    outline: none;
    border-color: #fbbf24;
    box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.1);
  }

  .total-cell {
    text-align: center;
    background: #f0fdf4 !important;
    font-weight: 700;
  }

  .total-value {
    font-size: 1.3rem;
    color: #059669;
    font-weight: 800;
  }

  .games-won {
    display: block;
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 600;
    margin-top: 0.25rem;
  }

  .validation-error {
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: #fee;
    color: #c00;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: center;
  }

  /* Tiebreak section */
  .tiebreak-section {
    margin: 1.5rem 0;
    padding: 1.25rem;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border: 2px solid #f59e0b;
    border-radius: 12px;
    text-align: center;
  }

  .tiebreak-notice {
    font-size: 1.1rem;
    font-weight: 700;
    color: #92400e;
    margin-bottom: 0.75rem;
  }

  .tiebreak-score {
    font-size: 1.3rem;
    font-weight: 800;
    color: #1a1a1a;
    margin-bottom: 1rem;
  }

  .extra-round-btn {
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
  }

  .extra-round-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5);
  }

  .dialog-backdrop[data-theme='dark'] .tiebreak-section {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.2) 100%);
    border-color: #f59e0b;
  }

  .dialog-backdrop[data-theme='dark'] .tiebreak-notice {
    color: #fbbf24;
  }

  .dialog-backdrop[data-theme='dark'] .tiebreak-score {
    color: #e1e8ed;
  }

  .noshow-section {
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .noshow-section h3 {
    font-size: 1rem;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 0.75rem 0;
  }

  .noshow-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .noshow-btn {
    flex: 1;
    padding: 0.75rem 1rem;
    background: #fef3c7;
    border: 2px solid #fbbf24;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #92400e;
    cursor: pointer;
    transition: all 0.2s;
  }

  .noshow-btn:hover {
    background: #fbbf24;
    color: white;
  }

  .dialog-footer {
    display: flex;
    gap: 1rem;
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .cancel-btn,
  .save-btn {
    flex: 1;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-btn {
    background: #f3f4f6;
    color: #1a1a1a;
  }

  .cancel-btn:hover {
    background: #e5e7eb;
  }

  .save-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .save-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Dark mode */
  .dialog-backdrop[data-theme='dark'] .dialog {
    background: #1a2332;
  }

  .dialog-backdrop[data-theme='dark'] .dialog-header {
    border-color: #2d3748;
  }

  .dialog-backdrop[data-theme='dark'] .dialog-header h2 {
    color: #e1e8ed;
  }

  .dialog-backdrop[data-theme='dark'] .close-btn {
    color: #6b7280;
  }

  .dialog-backdrop[data-theme='dark'] .close-btn:hover {
    color: #e1e8ed;
  }

  .dialog-backdrop[data-theme='dark'] .match-info {
    background: #0f1419;
  }

  .dialog-backdrop[data-theme='dark'] .participant-name {
    color: #e1e8ed;
  }

  .dialog-backdrop[data-theme='dark'] .vs {
    background: #2d3748;
  }

  .dialog-backdrop[data-theme='dark'] .table-info,
  .dialog-backdrop[data-theme='dark'] .mode-info {
    color: #8b9bb3;
  }

  .dialog-backdrop[data-theme='dark'] .rounds-table {
    background: #1a2332;
    border-color: #2d3748;
  }

  .dialog-backdrop[data-theme='dark'] .rounds-table td {
    border-color: #2d3748;
  }

  .dialog-backdrop[data-theme='dark'] .player-row td {
    background: #0f1419;
  }

  .dialog-backdrop[data-theme='dark'] .player-name {
    color: #e1e8ed;
  }

  .dialog-backdrop[data-theme='dark'] .point-btn {
    background: #0f1419;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .dialog-backdrop[data-theme='dark'] .point-btn:hover {
    background: #2d3748;
    border-color: #4a5568;
  }

  .dialog-backdrop[data-theme='dark'] .point-btn.selected {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-color: #10b981;
    color: white;
  }

  .dialog-backdrop[data-theme='dark'] .twenties-input {
    background: rgba(251, 191, 36, 0.1);
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .dialog-backdrop[data-theme='dark'] .twenties-input:focus {
    border-color: #fbbf24;
  }

  .dialog-backdrop[data-theme='dark'] .total-cell {
    background: rgba(16, 185, 129, 0.15) !important;
  }

  .dialog-backdrop[data-theme='dark'] .total-value {
    color: #10b981;
  }

  .dialog-backdrop[data-theme='dark'] .games-won {
    color: #8b9bb3;
  }

  .dialog-backdrop[data-theme='dark'] .noshow-section {
    border-color: #2d3748;
  }

  .dialog-backdrop[data-theme='dark'] .noshow-section h3 {
    color: #e1e8ed;
  }

  .dialog-backdrop[data-theme='dark'] .dialog-footer {
    border-color: #2d3748;
  }

  .dialog-backdrop[data-theme='dark'] .cancel-btn {
    background: #0f1419;
    color: #e1e8ed;
  }

  .dialog-backdrop[data-theme='dark'] .cancel-btn:hover {
    background: #2d3748;
  }

  /* Dark mode for Points Mode elements */
  .dialog-backdrop[data-theme='dark'] .round-num {
    color: #8b9bb3;
  }

  .dialog-backdrop[data-theme='dark'] .game-complete-notice {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .dialog-backdrop[data-theme='dark'] .match-complete-notice {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }

  .dialog-backdrop[data-theme='dark'] .match-stats {
    border-top-color: rgba(251, 191, 36, 0.2);
  }

  .dialog-backdrop[data-theme='dark'] .match-score-summary {
    color: #fbbf24;
  }

  .dialog-backdrop[data-theme='dark'] .completed-game {
    background: rgba(31, 41, 55, 0.5);
    border-color: rgba(251, 191, 36, 0.2);
  }

  .dialog-backdrop[data-theme='dark'] .completed-game-header {
    border-bottom-color: rgba(251, 191, 36, 0.3);
  }

  .dialog-backdrop[data-theme='dark'] .game-title {
    color: #fbbf24;
  }

  .dialog-backdrop[data-theme='dark'] .game-winner {
    color: #10b981;
  }

  .dialog-backdrop[data-theme='dark'] .round-cell.readonly,
  .dialog-backdrop[data-theme='dark'] .total-cell.readonly {
    background: rgba(55, 65, 81, 0.5);
    color: #d1d5db;
  }

  .dialog-backdrop[data-theme='dark'] .total-cell.readonly {
    background: rgba(75, 85, 99, 0.5);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .dialog {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .dialog-header,
    .dialog-content,
    .dialog-footer {
      padding: 1rem;
    }

    .rounds-table th,
    .rounds-table td {
      padding: 0.4rem 0.2rem;
      font-size: 0.85rem;
    }

    .rounds-table th.sub-col {
      font-size: 0.7rem;
      padding: 0.3rem 0.15rem;
    }

    .rounds-table th.player-col,
    .player-name {
      min-width: 80px;
      font-size: 0.8rem;
      padding-left: 0.5rem !important;
    }

    .round-cell.points-cell {
      min-width: 35px;
      max-width: 45px;
    }

    .round-cell.twenties-cell {
      min-width: 30px;
      max-width: 40px;
    }

    .point-btn {
      padding: 0.2rem 0.3rem;
      font-size: 0.75rem;
      min-width: 22px;
    }

    .twenties-input {
      max-width: 38px;
      font-size: 0.85rem;
      padding: 0.35rem 0.15rem;
    }

    .total-value {
      font-size: 1.1rem;
    }

    .games-won {
      font-size: 0.7rem;
    }

    .noshow-buttons {
      flex-direction: column;
    }

    .dialog-footer {
      flex-direction: column;
    }
  }
</style>
