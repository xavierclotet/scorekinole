---
route: "/admin/tournaments/[id]/transition"
title: "Transition / Qualifier Selection (Admin)"
description: "Seleccion de clasificados de fase de grupos a bracket, resolucion de empates y configuracion de fase final."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Pagina de transicion entre fase de grupos y fase final.
> Permite seleccionar clasificados, resolver empates y configurar el bracket.
> Valida que el torneo este en estado `TRANSITION` (redirige si no).
> No usa suscripciones en tiempo real (fetch unico + recalculo).

## Estructura y Componentes Principales
- **Header**: Nombre, badge status, barra de progreso temporal.
- **Avisos de empates**: Warnings por grupo si hay empates sin resolver.
- **QualifierSelection**: Componente por grupo para seleccionar clasificados.
  - Tabla de standings con checkboxes
  - Indicador de empates
- **Configuracion de fase final**: Secciones por fase:
  - Early Rounds: gameMode, pointsToWin/roundsToPlay
  - Semifinales: gameMode, points/rounds, matchesToWin
  - Final: gameMode, points/rounds, matchesToWin
  - (Si SPLIT_DIVISIONS: configuracion Silver separada)
- **Vista SPLIT_DIVISIONS**: Listas Gold/Silver con cross-seeding preview.
- **Selector Top N por grupo**: Cuantos clasificados por grupo.
- **Validacion de tamano del bracket**: Mensajes de error si no es potencia de 2.
- **Mensajes de consolacion**: Si consolation es util o innecesaria para el tamano.
- **Boton "Generar Bracket"**: Habilitado cuando `canProceed` es true.

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `tournament` | `Tournament \| null` | Torneo cargado |
| `groupQualifiers` | `Map<number, string[]>` | Clasificados por grupo |
| `groupTiesStatus` | `Map<number, boolean>` | Empates sin resolver por grupo |
| `goldParticipants` / `silverParticipants` | `string[]` | Listas para SPLIT_DIVISIONS |
| `topNPerGroup` | `number` | Clasificados por grupo |
| `canProceed` | derivado | Empates resueltos + tamano bracket valido |
| `isSplitDivisions` | derivado | `finalStage.mode === 'SPLIT_DIVISIONS'` |
| Config por fase | varios | gameMode, points, rounds, matchesToWin (gold + silver) |

## Acciones Clave
| Accion | Funcion | Resultado |
| :--- | :--- | :--- |
| **Seleccionar clasificados** | `handleQualifierUpdate()` | Actualiza `groupQualifiers` map |
| **Resolver empate** | (en QualifierSelection) | Marca grupo como sin empates |
| **Recalcular standings** | `handleRecalculateStandings()` | `recalculateStandings()` + reload |
| **Generar bracket** | `handleGenerateBracket()` | `generateBracket()` o `generateSplitBrackets()` + transicion a FINAL_STAGE |
| **Cambiar Top N** | Input topNPerGroup | Recalcula distribucion automaticamente |

## Firebase
- `getTournament(tournamentId)` - Fetch unico al montar
- `recalculateStandings(tournamentId)` - Auto-llamado al cargar
- `updateQualifiers(tournamentId, groupIndex, qualifiedIds)` - Pre-generacion
- `generateBracket(tournamentId, config, consolation, thirdPlace)` - Bracket unico
- `generateSplitBrackets(tournamentId, splitConfig)` - Brackets gold/silver
- `updateTournament(tournamentId, { status: 'FINAL_STAGE' })` - Transicion (transaccional)
- `updateTournamentPublic()` - Guardar standings actualizados

## Suscripciones Tiempo Real
Ninguna - fetch unico al montar con recalculo automatico de standings.

## Notas Importantes
- Cross-seeding: En SPLIT_DIVISIONS, los participantes se distribuyen inteligentemente entre gold y silver para evitar que jugadores del mismo grupo se enfrenten inmediatamente.
- Validacion de bracket: Solo permite tamanos potencia de 2 (4, 8, 16, 32).
- `calculateSuggestedQualifiers()` propone cuantos clasificar basado en numGroups y participantes.
- La generacion de bracket incluye configuracion per-phase (early/semi/final) que se almacena en `bracket.config`.
