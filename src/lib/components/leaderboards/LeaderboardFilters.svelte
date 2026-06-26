<!-- src/lib/components/leaderboards/LeaderboardFilters.svelte -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import type { MetricFamily } from '$lib/stats/metrics';

  let {
    family = $bindable('all'),
    year = $bindable('all'),
    minMatches = $bindable(5),
    years,
  }: {
    family: MetricFamily | 'all';
    year: string;
    minMatches: number;
    years: string[];
  } = $props();

  const FAMILIES: Array<{ id: MetricFamily | 'all'; key: string }> = [
    { id: 'all', key: 'leaderboards_fam_all' },
    { id: 'twenties', key: 'leaderboards_fam_twenties' },
    { id: 'hammer', key: 'leaderboards_fam_hammer' },
    { id: 'clutch', key: 'leaderboards_fam_clutch' },
    { id: 'results', key: 'leaderboards_fam_results' },
  ];
</script>

<div class="filters">
  <div class="chips">
    {#each FAMILIES as f (f.id)}
      <button class="chip" class:on={family === f.id} onclick={() => (family = f.id)}>
        {(m[f.key as keyof typeof m] as () => string)?.() ?? f.id}
      </button>
    {/each}
  </div>
  <div class="right">
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
</div>

<style>
  .filters { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; justify-content: space-between; }
  .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .chip { font-size: 0.72rem; padding: 0.3rem 0.7rem; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--foreground); cursor: pointer; }
  .chip.on { border-color: var(--primary); color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); }
  .right { display: flex; gap: 0.6rem; }
  .sel { font-size: 0.7rem; color: var(--muted-foreground); display: inline-flex; align-items: center; gap: 0.3rem; }
  .sel select { font-size: 0.72rem; padding: 0.25rem 0.4rem; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--foreground); }
</style>
