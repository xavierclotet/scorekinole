<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { loadMatchState } from '$lib/stores/matchState';
	import { loadTeams } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { loadHistory } from '$lib/stores/history';
	import { initAuthListener, needsProfileSetup, currentUser } from '$lib/firebase/auth';
	import { saveUserProfile } from '$lib/firebase/userProfile';
	import { checkForUpdates, type VersionCheckResult } from '$lib/utils/versionCheck';
	import CompleteProfileModal from '$lib/components/CompleteProfileModal.svelte';
	import UpdateAvailableModal from '$lib/components/UpdateAvailableModal.svelte';
	import '../app.css';

	let updateInfo = $state<VersionCheckResult | null>(null);
	let showUpdateModal = $state(false);

	// Don't show update modal when playing a game
	let isOnGamePage = $derived($page.url.pathname === '/game');

	onMount(() => {
		// Load all persisted data
		gameSettings.load();
		loadTeams();
		loadMatchState();
		loadHistory();

		// Initialize Firebase auth listener
		initAuthListener();

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
			}
		} catch (error) {
			console.error('❌ Error completing profile setup:', error);
		}
	}
</script>

<slot />

<CompleteProfileModal
	isOpen={$needsProfileSetup}
	onsave={handleProfileComplete}
/>

{#if updateInfo}
	<UpdateAvailableModal
		isOpen={showUpdateModal}
		latestVersion={updateInfo.latestVersion || ''}
		downloadUrl={updateInfo.downloadUrl}
		onclose={() => showUpdateModal = false}
	/>
{/if}
