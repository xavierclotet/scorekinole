<script lang="ts">
	import {
		Chart,
		DoughnutController,
		ArcElement,
		Tooltip,
		type Plugin,
	} from 'chart.js';
	import { getChartColors, getBaseChartOptions } from '$lib/utils/chartTheme';
	import { buildTwentiesGaugeData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { MatchHistory } from '$lib/types/history';

	Chart.register(DoughnutController, ArcElement, Tooltip);

	interface Props {
		matches: MatchHistory[];
		getUserTeam: (match: MatchHistory) => 1 | 2 | null;
	}

	let { matches, getUserTeam }: Props = $props();

	let chartKey = $derived(`${$theme}-${matches.length}`);

	function initChart(canvas: HTMLCanvasElement) {
		const gaugeData = buildTwentiesGaugeData(matches, getUserTeam);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		const centerTextPlugin: Plugin<'doughnut'> = {
			id: 'gaugeCenter',
			afterDraw(chart) {
				const { ctx, chartArea } = chart;
				if (!chartArea) return;
				const c = getChartColors();
				const centerX = (chartArea.left + chartArea.right) / 2;
				const centerY = chartArea.bottom - 10;

				ctx.save();
				ctx.textAlign = 'center';
				ctx.textBaseline = 'bottom';

				// Recent percentage (large)
				ctx.font = 'bold 1.5rem system-ui, sans-serif';
				ctx.fillStyle = c.twenties;
				ctx.fillText(`${gaugeData.recentPercentage}%`, centerX, centerY - 8);

				// Label
				ctx.font = '0.65rem system-ui, sans-serif';
				ctx.fillStyle = c.mutedForeground;
				ctx.fillText(m.stats_recentVsHistorical(), centerX, centerY + 8);

				ctx.restore();
			},
		};

		const chart = new Chart(canvas, {
			type: 'doughnut',
			data: {
				labels: [m.stats_recent(), ''],
				datasets: [
					// Outer ring: recent accuracy
					{
						data: [gaugeData.recentPercentage, 100 - gaugeData.recentPercentage],
						backgroundColor: [colors.twenties, `${colors.border}40`],
						borderWidth: 0,
						circumference: 180,
						rotation: -90,
						weight: 2,
					},
					// Inner ring: historical average
					{
						data: [gaugeData.historicalPercentage, 100 - gaugeData.historicalPercentage],
						backgroundColor: [`${colors.twenties}60`, `${colors.border}20`],
						borderWidth: 0,
						circumference: 180,
						rotation: -90,
						weight: 1,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				cutout: '60%',
				plugins: {
					legend: { display: false },
					tooltip: {
						...base.plugins.tooltip,
						filter(item: any) {
							return item.dataIndex === 0;
						},
						callbacks: {
							label(ctx: any) {
								if (ctx.datasetIndex === 0) return ` ${m.stats_recent()}: ${gaugeData.recentPercentage}%`;
								return ` ${m.stats_historical()}: ${gaugeData.historicalPercentage}%`;
							},
						},
					},
				},
			},
			plugins: [centerTextPlugin],
		});

		return { destroy() { chart.destroy(); } };
	}
</script>

{#key chartKey}
	<canvas use:initChart></canvas>
{/key}
