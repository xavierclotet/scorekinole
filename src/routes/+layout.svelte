<script lang="ts">
	import { onMount } from 'svelte';
	import { loadMatchState } from '$lib/stores/matchState';
	import { loadTeams } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { loadHistory } from '$lib/stores/history';
	import { initAuthListener, needsProfileSetup, currentUser } from '$lib/firebase/auth';
	import { saveUserProfile } from '$lib/firebase/userProfile';
	import CompleteProfileModal from '$lib/components/CompleteProfileModal.svelte';
	import '../app.css';

	onMount(() => {
		// Load all persisted data
		gameSettings.load();
		loadTeams();
		loadMatchState();
		loadHistory();

		// Initialize Firebase auth listener
		initAuthListener();
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
