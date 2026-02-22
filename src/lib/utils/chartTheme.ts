/**
 * Chart.js theme utilities
 * Reads CSS custom properties at runtime and returns colors for Chart.js configuration.
 * Supports dark mode by re-resolving colors when theme changes.
 */

export interface ChartColors {
	foreground: string;
	mutedForeground: string;
	border: string;
	card: string;
	primary: string;
	background: string;
	// Semantic colors (fixed, don't change with theme)
	win: string;
	loss: string;
	tie: string;
	twenties: string;
	singles: string;
	doubles: string;
}

/**
 * Read resolved CSS custom properties from :root element.
 * oklch values are resolved to actual colors by getComputedStyle().
 */
export function getChartColors(): ChartColors {
	const style = getComputedStyle(document.documentElement);
	return {
		foreground: style.getPropertyValue('--foreground').trim(),
		mutedForeground: style.getPropertyValue('--muted-foreground').trim(),
		border: style.getPropertyValue('--border').trim(),
		card: style.getPropertyValue('--card').trim(),
		primary: style.getPropertyValue('--primary').trim(),
		background: style.getPropertyValue('--background').trim(),
		win: '#10b981',
		loss: '#ef4444',
		tie: '#6b7280',
		twenties: '#f59e0b',
		singles: '#3b82f6',
		doubles: '#f97316',
	};
}

/** Palette for bump chart lines (distinct, colorblind-friendly) */
export const BUMP_CHART_COLORS = [
	'#3b82f6', // blue
	'#ef4444', // red
	'#10b981', // green
	'#f59e0b', // amber
	'#8b5cf6', // violet
	'#ec4899', // pink
	'#06b6d4', // cyan
	'#f97316', // orange
	'#14b8a6', // teal
	'#a855f7', // purple
	'#e11d48', // rose
	'#84cc16', // lime
	'#6366f1', // indigo
	'#d946ef', // fuchsia
	'#0ea5e9', // sky
	'#eab308', // yellow
];

/** Tier colors for ranking charts */
export const TIER_COLORS: Record<string, string> = {
	CLUB: '#6b7280',
	REGIONAL: '#3b82f6',
	NATIONAL: '#f59e0b',
	MAJOR: '#ef4444',
};

/**
 * Build common Chart.js options for axes, grid, and tooltips
 */
export function getBaseChartOptions(colors: ChartColors) {
	return {
		responsive: true,
		maintainAspectRatio: false,
		interaction: {
			mode: 'nearest' as const,
			intersect: false,
		},
		plugins: {
			legend: {
				labels: {
					color: colors.mutedForeground,
					font: { size: 11 },
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
				titleFont: { size: 12, weight: 'bold' as const },
				bodyFont: { size: 11 },
			},
		},
		scales: {
			x: {
				ticks: { color: colors.mutedForeground, font: { size: 10 } },
				grid: { color: `${colors.border}40` },
				border: { color: colors.border },
			},
			y: {
				ticks: { color: colors.mutedForeground, font: { size: 10 } },
				grid: { color: `${colors.border}40` },
				border: { color: colors.border },
			},
		},
	};
}
