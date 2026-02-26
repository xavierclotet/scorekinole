<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { normalizeTier } from '$lib/types/tournament';
	import { TIER_COLORS } from '$lib/constants';

	interface Props {
		tier: string;
		class?: string;
	}

	let { tier, class: className = '' }: Props = $props();

	const TIER_LABELS: Record<string, () => string> = {
		SERIES_35: () => m.tournaments_seriesThirtyFive(),
		SERIES_25: () => m.tournaments_seriesTwentyFive(),
		SERIES_15: () => m.tournaments_seriesFifteen()
	};

	let normalized = $derived(normalizeTier(tier));
	let color = $derived(TIER_COLORS[normalized] || '#9ca3af');
	let label = $derived(TIER_LABELS[normalized]?.() || normalized);
</script>

<span class={['tier-badge', className]} style:--tier-color={color}>
	{label}
</span>

<style>
	.tier-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.15rem 0.45rem;
		border-radius: 4px;
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		background: color-mix(in srgb, var(--tier-color) 20%, transparent);
		border: 1px solid color-mix(in srgb, var(--tier-color) 40%, transparent);
		color: var(--tier-color);
		white-space: nowrap;
	}
</style>
