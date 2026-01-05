# How to Create a GitHub Release

## 🚀 Automated Release (Recommended)

### Super Simple 2-Step Process

1. **Update version and commit**
   ```bash
   # Update version in: package.json, README.md, src/lib/constants.ts
   # Then commit your changes
   git add .
   git commit -m "chore: Bump version to X.Y.Z"
   ```

2. **Run release script**
   ```bash
   npm run release
   ```

3. **Done!** 🎉
   - The script will:
     - ✅ Verify no uncommitted changes
     - ✅ Check tag doesn't exist
     - ✅ Create the tag
     - ✅ Push commits and tag to GitHub
   - GitHub Actions will automatically:
     - 🏗️ Build the APK
     - 📦 Create the release
     - ⬆️ Upload the APK
   - Check progress: https://github.com/xavierclotet/scorekinole/actions
   - View release: https://github.com/xavierclotet/scorekinole/releases/latest

### Example
```bash
# Update version files and commit
git add .
git commit -m "chore: Bump version to 2.0.10"

# Create and push release (all automated!)
npm run release

# Wait 5-10 minutes for the build to complete
# Release will be available at /releases/latest
```

### Manual Tag Creation (Alternative)

If you prefer to create tags manually:
```bash
git tag v2.0.9
git push origin main
git push origin v2.0.9
```

---

## 🛠️ Manual Release (Alternative)

If you prefer to build locally or the workflow fails:

### 1. Build the APK locally
```bash
npm run build:apk
```

### 2. Create Release Manually

**Option A: GitHub Web Interface**
1. Go to: https://github.com/xavierclotet/scorekinole/releases/new
2. Fill in:
   - **Tag**: `vX.Y.Z` (e.g., `v2.0.9`)
   - **Title**: `Release vX.Y.Z`
   - **Description**: Copy from `.github/RELEASE_TEMPLATE.md` and customize
3. Attach: `android/app/build/outputs/apk/release/scorekinole-X.Y.Z.apk`
4. Click "Publish release"

**Option B: GitHub CLI**
```bash
gh release create v2.0.9 \
  --title "Release v2.0.9" \
  --notes-file .github/RELEASE_TEMPLATE.md \
  android/app/build/outputs/apk/release/scorekinole-2.0.9.apk
```

### 3. Verify
- Visit: https://github.com/xavierclotet/scorekinole/releases
- Download and test the APK
- Verify README links work

## Important Notes

### Before Creating a Release
- ✅ Update version in `package.json`, `README.md`, and `src/lib/constants.ts`
- ✅ Test the app thoroughly
- ✅ Commit all changes
- ✅ Push to GitHub

### Release Naming Convention
- **Tag format**: `vX.Y.Z` (e.g., `v2.0.9`, `v2.1.0`)
- **APK format**: `scorekinole-X.Y.Z.apk` (automatically done by `rename-apk.js`)
- **Title format**: `Release vX.Y.Z` or descriptive (e.g., `v2.0.9 - Bug Fixes`)

### Version Numbering (Semantic Versioning)
- **MAJOR** (X): Breaking changes or major rewrites
- **MINOR** (Y): New features, backwards compatible
- **PATCH** (Z): Bug fixes only

Examples:
- `v1.0.0` → `v1.0.1`: Bug fix
- `v1.0.1` → `v1.1.0`: New feature added
- `v1.1.0` → `v2.0.0`: Breaking changes

## 🤖 How the Automated Workflow Works

The GitHub Action (`.github/workflows/release.yml`) is triggered when you push a tag matching `v*.*.*` pattern.

**What it does:**
1. ✅ Checks out your code
2. ✅ Sets up Node.js 18 and Java 17
3. ✅ Installs npm dependencies
4. ✅ Builds the web app (`npm run build`)
5. ✅ Syncs with Capacitor Android
6. ✅ Builds the release APK with Gradle
7. ✅ Renames APK to `scorekinole-X.Y.Z.apk`
8. ✅ Creates GitHub Release with the APK attached

**Build time:** ~5-10 minutes

**Monitoring the build:**
- Go to: https://github.com/xavierclotet/scorekinole/actions
- Click on the latest workflow run
- You can see real-time logs and build progress
- If it fails, check the logs to see what went wrong

## Troubleshooting

### Automated Workflow Issues

**Workflow not triggering:**
- Verify tag format is `vX.Y.Z` (e.g., `v2.0.9`, not `2.0.9`)
- Make sure you pushed the tag: `git push origin vX.Y.Z`
- Check Actions tab to see if workflow exists

**Build fails in GitHub Actions:**
- Check workflow logs: https://github.com/xavierclotet/scorekinole/actions
- Common issues:
  - Missing dependencies: Check `package.json`
  - Gradle build errors: Check Android project configuration
  - Node/Java version mismatch: Update in `release.yml`
- If workflow fails, you can build manually (see Manual Release section)

**APK not attached to release:**
- Check if APK was created in workflow logs
- Verify the APK path in `release.yml` is correct
- Check GitHub Actions permissions (GITHUB_TOKEN needs write access)

### Local Build Issues

**APK not found after local build:**
- Check `android/app/build/outputs/apk/release/` directory
- Make sure `gradlew.bat` (Windows) or `./gradlew` (Linux/Mac) executed successfully
- Look for build errors in the console output

**Release link not working:**
- Verify the release is published (not draft)
- Check the tag name matches exactly (case-sensitive)
- Wait a few seconds for GitHub to update cache

**APK won't install on device:**
- Ensure "Install from Unknown Sources" is enabled on Android
- Check Android version (requires 8.0+)
- Verify APK signature (should be signed with release keystore)
- Try uninstalling old version first if updating
