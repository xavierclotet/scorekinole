<script lang="ts">
	import {
		Chart,
		DoughnutController,
		ArcElement,
		Tooltip,
		type Plugin,
	} from 'chart.js';
	import { getChartColors, getBaseChartOptions } from '$lib/utils/chartTheme';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';

	Chart.register(DoughnutController, ArcElement, Tooltip);

	interface Props {
		singlesPercentage: number | null;
		doublesPercentage: number | null;
		combinedPercentage: string;
		singlesTwenties: number;
		doublesTwenties: number;
	}

	let { singlesPercentage, doublesPercentage, combinedPercentage, singlesTwenties, doublesTwenties }: Props = $props();

	let chartKey = $derived(`${$theme}-${singlesPercentage}-${doublesPercentage}`);

	function initChart(canvas: HTMLCanvasElement) {
		const colors = getChartColors();
		const hasSingles = singlesPercentage !== null;
		const hasDoubles = doublesPercentage !== null;
		const sVal = singlesPercentage ?? 0;
		const dVal = doublesPercentage ?? 0;

		const datasets: any[] = [];

		if (hasSingles) {
			datasets.push({
				data: [sVal, 100 - sVal],
				backgroundColor: [colors.singles, `${colors.border}30`],
				borderWidth: 0,
				weight: 2,
			});
		}

		if (hasDoubles) {
			datasets.push({
				data: [dVal, 100 - dVal],
				backgroundColor: [colors.doubles, `${colors.border}30`],
				borderWidth: 0,
				weight: hasSingles ? 1.5 : 2,
			});
		}

		const centerTextPlugin: Plugin<'doughnut'> = {
			id: 'accuracyCenter',
			afterDraw(chart) {
				const { ctx, chartArea } = chart;
				if (!chartArea) return;
				const c = getChartColors();
				const centerX = (chartArea.left + chartArea.right) / 2;
				const centerY = (chartArea.top + chartArea.bottom) / 2;

				ctx.save();
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';

				ctx.font = 'bold 1.25rem system-ui, sans-serif';
				ctx.fillStyle = c.twenties;
				ctx.fillText(`${combinedPercentage}%`, centerX, centerY - 2);

				ctx.font = '0.55rem system-ui, sans-serif';
				ctx.fillStyle = c.mutedForeground;
				ctx.fillText('20s', centerX, centerY + 13);

				ctx.restore();
			},
		};

		const chart = new Chart(canvas, {
			type: 'doughnut',
			data: {
				labels: [m.stats_accuracy(), ''],
				datasets,
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				cutout: hasSingles && hasDoubles ? '55%' : '60%',
				plugins: {
					legend: { display: false },
					tooltip: {
						...getBaseChartOptions(colors).plugins.tooltip,
						filter(item: any) {
							return item.dataIndex === 0;
						},
						callbacks: {
							title() { return ''; },
							label(ctx: any) {
								if (ctx.datasetIndex === 0) return ` ${m.scoring_singles()}: ${sVal}% (${singlesTwenties})`;
								return ` ${m.scoring_doubles()}: ${dVal}% (${doublesTwenties})`;
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
