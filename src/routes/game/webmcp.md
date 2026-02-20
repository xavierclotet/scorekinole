---
route: "/game"
title: "Game & Scoring Interface"
description: "Interfaz principal de puntuación de partidas, gestión de rondas, 20s y temporizador."
---

## 🎯 Contexto de Agente (WebMCP)
> **ATENCIÓN IA / AGENTE**: Documento clave de la lógica principal. 
> La vista `/game` gestiona tanto "Partidos Amistosos" (Friendly Matches) como "Partidos de Torneo" (Tournament Matches).

## 🧭 Estructura y Componentes Principales
- **Teams (`TeamCard.svelte`)**: Hay dos de estos componentes. Renderizan tanto las tarjetas de puntuación como los nombres de los jugadores.
- **Temporizador (`Timer.svelte`)**: Situado en el centro de la página por defecto. Es "draggable" (se puede arrastrar) y guarda su posición (X e Y) en `localStorage` bajo `crokinoleGame` (`timerX` y `timerY`).
- **Rounds Panel (`RoundsPanel.svelte`)**: Muestra el historial de las rondas jugadas en la partida actual.
- **Botones Flotantes (`.floating-button`)**:
  - `.new-match-button`: Menú/Botón de nueva partida (abajo a la izquierda).
  - `.tournament-button`: Menú/Botón de torneo (abajo a la derecha).

## 🖥️ Estados y Contexto (UI Modes)
1. **Modo Amistoso** (`$gameTournamentContext == null`):
   - Flujo libre: Cualquier persona puede ajustar nombres y puntos.
   - Si los usuarios están registrados, la partida se guarda pasivamente en Firebase al completarse.
2. **Modo Torneo** (`$gameTournamentContext != null`):
   - Bloqueado: Los nombres vienen de la configuración del torneo (`getTournamentByKey`).
   - Las puntuaciones y los cierres de partido sincronizan *en vivo* con `tournamentContext` y Firebase vía `$lib/firebase/tournamentSync.ts`.
   - Aparecen badges especiales de avatares `player-avatars-stack`.

## 🖱️ Acciones Clave (Selectors / Lógica)
| Acción | UI Selector / Función | Resultado |
| :--- | :--- | :--- |
| **Añadir Puntos** | Swipe / Click en el `[data-webmcp="score-display"]` de `TeamCard` | Suma un punto al equipo correspondiente. |
| **Añadir 20s (Ventes)** | Click en `[data-webmcp="twenty-btn"]` | Registra ventas; espera a finalizar la ronda para cerrar puntuación de mesa. |
| **Configuraciones / Settings** | `[data-webmcp="settings-btn"]` | Abre `SettingsModal` (`showSettings = true`) |
| **Cambiar Modo ("Points" o "Rounds")** | Desde `SettingsModal` | Cambia las condiciones de victoria de la partida. |
| **Nueva Partida** | `[data-webmcp="btn-new-match"]` o `.new-match-button` | Resetea puntuaciones (`resetTeams()`) e historial. |
| **Cargar/Ir a Torneo** | `[data-webmcp="btn-tournament"]` o `.tournament-button` | Abre modal de selección/escaneo de torneo (`TournamentMatchModal`). |

## 🛠️ Notas de Implementación (Svelte 5)
- Toda la página depende fuertemente de los stores (`$team1`, `$team2`, `$gameSettings`, `$matchState`).
- Cuando se finaliza un set/punto de partido completo `isMatchComplete == true` y se guarda en base de datos.
- Las animaciones y modales usan `svelte/transition` e interactúan con `<dialog>` integrados o componentes como `Popover`.

## 💾 Local Storage (Estado Persistente)
| Ubicación / Key | Uso en la Aplicación |
| :--- | :--- |
| `crokinoleGame` | Objeto principal. Guarda preferencias (idioma configurado, theme oscuro/claro), posición X/Y arrastrable del timer (`timerX`, `timerY`) y el `tournamentKey` activo (si lo hay). |
| `crokinoleTournamentContext` | Cache/persistencia en crudo de la partida de torneo activa actual. (Permite recargar la página `/game` sin perder la partida de torneo). |
| `crokinolePreTournamentBackup` | Guarda temporalmente los datos / estado de un partido "Amistoso" que quedó a medias si el árbitro decide entrar en Modo Torneo repentinamente. |
