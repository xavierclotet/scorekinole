<script lang="ts">
	interface Props {
		size?: 'sm' | 'md' | 'lg' | 'xl';
		className?: string;
	}

	let { size = 'md', className }: Props = $props();
</script>

<div class={['stamp', size, className]}>
	<div class="stamp-outer">
		<div class="stamp-inner">
			<span class="stamp-top-text">&#10038; Powered by &#10038;</span>
			<div class="stamp-brand">
				<span class="stamp-name">Scorekinole</span>
				<span class="stamp-arena">Arena</span>
			</div>
			<span class="stamp-bottom-text">&#10038; Official Platform &#10038;</span>
		</div>
	</div>
</div>

<style>
	.stamp {
		display: inline-block;
		filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.6));
	}

	.stamp-outer {
		border-radius: 50%;
		padding: 5px;
		background: linear-gradient(145deg, #d4a853 0%, #c9963c 25%, #e8c36a 50%, #b8872e 75%, #d4a853 100%);
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.3),
			inset 0 1px 2px rgba(255, 255, 255, 0.4),
			inset 0 -1px 2px rgba(0, 0, 0, 0.3),
			0 12px 30px rgba(0, 0, 0, 0.4);
	}

	.stamp-inner {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 1.5px solid rgba(0, 0, 0, 0.2);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: linear-gradient(160deg, rgba(255, 255, 255, 0.15) 0%, transparent 40%, rgba(0, 0, 0, 0.1) 100%);
		box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.2), inset 0 -2px 4px rgba(0, 0, 0, 0.15);
	}

	.stamp-top-text,
	.stamp-bottom-text {
		font-family: 'Lexend', sans-serif;
		font-weight: 600;
		color: rgba(60, 30, 0, 0.85);
		text-transform: uppercase;
		text-align: center;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.25);
	}

	.stamp-brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		border-top: 1.5px solid rgba(60, 30, 0, 0.3);
		border-bottom: 1.5px solid rgba(60, 30, 0, 0.3);
	}

	.stamp-name {
		font-family: 'Lexend', sans-serif;
		font-weight: 800;
		color: rgba(50, 20, 0, 0.9);
		line-height: 1.1;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.2);
	}

	.stamp-arena {
		font-family: 'Lexend', sans-serif;
		font-style: italic;
		font-weight: 800;
		color: rgba(140, 30, 0, 0.9);
		text-transform: uppercase;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.15);
	}

	/* sm — 100px */
	.stamp.sm .stamp-outer { width: 100px; height: 100px; padding: 3px; }
	.stamp.sm .stamp-inner { padding: 0.3rem; }
	.stamp.sm .stamp-top-text,
	.stamp.sm .stamp-bottom-text { font-size: 0.3rem; letter-spacing: 0.12em; }
	.stamp.sm .stamp-brand { margin: 0.1rem 0; padding: 0.1rem 0; }
	.stamp.sm .stamp-name { font-size: 0.65rem; letter-spacing: 0.02em; }
	.stamp.sm .stamp-arena { font-size: 0.42rem; letter-spacing: 0.1em; }

	/* md — 140px */
	.stamp.md .stamp-outer { width: 140px; height: 140px; padding: 4px; }
	.stamp.md .stamp-inner { padding: 0.5rem; }
	.stamp.md .stamp-top-text,
	.stamp.md .stamp-bottom-text { font-size: 0.4rem; letter-spacing: 0.14em; }
	.stamp.md .stamp-brand { margin: 0.15rem 0; padding: 0.15rem 0; }
	.stamp.md .stamp-name { font-size: 0.9rem; letter-spacing: 0.02em; }
	.stamp.md .stamp-arena { font-size: 0.58rem; letter-spacing: 0.12em; }

	/* lg — 180px */
	.stamp.lg .stamp-outer { width: 180px; height: 180px; padding: 5px; }
	.stamp.lg .stamp-inner { padding: 0.6rem; }
	.stamp.lg .stamp-top-text,
	.stamp.lg .stamp-bottom-text { font-size: 0.5rem; letter-spacing: 0.16em; }
	.stamp.lg .stamp-brand { margin: 0.2rem 0; padding: 0.2rem 0; }
	.stamp.lg .stamp-name { font-size: 1.15rem; letter-spacing: 0.02em; }
	.stamp.lg .stamp-arena { font-size: 0.75rem; letter-spacing: 0.14em; }

	/* xl — 240px */
	.stamp.xl .stamp-outer { width: 240px; height: 240px; padding: 7px; }
	.stamp.xl .stamp-inner { padding: 0.8rem; }
	.stamp.xl .stamp-top-text,
	.stamp.xl .stamp-bottom-text { font-size: 0.65rem; letter-spacing: 0.18em; }
	.stamp.xl .stamp-brand { margin: 0.3rem 0; padding: 0.25rem 0; }
	.stamp.xl .stamp-name { font-size: 1.5rem; letter-spacing: 0.02em; }
	.stamp.xl .stamp-arena { font-size: 1rem; letter-spacing: 0.14em; }
	.stamp.xl .stamp-brand { border-width: 2px; }
</style>
