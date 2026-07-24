/**
 * Unit tests for pageViewPaths.ts — route normalization and the
 * encode/decode of viewsByPath keys used by /admin/analytics.
 *
 * Regression context: the old normalizePath regex was not anchored, so
 * '/admin/tournaments/create' became '/admin/tournaments/[id]' (its route
 * filter never matched anything) and '/users/<slug>' was never normalized.
 * The old decode (replace _ with /) showed '/tournaments/id' instead of
 * '/tournaments/[id]'.
 */

import { describe, it, expect } from 'vitest';
import { normalizePath, encodePathKey, decodePathKey } from './pageViewPaths';
import { TRACKED_ROUTES } from '$lib/types/pageView';

describe('normalizePath', () => {
  it('keeps static routes as-is', () => {
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/game')).toBe('/game');
    expect(normalizePath('/ranking')).toBe('/ranking');
    expect(normalizePath('/admin/users')).toBe('/admin/users');
  });

  it('strips trailing slashes', () => {
    expect(normalizePath('/game/')).toBe('/game');
    expect(normalizePath('/tournaments/')).toBe('/tournaments');
    expect(normalizePath('//')).toBe('/');
  });

  it('normalizes public tournament detail to /tournaments/[id]', () => {
    expect(normalizePath('/tournaments/abc123')).toBe('/tournaments/[id]');
    expect(normalizePath('/tournaments/abc123/')).toBe('/tournaments/[id]');
  });

  it('does NOT collapse the tournaments list page', () => {
    expect(normalizePath('/tournaments')).toBe('/tournaments');
  });

  it('normalizes admin tournament detail to /admin/tournaments/[id]', () => {
    expect(normalizePath('/admin/tournaments/xyz789')).toBe('/admin/tournaments/[id]');
  });

  it('keeps /admin/tournaments/create and /import distinct from [id]', () => {
    // Regression: the unanchored regex turned both into [id]
    expect(normalizePath('/admin/tournaments/create')).toBe('/admin/tournaments/create');
    expect(normalizePath('/admin/tournaments/import')).toBe('/admin/tournaments/import');
  });

  it('normalizes public profiles to /users/[id]', () => {
    // Regression: user slugs were stored verbatim, so the /users/[id]
    // filter never matched and top pages listed individual slugs
    expect(normalizePath('/users/john-doe')).toBe('/users/[id]');
    expect(normalizePath('/users/uid_with_underscore')).toBe('/users/[id]');
  });

  it('normalizes analytics day view to /admin/analytics/[date]', () => {
    expect(normalizePath('/admin/analytics/2026-07-23')).toBe('/admin/analytics/[date]');
    expect(normalizePath('/admin/analytics/2026-07-23/')).toBe('/admin/analytics/[date]');
  });

  it('does NOT collapse the analytics dashboard itself', () => {
    expect(normalizePath('/admin/analytics')).toBe('/admin/analytics');
  });

  it('leaves unknown paths untouched (minus trailing slash)', () => {
    expect(normalizePath('/some/unknown/page')).toBe('/some/unknown/page');
  });
});

describe('encodePathKey', () => {
  it('replaces slashes and strips brackets', () => {
    expect(encodePathKey('/tournaments/[id]')).toBe('_tournaments_id');
    expect(encodePathKey('/admin/tournaments/create')).toBe('_admin_tournaments_create');
    expect(encodePathKey('/')).toBe('_');
  });

  it('produces a unique key per tracked route', () => {
    const keys = TRACKED_ROUTES.map(encodePathKey);
    expect(new Set(keys).size).toBe(TRACKED_ROUTES.length);
  });

  it('keys never contain characters invalid in Firestore field paths', () => {
    for (const route of TRACKED_ROUTES) {
      expect(encodePathKey(route)).not.toMatch(/[/[\].]/);
    }
  });
});

describe('decodePathKey', () => {
  it('round-trips every tracked route exactly', () => {
    for (const route of TRACKED_ROUTES) {
      expect(decodePathKey(encodePathKey(route))).toBe(route);
    }
  });

  it("restores '[id]' segments (old decode showed '/tournaments/id')", () => {
    expect(decodePathKey('_tournaments_id')).toBe('/tournaments/[id]');
    expect(decodePathKey('_users_id')).toBe('/users/[id]');
  });

  it('decodes the root key', () => {
    expect(decodePathKey('_')).toBe('/');
    expect(decodePathKey('_root')).toBe('/');
  });

  it('falls back to heuristic decoding for legacy/unknown keys', () => {
    // Data written before /users/* normalization stored raw slugs
    expect(decodePathKey('_users_john-doe')).toBe('/users/john-doe');
    expect(decodePathKey('_some_unknown_page')).toBe('/some/unknown/page');
  });
});
