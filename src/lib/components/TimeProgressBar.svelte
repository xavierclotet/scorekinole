<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';

  interface Props {
    percentComplete?: number;
    remainingMinutes?: number | null;
    showEstimatedEnd?: boolean;
    compact?: boolean;
    clickable?: boolean;
    onclick?: () => void;
  }

  let {
    percentComplete = 0,
    remainingMinutes = null,
    showEstimatedEnd = false,
    compact = false,
    clickable = false,
    onclick
  }: Props = $props();

  // Reactive current time that updates every minute
  let now = $state(Date.now());

  $effect(() => {
    const interval = setInterval(() => {
      now = Date.now();
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  });

  // ETA calculated reactively based on current time + remaining minutes
  let estimatedEndTime = $derived(
    remainingMinutes !== null
      ? new Date(now + remainingMinutes * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null
  );

  // Use white text with strong dark outline for visibility on any background
  const textColor = 'white';
  const textShadow = '0 0 4px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,0.9), 1px 1px 2px rgba(0,0,0,1)';

  function formatRemainingTime(minutes: number): string {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  function handleClick() {
    if (clickable) {
      onclick?.();
    }
  }
</script>

<div
  class="time-progress"
  class:compact
  class:clickable
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
  role={clickable ? 'button' : undefined}
  tabindex={clickable ? 0 : undefined}
>
  {#if remainingMinutes !== null}
    <div class="time-info">
      <span class="remaining">
        {#if compact}
          {formatRemainingTime(remainingMinutes)}
        {:else}
          {m.common_remaining()}: {formatRemainingTime(remainingMinutes)}
        {/if}
      </span>
      {#if showEstimatedEnd && estimatedEndTime}
        <span class="eta">
          {#if compact}
            → {estimatedEndTime}
          {:else}
            {m.common_estimatedEnd()}: {estimatedEndTime}
          {/if}
        </span>
      {/if}
    </div>
  {/if}
  <div class="progress-bar">
    <div class="progress-fill" style="width: {Math.min(100, percentComplete)}%"></div>
    <span
      class="progress-percent"
      style="color: {textColor}; text-shadow: {textShadow};"
    >{Math.round(percentComplete)}%</span>
  </div>
</div>

<style>
  .time-progress {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
  }

  .time-progress.compact {
    gap: 0.25rem;
    min-width: 120px;
    max-width: 180px;
  }

  .time-info {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--text-secondary, #6b7280);
  }

  .compact .time-info {
    font-size: 0.75rem;
    gap: 0.5rem;
  }

  .remaining {
    font-weight: 500;
  }

  .eta {
    opacity: 0.8;
  }

  .progress-bar {
    position: relative;
    width: 100%;
    height: 20px;
    background: var(--bg-tertiary, #e5e7eb);
    border-radius: 10px;
    overflow: hidden;
  }

  .compact .progress-bar {
    height: 16px;
    border-radius: 8px;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #30cfd0, #330867);
    border-radius: 10px;
    transition: width 0.3s ease;
  }

  .compact .progress-fill {
    border-radius: 8px;
  }

  .progress-percent {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .compact .progress-percent {
    font-size: 0.65rem;
  }

  .time-progress.clickable {
    cursor: pointer;
    transition: transform 0.15s, opacity 0.15s;
  }

  .time-progress.clickable:hover {
    transform: scale(1.02);
    opacity: 0.9;
  }

  .time-progress.clickable:active {
    transform: scale(0.98);
  }
</style>
