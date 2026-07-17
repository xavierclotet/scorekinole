# Counter Scoring Mode (proposal — not implemented)

> **Status**: design proposal only. Nothing in this document is built yet. This
> file exists so the design survives between sessions; implement via a normal
> plan (see AGENTS.md testing rules) when the team decides to build it.

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
| Win condition | First team to reach `counterTargetScore` wins **immediately** — no minimum lead/margin required (unlike `'points'` mode's 2-point-lead rule) |
| Hammer | Not available. Hidden in settings and in `TeamCard` when this mode is selected. |
| 20s | Not available. Hidden in settings and in `TeamCard`. |
| Rounds panel | Does not exist for this mode. No per-tap history log — the only way to correct a mistake is the swipe-down gesture, same as correcting any single tap today. |
| Best of N (`matchesToWin`) | **Out of scope for v1.** Single game only; the setting is hidden/forced to `1` when this mode is active. Flagged as a possible future enhancement, not built now (YAGNI). |
| Tournaments | **Not available.** Friendly matches only — confirmed explicitly. Tournament admin config keeps only `'points'`/`'rounds'`. |
| Match history / stats | Saved the same way as any other friendly match (`saveMatchToHistory`) — no special-casing needed there. |

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
