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

---

## Sistema FSI (Field Strength Index) — Sistema Alternativo

Sistema inspirado en la NCA (National Crokinole Association). Los puntos del torneo son **dinámicos y objetivos**: se calculan según el nivel real de los jugadores inscritos, no solo por el tier asignado al torneo.

### Concepto clave

El tier sigue existiendo, pero solo como **suelo mínimo** garantizado para el ganador:

| Tier | Puntos mínimos ganador |
|------|----------------------|
| Tier 1 (Series 35) | 25 pts |
| Tier 2 (Series 25) | 18 pts |
| Tier 3 (Series 15) | 12 pts |

Los suelos se han calibrado por debajo de los puntos máximos del sistema clásico (35/25/15) para que un campo flojo otorgue menos que el clásico y solo los campos fuertes (FSI alto) superen esos máximos.

Si el FSI del torneo es alto (campo competitivo), el ganador puede superar ese mínimo. Si es bajo, el suelo actúa de garantía.

### Fórmula FSI

```
fsi = (0.6 × avg_top10) + (0.3 × avg_all) + (0.1 × size_bonus)
winnerPoints = max(tier_floor, round(fsi))
```

Componentes:
- **`avg_top10`**: media de `rankingSnapshot` de los 10 mejores jugadores inscritos (o todos si hay <10)
- **`avg_all`**: media de `rankingSnapshot` de todos los participantes
- **`size_bonus`**: `min(N / 20, 1) × 10` — bonificación por tamaño (máx 10 pts extra con ≥20 jugadores)

La distribución por posiciones (interpolación/Hamilton) se aplica igual que en el sistema clásico, usando el `winnerPoints` resultante.

### Pesos y rationale

| Factor | Peso | Por qué |
|--------|------|---------|
| Fuerza del top (FSI) | 60% | Factor principal: quién está en la cima del campo |
| Fuerza media del campo | 30% | Refleja la profundidad competitiva |
| Tamaño del torneo | 10% | Factor secundario: más participantes = torneo más exigente |

### Diferencias vs sistema clásico

| | Sistema Clásico | Sistema FSI |
|--|----------------|-------------|
| **Puntos ganador** | `basePoints × min(1, N/threshold)` — escalan hacia abajo con pocos jugadores | `max(tier_floor, fsi)` — depende del nivel del campo |
| **Tier** | Determina los puntos máximos | Solo fija el suelo mínimo |
| **Campo de élite pequeño** | Penalizado por N bajo | Recompensado por FSI alto |
| **Campo grande mediocre** | Bonus automático por N alto | Limitado por FSI bajo |

### Selección del sistema

El admin elige el sistema **al crear el torneo** (paso de configuración de ranking). La elección queda almacenada en `rankingConfig.scoringSystem`:

```typescript
type ScoringSystem = 'CLASSIC' | 'FSI';

interface RankingConfig {
  enabled: boolean;
  tier?: TournamentTier;
  scoringSystem?: ScoringSystem; // undefined → 'CLASSIC' (backward compatible)
}
```

Todos los torneos existentes sin este campo usan automáticamente el sistema clásico.

---

## Migración desde sistema anterior

Los datos existentes en Firestore usan los nombres antiguos. La función `normalizeTier()` mapea:
- `SERIES_50` → `SERIES_35`, `SERIES_40` → `SERIES_25`, `SERIES_35` (antiguo) → `SERIES_15`
- `MAJOR` → `SERIES_35`, `NATIONAL` → `SERIES_25`, `REGIONAL`/`CLUB` → `SERIES_15`

Una Cloud Function `migrateTierNames` actualiza los documentos de Firestore para usar los nuevos nombres.

## Implementación

### Sistema Clásico
- **Client-side**: `src/lib/algorithms/ranking.ts` → `calculateRankingPoints(position, tier, participantsCount, mode)` + `getNaturalThreshold(basePoints, mode)`
- **Cloud Function**: `functions/src/index.ts` → misma lógica duplicada (deben estar sincronizadas)
- **UI Preview**: Step 3 del wizard de creación de torneos muestra la tabla de distribución reactiva según serie, participantes y modo (singles/doubles)
- **Compatibilidad**: La función `normalizeTier()` en `src/lib/types/tournament.ts` mapea valores legacy

### Sistema FSI
- **Client-side**: `src/lib/algorithms/rankingFsi.ts` → `calculateFsiWinnerPoints(participants, tier, mode)` + `calculateFsi(participants)`
- **Cloud Function**: `functions/src/index.ts` → misma lógica duplicada (sincronizada con rankingFsi.ts)
- **Dispatch**: `applyRankingUpdates()` comprueba `tournament.rankingConfig.scoringSystem` y llama al algoritmo correspondiente
- **UI Preview**: mismo wizard, nueva vista previa FSI cuando el sistema FSI está seleccionado
