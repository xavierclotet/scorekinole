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

/** Total de visitas de un día para la audiencia pedida. */
export function viewsForAudience(stat: PageViewDailyStats, audience: Audience): number {
	const total = stat.totalViews || 0;
	if (audience === 'all') return total;

	// Los docs heredados no traen los escalares por audiencia. Su tráfico era
	// todo de registrados, así que el total ES el recuento de registrados.
	if (audience === 'anonymous') return stat.anonymousViews ?? 0;
	return stat.registeredViews ?? total;
}

const NEUTRAL_FLAG = '🏳️';

/** Emoji de bandera a partir del ISO-3166 alpha-2 (indicadores regionales). */
export function countryFlag(code: string): string {
	if (typeof code !== 'string') return NEUTRAL_FLAG;
	const upper = code.toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper) || upper === 'XX') return NEUTRAL_FLAG;

	return String.fromCodePoint(
		...[...upper].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65))
	);
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
