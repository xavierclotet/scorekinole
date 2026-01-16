<script lang="ts">
  import type { GroupStanding, TournamentParticipant, GroupRankingSystem } from '$lib/types/tournament';

  export let standings: GroupStanding[];
  export let participants: TournamentParticipant[];
  // showElo prop kept for backwards compatibility but no longer used
  // ELO is now shown only in the final standings
  export let showElo: boolean = false;
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

  // Sort standings based on ranking system
  $: sortedStandings = [...standings].sort((a, b) => {
    if (effectiveRankingSystem === 'POINTS') {
      // By POINTS: totalPointsScored > 20s > head-to-head
      if (b.totalPointsScored !== a.totalPointsScored) {
        return b.totalPointsScored - a.totalPointsScored;
      }
      if (b.total20s !== a.total20s) return b.total20s - a.total20s;
      if (a.headToHeadRecord?.[b.participantId] === 'WIN') return -1;
      if (a.headToHeadRecord?.[b.participantId] === 'LOSS') return 1;
      return 0;
    } else {
      // By WINS
      if (isSwiss) {
        // Swiss: swissPoints (1/0.5/0) > head-to-head > 20s
        const aSwiss = a.swissPoints ?? (a.matchesWon + a.matchesTied * 0.5);
        const bSwiss = b.swissPoints ?? (b.matchesWon + b.matchesTied * 0.5);
        if (bSwiss !== aSwiss) return bSwiss - aSwiss;

        // Head-to-head
        if (a.headToHeadRecord?.[b.participantId] === 'WIN') return -1;
        if (a.headToHeadRecord?.[b.participantId] === 'LOSS') return 1;

        // 20s
        return b.total20s - a.total20s;
      } else {
        // Round Robin: points (2/1/0) > 20s > totalPointsScored
        if (b.points !== a.points) return b.points - a.points;
        if (b.total20s !== a.total20s) return b.total20s - a.total20s;
        return b.totalPointsScored - a.totalPointsScored;
      }
    }
  });

  // Get participant name by ID
  function getParticipantName(participantId: string): string {
    return participantMap.get(participantId)?.name || 'Unknown';
  }

  // Format Swiss points (show .5 for ties)
  function formatSwissPoints(standing: GroupStanding): string {
    const pts = standing.swissPoints ?? (standing.matchesWon + standing.matchesTied * 0.5);
    return pts % 1 === 0 ? pts.toString() : pts.toFixed(1);
  }

  // Show Pts column when ranking by WINS
  $: showPtsColumn = effectiveRankingSystem === 'WINS';
</script>

<div class="standings-table">
  <table>
    <thead>
      <tr>
        <th class="pos-col">#</th>
        <th class="name-col">Participante</th>
        <th class="matches-col">PJ</th>
        <th class="wins-col">G</th>
        <th class="losses-col">P</th>
        <th class="ties-col">E</th>
        {#if showPtsColumn}
          <th class="points-col" title={isSwiss ? 'Puntos Swiss (1/0.5/0)' : 'Puntos (2/1/0)'}>Pts</th>
        {/if}
        <th class="total-points-col" title="Puntos totales de Crokinole">Puntos</th>
        <th class="twenties-col">20s</th>
      </tr>
    </thead>
    <tbody>
      {#each sortedStandings as standing, i (standing.participantId)}
        <tr class:qualified={standing.qualifiedForFinal}>
          <td class="pos-col">
            <span class="position-badge" class:qualified={standing.qualifiedForFinal}>
              {i + 1}
            </span>
          </td>
          <td class="name-col">
            <span class="participant-name">
              {getParticipantName(standing.participantId)}
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
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  thead {
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
  }

  th {
    padding: 0.75rem 0.5rem;
    text-align: left;
    font-weight: 600;
    color: #374151;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  th.pos-col {
    width: 50px;
    text-align: center;
  }

  th.name-col {
    min-width: 140px;
  }

  th.matches-col,
  th.wins-col,
  th.losses-col,
  th.ties-col,
  th.points-col,
  th.total-points-col,
  th.twenties-col {
    width: 50px;
    text-align: center;
  }

  tbody tr {
    border-bottom: 1px solid #e5e7eb;
    transition: background-color 0.15s;
  }

  /* Zebra striping - filas alternas */
  tbody tr:nth-child(odd) {
    background: #ffffff;
  }

  tbody tr:nth-child(even) {
    background: #f9fafb;
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
    padding: 0.75rem 0.5rem;
    color: #1f2937;
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

  td.total-points-col.primary {
    background: rgba(102, 126, 234, 0.08);
  }

  .participant-name {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .position-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #e5e7eb;
    color: #374151;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .position-badge.qualified {
    background: #10b981;
    color: white;
  }

  .qualified-badge {
    display: inline-block;
    margin-left: 0.5rem;
    color: #10b981;
    font-size: 1rem;
  }

  .empty-state {
    padding: 3rem 2rem;
    text-align: center;
    color: #9ca3af;
  }

  /* Dark mode support */
  :global([data-theme='dark']) .standings-table {
    background: #1a2332;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  :global([data-theme='dark']) thead {
    background: #0f1419;
    border-bottom-color: #2d3748;
  }

  :global([data-theme='dark']) th {
    color: #8b9bb3;
  }

  :global([data-theme='dark']) tbody tr {
    border-bottom-color: #2d3748;
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

  :global([data-theme='dark']) td.total-points-col.primary {
    background: rgba(102, 126, 234, 0.15);
  }

  :global([data-theme='dark']) .position-badge {
    background: #2d3748;
    color: #8b9bb3;
  }

  :global([data-theme='dark']) .position-badge.qualified {
    background: #10b981;
    color: white;
  }

  :global([data-theme='dark']) .empty-state {
    color: #6b7280;
  }

  /* Responsive */
  @media (max-width: 768px) {
    table {
      font-size: 0.8rem;
    }

    th,
    td {
      padding: 0.5rem 0.3rem;
    }

    th {
      font-size: 0.75rem;
    }

    th.name-col {
      min-width: 100px;
    }

    th.pos-col,
    th.matches-col,
    th.wins-col,
    th.losses-col,
    th.ties-col,
    th.points-col,
    th.total-points-col,
    th.twenties-col {
      width: 38px;
    }

    .position-badge {
      width: 24px;
      height: 24px;
      font-size: 0.75rem;
    }

    .qualified-badge {
      font-size: 0.85rem;
    }
  }

  /* Mobile landscape optimizations */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    table {
      font-size: 0.75rem;
    }

    th,
    td {
      padding: 0.4rem 0.25rem;
    }

    th {
      font-size: 0.7rem;
    }

    .position-badge {
      width: 22px;
      height: 22px;
      font-size: 0.7rem;
    }

    .empty-state {
      padding: 2rem 1rem;
    }
  }
</style>
