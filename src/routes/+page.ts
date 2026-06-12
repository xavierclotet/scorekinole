// Prerender the landing page: the built www/index.html contains the full
// landing markup, so first paint doesn't wait for the JS bundle to boot.
// All other routes stay SPA (served from the 200.html fallback shell).
export const prerender = true;
