/**
 * Lectura de los agregados de /pageViewStats con filtro de audiencia.
 *
 * La complejidad aquí es una sola: los mapas de desglose existen en dos
 * formas. Los docs nuevos van partidos en `{ reg, anon }`; los anteriores al
 * tracking de anónimos son planos. Un mapa plano se interpreta como `reg`,
 * que es literalmente lo que era: entonces solo se contaban usuarios logueados.
 */

import type { Audience, PageViewDailyStats } from '$lib/types/pageView';

function isNumberMap(value: unknown): value is Record<string, number> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addInto(target: Record<string, number>, source: unknown): void {
	if (!isNumberMap(source)) return;
	for (const [key, count] of Object.entries(source)) {
		if (typeof count === 'number') target[key] = (target[key] || 0) + count;
	}
}

/** Aplana un mapa de desglose de un solo día según la audiencia pedida. */
export function readBranch(map: unknown, audience: Audience): Record<string, number> {
	if (!isNumberMap(map)) return {};

	const hasSplit = 'reg' in map || 'anon' in map;
	const out: Record<string, number> = {};

	if (!hasSplit) {
		// Formato heredado: todo el tráfico era de usuarios registrados
		if (audience !== 'anonymous') addInto(out, map);
		return out;
	}

	const split = map as { reg?: unknown; anon?: unknown };
	if (audience !== 'anonymous') addInto(out, split.reg);
	if (audience !== 'registered') addInto(out, split.anon);
	return out;
}

/** Agrega un mismo campo de desglose a lo largo de varios días. */
export function sumBranches(
	stats: PageViewDailyStats[],
	field: keyof PageViewDailyStats,
	audience: Audience
): Record<string, number> {
	const totals: Record<string, number> = {};
	for (const stat of stats) {
		addInto(totals, readBranch(stat[field], audience));
	}
	return totals;
}

/** Prefijo de las claves de viewsByPath que corresponden a posts del blog. */
const BLOG_PATH_KEY_PREFIX = '_blog_';

/**
 * Total de visitas por slug de post a lo largo de varios días, para el
 * backfill de /blogStats. Suma ambas audiencias: los mapas planos antiguos
 * (solo registrados) y las ramas reg/anon nuevas.
 */
export function sumBlogViews(stats: PageViewDailyStats[]): Record<string, number> {
	const byPath = sumBranches(stats, 'viewsByPath', 'all');
	const bySlug: Record<string, number> = {};
	for (const [key, count] of Object.entries(byPath)) {
		if (!key.startsWith(BLOG_PATH_KEY_PREFIX)) continue;
		const slug = key.slice(BLOG_PATH_KEY_PREFIX.length);
		if (slug) bySlug[slug] = (bySlug[slug] || 0) + count;
	}
	return bySlug;
}

/** Total de visitas de un día para la audiencia pedida. */
export function viewsForAudience(stat: PageViewDailyStats, audience: Audience): number {
	const total = stat.totalViews || 0;
	if (audience === 'all') return total;

	// Los docs heredados no traen los escalares por audiencia. Su tráfico era
	// todo de registrados, así que el total ES el recuento de registrados.
	if (audience === 'anonymous') return stat.anonymousViews ?? 0;
	return stat.registeredViews ?? total;
}

/**
 * URL de la bandera en flagcdn.com (Flagpedia, gratuito y sin API key).
 * Se usa imagen y no el emoji de bandera porque Windows no renderiza los
 * regional indicators: 🇺🇸 degrada a las letras "US" en Segoe UI Emoji.
 * null cuando no hay país resuelto ('XX', vacío o código inválido).
 */
export function countryFlagUrl(code: string, width: 20 | 40 = 20): string | null {
	if (typeof code !== 'string') return null;
	const upper = code.toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper) || upper === 'XX') return null;
	return `https://flagcdn.com/w${width}/${upper.toLowerCase()}.png`;
}

/**
 * Nombre del país en español vía Intl.DisplayNames (sin dependencias).
 * 'XX' → 'Desconocido' (mismo literal que escribe el backend en UNKNOWN_GEO).
 */
export function countryName(code: string): string {
	if (typeof code !== 'string' || !/^[A-Za-z]{2}$/.test(code)) return code || '—';
	const upper = code.toUpperCase();
	if (upper === 'XX') return 'Desconocido';
	try {
		return new Intl.DisplayNames(['es'], { type: 'region' }).of(upper) ?? upper;
	} catch {
		return upper;
	}
}

/** Host del referrer, para mostrar en la tabla. '—' si es directo. */
export function formatReferrer(referrer: string): string {
	if (!referrer) return '—';
	try {
		return new URL(referrer).hostname.replace(/^www\./, '');
	} catch {
		return '—';
	}
}
