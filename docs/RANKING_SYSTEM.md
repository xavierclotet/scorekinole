# Crokinole Series Ranking System

Sistema de puntos de ranking basado en el sistema Crokinole Series español.

## Base Points por Serie

| Serie | Base Points |
|-------|-------------|
| Series 50 | 50 |
| Series 40 | 40 |
| Series 35 | 35 |

**Requisitos de participantes:**
- **Series 50**: Mínimo 30 jugadores inscritos (Campeonato de España, torneos masivos)
- **Series 40**: Recomendable 20+ jugadores (torneos regionales grandes)
- **Series 35**: Sin mínimo (torneos locales y de clubes)

## Curvas de Drops Estándar

**Singles:** pos2 = -3, pos3-5 = -2, pos6+ = -1
**Doubles:** pos2 = -5, pos3 = -4, pos4+ = -2

## Dos Regímenes

### 16+ participantes: Tabla oficial (raw drops)

El ganador recibe los basePoints completos. Se aplican los drops estándar directamente. Las posiciones inferiores pueden recibir puntos altos (ej. último de 16 en Series 50 Singles = 30 pts). Si los drops acumulados superan basePoints-1, las posiciones restantes reciben 1 punto.

### <16 participantes: Interpolación

El ganador recibe `round(basePoints * N/16)` puntos. Los drops se interpolan para que el último clasificado siempre reciba exactamente 1 punto.

Dos métodos de interpolación según el caso:

- **Hamilton (mayor residuo)**: cuando los drops estándar suman más que targetDrop (típico de Doubles en torneos pequeños). Reduce los drops proporcionalmente preservando la forma front-heavy.
- **Level fill**: cuando los drops estándar suman menos que targetDrop (típico de Singles). Incrementa los drops más pequeños primero (de izquierda a derecha dentro del mismo nivel), preservando el orden monotónicamente no-creciente.

## Tablas Oficiales (referencia)

### Series 50 (50 pts)

**Singles:** 50, 47, 45, 43, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1

**Doubles:** 50, 45, 41, 39, 37, 35, 33, 31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 1, 1...

### Series 40 (40 pts)

**Singles:** 40, 37, 35, 33, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1...

**Doubles:** 40, 35, 31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 1...

### Series 35 (35 pts)

**Singles:** 35, 32, 30, 28, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1...

**Doubles:** 35, 30, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1, 1...

## Ejemplos de Torneos Pequeños (<16)

### 8 jugadores, Series 35, Singles
- winnerPoints = round(35 * 8/16) = 18
- Level fill: interpola para llegar de 18 a 1

### 8 equipos, Series 35, Doubles
- winnerPoints = 18
- Hamilton: reduce drops proporcionalmente

### 10 jugadores, Series 40, Singles
- winnerPoints = round(40 * 10/16) = 25
- Level fill interpola para llegar de 25 a 1

## Implementación

- **Client-side**: `src/lib/algorithms/ranking.ts` → `calculateRankingPoints(position, tier, participantsCount, mode)`
- **Cloud Function**: `functions/src/index.ts` → misma lógica duplicada (deben estar sincronizadas)
- **UI Preview**: Step 3 del wizard de creación de torneos muestra la tabla de distribución reactiva según serie, participantes y modo (singles/doubles)
- **Compatibilidad**: La función `normalizeTier()` en `src/lib/types/tournament.ts` mapea valores legacy (MAJOR→SERIES_50, NATIONAL→SERIES_40, REGIONAL/CLUB→SERIES_35)
