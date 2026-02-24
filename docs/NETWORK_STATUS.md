# Network Status & Offline Mode

The app includes a network status indicator and automatic sync recovery for tournament matches.

## Key Files
- `src/lib/utils/networkStatus.ts`: Network status detection and sync state management
- `src/lib/components/OfflineIndicator.svelte`: Visual indicator component

## Network Status Store (`networkStatus.ts`)

```typescript
export const isOnline: Readable<boolean>;
export const syncStatus: Writable<SyncStatus>; // 'idle' | 'syncing' | 'success' | 'error'
export const connectionStatus: Readable<'online' | 'offline' | 'syncing' | 'synced' | 'sync-error'>;
export function onReconnect(callback: () => void | Promise<void>): () => void;
export function setSyncStatus(status: SyncStatus, autoResetMs?: number): void;
```

## OfflineIndicator Component

Displays in: game page header, admin bracket page, admin groups page.

| State | Color | Icon | Description |
|-------|-------|------|-------------|
| Offline | Amber | WiFi-off | No internet |
| Syncing | Blue | Spinning refresh | Sync in progress |
| Synced | Green | Cloud-check | Success (fades after 3s) |
| Error | Red | Cloud-warning | Sync failed |

Hidden when online and idle.

## Auto-Sync Behavior

### Tournament matches
On reconnect, automatically syncs current match round data to Firebase via `onReconnect` callback.

### Friendly matches — Offline protection
If a friendly match completes while offline, the Firestore `setDoc` fails silently. To prevent data loss, the app saves the match to `localStorage` (key: `pendingFriendlyMatch`) **before** attempting the write.

- **On success**: the pending entry is removed from `localStorage`.
- **On failure**: the entry stays as a backup. Retry happens automatically:
  - On `onReconnect` (browser `online` event)
  - On `onMount` of the game page (covers app restart scenarios)
- **No duplicates**: `setDoc` uses the same `matchId` generated at completion time, so retries are idempotent.
- **Only saves if there's a registered player**: matches with no logged-in user on either side are not backed up (they wouldn't be saved to Firestore anyway).

Key files:
- `src/lib/firebase/firestore.ts`: `savePendingFriendlyMatch()`, `removePendingFriendlyMatch()`, `retryPendingFriendlyMatch()`
- `src/lib/components/TeamCard.svelte`: `saveMatchToHistory()` — saves pending before Firestore write
- `src/routes/game/+page.svelte`: retry in `onMount` and `onReconnect`

## Implementation Patterns

```typescript
// Game page (onMount):
const unsubReconnect = onReconnect(async () => {
  const context = get(gameTournamentContext);
  if (context && !tournamentMatchCompletedSent) {
    setSyncStatus('syncing');
    const savedData = saveTournamentProgressToLocalStorage();
    if (savedData) {
      await syncTournamentRounds(savedData.allRounds, savedData.gamesWonA, savedData.gamesWonB);
      setSyncStatus('success');
    }
  }

  // Retry pending friendly match
  await retryPendingFriendlyMatch();
});

// Admin pages:
setSyncStatus('syncing');
const success = await completeMatch(...);
setSyncStatus(success ? 'success' : 'error');
```
