<script lang="ts">
	import {
		Chart,
		RadarController,
		RadialLinearScale,
		PointElement,
		LineElement,
		Filler,
		Tooltip,
	} from 'chart.js';
	import { getChartColors, getBaseChartOptions } from '$lib/utils/chartTheme';
	import { buildTwentiesPerRoundData, type TwentiesPerRoundData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { MatchHistory } from '$lib/types/history';

	Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

	interface Props {
		matches?: MatchHistory[];
		getUserTeam?: (match: MatchHistory) => 1 | 2 | null;
		precomputedData?: TwentiesPerRoundData;
	}

	let { matches, getUserTeam, precomputedData }: Props = $props();

	let chartKey = $derived(`${$theme}-${precomputedData?.roundLabels.length ?? matches?.length ?? 0}`);

	function initChart(canvas: HTMLCanvasElement) {
		const perRoundData = precomputedData ?? buildTwentiesPerRoundData(matches!, getUserTeam!);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		const chart = new Chart(canvas, {
			type: 'radar',
			data: {
				labels: perRoundData.roundLabels,
				datasets: [{
					data: perRoundData.averages,
					backgroundColor: `${colors.twenties}30`,
					borderColor: colors.twenties,
					borderWidth: 2,
					pointBackgroundColor: colors.twenties,
					pointBorderColor: colors.twenties,
					pointRadius: 4,
					pointHoverRadius: 6,
					fill: true,
				}],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { display: false },
					tooltip: { enabled: false },
				},
				scales: {
					r: {
						beginAtZero: true,
						ticks: {
							stepSize: 1,
							color: colors.mutedForeground,
							backdropColor: colors.card,
							backdropPadding: 2,
							font: { size: 10 },
						},
						grid: {
							color: `${colors.border}60`,
						},
						angleLines: {
							color: `${colors.border}60`,
						},
						pointLabels: {
							color: colors.foreground,
							font: { size: 12, weight: 'bold' as const },
							callback(label: string, idx: number) {
								return `${label} (${perRoundData.averages[idx]})`;
							},
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
