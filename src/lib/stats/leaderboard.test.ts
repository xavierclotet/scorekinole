import { describe, it, expect } from 'vitest';
import { scopeBlock, allTimeBlock, buildLeaderboard, availableYears } from './leaderboard';
import { getMetric } from './metrics';
import { emptyCounterBlock, type CounterBlock, type PlayerStats } from '$lib/types/playerStats';

function player(id: string, blocks: Record<string, Partial<CounterBlock>>, over: Partial<PlayerStats> = {}): PlayerStats {
  const byYear: PlayerStats['byYear'] = {};
  for (const [y, b] of Object.entries(blocks)) byYear[y] = { ...emptyCounterBlock(), ...b };
  return {
    userId: id, displayName: id, byYear,
    records: { maxTwentiesInRound: null, maxTwentiesInGame: null, bestWinStreak: 0 },
    singlesTitles: 0, singlesPodiums: 0, doublesTitles: 0, doublesPodiums: 0, doublesResults: [],
    ...over,
  };
}

describe('scope + all-time blocks', () => {
  it('allTimeBlock sums across years', () => {
    const p = player('a', { '2024': { matches: 3, twenties: 9, rounds: 3 }, '2025': { matches: 2, twenties: 4, rounds: 2 } });
    const b = allTimeBlock(p);
    expect(b.matches).toBe(5); expect(b.twenties).toBe(13); expect(b.rounds).toBe(5);
  });
  it('scopeBlock returns a single year (or empty for missing)', () => {
    const p = player('a', { '2025': { matches: 2 } });
    expect(scopeBlock(p, '2025').matches).toBe(2);
    expect(scopeBlock(p, '2024').matches).toBe(0);
    expect(scopeBlock(p, 'all').matches).toBe(2);
  });
});

describe('buildLeaderboard', () => {
  const a = player('a', { '2025': { matches: 10, rounds: 20, twenties: 80 } });   // 4.0
  const b = player('b', { '2025': { matches: 8, rounds: 16, twenties: 56 } });    // 3.5
  const c = player('c', { '2025': { matches: 3, rounds: 6, twenties: 30 } });     // 5.0 but few matches

  it('ranks by avg metric desc and applies minMatches', () => {
    const lb = buildLeaderboard([a, b, c], getMetric('twentiesPerRound'), { year: 'all', minMatches: 5 });
    expect(lb.map((e) => e.stats.userId)).toEqual(['a', 'b']); // c excluded (3 < 5)
    expect(lb[0].value).toBe(4);
  });

  it('record metrics ignore minMatches and year', () => {
    const t = player('t', { '2025': { matches: 1 } }, { singlesTitles: 5 });
    const lb = buildLeaderboard([a, b, t], getMetric('singlesTitles'), { year: '2025', minMatches: 5 });
    expect(lb[0].stats.userId).toBe('t');
    expect(lb[0].value).toBe(5);
  });

  it('availableYears returns sorted desc years present in data', () => {
    expect(availableYears([a, player('z', { '2023': {}, '2025': {} })])).toEqual(['2025', '2023']);
  });
});
