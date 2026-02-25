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

El umbral es el número de participantes a partir del cual el ganador recibe los basePoints completos. Se calcula dinámicamente:

- **Singles**: `threshold = basePoints - 5`
- **Doubles**: `threshold = basePoints` (el ganador recibe exactamente N puntos, donde N = nº equipos, hasta llegar a basePoints)

| Serie | Singles | Doubles |
|-------|---------|---------|
| Series 35 | **30 jugadores** | **35 equipos** |
| Series 25 | **20 jugadores** | **25 equipos** |
| Series 15 | **10 jugadores** | **15 equipos** |

**Nota**: En doubles el threshold es más alto para que, a igual número de participantes, los puntos sean menores que en singles. Esto refleja que el mérito individual pesa más en singles.

## Cálculo de puntos

El ganador recibe `round(basePoints * min(1, N / threshold))` puntos. **Siempre se usa interpolación** para distribuir los puntos desde el ganador hasta 1 punto para el último clasificado.

- **N ≥ threshold**: winnerPoints = basePoints (puntos completos). La interpolación reparte los puntos de forma uniforme entre todas las posiciones.
- **N < threshold**: winnerPoints escalado proporcionalmente. Misma interpolación.
- **N = threshold**: la interpolación produce exactamente la misma tabla que los raw drops (caso trivial).

### Métodos de interpolación

- **Hamilton (mayor residuo)**: cuando los drops estándar suman más que targetDrop (N > threshold en singles, siempre en doubles). Reduce los drops proporcionalmente preservando la forma front-heavy. Mejora significativa vs raw drops: más posiciones diferenciadas.
- **Level fill**: cuando los drops estándar suman menos que targetDrop (N < threshold en singles). Incrementa los drops más pequeños primero (de izquierda a derecha dentro del mismo nivel), preservando el orden monotónicamente no-creciente.

## Tablas Oficiales (referencia, N = threshold)

### Series 35 (35 pts)

**Singles (30 posiciones):** 35, 32, 30, 28, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1

**Doubles (35 equipos):** En el threshold, el ganador recibe 35 pts con raw drops. Con interpolación Hamilton para N < 35.

### Series 25 (25 pts)

**Singles (20 posiciones):** 25, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1

**Doubles (25 equipos):** En el threshold, el ganador recibe 25 pts con raw drops. Con interpolación Hamilton para N < 25.

### Series 15 (15 pts)

**Singles (10 posiciones):** 15, 12, 10, 8, 6, 5, 4, 3, 2, 1

**Doubles (15 equipos):** En el threshold, el ganador recibe 15 pts con raw drops. Con interpolación Hamilton para N < 15.

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

### 8 equipos, Series 15, Doubles (threshold=15)
- winnerPoints = round(15 * 8/15) = 8
- Hamilton: reduce drops proporcionalmente → 8, 6, 4, 3, 2, 2, 1, 1

### 8 equipos, Series 25, Doubles (threshold=25)
- winnerPoints = round(25 * 8/25) = 8
- Hamilton: reduce drops proporcionalmente

### Comparativa Singles vs Doubles (8 participantes, Series 15)
- **Singles**: 1º = 12 pts (threshold=10, interpolación)
- **Doubles**: 1º = 8 pts (threshold=15, interpolación) → menos puntos en doubles

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
