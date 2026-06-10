/**
 * Path helpers shared by the page-view tracker (write side), the daily-stats
 * aggregation keys (pageViews.ts) and the analytics dashboard (read side).
 *
 * normalizePath collapses dynamic segments into their TRACKED_ROUTES form.
 * encodePathKey turns a normalized path into a Firestore map key (no '/',
 * no '[' ']'). The encoding is lossy, so decodePathKey resolves known
 * tracked routes through a reverse map and only falls back to the heuristic
 * for unknown keys.
 */

import { TRACKED_ROUTES } from '$lib/types/pageView';

export function normalizePath(path: string): string {
	const clean = path.replace(/\/+$/, '') || '/';

	// Static admin tournament pages — must be matched BEFORE the dynamic
	// [id] pattern or they get misattributed to /admin/tournaments/[id]
	if (clean === '/admin/tournaments/create' || clean === '/admin/tournaments/import') {
		return clean;
	}
	if (/^\/admin\/tournaments\/[^/]+$/.test(clean)) return '/admin/tournaments/[id]';
	if (/^\/tournaments\/[^/]+$/.test(clean)) return '/tournaments/[id]';
	if (/^\/users\/[^/]+$/.test(clean)) return '/users/[id]';

	return clean;
}

/** Firestore map keys cannot contain '/' (and we strip brackets too). */
export function encodePathKey(normalizedPath: string): string {
	return normalizedPath.replace(/\//g, '_').replace(/[\[\]]/g, '') || '_root';
}

const KEY_TO_ROUTE = new Map<string, string>(TRACKED_ROUTES.map((r) => [encodePathKey(r), r]));

export function decodePathKey(pathKey: string): string {
	// Exact reverse for tracked routes (restores '[id]' and '/' correctly)
	const known = KEY_TO_ROUTE.get(pathKey);
	if (known) return known;

	if (pathKey === '_root') return '/';

	// Heuristic fallback for legacy/unknown keys. Lossy: a path segment with
	// a literal '_' cannot be distinguished from a '/' separator.
	return pathKey.replace(/_/g, '/').replace(/^\/\//, '/') || '/';
}
