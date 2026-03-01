# PWA Push Notifications & Wake Lock

This document covers the push notification infrastructure and Screen Wake Lock feature added in v2.4.51.

## Overview

Scorekinole uses **Firebase Cloud Messaging (FCM)** for web push notifications and the **Screen Wake Lock API** to prevent the display from turning off during match scoring. Notifications are opt-in, per-category, and triggered by server-side Cloud Functions.

---

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Browser /   │     │  Firebase Cloud   │     │   Firestore   │
│  Service     │◄────│  Messaging (FCM)  │◄────│   Cloud       │
│  Worker      │push │                   │send │   Functions   │
└──────┬───────┘     └──────────────────┘     └───────┬───────┘
       │click                                         │trigger
       ▼                                              │
┌──────────────┐                              ┌───────┴───────┐
│  App window  │                              │  Tournament   │
│  /tournaments│                              │  doc update   │
│  /game       │                              │  (onWrite)    │
└──────────────┘                              └───────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/firebase/messaging.ts` | FCM token management, permission request, foreground listener |
| `src/lib/firebase/config.ts` | Lazy `getFirebaseMessaging()` initialization |
| `src/lib/types/notifications.ts` | `NotificationPreferences` interface and defaults |
| `src/lib/firebase/userProfile.ts` | `saveNotificationPreferences()`, `notificationPreferences` field on `UserProfile` |
| `src/lib/components/NotificationSettings.svelte` | UI toggles for notification preferences |
| `src/lib/components/ProfileModal.svelte` | Hosts `NotificationSettings` |
| `src/service-worker.ts` | `push` and `notificationclick` event handlers |
| `src/lib/utils/wakeLock.ts` | Screen Wake Lock utility |
| `src/routes/game/+page.svelte` | Wake Lock integration (acquire on mount, release on destroy) |
| `functions/src/index.ts` | `sendPushToUser()` helper + `onTournamentMatchEvent` Cloud Function |
| `static/manifest.webmanifest` | `gcm_sender_id` for FCM |
| `.env` | `VITE_FIREBASE_VAPID_KEY` (VAPID public key) |

---

## Screen Wake Lock

Prevents the device screen from turning off while a match is being scored.

### How It Works

- `requestWakeLock()` calls `navigator.wakeLock.request('screen')` on game page mount
- `releaseWakeLock()` releases the lock on game page destroy
- A `visibilitychange` listener automatically re-acquires the lock when the user returns to the tab (the browser releases the lock when the tab is hidden)
- Feature detection: silently no-ops if the Wake Lock API is unavailable

### Files

- **`src/lib/utils/wakeLock.ts`**: Exports `requestWakeLock()` and `releaseWakeLock()`
- **`src/routes/game/+page.svelte`**: Calls them in `onMount` / `onDestroy`

---

## FCM Token Management

### Token Lifecycle

1. **Permission Request**: User enables notifications in Profile > Notification Settings
2. **Token Generation**: `getToken()` from `firebase/messaging` using the VAPID key
3. **Token Storage**: Saved to `users/{userId}/fcmTokens/{tokenHash}` in Firestore
4. **Token Refresh**: `onMessage()` listener handles token rotation automatically
5. **Token Cleanup**: Invalid tokens (`messaging/registration-token-not-registered`) are auto-deleted by the Cloud Function when sending fails
6. **Logout**: All tokens for the user are deleted from Firestore

### Token Document Structure

```
users/{userId}/fcmTokens/{hash}
├── token: string        // The full FCM token
├── createdAt: Timestamp // When the token was registered
└── userAgent: string    // Browser user agent for device identification
```

The document ID (`{hash}`) is the first 16 hex characters of a SHA-256 hash of the token. This allows multiple devices per user without duplicate tokens.

### VAPID Key

The VAPID public key is stored in `.env` as `VITE_FIREBASE_VAPID_KEY`. It's used by `getToken()` to authenticate the app with FCM. Generate a VAPID key pair in the Firebase Console > Project Settings > Cloud Messaging > Web Push certificates.

---

## Notification Preferences

### Data Model

```typescript
interface NotificationPreferences {
  enabled: boolean;                    // Master toggle
  tournament_matchReady: boolean;      // "Your match is ready" (table assigned)
  tournament_phaseChange: boolean;     // Phase transitions
  tournament_ranking: boolean;         // Ranking updates
  friendly_inviteResponse: boolean;    // Invite accepted/declined
}
```

Stored on the `UserProfile` document in Firestore as `notificationPreferences`. Defaults: all `false`.

### UI

The `NotificationSettings` component (inside `ProfileModal`) shows:
- A master toggle that triggers the browser permission prompt on first activation
- Per-category toggles grouped in cards (only visible when master toggle is on):
  - **Torneos**: match ready, phase change, ranking
  - **Partidas amistosas**: invite response
- Master toggle does NOT auto-enable sub-toggles — all default to `false`
- Each toggle saves immediately to Firestore (independent of the ProfileModal save button)
- A "denied" message if the user blocked notifications at the browser level

---

## Service Worker Push Handling

Added to `src/service-worker.ts`:

### `push` Event

Parses the push event data (JSON) and shows a system notification:

```typescript
sw.addEventListener('push', (event) => {
  const { title, body, icon, url, tag } = event.data?.json() ?? {};
  event.waitUntil(
    sw.registration.showNotification(title || 'Scorekinole', {
      body, icon: icon || '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: url || '/' },
      tag, renotify: !!tag,
    })
  );
});
```

### `notificationclick` Event

Handles notification clicks with three strategies to ensure the deep-link always reaches the app:

1. **Exact URL match**: If a window is already at the target URL → send `postMessage` + focus (ensures the app re-processes the key even if URL is identical)
2. **Navigate existing window**: Call `client.navigate(absoluteUrl)` + send `postMessage` as fallback (Android PWAs may not navigate reliably from background)
3. **Open new window**: If no existing windows → `openWindow(absoluteUrl)`

### Deep-Link Flow (`/game?key=...`)

When a match-ready notification is clicked, the URL `/game?key={tournamentKey}` is processed through multiple layers:

```
SW notificationclick
  ├─ navigate() or postMessage({ type: 'PUSH_NAVIGATE', url })
  ▼
+layout.svelte (message listener)
  ├─ URL differs from current → goto(target)
  └─ URL same → dispatch CustomEvent('push-deep-link')
  ▼
game/+page.svelte
  ├─ $effect on page.url.searchParams.get('key') → processes key
  ├─ push-deep-link event listener → fallback, calls handleJoinTournament() directly
  └─ replaceState(pathname) → cleans URL using SvelteKit's replaceState
      (NOT window.history.replaceState, which desynchronizes the page store)
```

**Key design decision**: SvelteKit's `replaceState` from `$app/navigation` is used instead of `window.history.replaceState` to keep the `page` store in sync. This ensures the layout's URL comparison works correctly for subsequent notifications.

---

## Cloud Function: Match Ready Notification

### Trigger

`onTournamentMatchEvent` is an `onDocumentUpdated` Cloud Function that fires when a tournament document changes. It diffs the before/after match data to detect when a match gets a new `tableNumber` assignment.

### Match Extraction (`extractAllMatches`)

Extracts matches from all tournament structures with notification context metadata:

- **Group stage**: `groupStage.groups[].schedule[].matches[]` and `.pairings[].matches[]`
- **Gold bracket**: `finalStage.goldBracket.rounds[].matches[]` + `thirdPlaceMatch`
- **Silver bracket**: `finalStage.silverBracket.rounds[].matches[]` (SPLIT_DIVISIONS mode)
- **Parallel brackets**: `finalStage.parallelBrackets[].bracket.rounds[].matches[]` (A/B/C Finals)
- **Consolation brackets**: Nested inside each `BracketWithConfig.consolationBrackets[]`

Each extracted match includes context: `phase` (GROUP/FINAL/CONSOLATION), `groupName`, `roundNumber`/`roundName`, `bracketLabel`, `isThirdPlace`.

### Localized Notifications

Notifications are sent in each user's preferred language (fetched from `users/{userId}.language`). Supported: `es`, `ca`, `en` (defaults to `es`).

Translation map (`notificationStrings`) covers: phase names, round prefix, table, "you vs.", 3rd place label.

### Logic

1. Extract all matches from groupStage and finalStage (before and after) with context metadata
2. Compare: find matches where `tableNumber` changed from unset to a value
3. For each newly assigned match, look up both participants' `userId`
4. Fetch each user's language preference from their Firestore profile
5. Check each user's `notificationPreferences.tournament_matchReady`
6. Send localized push via `sendPushToUser()`:
   - **Tag**: `match-ready-{matchId}` (prevents duplicate notifications)
   - **URL**: `/game?key={tournamentKey}`

### Notification Title by Phase

| Phase | Example Title (es) |
|-------|-------------------|
| Group stage (1 group) | `Fase de Grupos · Ronda 2` |
| Group stage (multi) | `Fase de Grupos · Grupo B · Ronda 1` |
| Finals | `Fase Final · Semifinales` |
| Finals (silver bracket) | `Fase Final · Plata · Final` |
| Finals (parallel) | `Fase Final · A Finals · Cuartos` |
| 3rd place match | `Fase Final · 3er/4to puesto` |
| Consolation | `Consolación · Final` |

### Notification Body

`Mesa {N}: Tú vs. {OpponentName}` (localized per user language)

### `sendPushToUser()` Helper

Generic function to send a push notification to a specific user:

1. Query `users/{userId}/fcmTokens` subcollection
2. Check `notificationPreferences.enabled` (respect master toggle)
3. Send to each registered token via `firebase-admin/messaging`
4. Auto-delete invalid tokens on `messaging/registration-token-not-registered` errors

---

## Manifest Configuration

`static/manifest.webmanifest` includes:

```json
"gcm_sender_id": "103953800507"
```

This is the **standard Firebase sender ID** for web push (same for all Firebase projects). Required by the browser to accept push subscriptions.

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_FIREBASE_VAPID_KEY` | VAPID public key from Firebase Console | Yes (for push) |
| `VITE_FIREBASE_ENABLED` | Enables Firebase integration | Yes |

---

## Testing

### Local Development

- **Wake Lock**: Works on `localhost` in Chrome/Edge
- **Push Notifications**: Require HTTPS. Use `npm run preview:prod` for local testing with the production build, or test on `scorekinole.web.app`

### Testing Flow

1. **Enable notifications**: Log in > Profile > Toggle "Enable notifications"
2. **Browser prompt**: Accept the browser notification permission
3. **Verify token**: Check Firestore `users/{uid}/fcmTokens/` for a new document
4. **Test push**: Use Firebase Console > Messaging > Send test message with the FCM token
5. **Match ready**: Assign a table to a tournament match from the admin panel > both players should receive a push
6. **Click notification**: Tapping should open/focus the app at `/game?key={key}`
7. **Disable category**: Turn off "Match ready" toggle > assign another table > no push should arrive
8. **Multi-device**: Log in on two devices > both should receive notifications
9. **Logout**: Sign out > tokens should be deleted from Firestore

---

## Service Worker Update & ReloadPrompt

### Update Detection Flow

The SW uses `skipWaiting()` on install and `clients.claim()` on activate, so updates take effect immediately.

```
Deploy new version
  ▼
Browser detects new SW (on page load, visibilitychange, or every 10 min)
  ▼
New SW installs → skipWaiting() → activates → clients.claim()
  ▼
+layout.svelte: 'updatefound' event fires
  ▼
Is current page safe to reload? (isSafeToReload)
  ├─ YES → window.location.reload() (seamless auto-update)
  └─ NO  → showReloadPrompt = true (toast with "Update" button)
```

### Protected Paths

```typescript
const PROTECTED_PATHS = ['/game', '/admin'];
```

Pages starting with `/game` or `/admin` are **never** auto-reloaded to avoid interrupting active matches or tournament management. All other pages auto-reload silently.

### Auto-Reload on Navigation

An `$effect` watches `showReloadPrompt` + `page.url.pathname`. If the user navigates **away** from a protected path while the prompt is active, the page auto-reloads immediately (no need to click the button).

### ReloadPrompt Component

`src/lib/components/ReloadPrompt.svelte` — frosted glass toast at bottom center with:
- Pulsing dot indicator
- Localized "New version available" message
- "Reload" button
- Dismiss (X) button

### Update Check Triggers

| Trigger | Frequency |
|---------|-----------|
| Page load | Immediate |
| `visibilitychange` (tab/app focus) | Each time |
| Interval | Every 10 minutes |

---

## Future Notification Types (Planned)

These categories exist in the preferences UI but don't have Cloud Function triggers yet:

| Category | Trigger | When |
|----------|---------|------|
| `tournament_phaseChange` | Phase status change | Group stage ends, knockout begins, tournament completes |
| `tournament_ranking` | Ranking recalculation | Tournament completes and rankings are updated |
| `friendly_inviteResponse` | Invite status change | Opponent accepts or declines a friendly match invitation |
