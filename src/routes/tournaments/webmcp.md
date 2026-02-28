---
route: "/tournaments"
title: "Public Tournament List"
description: "Listado publico de torneos con filtros por tiempo, ano, pais, modo y tier. Suscripcion en tiempo real a Firestore con infinite scroll."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Pagina publica de listado de torneos.
> Carga datos via suscripcion Firestore en tiempo real y muestra tarjetas de torneo con multiples filtros combinables.

## Estructura y Componentes Principales
- **Header**: `AppMenu` (con `showHome` y `homeHref="/"`), titulo con badge de conteo de torneos filtrados, `ThemeToggle`.
- **PullToRefresh**: Envuelve todo el contenido debajo del header. Llama a `handleRefresh()` (reinicia suscripcion).
- **SEO**: Componente `<SEO>` con meta tags para torneos publicos.
- **Controls Section**: Controles de filtrado:
  - **Time Filter Tabs**: "Todos" (`timeFilter='all'`) / "Proximos" (`timeFilter='future'`) / "Pasados" (`timeFilter='past'`).
  - **Year Select**: Dropdown con anos disponibles extraidos de los torneos cargados.
  - **Country Select**: Dropdown con paises disponibles (traducidos via `getTranslatedCountryOptions`).
  - **Mode Select**: Singles / Doubles / Todos.
  - **Tier Select**: Series 15 / Series 25 / Series 35 / Todos.
  - **Clear Filters Button**: Boton X visible solo si `hasActiveFilters`, resetea todos los filtros.
- **Tournaments Grid**: Grid responsive de `TournamentCard` con infinite scroll dentro de `.grid-container`.
  - Click en card navega a `/tournaments/{key || id}`.
- **Estados vacios**: Spinner de carga y estado empty con icono SVG y boton para resetear filtros.

## Acciones Clave
| Accion | UI / Funcion | Resultado |
| :--- | :--- | :--- |
| **Cambiar filtro tiempo** | Click en `.filter-tab` | Alterna entre `all`, `future`, `past`. |
| **Cambiar ano** | `<select>` year | Actualiza `selectedYear`, filtra torneos. |
| **Cambiar pais** | `<select>` country | Actualiza `selectedCountry`, filtra torneos. |
| **Cambiar modo** | `<select>` mode | Actualiza `selectedMode` (all/singles/doubles). |
| **Cambiar tier** | `<select>` tier | Actualiza `selectedTier` (all/SERIES_15/25/35). |
| **Limpiar filtros** | Click en `.clear-filters-btn` | Resetea todos los filtros via `clearFilters()`. |
| **Click en torneo** | Click en `TournamentCard` | Navega a `/tournaments/${tournament.key || tournament.id}`. |
| **Scroll infinito** | Scroll en `.grid-container` | Carga mas torneos (`loadMore()`) al acercarse al fondo (<150px). |
| **Pull to refresh** | Gesto pull-down | Reinicia suscripcion Firestore completa. |

## Estados
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `isLoading` | boolean | Cargando datos de Firestore |
| `allTournaments` | TournamentListItem[] | Todos los torneos de la suscripcion |
| `selectedYear` | number \| undefined | Ano seleccionado (default: ano actual si disponible) |
| `selectedCountry` | string | Pais seleccionado (default: '' = todos) |
| `selectedMode` | 'all' \| 'singles' \| 'doubles' | Modo de juego seleccionado |
| `selectedTier` | 'all' \| 'SERIES_35' \| 'SERIES_25' \| 'SERIES_15' | Tier seleccionado |
| `timeFilter` | 'all' \| 'past' \| 'future' | Filtro temporal activo |
| `availableYears` | number[] | Anos con torneos disponibles (descendente) |
| `availableCountries` | string[] | Paises presentes en los torneos |
| `translatedCountryOptions` | `$derived` | Opciones de pais traducidas para el select |
| `filteredTournaments` | `$derived` | Torneos filtrados y ordenados por fecha descendente |
| `visibleTournaments` | `$derived` | Slice de `filteredTournaments` hasta `visibleCount` |
| `visibleCount` | number | Cantidad de cards visibles (infinite scroll, PAGE_SIZE) |
| `hasMore` | boolean | `$derived`: si hay mas torneos por mostrar |
| `hasActiveFilters` | boolean | `$derived`: si hay algun filtro activo |

## Dependencias
- `$lib/firebase/publicTournaments.ts`: `subscribeToPublicTournaments`, `getAvailableTournamentYears`, `getAvailableTournamentCountries`, `TournamentListItem`
- `$lib/types/tournament.ts`: `normalizeTier`
- `$lib/components/TournamentCard.svelte`: Card de torneo individual
- `$lib/components/AppMenu.svelte`: Menu de navegacion
- `$lib/components/ThemeToggle.svelte`: Toggle dark/light
- `$lib/components/PullToRefresh.svelte`: Gesto pull-to-refresh
- `$lib/components/SEO.svelte`: Meta tags SEO
- `$lib/stores/theme.ts`: Store del tema (dark/light)
- `$lib/utils/countryTranslations.ts`: `getTranslatedCountryOptions`
- `$lib/constants.ts`: `PAGE_SIZE` para infinite scroll

## Flujo de Datos
1. `onMount` → `setupSubscription()` inicia suscripcion en tiempo real a Firestore.
2. Callback de suscripcion actualiza `allTournaments` y deriva filtros (`availableYears`, `availableCountries`) de los datos recibidos via `updateFiltersFromData()`.
3. Si `selectedYear` no esta definido y el ano actual existe en los datos, se selecciona automaticamente.
4. `filteredTournaments` es un `$derived.by()` que excluye torneos `CANCELLED` y aplica todos los filtros activos, ordenando por fecha descendente.
5. `$effect` resetea `visibleCount` a `PAGE_SIZE` cuando cambian los filtros.
6. `$effect` auto-fill: si el contenedor no tiene scroll, carga mas cards automaticamente.
7. Cleanup: `onMount` retorna funcion que llama `unsubscribe()` al desmontar.

## Template Structure
```
.tournaments-container[data-theme]
  header.page-header
    .header-row
      .header-left          ← AppMenu
      .header-center        ← h1 + .count-badge
      .header-right         ← ThemeToggle

  PullToRefresh
    .controls-section
      .filter-tabs          ← 3 botones (all/future/past)
      .filter-selects       ← 4 selects (year/country/mode/tier)
      .clear-filters-btn    ← Solo si hasActiveFilters

    {#if isLoading}
      .loading-state        ← Spinner + texto
    {:else if filteredTournaments.length === 0}
      .empty-state          ← Icono + mensaje + boton reset filtros
    {:else}
      .results-info         ← "Mostrando X de Y"
      .grid-container       ← Scroll container con onscroll
        .tournaments-grid   ← Grid responsive de TournamentCard
        .load-more-hint     ← Si hasMore
        .end-of-list        ← Si no hay mas
```

## Theming
- Dark theme por defecto (colores hardcoded: `#0f1419`, `#1a2332`, etc.).
- Light theme via `.tournaments-container:is([data-theme='light'], [data-theme='violet-light'])` con override completo de colores.

## Responsive
- Grid: `repeat(auto-fill, minmax(360px, 1fr))` → 1 columna en <480px.
- Filtros: `display: contents` en <768px para wrap natural.
- Landscape: padding y alturas reducidas en <500px height.
