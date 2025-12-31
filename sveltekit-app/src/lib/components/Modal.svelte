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
			{#if title}
				<h2 id="modal-title" class="modal-title">{title}</h2>
			{/if}

			<button
				class="close-btn"
				on:click={onClose}
				aria-label="Close"
				type="button"
			>
				×
			</button>

			<div class="modal-body">
				<slot />
			</div>

			{#if $$slots.actions}
				<div class="modal-footer">
					<slot name="actions" />
				</div>
			{/if}
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
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-content {
		background: var(--bg-modal, #1a1f35);
		padding: 2rem;
		border-radius: 12px;
		min-width: 50%;
		max-width: 90%;
		max-height: 90vh;
		overflow-y: auto;
		position: relative;
		animation: slideIn 0.3s ease-out;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
	}

	@keyframes slideIn {
		from {
			transform: translateY(-20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.modal-title {
		color: var(--accent-green, #00ff88);
		margin: 0 0 1.5rem 0;
		font-size: 1.5rem;
		padding-right: 2rem;
	}

	.close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: none;
		border: none;
		font-size: 2rem;
		cursor: pointer;
		color: var(--text-color, #fff);
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		transform: rotate(90deg);
	}

	.modal-body {
		color: var(--text-color, #fff);
	}

	/* Scrollbar styling */
	.modal-content::-webkit-scrollbar {
		width: 8px;
	}

	.modal-content::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
	}

	.modal-content::-webkit-scrollbar-thumb {
		background: var(--accent-green, #00ff88);
		border-radius: 4px;
	}

	.modal-content::-webkit-scrollbar-thumb:hover {
		background: var(--accent-green-light, #00ffaa);
	}

	.modal-footer {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
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
			padding: 1.5rem;
		}

		.modal-title {
			font-size: 1.25rem;
		}
	}
</style>
