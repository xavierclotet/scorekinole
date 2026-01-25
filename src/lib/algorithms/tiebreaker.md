# Tiebreaker Algorithm

## Overview

This document describes the tiebreaker algorithm used to resolve ties in tournament standings.

## Primary Ranking

Players are first ranked by the primary value:
- **WINS mode**: Points (2 for win, 1 for tie, 0 for loss)
- **POINTS mode**: Total Crokinole points scored

## Tiebreaker Resolution

When two or more players have the same primary value, the tiebreaker algorithm is applied.

### Swiss System

For Swiss tournaments, the following criteria are used in order:

1. **Head-to-Head (H2H) Result**: Direct result between the two tied players
2. **Total 20s**: Total number of 20s scored in all matches
3. **Unresolved**: If still tied, marked as unresolved for manual resolution

### Round Robin (Mini-League)

For Round Robin tournaments with 3+ players tied, a "mini-league" approach is used:

1. **Mini-League Points**: Only matches between the tied players count
   - Win = 2 points
   - Tie = 1 point
   - Loss = 0 points

2. **Mini-League 20s**: Only 20s scored in matches between tied players

3. **Total 20s**: Total 20s from ALL matches (not just mini-league)

4. **Unresolved**: If still tied after all criteria, marked as unresolved

### Important Notes

- **No Ranking Fallback**: The algorithm does NOT use player ranking as a tiebreaker. If all criteria are equal, the tie remains unresolved.
- **Manual Resolution**: Unresolved ties are shown with a warning indicator (⚠️) and the admin can manually swap positions using the = (confirm) and ↓ (swap) buttons.

## Sub-Ties in Mini-League

When players within a mini-league have the same mini-league points AND mini-league 20s but different total 20s:
- They are resolved by total 20s
- They are marked with `tieReason: 'twenties'` to indicate the resolution was by total 20s
- They show a warning indicator (⚠️) and the = ↓ buttons
- The admin can manually override if desired

### Tie Reasons

| tieReason | Meaning |
|-----------|---------|
| `'unresolved'` | Truly unresolved - all criteria equal |
| `'twenties'` | Resolved by total 20s (same mini-league PTS and 20s) |
| `'head-to-head'` | Resolved by H2H result |
| `undefined` | Fully resolved, no tie |

## UI Indicators

| Indicator | Meaning |
|-----------|---------|
| Orange background | Player is part of a 3+ player tie |
| ⚠️ | Unresolved tie requiring attention |
| = button | Confirm current order |
| ↓ button | Swap with player below |
| Orange badge | Opens mini-league tiebreaker modal |

## Example

Consider 4 players tied with 8 points each:

| Player | Mini-League PTS | Mini-League 20s | Total 20s |
|--------|-----------------|-----------------|-----------|
| Player2 | 4 | 15 | 38 |
| Isis | 4 | 9 | 21 |
| Player6 | 2 | 14 | 32 |
| Player7 | 2 | 14 | 28 |

Resolution:
1. Player2 > Isis (same mini-pts, but more mini-20s)
2. Player6 > Player7 (same mini-pts and mini-20s, resolved by total 20s)
   - These two show ⚠️ because they were resolved by total 20s, not mini-league performance
