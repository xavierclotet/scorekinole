<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MouseEventHandler } from 'svelte/elements';

	interface Props {
		variant?: 'primary' | 'secondary' | 'danger';
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		fullWidth?: boolean;
		size?: 'small' | 'medium' | 'large';
		onclick?: MouseEventHandler<HTMLButtonElement>;
		children?: Snippet;
	}

	let {
		variant = 'primary',
		disabled = false,
		type = 'button',
		fullWidth = false,
		size = 'medium',
		onclick,
		children
	}: Props = $props();
</script>

<button
	class="btn btn-{variant} btn-{size}"
	class:full-width={fullWidth}
	{onclick}
	{disabled}
	{type}
>
	{@render children?.()}
</button>

<style>
	.btn {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-family: inherit;
		position: relative;
		overflow: hidden;
	}

	.btn::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 0;
		height: 0;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.3);
		transform: translate(-50%, -50%);
		transition: width 0.6s, height 0.6s;
	}

	.btn:active::before {
		width: 300px;
		height: 300px;
	}

	/* Variants */
	.btn-primary {
		background: var(--accent-green, #00ff88);
		color: #000;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-green-light, #00ffaa);
		box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
		transform: translateY(-2px);
	}

	.btn-secondary {
		background: var(--bg-header, #151b2d);
		color: #fff;
		border: 2px solid var(--accent-green, #00ff88);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--accent-green, #00ff88);
		color: #000;
		transform: translateY(-2px);
	}

	.btn-danger {
		background: var(--accent-red, #ff3366);
		color: #fff;
	}

	.btn-danger:hover:not(:disabled) {
		background: var(--accent-red-dark, #ff1a4d);
		box-shadow: 0 4px 12px rgba(255, 51, 102, 0.3);
		transform: translateY(-2px);
	}

	/* Sizes */
	.btn-small {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
	}

	.btn-medium {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
	}

	.btn-large {
		padding: 1rem 2rem;
		font-size: 1.125rem;
	}

	/* States */
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none !important;
	}

	.btn:disabled:hover {
		box-shadow: none;
	}

	.full-width {
		width: 100%;
	}

	/* Focus styles for accessibility */
	.btn:focus-visible {
		outline: 2px solid var(--accent-green, #00ff88);
		outline-offset: 2px;
	}

	/* Mobile optimizations */
	@media (max-width: 600px) {
		.btn {
			padding: 0.65rem 1rem;
			font-size: 0.875rem;
		}

		.btn-small {
			padding: 0.5rem 0.85rem;
			font-size: 0.75rem;
		}

		.btn-large {
			padding: 0.85rem 1.5rem;
			font-size: 0.95rem;
		}
	}

	/* Portrait mobile - botones más compactos verticalmente */
	@media (max-width: 600px) and (orientation: portrait) {
		.btn {
			padding: 0.6rem 0.9rem;
			font-size: 0.85rem;
		}

		.btn-small {
			padding: 0.45rem 0.75rem;
			font-size: 0.7rem;
		}

		.btn-large {
			padding: 0.75rem 1.25rem;
			font-size: 0.9rem;
		}
	}

	/* Landscape mobile - botones ultra compactos */
	@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
		.btn {
			padding: 0.5rem 0.85rem;
			font-size: 0.8rem;
		}

		.btn-small {
			padding: 0.4rem 0.65rem;
			font-size: 0.7rem;
		}

		.btn-large {
			padding: 0.65rem 1.1rem;
			font-size: 0.85rem;
		}
	}
</style>
