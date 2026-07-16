<script lang="ts">
	import Mail from '@lucide/svelte/icons/mail';
	import { goto } from '$app/navigation';
</script>

<button
	class="contact-icon"
	onclick={() => goto('/contact')}
	aria-label="Contact"
	title="Contact"
>
	<Mail class="size-4" />
</button>

<style>
	.contact-icon {
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

	.contact-icon:hover {
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		color: var(--primary);
		border-color: color-mix(in srgb, var(--primary) 30%, transparent);
	}
</style>
