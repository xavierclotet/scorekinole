import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { isAdmin } from './admin';
import type { PageView, PageViewDailyStats, PaginatedPageViewsResult } from '$lib/types/pageView';
import {
	collection,
	addDoc,
	getDocs,
	getCountFromServer,
	doc,
	setDoc,
	updateDoc,
	query,
	where,
	orderBy,
	limit,
	startAfter,
	serverTimestamp,
	increment,
	type QueryDocumentSnapshot,
	type DocumentData
} from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Write a page view to Firestore + update daily aggregation
 */
export async function writePageView(pageView: Omit<PageView, 'id'>): Promise<void> {
	if (!browser || !isFirebaseEnabled() || !db) return;

	try {
		// Write raw page view
		await addDoc(collection(db, 'pageViews'), {
			...pageView,
			createdAt: serverTimestamp()
		});

		// Update daily aggregation
		const dateKey = new Date(pageView.timestamp).toISOString().split('T')[0];
		const pathKey = pageView.normalizedPath.replace(/\//g, '_').replace(/[\[\]]/g, '') || '_root';
		const statsDocRef = doc(db, 'pageViewStats', dateKey);

		// setDoc with merge creates/updates top-level fields (does NOT support dot-notation as field paths)
		await setDoc(statsDocRef, {
			date: dateKey,
			totalViews: increment(1),
			updatedAt: serverTimestamp()
		}, { merge: true });

		// updateDoc supports dot-notation for nested map fields
		const userKey = pageView.userId.replace(/\./g, '_');
		await updateDoc(statsDocRef, {
			[`viewsByPath.${pathKey}`]: increment(1),
			[`viewsByDevice.${pageView.deviceType}`]: increment(1),
			[`viewsByPlatform.${pageView.platform}`]: increment(1),
			[`viewsByBrowser.${pageView.browserName}`]: increment(1),
			[`viewsByUser.${userKey}`]: increment(1),
			[`userNames.${userKey}`]: pageView.userName
		});
	} catch (error) {
		console.warn('Failed to write page view:', error);
	}
}

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
