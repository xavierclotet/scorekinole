# 🎯 ScoreCroki - SvelteKit Version

> Professional scoring app for Crokinole players - Built with SvelteKit + TypeScript

This is the SvelteKit migration of the ScoreCroki application, providing a modern, component-based architecture with full TypeScript support.

## ✨ What's New in SvelteKit Version

### Architecture Improvements
- **Component-Based**: Modular Svelte components for better maintainability
- **TypeScript**: Full type safety with strict mode enabled
- **Reactive Stores**: Centralized state management with Svelte stores
- **File-Based Routing**: Automatic routing via SvelteKit
- **Scoped CSS**: Component-specific styles for better organization
- **Code Splitting**: Automatic optimization for faster load times

### Developer Experience
- **HMR**: Hot Module Replacement for instant feedback
- **Type Safety**: Catch errors at compile time
- **IntelliSense**: Full autocomplete support in VS Code
- **Refactoring**: Safe renaming across the entire codebase

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Development server (port 5174)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run check

# Sync with Capacitor
npm run sync
```

## 📁 Project Structure

```
sveltekit-app/
├── src/
│   ├── lib/
│   │   ├── components/          # Svelte components
│   │   │   ├── TeamCard.svelte
│   │   │   ├── Timer.svelte
│   │   │   ├── SettingsModal.svelte
│   │   │   ├── HistoryModal.svelte
│   │   │   ├── QuickMenu.svelte
│   │   │   ├── ColorPickerModal.svelte
│   │   │   ├── HammerDialog.svelte
│   │   │   ├── TwentyInputDialog.svelte
│   │   │   └── ...
│   │   ├── stores/              # Svelte stores (state management)
│   │   │   ├── language.ts      # i18n store
│   │   │   ├── gameSettings.ts  # Game configuration
│   │   │   ├── teams.ts         # Team data
│   │   │   ├── timer.ts         # Timer state
│   │   │   ├── matchState.ts    # Match state tracking
│   │   │   ├── history.ts       # Match history
│   │   │   └── auth.ts          # Firebase auth
│   │   ├── firebase/            # Firebase integration
│   │   │   ├── config.ts
│   │   │   ├── auth.ts
│   │   │   ├── firestore.ts
│   │   │   └── userProfile.ts
│   │   ├── i18n/                # Internationalization
│   │   │   └── translations.ts
│   │   ├── types/               # TypeScript interfaces
│   │   │   ├── team.ts
│   │   │   ├── settings.ts
│   │   │   └── history.ts
│   │   ├── utils/               # Utility functions
│   │   │   └── vibration.ts
│   │   └── constants.ts         # App constants
│   ├── routes/                  # SvelteKit routes
│   │   ├── +layout.svelte       # App layout
│   │   ├── +page.svelte         # Home page (redirects to /game)
│   │   └── game/
│   │       └── +page.svelte     # Main game page
│   ├── app.html                 # HTML template
│   └── app.css                  # Global styles
├── static/                      # Static assets
├── svelte.config.js             # SvelteKit configuration
├── vite.config.ts               # Vite configuration
└── tsconfig.json                # TypeScript configuration
```

## 🏗️ Architecture Overview

### State Management

The app uses Svelte stores for centralized state management:

#### Core Stores

**`gameSettings`** - Game configuration
```typescript
{
  gameMode: 'points' | 'rounds',
  gameType: 'singles' | 'doubles',
  pointsToWin: number,
  roundsToPlay: number,
  timerMinutes: number,
  timerSeconds: number,
  language: 'es' | 'ca' | 'en',
  vibrationEnabled: boolean,
  show20s: boolean,
  // ... more settings
}
```

**`team1` & `team2`** - Team data
```typescript
{
  name: string,
  color: string,
  points: number,
  rounds: number,
  matches: number,
  twenty: number,
  hasWon: boolean,
  hasHammer: boolean
}
```

**`matchState`** - Match state tracking
```typescript
{
  matchStartedBy: string | null,
  currentGameStartHammer: number | null,
  twentyDialogPending: boolean,
  matchStartTime: number | null,
  currentMatchGames: GameData[],
  currentMatchRounds: RoundData[],
  // ...
}
```

**`timer`** - Timer state
```typescript
{
  timerRunning: boolean,
  timeRemaining: number,
  timerDisplay: derived<string>  // "MM:SS"
}
```

**`language`** - Internationalization
```typescript
{
  language: writable<'es' | 'ca' | 'en'>,
  t: derived<(key: string) => string>
}
```

### Component Architecture

#### Main Components

**`TeamCard.svelte`** - Displays team information and handles scoring
- Props: `teamNumber` (1 or 2)
- Events: `changeColor`, `roundComplete`
- Features: Touch gestures, score increment/decrement, win detection

**`Timer.svelte`** - Game timer with play/pause/reset
- Props: `size` ('small' | 'large')
- Features: Auto-countdown, visual warnings, always centered

**`SettingsModal.svelte`** - Game configuration
- Props: `isOpen`, `onClose`
- Features: All game settings, persistence to localStorage

**`HistoryModal.svelte`** - Match history viewer
- Props: `isOpen`, `onClose`
- Features: 3 tabs (Current, History, Deleted), cloud sync, restore

**`QuickMenu.svelte`** - Quick actions menu
- Features: Reset round/match, switch sides/colors, logout

**`ColorPickerModal.svelte`** - Team color selector
- Props: `isOpen`, `teamNumber`
- Features: Primary colors grid, HSL wheel, presets

**`HammerDialog.svelte`** - Starting team selector
- Props: `isOpen`, `onClose`
- Features: Visual team buttons with colors

**`TwentyInputDialog.svelte`** - 20s counter input
- Props: `isOpen`
- Events: `close`
- Features: Dual-team input, auto-save, dynamic max (8/12)

### Data Flow

1. **Initialization** (`+page.svelte` onMount):
   - Load gameSettings from localStorage
   - Load teams from localStorage
   - Load matchState from localStorage
   - Load history from localStorage
   - Start currentMatch if not exists
   - Show HammerDialog if no hammer assigned

2. **Score Change** (TeamCard):
   - User swipes/taps → `incrementScore()` or `decrementScore()`
   - Check round completion (total change === 2)
   - Dispatch `roundComplete` event
   - Parent stores pendingRoundData
   - If show20s enabled → show TwentyInputDialog
   - Otherwise → finalize round immediately

3. **Round Completion Flow**:
   - Show TwentyInputDialog (if enabled)
   - User selects 20s for both teams
   - Dialog auto-closes → `handleTwentyInputClose()`
   - Call `teamCard.finalizeRound()`
   - Update round counters
   - Rotate hammer
   - Save round to matchState
   - Update currentMatch.rounds for history
   - Check win conditions

4. **Match Completion**:
   - Save to history
   - Show HistoryModal
   - Reset teams (preserve names/colors)

### Firebase Integration

Firebase services are modular and optional:

**`firebase/auth.ts`**
- Google Sign-In
- User state management
- Profile photo URLs

**`firebase/firestore.ts`**
- Match history sync
- Soft delete/restore
- Cross-device access

**`firebase/userProfile.ts`**
- Player name management
- Team auto-fill

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root:

```bash
# Firebase (optional)
VITE_FIREBASE_ENABLED=true
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### TypeScript Configuration

The project uses strict TypeScript mode:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

### Capacitor Configuration

For mobile builds, see `capacitor.config.json` in the root directory.

## 📦 Build & Deployment

### Web Build

```bash
npm run build
```

Output: `build/` directory with static files

### Android Build

```bash
npm run build
npx cap sync android
cd android
./gradlew app:assembleRelease
```

### iOS Build (Coming Soon)

```bash
npm run build
npx cap sync ios
# Open ios/App.xcworkspace in Xcode
```

## 🧪 Testing

Currently in Phase 14 testing. All core features implemented and functional:

✅ Scoring (swipe up/down)
✅ Timer (play/pause/reset)
✅ Configuration (all settings)
✅ Historial (current, history, deleted)
✅ Traducciones (ES/CA/EN)
✅ Responsive (portrait/landscape)
✅ LocalStorage (persistence)
✅ 20s input (dual-team)
✅ Hammer selection (with team colors)
✅ Round completion flow (20s before finalize)
✅ Current match display (rounds table)
✅ Quick menu (all actions)

## 🚧 Known Issues

- None currently reported

## 📝 Migration Notes

This SvelteKit version maintains 100% feature parity with the original Vanilla JS version while providing:

- Better code organization
- Type safety
- Easier maintenance
- Improved developer experience
- Same localStorage structure (compatible with original)
- Same Firebase integration (no data migration needed)

## 🤝 Contributing

See main [README.md](../README.md) for contribution guidelines.

## 📄 License

Copyright © 2025 Xavier Clotet. All rights reserved.

See main [README.md](../README.md) for full license information.
