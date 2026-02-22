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
	} from 'chart.js';
	import { getChartColors, getBaseChartOptions, BUMP_CHART_COLORS } from '$lib/utils/chartTheme';
	import { buildBumpChartData } from '$lib/utils/chartData';
	import { theme } from '$lib/stores/theme';
	import type { Group, TournamentParticipant, QualificationMode } from '$lib/types/tournament';
	import { getParticipantDisplayName } from '$lib/types/tournament';

	Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

	interface Props {
		group: Group;
		participants: TournamentParticipant[];
		isSwiss?: boolean;
		qualificationMode?: QualificationMode;
		isDoubles?: boolean;
	}

	let { group, participants, isSwiss = false, qualificationMode = 'WINS', isDoubles = false }: Props = $props();

	let chartKey = $derived(`${$theme}-${group.id}-${participants.length}`);

	function getParticipantNames() {
		const map = new Map<string, string>();
		for (const p of participants) {
			map.set(p.id, getParticipantDisplayName(p, isDoubles));
		}
		return map;
	}

	let hasEnoughRounds = $derived((() => {
		const bumpData = buildBumpChartData(group, getParticipantNames(), isSwiss, qualificationMode);
		return bumpData.roundLabels.length >= 2;
	})());

	function initChart(canvas: HTMLCanvasElement) {
		const bumpData = buildBumpChartData(group, getParticipantNames(), isSwiss, qualificationMode);
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);
		const maxPosition = group.participants.length;

		const chart = new Chart(canvas, {
			type: 'line',
			data: {
				labels: bumpData.roundLabels,
				datasets: bumpData.datasets.map((ds, i) => {
					const color = BUMP_CHART_COLORS[i % BUMP_CHART_COLORS.length];
					return {
						label: ds.participantName,
						data: ds.positions,
						borderColor: color,
						backgroundColor: color,
						pointBackgroundColor: color,
						pointRadius: 5,
						pointHoverRadius: 7,
						borderWidth: 2.5,
						tension: 0.3,
						fill: false,
					};
				}),
			},
			options: {
				...base,
				plugins: {
					...base.plugins,
					legend: {
						position: 'bottom',
						labels: {
							color: colors.mutedForeground,
							font: { size: 10 },
							padding: 8,
							usePointStyle: true,
							pointStyleWidth: 8,
							boxWidth: 8,
						},
					},
					tooltip: {
						...base.plugins.tooltip,
						callbacks: {
							title(items: any[]) {
								if (!items.length) return '';
								return items[0].label || '';
							},
							label(ctx: any) {
								return ` ${ctx.dataset.label}: ${ctx.parsed.y}º`;
							},
						},
					},
				},
				scales: {
					x: { ...base.scales.x, type: 'category' },
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

{#if hasEnoughRounds}
	{#key chartKey}
		<canvas use:initChart></canvas>
	{/key}
{/if}
