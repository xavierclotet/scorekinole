# 🚀 Deployment Guide - ScoreCroki

Guía rápida de comandos para desarrollo local y deployment.

## 💻 Desarrollo Local

### Iniciar servidor de desarrollo
```bash
npm run dev
```
- Abre http://localhost:5173
- Hot reload automático
- Cambios en `src/` se reflejan instantáneamente

### Estructura del proyecto
```
src/          # ✏️ Edita aquí
├── index.html
├── main.js
├── styles/
├── js/
└── firebase/

www/          # ⚠️ NO TOCAR - generado automáticamente
```

**IMPORTANTE**: Solo edita archivos en `src/`. El directorio `www/` se regenera con cada build.

---

## 🌐 Deploy Web (Firebase Hosting)

### 1. Build de producción
```bash
npm run build
```
Genera archivos optimizados en `www/`

### 2. Deploy a Firebase Hosting
```bash
firebase deploy --only hosting
```

### Comandos útiles
```bash
# Preview local del build
npm run preview

# Ver qué se va a deployar
firebase hosting:channel:list

# Deploy a canal de preview (testing)
firebase hosting:channel:deploy preview
```

### URL después del deploy
- **Producción**: https://scorekinole.web.app
- **Preview**: https://scorekinole--preview-XXXXX.web.app

---

## 📱 Build APK Android

### Build completo (automático)
```bash
npm run build:apk
```
Este comando hace todo automáticamente:
1. Build de producción (`npm run build`)
2. Sync con Capacitor (`npx cap sync android`)
3. Build del APK (`gradlew.bat app:assembleRelease`)
4. Renombra APK con timestamp
5. APK final: `ScoreCroki-vX.Y.Z-YYYYMMDD-HHMMSS.apk`

### Build paso a paso (manual)

```bash
# 1. Build web
npm run build

# 2. Sync con Capacitor
npx cap sync android

# 3. Build APK
cd android
gradlew.bat app:assembleRelease

# 4. APK generado en:
# android/app/build/outputs/apk/release/app-release.apk
```

### Firmar APK para Play Store

```bash
# Generar keystore (solo primera vez)
keytool -genkey -v -keystore scorekinole.keystore -alias scorekinole -keyalg RSA -keysize 2048 -validity 10000

# Firmar APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore scorekinole.keystore app-release.apk scorekinole

# Alinear APK
zipalign -v 4 app-release.apk ScoreCroki-release-signed.apk
```

**IMPORTANTE**: Guarda el keystore en lugar seguro. Sin él no podrás hacer updates en Play Store.

---

## 🔧 Comandos Útiles

### Desarrollo
```bash
npm run dev          # Servidor desarrollo (puerto 5173)
npm run preview      # Preview build local (puerto 4173)
npm run build        # Build para producción
```

### Capacitor
```bash
npm run sync                    # Sync web → native
npx cap open android           # Abrir Android Studio
npx cap run android            # Run en dispositivo/emulador
```

### Firebase
```bash
firebase deploy --only hosting           # Deploy web
firebase deploy --only firestore:rules   # Deploy reglas Firestore
firebase deploy                          # Deploy todo
```

### Testing APK
```bash
# Instalar APK en dispositivo conectado
adb install -r ScoreCroki-vX.Y.Z.apk

# Ver logs en tiempo real
adb logcat | findstr "Chromium"
```

---

## 📋 Checklist Pre-Deploy

### Web (Firebase Hosting)
- [ ] Actualizar versión en `package.json`, `www/version.json`, `README.md`, `src/js/constants.js`
- [ ] `npm run build`
- [ ] `npm run preview` - verificar que funciona
- [ ] `firebase deploy --only hosting`
- [ ] Verificar en https://scorekinole.web.app

### Android APK
- [ ] Actualizar versión en todos los archivos
- [ ] Actualizar `versionCode` y `versionName` en `android/app/build.gradle`
- [ ] `npm run build:apk`
- [ ] Probar APK en dispositivo físico
- [ ] Si es para Play Store, firmar APK

---

## ⚠️ Troubleshooting

### Build falla
```bash
# Limpiar todo y rebuild
rm -rf www/ node_modules/
npm install
npm run build
```

### Capacitor no sincroniza
```bash
npx cap sync android --force
```

### APK no instala
```bash
# Desinstalar versión anterior
adb uninstall com.scorekinole.app

# Reinstalar
adb install ScoreCroki-vX.Y.Z.apk
```

### Firebase deploy falla
```bash
# Re-login
firebase login

# Verificar proyecto
firebase projects:list
firebase use scorekinole
```

---

## 🔐 Configuración Firebase

Si Firebase está deshabilitado y quieres activarlo:

1. Crear `.env` con:
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

2. Activar servicios en Firebase Console:
   - Authentication → Google Sign-in
   - Firestore Database → Crear base de datos
   - Hosting → Configurar dominio

3. Deploy reglas de seguridad:
```bash
firebase deploy --only firestore:rules
```

---

**🎯 Tip**: Usa `npm run build:apk` para generar APK completo con un solo comando.
