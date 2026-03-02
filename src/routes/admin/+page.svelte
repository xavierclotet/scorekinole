<script lang="ts">
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { currentUser } from '$lib/firebase/auth';
  import { adminTheme } from '$lib/stores/theme';
  import { isSuperAdminUser } from '$lib/stores/admin';
  import { goto } from '$app/navigation';
  import {
    ChevronLeft,
    ChevronRight,
    Users,
    Swords,
    Trophy,
    BarChart3
  } from '@lucide/svelte';

  const allAdminSections = [
    {
      title: m.admin_userManagement,
      description: m.admin_manageUsersDesc,
      Icon: Users,
      path: '/admin/users',
      superAdminOnly: true
    },
    {
      title: m.admin_tournamentManagement,
      description: m.admin_manageTournamentsDesc,
      Icon: Trophy,
      path: '/admin/tournaments'
    },
    {
      title: m.admin_matchManagement,
      description: m.admin_manageMatchesDesc,
      Icon: Swords,
      path: '/admin/matches',
      superAdminOnly: true
    },
    {
      title: m.analytics_title,
      description: m.analytics_description,
      Icon: BarChart3,
      path: '/admin/analytics',
      superAdminOnly: true
    }
  ];

  let adminSections = $derived(allAdminSections.filter(
    section => !section.superAdminOnly || $isSuperAdminUser
  ));

  function navigateTo(path: string) {
    goto(path);
  }
</script>

<AdminGuard>
  <div class="admin-layout" data-theme={$adminTheme}>
    <header class="admin-navbar">
      <nav class="admin-navbar-inner">
        <button
          onclick={() => goto('/')}
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
        <p class="admin-greeting">
          {m.admin_welcome()}, <span class="admin-username">{$currentUser?.name || 'Admin'}</span>
        </p>
        <h1 class="admin-title">{m.admin_panel()}</h1>
      </section>

      <section class="admin-sections">
        {#each adminSections as section}
          <button
            onclick={() => navigateTo(section.path)}
            class="admin-card"
          >
            <div class="admin-card-icon">
              <section.Icon size={22} strokeWidth={1.8} />
            </div>
            <div class="admin-card-body">
              <h2 class="admin-card-title">{section.title()}</h2>
              <p class="admin-card-desc">{section.description()}</p>
            </div>
            <span class="admin-card-chevron">
              <ChevronRight size={18} />
            </span>
          </button>
        {/each}
      </section>
    </main>
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
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 16px 32px;
    gap: 24px;
    overflow-y: auto;
  }

  /* ── Header ── */
  .admin-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .admin-greeting {
    font-size: 13px;
    color: var(--muted-foreground);
    margin: 0;
    font-weight: 400;
  }

  .admin-username {
    font-weight: 600;
    color: var(--primary);
  }

  .admin-title {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--foreground);
    margin: 0;
    line-height: 1.3;
  }

  /* ── Cards ── */
  .admin-sections {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .admin-card {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--card);
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    font-family: inherit;
  }

  .admin-card:hover {
    border-color: color-mix(in srgb, var(--primary) 40%, transparent);
    background: color-mix(in srgb, var(--primary) 4%, var(--card));
  }

  .admin-card:active {
    transform: scale(0.985);
  }

  .admin-card:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  .admin-card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 11px;
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary);
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .admin-card:hover .admin-card-icon {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .admin-card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .admin-card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--foreground);
    margin: 0;
    line-height: 1.3;
    transition: color 0.2s;
  }

  .admin-card:hover .admin-card-title {
    color: var(--primary);
  }

  .admin-card-desc {
    font-size: 13px;
    line-height: 1.4;
    color: var(--muted-foreground);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .admin-card-chevron {
    display: flex;
    align-items: center;
    color: var(--muted-foreground);
    opacity: 0.4;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .admin-card:hover .admin-card-chevron {
    opacity: 1;
    color: var(--primary);
    transform: translateX(2px);
  }

  /* ── Desktop ── */
  @media (min-width: 540px) {
    .admin-navbar-inner {
      padding: 0 24px;
    }

    .admin-back-label {
      display: inline;
    }

    .admin-content {
      padding: 40px 24px 48px;
      gap: 28px;
    }

    .admin-title {
      font-size: 28px;
    }

    .admin-sections {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .admin-card {
      flex-direction: column;
      align-items: flex-start;
      padding: 20px;
      gap: 0;
      min-height: 152px;
    }

    .admin-card-icon {
      margin-bottom: 14px;
    }

    .admin-card-body {
      gap: 4px;
      flex: 1;
    }

    .admin-card-desc {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .admin-card-chevron {
      position: absolute;
      top: 20px;
      right: 18px;
    }
  }
</style>
