<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { goto } from '$app/navigation';
  import { adminTheme } from '$lib/stores/theme';
  import { isSuperAdminUser } from '$lib/stores/admin';
  import { currentUser } from '$lib/firebase/auth';
  import {
    getAllVenues,
    getMyVenues,
    deleteVenue,
    deleteVenueAsSuperAdmin,
    getVenueTournamentDependencies,
    mergeVenues
  } from '$lib/firebase/venues';
  import type { Venue } from '$lib/types/venue';
  import { getVenueLocationDisplay } from '$lib/types/venue';
  import {
    ChevronLeft,
    Trash2,
    Merge,
    Search,
    X
  } from '@lucide/svelte';

  let venues = $state<Venue[]>([]);
  let isLoading = $state(true);
  let searchQuery = $state('');

  // Delete modal state
  let venueToDelete = $state<Venue | null>(null);
  let deleteDepLoading = $state(false);
  let deleteDeps = $state<{ id: string; name: string; status: string }[]>([]);
  let isDeleting = $state(false);

  // Merge modal state
  let venueToMerge = $state<Venue | null>(null);
  let mergeTargetId = $state('');
  let mergePreviewCount = $state<number | null>(null);
  let mergePreviewLoading = $state(false);
  let isMerging = $state(false);

  // Toast
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType = $state<'success' | 'error'>('success');

  function normalizeText(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  let filteredVenues = $derived.by(() => {
    if (!searchQuery.trim()) return venues;
    const q = normalizeText(searchQuery);
    return venues.filter(
      (v) =>
        normalizeText(v.name).includes(q) ||
        normalizeText(v.city).includes(q) ||
        (v.address && normalizeText(v.address).includes(q)) ||
        (v.ownerName && normalizeText(v.ownerName).includes(q))
    );
  });

  // Merge target options: all venues except source
  let mergeTargetOptions = $derived.by(() => {
    if (!venueToMerge) return [];
    return venues.filter((v) => v.id !== venueToMerge!.id);
  });

  onMount(() => {
    loadVenues();
  });

  async function loadVenues() {
    isLoading = true;
    try {
      venues = $isSuperAdminUser ? await getAllVenues() : await getMyVenues();
    } catch (error) {
      console.error('Error loading venues:', error);
    } finally {
      isLoading = false;
    }
  }

  // Delete flow
  async function openDeleteModal(venue: Venue) {
    venueToDelete = venue;
    deleteDeps = [];
    deleteDepLoading = true;
    try {
      deleteDeps = await getVenueTournamentDependencies(venue.id);
    } finally {
      deleteDepLoading = false;
    }
  }

  function closeDeleteModal() {
    venueToDelete = null;
    deleteDeps = [];
  }

  async function confirmDelete() {
    if (!venueToDelete || deleteDeps.length > 0) return;
    isDeleting = true;
    try {
      const success = $isSuperAdminUser && venueToDelete.ownerId !== $currentUser?.id
        ? await deleteVenueAsSuperAdmin(venueToDelete.id)
        : await deleteVenue(venueToDelete.id);

      if (success) {
        venues = venues.filter((v) => v.id !== venueToDelete!.id);
        toast(m.admin_venueDeleteSuccess(), 'success');
      } else {
        toast('Error al eliminar', 'error');
      }
    } finally {
      isDeleting = false;
      closeDeleteModal();
    }
  }

  // Merge flow
  async function openMergeModal(venue: Venue) {
    venueToMerge = venue;
    mergeTargetId = '';
    mergePreviewCount = null;
    await loadMergePreview(venue);
  }

  function closeMergeModal() {
    venueToMerge = null;
    mergeTargetId = '';
    mergePreviewCount = null;
  }

  async function loadMergePreview(venue: Venue) {
    mergePreviewLoading = true;
    try {
      const deps = await getVenueTournamentDependencies(venue.id);
      mergePreviewCount = deps.length;
    } finally {
      mergePreviewLoading = false;
    }
  }

  // Preview is loaded when merge modal opens (inside openMergeModal)

  async function confirmMerge() {
    if (!venueToMerge || !mergeTargetId) return;
    isMerging = true;
    try {
      const result = await mergeVenues(venueToMerge.id, mergeTargetId);
      if (result.success) {
        toast(m.admin_venueMergeSuccess({ count: String(result.updatedCount) }), 'success');
        await loadVenues();
      } else {
        toast(result.error || 'Error', 'error');
      }
    } finally {
      isMerging = false;
      closeMergeModal();
    }
  }

  function toast(message: string, type: 'success' | 'error') {
    toastMessage = message;
    toastType = type;
    showToast = true;
    setTimeout(() => (showToast = false), 3000);
  }
</script>

<AdminGuard>
  <div class="admin-layout" data-theme={$adminTheme}>
    <header class="admin-navbar">
      <nav class="admin-navbar-inner">
        <button
          onclick={() => goto('/admin')}
          class="admin-back-btn"
          aria-label={m.admin_backToHome()}
        >
          <span class="admin-back-icon">
            <ChevronLeft size={16} />
          </span>
          <span class="admin-back-label">{m.admin_backToHome()}</span>
        </button>
        <div class="admin-navbar-actions">
          <ThemeToggle />
        </div>
      </nav>
    </header>

    <main class="admin-content">
      <section class="admin-header">
        <h1 class="admin-title">
          {m.admin_venueManagement()}
          {#if !isLoading}
            <span class="count-badge">{filteredVenues.length}</span>
          {/if}
        </h1>
      </section>

      <!-- Search -->
      <div class="search-bar">
        <Search size={16} />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={m.admin_venueSearch()}
          class="search-input"
        />
        {#if searchQuery}
          <button class="search-clear" onclick={() => (searchQuery = '')}>
            <X size={14} />
          </button>
        {/if}
      </div>

      {#if isLoading}
        <div class="loading-container">
          <LoadingSpinner />
        </div>
      {:else if filteredVenues.length === 0}
        <div class="empty-state">
          <p>{searchQuery ? m.venue_noResults() : m.admin_venueNoVenues()}</p>
        </div>
      {:else}
        <div class="venues-table-wrapper">
          <table class="venues-table">
            <thead>
              <tr>
                <th class="col-name">{m.venue_name()}</th>
                <th class="col-location">{m.wizard_city()}</th>
                <th class="col-owner">{m.admin_venueOwner()}</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {#each filteredVenues as venue (venue.id)}
                <tr>
                  <td class="col-name">
                    <span class="venue-name">{venue.name}</span>
                    {#if venue.address}
                      <span class="venue-address">{venue.address}</span>
                    {/if}
                  </td>
                  <td class="col-location">
                    {venue.city}, {venue.country}
                  </td>
                  <td class="col-owner">
                    <span class="owner-name">{venue.ownerName || '—'}</span>
                  </td>
                  <td class="col-actions">
                    <div class="action-buttons">
                      {#if $isSuperAdminUser}
                        <button
                          class="action-btn merge-btn"
                          title={m.admin_venueMergeTitle()}
                          onclick={() => openMergeModal(venue)}
                        >
                          <Merge size={15} />
                        </button>
                      {/if}
                      <button
                        class="action-btn delete-btn"
                        title={m.admin_venueDeleteTitle()}
                        onclick={() => openDeleteModal(venue)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </main>

    <!-- Toast -->
    {#if showToast}
      <div class="toast" class:toast-error={toastType === 'error'}>
        {toastMessage}
      </div>
    {/if}

    <!-- Delete Modal -->
    {#if venueToDelete}
      <div class="modal-overlay" onclick={closeDeleteModal} role="presentation">
        <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && closeDeleteModal()}>
          <h3 class="modal-title">{m.admin_venueDeleteTitle()}</h3>

          <div class="modal-venue-info">
            <strong>{venueToDelete.name}</strong>
            <span>{getVenueLocationDisplay(venueToDelete)}</span>
          </div>

          {#if deleteDepLoading}
            <div class="modal-loading"><LoadingSpinner /></div>
          {:else if deleteDeps.length > 0}
            <div class="modal-warning">
              <p>{m.admin_venueDeleteBlocked()}</p>
              <ul class="dep-list">
                {#each deleteDeps as dep (dep.id)}
                  <li>
                    <span class="dep-name">{dep.name}</span>
                    <span class="dep-status">{dep.status}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {:else}
            <p class="modal-confirm-text">{m.admin_venueDeleteConfirm()}</p>
          {/if}

          <div class="modal-actions">
            <button class="modal-btn cancel" onclick={closeDeleteModal}>
              {m.common_cancel()}
            </button>
            {#if deleteDeps.length === 0 && !deleteDepLoading}
              <button
                class="modal-btn danger"
                onclick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? '...' : m.common_delete()}
              </button>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Merge Modal -->
    {#if venueToMerge}
      <div class="modal-overlay" onclick={closeMergeModal} role="presentation">
        <div class="modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && closeMergeModal()}>
          <h3 class="modal-title">{m.admin_venueMergeTitle()}</h3>

          <div class="merge-section">
            <span class="merge-label">{m.admin_venueMergeSource()}</span>
            <div class="modal-venue-info">
              <strong>{venueToMerge.name}</strong>
              <span>{getVenueLocationDisplay(venueToMerge)}</span>
            </div>
          </div>

          <div class="merge-section">
            <label class="merge-label" for="merge-target-select">{m.admin_venueMergeTarget()}</label>
            <select id="merge-target-select" class="merge-select" bind:value={mergeTargetId}>
              <option value="">—</option>
              {#each mergeTargetOptions as v (v.id)}
                <option value={v.id}>{v.name} — {v.city}, {v.country}</option>
              {/each}
            </select>
          </div>

          {#if mergePreviewCount !== null && !mergePreviewLoading}
            <p class="merge-preview">
              {m.admin_venueMergePreview({ count: String(mergePreviewCount) })}
            </p>
          {/if}

          <div class="modal-actions">
            <button class="modal-btn cancel" onclick={closeMergeModal}>
              {m.common_cancel()}
            </button>
            <button
              class="modal-btn primary"
              onclick={confirmMerge}
              disabled={!mergeTargetId || isMerging}
            >
              {isMerging ? '...' : m.admin_venueMergeConfirm()}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</AdminGuard>

<style>
  .admin-layout {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--background);
    color: var(--foreground);
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* ── Navbar ── */
  .admin-navbar {
    position: sticky;
    top: 0;
    z-index: 50;
    width: 100%;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    background: color-mix(in srgb, var(--background) 85%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .admin-navbar-inner {
    width: 100%;
    padding: 0 16px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .admin-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted-foreground);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s;
  }

  .admin-back-btn:hover {
    color: var(--primary);
  }

  .admin-back-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--background);
    transition: all 0.2s;
  }

  .admin-back-btn:hover .admin-back-icon {
    border-color: color-mix(in srgb, var(--primary) 50%, transparent);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }

  .admin-back-label {
    display: none;
  }

  .admin-navbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Content ── */
  .admin-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    padding: 24px 16px 32px;
    gap: 16px;
    overflow-y: auto;
  }

  /* ── Header ── */
  .admin-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .admin-title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--foreground);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .count-badge {
    font-size: 12px;
    font-weight: 600;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    padding: 2px 8px;
    border-radius: 10px;
    line-height: 1.4;
  }

  /* ── Search ── */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    color: var(--muted-foreground);
    transition: border-color 0.2s;
  }

  .search-bar:focus-within {
    border-color: var(--primary);
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 14px;
    color: var(--foreground);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--muted-foreground);
  }

  .search-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    background: color-mix(in srgb, var(--muted-foreground) 15%, transparent);
    border-radius: 50%;
    color: var(--muted-foreground);
    cursor: pointer;
    padding: 0;
  }

  /* ── Loading / Empty ── */
  .loading-container {
    display: flex;
    justify-content: center;
    padding: 48px 0;
  }

  .empty-state {
    text-align: center;
    padding: 48px 16px;
    color: var(--muted-foreground);
    font-size: 14px;
  }

  /* ── Table ── */
  .venues-table-wrapper {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  .venues-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .venues-table thead {
    background: color-mix(in srgb, var(--muted-foreground) 6%, transparent);
  }

  .venues-table th {
    text-align: left;
    padding: 10px 14px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
    border-bottom: 1px solid var(--border);
  }

  .venues-table td {
    padding: 10px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    vertical-align: middle;
  }

  .venues-table tr:last-child td {
    border-bottom: none;
  }

  .venues-table tr:hover td {
    background: color-mix(in srgb, var(--primary) 3%, transparent);
  }

  .col-name {
    min-width: 140px;
  }

  .venue-name {
    display: block;
    font-weight: 600;
    color: var(--foreground);
  }

  .venue-address {
    display: block;
    font-size: 11px;
    color: var(--muted-foreground);
    margin-top: 1px;
  }

  .col-location {
    color: var(--muted-foreground);
    white-space: nowrap;
  }

  .col-owner {
    color: var(--muted-foreground);
  }

  .owner-name {
    font-size: 12px;
  }

  .col-actions {
    width: 80px;
    text-align: right;
  }

  .action-buttons {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
    padding: 0;
  }

  .action-btn:hover {
    border-color: color-mix(in srgb, var(--primary) 50%, transparent);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 6%, transparent);
  }

  .delete-btn:hover {
    border-color: color-mix(in srgb, var(--destructive) 50%, transparent);
    color: var(--destructive);
    background: color-mix(in srgb, var(--destructive) 6%, transparent);
  }

  /* ── Toast ── */
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--primary);
    color: var(--primary-foreground);
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    z-index: 1000;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    animation: toast-in 0.25s ease;
  }

  .toast-error {
    background: var(--destructive);
    color: var(--destructive-foreground);
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px;
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  }

  .modal-title {
    font-size: 17px;
    font-weight: 700;
    margin: 0;
    color: var(--foreground);
  }

  .modal-venue-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--muted-foreground) 6%, transparent);
    border-radius: 8px;
    font-size: 13px;
    color: var(--muted-foreground);
  }

  .modal-venue-info strong {
    color: var(--foreground);
    font-size: 14px;
  }

  .modal-loading {
    display: flex;
    justify-content: center;
    padding: 12px;
  }

  .modal-warning {
    padding: 12px;
    background: color-mix(in srgb, var(--destructive) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--destructive) 25%, transparent);
    border-radius: 8px;
    font-size: 13px;
    color: var(--destructive);
  }

  .modal-warning p {
    margin: 0 0 8px;
    font-weight: 600;
  }

  .dep-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dep-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    font-size: 12px;
  }

  .dep-name {
    font-weight: 500;
  }

  .dep-status {
    font-size: 10px;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .modal-confirm-text {
    font-size: 14px;
    color: var(--muted-foreground);
    margin: 0;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .modal-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--border);
    transition: all 0.15s;
  }

  .modal-btn.cancel {
    background: var(--background);
    color: var(--muted-foreground);
  }

  .modal-btn.cancel:hover {
    background: color-mix(in srgb, var(--muted-foreground) 8%, transparent);
  }

  .modal-btn.danger {
    background: var(--destructive);
    color: var(--destructive-foreground);
    border-color: var(--destructive);
  }

  .modal-btn.danger:hover:not(:disabled) {
    opacity: 0.9;
  }

  .modal-btn.primary {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .modal-btn.primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .modal-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── Merge-specific ── */
  .merge-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .merge-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted-foreground);
  }

  .merge-select {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    color: var(--foreground);
    font-size: 13px;
  }

  .merge-select:focus {
    outline: none;
    border-color: var(--primary);
  }

  .merge-preview {
    font-size: 13px;
    color: var(--muted-foreground);
    margin: 0;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--primary) 6%, transparent);
    border-radius: 8px;
  }

  /* ── Responsive ── */
  @media (min-width: 540px) {
    .admin-navbar-inner {
      padding: 0 24px;
    }

    .admin-back-label {
      display: inline;
    }

    .admin-content {
      padding: 32px 24px 48px;
    }

    .admin-title {
      font-size: 26px;
    }
  }

  /* ── Mobile table adjustments ── */
  @media (max-width: 600px) {
    .col-owner {
      display: none;
    }

    .venues-table th,
    .venues-table td {
      padding: 8px 10px;
    }
  }
</style>
