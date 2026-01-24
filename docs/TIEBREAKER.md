# Tiebreaker System Documentation

This document explains how ties are resolved in tournament group standings.

## Overview

The tiebreaker system handles ties differently based on:
1. **Number of tied players**: 2 players vs 3+ players
2. **Tournament type**: Swiss vs Round Robin

---

## 2-Player Ties

When exactly 2 players are tied on points, the same logic applies for both Swiss and Round Robin:

### Order of criteria:
1. **Head-to-Head (H2H)** - Direct result between the two players
2. **Total 20s** - Total twenties scored across all matches
3. **Unresolved** - Marked for admin decision (uses ranking snapshot for display order)

---

## 3+ Player Ties

### Swiss System

For 3+ players tied in Swiss, we **cannot use H2H as a mini-league** because:
- Not all players have played each other
- H2H comparisons can create cycles (A beats B, B beats C, C beats A)
- Results become dependent on comparison order

### Order of criteria (Swiss):
1. **Total 20s** - Total twenties scored across ALL matches
2. **H2H for remaining 2-player ties** - If after sorting by 20s, exactly 2 players are still tied, apply H2H between them
3. **Unresolved** - Marked for admin decision

---

### Round Robin

For 3+ players tied in Round Robin, we **use a mini-league** approach because:
- All players have played each other (by definition of Round Robin)
- Mini-league results are consistent and fair

### What is a Mini-League?

A mini-league recalculates standings using **ONLY the matches between the tied players**, ignoring all other matches.

### Order of criteria (Round Robin):
1. **Mini-league Points** - Points from matches between tied players only (WIN=2, TIE=1, LOSS=0)
2. **Mini-league 20s** - Twenties from matches between tied players only
3. **Total 20s** - Total twenties from ALL matches
4. **H2H for remaining 2-player ties** - If exactly 2 players remain tied, apply H2H
5. **Unresolved** - Marked for admin decision

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

**Solution**: Use total 20s only (not mini-league)

| Player | Total 20s |
|--------|-----------|
| A | 15 |
| B | 12 |
| C | 12 |

**Result**: A is 1st. B and C are tied with same 20s.

Since B vs C is a 2-player tie → Check H2H:
- If B beat C → Order: A, B, C
- If C beat B → Order: A, C, B
- If they didn't play → Unresolved (use ranking snapshot)

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

This enables calculating mini-league 20s for Round Robin tiebreakers.

---

## Summary Table

| Scenario | Swiss | Round Robin |
|----------|-------|-------------|
| 2-player tie | H2H → Total 20s | H2H → Total 20s |
| 3+ player tie | Total 20s → H2H for 2-ties | Mini-Pts → Mini-20s → Total 20s → H2H for 2-ties |

---

## Unresolved Ties: Shoot-out

When players remain tied after all criteria (marked as "unresolved" in the system), the tie is resolved by a **Shoot-out** - the most exciting sudden-death tiebreaker in Crokinole.

### When is it used?

Only when two or more players are tied on:
- Victory points
- Head-to-head (if applicable)
- Total 20s

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

## Implementation

See: [`src/lib/algorithms/tiebreaker.ts`](../src/lib/algorithms/tiebreaker.ts)

Key functions:
- `resolveTiebreaker()` - Main entry point
- `resolveTwoPlayerTie()` - Handles 2-player ties
- `resolveMultiPlayerTie()` - Handles 3+ player ties with Swiss/RR logic
- `calculateMiniLeaguePoints()` - Calculates points between tied players
- `calculateMiniLeague20s()` - Calculates 20s between tied players
