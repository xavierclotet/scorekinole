<script lang="ts">
  import AdminGuard from '$lib/components/AdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { t } from '$lib/stores/language';
  import { currentUser } from '$lib/firebase/auth';
  import { adminTheme } from '$lib/stores/theme';
  import { isSuperAdminUser } from '$lib/stores/admin';
  import { goto } from '$app/navigation';

  interface AdminSection {
    title: string;
    description: string;
    icon: string;
    path: string;
    gradient: string;
    superAdminOnly?: boolean;
  }

  const allAdminSections: AdminSection[] = [
    {
      title: 'userManagement',
      description: 'manageUsersDesc',
      icon: '👥',
      path: '/admin/users',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      superAdminOnly: true
    },
    {
      title: 'matchManagement',
      description: 'manageMatchesDesc',
      icon: '🎯',
      path: '/admin/matches',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      superAdminOnly: true
    },
    {
      title: 'tournamentManagement',
      description: 'manageTournamentsDesc',
      icon: '🏆',
      path: '/admin/tournaments',
      gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
    }
  ];

  // Filter sections based on superAdmin status
  $: adminSections = allAdminSections.filter(
    section => !section.superAdminOnly || $isSuperAdminUser
  );

  function navigateTo(path: string) {
    goto(path);
  }
</script>

<AdminGuard>
  <div class="admin-container" data-theme={$adminTheme}>
    <header class="admin-header">
      <div class="header-top">
        <button class="back-button" on:click={() => goto('/')}>
          ← {$t('backToHome')}
        </button>
        <div class="theme-toggle-wrapper">
          <ThemeToggle />
        </div>
      </div>
      <div class="header-content">
        <div class="shield-icon">🛡️</div>
        <h1>{$t('adminPanel')}</h1>
        <p class="welcome">{$t('welcome')}, <strong>{$currentUser?.name || 'Admin'}</strong></p>
      </div>
    </header>

    <div class="admin-grid">
      {#each adminSections as section}
        <button
          class="admin-card"
          on:click={() => navigateTo(section.path)}
        >
          <div class="card-background" style="background: {section.gradient}"></div>
          <div class="card-content">
            <div class="icon">{section.icon}</div>
            <h2>{$t(section.title)}</h2>
            <p>{$t(section.description)}</p>
            <div class="arrow">→</div>
          </div>
        </button>
      {/each}
    </div>
  </div>
</AdminGuard>

<style>
  .admin-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem 2rem;
    min-height: 100vh;
    background: #fafafa;
    transition: background-color 0.3s, color 0.3s;
  }

  .admin-container[data-theme='dark'] {
    background: #0f1419;
  }

  .admin-header {
    margin-bottom: 2rem;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .back-button {
    padding: 0.6rem 1.2rem;
    font-size: 0.9rem;
    background: white;
    color: #555;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }

  .admin-container[data-theme='dark'] .back-button {
    background: #1a2332;
    color: #e1e8ed;
    border-color: #2d3748;
  }

  .back-button:hover {
    background: #f5f5f5;
    border-color: #999;
    transform: translateX(-3px);
  }

  .admin-container[data-theme='dark'] .back-button:hover {
    background: #2d3748;
    border-color: #4a5568;
  }

  .theme-toggle-wrapper {
    /* No positioning needed, flex handles it */
  }

  .admin-container[data-theme='dark'] .theme-toggle-wrapper {
    --toggle-bg: rgba(255, 255, 255, 0.05);
    --toggle-color: #fbbf24;
  }

  .admin-container[data-theme='light'] .theme-toggle-wrapper {
    --toggle-bg: white;
    --toggle-color: #3730a3;
  }

  .header-content {
    text-align: center;
  }

  .shield-icon {
    font-size: 3rem;
    margin-bottom: 0.5rem;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
  }

  .admin-header h1 {
    font-size: 1.8rem;
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
    font-weight: 700;
    letter-spacing: -0.5px;
    transition: color 0.3s;
  }

  .admin-container[data-theme='dark'] .admin-header h1 {
    color: #e1e8ed;
  }

  .welcome {
    font-size: 1.05rem;
    color: #666;
    margin: 0;
    transition: color 0.3s;
  }

  .admin-container[data-theme='dark'] .welcome {
    color: #8b9bb3;
  }

  .welcome strong {
    color: #333;
    font-weight: 600;
    transition: color 0.3s;
  }

  .admin-container[data-theme='dark'] .welcome strong {
    color: #e1e8ed;
  }

  .admin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .admin-card {
    position: relative;
    background: white;
    border: none;
    border-radius: 16px;
    padding: 0;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    height: 180px;
    max-width: 340px;
    width: 100%;
    justify-self: center;
  }

  .admin-container[data-theme='dark'] .admin-card {
    background: #1a2332;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .admin-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
  }

  .admin-container[data-theme='dark'] .admin-card:hover {
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.5);
  }

  .admin-card:hover .card-background {
    opacity: 0.95;
  }

  .admin-card:hover .arrow {
    transform: translateX(5px);
  }

  .card-background {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    opacity: 0.9;
    transition: opacity 0.3s;
  }

  .card-content {
    position: relative;
    padding: 1.25rem 1.5rem 1rem;
    text-align: left;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .icon {
    font-size: 2.25rem;
    margin-bottom: 0.35rem;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }

  .admin-card h2 {
    font-size: 1.15rem;
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
    font-weight: 700;
    letter-spacing: -0.3px;
    transition: color 0.3s;
  }

  .admin-container[data-theme='dark'] .admin-card h2 {
    color: #e1e8ed;
  }

  .admin-card p {
    color: #666;
    font-size: 0.85rem;
    line-height: 1.4;
    margin: 0;
    flex: 1;
    transition: color 0.3s;
  }

  .admin-container[data-theme='dark'] .admin-card p {
    color: #8b9bb3;
  }

  .arrow {
    font-size: 1.25rem;
    color: #999;
    align-self: flex-end;
    transition: transform 0.3s, color 0.3s;
    margin-top: 0.5rem;
  }

  .admin-container[data-theme='dark'] .arrow {
    color: #6b7a94;
  }

  /* Landscape orientation - optimize for limited height */
  @media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
    .admin-container {
      padding: 0.75rem 1.5rem;
      min-height: auto;
    }

    .header-top {
      margin-bottom: 0.5rem;
    }

    .back-button {
      padding: 0.4rem 0.8rem;
      font-size: 0.75rem;
    }

    .admin-header {
      margin-bottom: 0.75rem;
    }

    .shield-icon {
      font-size: 1.5rem;
      margin-bottom: 0.25rem;
    }

    .admin-header h1 {
      font-size: 1.2rem;
      margin-bottom: 0.25rem;
    }

    .welcome {
      font-size: 0.75rem;
    }

    .admin-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }

    .admin-card {
      height: 110px;
    }

    .card-background {
      height: 35px;
    }

    .card-content {
      padding: 0.75rem 1rem 0.5rem;
    }

    .icon {
      font-size: 1.5rem;
      margin-bottom: 0.15rem;
    }

    .admin-card h2 {
      font-size: 0.95rem;
      margin-bottom: 0.25rem;
    }

    .admin-card p {
      font-size: 0.7rem;
      line-height: 1.3;
    }

    .arrow {
      font-size: 1rem;
      margin-top: 0.25rem;
    }
  }

  /* Responsive Portrait */
  @media (max-width: 768px) and (orientation: portrait) {
    .admin-container {
      padding: 1rem 1rem;
    }

    .header-top {
      margin-bottom: 1rem;
    }

    .back-button {
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
    }

    .admin-header {
      margin-bottom: 1.5rem;
    }

    .shield-icon {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }

    .admin-header h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .welcome {
      font-size: 0.9rem;
    }

    .admin-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .admin-card {
      height: 160px;
    }

    .card-background {
      height: 60px;
    }

    .card-content {
      padding: 1.25rem 1.25rem 1rem;
    }

    .icon {
      font-size: 2rem;
      margin-bottom: 0.25rem;
    }

    .admin-card h2 {
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
    }

    .admin-card p {
      font-size: 0.85rem;
      line-height: 1.4;
    }

    .arrow {
      font-size: 1.25rem;
      margin-top: 0.5rem;
    }
  }

  @media (max-width: 480px) and (orientation: portrait) {
    .admin-container {
      padding: 0.75rem 0.75rem;
    }

    .back-button {
      padding: 0.45rem 0.9rem;
      font-size: 0.8rem;
    }

    .shield-icon {
      font-size: 2rem;
      margin-bottom: 0.35rem;
    }

    .admin-header h1 {
      font-size: 1.3rem;
      margin-bottom: 0.35rem;
    }

    .welcome {
      font-size: 0.85rem;
    }

    .admin-header {
      margin-bottom: 1rem;
    }

    .admin-card {
      height: 140px;
    }

    .card-background {
      height: 50px;
    }

    .card-content {
      padding: 1rem 1rem 0.75rem;
    }

    .icon {
      font-size: 1.75rem;
    }

    .admin-card h2 {
      font-size: 1rem;
      margin-bottom: 0.4rem;
    }

    .admin-card p {
      font-size: 0.8rem;
    }

    .arrow {
      font-size: 1.1rem;
    }
  }
</style>
