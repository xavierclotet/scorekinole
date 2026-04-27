# Table Assignment Algorithm

## Overview

The table assignment system ensures **equitable distribution** of tables across all tournament phases. Every participant should play on as many different tables as possible throughout the tournament, avoiding repetition.

The algorithm considers **both participants' combined table history** when assigning a table to a match. This applies to group stage (Round Robin, Swiss System) and final stage (brackets, consolation, third-place matches).

## Core Algorithm: Fair Table Rotation

The algorithm ensures **no player repeats a table until they've played on all tables** (completed a "cycle"). When that's not possible, it minimizes repetition as much as possible.

### Scoring Formula

For each match (Player A vs Player B) and each available table:

1. Compute `minA` = minimum usage of Player A across **all** tables (1..totalTables)
2. Compute `minB` = minimum usage of Player B across **all** tables
3. `deltaA = usage[A][table] - minA` (how far ahead of cycle this table is for A)
4. `deltaB = usage[B][table] - minB` (how far ahead of cycle this table is for B)

**Selection priority:**
1. **Lowest `primaryScore = max(deltaA, deltaB)`** — cycle fairness (no player repeats ahead of schedule)
2. **Lowest `secondaryScore = usageA + usageB`** — global balance (tiebreak)
3. **Not recently used** by either participant — recency (tiebreak)

If a player hasn't visited some tables yet (min = 0), those unvisited tables get delta = 0 (best score), while already-visited ones get delta > 0 (penalized). This forces rotation through all tables before any repetition.

```
Example: 4 tables, Match = Player A vs Player B

Player A history: [1, 2, 1, 3]  -> T1: 2x, T2: 1x, T3: 1x, T4: 0x  (minA = 0)
Player B history: [2, 3, 2]     -> T1: 0x, T2: 2x, T3: 1x, T4: 0x  (minB = 0)

Per table:
  T1: deltaA=2, deltaB=0 → primary=2, secondary=2
  T2: deltaA=1, deltaB=2 → primary=2, secondary=3
  T3: deltaA=1, deltaB=1 → primary=1, secondary=2
  T4: deltaA=0, deltaB=0 → primary=0, secondary=0  <-- BEST

Result: Table 4 assigned (neither player has used it — completes both cycles)
```

```
Example: cycle enforcement

4 tables, Player A: [1, 2, 1, 3, 2, 3]  -> T1: 2x, T2: 2x, T3: 2x, T4: 0x (minA = 0)

Even though T1-T3 have equal usage (2x each), T4 is strongly preferred
because minA = 0 (T4 never visited), so deltaA for T4 = 0 vs deltaA for T1 = 2.
Player A must visit T4 before repeating any other table.
```

## Table History

The function `buildTableHistory(tournament)` constructs a complete `Map<participantId, tableNumber[]>` by scanning:

1. **Group stage** - Round Robin schedules (`group.schedule`) and Swiss pairings (`group.pairings`)
2. **Final stage** - Gold/Silver bracket matches, third-place matches
3. **Consolation brackets** - All consolation bracket matches (excluding placeholder entries like `LOSER:...`)

This history is built fresh before each assignment and carries table usage across all phases. A player who used Table 1 three times during groups will be assigned other tables during brackets.

## Phase-Specific Behavior

### Round Robin (`roundRobin.ts`)

- **Function**: `assignTablesToRounds(rounds, totalTables, tablesUsedByRound?)`
- All rounds are generated upfront, so the algorithm tracks an internal history as it processes rounds sequentially
- Cross-group coordination via `assignTablesGlobally()` ensures no table is used twice in the same round across different groups
- Uses the same Fair Table Rotation scoring (primaryScore → secondaryScore → recency)

### Swiss System (`swiss.ts`)

- **Function**: `assignTablesWithVariety(matches, totalTables, tableHistory, tablesAlreadyUsed?)`
- Rounds are generated one at a time (admin triggers new round after previous completes)
- Table history is rebuilt from all previous pairings before each new round
- If more matches than tables, excess matches get `tableNumber = undefined` (shown as "TBD" in the UI) and wait for a table to free up

### Brackets / Final Stage (`tournamentBracket.ts`)

- **Functions**: `assignTablesToBrackets()`, `assignTablesToConsolation()`
- Called when brackets are first generated and after each match completes (winner advances, new matches become playable)
- Receives the full tournament table history (groups + previous bracket matches)
- For split brackets (Gold/Silver), tables are distributed between both brackets:
  - If enough tables for all playable matches: each gets the best available
  - If not enough: split proportionally, gold bracket gets priority (`Math.ceil(available / 2)`)
- Consolation brackets follow the same logic, assigned after main bracket tables

### Dynamic Reassignment (`tournamentMatches.ts`)

- **Function**: `reassignFreedTable(tournament, freedTable, groupIndex, roundIndex)`
- When a group-stage match completes and frees a table, it's reassigned to a waiting match (one without a table)
- If multiple matches are waiting, the algorithm uses Fair Table Rotation to rank matches: computes `primaryScore = max(deltaA, deltaB)` for the freed table, picks the match where assigning that table best helps complete a player's cycle
- Since there's only one table available (the freed one), the optimization is about **which match** receives it, not which table to give

## Table Assignment Flow

```
Tournament Start
       |
  [Group Stage]
       |
       +-- Round Robin: assignTablesGlobally() + assignTablesToRounds()
       |     - Internal history per round, cross-group coordination
       |
       +-- Swiss: assignTablesWithVariety()
       |     - History rebuilt from previous pairings each round
       |     - Dynamic: reassignFreedTable() when matches finish
       |
  [Final Stage]
       |
       +-- generateBracket() / generateSplitBrackets()
       |     - buildTableHistory(tournament) includes ALL group matches
       |     - assignTablesToBrackets() uses pickBestTable()
       |
       +-- advanceWinner() / advanceSilverWinner()
       |     - After each match: rebuild history, assign tables to new matches
       |     - assignTablesToConsolation() for consolation brackets
       |
       +-- advanceConsolationWinner()
             - Same pattern: rebuild history, assign best tables
```

## Key Files

| File | Functions |
|------|-----------|
| `src/lib/firebase/tournamentBracket.ts` | `buildTableHistory()`, `pickBestTable()`, `assignTablesToBrackets()`, `assignTablesToConsolation()`, `reassignTables()` |
| `src/lib/algorithms/roundRobin.ts` | `assignTablesToRounds()`, `assignTablesGlobally()` |
| `src/lib/algorithms/swiss.ts` | `assignTablesWithVariety()` |
| `src/lib/firebase/tournamentMatches.ts` | `reassignFreedTable()` |
| `src/lib/firebase/tournamentGroups.ts` | Builds `tableHistory` for Swiss rounds from previous pairings |

## Edge Cases

- **BYE matches**: Skipped entirely (no table needed)
- **Consolation placeholders** (`LOSER:...`): Excluded from history and assignment until real participants are filled in
- **No tables available**: Functions return early; matches remain without table (shown as TBD)
- **Single match waiting + freed table**: Assigned directly without computing history (optimization)
- **`numTables` changes mid-tournament**: `reassignTables()` clears all PENDING table assignments and redistributes with updated count
