<script lang="ts">
	import {
		Chart,
		ArcElement,
		Tooltip,
		Legend,
		DoughnutController,
		type Plugin,
	} from 'chart.js';
	import { getChartColors } from '$lib/utils/chartTheme';
	import { buildWinLossData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import * as m from '$lib/paraglide/messages.js';

	Chart.register(ArcElement, Tooltip, Legend, DoughnutController);

	interface Props {
		wins: number;
		losses: number;
		ties: number;
		total: number;
	}

	let { wins, losses, ties, total }: Props = $props();

	let chartKey = $derived(`${$theme}-${wins}-${losses}-${ties}-${total}`);

	function initChart(canvas: HTMLCanvasElement) {
		const colors = getChartColors();
		const wlData = buildWinLossData(
			wins, losses, ties,
			m.stats_wins(), m.stats_losses(), m.stats_ties(),
		);
		const t = wins + losses + ties;

		const centerTextPlugin: Plugin<'doughnut'> = {
			id: 'centerText',
			afterDraw(chart) {
				const { ctx, chartArea } = chart;
				if (!chartArea) return;
				const c = getChartColors();
				const centerX = (chartArea.left + chartArea.right) / 2;
				const centerY = (chartArea.top + chartArea.bottom) / 2;
				ctx.save();
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.font = 'bold 1.5rem system-ui, sans-serif';
				ctx.fillStyle = c.foreground;
				ctx.fillText(String(total), centerX, centerY - 6);
				ctx.font = '0.6rem system-ui, sans-serif';
				ctx.fillStyle = c.mutedForeground;
				ctx.fillText(m.stats_matchesPlayed(), centerX, centerY + 14);
				ctx.restore();
			},
		};

		const chart = new Chart(canvas, {
			type: 'doughnut',
			data: {
				labels: wlData.labels,
				datasets: [{
					data: wlData.data,
					backgroundColor: wlData.colors,
					borderColor: colors.card,
					borderWidth: 2,
					hoverOffset: 6,
				}],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				cutout: '65%',
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: colors.mutedForeground,
							font: { size: 11 },
							padding: 12,
							usePointStyle: true,
							pointStyleWidth: 8,
						},
					},
					tooltip: {
						backgroundColor: colors.card,
						titleColor: colors.foreground,
						bodyColor: colors.foreground,
						borderColor: colors.border,
						borderWidth: 1,
						padding: 10,
						cornerRadius: 8,
						callbacks: {
							label(ctx: any) {
								const pct = t > 0 ? Math.round((ctx.raw / t) * 100) : 0;
								return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
							},
						},
					},
				},
			},
			plugins: [centerTextPlugin],
		});

		return { destroy() { chart.destroy(); } };
	}
</script>

{#key chartKey}
	<canvas use:initChart></canvas>
{/key}
