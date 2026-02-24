---
route: "/admin/tournaments"
title: "Tournament List (Admin)"
description: "Dashboard de administracion de torneos con paginacion, filtros y acciones CRUD."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Lista paginada de torneos con filtros y acciones admin.
> Protegida por `<AdminGuard>`. No usa suscripciones en tiempo real.

## Estructura y Componentes Principales
- **AdminGuard**: Wrapper de autorizacion (redirige si no es admin).
- **Tabla de torneos**: Listado paginado con scroll infinito (`loadMore()`).
- **Filtros**: 3 grupos de tabs (Status, Type, Test) + buscador + filtro por creador (superadmin).
- **Botones de accion**: Crear (`/admin/tournaments/create`), Importar (`/admin/tournaments/import`).
- **Toast**: Notificaciones de feedback.

## Estados y Contexto
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `tournaments` | `Tournament[]` | Lista cargada desde Firebase (paginada) |
| `filteredTournaments` | `Tournament[]` | Resultado del filtrado cliente |
| `searchQuery` | `string` | Texto de busqueda |
| `statusFilter` | `'all' \| 'UPCOMING' \| 'COMPLETED'` | Filtro por estado |
| `importedFilter` | `'all' \| 'imported' \| 'live'` | Filtro por tipo |
| `testFilter` | `'all' \| 'real' \| 'test'` | Filtro test/real |
| `loading` / `loadingMore` | `boolean` | Estado de carga |

## Acciones Clave
| Accion | Funcion | Resultado |
| :--- | :--- | :--- |
| **Cargar mas** | `loadMore()` | Scroll infinito, paginacion Firebase |
| **Filtrar** | `filterTournaments()` | Filtrado cliente sobre `tournaments` |
| **Eliminar torneo** | `deleteTournament(id)` | Modal de confirmacion + Firebase delete |
| **Duplicar torneo** | `duplicateTournament(id)` | Redirige a `/create?duplicate=id` |
| **Transformar torneo** | `transformTournament(id)` | Convierte importado a live |

## Firebase
- `getTournamentsPaginated(pageSize, lastDoc)` - Query paginada (no real-time)
- `deleteTournament(tournamentId)` - Eliminacion
- localStorage: `scorekinole_admin_prefs` (persistencia de filtros)

## Suscripciones Tiempo Real
Ninguna - usa queries puntuales con paginacion.
