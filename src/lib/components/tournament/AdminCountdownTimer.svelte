<script lang="ts">
  import { browser } from '$app/environment';
  import { untrack } from 'svelte';
  import { vibratePattern } from '$lib/utils/vibration';
  import { Play, Pause, RotateCcw, GripVertical, Maximize, Minimize, X, Pencil } from '@lucide/svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { updateTournament } from '$lib/firebase/tournaments';
  import type { TournamentTimer } from '$lib/types/tournament';

  interface Props {
    initialMinutes: number;
    tournamentId: string;
    gameType: 'singles' | 'doubles';
    visible: boolean;
    onclose: () => void;
    externalTimer?: TournamentTimer | null;
  }

  let { initialMinutes, tournamentId, gameType, visible, onclose, externalTimer }: Props = $props();

  // Timer state
  let initialSeconds = $derived(initialMinutes * 60);
  let timeRemaining = $state(initialMinutes * 60);
  let running = $state(false);
  let interval: ReturnType<typeof setInterval> | null = null;
  let prevInitialSeconds = initialMinutes * 60;

  // Reset when initialMinutes changes
  $effect(() => {
    if (initialSeconds !== prevInitialSeconds) {
      prevInitialSeconds = initialSeconds;
      stopTimer();
      timeRemaining = initialSeconds;
    }
  });

  // React to external timer resets (e.g., auto-reset when round completes)
  let lastExternalJson = $state('');
  $effect(() => {
    if (!externalTimer) return;
    const json = JSON.stringify(externalTimer);
    if (json === lastExternalJson) return;
    lastExternalJson = json;

    // Only react to resets: when server says stopped with full duration and we're at 0 or different
    if (externalTimer.status === 'stopped' && externalTimer.remaining > 0 && externalTimer.remaining !== timeRemaining) {
      stopTimer();
      timeRemaining = externalTimer.remaining;
    }
  });

  // Firestore sync (write-only, no feedback loop)
  function syncTimerToFirestore(timer: TournamentTimer | null) {
    if (!tournamentId) return;
    updateTournament(tournamentId, { countdownTimer: timer } as any);
  }

  // Sync when timer becomes visible (only on visibility transition)
  let prevVisible = false;
  $effect(() => {
    const nowVisible = visible && initialized;
    if (nowVisible && !prevVisible) {
      untrack(() => {
        syncTimerToFirestore({ status: 'stopped', remaining: timeRemaining, duration: initialSeconds });
      });
    }
    prevVisible = nowVisible;
  });

  // Fullscreen state
  let isFullscreen = $state(false);

  // Position & size state
  const STORAGE_KEY = $derived(`adminCountdownTimer_${tournamentId}`);
  const DEFAULT_WIDTH = 240;
  const DEFAULT_HEIGHT = 140;
  const MIN_WIDTH = 150;
  const MIN_HEIGHT = 100;
  const MAX_WIDTH = 1200;
  const MAX_HEIGHT = 800;

  let posX = $state(0);
  let posY = $state(0);
  let width = $state(DEFAULT_WIDTH);
  let height = $state(DEFAULT_HEIGHT);
  let initialized = $state(false);

  // Drag state
  let isDragging = $state(false);
  let hasMoved = $state(false);
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let dragOffsetX = $state(0);
  let dragOffsetY = $state(0);

  // Resize state
  let isResizing = $state(false);
  let resizeStartX = $state(0);
  let resizeStartY = $state(0);
  let resizeStartW = $state(0);
  let resizeStartH = $state(0);

  // Edit mode
  let isEditing = $state(false);
  let editMinutes = $state('00');
  let editSeconds = $state('00');
  let minutesInput: HTMLInputElement | undefined = $state();

  function pad2(n: number): string {
    return n.toString().padStart(2, '0');
  }

  function enterEditMode() {
    if (running) return;
    isEditing = true;
    editMinutes = pad2(Math.floor(timeRemaining / 60));
    editSeconds = pad2(timeRemaining % 60);
    setTimeout(() => minutesInput?.select(), 0);
  }

  function confirmEdit() {
    const mins = Math.max(0, Math.min(15, parseInt(editMinutes) || 0));
    const secs = Math.max(0, Math.min(59, parseInt(editSeconds) || 0));
    timeRemaining = mins * 60 + secs;
    isEditing = false;
    syncTimerToFirestore({ status: 'paused', remaining: timeRemaining, duration: initialSeconds });
  }

  function cancelEdit() {
    isEditing = false;
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') confirmEdit();
    else if (e.key === 'Escape') cancelEdit();
  }

  function handleTimeInput(e: Event, field: 'min' | 'sec') {
    const input = e.target as HTMLInputElement;
    // Only allow digits
    const raw = input.value.replace(/\D/g, '').slice(0, 2);
    if (field === 'min') editMinutes = raw;
    else editSeconds = raw;
  }

  function handleTimeBlur(field: 'min' | 'sec') {
    const max = field === 'min' ? 15 : 59;
    const val = Math.max(0, Math.min(max, parseInt(field === 'min' ? editMinutes : editSeconds) || 0));
    if (field === 'min') editMinutes = pad2(val);
    else editSeconds = pad2(val);
  }

  // Audio
  let audioContext: AudioContext | null = null;

  // Derived display values
  let display = $derived.by(() => {
    const mins = Math.floor(timeRemaining / 60);
    const secs = timeRemaining % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  let isWarning = $derived(timeRemaining < 60 && timeRemaining >= 30 && running);
  let isCritical = $derived(timeRemaining < 30 && timeRemaining > 0 && running);
  let isTimeout = $derived(timeRemaining === 0 && !running);

  // Font size: scale aggressively to fill container
  let fontSize = $derived(isFullscreen
    ? Math.min(window.innerWidth * 0.28, window.innerHeight * 0.4)
    : Math.max(20, Math.min(120, width * 0.32))
  );
  let iconSize = $derived(isFullscreen ? 24 : 16);

  // Load persisted position/size
  $effect(() => {
    if (!browser) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        posX = data.x ?? (window.innerWidth / 2 - DEFAULT_WIDTH / 2);
        posY = data.y ?? (window.innerHeight - DEFAULT_HEIGHT - 20);
        width = data.width ?? DEFAULT_WIDTH;
        height = data.height ?? DEFAULT_HEIGHT;
      } else {
        posX = window.innerWidth / 2 - DEFAULT_WIDTH / 2;
        posY = window.innerHeight - DEFAULT_HEIGHT - 20;
      }
    } catch {
      posX = window.innerWidth / 2 - DEFAULT_WIDTH / 2;
      posY = window.innerHeight - DEFAULT_HEIGHT - 20;
    }
    initialized = true;
  });

  function savePosition() {
    if (!browser) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: posX, y: posY, width, height }));
    } catch {
      // Storage full or unavailable
    }
  }

  // Timer logic
  function startTimer() {
    if (timeRemaining <= 0) return;
    running = true;
    syncTimerToFirestore({
      status: 'running',
      endsAt: Date.now() + timeRemaining * 1000,
      remaining: timeRemaining,
      duration: initialSeconds
    });
    interval = setInterval(() => {
      if (timeRemaining <= 1) {
        timeRemaining = 0;
        stopTimer();
        syncTimerToFirestore({ status: 'stopped', remaining: 0, duration: initialSeconds });
        triggerTimeoutAlert();
      } else {
        timeRemaining -= 1;
        if (timeRemaining <= 10) playTickBeep();
      }
    }, 1000);
  }

  function stopTimer() {
    running = false;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  function toggleTimer() {
    if (running) {
      stopTimer();
      syncTimerToFirestore({ status: 'paused', remaining: timeRemaining, duration: initialSeconds });
    } else {
      startTimer();
    }
  }

  function resetTimer() {
    stopTimer();
    timeRemaining = initialSeconds;
    syncTimerToFirestore({ status: 'stopped', remaining: initialSeconds, duration: initialSeconds });
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  function handleClose() {
    isFullscreen = false;
    document.body.style.overflow = '';
    syncTimerToFirestore(null);
    onclose();
  }

  // Sound
  function playTickBeep() {
    if (!browser) return;
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (audioContext.state === 'suspended') audioContext.resume();

      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.frequency.value = 660;
      osc.type = 'sine';
      gain.gain.value = 0.12;

      const now = audioContext.currentTime;
      osc.start(now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.stop(now + 0.12);
    } catch {
      // Audio not supported
    }
  }

  function playTimeoutBeep() {
    if (!browser) return;
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;

      const now = audioContext.currentTime;
      oscillator.start(now);
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.setValueAtTime(0, now + 0.15);
      gainNode.gain.setValueAtTime(0.3, now + 0.25);
      gainNode.gain.setValueAtTime(0, now + 0.4);
      oscillator.stop(now + 0.5);
    } catch {
      // Audio not supported
    }
  }

  function triggerTimeoutAlert() {
    vibratePattern([100, 80, 100, 80, 100]);
    playTimeoutBeep();
  }

  // Drag handlers
  function handleDragStart(e: MouseEvent | TouchEvent) {
    if (isFullscreen) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    if ((e.target as HTMLElement).closest('.edit-time')) return;

    isDragging = true;
    hasMoved = false;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragOffsetX = clientX - posX;
    dragOffsetY = clientY - posY;
    dragStartX = clientX;
    dragStartY = clientY;
  }

  function handleDragMove(e: MouseEvent | TouchEvent) {
    if (!isDragging) return;
    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = Math.abs(clientX - dragStartX);
    const deltaY = Math.abs(clientY - dragStartY);

    if (deltaX > 5 || deltaY > 5) {
      hasMoved = true;
      posX = Math.max(0, Math.min(window.innerWidth - width, clientX - dragOffsetX));
      posY = Math.max(0, Math.min(window.innerHeight - height, clientY - dragOffsetY));
    }
  }

  function handleDragEnd() {
    if (isDragging) {
      if (hasMoved) savePosition();
      setTimeout(() => { isDragging = false; }, 50);
    }
  }

  // Resize handlers
  function handleResizeStart(e: MouseEvent | TouchEvent) {
    if (isFullscreen) return;
    e.stopPropagation();
    e.preventDefault();
    isResizing = true;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    resizeStartX = clientX;
    resizeStartY = clientY;
    resizeStartW = width;
    resizeStartH = height;
  }

  function handleResizeMove(e: MouseEvent | TouchEvent) {
    if (!isResizing) return;
    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartW + (clientX - resizeStartX)));
    height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeStartH + (clientY - resizeStartY)));
  }

  function handleResizeEnd() {
    if (isResizing) {
      isResizing = false;
      savePosition();
    }
  }

  // Global event listeners
  $effect(() => {
    if (!browser) return;

    const onMouseMove = (e: MouseEvent) => {
      handleDragMove(e);
      handleResizeMove(e);
    };
    const onMouseUp = () => {
      handleDragEnd();
      handleResizeEnd();
    };
    const onTouchMove = (e: TouchEvent) => {
      handleDragMove(e);
      handleResizeMove(e);
    };
    const onTouchEnd = () => {
      handleDragEnd();
      handleResizeEnd();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      if (interval) clearInterval(interval);
      document.body.style.overflow = '';
    };
  });
</script>

{#if visible && initialized}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class={['countdown-overlay', isDragging && 'dragging', isResizing && 'resizing', isFullscreen && 'fullscreen']}
    style={isFullscreen ? '' : `left: ${posX}px; top: ${posY}px; width: ${width}px; height: ${height}px;`}
    onmousedown={handleDragStart}
    ontouchstart={handleDragStart}
    role="timer"
    aria-label="Admin countdown timer"
  >
    <div class="countdown-header">
      <div class="header-left">
        <GripVertical size={14} />
        <span class="countdown-title">
          {gameType === 'doubles'
            ? m.admin_countdownDoubles({ minutes: initialMinutes })
            : m.admin_countdownSingles({ minutes: initialMinutes })}
        </span>
      </div>
      <div class="header-actions">
        {#if !running && !isEditing && !isTimeout}
          <button
            class="header-btn"
            onclick={(e) => { e.stopPropagation(); enterEditMode(); }}
            aria-label="Edit time"
          >
            <Pencil size={13} />
          </button>
        {/if}
        <button
          class="header-btn"
          onclick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {#if isFullscreen}
            <Minimize size={13} />
          {:else}
            <Maximize size={13} />
          {/if}
        </button>
        <button
          class="header-btn close"
          onclick={(e) => { e.stopPropagation(); handleClose(); }}
          aria-label="Close timer"
        >
          <X size={13} />
        </button>
      </div>
    </div>

    <div
      class={['countdown-display', isWarning && 'warning', isCritical && 'critical', isTimeout && 'timeout']}
      style="font-size: {fontSize}px;"
    >
      {#if isEditing}
        <div class="edit-time" onclick={(e) => e.stopPropagation()}>
          <input
            bind:this={minutesInput}
            class="time-input"
            type="text"
            inputmode="numeric"
            maxlength={2}
            value={editMinutes}
            oninput={(e) => handleTimeInput(e, 'min')}
            onblur={() => handleTimeBlur('min')}
            onkeydown={handleEditKeydown}
            onfocus={(e) => (e.target as HTMLInputElement).select()}
            style="font-size: {fontSize}px;"
          />
          <span class="time-separator">:</span>
          <input
            class="time-input"
            type="text"
            inputmode="numeric"
            maxlength={2}
            value={editSeconds}
            oninput={(e) => handleTimeInput(e, 'sec')}
            onblur={() => handleTimeBlur('sec')}
            onkeydown={handleEditKeydown}
            onfocus={(e) => (e.target as HTMLInputElement).select()}
            style="font-size: {fontSize}px;"
          />
          <button class="edit-confirm" onclick={confirmEdit} aria-label="Confirm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
      {:else if isTimeout}
        <span class="timeout-text">TIME!</span>
      {:else}
        {display}
      {/if}
    </div>

    <div class="countdown-controls">
      <button
        class="control-btn play-pause"
        onclick={(e) => { e.stopPropagation(); toggleTimer(); }}
        aria-label={running ? 'Pause' : 'Play'}
        disabled={isTimeout && timeRemaining === 0}
      >
        {#if running}
          <Pause size={iconSize} />
        {:else}
          <Play size={iconSize} />
        {/if}
      </button>
      <button
        class="control-btn reset"
        onclick={(e) => { e.stopPropagation(); resetTimer(); }}
        aria-label="Reset timer"
      >
        <RotateCcw size={iconSize} />
      </button>
    </div>

    {#if !isFullscreen}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="resize-handle"
        onmousedown={handleResizeStart}
        ontouchstart={handleResizeStart}
        role="separator"
        aria-label="Resize timer"
        tabindex="-1"
      ></div>
    {/if}
  </div>
{/if}

<style>
  .countdown-overlay {
    position: fixed;
    z-index: 1000;
    background: rgba(15, 18, 28, 0.94);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    cursor: grab;
    touch-action: none;
    user-select: none;
    overflow: hidden;
  }

  .countdown-overlay.fullscreen {
    inset: 0;
    width: 100% !important;
    height: 100% !important;
    border-radius: 0;
    border: none;
    cursor: default;
    z-index: 9998;
    background: rgba(8, 10, 18, 0.98);
  }

  .countdown-overlay.dragging {
    cursor: grabbing;
    opacity: 0.9;
  }

  .countdown-overlay.resizing {
    opacity: 0.95;
  }

  .countdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.3rem 0.4rem 0.3rem 0.6rem;
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.7rem;
    font-weight: 500;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .countdown-title {
    letter-spacing: 0.03em;
    text-transform: uppercase;
    font-size: 0.65rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.35);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .header-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
  }

  .header-btn.close:hover {
    background: rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .countdown-display {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Lexend', monospace;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.95);
    letter-spacing: 0.02em;
    transition: color 0.3s ease;
    line-height: 1;
    padding: 0;
    min-height: 0;
  }

  .edit-time {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .time-input {
    font-family: 'Lexend', monospace;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.95);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    text-align: center;
    width: 2.4ch;
    padding: 0.05em 0.1em;
    line-height: 1;
    -moz-appearance: textfield;
    outline: none;
  }

  .time-input:focus {
    border-color: rgba(102, 126, 234, 0.6);
    background: rgba(102, 126, 234, 0.12);
  }

  .time-separator {
    color: rgba(255, 255, 255, 0.5);
    margin: 0 0.05em;
    font-weight: 700;
  }

  .edit-confirm {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.3em;
    padding: 0.2em;
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 5px;
    color: #4ade80;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .edit-confirm:hover {
    background: rgba(34, 197, 94, 0.35);
    color: #86efac;
  }

  .countdown-display.warning {
    color: #ffb86c;
    animation: dyingLight 3s ease-in-out infinite;
    text-shadow: 0 0 8px rgba(255, 184, 108, 0.3);
  }

  .countdown-display.critical {
    color: #ff6b6b;
    animation: dyingFlicker 1.5s steps(1) infinite;
    text-shadow: 0 0 12px rgba(255, 107, 107, 0.4);
  }

  .countdown-display.timeout {
    color: #ff4444;
  }

  .timeout-text {
    animation: timeoutPulse 1.2s ease-in-out infinite;
    text-shadow: 0 0 30px rgba(255, 68, 68, 0.6), 0 0 60px rgba(255, 68, 68, 0.3);
    letter-spacing: 0.08em;
  }

  /* Warning: gentle dying light - dims and wobbles like low battery */
  @keyframes dyingLight {
    0% { opacity: 1; transform: translate(0, 0); }
    8% { opacity: 0.6; transform: translate(-0.5px, 0); }
    10% { opacity: 0.9; transform: translate(0.5px, 0); }
    20% { opacity: 1; transform: translate(0, 0); }
    45% { opacity: 0.85; transform: translate(0, 0); }
    48% { opacity: 0.5; transform: translate(0.3px, 0.2px); }
    50% { opacity: 0.9; transform: translate(-0.3px, 0); }
    52% { opacity: 1; transform: translate(0, 0); }
    75% { opacity: 0.92; transform: translate(0, 0); }
    100% { opacity: 1; transform: translate(0, 0); }
  }

  /* Critical: erratic flicker like about to die */
  @keyframes dyingFlicker {
    0% { opacity: 1; transform: translate(0, 0); }
    5% { opacity: 0.3; transform: translate(-1px, 0); }
    6% { opacity: 0.9; transform: translate(1px, 0); }
    8% { opacity: 1; transform: translate(0, 0); }
    18% { opacity: 0.4; transform: translate(0.5px, -0.5px); }
    19% { opacity: 0.8; transform: translate(-0.5px, 0); }
    21% { opacity: 1; transform: translate(0, 0); }
    40% { opacity: 1; transform: translate(0, 0); }
    42% { opacity: 0.2; transform: translate(-1px, 0.5px); }
    43% { opacity: 0.7; transform: translate(0.8px, 0); }
    44% { opacity: 0.3; transform: translate(-0.5px, -0.3px); }
    46% { opacity: 1; transform: translate(0, 0); }
    65% { opacity: 0.85; transform: translate(0, 0); }
    67% { opacity: 0.35; transform: translate(0.7px, 0); }
    68% { opacity: 0.9; transform: translate(0, 0); }
    82% { opacity: 1; transform: translate(0, 0); }
    84% { opacity: 0.25; transform: translate(-0.8px, 0.3px); }
    85% { opacity: 0.6; transform: translate(0.5px, -0.2px); }
    87% { opacity: 1; transform: translate(0, 0); }
    100% { opacity: 1; transform: translate(0, 0); }
  }

  @keyframes timeoutPulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.12);
      opacity: 0.6;
    }
  }

  .countdown-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.3rem 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .fullscreen .countdown-controls {
    padding: 1rem;
    gap: 1rem;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.3rem 0.6rem;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .fullscreen .control-btn {
    padding: 0.6rem 1.5rem;
    border-radius: 10px;
  }

  .control-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.95);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .control-btn:active {
    transform: scale(0.95);
  }

  .control-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .control-btn.play-pause {
    background: rgba(102, 126, 234, 0.2);
    border-color: rgba(102, 126, 234, 0.3);
    color: #8ba4f0;
  }

  .control-btn.play-pause:hover {
    background: rgba(102, 126, 234, 0.3);
    color: #a8bef7;
  }

  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    touch-action: none;
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    bottom: 3px;
    right: 3px;
    width: 8px;
    height: 8px;
    border-right: 2px solid rgba(255, 255, 255, 0.2);
    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  }

  .resize-handle:hover::after {
    border-color: rgba(255, 255, 255, 0.4);
  }
</style>
