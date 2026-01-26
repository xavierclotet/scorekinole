<script lang="ts">
  import { t } from '$lib/stores/language';
  import { adminTheme } from '$lib/stores/theme';
  import type { AdminUserInfo } from '$lib/firebase/admin';
  import { updateUserProfile, toggleAdminStatus } from '$lib/firebase/admin';

  interface Props {
    user: AdminUserInfo;
    onClose: () => void;
    onuserUpdated?: (data: { userId: string }) => void;
  }

  let { user, onClose, onuserUpdated }: Props = $props();

  let playerName = $state(user.playerName);
  let ranking = $state(user.ranking ?? 0);
  let isAdmin = $state(user.isAdmin || false);
  let canAutofill = $state(user.canAutofill || false);
  let maxTournamentsPerYear = $state(user.maxTournamentsPerYear ?? 0);
  let isSaving = $state(false);
  let errorMessage = $state('');

  async function saveChanges() {
    if (!playerName.trim()) {
      errorMessage = 'Player name cannot be empty';
      return;
    }

    isSaving = true;
    errorMessage = '';

    try {
      const updates: { playerName?: string; ranking?: number; maxTournamentsPerYear?: number; canAutofill?: boolean } = {};

      if (playerName !== user.playerName) {
        updates.playerName = playerName;
      }

      if (ranking !== (user.ranking ?? 0)) {
        updates.ranking = ranking;
      }

      if (maxTournamentsPerYear !== (user.maxTournamentsPerYear ?? 0)) {
        updates.maxTournamentsPerYear = maxTournamentsPerYear;
      }

      if (canAutofill !== (user.canAutofill || false)) {
        updates.canAutofill = canAutofill;
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
  <div class="modal" onclick={stopPropagation}>
    <!-- Header -->
    <div class="modal-header">
      <div class="header-left">
        <h2>{$t('editUser')}</h2>
      </div>
      <button class="close-btn" onclick={onClose}>×</button>
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
            <span class="meta-label">{$t('createdAt')}</span>
            <span class="meta-value">{formatDate(user.createdAt)}</span>
          </div>
        </div>
      </div>

      <!-- Form Grid -->
      <div class="form-grid">
        <!-- Left Column -->
        <div class="form-section">
          <h3>Perfil</h3>

          <div class="field">
            <label for="playerName">{$t('playerName')}</label>
            <input
              id="playerName"
              type="text"
              bind:value={playerName}
              placeholder="Nombre del jugador"
            />
          </div>

          <div class="field">
            <label for="ranking">{$t('ranking')}</label>
            <div class="input-with-suffix">
              <input
                id="ranking"
                type="number"
                bind:value={ranking}
                min="0"
                step="1"
              />
              <span class="suffix">pts</span>
            </div>
          </div>
        </div>

        <!-- Right Column -->
        <div class="form-section">
          <h3>Permisos</h3>

          <div class="field">
            <label class="toggle-label">
              <span>{$t('adminRole')}</span>
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
                <span>{$t('canAutofill')}</span>
                <div class="toggle-switch autofill" class:active={canAutofill}>
                  <input type="checkbox" bind:checked={canAutofill} />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </div>
              </label>
              <span class="field-hint">{$t('canAutofillHint')}</span>
            </div>
          {/if}

          {#if isAdmin}
            <div class="field">
              <label for="maxTournamentsPerYear">{$t('maxTournamentsPerYear')}</label>
              <div class="input-with-suffix">
                <input
                  id="maxTournamentsPerYear"
                  type="number"
                  bind:value={maxTournamentsPerYear}
                  min="0"
                  max="365"
                  step="1"
                />
                <span class="suffix">/año</span>
              </div>
              <span class="field-hint">{$t('maxTournamentsPerYearHint')}</span>
            </div>
          {/if}
        </div>
      </div>

      {#if errorMessage}
        <div class="error-alert">
          <span class="error-icon">!</span>
          <span>{errorMessage}</span>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick={onClose} disabled={isSaving}>
        {$t('cancel')}
      </button>
      <button class="btn btn-primary" onclick={saveChanges} disabled={isSaving}>
        {#if isSaving}
          <span class="spinner"></span>
          {$t('saving')}
        {:else}
          {$t('save')}
        {/if}
      </button>
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

  .modal-overlay[data-theme='dark'] .modal {
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

  .modal-overlay[data-theme='dark'] .modal-header {
    background: #0f1419;
    border-color: #2d3748;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #1a1a1a;
  }

  .modal-overlay[data-theme='dark'] .modal-header h2 {
    color: #e1e8ed;
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

  .modal-overlay[data-theme='dark'] .close-btn {
    color: #8b9bb3;
  }

  .modal-overlay[data-theme='dark'] .close-btn:hover {
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

  .modal-overlay[data-theme='dark'] .user-card {
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

  .modal-overlay[data-theme='dark'] .badge.user {
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

  .modal-overlay[data-theme='dark'] .meta-label {
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

  .modal-overlay[data-theme='dark'] .meta-value {
    color: #c5d0de;
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

  .modal-overlay[data-theme='dark'] .form-section h3 {
    color: #6b7a94;
    border-color: #2d3748;
  }

  .field {
    margin-bottom: 1rem;
  }

  .field:last-child {
    margin-bottom: 0;
  }

  .field label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: #333;
    margin-bottom: 0.35rem;
  }

  .modal-overlay[data-theme='dark'] .field label {
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
    border-color: #667eea;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
  }

  .modal-overlay[data-theme='dark'] .field input[type="text"],
  .modal-overlay[data-theme='dark'] .field input[type="number"] {
    background: #0f1419;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .modal-overlay[data-theme='dark'] .field input:focus {
    border-color: #667eea;
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

  .modal-overlay[data-theme='dark'] .suffix {
    color: #6b7a94;
  }

  .field-hint {
    font-size: 0.7rem;
    color: #999;
    margin-top: 0.25rem;
  }

  .modal-overlay[data-theme='dark'] .field-hint {
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
    background: #22c55e;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
  }

  .toggle-switch.autofill.active .toggle-track {
    background: #22c55e;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
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

  .modal-overlay[data-theme='dark'] .toggle-track {
    background: #374151;
  }

  .modal-overlay[data-theme='dark'] .toggle-switch.active .toggle-track {
    background: #22c55e;
    box-shadow: 0 0 14px rgba(34, 197, 94, 0.7);
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

  .modal-overlay[data-theme='dark'] .error-alert {
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

  /* Footer */
  .modal-footer {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .modal-overlay[data-theme='dark'] .modal-footer {
    background: #0f1419;
    border-color: #2d3748;
  }

  .btn {
    flex: 1;
    padding: 0.6rem 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #e5e7eb;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #d1d5db;
  }

  .modal-overlay[data-theme='dark'] .btn-secondary {
    background: #374151;
    color: #e5e7eb;
  }

  .modal-overlay[data-theme='dark'] .btn-secondary:hover:not(:disabled) {
    background: #4b5563;
  }

  .btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
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
