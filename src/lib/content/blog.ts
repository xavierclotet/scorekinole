export interface BlogPost {
	slug: string;
	title: string;
	description: string;
	date: string;
	author: string;
	image?: string;
	content: string;
	tags: string[];
}

export const blogPosts: BlogPost[] = [
	{
		slug: 'como-anotar-puntos-partido-amistoso',
		title: 'Cómo anotar puntos en un partido amistoso: por puntos vs por rondas',
		description: 'Descubre cómo se anota un partido amistoso de crokinole en Scorekinole: la diferencia entre el modo "por puntos" y "por rondas", y cómo sumar y restar puntos con un simple toque o deslizando el dedo.',
		date: '2026-07-17',
		author: 'Scorekinole Team',
		image: '/og-image.png',
		content: `Cuando juegas un partido amistoso en Scorekinole tienes dos formas de decidir cuándo termina la partida: **por puntos** o **por rondas**. Aquí te explicamos la diferencia y cómo se anota realmente en la pantalla de juego.

## Cómo se suman los puntos: toca y desliza

En la pantalla de juego, cada equipo tiene un marcador gigante en su tarjeta — no hay que buscar botones pequeños:

- **Toca el marcador** para sumar 1 punto.
- **Desliza el dedo hacia abajo** sobre el marcador para restar ese punto (perfecto si te equivocas al contar).

Así anotas sin apartar la vista del tablero, con una sola mano.

## Modo "Por puntos"

Eliges un número objetivo (normalmente 7, 9 u 11) y gana el primer equipo en llegar a esa cifra **con 2 puntos de ventaja** sobre el rival. Es el formato más habitual entre amigos.

## Modo "Por rondas"

En lugar de un objetivo de puntos, se juega un número fijo de rondas (por ejemplo, 4). Cuando la diferencia de puntos anotados en la ronda llega a 2 (por ejemplo 2-0 o 1-1), la ronda se cierra sola, el marcador de ronda avanza y el hammer (última piedra) pasa al otro equipo. Al final de las N rondas, gana quien tenga más puntos acumulados.

## Extras opcionales

Desde la configuración del partido puedes activar **Hammer** (quién tira último cada ronda), **20s** (discos en el agujero central, útiles para desempates) y **Mejor de N** (encadenar varias partidas). Ninguno es obligatorio — puedes jugar a pelo si quieres máxima rapidez.

¿Todavía no lo has probado? Abre Scorekinole, pulsa "Nuevo Juego" y elige tu modo — llevar el marcador de crokinole nunca fue tan rápido.`,
		tags: ['scorekinole', 'tutorial', 'guía', 'crokinole', 'amistoso']
	},
	{
		slug: 'como-crear-torneo-en-vivo',
		title: 'Cómo crear un torneo en vivo en Scorekinole (paso a paso)',
		description: 'Guía rápida para crear un torneo de crokinole en Scorekinole: desde la configuración inicial hasta la publicación. Ideal para organizadores sin experiencia técnica.',
		date: '2026-07-16',
		author: 'Scorekinole Team',
		image: '/og-image.png',
		content: `Crear un torneo en vivo en Scorekinole es cuestión de minutos. Aquí te explico el proceso resumido para que lo tengas listo el día de tu evento.

## 1. Accede al creador

Ve a **Admin → Torneos → Nuevo torneo**. Se abre un asistente de 6 pasos. No te asustes, la mayoría son configuración rápida.

## 2. Paso 1 — Información básica

Pon el nombre del torneo, la fecha, ubicación y si es **Singles** o **Dobles**. La clave de 6 caracteres se genera sola — es lo que compartirás con los jugadores para que accedan a sus partidos.

Si estás probando, marca **"Torneo de prueba"** para que no sea público ni cuente para el ranking hasta que tú decidas.

## 3. Paso 2 — Formato

Define el número de mesas físicas disponibles y la estructura:

- **2 fases** (recomendado): Fase de grupos + eliminatoria final
- **Solo grupos**: Clasificación por liga, sin eliminatorias
- **Eliminación directa**: Brackets desde el primer partido

Elige sistema de grupos: **Round Robin** (todos contra todos, ideal para ≤8 jugadores por grupo) o **Suizo** (emparejamientos por resultados, ideal para grupos grandes).

## 4. Paso 3 — Ranking

Si el torneo es oficial, selecciona la serie (**Series 35, 25 o 15**) para que los puntos de ranking se calculen automáticamente. La app te muestra una previsualización de los puntos por posición.

## 5. Paso 4 — Participantes

Añade los jugadores: puedes buscarlos entre los usuarios registrados, añadirlos como invitados, o activar la **autoinscripción** para que se apunten ellos mismos desde la app (con lista de espera incluida).

## 6. Paso 5 — Tiempo y mesas

Confirma el número de mesas y ajusta la duración estimada por partido. La app calcula automáticamente la duración total estimada del torneo.

## 7. Paso 6 — Revisar y crear

Repasa todo el resumen y pulsa **Crear torneo**. ¡Ya está! El torneo aparecerá en el listado y los jugadores podrán unirse con la clave.

## Extra: publicarlo

Si lo creaste como "torneo de prueba", vuelve a **Editar torneo**, desmarca esa casilla y se volverá público y contará para el ranking.

¿Tienes dudas? Escríbenos o consulta la guía completa en Admin.`,
		tags: ['torneo', 'tutorial', 'guía', 'scorekinole', 'admin']
	},
	{
		slug: 'nuevo-dominio-scorekinole-es',
		title: 'Scorekinole ahora en scorekinole.es — actualiza tus marcadores',
		description: '¡Scorekinole se muda a scorekinole.es! Descubre por qué cambiamos de dominio, cómo afecta a los usuarios registrados y cómo actualizar tus marcadores.',
		date: '2026-07-12',
		author: 'Scorekinole Team',
		image: '/og-image.png',
		content: `Scorekinole ha cambiado su dominio de scorekinole.web.app a scorekinole.es. Este cambio nos permite tener una presencia más profesional y ofrecer una mejor experiencia a todos los jugadores de crokinole.

## ¿Por qué el cambio?

Hasta ahora funcionábamos en un subdominio de Firebase (scorekinole.web.app), que era perfecto para empezar pero tiene limitaciones de cara al futuro. El nuevo dominio .es nos da:
- Una dirección más corta y fácil de recordar
- Mejor posicionamiento en buscadores
- Aspecto más profesional para torneos y competiciones
- Posibilidad de añadir un blog y más contenido

## ¿Tengo que hacer algo?

Si ya tienes cuenta en Scorekinole, **no necesitas hacer nada**. Todos tus datos, partidas y torneos se han migrado automáticamente. El inicio de sesión con Google y email sigue funcionando exactamente igual.

## Actualiza tus marcadores

Si tienes Scorekinole guardado en favoritos, actualiza el enlace a:
**https://scorekinole.es**

La antigua dirección (scorekinole.web.app) sigue redirigiendo aquí, así que no perderás el acceso, pero te recomendamos actualizar el marcador para ir directamente al nuevo dominio.

## ¿Y el futuro?

Este cambio es el primero de muchos. Con el nuevo dominio vamos a poder:
- Publicar artículos y guías en el blog
- Mejorar el SEO para que más jugadores descubran la app
- Añadir nuevas funcionalidades sin las limitaciones del dominio anterior

¡Gracias por formar parte de la comunidad Scorekinole! Seguimos trabajando para hacer de Scorekinole la mejor herramienta de puntuación en vivo para crokinole.`,
		tags: ['scorekinole', 'dominio', 'actualización', 'noticias']
	},
	{
		slug: 'que-es-crokinole-reglas-basicas',
		title: '¿Qué es el Crokinole? Reglas básicas para empezar',
		description: 'Descubre el crokinole, un emocionante juego de habilidad. Aprende las reglas básicas, cómo se puntúa y por qué está ganando popularidad en todo el mundo.',
		date: '2026-07-10',
		author: 'Scorekinole Team',
		image: '/og-image.png',
		content: `El crokinole es un juego de habilidad que combina precisión, estrategia y diversión. Originario de Canadá, se ha expandido por todo el mundo y cada vez tiene más seguidores.

## ¿Cómo se juega?

El objetivo del crokinole es lanzar discos desde el borde del tablero hacia el centro, intentando sumar la mayor cantidad de puntos posible. Los jugadores se turnan para lanzar sus discos, y la estrategia consiste tanto en sumar puntos como en desplazar los discos del oponente.

## El tablero

El tablero de crokinole es circular, con varios anillos concéntricos que determinan la puntuación:
- Anillo exterior: 5 puntos
- Anillo medio: 10 puntos  
- Anillo interior: 15 puntos
- Agujero central: 20 puntos (el famoso "20")

## Reglas básicas

1. Cada jugador tiene 12 discos por ronda
2. Los discos deben lanzarse desde el borde del tablero
3. Si un disco del oponente está en juego, debes golpearlo
4. Si no golpeas ningún disco del oponente, tu disco es eliminado
5. El jugador con más puntos al final de la partida gana

## Puntuación en vivo con Scorekinole

Con Scorekinole puedes llevar la puntuación de tus partidas de crokinole en tiempo real desde tu móvil. Olvídate de las hojas de papel: nuestra app te permite gestionar torneos, seguir estadísticas y competir con amigos de forma sencilla y gratuita.`,
		tags: ['crokinole', 'reglas', 'principiantes', 'tutorial']
	},
	{
		slug: 'como-organizar-torneo-crokinole',
		title: 'Cómo organizar un torneo de crokinole paso a paso',
		description: 'Guía completa para organizar tu primer torneo de crokinole. Desde la elección del formato hasta la gestión de puntuaciones en vivo con Scorekinole.',
		date: '2026-07-08',
		author: 'Scorekinole Team',
		image: '/og-image.png',
		content: `Organizar un torneo de crokinole puede parecer complejo, pero con las herramientas adecuadas es más sencillo de lo que imaginas.

## 1. Elige el formato

Los formatos más populares son:
- **Round Robin**: Todos contra todos en grupos
- **Suizo**: Emparejamientos según resultados
- **Eliminatorias (Bracket)**: Torneo por fases

## 2. Define las categorías

Puedes organizar torneos individuales, de dobles, o ambas categorías. Los torneos de dobles tienen su propia dinámica y son muy populares en la comunidad crokinole.

## 3. Gestiona las inscripciones

Con Scorekinole puedes activar la autoinscripción para que los jugadores se registren ellos mismos, con lista de espera incluida.

## 4. Durante el torneo

La clave del éxito es tener las puntuaciones actualizadas en tiempo real. Con nuestra app puedes:
- Asignar mesas de forma equitativa
- Registrar resultados al instante
- Visualizar clasificaciones en vivo
- Gestionar walkovers y descalificaciones

## 5. Al finalizar

Scorekinole calcula automáticamente los puntos de ranking, genera los resultados finales y los publica para que todos los participantes puedan consultarlos.

¿Quieres probarlo? Crea tu torneo gratis en Scorekinole y descubre lo fácil que es gestionar competiciones de crokinole.`,
		tags: ['torneo', 'organización', 'crokinole', 'guía']
	},
	{
		slug: 'mejores-jugadores-crokinole-ranking',
		title: 'Los mejores jugadores de crokinole del mundo',
		description: 'Conoce el ranking mundial de crokinole. Descubre quiénes son los mejores jugadores, sus estadísticas y cómo se calcula la puntuación en los torneos.',
		date: '2026-07-05',
		author: 'Scorekinole Team',
		image: '/og-image.png',
		content: `El crokinole tiene una comunidad global de jugadores apasionados. Cada año se celebran torneos por todo el mundo y los mejores jugadores compiten por estar en lo más alto del ranking.

## ¿Cómo funciona el ranking?

El sistema de ranking de Scorekinole se basa en los resultados de los torneos. Cuantos más torneos juegues y mejor quedes clasificado, más puntos acumularás.

## Factores que influyen en la puntuación

- Posición final en el torneo
- Número de participantes
- Nivel del torneo (regional, nacional, internacional)
- Categoría (individual o dobles)

## Sigue el ranking en Scorekinole

En Scorekinole puedes consultar el ranking actualizado de jugadores de crokinole, filtrar por año, país y categoría. Cada jugador tiene su perfil con estadísticas detalladas: partidas ganadas, veintes (20s), historial de torneos y mucho más.

¿Quieres aparecer en el ranking? Participa en torneos gestionados con Scorekinole y construye tu historial competitivo.`,
		tags: ['ranking', 'jugadores', 'crokinole', 'estadísticas']
	}
];
