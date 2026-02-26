<script lang="ts">
	import {
		Chart,
		BarController,
		BarElement,
		LinearScale,
		CategoryScale,
		Tooltip,
		Legend,
	} from 'chart.js';
	import { getChartColors, getBaseChartOptions, BUMP_CHART_COLORS } from '$lib/utils/chartTheme';
	import { buildTwentiesGroupedData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import type { Group, TournamentParticipant } from '$lib/types/tournament';
	import { getParticipantDisplayName } from '$lib/types/tournament';

	Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip, Legend);

	interface Props {
		group: Group;
		participants: TournamentParticipant[];
		isSwiss?: boolean;
		isDoubles?: boolean;
		highlightedParticipants?: string[];
	}

	let { group, participants, isSwiss = false, isDoubles = false, highlightedParticipants = [] }: Props = $props();

	let hasHighlight = $derived(highlightedParticipants.length > 0);
	let highlightSet = $derived(new Set(highlightedParticipants));
	let chartKey = $derived(`${$theme}-twenties-${group.id}-${participants.length}-${highlightedParticipants.join(',')}`);

	function getParticipantNames() {
		const map = new Map<string, string>();
		for (const p of participants) {
			map.set(p.id, getParticipantDisplayName(p, isDoubles));
		}
		return map;
	}

	let barData = $derived(buildTwentiesGroupedData(group, getParticipantNames(), isSwiss));
	let hasData = $derived(barData.roundLabels.length >= 1 && barData.datasets.some(ds => ds.twentiesPerRound.some(v => v > 0)));

	let highlightLegend = $derived.by(() => {
		if (!hasHighlight) return [];
		return barData.datasets
			.map((ds, i) => ({
				id: ds.participantId,
				name: ds.participantName,
				color: BUMP_CHART_COLORS[i % BUMP_CHART_COLORS.length],
			}))
			.filter(item => highlightSet.has(item.id))
			.toSorted((a, b) => a.name.localeCompare(b.name));
	});

	function initChart(canvas: HTMLCanvasElement) {
		if (barData.roundLabels.length === 0) return { destroy() {} };

		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		const chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: barData.roundLabels,
				datasets: barData.datasets.map((ds, i) => {
					const color = BUMP_CHART_COLORS[i % BUMP_CHART_COLORS.length];
					const isActive = !hasHighlight || highlightSet.has(ds.participantId);
					return {
						label: ds.participantName,
						data: ds.twentiesPerRound,
						backgroundColor: isActive ? `${color}cc` : `${color}15`,
						hoverBackgroundColor: isActive ? color : `${color}15`,
						borderRadius: 3,
					};
				}),
			},
			options: {
				...base,
				plugins: {
					...base.plugins,
					legend: {
						display: !hasHighlight,
						position: 'bottom',
						labels: {
							color: colors.mutedForeground,
							font: { size: 10 },
							padding: 8,
							usePointStyle: true,
							pointStyle: 'circle',
							boxWidth: 6,
							boxHeight: 6,
						},
					},
					tooltip: {
						...base.plugins.tooltip,
						filter: hasHighlight
							? (item: any) => {
								const ds = barData.datasets[item.datasetIndex];
								return ds ? highlightSet.has(ds.participantId) : true;
							}
							: undefined,
						callbacks: {
							title(items: any[]) {
								if (!items.length) return '';
								return items[0].label || '';
							},
							label(ctx: any) {
								return ` ${ctx.dataset.label}: ${ctx.parsed.y} 20s`;
							},
						},
					},
				},
				scales: {
					x: { ...base.scales.x, type: 'category', grid: { display: false }, border: { display: false } },
					y: {
						...base.scales.y,
						grid: { display: false },
						border: { display: false },
						beginAtZero: true,
						ticks: {
							...base.scales.y.ticks,
							stepSize: 1,
							callback: (value: number | string) => {
								const n = typeof value === 'number' ? value : parseFloat(value);
								return Number.isInteger(n) ? `${n}` : '';
							},
						},
					},
				},
			},
		});

		return { destroy() { chart.destroy(); } };
	}
</script>

{#if hasData}
	{#key chartKey}
		<canvas use:initChart></canvas>
	{/key}
	{#if highlightLegend.length > 0}
		<div class="highlight-legend">
			{#each highlightLegend as item}
				<span class="highlight-legend-item">
					<span class="highlight-legend-dot" style="background:{item.color}"></span>
					{item.name}
				</span>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.highlight-legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem 0.75rem;
		padding: 0.4rem 0.5rem 0;
	}

	.highlight-legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.7rem;
		color: var(--muted-foreground);
	}

	.highlight-legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>
