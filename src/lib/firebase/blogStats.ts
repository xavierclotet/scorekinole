/**
 * Contadores públicos de visualizaciones por post del blog.
 *
 * /blogStats/{slug} lo escribe la CF onPageViewCreated: cada visita a
 * /blog/<slug> suma 1. Lectura pública (solo números, sin PII). El
 * analytics nunca debe romper el blog: cualquier fallo devuelve {}.
 */

import { db, isFirebaseEnabled } from './config';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { browser } from '$app/environment';
import type { PageViewDailyStats } from '$lib/types/pageView';
import { sumBlogViews } from '$lib/utils/pageViewStats';

/** Mapa {slug: views} con todos los contadores del blog. */
export async function getBlogViews(): Promise<Record<string, number>> {
	if (!browser || !isFirebaseEnabled() || !db) return {};
	try {
		const snapshot = await getDocs(collection(db, 'blogStats'));
		const views: Record<string, number> = {};
		snapshot.forEach((docSnap) => {
			const v = docSnap.data().views;
			if (typeof v === 'number') views[docSnap.id] = v;
		});
		return views;
	} catch (error) {
		console.warn('Error getting blog views:', error);
		return {};
	}
}

/**
 * Backfill one-off (solo admin, botón en /admin/analytics): recalcula los
 * contadores desde /pageViewStats y SOBRESCRIBE /blogStats. Como cada visita
 * nueva también cae en pageViewStats, ejecutarlo con el trigger ya
 * desplegado no duplica nada.
 */
export async function backfillBlogStats(): Promise<Record<string, number>> {
	if (!browser || !isFirebaseEnabled() || !db) {
		throw new Error('Firebase no disponible');
	}

	const snapshot = await getDocs(collection(db, 'pageViewStats'));
	const stats: PageViewDailyStats[] = [];
	snapshot.forEach((docSnap) => {
		stats.push({ id: docSnap.id, ...docSnap.data() } as PageViewDailyStats);
	});

	const bySlug = sumBlogViews(stats);
	for (const [slug, views] of Object.entries(bySlug)) {
		await setDoc(doc(db, 'blogStats', slug), { views });
	}
	return bySlug;
}
