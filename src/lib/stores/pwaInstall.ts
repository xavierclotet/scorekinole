import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const canInstall = writable(false);

let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// iOS detection: Safari on iOS, not already in standalone mode
function detectIOSSafari(): boolean {
	if (!browser) return false;
	const ua = navigator.userAgent;
	const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	const isStandalone = ('standalone' in navigator && (navigator as any).standalone) || window.matchMedia('(display-mode: standalone)').matches;
	return isIOS && !isStandalone;
}

export const isIOSSafari = writable(false);
export const showIOSInstallBanner = writable(false);

const IOS_INSTALL_DISMISSED_KEY = 'scorekinole_ios_install_dismissed';

if (browser) {
	// Standard PWA install (Chrome, Edge, Android)
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		deferredPrompt = e as BeforeInstallPromptEvent;
		canInstall.set(true);
	});

	window.addEventListener('appinstalled', () => {
		canInstall.set(false);
		deferredPrompt = null;
	});

	// iOS Safari detection
	if (detectIOSSafari()) {
		isIOSSafari.set(true);
		const dismissed = localStorage.getItem(IOS_INSTALL_DISMISSED_KEY);
		if (!dismissed) {
			showIOSInstallBanner.set(true);
		}
	}
}

export async function triggerInstall(): Promise<boolean> {
	if (!deferredPrompt) return false;
	deferredPrompt.prompt();
	const result = await deferredPrompt.userChoice;
	deferredPrompt = null;
	canInstall.set(false);
	return result.outcome === 'accepted';
}

export function dismissIOSInstallBanner() {
	showIOSInstallBanner.set(false);
	if (browser) {
		localStorage.setItem(IOS_INSTALL_DISMISSED_KEY, '1');
	}
}
