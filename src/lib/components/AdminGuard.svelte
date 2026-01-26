<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/firebase/auth';
  import { canAccessAdmin, adminCheckLoading } from '$lib/stores/admin';
  import { t } from '$lib/stores/language';
  import { onMount } from 'svelte';

  let hasChecked = false;

  onMount(() => {
    // Wait for admin check to complete
    const unsubscribe = adminCheckLoading.subscribe((loading) => {
      if (!loading && !hasChecked) {
        hasChecked = true;

        // Redirect if not admin
        if (!$canAccessAdmin) {
          console.warn('Access denied: User is not admin');
          goto('/');
        }
      }
    });

    return unsubscribe;
  });
</script>

{#if $adminCheckLoading}
  <div class="admin-guard-loading">
    <div class="spinner"></div>
    <p>{$t('loading')}</p>
  </div>
{:else if $canAccessAdmin}
  <slot />
{:else}
  <div class="admin-guard-denied">
    <h1>🔒 {$t('accessDenied')}</h1>
    <p>{$t('adminOnly')}</p>
    <button onclick={() => goto('/')}>{$t('goHome')}</button>
  </div>
{/if}

<style>
  .admin-guard-loading,
  .admin-guard-denied {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    text-align: center;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-top-color: #007bff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .admin-guard-denied h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
  }

  .admin-guard-denied p {
    font-size: 1.1rem;
    margin-bottom: 2rem;
    color: #666;
  }

  .admin-guard-denied button {
    padding: 0.75rem 2rem;
    font-size: 1rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .admin-guard-denied button:hover {
    background: #0056b3;
  }
</style>
