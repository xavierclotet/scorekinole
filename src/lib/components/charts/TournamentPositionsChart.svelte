<script lang="ts">
	import {
		Chart,
		ScatterController,
		LineElement,
		PointElement,
		LinearScale,
		Tooltip,
		Legend,
	} from 'chart.js';
	import { getChartColors, getBaseChartOptions } from '$lib/utils/chartTheme';
	import { buildTournamentPositionsData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { TournamentRecord } from '$lib/types/tournament';

	Chart.register(ScatterController, LineElement, PointElement, LinearScale, Tooltip, Legend);

	interface Props {
		records: TournamentRecord[];
		year: string;
	}

	let { records, year }: Props = $props();

	let chartKey = $derived(`${$theme}-${records.length}-${year}`);

	function initChart(canvas: HTMLCanvasElement) {
		const positionsData = buildTournamentPositionsData(records, year);
		if (positionsData.length === 0) return { destroy() {} };

		const colors = getChartColors();
		const base = getBaseChartOptions(colors);
		const maxPosition = Math.max(...positionsData.map(p => p.position), 1);

		const chart = new Chart(canvas, {
			type: 'scatter',
			data: {
				datasets: [{
					label: m.stats_position(),
					data: positionsData.map((p, i) => ({ x: i, y: p.position })),
					backgroundColor: positionsData.map(p => {
						if (p.position === 1) return '#fbbf24';
						if (p.position === 2) return '#9ca3af';
						if (p.position === 3) return '#b45309';
						return colors.primary;
					}),
					pointRadius: positionsData.map(p =>
						Math.max(5, Math.min(12, Math.sqrt(p.totalParticipants) * 2))
					),
					pointHoverRadius: positionsData.map(p =>
						Math.max(7, Math.min(14, Math.sqrt(p.totalParticipants) * 2 + 2))
					),
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
								if (idx == null || !positionsData[idx]) return '';
								return positionsData[idx].tournamentName;
							},
							label(ctx: any) {
								const idx = ctx.dataIndex;
								if (!positionsData[idx]) return '';
								const p = positionsData[idx];
								return [
									` ${p.position}º / ${p.totalParticipants}`,
									` +${p.pointsEarned} pts`,
									` ${p.date}`,
								];
							},
						},
					},
				},
				scales: {
					x: {
						...base.scales.x,
						type: 'linear',
						display: true,
						ticks: {
							...base.scales.x.ticks,
							callback(value: number | string) {
								const idx = typeof value === 'number' ? Math.round(value) : parseInt(value);
								if (Number.isInteger(idx) && idx >= 0 && idx < positionsData.length) {
									return positionsData[idx].date;
								}
								return '';
							},
							stepSize: 1,
						},
						min: -0.5,
						max: positionsData.length - 0.5,
					},
					y: {
						...base.scales.y,
						reverse: true,
						min: 0.5,
						max: maxPosition + 0.5,
						ticks: {
							...base.scales.y.ticks,
							stepSize: 1,
							callback: (value: number | string) => `${value}º`,
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
