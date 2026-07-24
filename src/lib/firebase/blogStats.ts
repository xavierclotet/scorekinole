/**
 * Contadores públicos de visualizaciones por post del blog.
 *
 * /blogStats/{slug} lo escribe la CF onPageViewCreated: cada visita a
 * /blog/<slug> suma 1. Lectura pública (solo números, sin PII). El
 * analytics nunca debe romper el blog: cualquier fallo devuelve {}.
 */

import { db, isFirebaseEnabled } from './config';
import { collection, getDocs } from 'firebase/firestore';
import { browser } from '$app/environment';

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
