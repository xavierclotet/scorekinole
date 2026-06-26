# Crokinole Series Ranking System

Ranking points system based on the Spanish Crokinole Series system.

## Base Points per Series

| Series | Base Points |
|--------|-------------|
| Series 35 | 35 |
| Series 25 | 25 |
| Series 15 | 15 |

## Standard Drop Curves

**Singles:** pos2 = -3, pos3-5 = -2, pos6+ = -1
**Doubles:** pos2 = -5, pos3 = -4, pos4+ = -2

## Natural Threshold

The threshold is the number of participants at or above which the winner receives the full base points. It is computed dynamically:

- **Singles**: `threshold = basePoints - 5`
- **Doubles**: `threshold = basePoints` (the winner receives exactly N points, where N = number of teams, up to basePoints)

| Series | Singles | Doubles |
|--------|---------|---------|
| Series 35 | **30 players** | **35 teams** |
| Series 25 | **20 players** | **25 teams** |
| Series 15 | **10 players** | **15 teams** |

**Note**: In doubles the threshold is higher so that, for the same number of participants, points are lower than in singles. This reflects that individual merit weighs more in singles.

## Points Calculation

The winner receives `round(basePoints * min(1, N / threshold))` points. **Interpolation is always used** to distribute points from the winner down to 1 point for the last-placed participant.

- **N ≥ threshold**: winnerPoints = basePoints (full points). Interpolation spreads points uniformly across all positions.
- **N < threshold**: winnerPoints scaled proportionally. Same interpolation.
- **N = threshold**: interpolation produces exactly the same table as the raw drops (trivial case).

### Interpolation Methods

- **Hamilton (largest remainder)**: used when the standard drops sum to more than targetDrop (N > threshold in singles, always in doubles). Reduces drops proportionally while preserving the front-heavy shape. Significant improvement over raw drops: more differentiated positions.
- **Level fill**: used when the standard drops sum to less than targetDrop (N < threshold in singles). Increments the smallest drops first (left to right within the same level), preserving the monotonically non-increasing order.

## Official Tables (reference, N = threshold)

### Series 35 (35 pts)

**Singles (30 positions):** 35, 32, 30, 28, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1

**Doubles (35 teams):** At the threshold, the winner receives 35 pts with raw drops. Hamilton interpolation is used for N < 35.

### Series 25 (25 pts)

**Singles (20 positions):** 25, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1

**Doubles (25 teams):** At the threshold, the winner receives 25 pts with raw drops. Hamilton interpolation is used for N < 25.

### Series 15 (15 pts)

**Singles (10 positions):** 15, 12, 10, 8, 6, 5, 4, 3, 2, 1

**Doubles (15 teams):** At the threshold, the winner receives 15 pts with raw drops. Hamilton interpolation is used for N < 15.

## Examples with Interpolation (N < threshold)

### 16 players, Series 25, Singles (threshold=20)
- winnerPoints = round(25 * 16/20) = 20
- Level fill: interpolates from 20 down to 1

### 10 players, Series 15, Singles (threshold=10)
- winnerPoints = round(15 * 10/10) = 15 (full points)
- Raw drops: last place receives 1 point

### 8 players, Series 15, Singles (threshold=10)
- winnerPoints = round(15 * 8/10) = 12
- Level fill: interpolates from 12 down to 1

### 8 teams, Series 15, Doubles (threshold=15)
- winnerPoints = round(15 * 8/15) = 8
- Hamilton: reduces drops proportionally → 8, 6, 4, 3, 2, 2, 1, 1

### 8 teams, Series 25, Doubles (threshold=25)
- winnerPoints = round(25 * 8/25) = 8
- Hamilton: reduces drops proportionally

### Singles vs Doubles comparison (8 participants, Series 15)
- **Singles**: 1st = 12 pts (threshold=10, interpolation)
- **Doubles**: 1st = 8 pts (threshold=15, interpolation) → fewer points in doubles

---

## FSI System (Field Strength Index) — Alternative System

A system inspired by the NCA (National Crokinole Association). The tournament's points are **dynamic and objective**: they are computed from the actual strength of the registered players, not just from the tier assigned to the tournament.

### Key concept

The tier still exists, but only as a guaranteed **minimum floor** for the winner:

| Tier | Minimum winner points |
|------|----------------------|
| Tier 1 (Series 35) | 25 pts |
| Tier 2 (Series 25) | 18 pts |
| Tier 3 (Series 15) | 12 pts |

The floors are calibrated below the maximum points of the classic system (35/25/15) so that a weak field awards less than the classic system, and only strong fields (high FSI) exceed those maximums.

If the tournament's FSI is high (competitive field), the winner can exceed that minimum. If it is low, the floor acts as a guarantee.

### FSI Formula

```
fsi = (0.6 × avg_top10) + (0.3 × avg_all) + (0.1 × size_bonus)
winnerPoints = max(tier_floor, round(fsi))
```

Components:
- **`avg_top10`**: average `rankingSnapshot` of the 10 highest-ranked registered players (or all of them if there are fewer than 10)
- **`avg_all`**: average `rankingSnapshot` of all participants
- **`size_bonus`**: `min(N / 20, 1) × 10` — size bonus (max 10 extra pts with ≥20 players)

Per-position distribution (interpolation/Hamilton) is applied the same way as in the classic system, using the resulting `winnerPoints`.

### Weights and rationale

| Factor | Weight | Why |
|--------|--------|-----|
| Strength of the top (FSI) | 60% | Primary factor: who is at the top of the field |
| Average field strength | 30% | Reflects competitive depth |
| Tournament size | 10% | Secondary factor: more participants = more demanding tournament |

### Differences vs the classic system

| | Classic System | FSI System |
|--|----------------|------------|
| **Winner points** | `basePoints × min(1, N/threshold)` — scale down with few players | `max(tier_floor, fsi)` — depends on field strength |
| **Tier** | Determines the maximum points | Only sets the minimum floor |
| **Small elite field** | Penalized by low N | Rewarded by high FSI |
| **Large mediocre field** | Automatic bonus from high N | Limited by low FSI |

### System selection

The admin chooses the system **when creating the tournament** (ranking configuration step). The choice is stored in `rankingConfig.scoringSystem`:

```typescript
type ScoringSystem = 'CLASSIC' | 'FSI';

interface RankingConfig {
  enabled: boolean;
  tier?: TournamentTier;
  scoringSystem?: ScoringSystem; // undefined → 'CLASSIC' (backward compatible)
}
```

All existing tournaments without this field automatically use the classic system.

---

## Migration from the previous system

Existing Firestore data uses the old names. The `normalizeTier()` function maps:
- `SERIES_50` → `SERIES_35`, `SERIES_40` → `SERIES_25`, `SERIES_35` (old) → `SERIES_15`
- `MAJOR` → `SERIES_35`, `NATIONAL` → `SERIES_25`, `REGIONAL`/`CLUB` → `SERIES_15`

A `migrateTierNames` Cloud Function updates the Firestore documents to use the new names.

## Implementation

### Classic System
- **Client-side**: `src/lib/algorithms/ranking.ts` → `calculateRankingPoints(position, tier, participantsCount, mode)` + `getNaturalThreshold(basePoints, mode)`
- **Cloud Function**: `functions/src/index.ts` → same logic duplicated (must stay in sync)
- **UI Preview**: Step 3 of the tournament creation wizard shows the distribution table reactively based on series, participants, and mode (singles/doubles)
- **Compatibility**: the `normalizeTier()` function in `src/lib/types/tournament.ts` maps legacy values

### FSI System
- **Client-side**: `src/lib/algorithms/rankingFsi.ts` → `calculateFsiWinnerPoints(participants, tier, mode)` + `calculateFsi(participants)`
- **Cloud Function**: `functions/src/index.ts` → same logic duplicated (kept in sync with rankingFsi.ts)
- **Dispatch**: `applyRankingUpdates()` checks `tournament.rankingConfig.scoringSystem` and calls the corresponding algorithm
- **UI Preview**: same wizard, new FSI preview when the FSI system is selected
