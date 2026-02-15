# Doubles Tournaments

When `gameType === 'doubles'`, tournaments track **two players per participant** using the `partner` field.

## Architecture

**No separate `/pairs` collection** - pairs are stored directly in the tournament participant:

```typescript
// TournamentParticipant for doubles
{
  id: string;
  name: string;            // Player 1's REAL name (always)
  type: 'REGISTERED' | 'GUEST';
  userId?: string;
  photoURL?: string;
  teamName?: string;       // Optional artistic name (display only), e.g., "Los Invencibles"
  partner: {
    name: string;          // Player 2's REAL name (always)
    type: 'REGISTERED' | 'GUEST';
    userId?: string;
    photoURL?: string;
  };
}
```

## Team Name vs Player Names

The `teamName` is **optional** and purely for display. Real player names are **always stored** separately.

| Scenario | `name` | `partner.name` | `teamName` | Display |
|----------|--------|----------------|------------|---------|
| No team name | "María" | "Carlos" | `undefined` | "María / Carlos" |
| With team name | "María" | "Carlos" | "Los Tigres" | "Los Tigres" |

**Why store real names separately?** Ranking points go to individual players, each has their own profile, and players can form different pairs each tournament.

## Display Logic

```typescript
import { getParticipantDisplayName } from '$lib/types/tournament';
const displayName = getParticipantDisplayName(participant, isDoubles);
// Returns: teamName if set, otherwise "Player1 / Player2"
// ALWAYS use this helper in UI
```

## Key Design Decisions
- **No `/pairs` collection** - pairs exist only within tournaments
- **Real names always stored** - `name` and `partner.name` are NEVER artistic names
- **`teamName` is optional** - for display only, not used for ranking
- **Rankings go to individuals** - both players receive same points to their personal ranking

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/types/tournament.ts` | `TournamentParticipant` interface with `partner`, `teamName`, `getParticipantDisplayName()` |
| `src/lib/components/tournament/PairSelector.svelte` | UI for adding pairs |
| `src/lib/firebase/tournamentRanking.ts` | `applyRankingUpdates()` - client-side ranking for both players |
| `src/lib/firebase/tournamentBracket.ts` | Calls `applyRankingUpdates()` when bracket completes |
| `functions/src/index.ts` | Cloud Function (backup) ranking |
| `src/routes/tournaments/[id]/+page.svelte` | Public page display |

## Ranking in Doubles

- Both players receive the **same** ranking points (calculated by tier)
- Tournament record added to **each player's** individual `tournaments[]` array
- Real names (`name`, `partner.name`) are used for user lookup, never `teamName`

**Ranking is applied from two places (redundantly for safety):**
1. **Client-side** (`tournamentBracket.ts`): When bracket marks tournament as COMPLETED
2. **Cloud Function** (`functions/src/index.ts`): Triggers on Firestore `status` change (backup)

## UI Flow (Tournament Creation Step 4)

- `gameType === 'doubles'` → shows `PairSelector` component
- `PairSelector` flow:
  1. Select Player 1 (registered or guest)
  2. Select Player 2 (registered or guest)
  3. Team Name (optional) - if empty displays as "Player1 / Player2"
  4. Add Pair

## User Management

Admins can filter "Possible pairs" (`admin_possiblePairs`) to find erroneous user entries:
- Users with names containing " / " (old pair format from legacy bugs)
- GUEST users without email that look like team names
