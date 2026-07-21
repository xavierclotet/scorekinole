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
  /**
   * How many events the average is actually built on (its denominator). The minimum gate uses
   * this on top of total matches, so a 1-of-1 KO record can't sit at the top with 100%.
   */
  sample?: (block: CounterBlock) => number;
  /**
   * Fixed floor for `sample`, replacing the user's "min matches" filter for this metric only.
   * For rare events (a medal round happens at most 3x per tournament) the global slider would
   * empty the board; total matches are still gated by the slider.
   */
  sampleMin?: number;
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export const METRICS: MetricDescriptor[] = [
  { id: 'twentiesPerRound', family: 'twenties', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerRound', descKey: 'leaderboards_d_twentiesPerRound', compute: (b) => div(b.twenties, b.rounds), sample: (b) => b.rounds },
  { id: 'roundsWithTwentyPct', family: 'twenties', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_roundsWithTwentyPct', descKey: 'leaderboards_d_roundsWithTwentyPct', compute: (b) => div(b.roundsWithTwenty, b.rounds), sample: (b) => b.rounds },
  { id: 'perfectRounds', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_perfectRounds', descKey: 'leaderboards_d_perfectRounds', compute: (b) => b.perfectRounds || null },
  { id: 'maxTwentiesInRound', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInRound', descKey: 'leaderboards_d_maxTwentiesInRound', compute: (_b, s) => s.records.maxTwentiesInRound?.value ?? null },
  { id: 'maxTwentiesInGame4r', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInGame4r', descKey: 'leaderboards_d_maxTwentiesInGame4r', compute: (_b, s) => s.maxTwentiesByFormat?.['4r']?.value ?? null },
  { id: 'maxTwentiesInGame7p', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInGame7p', descKey: 'leaderboards_d_maxTwentiesInGame7p', compute: (_b, s) => s.maxTwentiesByFormat?.['7p']?.value ?? null },
  { id: 'maxTwentiesInGame9p', family: 'twenties', kind: 'record', format: 'int', labelKey: 'leaderboards_m_maxTwentiesInGame9p', descKey: 'leaderboards_d_maxTwentiesInGame9p', compute: (_b, s) => s.maxTwentiesByFormat?.['9p']?.value ?? null },

  { id: 'pctTwentiesWithHammer', family: 'hammer', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_pctTwentiesWithHammer', descKey: 'leaderboards_d_pctTwentiesWithHammer', compute: (b) => div(b.hammerTwenties, b.twenties), sample: (b) => b.twenties },
  { id: 'twentiesPerHammerRound', family: 'hammer', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerHammerRound', descKey: 'leaderboards_d_twentiesPerHammerRound', compute: (b) => div(b.hammerTwenties, b.hammerRounds), sample: (b) => b.hammerRounds },
  { id: 'twentiesPerNonHammerRound', family: 'hammer', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_twentiesPerNonHammerRound', descKey: 'leaderboards_d_twentiesPerNonHammerRound', compute: (b) => div(b.nonHammerTwenties, b.nonHammerRounds), sample: (b) => b.nonHammerRounds },
  { id: 'hammerDifferential', family: 'hammer', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_hammerDifferential', descKey: 'leaderboards_d_hammerDifferential', compute: (b) => {
      const w = div(b.hammerTwenties, b.hammerRounds); const n = div(b.nonHammerTwenties, b.nonHammerRounds);
      return w === null || n === null ? null : w - n; }, sample: (b) => Math.min(b.hammerRounds, b.nonHammerRounds) },
  { id: 'hammerRoundWinPct', family: 'hammer', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_hammerRoundWinPct', descKey: 'leaderboards_d_hammerRoundWinPct', compute: (b) => div(b.hammerRoundsWon, b.hammerRounds), sample: (b) => b.hammerRounds },

  { id: 'koTwentiesPerRound', family: 'clutch', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_koTwentiesPerRound', descKey: 'leaderboards_d_koTwentiesPerRound', compute: (b) => div(b.koTwenties, b.koRounds), sample: (b) => b.koRounds },
  { id: 'koWinRate', family: 'clutch', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_koWinRate', descKey: 'leaderboards_d_koWinRate', compute: (b) => div(b.koMatchesWon, b.koMatches), sample: (b) => b.koMatches },
  { id: 'clutchDifferential', family: 'clutch', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_clutchDifferential', descKey: 'leaderboards_d_clutchDifferential', compute: (b) => {
      const k = div(b.koTwenties, b.koRounds); const g = div(b.groupTwenties, b.groupRounds);
      return k === null || g === null ? null : k - g; }, sample: (b) => Math.min(b.koRounds, b.groupRounds) },
  { id: 'medalWinRate', family: 'clutch', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_medalWinRate', descKey: 'leaderboards_d_medalWinRate', compute: (b) => div(b.medalMatchesWon, b.medalMatches), sample: (b) => b.medalMatches, sampleMin: 3 },

  { id: 'matchWinRate', family: 'results', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_matchWinRate', descKey: 'leaderboards_d_matchWinRate', compute: (b) => div(b.matchesWon, b.matches), sample: (b) => b.matches },
  { id: 'roundWinRate', family: 'results', kind: 'avg', format: 'percent', labelKey: 'leaderboards_m_roundWinRate', descKey: 'leaderboards_d_roundWinRate', compute: (b) => div(b.roundsWon, b.rounds), sample: (b) => b.rounds },
  { id: 'avgMargin', family: 'results', kind: 'avg', format: 'decimal', labelKey: 'leaderboards_m_avgMargin', descKey: 'leaderboards_d_avgMargin', compute: (b) => div(b.marginSum, b.marginWins), sample: (b) => b.marginWins },
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
