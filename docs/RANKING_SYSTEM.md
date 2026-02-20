# NCA Ranking System

Sistema de puntos de ranking basado en la NCA (National Crokinole Association).

## Base Points por Tier

| Tier | Nombre | Base Points |
|------|--------|-------------|
| 1 | MAJOR | 50 |
| 2 | NATIONAL | 40 |
| 3 | REGIONAL | 35 |
| 4 | CLUB | 30 |

## Curvas de Drops Estándar NCA

**Singles:** pos2 = -3, pos3-5 = -2, pos6+ = -1
**Doubles:** pos2 = -5, pos3 = -4, pos4+ = -2

## Dos Regímenes

### 16+ participantes: Tabla NCA oficial (raw drops)

El ganador recibe los basePoints completos. Se aplican los drops estándar directamente. Las posiciones inferiores pueden recibir puntos altos (ej. último de 16 en Tier 1 Singles = 30 pts). Si los drops acumulados superan basePoints-1, las posiciones restantes reciben 1 punto.

### <16 participantes: Interpolación

El ganador recibe `round(basePoints * N/16)` puntos. Los drops se interpolan para que el último clasificado siempre reciba exactamente 1 punto.

Dos métodos de interpolación según el caso:

- **Hamilton (mayor residuo)**: cuando los drops estándar suman más que targetDrop (típico de Doubles en torneos pequeños). Reduce los drops proporcionalmente preservando la forma front-heavy.
- **Level fill**: cuando los drops estándar suman menos que targetDrop (típico de Singles). Incrementa los drops más pequeños primero (de izquierda a derecha dentro del mismo nivel), preservando el orden monotónicamente no-creciente.

## Tablas NCA Oficiales (referencia)

### Tier 1 — MAJOR (50 pts)

**Singles:** 50, 47, 45, 43, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1

**Doubles:** 50, 45, 41, 39, 37, 35, 33, 31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 1, 1...

### Tier 2 — NATIONAL (40 pts)

**Singles:** 40, 37, 35, 33, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1...

**Doubles:** 40, 35, 31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 1...

### Tier 3 — REGIONAL (35 pts)

**Singles:** 35, 32, 30, 28, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1...

**Doubles:** 35, 30, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1, 1...

### Tier 4 — CLUB (30 pts)

Generado por el algoritmo (misma fórmula que los demás tiers).

## Ejemplos de Torneos Pequeños (<16)

### 8 jugadores, Tier 4, Singles
- winnerPoints = round(30 * 8/16) = 15
- Level fill: **15, 12, 10, 8, 6, 4, 2, 1**

### 8 equipos, Tier 4, Doubles
- winnerPoints = 15
- Hamilton: **15, 11, 8, 6, 4, 3, 2, 1**

### 10 jugadores, Tier 2, Singles
- winnerPoints = round(40 * 10/16) = 25
- Level fill interpola para llegar de 25 a 1

## Implementación

- **Client-side**: `src/lib/algorithms/ranking.ts` → `calculateRankingPoints(position, tier, participantsCount, mode)`
- **Cloud Function**: `functions/src/index.ts` → misma lógica duplicada (deben estar sincronizadas)
- **UI Preview**: Step 3 del wizard de creación de torneos muestra la tabla de distribución reactiva según tier, participantes y modo (singles/doubles)
