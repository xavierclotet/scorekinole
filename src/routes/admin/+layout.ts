// Admin pages are auth-gated, client-only dashboards: Firebase auth and all
// admin state live in the browser, and there is no SEO value. Server-rendering
// them only yields a loading spinner and is fragile — any browser-only access in
// the render path throws on the server, producing a 500 on a hard refresh (F5).
// Rendering client-side only makes F5 serve the SPA shell and hydrate normally.
export const ssr = false;
