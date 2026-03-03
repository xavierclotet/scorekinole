# Tournament Import Wizard (`/admin/tournaments/import`)

This route handles importing completed (historical) tournaments through a 4-step wizard. It supports multiple modes: fresh import, edit, duplicate, and transform-to-LIVE.

## Modes

| Mode | URL param | Description |
|------|-----------|-------------|
| Fresh import | (none) | Create new IMPORTED tournament from text data |
| Edit | `?edit=<id>` | Modify existing imported tournament |
| Duplicate | `?duplicate=<id>` | Copy tournament with incremented edition |
| Transform to LIVE | `?transform_to_live=<id>` | Convert IMPORTED → LIVE with full config |

## Wizard Steps

### Step 1: Basic Info
Name, edition, date/time, city, country, game type (singles/doubles), ranking config, description, external link, poster URL, test flag.

### Step 2: Participants & Group Stage (combined)
Two input formats supported:

**Standings-only format:**
```
Grupo 1
Harry Rowe,63,90
Chris Robinson,58,70
```

**Round-based format (SS R1 / RR R1):**
```
SS R1
Harry Rowe,Chris Robinson,8,2
2,0,1,0
0,2,0,1
SS R2
...
```

Round-based format auto-detects groups via connected components (Union-Find), computes standings from match data including **BYE bonus** (odd player counts), and populates the preview with full match details.

**Preview phase** (after parsing):
- Shows group standings tables with positions, points, 20s
- **Classification toggle** (WINS/POINTS) — only for round-based data with matches. Changes recompute standings live via `computeStandingsFromMatches()`
- **Tiebreaker priority reorder** — drag arrows to reorder: h2h, total20s, totalPoints, buchholz. `totalPoints` hidden in POINTS mode. Stored as `tiebreakerPriority` on the tournament's groupStage

### Step 3: Knockout Stage
Text-based bracket input. Supports parallel brackets (A/B/C), split divisions (Gold/Silver), single bracket. BYE matches auto-calculated via `addByeMatchesToBrackets()`. Can skip for GROUP_ONLY tournaments.

### Step 4: Review & Submit
Compact review of all data. Knockout section hidden when no brackets exist. Submit calls `createHistoricalTournament()` which:
- Builds participant map, group schedule, standings
- Applies BYE bonus (wins + points for missed rounds)
- Builds `headToHeadRecord` from match data
- Calls `resolveTiebreaker()` with configured priority
- Strips undefined values for Firebase compatibility
- Sets `isImported: true`, `status: 'COMPLETED'`

## Key State Variables

| Variable | Type | Description |
|----------|------|-------------|
| `qualificationMode` | `'WINS' \| 'POINTS'` | How standings points are computed |
| `tiebreakerPriority` | `TiebreakerCriterion[]` | Ordered tiebreaker criteria |
| `groups` | `GroupEntry[]` | Groups with standings and optional matches |
| `brackets` | `BracketEntry[]` | Knockout brackets with rounds and matches |
| `parsePhase` | `'input' \| 'preview'` | Current phase of group stage input |
| `isGroupOnly` | `boolean` | No final stage |
| `transformMode` | `boolean` | Converting to LIVE tournament |

## Transform Mode (LIVE config)

When `transformMode` is true, Step 2 shows additional tournament configuration:
- Group stage type (Round Robin / Swiss), num groups/rounds
- Qualification mode toggle (WINS/POINTS)
- Match config (points/rounds, best-of)
- Final stage mode (Single/Split/Parallel), bracket configs
- Third place match, consolation toggles

## Technical Details

- **Draft persistence**: All wizard state saved to `localStorage` under `tournamentImportDraft`
- **User search**: Each parsed participant name is searched in Firebase for auto-linking registered users
- **Parser**: `groupStageParser.ts` handles both standings and round-based formats
- **Firebase**: `tournamentImport.ts` → `createHistoricalTournament()` builds the full Tournament document
- **Tiebreaker**: `resolveTiebreaker()` from `src/lib/algorithms/tiebreaker.ts` — same algorithm used by LIVE tournaments
