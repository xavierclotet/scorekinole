<!-- src/lib/components/leaderboards/LeaderboardFilters.svelte -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';

  let {
    year = $bindable('all'),
    minMatches = $bindable(5),
    years,
  }: {
    year: string;
    minMatches: number;
    years: string[];
  } = $props();
</script>

<div class="filters">
  <label class="sel">
    {m.leaderboards_filter_year?.() ?? 'Año'}
    <select bind:value={year}>
      <option value="all">{m.leaderboards_year_all?.() ?? 'Todos'}</option>
      {#each years as y (y)}<option value={y}>{y}</option>{/each}
    </select>
  </label>
  <label class="sel">
    {m.leaderboards_filter_min?.() ?? 'Mín. enc.'}
    <select bind:value={minMatches}>
      {#each [3, 5, 10, 15] as n (n)}<option value={n}>{n}</option>{/each}
    </select>
  </label>
</div>

<style>
  .filters { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: center; justify-content: flex-end; }
  .sel { font-size: 0.7rem; color: var(--muted-foreground); display: inline-flex; align-items: center; gap: 0.3rem; }
  .sel select { font-size: 0.72rem; padding: 0.25rem 0.4rem; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--foreground); }
</style>
