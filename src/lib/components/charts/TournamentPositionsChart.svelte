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
	import { buildTournamentPositionsData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { TournamentRecord } from '$lib/types/tournament';

	Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip);

	interface Props {
		records: TournamentRecord[];
		year: string;
	}

	let { records, year }: Props = $props();

	let chartKey = $derived(`${$theme}-${records.length}-${year}`);

	let positionsData = $derived(buildTournamentPositionsData(records, year));
	let dynamicHeight = $derived(Math.max(120, positionsData.length * 40 + 40));

	function initChart(canvas: HTMLCanvasElement) {
		if (positionsData.length === 0) return { destroy() {} };

		const colors = getChartColors();
		const base = getBaseChartOptions(colors);
		const maxPosition = Math.max(...positionsData.map(p => p.position), 1);

		// Invert data so 1st place = longest bar (visually "better")
		const invertedData = positionsData.map(p => maxPosition + 1 - p.position);

		const chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: positionsData.map(p => p.tournamentName),
				datasets: [{
					label: m.stats_position(),
					data: invertedData,
					backgroundColor: positionsData.map(p => {
						if (p.position === 1) return '#fbbf24';
						if (p.position === 2) return '#9ca3af';
						if (p.position === 3) return '#b45309';
						return colors.primary;
					}),
					borderRadius: 4,
					borderSkipped: false,
					barThickness: 20,
				}],
			},
			options: {
				...base,
				indexAxis: 'y',
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
								const p = positionsData[ctx.dataIndex];
								if (!p) return '';
								const lines = [
									` ${p.position}º / ${p.totalParticipants}`,
								];
								if (p.pointsEarned > 0) lines.push(` +${p.pointsEarned} pts`);
								lines.push(` ${p.date}`);
								return lines;
							},
						},
					},
				},
				scales: {
					y: {
						...base.scales.y,
						ticks: {
							...base.scales.y.ticks,
							autoSkip: false,
							font: { size: 11 },
							callback(this: any, _value: string | number, index: number) {
								const name = positionsData[index]?.tournamentName ?? '';
								return name.length > 18 ? name.slice(0, 16) + '…' : name;
							},
						},
					},
					x: {
						...base.scales.x,
						min: 0,
						max: maxPosition + 1,
						ticks: {
							...base.scales.x.ticks,
							stepSize: 1,
							precision: 0,
							callback: (value: number | string) => {
								const n = typeof value === 'string' ? parseFloat(value) : value;
								if (!Number.isInteger(n) || n <= 0) return '';
								const realPosition = maxPosition + 1 - n;
								return realPosition >= 1 ? `${realPosition}º` : '';
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
	<div style="height: {dynamicHeight}px">
		<canvas use:initChart></canvas>
	</div>
{/key}
