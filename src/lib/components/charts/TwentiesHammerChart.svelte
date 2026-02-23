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
	import { buildTwentiesHammerData } from '$lib/utils/chartData';
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
		const hammerData = buildTwentiesHammerData(matches, getUserTeam);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		const chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: [m.stats_withHammer(), m.stats_withoutHammer()],
				datasets: [{
					label: m.stats_avgTwenties(),
					data: [hammerData.withHammer.avgTwenties, hammerData.withoutHammer.avgTwenties],
					backgroundColor: [colors.twenties, `${colors.twenties}80`],
					borderRadius: 6,
					borderSkipped: false,
					barThickness: 32,
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
								const bucket = ctx.dataIndex === 0 ? hammerData.withHammer : hammerData.withoutHammer;
								return [
									` ${m.stats_avgTwenties()}: ${bucket.avgTwenties}`,
									` ${m.stats_rounds()}: ${bucket.totalRounds}`,
								];
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
