<script lang="ts">
  import { adminTheme } from '$lib/stores/theme';
  import * as m from '$lib/paraglide/messages.js';

  // Determine if current theme is a light mode variant
  let isLightMode = $derived($adminTheme === 'light' || $adminTheme === 'violet-light');
  let isViolet = $derived($adminTheme === 'violet' || $adminTheme === 'violet-light');
  let isGreen = $derived($adminTheme === 'dark' || $adminTheme === 'light');

  function toggleTheme() {
    adminTheme.toggleMode();
  }
</script>

<button
  class="theme-toggle"
  class:violet={isViolet}
  class:green={isGreen}
  onclick={toggleTheme}
  title={isLightMode ? m.common_darkMode() : m.common_lightMode()}
>
  {#if isLightMode}
    <!-- Moon icon for light modes -->
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  {:else}
    <!-- Sun icon for dark modes -->
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
    position: relative;
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

  /* Dark themes (dark + violet) */
  :global(:is([data-theme='dark'], [data-theme='violet'])) .theme-toggle {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.7);
  }

  :global([data-theme='dark']) .theme-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.3);
  }

  /* Violet theme hover - blue-violet accent */
  :global([data-theme='violet']) .theme-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #818cf8;
    border-color: rgba(129, 140, 248, 0.3);
  }

  /* Green indicator dot */
  .theme-toggle.green::after {
    content: '';
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 8px;
    height: 8px;
    background: #22c55e;
    border-radius: 50%;
    border: 1px solid var(--background);
  }

  /* Violet indicator dot */
  .theme-toggle.violet::after {
    content: '';
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 8px;
    height: 8px;
    background: #818cf8;
    border-radius: 50%;
    border: 1px solid var(--background);
  }
</style>
