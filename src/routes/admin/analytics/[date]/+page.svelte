<script lang="ts">
  import SuperAdminGuard from '$lib/components/SuperAdminGuard.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import ChartWrapper from '$lib/components/charts/ChartWrapper.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { adminTheme, theme } from '$lib/stores/theme';
  import { currentUser } from '$lib/firebase/auth';
  import { getPageViewsForDay, subscribeToPageViewsForDay } from '$lib/firebase/pageViews';
  import type { PageView } from '$lib/types/pageView';
  import { todayLocalStr, isValidDayParam, shiftDay } from '$lib/utils/analyticsDay';
  import { countryFlagUrl, countryName } from '$lib/utils/pageViewStats';
  import { getChartColors, getBaseChartOptions, BUMP_CHART_COLORS } from '$lib/utils/chartTheme';
  import {
    Chart,
    ScatterController,
    PointElement,
    LineElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Legend
  } from 'chart.js';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import X from '@lucide/svelte/icons/x';
  import Eye from '@lucide/svelte/icons/eye';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import Tablet from '@lucide/svelte/icons/tablet';

  Chart.register(
    ScatterController,
    PointElement,
    LineElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Legend
  );

  let date = $derived(page.params.date ?? '');
  let today = $derived(todayLocalStr());
  let isToday = $derived(date === today);
  let isValid = $derived(isValidDayParam(date) && date <= today);

  let views = $state<PageView[]>([]);
  let isLoading = $state(true);
  let initialLoadAt = $state(0);
  let fullscreenOpen = $state(false);

  // Punto del scatter: lleva la visita entera para el tooltip
  type ScatterPoint = { x: number; y: string; pv: PageView };

  $effect(() => {
    if (!isValid) {
      goto(`/admin/analytics/${today}`, { replaceState: true });
    }
  });

  // Carga por día: en vivo (onSnapshot) si es hoy, one-shot si es pasado.
  // El cleanup desuscribe / marca stale al cambiar de día o salir.
  $effect(() => {
    const d = date;
    if (!isValidDayParam(d) || d > today || !$currentUser) return;
    isLoading = true;
    views = [];
    initialLoadAt = 0;
    if (d === today) {
      const unsub = subscribeToPageViewsForDay(d, (v) => {
        views = v;
        if (initialLoadAt === 0) initialLoadAt = Date.now();
        isLoading = false;
      });
      return () => unsub();
    }
    let stale = false;
    getPageViewsForDay(d).then((v) => {
      if (stale) return;
      views = v;
      isLoading = false;
    });
    return () => {
      stale = true;
    };
  });

  // ---- Tiles ----
  let totalViews = $derived(views.length);
  let registeredCount = $derived(views.filter((v) => !v.isAnonymous).length);
  let anonymousCount = $derived(totalViews - registeredCount);
  let uniqueVisitors = $derived.by(() => {
    const ids = new Set<string>();
    for (const v of views) ids.add(v.isAnonymous ? `s:${v.sessionId}` : `u:${v.userId}`);
    return ids.size;
  });

  // ---- Scatter: una fila por visitante, color por página ----
  function formatPath(path: string): string {
    return path === '/' ? 'Home' : path;
  }

  function minutesOfDay(ts: number): number {
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  function visitorKey(pv: PageView): string {
    return pv.isAnonymous ? `s:${pv.sessionId}` : `u:${pv.userId}`;
  }

  // Visitantes en orden de primera aparición; los anónimos se numeran
  // ("Invitado 1", "Invitado 2"…) para poder seguirlos individualmente
  let visitorGroups = $derived.by(() => {
    const groups = new Map<string, { key: string; label: string; points: ScatterPoint[] }>();
    let guestCount = 0;
    for (const pv of views) {
      const key = visitorKey(pv);
      let g = groups.get(key);
      if (!g) {
        const label = pv.isAnonymous
          ? m.analytics_guestN({ n: String(++guestCount) })
          : pv.userName || m.analytics_anonymousVisitor();
        g = { key, label, points: [] };
        groups.set(key, g);
      }
      g.points.push({ x: minutesOfDay(pv.timestamp), y: g.label, pv });
    }
    return [...groups.values()];
  });

  let visitorLabels = $derived(visitorGroups.map((g) => g.label));
  let labelByKey = $derived(new Map(visitorGroups.map((g) => [g.key, g.label])));

  function visitorLabelOf(pv: PageView): string {
    return labelByKey.get(visitorKey(pv)) ?? m.analytics_anonymousVisitor();
  }

  // Color por página (las más visitadas primero, paleta de bump charts)
  let pageColors = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const v of views) counts[v.normalizedPath] = (counts[v.normalizedPath] || 0) + 1;
    const map = new Map<string, string>();
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([path], i) => map.set(path, BUMP_CHART_COLORS[i % BUMP_CHART_COLORS.length]));
    return map;
  });

  let allPoints = $derived(visitorGroups.flatMap((g) => g.points));

  // Datasets: puntos coloreados por página (con leyenda) encima de una línea
  // fina por visitante que une su recorrido (sin leyenda ni tooltip)
  function buildDatasets(connectorColor: string) {
    const pageDatasets = [...pageColors.entries()].map(([path, color]) => ({
      label: formatPath(path),
      data: allPoints.filter((pt) => pt.pv.normalizedPath === path) as never[],
      showLine: false,
      backgroundColor: `${color}cc`,
      borderColor: color,
      pointRadius: 5,
      pointHoverRadius: 7
    }));
    const connectorDatasets = visitorGroups.map((g) => ({
      label: `__conn__${g.key}`,
      data: g.points as never[],
      showLine: true,
      borderColor: connectorColor,
      borderWidth: 2,
      borderDash: [5, 4],
      backgroundColor: 'transparent',
      tension: 0,
      pointRadius: 0,
      pointHitRadius: 0,
      pointHoverRadius: 0
    }));
    // Los conectores al final: Chart.js pinta los primeros datasets encima
    return [...pageDatasets, ...connectorDatasets];
  }

  function formatMinutes(min: number): string {
    const h = Math.floor(min / 60);
    const mm = Math.floor(min % 60);
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function formatClock(ts: number, withSeconds = false): string {
    return new Date(ts).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {})
    });
  }

  let chartInstance: Chart | null = null;

  function initScatterChart(canvas: HTMLCanvasElement) {
    const colors = getChartColors();
    const baseOpts = getBaseChartOptions(colors);
    const chart = new Chart(canvas, {
      type: 'scatter',
      data: {
        labels: visitorLabels,
        datasets: buildDatasets(colors.mutedForeground)
      },
      options: {
        ...baseOpts,
        interaction: { mode: 'nearest' as const, intersect: true },
        plugins: {
          ...baseOpts.plugins,
          legend: {
            display: true,
            position: 'bottom' as const,
            labels: {
              color: colors.mutedForeground,
              font: { size: 11 },
              usePointStyle: true,
              pointStyleWidth: 8,
              boxHeight: 8,
              padding: 10,
              // Las líneas conectoras no salen en la leyenda: solo las páginas
              filter: (item: { text?: string }) => !String(item.text).startsWith('__conn__')
            }
          },
          tooltip: {
            ...baseOpts.plugins.tooltip,
            callbacks: {
              title: (items: any[]) => items.map((i) => visitorLabelOf(i.raw.pv)),
              label: (ctx: any) => {
                const pv: PageView = ctx.raw.pv;
                const where = `${countryName(pv.countryCode || '')}${pv.city ? ` (${pv.city})` : ''}`;
                return [
                  ` ${formatClock(pv.timestamp, true)} — ${formatPath(pv.normalizedPath)}`,
                  ` ${where} · ${pv.ip || '—'}`,
                  ` ${pv.deviceType} · ${pv.browserName}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            ...baseOpts.scales.x,
            type: 'linear' as const,
            min: 0,
            max: 1440,
            ticks: {
              ...baseOpts.scales.x.ticks,
              stepSize: 180,
              callback: (val: unknown) => formatMinutes(Number(val))
            }
          },
          y: {
            ...baseOpts.scales.y,
            type: 'category' as const,
            labels: visitorLabels,
            offset: true
          }
        }
      }
    });
    chartInstance = chart;
    return {
      destroy() {
        chart.destroy();
        if (chartInstance === chart) chartInstance = null;
      }
    };
  }

  // Modo directo: actualiza el chart in-place, sin recrearlo (sin parpadeo).
  // Solo se recrea via {#key} al cambiar tema o entrar/salir de fullscreen.
  $effect(() => {
    const labels = visitorLabels;
    const chart = chartInstance;
    if (!chart) return;
    const colors = getChartColors();
    chart.data.labels = labels;
    (chart.options.scales!.y as { labels: string[] }).labels = labels;
    chart.data.datasets = buildDatasets(colors.mutedForeground);
    chart.update('none');
  });

  let scatterKey = $derived(`scatter-${$theme}-${fullscreenOpen}`);

  // ---- Feed ----
  let feed = $derived([...views].reverse());

  // ---- Fullscreen ----
  function openFullscreen() {
    fullscreenOpen = true;
    document.body.style.overflow = 'hidden';
  }

  function closeFullscreen() {
    fullscreenOpen = false;
    document.body.style.overflow = '';
  }

  $effect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  });

  // ---- Navegación ----
  function gotoDay(d: string) {
    goto(`/admin/analytics/${d}`);
  }

  let longDate = $derived(
    isValidDayParam(date)
      ? new Date(date + 'T00:00:00').toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      : ''
  );
</script>

<SuperAdminGuard>
  <div class="day-container" data-theme={$adminTheme}>
    <header class="page-header">
      <div class="header-row">
        <button class="back-btn" onclick={() => goto('/admin/analytics')} aria-label={m.analytics_title()}>
          <ArrowLeft size={16} />
        </button>
        <div class="header-main">
          <div class="title-section">
            <h1>{longDate}</h1>
            {#if isToday}
              <span class="live-badge"><span class="live-dot"></span>{m.analytics_liveNow()}</span>
            {/if}
          </div>
        </div>
        <div class="header-actions">
          <ThemeToggle />
        </div>
      </div>

      <div class="filters-row">
        <div class="day-nav">
          <button
            class="day-nav-btn"
            onclick={() => gotoDay(shiftDay(date, -1))}
            aria-label={m.analytics_prevDay()}
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            class="day-picker"
            value={date}
            max={today}
            aria-label={m.analytics_pickDay()}
            onchange={(e) => {
              const v = e.currentTarget.value;
              if (v) gotoDay(v);
            }}
          />
          <button
            class="day-nav-btn"
            disabled={isToday}
            onclick={() => gotoDay(shiftDay(date, 1))}
            aria-label={m.analytics_nextDay()}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {#if !isToday}
          <button class="today-btn" onclick={() => gotoDay(today)}>{m.analytics_today()}</button>
        {/if}
      </div>
    </header>

    <div class="scroll-content">
      {#if isLoading}
        <LoadingSpinner message={m.common_loading()} />
      {:else}
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-value">{totalViews}</span>
            <span class="stat-label">{m.analytics_totalViews()}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{registeredCount}</span>
            <span class="stat-label">{m.analytics_registered()}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{anonymousCount}</span>
            <span class="stat-label">{m.analytics_anonymous()}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{uniqueVisitors}</span>
            <span class="stat-label">{m.analytics_uniqueVisitors()}</span>
          </div>
        </div>

        <div class="timeline-card-wrap">
          {#if views.length > 0}
            <button class="expand-btn" onclick={openFullscreen} aria-label={m.analytics_dayTimeline()}>
              <Maximize2 size={14} />
            </button>
          {/if}
          <ChartWrapper
            title={m.analytics_dayTimeline()}
            hasData={views.length > 0}
            isLoading={false}
            emptyMessage={m.analytics_noViewsThisDay()}
            autoHeight={true}
          >
            {#key scatterKey}
              {#if !fullscreenOpen}
                <canvas
                  use:initScatterChart
                  style="min-height: {Math.min(340, Math.max(180, visitorLabels.length * 26))}px"
                ></canvas>
              {/if}
            {/key}
          </ChartWrapper>
        </div>

        <div class="feed-card">
          <h3 class="feed-title">{m.analytics_dayFeed()}</h3>
          {#if feed.length === 0}
            <div class="empty-state">
              <Eye size={40} class="empty-icon-svg" />
              <p>{m.analytics_noViewsThisDay()}</p>
            </div>
          {:else}
            <ul class="feed-list">
              {#each feed as pv (pv.id)}
                <li
                  class="feed-row"
                  class:fresh={isToday && initialLoadAt > 0 && pv.timestamp > initialLoadAt}
                >
                  <span class="feed-time">{formatClock(pv.timestamp, true)}</span>
                  {#if pv.isAnonymous}
                    <span class="anon-badge">{visitorLabelOf(pv)}</span>
                  {:else}
                    <span class="user-name">{pv.userName}</span>
                  {/if}
                  <span class="path-badge">{formatPath(pv.normalizedPath)}</span>
                  <span class="feed-meta">
                    {#if countryFlagUrl(pv.countryCode || '')}
                      <img
                        class="flag-img"
                        src={countryFlagUrl(pv.countryCode || '')}
                        srcset="{countryFlagUrl(pv.countryCode || '', 40)} 2x"
                        alt={pv.countryCode}
                        title={countryName(pv.countryCode || '')}
                        width="20"
                        loading="lazy"
                      />
                    {/if}
                    {#if pv.deviceType === 'mobile'}
                      <Smartphone size={12} />
                    {:else if pv.deviceType === 'tablet'}
                      <Tablet size={12} />
                    {:else}
                      <Monitor size={12} />
                    {/if}
                    <span class="feed-browser">{pv.browserName}</span>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>

    {#if fullscreenOpen}
      <div class="fullscreen-overlay">
        <div class="fullscreen-header">
          <h2>{longDate}</h2>
          <button class="back-btn" onclick={closeFullscreen} aria-label={m.common_close()}>
            <X size={18} />
          </button>
        </div>
        <div class="fullscreen-chart">
          {#key `fs-${scatterKey}`}
            <canvas use:initScatterChart></canvas>
          {/key}
        </div>
      </div>
    {/if}
  </div>
</SuperAdminGuard>

<style>
  .day-container {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #fafafa;
    transition: background-color 0.3s;
    overflow: hidden;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) {
    background: #0f1419;
  }

  /* Header */
  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 0.75rem 1.5rem;
    flex-shrink: 0;
    transition:
      background-color 0.3s,
      border-color 0.3s;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .page-header {
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
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .back-btn {
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
    min-width: 0;
  }

  .title-section h1 {
    font-size: 1.1rem;
    margin: 0;
    color: var(--primary);
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: capitalize;
  }

  .live-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.7rem;
    border-radius: 12px;
    background: color-mix(in srgb, #ef4444 12%, transparent);
    color: #ef4444;
    font-size: 0.75rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(0.8);
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Day navigation */
  .filters-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
    margin-top: 0.75rem;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .filters-row {
    border-top-color: #2d3748;
  }

  .day-nav {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .day-nav-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 1px solid #ddd;
    background: white;
    color: #555;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .day-nav-btn:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }

  .day-nav-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .day-nav-btn {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  .day-picker {
    padding: 0.35rem 0.7rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.78rem;
    color: #555;
    cursor: pointer;
    transition: all 0.2s;
  }

  .day-picker:hover,
  .day-picker:focus {
    outline: none;
    border-color: var(--primary);
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .day-picker {
    background: #1a2332;
    border-color: #2d3748;
    color: #8b9bb3;
    color-scheme: dark;
  }

  .today-btn {
    padding: 0.35rem 0.7rem;
    background: var(--primary);
    color: white;
    border: 1px solid var(--primary);
    border-radius: 4px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 4px color-mix(in srgb, var(--primary) 40%, transparent);
  }

  .today-btn:hover {
    transform: translateY(-1px);
  }

  .scroll-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 2rem;
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

  .day-container:is([data-theme='dark'], [data-theme='violet']) .stat-card {
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

  .day-container:is([data-theme='dark'], [data-theme='violet']) .stat-label {
    color: #6b7a94;
  }

  /* Timeline card */
  .timeline-card-wrap {
    position: relative;
    margin-bottom: 1rem;
  }

  .expand-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 2;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #555;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .expand-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .expand-btn {
    background: #0f1419;
    border-color: #2d3748;
    color: #8b9bb3;
  }

  /* Feed */
  .feed-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 1rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition: all 0.3s;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .feed-card {
    background: #1a2332;
    border-color: #2d3748;
  }

  .feed-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--foreground);
    margin: 0 0 0.75rem;
  }

  .feed-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .feed-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.5rem;
    border-bottom: 1px solid #f0f0f0;
    border-radius: 4px;
    transition: background-color 0.15s;
  }

  .feed-row:last-child {
    border-bottom: none;
  }

  .feed-row:hover {
    background: #f8f9fa;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .feed-row {
    border-color: #1e2d3d;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .feed-row:hover {
    background: #1e2d3d;
  }

  .feed-row.fresh {
    animation: freshIn 2.5s ease-out;
  }

  @keyframes freshIn {
    0% {
      background: color-mix(in srgb, var(--primary) 18%, transparent);
    }
    100% {
      background: transparent;
    }
  }

  .feed-time {
    font-size: 0.75rem;
    color: #999;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .feed-time {
    color: #5a6b80;
  }

  .user-name {
    font-weight: 500;
    font-size: 0.8rem;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .user-name {
    color: #c8d6e5;
  }

  .anon-badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    background: #6666661a;
    color: #666;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .anon-badge {
    background: #8b9bb31a;
    color: #8b9bb3;
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

  .feed-meta {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
    font-size: 0.78rem;
    color: #666;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .feed-meta {
    color: #8b9bb3;
  }

  .feed-browser {
    font-size: 0.75rem;
  }

  .flag-img {
    width: 20px;
    height: auto;
    border-radius: 2px;
    box-shadow: 0 0 1px rgba(0, 0, 0, 0.4);
  }

  /* Empty state */
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

  .day-container:is([data-theme='dark'], [data-theme='violet']) .empty-state {
    color: #6b7a94;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .empty-state :global(.empty-icon-svg) {
    color: #3d4f63;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.85rem;
  }

  /* Fullscreen */
  .fullscreen-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    animation: zoomIn 0.2s ease-out;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .fullscreen-overlay {
    background: #0f1419;
  }

  @keyframes zoomIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .fullscreen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .day-container:is([data-theme='dark'], [data-theme='violet']) .fullscreen-header {
    border-color: #2d3748;
  }

  .fullscreen-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--primary);
    text-transform: capitalize;
  }

  .fullscreen-chart {
    flex: 1;
    min-height: 0;
    padding: 1rem 1.5rem;
    position: relative;
  }

  .fullscreen-chart canvas {
    width: 100% !important;
    height: 100% !important;
  }

  /* Responsive */
  @media (max-width: 768px) {
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

    .stat-value {
      font-size: 1.2rem;
    }

    .path-badge {
      max-width: 120px;
    }

    .feed-browser {
      display: none;
    }
  }

  @media (max-width: 480px) {
    .stats-row {
      gap: 0.5rem;
    }

    .stat-card {
      padding: 0.5rem;
    }
  }
</style>
