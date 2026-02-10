<script lang="ts">
  import type { GroupStanding, TournamentParticipant, QualificationMode } from '$lib/types/tournament';
  import { getParticipantDisplayName } from '$lib/types/tournament';
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    standings: GroupStanding[];
    participants: TournamentParticipant[];
    // Whether this is a Swiss system (affects sorting and display)
    isSwiss?: boolean;
    // Qualification mode: 'WINS' (2/1/0) or 'POINTS' (total scored)
    qualificationMode?: QualificationMode;
    // Whether to enable the mini-league tiebreaker button and modal
    // Set to false for /groups page, true for /transition page
    enableTiebreaker?: boolean;
    // Whether this is a doubles tournament (affects name display)
    isDoubles?: boolean;
    // Number of participants that will qualify (for cutoff tie highlighting)
    // If null/undefined, no cutoff highlighting will be shown
    qualifyingCount?: number | null;
    // Callback when admin wants to disqualify a participant
    onDisqualify?: (participantId: string, participantName: string) => void;
  }

  let {
    standings,
    participants,
    isSwiss = false,
    qualificationMode = 'WINS',
    enableTiebreaker = true,
    isDoubles = false,
    qualifyingCount = null,
    onDisqualify
  }: Props = $props();

  // Use qualificationMode if provided
  let effectiveQualificationMode = $derived(qualificationMode || 'WINS');

  // Create participant map for quick lookup
  let participantMap = $derived(new Map(participants.map(p => [p.id, p])));

  // Use pre-calculated positions from tiebreaker algorithm
  // If positions are available, sort by position; otherwise fall back to basic sorting
  let sortedStandings = $derived([...standings].sort((a, b) => {
    // If positions are pre-calculated, use them
    if (a.position !== undefined && b.position !== undefined) {
      return a.position - b.position;
    }

    // Fallback: basic sorting for backwards compatibility
    if (effectiveQualificationMode === 'POINTS') {
      if (b.totalPointsScored !== a.totalPointsScored) {
        return b.totalPointsScored - a.totalPointsScored;
      }
      return b.total20s - a.total20s;
    } else {
      const aPoints = isSwiss ? (a.swissPoints ?? (a.matchesWon * 2 + a.matchesTied)) : a.points;
      const bPoints = isSwiss ? (b.swissPoints ?? (b.matchesWon * 2 + b.matchesTied)) : b.points;
      if (bPoints !== aPoints) return bPoints - aPoints;
      return b.total20s - a.total20s;
    }
  }));

  // Get participant name by ID (handles doubles with teamName)
  function getParticipantName(participantId: string): string {
    const participant = participantMap.get(participantId);
    if (!participant) return 'Unknown';
    return getParticipantDisplayName(participant, isDoubles);
  }

  // Check if participant is disqualified
  function isDisqualified(participantId: string): boolean {
    const participant = participantMap.get(participantId);
    return participant?.status === 'DISQUALIFIED';
  }

  // Get names of participants in a tie
  function getTiedWithNames(tiedWith: string[] | undefined): string {
    if (!tiedWith || tiedWith.length === 0) return '';
    return tiedWith.map(id => getParticipantName(id)).join(', ');
  }

  // Format Swiss points (2/1/0 system - always integers)
  function formatSwissPoints(standing: GroupStanding): string {
    const pts = standing.swissPoints ?? (standing.matchesWon * 2 + standing.matchesTied);
    return pts.toString();
  }

  // Show Pts column when ranking by WINS
  let showPtsColumn = $derived(effectiveQualificationMode === 'WINS');

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

  // Check if a player is part of a tie that crosses the qualification cutoff line
  // Only highlights ties that matter for qualification decisions
  function isAtCutoffTie(participantId: string): boolean {
    // If no qualifying count specified, don't highlight any ties
    if (qualifyingCount === null || qualifyingCount === undefined || qualifyingCount <= 0) {
      return false;
    }

    // Find the tie group this participant belongs to
    for (const [_, ids] of standingsByPrimaryValue) {
      if (ids.includes(participantId) && ids.length >= 2) {
        // Get positions of all players in this tie group
        const positions = ids.map(id => {
          const idx = sortedStandings.findIndex(s => s.participantId === id);
          return idx + 1; // 1-based position
        });

        const minPos = Math.min(...positions);
        const maxPos = Math.max(...positions);

        // Check if this tie group crosses the cutoff line
        // i.e., some would qualify (pos <= qualifyingCount) and some wouldn't (pos > qualifyingCount)
        if (minPos <= qualifyingCount && maxPos > qualifyingCount) {
          return true;
        }
      }
    }
    return false;
  }

  // Check if a player is part of a 3+ player tie (same primary value) - for mini-league button
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
          .filter(s => ids.includes(s.participantId))
          .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))[0]?.participantId;
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

  // ==========================================
  // Mini-league tiebreaker modal
  // ==========================================
  let showTiebreakerModal = $state(false);
  let tiebreakerData = $state<Array<{
    participantId: string;
    name: string;
    miniPts: number;
    mini20s: number;
  }>>([]);

  // Calculate mini-league points for a participant (only matches between tied players)
  function calculateMiniLeaguePoints(standing: GroupStanding, tiedIds: Set<string>): number {
    if (!standing.headToHeadRecord) return 0;

    let points = 0;
    for (const opponentId of tiedIds) {
      if (opponentId === standing.participantId) continue;
      const record = standing.headToHeadRecord[opponentId];
      if (record) {
        if (record.result === 'WIN') points += 2;
        else if (record.result === 'TIE') points += 1;
        // LOSS = 0
      }
    }
    return points;
  }

  // Calculate mini-league 20s for a participant (only matches between tied players)
  function calculateMiniLeague20s(standing: GroupStanding, tiedIds: Set<string>): number {
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

  // Open tiebreaker modal when clicking on a tied player
  function openTiebreakerModal(standing: GroupStanding) {
    // Get all participant IDs with the same primary value
    const groupIds = getTiedGroupIds(standing.participantId);
    if (groupIds.length < 3) return;

    const tiedIds = new Set(groupIds);

    // Build the mini-league data
    tiebreakerData = [];
    for (const id of tiedIds) {
      const s = standings.find(st => st.participantId === id);
      if (s) {
        tiebreakerData.push({
          participantId: id,
          name: getParticipantName(id),
          miniPts: calculateMiniLeaguePoints(s, tiedIds),
          mini20s: calculateMiniLeague20s(s, tiedIds)
        });
      }
    }

    // Sort by mini-league points, then by mini-league 20s
    tiebreakerData.sort((a, b) => {
      if (b.miniPts !== a.miniPts) return b.miniPts - a.miniPts;
      return b.mini20s - a.mini20s;
    });

    showTiebreakerModal = true;
  }

  function closeTiebreakerModal() {
    showTiebreakerModal = false;
    tiebreakerData = [];
  }
</script>

<div class="standings-table">
  <table>
    <thead>
      <tr>
        <th class="pos-col">#</th>
        <th class="name-col">{m.tournament_participant()}</th>
        <th class="matches-col">{m.tournament_matchesPlayed()}</th>
        <th class="wins-col">{m.tournament_matchesWon()}</th>
        <th class="losses-col">{m.tournament_matchesLost()}</th>
        <th class="ties-col">{m.tournament_matchesTied()}</th>
        {#if showPtsColumn}
          <th class="points-col" class:primary={effectiveQualificationMode === 'WINS'} title={m.tournament_pointsStandard()}>{m.ranking_pointsShort()}</th>
        {/if}
        <th class="total-points-col" class:primary={effectiveQualificationMode === 'POINTS'} title={m.tournament_totalCrokinolePoints()}>{m.tournament_totalPointsScored()}</th>
        <th class="twenties-col">{m.tournament_twentiesShort()}</th>
      </tr>
    </thead>
    <tbody>
      {#each sortedStandings as standing, i (standing.participantId)}
        {@const hasTie = standing.tiedWith && standing.tiedWith.length > 0}
        {@const tiedNames = getTiedWithNames(standing.tiedWith)}
        {@const inMultiTie = isPartOfMultiTie(standing.participantId)}
        {@const atCutoffTie = isAtCutoffTie(standing.participantId)}
        {@const showTieStyles = effectiveQualificationMode === 'WINS' && !isSwiss}
        <tr class:qualified={standing.qualifiedForFinal} class:has-tie={hasTie && showTieStyles} class:at-cutoff-tie={atCutoffTie && showTieStyles}>
          <td class="pos-col">
            <span class="position-badge" class:qualified={standing.qualifiedForFinal} class:tied={hasTie && showTieStyles}>
              {i + 1}
            </span>
          </td>
          <td class="name-col">
            <span class="participant-name">
              {getParticipantName(standing.participantId)}
              {#if enableTiebreaker && showTieStyles && isFirstInMultiTie(standing.participantId)}
                <!-- First player in 3+ tie group - show mini-league button (only for WINS mode) -->
                <button
                  class="tie-badge"
                  onclick={(e: MouseEvent) => { e.stopPropagation(); openTiebreakerModal(standing); }}
                  title={m.tournament_miniLeagueTiebreaker()}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4"/>
                    <path d="M14 4h6v6"/>
                    <path d="M20 4L10 14"/>
                  </svg>
                </button>
              {/if}
              {#if hasTie && showTieStyles}
                <!-- Unresolved tie - show warning (only for WINS mode) -->
                <span class="tie-indicator" title="{m.tournament_tiedWith()}: {tiedNames}">⚠️</span>
              {/if}
              {#if standing.qualifiedForFinal}
                <span class="qualified-badge">✓</span>
              {/if}
              {#if isDisqualified(standing.participantId)}
                <span class="disqualified-badge" title={m.admin_disqualified()}>{m.admin_disqualified()}</span>
              {:else if onDisqualify}
                <button
                  class="disqualify-btn"
                  onclick={(e: MouseEvent) => { e.stopPropagation(); onDisqualify(standing.participantId, getParticipantName(standing.participantId)); }}
                  title={m.admin_disqualify()}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                </button>
              {/if}
            </span>
          </td>
          <td class="matches-col">{standing.matchesPlayed}</td>
          <td class="wins-col">{standing.matchesWon}</td>
          <td class="losses-col">{standing.matchesLost}</td>
          <td class="ties-col">{standing.matchesTied}</td>
          {#if showPtsColumn}
            <td class="points-col" class:primary={effectiveQualificationMode === 'WINS'}>
              <strong>{isSwiss ? formatSwissPoints(standing) : standing.points}</strong>
            </td>
          {/if}
          <td class="total-points-col" class:primary={effectiveQualificationMode === 'POINTS'}>
            <strong>{standing.totalPointsScored}</strong>
          </td>
          <td class="twenties-col">{standing.total20s}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if sortedStandings.length === 0}
    <div class="empty-state">
      <p>No hay clasificación disponible aún</p>
    </div>
  {/if}
</div>

<!-- Mini-league tiebreaker modal (only shown when enableTiebreaker prop is true) -->
{#if enableTiebreaker && showTiebreakerModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={closeTiebreakerModal} onkeydown={(e) => e.key === 'Escape' && closeTiebreakerModal()} role="button" tabindex="0">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tiebreaker-modal" onclick={(e: MouseEvent) => e.stopPropagation()} onkeydown={(e: KeyboardEvent) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <div class="modal-header">
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
              <th class="mini-pts-col">{m.ranking_pointsShort()}</th>
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
                  <span class="participant-name">{player.name}</span>
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

<style>
  .standings-table {
    width: 100%;
    overflow-x: auto;
    background: white;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  thead {
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
  }

  th {
    padding: 0.4rem 0.3rem;
    text-align: left;
    font-weight: 600;
    color: #6b7280;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  th.pos-col {
    width: 32px;
    text-align: center;
  }

  th.name-col {
    min-width: 100px;
  }

  th.matches-col,
  th.wins-col,
  th.losses-col,
  th.ties-col,
  th.points-col,
  th.total-points-col,
  th.twenties-col {
    width: 36px;
    text-align: center;
  }

  tbody tr {
    border-bottom: 1px solid #f3f4f6;
    transition: background-color 0.15s;
  }

  tbody tr:last-child {
    border-bottom: none;
  }

  /* Zebra striping - filas alternas */
  tbody tr:nth-child(odd) {
    background: #ffffff;
  }

  tbody tr:nth-child(even) {
    background: #fafafa;
  }

  tbody tr:hover {
    background: #f3f4f6;
  }

  tbody tr.qualified {
    background: #f0fdf4;
  }

  tbody tr.qualified:nth-child(even) {
    background: #ecfdf5;
  }

  tbody tr.qualified:hover {
    background: #dcfce7;
  }

  td {
    padding: 0.35rem 0.3rem;
    color: #1f2937;
    font-size: 0.75rem;
  }

  td.pos-col,
  td.matches-col,
  td.wins-col,
  td.losses-col,
  td.ties-col,
  td.points-col,
  td.total-points-col,
  td.twenties-col {
    text-align: center;
  }

  td.total-points-col.primary,
  td.points-col.primary {
    background: rgba(16, 185, 129, 0.12);
    font-weight: 700;
    font-size: 0.9rem;
    color: #059669;
  }

  th.total-points-col.primary,
  th.points-col.primary {
    background: rgba(16, 185, 129, 0.15);
    color: #059669;
    font-weight: 700;
  }

  .participant-name {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-weight: 500;
  }

  .position-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: #e5e7eb;
    color: #374151;
    font-weight: 700;
    font-size: 0.7rem;
  }

  .position-badge.qualified {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .qualified-badge {
    display: inline-block;
    margin-left: 0.25rem;
    color: #10b981;
    font-size: 0.7rem;
  }

  /* Tie indicator for 2-player unresolved ties */
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

  /* Disqualify button (admin action) */
  .disqualify-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.3rem;
    padding: 0.2rem;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    opacity: 0.7;
  }

  .disqualify-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
    opacity: 1;
  }

  .disqualify-btn svg {
    display: block;
  }

  /* Disqualified badge */
  .disqualified-badge {
    display: inline-block;
    margin-left: 0.3rem;
    padding: 0.1rem 0.3rem;
    background: #fef2f2;
    color: #dc2626;
    font-size: 0.55rem;
    font-weight: 600;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .position-badge.tied {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  tbody tr.has-tie {
    background: rgba(245, 158, 11, 0.12);
  }

  tbody tr.has-tie:hover {
    background: rgba(245, 158, 11, 0.18);
  }

  /* Ties at qualification cutoff - orange background (qualified keeps green) */
  tbody tr.at-cutoff-tie:not(.qualified) {
    background: rgba(245, 158, 11, 0.15);
  }

  tbody tr.at-cutoff-tie:not(.qualified):hover {
    background: rgba(245, 158, 11, 0.22);
  }

  .empty-state {
    padding: 1.5rem 1rem;
    text-align: center;
    color: #9ca3af;
    font-size: 0.8rem;
  }

  /* Dark mode support */
  :global(:is([data-theme='dark'], [data-theme='violet'])) .standings-table {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) thead {
    background: #0f1419;
    border-bottom-color: #2d3748;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) th {
    color: #8b9bb3;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr {
    border-bottom-color: #243447;
  }

  /* Dark mode zebra striping */
  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr:nth-child(odd) {
    background: #1a2332;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr:nth-child(even) {
    background: #151c28;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr:hover {
    background: #0f1419;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr.qualified {
    background: rgba(16, 185, 129, 0.1);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr.qualified:nth-child(even) {
    background: rgba(16, 185, 129, 0.08);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr.qualified:hover {
    background: rgba(16, 185, 129, 0.15);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) td {
    color: #e1e8ed;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) td.total-points-col.primary,
  :global(:is([data-theme='dark'], [data-theme='violet'])) td.points-col.primary {
    background: rgba(16, 185, 129, 0.15);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .position-badge {
    background: #2d3748;
    color: #8b9bb3;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .position-badge.qualified {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .empty-state {
    color: #6b7280;
  }

  /* Dark mode tie styles */
  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr.has-tie {
    background: rgba(245, 158, 11, 0.15);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr.has-tie:hover {
    background: rgba(245, 158, 11, 0.25);
  }

  /* Dark mode cutoff ties (qualified keeps green) */
  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr.at-cutoff-tie:not(.qualified) {
    background: rgba(245, 158, 11, 0.2);
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) tbody tr.at-cutoff-tie:not(.qualified):hover {
    background: rgba(245, 158, 11, 0.3);
  }

  /* Dark mode disqualified badge */
  :global(:is([data-theme='dark'], [data-theme='violet'])) .disqualified-badge {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  /* Responsive */
  @media (max-width: 768px) {
    table {
      font-size: 0.7rem;
    }

    th {
      padding: 0.3rem 0.2rem;
      font-size: 0.6rem;
    }

    td {
      padding: 0.3rem 0.2rem;
      font-size: 0.7rem;
    }

    th.name-col {
      min-width: 80px;
    }

    th.pos-col,
    th.matches-col,
    th.wins-col,
    th.losses-col,
    th.ties-col,
    th.points-col,
    th.total-points-col,
    th.twenties-col {
      width: 28px;
    }

    .position-badge {
      width: 18px;
      height: 18px;
      font-size: 0.65rem;
    }

    .qualified-badge {
      font-size: 0.6rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    table {
      font-size: 0.65rem;
    }

    th {
      padding: 0.25rem 0.15rem;
      font-size: 0.55rem;
    }

    td {
      padding: 0.25rem 0.15rem;
    }

    .position-badge {
      width: 16px;
      height: 16px;
      font-size: 0.6rem;
    }

    .empty-state {
      padding: 1rem;
    }
  }

  /* ==========================================
   * Mini-league tiebreaker modal
   * ========================================== */
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

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: white;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 1.5rem;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .modal-body {
    padding: 1rem 1.25rem;
    overflow-y: auto;
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
  }

  /* Dark mode for modal */
  :global(:is([data-theme='dark'], [data-theme='violet'])) .tiebreaker-modal {
    background: #1a2332;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .modal-header {
    border-bottom-color: #2d3748;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .modal-body {
    background: #1a2332;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .modal-description {
    color: #8b9bb3;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .tiebreaker-table thead {
    background: #0f1419;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .tiebreaker-table th {
    color: #8b9bb3;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .tiebreaker-table tbody tr {
    border-bottom-color: #243447;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .tiebreaker-table td {
    color: #e1e8ed;
  }

  :global(:is([data-theme='dark'], [data-theme='violet'])) .tiebreaker-table td.mini-pts-col {
    background: rgba(245, 158, 11, 0.15);
  }
</style>
