<script lang="ts">
	interface Props {
		size?: 'small' | 'medium' | 'large';
		message?: string;
		inline?: boolean;
	}

	let { size = 'medium', message = '', inline = false }: Props = $props();
</script>

<div class="loading-wrapper" class:inline class:fullpage={!inline}>
	<div class="spinner {size}">
		<div class="dot"></div>
		<div class="dot"></div>
		<div class="dot"></div>
	</div>
	{#if message}
		<span class="loading-text">{message}</span>
	{/if}
</div>

<style>
	.loading-wrapper {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.loading-wrapper.fullpage {
		flex-direction: column;
		justify-content: center;
		padding: 3rem 1.5rem;
	}

	.loading-wrapper.inline {
		flex-direction: row;
		justify-content: center;
		padding: 1rem;
	}

	.spinner {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.spinner.small {
		gap: 3px;
	}

	.spinner.small .dot {
		width: 6px;
		height: 6px;
	}

	.spinner.medium .dot {
		width: 8px;
		height: 8px;
	}

	.spinner.large .dot {
		width: 10px;
		height: 10px;
	}

	.dot {
		border-radius: 50%;
		background: var(--primary);
		animation: pulse 1.4s ease-in-out infinite;
	}

	.dot:nth-child(1) {
		animation-delay: 0s;
	}

	.dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes pulse {
		0%, 80%, 100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		40% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.loading-text {
		color: #64748b;
		font-size: 0.8rem;
		font-weight: 500;
		letter-spacing: 0.01em;
	}

	.fullpage .loading-text {
		font-size: 0.85rem;
	}

	.inline .loading-text {
		font-size: 0.75rem;
	}

	/* Dark theme support via parent data-theme */
	:global(:is([data-theme='dark'], [data-theme='violet'])) .dot {
		background: var(--primary);
	}

	:global(:is([data-theme='dark'], [data-theme='violet'])) .loading-text {
		color: #a0aec0;
	}
</style>
