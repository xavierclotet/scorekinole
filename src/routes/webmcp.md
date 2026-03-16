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
- **Features Columns (`.features-column` / `.mobile-features-carousel`)**:
  - Muestra un resumen de funcionalidades (Temporizador, Martillo, Modo Offline, etc.)
  - Grid de botones inferiores (Ranking, Live Tournaments, My Stats).

## 🖱️ Acciones Clave (Selectors)
Si necesitas interactuar con la página (tests o scraping):
| Acción | Selector CSS / Elemento | Resultado |
| :--- | :--- | :--- |
| **Empezar a jugar** | `[data-webmcp="btn-new-game"]` | Navega a `/game` |
| **Iniciar sesión** | `[data-webmcp="btn-login-modal"]` o componente interno de `<ProfileDropdown>` | Abre `<LoginModal>` |
| **Navegar a Rankings** | `[data-webmcp="link-rankings"]` | Navega a `/ranking` |
| **Navegar a Mis Estadísticas**| `[data-webmcp="link-stats"]` | Navega a `/my-stats` (requiere login) |

## 🛠️ Notas de Implementación (Svelte)
- La página usa varios modales (`LoginModal`, `ProfileModal`) que se renderizan al fondo pero se muestran vía booleanos (`showLogin`, `showProfile`).
- `currentUser` determina si ciertas acciones (como Mis Stats) están disponibles directamente o requieren login previo.

## 💾 LocalStorage Global
- `theme`: Clave global e independiente que almacena la preferencia de tema visual (`light`, `dark`, `violet`, `violet-light`). Se expone en la raíz (`/`) pero afecta transversalmente a **toda la app** (el script bloqueante en `app.html` la usa antes de hidratar Svelte para evitar FOUC). No está dentro de `crokinoleGame` a propósito por razones de rendimiento y renderizado inicial.
