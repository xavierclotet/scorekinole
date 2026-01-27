<script lang="ts">
  import { adminTheme } from '$lib/stores/theme';
  import * as m from '$lib/paraglide/messages.js';

  function toggleTheme() {
    adminTheme.toggle();
  }
</script>

<button
  class="theme-toggle"
  onclick={toggleTheme}
  title={$adminTheme === 'light' ? m.common_darkMode() : m.common_lightMode()}
>
  {#if $adminTheme === 'light'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  {/if}
</button>

<style>
  .theme-toggle {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 50%;
    color: rgba(0, 0, 0, 0.6);
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
  }

  .theme-toggle svg {
    width: 16px;
    height: 16px;
  }

  .theme-toggle:hover {
    background: rgba(0, 0, 0, 0.1);
    color: #1a1a2e;
    border-color: rgba(0, 0, 0, 0.3);
  }

  .theme-toggle:active {
    transform: scale(0.95);
  }

  /* Dark theme */
  :global([data-theme='dark']) .theme-toggle {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.7);
  }

  :global([data-theme='dark']) .theme-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.3);
  }
</style>
