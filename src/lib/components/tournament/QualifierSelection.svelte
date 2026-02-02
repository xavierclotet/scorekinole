<script lang="ts">
  import type { Tournament } from '$lib/types/tournament';
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    tournament: Tournament;
    groupIndex: number;
    topN?: number; // Controlled from parent
    showTopControl?: boolean; // Only show in first group or externally
    onupdate?: (qualifiedIds: string[]) => void;
    onstandingsChanged?: (data: { groupIndex: number; standings: any[] }) => void;
    ontiesStatusChanged?: (data: { groupIndex: number; hasUnresolvedTies: boolean }) => void;
  }

  let {
    tournament,
    groupIndex,
    topN = 2,
    showTopControl = false,
    onupdate,
    onstandingsChanged,
    ontiesStatusChanged
  }: Props = $props();

  // Modal state for player matches
  let showMatchesModal = $state(false);
  let selectedPlayerId = $state<string | null>(null);
  let selectedPlayerMatches = $state<Array<{
    opponent: string;
    opponentName: string;
    result: 'win' | 'loss' | 'tie';
    scoreA: number;
    scoreB: number;
    roundNumber: number;
  }>>([]);

  // Modal state for mini-league tiebreaker
  let showTiebreakerModal = $state(false);
  let tiebreakerData = $state<Array<{
    participantId: string;
    name: string;
    miniPts: number;
    mini20s: number;
    total20s: number;
    hasSubTie: boolean;  // True if resolved by total20s (same miniPts and mini20s as another)
  }>>([]);
  let hasAnySubTie = $state(false);  // True if any player has a sub-tie

  // Ensure groups is an array (Firestore may return object)
  let groups = $derived(Array.isArray(tournament.groupStage?.groups)
    ? tournament.groupStage.groups
    : Object.values(tournament.groupStage?.groups || {}));

  // Get ranking configuration
  // Check both groupStage.type and the presence of pairings (Swiss uses pairings, RR uses schedule)
  let isSwiss = $derived(
    tournament.groupStage?.type === 'SWISS' ||
    (tournament.groupStage?.groups?.[0]?.pairings && !tournament.groupStage?.groups?.[0]?.schedule)
  );
  let qualificationMode = $derived((tournament.groupStage?.qualificationMode || tournament.groupStage?.qualificationMode || tournament.groupStage?.swissRankingSystem || 'WINS') as 'WINS' | 'POINTS');

  // Track previous topN to detect changes (not reactive - just for comparison)
  let previousTopN = topN;

  let group = $derived(groups[groupIndex]);

  // Ensure standings is an array and sort by position
  let standings = $derived((() => {
    if (!group?.standings) return [];
    const arr = Array.isArray(group.standings) ? group.standings : Object.values(group.standings);
    // Use spread to create a copy before sorting (sort mutates in place, forbidden in $derived)
    return [...arr].sort((a: any, b: any) => a.position - b.position);
  })());

  let participantMap = $derived(new Map(tournament.participants.map(p => [p.id, p])));

  // Local state for selection - NOT reactive to avoid overwriting manual changes
  let selectedParticipants = $state(new Set<string>());
  let initialized = $state(false);

  // Auto-select when topN prop changes from parent
  $effect(() => {
    if (topN !== previousTopN && topN >= 1 && topN <= 10 && standings.length > 0) {
      previousTopN = topN;
      selectTop(topN);
    }
  });

  // Initialize selection only once when standings become available
  $effect(() => {
    if (standings.length > 0 && !initialized) {
      initialized = true;
      const currentQualified = standings.filter((s: any) => s.qualifiedForFinal).map((s: any) => s.participantId);

      // If no qualifiers set yet, auto-select topN participants
      if (currentQualified.length === 0 && standings.length >= topN) {
        const topNList = [...standings]
          .sort((a: any, b: any) => a.position - b.position)
          .slice(0, topN)
          .map((s: any) => s.participantId);

        selectedParticipants = new Set<string>(topNList);

        // Dispatch the auto-selection
        if (topNList.length > 0) {
          setTimeout(() => onupdate?.(topNList), 0);
        }
      } else {
        selectedParticipants = new Set<string>(currentQualified);
      }
    }
  });

  function toggleParticipant(participantId: string) {
    // Create a new Set to ensure Svelte reactivity
    const newSet = new Set(selectedParticipants);
    if (newSet.has(participantId)) {
      newSet.delete(participantId);
    } else {
      newSet.add(participantId);
    }
    selectedParticipants = newSet; // Assign new Set to trigger reactivity
    onupdate?.(Array.from(selectedParticipants));
  }

  function selectTop(n: number) {
    selectedParticipants = new Set(
      [...standings]
        .sort((a: any, b: any) => a.position - b.position)
        .slice(0, n)
        .map((s: any) => s.participantId)
    );
    onupdate?.(Array.from(selectedParticipants));
  }

  function getParticipantName(participantId: string): string {
    return participantMap.get(participantId)?.name || 'Unknown';
  }

  function getTiedWithNames(tiedWith: string[] | undefined): string {
    if (!tiedWith || tiedWith.length === 0) return '';
    return tiedWith.map(id => getParticipantName(id)).join(', ');
  }

  // Check if there are unresolved ties in this group
  let hasUnresolvedTies = $derived(standings.some((s: any) => s.tiedWith && s.tiedWith.length > 0));

  // Track previous tie status to only emit when it changes (not reactive - just for comparison)
  let previousTieStatus: boolean | null = null;

  // Emit tie status only when it actually changes
  $effect(() => {
    if (standings.length > 0 && previousTieStatus !== hasUnresolvedTies) {
      previousTieStatus = hasUnresolvedTies;
      ontiesStatusChanged?.({ groupIndex, hasUnresolvedTies });
    }
  });

  // Group standings by primary value (points/swissPoints) to detect ties
  // This helps show mini-league button even when ties were resolved
  let standingsByPrimaryValue = $derived((() => {
    const groups = new Map<number, string[]>();
    for (const s of standings) {
      const primaryValue = isSwiss
        ? (s.swissPoints ?? (s.matchesWon * 2 + s.matchesTied))
        : s.points;
      if (!groups.has(primaryValue)) {
        groups.set(primaryValue, []);
      }
      groups.get(primaryValue)!.push(s.participantId);
    }
    return groups;
  })());

  // Check if a player is part of a 3+ player tie (same primary value)
  function isPartOfMultiTie(participantId: string): boolean {
    for (const [_, ids] of standingsByPrimaryValue) {
      if (ids.includes(participantId) && ids.length >= 3) {
        return true;
      }
    }
    return false;
  }

  // Check if this is the first player in a multi-tie group (to show button only once)
  function isFirstInMultiTie(participantId: string): boolean {
    for (const [_, ids] of standingsByPrimaryValue) {
      if (ids.includes(participantId) && ids.length >= 3) {
        // Find the first one by position in standings
        const firstId = standings
          .filter((s: any) => ids.includes(s.participantId))
          .sort((a: any, b: any) => a.position - b.position)[0]?.participantId;
        return firstId === participantId;
      }
    }
    return false;
  }

  // Get all participants in the same primary value group
  function getTiedGroupIds(participantId: string): string[] {
    for (const [_, ids] of standingsByPrimaryValue) {
      if (ids.includes(participantId)) {
        return ids;
      }
    }
    return [participantId];
  }

  // Move a participant up (swap with the one above)
  function moveUp(participantId: string, event: MouseEvent) {
    event.stopPropagation();
    const idx = standings.findIndex((s: any) => s.participantId === participantId);
    if (idx <= 0) return; // Can't move up if already first

    const current = standings[idx];
    const above = standings[idx - 1];

    // Only allow if they are tied with each other
    if (!current.tiedWith?.includes(above.participantId)) return;

    // Swap positions
    const tempPos = current.position;
    current.position = above.position;
    above.position = tempPos;

    // Clear the tie between these two (they've been manually ordered)
    current.tiedWith = current.tiedWith?.filter((id: string) => id !== above.participantId);
    above.tiedWith = above.tiedWith?.filter((id: string) => id !== current.participantId);

    // If no more ties, clear tieReason
    if (!current.tiedWith || current.tiedWith.length === 0) {
      current.tiedWith = undefined;
      current.tieReason = undefined;
    }
    if (!above.tiedWith || above.tiedWith.length === 0) {
      above.tiedWith = undefined;
      above.tieReason = undefined;
    }

    // Emit the change (standings will auto-resort via $derived when group.standings updates)
    onstandingsChanged?.({ groupIndex, standings: [...standings] });
  }

  // Move a participant down (swap with the one below)
  function moveDown(participantId: string, event: MouseEvent) {
    event.stopPropagation();
    const idx = standings.findIndex((s: any) => s.participantId === participantId);
    if (idx < 0 || idx >= standings.length - 1) return; // Can't move down if already last

    const current = standings[idx];
    const below = standings[idx + 1];

    // Only allow if they are tied with each other
    if (!current.tiedWith?.includes(below.participantId)) return;

    // Swap positions
    const tempPos = current.position;
    current.position = below.position;
    below.position = tempPos;

    // Clear the tie between these two (they've been manually ordered)
    current.tiedWith = current.tiedWith?.filter((id: string) => id !== below.participantId);
    below.tiedWith = below.tiedWith?.filter((id: string) => id !== current.participantId);

    // If no more ties, clear tieReason
    if (!current.tiedWith || current.tiedWith.length === 0) {
      current.tiedWith = undefined;
      current.tieReason = undefined;
    }
    if (!below.tiedWith || below.tiedWith.length === 0) {
      below.tiedWith = undefined;
      below.tieReason = undefined;
    }

    // Emit the change (standings will auto-resort via $derived when group.standings updates)
    onstandingsChanged?.({ groupIndex, standings: [...standings] });
  }

  // Check if participant can move up (has a tie with the one above)
  function canMoveUp(participantId: string): boolean {
    const idx = standings.findIndex((s: any) => s.participantId === participantId);
    if (idx <= 0) return false;
    const current = standings[idx];
    const above = standings[idx - 1];
    return current.tiedWith?.includes(above.participantId) ?? false;
  }

  // Check if participant can move down (has a tie with the one below)
  function canMoveDown(participantId: string): boolean {
    const idx = standings.findIndex((s: any) => s.participantId === participantId);
    if (idx < 0 || idx >= standings.length - 1) return false;
    const current = standings[idx];
    const below = standings[idx + 1];
    return current.tiedWith?.includes(below.participantId) ?? false;
  }

  // Confirm current order for a participant (clear their tie without moving)
  function confirmOrder(participantId: string, event: MouseEvent) {
    event.stopPropagation();
    const standing = standings.find((s: any) => s.participantId === participantId);
    if (!standing || !standing.tiedWith) return;

    // Clear ties for this participant and all they were tied with
    const tiedWithIds = [...standing.tiedWith];

    // Clear this participant's tie
    standing.tiedWith = undefined;
    standing.tieReason = undefined;

    // Also clear the tie reference from other participants
    for (const otherId of tiedWithIds) {
      const other = standings.find((s: any) => s.participantId === otherId);
      if (other && other.tiedWith) {
        other.tiedWith = other.tiedWith.filter((id: string) => id !== participantId);
        if (other.tiedWith.length === 0) {
          other.tiedWith = undefined;
          other.tieReason = undefined;
        }
      }
    }

    // Emit the change to parent (parent updates source data, $derived recalculates)
    onstandingsChanged?.({ groupIndex, standings: [...standings] });
  }

  function openPlayerMatches(participantId: string, event: MouseEvent) {
    event.stopPropagation(); // Don't trigger row selection
    selectedPlayerId = participantId;
    selectedPlayerMatches = [];

    // Get all matches for this player from pairings (Swiss) or schedule (Round Robin)
    const allRounds = group?.pairings || group?.schedule || [];

    for (const round of allRounds) {
      for (const match of round.matches) {
        if (match.participantA === participantId || match.participantB === participantId) {
          // Skip BYE matches
          if (match.participantB === 'BYE' || match.participantA === 'BYE') continue;

          const isPlayerA = match.participantA === participantId;
          const opponentId = isPlayerA ? match.participantB : match.participantA;
          const playerScore = isPlayerA ? (match.totalPointsA ?? 0) : (match.totalPointsB ?? 0);
          const opponentScore = isPlayerA ? (match.totalPointsB ?? 0) : (match.totalPointsA ?? 0);

          let result: 'win' | 'loss' | 'tie' = 'tie';
          if (match.winner === participantId) {
            result = 'win';
          } else if (match.winner && match.winner !== participantId) {
            result = 'loss';
          } else if (playerScore > opponentScore) {
            result = 'win';
          } else if (playerScore < opponentScore) {
            result = 'loss';
          }

          selectedPlayerMatches.push({
            opponent: opponentId,
            opponentName: getParticipantName(opponentId),
            result,
            scoreA: playerScore,
            scoreB: opponentScore,
            roundNumber: round.roundNumber
          });
        }
      }
    }

    // Sort by round number
    selectedPlayerMatches.sort((a, b) => a.roundNumber - b.roundNumber);
    showMatchesModal = true;
  }

  function closeMatchesModal() {
    showMatchesModal = false;
    selectedPlayerId = null;
    selectedPlayerMatches = [];
  }

  // Calculate mini-league points for a participant (only matches between tied players)
  function calculateMiniLeaguePoints(standing: any, tiedIds: Set<string>): number {
    if (!standing.headToHeadRecord) return 0;

    let points = 0;
    for (const opponentId of tiedIds) {
      if (opponentId === standing.participantId) continue;
      const record = standing.headToHeadRecord[opponentId];
      if (record) {
        if (record.result === 'WIN') points += 2;
        else if (record.result === 'TIE') points += 1;
      }
    }
    return points;
  }

  // Calculate mini-league 20s for a participant (only matches between tied players)
  function calculateMiniLeague20s(standing: any, tiedIds: Set<string>): number {
    if (!standing.headToHeadRecord) return 0;

    let twenties = 0;
    for (const opponentId of tiedIds) {
      if (opponentId === standing.participantId) continue;
      const record = standing.headToHeadRecord[opponentId];
      if (record) {
        twenties += record.twenties;
      }
    }
    return twenties;
  }

  // Open mini-league tiebreaker modal
  function openTiebreakerModal(standing: any, event: MouseEvent) {
    event.stopPropagation();

    // Get all participant IDs with the same primary value
    const groupIds = getTiedGroupIds(standing.participantId);
    if (groupIds.length < 3) return;

    const tiedIds = new Set(groupIds);

    // Build the mini-league data
    tiebreakerData = [];
    for (const id of tiedIds) {
      const s = standings.find((st: any) => st.participantId === id);
      if (s) {
        tiebreakerData.push({
          participantId: id,
          name: getParticipantName(id),
          miniPts: calculateMiniLeaguePoints(s, tiedIds),
          mini20s: calculateMiniLeague20s(s, tiedIds),
          total20s: s.total20s || 0,
          hasSubTie: false
        });
      }
    }

    // Sort by mini-league points, then by mini-league 20s, then by total 20s
    tiebreakerData.sort((a, b) => {
      if (b.miniPts !== a.miniPts) return b.miniPts - a.miniPts;
      if (b.mini20s !== a.mini20s) return b.mini20s - a.mini20s;
      return b.total20s - a.total20s;
    });

    // Detect sub-ties (same miniPts AND mini20s)
    hasAnySubTie = false;
    for (let i = 0; i < tiebreakerData.length; i++) {
      for (let j = i + 1; j < tiebreakerData.length; j++) {
        if (tiebreakerData[i].miniPts === tiebreakerData[j].miniPts &&
            tiebreakerData[i].mini20s === tiebreakerData[j].mini20s) {
          tiebreakerData[i].hasSubTie = true;
          tiebreakerData[j].hasSubTie = true;
          hasAnySubTie = true;
        }
      }
    }

    showTiebreakerModal = true;
  }

  function closeTiebreakerModal() {
    showTiebreakerModal = false;
    tiebreakerData = [];
  }

  let selectedCount = $derived(selectedParticipants.size);
</script>

<div class="qualifier-selection">
  <div class="group-header">
    <h3>{group?.name}</h3>
  </div>

  <!-- Standings table with checkboxes -->
  <div class="standings-table">
    <table>
      <thead>
        <tr>
          <th class="checkbox-col"></th>
          <th class="pos-col">#</th>
          <th class="name-col">{m.tournament_participant()}</th>
          <th class="matches-col">{m.tournament_matchesPlayed()}</th>
          <th class="wins-col">{m.tournament_matchesWon()}</th>
          <th class="losses-col">{m.tournament_matchesLost()}</th>
          <th class="ties-col">{m.tournament_matchesTied()}</th>
          {#if qualificationMode === 'WINS'}
            <th class="points-col primary-col" title={m.tournament_pointsStandard()}>{m.tournament_pointsShort()}</th>
          {/if}
          <th class="twenties-col">{m.tournament_twentiesShort()}</th>
          <th class="scored-col" class:primary-col={qualificationMode === 'POINTS'} title={m.tournament_totalCrokinolePoints()}>PT</th>
        </tr>
      </thead>
      <tbody>
        {#each standings as standing}
          {@const isSelected = selectedParticipants.has(standing.participantId)}
          {@const swissPoints = standing.swissPoints ?? (standing.matchesWon * 2 + standing.matchesTied)}
          {@const hasTie = standing.tiedWith && standing.tiedWith.length > 0}
          {@const tiedNames = getTiedWithNames(standing.tiedWith)}
          {@const inMultiTie = isPartOfMultiTie(standing.participantId)}
          <tr
            class:selected={isSelected}
            class:has-tie={hasTie}
            class:in-multi-tie={inMultiTie && !isSwiss}
            onclick={() => toggleParticipant(standing.participantId)}
            role="button"
            tabindex="0"
          >
            <td class="checkbox-col">
              <input
                type="checkbox"
                checked={isSelected}
                onclick={(e: MouseEvent) => e.stopPropagation()}
                onchange={() => toggleParticipant(standing.participantId)}
              />
            </td>
            <td class="pos-col">
              <div class="position-cell">
                <span class="position-badge" class:selected={isSelected} class:tied={hasTie}>
                  {standing.position}
                </span>
              </div>
            </td>
            <td class="name-col">
              <div class="name-cell">
                <span class="player-name">{getParticipantName(standing.participantId)}</span>
                {#if !isSwiss && qualificationMode === 'WINS' && isFirstInMultiTie(standing.participantId)}
                  <!-- First player in 3+ tie group - show mini-league button (only for Round Robin with WINS mode) -->
                  <button
                    class="tie-badge"
                    onclick={(e: MouseEvent) => openTiebreakerModal(standing, e)}
                    title="{m.tournament_miniLeagueTiebreaker()}"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4"/>
                      <path d="M14 4h6v6"/>
                      <path d="M20 4L10 14"/>
                    </svg>
                  </button>
                {/if}
                {#if hasTie}
                  <!-- Unresolved tie - show warning and resolve buttons -->
                  <span class="tie-indicator" title="{m.tournament_tiedWith()}: {tiedNames}">⚠️</span>
                  {#if canMoveDown(standing.participantId)}
                    <div class="tie-actions">
                      <button
                        class="tie-btn confirm-btn"
                        onclick={(e: MouseEvent) => confirmOrder(standing.participantId, e)}
                        title={m.tournament_confirmOrder()}
                      >=</button>
                      <button
                        class="tie-btn swap-btn"
                        onclick={(e: MouseEvent) => moveDown(standing.participantId, e)}
                        title={m.tournament_swapOrder()}
                      >↓</button>
                    </div>
                  {/if}
                {/if}
              </div>
            </td>
            <td class="matches-col">{standing.matchesPlayed}</td>
            <td class="wins-col">{standing.matchesWon}</td>
            <td class="losses-col">{standing.matchesLost}</td>
            <td class="ties-col">{standing.matchesTied}</td>
            {#if qualificationMode === 'WINS'}
              <td
                class="points-col primary-col clickable-pts"
                onclick={(e: MouseEvent) => openPlayerMatches(standing.participantId, e)}
                title={m.tournament_viewMatches()}
              >
                <strong>{isSwiss ? swissPoints : standing.points}</strong>
              </td>
            {/if}
            <td class="twenties-col">{standing.total20s}</td>
            <td class="scored-col" class:primary-col={qualificationMode === 'POINTS'}>
              {#if qualificationMode === 'POINTS'}<strong>{standing.totalPointsScored}</strong>{:else}{standing.totalPointsScored}{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<!-- Mini-league Tiebreaker Modal -->
{#if showTiebreakerModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={closeTiebreakerModal} onkeydown={(e) => e.key === 'Escape' && closeTiebreakerModal()} role="button" tabindex="0">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tiebreaker-modal" onclick={(e: MouseEvent) => e.stopPropagation()} onkeydown={(e: KeyboardEvent) => e.stopPropagation()} role="dialog" aria-modal="true">
      <div class="modal-header tiebreaker-header">
        <h3>{m.tournament_miniLeagueTiebreaker()}</h3>
        <button class="close-btn" onclick={closeTiebreakerModal} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-description">{m.tournament_miniLeagueDescription()}</p>
        <table class="tiebreaker-table">
          <thead>
            <tr>
              <th class="pos-col">#</th>
              <th class="name-col">{m.tournament_participant()}</th>
              <th class="mini-pts-col">{m.tournament_pointsShort()}</th>
              <th class="mini-20s-col">{m.tournament_twentiesShort()}</th>
            </tr>
          </thead>
          <tbody>
            {#each tiebreakerData as player, i (player.participantId)}
              <tr>
                <td class="pos-col">
                  <span class="position-badge tied">{i + 1}</span>
                </td>
                <td class="name-col">
                  <span class="player-name">{player.name}</span>
                </td>
                <td class="mini-pts-col"><strong>{player.miniPts}</strong></td>
                <td class="mini-20s-col">{player.mini20s}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}

<!-- Player Matches Modal -->
{#if showMatchesModal && selectedPlayerId}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={closeMatchesModal} role="button" tabindex="0" onkeydown={(e) => e.key === 'Escape' && closeMatchesModal()}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-content" onclick={(e: MouseEvent) => e.stopPropagation()} role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>{getParticipantName(selectedPlayerId)}</h3>
        <button class="close-btn" onclick={closeMatchesModal} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        {#if selectedPlayerMatches.length === 0}
          <p class="no-matches">{m.tournament_noMatchesYet()}</p>
        {:else}
          <div class="matches-list">
            {#each selectedPlayerMatches as match}
              <div class="match-item" class:win={match.result === 'win'} class:loss={match.result === 'loss'} class:tie={match.result === 'tie'}>
                <span class="round-badge">R{match.roundNumber}</span>
                <span class="opponent-name">{match.opponentName}</span>
                <span class="match-score">
                  <span class="score-player">{match.scoreA}</span>
                  <span class="score-sep">-</span>
                  <span class="score-opponent">{match.scoreB}</span>
                </span>
                <span class="result-badge" class:win={match.result === 'win'} class:loss={match.result === 'loss'} class:tie={match.result === 'tie'}>
                  {#if match.result === 'win'}W{:else if match.result === 'loss'}L{:else}T{/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .qualifier-selection {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.75rem;
    transition: all 0.3s;
  }

  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .group-header h3 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .selection-info {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .count {
    background: #667eea;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .standings-table {
    overflow-x: auto;
    border-radius: 4px;
  }

  /* Scrollbar styling - Green theme */
  .standings-table::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .standings-table::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  .standings-table::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-radius: 3px;
  }

  .standings-table::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  thead {
    background: #f3f4f6;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th {
    padding: 0.35rem 0.25rem;
    text-align: center;
    font-weight: 600;
    color: #6b7280;
    font-size: 0.65rem;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  tbody tr {
    cursor: pointer;
    transition: all 0.15s;
    border-bottom: 1px solid #f3f4f6;
  }

  tbody tr:hover {
    background: #f3f4f6;
  }

  tbody tr.selected {
    background: #eff6ff;
  }

  td {
    padding: 0.3rem 0.25rem;
    text-align: center;
    color: #1a1a1a;
    font-size: 0.75rem;
  }

  .checkbox-col {
    width: 28px;
  }

  .checkbox-col input[type="checkbox"] {
    width: 0.9rem;
    height: 0.9rem;
    cursor: pointer;
  }

  .pos-col {
    width: 80px;
    min-width: 80px;
  }

  th.pos-col {
    text-align: center;
  }

  .position-cell {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .player-name {
    flex-shrink: 0;
  }

  .tie-actions {
    display: inline-flex;
    gap: 6px;
    margin-left: 0.25rem;
  }

  .tie-btn {
    border: none;
    color: white;
    width: 18px;
    height: 18px;
    font-size: 0.65rem;
    font-weight: bold;
    line-height: 1;
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .confirm-btn {
    background: #10b981;
  }

  .confirm-btn:hover {
    background: #059669;
    transform: scale(1.05);
  }

  .swap-btn {
    background: #f59e0b;
  }

  .swap-btn:hover {
    background: #d97706;
    transform: scale(1.05);
  }

  .position-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: #e5e7eb;
    color: #374151;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .position-badge.selected {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .name-col {
    text-align: left;
    font-weight: 500;
    min-width: 100px;
  }

  .matches-col,
  .wins-col,
  .losses-col,
  .ties-col {
    width: 32px;
    font-size: 0.75rem;
  }

  .points-col {
    width: 40px;
    font-weight: 700;
    font-size: 0.95rem;
  }

  .twenties-col {
    width: 36px;
    color: #f59e0b;
    font-weight: 600;
  }

  .scored-col {
    width: 40px;
    color: #6b7280;
  }

  .clickable-pts {
    cursor: pointer;
    transition: all 0.15s;
  }

  .clickable-pts:hover {
    background: rgba(102, 126, 234, 0.15) !important;
    text-decoration: underline;
  }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    max-width: 400px;
    width: 100%;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: #1a1a1a;
  }

  .modal-body {
    padding: 0.75rem;
    overflow-y: auto;
  }

  .no-matches {
    text-align: center;
    color: #6b7280;
    padding: 1rem;
    font-size: 0.85rem;
  }

  .matches-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .match-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    border-radius: 6px;
    border-left: 3px solid #e5e7eb;
  }

  .match-item.win {
    border-left-color: #10b981;
    background: rgba(16, 185, 129, 0.05);
  }

  .match-item.loss {
    border-left-color: #ef4444;
    background: rgba(239, 68, 68, 0.05);
  }

  .match-item.tie {
    border-left-color: #f59e0b;
    background: rgba(245, 158, 11, 0.05);
  }

  .round-badge {
    background: #e5e7eb;
    color: #374151;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 600;
    min-width: 1.5rem;
    text-align: center;
  }

  .opponent-name {
    flex: 1;
    font-size: 0.8rem;
    font-weight: 500;
    color: #1a1a1a;
  }

  .match-score {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    font-family: monospace;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .score-player {
    color: #1a1a1a;
  }

  .score-sep {
    color: #9ca3af;
  }

  .score-opponent {
    color: #6b7280;
  }

  .result-badge {
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 700;
    color: white;
  }

  .result-badge.win {
    background: #10b981;
  }

  .result-badge.loss {
    background: #ef4444;
  }

  .result-badge.tie {
    background: #f59e0b;
  }

  /* Tie indicator */
  .tie-indicator {
    margin-left: 0.2rem;
    cursor: help;
    font-size: 0.7rem;
  }

  /* Tie badge button for 3+ player mini-league */
  .tie-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.3rem;
    padding: 0.2rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .tie-badge:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 6px rgba(245, 158, 11, 0.4);
  }

  .tie-badge svg {
    display: block;
  }

  /* Mini-league tiebreaker modal */
  .tiebreaker-modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    max-width: 400px;
    width: 100%;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .tiebreaker-header {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    border-bottom: none;
  }

  .tiebreaker-header h3 {
    color: white;
  }

  .tiebreaker-header .close-btn {
    color: white;
  }

  .tiebreaker-header .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .modal-description {
    font-size: 0.8rem;
    color: #6b7280;
    margin: 0 0 1rem 0;
    line-height: 1.4;
  }

  .tiebreaker-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .tiebreaker-table thead {
    background: #f3f4f6;
  }

  .tiebreaker-table th {
    padding: 0.5rem;
    text-align: left;
    font-weight: 600;
    color: #6b7280;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .tiebreaker-table th.pos-col {
    width: 36px;
    text-align: center;
  }

  .tiebreaker-table th.mini-pts-col,
  .tiebreaker-table th.mini-20s-col {
    width: 50px;
    text-align: center;
  }

  .tiebreaker-table tbody tr {
    border-bottom: 1px solid #e5e7eb;
    cursor: default;
  }

  .tiebreaker-table tbody tr:last-child {
    border-bottom: none;
  }

  .tiebreaker-table td {
    padding: 0.6rem 0.5rem;
    color: #1f2937;
  }

  .tiebreaker-table td.pos-col,
  .tiebreaker-table td.mini-pts-col,
  .tiebreaker-table td.mini-20s-col {
    text-align: center;
  }

  .tiebreaker-table td.mini-pts-col {
    background: rgba(245, 158, 11, 0.1);
    font-weight: 700;
    font-size: 1rem;
  }

  .mini-pts-col {
    width: 50px;
  }

  .mini-20s-col {
    width: 50px;
  }

  tr.has-tie {
    background: rgba(245, 158, 11, 0.08);
  }

  tr.has-tie:hover {
    background: rgba(245, 158, 11, 0.15);
  }

  tr.has-tie.selected {
    background: rgba(245, 158, 11, 0.2);
  }

  /* 3+ players with same points - uniform orange background for all tied players */
  tr.in-multi-tie,
  tr.in-multi-tie.selected {
    background: rgba(245, 158, 11, 0.15) !important;
  }

  tr.in-multi-tie:hover,
  tr.in-multi-tie.selected:hover {
    background: rgba(245, 158, 11, 0.22) !important;
  }

  .position-badge.tied {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  /* Primary column (used for qualification ranking) */
  .primary-col {
    background: rgba(102, 126, 234, 0.12);
    color: #4338ca !important;
    font-weight: 700;
    font-size: 0.9rem;
  }

  th.primary-col {
    background: rgba(102, 126, 234, 0.15);
    color: #4338ca !important;
    font-weight: 700;
  }

  /* Dark mode */
  :global([data-theme='dark']) .qualifier-selection {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .group-header {
    border-color: #2d3748;
  }

  :global([data-theme='dark']) .group-header h3 {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .quick-btn {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .quick-btn:hover {
    background: #667eea;
    color: white;
  }

  :global([data-theme='dark']) .standings-table::-webkit-scrollbar-track {
    background: #0f1419;
  }

  :global([data-theme='dark']) thead {
    background: #0f1419;
  }

  :global([data-theme='dark']) th {
    color: #8b9bb3;
    border-bottom-color: #2d3748;
  }

  :global([data-theme='dark']) tbody tr {
    border-bottom-color: #243447;
  }

  :global([data-theme='dark']) tbody tr:hover {
    background: #0f1419;
  }

  :global([data-theme='dark']) tbody tr.selected {
    background: rgba(102, 126, 234, 0.2);
  }

  :global([data-theme='dark']) td {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .scored-col {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .position-badge {
    background: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .position-badge.selected {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  /* Dark mode tie styles */
  :global([data-theme='dark']) tr.has-tie {
    background: rgba(245, 158, 11, 0.15);
  }

  :global([data-theme='dark']) tr.has-tie:hover {
    background: rgba(245, 158, 11, 0.25);
  }

  :global([data-theme='dark']) tr.has-tie.selected {
    background: rgba(245, 158, 11, 0.3);
  }

  /* Dark mode 3+ player ties - uniform orange for all tied players */
  :global([data-theme='dark']) tr.in-multi-tie,
  :global([data-theme='dark']) tr.in-multi-tie.selected {
    background: rgba(245, 158, 11, 0.2) !important;
  }

  :global([data-theme='dark']) tr.in-multi-tie:hover,
  :global([data-theme='dark']) tr.in-multi-tie.selected:hover {
    background: rgba(245, 158, 11, 0.3) !important;
  }

  /* Dark mode modal */
  :global([data-theme='dark']) .modal-content {
    background: #1a2332;
  }

  :global([data-theme='dark']) .modal-header {
    background: #0f1419;
    border-bottom-color: #2d3748;
  }

  :global([data-theme='dark']) .modal-header h3 {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .close-btn {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .close-btn:hover {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .no-matches {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .match-item {
    background: #0f1419;
    border-left-color: #2d3748;
  }

  :global([data-theme='dark']) .match-item.win {
    background: rgba(16, 185, 129, 0.1);
  }

  :global([data-theme='dark']) .match-item.loss {
    background: rgba(239, 68, 68, 0.1);
  }

  :global([data-theme='dark']) .match-item.tie {
    background: rgba(245, 158, 11, 0.1);
  }

  :global([data-theme='dark']) .round-badge {
    background: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .opponent-name {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .score-player {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .score-opponent {
    color: #8b9bb3;
  }

  /* Dark mode for tiebreaker modal */
  :global([data-theme='dark']) .tiebreaker-modal {
    background: #1a2332;
  }

  :global([data-theme='dark']) .modal-description {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .tiebreaker-table thead {
    background: #0f1419;
  }

  :global([data-theme='dark']) .tiebreaker-table th {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .tiebreaker-table tbody tr {
    border-bottom-color: #243447;
  }

  :global([data-theme='dark']) .tiebreaker-table td {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) .tiebreaker-table td.mini-pts-col {
    background: rgba(245, 158, 11, 0.15);
  }

  /* Responsive */
  @media (max-width: 600px) {
    .qualifier-selection {
      padding: 0.5rem;
    }

    .group-header h3 {
      font-size: 0.8rem;
    }

    table {
      font-size: 0.7rem;
    }

    th {
      padding: 0.3rem 0.2rem;
      font-size: 0.6rem;
    }

    td {
      padding: 0.25rem 0.2rem;
      font-size: 0.7rem;
    }

    .position-badge {
      width: 1.1rem;
      height: 1.1rem;
      font-size: 0.65rem;
    }

    .name-col {
      min-width: 80px;
    }

    .matches-col,
    .wins-col,
    .losses-col,
    .ties-col {
      width: 26px;
      font-size: 0.7rem;
    }

    .checkbox-col input[type="checkbox"] {
      width: 0.8rem;
      height: 0.8rem;
    }
  }
</style>
