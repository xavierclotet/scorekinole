# Blog — Cómo funciona

El blog de Scorekinole es un blog estático. Los artículos se definen en `src/lib/content/blog.ts` como un array de objetos `BlogPost`.

## Estructura

```
src/lib/content/blog.ts      ← Datos de los artículos
src/routes/blog/+page.svelte  ← Listado (/blog)
src/routes/blog/[slug]/+page.svelte  ← Artículo individual (/blog/mi-slug)
```

## Cómo añadir un artículo

Abre `src/lib/content/blog.ts` y añade un nuevo objeto al array `blogPosts`:

```ts
{
    slug: 'novedades-julio-2026',
    title: 'Novedades de Scorekinole — Julio 2026',
    description: 'Resumen mensual con las últimas actualizaciones, mejoras y novedades de Scorekinole.',
    date: '2026-07-12',
    author: 'Scorekinole Team',
    image: '/og-image.png',
    content: `## Novedades de este mes

Escribe aquí el contenido en **Markdown**.

- Puedes usar listas
- Enlaces, negritas, etc.

### Subtítulo

Más contenido...`,
    tags: ['novedades', 'scorekinole', 'actualización']
}
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `slug` | `string` | Identificador único para la URL (`/blog/mi-slug`) |
| `title` | `string` | Título del artículo |
| `description` | `string` | Meta description para SEO (máx 160 caracteres) |
| `date` | `string` | Fecha en formato `YYYY-MM-DD` |
| `author` | `string` | Autor del artículo |
| `image` | `string` | URL de la imagen destacada (opcional) |
| `content` | `string` | Contenido en Markdown (template string con backticks) |
| `tags` | `string[]` | Etiquetas para categorizar |

### Importante

- El `slug` debe ser único
- La primera publicación del array es la más reciente (se ordena por fecha automáticamente)
- El contenido se escribe en **español** (o cualquier idioma). El botón "Traducir" de cada artículo usa la API MyMemory para traducir automáticamente al idioma del usuario
- Después de añadir un artículo, actualiza `static/sitemap.xml` añadiendo la URL del nuevo post
- Haz deploy para que los cambios se publiquen

## Traducción

Los artículos se escriben en un solo idioma (recomendado: español). El usuario puede hacer clic en "Traducir" para ver el contenido en su idioma mediante la API MyMemory (la misma que se usa en las descripciones de torneos).

## SEO

Cada artículo genera automáticamente:
- `<title>` y `<meta description>` a partir de `title` y `description`
- JSON-LD `Article` schema (fecha de publicación, autor, título)
- JSON-LD `BreadcrumbList` (Home > Blog > Título)
- Open Graph tags para compartir en redes sociales
