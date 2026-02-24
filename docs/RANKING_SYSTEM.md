# Crokinole Series Ranking System

Sistema de puntos de ranking basado en el sistema Crokinole Series español.

## Base Points por Serie

| Serie | Base Points |
|-------|-------------|
| Series 35 | 35 |
| Series 25 | 25 |
| Series 15 | 15 |

## Curvas de Drops Estándar

**Singles:** pos2 = -3, pos3-5 = -2, pos6+ = -1
**Doubles:** pos2 = -5, pos3 = -4, pos4+ = -2

## Umbral Natural (Natural Threshold)

El umbral es el número de participantes a partir del cual la curva de drops llega naturalmente a 1 punto en la última posición. Se calcula dinámicamente:

- **Singles**: `threshold = basePoints - 5`
- **Doubles**: `threshold = ceil((basePoints - 4) / 2)`

| Serie | Singles | Doubles |
|-------|---------|---------|
| Series 35 | **30 jugadores** | **16 equipos** |
| Series 25 | **20 jugadores** | **11 equipos** |
| Series 15 | **10 jugadores** | **6 equipos** |

## Dos Regímenes

### N ≥ threshold: Tabla oficial (raw drops)

El ganador recibe los basePoints completos. Se aplican los drops estándar directamente. La última posición recibe exactamente 1 punto (la curva llega naturalmente). Si los drops acumulados superan basePoints-1, las posiciones restantes reciben 1 punto.

### N < threshold: Interpolación

El ganador recibe `round(basePoints * N / threshold)` puntos. Los drops se interpolan para que el último clasificado siempre reciba exactamente 1 punto.

Dos métodos de interpolación según el caso:

- **Hamilton (mayor residuo)**: cuando los drops estándar suman más que targetDrop (típico de Doubles en torneos pequeños). Reduce los drops proporcionalmente preservando la forma front-heavy.
- **Level fill**: cuando los drops estándar suman menos que targetDrop (típico de Singles). Incrementa los drops más pequeños primero (de izquierda a derecha dentro del mismo nivel), preservando el orden monotónicamente no-creciente.

## Tablas Oficiales (referencia, N = threshold)

### Series 35 (35 pts)

**Singles (30 posiciones):** 35, 32, 30, 28, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1

**Doubles (16 posiciones):** 35, 30, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1

### Series 25 (25 pts)

**Singles (20 posiciones):** 25, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1

**Doubles (11 posiciones):** 25, 20, 16, 14, 12, 10, 8, 6, 4, 2, 1

### Series 15 (15 pts)

**Singles (10 posiciones):** 15, 12, 10, 8, 6, 5, 4, 3, 2, 1

**Doubles (6 posiciones):** 15, 10, 6, 4, 2, 1

## Ejemplos con Interpolación (N < threshold)

### 16 jugadores, Series 25, Singles (threshold=20)
- winnerPoints = round(25 * 16/20) = 20
- Level fill: interpola para llegar de 20 a 1

### 10 jugadores, Series 15, Singles (threshold=10)
- winnerPoints = round(15 * 10/10) = 15 (puntos completos)
- Raw drops: último recibe 1 punto

### 8 jugadores, Series 15, Singles (threshold=10)
- winnerPoints = round(15 * 8/10) = 12
- Level fill: interpola para llegar de 12 a 1

### 8 equipos, Series 25, Doubles (threshold=11)
- winnerPoints = round(25 * 8/11) = 18
- Hamilton: reduce drops proporcionalmente

## Migración desde sistema anterior

Los datos existentes en Firestore usan los nombres antiguos. La función `normalizeTier()` mapea:
- `SERIES_50` → `SERIES_35`, `SERIES_40` → `SERIES_25`, `SERIES_35` (antiguo) → `SERIES_15`
- `MAJOR` → `SERIES_35`, `NATIONAL` → `SERIES_25`, `REGIONAL`/`CLUB` → `SERIES_15`

Una Cloud Function `migrateTierNames` actualiza los documentos de Firestore para usar los nuevos nombres.

## Implementación

- **Client-side**: `src/lib/algorithms/ranking.ts` → `calculateRankingPoints(position, tier, participantsCount, mode)` + `getNaturalThreshold(basePoints, mode)`
- **Cloud Function**: `functions/src/index.ts` → misma lógica duplicada (deben estar sincronizadas)
- **UI Preview**: Step 3 del wizard de creación de torneos muestra la tabla de distribución reactiva según serie, participantes y modo (singles/doubles)
- **Compatibilidad**: La función `normalizeTier()` en `src/lib/types/tournament.ts` mapea valores legacy
