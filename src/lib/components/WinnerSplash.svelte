<script lang="ts">
	import { fly } from 'svelte/transition';

	interface Props {
		isVisible?: boolean;
		winnerName?: string;
		label?: string;
		score?: string;
		isTie?: boolean;
		ondismiss?: () => void;
	}

	let {
		isVisible = $bindable(false),
		winnerName = '',
		label = '',
		score = '',
		isTie = false,
		ondismiss
	}: Props = $props();

	// Fast & non-blocking: auto-dismiss in 1.8s
	const DISMISS_MS = 1800;
	let dismissTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (!isVisible) return;
		dismissTimer = setTimeout(() => {
			isVisible = false;
			ondismiss?.();
		}, DISMISS_MS);
		return () => {
			if (dismissTimer) clearTimeout(dismissTimer);
			dismissTimer = null;
		};
	});

	function dismiss() {
		if (dismissTimer) {
			clearTimeout(dismissTimer);
			dismissTimer = null;
		}
		isVisible = false;
		ondismiss?.();
	}
</script>

{#if isVisible}
	<!-- Non-blocking: wrapper lets taps pass through to the game underneath -->
	<div class="banner-wrap">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="banner"
			class:tie={isTie}
			role="status"
			aria-live="polite"
			onclick={dismiss}
			in:fly={{ y: -64, duration: 240 }}
			out:fly={{ y: -64, duration: 160 }}
		>
			{#if isTie}
				<span class="name">{label}</span>
			{:else}
				<span class="label">{label}</span>
				<span class="name">{winnerName}</span>
			{/if}
			{#if score}
				<span class="score">{score}</span>
			{/if}

			<!-- Auto-dismiss progress bar -->
			<span class="drain" aria-hidden="true"></span>
		</div>
	</div>
{/if}

<style>
	/* ── Wrapper: fixed top-center, click-through ────────────── */
	.banner-wrap {
		position: fixed;
		top: calc(env(safe-area-inset-top, 0px) + 12px);
		left: 0;
		right: 0;
		z-index: 9500;
		display: flex;
		justify-content: center;
		padding: 0 12px;
		pointer-events: none;
	}

	/* ── Banner pill ─────────────────────────────────────────── */
	.banner {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		max-width: min(440px, 100%);
		background: #0f1117;
		border: 1px solid color-mix(in srgb, var(--primary) 26%, transparent);
		border-radius: 14px;
		padding: 0.6rem 1rem 0.62rem;
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--primary) 6%, transparent),
			0 12px 34px rgba(0, 0, 0, 0.5);
		overflow: hidden;
		cursor: pointer;
		pointer-events: auto;
	}

	/* Left accent strip */
	.banner::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--primary);
	}

	/* ── Label (small uppercase tag) ─────────────────────────── */
	.label {
		flex-shrink: 0;
		font-family: 'Lexend', sans-serif;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--primary);
		white-space: nowrap;
	}

	/* ── Winner / tie name ───────────────────────────────────── */
	.name {
		flex: 1 1 auto;
		min-width: 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 800;
		color: #fff;
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Score ───────────────────────────────────────────────── */
	.score {
		flex-shrink: 0;
		margin-left: auto;
		padding-left: 0.4rem;
		font-family: 'Lexend', sans-serif;
		font-size: 0.95rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.55);
		letter-spacing: 0.04em;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* ── Auto-dismiss bar ────────────────────────────────────── */
	.drain {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--primary);
		transform-origin: left;
		animation: drain 1.8s linear both;
	}

	@keyframes drain {
		from { transform: scaleX(1); }
		to   { transform: scaleX(0); }
	}

	/* ── Tie mode (neutral accent) ───────────────────────────── */
	.banner.tie {
		border-color: rgba(148, 163, 184, 0.3);
	}
	.banner.tie::before,
	.banner.tie .drain {
		background: #94A3B8;
	}
	.banner.tie .name {
		color: #E2E8F0;
		font-weight: 700;
	}

	/* ── Reduced motion ──────────────────────────────────────── */
	@media (prefers-reduced-motion: reduce) {
		.drain {
			animation: drain 1.8s linear both;
		}
	}
</style>
