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
	import { buildTwentiesStreakData } from '$lib/utils/chartData';
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
		const streakData = buildTwentiesStreakData(matches, getUserTeam);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		const chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: [m.stats_bestStreak(), m.stats_currentStreak(), m.stats_avgStreak()],
				datasets: [{
					data: [streakData.bestStreak, streakData.currentStreak, streakData.averageStreak],
					backgroundColor: [colors.twenties, `${colors.twenties}aa`, `${colors.twenties}66`],
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
								return ` ${ctx.parsed.x} ${m.stats_rounds()}`;
							},
						},
					},
				},
				scales: {
					x: {
						...base.scales.x,
						beginAtZero: true,
						ticks: {
							...base.scales.x.ticks,
							stepSize: 1,
						},
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
