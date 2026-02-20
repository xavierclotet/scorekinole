<script lang="ts">
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

	// Confetti palette: primary, white, sky, lavender, mint — premium, not rainbow
	// Read --primary at runtime so confetti matches the theme
	import { browser } from '$app/environment';
	const primaryColor = browser ? getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() : '#FBBF24';
	const COLORS = [primaryColor, '#F8FAFC', '#93C5FD', '#C4B5FD', '#6EE7B7'];
	const SHAPES = ['rect', 'rect', 'rect', 'circle', 'circle', 'ribbon'] as const;

	interface Piece {
		id: number;
		left: number;
		delay: number;
		dur: number;
		w: number;
		h: number;
		color: string;
		shape: typeof SHAPES[number];
		rot0: number;
		rotDir: number;
		swing: number;
	}

	// Generated once per mount — fresh positions each time splash appears
	const pieces: Piece[] = Array.from({ length: 24 }, (_, i) => {
		const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
		const sz = 5 + Math.random() * 7;
		return {
			id: i,
			left: 3 + (i / 24) * 94 + (Math.random() * 6 - 3),
			delay: Math.random() * 1.8,
			dur: 2.4 + Math.random() * 1.4,
			w: shape === 'ribbon' ? 3 : sz,
			h: shape === 'ribbon' ? 14 + Math.random() * 8 : (shape === 'circle' ? sz : sz * 1.4),
			color: COLORS[Math.floor(Math.random() * COLORS.length)],
			shape,
			rot0: Math.random() * 360,
			rotDir: Math.random() > 0.5 ? 1 : -1,
			swing: 20 + Math.random() * 40,
		};
	});

	let dismissTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (!isVisible) return;
		dismissTimer = setTimeout(() => {
			isVisible = false;
			ondismiss?.();
		}, 3600);
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

	function stopProp(e: Event) {
		e.stopPropagation();
	}
</script>

{#if isVisible}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="splash-overlay" class:tie-mode={isTie} onclick={dismiss} role="dialog" aria-modal="true" aria-label={isTie ? label : winnerName} tabindex="-1">
		<!-- Confetti rain — only for wins -->
		{#if !isTie}
			<div class="confetti-stage" aria-hidden="true">
				{#each pieces as p (p.id)}
					<div
						class="piece"
						class:circle={p.shape === 'circle'}
						class:ribbon={p.shape === 'ribbon'}
						style="
							left:{p.left}%;
							width:{p.w}px;
							height:{p.h}px;
							background:{p.color};
							--rot0:{p.rot0}deg;
							--rot1:{p.rot0 + p.rotDir * 540}deg;
							--swing:{p.swing}px;
							animation-delay:{p.delay}s;
							animation-duration:{p.dur}s;
						"
					></div>
				{/each}
			</div>
		{/if}

		<!-- Card -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="card" class:tie-card={isTie} onclick={stopProp}>
			<!-- Shimmer sweep -->
			<div class="shimmer" aria-hidden="true"></div>

			{#if isTie}
				<!-- Tie layout -->
				<div class="tie-icon" aria-hidden="true">＝</div>
				<div class="name tie-label">{label}</div>
				{#if score}
					<div class="score-line">{score}</div>
				{/if}
			{:else}
				<!-- Winner layout -->
				<div class="label-row">
					<span class="star">✦</span>
					<span class="label-text">{label}</span>
					<span class="star">✦</span>
				</div>
				<div class="name">{winnerName}</div>
				{#if score}
					<div class="score-line">{score}</div>
				{/if}
			{/if}

			<!-- Progress drain bar -->
			<div class="drain-track" aria-hidden="true">
				<div class="drain-fill"></div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ── Overlay ─────────────────────────────────────────────── */
	.splash-overlay {
		position: fixed;
		inset: 0;
		z-index: 9500;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		animation: overlay-in 0.18s ease-out forwards;
	}

	@keyframes overlay-in {
		from { opacity: 0; }
		to   { opacity: 1; }
	}

	/* ── Confetti ────────────────────────────────────────────── */
	.confetti-stage {
		position: fixed;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.piece {
		position: absolute;
		top: -20px;
		border-radius: 2px;
		animation: piece-fall linear both;
		opacity: 0;
	}

	.piece.circle  { border-radius: 50%; }
	.piece.ribbon  { border-radius: 1px; }

	@keyframes piece-fall {
		0% {
			transform: translateY(0) translateX(0) rotate(var(--rot0)) scaleX(1);
			opacity: 0;
		}
		5% { opacity: 1; }
		50% {
			transform: translateY(45vh) translateX(var(--swing)) rotate(calc(var(--rot0) + 270deg)) scaleX(-0.5);
			opacity: 0.9;
		}
		85% { opacity: 0.4; }
		100% {
			transform: translateY(110vh) translateX(calc(var(--swing) * -0.3)) rotate(var(--rot1)) scaleX(1);
			opacity: 0;
		}
	}

	/* ── Card ────────────────────────────────────────────────── */
	.card {
		position: relative;
		background: #0f1117;
		border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
		border-radius: 22px;
		padding: 2rem 2.5rem 1.6rem;
		text-align: center;
		width: min(320px, 88vw);
		overflow: hidden;
		animation: card-punch 0.52s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.05s both;
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--primary) 8%, transparent),
			0 0 40px color-mix(in srgb, var(--primary) 12%, transparent),
			0 24px 64px rgba(0, 0, 0, 0.55);
	}

	@keyframes card-punch {
		0%   { transform: scale(0.5);   opacity: 0; }
		55%  { transform: scale(1.06);  opacity: 1; }
		78%  { transform: scale(0.975); }
		100% { transform: scale(1);     opacity: 1; }
	}

	/* Shimmer sweep: a diagonal light that crosses the card once */
	.shimmer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			105deg,
			transparent 30%,
			rgba(255, 255, 255, 0.07) 50%,
			transparent 70%
		);
		background-size: 250% 100%;
		animation: shimmer-sweep 0.7s ease-out 0.55s both;
	}

	@keyframes shimmer-sweep {
		from { background-position: 200% 0; }
		to   { background-position: -50% 0; }
	}

	/* ── Label row ───────────────────────────────────────────── */
	.label-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 1.1rem;
		animation: label-drop 0.3s ease-out 0.3s both;
	}

	@keyframes label-drop {
		from { transform: translateY(-10px); opacity: 0; }
		to   { transform: translateY(0);     opacity: 1; }
	}

	.label-text {
		font-family: 'Lexend', sans-serif;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
		padding: 0.28rem 0.85rem;
		border-radius: 100px;
	}

	.star {
		font-size: 0.55rem;
		color: color-mix(in srgb, var(--primary) 60%, transparent);
	}

	/* ── Winner name ─────────────────────────────────────────── */
	.name {
		font-family: 'Lexend', sans-serif;
		font-size: clamp(1.6rem, 7vw, 2.1rem);
		font-weight: 800;
		color: #fff;
		line-height: 1.1;
		letter-spacing: -0.025em;
		margin-bottom: 0.55rem;
		animation: name-punch 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.38s both;
		word-break: break-word;
		hyphens: auto;
	}

	@keyframes name-punch {
		from { transform: scale(0.65); opacity: 0; }
		60%  { transform: scale(1.06); }
		to   { transform: scale(1);    opacity: 1; }
	}

	/* ── Score ───────────────────────────────────────────────── */
	.score-line {
		font-family: 'Lexend', sans-serif;
		font-size: 1.05rem;
		font-weight: 300;
		color: rgba(255, 255, 255, 0.38);
		letter-spacing: 0.1em;
		margin-bottom: 1.4rem;
		animation: score-rise 0.3s ease-out 0.52s both;
	}

	@keyframes score-rise {
		from { transform: translateY(8px); opacity: 0; }
		to   { transform: translateY(0);   opacity: 1; }
	}

	/* ── Drain bar ───────────────────────────────────────────── */
	.drain-track {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: rgba(255, 255, 255, 0.05);
	}

	.drain-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 80%, black));
		transform-origin: left;
		animation: drain 3.6s linear 0.05s both;
	}

	@keyframes drain {
		from { transform: scaleX(1);  }
		to   { transform: scaleX(0); }
	}

	/* ── Tie mode overrides ──────────────────────────────────── */
	.tie-card {
		border-color: rgba(148, 163, 184, 0.3);
		box-shadow:
			0 0 0 1px rgba(148, 163, 184, 0.08),
			0 0 32px rgba(148, 163, 184, 0.08),
			0 24px 64px rgba(0, 0, 0, 0.55);
	}

	.tie-card .drain-fill {
		background: linear-gradient(90deg, #94A3B8, #64748B);
	}

	.tie-icon {
		font-size: 2.2rem;
		color: #94A3B8;
		margin-bottom: 0.5rem;
		animation: label-drop 0.3s ease-out 0.25s both;
		line-height: 1;
	}

	.tie-label {
		font-size: clamp(1.4rem, 6vw, 1.8rem);
		color: #CBD5E1;
		letter-spacing: 0.04em;
		animation: name-punch 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.3s both;
		margin-bottom: 0.55rem;
	}
</style>
