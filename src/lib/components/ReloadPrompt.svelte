<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		show: boolean;
	}

	let { show }: Props = $props();
	let dismissed = $state(false);

	function reload() {
		window.location.reload();
	}

	function dismiss() {
		dismissed = true;
	}
</script>

{#if show && !dismissed}
	<div class="reload-toast">
		<span class="reload-text">{m.update_newVersionReady()}</span>
		<button class="reload-btn" onclick={reload}>
			<RefreshCw size={13} />
			{m.update_reload()}
		</button>
		<button class="dismiss-btn" onclick={dismiss} aria-label="Close">
			<X size={14} />
		</button>
	</div>
{/if}

<style>
	.reload-toast {
		position: fixed;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.5rem 0.5rem 0.85rem;
		background: var(--card);
		color: var(--card-foreground);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow:
			0 4px 24px rgba(0, 0, 0, 0.1),
			0 1px 4px rgba(0, 0, 0, 0.06);
		font-size: 0.78rem;
		white-space: nowrap;
		animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.reload-text {
		font-weight: 500;
		color: var(--foreground);
	}

	.reload-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.65rem;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: 8px;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}

	.reload-btn:hover {
		filter: brightness(1.1);
	}

	.dismiss-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.dismiss-btn:hover {
		background: var(--muted);
		color: var(--foreground);
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(0.75rem);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
</style>
