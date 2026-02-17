# 🎯 ScoreCroki

> Professional Crokinole scoring app for players and tournaments

Beautiful and easy-to-use mobile app to track scores in your Crokinole matches. Perfect for casual games and professional tournaments.

![Version](https://img.shields.io/badge/version-2.4.29-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)
![Platform](https://img.shields.io/badge/platform-Android-brightgreen.svg)

---

## 📥 **HOW TO USE**

### 🌐 **WEB APP (Recommended)**
### 👉 [**https://scorekinole.web.app**](https://scorekinole.web.app/) 👈

Works on any device with a browser - no installation required!

### 📱 **ANDROID APP**
### 👉 [**DOWNLOAD LATEST VERSION (v2.4.29)**](https://github.com/xavierclotet/scorekinole/releases/latest) 👈

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
- **Auto-Translation**: Tournament descriptions can be translated on-demand to user's language (powered by MyMemory API)

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

### 📶 **Offline Mode & Network Status**
- **Offline-First**: Works perfectly without internet connection
- **Connection Indicator**: Visual status icon in header shows connection state
  - 🔶 **Offline**: WiFi-off icon when no internet
  - 🔵 **Syncing**: Spinning icon when syncing data
  - 🟢 **Synced**: Check icon when sync complete (auto-hides)
  - 🔴 **Error**: Warning icon if sync fails
- **Auto-Sync for Tournaments**: When connection is restored during a tournament match, data syncs automatically to Firebase
- **Manual Sync for Friendly Matches**: Use "Sync All" button in History to upload pending matches
- **Admin Sync Feedback**: Tournament admins see sync status when saving match results in Groups and Bracket pages

### 🏆 **Tournament Management (Admin)**

Complete tournament administration system for professional Crokinole events.

> **💡 Tip**: For managing **LIVE tournaments**, we recommend using the **web version on desktop** with a large screen for the best experience. This provides better visibility of brackets, groups, and real-time match updates.

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
- **Games to win X**: Configurable games to win (e.g., first to win 1, 2, 3 games)
- **Advanced bracket config**: Different settings for early rounds, semifinals, and finals

#### **Tier-Based Ranking System**
- **4 tournament tiers** with different point distributions:
  - Major (Tier 1): 50 points to 1st place
  - National (Tier 2): 40 points to 1st place
  - Regional (Tier 3): 25 points to 1st place
  - Club (Tier 4): 15 points to 1st place
- **Automatic ranking updates** after tournament completion
- **Ranking snapshots** preserved for historical records

#### **Participant Management**
- **Registered users**: Search and add from Firebase database
- **Guest players**: Quick add without account
- **Doubles support**: Two players per participant with optional team name
- **Ranking for doubles**: Both players receive individual ranking points
- **Minimum 2 participants** required to start

#### **Tournament States**
- **DRAFT**: Initial setup, editable configuration
- **GROUP_STAGE**: Group matches in progress (Two Phase only)
- **TRANSITION**: Select qualifiers for final bracket
- **KNOCKOUT**: Bracket matches in progress
- **COMPLETED**: Results finalized, rankings applied
- **CANCELLED**: Tournament cancelled

#### **Match Management**
- **Table assignment**: Configurable number of tables
- **Real-time scoring**: Live score entry and updates
- **20s tracking** (optional): Center shot counting
- **Hammer display** (optional): Visual hammer indicator
- **No-show handling**: Walkover (WO) support for participants who don't show up
- **Disqualification (DSQ)**: Remove participants from tournament with automatic opponent advancement
- **Network status indicator**: Visual feedback for connection state and sync status when saving results

#### **Walkover (WO) & Disqualification (DSQ)**
- **Walkover (WO)**: When a participant doesn't show up for a match
  - Opponent automatically wins the match
  - Match marked as "WALKOVER" status
  - Visual indicator: Orange "WO" badge next to participant name
  - Name displayed with strikethrough
- **Disqualification (DSQ)**: When a participant is removed from tournament
  - All pending matches automatically resolved: opponent wins by walkover
  - Winner advances to next round automatically
  - Visual indicator: Red "DSQ" badge next to participant name
  - Name displayed with strikethrough
  - Disqualified participants excluded from bracket generation in transition phase
  - Auto-fix on bracket load: any pending matches vs DSQ participants are resolved
- **Auto-table reassignment**: When bracket loads, tables are automatically reassigned to all playable matches

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
4. **View history** - Tap the **Match History** icon to see all your past matches

### First Time Setup
1. Tap the **Settings icon (⚙️)**
2. Choose your **Game Type**: Singles or Doubles
3. Choose your **Game Mode**:
   - **By Points**: First to reach X points wins (e.g., first to 7)
     - Set **Games to Win** (Pg): How many games needed to win the match
   - **By Rounds**: Play X rounds, highest score wins (e.g., 4 rounds)
     - Enable **Allow Ties** if you want ties to be possible
4. Configure **Features** (all optional):
   - **Track 20s**: Count center shots
   - **Hammer**: Show who shoots last
   - **Timer**: Enable round timer with custom duration
5. Choose your **Language** (Spanish/Catalan/English)
6. Start playing!

### 🎮 Game Modes

#### **Friendly Match**
Play casual games with friends without tournament integration:
1. Configure your settings (⚙️) and tap the **play button (▶)** at the bottom left to start a new game
2. Play your match - scores are saved automatically to **local storage**
3. View your match history in the **Match History** section
4. **Optional**: Sign in with Google and tap **"Sync All"** in History to upload your matches to the cloud
5. Access your synced matches from any device at **/matches**

#### **Tournament Match**
Play as part of an organized tournament:
1. A tournament admin creates the tournament and adds you as participant
2. In **/game**, tap the **trophy button (🏆)** at the bottom right → **Play Tournament Match**
3. Enter the **tournament key** manually OR **scan the QR code** (see QR Scanning below)
4. Your match will be loaded with locked settings
5. Play your match - results sync **automatically** to the tournament
6. Admins can view live results in the tournament dashboard

### 📷 QR Code Scanning

Quickly join tournaments or friendly matches by scanning QR codes instead of typing codes manually.

#### **For Players**
- In **/game**, tap the **QR icon (📷)** in the header (top right)
- Point your camera at the tournament QR code
- The tournament key is auto-filled and your match loads automatically
- Also works for friendly match invite codes

#### **For Tournament Admins**
- In the tournament admin view, click the **QR button** next to the tournament key badge
- A modal displays a large QR code that players can scan
- The QR encodes: `https://scorekinole.web.app/game?key=ABC123`
- Print or display on screen for easy player access

#### **Supported QR Formats**
- Tournament key URL: `scorekinole.web.app/game?key=ABC123`
- Friendly invite URL: `scorekinole.web.app/join?invite=XYZ789`
- Direct 6-character codes: `ABC123`

#### **Camera Permissions**
- **Web**: Browser will prompt for camera access
- **Android APK**: Camera permission is requested automatically
- **Fallback**: If camera is denied, manual code entry is available

### Optional: Sign In with Google
- On the landing page, tap the **profile icon** at the top right → **Log In**
- Access your **friendly match** history from any device (tournament matches are viewed in the tournament detail)
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

## 📖 Scoring Terminology

Crokinole scoring in this app follows a three-level hierarchy:

| Level | English | Spanish | Catalan | Description |
|-------|---------|---------|---------|-------------|
| **Round** | round | ronda | ronda | Single exchange of discs (0-2 points) |
| **Game** | game | partida | partida | Play to target points (e.g., first to 7) |
| **Match** | match | encuentro | encontre | Set of games in Pg format (e.g., Pg2) |

### Abbreviations
- **Pg** (Primero que gane / First to win): Number of games needed to win the match
  - Pg2 = First to win 2 games
  - Pg3 = First to win 3 games
- **p** (puntos / points): Game by points (e.g., 7p = first to 7 points)
- **r** (rondas / rounds): Game by rounds (e.g., 4r = play 4 rounds)

---

## 📞 Support & Feedback

Need help or want to report a bug?
- 📧 Email: [xaviterra11@gmail.com]
- 🐛 Report issues: [GitHub Issues](https://github.com/xavierclotet/scorekinole/issues)

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a complete list of changes in each version.

---

## 🏆 Credits

Developed with ❤️ by Xavi Clotet

---

**⭐ If you enjoy this app, please consider rating it on the App Store / Google Play!**
