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
  descKey: string;
  compute: (block: CounterBlock, stats: PlayerStats) => number | null;
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export const METRICS: MetricDescriptor[] = [
  { id: 'twentiesPerRound', family: 'twenties', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerRound', descKey: 'leaderboards_d_twentiesPerRound', compute: (b) => div(b.twenties, b.rounds) },
  { id: 'roundsWithTwentyPct', family: 'twenties', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_roundsWithTwentyPct', descKey: 'leaderboards_d_roundsWithTwentyPct', compute: (b) => div(b.roundsWithTwenty, b.rounds) },
  { id: 'perfectRoundsPct', family: 'twenties', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_perfectRoundsPct', descKey: 'leaderboards_d_perfectRoundsPct', compute: (b) => div(b.perfectRounds, b.rounds) },
  { id: 'maxTwentiesInRound', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInRound', descKey: 'leaderboards_d_maxTwentiesInRound', compute: (_b, s) => s.records.maxTwentiesInRound?.value ?? null },
  { id: 'maxTwentiesInGame4r', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInGame4r', descKey: 'leaderboards_d_maxTwentiesInGame4r', compute: (_b, s) => s.maxTwentiesByFormat?.['4r']?.value ?? null },
  { id: 'maxTwentiesInGame7p', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInGame7p', descKey: 'leaderboards_d_maxTwentiesInGame7p', compute: (_b, s) => s.maxTwentiesByFormat?.['7p']?.value ?? null },
  { id: 'maxTwentiesInGame9p', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInGame9p', descKey: 'leaderboards_d_maxTwentiesInGame9p', compute: (_b, s) => s.maxTwentiesByFormat?.['9p']?.value ?? null },

  { id: 'pctTwentiesWithHammer', family: 'hammer', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_pctTwentiesWithHammer', descKey: 'leaderboards_d_pctTwentiesWithHammer', compute: (b) => div(b.hammerTwenties, b.twenties) },
  { id: 'twentiesPerHammerRound', family: 'hammer', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerHammerRound', descKey: 'leaderboards_d_twentiesPerHammerRound', compute: (b) => div(b.hammerTwenties, b.hammerRounds) },
  { id: 'twentiesPerNonHammerRound', family: 'hammer', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerNonHammerRound', descKey: 'leaderboards_d_twentiesPerNonHammerRound', compute: (b) => div(b.nonHammerTwenties, b.nonHammerRounds) },
  { id: 'hammerDifferential', family: 'hammer', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_hammerDifferential', descKey: 'leaderboards_d_hammerDifferential', compute: (b) => {
      const w = div(b.hammerTwenties, b.hammerRounds); const n = div(b.nonHammerTwenties, b.nonHammerRounds);
      return w === null || n === null ? null : w - n; } },
  { id: 'hammerRoundWinPct', family: 'hammer', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_hammerRoundWinPct', descKey: 'leaderboards_d_hammerRoundWinPct', compute: (b) => div(b.hammerRoundsWon, b.hammerRounds) },

  { id: 'koTwentiesPerRound', family: 'clutch', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_koTwentiesPerRound', descKey: 'leaderboards_d_koTwentiesPerRound', compute: (b) => div(b.koTwenties, b.koRounds) },
  { id: 'koWinRate', family: 'clutch', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_koWinRate', descKey: 'leaderboards_d_koWinRate', compute: (b) => div(b.koMatchesWon, b.koMatches) },
  { id: 'clutchDifferential', family: 'clutch', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_clutchDifferential', descKey: 'leaderboards_d_clutchDifferential', compute: (b) => {
      const k = div(b.koTwenties, b.koRounds); const g = div(b.groupTwenties, b.groupRounds);
      return k === null || g === null ? null : k - g; } },
  { id: 'finalsWinRate', family: 'clutch', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_finalsWinRate', descKey: 'leaderboards_d_finalsWinRate', compute: (b) => div(b.finalsWon, b.finalsPlayed) },

  { id: 'matchWinRate', family: 'results', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_matchWinRate', descKey: 'leaderboards_d_matchWinRate', compute: (b) => div(b.matchesWon, b.matches) },
  { id: 'roundWinRate', family: 'results', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_roundWinRate', descKey: 'leaderboards_d_roundWinRate', compute: (b) => div(b.roundsWon, b.rounds) },
  { id: 'avgMargin', family: 'results', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_avgMargin', descKey: 'leaderboards_d_avgMargin', compute: (b) => div(b.marginSum, b.marginWins) },
  { id: 'matchesPlayed', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_matchesPlayed', descKey: 'leaderboards_d_matchesPlayed', compute: (b) => b.matches || null },
  { id: 'singlesTitles', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_singlesTitles', descKey: 'leaderboards_d_singlesTitles', compute: (_b, s) => s.singlesTitles || null },
  { id: 'singlesPodiums', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_singlesPodiums', descKey: 'leaderboards_d_singlesPodiums', compute: (_b, s) => s.singlesPodiums || null },
  { id: 'bestWinStreak', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_bestWinStreak', descKey: 'leaderboards_d_bestWinStreak', compute: (_b, s) => s.records.bestWinStreak || null },
  { id: 'doublesTitles', family: 'results', kind: 'record', format: 'int', labelKey: 'leaderboards_m_doublesTitles', descKey: 'leaderboards_d_doublesTitles', compute: (_b, s) => s.doublesTitles || null },
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
