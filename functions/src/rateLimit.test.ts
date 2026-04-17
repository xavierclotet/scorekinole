import { describe, it, expect } from 'vitest';
import { evaluateWindow } from './rateLimit';

describe('evaluateWindow', () => {
  const NOW = 1_000_000;
  const WINDOW = 60_000;
  const MAX = 10;

  it('allows the first call (no history)', () => {
    const r = evaluateWindow(undefined, NOW, WINDOW, MAX);
    expect(r.allowed).toBe(true);
    expect(r.nextAttempts).toEqual([NOW]);
  });

  it('allows a call when under the cap', () => {
    const history = [NOW - 30_000, NOW - 20_000, NOW - 10_000];
    const r = evaluateWindow(history, NOW, WINDOW, MAX);
    expect(r.allowed).toBe(true);
    expect(r.nextAttempts).toEqual([...history, NOW]);
  });

  it('rejects a call at the cap within the window', () => {
    const history = Array.from({ length: MAX }, (_, i) => NOW - i * 1000);
    const r = evaluateWindow(history, NOW, WINDOW, MAX);
    expect(r.allowed).toBe(false);
    expect(r.nextAttempts).toEqual(history);
  });

  it('prunes entries older than the window and allows', () => {
    const history = [
      NOW - 120_000, // outside window
      NOW - 90_000,  // outside window
      NOW - 30_000,  // inside
      NOW - 5_000,   // inside
    ];
    const r = evaluateWindow(history, NOW, WINDOW, MAX);
    expect(r.allowed).toBe(true);
    expect(r.nextAttempts).toEqual([NOW - 30_000, NOW - 5_000, NOW]);
  });

  it('prunes old entries even when currently at cap (allows after prune)', () => {
    const history = [
      ...Array.from({ length: MAX }, (_, i) => NOW - 120_000 - i * 1000), // all expired
    ];
    const r = evaluateWindow(history, NOW, WINDOW, MAX);
    expect(r.allowed).toBe(true);
    expect(r.nextAttempts).toEqual([NOW]);
  });

  it('handles malformed history (non-array)', () => {
    const r = evaluateWindow('not-an-array', NOW, WINDOW, MAX);
    expect(r.allowed).toBe(true);
    expect(r.nextAttempts).toEqual([NOW]);
  });

  it('handles malformed history entries (non-numbers, NaN, Infinity)', () => {
    const history = [NOW - 5_000, 'bad', NaN, Infinity, null, NOW - 10_000];
    const r = evaluateWindow(history, NOW, WINDOW, MAX);
    expect(r.allowed).toBe(true);
    expect(r.nextAttempts).toEqual([NOW - 5_000, NOW - 10_000, NOW]);
  });

  it('rejects the 11th call within a sub-second burst', () => {
    const history = Array.from({ length: MAX }, (_, i) => NOW - i);
    const r = evaluateWindow(history, NOW, WINDOW, MAX);
    expect(r.allowed).toBe(false);
  });

  it('respects custom max and window', () => {
    const history = [NOW - 2000, NOW - 1000];
    const r = evaluateWindow(history, NOW, 5000, 2);
    expect(r.allowed).toBe(false);
  });

  it('allows exactly at the window boundary (> cutoff, not >=)', () => {
    // Entry at `NOW - WINDOW` is at the cutoff boundary: `t > cutoff` excludes it.
    const history = [NOW - WINDOW];
    const r = evaluateWindow(history, NOW, WINDOW, 1);
    expect(r.allowed).toBe(true);
    expect(r.nextAttempts).toEqual([NOW]);
  });
});
