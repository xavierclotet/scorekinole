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
	<div class="update-toast">
		<div class="toast-indicator">
			<span class="pulse-ring"></span>
			<span class="pulse-dot"></span>
		</div>
		<span class="toast-message">{m.update_newVersionReady()}</span>
		<button class="toast-action" onclick={reload}>
			<RefreshCw size={13} strokeWidth={2.5} />
			{m.update_reload()}
		</button>
		<button class="toast-dismiss" onclick={dismiss} aria-label="Close">
			<X size={14} />
		</button>
	</div>
{/if}

<style>
	.update-toast {
		position: fixed;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.5rem 0.5rem 0.875rem;
		background: color-mix(in srgb, var(--card) 82%, transparent);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		color: var(--card-foreground);
		border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
		border-radius: 14px;
		box-shadow:
			0 8px 32px color-mix(in srgb, var(--foreground) 8%, transparent),
			0 2px 8px color-mix(in srgb, var(--foreground) 4%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--background) 15%, transparent);
		font-size: 0.8125rem;
		white-space: nowrap;
		animation: toastEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.toast-indicator {
		position: relative;
		width: 8px;
		height: 8px;
		flex-shrink: 0;
	}

	.pulse-dot {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: var(--primary);
	}

	.pulse-ring {
		position: absolute;
		inset: -3px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--primary) 30%, transparent);
		animation: pulse 2s ease-in-out infinite;
	}

	.toast-message {
		font-weight: 500;
		color: var(--foreground);
		letter-spacing: -0.01em;
	}

	.toast-action {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.375rem 0.75rem;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: 9px;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		font-family: inherit;
		letter-spacing: -0.01em;
	}

	.toast-action:hover {
		filter: brightness(1.12);
		transform: scale(1.02);
	}

	.toast-action:active {
		transform: scale(0.98);
	}

	.toast-dismiss {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.toast-dismiss:hover {
		background: color-mix(in srgb, var(--muted) 80%, transparent);
		color: var(--foreground);
	}

	.toast-dismiss:active {
		transform: scale(0.92);
	}

	@keyframes toastEnter {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(1rem) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0) scale(1);
		}
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.6;
			transform: scale(1);
		}
		50% {
			opacity: 0;
			transform: scale(2.2);
		}
	}
</style>
