# GitHub Configuration

This directory contains GitHub-specific configuration files for the ScoreCroki project.

## Files

### Workflows

- **[`workflows/release.yml`](workflows/release.yml)** - Automated release pipeline
  - Triggers on version tags (`v*.*.*`)
  - Builds Android APK
  - Creates GitHub Release with APK attached
  - Runs on Ubuntu with Node.js 18 and Java 17

### Documentation

- **[`HOW_TO_RELEASE.md`](HOW_TO_RELEASE.md)** - Complete guide for creating releases
  - Automated release process with `npm run release`
  - Manual release alternatives
  - Troubleshooting guide
  - Workflow monitoring instructions

- **[`RELEASE_TEMPLATE.md`](RELEASE_TEMPLATE.md)** - Template for release notes
  - Use when creating manual releases
  - Consistent format for changelog
  - Installation instructions included

## Quick Reference

### Creating a Release

```bash
# 1. Update version in package.json, README.md, and src/lib/constants.ts
# 2. Commit changes
git add .
git commit -m "chore: Bump version to X.Y.Z"

# 3. Run release script (creates tag, pushes to GitHub, triggers workflow)
npm run release
```

### Monitoring Releases

- **Actions**: https://github.com/xavierclotet/scorekinole/actions
- **Releases**: https://github.com/xavierclotet/scorekinole/releases
- **Latest Release**: https://github.com/xavierclotet/scorekinole/releases/latest

## Workflow Details

The automated release workflow:
1. ✅ Checks out code
2. ✅ Sets up Node.js 18 and Java 17
3. ✅ Installs dependencies
4. ✅ Builds web app (`npm run build`)
5. ✅ Syncs with Capacitor Android
6. ✅ Builds release APK with Gradle
7. ✅ Renames APK to `scorekinole-X.Y.Z.apk`
8. ✅ Creates GitHub Release with APK

**Build time**: ~5-10 minutes

## For More Information

See [HOW_TO_RELEASE.md](HOW_TO_RELEASE.md) for detailed instructions and troubleshooting.
