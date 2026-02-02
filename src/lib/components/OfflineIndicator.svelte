<script lang="ts">
	import { isOnline, connectionStatus } from '$lib/utils/networkStatus';
	import * as m from '$lib/paraglide/messages.js';

	let status = $derived($connectionStatus);

	let tooltip = $derived((() => {
		switch (status) {
			case 'offline': return m.common_offlineMode();
			case 'syncing': return m.sync_syncing();
			case 'synced': return m.sync_synced();
			case 'sync-error': return m.sync_error();
			default: return '';
		}
	})());
</script>

{#if status !== 'online'}
	<div
		class="connection-indicator"
		class:offline={status === 'offline'}
		class:syncing={status === 'syncing'}
		class:synced={status === 'synced'}
		class:error={status === 'sync-error'}
		title={tooltip}
	>
		{#if status === 'offline'}
			<!-- WiFi off icon -->
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="2" y1="2" x2="22" y2="22"/>
				<path d="M8.5 16.5a5 5 0 0 1 7 0"/>
				<path d="M2 8.82a15 15 0 0 1 4.17-2.65"/>
				<path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/>
				<path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/>
				<path d="M5 13a10 10 0 0 1 5.24-2.76"/>
				<line x1="12" y1="20" x2="12.01" y2="20"/>
			</svg>
		{:else if status === 'syncing'}
			<!-- Cloud sync icon -->
			<svg class="spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
				<path d="M21 3v5h-5"/>
			</svg>
		{:else if status === 'synced'}
			<!-- Cloud check icon -->
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
				<path d="m9 15 2 2 4-4"/>
			</svg>
		{:else if status === 'sync-error'}
			<!-- Cloud error icon -->
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
				<line x1="12" y1="8" x2="12" y2="12"/>
				<line x1="12" y1="16" x2="12.01" y2="16"/>
			</svg>
		{/if}
	</div>
{/if}

<style>
	.connection-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 6px;
		cursor: help;
		transition: opacity 0.3s ease;
	}

	.offline {
		color: rgba(251, 191, 36, 0.85);
	}

	.syncing {
		color: rgba(96, 165, 250, 0.9);
	}

	.synced {
		color: rgba(74, 222, 128, 0.9);
		animation: fade-out 2s ease-out 1s forwards;
	}

	.error {
		color: rgba(248, 113, 113, 0.9);
	}

	@keyframes fade-out {
		to {
			opacity: 0;
		}
	}

	.spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 480px) {
		.connection-indicator {
			width: 28px;
			height: 28px;
		}
		.connection-indicator svg {
			width: 13px;
			height: 13px;
		}
	}

	@media (max-width: 380px) {
		.connection-indicator {
			width: 26px;
			height: 26px;
		}
		.connection-indicator svg {
			width: 12px;
			height: 12px;
		}
	}
</style>
