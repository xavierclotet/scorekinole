<!-- src/lib/components/leaderboards/LeaderboardFullscreen.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages.js';
  import X from '@lucide/svelte/icons/x';
  import { formatMetric, type MetricDescriptor } from '$lib/stats/metrics';
  import { rankEntries, type LeaderboardEntry } from '$lib/stats/leaderboard';

  let { metric, entries, onclose }:
    { metric: MetricDescriptor; entries: LeaderboardEntry[]; onclose: () => void } = $props();

  let q = $state('');
  let ranked = $derived(rankEntries(entries));
  let filtered = $derived(ranked.filter((e) => e.stats.displayName.toLowerCase().includes(q.toLowerCase())));
  let label = $derived((m[metric.labelKey as keyof typeof m] as () => string)?.() ?? metric.id);

  onMount(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  });
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onclose(); }
</script>

<svelte:window onkeydown={onKey} />
<div class="fs-overlay" onclick={onclose} onkeydown={onKey} role="presentation">
  <div class="fs-panel" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') onclose(); e.stopPropagation(); }} role="dialog" aria-modal="true" tabindex="-1">
    <header class="fs-head">
      <h2>{label}</h2>
      <input class="fs-search" placeholder={m.leaderboards_search?.() ?? 'Buscar jugador…'} bind:value={q} />
      <button class="fs-close" onclick={onclose} aria-label="Close"><X size={18} /></button>
    </header>
    <div class="fs-list">
      {#each filtered as e (e.stats.userId)}
        <a class="fs-row" href={`/users/${e.stats.userId}`}>
          <span class="rk">{e.rank}</span>
          {#if e.stats.photoURL}<img class="av" src={e.stats.photoURL} alt="" />{:else}<span class="av ph">{e.stats.displayName.charAt(0)}</span>{/if}
          <span class="nm">{e.stats.displayName}</span>
          <span class="val">{formatMetric(metric, e.value)}</span>
        </a>
      {/each}
    </div>
  </div>
</div>

<style>
  .fs-overlay { position: fixed; inset: 0; z-index: 9999; background: color-mix(in srgb, var(--background) 80%, black); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 1rem; animation: fade 0.15s ease-out; }
  .fs-panel { background: var(--card); border: 1px solid var(--border); border-radius: 14px; width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; animation: pop 0.18s ease-out; }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pop { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .fs-head { display: flex; align-items: center; gap: 0.6rem; padding: 0.9rem 1rem; border-bottom: 1px solid var(--border); }
  .fs-head h2 { font-size: 0.95rem; margin: 0; flex-shrink: 0; }
  .fs-search { flex: 1; font-size: 0.8rem; padding: 0.4rem 0.6rem; border-radius: 8px; border: 1px solid var(--border); background: var(--background); color: var(--foreground); }
  .fs-close { background: none; border: none; color: var(--muted-foreground); cursor: pointer; }
  .fs-list { overflow-y: auto; padding: 0.5rem 1rem 1rem; }
  .fs-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0; border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); font-size: 0.82rem; color: var(--foreground); text-decoration: none; }
  .rk { width: 22px; text-align: center; font-weight: 700; font-size: 0.7rem; color: var(--muted-foreground); }
  .av { width: 22px; height: 22px; border-radius: 50%; }
  .av.ph { display: inline-flex; align-items: center; justify-content: center; background: var(--muted); font-size: 0.65rem; }
  .nm { flex: 1; } .val { font-weight: 800; color: var(--primary); }
</style>
