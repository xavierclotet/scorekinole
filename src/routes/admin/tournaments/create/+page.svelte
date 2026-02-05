<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import PairSelector from '$lib/components/tournament/PairSelector.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import { goto } from '$app/navigation';
  import { createTournament, searchUsers, getTournament, updateTournament, searchTournamentNames, checkTournamentKeyExists, checkTournamentQuota, type TournamentNameInfo } from '$lib/firebase/tournaments';
  import { addParticipants } from '$lib/firebase/tournamentParticipants';
  import type { TournamentParticipant, RankingConfig, TournamentTier } from '$lib/types/tournament';
  import { getTierInfo, getPointsDistribution } from '$lib/algorithms/ranking';
  import type { UserProfile } from '$lib/firebase/userProfile';
  import CountrySelect from '$lib/components/CountrySelect.svelte';
  import { DEFAULT_TIME_CONFIG } from '$lib/firebase/timeConfig';
  import { calculateTournamentTimeEstimate } from '$lib/utils/tournamentTime';
  import type { TournamentTimeConfig } from '$lib/types/tournament';
  import * as m from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';

  // Edit mode
  let editMode = $state(false);
  let editTournamentId = $state<string | null>(null);

  // Duplicate mode
  let duplicateMode = $state(false);

  // Wizard state
  let currentStep = $state(1);
  const totalSteps = 6;

  // Toast state
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType = $state<'success' | 'error' | 'info' | 'warning'>('info');

  // Quota state
  let quotaInfo = $state<{ canCreate: boolean; used: number; limit: number; isSuperAdmin: boolean } | null>(null);
  let quotaLoading = $state(true);

  // Step 1: Basic Info
  let key = $state('');
  let name = $state('');
  let description = $state('');
  let edition = $state<number | undefined>(undefined);
  let country = $state('España');
  let city = $state('');
  let address = $state('');
  let tournamentDate = $state(new Date().toISOString().split('T')[0]);  // Date input string (YYYY-MM-DD), defaults to today
  let gameType = $state<'singles' | 'doubles'>('singles');
  let show20s = $state(true);
  let showHammer = $state(true);

  // Step 2: Tournament Format
  let numTables = $state(4);
  let phaseType = $state<'ONE_PHASE' | 'TWO_PHASE'>('TWO_PHASE');
  let groupStageType = $state<'ROUND_ROBIN' | 'SWISS'>('ROUND_ROBIN');
  let numGroups = $state(1);
  let numSwissRounds = $state(5);
  let qualificationMode = $state<'WINS' | 'POINTS'>('WINS');  // WINS = 2/1/0 (both RR and Swiss), POINTS = total points scored

  // Group stage game config
  let groupGameMode = $state<'points' | 'rounds'>('rounds');
  let groupPointsToWin = $state(7);
  let groupRoundsToPlay = $state(4);
  let groupMatchesToWin = $state(1);

  // Final stage game config (only for TWO_PHASE)
  let finalStageMode = $state<'SINGLE_BRACKET' | 'SPLIT_DIVISIONS'>('SINGLE_BRACKET');

  // Consolation bracket config (for both TWO_PHASE and ONE_PHASE)
  // Auto-detects level based on bracket size: >=16 players = R16+QF, >=8 = QF only
  let consolationEnabled = $state(false);

  // 3rd/4th place match config (semifinal losers play for 3rd place)
  let thirdPlaceMatchEnabled = $state(true);

  // Gold bracket config (or single bracket if SINGLE_BRACKET mode)
  let finalGameMode = $state<'points' | 'rounds'>('points');
  let finalPointsToWin = $state(9);
  let finalRoundsToPlay = $state(4);
  let finalMatchesToWin = $state(1);
  // Silver bracket config (only for SPLIT_DIVISIONS mode) - default: 4 rounds, best of 1
  let silverGameMode = $state<'points' | 'rounds'>('rounds');
  let silverPointsToWin = $state(7);
  let silverRoundsToPlay = $state(4);
  let silverMatchesToWin = $state(1);

  // Advanced bracket phase configuration
  let showAdvancedBracketConfig = $state(false);
  // Review step accordion
  let participantsExpanded = $state(false);
  // Early rounds (octavos, cuartos)
  let earlyRoundsGameMode = $state<'points' | 'rounds'>('rounds');
  let earlyRoundsPointsToWin = $state(7);
  let earlyRoundsToPlay = $state(4);
  let earlyRoundsMatchesToWin = $state(1);
  // Semifinals
  let semifinalGameMode = $state<'points' | 'rounds'>('points');
  let semifinalPointsToWin = $state(7);
  let semifinalRoundsToPlay = $state(4);
  let semifinalMatchesToWin = $state(1);
  // Final
  let bracketFinalGameMode = $state<'points' | 'rounds'>('points');
  let bracketFinalPointsToWin = $state(9);
  let bracketFinalRoundsToPlay = $state(4);
  let bracketFinalMatchesToWin = $state(1);
  // Silver bracket advanced config (default: all phases to 4 rounds)
  let silverEarlyRoundsGameMode = $state<'points' | 'rounds'>('rounds');
  let silverEarlyRoundsPointsToWin = $state(7);
  let silverEarlyRoundsToPlay = $state(4);
  let silverEarlyRoundsMatchesToWin = $state(1);
  let silverSemifinalGameMode = $state<'points' | 'rounds'>('rounds');
  let silverSemifinalPointsToWin = $state(7);
  let silverSemifinalRoundsToPlay = $state(4);
  let silverSemifinalMatchesToWin = $state(1);
  let silverBracketFinalGameMode = $state<'points' | 'rounds'>('rounds');
  let silverBracketFinalPointsToWin = $state(7);
  let silverBracketFinalRoundsToPlay = $state(4);
  let silverBracketFinalMatchesToWin = $state(1);

  // Backward compatibility: for ONE_PHASE tournaments
  let gameMode = $state<'points' | 'rounds'>('points');
  let pointsToWin = $state(7);
  let roundsToPlay = $state(4);
  let matchesToWin = $state(3);

  // Step 3: Ranking Configuration
  let rankingEnabled = $state(false);
  let selectedTier = $state<TournamentTier>('CLUB');

  // Step 4: Participants
  let participants = $state<Partial<TournamentParticipant>[]>([]);

  // Natural sort function for names (handles "Player1" vs "Player11" correctly)
  function naturalSort(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  // Sorted participants for display
  let sortedParticipants = $derived(
    [...participants].sort((a, b) => naturalSort(a.name || '', b.name || ''))
  );

  let searchQuery = $state('');
  let searchResults = $state<(UserProfile & { userId: string })[]>([]);
  let searchLoading = $state(false);
  let guestName = $state('');  // Input for guest player name
  let guestNameMatchedUser = $state<(UserProfile & { userId: string }) | null>(null);  // User that matches guest name

  // Tournament name search
  let tournamentNameResults = $state<TournamentNameInfo[]>([]);
  let nameSearchLoading = $state(false);
  let showNameDropdown = $state(false);

  // Tournament key validation
  let keyCheckLoading = $state(false);
  let keyCheckResult = $state<{ exists: boolean; name?: string } | null>(null);
  let keyCheckTimeout: ReturnType<typeof setTimeout> | null = null;

  // Track touched fields for showing errors
  let touchedFields = $state<Set<string>>(new Set());

  // Validation
  let validationErrors = $state<string[]>([]);
  let validationWarnings = $state<string[]>([]);

  // Field-specific error checks
  let keyHasError = $derived(touchedFields.has('key') && (!/^[A-Z0-9]{6}$/.test(key) || keyCheckResult?.exists));
  let nameHasError = $derived(touchedFields.has('name') && !name.trim());
  let editionHasError = $derived(touchedFields.has('edition') && edition !== undefined && (edition < 1 || edition > 1000));
  let countryHasError = $derived(touchedFields.has('country') && !country);
  let cityHasError = $derived(touchedFields.has('city') && !city.trim());

  // Loading state
  let creating = $state(false);

  // Step 5: Time Configuration (per-tournament settings)
  let tcMinutesPer4RoundsSingles = $state(DEFAULT_TIME_CONFIG.minutesPer4RoundsSingles);
  let tcMinutesPer4RoundsDoubles = $state(DEFAULT_TIME_CONFIG.minutesPer4RoundsDoubles);
  let tcAvgRounds5pts = $state(DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[5] || 4);
  let tcAvgRounds7pts = $state(DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[7] || 6);
  let tcAvgRounds9pts = $state(DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[9] || 8);
  let tcAvgRounds11pts = $state(DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[11] || 10);
  let tcBreakBetweenMatches = $state(DEFAULT_TIME_CONFIG.breakBetweenMatches);
  let tcBreakBetweenPhases = $state(DEFAULT_TIME_CONFIG.breakBetweenPhases);
  let tcParallelSemifinals = $state(DEFAULT_TIME_CONFIG.parallelSemifinals);
  let tcParallelFinals = $state(DEFAULT_TIME_CONFIG.parallelFinals);

  // Computed timeConfig from local variables
  let timeConfig = $derived({
    minutesPer4RoundsSingles: tcMinutesPer4RoundsSingles,
    minutesPer4RoundsDoubles: tcMinutesPer4RoundsDoubles,
    avgRoundsForPointsMode: {
      5: tcAvgRounds5pts,
      7: tcAvgRounds7pts,
      9: tcAvgRounds9pts,
      11: tcAvgRounds11pts
    },
    breakBetweenMatches: tcBreakBetweenMatches,
    breakBetweenPhases: tcBreakBetweenPhases,
    parallelSemifinals: tcParallelSemifinals,
    parallelFinals: tcParallelFinals
  } as TournamentTimeConfig);

  // LocalStorage key
  const STORAGE_KEY = 'tournamentWizardDraft';

  // Generate random 6-character alphanumeric key
  function generateRandomKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure only valid characters and exactly 6 length
    return result.replace(/[^A-Z0-9]/g, '').substring(0, 6).toUpperCase();
  }

  onMount(async () => {
    // Check quota first (not needed for edit mode)
    quotaLoading = true;
    quotaInfo = await checkTournamentQuota();
    quotaLoading = false;

    // Check if in edit or duplicate mode
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    const duplicateId = urlParams.get('duplicate');

    if (editId) {
      editMode = true;
      editTournamentId = editId;
      await loadTournamentForEdit(editId);
    } else if (duplicateId) {
      duplicateMode = true;
      await loadTournamentForDuplication(duplicateId);
    } else {
      // Generate random key for new tournaments first
      key = generateRandomKey();
      // Then load draft (may override if draft has key)
      loadDraft();
    }
  });

  async function loadTournamentForEdit(tournamentId: string) {
    try {
      const tournament = await getTournament(tournamentId);
      if (!tournament) {
        toastMessage = 'Error: Torneo no encontrado';
        toastType = 'error';
        showToast = true;
        setTimeout(() => goto('/admin/tournaments'), 2000);
        return;
      }

      if (tournament.status !== 'DRAFT') {
        toastMessage = 'Solo se pueden editar torneos en estado DRAFT';
        toastType = 'error';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}`), 2000);
        return;
      }

      // Load all tournament data into form fields
      // Step 1
      key = tournament.key;
      name = tournament.name;
      description = tournament.description || '';
      edition = tournament.edition || 1;
      country = tournament.country || '';
      city = tournament.city || '';
      address = tournament.address || '';
      tournamentDate = tournament.tournamentDate ? new Date(tournament.tournamentDate).toISOString().split('T')[0] : '';
      gameType = tournament.gameType;

      // Step 2
      numTables = tournament.numTables;
      phaseType = tournament.phaseType;
      show20s = tournament.show20s;
      showHammer = tournament.showHammer;
      consolationEnabled = tournament.finalStage?.consolationEnabled ?? false;
      thirdPlaceMatchEnabled = tournament.finalStage?.thirdPlaceMatchEnabled ?? true;

      // Load game config based on phase type
      if (tournament.phaseType === 'TWO_PHASE') {
        // For two-phase tournaments, load from groupStage object
        if (tournament.groupStage) {
          groupStageType = tournament.groupStage.type || 'ROUND_ROBIN';
          groupGameMode = tournament.groupStage.gameMode || 'rounds';
          groupPointsToWin = tournament.groupStage.pointsToWin || 7;
          groupRoundsToPlay = tournament.groupStage.roundsToPlay || 4;
          groupMatchesToWin = tournament.groupStage.matchesToWin || 1;
          numGroups = tournament.groupStage.numGroups || 2;
          numSwissRounds = tournament.groupStage.numSwissRounds || 4;
          qualificationMode = tournament.groupStage.qualificationMode || tournament.groupStage.rankingSystem || tournament.groupStage.swissRankingSystem || 'WINS';
        } else {
          // Legacy fallback: read from tournament root level (old tournament format)
          const legacyTournament = tournament as any;
          groupStageType = legacyTournament.groupStageType || 'ROUND_ROBIN';
          groupGameMode = legacyTournament.gameMode || 'rounds';
          groupPointsToWin = legacyTournament.pointsToWin || 7;
          groupRoundsToPlay = legacyTournament.roundsToPlay || 4;
          groupMatchesToWin = legacyTournament.matchesToWin || 1;
          numGroups = legacyTournament.numGroups || 2;
          numSwissRounds = legacyTournament.numSwissRounds || 4;
        }

        // Final stage config from goldBracket.config
        if (tournament.finalStage?.goldBracket?.config) {
          const goldConfig = tournament.finalStage.goldBracket.config;
          finalStageMode = tournament.finalStage.mode || 'SINGLE_BRACKET';
          // Use final phase config as the main display values
          finalGameMode = goldConfig.final?.gameMode || 'points';
          finalPointsToWin = goldConfig.final?.pointsToWin || 7;
          finalRoundsToPlay = goldConfig.final?.roundsToPlay || 4;
          finalMatchesToWin = goldConfig.final?.matchesToWin || 1;

          // Silver bracket config
          if (tournament.finalStage.silverBracket?.config) {
            const silverConfig = tournament.finalStage.silverBracket.config;
            silverGameMode = silverConfig.final?.gameMode || 'rounds';
            silverPointsToWin = silverConfig.final?.pointsToWin || 7;
            silverRoundsToPlay = silverConfig.final?.roundsToPlay || 4;
            silverMatchesToWin = silverConfig.final?.matchesToWin || 1;
          } else {
            silverGameMode = 'rounds';
            silverPointsToWin = 7;
            silverRoundsToPlay = 4;
            silverMatchesToWin = 1;
          }
        } else if (tournament.finalStage) {
          finalStageMode = tournament.finalStage.mode || 'SINGLE_BRACKET';
          // Defaults
          finalGameMode = 'points';
          finalPointsToWin = 7;
          finalRoundsToPlay = 4;
          finalMatchesToWin = 1;
          silverGameMode = 'rounds';
          silverPointsToWin = 7;
          silverRoundsToPlay = 4;
          silverMatchesToWin = 1;
        } else {
          finalStageMode = 'SINGLE_BRACKET';
          finalGameMode = 'points';
          finalPointsToWin = 7;
          finalRoundsToPlay = 4;
          finalMatchesToWin = 1;
          // Silver bracket default: 4 rounds, best of 1
          silverGameMode = 'rounds';
          silverPointsToWin = 7;
          silverRoundsToPlay = 4;
          silverMatchesToWin = 1;
        }
      } else {
        // ONE_PHASE: load from goldBracket.config
        if (tournament.finalStage?.goldBracket?.config) {
          const config = tournament.finalStage.goldBracket.config;
          gameMode = config.final?.gameMode || 'points';
          pointsToWin = config.final?.pointsToWin || 7;
          roundsToPlay = config.final?.roundsToPlay || 4;
          matchesToWin = config.final?.matchesToWin || 3;
        } else {
          // Legacy fallback (old tournament format)
          const legacyTournament = tournament as any;
          gameMode = legacyTournament.gameMode || 'points';
          pointsToWin = legacyTournament.pointsToWin || 7;
          roundsToPlay = legacyTournament.roundsToPlay || 4;
          matchesToWin = legacyTournament.matchesToWin || 3;
        }
      }

      // Step 3
      rankingEnabled = tournament.rankingConfig?.enabled ?? false;
      selectedTier = tournament.rankingConfig?.tier || 'CLUB';

      // Step 4 - Load participants
      participants = tournament.participants.map(p => ({
        type: p.type,
        userId: p.userId,
        name: p.name,
        email: p.email,
        partner: p.partner
      }));

      guestName = `Player${participants.length + 1}`;

      // Step 5 - Load time configuration
      if (tournament.timeConfig) {
        tcMinutesPer4RoundsSingles = tournament.timeConfig.minutesPer4RoundsSingles ?? DEFAULT_TIME_CONFIG.minutesPer4RoundsSingles;
        tcMinutesPer4RoundsDoubles = tournament.timeConfig.minutesPer4RoundsDoubles ?? DEFAULT_TIME_CONFIG.minutesPer4RoundsDoubles;
        tcAvgRounds5pts = tournament.timeConfig.avgRoundsForPointsMode?.[5] ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[5];
        tcAvgRounds7pts = tournament.timeConfig.avgRoundsForPointsMode?.[7] ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[7];
        tcAvgRounds9pts = tournament.timeConfig.avgRoundsForPointsMode?.[9] ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[9];
        tcAvgRounds11pts = tournament.timeConfig.avgRoundsForPointsMode?.[11] ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[11];
        tcBreakBetweenMatches = tournament.timeConfig.breakBetweenMatches ?? DEFAULT_TIME_CONFIG.breakBetweenMatches;
        tcBreakBetweenPhases = tournament.timeConfig.breakBetweenPhases ?? DEFAULT_TIME_CONFIG.breakBetweenPhases;
        tcParallelSemifinals = tournament.timeConfig.parallelSemifinals ?? DEFAULT_TIME_CONFIG.parallelSemifinals;
        tcParallelFinals = tournament.timeConfig.parallelFinals ?? DEFAULT_TIME_CONFIG.parallelFinals;
      }

      console.log('✅ Tournament loaded for editing');
    } catch (error) {
      console.error('❌ Error loading tournament for edit:', error);
      toastMessage = 'Error al cargar el torneo';
      toastType = 'error';
      showToast = true;
    }
  }

  async function loadTournamentForDuplication(tournamentId: string) {
    try {
      const tournament = await getTournament(tournamentId);
      if (!tournament) {
        toastMessage = 'Error: Torneo no encontrado';
        toastType = 'error';
        showToast = true;
        setTimeout(() => goto('/admin/tournaments'), 2000);
        return;
      }

      // Generate new key for the duplicate
      key = generateRandomKey();

      // Load all tournament data (same as edit, but increment edition)
      // Step 1
      name = tournament.name;  // Keep same name, user can modify
      description = tournament.description || '';
      edition = (tournament.edition || 1) + 1;  // Increment edition
      country = tournament.country || '';
      city = tournament.city || '';
      address = tournament.address || '';
      // Set date to today for the new tournament
      tournamentDate = new Date().toISOString().split('T')[0];
      gameType = tournament.gameType;

      // Step 2
      numTables = tournament.numTables;
      phaseType = tournament.phaseType;
      show20s = tournament.show20s;
      showHammer = tournament.showHammer;
      consolationEnabled = tournament.finalStage?.consolationEnabled ?? false;
      thirdPlaceMatchEnabled = tournament.finalStage?.thirdPlaceMatchEnabled ?? true;

      // Load game config based on phase type (same logic as loadTournamentForEdit)
      if (tournament.phaseType === 'TWO_PHASE') {
        if (tournament.groupStage) {
          groupStageType = tournament.groupStage.type || 'ROUND_ROBIN';
          groupGameMode = tournament.groupStage.gameMode || 'rounds';
          groupPointsToWin = tournament.groupStage.pointsToWin || 7;
          groupRoundsToPlay = tournament.groupStage.roundsToPlay || 4;
          groupMatchesToWin = tournament.groupStage.matchesToWin || 1;
          numGroups = tournament.groupStage.numGroups || 2;
          numSwissRounds = tournament.groupStage.numSwissRounds || 4;
          qualificationMode = tournament.groupStage.qualificationMode || tournament.groupStage.rankingSystem || tournament.groupStage.swissRankingSystem || 'WINS';
        } else {
          // Legacy fallback (old tournament format)
          const legacyTournament = tournament as any;
          groupStageType = legacyTournament.groupStageType || 'ROUND_ROBIN';
          groupGameMode = legacyTournament.gameMode || 'rounds';
          groupPointsToWin = legacyTournament.pointsToWin || 7;
          groupRoundsToPlay = legacyTournament.roundsToPlay || 4;
          groupMatchesToWin = legacyTournament.matchesToWin || 1;
          numGroups = legacyTournament.numGroups || 2;
          numSwissRounds = legacyTournament.numSwissRounds || 4;
        }

        if (tournament.finalStage?.goldBracket?.config) {
          const goldConfig = tournament.finalStage.goldBracket.config;
          finalStageMode = tournament.finalStage.mode || 'SINGLE_BRACKET';
          finalGameMode = goldConfig.final?.gameMode || 'points';
          finalPointsToWin = goldConfig.final?.pointsToWin || 7;
          finalRoundsToPlay = goldConfig.final?.roundsToPlay || 4;
          finalMatchesToWin = goldConfig.final?.matchesToWin || 1;
          if (tournament.finalStage.silverBracket?.config) {
            const silverConfig = tournament.finalStage.silverBracket.config;
            silverGameMode = silverConfig.final?.gameMode || 'rounds';
            silverPointsToWin = silverConfig.final?.pointsToWin || 7;
            silverRoundsToPlay = silverConfig.final?.roundsToPlay || 4;
            silverMatchesToWin = silverConfig.final?.matchesToWin || 1;
          } else {
            silverGameMode = 'rounds';
            silverPointsToWin = 7;
            silverRoundsToPlay = 4;
            silverMatchesToWin = 1;
          }
        } else if (tournament.finalStage) {
          finalStageMode = tournament.finalStage.mode || 'SINGLE_BRACKET';
          finalGameMode = 'points';
          finalPointsToWin = 7;
          finalRoundsToPlay = 4;
          finalMatchesToWin = 1;
          silverGameMode = 'rounds';
          silverPointsToWin = 7;
          silverRoundsToPlay = 4;
          silverMatchesToWin = 1;
        } else {
          finalStageMode = 'SINGLE_BRACKET';
          finalGameMode = 'points';
          finalPointsToWin = 7;
          finalRoundsToPlay = 4;
          finalMatchesToWin = 1;
          silverGameMode = 'rounds';
          silverPointsToWin = 7;
          silverRoundsToPlay = 4;
          silverMatchesToWin = 1;
        }
      } else {
        if (tournament.finalStage?.goldBracket?.config) {
          const config = tournament.finalStage.goldBracket.config;
          gameMode = config.final?.gameMode || 'points';
          pointsToWin = config.final?.pointsToWin || 7;
          roundsToPlay = config.final?.roundsToPlay || 4;
          matchesToWin = config.final?.matchesToWin || 3;
        } else {
          gameMode = 'points';
          pointsToWin = 7;
          roundsToPlay = 4;
          matchesToWin = 3;
        }
      }

      // Step 3
      rankingEnabled = tournament.rankingConfig?.enabled ?? false;
      selectedTier = tournament.rankingConfig?.tier || 'CLUB';

      // Step 4 - Copy participants (without match data)
      participants = tournament.participants.map(p => ({
        type: p.type,
        userId: p.userId,
        name: p.name,
        email: p.email,
        partner: p.partner
      }));

      guestName = `Player${participants.length + 1}`;

      // Step 5 - Copy time configuration
      if (tournament.timeConfig) {
        tcMinutesPer4RoundsSingles = tournament.timeConfig.minutesPer4RoundsSingles ?? DEFAULT_TIME_CONFIG.minutesPer4RoundsSingles;
        tcMinutesPer4RoundsDoubles = tournament.timeConfig.minutesPer4RoundsDoubles ?? DEFAULT_TIME_CONFIG.minutesPer4RoundsDoubles;
        tcAvgRounds5pts = tournament.timeConfig.avgRoundsForPointsMode?.[5] ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[5];
        tcAvgRounds7pts = tournament.timeConfig.avgRoundsForPointsMode?.[7] ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[7];
        tcAvgRounds9pts = tournament.timeConfig.avgRoundsForPointsMode?.[9] ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[9];
        tcAvgRounds11pts = tournament.timeConfig.avgRoundsForPointsMode?.[11] ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[11];
        tcBreakBetweenMatches = tournament.timeConfig.breakBetweenMatches ?? DEFAULT_TIME_CONFIG.breakBetweenMatches;
        tcBreakBetweenPhases = tournament.timeConfig.breakBetweenPhases ?? DEFAULT_TIME_CONFIG.breakBetweenPhases;
        tcParallelSemifinals = tournament.timeConfig.parallelSemifinals ?? DEFAULT_TIME_CONFIG.parallelSemifinals;
        tcParallelFinals = tournament.timeConfig.parallelFinals ?? DEFAULT_TIME_CONFIG.parallelFinals;
      }

      // Go directly to step 6 (review) since all data is pre-filled
      currentStep = 6;

      toastMessage = `Torneo cargado para duplicar (Edición #${edition})`;
      toastType = 'success';
      showToast = true;
      console.log('✅ Tournament loaded for duplication');
    } catch (error) {
      console.error('❌ Error loading tournament for duplication:', error);
      toastMessage = 'Error al cargar el torneo';
      toastType = 'error';
      showToast = true;
    }
  }

  function loadDraft() {
    if (typeof localStorage === 'undefined') return;

    try {
      const draft = localStorage.getItem(STORAGE_KEY);
      if (!draft) return;

      const data = JSON.parse(draft);

      // Step 1
      key = data.key || key; // Keep generated key if no draft key
      name = data.name || '';
      description = data.description || '';
      edition = data.edition || 1;
      country = data.country || '';
      city = data.city || '';
      tournamentDate = data.tournamentDate || '';
      gameType = data.gameType || 'singles';

      // Step 2
      numTables = data.numTables || 2;
      phaseType = data.phaseType || 'TWO_PHASE';
      groupStageType = data.groupStageType || 'ROUND_ROBIN';
      numGroups = data.numGroups || 2;
      numSwissRounds = data.numSwissRounds || 4;
      qualificationMode = data.qualificationMode || data.rankingSystem || data.swissRankingSystem || 'WINS';
      show20s = data.show20s ?? true;
      showHammer = data.showHammer ?? true;

      // Load phase-specific game config
      groupGameMode = data.groupGameMode || 'rounds';
      groupPointsToWin = data.groupPointsToWin || 7;
      groupRoundsToPlay = data.groupRoundsToPlay || 4;
      groupMatchesToWin = data.groupMatchesToWin || 1;

      // Final stage config
      finalStageMode = data.finalStageMode || 'SINGLE_BRACKET';
      finalGameMode = data.finalGameMode || 'points';
      finalPointsToWin = data.finalPointsToWin || 7;
      finalRoundsToPlay = data.finalRoundsToPlay || 4;
      finalMatchesToWin = data.finalMatchesToWin || 1;

      // Silver bracket config - default: 4 rounds, best of 1
      silverGameMode = data.silverGameMode || 'rounds';
      silverPointsToWin = data.silverPointsToWin || 7;
      silverRoundsToPlay = data.silverRoundsToPlay || 4;
      silverMatchesToWin = data.silverMatchesToWin || 1;

      // Backward compatibility for ONE_PHASE
      gameMode = data.gameMode || 'points';
      pointsToWin = data.pointsToWin || 7;
      roundsToPlay = data.roundsToPlay || 4;
      matchesToWin = data.matchesToWin || 3;

      // Step 3
      rankingEnabled = data.rankingEnabled ?? false;
      selectedTier = data.selectedTier || 'CLUB';

      // Step 4
      participants = data.participants || [];

      // Update guest name to next player number
      guestName = `Player${participants.length + 1}`;

      // Step 5 - Time configuration
      tcMinutesPer4RoundsSingles = data.tcMinutesPer4RoundsSingles ?? DEFAULT_TIME_CONFIG.minutesPer4RoundsSingles;
      tcMinutesPer4RoundsDoubles = data.tcMinutesPer4RoundsDoubles ?? DEFAULT_TIME_CONFIG.minutesPer4RoundsDoubles;
      tcAvgRounds5pts = data.tcAvgRounds5pts ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[5];
      tcAvgRounds7pts = data.tcAvgRounds7pts ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[7];
      tcAvgRounds9pts = data.tcAvgRounds9pts ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[9];
      tcAvgRounds11pts = data.tcAvgRounds11pts ?? DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[11];
      tcBreakBetweenMatches = data.tcBreakBetweenMatches ?? DEFAULT_TIME_CONFIG.breakBetweenMatches;
      tcBreakBetweenPhases = data.tcBreakBetweenPhases ?? DEFAULT_TIME_CONFIG.breakBetweenPhases;
      tcParallelSemifinals = data.tcParallelSemifinals ?? DEFAULT_TIME_CONFIG.parallelSemifinals;
      tcParallelFinals = data.tcParallelFinals ?? DEFAULT_TIME_CONFIG.parallelFinals;

      console.log('✅ Tournament draft loaded from localStorage');
    } catch (error) {
      console.error('❌ Error loading tournament draft:', error);
    }
  }

  function saveDraft() {
    // Don't save draft in edit or duplicate mode
    if (editMode || duplicateMode) return;
    if (typeof localStorage === 'undefined') return;

    try {
      const data = {
        key,
        name,
        description,
        edition,
        country,
        city,
        tournamentDate,
        gameType,
        numTables,
        phaseType,
        groupStageType,
        numGroups,
        numSwissRounds,
        qualificationMode,
        groupGameMode,
        groupPointsToWin,
        groupRoundsToPlay,
        groupMatchesToWin,
        // Final stage config
        finalStageMode,
        finalGameMode,
        finalPointsToWin,
        finalRoundsToPlay,
        finalMatchesToWin,
        // Silver bracket config
        silverGameMode,
        silverPointsToWin,
        silverRoundsToPlay,
        silverMatchesToWin,
        // ONE_PHASE backward compatibility
        gameMode,
        pointsToWin,
        roundsToPlay,
        matchesToWin,
        show20s,
        showHammer,
        rankingEnabled,
        selectedTier,
        participants,
        // Time configuration
        tcMinutesPer4RoundsSingles,
        tcMinutesPer4RoundsDoubles,
        tcAvgRounds5pts,
        tcAvgRounds7pts,
        tcAvgRounds9pts,
        tcAvgRounds11pts,
        tcBreakBetweenMatches,
        tcBreakBetweenPhases,
        tcParallelSemifinals,
        tcParallelFinals
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('❌ Error saving tournament draft:', error);
    }
  }

  function clearDraft() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    console.log('✅ Tournament draft cleared');
  }

  async function handleSearch() {
    if (searchQuery.length < 2) {
      searchResults = [];
      return;
    }

    searchLoading = true;
    const results = await searchUsers(searchQuery) as (UserProfile & { userId: string })[];
    // Filter out users already added as participants
    const addedUserIds = participants
      .filter(p => p.type === 'REGISTERED' && p.userId)
      .map(p => p.userId);
    searchResults = results.filter(u => !addedUserIds.includes(u.userId));
    searchLoading = false;
  }

  // Check if tournament key already exists (with debounce)
  async function checkKeyExists(keyValue: string) {
    // Clear previous timeout
    if (keyCheckTimeout) {
      clearTimeout(keyCheckTimeout);
    }

    // Reset state if key is incomplete
    if (!keyValue || keyValue.length !== 6) {
      keyCheckResult = null;
      keyCheckLoading = false;
      return;
    }

    // Debounce the check
    keyCheckTimeout = setTimeout(async () => {
      keyCheckLoading = true;
      const result = await checkTournamentKeyExists(
        keyValue,
        editMode ? editTournamentId || undefined : undefined
      );
      keyCheckResult = result;
      keyCheckLoading = false;
    }, 300);
  }

  // Handle key input change
  function handleKeyInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const newKey = target.value.replace(/[^A-Z0-9]/g, '').toUpperCase().substring(0, 6);
    key = newKey;
    checkKeyExists(newKey);
  }

  // Mark a field as touched (for showing validation errors)
  function markTouched(field: string) {
    touchedFields = new Set([...touchedFields, field]);
  }

  async function handleNameSearch() {
    if (name.length < 2) {
      tournamentNameResults = [];
      showNameDropdown = false;
      return;
    }

    nameSearchLoading = true;
    tournamentNameResults = await searchTournamentNames(name);
    showNameDropdown = tournamentNameResults.length > 0;
    nameSearchLoading = false;
  }

  function selectTournamentName(info: TournamentNameInfo) {
    name = info.name;
    // Auto-fill next edition number
    edition = info.maxEdition + 1;
    // Auto-fill description, country, and city from previous edition
    if (info.description) {
      description = info.description;
    }
    if (info.country) {
      country = info.country;
    }
    if (info.city) {
      city = info.city;
    }
    if (info.address) {
      address = info.address;
    }
    showNameDropdown = false;
    tournamentNameResults = [];
  }

  function handleNameInputBlur() {
    // Delay hiding dropdown to allow click on results
    setTimeout(() => {
      showNameDropdown = false;
    }, 200);
  }

  function handleNameInputFocus() {
    if (tournamentNameResults.length > 0) {
      showNameDropdown = true;
    }
  }

  function addRegisteredUser(user: UserProfile & { userId?: string }) {
    const alreadyAdded = participants.some(p => p.userId === user.userId);
    if (alreadyAdded) {
      toastMessage = 'Este usuario ya está agregado';
      toastType = 'warning';
      showToast = true;
      return;
    }

    participants = [
      ...participants,
      {
        type: 'REGISTERED',
        userId: user.userId,
        name: user.playerName,
        email: user.email || undefined,
        rankingSnapshot: user.ranking || 0
      }
    ];

    // Remove added user from search results without clearing the search query
    searchResults = searchResults.filter(u => u.userId !== user.userId);
    saveDraft(); // Save after adding participant
  }

  async function checkGuestNameMatch() {
    if (!guestName || guestName.trim().length < 3) {
      guestNameMatchedUser = null;
      return;
    }

    // Search for exact name match (case-insensitive)
    const results = await searchUsers(guestName.trim()) as (UserProfile & { userId: string })[];
    const exactMatch = results.find(
      u => u.playerName?.toLowerCase() === guestName.trim().toLowerCase()
    );

    guestNameMatchedUser = exactMatch || null;
  }

  async function addGuestPlayer() {
    if (!guestName || guestName.trim().length < 3) return;

    // Check for existing user with same name
    await checkGuestNameMatch();

    if (guestNameMatchedUser) {
      // User exists - auto-fill search and show suggestion
      searchQuery = guestName.trim();
      await handleSearch();
      toastMessage = `Existe un usuario registrado con el nombre "${guestName}". Añádelo desde la lista de usuarios.`;
      toastType = 'warning';
      showToast = true;
      return;
    }

    participants = [
      ...participants,
      {
        type: 'GUEST',
        name: guestName.trim(),
        rankingSnapshot: 0
      }
    ];

    // Set next player number based on total participants
    guestName = `Player${participants.length + 1}`;
    guestNameMatchedUser = null;
    saveDraft(); // Save after adding guest
  }

  function removeParticipant(participant: Partial<TournamentParticipant>) {
    participants = participants.filter(p => p !== participant);
    saveDraft(); // Save after removing participant
  }

  function getStep1Errors(): string[] {
    const errors: string[] = [];
    if (!name.trim()) {
      errors.push(m.wizard_errorNameRequired());
    }
    if (!/^[A-Z0-9]{6}$/.test(key)) {
      errors.push(m.wizard_errorKeyFormat());
    }
    if (keyCheckResult?.exists) {
      errors.push(m.wizard_errorKeyInUse({ key }));
    }
    if (edition !== undefined && (edition < 1 || edition > 1000)) {
      errors.push(m.wizard_errorEditionRange());
    }
    if (!country) {
      errors.push(m.wizard_errorCountryRequired());
    }
    if (!city.trim()) {
      errors.push(m.wizard_errorCityRequired());
    }
    return errors;
  }

  function getStep2Errors(): string[] {
    const errors: string[] = [];
    if (numTables < 1) {
      errors.push(m.wizard_errorMinTables());
    }
    if (phaseType === 'TWO_PHASE' && groupStageType === 'ROUND_ROBIN' && numGroups < 1) {
      errors.push(m.wizard_errorMinGroups());
    }
    if (phaseType === 'TWO_PHASE' && groupStageType === 'SWISS' && numSwissRounds < 3) {
      errors.push(m.wizard_errorSwissMinRounds());
    }
    return errors;
  }

  function getStep3Errors(): string[] {
    const errors: string[] = [];
    if (rankingEnabled && !selectedTier) {
      errors.push(m.wizard_errorSelectTier());
    }
    return errors;
  }

  function getStep4Errors(): string[] {
    const errors: string[] = [];
    if (participants.length < 2) {
      errors.push(m.wizard_errorMinParticipants());
    }
    return errors;
  }

  function getStep4Warnings(): string[] {
    const warnings: string[] = [];
    if (gameType === 'doubles') {
      if (participants.length % 2 !== 0) {
        warnings.push(m.wizard_warningDoublesEven());
      }
    }
    return warnings;
  }

  function getValidationForStep(step: number): [string[], string[]] {
    if (step === 1) {
      return [getStep1Errors(), []];
    } else if (step === 2) {
      return [getStep2Errors(), []];
    } else if (step === 3) {
      return [getStep3Errors(), []];
    } else if (step === 4) {
      return [getStep4Errors(), getStep4Warnings()];
    }
    return [[], []];
  }

  function validateCurrentStep(): boolean {
    [validationErrors, validationWarnings] = getValidationForStep(currentStep);
    return validationErrors.length === 0;
  }

  function nextStep() {
    if (!validateCurrentStep()) {
      return;
    }

    if (currentStep < totalSteps) {
      currentStep++;
      saveDraft(); // Save draft when moving forward
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
    }
  }

  function goToStep(step: number) {
    // Allow free navigation between steps
    if (step >= 1 && step <= totalSteps) {
      currentStep = step;
    }
  }

  // Helper function to remove undefined values from object
  function cleanObject(obj: any): any {
    if (Array.isArray(obj)) {
      // For arrays, clean each element
      return obj.map(item => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return cleanObject(item);
        }
        return item;
      }).filter(item => item !== undefined && item !== null);
    }

    if (typeof obj === 'object' && obj !== null) {
      const cleaned: any = {};
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        // Only add if value is not undefined and not null
        // Allow empty strings, false, and 0 as valid values
        if (value !== undefined && value !== null) {
          // If it's a nested object, clean it recursively
          if (typeof value === 'object' && !Array.isArray(value)) {
            cleaned[key] = cleanObject(value);
          } else if (Array.isArray(value)) {
            // Clean arrays recursively
            cleaned[key] = cleanObject(value);
          } else {
            cleaned[key] = value;
          }
        }
      });
      return cleaned;
    }

    return obj;
  }

  async function createTournamentSubmit() {
    if (!validateCurrentStep()) {
      return;
    }

    // Re-check quota before creating (not needed for edit mode)
    if (!editMode) {
      const freshQuota = await checkTournamentQuota();
      if (!freshQuota.canCreate) {
        toastMessage = m.admin_tournamentLimitReached({ used: String(quotaInfo?.used || 0), limit: String(quotaInfo?.limit || 0) })
          .replace('{used}', freshQuota.used.toString())
          .replace('{limit}', freshQuota.limit.toString());
        toastType = 'error';
        showToast = true;
        return;
      }
    }

    creating = true;

    try {
      const rankingConfig: RankingConfig = {
        enabled: rankingEnabled,
        tier: selectedTier
      };

      // Build tournament data with phase-specific configuration
      const tournamentData: any = {
        key: key.toUpperCase().trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        edition: edition,
        country: country,
        city: city.trim(),
        address: address.trim() || undefined,
        tournamentDate: tournamentDate ? new Date(tournamentDate).getTime() : undefined,
        gameType,
        show20s,
        showHammer,
        numTables,
        phaseType,
        rankingConfig,
        timeConfig
      };

      // Set phase configuration based on phase type
      if (phaseType === 'TWO_PHASE') {
        // Group stage configuration (inside groupStage object)
        tournamentData.groupStage = {
          type: groupStageType,
          groups: [],
          currentRound: 0,
          totalRounds: 0,
          isComplete: false,
          gameMode: groupGameMode,
          pointsToWin: groupGameMode === 'points' ? groupPointsToWin : undefined,
          roundsToPlay: groupGameMode === 'rounds' ? groupRoundsToPlay : undefined,
          matchesToWin: groupMatchesToWin,
          numGroups: groupStageType === 'ROUND_ROBIN' ? numGroups : undefined,
          numSwissRounds: groupStageType === 'SWISS' ? numSwissRounds : undefined,
          qualificationMode: qualificationMode
        };

        // Final stage configuration - stored in goldBracket.config (and silverBracket.config for SPLIT_DIVISIONS)
        // Always save per-phase configuration (use advanced values if enabled, otherwise defaults)
        const goldEarlyMode = showAdvancedBracketConfig ? earlyRoundsGameMode : 'rounds';
        const goldSemiMode = showAdvancedBracketConfig ? semifinalGameMode : 'points';
        const goldFinalMode = showAdvancedBracketConfig ? bracketFinalGameMode : 'points';
        const silverEarlyMode = showAdvancedBracketConfig ? silverEarlyRoundsGameMode : 'rounds';
        const silverSemiMode = showAdvancedBracketConfig ? silverSemifinalGameMode : 'rounds';
        const silverFinalMode = showAdvancedBracketConfig ? silverBracketFinalGameMode : 'rounds';

        // Build gold bracket config
        const goldBracketConfig = {
          earlyRounds: {
            gameMode: goldEarlyMode,
            pointsToWin: goldEarlyMode === 'points' ? (showAdvancedBracketConfig ? earlyRoundsPointsToWin : 7) : undefined,
            roundsToPlay: goldEarlyMode === 'rounds' ? (showAdvancedBracketConfig ? earlyRoundsToPlay : 4) : undefined,
            matchesToWin: showAdvancedBracketConfig ? earlyRoundsMatchesToWin : 1
          },
          semifinal: {
            gameMode: goldSemiMode,
            pointsToWin: goldSemiMode === 'points' ? (showAdvancedBracketConfig ? semifinalPointsToWin : 7) : undefined,
            roundsToPlay: goldSemiMode === 'rounds' ? (showAdvancedBracketConfig ? semifinalRoundsToPlay : 4) : undefined,
            matchesToWin: showAdvancedBracketConfig ? semifinalMatchesToWin : 1
          },
          final: {
            gameMode: goldFinalMode,
            pointsToWin: goldFinalMode === 'points' ? (showAdvancedBracketConfig ? bracketFinalPointsToWin : 9) : undefined,
            roundsToPlay: goldFinalMode === 'rounds' ? (showAdvancedBracketConfig ? bracketFinalRoundsToPlay : 4) : undefined,
            matchesToWin: showAdvancedBracketConfig ? bracketFinalMatchesToWin : 1
          }
        };

        // Build silver bracket config (for SPLIT_DIVISIONS)
        const silverBracketConfig = finalStageMode === 'SPLIT_DIVISIONS' ? {
          earlyRounds: {
            gameMode: silverEarlyMode,
            pointsToWin: silverEarlyMode === 'points' ? (showAdvancedBracketConfig ? silverEarlyRoundsPointsToWin : 7) : undefined,
            roundsToPlay: silverEarlyMode === 'rounds' ? (showAdvancedBracketConfig ? silverEarlyRoundsToPlay : 4) : undefined,
            matchesToWin: showAdvancedBracketConfig ? silverEarlyRoundsMatchesToWin : 1
          },
          semifinal: {
            gameMode: silverSemiMode,
            pointsToWin: silverSemiMode === 'points' ? (showAdvancedBracketConfig ? silverSemifinalPointsToWin : 7) : undefined,
            roundsToPlay: silverSemiMode === 'rounds' ? (showAdvancedBracketConfig ? silverSemifinalRoundsToPlay : 4) : undefined,
            matchesToWin: showAdvancedBracketConfig ? silverSemifinalMatchesToWin : 1
          },
          final: {
            gameMode: silverFinalMode,
            pointsToWin: silverFinalMode === 'points' ? (showAdvancedBracketConfig ? silverBracketFinalPointsToWin : 7) : undefined,
            roundsToPlay: silverFinalMode === 'rounds' ? (showAdvancedBracketConfig ? silverBracketFinalRoundsToPlay : 4) : undefined,
            matchesToWin: showAdvancedBracketConfig ? silverBracketFinalMatchesToWin : 1
          }
        } : undefined;

        // Set finalStage with brackets containing their configs
        tournamentData.finalStage = {
          mode: finalStageMode,
          consolationEnabled: consolationEnabled,
          thirdPlaceMatchEnabled: thirdPlaceMatchEnabled,
          goldBracket: {
            rounds: [],
            totalRounds: 0,
            config: goldBracketConfig
          },
          ...(silverBracketConfig ? {
            silverBracket: {
              rounds: [],
              totalRounds: 0,
              config: silverBracketConfig
            }
          } : {}),
          isComplete: false
        };
      } else {
        // ONE_PHASE: final stage configuration (for bracket directly)
        // Use phase-specific variables for each bracket phase
        const bracketConfig = {
          earlyRounds: {
            gameMode: earlyRoundsGameMode,
            pointsToWin: earlyRoundsGameMode === 'points' ? earlyRoundsPointsToWin : undefined,
            roundsToPlay: earlyRoundsGameMode === 'rounds' ? earlyRoundsToPlay : undefined,
            matchesToWin: earlyRoundsMatchesToWin
          },
          semifinal: {
            gameMode: semifinalGameMode,
            pointsToWin: semifinalGameMode === 'points' ? semifinalPointsToWin : undefined,
            roundsToPlay: semifinalGameMode === 'rounds' ? semifinalRoundsToPlay : undefined,
            matchesToWin: semifinalMatchesToWin
          },
          final: {
            gameMode: bracketFinalGameMode,
            pointsToWin: bracketFinalGameMode === 'points' ? bracketFinalPointsToWin : undefined,
            roundsToPlay: bracketFinalGameMode === 'rounds' ? bracketFinalRoundsToPlay : undefined,
            matchesToWin: bracketFinalMatchesToWin
          }
        };

        tournamentData.finalStage = {
          mode: 'SINGLE_BRACKET',
          consolationEnabled: consolationEnabled,
          thirdPlaceMatchEnabled: thirdPlaceMatchEnabled,
          goldBracket: {
            rounds: [],
            totalRounds: 0,
            config: bracketConfig
          },
          isComplete: false
        };
      }

      // Only include participants in CREATE mode, not in UPDATE mode
      if (!editMode) {
        tournamentData.participants = participants;
      }

      // Calculate time estimation if config is available
      if (timeConfig) {
        tournamentData.timeEstimate = calculateTournamentTimeEstimate(tournamentData as any, timeConfig);
      }

      // Clean undefined values before sending to Firebase
      const cleanedData = cleanObject(tournamentData);

      if (editMode && editTournamentId) {
        // UPDATE MODE
        const success = await updateTournament(editTournamentId, cleanedData);

        if (!success) {
          creating = false;
          toastMessage = 'Error al actualizar el torneo';
          toastType = 'error';
          showToast = true;
          return;
        }

        toastMessage = 'Torneo actualizado exitosamente';
        toastType = 'success';
        showToast = true;

        // Redirect to tournament page
        setTimeout(() => {
          goto(`/admin/tournaments/${editTournamentId}`);
        }, 500);
      } else {
        // CREATE MODE
        const tournamentId = await createTournament(cleanedData);

        if (!tournamentId) {
          creating = false;
          toastMessage = 'Error al crear el torneo';
          toastType = 'error';
          showToast = true;
          return;
        }

        // Add all participants in a single Firebase call
        const participantsAdded = await addParticipants(tournamentId, participants);

        if (!participantsAdded) {
          creating = false;
          toastMessage = 'Torneo creado pero hubo errores al agregar los participantes';
          toastType = 'warning';
          showToast = true;
          setTimeout(() => {
            goto(`/admin/tournaments/${tournamentId}`);
          }, 1500);
          return;
        }

        // Clear draft after successful creation
        clearDraft();

        // Show success toast
        toastMessage = 'Torneo creado exitosamente';
        toastType = 'success';
        showToast = true;

        // Redirect to tournament page
        setTimeout(() => {
          goto(`/admin/tournaments/${tournamentId}`);
        }, 500);
      }
    } catch (error) {
      console.error('Error creating/updating tournament:', error);
      creating = false;
      toastMessage = `Error al ${editMode ? 'actualizar' : 'crear'} el torneo. Por favor, inténtalo de nuevo.`;
      toastType = 'error';
      showToast = true;
    }
  }

  // Effect to trigger search when searchQuery changes
  $effect(() => {
    searchQuery;  // Track dependency
    handleSearch();
  });

  // Calculate max players based on tables and game type
  let playersPerTable = $derived(gameType === 'singles' ? 2 : 4);
  let maxPlayersForTables = $derived(numTables * playersPerTable);

  // Reactive validation - re-run when any relevant field changes
  $effect(() => {
    // Track all dependencies
    key; name; edition; country; city; gameType; gameMode; pointsToWin; roundsToPlay; matchesToWin;
    groupGameMode; groupPointsToWin; groupRoundsToPlay; groupMatchesToWin;
    finalPointsToWin; finalMatchesToWin; phaseType; numTables; numGroups;
    numSwissRounds; participants.length; currentStep; keyCheckResult;
    const result = getValidationForStep(currentStep);
    validationErrors = result[0];
    validationWarnings = result[1];
  });
</script>

<AdminGuard>
  {#if quotaLoading}
    <div class="wizard-container" data-theme={$adminTheme}>
      <LoadingSpinner message={m.common_loading()} />
    </div>
  {:else}
  <div class="wizard-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" onclick={() => goto(editMode && editTournamentId ? `/admin/tournaments/${editTournamentId}` : '/admin/tournaments')}>←</button>
        <div class="header-main">
          <div class="title-section">
            <h1>
              {editMode ? m.wizard_edit() : duplicateMode ? m.wizard_duplicate() : m.wizard_new()}:
              {#if edition && name}
                #{edition} {name}
              {:else if name}
                {name}
              {:else}
                {m.wizard_tournament()}
              {/if}
            </h1>
            <div class="header-badges">
              <span class="info-badge step-badge">{m.wizard_step({ current: currentStep, total: totalSteps })}</span>
              {#if !editMode && !quotaLoading && quotaInfo}
                {#if quotaInfo.isSuperAdmin}
                  <span class="info-badge quota-badge unlimited">{m.admin_unlimitedTournaments()}</span>
                {:else if quotaInfo.limit > 0}
                  <span class="info-badge quota-badge" class:warning={quotaInfo.used >= quotaInfo.limit * 0.8} class:error={!quotaInfo.canCreate}>
                    {m.admin_tournamentsCreatedThisYear({ used: String(quotaInfo.used), limit: String(quotaInfo.limit) })}
                  </span>
                {/if}
              {/if}
            </div>
          </div>
        </div>
        <div class="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <!-- Progress bar compacto -->
      <div class="progress-bar">
        {#each Array(totalSteps) as _, i}
          <button
            type="button"
            class="progress-step"
            class:active={i + 1 <= currentStep}
            class:current={i + 1 === currentStep}
            class:clickable={editMode || duplicateMode}
            disabled={!editMode && !duplicateMode}
            onclick={() => goToStep(i + 1)}
          >
            <div class="step-number">{i + 1}</div>
            <div class="step-label">
              {#if i === 0}{m.wizard_stepInfo()}
              {:else if i === 1}{m.wizard_stepFormat()}
              {:else if i === 2}{m.wizard_stepRanking()}
              {:else if i === 3}{m.wizard_stepPlayers()}
              {:else if i === 4}{m.wizard_stepTimes()}
              {:else}{m.wizard_stepReview()}
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </header>

    <!-- Quota exceeded message -->
    {#if !editMode && !quotaLoading && quotaInfo && !quotaInfo.canCreate}
      <div class="quota-blocked-message">
        <div class="blocked-icon">⚠️</div>
        <h2>{m.admin_tournamentLimitReached({ used: String(quotaInfo?.used || 0), limit: String(quotaInfo?.limit || 0) }).replace('{used}', quotaInfo.used.toString()).replace('{limit}', quotaInfo.limit.toString())}</h2>
        <p>{m.admin_maxTournamentsPerYearHint()}</p>
        <button class="back-button" onclick={() => goto('/admin/tournaments')}>
          ← {m.common_back()}
        </button>
      </div>
    {:else}
    <div class="wizard-content">
      <!-- Step 1: Basic Info -->
      {#if currentStep === 1}
        <div class="step-container step-basic">
          <h2>{m.wizard_basicInfo()}</h2>
          <p class="wizard-intro">{m.wizard_liveHostDescription()}</p>

          <!-- Identificación del Torneo -->
          <div class="info-section">
            <div class="info-section-header">{m.wizard_identification()}</div>
            <div class="info-grid id-grid">
              <div class="info-field key-field">
                <label for="key">{m.wizard_key()}</label>
                <div class="key-input-wrapper">
                  <input
                    id="key"
                    type="text"
                    bind:value={key}
                    placeholder="ABC123"
                    class="input-field key-input"
                    class:input-error={keyHasError}
                    class:input-valid={keyCheckResult && !keyCheckResult.exists && key.length === 6}
                    maxlength="6"
                    oninput={handleKeyInput}
                    onblur={() => markTouched('key')}
                  />
                  {#if keyCheckLoading}
                    <span class="key-status loading">...</span>
                  {:else if keyHasError}
                    <span class="key-status error">✗</span>
                  {:else if keyCheckResult && !keyCheckResult.exists && key.length === 6}
                    <span class="key-status valid">✓</span>
                  {/if}
                </div>
                {#if keyCheckResult?.exists}
                  <small class="field-error">{m.wizard_keyInUse()}</small>
                {:else if touchedFields.has('key') && !/^[A-Z0-9]{6}$/.test(key)}
                  <small class="field-error">6 chars A-Z 0-9</small>
                {:else}
                  <small class="field-hint">{m.wizard_keyHint()}</small>
                {/if}
              </div>

              <div class="info-field edition-field">
                <label for="edition">{m.wizard_edition()}</label>
                <input
                  id="edition"
                  type="number"
                  bind:value={edition}
                  class="input-field"
                  class:input-error={editionHasError}
                  min="1"
                  max="1000"
                  placeholder="—"
                  onblur={() => markTouched('edition')}
                />
              </div>

              <div class="info-field name-field">
                <label for="name">{m.wizard_tournamentName()}</label>
                <div class="name-search-wrapper">
                  <input
                    id="name"
                    type="text"
                    bind:value={name}
                    placeholder="Ej: Open de Catalunya"
                    class="input-field"
                    class:input-error={nameHasError}
                    oninput={handleNameSearch}
                    onblur={() => { handleNameInputBlur(); markTouched('name'); }}
                    onfocus={handleNameInputFocus}
                    autocomplete="off"
                  />
                  {#if nameSearchLoading}
                    <span class="name-search-loading">...</span>
                  {/if}
                  {#if showNameDropdown && tournamentNameResults.length > 0}
                    <div class="name-dropdown">
                      {#each tournamentNameResults as info}
                        <button
                          type="button"
                          class="name-dropdown-item"
                          onclick={() => selectTournamentName(info)}
                        >
                          <span class="name-dropdown-name">{info.name}</span>
                          <span class="name-dropdown-edition">#{info.maxEdition + 1}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>

          <!-- Ubicación y Fecha -->
          <div class="info-section">
            <div class="info-section-header">{m.wizard_locationDate()}</div>
            <div class="info-grid location-grid">
              <div class="info-field address-field">
                <label for="address">{m.wizard_address()} <span class="optional-label">({m.common_optional()})</span></label>
                <input
                  id="address"
                  type="text"
                  bind:value={address}
                  placeholder="Av. Diagonal 123, Local 5"
                  class="input-field"
                  maxlength="100"
                />
              </div>

              <div class="info-field">
                <label for="city">{m.wizard_city()}</label>
                <input
                  id="city"
                  type="text"
                  bind:value={city}
                  placeholder="Barcelona"
                  class="input-field"
                  class:input-error={cityHasError}
                  maxlength="50"
                  onblur={() => markTouched('city')}
                />
              </div>

              <div class="info-field">
                <label for="country">{m.wizard_country()}</label>
                <CountrySelect
                  id="country"
                  bind:value={country}
                  hasError={countryHasError}
                  onblur={() => markTouched('country')}
                />
              </div>

              <div class="info-field">
                <label for="tournamentDate">{m.wizard_date()}</label>
                <input
                  id="tournamentDate"
                  type="date"
                  bind:value={tournamentDate}
                  class="input-field"
                />
              </div>
            </div>
          </div>

          <!-- Configuración -->
          <div class="info-section">
            <div class="info-section-header">{m.wizard_configuration()}</div>
            <div class="info-grid config-grid">
              <div class="info-field type-field">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label>{m.wizard_modality()}</label>
                <div class="type-toggle">
                  <button
                    type="button"
                    class="type-btn"
                    class:active={gameType === 'singles'}
                    onclick={() => gameType = 'singles'}
                  >
                    {m.scoring_singles()}
                  </button>
                  <button
                    type="button"
                    class="type-btn"
                    class:active={gameType === 'doubles'}
                    onclick={() => gameType = 'doubles'}
                  >
                    {m.scoring_doubles()}
                  </button>
                </div>
              </div>

              <div class="info-field desc-field">
                <label for="description">{m.wizard_descriptionOptional()}</label>
                <input
                  id="description"
                  type="text"
                  bind:value={description}
                  placeholder="Breve descripción del torneo..."
                  class="input-field"
                />
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 2: Tournament Format -->
      {#if currentStep === 2}
        <div class="step-container step-format">
          <h2>{m.wizard_tournamentFormat()}</h2>

          <!-- Configuración General -->
          <div class="format-section">
            <div class="section-header">
              <span class="section-title">{m.wizard_generalConfiguration()}</span>
            </div>
            <div class="section-body">
              <div class="inline-config">
                <div class="config-field">
                  <label for="numTables">{m.wizard_tables()}</label>
                  <input
                    id="numTables"
                    type="number"
                    bind:value={numTables}
                    min="1"
                    max="100"
                    class="input-field compact"
                  />
                  <span class="field-hint">{maxPlayersForTables} jugadores en paralelo</span>
                </div>
                <div class="config-field phase-selector-compact">
                  <!-- svelte-ignore a11y_label_has_associated_control -->
                  <label>{m.wizard_phases()}</label>
                  <div class="phase-buttons">
                    <button
                      type="button"
                      class="phase-btn"
                      class:active={phaseType === 'ONE_PHASE'}
                      onclick={() => phaseType = 'ONE_PHASE'}
                    >
                      1
                    </button>
                    <button
                      type="button"
                      class="phase-btn"
                      class:active={phaseType === 'TWO_PHASE'}
                      onclick={() => phaseType = 'TWO_PHASE'}
                    >
                      2
                    </button>
                  </div>
                  <span class="field-hint">
                    {phaseType === 'ONE_PHASE' ? m.wizard_directElimination() : m.wizard_groupsElimination()}
                  </span>
                </div>
                <div class="config-field options-field">
                  <!-- svelte-ignore a11y_label_has_associated_control -->
                  <label>{m.wizard_options()}</label>
                  <div class="options-inline">
                    <label class="option-check">
                      <input type="checkbox" bind:checked={show20s} />
                      <span>{m.wizard_count20s()}</span>
                    </label>
                    <label class="option-check">
                      <input type="checkbox" bind:checked={showHammer} />
                      <span>{m.wizard_showHammer()}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {#if phaseType === 'TWO_PHASE'}
            <!-- FASE 1: GRUPOS -->
            <div class="format-section groups-phase">
              <div class="section-header groups">
                <span class="section-number">1</span>
                <span class="section-title">{m.wizard_groupStage()}</span>
              </div>
              <div class="section-body">
                <!-- Sistema y configuración básica en línea -->
                <div class="inline-config">
                  <div class="config-field">
                    <!-- svelte-ignore a11y_label_has_associated_control -->
                    <label>{m.admin_system()}</label>
                    <div class="toggle-buttons">
                      <button
                        type="button"
                        class="toggle-btn"
                        class:active={groupStageType === 'ROUND_ROBIN'}
                        onclick={() => groupStageType = 'ROUND_ROBIN'}
                      >
                        {m.admin_roundRobin()}
                      </button>
                      <button
                        type="button"
                        class="toggle-btn"
                        class:active={groupStageType === 'SWISS'}
                        onclick={() => groupStageType = 'SWISS'}
                      >
                        {m.admin_swissSystem()}
                      </button>
                    </div>
                  </div>
                  {#if groupStageType === 'ROUND_ROBIN'}
                    <div class="config-field">
                      <label for="numGroups">{m.tournament_groups()}</label>
                      <input
                        id="numGroups"
                        type="number"
                        bind:value={numGroups}
                        min="1"
                        max="8"
                        class="input-field compact"
                      />
                    </div>
                  {:else}
                    <div class="config-field">
                      <label for="numSwissRounds">{m.scoring_rounds()}</label>
                      <input
                        id="numSwissRounds"
                        type="number"
                        bind:value={numSwissRounds}
                        min="3"
                        max="10"
                        class="input-field compact"
                      />
                    </div>
                  {/if}
                  <div class="config-field">
                    <!-- svelte-ignore a11y_label_has_associated_control -->
                    <label>{m.wizard_classificationType()}</label>
                    <div class="toggle-buttons">
                      <button
                        type="button"
                        class="toggle-btn"
                        class:active={qualificationMode === 'WINS'}
                        onclick={() => qualificationMode = 'WINS'}
                      >
                        {m.tournament_byWins()}
                      </button>
                      <button
                        type="button"
                        class="toggle-btn"
                        class:active={qualificationMode === 'POINTS'}
                        onclick={() => qualificationMode = 'POINTS'}
                      >
                        {m.scoring_points()}
                      </button>
                    </div>
                    <span class="field-hint">
                      {qualificationMode === 'WINS' ? m.wizard_classificationWinsHint() : m.wizard_classificationPointsHint()}
                    </span>
                  </div>
                </div>

                <!-- Configuración de partidos -->
                <div class="match-settings">
                  <div class="settings-row">
                    <div class="toggle-buttons">
                      <button
                        type="button"
                        class="toggle-btn"
                        class:active={groupGameMode === 'points'}
                        onclick={() => groupGameMode = 'points'}
                      >
                        {m.scoring_points()}
                      </button>
                      <button
                        type="button"
                        class="toggle-btn"
                        class:active={groupGameMode === 'rounds'}
                        onclick={() => groupGameMode = 'rounds'}
                      >
                        {m.scoring_rounds()}
                      </button>
                    </div>
                    {#if groupGameMode === 'points'}
                      <div class="inline-field">
                        <span>a</span>
                        <input
                          type="number"
                          bind:value={groupPointsToWin}
                          min="1"
                          max="50"
                          class="input-field mini"
                        />
                        <span>pts</span>
                      </div>
                      <div class="inline-field">
                        <span>{m.admin_bestOfN()}</span>
                        <select bind:value={groupMatchesToWin} class="input-field mini">
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      </div>
                    {:else}
                      <div class="inline-field">
                        <input
                          type="number"
                          bind:value={groupRoundsToPlay}
                          min="1"
                          max="20"
                          class="input-field mini"
                        />
                        <span>{m.scoring_rounds().toLowerCase()}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            </div>

            <!-- FASE 2: ELIMINACIÓN -->
            <div class="format-section finals-phase">
              <div class="section-header finals">
                <span class="section-number">2</span>
                <span class="section-title">{m.wizard_finalStage()}</span>
              </div>
              <div class="section-body">
                <!-- Estructura de brackets -->
                <div class="inline-config">
                  <div class="config-field wide">
                    <!-- svelte-ignore a11y_label_has_associated_control -->
                    <label>{m.wizard_phases()}</label>
                    <div class="toggle-buttons">
                      <button
                        type="button"
                        class="toggle-btn"
                        class:active={finalStageMode === 'SINGLE_BRACKET'}
                        onclick={() => finalStageMode = 'SINGLE_BRACKET'}
                      >
                        {m.admin_singleBracket()}
                      </button>
                      <button
                        type="button"
                        class="toggle-btn"
                        class:active={finalStageMode === 'SPLIT_DIVISIONS'}
                        onclick={() => finalStageMode = 'SPLIT_DIVISIONS'}
                      >
                        {m.admin_goldSilverDivisions()}
                      </button>
                    </div>
                  </div>
                </div>

                {#if finalStageMode === 'SINGLE_BRACKET'}
                  <!-- Configuración directa por fase para Bracket Único -->
                  <div class="advanced-phases-grid">
                    <div class="advanced-bracket">
                      <div class="phase-row">
                        <span class="phase-name">{m.admin_earlyRounds()}</span>
                        <div class="phase-controls">
                          <div class="toggle-buttons">
                            <button type="button" class="toggle-btn" class:active={earlyRoundsGameMode === 'points'} onclick={() => earlyRoundsGameMode = 'points'}>{m.scoring_points()}</button>
                            <button type="button" class="toggle-btn" class:active={earlyRoundsGameMode === 'rounds'} onclick={() => earlyRoundsGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                          </div>
                          {#if earlyRoundsGameMode === 'rounds'}
                            <input type="number" bind:value={earlyRoundsToPlay} min="1" max="20" class="input-field mini" />
                          {:else}
                            <input type="number" bind:value={earlyRoundsPointsToWin} min="1" max="20" class="input-field mini" />
                            <span class="bo-label">{m.bracket_bestOf()}</span>
                            <select bind:value={earlyRoundsMatchesToWin} class="input-field mini">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          {/if}
                        </div>
                      </div>

                      <div class="phase-row">
                        <span class="phase-name">{m.admin_semifinals()}</span>
                        <div class="phase-controls">
                          <div class="toggle-buttons">
                            <button type="button" class="toggle-btn" class:active={semifinalGameMode === 'points'} onclick={() => semifinalGameMode = 'points'}>{m.scoring_points()}</button>
                            <button type="button" class="toggle-btn" class:active={semifinalGameMode === 'rounds'} onclick={() => semifinalGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                          </div>
                          {#if semifinalGameMode === 'rounds'}
                            <input type="number" bind:value={semifinalRoundsToPlay} min="1" max="20" class="input-field mini" />
                          {:else}
                            <input type="number" bind:value={semifinalPointsToWin} min="1" max="20" class="input-field mini" />
                            <span class="bo-label">{m.bracket_bestOf()}</span>
                            <select bind:value={semifinalMatchesToWin} class="input-field mini">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          {/if}
                        </div>
                      </div>

                      <div class="phase-row">
                        <span class="phase-name">{m.admin_final()}</span>
                        <div class="phase-controls">
                          <div class="toggle-buttons">
                            <button type="button" class="toggle-btn" class:active={bracketFinalGameMode === 'points'} onclick={() => bracketFinalGameMode = 'points'}>{m.scoring_points()}</button>
                            <button type="button" class="toggle-btn" class:active={bracketFinalGameMode === 'rounds'} onclick={() => bracketFinalGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                          </div>
                          {#if bracketFinalGameMode === 'rounds'}
                            <input type="number" bind:value={bracketFinalRoundsToPlay} min="1" max="20" class="input-field mini" />
                          {:else}
                            <input type="number" bind:value={bracketFinalPointsToWin} min="1" max="20" class="input-field mini" />
                            <span class="bo-label">{m.bracket_bestOf()}</span>
                            <select bind:value={bracketFinalMatchesToWin} class="input-field mini">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                {:else}
                  <!-- Configuración directa por fase para Oro/Plata -->
                  <div class="advanced-phases-grid split">
                    <!-- Gold Bracket -->
                    <div class="advanced-bracket gold">
                      <span class="advanced-bracket-title gold">{m.scoring_gold()}</span>

                      <div class="phase-row">
                        <span class="phase-name">{m.admin_earlyRounds()}</span>
                        <div class="phase-controls">
                          <div class="toggle-buttons">
                            <button type="button" class="toggle-btn" class:active={earlyRoundsGameMode === 'points'} onclick={() => earlyRoundsGameMode = 'points'}>{m.scoring_points()}</button>
                            <button type="button" class="toggle-btn" class:active={earlyRoundsGameMode === 'rounds'} onclick={() => earlyRoundsGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                          </div>
                          {#if earlyRoundsGameMode === 'rounds'}
                            <input type="number" bind:value={earlyRoundsToPlay} min="1" max="20" class="input-field mini" />
                          {:else}
                            <input type="number" bind:value={earlyRoundsPointsToWin} min="1" max="20" class="input-field mini" />
                            <span class="bo-label">{m.bracket_bestOf()}</span>
                            <select bind:value={earlyRoundsMatchesToWin} class="input-field mini">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          {/if}
                        </div>
                      </div>

                      <div class="phase-row">
                        <span class="phase-name">{m.admin_semifinals()}</span>
                        <div class="phase-controls">
                          <div class="toggle-buttons">
                            <button type="button" class="toggle-btn" class:active={semifinalGameMode === 'points'} onclick={() => semifinalGameMode = 'points'}>{m.scoring_points()}</button>
                            <button type="button" class="toggle-btn" class:active={semifinalGameMode === 'rounds'} onclick={() => semifinalGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                          </div>
                          {#if semifinalGameMode === 'rounds'}
                            <input type="number" bind:value={semifinalRoundsToPlay} min="1" max="20" class="input-field mini" />
                          {:else}
                            <input type="number" bind:value={semifinalPointsToWin} min="1" max="20" class="input-field mini" />
                            <span class="bo-label">{m.bracket_bestOf()}</span>
                            <select bind:value={semifinalMatchesToWin} class="input-field mini">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          {/if}
                        </div>
                      </div>

                      <div class="phase-row">
                        <span class="phase-name">{m.admin_final()}</span>
                        <div class="phase-controls">
                          <div class="toggle-buttons">
                            <button type="button" class="toggle-btn" class:active={bracketFinalGameMode === 'points'} onclick={() => bracketFinalGameMode = 'points'}>{m.scoring_points()}</button>
                            <button type="button" class="toggle-btn" class:active={bracketFinalGameMode === 'rounds'} onclick={() => bracketFinalGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                          </div>
                          {#if bracketFinalGameMode === 'rounds'}
                            <input type="number" bind:value={bracketFinalRoundsToPlay} min="1" max="20" class="input-field mini" />
                          {:else}
                            <input type="number" bind:value={bracketFinalPointsToWin} min="1" max="20" class="input-field mini" />
                            <span class="bo-label">{m.bracket_bestOf()}</span>
                            <select bind:value={bracketFinalMatchesToWin} class="input-field mini">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          {/if}
                        </div>
                      </div>
                    </div>

                    <!-- Silver Bracket -->
                    <div class="advanced-bracket silver">
                      <span class="advanced-bracket-title silver">{m.scoring_silver()}</span>

                      <div class="phase-row">
                        <span class="phase-name">{m.admin_earlyRounds()}</span>
                        <div class="phase-controls">
                          <div class="toggle-buttons">
                            <button type="button" class="toggle-btn" class:active={silverEarlyRoundsGameMode === 'points'} onclick={() => silverEarlyRoundsGameMode = 'points'}>{m.scoring_points()}</button>
                            <button type="button" class="toggle-btn" class:active={silverEarlyRoundsGameMode === 'rounds'} onclick={() => silverEarlyRoundsGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                          </div>
                          {#if silverEarlyRoundsGameMode === 'rounds'}
                            <input type="number" bind:value={silverEarlyRoundsToPlay} min="1" max="20" class="input-field mini" />
                          {:else}
                            <input type="number" bind:value={silverEarlyRoundsPointsToWin} min="1" max="20" class="input-field mini" />
                            <span class="bo-label">{m.bracket_bestOf()}</span>
                            <select bind:value={silverEarlyRoundsMatchesToWin} class="input-field mini">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          {/if}
                        </div>
                      </div>

                      <div class="phase-row">
                        <span class="phase-name">{m.admin_semifinals()}</span>
                        <div class="phase-controls">
                          <div class="toggle-buttons">
                            <button type="button" class="toggle-btn" class:active={silverSemifinalGameMode === 'points'} onclick={() => silverSemifinalGameMode = 'points'}>{m.scoring_points()}</button>
                            <button type="button" class="toggle-btn" class:active={silverSemifinalGameMode === 'rounds'} onclick={() => silverSemifinalGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                          </div>
                          {#if silverSemifinalGameMode === 'rounds'}
                            <input type="number" bind:value={silverSemifinalRoundsToPlay} min="1" max="20" class="input-field mini" />
                          {:else}
                            <input type="number" bind:value={silverSemifinalPointsToWin} min="1" max="20" class="input-field mini" />
                            <span class="bo-label">{m.bracket_bestOf()}</span>
                            <select bind:value={silverSemifinalMatchesToWin} class="input-field mini">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          {/if}
                        </div>
                      </div>

                      <div class="phase-row">
                        <span class="phase-name">{m.admin_final()}</span>
                        <div class="phase-controls">
                          <div class="toggle-buttons">
                            <button type="button" class="toggle-btn" class:active={silverBracketFinalGameMode === 'points'} onclick={() => silverBracketFinalGameMode = 'points'}>{m.scoring_points()}</button>
                            <button type="button" class="toggle-btn" class:active={silverBracketFinalGameMode === 'rounds'} onclick={() => silverBracketFinalGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                          </div>
                          {#if silverBracketFinalGameMode === 'rounds'}
                            <input type="number" bind:value={silverBracketFinalRoundsToPlay} min="1" max="20" class="input-field mini" />
                          {:else}
                            <input type="number" bind:value={silverBracketFinalPointsToWin} min="1" max="20" class="input-field mini" />
                            <span class="bo-label">{m.bracket_bestOf()}</span>
                            <select bind:value={silverBracketFinalMatchesToWin} class="input-field mini">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- Toggle Row Container for Third Place and Consolation -->
                <div class="toggle-row-container">
                  <!-- Third Place Match Configuration -->
                  <div class="consolation-toggle-row">
                    <div class="consolation-toggle-info">
                      <span class="consolation-toggle-label">{m.wizard_thirdPlaceMatch()}</span>
                      <span class="consolation-toggle-desc">{m.wizard_thirdPlaceMatchDesc()}</span>
                    </div>
                    <button
                      type="button"
                      class="toggle-switch"
                      class:active={thirdPlaceMatchEnabled}
                      onclick={() => thirdPlaceMatchEnabled = !thirdPlaceMatchEnabled}
                      aria-pressed={thirdPlaceMatchEnabled}
                      aria-label="Activar partido de tercer puesto"
                    >
                      <span class="toggle-track">
                        <span class="toggle-thumb"></span>
                      </span>
                    </button>
                  </div>

                  <!-- Consolation Bracket Configuration -->
                  <div class="consolation-toggle-row">
                    <div class="consolation-toggle-info">
                      <span class="consolation-toggle-label">{m.wizard_consolationRounds()}</span>
                      <span class="consolation-toggle-desc">{m.wizard_consolationDesc()}</span>
                    </div>
                    <button
                      type="button"
                      class="toggle-switch"
                      class:active={consolationEnabled}
                      onclick={() => consolationEnabled = !consolationEnabled}
                      aria-pressed={consolationEnabled}
                      aria-label="Activar rondas de clasificación"
                    >
                      <span class="toggle-track">
                        <span class="toggle-thumb"></span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <!-- ONE_PHASE: Eliminación directa -->
            <div class="format-section one-phase">
              <div class="section-header finals">
                <span class="section-title">{m.wizard_matchConfiguration()}</span>
              </div>
              <div class="section-body">
                <!-- Configuración directa por fase para ONE_PHASE -->
                <div class="advanced-phases-grid">
                  <div class="advanced-bracket">
                    <div class="phase-row">
                      <span class="phase-name">{m.admin_earlyRounds()}</span>
                      <div class="phase-controls">
                        <div class="toggle-buttons">
                          <button type="button" class="toggle-btn" class:active={earlyRoundsGameMode === 'points'} onclick={() => earlyRoundsGameMode = 'points'}>{m.scoring_points()}</button>
                          <button type="button" class="toggle-btn" class:active={earlyRoundsGameMode === 'rounds'} onclick={() => earlyRoundsGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                        </div>
                        {#if earlyRoundsGameMode === 'rounds'}
                          <input type="number" bind:value={earlyRoundsToPlay} min="1" max="20" class="input-field mini" />
                        {:else}
                          <input type="number" bind:value={earlyRoundsPointsToWin} min="1" max="20" class="input-field mini" />
                          <span class="bo-label">{m.bracket_bestOf()}</span>
                          <select bind:value={earlyRoundsMatchesToWin} class="input-field mini">
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                          </select>
                        {/if}
                      </div>
                    </div>

                    <div class="phase-row">
                      <span class="phase-name">{m.admin_semifinals()}</span>
                      <div class="phase-controls">
                        <div class="toggle-buttons">
                          <button type="button" class="toggle-btn" class:active={semifinalGameMode === 'points'} onclick={() => semifinalGameMode = 'points'}>{m.scoring_points()}</button>
                          <button type="button" class="toggle-btn" class:active={semifinalGameMode === 'rounds'} onclick={() => semifinalGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                        </div>
                        {#if semifinalGameMode === 'rounds'}
                          <input type="number" bind:value={semifinalRoundsToPlay} min="1" max="20" class="input-field mini" />
                        {:else}
                          <input type="number" bind:value={semifinalPointsToWin} min="1" max="20" class="input-field mini" />
                          <span class="bo-label">{m.bracket_bestOf()}</span>
                          <select bind:value={semifinalMatchesToWin} class="input-field mini">
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                          </select>
                        {/if}
                      </div>
                    </div>

                    <div class="phase-row">
                      <span class="phase-name">{m.admin_final()}</span>
                      <div class="phase-controls">
                        <div class="toggle-buttons">
                          <button type="button" class="toggle-btn" class:active={bracketFinalGameMode === 'points'} onclick={() => bracketFinalGameMode = 'points'}>{m.scoring_points()}</button>
                          <button type="button" class="toggle-btn" class:active={bracketFinalGameMode === 'rounds'} onclick={() => bracketFinalGameMode = 'rounds'}>{m.scoring_rounds()}</button>
                        </div>
                        {#if bracketFinalGameMode === 'rounds'}
                          <input type="number" bind:value={bracketFinalRoundsToPlay} min="1" max="20" class="input-field mini" />
                        {:else}
                          <input type="number" bind:value={bracketFinalPointsToWin} min="1" max="20" class="input-field mini" />
                          <span class="bo-label">{m.bracket_bestOf()}</span>
                          <select bind:value={bracketFinalMatchesToWin} class="input-field mini">
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                          </select>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Toggle Row Container for Third Place and Consolation (ONE_PHASE) -->
                <div class="toggle-row-container">
                  <!-- Third Place Match Configuration for ONE_PHASE -->
                  <div class="consolation-toggle-row">
                    <div class="consolation-toggle-info">
                      <span class="consolation-toggle-label">{m.wizard_thirdPlaceMatch()}</span>
                      <span class="consolation-toggle-desc">{m.wizard_thirdPlaceMatchDesc()}</span>
                    </div>
                    <button
                      type="button"
                      class="toggle-switch"
                      class:active={thirdPlaceMatchEnabled}
                      onclick={() => thirdPlaceMatchEnabled = !thirdPlaceMatchEnabled}
                      aria-pressed={thirdPlaceMatchEnabled}
                      aria-label="Activar partido de tercer puesto"
                    >
                      <span class="toggle-track">
                        <span class="toggle-thumb"></span>
                      </span>
                    </button>
                  </div>

                  <!-- Consolation Bracket Configuration for ONE_PHASE -->
                  <div class="consolation-toggle-row">
                    <div class="consolation-toggle-info">
                      <span class="consolation-toggle-label">{m.wizard_consolationRounds()}</span>
                      <span class="consolation-toggle-desc">{m.wizard_consolationDesc()}</span>
                    </div>
                    <button
                      type="button"
                      class="toggle-switch"
                      class:active={consolationEnabled}
                      onclick={() => consolationEnabled = !consolationEnabled}
                      aria-pressed={consolationEnabled}
                      aria-label="Activar rondas de clasificación"
                    >
                      <span class="toggle-track">
                        <span class="toggle-thumb"></span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 3: Ranking Configuration -->
      {#if currentStep === 3}
        <div class="step-container">
          <h2>📊 {m.wizard_rankingConfiguration()}</h2>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={rankingEnabled} />
              <span>{m.wizard_enableRanking()}</span>
            </label>
            <small class="help-text">
              {m.wizard_rankingHelp()}
            </small>
          </div>

          {#if rankingEnabled}
            <div class="ranking-config">
              <h4>🏆 {m.wizard_selectTierTitle()}</h4>
              <p class="tier-description">{m.wizard_tierDescription()}</p>

              <div class="tier-selection">
                <label class="tier-option {selectedTier === 'CLUB' ? 'selected' : ''}">
                  <input type="radio" bind:group={selectedTier} value="CLUB" />
                  <div class="tier-card">
                    <div class="tier-header">
                      <span class="tier-badge tier-4">Tier 4</span>
                      <span class="tier-name">{m.wizard_tierClub()}</span>
                    </div>
                    <div class="tier-desc">{m.wizard_tierClubDesc()}</div>
                    <div class="tier-points">🥇 15 pts al 1º</div>
                  </div>
                </label>

                <label class="tier-option {selectedTier === 'REGIONAL' ? 'selected' : ''}">
                  <input type="radio" bind:group={selectedTier} value="REGIONAL" />
                  <div class="tier-card">
                    <div class="tier-header">
                      <span class="tier-badge tier-3">Tier 3</span>
                      <span class="tier-name">{m.wizard_tierRegional()}</span>
                    </div>
                    <div class="tier-desc">{m.wizard_tierRegionalDesc()}</div>
                    <div class="tier-points">🥇 25 pts al 1º</div>
                  </div>
                </label>

                <label class="tier-option {selectedTier === 'NATIONAL' ? 'selected' : ''}">
                  <input type="radio" bind:group={selectedTier} value="NATIONAL" />
                  <div class="tier-card">
                    <div class="tier-header">
                      <span class="tier-badge tier-2">Tier 2</span>
                      <span class="tier-name">{m.wizard_tierNational()}</span>
                    </div>
                    <div class="tier-desc">{m.wizard_tierNationalDesc()}</div>
                    <div class="tier-points">🥇 40 pts al 1º</div>
                  </div>
                </label>

                <label class="tier-option {selectedTier === 'MAJOR' ? 'selected' : ''}">
                  <input type="radio" bind:group={selectedTier} value="MAJOR" />
                  <div class="tier-card">
                    <div class="tier-header">
                      <span class="tier-badge tier-1">Tier 1</span>
                      <span class="tier-name">{m.wizard_tierMajor()}</span>
                    </div>
                    <div class="tier-desc">{m.wizard_tierMajorDesc()}</div>
                    <div class="tier-points">🥇 50 pts al 1º</div>
                  </div>
                </label>
              </div>

              <!-- Points distribution for selected tier -->
              <div class="points-distribution">
                <h4>📊 {m.wizard_pointsDistributionFor({ tier: getTierInfo(selectedTier).name })}</h4>
                <table class="points-table">
                  <thead>
                    <tr>
                      <th>{m.wizard_position()}</th>
                      {#each getPointsDistribution(selectedTier) as item}
                        <th>{item.position}º</th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{m.scoring_points()}</td>
                      {#each getPointsDistribution(selectedTier) as item}
                        <td class="points">{item.points}</td>
                      {/each}
                    </tr>
                  </tbody>
                </table>
                <small class="help-text">{m.wizard_pointsNote()}</small>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 4: Participants -->
      {#if currentStep === 4}
        <div class="step-container step-participants">
          <h2>👥 {m.wizard_participants()}</h2>

          <!-- Counter bar -->
          <div class="participants-counter" class:warning={participants.length > maxPlayersForTables}>
            <span class="counter-text">
              {participants.length} {participants.length === 1 ? m.wizard_playersSingular() : m.wizard_players()}
              {#if gameType === 'doubles'}
                ({participants.length * 2} jugadores)
              {/if}
            </span>
            <span class="counter-label">
              {#if participants.length > maxPlayersForTables}
                ⚠️ {m.wizard_someRest({ max: maxPlayersForTables })}
              {:else}
                {m.wizard_tablesParallel({ tables: numTables, tableWord: numTables === 1 ? m.wizard_table() : m.wizard_tablesPl(), max: maxPlayersForTables })}
              {/if}
            </span>
          </div>

          {#if gameType === 'doubles'}
            <!-- Doubles: Pair selector -->
            <PairSelector
              onadd={(participant) => {
                participants = [...participants, participant];
              }}
              existingParticipants={participants}
              theme={$adminTheme}
            />
          {:else}
            <!-- Singles: Individual player selector -->
            <div class="add-row">
              <div class="add-field search-field">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label>{m.wizard_searchRegistered()}</label>
                <div class="search-box">
                  <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="Nombre o email..."
                    class="input-field"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    data-form-type="other"
                  />
                  {#if searchLoading}
                    <span class="search-loading">⏳</span>
                  {/if}
                  {#if searchResults.length > 0}
                    <div class="search-results">
                      {#each searchResults.slice(0, 6) as user}
                        <button
                          class="search-result-item"
                          onclick={() => addRegisteredUser({ ...user, userId: user.userId || '' })}
                        >
                          <span class="result-name">{user.playerName}</span>
                          <span class="result-rank">{user.ranking || 0}</span>
                          <span class="result-add">+</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>

              <div class="add-field guest-field">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label>{m.wizard_addGuest()}</label>
                <div class="guest-input-group">
                  <input
                    type="text"
                    bind:value={guestName}
                    placeholder="Nombre (mín. 3 chars)"
                    class="input-field"
                    onkeydown={(e) => {
                      if (e.key === 'Enter' && guestName.trim().length >= 3) {
                        addGuestPlayer();
                      }
                    }}
                  />
                  <button
                    class="add-btn"
                    onclick={addGuestPlayer}
                    disabled={guestName.trim().length < 3}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Participants list -->
          <div class="participants-list-section">
            <div class="list-header">
              <span>{m.wizard_added()}</span>
              <span class="list-count">{participants.length}</span>
            </div>

            {#if participants.length === 0}
              <div class="empty-list">
                {m.wizard_noParticipants()}
              </div>
            {:else}
              <div class="participants-grid-2col">
                {#each sortedParticipants as participant}
                  <div
                    class="participant-chip"
                    class:registered={participant.type === 'REGISTERED'}
                    class:pair={participant.participantMode === 'pair'}
                  >
                    <span class="chip-name">{participant.name}</span>
                    {#if participant.participantMode === 'pair'}
                      <span class="chip-pair-badge">👥</span>
                    {:else if participant.type === 'REGISTERED' && participant.rankingSnapshot}
                      <span class="chip-rank">{participant.rankingSnapshot}</span>
                    {/if}
                    <button class="chip-remove" onclick={() => removeParticipant(participant)}>×</button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Step 5: Time Configuration -->
      {#if currentStep === 5}
        <div class="step-container step-time-compact">
          <h2 class="step-title-compact">{m.admin_timeConfigTitle()}</h2>

          <div class="tc-compact">
            <!-- Duration & Breaks Row -->
            <div class="tc-row">
              <div class="tc-group">
                <label class="tc-lbl">{m.admin_matchDuration()}</label>
                <div class="tc-input-wrap">
                  {#if gameType === 'doubles'}
                    <input type="number" bind:value={tcMinutesPer4RoundsDoubles} min="5" max="30" />
                  {:else}
                    <input type="number" bind:value={tcMinutesPer4RoundsSingles} min="5" max="30" />
                  {/if}
                  <span class="tc-suffix">min/4rds</span>
                </div>
              </div>
              <div class="tc-group">
                <label class="tc-lbl">{m.admin_betweenMatches()}</label>
                <div class="tc-input-wrap">
                  <input type="number" bind:value={tcBreakBetweenMatches} min="0" max="30" />
                  <span class="tc-suffix">min</span>
                </div>
              </div>
              <div class="tc-group">
                <label class="tc-lbl">{m.admin_betweenPhases()}</label>
                <div class="tc-input-wrap">
                  <input type="number" bind:value={tcBreakBetweenPhases} min="0" max="60" />
                  <span class="tc-suffix">min</span>
                </div>
              </div>
            </div>

            <!-- Average Rounds Row -->
            <div class="tc-row tc-rounds-row">
              <label class="tc-lbl">{m.admin_avgRoundsTitle()}</label>
              <div class="tc-rounds-grid">
                <div class="tc-round-item"><span class="tc-pts">5p</span><input type="number" bind:value={tcAvgRounds5pts} min="2" max="12" /><span class="tc-rds">rds</span></div>
                <div class="tc-round-item"><span class="tc-pts">7p</span><input type="number" bind:value={tcAvgRounds7pts} min="3" max="15" /><span class="tc-rds">rds</span></div>
                <div class="tc-round-item"><span class="tc-pts">9p</span><input type="number" bind:value={tcAvgRounds9pts} min="4" max="20" /><span class="tc-rds">rds</span></div>
                <div class="tc-round-item"><span class="tc-pts">11p</span><input type="number" bind:value={tcAvgRounds11pts} min="5" max="25" /><span class="tc-rds">rds</span></div>
              </div>
            </div>

            <!-- Toggles Row -->
            <div class="tc-row tc-toggles-row">
              <div class="tc-toggle-compact">
                <span class="tc-toggle-lbl">{m.admin_parallelSemifinals()}</span>
                <button type="button" class="tc-switch" class:on={tcParallelSemifinals} onclick={() => tcParallelSemifinals = !tcParallelSemifinals}>
                  <span class="tc-switch-thumb"></span>
                </button>
              </div>
              <div class="tc-toggle-compact">
                <span class="tc-toggle-lbl">{m.admin_parallelFinals()}</span>
                <button type="button" class="tc-switch" class:on={tcParallelFinals} onclick={() => tcParallelFinals = !tcParallelFinals}>
                  <span class="tc-switch-thumb"></span>
                </button>
              </div>
              <button type="button" class="tc-reset-btn" onclick={() => {
                tcMinutesPer4RoundsSingles = DEFAULT_TIME_CONFIG.minutesPer4RoundsSingles;
                tcMinutesPer4RoundsDoubles = DEFAULT_TIME_CONFIG.minutesPer4RoundsDoubles;
                tcAvgRounds5pts = DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[5];
                tcAvgRounds7pts = DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[7];
                tcAvgRounds9pts = DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[9];
                tcAvgRounds11pts = DEFAULT_TIME_CONFIG.avgRoundsForPointsMode[11];
                tcBreakBetweenMatches = DEFAULT_TIME_CONFIG.breakBetweenMatches;
                tcBreakBetweenPhases = DEFAULT_TIME_CONFIG.breakBetweenPhases;
                tcParallelSemifinals = DEFAULT_TIME_CONFIG.parallelSemifinals;
                tcParallelFinals = DEFAULT_TIME_CONFIG.parallelFinals;
              }}>{m.admin_resetToDefaults()}</button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 6: Review -->
      {#if currentStep === 6}
        <div class="step-container">
          <h2>{m.wizard_finalReview()}</h2>

          <div class="review-grid">
            <!-- Left Column -->
            <div class="review-column">
              <div class="review-card">
                <div class="review-card-header">
                  <span class="review-icon">📋</span>
                  <span>{m.wizard_information()}</span>
                </div>
                <div class="review-card-body">
                  <div class="review-row">
                    <span class="review-label">{m.wizard_key()}</span>
                    <span class="review-value highlight">{key.toUpperCase()}</span>
                  </div>
                  <div class="review-row">
                    <span class="review-label">{m.wizard_name()}</span>
                    <span class="review-value">{edition}º {name}</span>
                  </div>
                  {#if description}
                    <div class="review-row">
                      <span class="review-label">{m.wizard_description()}</span>
                      <span class="review-value">{description}</span>
                    </div>
                  {/if}
                  <div class="review-row">
                    <span class="review-label">{m.wizard_location()}</span>
                    <span class="review-value">{city}, {country}</span>
                  </div>
                  {#if tournamentDate}
                    <div class="review-row">
                      <span class="review-label">{m.wizard_date()}</span>
                      <span class="review-value">{new Date(tournamentDate).toLocaleDateString(getLocale() === 'en' ? 'en-US' : getLocale() === 'ca' ? 'ca-ES' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  {/if}
                </div>
              </div>

              <div class="review-card">
                <div class="review-card-header">
                  <span class="review-icon">🎮</span>
                  <span>{m.wizard_gameConfiguration()}</span>
                </div>
                <div class="review-card-body">
                  <div class="review-row">
                    <span class="review-label">{m.wizard_type()}</span>
                    <span class="review-value">{gameType === 'singles' ? m.scoring_singles() : m.scoring_doubles()}</span>
                  </div>
                  <div class="review-row">
                    <span class="review-label">{m.wizard_mode()}</span>
                    <span class="review-value">{gameMode === 'points' ? `${pointsToWin} pts` : `${roundsToPlay} ${m.scoring_rounds().toLowerCase()}`}</span>
                  </div>
                  <div class="review-row">
                    <span class="review-label">{m.wizard_tables()}</span>
                    <span class="review-value">{numTables}</span>
                  </div>
                  <div class="review-row">
                    <span class="review-label">{m.wizard_participants()}</span>
                    <span class="review-value">{participants.length}</span>
                  </div>
                </div>
              </div>

              <div class="review-card participants-accordion" class:expanded={participantsExpanded}>
                <button
                  type="button"
                  class="accordion-header"
                  onclick={() => participantsExpanded = !participantsExpanded}
                >
                  <div class="accordion-title">
                    <span class="review-icon">👥</span>
                    <span>{m.wizard_participants()}</span>
                    <span class="participant-count">{participants.length}</span>
                  </div>
                  <span class="accordion-chevron">›</span>
                </button>
                {#if participantsExpanded}
                  <div class="accordion-body">
                    <div class="participants-grid">
                      {#each sortedParticipants as participant, i}
                        <div class="participant-item" class:registered={participant.type === 'REGISTERED'}>
                          <span class="participant-number">{i + 1}</span>
                          <span class="participant-name">{participant.name}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

              {#if rankingEnabled}
                <div class="review-card compact">
                  <div class="review-card-header">
                    <span class="review-icon">🏅</span>
                    <span>{m.wizard_ranking()}</span>
                  </div>
                  <div class="review-card-body">
                    <div class="review-row">
                      <span class="review-label">{m.wizard_category()}</span>
                      <span class="review-value">{getTierInfo(selectedTier).name}</span>
                    </div>
                    <div class="review-row">
                      <span class="review-label">{m.wizard_firstPlacePoints()}</span>
                      <span class="review-value highlight">{getTierInfo(selectedTier).basePoints}</span>
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Right Column -->
            <div class="review-column">
              <div class="review-card">
                <div class="review-card-header">
                  <span class="review-icon">🏆</span>
                  <span>{m.wizard_format()}</span>
                </div>
                <div class="review-card-body">
                  <div class="review-row">
                    <span class="review-label">{m.wizard_phases()}</span>
                    <span class="review-value">{phaseType === 'ONE_PHASE' ? m.wizard_directElimination() : m.wizard_groupsFinal()}</span>
                  </div>
                  {#if phaseType === 'TWO_PHASE'}
                    <div class="review-row">
                      <span class="review-label">{m.tournament_groups()}</span>
                      <span class="review-value">
                        {groupStageType === 'ROUND_ROBIN' ? `${m.admin_roundRobin()} (${numGroups})` : `${m.admin_swissSystem()} (${numSwissRounds}R)`}
                      </span>
                    </div>
                    <div class="review-row">
                      <span class="review-label">{m.wizard_classificationType()}</span>
                      <span class="review-value">{qualificationMode === 'WINS' ? m.tournament_byWins() : m.tournament_byPoints()}</span>
                    </div>
                    <div class="review-row">
                      <span class="review-label">{m.tournament_finalStage()}</span>
                      <span class="review-value">{finalStageMode === 'SINGLE_BRACKET' ? m.admin_singleBracket() : m.admin_goldSilverDivisions()}</span>
                    </div>
                  {/if}
                  <div class="review-row">
                    <span class="review-label">{m.wizard_thirdPlaceMatch()}</span>
                    <span class="review-value">{thirdPlaceMatchEnabled ? m.admin_yes() : m.admin_no()}</span>
                  </div>
                  <div class="review-row">
                    <span class="review-label">{m.wizard_consolationRounds()}</span>
                    <span class="review-value">{consolationEnabled ? m.admin_yes() : m.admin_no()}</span>
                  </div>
                </div>
              </div>

              {#if phaseType === 'TWO_PHASE'}
                <div class="review-card">
                  <div class="review-card-header">
                    <span class="review-icon">{finalStageMode === 'SPLIT_DIVISIONS' ? '🥇' : '⚙️'}</span>
                    <span>{finalStageMode === 'SPLIT_DIVISIONS' ? m.admin_goldBracket() : m.tournament_finalStage()}</span>
                  </div>
                  <div class="review-card-body">
                    <!-- Show per-phase config -->
                    <div class="review-row">
                      <span class="review-label">{m.admin_earlyRounds()}</span>
                      <span class="review-value">
                        {(showAdvancedBracketConfig ? earlyRoundsGameMode : 'rounds') === 'points'
                          ? `${showAdvancedBracketConfig ? earlyRoundsPointsToWin : 7}p`
                          : `${showAdvancedBracketConfig ? earlyRoundsToPlay : 4}r`}
                      </span>
                    </div>
                    <div class="review-row">
                      <span class="review-label">{m.admin_semifinals()}</span>
                      <span class="review-value">
                        {(showAdvancedBracketConfig ? semifinalGameMode : 'points') === 'points'
                          ? `${showAdvancedBracketConfig ? semifinalPointsToWin : 7}p${(showAdvancedBracketConfig ? semifinalMatchesToWin : 1) > 1 ? ` · Pg${semifinalMatchesToWin}` : ''}`
                          : `${showAdvancedBracketConfig ? semifinalRoundsToPlay : 4}r`}
                      </span>
                    </div>
                    <div class="review-row">
                      <span class="review-label">{m.admin_final()}</span>
                      <span class="review-value">
                        {(showAdvancedBracketConfig ? bracketFinalGameMode : 'points') === 'points'
                          ? `${showAdvancedBracketConfig ? bracketFinalPointsToWin : 9}p${(showAdvancedBracketConfig ? bracketFinalMatchesToWin : 1) > 1 ? ` · Pg${bracketFinalMatchesToWin}` : ''}`
                          : `${showAdvancedBracketConfig ? bracketFinalRoundsToPlay : 4}r`}
                      </span>
                    </div>
                  </div>
                </div>

                {#if finalStageMode === 'SPLIT_DIVISIONS'}
                  <div class="review-card">
                    <div class="review-card-header">
                      <span class="review-icon">🥈</span>
                      <span>{m.admin_silverBracket()}</span>
                    </div>
                    <div class="review-card-body">
                      <!-- Show per-phase config for silver (default: all 4 rounds) -->
                      <div class="review-row">
                        <span class="review-label">{m.admin_earlyRounds()}</span>
                        <span class="review-value">
                          {(showAdvancedBracketConfig ? silverEarlyRoundsGameMode : 'rounds') === 'points'
                            ? `${showAdvancedBracketConfig ? silverEarlyRoundsPointsToWin : 7}p`
                            : `${showAdvancedBracketConfig ? silverEarlyRoundsToPlay : 4}r`}
                        </span>
                      </div>
                      <div class="review-row">
                        <span class="review-label">{m.admin_semifinals()}</span>
                        <span class="review-value">
                          {(showAdvancedBracketConfig ? silverSemifinalGameMode : 'rounds') === 'points'
                            ? `${showAdvancedBracketConfig ? silverSemifinalPointsToWin : 7}p${(showAdvancedBracketConfig ? silverSemifinalMatchesToWin : 1) > 1 ? ` · Pg${silverSemifinalMatchesToWin}` : ''}`
                            : `${showAdvancedBracketConfig ? silverSemifinalRoundsToPlay : 4}r`}
                        </span>
                      </div>
                      <div class="review-row">
                        <span class="review-label">{m.admin_final()}</span>
                        <span class="review-value">
                          {(showAdvancedBracketConfig ? silverBracketFinalGameMode : 'rounds') === 'points'
                            ? `${showAdvancedBracketConfig ? silverBracketFinalPointsToWin : 7}p${(showAdvancedBracketConfig ? silverBracketFinalMatchesToWin : 1) > 1 ? ` · Pg${silverBracketFinalMatchesToWin}` : ''}`
                            : `${showAdvancedBracketConfig ? silverBracketFinalRoundsToPlay : 4}r`}
                        </span>
                      </div>
                    </div>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Validation Messages -->
      {#if validationErrors.length > 0}
        <div class="validation-messages errors">
          <strong>⚠️ {m.wizard_errors()}</strong>
          <ul>
            {#each validationErrors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if validationWarnings.length > 0}
        <div class="validation-messages warnings">
          <strong>💡 {m.wizard_warnings()}</strong>
          <ul>
            {#each validationWarnings as warning}
              <li>{warning}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <!-- Navigation -->
    <div class="wizard-navigation">
      <button class="nav-button secondary" onclick={prevStep} disabled={currentStep === 1}>
        ← {m.wizard_previous()}
      </button>

      {#if currentStep < totalSteps}
        <button class="nav-button primary" onclick={nextStep} disabled={validationErrors.length > 0}>
          {m.wizard_next()} →
        </button>
      {:else}
        <button class="nav-button primary create" onclick={createTournamentSubmit} disabled={creating || validationErrors.length > 0}>
          {#if creating}
            <LoadingSpinner size="small" inline={true} message={editMode ? m.wizard_saving() : m.wizard_creating()} />
          {:else}
            {editMode ? `💾 ${m.wizard_saveChanges()}` : duplicateMode ? `📋 ${m.wizard_createCopy()}` : `🏆 ${m.wizard_create()}`}
          {/if}
        </button>
      {/if}
    </div>
    {/if}
  </div>
  {/if}
</AdminGuard>

<!-- Toast Notification -->
<Toast
  message={toastMessage}
  visible={showToast}
  type={toastType}
  duration={3000}
  onClose={() => showToast = false}
/>

<!-- Loading Overlay -->
{#if creating}
  <div class="loading-overlay" data-theme={$adminTheme}>
    <div class="loading-content">
      <LoadingSpinner size="large" message={editMode ? m.admin_savingTournament() : m.admin_creatingTournament()} />
    </div>
  </div>
{/if}

<style>
  .wizard-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 0;
    min-height: 100vh;
    min-height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: #f5f5f5;
    transition: background-color 0.3s;
    overflow: hidden;
  }

  .wizard-container[data-theme='dark'] {
    background: #0f1419;
  }

  /* Header - Compact like other pages */
  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem 1.5rem;
    transition: background-color 0.3s, border-color 0.3s;
    flex-shrink: 0;
  }

  .wizard-container[data-theme='dark'] .page-header {
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

  .wizard-container[data-theme='dark'] .back-btn {
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

  .wizard-container[data-theme='dark'] .title-section h1 {
    color: #e1e8ed;
  }

  .header-badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .info-badge {
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .info-badge.step-badge {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .info-badge.quota-badge {
    background: #e8f4fd;
    color: #1976d2;
  }

  .info-badge.quota-badge.unlimited {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .info-badge.quota-badge.warning {
    background: #fff3cd;
    color: #856404;
  }

  .info-badge.quota-badge.error {
    background: #f8d7da;
    color: #721c24;
  }

  [data-theme='dark'] .info-badge.quota-badge {
    background: #1a3a4d;
    color: #90caf9;
  }

  [data-theme='dark'] .info-badge.quota-badge.unlimited {
    background: #1b3d1f;
    color: #81c784;
  }

  [data-theme='dark'] .info-badge.quota-badge.warning {
    background: #4d3a00;
    color: #ffc107;
  }

  [data-theme='dark'] .info-badge.quota-badge.error {
    background: #4d1f24;
    color: #f48fb1;
  }

  .quota-blocked-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
    text-align: center;
    min-height: 300px;
  }

  .quota-blocked-message .blocked-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .quota-blocked-message h2 {
    color: #721c24;
    margin-bottom: 0.5rem;
  }

  .quota-blocked-message p {
    color: #666;
    margin-bottom: 1.5rem;
  }

  .quota-blocked-message .back-button {
    padding: 0.75rem 1.5rem;
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
  }

  .quota-blocked-message .back-button:hover {
    background: #5a6268;
  }

  [data-theme='dark'] .quota-blocked-message h2 {
    color: #f48fb1;
  }

  [data-theme='dark'] .quota-blocked-message p {
    color: #8b9bb3;
  }

  [data-theme='dark'] .quota-blocked-message .back-button {
    background: #2d3748;
  }

  [data-theme='dark'] .quota-blocked-message .back-button:hover {
    background: #4a5568;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Progress Bar - Compact */
  .progress-bar {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 0;
    margin-top: 0.75rem;
    position: relative;
  }

  .progress-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    position: relative;
    z-index: 1;
    background: none;
    border: none;
    cursor: default;
    padding: 0.25rem 0.75rem;
    transition: all 0.2s;
  }

  /* Línea conectora entre pasos */
  .progress-step:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 14px;
    left: calc(50% + 18px);
    width: calc(100% - 8px);
    height: 2px;
    background: #e0e0e0;
    z-index: 0;
  }

  .progress-step.active:not(:last-child)::after {
    background: #059669;
  }

  .wizard-container[data-theme='dark'] .progress-step:not(:last-child)::after {
    background: #374151;
  }

  .wizard-container[data-theme='dark'] .progress-step.active:not(:last-child)::after {
    background: #10b981;
  }

  .progress-step:hover {
    opacity: 1;
  }

  .progress-step.clickable {
    cursor: pointer;
  }

  .progress-step.clickable:hover .step-number {
    transform: scale(1.05);
    border-color: #059669;
  }

  .progress-step.clickable:hover .step-label {
    color: #059669;
  }

  .step-number {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #d1d5db;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.75rem;
    color: #9ca3af;
    transition: all 0.2s;
    position: relative;
    z-index: 2;
  }

  .wizard-container[data-theme='dark'] .step-number {
    background: #1f2937;
    border-color: #4b5563;
    color: #6b7280;
  }

  .progress-step.active .step-number {
    border-color: #059669;
    color: #059669;
    background: #ecfdf5;
  }

  .wizard-container[data-theme='dark'] .progress-step.active .step-number {
    background: #064e3b;
    border-color: #10b981;
    color: #10b981;
  }

  .progress-step.current .step-number {
    background: #059669;
    color: white;
    border-color: #059669;
    box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
  }

  .wizard-container[data-theme='dark'] .progress-step.current .step-number {
    background: #10b981;
    color: #ffffff;
    border-color: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
  }

  .step-label {
    font-size: 0.65rem;
    font-weight: 500;
    color: #9ca3af;
    text-align: center;
    transition: color 0.2s;
    white-space: nowrap;
  }

  .wizard-container[data-theme='dark'] .step-label {
    color: #6b7280;
  }

  .progress-step.active .step-label {
    color: #374151;
  }

  .wizard-container[data-theme='dark'] .progress-step.active .step-label {
    color: #d1d5db;
  }

  .progress-step.current .step-label {
    color: #059669;
    font-weight: 600;
  }

  .wizard-container[data-theme='dark'] .progress-step.current .step-label {
    color: #10b981;
  }

  /* Content */
  .wizard-content {
    background: white;
    border-radius: 8px;
    padding: 1.25rem 1.25rem 0 1.25rem;
    margin-top: 1rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    transition: background-color 0.3s, box-shadow 0.3s;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .wizard-container[data-theme='dark'] .wizard-content {
    background: #1a2332;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .wizard-content::-webkit-scrollbar {
    width: 6px;
  }

  .wizard-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .wizard-content::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 3px;
  }

  .wizard-container[data-theme='dark'] .wizard-content::-webkit-scrollbar-thumb {
    background: #4a5568;
  }

  .step-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .step-container h2 {
    font-size: 1rem;
    margin: 0 0 1rem 0;
    color: #1a1a1a;
    font-weight: 600;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .step-container h2 {
    color: #e1e8ed;
  }

  .wizard-intro {
    font-size: 0.85rem;
    color: #4a5568;
    margin: -0.5rem 0 1rem 0;
    line-height: 1.5;
    padding: 0.75rem 1rem;
    background: #f0f7ff;
    border-left: 3px solid #3182ce;
    border-radius: 0 6px 6px 0;
  }

  .wizard-container[data-theme='dark'] .wizard-intro {
    color: #a0aec0;
    background: #1a2a3a;
    border-left-color: #4299e1;
  }

  /* Participants limit indicators */
  .participants-limit-info {
    background: #e8f4fd;
    border: 1px solid #b3d7f5;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
    color: #1a5a96;
  }

  .wizard-container[data-theme='dark'] .participants-limit-info {
    background: #1a3a5c;
    border-color: #2a5a8c;
    color: #a0c4e8;
  }

  .extra-tables-hint {
    color: #e67e22;
    font-weight: 500;
  }

  .wizard-container[data-theme='dark'] .extra-tables-hint {
    color: #f5a623;
  }

  /* Step 1: Basic Info - Section Layout */
  .step-basic {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .step-basic h2 {
    margin-bottom: 0.25rem;
  }

  .info-section {
    background: #fafafa;
    border: 1px solid #e8e8e8;
    border-radius: 6px;
    position: relative;
  }

  .wizard-container[data-theme='dark'] .info-section {
    background: #161b22;
    border-color: #2d3748;
  }

  .info-section-header {
    background: #f0f0f0;
    padding: 0.5rem 0.75rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    border-bottom: 1px solid #e8e8e8;
    border-radius: 5px 5px 0 0;
  }

  .wizard-container[data-theme='dark'] .info-section-header {
    background: #1e252d;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .info-grid {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .id-grid {
    grid-template-columns: 200px 70px 1fr;
  }

  .location-grid {
    grid-template-columns: 1fr 1fr 140px;
  }

  .config-grid {
    grid-template-columns: 160px 1fr;
  }

  .info-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .info-field label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #64748b;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .wizard-container[data-theme='dark'] .info-field label {
    color: #8b9bb3;
  }

  .optional-label {
    font-weight: 400;
    text-transform: lowercase;
    color: #94a3b8;
  }

  .wizard-container[data-theme='dark'] .optional-label {
    color: #64748b;
  }

  .info-field .input-field {
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
  }

  .info-field .field-error {
    font-size: 0.65rem;
    color: #dc2626;
    margin-top: 0.1rem;
  }

  .wizard-container[data-theme='dark'] .info-field .field-error {
    color: #f87171;
  }

  .info-field .field-hint {
    font-size: 0.65rem;
    color: #6b7280;
    margin-top: 0.1rem;
  }

  .wizard-container[data-theme='dark'] .info-field .field-hint {
    color: #8b9bb3;
  }

  .info-field .key-input {
    text-transform: uppercase;
    font-family: monospace;
    letter-spacing: 0.1em;
    font-weight: 600;
  }

  .edition-field .input-field {
    text-align: center;
  }

  .type-field {
    max-width: 160px;
  }

  .type-toggle {
    display: flex;
    gap: 0;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .wizard-container[data-theme='dark'] .type-toggle {
    border-color: #2d3748;
  }

  .type-btn {
    flex: 1;
    padding: 0.4rem 0.6rem;
    border: none;
    background: white;
    color: #64748b;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .wizard-container[data-theme='dark'] .type-btn {
    background: #0f1419;
    color: #8b9bb3;
  }

  .type-btn:not(:last-child) {
    border-right: 1px solid #e5e7eb;
  }

  .wizard-container[data-theme='dark'] .type-btn:not(:last-child) {
    border-color: #2d3748;
  }

  .type-btn.active {
    background: #3b82f6;
    color: white;
  }

  .wizard-container[data-theme='dark'] .type-btn.active {
    background: #3b82f6;
    color: white;
  }

  .desc-field {
    flex: 1;
  }

  @media (max-width: 600px) {
    .id-grid {
      grid-template-columns: 1fr 70px;
    }

    .id-grid .name-field {
      grid-column: 1 / -1;
    }

    .id-grid .key-field {
      grid-column: 1;
    }

    .location-grid {
      grid-template-columns: 1fr 1fr;
    }

    .location-grid .info-field:last-child {
      grid-column: 1 / -1;
    }

    .config-grid {
      grid-template-columns: 1fr;
    }

    .type-field {
      max-width: none;
    }
  }

  /* Form Elements - Compact */
  .form-group {
    margin-bottom: 1rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  label {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
    color: #333;
    font-size: 0.8rem;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] label {
    color: #c5d0de;
  }

  .input-field {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.85rem;
    background: white;
    color: #333;
    transition: all 0.2s;
  }

  .wizard-container[data-theme='dark'] .input-field {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .input-field:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
  }

  textarea.input-field {
    resize: vertical;
    font-family: inherit;
  }

  /* Key input validation styles */
  .key-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .key-input-wrapper .input-field {
    padding-right: 2rem;
  }

  .key-status {
    position: absolute;
    right: 0.5rem;
    font-size: 0.9rem;
  }

  .key-status.loading {
    animation: spin 1s linear infinite;
  }

  .key-status.error {
    color: #dc2626;
  }

  .key-status.valid {
    color: #16a34a;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .input-field.input-error {
    border-color: #b91c1c;
    background: #fef2f2;
  }

  .input-field.input-error:focus {
    border-color: #b91c1c;
    background: #fef2f2;
    box-shadow: none;
  }

  .wizard-container[data-theme='dark'] .input-field.input-error {
    border-color: #991b1b;
    background: #1f1515;
  }

  .wizard-container[data-theme='dark'] .input-field.input-error:focus {
    border-color: #991b1b;
    background: #1f1515;
  }

  .input-field.input-valid {
    border-color: #15803d;
    background: #f0fdf4;
  }

  .input-field.input-valid:focus {
    border-color: #15803d;
    background: #f0fdf4;
    box-shadow: none;
  }

  .wizard-container[data-theme='dark'] .input-field.input-valid {
    border-color: #166534;
    background: #14261a;
  }

  .wizard-container[data-theme='dark'] .input-field.input-valid:focus {
    border-color: #166534;
    background: #14261a;
  }

  .radio-group {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
  }

  .radio-group.vertical {
    flex-direction: column;
  }

  .radio-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    cursor: pointer;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    transition: all 0.2s;
    flex: 1;
    flex-wrap: wrap;
    font-size: 0.85rem;
  }

  .radio-group.vertical .radio-label {
    justify-content: flex-start;
  }

  .radio-description {
    width: 100%;
    font-size: 0.7rem;
    color: #6b7280;
    margin-left: 22px;
    margin-top: 0.2rem;
  }

  .wizard-container[data-theme='dark'] .radio-description {
    color: #8b9bb3;
  }

  .wizard-container[data-theme='dark'] .radio-label {
    border-color: #2d3748;
  }

  .radio-label:hover {
    background: #f8f8f8;
    border-color: #667eea;
  }

  .wizard-container[data-theme='dark'] .radio-label:hover {
    background: #2d3748;
  }

  .radio-label input[type='radio'] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    font-weight: normal;
    font-size: 0.85rem;
  }

  .checkbox-label input[type='checkbox'] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .help-text {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.7rem;
    color: #999;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .help-text {
    color: #6b7a94;
  }

  .phase-config,
  .ranking-config {
    padding: 1rem;
    background: #f8f8f8;
    border-radius: 6px;
    transition: background-color 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-config,
  .wizard-container[data-theme='dark'] .ranking-config {
    background: #0f1419;
  }

  .phase-config h3,
  .ranking-config h3 {
    font-size: 0.9rem;
    margin: 0 0 0.75rem 0;
    color: #555;
    transition: color 0.3s;
  }

  .ranking-config h4 {
    margin: 0 0 0.4rem 0;
    font-size: 0.9rem;
    color: #1976d2;
  }

  .wizard-container[data-theme='dark'] .ranking-config h4 {
    color: #4dabf7;
  }

  .tier-description {
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 0.75rem;
  }

  .wizard-container[data-theme='dark'] .tier-description {
    color: #8b9bb3;
  }

  /* Tier Selection Cards - 2 Columns */
  .tier-selection {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin-bottom: 1rem;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
  }

  .tier-option {
    cursor: pointer;
  }

  .tier-option input[type="radio"] {
    display: none;
  }

  .tier-card {
    padding: 0.75rem;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    background: #fff;
    transition: all 0.2s ease;
  }

  .wizard-container[data-theme='dark'] .tier-card {
    background: #1a2332;
    border-color: #374151;
  }

  .tier-option:hover .tier-card {
    border-color: #90caf9;
  }

  .tier-option.selected .tier-card {
    border-color: #1976d2;
    background: #e3f2fd;
  }

  .wizard-container[data-theme='dark'] .tier-option.selected .tier-card {
    border-color: #4dabf7;
    background: #1a2a3a;
  }

  .tier-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
  }

  .tier-badge {
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 0.65rem;
    font-weight: 700;
    color: #fff;
  }

  .tier-badge.tier-1 { background: #d4af37; }
  .tier-badge.tier-2 { background: #1976d2; }
  .tier-badge.tier-3 { background: #388e3c; }
  .tier-badge.tier-4 { background: #7b1fa2; }

  .tier-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: #333;
  }

  .wizard-container[data-theme='dark'] .tier-name {
    color: #e1e8ed;
  }

  .tier-desc {
    font-size: 0.7rem;
    color: #666;
    margin-bottom: 0.35rem;
  }

  .wizard-container[data-theme='dark'] .tier-desc {
    color: #8b9bb3;
  }

  .tier-points {
    font-size: 0.75rem;
    font-weight: 600;
    color: #2e7d32;
  }

  .wizard-container[data-theme='dark'] .tier-points {
    color: #66bb6a;
  }

  /* Points Distribution Table - Compact */
  .points-distribution {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: #e8f4fd;
    border-radius: 6px;
    border-left: 3px solid #2196f3;
  }

  .wizard-container[data-theme='dark'] .points-distribution {
    background: #1a2a3a;
    border-left-color: #4dabf7;
  }

  .points-distribution h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.85rem;
    color: #1976d2;
  }

  .wizard-container[data-theme='dark'] .points-distribution h4 {
    color: #4dabf7;
  }

  .points-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
    margin-bottom: 0.35rem;
  }

  .points-table th,
  .points-table td {
    padding: 0.3rem 0.4rem;
    text-align: center;
    border: 1px solid #c5dff5;
  }

  .wizard-container[data-theme='dark'] .points-table th,
  .wizard-container[data-theme='dark'] .points-table td {
    border-color: #374151;
  }

  .points-table th {
    background: #c5dff5;
    font-weight: 600;
    color: #1565c0;
  }

  .wizard-container[data-theme='dark'] .points-table th {
    background: #1a2332;
    color: #4dabf7;
  }

  .points-table td.points {
    color: #2e7d32;
    font-weight: 600;
  }

  .wizard-container[data-theme='dark'] .points-table td.points {
    color: #66bb6a;
  }

  /* ============================================
     STEP 2: FORMAT SECTION STYLES
     ============================================ */

  .step-format h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
    color: #1a1a1a;
  }

  .wizard-container[data-theme='dark'] .step-format h2 {
    color: #f3f4f6;
  }

  .format-section {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    margin-bottom: 0.75rem;
    overflow: hidden;
  }

  .wizard-container[data-theme='dark'] .format-section {
    background: #1a2332;
    border-color: #374151;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .wizard-container[data-theme='dark'] .section-header {
    background: #111827;
    border-bottom-color: #374151;
  }

  .section-header.groups {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  }

  .wizard-container[data-theme='dark'] .section-header.groups {
    background: linear-gradient(135deg, #1e3a5f 0%, #1e40af20 100%);
  }

  .section-header.finals {
    background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
  }

  .wizard-container[data-theme='dark'] .section-header.finals {
    background: linear-gradient(135deg, #422006 0%, #78350f20 100%);
  }

  .section-number {
    width: 20px;
    height: 20px;
    background: #667eea;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .section-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #374151;
  }

  .wizard-container[data-theme='dark'] .section-title {
    color: #e5e7eb;
  }

  .section-body {
    padding: 0.75rem;
  }

  /* Inline config layout */
  .inline-config {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: flex-start;
  }

  .config-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .config-field.wide {
    flex: 1;
    min-width: 200px;
  }

  .config-field.phase-selector {
    flex: 1;
    min-width: 150px;
  }

  .config-field label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .wizard-container[data-theme='dark'] .config-field label {
    color: #9ca3af;
  }

  .field-hint {
    font-size: 0.65rem;
    color: #9ca3af;
  }

  .wizard-container[data-theme='dark'] .field-hint {
    color: #6b7280;
  }

  /* Toggle buttons */
  .toggle-buttons {
    display: inline-flex;
    background: transparent;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 0;
    gap: 0;
    overflow: hidden;
  }

  .wizard-container[data-theme='dark'] .toggle-buttons {
    border-color: #4b5563;
  }

  .toggle-buttons.small {
    border-radius: 5px;
  }

  .toggle-btn {
    padding: 0.4rem 0.55rem;
    border: none;
    background: transparent;
    border-radius: 0;
    font-size: 0.75rem;
    font-weight: 500;
    flex: 1;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    border-right: 1px solid #d1d5db;
  }

  .toggle-btn:last-child {
    border-right: none;
  }

  .toggle-buttons.small .toggle-btn {
    padding: 0.3rem 0.55rem;
    font-size: 0.7rem;
  }

  .toggle-buttons.mini {
    border-radius: 5px;
  }

  .toggle-buttons.mini .toggle-btn {
    padding: 0.25rem 0.45rem;
    font-size: 0.65rem;
    font-weight: 500;
  }

  .toggle-btn:hover:not(.active) {
    background: #ecfdf5;
    color: #047857;
  }

  .toggle-btn.active {
    background: #059669;
    color: white;
    border-color: #059669;
  }

  .wizard-container[data-theme='dark'] .toggle-btn {
    color: #9ca3af;
    border-color: #4b5563;
  }

  .wizard-container[data-theme='dark'] .toggle-btn:hover:not(.active) {
    background: #374151;
    color: #6ee7b7;
  }

  .wizard-container[data-theme='dark'] .toggle-btn.active {
    background: #10b981;
    color: #064e3b;
    font-weight: bold;
    border-color: #10b981;
  }

  /* Phase Buttons - compact exclusive toggle */
  .phase-buttons {
    display: inline-flex;
    gap: 4px;
  }

  .phase-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f9fafb;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    color: #6b7280;
    transition: all 0.15s ease;
  }

  .wizard-container[data-theme='dark'] .phase-btn {
    background: #374151;
    border-color: #4b5563;
    color: #9ca3af;
  }

  .phase-btn:hover:not(.active) {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .wizard-container[data-theme='dark'] .phase-btn:hover:not(.active) {
    background: #4b5563;
  }

  .phase-btn.active {
    background: #059669;
    border-color: #059669;
    color: white;
  }

  .wizard-container[data-theme='dark'] .phase-btn.active {
    background: #10b981;
    border-color: #10b981;
    color: #064e3b;
    font-weight: bold;
  }

  .phase-selector-compact {
    min-width: auto;
  }

  .phase-selector-compact label {
    margin-bottom: 0.35rem;
  }

  /* Input compact styles */
  .input-field.compact {
    width: 70px;
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
  }

  .input-field.mini {
    width: 55px;
    padding: 0.3rem 0.4rem;
    font-size: 0.75rem;
    text-align: center;
  }

  /* Match settings row */
  .match-settings {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px dashed #e5e7eb;
  }

  .wizard-container[data-theme='dark'] .match-settings {
    border-top-color: #374151;
  }

  .settings-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 0.35rem;
    display: block;
  }

  .settings-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .inline-field {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .inline-field span {
    font-size: 0.7rem;
    color: #6b7280;
  }

  .wizard-container[data-theme='dark'] .inline-field span {
    color: #9ca3af;
  }

  /* Brackets config */
  .brackets-config {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .brackets-config.split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  @media (max-width: 600px) {
    .brackets-config.split {
      grid-template-columns: 1fr;
    }
  }

  .bracket-box {
    padding: 0.5rem;
    background: #f9fafb;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
  }

  .wizard-container[data-theme='dark'] .bracket-box {
    background: #111827;
    border-color: #374151;
  }

  .bracket-box.gold {
    border-left: 3px solid #f59e0b;
  }

  .bracket-box.silver {
    border-left: 3px solid #9ca3af;
  }

  .bracket-label {
    display: inline-block;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.35rem;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
  }

  .bracket-label.gold {
    background: #fef3c7;
    color: #b45309;
  }

  .bracket-label.silver {
    background: #f3f4f6;
    color: #6b7280;
  }

  .wizard-container[data-theme='dark'] .bracket-label.gold {
    background: #78350f;
    color: #fcd34d;
  }

  .wizard-container[data-theme='dark'] .bracket-label.silver {
    background: #374151;
    color: #d1d5db;
  }

  /* Advanced config */
  .advanced-config-section {
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px dashed #e5e7eb;
  }

  .wizard-container[data-theme='dark'] .advanced-config-section {
    border-top-color: #374151;
  }

  .advanced-toggle {
    background: none;
    border: none;
    padding: 0.25rem 0;
    font-size: 0.75rem;
    font-weight: 500;
    color: #6366f1;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .advanced-toggle:hover {
    color: #4f46e5;
  }

  .wizard-container[data-theme='dark'] .advanced-toggle {
    color: #818cf8;
  }

  .advanced-phases-grid {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .advanced-phases-grid.split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  @media (max-width: 600px) {
    .advanced-phases-grid.split {
      grid-template-columns: 1fr;
    }
  }

  .advanced-bracket {
    padding: 0.5rem;
    background: #fafafa;
    border-radius: 4px;
  }

  .wizard-container[data-theme='dark'] .advanced-bracket {
    background: #111827;
  }

  .advanced-bracket.gold {
    border-left: 2px solid #f59e0b;
  }

  .advanced-bracket.silver {
    border-left: 2px solid #9ca3af;
  }

  .advanced-bracket-title {
    font-size: 0.7rem;
    font-weight: 600;
    display: block;
    margin-bottom: 0.5rem;
  }

  .advanced-bracket-title.gold {
    color: #b45309;
  }

  .advanced-bracket-title.silver {
    color: #6b7280;
  }

  .wizard-container[data-theme='dark'] .advanced-bracket-title.gold {
    color: #fcd34d;
  }

  .wizard-container[data-theme='dark'] .advanced-bracket-title.silver {
    color: #d1d5db;
  }

  .phase-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .phase-row:last-child {
    border-bottom: none;
  }

  .wizard-container[data-theme='dark'] .phase-row {
    border-bottom-color: #374151;
  }

  .phase-name {
    font-size: 0.7rem;
    font-weight: 500;
    color: #4b5563;
    min-width: 60px;
  }

  .wizard-container[data-theme='dark'] .phase-name {
    color: #9ca3af;
  }

  .phase-controls {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .phase-controls select.input-field.mini {
    width: 70px;
  }

  .bo-label {
    font-size: 0.65rem;
    color: #9ca3af;
    margin-left: 0.25rem;
  }

  /* Toggle Row Container */
  .toggle-row-container {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }

  /* Consolation Toggle Row */
  .consolation-toggle-row {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .wizard-container[data-theme='dark'] .consolation-toggle-row {
    background: #1f2937;
    border-color: #374151;
  }

  /* Mobile: stack vertically */
  @media (max-width: 640px) {
    .toggle-row-container {
      flex-direction: column;
    }
  }

  .consolation-toggle-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .consolation-toggle-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #1f2937;
  }

  .wizard-container[data-theme='dark'] .consolation-toggle-label {
    color: #f3f4f6;
  }

  .consolation-toggle-desc {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .wizard-container[data-theme='dark'] .consolation-toggle-desc {
    color: #9ca3af;
  }

  /* Toggle Switch */
  .toggle-switch {
    position: relative;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .toggle-track {
    display: block;
    width: 44px;
    height: 24px;
    background: #d1d5db;
    border-radius: 12px;
    transition: background-color 0.2s;
    position: relative;
  }

  .toggle-switch.active .toggle-track {
    background: #10b981;
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s;
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(20px);
  }

  .wizard-container[data-theme='dark'] .toggle-track {
    background: #4b5563;
  }

  .wizard-container[data-theme='dark'] .toggle-switch.active .toggle-track {
    background: #10b981;
  }

  /* Options section */
  .options-section .section-body {
    padding: 0.5rem 0.75rem;
  }

  .options-row {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .option-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
  }

  .option-toggle input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .option-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: #374151;
  }

  .wizard-container[data-theme='dark'] .option-label {
    color: #e5e7eb;
  }

  /* Options inline in config general */
  .options-inline {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .option-check {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    font-size: 0.75rem;
    color: #374151;
  }

  .wizard-container[data-theme='dark'] .option-check {
    color: #d1d5db;
  }

  .option-check input[type="checkbox"] {
    width: 14px;
    height: 14px;
    cursor: pointer;
    accent-color: #667eea;
  }

  .option-check span {
    font-weight: 500;
  }

  /* Responsive for step-format */
  @media (max-width: 600px) {
    .inline-config {
      flex-direction: column;
      gap: 0.75rem;
    }

    .config-field,
    .config-field.wide,
    .config-field.phase-selector {
      width: 100%;
    }

    .settings-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .bracket-box .match-settings {
      border-top: none;
      margin-top: 0;
      padding-top: 0;
    }
  }

  /* Phase sections - Compact Professional design */
  .phase-section {
    margin-top: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-section {
    background: #1a2332;
    border-color: #374151;
  }

  .phase-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-header {
    border-bottom-color: #374151;
  }

  .phase-header.groups {
    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  }

  .wizard-container[data-theme='dark'] .phase-header.groups {
    background: linear-gradient(135deg, #0c2d48 0%, #1e3a5f 100%);
  }

  .phase-header.finals {
    background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
  }

  .wizard-container[data-theme='dark'] .phase-header.finals {
    background: linear-gradient(135deg, #422006 0%, #713f12 100%);
  }

  .phase-icon {
    font-size: 1.2rem;
    line-height: 1;
  }

  .phase-title h3 {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0;
    color: #1f2937;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-title h3 {
    color: #f3f4f6;
  }

  .phase-title small {
    font-size: 0.7rem;
    color: #6b7280;
    font-weight: 400;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-title small {
    color: #9ca3af;
  }

  .phase-content {
    padding: 1rem;
  }

  /* Match config box - Compact uniform design */
  .match-config-box {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .match-config-box {
    background: #111827;
    border-color: #374151;
  }

  .match-config-box h4 {
    font-size: 0.8rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: #374151;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .match-config-box h4 {
    color: #d1d5db;
  }

  .match-config-box.gold {
    border-left: 3px solid #f59e0b;
  }

  .match-config-box.silver {
    border-left: 3px solid #9ca3af;
  }

  /* Advanced bracket config - Compact */
  .advanced-config-section {
    margin-top: 1rem;
    border-top: 1px dashed #e5e7eb;
    padding-top: 0.75rem;
  }

  .wizard-container[data-theme='dark'] .advanced-config-section {
    border-color: #374151;
  }

  .advanced-toggle {
    background: none;
    border: none;
    padding: 0.35rem 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: #667eea;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: color 0.2s;
  }

  .advanced-toggle:hover {
    color: #4f46e5;
  }

  .wizard-container[data-theme='dark'] .advanced-toggle {
    color: #818cf8;
  }

  .advanced-config-content {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: #f8fafc;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
  }

  .wizard-container[data-theme='dark'] .advanced-config-content {
    background: #0f172a;
    border-color: #334155;
  }

  .advanced-hint {
    font-size: 0.75rem;
    color: #64748b;
    margin: 0 0 0.75rem 0;
    padding: 0.4rem 0.6rem;
    background: #e0f2fe;
    border-radius: 4px;
  }

  .wizard-container[data-theme='dark'] .advanced-hint {
    background: #1e3a5f;
    color: #94a3b8;
  }

  .phase-configs-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .phase-configs-container.split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  @media (max-width: 640px) {
    .phase-configs-container.split {
      grid-template-columns: 1fr;
    }
  }

  .phase-configs-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .phase-configs-group h5 {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
    color: #1e293b;
  }

  .wizard-container[data-theme='dark'] .phase-configs-group h5 {
    color: #e2e8f0;
  }

  .phase-configs-group.gold h5 {
    color: #b45309;
  }

  .phase-configs-group.silver h5 {
    color: #6b7280;
  }

  .phase-config-box {
    padding: 0.75rem;
    background: white;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .wizard-container[data-theme='dark'] .phase-config-box {
    background: #1e293b;
    border-color: #334155;
  }

  .phase-config-box h6 {
    font-size: 0.85rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
    color: #475569;
  }

  .wizard-container[data-theme='dark'] .phase-config-box h6 {
    color: #94a3b8;
  }

  .phase-config-box.early {
    border-left: 3px solid #6366f1;
  }

  .phase-config-box.semi {
    border-left: 3px solid #f59e0b;
  }

  .phase-config-box.final {
    border-left: 3px solid #10b981;
  }

  .form-row.compact {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .form-row.compact .form-group {
    flex: 1;
    min-width: 80px;
    margin-bottom: 0;
  }

  .form-row.compact label {
    font-size: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .input-field.small {
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
  }

  /* Brackets container */
  .brackets-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .brackets-container.split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  @media (max-width: 768px) {
    .brackets-container.split {
      grid-template-columns: 1fr;
    }
  }

  /* Settings section - Compact */
  .settings-section {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .settings-section {
    background: #111827;
    border-color: #374151;
  }

  .settings-section h3 {
    font-size: 0.8rem;
    font-weight: 600;
    margin: 0 0 0.6rem 0;
    color: #374151;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .settings-section h3 {
    color: #d1d5db;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.5rem;
  }

  .setting-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .wizard-container[data-theme='dark'] .setting-item {
    background: #1f2937;
    border-color: #374151;
  }

  .setting-item:hover {
    border-color: #d1d5db;
  }

  .wizard-container[data-theme='dark'] .setting-item:hover {
    border-color: #4b5563;
  }

  .setting-item input[type='checkbox'] {
    width: 16px;
    height: 16px;
    margin-top: 1px;
    cursor: pointer;
    accent-color: #667eea;
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .setting-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: #1f2937;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .setting-label {
    color: #f3f4f6;
  }

  .setting-info small {
    font-size: 0.7rem;
    color: #6b7280;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .setting-info small {
    color: #9ca3af;
  }

  .wizard-container[data-theme='dark'] .phase-config h3,
  .wizard-container[data-theme='dark'] .ranking-config h3 {
    color: #8b9bb3;
  }

  .phase-config h4 {
    font-size: 1rem;
    margin: 0 0 1rem 0;
    color: #666;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-config h4 {
    color: #8b9bb3;
  }

  .phase-config hr {
    margin: 1.5rem 0;
    border: none;
    border-top: 1px solid #e0e0e0;
    transition: border-color 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-config hr {
    border-top-color: #2d3748;
  }

  /* Edition + Name Row */
  .name-edition-row {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .edition-group {
    flex: 0 0 80px;
  }

  .edition-group .input-field {
    text-align: center;
  }

  /* Tournament Name Search */
  .name-search-group {
    position: relative;
    flex: 1;
  }

  .name-search-wrapper {
    position: relative;
  }

  .name-search-loading {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    animation: spin 1s linear infinite;
  }

  .name-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #e0e0e0;
    border-top: none;
    border-radius: 0 0 6px 6px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .wizard-container[data-theme='dark'] .name-dropdown {
    background: #1a2332;
    border-color: #2d3748;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .name-dropdown-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.75rem 1rem;
    text-align: left;
    background: none;
    border: none;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    font-size: 0.95rem;
    color: #333;
    transition: background-color 0.2s;
  }

  .wizard-container[data-theme='dark'] .name-dropdown-item {
    color: #e1e8ed;
    border-bottom-color: #2d3748;
  }

  .name-dropdown-item:hover {
    background: #f8f8f8;
  }

  .wizard-container[data-theme='dark'] .name-dropdown-item:hover {
    background: #2d3748;
  }

  .name-dropdown-item:last-child {
    border-bottom: none;
  }

  .name-dropdown-name {
    flex: 1;
  }

  .name-dropdown-edition {
    font-size: 0.8rem;
    color: #666;
    background: #f0f0f0;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    margin-left: 0.5rem;
  }

  .wizard-container[data-theme='dark'] .name-dropdown-edition {
    color: #a0aec0;
    background: #2d3748;
  }

  /* Participants - Compact */
  .participants-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .add-participants {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .search-section h3,
  .guest-section h3,
  .participants-list h3 {
    font-size: 0.9rem;
    margin: 0 0 0.75rem 0;
    color: #555;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .search-section h3,
  .wizard-container[data-theme='dark'] .guest-section h3,
  .wizard-container[data-theme='dark'] .participants-list h3 {
    color: #8b9bb3;
  }

  .search-box {
    position: relative;
  }

  .search-loading {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: translateY(-50%) rotate(0deg);
    }
    to {
      transform: translateY(-50%) rotate(360deg);
    }
  }

  .search-results {
    margin-top: 0.4rem;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    transition: border-color 0.3s;
  }

  .wizard-container[data-theme='dark'] .search-results {
    border-color: #2d3748;
  }

  .search-result-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border: none;
    background: white;
    color: #333;
    width: 100%;
    text-align: left;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
    transition: background-color 0.2s, color 0.3s;
    font-size: 0.85rem;
  }

  .wizard-container[data-theme='dark'] .search-result-item {
    background: #1a2332;
    border-bottom-color: #2d3748;
    color: #e1e8ed;
  }

  .search-result-item:hover {
    background: #f8f8f8;
  }

  .wizard-container[data-theme='dark'] .search-result-item:hover {
    background: #2d3748;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .user-name-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .user-info strong {
    color: #333;
    font-size: 0.85rem;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .user-info strong {
    color: #e1e8ed;
  }

  .user-ranking {
    font-size: 0.65rem;
    font-weight: 500;
    color: #666;
    background: #e8e8e8;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }

  .wizard-container[data-theme='dark'] .user-ranking {
    color: #a0aec0;
    background: #2d3748;
  }

  .user-email {
    font-size: 0.7rem;
    color: #999;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .user-email {
    color: #6b7a94;
  }

  .add-icon {
    font-size: 1.2rem;
    color: #667eea;
  }

  .guest-input-group {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }

  .guest-input-group .input-field {
    flex: 1;
  }

  .guest-button {
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .wizard-container[data-theme='dark'] .guest-button {
    background: #0f1419;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .guest-button:hover:not(:disabled) {
    border-color: #667eea;
    background: #f0f4ff;
    color: #667eea;
  }

  .wizard-container[data-theme='dark'] .guest-button:hover:not(:disabled) {
    background: #2d3748;
  }

  .guest-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty-participants {
    text-align: center;
    padding: 1.5rem;
    color: #999;
    font-size: 0.85rem;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .empty-participants {
    color: #6b7a94;
  }

  .participants-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .participant-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.6rem;
    background: #f8f8f8;
    border-radius: 4px;
    transition: background-color 0.3s;
  }

  .wizard-container[data-theme='dark'] .participant-card {
    background: #0f1419;
  }

  .participant-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .participant-name-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
  }

  .participant-ranking {
    font-size: 0.65rem;
    font-weight: 500;
    color: #666;
    background: #e8e8e8;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }

  .wizard-container[data-theme='dark'] .participant-ranking {
    color: #a0aec0;
    background: #2d3748;
  }

  .participant-type {
    font-size: 0.7rem;
    color: #999;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .participant-type {
    color: #6b7a94;
  }

  .remove-button {
    background: none;
    border: none;
    color: #ff4444;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.2rem 0.4rem;
    transition: transform 0.2s;
  }

  .remove-button:hover {
    transform: scale(1.1);
  }

  /* Review - Two Column Grid */
  .review-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    align-items: start;
  }

  .review-column {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .review-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    transition: all 0.2s;
  }

  .wizard-container[data-theme='dark'] .review-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  .review-card-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.75rem;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .wizard-container[data-theme='dark'] .review-card-header {
    background: #0f1419;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .review-icon {
    font-size: 0.85rem;
  }

  .review-card-body {
    padding: 0.5rem 0.75rem;
  }

  .review-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.3rem 0;
    font-size: 0.8rem;
  }

  .review-row:not(:last-child) {
    border-bottom: 1px solid #f1f5f9;
  }

  .wizard-container[data-theme='dark'] .review-row:not(:last-child) {
    border-bottom-color: #1e293b;
  }

  .review-label {
    color: #64748b;
    font-weight: 500;
  }

  .wizard-container[data-theme='dark'] .review-label {
    color: #8b9bb3;
  }

  .review-value {
    color: #1e293b;
    font-weight: 600;
    text-align: right;
  }

  .wizard-container[data-theme='dark'] .review-value {
    color: #e1e8ed;
  }

  .review-value.highlight {
    color: #3b82f6;
    font-family: monospace;
    letter-spacing: 0.05em;
  }

  .wizard-container[data-theme='dark'] .review-value.highlight {
    color: #60a5fa;
  }

  .participant-count {
    margin-left: auto;
    background: #3b82f6;
    color: white;
    padding: 0.15rem 0.4rem;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 700;
  }

  /* Participants Accordion */
  .participants-accordion {
    overflow: hidden;
  }

  .accordion-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.6rem 0.75rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .accordion-header:hover {
    background: rgba(0, 0, 0, 0.03);
  }

  .wizard-container[data-theme='dark'] .accordion-header:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .accordion-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #334155;
  }

  .wizard-container[data-theme='dark'] .accordion-title {
    color: #e2e8f0;
  }

  .accordion-chevron {
    font-size: 1.1rem;
    color: #94a3b8;
    transition: transform 0.2s ease;
    font-weight: 300;
  }

  .participants-accordion.expanded .accordion-chevron {
    transform: rotate(90deg);
  }

  .wizard-container[data-theme='dark'] .accordion-chevron {
    color: #64748b;
  }

  .accordion-body {
    padding: 0 0.75rem 0.75rem;
    border-top: 1px solid #e2e8f0;
    margin-top: 0;
  }

  .wizard-container[data-theme='dark'] .accordion-body {
    border-top-color: #1e293b;
  }

  .participants-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.35rem;
    padding-top: 0.6rem;
    max-height: 280px;
    overflow-y: auto;
  }

  .participant-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem;
    background: #f8fafc;
    border-radius: 4px;
    font-size: 0.72rem;
  }

  .wizard-container[data-theme='dark'] .participant-item {
    background: #0f172a;
  }

  .participant-number {
    color: #94a3b8;
    font-size: 0.65rem;
    min-width: 1.2rem;
    font-variant-numeric: tabular-nums;
  }

  .wizard-container[data-theme='dark'] .participant-number {
    color: #475569;
  }

  .participant-name {
    color: #475569;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .wizard-container[data-theme='dark'] .participant-name {
    color: #94a3b8;
  }

  .participant-item.registered .participant-name {
    color: #2563eb;
    font-weight: 500;
  }

  .wizard-container[data-theme='dark'] .participant-item.registered .participant-name {
    color: #60a5fa;
  }

  @media (max-width: 600px) {
    .review-grid {
      grid-template-columns: 1fr;
    }
  }

  .participant-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.25rem 0.5rem;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    font-size: 0.75rem;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .participant-chip {
    background: #1a2332;
    border-color: #2d3748;
  }

  /* Step 4: Participants - Compact Professional Design */
  .step-participants h2 {
    margin-bottom: 0.75rem;
  }

  .participants-counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f0f4f8;
    border-radius: 6px;
    font-size: 0.8rem;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .participants-counter {
    background: #1e2a3a;
  }

  .participants-counter.warning {
    background: #fef3c7;
    border: 1px solid #f59e0b;
  }

  .wizard-container[data-theme='dark'] .participants-counter.warning {
    background: #3d3520;
    border-color: #b45309;
  }

  .counter-text {
    font-weight: 700;
    font-size: 0.9rem;
    color: #1a1a1a;
  }

  .wizard-container[data-theme='dark'] .counter-text {
    color: #e1e8ed;
  }

  .participants-counter.warning .counter-text {
    color: #b45309;
  }

  .counter-label {
    color: #666;
    font-size: 0.75rem;
  }

  .wizard-container[data-theme='dark'] .counter-label {
    color: #8b9bb3;
  }

  .add-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .add-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .add-field.search-field {
    min-width: 0;
  }

  .add-field label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #555;
  }

  .wizard-container[data-theme='dark'] .add-field label {
    color: #8b9bb3;
  }

  .search-box {
    position: relative;
  }

  .search-box .input-field {
    padding-right: 2rem;
    width: 100%;
  }

  .search-loading {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.8rem;
  }

  .search-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 20;
    max-height: 200px;
    overflow-y: auto;
  }

  .wizard-container[data-theme='dark'] .search-results {
    background: #1a2332;
    border-color: #2d3748;
  }

  .search-result-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .wizard-container[data-theme='dark'] .search-result-item {
    border-color: #2d3748;
  }

  .search-result-item:last-child {
    border-bottom: none;
  }

  .search-result-item:hover:not(:disabled) {
    background: #f5f7fa;
  }

  .wizard-container[data-theme='dark'] .search-result-item:hover:not(:disabled) {
    background: #2d3748;
  }

  .search-result-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .result-name {
    flex: 1;
    font-size: 0.8rem;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wizard-container[data-theme='dark'] .result-name {
    color: #c5d0de;
  }

  .result-rank {
    font-size: 0.7rem;
    font-weight: 600;
    color: #667eea;
    background: #f0f4ff;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
  }

  .wizard-container[data-theme='dark'] .result-rank {
    background: #2a3548;
    color: #a0b4ff;
  }

  .result-add {
    font-size: 1rem;
    color: #10b981;
    font-weight: 700;
  }

  .guest-input-group {
    display: flex;
    gap: 0.35rem;
  }

  .guest-input-group .input-field {
    flex: 1;
  }

  .add-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-btn:hover:not(:disabled) {
    background: #059669;
  }

  .add-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .wizard-container[data-theme='dark'] .add-btn:disabled {
    background: #4a5568;
  }

  .participants-list-section {
    background: #fafafa;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.75rem;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .participants-list-section {
    background: #151e2c;
    border-color: #2d3748;
  }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
  }

  .wizard-container[data-theme='dark'] .list-header {
    color: #8b9bb3;
  }

  .list-count {
    background: #e5e7eb;
    padding: 0.1rem 0.4rem;
    border-radius: 10px;
    font-size: 0.7rem;
  }

  .wizard-container[data-theme='dark'] .list-count {
    background: #2d3748;
    color: #c5d0de;
  }

  .empty-list {
    text-align: center;
    color: #999;
    font-size: 0.8rem;
    padding: 1rem;
  }

  .wizard-container[data-theme='dark'] .empty-list {
    color: #6b7a94;
  }

  .participants-grid-2col {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem;
  }

  /* Override participant-chip styles for Step 4 grid */
  .participants-grid-2col .participant-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
    padding: 0.35rem 0.5rem;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .wizard-container[data-theme='dark'] .participants-grid-2col .participant-chip {
    background: #1a2332;
    border-color: #2d3748;
  }

  .participants-grid-2col .participant-chip.registered {
    border-color: #667eea;
    background: #f8f9ff;
  }

  .wizard-container[data-theme='dark'] .participants-grid-2col .participant-chip.registered {
    background: #1e2540;
    border-color: #4a5ecc;
  }

  .participants-grid-2col .participant-chip.pair {
    border-color: #10b981;
    background: #f0fdf4;
  }

  .wizard-container[data-theme='dark'] .participants-grid-2col .participant-chip.pair {
    background: #14332a;
    border-color: #059669;
  }

  .chip-pair-badge {
    font-size: 0.7rem;
  }

  .chip-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #64748b;
    font-weight: 500;
  }

  .wizard-container[data-theme='dark'] .chip-name {
    color: #94a3b8;
  }

  .participant-chip.registered .chip-name {
    color: #2563eb;
  }

  .wizard-container[data-theme='dark'] .participant-chip.registered .chip-name {
    color: #60a5fa;
  }

  .chip-rank {
    font-size: 0.65rem;
    font-weight: 600;
    color: #667eea;
    background: #eef1ff;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
  }

  .wizard-container[data-theme='dark'] .chip-rank {
    background: #2a3548;
    color: #a0b4ff;
  }

  .chip-remove {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f0f0f0;
    border: none;
    border-radius: 50%;
    color: #666;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .chip-remove:hover {
    background: #ef4444;
    color: white;
  }

  .wizard-container[data-theme='dark'] .chip-remove {
    background: #2d3748;
    color: #8b9bb3;
  }

  .wizard-container[data-theme='dark'] .chip-remove:hover {
    background: #ef4444;
    color: white;
  }

  /* Validation - Compact */
  .validation-messages {
    margin-top: 1rem;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .validation-messages.errors {
    background: #ffebee;
    color: #c62828;
    border: 1px solid #ef9a9a;
  }

  .validation-messages.warnings {
    background: #fff3e0;
    color: #e65100;
    border: 1px solid #ffcc80;
  }

  .wizard-container[data-theme='dark'] .validation-messages.errors {
    background: #3d1f1f;
    color: #ef9a9a;
    border-color: #5d2f2f;
  }

  .wizard-container[data-theme='dark'] .validation-messages.warnings {
    background: #3d2f1f;
    color: #ffcc80;
    border-color: #5d4f2f;
  }

  .validation-messages ul {
    margin: 0.35rem 0 0 0;
    padding-left: 1.25rem;
  }

  .validation-messages li {
    margin: 0.2rem 0;
  }

  /* Navigation - Compact */
  .wizard-navigation {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem;
    flex-shrink: 0;
  }

  .nav-button {
    padding: 0.4rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .nav-button.secondary {
    background: white;
    color: #666;
    border: 1px solid #ddd;
  }

  .wizard-container[data-theme='dark'] .nav-button.secondary {
    background: #1a2332;
    color: #8b9bb3;
    border-color: #2d3748;
  }

  .nav-button.secondary:hover:not(:disabled) {
    background: #f5f5f5;
    border-color: #999;
  }

  .wizard-container[data-theme='dark'] .nav-button.secondary:hover:not(:disabled) {
    background: #2d3748;
  }

  .nav-button.primary {
    background: #1a1a1a;
    color: #f5f5f5;
  }

  .wizard-container[data-theme='dark'] .nav-button.primary {
    background: #e5e7eb;
    color: #1a1a1a;
  }

  .nav-button.primary:hover:not(:disabled) {
    background: #2a2a2a;
  }

  .wizard-container[data-theme='dark'] .nav-button.primary:hover:not(:disabled) {
    background: #f3f4f6;
  }

  .nav-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .nav-button.primary.create {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .page-header {
      padding: 0.5rem 1rem;
    }

    .header-row {
      gap: 0.75rem;
    }

    .back-btn {
      width: 32px;
      height: 32px;
      font-size: 1rem;
    }

    .title-section h1 {
      font-size: 1rem;
    }

    .progress-bar {
      gap: 0.15rem;
      margin-top: 0.5rem;
    }

    .progress-step {
      padding: 0.2rem 0.35rem;
    }

    .step-number {
      width: 24px;
      height: 24px;
      font-size: 0.7rem;
    }

    .step-label {
      font-size: 0.6rem;
    }

    .wizard-content {
      margin: 0.75rem;
      padding: 1rem;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .participants-section {
      grid-template-columns: 1fr;
    }

    .add-row {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .participants-grid-2col {
      grid-template-columns: 1fr;
    }

    .wizard-navigation {
      flex-direction: column-reverse;
      padding: 0 0.75rem 0.75rem;
    }

    .nav-button {
      width: 100%;
    }
  }

  /* Extra small screens */
  @media (max-width: 480px) {
    .page-header {
      padding: 0.4rem 0.75rem;
    }

    .back-btn {
      width: 28px;
      height: 28px;
      font-size: 0.9rem;
    }

    .title-section h1 {
      font-size: 0.9rem;
    }

    .info-badge {
      font-size: 0.65rem;
      padding: 0.15rem 0.4rem;
    }

    .step-number {
      width: 22px;
      height: 22px;
      font-size: 0.65rem;
    }

    .step-label {
      display: none;
    }

    .wizard-content {
      margin: 0.5rem;
      padding: 0.75rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .page-header {
      padding: 0.4rem 0.75rem;
    }

    .progress-bar {
      margin-top: 0.4rem;
    }

    .step-number {
      width: 22px;
      height: 22px;
      font-size: 0.65rem;
    }

    .step-label {
      font-size: 0.55rem;
    }

    .wizard-content {
      margin: 0.5rem;
      padding: 0.75rem;
    }

    .step-container h2 {
      font-size: 0.9rem;
      margin-bottom: 0.6rem;
    }

    .form-group {
      margin-bottom: 0.6rem;
    }

    .input-field {
      padding: 0.4rem 0.6rem;
      font-size: 0.8rem;
    }

    .radio-label {
      padding: 0.4rem 0.6rem;
      font-size: 0.8rem;
    }

    .phase-config {
      padding: 0.6rem;
    }

    .wizard-navigation {
      padding: 0 0.5rem 0.5rem;
    }

    .nav-button {
      padding: 0.35rem 0.75rem;
      font-size: 0.7rem;
    }
  }

  /* Step 5: Time Configuration - Compact */
  .step-time-compact {
    max-width: 600px;
    margin: 0 auto;
  }

  .step-title-compact {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #1e293b;
  }
  .wizard-container[data-theme='dark'] .step-title-compact { color: #f1f5f9; }

  .tc-compact {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1rem;
  }
  .wizard-container[data-theme='dark'] .tc-compact {
    background: #1e293b;
    border-color: #334155;
  }

  .tc-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .tc-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tc-lbl {
    font-size: 0.75rem;
    color: #64748b;
    white-space: nowrap;
  }
  .wizard-container[data-theme='dark'] .tc-lbl { color: #94a3b8; }

  .tc-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .tc-input-wrap input, .tc-round-item input {
    width: 50px;
    padding: 0.3rem 0.4rem;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 0.85rem;
    text-align: center;
    background: #fff;
    color: #1e293b;
  }
  .tc-input-wrap input:focus, .tc-round-item input:focus {
    outline: none;
    border-color: #3b82f6;
  }
  .wizard-container[data-theme='dark'] .tc-input-wrap input,
  .wizard-container[data-theme='dark'] .tc-round-item input {
    background: #0f172a;
    border-color: #475569;
    color: #f1f5f9;
  }

  .tc-suffix, .tc-rds {
    font-size: 0.7rem;
    color: #94a3b8;
  }

  .tc-rounds-row {
    border-top: 1px solid #e2e8f0;
    padding-top: 0.75rem;
  }
  .wizard-container[data-theme='dark'] .tc-rounds-row { border-color: #334155; }

  .tc-rounds-grid {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .tc-round-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .tc-pts {
    font-size: 0.7rem;
    font-weight: 600;
    color: #3b82f6;
    min-width: 20px;
  }

  .tc-toggles-row {
    border-top: 1px solid #e2e8f0;
    padding-top: 0.75rem;
    justify-content: space-between;
  }
  .wizard-container[data-theme='dark'] .tc-toggles-row { border-color: #334155; }

  .tc-toggle-compact {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tc-toggle-lbl {
    font-size: 0.75rem;
    color: #64748b;
  }
  .wizard-container[data-theme='dark'] .tc-toggle-lbl { color: #94a3b8; }

  .tc-switch {
    position: relative;
    width: 36px;
    height: 20px;
    background: #cbd5e1;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .tc-switch.on { background: #3b82f6; }
  .tc-switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  .tc-switch.on .tc-switch-thumb { transform: translateX(16px); }

  .tc-reset-btn {
    margin-left: auto;
    padding: 0.3rem 0.6rem;
    background: transparent;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 0.7rem;
    color: #64748b;
    cursor: pointer;
  }
  .tc-reset-btn:hover { border-color: #94a3b8; color: #475569; }
  .wizard-container[data-theme='dark'] .tc-reset-btn {
    border-color: #475569;
    color: #94a3b8;
  }
  .wizard-container[data-theme='dark'] .tc-reset-btn:hover {
    border-color: #64748b;
    color: #cbd5e1;
  }

  @media (max-width: 600px) {
    .tc-row { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
    .tc-rounds-row { flex-direction: column; align-items: flex-start; }
    .tc-toggles-row { flex-direction: column; align-items: flex-start; }
    .tc-reset-btn { margin-left: 0; margin-top: 0.5rem; }
  }

  /* Step 5: Time Configuration - Modern (legacy) */
  .step-time-config {
    max-width: 800px;
    margin: 0 auto;
  }

  .step-header-modern {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e2e8f0;
  }

  .wizard-container[data-theme='dark'] .step-header-modern {
    border-bottom-color: #334155;
  }

  .step-icon-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border-radius: 12px;
    color: white;
    flex-shrink: 0;
  }

  .step-header-text h2 {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1e293b;
  }

  .wizard-container[data-theme='dark'] .step-header-text h2 {
    color: #f1f5f9;
  }

  .step-header-text p {
    margin: 0;
    font-size: 0.875rem;
    color: #64748b;
  }

  .wizard-container[data-theme='dark'] .step-header-text p {
    color: #94a3b8;
  }

  .time-config-grid-modern {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .tc-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1.25rem;
    display: flex;
    gap: 1rem;
    transition: all 0.2s ease;
  }

  .tc-card:hover {
    border-color: #cbd5e1;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .wizard-container[data-theme='dark'] .tc-card {
    background: #1e293b;
    border-color: #334155;
  }

  .wizard-container[data-theme='dark'] .tc-card:hover {
    border-color: #475569;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .tc-card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: #eff6ff;
    border-radius: 10px;
    color: #3b82f6;
    flex-shrink: 0;
  }

  .tc-card-icon.pause {
    background: #fef3c7;
    color: #d97706;
  }

  .tc-card-icon.points {
    background: #f0fdf4;
    color: #16a34a;
  }

  .tc-card-icon.options {
    background: #faf5ff;
    color: #9333ea;
  }

  .wizard-container[data-theme='dark'] .tc-card-icon {
    background: rgba(59, 130, 246, 0.15);
  }

  .wizard-container[data-theme='dark'] .tc-card-icon.pause {
    background: rgba(217, 119, 6, 0.15);
  }

  .wizard-container[data-theme='dark'] .tc-card-icon.points {
    background: rgba(22, 163, 74, 0.15);
  }

  .wizard-container[data-theme='dark'] .tc-card-icon.options {
    background: rgba(147, 51, 234, 0.15);
  }

  .tc-card-content {
    flex: 1;
    min-width: 0;
  }

  .tc-card-content h3 {
    margin: 0 0 0.25rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #1e293b;
  }

  .wizard-container[data-theme='dark'] .tc-card-content h3 {
    color: #f1f5f9;
  }

  .tc-card-desc {
    margin: 0 0 0.75rem 0;
    font-size: 0.75rem;
    color: #64748b;
    line-height: 1.3;
  }

  .wizard-container[data-theme='dark'] .tc-card-desc {
    color: #94a3b8;
  }

  .tc-fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tc-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .tc-field-label {
    font-size: 0.8rem;
    color: #475569;
    font-weight: 500;
  }

  .wizard-container[data-theme='dark'] .tc-field-label {
    color: #cbd5e1;
  }

  .tc-field-input {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .tc-field-input input {
    width: 56px;
    padding: 0.4rem 0.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.85rem;
    text-align: center;
    background: #f8fafc;
    color: #1e293b;
    transition: all 0.15s;
  }

  .wizard-container[data-theme='dark'] .tc-field-input input {
    background: #0f172a;
    border-color: #334155;
    color: #f1f5f9;
  }

  .tc-field-input input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .tc-unit {
    font-size: 0.7rem;
    color: #94a3b8;
    font-weight: 500;
    min-width: 20px;
  }

  /* Points Grid */
  .tc-points-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .tc-point-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.5rem;
    background: #f8fafc;
    border-radius: 6px;
  }

  .wizard-container[data-theme='dark'] .tc-point-item {
    background: #0f172a;
  }

  .tc-point-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    background: #16a34a;
    color: white;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 4px;
  }

  .tc-point-item input {
    width: 40px;
    padding: 0.3rem;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 0.8rem;
    text-align: center;
    background: white;
    color: #1e293b;
  }

  .wizard-container[data-theme='dark'] .tc-point-item input {
    background: #1e293b;
    border-color: #334155;
    color: #f1f5f9;
  }

  .tc-point-item input:focus {
    outline: none;
    border-color: #16a34a;
  }

  .tc-point-suffix {
    font-size: 0.65rem;
    color: #94a3b8;
  }

  /* Toggle */
  .tc-toggle-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .tc-toggle-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .tc-toggle-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: #334155;
  }

  .wizard-container[data-theme='dark'] .tc-toggle-label {
    color: #e2e8f0;
  }

  .tc-toggle-desc {
    font-size: 0.7rem;
    color: #94a3b8;
  }

  .tc-toggle-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tc-toggle-status {
    font-size: 0.75rem;
    font-weight: 500;
    color: #94a3b8;
    min-width: 20px;
    transition: color 0.2s;
  }

  .tc-toggle-status.active {
    color: #3b82f6;
  }

  .tc-toggle {
    position: relative;
    width: 44px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    flex-shrink: 0;
  }

  .tc-toggle-track {
    display: block;
    width: 100%;
    height: 100%;
    background: #cbd5e1;
    border-radius: 12px;
    transition: all 0.2s ease;
  }

  .wizard-container[data-theme='dark'] .tc-toggle-track {
    background: #475569;
  }

  .tc-toggle.active .tc-toggle-track {
    background: #3b82f6;
  }

  .tc-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
  }

  .tc-toggle.active .tc-toggle-thumb {
    left: 22px;
  }

  /* Actions */
  .tc-actions {
    display: flex;
    justify-content: center;
    margin-top: 1.25rem;
  }

  .tc-btn-reset {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.25rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: white;
    color: #64748b;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .wizard-container[data-theme='dark'] .tc-btn-reset {
    background: #1e293b;
    border-color: #334155;
    color: #94a3b8;
  }

  .tc-btn-reset:hover {
    background: #f8fafc;
    border-color: #94a3b8;
    color: #475569;
  }

  .wizard-container[data-theme='dark'] .tc-btn-reset:hover {
    background: #334155;
    color: #e2e8f0;
  }

  /* Responsive */
  @media (max-width: 700px) {
    .time-config-grid-modern {
      grid-template-columns: 1fr;
    }

    .tc-card {
      padding: 1rem;
    }

    .tc-points-grid {
      grid-template-columns: repeat(4, 1fr);
    }

    .tc-point-item {
      flex-direction: column;
      padding: 0.5rem 0.25rem;
      gap: 0.25rem;
    }

    .tc-point-item input {
      width: 100%;
    }

    .tc-point-suffix {
      display: none;
    }
  }

  @media (max-width: 400px) {
    .step-header-modern {
      flex-direction: column;
      text-align: center;
    }

    .tc-points-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .tc-toggle-field {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
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

  .loading-overlay[data-theme='dark'] .spinner {
    border-color: #374151;
    border-top-color: #10b981;
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
</style>
