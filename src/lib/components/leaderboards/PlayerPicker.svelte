<!-- src/lib/components/leaderboards/PlayerPicker.svelte -->
<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import * as m from '$lib/paraglide/messages.js';
  import type { PlayerStats } from '$lib/types/playerStats';

  let { players, selectedIds, onadd }:
    { players: PlayerStats[]; selectedIds: string[]; onadd: (id: string) => void } = $props();

  let open = $state(false);
  let q = $state('');
  let results = $derived(
    players
      .filter((p) => !selectedIds.includes(p.userId) && p.displayName.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 8)
  );
  function pick(id: string) { onadd(id); open = false; q = ''; }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button {...props} class="add-col"><Plus size={15} /> {m.leaderboards_addPlayer?.() ?? 'Añadir'}</button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-[260px] p-0">
    <Command.Root shouldFilter={false}>
      <Command.Input placeholder={m.leaderboards_search?.() ?? 'Buscar jugador…'} value={q} oninput={(e) => (q = e.currentTarget.value)} />
      <Command.List>
        <Command.Empty>{m.leaderboards_noPlayers?.() ?? 'Sin resultados'}</Command.Empty>
        <Command.Group>
          {#each results as p (p.userId)}
            <Command.Item value={p.displayName} onSelect={() => pick(p.userId)}>{p.displayName}</Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>

<style>
  .add-col { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; color: var(--primary); background: none; border: 1px dashed color-mix(in srgb, var(--primary) 40%, transparent); border-radius: 8px; padding: 0.4rem 0.6rem; cursor: pointer; }
</style>
