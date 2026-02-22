# Firestore Transactions for Tournament Data

## The Problem (Race Condition)

All tournament data (matches, standings, brackets) lives in a **single Firestore document** per tournament (`tournaments/{id}`). When multiple matches sync simultaneously, a read-modify-write pattern without transactions causes data loss:

```
T=0ms: Match A reads tournament (state S0)
T=1ms: Match B reads tournament (same state S0)
T=50ms: Match A writes its result -> state S1
T=100ms: Match B writes its result (based on stale S0) -> S2 overwrites Match A's result!
```

## The Solution: `runTransaction()`

All functions that modify the tournament document use `runTransaction()` from Firebase. Transactions provide **optimistic concurrency control**: if the document changes between the read and the write, the transaction automatically retries (up to 5 times by default).

```
T=0ms: Match A starts transaction, reads S0
T=1ms: Match B starts transaction, reads S0
T=50ms: Match A writes -> S1 (success)
T=100ms: Match B tries to write -> CONFLICT detected (S0 changed to S1)
T=101ms: Match B retries: re-reads S1, applies its changes, writes -> S2 (both results preserved)
```

## Pattern

Every function that writes to the tournament document follows this pattern:

```typescript
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { parseTournamentData } from './tournaments';

async function updateSomething(tournamentId: string, ...): Promise<boolean> {
  if (!db) return false;

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      // 1. Read inside the transaction (NOT getTournament)
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');
      const tournament = parseTournamentData(snapshot.data());

      // 2. Modify in memory (same logic as before)
      // ... find match, update fields, calculate standings, etc.

      // 3. Write atomically via the transaction
      transaction.update(tournamentRef, {
        groupStage: cleanUndefined(tournament.groupStage),  // or finalStage
        updatedAt: serverTimestamp()
      });
    });

    return true;
  } catch (error) {
    console.error('Error:', error);
    return false;
  }
}
```

## Key Rules

1. **NEVER use `getTournament()` + `updateDoc()` for writes.** Always use `runTransaction()` with `transaction.get()` and `transaction.update()`.

2. **`getTournament()` is fine for read-only operations** (e.g., `resumeTournamentMatch`, UI data loading).

3. **Use `parseTournamentData()`** (exported from `tournaments.ts`) to convert Firestore Timestamps to numbers inside transactions.

4. **`serverTimestamp()` works inside transactions.** Always include `updatedAt: serverTimestamp()` in transaction writes.

5. **Keep `applyRankingUpdates()` OUTSIDE transactions.** It writes to user profile documents (different Firestore docs), not the tournament. Running it outside avoids unnecessary contention on the tournament document.

6. **Inline standings calculation** inside the same transaction as match updates. Use `calculateStandings(tournament, groupIndex)` (pure function in `tournamentMatches.ts`) instead of a separate read-write cycle.

7. **`cleanUndefined()`** must be called before writing to Firestore (it strips `undefined` values which Firestore rejects).

## Functions Using Transactions

### `tournamentMatches.ts`

| Function | What it writes | Notes |
|----------|---------------|-------|
| `updateMatchResult()` | `groupStage` | Match result + standings in one atomic write |
| `updateTournamentMatchRounds()` | `groupStage` or `finalStage` | Real-time round sync during gameplay |
| `startTournamentMatch()` | `groupStage` or `finalStage` | Sets match to IN_PROGRESS |
| `abandonTournamentMatch()` | `groupStage` or `finalStage` | Reverts match to PENDING |
| `markNoShow()` | `groupStage` | Walkover + standings in one atomic write |
| `updateMatchVideo()` | `groupStage` or `finalStage` | Video URL update |

### `tournamentBracket.ts`

| Function | What it writes | Notes |
|----------|---------------|-------|
| `updateBracketMatch()` | `finalStage` | Gold bracket match update |
| `updateSilverBracketMatch()` | `finalStage` | Silver bracket match update |
| `updateConsolationMatch()` | `finalStage` | Consolation match update |
| `advanceWinner()` | `finalStage` (+ `status`, `participants` if complete) | Gold bracket winner advancement |
| `advanceSilverWinner()` | `finalStage` (+ `status`, `participants` if complete) | Silver bracket winner advancement |
| `advanceConsolationWinner()` | `finalStage` (+ `status`, `participants` if complete) | Consolation winner advancement |

## Scalability

- Firestore transactions retry up to **5 times** by default
- With 50+ concurrent matches, some transactions may need 2-3 retries, adding ~100-300ms latency
- No result is ever lost; worst case is a temporary delay
- For extreme concurrency, `maxAttempts` can be increased: `runTransaction(db, callback, { maxAttempts: 10 })`
