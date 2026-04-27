# Funciones avanzadas del admin durante el torneo

Guía para administradores **sin conocimientos técnicos**. Explica las funciones especiales que tienes a tu disposición durante un torneo en directo: forzar el fin de un partido, dar por no presentado a un jugador, descalificar a alguien, y controlar quién está anotando los puntos.

> 💡 Estas funciones se usan **mientras el torneo está en curso** (en fase de grupos o en cuadro final). Para ver cómo crear el torneo, consulta [GUIA_ADMIN_TORNEOS.md](./GUIA_ADMIN_TORNEOS.md).

---

## Resumen rápido

| Acción | Cuándo se usa | Efecto |
|--------|--------------|--------|
| **Fin por tiempo** | Se acaba el tiempo del partido y queremos cerrarlo con el resultado actual. | El partido se da por terminado con quien va ganando en ese momento. |
| **Walkover (WO)** | Un jugador no se presenta a **un partido concreto**. | Ese partido se marca como WALKOVER, gana el rival. |
| **Descalificación (DSQ)** | Un jugador queda fuera **de todo el torneo** (no se presenta a varios, mal comportamiento, etc.). | Todos sus partidos pendientes se marcan como WO automáticamente. |
| **Tomar control de un partido** | Un jugador ya está anotando un partido y otra persona quiere relevarlo. | La app avisa antes de "robar" el control para evitar pisarse. |

---

## 1. Fin por tiempo

¿Para qué sirve? Para **cerrar un partido cuando se acaba el tiempo asignado** y no se ha llegado al final natural (al objetivo de puntos, o no se han jugado todas las rondas previstas). El partido se cierra con el resultado parcial del momento.

### Cómo se usa

1. Entra al torneo en `/admin/tournaments/[id]/bracket` (o el panel de admin del torneo).
2. Pulsa sobre el partido que quieres cerrar. Se abre el diálogo de resultado del partido.
3. Si hay un **ganador parcial** (uno va por delante en marcador) y aún no se podría guardar como completado normal, aparecerá el botón **"Fin por tiempo"**.
4. Pulsa **"Fin por tiempo"**: el partido se guarda dando por ganador a quien iba ganando en ese instante.

### Qué pasa al jugador

Si alguno de los jugadores tenía el partido abierto en su móvil/tablet, la app **detecta automáticamente** que el admin lo ha cerrado y le muestra un aviso: *"El admin ha cerrado este partido"*. El jugador pulsa **"Entendido"** y la app sale del modo torneo.

> ⚠️ **Cuidado**: solo se puede usar "Fin por tiempo" si hay un **ganador parcial claro** (alguien por delante). Si están empatados al cero, este botón no aparece — usa Walkover si alguno de los dos no quiere/puede continuar.

---

## 2. Walkover (WO) — No presentado a un partido

¿Para qué sirve? Cuando un jugador **no aparece a uno de sus partidos** (pero sigue en el torneo, jugará los siguientes con normalidad).

### Cómo se usa

1. Localiza el partido al que el jugador no se ha presentado.
2. Marca al jugador ausente como **"No presentado"** (la app llama a esta acción `markNoShow` por dentro).
3. El partido pasa al estado **WALKOVER**, con el rival como ganador automático.

### Qué se ve en pantalla

- Una insignia **naranja "WO"** en el partido afectado.
- El nombre del jugador no presentado aparece **tachado**.
- El rival recibe la victoria con el marcador estándar de WO (8-0 puntos, 0-0 20s).

### Cuándo NO usar WO

- Si el jugador **abandona todo el torneo**, no marques uno a uno sus partidos como WO. Usa **Descalificación (DSQ)** y la app marca todos sus partidos pendientes de golpe.

---

## 3. Descalificación (DSQ) — Fuera del torneo entero

¿Para qué sirve? Cuando un jugador **queda eliminado del torneo entero**, ya sea por decisión deportiva (mal comportamiento, doping, etc.), por abandono voluntario o porque no se va a presentar a ningún partido más.

### Cómo se usa

1. Ve al panel del torneo y encuentra al participante.
2. Pulsa la opción para **descalificarlo** (la app llama a esto `disqualifyParticipant` por dentro).
3. La app, en una sola operación atómica:
   - Cambia el estado del participante a **DISQUALIFIED**.
   - **Marca todos sus partidos pendientes como WALKOVER** (en grupos y en cuadro final).
   - Avanza a sus rivales en el cuadro como si hubieran ganado por WO.

### Qué se ve en pantalla

- Insignia **roja "DSQ"** en el participante.
- Su nombre aparece **tachado** en clasificaciones y cuadros.
- Sus partidos pendientes muestran el badge "WO" automáticamente.

### Auto-corrección al cargar el cuadro

Cuando se abre la página del cuadro final del torneo, la app ejecuta dos auto-correcciones:

1. **`fixDisqualifiedMatches()`** — Resuelve cualquier partido pendiente que quedara contra un jugador descalificado. Esto cubre casos en los que una descalificación se hizo antes y se quedaron partidos colgando sin resolver.
2. **`reassignTables()`** — Reasigna las mesas a los partidos que sí pueden jugarse, para que no haya mesas asignadas a partidos imposibles (ej.: dos descalificados enfrentados).

### En la página de transición (entre fase de grupos y cuadro final)

Cuando termina la fase de grupos y se genera el cuadro final, los participantes **descalificados quedan excluidos** automáticamente de la distribución de cuadro Oro / Plata. En la pantalla de resultados de cada ronda verás los badges DSQ y WO claramente.

---

## 4. ¿Quién está anotando un partido? (Control en vivo)

¿Para qué sirve? Para evitar que **dos personas anoten el mismo partido a la vez** y se pisen los datos.

### Cómo funciona

Cuando un usuario abre o reanuda un partido del torneo desde su móvil, la app guarda **quién está controlando el partido** en el campo `scoringBy`:

```
scoringBy: { userId, userName }
```

Esto se guarda **cada vez** que alguien arranca o reanuda el partido (no solo la primera vez).

### Qué pasa si otro usuario intenta abrir el mismo partido

- En el **diálogo de previsualización del partido** (`MatchPreviewDialog`): aparece un **aviso ámbar** que dice *"{nombre} está controlando este partido"*. El segundo usuario lo verá antes de entrar.
- En el **modal del partido del torneo** (`TournamentMatchModal`): se muestra una **confirmación** preguntando *"¿Estás seguro de que quieres tomar el control?"* antes de proceder.
- Si el segundo usuario confirma, **toma el control** del partido y el campo `scoringBy` se actualiza a su nombre.

### Importante

- **No hay heartbeat ni limpieza automática**. Si el primer usuario simplemente cierra la app sin haber finalizado, su nombre seguirá apareciendo como "controlando" el partido. Por eso es **solo informativo**, no es un bloqueo real.
- El segundo usuario **siempre puede tomar el control** si confirma. La app solo avisa.

### Recomendación práctica

Antes de empezar el torneo, recuerda a los jugadores:

> 📢 **"Solo uno de los dos jugadores debe abrir y anotar el partido. Si veis un aviso de que ya hay alguien controlándolo, no lo abráis vosotros también."**

Así evitas conflictos entre el jugador y, por ejemplo, un acompañante que estaba mirando el resultado en su móvil y termina apretando "Iniciar partido" sin querer.

---

## Resolución de problemas frecuentes

| Problema | Cómo solucionarlo |
|----------|------------------|
| "Un partido se quedó colgado en estado IN_PROGRESS y nadie lo está jugando" | Abre el partido como admin desde el panel y usa **Fin por tiempo** (si hay ganador parcial) o márcalo manualmente. |
| "Un jugador no se ha presentado a un solo partido" | Usa **Walkover** sobre ese partido. El resto del torneo lo sigue jugando normal. |
| "Un jugador se ha ido y no juega más" | **Descalifica al participante**. Todos sus partidos pendientes se marcan como WO automáticamente. |
| "Descalifiqué a un jugador y el cuadro tiene partidos imposibles" | Recarga la página del cuadro: la auto-corrección (`fixDisqualifiedMatches`) los resuelve. Si persisten, abre cada partido y ciérralo manualmente. |
| "Dos personas estaban anotando el mismo partido y los marcadores no cuadran" | El último que confirmó es quien quedó como `scoringBy`. Revisa el resultado guardado en el panel de admin y corrígelo si hace falta. |
| "El partido tiene asignada una mesa pero los jugadores ya no están ahí" | Llamar a `reassignTables()` se hace solo al cargar la página del cuadro. Si no se aplica, recarga la página o resuelve los partidos pendientes primero. |

---

## Documentación relacionada

- [GUIA_ADMIN_TORNEOS.md](./GUIA_ADMIN_TORNEOS.md) — Cómo crear y configurar un torneo paso a paso
- [DESEMPATES.md](./DESEMPATES.md) — Cómo se resuelven los empates en la clasificación
- [TOURNAMENT_ADMIN.md](../en/TOURNAMENT_ADMIN.md) — Versión técnica en inglés
- [TOURNAMENT_REGISTRATION.md](../en/TOURNAMENT_REGISTRATION.md) — Sistema de inscripciones

## Implementación técnica

Si te interesa el código que hay detrás de cada función:

| Función | Archivo | Qué hace |
|---------|---------|---------|
| `markNoShow()` | [`src/lib/firebase/tournamentSync.ts`](../../src/lib/firebase/tournamentSync.ts) · [`tournamentGroups.ts`](../../src/lib/firebase/tournamentGroups.ts) · [`tournamentMatches.ts`](../../src/lib/firebase/tournamentMatches.ts) | Marca un partido concreto como WO. |
| `disqualifyParticipant()` | [`src/lib/firebase/tournamentParticipants.ts`](../../src/lib/firebase/tournamentParticipants.ts) | Descalifica al participante y resuelve todos sus partidos pendientes (transacción atómica). |
| `fixDisqualifiedMatches()` | [`src/lib/firebase/tournamentParticipants.ts`](../../src/lib/firebase/tournamentParticipants.ts) | Auto-corrección al cargar el cuadro: resuelve partidos pendientes vs DSQ. |
| `reassignTables()` | [`src/lib/firebase/tournamentBracket.ts`](../../src/lib/firebase/tournamentBracket.ts) | Reasigna mesas libres a partidos jugables. |
| `subscribeToMatchStatus()` | [`src/lib/firebase/tournamentSync.ts`](../../src/lib/firebase/tournamentSync.ts) | Suscripción en tiempo real al estado del partido (cliente). |
| `startTournamentMatch()` | [`src/lib/firebase/tournamentMatches.ts`](../../src/lib/firebase/tournamentMatches.ts) | Escribe `scoringBy` cada vez que alguien abre o reanuda el partido. |
