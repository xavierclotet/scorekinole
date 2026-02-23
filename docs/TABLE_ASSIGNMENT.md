# Table Assignment Algorithm

## Overview

The table assignment system ensures **equitable distribution** of tables across all tournament phases. Every participant should play on as many different tables as possible throughout the tournament, avoiding repetition.

The algorithm considers **both participants' combined table history** when assigning a table to a match. This applies to group stage (Round Robin, Swiss System) and final stage (brackets, consolation, third-place matches).

## Core Algorithm: `pickBestTable()`

For each match that needs a table, the algorithm:

1. Gets the full table history for both participants (all tables they've played on across ALL phases)
2. For each available table, calculates `combinedUsage = usageByA + usageByB`
3. Picks the table with the **lowest combined usage**
4. On tie, prefers the table **not recently used** by either participant

```
Example: 4 tables, Match = Player X vs Player Y

Player X history: [1, 2, 1, 3]  -> Table 1: 2x, Table 2: 1x, Table 3: 1x, Table 4: 0x
Player Y history: [2, 3, 2]     -> Table 1: 0x, Table 2: 2x, Table 3: 1x, Table 4: 0x

Combined usage per table:
  Table 1: 2 + 0 = 2
  Table 2: 1 + 2 = 3
  Table 3: 1 + 1 = 2
  Table 4: 0 + 0 = 0  <-- BEST (lowest combined usage)

Result: Table 4 assigned
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
- Uses the same "least combined usage" logic with tie-breaking on recently used tables

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
- If multiple matches are waiting, the algorithm picks the one whose participants have used that specific freed table the **least**
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
