# Firestore Indexes Required

Esta aplicación usa una colección de `matches` a nivel raíz para permitir queries eficientes y globales.

## Estructura de Datos

```
firestore/
├── users/                          # Colección de usuarios
│   └── {userId}/
│       ├── name: string
│       ├── email: string
│       ├── photoURL: string
│       └── playerName: string
│
├── matches/                        # Colección principal de matches (nivel raíz)
│   └── {matchId}/
│       ├── id: string              # ID único del match
│       ├── userId: string          # Quién jugó (INDEXADO)
│       ├── userName: string        # Nombre del usuario
│       ├── userEmail: string       # Email del usuario
│       ├── timestamp: number       # Fecha del match (INDEXADO)
│       ├── syncedAt: timestamp     # Cuándo se subió (INDEXADO)
│       ├── syncStatus: string      # 'synced', 'local', 'error'
│       ├── eventTitle: string      # Título del evento (INDEXADO)
│       ├── matchPhase: string      # Fase de la partida
│       ├── gameMode: string        # 'points' | 'rounds'
│       ├── gameType: string        # 'singles' | 'doubles'
│       ├── team1: object           # Datos del equipo 1
│       ├── team2: object           # Datos del equipo 2
│       ├── winner: string          # 'team1' | 'team2' | 'tie'
│       └── ...resto de datos
│
└── currentMatch/                   # Colección de partidas en curso
    └── {userId}/                   # Una por usuario
        ├── activeDevice: string
        ├── lastUpdate: timestamp
        └── ...datos de partida
```

## Índices Compuestos Requeridos

Firestore requiere índices compuestos para queries con múltiples `where()` y `orderBy()`.

### 1. Query de Matches por Usuario (Principal)
**Colección**: `matches`
**Campos indexados**:
- `userId` (Ascending)
- `syncedAt` (Descending)

**Uso**: `getMatchesFromCloud()` - obtener historial del usuario ordenado por fecha

### 2. Query por Usuario y Evento
**Colección**: `matches`
**Campos indexados**:
- `userId` (Ascending)
- `eventTitle` (Ascending)
- `timestamp` (Descending)

**Uso**: `getMatchesByEvent()` - filtrar matches de un torneo específico

### 3. Query por Usuario y Rango de Fechas
**Colección**: `matches`
**Campos indexados**:
- `userId` (Ascending)
- `timestamp` (Ascending)
- `timestamp` (Descending)

**Uso**: `getMatchesByDateRange()` - filtrar matches por período de tiempo

## Crear Índices en Firebase Console

### Opción 1: Manualmente en Firebase Console

1. Ve a **Firebase Console** → **Firestore Database** → **Indexes**
2. Haz clic en **Create Index**
3. Crea cada índice con la configuración especificada arriba

### Opción 2: Automáticamente con `firestore.indexes.json`

Crea un archivo `firestore.indexes.json` en la raíz del proyecto:

```json
{
  "indexes": [
    {
      "collectionGroup": "matches",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "syncedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "matches",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "eventTitle", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "matches",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Luego despliega con:
```bash
firebase deploy --only firestore:indexes
```

### Opción 3: Esperar el Error y Usar el Link

Cuando ejecutes una query que requiera un índice, Firestore te dará un error con un link directo para crear el índice automáticamente. Simplemente:

1. Ejecuta la query en la app
2. Revisa la consola del navegador
3. Copia el link del error (ej: `https://console.firebase.google.com/...`)
4. Pégalo en el navegador y confirma la creación del índice
5. Espera 2-5 minutos a que se construya

## Reglas de Seguridad

Actualiza `firestore.rules` para proteger la colección:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users collection - read/write own data only
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Matches collection - users can only read/write their own matches
    match /matches/{matchId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }

    // Current match - users can only access their own
    match /currentMatch/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Despliega las reglas con:
```bash
firebase deploy --only firestore:rules
```

## Ventajas de la Nueva Estructura

✅ **Queries globales**: Buscar matches por evento sin conocer el usuario
✅ **Filtros eficientes**: Filtrar por fecha, evento, usuario, etc.
✅ **Rankings**: Calcular estadísticas globales para leaderboards
✅ **Escalabilidad**: Preparado para cientos de miles de matches
✅ **Analytics**: Fácil agregar estadísticas y métricas

## Próximos Pasos

1. **Crear índices** en Firebase Console (opciones arriba)
2. **Actualizar reglas** de seguridad en `firestore.rules`
3. **Desplegar** cambios con `firebase deploy`
4. **Probar** la sincronización con la app

## Migración de Datos Existentes

Si hay matches existentes en la estructura antigua (`users/{userId}/matches/{matchId}`), se pueden migrar con una Cloud Function o script:

```javascript
// Script de migración (ejecutar una vez)
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function migrateMatches() {
  const usersSnapshot = await db.collection('users').get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const matchesSnapshot = await db.collection('users').doc(userId).collection('matches').get();

    for (const matchDoc of matchesSnapshot.docs) {
      const matchData = matchDoc.data();

      // Copy to new location
      await db.collection('matches').doc(matchDoc.id).set({
        ...matchData,
        userId: userId
      });

      console.log(`Migrated match ${matchDoc.id} for user ${userId}`);
    }
  }

  console.log('✅ Migration complete!');
}

migrateMatches();
```
