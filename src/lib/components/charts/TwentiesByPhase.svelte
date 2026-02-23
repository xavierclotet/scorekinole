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
	import { buildTwentiesByPhaseData } from '$lib/utils/chartData';
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
		const phaseData = buildTwentiesByPhaseData(matches, getUserTeam);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		const chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: phaseData.phases.map(p => p.phase),
				datasets: [{
					data: phaseData.phases.map(p => p.avgTwenties),
					backgroundColor: phaseData.phases.map((_, i) => {
						const opacity = 0.5 + (i / Math.max(phaseData.phases.length - 1, 1)) * 0.5;
						const hex = Math.round(opacity * 255).toString(16).padStart(2, '0');
						return `${colors.twenties}${hex}`;
					}),
					hoverBackgroundColor: colors.twenties,
					borderRadius: 6,
					borderSkipped: false,
					barThickness: 28,
				}],
			},
			options: {
				...base,
				indexAxis: 'y' as const,
				plugins: {
					...base.plugins,
					legend: { display: false },
					tooltip: {
						...base.plugins.tooltip,
						callbacks: {
							label(ctx: any) {
								const phase = phaseData.phases[ctx.dataIndex];
								return ` ${m.stats_avgTwenties()}: ${phase.avgTwenties} (${phase.totalRounds} ${m.stats_rounds()})`;
							},
						},
					},
				},
				scales: {
					x: {
						...base.scales.x,
						beginAtZero: true,
					},
					y: {
						...base.scales.y,
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
