<script lang="ts">
	import { theme } from '$lib/stores/theme';

	interface Props {
		message?: string;
		visible?: boolean;
		duration?: number;
		type?: 'success' | 'error' | 'info' | 'warning';
		onClose?: () => void;
	}

	let {
		message = '',
		visible = $bindable(false),
		duration = 3000,
		type = 'info',
		onClose = () => {}
	}: Props = $props();

	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let isExiting = $state(false);

	$effect(() => {
		if (visible) {
			isExiting = false;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			timeoutId = setTimeout(() => {
				isExiting = true;
				setTimeout(() => {
					visible = false;
					isExiting = false;
					onClose();
				}, 200);
			}, duration);
		}
	});

	function handleDismiss() {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		isExiting = true;
		setTimeout(() => {
			visible = false;
			isExiting = false;
			onClose();
		}, 200);
	}

	function getIcon(t: string): string {
		switch (t) {
			case 'success': return '✓';
			case 'error': return '✕';
			case 'warning': return '!';
			default: return 'i';
		}
	}
</script>

{#if visible}
	<div
		class="toast-container"
		class:exit={isExiting}
		data-theme={$theme}
		role="alert"
		aria-live="polite"
	>
		<div class="toast toast-{type}">
			<div class="toast-icon-wrapper toast-icon-{type}">
				<span class="toast-icon">{getIcon(type)}</span>
			</div>
			<span class="toast-message">{message}</span>
			<button
				class="toast-close"
				onclick={handleDismiss}
				aria-label="Cerrar notificación"
			>
				<svg width="12" height="12" viewBox="0 0 14 14" fill="none">
					<path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				</svg>
			</button>
		</div>
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9999;
		width: calc(100% - 1.5rem);
		max-width: 360px;
		animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	.toast-container.exit {
		animation: slideDown 0.2s ease-in forwards;
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

	@keyframes slideDown {
		from {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
		to {
			opacity: 0;
			transform: translateX(-50%) translateY(1rem);
		}
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.625rem 0.875rem;
		background: var(--card);
		border-radius: 10px;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.2),
			0 10px 15px -3px rgba(0, 0, 0, 0.3),
			0 0 0 1px var(--border);
	}

	.toast-success {
		border-left: 4px solid #22c55e;
	}

	.toast-error {
		border-left: 4px solid #ef4444;
	}

	.toast-warning {
		border-left: 4px solid #f59e0b;
	}

	.toast-info {
		border-left: 4px solid var(--primary);
	}

	.toast-icon-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.toast-icon-success {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}

	.toast-icon-error {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}

	.toast-icon-warning {
		background: rgba(245, 158, 11, 0.15);
		color: #f59e0b;
	}

	.toast-icon-info {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
	}

	.toast-icon {
		font-size: 0.7rem;
		font-weight: 700;
		font-family: system-ui, -apple-system, sans-serif;
		line-height: 1;
	}

	.toast-message {
		flex: 1;
		color: var(--foreground);
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1.3;
		letter-spacing: -0.01em;
	}

	.toast-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 5px;
		color: var(--muted-foreground);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.toast-close:hover {
		background: var(--accent);
		color: var(--foreground);
	}

	.toast-close:active {
		transform: scale(0.95);
	}

	/* Tablet */
	@media (min-width: 600px) {
		.toast-container {
			bottom: 2.5rem;
			max-width: 400px;
		}

		.toast {
			padding: 0.75rem 1rem;
			gap: 0.75rem;
		}

		.toast-icon-wrapper {
			width: 24px;
			height: 24px;
		}

		.toast-icon {
			font-size: 0.75rem;
		}

		.toast-message {
			font-size: 0.875rem;
		}

		.toast-close {
			width: 24px;
			height: 24px;
		}
	}

	/* Mobile landscape / small screens */
	@media (max-width: 480px) {
		.toast-container {
			bottom: 1rem;
			width: calc(100% - 1rem);
		}

		.toast {
			padding: 0.5rem 0.75rem;
			gap: 0.5rem;
			border-radius: 8px;
		}

		.toast-icon-wrapper {
			width: 20px;
			height: 20px;
		}

		.toast-icon {
			font-size: 0.625rem;
		}

		.toast-message {
			font-size: 0.75rem;
		}

		.toast-close {
			width: 20px;
			height: 20px;
		}

		.toast-close svg {
			width: 10px;
			height: 10px;
		}
	}
</style>
