# 🎯 ScoreCroki

> Professional scoring app for Crokinole players and enthusiasts

A beautiful, responsive web application designed to track scores, manage timers, and enhance your Crokinole gaming experience. Built with modern web technologies and optimized for mobile devices.

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20iOS%20%7C%20Android-brightgreen.svg)

## ✨ Features

### 🎮 Core Gameplay
- **Intuitive Score Tracking**: Swipe up/down to increment/decrement scores
- **Touch-Optimized**: Native touch gestures for seamless mobile experience
- **Two Game Modes**:
  - **By Points**: Play until reaching a target score, with configurable matches to win
  - **By Rounds**: Play a fixed number of rounds (default 4), winner determined by total points
- **Real-time Win Detection**: Automatic winner announcement with visual effects
- **Tie Detection**: Visual overlay with "EMPATE/EMPAT/TIE" message when rounds mode ends in a draw
- **Match Counter**: Track multiple games in a match (points mode only)
- **Hammer Indicator**: Visual indicator (🔨) showing who shoots last in each game
- **Match Victory Celebration**: Confetti animation and enhanced effects when winning the match

### ⏱️ Timer System
- **Configurable Timer**: Set custom minutes and seconds
- **Visual Alerts**: Color-coded warnings when time is running low
- **Always Centered**: Timer remains perfectly centered in any orientation
- **Quick Reset**: One-tap timer reset button

### 🎨 Customization
- **Team Colors**: Choose from primary colors or full HSL color wheel
- **Preset Combinations**: Quick-select from curated color pairs
- **Auto-Contrast**: Text automatically adjusts for optimal readability
- **Player Names**: Personalize team names (up to 18 characters)
- **Event Information**: Add tournament/event title and match phase (e.g., "III CATALUNYA 25", "Final", "Pool A")

### 🌍 Multi-Language Support
- 🇪🇸 Spanish (Español)
- 🇨🇦 Catalan (Català)
- 🇬🇧 English

### 🔧 Advanced Features
- **Google Authentication**: Sign in with your Google account for cloud sync and rankings
- **User Profiles**: Custom player names with profile photos displayed in-game
- **Quick Menu**: Access reset, switch sides, and color swap instantly
- **20s Tracking**: Fast calculator-style input for center shots (20-point) with configurable max (8 for singles, 12 for doubles)
- **Match History**: Automatic tracking of last 10 completed matches with detailed statistics
- **Game Type Selection**: Choose between Individual (singles) or Parejas (doubles) mode
- **Hammer System**: Automatic alternation of shooting order with visual indicator
- **Haptic Feedback**: Vibration on score changes and enhanced vibration on match win
- **Data Persistence**: Automatically saves game state and match history to resume later
- **Responsive Design**: Adapts perfectly to any screen size and orientation

## 📱 Platform Support

### 🚀 Local Development

**Prerequisites:**
- Node.js 18+
- npm

**Quick Start:**
```bash
# Install dependencies
npm install

# Run development server with hot reload
npm run dev
# Open http://localhost:5173

# Build for production
npm run build
# Output: www/

# Preview production build
npm run preview
```

**Available Commands:**
- `npm run dev` - Development server with hot reload (port 5173)
- `npm run build` - Build optimized production bundle to `www/`
- `npm run preview` - Preview production build (port 4173)
- `npm run sync` - Sync with Capacitor
- `npm run build:apk` - Build Android APK

### Web Version
The app is built with **Vite** for optimal performance. After running `npm run build`, open `www/index.html` in any modern browser.

**Supported Browsers:**
- Chrome/Edge 90+
- Safari 14+
- Firefox 88+

### Mobile Apps
Native Android app available. iOS version coming soon.
- 📱 **App Store** (iOS 13+) - Coming Soon
- 🤖 **Google Play Store** (Android 8+) - Available

## 📖 User Guide

### Basic Usage
1. **Sign In** (Optional): Click ≡ → Sign In to use your Google account
2. **Start Scoring**: Tap or swipe on score displays to change points
3. **Timer Control**: Click timer to start/pause, use ⟲ to reset
4. **Settings**: Click ⚙️ to configure game rules and appearance
5. **Quick Actions**: Click ≡ to access quick menu options

### Game Setup
1. Open Settings (⚙️)
2. **Choose Game Mode**:
   - **By Points**: Traditional scoring until reaching target points
   - **By Rounds**: Play a fixed number of rounds (default 4)
3. **Configure mode-specific settings**:
   - Points Mode: Set points to win and matches to win
   - Rounds Mode: Set number of rounds to play
4. Select game type (Individual for singles, Parejas for doubles)
5. Configure timer duration
6. Customize team names and colors
7. Enable optional features like 20s tracking and hammer indicator
8. Select your preferred language
9. Click Save to start playing

### Game Modes Explained

#### By Points Mode (Traditional)
- Play rounds until one team reaches the configured "Points to Win"
- Win multiple games to win the overall match
- Match counter tracks progress toward "Matches to Win"
- Victory declared when reaching both point threshold and minimum point difference

#### By Rounds Mode
- Play exactly the configured number of rounds (default: 4)
- Winner is determined by total points accumulated across all rounds
- If teams are tied on points, the game ends in a draw (EMPATE/EMPAT/TIE)
- No match counter - each set of rounds is standalone
- "New Game" option hidden in quick menu (only "New Match" available)

### Game Terminology & Structure
In Crokinole, understanding the game structure is important:

- **Round (Ronda)**: A single scoring exchange where points are tallied (can end 2-0 or 1-1). The hammer alternates automatically after each completed round.
- **Game (Partida)**: In points mode, multiple rounds played until one team reaches the "Points to Win" setting. In rounds mode, the complete set of configured rounds.
- **Match**: In points mode, multiple games played until one team reaches the "Matches to Win" setting. When a match is won, confetti celebrates the victory!

### Hammer System
The hammer (🔨) indicates which team shoots last in each round:
- Enable/disable in Settings with "Show Hammer" checkbox
- Automatically alternates after each completed round (2-0 or 1-1)
- When starting a new match, choose which team starts first
- The team that shoots first does NOT have the hammer

### 20s Tracking (Center Shots)
When enabled, after each completed round you'll be prompted to enter center shots (20-point):
- **Calculator Interface**: Quick number buttons for fast entry
- **Sequential Input**: Enter one team at a time for speed
- **Auto-Advance**: Automatically proceeds after each team's entry
- **Dynamic Max**: Shows 0-8 buttons for Individual games, 0-12 for Parejas (doubles)
- Button 0 spans full width for quick "no 20s" entry
- **Match History Integration**: All 20s data is saved per round for detailed history viewing

### Event & Phase Display
Optionally display tournament or event information on screen:
- **Event Title**: Displayed at the top center (e.g., "III CATALUNYA 25", "Summer Tournament 2025")
- **Match Phase**: Shown vertically on the right side (e.g., "Final", "Semifinal 1", "Pool A")
- **Configuration**: Set in Settings modal at the top of the configuration panel
- **Persistence**: Automatically saved with game settings
- **History Integration**: Event title and phase are saved with each completed match
- **Non-Intrusive Design**: Semi-transparent background with high contrast for visibility without distraction
- **Responsive**: Adapts font size and positioning across all screen sizes and orientations

### User Profiles & Authentication
Sign in with Google to unlock additional features:
- **Player Profile**: Set a custom player name that appears in your matches
- **Profile Photo**: Your Google profile photo displays next to your name during games
- **Auto-Fill Team 1**: When signed in, your player name automatically fills Team 1
- **Match History Sync**: Save your match history to the cloud (coming soon)
- **Rankings**: Compete with other players for leaderboard positions (coming soon)

**How to use:**
1. Click the hamburger menu (≡)
2. Click "Sign In" and authorize with your Google account
3. Set your player name (first time only)
4. Your name and photo will automatically appear in Team 1

### Match History (📜)
Automatically tracks your last 10 completed matches with comprehensive details:
- **Accessible via History Button**: Click the 📜 button (located where 20s counters used to be) to view past matches
- **Auto-Display**: History modal automatically appears when a match completes
- **Detailed Statistics**:
  - **For Points Mode**:
    - Match result with game wins (e.g., "Team1 wins 2-1")
    - Each individual game with round-by-round breakdown
    - Points scored per round within each game
    - Total 20s per game and overall match
    - Hammer indicators showing who shot last in each round
  - **For Rounds Mode**:
    - Final score and winner/tie status
    - Points won in each individual round (not cumulative)
    - 20s count per round (if enabled)
    - Hammer status for each round
- **Match Information**:
  - Event title and phase (if configured)
  - Date and time (DD/MM/YY HH:MM format)
  - Game mode (e.g., "A 7p • Best of 3" or "4 rounds")
  - Game type (Individual/Doubles)
  - Actual match duration
  - Team names and colors
- **Easy Management**: Delete individual matches with one tap
- **Multi-language**: All labels translated to Spanish, Catalan, and English
- **Mobile Optimized**: Smooth touch scrolling with proper spacing

### Resetting Games
- **New Game** (Points Mode only): Clears points and resets timer (keeps games won counter, hammer alternates for next game)
- **New Match**: Full reset of all counters and stats, always prompts for new hammer selection
- **Switch Sides**: Swaps team positions on screen
- **Switch Colors**: Exchanges team colors only

**Notes**:
- In rounds mode, "New Game" is hidden from the quick menu (only "New Match" available)
- When a match is won, only "New Match" is available to start a new match
- Scoring is automatically blocked once all rounds are completed in rounds mode

## 🛠️ Technical Details

### Architecture
- **Build Tool**: Vite 6.x for fast development and optimized production builds
- **Module System**: ES6 modules for better code organization
- **Styling**: Modular CSS with responsive design (1,848 lines)
- **Storage**: Browser localStorage for offline-first data persistence
- **Mobile Ready**: Built with Capacitor for native Android/iOS apps

### Tech Stack
- **Frontend**: Vanilla JavaScript (no framework dependencies)
- **Backend**: Firebase (optional, for cloud sync and authentication)
  - Authentication: Google Sign-in
  - Database: Firestore for match history sync
- **Development**: Hot module replacement (HMR) with Vite
- **Build**: Optimized bundles with tree-shaking and minification

### Project Structure
```
scorekinole/
├── src/                 # Source code (edit here)
│   ├── index.html      # Main HTML
│   ├── main.js         # Entry point
│   ├── styles/         # CSS modules
│   ├── js/             # JavaScript modules
│   ├── firebase/       # Firebase integration
│   └── public/         # Static assets (copied to build)
└── www/                # Build output (auto-generated)
```

### Firebase Integration
Firebase is **optional** and disabled by default. The app works 100% offline with localStorage.

To enable Firebase (for developers):
1. See [DEPLOYMENT.md](DEPLOYMENT.md) for configuration instructions
2. Set `VITE_FIREBASE_ENABLED=true` in `.env`
3. Configure Firebase credentials in `.env`

**Features when Firebase is enabled:**
- 🔐 **Google Authentication**: Sign in with your Google account
- 👤 **User Profiles**: Custom player names with profile photos
- 📸 **Profile Photo Display**: Your photo appears next to your name in-game
- 🎯 **Auto-Fill Team Names**: Signed-in users automatically fill Team 1
- ☁️ **Cloud Sync**: Match history sync across devices (coming soon)
- 🏆 **Rankings**: Player leaderboards and statistics (coming soon)

## 📄 License

**Copyright © 2025 Xavier Clotet. All rights reserved.**

This software is proprietary and confidential. Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited without explicit written permission from the copyright holder.

For licensing inquiries, please contact: [xaviterra11@gmail.com]

## 🤝 Contributing

This is a closed-source project. If you'd like to report bugs or suggest features, please open an issue on GitHub.

## 📞 Support

- 📧 Email: [xaviterra11@gmail.com]
- 🐛 Issues: [GitHub Issues](https://github.com/xavierclotet/scorekinole/issues)
- 💬 Feedback: Use the "Give Feedback" button in the app

## 🎯 Roadmap

### v1.x (Current)
- [x] Native Android app release
- [x] Match history with detailed statistics (last 10 matches)
- [x] Google Authentication with Firebase
- [x] User profiles with custom player names
- [x] Profile photo display in-game
- [x] Auto-fill Team 1 with signed-in player
- [ ] Web version release (Firebase Hosting)
- [ ] Cloud sync for match history across devices

### v2.0 (Future)
- [ ] Player search and pairing system
  - Search registered players by name
  - Quick partner selection for doubles matches
  - Saved favorite partnerships
  - Team name auto-generation (Player1 - Player2)
- [ ] Advanced rankings and statistics
  - Individual player rankings
  - Partnership statistics
  - Head-to-head records
  - Performance analytics dashboard
- [ ] Tournament mode with brackets
- [ ] Social features
  - Share match results
  - Challenge other players
  - Leaderboards
- [ ] Export/import match history (CSV, JSON)

## 🏆 Credits

Developed with ❤️ by Xavi Clotet

---

**⭐ If you enjoy this app, please consider rating it on the App Store / Google Play!**
