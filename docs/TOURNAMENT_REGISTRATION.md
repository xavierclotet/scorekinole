# Tournament Registration

Self-registration lets logged-in players sign up for DRAFT tournaments from the public page `/tournaments/[id]`. Admins configure registration in the tournament creation wizard (step 2) and manage registrants + waitlist from the tournament detail page (`/admin/tournaments/[id]`).

---

## Data Model

Both `registration` and `waitlist` live directly on the tournament document (no subcollection).

### `TournamentRegistration` — `tournament.registration`

```ts
interface TournamentRegistration {
  enabled: boolean;          // Admin toggle to open/close registration
  deadline?: number;         // Epoch ms — client-side only; expires registration form
  maxParticipants?: number;  // Capacity limit. When full + allowWaitlist → waitlist route
  entryFee?: string;         // Display text, e.g. "10€" or "Gratuito"
  allowWaitlist?: boolean;   // Default true. False = block on full instead of waitlisting
  notifyOnRegistration: boolean;  // Push notification to owner + adminIds on signup
  showParticipantList: boolean;   // Show enrolled players on the public registration form
}
```

> ⚠️ `maxParticipants` counts **participant rows**, not individual players. For doubles each row = 1 pair = 2 players. "16 max" in a doubles tournament = 16 pairs = 32 players.

### `WaitlistEntry` — `tournament.waitlist[]`

```ts
interface WaitlistEntry {
  userId: string;      // Firebase Auth UID
  userName: string;    // Display name captured at waitlist time
  userKey: string;     // 6-char profile key
  registeredAt: number; // Epoch ms
  partner?: {
    type: ParticipantType;
    userId?: string;
    name: string;
  };
}
```

Self-registered participants land in `tournament.participants[]` with `type: 'REGISTERED'`. Guests are added by the admin only (via the wizard step 3 or import).

---

## State Transitions

```
Player clicks "Inscribirse"
       │
       ▼
validateRegistration()  ─── fails ──▶  Error shown to player
       │
       ▼
determineRegistrationOutcome()
       │
       ├─ participants.length < maxParticipants  ──▶  append to participants[]
       │
       └─ full + allowWaitlist !== false         ──▶  append to waitlist[]

Player clicks "Desapuntarme"
       │
       ▼
unregisterFromTournament()
  - removes player from participants[]
  - if waitlist non-empty: FIFO promotes waitlist[0] → participants[]
  - ⚠️ promotion happens regardless of whether registration is still enabled/open

Player clicks "Salir de la lista de espera"
       │
       ▼
leaveWaitlist()  →  removes entry from waitlist[]
```

### Auto-close on tournament start

`tournamentStateMachine.ts` sets `registration.enabled = false` when the tournament transitions DRAFT → GROUP_STAGE.

---

## Concurrency

**All writes use `runTransaction()`** — re-reading the full tournament document inside the transaction. This serializes concurrent registrations so capacity is always respected. See [FIRESTORE_TRANSACTIONS.md](./FIRESTORE_TRANSACTIONS.md).

Functions:
- `registerForTournament()` — `src/lib/firebase/tournamentRegistration.ts:139`
- `unregisterFromTournament()` — `:247`
- `leaveWaitlist()` — `:318`
- `adminPromoteFromWaitlistFirestore()` — `:363` (admin only, no auth guard on caller)
- `adminRemoveFromWaitlistFirestore()` — `:403` (admin only)

---

## Where registration is shown to players

`src/routes/tournaments/[id]/+page.svelte` renders `<TournamentRegistration>` when:

```
tournament.status === 'DRAFT'
&& registration.enabled
&& (!registration.deadline || Date.now() < registration.deadline)
```

⚠️ **Known issue:** the block disappears once the deadline passes, even for users who are already enrolled (they lose the "Desapuntarme" button). Should continue showing enrolment status post-deadline until tournament starts.

---

## Doubles Registration

The registration form has three partner modes:

| Mode | Description |
|------|-------------|
| `search` | Pick a registered user by name search |
| `guest` | Enter a free-text partner name |
| `none` | Admin will assign partner later |

Partner data is stored as `TournamentParticipant.partner` (nested object inside the participant row). There is no second participant row for the partner.

---

## Push Notifications

The `onTournamentRegistration` Cloud Function (`functions/src/index.ts:~1471`) fires when `tournament.participants` or `tournament.waitlist` grows. It sends a push to the tournament's `ownerId` and `adminIds` if `notifyOnRegistration` is true.

⚠️ **Known gap:** when an unregister triggers FIFO promotion (`participants.length` stays the same, `waitlist` shrinks), neither condition fires — the promoted player receives **no notification**. The i18n key `registration_promotedFromWaitlist` exists but is never sent.

---

## Admin Tooling

| Where | What |
|---|---|
| Wizard step 2 (`create/+page.svelte`) | Configure `enabled`, `deadline`, `maxParticipants`, `entryFee`, `allowWaitlist`, `notifyOnRegistration`, `showParticipantList` |
| Wizard step 3 | View + manually add/remove participants and waitlist entries (local state, saved on wizard submit) |
| Tournament detail (`/admin/tournaments/[id]`) | **New (v2.5.9):** Live read-only view of registrants + waitlist; promote/remove waitlist entries via `runTransaction` without re-entering the wizard |

---

## Known Issues

Fixed (v2.5.9):
- ✅ **Partner duplicate via self-register**: `validateRegistration` now accepts a `partnerUserIds` parameter (computed via `collectPartnerUserIds`) and rejects registration when the user already occupies a partner slot. The Firestore caller passes the real partner ids.
- ✅ **Partner search too permissive**: `filterEligiblePartners` helper now excludes self, primary participants, users already assigned as partners, and waitlist entries/partners. `TournamentRegistration.svelte` uses it instead of the old manual filter.
- ✅ **`isUserRegistered` missed partner slots**: component now checks `p.partner?.userId === currentUser.id` so users named as a REGISTERED partner see the "enrolled" UI correctly.
- ✅ **Registration block hidden post-deadline for enrolled users**: `hasRegistration` in the public route now stays `true` when `isCurrentUserEnrolled`, even after deadline has passed, so they keep the "Desapuntarme" / "Salir de la lista" buttons.
- ✅ **Admin has no live view of registrants / waitlist**: new "Inscripciones" section on the admin detail page with promote/remove actions (no wizard re-entry needed).

Still open:
- [ ] **No push on waitlist promotion after unregister**: `onTournamentRegistration` CF uses array length delta to detect changes; a simultaneous remove+promote produces no growth. Promoted player is never notified. The key `registration_promotedFromWaitlist` exists but is never sent.
- [ ] **Firestore rules don't enforce registration invariants server-side**: any authenticated user can overwrite `participants`/`waitlist` directly, bypassing the client-side transaction validation.
- [ ] **`rankingSnapshot: 0` on promoted participants**: `adminPromoteFromWaitlist` always assigns 0. Affects ranking-based seeding.
- [ ] **Error codes not localised**: backend throws strings like `"tournament_full"` which surface raw in the UI error toast.
- [ ] **Hardcoded Spanish strings in doubles panel**: `TournamentRegistration.svelte` contains untranslated labels in the partner selection UI.
- [ ] **`maxParticipants` unit ambiguity for doubles**: the wizard label says "Máximo participantes" but the value counts pairs, not individual players. No hint in the UI.
- [ ] **CF "newly added" detection fragile**: `onTournamentRegistration` uses `array[length-1]` to identify the new participant; any reorder/remove+add in one write mis-identifies the target.
