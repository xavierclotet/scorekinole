---
route: "/ranking"
title: "Player Rankings & Leaderboard"
description: "Ranking global de jugadores basado en resultados de torneos completados, con filtro por año y modo (Ranking = 2 mejores torneos / Liga anual = todos)."
---

## Contexto de Agente (WebMCP)
> **ATENCIÓN IA / AGENTE**: Página pública de rankings.
> Carga datos de Firebase (usuarios + torneos completados) y calcula posiciones dinámicamente según filtros.

## Estructura y Componentes Principales
- **Header**: `AppMenu` (con `showHome` y `homeHref="/"`), título con badge de conteo de jugadores, `ThemeToggle`.
- **PullToRefresh**: Envuelve todo el contenido debajo del header. Llama a `loadData()` al tirar hacia abajo.
- **Controls Section**: Controles de filtrado:
  - **Year Select** (`.year-filter`): Dropdown controlado con años disponibles extraídos de torneos (obligatorio; los rankings son siempre por año). Se refleja en la URL (`?year=2025`).
  - **Mode Toggle** (`.mode-tabs`): Alterna entre "Ranking" (2 mejores torneos, por defecto) y "Liga anual" (todos los torneos del año). Se refleja en la URL (`?mode=league`).
  - **URL params (en inglés)**: `?year=2025&mode=league`. Ambos params se combinan y son compartibles/bookmarkables. Sin param → modo Ranking y año por defecto (actual, o el más reciente con torneos).
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
| **Cambiar año** | `<select class="year-filter">` → `setYear()` | Actualiza la URL (`?year=2025`), de la que deriva `selectedYear`; recalcula vía `$effect`. |
| **Cambiar modo** | Click en toggle `.mode-tabs` (Ranking / Liga anual) → `setMode()` | Actualiza la URL (`?mode=league` o sin parámetro). De ella derivan `rankingMode` y `bestOfN` (2 o 0); recalcula vía `$effect`. |
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
| `selectedYear` | number | `$derived.by` de la URL (`?year=2025`). Default: año actual, o el más reciente con torneos |
| `availableYears` | number[] | Años con torneos disponibles |
| `rankingMode` | 'ranking' \| 'league' | `$derived` de la URL (`?mode=league`). 'ranking'=2 mejores (default), 'league'=todos los torneos |
| `bestOfN` | number | `$derived` de `rankingMode`: 2 en modo Ranking, 0 (todos) en modo Liga anual |
| `selectedPlayer` | RankedPlayer \| null | Jugador seleccionado para modal |
| `showDetailModal` | boolean | Visibilidad del modal de detalle |
| `visibleCount` | number | Cantidad de filas visibles (infinite scroll) |
| `visiblePlayers` | RankedPlayer[] | `$derived`: slice de `rankedPlayers` hasta `visibleCount` |
| `hasMore` | boolean | `$derived`: si hay más jugadores por mostrar |

## Dependencias
- `$lib/firebase/rankings.ts`: `getAllUsersWithTournaments`, `getCompletedTournaments`, `getAvailableYears`, `calculateRankings`
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
