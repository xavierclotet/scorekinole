---
route: "/ranking"
title: "Player Rankings & Leaderboard"
description: "Ranking global de jugadores basado en resultados de torneos completados, con filtros por año, país y best-of-N."
---

## Contexto de Agente (WebMCP)
> **ATENCIÓN IA / AGENTE**: Página pública de rankings.
> Carga datos de Firebase (usuarios + torneos completados) y calcula posiciones dinámicamente según filtros.

## Estructura y Componentes Principales
- **Header**: `AppMenu` (con `showHome` y `homeHref="/"`), título con badge de conteo de jugadores, `ThemeToggle`.
- **PullToRefresh**: Envuelve todo el contenido debajo del header. Llama a `loadData()` al tirar hacia abajo.
- **Controls Section**: Controles de filtrado:
  - **Filter Tabs**: "Todos" (`filterType='all'`) / "Por País" (`filterType='country'`).
  - **Year Select**: Dropdown con años disponibles extraídos de torneos.
  - **Country Select**: Condicional, solo visible cuando `filterType='country'`.
  - **Best-of-N**: Selector de cuántos mejores torneos considerar (2-10).
- **Rankings Table**: Tabla con scroll infinito dentro de `.table-container`.
  - Columnas: Posición (#), Jugador, Puntos, Mejor Resultado, Torneos.
  - Top 3 con colores especiales (gold, silver, bronze).
  - Click en fila abre el modal de detalle.
- **RankingDetailModal**: Modal con desglose de torneos del jugador seleccionado.
- **SEO**: Componente `<SEO>` con meta tags para rankings públicos.
- **Estados vacíos**: Spinner de carga y estado empty con icono SVG.

## Acciones Clave
| Acción | UI / Función | Resultado |
| :--- | :--- | :--- |
| **Cambiar filtro tipo** | Click en `.filter-tab` | Alterna entre `all` y `country`, recalcula rankings. |
| **Cambiar año** | `<select class="year-filter">` | Actualiza `selectedYear`, recalcula vía `$effect`. |
| **Cambiar país** | `<select>` condicional (solo en modo `country`) | Actualiza `selectedCountry`, recalcula vía `$effect`. |
| **Cambiar best-of** | `<select id="bestof-select">` | Actualiza `bestOfN` (2-10), recalcula vía `$effect`. |
| **Ver detalle jugador** | Click en `.player-row` | Abre `RankingDetailModal` con datos del `RankedPlayer`. |
| **Cerrar modal** | `closeModal()` | Cierra modal, limpia `selectedPlayer`. |
| **Scroll infinito** | Scroll en `.table-container` | Carga más jugadores (`loadMore()`) al acercarse al fondo (<100px). |
| **Pull to refresh** | Gesto pull-down | Re-ejecuta `loadData()` completo. |

## Estados
| Variable | Tipo | Descripción |
| :--- | :--- | :--- |
| `isLoading` | boolean | Cargando datos de Firebase |
| `users` | UserWithId[] | Todos los usuarios con torneos |
| `tournamentsMap` | Map<string, TournamentInfo> | Torneos completados indexados por ID |
| `rankedPlayers` | RankedPlayer[] | Resultado del cálculo de ranking (filtrado) |
| `selectedYear` | number | Año seleccionado (default: año actual) |
| `availableYears` | number[] | Años con torneos disponibles |
| `bestOfN` | number | Cuántos mejores torneos considerar (default: 2) |
| `filterType` | 'all' \| 'country' | Tipo de filtro activo |
| `selectedCountry` | string | País seleccionado (si `filterType='country'`) |
| `availableCountries` | string[] | Países disponibles en torneos |
| `selectedPlayer` | RankedPlayer \| null | Jugador seleccionado para modal |
| `showDetailModal` | boolean | Visibilidad del modal de detalle |
| `visibleCount` | number | Cantidad de filas visibles (infinite scroll) |
| `visiblePlayers` | RankedPlayer[] | `$derived`: slice de `rankedPlayers` hasta `visibleCount` |
| `hasMore` | boolean | `$derived`: si hay más jugadores por mostrar |

## Dependencias
- `$lib/firebase/rankings.ts`: `getAllUsersWithTournaments`, `getCompletedTournaments`, `getAvailableCountries`, `getAvailableYears`, `calculateRankings`
- `$lib/firebase/rankings.ts` (types): `UserWithId`, `TournamentInfo`, `RankedPlayer`, `RankingFilters`
- `$lib/components/RankingDetailModal.svelte`: Modal de detalle de jugador
- `$lib/components/AppMenu.svelte`: Menú de navegación
- `$lib/components/ThemeToggle.svelte`: Toggle dark/light
- `$lib/components/PullToRefresh.svelte`: Gesto pull-to-refresh
- `$lib/components/SEO.svelte`: Meta tags SEO
- `$lib/stores/theme.ts`: Store del tema (dark/light)
- `$lib/constants.ts`: `PAGE_SIZE` para infinite scroll

## Flujo de Datos
1. `onMount` → `loadData()` carga usuarios y torneos en paralelo (timeout 15s).
2. Extrae `availableYears` y `availableCountries` de los torneos.
3. Calcula rankings con `calculateRankings(users, tournamentsMap, filters)`.
4. `$effect` reactivo recalcula rankings cuando cambia cualquier filtro.
5. Infinite scroll: `visibleCount` incrementa en `PAGE_SIZE` al hacer scroll cerca del fondo.
6. Auto-fill: si el contenedor no tiene scroll, carga más filas automáticamente.

## Theming
- Dark theme por defecto (colores hardcoded: `#0f1419`, `#1a2332`, etc.).
- Light theme vía `[data-theme='light']` con override completo de colores.
- Top 3 filas tienen fondos especiales (gold/silver/bronze) en ambos temas.
