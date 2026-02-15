<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';

	interface Props {
		onrefresh: () => Promise<void>;
		children: import('svelte').Snippet;
		threshold?: number;
		disabled?: boolean;
	}

	let { onrefresh, children, threshold = 80, disabled = false }: Props = $props();

	let wrapperEl: HTMLDivElement | undefined = $state();
	let pullDistance = $state(0);
	let isRefreshing = $state(false);
	let isPulling = $state(false);
	let startY = $state(0);

	// Progress from 0 to 1 based on pull distance
	let progress = $derived(Math.min(pullDistance / threshold, 1));

	// Find the nearest scrollable parent or the wrapper itself
	function getScrollTop(): number {
		if (!wrapperEl) return 0;

		// Check if wrapper has scroll
		if (wrapperEl.scrollHeight > wrapperEl.clientHeight) {
			return wrapperEl.scrollTop;
		}

		// Check parent container
		const parent = wrapperEl.closest('.table-container, .grid-container, .stats-container, .match-list');
		if (parent) {
			return parent.scrollTop;
		}

		// Fallback to window scroll
		return window.scrollY;
	}

	// Check if we can pull (only when scrolled to top)
	function canPull(): boolean {
		if (disabled || isRefreshing) return false;
		return getScrollTop() <= 0;
	}

	function handleTouchStart(e: TouchEvent) {
		if (!canPull()) return;
		startY = e.touches[0].clientY;
		isPulling = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isPulling || isRefreshing) return;

		const currentY = e.touches[0].clientY;
		const diff = currentY - startY;

		// Only allow pulling down when at top of scroll
		if (diff > 0 && getScrollTop() <= 0) {
			// Apply resistance to make it feel more natural
			pullDistance = Math.min(diff * 0.5, threshold * 1.5);
			// Prevent default scroll behavior while pulling
			// Only call preventDefault if the event is cancelable (not when scroll is in progress)
			if (pullDistance > 10 && e.cancelable) {
				e.preventDefault();
			}
		} else {
			pullDistance = 0;
		}
	}

	async function handleTouchEnd() {
		if (!isPulling) return;
		isPulling = false;

		if (pullDistance >= threshold && !isRefreshing) {
			isRefreshing = true;
			pullDistance = threshold; // Keep indicator visible

			try {
				await onrefresh();
			} finally {
				isRefreshing = false;
				pullDistance = 0;
			}
		} else {
			pullDistance = 0;
		}
	}

	// Register touchmove with passive: false to allow preventDefault
	$effect(() => {
		if (!wrapperEl) return;

		wrapperEl.addEventListener('touchmove', handleTouchMove, { passive: false });

		return () => {
			wrapperEl.removeEventListener('touchmove', handleTouchMove);
		};
	});
</script>

<div
	class="pull-to-refresh-wrapper"
	bind:this={wrapperEl}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
	ontouchcancel={handleTouchEnd}
>
	<div
		class="pull-indicator"
		class:visible={pullDistance > 10 || isRefreshing}
		style="height: {Math.max(pullDistance, isRefreshing ? threshold : 0)}px"
	>
		<div
			class="indicator-content"
			class:ready={progress >= 1}
			class:refreshing={isRefreshing}
			style="transform: rotate({progress * 360}deg)"
		>
			<LoaderCircle class="size-5" />
		</div>
	</div>

	<div
		class="pull-content"
		style="transform: translateY({pullDistance}px)"
	>
		{@render children()}
	</div>
</div>

<style>
	.pull-to-refresh-wrapper {
		position: relative;
		width: 100%;
		/* Don't add overflow - let parent handle it */
	}

	.pull-indicator {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		pointer-events: none;
		z-index: 10;
		opacity: 0;
		transition: opacity 0.2s;
		/* Position it above the content */
		transform: translateY(-100%);
	}

	.pull-indicator.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.indicator-content {
		color: var(--muted-foreground);
		transition: color 0.2s;
	}

	.indicator-content.ready {
		color: var(--primary);
	}

	.indicator-content.refreshing {
		animation: spin 1s linear infinite;
		color: var(--primary);
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.pull-content {
		transition: transform 0.15s ease-out;
	}

	/* When actively pulling, disable transition for smoother feel */
	.pull-to-refresh-wrapper:active .pull-content {
		transition: none;
	}
</style>
