<script lang="ts">
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import CountrySelect from '$lib/components/CountrySelect.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { goto } from '$app/navigation';
  import { adminTheme } from '$lib/stores/theme';
  import { isSuperAdminUser, adminCheckLoading } from '$lib/stores/admin';
  import { currentUser } from '$lib/firebase/auth';
  import {
    getAllVenues,
    getMyVenues,
    updateVenue,
    getVenueTournamentDependencies,
    mergeVenues
  } from '$lib/firebase/venues';
  import type { Venue } from '$lib/types/venue';
  import { getVenueLocationDisplay } from '$lib/types/venue';

  let venues = $state<Venue[]>([]);
  let isLoading = $state(true);
  let searchQuery = $state('');

  // Tournament counts per venue
  let venueTournamentCounts = $state<Map<string, number>>(new Map());
  let countsLoading = $state(false);

  // Edit modal state
  let venueToEdit = $state<Venue | null>(null);
  let editName = $state('');
  let editAddress = $state('');
  let editCity = $state('');
  let editCountry = $state('');
  let isSavingEdit = $state(false);

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

  // Can edit this venue? Owner or SuperAdmin
  function canEdit(venue: Venue): boolean {
    if ($isSuperAdminUser) return true;
    return venue.ownerId === $currentUser?.id;
  }

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
      // Load tournament counts in background
      loadTournamentCounts();
    } catch (error) {
      console.error('Error loading venues:', error);
    } finally {
      isLoading = false;
    }
  }

  async function loadTournamentCounts() {
    countsLoading = true;
    const counts = new Map<string, number>();
    try {
      // Load all counts in parallel
      const results = await Promise.all(
        venues.map(async (v) => {
          const deps = await getVenueTournamentDependencies(v.id);
          return { id: v.id, count: deps.length };
        })
      );
      results.forEach((r) => counts.set(r.id, r.count));
      venueTournamentCounts = counts;
    } catch (error) {
      console.error('Error loading tournament counts:', error);
    } finally {
      countsLoading = false;
    }
  }

  // Edit flow
  function openEditModal(venue: Venue) {
    venueToEdit = venue;
    editName = venue.name;
    editAddress = venue.address || '';
    editCity = venue.city;
    editCountry = venue.country;
  }

  function closeEditModal() {
    venueToEdit = null;
  }

  async function saveEdit() {
    if (!venueToEdit || !editName.trim() || !editCity.trim()) return;
    isSavingEdit = true;
    try {
      const success = await updateVenue(venueToEdit.id, {
        name: editName.trim(),
        address: editAddress.trim() || undefined,
        city: editCity.trim(),
        country: editCountry
      });

      if (success) {
        // Update local cache
        venues = venues.map((v) =>
          v.id === venueToEdit!.id
            ? { ...v, name: editName.trim(), address: editAddress.trim() || undefined, city: editCity.trim(), country: editCountry }
            : v
        );
        toast(m.admin_configurationUpdated(), 'success');
        closeEditModal();
      } else {
        toast('Error al guardar', 'error');
      }
    } finally {
      isSavingEdit = false;
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
              <th class="tournaments-col">🏆</th>
              <th class="owner-col hide-small">{m.admin_venueOwner()}</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredVenues as venue (venue.id)}
              <tr class="venue-row" onclick={() => canEdit(venue) && openEditModal(venue)}>
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
                <td class="tournaments-cell">
                  {#if countsLoading}
                    <span class="count-loading">·</span>
                  {:else}
                    {venueTournamentCounts.get(venue.id) ?? 0}
                  {/if}
                </td>
                <td class="owner-cell hide-small">
                  {venue.ownerName || '—'}
                </td>
                <td class="actions-cell">
                  {#if canEdit(venue)}
                    <button
                      class="action-btn edit-btn"
                      onclick={(e) => { e.stopPropagation(); openEditModal(venue); }}
                    >
                      ✏️
                    </button>
                  {/if}
                  {#if $isSuperAdminUser}
                    <button
                      class="action-btn merge-btn"
                      title={m.admin_venueMergeTitle()}
                      onclick={(e) => { e.stopPropagation(); openMergeModal(venue); }}
                    >
                      🔗
                    </button>
                  {/if}
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

  <!-- Edit Modal -->
  {#if venueToEdit}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-overlay" data-theme={$adminTheme} onclick={closeEditModal} onkeydown={(e) => e.key === 'Escape' && closeEditModal()} role="presentation">
      <div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <h3>{m.common_edit()}</h3>

        <div class="edit-form">
          <div class="edit-field">
            <label for="edit-name">{m.venue_name()}</label>
            <input id="edit-name" type="text" bind:value={editName} class="edit-input" maxlength="100" />
          </div>
          <div class="edit-field">
            <label for="edit-address">{m.wizard_address()}</label>
            <input id="edit-address" type="text" bind:value={editAddress} class="edit-input" maxlength="200" />
          </div>
          <div class="edit-row">
            <div class="edit-field">
              <label for="edit-city">{m.wizard_city()}</label>
              <input id="edit-city" type="text" bind:value={editCity} class="edit-input" maxlength="100" />
            </div>
            <div class="edit-field">
              <label for="edit-country">{m.wizard_country()}</label>
              <CountrySelect id="edit-country" bind:value={editCountry} />
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" onclick={closeEditModal}>{m.common_cancel()}</button>
          <button class="btn-primary" onclick={saveEdit} disabled={isSavingEdit || !editName.trim() || !editCity.trim()}>
            {isSavingEdit ? '...' : m.common_save()}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Merge Modal -->
  {#if venueToMerge}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-overlay" data-theme={$adminTheme} onclick={closeMergeModal} onkeydown={(e) => e.key === 'Escape' && closeMergeModal()} role="presentation">
      <div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
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
    cursor: pointer;
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

  .tournaments-col {
    width: 50px;
    text-align: center;
  }

  .tournaments-cell {
    text-align: center;
    font-weight: 500;
  }

  .count-loading {
    opacity: 0.4;
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
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .modal-box {
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

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .modal-box {
    background: #1a2332;
    border: 1px solid #2d3748;
  }

  .modal-box h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #1e293b;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .modal-box h3 {
    color: #f1f5f9;
  }

  /* ── Edit form ── */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .edit-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .edit-field label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #94a3b8;
  }

  .edit-input {
    width: 100%;
    padding: 0.5rem 0.65rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.85rem;
    background: white;
    color: #1e293b;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .edit-input {
    background: #0f172a;
    border-color: #374151;
    color: #e2e8f0;
  }

  .edit-input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .edit-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  /* ── Venue preview ── */
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

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .venue-preview {
    background: #0f172a;
    color: #94a3b8;
  }

  .venue-preview strong {
    color: #1e293b;
    font-size: 0.9rem;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .venue-preview strong {
    color: #f1f5f9;
  }

  /* ── Modal actions ── */
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .btn-cancel,
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

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .btn-cancel {
    background: #1e293b;
    border-color: #374151;
    color: #94a3b8;
  }

  .btn-cancel:hover {
    background: #f1f5f9;
  }

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .btn-cancel:hover {
    background: #334155;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

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

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .merge-select {
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

  .modal-overlay:is([data-theme='dark'], [data-theme='violet']) .merge-preview {
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

    .edit-row {
      grid-template-columns: 1fr;
    }
  }
</style>
