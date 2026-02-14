<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils/cn.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	type Props = WithElementRef<HTMLTextareaAttributes, HTMLTextAreaElement> & {
		value?: string;
	};

	let {
		ref = $bindable(null),
		value = $bindable(""),
		class: className,
		...restProps
	}: Props = $props();
</script>

<textarea
	bind:this={ref}
	data-slot="textarea"
	class={cn(
		"border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
		className
	)}
	bind:value
	{...restProps}
></textarea>
