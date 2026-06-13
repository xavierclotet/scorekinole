---
route: "/admin/matches"
title: "Match Management (SuperAdmin)"
description: "Gestion de partidos cloud. Lista paginada con filtros (ano, tipo, jugador), edicion y eliminacion de partidos."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Pagina de administracion de partidos guardados en Firestore.
> Solo accesible para SuperAdmin (usa `SuperAdminGuard`).
> Usa infinite scroll con paginacion server-side.

## Estructura y Componentes Principales
- **Header**: Boton atras, titulo "Matches", badge con conteo total.
- **Filter Tabs**: All | Singles | Doubles
- **Year Filter**: `<select>` que acota la query en servidor a un ano natural (por defecto el ano actual) + opcion "Todos los anos".
- **Player Filter**: Combobox con busqueda (Popover + Command). Al abrirlo carga el set completo del ano para listar todos los jugadores. Reemplaza al antiguo buscador de texto libre.
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
| `matches` | `Match[]` | Pagina actual de partidos (paginacion server-side) |
| `allMatchesCache` | `Match[] \| null` | Set completo del ano, cargado al abrir el combobox de jugador; cuando existe, la tabla filtra/cuenta sobre el y se desactiva la paginacion |
| `filterType` | `'all' \| 'singles' \| 'doubles'` | Filtro por tipo de juego |
| `selectedYear` | `number \| 'all'` | Ano que acota la query en servidor (default: ano actual) |
| `playerFilter` | `string` | Id (userId o nombre) del jugador filtrado; '' = todos |
| `playerComboOpen` | `boolean` | Estado del combobox de jugador |
| `loading` / `loadingMore` | `boolean` | Estado de carga |
| `hasMore` | `boolean` | Si hay mas paginas disponibles |

## Firebase
- `getMatchesPaginated(pageSize, cursor, year?)` - Carga paginada de partidos (acotada al ano si se pasa)
- `fetchAllMatches(year?)` - Set completo (acotado al ano) para el combobox de jugador y filtrado completo
- `getEarliestMatchYear()` - Ano del partido mas antiguo (construye las opciones del filtro de ano)
- `adminDeleteMatch(matchId)` - Eliminacion de partido
- `updateMatch(matchId, updates)` - Edicion de partido

## Notas Importantes
- `/admin` es client-only (`ssr = false`): la pagina no se renderiza en servidor (F5 sirve el shell SPA).
- El filtro de ano acota la query en servidor, por eso por defecto no carga toda la coleccion historica.
- Responsive: columnas ocultas en mobile/pantallas pequenas.
- Badge de conteo por tipo (All/Singles/Doubles) se actualiza al filtrar.
- La tabla muestra datos de torneo asociado si el partido pertenece a uno.
