import type { CounterBlock, PlayerStats } from '$lib/types/playerStats';

export type MetricKind = 'avg' | 'record';
export type MetricFamily = 'twenties' | 'hammer' | 'clutch' | 'results';
export type MetricFormat = 'decimal' | 'percent' | 'int';

export interface MetricDescriptor {
  id: string;
  family: MetricFamily;
  kind: MetricKind;
  format: MetricFormat;
  labelKey: string;
  compute: (block: CounterBlock, stats: PlayerStats) => number | null;
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export const METRICS: MetricDescriptor[] = [
  { id: 'twentiesPerRound', family: 'twenties', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerRound', compute: (b) => div(b.twenties, b.rounds) },
  { id: 'twentiesPerGame', family: 'twenties', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerGame', compute: (b) => div(b.twenties, b.games) },
  { id: 'roundsWithTwentyPct', family: 'twenties', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_roundsWithTwentyPct', compute: (b) => div(b.roundsWithTwenty, b.rounds) },
  { id: 'perfectRoundsPct', family: 'twenties', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_perfectRoundsPct', compute: (b) => div(b.perfectRounds, b.rounds) },
  { id: 'maxTwentiesInRound', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInRound', compute: (_b, s) => s.records.maxTwentiesInRound?.value ?? null },
  { id: 'maxTwentiesInGame', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInGame', compute: (_b, s) => s.records.maxTwentiesInGame?.value ?? null },

  { id: 'pctTwentiesWithHammer', family: 'hammer', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_pctTwentiesWithHammer', compute: (b) => div(b.hammerTwenties, b.twenties) },
  { id: 'twentiesPerHammerRound', family: 'hammer', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerHammerRound', compute: (b) => div(b.hammerTwenties, b.hammerRounds) },
  { id: 'twentiesPerNonHammerRound', family: 'hammer', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerNonHammerRound', compute: (b) => div(b.nonHammerTwenties, b.nonHammerRounds) },
  { id: 'hammerDifferential', family: 'hammer', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_hammerDifferential', compute: (b) => {
      const w = div(b.hammerTwenties, b.hammerRounds); const n = div(b.nonHammerTwenties, b.nonHammerRounds);
      return w === null || n === null ? null : w - n; } },
  { id: 'hammerRoundWinPct', family: 'hammer', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_hammerRoundWinPct', compute: (b) => div(b.hammerRoundsWon, b.hammerRounds) },

  { id: 'koTwentiesPerRound', family: 'clutch', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_koTwentiesPerRound', compute: (b) => div(b.koTwenties, b.koRounds) },
  { id: 'koWinRate', family: 'clutch', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_koWinRate', compute: (b) => div(b.koMatchesWon, b.koMatches) },
  { id: 'clutchDifferential', family: 'clutch', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_clutchDifferential', compute: (b) => {
      const k = div(b.koTwenties, b.koRounds); const g = div(b.groupTwenties, b.groupRounds);
      return k === null || g === null ? null : k - g; } },
  { id: 'finalsWinRate', family: 'clutch', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_finalsWinRate', compute: (b) => div(b.finalsWon, b.finalsPlayed) },

  { id: 'matchWinRate', family: 'results', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_matchWinRate', compute: (b) => div(b.matchesWon, b.matches) },
  { id: 'roundWinRate', family: 'results', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_roundWinRate', compute: (b) => div(b.roundsWon, b.rounds) },
  { id: 'avgMargin', family: 'results', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_avgMargin', compute: (b) => div(b.marginSum, b.marginWins) },
  { id: 'matchesPlayed', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_matchesPlayed', compute: (b) => b.matches || null },
  { id: 'singlesTitles', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_singlesTitles', compute: (_b, s) => s.singlesTitles || null },
  { id: 'singlesPodiums', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_singlesPodiums', compute: (_b, s) => s.singlesPodiums || null },
  { id: 'bestWinStreak', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_bestWinStreak', compute: (_b, s) => s.records.bestWinStreak || null },
  { id: 'doublesTitles', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_doublesTitles', compute: (_b, s) => s.doublesTitles || null },
];

const BY_ID = new Map(METRICS.map((m) => [m.id, m]));
export function getMetric(id: string): MetricDescriptor {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Unknown metric: ${id}`);
  return m;
}

export function formatMetric(m: MetricDescriptor, value: number): string {
  if (m.format === 'percent') return `${Math.round(value * 100)}%`;
  if (m.format === 'int') return String(Math.round(value));
  return value.toFixed(2);
}
