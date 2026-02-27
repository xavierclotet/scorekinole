<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { loadMatchState } from '$lib/stores/matchState';
	import { loadTeams } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { initAuthListener, needsProfileSetup, currentUser } from '$lib/firebase/auth';
	import { saveUserProfile } from '$lib/firebase/userProfile';
	import { adminTheme } from '$lib/stores/theme';
	import { trackPageView } from '$lib/utils/pageViewTracker';
	import CompleteProfileModal from '$lib/components/CompleteProfileModal.svelte';
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


	onMount(() => {
		// Load all persisted data
		gameSettings.load();
		loadTeams();
		loadMatchState();

		// Initialize Firebase auth listener (also handles user language from profile)
		initAuthListener();

		// Register service worker and auto-update
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').then((registration) => {
				// Check for updates immediately, then every 10 minutes
				registration.update();
				setInterval(() => registration.update(), 10 * 60 * 1000);

				// Also check when user returns to the app
				document.addEventListener('visibilitychange', () => {
					if (document.visibilityState === 'visible') {
						registration.update();
					}
				});

				registration.addEventListener('updatefound', () => {
					const newWorker = registration.installing;
					if (!newWorker) return;

					newWorker.addEventListener('statechange', () => {
						if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
							if (isSafeToReload()) {
								window.location.reload();
							} else {
								// Show prompt instead — don't interrupt active game/admin
								showReloadPrompt = true;
							}
						}
					});
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

{@render children()}

<CompleteProfileModal
	isOpen={$needsProfileSetup}
	onsave={handleProfileComplete}
/>

<ReloadPrompt show={showReloadPrompt} />

