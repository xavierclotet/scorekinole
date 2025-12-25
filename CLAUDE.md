# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Crokinole Scorer is a single-file HTML web application for tracking scores in Crokinole games. The entire application is contained in `index.html` - a self-contained HTML file with embedded CSS and JavaScript.

**Future Plans**: This web app is designed to be converted into native Android/iOS apps using frameworks like Ionic Capacitor or Apache Cordova. The filename `index.html` is intentionally chosen as it's the standard entry point expected by these mobile app frameworks.

## Architecture

### Single-File Structure
The application uses a monolithic architecture with everything in one HTML file:
- **Lines 1-10**: HTML head with meta tags and Google Fonts (Orbitron, Lexend)
- **Lines 10-1091**: `<style>` block with all CSS, including:
  - CSS variables for theming (`:root`)
  - Responsive media queries for portrait/landscape orientations
  - Multiple breakpoints for different screen heights (900px, 820px, 700px, 600px, 500px)
- **Lines 1093-1520**: HTML structure with modals and UI elements
- **Lines 1522-2655**: `<script>` block with all JavaScript logic

### State Management
All state is stored in global JavaScript variables and persisted to `localStorage`:
- `gameSettings`: Configuration (points to win, timer, language, vibration, etc.)
- `team1` / `team2`: Team data (name, color, points, rounds, matches, 20s counter)
- Timer state: `timerInterval`, `timerRunning`, `timeRemaining`
- Color picker state: `currentColorTeam`, `tempColor`, `selectedPreset`

Data persistence uses three localStorage keys:
- `crokinoleGame`: Game settings
- `crokinoleTeam1`: Team 1 data
- `crokinoleTeam2`: Team 2 data

### Key Design Patterns

**Element Selection by ID**: The codebase uses IDs extensively for robustness. Always use `document.getElementById()` instead of array indices with `querySelectorAll()`. This prevents breakage when HTML structure changes.

Example of correct approach:
```javascript
const btnRateApp = document.getElementById('btnRateApp');
if (btnRateApp) btnRateApp.textContent = '⭐ ' + t('rateApp');
```

**Internationalization**: Translation function `t(key)` retrieves strings from the `translations` object based on `gameSettings.language`. Supports Spanish (es), Catalan (ca), and English (en).

**Responsive Design**: CSS uses extensive media queries based on:
- Orientation (`portrait` vs `landscape`)
- Screen height breakpoints (900px, 820px, 700px, 600px, 500px)
- Timer is always centered with `position: fixed` and `transform: translate(-50%, -50%)`
- Minimum viewport height of 500px with vertical scroll enabled for very small screens

## Key Functional Areas

### Score Tracking
- **Swipe gestures**: Up/down swipes on score displays to increment/decrement
- **Mouse dragging**: Alternative to touch for desktop
- **Tap detection**: Quick taps show indicator briefly
- **Win detection**: `checkWinCondition()` runs after every score change

### Timer System
- Configurable minutes and seconds
- Toggle play/pause on click
- Reset button (⟲)
- Visual warning when < 60 seconds (red color)
- "TIEMPO/TEMPS/TIME OUT" message at 0

### Color Customization
- Two modes: Primary colors grid and HSL color wheel
- Preset color combinations available
- Colors applied with automatic contrast calculation for text
- `getContrastColor()` and `getLuminance()` ensure readability

### Quick Menu
Accessed via hamburger icon (≡), provides:
- Reset Round (clears points, resets timer)
- Reset Match (clears everything including rounds/matches)
- Switch Sides (swaps team positions and data)
- Switch Colors (swaps only team colors)

## Common Development Tasks

### Testing Responsive Behavior
Open in browser and use DevTools device emulation to test different:
- Screen orientations (portrait/landscape)
- Screen heights (900px, 820px, 700px, 600px, 500px are critical breakpoints)
- The timer should always remain centered vertically

### Adding New Translations
Add new keys to all three language objects in the `translations` constant (lines ~1536-1633), then use `t('newKey')` in code.

### Modifying UI Elements
When adding/removing settings sections or buttons:
1. Add unique `id` attributes to HTML elements
2. Reference by ID in JavaScript (never by array index)
3. Add null checks: `if (element) element.textContent = ...`

### Version Control
- **CRITICAL: NEVER create commits automatically. Always wait for explicit user instruction to commit.**
- Use semantic versioning for tags (v1.0.0, v1.1.0, etc.)
- Keep commit messages clean and professional without AI attribution
- Focus on describing what changed and why

### Updating Version Number
When creating a new version, update the version number in ALL of these files:
1. `package.json` - Line 2: `"version": "X.Y.Z"`
2. `www/version.json` - Line 1: `{"version":"X.Y.Z"}`
3. `README.md` - Line 7: `![Version](https://img.shields.io/badge/version-X.Y.Z-blue.svg)`
4. `www/index.html` - Line ~2148: `const APP_VERSION = 'X.Y.Z';`

**Important**: Always update all four files together to keep version numbers in sync.

### Version Management in localStorage
The app uses automatic version detection to clear incompatible game data:
- `APP_VERSION` constant (line ~2148) defines the current app version
- `gameSettings.appVersion` stores the version with saved data
- When `loadData()` runs, it compares saved version with current `APP_VERSION`
- If versions differ: clears `crokinoleGame`, `crokinoleTeam1`, `crokinoleTeam2` (but preserves match history)
- `saveData()` always saves the current `APP_VERSION` with game settings
- This prevents structure incompatibilities when the data model changes between versions

## Critical Implementation Details

### Timer Centering
The timer uses `position: fixed` with `top: 50%; left: 50%; transform: translate(-50%, -50%)` to remain centered regardless of content size. This is set in both the base `.timer-container` class and reinforced in orientation media queries.

### Player Name Sizing
Player names use responsive sizing:
- Desktop default: 3rem
- Portrait ≤900px: 2.5rem
- Portrait ≤820px: 2.2rem (critical before landscape switch)
- Portrait ≤700px: 2rem
- Portrait ≤600px: 1.8rem
- Portrait ≤500px: 1.5rem

### Reset Functions
- `resetRound()`: Clears points, removes winner state, **resets timer** (not just stops it)
- `resetMatch()`: Full reset including rounds and matches
- Both call `saveData()` to persist changes

### LocalStorage Structure
Data is loaded on init via `loadData()` and saved after every state change via `saveData()`. The app gracefully handles missing localStorage data with sensible defaults.

## Deployment

### Web Version
The application is fully client-side and requires no build step. Simply open `index.html` in any modern browser or host it on any static web server.

### Mobile App Conversion
The app is structured to be easily converted to native mobile apps:
- **Ionic Capacitor**: Recommended for modern mobile app development
- **Apache Cordova**: Alternative framework for hybrid apps
- Both frameworks expect `index.html` as the entry point
- The app uses web standards (localStorage, touch events) that work seamlessly in WebView containers
