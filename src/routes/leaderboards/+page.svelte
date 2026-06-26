<!-- src/routes/leaderboards/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import * as m from '$lib/paraglide/messages.js';
  import SEO from '$lib/components/SEO.svelte';
  import { getAllPlayerStats, playerStatsCache, PLAYER_STATS_TTL } from '$lib/firebase/playerStats';
  import { METRICS, type MetricFamily, type MetricDescriptor } from '$lib/stats/metrics';
  import { availableYears, type LeaderboardEntry } from '$lib/stats/leaderboard';
  import type { PlayerStats } from '$lib/types/playerStats';
  import RecordsBand from '$lib/components/leaderboards/RecordsBand.svelte';
  import LeaderboardFilters from '$lib/components/leaderboards/LeaderboardFilters.svelte';
  import LeaderboardCard from '$lib/components/leaderboards/LeaderboardCard.svelte';
  import LeaderboardFullscreen from '$lib/components/leaderboards/LeaderboardFullscreen.svelte';
  import CompareTable from '$lib/components/leaderboards/CompareTable.svelte';

  let players = $state<PlayerStats[]>($playerStatsCache?.players ?? []);
  let isLoading = $state($playerStatsCache === null);

  // ?compare=id1,id2 opens the compare tab pre-filled.
  const initialCompare = (page.url.searchParams.get('compare') ?? '').split(',').filter(Boolean);
  let tab = $state<'records' | 'compare'>(initialCompare.length ? 'compare' : 'records');

  let family = $state<MetricFamily | 'all'>('all');
  let year = $state('all');
  let minMatches = $state(5);
  let fullscreen = $state<{ metric: MetricDescriptor; entries: LeaderboardEntry[] } | null>(null);

  let years = $derived(availableYears(players));
  let shownMetrics = $derived(METRICS.filter((mm) => family === 'all' || mm.family === family));

  onMount(async () => {
    const cache = $playerStatsCache;
    if (cache && Date.now() - cache.lastUpdated < PLAYER_STATS_TTL) { players = cache.players; isLoading = false; return; }
    if (!cache) isLoading = true;
    const loaded = await getAllPlayerStats();
    players = loaded;
    playerStatsCache.set({ players: loaded, lastUpdated: Date.now() });
    isLoading = false;
  });

  function openFullscreen(metric: MetricDescriptor, entries: LeaderboardEntry[]) { fullscreen = { metric, entries }; }
</script>

<SEO title="Leaderboards · Scorekinole" description="Records and player comparison for crokinole" canonical="https://scorekinole.web.app/leaderboards" />

<main class="lb-page">
  <header class="page-head">
    <h1>{m.leaderboards_title?.() ?? 'Leaderboards'}</h1>
    <div class="tabs">
      <button class="tab" class:on={tab === 'records'} onclick={() => (tab = 'records')}>{m.leaderboards_tabRecords?.() ?? 'Récords'}</button>
      <button class="tab" class:on={tab === 'compare'} onclick={() => (tab = 'compare')}>{m.leaderboards_tabCompare?.() ?? 'Comparar'}</button>
    </div>
  </header>

  {#if isLoading}
    <p class="state">{m.common_loading?.() ?? 'Cargando…'}</p>
  {:else if players.length === 0}
    <p class="state">{m.leaderboards_empty?.() ?? 'Aún no hay estadísticas.'}</p>
  {:else if tab === 'records'}
    <RecordsBand {players} />
    <div class="filters-wrap"><LeaderboardFilters bind:family bind:year bind:minMatches {years} /></div>
    <div class="grid">
      {#each shownMetrics as metric (metric.id)}
        <LeaderboardCard {metric} {players} {year} {minMatches} onexpand={openFullscreen} />
      {/each}
    </div>
  {:else}
    <CompareTable {players} initialIds={initialCompare} {year} />
  {/if}
</main>

{#if fullscreen}
  <LeaderboardFullscreen metric={fullscreen.metric} entries={fullscreen.entries} onclose={() => (fullscreen = null)} />
{/if}

<style>
  .lb-page { max-width: 900px; margin: 0 auto; padding: 1rem 1rem 3rem; }
  .page-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .page-head h1 { font-size: 1.4rem; margin: 0; }
  .tabs { display: flex; gap: 0.3rem; background: var(--muted); border-radius: 10px; padding: 0.2rem; }
  .tab { font-size: 0.8rem; padding: 0.35rem 0.9rem; border-radius: 8px; border: none; background: none; color: var(--muted-foreground); cursor: pointer; }
  .tab.on { background: var(--card); color: var(--foreground); font-weight: 700; }
  .filters-wrap { margin: 1rem 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
  .state { text-align: center; color: var(--muted-foreground); padding: 3rem 0; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
</style>
