<script lang="ts">
	import {
		Chart,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		CategoryScale,
		Tooltip,
		Legend,
		Filler,
	} from 'chart.js';
	import { getChartColors, getBaseChartOptions } from '$lib/utils/chartTheme';
	import { buildRankingEvolutionData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { TournamentRecord } from '$lib/types/tournament';

	Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

	interface Props {
		records: TournamentRecord[];
		year: string;
	}

	let { records, year }: Props = $props();

	let chartKey = $derived(`${$theme}-${records.length}-${year}`);

	function initChart(canvas: HTMLCanvasElement) {
		const evolutionData = buildRankingEvolutionData(records, year);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		const chart = new Chart(canvas, {
			type: 'line',
			data: {
				labels: evolutionData.map(p => p.date),
				datasets: [{
					label: m.stats_rankingPoints(),
					data: evolutionData.map(p => p.cumulativePoints),
					borderColor: colors.primary,
					backgroundColor: `${colors.primary}20`,
					pointBackgroundColor: colors.primary,
					pointRadius: 5,
					pointHoverRadius: 7,
					tension: 0.3,
					fill: true,
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
								const idx = items[0]?.dataIndex;
								if (idx == null || !evolutionData[idx]) return '';
								return evolutionData[idx].tournamentName;
							},
							label(ctx: any) {
								const idx = ctx.dataIndex;
								if (!evolutionData[idx]) return '';
								const p = evolutionData[idx];
								return [
									` ${m.stats_rankingPoints()}: ${p.cumulativePoints}`,
									` +${p.pointsEarned} pts (${p.position}º / ${p.totalParticipants})`,
								];
							},
						},
					},
				},
				scales: {
					...base.scales,
					y: {
						...base.scales.y,
						beginAtZero: true,
						ticks: {
							...base.scales.y.ticks,
							callback: (value: number | string) => `${value} pts`,
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
