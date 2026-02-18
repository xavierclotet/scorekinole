# Changelog

All notable changes to Scorekinole are documented in this file.

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
