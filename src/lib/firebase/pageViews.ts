import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { isAdmin } from './admin';
import type {
	PageView,
	PageViewDailyStats,
	PaginatedPageViewsResult,
	Audience
} from '$lib/types/pageView';
import {
	collection,
	getDocs,
	getCountFromServer,
	onSnapshot,
	query,
	where,
	orderBy,
	limit,
	startAfter,
	type QueryDocumentSnapshot,
	type DocumentData,
	type Unsubscribe
} from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { localDayRange } from '$lib/utils/analyticsDay';

/**
 * Get page views with pagination and optional filters (admin only)
 */
export async function getPageViewsPaginated(
	pageSize: number = 20,
	lastDocument: QueryDocumentSnapshot<DocumentData> | null = null,
	filters?: {
		dateFrom?: number;
		dateTo?: number;
		normalizedPath?: string;
		audience?: Audience;
	}
): Promise<PaginatedPageViewsResult> {
	const emptyResult: PaginatedPageViewsResult = {
		pageViews: [],
		totalCount: 0,
		lastDoc: null,
		hasMore: false
	};

	if (!browser || !isFirebaseEnabled() || !db) return emptyResult;

	const user = get(currentUser);
	if (!user) return emptyResult;

	const adminStatus = await isAdmin();
	if (!adminStatus) return emptyResult;

	try {
		const pageViewsRef = collection(db, 'pageViews');
		const constraints: any[] = [];

		if (filters?.dateFrom) {
			constraints.push(where('timestamp', '>=', filters.dateFrom));
		}
		if (filters?.dateTo) {
			constraints.push(where('timestamp', '<=', filters.dateTo));
		}
		if (filters?.normalizedPath && filters.normalizedPath !== 'all') {
			constraints.push(where('normalizedPath', '==', filters.normalizedPath));
		}
		if (filters?.audience === 'anonymous') {
			constraints.push(where('isAnonymous', '==', true));
		} else if (filters?.audience === 'registered') {
			constraints.push(where('isAnonymous', '==', false));
		}

		constraints.push(orderBy('timestamp', 'desc'));

		// Count query (without pagination)
		const countQ = query(pageViewsRef, ...constraints);
		const countSnapshot = await getCountFromServer(countQ);
		const totalCount = countSnapshot.data().count;

		// Paginated query
		if (lastDocument) {
			constraints.push(startAfter(lastDocument));
		}
		constraints.push(limit(pageSize));

		const q = query(pageViewsRef, ...constraints);
		const snapshot = await getDocs(q);

		const pageViews: PageView[] = [];
		snapshot.forEach((docSnap) => {
			pageViews.push({ id: docSnap.id, ...docSnap.data() } as PageView);
		});

		return {
			pageViews,
			totalCount,
			lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
			hasMore: snapshot.docs.length === pageSize
		};
	} catch (error) {
		console.error('Error getting page views:', error);
		return emptyResult;
	}
}

/**
 * Get daily aggregated stats for charts (admin only)
 */
export async function getDailyStats(
	dateFrom: string,
	dateTo: string
): Promise<PageViewDailyStats[]> {
	if (!browser || !isFirebaseEnabled() || !db) return [];

	const user = get(currentUser);
	if (!user) return [];

	const adminStatus = await isAdmin();
	if (!adminStatus) return [];

	try {
		const statsRef = collection(db, 'pageViewStats');
		const q = query(
			statsRef,
			where('date', '>=', dateFrom),
			where('date', '<=', dateTo),
			orderBy('date', 'asc')
		);

		const snapshot = await getDocs(q);
		const stats: PageViewDailyStats[] = [];
		snapshot.forEach((docSnap) => {
			stats.push({ id: docSnap.id, ...docSnap.data() } as PageViewDailyStats);
		});

		return stats;
	} catch (error) {
		console.error('Error getting daily stats:', error);
		return [];
	}
}

/** Query compartida de la vista de día: visitas crudas del rango local del día. */
function dayQuery(date: string) {
	const { start, end } = localDayRange(date);
	return query(
		collection(db!, 'pageViews'),
		where('timestamp', '>=', start),
		where('timestamp', '<', end),
		orderBy('timestamp', 'asc')
	);
}

/**
 * Visitas crudas de un día (admin). One-shot: para días pasados, donde un
 * listener no aportaría nada.
 */
export async function getPageViewsForDay(date: string): Promise<PageView[]> {
	if (!browser || !isFirebaseEnabled() || !db) return [];

	const user = get(currentUser);
	if (!user) return [];

	const adminStatus = await isAdmin();
	if (!adminStatus) return [];

	try {
		const snapshot = await getDocs(dayQuery(date));
		return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PageView);
	} catch (error) {
		console.error('Error getting day page views:', error);
		return [];
	}
}

/**
 * Visitas de un día en tiempo real (admin), para el modo "hoy en directo".
 * El chequeo de admin es async: si el caller desuscribe antes de que termine,
 * el listener nunca llega a abrirse.
 */
export function subscribeToPageViewsForDay(
	date: string,
	callback: (views: PageView[]) => void
): Unsubscribe {
	let unsubscribe: Unsubscribe | null = null;
	let cancelled = false;

	(async () => {
		if (!browser || !isFirebaseEnabled() || !db) return;

		const user = get(currentUser);
		if (!user) return;

		const adminStatus = await isAdmin();
		if (!adminStatus || cancelled) return;

		unsubscribe = onSnapshot(
			dayQuery(date),
			(snapshot) => {
				callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PageView));
			},
			(error) => {
				console.error('Error in day page views listener:', error);
			}
		);
	})();

	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}
