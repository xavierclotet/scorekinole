<script lang="ts">
  import type { GroupStanding, TournamentParticipant, GroupRankingSystem } from '$lib/types/tournament';
  import { t } from '$lib/stores/language';

  export let standings: GroupStanding[];
  export let participants: TournamentParticipant[];
  // showRanking prop kept for backwards compatibility but no longer used
  // Ranking is now shown only in the final standings
  export let showRanking: boolean = false;
  // Whether this is a Swiss system (affects sorting and display)
  export let isSwiss: boolean = false;
  // Ranking system: 'WINS' or 'POINTS' (total points scored)
  // Supports both new rankingSystem and legacy swissRankingSystem prop
  export let rankingSystem: GroupRankingSystem = 'WINS';
  // @deprecated - use rankingSystem instead
  export let swissRankingSystem: GroupRankingSystem = 'WINS';

  // Use rankingSystem if provided, fallback to swissRankingSystem for backwards compatibility
  $: effectiveRankingSystem = rankingSystem || swissRankingSystem || 'WINS';

  // Create participant map for quick lookup
  $: participantMap = new Map(participants.map(p => [p.id, p]));

  // Use pre-calculated positions from tiebreaker algorithm
  // If positions are available, sort by position; otherwise fall back to basic sorting
  $: sortedStandings = [...standings].sort((a, b) => {
    // If positions are pre-calculated, use them
    if (a.position !== undefined && b.position !== undefined) {
      return a.position - b.position;
    }

    // Fallback: basic sorting for backwards compatibility
    if (effectiveRankingSystem === 'POINTS') {
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
  });

  // Get participant name by ID
  function getParticipantName(participantId: string): string {
    return participantMap.get(participantId)?.name || 'Unknown';
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
  $: showPtsColumn = effectiveRankingSystem === 'WINS';
</script>

<div class="standings-table">
  <table>
    <thead>
      <tr>
        <th class="pos-col">#</th>
        <th class="name-col">{$t('participant')}</th>
        <th class="matches-col">{$t('matchesPlayed')}</th>
        <th class="wins-col">{$t('matchesWon')}</th>
        <th class="losses-col">{$t('matchesLost')}</th>
        <th class="ties-col">{$t('matchesTied')}</th>
        {#if showPtsColumn}
          <th class="points-col" title={$t('pointsStandard')}>{$t('pointsShort')}</th>
        {/if}
        <th class="total-points-col" title={$t('totalCrokinolePoints')}>{$t('totalPointsScored')}</th>
        <th class="twenties-col">{$t('twentiesShort')}</th>
      </tr>
    </thead>
    <tbody>
      {#each sortedStandings as standing, i (standing.participantId)}
        {@const hasTie = standing.tiedWith && standing.tiedWith.length > 0}
        {@const tiedNames = getTiedWithNames(standing.tiedWith)}
        <tr class:qualified={standing.qualifiedForFinal} class:has-tie={hasTie}>
          <td class="pos-col">
            <span class="position-badge" class:qualified={standing.qualifiedForFinal} class:tied={hasTie}>
              {i + 1}
            </span>
          </td>
          <td class="name-col">
            <span class="participant-name">
              {getParticipantName(standing.participantId)}
              {#if hasTie}
                <span class="tie-indicator" title="{$t('tiedWith')}: {tiedNames}">⚠️</span>
              {/if}
              {#if standing.qualifiedForFinal}
                <span class="qualified-badge">✓</span>
              {/if}
            </span>
          </td>
          <td class="matches-col">{standing.matchesPlayed}</td>
          <td class="wins-col">{standing.matchesWon}</td>
          <td class="losses-col">{standing.matchesLost}</td>
          <td class="ties-col">{standing.matchesTied}</td>
          {#if showPtsColumn}
            <td class="points-col" class:primary={effectiveRankingSystem === 'WINS'}>
              <strong>{isSwiss ? formatSwissPoints(standing) : standing.points}</strong>
            </td>
          {/if}
          <td class="total-points-col" class:primary={effectiveRankingSystem === 'POINTS'}>
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
    background: rgba(102, 126, 234, 0.08);
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

  /* Tie indicator */
  .tie-indicator {
    margin-left: 0.2rem;
    cursor: help;
    font-size: 0.7rem;
  }

  .position-badge.tied {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  tbody tr.has-tie {
    background: rgba(245, 158, 11, 0.08);
  }

  tbody tr.has-tie:hover {
    background: rgba(245, 158, 11, 0.15);
  }

  .empty-state {
    padding: 1.5rem 1rem;
    text-align: center;
    color: #9ca3af;
    font-size: 0.8rem;
  }

  /* Dark mode support */
  :global([data-theme='dark']) .standings-table {
    background: #1a2332;
    border-color: #2d3748;
  }

  :global([data-theme='dark']) thead {
    background: #0f1419;
    border-bottom-color: #2d3748;
  }

  :global([data-theme='dark']) th {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) tbody tr {
    border-bottom-color: #243447;
  }

  /* Dark mode zebra striping */
  :global([data-theme='dark']) tbody tr:nth-child(odd) {
    background: #1a2332;
  }

  :global([data-theme='dark']) tbody tr:nth-child(even) {
    background: #151c28;
  }

  :global([data-theme='dark']) tbody tr:hover {
    background: #0f1419;
  }

  :global([data-theme='dark']) tbody tr.qualified {
    background: rgba(16, 185, 129, 0.1);
  }

  :global([data-theme='dark']) tbody tr.qualified:nth-child(even) {
    background: rgba(16, 185, 129, 0.08);
  }

  :global([data-theme='dark']) tbody tr.qualified:hover {
    background: rgba(16, 185, 129, 0.15);
  }

  :global([data-theme='dark']) td {
    color: #e1e8ed;
  }

  :global([data-theme='dark']) td.total-points-col.primary,
  :global([data-theme='dark']) td.points-col.primary {
    background: rgba(102, 126, 234, 0.15);
  }

  :global([data-theme='dark']) .position-badge {
    background: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .position-badge.qualified {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  :global([data-theme='dark']) .empty-state {
    color: #6b7280;
  }

  /* Dark mode tie styles */
  :global([data-theme='dark']) tbody tr.has-tie {
    background: rgba(245, 158, 11, 0.15);
  }

  :global([data-theme='dark']) tbody tr.has-tie:hover {
    background: rgba(245, 158, 11, 0.25);
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
</style>
