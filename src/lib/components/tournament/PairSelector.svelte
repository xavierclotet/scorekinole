<script lang="ts">
  import { searchUsers } from '$lib/firebase/tournaments';
  import { getOrCreatePair, searchPairsByTeamName, getPairDisplayName } from '$lib/firebase/pairs';
  import type { Pair, PairMember } from '$lib/types/pair';
  import type { UserProfile } from '$lib/firebase/userProfile';
  import type { TournamentParticipant } from '$lib/types/tournament';
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    onadd: (participant: Partial<TournamentParticipant>) => void;
    existingParticipants?: Partial<TournamentParticipant>[];
    theme?: 'light' | 'dark';
  }

  let { onadd, existingParticipants = [], theme = 'light' }: Props = $props();

  // Pair search
  let pairSearch = $state('');
  let pairResults = $state<Pair[]>([]);
  let pairLoading = $state(false);

  // New pair form
  let p1 = $state('');
  let p1Results = $state<(UserProfile & { userId: string })[]>([]);
  let p1Loading = $state(false);
  let p1Selected = $state<PairMember | null>(null);

  let p2 = $state('');
  let p2Results = $state<(UserProfile & { userId: string })[]>([]);
  let p2Loading = $state(false);
  let p2Selected = $state<PairMember | null>(null);

  let teamName = $state('');
  let adding = $state(false);

  let canAdd = $derived(p1Selected && p2Selected && !adding);

  // Debounce timers
  let pairTimeout: ReturnType<typeof setTimeout> | null = null;
  let p1Timeout: ReturnType<typeof setTimeout> | null = null;
  let p2Timeout: ReturnType<typeof setTimeout> | null = null;

  // Search existing pairs
  $effect(() => {
    if (pairTimeout) clearTimeout(pairTimeout);
    if (!pairSearch || pairSearch.length < 2) { pairResults = []; return; }
    pairLoading = true;
    pairTimeout = setTimeout(async () => {
      const res = await searchPairsByTeamName(pairSearch, 6);
      pairResults = res.filter(p => !existingParticipants.some(ep => ep.pairId === p.id));
      pairLoading = false;
    }, 250);
  });

  // Search player 1
  $effect(() => {
    if (p1Timeout) clearTimeout(p1Timeout);
    if (!p1 || p1.length < 2 || p1Selected) { p1Results = []; return; }
    p1Loading = true;
    p1Timeout = setTimeout(async () => {
      const res = await searchUsers(p1) as (UserProfile & { userId: string })[];
      p1Results = res.filter(u => !(p2Selected?.type === 'REGISTERED' && p2Selected.userId === u.userId));
      p1Loading = false;
    }, 250);
  });

  // Search player 2
  $effect(() => {
    if (p2Timeout) clearTimeout(p2Timeout);
    if (!p2 || p2.length < 2 || p2Selected) { p2Results = []; return; }
    p2Loading = true;
    p2Timeout = setTimeout(async () => {
      const res = await searchUsers(p2) as (UserProfile & { userId: string })[];
      p2Results = res.filter(u => !(p1Selected?.type === 'REGISTERED' && p1Selected.userId === u.userId));
      p2Loading = false;
    }, 250);
  });

  function selectP1(user: UserProfile & { userId: string }) {
    p1Selected = { type: 'REGISTERED', userId: user.userId, name: user.playerName };
    p1 = user.playerName;
    p1Results = [];
  }

  function selectP2(user: UserProfile & { userId: string }) {
    p2Selected = { type: 'REGISTERED', userId: user.userId, name: user.playerName };
    p2 = user.playerName;
    p2Results = [];
  }

  function setP1Guest() {
    if (p1.trim().length < 3) return;
    p1Selected = { type: 'GUEST', name: p1.trim() };
    p1Results = [];
  }

  function setP2Guest() {
    if (p2.trim().length < 3) return;
    p2Selected = { type: 'GUEST', name: p2.trim() };
    p2Results = [];
  }

  function clearP1() { p1Selected = null; p1 = ''; p1Results = []; }
  function clearP2() { p2Selected = null; p2 = ''; p2Results = []; }

  function addExistingPair(pair: Pair) {
    const participant: Partial<TournamentParticipant> = {
      id: crypto.randomUUID(),
      participantMode: 'pair',
      pairId: pair.id,
      pairTeamName: pair.teamName || undefined,
      name: getPairDisplayName(pair),
      type: 'REGISTERED',
      rankingSnapshot: 0,
      currentRanking: 0,
      status: 'ACTIVE'
    };
    onadd(participant);
    pairSearch = '';
    pairResults = [];
  }

  async function addNewPair() {
    if (!p1Selected || !p2Selected) return;
    adding = true;

    const pair = await getOrCreatePair(p1Selected, p2Selected, teamName || undefined);
    if (pair) {
      const participant: Partial<TournamentParticipant> = {
        id: crypto.randomUUID(),
        participantMode: 'pair',
        pairId: pair.id,
        pairTeamName: teamName || undefined,
        name: getPairDisplayName(pair, teamName),
        type: 'REGISTERED',
        rankingSnapshot: 0,
        currentRanking: 0,
        status: 'ACTIVE'
      };
      onadd(participant);
      clearP1();
      clearP2();
      teamName = '';
    }
    adding = false;
  }
</script>

<div class="ps" data-theme={theme}>
  <!-- Row 1: Search existing pairs -->
  <div class="row">
    <label class="lbl">{m.wizard_searchPair()}</label>
    <div class="search-wrap">
      <input type="text" bind:value={pairSearch} placeholder="Nombre o jugador..." />
      {#if pairLoading}<span class="spin"></span>{/if}
      {#if pairResults.length > 0}
        <div class="results">
          {#each pairResults as pair}
            <button onclick={() => addExistingPair(pair)}>
              <span class="pname">{getPairDisplayName(pair)}</span>
              <span class="pmembers">{pair.member1Name} / {pair.member2Name}</span>
              <span class="plus">+</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Row 2: Create new pair -->
  <div class="row new-pair">
    <label class="lbl">{m.wizard_newPair()}</label>
    <div class="inline-form">
      <!-- Player 1 -->
      <div class="pfield">
        {#if p1Selected}
          <span class="sel" class:guest={p1Selected.type === 'GUEST'}>{p1Selected.name}<button onclick={clearP1}>×</button></span>
        {:else}
          <input type="text" bind:value={p1} placeholder={m.wizard_player1()} />
          {#if p1Loading}<span class="spin"></span>{/if}
          {#if p1Results.length > 0}
            <div class="results">
              {#each p1Results.slice(0, 4) as u}
                <button onclick={() => selectP1(u)}>{u.playerName}</button>
              {/each}
            </div>
          {/if}
          {#if p1.length >= 3 && !p1Loading && p1Results.length === 0}
            <button class="guest-btn" onclick={setP1Guest}>+ inv "{p1}"</button>
          {/if}
        {/if}
      </div>

      <span class="amp">/</span>

      <!-- Player 2 -->
      <div class="pfield">
        {#if p2Selected}
          <span class="sel" class:guest={p2Selected.type === 'GUEST'}>{p2Selected.name}<button onclick={clearP2}>×</button></span>
        {:else}
          <input type="text" bind:value={p2} placeholder={m.wizard_player2()} />
          {#if p2Loading}<span class="spin"></span>{/if}
          {#if p2Results.length > 0}
            <div class="results">
              {#each p2Results.slice(0, 4) as u}
                <button onclick={() => selectP2(u)}>{u.playerName}</button>
              {/each}
            </div>
          {/if}
          {#if p2.length >= 3 && !p2Loading && p2Results.length === 0}
            <button class="guest-btn" onclick={setP2Guest}>+ inv "{p2}"</button>
          {/if}
        {/if}
      </div>

      <!-- Team name -->
      <input type="text" bind:value={teamName} placeholder={m.wizard_teamNamePlaceholder()} class="team" maxlength="40" />

      <!-- Add button -->
      <button class="add" onclick={addNewPair} disabled={!canAdd}>{adding ? '...' : '+'}</button>
    </div>
  </div>
</div>

<style>
  .ps {
    --bg: #fff;
    --bg2: #f8fafc;
    --border: #e2e8f0;
    --txt: #1e293b;
    --muted: #64748b;
    --primary: #3b82f6;
    --sel-bg: #dbeafe;
    --sel-txt: #1e40af;
    --guest-bg: #fef3c7;
    --guest-txt: #b45309;
  }
  .ps[data-theme='dark'] {
    --bg: #1e293b;
    --bg2: #0f172a;
    --border: #475569;
    --txt: #f1f5f9;
    --muted: #94a3b8;
    --sel-bg: #1e3a5f;
    --sel-txt: #93c5fd;
    --guest-bg: #78350f;
    --guest-txt: #fcd34d;
  }

  .ps { display: flex; flex-direction: column; gap: 0.75rem; }

  .row { display: flex; align-items: flex-start; gap: 0.5rem; }
  .lbl { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; width: 80px; flex-shrink: 0; padding-top: 0.5rem; }

  .search-wrap { position: relative; flex: 1; min-width: 0; }
  .pfield { position: relative; }
  .search-wrap input {
    width: 100%; padding: 0.4rem 0.6rem; border: 1px solid var(--border);
    border-radius: 4px; font-size: 0.85rem; background: var(--bg); color: var(--txt); box-sizing: border-box;
  }
  .pfield input {
    width: 100%; padding: 0.35rem 0.5rem; border: 1px solid var(--border);
    border-radius: 4px; font-size: 0.8rem; background: var(--bg); color: var(--txt); box-sizing: border-box;
  }
  .search-wrap input:focus, .pfield input:focus { outline: none; border-color: var(--primary); }

  .spin { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.5s linear infinite; }
  @keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }

  .results { position: absolute; top: 100%; left: 0; right: 0; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; margin-top: 2px; z-index: 20; box-shadow: 0 4px 12px rgba(0,0,0,0.15); overflow: hidden; }
  .results button { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.4rem 0.6rem; border: none; background: transparent; color: var(--txt); font-size: 0.8rem; cursor: pointer; text-align: left; }
  .results button:hover { background: var(--bg2); }
  .pname { font-weight: 500; }
  .pmembers { flex: 1; font-size: 0.75rem; color: var(--muted); }
  .plus { color: var(--primary); font-weight: 600; }

  .guest-btn { width: 100%; margin-top: 0.25rem; padding: 0.3rem; background: transparent; border: 1px dashed var(--border); border-radius: 4px; color: var(--muted); font-size: 0.75rem; cursor: pointer; }
  .guest-btn:hover { border-color: var(--primary); color: var(--primary); }

  .inline-form { display: flex; align-items: flex-start; gap: 0.4rem; flex: 1; flex-wrap: nowrap; }
  .pfield { flex: 0 1 140px; min-width: 110px; max-width: 170px; }
  .amp { color: var(--muted); padding-top: 0.4rem; font-size: 0.8rem; }
  .team { flex: 2; min-width: 120px; padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 4px; font-size: 0.85rem; background: var(--bg); color: var(--txt); }
  .team:focus { outline: none; border-color: var(--primary); }

  .sel { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.25rem 0.4rem; background: var(--sel-bg); border-radius: 3px; font-size: 0.75rem; color: var(--sel-txt); font-weight: 500; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sel.guest { background: var(--guest-bg); color: var(--guest-txt); }
  .sel button { padding: 0; width: 14px; height: 14px; border: none; background: rgba(0,0,0,0.1); color: inherit; border-radius: 50%; cursor: pointer; font-size: 0.7rem; line-height: 1; flex-shrink: 0; }
  .sel button:hover { background: rgba(0,0,0,0.2); }

  .add { padding: 0.4rem 0.8rem; background: var(--primary); color: #fff; border: none; border-radius: 4px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  .add:hover:not(:disabled) { background: #2563eb; }
  .add:disabled { opacity: 0.4; cursor: not-allowed; }

  @media (max-width: 600px) {
    .row { flex-direction: column; gap: 0.25rem; }
    .lbl { width: auto; padding-top: 0; }
    .inline-form { flex-wrap: wrap; gap: 0.4rem; }
    .pfield { flex: 1 1 80px; min-width: 80px; max-width: none; }
    .team { flex: 1 1 100%; min-width: 100px; }
    .amp { display: none; }
    .add { flex: 0 0 auto; }
  }
</style>
