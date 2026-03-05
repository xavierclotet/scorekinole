---
route: "/admin"
title: "Admin Dashboard"
description: "Panel principal de administracion. Grid de secciones con acceso basado en permisos."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Dashboard principal de admin con tarjetas de navegacion.
> Usa `AdminGuard` para acceso basico. Secciones de SuperAdmin filtradas por `isSuperAdminUser`.
> No carga datos — solo navegacion a sub-secciones.

## Estructura y Componentes Principales
- **Navbar**: Boton atras (home), theme toggle.
- **Header**: Saludo con nombre de usuario, titulo "Admin Panel".
- **Section Cards Grid** (5 tarjetas):
  1. **User Management** → `/admin/users` (SuperAdmin only)
  2. **Tournament Management** → `/admin/tournaments`
  3. **Match Management** → `/admin/matches` (SuperAdmin only)
  4. **Analytics** → `/admin/analytics` (SuperAdmin only)
  5. **Backup/Restore** → `/admin/tools/backup` (SuperAdmin only)
- Cada tarjeta: icono Lucide, titulo, descripcion, chevron.

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `$isSuperAdminUser` | `boolean` | Controla visibilidad de secciones SuperAdmin |
| `$currentUser` | `User \| null` | Usuario actual para saludo |

## Iconos
- `Users`, `Trophy`, `Swords`, `BarChart3`, `HardDrive` (Lucide)
- `ChevronLeft`, `ChevronRight` para navegacion

## Notas Importantes
- Responsive: 1 columna en mobile, 2 columnas en desktop.
- Solo Tournament Management es accesible para admins normales; el resto requiere SuperAdmin.
- Las tarjetas tienen hover effects y transiciones suaves.
