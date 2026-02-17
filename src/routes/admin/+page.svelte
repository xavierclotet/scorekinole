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
    Users,
    Swords,
    Trophy,
    Shield,
    ArrowRight
  } from '@lucide/svelte';

  const allAdminSections = [
    {
      title: m.admin_matchManagement,
      description: m.admin_manageMatchesDesc,
      Icon: Swords,
      path: '/admin/matches',
      superAdminOnly: true
    },
    {
      title: m.admin_tournamentManagement,
      description: m.admin_manageTournamentsDesc,
      Icon: Trophy,
      path: '/admin/tournaments'
    },
    {
      title: m.admin_userManagement,
      description: m.admin_manageUsersDesc,
      Icon: Users,
      path: '/admin/users',
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
          <span class="admin-back-label">Back to App</span>
        </button>

        <div class="admin-navbar-actions">
          <ThemeToggle />
        </div>
      </nav>
    </header>

    <main class="admin-content">
      <section class="admin-header">
        <div class="admin-header-badge">
          <Shield size={18} strokeWidth={2.5} />
          <span>Administration</span>
        </div>
        <h1 class="admin-title">{m.admin_panel()}</h1>
        <p class="admin-subtitle">
          {m.admin_welcome()}, <span class="admin-username">{$currentUser?.name || 'Admin'}</span>
        </p>
      </section>

      <section class="admin-sections">
        {#each adminSections as section}
          <button
            onclick={() => navigateTo(section.path)}
            class="admin-card"
          >
            <div class="admin-card-icon">
              <section.Icon size={24} strokeWidth={1.8} />
            </div>
            <h2 class="admin-card-title">{section.title()}</h2>
            <p class="admin-card-desc">{section.description()}</p>
            <span class="admin-card-action">
              <span>Manage</span>
              <ArrowRight size={14} />
            </span>
          </button>
        {/each}
      </section>
    </main>
  </div>
</AdminGuard>

<style>
  .admin-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--background);
    color: var(--foreground);
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* Navbar */
  .admin-navbar {
    position: sticky;
    top: 0;
    z-index: 50;
    width: 100%;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    background: color-mix(in srgb, var(--background) 85%, transparent);
    backdrop-filter: blur(20px);
  }

  .admin-navbar-inner {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
    height: 56px;
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
    background: var(--accent);
  }

  .admin-back-label {
    display: none;
  }

  .admin-navbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* Content */
  .admin-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 48px 24px 64px;
    gap: 48px;
  }

  /* Header */
  .admin-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
  }

  .admin-header-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    margin-bottom: 4px;
  }

  .admin-title {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--foreground);
    margin: 0;
    line-height: 1.2;
  }

  .admin-subtitle {
    font-size: 15px;
    color: var(--muted-foreground);
    margin: 0;
  }

  .admin-username {
    font-weight: 600;
    color: var(--primary);
  }

  /* Cards */
  .admin-sections {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
    width: 100%;
    max-width: 780px;
  }

  .admin-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    max-width: 280px;
    min-height: 200px;
    padding: 24px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--card);
    text-align: left;
    cursor: pointer;
    transition: all 0.25s ease;
    position: relative;
  }

  .admin-card:hover {
    border-color: color-mix(in srgb, var(--primary) 35%, transparent);
    box-shadow:
      0 1px 3px color-mix(in srgb, var(--primary) 6%, transparent),
      0 8px 24px color-mix(in srgb, var(--primary) 8%, transparent);
    transform: translateY(-2px);
  }

  .admin-card:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  .admin-card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary);
    margin-bottom: 16px;
    transition: all 0.25s;
  }

  .admin-card:hover .admin-card-icon {
    background: var(--primary);
    color: var(--primary-foreground);
    transform: scale(1.05);
  }

  .admin-card-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--foreground);
    margin: 0 0 6px;
    transition: color 0.2s;
  }

  .admin-card:hover .admin-card-title {
    color: var(--primary);
  }

  .admin-card-desc {
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted-foreground);
    margin: 0;
    flex: 1;
    line-clamp: 3;
    -webkit-line-clamp: 3;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .admin-card-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 16px;
    font-size: 13px;
    font-weight: 500;
    color: var(--primary);
    opacity: 0;
    transform: translateX(-4px);
    transition: all 0.25s;
  }

  .admin-card:hover .admin-card-action {
    opacity: 1;
    transform: translateX(0);
  }

  /* Responsive */
  @media (min-width: 640px) {
    .admin-navbar-inner {
      padding: 0 32px;
    }

    .admin-back-label {
      display: inline;
    }

    .admin-content {
      padding: 64px 32px 80px;
      gap: 56px;
    }

    .admin-title {
      font-size: 34px;
    }

    .admin-sections {
      gap: 20px;
    }
  }

  @media (max-width: 639px) {
    .admin-card {
      max-width: 100%;
      min-height: auto;
      flex-direction: row;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
    }

    .admin-card-icon {
      margin-bottom: 0;
      width: 44px;
      height: 44px;
      flex-shrink: 0;
    }

    .admin-card-title {
      margin: 0;
    }

    .admin-card-desc {
      display: none;
    }

    .admin-card-action {
      display: none;
    }
  }
</style>
