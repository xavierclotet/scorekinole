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

**Tournament matches only**: On reconnect, automatically syncs current match data to Firebase.
**Friendly matches**: Manual "Sync All" button in History Modal.

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
});

// Admin pages:
setSyncStatus('syncing');
const success = await completeMatch(...);
setSyncStatus(success ? 'success' : 'error');
```
