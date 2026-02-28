---
route: "/my-stats"
title: "My Statistics"
description: "Estadísticas personales del jugador: historial de partidas, gráficos de rendimiento y filtros avanzados."
---

## Contexto de Agente (WebMCP)
> **ATENCIÓN IA / AGENTE**: Página protegida (requiere auth). Redirige a `/` si no hay usuario.
> Carga datos de Firestore con estrategia SWR (Stale-While-Revalidate) vía `statsCache` store.

## Estructura y Componentes
- **Header**: `AppMenu` (con `showHome`, `homeHref="/"`, `currentPage="my-stats"`) + título "My Statistics" centrado + `ThemeToggle`.
- **Filters Section**: Sticky, fuera del scroll. Selectores: Year, Type (all/friendly/tournament), Mode (singles/doubles), Result (won/lost/tied), Opponent, Tournament.
- **PullToRefresh**: Envuelve todo el contenido scrollable. Llama a `fetchMatches(false)` al hacer pull.
- **Charts Grid**: Grid responsive (`auto-fill, minmax(360px, 1fr)`) con `ChartWrapper` para cada gráfico:
  1. **WinLossDonut**: Donut de victorias/derrotas/empates con leyenda lateral.
  2. **TwentiesAccuracyDonut**: Donut de precisión de 20s (singles vs doubles separados).
  3. **TwentiesHammerChart**: Comparación 20s con/sin hammer.
  4. **TwentiesPerRoundTrend**: Tendencia de 20s por ronda.
  5. **TwentiesByPhase**: 20s por fase (grupos/bracket).
  6. **TwentiesAccuracyLine**: Línea temporal de precisión de 20s.
  7. **TournamentPositionsChart**: Posiciones en torneos (solo si `filterType !== 'friendly'`).
- **Match List**: Lista de partidas con scroll infinito (`IntersectionObserver`, `PAGE_SIZE`).
  - Cada `match-item`: Status strip lateral (color win/loss/tie), meta info (fecha, torneo/friendly, fase), jugadores (icono singles/doubles + oponente), resultado (score + label), badge de 20s.
  - Expandible: Click revela tabla de detalle por game/round con puntuaciones, 20s y hammer.

## Flujo de Datos
1. Espera `authInitialized` → si no hay user, redirige a `/`.
2. `loadMatches()` usa SWR: muestra cache si existe (< 10s = no refetch), luego revalida en background.
3. `fetchMatches()` carga en paralelo: `getMatchesFromCloud()` + `getUserTournamentMatches()` + `getUserProfile()`.
4. Combina, deduplica por ID, ordena por `startTime` desc, actualiza `statsCache`.
5. Tournament records se extraen de `profile.tournaments` para el chart de posiciones.

## Estados
| Variable | Tipo | Descripción |
| :--- | :--- | :--- |
| `isLoading` | boolean | Cargando datos (spinner) |
| `matches` | MatchHistory[] | Todas las partidas del usuario |
| `tournamentRecords` | TournamentRecord[] | Records de torneos del perfil |
| `filterType` | 'all' \| 'friendly' \| 'tournament' | Filtro tipo partida |
| `filterMode` | 'all' \| 'singles' \| 'doubles' | Filtro modo de juego |
| `filterResult` | 'all' \| 'won' \| 'lost' \| 'tied' | Filtro resultado |
| `filterOpponent` | string | Filtro por oponente |
| `filterTournament` | string | Filtro por nombre de torneo |
| `filterYear` | string | Filtro por año (default: año actual) |
| `expandedMatches` | SvelteSet<string> | IDs de partidas expandidas |
| `visibleCount` | number | Cantidad visible (infinite scroll) |

## Derivados Clave
- `filteredMatches`: Partidas tras aplicar todos los filtros.
- `visibleMatches`: Subconjunto de `filteredMatches` limitado por `visibleCount`.
- `stats`: Estadísticas calculadas (wins, losses, ties, winRate, 20s accuracy singles/doubles/combined).
- `uniqueOpponents`, `uniqueTournaments`, `uniqueYears`: Opciones dinámicas para filtros.
- `hasHammerData`, `hasPerRoundData`, `hasAccuracyLineData`, `hasPhaseData`: Controlan visibilidad de charts.

## Helpers
- `getUserTeam(match)`: Determina si el usuario es team 1 o 2 (revisa player y partner).
- `getOpponentName(match)`: Nombre del oponente (con partner en doubles).
- `getResultInfo(match)`: `{ won, tied, score }` — score como "X-Y" (puntos o games según matchesToWin).
- `getMatchTwenties(match)`: `{ count, percentage }` — 20s del usuario con % sobre máximo posible.
- `isTournamentMatch(match)`: ID empieza con `tournament_`.

## Dependencias
- `$lib/firebase/firestore.ts`: `getMatchesFromCloud`, `getUserTournamentMatches`
- `$lib/firebase/userProfile.ts`: `getUserProfile`
- `$lib/firebase/auth.ts`: `currentUser`, `authInitialized`
- `$lib/stores/statsCache.ts`: Cache SWR para partidas
- `$lib/stores/gameSettings.ts`: `show20s` preference
- `$lib/stores/theme.ts`: Tema actual
- `$lib/utils/chartData.ts`: Builders para datos de gráficos
- `$lib/components/charts/`: WinLossDonut, TwentiesAccuracyDonut, TwentiesHammerChart, TwentiesPerRoundTrend, TwentiesAccuracyLine, TwentiesByPhase, TournamentPositionsChart
- `$lib/components/charts/ChartWrapper.svelte`: Wrapper con título y control de hasData
- `$lib/components/PullToRefresh.svelte`: Pull-to-refresh nativo
