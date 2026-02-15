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
    existingParticipants?: Partial<TournamentParticipant>[];
    excludedUserIds?: string[];
    excludedNames?: Set<string>;
  }

  interface SelectedMember {
    type: 'REGISTERED' | 'GUEST';
    userId?: string;
    name: string;
    photoURL?: string;
  }

  // Extended type to include ranking from search results
  type UserWithRanking = UserProfile & { userId: string; ranking?: number };

  let { onadd, existingParticipants = [], excludedUserIds = [], excludedNames = new Set() }: Props = $props();

  // Player 1
  let p1Open = $state(false);
  let p1Query = $state('');
  let p1RawResults = $state<UserWithRanking[]>([]);
  let p1Loading = $state(false);
  let p1Selected = $state<SelectedMember | null>(null);
  let p1TriggerRef = $state<HTMLButtonElement | null>(null);

  // Player 2
  let p2Open = $state(false);
  let p2Query = $state('');
  let p2RawResults = $state<UserWithRanking[]>([]);
  let p2Loading = $state(false);
  let p2Selected = $state<SelectedMember | null>(null);
  let p2TriggerRef = $state<HTMLButtonElement | null>(null);

  let teamName = $state('');
  let adding = $state(false);

  let canAdd = $derived(p1Selected && p2Selected && !adding);

  // Filter results to exclude already selected players and names in textarea
  let p1Results = $derived(
    p1RawResults.filter(u =>
      !(p2Selected?.type === 'REGISTERED' && p2Selected.userId === u.userId) &&
      !excludedUserIds.includes(u.userId) &&
      !excludedNames.has(u.playerName?.toLowerCase() || '')
    )
  );

  let p2Results = $derived(
    p2RawResults.filter(u =>
      !(p1Selected?.type === 'REGISTERED' && p1Selected.userId === u.userId) &&
      !excludedUserIds.includes(u.userId) &&
      !excludedNames.has(u.playerName?.toLowerCase() || '')
    )
  );

  // Can add as guest flags
  let canAddP1Guest = $derived(p1Query.trim().length >= 3 && !p1Loading && p1Results.length === 0);
  let canAddP2Guest = $derived(p2Query.trim().length >= 3 && !p2Loading && p2Results.length === 0);

  // Search handlers
  async function handleP1Search(query: string) {
    p1Query = query;
    if (query.length < 2) {
      p1RawResults = [];
      return;
    }
    p1Loading = true;
    const res = await searchUsers(query) as UserWithRanking[];
    p1RawResults = res;
    p1Loading = false;
  }

  async function handleP2Search(query: string) {
    p2Query = query;
    if (query.length < 2) {
      p2RawResults = [];
      return;
    }
    p2Loading = true;
    const res = await searchUsers(query) as UserWithRanking[];
    p2RawResults = res;
    p2Loading = false;
  }

  function selectP1(user: UserWithRanking) {
    p1Selected = {
      type: 'REGISTERED',
      userId: user.userId,
      name: user.playerName,
      photoURL: user.photoURL || undefined
    };
    p1Query = '';
    p1RawResults = [];
    closeP1AndFocus();
  }

  function selectP2(user: UserWithRanking) {
    p2Selected = {
      type: 'REGISTERED',
      userId: user.userId,
      name: user.playerName,
      photoURL: user.photoURL || undefined
    };
    p2Query = '';
    p2RawResults = [];
    closeP2AndFocus();
  }

  function setP1Guest() {
    if (p1Query.trim().length < 3) return;
    p1Selected = { type: 'GUEST', name: p1Query.trim() };
    p1Query = '';
    p1RawResults = [];
    closeP1AndFocus();
  }

  function setP2Guest() {
    if (p2Query.trim().length < 3) return;
    p2Selected = { type: 'GUEST', name: p2Query.trim() };
    p2Query = '';
    p2RawResults = [];
    closeP2AndFocus();
  }

  function closeP1AndFocus() {
    p1Open = false;
    tick().then(() => p1TriggerRef?.focus());
  }

  function closeP2AndFocus() {
    p2Open = false;
    tick().then(() => p2TriggerRef?.focus());
  }

  function clearP1() {
    p1Selected = null;
    p1Query = '';
    p1RawResults = [];
  }

  function clearP2() {
    p2Selected = null;
    p2Query = '';
    p2RawResults = [];
  }

  function addPair() {
    if (!p1Selected || !p2Selected) return;
    adding = true;

    // Check for duplicate pair (same two players)
    const isDuplicate = existingParticipants.some(ep => {
      if (!ep.partner) return false;
      const existingP1 = ep.userId || ep.name;
      const existingP2 = ep.partner.userId || ep.partner.name;
      const newP1 = p1Selected!.userId || p1Selected!.name;
      const newP2 = p2Selected!.userId || p2Selected!.name;
      return (existingP1 === newP1 && existingP2 === newP2) ||
             (existingP1 === newP2 && existingP2 === newP1);
    });

    if (isDuplicate) {
      adding = false;
      return;
    }

    const participant: Partial<TournamentParticipant> = {
      id: crypto.randomUUID(),
      name: p1Selected.name,
      type: p1Selected.type,
      userId: p1Selected.userId,
      photoURL: p1Selected.photoURL,
      teamName: teamName.trim() || undefined,
      partner: {
        type: p2Selected.type,
        userId: p2Selected.userId,
        name: p2Selected.name,
        photoURL: p2Selected.photoURL
      },
      rankingSnapshot: 0, // Calculated via syncParticipantRankings when tournament starts
      status: 'ACTIVE'
    };

    onadd(participant);
    clearP1();
    clearP2();
    teamName = '';
    adding = false;
  }
</script>

<div class="grid grid-cols-[1fr_auto_1fr_1.2fr] gap-3 items-start max-md:grid-cols-2 max-md:gap-2">
  <!-- Player 1 -->
  <div class="flex flex-col gap-1.5">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wide">
      {m.wizard_player1()}
    </label>
    {#if p1Selected}
      <div class={[
        "group flex items-center gap-2 h-8 px-2.5 rounded-md border text-sm font-medium transition-all duration-200",
        p1Selected.type === 'GUEST'
          ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
          : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"
      ]}>
        {#if p1Selected.type === 'GUEST'}
          <UserPlus class="w-3.5 h-3.5 shrink-0 opacity-70" />
        {:else}
          <User class="w-3.5 h-3.5 shrink-0 opacity-70" />
        {/if}
        <span class="truncate flex-1 text-xs">{p1Selected.name}</span>
        <button
          onclick={clearP1}
          class="w-5 h-5 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all shrink-0"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    {:else}
      <Popover.Root bind:open={p1Open}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              bind:ref={p1TriggerRef}
              variant="outline"
              role="combobox"
              aria-expanded={p1Open}
              class="w-full justify-between h-8 text-xs"
            >
              <span class="text-muted-foreground truncate">{m.wizard_searchOrGuest()}</span>
              <ChevronsUpDown class="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-[250px] p-0" align="start">
          <Command.Root shouldFilter={false}>
            <Command.Input
              placeholder="Nombre o email..."
              value={p1Query}
              oninput={(e) => handleP1Search(e.currentTarget.value)}
              name="player1-search-nofill"
              autocomplete="new-password"
              autocorrect="off"
              autocapitalize="off"
              spellcheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
            />
            <Command.List>
              {#if p1Loading}
                <Command.Loading>Buscando...</Command.Loading>
              {:else if p1Query.length >= 2 && p1Results.length === 0 && !canAddP1Guest}
                <Command.Empty>No se encontraron jugadores</Command.Empty>
              {:else}
                <Command.Group>
                  {#each p1Results.slice(0, 6) as user}
                    <Command.Item
                      value={user.playerName || ''}
                      onSelect={() => selectP1(user)}
                      class="flex items-center justify-between cursor-pointer"
                    >
                      <div class="flex flex-col">
                        <span class="font-medium text-sm">{user.playerName}</span>
                        {#if user.email}
                          <span class="text-xs text-muted-foreground">{user.email}</span>
                        {/if}
                      </div>
                    </Command.Item>
                  {/each}
                </Command.Group>
              {/if}
              {#if canAddP1Guest}
                <Command.Group>
                  <Command.Item
                    value="__guest__"
                    onSelect={setP1Guest}
                    class="flex items-center gap-2 cursor-pointer text-amber-600 dark:text-amber-400"
                  >
                    <UserPlus class="w-4 h-4" />
                    <span class="text-sm">Añadir invitado "{p1Query}"</span>
                  </Command.Item>
                </Command.Group>
              {/if}
            </Command.List>
          </Command.Root>
        </Popover.Content>
      </Popover.Root>
    {/if}
  </div>

  <div class="flex flex-col gap-1.5 max-md:hidden">
    <span class="text-[0.7rem] invisible">.</span>
    <span class="h-8 flex items-center justify-center text-muted-foreground font-medium text-lg">/</span>
  </div>

  <!-- Player 2 -->
  <div class="flex flex-col gap-1.5">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wide">
      {m.wizard_player2()}
    </label>
    {#if p2Selected}
      <div class={[
        "group flex items-center gap-2 h-8 px-2.5 rounded-md border text-sm font-medium transition-all duration-200",
        p2Selected.type === 'GUEST'
          ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
          : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"
      ]}>
        {#if p2Selected.type === 'GUEST'}
          <UserPlus class="w-3.5 h-3.5 shrink-0 opacity-70" />
        {:else}
          <User class="w-3.5 h-3.5 shrink-0 opacity-70" />
        {/if}
        <span class="truncate flex-1 text-xs">{p2Selected.name}</span>
        <button
          onclick={clearP2}
          class="w-5 h-5 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all shrink-0"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    {:else}
      <Popover.Root bind:open={p2Open}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              bind:ref={p2TriggerRef}
              variant="outline"
              role="combobox"
              aria-expanded={p2Open}
              class="w-full justify-between h-8 text-xs"
            >
              <span class="text-muted-foreground truncate">{m.wizard_searchOrGuest()}</span>
              <ChevronsUpDown class="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-[250px] p-0" align="start">
          <Command.Root shouldFilter={false}>
            <Command.Input
              placeholder="Nombre o email..."
              value={p2Query}
              oninput={(e) => handleP2Search(e.currentTarget.value)}
              name="player2-search-nofill"
              autocomplete="new-password"
              autocorrect="off"
              autocapitalize="off"
              spellcheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
            />
            <Command.List>
              {#if p2Loading}
                <Command.Loading>Buscando...</Command.Loading>
              {:else if p2Query.length >= 2 && p2Results.length === 0 && !canAddP2Guest}
                <Command.Empty>No se encontraron jugadores</Command.Empty>
              {:else}
                <Command.Group>
                  {#each p2Results.slice(0, 6) as user}
                    <Command.Item
                      value={user.playerName || ''}
                      onSelect={() => selectP2(user)}
                      class="flex items-center justify-between cursor-pointer"
                    >
                      <div class="flex flex-col">
                        <span class="font-medium text-sm">{user.playerName}</span>
                        {#if user.email}
                          <span class="text-xs text-muted-foreground">{user.email}</span>
                        {/if}
                      </div>
                    </Command.Item>
                  {/each}
                </Command.Group>
              {/if}
              {#if canAddP2Guest}
                <Command.Group>
                  <Command.Item
                    value="__guest__"
                    onSelect={setP2Guest}
                    class="flex items-center gap-2 cursor-pointer text-amber-600 dark:text-amber-400"
                  >
                    <UserPlus class="w-4 h-4" />
                    <span class="text-sm">Añadir invitado "{p2Query}"</span>
                  </Command.Item>
                </Command.Group>
              {/if}
            </Command.List>
          </Command.Root>
        </Popover.Content>
      </Popover.Root>
    {/if}
  </div>

  <!-- Team name & add -->
  <div class="flex flex-col gap-1.5 max-md:col-span-2">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wide">
      {m.wizard_teamName()}
    </label>
    <div class="flex items-center gap-2">
      <input
        type="text"
        bind:value={teamName}
        placeholder={m.wizard_teamNamePlaceholder()}
        class="h-8 text-xs flex-1 px-2.5 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
        maxlength={40}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        data-form-type="other"
        data-lpignore="true"
      />
      <Button
        onclick={addPair}
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
  </div>
</div>
