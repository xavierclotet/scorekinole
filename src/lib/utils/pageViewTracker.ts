import { browser } from '$app/environment';
import { isFirebaseEnabled } from '$lib/firebase/config';
import { currentUser } from '$lib/firebase/auth';
import { APP_VERSION } from '$lib/constants';
import { get } from 'svelte/store';
import type { PageView } from '$lib/types/pageView';

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

function normalizePath(path: string): string {
	return path
		.replace(/\/tournaments\/[^/]+/, '/tournaments/[id]')
		.replace(/\/$/, '') || '/';
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

function getPlatform(): 'web' | 'android' | 'ios' {
	try {
		const { Capacitor } = window as any;
		if (Capacitor?.getPlatform) {
			const p = Capacitor.getPlatform();
			if (p === 'android') return 'android';
			if (p === 'ios') return 'ios';
		}
	} catch { /* web fallback */ }
	return 'web';
}

export function trackPageView(path: string): void {
	if (!browser || !isFirebaseEnabled() || import.meta.env.DEV) return;

	const user = get(currentUser);
	if (!user) return;

	if (path === lastTrackedPath) return;

	if (debounceTimer) clearTimeout(debounceTimer);

	debounceTimer = setTimeout(() => {
		lastTrackedPath = path;
		sendPageView(path);
	}, DEBOUNCE_MS);
}

async function sendPageView(path: string): Promise<void> {
	const user = get(currentUser);
	if (!user) return;

	const pageView: Omit<PageView, 'id'> = {
		path,
		normalizedPath: normalizePath(path),
		timestamp: Date.now(),
		sessionId: getSessionId(),
		userId: user.id,
		userName: user.name || 'Unknown',
		platform: getPlatform(),
		deviceType: getDeviceType(),
		browserName: getBrowserName(),
		screenSize: `${window.innerWidth}x${window.innerHeight}`,
		language: navigator.language,
		appVersion: APP_VERSION
	};

	try {
		const { writePageView } = await import('$lib/firebase/pageViews');
		await writePageView(pageView);
	} catch (error) {
		console.warn('Failed to log page view:', error);
	}
}
