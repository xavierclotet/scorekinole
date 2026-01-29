<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import TournamentKeyBadge from '$lib/components/TournamentKeyBadge.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import MatchResultDialog from '$lib/components/tournament/MatchResultDialog.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import { getTournament, subscribeTournament } from '$lib/firebase/tournaments';
  import { completeMatch, markNoShow } from '$lib/firebase/tournamentSync';
  import {
    updateBracketMatch,
    advanceWinner,
    updateSilverBracketMatch,
    advanceSilverWinner,
    reassignTables,
    updateConsolationMatch,
    advanceConsolationWinner,
    forceRegenerateConsolationBrackets,
    completeFinalStage
  } from '$lib/firebase/tournamentBracket';
  import { isSuperAdmin } from '$lib/firebase/admin';
  import { getUserProfile } from '$lib/firebase/userProfile';
  import type { Tournament, BracketMatch, GroupMatch, ConsolationBracket } from '$lib/types/tournament';
  import { getPhaseConfig } from '$lib/utils/bracketPhaseConfig';
  import { isBye, isLoserPlaceholder, parseLoserPlaceholder } from '$lib/algorithms/bracket';
  import * as m from '$lib/paraglide/messages.js';
  import TimeProgressBar from '$lib/components/TimeProgressBar.svelte';
  import TimeBreakdownModal from '$lib/components/TimeBreakdownModal.svelte';
  import { calculateRemainingTime, calculateTimeBreakdown, calculateTournamentTimeEstimate, type TimeBreakdown } from '$lib/utils/tournamentTime';
  import { updateTournament } from '$lib/firebase/tournaments';

  let tournament = $state<Tournament | null>(null);
  let loading = $state(true);
  let error = $state(false);
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType = $state<'success' | 'error' | 'info' | 'warning'>('info');
  let showMatchDialog = $state(false);
  let selectedMatch = $state<BracketMatch | null>(null);
  let selectedBracketType = $state<'gold' | 'silver'>('gold');
  let selectedRoundNumber = $state<number>(1);
  let selectedIsThirdPlace = $state<boolean>(false);
  let isSuperAdminUser = $state(false);
  let canAutofillUser = $state(false);
  let isAutoFilling = $state(false);
  let isSavingMatch = $state(false);
  let unsubscribe: (() => void) | null = null;
  let showTimeBreakdown = $state(false);
  let timeBreakdown = $state<TimeBreakdown | null>(null);
  let isGeneratingConsolation = $state(false);

  // Current view for split divisions
  let activeTab = $state<'gold' | 'silver'>('gold');

  let tournamentId = $derived($page.params.id);
  let timeRemaining = $derived(tournament ? calculateRemainingTime(tournament) : null);
  let isSplitDivisions = $derived(tournament?.finalStage?.mode === 'SPLIT_DIVISIONS');

  // Gold bracket
  let goldBracket = $derived(tournament?.finalStage?.goldBracket);
  let goldRounds = $derived(goldBracket?.rounds || []);
  let goldThirdPlaceMatch = $derived(goldBracket?.thirdPlaceMatch);

  // Silver bracket
  let silverBracket = $derived(tournament?.finalStage?.silverBracket);
  let silverRounds = $derived(silverBracket?.rounds || []);
  let silverThirdPlaceMatch = $derived(silverBracket?.thirdPlaceMatch);

  // Active bracket based on tab
  let bracket = $derived(activeTab === 'gold' ? goldBracket : silverBracket);
  let rounds = $derived(activeTab === 'gold' ? goldRounds : silverRounds);
  let thirdPlaceMatch = $derived(activeTab === 'gold' ? goldThirdPlaceMatch : silverThirdPlaceMatch);

  // Consolation brackets
  let goldConsolationBrackets = $derived(goldBracket?.consolationBrackets || []);
  let silverConsolationBrackets = $derived(silverBracket?.consolationBrackets || []);
  let consolationBrackets = $derived(activeTab === 'gold' ? goldConsolationBrackets : silverConsolationBrackets);
  // Fallback for consolationEnabled - check multiple locations due to migration
  let consolationEnabledValue = $derived(tournament?.finalStage?.consolationEnabled
    ?? (tournament?.finalStage as Record<string, unknown>)?.['consolationEnabled ']  // Typo with trailing space
    ?? tournament?.finalStage?.goldBracket?.config?.consolationEnabled
    ?? false);
  let hasConsolation = $derived(consolationEnabledValue && consolationBrackets.length > 0);

  // Consolation match handling
  let selectedConsolationSource = $state<'QF' | 'R16' | null>(null);

  // View toggle: main bracket vs consolation bracket
  let bracketView = $state<'main' | 'consolation'>('main');

  // Helper function to get matchesToWin for a specific match based on its position
  // - bracketType: 'gold' | 'silver'
  // - roundIndex: 0-based index of the round
  // - totalRounds: total number of rounds in the bracket
  // - isConsolation: whether the match is in a consolation bracket
  // - isThirdPlace: whether the match is the 3rd place match
  function getMatchesToWinForMatch(
    bracketType: 'gold' | 'silver',
    roundIndex: number,
    totalRounds: number,
    isConsolation: boolean = false,
    isThirdPlace: boolean = false
  ): number {
    // Consolation matches are typically single game
    if (isConsolation) return 1;

    const bracket = bracketType === 'gold'
      ? tournament?.finalStage?.goldBracket
      : tournament?.finalStage?.silverBracket;
    const config = bracket?.config;
    if (!config) return 1;

    // Determine which phase this round belongs to
    // Final is the last round, semifinal is second to last, rest are earlyRounds
    if (isThirdPlace) {
      // 3rd place match uses semifinal config (same as semifinal phase)
      return config.semifinal?.matchesToWin || 1;
    } else if (roundIndex === totalRounds - 1) {
      // Final round
      return config.final?.matchesToWin || 1;
    } else if (roundIndex === totalRounds - 2 && totalRounds > 1) {
      // Semifinal round
      return config.semifinal?.matchesToWin || 1;
    } else {
      // Early rounds
      return config.earlyRounds?.matchesToWin || 1;
    }
  }

  // Global flag for backward compatibility (uses max of all configs)
  let matchesToWin = $derived((() => {
    const bracket = activeTab === 'gold'
      ? tournament?.finalStage?.goldBracket
      : tournament?.finalStage?.silverBracket;
    const config = bracket?.config;
    if (!config) return 1;
    return Math.max(
      config.earlyRounds?.matchesToWin || 1,
      config.semifinal?.matchesToWin || 1,
      config.final?.matchesToWin || 1
    );
  })());
  let showGamesWon = $derived(matchesToWin > 1);

  // Phase configuration editing
  let savingPhaseConfig = $state(false);
  let configExpanded = $state(false);

  // Table management
  let isReassigningTables = $state(false);
  let editingNumTables = $state(false);
  let tempNumTables = $state(4);

  let currentNumTables = $derived(tournament?.numTables || 4);

  function startEditingTables() {
    tempNumTables = currentNumTables;
    editingNumTables = true;
  }

  function cancelEditingTables() {
    editingNumTables = false;
  }

  async function saveNumTablesAndReassign() {
    if (!tournament || isReassigningTables) return;

    isReassigningTables = true;
    try {
      const result = await reassignTables(tournamentId, tempNumTables);
      if (result.success) {
        toastMessage = m.bracket_tablesAssigned({ count: String(result.tablesAssigned) });
        toastType = 'success';
        showToast = true;
        editingNumTables = false;
      } else {
        toastMessage = result.error || m.bracket_errorReassignTables();
        toastType = 'error';
        showToast = true;
      }
    } catch (err) {
      toastMessage = m.bracket_errorReassignTables();
      toastType = 'error';
      showToast = true;
    } finally {
      isReassigningTables = false;
    }
  }

  async function handleReassignTables() {
    if (!tournament || isReassigningTables) return;

    isReassigningTables = true;
    try {
      const result = await reassignTables(tournamentId);
      if (result.success) {
        toastMessage = m.bracket_tablesAssigned({ count: String(result.tablesAssigned) });
        toastType = 'success';
        showToast = true;
      } else {
        toastMessage = result.error || m.bracket_errorReassignTables();
        toastType = 'error';
        showToast = true;
      }
    } catch (err) {
      toastMessage = m.bracket_errorReassignTables();
      toastType = 'error';
      showToast = true;
    } finally {
      isReassigningTables = false;
    }
  }

  // Determine phase type from round name
  function getPhaseType(roundName: string): 'early' | 'semifinal' | 'final' {
    const name = roundName.toLowerCase();
    if (name.includes('final') && !name.includes('semi') && !name.includes('quarter') && !name.includes('cuarto')) {
      return 'final';
    }
    if (name.includes('semi')) {
      return 'semifinal';
    }
    return 'early';
  }

  // Check if any match in a round has started (IN_PROGRESS or COMPLETED) - excludes BYE matches
  function isRoundLocked(roundMatches: BracketMatch[]): boolean {
    return roundMatches.some(m => {
      // Skip BYE matches - they don't count as "started"
      if (isBye(m.participantA) || isBye(m.participantB)) return false;
      return m.status === 'IN_PROGRESS' || m.status === 'COMPLETED' || m.status === 'WALKOVER';
    });
  }

  // Get current config for a phase (for editing in the UI)
  function getPhaseEditConfig(phaseType: 'early' | 'semifinal' | 'final', isGold: boolean): { gameMode: 'points' | 'rounds'; value: number; matchesToWin: number } {
    const bracket = isGold ? tournament?.finalStage?.goldBracket : tournament?.finalStage?.silverBracket;
    const config = bracket?.config;

    if (!config) {
      // Defaults
      if (phaseType === 'final') return { gameMode: 'points', value: isGold ? 9 : 4, matchesToWin: 1 };
      if (phaseType === 'semifinal') return { gameMode: isGold ? 'points' : 'rounds', value: isGold ? 7 : 4, matchesToWin: 1 };
      return { gameMode: 'rounds', value: 4, matchesToWin: 1 };
    }

    const phaseConfig = phaseType === 'final' ? config.final
      : phaseType === 'semifinal' ? config.semifinal
      : config.earlyRounds;

    return {
      gameMode: phaseConfig.gameMode || 'points',
      value: phaseConfig.gameMode === 'rounds'
        ? (phaseConfig.roundsToPlay || 4)
        : (phaseConfig.pointsToWin || 7),
      matchesToWin: phaseConfig.matchesToWin || 1
    };
  }

  // Helper to parse game mode from select value
  function parseGameMode(value: string): 'points' | 'rounds' {
    return value === 'points' ? 'points' : 'rounds';
  }

  // Save phase configuration
  async function savePhaseConfig(phaseType: 'early' | 'semifinal' | 'final', isGold: boolean, gameMode: 'points' | 'rounds', value: number, matchesToWin: number) {
    if (!tournament || !tournamentId || !tournament.finalStage) return;

    savingPhaseConfig = true;
    try {
      const bracketKey = isGold ? 'goldBracket' : 'silverBracket';
      const bracket = tournament.finalStage[bracketKey];
      if (!bracket) return;

      // Build the new phase config
      const newPhaseConfig = {
        gameMode,
        ...(gameMode === 'points' ? { pointsToWin: value } : { roundsToPlay: value }),
        matchesToWin
      };

      // Get current bracket config or create defaults
      const currentConfig = bracket.config || {
        earlyRounds: { gameMode: 'rounds', roundsToPlay: 4, matchesToWin: 1 },
        semifinal: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
        final: { gameMode: 'points', pointsToWin: 9, matchesToWin: 1 }
      };

      // Update the specific phase
      const configKey = phaseType === 'final' ? 'final' : phaseType === 'semifinal' ? 'semifinal' : 'earlyRounds';
      const newConfig = {
        ...currentConfig,
        [configKey]: newPhaseConfig
      };

      // Build the update object
      const updates: any = {
        [`finalStage.${bracketKey}.config`]: newConfig
      };

      await updateTournament(tournamentId, updates);
      toastMessage = m.bracket_configurationSaved();
      toastType = 'success';
      showToast = true;
    } catch (err) {
      console.error('Error saving phase config:', err);
      toastMessage = m.bracket_configurationError();
      toastType = 'error';
      showToast = true;
    } finally {
      savingPhaseConfig = false;
    }
  }

  onMount(async () => {
    await loadTournament();
    isSuperAdminUser = await isSuperAdmin();
    const profile = await getUserProfile();
    canAutofillUser = profile?.canAutofill === true;

    // Subscribe to real-time updates from Firebase
    if (tournamentId) {
      unsubscribe = subscribeTournament(tournamentId, (updated) => {
        if (updated) {
          // Force Svelte reactivity by creating new object reference for deep nested data
          tournament = JSON.parse(JSON.stringify(updated));

          // Update selectedMatch if dialog is open to reflect real-time changes
          if (selectedMatch && showMatchDialog) {
            const selectedMatchId = selectedMatch.id;
            const bracket = selectedBracketType === 'gold'
              ? updated.finalStage?.goldBracket
              : updated.finalStage?.silverBracket;

            let foundMatch: BracketMatch | null = null;

            // Search in rounds
            for (const round of bracket?.rounds || []) {
              const found = round.matches.find(m => m.id === selectedMatchId);
              if (found) {
                foundMatch = found;
                break;
              }
            }
            // Search in third place match
            if (!foundMatch && bracket?.thirdPlaceMatch?.id === selectedMatchId) {
              foundMatch = bracket.thirdPlaceMatch;
            }
            // Search in consolation brackets
            if (!foundMatch && bracket?.consolationBrackets) {
              for (const consolation of bracket.consolationBrackets) {
                for (const round of consolation.rounds) {
                  const found = round.matches.find(m => m.id === selectedMatchId);
                  if (found) {
                    foundMatch = found;
                    break;
                  }
                }
                if (foundMatch) break;
              }
            }

            if (foundMatch) {
              selectedMatch = foundMatch;
            }
          }
        }
      });
    }
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  // Helper to translate internal round names to display names
  function translateRoundName(name: string): string {
    const key = name.toLowerCase();
    const roundTranslations: Record<string, string> = {
      'final': m.tournament_final(),
      'semifinal': m.tournament_semifinal(),
      'quarterfinal': m.tournament_round() + ' 8',
      'round of 16': m.tournament_round() + ' 16',
      'round of 32': m.tournament_round() + ' 32',
      'third place': m.tournament_thirdPlace(),
    };
    return roundTranslations[key] || name.charAt(0).toUpperCase() + name.slice(1);
  }

  function openTimeBreakdown() {
    if (!tournament) return;
    timeBreakdown = calculateTimeBreakdown(tournament);
    showTimeBreakdown = true;
  }

  async function recalculateTime() {
    if (!tournament || !tournamentId) return;
    const timeEstimate = calculateTournamentTimeEstimate(tournament);
    tournament.timeEstimate = timeEstimate;
    timeBreakdown = calculateTimeBreakdown(tournament);
    await updateTournament(tournamentId, { timeEstimate });
    toastMessage = m.admin_timeRecalculated();
    toastType = 'success';
    showToast = true;
  }

  async function loadTournament() {
    loading = true;
    error = false;

    try {
      if (!tournamentId) {
        error = true;
        loading = false;
        return;
      }
      tournament = await getTournament(tournamentId);

      if (!tournament) {
        error = true;
      } else if (tournament.status !== 'FINAL_STAGE') {
        toastMessage = m.admin_tournamentNotInFinalStage();
        toastType = 'warning';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}`), 1500);
      } else if (!tournament.finalStage?.goldBracket) {
        toastMessage = m.admin_bracketNotGenerated();
        toastType = 'warning';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}`), 1500);
      }
    } catch (err) {
      console.error('Error loading tournament:', err);
      error = true;
    } finally {
      loading = false;
    }
  }

  function getParticipantName(participantId: string | undefined): string {
    if (!participantId) return m.common_tbd();
    if (isBye(participantId)) return 'BYE';
    if (!tournament) return m.common_unknown();
    return tournament.participants.find(p => p.id === participantId)?.name || m.common_unknown();
  }

  // Check if a match is a BYE match (one participant is BYE)
  function isByeMatch(match: BracketMatch): boolean {
    return isBye(match.participantA) || isBye(match.participantB);
  }

  /**
   * Get a friendly display name for a loser placeholder
   * Shows the names of the players competing in the source match
   * e.g., "LOSER:QF:0" -> "Perd. Player1/Player2"
   */
  function getLoserPlaceholderDisplay(participantId: string | undefined): string | null {
    if (!participantId || !isLoserPlaceholder(participantId)) return null;

    const parsed = parseLoserPlaceholder(participantId);
    if (!parsed) return 'TBD';

    // Try to find the source match in the main bracket to show participant names
    const currentBracket = activeTab === 'gold' ? goldBracket : silverBracket;
    if (currentBracket && tournament) {
      // Find the round that matches QF or R16
      // QF is typically the round with 4 matches (quarterfinals)
      // R16 is the round with 8 matches (round of 16)
      const targetMatchCount = parsed.roundName === 'QF' ? 4 : 8;

      for (const round of currentBracket.rounds) {
        if (round.matches.length === targetMatchCount) {
          const sourceMatch = round.matches[parsed.matchPosition];
          if (sourceMatch) {
            const nameA = tournament.participants.find(p => p.id === sourceMatch.participantA)?.name;
            const nameB = tournament.participants.find(p => p.id === sourceMatch.participantB)?.name;

            if (nameA && nameB) {
              // Shorten names if too long
              const shortA = nameA.length > 10 ? nameA.substring(0, 10) + '.' : nameA;
              const shortB = nameB.length > 10 ? nameB.substring(0, 10) + '.' : nameB;
              return `Perd. ${shortA}/${shortB}`;
            } else if (nameA || nameB) {
              return `Perd. ${nameA || nameB || '?'}`;
            }
          }
          break;
        }
      }
    }

    // Fallback to generic display
    const roundNames: Record<string, string> = {
      'QF': 'Cuartos',
      'R16': 'Octavos'
    };

    const roundName = roundNames[parsed.roundName] || parsed.roundName;
    return `Perd. ${roundName} #${parsed.matchPosition + 1}`;
  }

  function getStatusDisplay(status: string): { text: string; color: string } {
    const statusMap: Record<string, { text: string; color: string }> = {
      PENDING: { text: m.tournament_pending(), color: '#6b7280' },
      IN_PROGRESS: { text: m.tournament_inProgress(), color: '#f59e0b' },
      COMPLETED: { text: m.tournament_completed(), color: '#10b981' },
      WALKOVER: { text: 'Walkover', color: '#8b5cf6' }
    };
    return statusMap[status] || { text: status, color: '#6b7280' };
  }

  function getTournamentStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      DRAFT: '#666',
      GROUP_STAGE: '#fa709a',
      TRANSITION: '#fee140',
      FINAL_STAGE: '#30cfd0',
      COMPLETED: '#4ade80',
      CANCELLED: '#ef4444'
    };
    return colorMap[status] || '#666';
  }

  function getTournamentStatusTextColor(status: string): string {
    const darkTextStatuses = ['TRANSITION', 'COMPLETED', 'FINAL_STAGE'];
    return darkTextStatuses.includes(status) ? '#1f2937' : 'white';
  }

  function getTournamentStatusText(status: string): string {
    switch (status) {
      case 'DRAFT': return m.admin_draft();
      case 'GROUP_STAGE': return m.tournament_groupStage();
      case 'FINAL_STAGE': return m.tournament_finalStage();
      case 'COMPLETED': return m.tournament_completed();
      case 'CANCELLED': return m.admin_cancelled();
      default: return status;
    }
  }

  /**
   * Get position label for consolation match (e.g., "5º-6º", "7º-8º")
   * Only shows labels for final round where positions are definitive
   */
  function getConsolationPositionLabel(
    startPosition: number,
    totalRounds: number,
    roundIndex: number,
    matchIndex: number,
    _isThirdPlaceMatch: boolean = false,
    totalMatchesInFinalRound: number = 1
  ): string | null {
    // Only show position labels for final round matches
    // Earlier rounds already show the range in the round header
    if (roundIndex !== totalRounds - 1) {
      return null;
    }

    // Final round - each match determines two consecutive positions
    // In final round: first half are finals, second half are loser's matches
    const numFinals = Math.ceil(totalMatchesInFinalRound / 2);

    if (matchIndex < numFinals) {
      // Finals (5º-6º, 9º-10º)
      const posA = startPosition + matchIndex * 2;
      const posB = posA + 1;
      return `${posA}º-${posB}º`;
    } else {
      // Loser's matches (7º-8º, 11º-12º)
      const loserMatchIndex = matchIndex - numFinals;
      const posA = startPosition + numFinals * 2 + loserMatchIndex * 2;
      const posB = posA + 1;
      return `${posA}º-${posB}º`;
    }
  }

  function handleMatchClick(
    match: BracketMatch,
    bracketType: 'gold' | 'silver' = 'gold',
    roundNumber: number = 1,
    isThirdPlace: boolean = false
  ) {
    if (!match.participantA || !match.participantB) return;
    selectedMatch = match;
    selectedBracketType = bracketType;
    selectedRoundNumber = roundNumber;
    selectedIsThirdPlace = isThirdPlace;
    showMatchDialog = true;
  }

  // Check if a match is the final match of a bracket
  function isFinalMatch(match: BracketMatch, bracket: any): boolean {
    if (!bracket?.rounds?.length) return false;
    const finalRound = bracket.rounds[bracket.rounds.length - 1];
    return finalRound?.matches?.some((m: BracketMatch) => m.id === match.id) || false;
  }

  // Check if a match is a consolation match
  function isConsolationMatch(matchId: string): { isConsolation: boolean; source: 'QF' | 'R16' | null } {
    const brackets = activeTab === 'gold' ? goldConsolationBrackets : silverConsolationBrackets;
    for (const consolation of brackets) {
      for (const round of consolation.rounds) {
        if (round.matches.some(m => m.id === matchId)) {
          return { isConsolation: true, source: consolation.source };
        }
      }
    }
    return { isConsolation: false, source: null };
  }

  // Handle consolation match click
  function handleConsolationMatchClick(
    match: BracketMatch,
    source: 'QF' | 'R16',
    roundNumber: number
  ) {
    if (!match.participantA || !match.participantB) return;
    selectedMatch = match;
    selectedBracketType = activeTab;
    selectedRoundNumber = roundNumber;
    selectedIsThirdPlace = false;
    selectedConsolationSource = source;
    showMatchDialog = true;
  }

  // Loading message based on context
  let loadingMessage = $state(m.bracket_savingResult());

  async function handleSaveMatch(result: {
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
  }) {
    if (!selectedMatch || !tournamentId || !tournament) return;
    showMatchDialog = false;

    // Debug: Log match details before saving
    console.log('🔍 handleSaveMatch - selectedMatch details:', {
      matchId: selectedMatch.id,
      participantA: selectedMatch.participantA,
      participantB: selectedMatch.participantB,
      status: selectedMatch.status,
      gamesWonA: result.gamesWonA,
      gamesWonB: result.gamesWonB,
      isConsolation: !!selectedConsolationSource
    });

    // Check if this is a consolation match
    if (selectedConsolationSource) {
      loadingMessage = m.bracket_savingQualifyingMatch();
      isSavingMatch = true;

      try {
        // Determine winner and loser based on games won
        let winner: string;
        let loser: string;
        if (result.gamesWonA > result.gamesWonB) {
          winner = selectedMatch.participantA!;
          loser = selectedMatch.participantB!;
        } else {
          winner = selectedMatch.participantB!;
          loser = selectedMatch.participantA!;
        }

        // Update consolation match
        const updateSuccess = await updateConsolationMatch(
          tournamentId,
          selectedMatch.id,
          {
            status: 'COMPLETED',
            rounds: result.rounds || [],
            winner,
            gamesWonA: result.gamesWonA,
            gamesWonB: result.gamesWonB,
            totalPointsA: result.totalPointsA || 0,
            totalPointsB: result.totalPointsB || 0,
            total20sA: result.total20sA || 0,
            total20sB: result.total20sB || 0
          },
          selectedBracketType
        );

        if (updateSuccess) {
          // Advance winner and loser in consolation bracket
          await advanceConsolationWinner(
            tournamentId,
            selectedMatch.id,
            winner,
            selectedBracketType,
            loser
          );

          toastMessage = m.admin_resultSavedSuccessfully();
          toastType = 'success';
        } else {
          toastMessage = m.admin_errorSavingResult();
          toastType = 'error';
        }

        selectedMatch = null;
        selectedConsolationSource = null;
        showToast = true;
      } catch (err) {
        console.error('Error saving consolation match:', err);
        toastMessage = m.admin_errorSavingResult();
        toastType = 'error';
        showToast = true;
      } finally {
        isSavingMatch = false;
      }
      return;
    }

    // Check if this is a final match (could complete the tournament)
    const goldBracketData = tournament.finalStage?.goldBracket;
    const silverBracketData = tournament.finalStage?.silverBracket;
    const isGoldFinal = goldBracketData && isFinalMatch(selectedMatch, goldBracketData);
    const isSilverFinal = silverBracketData && isFinalMatch(selectedMatch, silverBracketData);
    const isFinal = isGoldFinal || isSilverFinal || selectedIsThirdPlace;

    // Set appropriate loading message
    if (isFinal && !isSplitDivisions) {
      loadingMessage = m.bracket_finalizingTournament();
    } else if (isGoldFinal) {
      loadingMessage = m.bracket_savingGoldFinal();
    } else if (isSilverFinal) {
      loadingMessage = m.bracket_savingSilverFinal();
    } else {
      loadingMessage = m.bracket_savingResult();
    }

    isSavingMatch = true;

    try {
      // Determine winner based on games won
      let winner: string;
      if (result.gamesWonA > result.gamesWonB) {
        winner = selectedMatch.participantA!;
      } else {
        winner = selectedMatch.participantB!;
      }

      // Use centralized sync service (handles both gold and silver brackets)
      const success = await completeMatch(
        tournamentId,
        selectedMatch.id,
        'FINAL',
        undefined,
        {
          rounds: result.rounds || [],
          winner,
          gamesWonA: result.gamesWonA,
          gamesWonB: result.gamesWonB,
          totalPointsA: result.totalPointsA || 0,
          totalPointsB: result.totalPointsB || 0,
          total20sA: result.total20sA || 0,
          total20sB: result.total20sB || 0
        }
      );

      if (success) {
        toastMessage = m.admin_resultSavedSuccessfully();
        toastType = 'success';
        selectedMatch = null;
        // No need to reload - real-time subscription will update
      } else {
        toastMessage = m.admin_errorSavingResult();
        toastType = 'error';
      }
      showToast = true;
    } catch (err) {
      console.error('Error saving match:', err);
      toastMessage = m.admin_errorSavingResult();
      toastType = 'error';
      showToast = true;
    } finally {
      isSavingMatch = false;
      loadingMessage = m.bracket_savingResult();
    }
  }

  async function handleNoShow(noShowParticipantId: string) {
    if (!selectedMatch || !tournamentId) return;

    try {
      // Use centralized sync service (handles both gold and silver brackets)
      const success = await markNoShow(
        tournamentId,
        selectedMatch.id,
        'FINAL',
        undefined,
        noShowParticipantId
      );

      if (success) {
        toastMessage = m.admin_walkoverRegistered();
        toastType = 'success';
        showMatchDialog = false;
        selectedMatch = null;
        // No need to reload - real-time subscription will update
      } else {
        toastMessage = m.admin_errorRegisteringWalkover();
        toastType = 'error';
      }
      showToast = true;
    } catch (err) {
      console.error('Error handling no-show:', err);
      toastMessage = m.admin_errorRegisteringWalkover();
      toastType = 'error';
      showToast = true;
    }
  }

  function handleCloseDialog() {
    showMatchDialog = false;
    selectedMatch = null;
  }

  /**
   * Force generate consolation brackets for the current bracket tab
   */
  async function handleGenerateConsolation() {
    if (!tournamentId || !bracket) return;

    isGeneratingConsolation = true;
    console.log(`🔄 Attempting to generate consolation brackets for ${activeTab} bracket...`);
    console.log(`📊 Bracket info: totalRounds=${bracket.totalRounds}, rounds=${bracket.rounds?.length}`);

    // Log round completion status
    bracket.rounds?.forEach((round, idx) => {
      const completedMatches = round.matches.filter(m => m.status === 'COMPLETED' || m.status === 'WALKOVER').length;
      const byeMatches = round.matches.filter(m => m.participantA === 'BYE' || m.participantB === 'BYE').length;
      console.log(`  Round ${idx + 1} (${round.name}): ${completedMatches}/${round.matches.length} completed, ${byeMatches} BYEs`);
    });

    try {
      const success = await forceRegenerateConsolationBrackets(tournamentId, activeTab);

      if (success) {
        toastMessage = m.bracket_consolationGenerated();
        toastType = 'success';
      } else {
        toastMessage = m.bracket_consolationNotGenerated();
        toastType = 'warning';
      }
      showToast = true;
    } catch (err) {
      console.error('Error generating consolation brackets:', err);
      toastMessage = m.bracket_errorGenerateConsolation();
      toastType = 'error';
      showToast = true;
    } finally {
      isGeneratingConsolation = false;
    }
  }

  /**
   * Auto-fill all pending bracket matches with random results (SuperAdmin only)
   * Simulates games until reaching pointsToWin (default 7) with 2+ point lead
   */
  async function autoFillAllMatches() {
    if (!tournament || !tournament.finalStage?.goldBracket || !tournamentId) return;

    isAutoFilling = true;
    let filledCount = 0;
    const currentTournamentId = tournamentId; // Store in local variable for TypeScript

    try {
      // Helper function to simulate a match for a specific bracket type
      async function simulateMatch(
        match: BracketMatch,
        bracketType: 'gold' | 'silver',
        config: { gameMode: 'points' | 'rounds'; pointsToWin: number; roundsToPlay: number; matchesToWin: number }
      ): Promise<boolean> {
        if (match.status !== 'PENDING' || !match.participantA || !match.participantB) {
          return false;
        }

        const { gameMode, pointsToWin, roundsToPlay, matchesToWin } = config;
        const isRoundsMode = gameMode === 'rounds';

        const requiredWins = matchesToWin;
        let gamesA = 0;
        let gamesB = 0;
        let totalPointsA = 0;
        let totalPointsB = 0;
        let total20sA = 0;
        let total20sB = 0;

        // Store all rounds with game number
        const allRounds: Array<{
          gameNumber: number;
          roundInGame: number;
          pointsA: number;
          pointsB: number;
          twentiesA: number;
          twentiesB: number;
        }> = [];

        let gameNumber = 0;
        while (gamesA < requiredWins && gamesB < requiredWins) {
          gameNumber++;
          let gamePointsA = 0;
          let gamePointsB = 0;
          let roundInGame = 0;

          // For rounds mode, play exactly roundsToPlay rounds, then extra rounds if tied
          // For points mode, play until reaching pointsToWin with 2+ lead
          const maxRoundsInGame = isRoundsMode ? roundsToPlay : 100; // 100 is a safety limit for points mode

          while (roundInGame < maxRoundsInGame) {
            roundInGame++;
            const distribution = Math.random();
            let roundPointsA = 0;
            let roundPointsB = 0;
            let round20sA = 0;
            let round20sB = 0;

            if (distribution < 0.45) {
              roundPointsA = 2;
              roundPointsB = 0;
              if (Math.random() < 0.12) round20sA = 1;
            } else if (distribution < 0.9) {
              roundPointsA = 0;
              roundPointsB = 2;
              if (Math.random() < 0.12) round20sB = 1;
            } else {
              roundPointsA = 1;
              roundPointsB = 1;
            }

            gamePointsA += roundPointsA;
            gamePointsB += roundPointsB;
            total20sA += round20sA;
            total20sB += round20sB;

            // Save round data
            allRounds.push({
              gameNumber,
              roundInGame,
              pointsA: roundPointsA,
              pointsB: roundPointsB,
              twentiesA: round20sA,
              twentiesB: round20sB
            });

            // Check game end condition
            if (!isRoundsMode) {
              // Points mode: check for win
              const maxPoints = Math.max(gamePointsA, gamePointsB);
              const diff = Math.abs(gamePointsA - gamePointsB);
              if (maxPoints >= pointsToWin && diff >= 2) {
                break;
              }
            }
          }

          // In rounds mode: play extra rounds until there's a winner (no ties allowed)
          if (isRoundsMode) {
            while (gamePointsA === gamePointsB) {
              roundInGame++;
              const distribution = Math.random();
              let roundPointsA = 0;
              let roundPointsB = 0;
              let round20sA = 0;
              let round20sB = 0;

              // In extra rounds, we don't allow ties (50/50 split)
              if (distribution < 0.5) {
                roundPointsA = 2;
                roundPointsB = 0;
                if (Math.random() < 0.12) round20sA = 1;
              } else {
                roundPointsA = 0;
                roundPointsB = 2;
                if (Math.random() < 0.12) round20sB = 1;
              }

              gamePointsA += roundPointsA;
              gamePointsB += roundPointsB;
              total20sA += round20sA;
              total20sB += round20sB;

              allRounds.push({
                gameNumber,
                roundInGame,
                pointsA: roundPointsA,
                pointsB: roundPointsB,
                twentiesA: round20sA,
                twentiesB: round20sB
              });
            }
          }

          totalPointsA += gamePointsA;
          totalPointsB += gamePointsB;

          if (gamePointsA > gamePointsB) {
            gamesA++;
          } else if (gamePointsB > gamePointsA) {
            gamesB++;
          }
          // Note: ties should not happen after extra rounds
        }

        const winner = gamesA > gamesB ? match.participantA : match.participantB;

        // Use correct functions based on bracket type
        const updateMatch = bracketType === 'silver' ? updateSilverBracketMatch : updateBracketMatch;
        const advanceMatchWinner = bracketType === 'silver' ? advanceSilverWinner : advanceWinner;

        await updateMatch(currentTournamentId, match.id, {
          status: 'COMPLETED',
          gamesWonA: gamesA,
          gamesWonB: gamesB,
          totalPointsA,
          totalPointsB,
          total20sA,
          total20sB,
          rounds: allRounds,
          winner
        });

        if (winner) {
          await advanceMatchWinner(currentTournamentId, match.id, winner);
        }

        return true;
      }

      // Process a bracket (gold or silver)
      async function processBracket(bracketType: 'gold' | 'silver'): Promise<number> {
        let bracketFilledCount = 0;
        let hasMoreMatches = true;
        const isSilver = bracketType === 'silver';

        while (hasMoreMatches) {
          hasMoreMatches = false;

          // Reload tournament to get current bracket state
          tournament = await getTournament(currentTournamentId);
          if (!tournament?.finalStage) break;

          const currentBracket = bracketType === 'gold'
            ? tournament.finalStage.goldBracket
            : tournament.finalStage.silverBracket;

          if (!currentBracket) break;

          const totalRounds = currentBracket.totalRounds;

          // Process rounds in order
          for (const round of currentBracket.rounds) {
            // Get phase-specific config for this round
            const phaseConfig = getPhaseConfig(
              currentBracket,
              round.roundNumber,
              totalRounds,
              false // not third place
            );

            for (const match of round.matches) {
              if (await simulateMatch(match, bracketType, phaseConfig)) {
                hasMoreMatches = true;
                bracketFilledCount++;
              }
            }
          }

          // Also process 3rd place match if available
          const thirdPlace = currentBracket.thirdPlaceMatch;
          if (thirdPlace) {
            // 3rd place uses semifinal config
            const thirdPlaceConfig = getPhaseConfig(
              currentBracket,
              totalRounds - 1, // semifinal round number for config
              totalRounds,
              true // is third place
            );
            if (await simulateMatch(thirdPlace, bracketType, thirdPlaceConfig)) {
              hasMoreMatches = true;
              bracketFilledCount++;
            }
          }
        }

        return bracketFilledCount;
      }

      // Process consolation brackets for a main bracket
      async function processConsolationBrackets(bracketType: 'gold' | 'silver'): Promise<number> {
        let consolationFilledCount = 0;
        let hasMoreMatches = true;

        while (hasMoreMatches) {
          hasMoreMatches = false;

          // Reload tournament to get current state
          tournament = await getTournament(currentTournamentId);
          if (!tournament?.finalStage) break;

          const mainBracket = bracketType === 'gold'
            ? tournament.finalStage.goldBracket
            : tournament.finalStage.silverBracket;

          if (!mainBracket?.consolationBrackets?.length) break;

          // Process each consolation bracket (R16, QF)
          for (const consolation of mainBracket.consolationBrackets) {
            // Get config - consolation uses earlyRounds config from main bracket
            const config = {
              gameMode: mainBracket.config.earlyRounds.gameMode,
              pointsToWin: mainBracket.config.earlyRounds.pointsToWin,
              roundsToPlay: mainBracket.config.earlyRounds.roundsToPlay,
              matchesToWin: mainBracket.config.earlyRounds.matchesToWin
            };

            for (const round of consolation.rounds) {
              for (const match of round.matches) {
                if (match.status !== 'PENDING' || !match.participantA || !match.participantB) {
                  continue;
                }

                // Simulate the match using same logic as main bracket
                const { gameMode, pointsToWin, roundsToPlay, matchesToWin } = config;
                const isRoundsMode = gameMode === 'rounds';
                const requiredWins = matchesToWin;

                let gamesA = 0;
                let gamesB = 0;
                let totalPointsA = 0;
                let totalPointsB = 0;
                let total20sA = 0;
                let total20sB = 0;

                const allRounds: Array<{
                  gameNumber: number;
                  roundInGame: number;
                  pointsA: number;
                  pointsB: number;
                  twentiesA: number;
                  twentiesB: number;
                }> = [];

                let gameNumber = 0;
                while (gamesA < requiredWins && gamesB < requiredWins) {
                  gameNumber++;
                  let gamePointsA = 0;
                  let gamePointsB = 0;
                  let roundInGame = 0;
                  const maxRoundsInGame = isRoundsMode ? roundsToPlay : 100;

                  while (roundInGame < maxRoundsInGame) {
                    roundInGame++;
                    const distribution = Math.random();
                    let roundPointsA = 0;
                    let roundPointsB = 0;
                    let round20sA = 0;
                    let round20sB = 0;

                    if (distribution < 0.45) {
                      roundPointsA = 2;
                      roundPointsB = 0;
                      if (Math.random() < 0.12) round20sA = 1;
                    } else if (distribution < 0.9) {
                      roundPointsA = 0;
                      roundPointsB = 2;
                      if (Math.random() < 0.12) round20sB = 1;
                    } else {
                      roundPointsA = 1;
                      roundPointsB = 1;
                    }

                    gamePointsA += roundPointsA;
                    gamePointsB += roundPointsB;
                    total20sA += round20sA;
                    total20sB += round20sB;

                    allRounds.push({
                      gameNumber,
                      roundInGame,
                      pointsA: roundPointsA,
                      pointsB: roundPointsB,
                      twentiesA: round20sA,
                      twentiesB: round20sB
                    });

                    if (!isRoundsMode) {
                      const maxPoints = Math.max(gamePointsA, gamePointsB);
                      const diff = Math.abs(gamePointsA - gamePointsB);
                      if (maxPoints >= pointsToWin && diff >= 2) {
                        break;
                      }
                    }
                  }

                  // In rounds mode: play extra rounds until there's a winner (no ties allowed)
                  if (isRoundsMode) {
                    while (gamePointsA === gamePointsB) {
                      roundInGame++;
                      const distribution = Math.random();
                      let roundPointsA = 0;
                      let roundPointsB = 0;
                      let round20sA = 0;
                      let round20sB = 0;

                      // In extra rounds, we don't allow ties (50/50 split)
                      if (distribution < 0.5) {
                        roundPointsA = 2;
                        roundPointsB = 0;
                        if (Math.random() < 0.12) round20sA = 1;
                      } else {
                        roundPointsA = 0;
                        roundPointsB = 2;
                        if (Math.random() < 0.12) round20sB = 1;
                      }

                      gamePointsA += roundPointsA;
                      gamePointsB += roundPointsB;
                      total20sA += round20sA;
                      total20sB += round20sB;

                      allRounds.push({
                        gameNumber,
                        roundInGame,
                        pointsA: roundPointsA,
                        pointsB: roundPointsB,
                        twentiesA: round20sA,
                        twentiesB: round20sB
                      });
                    }
                  }

                  totalPointsA += gamePointsA;
                  totalPointsB += gamePointsB;

                  if (gamePointsA > gamePointsB) {
                    gamesA++;
                  } else if (gamePointsB > gamePointsA) {
                    gamesB++;
                  }
                  // Note: ties should not happen after extra rounds
                }

                const winner = gamesA > gamesB ? match.participantA : match.participantB;
                const loser = gamesA > gamesB ? match.participantB : match.participantA;

                await updateConsolationMatch(
                  currentTournamentId,
                  match.id,
                  {
                    status: 'COMPLETED',
                    gamesWonA: gamesA,
                    gamesWonB: gamesB,
                    totalPointsA,
                    totalPointsB,
                    total20sA,
                    total20sB,
                    rounds: allRounds,
                    winner
                  },
                  bracketType
                );

                await advanceConsolationWinner(
                  currentTournamentId,
                  match.id,
                  winner,
                  bracketType,
                  loser
                );

                hasMoreMatches = true;
                consolationFilledCount++;
              }
            }
          }
        }

        return consolationFilledCount;
      }

      // Process gold bracket
      filledCount += await processBracket('gold');

      // Process silver bracket if SPLIT_DIVISIONS
      if (tournament.finalStage.mode === 'SPLIT_DIVISIONS' && tournament.finalStage.silverBracket) {
        filledCount += await processBracket('silver');
      }

      // Process consolation brackets if enabled
      if (tournament.finalStage.consolationEnabled) {
        // Gold consolation brackets
        if (tournament.finalStage.goldBracket?.consolationBrackets?.length) {
          filledCount += await processConsolationBrackets('gold');
        }

        // Silver consolation brackets (if SPLIT_DIVISIONS)
        if (tournament.finalStage.mode === 'SPLIT_DIVISIONS' &&
            tournament.finalStage.silverBracket?.consolationBrackets?.length) {
          filledCount += await processConsolationBrackets('silver');
        }
      }

      // After all matches processed, check if tournament should be marked as complete
      const completed = await completeFinalStage(currentTournamentId);
      if (completed) {
        console.log('🏆 Tournament marked as COMPLETED after autofill');
      }

      toastMessage = m.admin_matchesFilledAuto({ n: String(filledCount) });
      toastType = 'success';
      showToast = true;
      await loadTournament(); // Final reload
    } catch (err) {
      console.error('Error auto-filling bracket matches:', err);
      toastMessage = m.admin_errorFillingMatchesGeneric();
      toastType = 'error';
      showToast = true;
    } finally {
      isAutoFilling = false;
    }
  }

  // Convert BracketMatch to GroupMatch format for the dialog
  let dialogMatch = $derived(selectedMatch ? {
    ...selectedMatch,
    id: selectedMatch.id,
    participantA: selectedMatch.participantA!,
    participantB: selectedMatch.participantB!,
    status: selectedMatch.status,
    gamesWonA: selectedMatch.gamesWonA,
    gamesWonB: selectedMatch.gamesWonB,
    totalPointsA: selectedMatch.totalPointsA,
    totalPointsB: selectedMatch.totalPointsB,
    total20sA: selectedMatch.total20sA,
    total20sB: selectedMatch.total20sB,
    rounds: selectedMatch.rounds,
    winner: selectedMatch.winner,
    noShowParticipant: selectedMatch.noShowParticipant
  } as GroupMatch : null);
</script>

<AdminGuard>
  <div class="bracket-page" data-theme={$adminTheme}>
    <header class="page-header">
      {#if tournament}
        <div class="header-row">
          <button class="back-btn" onclick={() => goto(`/admin/tournaments/${tournamentId}`)}>←</button>
          <div class="header-main">
            <div class="title-section">
              <h1>{tournament.name}</h1>
              <div class="header-badges">
                <span
                  class="tournament-status"
                  style="background: {getTournamentStatusColor(tournament.status)}; color: {getTournamentStatusTextColor(tournament.status)};"
                >
                  {getTournamentStatusText(tournament.status)}
                </span>
                {#if tournament.status !== 'COMPLETED'}
                  <TournamentKeyBadge tournamentKey={tournament.key} compact={true} />
                {/if}
              </div>
              {#if timeRemaining && tournament.status !== 'COMPLETED'}
                <div class="header-progress">
                  <TimeProgressBar
                    percentComplete={timeRemaining.percentComplete}
                    remainingMinutes={timeRemaining.remainingMinutes}
                    showEstimatedEnd={true}
                    compact={true}
                    clickable={true}
                    onclick={openTimeBreakdown}
                  />
                </div>
              {/if}
            </div>
          </div>
          <div class="header-actions">
            {#if (isSuperAdminUser || canAutofillUser) && tournament.status !== 'COMPLETED'}
              <button
                class="action-btn autofill"
                onclick={autoFillAllMatches}
                disabled={isAutoFilling}
                title={m.admin_autoFillMatchesTitle() || 'Auto-fill matches with random results'}
              >
                {isAutoFilling ? `⏳` : `🎲`}
              </button>
            {/if}
            <ThemeToggle />
          </div>
        </div>
      {/if}
    </header>

    <div class="page-content">
      {#if loading}
        <LoadingSpinner message={m.admin_loadingBracket()} />
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>{m.admin_errorLoading()}</h3>
          <p>{m.admin_errorLoadingBracket()}</p>
          <button class="primary-button" onclick={() => goto('/admin/tournaments')}>
            {m.admin_backToTournaments()}
          </button>
        </div>
      {:else if bracket}
        <!-- Phase Configuration Panel -->
        {@const isGold = activeTab === 'gold'}
        {@const earlyConfig = getPhaseEditConfig('early', isGold)}
        {@const semiConfig = getPhaseEditConfig('semifinal', isGold)}
        {@const finalConfig = getPhaseEditConfig('final', isGold)}
        {@const hasEarlyRounds = rounds.length > 2}
        {@const earlyRounds = hasEarlyRounds ? rounds.slice(0, -2) : []}
        {@const semiRound = rounds.length >= 2 ? rounds[rounds.length - 2] : null}
        {@const finalRound = rounds.length >= 1 ? rounds[rounds.length - 1] : null}
        {@const earlyLocked = earlyRounds.some(r => isRoundLocked(r.matches))}
        {@const semiLocked = semiRound ? isRoundLocked(semiRound.matches) : false}
        {@const finalLocked = finalRound ? isRoundLocked(finalRound.matches) : false}
        {@const thirdPlaceLocked = thirdPlaceMatch?.status === 'IN_PROGRESS' || thirdPlaceMatch?.status === 'COMPLETED' || thirdPlaceMatch?.status === 'WALKOVER'}

        <!-- Global table config (affects both brackets) -->
        <div class="global-table-config">
          <div class="table-config-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
            <span>{m.bracket_tables()}</span>
          </div>
          <div class="table-config-controls">
            {#if editingNumTables}
              <input
                type="number"
                min="1"
                max="20"
                bind:value={tempNumTables}
                class="table-number-input"
                disabled={isReassigningTables}
              />
              <button
                class="table-action-btn confirm"
                onclick={saveNumTablesAndReassign}
                disabled={isReassigningTables}
                title={m.bracket_saveAndReassign()}
              >
                {#if isReassigningTables}
                  <span class="spinner"></span>
                {:else}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                {/if}
              </button>
              <button
                class="table-action-btn cancel"
                onclick={cancelEditingTables}
                disabled={isReassigningTables}
                title={m.common_cancel()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            {:else}
              <button class="table-value" onclick={startEditingTables} title={m.bracket_clickToEdit()}>{currentNumTables}</button>
              <button
                class="table-action-btn sync"
                onclick={handleReassignTables}
                disabled={isReassigningTables}
                title={m.bracket_reassignTables()}
              >
                {#if isReassigningTables}
                  <span class="spinner"></span>
                {:else}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                {/if}
              </button>
            {/if}
          </div>
        </div>

        <!-- Bracket filters bar -->
        {#if isSplitDivisions || consolationEnabledValue}
          <div class="bracket-filters">
            {#if isSplitDivisions}
              <div class="filter-group">
                <span class="filter-label">{m.bracket_league()}</span>
                <div class="filter-options">
                  <button
                    class="filter-btn"
                    class:active={activeTab === 'gold'}
                    onclick={() => activeTab = 'gold'}
                  >
                    <span class="filter-icon gold">●</span>
                    {m.bracket_gold()}
                    {#if goldBracket?.thirdPlaceMatch?.winner || goldRounds[goldRounds.length - 1]?.matches[0]?.winner}
                      <span class="filter-complete">✓</span>
                    {/if}
                  </button>
                  <button
                    class="filter-btn"
                    class:active={activeTab === 'silver'}
                    onclick={() => activeTab = 'silver'}
                  >
                    <span class="filter-icon silver">●</span>
                    {m.bracket_silver()}
                    {#if silverBracket?.thirdPlaceMatch?.winner || silverRounds[silverRounds.length - 1]?.matches[0]?.winner}
                      <span class="filter-complete">✓</span>
                    {/if}
                  </button>
                </div>
              </div>
            {/if}

            {#if consolationEnabledValue}
              <div class="filter-group">
                <span class="filter-label">{m.bracket_phase()}</span>
                <div class="filter-options">
                  <button
                    class="filter-btn"
                    class:active={bracketView === 'main'}
                    onclick={() => bracketView = 'main'}
                  >
                    {m.bracket_winners()}
                  </button>
                  <button
                    class="filter-btn"
                    class:active={bracketView === 'consolation'}
                    onclick={() => bracketView = 'consolation'}
                  >
                    {m.bracket_consolation()}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Phase Configuration Accordion (specific to current bracket) -->
        <div class="config-accordion" class:expanded={configExpanded}>
          <button class="accordion-header" onclick={() => configExpanded = !configExpanded}>
            <div class="accordion-title">
              <svg class="accordion-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <span>{m.bracket_configuration()} {isGold ? m.scoring_gold() : m.scoring_silver()}</span>
            </div>
            <div class="accordion-summary">
              {#if hasEarlyRounds}
                <span class="summary-badge" title={m.bracket_earlyPhases()}>{earlyConfig.gameMode === 'rounds' ? `${earlyConfig.value}R` : `${earlyConfig.value}P`}</span>
              {/if}
              {#if semiRound}
                <span class="summary-badge" title={m.admin_semifinals()}>{semiConfig.gameMode === 'rounds' ? `${semiConfig.value}R` : `${semiConfig.value}P`}</span>
              {/if}
              {#if finalRound}
                <span class="summary-badge" title={m.bracket_final()}>{finalConfig.gameMode === 'rounds' ? `${finalConfig.value}R` : `${finalConfig.value}P`}</span>
              {/if}
            </div>
          </button>

          {#if configExpanded}
            <div class="accordion-content">
              <div class="phase-config-grid">
                {#if hasEarlyRounds}
                  <div class="phase-config-item" class:locked={earlyLocked}>
                    <label>{m.bracket_earlyPhases()}</label>
                    <div class="config-inputs">
                      <select
                        value={earlyConfig.gameMode}
                        disabled={earlyLocked || savingPhaseConfig}
                        onchange={(e) => savePhaseConfig('early', isGold, parseGameMode(e.currentTarget.value), earlyConfig.value, earlyConfig.matchesToWin)}
                      >
                        <option value="rounds">{m.bracket_rounds()}</option>
                        <option value="points">{m.bracket_points()}</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={earlyConfig.value}
                        disabled={earlyLocked || savingPhaseConfig}
                        onchange={(e) => savePhaseConfig('early', isGold, earlyConfig.gameMode, parseInt(e.currentTarget.value) || 4, earlyConfig.matchesToWin)}
                      />
                      {#if earlyConfig.gameMode === 'points'}
                        <span class="bo-label">{m.bracket_bestOf()}</span>
                        <select
                          class="bo-select"
                          value={earlyConfig.matchesToWin}
                          disabled={earlyLocked || savingPhaseConfig}
                          onchange={(e) => savePhaseConfig('early', isGold, earlyConfig.gameMode, earlyConfig.value, parseInt(e.currentTarget.value) || 1)}
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      {/if}
                    </div>
                    {#if earlyLocked}<span class="lock-icon">🔒</span>{/if}
                  </div>
                {/if}

                {#if semiRound}
                  <div class="phase-config-item" class:locked={semiLocked || thirdPlaceLocked}>
                    <label>{m.bracket_semisAndThird()}</label>
                    <div class="config-inputs">
                      <select
                        value={semiConfig.gameMode}
                        disabled={semiLocked || thirdPlaceLocked || savingPhaseConfig}
                        onchange={(e) => savePhaseConfig('semifinal', isGold, parseGameMode(e.currentTarget.value), semiConfig.value, semiConfig.matchesToWin)}
                      >
                        <option value="rounds">{m.bracket_rounds()}</option>
                        <option value="points">{m.bracket_points()}</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={semiConfig.value}
                        disabled={semiLocked || thirdPlaceLocked || savingPhaseConfig}
                        onchange={(e) => savePhaseConfig('semifinal', isGold, semiConfig.gameMode, parseInt(e.currentTarget.value) || 7, semiConfig.matchesToWin)}
                      />
                      {#if semiConfig.gameMode === 'points'}
                        <span class="bo-label">{m.bracket_bestOf()}</span>
                        <select
                          class="bo-select"
                          value={semiConfig.matchesToWin}
                          disabled={semiLocked || thirdPlaceLocked || savingPhaseConfig}
                          onchange={(e) => savePhaseConfig('semifinal', isGold, semiConfig.gameMode, semiConfig.value, parseInt(e.currentTarget.value) || 1)}
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      {/if}
                    </div>
                    {#if semiLocked || thirdPlaceLocked}<span class="lock-icon">🔒</span>{/if}
                  </div>
                {/if}

                {#if finalRound}
                  <div class="phase-config-item" class:locked={finalLocked}>
                    <label>{m.bracket_final()}</label>
                    <div class="config-inputs">
                      <select
                        value={finalConfig.gameMode}
                        disabled={finalLocked || savingPhaseConfig}
                        onchange={(e) => savePhaseConfig('final', isGold, parseGameMode(e.currentTarget.value), finalConfig.value, finalConfig.matchesToWin)}
                      >
                        <option value="rounds">{m.bracket_rounds()}</option>
                        <option value="points">{m.bracket_points()}</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={finalConfig.value}
                        disabled={finalLocked || savingPhaseConfig}
                        onchange={(e) => savePhaseConfig('final', isGold, finalConfig.gameMode, parseInt(e.currentTarget.value) || 9, finalConfig.matchesToWin)}
                      />
                      {#if finalConfig.gameMode === 'points'}
                        <span class="bo-label">{m.bracket_bestOf()}</span>
                        <select
                          class="bo-select"
                          value={finalConfig.matchesToWin}
                          disabled={finalLocked || savingPhaseConfig}
                          onchange={(e) => savePhaseConfig('final', isGold, finalConfig.gameMode, finalConfig.value, parseInt(e.currentTarget.value) || 1)}
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      {/if}
                    </div>
                    {#if finalLocked}<span class="lock-icon">🔒</span>{/if}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <div class="bracket-container" class:silver-bracket={activeTab === 'silver'}>
          {#if bracketView === 'main'}
          {#each rounds as round, roundIndex (round.roundNumber)}
            <div class="bracket-round" class:has-next-round={roundIndex < rounds.length - 1} style="--round-index: {roundIndex}">
              <h2 class="round-name">{translateRoundName(round.name)}</h2>
              <div class="matches-column">
                {#each round.matches as match, matchIndex (match.id)}
                  {@const gamesCompleted = (match.gamesWonA || 0) + (match.gamesWonB || 0)}
                  {@const expectedCurrentGame = gamesCompleted + 1}
                  {@const maxRoundGameNumber = match.rounds?.length ? Math.max(...match.rounds.map(r => r.gameNumber || 1)) : 1}
                  {@const currentGameNumber = Math.max(expectedCurrentGame, maxRoundGameNumber)}
                  {@const currentGameRounds = match.rounds?.filter(r => (r.gameNumber || 1) === currentGameNumber) || []}
                  {@const livePointsA = currentGameRounds.reduce((sum, r) => sum + (r.pointsA || 0), 0)}
                  {@const livePointsB = currentGameRounds.reduce((sum, r) => sum + (r.pointsB || 0), 0)}
                  {@const gamesLeaderA = match.status === 'IN_PROGRESS' && (match.gamesWonA || 0) > (match.gamesWonB || 0)}
                  {@const gamesLeaderB = match.status === 'IN_PROGRESS' && (match.gamesWonB || 0) > (match.gamesWonA || 0)}
                  <div
                    class="bracket-match"
                    class:clickable={match.participantA && match.participantB && !isByeMatch(match)}
                    class:bye-match={isByeMatch(match)}
                    onclick={() => !isByeMatch(match) && handleMatchClick(match, activeTab, round.roundNumber, false)}
                    onkeydown={(e) => e.key === 'Enter' && !isByeMatch(match) && handleMatchClick(match, activeTab, round.roundNumber, false)}
                    role="button"
                    tabindex={isByeMatch(match) ? -1 : 0}
                  >
                    <!-- Round count badge (top-left) - shows current round of CURRENT GAME (played + 1) -->
                    {#if match.status === 'IN_PROGRESS' && (currentGameRounds.length > 0 || match.rounds?.length)}
                      <div class="rounds-badge">R{currentGameRounds.length + 1}</div>
                    {/if}

                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantA}
                      class:tbd={!match.participantA}
                      class:bye={isBye(match.participantA)}
                      class:games-leader={gamesLeaderA}
                    >
                      <span class="participant-name">{getParticipantName(match.participantA)}</span>
                      {#if match.seedA}
                        <span class="seed">#{match.seedA}</span>
                      {/if}
                      {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                        <span class="score">{showGamesWon ? (match.gamesWonA || 0) : (match.totalPointsA || 0)}</span>
                        {#if tournament.show20s && match.total20sA !== undefined}
                          <span class="twenties">🎯{match.total20sA}</span>
                        {/if}
                      {:else if match.status === 'IN_PROGRESS' && (match.gamesWonA !== undefined || match.rounds?.length)}
                        <!-- Solo mostrar puntos del juego actual (las partidas ganadas se ven en el badge inferior) -->
                        <span class="score in-progress">{livePointsA}</span>
                      {/if}
                    </div>

                    <div class="vs-divider"></div>

                    <div
                      class="match-participant"
                      class:winner={match.winner === match.participantB}
                      class:tbd={!match.participantB}
                      class:bye={isBye(match.participantB)}
                      class:games-leader={gamesLeaderB}
                    >
                      <span class="participant-name">{getParticipantName(match.participantB)}</span>
                      {#if match.seedB}
                        <span class="seed">#{match.seedB}</span>
                      {/if}
                      {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                        <span class="score">{showGamesWon ? (match.gamesWonB || 0) : (match.totalPointsB || 0)}</span>
                        {#if tournament.show20s && match.total20sB !== undefined}
                          <span class="twenties">🎯{match.total20sB}</span>
                        {/if}
                      {:else if match.status === 'IN_PROGRESS' && (match.gamesWonB !== undefined || match.rounds?.length)}
                        <!-- Solo mostrar puntos del juego actual (las partidas ganadas se ven en el badge inferior) -->
                        <span class="score in-progress">{livePointsB}</span>
                      {/if}
                    </div>

                    {#if match.participantA && match.participantB}
                      {@const statusInfo = getStatusDisplay(match.status)}
                      <div class="status-badge" style="background: {statusInfo.color}">
                        {statusInfo.text}
                      </div>
                    {/if}

                    <!-- Table number badge - hide for completed matches since table is released -->
                    {#if !isByeMatch(match) && match.participantA && match.participantB && match.status !== 'COMPLETED'}
                      <div class="table-badge" class:tbd={!match.tableNumber}>
                        {match.tableNumber ? `${m.tournament_tableShort()}${match.tableNumber}` : 'TBD'}
                      </div>
                    {/if}

                    <!-- Games won badge (bottom-left) - only for multi-game matches in progress -->
                    {#if match.status === 'IN_PROGRESS' && getMatchesToWinForMatch(activeTab, roundIndex, rounds.length, false, false) > 1 && (match.gamesWonA !== undefined || match.gamesWonB !== undefined)}
                      {@const gA = match.gamesWonA || 0}
                      {@const gB = match.gamesWonB || 0}
                      {@const hasLeader = gA !== gB}
                      <div class="games-badge" class:has-leader={hasLeader} class:a-leads={gA > gB} class:b-leads={gB > gA}>
                        <span class:leading={gA > gB}>{gA}</span>
                        <span class="separator">-</span>
                        <span class:leading={gB > gA}>{gB}</span>
                      </div>
                    {/if}

                    <!-- 20s badge (bottom-right) - when in progress and show20s enabled, show current game 20s only -->
                    {#if match.status === 'IN_PROGRESS' && tournament.show20s}
                      {@const currentGame20sA = currentGameRounds.reduce((sum, r) => sum + (r.twentiesA || 0), 0)}
                      {@const currentGame20sB = currentGameRounds.reduce((sum, r) => sum + (r.twentiesB || 0), 0)}
                      <div class="twenties-badge">🎯 {currentGame20sA}-{currentGame20sB}</div>
                    {/if}

                  </div>
                {/each}
                <!-- Horizontal connectors between pairs - positioned at the vertical line junctions -->
                {#if roundIndex < rounds.length - 1}
                  {#each Array(Math.floor(round.matches.length / 2)) as _, pairIndex}
                    <div class="pair-connector" style="--pair-index: {pairIndex}; --total-pairs: {Math.floor(round.matches.length / 2)}; --total-matches: {round.matches.length}"></div>
                  {/each}
                {/if}
              </div>
            </div>
          {/each}

          <!-- 3rd/4th Place Match -->
          {#if thirdPlaceMatch}
            {@const thirdGamesCompleted = (thirdPlaceMatch.gamesWonA || 0) + (thirdPlaceMatch.gamesWonB || 0)}
            {@const thirdExpectedCurrentGame = thirdGamesCompleted + 1}
            {@const thirdMaxRoundGameNumber = thirdPlaceMatch.rounds?.length ? Math.max(...thirdPlaceMatch.rounds.map(r => r.gameNumber || 1)) : 1}
            {@const thirdCurrentGameNumber = Math.max(thirdExpectedCurrentGame, thirdMaxRoundGameNumber)}
            {@const thirdCurrentGameRounds = thirdPlaceMatch.rounds?.filter(r => (r.gameNumber || 1) === thirdCurrentGameNumber) || []}
            {@const thirdLivePointsA = thirdCurrentGameRounds.reduce((sum, r) => sum + (r.pointsA || 0), 0)}
            {@const thirdLivePointsB = thirdCurrentGameRounds.reduce((sum, r) => sum + (r.pointsB || 0), 0)}
            {@const thirdGamesLeaderA = thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdPlaceMatch.gamesWonA || 0) > (thirdPlaceMatch.gamesWonB || 0)}
            {@const thirdGamesLeaderB = thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdPlaceMatch.gamesWonB || 0) > (thirdPlaceMatch.gamesWonA || 0)}
            <div class="bracket-round third-place-round">
              <h2 class="round-name third-place">{m.tournament_thirdFourthPlace()}</h2>
              <div class="matches-column">
                <div
                  class="bracket-match third-place-match"
                  class:clickable={thirdPlaceMatch.participantA && thirdPlaceMatch.participantB}
                  onclick={() => handleMatchClick(thirdPlaceMatch, activeTab, bracket?.totalRounds || 1, true)}
                  onkeydown={(e) => e.key === 'Enter' && handleMatchClick(thirdPlaceMatch, activeTab, bracket?.totalRounds || 1, true)}
                  role="button"
                  tabindex="0"
                >
                  <!-- Round count badge (top-left) - shows current round of CURRENT GAME (played + 1) -->
                  {#if thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdCurrentGameRounds.length > 0 || thirdPlaceMatch.rounds?.length)}
                    <div class="rounds-badge">R{thirdCurrentGameRounds.length + 1}</div>
                  {/if}

                  <div
                    class="match-participant"
                    class:winner={thirdPlaceMatch.winner === thirdPlaceMatch.participantA}
                    class:tbd={!thirdPlaceMatch.participantA}
                    class:games-leader={thirdGamesLeaderA}
                  >
                    <span class="participant-name">{getParticipantName(thirdPlaceMatch.participantA)}</span>
                    {#if thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'WALKOVER'}
                      <span class="score">{showGamesWon ? (thirdPlaceMatch.gamesWonA || 0) : (thirdPlaceMatch.totalPointsA || 0)}</span>
                      {#if tournament.show20s && thirdPlaceMatch.total20sA !== undefined}
                        <span class="twenties">🎯{thirdPlaceMatch.total20sA}</span>
                      {/if}
                    {:else if thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdPlaceMatch.gamesWonA !== undefined || thirdPlaceMatch.rounds?.length)}
                      <!-- Solo mostrar puntos del juego actual -->
                      <span class="score in-progress">{thirdLivePointsA}</span>
                    {/if}
                  </div>

                  <div class="vs-divider"></div>

                  <div
                    class="match-participant"
                    class:winner={thirdPlaceMatch.winner === thirdPlaceMatch.participantB}
                    class:tbd={!thirdPlaceMatch.participantB}
                    class:games-leader={thirdGamesLeaderB}
                  >
                    <span class="participant-name">{getParticipantName(thirdPlaceMatch.participantB)}</span>
                    {#if thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'WALKOVER'}
                      <span class="score">{showGamesWon ? (thirdPlaceMatch.gamesWonB || 0) : (thirdPlaceMatch.totalPointsB || 0)}</span>
                      {#if tournament.show20s && thirdPlaceMatch.total20sB !== undefined}
                        <span class="twenties">🎯{thirdPlaceMatch.total20sB}</span>
                      {/if}
                    {:else if thirdPlaceMatch.status === 'IN_PROGRESS' && (thirdPlaceMatch.gamesWonB !== undefined || thirdPlaceMatch.rounds?.length)}
                      <!-- Solo mostrar puntos del juego actual -->
                      <span class="score in-progress">{thirdLivePointsB}</span>
                    {/if}
                  </div>

                  {#if thirdPlaceMatch.participantA && thirdPlaceMatch.participantB}
                    {@const statusInfo = getStatusDisplay(thirdPlaceMatch.status)}
                    <div class="status-badge" style="background: {statusInfo.color}">
                      {statusInfo.text}
                    </div>
                  {/if}

                  <!-- Table number badge - hide for completed matches since table is released -->
                  {#if thirdPlaceMatch.participantA && thirdPlaceMatch.participantB && thirdPlaceMatch.status !== 'COMPLETED'}
                    <div class="table-badge" class:tbd={!thirdPlaceMatch.tableNumber}>
                      {thirdPlaceMatch.tableNumber ? `${m.tournament_tableShort()}${thirdPlaceMatch.tableNumber}` : 'TBD'}
                    </div>
                  {/if}

                  <!-- Games won badge (bottom-left) - only for multi-game matches in progress -->
                  {#if thirdPlaceMatch.status === 'IN_PROGRESS' && getMatchesToWinForMatch(activeTab, 0, 1, false, true) > 1 && (thirdPlaceMatch.gamesWonA !== undefined || thirdPlaceMatch.gamesWonB !== undefined)}
                    {@const tgA = thirdPlaceMatch.gamesWonA || 0}
                    {@const tgB = thirdPlaceMatch.gamesWonB || 0}
                    {@const tHasLeader = tgA !== tgB}
                    <div class="games-badge" class:has-leader={tHasLeader} class:a-leads={tgA > tgB} class:b-leads={tgB > tgA}>
                      <span class:leading={tgA > tgB}>{tgA}</span>
                      <span class="separator">-</span>
                      <span class:leading={tgB > tgA}>{tgB}</span>
                    </div>
                  {/if}

                  <!-- 20s badge (bottom-right) - when in progress and show20s enabled, show current game 20s only -->
                  {#if thirdPlaceMatch.status === 'IN_PROGRESS' && tournament.show20s}
                    {@const thirdCurrentGame20sA = thirdCurrentGameRounds.reduce((sum, r) => sum + (r.twentiesA || 0), 0)}
                    {@const thirdCurrentGame20sB = thirdCurrentGameRounds.reduce((sum, r) => sum + (r.twentiesB || 0), 0)}
                    <div class="twenties-badge">🎯 {thirdCurrentGame20sA}-{thirdCurrentGame20sB}</div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
          {/if}

          <!-- Consolation Brackets Section -->
          {#if bracketView === 'consolation' && consolationBrackets.length === 0}
            <div class="consolation-empty" data-theme={$adminTheme}>
              <div class="empty-icon">🎯</div>
              <h3>{m.admin_consolationRounds()}</h3>
              <p>{m.admin_consolationPending() || 'Los partidos de consolación se generan automáticamente cuando se completa la ronda correspondiente (cuartos u octavos).'}</p>
              <button
                class="generate-consolation-btn"
                onclick={handleGenerateConsolation}
                disabled={isGeneratingConsolation}
              >
                {#if isGeneratingConsolation}
                  <span class="spinner"></span>
                  Generando...
                {:else}
                  🔄 Generar brackets de consolación
                {/if}
              </button>
            </div>
          {:else if bracketView === 'consolation' && consolationBrackets.length > 0}
            {@const r16Bracket = consolationBrackets.find(c => c.source === 'R16')}
            {@const qfBracket = consolationBrackets.find(c => c.source === 'QF')}
            <div class="consolation-section" data-theme={$adminTheme}>
              <div class="consolation-header">
                <h3 class="consolation-title">🎯 {m.bracket_consolationBrackets()}</h3>
                <button
                  class="regenerate-consolation-btn"
                  onclick={handleGenerateConsolation}
                  disabled={isGeneratingConsolation}
                  title={m.bracket_regenerateConsolation()}
                >
                  {#if isGeneratingConsolation}
                    <span class="spinner"></span> {m.bracket_regenerating()}
                  {:else}
                    🔄 {m.bracket_regenerate()}
                  {/if}
                </button>
              </div>
              <div class="consolation-unified">
                <!-- R16 consolation (9º-16º) -->
                {#if r16Bracket}
                  {#each r16Bracket.rounds as round, roundIndex}
                    <div class="bracket-round consolation-round" data-source="R16">
                      <div class="round-header">
                        {round.name}
                      </div>
                      <div class="matches-container">
                        {#each round.matches as match, matchIndex}
                          {@const isByeA = isBye(match.participantA)}
                          {@const isByeB = isBye(match.participantB)}
                          {@const isPlaceholderA = !isByeA && isLoserPlaceholder(match.participantA)}
                          {@const isPlaceholderB = !isByeB && isLoserPlaceholder(match.participantB)}
                          {@const displayNameA = isPlaceholderA ? getLoserPlaceholderDisplay(match.participantA) : getParticipantName(match.participantA)}
                          {@const displayNameB = isPlaceholderB ? getLoserPlaceholderDisplay(match.participantB) : getParticipantName(match.participantB)}
                          {@const hasRealParticipants = !isPlaceholderA && !isPlaceholderB && !isByeA && !isByeB && match.participantA && match.participantB}
                          {@const isMatchClickable = hasRealParticipants}
                          {@const isBothBye = isByeA && isByeB}
                          {@const isMatchBye = (isByeA || isByeB) && !isBothBye}
                          {@const finalRoundMatches = r16Bracket.rounds[r16Bracket.totalRounds - 1]?.matches.length || 1}
                          {@const positionLabel = getConsolationPositionLabel(r16Bracket.startPosition, r16Bracket.totalRounds, roundIndex, matchIndex, match.isThirdPlace || false, finalRoundMatches)}
                          {#if !isBothBye}
                          <div class="consolation-match-wrapper">
                            {#if positionLabel}
                              <div class="position-label">{positionLabel}</div>
                            {/if}
                            <div
                              class="bracket-match"
                              class:clickable={isMatchClickable}
                              class:bye-match={isMatchBye}
                              class:has-placeholder={isPlaceholderA || isPlaceholderB}
                              onclick={() => isMatchClickable && handleConsolationMatchClick(match, 'R16', roundIndex + 1)}
                              onkeydown={(e) => e.key === 'Enter' && isMatchClickable && handleConsolationMatchClick(match, 'R16', roundIndex + 1)}
                              role="button"
                              tabindex={isMatchClickable ? 0 : -1}
                            >
                            <div
                              class="match-participant"
                              class:winner={match.winner === match.participantA}
                              class:tbd={!match.participantA || isPlaceholderA}
                              class:bye={isByeA}
                            >
                              <span class="participant-name">{displayNameA}</span>
                              {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                                <span class="score">{showGamesWon ? (match.gamesWonA || 0) : (match.totalPointsA || 0)}</span>
                                {#if tournament.show20s && match.total20sA !== undefined}
                                  <span class="twenties">🎯{match.total20sA}</span>
                                {/if}
                              {:else if match.status === 'IN_PROGRESS'}
                                <span class="score in-progress">{showGamesWon ? (match.gamesWonA || 0) : (match.totalPointsA || 0)}</span>
                                {#if tournament.show20s && match.total20sA}
                                  <span class="twenties">🎯{match.total20sA}</span>
                                {/if}
                              {/if}
                            </div>

                            <div class="vs-divider"></div>

                            <div
                              class="match-participant"
                              class:winner={match.winner === match.participantB}
                              class:tbd={!match.participantB || isPlaceholderB}
                              class:bye={isByeB}
                            >
                              <span class="participant-name">{displayNameB}</span>
                              {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                                <span class="score">{showGamesWon ? (match.gamesWonB || 0) : (match.totalPointsB || 0)}</span>
                                {#if tournament.show20s && match.total20sB !== undefined}
                                  <span class="twenties">🎯{match.total20sB}</span>
                                {/if}
                              {:else if match.status === 'IN_PROGRESS'}
                                <span class="score in-progress">{showGamesWon ? (match.gamesWonB || 0) : (match.totalPointsB || 0)}</span>
                                {#if tournament.show20s && match.total20sB}
                                  <span class="twenties">🎯{match.total20sB}</span>
                                {/if}
                              {/if}
                            </div>

                            {#if hasRealParticipants}
                              {@const statusInfo = getStatusDisplay(match.status)}
                              <div class="status-badge" style="background: {statusInfo.color}">
                                {statusInfo.text}
                              </div>
                            {/if}

                            {#if hasRealParticipants && !isMatchBye && match.tableNumber}
                              <div class="table-badge">
                                {m.tournament_tableShort()}{match.tableNumber}
                              </div>
                            {/if}
                            </div>
                          </div>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/each}
                {/if}

                <!-- QF consolation (5º-8º) -->
                {#if qfBracket}
                  {#each qfBracket.rounds as round, roundIndex}
                    <div class="bracket-round consolation-round" class:qf-start={roundIndex === 0} data-source="QF">
                      <div class="round-header">
                        {round.name}
                      </div>
                      <div class="matches-container">
                        {#each round.matches as match, matchIndex}
                          {@const isByeA = isBye(match.participantA)}
                          {@const isByeB = isBye(match.participantB)}
                          {@const isPlaceholderA = !isByeA && isLoserPlaceholder(match.participantA)}
                          {@const isPlaceholderB = !isByeB && isLoserPlaceholder(match.participantB)}
                          {@const displayNameA = isPlaceholderA ? getLoserPlaceholderDisplay(match.participantA) : getParticipantName(match.participantA)}
                          {@const displayNameB = isPlaceholderB ? getLoserPlaceholderDisplay(match.participantB) : getParticipantName(match.participantB)}
                          {@const hasRealParticipants = !isPlaceholderA && !isPlaceholderB && !isByeA && !isByeB && match.participantA && match.participantB}
                          {@const isMatchClickable = hasRealParticipants}
                          {@const isBothBye = isByeA && isByeB}
                          {@const isMatchBye = (isByeA || isByeB) && !isBothBye}
                          {@const finalRoundMatches = qfBracket.rounds[qfBracket.totalRounds - 1]?.matches.length || 1}
                          {@const positionLabel = getConsolationPositionLabel(qfBracket.startPosition, qfBracket.totalRounds, roundIndex, matchIndex, match.isThirdPlace || false, finalRoundMatches)}
                          {#if !isBothBye}
                          <div class="consolation-match-wrapper">
                            {#if positionLabel}
                              <div class="position-label">{positionLabel}</div>
                            {/if}
                            <div
                              class="bracket-match"
                              class:clickable={isMatchClickable}
                              class:bye-match={isMatchBye}
                              class:has-placeholder={isPlaceholderA || isPlaceholderB}
                              onclick={() => isMatchClickable && handleConsolationMatchClick(match, 'QF', roundIndex + 1)}
                              onkeydown={(e) => e.key === 'Enter' && isMatchClickable && handleConsolationMatchClick(match, 'QF', roundIndex + 1)}
                              role="button"
                              tabindex={isMatchClickable ? 0 : -1}
                            >
                              <div
                                class="match-participant"
                                class:winner={match.winner === match.participantA}
                                class:tbd={!match.participantA || isPlaceholderA}
                                class:bye={isByeA}
                              >
                                <span class="participant-name">{displayNameA}</span>
                                {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                                  <span class="score">{showGamesWon ? (match.gamesWonA || 0) : (match.totalPointsA || 0)}</span>
                                  {#if tournament.show20s && match.total20sA !== undefined}
                                    <span class="twenties">🎯{match.total20sA}</span>
                                  {/if}
                                {:else if match.status === 'IN_PROGRESS'}
                                  <span class="score in-progress">{showGamesWon ? (match.gamesWonA || 0) : (match.totalPointsA || 0)}</span>
                                  {#if tournament.show20s && match.total20sA}
                                    <span class="twenties">🎯{match.total20sA}</span>
                                  {/if}
                                {/if}
                              </div>

                              <div class="vs-divider"></div>

                              <div
                                class="match-participant"
                                class:winner={match.winner === match.participantB}
                                class:tbd={!match.participantB || isPlaceholderB}
                                class:bye={isByeB}
                              >
                                <span class="participant-name">{displayNameB}</span>
                                {#if match.status === 'COMPLETED' || match.status === 'WALKOVER'}
                                  <span class="score">{showGamesWon ? (match.gamesWonB || 0) : (match.totalPointsB || 0)}</span>
                                  {#if tournament.show20s && match.total20sB !== undefined}
                                    <span class="twenties">🎯{match.total20sB}</span>
                                  {/if}
                                {:else if match.status === 'IN_PROGRESS'}
                                  <span class="score in-progress">{showGamesWon ? (match.gamesWonB || 0) : (match.totalPointsB || 0)}</span>
                                  {#if tournament.show20s && match.total20sB}
                                    <span class="twenties">🎯{match.total20sB}</span>
                                  {/if}
                                {/if}
                              </div>

                              {#if hasRealParticipants}
                                {@const statusInfo = getStatusDisplay(match.status)}
                                <div class="status-badge" style="background: {statusInfo.color}">
                                  {statusInfo.text}
                                </div>
                              {/if}

                              {#if hasRealParticipants && !isMatchBye && match.tableNumber}
                                <div class="table-badge">
                                  {m.tournament_tableShort()}{match.tableNumber}
                                </div>
                              {/if}
                            </div>
                          </div>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</AdminGuard>

{#if showMatchDialog && dialogMatch && tournament}
  <MatchResultDialog
    match={dialogMatch}
    participants={tournament.participants}
    {tournament}
    visible={showMatchDialog}
    isBracket={true}
    bracketRoundNumber={selectedRoundNumber}
    bracketTotalRounds={bracket?.totalRounds || 1}
    bracketIsThirdPlace={selectedIsThirdPlace}
    bracketIsSilver={selectedBracketType === 'silver'}
    isAdmin={true}
    onclose={handleCloseDialog}
    onsave={handleSaveMatch}
    onnoshow={handleNoShow}
  />
{/if}

<Toast bind:visible={showToast} message={toastMessage} type={toastType} />

<!-- Loading Overlay -->
{#if isAutoFilling || isSavingMatch}
  <div class="loading-overlay" data-theme={$adminTheme}>
    <div class="loading-content">
      <LoadingSpinner size="large" message={isAutoFilling ? m.bracket_fillingResults() : loadingMessage} />
    </div>
  </div>
{/if}

<TimeBreakdownModal
  bind:visible={showTimeBreakdown}
  breakdown={timeBreakdown}
  showRecalculate={true}
  onrecalculate={recalculateTime}
/>


<style>
  .bracket-page {
    min-height: 100vh;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .bracket-page[data-theme='dark'] {
    background: #0f1419;
  }

  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem 1.5rem;
    transition: background-color 0.3s, border-color 0.3s;
  }

  .bracket-page[data-theme='dark'] .page-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .back-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #555;
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .bracket-page[data-theme='dark'] .back-btn {
    background: #0f1419;
    color: #8b9bb3;
    border-color: #2d3748;
  }

  .back-btn:hover {
    transform: translateX(-2px);
    border-color: #667eea;
    color: #667eea;
  }

  .header-main {
    flex: 1;
    min-width: 0;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .title-section h1 {
    font-size: 1.1rem;
    margin: 0;
    color: #1a1a1a;
    font-weight: 700;
    white-space: nowrap;
    transition: color 0.3s;
  }

  .bracket-page[data-theme='dark'] .title-section h1 {
    color: #e1e8ed;
  }

  .header-badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .header-progress {
    margin-left: 0.5rem;
  }

  .info-badge {
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .info-badge.phase-badge {
    background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);
    color: white;
  }

  .tournament-status {
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    color: white;
    font-weight: 600;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .action-btn {
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .action-btn.autofill {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  .action-btn.autofill:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  }

  .action-btn.autofill:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .page-content {
    padding: 1.5rem;
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
  }

  .page-content::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .page-content::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 5px;
  }

  .page-content::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 5px;
  }

  .page-content::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
  }

  .bracket-page[data-theme='dark'] .page-content::-webkit-scrollbar-track {
    background: #0f1419;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #e5e7eb;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .error-state h3 {
    color: #1a1a1a;
    margin-bottom: 0.5rem;
    transition: color 0.3s;
  }

  .bracket-page[data-theme='dark'] .error-state h3 {
    color: #e1e8ed;
  }

  .error-state p {
    color: #666;
    margin-bottom: 1.5rem;
    transition: color 0.3s;
  }

  .bracket-page[data-theme='dark'] .error-state p {
    color: #8b9bb3;
  }

  .primary-button {
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
  }

  .primary-button:hover {
    transform: translateY(-2px);
  }

  .bracket-container {
    display: flex;
    gap: 6rem;
    padding: 0.75rem;
    min-width: max-content;
    align-items: stretch;
  }

  /* When showing consolation view, container should be block */
  .bracket-container:has(.consolation-section),
  .bracket-container:has(.consolation-empty) {
    display: block;
    min-width: 100%;
    padding: 0;
  }

  .bracket-container > .consolation-section,
  .bracket-container > .consolation-empty {
    width: 100%;
  }

  .bracket-round {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 200px;
    position: relative;
  }

  .round-name {
    font-size: 0.85rem;
    font-weight: 700;
    color: #1a1a1a;
    text-align: center;
    margin: 0 0 0.5rem 0;
    padding: 0.4rem 0.6rem;
    background: white;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    transition: all 0.2s;
  }

  .bracket-page[data-theme='dark'] .round-name {
    background: #1a2332;
    color: #e1e8ed;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  /* Final round styling - gold/prominent (default) */
  .bracket-round:not(.third-place-round):last-of-type .round-name,
  .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .round-name {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f;
    box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4);
  }

  .bracket-page[data-theme='dark'] .bracket-round:not(.third-place-round):last-of-type .round-name,
  .bracket-page[data-theme='dark'] .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .round-name {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f;
  }

  /* Final round styling - silver bracket */
  .silver-bracket .bracket-round:not(.third-place-round):last-of-type .round-name,
  .silver-bracket .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .round-name {
    background: linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%);
    color: #374151;
    box-shadow: 0 4px 12px rgba(156, 163, 175, 0.4);
  }

  .bracket-page[data-theme='dark'] .silver-bracket .bracket-round:not(.third-place-round):last-of-type .round-name,
  .bracket-page[data-theme='dark'] .silver-bracket .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .round-name {
    background: linear-gradient(135deg, #6b7280 0%, #9ca3af 100%);
    color: #e5e7eb;
  }

  .matches-column {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    justify-content: space-around;
    position: relative;
    flex: 1;
  }

  /* Centering for final round (last round before 3rd place) */
  .bracket-round:not(.third-place-round):last-of-type .matches-column,
  .bracket-round:nth-last-of-type(2):not(.third-place-round):has(+ .third-place-round) .matches-column {
    justify-content: center;
  }

  .bracket-match {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.4rem 0.5rem;
    position: relative;
    transition: all 0.15s;
  }

  /* Connector lines between rounds */
  /* Each match has a horizontal line going right (::after) */
  .bracket-match::after {
    content: '';
    position: absolute;
    left: 100%;
    top: 50%;
    width: 3rem;
    height: 2px;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    transform: translateY(-50%);
    z-index: 0;
  }

  .bracket-page[data-theme='dark'] .bracket-match::after {
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  }

  /* Remove connector from true final round (no 3rd place after) */
  .bracket-round:last-child:not(.third-place-round) .bracket-match::after {
    display: none;
  }

  /* But show connector when there's a 3rd place match after */
  .bracket-round:nth-last-child(2):not(.third-place-round) .bracket-match::after {
    display: block;
    width: 9rem;
    background: linear-gradient(90deg, #b8956e 0%, #d4a574 100%);
  }

  /* Vertical connector lines for pairs of matches */
  .bracket-match::before {
    content: '';
    position: absolute;
    left: calc(100% + 3rem);
    width: 2px;
    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
    z-index: 0;
  }

  .bracket-page[data-theme='dark'] .bracket-match::before {
    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  }

  /* Top match in pair - vertical line goes down */
  .bracket-match:nth-child(odd)::before {
    top: 50%;
  }

  /* Bottom match in pair - vertical line goes up */
  .bracket-match:nth-child(even)::before {
    bottom: 50%;
  }

  /* Dynamic vertical line height based on round index */
  /* Round 0 (first round): base height = 100% + 2rem (match height + gap) */
  /* Each subsequent round doubles: 2^roundIndex * base */
  .bracket-round[style*="--round-index: 0"] .bracket-match::before {
    height: calc(100% + 1.6rem);  /* 1x */
  }
  .bracket-round[style*="--round-index: 1"] .bracket-match::before {
    height: calc(200% + 3rem);  /* 2x */
  }
  .bracket-round[style*="--round-index: 2"] .bracket-match::before {
    height: calc(400% + 6rem);  /* 4x */
  }
  .bracket-round[style*="--round-index: 3"] .bracket-match::before {
    height: calc(800% + 12rem); /* 8x */
  }
  .bracket-round[style*="--round-index: 4"] .bracket-match::before {
    height: calc(1600% + 24rem); /* 16x */
  }

  /* Remove vertical connectors from final round */
  .bracket-round:last-child .bracket-match::before {
    display: none;
  }

  /* For single match rounds (like finals), hide the vertical line */
  .matches-column:has(> :only-child) .bracket-match::before {
    display: none;
  }

  /* Horizontal connector from the vertical line junction to next round */
  /* Each connector is positioned at the midpoint between a pair of matches */
  .pair-connector {
    position: absolute;
    width: 3rem;
    height: 2px;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    right: -6rem;
    z-index: 1;
    /* Calculate vertical position: each pair spans 2 matches + 1 gap (2rem) */
    /* For pair N: top = (2N + 1) / totalMatches * 100% approximately */
    /* Using CSS calc with custom properties */
    top: calc((var(--pair-index) * 2 + 1) / var(--total-matches) * 100%);
  }

  .bracket-page[data-theme='dark'] .pair-connector {
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  }

  .bracket-page[data-theme='dark'] .bracket-match {
    background: #1a2332;
    border-color: #2d3748;
  }

  .bracket-match.clickable {
    cursor: pointer;
  }

  .bracket-match.clickable:hover {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
    transform: translateY(-2px);
  }

  /* BYE match styling - dimmed appearance since no real match played */
  .bracket-match.bye-match {
    opacity: 0.6;
    border-style: dashed;
    cursor: default;
  }

  .bracket-page[data-theme='dark'] .bracket-match.bye-match {
    opacity: 0.5;
  }

  /* BYE matches still need connector lines to show where winner goes */
  /* Keep horizontal line but hide vertical connectors for bye matches */
  .bracket-match.bye-match::before {
    display: none;
  }

  .match-participant.bye {
    opacity: 0.4;
    font-style: italic;
    color: #9ca3af;
  }

  .bracket-page[data-theme='dark'] .match-participant.bye {
    color: #6b7280;
  }

  .match-participant {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.3rem 0.4rem;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .match-participant.tbd {
    opacity: 0.5;
    font-style: italic;
  }

  .match-participant.placeholder {
    opacity: 0.6;
    font-style: italic;
    font-size: 0.75rem;
    color: #6366f1;
  }

  .bracket-page[data-theme='dark'] .match-participant.placeholder {
    color: #818cf8;
  }

  .consolation-match.has-placeholder {
    opacity: 0.8;
    border-style: dashed;
  }

  .match-participant.winner {
    background: #f0fdf4;
    font-weight: 700;
    box-shadow: 0 0 0 1px #10b981;
  }

  .bracket-page[data-theme='dark'] .match-participant.winner {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
  }

  /* Líder en partidas ganadas (durante IN_PROGRESS) */
  .match-participant.games-leader {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(109, 40, 217, 0.1) 100%);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.5);
    animation: pulse-leader 2s ease-in-out infinite;
  }

  .match-participant.games-leader .participant-name {
    font-weight: 700;
    color: #7c3aed;
  }

  @keyframes pulse-leader {
    0%, 100% { box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.5); }
    50% { box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.7), 0 0 12px rgba(139, 92, 246, 0.3); }
  }

  .bracket-page[data-theme='dark'] .match-participant.games-leader {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(109, 40, 217, 0.2) 100%);
  }

  .bracket-page[data-theme='dark'] .match-participant.games-leader .participant-name {
    color: #a78bfa;
  }

  .participant-name {
    flex: 1;
    font-size: 0.75rem;
    color: #1a1a1a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bracket-page[data-theme='dark'] .participant-name {
    color: #e1e8ed;
  }

  .seed {
    font-size: 0.6rem;
    color: #6b7280;
    margin: 0 0.3rem;
  }

  .bracket-page[data-theme='dark'] .seed {
    color: #9ca3af;
  }

  .score {
    font-size: 0.85rem;
    font-weight: 700;
    color: #667eea;
    min-width: 1rem;
    text-align: center;
  }

  .score.in-progress {
    color: #f59e0b;
    animation: pulse-score 2s ease-in-out infinite;
  }

  @keyframes pulse-score {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .twenties {
    font-size: 0.6rem;
    font-weight: 600;
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.1);
    padding: 0.1rem 0.2rem;
    border-radius: 3px;
    margin-left: 0.15rem;
  }

  .vs-divider {
    height: 1px;
    background: #e5e7eb;
    margin: 0.25rem 0;
  }

  .bracket-page[data-theme='dark'] .vs-divider {
    background: #2d3748;
  }

  .bracket-page[data-theme='dark'] .twenties {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.15);
  }

  .status-badge {
    position: absolute;
    top: -8px;
    right: 6px;
    padding: 0.15rem 0.4rem;
    color: white;
    border-radius: 3px;
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .rounds-badge {
    position: absolute;
    top: -8px;
    left: 6px;
    padding: 0.15rem 0.35rem;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    border-radius: 3px;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    animation: pulse-badge 2s ease-in-out infinite;
  }

  @keyframes pulse-badge {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.9; transform: scale(1.01); }
  }

  .bracket-page[data-theme='dark'] .rounds-badge {
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
  }

  .games-badge {
    position: absolute;
    bottom: -10px;
    left: 10px;
    padding: 0.25rem 0.5rem;
    background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
    color: white;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .games-badge .separator {
    opacity: 0.7;
  }

  .games-badge.has-leader {
    animation: pulse-winner 1.5s ease-in-out infinite;
  }

  .games-badge .leading {
    font-size: 0.85rem;
    color: #fef08a;
    text-shadow: 0 0 4px rgba(254, 240, 138, 0.5);
  }

  @keyframes pulse-winner {
    0%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4); }
    50% { transform: scale(1.05); box-shadow: 0 4px 12px rgba(139, 92, 246, 0.6); }
  }

  .bracket-page[data-theme='dark'] .games-badge {
    background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
  }

  .bracket-page[data-theme='dark'] .games-badge .leading {
    color: #fde047;
  }

  .twenties-badge {
    position: absolute;
    bottom: -10px;
    right: 10px;
    padding: 0.25rem 0.5rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .bracket-page[data-theme='dark'] .twenties-badge {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  }

  .table-badge {
    position: absolute;
    top: 50%;
    right: -1.7rem;
    transform: translateY(-50%);
    padding: 0.15rem 0.35rem;
    background: #e2e8f0;
    border: 1px solid #cbd5e1;
    color: #475569;
    border-radius: 3px;
    font-family: 'Lexend', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    white-space: nowrap;
    z-index: 5;
  }

  .table-badge.tbd {
    background: #fef3c7;
    border-color: #fcd34d;
    color: #92400e;
  }

  .bracket-page[data-theme='dark'] .table-badge {
    background: #334155;
    border-color: #475569;
    color: #cbd5e1;
  }

  .bracket-page[data-theme='dark'] .table-badge.tbd {
    background: #422006;
    border-color: #a16207;
    color: #fcd34d;
  }

  /* 3rd/4th place match styles */
  .third-place-round {
    margin-left: 2rem;
  }

  .round-name.third-place {
    background: linear-gradient(135deg, #d4a574 0%, #b8956e 100%);
    color: #5c4033;
    box-shadow: 0 2px 6px rgba(180, 137, 94, 0.3);
  }

  .bracket-page[data-theme='dark'] .round-name.third-place {
    background: linear-gradient(135deg, #a67c52 0%, #8b6914 100%);
    color: #fef3c7;
  }

  .third-place-match {
    border-color: #b8956e;
  }

  .third-place-match::after,
  .third-place-match::before {
    display: none !important;
  }

  .third-place-round .matches-column::after {
    display: none !important;
  }

  .bracket-pending {
    background: #6b7280;
    color: white;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  /* Global Table Config */
  .global-table-config {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 0.75rem;
  }

  .bracket-page[data-theme='dark'] .global-table-config {
    background: #1e293b;
    border-color: #334155;
  }

  .table-config-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #64748b;
  }

  .table-config-label svg {
    opacity: 0.7;
  }

  .table-config-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  /* Configuration Accordion */
  .config-accordion {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 1rem;
    overflow: hidden;
  }

  .bracket-page[data-theme='dark'] .config-accordion {
    background: #1e293b;
    border-color: #334155;
  }

  .accordion-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.35rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .accordion-header:hover {
    background: rgba(0, 0, 0, 0.03);
  }

  .bracket-page[data-theme='dark'] .accordion-header:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .accordion-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #475569;
  }

  .bracket-page[data-theme='dark'] .accordion-title {
    color: #94a3b8;
  }

  .accordion-icon {
    transition: transform 0.2s ease;
    color: #64748b;
  }

  .config-accordion.expanded .accordion-icon {
    transform: rotate(90deg);
  }

  .accordion-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .summary-badge {
    padding: 0.2rem 0.5rem;
    background: #e2e8f0;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    color: #475569;
  }

  .bracket-page[data-theme='dark'] .summary-badge {
    background: #334155;
    color: #94a3b8;
  }

  .accordion-content {
    padding: 0 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .config-section {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 0.75rem;
  }

  .bracket-page[data-theme='dark'] .config-section {
    background: #0f172a;
    border-color: #334155;
  }

  .config-section-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #64748b;
    margin-bottom: 0.6rem;
  }

  .config-section-title svg {
    opacity: 0.7;
  }

  .table-config-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Phase Configuration Panel */
  .phase-config-panel {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }

  .bracket-page[data-theme='dark'] .phase-config-panel {
    background: #1e293b;
    border-color: #334155;
  }

  .phase-config-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #64748b;
    margin-bottom: 0.75rem;
  }

  .config-icon {
    font-size: 1rem;
  }

  .phase-config-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .phase-config-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    position: relative;
  }

  .bracket-page[data-theme='dark'] .phase-config-item {
    background: #0f172a;
    border-color: #334155;
  }

  .phase-config-item.locked {
    opacity: 0.6;
  }

  .phase-config-item label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #475569;
    min-width: 60px;
  }

  .bracket-page[data-theme='dark'] .phase-config-item label {
    color: #94a3b8;
  }

  .config-inputs {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .config-inputs select {
    padding: 0.25rem 0.5rem;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 0.75rem;
    background: white;
    cursor: pointer;
  }

  .bracket-page[data-theme='dark'] .config-inputs select {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
  }

  .config-inputs input[type="number"] {
    width: 45px;
    padding: 0.25rem 0.35rem;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 0.75rem;
    text-align: center;
  }

  .bracket-page[data-theme='dark'] .config-inputs input[type="number"] {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
  }

  .config-inputs select:disabled,
  .config-inputs input:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .bo-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #64748b;
    margin-left: 0.25rem;
  }

  .bo-select {
    width: 52px;
    padding: 0.25rem 0.4rem;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 0.75rem;
    background: white;
    cursor: pointer;
  }

  .bracket-page[data-theme='dark'] .bo-select {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
  }

  .lock-icon {
    font-size: 0.7rem;
    margin-left: 0.25rem;
  }

  /* Table Configuration Panel - matches phase-config style */
  .table-config-panel {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }

  .bracket-page[data-theme='dark'] .table-config-panel {
    background: #1e293b;
    border-color: #334155;
  }

  .table-config-panel .table-config-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  .bracket-page[data-theme='dark'] .table-config-panel .table-config-item {
    background: #0f172a;
    border-color: #334155;
  }

  .table-config-item label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #475569;
    min-width: 70px;
  }

  .table-config-item label svg {
    opacity: 0.7;
  }

  .bracket-page[data-theme='dark'] .table-config-item label {
    color: #94a3b8;
  }

  .table-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .table-value {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 28px;
    padding: 0 0.5rem;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #334155;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .table-value:hover {
    background: #e2e8f0;
    border-color: #cbd5e1;
  }

  .bracket-page[data-theme='dark'] .table-value {
    background: #334155;
    border-color: #475569;
    color: #e2e8f0;
  }

  .bracket-page[data-theme='dark'] .table-value:hover {
    background: #475569;
  }

  .table-number-input {
    width: 48px;
    height: 28px;
    padding: 0 0.35rem;
    border: 1px solid #3b82f6;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: center;
    background: white;
    color: #334155;
    outline: none;
  }

  .bracket-page[data-theme='dark'] .table-number-input {
    background: #1e293b;
    border-color: #60a5fa;
    color: #e2e8f0;
  }

  .table-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .table-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .table-action-btn.sync {
    background: #3b82f6;
    color: white;
  }

  .table-action-btn.sync:hover:not(:disabled) {
    background: #2563eb;
  }

  .table-action-btn.confirm {
    background: #10b981;
    color: white;
  }

  .table-action-btn.confirm:hover:not(:disabled) {
    background: #059669;
  }

  .table-action-btn.cancel {
    background: #64748b;
    color: white;
  }

  .table-action-btn.cancel:hover:not(:disabled) {
    background: #475569;
  }

  .table-action-btn .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Bracket filters bar */
  .bracket-filters {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  .bracket-page[data-theme='dark'] .bracket-filters {
    background: #1a2332;
    border-color: #2d3748;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .filter-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .bracket-page[data-theme='dark'] .filter-label {
    color: #8b9bb3;
  }

  .filter-options {
    display: flex;
    gap: 0.25rem;
    padding: 0.2rem;
    background: #e2e8f0;
    border-radius: 6px;
  }

  .bracket-page[data-theme='dark'] .filter-options {
    background: #0f1419;
  }

  .filter-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    border: none;
    border-radius: 5px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    background: transparent;
    color: #64748b;
  }

  .bracket-page[data-theme='dark'] .filter-btn {
    color: #8b9bb3;
  }

  .filter-btn:hover:not(.active) {
    color: #334155;
    background: rgba(255, 255, 255, 0.5);
  }

  .bracket-page[data-theme='dark'] .filter-btn:hover:not(.active) {
    color: #e1e8ed;
    background: rgba(255, 255, 255, 0.05);
  }

  .filter-btn.active {
    background: white;
    color: #1e293b;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .bracket-page[data-theme='dark'] .filter-btn.active {
    background: #2d3748;
    color: #e1e8ed;
  }

  .filter-icon {
    font-size: 0.65rem;
    line-height: 1;
  }

  .filter-icon.gold {
    color: #f59e0b;
  }

  .filter-icon.silver {
    color: #9ca3af;
  }

  .filter-complete {
    color: #10b981;
    font-weight: 600;
    font-size: 0.75rem;
  }

  .filter-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 0.35rem;
    background: #e2e8f0;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 600;
    color: #64748b;
  }

  .filter-btn.active .filter-count {
    background: #e2e8f0;
  }

  .bracket-page[data-theme='dark'] .filter-count {
    background: #374151;
    color: #9ca3af;
  }

  .bracket-page[data-theme='dark'] .filter-btn.active .filter-count {
    background: #1a2332;
  }

  /* Mobile optimizations for screens <= 640px */
  @media (max-width: 640px) {
    .page-header {
      padding: 0.5rem 0.75rem;
    }

    .header-row {
      gap: 0.5rem;
    }

    .back-btn {
      width: 32px;
      height: 32px;
      font-size: 1rem;
    }

    .title-section {
      gap: 0.5rem;
    }

    .title-section h1 {
      font-size: 0.95rem;
    }

    .header-badges {
      gap: 0.35rem;
    }

    .info-badge {
      font-size: 0.65rem;
      padding: 0.15rem 0.4rem;
    }

    .action-btn {
      padding: 0.4rem 0.5rem;
      font-size: 0.9rem;
    }

    .page-content {
      padding: 0.75rem;
    }

    .bracket-filters {
      gap: 1rem;
      padding: 0.5rem 0.75rem;
    }

    .filter-label {
      font-size: 0.75rem;
    }

    .filter-btn {
      padding: 0.4rem 0.7rem;
      font-size: 0.8rem;
    }
  }

  @media (max-width: 768px) {
    .page-header {
      padding: 0.5rem 0.75rem;
    }

    .page-content {
      padding: 0.5rem;
    }

    .bracket-container {
      gap: 6rem;
    }

    .bracket-round {
      min-width: 200px;
    }

    .round-name {
      font-size: 1rem;
      padding: 0.6rem;
    }

    .bracket-match {
      padding: 0.6rem;
    }

    .match-participant {
      padding: 0.5rem;
    }

    .participant-name {
      font-size: 0.85rem;
    }

    .third-place-round {
      margin-left: 1rem;
    }

    .bracket-round:nth-last-child(2):not(.third-place-round) .bracket-match::after {
      width: 4rem;
    }

    .bracket-filters {
      flex-wrap: wrap;
      gap: 0.75rem;
      padding: 0.5rem;
    }

    .filter-group {
      gap: 0.5rem;
    }

    .filter-btn {
      padding: 0.35rem 0.6rem;
      font-size: 0.78rem;
    }
  }

  /* Extra small screens */
  @media (max-width: 480px) {
    .page-header {
      padding: 0.4rem 0.5rem;
    }

    .back-btn {
      width: 28px;
      height: 28px;
      font-size: 0.9rem;
    }

    .title-section h1 {
      font-size: 0.85rem;
    }

    .info-badge {
      font-size: 0.6rem;
    }

    .bracket-filters {
      gap: 0.5rem;
      padding: 0.4rem;
    }

    .filter-label {
      font-size: 0.7rem;
    }

    .filter-options {
      gap: 0.15rem;
      padding: 0.15rem;
    }

    .filter-btn {
      padding: 0.3rem 0.5rem;
      font-size: 0.75rem;
      gap: 0.25rem;
    }

    .filter-icon {
      font-size: 0.55rem;
    }
  }

  /* Loading Overlay */
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
  }

  .loading-content {
    background: white;
    padding: 2rem 3rem;
    border-radius: 12px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .loading-overlay[data-theme='dark'] .loading-content {
    background: #1a2332;
  }

  .loading-overlay .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e5e7eb;
    border-top-color: #10b981;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    font-size: 1.1rem;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 0.5rem;
  }

  .loading-overlay[data-theme='dark'] .loading-text {
    color: #e1e8ed;
  }

  .loading-subtext {
    font-size: 0.85rem;
    color: #6b7280;
    margin: 0;
  }

  .loading-overlay[data-theme='dark'] .loading-subtext {
    color: #8b9bb3;
  }

  /* Consolation Brackets Section */
  .consolation-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    text-align: center;
    background: #f8fafc;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
  }

  .consolation-empty[data-theme='dark'] {
    background: #1e293b;
    border-color: #334155;
  }

  .consolation-empty .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.7;
  }

  .consolation-empty h3 {
    margin: 0 0 0.75rem 0;
    font-size: 1.25rem;
    color: #1f2937;
  }

  .consolation-empty[data-theme='dark'] h3 {
    color: #e1e8ed;
  }

  .consolation-empty p {
    margin: 0;
    color: #6b7280;
    max-width: 400px;
    line-height: 1.5;
  }

  .consolation-empty[data-theme='dark'] p {
    color: #8b9bb3;
  }

  .generate-consolation-btn {
    margin-top: 1.5rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;
  }

  .generate-consolation-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .generate-consolation-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .generate-consolation-btn .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .consolation-section {
    padding: 1.5rem;
    background: #f8fafc;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
  }

  .consolation-section[data-theme='dark'] {
    background: #1e293b;
    border-color: #334155;
  }

  .consolation-bracket-group {
    margin-bottom: 2rem;
  }

  .consolation-bracket-group:last-child {
    margin-bottom: 0;
  }

  .consolation-group-header {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid #e2e8f0;
  }

  .consolation-section[data-theme='dark'] .consolation-group-header {
    border-bottom-color: #334155;
  }

  .consolation-group-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #334155;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .consolation-section[data-theme='dark'] .consolation-group-title {
    color: #e2e8f0;
  }

  .consolation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .consolation-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #334155;
    margin: 0;
  }

  .consolation-section[data-theme='dark'] .consolation-title {
    color: #e2e8f0;
  }

  .consolation-tabs {
    display: flex;
    gap: 0.5rem;
  }

  .consolation-tab {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: white;
    color: #64748b;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .consolation-tab:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  .consolation-tab.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  .consolation-section[data-theme='dark'] .consolation-tab {
    background: #0f172a;
    border-color: #475569;
    color: #94a3b8;
  }

  .consolation-section[data-theme='dark'] .consolation-tab:hover {
    border-color: #60a5fa;
    color: #60a5fa;
  }

  .consolation-section[data-theme='dark'] .consolation-tab.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  .complete-badge {
    color: #10b981;
    font-size: 0.75rem;
  }

  .consolation-bracket {
    margin-top: 0.5rem;
  }

  .consolation-rounds {
    display: flex;
    gap: 1.5rem;
    overflow-x: auto;
    padding: 0.5rem 0;
  }

  /* Unified horizontal layout for all consolation brackets */
  .consolation-unified {
    display: flex;
    flex-direction: row;
    gap: 3.5rem;
    overflow-x: auto;
    padding: 0.5rem 0;
    align-items: flex-start;
  }

  .regenerate-consolation-btn {
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .regenerate-consolation-btn:hover:not(:disabled) {
    background: #2563eb;
  }

  .regenerate-consolation-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .consolation-section[data-theme='dark'] .regenerate-consolation-btn {
    background: #2563eb;
  }

  .consolation-section[data-theme='dark'] .regenerate-consolation-btn:hover:not(:disabled) {
    background: #3b82f6;
  }

  .consolation-round {
    min-width: 200px;
    flex-shrink: 0;
  }

  .consolation-round .matches-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding-top: 0.5rem;
  }

  .consolation-match-wrapper {
    position: relative;
  }

  .position-label {
    position: absolute;
    top: -0.5rem;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.65rem;
    font-weight: 700;
    color: #fff;
    text-align: center;
    padding: 0.1rem 0.4rem;
    background: #6366f1;
    border-radius: 3px;
    white-space: nowrap;
    z-index: 5;
  }

  .consolation-section[data-theme='dark'] .position-label {
    color: #fff;
    background: #818cf8;
  }

  /* Visual separator between R16 and QF sections */
  .consolation-round.qf-start {
    position: relative;
    margin-left: 2rem;
    padding-left: 1.5rem;
  }

  .consolation-round.qf-start::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(to bottom, transparent, #cbd5e1 20%, #cbd5e1 80%, transparent);
  }

  .consolation-section[data-theme='dark'] .consolation-round.qf-start::before {
    background: linear-gradient(to bottom, transparent, #475569 20%, #475569 80%, transparent);
  }

  .consolation-round .round-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #e2e8f0;
  }

  .consolation-section[data-theme='dark'] .consolation-round .round-header {
    color: #94a3b8;
    border-color: #475569;
  }

  .round-matches {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .consolation-match {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 0.75rem;
    transition: all 0.15s ease;
  }

  .consolation-match.clickable {
    cursor: pointer;
  }

  .consolation-match.clickable:hover {
    border-color: #3b82f6;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
  }

  .consolation-match.completed {
    border-color: #10b981;
    background: #f0fdf4;
  }

  .consolation-section[data-theme='dark'] .consolation-match {
    background: #0f172a;
    border-color: #334155;
  }

  .consolation-section[data-theme='dark'] .consolation-match.clickable:hover {
    border-color: #60a5fa;
    box-shadow: 0 2px 8px rgba(96, 165, 250, 0.15);
  }

  .consolation-section[data-theme='dark'] .consolation-match.completed {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.1);
  }

  .consolation-match.bye-match {
    opacity: 0.6;
    border-style: dashed;
    background: #f8fafc;
  }

  .consolation-section[data-theme='dark'] .consolation-match.bye-match {
    background: rgba(15, 23, 42, 0.5);
  }

  /* Hide connector lines in consolation brackets - they don't make sense there */
  .consolation-section .bracket-match::before,
  .consolation-section .bracket-match::after,
  .consolation-round .bracket-match::before,
  .consolation-round .bracket-match::after {
    display: none !important;
  }

  .match-participant.bye {
    opacity: 0.5;
    font-style: italic;
  }

  .match-participant {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0;
    color: #475569;
    font-size: 0.85rem;
  }

  .match-participant.winner {
    color: #10b981;
    font-weight: 600;
  }

  .consolation-section[data-theme='dark'] .match-participant {
    color: #94a3b8;
  }

  .consolation-section[data-theme='dark'] .match-participant.winner {
    color: #10b981;
  }

  .match-vs {
    text-align: center;
    font-size: 0.7rem;
    color: #94a3b8;
    padding: 0.15rem 0;
  }

  .games-won {
    font-weight: 700;
    font-size: 0.9rem;
    color: #3b82f6;
  }

  .consolation-positions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    background: #ecfdf5;
    border-radius: 8px;
  }

  .consolation-section[data-theme='dark'] .consolation-positions {
    background: rgba(16, 185, 129, 0.15);
  }

  .positions-label {
    font-size: 0.85rem;
    color: #047857;
    font-weight: 500;
  }

  .positions-complete {
    font-size: 0.85rem;
    font-weight: 600;
    color: #10b981;
  }

  .consolation-section[data-theme='dark'] .positions-label {
    color: #34d399;
  }

  @media (max-width: 640px) {
    .consolation-section {
      padding: 1rem;
    }

    .consolation-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .consolation-rounds {
      gap: 1rem;
    }

    .consolation-round {
      min-width: 160px;
    }
  }
</style>
