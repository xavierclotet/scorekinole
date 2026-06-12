<script lang="ts">
	import { onMount } from 'svelte';
	import { isStorageAvailable } from '$lib/utils/safeStorage';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import X from '@lucide/svelte/icons/x';
	import * as m from '$lib/paraglide/messages.js';

	let blocked = $state(false);
	let dismissed = $state(false);

	onMount(() => {
		blocked = !isStorageAvailable();
	});
</script>

{#if blocked && !dismissed}
	<div class="storage-banner" role="alert">
		<div class="storage-banner-icon">
			<TriangleAlert size={18} />
		</div>
		<div class="storage-banner-text">
			<strong>{m.common_storageBlockedTitle()}</strong>
			<span>{m.common_storageBlockedMessage()}</span>
		</div>
		<button
			class="storage-banner-close"
			onclick={() => (dismissed = true)}
			aria-label={m.common_close()}
		>
			<X size={16} />
		</button>
	</div>
{/if}

<style>
	/* Deliberately NO theme vars (oklch/color-mix): this banner targets old or
	   locked-down browsers where modern color functions may not resolve. */
	.storage-banner {
		position: fixed;
		top: calc(env(safe-area-inset-top, 0px) + 12px);
		left: 12px;
		right: 12px;
		z-index: 10000;
		margin: 0 auto;
		max-width: 460px;
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 14px;
		background: #fffbeb;
		border: 1px solid #f59e0b;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
		color: #78350f;
		animation: storage-banner-in 0.3s ease-out;
	}

	@keyframes storage-banner-in {
		from {
			opacity: 0;
			transform: translateY(-12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.storage-banner-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: #fef3c7;
		color: #b45309;
	}

	.storage-banner-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.storage-banner-text strong {
		font-size: 0.85rem;
		font-weight: 700;
		line-height: 1.3;
	}

	.storage-banner-text span {
		font-size: 0.78rem;
		line-height: 1.45;
		color: #92400e;
	}

	.storage-banner-close {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: none;
		background: #fef3c7;
		color: #92400e;
		cursor: pointer;
		padding: 0;
		transition: background 0.15s ease;
	}

	.storage-banner-close:hover {
		background: #fde68a;
	}
</style>
