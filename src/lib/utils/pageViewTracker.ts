import { browser } from '$app/environment';
import { isFirebaseEnabled } from '$lib/firebase/config';
import { currentUser } from '$lib/firebase/auth';
import { APP_VERSION } from '$lib/constants';
import { get } from 'svelte/store';
import { normalizePath } from './pageViewPaths';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastTrackedPath = '';
const DEBOUNCE_MS = 1500;

function getSessionId(): string {
	if (!browser) return '';
	let sid = sessionStorage.getItem('scorekinole_session_id');
	if (!sid) {
		sid = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
		sessionStorage.setItem('scorekinole_session_id', sid);
	}
	return sid;
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
	const ua = navigator.userAgent.toLowerCase();
	if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
	if (/mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile';
	return 'desktop';
}

function getBrowserName(): string {
	const ua = navigator.userAgent;
	if (ua.includes('Firefox')) return 'Firefox';
	if (ua.includes('SamsungBrowser')) return 'Samsung';
	if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
	if (ua.includes('Edg')) return 'Edge';
	if (ua.includes('Chrome')) return 'Chrome';
	if (ua.includes('Safari')) return 'Safari';
	return 'Other';
}

/**
 * Solo el referrer EXTERNO interesa: de dónde llega la gente al sitio. Una
 * navegación interna reportaría nuestro propio dominio y ensuciaría los datos.
 */
function getExternalReferrer(): string {
	const ref = document.referrer;
	if (!ref) return '';
	try {
		if (new URL(ref).hostname === window.location.hostname) return '';
	} catch {
		return '';
	}
	return ref.slice(0, 400);
}

/**
 * En DEV no se trackea: si no, navegar en local ensuciaría las métricas de
 * producción (dev apunta a la Firestore real, no a emuladores).
 */
export function trackPageView(path: string): void {
	if (!browser || !isFirebaseEnabled() || import.meta.env.DEV) return;

	if (path === lastTrackedPath) return;

	if (debounceTimer) clearTimeout(debounceTimer);

	debounceTimer = setTimeout(() => {
		lastTrackedPath = path;
		sendPageView(path);
	}, DEBOUNCE_MS);
}

/**
 * Las visitas van a la Cloud Function logPageView, no directamente a Firestore:
 * es el servidor el que ve la IP del visitante (la app es adapter-static, sin
 * SSR). Las reglas deniegan el create desde cliente, así que esta es la única vía.
 */
async function sendPageView(path: string): Promise<void> {
	const user = get(currentUser);

	const payload = {
		path,
		normalizedPath: normalizePath(path),
		sessionId: getSessionId(),
		deviceType: getDeviceType(),
		browserName: getBrowserName(),
		screenSize: `${window.innerWidth}x${window.innerHeight}`,
		language: navigator.language,
		appVersion: APP_VERSION,
		referrer: getExternalReferrer(),
		userId: user?.id ?? '',
		userName: user ? user.name || 'Unknown' : '',
		isAnonymous: !user
	};

	const url = `https://europe-west1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/logPageView`;

	try {
		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			// Sobrevive a que el usuario navegue fuera antes de que responda
			keepalive: true
		});
	} catch (error) {
		// El analytics nunca debe afectar a la navegación
		console.warn('Failed to log page view:', error);
	}
}
