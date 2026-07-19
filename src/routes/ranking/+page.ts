// Prerender the ranking page so Googlebot receives real HTML with the Spanish
// title/description/intro immediately (SEO). The player table itself is hydrated
// client-side from Firestore after load — the prerendered shell renders the
// loading state, which is fine: the indexable keyword content lives in the
// head + intro, not the live rows.
export const prerender = true;
