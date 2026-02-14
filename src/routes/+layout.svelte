<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { loadMatchState } from '$lib/stores/matchState';
	import { loadTeams } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { loadHistory } from '$lib/stores/history';
	import { initAuthListener, needsProfileSetup, currentUser } from '$lib/firebase/auth';
	import { saveUserProfile } from '$lib/firebase/userProfile';
	import { checkForUpdates, type VersionCheckResult } from '$lib/utils/versionCheck';
	import { adminTheme } from '$lib/stores/theme';
	import CompleteProfileModal from '$lib/components/CompleteProfileModal.svelte';
	import UpdateAvailableModal from '$lib/components/UpdateAvailableModal.svelte';
	import '../app.css';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	// Sync theme to document root for portaled elements (dropdowns, modals, etc.)
	$effect(() => {
		if (browser) {
			document.documentElement.setAttribute('data-theme', $adminTheme);
		}
	});

	let updateInfo = $state<VersionCheckResult | null>(null);
	let showUpdateModal = $state(false);

	// Don't show update modal when playing a game
	let isOnGamePage = $derived(page.url.pathname === '/game');

	async function setupBackButtonHandler() {
		try {
			const { App } = await import('@capacitor/app');

			App.addListener('backButton', ({ canGoBack }) => {
				const currentPath = window.location.pathname;

				// If on home page, exit the app
				if (currentPath === '/' || currentPath === '') {
					App.exitApp();
					return;
				}

				// If browser has history, go back
				if (canGoBack || window.history.length > 1) {
					window.history.back();
				} else {
					// Fallback: go to home
					goto('/');
				}
			});
		} catch {
			// Not running on Capacitor (web browser), ignore
		}
	}

	onMount(() => {
		// Load all persisted data
		gameSettings.load();
		loadTeams();
		loadMatchState();
		loadHistory();

		// Initialize Firebase auth listener
		initAuthListener();

		// Setup Android back button handler
		setupBackButtonHandler();

		// Check for updates after a delay (non-intrusive)
		setTimeout(async () => {
			const result = await checkForUpdates();
			if (result.updateAvailable && result.latestVersion) {
				updateInfo = result;
				// Only show if not on game page
				if (!isOnGamePage) {
					showUpdateModal = true;
				}
			}
		}, 3000);
	});

	async function handleProfileComplete(playerName: string) {
		try {
			const result = await saveUserProfile(playerName);
			if (result) {
				// Update currentUser name and close modal
				currentUser.update(u => u ? { ...u, name: playerName } : null);
				needsProfileSetup.set(false);
				console.log('✅ Profile setup completed');
			} else {
				throw new Error('No se pudo guardar el perfil');
			}
		} catch (error) {
			console.error('❌ Error completing profile setup:', error);
			throw error; // Re-throw so modal can display error
		}
	}
</script>

{@render children()}

<CompleteProfileModal
	isOpen={$needsProfileSetup}
	onsave={handleProfileComplete}
/>

{#if updateInfo && showUpdateModal}
	<UpdateAvailableModal
		isOpen={true}
		latestVersion={updateInfo.latestVersion ?? ''}
		downloadUrl={updateInfo.downloadUrl}
		onclose={() => { showUpdateModal = false; }}
	/>
{/if}
