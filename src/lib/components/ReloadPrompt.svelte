<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { RefreshCw } from '@lucide/svelte';

	interface Props {
		show: boolean;
	}

	let { show }: Props = $props();

	function reload() {
		window.location.reload();
	}
</script>

{#if show}
	<div class="reload-prompt">
		<span class="reload-text">{m.update_newVersionReady()}</span>
		<button class="reload-btn" onclick={reload}>
			<RefreshCw class="size-3.5" />
			{m.update_reload()}
		</button>
	</div>
{/if}

<style>
	.reload-prompt {
		position: fixed;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		background: var(--primary);
		color: var(--primary-foreground);
		border-radius: 9999px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		font-size: 0.8rem;
		animation: slideUp 0.3s ease-out;
	}

	.reload-text {
		font-weight: 500;
	}

	.reload-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.6rem;
		background: rgba(255, 255, 255, 0.2);
		color: inherit;
		border: none;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
		font-family: inherit;
	}

	.reload-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(1rem);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
</style>
