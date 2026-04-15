<script lang="ts">
  import type { Tournament } from '$lib/types/tournament';
  import type { UserProfile } from '$lib/firebase/userProfile';
  import { currentUser } from '$lib/firebase/auth';
  import { registerForTournament, unregisterFromTournament, leaveWaitlist, filterEligiblePartners } from '$lib/firebase/tournamentRegistration';
  import * as Dialog from '$lib/components/ui/dialog';
  import LoginModal from '$lib/components/LoginModal.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Clock from '@lucide/svelte/icons/clock';
  import Users from '@lucide/svelte/icons/users';
  import X from '@lucide/svelte/icons/x';
  import Search from '@lucide/svelte/icons/search';
  import UserCheck from '@lucide/svelte/icons/user-check';

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
  let partnerMode = $state<PartnerMode>('search');
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
  let waitlistAllowed = $derived(reg.allowWaitlist !== false);
  let isDeadlinePassed = $derived(reg.deadline ? Date.now() > reg.deadline : false);
  let registrationOpen = $derived(reg.enabled && !isDeadlinePassed);

  let isUserRegistered = $derived(
    $currentUser
      ? tournament.participants.some(
          p => p.userId === $currentUser!.id || p.partner?.userId === $currentUser!.id
        )
      : false
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

  // Bug #14: derive effective result so stale "registered/waitlisted" is hidden when
  // the user has been externally removed (e.g., admin unregisters them from the wizard).
  let effectiveRegistrationResult = $derived<'registered' | 'waitlisted' | null>(
    registrationResult === 'registered' && !isUserRegistered ? null :
    registrationResult === 'waitlisted' && !isUserOnWaitlist ? null :
    registrationResult
  );

  let searchTimeout: ReturnType<typeof setTimeout>;
  async function searchPartner(query: string) {
    partnerSearchResults = [];
    if (query.length < 2) return;
    partnerSearching = true;
    try {
      const { searchUsers } = await import('$lib/firebase/tournaments');
      const results = await searchUsers(query);
      // Exclude self, primary participants, already-assigned partners, and waitlist entries
      partnerSearchResults = filterEligiblePartners(
        results as Array<{ userId: string; playerName: string } & typeof results[number]>,
        tournament.participants,
        tournament.waitlist ?? [],
        $currentUser?.id ?? ''
      );
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
  class:state-enrolled={isUserRegistered || effectiveRegistrationResult === 'registered'}
  class:state-waitlisted={!isUserRegistered && effectiveRegistrationResult !== 'registered' && (isUserOnWaitlist || effectiveRegistrationResult === 'waitlisted')}
  class:state-open={!isUserRegistered && !(isUserOnWaitlist || effectiveRegistrationResult === 'waitlisted') && registrationOpen && !isFull}
  class:state-full={!isUserRegistered && !(isUserOnWaitlist || effectiveRegistrationResult === 'waitlisted') && registrationOpen && isFull && waitlistAllowed}
  class:state-closed={!isUserRegistered && !(isUserOnWaitlist || effectiveRegistrationResult === 'waitlisted') && (!registrationOpen || (isFull && !waitlistAllowed))}
>

  <!-- ── ENROLLED ─────────────────────────────────────────────── -->
  {#if isUserRegistered || effectiveRegistrationResult === 'registered'}

    <div class="state-bar bar-enrolled">
      <CircleCheck size={14} />
      <span>{m.registration_registered()}</span>
    </div>

    <div class="enrolled-body">
      <div class="enrolled-avatar-wrap">
        <div class="enrolled-avatar-circle">
          {(userParticipant?.name ?? $currentUser?.name ?? '?').charAt(0).toUpperCase()}
        </div>
      </div>
      <div class="enrolled-name-block">
        <span class="enrolled-name">{userParticipant?.name ?? $currentUser?.name ?? ''}</span>
        {#if userParticipant?.partner}
          <span class="enrolled-partner">& {userParticipant.partner.name}</span>
        {/if}
      </div>
      <button class="unregister-btn" onclick={() => showConfirmUnregister = true} title={m.registration_unregister()}>
        <X size={14} />
      </button>
    </div>

  <!-- ── WAITLISTED ──────────────────────────────────────────── -->
  {:else if isUserOnWaitlist || effectiveRegistrationResult === 'waitlisted'}

    <div class="state-bar bar-waitlisted">
      <Clock size={14} />
      <span>
        {#if waitlistPosition > 0}
          {m["registration_waitlistPosition"]({ position: String(waitlistPosition) })}
        {:else}
          {m.registration_onWaitlist()}
        {/if}
      </span>
    </div>

    <div class="enrolled-body">
      <div class="enrolled-avatar-wrap">
        <div class="enrolled-avatar-circle waitlist-avatar">
          {($currentUser?.name ?? '?').charAt(0).toUpperCase()}
        </div>
      </div>
      <div class="enrolled-name-block">
        <span class="enrolled-name">{$currentUser?.name ?? ''}</span>
        <span class="enrolled-sub">{m.registration_onWaitlist()}</span>
      </div>
      <button class="unregister-btn" onclick={() => showConfirmLeaveWaitlist = true} title={m.registration_leaveWaitlist()}>
        <X size={14} />
      </button>
    </div>

  <!-- ── DEFAULT: open / full / closed ──────────────────────── -->
  {:else}

    <!-- Status eyebrow -->
    <div class="state-bar"
      class:bar-open={registrationOpen && !isFull}
      class:bar-waitlist-avail={registrationOpen && isFull && waitlistAllowed}
      class:bar-closed={!registrationOpen || (isFull && !waitlistAllowed)}
    >
      {#if registrationOpen && !isFull}
        <span class="pulse-dot"></span>
        <span>{m.registration_statusOpen()}</span>
      {:else if registrationOpen && isFull && waitlistAllowed}
        <Clock size={13} />
        <span>{m.registration_waitlist()}</span>
      {:else}
        <span>{m.registration_closed()}</span>
      {/if}
    </div>

    <!-- Stats row -->
    <div class="reg-stats">
      <div class="stat-block">
        <Users size={15} class="stat-icon" />
        <div class="stat-text">
          {#if reg.maxParticipants}
            <span class="stat-value">{participantCount}<span class="stat-max">/{reg.maxParticipants}</span></span>
            <span class="stat-label">{m.registration_participants()}</span>
          {:else}
            <span class="stat-value">{participantCount}</span>
            <span class="stat-label">{m.registration_participants()}</span>
          {/if}
        </div>
      </div>

      {#if reg.deadline}
        <div class="stat-divider"></div>
        <div class="stat-block" class:stat-urgent={isDeadlinePassed}>
          <Clock size={15} class="stat-icon" />
          <div class="stat-text">
            <span class="stat-value">{deadlineLabel}</span>
            <span class="stat-label">{m.registration_deadline?.() ?? 'Plazo'}</span>
          </div>
        </div>
      {/if}

      {#if reg.entryFee}
        <div class="stat-divider"></div>
        <div class="stat-block">
          <div class="stat-text">
            <span class="stat-value">{reg.entryFee}</span>
            <span class="stat-label">{m.registration_entryFee?.() ?? 'Cuota'}</span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Capacity bar -->
    {#if reg.maxParticipants}
      <div class="cap-track">
        <div class="cap-fill" class:cap-full={isFull} style="width: {capacityPct}%"></div>
      </div>
      <div class="cap-legend">
        {#if isFull && waitlistAllowed && waitlistCount > 0}
          <span class="cap-legend-waitlist">+{waitlistCount} {m.registration_waitlist()}</span>
        {:else if !isFull}
          <span class="cap-legend-spots">{m["registration_spotsLeft"]({ count: reg.maxParticipants - participantCount })}</span>
        {:else}
          <span class="cap-legend-full">{m.registration_full()}</span>
        {/if}
      </div>
    {/if}

    <!-- CTA button (hidden while doubles panel is open) -->
    {#if !showDoublesPanel}
    <div class="reg-cta-wrap">
      {#if !registrationOpen}
        <!-- closed: nothing to do -->
      {:else if isFull && !waitlistAllowed}
        <!-- full, no waitlist: nothing -->
      {:else if isFull && !$currentUser}
        <button class="cta-primary cta-waitlist" onclick={() => showLoginModal = true}>
          <UserPlus size={16} />
          {m.registration_joinWaitlist()}
        </button>
      {:else if isFull}
        <button class="cta-primary cta-waitlist" onclick={handleRegister} disabled={isRegistering}>
          {#if isRegistering}<LoaderCircle size={16} class="spin" />{:else}<UserPlus size={16} />{/if}
          {m.registration_joinWaitlist()}
        </button>
      {:else if !$currentUser}
        <button class="cta-primary" onclick={() => showLoginModal = true}>
          <UserPlus size={16} />
          {m.registration_loginToRegister()}
        </button>
      {:else if isDoubles}
        <button class="cta-primary" onclick={() => showDoublesPanel = true}>
          <UserPlus size={16} />
          {m.registration_register()}
        </button>
      {:else}
        <button class="cta-primary" onclick={handleRegister} disabled={isRegistering}>
          {#if isRegistering}<LoaderCircle size={16} class="spin" />{:else}<UserPlus size={16} />{/if}
          {m.registration_register()}
        </button>
      {/if}

      {#if errorMessage}
        <p class="error-msg">{errorMessage}</p>
      {/if}
    </div>
    {/if}<!-- end !showDoublesPanel -->

  {/if}<!-- end states -->
</div>

<!-- Doubles registration panel -->
{#if showDoublesPanel}
  <div class="doubles-panel">

    <!-- Compact team preview -->
    <div class="dp-team-preview">
      <div class="dp-team-slot">
        <div class="dp-ta dp-ta-you">{($currentUser?.name ?? '?').charAt(0).toUpperCase()}</div>
        <span class="dp-team-label">{$currentUser?.name ?? ''}</span>
        <span class="dp-team-role">{m.registration_partnerYou()}</span>
      </div>

      <div class="dp-team-plus">+</div>

      <div class="dp-team-slot">
        {#if partnerMode === 'search' && selectedPartner}
          <div class="dp-ta-wrap">
            {#if selectedPartner.photoURL}
              <img src={selectedPartner.photoURL} alt="" class="dp-ta dp-ta-img" referrerpolicy="no-referrer" />
            {:else}
              <div class="dp-ta dp-ta-partner">{selectedPartner.playerName.charAt(0).toUpperCase()}</div>
            {/if}
            <button class="dp-ta-clear" onclick={() => { selectedPartner = null; partnerSearchQuery = ''; }} title={m.registration_partnerChangeTitle()}>
              <X size={10} />
            </button>
          </div>
          <span class="dp-team-label">{selectedPartner.playerName}</span>
          <span class="dp-team-role">{m.registration_partnerModeRegistered()}</span>
        {:else if partnerMode === 'guest' && partnerGuestName.trim()}
          <div class="dp-ta dp-ta-guest">{partnerGuestName.charAt(0).toUpperCase()}</div>
          <span class="dp-team-label">{partnerGuestName}</span>
          <span class="dp-team-role">{m.registration_partnerModeGuest()}</span>
        {:else if partnerMode === 'none'}
          <div class="dp-ta dp-ta-empty">
            <Users size={16} />
          </div>
          <span class="dp-team-label dp-team-label-muted">{m.registration_partnerAdminAssigns()}</span>
          <span class="dp-team-role">{m.registration_partnerSlot()}</span>
        {:else}
          <div class="dp-ta dp-ta-empty">?</div>
          <span class="dp-team-label dp-team-label-muted">{m.registration_partnerNotSelected()}</span>
          <span class="dp-team-role">{m.registration_partnerSlot()}</span>
        {/if}
      </div>
    </div>

    <!-- Mode cards: 3 options -->
    <div class="dp-mode-cards">
      <button class="dp-mode-card"
        class:dp-mode-active={partnerMode === 'search'}
        onclick={() => { partnerMode = 'search'; partnerGuestName = ''; }}>
        <div class="dp-mode-icon"><UserCheck size={17} /></div>
        <span class="dp-mode-title">{m.registration_partnerModeRegistered()}</span>
        <span class="dp-mode-hint">{m.registration_partnerModeRegisteredHint()}</span>
      </button>
      <button class="dp-mode-card"
        class:dp-mode-active={partnerMode === 'guest'}
        onclick={() => { partnerMode = 'guest'; selectedPartner = null; partnerSearchQuery = ''; }}>
        <div class="dp-mode-icon"><UserPlus size={17} /></div>
        <span class="dp-mode-title">{m.registration_partnerModeGuest()}</span>
        <span class="dp-mode-hint">{m.registration_partnerModeGuestHint()}</span>
      </button>
      <button class="dp-mode-card"
        class:dp-mode-active={partnerMode === 'none'}
        onclick={() => { partnerMode = 'none'; selectedPartner = null; partnerSearchQuery = ''; partnerGuestName = ''; }}>
        <div class="dp-mode-icon"><Users size={17} /></div>
        <span class="dp-mode-title">{m.registration_partnerModeNone()}</span>
        <span class="dp-mode-hint">{m.registration_partnerModeNoneHint()}</span>
      </button>
    </div>

    <!-- Partner input + team name side by side -->
    <div class="dp-inputs-row">

      <!-- Left: partner input -->
      <div class="dp-input-block">
        {#if partnerMode === 'search'}
          <label class="dp-label" for="dp-partner-search">{m.registration_partnerSlot()}</label>
          <div class="dp-search-inner">
            <Search size={14} class="dp-search-icon" />
            <input id="dp-partner-search" class="dp-search-input" type="text"
              placeholder={m.registration_partnerSearchPlaceholder()}
              value={partnerSearchQuery}
              oninput={(e) => onPartnerSearchInput((e.target as HTMLInputElement).value)} />
          </div>
          {#if partnerSearching}
            <p class="dp-search-status"><LoaderCircle size={13} class="spin" /> {m.registration_partnerSearching()}</p>
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
            <p class="dp-search-status">{m.registration_partnerNoResults()}</p>
          {/if}
        {:else if partnerMode === 'guest'}
          <label class="dp-label" for="dp-partner-guest">{m.registration_partnerSlot()}</label>
          <input id="dp-partner-guest" class="dp-search-input" type="text"
            placeholder={m.registration_partnerGuestPlaceholder()}
            bind:value={partnerGuestName} />
        {:else}
          <p class="dp-none-hint">{m.registration_partnerAdminNote()}</p>
        {/if}
      </div>

      <!-- Right: team name -->
      <div class="dp-input-block">
        <label class="dp-label" for="dp-teamname">
          {m.registration_teamNameLabel()} <span class="dp-optional">{m.registration_teamNameOptional()}</span>
        </label>
        <input id="dp-teamname" class="dp-search-input" type="text"
          placeholder={m.registration_teamNamePlaceholder()} bind:value={teamName} maxlength={40} />
      </div>

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
  /* ── CARD BASE ──────────────────────────────────────────────── */
  .reg-card {
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    border: 1.5px solid var(--border);
    overflow: hidden;
    margin-bottom: 1.25rem;
    background: var(--card, var(--background));
    transition: border-color 0.2s;
  }

  /* ── STATUS BAR ─────────────────────────────────────────────── */
  .state-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 1rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  .bar-open {
    background: color-mix(in srgb, #22c55e 14%, transparent);
    color: #16a34a;
    border-bottom: 1px solid color-mix(in srgb, #22c55e 20%, transparent);
  }

  .bar-waitlist-avail {
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    color: #b45309;
    border-bottom: 1px solid color-mix(in srgb, #f59e0b 22%, transparent);
  }

  .bar-closed {
    background: color-mix(in srgb, var(--muted-foreground) 8%, transparent);
    color: var(--muted-foreground);
    border-bottom: 1px solid var(--border);
  }

  .bar-enrolled {
    background: color-mix(in srgb, #22c55e 14%, transparent);
    color: #16a34a;
    border-bottom: 1px solid color-mix(in srgb, #22c55e 20%, transparent);
  }

  .bar-waitlisted {
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    color: #b45309;
    border-bottom: 1px solid color-mix(in srgb, #f59e0b 22%, transparent);
  }

  /* Pulsing live dot */
  .pulse-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.75); }
  }

  /* ── CARD STATES: border accent ────────────────────────────── */
  .state-open    { border-color: color-mix(in srgb, #22c55e 35%, transparent); }
  .state-full    { border-color: color-mix(in srgb, #f59e0b 35%, transparent); }
  .state-closed  { border-color: var(--border); }
  .state-enrolled { border-color: color-mix(in srgb, #22c55e 40%, transparent); }
  .state-waitlisted { border-color: color-mix(in srgb, #f59e0b 40%, transparent); }

  /* ── ENROLLED BODY ──────────────────────────────────────────── */
  .enrolled-body {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
  }

  .enrolled-avatar-wrap { flex-shrink: 0; }

  .enrolled-avatar-circle {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    font-weight: 700;
    background: color-mix(in srgb, #22c55e 18%, transparent);
    color: #16a34a;
  }

  .enrolled-avatar-circle.waitlist-avatar {
    background: color-mix(in srgb, #f59e0b 18%, transparent);
    color: #b45309;
  }

  .enrolled-name-block {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .enrolled-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .enrolled-partner {
    font-size: 0.78rem;
    color: var(--muted-foreground);
  }

  .enrolled-sub {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .unregister-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted-foreground);
    padding: 0.4rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    transition: color 0.15s, background 0.15s;
  }

  .unregister-btn:hover {
    color: var(--destructive, #ef4444);
    background: color-mix(in srgb, var(--destructive, #ef4444) 10%, transparent);
  }

  /* ── STATS ROW ──────────────────────────────────────────────── */
  .reg-stats {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0.85rem 1rem 0.65rem;
  }

  .stat-block {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex: 1;
  }

  .stat-block.stat-urgent .stat-value {
    color: #b45309;
  }

  :global(.stat-icon) {
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .stat-text {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .stat-value {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--foreground);
    line-height: 1;
  }

  .stat-max {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--muted-foreground);
  }

  .stat-label {
    font-size: 0.68rem;
    font-weight: 500;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    line-height: 1;
  }

  .stat-divider {
    width: 1px;
    height: 32px;
    background: var(--border);
    flex-shrink: 0;
    margin: 0 0.75rem;
  }

  /* ── CAPACITY BAR ───────────────────────────────────────────── */
  .cap-track {
    height: 5px;
    background: color-mix(in srgb, var(--border) 70%, transparent);
    margin: 0 1rem;
    border-radius: 3px;
    overflow: hidden;
  }

  .cap-fill {
    height: 100%;
    background: linear-gradient(90deg, #22c55e, #16a34a);
    border-radius: 3px;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .cap-fill.cap-full {
    background: linear-gradient(90deg, #f87171, #ef4444);
  }

  .cap-legend {
    padding: 0.3rem 1rem 0;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .cap-legend-spots { color: #16a34a; }
  .cap-legend-full  { color: var(--destructive, #ef4444); }
  .cap-legend-waitlist { color: #b45309; }

  /* ── CTA ────────────────────────────────────────────────────── */
  .reg-cta-wrap {
    padding: 0.75rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .cta-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.7rem 1.25rem;
    border-radius: 9px;
    font-weight: 700;
    font-size: 0.92rem;
    border: none;
    cursor: pointer;
    background: var(--primary);
    color: var(--primary-foreground);
    transition: opacity 0.15s, transform 0.1s;
    letter-spacing: 0.01em;
  }

  .cta-primary:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .cta-primary:active:not(:disabled) { transform: translateY(0); }
  .cta-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .cta-primary.cta-waitlist {
    background: color-mix(in srgb, #f59e0b 18%, transparent);
    color: #b45309;
    border: 1.5px solid color-mix(in srgb, #f59e0b 35%, transparent);
  }

  /* Shared outline button (used in doubles panel actions) */
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

  .cta-btn.outline {
    background: transparent;
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
  }

  .error-msg {
    color: var(--destructive, #ef4444);
    font-size: 0.8rem;
    margin: 0;
    text-align: center;
  }

  /* ── DIALOG ─────────────────────────────────────────────────── */
  :global(.unregister-dialog) { max-width: 340px; }

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

  :global(.unregister-dialog .unregister-actions button:disabled) { opacity: 0.55; cursor: not-allowed; }

  :global(.unregister-dialog .unregister-actions .btn-danger) {
    background: var(--destructive, #ef4444);
    color: #fff;
  }

  :global(.unregister-dialog .unregister-actions .btn-danger:hover:not(:disabled)) { opacity: 0.88; }

  :global(.unregister-dialog .unregister-actions .btn-cancel) {
    background: color-mix(in srgb, var(--muted-foreground) 10%, transparent);
    color: var(--foreground);
    border: 1px solid var(--border) !important;
  }

  :global(.unregister-dialog .unregister-actions .btn-cancel:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--muted-foreground) 15%, transparent);
  }

  /* ── DOUBLES PANEL ──────────────────────────────────────────── */
  .doubles-panel {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 1rem;
    background: var(--card, var(--background));
    border: 1.5px solid var(--border);
    border-radius: 14px;
    margin-bottom: 1rem;
  }

  /* Team preview row */
  .dp-team-preview {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem 0.85rem;
    background: color-mix(in srgb, var(--primary) 4%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 14%, transparent);
    border-radius: 10px;
  }

  .dp-team-slot {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
  }

  .dp-team-plus {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--muted-foreground);
    flex-shrink: 0;
    opacity: 0.5;
  }

  /* Team avatars */
  .dp-ta {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .dp-ta-you {
    background: color-mix(in srgb, var(--primary) 18%, transparent);
    color: var(--primary);
  }

  .dp-ta-partner {
    background: color-mix(in srgb, #22c55e 18%, transparent);
    color: #16a34a;
  }

  .dp-ta-guest {
    background: color-mix(in srgb, #f59e0b 18%, transparent);
    color: #b45309;
  }

  .dp-ta-img {
    object-fit: cover;
  }

  .dp-ta-empty {
    background: color-mix(in srgb, var(--muted-foreground) 8%, transparent);
    color: var(--muted-foreground);
    border: 1.5px dashed color-mix(in srgb, var(--muted-foreground) 25%, transparent);
  }

  .dp-ta-wrap {
    position: relative;
    display: inline-flex;
  }

  .dp-ta-clear {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 15px;
    height: 15px;
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

  .dp-team-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
  }

  .dp-team-label-muted {
    color: var(--muted-foreground);
    font-weight: 400;
    font-size: 0.75rem;
  }

  .dp-team-role {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
    opacity: 0.7;
  }

  /* Mode cards: 3 equal option tiles */
  .dp-mode-cards {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
  }

  .dp-mode-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.65rem 0.4rem 0.6rem;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    text-align: center;
  }

  .dp-mode-card:hover {
    background: color-mix(in srgb, var(--primary) 5%, transparent);
    border-color: color-mix(in srgb, var(--primary) 25%, transparent);
  }

  .dp-mode-active {
    border-color: var(--primary) !important;
    background: color-mix(in srgb, var(--primary) 8%, transparent) !important;
  }

  .dp-mode-icon {
    color: var(--muted-foreground);
    display: flex;
    align-items: center;
    transition: color 0.15s;
    margin-bottom: 0.1rem;
  }

  .dp-mode-active .dp-mode-icon {
    color: var(--primary);
  }

  .dp-mode-title {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--foreground);
    line-height: 1.1;
  }

  .dp-mode-hint {
    font-size: 0.65rem;
    font-weight: 400;
    color: var(--muted-foreground);
    line-height: 1.2;
  }

  .dp-mode-active .dp-mode-title {
    color: var(--primary);
  }

  /* Inputs row: partner + team name side by side */
  .dp-inputs-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem;
    align-items: start;
  }

  /* Input block */
  .dp-input-block {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
  }

  .dp-search-inner {
    position: relative;
    display: flex;
    align-items: center;
  }

  :global(.dp-search-icon) {
    position: absolute;
    left: 0.65rem;
    color: var(--muted-foreground);
    pointer-events: none;
  }

  .dp-search-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.85rem;
    box-sizing: border-box;
  }

  .dp-search-inner .dp-search-input {
    padding-left: 2.1rem;
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
    border-radius: 8px;
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
    padding: 0.1rem 0;
  }

  .dp-error {
    font-size: 0.8rem;
    color: var(--destructive, #ef4444);
    margin: 0;
  }

  .dp-label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
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

  /* ── PARTICIPANT LIST ───────────────────────────────────────── */
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

  .enrolled-item.waitlisted { opacity: 0.65; }

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
