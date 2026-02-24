---
route: "/admin/tournaments/[id]"
title: "Tournament Detail (Admin)"
description: "Vista general del torneo: configuracion, participantes, estado y acciones de gestion."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Dashboard principal de un torneo individual.
> Muestra info general, configuracion y acciones segun el estado del torneo.
> No usa suscripciones en tiempo real (fetch unico al montar).

## Estructura y Componentes Principales
- **Header**: Nombre del torneo, badges (status, imported, test, participantes), tournament key.
- **Botones de accion**: Dependen del estado:
  - `DRAFT`: Iniciar, Editar, Cancelar
  - `GROUP_STAGE`: Ver Grupos, Editar
  - `TRANSITION`: Seleccionar Clasificados, Editar
  - `FINAL_STAGE`: Ver Bracket, Editar
  - `COMPLETED`: Editar, CompletedTournamentView
- **Dashboard grid**: Tarjetas de configuracion (General, Participantes, Fase de Grupos, Fase Final).
- **Quick Edit modal**: Edicion rapida de campos del torneo.
- **TimeProgressBar**: Barra de progreso temporal (fases activas).
- **Modales**: Confirmacion inicio/cancelacion, reglas, admins, desglose tiempo.

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `tournament` | `Tournament \| null` | Torneo cargado |
| `showQuickEdit` | `boolean` | Modal de edicion rapida |
| `showStartConfirm` | `boolean` | Confirmacion de inicio |
| `showCancelConfirm` | `boolean` | Confirmacion de cancelacion |
| `editName`, `editDate`, `editNumTables`, ... | varios | Campos del formulario quick edit |

## Acciones Clave
| Accion | Funcion | Resultado |
| :--- | :--- | :--- |
| **Iniciar torneo** | `startTournament()` | `transitionTournament()` a GROUP_STAGE o FINAL_STAGE |
| **Cancelar torneo** | `cancelTournament()` | Marca como CANCELLED |
| **Quick edit** | `saveQuickEdit()` | `updateTournament()` con campos editados |
| **Ver grupos** | Navegacion | `/admin/tournaments/[id]/groups` |
| **Ver bracket** | Navegacion | `/admin/tournaments/[id]/bracket` |
| **Recalcular tiempo** | `recalculateTime()` | Estimacion de duracion total |

## Firebase
- `getTournament(tournamentId)` - Fetch unico al montar
- `updateTournament(tournamentId, updates)` - Guardar cambios (transaccional)
- `cancelTournament(tournamentId)` - Cancelar torneo
- `transitionTournament(tournamentId, nextStatus)` - Maquina de estados

## Suscripciones Tiempo Real
Ninguna - fetch unico al montar.
