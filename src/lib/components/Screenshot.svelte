<script lang="ts">
	import { browser } from '$app/environment';

	interface Props {
		path: string;
		label: string;
		icon?: 'game' | 'tournaments' | 'admin' | 'ranking' | 'stats' | 'leaderboards';
		alt?: string;
	}

	let { path, label, icon = 'game', alt }: Props = $props();

	let loaded = $state(false);
	let failed = $state(false);
	let zoomed = $state(false);

	function onImgLoad() {
		loaded = true;
		failed = false;
	}

	function onImgError() {
		loaded = false;
		failed = true;
	}

	function toggleZoom() {
		if (loaded && !failed) zoomed = !zoomed;
	}

	function closeZoom(e: Event) {
		e.stopPropagation();
		zoomed = false;
	}

	$effect(() => {
		if (!browser) return;
		if (zoomed) {
			const prev = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = prev;
			};
		}
	});
</script>

<div
	class="screenshot-frame"
	class:loaded={loaded && !failed}
	class:has-img={loaded && !failed}
	onclick={toggleZoom}
	role={loaded && !failed ? 'button' : undefined}
	tabindex={loaded && !failed ? 0 : undefined}
>
	{#if browser && !failed}
		<img
			src={path}
			alt={alt ?? label}
			class="screenshot-img"
			style="display: {loaded ? 'block' : 'none'}"
			onload={onImgLoad}
			onerror={onImgError}
		/>
	{/if}

	{#if !loaded || failed}
		<div class="screenshot-placeholder" data-lg-icon={icon}>
			<div class="placeholder-icon">
				{#if icon === 'game'}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
					</svg>
				{:else if icon === 'tournaments'}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
					</svg>
				{:else if icon === 'admin'}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
					</svg>
				{:else if icon === 'ranking'}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
					</svg>
				{:else if icon === 'stats'}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
					</svg>
				{/if}
			</div>
			<span class="placeholder-title">Pantallazo pendiente</span>
			<span class="placeholder-label">{label}</span>
			<span class="placeholder-path">/static/landing/{label}</span>
		</div>
	{:else}
		<div class="zoom-hint">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="11" cy="11" r="8"/>
				<line x1="21" y1="21" x2="16.65" y2="16.65"/>
				<line x1="11" y1="8" x2="11" y2="14"/>
				<line x1="8" y1="11" x2="14" y2="11"/>
			</svg>
		</div>
	{/if}
</div>

{#if zoomed}
	<div
		class="lightbox"
		onclick={closeZoom}
		role="button"
		tabindex="0"
		aria-label="Close"
		onkeydown={(e) => e.key === 'Escape' && (zoomed = false)}
		ontouchmove={(e) => e.preventDefault()}
	>
		<img src={path} alt={alt ?? label} class="lightbox-img" />
		<button class="lightbox-close" onclick={closeZoom} aria-label="Close">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"/>
				<line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>
{/if}

<style>
	.screenshot-frame {
		position: relative;
		width: 100%;
		max-width: 380px;
		aspect-ratio: 16 / 10;
		border-radius: 16px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--primary) 12%, transparent) 0%,
			color-mix(in srgb, var(--primary) 4%, transparent) 100%
		);
		border: 2px dashed color-mix(in srgb, var(--primary) 35%, transparent);
		overflow: hidden;
		margin: 0 auto;
		transition: all 0.3s ease;
	}

	.screenshot-frame.loaded {
		border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
		border-style: solid;
		background: none;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
	}

	.screenshot-frame.has-img {
		cursor: zoom-in;
	}

	.screenshot-frame.has-img:hover {
		box-shadow: 0 16px 50px rgba(0, 0, 0, 0.25);
		transform: translateY(-2px);
	}

	.screenshot-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.screenshot-placeholder {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem;
		text-align: center;
	}

	.placeholder-icon {
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: color-mix(in srgb, var(--primary) 55%, transparent);
		opacity: 0.7;
		border-radius: 50%;
		background: color-mix(in srgb, var(--primary) 12%, transparent);
	}

	.placeholder-icon svg {
		width: 28px;
		height: 28px;
	}

	.placeholder-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--foreground);
		opacity: 0.75;
	}

	.placeholder-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: color-mix(in srgb, var(--primary) 70%, var(--foreground));
		font-family: monospace;
	}

	.placeholder-path {
		font-size: 0.6rem;
		color: var(--foreground);
		opacity: 0.4;
		font-family: monospace;
		word-break: break-all;
	}

	.zoom-hint {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		color: var(--foreground);
		opacity: 0.6;
		pointer-events: none;
		transition: opacity 0.2s;
	}

	.screenshot-frame.has-img:hover .zoom-hint {
		opacity: 1;
	}

	.zoom-hint svg {
		width: 16px;
		height: 16px;
	}

	/* Lightbox */
	.lightbox {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background: rgba(0, 0, 0, 0.85);
		animation: lbfade 0.2s ease-out;
		cursor: zoom-out;
	}

	@keyframes lbfade {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.lightbox-img {
		max-width: 95vw;
		max-height: 90vh;
		object-fit: contain;
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.lightbox-close {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		top: 1.5rem;
		right: 1.5rem;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.2s;
	}

	.lightbox-close svg {
		width: 22px;
		height: 22px;
		color: rgba(255, 255, 255, 0.8);
	}

	.lightbox-close:hover {
		transform: scale(1.1);
	}

	.lightbox-close:hover svg {
		color: #fff;
	}

	@media (min-width: 700px) {
		.screenshot-frame {
			max-width: 420px;
		}
	}
</style>