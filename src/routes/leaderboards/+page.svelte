<!-- src/routes/leaderboards/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import * as m from '$lib/paraglide/messages.js';
  import SEO from '$lib/components/SEO.svelte';
  import AppMenu from '$lib/components/AppMenu.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import PullToRefresh from '$lib/components/PullToRefresh.svelte';
  import { theme } from '$lib/stores/theme';
  import { getAllPlayerStats, playerStatsCache, PLAYER_STATS_TTL } from '$lib/firebase/playerStats';
  import { METRICS, type MetricFamily, type MetricDescriptor } from '$lib/stats/metrics';
  import { availableYears, type LeaderboardEntry } from '$lib/stats/leaderboard';
  import type { PlayerStats } from '$lib/types/playerStats';
  import LeaderboardFilters from '$lib/components/leaderboards/LeaderboardFilters.svelte';
  import LeaderboardCard from '$lib/components/leaderboards/LeaderboardCard.svelte';
  import LeaderboardFullscreen from '$lib/components/leaderboards/LeaderboardFullscreen.svelte';
  import CompareTable from '$lib/components/leaderboards/CompareTable.svelte';

  type Tab = MetricFamily | 'compare';
  const FAMILY_TABS: { id: MetricFamily; key: string }[] = [
    { id: 'twenties', key: 'leaderboards_fam_twenties' },
    { id: 'hammer', key: 'leaderboards_fam_hammer' },
    { id: 'clutch', key: 'leaderboards_fam_clutch' },
    { id: 'results', key: 'leaderboards_fam_results' },
  ];

  let players = $state<PlayerStats[]>($playerStatsCache?.players ?? []);
  let isLoading = $state($playerStatsCache === null);

  // ?compare=id1,id2 opens the compare tab pre-filled.
  const initialCompare = (browser ? page.url.searchParams.get('compare') ?? '' : '').split(',').filter(Boolean);
  let tab = $state<Tab>(initialCompare.length ? 'compare' : 'twenties');

  let year = $state('all');
  let minMatches = $state(5);
  let fullscreen = $state<{ metric: MetricDescriptor; entries: LeaderboardEntry[] } | null>(null);

  let years = $derived(availableYears(players));
  let shownMetrics = $derived(tab === 'compare' ? [] : METRICS.filter((mm) => mm.family === tab));

  async function refresh() {
    const loaded = await getAllPlayerStats();
    players = loaded;
    playerStatsCache.set({ players: loaded, lastUpdated: Date.now() });
    isLoading = false;
  }

  onMount(async () => {
    const cache = $playerStatsCache;
    if (cache && Date.now() - cache.lastUpdated < PLAYER_STATS_TTL) { players = cache.players; isLoading = false; return; }
    if (!cache) isLoading = true;
    await refresh();
  });

  function openFullscreen(metric: MetricDescriptor, entries: LeaderboardEntry[]) { fullscreen = { metric, entries }; }
</script>

<SEO title="Leaderboards · Scorekinole" description="Records and player comparison for crokinole" canonical="https://scorekinole.es/leaderboards" />

<div class="lb-container" data-theme={$theme}>
  <header class="page-header">
    <div class="header-row">
      <div class="header-left">
        <AppMenu showHome homeHref="/" currentPage="leaderboards" />
      </div>
      <div class="header-center">
        <div class="title-section">
          <h1>{m.leaderboards_title?.() ?? 'Leaderboards'}</h1>
          {#if players.length > 0}<span class="count-badge">{players.length}</span>{/if}
        </div>
      </div>
      <div class="header-right">
        <ThemeToggle />
      </div>
    </div>
  </header>

  <PullToRefresh onrefresh={refresh}>
    <div class="lb-content">
      <div class="tabs-row">
        <div class="tabs">
          {#each FAMILY_TABS as ft (ft.id)}
            <button class="tab" class:on={tab === ft.id} onclick={() => (tab = ft.id)}>
              {(m[ft.key as keyof typeof m] as () => string)?.() ?? ft.id}
            </button>
          {/each}
          <button class="tab" class:on={tab === 'compare'} onclick={() => (tab = 'compare')}>{m.leaderboards_tabCompare?.() ?? 'Comparar'}</button>
        </div>
      </div>

      {#if isLoading}
        <p class="state">{m.common_loading?.() ?? 'Cargando…'}</p>
      {:else if players.length === 0}
        <p class="state">{m.leaderboards_empty?.() ?? 'Aún no hay estadísticas.'}</p>
      {:else if tab === 'compare'}
        <CompareTable {players} initialIds={initialCompare} {year} />
      {:else}
        <div class="filters-wrap"><LeaderboardFilters bind:year bind:minMatches {years} /></div>
        <div class="grid">
          {#each shownMetrics as metric (metric.id)}
            <LeaderboardCard {metric} {players} {year} {minMatches} onexpand={openFullscreen} />
          {/each}
        </div>
      {/if}
    </div>
  </PullToRefresh>
</div>

{#if fullscreen}
  <LeaderboardFullscreen metric={fullscreen.metric} entries={fullscreen.entries} onclose={() => (fullscreen = null)} />
{/if}

<style>
  .lb-container {
    min-height: 100vh;
    background: var(--background);
    color: var(--foreground);
    padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem));
  }

  /* Header — mirrors the shared public-page header (ranking, profile) */
  .page-header {
    background: var(--card);
    border-bottom: 1px solid var(--border);
    padding: 0.75rem 1.25rem;
    padding-top: max(0.75rem, env(safe-area-inset-top, 0.75rem));
  }
  .header-row { display: flex; align-items: center; gap: 1rem; }
  .header-left { display: flex; align-items: center; gap: 1rem; flex-shrink: 0; }
  .header-center { flex: 1; display: flex; justify-content: flex-start; min-width: 0; }
  .header-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
  .title-section { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
  .title-section h1 { font-size: 1.1rem; margin: 0; color: var(--foreground); font-weight: 700; white-space: nowrap; }
  .count-badge {
    font-size: 0.72rem; font-weight: 700; color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    padding: 0.1rem 0.5rem; border-radius: 999px;
  }

  .lb-content { max-width: 900px; margin: 0 auto; padding: 1rem 1rem 3rem; }

  /* Tabs scroll horizontally on narrow screens (5 tabs) */
  .tabs-row { display: flex; justify-content: center; margin-bottom: 1rem; overflow-x: auto; }
  .tabs { display: inline-flex; gap: 0.3rem; background: var(--muted); border-radius: 10px; padding: 0.2rem; }
  .tab { white-space: nowrap; font-size: 0.82rem; padding: 0.4rem 0.95rem; border-radius: 8px; border: none; background: none; color: var(--muted-foreground); cursor: pointer; transition: background 0.15s, color 0.15s; }
  .tab.on { background: var(--card); color: var(--foreground); font-weight: 700; }

  .filters-wrap { margin: 0 0 1rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
  .state { text-align: center; color: var(--muted-foreground); padding: 3rem 0; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
</style>
