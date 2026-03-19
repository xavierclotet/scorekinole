<script lang="ts">
	import { Pane, type PaneProps } from "paneforge";

	let {
		class: className,
		...restProps
	}: PaneProps = $props();
</script>

<Pane class={className} {...restProps} />
