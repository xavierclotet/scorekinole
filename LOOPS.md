# LOOPS.md — Trabajar por objetivos (`/goal`) en vez de por prompts

Manera de trabajar para tareas grandes: en lugar de dirigir al agente prompt a prompt,
se define **un estado final verificable** y el agente itera solo hasta alcanzarlo.
Un modelo independiente (juez) decide cuándo está cumplido — no el modelo que hace el trabajo.

> Requiere Claude Code **v2.1.139+** (instalada: 2.1.217 ✓).
> Docs oficiales: [/goal](https://code.claude.com/docs/en/goal) · [/loop y scheduling](https://code.claude.com/docs/en/scheduled-tasks) · [auto mode](https://code.claude.com/docs/en/auto-mode-config)

---

## 1. Los tres mecanismos (elegir según qué dispara el siguiente turno)

| Mecanismo | Siguiente turno arranca… | Para cuando |
|---|---|---|
| **`/goal`** | Al acabar el turno anterior, si el juez dice "no cumplido" | Trabajo con **estado final verificable** (tests, build, migración completa) |
| **`/loop`** | Al pasar un intervalo de tiempo | Vigilancia recurrente (CI, PRs, estado externo) |
| **Stop hook** | Al acabar el turno, según tu script/prompt | Evaluación custom permanente en settings |

`/goal` es el modo por defecto para features y refactors. `/loop` es para mantenimiento periódico, no para construir cosas.

## 2. Documentos base (antes de lanzar ningún loop)

El patrón canónico pide tres documentos. **En este repo dos ya existen** — no duplicarlos, que luego divergen:

| Canónico | En Scorekinole | Estado |
|---|---|---|
| `VISION.md` — cómo se ve el éxito del producto/feature | `VISION.md` | ⬜ **Pendiente de crear** (lo dicta Xavi) |
| `ARCHITECTURE.md` — stack y estructura | **`AGENTS.md`** (+ `docs/en/`) | ✅ Ya existe |
| `RULES.md` — lo que el agente nunca toca | **`CLAUDE.md` + AGENTS.md** + §6 de este doc | ✅ Ya existe |

Para una feature concreta, la "visión" puede ser un doc de diseño en `docs/en/` (p. ej. `COUNTER_SCORING_MODE.md`) — no hace falta VISION.md global para empezar.

## 3. Lanzar un goal

```text
/goal todos los tests de src/lib/... pasan con `npm test` (exit 0),
      sin modificar ningún otro archivo de test. O parar tras 30 turnos.
```

- Setear el goal **arranca el primer turno inmediatamente** — no hace falta prompt aparte.
- Solo puede haber **un goal activo por sesión**; uno nuevo reemplaza al anterior.
- `/goal` **no cambia permisos**: para que corra desatendido, combinarlo con **auto mode**. Si no, se parará a pedir permiso en cada comando no permitido.
- `/goal` (sin argumentos) → estado: condición, turnos evaluados, tokens gastados, última razón del juez.
- `/goal clear` → cortar antes de tiempo (aliases: `stop`, `off`, `reset`, `none`, `cancel`).
- Si la sesión se cierra con goal activo, `--resume` / `--continue` lo restaura (turnos y timer se resetean).
- No interactivo: `claude -p "/goal ..."` corre el loop entero en una invocación (añadir `--output-format stream-json --verbose` para ver progreso).

## 4. Escribir una buena condición (lo que decide que esto funcione)

El error más común: describir **trabajo a hacer** en vez de **un estado a alcanzar**.

Una condición robusta tiene 4 partes:

1. **Estado final medible** — resultado de tests, exit code, cola vacía, conteo de archivos.
2. **Comprobación explícita** — cómo se demuestra: "`npm test` sale con exit 0".
3. **Restricciones** — qué no puede cambiar por el camino: "sin tocar `src/lib/paraglide/`".
4. **Tope de escape** — "o parar tras 30 turnos" (el límite va **dentro de la condición**; no hay flag aparte).

⚠️ **El juez solo ve el transcript.** Es un modelo pequeño (Haiku por defecto) que NO ejecuta comandos ni lee archivos:
solo puede juzgar lo que el agente ha mostrado en la conversación. Por eso la condición debe ser
demostrable con output de comandos, no con "el código está limpio" o "la UX es buena".

## 5. Checks verificables en este repo

| Check | Comando | Notas |
|---|---|---|
| Tests unitarios | `npm test` (vitest) | El check principal para goals |
| Tests de reglas Firestore | `npm run test:rules` | Requiere emulador de Firestore levantado |
| Type-check | `npm run check` (svelte-check) | **Solo si el goal lo pide explícitamente** — la regla "nunca ejecutar svelte-check por iniciativa propia" sigue vigente; escribirlo en el goal ES la autorización explícita |

No existe script `lint` en `package.json` — no usar "el lint está limpio" como condición hasta que exista.

## 6. Guardarraíles — lo que un loop NUNCA hace (aunque el goal parezca pedirlo)

Consolidado de `CLAUDE.md`, `AGENTS.md` y decisiones previas. Un error en modo desatendido se multiplica por N turnos, así que aquí se es estricto:

- ❌ **Commit o push** — el loop termina con el working tree modificado y listo para revisar. Xavi verifica en dev y decide el commit.
- ❌ **Deploy** de cualquier tipo (`firebase deploy`, hosting, functions, rules).
- ❌ `npm run dev` / `npm run build` — nunca (ni siquiera dentro de un goal).
- ❌ Editar `src/lib/paraglide/` (auto-generado).
- ❌ Tocar `/matches` para arreglar datos de torneos (los partidos de torneo viven dentro del doc del torneo).
- ❌ Traducir "hammer" en `messages/es.json` / `ca.json`.
- ❌ Borrar o reescribir tests existentes para "hacer pasar" el goal (cambiar el examen no es aprobar).
- ❌ Query params en otro idioma que inglés (`mode`, `league`, `year`).

## 7. Memoria para loops largos (varios días)

Si un objetivo va a vivir más de una sesión, crear **`LOOP_MEMORY.md`** en la raíz (nombre distinto
de `MEMORY.md` para no chocar con la memoria persistente de Claude) con tres secciones:

```markdown
## PROBADO
<experimento intentado> → <resultado exacto, con comando y output resumido>

## VERIFICADO
<hechos confirmados con evidencia — no suposiciones>

## ABIERTO
<qué queda por intentar, en orden de prioridad>
```

Y la regla que lo hace funcionar (añadirla a la propia condición del goal o a `CLAUDE.md` si se vuelve permanente):

> **Antes de empezar un turno, lee `LOOP_MEMORY.md`. Antes de terminar, actualízalo.**

El valor está en convertir fallos en reglas verificadas y consultarlas en vez de rederivarlas cada turno.
Un experimento fallido anotado en PROBADO no se repite; una suposición no pasa a VERIFICADO sin evidencia.

## 8. Receta rápida

```text
1. ¿Existe doc de visión/diseño para esta feature?  → si no, escribirlo (o dictarlo)
2. ¿La condición es demostrable con un comando?     → si no, reformular o no usar /goal
3. Activar auto mode
4. /goal <estado final> + <comprobación> + <restricciones> + "o parar tras N turnos"
5. (loops de días) crear LOOP_MEMORY.md y citarlo en la condición
6. Volver cuando esté en verde · /goal para estado · /goal clear para abortar
7. Revisar el diff, verificar en dev, y entonces decidir commit — como siempre
```

## 9. Opción B — tareas de horas: Claude Managed Agents

Para trabajo largo con criterios de calidad subjetivos (no solo "tests en verde"),
[Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) ofrece harness + sandbox alojados
y [**outcomes**](https://platform.claude.com/docs/en/managed-agents/define-outcomes): una **rúbrica** en markdown con criterios puntuables,
evaluada por un grader que corre en su propio contexto — el agente no controla su propia nota, igual que con el juez de `/goal`
pero con criterios ricos ("la copy respeta la voz de marca") en vez de un sí/no.
Sesiones con estado, reanudables, con historial y outputs guardados server-side.

Cuándo saltar a CMA: cuando el objetivo necesita horas de cómputo, criterios de rúbrica en vez de condición binaria,
o correr fuera de tu máquina. Para todo lo demás, `/goal` en local es más simple y suficiente.
