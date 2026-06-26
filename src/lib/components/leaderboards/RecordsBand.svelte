<!-- src/lib/components/leaderboards/RecordsBand.svelte -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import { buildLeaderboard } from '$lib/stats/leaderboard';
  import { getMetric, formatMetric } from '$lib/stats/metrics';
  import type { PlayerStats } from '$lib/types/playerStats';

  let { players }: { players: PlayerStats[] } = $props();

  const TILE_METRIC_IDS = ['maxTwentiesInRound', 'maxTwentiesInGame', 'bestWinStreak', 'singlesTitles'];

  let tiles = $derived(TILE_METRIC_IDS.map((id) => {
    const metric = getMetric(id);
    const top = buildLeaderboard(players, metric, { year: 'all', minMatches: 0 })[0];
    return { id, label: m[metric.labelKey as keyof typeof m] as () => string, top, metric };
  }));
</script>

<div class="records-band">
  {#each tiles as t (t.id)}
    <div class="rec-tile">
      <div class="rec-label">{t.label?.() ?? t.id}</div>
      {#if t.top}
        <div class="rec-value">{formatMetric(t.metric, t.top.value)}</div>
        <a class="rec-who" href={`/users/${t.top.stats.userId}`}>
          {#if t.top.stats.photoURL}<img src={t.top.stats.photoURL} alt="" />{:else}<span class="ph">{t.top.stats.displayName.charAt(0)}</span>{/if}
          {t.top.stats.displayName}
        </a>
      {:else}
        <div class="rec-empty">—</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .records-band { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; }
  .rec-tile { border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); background: linear-gradient(160deg, color-mix(in srgb, var(--primary) 12%, transparent), transparent); border-radius: 12px; padding: 0.7rem; }
  .rec-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground); }
  .rec-value { font-size: 1.6rem; font-weight: 800; color: var(--primary); line-height: 1.1; }
  .rec-who { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.7rem; margin-top: 0.25rem; color: var(--primary); text-decoration: none; }
  .rec-who img, .rec-who .ph { width: 16px; height: 16px; border-radius: 50%; }
  .rec-who .ph { display: inline-flex; align-items: center; justify-content: center; background: var(--muted); font-size: 0.55rem; }
  @media (max-width: 640px) { .records-band { grid-template-columns: repeat(2, 1fr); } }
</style>
