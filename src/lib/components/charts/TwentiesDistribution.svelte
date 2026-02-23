<script lang="ts">
	import {
		Chart,
		BarController,
		BarElement,
		LinearScale,
		CategoryScale,
		Tooltip,
	} from 'chart.js';
	import { getChartColors, getBaseChartOptions } from '$lib/utils/chartTheme';
	import { buildTwentiesDistributionData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { MatchHistory } from '$lib/types/history';

	Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip);

	interface Props {
		matches: MatchHistory[];
		getUserTeam: (match: MatchHistory) => 1 | 2 | null;
	}

	let { matches, getUserTeam }: Props = $props();

	let chartKey = $derived(`${$theme}-${matches.length}`);

	function initChart(canvas: HTMLCanvasElement) {
		const distData = buildTwentiesDistributionData(matches, getUserTeam);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		const chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: distData.labels,
				datasets: [{
					label: m.stats_rounds(),
					data: distData.frequencies,
					backgroundColor: `${colors.twenties}cc`,
					hoverBackgroundColor: colors.twenties,
					borderRadius: 6,
					borderSkipped: false,
				}],
			},
			options: {
				...base,
				plugins: {
					...base.plugins,
					legend: { display: false },
					tooltip: {
						...base.plugins.tooltip,
						callbacks: {
							title(items: any[]) {
								if (!items.length) return '';
								return `${items[0].label} 20s`;
							},
							label(ctx: any) {
								return ` ${ctx.parsed.y} ${m.stats_rounds()}`;
							},
						},
					},
				},
				scales: {
					x: {
						...base.scales.x,
						title: { display: true, text: m.stats_twentiesCount(), color: colors.mutedForeground, font: { size: 10 } },
					},
					y: {
						...base.scales.y,
						beginAtZero: true,
						title: { display: true, text: m.stats_rounds(), color: colors.mutedForeground, font: { size: 10 } },
						ticks: {
							...base.scales.y.ticks,
							stepSize: 1,
							callback: (value: number | string) => Number.isInteger(Number(value)) ? `${value}` : '',
						},
					},
				},
			},
		});

		return { destroy() { chart.destroy(); } };
	}
</script>

{#key chartKey}
	<canvas use:initChart></canvas>
{/key}
