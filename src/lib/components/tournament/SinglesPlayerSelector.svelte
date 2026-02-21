<script lang="ts">
  import { tick } from 'svelte';
  import { ChevronsUpDown, UserPlus, X, User, Plus } from '@lucide/svelte';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { searchUsers } from '$lib/firebase/tournaments';
  import type { UserProfile } from '$lib/firebase/userProfile';
  import type { TournamentParticipant } from '$lib/types/tournament';
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    onadd: (participant: Partial<TournamentParticipant>) => void;
    excludedNames?: Set<string>;
    excludedUserIds?: string[];
  }

  interface SelectedPlayer {
    type: 'REGISTERED' | 'GUEST';
    userId?: string;
    name: string;
    photoURL?: string;
  }

  type UserWithRanking = UserProfile & { userId: string; ranking?: number };

  let { onadd, excludedNames = new Set(), excludedUserIds = [] }: Props = $props();

  let open = $state(false);
  let query = $state('');
  let rawResults = $state<UserWithRanking[]>([]);
  let loading = $state(false);
  let selected = $state<SelectedPlayer | null>(null);
  let triggerRef = $state<HTMLButtonElement | null>(null);
  let adding = $state(false);

  let canAdd = $derived(selected && !adding);

  // Filter results to exclude names and userIds already in the participants list
  let results = $derived(
    rawResults.filter(u =>
      !excludedNames.has(u.playerName?.toLowerCase() || '') &&
      !excludedUserIds.includes(u.userId)
    )
  );

  // Can add as guest if query >= 3 chars and no results
  let canAddGuest = $derived(query.trim().length >= 3 && !loading && results.length === 0);

  async function handleSearch(q: string) {
    query = q;
    if (q.length < 2) {
      rawResults = [];
      return;
    }
    loading = true;
    const res = await searchUsers(q) as UserWithRanking[];
    rawResults = res;
    loading = false;
  }

  function selectUser(user: UserWithRanking) {
    const isGuest = user.authProvider === null;
    selected = {
      type: isGuest ? 'GUEST' : 'REGISTERED',
      userId: user.userId,
      name: user.playerName,
      photoURL: isGuest ? undefined : (user.photoURL || undefined)
    };
    query = '';
    rawResults = [];
    closeAndFocus();
  }

  function setGuest() {
    if (query.trim().length < 3) return;
    selected = { type: 'GUEST', name: query.trim() };
    query = '';
    rawResults = [];
    closeAndFocus();
  }

  function closeAndFocus() {
    open = false;
    tick().then(() => triggerRef?.focus());
  }

  function clearSelection() {
    selected = null;
    query = '';
    rawResults = [];
  }

  function addPlayer() {
    if (!selected) return;
    adding = true;
    const participant: Partial<TournamentParticipant> = {
      id: crypto.randomUUID(),
      type: selected.type,
      name: selected.name,
      userId: selected.userId,
      photoURL: selected.photoURL,
      rankingSnapshot: 0,
      status: 'ACTIVE'
    };
    onadd(participant);
    clearSelection();
    adding = false;
  }
</script>

<div class="flex items-end gap-3">
  <!-- Player selector -->
  <div class="flex flex-col gap-1.5 flex-1 max-w-xs">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wide">
      {m.wizard_searchRegistered()}
    </label>
    {#if selected}
      <div class={[
        "group flex items-center gap-2 h-8 px-2.5 rounded-md border text-sm font-medium transition-all duration-200",
        selected.type === 'GUEST'
          ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
          : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"
      ]}>
        {#if selected.type === 'GUEST'}
          <UserPlus class="w-3.5 h-3.5 shrink-0 opacity-70" />
        {:else}
          <User class="w-3.5 h-3.5 shrink-0 opacity-70" />
        {/if}
        <span class="truncate flex-1 text-xs">{selected.name}</span>
        <button
          onclick={clearSelection}
          class="w-5 h-5 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all shrink-0"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    {:else}
      <Popover.Root bind:open>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              bind:ref={triggerRef}
              variant="outline"
              role="combobox"
              aria-expanded={open}
              class="w-full justify-between h-8 text-xs"
            >
              <span class="text-muted-foreground truncate">{m.wizard_searchOrGuest()}</span>
              <ChevronsUpDown class="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-[280px] p-0" align="start">
          <Command.Root shouldFilter={false}>
            <Command.Input
              placeholder="Nombre o email..."
              value={query}
              oninput={(e) => handleSearch(e.currentTarget.value)}
              name="singles-player-search-nofill"
              autocomplete="new-password"
              autocorrect="off"
              autocapitalize="off"
              spellcheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
            />
            <Command.List>
              {#if loading}
                <Command.Loading>Buscando...</Command.Loading>
              {:else if query.length >= 2 && results.length === 0 && !canAddGuest}
                <Command.Empty>No se encontraron jugadores</Command.Empty>
              {:else}
                <Command.Group>
                  {#each results.slice(0, 6) as user (user.userId)}
                    <Command.Item
                      value={user.playerName || ''}
                      onSelect={() => selectUser(user)}
                      class="flex items-center justify-between cursor-pointer"
                    >
                      <div class="flex flex-col">
                        <span class="font-medium text-sm">{user.playerName}</span>
                        {#if user.authProvider === null}
                          <span class="text-xs text-amber-600 dark:text-amber-400">Invitado existente</span>
                        {:else if user.email}
                          <span class="text-xs text-muted-foreground">{user.email}</span>
                        {/if}
                      </div>
                      {#if user.authProvider === null}
                        <UserPlus class="w-3.5 h-3.5 shrink-0 text-amber-500 opacity-70" />
                      {/if}
                    </Command.Item>
                  {/each}
                </Command.Group>
              {/if}
              {#if canAddGuest}
                <Command.Group>
                  <Command.Item
                    value="__guest__"
                    onSelect={setGuest}
                    class="flex items-center gap-2 cursor-pointer text-amber-600 dark:text-amber-400"
                  >
                    <UserPlus class="w-4 h-4" />
                    <span class="text-sm">Añadir invitado "{query}"</span>
                  </Command.Item>
                </Command.Group>
              {/if}
            </Command.List>
          </Command.Root>
        </Popover.Content>
      </Popover.Root>
    {/if}
  </div>

  <!-- Add button -->
  <Button
    onclick={addPlayer}
    disabled={!canAdd}
    size="sm"
    class={[
      "h-8 min-w-[100px] px-4 gap-2 font-semibold transition-all duration-200",
      canAdd
        ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md"
        : "opacity-40"
    ]}
  >
    {#if adding}
      <span class="animate-spin text-sm">⏳</span>
    {:else}
      <Plus class="w-4 h-4" />
      <span class="text-sm">{m.common_add()}</span>
    {/if}
  </Button>
</div>
