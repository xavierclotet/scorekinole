<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { goto } from '$app/navigation';
  import { adminTheme } from '$lib/stores/theme';
  import { isSuperAdminUser, adminCheckLoading } from '$lib/stores/admin';
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

  // Wait for admin state to be ready before loading venues
  $effect(() => {
    if (!$adminCheckLoading) {
      loadVenues();
    }
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
  <div class="venues-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" onclick={() => goto('/admin')}>←</button>
        <div class="header-main">
          <div class="title-section">
            <h1>{m.admin_venueManagement()}</h1>
            {#if !isLoading}
              <span class="count-badge">{filteredVenues.length}</span>
            {/if}
          </div>
        </div>
        <div class="header-actions">
          <ThemeToggle />
        </div>
      </div>
    </header>

    <div class="controls-section">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={m.admin_venueSearch()}
          class="search-input"
        />
      </div>
    </div>

    {#if isLoading}
      <LoadingSpinner />
    {:else if filteredVenues.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📍</div>
        <h3>{searchQuery ? m.venue_noResults() : m.admin_venueNoVenues()}</h3>
      </div>
    {:else}
      <div class="table-container">
        <table class="venues-table">
          <thead>
            <tr>
              <th class="name-col">{m.venue_name()}</th>
              <th class="location-col">{m.wizard_city()}</th>
              <th class="owner-col hide-small">{m.admin_venueOwner()}</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredVenues as venue (venue.id)}
              <tr class="venue-row">
                <td class="name-cell">
                  <div class="venue-info">
                    <strong class="venue-name">{venue.name}</strong>
                    {#if venue.address}
                      <small class="venue-address">{venue.address}</small>
                    {/if}
                  </div>
                </td>
                <td class="location-cell">
                  {venue.city}, {venue.country}
                </td>
                <td class="owner-cell hide-small">
                  {venue.ownerName || '—'}
                </td>
                <td class="actions-cell">
                  {#if $isSuperAdminUser}
                    <button
                      class="action-btn merge-btn"
                      title={m.admin_venueMergeTitle()}
                      onclick={(e) => { e.stopPropagation(); openMergeModal(venue); }}
                    >
                      🔗
                    </button>
                  {/if}
                  <button
                    class="action-btn delete-btn"
                    title={m.admin_venueDeleteTitle()}
                    onclick={(e) => { e.stopPropagation(); openDeleteModal(venue); }}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- Toast -->
  {#if showToast}
    <div class="toast-notification" class:toast-error={toastType === 'error'} data-theme={$adminTheme}>
      {toastMessage}
    </div>
  {/if}

  <!-- Delete Modal -->
  {#if venueToDelete}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="delete-overlay" data-theme={$adminTheme} onclick={closeDeleteModal} onkeydown={(e) => e.key === 'Escape' && closeDeleteModal()} role="presentation">
      <div class="delete-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h3>{m.admin_venueDeleteTitle()}</h3>

        <div class="venue-preview">
          <strong>{venueToDelete.name}</strong>
          <span>{getVenueLocationDisplay(venueToDelete)}</span>
        </div>

        {#if deleteDepLoading}
          <div class="deps-loading">
            <span class="loading-spinner-small"></span>
          </div>
        {:else if deleteDeps.length > 0}
          <div class="deps-warning">
            <p>{m.admin_venueDeleteBlocked()}</p>
            <ul class="deps-list">
              {#each deleteDeps as dep (dep.id)}
                <li>
                  <span class="dep-name">{dep.name}</span>
                  <span class="dep-status">{dep.status}</span>
                </li>
              {/each}
            </ul>
          </div>
        {:else}
          <p class="confirm-text">{m.admin_venueDeleteConfirm()}</p>
        {/if}

        <div class="modal-actions">
          <button class="btn-cancel" onclick={closeDeleteModal}>{m.common_cancel()}</button>
          {#if deleteDeps.length === 0 && !deleteDepLoading}
            <button class="btn-danger" onclick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? '...' : m.common_delete()}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Merge Modal -->
  {#if venueToMerge}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="delete-overlay" data-theme={$adminTheme} onclick={closeMergeModal} onkeydown={(e) => e.key === 'Escape' && closeMergeModal()} role="presentation">
      <div class="delete-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h3>{m.admin_venueMergeTitle()}</h3>

        <div class="merge-section">
          <span class="merge-label">{m.admin_venueMergeSource()}</span>
          <div class="venue-preview">
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
          <button class="btn-cancel" onclick={closeMergeModal}>{m.common_cancel()}</button>
          <button class="btn-primary" onclick={confirmMerge} disabled={!mergeTargetId || isMerging}>
            {isMerging ? '...' : m.admin_venueMergeConfirm()}
          </button>
        </div>
      </div>
    </div>
  {/if}
</AdminGuard>

<style>
  /* ── Container ── */
  .venues-container {
    padding: 1.5rem 2rem;
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) {
    background: #0f1419;
  }

  /* ── Header ── */
  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem 1.5rem;
    margin: -1.5rem -2rem 1.5rem -2rem;
    transition: background-color 0.3s, border-color 0.3s;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .page-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .back-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #555;
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .back-btn {
    background: #1e293b;
    border-color: #374151;
    color: #94a3b8;
  }

  .back-btn:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .back-btn:hover {
    background: #334155;
    border-color: #4b5563;
  }

  .header-main {
    flex: 1;
    min-width: 0;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .title-section h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #1e293b;
    transition: color 0.3s;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .title-section h1 {
    color: #f1f5f9;
  }

  .count-badge {
    background: #e0f2fe;
    color: #0369a1;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15rem 0.55rem;
    border-radius: 10px;
    transition: all 0.3s;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .count-badge {
    background: #1e3a5f;
    color: #7dd3fc;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* ── Controls ── */
  .controls-section {
    margin-bottom: 1rem;
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .search-box {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    transition: all 0.2s;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .search-box {
    background: #1e293b;
    border-color: #374151;
  }

  .search-box:focus-within {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .search-icon {
    font-size: 0.85rem;
    opacity: 0.5;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 0.85rem;
    color: #1e293b;
    outline: none;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .search-input {
    color: #e2e8f0;
  }

  .search-input::placeholder {
    color: #94a3b8;
  }

  /* ── Empty state ── */
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: #94a3b8;
  }

  .empty-icon {
    font-size: 2.5rem;
    margin-bottom: 0.75rem;
  }

  .empty-state h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    color: #64748b;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .empty-state h3 {
    color: #94a3b8;
  }

  /* ── Table ── */
  .table-container {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
    transition: all 0.3s;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .table-container {
    background: #1a2332;
    border-color: #2d3748;
  }

  .venues-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .venues-table thead {
    background: #f8fafc;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .venues-table thead {
    background: #1e293b;
  }

  .venues-table th {
    text-align: left;
    padding: 0.65rem 1rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    border-bottom: 1px solid #e5e7eb;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .venues-table th {
    color: #64748b;
    border-color: #2d3748;
  }

  .venues-table td {
    padding: 0.65rem 1rem;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
    color: #475569;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .venues-table td {
    border-color: #1e293b;
    color: #cbd5e1;
  }

  .venue-row {
    transition: background 0.15s;
    cursor: default;
  }

  .venue-row:hover {
    background: #f8fafc;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .venue-row:hover {
    background: #1e293b;
  }

  .venue-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .venue-name {
    color: #1e293b;
    font-size: 0.85rem;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .venue-name {
    color: #f1f5f9;
  }

  .venue-address {
    color: #94a3b8;
    font-size: 0.75rem;
  }

  .name-col {
    min-width: 140px;
  }

  .actions-col {
    width: 80px;
    text-align: right;
  }

  .actions-cell {
    text-align: right;
    white-space: nowrap;
  }

  .action-btn {
    padding: 0.3rem 0.45rem;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
    font-size: 0.85rem;
    transition: all 0.15s;
    opacity: 0.6;
  }

  .action-btn:hover {
    opacity: 1;
    background: #f1f5f9;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .action-btn:hover {
    background: #334155;
  }

  .delete-btn:hover {
    background: #fef2f2;
  }

  .venues-container:is([data-theme='dark'], [data-theme='violet']) .delete-btn:hover {
    background: #3b1c1c;
  }

  /* ── Toast ── */
  .toast-notification {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #10b981;
    color: white;
    padding: 0.6rem 1.25rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 500;
    z-index: 1000;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    animation: toast-in 0.25s ease;
  }

  .toast-error {
    background: #ef4444;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* ── Modal overlay ── */
  .delete-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .delete-modal {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .delete-modal {
    background: #1a2332;
    border: 1px solid #2d3748;
  }

  .delete-modal h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #1e293b;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .delete-modal h3 {
    color: #f1f5f9;
  }

  .venue-preview {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0.65rem 0.75rem;
    background: #f8fafc;
    border-radius: 8px;
    font-size: 0.85rem;
    color: #64748b;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .venue-preview {
    background: #0f172a;
    color: #94a3b8;
  }

  .venue-preview strong {
    color: #1e293b;
    font-size: 0.9rem;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .venue-preview strong {
    color: #f1f5f9;
  }

  .deps-loading {
    display: flex;
    justify-content: center;
    padding: 0.75rem;
  }

  .loading-spinner-small {
    width: 20px;
    height: 20px;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .deps-warning {
    padding: 0.75rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    font-size: 0.85rem;
    color: #dc2626;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .deps-warning {
    background: #3b1c1c;
    border-color: #7f1d1d;
    color: #fca5a5;
  }

  .deps-warning p {
    margin: 0 0 0.5rem;
    font-weight: 600;
  }

  .deps-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .deps-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
    font-size: 0.8rem;
  }

  .dep-name {
    font-weight: 500;
  }

  .dep-status {
    font-size: 0.65rem;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .confirm-text {
    font-size: 0.9rem;
    color: #64748b;
    margin: 0;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .confirm-text {
    color: #94a3b8;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .btn-cancel,
  .btn-danger,
  .btn-primary {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid #e5e7eb;
    transition: all 0.15s;
  }

  .btn-cancel {
    background: white;
    color: #64748b;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .btn-cancel {
    background: #1e293b;
    border-color: #374151;
    color: #94a3b8;
  }

  .btn-cancel:hover {
    background: #f1f5f9;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .btn-cancel:hover {
    background: #334155;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
    border-color: #ef4444;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-danger:disabled,
  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── Merge-specific ── */
  .merge-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .merge-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #94a3b8;
  }

  .merge-select {
    width: 100%;
    padding: 0.5rem 0.65rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    color: #1e293b;
    font-size: 0.85rem;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .merge-select {
    background: #0f172a;
    border-color: #374151;
    color: #e2e8f0;
  }

  .merge-select:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .merge-preview {
    font-size: 0.85rem;
    color: #64748b;
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: #eff6ff;
    border-radius: 6px;
  }

  .delete-overlay:is([data-theme='dark'], [data-theme='violet']) .merge-preview {
    background: #1e3a5f;
    color: #93c5fd;
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .venues-container {
      padding: 1rem;
    }

    .page-header {
      margin: -1rem -1rem 1rem -1rem;
      padding: 0.65rem 1rem;
    }

    .hide-small {
      display: none;
    }

    .venues-table th,
    .venues-table td {
      padding: 0.5rem 0.65rem;
    }
  }
</style>
