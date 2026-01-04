<script lang="ts">
	import { onMount } from 'svelte';
	import { loadMatchState } from '$lib/stores/matchState';
	import { loadTeams } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { loadHistory } from '$lib/stores/history';
	import { initAuthListener } from '$lib/firebase/auth';
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
</script>

<slot />
