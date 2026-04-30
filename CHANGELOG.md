# Changelog

All notable changes to Scorekinole are documented in this file.

## [2.5.18] - 2026-04-30
- Admin user management: bug fix — disabling a guest user (Firestore-only profile, no Auth account) used to fail silently with `auth/user-not-found` 404 from the Cloud Function. Now `disableUser` tolerates missing Auth records and marks the Firestore document directly
- Admin user management: new "Borrar definitivamente" button — appears in the disable modal only when the target user has zero history (no tournaments owned/played, no venues, no collaborator role, no merge links). Permanently removes the Firestore profile + Auth record (if any), and the row disappears from the list
- Admin user management: failures during disable/delete now surface inline in the modal instead of closing silently
- New Cloud Function `deleteUserAccount` with 7 server-side precondition checks (tournament ownership/collaboration, venues, tournament history, merge links) — defense-in-depth in case a stale UI lets a destructive call slip through
- Tests: 4 regression tests for `deleteUserAccount` wrapper (auth gating, super-admin gating, error propagation)

## [2.5.17] - 2026-04-29
- Timeout modal copy: rewritten in es/ca/en — now tells players to **finish the current round** (throw any discs they have left) before counting 20s and marking the winner. Matches the NCA / tournament convention; previous wording said the opposite ("stop throwing discs")

## [2.5.16] - 2026-04-29
- Tournament join: bug fix — saved tournament key was being wiped when the tournament moved to `TRANSITION` (between group stage and bracket), forcing players to re-enter the 6-char key. Now retained across `GROUP_STAGE`, `TRANSITION`, and `FINAL_STAGE`; only cleared on `COMPLETED`/`CANCELLED`/`DRAFT`
- Swiss table assignment: pairwise-swap optimization runs after the greedy pass to escape cases where the last match was cornered into a table one of its players had just used. Eliminates avoidable consecutive-round table repeats
- New `shouldClearSavedTournamentKey` util shared by `/game` join flow and `TournamentMatchModal` so the two saved-key checks can't drift apart
- Tests: 8 regression tests for `tournamentStatus` (incl. TRANSITION); 2 regression tests for Swiss table swap (12-player/6-table cross pairings + worst-case constructed)

## [2.5.15] - 2026-04-28
- Time breakdown: critical fix — bracket sub-rounds no longer inflate by `breakBetweenPhases` (30 min was wrongly added between QF→SF and SF→Final). Replaced with new `breakBetweenBracketRounds` config (default 5 min)
- Time breakdown modal: now openable from DRAFT (clickable duration row in admin tournament page)
- Time breakdown modal: hide redundant 'matchRounds' row in Swiss (same value as `numSwissRounds`)
- Rules modal: ranking line now shows the real winner points based on participant count, not the tier max
- Rules modal: 'final stage' line now states the actual qualifier count (split divisions vs single bracket)
- Tests: 7 regression tests added under 'BUG: bracket sub-phase transitions inflate times'

## [2.5.14] - 2026-04-27
- Registration: deadline now validated against tournamentDate — wizard rejects deadlines in the past, on/after the tournament date, or less than 24h before it
- Registration: defense-in-depth — registrations close automatically once tournamentDate passes, even if admin forgot to start the tournament
- Bracket: hide "Regenerate consolation" button when all consolation matches are already played
- Docs: new Spanish player guide (`GUIA_JUGADOR.md`) covering friendly + tournament matches, stats page, QR entry, doubles invites
- Docs: new Spanish tournament management guide (`GESTIONAR_TORNEO.md`) with screenshots
- i18n: new translations for registration deadline error messages (es/ca/en)

## [2.5.13] - 2026-04-27
- Registration: localize error messages in `TournamentRegistration` component (no more raw codes like `tournament_full` shown to users)
- Docs: reorganize docs into `docs/en/` (technical) and `docs/es/` (end-user guides)
- Docs: add Spanish admin guides — `GUIA_ADMIN_TORNEOS.md`, `ADMIN_TORNEO_FUNCIONES.md`, `DESEMPATES.md`, `DOBLES.md`
- Docs: refresh `TOURNAMENT_REGISTRATION.md` to reflect actual bug status (5 of 7 known issues already fixed)

## [2.5.12] - 2026-04-17
- Security: harden Firestore rules — super-admin required to modify isAdmin/isSuperAdmin/disabled flags on user profiles
- Security: remove world-writable tournament updates; restrict to owner/adminIds + scoped scoring/registration updates
- Security: matchInvites payload validation (host match, status, expiresAt window, size caps)
- Security: pageViewStats admin-write only; venues scoped to owner (super-admin sees all)
- Security: storage.rules restrict tournament assets to owner/adminIds
- Security: remove public unauthenticated Cloud Function migrateTournamentDates
- Security: toggleAdminStatus client-side check upgraded to isSuperAdmin
- Security: defensive caps on match result inputs (games/points/20s/rounds) to block inflation attacks and client bugs
- Security: per-UID sliding-window rate limit on disableUser/enableUser Cloud Functions (10/min)
- Fix: live-play bug where last-match-of-round writes included countdownTimer and were rejected by Firestore rules, dropping the match result
- Tests: firestore rules test suite (80+ cases) via @firebase/rules-unit-testing + npm run test:rules
- Tests: matchResultValidation (29) and rateLimit (10) unit tests

## [2.5.11] - 2026-04-16
- Auth: add disableUser/enableUser Cloud Functions (soft-delete replaces hard delete)
- Auth: isSuperAdmin required for disable/enable; revokeRefreshTokens on disable
- Auth: email normalization (trim + lowercase) in signIn/signUp
- Auth: rollback Auth user if sendEmailVerification fails
- Auth: fix onAuthStateChanged listener accumulation on HMR re-init
- Auth: signOut clears statsCache and tournamentContext (prevents data leakage)
- Auth: EmailVerificationBanner polls user.reload() every 3s for auto-detection
- Auth: AdminGuard/SuperAdminGuard remove redirect latch (logout redirects correctly)
- Auth: handle auth/user-disabled, network, popup errors in LoginModal
- Admin UI: replace delete with disable/enable user flow; disabled badge in user table
- Tests: 22 new auth tests; disableUser/enableUser frontend tests

## [2.5.10] - 2026-04-15
- Fix self-as-own-partner now rejected at Firestore layer (not just UI)
- Fix partner already registered as primary/waitlist now blocked on registration
- Fix teamName preserved in WaitlistEntry and propagated on FIFO/admin promotion
- Fix FIFO auto-promote respects registration.enabled and maxParticipants cap
- Fix adminPromoteFromWaitlist blocked for non-DRAFT tournaments
- Fix buildRegistrationConfig sanitizes negative maxParticipants to unlimited
- Add normalizeEmail() helper, applied to participant email on registration
- Increase runTransaction maxAttempts to 10 for all registration operations

## [2.5.9] - 2026-04-15
- Fix duplicate registration when user is already assigned as a partner (Bug #1)
- Fix partner search now excludes already-assigned partners and waitlist entries (Bug #2)
- Fix push notification sent to user promoted from waitlist on unregister (Bug #3)
- Fix registration section remains visible post-deadline for enrolled users (Bug #5)
- Fix CF new-participant detection uses identity (id set) instead of array position (Bug #6)
- Fix localized error messages for registration failures (Bug #7)
- Fix doubles panel strings now fully translated via i18n (Bug #8)
- Fix maxParticipants hint in wizard clarifies doubles counts pairs not players (Bug #9)
- Fix stale registrationResult resets via $derived when user removed externally (Bug #14)
- Add Inscripciones section in admin tournament detail page with promote/remove actions
- Add adminPromoteFromWaitlistFirestore / adminRemoveFromWaitlistFirestore helpers
- Add TOURNAMENT_REGISTRATION.md documentation with known issues
- Add registrationHelpers.ts pure functions with 18 tests
- Redesign TournamentRegistration: pulsing open status bar, full-width CTA button
- Redesign doubles panel: option cards for partner mode, 2-col partner+teamname layout
- Add 37 new i18n keys across es/en/ca

## [2.5.8] - 2026-04-14
- Add tournament self-registration: register, unregister, join/leave waitlist
- Doubles registration panel with partner search, guest mode, and team name
- Waitlisted state card with queue position and leave-waitlist dialog
- Admin wizard step 1: registration config (deadline, capacity, fee, rules)
- Admin wizard step 3: promote/remove waitlist entries
- Registration push notifications via Cloud Function
- Fix deadline timezone bug: date-only defaults to 23:59 local time
- Extract pure registration functions with 76 unit tests
- Add missing ca/en translations for registration keys

## [2.5.7] - 2026-04-12
- Add maxWidth prop to Modal for constrained dialogs
- Fix team colors layout in GameCustomizePanel (flex-column, inline label)
- Add unit tests for Modal and GameCustomizePanel logic

## [2.5.6] - 2026-04-03
- Add GameCustomizePanel: floating ⚙️ button with switch sides/colors, name size, and color pickers
- Remove color/name-size buttons from TeamCard headers and Switch actions from SettingsModal
- Add pinch-to-zoom on score (continuous font-size, no snapping, persists on release)
- Fix lastTournamentResult not cleared when starting new friendly match
- Fix RoundsPanel round click blocked by drag detector on mobile (stopPropagation)
- Extract PRESET_COLORS constant, delete ColorPickerModal

## [2.5.5] - 2026-04-02
- Fix hammer dialog not showing when starting a new friendly match from modal
- Add random starter selection button (dice icon) to hammer dialog
- Add randomizeHammerStart() utility with full test coverage
- Theme hammer dialog with CSS variables for dark/light/violet support
- Fix notification creator name, participant count, skip test tournaments

## [2.5.4] - 2026-03-20
- Fix bracket import: incorrect winner on tied scores
- Fix autoSelectQualifiers ignoring ties at qualification boundary
- Add guard against generating brackets for GROUP_ONLY tournaments
- Track and warn about unknown participant names in imports
- Handle SPLIT_DIVISIONS with <2 brackets explicitly
- Add configurable min qualifiers (finalStageMinQualifiers) for SPLIT_DIVISIONS
- Add live estimated duration in tournament wizard (reactive to all config changes)

## [2.5.3] - 2026-03-19
- Redesign group match cards: stacked scoreboard layout with status glows, player avatars, split probability bar
- Apply scoreboard design to public and live tournament views with responsive grid (2-3 per row)
- Add resizable panels (paneforge) for standings/schedule split in admin and live views
- Redesign bracket probability as clean inline colored percentages
- Replace bracket LIVE badge with subtle amber breathing glow + pulsing dot
- Live bracket scores colored by state: green (leading), red (trailing), gray (tied)
- Refined table badge, pending score indicator, bump chart layout

## [2.5.2] - 2026-03-18
- Fix matchesToWin/show20s/showHammer/gameType missing fallback defaults in tournament config
- Fix currentUserSide undefined causing inverted score mapping (new resolveIsUserSideA utility)
- Fix game twenty always saved as 0 (calculate from round data instead of reset team state)
- Fix exitTournamentMode(false) not persisting cleared tournament fields
- Enhance gameSettings validation (gameType, booleans, numeric ranges)
- Add isValidTournamentContext validation on localStorage load
- Add defensive merge with defaults in loadMatchState/loadTeams for version migration
- Fix orphaned pre-tournament backup cleanup on app mount
- Fix participant name fallback to prevent "undefined" in UI
- Fix @const inside span elements in CompletedTournamentView
- 41 new regression tests (1515 → 1556)

## [2.5.1] - 2026-03-17
- Add userKey to tournament participants for clean profile URLs
- Doubles tournament standings link to player profile with tournament filter pre-selected
- Add country editor (Popover+Command) to admin user edit modal
- Add country filter in admin users list with "no country" option
- Show waving country flags (flagcdn.com) next to player names in ranking and admin
- Replace emoji flags with waving PNG flags on user profile page
- Waving Catalonia flag SVG
- 29 new tests (userProfileUrl utility)

## [2.5.0] - 2026-03-17
- Add tournament quick-join FAB button (bottom-right) on game page
- Add friendly match setup modal with FAB button (bottom-left) on game page
- Remove duplicate match/tournament items from hamburger menu
- Fix Catalonia flag SVG for CAT country code in profiles
- 44 new tests (FAB visibility + friendly match setup)

## [2.4.99] - 2026-03-16
- Rename /rankings route to /ranking (singular)
- New /users/[id] public player profile page with shared PlayerStatsContent
- User short keys (6-char) for cleaner profile URLs
- Dynamic tournament columns in ranking table with per-player points
- Tournament shortName and edition fields for ranking column headers
- Perfect rounds detection (all 20s) with diamond badge in stats and match list
- Fix doubles partner ranking bug: partner now gets own rankingBefore/rankingAfter
- Fix Cloud Function: separate tournament records for partner with correct ranking
- All 5 previously failing doubles ranking tests now pass (1442/1442 green)

## [2.4.98] - 2026-03-16
- Unified tournament match start flow: all matches route through MatchPreviewDialog (colors + hammer)
- Fix scorer warning shown to yourself when resuming a paused tournament match
- Fix 20s edits not syncing to Firebase (dual-store consistency: currentMatch + currentGameRounds)
- Allow admin overwrite of completed matches, persist table assign hints in localStorage
- Fix timeout modal not updating visual score on accept
- Add 17 new tests (match start options, scorer warning, dual-store sync, timeout, admin overwrite)

## [2.4.97] - 2026-03-15
- Universal user merge (any user type combination), with search-based UI modal and merge audit trail
- Ranking tiebreaker redesign: points → best singles position → best doubles position → name
- Improve table assignment fairness in Swiss and Round Robin with maxUsage and globalUsage tiebreakers
- Sortable 20s and pts columns in public tournament final standings
- Add 66 new tests (merge: 38, table fairness: 18, rankings: 4, standings: 6)

## [2.4.96] - 2026-03-13
- Show orange tie highlight only for unresolved ties (admin must decide), not for resolved tiebreakers
- Extract manual reorder logic (moveUp/moveDown/confirmOrder) to testable tieManualReorder module
- Add 63 new tiebreaker tests: priority cascade (Swiss/RR × WINS/POINTS) and manual reorder workflows

## [2.4.95] - 2026-03-13
- Fix cancelPendingInvitesForUser to filter by inviteType for doubles coexistence
- Add 9 new invite cancellation tests

## [2.4.94] - 2026-03-12
- Sync admin countdown timer to /game page (read-only) for tournament matches
- Add timeout modal for forced last-round annotation when timer reaches 0
- Auto-reset countdown timer on round completion (RR and Swiss)
- Fix admin timer not reacting to external Firestore resets
- Show PTV column always in QualifierSelection, rename Pts→PTV/TVP
- Show classification mode (victory points vs total points) in tournament detail and transition pages
- Fix default qualifier selection: minimum 8 qualifiers for final stage
- Extract calculateDefaultTopNPerGroup/calculateDefaultQualifierCount as testable functions
- Add 102 new tests (51 transition, 53 sync timer, 12 concurrency)
- Add TODO doc for configurable qualifier count in wizard

## [2.4.93] - 2026-03-07
- Fix tableNumber not cleared on group match completion (caused duplicate table assignments)
- Fix autofill filling TBD matches without assigned tables in limited-table tournaments
- Add playedOnTable to GroupMatch for table history after completion
- Update UI components to display played table for completed group matches
- Add 32 tests for table reassignment, odd players + limited tables, and autofill edge cases

## [2.4.92] - 2026-03-07
- Fix critical race condition in Swiss rounds config (dot-notation update prevents match data loss)
- Add double-click guards on tournament exit, pause, next game, and play match buttons
- Fix data loss on tournament pause (flush pending sync before exit)
- Fix doubles partner side detection in autoStartMatch and modal
- Allow early Swiss finalization when current round is complete
- Add integer/NaN validation for Swiss rounds input
- Add 88 new tests (Swiss config, match detection, store edge cases)

## [2.4.91] - 2026-03-06
- Fix Firestore crash on Swiss round 2+ generation (undefined values in standings)
- Replace all `= undefined` with `delete` in tiebreaker.ts (10 sites)
- Add cleanUndefined to all transaction writes in tournamentGroups.ts
- Consolidate cleanUndefined into single canonical module (DRY)
- Add duplicate round guard in generateSwissPairings
- Add 30 new tests (cleanUndefined edge cases, lifecycle Firestore safety, tiebreaker)

## [2.4.90] - 2026-03-06
- Venue management: inline edit from VenueSelector for owner/SuperAdmin
- Admin venues page: edit modal, tournament count column, remove delete action
- Save venueId in tournament edit and import flows
- Fix position-range-badge in silver bracket, doubles avatar width
- Bump chart moved below standings in live tournament view

## [2.4.89] - 2026-03-06
- Fix tiebreaker buildCompareKey numeric overflow (use string comparison)
- Fix hasUnresolvedTies false positives (check tieReason === 'unresolved')
- Wrap generateSwissPairings in single atomic transaction (prevent race condition)
- Change qualified player background from blue to green in transition page
- Redesign MatchCard two-row layout for live tournament view
- Add 19 new tests (12 tiebreaker edge cases + 7 Swiss integrity tests)

## [2.4.88] - 2026-03-06
- Move live-badge to top of bracket match cards (fix overlap with player names)
- Unify green theme for LIVE indicator, in-progress cards, and hammer highlight
- Change loser color from orange to red in bracket view
- Move avatars to left of player name, increase score font size

## [2.4.87] - 2026-03-06
- Sync admin countdown timer to public tournament page (real-time via Firestore)
- Sort round matches by table number (M1, M2...) in admin and public views
- Defer tournament backup restore, UI improvements
- Add 28 bracket tests, fix consolation brackets, clean console.log leaks
- Fix winner determination for matchesToWin > 1, transaction in recalculateStandings
- Exclude disqualified from GROUP_ONLY positions, tiebreaker priority tests
- Normalize tournamentDate types, server-side year filtering
- Fix rotateHammer guard, edition nullish coalesce, consolation R32/R64 support

## [2.4.86] - 2026-03-05
- Optimize chart data precomputation in my-stats (pre-compute once, pass to components)
- Optimize Vite dev server: pre-bundle Firebase/Chart.js/Lucide deps, add server warmup
- Consolidate Firestore match queries for better performance
- Add Chrome DevTools JSON config
- Update tournament views and expand chartData test coverage
- Add rankings test suite

## [2.4.85] - 2026-03-05
- Replace intrusive WhatsNew auto-modal with non-blocking toast notification + badge dot on version number
- Remove "Arena" branding from all components (AppMenu, PoweredByBadge, ScorekinoleLogo, StampBadge, etc.)
- Update app title to "Professional Crokinole Tournament Manager"
- Remove event title column from admin/matches table
- Improve my-stats mobile: horizontal scroll filters, 2-column chart grid, centered Win/Loss donut

## [2.4.84] - 2026-03-05
- Add confirmation modal for Swiss System autofill (was firing directly without confirmation)
- Move autofill button to floating position away from countdown timer
- Add tiebreaker criteria reminder above standings on transition page (adapts to SS/RR, WINS/POINTS, show20s)
- Add no-20s tiebreaker chain translations (es, en, ca)
- Fix WhatsNewModal HMR crash when CHANGELOG.md is modified

## [2.4.83] - 2026-03-05
- Add PoweredByBadge and StampBadge reusable components
- Integrate PoweredByBadge in home footer, game watermark, and tournament footer
- Add gold metallic wax seal stamp on tournament hero banner (non-imported only)
- Replace version text with "Powered by" in game page watermark

## [2.4.82] - 2026-03-05
- Fix 4 tournament algorithm bugs and 3 utility bugs
- Add comprehensive test suite: 672 tests across 28 files (integration, lifecycle, import, concurrency, stores, utils)
- Add 6 webmcp.md agent documentation files for admin routes

## [2.4.81] - 2026-03-04
- Firestore backup & restore admin tool with live data browser and selective document restore
- Add cleanupExpiredInvites cloud function (weekly scheduled)

## [2.4.80] - 2026-03-04
- Admin countdown timer widget for match time control in group tournaments

## [2.4.79] - 2026-03-04
- Global seeds and positions for silver division in split_division tournaments
- Position range labels (e.g., 9º-16º) in silver bracket round headers
- Fix consolation match-position-badge colors to use --primary
- Handle non-power-of-2 teams in consolation legacy fallback

## [2.4.78] - 2026-03-04
- Fix doubles tournament pending matches: check partner.userId so both team members see their matches

## [2.4.77] - 2026-03-04
- Fix push notifications for doubles tournaments: notify both team members (primary + partner) if registered
- Use team display name (teamName or "Player1 / Player2") in notification body

## [2.4.76] - 2026-03-03
- Autofill modal for RR tournaments: choose between filling current round only or all rounds
- GROUP_ONLY phaseType documentation

## [2.4.75] - 2026-03-03
- Venue selector: show all venues on focus, shared across admins with owner name
- Update default match times: singles 10min, doubles 13min
- Update TOURNAMENT_DATA_STRUCTURE docs for round-based import capabilities

## [2.4.74] - 2026-03-03
- Import wizard: BYE bonus, qualificationMode toggle, tiebreaker priorities
- Fix BYE bonus in createHistoricalTournament for round-based imports
- Build headToHeadRecord and apply resolveTiebreaker on imported standings
- Add qualificationMode (WINS/POINTS) toggle with live recomputation in Step 2
- Add tiebreaker priority reorder UI in import wizard preview
- Fix Step 4 review showing empty knockout section for group-only imports
- Tournament export modal and push notification enhancements

## [2.4.73] - 2026-03-02
- Add finalize page with configurable tiebreaker priorities and match review
- Refactor tiebreaker algorithm to support admin-configurable priority order
- Show Buchholz column in completed tournament standings
- Add assign-yourself hint popover and auth provider badges in admin

## [2.4.72] - 2026-03-02
- Add email/password authentication (sign up, sign in, password reset, email verification)
- Remove Facebook login — only Google and Email/Password remain
- Gmail domains redirected to Google Sign-In at registration
- Password security requirements (8+ chars, uppercase, lowercase, number)
- Add EmailVerificationBanner for unverified email users
- Improve nav UX with back button, chevron animation, reorder admin menu

## [2.4.71] - 2026-03-02
- Redesign ProfileModal: wider layout, section cards, fullscreen on mobile, refined avatar
- Add missing i18n keys: notifications_friendlyMatches, notifications_tournaments (en/ca)
- Fix tournament chart filters and fullscreen overlay for light/violet-light themes

## [2.4.70] - 2026-03-01
- Add seed lookup (buildSeedMap) for 3rd/4th place and consolation bracket matches
- Show other non-counted tournaments in ranking detail modal
- Add tournament links with short key URLs in ranking modal
- Redesign ranking total-row with scoreboard style
- Add "Todos" best-of-N filter option to count all tournaments

## [2.4.69] - 2026-03-01
- Defer tournament timer start until after hammer selection dialog
- Document deep-link flow and SW update/ReloadPrompt in PWA docs

## [2.4.68] - 2026-03-01
- Fix push notification deep-link not opening tournament match when already on /game
- Fix WinnerSplash false trigger on tournament match load

## [2.4.67] - 2026-03-01
- Redesign PWA update toast with frosted glass, pulsing indicator, and micro-interactions
- Sync guest user names to /users profiles on tournament completion

## [2.4.66] - 2026-02-28
- Show bracket seed numbers (#1, #2, etc.) in public tournament view for all bracket types

## [2.4.65] - 2026-02-28
- Fix intermittent bracket seeding bug: read from $derived instead of async $state
- Add defensive deduplication in generateSplitBrackets
- Push notification on tournament complete now opens tournament page instead of rankings

## [2.4.64] - 2026-02-28
- Win probability indicator now shows for in-progress matches
- Fix probability reactivity: use $derived instead of getter destructuring
- Bump chart redesigned as card with collapsible accordion (open by default)
- Add fullscreen mode for bump chart with embedded player filter
- Fix bump chart toggle reactivity (Set reassignment)
- Fix score/hammer overlap and watermark centering on mobile

## [2.4.63] - 2026-02-28
- Game page UI refresh: hamburger menu replaces Scorekinole header text
- Add vertical watermark branding overlay on teams container
- Edge-to-edge TeamCards on mobile (no box-shadow, no border-radius)
- Simplify friendly match info display to plain text
- Fix dark team color visibility in TwentyInputDialog selected buttons
- Increase touch click-through delay to 400ms
- Add trigger snippet prop to AppMenu for custom triggers
- Fix a11y warnings on dialog elements in groups admin page
- Remove unused floating-button CSS selectors
- Add webmcp docs for join, my-stats, rankings, tournaments routes
- Improve game page space efficiency and H2H from tournament history

## [2.4.62] - 2026-02-28
- Add win probability indicator for pending tournament matches (groups + bracket)
- Bradley-Terry model with margin-of-victory and H2H blending
- DRY composable (useProbabilities) shared across admin and public views
- Fix missing isFirebaseEnabled import in bracket admin page
- Optimize $effect to avoid redundant Firestore H2H queries

## [2.4.61] - 2026-02-28
- Add ranking push notification when tournament completes (position + points earned)
- Add friendly invite response push notification (accepted/declined)
- Remove unused tournament_phaseChange notification preference
- Fix service worker notificationclick with absolute URLs, try/catch fallbacks
- Add explicit BYE match filter in match-ready notifications
- Add logging for blocked notifications and missing participants
- Parallelize stale FCM token cleanup
- Rollback notification toggle UI on save failure

## [2.4.60] - 2026-02-28
- Fix push notification deep-link stuck at "searching tournament": wait for auth before joining
- Persist tournament key to localStorage so gameSettings.load() won't overwrite it
- Add cancel button and 15s timeout to tournament search loading step
- Fix SSR admin error: derived() expects stores as input (safe store fallbacks)
- Fix service worker URL comparison for notification click handler

## [2.4.59] - 2026-02-28
- Fix BYE cascade in consolation brackets: BYE losers now propagate to 3rd place matches via nextMatchIdForLoser
- Add cascadeByeWins() for iterative BYE resolution across all consolation rounds
- Fix consolation bracket match detection for push notifications deep-link

## [2.4.58] - 2026-02-27
- Fix tournament race conditions: migrate all tournament writes to Firestore runTransaction()
- Fix tournamentTransition.ts: replace raw updateDoc() with atomic transactions
- Fix tournamentParticipants.ts: all participant operations now use transactions (add, remove, update, disqualify)
- Fix tournamentGroups.ts: completeGroupStage now uses transaction with fresh data validation
- Fix tournamentMatches.ts: add idempotency guard (skip already completed matches), block late round sync on completed matches
- Fix game page double submission: reset flag on Firebase write failure to allow retry

## [2.4.57] - 2026-02-27
- Fix offline navigation (cache SPA shell for offline fallback)
- Fix service worker update race condition (skipWaiting could miss statechange)
- Fix FCM token leak on sign-out (deleteAllFCMTokens now called)
- Add FCM token refresh on app load (handles token rotation)
- Fix push notification payload parsing (nested FCM data detection)
- Fix notification click to navigate existing windows instead of opening new ones
- Auto-reload when navigating from protected to safe page after SW update
- Cloud Function: parallel sends, merged Firestore reads, PENDING match filter, 1h TTL
- Cache write-back on miss, O(1) asset lookup, catch update() errors

## [2.4.56] - 2026-02-27
- Fix critical bug: finals push notifications now fire correctly (extractAllMatches traverses goldBracket/silverBracket/parallelBrackets)
- Push notification title shows phase, group, and round context (e.g. "Fase de Grupos · Grupo B · Ronda 1")
- Notifications localized per user language (es/ca/en)
- Redesign notification preferences UI with grouped cards (Torneos / Partidas amistosas)

## [2.4.55] - 2026-02-27
- Auto-update PWA: auto-reload on safe pages, show update prompt on /game and /admin
- Check for updates on app open, on visibility change, and every 10 minutes

## [2.4.54] - 2026-02-27
- Fix Cloud Function match detection for new matches with pre-assigned tables

## [2.4.53] - 2026-02-27
- Fix notification toggle not responding on mobile PWA (label double-click issue)
- Fix Firestore rules for fcmTokens subcollection (missing permissions)

## [2.4.52] - 2026-02-27
- Fix notification preferences defaults to off (prevent false-positive enabled state)
- Fix FCM token registration when browser permission already granted
- Add landscape short viewport layout for ProfileModal (scrollable, compact)
- Add PWA Push Notifications documentation

## [2.4.51] - 2026-02-27
- Add PWA push notifications with FCM infrastructure and Cloud Function for match table alerts
- Add Screen Wake Lock to prevent display turning off during match scoring
- Add NotificationSettings component with per-category toggles in user profile
- Add fullscreen zoom for group charts with navigation and player filters
- Improve landscape mobile layout for short viewports
- Fix WhatsNewModal translation keys

## [2.4.50] - 2026-02-27
- Convert to Progressive Web App (PWA) with service worker, manifest, and install prompt
- Remove Capacitor and APK distribution infrastructure
- Add privacy policy and data deletion pages
- Add What's New modal with changelog on version change
- Add changelog auto-translation and Facebook auth support
- Fix landing page theme flash and replace hammer emoji with game image

## [2.4.49] - 2026-02-26
- Move New Match and Tournament buttons into Scorekinole menu with blue icons
- Redesign hammer indicator as floating image below player name with dark bg inversion
- Add Ctrl+M (new match) and Ctrl+J (tournament match) keyboard shortcuts
- Restrict score interaction to score number only (not full card area)
- Hammer icon scales with player name size setting
- Add player highlight filter to bump chart and 20s chart
- Add game mode scoring badge to public tournament view
- Replace player filter with searchable combobox in transitions
- Fix BYE handling, auto-fill reliability, and WO/DSQ improvements
- Redesign wizard step 6 review with compact layout

## [2.4.48] - 2026-02-25
- Accurate tiebreaker rules in tournament rules modal (2-player vs 3+ player, Swiss vs RR, shoot-out)
- Show ranking points distribution table in tournament rules modal
- BYE score info (8-0, 0 twenties) shown in rules modal
- Save button available on all wizard steps when editing a tournament

## [2.4.47] - 2026-02-25
- Fairer ranking points: doubles threshold = basePoints (fewer pts than singles for same N)
- Always use interpolation (Hamilton) for better position differentiation in large tournaments
- Fix SettingsModal toggle accessibility (onchange instead of onclick)
- Fix edit participants link to correct wizard step

## [2.4.46] - 2026-02-25
- Add point totals (8-0) and zero 20s to Swiss BYE matches for fair tiebreaker scoring

## [2.4.45] - 2026-02-24
- Add page view analytics dashboard (super admin only) with daily stats, top pages, devices, platforms, and top users charts
- Add Crokinole Series ranking system replacing NCA tiers
- Add analytics link to admin dropdown menu

## [2.4.44] - 2026-02-23
- Add match preview dialog showing phase, table, players and config before starting tournament matches
- Improve table assignment algorithm with cycle-fair rotation scoring

## [2.4.43] - 2026-02-23
- Add charts grid with 20s statistics, accuracy donut, and radar charts
- Add live hammer indicator and match result dialog redesign
- Fix round progress display and add player filter in schedule view
- Remove DSQ button and ranking points from standings table (TV-friendly)
- Add tournament edition to match header and improve game detail layout

## [2.4.42] - 2026-02-22
- Fix {@const} invalid placement in CompletedTournamentView (build error)
- Fix TypeScript errors in bracket page (PhaseConfig types, unused vars)
- Fix Tailwind v4 important syntax (!prefix → suffix!)
- Remove unused code in my-stats and game pages

## [2.4.41] - 2026-02-22
- Add interactive charts to public tournament page (bump chart + 20s grouped bar chart)
- Bump chart shows position evolution per round with expand/collapse toggle
- 20s bar chart shows grouped bars per participant per round
- Add doubles team name popover in standings (shows player names on tap)
- Charts use unified card-style container with shared border
- Integer Y-axis ticks, responsive sizing, dark mode support

## [2.4.40] - 2026-02-22
- Add total 20s per participant with group+bracket breakdown in final standings
- Show per-match 20s in bracket, consolation, and third place matches
- Add individual position badges per consolation final match (e.g., 5º-6º, 7º-8º)
- Redesign consolation matches with bracket-match visual style
- Fix my-stats scroll and friendly match label
- Show 20s value 0 in match detail, redesign header as scoreboard layout
- Fix admin user search to query all users

## [2.4.39] - 2026-02-22
- Improve tournament match flow for logged-in users
- Hide Firestore IDs from public tournament URLs, add share button
- Add tournament start time field and direct participant list in wizard
- Fix consolation bracket round headers and position badges
- Redesign match result dialogs with modern professional look
- Shift violet theme to blue-violet color
- Fix bracket vertical connector lines using container-relative positioning
- Fix tournament match selection for consolation brackets
- Fix imported tournament time handling and public read permissions

## [2.4.38] - 2026-02-20
- Require first and last name for player registration (validation in all name modals)
- Fix TournamentAdminsModal theme support for violet/violet-light themes
- Use --primary color for winner badge, winner splash, and hammer indicator
- Remove winner-badge overlay from TeamCard score area
- Show initials avatars in tournament mode when no photo exists
- Add custom 404 error page
- Fix duplicate number in suggested qualifiers, tie result in rounds panel
- Fix tournament creation ignoring bracket phase settings
- Implement NCA ranking points with Hamilton interpolation
- Winner splash animation, WebMCP refactor, floating FAB improvements

## [2.4.37] - 2026-02-20
- Redesign floating action buttons: pill style with icon + label, distinct accent colors (primary for new match, amber for tournament)
- Remove reset-tournament floating button and its confirmation modal

## [2.4.36] - 2026-02-19
- Enlarge hammer indicator icon (~25% bigger across all breakpoints and orientations)
- Add filled badge background to hammer indicator (neutral, theme-aware color)
- Add game scoring page with tournament and invite functionality
- Add MatchResultDialog for entering match results with bracket/video support

## [2.4.35] - 2026-02-19
- Add Transform IMPORTED→LIVE wizard: full group/final stage config, round-based input format, enrichedAt flag
- New round-based group stage format (SS R1/RR R1 headers) with auto-computed standings via Union-Find
- Import wizard step 2 & 3: two-column layout with format help cards
- Tournament list: Transform button for non-enriched IMPORTED tournaments, Sparkles icon for enriched ones
- Global badge-tooltip CSS for hover + tap tooltips (mobile/APK compatible)
- Pre-populate duplicate tournament wizard with original data
- Fix duplicate tournament step 3 bracket for SINGLE_BRACKET/SPLIT_DIVISIONS mode
- Fix VenueSelector: auto-propagate manual form values and hide summary while editing

## [2.4.34] - 2026-02-18
- Enforce unique player names with case-insensitive validation
- Fix profile modal closing when selecting text in input
- Widen profile modal and improve player name hint
- Simplify friendly match labels (remove "friendly/amistoso" prefix)

## [2.4.33] - 2026-02-17
- Fix overscroll bounce globally and improve page layouts (admin, my-stats)
- My Stats: sticky header and filters with scrollable content area

## [2.4.32] - 2026-02-17
- Admin: Redesign admin dashboard with scoped CSS, vertical cards on desktop, horizontal on mobile

## [2.4.31] - 2026-02-17
- Fix: Add background image to static/ folder for correct loading

## [2.4.30] - 2026-02-17
- Admin: Redesigned tournament control panel with responsive search, segmented filters, and action buttons
- Admin: Improved typography hierarchy and spacing in tournament list header

## [2.4.29] - 2026-02-17
- Admin: Refactor navigation menu with submenus and restricted access for Users/Matches (Super Admin only)
- Admin: Improve tournament list layout (expandable name column, fixed width for status/participants/actions)

## [2.4.28] - 2026-02-17
- Fix pinch-to-zoom via CSS touch-action

## [2.4.27] - 2026-02-17
- Enable pinch-to-zoom on Android WebView and web viewport

## [2.4.26] - 2026-02-16
- Optimize mobile UX: improved safe-area handling and removed sticky headers in stats
- Fix interaction issues in Game Mode by removing touch action blocks
- Enable native scrolling and zooming on Landing and Admin pages

## [2.4.25] - 2026-02-16
- Enhance my-stats with detailed popover for win/loss stats and separators
- Improve match display with partner info, filters, and detailed results
- Replace CSS-based match list styling with Tailwind utility classes
- Add pre-tournament settings backup flow to documentation

## [2.4.24] - 2026-02-16
- Add pull-to-refresh for rankings, tournaments, and my-stats pages
- Add clickable completed matches in live tournaments to view round details
- Show all participants with ranking points in final standings
- Display standings in 2-column layout with medal emojis for top 3
- Fix passive event listener warning in PullToRefresh

## [2.4.23] - 2026-02-15
- Redesign consolation brackets with horizontal layout (admin-style)
- Redesign landing page quick links and mobile carousel
- Refactor language system with SSR support
- Various UI improvements (ProfileModal, TournamentMatchModal)
- Add AppMenu component
- Fix safe area padding for notch in QR scanner

## [2.4.22] - 2026-02-15
- Add QR code scanning for tournament keys and friendly invite codes
- New QRScanner component with camera toggle, flash, and manual fallback
- Scanner button in /game header for quick tournament/invite joining
- QR display button for admins to show tournament key as QR code
- Android camera permission added for APK support
- Doubles support for friendly matches with partner names
- Show partner names in my-stats and HammerDialog
- Friendly match header displays title and game mode

## [2.4.21] - 2026-02-15
- Normalize line endings (CRLF to LF) across all source files
- Fix Catalan translations (stats_myStatistics, stats_losses)
- Redesign admin back button with ChevronLeft icon
- Refactor MatchEditModal and admin matches page
- Add project documentation (MatchHistory interfaces, Svelte 5 runes, doubles tournaments, network status, scoring terminology, tournament admin)

## [2.4.20] - 2026-02-15
- Fix race condition when editing 20s in friendly match (modal stopped opening)
- Make entire RoundsPanel draggable, not just header
- Fix click-through issue when tapping on expanded panel content
- Replace hardcoded "Tie" text with translation

## [2.4.19] - 2026-02-14
- Add draggable RoundsPanel showing round-by-round results during game
- Display winner name per round for better readability (no team colors)
- Improve match invitation countdown and decline functionality
- Remove legacy HistoryModal, HistoryEntry, SyncConfirmModal components
- Add tournament data structure documentation

## [2.4.18] - 2026-02-14
- Add match invitation system for friendly matches with QR codes
- Users can assign themselves to a team and invite another player via link
- Both players' stats tracked when guest accepts invitation
- Add /join page for accepting match invitations
- Improve tournament wizard step 4 with shadcn components
- Add active matches panel in tournament bracket admin
- Various Swiss algorithm and tournament display improvements

## [2.4.17] - 2026-02-13
- Add personal statistics dashboard (/my-stats) for logged-in users
- Show match history from both friendly matches and tournaments
- Add filters by type, mode, result, and opponent
- Fix tournament round sync after page reload
- Improve English translations for my-stats page

## [2.4.16] - 2026-02-13
- Improve public tournament brackets: vertical layout without tabs, inline consolation
- Add golden styling for final round names in brackets
- Add match detail modal with round-by-round breakdown (click on completed matches)
- Add hammer indicator in match detail modal (when showHammer enabled)
- Fix theme support for violet-light in /tournaments page
- Fix match-result-row font size consistency
- Fix infinite loop in score tracking effect for live matches

## [2.4.15] - 2026-02-13
- Stop creating GUEST users in /users on tournament completion
- Only REGISTERED users appear in public rankings
- Add registration indicators (✓) in Final Standings for doubles
- Show teamName alongside player names in doubles standings
- Fix reactive search when removing participants in tournament wizard

## [2.4.14] - 2026-02-12
- Add Telegram notifications for admin (new users, tournaments)
- Add IP/device fingerprint tracking for fraud detection
- Alert admin when duplicate accounts detected (same IP or device)
- Add onTournamentCreated Cloud Function (LIVE vs IMPORTED)

## [2.4.13] - 2026-02-12
- Simplify update modal to always open GitHub releases page
- Fix "failed to fetch" error by removing fetch-based download

## [2.4.12] - 2026-02-12
- Fix Google profile photos not loading (add referrerpolicy="no-referrer")
- Add preconnect hints for Google user content images

## [2.4.11] - 2026-02-12
- Fix APK download error by using browser instead of native fetch
- Remove unused Capacitor plugins (filesystem, file-opener)

## [2.4.10] - 2026-02-12
- Validate participant names in tournament import knockout results
- Block navigation when unknown participants detected in Step 3
- Add professional warning box with edit button for name mismatches

## [2.4.9] - 2026-02-12
- Native APK download with progress bar and auto-install trigger
- Add Capacitor Filesystem and File Opener plugins
- Redesign UpdateAvailableModal with theme support and download progress

## [2.4.8] - 2026-02-12
- Full theme support for light/violet-light modes across all components
- Fix ThemeToggle to preserve color theme when switching light/dark modes
- Make color theme selector available to all users in profile settings
- Replace hardcoded colors with CSS variables for proper theming

## [2.4.7] - 2026-02-12
- Fix APK download stuck at 100% using Capacitor Browser plugin
- Remove 6-hour rate limiting for version checks
- Remember dismissed versions to avoid repeated update prompts

## [2.4.6] - 2026-02-11
- Auto-grant admin permissions to new users
- Improve dropdown UX and accessibility

## [2.4.5] - 2026-02-10
- Add theme support for UpdateAvailableModal
- Fix Arena logo color consistency

## [2.4.4] - 2026-02-09
- Add tournament import wizard with BYE calculation
- Improve bracket ordering and responsive group tables

## [2.4.3] - 2026-02-08
- Add Walkover (WO) and Disqualification (DSQ) handling
- Replace hardcoded colors with CSS variables

## [2.4.2] - 2026-02-07
- Show user dependencies before deletion
- Add responsive mobile features carousel
- Implement quota management system
- Show LIVE status for active tournaments

## [2.4.1] - 2026-02-06
- UI polish for modals, tournament cards, and video badges
- Add shadcn-svelte UI components
- Improve public tournament bracket display

## [2.4.0] - 2026-02-05
- Refactor doubles to use `participant.partner` structure
- Add Tailwind CSS v4 + shadcn-svelte for gradual UI migration
- Improve Swiss BYE distribution and tie highlighting

## [2.3.13] - 2026-02-04
- Improve tournament wizard UX and VenueSelector reactivity

## [2.3.12] - 2026-02-03
- Show tournament edition in title with localized ordinal suffix

## [2.3.11] - 2026-02-02
- Add LanguageSelector component with page reload for translations
- Auto-detect language for on-demand translations

## [2.3.10] - 2026-02-01
- Venue system for tournament locations
- On-demand translation using MyMemory API
- Admin panel improvements

## [2.3.9] - 2026-01-31
- Tournament poster hero banner
- Improved tournament detail page UX

## [2.3.8] - 2026-01-30
- Improved video cards design in tournament detail
- Fullscreen video modal in portrait orientation

## [2.3.7] - 2026-01-29
- YouTube video embedding for tournament matches

## [2.3.6] - 2026-01-28
- Comprehensive SEO optimization
- Build improvements and chunk size optimization

## [2.3.5] - 2026-01-27
- Fix public tournament view permissions

## [2.1.5] - 2026-01-22
- Fixed rankings table column alignment (points vs tournaments)

## [2.1.4] - 2026-01-21
- Fixed tiebreaker algorithm for group standings
- Improved head-to-head resolution for multi-player ties
- Added recalculate standings button for completed tournaments
- Visual tie indicators for unresolved ties

## [2.1.0] - 2026-01-12
- Major tournament system restructuring
- Moved game configuration to phase-specific objects
- Improved bracket visualization with connecting arrows
- Enhanced UI/UX for tournament creation and management

## [2.0.12] - 2026-01-08
- Improved points mode display in admin matches
- Enhanced game mode visualization

## [2.0.11]
- Fixed Firebase configuration for Google Sign-In in production builds

## [2.0.8]
- Fixed match history rounds accumulation bug
- Fixed 20s counter duplication issue
- Enhanced 20s input dialog (now mandatory for accuracy)

## [2.0.2]
- Optimized settings layout for better mobile experience
- Improved responsive design for all screen sizes
- Timer configuration enhancements

## Earlier Versions
- Match history with cloud sync
- Google Authentication
- Edit match functionality
- Native Android app release
