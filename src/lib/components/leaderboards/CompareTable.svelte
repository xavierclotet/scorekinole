<!-- src/lib/components/leaderboards/CompareTable.svelte -->
<script lang="ts">
  import { untrack } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import * as m from '$lib/paraglide/messages.js';
  import { METRICS, formatMetric, type MetricFamily } from '$lib/stats/metrics';
  import { scopeBlock, allTimeBlock } from '$lib/stats/leaderboard';
  import type { PlayerStats } from '$lib/types/playerStats';
  import PlayerPicker from './PlayerPicker.svelte';
  import MetricInfo from './MetricInfo.svelte';

  let { players, initialIds = [], year = 'all' }:
    { players: PlayerStats[]; initialIds?: string[]; year?: string } = $props();

  let byId = $derived(new Map(players.map((p) => [p.userId, p])));
  // untrack: read initialIds once at init; selectedIds is independent state thereafter
  let selectedIds = $state<string[]>(untrack(() => initialIds.slice(0, 6)));
  let selected = $derived(selectedIds.map((id) => byId.get(id)!).filter(Boolean));

  const FAMILIES: Array<{ id: MetricFamily; key: string }> = [
    { id: 'twenties', key: 'leaderboards_fam_twenties' },
    { id: 'hammer', key: 'leaderboards_fam_hammer' },
    { id: 'clutch', key: 'leaderboards_fam_clutch' },
    { id: 'results', key: 'leaderboards_fam_results' },
  ];

  function valueFor(p: PlayerStats, metricId: string): number | null {
    const metric = METRICS.find((mm) => mm.id === metricId)!;
    const block = metric.kind === 'avg' ? scopeBlock(p, year) : allTimeBlock(p);
    return metric.compute(block, p);
  }
  // For each metric row: the values, the leader index, and the row max for bar scaling.
  function row(metricId: string) {
    const vals = selected.map((p) => valueFor(p, metricId));
    const max = Math.max(0, ...vals.filter((v): v is number => v !== null));
    let leader = -1, best = -Infinity;
    vals.forEach((v, i) => { if (v !== null && v > best) { best = v; leader = i; } });
    return { vals, max, leader };
  }
  function add(id: string) { if (selectedIds.length < 6) selectedIds = [...selectedIds, id]; }
  function remove(id: string) { selectedIds = selectedIds.filter((x) => x !== id); }
</script>

{#if selected.length === 0}
  <div class="cmp-empty">
    <p>{m.leaderboards_comparePrompt?.() ?? 'Añade jugadores para comparar.'}</p>
    <PlayerPicker {players} {selectedIds} onadd={add} />
  </div>
{:else}
  <p class="scroll-note">{m.leaderboards_scrollNote?.() ?? '↔ Desliza para ver todas las columnas'}</p>
  <div class="cmp-scroll">
    <table class="cmp">
      <thead>
        <tr>
          <th class="mcol"></th>
          {#each selected as p (p.userId)}
            <th>
              <a class="phead" href={`/users/${p.userId}`}>
                {#if p.photoURL}<img class="av" src={p.photoURL} alt="" />{:else}<span class="av ph">{p.displayName.charAt(0)}</span>{/if}
                <span class="pn">{p.displayName}</span>
              </a>
              <button class="rm" onclick={() => remove(p.userId)} aria-label="Remove"><X size={12} /></button>
            </th>
          {/each}
          <th class="addcol">{#if selectedIds.length < 6}<PlayerPicker {players} {selectedIds} onadd={add} />{/if}</th>
        </tr>
      </thead>
      <tbody>
        {#each FAMILIES as fam (fam.id)}
          <tr class="famrow"><td colspan={selected.length + 2}>{(m[fam.key as keyof typeof m] as () => string)?.() ?? fam.id}</td></tr>
          {#each METRICS.filter((mm) => mm.family === fam.id) as metric (metric.id)}
            {@const r = row(metric.id)}
            <tr>
              <td class="mcol">{(m[metric.labelKey as keyof typeof m] as () => string)?.() ?? metric.id}<MetricInfo {metric} /></td>
              {#each r.vals as v, i (i)}
                <td class="cell" class:lead={i === r.leader && v !== null}>
                  {#if v === null}<span class="dash">—</span>
                  {:else}
                    {formatMetric(metric, v)}
                    <span class="bar"><i style={`width:${r.max > 0 ? Math.round((v / r.max) * 100) : 0}%`}></i></span>
                  {/if}
                </td>
              {/each}
              <td class="addcol"></td>
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .scroll-note { font-size: 0.62rem; color: var(--muted-foreground); margin: 0 0 0.5rem; }
  .cmp-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; }
  .cmp { border-collapse: collapse; width: 100%; font-size: 0.78rem; }
  .cmp th, .cmp td { padding: 0.5rem 0.6rem; text-align: center; }
  .mcol { position: sticky; left: 0; background: var(--card); text-align: left; z-index: 1; font-size: 0.72rem; }
  thead th { border-bottom: 1px solid var(--border); background: var(--card); }
  .phead { display: inline-flex; flex-direction: column; align-items: center; gap: 0.2rem; color: var(--foreground); text-decoration: none; }
  .av { width: 26px; height: 26px; border-radius: 50%; }
  .av.ph { display: inline-flex; align-items: center; justify-content: center; background: var(--muted); }
  .pn { font-size: 0.7rem; font-weight: 700; }
  .rm { background: none; border: none; color: var(--muted-foreground); cursor: pointer; }
  .famrow td { text-align: left; font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted-foreground); background: color-mix(in srgb, var(--muted) 50%, transparent); font-weight: 700; }
  .cell { color: var(--muted-foreground); font-weight: 700; border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
  .cell.lead { color: var(--primary); background: color-mix(in srgb, var(--primary) 9%, transparent); }
  .cell.lead::after { content: '🥇'; font-size: 0.6rem; margin-left: 0.2rem; }
  .bar { display: block; height: 4px; border-radius: 3px; background: var(--muted); margin-top: 0.3rem; }
  .bar i { display: block; height: 100%; border-radius: 3px; background: var(--muted-foreground); }
  .cell.lead .bar i { background: var(--primary); }
  .dash { color: var(--muted-foreground); }
  .cmp-empty { text-align: center; padding: 2.5rem 1rem; color: var(--muted-foreground); display: flex; flex-direction: column; gap: 1rem; align-items: center; }
  .addcol { background: var(--card); }
</style>
