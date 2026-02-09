<script lang="ts">
  import { searchUsers } from '$lib/firebase/tournaments';
  import type { UserProfile } from '$lib/firebase/userProfile';
  import type { TournamentParticipant } from '$lib/types/tournament';
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    onadd: (participant: Partial<TournamentParticipant>) => void;
    existingParticipants?: Partial<TournamentParticipant>[];
    excludedUserIds?: string[];
    theme?: 'light' | 'dark';
  }

  interface SelectedMember {
    type: 'REGISTERED' | 'GUEST';
    userId?: string;
    name: string;
    photoURL?: string;
  }

  let { onadd, existingParticipants = [], excludedUserIds = [], theme = 'light' }: Props = $props();

  // Player 1
  let p1 = $state('');
  let p1RawResults = $state<(UserProfile & { userId: string })[]>([]);
  let p1Loading = $state(false);
  let p1Selected = $state<SelectedMember | null>(null);

  // Player 2
  let p2 = $state('');
  let p2RawResults = $state<(UserProfile & { userId: string })[]>([]);
  let p2Loading = $state(false);
  let p2Selected = $state<SelectedMember | null>(null);

  let teamName = $state('');
  let adding = $state(false);

  let canAdd = $derived(p1Selected && p2Selected && !adding);

  // Filter results to exclude already selected players
  let p1Results = $derived(
    p1RawResults.filter(u =>
      !(p2Selected?.type === 'REGISTERED' && p2Selected.userId === u.userId) &&
      !excludedUserIds.includes(u.userId)
    )
  );

  let p2Results = $derived(
    p2RawResults.filter(u =>
      !(p1Selected?.type === 'REGISTERED' && p1Selected.userId === u.userId) &&
      !excludedUserIds.includes(u.userId)
    )
  );

  let p1Timeout: ReturnType<typeof setTimeout> | null = null;
  let p2Timeout: ReturnType<typeof setTimeout> | null = null;

  // Search player 1
  $effect(() => {
    if (p1Timeout) clearTimeout(p1Timeout);
    if (!p1 || p1.length < 2 || p1Selected) { p1RawResults = []; return; }
    p1Loading = true;
    p1Timeout = setTimeout(async () => {
      const res = await searchUsers(p1) as (UserProfile & { userId: string })[];
      p1RawResults = res;
      p1Loading = false;
    }, 250);
  });

  // Search player 2
  $effect(() => {
    if (p2Timeout) clearTimeout(p2Timeout);
    if (!p2 || p2.length < 2 || p2Selected) { p2RawResults = []; return; }
    p2Loading = true;
    p2Timeout = setTimeout(async () => {
      const res = await searchUsers(p2) as (UserProfile & { userId: string })[];
      p2RawResults = res;
      p2Loading = false;
    }, 250);
  });

  function selectP1(user: UserProfile & { userId: string }) {
    p1Selected = {
      type: 'REGISTERED',
      userId: user.userId,
      name: user.playerName,
      photoURL: user.photoURL || undefined
    };
    p1 = user.playerName;
    p1RawResults = [];
  }

  function selectP2(user: UserProfile & { userId: string }) {
    p2Selected = {
      type: 'REGISTERED',
      userId: user.userId,
      name: user.playerName,
      photoURL: user.photoURL || undefined
    };
    p2 = user.playerName;
    p2RawResults = [];
  }

  function setP1Guest() {
    if (p1.trim().length < 3) return;
    p1Selected = { type: 'GUEST', name: p1.trim() };
    p1RawResults = [];
  }

  function setP2Guest() {
    if (p2.trim().length < 3) return;
    p2Selected = { type: 'GUEST', name: p2.trim() };
    p2RawResults = [];
  }

  function clearP1() { p1Selected = null; p1 = ''; p1RawResults = []; }
  function clearP2() { p2Selected = null; p2 = ''; p2RawResults = []; }

  function addPair() {
    if (!p1Selected || !p2Selected) return;
    adding = true;

    // Check for duplicate pair (same two players)
    const isDuplicate = existingParticipants.some(ep => {
      if (!ep.partner) return false;
      // Check both combinations using real names
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

    // Create participant with REAL names (teamName is optional for display)
    const participant: Partial<TournamentParticipant> = {
      id: crypto.randomUUID(),
      name: p1Selected.name,              // Player 1's REAL name
      type: p1Selected.type,
      userId: p1Selected.userId,
      photoURL: p1Selected.photoURL,
      teamName: teamName.trim() || undefined,  // Optional artistic name
      partner: {
        type: p2Selected.type,
        userId: p2Selected.userId,
        name: p2Selected.name,            // Player 2's REAL name
        photoURL: p2Selected.photoURL
      },
      rankingSnapshot: 0,
      currentRanking: 0,
      status: 'ACTIVE'
    };

    onadd(participant);
    clearP1();
    clearP2();
    teamName = '';
    adding = false;
  }
</script>

<div class="pair-selector" data-theme={theme}>
  <div class="add-row">
    <!-- Player 1 -->
    <div class="add-field player-field">
      <label>{m.wizard_player1()}</label>
      <div class="player-box">
        {#if p1Selected}
          <span class="player-chip" class:guest={p1Selected.type === 'GUEST'}>
            {p1Selected.name}
            <button class="chip-clear" onclick={clearP1}>×</button>
          </span>
        {:else}
          <div class="player-search">
            <input
              type="text"
              bind:value={p1}
              placeholder={m.wizard_searchOrGuest()}
              class="player-input"
              autocomplete="off"
            />
            {#if p1Loading}<span class="mini-loading">⏳</span>{/if}
          </div>
          {#if p1Results.length > 0}
            <div class="player-results">
              {#each p1Results.slice(0, 4) as u}
                <button onclick={() => selectP1(u)}>{u.playerName}</button>
              {/each}
            </div>
          {/if}
          {#if p1.length >= 3 && !p1Loading && p1Results.length === 0}
            <button class="add-guest-btn" onclick={setP1Guest}>+ inv "{p1}"</button>
          {/if}
        {/if}
      </div>
    </div>

    <span class="pair-sep">/</span>

    <!-- Player 2 -->
    <div class="add-field player-field">
      <label>{m.wizard_player2()}</label>
      <div class="player-box">
        {#if p2Selected}
          <span class="player-chip" class:guest={p2Selected.type === 'GUEST'}>
            {p2Selected.name}
            <button class="chip-clear" onclick={clearP2}>×</button>
          </span>
        {:else}
          <div class="player-search">
            <input
              type="text"
              bind:value={p2}
              placeholder={m.wizard_searchOrGuest()}
              class="player-input"
              autocomplete="off"
            />
            {#if p2Loading}<span class="mini-loading">⏳</span>{/if}
          </div>
          {#if p2Results.length > 0}
            <div class="player-results">
              {#each p2Results.slice(0, 4) as u}
                <button onclick={() => selectP2(u)}>{u.playerName}</button>
              {/each}
            </div>
          {/if}
          {#if p2.length >= 3 && !p2Loading && p2Results.length === 0}
            <button class="add-guest-btn" onclick={setP2Guest}>+ inv "{p2}"</button>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Team name & add -->
    <div class="add-field team-field">
      <label>{m.wizard_teamName()}</label>
      <div class="team-input-group">
        <input
          type="text"
          bind:value={teamName}
          placeholder={m.wizard_teamNamePlaceholder()}
          class="input-field"
          maxlength="40"
        />
        <button class="add-btn" onclick={addPair} disabled={!canAdd}>
          {adding ? '...' : '+'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .pair-selector {
    --bg: #fff;
    --bg-input: #fff;
    --bg-hover: #f1f5f9;
    --border: #e2e8f0;
    --txt: #1e293b;
    --txt-muted: #64748b;
    --primary: #3b82f6;
    --primary-hover: #2563eb;
    --chip-bg: #dbeafe;
    --chip-txt: #1e40af;
    --guest-bg: #fef3c7;
    --guest-txt: #92400e;
  }

  .pair-selector[data-theme='dark'] {
    --bg: #1a2332;
    --bg-input: #0f172a;
    --bg-hover: #1e293b;
    --border: #334155;
    --txt: #f1f5f9;
    --txt-muted: #94a3b8;
    --chip-bg: #1e3a5f;
    --chip-txt: #93c5fd;
    --guest-bg: #78350f;
    --guest-txt: #fcd34d;
  }

  .add-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr 1.2fr;
    gap: 0.75rem;
    align-items: start;
  }

  .add-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .add-field label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--txt-muted);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .pair-sep {
    color: var(--txt-muted);
    font-weight: 500;
    padding-top: 1.6rem;
    font-size: 1.1rem;
  }

  .team-input-group {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .input-field {
    flex: 1;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 5px;
    font-size: 0.8rem;
    background: var(--bg-input);
    color: var(--txt);
  }
  .input-field:focus {
    outline: none;
    border-color: var(--primary);
  }
  .input-field::placeholder {
    color: var(--txt-muted);
  }

  .mini-loading {
    font-size: 0.75rem;
    position: absolute;
    right: 0.5rem;
  }

  .player-box {
    position: relative;
    min-height: 32px;
  }

  .player-search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .player-input {
    width: 100%;
    padding: 0.45rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 5px;
    font-size: 0.8rem;
    background: var(--bg-input);
    color: var(--txt);
  }
  .player-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  .player-input::placeholder {
    color: var(--txt-muted);
  }

  .player-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 5px;
    margin-top: 2px;
    z-index: 30;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .player-results button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: none;
    background: transparent;
    color: var(--txt);
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
  }
  .player-results button:hover {
    background: var(--bg-hover);
  }

  .player-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.35rem 0.5rem;
    background: var(--chip-bg);
    color: var(--chip-txt);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .player-chip.guest {
    background: var(--guest-bg);
    color: var(--guest-txt);
  }

  .chip-clear {
    width: 14px;
    height: 14px;
    padding: 0;
    border: none;
    background: rgba(0, 0, 0, 0.1);
    color: inherit;
    border-radius: 50%;
    cursor: pointer;
    font-size: 0.65rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .chip-clear:hover {
    background: rgba(0, 0, 0, 0.2);
  }

  .add-guest-btn {
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.3rem;
    background: transparent;
    border: 1px dashed var(--border);
    border-radius: 4px;
    color: var(--txt-muted);
    font-size: 0.7rem;
    cursor: pointer;
    text-align: center;
  }
  .add-guest-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .add-btn {
    padding: 0.45rem 0.75rem;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 5px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }
  .add-btn:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  .add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (max-width: 700px) {
    .add-row {
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
    }
    .pair-sep {
      display: none;
    }
    .team-field {
      grid-column: span 2;
    }
  }
</style>
