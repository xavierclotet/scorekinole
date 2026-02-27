import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const canInstall = writable(false);

let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

if (browser) {
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		deferredPrompt = e as BeforeInstallPromptEvent;
		canInstall.set(true);
	});

	window.addEventListener('appinstalled', () => {
		canInstall.set(false);
		deferredPrompt = null;
	});
}

export async function triggerInstall(): Promise<boolean> {
	if (!deferredPrompt) return false;
	deferredPrompt.prompt();
	const result = await deferredPrompt.userChoice;
	deferredPrompt = null;
	canInstall.set(false);
	return result.outcome === 'accepted';
}
