# AGENTS.md

Primary instructions for any AI agent working in this repository. Read this first; it links out to the detailed docs you need on demand. (`CLAUDE.md` is a thin pointer to this file.)

## Project Overview

**Scorekinole** is a professional Crokinole scoring PWA built with **SvelteKit + TypeScript**. Match tracking, cloud sync, multi-device support for casual players and tournament organizers.

**Current version**: `2.5.56` — source of truth is `src/lib/constants.ts` (`APP_VERSION`). Always read it rather than trusting this number, which can lag.

## Architecture

### Tech Stack
- **Framework**: SvelteKit (SSR + SPA) with **Svelte 5** (runes syntax)
- **Language**: TypeScript · **Build**: Vite 6.x
- **Backend**: Firebase (optional) — Auth, Firestore, Storage
- **Styling**: Tailwind CSS v4 + shadcn-svelte (see [Styling Rules](#styling-rules))
- **Icons**: @lucide/svelte — modern names: `CircleCheck`, `CircleX`, `CircleAlert`, `LoaderCircle` (NOT `CheckCircle`, `XCircle`, `Loader2`)
- **i18n**: Paraglide (inlang) with JSON message files
- **Storage**: localStorage (offline-first) + Firestore (cloud sync)

**⚠️ IMPORTANT**: All code MUST use **Svelte 5 runes syntax** (`$props()`, `$state()`, `$derived()`, `$effect()`). Do NOT use Svelte 4 syntax (`export let`, `$:`, `createEventDispatcher`).

### Project Structure
```
src/
├── routes/                 # SvelteKit routes (+page.svelte, game/+page.svelte)
│   └── webmcp.md          # Agent documentation for each route
├── lib/
│   ├── components/        # Svelte components (TeamCard, Timer, modals, etc.)
│   │   ├── tournament/    # Tournament-specific components
│   │   └── ui/            # shadcn-svelte UI primitives
│   ├── stores/            # Svelte stores (gameSettings, teams, timer, history, matchState)
│   ├── paraglide/         # Auto-generated i18n (DO NOT EDIT)
│   ├── firebase/          # Firebase integration (auth, firestore, tournaments)
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   └── constants.ts       # APP_VERSION, defaults
messages/                  # Translation JSON files (ca.json, es.json, en.json)
docs/                      # Extended documentation
functions/                 # Firebase Cloud Functions
```

## Documentation

Docs are organized by language. Read on demand when working on the related area — don't preload them.

### Technical docs — `docs/en/`
- [SVELTE5_RUNES.md](docs/en/SVELTE5_RUNES.md) — Runes guide, event handlers, `{@const}` rules, `$app/state`
- [DEVELOPMENT.md](docs/en/DEVELOPMENT.md) — Local dev setup and workflow
- [DEPLOYMENT.md](docs/en/DEPLOYMENT.md) — Build/deploy commands, Firebase setup, full Cloud Functions list
- [TOURNAMENT_DATA_STRUCTURE.md](docs/en/TOURNAMENT_DATA_STRUCTURE.md) — Tournament interfaces, LIVE vs IMPORTED
- [DOUBLES_TOURNAMENTS.md](docs/en/DOUBLES_TOURNAMENTS.md) — Partner fields, team names, doubles ranking
- [TOURNAMENT_ADMIN.md](docs/en/TOURNAMENT_ADMIN.md) — Force finish, walkover (WO), disqualification (DSQ)
- [TOURNAMENT_REGISTRATION.md](docs/en/TOURNAMENT_REGISTRATION.md) — Self-registration flow, waitlist, doubles modes, admin tooling, known issues
- [NETWORK_STATUS.md](docs/en/NETWORK_STATUS.md) — OfflineIndicator, auto-sync, reconnect
- [SCORING_TERMINOLOGY.md](docs/en/SCORING_TERMINOLOGY.md) — Round/Game/Match hierarchy, abbreviations
- [TABLE_ASSIGNMENT.md](docs/en/TABLE_ASSIGNMENT.md) — Equitable table distribution algorithm
- [TIEBREAKER.md](docs/en/TIEBREAKER.md) — Tiebreaker resolution algorithm
- [RANKING_SYSTEM.md](docs/en/RANKING_SYSTEM.md) — Ranking points model
- [FIRESTORE_TRANSACTIONS.md](docs/en/FIRESTORE_TRANSACTIONS.md) — Why all tournament writes use `runTransaction()`
- [PWA_PUSH_NOTIFICATIONS.md](docs/en/PWA_PUSH_NOTIFICATIONS.md) — FCM, VAPID, token management, wake lock
- [MATCH-INVITES.md](docs/en/MATCH-INVITES.md) — Friendly-match invite flow
- [CI_SETUP.md](docs/en/CI_SETUP.md) — GitHub Actions + branch protection

### End-user guides — `docs/es/` (Spanish, non-technical)
- [GUIA_ADMIN_TORNEOS.md](docs/es/GUIA_ADMIN_TORNEOS.md) — How to create tournaments
- [GESTIONAR_TORNEO.md](docs/es/GESTIONAR_TORNEO.md) — Managing a live tournament
- [ADMIN_TORNEO_FUNCIONES.md](docs/es/ADMIN_TORNEO_FUNCIONES.md) — Admin actions during a live tournament (WO, DSQ, force finish)
- [DESEMPATES.md](docs/es/DESEMPATES.md) — How tiebreakers work, in plain Spanish
- [DOBLES.md](docs/es/DOBLES.md) — Doubles tournaments for organizers
- [GUIA_JUGADOR.md](docs/es/GUIA_JUGADOR.md) — Player guide

### 🤖 WebMCP (Agent Context)
> Before modifying any page's DOM/components/layout, check if a `webmcp.md` file exists in that route's directory (e.g., `src/routes/game/webmcp.md`). These contain semantic selectors and agent-specific rules.

## UX Rules

**⚠️ Interactive elements MUST be visually discoverable without hover.** This is a mobile-first PWA — there is no hover on touch devices. Every clickable/tappable element must have a permanent visual affordance:
- **Links**: Use a distinct color (e.g., `#60a5fa` dark / `#2563eb` light) — never `color: inherit` on clickable text
- **Buttons/tappable areas**: Use a visible background, border, or pill shape — not just `cursor: pointer`
- **Detail triggers**: Add a small chevron icon (`>`) to indicate "tap for more"
- Never rely solely on `:hover` styles to indicate interactivity

## Styling Rules

**ALWAYS use scoped `<style>` blocks with semantic CSS classes.** Do NOT use Tailwind utility classes for layout/design — Tailwind is only for shadcn-svelte primitives (`Button`, `Dialog`, etc.).

- Semantic class names (`.admin-card`, `.match-header`) in `<style>` blocks
- CSS variables for colors: `var(--background)`, `var(--primary)`, `var(--border)`
- Transparency: `color-mix(in srgb, var(--primary) 10%, transparent)`
- Conditional classes: `class={["base", condition && "conditional", className]}`
- **⚠️ CSS vars use `oklch()` — write `var(--primary)`, NOT `hsl(var(--primary))`**

**shadcn-svelte**: `import * as Dialog from '$lib/components/ui/dialog'` / `import { Button } from '$lib/components/ui/button'`

**⚠️ shadcn-svelte Button/Dialog Tailwind classes**: Since Tailwind is NOT processed outside shadcn primitives, `<Button>` internal styles (`gap-2`, `px-4`, `h-9`, etc.) won't apply. You MUST add `:global(button)` scoped styles for layout, padding, gap, and icon sizing when using shadcn `<Button>` in custom components:
```css
.my-wrapper :global(button) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
}
```

## Internationalization (Paraglide)

```svelte
import * as m from '$lib/paraglide/messages.js';
<button>{m.common_startGame()}</button>
```

- Keys: `namespace_keyName` (namespaces: `common_`, `scoring_`, `history_`, `tournament_`, `bracket_`, `ranking_`, `sync_`)
- **⚠️ Add EVERY new/changed key to ALL THREE files: `messages/es.json`, `messages/ca.json`, `messages/en.json`.** Do NOT add to `es.json` only. The `npm run machine-translate` script is broken (ECONNRESET — inlang's remote translation service fails), so nothing auto-propagates `es` → `ca`/`en`. Languages: `es` (Spanish), `ca` (Catalan), `en` (English). Keep the key at the same position in each file. A key present only in `es.json` renders missing/blank in the other locales.
- ALWAYS search `messages/*.json` first to check if key exists
- When deleting code with translation keys, check if key is used elsewhere; if not, delete from all `messages/*.json`

## Firebase

Optional (`VITE_FIREBASE_ENABLED=true`). App works 100% offline without it.

> **`/admin` is client-only (`ssr = false` in `src/routes/admin/+layout.ts`).** Admin pages are auth-gated and fetch data from Firebase in the browser (Firebase only initializes when `browser` is true), so the server can't render anything but a spinner — and any browser-only access during SSR throws a 500 on hard refresh (F5). Don't re-enable SSR for `/admin`; keep new admin pages client-rendered.

### Authentication
Two sign-in methods supported:
- **Google Sign-In** (`signInWithGoogle`) — OAuth popup, recommended for Gmail users
- **Email/Password** (`signUpWithEmail`, `signInWithEmail`) — for non-Gmail users, requires email verification before full access

Key behaviors:
- Gmail domains (`@gmail.com`, `@googlemail.com`) are **rejected** at email/password registration — users are prompted to use Google Sign-In instead
- Email verification is **mandatory**: unverified users see `EmailVerificationBanner` and cannot create a Firestore profile
- `emailVerificationPending` store controls the banner visibility
- Password reset via `resetPassword()` → `sendPasswordResetEmail()`
- `LoginModal.svelte` uses a multi-view state machine: `providers` → `email-signin` | `email-signup` → `verify-email` | `reset-password` → `reset-sent`

**⚠️ CRITICAL: Tournament writes MUST use `runTransaction()`** — never `getTournament()` + `updateDoc()`. See [FIRESTORE_TRANSACTIONS.md](docs/en/FIRESTORE_TRANSACTIONS.md).

### Cloud Functions (`functions/src/index.ts`)
- `onTournamentComplete`: Syncs guest names to `/users`, adds tournament records, calculates ranking points
- `onTournamentMatchEvent`: Detects new table assignments, sends FCM push notifications
- `tournamentSelfRegistration`: Callable for self-service register/unregister/leaveWaitlist (rules can't validate participants/waitlist content, so non-admin clients may NOT write those arrays directly; pure logic in `functions/src/selfRegistrationCore.ts`, mirrored from `src/lib/firebase/tournamentRegistration.ts`)
- `sendPushToUser()`: Generic push helper, respects notification preferences, auto-cleans invalid tokens
- `cleanupExpiredInvites`: Scheduled weekly (Sunday 4:00 AM Madrid), deletes expired `matchInvites` documents

Deploy: `npm run deploy:functions`

## Testing

**Runner**: Vitest (`npm test` / `npm run test:watch`)
**Config**: `vitest.config.ts`
**Convention**: Co-located test files (`*.test.ts` next to source)

### Test Files & Coverage

| Source File | Test File | What it covers |
|-------------|-----------|----------------|
| `algorithms/bracket.ts` | `bracket.test.ts` | Seeding, consolation brackets, BYE cascading, positions 9-16, various participant counts (10-30) |
| `algorithms/swiss.ts` | `swiss.test.ts` | Random & point-based pairings, BYE distribution fairness, repeat avoidance, table saturation |
| `algorithms/roundRobin.ts` | `roundRobin.test.ts` | Schedule completeness (20-25 players), BYE walkovers, table assignment (no duplicates), snake draft, cross-group tables |
| `algorithms/tiebreaker.ts` | `tiebreaker.test.ts` | H2H, 20s, Buchholz, mini-league (3-4 players), Swiss vs RR modes, qualification boundary ties |
| `algorithms/ranking.ts` | `ranking.test.ts` | Monotonic decrease, last-place minimum, threshold scaling, doubles vs singles |
| `firebase/tournamentMatches.ts` | `tournamentMatches.concurrency.test.ts` | Concurrent match completions, round syncs |
| `stores/matchState.ts` | `matchState.test.ts` | Round completion, dual-store consistency, resetGameOnly, multi-game flow |
| `stores/history.ts` | `history.test.ts` | Current match lifecycle, round CRUD, buildCompletedMatch edge cases |
| `stores/teams.ts` | `teams.test.ts` | Points, switchSides, resetTeams, user/partner assignments |
| `stores/tournamentContext.ts` | `tournamentContext.test.ts` | Set/get/clear, offline data, pending detection |
| `stores/*` (transitions) | `modeTransition.test.ts` | Friendly↔tournament backup/restore, settings round-trip, multi-cycle |
| `stores/gameSettings.ts` | `gameSettings.test.ts` | Load/save, validation, version migration |

### ⚠️ Run tests when modifying these files

After modifying any algorithm or tournament file, run the corresponding tests:

```bash
# Modified roundRobin.ts → run:
npx vitest run src/lib/algorithms/roundRobin.test.ts

# Modified swiss.ts → run:
npx vitest run src/lib/algorithms/swiss.test.ts

# Modified tiebreaker.ts → run:
npx vitest run src/lib/algorithms/tiebreaker.test.ts

# Modified bracket.ts → run:
npx vitest run src/lib/algorithms/bracket.test.ts

# Modified ranking.ts → run:
npx vitest run src/lib/algorithms/ranking.test.ts

# Modified tournament types (types/tournament.ts) → run ALL:
npm test

# Modified tournamentMatches.ts or tournamentGroups.ts → run:
npx vitest run src/lib/firebase/tournamentMatches.concurrency.test.ts
```

Future candidates for testing:
- `src/lib/algorithms/probability.ts` — Qualification probability

### CI Pipeline

GitHub Actions runs all tests on every PR to `main` (`.github/workflows/ci.yml`). PRs are blocked if any test fails. See [CI_SETUP.md](docs/en/CI_SETUP.md) for GitHub branch protection setup.

## Critical Rules

### Version Control
- **NEVER** create commits automatically (wait for explicit user instruction)
- **NEVER** push to remote (user pushes manually)
- **NEVER** run `npm run dev` / `npm run build` / `svelte-check` (user runs manually)
- **NEVER** add `Co-Authored-By` lines to commit messages

### Updating Version Number
Update ALL together: `package.json` · `README.md` badge · `src/lib/constants.ts` · `CHANGELOG.md` (new entry at TOP)

## Critical Implementation Details

- **Round Management**: `resetGameOnly()` clears rounds; games preserved in match. Each game's rounds → `currentMatch.games[].rounds[]`
- **20s Counter Reset**: Reset after EVERY round in `TeamCard.svelte` → `finalizeRound()`
- **Store Persistence**: All stores auto-save to localStorage. Loading on app init
- **Version auto-detection**: `APP_VERSION` vs `gameSettings.appVersion` → clears localStorage if different (preserves match history)
- 20s counters must reset after each round. Rounds must clear between games.

### Non-obvious patterns (verified by code inspection)
- **localStorage keys**:
  - Settings: `'crokinoleGame'` (NOT `'crokinoleGameSettings'`)
  - Teams: `'crokinoleTeam1'`, `'crokinoleTeam2'`
  - Match state: `'crokinoleMatchState'`
  - History: `'crokinoleMatchHistory'`, `'crokinoleDeletedMatches'`, `'crokinoleCurrentMatch'`
- **Round completion logic**: A round completes only when total points distributed = exactly 2 (`0-0`, `2-0`, `0-2`, `1-1`)
- **Hammer rotation**: After each round completion, the hammer swaps between teams
- **Match completion**: Rounds mode → complete after the first game; Points mode → need to win `matchesToWin` games
- **Round tracking**: Both `currentGameRounds` and `currentMatchRounds` are maintained; `resetGameOnly()` clears both
- **Gesture handling**: Touch swipe/tap and mouse drag for scoring, with vibration feedback

### Custom utilities to reuse
- Haptic feedback: `vibrate(duration)` from `src/lib/utils/vibration.ts`
- Color utilities: `getContrastColor()`, `isColorDark()`, `getLuminance()` from `src/lib/utils/colors.ts`
