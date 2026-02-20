# Tournament Live Creation Wizard (`/admin/tournaments/create`)

This route handles the creation of a new LIVE tournament through a multi-step wizard interface. The process creates a configuration object that will be stored in Firestore, setting up the basic info, participants, phases (group/knockout), ranking distribution, and time estimations.

## Functionality Overview

The wizard consists of 6 steps:

1. **Location & Date**: Defines the event's geographical and temporal data (Country, City, Date).
2. **Basic Configuration**: Sets fundamental parameters:
   - Name of the tournament.
   - Format (Singles vs Doubles).
   - Core scoring mechanics: "By Points" vs "By Rounds", "Best of N", Hammer tracking, 20s tracking.
3. **Phases & Ranking Configuration**:
   - Tournament structure (Direct Elimination vs Groups + Elimination).
   - If Ranking is enabled, selecting the `TournamentTier` (CLUB, REGIONAL, NATIONAL, MAJOR).
   - **NCA Ranking Points**: Points are calculated dynamically based on tier, participant count, game mode (Singles/Doubles), and final position. See NCA Ranking System below.
4. **Participants**:
   - Organizers can input participants (singular or pairs) manually, search from registered users, or add guests.
   - A counter warns if the number of participants exceeds the capacity of the configured tables.
5. **Time & Tables Configuration**:
   - Define the number of physical tables available.
   - Set the estimated duration per game and break times between matches and phases.
   - The UI presents a summary of the estimated tournament duration (which is informative, as matches can end earlier or later in reality).
6. **Review & Create**: Final rundown of the configuration before pushing `createTournamentLive` to Firebase.

## NCA Ranking System

Points are calculated by `src/lib/algorithms/ranking.ts` -> `calculateRankingPoints(position, tier, participantsCount, mode)`.

### Base Points per Tier

| Tier | Name | Base Points (max, with 16+ participants) |
|------|------|------------------------------------------|
| 1 | MAJOR | 50 |
| 2 | NATIONAL | 40 |
| 3 | REGIONAL | 35 |
| 4 | CLUB | 30 |

### Winner Points Calculation

```
winnerPoints = round(basePoints * min(1, numParticipants / 16))
```

With 16+ participants, winner gets full base points. With fewer, points scale proportionally (e.g., 8 players in a CLUB tournament = `round(30 * 8/16)` = 15 pts).

### Standard NCA Drop Curves

**Singles:** pos2 = -3, pos3-5 = -2, pos6+ = -1
**Doubles:** pos2 = -5, pos3 = -4, pos4+ = -2

### Interpolation (key mechanism)

The algorithm builds the full standard drop curve for all positions, then:

1. **targetDrop** = winnerPoints - 1 (total points to lose from 1st to last place)
2. **totalStandardDrop** = sum of all standard drops
3. For each position, accumulate standard drops up to that position (**currentStandardDrop**)
4. **If 16+ participants** and totalStandardDrop >= targetDrop: use raw drops directly (`winnerPoints - currentStandardDrop`)
5. **If <16 participants**: interpolate proportionally so the curve ends exactly at 1 point for last place:
   ```
   dropRatio = currentStandardDrop / totalStandardDrop
   actualDrop = round(targetDrop * dropRatio)
   points = max(1, winnerPoints - actualDrop)
   ```

This ensures that in smaller tournaments, points distribute smoothly from winner down to 1, instead of clustering at the bottom.

### Example: Tier 4 (CLUB), 8 players, Singles

- winnerPoints = round(30 * 8/16) = 15, targetDrop = 14
- Standard drops for 7 positions: [3, 2, 2, 2, 1, 1, 1] = totalStandardDrop = 12
- Since 8 < 16, use interpolation:
  - Pos 2: ratio=3/12=0.25, drop=round(14*0.25)=4 → 15-4=**11**
  - Pos 3: ratio=5/12=0.42, drop=round(14*0.42)=6 → 15-6=**9**
  - Pos 8: ratio=12/12=1.0, drop=round(14*1.0)=14 → 15-14=**1**

### Example: Tier 4 (CLUB), 8 teams, Doubles

- winnerPoints = 15, targetDrop = 14
- Standard drops: [5, 4, 2, 2, 2, 2, 2] = totalStandardDrop = 19
- Since 8 < 16, interpolation:
  - Pos 2: ratio=5/19=0.26, drop=round(14*0.26)=4 → 15-4=**11**
  - Pos 3: ratio=9/19=0.47, drop=round(14*0.47)=7 → 15-7=**8**
  - Pos 8: ratio=19/19=1.0, drop=round(14*1.0)=14 → 15-14=**1**

### Example: Tier 1 (MAJOR), 16 players, Singles

- winnerPoints = 50, targetDrop = 49
- Standard drops: [3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] = totalStandardDrop = 20
- Since 16 participants and totalStandardDrop(20) < targetDrop(49): interpolation applies
- Smooth curve from 50 down to 1

## Technical Details

- **State Management**: The wizard maintains a complex object representing the entire tournament draft.
- **Dynamic Points Calculation**: The `calculateRankingPoints()` function accepts 4 parameters: `position`, `tier`, `participantsCount` (default 16), and `mode` ('singles' | 'doubles', default 'singles'). The UI in Step 3 reactively previews the points distribution table based on `textareaParticipantCount` and `gameType`.
- **Cloud Function Sync**: The same NCA formula is duplicated in `functions/src/index.ts` for server-side calculation when a tournament completes. Both implementations must stay in sync.
- **LocalStorage Cleanup**: To prevent stale data between sessions, there are mechanisms to save drafts and clean them when a tournament is successfully created.
