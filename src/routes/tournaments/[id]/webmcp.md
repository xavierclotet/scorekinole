---
route: "/tournaments/[id]"
title: "Public Tournament View"
description: "Vista pública de un torneo. Muestra info, clasificación, grupos, brackets y consolación. Soporta torneos en vivo y completados."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Esta ruta tiene ~6500 lineas. NO leas el archivo entero.
> La vista se divide en dos ramas principales: **LIVE** (delega a `LiveTournamentView`) y **NO-LIVE** (todo inline en +page.svelte).

## Arquitectura de Componentes

### Rama de renderizado

```
{#if isLive}
  <LiveTournamentView {tournament} />     ← src/lib/components/tournament/LiveTournamentView.svelte
{:else}
  <!-- Todo el contenido completado/importado se renderiza INLINE en +page.svelte -->
{/if}
```

**IMPORTANTE**: `CompletedTournamentView.svelte` NO se usa en esta ruta. Solo se usa en la vista admin.

### Cuando se usa cada rama
| Estado del torneo | Componente/Vista |
| :--- | :--- |
| `GROUP_STAGE`, `TRANSITION`, `FINAL_STAGE` | `LiveTournamentView.svelte` |
| `COMPLETED`, `DRAFT`, importados | Inline en `+page.svelte` |

## Carga de Datos

**No hay `+page.ts` ni `+page.server.ts`**. Los datos se cargan en `onMount()`:
- `loadTournament()` resuelve el ID (soporta keys de 6 chars y doc IDs completos)
- `subscribeTournament()` para updates en tiempo real

## Variables de Estado Clave (script)

| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `tournament` | `Tournament \| null` | Datos del torneo |
| `isLive` | derived | `status` es GROUP_STAGE/TRANSITION/FINAL_STAGE |
| `isCompleted` | derived | `status === 'COMPLETED'` |
| `isSplitDivisions` | derived | `finalStage.mode === 'SPLIT_DIVISIONS'` |
| `isParallelBrackets` | derived | `finalStage.mode === 'PARALLEL_BRACKETS'` |
| `isSingleGroup` | derived | Solo un grupo en fase de grupos |
| `isDoubles` | derived | `gameType === 'doubles'` |
| `goldConsolationBrackets` | derived | `goldBracket.consolationBrackets \|\| []` |
| `silverConsolationBrackets` | derived | `silverBracket.consolationBrackets \|\| []` |
| `activePhase` | state | `'groups' \| 'bracket'` - tab activo |
| `activeTab` | state | `'gold' \| 'silver'` - tab de division |

## Estructura del Template (+page.svelte, rama NO-LIVE)

### 1. Header y Hero
```
.detail-container[data-theme]
  header.page-header          ← Logo, titulo, botones (share, admin, theme)
  .hero-banner                ← Poster del torneo (si posterUrl)
    .live-badge               ← Badge LIVE (si isLive)
```

### 2. Info del Torneo
```
.info-grid                    ← Fecha, ubicacion, participantes, modo, tier
.description-section          ← Descripcion con boton traducir
```

### 3. Final Standings (clasificacion final)
Multiples variantes segun tipo de torneo:
- **LIVE completado**: Dos columnas con ranking points
- **Importado PARALLEL_BRACKETS**: Grid top-4 por bracket
- **Importado SPLIT_DIVISIONS**: Top-4 gold + silver
- **Importado single bracket**: Top-4 inline
- **Fallback**: Solo ganador

### 4. Videos Section
```
.videos-section               ← Solo si isCompleted && matchesWithVideo.length > 0
  .video-card                 ← Grid de cards con miniatura YouTube
```

### 5. Phase Tabs
```
.phase-nav                    ← Solo si tiene ambas fases con resultados
  button "Grupos" / "Fase Final"
```

### 6. Fase de Grupos
```
.groups-container[.single-group]
  .group-card                 ← Una por grupo
    .standings-table          ← Tabla de clasificacion
      tr.qualified            ← Filas de clasificados (goldQualifiedIds)
    .bump-chart-section       ← Grafico evolucion por rondas (toggle)
    .twenties-chart           ← Grafico de 20s (toggle)
    .match-result-row         ← Resultados de partidos (con filtro por jugador)
```

### 7. Fase Final - Brackets

#### 7a. SPLIT_DIVISIONS (Gold/Silver)
```
.bracket-division-section.gold
  .bracket-wrapper > .bracket-container
    .bracket-round            ← Multiples rondas (QF, SF, F)
      .round-name
        .scoring-badge        ← Badge con modo de juego (ej: "4R", "7P", "7P (Fw2)")
      .matches-column
        .bracket-match[.completed][.has-video][.has-detail]
          .match-participant[.winner][.tbd][.has-hammer]
    .pair-connector           ← Conectores horizontales entre rondas
  .bracket-round.third-place  ← Partido 3er/4to puesto
  .consolation-inline         ← Brackets de consolacion (ver seccion abajo)

.bracket-division-section.silver  ← Misma estructura
```

#### 7b. PARALLEL_BRACKETS
```
.parallel-bracket-nav         ← Tabs con nombre de cada bracket
  .bracket-wrapper            ← Bracket del tab activo
```

#### 7c. Single Bracket
```
.bracket-panel
  .bracket-wrapper > .bracket-container
    (misma estructura que gold/silver)
  .consolation-inline         ← Brackets de consolacion
```

### 8. Consolation Brackets (dentro de cada seccion de bracket)

**CRITICO**: Existen 3 secciones de consolacion independientes:
1. **Gold consolation** (~linea 1810) - dentro de `isSplitDivisions`
2. **Silver consolation** (~linea 2090) - dentro de `isSplitDivisions`
3. **Single bracket consolation** (~linea 2510) - dentro del else (single bracket)

Cada una tiene la misma estructura:
```
.consolation-inline
  .consolation-inline-header
    .scoring-badge            ← Badge con modo de juego de la consolacion (earlyRounds config)
  .consolation-unified
    <!-- R16 consolation -->
    .consolation-round[data-source="R16"][.final-round]
      .round-header
      .matches-container
        .consolation-match[.completed]
          .match-position-badge    ← "5o-6o", "7o-8o" etc.
          .match-participant[.winner][.tbd]

    <!-- QF consolation -->
    .consolation-round[data-source="QF"][.qf-start][.final-round]
      (misma estructura)
```

**Position badge formula**: `posStart = bracket.startPosition + (match.position ?? 0) * 2`
- match.position=0 (final) → "5o-6o"
- match.position=1 (3er puesto consolacion) → "7o-8o"

## LiveTournamentView.svelte

Componente separado para torneos en vivo. Tiene su propia logica de consolacion.

### Consolation en LiveTournamentView
Existen 3 secciones analogo a +page.svelte:
1. **Gold consolation** (~linea 1146)
2. **Silver consolation** (~linea 1480)
3. **Single bracket consolation** (~linea 1930)

Estructura:
```
.consolation-unified
  {#each cb.rounds as round, roundIndex}
    .consolation-round[.qf-start][.final-round]
      .consolation-round-header
      .consolation-round-matches
        .consolation-match[.completed][.in-progress]
          .consolation-position-badge  ← Solo en ultima ronda
          .consolation-player[.winner][.tbd]
            .consolation-name
            .consolation-score
```

**Position badge formula**: `matchPosStart = cb.startPosition + (match.position ?? 0) * 2`

### Datos importantes de ConsolationBracket
```typescript
interface ConsolationBracket {
  source: 'QF' | 'R16';
  rounds: BracketRound[];
  totalRounds: number;
  startPosition: number;    // 5 para QF, 9 para R16
  isComplete: boolean;
}
```

Cada match en la ronda final tiene:
- `position: 0` → partido por posiciones startPosition/startPosition+1
- `position: 1` → partido por posiciones startPosition+2/startPosition+3
- `isThirdPlace: true` → indica que es partido de consolacion de perdedores

## Modales

### Match Detail Modal
```
.match-detail-overlay         ← Click o Escape para cerrar
  .match-detail-modal
    .match-detail-header      ← Equipos + marcador global
    .match-detail-body
      .game-section           ← Por cada game
        Hammer row (si showHammer)
        Player rows con scores ronda a ronda
        Twenties breakdown (si show20s)
```

### Video Modal
```
.video-modal-overlay          ← Click o Escape para cerrar
  .video-modal
    .video-modal-content      ← YouTube iframe
    .video-modal-info         ← Equipos y marcador
```

## Archivos Relacionados

| Archivo | Rol |
| :--- | :--- |
| `src/routes/tournaments/[id]/+page.svelte` | Vista publica (completados/importados inline) |
| `src/lib/components/tournament/LiveTournamentView.svelte` | Vista publica de torneos en vivo |
| `src/lib/components/tournament/CompletedTournamentView.svelte` | **NO se usa aqui** (solo en admin) |
| `src/lib/components/charts/BumpChart.svelte` | Grafico evolucion rondas |
| `src/lib/components/charts/TwentiesBarChart.svelte` | Grafico de 20s |
| `src/lib/algorithms/bracket.ts` | Generacion de brackets y consolacion |
| `src/lib/firebase/tournaments.ts` | `subscribeTournament()`, carga de datos |
| `src/lib/types/tournament.ts` | `Tournament`, `BracketMatch`, `ConsolationBracket` |
