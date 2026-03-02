<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { loadMatchState } from '$lib/stores/matchState';
	import { loadTeams } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { initAuthListener, needsProfileSetup, currentUser, emailVerificationPending } from '$lib/firebase/auth';
	import { saveUserProfile } from '$lib/firebase/userProfile';
	import { isFirebaseEnabled } from '$lib/firebase/config';
	import { refreshFCMTokenIfNeeded } from '$lib/firebase/messaging';
	import { adminTheme } from '$lib/stores/theme';
	import { trackPageView } from '$lib/utils/pageViewTracker';
	import CompleteProfileModal from '$lib/components/CompleteProfileModal.svelte';
	import EmailVerificationBanner from '$lib/components/EmailVerificationBanner.svelte';
	import ReloadPrompt from '$lib/components/ReloadPrompt.svelte';
	import '../app.css';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let showReloadPrompt = $state(false);

	// Pages where auto-reload is NOT safe (user might lose work)
	const PROTECTED_PATHS = ['/game', '/admin'];

	function isSafeToReload() {
		return !PROTECTED_PATHS.some((p) => window.location.pathname.startsWith(p));
	}

	// Sync theme to document root for portaled elements (dropdowns, modals, etc.)
	$effect(() => {
		if (browser) {
			document.documentElement.setAttribute('data-theme', $adminTheme);
		}
	});

	// Track page views on route changes
	$effect(() => {
		if (browser) {
			trackPageView(page.url.pathname);
		}
	});

	// Auto-reload when navigating from a protected page to a safe page after SW update
	$effect(() => {
		if (showReloadPrompt && browser) {
			const path = page.url.pathname;
			if (!PROTECTED_PATHS.some((p) => path.startsWith(p))) {
				window.location.reload();
			}
		}
	});

	// Refresh FCM token on app load (handles token rotation)
	$effect(() => {
		if (!browser || !$currentUser || !isFirebaseEnabled()) return;
		if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
		refreshFCMTokenIfNeeded();
	});


	onMount(() => {
		// Load all persisted data
		gameSettings.load();
		loadTeams();
		loadMatchState();

		// Initialize Firebase auth listener (also handles user language from profile)
		initAuthListener();

		// Listen for navigation requests from service worker (push notification clicks)
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.addEventListener('message', (event) => {
				if (event.data?.type === 'PUSH_NAVIGATE' && event.data?.url) {
					const target = event.data.url as string;
					const current = page.url.pathname + page.url.search;
					if (current !== target) {
						goto(target);
					} else {
						// Already on target URL (e.g., SW navigate() already updated it,
						// or page store was stale). Dispatch event so the /game page
						// can re-process the deep-link key directly.
						window.dispatchEvent(new CustomEvent('push-deep-link', { detail: { url: target } }));
					}
				}
			});
		}

		// Register service worker and auto-update
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').then((registration) => {
				// Check for updates immediately, then every 10 minutes
				registration.update().catch(() => {});
				setInterval(() => registration.update().catch(() => {}), 10 * 60 * 1000);

				// Also check when user returns to the app
				document.addEventListener('visibilitychange', () => {
					if (document.visibilityState === 'visible') {
						registration.update().catch(() => {});
					}
				});

				registration.addEventListener('updatefound', () => {
					const newWorker = registration.installing;
					if (!newWorker) return;

					const handleStateChange = () => {
						if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
							if (isSafeToReload()) {
								window.location.reload();
							} else {
								// Show prompt instead — don't interrupt active game/admin
								showReloadPrompt = true;
							}
						}
					};

					newWorker.addEventListener('statechange', handleStateChange);
					// Check immediately in case skipWaiting() already activated
					handleStateChange();
				});
			});
		}
	});

	async function handleProfileComplete(playerName: string) {
		try {
			const result = await saveUserProfile(playerName);
			if (result) {
				// Update currentUser name and close modal
				currentUser.update(u => u ? { ...u, name: playerName } : null);
				needsProfileSetup.set(false);
				console.log('Profile setup completed');
			} else {
				throw new Error('No se pudo guardar el perfil');
			}
		} catch (error) {
			console.error('Error completing profile setup:', error);
			throw error; // Re-throw so modal can display error
		}
	}
</script>

{#if $emailVerificationPending && $currentUser}
	<EmailVerificationBanner />
{/if}

{@render children()}

<CompleteProfileModal
	isOpen={$needsProfileSetup}
	onsave={handleProfileComplete}
/>

<ReloadPrompt show={showReloadPrompt} />
