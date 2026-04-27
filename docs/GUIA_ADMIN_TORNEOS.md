# Guía para Admins: Crear un Torneo (Modo LIVE)

Guía paso a paso para administradores **sin conocimientos técnicos**. Te explica cómo crear un torneo en directo (LIVE), qué significa cada opción y para qué sirven los botones especiales como **Duplicar torneo** y **Autorellenar partidos**.

> ¿Qué es un torneo "LIVE"? Es un torneo que **gestionas en tiempo real desde la app**: vas registrando resultados, la app empareja jugadores, calcula la clasificación y gestiona el cuadro final automáticamente. Es lo opuesto a un torneo "importado" (donde solo subes resultados ya jugados).

---

## Antes de empezar: conceptos básicos

Antes de tocar nada, conviene entender **3 conceptos clave** que aparecerán en el formulario:

### 1. Sistema de juego: Round Robin vs. Suizo

Son las dos formas de organizar la **fase de grupos**. La diferencia es importante:

| Sistema | Cómo funciona | Cuándo usarlo |
|---------|---------------|---------------|
| **Round Robin** (Liguilla) | Todos juegan contra todos dentro de su grupo. Si hay 6 jugadores, cada uno juega 5 partidos. | Grupos pequeños (≤8 jugadores). Es lo más justo: todo el mundo se enfrenta a todo el mundo. |
| **Suizo** | Cada ronda empareja a los jugadores con **puntuación parecida** (los que ganan se enfrentan a otros que ganan). NO juegan todos contra todos. | Grupos grandes (15-50+ jugadores) donde hacer Round Robin sería eterno. Tú decides cuántas rondas se juegan (típico: 5-7). |

**Regla rápida**:
- ¿Pocos jugadores? → **Round Robin**
- ¿Muchos jugadores? → **Suizo**

### 2. Estructura de fases (Phase Type)

| Tipo | Qué incluye | Ejemplo |
|------|-------------|---------|
| **TWO_PHASE** (recomendado) | Fase de grupos **+** cuadro final eliminatorio | Mundial de fútbol: primero grupos, luego octavos/cuartos/etc. |
| **GROUP_ONLY** | Solo fase de grupos, sin eliminatorias | Una liga corta donde gana el primero del grupo. |
| **ONE_PHASE** | Solo eliminatorias directas, sin fase de grupos | Tipo Wimbledon: pierdes y fuera. |

**Si dudas, elige TWO_PHASE.** Es lo más habitual.

### 3. Modo de puntuación: Puntos vs. Rondas

| Modo | Cómo termina un partido |
|------|-------------------------|
| **Por puntos** | El primero en llegar a X puntos (5, 7, 9 u 11) gana el partido. |
| **Por rondas** | Se juegan exactamente N rondas (4, 6 u 8) y gana quien tenga más puntos al final. |

**Modo "Mejor de" (Best of)**: dentro de un partido, puedes pedir varios juegos. *Best of 3* = el primero que gana 2 juegos se lleva el partido.

---

## Crear un torneo paso a paso

Ve a **Admin → Torneos → Nuevo torneo**. El formulario tiene **6 pasos**. Te los explico uno a uno.

### Paso 1 — Información básica

Es el "DNI" del torneo. Aquí pones quién, cuándo y dónde.

![Paso 1: Información básica del torneo](./img/admin-step1-info-basica.png)

| Campo | Qué poner | ¿Obligatorio? |
|-------|-----------|---------------|
| **Clave del torneo** | Se genera automáticamente (6 caracteres). No la cambies salvo que sepas lo que haces. | Sí |
| **Nombre** | El que verá la gente. Ej: "Open de Crokinole de Barcelona". | Sí |
| **Edición** | Si es la 3ª edición, pon "3". | No |
| **Descripción** | Texto libre. Puedes ponerlo en español, catalán o inglés. | No |
| **Ubicación** | País, ciudad, dirección, sede. | No |
| **Fecha y hora** | Cuándo se juega. | No |
| **Tipo de juego** | **Singles** (1 vs 1) o **Dobles** (2 vs 2). | Sí |
| **Torneo de prueba** | ✅ Marca esta casilla si solo quieres probar. **Los torneos de prueba NO suman puntos al ranking general.** | — |

**Sección de inscripciones (opcional)**: si quieres que la gente se apunte sola desde la app, activa "Permitir inscripciones" y configura:
- Fecha límite de inscripción
- Máximo de participantes
- Cuota (texto libre: "Gratis", "10€", etc.)
- Lista de espera (si se llena el cupo)
- Si la lista de inscritos es pública o no

---

### Paso 2 — Formato del torneo

Aquí defines **cómo se juega**. Es el paso más importante.

![Paso 2: Formato del torneo (mesas, fases, sistema)](./img/admin-step2-formato.png)

#### A) Mesas
- **Número de mesas**: cuántas mesas físicas tienes disponibles. La app reparte los partidos automáticamente entre ellas. Si tienes 4 mesas, pon 4.

#### B) Estructura de fases
Elige una de las tres opciones (**TWO_PHASE** suele ser la mejor).

#### C) Configuración de la fase de grupos *(si aplica)*

- **Sistema**: Round Robin o Suizo (ver explicación arriba).
- **Si elegiste Round Robin**: indica cuántos grupos quieres (1-8). Ej: 24 jugadores en 4 grupos = 6 jugadores por grupo.
- **Si elegiste Suizo**: indica cuántas rondas. **Mínimo 3, recomendado 5-7.**
- **Modo de puntuación**: por puntos o por rondas.
- **Mejor de (Best of)**: cuántos juegos por partido (Best of 1, 2, 3...).
- **Modo de clasificación**:
  - **Por victorias** (tradicional): 2 puntos por ganar, 1 por empatar, 0 por perder.
  - **Por puntos totales**: suma todos los puntos anotados durante la fase.

![Paso 2C: Configuración de la fase de grupos (RR / Suizo)](./img/admin-step2c-fase-grupos.png)

#### D) Configuración del cuadro final *(si elegiste TWO_PHASE)*

- **Modo de divisiones**:
  - **Cuadro único**: todos los clasificados van al mismo bracket.
  - **Oro y Plata**: los mejores van al cuadro Oro, los siguientes al cuadro Plata.
- **Cuadro de consolación**: cuadro paralelo para los eliminados en primera ronda. Activa si quieres dar más partidos a los que pierden pronto.
- **Partido por el 3er puesto**: activado por defecto.
- **Configuración por fase del cuadro** (rondas iniciales, semifinales, final): puedes poner reglas distintas. Ejemplo: rondas iniciales al mejor de 1, final al mejor de 3.
- **Mínimo de clasificados**: cuántos pasan de la fase de grupos al cuadro (por defecto 8).

![Paso 2D: Configuración del cuadro final (Oro/Plata, consolación, 3er puesto)](./img/admin-step2d-cuadro-final.png)

#### E) Opciones generales
- **Contar 20s**: si marcas, se cuentan los 20s en cada ronda (relevante para desempates).
- **Mostrar hammer**: indica quién tiene el último tiro.
- **Quién empieza con el hammer**: por sorteo y rotación, o alternando.

---

### Paso 3 — Añadir participantes

Aquí metes a los jugadores. Tres formas:

![Paso 3: Añadir participantes](./img/admin-step3-participantes.png)

1. **Añadir manualmente**: escribes el nombre y listo.
2. **Buscar jugadores existentes**: si el jugador ya tiene cuenta, lo encuentras por nombre/email.
3. **Importar desde lista**: pegas una lista de nombres.

**Mínimo: 2 participantes** para poder seguir.

> ⚠️ Si el torneo es de **dobles**, cada "participante" es una pareja. Tendrás que indicar los dos miembros y opcionalmente un nombre de equipo.

---

### Paso 4 — Ranking *(opcional)*

¿Quieres que este torneo dé puntos al ranking general?
- **Si NO**: deja desactivado.
- **Si SÍ**: elige el nivel del torneo:
  - **SERIES_15**: torneo pequeño, da pocos puntos.
  - **SERIES_25**: torneo mediano.
  - **SERIES_35**: torneo grande/oficial, da más puntos.

La app reparte los puntos automáticamente según la posición final y el número de jugadores.

---

### Paso 5 — Tiempos *(opcional pero útil)*

Sirve para **estimar la duración** del torneo y mostrársela a los jugadores.

- **Minutos por cada 4 rondas** (singles vs. dobles): cuánto tarda un bloque de 4 rondas.
- **Promedio de rondas** según el modo de puntos (5pts, 7pts, 9pts, 11pts).
- **Pausa entre partidos**: minutos de descanso entre partidos.
- **Pausa entre fases**: descanso entre la fase de grupos y el cuadro final.
- **Semifinales/finales en paralelo**: si las juegas a la vez en distintas mesas o una detrás de otra.

Si no rellenas nada, la app usa valores por defecto razonables.

---

### Paso 6 — Revisión y crear

Última pantalla. Te muestra **un resumen de todo** lo que has configurado y la duración estimada. Revisa con calma:

![Paso 6: Pantalla de revisión final con resumen del torneo](./img/admin-step6-revision.png)

- ¿Nombre y fecha correctos?
- ¿Sistema (Round Robin/Suizo) correcto?
- ¿Número de grupos / rondas suizas correcto?
- ¿Participantes todos añadidos?

Cuando todo esté bien → pulsa **Crear torneo**.

> El torneo se crea en estado **DRAFT** (borrador). Aún NO ha empezado. Para arrancarlo de verdad debes pulsar **"Iniciar torneo"** desde la pantalla del torneo.

---

## Ciclo de vida del torneo

Una vez creado, el torneo pasa por estos estados:

```
DRAFT (borrador)
   ↓ [Pulsas "Iniciar torneo"]
GROUP_STAGE (fase de grupos)
   ↓ [Cuando todos los grupos terminan]
TRANSITION (transición — se genera el cuadro)
   ↓ [Pulsas "Finalizar bracket"]
FINAL_STAGE (cuadro eliminatorio)
   ↓ [Cuando se juegan todas las eliminatorias]
COMPLETED (terminado)
```

---

## Botones especiales para admins

### 🔁 Duplicar torneo

**Para qué sirve**: copiar **toda la configuración** de un torneo existente para crear uno nuevo, sin tener que rellenar los 6 pasos otra vez. Ideal para:
- Probar configuraciones sin tocar el torneo original.
- Crear ediciones recurrentes (ej: "Open de Junio" → duplicar → "Open de Julio").

**Cómo se usa**:
1. Ve a **Admin → Torneos** (lista de torneos).
2. Localiza el torneo que quieres copiar.
3. Pulsa el botón **Duplicar** (icono de duplicar) en su fila.
4. Te lleva directamente al **Paso 6** del formulario, con **toda la configuración rellenada**.

![Botón Duplicar en la lista de torneos](./img/admin-boton-duplicar.png)

**Qué se copia**:
- ✅ Nombre, formato, sistema (RR/Suizo), número de grupos/rondas, mesas, modos de puntuación, configuración del cuadro, ranking, tiempos…

**Qué NO se copia**:
- ❌ Lista de participantes (la nueva edición tendrá otros jugadores).
- ❌ Clave del torneo (se genera una nueva).

Puedes editar lo que quieras antes de pulsar **Crear torneo**.

> 💡 **Truco para testear**: marca **"Torneo de prueba"** en el torneo duplicado. Así puedes hacer pruebas sin que afecte al ranking.

---

### ⚡ Autorellenar partidos (Auto-fill)

**Para qué sirve**: rellenar **automáticamente los resultados de partidos pendientes con resultados aleatorios válidos**. Es una herramienta de **testing**, NO se usa en torneos reales.

**Cuándo usarlo**:
- Quieres ver cómo queda el cuadro final antes de jugar (para enseñarlo a alguien o probar la app).
- Estás haciendo pruebas de la app.
- Has duplicado un torneo de prueba y quieres simular su desarrollo entero en segundos.

**⚠️ Solo disponible para SuperAdmin.** No aparece para admins normales.

**Cómo se usa**:
1. Entra en un torneo en curso (estado GROUP_STAGE o FINAL_STAGE).
2. En la vista de grupos o de cuadro, busca el botón **Autorellenar partidos**.
3. Te aparece un modal con tres opciones:
   - **Solo la ronda actual**: rellena solo los partidos de la ronda en curso.
   - **Todas las rondas**: rellena absolutamente todos los partidos pendientes.
   - **Cancelar**.
4. La app genera resultados aleatorios respetando las reglas del torneo (modo de puntos, mejor de N, etc.).

![Modal de Autorellenar partidos con las 3 opciones](./img/admin-autorellenar-modal.png)

> ⚠️ **No uses esto en torneos reales**. Los resultados son aleatorios y se guardan como si fueran reales. Si lo haces sin querer, tendrás que corregir cada partido manualmente.

---

## Errores frecuentes y consejos

| Problema | Solución |
|----------|----------|
| "He creado el torneo pero no pasa nada cuando me apuntan" | El torneo está en DRAFT. Hasta que pulses **Iniciar torneo**, no empieza. |
| "Tengo 30 jugadores y Round Robin tarda muchísimo" | Cambia a **Suizo** con 5-7 rondas. |
| "Quiero probar el cuadro final sin esperar a que terminen los grupos" | Crea un torneo duplicado marcado como "torneo de prueba" y usa **Autorellenar partidos**. |
| "Me equivoqué en el formato y ya hay partidos jugados" | No se puede cambiar el formato una vez iniciado. Crea un torneo nuevo (puedes duplicar este). |
| "No quiero que cuente para el ranking" | Marca **"Torneo de prueba"** en el Paso 1. |
| "Los inscritos no pueden anotarse" | Revisa que en el Paso 1 hayas activado las inscripciones y la fecha límite no haya pasado. |

---

## Resumen rápido (cheat sheet)

```
1. Admin → Torneos → Nuevo torneo
2. Paso 1: nombre, fecha, singles/dobles, ¿de prueba?
3. Paso 2: mesas, TWO_PHASE, Round Robin (pocos) o Suizo (muchos)
4. Paso 3: añadir jugadores
5. Paso 4: ¿cuenta para ranking? (opcional)
6. Paso 5: tiempos (opcional)
7. Paso 6: revisar → Crear → ¡Iniciar torneo!
```

**Botones útiles**:
- 🔁 **Duplicar**: clonar config de otro torneo
- ⚡ **Autorellenar**: rellenar partidos al azar (solo testing, solo SuperAdmin)
- 🧪 **Torneo de prueba**: para no ensuciar el ranking

---

## Documentación relacionada (para profundizar)

- `docs/TOURNAMENT_DATA_STRUCTURE.md` — Estructura técnica de torneos
- `docs/TOURNAMENT_ADMIN.md` — Funciones avanzadas (WO, DSQ, fin por tiempo)
- `docs/TOURNAMENT_REGISTRATION.md` — Sistema de inscripciones
- `docs/DOUBLES_TOURNAMENTS.md` — Particularidades de torneos de dobles
- `docs/SCORING_TERMINOLOGY.md` — Terminología (Round/Game/Match)
- `docs/TIEBREAKER.md` — Cómo se resuelven empates
- `docs/RANKING_SYSTEM.md` — Cómo funciona el sistema de puntos
