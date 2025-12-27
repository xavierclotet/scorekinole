# 🚀 Vite + Firebase Setup

Este proyecto ahora usa **Vite** para desarrollo y **Firebase** para autenticación y sincronización de partidas.

## 📁 Estructura del Proyecto

```
scorekinole/
├── src/                      # Código fuente modular
│   ├── index.html           # HTML principal (sin CSS/JS embebido)
│   ├── main.js              # Entry point - importa todo
│   ├── styles/
│   │   └── main.css         # Todos los estilos
│   ├── js/
│   │   ├── constants.js     # APP_VERSION, APP_NAME, DEFAULT_GAME_SETTINGS
│   │   ├── translations.js  # i18n (ES, CA, EN)
│   │   └── app.js           # Lógica principal de la app
│   └── firebase/
│       ├── config.js        # Configuración Firebase
│       ├── auth.js          # Autenticación con Google
│       └── firestore.js     # Sincronización de partidas
├── www/                      # Build output (para Capacitor)
├── .env.local               # Configuración local (NO committed)
├── .env.example             # Template de configuración
├── vite.config.js           # Configuración de Vite
└── package.json             # Scripts y dependencias
```

## 🛠️ Comandos Disponibles

```bash
# Desarrollo con hot reload
npm run dev

# Build para producción (genera en www/)
npm run build

# Preview del build
npm run preview

# Sincronizar con Capacitor
npm run sync

# Build completo + APK Android
npm run build:apk
```

## 🔥 Configurar Firebase

### 1. Firebase Console Setup

Ve a https://console.firebase.google.com/ y:

1. **Crear proyecto** → nombre: `scorekinole`
2. **Añadir app web** → Click en `</>` (Web)
3. **Copiar** el objeto `firebaseConfig` que aparece
4. **Activar Authentication** → Google provider
5. **Activar Firestore** → Modo prueba → Ubicación: `europe-west1`

### 2. Configurar Reglas de Firestore

En Firestore → Reglas, pega esto:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /matches/{matchId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

### 3. Configurar Variables de Entorno

Edita `.env.local`:

```env
VITE_FIREBASE_ENABLED=true

VITE_FIREBASE_API_KEY=TU_API_KEY_AQUI
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto-id
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

## 📦 Modo Local (sin Firebase)

Por defecto, Firebase está **DESACTIVADO**. La app funciona 100% en local con localStorage.

Para trabajar sin Firebase:
- Deja `VITE_FIREBASE_ENABLED=false` en `.env.local`
- Todo funcionará normalmente sin sincronización a la nube

## 🎯 Características Firebase

### Autenticación
- Login con Google
- Usuario único con ID, nombre, email, foto
- Mock user en modo desarrollo

### Sincronización de Partidas
- Cada partida se marca como `synced` o `local`
- Indicador visual en el historial (🔄 sync / 📱 local)
- Auto-sync cuando usuario está autenticado

### Estructura de Datos Firestore

```
users/{userId}/
  └── matches/{matchId}
      ├── id: string
      ├── userId: string
      ├── metadata: {}
      ├── teams: []
      ├── games: []
      ├── syncedAt: timestamp
      └── syncStatus: 'synced' | 'local' | 'error'
```

## 🔄 Migración desde HTML Monolítico

### Antes (www/index.html)
- Todo en un archivo: HTML + CSS (1848 líneas) + JS (2300 líneas)
- 4600+ líneas en total
- Difícil de mantener y modularizar

### Ahora (src/)
- **Modular**: Archivos separados por responsabilidad
- **Vite**: Hot reload, build optimizado
- **Firebase ready**: Preparado para cloud sync
- **Fácil de migrar a Svelte**: Estructura ya lista

## 📝 Próximos Pasos

1. ✅ **Setup básico completado**
2. 🔄 **Configurar Firebase** (cuando estés listo)
3. 🎨 **Añadir UI de login** (botón Sign in with Google)
4. 📊 **Añadir indicador sync** en historial
5. 🚀 **Modularizar más** (timer.js, history.js, etc.) - OPCIONAL
6. 🎭 **Migrar a Svelte** - FUTURO

## ⚠️ Importante

- **NO commits `.env.local`** (ya está en .gitignore)
- **www/ se regenera** con cada build - NO edites manualmente
- **Edita solo en src/** - www/ es output
- **Firebase opcional** - app funciona sin él

## 🐛 Troubleshooting

### Build falla
```bash
# Limpiar y rebuild
rm -rf www/ node_modules/
npm install
npm run build
```

### Firebase no inicializa
- Verifica que `VITE_FIREBASE_ENABLED=true`
- Revisa que todas las variables VITE_FIREBASE_* estén configuradas
- Mira la consola del navegador para errores

### App no funciona después del build
- Abre `www/index.html` en navegador
- Revisa la consola del navegador
- Verifica que los assets se hayan generado en `www/assets/`
