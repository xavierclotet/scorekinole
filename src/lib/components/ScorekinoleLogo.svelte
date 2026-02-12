<script lang="ts">
	import { goto } from '$app/navigation';
	import { APP_VERSION } from '$lib/constants';

	interface Props {
		href?: string;
	}

	let { href = '/' }: Props = $props();

	function handleClick() {
		goto(href);
	}
</script>

<button class="header-logo" onclick={handleClick}>
	Scorekinole
	<span class="header-logo-suffix">
		<span class="header-logo-arena">Arena</span>
		<span class="header-logo-version">v{APP_VERSION}</span>
	</span>
</button>

<style>
	.header-logo {
		font-family: 'Lexend', sans-serif;
		font-size: 1.15rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.85);
		background: none;
		border: none;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
		letter-spacing: 0.01em;
		position: relative;
		display: flex;
		align-items: center;
	}

	.header-logo-suffix {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		margin-left: 0.2rem;
	}

	.header-logo-arena {
		font-style: italic;
		font-weight: 700;
		font-size: 0.75rem;
		color: #dc2626;
		transform: rotate(-8deg);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		line-height: 1;
	}

	.header-logo-version {
		font-style: italic;
		font-weight: 500;
		font-size: 0.6rem;
		color: rgba(255, 255, 255, 0.55);
		transform: rotate(-8deg);
		letter-spacing: 0.05em;
		line-height: 1;
		margin-top: 0.1rem;
		margin-left: 0.12rem;
	}

	.header-logo:hover {
		color: rgba(255, 255, 255, 1);
		background: rgba(255, 255, 255, 0.06);
	}

	.header-logo:hover .header-logo-arena {
		color: #dc2626;
		filter: brightness(1.15);
	}

	.header-logo:hover .header-logo-version {
		color: rgba(255, 255, 255, 0.5);
	}

	.header-logo:active {
		transform: scale(0.97);
	}

	/* Responsive - smaller screens */
	@media (max-width: 640px) {
		.header-logo {
			font-size: 1rem;
		}

		.header-logo-arena {
			font-size: 0.65rem;
		}

		.header-logo-version {
			font-size: 0.5rem;
		}
	}

	@media (max-width: 480px) {
		.header-logo {
			font-size: 0.9rem;
			padding: 0.2rem 0.4rem;
		}

		.header-logo-arena {
			font-size: 0.6rem;
		}

		.header-logo-version {
			font-size: 0.45rem;
		}
	}

	/* Light theme */
	:global([data-theme='light']) .header-logo {
		color: rgba(0, 0, 0, 0.75);
	}

	:global([data-theme='light']) .header-logo-version {
		color: rgba(0, 0, 0, 0.45);
	}

	:global([data-theme='light']) .header-logo:hover {
		color: rgba(0, 0, 0, 0.9);
		background: rgba(0, 0, 0, 0.04);
	}

	:global([data-theme='light']) .header-logo:hover .header-logo-version {
		color: rgba(0, 0, 0, 0.5);
	}
</style>
