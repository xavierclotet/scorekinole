# Tournament Admin Features

## Force Finish (Fin por tiempo)

Admins can force-finish a tournament match when time runs out.

**Admin Side** (`/admin/tournaments/[id]/bracket`):
- `MatchResultDialog.svelte` shows "Fin por tiempo" button when `isAdmin && hasPartialWinner && !canSave`
- Saves current result with whoever is winning

**Client Side** (`/game`):
- Subscribes to match status via `subscribeToMatchStatus()` in `tournamentSync.ts`
- If admin completes match externally, client shows modal informing the player
- Player clicks "Entendido" to exit tournament mode

**Key Files**: `tournamentSync.ts`, `MatchResultDialog.svelte`, `game/+page.svelte`

## Walkover (WO) & Disqualification (DSQ)

### Walkover (WO)
- Participant doesn't show up for a **specific match**
- Admin calls `markNoShow()` in `tournamentSync.ts`
- Match status → `WALKOVER`, opponent wins
- Visual: Orange "WO" badge, name with strikethrough

### Disqualification (DSQ)
- Participant removed from **entire tournament**
- Admin calls `disqualifyParticipant()` in `tournamentParticipants.ts`
- Participant status → `DISQUALIFIED`
- **All pending matches** auto-marked as `WALKOVER`
- Visual: Red "DSQ" badge, name with strikethrough

### Key Files

| File | Function | Purpose |
|------|----------|---------|
| `tournamentParticipants.ts` | `disqualifyParticipant()` | Mark as DSQ, resolve all pending matches |
| `tournamentParticipants.ts` | `fixDisqualifiedMatches()` | Fix pending matches vs DSQ (on bracket load) |
| `tournamentSync.ts` | `markNoShow()` | Mark specific match as walkover |
| `tournamentBracket.ts` | `reassignTables()` | Reassign tables to playable matches |

### Auto-fix on Bracket Load
1. `fixDisqualifiedMatches()` - Resolves pending matches vs DSQ participants
2. `reassignTables()` - Assigns tables to playable matches without tables

### Transition Page (`/admin/tournaments/[id]/transition`)
- DSQ participants excluded from gold/silver bracket distribution
- DSQ/WO badges shown in round results
