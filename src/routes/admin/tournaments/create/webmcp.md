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

The algorithm builds the full standard drop curve, then adjusts it so drops sum exactly to `targetDrop = winnerPoints - 1` (last place always gets 1 point).

**Two regimes:**

1. **16+ participants**: use official NCA raw drops directly. Winner gets full basePoints. No interpolation.
2. **<16 participants**: winner scaled by N/16, then interpolate:
   - **Hamilton** (largest remainder) when standard drops > targetDrop (Doubles small tournaments)
   - **Level fill** when standard drops <= targetDrop (Singles small tournaments)

This dual strategy ensures Singles keeps its uniform curve shape while Doubles keeps its front-heavy character.

### Example: Tier 4 (CLUB), 8 players, Singles

- winnerPoints = 15, targetDrop = 14
- Standard drops: [3, 2, 2, 2, 1, 1, 1] = 12 < 14 → **level fill** (+2)
- Fill smallest (the 1s) from left: [3, 2, 2, 2, **2**, **2**, 1]
- Result: **15, 12, 10, 8, 6, 4, 2, 1**

### Example: Tier 4 (CLUB), 8 teams, Doubles

- winnerPoints = 15, targetDrop = 14
- Standard drops: [5, 4, 2, 2, 2, 2, 2] = 19 > 14 → **Hamilton** (-5)
- Proportional reduction: [4, 3, 2, 2, 1, 1, 1]
- Result: **15, 11, 8, 6, 4, 3, 2, 1**

### Example: Tier 1 (MAJOR), 16 players, Singles

- winnerPoints = 50, targetDrop = 49
- Standard drops: [3, 2, 2, 2, 1×11] = 20 < 49 → **level fill** (+29)
- Fills up uniformly: [4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
- Smooth curve from 50 down to 1

## Technical Details

- **State Management**: The wizard maintains a complex object representing the entire tournament draft.
- **Dynamic Points Calculation**: The `calculateRankingPoints()` function accepts 4 parameters: `position`, `tier`, `participantsCount` (default 16), and `mode` ('singles' | 'doubles', default 'singles'). The UI in Step 3 reactively previews the points distribution table based on `textareaParticipantCount` and `gameType`.
- **Cloud Function Sync**: The same NCA formula is duplicated in `functions/src/index.ts` for server-side calculation when a tournament completes. Both implementations must stay in sync.
- **LocalStorage Cleanup**: To prevent stale data between sessions, there are mechanisms to save drafts and clean them when a tournament is successfully created.
