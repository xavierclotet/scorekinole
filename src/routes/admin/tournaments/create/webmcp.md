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
   - **Dynamic Ranking Points**: The points distribution is dynamic. Maximum points assume an ideal baseline of 16 participants. If the user configures fewer than 16 participants (in Step 4), the points are scaled down proportionally to ensure fairness. The UI previews this dynamically based on `textareaParticipantCount`.
4. **Participants**:
   - Organizers can input participants (singular or pairs) manually, search from registered users, or add guests.
   - A counter warns if the number of participants exceeds the capacity of the configured tables.
5. **Time & Tables Configuration**:
   - Define the number of physical tables available.
   - Set the estimated duration per game and break times between matches and phases.
   - The UI presents a summary of the estimated tournament duration (which is informative, as matches can end earlier or later in reality).
6. **Review & Create**: Final rundown of the configuration before pushing `createTournamentLive` to Firebase.

## Technical Details

- **State Management**: The wizard maintains a complex object representing the entire tournament draft.
- **Dynamic Points Calculation**: Handled by `src/lib/algorithms/ranking.ts` -> `calculateRankingPoints()`. It takes a third optional argument `participantsCount` to compute the multiplier `Math.min(1, participantsCount / 16)`.
- **LocalStorage Cleanup**: To prevent stale data between sessions, there are mechanisms to save drafts and clean them when a tournament is successfully created.
