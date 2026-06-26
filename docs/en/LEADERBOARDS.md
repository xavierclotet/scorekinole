# Leaderboards & Player Stats

Public `/leaderboards` page comparing crokinole players: a **Récords** tab (community leaderboards / hall of fame) and a **Comparar** tab (multi-player head-to-head table). Reachable from the landing quick-links, the shared `AppMenu` (every page, shortcut `Ctrl+L`), and a "Comparar con…" button on each player profile.

Design spec & implementation plans:
- `docs/superpowers/specs/2026-06-26-leaderboards-design.md`
- `docs/superpowers/plans/2026-06-26-leaderboards-backend.md`
- `docs/superpowers/plans/2026-06-26-leaderboards-ui.md`

## Data model

Per-player aggregate docs in **`/playerStats/{userId}`** (public read, superadmin write). Each doc holds raw counters split **by year** (`byYear`), plus all-time records, titles/podiums, and a doubles palmarés list. The page reads the whole (small) collection once and derives every leaderboard, the adjustable minimum, and the compare table **client-side** from a shared metric registry (`src/lib/stats/metrics.ts`).

- **20s / hammer / clutch metrics are singles-only** (a doubles "20" belongs to the team, not a player). Doubles only feeds the palmarés table + doubles titles/podiums.
- Canonical aggregation logic: `functions/src/playerStatsCore.ts` (`computeUserStats`), Firestore IO in `functions/src/playerStatsIO.ts`.

## How `/playerStats` is kept up to date

1. **Automatic, per tournament:** `onTournamentComplete` (Cloud Function) calls `recomputeUserStats(db, userId)` for **every participant of the tournament that just completed**. It rebuilds each of those users' docs from scratch (reading their tournaments via the `participantUserIds` array-contains index), so it's idempotent — retries are safe.
2. **Manual full rebuild:** the `backfillPlayerStats` superadmin callable recomputes **all** players. Triggered from the admin button (see below).

> ⚠️ The automatic path only touches the players **in the newly-completed tournament**. It does NOT retroactively recompute everyone. So after any change that affects already-stored stats (see below), you must run the full rebuild.

## Maintenance buttons — `/admin/tools/backup` → "Mantenimiento"

These are **repair / rebuild tools, NOT one-time setup buttons.** They are safe to re-run any time and should be kept (superadmin-gated, out of the way).

### "Recalcular estadísticas" (`backfillPlayerStats`)
Recomputes `/playerStats` for all players from scratch. **Re-run it whenever:**
- The stats logic changes — a new metric, a tweaked calculation, or a bug fix in `playerStatsCore.ts`. Existing docs won't reflect the change until rebuilt (the automatic path only updates a player when they next play a tournament).
- A completed tournament was edited/corrected retroactively.
- `onTournamentComplete` failed for some tournament and a player's stats look stale/wrong.

Don't delete this button while the feature is still evolving — you'll need it after every metric/logic change. (If you ever want a cleaner panel, the callable can stay deployed and be invoked from the Firebase console instead.)

### "Regenerar resúmenes de torneos"
Pre-existing tool, unrelated to leaderboards. Rebuilds `/tournamentSummaries` (the lightweight docs powering the public `/tournaments` listing). Same nature: a repair tool, keep it.

## Deploy order

Deploy functions **before** rules (project convention): `npm run deploy:functions` → `firebase deploy --only firestore:rules`. After deploying, run "Recalcular estadísticas" once to backfill existing tournaments.
