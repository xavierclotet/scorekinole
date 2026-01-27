<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/firebase/auth';
  import { canAccessSuperAdmin, adminCheckLoading } from '$lib/stores/admin';
  import * as m from '$lib/paraglide/messages.js';
  import { onMount } from 'svelte';

  let hasChecked = false;

  onMount(() => {
    // Wait for admin check to complete
    const unsubscribe = adminCheckLoading.subscribe((loading) => {
      if (!loading && !hasChecked) {
        hasChecked = true;

        // Redirect if not super admin
        if (!$canAccessSuperAdmin) {
          console.warn('Access denied: User is not super admin');
          goto('/admin');
        }
      }
    });

    return unsubscribe;
  });
</script>

{#if $adminCheckLoading}
  <div class="superadmin-guard-loading">
    <div class="spinner"></div>
    <p>{m.common_loading()}</p>
  </div>
{:else if $canAccessSuperAdmin}
  <slot />
{:else}
  <div class="superadmin-guard-denied">
    <h1>{m.admin_accessDenied()}</h1>
    <p>{m.admin_superAdminPermissionsRequired()}</p>
    <button onclick={() => goto('/admin')}>{m.admin_backToAdmin()}</button>
  </div>
{/if}

<style>
  .superadmin-guard-loading,
  .superadmin-guard-denied {
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
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .superadmin-guard-denied h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
  }

  .superadmin-guard-denied p {
    font-size: 1.1rem;
    margin-bottom: 2rem;
    color: #666;
  }

  .superadmin-guard-denied button {
    padding: 0.75rem 2rem;
    font-size: 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .superadmin-guard-denied button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }
</style>
