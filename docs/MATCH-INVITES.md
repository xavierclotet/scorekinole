# Match Invitations for Friendly Matches

This document describes the match invitation system that allows registered users to invite others to play friendly matches, with both players' stats being tracked.

## Overview

The system enables:
1. Logged-in users to assign themselves to a team using the "+" button
2. Creating invitations via QR code or shareable link
3. Another registered user accepting the invitation
4. Both players' userIds being saved when the match syncs to Firebase

## User Flow

### Host (Creates Invitation)

1. User logs in and navigates to `/game` (friendly match mode)
2. Clicks the "+" button next to their team name
3. System assigns their userId, display name, and photo to that team
4. An "Invite Player" button appears (green floating button)
5. Clicking it generates:
   - A 6-character invite code (e.g., "ETNP6A")
   - A QR code containing the invite URL
   - A shareable link (`/join?invite=ETNP6A`)
6. The invite modal shows real-time status updates
7. When guest accepts, the modal updates to show "[Name] se ha unido"
8. Host continues playing on their device with both userIds tracked

### Guest (Accepts Invitation)

1. Guest scans QR code or opens the invite link
2. `/join` page shows:
   - Host's name and avatar
   - Match configuration (game mode, points/rounds)
3. If not logged in, guest must sign in with Google
4. Clicks "Accept Invitation" button
5. System links their userId to the invitation
6. Success message shown - **no need to navigate to /game**
7. Match plays on host's device; stats saved for both players

## Technical Architecture

### Files Created

| File | Purpose |
|------|---------|
| `src/lib/types/matchInvite.ts` | Type definitions for invitations |
| `src/lib/stores/matchInvite.ts` | Svelte stores for invite state |
| `src/lib/firebase/matchInvites.ts` | Firebase CRUD operations |
| `src/lib/components/PlayerAssignButton.svelte` | "+" button component |
| `src/lib/components/InvitePlayerModal.svelte` | QR code modal |
| `src/routes/join/+page.svelte` | Invitation acceptance page |

### Files Modified

| File | Changes |
|------|---------|
| `src/lib/types/team.ts` | Added `userId` and `userPhotoURL` fields |
| `src/lib/stores/teams.ts` | Added user assignment functions |
| `src/lib/components/TeamCard.svelte` | Integrated PlayerAssignButton |
| `src/routes/game/+page.svelte` | Added invite handlers and UI |
| `firestore.rules` | Added `matchInvites` collection rules |
| `messages/es.json` | Added translation keys |

### Data Model

```typescript
interface MatchInvite {
  id: string;
  inviteCode: string;              // "ETNP6A"
  createdAt: Timestamp;
  expiresAt: Timestamp;            // 1 hour from creation
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';

  // Host info
  hostUserId: string;
  hostUserName: string;
  hostUserPhotoURL: string | null;
  hostTeamNumber: 1 | 2;

  // Guest info (filled when accepted)
  guestUserId?: string;
  guestUserName?: string;
  guestUserPhotoURL?: string | null;
  guestTeamNumber?: 1 | 2;

  // Match configuration
  matchContext: {
    team1Name: string;
    team1Color: string;
    team2Name: string;
    team2Color: string;
    gameMode: 'points' | 'rounds';
    pointsToWin: number;
    roundsToPlay: number;
    matchesToWin: number;
  };
}
```

### Firestore Security Rules

```javascript
match /matchInvites/{inviteId} {
  // Anyone can read (to validate invite codes)
  allow read: if true;

  // Authenticated users can create (must be the host)
  allow create: if isAuthenticated() &&
    request.resource.data.hostUserId == request.auth.uid;

  // Host can update/cancel, or guest can accept pending invites
  allow update: if isAuthenticated() && (
    resource.data.hostUserId == request.auth.uid ||
    (resource.data.status == 'pending' &&
     request.resource.data.status == 'accepted' &&
     request.resource.data.guestUserId == request.auth.uid)
  );

  // Host can delete their own invites
  allow delete: if isAuthenticated() &&
    resource.data.hostUserId == request.auth.uid;
}
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Invitation expired (>1 hour) | Shows "La invitación ha expirado" |
| User tries to accept own invite | Shows "No puedes unirte a tu propia invitación" |
| Invite already accepted by another user | Shows "Esta invitación ya fue usada" |
| Same guest tries to accept again | Shows "Ya aceptaste esta invitación" |
| Host creates new invite | Previous pending invite auto-cancelled |
| Guest doesn't accept before match ends | Match syncs with only host's userId |

## Translation Keys

All keys are prefixed with `invite_` or `join_`:

```
invite_assignSelf, invite_unassign, invite_invitePlayer,
invite_inviteCode, invite_scanQR, invite_orEnterCode,
invite_copyLink, invite_linkCopied, invite_cancelInvite,
invite_waitingForPlayer, invite_playerJoined,
join_pageTitle, join_invitedBy, join_acceptInvite,
join_signInToAccept, join_inviteNotFound, join_inviteExpired,
join_alreadyAccepted, join_cannotJoinOwnInvite, join_successTitle,
join_successDesc, join_alreadyUsed, join_matchConfig,
join_accepting
```

## Important Notes

1. **Match plays on host's device only** - The guest just accepts to link their userId
2. **Invitations expire after 1 hour** - Security measure
3. **Only registered users can accept** - Required for userId tracking
4. **Stats count for both players** - Both userIds saved to `/matches` on sync
5. **QR codes use `qrcode` npm package** - Install with `npm install qrcode`
