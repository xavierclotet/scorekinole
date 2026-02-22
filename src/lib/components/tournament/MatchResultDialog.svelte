<script lang="ts">
  import type { GroupMatch, TournamentParticipant, Tournament } from '$lib/types/tournament';
  import * as m from '$lib/paraglide/messages.js';
  import { adminTheme } from '$lib/stores/theme';
  import { getPhaseConfig } from '$lib/utils/bracketPhaseConfig';
  import { extractYouTubeId } from '$lib/utils/youtube';

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
      videoUrl?: string;
      videoId?: string;
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
    ondisqualify?: (participantId: string, participantName: string) => void;
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
    onnoshow,
    ondisqualify
  }: Props = $props();

  // Participant info
  let participantMap = $derived(new Map(participants.map(p => [p.id, p])));
  let participantA = $derived(participantMap.get(match.participantA));
  let participantB = $derived(participantMap.get(match.participantB));
  let isBye = $derived(match.participantB === 'BYE');

  // Helper to get display name for doubles (teamName or "Player1 / Player2")
  function getDisplayName(participant: TournamentParticipant | undefined): string {
    if (!participant) return 'Unknown';
    if (participant.partner) {
      return participant.teamName || `${participant.name} / ${participant.partner.name}`;
    }
    return participant.name;
  }

  // Display names for the participants
  let nameA = $derived(getDisplayName(participantA));
  let nameB = $derived(isBye ? 'BYE' : getDisplayName(participantB));

  // Check if participants are disqualified
  let isDisqualifiedA = $derived(participantA?.status === 'DISQUALIFIED');
  let isDisqualifiedB = $derived(participantB?.status === 'DISQUALIFIED');
  let hasDisqualified = $derived(isDisqualifiedA || isDisqualifiedB);

  // Game mode - use phase-specific config if in bracket, otherwise use group stage config
  // Note: config is inside goldBracket or silverBracket, not directly in finalStage
  let activeBracket = $derived(
    bracketIsSilver
      ? tournament.finalStage?.silverBracket
      : tournament.finalStage?.goldBracket
  );

  let gameConfig = $derived(isBracket && activeBracket
    ? getPhaseConfig(
        activeBracket,
        bracketRoundNumber,
        bracketTotalRounds,
        bracketIsThirdPlace
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

  // Video attachment
  let videoUrl = $state('');
  let videoId = $derived(extractYouTubeId(videoUrl));

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

      if (hasSavedRounds && match.rounds) {
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

      // Load video URL if exists
      videoUrl = match.videoUrl || '';

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
      videoUrl = '';
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
  // Calculate rounds won directly to avoid $effect sync issues
  let roundsWonAForTiebreak = $derived(rounds.filter(r => r.pointsA !== null && r.pointsB !== null && r.pointsA > r.pointsB).length);
  let roundsWonBForTiebreak = $derived(rounds.filter(r => r.pointsA !== null && r.pointsB !== null && r.pointsB > r.pointsA).length);
  let isBracketTiebreak = $derived(isBracket && isRoundsMode && allBaseRoundsComplete && roundsWonAForTiebreak === roundsWonBForTiebreak);
  let needsExtraRound = $derived(isBracketTiebreak && rounds.every(r => r.pointsA !== null && r.pointsB !== null));

  // Validation - canSave derived from current state
  let canSave = $derived((() => {
    if (isBracket && !isRoundsMode) {
      // Points mode (bracket): Match must be complete (someone won enough games)
      const requiredWins = gameConfig.matchesToWin;
      return gamesWonA >= requiredWins || gamesWonB >= requiredWins;
    } else if (isRoundsMode) {
      // Rounds mode: All rounds must be complete
      const allRoundsPlayed = rounds.every(r => r.pointsA !== null && r.pointsB !== null);
      if (isBracket) {
        // Bracket in rounds mode: no ties allowed - must have a winner
        // Calculate rounds won directly here to avoid $effect sync issues
        const roundsWonA = rounds.filter(r => r.pointsA !== null && r.pointsB !== null && r.pointsA > r.pointsB).length;
        const roundsWonB = rounds.filter(r => r.pointsA !== null && r.pointsB !== null && r.pointsB > r.pointsA).length;
        return allRoundsPlayed && roundsWonA !== roundsWonB;
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

  // Admin force finish: allow saving when someone is winning but match isn't complete
  let hasPartialWinner = $derived((() => {
    if (!hasAnyResult) return false;
    // Check if someone has more points
    if (totalPointsA !== totalPointsB) return true;
    // Or more rounds won
    const roundsWonA = rounds.filter(r => r.pointsA !== null && r.pointsB !== null && r.pointsA > r.pointsB).length;
    const roundsWonB = rounds.filter(r => r.pointsA !== null && r.pointsB !== null && r.pointsB > r.pointsA).length;
    return roundsWonA !== roundsWonB;
  })());

  // Can force finish: admin only, has partial winner, and can't save normally
  let canForceFinish = $derived(isAdmin && hasPartialWinner && !canSave);

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
    const requiredWins = gameConfig.matchesToWin;
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
    if (!canSave && !canForceFinish) return;

    // Compute aggregate totals across all games
    const result: {
      gamesWonA: number;
      gamesWonB: number;
      totalPointsA?: number;
      totalPointsB?: number;
      total20sA?: number;
      total20sB?: number;
      videoUrl?: string;
      videoId?: string;
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

    // Include video if valid
    if (videoUrl && videoId) {
      result.videoUrl = videoUrl.trim();
      result.videoId = videoId;
    }

    // Include round-by-round data
    // - For bracket points mode: save rounds with game tracking
    // - For groups/bracket rounds mode: save rounds for editing later
    if (rounds.length > 0) {
      result.rounds = rounds;
    }

    onsave?.(result);
  }

  function handleNoShow(participantId: string) {
    onnoshow?.(participantId);
  }

  function handleDisqualify(participantId: string, participantName: string) {
    ondisqualify?.(participantId, participantName);
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
    <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-left">
          <div class="header-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20V10"/>
              <path d="M18 20V4"/>
              <path d="M6 20v-4"/>
            </svg>
          </div>
          <div class="header-title">
            <h2>{m.tournament_matchResult()}</h2>
            {#if isAdmin && isMatchCompleted}
              <span class="admin-edit-badge">{m.tournament_adminEditing()}</span>
            {/if}
          </div>
        </div>
        <button class="close-btn" onclick={handleClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="dialog-content">
        <!-- Match Card -->
        <div class="match-card">
          <div class="match-participants">
            <div class="participant participant-a">
              <div class="participant-label">A</div>
              <span class="participant-name">{nameA || 'Unknown'}</span>
            </div>
            <div class="match-center">
              <div class="vs-circle">
                <span>VS</span>
              </div>
              {#if match.tableNumber}
                <span class="table-badge">{m.tournament_tableShort()} {match.tableNumber}</span>
              {/if}
            </div>
            <div class="participant participant-b">
              <div class="participant-label">B</div>
              <span class="participant-name">{nameB}</span>
            </div>
          </div>
          <div class="match-meta">
            {#if isRoundsMode}
              <span class="format-badge">{m.tournament_nRounds({ n: String(numRounds) })}</span>
            {:else}
              <span class="format-badge">{m.tournament_bestOf({ games: String(gameConfig.matchesToWin) })}</span>
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

            <div class="match-complete-banner">
              <span class="banner-icon">🏆</span>
              <span class="banner-text">{m.tournament_matchCompletedWinner({ name: gamesWonA > gamesWonB ? nameA || '' : nameB || '' })}</span>
              <span class="banner-score">{gamesWonA} - {gamesWonB}</span>
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
                      {m.tournament_winnerLabel({ name: gamePointsA > gamePointsB ? nameA || '' : nameB || '' })} ({gamePointsA}-{gamePointsB})
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
                          <td class="player-name">{nameA}</td>
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
                          <td class="player-name">{nameB}</td>
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
                    <span class="stat-value">{nameA} {displayTotalA} - {displayTotalB} {nameB}</span>
                  </div>
                  {#if tournament.show20s}
                    <div class="stat-row">
                      <span class="stat-label">{m.tournament_totalTwentiesLabel()}</span>
                      <span class="stat-value">{nameA} {display20sA} - {display20sB} {nameB}</span>
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
                    {m.tournament_winnerLabel({ name: gamePointsA > gamePointsB ? nameA || '' : nameB || '' })} ({gamePointsA}-{gamePointsB})
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
                        <td class="player-name">{nameA}</td>
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
                        <td class="player-name">{nameB}</td>
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
                    <td class="player-name">{nameA}</td>
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
                    <td class="player-name">{nameB}</td>
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
                  {m.tournament_gameCompletedNotice({ n: String(currentGameNumber) })}
                  <div class="game-result">
                    {currentPointsA > currentPointsB ? nameA : nameB} {m.tournament_wins()} {Math.max(currentPointsA, currentPointsB)}-{Math.min(currentPointsA, currentPointsB)}
                  </div>
                </div>

                {@const requiredWins = gameConfig.matchesToWin}
                {#if gamesWonA < requiredWins && gamesWonB < requiredWins}
                  <button class="next-game-btn" onclick={startNextGame} type="button">
                    {m.tournament_startGameN({ n: String(currentGameNumber + 1) })}
                  </button>
                {:else}
                  <div class="match-complete-banner">
                    <span class="banner-icon">🏆</span>
                    <span class="banner-text">{m.tournament_matchCompleteWinner({ name: gamesWonA > gamesWonB ? nameA || '' : nameB || '' })}</span>
                    <span class="banner-score">{gamesWonA} - {gamesWonB}</span>
                  </div>
                {/if}
              {/if}

              <!-- No-show section (only show if no results have been entered) - Points Mode -->
              {#if !hasAnyResult}
                <div class="noshow-section">
                  <div class="noshow-header">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <span>{m.tournament_noShowLabel()}</span>
                  </div>
                  <div class="noshow-buttons">
                    <button class="noshow-btn" onclick={() => handleNoShow(match.participantA)}>
                      <span class="noshow-name">{nameA || ''}</span>
                      <span class="noshow-label">{m.tournament_didNotShowUp({ name: '' })}</span>
                    </button>
                    <button class="noshow-btn" onclick={() => handleNoShow(match.participantB)}>
                      <span class="noshow-name">{nameB || ''}</span>
                      <span class="noshow-label">{m.tournament_didNotShowUp({ name: '' })}</span>
                    </button>
                  </div>
                </div>
              {/if}

              <!-- Disqualify section (admin only) - Points Mode -->
              {#if isAdmin && ondisqualify}
                <div class="disqualify-section" class:has-disqualified={hasDisqualified}>
                  <div class="disqualify-header">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                    <span>{m.admin_disqualify()}</span>
                  </div>
                  <div class="disqualify-buttons">
                    <button
                      class="disqualify-btn"
                      class:already-disqualified={isDisqualifiedA}
                      onclick={() => handleDisqualify(match.participantA, nameA)}
                      disabled={isDisqualifiedA}
                    >
                      <span class="disqualify-name">{nameA || ''}</span>
                      {#if isDisqualifiedA}
                        <span class="disqualified-label">{m.admin_disqualified()}</span>
                      {/if}
                    </button>
                    <button
                      class="disqualify-btn"
                      class:already-disqualified={isDisqualifiedB}
                      onclick={() => handleDisqualify(match.participantB, nameB)}
                      disabled={isDisqualifiedB}
                    >
                      <span class="disqualify-name">{nameB || ''}</span>
                      {#if isDisqualifiedB}
                        <span class="disqualified-label">{m.admin_disqualified()}</span>
                      {/if}
                    </button>
                  </div>
                </div>
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

            <div class="match-complete-banner">
              <span class="banner-icon">🏆</span>
              <span class="banner-text">{m.tournament_matchCompletedWinner({ name: match.winner === match.participantA ? nameA || '' : nameB || '' })}</span>
              <span class="banner-score">{displayTotalA} - {displayTotalB}</span>
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
                      <td class="player-name">{nameA}</td>
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
                      <td class="player-name">{nameB}</td>
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
                    <span class="stat-value">{nameA} {displayTotalA} - {displayTotalB} {nameB}</span>
                  </div>
                  {#if tournament.show20s}
                    <div class="stat-row">
                      <span class="stat-label">{m.tournament_totalTwentiesLabel()}</span>
                      <span class="stat-value">{nameA} {display20sA} - {display20sB} {nameB}</span>
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
                    <td class="player-name">{nameA}</td>
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
                    <td class="player-name">{nameB}</td>
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
                <div class="tiebreak-content">
                  <div class="tiebreak-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 3v18M3 12h18"/>
                    </svg>
                  </div>
                  <div class="tiebreak-text">
                    <span class="tiebreak-title">{m.tournament_tiebreakNeeded()}</span>
                    <span class="tiebreak-score">{nameA} {gamesWonA} - {gamesWonB} {nameB}</span>
                  </div>
                </div>
                <button class="extra-round-btn" onclick={addExtraRound} type="button">
                  {m.tournament_addExtraRound()} (R{rounds.length + 1})
                </button>
              </div>
            {:else if isRoundsMode && !canSave && (totalPointsA > 0 || totalPointsB > 0)}
              <!-- Validation messages (only for rounds mode) -->
              <div class="validation-message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4M12 16h.01"/>
                </svg>
                <span>
                  {#if isBracket && gamesWonA === gamesWonB}
                    {m.tournament_tiesNotAllowedInElimination()}
                  {:else}
                    {m.tournament_mustCompleteAllRounds()}
                  {/if}
                </span>
              </div>
            {/if}

            <!-- No-show section (only show if no results have been entered) -->
            {#if !hasAnyResult}
              <div class="noshow-section">
                <div class="noshow-header">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span>{m.tournament_noShowLabel()}</span>
                </div>
                <div class="noshow-buttons">
                  <button class="noshow-btn" onclick={() => handleNoShow(match.participantA)}>
                    <span class="noshow-name">{nameA || ''}</span>
                    <span class="noshow-label">{m.tournament_didNotShowUp({ name: '' })}</span>
                  </button>
                  <button class="noshow-btn" onclick={() => handleNoShow(match.participantB)}>
                    <span class="noshow-name">{nameB || ''}</span>
                    <span class="noshow-label">{m.tournament_didNotShowUp({ name: '' })}</span>
                  </button>
                </div>
              </div>
            {/if}

            <!-- Disqualify section (admin only) -->
            {#if isAdmin && ondisqualify}
              <div class="disqualify-section" class:has-disqualified={hasDisqualified}>
                <div class="disqualify-header">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                  <span>{m.admin_disqualify()}</span>
                </div>
                <div class="disqualify-buttons">
                  <button
                    class="disqualify-btn"
                    class:already-disqualified={isDisqualifiedA}
                    onclick={() => handleDisqualify(match.participantA, nameA)}
                    disabled={isDisqualifiedA}
                  >
                    <span class="disqualify-name">{nameA || ''}</span>
                    {#if isDisqualifiedA}
                      <span class="disqualified-label">{m.admin_disqualified()}</span>
                    {/if}
                  </button>
                  <button
                    class="disqualify-btn"
                    class:already-disqualified={isDisqualifiedB}
                    onclick={() => handleDisqualify(match.participantB, nameB)}
                    disabled={isDisqualifiedB}
                  >
                    <span class="disqualify-name">{nameB || ''}</span>
                    {#if isDisqualifiedB}
                      <span class="disqualified-label">{m.admin_disqualified()}</span>
                    {/if}
                  </button>
                </div>
              </div>
            {/if}
          {/if}
        {/if}


      </div>

      {#if canEdit}
        <div class="dialog-footer">
          <button class="btn btn-secondary" onclick={handleClose}>
            {m.common_cancel()}
          </button>
          {#if !isBye}
            {#if canForceFinish}
              <button class="btn btn-warning" onclick={handleSave} title={m.tournament_forceFinishTooltip()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                {m.tournament_forceFinish()}
              </button>
            {/if}
            <button class="btn btn-primary" onclick={handleSave} disabled={!canSave}>
              {#if canSave}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              {/if}
              {isAdmin && isMatchCompleted ? m.tournament_updateResult() : m.common_save()}
            </button>
          {/if}
        </div>
      {:else}
        <div class="dialog-footer">
          <button class="btn btn-secondary" onclick={handleClose}>
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
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .dialog {
    background: #fff;
    border-radius: 20px;
    max-width: 900px;
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 25px 60px -12px rgba(0, 0, 0, 0.25),
      0 0 0 1px rgba(0, 0, 0, 0.03);
    overflow: hidden;
  }

  /* ── Header ─────────────────────────────────── */
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.125rem 1.5rem;
    background: var(--primary);
    color: white;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .header-icon svg {
    width: 18px;
    height: 18px;
    color: white;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    color: white;
    letter-spacing: -0.02em;
  }

  .admin-edit-badge {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.1875rem 0.5rem;
    border-radius: 6px;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn svg {
    width: 16px;
    height: 16px;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    color: white;
  }

  .dialog-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  /* ── Match Card ─────────────────────────────── */
  .match-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .match-participants {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1rem;
  }

  .participant {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .participant-a {
    text-align: left;
    justify-content: flex-start;
  }

  .participant-b {
    text-align: right;
    flex-direction: row-reverse;
  }

  .participant-label {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6875rem;
    font-weight: 800;
    flex-shrink: 0;
    letter-spacing: 0.02em;
  }

  .participant-a .participant-label {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
  }

  .participant-b .participant-label {
    background: rgba(239, 68, 68, 0.1);
    color: #dc2626;
  }

  .participant-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  .match-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .vs-circle {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: white;
    border: 2px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .vs-circle span {
    font-size: 0.625rem;
    font-weight: 800;
    color: #94a3b8;
    letter-spacing: 0.08em;
  }

  .table-badge {
    font-size: 0.625rem;
    font-weight: 500;
    color: #94a3b8;
  }

  .match-meta {
    display: flex;
    justify-content: center;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e2e8f0;
  }

  .format-badge {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #64748b;
    background: white;
    padding: 0.3125rem 0.875rem;
    border-radius: 100px;
    border: 1px solid #e2e8f0;
  }

  .bye-notice {
    background: #fefce8;
    color: #854d0e;
    padding: 1.125rem 1.5rem;
    border-radius: 12px;
    border: 1px solid #fde68a;
    text-align: center;
    font-weight: 600;
    font-size: 0.9375rem;
  }

  /* ── Match Complete Banner (compact) ────────── */
  .match-complete-banner {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    border-radius: 12px;
    margin-bottom: 1rem;
  }

  .banner-icon {
    font-size: 1.25rem;
    line-height: 1;
  }

  .banner-text {
    font-size: 0.875rem;
    font-weight: 700;
    color: #78350f;
    flex: 1;
  }

  .banner-score {
    font-size: 1.125rem;
    font-weight: 800;
    color: #92400e;
    letter-spacing: -0.02em;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .match-complete-banner {
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(251, 191, 36, 0.06));
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .banner-text {
    color: #fbbf24;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .banner-score {
    color: #fcd34d;
  }

  /* ── Rounds Table ───────────────────────────── */
  .rounds-table-container {
    overflow-x: auto;
    margin-bottom: 1.25rem;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }

  .rounds-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
  }

  .rounds-table th {
    background: #1e293b;
    color: white;
    padding: 0.625rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .rounds-table th.player-col {
    text-align: left;
    padding-left: 1rem;
    min-width: 120px;
    text-transform: none;
    letter-spacing: normal;
  }

  .rounds-table th.round-col {
    min-width: 70px;
  }

  .rounds-table th.sub-col {
    font-size: 0.6875rem;
    padding: 0.375rem 0.25rem;
    background: #334155;
  }

  .rounds-table th.sub-col.points-col {
    min-width: 45px;
  }

  .rounds-table th.sub-col.twenties-col {
    min-width: 40px;
    background: #44403c;
  }

  .rounds-table th.total-col {
    background: #059669;
    min-width: 100px;
  }

  .rounds-table td {
    padding: 0.5rem;
    border-bottom: 1px solid #f1f5f9;
  }

  .player-row td {
    background: white;
  }

  .player-row:nth-child(2) td {
    background: #fafbfc;
  }

  .player-row:last-child td {
    border-bottom: none;
  }

  .player-name {
    font-weight: 700;
    color: #0f172a;
    padding-left: 1rem !important;
    font-size: 0.875rem;
  }

  .round-cell {
    text-align: center;
    padding: 0.3125rem !important;
  }

  .round-cell.points-cell {
    min-width: 45px;
    max-width: 60px;
  }

  .round-cell.twenties-cell {
    min-width: 40px;
    max-width: 50px;
    background: #fffbeb !important;
  }

  .points-selector {
    display: flex;
    gap: 3px;
    justify-content: center;
    align-items: center;
  }

  .point-btn {
    width: 30px;
    height: 30px;
    padding: 0;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 800;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.12s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .point-btn:hover {
    border-color: #cbd5e1;
    color: #64748b;
    background: #f8fafc;
  }

  .point-btn.selected {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 35%, transparent);
    transform: scale(1.1);
  }

  .twenties-input {
    width: 100%;
    max-width: 44px;
    padding: 0.375rem 0.25rem;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 0.9375rem;
    font-weight: 700;
    text-align: center;
    color: #0f172a;
    background: white;
    transition: all 0.15s ease;
  }

  .twenties-input:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
  }

  .total-cell {
    text-align: center;
    background: #ecfdf5 !important;
    font-weight: 700;
  }

  .total-value {
    font-size: 1.25rem;
    color: #059669;
    font-weight: 800;
  }

  .total-value.total-twenties {
    color: #d97706;
  }

  .games-won {
    display: block;
    font-size: 0.6875rem;
    color: #94a3b8;
    font-weight: 600;
    margin-top: 2px;
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
    background: #f8fafc;
  }

  .total-cell.readonly {
    background: #ecfdf5;
    font-weight: 700;
    color: #059669;
  }

  /* ── Game Actions ───────────────────────────── */
  .game-actions {
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    align-items: center;
  }

  .add-round-btn {
    padding: 0.75rem 2rem;
    background: #059669;
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 0.9375rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(5, 150, 105, 0.2);
  }

  .add-round-btn:hover {
    background: #047857;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 6px 16px rgba(5, 150, 105, 0.3);
    transform: translateY(-1px);
  }

  .add-round-btn:active {
    transform: translateY(0);
  }

  .game-complete-notice {
    background: #ecfdf5;
    color: #065f46;
    padding: 1rem 1.5rem;
    border-radius: 12px;
    text-align: center;
    font-weight: 700;
    font-size: 0.9375rem;
    border: 1px solid #a7f3d0;
    width: 100%;
  }

  .game-result {
    margin-top: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
    opacity: 0.85;
  }

  .next-game-btn {
    padding: 0.75rem 2rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 0.9375rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 4px 12px color-mix(in srgb, var(--primary) 25%, transparent);
  }

  .next-game-btn:hover {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 6px 16px color-mix(in srgb, var(--primary) 35%, transparent);
    transform: translateY(-1px);
  }

  .next-game-btn:active {
    transform: translateY(0);
  }

  .match-complete-notice {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #78350f;
    padding: 1.5rem;
    border-radius: 14px;
    text-align: center;
    width: 100%;
  }

  .match-winner {
    font-weight: 800;
    font-size: 1.125rem;
    margin-bottom: 0.75rem;
  }

  .match-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(120, 53, 15, 0.15);
  }

  .stat-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: center;
  }

  .stat-label {
    font-size: 0.8125rem;
    font-weight: 600;
    opacity: 0.7;
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 700;
  }

  .match-score-summary {
    font-size: 1.25rem;
    font-weight: 800;
    color: #78350f;
    margin-top: 0.375rem;
  }

  /* Summary only notice */
  .summary-only-notice {
    background: #f8fafc;
    border-radius: 14px;
    padding: 1.5rem;
    text-align: center;
    margin-top: 1rem;
    border: 1px solid #e2e8f0;
  }

  .summary-only-notice p {
    color: #64748b;
    font-size: 0.875rem;
    margin: 0 0 1rem 0;
  }

  .summary-only-notice .summary-stats {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .summary-only-notice .stat-row {
    background: white;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    border: 1px solid #f1f5f9;
  }

  /* ── Completed Game Display ─────────────────── */
  .completed-game {
    margin: 1.25rem 0;
    padding: 1rem;
    background: #f8fafc;
    border-radius: 14px;
    border: 1px solid #e2e8f0;
  }

  .current-game-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--primary) 8%, white);
    border: 1px solid color-mix(in srgb, var(--primary) 15%, transparent);
    border-radius: 12px;
    margin-bottom: 0.75rem;
  }

  .current-game-header .game-title {
    font-weight: 700;
    color: var(--primary);
    font-size: 0.9375rem;
  }

  .current-game-header .current-score {
    font-weight: 800;
    font-size: 1.125rem;
    color: #0f172a;
  }

  .current-game-header .games-score {
    color: #94a3b8;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .completed-game-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.875rem;
    padding-bottom: 0.625rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .game-title {
    font-size: 0.9375rem;
    font-weight: 700;
    color: #374151;
  }

  .game-winner {
    font-size: 0.75rem;
    font-weight: 700;
    color: #059669;
    background: #ecfdf5;
    padding: 0.25rem 0.75rem;
    border-radius: 100px;
    border: 1px solid #a7f3d0;
  }

  /* ── Validation Message ─────────────────────── */
  .validation-message {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin: 0.75rem 0;
    padding: 0.625rem 1rem;
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
    border-radius: 10px;
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .validation-message svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  /* ── Tiebreak Section ───────────────────────── */
  .tiebreak-section {
    margin: 1rem 0;
    padding: 0.875rem 1rem;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .tiebreak-content {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .tiebreak-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background: #fef3c7;
    border-radius: 10px;
    color: #b45309;
    flex-shrink: 0;
  }

  .tiebreak-icon svg {
    width: 18px;
    height: 18px;
  }

  .tiebreak-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .tiebreak-title {
    font-size: 0.8125rem;
    font-weight: 700;
    color: #92400e;
    line-height: 1.3;
  }

  .tiebreak-score {
    font-size: 0.75rem;
    font-weight: 500;
    color: #a16207;
  }

  .extra-round-btn {
    padding: 0.5rem 1rem;
    background: #f59e0b;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 0.8125rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .extra-round-btn:hover {
    background: #d97706;
    transform: translateY(-1px);
  }

  /* ── No-show Section ────────────────────────── */
  .noshow-section {
    margin-top: 1.25rem;
    padding: 0.875rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
  }

  .noshow-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.625rem;
    font-size: 0.6875rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .noshow-header svg {
    width: 14px;
    height: 14px;
    color: #94a3b8;
  }

  .noshow-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .noshow-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.625rem 0.75rem;
    background: white;
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .noshow-btn:hover {
    background: #fef9c3;
    border-color: #fcd34d;
    transform: translateY(-1px);
  }

  .noshow-name {
    font-size: 0.8125rem;
    font-weight: 700;
    color: #1e293b;
  }

  .noshow-label {
    font-size: 0.5625rem;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── Disqualify Section ─────────────────────── */
  .disqualify-section {
    margin-top: 1rem;
    padding: 0.875rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 14px;
  }

  .disqualify-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.625rem;
    font-size: 0.6875rem;
    font-weight: 700;
    color: #dc2626;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .disqualify-header svg {
    width: 14px;
    height: 14px;
    color: #dc2626;
  }

  .disqualify-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .disqualify-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.625rem 0.75rem;
    background: white;
    border: 1.5px solid #fecaca;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .disqualify-btn:hover:not(:disabled) {
    background: #fee2e2;
    border-color: #f87171;
    transform: translateY(-1px);
  }

  .disqualify-btn:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .disqualify-btn.already-disqualified {
    background: #fef2f2;
    border-color: #dc2626;
    border-style: dashed;
  }

  .disqualified-label {
    font-size: 0.5625rem;
    font-weight: 700;
    color: #dc2626;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .disqualify-name {
    font-size: 0.8125rem;
    font-weight: 700;
    color: #b91c1c;
  }

  /* ── Footer ─────────────────────────────────── */
  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #f1f5f9;
    background: #fafbfc;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5625rem 1.25rem;
    border: none;
    border-radius: 10px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .btn-secondary {
    background: white;
    color: #475569;
    border: 1.5px solid #e2e8f0;
  }

  .btn-secondary:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .btn-primary {
    background: var(--primary);
    color: white;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent);
  }

  .btn-primary:hover:not(:disabled) {
    box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent);
    transform: translateY(-1px);
  }

  .btn-primary:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-primary:disabled {
    opacity: 0.45;
    box-shadow: none;
    cursor: not-allowed;
  }

  .btn-primary svg {
    width: 14px;
    height: 14px;
  }

  .btn-warning {
    background: #f59e0b;
    color: white;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
  }

  .btn-warning:hover {
    background: #d97706;
    transform: translateY(-1px);
  }

  .btn-warning svg {
    width: 14px;
    height: 14px;
  }

  /* ══════════════════════════════════════════════
     Dark Mode
     ══════════════════════════════════════════════ */
  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .dialog {
    background: #0f172a;
    box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.6);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .dialog-header {
    background: var(--primary);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .dialog-content {
    background: #0f172a;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .match-card {
    background: #1e293b;
    border-color: #334155;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .participant-name {
    color: #e2e8f0;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .participant-a .participant-label {
    background: color-mix(in srgb, var(--primary) 20%, transparent);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .participant-b .participant-label {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .vs-circle {
    background: #334155;
    border-color: #475569;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .vs-circle span {
    color: #64748b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .table-badge {
    color: #64748b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .match-meta {
    border-color: #334155;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .format-badge {
    background: #334155;
    border-color: #475569;
    color: #94a3b8;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .rounds-table-container {
    border-color: #334155;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .rounds-table {
    background: #1e293b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .rounds-table th {
    background: #0f172a;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .rounds-table th.sub-col {
    background: #1a2332;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .rounds-table th.sub-col.twenties-col {
    background: #292524;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .rounds-table td {
    border-color: #1e293b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .player-row td {
    background: #1e293b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .player-row:nth-child(2) td {
    background: #172033;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .player-name {
    color: #e2e8f0;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .point-btn {
    background: #0f172a;
    border-color: #334155;
    color: #64748b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .point-btn:hover {
    background: #1e293b;
    border-color: #475569;
    color: #94a3b8;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .point-btn.selected {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .round-cell.twenties-cell {
    background: rgba(251, 191, 36, 0.05) !important;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .twenties-input {
    background: #0f172a;
    border-color: #334155;
    color: #e2e8f0;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .twenties-input:focus {
    border-color: #f59e0b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .total-cell {
    background: rgba(5, 150, 105, 0.1) !important;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .total-value {
    color: #34d399;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .games-won {
    color: #64748b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .round-cell.readonly,
  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .total-cell.readonly {
    background: #1e293b;
    color: #cbd5e1;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .total-cell.readonly {
    background: rgba(5, 150, 105, 0.08);
    color: #34d399;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .current-game-header {
    background: color-mix(in srgb, var(--primary) 12%, #0f172a);
    border-color: color-mix(in srgb, var(--primary) 25%, transparent);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .current-game-header .game-title {
    color: color-mix(in srgb, var(--primary) 60%, white);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .current-game-header .current-score {
    color: #e2e8f0;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .completed-game {
    background: #1e293b;
    border-color: #334155;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .completed-game-header {
    border-bottom-color: #334155;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .game-title {
    color: #e2e8f0;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .game-winner {
    color: #34d399;
    background: rgba(5, 150, 105, 0.1);
    border-color: rgba(5, 150, 105, 0.2);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .game-complete-notice {
    background: rgba(5, 150, 105, 0.12);
    color: #34d399;
    border-color: rgba(5, 150, 105, 0.2);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .match-complete-notice {
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(251, 191, 36, 0.06));
    color: #fbbf24;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .match-stats {
    border-top-color: rgba(251, 191, 36, 0.15);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .match-score-summary {
    color: #fbbf24;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .summary-only-notice {
    background: #1e293b;
    border-color: #334155;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .summary-only-notice p {
    color: #94a3b8;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .summary-only-notice .stat-row {
    background: #0f172a;
    border-color: #334155;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .tiebreak-section {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.2);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .tiebreak-icon {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .tiebreak-title {
    color: #fbbf24;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .tiebreak-score {
    color: #fcd34d;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .validation-message {
    background: rgba(220, 38, 38, 0.08);
    border-color: rgba(248, 113, 113, 0.2);
    color: #fca5a5;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .noshow-section {
    background: #1e293b;
    border-color: #334155;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .noshow-header {
    color: #64748b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .noshow-header svg {
    color: #475569;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .noshow-btn {
    background: #0f172a;
    border-color: #334155;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .noshow-btn:hover {
    background: rgba(251, 191, 36, 0.08);
    border-color: rgba(251, 191, 36, 0.25);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .noshow-name {
    color: #e2e8f0;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .noshow-label {
    color: #475569;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .disqualify-section {
    background: rgba(185, 28, 28, 0.08);
    border-color: rgba(248, 113, 113, 0.2);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .disqualify-header {
    color: #f87171;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .disqualify-header svg {
    color: #f87171;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .disqualify-btn {
    background: #0f172a;
    border-color: rgba(248, 113, 113, 0.2);
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .disqualify-btn:hover:not(:disabled) {
    background: rgba(185, 28, 28, 0.15);
    border-color: #f87171;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .disqualify-name {
    color: #fca5a5;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .dialog-footer {
    background: #0f172a;
    border-color: #1e293b;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .btn-secondary {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .btn-secondary:hover {
    background: #334155;
    border-color: #475569;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .btn-primary:disabled {
    opacity: 0.3;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .btn-warning {
    background: #d97706;
  }

  .dialog-backdrop:is([data-theme='dark'], [data-theme='violet']) .btn-warning:hover {
    background: #b45309;
  }

  /* ══════════════════════════════════════════════
     Responsive
     ══════════════════════════════════════════════ */
  @media (max-width: 768px) {
    .dialog-backdrop {
      padding: 0;
    }

    .dialog {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .dialog-header {
      padding: 0.875rem 1rem;
    }

    .header-icon {
      width: 30px;
      height: 30px;
    }

    .dialog-content {
      padding: 1rem;
    }

    .dialog-footer {
      padding: 0.875rem 1rem;
    }

    .match-card {
      padding: 1rem;
      border-radius: 12px;
    }

    .rounds-table-container {
      border-radius: 10px;
    }

    .rounds-table th,
    .rounds-table td {
      padding: 0.375rem 0.2rem;
      font-size: 0.8125rem;
    }

    .rounds-table th.sub-col {
      font-size: 0.6875rem;
      padding: 0.3rem 0.15rem;
    }

    .rounds-table th.player-col,
    .player-name {
      min-width: 80px;
      font-size: 0.75rem;
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
      width: 24px;
      height: 24px;
      font-size: 0.75rem;
      border-radius: 6px;
    }

    .twenties-input {
      max-width: 38px;
      font-size: 0.8125rem;
      padding: 0.3125rem 0.15rem;
    }

    .total-value {
      font-size: 1.0625rem;
    }

    .games-won {
      font-size: 0.625rem;
    }

    .match-participants {
      grid-template-columns: 1fr;
      gap: 0.375rem;
      text-align: center;
    }

    .participant {
      justify-content: center;
    }

    .participant-a,
    .participant-b {
      text-align: center;
      flex-direction: row;
    }

    .match-center {
      order: -1;
      flex-direction: row;
      gap: 0.75rem;
    }

    .vs-circle {
      width: 32px;
      height: 32px;
    }

    .noshow-buttons,
    .disqualify-buttons {
      grid-template-columns: 1fr;
    }

    .dialog-footer {
      flex-direction: column-reverse;
    }

    .btn {
      width: 100%;
      justify-content: center;
      padding: 0.625rem 1rem;
    }
  }
</style>
