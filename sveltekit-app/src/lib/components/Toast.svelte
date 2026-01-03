<script lang="ts">
	export let message: string = '';
	export let visible: boolean = false;
	export let duration: number = 3000;
	export let onClose: () => void = () => {};

	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	$: if (visible) {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			visible = false;
			onClose();
		}, duration);
	}
</script>

{#if visible}
	<div class="toast" role="alert">
		<span class="toast-icon">ℹ️</span>
		<span class="toast-message">{message}</span>
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		bottom: 5rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 255, 136, 0.15);
		border: 2px solid rgba(0, 255, 136, 0.5);
		border-radius: 12px;
		padding: 1rem 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		z-index: 3000;
		max-width: 90%;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		opacity: 0;
		animation: toastFadeIn 0.2s ease-out forwards;
	}

	@keyframes toastFadeIn {
		to {
			opacity: 1;
		}
	}

	.toast-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.toast-message {
		color: var(--text-color, #fff);
		font-size: 0.95rem;
		font-weight: 600;
		line-height: 1.4;
	}

	/* Mobile responsiveness */
	@media (max-width: 600px) {
		.toast {
			bottom: 4rem;
			padding: 0.875rem 1.25rem;
			max-width: 85%;
		}

		.toast-icon {
			font-size: 1.25rem;
		}

		.toast-message {
			font-size: 0.875rem;
		}
	}
</style>
