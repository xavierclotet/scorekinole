---
route: "/admin/analytics"
title: "Analytics Dashboard (SuperAdmin)"
description: "Dashboard de analiticas con graficos de visitas, dispositivos, plataformas y top paginas/usuarios."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Dashboard de analiticas de uso de la aplicacion.
> Solo accesible para SuperAdmin (usa `SuperAdminGuard`).
> Usa Chart.js para graficos. Datos de `pageViews` y `pageViewStats` de Firestore.

## Estructura y Componentes Principales
- **Header**: Boton atras, titulo, theme toggle.
- **Filter Row**:
  - Period tabs: Today | 7d | 30d
  - Route filter dropdown (filtrar por pagina)
- **Stats Cards** (4 tarjetas):
  - Visitas hoy
  - Visitas semana
  - Visitas mes
  - Sesiones unicas
- **Charts Grid** (5 graficos Chart.js):
  - Visitas en el tiempo (line chart)
  - Top paginas (horizontal bar chart)
  - Top usuarios (horizontal bar chart)
  - Dispositivos (doughnut chart)
  - Plataformas (doughnut chart)
- **Data Table**: Tabla de page views con columnas:
  - Path, usuario, dispositivo, plataforma, navegador, fecha/hora
- **Infinite Scroll**: Carga progresiva de registros.

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `pageViews` | `PageView[]` | Registros de visitas |
| `dailyStats` | `DailyStat[]` | Estadisticas diarias agregadas |
| `periodFilter` | `'today' \| '7d' \| '30d'` | Periodo seleccionado |
| `routeFilter` | `string` | Filtro por ruta/pagina |
| `todayViews` / `weekViews` / `monthViews` | derivado | Conteos por periodo |
| `uniqueSessionsCount` | derivado | Sesiones unicas |

## Firebase
- `getPageViews(filters, cursor)` - Page views paginados
- `getDailyStats(period)` - Estadisticas diarias agregadas

## Notas Importantes
- Los graficos se inicializan con `Chart.js` y se actualizan reactivamente.
- Responsive: graficos y tabla se adaptan a mobile.
- Las estadisticas diarias estan pre-agregadas en la coleccion `pageViewStats`.
