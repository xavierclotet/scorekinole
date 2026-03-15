# Merge universal de usuarios

**Fecha**: 2026-03-15
**Contexto**: En torneos de dobles, un mismo jugador puede tener dos perfiles (ej. un guest persistente por dispositivo + otro guest o registered). El merge actual (`mergeGuestToRegistered`) solo permite Guest→Registered y no actualiza los documentos de torneo. Se necesita un merge universal que funcione con cualquier combinación y actualice todas las referencias.

## Flujo de usuario

1. En `/admin/users`, cualquier usuario (excepto los ya mergeados) tiene botón 🔗
2. Al pulsar se abre un modal con:
   - **Origen**: nombre, tipo (guest/registered), nº torneos, puntos ranking
   - **Buscador de destino**: campo de búsqueda por nombre/email/ID, filtra todos los usuarios excepto el origen y los ya mergeados (`mergedTo`)
   - **Preview del destino** seleccionado con los mismos datos
   - Botón "Fusionar" con confirmación
3. Al confirmar se ejecuta `mergeUsers(sourceUserId, targetUserId)`

## Función `mergeUsers(sourceUserId, targetUserId)`

**Ubicación**: `src/lib/firebase/admin.ts`

**Sin restricción de tipo**: Guest→Guest, Guest→Registered, Registered→Registered, Registered→Guest.

### Validaciones
- Ambos usuarios existen
- No son el mismo userId
- El origen no tiene `mergedTo` (ya fue mergeado)

### Pasos

1. **Leer ambos perfiles** de `/users`
2. **Fusionar `tournaments[]`**: copiar los del origen al destino, deduplicando por `tournamentId` (si ambos tienen el mismo torneo, mantener el del destino)
3. **Actualizar documentos de torneo**: query todos los torneos, buscar en `participants[]` donde `participant.userId === sourceId` o `participant.partner?.userId === sourceId`, reemplazar por `targetId`. Incluir también `photoURL` y `type` del destino si aplica.
4. **Actualizar perfil destino**: añadir tournaments fusionados, añadir sourceId a `mergedFrom[]`
5. **Marcar perfil origen**: setear `mergedTo: targetUserId`

### Consideraciones
- Los torneos pueden tener el sourceId tanto en `participant.userId` como en `participant.partner.userId` — hay que revisar ambos campos
- La query de torneos no puede filtrar por campos dentro de arrays en Firestore. Se deben consultar todos los torneos y filtrar client-side, o mantener un approach iterativo por los `tournamentId` del perfil del usuario origen.
- El usuario origen NO se borra — queda como audit trail con `mergedTo`

## Cambios en UI (`/admin/users`)

- Reemplazar el merge actual (botón 🔗 solo para guests, dropdown de registered users) por el merge universal
- El botón 🔗 aparece en todos los usuarios excepto los que ya tienen `mergedTo`
- El modal de selección de destino usa un input de búsqueda que filtra `allUsersCache` (excluye origen y mergeados)
- Mostrar resumen antes de confirmar: "Se moverán N torneos de {origen} a {destino} y se actualizarán M torneos"

## Qué NO cambia

- La página `/rankings` ya filtra usuarios con `mergedTo` — los mergeados no aparecen
- No se borra ningún usuario
- El cálculo de ranking sigue siendo el mismo (se recalcula desde `tournaments[]`)

## Optimización de queries de torneos

En vez de hacer query de TODOS los torneos, usar los `tournamentId` del array `tournaments[]` del usuario origen para buscar solo los documentos relevantes. Esto es más eficiente.
