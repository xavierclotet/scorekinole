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
	import { buildTwentiesAccuracyData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';
	import type { MatchHistory } from '$lib/types/history';

	Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

	interface Props {
		matches: MatchHistory[];
		getUserTeam: (match: MatchHistory) => 1 | 2 | null;
		getOpponentName: (match: MatchHistory) => string;
	}

	let { matches, getUserTeam, getOpponentName }: Props = $props();

	let chartKey = $derived(`${$theme}-${matches.length}`);

	function initChart(canvas: HTMLCanvasElement) {
		const twentiesData = buildTwentiesAccuracyData(matches, getUserTeam, getOpponentName);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);
		const hasSingles = twentiesData.singlesPoints.length > 0;
		const hasDoubles = twentiesData.doublesPoints.length > 0;

		const datasets: any[] = [];

		if (hasSingles) {
			datasets.push({
				label: m.scoring_singles(),
				data: twentiesData.singlesPoints.map(p => ({ x: p.date, y: p.percentage })),
				borderColor: colors.singles,
				backgroundColor: `${colors.singles}20`,
				pointBackgroundColor: colors.singles,
				pointRadius: 3,
				pointHoverRadius: 5,
				tension: 0.3,
				fill: false,
			});
			if (twentiesData.singlesMA.length > 1) {
				datasets.push({
					label: `${m.scoring_singles()} (${m.stats_movingAverage()})`,
					data: twentiesData.singlesPoints.map((p, i) => ({ x: p.date, y: twentiesData.singlesMA[i] })),
					borderColor: colors.singles,
					borderDash: [5, 5],
					pointRadius: 0,
					tension: 0.4,
					fill: false,
				});
			}
		}

		if (hasDoubles) {
			datasets.push({
				label: m.scoring_doubles(),
				data: twentiesData.doublesPoints.map(p => ({ x: p.date, y: p.percentage })),
				borderColor: colors.doubles,
				backgroundColor: `${colors.doubles}20`,
				pointBackgroundColor: colors.doubles,
				pointRadius: 3,
				pointHoverRadius: 5,
				tension: 0.3,
				fill: false,
			});
			if (twentiesData.doublesMA.length > 1) {
				datasets.push({
					label: `${m.scoring_doubles()} (${m.stats_movingAverage()})`,
					data: twentiesData.doublesPoints.map((p, i) => ({ x: p.date, y: twentiesData.doublesMA[i] })),
					borderColor: colors.doubles,
					borderDash: [5, 5],
					pointRadius: 0,
					tension: 0.4,
					fill: false,
				});
			}
		}

		const labels = hasSingles
			? twentiesData.singlesPoints.map(p => p.date)
			: twentiesData.doublesPoints.map(p => p.date);

		const chart = new Chart(canvas, {
			type: 'line',
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
								return items[0].raw?.x || items[0].label || '';
							},
							label(ctx: any) {
								return ` ${ctx.dataset.label}: ${ctx.raw?.y ?? ctx.parsed.y}%`;
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
