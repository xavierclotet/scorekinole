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
- **Menú principal (`AppMenu` + `DropdownMenu`)**: Menú desplegable en la esquina **superior izquierda** (icono "Scorekinole"). Contiene:
  - **Nueva partida** (icono Play, `Ctrl+M`): Resetea puntuaciones e inicia una nueva partida amistosa.
  - **Partido de torneo** (icono Trophy, `Ctrl+J`): Si hay 1 solo partido pendiente → abre `MatchPreviewDialog`. Si hay 0 o 2+ → abre `TournamentMatchModal`.
  - **Escanear QR** (icono QrCode, `Ctrl+Q`): Abre el escáner QR para unirse a torneos o partidas amistosas.
  - **Configuración** (icono Settings, `Ctrl+,`): Abre `SettingsModal`.
- **Badge de partida amistosa**: Junto al menú, muestra el modo actual (singles/doubles), formato de juego y matchesToWin.

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
| **Configuraciones / Settings** | Menú Scorekinole → Configuración (`Ctrl+,`) | Abre `SettingsModal` (`showSettings = true`) |
| **Cambiar Modo ("Points" o "Rounds")** | Desde `SettingsModal` | Cambia las condiciones de victoria de la partida. |
| **Nueva Partida** | Menú Scorekinole → Nueva partida (`Ctrl+M`) | Resetea puntuaciones (`resetTeams()`) e historial. |
| **Cargar/Ir a Torneo** | Menú Scorekinole → Partido de torneo (`Ctrl+J`) | Si hay 1 solo partido pendiente → abre `MatchPreviewDialog`. Si hay 0 o 2+ → abre `TournamentMatchModal`. |
| **Escanear QR** | Menú Scorekinole → Escanear QR (`Ctrl+Q`) | Abre escáner QR para detectar keys de torneo o códigos de invitación amistosa. |
| **Preview de Partido** | `MatchPreviewDialog` (`showMatchPreview`) | Muestra vista previa del partido auto-detectado: fase (grupos/final), grupo y ronda o nombre de ronda bracket, mesa, jugadores con avatares, config. Botón "Jugar" (o "Reanudar" si IN_PROGRESS) inicia el partido. "Cancelar" cierra sin acción. Botón deshabilitado si no hay mesa asignada. Si el partido tiene `scoringBy` (otro usuario controlándolo), muestra aviso amber con el nombre del scorer. |

## 🔗 Deep-link desde Push Notifications
- Las notificaciones push de torneo abren `/game?key=XXXXXX`.
- Un `$effect` detecta el parámetro `key`, lo persiste en `gameSettings` (localStorage), y **espera a que Firebase Auth inicialice** (`$authInitialized`) antes de llamar `handleJoinTournament()`.
- Esto asegura que `$currentUser` esté disponible para tomar el camino optimizado (auto-start del match).

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
| `pendingFriendlyMatch` | Backup de partido friendly completado offline. Se reintenta en `onReconnect` y `onMount`. Se borra tras sync exitoso. |
| `pendingTournamentCompletion` | Backup de completion de partido de torneo fallida offline. Mismo mecanismo de retry. |
