<script lang="ts">
	interface Props {
		size?: 'small' | 'large';
	}

	let { size = 'small' }: Props = $props();
</script>

<span class="live-badge" class:small={size === 'small'} class:large={size === 'large'}>
	<span class="live-dot"></span>
	LIVE
</span>

<style>
	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.6rem;
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		color: white;
		font-size: 0.6rem;
		font-weight: 700;
		border-radius: 12px;
		letter-spacing: 0.08em;
		box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
	}

	.live-badge.large {
		gap: 0.5rem;
		padding: 0.6rem 1.5rem;
		font-size: 1rem;
		border-radius: 24px;
		letter-spacing: 0.12em;
		box-shadow: 0 0 24px rgba(16, 185, 129, 0.5);
	}

	.live-dot {
		width: 6px;
		height: 6px;
		background: white;
		border-radius: 50%;
		animation: livePulse 1.5s ease-in-out infinite;
	}

	.live-badge.large .live-dot {
		width: 12px;
		height: 12px;
	}

	@keyframes livePulse {
		0%, 100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.4;
			transform: scale(0.75);
		}
	}
</style>
