<script lang="ts">
  import type { Tournament } from '$lib/types/tournament';
  import { exportTournamentText, type ExportLevel } from '$lib/utils/tournamentExport';
  import { Copy, Download, Check } from '@lucide/svelte';
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    tournament: Tournament;
    theme?: 'light' | 'dark' | 'violet';
    onclose: () => void;
  }

  let { tournament, theme = 'dark', onclose }: Props = $props();

  let exportLevel = $state<ExportLevel>(2);
  let copied = $state(false);

  let text = $derived(exportTournamentText(tournament, exportLevel));

  function copyToClipboard() {
    navigator.clipboard.writeText(text).then(() => {
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    });
  }

  function downloadFile() {
    const safeName = tournament.name.replace(/[^a-zA-Z0-9áéíóúñàèìòùçÁÉÍÓÚÑÀÈÌÒÙÇ ._-]/g, '').replace(/\s+/g, '_');
    const date = tournament.tournamentDate
      ? new Date(tournament.tournamentDate).toISOString().slice(0, 10)
      : 'export';
    const filename = `${safeName}_${date}.txt`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const levels: Array<{ value: ExportLevel; labelKey: () => string; descKey: () => string }> = [
    { value: 1, labelKey: () => m.admin_exportLevel1(), descKey: () => m.admin_exportLevel1Desc() },
    { value: 2, labelKey: () => m.admin_exportLevel2(), descKey: () => m.admin_exportLevel2Desc() },
    { value: 3, labelKey: () => m.admin_exportLevel3(), descKey: () => m.admin_exportLevel3Desc() }
  ];
</script>

<div
  class="modal-backdrop"
  data-theme={theme}
  onmousedown={(e) => e.target === e.currentTarget && onclose()}
  role="none"
  onkeydown={(e) => e.key === 'Escape' && onclose()}
>
  <div class="export-modal" role="dialog" aria-modal="true" tabindex="-1">
    <div class="modal-header">
      <h2>{m.admin_exportTitle()}</h2>
      <button class="close-btn" onclick={onclose}>×</button>
    </div>

    <div class="modal-body">
      <div class="level-options">
        {#each levels as level (level.value)}
          <button
            class={['level-card', exportLevel === level.value && 'selected']}
            onclick={() => exportLevel = level.value}
          >
            <div class="radio-dot">
              {#if exportLevel === level.value}
                <div class="radio-dot-inner"></div>
              {/if}
            </div>
            <div class="level-text">
              <span class="level-label">{level.labelKey()}</span>
              <span class="level-desc">{level.descKey()}</span>
            </div>
          </button>
        {/each}
      </div>

      <div class="modal-actions">
        <button class={['action-btn copy-btn', copied && 'copied']} onclick={copyToClipboard}>
          {#if copied}
            <Check size={16} />
            {m.admin_exportCopied()}
          {:else}
            <Copy size={16} />
            {m.admin_exportCopy()}
          {/if}
        </button>
        <button class="action-btn download-btn" onclick={downloadFile}>
          <Download size={16} />
          {m.admin_exportDownload()}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .export-modal {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    width: 100%;
    max-width: 420px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--muted-foreground);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--foreground);
  }

  .modal-body {
    padding: 1.25rem 1.5rem 1.5rem;
  }

  .level-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .level-card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
    color: var(--foreground);
    width: 100%;
  }

  .level-card:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, transparent);
  }

  .level-card.selected {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
  }

  .radio-dot {
    width: 18px;
    height: 18px;
    min-width: 18px;
    border-radius: 50%;
    border: 2px solid var(--muted-foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;
    transition: border-color 0.15s ease;
  }

  .level-card.selected .radio-dot {
    border-color: var(--primary);
  }

  .radio-dot-inner {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--primary);
  }

  .level-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .level-label {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--foreground);
  }

  .level-desc {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    line-height: 1.3;
  }

  .modal-actions {
    margin-top: 1.25rem;
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.7rem 1rem;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--foreground);
  }

  .action-btn:hover {
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
  }

  .copy-btn.copied {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
  }

  .download-btn {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .download-btn:hover {
    opacity: 0.9;
  }
</style>
