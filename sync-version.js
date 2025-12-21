const fs = require('fs');
const path = require('path');
const packageJson = require('./package.json');

const version = packageJson.version;
const versionJsonPath = path.join(__dirname, 'www', 'version.json');

const versionData = { version };

fs.writeFileSync(versionJsonPath, JSON.stringify(versionData));
console.log(`✓ version.json actualizado a ${version}`);
