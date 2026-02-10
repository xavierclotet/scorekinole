<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import { adminTheme } from '$lib/stores/theme';
  import type { AdminUserInfo } from '$lib/firebase/admin';
  import { updateUserProfile, toggleAdminStatus } from '$lib/firebase/admin';
  import { getQuotaForYear, setQuotaForYear, type QuotaEntry } from '$lib/types/quota';
  import { currentUser } from '$lib/firebase/auth';
  import { get } from 'svelte/store';

  interface Props {
    user: AdminUserInfo;
    allUsers?: AdminUserInfo[];
    onClose: () => void;
    onuserUpdated?: (data: { userId: string }) => void;
  }

  let { user, allUsers = [], onClose, onuserUpdated }: Props = $props();

  // Helper to get playerName by userId
  function getPlayerName(userId: string): string {
    const found = allUsers.find(u => u.userId === userId);
    return found?.playerName || userId.substring(0, 12) + '...';
  }

  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  // Initialize quota from new system, falling back to old system
  function getInitialQuotaForYear(year: number): number {
    // Try new quota system first
    const newSystemQuota = getQuotaForYear(user.quotaEntries, year);
    if (newSystemQuota > 0) return newSystemQuota;
    // Fallback to old system for current year only
    if (year === currentYear && user.maxTournamentsPerYear) {
      return user.maxTournamentsPerYear;
    }
    return 0;
  }

  // svelte-ignore state_referenced_locally - Intentional: initializing editable local state from props
  let playerName = $state(user.playerName);
  // svelte-ignore state_referenced_locally
  let isAdmin = $state(user.isAdmin || false);
  // svelte-ignore state_referenced_locally
  let canAutofill = $state(user.canAutofill || false);
  // svelte-ignore state_referenced_locally
  let canImportTournaments = $state(user.canImportTournaments || false);
  // svelte-ignore state_referenced_locally
  let currentYearQuota = $state(getInitialQuotaForYear(currentYear));
  // svelte-ignore state_referenced_locally
  let nextYearQuota = $state(getInitialQuotaForYear(nextYear));
  // svelte-ignore state_referenced_locally
  let showNextYear = $state(getQuotaForYear(user.quotaEntries, nextYear) > 0);
  let isSaving = $state(false);
  let errorMessage = $state('');

  // Get past quotas (years before current year)
  let pastQuotas = $derived(
    (user.quotaEntries || [])
      .filter(e => e.year < currentYear)
      .sort((a, b) => b.year - a.year)
  );

  async function saveChanges() {
    if (!playerName.trim()) {
      errorMessage = 'Player name cannot be empty';
      return;
    }

    isSaving = true;
    errorMessage = '';

    try {
      const updates: { playerName?: string; quotaEntries?: QuotaEntry[]; canAutofill?: boolean; canImportTournaments?: boolean } = {};

      if (playerName !== user.playerName) {
        updates.playerName = playerName;
      }

      if (canAutofill !== (user.canAutofill || false)) {
        updates.canAutofill = canAutofill;
      }

      if (canImportTournaments !== (user.canImportTournaments || false)) {
        updates.canImportTournaments = canImportTournaments;
      }

      // Build new quotaEntries if quota changed
      const oldCurrentYearQuota = getInitialQuotaForYear(currentYear);
      const oldNextYearQuota = getQuotaForYear(user.quotaEntries, nextYear);

      if (currentYearQuota !== oldCurrentYearQuota || nextYearQuota !== oldNextYearQuota || (showNextYear && nextYearQuota > 0)) {
        const adminUserId = get(currentUser)?.id;
        let newEntries = user.quotaEntries ? [...user.quotaEntries] : [];

        // Update current year quota
        newEntries = setQuotaForYear(newEntries, currentYear, currentYearQuota, adminUserId, 'admin-assigned');

        // Update next year quota if shown and > 0
        if (showNextYear && nextYearQuota > 0) {
          newEntries = setQuotaForYear(newEntries, nextYear, nextYearQuota, adminUserId, 'admin-assigned');
        }

        updates.quotaEntries = newEntries;
      }

      if (Object.keys(updates).length > 0) {
        const success = await updateUserProfile(user.userId, updates);
        if (!success) {
          throw new Error('Failed to update profile');
        }
      }

      if (isAdmin !== (user.isAdmin || false)) {
        const success = await toggleAdminStatus(user.userId, isAdmin);
        if (!success) {
          throw new Error('Failed to update admin status');
        }
      }

      onuserUpdated?.({ userId: user.userId });
      onClose();
    } catch (error) {
      console.error('Error saving user:', error);
      errorMessage = error instanceof Error ? error.message : 'Failed to save changes';
    } finally {
      isSaving = false;
    }
  }

  function formatDate(timestamp: any): string {
    if (!timestamp) return '-';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '-';
    }
  }

  function stopPropagation(e: Event) {
    e.stopPropagation();
  }
</script>

<div class="modal-overlay" data-theme={$adminTheme}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal" onclick={stopPropagation} role="dialog" aria-modal="true" tabindex="-1">
    <!-- Header -->
    <div class="modal-header">
      <div class="header-left">
        <h2>{m.admin_editUser()}</h2>
      </div>
      <div class="header-actions">
        <button class="btn-save" onclick={saveChanges} disabled={isSaving}>
          {#if isSaving}
            <span class="spinner"></span>
          {:else}
            {m.common_save()}
          {/if}
        </button>
        <button class="close-btn" onclick={onClose}>×</button>
      </div>
    </div>

    <!-- Content -->
    <div class="modal-content">
      <!-- User Card -->
      <div class="user-card">
        <div class="user-avatar-section">
          {#if user.photoURL}
            <img src={user.photoURL} alt="" class="avatar" />
          {:else}
            <div class="avatar-placeholder">
              {user.playerName?.charAt(0).toUpperCase() || '?'}
            </div>
          {/if}
          <div class="user-badges">
            {#if user.isSuperAdmin}
              <span class="badge super">Super</span>
            {:else if user.isAdmin}
              <span class="badge admin">Admin</span>
            {:else}
              <span class="badge user">User</span>
            {/if}
          </div>
        </div>
        <div class="user-meta">
          <div class="meta-item">
            <span class="meta-label">Email</span>
            <span class="meta-value">{user.email || '-'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">ID</span>
            <span class="meta-value mono">{user.userId}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">{m.admin_createdAt()}</span>
            <span class="meta-value">{formatDate(user.createdAt)}</span>
          </div>
          {#if user.mergedTo}
            <div class="meta-item">
              <span class="meta-label">{m.admin_mergedTo()}</span>
              <span class="meta-value merged-to-value">→ {getPlayerName(user.mergedTo)}</span>
            </div>
          {/if}
          {#if user.mergedFrom && user.mergedFrom.length > 0}
            <div class="meta-item">
              <span class="meta-label">{m.admin_mergedFrom()}</span>
              <span class="meta-value merged-from-value">
                ← {user.mergedFrom.map(id => getPlayerName(id)).join(', ')}
              </span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Form Grid -->
      <div class="form-grid">
        <!-- Left Column -->
        <div class="form-section">
          <h3>{m.admin_profileSection()}</h3>

          <div class="field">
            <label for="playerName">{m.auth_playerName()}</label>
            <input
              id="playerName"
              type="text"
              bind:value={playerName}
              placeholder="Nombre del jugador"
            />
          </div>
        </div>

        <!-- Right Column - Permissions (only for non-superadmins) -->
        {#if !user.isSuperAdmin}
        <div class="form-section">
          <h3>{m.admin_permissionsSection()}</h3>

          <div class="field">
            <label class="toggle-label">
              <span>{m.admin_role()}</span>
              <div class="toggle-switch" class:active={isAdmin}>
                <input type="checkbox" bind:checked={isAdmin} />
                <span class="toggle-track">
                  <span class="toggle-thumb"></span>
                </span>
              </div>
            </label>
          </div>

          {#if isAdmin}
            <div class="field">
              <label class="toggle-label">
                <span>{m.admin_canAutofill()}</span>
                <div class="toggle-switch autofill" class:active={canAutofill}>
                  <input type="checkbox" bind:checked={canAutofill} />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </div>
              </label>
              <span class="field-hint">{m.admin_canAutofillHint()}</span>
            </div>

            <div class="field">
              <label class="toggle-label">
                <span>{m.admin_canImportTournaments()}</span>
                <div class="toggle-switch import" class:active={canImportTournaments}>
                  <input type="checkbox" bind:checked={canImportTournaments} />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </div>
              </label>
              <span class="field-hint">{m.admin_canImportTournamentsHint()}</span>
            </div>
          {/if}

          {#if isAdmin}
            <div class="field quota-section">
              <span class="quota-label">{m.admin_maxTournaments()}</span>

              <!-- Current year quota -->
              <div class="quota-year-entry">
                <span class="year-label">{currentYear}</span>
                <div class="input-with-suffix compact">
                  <input
                    type="number"
                    bind:value={currentYearQuota}
                    min="0"
                    max="365"
                    step="1"
                  />
                  <span class="suffix">live</span>
                </div>
              </div>

              <!-- Next year quota (collapsible) -->
              {#if showNextYear}
                <div class="quota-year-entry">
                  <span class="year-label">{nextYear}</span>
                  <div class="input-with-suffix compact">
                    <input
                      type="number"
                      bind:value={nextYearQuota}
                      min="0"
                      max="365"
                      step="1"
                    />
                    <span class="suffix">live</span>
                  </div>
                </div>
              {:else}
                <button type="button" class="add-year-btn" onclick={() => { showNextYear = true; nextYearQuota = 1; }}>
                  + {m.admin_addQuotaNextYear({ year: String(nextYear) })}
                </button>
              {/if}

              <!-- Past quotas (read-only) -->
              {#if pastQuotas.length > 0}
                <details class="past-quotas">
                  <summary>{m.admin_pastQuotas()} ({pastQuotas.length})</summary>
                  <div class="past-quotas-list">
                    {#each pastQuotas as quota}
                      <div class="past-quota-item">
                        <span class="year">{quota.year}</span>
                        <span class="value">{quota.maxLiveTournaments} live</span>
                        {#if quota.reason === 'auto-register'}
                          <span class="reason-badge auto">{m.admin_quotaReason_autoRegister()}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </details>
              {/if}

              <span class="field-hint">{m.admin_maxTournamentsHint()}</span>
            </div>
          {/if}
        </div>
        {/if}
      </div>

      {#if errorMessage}
        <div class="error-alert">
          <span class="error-icon">!</span>
          <span>{errorMessage}</span>
        </div>
      {/if}
    </div>

  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    backdrop-filter: blur(2px);
  }

  .modal {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 640px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .modal {
    background: #1a2332;
    color: #e1e8ed;
  }

  /* Header */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .modal-header {
    background: #0f1419;
    border-color: #2d3748;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--primary);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-save {
    padding: 0.4rem 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    background: var(--primary);
    color: white;
    min-width: 80px;
  }

  .btn-save:hover:not(:disabled) {
    box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent);
  }

  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: #666;
    font-size: 1.5rem;
    cursor: pointer;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    line-height: 1;
  }

  .close-btn:hover {
    background: #e5e7eb;
    color: #1a1a1a;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .close-btn {
    color: #8b9bb3;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .close-btn:hover {
    background: #2d3748;
    color: #e1e8ed;
  }

  /* Content */
  .modal-content {
    padding: 1.25rem;
    overflow-y: auto;
    flex: 1;
  }

  /* User Card */
  .user-card {
    display: flex;
    gap: 1.25rem;
    padding: 1rem;
    background: #f3f4f6;
    border-radius: 8px;
    margin-bottom: 1.25rem;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .user-card {
    background: #0f1419;
  }

  .user-avatar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .user-badges {
    display: flex;
    gap: 0.25rem;
  }

  .badge {
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .badge.super {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
  }

  .badge.admin {
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    color: white;
  }

  .badge.user {
    background: #e5e7eb;
    color: #6b7280;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .badge.user {
    background: #374151;
    color: #9ca3af;
  }

  .user-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .meta-label {
    font-size: 0.7rem;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    min-width: 50px;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .meta-label {
    color: #6b7a94;
  }

  .meta-value {
    font-size: 0.8rem;
    color: #333;
    word-break: break-all;
  }

  .meta-value.mono {
    font-family: monospace;
    font-size: 0.75rem;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .meta-value {
    color: #c5d0de;
  }

  .meta-value.merged-to-value {
    color: #059669;
    background: #d1fae5;
    padding: 0.15rem 0.5rem;
    border-radius: 8px;
    font-size: 0.75rem;
  }

  .meta-value.merged-from-value {
    color: #2563eb;
    background: #dbeafe;
    padding: 0.15rem 0.5rem;
    border-radius: 8px;
    font-size: 0.75rem;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .meta-value.merged-to-value {
    background: #064e3b;
    color: #6ee7b7;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .meta-value.merged-from-value {
    background: #1e3a5f;
    color: #93c5fd;
  }

  /* Form Grid */
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .form-section h3 {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
    margin: 0 0 0.75rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .form-section h3 {
    color: #6b7a94;
    border-color: #2d3748;
  }

  .field {
    margin-bottom: 1rem;
  }

  .field:last-child {
    margin-bottom: 0;
  }

  .field label,
  .field .quota-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: #333;
    margin-bottom: 0.35rem;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .field label,
  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .field .quota-label {
    color: #c5d0de;
  }

  .field input[type="text"],
  .field input[type="number"] {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.85rem;
    background: white;
    color: #333;
    transition: all 0.15s;
  }

  .field input[type="text"]:focus,
  .field input[type="number"]:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .field input[type="text"],
  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .field input[type="number"] {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .input-with-suffix {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-with-suffix input {
    padding-right: 3rem;
  }

  .suffix {
    position: absolute;
    right: 0.75rem;
    color: #999;
    font-size: 0.8rem;
    pointer-events: none;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .suffix {
    color: #6b7a94;
  }

  .field-hint {
    font-size: 0.7rem;
    color: #999;
    margin-top: 0.25rem;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .field-hint {
    color: #6b7a94;
  }

  /* Toggle Switch */
  .toggle-label {
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    padding: 0.5rem 0;
  }

  .toggle-switch {
    position: relative;
  }

  .toggle-switch input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    display: block;
    width: 40px;
    height: 22px;
    background: #ccc;
    border-radius: 11px;
    position: relative;
    transition: background 0.2s;
  }

  .toggle-switch.active .toggle-track {
    background: var(--primary);
    box-shadow: 0 0 12px color-mix(in srgb, var(--primary) 60%, transparent);
  }

  .toggle-switch.autofill.active .toggle-track {
    background: var(--primary);
    box-shadow: 0 0 12px color-mix(in srgb, var(--primary) 60%, transparent);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(18px);
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .toggle-track {
    background: #374151;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .toggle-switch.active .toggle-track {
    background: var(--primary);
    box-shadow: 0 0 14px color-mix(in srgb, var(--primary) 70%, transparent);
  }

  /* Quota Section */
  .quota-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .quota-year-entry {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
  }

  .quota-year-entry .year-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #333;
    min-width: 50px;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .quota-year-entry .year-label {
    color: #c5d0de;
  }

  .input-with-suffix.compact {
    max-width: 100px;
  }

  .input-with-suffix.compact input {
    padding-right: 2.5rem;
    text-align: center;
  }

  .add-year-btn {
    padding: 0.4rem 0.75rem;
    font-size: 0.75rem;
    background: transparent;
    border: 1px dashed #ccc;
    border-radius: 6px;
    color: #666;
    cursor: pointer;
    transition: all 0.15s;
    margin-top: 0.25rem;
  }

  .add-year-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, transparent);
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .add-year-btn {
    border-color: #4a5568;
    color: #8b9bb3;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .add-year-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .past-quotas {
    margin-top: 0.5rem;
    font-size: 0.8rem;
  }

  .past-quotas summary {
    cursor: pointer;
    color: #666;
    font-size: 0.75rem;
    padding: 0.25rem 0;
  }

  .past-quotas summary:hover {
    color: #333;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .past-quotas summary {
    color: #6b7a94;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .past-quotas summary:hover {
    color: #8b9bb3;
  }

  .past-quotas-list {
    padding: 0.5rem 0 0 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .past-quota-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #666;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .past-quota-item {
    color: #8b9bb3;
  }

  .past-quota-item .year {
    font-weight: 600;
    min-width: 40px;
  }

  .past-quota-item .value {
    color: #999;
  }

  .reason-badge {
    font-size: 0.65rem;
    padding: 0.1rem 0.4rem;
    border-radius: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .reason-badge.auto {
    background: #dbeafe;
    color: #2563eb;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .reason-badge.auto {
    background: #1e3a5f;
    color: #93c5fd;
  }

  /* Error Alert */
  .error-alert {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #dc2626;
    font-size: 0.85rem;
    margin-top: 1rem;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .error-alert {
    background: #4d1f24;
    border-color: #7f1d1d;
    color: #fca5a5;
  }

  .error-icon {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #dc2626;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Responsive */
  @media (max-width: 600px) {
    .modal {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .form-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .user-card {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .user-meta {
      align-items: center;
    }

    .meta-item {
      flex-direction: column;
      gap: 0.15rem;
    }
  }
</style>
