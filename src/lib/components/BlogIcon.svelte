<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<button
	class="blog-icon"
	onclick={() => goto('/blog')}
	aria-label="Blog"
	title="Blog"
>
	<svg viewBox="0 0 24 24" fill="currentColor" class="size-4">
		<path d="M19 14v4h-2v-4h-4v-2h4V8h2v4h4v2h-4zm-9 5H4V5h6v14zm-2-8v-2H6v2h2zm0 4v-2H6v2h2zm0 4v-2H6v2h2zm12-10h-2V5h-6v2H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-6h2v6c0 2.2-1.8 4-4 4H5c-2.2 0-4-1.8-4-4V9c0-2.2 1.8-4 4-4h4V3h6v2h4v4z"/>
	</svg>
</button>

<style>
	.blog-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		border: 1px solid color-mix(in srgb, var(--foreground) 15%, transparent);
		background: color-mix(in srgb, var(--foreground) 5%, transparent);
		color: var(--muted-foreground);
		cursor: pointer;
		transition: all 0.15s;
	}

	.blog-icon:hover {
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		color: var(--primary);
		border-color: color-mix(in srgb, var(--primary) 30%, transparent);
	}
</style>
