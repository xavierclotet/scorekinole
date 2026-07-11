---
route: "/"
title: "Landing Page (Home)"
description: "Página principal (Home) de la aplicación donde los usuarios inician sesión, empiezan partidas nuevas, ven torneos o su perfil."
---

## 🎯 Contexto de Agente (WebMCP)
> **ATENCIÓN IA / AGENTE**: Lee este archivo antes de modificar el componente `+page.svelte` de esta ruta o de interactuar con la interfaz en `puppeteer`/e2e. 
> Esta página es la puerta de entrada a la aplicación.

## 🧭 Estructura y Componentes Principales
- **Navbar (`.navbar`)**: 
  - `LanguageSelector`: Desplegable de idiomas.
  - `ThemeToggle`: Botón modo oscuro/claro.
  - `ProfileDropdown`: Menú de usuario autenticado o botón de "Login" si no lo está.
  - `Admin Button`: Sólo visible si `$canAccessAdmin` es true. Navega a `/admin`.
- **Hero Section (`.hero`)**:
  - Título principal (`Scorekinole`).
  - **Botón `startScoring` (Primary, "New Game")**: Inicia una partida navegando a `/game`.
  - **Quick Links** (`.quick-links`): Grid 2x2 (4-col en desktop) de botones a `/tournaments`, `/ranking`, Mis Stats, `/leaderboards`.
  - **Install PWA** (`$canInstall` → `.install-btn`) y **iOS banner** (`.ios-install-banner`).
  - **Ko-fi** (`.kofi-btn`): enlace de soporte.
  - **Scroll indicator** (`.scroll-indicator`): botón con flecha animada que hace scroll a `#showcase`.
- **Showcase (`.showcase` `#showcase`)**: Sección scrollable con 6 bloques alternados (`.showcase-feature` / `.showcase-feature.reverse`):
  1. **Live Scoring** → CTA "New Match" (`/game`), captura `/landing/scoring.png`
  2. **Tournaments** → CTA `/tournaments`, captura `/landing/tournaments.png`
  3. **Tournament Admin** → CTA `/admin/tournaments`, captura `/landing/admin.png`
  4. **Rankings** → CTA `/ranking`, captura `/landing/ranking.png`
  5. **My Stats** → CTA Mis Stats (login-gated), captura `/landing/mystats.png`
  6. **Leaderboards** → CTA `/leaderboards`, captura `/landing/leaderboards.png`
  - Cada bloque tiene: `.feature-text` (título, descripción, lista de bullets, botón CTA) + `.feature-screenshot` (componente `Screenshot.svelte`).
  - **Capturas (PNGs)**: Subir a `static/landing/` con los nombres `scoring.png`, `tournaments.png`, `admin.png`, `ranking.png`, `mystats.png`, `leaderboards.png`. Mientras no existan, `Screenshot.svelte` muestra un placeholder con icono y nombre de archivo. Cuando se suban, el `<img>` carga automáticamente y reemplaza el placeholder.
- **Final CTA (`.final-cta`)**: Título "Ready to play?", descripción, botón grande "New Match" (`.cta-button`).
- **Footer (`.footer`)**: Copyright + `PoweredByBadge`.

## 🖱️ Acciones Clave (Selectors)
Si necesitas interactuar con la página (tests o scraping):
| Acción | Selector CSS / Elemento | Resultado |
| :--- | :--- | :--- |
| **Empezar a jugar** | `[data-webmcp="btn-new-game"]` | Navega a `/game` (2 botones: hero y final CTA) |
| **Iniciar sesión** | `[data-webmcp="btn-login-modal"]` o componente interno de `<ProfileDropdown>` | Abre `<LoginModal>` |
| **Navegar a Torneos** | `[data-webmcp="link-tournaments"]` | Navega a `/tournaments` |
| **Navegar a Rankings** | `[data-webmcp="link-rankings"]` | Navega a `/ranking` |
| **Navegar a Mis Estadísticas**| `[data-webmcp="link-stats"]` | Navega a `/my-stats` (requiere login) |
| **Navegar a Leaderboards**| `[data-webmcp="link-leaderboards"]` | Navega a `/leaderboards` |
| **Scroll al showcase** | `.scroll-indicator` (click) | Scroll suave a `#showcase` |

## 🛠️ Notas de Implementación (Svelte)
- La página usa varios modales (`LoginModal`, `ProfileModal`, `WhatsNewModal`) que se cargan **lazy** (dynamic `import()` dentro de `{#await}`) y solo se mountan cuando su booleano (`showLogin`, `showProfile`, `showWhatsNew`) es true. Sus chunks se prefetchean en `requestIdleCallback` tras el primer paint — no los conviertas en imports estáticos, penaliza la carga inicial.
- **`LandingFeaturesCarousel.svelte`**: ya no se usa en la landing (se eliminó el layout 3-columnas). El componente sigue existiendo en `src/lib/components/` por si se quiere reutilizar, pero no se importa en `+page.svelte`.
- `currentUser` determina si ciertas acciones (como Mis Stats) están disponibles directamente o requieren login previo.
- **i18n**: La landing usa keys del namespace `landing_` (e.g. `landing_liveScoring_title`, `landing_admin_desc`, `landing_cta_title`). Añadidas a los 3 locale files (es/ca/en).
- **`Screenshot.svelte`**: Componente reutilizable (`src/lib/components/Screenshot.svelte`). Props: `path` (URL de la imagen), `label` (nombre del archivo para el placeholder), `icon` (tipo de icono del placeholder: `game`/`tournaments`/`admin`/`ranking`/`stats`/`leaderboards`), `alt`. Detecta carga/error del `<img>` por evento (`onload`/`onerror`) y muestra/oculta el placeholder. Renderiza placeholder por defecto durante SSR (`browser` check).
- **Estilos shadcn Button**: Las clases `quick-link`, `quick-link-icon`, `quick-link-label`, `feature-cta`, `cta-button`, `cta-button:hover/active`, `scroll-arrow` se aplican sobre componentes `<Button>` y `<ChevronDown>` (iconos externos/lucide). El compilador Svelte las marca como "unused CSS selector" si no se envuelven en `:global()` scoped. Por eso se definen como `.quick-links :global(.quick-link)`, `.feature-text :global(.feature-cta)`, `.final-cta :global(.cta-button)`, `.scroll-indicator :global(.scroll-arrow)`, etc.

## 💾 LocalStorage Global
- `theme`: Clave global e independiente que almacena la preferencia de tema visual (`light`, `dark`, `violet`, `violet-light`). Se expone en la raíz (`/`) pero afecta transversalmente a **toda la app** (el script bloqueante en `app.html` la usa antes de hidratar Svelte para evitar FOUC). No está dentro de `crokinoleGame` a propósito por razones de rendimiento y renderizado inicial.
