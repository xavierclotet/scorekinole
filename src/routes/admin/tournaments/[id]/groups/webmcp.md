---
route: "/admin/tournaments/[id]/groups"
title: "Group Stage Management (Admin)"
description: "Vista de gestion de la fase de grupos: partidos round-robin/Swiss, resultados, standings y descalificaciones."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Gestiona la fase de grupos del torneo.
> USA SUSCRIPCION EN TIEMPO REAL (`subscribeTournament`).
> Valida que el torneo este en estado `GROUP_STAGE` (redirige si no).
> Soporta tanto Round Robin como sistema Swiss.

## Estructura y Componentes Principales
- **Header**: Nombre del torneo, badge de estado, theme toggle.
- **TimeProgressBar**: Barra de progreso temporal clicable.
- **Botones de accion**:
  - Swiss: "Generar Siguiente Ronda"
  - Todos: Desglose de tiempo
- **GroupsView**: Componente principal que renderiza todos los grupos:
  - Nombre del grupo (traducido: SINGLE_GROUP, GROUP_A, Swiss Round N)
  - Tabla de standings (posicion, nombre, W, L, puntos, GD, flag clasificado)
  - Calendario/Pairings por ronda
  - Tarjetas de partido: nombres, puntuacion, status, click para editar
- **MatchResultDialog**: Modal para introducir resultados.
- **Modal de descalificacion**: Confirmacion DSQ.
- **Swiss config**: Editor de numero total de rondas Swiss.

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `tournament` | `Tournament \| null` | Torneo con actualizaciones en tiempo real |
| `selectedMatch` | `GroupMatch \| null` | Partido seleccionado para editar |
| `activeGroupId` | `string \| null` | Grupo activo (para context) |
| `isSwissTournament` | derivado | `groupStage.type === 'SWISS'` |
| `currentSwissRound` | derivado | Ronda Swiss actual |
| `unsubscribe` | `() => void` | Cleanup del listener onSnapshot |

## Acciones Clave
| Accion | Funcion | Resultado |
| :--- | :--- | :--- |
| **Click en partido** | `handleMatchClick()` | Abre MatchResultDialog (skip si BYE) |
| **Guardar resultado** | `handleSaveResult()` | `completeMatch()` con winner basado en gameMode |
| **Walkover** | markNoShow (desde dialog) | WO automatico |
| **Generar ronda Swiss** | `handleGenerateNextRound()` | `generateSwissPairings()` |
| **Editar rondas Swiss** | `saveSwissRounds()` | `updateTournament()` con nuevo totalRounds |
| **Descalificar** | `handleDisqualify()` | `disqualifyParticipant()` |
| **Recalcular standings** | `handleRecalculateStandings()` | Recalcula clasificaciones |

## Firebase
- `subscribeTournament(tournamentId, callback)` - **Tiempo real** (onSnapshot)
- `completeMatch(tournamentId, matchId, 'GROUP', groupId, result)` - Resultado de partido (transaccional via `updateMatchResult`)
- `generateSwissPairings(tournamentId, roundNumber)` - Emparejamientos Swiss
- `updateTournament(tournamentId, updates)` - Config Swiss rounds (transaccional)
- `disqualifyParticipant(tournamentId, participantId)` - DSQ
- `recalculateStandings(tournamentId)` - Recalculo standings

## Suscripciones Tiempo Real
- `subscribeTournament()` en `onMount` con `onDestroy` cleanup.
- Sincroniza `selectedMatch` cuando el partido abierto en el dialog se actualiza en Firebase.

## Notas Importantes
- El componente `GroupsView` es reutilizable y recibe el torneo como prop.
- Los partidos BYE se detectan y se saltan automaticamente.
- La determinacion del ganador depende de `gameMode`: por puntos (mayor puntuacion) o por rondas (mas partidas ganadas).
