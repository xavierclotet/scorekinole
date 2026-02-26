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
		highlightedParticipants?: string[];
	}

	let { group, participants, isSwiss = false, qualificationMode = 'WINS', isDoubles = false, highlightedParticipants = [] }: Props = $props();

	let hasHighlight = $derived(highlightedParticipants.length > 0);
	let highlightSet = $derived(new Set(highlightedParticipants));
	let chartKey = $derived(`${$theme}-${group.id}-${participants.length}-${highlightedParticipants.join(',')}`);

	function getParticipantNames() {
		const map = new Map<string, string>();
		for (const p of participants) {
			map.set(p.id, getParticipantDisplayName(p, isDoubles));
		}
		return map;
	}

	let bumpData = $derived(buildBumpChartData(group, getParticipantNames(), isSwiss, qualificationMode));
	let hasEnoughRounds = $derived(bumpData.roundLabels.length >= 2);

	// Legend items for highlighted participants
	let highlightLegend = $derived.by(() => {
		if (!hasHighlight) return [];
		return bumpData.datasets
			.map((ds, i) => ({
				id: ds.participantId,
				name: ds.participantName,
				color: BUMP_CHART_COLORS[i % BUMP_CHART_COLORS.length],
			}))
			.filter(item => highlightSet.has(item.id))
			.toSorted((a, b) => a.name.localeCompare(b.name));
	});

	function initChart(canvas: HTMLCanvasElement) {
		const colors = getChartColors();
		const base = getBaseChartOptions(colors);
		const maxPosition = group.participants.length;

		const chart = new Chart(canvas, {
			type: 'line',
			data: {
				labels: bumpData.roundLabels,
				datasets: bumpData.datasets.map((ds, i) => {
					const color = BUMP_CHART_COLORS[i % BUMP_CHART_COLORS.length];
					const isActive = !hasHighlight || highlightSet.has(ds.participantId);
					return {
						label: ds.participantName,
						data: ds.positions,
						borderColor: isActive ? color : `${color}1A`,
						backgroundColor: isActive ? color : `${color}1A`,
						pointBackgroundColor: isActive ? color : `${color}1A`,
						pointRadius: isActive ? (hasHighlight ? 5 : 4) : 0,
						pointHoverRadius: isActive ? (hasHighlight ? 8 : 6) : 0,
						borderWidth: isActive ? (hasHighlight ? 3.5 : 2.5) : 1,
						tension: 0.3,
						fill: false,
						order: isActive ? 0 : 1,
					};
				}),
			},
			options: {
				...base,
				plugins: {
					...base.plugins,
					legend: {
						display: !hasHighlight,
						position: 'bottom',
						labels: {
							color: colors.mutedForeground,
							font: { size: 10 },
							padding: 8,
							usePointStyle: true,
							pointStyle: 'circle',
							boxWidth: 6,
							boxHeight: 6,
						},
					},
					tooltip: {
						...base.plugins.tooltip,
						filter: hasHighlight
							? (item: any) => {
								const ds = bumpData.datasets[item.datasetIndex];
								return ds ? highlightSet.has(ds.participantId) : true;
							}
							: undefined,
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
					x: { ...base.scales.x, type: 'category', grid: { display: false }, border: { display: false } },
					y: {
						...base.scales.y,
						grid: { display: false },
						border: { display: false },
						reverse: true,
						min: 0.5,
						max: maxPosition + 0.5,
						afterBuildTicks: (axis: any) => {
							axis.ticks = [];
							for (let i = 1; i <= maxPosition; i++) {
								axis.ticks.push({ value: i });
							}
						},
						ticks: {
							...base.scales.y.ticks,
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
	{#if highlightLegend.length > 0}
		<div class="highlight-legend">
			{#each highlightLegend as item}
				<span class="highlight-legend-item">
					<span class="highlight-legend-dot" style="background:{item.color}"></span>
					{item.name}
				</span>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.highlight-legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem 0.75rem;
		padding: 0.4rem 0.5rem 0;
	}

	.highlight-legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.7rem;
		color: var(--muted-foreground);
	}

	.highlight-legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>
