<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    createHistoricalTournament,
    createUpcomingTournament,
    completeUpcomingTournament,
    updateHistoricalTournament,
    canImportTournaments,
    type HistoricalTournamentInput,
    type HistoricalParticipantInput,
    type HistoricalGroupStageInput,
    type HistoricalFinalStageInput,
    type UpcomingTournamentInput
  } from '$lib/firebase/tournamentImport';
  import { searchUsers, getTournament } from '$lib/firebase/tournaments';
  import type { UserProfile } from '$lib/firebase/userProfile';
  import type { TournamentTier, TournamentParticipant, Tournament } from '$lib/types/tournament';
  import { getParticipantDisplayName } from '$lib/types/tournament';
  import PairSelector from '$lib/components/tournament/PairSelector.svelte';
  import CountrySelect from '$lib/components/CountrySelect.svelte';
  import VenueSelector from '$lib/components/tournament/VenueSelector.svelte';
  import { parseGroupStageText, serializeGroupStageData, getPlaceholderText, type ParseResult, type ParsedGroup } from '$lib/utils/groupStageParser';
  import {
    parseKnockoutStageText,
    serializeKnockoutStageData,
    convertToHistoricalBrackets,
    getKnockoutPlaceholderText,
    addByeMatchesToBrackets,
    type KnockoutParseResult
  } from '$lib/utils/knockoutStageParser';
  import * as m from '$lib/paraglide/messages.js';

  // Wizard state
  let currentStep = $state(1);
  const totalSteps = 4;

  // LocalStorage key for draft
  const STORAGE_KEY = 'tournamentImportDraft';

  // Toast state
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType = $state<'success' | 'error' | 'info' | 'warning'>('info');

  // Loading states
  let isLoading = $state(true);
  let isSaving = $state(false);
  let savingAsUpcoming = $state(false);
  let hasPermission = $state(false);

  // Edit mode state
  let editTournamentId = $state<string | null>(null);
  let editingTournament = $state<Tournament | null>(null);
  let isEditMode = $derived(!!editTournamentId);

  // Duplicate mode state
  let duplicateMode = $state(false);

  // Check permission on mount and load edit data if applicable
  onMount(async () => {
    hasPermission = await canImportTournaments();

    // Check for edit or duplicate mode
    const editId = page.url.searchParams.get('edit');
    const duplicateId = page.url.searchParams.get('duplicate');

    if (editId) {
      editTournamentId = editId;
      await loadTournamentForEdit(editId);
    } else if (duplicateId) {
      duplicateMode = true;
      await loadTournamentForDuplication(duplicateId);
    } else if (hasPermission) {
      loadDraft();
    }

    isLoading = false;
    if (!hasPermission) {
      showToastMessage(m.import_noPermissionError(), 'error');
    }
  });

  // Load tournament data for editing
  async function loadTournamentForEdit(tournamentId: string) {
    try {
      const tournament = await getTournament(tournamentId);
      if (!tournament) {
        showToastMessage(m.tournament_notFound(), 'error');
        goto('/admin/tournaments');
        return;
      }

      editingTournament = tournament;

      // Pre-populate Step 1: Basic Info
      name = tournament.name || '';
      edition = tournament.edition;
      address = tournament.address || '';
      city = tournament.city || '';
      country = tournament.country || 'España';
      tournamentDate = tournament.tournamentDate
        ? new Date(tournament.tournamentDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      gameType = tournament.gameType || 'singles';
      rankingEnabled = tournament.rankingConfig?.enabled || false;
      selectedTier = tournament.rankingConfig?.tier || 'CLUB';
      qualificationMode = tournament.groupStage?.qualificationMode || tournament.groupStage?.rankingSystem || 'WINS';
      description = tournament.description || '';
      externalLink = tournament.externalLink || '';
      posterUrl = tournament.posterUrl || '';
      isTest = tournament.isTest ?? false;

      // Pre-populate Step 2: Participants (if any)
      if (tournament.participants && tournament.participants.length > 0) {
        participants = tournament.participants.map(p => ({
          id: p.id,
          name: p.name,
          userId: p.userId,
          partnerName: p.partner?.name,
          partnerUserId: p.partner?.userId,
          isRegistered: p.type === 'REGISTERED',
          partner: p.partner
        }));
      }

      // Pre-populate Step 2: Group Stage (if any) - now combined with participants
      if (tournament.groupStage) {
        hasGroupStage = true;
        numGroups = tournament.groupStage.numGroups || tournament.groupStage.groups?.length || 2;
        if (tournament.groupStage.groups) {
          groups = tournament.groupStage.groups.map(g => ({
            name: g.name,
            standings: g.standings?.map(s => ({
              participantId: s.participantId,
              participantName: tournament.participants?.find(p => p.id === s.participantId)?.name || '',
              position: s.position,
              points: s.points || 0,
              total20s: s.total20s || 0
            })) || []
          }));

          // Serialize groups to textarea format for editing
          const groupsForSerialization = groups.map(g => ({
            name: g.name,
            standings: g.standings.map(s => ({
              participantName: s.participantName,
              points: s.points,
              total20s: s.total20s
            }))
          }));
          groupStageText = serializeGroupStageData(groupsForSerialization, gameType);
          parsePhase = 'preview'; // Show preview directly
        }
      } else {
        hasGroupStage = false;
        parsePhase = 'preview'; // No groups, go to preview
      }

      // Pre-populate Step 3: Final Stage (if any)
      if (tournament.finalStage?.parallelBrackets) {
        numBrackets = tournament.finalStage.parallelBrackets.length;
        brackets = tournament.finalStage.parallelBrackets.map(nb => ({
          name: nb.name,
          label: nb.label,
          sourcePositions: nb.sourcePositions || [],
          rounds: nb.bracket?.rounds?.map(r => ({
            id: crypto.randomUUID(),
            name: r.name,
            matches: r.matches?.map(match => ({
              id: crypto.randomUUID(),
              participantAId: match.participantA || '',
              participantAName: tournament.participants?.find(p => p.id === match.participantA)?.name || '',
              participantBId: match.participantB || '',
              participantBName: tournament.participants?.find(p => p.id === match.participantB)?.name || '',
              scoreA: match.totalPointsA || 0,
              scoreB: match.totalPointsB || 0,
              twentiesA: match.total20sA || 0,
              twentiesB: match.total20sB || 0,
              isWalkover: match.status === 'WALKOVER'
            })) || []
          })) || []
        }));

        // Serialize brackets to textarea format for editing
        const bracketsForSerialization = brackets.map(b => ({
          name: b.name,
          label: b.label,
          sourcePositions: b.sourcePositions,
          rounds: b.rounds.map(r => ({
            name: r.name,
            matches: r.matches.map(m => ({
              participantAName: m.participantAName,
              participantBName: m.participantBName,
              scoreA: m.scoreA,
              scoreB: m.scoreB
            }))
          }))
        }));
        knockoutStageText = serializeKnockoutStageData(bracketsForSerialization);
        knockoutParsePhase = 'preview';
        knockoutParseResult = {
          success: true,
          brackets: [],
          errors: [],
          warnings: [],
          totalMatches: brackets.reduce((sum, b) => sum + b.rounds.reduce((rSum, r) => rSum + r.matches.length, 0), 0),
          totalRounds: brackets.reduce((sum, b) => sum + b.rounds.length, 0)
        };
      }

      console.log('✅ Tournament loaded for editing:', tournament.name);
    } catch (error) {
      console.error('Error loading tournament for edit:', error);
      showToastMessage(m.import_error(), 'error');
      goto('/admin/tournaments');
    }
  }

  // Load tournament data for duplication (similar to edit but creates new tournament)
  async function loadTournamentForDuplication(tournamentId: string) {
    try {
      const tournament = await getTournament(tournamentId);
      if (!tournament) {
        showToastMessage(m.tournament_notFound(), 'error');
        goto('/admin/tournaments');
        return;
      }

      // Pre-populate Step 1: Basic Info (increment edition, reset date to today)
      name = tournament.name || '';
      edition = (tournament.edition || 0) + 1;  // Increment edition for the copy
      address = tournament.address || '';
      city = tournament.city || '';
      country = tournament.country || 'España';
      tournamentDate = new Date().toISOString().split('T')[0];  // Today's date for new tournament
      gameType = tournament.gameType || 'singles';
      rankingEnabled = tournament.rankingConfig?.enabled || false;
      selectedTier = tournament.rankingConfig?.tier || 'CLUB';
      qualificationMode = tournament.groupStage?.qualificationMode || tournament.groupStage?.rankingSystem || 'WINS';
      description = '';  // Clear notes for new tournament
      externalLink = tournament.externalLink || '';
      posterUrl = tournament.posterUrl || '';
      isTest = tournament.isTest ?? false;

      // Pre-populate Step 2: Participants (if any)
      if (tournament.participants && tournament.participants.length > 0) {
        participants = tournament.participants.map(p => ({
          id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,  // New IDs
          name: p.name,
          userId: p.userId,
          partnerName: p.partner?.name,
          partnerUserId: p.partner?.userId,
          isRegistered: p.type === 'REGISTERED',
          partner: p.partner ? {
            type: p.partner.type || 'GUEST',
            userId: p.partner.userId,
            name: p.partner.name,
            photoURL: p.partner.photoURL
          } : undefined
        }));
      }

      // Pre-populate Step 2: Group Stage structure (if any) - but clear results
      if (tournament.groupStage) {
        hasGroupStage = true;
        numGroups = tournament.groupStage.numGroups || tournament.groupStage.groups?.length || 2;
        // Clear groups - user will input new data via textarea
        groups = [];
        groupStageText = ''; // Clear text for fresh input
        parsePhase = 'input'; // Start in input mode for duplicate
      } else {
        hasGroupStage = false;
        parsePhase = 'preview'; // No groups, go to preview
      }

      // Pre-populate Step 3: Final Stage structure (if any) - clear for fresh input
      if (tournament.finalStage?.parallelBrackets) {
        numBrackets = tournament.finalStage.parallelBrackets.length;
        brackets = [];  // Clear brackets - user will input new data via textarea
        knockoutStageText = '';  // Clear text for fresh input
        knockoutParsePhase = 'input';  // Start in input mode for duplicate
      }

      console.log('✅ Tournament loaded for duplication:', tournament.name);
      showToastMessage(m.wizard_duplicate() + ': ' + tournament.name, 'info');
    } catch (error) {
      console.error('Error loading tournament for duplication:', error);
      showToastMessage(m.import_error(), 'error');
      goto('/admin/tournaments');
    }
  }

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
  let qualificationMode = $state<'WINS' | 'POINTS'>('WINS');
  let description = $state('');
  let externalLink = $state('');
  let posterUrl = $state('');
  let isTest = $state(false);

  // Step 2: Participants
  interface ParticipantEntry {
    id: string;
    name: string;
    userId?: string;
    partnerName?: string;
    partnerUserId?: string;
    isRegistered: boolean;
    // Partner for doubles
    partner?: {
      type: 'REGISTERED' | 'GUEST';
      userId?: string;
      name: string;
      photoURL?: string;
    };
  }

  let participants = $state<ParticipantEntry[]>([]);
  let searchQuery = $state('');
  let searchResults = $state<(UserProfile & { userId: string })[]>([]);
  let searchLoading = $state(false);
  let batchInput = $state('');
  let showBatchInput = $state(false);

  // Combined participants & groups input (new textarea-based approach)
  let groupStageText = $state('');
  let parsePhase = $state<'input' | 'preview'>('input');
  let parseResult = $state<ParseResult | null>(null);
  let isParsing = $state(false);
  let registeredUsersMap = $state<Map<string, { userId: string; name: string }>>(new Map());

  // Handler for PairSelector (doubles mode)
  function handlePairAdd(participant: Partial<TournamentParticipant>) {
    // Convert TournamentParticipant to ParticipantEntry
    const entry: ParticipantEntry = {
      id: participant.id || `p-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: participant.name || '',
      userId: participant.userId,
      isRegistered: participant.type === 'REGISTERED',
      partner: participant.partner
    };
    participants = [...participants, entry];
    saveDraft();
  }

  // Handler for VenueSelector
  function handleVenueSelect(venue: { address?: string; city: string; country: string }) {
    address = venue.address || '';
    city = venue.city;
    country = venue.country;
  }

  // Derived: userIds to exclude from pair member search
  let excludedUserIds = $derived(
    participants
      .filter(p => p.memberUserIds && p.memberUserIds.length > 0)
      .flatMap(p => p.memberUserIds!)
  );

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
    points: number;        // Classification points (2 per win, 1 per tie)
    total20s: number;
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
    id: string;
    name: string;
    matches: MatchEntry[];
  }

  interface MatchEntry {
    id: string;
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

  // Knockout stage textarea approach (new)
  let knockoutStageText = $state('');
  let knockoutParsePhase = $state<'input' | 'preview'>('input');
  let knockoutParseResult = $state<import('$lib/utils/knockoutStageParser').KnockoutParseResult | null>(null);
  let isParsingKnockout = $state(false);

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
            name: m.import_groupName({ n: i + 1 }),
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
          const typeLabel = gameType === 'singles' ? m.scoring_singles() : m.scoring_doubles();
          newBrackets.push({
            name: m.import_bracketNameWithType({ type: typeLabel, label }),
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
      description = data.description ?? '';
      externalLink = data.externalLink ?? '';
      posterUrl = data.posterUrl ?? '';
      isTest = data.isTest ?? false;

      // Step 2: Participants
      participants = data.participants ?? [];

      // Step 3: Group Stage
      hasGroupStage = data.hasGroupStage ?? true;
      numGroups = data.numGroups ?? 2;
      groups = data.groups ?? [];

      // Step 4: Final Stage
      numBrackets = data.numBrackets ?? 2;
      // Migrate old data to ensure all rounds/matches have IDs
      brackets = (data.brackets ?? []).map((b: BracketEntry) => ({
        ...b,
        rounds: (b.rounds ?? []).map(r => ({
          ...r,
          id: r.id || crypto.randomUUID(),
          matches: (r.matches ?? []).map(m => ({
            ...m,
            id: m.id || crypto.randomUUID()
          }))
        }))
      }));

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
        description,
        externalLink,
        posterUrl,
        isTest,

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

    // In doubles mode, don't search for individual players - just allow adding team names directly
    if (gameType === 'doubles') {
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
      const message = gameType === 'doubles'
        ? m.import_addedTeams({ count: newParticipants.length })
        : m.import_addedParticipants({ count: newParticipants.length });
      showToastMessage(message, 'success');
    }

    batchInput = '';
    showBatchInput = false;
    saveDraft();
  }

  // Parse group stage text and search for registered users
  async function handleParseGroupStage() {
    if (!groupStageText.trim()) return;

    isParsing = true;
    parseResult = null;
    registeredUsersMap.clear();

    try {
      // First parse the text (pass gameType for doubles support)
      const result = parseGroupStageText(groupStageText, gameType);

      if (!result.success) {
        parseResult = result;
        isParsing = false;
        return;
      }

      // Collect all unique participant names
      const allNames = new Set<string>();
      for (const group of result.groups) {
        for (const participant of group.participants) {
          allNames.add(participant.name);
        }
      }

      // Search for each name in Firebase to find registered users
      const newRegisteredMap = new Map<string, { oderId: string; name: string }>();

      for (const name of allNames) {
        try {
          const users = await searchUsers(name);
          // Find exact match (case-insensitive)
          const exactMatch = users.find(u =>
            (u.playerName || '').toLowerCase() === name.toLowerCase() ||
            (u.name || '').toLowerCase() === name.toLowerCase()
          );
          if (exactMatch && exactMatch.userId) {
            newRegisteredMap.set(name.toLowerCase(), {
              oderId: exactMatch.userId,
              name: exactMatch.playerName || exactMatch.name || name
            });
          }
        } catch (error) {
          console.warn(`Error searching for user ${name}:`, error);
        }
      }

      registeredUsersMap = newRegisteredMap;

      // Build participants array from parsed data
      const newParticipants: ParticipantEntry[] = [];
      const seenNames = new Set<string>();

      for (const group of result.groups) {
        for (const participant of group.participants) {
          const lowerName = participant.name.toLowerCase();
          if (seenNames.has(lowerName)) continue;
          seenNames.add(lowerName);

          const registered = registeredUsersMap.get(lowerName);

          // For doubles, use player1Name as the main name if available
          const mainName = gameType === 'doubles' && participant.player1Name
            ? participant.player1Name
            : (registered?.name || participant.name);

          const entry: ParticipantEntry = {
            id: `p-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            name: mainName,
            oderId: registered?.oderId,
            isRegistered: !!registered
          };

          // For doubles, add partner info
          if (gameType === 'doubles' && participant.player2Name) {
            entry.partnerName = participant.player2Name;
            // TODO: Could search for partner in registered users too
          }

          // If there's a team name, we could store it somewhere
          // For now, the display name is used for matching

          newParticipants.push(entry);
        }
      }

      participants = newParticipants;

      // Build groups array from parsed data
      const newGroups: GroupEntry[] = result.groups.map(g => ({
        name: g.name,
        standings: g.participants.map(p => {
          const participantEntry = newParticipants.find(
            np => np.name.toLowerCase() === p.name.toLowerCase() ||
                  (registeredUsersMap.get(p.name.toLowerCase())?.name || '').toLowerCase() === np.name.toLowerCase()
          );
          return {
            participantId: participantEntry?.id || '',
            participantName: participantEntry?.name || p.name,
            position: p.position,
            points: p.points,
            total20s: p.twenties
          };
        })
      }));

      groups = newGroups;
      numGroups = newGroups.length;
      hasGroupStage = true;

      parseResult = result;
      parsePhase = 'preview';
      saveDraft();

    } catch (error) {
      console.error('Error parsing group stage:', error);
      parseResult = {
        success: false,
        groups: [],
        errors: [m.import_parseError()],
        warnings: [],
        totalParticipants: 0
      };
    } finally {
      isParsing = false;
    }
  }

  // Handle skip group stage (no groups mode)
  function handleSkipGroupStage() {
    hasGroupStage = false;
    groups = [];
    parsePhase = 'preview';
    saveDraft();
  }

  // Go back to input phase to edit text
  function handleBackToInput() {
    parsePhase = 'input';
  }

  // Parse knockout stage text
  async function handleParseKnockoutStage() {
    if (!knockoutStageText.trim()) return;

    isParsingKnockout = true;
    knockoutParseResult = null;

    try {
      const result = parseKnockoutStageText(knockoutStageText);

      if (!result.success) {
        knockoutParseResult = result;
        isParsingKnockout = false;
        return;
      }

      // Convert parsed brackets to the internal format
      const historicalBrackets = convertToHistoricalBrackets(result.brackets);

      // Build the brackets array for the wizard
      const newBrackets: BracketEntry[] = historicalBrackets.map(hb => ({
        name: hb.name,
        label: hb.label,
        sourcePositions: hb.sourcePositions,
        rounds: hb.rounds.map(r => ({
          id: crypto.randomUUID(),
          name: r.name,
          matches: r.matches.map(m => ({
            id: crypto.randomUUID(),
            participantAId: '',  // Will be matched later or created as new
            participantAName: m.participantAName,
            participantBId: '',
            participantBName: m.participantBName,
            scoreA: m.scoreA ?? 0,
            scoreB: m.scoreB ?? 0,
            twentiesA: 0,
            twentiesB: 0,
            isWalkover: false
          }))
        }))
      }));

      // Calculate and add BYE matches for proper bracket structure
      const bracketsWithByes = addByeMatchesToBrackets(newBrackets);

      brackets = bracketsWithByes;
      numBrackets = bracketsWithByes.length;

      knockoutParseResult = result;
      knockoutParsePhase = 'preview';
      saveDraft();

    } catch (error) {
      console.error('Error parsing knockout stage:', error);
      knockoutParseResult = {
        success: false,
        brackets: [],
        errors: [m.import_parseError()],
        warnings: [],
        totalMatches: 0,
        totalRounds: 0
      };
    } finally {
      isParsingKnockout = false;
    }
  }

  // Go back to knockout input phase
  function handleBackToKnockoutInput() {
    knockoutParsePhase = 'input';
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
        points: 0,
        total20s: 0
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

  // Helper to get the next round name based on the previous round's name
  function getNextRoundName(prevRoundName: string): string {
    // Check for R32 patterns (all languages)
    if (
      prevRoundName.includes('32') ||
      prevRoundName.toLowerCase().includes('setzens') ||
      prevRoundName.toLowerCase().includes('dieciseis')
    ) {
      return m.import_round16();
    }
    // Check for R16 patterns (Octavos, Round of 16, Vuitens)
    if (
      prevRoundName.includes('16') ||
      prevRoundName.toLowerCase().includes('octav') ||
      prevRoundName.toLowerCase().includes('vuiten')
    ) {
      return m.import_quarterfinals();
    }
    // Check for Quarterfinals patterns (Cuartos, Quarterfinals, Quarts)
    if (
      prevRoundName.toLowerCase().includes('cuarto') ||
      prevRoundName.toLowerCase().includes('quarter') ||
      prevRoundName.toLowerCase().includes('quart')
    ) {
      return m.import_semifinals();
    }
    // Check for Semifinals patterns
    if (prevRoundName.toLowerCase().includes('semi')) {
      return m.import_final();
    }
    // Default: use match count logic
    return m.import_final();
  }

  // Add round to bracket
  function addRound(bracketIndex: number) {
    const currentRounds = brackets[bracketIndex].rounds.length;

    let numMatches: number;
    let roundName: string;

    if (currentRounds === 0) {
      // First round: calculate based on participants per bracket
      const participantsPerBracket = Math.ceil(participants.length / numBrackets);

      // Determine starting round based on participants
      // 2 → Final (1), 3-4 → Semis (2), 5-8 → Quarters (4), 9-16 → R16 (8), 17-32 → R32 (16)
      if (participantsPerBracket <= 2) {
        numMatches = 1;
        roundName = m.import_final();
      } else if (participantsPerBracket <= 4) {
        numMatches = 2;
        roundName = m.import_semifinals();
      } else if (participantsPerBracket <= 8) {
        numMatches = Math.min(4, Math.floor(participantsPerBracket / 2));
        roundName = m.import_quarterfinals();
      } else if (participantsPerBracket <= 16) {
        numMatches = Math.min(8, Math.floor(participantsPerBracket / 2));
        roundName = m.import_round16();
      } else {
        numMatches = Math.min(16, Math.floor(participantsPerBracket / 2));
        roundName = m.import_round32();
      }
    } else {
      // Subsequent rounds: half the previous round's matches
      const prevRound = brackets[bracketIndex].rounds[currentRounds - 1];
      const prevRoundMatches = prevRound?.matches.length || 2;
      numMatches = Math.max(1, Math.floor(prevRoundMatches / 2));

      // Determine round name based on previous round's name (logical progression)
      roundName = getNextRoundName(prevRound?.name || '');
    }

    // Create empty matches with unique IDs
    const roundId = crypto.randomUUID();
    const emptyMatches: MatchEntry[] = [];
    for (let i = 0; i < numMatches; i++) {
      emptyMatches.push({
        id: crypto.randomUUID(),
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
        id: roundId,
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
        id: crypto.randomUUID(),
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
    saveDraft();
  }

  // Remove round
  function removeRound(bracketIndex: number, roundIndex: number) {
    brackets[bracketIndex].rounds = brackets[bracketIndex].rounds.filter((_, i) => i !== roundIndex);
    saveDraft();
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
        // Combined participants & groups step
        if (parsePhase === 'input' && hasGroupStage) {
          errors.push(m.import_mustParseFirst());
        }
        if (participants.length < 2) errors.push(m.import_minParticipants());
        if (hasGroupStage) {
          for (let i = 0; i < groups.length; i++) {
            if (groups[i].standings.length < 2) {
              errors.push(m.import_minParticipantsGroup({ n: i + 1 }));
            }
          }
        }
        break;

      case 3:
        // Knockout stage - now uses textarea parsing
        if (knockoutParsePhase === 'input') {
          errors.push(m.import_mustParseFirst());
        } else {
          // Only check these if we're in preview phase
          if (!knockoutParseResult || !knockoutParseResult.success) {
            errors.push(m.import_parseError());
          }
          if (brackets.length === 0) {
            errors.push(m.import_noBracketsFound());
          }
          for (let i = 0; i < brackets.length; i++) {
            if (brackets[i].rounds.length === 0) {
              errors.push(m.import_minRoundsBracket({ label: brackets[i].label }));
            }
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
        qualificationMode,
        groups: groups.map(g => ({
          name: g.name,
          standings: g.standings.map(s => ({
            participantName: s.participantName || participants.find(p => p.id === s.participantId)?.name || '',
            position: s.position,
            points: s.points,
            total20s: s.total20s
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

    // Build input object - only include optional fields if they have values
    const input: HistoricalTournamentInput = {
      name,
      tournamentDate: new Date(tournamentDate).getTime(),
      city,
      country,
      gameType,
      rankingConfig: rankingEnabled
        ? { enabled: true, tier: selectedTier }
        : { enabled: false },
      phaseType: hasGroupStage ? 'TWO_PHASE' : 'ONE_PHASE',
      show20s: true,
      participants: participantInputs,
      finalStage: finalStageInput
    };

    // Add optional fields only if they have values
    if (edition !== undefined && edition !== null) {
      input.edition = edition;
    }
    if (address && address.trim()) {
      input.address = address.trim();
    }
    if (description && description.trim()) {
      input.description = description.trim();
    }
    if (externalLink && externalLink.trim()) {
      input.externalLink = externalLink.trim();
    }
    if (posterUrl && posterUrl.trim()) {
      input.posterUrl = posterUrl.trim();
    }
    if (isTest) {
      input.isTest = true;
    }
    if (groupStageInput) {
      input.groupStage = groupStageInput;
    }

    return input;
  }

  // Save as Upcoming (only Step 1 data, for future tournaments)
  async function saveAsUpcoming() {
    // Validate Step 1 fields only
    const errors = validateStep(1);
    if (errors.length > 0) {
      showToastMessage(errors[0], 'error');
      return;
    }

    savingAsUpcoming = true;
    try {
      // Build minimal tournament input for upcoming tournament (no game config)
      const input: UpcomingTournamentInput = {
        name: name.trim(),
        tournamentDate: new Date(tournamentDate).getTime(),
        city: city.trim(),
        country,
        gameType,
        rankingConfig: rankingEnabled
          ? { enabled: true, tier: selectedTier }
          : { enabled: false }
      };

      // Add optional fields only if they have values
      if (edition !== undefined && edition !== null) {
        input.edition = edition;
      }
      if (address && address.trim()) {
        input.address = address.trim();
      }
      if (description && description.trim()) {
        input.description = description.trim();
      }
      if (externalLink && externalLink.trim()) {
        input.externalLink = externalLink.trim();
      }
      if (posterUrl && posterUrl.trim()) {
        input.posterUrl = posterUrl.trim();
      }
      if (isTest) {
        input.isTest = true;
      }

      const tournamentId = await createUpcomingTournament(input);

      if (tournamentId) {
        clearDraft();
        showToastMessage(m.wizard_saveAsUpcomingSuccess(), 'success');
        setTimeout(() => {
          goto('/admin/tournaments');
        }, 500);
      } else {
        showToastMessage(m.import_error(), 'error');
      }
    } catch (error) {
      console.error('Error saving as upcoming:', error);
      showToastMessage(m.import_error(), 'error');
    } finally {
      savingAsUpcoming = false;
    }
  }

  // Save only basic info (Step 1) when editing
  let savingBasicInfo = $state(false);

  async function saveBasicInfoOnly() {
    const errors = validateStep(1);
    if (errors.length > 0) {
      showToastMessage(errors[0], 'error');
      return;
    }

    if (!editTournamentId) return;

    savingBasicInfo = true;
    try {
      const updates: Partial<HistoricalTournamentInput> & Record<string, unknown> = {
        name: name.trim(),
        tournamentDate: new Date(tournamentDate).getTime(),
        city: city.trim(),
        country,
        gameType,
        rankingConfig: rankingEnabled
          ? { enabled: true, tier: selectedTier }
          : { enabled: false },
        // Use Firestore dot notation for nested field update
        'groupStage.qualificationMode': qualificationMode
      };

      if (edition !== undefined && edition !== null) {
        updates.edition = edition;
      }
      if (address && address.trim()) {
        updates.address = address.trim();
      }
      if (description && description.trim()) {
        updates.description = description.trim();
      }
      if (externalLink && externalLink.trim()) {
        updates.externalLink = externalLink.trim();
      }
      if (posterUrl && posterUrl.trim()) {
        updates.posterUrl = posterUrl.trim();
      }
      updates.isTest = isTest;

      const success = await updateHistoricalTournament(editTournamentId, updates as Partial<HistoricalTournamentInput>);

      if (success) {
        showToastMessage(m.wizard_saveAsUpcomingSuccess(), 'success');
        setTimeout(() => {
          goto('/admin/tournaments');
        }, 500);
      } else {
        showToastMessage(m.import_error(), 'error');
      }
    } catch (error) {
      console.error('Error saving basic info:', error);
      showToastMessage(m.import_error(), 'error');
    } finally {
      savingBasicInfo = false;
    }
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
      console.log('🔍 DEBUG - Tournament input:', JSON.stringify(input, null, 2));

      let success: boolean | string | null;

      if (isEditMode && editTournamentId) {
        // Update existing tournament (completing an upcoming tournament)
        success = await completeUpcomingTournament(editTournamentId, input);
        if (success) {
          clearDraft();
          showToastMessage(m.import_success(), 'success');
          setTimeout(() => {
            goto(`/tournaments/${editTournamentId}`);
          }, 1500);
        } else {
          showToastMessage(m.import_error(), 'error');
        }
      } else {
        // Create new historical tournament
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
      }
    } catch (e) {
      console.error('Import error:', e);
      showToastMessage(m.import_error(), 'error');
    } finally {
      isSaving = false;
    }
  }

  // Get participant name by ID (handles doubles with teamName)
  function getParticipantName(id: string): string {
    const participant = participants.find(p => p.id === id);
    if (!participant) return '';
    return getParticipantDisplayName(participant as any, gameType === 'doubles');
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
              {isEditMode ? m.tournament_completeConfiguration() : m.import_title()}:
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
              {#if isEditMode}
                <span class="info-badge upcoming-badge">{m.tournament_upcoming()}</span>
              {:else}
                <span class="info-badge imported-badge">{m.import_imported()}</span>
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
            class:clickable={true}
            onclick={() => goToStep(i + 1)}
          >
            <div class="step-number">{i + 1}</div>
            <div class="step-label">
              {#if i === 0}{m.wizard_stepInfo()}
              {:else if i === 1}{m.import_participantsAndGroups()}
              {:else if i === 2}{m.import_knockoutStage()}
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
                  placeholder="Ej: Barcelona Crokinole Open"
                  class="input-field"
                />
              </div>
            </div>
          </div>

          <!-- Ubicación y Fecha -->
          <div class="info-section">
            <div class="info-section-header">{m.wizard_locationDate()}</div>

            <div class="venue-selector-wrapper">
              <VenueSelector
                address={address}
                city={city}
                country={country}
                onselect={handleVenueSelect}
                theme={$adminTheme}
              />
            </div>

            <!-- Date field -->
            <div class="info-grid date-grid">
              <div class="info-field">
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

              <div class="info-field">
                <span class="field-label">{m.wizard_classificationType()}</span>
                <div class="classification-row">
                  <div class="toggle-group">
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
                  <span class="classification-hint">
                    {qualificationMode === 'WINS' ? m.wizard_classificationWinsHint() : m.wizard_classificationPointsHint()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Descripción, External Link y Poster -->
          <div class="info-section">
            <div class="info-grid two-col">
              <div class="info-field">
                <span class="field-label">{m.wizard_description()}</span>
                <textarea
                  id="description"
                  bind:value={description}
                  placeholder={m.wizard_description()}
                  class="input-field textarea"
                  rows="4"
                ></textarea>
              </div>
              <div class="info-field">
                <span class="field-label">{m.import_externalLink()}</span>
                <input
                  id="externalLink"
                  type="url"
                  bind:value={externalLink}
                  placeholder="https://..."
                  class="input-field"
                />
                <div class="field-spacer"></div>
                <span class="field-label">{m.wizard_posterUrl?.() ?? 'Imagen del torneo'}</span>
                <input
                  id="posterUrl"
                  type="url"
                  bind:value={posterUrl}
                  placeholder="https://..."
                  class="input-field"
                />
              </div>
            </div>
          </div>

          <!-- Test Tournament -->
          <div class="test-field">
            <label class="option-check test-check">
              <input type="checkbox" bind:checked={isTest} />
              <span class="test-label">
                {m.tournament_isTest()}
                <span class="test-hint">{m.tournament_isTestHint()}</span>
              </span>
            </label>
          </div>

        </div>

      {:else if currentStep === 2}
        <!-- Step 2: Participants & Groups (Combined) -->
        <div class="step-container">
          <h2>{m.import_participantsAndGroups()}</h2>

          {#if parsePhase === 'input'}
            <!-- Input Phase: Two-column layout -->
            <div class="group-input-layout">
              <!-- Left column: Textarea -->
              <div class="input-column">
                <textarea
                  bind:value={groupStageText}
                  placeholder={getPlaceholderText(gameType)}
                  class="input-field textarea group-stage-textarea"
                ></textarea>

                {#if parseResult && !parseResult.success}
                  <div class="parse-errors">
                    {#each parseResult.errors as error}
                      <div class="parse-error">{error}</div>
                    {/each}
                  </div>
                {/if}

                <div class="parse-actions">
                  <button
                    class="analyze-btn"
                    onclick={handleParseGroupStage}
                    disabled={isParsing || !groupStageText.trim()}
                  >
                    {#if isParsing}
                      <LoadingSpinner size="small" />
                      <span>{m.import_searchingUsers()}</span>
                    {:else}
                      <span>{m.import_parse()}</span>
                    {/if}
                  </button>

                  <button class="skip-btn" onclick={handleSkipGroupStage}>
                    {m.import_skipGroupStage()}
                  </button>
                </div>
              </div>

              <!-- Right column: Format help -->
              <div class="help-column">
                <div class="help-card">
                  <div class="help-title">Formato</div>
                  <div class="help-content">
                    <p>Cada grupo empieza con su <strong>nombre</strong>, seguido de los participantes:</p>
                    <pre class="format-example">Group 1
Harry Rowe,63,90
Chris Robinson,58,70
Tom Hodgetts,51,77

Group 2
Dan Rowe,61,128
Antonio Cuaresma,49,115</pre>
                    <div class="format-legend">
                      <div class="legend-item">
                        <span class="legend-label">Formato:</span>
                        <code>Nombre,Puntos,20s</code>
                      </div>
                      <div class="legend-item">
                        <span class="legend-label">Separador:</span>
                        <span>Línea en blanco entre grupos</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          {:else}
            <!-- Preview Phase: Show parsed data -->
            <div class="preview-header">
              <button class="btn-back" onclick={handleBackToInput}>
                ← {m.import_editInput()}
              </button>
            </div>

            {#if hasGroupStage && parseResult?.success}
              <div class="preview-summary">
                <span class="summary-item">
                  <strong>{groups.length}</strong> {groups.length === 1 ? 'grupo' : 'grupos'}
                </span>
                <span class="summary-divider">·</span>
                <span class="summary-item">
                  <strong>{participants.length}</strong> participantes
                </span>
                <span class="summary-divider">·</span>
                <span class="summary-item registered-count">
                  <strong>{participants.filter(p => p.isRegistered).length}</strong> registrados
                </span>
              </div>

              <!-- Preview Groups -->
              {#each groups as group}
                <div class="info-section preview-group">
                  <div class="info-section-header">{group.name}</div>
                  <div class="preview-table-wrapper">
                    <table class="preview-table">
                      <thead>
                        <tr>
                          <th class="col-pos">#</th>
                          <th class="col-name">{m.common_name()}</th>
                          <th class="col-num">{m.import_pointsShort()}</th>
                          <th class="col-num">{m.import_twentiesShort()}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each group.standings as standing, i}
                          {@const participant = participants.find(p => p.id === standing.participantId)}
                          <tr class:zebra={i % 2 === 1}>
                            <td class="position-cell">{standing.position}</td>
                            <td class="name-cell">
                              <span class="participant-name">{standing.participantName}</span>
                              {#if participant?.isRegistered}
                                <span class="registered-badge" title="Usuario registrado">✓</span>
                              {/if}
                            </td>
                            <td class="num-cell">{standing.points}</td>
                            <td class="num-cell">{standing.total20s}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>
              {/each}

            {:else if !hasGroupStage}
              <!-- No group stage mode -->
              <div class="info-section">
                <div class="no-groups-message">
                  <p>{m.import_skipGroupStageHint()}</p>
                  <p class="participant-count">{participants.length} participantes añadidos</p>
                </div>
              </div>

              <!-- Show participants list for no-group mode -->
              {#if participants.length > 0}
                <div class="info-section">
                  <div class="info-section-header">{m.import_participantsCount({ count: participants.length })}</div>
                  <div class="participants-grid preview-participants">
                    {#each sortedParticipants as participant}
                      <div class="participant-item" class:registered={participant.isRegistered}>
                        <span class="participant-name">{participant.name}</span>
                        {#if participant.isRegistered}
                          <span class="registered-badge">✓</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
          {/if}
        </div>

      {:else if currentStep === 3}
        <!-- Step 3: Knockout Stage -->
        <div class="step-container">
          <h2>{m.import_knockoutStage()}</h2>

          {#if knockoutParsePhase === 'input'}
            <!-- Input Phase: Textarea for pasting knockout data -->
            <div class="info-section">
              <div class="info-section-header">{m.import_pasteKnockoutData()}</div>
              <p class="input-hint">{m.import_pasteKnockoutDataHint()}</p>
              <textarea
                class="group-stage-textarea"
                bind:value={knockoutStageText}
                placeholder={getKnockoutPlaceholderText(true)}
                rows="16"
              ></textarea>

              <button
                class="analyze-btn"
                onclick={handleParseKnockoutStage}
                disabled={isParsingKnockout || !knockoutStageText.trim()}
              >
                {#if isParsingKnockout}
                  <span class="spinner"></span>
                  {m.import_parsing()}
                {:else}
                  {m.import_parse()}
                {/if}
              </button>
            </div>

            <!-- Show errors/warnings if any -->
            {#if knockoutParseResult && !knockoutParseResult.success}
              <div class="parse-errors">
                {#each knockoutParseResult.errors as error}
                  <div class="parse-error">{error}</div>
                {/each}
              </div>
            {/if}

          {:else}
            <!-- Preview Phase: Show parsed brackets -->
            <div class="info-section">
              <div class="info-section-header-row">
                <span>{m.import_knockoutParseSummary({ brackets: brackets.length, rounds: knockoutParseResult?.totalRounds || 0, matches: knockoutParseResult?.totalMatches || 0 })}</span>
                <button class="edit-link" onclick={handleBackToKnockoutInput}>{m.import_editInput()}</button>
              </div>
            </div>

            <!-- Brackets Preview -->
            {#each brackets as bracket}
              <div class="bracket-card bracket-{bracket.label.toLowerCase()}">
                <div class="bracket-card-header">
                  <div class="bracket-title">
                    <span class="bracket-label-pill">{bracket.label}</span>
                    <span class="bracket-name">{bracket.name}</span>
                  </div>
                </div>

                <div class="bracket-content">
                  {#each bracket.rounds as round}
                    <div class="round-card">
                      <div class="round-card-header">
                        <span class="round-name">{round.name}</span>
                        <span class="round-match-count">{round.matches.length} {round.matches.length === 1 ? 'partido' : 'partidos'}</span>
                      </div>

                      <div class="matches-preview">
                        {#each round.matches as match}
                          {@const hasWinner = match.scoreA !== match.scoreB}
                          <div class="match-preview-row" class:complete={hasWinner}>
                            <span class="match-player" class:winner={match.scoreA > match.scoreB && hasWinner}>{match.participantAName || '—'}</span>
                            <span class="match-score">{match.scoreA} - {match.scoreB}</span>
                            <span class="match-player" class:winner={match.scoreB > match.scoreA && hasWinner}>{match.participantBName || '—'}</span>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}

            <!-- Warnings if any -->
            {#if knockoutParseResult?.warnings && knockoutParseResult.warnings.length > 0}
              <div class="parse-warnings">
                {#each knockoutParseResult.warnings as warning}
                  <div class="parse-warning">{warning}</div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>

      {:else if currentStep === 4}
        <!-- Step 5: Review - Professional & Compact -->
        <div class="step-container review-step">
          <!-- Tournament Header Card -->
          <div class="review-header-card">
            <div class="review-title-row">
              <h3>{name}{#if edition} <span class="edition">#{edition}</span>{/if}</h3>
              <span class="review-type-badge">{gameType === 'singles' ? 'Singles' : 'Dobles'}</span>
            </div>
            <div class="review-meta">
              <span class="meta-item">📅 {tournamentDate}</span>
              <span class="meta-item">📍 {#if address}{address}, {/if}{city}</span>
              <span class="meta-item">🏳️ {country}</span>
              <span class="meta-item">👥 {participants.length}</span>
            </div>
          </div>

          <!-- Participants Chips -->
          <div class="review-section">
            <div class="review-section-title">{m.import_participants()}</div>
            <div class="review-chips">
              {#each sortedParticipants as p}
                <span class="review-chip" class:registered={p.isRegistered}>{p.name}</span>
              {/each}
            </div>
          </div>

          <!-- Group Stage Tables -->
          {#if hasGroupStage && groups.length > 0}
            <div class="review-section">
              <div class="review-section-title">{m.import_groupStage()}</div>
              <div class="review-groups-grid">
                {#each groups as group, groupIndex}
                  <div class="review-group-card">
                    <div class="review-group-header">{m.import_groupName({ n: groupIndex + 1 })}</div>
                    <table class="review-standings-table">
                      <thead>
                        <tr><th>#</th><th>{m.tournament_playerColumn()}</th><th>Pts</th><th>20s</th></tr>
                      </thead>
                      <tbody>
                        {#each group.standings as standing, idx}
                          {@const pName = standing.participantName || getParticipantName(standing.participantId)}
                          <tr class:zebra={idx % 2 === 1}>
                            <td class="pos">{standing.position || idx + 1}</td>
                            <td class="pname">{pName || '—'}</td>
                            <td class="num">{standing.points || 0}</td>
                            <td class="num">{standing.total20s || 0}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Knockout Stage Brackets -->
          <div class="review-section">
            <div class="review-section-title">{m.import_knockoutStage()}</div>
            <div class="review-brackets-container">
              {#each brackets as bracket}
                {@const typeLabel = gameType === 'singles' ? m.scoring_singles() : m.scoring_doubles()}
                <div class="review-bracket-card">
                  <div class="review-bracket-header">{m.import_bracketNameWithType({ type: typeLabel, label: bracket.label })}</div>
                  <div class="review-bracket-rounds">
                    {#each bracket.rounds as round}
                      <div class="review-round-col">
                        <div class="review-round-label">{round.name}</div>
                        <div class="review-matches-col">
                          {#each round.matches as match}
                            {@const pA = match.participantAName || getParticipantName(match.participantAId)}
                            {@const pB = match.participantBName || getParticipantName(match.participantBId)}
                            {@const isBye = (!pA || !pB) && (match.scoreA > 0 || match.scoreB > 0)}
                            {@const hasResult = (match.scoreA !== match.scoreB) || isBye}
                            <div class="review-match-box" class:complete={hasResult} class:bye={isBye}>
                              <div class="rm-row" class:winner={match.scoreA > match.scoreB && hasResult}>
                                <span class="rm-name">{pA || 'BYE'}</span>
                                <span class="rm-score">{match.scoreA}</span>
                              </div>
                              <div class="rm-row" class:winner={match.scoreB > match.scoreA && hasResult}>
                                <span class="rm-name">{pB || 'BYE'}</span>
                                <span class="rm-score">{match.scoreB}</span>
                              </div>
                              {#if isBye}<span class="bye-tag">BYE</span>{/if}
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Import Notes -->
          {#if description}
            <div class="review-section">
              <div class="review-section-title">Notas</div>
              <div class="review-notes-box">{description}</div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Navigation -->
    <div class="wizard-navigation">
      <button class="nav-button secondary" onclick={prevStep} disabled={currentStep === 1}>
        ← {m.wizard_previous()}
      </button>

      <div class="nav-right">
        {#if isEditMode && currentStep === 1}
          <button
            class="nav-button save-only"
            onclick={saveBasicInfoOnly}
            disabled={savingBasicInfo}
          >
            {#if savingBasicInfo}
              {m.wizard_saving()}
            {:else}
              {m.wizard_saveChanges()}
            {/if}
          </button>
        {/if}

        {#if !isEditMode && currentStep === 1}
          <button
            class="nav-button save-only"
            onclick={saveAsUpcoming}
            disabled={savingAsUpcoming}
          >
            {#if savingAsUpcoming}
              {m.wizard_saving()}
            {:else}
              {m.wizard_saveChanges()}
            {/if}
          </button>
        {/if}

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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .page-header {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .back-btn {
    background: #0f1419;
    color: #8b9bb3;
    border-color: #2d3748;
  }

  .back-btn:hover {
    transform: translateX(-2px);
    border-color: var(--primary);
    color: var(--primary);
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .title-section h1 {
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
    background: var(--primary);
    color: white;
  }

  .info-badge.imported-badge {
    background: #fef3c7;
    color: #92400e;
  }

  :is([data-theme='dark'], [data-theme='violet']) .info-badge.imported-badge {
    background: #78350f;
    color: #fcd34d;
  }

  .info-badge.upcoming-badge {
    background: #f3e8ff;
    color: #7c3aed;
  }

  :is([data-theme='dark'], [data-theme='violet']) .info-badge.upcoming-badge {
    background: #4c1d95;
    color: #c4b5fd;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .progress-step:not(:last-child)::after {
    background: #374151;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .progress-step.active:not(:last-child)::after {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .step-number {
    background: #1f2937;
    border-color: #4b5563;
    color: #6b7280;
  }

  .progress-step.active .step-number {
    border-color: #059669;
    color: #059669;
    background: #ecfdf5;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .progress-step.active .step-number {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .progress-step.current .step-number {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .step-label {
    color: #6b7280;
  }

  .progress-step.active .step-label {
    color: #374151;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .progress-step.active .step-label {
    color: #d1d5db;
  }

  .progress-step.current .step-label {
    color: #059669;
    font-weight: 600;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .progress-step.current .step-label {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .wizard-content {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .wizard-content::-webkit-scrollbar-thumb {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .step-container h2 {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .wizard-intro {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .info-section {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .info-section-header {
    background: #1e252d;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  /* Input hint */
  .input-hint {
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.7rem;
    color: #718096;
    background: #f7fafc;
    border-bottom: 1px solid #e8e8e8;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .input-hint {
    color: #8b9bb3;
    background: #1a2028;
    border-bottom-color: #2d3748;
  }

  .info-section-header.clickable {
    cursor: pointer;
    transition: background 0.2s;
  }

  .info-section-header.clickable:hover {
    background: #e8e8e8;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .info-section-header.clickable:hover {
    background: #243044;
  }

  .info-section-header.bracket-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .bracket-label-badge {
    padding: 0.125rem 0.5rem;
    background: var(--primary);
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
    background: linear-gradient(135deg, #dbeafe 0%, var(--primary) 100%);
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

  .venue-selector-wrapper {
    margin-bottom: 0.75rem;
  }

  .address-field {
    grid-column: 1 / -1;
  }

  .config-grid {
    grid-template-columns: 1fr 1fr;
  }

  .two-col {
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

  .field-spacer {
    height: 0.75rem;
  }

  .info-field label,
  .info-field .field-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #666;
    transition: color 0.3s;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .info-field label,
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .info-field .field-label {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .input-field {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .input-field:focus {
    outline: none;
    border-color: var(--primary);
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

  /* Group input layout - two columns same height */
  .group-input-layout {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 1rem;
    align-items: stretch;
  }

  @media (max-width: 768px) {
    .group-input-layout {
      grid-template-columns: 1fr;
    }
    .help-column {
      order: -1;
    }
    .group-stage-textarea {
      min-height: 280px;
    }
  }

  .input-column {
    display: flex;
    flex-direction: column;
  }

  .group-stage-textarea {
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.8rem;
    line-height: 1.4;
    flex: 1;
    width: 100%;
    resize: none;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 0.75rem;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .group-stage-textarea {
    background: #1f2937;
    border-color: #374151;
    color: #e5e7eb;
  }

  .group-stage-textarea:focus {
    outline: none;
    border-color: var(--primary, #3b82f6);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  .help-column {
    display: flex;
    flex-direction: column;
  }

  .help-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .help-card {
    background: #1f2937;
    border-color: #374151;
  }

  .help-title {
    background: #f3f4f6;
    padding: 0.6rem 0.75rem;
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .help-title {
    background: #374151;
    color: #9ca3af;
    border-color: #4b5563;
  }

  .help-content {
    padding: 0.75rem;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .help-content p {
    font-size: 0.75rem;
    color: #6b7280;
    margin: 0 0 0.5rem 0;
    line-height: 1.4;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .help-content p {
    color: #9ca3af;
  }

  .format-example {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 0.5rem;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.7rem;
    line-height: 1.35;
    white-space: pre;
    overflow-x: auto;
    margin-bottom: 0.75rem;
    color: #374151;
    flex: 1;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .format-example {
    background: #111827;
    border-color: #374151;
    color: #d1d5db;
  }

  .format-legend {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .legend-item {
    font-size: 0.7rem;
    color: #6b7280;
    display: flex;
    gap: 0.35rem;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .legend-item {
    color: #9ca3af;
  }

  .legend-label {
    font-weight: 500;
  }

  .legend-item code {
    background: #e5e7eb;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.65rem;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .legend-item code {
    background: #374151;
  }

  .parse-errors {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    margin-top: 0.5rem;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .parse-errors {
    background: #7f1d1d20;
    border-color: #7f1d1d;
  }

  .parse-error {
    color: #dc2626;
    font-size: 0.75rem;
    padding: 0.15rem 0;
  }

  .parse-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .analyze-btn {
    background: var(--primary, #3b82f6);
    color: white;
    border: none;
    padding: 0 1.25rem;
    height: 2.25rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    transition: background 0.15s;
    min-width: 18rem;
  }

  .analyze-btn:hover:not(:disabled) {
    background: var(--primary-hover, #2563eb);
  }

  .analyze-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .skip-btn {
    background: transparent;
    color: #6b7280;
    border: 1px solid #d1d5db;
    padding: 0 1rem;
    height: 2.25rem;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .skip-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .skip-btn {
    color: #9ca3af;
    border-color: #4b5563;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .skip-btn:hover {
    background: #374151;
    color: #d1d5db;
  }

  /* Preview phase styles */
  .preview-header {
    margin-bottom: 1rem;
  }

  .btn-back {
    background: transparent;
    color: var(--primary, #3b82f6);
    border: none;
    padding: 0.5rem 0;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-back:hover {
    text-decoration: underline;
  }

  .preview-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #f0fdf4;
    border-radius: 6px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .preview-summary {
    background: #16a34a20;
  }

  .summary-divider {
    color: #9ca3af;
  }

  .registered-count {
    color: #16a34a;
  }

  .preview-group {
    margin-bottom: 1rem;
  }

  .preview-table-wrapper {
    overflow-x: auto;
  }

  .preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .preview-table th,
  .preview-table td {
    padding: 0.5rem 0.75rem;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .preview-table th,
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .preview-table td {
    border-bottom-color: #374151;
  }

  .preview-table th {
    background: #f9fafb;
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #6b7280;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .preview-table th {
    background: #1f2937;
    color: #9ca3af;
  }

  .preview-table tbody tr:hover {
    background: #f9fafb;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .preview-table tbody tr:hover {
    background: #1f293750;
  }

  .preview-table tbody tr.zebra {
    background: #f9fafb50;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .preview-table tbody tr.zebra {
    background: #1f293730;
  }

  .preview-table .position-cell {
    width: 40px;
    text-align: center;
    font-weight: 600;
    color: #6b7280;
  }

  .preview-table .name-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .preview-table .num-cell {
    width: 60px;
    text-align: center;
  }

  .registered-badge {
    background: #16a34a;
    color: white;
    font-size: 0.65rem;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
  }

  .no-groups-message {
    text-align: center;
    padding: 2rem;
    color: #6b7280;
  }

  .preview-participants {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .checkbox-label {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .toggle-group {
    border-color: #2d3748;
  }

  .toggle-btn {
    flex: 1;
    padding: 0.5rem 1.25rem;
    border: none;
    background: white;
    color: #666;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .toggle-btn {
    background: #1a2332;
    color: #8b9bb3;
  }

  .toggle-btn:not(:last-child) {
    border-right: 1px solid #ddd;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .toggle-btn:not(:last-child) {
    border-right-color: #2d3748;
  }

  .toggle-btn:hover:not(.active) {
    background: #f5f5f5;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .toggle-btn:hover:not(.active) {
    background: #243044;
  }

  .toggle-btn.active {
    background: #1a1a1a;
    color: white;
    font-weight: 500;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .toggle-btn.active {
    background: var(--primary);
    color: white;
  }

  /* Classification row */
  .classification-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .classification-hint {
    font-size: 0.75rem;
    color: #6b7280;
    font-style: italic;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .classification-hint {
    color: #9ca3af;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .search-results {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .search-result {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .search-result:hover {
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
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 0.6rem;
  }

  .participant-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.8rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.85rem;
    border-left: 3px solid transparent;
    color: #1a1a1a;
  }

  .participant-item.registered {
    border-left-color: #10b981;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .participant-item {
    background: #1a2332;
    border-color: #2d3748;
    border-left-color: transparent;
    color: #e1e8ed;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .participant-item.registered {
    border-left-color: #10b981;
  }

  .registered-badge {
    color: #10b981;
    margin-left: 0.25rem;
    font-size: 0.75rem;
  }

  .registered-badge.small {
    font-size: 0.7rem;
  }

  .pair-badge {
    margin-right: 0.25rem;
    font-size: 0.8rem;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .empty-message {
    color: #6b7280;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-batch-btn,
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-row-btn {
    border-color: #4b5563;
    color: #9ca3af;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-batch-btn:hover,
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-row-btn:hover {
    border-color: #10b981;
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
  }

  /* Standings Table */
  .standings-wrapper {
    padding: 0;
  }

  .standings-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .standings-table th,
  .standings-table td {
    padding: 0.5rem 0.75rem;
    text-align: left;
  }

  .standings-table th {
    font-weight: 600;
    color: #6b7280;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: #f8f9fa;
    border-bottom: 2px solid #e5e7eb;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .standings-table th {
    background: #1a2332;
    border-color: #374151;
    color: #8b9bb3;
  }

  .standings-table tbody tr {
    transition: background-color 0.15s;
  }

  .standings-table tbody tr:hover {
    background: rgba(102, 126, 234, 0.04);
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .standings-table tbody tr:hover {
    background: rgba(102, 126, 234, 0.08);
  }

  .standings-table tbody tr.zebra {
    background: #f1f5f9;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .standings-table tbody tr.zebra {
    background: rgba(255, 255, 255, 0.04);
  }

  .standings-table tbody tr.zebra:hover {
    background: #e2e8f0;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .standings-table tbody tr.zebra:hover {
    background: rgba(102, 126, 234, 0.12);
  }

  .standings-table td {
    border-bottom: 1px solid #f0f0f0;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .standings-table td {
    border-color: #2d3748;
  }

  .standings-table .col-pos {
    width: 40px;
    text-align: center;
  }

  .standings-table .col-name {
    width: auto;
  }

  .standings-table .col-num {
    width: 80px;
    text-align: center;
  }

  .standings-table .col-action {
    width: 36px;
    text-align: center;
  }

  .position-cell {
    font-weight: 700;
    color: #374151;
    text-align: center;
    font-size: 0.85rem;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .position-cell {
    color: #d1d5db;
  }

  .participant-dropdown {
    width: 100%;
    min-width: 140px;
  }

  .number-input {
    width: 60px;
    text-align: center;
  }

  /* Group header with inline add button */
  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .add-row-btn-inline {
    padding: 0.25rem 0.6rem;
    background: transparent;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    color: #6b7280;
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-row-btn-inline:hover {
    border-color: #059669;
    color: #059669;
    background: rgba(5, 150, 105, 0.05);
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-row-btn-inline {
    border-color: #4b5563;
    color: #9ca3af;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-row-btn-inline:hover {
    border-color: #10b981;
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
  }

  .empty-group-hint {
    text-align: center;
    padding: 1.5rem;
    color: #9ca3af;
    font-size: 0.8rem;
    font-style: italic;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .empty-group-hint {
    color: #6b7280;
  }

  /* Match rows */
  .round-section {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .round-section {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .round-section h4 {
    color: #9ca3af;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-match-btn {
    border-color: #4b5563;
    color: #9ca3af;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-match-btn:hover {
    border-color: #10b981;
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .match-entry-row {
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .score-separator {
    color: #6b7280;
  }

  .empty-round-message {
    color: #9ca3af;
    font-size: 0.8rem;
    font-style: italic;
    text-align: center;
    padding: 0.5rem;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .empty-round-message {
    color: #6b7280;
  }

  /* Step 4: Knockout Stage Redesign */
  .knockout-config {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    color: #374151;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .knockout-config {
    color: #d1d5db;
  }

  .brackets-select {
    width: 70px;
    padding: 0.35rem 0.5rem;
  }

  .bracket-card {
    background: #fafafa;
    border: 1px solid #e8e8e8;
    border-radius: 8px;
    margin-bottom: 1rem;
    overflow: hidden;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .bracket-card {
    background: #161b22;
    border-color: #2d3748;
  }

  .bracket-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.75rem;
    background: #f0f0f0;
    border-bottom: 1px solid #e8e8e8;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .bracket-card-header {
    background: #1e252d;
    border-color: #2d3748;
  }

  .bracket-card.bracket-a .bracket-card-header { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); }
  .bracket-card.bracket-b .bracket-card-header { background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%); }
  .bracket-card.bracket-c .bracket-card-header { background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%); }
  .bracket-card.bracket-d .bracket-card-header { background: linear-gradient(135deg, #dbeafe 0%, #93c5fd 100%); }
  .bracket-card.bracket-e .bracket-card-header { background: linear-gradient(135deg, #dcfce7 0%, #86efac 100%); }

  .bracket-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .bracket-label-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: rgba(0,0,0,0.15);
    color: #1a1a1a;
    border-radius: 50%;
    font-weight: 700;
    font-size: 0.75rem;
  }

  .bracket-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: #1a1a1a;
  }

  .add-round-btn-compact {
    padding: 0.25rem 0.6rem;
    background: rgba(255,255,255,0.6);
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 4px;
    color: #374151;
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-round-btn-compact:hover {
    background: rgba(255,255,255,0.9);
    border-color: #059669;
    color: #059669;
  }

  .bracket-content {
    padding: 0.75rem;
  }

  .empty-bracket-hint {
    text-align: center;
    padding: 2rem 1rem;
    color: #9ca3af;
    font-size: 0.85rem;
    font-style: italic;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .empty-bracket-hint {
    color: #6b7280;
  }

  .round-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    margin-bottom: 0.75rem;
    overflow: hidden;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .round-card {
    background: #1a2332;
    border-color: #374151;
  }

  .round-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: #f8f9fa;
    border-bottom: 1px solid #e5e7eb;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .round-card-header {
    background: #0f1419;
    border-color: #374151;
  }

  .round-name {
    font-weight: 600;
    font-size: 0.8rem;
    color: #374151;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .round-name {
    color: #e1e8ed;
  }

  .round-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .round-match-count {
    font-size: 0.7rem;
    color: #9ca3af;
  }

  .round-delete {
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

  .round-delete:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .matches-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.5rem;
    padding: 0.75rem;
  }

  /* Knockout Preview Styles */
  .matches-preview {
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .match-preview-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    font-size: 0.8rem;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .match-preview-row {
    background: #0f1419;
    border-color: #2d3748;
  }

  .match-preview-row.complete {
    border-color: #10b981;
  }

  .match-preview-row .match-player {
    color: #374151;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .match-preview-row .match-player:first-child {
    text-align: right;
  }

  .match-preview-row .match-player:last-child {
    text-align: left;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .match-preview-row .match-player {
    color: #e1e8ed;
  }

  .match-preview-row .match-player.winner {
    font-weight: 600;
    color: #059669;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .match-preview-row .match-player.winner {
    color: #10b981;
  }

  .match-preview-row .match-score {
    font-weight: 700;
    color: #6b7280;
    font-size: 0.85rem;
    min-width: 50px;
    text-align: center;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .match-preview-row .match-score {
    color: #9ca3af;
  }

  .match-card {
    display: flex;
    align-items: stretch;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .match-card {
    background: #0f1419;
    border-color: #2d3748;
  }

  .match-card.complete {
    border-color: #10b981;
  }

  .match-players {
    flex: 1;
    padding: 0.4rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .player-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .player-row.winner .player-select {
    font-weight: 600;
    color: #059669;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .player-row.winner .player-select {
    color: #10b981;
  }

  .player-select {
    flex: 1;
    min-width: 0;
    padding: 0.3rem 0.4rem;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 0.75rem;
    background: white;
    color: #1a1a1a;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .player-select {
    background: #1a2332;
    border-color: #374151;
    color: #e1e8ed;
  }

  .player-select:focus {
    outline: none;
    border-color: var(--primary);
  }

  .score-field {
    width: 38px;
    padding: 0.3rem 0.25rem;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    background: white;
    color: #1a1a1a;
    flex-shrink: 0;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .score-field {
    background: #1a2332;
    border-color: #374151;
    color: #e1e8ed;
  }

  .score-field:focus {
    outline: none;
    border-color: var(--primary);
  }

  .vs-divider {
    font-size: 0.6rem;
    color: #9ca3af;
    text-align: center;
    padding: 0 0.25rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .match-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    background: transparent;
    border: none;
    color: #cbd5e1;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s;
  }

  .match-remove:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .add-match-card {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 70px;
    background: transparent;
    border: 2px dashed #d1d5db;
    border-radius: 6px;
    color: #9ca3af;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-match-card:hover {
    border-color: #059669;
    color: #059669;
    background: rgba(5, 150, 105, 0.03);
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-match-card {
    border-color: #4b5563;
    color: #6b7280;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .add-match-card:hover {
    border-color: #10b981;
    color: #10b981;
    background: rgba(16, 185, 129, 0.05);
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-label {
    color: #8b9bb3;
  }

  .review-value {
    font-weight: 500;
    font-size: 0.85rem;
    color: #1a1a1a;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-value {
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
    color: #374151;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-participant {
    background: #1a2332;
    border-color: #2d3748;
    color: #e1e8ed;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-group h4,
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-bracket h4 {
    color: #d1d5db;
  }

  .review-group ol {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.8rem;
    color: #374151;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-group ol {
    color: #d1d5db;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-round strong {
    color: #9ca3af;
  }

  .review-match {
    font-size: 0.8rem;
    padding: 0.2rem 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    color: #374151;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-match {
    color: #d1d5db;
  }

  .review-match .winner {
    font-weight: 600;
    color: #10b981;
  }

  /* ========== NEW REVIEW STEP 5 STYLES ========== */
  .review-step { padding-bottom: 1rem; }

  /* Header Card - Clean Corporate Style */
  .review-header-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
    border-left: 4px solid #10b981;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-header-card {
    background: #1a2332;
    border-color: #2d3748;
    border-left-color: #10b981;
  }
  .review-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .review-title-row h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: #1a1a1a;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-title-row h3 {
    color: #f1f5f9;
  }
  .review-title-row .edition {
    font-weight: 500;
    color: #6b7280;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-title-row .edition {
    color: #9ca3af;
  }
  .review-type-badge {
    background: #f0fdf4;
    color: #15803d;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    border: 1px solid #bbf7d0;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-type-badge {
    background: #14532d;
    color: #86efac;
    border-color: #166534;
  }
  .review-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.8rem;
    color: #6b7280;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-meta {
    color: #9ca3af;
  }
  .meta-item { white-space: nowrap; }

  /* Sections */
  .review-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 0.75rem;
    overflow: hidden;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-section {
    background: #1a2332;
    border-color: #2d3748;
  }
  .review-section-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.6rem 0.75rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    color: #6b7280;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-section-title {
    background: #0f172a;
    border-color: #2d3748;
    color: #9ca3af;
  }

  /* Participant Chips */
  .review-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding: 0.75rem;
  }
  .review-chip {
    padding: 0.2rem 0.5rem;
    background: #f3f4f6;
    border-radius: 4px;
    font-size: 0.7rem;
    color: #4b5563;
  }
  .review-chip.registered {
    background: #dbeafe;
    color: #1e40af;
    border-left: 2px solid var(--primary);
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-chip {
    background: #374151;
    color: #d1d5db;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-chip.registered {
    background: #1e3a5f;
    color: #93c5fd;
    border-left-color: var(--primary);
  }

  /* Groups Grid */
  .review-groups-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
    padding: 0.75rem;
  }
  .review-group-card {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-group-card {
    border-color: #374151;
  }
  .review-group-header {
    background: #f3f4f6;
    padding: 0.4rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-group-header {
    background: #1e293b;
    color: #e5e7eb;
  }
  .review-standings-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.7rem;
  }
  .review-standings-table th {
    background: #f9fafb;
    padding: 0.3rem 0.4rem;
    text-align: left;
    font-weight: 500;
    color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-standings-table th {
    background: #0f172a;
    color: #9ca3af;
    border-color: #374151;
  }
  .review-standings-table td {
    padding: 0.3rem 0.4rem;
    color: #374151;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-standings-table td {
    color: #d1d5db;
  }
  .review-standings-table tr.zebra td {
    background: #f9fafb;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-standings-table tr.zebra td {
    background: #0f172a;
  }
  .review-standings-table tr.qualified td {
    background: #ecfdf5;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-standings-table tr.qualified td {
    background: #064e3b;
  }
  .review-standings-table .pos { width: 24px; text-align: center; font-weight: 600; }
  .review-standings-table .pname { font-weight: 500; }
  .review-standings-table .num { width: 32px; text-align: center; color: #6b7280; }

  /* Brackets Container */
  .review-brackets-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem;
  }
  .review-bracket-card {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-bracket-card {
    border-color: #374151;
  }
  .review-bracket-header {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: white;
  }
  .review-bracket-card:nth-child(2) .review-bracket-header {
    background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  }
  .review-bracket-card:nth-child(3) .review-bracket-header {
    background: linear-gradient(135deg, #a16207 0%, #854d0e 100%);
  }

  /* Bracket Rounds - Horizontal Layout */
  .review-bracket-rounds {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    overflow-x: auto;
    background: #fafafa;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-bracket-rounds {
    background: #0f172a;
  }
  .review-round-col {
    flex: 0 0 auto;
    min-width: 140px;
  }
  .review-round-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    padding: 0.25rem 0;
    margin-bottom: 0.4rem;
    border-bottom: 2px solid var(--primary);
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-round-label {
    color: #9ca3af;
    border-color: var(--primary);
  }
  .review-matches-col {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Match Box */
  .review-match-box {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-match-box {
    background: #1e293b;
    border-color: #374151;
  }
  .review-match-box.complete {
    border-color: #10b981;
  }
  .review-match-box.bye {
    border-style: dashed;
    opacity: 0.8;
  }
  .rm-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.3rem 0.5rem;
    font-size: 0.7rem;
    border-bottom: 1px solid #f3f4f6;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .rm-row {
    border-color: #374151;
  }
  .rm-row:last-child { border-bottom: none; }
  .rm-row.winner {
    background: #ecfdf5;
    font-weight: 600;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .rm-row.winner {
    background: #064e3b;
  }
  .rm-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #374151;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .rm-name {
    color: #d1d5db;
  }
  .rm-row.winner .rm-name {
    color: #059669;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .rm-row.winner .rm-name {
    color: #10b981;
  }
  .rm-score {
    font-weight: 600;
    min-width: 18px;
    text-align: center;
    color: #6b7280;
  }
  .rm-row.winner .rm-score {
    color: #059669;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .rm-row.winner .rm-score {
    color: #10b981;
  }
  .bye-tag {
    position: absolute;
    top: 50%;
    right: 4px;
    transform: translateY(-50%);
    background: #fef3c7;
    color: #92400e;
    font-size: 0.55rem;
    font-weight: 700;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .bye-tag {
    background: #78350f;
    color: #fcd34d;
  }

  /* Notes Box */
  .review-notes-box {
    padding: 0.75rem;
    font-size: 0.8rem;
    color: #6b7280;
    font-style: italic;
  }
  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .review-notes-box {
    color: #9ca3af;
  }

  /* Responsive */
  @media (max-width: 500px) {
    .review-meta { flex-direction: column; gap: 0.25rem; }
    .review-groups-grid { grid-template-columns: 1fr; }
    .review-round-col { min-width: 120px; }
  }

  /* Navigation */
  .wizard-navigation {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    flex-shrink: 0;
  }

  .nav-right {
    display: flex;
    gap: 0.5rem;
    align-items: center;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .nav-button.secondary {
    background: #1a2332;
    color: #8b9bb3;
    border-color: #2d3748;
  }

  .nav-button.secondary:hover:not(:disabled) {
    background: #f5f5f5;
    border-color: #999;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .nav-button.secondary:hover:not(:disabled) {
    background: #2d3748;
  }

  .nav-button.primary {
    background: #1a1a1a;
    color: #f5f5f5;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .nav-button.primary {
    background: #e5e7eb;
    color: #1a1a1a;
  }

  .nav-button.primary:hover:not(:disabled) {
    background: #2a2a2a;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .nav-button.primary:hover:not(:disabled) {
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

  .nav-button.save-only {
    background: #7c3aed;
    color: white;
  }

  .nav-button.save-only:hover:not(:disabled) {
    background: #6d28d9;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .nav-button.save-only {
    background: #8b5cf6;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .nav-button.save-only:hover:not(:disabled) {
    background: #a78bfa;
  }

  .nav-button.save-only:disabled {
    opacity: 0.6;
    cursor: wait;
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

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .no-permission h2 {
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

    .nav-right {
      display: flex;
      flex-direction: column;
      width: 100%;
      gap: 0.5rem;
    }

    .nav-button {
      width: 100%;
    }
  }

  /* Test tournament field */
  .test-field {
    margin-top: 1rem;
    padding: 1rem;
    background: #fefce8;
    border: 1px solid #fef08a;
    border-radius: 8px;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .test-field {
    background: #422006;
    border-color: #854d0e;
  }

  .option-check {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    cursor: pointer;
  }

  .option-check input[type="checkbox"] {
    width: 18px;
    height: 18px;
    margin-top: 2px;
    cursor: pointer;
    accent-color: #f59e0b;
  }

  .test-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-weight: 500;
    color: #92400e;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .test-label {
    color: #fcd34d;
  }

  .test-hint {
    font-size: 0.8rem;
    font-weight: 400;
    color: #a16207;
  }

  .wizard-container:is([data-theme='dark'], [data-theme='violet']) .test-hint {
    color: #fbbf24;
  }
</style>
