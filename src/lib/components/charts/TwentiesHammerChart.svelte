<script lang="ts">
	import { buildTwentiesHammerData } from '$lib/utils/chartData';
	import * as m from '$lib/paraglide/messages.js';
	import type { MatchHistory } from '$lib/types/history';

	interface Props {
		matches: MatchHistory[];
		getUserTeam: (match: MatchHistory) => 1 | 2 | null;
	}

	let { matches, getUserTeam }: Props = $props();

	let data = $derived(buildTwentiesHammerData(matches, getUserTeam));

	let diff = $derived(
		Math.round((data.withHammer.avgTwenties - data.withoutHammer.avgTwenties) * 100) / 100,
	);

	let maxAvg = $derived(
		Math.max(data.withHammer.avgTwenties, data.withoutHammer.avgTwenties, 1),
	);
</script>

<div class="hammer-stat">
	<div class="bucket">
		<span class="bucket-label">{m.stats_withHammer()}</span>
		<div class="bar-track">
			<div
				class="bar-fill with"
				style="width: {(data.withHammer.avgTwenties / maxAvg) * 100}%"
			></div>
		</div>
		<span class="avg">{data.withHammer.avgTwenties}</span>
		<span class="rounds">{data.withHammer.totalRounds} {m.stats_rounds()}</span>
	</div>

	<div class="bucket">
		<span class="bucket-label">{m.stats_withoutHammer()}</span>
		<div class="bar-track">
			<div
				class="bar-fill without"
				style="width: {(data.withoutHammer.avgTwenties / maxAvg) * 100}%"
			></div>
		</div>
		<span class="avg">{data.withoutHammer.avgTwenties}</span>
		<span class="rounds">{data.withoutHammer.totalRounds} {m.stats_rounds()}</span>
	</div>

	{#if diff !== 0}
		<div class="diff-badge" class:positive={diff > 0} class:negative={diff < 0}>
			{diff > 0 ? '+' : ''}{diff} {m.stats_withHammerLabel()}
		</div>
	{/if}
</div>

<style>
	.hammer-stat {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.25rem 0;
	}

	.bucket {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto auto;
		gap: 0.15rem 0.5rem;
		align-items: center;
	}

	.bucket-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--muted-foreground);
		grid-column: 1 / -1;
	}

	.bar-track {
		height: 22px;
		background: color-mix(in srgb, var(--muted) 40%, transparent);
		border-radius: 6px;
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		border-radius: 6px;
		transition: width 0.4s ease;
		min-width: 4px;
	}

	.bar-fill.with {
		background: var(--color-twenties, #f59e0b);
	}

	.bar-fill.without {
		background: color-mix(in srgb, var(--color-twenties, #f59e0b) 50%, transparent);
	}

	.avg {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--foreground);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.rounds {
		font-size: 0.65rem;
		color: var(--muted-foreground);
		grid-column: 1 / -1;
		text-align: right;
	}

	.diff-badge {
		align-self: center;
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		width: fit-content;
		margin: 0 auto;
	}

	.diff-badge.positive {
		background: color-mix(in srgb, var(--color-twenties, #f59e0b) 15%, transparent);
		color: var(--color-twenties, #f59e0b);
	}

	.diff-badge.negative {
		background: color-mix(in srgb, var(--destructive) 15%, transparent);
		color: var(--destructive);
	}
</style>
