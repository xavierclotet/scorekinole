<script lang="ts">
  import { t } from '$lib/stores/language';
  import { adminTheme } from '$lib/stores/theme';
  import { savingParticipantResults } from '$lib/stores/tournament';

  $: if ($savingParticipantResults) {
    console.log('🔄 SavingOverlay: showing overlay');
  }
</script>

{#if $savingParticipantResults}
  <div class="overlay" class:light={$adminTheme === 'light'}>
    <div class="loader-container">
      <div class="spinner"></div>
      <p class="message">{$t('savingParticipantResults')}</p>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 20, 25, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
  }

  .overlay.light {
    background: rgba(255, 255, 255, 0.9);
  }

  .loader-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem;
    background: #1a2332;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    border: 1px solid #2d3748;
  }

  .light .loader-container {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #2d3748;
    border-top: 4px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .light .spinner {
    border: 4px solid #e2e8f0;
    border-top: 4px solid #667eea;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .message {
    margin: 0;
    color: #e1e8ed;
    font-size: 1rem;
    font-weight: 500;
    text-align: center;
  }

  .light .message {
    color: #1a202c;
  }
</style>
