<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import QualifierSelection from '$lib/components/tournament/QualifierSelection.svelte';
  import { adminTheme } from '$lib/stores/adminTheme';
  import { t } from '$lib/stores/language';
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
  import { generateBracket, generateSplitBrackets } from '$lib/firebase/tournamentBracket';
  import { updateTournament } from '$lib/firebase/tournaments';
  import type { Tournament } from '$lib/types/tournament';

  let tournament: Tournament | null = null;
  let loading = true;
  let error = false;
  let showToast = false;
  let toastMessage = '';
  let isProcessing = false;
  let showBracketPreview = false;

  // Qualifier selections per group
  let groupQualifiers: Map<number, string[]> = new Map();

  // For SPLIT_DIVISIONS: separate Gold and Silver selections
  let goldParticipants: string[] = [];
  let silverParticipants: string[] = [];

  // Final stage configuration
  let finalGameMode: 'points' | 'rounds' = 'points';
  let finalPointsToWin: number = 7;
  let finalRoundsToPlay: number = 4;
  let finalMatchesToWin: number = 1;

  // Silver bracket configuration (for SPLIT_DIVISIONS)
  let silverGameMode: 'points' | 'rounds' = 'points';
  let silverPointsToWin: number = 7;
  let silverRoundsToPlay: number = 4;
  let silverMatchesToWin: number = 1;

  // Global top N value for all groups
  let topNPerGroup: number = 2;

  $: tournamentId = $page.params.id;
  $: isSplitDivisions = tournament?.finalStageConfig?.mode === 'SPLIT_DIVISIONS';

  // For single bracket mode
  $: totalQualifiers = Array.from(groupQualifiers.values()).flat().length;
  $: isValidSize = isValidBracketSize(totalQualifiers);

  // For split divisions mode
  $: goldCount = goldParticipants.length;
  $: silverCount = silverParticipants.length;
  $: isValidGoldSize = isValidBracketSize(goldCount);
  $: isValidSilverSize = isValidBracketSize(silverCount);

  // Can proceed logic
  $: canProceed = isSplitDivisions
    ? (goldCount >= 2 && isValidGoldSize && silverCount >= 2 && isValidSilverSize)
    : (totalQualifiers >= 2 && isValidSize);

  $: bracketRoundNames = totalQualifiers > 0 ? getBracketRoundNames(totalQualifiers) : [];
  $: goldBracketRoundNames = goldCount > 0 ? getBracketRoundNames(goldCount) : [];
  $: silverBracketRoundNames = silverCount > 0 ? getBracketRoundNames(silverCount) : [];
  $: numGroups = tournament?.groupStage?.groups?.length || 1;
  $: suggestedQualifiers = tournament ? calculateSuggestedQualifiers(tournament.participants.length, numGroups) : { total: 4, perGroup: 2 };

  // Initialize topNPerGroup when suggested qualifiers are calculated
  let topNInitialized = false;
  $: if (!topNInitialized && suggestedQualifiers.perGroup > 0) {
    topNPerGroup = suggestedQualifiers.perGroup;
    topNInitialized = true;
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
        toastMessage = `⚠️ ${$t('tournamentNotInTransition')}`;
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}`), 1500);
      } else {
        // Initialize group qualifiers from current state
        // Ensure groups is an array (Firestore may return object)
        const groups = Array.isArray(tournament.groupStage?.groups)
          ? tournament.groupStage.groups
          : Object.values(tournament.groupStage?.groups || {});

        groups.forEach((group: any, index: number) => {
          const standings = Array.isArray(group.standings) ? group.standings : Object.values(group.standings || {});
          const qualified = standings
            .filter((s: any) => s.qualifiedForFinal)
            .map((s: any) => s.participantId);

          // If no qualifiers saved, auto-select top N
          if (qualified.length === 0 && standings.length > 0) {
            const sortedStandings = [...standings].sort((a: any, b: any) => a.position - b.position);
            const topN = sortedStandings.slice(0, topNPerGroup).map((s: any) => s.participantId);
            groupQualifiers.set(index, topN);
          } else {
            groupQualifiers.set(index, qualified);
          }
        });
        groupQualifiers = groupQualifiers; // Trigger reactivity

        // Load final stage config from tournament if it exists
        if (tournament.finalStageConfig) {
          // Gold bracket config
          finalGameMode = tournament.finalStageConfig.gameMode || 'points';
          finalPointsToWin = tournament.finalStageConfig.pointsToWin || 7;
          finalRoundsToPlay = tournament.finalStageConfig.roundsToPlay || 4;
          finalMatchesToWin = tournament.finalStageConfig.matchesToWin || 1;

          // Silver bracket config (for SPLIT_DIVISIONS)
          if (tournament.finalStageConfig.mode === 'SPLIT_DIVISIONS') {
            silverGameMode = tournament.finalStageConfig.silverGameMode || 'points';
            silverPointsToWin = tournament.finalStageConfig.silverPointsToWin || 7;
            silverRoundsToPlay = tournament.finalStageConfig.silverRoundsToPlay || 4;
            silverMatchesToWin = tournament.finalStageConfig.silverMatchesToWin || 1;
          }

        } else {
          // Default values
          finalGameMode = 'points';
          finalPointsToWin = 7;
          finalRoundsToPlay = 4;
          finalMatchesToWin = 1;
        }

        // Call distributeWithCrossSeeding after groupQualifiers is initialized (for SPLIT_DIVISIONS)
        if (tournament.finalStageConfig?.mode === 'SPLIT_DIVISIONS') {
          distributeWithCrossSeeding();
        }
      }
    } catch (err) {
      console.error('Error loading tournament:', err);
      error = true;
    } finally {
      loading = false;
    }
  }

  function handleQualifierUpdate(groupIndex: number, qualifiedIds: string[]) {
    groupQualifiers.set(groupIndex, qualifiedIds);
    groupQualifiers = groupQualifiers; // Trigger reactivity
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

        // Generate single bracket - pass all config including per-phase settings
        const bracketConfig = {
          gameMode: finalGameMode,
          pointsToWin: finalGameMode === 'points' ? finalPointsToWin : undefined,
          roundsToPlay: finalGameMode === 'rounds' ? finalRoundsToPlay : undefined,
          matchesToWin: finalMatchesToWin,
          // Pass per-phase configuration from finalStageConfig if available
          ...(tournament.finalStageConfig ? {
            earlyRoundsGameMode: tournament.finalStageConfig.earlyRoundsGameMode,
            earlyRoundsPointsToWin: tournament.finalStageConfig.earlyRoundsPointsToWin,
            earlyRoundsToPlay: tournament.finalStageConfig.earlyRoundsToPlay,
            semifinalGameMode: tournament.finalStageConfig.semifinalGameMode,
            semifinalPointsToWin: tournament.finalStageConfig.semifinalPointsToWin,
            semifinalRoundsToPlay: tournament.finalStageConfig.semifinalRoundsToPlay,
            semifinalMatchesToWin: tournament.finalStageConfig.semifinalMatchesToWin,
            finalGameMode: tournament.finalStageConfig.finalGameMode,
            finalPointsToWin: tournament.finalStageConfig.finalPointsToWin,
            finalRoundsToPlay: tournament.finalStageConfig.finalRoundsToPlay,
            finalMatchesToWin: tournament.finalStageConfig.finalMatchesToWin
          } : {})
        };
        const bracketSuccess = await generateBracket(tournamentId, bracketConfig);

        if (!bracketSuccess) {
          toastMessage = `❌ ${$t('errorGeneratingBracket')}`;
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

        // Generate both Gold and Silver brackets
        const bracketSuccess = await generateSplitBrackets(tournamentId, {
          goldParticipantIds: goldParticipants,
          silverParticipantIds: silverParticipants,
          goldConfig: {
            gameMode: finalGameMode,
            pointsToWin: finalGameMode === 'points' ? finalPointsToWin : undefined,
            roundsToPlay: finalGameMode === 'rounds' ? finalRoundsToPlay : undefined,
            matchesToWin: finalMatchesToWin
          },
          silverConfig: {
            gameMode: silverGameMode,
            pointsToWin: silverGameMode === 'points' ? silverPointsToWin : undefined,
            roundsToPlay: silverGameMode === 'rounds' ? silverRoundsToPlay : undefined,
            matchesToWin: silverMatchesToWin
          }
        });

        if (!bracketSuccess) {
          toastMessage = `❌ ${$t('errorGeneratingGoldSilverBrackets')}`;
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
          ? `✅ ${$t('goldSilverBracketsGenerated')}`
          : `✅ ${$t('bracketGeneratedAdvancing')}`;
        showToast = true;
        setTimeout(() => goto(`/admin/tournaments/${tournamentId}/bracket`), 1500);
      } else {
        toastMessage = `❌ ${$t('errorAdvancingToFinalStage')}`;
        showToast = true;
      }
    } catch (err) {
      console.error('Error generating bracket:', err);
      toastMessage = `❌ ${$t('errorGeneratingBracket')}`;
      showToast = true;
    } finally {
      isProcessing = false;
    }
  }

  async function loadBracketPreview() {
    if (!tournamentId) return;

    try {
      const qualified = await getQualifiedParticipants(tournamentId);
      console.log('Qualified participants:', qualified);
      showBracketPreview = true;
    } catch (err) {
      console.error('Error loading bracket preview:', err);
    }
  }

  $: if (totalQualifiers > 0) {
    loadBracketPreview();
  }

  // Track if user has manually moved participants (not just changed top N)
  let userManuallyEdited = false;

  // Auto-distribute when qualifiers change (for SPLIT_DIVISIONS)
  // Re-distribute automatically unless user has manually moved individual participants
  $: if (isSplitDivisions && totalQualifiers > 0 && !userManuallyEdited) {
    // Use the same logic as autoDistributeParticipants but inline
    distributeWithCrossSeeding();
  }

  function distributeWithCrossSeeding() {
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

    let goldList = applyCrossSeeding(qualifiedByPosition);
    let silverList = applyCrossSeeding(nonQualifiedByPosition);

    // Use all participants - brackets now support BYEs for non-power-of-2 counts
    goldParticipants = goldList;
    silverParticipants = silverList;
  }

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
          <button class="back-btn" on:click={() => goto(`/admin/tournaments/${tournamentId}`)}>←</button>
          <div class="header-main">
            <div class="title-section">
              <h1>{tournament.name}</h1>
              <div class="header-badges">
                <span class="info-badge phase-badge">
                  {$t('qualifierSelectionTitle')}
                </span>
              </div>
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
        <div class="loading-state">
          <div class="spinner"></div>
          <p>{$t('loadingTransition')}</p>
        </div>
      {:else if error || !tournament}
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>{$t('errorLoading')}</h3>
          <p>{$t('couldNotLoadTransition')}</p>
          <button class="primary-button" on:click={() => goto('/admin/tournaments')}>
            {$t('backToTournaments')}
          </button>
        </div>
      {:else}
        {#if isSplitDivisions}
          <!-- SPLIT_DIVISIONS: Step 1 - Select qualifiers from each group -->
          <div class="step-section">
            <div class="step-header">
              <span class="step-number">1</span>
              <div>
                <h2>{$t('selectQualifiersPerGroup')}</h2>
                <p class="help-text">{$t('totalQualifiersCount')}: <strong>{totalQualifiers}</strong> ({topNPerGroup} {$t('perGroupLabel')} × {numGroups} {$t('groups')})</p>
              </div>
              <div class="top-n-control">
                <label class="top-n-label">
                  <span>{$t('topNLabel')}</span>
                  <input
                    type="number"
                    class="top-n-input"
                    bind:value={topNPerGroup}
                    min="1"
                    max="10"
                  />
                  <span class="top-n-hint">{$t('perGroupLabel')}</span>
                </label>
              </div>
            </div>

            <div class="groups-section">
              <div class="groups-grid">
                {#if tournament.groupStage}
                  {#each tournament.groupStage.groups as group, index}
                    <QualifierSelection
                      {tournament}
                      groupIndex={index}
                      topN={topNPerGroup}
                      on:update={(e) => handleQualifierUpdate(index, e.detail)}
                    />
                  {/each}
                {/if}
              </div>
            </div>
          </div>

          <!-- SPLIT_DIVISIONS: Step 2 - Distribute to Gold/Silver -->
          {#if totalQualifiers >= 2}
            <div class="step-section">
              <div class="step-header">
                <span class="step-number">2</span>
                <div>
                  <h2>🥇🥈 {$t('goldSilverDistribution')}</h2>
                  <p class="help-text">
                    {$t('qualifiersToGoldRestToSilver')}
                  </p>
                </div>
                {#if userManuallyEdited}
                  <button class="auto-distribute-btn" on:click={autoDistributeParticipants} title="{$t('restoreAuto')}">
                    🔀 {$t('restoreAuto')}
                  </button>
                {/if}
              </div>

              <!-- Participant distribution -->
              <div class="distribution-section">
            <div class="brackets-distribution">
              <!-- Gold bracket participants -->
              <div class="bracket-card gold">
                <div class="bracket-header">
                  <h4>🥇 {$t('goldLeague')} ({goldCount})</h4>
                  <span class="validity-badge" class:valid={isValidGoldSize} class:invalid={!isValidGoldSize && goldCount > 0}>
                    {#if isValidGoldSize && goldCount > 0}✅{:else if goldCount > 0}❌{/if}
                  </span>
                </div>
                {#if goldBracketRoundNames.length > 0 && isValidGoldSize}
                  <p class="rounds-preview">{goldBracketRoundNames.join(' → ')}</p>
                {/if}
                <div class="participant-list">
                  {#each goldParticipants as participantId, index}
                    {@const p = getAllParticipantsFromGroups().find(x => x.id === participantId)}
                    <div class="participant-row gold">
                      <span class="seed-badge">{index + 1}</span>
                      <span class="name">{p?.name || $t('unknown')}</span>
                      <span class="position-tag">{p?.position || '?'}{p?.groupName?.charAt(p.groupName.length - 1) || '?'}</span>
                    </div>
                  {:else}
                    <p class="empty-message">{$t('noParticipants')}</p>
                  {/each}
                </div>
              </div>

              <!-- Silver bracket participants -->
              <div class="bracket-card silver">
                <div class="bracket-header">
                  <h4>🥈 {$t('silverLeague')} ({silverCount})</h4>
                  <span class="validity-badge" class:valid={isValidSilverSize} class:invalid={!isValidSilverSize && silverCount > 0}>
                    {#if isValidSilverSize && silverCount > 0}✅{:else if silverCount > 0}❌{/if}
                  </span>
                </div>
                {#if silverBracketRoundNames.length > 0 && isValidSilverSize}
                  <p class="rounds-preview">{silverBracketRoundNames.join(' → ')}</p>
                {/if}
                <div class="participant-list">
                  {#each silverParticipants as participantId, index}
                    {@const p = getAllParticipantsFromGroups().find(x => x.id === participantId)}
                    <div class="participant-row silver">
                      <span class="seed-badge">{index + 1} </span>
                      <span class="name">{p?.name || $t('unknown')}</span>
                      <span class="position-tag">{p?.position || '?'}{p?.groupName?.charAt(p.groupName.length - 1) || '?'}</span>
                    </div>
                  {:else}
                    <p class="empty-message">{$t('noParticipants')}</p>
                  {/each}
                </div>
              </div>
            </div>
            <!-- End of brackets-distribution -->

            <!-- Validation messages -->
            {#if !isValidGoldSize && goldCount > 0}
              <div class="validation-error">
                ⚠️ {$t('goldLeagueMustBePowerOf2').replace('{n}', String(goldCount))}
              </div>
            {/if}
            {#if !isValidSilverSize && silverCount > 0}
              <div class="validation-error">
                ⚠️ {$t('silverLeagueMustBePowerOf2').replace('{n}', String(silverCount))}
              </div>
            {/if}
          </div>
          <!-- End of distribution-section -->
        </div>
        <!-- End of step-section -->

        <!-- Step 3: Configuration for both brackets -->
        <div class="step-section">
          <div class="step-header">
            <span class="step-number">3</span>
            <div>
              <h2>{$t('matchConfiguration')}</h2>
              <p class="help-text">{$t('configureMatchFormat')}</p>
            </div>
          </div>

          <div class="dual-config-section">
            <!-- Gold bracket config -->
            <div class="bracket-config gold">
              <h3>🥇 {$t('goldLeague')}</h3>
              <div class="config-grid">
                <div class="config-field">
                  <label for="goldGameMode">{$t('gameModeLabel')}</label>
                  <select id="goldGameMode" bind:value={finalGameMode} class="select-input">
                    <option value="points">{$t('byPointsOption')}</option>
                    <option value="rounds">{$t('byRoundsOption')}</option>
                  </select>
                </div>
                {#if finalGameMode === 'points'}
                  <div class="config-field">
                    <label for="goldPointsToWin">{$t('pointsToWinLabel')}</label>
                    <input id="goldPointsToWin" type="number" bind:value={finalPointsToWin} min="1" max="15" class="number-input" />
                  </div>
                {:else}
                  <div class="config-field">
                    <label for="goldRoundsToPlay">{$t('roundsToPlayLabel')}</label>
                    <input id="goldRoundsToPlay" type="number" bind:value={finalRoundsToPlay} min="1" max="12" class="number-input" />
                  </div>
                {/if}
                <div class="config-field">
                  <label for="goldMatchesToWin">{$t('bestOfLabel')}</label>
                  <select id="goldMatchesToWin" bind:value={finalMatchesToWin} class="select-input">
                    <option value={1}>1 ({$t('noRematch')})</option>
                    <option value={3}>3 ({$t('winsToN')} 2)</option>
                    <option value={5}>5 ({$t('winsToN')} 3)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Silver bracket config -->
            <div class="bracket-config silver">
              <h3>🥈 {$t('silverLeague')}</h3>
              <div class="config-grid">
                <div class="config-field">
                  <label for="silverGameMode">{$t('gameModeLabel')}</label>
                  <select id="silverGameMode" bind:value={silverGameMode} class="select-input">
                    <option value="points">{$t('byPointsOption')}</option>
                    <option value="rounds">{$t('byRoundsOption')}</option>
                  </select>
                </div>
                {#if silverGameMode === 'points'}
                  <div class="config-field">
                    <label for="silverPointsToWin">{$t('pointsToWinLabel')}</label>
                    <input id="silverPointsToWin" type="number" bind:value={silverPointsToWin} min="1" max="15" class="number-input" />
                  </div>
                {:else}
                  <div class="config-field">
                    <label for="silverRoundsToPlay">{$t('roundsToPlayLabel')}</label>
                    <input id="silverRoundsToPlay" type="number" bind:value={silverRoundsToPlay} min="1" max="12" class="number-input" />
                  </div>
                {/if}
                <div class="config-field">
                  <label for="silverMatchesToWin">{$t('bestOfLabel')}</label>
                  <select id="silverMatchesToWin" bind:value={silverMatchesToWin} class="select-input">
                    <option value={1}>1 ({$t('noRematch')})</option>
                    <option value={3}>3 ({$t('winsToN')} 2)</option>
                    <option value={5}>5 ({$t('winsToN')} 3)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}
      <!-- End of totalQualifiers >= 4 condition -->

      {:else}
        <!-- SINGLE_BRACKET: Original flow -->
          <!-- Final stage configuration -->
          <div class="config-section">
            <div class="config-card">
              <h3>🏆 {$t('finalStageConfigTitle')}</h3>
              <p class="help-text" style="margin-bottom: 1.5rem; color: #6b7280;">
                {$t('defaultConfigHint')}
              </p>
              <div class="config-grid">
                <!-- Game mode -->
                <div class="config-field">
                  <label for="gameMode">{$t('gameModeLabel')}</label>
                  <select id="gameMode" bind:value={finalGameMode} class="select-input">
                    <option value="points">{$t('byPointsOption')}</option>
                    <option value="rounds">{$t('byRoundsOption')}</option>
                  </select>
                </div>

                <!-- Points to win / Rounds to play -->
                {#if finalGameMode === 'points'}
                  <div class="config-field">
                    <label for="pointsToWin">{$t('pointsToWinLabel')}</label>
                    <input
                      id="pointsToWin"
                      type="number"
                      bind:value={finalPointsToWin}
                      min="1"
                      max="15"
                      class="number-input"
                    />
                  </div>
                {:else}
                  <div class="config-field">
                    <label for="roundsToPlay">{$t('roundsToPlayLabel')}</label>
                    <input
                      id="roundsToPlay"
                      type="number"
                      bind:value={finalRoundsToPlay}
                      min="1"
                      max="12"
                      class="number-input"
                    />
                  </div>
                {/if}

                <!-- Matches to win -->
                <div class="config-field">
                  <label for="matchesToWin">{$t('bestOfLabel')}</label>
                  <select id="matchesToWin" bind:value={finalMatchesToWin} class="select-input">
                    <option value={1}>1 ({$t('noRematch')})</option>
                    <option value={3}>3 ({$t('winsToN')} 2)</option>
                    <option value={5}>5 ({$t('winsToN')} 3)</option>
                    <option value={7}>7 ({$t('winsToN')} 4)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Qualifier selections per group -->
          <div class="groups-section">
            <div class="groups-header">
              <h2>{$t('selectQualifiersPerGroup')}</h2>
              <div class="top-n-control">
                <label class="top-n-label">
                  <span>{$t('topNLabel')}</span>
                  <input
                    type="number"
                    class="top-n-input"
                    bind:value={topNPerGroup}
                    min="1"
                    max="10"
                  />
                  <span class="top-n-hint">{$t('perGroupLabel')}</span>
                </label>
              </div>
            </div>
            <div class="groups-grid">
              {#if tournament.groupStage}
                {#each tournament.groupStage.groups as group, index}
                  <QualifierSelection
                    {tournament}
                    groupIndex={index}
                    topN={topNPerGroup}
                    on:update={(e) => handleQualifierUpdate(index, e.detail)}
                  />
                {/each}
              {/if}
            </div>
          </div>

          <!-- Summary and validation -->
          <div class="summary-section">
            <div class="summary-card">
              <h3>{$t('summaryTitle')}</h3>
              <div class="summary-stats">
                <div class="stat-item">
                  <span class="stat-label">{$t('totalParticipantsLabel')}</span>
                  <span class="stat-value">{tournament.participants.length}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">{$t('suggestedForBracket')}</span>
                  <span class="stat-value suggestion">
                    {suggestedQualifiers.total} {$t('qualifiersWithPerGroup').replace('{perGroup}', String(suggestedQualifiers.perGroup))}
                  </span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">{$t('totalQualifiersLabel')}</span>
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
                  <span class="stat-label">{$t('bracketSizeLabel')}</span>
                  <span class="stat-value" class:valid={isValidSize} class:invalid={!isValidSize && totalQualifiers > 0}>
                    {#if isValidSize}
                      ✅ {totalQualifiers} {$t('participants')}
                    {:else if totalQualifiers > 0}
                      ❌ {$t('mustBePowerOf2Full')}
                    {:else}
                      {$t('selectQualifiersHint')}
                    {/if}
                  </span>
                </div>
                {#if isValidSize && totalQualifiers > 0}
                  <div class="stat-item">
                    <span class="stat-label">{$t('bracketRoundsLabel')}</span>
                    <span class="stat-value">{bracketRoundNames.join(' → ')}</span>
                  </div>
                {/if}
              </div>

              {#if !isValidSize && totalQualifiers > 0}
                <div class="validation-error">
                  ⚠️ {$t('qualifiersMustBePowerOf2')}
                  <br />
                  {$t('mustBePowerOf2Full')}
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Action buttons -->
        <div class="actions-section">
          <button
            class="action-btn generate"
            on:click={handleGenerateBracket}
            disabled={isProcessing || !canProceed}
          >
            {#if isProcessing}
              ⏳ {$t('generatingBracket')}
            {:else if isSplitDivisions}
              🏆 {$t('generateGoldSilverBrackets')}
            {:else}
              🏆 {$t('generateBracketAndAdvance')}
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
</AdminGuard>

<Toast bind:visible={showToast} message={toastMessage} />

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

  .top-n-control {
    display: flex;
    align-items: center;
  }

  .top-n-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .transition-page[data-theme='dark'] .top-n-label {
    color: #e1e8ed;
  }

  .top-n-input {
    width: 45px;
    padding: 0.25rem 0.35rem;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    color: #1a1a1a;
    transition: all 0.2s;
  }

  .top-n-input:focus {
    outline: none;
    border-color: #667eea;
  }

  .transition-page[data-theme='dark'] .top-n-input {
    background: #0f1419;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  .top-n-hint {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 400;
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

  .actions-section {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .action-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn.generate {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .action-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  .step-header .top-n-control {
    margin-left: auto;
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
</style>
