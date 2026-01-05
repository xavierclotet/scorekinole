import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json from root folder
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const version = packageJson.version;
const apkDir = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'release');
const oldName = 'app-release.apk';
const newName = `scorekinole-${version}.apk`;

const oldPath = path.join(apkDir, oldName);
const newPath = path.join(apkDir, newName);

if (fs.existsSync(oldPath)) {
  fs.renameSync(oldPath, newPath);
  console.log(`✓ APK renombrado: ${newName}`);
  console.log(`📍 Ubicación: ${newPath}`);
  console.log(`\n💡 Para crear un release en GitHub:`);
  console.log(`   1. Ve a: https://github.com/xavierclotet/scorekinole/releases/new`);
  console.log(`   2. Tag: v${version}`);
  console.log(`   3. Adjunta: ${newName}`);
} else {
  console.error(`✗ No se encontró ${oldName}`);
  process.exit(1);
}
