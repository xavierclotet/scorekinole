---
route: "/admin/matches"
title: "Match Management (SuperAdmin)"
description: "Gestion de partidos cloud. Lista paginada con filtros, busqueda, edicion y eliminacion de partidos."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Pagina de administracion de partidos guardados en Firestore.
> Solo accesible para SuperAdmin (usa `SuperAdminGuard`).
> Usa infinite scroll con paginacion server-side.

## Estructura y Componentes Principales
- **Header**: Boton atras, titulo "Matches", badge con conteo total.
- **Filter Tabs**: All | Singles | Doubles
- **Player Filter**: Dropdown para filtrar por jugador.
- **Search Box**: Busqueda por texto libre en datos del partido.
- **Matches Table**: Tabla con columnas:
  - Players (puntos de color + icono corona para ganador)
  - Resultado (score)
  - Evento (titulo torneo + fase)
  - Game type (singles/doubles)
  - Game mode
  - Fecha y hora
  - Duracion
  - Acciones (boton eliminar)
- **Delete Confirmation Modal**: Preview del partido antes de eliminar.
- **Edit Modal**: Para editar datos del partido.
- **Infinite Scroll**: Carga progresiva (15 items por pagina).
- **Estados vacios**: Loading, error, sin resultados.

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `matches` | `Match[]` | Lista de partidos cargados |
| `filterType` | `'all' \| 'singles' \| 'doubles'` | Filtro por tipo de juego |
| `searchQuery` | `string` | Texto de busqueda |
| `selectedPlayer` | `string \| null` | Jugador seleccionado en filtro |
| `loading` / `loadingMore` | `boolean` | Estado de carga |
| `hasMore` | `boolean` | Si hay mas paginas disponibles |

## Firebase
- `getMatchesPaginated(filters, cursor)` - Carga paginada de partidos
- `deleteMatch(matchId)` - Eliminacion de partido
- `updateMatch(matchId, updates)` - Edicion de partido

## Notas Importantes
- Responsive: columnas ocultas en mobile/pantallas pequenas.
- Badge de conteo por tipo (All/Singles/Doubles) se actualiza al filtrar.
- La tabla muestra datos de torneo asociado si el partido pertenece a uno.
