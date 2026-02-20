<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages.js';
	import { Home } from '@lucide/svelte';
</script>

<div class="error-page">
	<div class="error-content">
		<span class="error-code">{page.status}</span>
		<h1 class="error-title">
			{#if page.status === 404}
				{m.common_errorPageNotFound()}
			{:else}
				{m.common_error()}
			{/if}
		</h1>
		<p class="error-description">
			{#if page.status === 404}
				{m.common_errorPageNotFoundDesc()}
			{:else}
				{page.error?.message ?? ''}
			{/if}
		</p>
		<a href="/" class="home-link">
			<Home size={18} />
			{m.common_goHome()}
		</a>
	</div>
</div>

<style>
	.error-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		background: var(--background);
		color: var(--foreground);
		padding: 1.5rem;
	}

	.error-content {
		text-align: center;
		max-width: 400px;
	}

	.error-code {
		font-size: 5rem;
		font-weight: 800;
		line-height: 1;
		color: var(--primary);
		opacity: 0.8;
	}

	.error-title {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0.5rem 0;
	}

	.error-description {
		font-size: 0.95rem;
		color: var(--muted-foreground);
		margin-bottom: 2rem;
	}

	.home-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.7rem 1.5rem;
		background: var(--primary);
		color: var(--primary-foreground);
		border-radius: 8px;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.95rem;
		transition: opacity 0.15s;
	}

	.home-link:hover {
		opacity: 0.9;
	}
</style>
