<script lang="ts">
	import { browser } from '$app/environment';
	import * as m from '$lib/paraglide/messages.js';

	const supported = browser && !!document.documentElement.requestFullscreen;

	let isFullscreen = $state(browser ? !!document.fullscreenElement : false);

	if (supported) {
		$effect(() => {
			function onchange() {
				isFullscreen = !!document.fullscreenElement;
			}

			document.addEventListener('fullscreenchange', onchange);
			return () => document.removeEventListener('fullscreenchange', onchange);
		});
	}

	function toggle() {
		if (isFullscreen) {
			document.exitFullscreen();
		} else {
			document.documentElement.requestFullscreen();
		}
	}
</script>

{#if supported}
	<button
		class="fullscreen-toggle"
		onclick={toggle}
		title={isFullscreen ? m.common_exitFullscreen() : m.common_fullscreen()}
	>
		{#if isFullscreen}
			<!-- Minimize icon -->
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="4 14 10 14 10 20"/>
				<polyline points="20 10 14 10 14 4"/>
				<line x1="14" y1="10" x2="21" y2="3"/>
				<line x1="3" y1="21" x2="10" y2="14"/>
			</svg>
		{:else}
			<!-- Maximize icon -->
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 3 21 3 21 9"/>
				<polyline points="9 21 3 21 3 15"/>
				<line x1="21" y1="3" x2="14" y2="10"/>
				<line x1="3" y1="21" x2="10" y2="14"/>
			</svg>
		{/if}
	</button>
{/if}

<style>
	.fullscreen-toggle {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.05);
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 50%;
		color: rgba(0, 0, 0, 0.6);
		cursor: pointer;
		transition: all 0.2s;
		padding: 0;
	}

	.fullscreen-toggle svg {
		width: 16px;
		height: 16px;
	}

	.fullscreen-toggle:hover {
		background: rgba(0, 0, 0, 0.1);
		color: #1a1a2e;
		border-color: rgba(0, 0, 0, 0.3);
	}

	.fullscreen-toggle:active {
		transform: scale(0.95);
	}

	/* Dark themes */
	:global(:is([data-theme='dark'], [data-theme='violet'])) .fullscreen-toggle {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.7);
	}

	:global(:is([data-theme='dark'], [data-theme='violet'])) .fullscreen-toggle:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
		border-color: rgba(255, 255, 255, 0.3);
	}
</style>
