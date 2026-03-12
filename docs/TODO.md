# TODO - Future Improvements

## Tournament Wizard: Configurable number of qualifiers for final stage

**Priority**: Low
**Area**: Tournament setup wizard (live tournament)

Currently, the default number of qualifiers that advance to the final stage is hardcoded to a minimum of 8. If half the total participants is less than 8, 8 are selected by default.

**Desired behavior**: Add a parameter in the live tournament wizard where the admin can configure how many players advance to the final stage (e.g., 4, 8, 16). If this parameter is not defined, the current automatic logic applies (minimum 8, or half the participants if > 8).

**Files involved**:
- `src/lib/firebase/tournamentTransition.ts` — `calculateDefaultTopNPerGroup()` and `calculateDefaultQualifierCount()` already accept a `minQualifiers` parameter (default: 8). Just need to read it from tournament config.
- `src/routes/admin/tournaments/[id]/transition/+page.svelte` — Pass the tournament config value to these functions.
- Tournament wizard (live tournament creation flow) — Add UI field for this setting.
- `src/lib/types/tournament.ts` — Add field to tournament type (e.g., `finalStageMinQualifiers?: number`).
