# Pantallazos de la documentación

Carpeta para imágenes referenciadas desde los docs de `docs/`.

## Convención de nombres

- **Guía de admin** (`GUIA_ADMIN_TORNEOS.md`): prefijo `admin-`
- **Guía del jugador** (futura): prefijo `player-`

## Pantallazos pendientes — Guía de admin

Captura estos pantallazos y guárdalos aquí con el nombre exacto. Ya están referenciados en `docs/es/GUIA_ADMIN_TORNEOS.md`, así que en cuanto pegues el archivo se verán automáticamente.

| Archivo | Qué capturar |
|---------|--------------|
| `admin-step1-info-basica.png` | Paso 1 del wizard: nombre, fecha, singles/dobles, sección de inscripciones. |
| `admin-step2-formato.png` | Paso 2 completo (vista general): mesas, fases, sistema. |
| `admin-step2c-fase-grupos.png` | Detalle del bloque de fase de grupos: selector RR/Suizo, nº grupos o nº rondas, modo de puntuación, best of, modo de clasificación. |
| `admin-step2d-cuadro-final.png` | Detalle del bloque de cuadro final: divisiones (Oro/Plata), consolación, 3er puesto, mínimo de clasificados. |
| `admin-step3-participantes.png` | Paso 3: lista de participantes con las 3 formas de añadir (manual / buscar / importar). |
| `admin-step6-revision.png` | Paso 6: pantalla de resumen final con todos los datos del torneo + botón "Crear torneo". |
| `admin-boton-duplicar.png` | Lista de torneos en `/admin/tournaments` mostrando el botón Duplicar (con tooltip si es posible). |
| `admin-autorellenar-modal.png` | Modal de Autorellenar partidos con las 3 opciones (solo ronda actual / todas / cancelar). |

## Pantallazos pendientes — Gestionar torneo

Referenciados en `docs/es/GESTIONAR_TORNEO.md`.

| Archivo | Qué capturar |
|---------|--------------|
| `admin-grupos-vista-general.png` | Vista de `/admin/tournaments/[id]/groups`: tabla de grupos con jugadores y partidas. |
| `admin-grupos-modal-resultado.png` | Modal "Resultado del partido" con campos de ganador, juegos, puntos y 20s. |
| `admin-suizo-config.png` | Panel "⚙️ Configuración de rondas Suizas" con ronda actual y botón "Generar siguiente ronda". |
| `admin-transicion-clasificados.png` | Página de Transición: clasificación de cada grupo con los checkboxes de selección de clasificados. |
| `admin-transicion-config-fases.png` | Configuración de las fases del cuadro (rondas iniciales, semifinales, final) con Best of. |
| `admin-bracket-vista.png` | Vista general del cuadro final: árbol con rondas y jugadores. |
| `admin-bracket-modal-resultado.png` | Modal de resultado en cuadro final (puede mostrar marcador acumulado en Best of 3). |
| `admin-bracket-mesas.png` | Panel de asignación de mesas en la parte superior del cuadro. |
| `admin-finalizar.png` | Página `/admin/tournaments/[id]/finalize` (solo torneos GROUP_ONLY). |

## Formato recomendado

- **PNG** (mejor calidad para texto/UI).
- Anchura ~1200-1600px (que se vea nítido en pantallas grandes).
- Si capturas en móvil, recórtalo a la zona relevante para que no quede demasiado estrecho dentro del doc.
