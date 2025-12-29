# Guía de Migración: Estructura de Firestore

## ✅ Cambios Completados

Se ha refactorizado la estructura de Firestore para mover los matches de una colección anidada a nivel raíz, permitiendo queries globales eficientes.

### Cambios en el Código

1. **`src/firebase/firestore.js`** - Actualizado completamente:
   - ✅ `syncMatchToCloud()` - Ahora usa `matches/{matchId}` en lugar de `users/{userId}/matches/{matchId}`
   - ✅ `getMatchesFromCloud()` - Query con `where('userId', '==', user.id)` en colección raíz
   - ✅ `deleteMatchFromCloud()` - Borra de la colección raíz
   - ✅ Añadido `import { where }` a las importaciones
   - ✅ Añadidas funciones avanzadas para el futuro:
     - `getMatchesByEvent(eventTitle, maxResults)` - Filtrar por torneo
     - `getMatchesByDateRange(start, end, maxResults)` - Filtrar por fecha
     - `getAllMatches(maxResults)` - Query global (admin/analytics)

2. **`firestore.rules`** - Reglas de seguridad actualizadas:
   - ✅ Protección para `matches/{matchId}` a nivel raíz
   - ✅ Solo lectura/escritura de matches propios
   - ✅ Validación de `userId` en creación y acceso
   - ✅ Protección para `currentMatch/{userId}`

3. **`firestore.indexes.json`** - Índices compuestos configurados:
   - ✅ `userId` + `syncedAt` (principal)
   - ✅ `userId` + `eventTitle` + `timestamp`
   - ✅ `userId` + `timestamp`

4. **`FIRESTORE_INDEXES.md`** - Documentación completa creada

---

## 📋 Pasos para Desplegar

### 1. Desplegar Índices Compuestos

Los índices son **CRÍTICOS** para que las queries funcionen. Firebase los necesita antes de ejecutar queries complejas.

```bash
firebase deploy --only firestore:indexes
```

**Nota**: Los índices tardan 2-5 minutos en construirse. Verás el progreso en Firebase Console.

### 2. Desplegar Reglas de Seguridad

```bash
firebase deploy --only firestore:rules
```

Esto protege la nueva colección `matches` para que cada usuario solo acceda a sus propios datos.

### 3. Verificar en Firebase Console

1. Ve a **Firebase Console** → **Firestore Database**
2. Verifica que se haya creado:
   - Pestaña **Rules**: Verifica las nuevas reglas
   - Pestaña **Indexes**: Verifica que los 3 índices estén "Building" o "Enabled"

---

## 🔄 Migración de Datos Existentes (Opcional)

Si ya tienes matches guardados en la estructura antigua (`users/{userId}/matches/{matchId}`), puedes migrarlos a la nueva estructura.

### Opción A: Migración Automática en el Navegador

Cuando los usuarios se autentiquen, la app automáticamente subirá sus matches locales a la nueva estructura. No requiere acción manual.

### Opción B: Script de Migración (Cloud Function)

Si necesitas migrar datos existentes en Firebase:

```javascript
// migrate-matches.js (ejecutar con Node.js)
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateMatches() {
  console.log('🔄 Starting migration...');

  const usersSnapshot = await db.collection('users').get();
  let totalMigrated = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    console.log(`\n📂 Processing user: ${userId}`);

    const matchesSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('matches')
      .get();

    console.log(`  Found ${matchesSnapshot.size} matches`);

    for (const matchDoc of matchesSnapshot.docs) {
      const matchData = matchDoc.data();

      // Copy to new location
      await db.collection('matches').doc(matchDoc.id).set({
        ...matchData,
        userId: userId,
        userName: userDoc.data().name || 'Unknown',
        userEmail: userDoc.data().email || ''
      });

      totalMigrated++;
      console.log(`  ✅ Migrated match ${matchDoc.id}`);
    }
  }

  console.log(`\n✅ Migration complete! Migrated ${totalMigrated} matches`);
}

migrateMatches()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
```

**Para ejecutar**:
1. Descarga la Service Account Key desde Firebase Console
2. Instala: `npm install firebase-admin`
3. Ejecuta: `node migrate-matches.js`

---

## 🧪 Probar la Nueva Estructura

### Test 1: Sincronización de Match

1. Inicia sesión en la app
2. Completa una partida
3. Verifica en Firebase Console → Firestore → `matches`
4. Confirma que aparece con tu `userId`

### Test 2: Historial de Matches

1. Abre el historial (botón 📜)
2. Verifica que aparezcan tus matches
3. Verifica que aparezcan badges de sincronización

### Test 3: Query por Evento

Desde la consola del navegador:

```javascript
// Probar query por evento
const { getMatchesByEvent } = await import('./src/firebase/firestore.js');
const matches = await getMatchesByEvent('III CATALUNYA 25');
console.log('Matches del torneo:', matches);
```

### Test 4: Query por Fecha

```javascript
// Probar query por fecha (últimos 7 días)
const { getMatchesByDateRange } = await import('./src/firebase/firestore.js');
const startDate = Date.now() - (7 * 24 * 60 * 60 * 1000);
const endDate = Date.now();
const matches = await getMatchesByDateRange(startDate, endDate);
console.log('Matches de la última semana:', matches);
```

---

## 🎯 Ventajas de la Nueva Estructura

### Queries Eficientes
```javascript
// ANTES: Imposible filtrar por evento sin conocer userId
// ❌ No se podía hacer

// AHORA: Filtrar por evento directamente
const matches = await getMatchesByEvent('III CATALUNYA 25');
```

### Rankings Globales (Futuro)
```javascript
// Obtener todos los matches de un torneo
const matches = await getMatchesByEvent('III CATALUNYA 25');

// Calcular ranking
const ranking = matches.reduce((acc, match) => {
  // Procesar estadísticas...
  return acc;
}, {});
```

### Analytics y Estadísticas
```javascript
// Buscar por fecha entre todos los usuarios
const thisMonth = await getMatchesByDateRange(
  startOfMonth,
  endOfMonth
);

// Estadísticas globales
console.log(`Partidas jugadas este mes: ${thisMonth.length}`);
```

---

## 🚨 Importante

### Desplegar ANTES de Usar

Los índices son obligatorios. Si intentas usar la app sin desplegarlos primero:

```
Error: The query requires an index. You can create it here:
https://console.firebase.google.com/...
```

**Solución**: Despliega los índices con `firebase deploy --only firestore:indexes`

### Compatibilidad Hacia Atrás

- ✅ Los matches en `localStorage` siguen funcionando igual
- ✅ La app sigue funcionando sin Firebase
- ✅ Los matches antiguos se pueden sincronizar normalmente

### Datos Existentes

- Los matches ya sincronizados en la estructura antigua NO se migran automáticamente
- Los usuarios verán sus matches locales normalmente
- Al sincronizar, los matches nuevos usarán la estructura nueva

---

## 📞 Siguiente Paso

1. **Desplegar ahora**:
   ```bash
   firebase deploy --only firestore:indexes,firestore:rules
   ```

2. **Esperar 2-5 minutos** a que se construyan los índices

3. **Probar** la sincronización en la app

4. **(Opcional)** Ejecutar script de migración si tienes datos existentes

---

## ✨ Funciones Disponibles Ahora

```javascript
// Importar funciones
import {
  syncMatchToCloud,
  getMatchesFromCloud,
  deleteMatchFromCloud,
  getMatchesByEvent,
  getMatchesByDateRange,
  getAllMatches
} from './src/firebase/firestore.js';

// Usar en el código
const matches = await getMatchesByEvent('III CATALUNYA 25');
const recentMatches = await getMatchesByDateRange(
  Date.now() - 30 * 24 * 60 * 60 * 1000,
  Date.now()
);
```

Estas funciones ya están implementadas y listas para usar en features futuras como:
- 🏆 Rankings por torneo
- 📊 Estadísticas avanzadas
- 🔍 Búsqueda de matches
- 📈 Analytics de rendimiento
