<script lang="ts">
	import { PaneResizer, type PaneResizerProps } from "paneforge";

	let {
		class: className,
		...restProps
	}: PaneResizerProps = $props();
</script>

<PaneResizer class={["resizable-handle", className]} {...restProps}>
	<div class="resizable-handle-bar"></div>
</PaneResizer>

<style>
	:global(.resizable-handle) {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		flex-shrink: 0;
	}

	:global(.resizable-handle[data-direction='vertical']) {
		height: 12px;
		width: 100%;
		cursor: row-resize;
	}

	:global(.resizable-handle[data-direction='horizontal']) {
		width: 12px;
		height: 100%;
		cursor: col-resize;
	}

	.resizable-handle-bar {
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.12);
		transition: background 0.15s;
	}

	:global(.resizable-handle[data-direction='vertical']) .resizable-handle-bar {
		height: 3px;
		width: 40px;
	}

	:global(.resizable-handle[data-direction='horizontal']) .resizable-handle-bar {
		width: 3px;
		height: 40px;
	}

	:global(.resizable-handle:hover) .resizable-handle-bar,
	:global(.resizable-handle[data-dragging]) .resizable-handle-bar {
		background: rgba(255, 255, 255, 0.25);
	}

	:global(:is([data-theme='light'], [data-theme='violet-light'])) .resizable-handle-bar {
		background: rgba(0, 0, 0, 0.12);
	}

	:global(:is([data-theme='light'], [data-theme='violet-light']) .resizable-handle:hover) .resizable-handle-bar,
	:global(:is([data-theme='light'], [data-theme='violet-light']) .resizable-handle[data-dragging]) .resizable-handle-bar {
		background: rgba(0, 0, 0, 0.25);
	}
</style>
