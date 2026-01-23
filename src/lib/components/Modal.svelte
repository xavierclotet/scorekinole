<script lang="ts">
	export let isOpen: boolean = false;
	export let title: string = '';
	export let onClose: () => void = () => {};

	function handleOverlayClick() {
		onClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			onClose();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div
		class="modal-overlay"
		on:click={handleOverlayClick}
		on:keydown={handleKeydown}
		role="button"
		tabindex="-1"
	>
		<div
			class="modal-content"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<div class="modal-header">
				{#if title}
					<h2 id="modal-title" class="modal-title">{title}</h2>
				{/if}

				<div class="header-actions">
					{#if $$slots.headerActions}
						<slot name="headerActions" />
					{/if}
					<button
						class="close-btn"
						on:click={onClose}
						aria-label="Close"
						type="button"
					>
						×
					</button>
				</div>
			</div>

			<div class="modal-body">
				<slot />
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal-content {
		background: #1a1d24;
		padding: 1.25rem;
		border-radius: 12px;
		min-width: 50%;
		max-width: 90%;
		max-height: 90vh;
		position: relative;
		animation: slideIn 0.2s ease-out;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(255, 255, 255, 0.06);
		display: flex;
		flex-direction: column;
	}

	@keyframes slideIn {
		from {
			transform: translateY(-10px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		gap: 1rem;
		flex-shrink: 0;
	}

	.modal-title {
		color: rgba(255, 255, 255, 0.9);
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		flex: 1;
		letter-spacing: 0.01em;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.4);
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.8);
	}

	.close-btn:active {
		transform: scale(0.95);
	}

	.modal-body {
		color: var(--text-color, #fff);
		flex: 1;
		overflow-y: visible;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	/* Scrollbar styling */
	.modal-body::-webkit-scrollbar {
		width: 4px;
	}

	.modal-body::-webkit-scrollbar-track {
		background: transparent;
	}

	.modal-body::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
	}

	.modal-body::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	/* Mobile responsiveness */
	@media (max-width: 768px) {
		.modal-content {
			min-width: 80%;
		}
	}

	@media (max-width: 600px) {
		.modal-content {
			min-width: 90%;
			max-width: 95%;
			padding: 1rem;
			max-height: 85vh;
		}

		.modal-header {
			margin-bottom: 0.75rem;
			padding-bottom: 0.6rem;
		}

		.modal-title {
			font-size: 0.95rem;
		}

		.close-btn {
			font-size: 1.3rem;
			width: 28px;
			height: 28px;
		}
	}

	/* Portrait mobile - maximize space */
	@media (max-width: 600px) and (orientation: portrait) {
		.modal-content {
			max-height: 88vh;
			padding: 0.75rem;
		}

		.modal-header {
			margin-bottom: 0.6rem;
			padding-bottom: 0.5rem;
		}

		.modal-title {
			font-size: 0.9rem;
		}
	}

	/* Landscape - narrower modals to not take too much horizontal space */
	@media (orientation: landscape) {
		.modal-content {
			max-width: 70%;
		}
	}

	/* Landscape mobile - compact everything */
	@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
		.modal-content {
			max-height: 80vh;
			max-width: 60%;
			padding: 0.75rem;
		}

		.modal-header {
			margin-bottom: 0.4rem;
			padding-bottom: 0.4rem;
		}

		.modal-title {
			font-size: 0.8rem;
		}

		.close-btn {
			font-size: 1.1rem;
			width: 24px;
			height: 24px;
		}
	}
</style>
