<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';

	function goBack() {
		goto('/tournaments');
	}

	let tournamentId = $derived($page.params.id);
</script>

<svelte:head>
	<title>Torneo - Scorekinole</title>
</svelte:head>

<div class="detail-container">
	<header class="page-header">
		<div class="header-row">
			<button class="back-btn" onclick={goBack}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 12H5M12 19l-7-7 7-7" />
				</svg>
			</button>
			<div class="header-main">
				<h1>Torneo</h1>
			</div>
		</div>
	</header>

	<div class="placeholder-content">
		<div class="placeholder-icon">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		</div>
		<h2>{m.tournaments_detailsPlaceholder()}</h2>
		<p class="tournament-id">ID: {tournamentId}</p>
		<button class="back-button" onclick={goBack}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5M12 19l-7-7 7-7" />
			</svg>
			{m.tournaments_publicTournaments()}
		</button>
	</div>
</div>

<style>
	.detail-container {
		min-height: 100vh;
		background: #0f1419;
		padding: 1.5rem 2rem;
		padding-top: max(1.5rem, env(safe-area-inset-top, 1.5rem));
		padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem));
	}

	.page-header {
		background: #1a2332;
		border-bottom: 1px solid #2d3748;
		padding: 0.75rem 1.5rem;
		margin: -1.5rem -2rem 2rem -2rem;
	}

	.header-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.back-btn {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		border: 1px solid #2d3748;
		background: #0f1419;
		color: #8b9bb3;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.back-btn svg {
		width: 18px;
		height: 18px;
	}

	.back-btn:hover {
		transform: translateX(-2px);
		border-color: #667eea;
		color: #667eea;
	}

	.header-main h1 {
		font-size: 1.1rem;
		margin: 0;
		color: #e1e8ed;
		font-weight: 700;
	}

	.placeholder-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 4rem 2rem;
	}

	.placeholder-icon {
		margin-bottom: 1.5rem;
	}

	.placeholder-icon svg {
		width: 80px;
		height: 80px;
		stroke: #4a5568;
	}

	.placeholder-content h2 {
		font-size: 1.25rem;
		color: #e1e8ed;
		margin: 0 0 0.5rem 0;
		font-weight: 600;
	}

	.tournament-id {
		color: #6b7a94;
		font-size: 0.85rem;
		margin: 0 0 2rem 0;
		font-family: monospace;
	}

	.back-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.back-button svg {
		width: 18px;
		height: 18px;
	}

	.back-button:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
	}

	@media (max-width: 768px) {
		.detail-container {
			padding: 1rem;
		}

		.page-header {
			margin: -1rem -1rem 1.5rem -1rem;
			padding: 0.75rem 1rem;
		}

		.placeholder-icon svg {
			width: 64px;
			height: 64px;
		}
	}
</style>
