<script lang="ts">
  import { onMount } from 'svelte';
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { adminTheme } from '$lib/stores/theme';
  import { goto } from '$app/navigation';
  import {
    getContactMessagesPaginated,
    markContactMessageRead,
    deleteContactMessage,
    type ContactMessage
  } from '$lib/firebase/admin';
  import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
  import { createRequestSequencer } from '$lib/utils/requestSequencer';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Mail from '@lucide/svelte/icons/mail';
  import MailOpen from '@lucide/svelte/icons/mail-open';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';

  let messages: ContactMessage[] = $state([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = $state(null);
  let hasMore = $state(true);
  let totalCount = $state(0);
  let filter: 'all' | 'unread' | 'read' = $state('unread');
  let expandedId: string | null = $state(null);
  let tableContainer: HTMLElement | null = $state(null);

  const pageSize = 20;

  // Drops out-of-order responses when switching filters quickly
  const seq = createRequestSequencer();

  async function loadInitial() {
    const rid = seq.next();
    loading = true;
    messages = [];
    lastDoc = null;
    const result = await getContactMessagesPaginated(pageSize, null, filter);
    if (!seq.isLatest(rid)) return;
    totalCount = result.totalCount;
    hasMore = result.hasMore;
    lastDoc = result.lastDoc;
    messages = result.messages;
    loading = false;
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    const rid = seq.next();
    loadingMore = true;
    const result = await getContactMessagesPaginated(pageSize, lastDoc, filter);
    loadingMore = false;
    if (!seq.isLatest(rid)) return;
    hasMore = result.hasMore;
    lastDoc = result.lastDoc;
    messages = [...messages, ...result.messages];
  }

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (scrollBottom < 100 && hasMore && !loadingMore) loadMore();
  }

  $effect(() => {
    if (tableContainer && hasMore && !loading && !loadingMore) {
      if (tableContainer.scrollHeight <= tableContainer.clientHeight) loadMore();
    }
  });

  onMount(() => loadInitial());

  function switchFilter(f: 'all' | 'unread' | 'read') {
    filter = f;
    loadInitial();
  }

  async function toggleRead(msg: ContactMessage) {
    await markContactMessageRead(msg.id, !msg.read);
    messages = messages.map((m) => (m.id === msg.id ? { ...m, read: !m.read } : m));
  }

  async function handleDelete(msg: ContactMessage) {
    if (!confirm(`Delete message from ${msg.name}?`)) return;
    await deleteContactMessage(msg.id);
    messages = messages.filter((m) => m.id !== msg.id);
    totalCount = Math.max(0, totalCount - 1);
  }

  function formatDate(ts: any): string {
    if (!ts?.toDate) return '—';
    const d = ts.toDate();
    return d.toLocaleString();
  }
</script>

<AdminGuard>
  <div class="admin-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" onclick={() => goto('/admin')}>←</button>
        <div class="header-main">
          <div class="title-section">
            <h1>Contact Messages</h1>
            <span class="count-badge">{totalCount}</span>
          </div>
        </div>
        <div class="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <div class="filters-row">
        <div class="filter-tabs">
          <button class="filter-tab" class:active={filter === 'unread'} onclick={() => switchFilter('unread')}>Unread</button>
          <button class="filter-tab" class:active={filter === 'all'} onclick={() => switchFilter('all')}>All</button>
          <button class="filter-tab" class:active={filter === 'read'} onclick={() => switchFilter('read')}>Read</button>
        </div>
      </div>
    </header>

    {#if loading}
      <div class="loading-state"><LoadingSpinner /></div>
    {:else if messages.length === 0}
      <div class="empty-state">
        <Mail class="icon" />
        <p>No messages</p>
      </div>
    {:else}
      <div class="table-wrapper" bind:this={tableContainer} onscroll={handleScroll}>
        <table class="admin-table">
          <thead>
            <tr>
              <th class="status-col"></th>
              <th>Name</th>
              <th>Email</th>
              <th class="hide-small">Date</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {#each messages as msg (msg.id)}
              <tr class="msg-row" class:unread={!msg.read} class:expanded={expandedId === msg.id}>
                <td class="status-col">
                  <button class="icon-btn" onclick={() => toggleRead(msg)} title={msg.read ? 'Mark unread' : 'Mark read'}>
                    {#if msg.read}
                      <MailOpen class="size-4 text-muted-foreground" />
                    {:else}
                      <Mail class="size-4 text-primary" />
                    {/if}
                  </button>
                </td>
                <td class="name-col">
                  <div class="name">{msg.name}</div>
                </td>
                <td class="email-col">
                  <a href="mailto:{msg.email}" class="email-link">{msg.email}</a>
                </td>
                <td class="date-col hide-small">{formatDate(msg.createdAt)}</td>
                <td class="actions-col">
                  <button class="icon-btn" onclick={() => expandedId = expandedId === msg.id ? null : msg.id} title="Expand">
                      {#if expandedId === msg.id}
                        <ChevronUp class="size-4" />
                      {:else}
                        <ChevronDown class="size-4" />
                      {/if}
                    </button>
                  <button class="icon-btn danger" onclick={() => handleDelete(msg)} title="Delete">
                    <Trash2 class="size-4" />
                  </button>
                </td>
              </tr>
              {#if expandedId === msg.id}
                <tr class="msg-detail-row">
                  <td colspan="5">
                    <div class="msg-detail">
                      <div class="msg-meta">
                        <span class="msg-label">{msg.email}</span>
                        <span class="msg-label">{formatDate(msg.createdAt)}</span>
                        <span class="msg-label">IP: {msg.ip}</span>
                      </div>
                      <div class="msg-body">{msg.message}</div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
        {#if loadingMore}
          <div class="loading-more"><LoadingSpinner /></div>
        {/if}
      </div>
    {/if}
  </div>
</AdminGuard>

<style>
  .admin-container {
    min-height: 100vh;
    background: var(--background);
    color: var(--foreground);
    display: flex;
    flex-direction: column;
  }

  .page-header {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .back-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.25rem 0.5rem;
    font-size: 1rem;
    cursor: pointer;
    color: var(--foreground);
  }

  .back-btn:hover { background: var(--accent); }

  .header-main { flex: 1; }

  .title-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .title-section h1 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  .count-badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-foreground);
    font-weight: 600;
  }

  .header-actions { display: flex; align-items: center; gap: 0.5rem; }

  .filters-row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .filter-tabs {
    display: flex;
    gap: 0.25rem;
    background: color-mix(in srgb, var(--foreground) 5%, transparent);
    border-radius: 8px;
    padding: 0.2rem;
  }

  .filter-tab {
    padding: 0.35rem 0.75rem;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    color: var(--muted-foreground);
    transition: all 0.15s;
  }

  .filter-tab.active {
    background: var(--background);
    color: var(--foreground);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .table-wrapper {
    flex: 1;
    overflow-y: auto;
    padding: 0 1.25rem;
  }

  .admin-table {
    width: 100%;
    border-collapse: collapse;
  }

  .admin-table th {
    text-align: left;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding: 0.75rem 0.5rem;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--background);
  }

  .msg-row td {
    padding: 0.5rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.875rem;
    vertical-align: middle;
  }

  .msg-row.unread td {
    font-weight: 600;
  }

  .msg-row:hover td {
    background: color-mix(in srgb, var(--primary) 4%, transparent);
  }

  .status-col { width: 2.5rem; text-align: center; }
  .actions-col { width: 5rem; text-align: right; white-space: nowrap; }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .icon-btn:hover { background: var(--accent); color: var(--foreground); }
  .icon-btn.danger:hover { background: color-mix(in srgb, #ef4444 15%, transparent); color: #ef4444; }

  .name { font-weight: 500; }

  .email-link {
    color: var(--primary);
    text-decoration: none;
    font-size: 0.8rem;
  }

  .email-link:hover { text-decoration: underline; }

  .date-col { font-size: 0.8rem; color: var(--muted-foreground); }

  .hide-small { display: none; }

  @media (min-width: 640px) {
    .hide-small { display: table-cell; }
  }

  .msg-detail-row td {
    padding: 0 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  .msg-detail {
    padding: 0.75rem;
    background: color-mix(in srgb, var(--foreground) 3%, transparent);
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .msg-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--muted-foreground);
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .msg-body {
    font-size: 0.875rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 4rem 2rem;
    color: var(--muted-foreground);
    gap: 1rem;
  }

  /* Lucide renders inside a child component, so the class we pass never gets
     this component's scope hash — needs :global() anchored to an ancestor. */
  .empty-state :global(.icon) {
    width: 3rem;
    height: 3rem;
    opacity: 0.4;
  }

  .empty-state p {
    font-size: 1rem;
    margin: 0;
  }

  .loading-more {
    display: flex;
    justify-content: center;
    padding: 1rem;
  }
</style>
