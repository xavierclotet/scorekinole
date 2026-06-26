<script lang="ts">
  import Info from '@lucide/svelte/icons/info';
  import * as Popover from '$lib/components/ui/popover';
  import * as m from '$lib/paraglide/messages.js';
  import type { MetricDescriptor } from '$lib/stats/metrics';

  let { metric }: { metric: MetricDescriptor } = $props();
  let open = $state(false);
  const label = $derived((m[metric.labelKey as keyof typeof m] as () => string)?.() ?? metric.id);
  const desc = $derived((m[metric.descKey as keyof typeof m] as () => string)?.() ?? '');
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button {...props} class="info-btn" aria-label={label}>
        <Info class="size-3.5" />
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-[260px]">
    <div class="mi-pop">
      <p class="mi-title">{label}</p>
      <p class="mi-desc">{desc}</p>
    </div>
  </Popover.Content>
</Popover.Root>

<style>
  .info-btn { display: inline-flex; align-items: center; justify-content: center; padding: 0; background: none; border: none; color: var(--muted-foreground); cursor: pointer; vertical-align: middle; }
  .info-btn:hover { color: var(--primary); }
  .mi-pop { padding: 0.85rem 0.9rem; }
  .mi-title { margin: 0 0 0.3rem; font-weight: 700; font-size: 0.82rem; }
  .mi-desc { margin: 0; font-size: 0.76rem; line-height: 1.45; color: var(--muted-foreground); }
</style>
