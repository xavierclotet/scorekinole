import { describe, it, expect } from 'vitest';
import { scopeBlock, allTimeBlock, buildLeaderboard, availableYears, rankEntries, topTieCount } from './leaderboard';
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

  it('applies the minimum to the metric sample, not just to total matches', () => {
    const lucky = player('lucky', { '2025': { matches: 10, koMatches: 1, koMatchesWon: 1 } });   // 100% off a single KO match
    const real = player('real', { '2025': { matches: 12, koMatches: 6, koMatchesWon: 4 } });     // 67% off 6
    const lb = buildLeaderboard([lucky, real], getMetric('koWinRate'), { year: 'all', minMatches: 5 });
    expect(lb.map((e) => e.stats.userId)).toEqual(['real']);
  });

  it('honours a metric sampleMin over the user filter (medal rounds are rare)', () => {
    const three = player('three', { '2025': { matches: 10, medalMatches: 3, medalMatchesWon: 2 } });
    const two = player('two', { '2025': { matches: 10, medalMatches: 2, medalMatchesWon: 2 } });
    const few = player('few', { '2025': { matches: 2, medalMatches: 3, medalMatchesWon: 3 } }); // fails total matches
    const lb = buildLeaderboard([three, two, few], getMetric('medalWinRate'), { year: 'all', minMatches: 5 });
    expect(lb.map((e) => e.stats.userId)).toEqual(['three']);
  });

  it('record metrics ignore minMatches and year', () => {
    const t = player('t', { '2025': { matches: 1 } }, { singlesTitles: 5 });
    const lb = buildLeaderboard([a, b, t], getMetric('singlesTitles'), { year: '2025', minMatches: 5 });
    expect(lb[0].stats.userId).toBe('t');
    expect(lb[0].value).toBe(5);
  });

  it('excludes players whose value is exactly 0', () => {
    const zero = player('z0', { '2025': { matches: 10, rounds: 20, twenties: 0 } }); // 0 per round
    const lb = buildLeaderboard([a, zero], getMetric('twentiesPerRound'), { year: 'all', minMatches: 5 });
    expect(lb.map((e) => e.stats.userId)).toEqual(['a']); // zero excluded
  });

  it('availableYears returns sorted desc years present in data', () => {
    expect(availableYears([a, player('z', { '2023': {}, '2025': {} })])).toEqual(['2025', '2023']);
  });
});

describe('rankEntries (ties share a rank)', () => {
  const e = (id: string, value: number) => ({ stats: player(id, {}), value });

  it('assigns competition ranks: [5,5,4] → [1,1,3]', () => {
    const ranked = rankEntries([e('a', 5), e('b', 5), e('c', 4)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('all tied at the top share rank 1', () => {
    const ranked = rankEntries([e('a', 1), e('b', 1), e('c', 1)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1]);
  });

  it('topTieCount counts how many share the top value', () => {
    expect(topTieCount([e('a', 1), e('b', 1), e('c', 1)])).toBe(3);
    expect(topTieCount([e('a', 5), e('b', 4)])).toBe(1);
    expect(topTieCount([])).toBe(0);
  });
});
