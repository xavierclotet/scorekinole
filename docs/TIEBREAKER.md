# Tiebreaker System Documentation

This document explains how ties are resolved in tournament group standings.

## Overview

The tiebreaker system handles ties differently based on:
1. **Number of tied players**: 2 players vs 3+ players
2. **Tournament type**: Swiss vs Round Robin
3. **Qualification mode**: WINS (victory points) vs POINTS (Crokinole points)
4. **20s tracking**: Whether the tournament tracks twenties (`show20s`)

---

## Tiebreaker Chains

### WINS mode (2/1/0 victory points)

**2-player tie:**
1. **Head-to-Head (H2H)** — Direct result between the two players
2. **Total 20s** — Total twenties scored across all matches *(skipped if `show20s` is off)*
3. **Total Crokinole Points** (`totalPointsScored`) — Sum of Crokinole game points (e.g., 6 in a 6-2 win)
4. **Buchholz** — Sum of all opponents' primary ranking values (measures schedule strength)
5. **Shoot-out** — Unresolved → admin decision or physical shoot-out

**3+ player tie (Swiss):**
1. **Total 20s** *(skipped if `show20s` is off)*
2. **Total Crokinole Points** (`totalPointsScored`)
3. **Buchholz**
4. **H2H for remaining 2-player ties** — If after sorting, exactly 2 players are still tied, apply the 2-player chain
5. **Shoot-out**

**3+ player tie (Round Robin):**
1. **Mini-league** — Recalculate standings using ONLY matches between tied players (points → 20s)
2. **Total 20s** *(skipped if `show20s` is off)*
3. **Total Crokinole Points** (`totalPointsScored`)
4. **Buchholz**
5. **H2H for remaining 2-player ties**
6. **Shoot-out**

---

### POINTS mode (total Crokinole points)

**2-player tie:**
1. **Head-to-Head (H2H)**
2. **Total 20s** *(skipped if `show20s` is off)*
3. **Buchholz** — Sum of all opponents' `totalPointsScored`
4. **Shoot-out**

**3+ player tie (Swiss):**
1. **Total 20s** *(skipped if `show20s` is off)*
2. **Buchholz**
3. **H2H for remaining 2-player ties**
4. **Shoot-out**

**3+ player tie (Round Robin):**
1. **Total 20s** *(skipped if `show20s` is off)*
2. **Buchholz**
3. **H2H for remaining 2-player ties**
4. **Shoot-out**

> **Note**: In POINTS mode, `totalPointsScored` IS the primary classification value, so it can't be used as a tiebreaker (tied players already have the same value).

---

## Buchholz Tiebreaker

**Buchholz** is a chess-inspired tiebreaker that measures the **strength of a player's schedule** (opponents faced).

### How it's calculated

```
Buchholz = Sum of primary ranking values of all opponents faced
```

- In **WINS mode**: sums opponents' victory points (2 per win, 1 per tie, 0 per loss)
- In **POINTS mode**: sums opponents' `totalPointsScored` (Crokinole game points)

### Why it matters

Two players with the same record may have faced very different opponents. The player who faced stronger opponents (higher-ranked) gets a higher Buchholz score, suggesting they had a harder path.

### BYE opponents

A BYE opponent has 0 points, which naturally penalizes the Buchholz of the player who got the BYE. This is standard behavior (same as in chess).

### Display

Buchholz scores are displayed in the **"Buc" column** in standings tables for Swiss tournaments (useful for transparency and debugging). In Round Robin, everyone plays everyone, so Buchholz values are very similar and the column is hidden.

---

## Mini-League (Round Robin only)

### What is a Mini-League?

A mini-league recalculates standings using **ONLY the matches between the tied players**, ignoring all other matches.

### Why only Round Robin?

In Round Robin, all players have played each other by definition, so mini-league results are consistent and fair. In Swiss, not all players have played each other, so mini-league can't be applied.

### Mini-league calculation

For Round Robin 3+ player ties (WINS mode):
1. Calculate points from matches between tied players only (WIN=2, TIE=1, LOSS=0)
2. If still tied, calculate 20s from those same matches
3. If still tied, fall through to the general chain (total 20s → totalPointsScored → Buchholz)

---

## Example: Round Robin Triple Tie

**Scenario**: Players A, B, C all have 6 points in group standings

**Results between them**:
- A beats B
- B beats C
- C beats A

**Mini-league calculation**:
| Player | Mini-Pts | Reason |
|--------|----------|--------|
| A | 2 | WIN vs B |
| B | 2 | WIN vs C |
| C | 2 | WIN vs A |

**Still tied!** → Move to mini-league 20s

**20s in those matches**:
| Player | Mini-20s |
|--------|----------|
| A | 9 |
| B | 7 |
| C | 6 |

**Final order**: A → B → C

---

## Example: Swiss 3-Player Tie

**Scenario**: Players A, B, C all have 6 points in Swiss tournament

**Problem**: A played B, B played C, but A never played C

**Solution**: Use total 20s → totalPointsScored → Buchholz

| Player | Total 20s | Total Points | Buchholz |
|--------|-----------|-------------|----------|
| A | 15 | 42 | 8 |
| B | 12 | 38 | 10 |
| C | 12 | 38 | 7 |

**Result**: A is 1st (most 20s). B and C are tied with same 20s and same totalPointsScored.

Check Buchholz: B (10) > C (7) → B ranks above C.

**Final order**: A → B → C

---

## Summary Table

| Scenario | WINS mode | POINTS mode |
|----------|-----------|-------------|
| 2-player tie | H2H → 20s → Points → Buchholz | H2H → 20s → Buchholz |
| Swiss 3+ | 20s → Points → Buchholz → H2H | 20s → Buchholz → H2H |
| RR 3+ | Mini-league → 20s → Points → Buchholz → H2H | 20s → Buchholz → H2H |

> All chains end with **Shoot-out** if the tie persists.
> **20s** step is skipped when `show20s` is disabled.

---

## Unresolved Ties: Shoot-out

When players remain tied after all criteria (marked as "unresolved" in the system), the tie is resolved by a **Shoot-out** - the most exciting sudden-death tiebreaker in Crokinole.

### When is it used?

Only when two or more players are tied after exhausting all automatic tiebreakers listed above.

### Shoot-out Rules (NCA/WCC Official)

1. **Empty Board**: No opponent discs. Pure accuracy test.

2. **12 Discs**: Each player gets 12 shots (one full "round" of discs).

3. **The Goal**: Sink as many "20s" (center hole) as possible.

4. **Procedure**:
   - Player A shoots all 12 discs, one by one. Count how many go in.
   - Player B does the same.
   - Higher count wins the tiebreaker and ranks above in standings.

### What if they tie again? (True Sudden Death)

If after 12 shots both players have the same count (e.g., both sink 9 twenties):

1. Each player shoots **1 disc only**
2. If Player A sinks it and Player B misses → A wins
3. If both miss or both sink → Repeat with 1 more disc until one misses

### Implementation Note

**The shoot-out is NOT implemented in code.** It is played physically, and the admin manually adjusts the standings by moving the winner above the loser.

---

## Data Structure

The `headToHeadRecord` stores both result and 20s for each match:

```typescript
headToHeadRecord: {
  [opponentId: string]: {
    result: 'WIN' | 'LOSS' | 'TIE';
    twenties: number;  // 20s scored in that specific match
  }
}
```

The `buchholz` field on `GroupStanding`:
```typescript
buchholz?: number;  // Calculated upfront in resolveTiebreaker()
```

---

## Implementation

See: [`src/lib/algorithms/tiebreaker.ts`](../src/lib/algorithms/tiebreaker.ts)

Key functions:
- `resolveTiebreaker()` — Main entry point; calculates Buchholz for all standings, then resolves tied groups
- `calculateBuchholz()` — Sums opponents' primary ranking values from standings
- `resolveTwoPlayerTie()` — Handles 2-player ties with full chain
- `resolveMultiPlayerTie()` — Handles 3+ player ties with Swiss/RR logic
- `resolveRemainingTwoPlayerTies()` — After multi-sort, resolves any remaining 2-player ties
- `calculateMiniLeaguePoints()` — Calculates points between tied players (RR only)
- `calculateMiniLeague20s()` — Calculates 20s between tied players (RR only)
