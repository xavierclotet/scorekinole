---
route: "/admin/tournaments/[id]/finalize"
title: "Finalize GROUP_ONLY Tournament (Admin)"
description: "Pagina de finalizacion para torneos GROUP_ONLY. Permite reordenar prioridad de desempates, recalcular standings y completar el torneo."
---

## Contexto de Agente (WebMCP)
> **ATENCION IA / AGENTE**: Pagina para finalizar torneos con `phaseType: 'GROUP_ONLY'`.
> Solo accesible cuando `tournament.status === 'TRANSITION'` y `phaseType === 'GROUP_ONLY'`.
> Redirige si el torneo no cumple estas condiciones.
> No usa suscripciones en tiempo real (fetch unico + recalculo).

## Estructura y Componentes Principales
- **Header**: Boton atras, titulo, nombre del torneo.
- **Descripcion**: Texto explicando el proceso de finalizacion.
- **Tiebreaker Priorities Card**: Lista reordenable de criterios de desempate.
  - Botones arriba/abajo para reordenar
  - Criterios: h2h, total20s, totalPoints, buchholz
  - Boton "Recalcular" para aplicar nuevo orden
  - Criterios filtrados segun config (qualificationMode, show20s)
- **Unresolved Ties Warning**: Banner si hay empates sin resolver.
- **Group Standings**: Tablas de clasificacion por grupo.
  - Posicion, nombre, puntos, 20s, Buchholz
  - Indicadores de empates (tiedWith)
- **Match Review**: Seccion colapsable por grupo.
  - Filtro de jugador
  - Schedule con rondas expandibles
- **Boton "Finalizar Torneo"**: Sticky en la parte inferior.
- **Modal de Confirmacion**: Warning sobre empates sin resolver.

## Estados Clave
| Variable | Tipo | Descripcion |
| :--- | :--- | :--- |
| `tournament` | `Tournament \| null` | Torneo cargado |
| `tiebreakerPriority` | `TiebreakerCriterion[]` | Orden actual de criterios de desempate |
| `unresolvedTies` | `boolean` | Si hay empates sin resolver |
| `isRecalculating` | `boolean` | Recalculo en progreso |
| `isFinalizing` | `boolean` | Finalizacion en progreso |
| `showConfirmModal` | `boolean` | Modal de confirmacion visible |

## Acciones Clave
| Accion | Funcion | Resultado |
| :--- | :--- | :--- |
| **Reordenar tiebreaker** | Botones arriba/abajo | Cambia `tiebreakerPriority` |
| **Recalcular standings** | `handleRecalculate()` | `recalculateStandings()` con nuevo orden de desempate |
| **Finalizar torneo** | `handleFinalize()` | `transitionTournament(id, 'COMPLETED')` → `completeGroupOnlyTournament()` |
| **Filtrar partidos** | Dropdown jugador | Filtra schedule por participante |

## Firebase
- `getTournament(tournamentId)` - Fetch unico al montar
- `recalculateStandings(tournamentId, groupId)` - Recalculo con nuevo tiebreaker
- `updateTournamentPublic(tournamentId, updates)` - Guardar tiebreakerPriority
- `transitionTournament(tournamentId, 'COMPLETED')` - Llama `completeGroupOnlyTournament()` internamente

## Flujo de Estado
```
TRANSITION (GROUP_ONLY) → Recalcular standings → Resolver empates → Finalizar → COMPLETED
```

## Notas Importantes
- Solo para `phaseType: 'GROUP_ONLY'` — torneos con fase final usan `/bracket` y `/transition`.
- `completeGroupOnlyTournament()` calcula posiciones finales desde group standings.
- `calculateFinalPositionsForTournament()` asigna `finalPosition` a cada participante.
- El orden de `tiebreakerPriority` afecta directamente las posiciones finales.
- Los empates sin resolver generan warning pero no bloquean la finalizacion.
