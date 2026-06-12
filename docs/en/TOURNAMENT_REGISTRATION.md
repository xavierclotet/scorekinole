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

## Concurrency & enforcement

**Self-service writes go through the `tournamentSelfRegistration` Cloud Function** (`functions/src/index.ts`, region `europe-west1`). Firestore rules can only validate *which* keys an update touches (`affectedKeys`), not the content of the `participants`/`waitlist` arrays — a rules-based allowance let any authenticated user rewrite both arrays on a DRAFT tournament. The callable runs an Admin-SDK transaction (serializing concurrent registrations so capacity is always respected) and enforces that a caller can only add/remove **their own** entry. It also:

- requires a **verified email** for `register` (server-side, not just the client gate),
- builds the participant row from the server-side `/users/{uid}` profile + auth token (never from client-supplied identity fields),
- validates/sanitizes the `partner` and `teamName` payloads,
- is rate-limited per uid (`enforceRateLimit`, 20/min).

The pure decision logic lives in `functions/src/selfRegistrationCore.ts` (unit-tested in `selfRegistrationCore.test.ts`) and mirrors the client-side validators in `src/lib/firebase/tournamentRegistration.ts` — keep both in sync. Error messages thrown by the CF reuse the exact reason strings (`already_registered`, `Not on waitlist`, …) that `getRegistrationErrorMessageKey()` maps to i18n keys.

Functions:
- `registerForTournament()` / `unregisterFromTournament()` / `leaveWaitlist()` — `src/lib/firebase/tournamentRegistration.ts`, thin wrappers around the `tournamentSelfRegistration` callable (actions `register` / `unregister` / `leaveWaitlist`)
- `adminPromoteFromWaitlistFirestore()` / `adminRemoveFromWaitlistFirestore()` — admin only; still direct `runTransaction()` writes, allowed by the `isTournamentOwnerOrAdmin` rule. See [FIRESTORE_TRANSACTIONS.md](./FIRESTORE_TRANSACTIONS.md).

> ⚠️ **Deploy order**: the callable must be deployed (`npm run deploy:functions`) **before** (or together with) the Firestore rules that removed the old registration allowance, otherwise self-registration breaks in production.

---

## Where registration is shown to players

`src/routes/tournaments/[id]/+page.svelte` renders `<TournamentRegistration>` when:

```
tournament.status === 'DRAFT'
&& registration.enabled
&& (!registration.deadline || Date.now() < registration.deadline)
```

> ✅ Fixed in v2.5.9: enrolled users keep seeing the registration block (with the "Desapuntarme" / "Salir de la lista" buttons) even after the deadline has passed, until the tournament actually starts.

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

The `onTournamentRegistration` Cloud Function (`functions/src/index.ts:~1474`) fires on tournament document updates. It uses the helpers in `functions/src/registrationHelpers.ts` to robustly detect:

- **New direct registrants** — `detectNewParticipants()` (id-based diff, not array-length heuristic) → notifies `ownerId` + `adminIds`.
- **New waitlist entries** — `detectNewWaitlistEntries()` (userId-based diff) → notifies admins.
- **Promotions from the waitlist** — `detectPromotedFromWaitlist()` (covers the `unregister + auto-promote` case where `participants.length` stays the same) → sends the **promoted user** a push: *"¡Tu plaza está confirmada en {tournamentName}!"*.

All three detection functions are pure and unit-tested in `registrationHelpers.test.ts`.

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

Fixed later:
- ✅ **No push on waitlist promotion after unregister**: rewritten with id-based diff helpers (`detectPromotedFromWaitlist` in `functions/src/registrationHelpers.ts`). The promoted user now receives a push *"¡Tu plaza está confirmada en {tournamentName}!"*.
- ✅ **CF "newly added" detection fragile**: `onTournamentRegistration` no longer uses `array[length-1]`. It uses `detectNewParticipants` / `detectNewWaitlistEntries` / `detectPromotedFromWaitlist`, all id-based diffs with unit tests in `registrationHelpers.test.ts`.
- ✅ **Hardcoded Spanish strings in doubles panel**: all labels in `TournamentRegistration.svelte`'s partner selection UI now go through Paraglide (`m.registration_partner*`).
- ✅ **`maxParticipants` unit ambiguity for doubles**: the wizard now shows a `gameType`-aware hint — `registration_maxParticipantsHintDoubles` clarifies that the limit counts pairs, not individual players.
- ✅ **Error codes not localised**: `getRegistrationErrorMessageKey()` (in `tournamentRegistration.ts`) maps backend reason codes and thrown error messages to Paraglide keys. `TournamentRegistration.svelte` uses a `localizeError()` wrapper so the user sees translated strings instead of raw `tournament_full` etc.
- ✅ **`rankingSnapshot: 0` at registration is by design**: not a bug — `syncParticipantRankings()` (called from `tournamentStateMachine.ts` when the tournament starts) reads the real ranking from each user's profile and overwrites the snapshot. Direct registrants and promoted-from-waitlist participants both get correct rankings before the tournament begins. There is an explicit test for this in `tournamentRegistration.test.ts`.

Fixed (2026-06):
- ✅ **Firestore rules didn't enforce registration invariants server-side**: any authenticated user could overwrite `participants`/`waitlist` directly on a DRAFT tournament (`isRegistrationUpdate` only checked `affectedKeys`, not content). The rules language cannot validate "only your own entry changed" inside an array of maps, so the rules allowance was removed entirely and all self-service registration writes moved to the `tournamentSelfRegistration` Cloud Function (see *Concurrency & enforcement* above).
