const fs = require('fs');
const path = require('path');
const packageJson = require('./package.json');

const version = packageJson.version;
const apkDir = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'release');
const oldName = 'app-release.apk';
const newName = `app-release.${version}.apk`;

const oldPath = path.join(apkDir, oldName);
const newPath = path.join(apkDir, newName);

if (fs.existsSync(oldPath)) {
  fs.renameSync(oldPath, newPath);
  console.log(`✓ APK renombrado: ${newName}`);
} else {
  console.error(`✗ No se encontró ${oldName}`);
  process.exit(1);
}
