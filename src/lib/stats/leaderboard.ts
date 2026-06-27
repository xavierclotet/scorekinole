import { emptyCounterBlock, type CounterBlock, type PlayerStats } from '$lib/types/playerStats';
import type { MetricDescriptor } from './metrics';

export type YearScope = string; // 'all' | '2025' | …

export function allTimeBlock(p: PlayerStats): CounterBlock {
  const acc = emptyCounterBlock();
  for (const b of Object.values(p.byYear)) {
    (Object.keys(acc) as (keyof CounterBlock)[]).forEach((k) => { acc[k] += b[k]; });
  }
  return acc;
}

export function scopeBlock(p: PlayerStats, year: YearScope): CounterBlock {
  if (year === 'all') return allTimeBlock(p);
  return p.byYear[year] ?? emptyCounterBlock();
}

export interface LeaderboardEntry { stats: PlayerStats; value: number; }

export function buildLeaderboard(
  players: PlayerStats[],
  metric: MetricDescriptor,
  opts: { year: YearScope; minMatches: number }
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (const p of players) {
    // Records are all-time and ignore the minimum; averages use the year scope + min gate.
    const block = metric.kind === 'avg' ? scopeBlock(p, opts.year) : allTimeBlock(p);
    if (metric.kind === 'avg' && block.matches < opts.minMatches) continue;
    const value = metric.compute(block, p);
    // Hide players with no meaningful value (null, NaN, or exactly 0) from every leaderboard.
    if (value === null || Number.isNaN(value) || value === 0) continue;
    entries.push({ stats: p, value });
  }
  entries.sort((x, y) => y.value - x.value); // all current metrics: higher is better
  return entries;
}

export interface RankedEntry extends LeaderboardEntry { rank: number; }

/**
 * Assign standard competition ranks (ties share a rank): values [5,5,4] → ranks [1,1,3].
 * `entries` must already be sorted descending (as buildLeaderboard returns).
 */
export function rankEntries(entries: LeaderboardEntry[]): RankedEntry[] {
  let rank = 0;
  let prev = Number.NaN;
  return entries.map((e, i) => {
    if (e.value !== prev) { rank = i + 1; prev = e.value; }
    return { ...e, rank };
  });
}

/** How many entries share the top (first) value — i.e. how many are tied for #1. */
export function topTieCount(entries: LeaderboardEntry[]): number {
  if (entries.length === 0) return 0;
  const top = entries[0].value;
  let n = 0;
  for (const e of entries) { if (e.value === top) n++; else break; }
  return n;
}

export function availableYears(players: PlayerStats[]): string[] {
  const years = new Set<string>();
  for (const p of players) for (const y of Object.keys(p.byYear)) years.add(y);
  return Array.from(years).sort((a, b) => Number(b) - Number(a));
}
