<!-- src/lib/components/leaderboards/LeaderboardCard.svelte -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import Maximize from '@lucide/svelte/icons/maximize-2';
  import { buildLeaderboard, rankEntries, type LeaderboardEntry } from '$lib/stats/leaderboard';
  import { formatMetric, type MetricDescriptor } from '$lib/stats/metrics';
  import type { PlayerStats } from '$lib/types/playerStats';
  import MetricInfo from './MetricInfo.svelte';

  let { metric, players, year, minMatches, onexpand }:
    { metric: MetricDescriptor; players: PlayerStats[]; year: string; minMatches: number;
      onexpand: (metric: MetricDescriptor, entries: LeaderboardEntry[]) => void } = $props();

  let entries = $derived(buildLeaderboard(players, metric, { year, minMatches }));
  let ranked = $derived(rankEntries(entries));
  let showTen = $state(false);
  let visible = $derived(ranked.slice(0, showTen ? 10 : 5));
  const label = $derived((m[metric.labelKey as keyof typeof m] as () => string)?.() ?? metric.id);
</script>

<div class="lb-card">
  <div class="lb-head">
    <span class="lb-title">{label}</span>
    <MetricInfo {metric} />
    {#if metric.kind === 'avg'}<span class="lb-min">{m.leaderboards_minTag?.({ n: minMatches }) ?? `Mín. ${minMatches}`}</span>{/if}
  </div>
  {#if visible.length === 0}
    <div class="lb-empty">{m.leaderboards_noData?.() ?? 'Sin datos suficientes'}</div>
  {:else}
    {#each visible as e (e.stats.userId)}
      <a class="lb-row" class:r1={e.rank === 1} class:r2={e.rank === 2} class:r3={e.rank === 3} href={`/users/${e.stats.userId}`}>
        <span class="rk">{e.rank}</span>
        {#if e.stats.photoURL}<img class="av" src={e.stats.photoURL} alt="" referrerpolicy="no-referrer" />{:else}<span class="av ph">{e.stats.displayName.charAt(0)}</span>{/if}
        <span class="nm">{e.stats.displayName}</span>
        <span class="val">{formatMetric(metric, e.value)}</span>
      </a>
    {/each}
    <div class="lb-foot">
      {#if entries.length > 5}
        <button class="link" onclick={() => (showTen = !showTen)}>
          {#if showTen}<ChevronUp size={13} /> {m.leaderboards_less?.() ?? 'Menos'}{:else}<ChevronDown size={13} /> {m.leaderboards_more?.() ?? 'Mostrar más'}{/if}
        </button>
      {/if}
      {#if entries.length > 10}
        <button class="link" onclick={() => onexpand(metric, entries)}><Maximize size={13} /> {m.leaderboards_full?.() ?? 'Ver todos'}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .lb-card { border: 1px solid var(--border); border-radius: 12px; background: var(--card); padding: 0.8rem 0.9rem; }
  .lb-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
  .lb-title { font-size: 0.82rem; font-weight: 700; }
  .lb-min { font-size: 0.55rem; padding: 0.1rem 0.4rem; border-radius: 5px; background: var(--muted); color: var(--muted-foreground); margin-left: auto; }
  .lb-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.45rem; border-radius: 7px; font-size: 0.78rem; color: var(--foreground); text-decoration: none; }
  .lb-row:nth-of-type(even) { background: color-mix(in srgb, var(--muted) 60%, transparent); }
  .lb-row:hover { background: color-mix(in srgb, var(--primary) 12%, transparent); }
  .lb-row.r1 { background: color-mix(in srgb, #f5c542 16%, transparent); }
  .rk { width: 18px; text-align: center; font-weight: 800; font-size: 0.7rem; color: var(--muted-foreground); }
  .r1 .rk { color: #e0a800; } .r2 .rk { color: #9aa7b4; } .r3 .rk { color: #c4793b; }
  .av { width: 18px; height: 18px; border-radius: 50%; }
  .av.ph { display: inline-flex; align-items: center; justify-content: center; background: var(--muted); font-size: 0.6rem; }
  .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .val { font-weight: 800; color: var(--primary); }
  .lb-foot { display: flex; gap: 0.8rem; margin-top: 0.5rem; }
  .link { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.66rem; color: var(--primary); background: none; border: none; cursor: pointer; padding: 0; }
</style>
