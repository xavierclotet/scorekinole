import { describe, it, expect } from 'vitest';
import { validateMatchResult, MATCH_RESULT_LIMITS } from './matchResultValidation';

const L = MATCH_RESULT_LIMITS;

describe('validateMatchResult', () => {
  describe('empty and minimal payloads', () => {
    it('accepts an empty payload', () => {
      expect(validateMatchResult({}).valid).toBe(true);
    });

    it('accepts a minimal valid payload', () => {
      const r = validateMatchResult({ gamesWonA: 2, gamesWonB: 1 });
      expect(r.valid).toBe(true);
    });
  });

  describe('games won', () => {
    it('rejects negative gamesWonA', () => {
      const r = validateMatchResult({ gamesWonA: -1, gamesWonB: 0 });
      expect(r).toEqual({ valid: false, error: expect.stringContaining('gamesWonA') });
    });

    it('rejects non-integer gamesWonA', () => {
      const r = validateMatchResult({ gamesWonA: 1.5, gamesWonB: 0 });
      expect(r.valid).toBe(false);
    });

    it('rejects NaN gamesWonA', () => {
      const r = validateMatchResult({ gamesWonA: NaN, gamesWonB: 0 });
      expect(r.valid).toBe(false);
    });

    it('rejects Infinity gamesWonA', () => {
      const r = validateMatchResult({ gamesWonA: Infinity, gamesWonB: 0 });
      expect(r.valid).toBe(false);
    });

    it('rejects gamesWonA above MAX_GAMES_WON', () => {
      const r = validateMatchResult({ gamesWonA: L.MAX_GAMES_WON + 1, gamesWonB: 0 });
      expect(r.valid).toBe(false);
    });

    it('accepts gamesWonA at the MAX_GAMES_WON boundary', () => {
      const r = validateMatchResult({ gamesWonA: L.MAX_GAMES_WON, gamesWonB: 0 });
      expect(r.valid).toBe(true);
    });
  });

  describe('total points', () => {
    it('rejects totalPointsA above MAX_TOTAL_POINTS', () => {
      const r = validateMatchResult({ totalPointsA: L.MAX_TOTAL_POINTS + 1 });
      expect(r.valid).toBe(false);
    });

    it('rejects inflated totalPointsA (999999 attack)', () => {
      const r = validateMatchResult({ totalPointsA: 999999 });
      expect(r.valid).toBe(false);
    });

    it('accepts totalPointsA at the boundary', () => {
      const r = validateMatchResult({ totalPointsA: L.MAX_TOTAL_POINTS });
      expect(r.valid).toBe(true);
    });
  });

  describe('total 20s', () => {
    it('rejects total20sA above MAX_TOTAL_20S', () => {
      const r = validateMatchResult({ total20sA: L.MAX_TOTAL_20S + 1 });
      expect(r.valid).toBe(false);
    });

    it('accepts total20sA at the boundary', () => {
      const r = validateMatchResult({ total20sA: L.MAX_TOTAL_20S });
      expect(r.valid).toBe(true);
    });
  });

  describe('rounds array', () => {
    const validRound = {
      gameNumber: 1,
      roundInGame: 1,
      pointsA: 10,
      pointsB: 8,
      twentiesA: 2,
      twentiesB: 1
    };

    it('accepts a valid rounds array', () => {
      const r = validateMatchResult({ rounds: [validRound] });
      expect(r.valid).toBe(true);
    });

    it('accepts null pointsA/pointsB (in-progress round)', () => {
      const r = validateMatchResult({
        rounds: [{ ...validRound, pointsA: null, pointsB: null }]
      });
      expect(r.valid).toBe(true);
    });

    it('rejects rounds that is not an array', () => {
      const r = validateMatchResult({ rounds: 'not-an-array' as never });
      expect(r.valid).toBe(false);
    });

    it('rejects rounds array exceeding MAX_ROUNDS_PER_MATCH', () => {
      const rounds = Array.from({ length: L.MAX_ROUNDS_PER_MATCH + 1 }, () => validRound);
      const r = validateMatchResult({ rounds });
      expect(r.valid).toBe(false);
    });

    it('rejects a round with pointsA above MAX_ROUND_POINTS', () => {
      const r = validateMatchResult({
        rounds: [{ ...validRound, pointsA: L.MAX_ROUND_POINTS + 1 }]
      });
      expect(r.valid).toBe(false);
    });

    it('rejects a round with negative pointsA', () => {
      const r = validateMatchResult({
        rounds: [{ ...validRound, pointsA: -5 }]
      });
      expect(r.valid).toBe(false);
    });

    it('rejects a round with twentiesA above MAX_ROUND_20S', () => {
      const r = validateMatchResult({
        rounds: [{ ...validRound, twentiesA: L.MAX_ROUND_20S + 1 }]
      });
      expect(r.valid).toBe(false);
    });

    it('accepts a round at MAX_ROUND_20S boundary (singles 12-disc variant)', () => {
      const r = validateMatchResult({
        rounds: [{ ...validRound, twentiesA: L.MAX_ROUND_20S, twentiesB: L.MAX_ROUND_20S }]
      });
      expect(r.valid).toBe(true);
    });

    it('rejects negative gameNumber', () => {
      const r = validateMatchResult({
        rounds: [{ ...validRound, gameNumber: -1 }]
      });
      expect(r.valid).toBe(false);
    });

    it('rejects rounds[i] that is not an object', () => {
      const r = validateMatchResult({ rounds: [null as never] });
      expect(r.valid).toBe(false);
    });
  });

  describe('video fields', () => {
    it('accepts valid videoUrl and videoId', () => {
      const r = validateMatchResult({
        videoUrl: 'https://youtube.com/watch?v=abc',
        videoId: 'abc123'
      });
      expect(r.valid).toBe(true);
    });

    it('rejects videoUrl exceeding length cap', () => {
      const r = validateMatchResult({
        videoUrl: 'x'.repeat(L.MAX_VIDEO_URL_LEN + 1)
      });
      expect(r.valid).toBe(false);
    });

    it('rejects videoId exceeding length cap', () => {
      const r = validateMatchResult({
        videoId: 'x'.repeat(L.MAX_VIDEO_ID_LEN + 1)
      });
      expect(r.valid).toBe(false);
    });

    it('rejects non-string videoUrl', () => {
      const r = validateMatchResult({ videoUrl: 123 as never });
      expect(r.valid).toBe(false);
    });
  });

  describe('attack vectors', () => {
    it('blocks ranking-inflation attack via totalPoints', () => {
      const r = validateMatchResult({
        gamesWonA: 99,
        totalPointsA: 999999,
        total20sA: 9999
      });
      expect(r.valid).toBe(false);
    });

    it('blocks DoS attack via massive rounds array', () => {
      const rounds = Array.from({ length: 100000 }, () => ({
        gameNumber: 1, roundInGame: 1,
        pointsA: 0, pointsB: 0, twentiesA: 0, twentiesB: 0
      }));
      const r = validateMatchResult({ rounds });
      expect(r.valid).toBe(false);
    });
  });
});
