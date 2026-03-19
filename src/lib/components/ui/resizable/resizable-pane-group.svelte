<script lang="ts">
	import { PaneGroup, type PaneGroupProps } from "paneforge";

	let {
		class: className,
		...restProps
	}: PaneGroupProps = $props();
</script>

<PaneGroup class={className} {...restProps} />
