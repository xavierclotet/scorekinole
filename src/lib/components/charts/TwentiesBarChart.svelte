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
	}

	let { group, participants, isSwiss = false, isDoubles = false }: Props = $props();

	let chartKey = $derived(`${$theme}-twenties-${group.id}-${participants.length}`);

	function getParticipantNames() {
		const map = new Map<string, string>();
		for (const p of participants) {
			map.set(p.id, getParticipantDisplayName(p, isDoubles));
		}
		return map;
	}

	let hasData = $derived((() => {
		const data = buildTwentiesGroupedData(group, getParticipantNames(), isSwiss);
		return data.roundLabels.length >= 1 && data.datasets.some(ds => ds.twentiesPerRound.some(v => v > 0));
	})());

	function initChart(canvas: HTMLCanvasElement) {
		const barData = buildTwentiesGroupedData(group, getParticipantNames(), isSwiss);
		if (barData.roundLabels.length === 0) return { destroy() {} };

		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		const chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: barData.roundLabels,
				datasets: barData.datasets.map((ds, i) => {
					const color = BUMP_CHART_COLORS[i % BUMP_CHART_COLORS.length];
					return {
						label: ds.participantName,
						data: ds.twentiesPerRound,
						backgroundColor: `${color}cc`,
						hoverBackgroundColor: color,
						borderRadius: 3,
					};
				}),
			},
			options: {
				...base,
				plugins: {
					...base.plugins,
					legend: {
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
					x: { ...base.scales.x, type: 'category' },
					y: {
						...base.scales.y,
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
{/if}
