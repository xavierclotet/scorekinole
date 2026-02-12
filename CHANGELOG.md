# Changelog

All notable changes to Scorekinole are documented in this file.

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
