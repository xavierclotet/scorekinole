<script lang="ts">
  import type { Tournament } from '$lib/types/tournament';
  import { currentUser } from '$lib/firebase/auth';
  import { registerForTournament } from '$lib/firebase/tournamentRegistration';
  import LoginModal from '$lib/components/LoginModal.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import Users from '@lucide/svelte/icons/users';
  import Clock from '@lucide/svelte/icons/clock';
  import FileText from '@lucide/svelte/icons/file-text';
  import Trophy from '@lucide/svelte/icons/trophy';

  interface Props {
    tournament: Tournament;
  }

  let { tournament }: Props = $props();

  let isRegistering = $state(false);
  let showLoginModal = $state(false);
  let registrationResult = $state<'registered' | 'waitlisted' | null>(null);
  let errorMessage = $state('');
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

  let isDoubles = $derived(tournament.gameType === 'doubles');

  function buildFormatDescription(t: Tournament): string {
    const parts: string[] = [];
    if (t.phaseType === 'TWO_PHASE' && t.numGroups) {
      parts.push(`${t.numGroups} grupos → eliminatoria`);
    } else if (t.phaseType === 'ONE_PHASE' && t.groupStage?.type === 'SWISS') {
      parts.push(`Swiss ${t.numSwissRounds ?? ''}R`);
    } else if (t.numGroups && t.numGroups > 1) {
      parts.push(`${t.numGroups} grupos`);
    } else {
      parts.push('Round Robin');
    }
    return parts.join(' · ');
  }

  let formatDescription = $derived(buildFormatDescription(tournament));

  async function handleRegister() {
    if (!$currentUser) {
      showLoginModal = true;
      return;
    }
    isRegistering = true;
    errorMessage = '';

    const partner = showPartnerField && partnerName.trim()
      ? { type: 'GUEST' as const, name: partnerName.trim() }
      : undefined;

    const result = await registerForTournament(tournament.id, partner);
    isRegistering = false;

    if (result.success) {
      registrationResult = result.status!;
      partnerName = '';
      showPartnerField = false;
    } else {
      errorMessage = result.error || 'Error al inscribirse';
    }
  }
</script>

<div class="registration-section">
  <!-- Info block -->
  <div class="reg-info">
    <div class="info-item">
      <Trophy size={16} />
      <span class="info-label">{m.registration_format()}</span>
      <span class="info-value">{formatDescription}</span>
    </div>

    {#if reg.entryFee}
      <div class="info-item">
        <span class="info-label">{m.registration_entryFee()}</span>
        <span class="info-value">{reg.entryFee}</span>
      </div>
    {/if}

    <div class="info-item">
      <Users size={16} />
      <span class="info-label">{m.registration_participants()}</span>
      <span class="info-value">
        {#if reg.maxParticipants}
          {m.registration_spots({ current: String(participantCount), max: String(reg.maxParticipants) })}
        {:else}
          {m.registration_spotsNoLimit({ current: String(participantCount) })}
        {/if}
      </span>
    </div>

    {#if reg.maxParticipants}
      <div class="capacity-bar">
        <div
          class="capacity-fill"
          class:full={isFull}
          style="width: {Math.min((participantCount / reg.maxParticipants) * 100, 100)}%"
        ></div>
      </div>
    {/if}

    {#if reg.deadline}
      <div class="info-item">
        <Clock size={16} />
        <span class="info-label">{m.registration_deadline()}</span>
        <span class="info-value">{new Date(reg.deadline).toLocaleString()}</span>
      </div>
    {/if}

    {#if reg.rulesText}
      <div class="rules-block">
        <FileText size={16} />
        <div>
          <span class="info-label">{m.registration_rules()}</span>
          <p class="rules-text">{reg.rulesText}</p>
          {#if reg.rulesUrl}
            <a href={reg.rulesUrl} target="_blank" rel="noopener noreferrer" class="rules-link">
              {reg.rulesUrl}
            </a>
          {/if}
        </div>
      </div>
    {:else if reg.rulesUrl}
      <div class="info-item">
        <FileText size={16} />
        <span class="info-label">{m.registration_rules()}</span>
        <a href={reg.rulesUrl} target="_blank" rel="noopener noreferrer" class="rules-link">
          {m.registration_rules()}
        </a>
      </div>
    {/if}
  </div>

  <!-- Action area -->
  <div class="reg-action">
    {#if !registrationOpen}
      <button class="reg-btn closed" disabled>{m.registration_closed()}</button>
    {:else if isUserRegistered || registrationResult === 'registered'}
      <div class="reg-badge registered">{m.registration_registered()}</div>
    {:else if isUserOnWaitlist || registrationResult === 'waitlisted'}
      <div class="reg-badge waitlisted">{m.registration_onWaitlist()}</div>
    {:else if !$currentUser}
      <button class="reg-btn login" onclick={() => showLoginModal = true}>
        <UserPlus size={18} />
        {m.registration_loginToRegister()}
      </button>
    {:else if isFull}
      <button class="reg-btn waitlist" onclick={handleRegister} disabled={isRegistering}>
        {#if isRegistering}
          <LoaderCircle size={18} class="spin" />
        {:else}
          <UserPlus size={18} />
        {/if}
        {m.registration_joinWaitlist()}
      </button>
    {:else if isDoubles && !showPartnerField && registrationResult === null}
      <div class="doubles-options">
        <button class="reg-btn secondary" onclick={() => showPartnerField = true}>
          {m.registration_selectPartner()}
        </button>
        <button class="reg-btn primary" onclick={handleRegister} disabled={isRegistering}>
          {#if isRegistering}<LoaderCircle size={18} class="spin" />{/if}
          {m.registration_noPartner()}
        </button>
      </div>
    {:else if showPartnerField}
      <div class="partner-field">
        <input
          type="text"
          bind:value={partnerName}
          placeholder={m.registration_selectPartner()}
        />
        <button
          class="reg-btn primary"
          onclick={handleRegister}
          disabled={isRegistering || !partnerName.trim()}
        >
          {#if isRegistering}<LoaderCircle size={18} class="spin" />{/if}
          {m.registration_confirmRegistration()}
        </button>
      </div>
    {:else}
      <button class="reg-btn primary" onclick={handleRegister} disabled={isRegistering}>
        {#if isRegistering}
          <LoaderCircle size={18} class="spin" />
        {:else}
          <UserPlus size={18} />
        {/if}
        {m.registration_register()}
      </button>
    {/if}

    {#if errorMessage}
      <p class="error-msg">{errorMessage}</p>
    {/if}
  </div>

  <!-- Participant list -->
  {#if reg.showParticipantList && participantCount > 0}
    <div class="participant-list">
      <h3>{m.registration_participants()} ({participantCount})</h3>
      <ul>
        {#each tournament.participants as p (p.id)}
          <li class="participant-item">
            {#if p.photoURL}
              <img src={p.photoURL} alt="" class="participant-avatar" />
            {:else}
              <div class="participant-avatar placeholder">{p.name.charAt(0).toUpperCase()}</div>
            {/if}
            <span class="participant-name">{p.name}</span>
            {#if p.partner}
              <span class="partner-name">& {p.partner.name}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if reg.showParticipantList && waitlistCount > 0}
    <div class="participant-list waitlist-list">
      <h3>{m.registration_waitlist()} ({waitlistCount})</h3>
      <ul>
        {#each tournament.waitlist ?? [] as w (w.userId)}
          <li class="participant-item">
            <div class="participant-avatar placeholder">{w.userName.charAt(0).toUpperCase()}</div>
            <span class="participant-name">{w.userName}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

{#if showLoginModal}
  <LoginModal bind:isOpen={showLoginModal} />
{/if}

<style>
  .registration-section {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.25rem;
    background: color-mix(in srgb, var(--primary) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 15%, transparent);
    border-radius: 12px;
    margin-bottom: 1.5rem;
  }

  .reg-info {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .info-label {
    color: var(--muted-foreground);
    min-width: 5rem;
  }

  .info-value {
    font-weight: 500;
  }

  .capacity-bar {
    height: 6px;
    background: color-mix(in srgb, var(--border) 50%, transparent);
    border-radius: 3px;
    overflow: hidden;
  }

  .capacity-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .capacity-fill.full {
    background: var(--destructive, #ef4444);
  }

  .rules-block {
    display: flex;
    gap: 0.5rem;
    font-size: 0.9rem;
    align-items: flex-start;
  }

  .rules-text {
    margin: 0.25rem 0;
    white-space: pre-wrap;
    font-size: 0.85rem;
    color: var(--muted-foreground);
  }

  .rules-link {
    color: var(--primary);
    font-size: 0.85rem;
    text-decoration: underline;
  }

  .reg-action {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .reg-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
  }

  .reg-btn.primary {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .reg-btn.primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .reg-btn.secondary {
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  }

  .reg-btn.login {
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
  }

  .reg-btn.waitlist {
    background: color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent);
    color: var(--warning, #f59e0b);
  }

  .reg-btn.closed {
    background: color-mix(in srgb, var(--muted-foreground) 10%, transparent);
    color: var(--muted-foreground);
    cursor: not-allowed;
  }

  .reg-btn:disabled {
    opacity: 0.6;
  }

  .reg-badge {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    text-align: center;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .reg-badge.registered {
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
  }

  .reg-badge.waitlisted {
    background: color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent);
    color: var(--warning, #f59e0b);
  }

  .doubles-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .partner-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .partner-field input {
    padding: 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.9rem;
  }

  .error-msg {
    color: var(--destructive, #ef4444);
    font-size: 0.85rem;
    margin: 0;
  }

  .participant-list {
    border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    padding-top: 1rem;
  }

  .participant-list h3 {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .participant-list ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .participant-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .participant-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .participant-avatar.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 20%, transparent);
    color: var(--primary);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .participant-name {
    font-weight: 500;
  }

  .partner-name {
    color: var(--muted-foreground);
    font-size: 0.85rem;
  }

  .waitlist-list {
    opacity: 0.7;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
