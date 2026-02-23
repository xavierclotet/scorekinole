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
	import { buildMatchDurationData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { MatchHistory } from '$lib/types/history';

	Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

	interface Props {
		matches: MatchHistory[];
		getOpponentName: (match: MatchHistory) => string;
	}

	let { matches, getOpponentName }: Props = $props();

	let chartKey = $derived(`${$theme}-${matches.length}`);

	function formatDuration(minutes: number): string {
		if (minutes >= 60) {
			const h = Math.floor(minutes / 60);
			const min = minutes % 60;
			return min > 0 ? `${h}h ${min}m` : `${h}h`;
		}
		return `${minutes} min`;
	}

	function initChart(canvas: HTMLCanvasElement) {
		const data = buildMatchDurationData(matches, getOpponentName);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);
		const hasSingles = data.singlesPoints.length > 0;
		const hasDoubles = data.doublesPoints.length > 0;

		// Build unified labels from all points sorted by timestamp
		const allPoints = [
			...data.singlesPoints.map(p => ({ ...p, type: 'singles' as const })),
			...data.doublesPoints.map(p => ({ ...p, type: 'doubles' as const })),
		].sort((a, b) => a.timestamp - b.timestamp);
		const labels = allPoints.map(p => p.date);

		const datasets: any[] = [];

		if (hasSingles) {
			datasets.push({
				label: m.scoring_singles(),
				data: allPoints.map(p => p.type === 'singles' ? p.durationMinutes : null),
				borderColor: colors.singles,
				backgroundColor: `${colors.singles}40`,
				pointBackgroundColor: colors.singles,
				pointRadius: 5,
				pointHoverRadius: 7,
				tension: 0,
				fill: false,
				spanGaps: false,
				showLine: false,
			});
			// Average line
			if (data.singlesAvg > 0) {
				datasets.push({
					label: `${m.scoring_singles()} (${m.stats_movingAverage()})`,
					data: allPoints.map(() => data.singlesAvg),
					borderColor: colors.singles,
					borderDash: [5, 5],
					pointRadius: 0,
					pointHoverRadius: 0,
					tension: 0,
					fill: false,
					borderWidth: 1.5,
				});
			}
		}

		if (hasDoubles) {
			datasets.push({
				label: m.scoring_doubles(),
				data: allPoints.map(p => p.type === 'doubles' ? p.durationMinutes : null),
				borderColor: colors.doubles,
				backgroundColor: `${colors.doubles}40`,
				pointBackgroundColor: colors.doubles,
				pointRadius: 5,
				pointHoverRadius: 7,
				tension: 0,
				fill: false,
				spanGaps: false,
				showLine: false,
			});
			// Average line
			if (data.doublesAvg > 0) {
				datasets.push({
					label: `${m.scoring_doubles()} (${m.stats_movingAverage()})`,
					data: allPoints.map(() => data.doublesAvg),
					borderColor: colors.doubles,
					borderDash: [5, 5],
					pointRadius: 0,
					pointHoverRadius: 0,
					tension: 0,
					fill: false,
					borderWidth: 1.5,
				});
			}
		}

		const chart = new Chart(canvas, {
			type: 'line',
			data: { labels, datasets },
			options: {
				...base,
				plugins: {
					...base.plugins,
					tooltip: {
						...base.plugins.tooltip,
						filter(item: any) {
							// Hide tooltip for average lines
							return item.dataset.borderDash === undefined;
						},
						callbacks: {
							title(items: any[]) {
								if (!items.length) return '';
								const idx = items[0].dataIndex;
								const point = allPoints[idx];
								return point?.date || '';
							},
							label(ctx: any) {
								const idx = ctx.dataIndex;
								const point = allPoints[idx];
								if (!point) return '';
								const dur = formatDuration(point.durationMinutes);
								return ` ${point.opponent}: ${dur}`;
							},
						},
					},
				},
				scales: {
					...base.scales,
					x: { ...base.scales.x, type: 'category' },
					y: {
						...base.scales.y,
						min: 0,
						ticks: {
							...base.scales.y.ticks,
							callback: (value: number | string) => `${value}'`,
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
