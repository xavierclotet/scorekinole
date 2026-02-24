export interface PageView {
	id: string;
	path: string;
	normalizedPath: string;
	timestamp: number;
	sessionId: string;
	userId: string;
	userName: string;
	platform: 'web' | 'android' | 'ios';
	deviceType: 'mobile' | 'tablet' | 'desktop';
	browserName: string;
	screenSize: string;
	language: string;
	appVersion: string;
}

export interface PageViewDailyStats {
	id: string;
	date: string;
	totalViews: number;
	viewsByPath: Record<string, number>;
	viewsByDevice: Record<string, number>;
	viewsByPlatform: Record<string, number>;
	viewsByBrowser: Record<string, number>;
	viewsByUser: Record<string, number>;
	userNames: Record<string, string>;
}

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
	'/rankings',
	'/my-stats',
	'/tournaments',
	'/tournaments/[id]',
	'/admin',
	'/admin/analytics',
	'/admin/matches',
	'/admin/tournaments',
	'/admin/tournaments/create',
	'/admin/tournaments/import',
	'/admin/tournaments/[id]',
	'/admin/users'
] as const;
