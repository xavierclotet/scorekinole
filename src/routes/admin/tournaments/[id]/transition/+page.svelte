<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import QualifierSelection from '$lib/components/tournament/QualifierSelection.svelte';
  import { adminTheme } from '$lib/stores/theme';
  import * as m from '$lib/paraglide/messages.js';
  import TimeProgressBar from '$lib/components/TimeProgressBar.svelte';
  import TimeBreakdownModal from '$lib/components/TimeBreakdownModal.svelte';
  import { calculateRemainingTime, calculateTimeBreakdown, calculateTournamentTimeEstimate, type TimeBreakdown } from '$lib/utils/tournamentTime';
  import { getTournament } from '$lib/firebase/tournaments';
  import { transitionTournament } from '$lib/utils/tournamentStateMachine';
  import {
    updateQualifiers,
    autoSelectQualifiers,
    getQualifiedParticipants,
    isValidBracketSize,
    getBracketRoundNames,
    calculateSuggestedQualifiers
  } from '$lib/firebase/tournamentTransition';
  import { recalculateStandings } from '$lib/firebase/tournamentGroups';
  import { generateBracket, generateSplitBrackets } from '$lib/firebase/tournamentBracket';
  import { updateTournament, updateTournamentPublic } from '$lib/firebase/tournaments';
  import type { Tournament } from '$lib/types/tournament';

  let tournament = $state<Tournament | null>(null);
  let loading = $state(true);
  let error = $state(false);
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType = $state<'success' | 'error' | 'info' | 'warning'>('info');
  let isProcessing = $state(false);
  let isRecalculating = $state(false);
  let showBracketPreview = $state(false);
  let showTimeBreakdown = $state(false);
  let timeBreakdown = $state<TimeBreakdown | null>(null);

  // Qualifier selections per group
  let groupQualifiers = $state<Map<number, string[]>>(new Map());

  // For SPLIT_DIVISIONS: separate Gold and Silver selections
  let goldParticipants = $state<string[]>([]);
  let silverParticipants = $state<string[]>([]);

  // Final stage configuration - Early rounds (octavos, cuartos) - default: 4 rounds
  let earlyRoundsGameMode = $state<'points' | 'rounds'>('rounds');
  let earlyRoundsPointsToWin = $state(7);
  let earlyRoundsToPlay = $state(4);

  // Final stage configuration - Semifinals
  let semifinalGameMode = $state<'points' | 'rounds'>('points');
  let semifinalPointsToWin = $state(7);
  let semifinalRoundsToPlay = $state(4);
  let semifinalMatchesToWin = $state(1);

  // Final stage configuration - Final - default: 9 points
  let finalGameMode = $state<'points' | 'rounds'>('points');
  let finalPointsToWin = $state(9);
  let finalRoundsToPlay = $state(4);
  let finalMatchesToWin = $state(1);

  // Silver bracket configuration (for SPLIT_DIVISIONS) - per phase like Gold
  // Silver: all phases default to 4 rounds (less competitive than Gold)
  // Silver Early Rounds
  let silverEarlyRoundsGameMode = $state<'points' | 'rounds'>('rounds');
  let silverEarlyRoundsPointsToWin = $state(7);
  let silverEarlyRoundsToPlay = $state(4);
  // Silver Semifinals
  let silverSemifinalGameMode = $state<'points' | 'rounds'>('rounds');
  let silverSemifinalPointsToWin = $state(7);
  let silverSemifinalRoundsToPlay = $state(4);
  let silverSemifinalMatchesToWin = $state(1);
  // Silver Final
  let silverFinalGameMode = $state<'points' | 'rounds'>('rounds');
  let silverFinalPointsToWin = $state(7);
  let silverFinalRoundsToPlay = $state(4);
  let silverFinalMatchesToWin = $state(1);

  // Global top N value for all groups
  let topNPerGroup = $state(2);

  // Track unresolved ties per group
  let groupTiesStatus = $state<Map<number, boolean>>(new Map());
  let hasAnyUnresolvedTies = $derived(Array.from(groupTiesStatus.values()).some(hasTies => hasTies));

  let tournamentId = $derived($page.params.id);
  let timeRemaining = $derived(tournament ? calculateRemainingTime(tournament) : null);
  let isSplitDivisions = $derived(tournament?.finalStage?.mode === 'SPLIT_DIVISIONS');

  // For single bracket mode
  let totalQualifiers = $derived(Array.from(groupQualifiers.values()).flat().length);
  let isValidSize = $derived(isValidBracketSize(totalQualifiers));

  // For split divisions mode
  let goldCount = $derived(goldParticipants.length);
  let silverCount = $derived(silverParticipants.length);
  let isValidGoldSize = $derived(isValidBracketSize(goldCount));
  let isValidSilverSize = $derived(isValidBracketSize(silverCount));

  // Can proceed logic - also check for unresolved ties
  let canProceed = $derived(!hasAnyUnresolvedTies && (isSplitDivisions
    ? (goldCount >= 2 && isValidGoldSize && silverCount >= 2 && isValidSilverSize)
    : (totalQualifiers >= 2 && isValidSize)));

  let bracketRoundNames = $derived(totalQualifiers > 0 ? getBracketRoundNames(totalQualifiers) : []);
  let goldBracketRoundNames = $derived(goldCount > 0 ? getBracketRoundNames(goldCount) : []);
  let silverBracketRoundNames = $derived(silverCount > 0 ? getBracketRoundNames(silverCount) : []);
  let numGroups = $derived(tournament?.groupStage?.groups?.length || 1);
  let suggestedQualifiers = $derived(tournament ? calculateSuggestedQualifiers(tournament.participants.length, numGroups) : { total: 4, perGroup: 2 });

  // Initialize topNPerGroup based on mode
  let topNInitialized = $state(false);
  $effect(() => {
    if (!topNInitialized && tournament && suggestedQualifiers.perGroup > 0) {
      const isSingleBracketSingleGroup = tournament.finalStage?.mode !== 'SPLIT_DIVISIONS' && numGroups === 1;
      const isSplitDiv = tournament.finalStage?.mode === 'SPLIT_DIVISIONS';

      if (isSingleBracketSingleGroup) {
        // SINGLE_BRACKET with single group: all participants
        topNPerGroup = tournament.participants?.length || suggestedQualifiers.perGroup;
      } else if (isSplitDiv) {
        // SPLIT_DIVISIONS: half participants per group
        const participantsPerGroup = Math.ceil((tournament.participants?.length || 0) / numGroups);
        topNPerGroup = Math.ceil(participantsPerGroup / 2);
      } else {
        // Multiple groups: use suggested
        topNPerGroup = suggestedQualifiers.perGroup;
      }
      topNInitialized = true;
    }
  });

  // Helper to translate internal round names to display names
  function translateRoundName(name: string): string {
    const key = name.toLowerCase();
    const map: Record<string, () => string> = {
      final: m.admin_final,
      semifinal: m.admin_semifinals,
      semifinals: m.admin_semifinals,
    };
    if (map[key]) return map[key]();
    return name.charAt(0).toUpperCase() + name.slice(1);
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

  async function handleRecalculateStandings() {
    if (!tournamentId || isRecalculating) return;
    isRecalculating = true;
    try {
      console.log('=== RECALCULATING STANDINGS ===');
      console.log('Tournament ID:', tournamentId);
      await recalculateStandings(tournamentId);
      // Reload tournament to get updated standings
      tournament = await getTournament(tournamentId);
      console.log('=== STANDINGS RECALCULATED ===');
      console.log('Updated groups:', tournament?.groupStage?.groups);
      toastMessage = m.admin_standingsRecalculated();
      toastType = 'success';
      showToast = true;
    } catch (err) {
      console.error('Error recalculating standings:', err);
      toastMessage = 'Error recalculating standings';
      toastType = 'error';
      showToast = true;
    } finally {
      isRecalculating = false;
    }
  }

  onMount(async () => {
    await loadTournament();
  });

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
      } else if (tournament.status !== 'TRANSITION') {
        // Redirect if not in transition
        toastMessage = m.admin_tournamentNotInTransition();
        toastType = 'warning';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}`), 1500);
      } else {
        // Recalculate standings to ensure head-to-head records are up to date
        await recalculateStandings(tournamentId);
        // Reload tournament after recalculation
        tournament = await getTournament(tournamentId);
        if (!tournament) {
          error = true;
          loading = false;
          return;
        }

        // Initialize group qualifiers from current state
        // Ensure groups is an array (Firestore may return object)
        const groups = Array.isArray(tournament.groupStage?.groups)
          ? tournament.groupStage.groups
          : Object.values(tournament.groupStage?.groups || {});

        // Determine default selection based on mode
        const isSingleBracketSingleGroup = tournament.finalStage?.mode !== 'SPLIT_DIVISIONS' && groups.length === 1;
        const isSplitDiv = tournament.finalStage?.mode === 'SPLIT_DIVISIONS';

        // Build qualifiers map and check for ties - create new Maps to ensure reactivity
        const newQualifiersMap = new Map<number, string[]>();
        const newTiesStatusMap = new Map<number, boolean>();
        groups.forEach((group: any, index: number) => {
          const standings = Array.isArray(group.standings) ? group.standings : Object.values(group.standings || {});

          // Check for unresolved ties in this group
          const hasUnresolvedTies = standings.some((s: any) => s.tiedWith && s.tiedWith.length > 0);
          newTiesStatusMap.set(index, hasUnresolvedTies);
          const qualified = standings
            .filter((s: any) => s.qualifiedForFinal)
            .map((s: any) => s.participantId);

          // If no qualifiers saved, auto-select based on mode
          if (qualified.length === 0 && standings.length > 0) {
            const sortedStandings = [...standings].sort((a: any, b: any) => a.position - b.position);

            let defaultSelection: string[];
            if (isSingleBracketSingleGroup) {
              // SINGLE_BRACKET with single group: select ALL participants
              defaultSelection = sortedStandings.map((s: any) => s.participantId);
            } else if (isSplitDiv) {
              // SPLIT_DIVISIONS: select top half (they go to Gold bracket)
              const halfCount = Math.ceil(standings.length / 2);
              defaultSelection = sortedStandings.slice(0, halfCount).map((s: any) => s.participantId);
            } else {
              // Multiple groups: use topNPerGroup
              defaultSelection = sortedStandings.slice(0, topNPerGroup).map((s: any) => s.participantId);
            }
            newQualifiersMap.set(index, defaultSelection);
          } else {
            newQualifiersMap.set(index, qualified);
          }
        });
        groupQualifiers = newQualifiersMap; // Assign new Map to trigger reactivity
        groupTiesStatus = newTiesStatusMap; // Initialize tie status from loaded standings

        // Load final stage config from tournament goldBracket.config if it exists
        const goldConfig = tournament.finalStage?.goldBracket?.config;
        const silverConfig = tournament.finalStage?.silverBracket?.config;

        if (goldConfig) {
          // Early rounds config (octavos, cuartos)
          earlyRoundsGameMode = goldConfig.earlyRounds?.gameMode || 'rounds';
          earlyRoundsPointsToWin = goldConfig.earlyRounds?.pointsToWin || 7;
          earlyRoundsToPlay = goldConfig.earlyRounds?.roundsToPlay || 4;

          // Semifinals config
          semifinalGameMode = goldConfig.semifinal?.gameMode || 'points';
          semifinalPointsToWin = goldConfig.semifinal?.pointsToWin || 7;
          semifinalRoundsToPlay = goldConfig.semifinal?.roundsToPlay || 4;
          semifinalMatchesToWin = goldConfig.semifinal?.matchesToWin || 1;

          // Final config
          finalGameMode = goldConfig.final?.gameMode || 'points';
          finalPointsToWin = goldConfig.final?.pointsToWin || 9;
          finalRoundsToPlay = goldConfig.final?.roundsToPlay || 4;
          finalMatchesToWin = goldConfig.final?.matchesToWin || 1;

          // Silver bracket per-phase config (for SPLIT_DIVISIONS)
          if (tournament.finalStage?.mode === 'SPLIT_DIVISIONS' && silverConfig) {
            // Silver Early Rounds
            silverEarlyRoundsGameMode = silverConfig.earlyRounds?.gameMode || 'rounds';
            silverEarlyRoundsPointsToWin = silverConfig.earlyRounds?.pointsToWin || 7;
            silverEarlyRoundsToPlay = silverConfig.earlyRounds?.roundsToPlay || 4;
            // Silver Semifinals
            silverSemifinalGameMode = silverConfig.semifinal?.gameMode || 'rounds';
            silverSemifinalPointsToWin = silverConfig.semifinal?.pointsToWin || 7;
            silverSemifinalRoundsToPlay = silverConfig.semifinal?.roundsToPlay || 4;
            silverSemifinalMatchesToWin = silverConfig.semifinal?.matchesToWin || 1;
            // Silver Final
            silverFinalGameMode = silverConfig.final?.gameMode || 'rounds';
            silverFinalPointsToWin = silverConfig.final?.pointsToWin || 7;
            silverFinalRoundsToPlay = silverConfig.final?.roundsToPlay || 4;
            silverFinalMatchesToWin = silverConfig.final?.matchesToWin || 1;
          }
        } else {
          // Default values - early rounds: 4 rounds, semis: 7 points, final: 9 points
          earlyRoundsGameMode = 'rounds';
          earlyRoundsPointsToWin = 7;
          earlyRoundsToPlay = 4;
          semifinalGameMode = 'points';
          semifinalPointsToWin = 7;
          semifinalRoundsToPlay = 4;
          semifinalMatchesToWin = 1;
          finalGameMode = 'points';
          finalPointsToWin = 9;
          finalRoundsToPlay = 4;
          finalMatchesToWin = 1;
        }

        // Note: Distribution for SPLIT_DIVISIONS is handled reactively via computedDistribution
      }
    } catch (err) {
      console.error('Error loading tournament:', err);
      error = true;
    } finally {
      loading = false;
    }
  }

  function handleQualifierUpdate(groupIndex: number, qualifiedIds: string[]) {
    // Create a new Map to properly trigger Svelte reactivity
    const newMap = new Map(groupQualifiers);
    newMap.set(groupIndex, qualifiedIds);
    groupQualifiers = newMap;
  }

  function handleTiesStatusChanged(groupIndex: number, hasUnresolvedTies: boolean) {
    // Track tie status per group
    const newMap = new Map(groupTiesStatus);
    newMap.set(groupIndex, hasUnresolvedTies);
    groupTiesStatus = newMap;
  }

  async function handleStandingsChanged(groupIndex: number, newStandings: any[]) {
    // Save the updated standings to Firebase
    if (!tournament || !tournament.groupStage?.groups) return;

    try {
      const groups = [...tournament.groupStage.groups];
      groups[groupIndex] = {
        ...groups[groupIndex],
        standings: newStandings
      };

      await updateTournamentPublic(tournamentId, {
        groupStage: {
          ...tournament.groupStage,
          groups
        }
      });

      // Update local tournament object
      tournament = {
        ...tournament,
        groupStage: {
          ...tournament.groupStage,
          groups
        }
      };

      console.log(`[Transition] Standings updated for group ${groupIndex}`);
    } catch (err) {
      console.error('Error saving standings:', err);
      toastMessage = 'Error saving standings';
      toastType = 'error';
      showToast = true;
    }
  }

  async function handleGenerateBracket() {
    if (!tournamentId || !tournament || !canProceed) return;

    isProcessing = true;

    try {
      // First save qualifiers (for single bracket mode)
      if (!isSplitDivisions) {
        for (const [groupIndex, qualifiedIds] of groupQualifiers.entries()) {
          await updateQualifiers(tournamentId, groupIndex, qualifiedIds);
        }

        // Build bracket config with per-phase settings (new structure)
        const bracketConfig = {
          earlyRounds: {
            gameMode: earlyRoundsGameMode,
            pointsToWin: earlyRoundsGameMode === 'points' ? earlyRoundsPointsToWin : undefined,
            roundsToPlay: earlyRoundsGameMode === 'rounds' ? earlyRoundsToPlay : undefined,
            matchesToWin: 1 // Early rounds are always Bo1
          },
          semifinal: {
            gameMode: semifinalGameMode,
            pointsToWin: semifinalGameMode === 'points' ? semifinalPointsToWin : undefined,
            roundsToPlay: semifinalGameMode === 'rounds' ? semifinalRoundsToPlay : undefined,
            matchesToWin: semifinalMatchesToWin
          },
          final: {
            gameMode: finalGameMode,
            pointsToWin: finalGameMode === 'points' ? finalPointsToWin : undefined,
            roundsToPlay: finalGameMode === 'rounds' ? finalRoundsToPlay : undefined,
            matchesToWin: finalMatchesToWin
          }
        };
        // Generate bracket - config will be stored inside goldBracket.config
        const bracketSuccess = await generateBracket(tournamentId, bracketConfig);

        if (!bracketSuccess) {
          toastMessage = m.admin_errorGeneratingBracket();
          toastType = 'error';
          showToast = true;
          return;
        }
      } else {
        // SPLIT_DIVISIONS: First save qualifiers (all participants going to Gold or Silver)
        // Mark all Gold and Silver participants as qualified in their respective group standings
        const allQualifiedIds = new Set([...goldParticipants, ...silverParticipants]);
        for (const [groupIndex, qualifiedIds] of groupQualifiers.entries()) {
          // Filter to only include IDs that are in either Gold or Silver bracket
          const finalQualifiedIds = qualifiedIds.filter(id => allQualifiedIds.has(id));
          await updateQualifiers(tournamentId, groupIndex, finalQualifiedIds);
        }

        // Generate both Gold and Silver brackets with per-phase configuration (new structure)
        const bracketSuccess = await generateSplitBrackets(tournamentId, {
          goldParticipantIds: goldParticipants,
          silverParticipantIds: silverParticipants,
          goldConfig: {
            earlyRounds: {
              gameMode: earlyRoundsGameMode,
              pointsToWin: earlyRoundsGameMode === 'points' ? earlyRoundsPointsToWin : undefined,
              roundsToPlay: earlyRoundsGameMode === 'rounds' ? earlyRoundsToPlay : undefined,
              matchesToWin: 1
            },
            semifinal: {
              gameMode: semifinalGameMode,
              pointsToWin: semifinalGameMode === 'points' ? semifinalPointsToWin : undefined,
              roundsToPlay: semifinalGameMode === 'rounds' ? semifinalRoundsToPlay : undefined,
              matchesToWin: semifinalMatchesToWin
            },
            final: {
              gameMode: finalGameMode,
              pointsToWin: finalGameMode === 'points' ? finalPointsToWin : undefined,
              roundsToPlay: finalGameMode === 'rounds' ? finalRoundsToPlay : undefined,
              matchesToWin: finalMatchesToWin
            }
          },
          silverConfig: {
            earlyRounds: {
              gameMode: silverEarlyRoundsGameMode,
              pointsToWin: silverEarlyRoundsGameMode === 'points' ? silverEarlyRoundsPointsToWin : undefined,
              roundsToPlay: silverEarlyRoundsGameMode === 'rounds' ? silverEarlyRoundsToPlay : undefined,
              matchesToWin: 1
            },
            semifinal: {
              gameMode: silverSemifinalGameMode,
              pointsToWin: silverSemifinalGameMode === 'points' ? silverSemifinalPointsToWin : undefined,
              roundsToPlay: silverSemifinalGameMode === 'rounds' ? silverSemifinalRoundsToPlay : undefined,
              matchesToWin: silverSemifinalMatchesToWin
            },
            final: {
              gameMode: silverFinalGameMode,
              pointsToWin: silverFinalGameMode === 'points' ? silverFinalPointsToWin : undefined,
              roundsToPlay: silverFinalGameMode === 'rounds' ? silverFinalRoundsToPlay : undefined,
              matchesToWin: silverFinalMatchesToWin
            }
          }
        });

        if (!bracketSuccess) {
          toastMessage = m.admin_errorGeneratingGoldSilverBrackets();
          toastType = 'error';
          showToast = true;
          return;
        }
      }

      // Update status to FINAL_STAGE
      const success = await updateTournament(tournamentId, {
        status: 'FINAL_STAGE'
      });

      if (success) {
        toastMessage = isSplitDivisions
          ? m.admin_goldSilverBracketsGenerated()
          : m.admin_bracketGeneratedAdvancing();
        toastType = 'success';
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}/bracket`), 1500);
      } else {
        toastMessage = m.admin_errorAdvancingToFinalStage();
        toastType = 'error';
        showToast = true;
      }
    } catch (err) {
      console.error('Error generating bracket:', err);
      toastMessage = m.admin_errorGeneratingBracket();
      toastType = 'error';
      showToast = true;
    } finally {
      isProcessing = false;
    }
  }

  let bracketPreviewLoaded = $state(false);

  async function loadBracketPreview() {
    if (!tournamentId || bracketPreviewLoaded) return;
    bracketPreviewLoaded = true;

    try {
      await getQualifiedParticipants(tournamentId);
      showBracketPreview = true;
    } catch (err) {
      console.error('Error loading bracket preview:', err);
      bracketPreviewLoaded = false; // Reset on error to allow retry
    }
  }

  // Only load bracket preview once when qualifiers are first selected
  $effect(() => {
    if (totalQualifiers > 0 && !bracketPreviewLoaded) {
      loadBracketPreview();
    }
  });

  // Track if user has manually moved participants (not just changed top N)
  let userManuallyEdited = $state(false);

  // Compute gold/silver participants reactively based on groupQualifiers
  // This ensures the UI updates immediately when checkboxes change
  let computedDistribution = $derived((() => {
    if (!isSplitDivisions || !tournament?.groupStage?.groups) {
      return { gold: [] as string[], silver: [] as string[] };
    }

    const groups = Array.isArray(tournament.groupStage.groups)
      ? tournament.groupStage.groups
      : Object.values(tournament.groupStage.groups);

    // Collect QUALIFIED participants (selected) organized by position
    const qualifiedByPosition: Map<number, Array<{ id: string; position: number; groupIndex: number }>> = new Map();
    // Collect NON-QUALIFIED participants organized by position
    const nonQualifiedByPosition: Map<number, Array<{ id: string; position: number; groupIndex: number }>> = new Map();

    groups.forEach((group, groupIndex) => {
      const qualifiedIds = new Set(groupQualifiers.get(groupIndex) || []);
      const standings = Array.isArray(group.standings) ? group.standings : Object.values(group.standings);

      standings.forEach((standing: any) => {
        const participantId = standing.participantId;
        const pos = standing.position || 99;

        if (qualifiedIds.has(participantId)) {
          if (!qualifiedByPosition.has(pos)) {
            qualifiedByPosition.set(pos, []);
          }
          qualifiedByPosition.get(pos)!.push({ id: participantId, position: pos, groupIndex });
        } else {
          if (!nonQualifiedByPosition.has(pos)) {
            nonQualifiedByPosition.set(pos, []);
          }
          nonQualifiedByPosition.get(pos)!.push({ id: participantId, position: pos, groupIndex });
        }
      });
    });

    // Apply cross-seeding within each bracket
    function applyCrossSeeding(positionMap: Map<number, Array<{ id: string; position: number; groupIndex: number }>>): string[] {
      const positions = Array.from(positionMap.keys()).sort((a, b) => a - b);
      const seededList: Array<{ id: string; position: number; groupIndex: number }> = [];

      positions.forEach((pos, posIdx) => {
        const participantsAtPos = [...positionMap.get(pos)!];
        participantsAtPos.sort((a, b) => a.groupIndex - b.groupIndex);
        if (posIdx % 2 === 1) {
          participantsAtPos.reverse();
        }
        seededList.push(...participantsAtPos);
      });

      return seededList.map(p => p.id);
    }

    return {
      gold: applyCrossSeeding(qualifiedByPosition),
      silver: applyCrossSeeding(nonQualifiedByPosition)
    };
  })());

  // Update goldParticipants and silverParticipants when computed distribution changes
  $effect(() => {
    if (!userManuallyEdited && computedDistribution) {
      goldParticipants = computedDistribution.gold;
      silverParticipants = computedDistribution.silver;
    }
  });

  // Get all participants from all groups with their info
  function getAllParticipantsFromGroups(): Array<{ id: string; name: string; position: number; groupName: string }> {
    if (!tournament?.groupStage?.groups) return [];

    const groups = Array.isArray(tournament.groupStage.groups)
      ? tournament.groupStage.groups
      : Object.values(tournament.groupStage.groups);

    const result: Array<{ id: string; name: string; position: number; groupName: string }> = [];

    groups.forEach((group) => {
      const standings = Array.isArray(group.standings) ? group.standings : Object.values(group.standings);

      standings.forEach((standing: any) => {
        const participant = tournament?.participants.find(p => p.id === standing.participantId);
        if (participant) {
          result.push({
            id: standing.participantId,
            name: participant.name,
            position: standing.position || 99,
            groupName: group.name
          });
        }
      });
    });

    return result.sort((a, b) => a.position - b.position);
  }

  // Get all qualified participants from groupQualifiers (respects current selection)
  function getAllQualifiedFromGroupQualifiers(): Array<{ id: string; name: string; position: number; groupName: string }> {
    if (!tournament?.groupStage?.groups) return [];

    const groups = Array.isArray(tournament.groupStage.groups)
      ? tournament.groupStage.groups
      : Object.values(tournament.groupStage.groups);

    // Collect all qualified by position across groups
    const byPosition: Map<number, Array<{ id: string; name: string; position: number; groupName: string }>> = new Map();

    groups.forEach((group, groupIndex) => {
      const qualifiedIds = groupQualifiers.get(groupIndex) || [];
      const standings = Array.isArray(group.standings) ? group.standings : Object.values(group.standings);

      qualifiedIds.forEach(participantId => {
        const standing = standings.find((s: any) => s.participantId === participantId);
        const participant = tournament?.participants.find(p => p.id === participantId);
        if (standing && participant) {
          const pos = standing.position || 99;
          if (!byPosition.has(pos)) {
            byPosition.set(pos, []);
          }
          byPosition.get(pos)!.push({
            id: participantId,
            name: participant.name,
            position: pos,
            groupName: group.name
          });
        }
      });
    });

    // Sort by position and flatten
    const sortedPositions = Array.from(byPosition.keys()).sort((a, b) => a - b);
    const result: Array<{ id: string; name: string; position: number; groupName: string }> = [];
    for (const pos of sortedPositions) {
      result.push(...byPosition.get(pos)!);
    }
    return result;
  }

  // Helper functions for SPLIT_DIVISIONS mode
  function getParticipantName(participantId: string): string {
    return tournament?.participants.find(p => p.id === participantId)?.name || 'Unknown';
  }

  function getAllQualifiedParticipants(): Array<{ id: string; name: string; position: number; groupName: string }> {
    if (!tournament?.groupStage?.groups) return [];

    const groups = Array.isArray(tournament.groupStage.groups)
      ? tournament.groupStage.groups
      : Object.values(tournament.groupStage.groups);

    const result: Array<{ id: string; name: string; position: number; groupName: string }> = [];

    groups.forEach((group) => {
      const standings = Array.isArray(group.standings) ? group.standings : Object.values(group.standings);
      standings
        .filter(s => s.qualifiedForFinal)
        .sort((a, b) => a.position - b.position)
        .forEach(s => {
          const participant = tournament?.participants.find(p => p.id === s.participantId);
          if (participant) {
            result.push({
              id: s.participantId,
              name: participant.name,
              position: s.position,
              groupName: group.name
            });
          }
        });
    });

    return result.sort((a, b) => a.position - b.position);
  }

  /**
   * Distribute participants with cross-seeding for Gold/Silver brackets
   *
   * Logic:
   * - Gold = ALL selected qualifiers (the ones who passed from groups)
   * - Silver = ALL non-qualifiers (the ones who didn't pass from groups)
   *
   * Cross-seeding is applied within each bracket so players from different groups
   * meet in early rounds (1ºA vs 2ºB, not 1ºA vs 1ºB)
   *
   * Example with 2 groups, 4 per group, top 2 qualify:
   * - Gold: 1ºA, 1ºB, 2ºA, 2ºB (4 qualifiers, cross-seeded)
   * - Silver: 3ºA, 3ºB, 4ºA, 4ºB (4 non-qualifiers, cross-seeded)
   */
  function autoDistributeParticipants() {
    if (!tournament?.groupStage?.groups) return;

    const groups = Array.isArray(tournament.groupStage.groups)
      ? tournament.groupStage.groups
      : Object.values(tournament.groupStage.groups);

    const validSizes = [2, 4, 8, 16, 32];

    // Collect QUALIFIED participants (selected) organized by position
    const qualifiedByPosition: Map<number, Array<{ id: string; position: number; groupIndex: number }>> = new Map();
    // Collect NON-QUALIFIED participants organized by position
    const nonQualifiedByPosition: Map<number, Array<{ id: string; position: number; groupIndex: number }>> = new Map();

    groups.forEach((group, groupIndex) => {
      const qualifiedIds = new Set(groupQualifiers.get(groupIndex) || []);
      const standings = Array.isArray(group.standings) ? group.standings : Object.values(group.standings);

      standings.forEach((standing: any) => {
        const participantId = standing.participantId;
        const pos = standing.position || 99;

        if (qualifiedIds.has(participantId)) {
          // This participant qualified (selected)
          if (!qualifiedByPosition.has(pos)) {
            qualifiedByPosition.set(pos, []);
          }
          qualifiedByPosition.get(pos)!.push({
            id: participantId,
            position: pos,
            groupIndex
          });
        } else {
          // This participant did NOT qualify
          if (!nonQualifiedByPosition.has(pos)) {
            nonQualifiedByPosition.set(pos, []);
          }
          nonQualifiedByPosition.get(pos)!.push({
            id: participantId,
            position: pos,
            groupIndex
          });
        }
      });
    });

    // Apply cross-seeding within each bracket
    function applyCrossSeeding(positionMap: Map<number, Array<{ id: string; position: number; groupIndex: number }>>): string[] {
      const positions = Array.from(positionMap.keys()).sort((a, b) => a - b);
      const seededList: Array<{ id: string; position: number; groupIndex: number }> = [];

      positions.forEach((pos, posIdx) => {
        const participantsAtPos = [...positionMap.get(pos)!];
        // Sort by group index for consistent ordering
        participantsAtPos.sort((a, b) => a.groupIndex - b.groupIndex);

        // Alternate order: even position indices in normal order, odd in reverse
        // This creates cross-seeding: 1ºA, 2ºB, 2ºA, 1ºB for bracket seeding
        if (posIdx % 2 === 1) {
          participantsAtPos.reverse();
        }

        seededList.push(...participantsAtPos);
      });

      return seededList.map(p => p.id);
    }

    let goldList = applyCrossSeeding(qualifiedByPosition);
    let silverList = applyCrossSeeding(nonQualifiedByPosition);

    // Use all participants - brackets now support BYEs for non-power-of-2 counts
    goldParticipants = goldList;
    silverParticipants = silverList;
    // Reset manual edit flag since we're using the automatic distribution
    userManuallyEdited = false;
  }
</script>

<AdminGuard>
  <div class="transition-page" data-theme={$adminTheme}>
    <!-- Header -->
    <header class="page-header">
      {#if tournament}
        <div class="header-row">
          <button class="back-btn" onclick={() => goto(`/admin/tournaments/${tournamentId}`)}>←</button>
          <div class="header-main">
            <div class="title-section">
              <h1>{tournament.name}</h1>
              <div class="header-badges">
                <span class="info-badge phase-badge">
                  {m.admin_qualifierSelectionTitle()}
                </span>
              </div>
              {#if timeRemaining}
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
            <ThemeToggle />
          </div>
        </div>
      {/if}
    </header>

    <!-- Content -->
    <div class="page-content">
      {#if loading}
        <LoadingSpinner message={m.admin_loadingTransition()} />
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>{m.admin_errorLoading()}</h3>
          <p>{m.admin_couldNotLoadTransition()}</p>
          <button class="primary-button" onclick={() => goto('/admin/tournaments')}>
            {m.admin_backToTournaments()}
          </button>
        </div>
      {:else}
        {#if isSplitDivisions}
          <!-- SPLIT_DIVISIONS: Step 1 - Select qualifiers from each group -->
          <div class="step-section">
            <div class="step-header">
              <span class="step-number">1</span>
              <div>
                <h2>{m.admin_selectQualifiersPerGroup()}</h2>
                <p class="help-text">{m.admin_totalQualifiersCount()}: <strong>{totalQualifiers}</strong></p>
              </div>
              <button
                class="recalculate-btn"
                onclick={handleRecalculateStandings}
                disabled={isRecalculating}
                title={m.time_recalculate()}
              >
                {#if isRecalculating}
                  <span class="spinner-small"></span>
                {:else}
                  🔄
                {/if}
              </button>
            </div>

            <div class="groups-section">
              <div class="groups-grid">
                {#if tournament.groupStage}
                  {#each tournament.groupStage.groups as group, index}
                    <QualifierSelection
                      {tournament}
                      groupIndex={index}
                      topN={topNPerGroup}
                      onupdate={(qualifiedIds) => handleQualifierUpdate(index, qualifiedIds)}
                      ontiesStatusChanged={({ groupIndex, hasUnresolvedTies }) => handleTiesStatusChanged(groupIndex, hasUnresolvedTies)}
                      onstandingsChanged={({ groupIndex, standings }) => handleStandingsChanged(groupIndex, standings)}
                    />
                  {/each}
                {/if}
              </div>
            </div>

            <!-- Warning for unresolved ties -->
            {#if hasAnyUnresolvedTies}
              <div class="action-required-banner">
                <div class="banner-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div class="banner-content">
                  <span class="banner-title">{m.admin_unresolvedTiesBlockBracket()}</span>
                  <span class="banner-hint">{m.admin_resolveTiesFirst()}</span>
                </div>
              </div>
            {/if}

            <!-- Rounds accordion -->
            {#if tournament.groupStage?.groups?.[0]?.pairings?.length > 0}
              <div class="rounds-accordion">
                <details class="rounds-details">
                  <summary class="rounds-summary">
                    <span class="summary-icon">📋</span>
                    <span>{m.admin_roundResults()}</span>
                    <span class="rounds-count">{tournament.groupStage.groups[0].pairings.length} {m.time_rounds()}</span>
                    <span class="chevron">▼</span>
                  </summary>
                  <div class="rounds-content">
                    <div class="rounds-grid">
                      {#each tournament.groupStage.groups[0].pairings as pairing}
                        <div class="round-card">
                          <div class="round-card-header">
                            <span class="round-badge">{pairing.roundNumber}</span>
                            <span class="round-label">{m.time_round()} {pairing.roundNumber}</span>
                          </div>
                          <div class="matches-compact">
                            {#each pairing.matches as match}
                              {@const participantA = tournament.participants.find(p => p.id === match.participantA)}
                              {@const participantB = tournament.participants.find(p => p.id === match.participantB)}
                              {@const isBye = match.participantB === 'BYE'}
                              <div class="match-compact" class:completed={match.status === 'COMPLETED'} class:bye={isBye}>
                                <div class="match-teams">
                                  <span class="team-name" class:winner={match.winner === match.participantA}>
                                    {participantA?.name || '?'}
                                  </span>
                                  <span class="team-name" class:winner={match.winner === match.participantB}>
                                    {#if isBye}
                                      <span class="bye-text">BYE</span>
                                    {:else}
                                      {participantB?.name || '?'}
                                    {/if}
                                  </span>
                                </div>
                                <div class="match-result">
                                  {#if isBye}
                                    <span class="result-bye">-</span>
                                  {:else if match.status === 'COMPLETED'}
                                    <span class="result-score" class:winner-a={match.winner === match.participantA}>{match.totalPointsA ?? 0}</span>
                                    <span class="result-separator">-</span>
                                    <span class="result-score" class:winner-b={match.winner === match.participantB}>{match.totalPointsB ?? 0}</span>
                                  {:else}
                                    <span class="result-pending">-</span>
                                  {/if}
                                </div>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </details>
              </div>
            {/if}
          </div>

        <!-- Step 2: Configuration for both brackets - Per Phase -->
        <div class="step-section">
          <div class="step-header">
            <span class="step-number">2</span>
            <div>
              <h2>{m.admin_matchConfiguration()}</h2>
              <p class="help-text">{m.admin_configureMatchFormat()}</p>
            </div>
          </div>

          <div class="dual-config-section advanced">
            <!-- Gold bracket config - Per Phase -->
            <div class="bracket-config gold">
              <h3>🥇 {m.admin_goldLeague()}</h3>
              <div class="phases-config-grid compact">
                <!-- Gold Early Rounds -->
                <div class="phase-config-card">
                  <div class="phase-config-header early">
                    <span class="phase-icon">🎯</span>
                    <span class="phase-title">{m.admin_earlyRounds()}</span>
                  </div>
                  <div class="phase-config-body">
                    <div class="config-row">
                      <select bind:value={earlyRoundsGameMode} class="select-input mini">
                        <option value="rounds">{m.admin_byRoundsOption()}</option>
                        <option value="points">{m.admin_byPointsOption()}</option>
                      </select>
                      {#if earlyRoundsGameMode === 'rounds'}
                        <input type="number" bind:value={earlyRoundsToPlay} min="1" max="12" class="number-input mini" />
                      {:else}
                        <input type="number" bind:value={earlyRoundsPointsToWin} min="1" max="15" class="number-input mini" />
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Gold Semifinals -->
                <div class="phase-config-card">
                  <div class="phase-config-header semi">
                    <span class="phase-icon">⚔️</span>
                    <span class="phase-title">{m.admin_semifinals()}</span>
                  </div>
                  <div class="phase-config-body">
                    <div class="config-row">
                      <select bind:value={semifinalGameMode} class="select-input mini">
                        <option value="points">{m.admin_byPointsOption()}</option>
                        <option value="rounds">{m.admin_byRoundsOption()}</option>
                      </select>
                      {#if semifinalGameMode === 'rounds'}
                        <input type="number" bind:value={semifinalRoundsToPlay} min="1" max="12" class="number-input mini" />
                      {:else}
                        <input type="number" bind:value={semifinalPointsToWin} min="1" max="15" class="number-input mini" />
                      {/if}
                      <span class="bo-label">Md</span>
                      <select bind:value={semifinalMatchesToWin} class="select-input mini">
                        <option value={1}>1</option>
                        <option value={3}>3</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Gold Final -->
                <div class="phase-config-card">
                  <div class="phase-config-header final">
                    <span class="phase-icon">🏆</span>
                    <span class="phase-title">{m.admin_final()}</span>
                  </div>
                  <div class="phase-config-body">
                    <div class="config-row">
                      <select bind:value={finalGameMode} class="select-input mini">
                        <option value="points">{m.admin_byPoints()}</option>
                        <option value="rounds">{m.admin_byRounds()}</option>
                      </select>
                      {#if finalGameMode === 'rounds'}
                        <input type="number" bind:value={finalRoundsToPlay} min="1" max="12" class="number-input mini" />
                      {:else}
                        <input type="number" bind:value={finalPointsToWin} min="1" max="15" class="number-input mini" />
                      {/if}
                      <span class="bo-label">Md</span>
                      <select bind:value={finalMatchesToWin} class="select-input mini">
                        <option value={1}>1</option>
                        <option value={3}>3</option>
                        <option value={5}>5</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Silver bracket config - Per Phase -->
            <div class="bracket-config silver">
              <h3>🥈 {m.admin_silverLeague()}</h3>
              <div class="phases-config-grid compact">
                <!-- Silver Early Rounds -->
                <div class="phase-config-card">
                  <div class="phase-config-header early">
                    <span class="phase-icon">🎯</span>
                    <span class="phase-title">{m.admin_earlyRounds()}</span>
                  </div>
                  <div class="phase-config-body">
                    <div class="config-row">
                      <select bind:value={silverEarlyRoundsGameMode} class="select-input mini">
                        <option value="rounds">{m.admin_byRounds()}</option>
                        <option value="points">{m.admin_byPoints()}</option>
                      </select>
                      {#if silverEarlyRoundsGameMode === 'rounds'}
                        <input type="number" bind:value={silverEarlyRoundsToPlay} min="1" max="12" class="number-input mini" />
                      {:else}
                        <input type="number" bind:value={silverEarlyRoundsPointsToWin} min="1" max="15" class="number-input mini" />
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Silver Semifinals -->
                <div class="phase-config-card">
                  <div class="phase-config-header semi">
                    <span class="phase-icon">⚔️</span>
                    <span class="phase-title">{m.admin_semifinals()}</span>
                  </div>
                  <div class="phase-config-body">
                    <div class="config-row">
                      <select bind:value={silverSemifinalGameMode} class="select-input mini">
                        <option value="points">{m.admin_byPoints()}</option>
                        <option value="rounds">{m.admin_byRounds()}</option>
                      </select>
                      {#if silverSemifinalGameMode === 'rounds'}
                        <input type="number" bind:value={silverSemifinalRoundsToPlay} min="1" max="12" class="number-input mini" />
                      {:else}
                        <input type="number" bind:value={silverSemifinalPointsToWin} min="1" max="15" class="number-input mini" />
                      {/if}
                      <span class="bo-label">Md</span>
                      <select bind:value={silverSemifinalMatchesToWin} class="select-input mini">
                        <option value={1}>1</option>
                        <option value={3}>3</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Silver Final -->
                <div class="phase-config-card">
                  <div class="phase-config-header final">
                    <span class="phase-icon">🏆</span>
                    <span class="phase-title">{m.admin_final()}</span>
                  </div>
                  <div class="phase-config-body">
                    <div class="config-row">
                      <select bind:value={silverFinalGameMode} class="select-input mini">
                        <option value="points">{m.admin_byPoints()}</option>
                        <option value="rounds">{m.admin_byRounds()}</option>
                      </select>
                      {#if silverFinalGameMode === 'rounds'}
                        <input type="number" bind:value={silverFinalRoundsToPlay} min="1" max="12" class="number-input mini" />
                      {:else}
                        <input type="number" bind:value={silverFinalPointsToWin} min="1" max="15" class="number-input mini" />
                      {/if}
                      <span class="bo-label">Md</span>
                      <select bind:value={silverFinalMatchesToWin} class="select-input mini">
                        <option value={1}>1</option>
                        <option value={3}>3</option>
                        <option value={5}>5</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <!-- SINGLE_BRACKET: Original flow -->
          <!-- Final stage configuration - 3 phases -->
          <div class="config-section">
            <h3 class="config-section-title">🏆 {m.admin_finalStageConfigTitle()}</h3>

            <div class="phases-config-grid">
              <!-- Early Rounds (Octavos, Cuartos) -->
              <div class="phase-config-card">
                <div class="phase-config-header early">
                  <span class="phase-icon">🎯</span>
                  <span class="phase-title">{m.admin_earlyRounds()}</span>
                  <span class="phase-hint">{m.admin_earlyRoundsHint()}</span>
                </div>
                <div class="phase-config-body">
                  <div class="config-field">
                    <label>{m.admin_gameMode()}</label>
                    <select bind:value={earlyRoundsGameMode} class="select-input">
                      <option value="points">{m.admin_byPoints()}</option>
                      <option value="rounds">{m.admin_byRounds()}</option>
                    </select>
                  </div>
                  {#if earlyRoundsGameMode === 'points'}
                    <div class="config-field">
                      <label>{m.admin_pointsToWinLabel()}</label>
                      <input type="number" bind:value={earlyRoundsPointsToWin} min="1" max="15" class="number-input" />
                    </div>
                  {:else}
                    <div class="config-field">
                      <label>{m.admin_roundsToPlayLabel()}</label>
                      <input type="number" bind:value={earlyRoundsToPlay} min="1" max="12" class="number-input" />
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Semifinals (and 3rd/4th place match) -->
              <div class="phase-config-card">
                <div class="phase-config-header semi">
                  <span class="phase-icon">⚔️</span>
                  <span class="phase-title">{m.admin_semifinals()}</span>
                  <span class="phase-hint">{m.admin_finalAndThird()}</span>
                </div>
                <div class="phase-config-body">
                  <div class="config-field">
                    <label>{m.admin_gameMode()}</label>
                    <select bind:value={semifinalGameMode} class="select-input">
                      <option value="points">{m.admin_byPoints()}</option>
                      <option value="rounds">{m.admin_byRounds()}</option>
                    </select>
                  </div>
                  {#if semifinalGameMode === 'points'}
                    <div class="config-field">
                      <label>{m.admin_pointsToWinLabel()}</label>
                      <input type="number" bind:value={semifinalPointsToWin} min="1" max="15" class="number-input" />
                    </div>
                  {:else}
                    <div class="config-field">
                      <label>{m.admin_roundsToPlayLabel()}</label>
                      <input type="number" bind:value={semifinalRoundsToPlay} min="1" max="12" class="number-input" />
                    </div>
                  {/if}
                  <div class="config-field">
                    <label>{m.admin_matchesToWinLabel()}</label>
                    <select bind:value={semifinalMatchesToWin} class="select-input">
                      <option value={1}>1</option>
                      <option value={3}>3</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Final -->
              <div class="phase-config-card">
                <div class="phase-config-header final">
                  <span class="phase-icon">🏆</span>
                  <span class="phase-title">{m.admin_final()}</span>
                </div>
                <div class="phase-config-body">
                  <div class="config-field">
                    <label>{m.admin_gameMode()}</label>
                    <select bind:value={finalGameMode} class="select-input">
                      <option value="points">{m.admin_byPoints()}</option>
                      <option value="rounds">{m.admin_byRounds()}</option>
                    </select>
                  </div>
                  {#if finalGameMode === 'points'}
                    <div class="config-field">
                      <label>{m.admin_pointsToWinLabel()}</label>
                      <input type="number" bind:value={finalPointsToWin} min="1" max="15" class="number-input" />
                    </div>
                  {:else}
                    <div class="config-field">
                      <label>{m.admin_roundsToPlayLabel()}</label>
                      <input type="number" bind:value={finalRoundsToPlay} min="1" max="12" class="number-input" />
                    </div>
                  {/if}
                  <div class="config-field">
                    <label>{m.admin_bestOfLabel()}</label>
                    <select bind:value={finalMatchesToWin} class="select-input">
                      <option value={1}>1</option>
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Qualifier selections per group -->
          <div class="groups-section">
            <div class="groups-header">
              <h2>{m.admin_selectQualifiersPerGroup()}</h2>
              <button
                class="recalculate-btn"
                onclick={handleRecalculateStandings}
                disabled={isRecalculating}
                title={m.time_recalculate()}
              >
                {#if isRecalculating}
                  <span class="spinner-small"></span>
                {:else}
                  🔄
                {/if}
              </button>
            </div>
            <div class="groups-grid">
              {#if tournament.groupStage}
                {#each tournament.groupStage.groups as group, index}
                  <QualifierSelection
                    {tournament}
                    groupIndex={index}
                    topN={topNPerGroup}
                    onupdate={(qualifiedIds) => handleQualifierUpdate(index, qualifiedIds)}
                    ontiesStatusChanged={({ groupIndex, hasUnresolvedTies }) => handleTiesStatusChanged(groupIndex, hasUnresolvedTies)}
                    onstandingsChanged={({ groupIndex, standings }) => handleStandingsChanged(groupIndex, standings)}
                  />
                {/each}
              {/if}
            </div>

            <!-- Warning for unresolved ties -->
            {#if hasAnyUnresolvedTies}
              <div class="action-required-banner">
                <div class="banner-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div class="banner-content">
                  <span class="banner-title">{m.admin_unresolvedTiesBlockBracket()}</span>
                  <span class="banner-hint">{m.admin_resolveTiesFirst()}</span>
                </div>
              </div>
            {/if}
          </div>

          <!-- Summary and validation -->
          <div class="summary-section">
            <div class="summary-card">
              <h3>{m.admin_summaryTitle()}</h3>
              <div class="summary-stats">
                <div class="stat-item">
                  <span class="stat-label">{m.admin_totalParticipantsLabel()}</span>
                  <span class="stat-value">{tournament.participants.length}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">{m.admin_suggestedForBracket()}</span>
                  <span class="stat-value suggestion">
                    {suggestedQualifiers.total} {m.admin_qualifiersWithPerGroup({ perGroup: String(suggestedQualifiers.perGroup) })}
                  </span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">{m.admin_totalQualifiersLabel()}</span>
                  <span class="stat-value" class:valid={isValidSize} class:invalid={!isValidSize && totalQualifiers > 0}>
                    {totalQualifiers}
                    {#if isValidSize}
                      ✅
                    {:else if totalQualifiers > 0}
                      ❌
                    {/if}
                  </span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">{m.admin_bracketSizeLabel()}</span>
                  <span class="stat-value" class:valid={isValidSize} class:invalid={!isValidSize && totalQualifiers > 0}>
                    {#if isValidSize}
                      ✅ {totalQualifiers} {m.admin_participants()}
                    {:else if totalQualifiers > 0}
                      ❌ {m.admin_mustBePowerOf2Full()}
                    {:else}
                      {m.admin_selectQualifiersHint()}
                    {/if}
                  </span>
                </div>
                {#if isValidSize && totalQualifiers > 0}
                  <div class="stat-item">
                    <span class="stat-label">{m.admin_bracketRoundsLabel()}</span>
                    <span class="stat-value">{bracketRoundNames.map(translateRoundName).join(' → ')}</span>
                  </div>
                {/if}
              </div>

              {#if !isValidSize && totalQualifiers > 0}
                <div class="validation-error">
                  ⚠️ {m.admin_qualifiersMustBePowerOf2()}
                  <br />
                  {m.admin_mustBePowerOf2Full()}
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Action buttons -->
        <div class="actions-section">
          <button
            class="action-btn generate"
            onclick={handleGenerateBracket}
            disabled={isProcessing || !canProceed}
          >
            {#if isProcessing}
              <span class="btn-spinner"></span>
              <span>{m.admin_generatingBracket()}</span>
            {:else}
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
              <span>{isSplitDivisions ? m.admin_generateGoldSilverBrackets() : m.admin_generateBracketAndAdvance()}</span>
              <svg class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} type={toastType} />

<!-- Loading Overlay -->
{#if isProcessing}
  <div class="loading-overlay" data-theme={$adminTheme}>
    <div class="loading-content">
      <LoadingSpinner size="large" message={isSplitDivisions ? m.admin_generatingGoldSilverBrackets() : m.admin_generatingBracket()} />
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
  .transition-page {
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .transition-page[data-theme='dark'] {
    background: #0f1419;
  }

  /* Header */
  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem 1.5rem;
    transition: background-color 0.3s, border-color 0.3s;
  }

  .transition-page[data-theme='dark'] .page-header {
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

  .transition-page[data-theme='dark'] .back-btn {
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

  .transition-page[data-theme='dark'] .title-section h1 {
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
    background: linear-gradient(135deg, #fee140 0%, #fa709a 100%);
    color: #78350f;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Content */
  .page-content {
    padding: 1rem;
    max-height: calc(100vh - 60px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Scrollbar styling */
  .page-content::-webkit-scrollbar {
    width: 8px;
  }

  .page-content::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  .page-content::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 4px;
  }

  .transition-page[data-theme='dark'] .page-content::-webkit-scrollbar-track {
    background: #0f1419;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    text-align: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e5e7eb;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-icon {
    font-size: 2.5rem;
    margin-bottom: 0.75rem;
  }

  .error-state h3 {
    color: #1a1a1a;
    margin-bottom: 0.25rem;
    font-size: 1rem;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .error-state h3 {
    color: #e1e8ed;
  }

  .error-state p {
    color: #666;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .error-state p {
    color: #8b9bb3;
  }

  .primary-button {
    padding: 0.5rem 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
  }

  .primary-button:hover {
    transform: translateY(-1px);
  }

  /* Sections */
  .groups-section,
  .config-section,
  .summary-section,
  .actions-section {
    margin-bottom: 1rem;
  }

  .config-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    transition: all 0.3s;
  }

  .transition-page[data-theme='dark'] .config-section {
    background: #1a2332;
    border-color: #2d3748;
  }

  .config-section-title {
    margin: 0 0 0.25rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .transition-page[data-theme='dark'] .config-section-title {
    color: #e1e8ed;
  }

  /* Phases config grid - 3 columns */
  .phases-config-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .phase-config-card {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    background: white;
    transition: all 0.2s;
  }

  .transition-page[data-theme='dark'] .phase-config-card {
    background: #0f1419;
    border-color: #2d3748;
  }

  .phase-config-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.6rem;
    font-weight: 600;
    font-size: 0.75rem;
  }

  .phase-config-header.early {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
  }

  .phase-config-header.semi {
    background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
    color: white;
  }

  .phase-config-header.final {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  .phase-icon {
    font-size: 0.85rem;
  }

  .phase-title {
    flex: 1;
  }

  .phase-hint {
    font-size: 0.65rem;
    font-weight: 400;
    opacity: 0.85;
  }

  .phase-config-body {
    padding: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .phase-config-body .config-field {
    gap: 0.15rem;
  }

  .phase-config-body .config-field label {
    font-size: 0.7rem;
  }

  .phase-config-body .select-input,
  .phase-config-body .number-input {
    padding: 0.3rem 0.4rem;
    font-size: 0.75rem;
  }

  /* Responsive: stack on mobile */
  @media (max-width: 768px) {
    .phases-config-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 900px) and (min-width: 769px) {
    .phases-config-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
    }

    .phase-config-header {
      padding: 0.4rem 0.5rem;
      font-size: 0.7rem;
    }

    .phase-config-body {
      padding: 0.5rem;
    }
  }

  /* Compact phases grid for split divisions */
  .phases-config-grid.compact {
    gap: 0.5rem;
  }

  .phases-config-grid.compact .phase-config-card {
    border-radius: 4px;
  }

  .phases-config-grid.compact .phase-config-header {
    padding: 0.35rem 0.5rem;
    font-size: 0.7rem;
  }

  .phases-config-grid.compact .phase-icon {
    font-size: 0.75rem;
  }

  .phases-config-grid.compact .phase-config-body {
    padding: 0.4rem 0.5rem;
  }

  /* Config row - inline layout for compact mode */
  .config-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  /* Mini inputs for compact phase config */
  .select-input.mini,
  .number-input.mini {
    padding: 0.25rem 0.35rem;
    font-size: 0.7rem;
    min-width: 0;
  }

  .select-input.mini {
    min-width: 70px;
    max-width: 110px;
  }

  .number-input.mini {
    width: 45px;
    text-align: center;
  }

  .bo-label {
    font-size: 0.65rem;
    color: #6b7280;
    font-weight: 500;
    margin-left: 0.25rem;
  }

  /* Advanced dual config */
  .dual-config-section.advanced {
    gap: 1rem;
  }

  .dual-config-section.advanced .bracket-config {
    padding: 0.6rem;
  }

  .dual-config-section.advanced .bracket-config h3 {
    margin-bottom: 0.6rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid rgba(0,0,0,0.1);
  }

  .config-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .config-card h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .config-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .config-field label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
  }

  .radio-group {
    display: flex;
    gap: 0.75rem;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    font-size: 0.8rem;
    color: #6b7280;
  }

  .radio-option:has(input:checked) span {
    color: #1a1a1a;
    font-weight: 600;
  }

  .number-input,
  .select-input {
    padding: 0.4rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #1a1a1a;
    background: white;
    transition: all 0.2s;
  }

  .number-input:focus,
  .select-input:focus {
    outline: none;
    border-color: #667eea;
  }

  /* Dark mode for config section */
  :global([data-theme='dark']) .config-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .config-card h3 {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .config-field label {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .radio-option {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .radio-option:has(input:checked) span {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .number-input,
  :global([data-theme='dark']) .select-input {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .groups-section {
    min-height: 150px;
  }

  .groups-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .groups-section h2,
  .groups-header h2 {
    font-size: 0.9rem;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .groups-section h2,
  .transition-page[data-theme='dark'] .groups-header h2 {
    color: #e1e8ed;
  }

  .recalculate-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    margin-left: 0.5rem;
    padding: 0;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s;
  }

  .recalculate-btn:hover:not(:disabled) {
    background: #e5e7eb;
    border-color: #9ca3af;
  }

  .recalculate-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .transition-page[data-theme='dark'] .recalculate-btn {
    background: #1a1a2e;
    border-color: #2d3748;
  }

  .transition-page[data-theme='dark'] .recalculate-btn:hover:not(:disabled) {
    background: #2d3748;
    border-color: #4a5568;
  }

  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid #d1d5db;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .groups-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 0.75rem;
  }

  .summary-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    transition: all 0.3s;
  }

  .transition-page[data-theme='dark'] .summary-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  .summary-card h3 {
    font-size: 0.9rem;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 0.75rem 0;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .summary-card h3 {
    color: #e1e8ed;
  }

  .summary-stats {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0.6rem;
    background: #f9fafb;
    border-radius: 4px;
    font-size: 0.8rem;
    transition: background-color 0.3s;
  }

  .transition-page[data-theme='dark'] .stat-item {
    background: #0f1419;
  }

  .stat-label {
    font-size: 0.8rem;
    color: #6b7280;
    font-weight: 500;
  }

  .stat-value {
    font-size: 0.8rem;
    color: #1a1a1a;
    font-weight: 600;
    transition: color 0.3s;
  }

  .transition-page[data-theme='dark'] .stat-value {
    color: #e1e8ed;
  }

  .stat-value.valid {
    color: #10b981;
  }

  .stat-value.invalid {
    color: #ef4444;
  }

  .stat-value.suggestion {
    color: #667eea;
    font-style: italic;
  }

  .validation-error {
    margin-top: 0.75rem;
    padding: 0.6rem;
    background: #fee;
    color: #c00;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.4;
  }

  .action-required-banner {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    margin: 1rem 0;
    padding: 0.875rem 1rem;
    background: #fffbeb;
    border: 1px solid #fbbf24;
    border-radius: 6px;
  }

  .action-required-banner .banner-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    color: #d97706;
  }

  .action-required-banner .banner-icon svg {
    width: 100%;
    height: 100%;
  }

  .action-required-banner .banner-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .action-required-banner .banner-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #92400e;
  }

  .action-required-banner .banner-hint {
    font-size: 0.75rem;
    color: #b45309;
  }

  .actions-section {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    letter-spacing: 0.01em;
  }

  .action-btn.generate {
    background: #059669;
    color: white;
    box-shadow: 0 1px 3px rgba(5, 150, 105, 0.2);
  }

  .action-btn.generate:hover:not(:disabled) {
    background: #047857;
    box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
  }

  .action-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: #9ca3af;
    box-shadow: none;
  }

  .btn-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .btn-arrow {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    opacity: 0.7;
    transition: transform 0.2s ease;
  }

  .action-btn:hover:not(:disabled) .btn-arrow {
    transform: translateX(2px);
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Step sections */
  .step-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 0.75rem;
    transition: all 0.3s;
  }

  .transition-page[data-theme='dark'] .step-section {
    background: #1a2332;
    border-color: #2d3748;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .step-header > div:first-of-type {
    flex: 1;
    min-width: 150px;
  }


  .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 50%;
    font-size: 0.8rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .step-header h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .transition-page[data-theme='dark'] .step-header h2 {
    color: #e1e8ed;
  }

  .step-header .help-text {
    margin: 0.15rem 0 0 0;
    color: #6b7280;
    font-size: 0.75rem;
  }

  .qualifier-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 0.35rem;
    background: #6b7280;
    color: white;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
    margin-left: 0.2rem;
  }

  .qualifier-count.valid {
    background: #667eea;
  }

  .selection-summary {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem;
    background: #f9fafb;
    border-radius: 4px;
    margin-top: 0.5rem;
    font-size: 0.8rem;
  }

  .transition-page[data-theme='dark'] .selection-summary {
    background: #0f1419;
  }

  .summary-label {
    font-weight: 500;
    color: #6b7280;
  }

  .summary-value {
    font-weight: 600;
    font-size: 0.9rem;
    color: #1a1a1a;
  }

  .summary-value.valid {
    color: #10b981;
  }

  .transition-page[data-theme='dark'] .summary-value {
    color: #e1e8ed;
  }

  .summary-hint {
    font-size: 0.75rem;
    color: #9ca3af;
    font-style: italic;
  }

  /* SPLIT_DIVISIONS Styles */
  .split-divisions-header {
    text-align: center;
    margin-bottom: 1rem;
  }

  .split-divisions-header h2 {
    font-size: 1rem;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 0.25rem 0;
  }

  .split-divisions-header .help-text {
    color: #6b7280;
    font-size: 0.8rem;
    margin-bottom: 0.5rem;
  }

  .auto-distribute-btn {
    padding: 0.35rem 0.75rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .auto-distribute-btn:hover {
    transform: translateY(-1px);
  }

  .dual-config-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .bracket-config {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.75rem;
    transition: all 0.3s;
  }

  .bracket-config.gold {
    border-color: #fbbf24;
    background: #fffef5;
  }

  .bracket-config.silver {
    border-color: #9ca3af;
    background: #fafafa;
  }

  .bracket-config h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .bracket-config.gold h3 {
    color: #b45309;
  }

  .bracket-config.silver h3 {
    color: #4b5563;
  }

  .distribution-section {
    margin-bottom: 1rem;
  }

  .brackets-distribution {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 0.75rem;
  }

  .bracket-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.75rem;
    min-height: 120px;
  }

  .bracket-card.gold {
    border-color: #fbbf24;
    background: #fffef5;
  }

  .bracket-card.silver {
    border-color: #9ca3af;
    background: #fafafa;
  }

  .bracket-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.35rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .bracket-header h4 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .bracket-card.gold .bracket-header h4 {
    color: #b45309;
  }

  .bracket-card.silver .bracket-header h4 {
    color: #4b5563;
  }

  .validity-badge {
    font-size: 0.9rem;
  }

  .validity-badge.valid {
    color: #10b981;
  }

  .validity-badge.invalid {
    color: #ef4444;
  }

  .rounds-preview {
    font-size: 0.7rem;
    color: #6b7280;
    margin: 0 0 0.5rem 0;
    font-style: italic;
  }

  .participant-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .participant-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.3rem 0.5rem;
    background: white;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
    font-size: 0.8rem;
    transition: all 0.2s;
  }

  .participant-row:hover {
    background: #f9fafb;
  }

  .participant-row.gold {
    border-left: 2px solid #fbbf24;
  }

  .participant-row.silver {
    border-left: 2px solid #9ca3af;
  }

  .participant-row.unassigned {
    border-left: 2px solid #f59e0b;
    background: #fffbeb;
  }

  .participant-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .position-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: 700;
  }

  .seed-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: #10b981;
    color: white;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: 700;
    margin-right: 0.35rem;
  }

  .participant-info .name,
  .participant-row .name {
    font-weight: 600;
    color: #1a1a1a;
    font-size: 0.8rem;
  }

  .group-tag {
    font-size: 0.65rem;
    background: #e5e7eb;
    color: #6b7280;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }

  .position-tag {
    font-size: 0.65rem;
    background: #dbeafe;
    color: #1d4ed8;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-weight: 600;
    margin-left: auto;
  }

  .empty-message {
    text-align: center;
    color: #9ca3af;
    font-style: italic;
    padding: 1rem;
    font-size: 0.8rem;
  }

  /* Dark mode for SPLIT_DIVISIONS */
  :global([data-theme='dark']) .split-divisions-header h2 {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .split-divisions-header .help-text {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .bracket-config {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .bracket-config.gold {
    background: #1a2332;
    border-color: #b45309;
  }

  :global([data-theme='dark']) .bracket-config.silver {
    background: #1a2332;
    border-color: #6b7280;
  }

  :global([data-theme='dark']) .bo-label {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .dual-config-section.advanced .bracket-config h3 {
    border-bottom-color: rgba(255,255,255,0.1);
  }

  :global([data-theme='dark']) .bracket-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .bracket-card.gold {
    border-color: #b45309;
    background: #1a2332;
  }

  :global([data-theme='dark']) .bracket-card.silver {
    border-color: #6b7280;
    background: #1a2332;
  }

  :global([data-theme='dark']) .participant-row {
    background: #0f1419;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .participant-row:hover {
    background: #1a2332;
  }

  :global([data-theme='dark']) .participant-info .name,
  :global([data-theme='dark']) .participant-row .name {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .unassigned-card {
    background: #2d3748;
    border-color: #b45309;
  }

  :global([data-theme='dark']) .unassigned-card h4 {
    color: #fbbf24;
  }

  /* Responsive */
  @media (max-width: 768px) {
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

    .page-content {
      padding: 0.75rem;
    }

    .groups-grid {
      grid-template-columns: 1fr;
    }

    .dual-config-section,
    .brackets-distribution {
      grid-template-columns: 1fr;
    }

    .actions-section {
      flex-direction: column;
    }

    .action-btn {
      width: 100%;
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

    .step-section {
      padding: 0.75rem;
    }

    .step-header h2 {
      font-size: 0.85rem;
    }

    .step-number {
      width: 1.25rem;
      height: 1.25rem;
      font-size: 0.7rem;
    }

    .bracket-card,
    .bracket-config {
      padding: 0.5rem;
    }
  }

  /* Rounds Accordion */
  .rounds-accordion {
    margin-top: 0.75rem;
  }

  .rounds-details {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    transition: all 0.3s;
  }

  .transition-page[data-theme='dark'] .rounds-details {
    background: #1a2332;
    border-color: #2d3748;
  }

  .rounds-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    color: #374151;
    background: #f9fafb;
    transition: all 0.2s;
    list-style: none;
  }

  .rounds-summary::-webkit-details-marker {
    display: none;
  }

  .rounds-summary:hover {
    background: #f3f4f6;
  }

  .transition-page[data-theme='dark'] .rounds-summary {
    background: #0f1419;
    color: #e1e8ed;
  }

  .transition-page[data-theme='dark'] .rounds-summary:hover {
    background: #1a2332;
  }

  .summary-icon {
    font-size: 0.9rem;
  }

  .rounds-count {
    margin-left: auto;
    font-size: 0.7rem;
    color: #6b7280;
    font-weight: 500;
  }

  .chevron {
    font-size: 0.6rem;
    transition: transform 0.2s;
    color: #9ca3af;
  }

  .rounds-details[open] .chevron {
    transform: rotate(180deg);
  }

  .rounds-content {
    padding: 0.75rem;
    border-top: 1px solid #e5e7eb;
    max-height: 350px;
    overflow-y: auto;
  }

  .transition-page[data-theme='dark'] .rounds-content {
    border-top-color: #2d3748;
  }

  .rounds-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  @media (max-width: 1200px) {
    .rounds-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 900px) {
    .rounds-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 500px) {
    .rounds-grid {
      grid-template-columns: 1fr;
    }
  }

  .round-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
  }

  .transition-page[data-theme='dark'] .round-card {
    background: #0f1419;
    border-color: #2d3748;
  }

  .round-card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .round-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: rgba(255,255,255,0.2);
    border-radius: 50%;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .round-label {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .matches-compact {
    display: flex;
    flex-direction: column;
  }

  .match-compact {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.75rem;
  }

  .match-compact:last-child {
    border-bottom: none;
  }

  .transition-page[data-theme='dark'] .match-compact {
    border-bottom-color: #2d3748;
  }

  .match-compact.completed {
    background: rgba(16, 185, 129, 0.05);
  }

  .match-compact.bye {
    background: rgba(250, 204, 21, 0.08);
    opacity: 0.8;
  }

  .match-teams {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    flex: 1;
    min-width: 0;
  }

  .team-name {
    color: #374151;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .team-name.winner {
    color: #10b981;
    font-weight: 700;
  }

  .transition-page[data-theme='dark'] .team-name {
    color: #e1e8ed;
  }

  .transition-page[data-theme='dark'] .team-name.winner {
    color: #34d399;
  }

  .bye-text {
    color: #d97706;
    font-style: italic;
    font-size: 0.7rem;
  }

  .match-result {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    margin-left: 0.5rem;
    font-weight: 700;
    min-width: 45px;
    justify-content: flex-end;
  }

  .result-score {
    color: #6b7280;
    font-size: 0.8rem;
  }

  .result-score.winner-a,
  .result-score.winner-b {
    color: #10b981;
  }

  .transition-page[data-theme='dark'] .result-score {
    color: #8b9bb3;
  }

  .transition-page[data-theme='dark'] .result-score.winner-a,
  .transition-page[data-theme='dark'] .result-score.winner-b {
    color: #34d399;
  }

  .result-separator {
    color: #9ca3af;
    font-size: 0.7rem;
  }

  .result-pending,
  .result-bye {
    color: #9ca3af;
    font-size: 0.75rem;
  }

  /* Scrollbar for rounds content */
  .rounds-content::-webkit-scrollbar {
    width: 6px;
  }

  .rounds-content::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  .rounds-content::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 3px;
  }

  .transition-page[data-theme='dark'] .rounds-content::-webkit-scrollbar-track {
    background: #0f1419;
  }

  /* Division summary badges */
  .division-summary {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .division-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    flex: 1;
    min-width: 140px;
    transition: all 0.2s;
  }

  .division-badge.gold {
    border-color: #fbbf24;
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%);
  }

  .division-badge.silver {
    border-color: #9ca3af;
    background: linear-gradient(135deg, rgba(156, 163, 175, 0.1) 0%, rgba(107, 114, 128, 0.05) 100%);
  }

  .division-badge.valid {
    border-color: #10b981;
  }

  .division-badge.invalid {
    border-color: #ef4444;
  }

  .division-icon {
    font-size: 1rem;
  }

  .division-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #6b7280;
  }

  .division-count {
    font-size: 1rem;
    font-weight: 700;
    color: #1a1a1a;
    margin-left: auto;
  }

  .validity-icon {
    font-size: 0.85rem;
    font-weight: 700;
    color: #10b981;
  }

  .validity-icon.invalid {
    color: #ef4444;
  }

  .division-validation-hint {
    margin-top: 0.5rem;
    padding: 0.4rem 0.75rem;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 6px;
    font-size: 0.75rem;
    color: #dc2626;
  }

  .transition-page[data-theme='dark'] .division-badge {
    background: #1a2332;
    border-color: #2d3748;
  }

  .transition-page[data-theme='dark'] .division-badge.gold {
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.08) 100%);
    border-color: #b45309;
  }

  .transition-page[data-theme='dark'] .division-badge.silver {
    background: linear-gradient(135deg, rgba(156, 163, 175, 0.15) 0%, rgba(107, 114, 128, 0.08) 100%);
    border-color: #4b5563;
  }

  .transition-page[data-theme='dark'] .division-badge.valid {
    border-color: #059669;
  }

  .transition-page[data-theme='dark'] .division-badge.invalid {
    border-color: #dc2626;
  }

  .transition-page[data-theme='dark'] .division-label {
    color: #8b9bb3;
  }

  .transition-page[data-theme='dark'] .division-count {
    color: #e1e8ed;
  }

  .transition-page[data-theme='dark'] .division-validation-hint {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #f87171;
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
    animation: loadingSpin 0.8s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes loadingSpin {
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
