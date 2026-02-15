<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		tournamentKey: string;
		compact?: boolean;
	}

	let { tournamentKey, compact = false }: Props = $props();

	let copied = $state(false);

	async function copyKey() {
		if (!tournamentKey) return;
		try {
			await navigator.clipboard.writeText(tournamentKey);
			copied = true;
			setTimeout(() => copied = false, 2000);
		} catch (err) {
			console.error('Error copying key:', err);
		}
	}
</script>

<button
	class="tournament-key-badge"
	class:compact
	onclick={copyKey}
	title={m.common_clickToCopy()}
>
	{copied ? `✓` : tournamentKey}
</button>

<style>
	.tournament-key-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.75rem;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #3b82f6;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: all 0.2s;
		font-family: monospace;
	}

	.tournament-key-badge.compact {
		padding: 0.2rem 0.5rem;
		font-size: 0.7rem;
		border-radius: 4px;
	}

	.tournament-key-badge:hover {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.5);
	}

	:global([data-theme='dark']) .tournament-key-badge {
		background: rgba(96, 165, 250, 0.15);
		border-color: rgba(96, 165, 250, 0.3);
		color: #60a5fa;
	}

	:global([data-theme='dark']) .tournament-key-badge:hover {
		background: rgba(96, 165, 250, 0.25);
		border-color: rgba(96, 165, 250, 0.5);
	}
</style>
