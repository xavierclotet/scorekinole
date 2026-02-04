<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import { goto } from '$app/navigation';
  import {
    createHistoricalTournament,
    canImportTournaments,
    type HistoricalTournamentInput,
    type HistoricalParticipantInput,
    type HistoricalGroupStageInput,
    type HistoricalFinalStageInput,
    type HistoricalBracketInput
  } from '$lib/firebase/tournamentImport';
  import { searchUsers } from '$lib/firebase/tournaments';
  import type { UserProfile } from '$lib/firebase/userProfile';
  import type { TournamentTier, RankingConfig } from '$lib/types/tournament';
  import { DEVELOPED_COUNTRIES } from '$lib/constants';
  import * as m from '$lib/paraglide/messages.js';

  // Wizard state
  let currentStep = $state(1);
  const totalSteps = 5;

  // LocalStorage key for draft
  const STORAGE_KEY = 'tournamentImportDraft';

  // Toast state
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType = $state<'success' | 'error' | 'info' | 'warning'>('info');

  // Loading states
  let isLoading = $state(true);
  let isSaving = $state(false);
  let hasPermission = $state(false);

  // Check permission on mount
  onMount(async () => {
    hasPermission = await canImportTournaments();
    if (hasPermission) {
      loadDraft();
    }
    isLoading = false;
    if (!hasPermission) {
      showToastMessage(m.import_noPermissionError(), 'error');
    }
  });

  // Step 1: Basic Info
  let name = $state('');
  let edition = $state<number | undefined>(undefined);
  let address = $state('');
  let city = $state('');
  let country = $state('España');
  let tournamentDate = $state(new Date().toISOString().split('T')[0]);
  let gameType = $state<'singles' | 'doubles'>('singles');
  let rankingEnabled = $state(false);
  let selectedTier = $state<TournamentTier>('CLUB');
  let importNotes = $state('');

  // Step 2: Participants
  interface ParticipantEntry {
    id: string;
    name: string;
    oderId?: string;
    partnerName?: string;
    partnerUserId?: string;
    isRegistered: boolean;
  }

  let participants = $state<ParticipantEntry[]>([]);
  let searchQuery = $state('');
  let searchResults = $state<(UserProfile & { userId: string })[]>([]);
  let searchLoading = $state(false);
  let batchInput = $state('');
  let showBatchInput = $state(false);

  // Step 3: Group Stage
  let hasGroupStage = $state(true);
  let numGroups = $state(2);

  interface GroupEntry {
    name: string;
    standings: StandingEntry[];
  }

  interface StandingEntry {
    participantId: string;
    participantName: string;
    position: number;
    matchesWon: number;
    matchesLost: number;
    matchesTied: number;
    total20s: number;
    totalPointsScored: number;
  }

  let groups = $state<GroupEntry[]>([]);

  // Step 4: Final Stage
  let numBrackets = $state(2);

  interface BracketEntry {
    name: string;
    label: string;
    sourcePositions: number[];
    rounds: BracketRoundEntry[];
  }

  interface BracketRoundEntry {
    name: string;
    matches: MatchEntry[];
  }

  interface MatchEntry {
    participantAId: string;
    participantAName: string;
    participantBId: string;
    participantBName: string;
    scoreA: number;
    scoreB: number;
    twentiesA: number;
    twentiesB: number;
    isWalkover: boolean;
  }

  let brackets = $state<BracketEntry[]>([]);

  // Derived: sorted participants
  let sortedParticipants = $derived(
    [...participants].sort((a, b) => a.name.localeCompare(b.name))
  );

  // Derived: available participants for dropdowns (not yet assigned to a group)
  let assignedParticipantIds = $derived(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      for (const standing of group.standings) {
        if (standing.participantId) {
          ids.add(standing.participantId);
        }
      }
    }
    return ids;
  });

  // Helper: get participants used in a specific round of a bracket (excluding current match)
  function getUsedParticipantsInRound(bracketIndex: number, roundIndex: number, excludeMatchIndex: number): Set<string> {
    const used = new Set<string>();
    const round = brackets[bracketIndex]?.rounds[roundIndex];
    if (!round) return used;

    round.matches.forEach((match, idx) => {
      if (idx !== excludeMatchIndex) {
        if (match.participantAId) used.add(match.participantAId);
        if (match.participantBId) used.add(match.participantBId);
      }
    });
    return used;
  }

  // Helper: get participants used in OTHER brackets (not the current one)
  function getUsedParticipantsInOtherBrackets(currentBracketIndex: number): Set<string> {
    const used = new Set<string>();
    brackets.forEach((bracket, bracketIdx) => {
      if (bracketIdx !== currentBracketIndex) {
        for (const round of bracket.rounds) {
          for (const match of round.matches) {
            if (match.participantAId) used.add(match.participantAId);
            if (match.participantBId) used.add(match.participantBId);
          }
        }
      }
    });
    return used;
  }

  // Initialize groups when numGroups changes
  $effect(() => {
    if (numGroups > 0 && groups.length !== numGroups) {
      const newGroups: GroupEntry[] = [];
      for (let i = 0; i < numGroups; i++) {
        if (groups[i]) {
          newGroups.push(groups[i]);
        } else {
          newGroups.push({
            name: `Grupo ${i + 1}`,
            standings: []
          });
        }
      }
      groups = newGroups.slice(0, numGroups);
    }
  });

  // Initialize brackets when numBrackets changes
  $effect(() => {
    if (numBrackets > 0 && brackets.length !== numBrackets) {
      const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const newBrackets: BracketEntry[] = [];

      for (let i = 0; i < numBrackets; i++) {
        if (brackets[i]) {
          newBrackets.push(brackets[i]);
        } else {
          const label = labels[i] || String(i + 1);
          newBrackets.push({
            name: `${label} Finals`,
            label: label,
            sourcePositions: [i * 2 + 1, i * 2 + 2],
            rounds: []
          });
        }
      }
      brackets = newBrackets.slice(0, numBrackets);
    }
  });

  // Draft management functions
  function loadDraft() {
    if (typeof localStorage === 'undefined') return;

    try {
      const draft = localStorage.getItem(STORAGE_KEY);
      if (!draft) return;

      const data = JSON.parse(draft);

      // Step 1: Basic Info
      name = data.name ?? '';
      edition = data.edition ?? undefined;
      address = data.address ?? '';
      city = data.city ?? '';
      country = data.country ?? 'España';
      tournamentDate = data.tournamentDate ?? new Date().toISOString().split('T')[0];
      gameType = data.gameType ?? 'singles';
      rankingEnabled = data.rankingEnabled ?? false;
      selectedTier = data.selectedTier ?? 'CLUB';
      importNotes = data.importNotes ?? '';

      // Step 2: Participants
      participants = data.participants ?? [];

      // Step 3: Group Stage
      hasGroupStage = data.hasGroupStage ?? true;
      numGroups = data.numGroups ?? 2;
      groups = data.groups ?? [];

      // Step 4: Final Stage
      numBrackets = data.numBrackets ?? 2;
      brackets = data.brackets ?? [];

      // Wizard state
      currentStep = data.currentStep ?? 1;

      console.log('✅ Import draft loaded from localStorage');
    } catch (error) {
      console.error('❌ Error loading import draft:', error);
    }
  }

  function saveDraft() {
    if (typeof localStorage === 'undefined') return;

    try {
      const data = {
        // Step 1: Basic Info
        name,
        edition,
        address,
        city,
        country,
        tournamentDate,
        gameType,
        rankingEnabled,
        selectedTier,
        importNotes,

        // Step 2: Participants
        participants,

        // Step 3: Group Stage
        hasGroupStage,
        numGroups,
        groups,

        // Step 4: Final Stage
        numBrackets,
        brackets,

        // Wizard state
        currentStep
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('❌ Error saving import draft:', error);
    }
  }

  function clearDraft() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    console.log('✅ Import draft cleared');
  }

  // Search users debounced
  let searchTimeout: ReturnType<typeof setTimeout>;
  async function handleSearchInput() {
    clearTimeout(searchTimeout);
    if (searchQuery.length < 2) {
      searchResults = [];
      return;
    }

    searchTimeout = setTimeout(async () => {
      searchLoading = true;
      try {
        const results = await searchUsers(searchQuery) as (UserProfile & { userId: string })[];
        // Filter out users already added as participants
        const addedUserIds = participants
          .filter(p => p.isRegistered && p.oderId)
          .map(p => p.oderId);
        searchResults = results.filter(u => !addedUserIds.includes(u.userId));
      } catch (e) {
        console.error('Search error:', e);
        searchResults = [];
      } finally {
        searchLoading = false;
      }
    }, 300);
  }

  // Add participant from search
  function addParticipantFromSearch(user: UserProfile & { userId: string }) {
    if (participants.some(p => p.oderId === user.userId)) {
      showToastMessage(m.import_userAlreadyAdded(), 'warning');
      return;
    }

    participants = [...participants, {
      id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: user.playerName || 'Usuario',
      oderId: user.userId,
      isRegistered: true
    }];

    searchQuery = '';
    searchResults = [];
    saveDraft();
  }

  // Add participant as guest
  function addGuestParticipant() {
    if (!searchQuery.trim()) return;

    const guestName = searchQuery.trim();
    if (participants.some(p => p.name.toLowerCase() === guestName.toLowerCase())) {
      showToastMessage(m.import_participantExists(), 'warning');
      return;
    }

    participants = [...participants, {
      id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: guestName,
      isRegistered: false
    }];

    searchQuery = '';
    searchResults = [];
    saveDraft();
  }

  // Add multiple participants from batch input
  function addBatchParticipants() {
    if (!batchInput.trim()) return;

    const names = batchInput
      .split(/[\n,]/)
      .map(n => n.trim())
      .filter(n => n.length > 0);

    const newParticipants: ParticipantEntry[] = [];
    for (const name of names) {
      if (!participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        newParticipants.push({
          id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          name,
          isRegistered: false
        });
      }
    }

    if (newParticipants.length > 0) {
      participants = [...participants, ...newParticipants];
      showToastMessage(`${newParticipants.length} participantes añadidos`, 'success');
    }

    batchInput = '';
    showBatchInput = false;
    saveDraft();
  }

  // Remove participant
  function removeParticipant(id: string) {
    participants = participants.filter(p => p.id !== id);
    saveDraft();
  }

  // Add standing row to group
  function addStandingRow(groupIndex: number) {
    groups[groupIndex].standings = [
      ...groups[groupIndex].standings,
      {
        participantId: '',
        participantName: '',
        position: groups[groupIndex].standings.length + 1,
        matchesWon: 0,
        matchesLost: 0,
        matchesTied: 0,
        total20s: 0,
        totalPointsScored: 0
      }
    ];
  }

  // Remove standing row
  function removeStandingRow(groupIndex: number, standingIndex: number) {
    groups[groupIndex].standings = groups[groupIndex].standings.filter((_, i) => i !== standingIndex);
    // Reorder positions
    groups[groupIndex].standings.forEach((s, i) => {
      s.position = i + 1;
    });
  }

  // Add round to bracket
  function addRound(bracketIndex: number) {
    const roundNames = [m.import_round16(), m.import_quarterfinals(), m.import_semifinals(), m.import_final()];
    const matchCountsByIndex: number[] = [8, 4, 2, 1];
    const currentRounds = brackets[bracketIndex].rounds.length;
    const roundName = roundNames[currentRounds] || m.import_roundN({ n: currentRounds + 1 });

    // Calculate how many matches to pre-create
    let numMatches = matchCountsByIndex[currentRounds] || 1;

    // Cap to available participants / 2 if we're creating the first round
    if (currentRounds === 0) {
      const maxMatches = Math.floor(participants.length / 2);
      numMatches = Math.min(numMatches, maxMatches);
    } else {
      // For subsequent rounds, use half the previous round's matches
      const prevRoundMatches = brackets[bracketIndex].rounds[currentRounds - 1]?.matches.length || 0;
      if (prevRoundMatches > 0) {
        numMatches = Math.max(1, Math.floor(prevRoundMatches / 2));
      }
    }

    // Create empty matches
    const emptyMatches: MatchEntry[] = [];
    for (let i = 0; i < numMatches; i++) {
      emptyMatches.push({
        participantAId: '',
        participantAName: '',
        participantBId: '',
        participantBName: '',
        scoreA: 0,
        scoreB: 0,
        twentiesA: 0,
        twentiesB: 0,
        isWalkover: false
      });
    }

    const roundIndex = brackets[bracketIndex].rounds.length;
    brackets[bracketIndex].rounds = [
      ...brackets[bracketIndex].rounds,
      {
        name: roundName,
        matches: emptyMatches
      }
    ];

    // Auto-focus on the first match's selector after DOM update
    setTimeout(() => {
      const firstSelect = document.getElementById(`b${bracketIndex}-r${roundIndex}-m0-a`);
      if (firstSelect) firstSelect.focus();
    }, 50);
  }

  // Add match to round
  function addMatch(bracketIndex: number, roundIndex: number) {
    const newMatchIndex = brackets[bracketIndex].rounds[roundIndex].matches.length;
    brackets[bracketIndex].rounds[roundIndex].matches = [
      ...brackets[bracketIndex].rounds[roundIndex].matches,
      {
        participantAId: '',
        participantAName: '',
        participantBId: '',
        participantBName: '',
        scoreA: 0,
        scoreB: 0,
        twentiesA: 0,
        twentiesB: 0,
        isWalkover: false
      }
    ];
    // Auto-focus on the new match's first selector after DOM update
    setTimeout(() => {
      const newSelect = document.getElementById(`b${bracketIndex}-r${roundIndex}-m${newMatchIndex}-a`);
      if (newSelect) newSelect.focus();
    }, 50);
  }

  // Remove match
  function removeMatch(bracketIndex: number, roundIndex: number, matchIndex: number) {
    brackets[bracketIndex].rounds[roundIndex].matches =
      brackets[bracketIndex].rounds[roundIndex].matches.filter((_, i) => i !== matchIndex);
  }

  // Toast helper
  function showToastMessage(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
    toastMessage = message;
    toastType = type;
    showToast = true;
  }

  // Validation
  function validateStep(step: number): string[] {
    const errors: string[] = [];

    switch (step) {
      case 1:
        if (!name.trim()) errors.push(m.import_nameRequired());
        if (!city.trim()) errors.push(m.import_cityRequired());
        if (!tournamentDate) errors.push(m.import_dateRequired());
        break;

      case 2:
        if (participants.length < 2) errors.push(m.import_minParticipants());
        break;

      case 3:
        if (hasGroupStage) {
          for (let i = 0; i < groups.length; i++) {
            if (groups[i].standings.length < 2) {
              errors.push(m.import_minParticipantsGroup({ n: i + 1 }));
            }
          }
        }
        break;

      case 4:
        for (let i = 0; i < brackets.length; i++) {
          if (brackets[i].rounds.length === 0) {
            errors.push(m.import_minRoundsBracket({ label: brackets[i].label }));
          }
        }
        break;
    }

    return errors;
  }

  // Navigation
  function nextStep() {
    const errors = validateStep(currentStep);
    if (errors.length > 0) {
      showToastMessage(errors[0], 'error');
      return;
    }
    if (currentStep < totalSteps) {
      currentStep++;
      saveDraft();
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
      saveDraft();
    }
  }

  function goToStep(step: number) {
    // Only allow going back or to current step
    if (step <= currentStep) {
      currentStep = step;
      saveDraft();
    }
  }

  // Build input data for Firebase
  function buildTournamentInput(): HistoricalTournamentInput {
    const participantInputs: HistoricalParticipantInput[] = participants.map(p => ({
      name: p.name,
      oderId: p.oderId,
      partnerName: p.partnerName,
      partnerUserId: p.partnerUserId
    }));

    let groupStageInput: HistoricalGroupStageInput | undefined;
    if (hasGroupStage && groups.length > 0) {
      groupStageInput = {
        numGroups: groups.length,
        groups: groups.map(g => ({
          name: g.name,
          standings: g.standings.map(s => ({
            participantName: s.participantName || participants.find(p => p.id === s.participantId)?.name || '',
            position: s.position,
            matchesWon: s.matchesWon,
            matchesLost: s.matchesLost,
            matchesTied: s.matchesTied,
            total20s: s.total20s,
            totalPointsScored: s.totalPointsScored
          }))
        }))
      };
    }

    const finalStageInput: HistoricalFinalStageInput = {
      mode: brackets.length > 2 ? 'PARALLEL_BRACKETS' : (brackets.length === 2 ? 'SPLIT_DIVISIONS' : 'SINGLE_BRACKET'),
      brackets: brackets.map(b => ({
        name: b.name,
        label: b.label,
        sourcePositions: b.sourcePositions,
        rounds: b.rounds.map(r => ({
          name: r.name,
          matches: r.matches.map(m => ({
            participantAName: m.participantAName || participants.find(p => p.id === m.participantAId)?.name || '',
            participantBName: m.participantBName || participants.find(p => p.id === m.participantBId)?.name || '',
            scoreA: m.scoreA,
            scoreB: m.scoreB,
            twentiesA: m.twentiesA,
            twentiesB: m.twentiesB,
            isWalkover: m.isWalkover
          }))
        }))
      }))
    };

    return {
      name,
      edition,
      tournamentDate: new Date(tournamentDate).getTime(),
      address: address || undefined,
      city,
      country,
      gameType,
      rankingConfig: {
        enabled: rankingEnabled,
        tier: rankingEnabled ? selectedTier : undefined
      },
      importNotes: importNotes || undefined,
      phaseType: hasGroupStage ? 'TWO_PHASE' : 'ONE_PHASE',
      show20s: true,
      participants: participantInputs,
      groupStage: groupStageInput,
      finalStage: finalStageInput
    };
  }

  // Submit
  async function handleSubmit() {
    const errors = validateStep(currentStep);
    if (errors.length > 0) {
      showToastMessage(errors[0], 'error');
      return;
    }

    isSaving = true;
    try {
      const input = buildTournamentInput();
      const tournamentId = await createHistoricalTournament(input);

      if (tournamentId) {
        clearDraft();
        showToastMessage(m.import_success(), 'success');
        setTimeout(() => {
          goto(`/tournaments/${tournamentId}`);
        }, 1500);
      } else {
        showToastMessage(m.import_error(), 'error');
      }
    } catch (e) {
      console.error('Import error:', e);
      showToastMessage(m.import_error(), 'error');
    } finally {
      isSaving = false;
    }
  }

  // Get participant name by ID
  function getParticipantName(id: string): string {
    return participants.find(p => p.id === id)?.name || '';
  }
</script>

<AdminGuard>
  {#if isLoading}
    <div class="wizard-container" data-theme={$adminTheme}>
      <LoadingSpinner message={m.common_loading()} />
    </div>
  {:else if !hasPermission}
    <div class="wizard-container" data-theme={$adminTheme}>
      <div class="no-permission">
        <div class="no-permission-icon">🔒</div>
        <h2>{m.import_noPermission()}</h2>
        <p>{m.import_noPermissionDesc()}</p>
        <p class="hint">{m.import_noPermissionHint()}</p>
        <a href="/admin/tournaments" class="back-button">← {m.import_backToTournaments()}</a>
      </div>
    </div>
  {:else}
  <div class="wizard-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" onclick={() => goto('/admin/tournaments')}>←</button>
        <div class="header-main">
          <div class="title-section">
            <h1>
              {m.import_title()}:
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
              <span class="info-badge imported-badge">{m.import_imported()}</span>
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
            class:clickable={true}
            onclick={() => goToStep(i + 1)}
          >
            <div class="step-number">{i + 1}</div>
            <div class="step-label">
              {#if i === 0}{m.wizard_stepInfo()}
              {:else if i === 1}{m.wizard_stepPlayers()}
              {:else if i === 2}{m.import_groupStage()}
              {:else if i === 3}{m.import_knockoutStage()}
              {:else}{m.wizard_stepReview()}
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </header>

    <div class="wizard-content">
        {#if currentStep === 1}
        <!-- Step 1: Basic Info -->
        <div class="step-container step-basic">
          <h2>{m.wizard_basicInfo()}</h2>
          <p class="wizard-intro">{m.import_description()}</p>

          <!-- Identificación del Torneo -->
          <div class="info-section">
            <div class="info-section-header">{m.wizard_identification()}</div>
            <div class="info-grid id-grid">
              <div class="info-field edition-field">
                <label for="edition">{m.wizard_edition()}</label>
                <input
                  id="edition"
                  type="number"
                  bind:value={edition}
                  min="1"
                  placeholder="—"
                  class="input-field"
                />
              </div>

              <div class="info-field name-field">
                <label for="name">{m.wizard_tournamentName()}</label>
                <input
                  id="name"
                  type="text"
                  bind:value={name}
                  placeholder="Ej: Tauron Open"
                  class="input-field"
                />
              </div>
            </div>
          </div>

          <!-- Ubicación y Fecha -->
          <div class="info-section">
            <div class="info-section-header">{m.wizard_locationDate()}</div>
            <div class="info-grid location-grid">
              <div class="info-field address-field">
                <label for="address">{m.wizard_address()}</label>
                <input
                  id="address"
                  type="text"
                  bind:value={address}
                  placeholder="Club de Crokinole Barcelona"
                  class="input-field"
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
                />
              </div>

              <div class="info-field">
                <label for="country">{m.wizard_country()}</label>
                <select
                  id="country"
                  bind:value={country}
                  class="input-field"
                >
                  <option value="">{m.wizard_selectOption()}</option>
                  {#each DEVELOPED_COUNTRIES as countryOption}
                    <option value={countryOption}>{countryOption}</option>
                  {/each}
                </select>
              </div>

              <div class="info-field date-field">
                <label for="date">{m.wizard_date()}</label>
                <input
                  id="date"
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
              <div class="info-field">
                <span class="field-label">{m.wizard_gameType()}</span>
                <div class="toggle-group">
                  <button
                    type="button"
                    class="toggle-btn"
                    class:active={gameType === 'singles'}
                    onclick={() => gameType = 'singles'}
                  >
                    Singles
                  </button>
                  <button
                    type="button"
                    class="toggle-btn"
                    class:active={gameType === 'doubles'}
                    onclick={() => gameType = 'doubles'}
                  >
                    Dobles
                  </button>
                </div>
              </div>

              <div class="info-field">
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={rankingEnabled} />
                  <span>{m.wizard_enableRanking()}</span>
                </label>

                {#if rankingEnabled}
                  <select id="tier" bind:value={selectedTier} class="input-field" style="margin-top: 0.5rem;">
                    <option value="CLUB">Club</option>
                    <option value="REGIONAL">Regional</option>
                    <option value="NATIONAL">Nacional</option>
                    <option value="MAJOR">Major</option>
                  </select>
                {/if}
              </div>
            </div>
          </div>

          <!-- Notas -->
          <div class="info-section">
            <div class="info-section-header">{m.import_dataNotes()} <span class="optional">({m.import_optional()})</span></div>
            <div class="info-grid">
              <div class="info-field full-width">
                <textarea
                  id="notes"
                  bind:value={importNotes}
                  placeholder={m.import_dataNotesHint()}
                  class="input-field textarea"
                  rows="2"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

      {:else if currentStep === 2}
        <!-- Step 2: Participants -->
        <div class="step-container">
          <h2>{m.wizard_participants()}</h2>

          <!-- Search Section -->
          <div class="info-section">
            <div class="info-section-header">{m.import_searchPlayer()}</div>
            <div class="info-grid">
              <div class="info-field full-width">
                <div class="search-input-wrapper">
                  <input
                    type="text"
                    bind:value={searchQuery}
                    oninput={handleSearchInput}
                    placeholder={m.import_searchPlayer()}
                    class="input-field search-input"
                  />
                  {#if searchLoading}
                    <div class="search-spinner">
                      <LoadingSpinner size="small" />
                    </div>
                  {/if}
                </div>

                {#if searchResults.length > 0}
                  <div class="search-results">
                    {#each searchResults as user}
                      <button class="search-result" onclick={() => addParticipantFromSearch(user)}>
                        <span class="result-name">{user.playerName || 'Usuario'}</span>
                        <span class="result-add">+</span>
                      </button>
                    {/each}
                  </div>
                {:else if searchQuery.length >= 2 && !searchLoading}
                  <div class="search-results">
                    <button class="search-result guest" onclick={addGuestParticipant}>
                      <span class="result-name">+ "{searchQuery}"</span>
                      <span class="result-badge guest">{m.import_createAsGuest()}</span>
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Batch input -->
          <div class="info-section">
            <button class="info-section-header clickable" onclick={() => showBatchInput = !showBatchInput}>
              {m.import_batchAdd()} {showBatchInput ? '▼' : '▶'}
            </button>
            {#if showBatchInput}
              <div class="info-grid">
                <div class="info-field full-width">
                  <textarea
                    bind:value={batchInput}
                    placeholder={m.import_batchHint()}
                    class="input-field textarea"
                    rows="4"
                  ></textarea>
                  <button class="add-batch-btn" onclick={addBatchParticipants}>
                    + {m.import_addParticipant()}
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <!-- Participants list -->
          <div class="info-section">
            <div class="info-section-header">{m.import_participantsCount({ count: participants.length })}</div>
            <div class="info-grid">
              <div class="info-field full-width">
                {#if participants.length === 0}
                  <p class="empty-message">{m.import_noParticipantsYet()}</p>
                {:else}
                  <div class="participants-grid">
                    {#each sortedParticipants as participant}
                      <div class="participant-item">
                        <span class="participant-name">
                          {participant.name}
                          {#if participant.isRegistered}
                            <span class="registered-badge">✓</span>
                          {/if}
                        </span>
                        <button class="remove-btn" onclick={() => removeParticipant(participant.id)}>
                          ×
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>

      {:else if currentStep === 3}
        <!-- Step 3: Group Stage -->
        <div class="step-container">
          <h2>{m.import_groupStage()}</h2>

          <div class="info-section">
            <div class="info-section-header">{m.wizard_configuration()}</div>
            <div class="info-grid config-grid">
              <div class="info-field">
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={hasGroupStage} />
                  <span>{m.import_hasGroupStage()}</span>
                </label>
              </div>

              {#if hasGroupStage}
                <div class="info-field">
                  <label for="numGroups">{m.import_numGroups()}</label>
                  <select id="numGroups" bind:value={numGroups} class="input-field" style="width: 100px;">
                    {#each [1, 2, 3, 4] as n}
                      <option value={n}>{n}</option>
                    {/each}
                  </select>
                </div>
              {/if}
            </div>
          </div>

          {#if hasGroupStage}
            <!-- Groups -->
            {#each groups as group, groupIndex}
              <div class="info-section group-section">
                <div class="info-section-header">{group.name}</div>
                <div class="info-grid">
                  <div class="info-field full-width">
                    <table class="standings-table">
                      <thead>
                        <tr>
                          <th>{m.import_position()}</th>
                          <th>{m.common_name()}</th>
                          <th>{m.import_wonShort()}</th>
                          <th>{m.import_lostShort()}</th>
                          <th>{m.import_pointsShort()}</th>
                          <th>{m.import_twentiesShort()}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each group.standings as standing, standingIndex}
                          <tr>
                            <td class="position-cell">{standing.position}</td>
                            <td>
                              <select
                                bind:value={standing.participantId}
                                class="input-field compact"
                                onchange={() => {
                                  standing.participantName = getParticipantName(standing.participantId);
                                }}
                              >
                                <option value="">{m.import_selectParticipant()}</option>
                                {#each participants as p}
                                  <option value={p.id} disabled={assignedParticipantIds().has(p.id) && standing.participantId !== p.id}>
                                    {p.name}
                                  </option>
                                {/each}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number"
                                bind:value={standing.matchesWon}
                                min="0"
                                class="input-field compact number-input"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                bind:value={standing.matchesLost}
                                min="0"
                                class="input-field compact number-input"
                              />
                            </td>
                            <td class="points-cell">
                              {standing.matchesWon * 2 + standing.matchesTied}
                            </td>
                            <td>
                              <input
                                type="number"
                                bind:value={standing.total20s}
                                min="0"
                                class="input-field compact number-input"
                              />
                            </td>
                            <td>
                              <button class="remove-btn small" onclick={() => removeStandingRow(groupIndex, standingIndex)}>
                                ×
                              </button>
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>

                    <button class="add-row-btn" onclick={() => addStandingRow(groupIndex)}>
                      + {m.import_addRow()}
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>

      {:else if currentStep === 4}
        <!-- Step 4: Knockout Stage -->
        <div class="step-container">
          <h2>{m.import_knockoutStage()}</h2>

          <div class="info-section">
            <div class="info-section-header">{m.wizard_configuration()}</div>
            <div class="info-grid config-grid">
              <div class="info-field">
                <label for="numBrackets">{m.import_numBrackets()}</label>
                <select id="numBrackets" bind:value={numBrackets} class="input-field" style="width: 100px;">
                  {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as n}
                    <option value={n}>{n}</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>

          <!-- Brackets -->
          {#each brackets as bracket, bracketIndex}
            <div class="info-section bracket-section bracket-{bracket.label.toLowerCase()}">
              <div class="info-section-header bracket-header">
                <span>{bracket.name}</span>
                <span class="bracket-label-badge">{bracket.label}</span>
              </div>
              <div class="info-grid">
                <div class="info-field full-width">
                  <!-- Rounds -->
                  {#each bracket.rounds as round, roundIndex}
                    <div class="round-section">
                      <div class="round-header">
                        <h4>{round.name}</h4>
                        <button class="add-match-btn" onclick={() => addMatch(bracketIndex, roundIndex)}>
                          + {m.import_addMatch()}
                        </button>
                      </div>

                      <!-- Matches with selectors -->
                      {#each round.matches as match, matchIndex}
                        {@const usedInRound = getUsedParticipantsInRound(bracketIndex, roundIndex, matchIndex)}
                        {@const usedInOtherBrackets = getUsedParticipantsInOtherBrackets(bracketIndex)}
                        {@const availableForA = sortedParticipants.filter(p =>
                          p.id === match.participantAId ||
                          (!usedInRound.has(p.id) && !usedInOtherBrackets.has(p.id) && p.id !== match.participantBId)
                        )}
                        {@const availableForB = sortedParticipants.filter(p =>
                          p.id === match.participantBId ||
                          (!usedInRound.has(p.id) && !usedInOtherBrackets.has(p.id) && p.id !== match.participantAId)
                        )}
                        {@const matchId = `b${bracketIndex}-r${roundIndex}-m${matchIndex}`}
                        <div class="match-entry-row">
                          <select
                            id="{matchId}-a"
                            class="input-field participant-select"
                            bind:value={match.participantAId}
                            onchange={(e) => {
                              match.participantAName = getParticipantName(match.participantAId);
                              // Auto-tab to score A
                              const scoreA = document.getElementById(`${matchId}-scoreA`);
                              if (scoreA && match.participantAId) scoreA.focus();
                            }}
                          >
                            <option value="">{m.import_selectParticipant()}</option>
                            {#each availableForA as p}
                              <option value={p.id}>{p.name}</option>
                            {/each}
                          </select>

                          <div class="score-inputs">
                            <input
                              id="{matchId}-scoreA"
                              type="number"
                              class="input-field score-input"
                              bind:value={match.scoreA}
                              min="0"
                              placeholder="0"
                              onfocus={(e) => e.currentTarget.select()}
                              onkeydown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Tab') {
                                  e.preventDefault();
                                  const scoreB = document.getElementById(`${matchId}-scoreB`);
                                  if (scoreB) scoreB.focus();
                                }
                              }}
                            />
                            <span class="score-separator">-</span>
                            <input
                              id="{matchId}-scoreB"
                              type="number"
                              class="input-field score-input"
                              bind:value={match.scoreB}
                              min="0"
                              placeholder="0"
                              onfocus={(e) => e.currentTarget.select()}
                              onkeydown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Tab') {
                                  e.preventDefault();
                                  const selectB = document.getElementById(`${matchId}-b`);
                                  if (selectB) selectB.focus();
                                }
                              }}
                            />
                          </div>

                          <select
                            id="{matchId}-b"
                            class="input-field participant-select"
                            bind:value={match.participantBId}
                            onchange={(e) => {
                              match.participantBName = getParticipantName(match.participantBId);
                              // Auto-tab to next match's participant A or add button
                              const nextMatchA = document.getElementById(`b${bracketIndex}-r${roundIndex}-m${matchIndex + 1}-a`);
                              if (nextMatchA && match.participantBId) {
                                nextMatchA.focus();
                              }
                            }}
                          >
                            <option value="">{m.import_selectParticipant()}</option>
                            {#each availableForB as p}
                              <option value={p.id}>{p.name}</option>
                            {/each}
                          </select>

                          <button class="remove-btn small" onclick={() => removeMatch(bracketIndex, roundIndex, matchIndex)}>
                            ×
                          </button>
                        </div>
                      {/each}

                      {#if round.matches.length === 0}
                        <p class="empty-round-message">{m.import_noMatches()}</p>
                      {/if}
                    </div>
                  {/each}

                  <button class="add-row-btn" onclick={() => addRound(bracketIndex)}>
                    + {m.import_addRound()}
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>

      {:else if currentStep === 5}
        <!-- Step 5: Review -->
        <div class="step-container">
          <h2>{m.wizard_finalReview()}</h2>

          <div class="info-section">
            <div class="info-section-header">{m.import_tournamentInfo()}</div>
            <div class="review-grid">
              <div class="review-item">
                <span class="review-label">{m.wizard_name()}</span>
                <span class="review-value">{name}</span>
              </div>
              {#if edition}
                <div class="review-item">
                  <span class="review-label">{m.wizard_edition()}</span>
                  <span class="review-value">#{edition}</span>
                </div>
              {/if}
              <div class="review-item">
                <span class="review-label">{m.wizard_date()}</span>
                <span class="review-value">{tournamentDate}</span>
              </div>
              <div class="review-item">
                <span class="review-label">{m.wizard_location()}</span>
                <span class="review-value">{#if address}{address}, {/if}{city}, {country}</span>
              </div>
              <div class="review-item">
                <span class="review-label">{m.wizard_gameType()}</span>
                <span class="review-value">{gameType === 'singles' ? 'Singles' : 'Dobles'}</span>
              </div>
            </div>
          </div>

          <div class="info-section">
            <div class="info-section-header">{m.import_participants()} ({participants.length})</div>
            <div class="info-grid">
              <div class="info-field full-width">
                <div class="review-participants">
                  {#each sortedParticipants as p}
                    <span class="review-participant">
                      {p.name}
                      {#if p.isRegistered}<span class="registered-badge small">✓</span>{/if}
                    </span>
                  {/each}
                </div>
              </div>
            </div>
          </div>

          {#if hasGroupStage}
            <div class="info-section">
              <div class="info-section-header">{m.import_groupStage()} ({groups.length} grupos)</div>
              <div class="info-grid">
                <div class="info-field full-width">
                  <div class="review-groups-row">
                    {#each groups as group}
                      <div class="review-group">
                        <h4>{group.name}</h4>
                        <ol>
                          {#each group.standings as standing}
                            <li>{standing.participantName || getParticipantName(standing.participantId)}</li>
                          {/each}
                        </ol>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          {/if}

          <div class="info-section">
            <div class="info-section-header">{m.import_knockoutStage()} ({brackets.length} brackets)</div>
            <div class="info-grid">
              <div class="info-field full-width">
                {#each brackets as bracket}
                  <div class="review-bracket">
                    <h4>{bracket.name}</h4>
                    {#each bracket.rounds as round}
                      <div class="review-round">
                        <strong>{round.name}:</strong>
                        {#each round.matches as match}
                          <div class="review-match">
                            <span class:winner={match.scoreA > match.scoreB}>{match.participantAName || getParticipantName(match.participantAId)}</span>
                            <strong>{match.scoreA} - {match.scoreB}</strong>
                            <span class:winner={match.scoreB > match.scoreA}>{match.participantBName || getParticipantName(match.participantBId)}</span>
                          </div>
                        {/each}
                      </div>
                    {/each}
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Navigation -->
    <div class="wizard-navigation">
      <button class="nav-button secondary" onclick={prevStep} disabled={currentStep === 1}>
        ← {m.wizard_previous()}
      </button>

      {#if currentStep < totalSteps}
        <button class="nav-button primary" onclick={nextStep}>
          {m.wizard_next()} →
        </button>
      {:else}
        <button class="nav-button primary create" onclick={handleSubmit} disabled={isSaving}>
          {#if isSaving}
            <LoadingSpinner size="small" inline={true} />
          {:else}
            📥 {m.import_completeImport()}
          {/if}
        </button>
      {/if}
    </div>
  </div>
  {/if}

  <Toast bind:visible={showToast} message={toastMessage} type={toastType} />
</AdminGuard>

<style>
  /* Wizard Container - Same as create wizard */
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

  /* Header */
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

  .info-badge.imported-badge {
    background: #fef3c7;
    color: #92400e;
  }

  [data-theme='dark'] .info-badge.imported-badge {
    background: #78350f;
    color: #fcd34d;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Progress Bar */
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
    cursor: pointer;
    padding: 0.25rem 0.75rem;
    transition: all 0.2s;
  }

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

  .progress-step.clickable:hover .step-number {
    transform: scale(1.05);
    border-color: #059669;
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

  /* Wizard Content */
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

  /* Step Container */
  .step-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .step-container h2 {
    font-size: 1rem;
    margin: 0 0 0.5rem 0;
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

  /* Info Sections */
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

  .info-section-header.clickable {
    cursor: pointer;
    transition: background 0.2s;
  }

  .info-section-header.clickable:hover {
    background: #e8e8e8;
  }

  .wizard-container[data-theme='dark'] .info-section-header.clickable:hover {
    background: #243044;
  }

  .info-section-header.bracket-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .bracket-label-badge {
    padding: 0.125rem 0.5rem;
    background: #667eea;
    color: white;
    border-radius: 4px;
    font-size: 0.65rem;
  }

  .bracket-section.bracket-a .info-section-header {
    background: linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%);
    color: #92400e;
  }

  .bracket-section.bracket-b .info-section-header {
    background: linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%);
    color: #374151;
  }

  .bracket-section.bracket-c .info-section-header {
    background: linear-gradient(135deg, #fed7aa 0%, #fb923c 100%);
    color: #9a3412;
  }

  .bracket-section.bracket-d .info-section-header {
    background: linear-gradient(135deg, #dbeafe 0%, #60a5fa 100%);
    color: #1e40af;
  }

  .bracket-section.bracket-e .info-section-header {
    background: linear-gradient(135deg, #dcfce7 0%, #4ade80 100%);
    color: #166534;
  }

  .bracket-section.bracket-f .info-section-header {
    background: linear-gradient(135deg, #fce7f3 0%, #f472b6 100%);
    color: #9d174d;
  }

  .bracket-section.bracket-g .info-section-header {
    background: linear-gradient(135deg, #e0e7ff 0%, #818cf8 100%);
    color: #3730a3;
  }

  .bracket-section.bracket-h .info-section-header {
    background: linear-gradient(135deg, #fef9c3 0%, #facc15 100%);
    color: #854d0e;
  }

  .bracket-section.bracket-i .info-section-header {
    background: linear-gradient(135deg, #ccfbf1 0%, #2dd4bf 100%);
    color: #115e59;
  }

  .bracket-section.bracket-j .info-section-header {
    background: linear-gradient(135deg, #fee2e2 0%, #f87171 100%);
    color: #991b1b;
  }

  .info-grid {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .id-grid {
    grid-template-columns: 80px 1fr;
  }

  .edition-field .input-field {
    text-align: center;
  }

  .location-grid {
    grid-template-columns: 1fr 1fr 1fr 115px;
  }

  .address-field {
    grid-column: 1 / -1;
  }

  .config-grid {
    grid-template-columns: 1fr 1fr;
  }

  .info-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .info-field.full-width {
    grid-column: 1 / -1;
  }

  .info-field label,
  .info-field .field-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #666;
    transition: color 0.3s;
  }

  .wizard-container[data-theme='dark'] .info-field label,
  .wizard-container[data-theme='dark'] .info-field .field-label {
    color: #8b9bb3;
  }

  /* Input Fields */
  .input-field {
    padding: 0.5rem 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.85rem;
    background: white;
    color: #1a1a1a;
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
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.15);
  }

  .input-field.compact {
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
  }

  .input-field.textarea {
    resize: vertical;
    min-height: 60px;
  }

  .optional {
    font-weight: normal;
    color: #9ca3af;
    font-size: 0.65rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.85rem;
    color: #374151;
  }

  .wizard-container[data-theme='dark'] .checkbox-label {
    color: #d1d5db;
  }

  /* Toggle buttons */
  .toggle-group {
    display: flex;
    gap: 0;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #ddd;
  }

  .wizard-container[data-theme='dark'] .toggle-group {
    border-color: #2d3748;
  }

  .toggle-btn {
    flex: 1;
    padding: 0.5rem 1rem;
    border: none;
    background: white;
    color: #666;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .wizard-container[data-theme='dark'] .toggle-btn {
    background: #1a2332;
    color: #8b9bb3;
  }

  .toggle-btn:not(:last-child) {
    border-right: 1px solid #ddd;
  }

  .wizard-container[data-theme='dark'] .toggle-btn:not(:last-child) {
    border-right-color: #2d3748;
  }

  .toggle-btn:hover:not(.active) {
    background: #f5f5f5;
  }

  .wizard-container[data-theme='dark'] .toggle-btn:hover:not(.active) {
    background: #243044;
  }

  .toggle-btn.active {
    background: #1a1a1a;
    color: white;
    font-weight: 500;
  }

  .wizard-container[data-theme='dark'] .toggle-btn.active {
    background: #667eea;
    color: white;
  }

  /* Search */
  .search-input-wrapper {
    position: relative;
  }

  .search-input {
    width: 100%;
  }

  .search-spinner {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
  }

  .search-results {
    margin-top: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    max-height: 200px;
    overflow-y: auto;
  }

  .wizard-container[data-theme='dark'] .search-results {
    border-color: #2d3748;
  }

  .search-result {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: white;
    cursor: pointer;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.85rem;
    color: #1a1a1a;
  }

  .wizard-container[data-theme='dark'] .search-result {
    background: #1a2332;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .search-result:last-child {
    border-bottom: none;
  }

  .search-result:hover {
    background: #f3f4f6;
  }

  .wizard-container[data-theme='dark'] .search-result:hover {
    background: #243044;
  }

  .result-badge {
    font-size: 0.65rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    background: #10b981;
    color: white;
  }

  .result-badge.guest {
    background: #f59e0b;
  }

  .result-add {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #10b981;
    color: white;
    font-weight: 600;
    font-size: 1rem;
    flex-shrink: 0;
  }

  .search-result:hover .result-add {
    background: #059669;
  }

  /* Participants Grid */
  .participants-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.5rem;
  }

  .participant-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0.6rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .wizard-container[data-theme='dark'] .participant-item {
    background: #1a2332;
    border-color: #2d3748;
  }

  .registered-badge {
    color: #10b981;
    margin-left: 0.25rem;
    font-size: 0.75rem;
  }

  .registered-badge.small {
    font-size: 0.7rem;
  }

  .remove-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #9ca3af;
    cursor: pointer;
    font-size: 1rem;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .remove-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .remove-btn.small {
    width: 18px;
    height: 18px;
    font-size: 0.9rem;
  }

  .remove-btn.tiny {
    width: 16px;
    height: 16px;
    font-size: 0.8rem;
    opacity: 0.5;
  }

  .remove-btn.tiny:hover {
    opacity: 1;
  }

  .empty-message {
    color: #9ca3af;
    font-size: 0.85rem;
    font-style: italic;
    padding: 1rem;
    text-align: center;
  }

  /* Add buttons */
  .add-batch-btn,
  .add-row-btn {
    margin-top: 0.5rem;
    padding: 0.4rem 0.75rem;
    background: transparent;
    border: 1px dashed #d1d5db;
    border-radius: 4px;
    color: #6b7280;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-batch-btn:hover,
  .add-row-btn:hover {
    border-color: #059669;
    color: #059669;
    background: rgba(5, 150, 105, 0.05);
  }

  /* Standings Table */
  .standings-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .standings-table th,
  .standings-table td {
    padding: 0.4rem 0.5rem;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }

  .wizard-container[data-theme='dark'] .standings-table th,
  .wizard-container[data-theme='dark'] .standings-table td {
    border-color: #2d3748;
  }

  .standings-table th {
    font-weight: 600;
    color: #6b7280;
    font-size: 0.7rem;
    text-transform: uppercase;
  }

  .position-cell {
    width: 35px;
    font-weight: 600;
    color: #374151;
  }

  .wizard-container[data-theme='dark'] .position-cell {
    color: #d1d5db;
  }

  .points-cell {
    font-weight: 600;
    color: #059669;
  }

  .number-input {
    width: 45px;
    text-align: center;
  }

  /* Match rows */
  .round-section {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .wizard-container[data-theme='dark'] .round-section {
    border-color: #2d3748;
  }

  .round-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }

  .round-section h4 {
    font-size: 0.8rem;
    color: #6b7280;
    margin: 0;
    font-weight: 600;
  }

  .round-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .add-match-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    color: #6b7280;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-match-btn:hover {
    border-color: #059669;
    color: #059669;
    background: rgba(5, 150, 105, 0.05);
  }

  .match-entry-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .wizard-container[data-theme='dark'] .match-entry-row {
    background: #1a2332;
    border-color: #2d3748;
  }

  .participant-select {
    flex: 1;
    min-width: 0;
    font-size: 0.8rem;
    padding: 0.4rem 0.5rem;
  }

  .score-inputs {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .score-input {
    width: 45px;
    text-align: center;
    padding: 0.4rem 0.25rem;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .score-separator {
    color: #9ca3af;
    font-weight: 600;
  }

  .empty-round-message {
    color: #9ca3af;
    font-size: 0.8rem;
    font-style: italic;
    text-align: center;
    padding: 0.5rem;
  }

  /* Review */
  .review-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .review-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .review-label {
    font-size: 0.7rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .review-value {
    font-weight: 500;
    font-size: 0.85rem;
    color: #1a1a1a;
  }

  .wizard-container[data-theme='dark'] .review-value {
    color: #e1e8ed;
  }

  .review-participants {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .review-participant {
    padding: 0.2rem 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .wizard-container[data-theme='dark'] .review-participant {
    background: #1a2332;
    border-color: #2d3748;
  }

  .review-groups-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .review-group {
    flex: 1;
    min-width: 120px;
  }

  .review-group h4,
  .review-bracket h4 {
    font-size: 0.8rem;
    margin-bottom: 0.5rem;
    color: #374151;
  }

  .wizard-container[data-theme='dark'] .review-group h4,
  .wizard-container[data-theme='dark'] .review-bracket h4 {
    color: #d1d5db;
  }

  .review-group ol {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.8rem;
  }

  .review-bracket {
    margin-bottom: 1rem;
  }

  .review-round {
    margin-bottom: 0.5rem;
    padding-left: 0.5rem;
  }

  .review-round strong {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .review-match {
    font-size: 0.8rem;
    padding: 0.2rem 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .review-match .winner {
    font-weight: 600;
    color: #10b981;
  }

  /* Navigation */
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
    min-height: 42px;
    min-width: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  /* No permission state */
  .no-permission {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 50vh;
    padding: 2rem;
    gap: 1rem;
  }

  .no-permission-icon {
    font-size: 3rem;
  }

  .no-permission h2 {
    font-size: 1.5rem;
    color: #1a1a1a;
    margin: 0;
  }

  .wizard-container[data-theme='dark'] .no-permission h2 {
    color: #e1e8ed;
  }

  .no-permission p {
    color: #6b7280;
    margin: 0;
  }

  .no-permission .hint {
    font-size: 0.875rem;
    opacity: 0.8;
  }

  .back-button {
    padding: 0.75rem 1.5rem;
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    text-decoration: none;
    margin-top: 1rem;
  }

  .back-button:hover {
    background: #5a6268;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .page-header {
      padding: 0.5rem 1rem;
    }

    .header-row {
      gap: 0.5rem;
    }

    .title-section h1 {
      font-size: 0.95rem;
    }

    .header-badges {
      display: none;
    }

    .progress-step {
      padding: 0.25rem 0.5rem;
    }

    .step-label {
      display: none;
    }

    .wizard-content {
      padding: 1rem;
    }

    .info-grid {
      grid-template-columns: 1fr !important;
    }

    .id-grid,
    .location-grid,
    .config-grid {
      grid-template-columns: 1fr;
    }

    .participants-grid {
      grid-template-columns: 1fr 1fr;
    }

    .review-groups-row {
      flex-direction: column;
    }

    .match-entry-row {
      flex-wrap: wrap;
    }

    .participant-select {
      width: 100%;
      flex: none;
      order: 1;
    }

    .participant-select:last-of-type {
      order: 3;
    }

    .score-inputs {
      order: 2;
      width: 100%;
      justify-content: center;
      margin: 0.5rem 0;
    }

    .match-entry-row .remove-btn {
      order: 4;
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
    }

    .match-entry-row {
      position: relative;
      padding-right: 2rem;
    }
  }

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
      font-size: 0.85rem;
    }

    .participants-grid {
      grid-template-columns: 1fr;
    }

    .wizard-navigation {
      flex-direction: column-reverse;
      padding: 0.5rem;
    }

    .nav-button {
      width: 100%;
    }
  }
</style>
