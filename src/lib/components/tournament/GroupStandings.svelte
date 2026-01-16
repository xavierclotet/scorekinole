<script lang="ts">
  import type { GroupStanding, TournamentParticipant } from '$lib/types/tournament';

  export let standings: GroupStanding[];
  export let participants: TournamentParticipant[];
  // showElo prop kept for backwards compatibility but no longer used
  // ELO is now shown only in the final standings
  export let showElo: boolean = false;

  // Create participant map for quick lookup
  $: participantMap = new Map(participants.map(p => [p.id, p]));

  // Sort standings by totalPointsScored (desc), then total20s (desc) for display
  $: sortedStandings = [...standings].sort((a, b) => {
    // 1. Total points scored (descending)
    if (b.totalPointsScored !== a.totalPointsScored) {
      return b.totalPointsScored - a.totalPointsScored;
    }
    // 2. Total 20s (descending)
    return b.total20s - a.total20s;
  });

  // Get participant name by ID
  function getParticipantName(participantId: string): string {
    return participantMap.get(participantId)?.name || 'Unknown';
  }
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
        <th class="points-col">Pts</th>
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
          <td class="points-col"><strong>{standing.totalPointsScored}</strong></td>
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
  th.twenties-col {
    width: 50px;
    text-align: center;
  }

  tbody tr {
    border-bottom: 1px solid #e5e7eb;
    transition: background-color 0.15s;
  }

  tbody tr:hover {
    background: #f9fafb;
  }

  tbody tr.qualified {
    background: #f0fdf4;
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
  td.twenties-col {
    text-align: center;
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

  :global([data-theme='dark']) tbody tr:hover {
    background: #0f1419;
  }

  :global([data-theme='dark']) tbody tr.qualified {
    background: rgba(16, 185, 129, 0.1);
  }

  :global([data-theme='dark']) tbody tr.qualified:hover {
    background: rgba(16, 185, 129, 0.15);
  }

  :global([data-theme='dark']) td {
    color: #e1e8ed;
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
