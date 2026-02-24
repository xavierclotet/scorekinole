<script lang="ts">
  import SuperAdminGuard from '$lib/components/SuperAdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import ChartWrapper from '$lib/components/charts/ChartWrapper.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { goto } from '$app/navigation';
  import { adminTheme, theme } from '$lib/stores/theme';
  import { currentUser } from '$lib/firebase/auth';
  import { getPageViewsPaginated, getDailyStats } from '$lib/firebase/pageViews';
  import { TRACKED_ROUTES, type PageView, type PageViewDailyStats } from '$lib/types/pageView';
  import { getChartColors, getBaseChartOptions } from '$lib/utils/chartTheme';
  import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
  import {
    Chart,
    ArcElement,
    Tooltip,
    Legend,
    DoughnutController,
    LineController,
    LineElement,
    PointElement,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Filler,
    type Plugin
  } from 'chart.js';
  import {
    ArrowLeft,
    Eye,
    Monitor,
    Smartphone,
    Tablet,
    Globe,
    CircleAlert
  } from '@lucide/svelte';

  Chart.register(
    ArcElement, Tooltip, Legend, DoughnutController,
    LineController, LineElement, PointElement,
    BarController, BarElement,
    CategoryScale, LinearScale, Filler
  );

  // State
  let pageViews: PageView[] = $state([]);
  let dailyStats: PageViewDailyStats[] = $state([]);
  let isLoading = $state(true);
  let isLoadingMore = $state(false);
  let isLoadingCharts = $state(true);
  let errorMessage = $state('');
  const pageSize = 20;

  // Pagination
  let totalCount = $state(0);
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = $state(null);
  let hasMore = $state(true);
  let tableContainer: HTMLElement | null = $state(null);

  // Filters
  let routeFilter = $state('all');
  let periodFilter: 'today' | '7d' | '30d' = $state('30d');

  // Date computation from period
  let dateRange = $derived((() => {
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let from: Date;
    if (periodFilter === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (periodFilter === '7d') {
      from = new Date(to);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
    } else {
      from = new Date(to);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
    }
    return { from, to };
  })());

  let dateFromStr = $derived(dateRange.from.toISOString().split('T')[0]);
  let dateToStr = $derived(dateRange.to.toISOString().split('T')[0]);

  // Summary stats derived from dailyStats
  let todayViews = $derived((() => {
    const today = new Date().toISOString().split('T')[0];
    return dailyStats.find(s => s.date === today)?.totalViews || 0;
  })());

  let weekViews = $derived((() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    return dailyStats
      .filter(s => s.date >= weekAgoStr)
      .reduce((sum, s) => sum + (s.totalViews || 0), 0);
  })());

  let monthViews = $derived(
    dailyStats.reduce((sum, s) => sum + (s.totalViews || 0), 0)
  );

  let uniqueSessionsCount = $derived((() => {
    const sessions = new Set(pageViews.map(pv => pv.sessionId));
    return sessions.size;
  })());

  // Chart data derived from dailyStats
  let lineChartLabels = $derived(dailyStats.map(s => {
    const d = new Date(s.date + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }));

  let lineChartValues = $derived(dailyStats.map(s => s.totalViews || 0));

  let topPagesData = $derived((() => {
    const totals: Record<string, number> = {};
    for (const s of dailyStats) {
      if (s.viewsByPath) {
        for (const [pathKey, count] of Object.entries(s.viewsByPath)) {
          const path = pathKey.replace(/_/g, '/').replace(/^\/\//, '/') || '/';
          totals[path] = (totals[path] || 0) + (count || 0);
        }
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  })());

  let deviceTotals = $derived((() => {
    const totals: Record<string, number> = { mobile: 0, tablet: 0, desktop: 0 };
    for (const s of dailyStats) {
      if (s.viewsByDevice) {
        for (const [device, count] of Object.entries(s.viewsByDevice)) {
          totals[device] = (totals[device] || 0) + (count || 0);
        }
      }
    }
    return totals;
  })());

  let platformTotals = $derived((() => {
    const totals: Record<string, number> = { web: 0, android: 0, ios: 0 };
    for (const s of dailyStats) {
      if (s.viewsByPlatform) {
        for (const [platform, count] of Object.entries(s.viewsByPlatform)) {
          totals[platform] = (totals[platform] || 0) + (count || 0);
        }
      }
    }
    return totals;
  })());

  let topUsersData = $derived((() => {
    const totals: Record<string, number> = {};
    const names: Record<string, string> = {};
    for (const s of dailyStats) {
      if (s.viewsByUser) {
        for (const [userKey, count] of Object.entries(s.viewsByUser)) {
          totals[userKey] = (totals[userKey] || 0) + (count || 0);
        }
      }
      if (s.userNames) {
        for (const [userKey, name] of Object.entries(s.userNames)) {
          names[userKey] = name;
        }
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => [names[key] || key, count] as [string, number]);
  })());

  // Chart keys for theme reactivity
  let lineChartKey = $derived(`line-${$theme}-${dailyStats.length}-${periodFilter}`);
  let barChartKey = $derived(`bar-${$theme}-${topPagesData.length}-${periodFilter}`);
  let deviceChartKey = $derived(`device-${$theme}-${JSON.stringify(deviceTotals)}`);
  let platformChartKey = $derived(`platform-${$theme}-${JSON.stringify(platformTotals)}`);
  let usersChartKey = $derived(`users-${$theme}-${topUsersData.length}-${periodFilter}`);

  // Auth-gated load
  let initialLoadDone = false;

  $effect(() => {
    if ($currentUser && !initialLoadDone) {
      initialLoadDone = true;
      loadData();
    }
  });

  // Reload when filters change
  $effect(() => {
    // Access reactive values to trigger
    const _period = periodFilter;
    const _route = routeFilter;
    if (initialLoadDone) {
      loadData();
    }
  });

  // Auto-load more if container doesn't have scroll
  $effect(() => {
    if (tableContainer && hasMore && !isLoading && !isLoadingMore) {
      if (tableContainer.scrollHeight <= tableContainer.clientHeight) {
        loadMore();
      }
    }
  });

  async function loadData() {
    isLoading = true;
    isLoadingCharts = true;
    errorMessage = '';
    pageViews = [];
    lastDoc = null;

    try {
      const filters = {
        dateFrom: dateRange.from.getTime(),
        dateTo: dateRange.to.getTime(),
        normalizedPath: routeFilter !== 'all' ? routeFilter : undefined
      };

      const [viewsResult, statsResult] = await Promise.all([
        getPageViewsPaginated(pageSize, null, filters),
        getDailyStats(dateFromStr, dateToStr)
      ]);

      totalCount = viewsResult.totalCount;
      hasMore = viewsResult.hasMore;
      lastDoc = viewsResult.lastDoc;
      pageViews = viewsResult.pageViews;
      dailyStats = statsResult;
    } catch (error) {
      console.error('Error loading analytics:', error);
      errorMessage = 'Failed to load analytics data';
    } finally {
      isLoading = false;
      isLoadingCharts = false;
    }
  }

  async function loadMore() {
    if (isLoadingMore || !hasMore) return;
    isLoadingMore = true;
    try {
      const filters = {
        dateFrom: dateRange.from.getTime(),
        dateTo: dateRange.to.getTime(),
        normalizedPath: routeFilter !== 'all' ? routeFilter : undefined
      };
      const result = await getPageViewsPaginated(pageSize, lastDoc, filters);
      hasMore = result.hasMore;
      lastDoc = result.lastDoc;
      pageViews = [...pageViews, ...result.pageViews];
    } catch (error) {
      console.error('Error loading more:', error);
    } finally {
      isLoadingMore = false;
    }
  }

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (scrollBottom < 100 && hasMore && !isLoadingMore) {
      loadMore();
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    });
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatPath(path: string): string {
    if (path === '/') return 'Home';
    return path;
  }

  // Chart init functions
  function initLineChart(canvas: HTMLCanvasElement) {
    const colors = getChartColors();
    const baseOpts = getBaseChartOptions(colors);

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: lineChartLabels,
        datasets: [{
          data: lineChartValues,
          borderColor: colors.primary,
          backgroundColor: `${colors.primary}20`,
          fill: true,
          tension: 0.3,
          pointRadius: lineChartValues.length > 14 ? 0 : 3,
          pointHoverRadius: 5,
          borderWidth: 2
        }]
      },
      options: {
        ...baseOpts,
        plugins: {
          ...baseOpts.plugins,
          legend: { display: false },
          tooltip: {
            ...baseOpts.plugins.tooltip,
            callbacks: {
              label: (ctx: any) => ` ${ctx.raw} ${m.analytics_pageViews().toLowerCase()}`
            }
          }
        },
        scales: {
          ...baseOpts.scales,
          y: {
            ...baseOpts.scales.y,
            beginAtZero: true,
            ticks: {
              ...baseOpts.scales.y.ticks,
              stepSize: 1,
              callback: (val: any) => Number.isInteger(val) ? val : ''
            }
          }
        }
      }
    });

    return { destroy() { chart.destroy(); } };
  }

  function initBarChart(canvas: HTMLCanvasElement) {
    const colors = getChartColors();
    const baseOpts = getBaseChartOptions(colors);

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: topPagesData.map(([path]) => formatPath(path)),
        datasets: [{
          data: topPagesData.map(([, count]) => count),
          backgroundColor: `${colors.primary}60`,
          borderColor: colors.primary,
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        ...baseOpts,
        indexAxis: 'y' as const,
        plugins: {
          ...baseOpts.plugins,
          legend: { display: false }
        },
        scales: {
          x: {
            ...baseOpts.scales.x,
            beginAtZero: true,
            ticks: {
              ...baseOpts.scales.x.ticks,
              stepSize: 1,
              callback: (val: any) => Number.isInteger(val) ? val : ''
            }
          },
          y: {
            ...baseOpts.scales.y,
            ticks: {
              ...baseOpts.scales.y.ticks,
              font: { size: 10 }
            }
          }
        }
      }
    });

    return { destroy() { chart.destroy(); } };
  }

  function initUsersChart(canvas: HTMLCanvasElement) {
    const colors = getChartColors();
    const baseOpts = getBaseChartOptions(colors);

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: topUsersData.map(([name]) => name),
        datasets: [{
          data: topUsersData.map(([, count]) => count),
          backgroundColor: '#10b98160',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        ...baseOpts,
        indexAxis: 'y' as const,
        plugins: {
          ...baseOpts.plugins,
          legend: { display: false }
        },
        scales: {
          x: {
            ...baseOpts.scales.x,
            beginAtZero: true,
            ticks: {
              ...baseOpts.scales.x.ticks,
              stepSize: 1,
              callback: (val: any) => Number.isInteger(val) ? val : ''
            }
          },
          y: {
            ...baseOpts.scales.y,
            ticks: {
              ...baseOpts.scales.y.ticks,
              font: { size: 10 }
            }
          }
        }
      }
    });

    return { destroy() { chart.destroy(); } };
  }

  function initDonutChart(canvas: HTMLCanvasElement, dataMap: Record<string, number>, labelMap: Record<string, string>) {
    const colors = getChartColors();
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    const entries = Object.entries(dataMap).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0);

    const centerTextPlugin: Plugin<'doughnut'> = {
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const c = getChartColors();
        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerY = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 1.25rem system-ui, sans-serif';
        ctx.fillStyle = c.foreground;
        ctx.fillText(String(total), centerX, centerY);
        ctx.restore();
      }
    };

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => labelMap[k] || k),
        datasets: [{
          data: entries.map(([, v]) => v),
          backgroundColor: entries.map((_, i) => palette[i % palette.length]),
          borderColor: colors.card,
          borderWidth: 2,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: colors.mutedForeground,
              font: { size: 11 },
              padding: 10,
              usePointStyle: true,
              pointStyleWidth: 8,
              boxHeight: 8
            }
          },
          tooltip: {
            backgroundColor: colors.card,
            titleColor: colors.foreground,
            bodyColor: colors.foreground,
            borderColor: colors.border,
            borderWidth: 1,
            padding: 8,
            cornerRadius: 6,
            callbacks: {
              label(ctx: any) {
                const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
              }
            }
          }
        }
      },
      plugins: [centerTextPlugin]
    });

    return { destroy() { chart.destroy(); } };
  }

  function initDeviceChart(canvas: HTMLCanvasElement) {
    return initDonutChart(canvas, deviceTotals, {
      mobile: m.analytics_mobile(),
      tablet: m.analytics_tablet(),
      desktop: m.analytics_desktop()
    });
  }

  function initPlatformChart(canvas: HTMLCanvasElement) {
    return initDonutChart(canvas, platformTotals, {
      web: 'Web',
      android: 'Android',
      ios: 'iOS'
    });
  }
</script>

<SuperAdminGuard>
  <div class="analytics-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" onclick={() => goto('/admin')}>
          <ArrowLeft size={16} />
        </button>
        <div class="header-main">
          <div class="title-section">
            <h1>{m.analytics_title()}</h1>
            <span class="count-badge">{totalCount}</span>
          </div>
        </div>
        <div class="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <div class="filters-row">
        <div class="period-tabs">
          <button class="period-tab" class:active={periodFilter === 'today'} onclick={() => (periodFilter = 'today')}>
            {m.analytics_today()}
          </button>
          <button class="period-tab" class:active={periodFilter === '7d'} onclick={() => (periodFilter = '7d')}>
            {m.analytics_last7days()}
          </button>
          <button class="period-tab" class:active={periodFilter === '30d'} onclick={() => (periodFilter = '30d')}>
            {m.analytics_last30days()}
          </button>
        </div>

        <select bind:value={routeFilter} class="route-filter">
          <option value="all">{m.analytics_allRoutes()}</option>
          {#each TRACKED_ROUTES as route (route)}
            <option value={route}>{route}</option>
          {/each}
        </select>
      </div>
    </header>

    <div class="scroll-content" bind:this={tableContainer} onscroll={handleScroll}>
    {#if isLoading}
      <LoadingSpinner message={m.common_loading()} />
    {:else if errorMessage}
      <div class="error-box">
        <CircleAlert size={40} class="error-icon-svg" />
        <h3>{m.common_error()}</h3>
        <p>{errorMessage}</p>
      </div>
    {:else}
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-value">{todayViews}</span>
          <span class="stat-label">{m.analytics_today()}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{weekViews}</span>
          <span class="stat-label">{m.analytics_thisWeek()}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{monthViews}</span>
          <span class="stat-label">{m.analytics_thisMonth()}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{uniqueSessionsCount}</span>
          <span class="stat-label">{m.analytics_uniqueSessions()}</span>
        </div>
      </div>

      <div class="charts-grid">
        <ChartWrapper title={m.analytics_visitsOverTime()} hasData={lineChartValues.length > 0} isLoading={isLoadingCharts}>
          {#key lineChartKey}
            <canvas use:initLineChart></canvas>
          {/key}
        </ChartWrapper>

        <ChartWrapper title={m.analytics_topPages()} hasData={topPagesData.length > 0} isLoading={isLoadingCharts} autoHeight={true}>
          {#key barChartKey}
            <canvas use:initBarChart style="min-height: {Math.max(120, topPagesData.length * 28)}px"></canvas>
          {/key}
        </ChartWrapper>

        <ChartWrapper title={m.analytics_topUsers()} hasData={topUsersData.length > 0} isLoading={isLoadingCharts} autoHeight={true}>
          {#key usersChartKey}
            <canvas use:initUsersChart style="min-height: {Math.max(120, topUsersData.length * 28)}px"></canvas>
          {/key}
        </ChartWrapper>

        <ChartWrapper title={m.analytics_deviceBreakdown()} hasData={Object.values(deviceTotals).some(v => v > 0)} isLoading={isLoadingCharts}>
          {#key deviceChartKey}
            <canvas use:initDeviceChart></canvas>
          {/key}
        </ChartWrapper>

        <ChartWrapper title={m.analytics_platformBreakdown()} hasData={Object.values(platformTotals).some(v => v > 0)} isLoading={isLoadingCharts}>
          {#key platformChartKey}
            <canvas use:initPlatformChart></canvas>
          {/key}
        </ChartWrapper>
      </div>

      {#if pageViews.length > 0}
        <div class="results-info">
          {m.admin_showingOf({ showing: String(pageViews.length), total: String(totalCount) })}
        </div>
      {/if}

      <div class="table-container">
        {#if pageViews.length === 0}
          <div class="empty-state">
            <Eye size={40} class="empty-icon-svg" />
            <p>{m.analytics_noData()}</p>
          </div>
        {:else}
          <table class="views-table">
            <thead>
              <tr>
                <th>{m.analytics_path()}</th>
                <th>{m.analytics_user()}</th>
                <th class="hide-small">{m.analytics_device()}</th>
                <th class="hide-small">{m.analytics_platform()}</th>
                <th class="hide-mobile">{m.analytics_browser()}</th>
                <th class="time-col">{m.admin_date()}</th>
              </tr>
            </thead>
            <tbody>
              {#each pageViews as pv (pv.id)}
                <tr class="view-row">
                  <td class="path-cell">
                    <span class="path-badge">{formatPath(pv.normalizedPath)}</span>
                  </td>
                  <td class="user-cell">
                    <span class="user-name">{pv.userName}</span>
                  </td>
                  <td class="hide-small">
                    <span class="device-badge">
                      {#if pv.deviceType === 'mobile'}
                        <Smartphone size={12} />
                      {:else if pv.deviceType === 'tablet'}
                        <Tablet size={12} />
                      {:else}
                        <Monitor size={12} />
                      {/if}
                      <span class="hide-mobile">{pv.deviceType}</span>
                    </span>
                  </td>
                  <td class="hide-small">
                    <span class="platform-badge">
                      {#if pv.platform === 'web'}
                        <Globe size={12} />
                      {:else}
                        <Smartphone size={12} />
                      {/if}
                      <span class="hide-mobile">{pv.platform}</span>
                    </span>
                  </td>
                  <td class="hide-mobile">
                    <span class="browser-text">{pv.browserName}</span>
                  </td>
                  <td class="time-col">
                    <div class="date-info">
                      <span>{formatDate(pv.timestamp)}</span>
                      <small>{formatTime(pv.timestamp)}</small>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>

          {#if isLoadingMore}
            <LoadingSpinner size="small" message={m.admin_loadingMore()} inline={true} />
          {:else if hasMore}
            <div class="load-more-hint">{m.admin_scrollToLoadMore()}</div>
          {:else}
            <div class="end-of-list">{m.admin_endOfList()}</div>
          {/if}
        {/if}
      </div>
    {/if}
    </div>
  </div>
</SuperAdminGuard>

<style>
  .analytics-container {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #fafafa;
    transition: background-color 0.3s;
    overflow: hidden;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) {
    background: #0f1419;
  }

  /* Header */
  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem 1.5rem;
    flex-shrink: 0;
    transition: background-color 0.3s, border-color 0.3s;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .page-header {
    background: #1a2332;
    border-color: #2d3748;
  }

  .scroll-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 2rem;
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
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .back-btn {
    background: #0f1419;
    color: #fff;
    border-color: #2d3748;
  }

  .back-btn:hover {
    transform: translateX(-2px);
    border-color: var(--primary);
    color: var(--primary);
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
    font-size: 1.1rem;
    margin: 0;
    color: var(--primary);
    font-weight: 700;
    white-space: nowrap;
  }

  .count-badge {
    padding: 0.2rem 0.6rem;
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    color: var(--primary);
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Filters */
  .filters-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
    margin-top: 0.75rem;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .filters-row {
    border-top-color: #2d3748;
  }

  .period-tabs {
    display: flex;
    gap: 0.25rem;
  }

  .period-tab {
    padding: 0.35rem 0.7rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: all 0.2s;
    color: #555;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .period-tab {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .period-tab:hover:not(.active) {
    background: #f5f5f5;
    border-color: var(--primary);
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .period-tab:hover:not(.active) {
    background: #2d3748;
  }

  .period-tab.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
    font-weight: 600;
    box-shadow: 0 2px 4px color-mix(in srgb, var(--primary) 40%, transparent);
  }

  .route-filter {
    padding: 0.35rem 0.7rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.78rem;
    color: #555;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 100px;
    margin-left: auto;
  }

  .route-filter:hover {
    border-color: var(--primary);
  }

  .route-filter:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .route-filter {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .route-filter option {
    background: #1a2332;
    color: #8b9bb3;
  }

  /* Stats row */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    transition: all 0.3s;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .stat-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--primary);
    line-height: 1.2;
  }

  .stat-label {
    font-size: 0.7rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 500;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .stat-label {
    color: #6b7a94;
  }

  /* Charts grid */
  .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  /* Results info */
  .results-info {
    font-size: 0.75rem;
    color: #999;
    margin-bottom: 0.5rem;
    transition: color 0.3s;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .results-info {
    color: #6b7a94;
  }

  /* Table */
  .table-container {
    overflow-x: auto;
    background: white;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: all 0.3s;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .table-container {
    background: #1a2332;
  }

  .views-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .views-table thead {
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    z-index: 1;
    transition: all 0.3s;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .views-table thead {
    background: #0f1419;
    border-color: #2d3748;
  }

  .views-table th {
    padding: 0.5rem 0.7rem;
    text-align: left;
    font-weight: 600;
    color: #666;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: color 0.3s;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .views-table th {
    color: #6b7a94;
  }

  .view-row {
    border-bottom: 1px solid #f0f0f0;
    transition: background-color 0.15s;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .view-row {
    border-color: #1e2d3d;
  }

  .view-row:hover {
    background: #f8f9fa;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .view-row:hover {
    background: #1e2d3d;
  }

  .view-row td {
    padding: 0.5rem 0.7rem;
    color: #333;
    transition: color 0.3s;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .view-row td {
    color: #c8d6e5;
  }

  .path-badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    font-family: monospace;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-name {
    font-weight: 500;
    font-size: 0.8rem;
  }

  .device-badge,
  .platform-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: #666;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .device-badge,
  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .platform-badge {
    color: #8b9bb3;
  }

  .browser-text {
    font-size: 0.78rem;
    color: #666;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .browser-text {
    color: #8b9bb3;
  }

  .time-col {
    white-space: nowrap;
  }

  .date-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.78rem;
  }

  .date-info small {
    color: #999;
    font-size: 0.7rem;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .date-info small {
    color: #5a6b80;
  }

  /* Empty & loading states */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 3rem 1rem;
    color: #999;
    text-align: center;
  }

  .empty-state :global(.empty-icon-svg) {
    color: #ccc;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .empty-state {
    color: #6b7a94;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .empty-state :global(.empty-icon-svg) {
    color: #3d4f63;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.85rem;
  }

  .error-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 3rem 1rem;
    text-align: center;
  }

  .error-box :global(.error-icon-svg) {
    color: #ef4444;
  }

  .error-box h3 {
    margin: 0;
    color: #ef4444;
    font-size: 1rem;
  }

  .error-box p {
    margin: 0;
    color: #999;
    font-size: 0.85rem;
  }

  .load-more-hint,
  .end-of-list {
    text-align: center;
    padding: 0.75rem;
    font-size: 0.75rem;
    color: #999;
  }

  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .load-more-hint,
  .analytics-container:is([data-theme='dark'], [data-theme='violet']) .end-of-list {
    color: #5a6b80;
  }

  /* Responsive: hide columns */
  .hide-small {
    display: table-cell;
  }

  .hide-mobile {
    display: table-cell;
  }

  @media (max-width: 768px) {
    .hide-mobile {
      display: none !important;
    }

    .charts-grid {
      grid-template-columns: 1fr;
    }

    .stats-row {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 640px) {
    .scroll-content {
      padding: 1rem;
    }

    .page-header {
      padding: 0.5rem 1rem;
    }

    .hide-small {
      display: none !important;
    }

    .stat-value {
      font-size: 1.2rem;
    }

    .path-badge {
      max-width: 120px;
    }
  }

  @media (max-width: 480px) {
    .filters-row {
      flex-direction: column;
      align-items: stretch;
    }

    .route-filter {
      margin-left: 0;
    }

    .stats-row {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
    }

    .stat-card {
      padding: 0.5rem;
    }
  }
</style>
