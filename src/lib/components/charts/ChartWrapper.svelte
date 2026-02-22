<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		title: string;
		hasData: boolean;
		isLoading?: boolean;
		emptyMessage?: string;
		children: import('svelte').Snippet;
	}

	let { title, hasData, isLoading = false, emptyMessage, children }: Props = $props();
</script>

<div class="chart-card">
	<h3 class="chart-title">{title}</h3>
	{#if isLoading}
		<div class="chart-loading">
			<div class="spinner"></div>
		</div>
	{:else if !hasData}
		<div class="chart-empty">{emptyMessage || m.stats_noDataForChart()}</div>
	{:else}
		<div class="chart-canvas-wrapper">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.chart-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1rem;
		box-shadow: 0 1px 2px rgba(0,0,0,0.05);
	}

	.chart-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--foreground);
		margin: 0 0 0.75rem;
	}

	.chart-canvas-wrapper {
		position: relative;
		height: 200px;
	}

	.chart-canvas-wrapper :global(canvas) {
		width: 100% !important;
		height: 100% !important;
	}

	.chart-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 200px;
	}

	.spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border);
		border-top: 3px solid var(--primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.chart-empty {
		text-align: center;
		padding: 2.5rem 1rem;
		color: var(--muted-foreground);
		font-size: 0.8rem;
	}

	@media (min-width: 640px) {
		.chart-canvas-wrapper {
			height: 280px;
		}

		.chart-loading {
			height: 280px;
		}
	}
</style>
