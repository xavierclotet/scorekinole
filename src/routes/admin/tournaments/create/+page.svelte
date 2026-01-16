<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { goto } from '$app/navigation';
  import { createTournament, searchUsers, getTournament, updateTournament, searchTournamentNames, type TournamentNameInfo } from '$lib/firebase/tournaments';
  import { addParticipants } from '$lib/firebase/tournamentParticipants';
  import type { TournamentParticipant, EloConfig, FinalStageMode } from '$lib/types/tournament';
  import type { UserProfile } from '$lib/firebase/userProfile';
  import { DEVELOPED_COUNTRIES } from '$lib/constants';

  // Edit mode
  let editMode = false;
  let editTournamentId: string | null = null;

  // Wizard state
  let currentStep = 1;
  const totalSteps = 5;

  // Toast state
  let showToast = false;
  let toastMessage = '';

  // Step 1: Basic Info
  let key = '';
  let name = '';
  let description = '';
  let edition: number = 1;
  let country = 'España';
  let city = '';
  let tournamentDate = new Date().toISOString().split('T')[0];  // Date input string (YYYY-MM-DD), defaults to today
  let gameType: 'singles' | 'doubles' = 'singles';
  let show20s = true;
  let showHammer = true;

  // Step 2: Tournament Format
  let numTables = 4;
  let phaseType: 'ONE_PHASE' | 'TWO_PHASE' = 'TWO_PHASE';
  let groupStageType: 'ROUND_ROBIN' | 'SWISS' = 'ROUND_ROBIN';
  let numGroups = 1;
  let numSwissRounds = 5;
  let rankingSystem: 'WINS' | 'POINTS' = 'WINS';  // WINS = 2/1/0 (RR) or 1/0.5/0 (Swiss), POINTS = total points scored

  // Group stage game config
  let groupGameMode: 'points' | 'rounds' = 'rounds';
  let groupPointsToWin = 7;
  let groupRoundsToPlay = 4;
  let groupMatchesToWin = 1;

  // Final stage game config (only for TWO_PHASE)
  let finalStageMode: 'SINGLE_BRACKET' | 'SPLIT_DIVISIONS' = 'SINGLE_BRACKET';
  // Gold bracket config (or single bracket if SINGLE_BRACKET mode)
  let finalGameMode: 'points' | 'rounds' = 'points';
  let finalPointsToWin = 7;
  let finalRoundsToPlay = 4;
  let finalMatchesToWin = 1;
  // Silver bracket config (only for SPLIT_DIVISIONS mode) - default: 4 rounds, best of 1
  let silverGameMode: 'points' | 'rounds' = 'rounds';
  let silverPointsToWin = 7;
  let silverRoundsToPlay = 4;
  let silverMatchesToWin = 1;

  // Backward compatibility: for ONE_PHASE tournaments
  let gameMode: 'points' | 'rounds' = 'points';
  let pointsToWin = 7;
  let roundsToPlay = 4;
  let matchesToWin = 3;

  // Step 3: ELO Configuration
  let eloEnabled = true;
  let initialElo = 1500;
  let kFactor = 2;
  let maxDelta = 25;

  // Step 4: Participants
  let participants: Partial<TournamentParticipant>[] = [];
  let searchQuery = '';
  let searchResults: UserProfile[] = [];
  let searchLoading = false;
  let guestName = 'Player1';  // Input for guest player name
  let guestNameMatchedUser: UserProfile | null = null;  // User that matches guest name

  // Tournament name search
  let tournamentNameResults: TournamentNameInfo[] = [];
  let nameSearchLoading = false;
  let showNameDropdown = false;

  // Validation
  let validationErrors: string[] = [];
  let validationWarnings: string[] = [];

  // Loading state
  let creating = false;

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
    // Check if in edit mode
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');

    if (editId) {
      editMode = true;
      editTournamentId = editId;
      await loadTournamentForEdit(editId);
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
        toastMessage = '❌ Error: Torneo no encontrado';
        showToast = true;
        setTimeout(() => goto('/admin/tournaments'), 2000);
        return;
      }

      if (tournament.status !== 'DRAFT') {
        toastMessage = '❌ Solo se pueden editar torneos en estado DRAFT';
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
      tournamentDate = tournament.tournamentDate ? new Date(tournament.tournamentDate).toISOString().split('T')[0] : '';
      gameType = tournament.gameType;

      // Step 2
      numTables = tournament.numTables;
      phaseType = tournament.phaseType;
      show20s = tournament.show20s;
      showHammer = tournament.showHammer;

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
          rankingSystem = tournament.groupStage.rankingSystem || tournament.groupStage.swissRankingSystem || 'WINS';
        } else {
          // Legacy fallback: read from tournament root level
          groupStageType = tournament.groupStageType || 'ROUND_ROBIN';
          groupGameMode = tournament.gameMode || 'rounds';
          groupPointsToWin = tournament.pointsToWin || 7;
          groupRoundsToPlay = tournament.roundsToPlay || 4;
          groupMatchesToWin = tournament.matchesToWin || 1;
          numGroups = tournament.numGroups || 2;
          numSwissRounds = tournament.numSwissRounds || 4;
        }

        // Final stage config from finalStageConfig or finalStage
        if (tournament.finalStageConfig) {
          finalStageMode = tournament.finalStageConfig.mode || 'SINGLE_BRACKET';
          finalGameMode = tournament.finalStageConfig.gameMode || 'points';
          finalPointsToWin = tournament.finalStageConfig.pointsToWin || 7;
          finalRoundsToPlay = tournament.finalStageConfig.roundsToPlay || 4;
          finalMatchesToWin = tournament.finalStageConfig.matchesToWin || 1;
          // Silver bracket config
          silverGameMode = tournament.finalStageConfig.silverGameMode || 'points';
          silverPointsToWin = tournament.finalStageConfig.silverPointsToWin || 7;
          silverRoundsToPlay = tournament.finalStageConfig.silverRoundsToPlay || 4;
          silverMatchesToWin = tournament.finalStageConfig.silverMatchesToWin || 1;
        } else if (tournament.finalStage) {
          finalStageMode = tournament.finalStage.mode || 'SINGLE_BRACKET';
          finalGameMode = tournament.finalStage.gameMode || 'points';
          finalPointsToWin = tournament.finalStage.pointsToWin || 7;
          finalRoundsToPlay = tournament.finalStage.roundsToPlay || 4;
          finalMatchesToWin = tournament.finalStage.matchesToWin || 1;
          // Silver bracket config
          silverGameMode = tournament.finalStage.silverGameMode || 'points';
          silverPointsToWin = tournament.finalStage.silverPointsToWin || 7;
          silverRoundsToPlay = tournament.finalStage.silverRoundsToPlay || 4;
          silverMatchesToWin = tournament.finalStage.silverMatchesToWin || 1;
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
        // ONE_PHASE: load from finalStage
        if (tournament.finalStage) {
          gameMode = tournament.finalStage.gameMode || 'points';
          pointsToWin = tournament.finalStage.pointsToWin || 7;
          roundsToPlay = tournament.finalStage.roundsToPlay || 4;
          matchesToWin = tournament.finalStage.matchesToWin || 3;
        } else {
          // Legacy fallback
          gameMode = tournament.gameMode || 'points';
          pointsToWin = tournament.pointsToWin || 7;
          roundsToPlay = tournament.roundsToPlay || 4;
          matchesToWin = tournament.matchesToWin || 3;
        }
      }

      // Step 3
      eloEnabled = tournament.eloConfig.enabled;
      initialElo = tournament.eloConfig.initialElo;
      kFactor = tournament.eloConfig.kFactor;
      maxDelta = tournament.eloConfig.maxDelta;

      // Step 4 - Load participants
      participants = tournament.participants.map(p => ({
        type: p.type,
        userId: p.userId,
        name: p.name,
        email: p.email,
        partner: p.partner
      }));

      guestName = `Player${participants.length + 1}`;

      console.log('✅ Tournament loaded for editing');
    } catch (error) {
      console.error('❌ Error loading tournament for edit:', error);
      toastMessage = '❌ Error al cargar el torneo';
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
      rankingSystem = data.rankingSystem || data.swissRankingSystem || 'WINS';
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
      eloEnabled = data.eloEnabled ?? true;
      initialElo = data.initialElo || 1500;
      kFactor = data.kFactor || 2.0;
      maxDelta = data.maxDelta || 25;

      // Step 4
      participants = data.participants || [];

      // Update guest name to next player number
      guestName = `Player${participants.length + 1}`;

      console.log('✅ Tournament draft loaded from localStorage');
    } catch (error) {
      console.error('❌ Error loading tournament draft:', error);
    }
  }

  function saveDraft() {
    // Don't save draft in edit mode
    if (editMode) return;
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
        rankingSystem,
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
        eloEnabled,
        initialElo,
        kFactor,
        maxDelta,
        participants
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
    const results = await searchUsers(searchQuery);
    // Filter out users already added as participants
    const addedUserIds = participants
      .filter(p => p.type === 'REGISTERED' && p.userId)
      .map(p => p.userId);
    searchResults = results.filter(u => !addedUserIds.includes(u.userId));
    searchLoading = false;
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

  // Calculate suggested ELO parameters based on number of participants
  function updateEloSuggestions() {
    const numParticipants = participants.length;
    if (numParticipants >= 4) {
      // maxDelta = maximum possible ELO change = (numParticipants - 1) * kFactor
      maxDelta = (numParticipants - 1) * kFactor;
    }
  }

  function addRegisteredUser(user: UserProfile & { userId?: string }) {
    const alreadyAdded = participants.some(p => p.userId === user.userId);
    if (alreadyAdded) {
      toastMessage = 'Este usuario ya está agregado';
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
        eloSnapshot: user.elo || 1500
      }
    ];

    searchQuery = '';
    searchResults = [];
    updateEloSuggestions();
    saveDraft(); // Save after adding participant
  }

  async function checkGuestNameMatch() {
    if (!guestName || guestName.trim().length < 3) {
      guestNameMatchedUser = null;
      return;
    }

    // Search for exact name match (case-insensitive)
    const results = await searchUsers(guestName.trim());
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
      toastMessage = `⚠️ Existe un usuario registrado con el nombre "${guestName}". Añádelo desde la lista de usuarios.`;
      showToast = true;
      return;
    }

    participants = [
      ...participants,
      {
        type: 'GUEST',
        name: guestName.trim()
      }
    ];

    // Set next player number based on total participants
    guestName = `Player${participants.length + 1}`;
    guestNameMatchedUser = null;
    updateEloSuggestions();
    saveDraft(); // Save after adding guest
  }

  function removeParticipant(index: number) {
    participants = participants.filter((_, i) => i !== index);
    updateEloSuggestions();
    saveDraft(); // Save after removing participant
  }

  function getStep1Errors(): string[] {
    const errors: string[] = [];
    if (!name.trim()) {
      errors.push('El nombre del torneo es obligatorio');
    }
    if (!/^[A-Z0-9]{6}$/.test(key)) {
      errors.push('La clave debe ser exactamente 6 caracteres alfanuméricos (A-Z, 0-9)');
    }
    if (!edition || edition < 1 || edition > 1000) {
      errors.push('La edición debe ser un número entre 1 y 1000');
    }
    if (!country) {
      errors.push('El país es obligatorio');
    }
    if (!city.trim()) {
      errors.push('La ciudad es obligatoria');
    }
    return errors;
  }

  function getStep2Errors(): string[] {
    const errors: string[] = [];
    if (numTables < 1) {
      errors.push('Debe haber al menos 1 mesa');
    }
    if (phaseType === 'TWO_PHASE' && groupStageType === 'ROUND_ROBIN' && numGroups < 1) {
      errors.push('Debe haber al menos 1 grupo');
    }
    if (phaseType === 'TWO_PHASE' && groupStageType === 'SWISS' && numSwissRounds < 3) {
      errors.push('El sistema suizo requiere al menos 3 rondas');
    }
    return errors;
  }

  function getStep3Errors(): string[] {
    const errors: string[] = [];
    if (eloEnabled) {
      if (initialElo < 100 || initialElo > 3000) {
        errors.push('ELO inicial debe estar entre 100 y 3000');
      }
      if (kFactor <= 0 || kFactor > 10) {
        errors.push('K-Factor debe estar entre 0 y 10');
      }
      if (maxDelta <= 0 || maxDelta > 200) {
        errors.push('Delta máximo debe estar entre 0 y 200');
      }
    }
    return errors;
  }

  function getStep4Errors(): string[] {
    const errors: string[] = [];
    if (participants.length < 4) {
      errors.push('Se requieren al menos 4 participantes');
    }
    return errors;
  }

  function getStep4Warnings(): string[] {
    const warnings: string[] = [];
    if (gameType === 'doubles') {
      if (participants.length % 2 !== 0) {
        warnings.push('Para doubles, se recomienda un número par de participantes');
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

    creating = true;

    try {
      const eloConfig: EloConfig = {
        enabled: eloEnabled,
        initialElo,
        kFactor,
        maxDelta
      };

      // Build tournament data with phase-specific configuration
      const tournamentData: any = {
        key: key.toUpperCase().trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        edition: edition,
        country: country,
        city: city.trim(),
        tournamentDate: tournamentDate ? new Date(tournamentDate).getTime() : undefined,
        gameType,
        show20s,
        showHammer,
        numTables,
        phaseType,
        eloConfig
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
          rankingSystem: rankingSystem
        };

        // Final stage configuration will be set when transitioning (in generateBracket)
        // We store it in finalStageConfig for now
        tournamentData.finalStageConfig = {
          mode: finalStageMode,
          // Gold bracket config (or single bracket if SINGLE_BRACKET mode)
          gameMode: finalGameMode,
          pointsToWin: finalGameMode === 'points' ? finalPointsToWin : undefined,
          roundsToPlay: finalGameMode === 'rounds' ? finalRoundsToPlay : undefined,
          matchesToWin: finalMatchesToWin,
          // Silver bracket config (only for SPLIT_DIVISIONS mode)
          silverGameMode: finalStageMode === 'SPLIT_DIVISIONS' ? silverGameMode : undefined,
          silverPointsToWin: finalStageMode === 'SPLIT_DIVISIONS' && silverGameMode === 'points' ? silverPointsToWin : undefined,
          silverRoundsToPlay: finalStageMode === 'SPLIT_DIVISIONS' && silverGameMode === 'rounds' ? silverRoundsToPlay : undefined,
          silverMatchesToWin: finalStageMode === 'SPLIT_DIVISIONS' ? silverMatchesToWin : undefined
        };
      } else {
        // ONE_PHASE: final stage configuration (for bracket directly)
        tournamentData.finalStage = {
          type: 'SINGLE_ELIMINATION',
          mode: 'SINGLE_BRACKET',
          bracket: {
            rounds: [],
            totalRounds: 0
          },
          isComplete: false,
          gameMode: gameMode,
          pointsToWin: gameMode === 'points' ? pointsToWin : undefined,
          roundsToPlay: gameMode === 'rounds' ? roundsToPlay : undefined,
          matchesToWin: matchesToWin
        };
      }

      // Only include participants in CREATE mode, not in UPDATE mode
      if (!editMode) {
        tournamentData.participants = participants;
      }

      // Clean undefined values before sending to Firebase
      const cleanedData = cleanObject(tournamentData);

      if (editMode && editTournamentId) {
        // UPDATE MODE
        const success = await updateTournament(editTournamentId, cleanedData);

        if (!success) {
          creating = false;
          toastMessage = '❌ Error al actualizar el torneo';
          showToast = true;
          return;
        }

        toastMessage = '✅ Torneo actualizado exitosamente';
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
          toastMessage = '❌ Error al crear el torneo';
          showToast = true;
          return;
        }

        // Add all participants in a single Firebase call
        const participantsAdded = await addParticipants(tournamentId, participants);

        if (!participantsAdded) {
          creating = false;
          toastMessage = '⚠️ Torneo creado pero hubo errores al agregar los participantes';
          showToast = true;
          setTimeout(() => {
            goto(`/admin/tournaments/${tournamentId}`);
          }, 1500);
          return;
        }

        // Clear draft after successful creation
        clearDraft();

        // Show success toast
        toastMessage = '✅ Torneo creado exitosamente';
        showToast = true;

        // Redirect to tournament page
        setTimeout(() => {
          goto(`/admin/tournaments/${tournamentId}`);
        }, 500);
      }
    } catch (error) {
      console.error('Error creating/updating tournament:', error);
      creating = false;
      toastMessage = `❌ Error al ${editMode ? 'actualizar' : 'crear'} el torneo. Por favor, inténtalo de nuevo.`;
      showToast = true;
    }
  }

  $: searchQuery, handleSearch();

  // Calculate max players based on tables and game type
  $: playersPerTable = gameType === 'singles' ? 2 : 4;
  $: maxPlayersForTables = numTables * playersPerTable;

  // Calculate tables needed for current participants
  $: tablesNeeded = Math.ceil(participants.length / playersPerTable);
  $: extraTables = numTables - tablesNeeded;

  // Reactive validation - re-run when any relevant field changes
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  $: key, name, edition, country, city, gameType, gameMode, pointsToWin, roundsToPlay, matchesToWin,
     groupGameMode, groupPointsToWin, groupRoundsToPlay, groupMatchesToWin,
     finalPointsToWin, finalMatchesToWin, phaseType, numTables, numGroups,
     numSwissRounds, participants.length, currentStep,
     [validationErrors, validationWarnings] = getValidationForStep(currentStep);
</script>

<AdminGuard>
  <div class="wizard-container" data-theme={$adminTheme}>
    <header class="wizard-header">
      <div class="header-top">
        <button class="back-button" on:click={() => goto(editMode && editTournamentId ? `/admin/tournaments/${editTournamentId}` : '/admin/tournaments')}>
          ← Volver a Torneos
        </button>
        <div class="theme-toggle-wrapper">
          <ThemeToggle />
        </div>
      </div>

      <div class="title-section">
        <h1>{editMode ? '✏️ Editar Torneo' : '🏆 Crear Nuevo Torneo'}</h1>
        <p class="subtitle">Configura tu torneo en {totalSteps} sencillos pasos</p>
      </div>

      <!-- Progress bar -->
      <div class="progress-bar">
        {#each Array(totalSteps) as _, i}
          <button
            type="button"
            class="progress-step"
            class:active={i + 1 <= currentStep}
            class:current={i + 1 === currentStep}
            disabled={!editMode}
            on:click={() => goToStep(i + 1)}
          >
            <div class="step-number">{i + 1}</div>
            <div class="step-label">
              {#if i === 0}Info Básica
              {:else if i === 1}Formato
              {:else if i === 2}ELO
              {:else if i === 3}Participantes
              {:else}Revisión
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </header>

    <div class="wizard-content">
      <!-- Step 1: Basic Info -->
      {#if currentStep === 1}
        <div class="step-container">
          <h2>📝 Información Básica</h2>

          <div class="form-group">
            <label for="key">Clave del Torneo *</label>
            <input
              id="key"
              type="text"
              bind:value={key}
              placeholder="ABC123"
              class="input-field"
              maxlength="6"
              on:input={(e) => key = e.target.value.replace(/[^A-Z0-9]/g, '').toUpperCase().substring(0, 6)}
            />
            <small class="help-text">6 caracteres alfanuméricos (A-Z, 0-9). Esta clave permitirá a los jugadores actualizar el marcador en tiempo real durante el torneo.</small>
          </div>

          <div class="form-row name-edition-row">
            <div class="form-group edition-group">
              <label for="edition">Edición *</label>
              <input
                id="edition"
                type="number"
                bind:value={edition}
                placeholder="Nº"
                class="input-field"
                min="1"
                max="1000"
              />
            </div>

            <div class="form-group name-search-group">
              <label for="name">Nombre del Torneo *</label>
              <div class="name-search-wrapper">
                <input
                  id="name"
                  type="text"
                  bind:value={name}
                  placeholder="Ej: Open de Catalunya"
                  class="input-field"
                  on:input={handleNameSearch}
                  on:blur={handleNameInputBlur}
                  on:focus={handleNameInputFocus}
                  autocomplete="off"
                />
                {#if nameSearchLoading}
                  <span class="name-search-loading">🔄</span>
                {/if}
                {#if showNameDropdown && tournamentNameResults.length > 0}
                  <div class="name-dropdown">
                    {#each tournamentNameResults as info}
                      <button
                        type="button"
                        class="name-dropdown-item"
                        on:click={() => selectTournamentName(info)}
                      >
                        <span class="name-dropdown-name">{info.name}</span>
                        <span class="name-dropdown-edition">Ed. {info.maxEdition} → {info.maxEdition + 1}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
              <small class="help-text">Escribe para buscar nombres existentes o crea uno nuevo</small>
            </div>
          </div>

          <div class="form-group">
            <label for="description">Descripción (opcional)</label>
            <textarea
              id="description"
              bind:value={description}
              placeholder="Describe el torneo..."
              rows="3"
              class="input-field"
            ></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="country">País *</label>
              <select
                id="country"
                bind:value={country}
                class="input-field"
              >
                <option value="">Seleccionar país...</option>
                {#each DEVELOPED_COUNTRIES as countryOption}
                  <option value={countryOption}>{countryOption}</option>
                {/each}
              </select>
            </div>

            <div class="form-group">
              <label for="city">Ciudad *</label>
              <input
                id="city"
                type="text"
                bind:value={city}
                placeholder="Ej: Barcelona"
                class="input-field"
                maxlength="50"
              />
              <small class="help-text">Máximo 50 caracteres</small>
            </div>
          </div>

          <div class="form-group">
            <label for="tournamentDate">Fecha del Torneo (opcional)</label>
            <input
              id="tournamentDate"
              type="date"
              bind:value={tournamentDate}
              class="input-field"
            />
            <small class="help-text">Selecciona la fecha en que se jugará el torneo</small>
          </div>

          <div class="form-group">
            <label>Tipo de Juego</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" bind:group={gameType} value="singles" />
                <span>Singles (1v1)</span>
              </label>
              <label class="radio-label">
                <input type="radio" bind:group={gameType} value="doubles" />
                <span>Doubles (2v2)</span>
              </label>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 2: Tournament Format -->
      {#if currentStep === 2}
        <div class="step-container">
          <h2>🎯 Formato del Torneo</h2>

          <div class="form-group">
            <label for="numTables">Número de Mesas Disponibles</label>
            <input
              id="numTables"
              type="number"
              bind:value={numTables}
              min="1"
              max="100"
              class="input-field"
            />
            <small class="help-text">
              Mesas físicas disponibles para jugar simultáneamente.
              <strong>Máximo {maxPlayersForTables} jugadores</strong> ({gameType === 'singles' ? '2 por mesa' : '4 por mesa en dobles'})
            </small>
          </div>

          <div class="form-group">
            <label>Tipo de Fase</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" bind:group={phaseType} value="ONE_PHASE" />
                <span>1 Fase (Solo Eliminatoria Directa)</span>
              </label>
              <label class="radio-label">
                <input type="radio" bind:group={phaseType} value="TWO_PHASE" />
                <span>2 Fases (Grupos + Final)</span>
              </label>
            </div>
          </div>

          {#if phaseType === 'TWO_PHASE'}
            <!-- FASE 1: GRUPOS -->
            <div class="phase-section">
              <div class="phase-header groups">
                <span class="phase-icon">👥</span>
                <div class="phase-title">
                  <h3>Fase 1: Grupos</h3>
                  <small>Configuración de la fase clasificatoria</small>
                </div>
              </div>

              <div class="phase-content">
                <div class="form-group">
                  <label>Sistema de Grupos</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" bind:group={groupStageType} value="ROUND_ROBIN" />
                      <span>Round Robin</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" bind:group={groupStageType} value="SWISS" />
                      <span>Sistema Suizo</span>
                    </label>
                  </div>
                  <small class="help-text">
                    {groupStageType === 'ROUND_ROBIN'
                      ? 'Todos contra todos dentro de cada grupo'
                      : 'Emparejamiento dinámico por puntuación'}
                  </small>
                </div>

                {#if groupStageType === 'ROUND_ROBIN'}
                  <div class="form-group">
                    <label for="numGroups">Número de Grupos</label>
                    <input
                      id="numGroups"
                      type="number"
                      bind:value={numGroups}
                      min="1"
                      max="8"
                      class="input-field"
                    />
                    <small class="help-text">Los participantes se dividirán equitativamente</small>
                  </div>
                {:else}
                  <div class="form-group">
                    <label for="numSwissRounds">Número de Rondas</label>
                    <input
                      id="numSwissRounds"
                      type="number"
                      bind:value={numSwissRounds}
                      min="3"
                      max="10"
                      class="input-field"
                    />
                    <small class="help-text">Mínimo 3 rondas recomendado</small>
                  </div>
                {/if}

                <!-- Sistema de clasificación (aplica a ambos tipos) -->
                <div class="form-group">
                  <label>Sistema de Clasificación</label>
                  <div class="radio-group vertical">
                    <label class="radio-label">
                      <input type="radio" bind:group={rankingSystem} value="WINS" />
                      <span>Por Victorias</span>
                      <small class="radio-description">
                        {groupStageType === 'ROUND_ROBIN'
                          ? '2 puntos victoria, 1 empate, 0 derrota'
                          : '1 punto victoria, 0.5 empate, 0 derrota'}
                      </small>
                    </label>
                    <label class="radio-label">
                      <input type="radio" bind:group={rankingSystem} value="POINTS" />
                      <span>Por Puntos Totales</span>
                      <small class="radio-description">Suma de todos los puntos de cada ronda anotados</small>
                    </label>
                  </div>
                </div>

                <!-- Subsección: Configuración de partidos de grupos -->
                <div class="match-config-box">
                  <h4>⚙️ Configuración de Partidos</h4>

                  <div class="form-group">
                    <label>Modo de Juego</label>
                    <div class="radio-group">
                      <label class="radio-label">
                        <input type="radio" bind:group={groupGameMode} value="points" />
                        <span>Por Puntos</span>
                      </label>
                      <label class="radio-label">
                        <input type="radio" bind:group={groupGameMode} value="rounds" />
                        <span>Por Rondas</span>
                      </label>
                    </div>
                  </div>

                  {#if groupGameMode === 'points'}
                    <div class="form-row">
                      <div class="form-group">
                        <label for="groupPointsToWin">Puntos para Ganar</label>
                        <input
                          id="groupPointsToWin"
                          type="number"
                          bind:value={groupPointsToWin}
                          min="1"
                          max="50"
                          class="input-field"
                        />
                      </div>
                      <div class="form-group">
                        <label for="groupMatchesToWin">Best of</label>
                        <select id="groupMatchesToWin" bind:value={groupMatchesToWin} class="input-field">
                          <option value={1}>1 partido</option>
                          <option value={3}>3 partidos</option>
                          <option value={5}>5 partidos</option>
                          <option value={7}>7 partidos</option>
                        </select>
                      </div>
                    </div>
                  {:else}
                    <div class="form-row">
                      <div class="form-group">
                        <label for="groupRoundsToPlay">Rondas por Partido</label>
                        <input
                          id="groupRoundsToPlay"
                          type="number"
                          bind:value={groupRoundsToPlay}
                          min="1"
                          max="20"
                          class="input-field"
                        />
                      </div>
                      <div class="form-group">
                        <label for="groupMatchesToWinRounds">Best of</label>
                        <select id="groupMatchesToWinRounds" bind:value={groupMatchesToWin} class="input-field">
                          <option value={1}>1 partido</option>
                          <option value={3}>3 partidos</option>
                          <option value={5}>5 partidos</option>
                          <option value={7}>7 partidos</option>
                        </select>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            </div>

            <!-- FASE 2: ELIMINACIÓN -->
            <div class="phase-section">
              <div class="phase-header finals">
                <span class="phase-icon">🏆</span>
                <div class="phase-title">
                  <h3>Fase 2: Eliminación</h3>
                  <small>Configuración de la fase final</small>
                </div>
              </div>

              <div class="phase-content">
                <div class="form-group">
                  <label>Estructura de Brackets</label>
                  <div class="radio-group vertical">
                    <label class="radio-label">
                      <input type="radio" bind:group={finalStageMode} value="SINGLE_BRACKET" />
                      <span>Bracket Único</span>
                      <small class="radio-description">Todos los clasificados en un mismo bracket</small>
                    </label>
                    <label class="radio-label">
                      <input type="radio" bind:group={finalStageMode} value="SPLIT_DIVISIONS" />
                      <span>Divisiones Oro / Plata</span>
                      <small class="radio-description">Dos brackets separados según clasificación</small>
                    </label>
                  </div>
                </div>

                <!-- Configuración de brackets -->
                <div class="brackets-container" class:split={finalStageMode === 'SPLIT_DIVISIONS'}>
                  <!-- Gold Bracket (o único) -->
                  <div class="match-config-box" class:gold={finalStageMode === 'SPLIT_DIVISIONS'}>
                    <h4>{finalStageMode === 'SPLIT_DIVISIONS' ? '🥇 Bracket Oro' : '⚙️ Configuración de Partidos'}</h4>

                    <div class="form-group">
                      <label>Modo de Juego</label>
                      <div class="radio-group">
                        <label class="radio-label">
                          <input type="radio" bind:group={finalGameMode} value="points" />
                          <span>Por Puntos</span>
                        </label>
                        <label class="radio-label">
                          <input type="radio" bind:group={finalGameMode} value="rounds" />
                          <span>Por Rondas</span>
                        </label>
                      </div>
                    </div>

                    {#if finalGameMode === 'points'}
                      <div class="form-row">
                        <div class="form-group">
                          <label for="finalPointsToWin">Puntos para Ganar</label>
                          <input
                            id="finalPointsToWin"
                            type="number"
                            bind:value={finalPointsToWin}
                            min="1"
                            max="50"
                            class="input-field"
                          />
                        </div>
                        <div class="form-group">
                          <label for="finalMatchesToWin">Best of</label>
                          <select id="finalMatchesToWin" bind:value={finalMatchesToWin} class="input-field">
                            <option value={1}>1 partido</option>
                            <option value={3}>3 partidos</option>
                            <option value={5}>5 partidos</option>
                            <option value={7}>7 partidos</option>
                          </select>
                        </div>
                      </div>
                    {:else}
                      <div class="form-row">
                        <div class="form-group">
                          <label for="finalRoundsToPlay">Rondas por Partido</label>
                          <input
                            id="finalRoundsToPlay"
                            type="number"
                            bind:value={finalRoundsToPlay}
                            min="1"
                            max="20"
                            class="input-field"
                          />
                        </div>
                        <div class="form-group">
                          <label for="finalMatchesToWinRounds">Best of</label>
                          <select id="finalMatchesToWinRounds" bind:value={finalMatchesToWin} class="input-field">
                            <option value={1}>1 partido</option>
                            <option value={3}>3 partidos</option>
                            <option value={5}>5 partidos</option>
                            <option value={7}>7 partidos</option>
                          </select>
                        </div>
                      </div>
                    {/if}
                  </div>

                  <!-- Silver Bracket (solo si hay divisiones) -->
                  {#if finalStageMode === 'SPLIT_DIVISIONS'}
                    <div class="match-config-box silver">
                      <h4>🥈 Bracket Plata</h4>

                      <div class="form-group">
                        <label>Modo de Juego</label>
                        <div class="radio-group">
                          <label class="radio-label">
                            <input type="radio" bind:group={silverGameMode} value="points" />
                            <span>Por Puntos</span>
                          </label>
                          <label class="radio-label">
                            <input type="radio" bind:group={silverGameMode} value="rounds" />
                            <span>Por Rondas</span>
                          </label>
                        </div>
                      </div>

                      {#if silverGameMode === 'points'}
                        <div class="form-row">
                          <div class="form-group">
                            <label for="silverPointsToWin">Puntos para Ganar</label>
                            <input
                              id="silverPointsToWin"
                              type="number"
                              bind:value={silverPointsToWin}
                              min="1"
                              max="50"
                              class="input-field"
                            />
                          </div>
                          <div class="form-group">
                            <label for="silverMatchesToWin">Best of</label>
                            <select id="silverMatchesToWin" bind:value={silverMatchesToWin} class="input-field">
                              <option value={1}>1 partido</option>
                              <option value={3}>3 partidos</option>
                              <option value={5}>5 partidos</option>
                              <option value={7}>7 partidos</option>
                            </select>
                          </div>
                        </div>
                      {:else}
                        <div class="form-row">
                          <div class="form-group">
                            <label for="silverRoundsToPlay">Rondas por Partido</label>
                            <input
                              id="silverRoundsToPlay"
                              type="number"
                              bind:value={silverRoundsToPlay}
                              min="1"
                              max="20"
                              class="input-field"
                            />
                          </div>
                          <div class="form-group">
                            <label for="silverMatchesToWinRounds">Best of</label>
                            <select id="silverMatchesToWinRounds" bind:value={silverMatchesToWin} class="input-field">
                              <option value={1}>1 partido</option>
                              <option value={3}>3 partidos</option>
                              <option value={5}>5 partidos</option>
                              <option value={7}>7 partidos</option>
                            </select>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <!-- ONE_PHASE: Single configuration for bracket -->
            <div class="phase-config">
              <h3>⚙️ Configuración de Partidos</h3>

              <div class="form-group">
                <label>Modo de Juego</label>
                <div class="radio-group">
                  <label class="radio-label">
                    <input type="radio" bind:group={gameMode} value="points" />
                    <span>Por Puntos</span>
                  </label>
                  <label class="radio-label">
                    <input type="radio" bind:group={gameMode} value="rounds" />
                    <span>Por Rondas</span>
                  </label>
                </div>
              </div>

              {#if gameMode === 'points'}
                <div class="form-row">
                  <div class="form-group">
                    <label for="pointsToWin">Puntos para Ganar</label>
                    <input
                      id="pointsToWin"
                      type="number"
                      bind:value={pointsToWin}
                      min="1"
                      max="50"
                      class="input-field"
                    />
                  </div>

                  <div class="form-group">
                    <label for="matchesToWin">Partidos a Ganar (Best of)</label>
                    <select id="matchesToWin" bind:value={matchesToWin} class="input-field">
                      <option value={1}>1 (sin revancha)</option>
                      <option value={3}>3 (gana a 2)</option>
                      <option value={5}>5 (gana a 3)</option>
                      <option value={7}>7 (gana a 4)</option>
                    </select>
                  </div>
                </div>
              {:else}
                <div class="form-group">
                  <label for="roundsToPlay">Número de Rondas por Partido</label>
                  <input
                    id="roundsToPlay"
                    type="number"
                    bind:value={roundsToPlay}
                    min="1"
                    max="20"
                    class="input-field"
                  />
                </div>
              {/if}
            </div>
          {/if}

          <!-- Common settings (20s and Hammer) -->
          <div class="settings-section">
            <h3>Opciones de Partido</h3>
            <div class="settings-grid">
              <label class="setting-item">
                <input type="checkbox" bind:checked={show20s} />
                <div class="setting-info">
                  <span class="setting-label">Contar 20s</span>
                  <small>Registrar discos en el centro</small>
                </div>
              </label>
              <label class="setting-item">
                <input type="checkbox" bind:checked={showHammer} />
                <div class="setting-info">
                  <span class="setting-label">Mostrar Hammer</span>
                  <small>Indicar quién tira último</small>
                </div>
              </label>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 3: ELO Configuration -->
      {#if currentStep === 3}
        <div class="step-container">
          <h2>📊 Configuración de Ranking ELO</h2>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={eloEnabled} />
              <span>Habilitar sistema de ranking ELO</span>
            </label>
            <small class="help-text">
              El ELO permite llevar un ranking de jugadores basado en rendimiento en torneos
            </small>
          </div>

          {#if eloEnabled}
            <div class="elo-config">
              <div class="form-group">
                <label for="kFactor">K-Factor (sensibilidad)</label>
                <input
                  id="kFactor"
                  type="number"
                  bind:value={kFactor}
                  min="1"
                  max="10"
                  step="1"
                  class="input-field"
                />
                <small class="help-text">
                  Puntos por posición de diferencia. Ej: K=2, quedas 3 posiciones mejor de lo esperado = +6 ELO
                </small>
              </div>

              <div class="form-group">
                <label for="maxDelta">Delta Máximo (±)</label>
                <input
                  id="maxDelta"
                  type="number"
                  bind:value={maxDelta}
                  min="5"
                  max="200"
                  step="5"
                  class="input-field"
                />
                <small class="help-text">
                  Límite de puntos por torneo. Ej: ±25 significa que aunque la fórmula dé +40, solo ganas +25
                </small>
              </div>

            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 4: Participants -->
      {#if currentStep === 4}
        <div class="step-container">
          <h2>👥 Agregar Participantes</h2>

          {#if participants.length >= maxPlayersForTables}
            <div class="max-participants-warning">
              ⚠️ Has alcanzado el límite de <strong>{maxPlayersForTables} jugadores</strong> para {numTables} {numTables === 1 ? 'mesa' : 'mesas'}
            </div>
          {:else}
            <div class="participants-limit-info">
              📊 {participants.length} / {maxPlayersForTables} jugadores (máximo para {numTables} {numTables === 1 ? 'mesa' : 'mesas'})
              {#if participants.length > 0 && extraTables > 0}
                <span class="extra-tables-hint">
                  — Usarás {tablesNeeded} de {numTables} {numTables === 1 ? 'mesa' : 'mesas'} ({extraTables} {extraTables === 1 ? 'sobrante' : 'sobrantes'})
                </span>
              {/if}
            </div>
          {/if}

          <div class="participants-section">
            <div class="add-participants">
              <div class="search-section">
                <h3>Buscar Jugadores Registrados</h3>
                <div class="search-box">
                  <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="Buscar por nombre o email..."
                    class="input-field"
                  />
                  {#if searchLoading}
                    <span class="search-loading">🔄</span>
                  {/if}
                </div>

                {#if searchResults.length > 0}
                  <div class="search-results">
                    {#each searchResults.slice(0, 10) as user}
                      <button
                        class="search-result-item"
                        on:click={() => addRegisteredUser({ ...user, userId: user.userId || '' })}
                        disabled={participants.length >= maxPlayersForTables}
                      >
                        <div class="user-info">
                          <div class="user-name-row">
                            <strong>{user.playerName}</strong>
                            <span class="user-elo">{user.elo || 1500}</span>
                          </div>
                          {#if user.email}
                            <span class="user-email">{user.email}</span>
                          {/if}
                        </div>
                        <span class="add-icon">+</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="guest-section">
                <h3>O Agregar Jugador Invitado</h3>
                <div class="guest-input-group">
                  <input
                    type="text"
                    bind:value={guestName}
                    placeholder="Player1"
                    class="input-field"
                    on:keydown={(e) => {
                      if (e.key === 'Enter' && guestName.trim().length >= 3) {
                        addGuestPlayer();
                      }
                    }}
                  />
                  <button
                    class="guest-button"
                    on:click={addGuestPlayer}
                    disabled={guestName.trim().length < 3 || participants.length >= maxPlayersForTables}
                  >
                    + Agregar
                  </button>
                </div>
                <small class="help-text">
                  Los invitados pueden participar pero no tendrán perfil ni ELO permanente (mínimo 3 caracteres)
                </small>
              </div>
            </div>

            <div class="participants-list">
              <h3>Participantes Agregados ({participants.length})</h3>

              {#if participants.length === 0}
                <div class="empty-participants">
                  <p>Aún no has agregado participantes</p>
                  <small>Mínimo 4 participantes requeridos</small>
                </div>
              {:else}
                <div class="participants-grid">
                  {#each participants as participant, index}
                    <div class="participant-card">
                      <div class="participant-info">
                        <div class="participant-name-row">
                          <strong>{participant.name}</strong>
                          {#if participant.type === 'REGISTERED' && participant.eloSnapshot}
                            <span class="participant-elo">{participant.eloSnapshot}</span>
                          {/if}
                        </div>
                        <span class="participant-type">
                          {participant.type === 'REGISTERED' ? '👤 Registrado' : '🎭 Invitado'}
                        </span>
                      </div>
                      <button class="remove-button" on:click={() => removeParticipant(index)}>
                        ✕
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 5: Review -->
      {#if currentStep === 5}
        <div class="step-container">
          <h2>✅ Revisión Final</h2>

          <div class="review-section">
            <div class="review-group">
              <h3>Información Básica</h3>
              <div class="review-item">
                <span class="review-label">Clave:</span>
                <span class="review-value">{key.toUpperCase()}</span>
              </div>
              <div class="review-item">
                <span class="review-label">Nombre:</span>
                <span class="review-value">{edition}º {name}</span>
              </div>
              {#if description}
                <div class="review-item">
                  <span class="review-label">Descripción:</span>
                  <span class="review-value">{description}</span>
                </div>
              {/if}
              <div class="review-item">
                <span class="review-label">Ubicación:</span>
                <span class="review-value">{city}, {country}</span>
              </div>
              {#if tournamentDate}
                <div class="review-item">
                  <span class="review-label">Fecha:</span>
                  <span class="review-value">{new Date(tournamentDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              {/if}
              <div class="review-item">
                <span class="review-label">Tipo:</span>
                <span class="review-value">{gameType === 'singles' ? 'Singles' : 'Doubles'}</span>
              </div>
              <div class="review-item">
                <span class="review-label">Modo:</span>
                <span class="review-value">
                  {gameMode === 'points' ? `${pointsToWin} puntos` : `${roundsToPlay} rondas`}
                </span>
              </div>
            </div>

            <div class="review-group">
              <h3>Formato del Torneo</h3>
              <div class="review-item">
                <span class="review-label">Mesas:</span>
                <span class="review-value">{numTables}</span>
              </div>
              <div class="review-item">
                <span class="review-label">Fases:</span>
                <span class="review-value">
                  {phaseType === 'ONE_PHASE' ? '1 Fase (Eliminatoria)' : '2 Fases (Grupos + Final)'}
                </span>
              </div>
              {#if phaseType === 'TWO_PHASE'}
                <div class="review-item">
                  <span class="review-label">Tipo de Grupos:</span>
                  <span class="review-value">
                    {groupStageType === 'ROUND_ROBIN'
                      ? `Round Robin (${numGroups} grupos)`
                      : `Suizo (${numSwissRounds} rondas)`}
                  </span>
                </div>
                <div class="review-item">
                  <span class="review-label">Clasificación:</span>
                  <span class="review-value">
                    {rankingSystem === 'WINS'
                      ? (groupStageType === 'ROUND_ROBIN' ? 'Por Victorias (2/1/0)' : 'Por Victorias (1/0.5/0)')
                      : 'Por Puntos Totales'}
                  </span>
                </div>
                <div class="review-item">
                  <span class="review-label">Fase Final:</span>
                  <span class="review-value">
                    {finalStageMode === 'SINGLE_BRACKET' ? 'Un solo bracket' : 'Divisiones (Oro / Plata)'}
                  </span>
                </div>
                <div class="review-item">
                  <span class="review-label">{finalStageMode === 'SPLIT_DIVISIONS' ? 'Bracket Oro:' : 'Config Final:'}</span>
                  <span class="review-value">
                    {finalGameMode === 'points' ? `${finalPointsToWin} puntos` : `${finalRoundsToPlay} rondas`}, Best of {finalMatchesToWin}
                  </span>
                </div>
                {#if finalStageMode === 'SPLIT_DIVISIONS'}
                  <div class="review-item">
                    <span class="review-label">Bracket Plata:</span>
                    <span class="review-value">
                      {silverGameMode === 'points' ? `${silverPointsToWin} puntos` : `${silverRoundsToPlay} rondas`}, Best of {silverMatchesToWin}
                    </span>
                  </div>
                {/if}
              {/if}
            </div>

            <div class="review-group">
              <h3>Sistema ELO</h3>
              <div class="review-item">
                <span class="review-label">Estado:</span>
                <span class="review-value">{eloEnabled ? '✅ Habilitado' : '❌ Deshabilitado'}</span>
              </div>
              {#if eloEnabled}
                <div class="review-item">
                  <span class="review-label">Configuración:</span>
                  <span class="review-value">
                    ELO inicial {initialElo}, K-Factor {kFactor}, ±{maxDelta} max
                  </span>
                </div>
              {/if}
            </div>

            <div class="review-group">
              <h3>Participantes</h3>
              <div class="review-item">
                <span class="review-label">Total:</span>
                <span class="review-value">{participants.length}</span>
              </div>
              <div class="participants-preview">
                {#each participants.slice(0, 10) as participant}
                  <span class="participant-chip">
                    {participant.name}
                    {participant.type === 'REGISTERED' ? '👤' : '🎭'}
                  </span>
                {/each}
                {#if participants.length > 10}
                  <span class="participant-chip">+{participants.length - 10} más...</span>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Validation Messages -->
      {#if validationErrors.length > 0}
        <div class="validation-messages errors">
          <strong>⚠️ Errores:</strong>
          <ul>
            {#each validationErrors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if validationWarnings.length > 0}
        <div class="validation-messages warnings">
          <strong>💡 Advertencias:</strong>
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
      <button class="nav-button secondary" on:click={prevStep} disabled={currentStep === 1}>
        ← Anterior
      </button>

      {#if currentStep < totalSteps}
        <button class="nav-button primary" on:click={nextStep} disabled={validationErrors.length > 0}>
          Siguiente →
        </button>
      {:else}
        <button class="nav-button primary create" on:click={createTournamentSubmit} disabled={creating || validationErrors.length > 0}>
          {creating ? (editMode ? 'Guardando...' : 'Creando...') : (editMode ? '💾 Guardar Cambios' : '🏆 Crear Torneo')}
        </button>
      {/if}
    </div>
  </div>
</AdminGuard>

<!-- Toast Notification -->
<Toast
  message={toastMessage}
  visible={showToast}
  duration={3000}
  onClose={() => showToast = false}
/>

<style>
  .wizard-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem 1.5rem 1rem;
    min-height: 100vh;
    max-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #fafafa;
    transition: background-color 0.3s;
    overflow: hidden;
  }

  .wizard-container[data-theme='dark'] {
    background: #0f1419;
  }

  /* Header */
  .wizard-header {
    flex-shrink: 0;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .back-button {
    padding: 0.6rem 1.2rem;
    font-size: 0.9rem;
    background: white;
    color: #555;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }

  .wizard-container[data-theme='dark'] .back-button {
    background: #1a2332;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  .back-button:hover {
    background: #f5f5f5;
    transform: translateX(-3px);
  }

  .wizard-container[data-theme='dark'] .back-button:hover {
    background: #2d3748;
  }

  .title-section h1 {
    font-size: 1.6rem;
    margin: 0 0 0.3rem 0;
    color: #1a1a1a;
    font-weight: 700;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .title-section h1 {
    color: #e1e8ed;
  }

  .subtitle {
    font-size: 0.85rem;
    color: #666;
    margin: 0 0 1rem 0;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .subtitle {
    color: #8b9bb3;
  }

  /* Progress Bar */
  .progress-bar {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    position: relative;
  }

  .progress-bar::before {
    content: '';
    position: absolute;
    top: 20px;
    left: 10%;
    right: 10%;
    height: 2px;
    background: #e0e0e0;
    z-index: 0;
  }

  .wizard-container[data-theme='dark'] .progress-bar::before {
    background: #2d3748;
  }

  .progress-step {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    position: relative;
    z-index: 1;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    transition: all 0.2s;
  }

  .progress-step:hover {
    opacity: 0.8;
  }

  .progress-step:hover .step-number {
    transform: scale(1.1);
  }

  .step-number {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: white;
    border: 2px solid #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    color: #999;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .step-number {
    background: #1a2332;
    border-color: #2d3748;
  }

  .progress-step.active .step-number {
    border-color: #fa709a;
    color: #fa709a;
  }

  .progress-step.current .step-number {
    background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    color: white;
    border-color: transparent;
  }

  .step-label {
    font-size: 0.75rem;
    color: #999;
    text-align: center;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .step-label {
    color: #6b7a94;
  }

  .progress-step.active .step-label {
    color: #333;
  }

  .wizard-container[data-theme='dark'] .progress-step.active .step-label {
    color: #c5d0de;
  }

  /* Content */
  .wizard-content {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    transition: background-color 0.3s, box-shadow 0.3s;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .wizard-container[data-theme='dark'] .wizard-content {
    background: #1a2332;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .step-container h2 {
    font-size: 1.3rem;
    margin: 0 0 1.2rem 0;
    color: #1a1a1a;
    font-weight: 700;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .step-container h2 {
    color: #e1e8ed;
  }

  /* Participants limit indicators */
  .participants-limit-info {
    background: #e8f4fd;
    border: 1px solid #b3d7f5;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
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

  .max-participants-warning {
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
    color: #856404;
  }

  .wizard-container[data-theme='dark'] .max-participants-warning {
    background: #5c4a1a;
    border-color: #8a6d1a;
    color: #ffd54f;
  }

  /* Form Elements */
  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
    font-size: 0.9rem;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] label {
    color: #c5d0de;
  }

  .input-field {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.95rem;
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
    border-color: #fa709a;
    box-shadow: 0 0 0 3px rgba(250, 112, 154, 0.1);
  }

  textarea.input-field {
    resize: vertical;
    font-family: inherit;
  }

  .radio-group {
    display: flex;
    flex-direction: row;
    gap: 0.75rem;
  }

  .radio-group.vertical {
    flex-direction: column;
  }

  .radio-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    cursor: pointer;
    padding: 0.75rem;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    transition: all 0.2s;
    flex: 1;
    flex-wrap: wrap;
  }

  .radio-group.vertical .radio-label {
    justify-content: flex-start;
  }

  .radio-description {
    width: 100%;
    font-size: 0.75rem;
    color: #6b7280;
    margin-left: 26px;
    margin-top: 0.25rem;
  }

  .wizard-container[data-theme='dark'] .radio-description {
    color: #8b9bb3;
  }

  .wizard-container[data-theme='dark'] .radio-label {
    border-color: #2d3748;
  }

  .radio-label:hover {
    background: #f8f8f8;
    border-color: #fa709a;
  }

  .wizard-container[data-theme='dark'] .radio-label:hover {
    background: #2d3748;
  }

  .radio-label input[type='radio'] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-weight: normal;
  }

  .checkbox-label input[type='checkbox'] {
    width: 20px;
    height: 20px;
    cursor: pointer;
  }

  .help-text {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.8rem;
    color: #999;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .help-text {
    color: #6b7a94;
  }

  .phase-config,
  .elo-config {
    margin-top: 1.5rem;
    padding: 1.5rem;
    background: #f8f8f8;
    border-radius: 8px;
    transition: background-color 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-config,
  .wizard-container[data-theme='dark'] .elo-config {
    background: #0f1419;
  }

  .phase-config h3,
  .elo-config h3 {
    font-size: 1.1rem;
    margin: 0 0 1rem 0;
    color: #555;
    transition: color 0.3s;
  }

  /* Phase sections - Professional design */
  .phase-section {
    margin-top: 1.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
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
    gap: 1rem;
    padding: 1rem 1.25rem;
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
    font-size: 1.5rem;
    line-height: 1;
  }

  .phase-title h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    color: #1f2937;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-title h3 {
    color: #f3f4f6;
  }

  .phase-title small {
    font-size: 0.8rem;
    color: #6b7280;
    font-weight: 400;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .phase-title small {
    color: #9ca3af;
  }

  .phase-content {
    padding: 1.25rem;
  }

  /* Match config box - uniform design */
  .match-config-box {
    margin-top: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .match-config-box {
    background: #111827;
    border-color: #374151;
  }

  .match-config-box h4 {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 1rem 0;
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

  /* Settings section */
  .settings-section {
    margin-top: 1.5rem;
    padding: 1rem 1.25rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .settings-section {
    background: #111827;
    border-color: #374151;
  }

  .settings-section h3 {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: #374151;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .settings-section h3 {
    color: #d1d5db;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .setting-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
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
    width: 18px;
    height: 18px;
    margin-top: 2px;
    cursor: pointer;
    accent-color: #fa709a;
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .setting-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: #1f2937;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .setting-label {
    color: #f3f4f6;
  }

  .setting-info small {
    font-size: 0.75rem;
    color: #6b7280;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .setting-info small {
    color: #9ca3af;
  }

  .wizard-container[data-theme='dark'] .phase-config h3,
  .wizard-container[data-theme='dark'] .elo-config h3 {
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

  /* Participants */
  .participants-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  .add-participants {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .search-section h3,
  .guest-section h3,
  .participants-list h3 {
    font-size: 1.1rem;
    margin: 0 0 1rem 0;
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
    margin-top: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    transition: border-color 0.3s;
  }

  .wizard-container[data-theme='dark'] .search-results {
    border-color: #2d3748;
  }

  .search-result-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border: none;
    background: white;
    color: #333;
    width: 100%;
    text-align: left;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
    transition: background-color 0.2s, color 0.3s;
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
    gap: 0.25rem;
  }

  .user-name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .user-info strong {
    color: #333;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .user-info strong {
    color: #e1e8ed;
  }

  .user-elo {
    font-size: 0.7rem;
    font-weight: 500;
    color: #666;
    background: #e8e8e8;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .wizard-container[data-theme='dark'] .user-elo {
    color: #a0aec0;
    background: #2d3748;
  }

  .user-email {
    font-size: 0.8rem;
    color: #999;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .user-email {
    color: #6b7a94;
  }

  .add-icon {
    font-size: 1.5rem;
    color: #fa709a;
  }

  .guest-input-group {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .guest-input-group .input-field {
    flex: 1;
  }

  .guest-button {
    padding: 0.75rem 1.5rem;
    background: white;
    border: 2px solid #ddd;
    border-radius: 6px;
    font-size: 0.95rem;
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
    border-color: #fa709a;
    background: #fef5f7;
    color: #fa709a;
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
    padding: 2rem;
    color: #999;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .empty-participants {
    color: #6b7a94;
  }

  .participants-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .participant-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: #f8f8f8;
    border-radius: 6px;
    transition: background-color 0.3s;
  }

  .wizard-container[data-theme='dark'] .participant-card {
    background: #0f1419;
  }

  .participant-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .participant-name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .participant-elo {
    font-size: 0.75rem;
    font-weight: 500;
    color: #666;
    background: #e8e8e8;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .wizard-container[data-theme='dark'] .participant-elo {
    color: #a0aec0;
    background: #2d3748;
  }

  .participant-type {
    font-size: 0.75rem;
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
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    transition: transform 0.2s;
  }

  .remove-button:hover {
    transform: scale(1.2);
  }

  /* Review */
  .review-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .review-group {
    padding: 1.5rem;
    background: #f8f8f8;
    border-radius: 8px;
    transition: background-color 0.3s;
  }

  .wizard-container[data-theme='dark'] .review-group {
    background: #0f1419;
  }

  .review-group h3 {
    font-size: 1.1rem;
    margin: 0 0 1rem 0;
    color: #555;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .review-group h3 {
    color: #8b9bb3;
  }

  .review-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #e0e0e0;
    transition: border-color 0.3s;
  }

  .wizard-container[data-theme='dark'] .review-item {
    border-bottom-color: #2d3748;
  }

  .review-item:last-child {
    border-bottom: none;
  }

  .review-label {
    font-weight: 600;
    color: #666;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .review-label {
    color: #8b9bb3;
  }

  .review-value {
    color: #333;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .review-value {
    color: #c5d0de;
  }

  .participants-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .participant-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.35rem 0.75rem;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    font-size: 0.85rem;
    transition: all 0.3s;
  }

  .wizard-container[data-theme='dark'] .participant-chip {
    background: #1a2332;
    border-color: #2d3748;
  }

  /* Validation */
  .validation-messages {
    margin-top: 1.5rem;
    padding: 1rem;
    border-radius: 8px;
    font-size: 0.9rem;
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
    margin: 0.5rem 0 0 0;
    padding-left: 1.5rem;
  }

  .validation-messages li {
    margin: 0.25rem 0;
  }

  /* Navigation */
  .wizard-navigation {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-shrink: 0;
  }

  .nav-button {
    padding: 0.75rem 2rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
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
    background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    color: white;
  }

  .nav-button.primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(250, 112, 154, 0.4);
  }

  .nav-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .wizard-container {
      padding: 1rem;
    }

    .progress-bar {
      flex-wrap: wrap;
      gap: 1rem;
    }

    .step-label {
      display: none;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .participants-section {
      grid-template-columns: 1fr;
    }

    .wizard-navigation {
      flex-direction: column-reverse;
    }

    .nav-button {
      width: 100%;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .wizard-container {
      padding: 0.5rem 1rem;
      max-height: 100vh;
    }

    .wizard-header {
      margin-bottom: 0.5rem;
    }

    .header-top {
      margin-bottom: 0.5rem;
    }

    .back-button {
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
    }

    .title-section h1 {
      font-size: 1.2rem;
      margin-bottom: 0.2rem;
    }

    .subtitle {
      font-size: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .progress-bar {
      margin-bottom: 0.75rem;
    }

    .step-number {
      width: 30px;
      height: 30px;
      font-size: 0.85rem;
    }

    .step-label {
      font-size: 0.65rem;
    }

    .wizard-content {
      padding: 1rem;
      margin-bottom: 0.75rem;
    }

    .step-container h2 {
      font-size: 1.1rem;
      margin-bottom: 0.75rem;
    }

    .step-container h3 {
      font-size: 1rem;
      margin-bottom: 0.5rem;
    }

    .form-group {
      margin-bottom: 0.75rem;
    }

    .form-group label {
      margin-bottom: 0.3rem;
      font-size: 0.85rem;
    }

    .input-field {
      padding: 0.5rem;
      font-size: 0.85rem;
    }

    .help-text {
      font-size: 0.7rem;
    }

    .radio-label {
      padding: 0.5rem;
      font-size: 0.85rem;
    }

    .phase-config {
      padding: 0.75rem;
    }

    .wizard-navigation {
      margin-top: 0.5rem;
    }

    .nav-button {
      padding: 0.5rem 1.5rem;
      font-size: 0.9rem;
    }
  }
</style>
