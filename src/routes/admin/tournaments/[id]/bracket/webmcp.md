---
route: "/admin/tournaments/[id]/bracket"
title: "Bracket Management (Admin)"
description: "Vista de gestion del bracket (fase final): partidos, resultados, mesas, consolacion y descalificaciones."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Pagina mas compleja del admin (~4700 lineas).
> Gestiona brackets gold/silver, consolation, asignacion de mesas y descalificaciones.
> USA SUSCRIPCION EN TIEMPO REAL (`subscribeTournament`).
> Valida que el torneo este en estado `FINAL_STAGE` (redirige si no).

## Estructura y Componentes Principales
- **Tabs Gold/Silver**: Solo visible en modo `SPLIT_DIVISIONS`.
- **TimeProgressBar**: Barra de progreso temporal clicable.
- **Configuracion por fase**: Secciones expandibles para Early Rounds, Semifinales, Final.
  - Cada fase: gameMode (points/rounds), valor, matchesToWin.
- **Gestion de mesas**: Contador de mesas, editar, reasignar.
- **Rondas del bracket**: Grid de partidos por ronda.
  - Tarjeta de partido: seed, nombres, badge status, puntuacion, click para editar.
- **Partido por 3er puesto**: Seccion separada.
- **Brackets de consolacion**: Agrupados por fuente (QF, R16), labels de posicion (5-6, 7-8...).
- **MatchResultDialog**: Modal para introducir resultados.
- **Modal de descalificacion**: Confirmacion DSQ con nombre.

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `tournament` | `Tournament \| null` | Torneo con actualizaciones en tiempo real |
| `selectedMatch` | `BracketMatch \| null` | Partido seleccionado para editar resultado |
| `selectedBracketType` | `'gold' \| 'silver'` | Bracket activo |
| `activeTab` | `'gold' \| 'silver'` | Tab visible |
| `consolationBrackets` | derivado | Brackets de consolacion del tab activo |
| `unsubscribe` | `() => void` | Cleanup del listener onSnapshot |

## Acciones Clave
| Accion | Funcion | Resultado |
| :--- | :--- | :--- |
| **Click en partido** | `handleMatchClick()` | Abre MatchResultDialog |
| **Guardar resultado** | `handleSaveMatch()` | `updateBracketMatch` + `advanceWinner` (transaccional) |
| **Walkover** | `markNoShow()` | Marca WO y avanza ganador (transaccional) |
| **Editar mesas** | `saveNumTablesAndReassign()` | Cambia numTables y redistribuye |
| **Reasignar mesas** | `handleReassignTables()` | `reassignTables()` |
| **Descalificar** | `disqualifyParticipant()` | Marca DSQ + auto-fix partidos |
| **Guardar config fase** | `savePhaseConfig()` | Actualiza `bracket.config` por fase |
| **Completar torneo** | `completeFinalStage()` | Marca COMPLETED (transaccional) |

## Firebase
- `subscribeTournament(tournamentId, callback)` - **Tiempo real** (onSnapshot)
- `updateBracketMatch()` / `updateSilverBracketMatch()` / `updateConsolationMatch()` - Transaccional
- `advanceWinner()` / `advanceSilverWinner()` / `advanceConsolationWinner()` - Transaccional
- `completeBracketMatchAndAdvance()` - Transaccion unica update+advance
- `reassignTables()` - Redistribucion de mesas
- `disqualifyParticipant()` / `fixDisqualifiedMatches()` - Gestion DSQ
- `completeFinalStage()` - Marca COMPLETED (transaccional, dispara Cloud Function)
- `updateTournament()` - Config de fases (transaccional)

## Suscripciones Tiempo Real
- `subscribeTournament()` en `onMount` con `onDestroy` cleanup.
- Sincroniza `selectedMatch` cuando Firebase actualiza para reflejar cambios en dialog abierto.

## Notas Importantes
- Auto-fix de partidos DSQ al cargar (`fixDisqualifiedMatches`).
- Auto-reasignacion de mesas al cargar si hay partidos sin mesa.
- La funcion `isRoundLocked()` previene edicion de rondas con partidos iniciados.
