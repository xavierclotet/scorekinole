/**
 * Unit tests for the tournament quota system (types/quota.ts)
 *
 * Pure functions — no Firebase mocks needed. The "quota 0" cases matter
 * because both the admin UI (UserEditModal / admin users page) and the
 * enforcement point (tournaments.ts → checkTournamentQuota) treat a
 * new-system quota of 0 as "fall back to legacy maxTournamentsPerYear",
 * which makes an explicit 0 ("revoked") indistinguishable from "no entry".
 */

import { describe, it, expect } from 'vitest';
import {
  getQuotaForYear,
  getQuotaEntryForYear,
  setQuotaForYear,
  migrateOldQuota,
  createInitialQuota,
  type QuotaEntry
} from './quota';

function entry(year: number, max: number, overrides: Partial<QuotaEntry> = {}): QuotaEntry {
  return { year, maxLiveTournaments: max, createdAt: 1000, updatedAt: 1000, ...overrides };
}

describe('getQuotaForYear', () => {
  it('returns 0 for undefined or empty entries', () => {
    expect(getQuotaForYear(undefined, 2026)).toBe(0);
    expect(getQuotaForYear([], 2026)).toBe(0);
  });

  it('returns 0 when no entry matches the year', () => {
    expect(getQuotaForYear([entry(2025, 5)], 2026)).toBe(0);
  });

  it('returns the limit for the matching year', () => {
    expect(getQuotaForYear([entry(2025, 5), entry(2026, 3)], 2026)).toBe(3);
  });

  it('an explicit 0 entry is indistinguishable from no entry (revocation caveat)', () => {
    // Consumers using `if (quota === 0) fallbackToLegacy()` cannot tell
    // "admin revoked the quota" from "no quota assigned". See the bug notes
    // in the admin/users review.
    expect(getQuotaForYear([entry(2026, 0)], 2026)).toBe(0);
    expect(getQuotaForYear([], 2026)).toBe(0);
  });
});

describe('getQuotaEntryForYear', () => {
  it('returns undefined for undefined/empty/missing', () => {
    expect(getQuotaEntryForYear(undefined, 2026)).toBeUndefined();
    expect(getQuotaEntryForYear([], 2026)).toBeUndefined();
    expect(getQuotaEntryForYear([entry(2025, 5)], 2026)).toBeUndefined();
  });

  it('returns the full entry (so an explicit 0 IS distinguishable here)', () => {
    const zero = entry(2026, 0, { reason: 'admin-assigned' });
    expect(getQuotaEntryForYear([zero], 2026)).toEqual(zero);
  });
});

describe('setQuotaForYear', () => {
  it('creates a new entry when the year does not exist', () => {
    const result = setQuotaForYear(undefined, 2026, 3, 'admin-1', 'admin-assigned');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      year: 2026,
      maxLiveTournaments: 3,
      createdBy: 'admin-1',
      reason: 'admin-assigned'
    });
    expect(result[0].createdAt).toBeGreaterThan(0);
  });

  it('updates an existing entry preserving createdAt', () => {
    const original = entry(2026, 1, { createdBy: 'admin-1', reason: 'auto-register' });
    const result = setQuotaForYear([original], 2026, 5, 'admin-2', 'upgrade');

    expect(result).toHaveLength(1);
    expect(result[0].maxLiveTournaments).toBe(5);
    expect(result[0].createdAt).toBe(1000); // preserved
    expect(result[0].updatedAt).toBeGreaterThan(1000);
    expect(result[0].createdBy).toBe('admin-2');
    expect(result[0].reason).toBe('upgrade');
  });

  it('does not mutate the input array', () => {
    const input = [entry(2026, 1)];
    const snapshot = structuredClone(input);
    setQuotaForYear(input, 2026, 9);
    expect(input).toEqual(snapshot);
  });

  it('keeps entries sorted by year descending', () => {
    const result = setQuotaForYear([entry(2024, 1), entry(2026, 2)], 2025, 3);
    expect(result.map((e) => e.year)).toEqual([2026, 2025, 2024]);
  });

  it('setting 0 keeps the entry (explicit revocation is stored)', () => {
    const result = setQuotaForYear([entry(2026, 5)], 2026, 0);
    expect(result).toHaveLength(1);
    expect(result[0].maxLiveTournaments).toBe(0);
  });

  it('preserves previous createdBy/reason when omitted on update', () => {
    const original = entry(2026, 1, { createdBy: 'admin-1', reason: 'auto-register' });
    const result = setQuotaForYear([original], 2026, 2);
    expect(result[0].createdBy).toBe('admin-1');
    expect(result[0].reason).toBe('auto-register');
  });
});

describe('migrateOldQuota', () => {
  it('returns undefined for undefined or 0', () => {
    expect(migrateOldQuota(undefined, 2026)).toBeUndefined();
    expect(migrateOldQuota(0, 2026)).toBeUndefined();
  });

  it('migrates a positive legacy value to a single entry', () => {
    const result = migrateOldQuota(4, 2026);
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({
      year: 2026,
      maxLiveTournaments: 4,
      reason: 'admin-assigned'
    });
  });
});

describe('createInitialQuota', () => {
  it('defaults to 1 tournament with auto-register reason', () => {
    const result = createInitialQuota(2026);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ year: 2026, maxLiveTournaments: 1, reason: 'auto-register' });
  });

  it('accepts a custom limit', () => {
    expect(createInitialQuota(2026, 7)[0].maxLiveTournaments).toBe(7);
  });
});
