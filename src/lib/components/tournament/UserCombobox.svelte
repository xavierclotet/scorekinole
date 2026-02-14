<script lang="ts">
  import { tick } from 'svelte';
  import { ChevronsUpDown } from '@lucide/svelte';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { searchUsers } from '$lib/firebase/tournaments';
  import type { UserProfile } from '$lib/firebase/userProfile';

  interface Props {
    onselect: (user: UserProfile & { userId: string }) => void;
    placeholder?: string;
    excludedNames?: Set<string>;
    theme?: 'light' | 'dark' | 'violet';
  }

  let { onselect, placeholder = 'Buscar jugador...', excludedNames = new Set(), theme = 'light' }: Props = $props();

  let open = $state(false);
  let searchQuery = $state('');
  let searchResults = $state<(UserProfile & { userId: string })[]>([]);
  let loading = $state(false);
  let triggerRef = $state<HTMLButtonElement | null>(null);

  // Filter results excluding names already in textarea
  let filteredResults = $derived(
    searchResults.filter(u => !excludedNames.has(u.playerName?.toLowerCase() || ''))
  );

  async function handleSearch(query: string) {
    searchQuery = query;
    if (query.length < 2) {
      searchResults = [];
      return;
    }
    loading = true;
    const results = await searchUsers(query) as (UserProfile & { userId: string })[];
    searchResults = results;
    loading = false;
  }

  function handleSelect(user: UserProfile & { userId: string }) {
    onselect(user);
    searchQuery = '';
    searchResults = [];
    closeAndFocusTrigger();
  }

  function closeAndFocusTrigger() {
    open = false;
    tick().then(() => {
      triggerRef?.focus();
    });
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        bind:ref={triggerRef}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        class="w-full justify-between"
      >
        <span class="text-muted-foreground">{placeholder}</span>
        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-[300px] p-0" align="start">
    <Command.Root shouldFilter={false}>
      <Command.Input
        placeholder="Nombre o email..."
        value={searchQuery}
        oninput={(e) => handleSearch(e.currentTarget.value)}
      />
      <Command.List>
        {#if loading}
          <Command.Loading>Buscando...</Command.Loading>
        {:else if searchQuery.length >= 2 && filteredResults.length === 0}
          <Command.Empty>No se encontraron jugadores</Command.Empty>
        {:else}
          <Command.Group>
            {#each filteredResults.slice(0, 8) as user}
              <Command.Item
                value={user.playerName || ''}
                onSelect={() => handleSelect(user)}
                class="flex items-center justify-between cursor-pointer"
              >
                <div class="flex flex-col">
                  <span class="font-medium">{user.playerName}</span>
                  {#if user.email}
                    <span class="text-xs text-muted-foreground">{user.email}</span>
                  {/if}
                </div>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
