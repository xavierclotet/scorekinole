import { describe, it, expect } from 'vitest';
import { METRICS, getMetric, formatMetric } from './metrics';
import { emptyCounterBlock, type PlayerStats } from '$lib/types/playerStats';

function stats(over: Partial<PlayerStats> = {}): PlayerStats {
  return {
    userId: 'u1', displayName: 'Juan', byYear: {},
    records: { maxTwentiesInRound: null, maxTwentiesInGame: null, bestWinStreak: 0 },
    singlesTitles: 0, singlesPodiums: 0, doublesTitles: 0, doublesPodiums: 0, doublesResults: [],
    ...over,
  };
}

describe('metric registry', () => {
  it('has unique ids and every metric has a compute + valid format', () => {
    const ids = METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of METRICS) {
      expect(typeof m.compute).toBe('function');
      expect(['decimal', 'percent', 'int']).toContain(m.format);
    }
  });

  it('twentiesPerRound = twenties / rounds', () => {
    const b = emptyCounterBlock(); b.twenties = 30; b.rounds = 10;
    expect(getMetric('twentiesPerRound').compute(b, stats())).toBe(3);
  });

  it('returns null when denominator is 0', () => {
    const b = emptyCounterBlock();
    expect(getMetric('twentiesPerRound').compute(b, stats())).toBeNull();
    expect(getMetric('matchWinRate').compute(b, stats())).toBeNull();
  });

  it('pctTwentiesWithHammer = hammerTwenties / twenties', () => {
    const b = emptyCounterBlock(); b.twenties = 50; b.hammerTwenties = 30;
    expect(getMetric('pctTwentiesWithHammer').compute(b, stats())).toBeCloseTo(0.6);
  });

  it('record metrics read PlayerStats', () => {
    const s = stats({ singlesTitles: 4, records: { maxTwentiesInRound: { value: 6, tournamentId: 't', tournamentName: 'x', date: 0 }, maxTwentiesInGame: null, bestWinStreak: 9 } });
    expect(getMetric('singlesTitles').compute(emptyCounterBlock(), s)).toBe(4);
    expect(getMetric('maxTwentiesInRound').compute(emptyCounterBlock(), s)).toBe(6);
    expect(getMetric('bestWinStreak').compute(emptyCounterBlock(), s)).toBe(9);
  });

  it('formatMetric renders by type', () => {
    expect(formatMetric(getMetric('twentiesPerRound'), 3.456)).toBe('3.46');
    expect(formatMetric(getMetric('matchWinRate'), 0.6)).toBe('60%');
    expect(formatMetric(getMetric('singlesTitles'), 4)).toBe('4');
  });
});
