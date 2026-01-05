import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json from root folder
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const version = packageJson.version;
const tag = `v${version}`;

console.log(`\n🚀 Preparando release para la versión ${version}\n`);

// Check if there are uncommitted changes
try {
  const status = execSync('git status --porcelain', { encoding: 'utf8' });
  if (status.trim()) {
    console.error('❌ Error: Hay cambios sin commitear.');
    console.error('   Por favor, commit todos los cambios antes de crear un release.\n');
    console.error('   Cambios pendientes:');
    console.error(status);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error al verificar el estado de Git:', error.message);
  process.exit(1);
}

// Check if tag already exists locally
try {
  const tags = execSync('git tag', { encoding: 'utf8' });
  if (tags.split('\n').includes(tag)) {
    console.error(`❌ Error: El tag ${tag} ya existe localmente.`);
    console.error('   Si quieres recrearlo, primero elimínalo:');
    console.error(`   git tag -d ${tag}\n`);
    process.exit(1);
  }
} catch (error) {
  // git tag might fail if no tags exist, that's fine
}

// Check if tag exists on remote
try {
  execSync(`git ls-remote --tags origin ${tag}`, { encoding: 'utf8', stdio: 'pipe' });
  const remoteTags = execSync(`git ls-remote --tags origin ${tag}`, { encoding: 'utf8' });
  if (remoteTags.trim()) {
    console.error(`❌ Error: El tag ${tag} ya existe en el repositorio remoto.`);
    console.error('   Si quieres recrearlo, primero elimínalo del remoto:');
    console.error(`   git push origin :refs/tags/${tag}\n`);
    process.exit(1);
  }
} catch (error) {
  // Tag doesn't exist on remote, which is what we want
}

console.log('✅ Verificación completada\n');

console.log('📋 Resumen:');
console.log(`   Versión: ${version}`);
console.log(`   Tag: ${tag}`);
console.log(`   Rama actual: ${execSync('git branch --show-current', { encoding: 'utf8' }).trim()}`);
console.log('');

// Confirm with user
console.log('🔄 Acciones que se realizarán:');
console.log(`   1. Crear tag local: ${tag}`);
console.log('   2. Push de commits a origin/main');
console.log(`   3. Push del tag a origin`);
console.log('   4. GitHub Actions construirá y publicará el release automáticamente\n');

// Create and push tag
try {
  console.log(`📝 Creando tag ${tag}...`);
  execSync(`git tag ${tag}`, { stdio: 'inherit' });

  console.log('⬆️  Pushing commits a origin/main...');
  execSync('git push origin main', { stdio: 'inherit' });

  console.log(`⬆️  Pushing tag ${tag} a origin...`);
  execSync(`git push origin ${tag}`, { stdio: 'inherit' });

  console.log('\n✅ Release iniciado correctamente!\n');
  console.log('📊 Monitorea el progreso en:');
  console.log('   https://github.com/xavierclotet/scorekinole/actions\n');
  console.log('🎯 El release estará disponible en ~5-10 minutos en:');
  console.log('   https://github.com/xavierclotet/scorekinole/releases/latest\n');

} catch (error) {
  console.error('\n❌ Error al crear o pushear el tag:', error.message);
  console.error('\nPuedes intentar manualmente con:');
  console.error(`   git tag ${tag}`);
  console.error('   git push origin main');
  console.error(`   git push origin ${tag}\n`);
  process.exit(1);
}
