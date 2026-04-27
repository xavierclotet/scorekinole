# Sistema de desempates

Este documento explica cómo se resuelven los empates en la **clasificación de los grupos** de un torneo. Está pensado para administradores de torneos de Crokinole, no requiere conocimientos técnicos.

> 💡 **Antes de empezar**: si dos o más jugadores terminan la fase de grupos con la misma cantidad de puntos (en modo *Por victorias*) o con los mismos puntos totales anotados (en modo *Por puntos totales*), la app aplica esta cadena de criterios automáticamente para ordenarlos. Si después de todos los criterios sigue habiendo empate, queda marcado como **"empate sin resolver"** y se debe jugar un **shoot-out** físico.

---

## Lo que necesitas saber en 30 segundos

| Situación | Cadena de desempate aplicada |
|-----------|------------------------------|
| **2 jugadores empatados** (modo Victorias) | H2H → 20s → Puntos totales → Buchholz → Shoot-out |
| **2 jugadores empatados** (modo Puntos) | H2H → 20s → Buchholz → Shoot-out |
| **3+ empatados, Suizo** (modo Victorias) | 20s → Puntos totales → Buchholz → H2H entre los que queden empatados de a 2 → Shoot-out |
| **3+ empatados, Suizo** (modo Puntos) | 20s → Buchholz → H2H entre los que queden empatados de a 2 → Shoot-out |
| **3+ empatados, Round Robin** (modo Victorias) | **Mini-liga** (puntos y 20s solo entre los empatados) → 20s → Puntos totales → Buchholz → H2H → Shoot-out |
| **3+ empatados, Round Robin** (modo Puntos) | 20s → Buchholz → H2H → Shoot-out |

> **Nota**: el paso de **20s** se omite si en la configuración del torneo has desactivado "Contar 20s" (`show20s` = false).

---

## Glosario rápido

Antes de explicar las cadenas, te aclaro los términos:

| Término | Qué significa |
|---------|---------------|
| **Modo Victorias** | El torneo clasifica por **puntos de victoria** (2 por ganar, 1 por empatar, 0 por perder). En el formulario aparece como *"Por victorias"*. |
| **Modo Puntos** | El torneo clasifica por **puntos totales** anotados durante la fase. En el formulario: *"Por puntos totales"*. |
| **H2H** (Head-to-Head) | El **resultado directo** entre dos jugadores. Si A le ganó a B, A queda por encima. |
| **20s** | Cantidad total de "veintes" anotados durante la fase de grupos. |
| **Puntos totales** | Suma de todos los puntos de Crokinole anotados (p. ej.: una victoria 6-2 son 6 puntos para ti). |
| **Buchholz** | Mide la **fuerza del calendario** de un jugador (ver más abajo). |
| **Mini-liga** | Recalcular puntos y 20s usando **solo los partidos entre los jugadores empatados**, ignorando el resto. |
| **Shoot-out** | Desempate físico: cada jugador tira 12 discos a un tablero vacío y cuenta cuántos 20s mete. |

---

## Cadenas de desempate detalladas

### Modo "Por victorias" (2/1/0)

#### Empate de 2 jugadores

1. **Head-to-Head (H2H)** — el ganador del enfrentamiento directo queda por encima.
2. **Total de 20s** — el que anotó más 20s en la fase. *(Se salta si "Contar 20s" está desactivado.)*
3. **Total de puntos de Crokinole** — suma de todos los puntos de partido (ej: en un 6-2 son 6).
4. **Buchholz** — suma de los puntos de victoria de todos los rivales que enfrentó (calendario más duro = mayor Buchholz).
5. **Sin resolver → Shoot-out** físico, decisión del admin.

#### Empate de 3 o más jugadores (Suizo)

1. **Total de 20s** *(se salta si "Contar 20s" está desactivado)*.
2. **Total de puntos de Crokinole**.
3. **Buchholz**.
4. **H2H** — si después de los pasos anteriores siguen empatados **exactamente 2 jugadores**, se aplica el resultado directo entre ellos.
5. **Sin resolver → Shoot-out**.

#### Empate de 3 o más jugadores (Round Robin)

1. **Mini-liga** — recalcular puntos usando **solo los partidos entre los empatados**. Si sigue habiendo empate, mira los 20s entre esos partidos.
2. **Total de 20s** (de toda la fase, no solo los partidos de la mini-liga).
3. **Total de puntos de Crokinole**.
4. **Buchholz**.
5. **H2H** entre los que queden empatados de a 2.
6. **Sin resolver → Shoot-out**.

> ¿Por qué solo Round Robin tiene mini-liga? Porque en Round Robin **todos juegan contra todos**, así que la mini-liga es completa y justa. En Suizo no todos se enfrentan entre sí, por lo que una mini-liga sería incompleta.

---

### Modo "Por puntos totales"

> En este modo, los puntos totales **ya son** el criterio principal de la clasificación. Por eso si dos jugadores están empatados, ambos tienen los mismos puntos totales y este criterio no puede usarse de desempate (ya está empatado).

#### Empate de 2 jugadores

1. **H2H**
2. **Total de 20s** *(se salta si "Contar 20s" está desactivado)*.
3. **Buchholz** — aquí Buchholz suma los **puntos totales de los rivales** (no las victorias).
4. **Sin resolver → Shoot-out**.

#### Empate de 3 o más (Suizo o Round Robin)

1. **Total de 20s** *(se salta si está desactivado)*.
2. **Buchholz**.
3. **H2H** entre los que queden empatados de a 2.
4. **Sin resolver → Shoot-out**.

---

## ¿Qué es exactamente Buchholz?

**Buchholz** es un sistema clásico de ajedrez aplicado al Crokinole. Mide la **dureza del calendario** de un jugador.

```
Buchholz = suma del valor principal de todos los rivales a los que se enfrentó
```

- En **modo Victorias**: suma los puntos de victoria (2/1/0) de los rivales.
- En **modo Puntos**: suma los puntos totales de los rivales.

### ¿Para qué sirve?

Imagínate dos jugadores con el mismo balance (5 victorias). Uno se enfrentó a los mejores del torneo y el otro a los peores. **Buchholz premia al que tuvo el camino más duro**, porque sus rivales acumularon más puntos que los del otro.

### ¿Cómo afecta el BYE?

Un rival "BYE" tiene 0 puntos, así que el Buchholz del jugador que recibió un BYE baja un poco. Es lo estándar en ajedrez y se considera correcto.

### ¿Dónde se ve?

En la tabla de clasificación de torneos en sistema **Suizo** verás una columna **"Buc"** con el valor de Buchholz de cada jugador. En **Round Robin** la columna se oculta porque casi todos tienen el mismo Buchholz (todos juegan contra todos).

---

## La mini-liga (solo Round Robin)

Cuando 3 o más jugadores empatan en Round Robin con modo Victorias, la app construye una **mini-liga**: una clasificación que **solo cuenta los partidos entre los empatados**, ignorando el resto.

### Cómo se calcula

1. Sumar puntos de victoria solo de los partidos entre los empatados (2 por ganar, 1 por empatar, 0 por perder).
2. Si siguen empatados, sumar 20s solo de esos mismos partidos.
3. Si siguen empatados, pasar al siguiente criterio (20s totales → puntos totales → Buchholz).

### Ejemplo: triple empate en Round Robin

**Situación**: A, B y C terminan con 6 puntos cada uno.

**Resultados directos entre ellos**:
- A vence a B
- B vence a C
- C vence a A

**Mini-liga (puntos)**:

| Jugador | Puntos en mini-liga |
|---------|--------------------|
| A | 2 (gana a B) |
| B | 2 (gana a C) |
| C | 2 (gana a A) |

**¡Siguen empatados!** → Pasamos a **20s en mini-liga**:

| Jugador | 20s en mini-liga |
|---------|------------------|
| A | 9 |
| B | 7 |
| C | 6 |

**Orden final**: A → B → C ✅

---

## Ejemplo: triple empate en Suizo

**Situación**: A, B y C terminan con 6 puntos cada uno en un torneo Suizo.

**Problema**: A jugó contra B, B jugó contra C, **pero A nunca jugó contra C** (en Suizo no todos se enfrentan entre sí). Por eso no se puede aplicar mini-liga.

**Solución**: la app aplica la cadena estándar.

| Jugador | Total 20s | Puntos totales | Buchholz |
|---------|-----------|----------------|----------|
| A | 15 | 42 | 8 |
| B | 12 | 38 | 10 |
| C | 12 | 38 | 7 |

- A es **1º** (más 20s).
- B y C empatados en 20s y puntos → se mira Buchholz: B (10) > C (7).
- B es **2º**, C es **3º**.

**Orden final**: A → B → C ✅

---

## Empates sin resolver: el Shoot-out

Cuando dos o más jugadores siguen empatados después de **todos** los criterios automáticos, la app los marca como **"empate sin resolver"**. Ese empate se rompe físicamente con un **shoot-out**.

### ¿Qué es un Shoot-out? (reglas oficiales NCA/WCC)

1. **Tablero vacío**: sin discos del rival. Es un test puro de precisión.
2. **12 discos**: cada jugador dispone de 12 tiros (una "ronda" entera).
3. **Objetivo**: meter el máximo de 20s posible.
4. **Procedimiento**:
   - El jugador A tira sus 12 discos uno a uno. Se cuenta cuántos 20s mete.
   - El jugador B hace lo mismo.
   - Quien meta más 20s gana el desempate y queda por encima en la clasificación.

### ¿Y si vuelven a empatar?

Si después de los 12 tiros siguen igualados (ej: ambos meten 9 20s), se entra en **muerte súbita**:

1. Cada jugador lanza **1 solo disco**.
2. Si A lo mete y B lo falla → gana A.
3. Si los dos lo meten o los dos lo fallan → repetir hasta que uno falle.

### Importante

El shoot-out **NO está implementado en código** — se juega físicamente en la mesa. Cuando termina, el admin debe **ajustar manualmente** la clasificación moviendo al ganador por encima del perdedor desde el panel de administración.

---

## Asignación de BYE en torneos Suizos

Cuando un grupo Suizo tiene un número impar de jugadores, en cada ronda **un jugador recibe un BYE** (victoria automática). La app decide quién lo recibe siguiendo esta cadena de prioridad:

1. **Quien nunca haya recibido un BYE** — la prioridad #1 es la justicia: todos reciben un BYE antes de que alguien reciba un segundo.
2. **Menos puntos Suizos** — entre los que no han tenido BYE aún, el más débil de la tabla recibe la victoria gratis (ayuda a equilibrar).
3. **Menos puntos totales anotados** — entre los igualados en puntos suizos, el que ha anotado menos en general.
4. **Menos 20s totales** — entre los aún empatados, el que tiene menos 20s.
5. **Menor Buchholz** — último criterio, el que se enfrentó a rivales más débiles.

### ¿Por qué este orden?

- En las primeras rondas casi todos tienen 0 o 2 puntos suizos, así que los criterios 3-5 son los que más deciden.
- "Menos puntos totales" es la medida más intuitiva de "quién está pasando peor".
- Los 20s reflejan habilidad técnica.
- Buchholz queda al final porque en rondas iniciales sus valores son inestables.

### Resultado del partido BYE

Un partido BYE se registra como **WALKOVER** con marcadores fijos:
- Juegos: 2-0
- Puntos: 8-0
- 20s: 0-0

---

## Configurar tú mismo el orden de los criterios

La aplicación permite que el admin **personalice el orden** de los criterios de desempate desde la configuración del torneo (parámetro `tiebreakerPriority`). El orden por defecto es:

```
['h2h', 'total20s', 'totalPoints', 'buchholz']
```

Si lo cambias, ten en cuenta que:
- En Round Robin con modo Victorias, el criterio `'h2h'` activa la **mini-liga** automáticamente cuando hay 3+ empatados. Si lo quitas del orden, no habrá mini-liga.
- El criterio `'total20s'` siempre se omite si "Contar 20s" está desactivado en el torneo.
- El criterio `'totalPoints'` solo aplica en modo Victorias (en modo Puntos ya es el criterio principal).

> 💡 Si no tocas nada, la app usará el orden por defecto, que es el recomendado para torneos oficiales.

---

## Tabla resumen final

| Caso | Modo Victorias | Modo Puntos |
|------|---------------|-------------|
| **2 empatados** | H2H → 20s → Pts → Buc | H2H → 20s → Buc |
| **3+ empatados, Suizo** | 20s → Pts → Buc → H2H | 20s → Buc → H2H |
| **3+ empatados, Round Robin** | Mini-liga → 20s → Pts → Buc → H2H | 20s → Buc → H2H |

> Todas las cadenas terminan en **Shoot-out** si el empate persiste.
> El paso **20s** se omite si "Contar 20s" está desactivado en el torneo.
> Diferencia clave: en modo Puntos no se puede usar "puntos totales" como desempate (ya es el criterio principal), y solo Round Robin con modo Victorias tiene mini-liga.

---

## Documentación relacionada

- [GUIA_ADMIN_TORNEOS.md](./GUIA_ADMIN_TORNEOS.md) — Guía para crear y administrar torneos
- [TIEBREAKER.md](../en/TIEBREAKER.md) — Versión técnica en inglés (incluye estructuras de datos)
- [SCORING_TERMINOLOGY.md](../en/SCORING_TERMINOLOGY.md) — Terminología de puntuación

## Implementación técnica

- Algoritmo: [`src/lib/algorithms/tiebreaker.ts`](../../src/lib/algorithms/tiebreaker.ts)
- Asignación de BYE Suizo: [`src/lib/algorithms/swiss.ts`](../../src/lib/algorithms/swiss.ts)
- Tests: [`src/lib/algorithms/tiebreaker.test.ts`](../../src/lib/algorithms/tiebreaker.test.ts)
