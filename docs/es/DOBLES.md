# Torneos de dobles

Guía para administradores que organizan **torneos de dobles** (parejas, 2 vs 2). Pensada para gente sin conocimientos técnicos, con todo lo que necesitas saber sobre cómo funcionan las parejas en la app.

> 💡 Si vas a crear el torneo desde cero, primero lee [GUIA_ADMIN_TORNEOS.md](./GUIA_ADMIN_TORNEOS.md). En el **Paso 1** elige *"Tipo de juego: Dobles"* y la app activará automáticamente todo lo que se explica aquí.

---

## ¿Qué cambia en un torneo de dobles?

En vez de **jugadores individuales**, los participantes son **parejas**. Cada pareja tiene:

- **Jugador 1** (con su nombre real).
- **Jugador 2** (con su nombre real, lo llamamos *partner* o compañero).
- **Nombre del equipo** (opcional, ej: *"Los Invencibles"*).

Por dentro, la app **siempre guarda los dos nombres reales por separado**. El nombre del equipo es solo decorativo, para que se vea más bonito en pantallas y rankings.

---

## ¿Por qué se guardan los nombres reales por separado?

Aunque elijan un nombre de equipo, la app **siempre** apunta los dos nombres reales. Tres razones:

1. **El ranking es individual**: cuando una pareja queda 1ª en un torneo, **cada uno de los dos jugadores recibe los puntos por separado** en su perfil personal. La pareja no tiene "ranking propio".
2. **Cada jugador tiene su perfil**: María y Carlos pueden jugar este torneo juntos, y el siguiente cada uno con otra persona. La app debe poder identificarlos.
3. **El nombre de equipo es opcional**: muchos torneos no usan nombres de equipo, así que la app necesita un *plan B* (mostrar los dos nombres reales).

---

## Cómo se muestra el nombre de la pareja

Depende de si han elegido un nombre de equipo o no:

| Situación | Nombre del equipo | Cómo aparece en pantalla |
|-----------|------------------|--------------------------|
| Sin nombre de equipo | *(vacío)* | **María / Carlos** |
| Con nombre de equipo | *"Los Tigres"* | **Los Tigres** |

> En todos los listados, brackets, clasificaciones, etc., la app aplica esta misma regla automáticamente. No hace falta hacer nada especial.

---

## Cómo añadir parejas (Paso 3 al crear el torneo)

Cuando el torneo es de dobles, en el **Paso 3** del wizard de creación verás un componente especial llamado **PairSelector** ("Seleccionar pareja"). El flujo es muy simple:

1. **Elegir Jugador 1** — busca a un jugador registrado o añade un invitado nuevo.
2. **Elegir Jugador 2** — igual: registrado o invitado.
3. **Nombre del equipo** *(opcional)* — déjalo vacío si la pareja no tiene nombre. Si está vacío, se mostrará automáticamente como *"Jugador1 / Jugador2"*.
4. **Pulsar "Añadir pareja"**.

Repite el proceso para cada pareja del torneo.

> ⚠️ **Importante**: aunque la pareja tenga nombre de equipo, **debes meter siempre los dos nombres reales**. El nombre de equipo NO sustituye los nombres reales, los acompaña.

---

## ¿Qué pasa con el ranking en dobles?

Cuando termina el torneo, la app reparte los puntos de ranking según la posición final. En dobles funciona así:

- **Los dos jugadores reciben los mismos puntos**. Si una pareja queda 3ª y a esa posición le tocan 25 puntos, **María suma 25 y Carlos suma 25**.
- Cada jugador acumula el torneo en su historial personal (campo `tournaments[]` del perfil).
- **Los nombres de equipo NO se usan para nada del ranking**. Solo cuentan los nombres reales.

### Doble seguridad: ranking aplicado dos veces

Para que ningún jugador pierda sus puntos por un error técnico, la app aplica el ranking **dos veces** (de forma idempotente, no se duplican):

1. **Desde el cliente** — cuando el cuadro final marca el torneo como completado, la app del admin actualiza el ranking inmediatamente.
2. **Desde el servidor (Cloud Function)** — Firebase detecta el cambio de estado del torneo a *"completado"* y vuelve a calcular el ranking como **respaldo** por si el cliente falló.

El usuario no nota nada — los puntos aparecen una sola vez, sin duplicarse.

---

## Sincronización de nombres de invitados

Si durante el torneo **renombras a un invitado** (por ejemplo, tenías "Joan" como invitado y luego le cambias el nombre a "Joan García"), cuando termine el torneo el sistema **sincroniza automáticamente** ese nombre actualizado en su perfil de la base de datos `/users`.

Esto cubre tanto al **jugador principal** como al **partner** en parejas de dobles. Solo afecta a invitados que no se hayan fusionado con una cuenta real (es decir, que sigan siendo cuentas de invitado).

> 💡 Esto te ahorra tener que ir uno a uno corrigiendo nombres después del torneo.

---

## Diferencias clave con torneos individuales

| Aspecto | Singles (individuales) | Dobles |
|---------|----------------------|--------|
| Por participante | 1 jugador | 2 jugadores (pareja) |
| Nombre mostrado | Nombre del jugador | Nombre de equipo o *"P1 / P2"* |
| Ranking | Va al jugador | Va a **cada uno** de los 2 jugadores |
| Nombre de equipo | No existe | Opcional, solo decorativo |
| Inscripción | 1 persona | 2 personas + nombre de equipo opcional |

---

## Limpieza: detectar parejas mal creadas

A veces, por errores antiguos o malas inscripciones, pueden aparecer **usuarios mal formados** en la base de datos. Por ejemplo:

- Usuarios cuyo nombre contiene `" / "` (formato antiguo de pareja, ya no se usa).
- Cuentas de invitado sin email que parecen nombres de equipo.

Como admin tienes una herramienta llamada **"Posibles parejas"** (en la sección de gestión de usuarios admin → buscador) que **filtra estos casos sospechosos** para que puedas revisarlos uno a uno y limpiarlos si hace falta.

---

## Preguntas frecuentes

| Pregunta | Respuesta |
|----------|-----------|
| ¿Puedo cambiar el nombre del equipo a mitad de torneo? | Sí. El nombre de equipo es solo decorativo, puedes editarlo cuando quieras. |
| ¿Puedo cambiar al partner una vez empezado el torneo? | **No** se recomienda. Cambiarlo afectaría al historial de partidos jugados. Si necesitas hacerlo, sería mejor descalificar a la pareja y crear una nueva. |
| ¿Qué pasa si dejo el nombre de equipo vacío? | Se muestra automáticamente como *"María / Carlos"* en todos los sitios. No hay problema. |
| ¿Si una pareja gana, los puntos de ranking se reparten o se duplican? | **Cada uno recibe los puntos completos de su posición**. No se reparten ni se duplican: ambos jugadores acumulan los mismos puntos en su perfil. |
| ¿Puedo mezclar parejas de jugadores registrados y de invitados? | Sí. Una pareja puede ser *registrado + registrado*, *registrado + invitado*, o *invitado + invitado*. |
| ¿La pareja tiene un único perfil o cada uno el suyo? | **Cada uno el suyo**. La pareja existe solo dentro del torneo, no como cuenta independiente. |

---

## Documentación relacionada

- [GUIA_ADMIN_TORNEOS.md](./GUIA_ADMIN_TORNEOS.md) — Cómo crear un torneo paso a paso
- [ADMIN_TORNEO_FUNCIONES.md](./ADMIN_TORNEO_FUNCIONES.md) — Funciones del admin durante el torneo (WO, DSQ, fin por tiempo)
- [DESEMPATES.md](./DESEMPATES.md) — Cómo se resuelven los empates
- [DOUBLES_TOURNAMENTS.md](../en/DOUBLES_TOURNAMENTS.md) — Versión técnica en inglés (estructura de datos, archivos clave)
