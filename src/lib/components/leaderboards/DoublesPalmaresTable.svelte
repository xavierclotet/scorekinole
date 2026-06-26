<!-- src/lib/components/leaderboards/DoublesPalmaresTable.svelte -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import type { DoublesResult } from '$lib/types/playerStats';

  let { results }: { results: DoublesResult[] } = $props();
  let rows = $derived([...results].sort((a, b) => b.date - a.date));
  function fmtDate(ms: number) { return new Date(ms).toLocaleDateString(); }
</script>

{#if rows.length > 0}
  <section class="palmares">
    <h3>{m.leaderboards_doublesPalmares?.() ?? 'Palmarés de dobles'}</h3>
    <div class="scroll">
      <table>
        <thead><tr>
          <th>{m.leaderboards_col_date?.() ?? 'Fecha'}</th>
          <th>{m.leaderboards_col_tournament?.() ?? 'Torneo'}</th>
          <th>{m.leaderboards_col_category?.() ?? 'Categoría'}</th>
          <th>{m.leaderboards_col_partner?.() ?? 'Compañero'}</th>
          <th>{m.leaderboards_col_rank?.() ?? 'Rank'}</th>
        </tr></thead>
        <tbody>
          {#each rows as r (r.tournamentId)}
            <tr>
              <td>{fmtDate(r.date)}</td>
              <td><a href={`/tournaments/${r.tournamentId}`}>{r.tournamentName}</a></td>
              <td>{r.category}</td>
              <td>{#if r.partnerId}<a href={`/users/${r.partnerId}`}>{r.partnerName}</a>{:else}{r.partnerName}{/if}</td>
              <td class="rank" class:gold={r.rank === 1}>{r.rank}/{r.totalTeams}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  .palmares { margin-top: 1.5rem; }
  .palmares h3 { font-size: 0.95rem; margin: 0 0 0.6rem; }
  .scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.78rem; }
  th, td { padding: 0.5rem 0.7rem; text-align: left; border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  thead th { border-top: none; color: var(--muted-foreground); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; }
  a { color: var(--primary); text-decoration: none; }
  .rank.gold { color: #f5c542; font-weight: 800; }
</style>
