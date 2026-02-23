<script lang="ts">
	import {
		Chart,
		BarController,
		BarElement,
		LineController,
		LineElement,
		PointElement,
		LinearScale,
		CategoryScale,
		Tooltip,
		Legend,
	} from 'chart.js';
	import { getChartColors, getBaseChartOptions } from '$lib/utils/chartTheme';
	import { buildTwentiesAccuracyData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { MatchHistory } from '$lib/types/history';

	Chart.register(BarController, BarElement, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

	interface Props {
		matches: MatchHistory[];
		getUserTeam: (match: MatchHistory) => 1 | 2 | null;
		getOpponentName: (match: MatchHistory) => string;
	}

	let { matches, getUserTeam, getOpponentName }: Props = $props();

	let chartKey = $derived(`${$theme}-${matches.length}`);

	function initChart(canvas: HTMLCanvasElement) {
		const data = buildTwentiesAccuracyData(matches, getUserTeam, getOpponentName);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);

		// Merge all points in chronological order for a unified timeline
		const allPoints = [
			...data.singlesPoints.map((p, i) => ({ ...p, maValue: data.singlesMA[i] })),
			...data.doublesPoints.map((p, i) => ({ ...p, maValue: data.doublesMA[i] })),
		].sort((a, b) => a.timestamp - b.timestamp);

		if (allPoints.length === 0) return { destroy() {} };

		const labels = allPoints.map(p => p.date);
		const barColors = allPoints.map(p => p.mode === 'doubles' ? colors.doubles : colors.singles);

		const datasets: any[] = [
			{
				type: 'bar' as const,
				label: '% 20s',
				data: allPoints.map(p => p.percentage),
				backgroundColor: barColors.map(c => `${c}99`),
				borderColor: barColors,
				borderWidth: 1,
				borderRadius: 4,
				borderSkipped: false,
				order: 2,
			},
		];

		// Add moving average line if enough data
		if (allPoints.length > 2) {
			// Recompute MA on merged timeline
			const values = allPoints.map(p => p.percentage);
			const window = Math.min(5, values.length);
			const ma: number[] = [];
			for (let i = 0; i < values.length; i++) {
				const start = Math.max(0, i - window + 1);
				const slice = values.slice(start, i + 1);
				ma.push(Math.round((slice.reduce((s, v) => s + v, 0) / slice.length) * 10) / 10);
			}

			datasets.push({
				type: 'line' as const,
				label: m.stats_movingAverage(),
				data: ma,
				borderColor: colors.twenties,
				borderWidth: 2,
				pointRadius: 0,
				pointHoverRadius: 4,
				tension: 0.4,
				fill: false,
				order: 1,
			});
		}

		const chart = new Chart(canvas, {
			type: 'bar',
			data: { labels, datasets },
			options: {
				...base,
				plugins: {
					...base.plugins,
					tooltip: {
						...base.plugins.tooltip,
						callbacks: {
							title(items: any[]) {
								if (!items.length) return '';
								const idx = items[0].dataIndex;
								const p = allPoints[idx];
								return `${p.date} — vs ${p.opponent}`;
							},
							label(ctx: any) {
								if (ctx.dataset.type === 'line') {
									return ` ${ctx.dataset.label}: ${ctx.parsed.y}%`;
								}
								const p = allPoints[ctx.dataIndex];
								return ` ${p.percentage}% (${p.count} × 20s)`;
							},
						},
					},
				},
				scales: {
					...base.scales,
					x: {
						...base.scales.x,
						ticks: {
							...base.scales.x.ticks,
							maxRotation: 45,
							autoSkip: true,
							maxTicksLimit: 12,
						},
					},
					y: {
						...base.scales.y,
						min: 0,
						max: 100,
						ticks: {
							...base.scales.y.ticks,
							callback: (value: number | string) => `${value}%`,
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
