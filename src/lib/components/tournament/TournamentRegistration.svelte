<script lang="ts">
  import type { Tournament } from '$lib/types/tournament';
  import type { UserProfile } from '$lib/firebase/userProfile';
  import { currentUser } from '$lib/firebase/auth';
  import { registerForTournament, unregisterFromTournament, leaveWaitlist } from '$lib/firebase/tournamentRegistration';
  import * as Dialog from '$lib/components/ui/dialog';
  import LoginModal from '$lib/components/LoginModal.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Clock from '@lucide/svelte/icons/clock';
  import Users from '@lucide/svelte/icons/users';
  import X from '@lucide/svelte/icons/x';

  interface Props {
    tournament: Tournament;
  }

  let { tournament }: Props = $props();

  let isRegistering = $state(false);
  let isUnregistering = $state(false);
  let isLeavingWaitlist = $state(false);
  let showConfirmUnregister = $state(false);
  let showConfirmLeaveWaitlist = $state(false);
  let showLoginModal = $state(false);
  let registrationResult = $state<'registered' | 'waitlisted' | null>(null);
  let errorMessage = $state('');

  // Doubles partner panel
  let showDoublesPanel = $state(false);
  type PartnerMode = 'search' | 'guest' | 'none';
  let partnerMode = $state<PartnerMode>('none');
  let partnerSearchQuery = $state('');
  let partnerSearchResults = $state<UserProfile[]>([]);
  let partnerSearching = $state(false);
  let selectedPartner = $state<UserProfile | null>(null);
  let partnerGuestName = $state('');
  let teamName = $state('');

  // Legacy - kept for singles
  let partnerName = $state('');
  let showPartnerField = $state(false);

  let reg = $derived(tournament.registration!);
  let participantCount = $derived(tournament.participants.length);
  let waitlistCount = $derived(tournament.waitlist?.length ?? 0);
  let isFull = $derived(reg.maxParticipants ? participantCount >= reg.maxParticipants : false);
  let isDeadlinePassed = $derived(reg.deadline ? Date.now() > reg.deadline : false);
  let registrationOpen = $derived(reg.enabled && !isDeadlinePassed);

  let isUserRegistered = $derived(
    $currentUser ? tournament.participants.some(p => p.userId === $currentUser!.id) : false
  );
  let isUserOnWaitlist = $derived(
    $currentUser ? (tournament.waitlist ?? []).some(w => w.userId === $currentUser!.id) : false
  );
  let waitlistPosition = $derived(
    $currentUser ? (tournament.waitlist ?? []).findIndex(w => w.userId === $currentUser!.id) + 1 : 0
  );
  let userParticipant = $derived(
    $currentUser ? tournament.participants.find(p => p.userId === $currentUser!.id) : undefined
  );

  let isDoubles = $derived(tournament.gameType === 'doubles');

  let capacityPct = $derived(
    reg.maxParticipants ? Math.min((participantCount / reg.maxParticipants) * 100, 100) : 0
  );

  let deadlineLabel = $derived(
    reg.deadline
      ? new Date(reg.deadline).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null
  );

  let searchTimeout: ReturnType<typeof setTimeout>;
  async function searchPartner(query: string) {
    partnerSearchResults = [];
    if (query.length < 2) return;
    partnerSearching = true;
    try {
      const { searchUsers } = await import('$lib/firebase/tournaments');
      const results = await searchUsers(query);
      // Exclude self and already-registered users
      const excludeIds = new Set([
        $currentUser?.id,
        ...tournament.participants.map(p => p.userId).filter(Boolean)
      ]);
      partnerSearchResults = results.filter(u => !excludeIds.has(u.userId));
    } catch { partnerSearchResults = []; }
    partnerSearching = false;
  }

  function onPartnerSearchInput(query: string) {
    partnerSearchQuery = query;
    selectedPartner = null;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchPartner(query), 300);
  }

  function selectPartner(user: UserProfile) {
    selectedPartner = user;
    partnerSearchQuery = user.playerName;
    partnerSearchResults = [];
  }

  function resetDoublesPanel() {
    showDoublesPanel = false;
    partnerMode = 'none';
    partnerSearchQuery = '';
    partnerSearchResults = [];
    selectedPartner = null;
    partnerGuestName = '';
    teamName = '';
  }

  async function handleLeaveWaitlist() {
    isLeavingWaitlist = true;
    errorMessage = '';
    const result = await leaveWaitlist(tournament.id);
    isLeavingWaitlist = false;
    showConfirmLeaveWaitlist = false;
    if (result.success) {
      registrationResult = null;
    } else {
      errorMessage = result.error || 'Error al salir de la lista';
    }
  }

  async function handleUnregister() {
    isUnregistering = true;
    errorMessage = '';
    const result = await unregisterFromTournament(tournament.id);
    isUnregistering = false;
    showConfirmUnregister = false;
    if (result.success) {
      registrationResult = null;
    } else {
      errorMessage = result.error || 'Error al desapuntarte';
    }
  }

  async function handleRegister(fromDoubles = false) {
    if (!$currentUser) { showLoginModal = true; return; }
    isRegistering = true;
    errorMessage = '';

    let partner: { type: 'REGISTERED' | 'GUEST'; userId?: string; name: string } | undefined;
    if (isDoubles) {
      if (partnerMode === 'search' && selectedPartner) {
        partner = { type: 'REGISTERED', userId: selectedPartner.userId, name: selectedPartner.playerName };
      } else if (partnerMode === 'guest' && partnerGuestName.trim()) {
        partner = { type: 'GUEST', name: partnerGuestName.trim() };
      }
      // partnerMode === 'none' → partner undefined (admin assigns)
    } else if (showPartnerField && partnerName.trim()) {
      partner = { type: 'GUEST', name: partnerName.trim() };
    }

    const result = await registerForTournament(tournament.id, partner, isDoubles ? teamName.trim() || undefined : undefined);
    isRegistering = false;
    if (result.success) {
      registrationResult = result.status!;
      resetDoublesPanel();
      partnerName = '';
      showPartnerField = false;
    } else {
      errorMessage = result.error || 'Error al inscribirse';
    }
  }
</script>

<div class="reg-card"
  class:reg-card-enrolled={isUserRegistered || registrationResult === 'registered'}
  class:reg-card-waitlisted={!isUserRegistered && registrationResult !== 'registered' && (isUserOnWaitlist || registrationResult === 'waitlisted')}
>

  <!-- Enrolled state: full-width confirmation card -->
  {#if isUserRegistered || registrationResult === 'registered'}
    <div class="enrolled-state">
      <div class="enrolled-check">
        <CircleCheck size={22} />
      </div>
      <div class="enrolled-state-info">
        <span class="enrolled-state-label">{m.registration_registered()}</span>
        <span class="enrolled-state-name">{userParticipant?.name ?? $currentUser?.name ?? ''}</span>
      </div>
      <button class="enrolled-state-remove" onclick={() => showConfirmUnregister = true} title={m.registration_unregister()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      </button>
    </div>
  {:else if isUserOnWaitlist || registrationResult === 'waitlisted'}

  <!-- Waitlisted state -->
  <div class="waitlisted-state">
    <div class="waitlisted-icon">
      <Clock size={20} />
    </div>
    <div class="enrolled-state-info">
      <span class="waitlisted-label">
        {#if waitlistPosition > 0}
          {m["registration_waitlistPosition"]({ position: String(waitlistPosition) })}
        {:else}
          {m.registration_onWaitlist()}
        {/if}
      </span>
      <span class="enrolled-state-name">{$currentUser?.name ?? ''}</span>
    </div>
    <button class="enrolled-state-remove" onclick={() => showConfirmLeaveWaitlist = true} title={m.registration_leaveWaitlist()}>
      <X size={15} />
    </button>
  </div>

  {:else}

  <!-- Top row: meta chips + CTA -->
  <div class="reg-top">

    <div class="reg-meta">
      <!-- Spots chip -->
      <div class="meta-chip" class:chip-full={isFull}>
        <Users size={13} />
        {#if reg.maxParticipants}
          <span>{participantCount}/{reg.maxParticipants}</span>
        {:else}
          <span>{participantCount} {m.registration_participants()}</span>
        {/if}
      </div>

      {#if !isFull}
        <!-- Deadline chip -->
        {#if reg.deadline}
          <div class="meta-chip" class:chip-urgent={isDeadlinePassed}>
            <Clock size={13} />
            <span>{deadlineLabel}</span>
          </div>
        {/if}

        <!-- Entry fee chip -->
        {#if reg.entryFee}
          <div class="meta-chip">
            <span>{reg.entryFee}</span>
          </div>
        {/if}
      {/if}
    </div>

    <!-- CTA -->
    <div class="reg-cta">
      {#if !registrationOpen}
        <span class="cta-badge closed">{m.registration_closed()}</span>
      {:else if isFull && !$currentUser}
        <button class="cta-btn waitlist" onclick={() => showLoginModal = true}>
          <UserPlus size={15} />
          {m.registration_joinWaitlist()}
        </button>
      {:else if isFull}
        <button class="cta-btn waitlist" onclick={handleRegister} disabled={isRegistering}>
          {#if isRegistering}<LoaderCircle size={15} class="spin" />{:else}<UserPlus size={15} />{/if}
          {m.registration_joinWaitlist()}
        </button>
      {:else if !$currentUser}
        <button class="cta-btn primary" onclick={() => showLoginModal = true}>
          <UserPlus size={15} />
          {m.registration_loginToRegister()}
        </button>
      {:else if isDoubles}
        <button class="cta-btn primary" onclick={() => showDoublesPanel = true}>
          <UserPlus size={15} />
          {m.registration_register()}
        </button>
      {:else}
        <button class="cta-btn primary" onclick={handleRegister} disabled={isRegistering}>
          {#if isRegistering}
            <LoaderCircle size={15} class="spin" />
          {:else}
            <UserPlus size={15} />
          {/if}
          {m.registration_register()}
        </button>
      {/if}

      {#if errorMessage}
        <p class="error-msg">{errorMessage}</p>
      {/if}
    </div>
  </div>

  <!-- Capacity bar -->
  {#if reg.maxParticipants}
    <div class="cap-bar">
      <div class="cap-fill" class:full={isFull} style="width: {capacityPct}%"></div>
    </div>
    {#if isFull && waitlistCount > 0}
      <p class="cap-label">
        <span class="cap-waitlist">+{waitlistCount} {m.registration_waitlist()}</span>
      </p>
    {:else if !isFull}
      <p class="cap-label">
        {participantCount}/{reg.maxParticipants}
        · <span class="cap-spots">{m["registration_spotsLeft"]({ count: reg.maxParticipants - participantCount })}</span>
      </p>
    {/if}
  {/if}

  <!-- Rules -->
  {#if reg.rulesText || reg.rulesUrl}
    <div class="rules-row">
      {#if reg.rulesText}
        <p class="rules-text">{reg.rulesText}</p>
      {/if}
      {#if reg.rulesUrl}
        <a href={reg.rulesUrl} target="_blank" rel="noopener noreferrer" class="rules-link">
          {m.registration_rules()} →
        </a>
      {/if}
    </div>
  {/if}

  {/if}<!-- end non-enrolled -->
</div>

<!-- Doubles registration panel -->
{#if showDoublesPanel}
  <div class="doubles-panel">

    <!-- Two slots row -->
    <div class="dp-slots">

      <!-- Your slot (fixed) -->
      <div class="dp-slot dp-slot-you">
        <span class="dp-slot-label">Tú</span>
        <div class="dp-slot-avatar">{($currentUser?.name ?? '?').charAt(0).toUpperCase()}</div>
        <span class="dp-slot-name">{$currentUser?.name ?? ''}</span>
      </div>

      <div class="dp-plus">+</div>

      <!-- Partner slot (interactive) -->
      <div class="dp-slot dp-slot-partner">
        <span class="dp-slot-label">Pareja</span>

        {#if partnerMode === 'search' && selectedPartner}
          <!-- Selected partner display -->
          <div class="dp-slot-selected">
            {#if selectedPartner.photoURL}
              <img src={selectedPartner.photoURL} alt="" class="dp-slot-avatar-img" referrerpolicy="no-referrer" />
            {:else}
              <div class="dp-slot-avatar partner">{selectedPartner.playerName.charAt(0).toUpperCase()}</div>
            {/if}
            <button class="dp-slot-clear" onclick={() => { selectedPartner = null; partnerSearchQuery = ''; }} title="Cambiar">
              <X size={12} />
            </button>
          </div>
          <span class="dp-slot-name">{selectedPartner.playerName}</span>
        {:else if partnerMode === 'guest' && partnerGuestName.trim()}
          <div class="dp-slot-avatar partner guest">{partnerGuestName.charAt(0).toUpperCase()}</div>
          <span class="dp-slot-name">{partnerGuestName}</span>
        {:else if partnerMode === 'none'}
          <div class="dp-slot-avatar empty">?</div>
          <span class="dp-slot-name muted">Admin asigna</span>
        {:else}
          <div class="dp-slot-avatar empty">?</div>
          <span class="dp-slot-name muted">Sin seleccionar</span>
        {/if}
      </div>
    </div>

    <!-- Partner input area -->
    <div class="dp-input-area">
      <div class="dp-modes">
        <button class="dp-mode-btn" class:active={partnerMode === 'search'}
          onclick={() => { partnerMode = 'search'; partnerGuestName = ''; }}>
          Registrado
        </button>
        <button class="dp-mode-btn" class:active={partnerMode === 'guest'}
          onclick={() => { partnerMode = 'guest'; selectedPartner = null; partnerSearchQuery = ''; }}>
          Invitado
        </button>
        <button class="dp-mode-btn" class:active={partnerMode === 'none'}
          onclick={() => { partnerMode = 'none'; selectedPartner = null; partnerSearchQuery = ''; partnerGuestName = ''; }}>
          Sin pareja
        </button>
      </div>

      {#if partnerMode === 'search'}
        <div class="dp-search-wrap">
          <input class="dp-search-input" type="text" placeholder="Buscar por nombre..."
            value={partnerSearchQuery}
            oninput={(e) => onPartnerSearchInput((e.target as HTMLInputElement).value)} />
        </div>
        {#if partnerSearching}
          <p class="dp-search-status"><LoaderCircle size={13} class="spin" /> Buscando...</p>
        {:else if partnerSearchResults.length > 0}
          <ul class="dp-results">
            {#each partnerSearchResults as user (user.userId)}
              <li>
                <button class="dp-result-item" onclick={() => selectPartner(user)}>
                  {#if user.photoURL}
                    <img src={user.photoURL} alt="" class="dp-result-avatar" referrerpolicy="no-referrer" />
                  {:else}
                    <div class="dp-result-avatar placeholder">{user.playerName.charAt(0).toUpperCase()}</div>
                  {/if}
                  <span>{user.playerName}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else if partnerSearchQuery.length >= 2}
          <p class="dp-search-status">Sin resultados</p>
        {/if}
      {:else if partnerMode === 'guest'}
        <input class="dp-search-input" type="text" placeholder="Nombre del invitado..."
          bind:value={partnerGuestName} />
      {:else}
        <p class="dp-none-hint">El administrador te asignará pareja más adelante</p>
      {/if}
    </div>

    <!-- Team name -->
    <div class="dp-teamname-section">
      <label class="dp-label" for="dp-teamname">
        Nombre de equipo <span class="dp-optional">(opcional)</span>
      </label>
      <input id="dp-teamname" class="dp-search-input" type="text"
        placeholder="Ej: Los Invencibles" bind:value={teamName} maxlength={40} />
    </div>

    {#if errorMessage}<p class="dp-error">{errorMessage}</p>{/if}

    <div class="dp-actions">
      <button class="cta-btn outline" onclick={resetDoublesPanel}>{m.common_cancel()}</button>
      <button class="cta-btn primary" onclick={() => handleRegister()}
        disabled={isRegistering || (partnerMode === 'search' && !selectedPartner) || (partnerMode === 'guest' && !partnerGuestName.trim())}>
        {#if isRegistering}<LoaderCircle size={15} class="spin" />{:else}<UserPlus size={15} />{/if}
        {m.registration_confirmRegistration()}
      </button>
    </div>
  </div>
{/if}

{#if reg.showParticipantList && participantCount > 0}
  <div class="enrolled-section">
    <div class="enrolled-header">
      <span class="enrolled-title">{m.registration_participants()}</span>
      <span class="enrolled-count">{participantCount}{reg.maxParticipants ? `/${reg.maxParticipants}` : ''}</span>
    </div>
    <ul class="enrolled-grid">
      {#each tournament.participants as p (p.id)}
        <li class="enrolled-item">
          {#if p.photoURL}
            <img src={p.photoURL} alt="" class="enrolled-avatar" referrerpolicy="no-referrer" />
          {:else}
            <div class="enrolled-avatar placeholder">{p.name.charAt(0).toUpperCase()}</div>
          {/if}
          <div class="enrolled-info">
            <span class="enrolled-name">{p.name}</span>
            {#if p.partner}<span class="enrolled-partner">& {p.partner.name}</span>{/if}
          </div>
        </li>
      {/each}
    </ul>

    {#if waitlistCount > 0}
      <div class="waitlist-section">
        <div class="waitlist-header">
          <span class="waitlist-label">{m.registration_waitlist()}</span>
          <span class="waitlist-count">{waitlistCount}</span>
        </div>
        <ul class="enrolled-grid">
          {#each tournament.waitlist ?? [] as w (w.userId)}
            <li class="enrolled-item waitlisted">
              <div class="enrolled-avatar placeholder muted">{w.userName.charAt(0).toUpperCase()}</div>
              <div class="enrolled-info">
                <span class="enrolled-name muted">{w.userName}</span>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<Dialog.Root open={showConfirmUnregister} onOpenChange={(open) => { if (!open) showConfirmUnregister = false; }}>
  <Dialog.Content class="unregister-dialog" showCloseButton={false}>
    <Dialog.Header>
      <Dialog.Title>{m.registration_confirmUnregister()}</Dialog.Title>
    </Dialog.Header>
    {#if errorMessage}
      <p class="unregister-error">{errorMessage}</p>
    {/if}
    <div class="unregister-actions">
      <button class="btn-danger" onclick={handleUnregister} disabled={isUnregistering}>
        {#if isUnregistering}<LoaderCircle size={15} />{/if}
        {m.registration_unregister()}
      </button>
      <button class="btn-cancel" onclick={() => showConfirmUnregister = false} disabled={isUnregistering}>
        {m.common_cancel()}
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root open={showConfirmLeaveWaitlist} onOpenChange={(open) => { if (!open) showConfirmLeaveWaitlist = false; }}>
  <Dialog.Content class="unregister-dialog" showCloseButton={false}>
    <Dialog.Header>
      <Dialog.Title>{m.registration_confirmLeaveWaitlist()}</Dialog.Title>
    </Dialog.Header>
    {#if errorMessage}
      <p class="unregister-error">{errorMessage}</p>
    {/if}
    <div class="unregister-actions">
      <button class="btn-danger" onclick={handleLeaveWaitlist} disabled={isLeavingWaitlist}>
        {#if isLeavingWaitlist}<LoaderCircle size={15} />{/if}
        {m.registration_leaveWaitlist()}
      </button>
      <button class="btn-cancel" onclick={() => showConfirmLeaveWaitlist = false} disabled={isLeavingWaitlist}>
        {m.common_cancel()}
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>

{#if showLoginModal}
  <LoginModal bind:isOpen={showLoginModal} />
{/if}

<style>
  .reg-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.9rem 1rem;
    background: color-mix(in srgb, var(--primary) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
    border-radius: 10px;
    margin-bottom: 1.25rem;
  }

  /* Top row */
  .reg-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  /* Meta chips */
  .reg-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.55rem;
    border-radius: 20px;
    font-size: 0.78rem;
    font-weight: 500;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--foreground);
    border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
    white-space: nowrap;
  }

  .meta-chip.chip-full {
    background: color-mix(in srgb, var(--destructive, #ef4444) 12%, transparent);
    border-color: color-mix(in srgb, var(--destructive, #ef4444) 25%, transparent);
    color: var(--destructive, #ef4444);
  }

  .meta-chip.chip-urgent {
    background: color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent);
    border-color: color-mix(in srgb, var(--warning, #f59e0b) 25%, transparent);
    color: var(--warning, #f59e0b);
  }

  /* CTA area */
  .reg-cta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 1rem;
    border-radius: 7px;
    font-weight: 600;
    font-size: 0.85rem;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s ease, background 0.15s ease;
    white-space: nowrap;
  }

  .cta-btn:disabled { opacity: 0.55; cursor: not-allowed; }

  .cta-btn.primary {
    background: var(--primary);
    color: var(--primary-foreground);
  }
  .cta-btn.primary:hover:not(:disabled) { opacity: 0.88; }

  .cta-btn.outline {
    background: transparent;
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
  }

  .cta-btn.waitlist {
    background: color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent);
    color: var(--warning, #f59e0b);
    border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 30%, transparent);
  }

  .cta-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.75rem;
    border-radius: 7px;
    font-size: 0.82rem;
    font-weight: 600;
    white-space: nowrap;
  }



  /* Waitlisted card state */
  .reg-card-waitlisted {
    background: color-mix(in srgb, var(--warning, #f59e0b) 6%, transparent);
    border-color: color-mix(in srgb, var(--warning, #f59e0b) 25%, transparent);
  }

  .waitlisted-state {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.15rem 0;
  }

  .waitlisted-icon {
    color: var(--warning, #f59e0b);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .waitlisted-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--warning, #f59e0b);
  }

  /* Enrolled confirmation state */
  .reg-card-enrolled {
    background: color-mix(in srgb, #22c55e 7%, transparent);
    border-color: color-mix(in srgb, #22c55e 28%, transparent);
  }

  .enrolled-state {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.15rem 0;
  }

  .enrolled-check {
    color: #22c55e;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .enrolled-state-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .enrolled-state-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #22c55e;
  }

  .enrolled-state-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .enrolled-state-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted-foreground);
    padding: 0.3rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .enrolled-state-remove:hover {
    color: var(--destructive, #ef4444);
    background: color-mix(in srgb, var(--destructive, #ef4444) 10%, transparent);
  }

  :global(.unregister-dialog) {
    max-width: 340px;
  }

  :global(.unregister-dialog .unregister-actions) {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  :global(.unregister-dialog .unregister-error) {
    font-size: 0.82rem;
    color: var(--destructive, #ef4444);
    margin: 0.25rem 0 0;
  }

  :global(.unregister-dialog .unregister-actions button) {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.5rem 1.1rem;
    border-radius: 7px;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
    white-space: nowrap;
    border: none;
  }

  :global(.unregister-dialog .unregister-actions button:disabled) {
    opacity: 0.55;
    cursor: not-allowed;
  }

  :global(.unregister-dialog .unregister-actions .btn-danger) {
    background: var(--destructive, #ef4444);
    color: #fff;
  }

  :global(.unregister-dialog .unregister-actions .btn-danger:hover:not(:disabled)) {
    opacity: 0.88;
  }

  :global(.unregister-dialog .unregister-actions .btn-cancel) {
    background: color-mix(in srgb, var(--muted-foreground) 10%, transparent);
    color: var(--foreground);
    border: 1px solid var(--border) !important;
  }

  :global(.unregister-dialog .unregister-actions .btn-cancel:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--muted-foreground) 15%, transparent);
  }


  .cta-badge.closed {
    background: color-mix(in srgb, var(--muted-foreground) 10%, transparent);
    color: var(--muted-foreground);
  }

  /* Doubles panel */
  .doubles-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--card, var(--background));
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-bottom: 1rem;
  }

  /* Doubles panel: side-by-side slots */
  .dp-slots {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.5rem;
  }

  .dp-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.75rem 0.5rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    min-width: 0;
    overflow: hidden;
  }

  .dp-slot-you {
    border-color: color-mix(in srgb, var(--primary) 25%, transparent);
    background: color-mix(in srgb, var(--primary) 5%, transparent);
  }

  .dp-slot-partner {
    background: color-mix(in srgb, var(--muted-foreground) 4%, transparent);
  }

  .dp-slot-label {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted-foreground);
  }

  .dp-slot-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    font-weight: 700;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
  }

  .dp-slot-avatar.partner {
    background: color-mix(in srgb, #22c55e 15%, transparent);
    color: #22c55e;
  }

  .dp-slot-avatar.guest {
    background: color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent);
    color: var(--warning, #f59e0b);
  }

  .dp-slot-avatar.empty {
    background: color-mix(in srgb, var(--muted-foreground) 8%, transparent);
    color: var(--muted-foreground);
    border: 1.5px dashed color-mix(in srgb, var(--muted-foreground) 30%, transparent);
  }

  .dp-slot-avatar-img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
  }

  .dp-slot-selected {
    position: relative;
    display: inline-flex;
  }

  .dp-slot-clear {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--destructive, #ef4444);
    color: #fff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .dp-slot-name {
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    color: var(--foreground);
  }

  .dp-slot-name.muted {
    color: var(--muted-foreground);
    font-weight: 400;
    font-size: 0.72rem;
  }

  .dp-plus {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .dp-input-area {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .dp-label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
  }

  .dp-modes {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .dp-mode-btn {
    padding: 0.25rem 0.65rem;
    border-radius: 20px;
    font-size: 0.78rem;
    font-weight: 500;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .dp-mode-btn.active {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
    color: var(--primary);
    font-weight: 600;
  }

  .dp-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .dp-search-input {
    width: 100%;
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.85rem;
  }

  .dp-search-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .dp-search-status {
    font-size: 0.78rem;
    color: var(--muted-foreground);
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin: 0;
  }

  .dp-results {
    list-style: none;
    padding: 0;
    margin: 0;
    border: 1px solid var(--border);
    border-radius: 7px;
    overflow: hidden;
    max-height: 180px;
    overflow-y: auto;
  }

  .dp-result-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.65rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--foreground);
    text-align: left;
    transition: background 0.12s;
  }

  .dp-result-item:hover {
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }

  .dp-result-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .dp-result-avatar.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
    font-size: 0.7rem;
    font-weight: 700;
  }

  .dp-none-hint {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    margin: 0;
    font-style: italic;
  }

  .dp-error {
    font-size: 0.8rem;
    color: var(--destructive, #ef4444);
    margin: 0;
  }

  .dp-teamname-section {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.5rem;
    border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }

  .dp-optional {
    font-weight: 400;
    font-size: 0.65rem;
    text-transform: none;
    letter-spacing: 0;
    color: var(--muted-foreground);
  }

  .dp-actions {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
    padding-top: 0.25rem;
    border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }

  .error-msg {
    color: var(--destructive, #ef4444);
    font-size: 0.8rem;
    margin: 0;
  }

  /* Capacity bar */
  .cap-bar {
    height: 4px;
    background: color-mix(in srgb, var(--border) 60%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }

  .cap-fill {
    height: 100%;
    background: #22c55e;
    border-radius: 2px;
    transition: width 0.4s ease, background 0.3s ease;
  }

  .cap-fill.full {
    background: var(--destructive, #ef4444);
  }

  /* Rules */
  .rules-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .rules-text {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    margin: 0;
    white-space: pre-wrap;
  }

  .rules-link {
    font-size: 0.8rem;
    color: var(--primary);
    text-decoration: underline;
    white-space: nowrap;
  }

  /* Enrolled section */
  .enrolled-section {
    margin-top: 0.25rem;
  }

  .enrolled-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
  }

  .enrolled-title {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
  }

  .enrolled-count {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted-foreground);
  }

  .enrolled-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }

  .enrolled-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    background: var(--card, var(--background));
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .enrolled-item.waitlisted {
    opacity: 0.65;
  }

  .enrolled-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .enrolled-avatar.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 18%, transparent);
    color: var(--primary);
    font-size: 0.75rem;
    font-weight: 700;
  }

  .enrolled-avatar.placeholder.muted {
    background: color-mix(in srgb, var(--muted-foreground) 12%, transparent);
    color: var(--muted-foreground);
  }

  .enrolled-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .enrolled-name {
    font-size: 0.83rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .enrolled-name.muted { color: var(--muted-foreground); }

  .enrolled-partner {
    font-size: 0.73rem;
    color: var(--muted-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Waitlist sub-section */
  .waitlist-section {
    margin-top: 0.9rem;
  }

  .waitlist-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .waitlist-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--warning, #f59e0b);
  }

  .waitlist-count {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    border-radius: 10px;
    background: color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent);
    color: var(--warning, #f59e0b);
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
