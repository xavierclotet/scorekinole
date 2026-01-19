<script lang="ts">
	export let tournamentKey: string;

	let copied = false;

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
	on:click={copyKey}
	title="Clic para copiar la clave"
>
	{copied ? '✓ Copiado!' : `🔑 ${tournamentKey}`}
</button>

<style>
	.tournament-key-badge {
		display: inline-block;
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
