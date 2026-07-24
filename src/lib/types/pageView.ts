/**
 * Mapa de desglose de /pageViewStats.
 *
 * Los docs nuevos van partidos en ramas reg/anon para que el filtro de
 * audiencia del dashboard funcione sobre los gráficos. Los docs anteriores a
 * esa feature son planos y se leen como si fueran `reg` — correcto, porque
 * entonces solo se trackeaba a usuarios con sesión iniciada.
 */
export type SplitMap =
	| Record<string, number>
	| { reg?: Record<string, number>; anon?: Record<string, number> };

export interface PageView {
	id: string;
	path: string;
	normalizedPath: string;
	timestamp: number;
	sessionId: string;
	/** Cadena vacía en visitas anónimas */
	userId: string;
	/** Cadena vacía en visitas anónimas */
	userName: string;
	isAnonymous: boolean;
	platform: 'web' | 'android' | 'ios';
	deviceType: 'mobile' | 'tablet' | 'desktop';
	browserName: string;
	screenSize: string;
	language: string;
	appVersion: string;
	/** Capturada en servidor por logPageView; se purga a los 90 días */
	ip: string;
	/** ISO-3166 alpha-2, 'XX' si no se pudo resolver */
	countryCode: string;
	country: string;
	city: string;
	/** Cadena vacía si la visita es directa o la navegación es interna */
	referrer: string;
}

export interface PageViewDailyStats {
	id: string;
	date: string;
	totalViews: number;
	/** Ausente en docs anteriores al tracking de anónimos */
	registeredViews?: number;
	/** Ausente en docs anteriores al tracking de anónimos */
	anonymousViews?: number;
	viewsByPath: SplitMap;
	viewsByDevice: SplitMap;
	viewsByPlatform: SplitMap;
	viewsByBrowser: SplitMap;
	viewsByCountry: SplitMap;
	viewsByUser: Record<string, number>;
	userNames: Record<string, string>;
}

export type Audience = 'all' | 'registered' | 'anonymous';

export interface PageViewFilters {
	dateFrom: number | null;
	dateTo: number | null;
	normalizedPath: string;
}

export interface PaginatedPageViewsResult {
	pageViews: PageView[];
	totalCount: number;
	lastDoc: any;
	hasMore: boolean;
}

export const TRACKED_ROUTES = [
	'/',
	'/game',
	'/join',
	'/ranking',
	'/my-stats',
	'/users/[id]',
	'/tournaments',
	'/tournaments/[id]',
	'/admin',
	'/admin/analytics',
	'/admin/analytics/[date]',
	'/admin/matches',
	'/admin/tournaments',
	'/admin/tournaments/create',
	'/admin/tournaments/import',
	'/admin/tournaments/[id]',
	'/admin/users'
] as const;
