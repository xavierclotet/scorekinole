# 🚀 Deployment Guide — Scorekinole

Quick command reference for local development and deployment.

> For project architecture and structure, see [AGENTS.md](../../AGENTS.md).

## 💻 Local Development

### Start the dev server
```bash
npm run dev
```
- Opens http://localhost:5173
- Automatic hot reload
- Changes in `src/` are reflected instantly

> **Build output**: `npm run build` generates the static site in `www/` (configured via `@sveltejs/adapter-static` + `firebase.json` → `"public": "www"`). **Do not edit `www/`** — it is regenerated on every build.

---

## 🌐 Web Deploy (Firebase Hosting)

### 1. Production build
```bash
npm run build
```
Generates optimized files in `www/`

### 2. Deploy to Firebase Hosting
```bash
npm run deploy:hosting        # = npm run build && firebase deploy --only hosting
```

### Useful commands
```bash
# Local preview of the build
npm run preview

# See what will be deployed
firebase hosting:channel:list

# Deploy to a preview channel (testing)
firebase hosting:channel:deploy preview
```

### URL after deploy
- **Production**: https://scorekinole.web.app
- **Preview**: https://scorekinole--preview-XXXXX.web.app

---

## 🔧 Useful Commands

### Development
```bash
npm run dev          # Dev server (port 5173)
npm run preview      # Local build preview (port 4173)
npm run build        # Production build (→ www/)
npm run check        # svelte-kit sync && svelte-check
```

### Firebase (npm scripts)
```bash
npm run deploy            # build + firebase deploy (everything)
npm run deploy:hosting    # build + deploy hosting only
npm run deploy:rules      # deploy Firestore rules only
npm run deploy:storage    # deploy Storage rules only
npm run deploy:functions  # deploy Cloud Functions only
```

---

## 📋 Pre-Deploy Checklist

### Web (Firebase Hosting)
- [ ] Update the version in `package.json`, `README.md` (badge), `src/lib/constants.ts`, and `CHANGELOG.md` (new entry at the top)
- [ ] `npm run build`
- [ ] `npm run preview` — verify it works
- [ ] If domain changed: update Authorized JavaScript origins and redirect URIs in Google Cloud Console OAuth client (see Firebase Configuration below)
- [ ] `npm run deploy:hosting`
- [ ] Verify at https://scorekinole.es

---

## ⚠️ Troubleshooting

### Build fails
```bash
# Clean everything and rebuild
rm -rf www/ node_modules/
npm install
npm run build
```

### Firebase deploy fails
```bash
# Re-login
firebase login

# Check the project
firebase projects:list
firebase use scorekinole
```

---

## 🔐 Firebase Configuration

If Firebase is disabled and you want to enable it:

1. Create `.env` with:
```env
VITE_FIREBASE_ENABLED=true
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

2. Enable services in the Firebase Console:
   - Authentication → Google Sign-in
   - Firestore Database → Create database
   - Hosting → Configure domain

3. **If using a custom domain (e.g. `scorekinole.es`)**, add it to the Google OAuth client:
   - Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   - Find the OAuth 2.0 Web Client ID (auto-created by Firebase)
   - Add the domain to **Authorized JavaScript origins**: `https://scorekinole.es`
   - Add the redirect handler to **Authorized redirect URIs**: `https://scorekinole.es/__/auth/handler`
   - Also add it to **Firebase Console → Authentication → Settings → Authorized domains**
   - Repeat for any additional domains (localhost, preview channels, etc.)

4. Deploy security rules:
```bash
npm run deploy:rules
```

---

## ☁️ Cloud Functions

The project has **13 Cloud Functions** in `functions/src/index.ts` (that file is the source of truth). Full list:

| Function | Type | What it does |
|---|---|---|
| `onTournamentComplete` | Firestore `onUpdate` | When a tournament moves to `COMPLETED`: computes ranking points, adds the record to each user's history, creates GUEST users. |
| `onUserPrivateMetaCreated` | Firestore `onCreate` | When `users/{uid}/private/meta` is created: notifies the admin via Telegram and detects duplicate accounts (same IP / same fingerprint). |
| `onTournamentCreated` | Firestore `onCreate` | Notifies the admin via Telegram when someone creates a tournament (LIVE 🏆 / IMPORTED 📥). |
| `onTournamentMatchEvent` | Firestore `onUpdate` | Detects new table assignments and sends push (FCM) to the players. |
| `onTournamentRegistration` | Firestore `onUpdate` | Reacts to changes in a tournament's registrations. |
| `onInviteResponse` | Firestore `onUpdate` | Processes responses to friendly-match invitations. |
| `cleanupExpiredInvites` | Scheduled (Sun 4:00 Madrid) | Deletes expired `matchInvites` documents. |
| `disableUser` | Callable | Admin: disables a user account. |
| `enableUser` | Callable | Admin: re-enables a user account. |
| `deleteUserAccount` | Callable | Full account and data deletion (GDPR). |
| `tournamentSelfRegistration` | Callable | Self-service: register / unregister / leaveWaitlist (logic in `selfRegistrationCore.ts`). |
| `syncTournamentSummary` | Firestore `onWrite` | Keeps the tournament summary in sync. |
| `onPageViewCreated` | Firestore `onCreate` | Processes page view events (analytics). |

**Required secrets** (Telegram):
```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TELEGRAM_CHAT_ID
```

**Telegram bot setup**:
1. Talk to `@BotFather` on Telegram → `/newbot` → save the token
2. Talk to `@userinfobot` to get your chat_id
3. Send a message to your bot to activate the chat
4. Configure the secrets and deploy

### Deploy Functions
```bash
npm run deploy:functions    # from the root (includes FUNCTIONS_DISCOVERY_TIMEOUT)

# Or manually:
cd functions
npm run build               # Compile TypeScript
firebase deploy --only functions
```

> ⚠️ If you rename or remove a function, on the first `deploy` Firebase will ask whether to delete the old one: answer **yes** (e.g. the old `onUserCreated` was renamed to `onUserPrivateMetaCreated` when PII was moved to `users/{uid}/private/meta`).

### View logs
```bash
firebase functions:log                                  # All logs
firebase functions:log --only onUserPrivateMetaCreated  # A single function
firebase functions:log --only onTournamentComplete
```

On PowerShell (Windows):
```powershell
firebase functions:log --only onUserPrivateMetaCreated | Select-Object -First 20
```

### Secrets management
```bash
firebase functions:secrets:set SECRET_NAME      # Create/update a secret
firebase functions:secrets:access SECRET_NAME   # View current value
firebase functions:secrets:prune                # Remove unused versions
```

---

**🎯 Tip**: The app is a PWA. Users can install it from the browser via "Add to Home Screen" and will always have the latest version.
