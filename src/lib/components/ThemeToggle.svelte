<script lang="ts">
  import { adminTheme } from '$lib/stores/adminTheme';

  function toggleTheme() {
    adminTheme.toggle();
  }
</script>

<button class="theme-toggle" on:click={toggleTheme} title={$adminTheme === 'light' ? 'Modo oscuro' : 'Modo claro'}>
  {#if $adminTheme === 'light'}
    🌙
  {:else}
    ☀️
  {/if}
</button>

<style>
  .theme-toggle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: var(--toggle-bg, rgba(255, 255, 255, 0.1));
    color: var(--toggle-color, #333);
    font-size: 1.2rem;
    cursor: pointer;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .theme-toggle:hover {
    transform: scale(1.1) rotate(20deg);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .theme-toggle:active {
    transform: scale(0.95);
  }
</style>
