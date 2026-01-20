<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { t } from '$lib/stores/language';
  import { adminTheme } from '$lib/stores/adminTheme';
  import type { AdminUserInfo } from '$lib/firebase/admin';
  import { updateUserProfile, toggleAdminStatus } from '$lib/firebase/admin';

  export let user: AdminUserInfo;
  export let onClose: () => void;

  const dispatch = createEventDispatcher();

  let playerName = user.playerName;
  let ranking = user.ranking ?? 0;
  let isAdmin = user.isAdmin || false;
  let isSaving = false;
  let errorMessage = '';

  async function saveChanges() {
    if (!playerName.trim()) {
      errorMessage = 'Player name cannot be empty';
      return;
    }

    isSaving = true;
    errorMessage = '';

    try {
      // Build updates object
      const updates: { playerName?: string; ranking?: number } = {};

      if (playerName !== user.playerName) {
        updates.playerName = playerName;
      }

      if (ranking !== (user.ranking ?? 0)) {
        updates.ranking = ranking;
      }

      // Update profile fields if any changed
      if (Object.keys(updates).length > 0) {
        const success = await updateUserProfile(user.userId, updates);
        if (!success) {
          throw new Error('Failed to update profile');
        }
      }

      // Update admin status
      if (isAdmin !== (user.isAdmin || false)) {
        const success = await toggleAdminStatus(user.userId, isAdmin);
        if (!success) {
          throw new Error('Failed to update admin status');
        }
      }

      dispatch('userUpdated', { userId: user.userId });
      onClose();
    } catch (error) {
      console.error('Error saving user:', error);
      errorMessage = error instanceof Error ? error.message : 'Failed to save changes';
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="modal-backdrop" data-theme={$adminTheme} on:click={onClose}>
  <div class="modal-content" on:click|stopPropagation>
    <div class="modal-header">
      <h2>{$t('editUser')}</h2>
      <button class="close-button" on:click={onClose}>✕</button>
    </div>

    <div class="modal-body">
      <div class="user-info">
        {#if user.photoURL}
          <img src={user.photoURL} alt={user.playerName} class="user-photo" />
        {:else}
          <div class="user-photo-placeholder">
            {user.playerName.charAt(0).toUpperCase()}
          </div>
        {/if}
        <div class="user-details">
          <p class="user-email">{user.email || 'No email'}</p>
          <p class="user-id">ID: {user.userId}</p>
        </div>
      </div>

      <div class="form-group">
        <label for="playerName">{$t('playerName')}</label>
        <input
          id="playerName"
          type="text"
          bind:value={playerName}
          placeholder={$t('playerName')}
        />
      </div>

      <div class="form-group">
        <label for="ranking">{$t('ranking')}</label>
        <input
          id="ranking"
          type="number"
          bind:value={ranking}
          min="0"
          step="1"
        />
      </div>

      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" bind:checked={isAdmin} />
          <span>{$t('adminRole')}</span>
        </label>
      </div>

      {#if errorMessage}
        <div class="error-message">{errorMessage}</div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="cancel-button" on:click={onClose} disabled={isSaving}>
        {$t('cancel')}
      </button>
      <button class="save-button" on:click={saveChanges} disabled={isSaving}>
        {isSaving ? $t('saving') : $t('save')}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .modal-backdrop[data-theme='dark'] .modal-content {
    background: #1a2332;
    color: #e1e8ed;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .modal-backdrop[data-theme='dark'] .modal-header {
    border-bottom-color: #2d3748;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #999;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: #f0f0f0;
    color: #333;
  }

  .modal-backdrop[data-theme='dark'] .close-button {
    color: #8b9bb3;
  }

  .modal-backdrop[data-theme='dark'] .close-button:hover {
    background: #2d3748;
    color: #e1e8ed;
  }

  .modal-body {
    padding: 1.5rem;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 12px;
  }

  .modal-backdrop[data-theme='dark'] .user-info {
    background: #0d1520;
  }

  .user-photo {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
  }

  .user-photo-placeholder {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: #007bff;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: bold;
  }

  .user-details {
    flex: 1;
  }

  .user-email {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .user-id {
    font-size: 0.85rem;
    color: #666;
    font-family: monospace;
  }

  .modal-backdrop[data-theme='dark'] .user-email {
    color: #e1e8ed;
  }

  .modal-backdrop[data-theme='dark'] .user-id {
    color: #8b9bb3;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
  }

  .modal-backdrop[data-theme='dark'] .form-group label {
    color: #e1e8ed;
  }

  .form-group input[type="text"],
  .form-group input[type="number"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 1rem;
    transition: border-color 0.2s;
    background: white;
    color: #333;
  }

  .form-group input[type="text"]:focus,
  .form-group input[type="number"]:focus {
    outline: none;
    border-color: #007bff;
  }

  .modal-backdrop[data-theme='dark'] .form-group input[type="text"],
  .modal-backdrop[data-theme='dark'] .form-group input[type="number"] {
    background: #0d1520;
    border-color: #2d3748;
    color: #e1e8ed;
  }

  .modal-backdrop[data-theme='dark'] .form-group input[type="text"]:focus,
  .modal-backdrop[data-theme='dark'] .form-group input[type="number"]:focus {
    border-color: #667eea;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-group input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
  }

  .error-message {
    padding: 0.75rem;
    background: #f8d7da;
    color: #721c24;
    border-radius: 8px;
    margin-top: 1rem;
  }

  .modal-footer {
    display: flex;
    gap: 1rem;
    padding: 1.5rem;
    border-top: 1px solid #e0e0e0;
  }

  .modal-backdrop[data-theme='dark'] .modal-footer {
    border-top-color: #2d3748;
  }

  .modal-footer button {
    flex: 1;
    padding: 0.75rem;
    font-size: 1rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modal-footer button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cancel-button {
    background: #6c757d;
    color: white;
  }

  .cancel-button:hover:not(:disabled) {
    background: #5a6268;
  }

  .modal-backdrop[data-theme='dark'] .cancel-button {
    background: #2d3748;
  }

  .modal-backdrop[data-theme='dark'] .cancel-button:hover:not(:disabled) {
    background: #4a5568;
  }

  .save-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .save-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  /* Responsive */
  @media (max-width: 600px) {
    .modal-content {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      margin-top: auto;
    }

    .user-info {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
