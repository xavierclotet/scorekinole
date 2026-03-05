<script lang="ts">
	interface Props {
		size?: 'sm' | 'md' | 'lg';
		href?: string;
		className?: string;
	}

	let { size = 'md', href, className }: Props = $props();
</script>

{#if href}
	<a class={['powered-badge', size, className]} {href} target="_blank" rel="noopener noreferrer">
		<span class="powered-label">Powered by</span>
		<span class="powered-brand">
			Scorekinole
			<span class="powered-suffix">
				<span class="powered-arena">Arena</span>
			</span>
		</span>
	</a>
{:else}
	<div class={['powered-badge', size, className]}>
		<span class="powered-label">Powered by</span>
		<span class="powered-brand">
			Scorekinole
			<span class="powered-suffix">
				<span class="powered-arena">Arena</span>
			</span>
		</span>
	</div>
{/if}

<style>
	.powered-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		transition: all 0.15s;
		cursor: default;
		text-decoration: none;
	}

	a.powered-badge {
		cursor: pointer;
	}

	a.powered-badge:hover {
		filter: brightness(1.15);
		background: rgba(255, 255, 255, 0.06);
	}

	/* Label — "Powered by" */
	.powered-label {
		font-style: italic;
		text-transform: lowercase;
		color: rgba(255, 255, 255, 0.4);
		line-height: 1;
	}

	/* Brand — "Scorekinole" */
	.powered-brand {
		font-family: 'Lexend', sans-serif;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.85);
		letter-spacing: 0.01em;
		display: flex;
		align-items: center;
		line-height: 1;
	}

	.powered-suffix {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		margin-left: 0.15rem;
	}

	/* Arena — italic bold uppercase red rotated */
	.powered-arena {
		font-style: italic;
		font-weight: 700;
		color: #dc2626;
		transform: rotate(-8deg);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		line-height: 1;
	}

	/* Size: sm */
	.powered-badge.sm .powered-label {
		font-size: 0.55rem;
	}

	.powered-badge.sm .powered-brand {
		font-size: 0.7rem;
	}

	.powered-badge.sm .powered-arena {
		font-size: 0.45rem;
	}

	/* Size: md (default) */
	.powered-badge.md .powered-label {
		font-size: 0.65rem;
	}

	.powered-badge.md .powered-brand {
		font-size: 0.85rem;
	}

	.powered-badge.md .powered-arena {
		font-size: 0.55rem;
	}

	/* Size: lg */
	.powered-badge.lg .powered-label {
		font-size: 0.75rem;
	}

	.powered-badge.lg .powered-brand {
		font-size: 1.1rem;
	}

	.powered-badge.lg .powered-arena {
		font-size: 0.65rem;
	}

	/* Light theme */
	:global([data-theme='light']) .powered-label {
		color: rgba(0, 0, 0, 0.35);
	}

	:global([data-theme='light']) .powered-brand {
		color: rgba(0, 0, 0, 0.75);
	}

	:global([data-theme='light']) a.powered-badge:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	/* Violet-light theme */
	:global([data-theme='violet-light']) .powered-label {
		color: rgba(0, 0, 0, 0.35);
	}

	:global([data-theme='violet-light']) .powered-brand {
		color: rgba(0, 0, 0, 0.75);
	}

	:global([data-theme='violet-light']) a.powered-badge:hover {
		background: rgba(0, 0, 0, 0.04);
	}
</style>
