# Counter Scoring Mode

> **Status**: implemented. A third friendly-match `gameMode: 'counter'`.
> Selectable from both mode pickers (Nuevo Juego / in-game Settings). The mode
> picker lives in `FriendlyMatchModal.svelte` and `SettingsModal.svelte` — NOT
> in `GameCustomizePanel.svelte` (which only handles colors/sides); the original
> proposal's guess about that file was wrong.

## Files touched by the implementation

- `src/lib/utils/counterMode.ts` (+ test) — `getCounterWinner(t1, t2, target)` pure helper
- `src/lib/types/settings.ts` — `gameMode` widened to include `'counter'`; added `counterTargetScore`, `counterIncrement`
- `src/lib/types/history.ts` — `MatchHistory.gameMode` widened to include `'counter'`
- `src/lib/constants.ts` — defaults `counterTargetScore: 100`, `counterIncrement: 5`
- `src/lib/stores/gameSettings.ts` (+ test) — validation accepts `'counter'` and the two fields
- `src/lib/components/TeamCard.svelte` — counter branches in increment/decrement, `finalizeCounterWin()` (a tap only reaches the target; `+page.svelte` confirms before finalizing), hammer forced off
- `src/routes/game/+page.svelte` — `isCounterMode`, hammer/20s/rounds-panel forced off, header text, single-game completion
- `src/lib/components/FriendlyMatchModal.svelte` + `SettingsModal.svelte` — 3rd mode button + target/increment controls, hammer/20s toggles hidden
- `messages/{es,ca,en}.json` — `scoring_modeCounter`, `scoring_friendlyModeCounter`, `scoring_counterTarget`, `scoring_counterIncrement`

## What it is

A third friendly-match `gameMode`, alongside the existing `'points'` and
`'rounds'`. Inspired by [crokinole.app/scoreboard](https://crokinole.app/scoreboard/):
a stripped-down scoreboard for players who just want a big tap-counter and
don't care about Hammer, 20s, or per-round tracking.

Internal value: `'counter'`. User-facing label: **"Counter"** (kept in
English per product decision — not translated to `es`/`ca`, similar to how
"hammer" is deliberately kept untranslated).

## Why

Some players (confirmed by user research / direct request) want the simplest
possible scoreboard: two big numbers, tap to add, race to a target. They
explicitly don't want Hammer or 20s tracking — those are crokinole-specific
concepts that add friction for this group.

## Model (confirmed)

**Two independent per-team scoreboards** — NOT a single shared
differential counter. Team 1 and Team 2 each have their own running
total, exactly like the existing `team1`/`team2` stores today. The first team
whose score reaches (or exceeds) the target wins immediately.

This was explicitly confirmed after considering and rejecting the
alternative (one shared counter that goes up for team A and down for team B,
win at ±target) — the user does **not** want that model.

## Settings

Two new fields on `GameSettings`:

| Field | Type | Default | Notes |
|---|---|---|---|
| `counterTargetScore` | `number` | `100` | The score a team must reach to win. Adjusted via a stepper in the settings UI, ±5 per tap (matches the reference site). |
| `counterIncrement` | `number` | `5` | How many points each tap/swipe adds or subtracts. Picker with a fixed preset: `1 \| 5 \| 50 \| 100`. |

Both only apply when `gameMode === 'counter'`; ignored otherwise (same
pattern as `pointsToWin`/`roundsToPlay` being mode-specific today).

## Behavior

| Aspect | Behavior |
|---|---|
| Tap the score | Adds `counterIncrement` (not a fixed `+1`) |
| Swipe down on the score | Subtracts `counterIncrement` (same gesture as today, different magnitude) |
| Win condition | First team to reach `counterTargetScore` wins — no minimum lead/margin required (unlike `'points'` mode's 2-point-lead rule). Reaching the target does **not** finalize on the tap: it opens a confirm dialog in `+page.svelte` (**Undo** / **Confirmar**) so an accidental tap — a large `counterIncrement` can jump straight to the target — can be reverted before the match is saved and locked. `TeamCard.incrementScore` only bumps the score; the parent derives the crossing team (`getCounterWinner`) and calls `finalizeCounterWin()` on confirm; **Undo** subtracts one increment. Nothing persists until confirmation, so an undone win never reaches Firestore. |
| Hammer | Not available. Hidden in settings and in `TeamCard` when this mode is selected. |
| 20s | Not available. Hidden in settings and in `TeamCard`. |
| Rounds panel | Does not exist for this mode. No per-tap history log — correct a mistake with the swipe-down gesture (and a target-reaching tap can be reverted via the win-confirm dialog's **Undo**). |
| Best of N (`matchesToWin`) | **Out of scope for v1.** Single game only; the setting is hidden/forced to `1` when this mode is active. Flagged as a possible future enhancement, not built now (YAGNI). |
| Tournaments | **Not available.** Friendly matches only — confirmed explicitly. Tournament admin config keeps only `'points'`/`'rounds'`. |
| Match history / stats | Saved the same way as any other friendly match (`saveMatchToHistory`). |
| Auto-attribution | A friendly match only persists to `/matches` when at least one player is assigned to a team (`saveFriendlyMatchToFirestore` early-returns otherwise) — true for all modes. Counter is a quick scoreboard where users never tap the "+" assign button, so a logged-in user's match would never save. Fix: a `$effect` in `+page.svelte` auto-assigns the logged-in user to **Team 1** (`userId`, `userPhotoURL`, **and the display name** — but only overwriting a default `"Team 1"` placeholder, so a custom typed name is preserved) whenever counter is active, auth is ready, a user is logged in, and neither team is assigned yet. Decision helper: `shouldAutoAssignCounterUser()` in `counterMode.ts`. The `$effect` is **one-shot** per match (guarded by `counterAssignChecked`, reset on New Match): it attributes at most once, so a manual **unassign** sticks instead of being instantly re-applied by a reactive re-assign (which would make the unassign button a silent no-op). A user who unassigns to keep score for others stays unassigned (their match then won't persist, as intended). The assign/invite **hint popovers** are suppressed in counter mode (the buttons remain). Trade-off the user accepted: the match counts as theirs on Team 1 even if they were only keeping score for others. |
| Persisted target | `counterTargetScore` is stored on the saved `MatchHistory` (added to the type + passed through `buildCompletedMatch`) so the format can be shown after the fact. |
| Format label (my-stats + admin) | `PlayerStatsContent` shows a friendly-match format in the card header (`getFriendlyFormat`): points → `scoring_friendlyModePoints`, rounds → `scoring_friendlyModeRounds`, counter → `scoring_friendlyModeCounter` ("Hasta N puntos"). `/admin/matches` `getGameModeInfo` shows `counter · Np`. |

## Chosen approach

Two approaches were considered:

- **A — Extend `gameMode` (chosen).** Add `'counter'` as a third value to the
  existing `GameSettings.gameMode` union and reuse the current `/game`
  machinery end to end: `team1`/`team2` stores, `TeamCard.svelte`,
  `GameCustomizePanel.svelte`, match history. Changes are localized to:
  - `src/lib/types/settings.ts` — widen `gameMode` type, add the two new fields
  - `src/lib/constants.ts` — defaults for the two new fields
  - `src/lib/components/GameCustomizePanel.svelte` — mode picker gets a third
    option; when selected, show the target/increment controls and hide
    Hammer/20s/Best-of controls
  - `src/lib/components/TeamCard.svelte` — `incrementScore()`/`decrementScore()`
    use `counterIncrement` instead of a literal `1`; win check compares
    against `counterTargetScore` with no lead requirement instead of calling
    `checkPointsModeWin()`/`checkRoundsModeWin()`
  - `src/routes/game/+page.svelte` — `isMatchComplete`/`effectiveShowHammer`/
    `effectiveShow20s`/`effectiveShowRoundsPanel` derivations get a `counter`
    branch

  This keeps the mode inside the app's single source of truth (localStorage
  keys, history, stats) instead of duplicating any of it.

- **B — Standalone page/route**, isolated from `/game` entirely. Rejected:
  it would duplicate team name/color UI and wouldn't feed match
  history/stats, which breaks continuity with the rest of the app for a
  mode that is, per the user, "still a crokinole mode."

## Open questions for implementation time (not blocking this spec)

- Should `counterTargetScore` allow free typing in addition to the ±5
  stepper, or stepper-only (matching the reference site exactly)?
- Minimum sane value for `counterTargetScore` relative to `counterIncrement`
  (e.g., a target of 10 with an increment of 50 reaches the target on the
  first tap — is that acceptable, or should the UI nudge against it)?
- Exact wording/placement of the "Counter" option in `GameCustomizePanel`'s
  mode picker (visual design, not covered here).

## Testing notes (for whenever this is implemented)

- `gameSettings.test.ts` — validation/defaults for the two new fields,
  migration behavior for existing users (old localStorage without these
  fields should default to `counterTargetScore: 100, counterIncrement: 5`)
- `teams.test.ts` — `addPoints`/`updateTeam` already accept an arbitrary
  delta, so no change expected there; the delta just needs to come from
  `counterIncrement` instead of `1` at the call site
- A new `TeamCard.test.ts` case (or extension) for the counter win check:
  reaches-or-exceeds target with no lead requirement
