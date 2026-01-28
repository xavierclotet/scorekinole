# 🎯 ScoreCroki

> Professional Crokinole scoring app for players and tournaments

Beautiful and easy-to-use mobile app to track scores in your Crokinole matches. Perfect for casual games and professional tournaments.

![Version](https://img.shields.io/badge/version-2.2.4-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)
![Platform](https://img.shields.io/badge/platform-Android-brightgreen.svg)

---

## 📥 **DOWNLOAD ANDROID APP**

### 👉 [**DOWNLOAD LATEST VERSION (v2.2.4)**](https://github.com/xavierclotet/scorekinole/releases/latest) 👈

**Installation:**
1. Download the APK file from the link above
2. Enable "Install unknown apps" on your Android device
3. Open the downloaded APK file and follow the instructions

---

## ✨ What Can You Do With ScoreCrokinole Arena?

### 🎮 **Easy Score Tracking**
- **Swipe to Score**: Just swipe up or down on the screen to add or remove points
- **Two Game Modes**:
  - Play to a target score (e.g., first to 7 points)
  - Play a fixed number of rounds (e.g., 4 rounds)
- **Automatic Winner Detection**: The app celebrates the winner with confetti! 🎉
- **Hammer Tracking**: Shows who shoots last each round with a 🔨 icon

### ⏱️ **Built-in Timer**
- Set custom time limits for rounds
- Visual warning when time is running low
- Drag the timer anywhere on screen

### 🎨 **Personalization**
- Choose team colors from a full color picker
- Set custom team names
- Add tournament/event information (e.g., "World Championship 2025 - Final")
- **Multi-Language**: Spanish, Catalan, and English

### 📊 **Match History & Cloud Sync**
- **Automatic History**: All your matches are saved automatically to local storage
- **Detailed Statistics**: See round-by-round breakdown of every match
- **Cloud Sync with Google**: Sign in with Google to sync your matches across devices
  - **Auto-sync on completion**: Matches sync automatically when completed (if signed in)
  - **Manual sync**: "Sync All" button to upload pending matches
  - **Smart team detection**: Automatically detects which team you played based on your profile name
  - **Team selection**: When auto-detection fails, you can manually select which team you played
  - **Sync status indicators**: Visual badges show synced/pending/error status for each match
- **Profile Photos**: Your Google photo appears in the game when signed in
- **Soft Delete & Restore**: Deleted matches go to trash and can be restored
- **Cross-device Access**: View all your match history from any device when signed in

### 🎯 **Advanced Features**
- **20s Tracking**: Quick calculator-style input for center shots
- **Singles & Doubles**: Different max values (8 for singles, 12 for doubles)
- **Quick Actions**: Reset game, switch sides, swap colors instantly
- **Edit Matches**: Modify points and 20s for any completed round
- **Offline Mode**: Works perfectly without internet connection

### 🏆 **Tournament Management (Admin)**

Complete tournament administration system for professional Crokinole events:

#### **Tournament Creation Wizard**
- **5-step guided setup**: Basic info → Format → Ranking → Participants → Review
- **Draft auto-save**: Progress saved automatically, resume anytime
- **Tournament key**: Unique 6-character alphanumeric identifier for each event
- **Edition tracking**: Auto-increment edition numbers for recurring tournaments
- **Location**: Country and city configuration

#### **Tournament Formats**
- **One Phase**: Direct elimination bracket (2-64 participants)
- **Two Phases**: Group stage + Final bracket
  - Group stage: Round Robin or Swiss System
  - Final stage: Single bracket or Gold/Silver divisions

#### **Group Stage Options**
- **Round Robin**: Automatic scheduling with configurable number of groups
- **Swiss System**: Intelligent pairing based on performance
  - Configurable number of rounds
  - Ranking by wins (2/1/0) or total points scored

#### **Final Stage Options**
- **Single Bracket**: Standard elimination tournament
- **Split Divisions**: Gold and Silver brackets
  - Independent configuration for each bracket
  - Different game modes and match formats per division

#### **Game Configuration Per Phase**
- **By Points**: First to X points (e.g., first to 7)
- **By Rounds**: Fixed rounds (e.g., 4 rounds)
- **Best of X**: Configurable matches to win (Best of 1, 3, 5, etc.)
- **Advanced bracket config**: Different settings for early rounds, semifinals, and finals

#### **Tier-Based Ranking System**
- **4 tournament tiers** with different point distributions:
  - Major (Tier 1): 1000-100 points
  - National (Tier 2): 500-50 points
  - Regional (Tier 3): 250-25 points
  - Club (Tier 4): 100-10 points
- **Automatic ranking updates** after tournament completion
- **Ranking snapshots** preserved for historical records

#### **Participant Management**
- **Registered users**: Search and add from Firebase database
- **Guest players**: Quick add without account
- **Doubles support**: Pair configuration
- **Minimum 2 participants** required to start

#### **Tournament States**
- **DRAFT**: Initial setup, editable configuration
- **GROUP_STAGE**: Group matches in progress (Two Phase only)
- **TRANSITION**: Select qualifiers for final bracket
- **FINAL_STAGE**: Bracket matches in progress
- **COMPLETED**: Results finalized, rankings applied
- **CANCELLED**: Tournament cancelled

#### **Match Management**
- **Table assignment**: Configurable number of tables
- **Real-time scoring**: Live score entry and updates
- **20s tracking**: Optional center shot counting
- **Hammer display**: Visual hammer indicator
- **No-show handling**: Walkover support

#### **Visualization**
- **Beautiful bracket display**: Visual connectors between matches
- **Group standings**: Live updated tables with tiebreakers ([see tiebreaker rules](docs/TIEBREAKER.md))
- **Match details**: Round-by-round breakdown
- **Tournament results**: Final standings with all statistics

---

## 📖 How to Use

### Quick Start
1. **Open the app** - Start ScoreCroki on your Android device
2. **Configure settings** - Tap ⚙️ to set your game mode and preferences
3. **Start scoring** - Swipe up/down on the screen to add/remove points
4. **View history** - Tap 📜 to see all your past matches

### First Time Setup
1. Tap the **Settings icon (⚙️)**
2. Choose your **Game Mode**:
   - **By Points**: First to reach X points wins (e.g., first to 7)
   - **By Rounds**: Play X rounds, highest score wins (e.g., 4 rounds)
3. Select **Game Type**: Singles or Doubles
4. Set team names and colors
5. Choose your language (Spanish/Catalan/English)
6. Tap **Save** and start playing!

### Optional: Sign In with Google
- Tap **≡ menu** → **Sign In with Google**
- Your matches will sync automatically to the cloud when completed
- Access your complete match history from any device
- Your profile photo will appear in the game interface
- **Tip**: Set your team name to match your Google profile name for automatic team detection when syncing

### Tips & Tricks
- **Swipe Gestures**: Swipe up to add points, swipe down to remove points
- **Quick Menu (≡)**: Access quick actions like reset, switch sides, or color swap
- **Hammer Icon (🔨)**: Shows which team shoots last in the round
- **20s Tracking**: Enable in settings to track center shots (20-point scores)
- **Edit History**: Tap any completed round in your match history to edit the score
- **Tournament Mode**: Add event name and phase in settings for professional tournaments

---

## 📞 Support & Feedback

Need help or want to report a bug?
- 📧 Email: [xaviterra11@gmail.com]
- 🐛 Report issues: [GitHub Issues](https://github.com/xavierclotet/scorekinole/issues)

---

## 📋 Recent Updates

### v2.1.5 (Latest - 2026-01-22)
- Fixed rankings table column alignment (points vs tournaments)

### v2.1.4 (2026-01-21)
- Fixed tiebreaker algorithm for group standings
- GroupStandings now uses pre-calculated positions from tiebreaker
- Improved head-to-head resolution for multi-player ties
- Added recalculate standings button for completed tournaments
- Visual tie indicators for unresolved ties

### v2.1.0 (2026-01-12)
- Major tournament system restructuring
- Moved game configuration to phase-specific objects (groupStage/finalStage)
- Improved bracket visualization with connecting arrows
- Fixed tournament validation and participant management
- Enhanced UI/UX for tournament creation and management
- Centered final match in bracket view between semifinals

### v2.0.12 (2026-01-08)
- Improved points mode display in admin matches
- Enhanced game mode visualization

### v2.0.11
- Fixed Firebase configuration for Google Sign-In in production builds

### v2.0.8
- Fixed match history rounds accumulation bug
- Fixed 20s counter duplication issue
- Enhanced 20s input dialog (now mandatory for accuracy)

### v2.0.2
- Optimized settings layout for better mobile experience
- Improved responsive design for all screen sizes
- Timer configuration enhancements

### Earlier Versions
- Match history with cloud sync
- Google Authentication
- Edit match functionality
- Native Android app release

## 🏆 Credits

Developed with ❤️ by Xavi Clotet

---

**⭐ If you enjoy this app, please consider rating it on the App Store / Google Play!**
