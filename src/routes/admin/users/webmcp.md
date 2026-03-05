---
route: "/admin/users"
title: "User Management (SuperAdmin)"
description: "Gestion de usuarios registrados. Lista paginada con busqueda, edicion de permisos, merge de guests, y eliminacion."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Pagina de administracion de usuarios de Firestore.
> Solo accesible para SuperAdmin (usa `SuperAdminGuard`).
> Usa paginacion con scroll-to-load.

## Estructura y Componentes Principales
- **Header**: Boton atras, titulo, theme toggle.
- **Search**: Busqueda por nombre de usuario.
- **Users Table**: Tabla con columnas:
  - Nombre / playerName
  - Email
  - Torneos creados (con cuota)
  - Venues (si es owner)
  - Permisos (admin, superadmin, canImportTournaments)
  - Acciones (editar, eliminar)
- **UserEditModal**: Modal para editar:
  - Nombre, playerName
  - Permisos: isAdmin, isSuperAdmin, canImportTournaments
  - Tournament quota
- **Delete Confirmation Modal**: Con preview del usuario.
- **Merge Guest**: Combinar perfil guest con usuario registrado.
- **Remove from Tournament**: Quitar usuario de collaborators de torneo.

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `users` | `UserProfile[]` | Lista de usuarios cargados |
| `searchQuery` | `string` | Texto de busqueda |
| `loading` | `boolean` | Estado de carga |
| `editingUser` | `UserProfile \| null` | Usuario en edicion |
| `deletingUser` | `UserProfile \| null` | Usuario a eliminar |

## Firebase
- `loadUsers(cursor?)` - Carga paginada de usuarios
- `deleteUser(userId)` - Eliminacion de usuario
- `editUser(userId, updates)` - Edicion de perfil y permisos
- `handleMerge(guestId, registeredId)` - Merge guest → registered
- `handleRemoveFromTournament(userId, tournamentId)` - Quitar de collaborators

## Notas Importantes
- Los permisos `canImportTournaments` controlan acceso a `/admin/tournaments/import`.
- El merge de guests reasigna participaciones de torneo al usuario registrado.
- La cuota de torneos (`tournamentQuota`) limita cuantos torneos LIVE puede crear un admin.
