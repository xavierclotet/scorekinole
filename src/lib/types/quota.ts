/**
 * Quota system for live tournaments
 * Tracks per-year tournament creation limits for admin users
 */

export type QuotaReason = 'auto-register' | 'admin-assigned' | 'upgrade';

export interface QuotaEntry {
  year: number;                    // Calendar year (e.g., 2026)
  maxLiveTournaments: number;      // Limit for that year (0 = no quota)
  createdAt: number;               // Timestamp when entry was created
  updatedAt: number;               // Timestamp of last modification
  createdBy?: string;              // userId of admin who assigned quota (optional)
  reason?: QuotaReason;            // Why this quota was assigned
}

/**
 * Get the quota limit for a specific year
 * @param entries Array of quota entries
 * @param year Calendar year to check
 * @returns Max tournaments allowed for that year (0 if no entry)
 */
export function getQuotaForYear(entries: QuotaEntry[] | undefined, year: number): number {
  if (!entries || entries.length === 0) return 0;
  const entry = entries.find(e => e.year === year);
  return entry?.maxLiveTournaments ?? 0;
}

/**
 * Get the full quota entry for a specific year
 * @param entries Array of quota entries
 * @param year Calendar year to check
 * @returns QuotaEntry or undefined if not found
 */
export function getQuotaEntryForYear(entries: QuotaEntry[] | undefined, year: number): QuotaEntry | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.find(e => e.year === year);
}

/**
 * Create or update a quota entry for a specific year
 * Returns a new array (does not mutate the original)
 * @param entries Existing entries (or undefined)
 * @param year Calendar year
 * @param limit Max tournaments for that year
 * @param createdBy Optional userId of admin assigning the quota
 * @param reason Optional reason for the quota
 * @returns New array with the updated/added entry
 */
export function setQuotaForYear(
  entries: QuotaEntry[] | undefined,
  year: number,
  limit: number,
  createdBy?: string,
  reason?: QuotaReason
): QuotaEntry[] {
  const now = Date.now();
  const existing = entries ? [...entries] : [];
  const idx = existing.findIndex(e => e.year === year);

  if (idx >= 0) {
    // Update existing entry
    existing[idx] = {
      ...existing[idx],
      maxLiveTournaments: limit,
      updatedAt: now,
      ...(createdBy && { createdBy }),
      ...(reason && { reason })
    };
  } else {
    // Create new entry
    existing.push({
      year,
      maxLiveTournaments: limit,
      createdAt: now,
      updatedAt: now,
      ...(createdBy && { createdBy }),
      ...(reason && { reason })
    });
  }

  // Sort by year descending (most recent first)
  return existing.sort((a, b) => b.year - a.year);
}

/**
 * Migrate old maxTournamentsPerYear number to new QuotaEntry array
 * Used for backward compatibility with existing users
 * @param maxTournamentsPerYear Old format value
 * @param currentYear Year to assign the quota to
 * @returns New QuotaEntry array or undefined if no quota
 */
export function migrateOldQuota(
  maxTournamentsPerYear: number | undefined,
  currentYear: number
): QuotaEntry[] | undefined {
  if (maxTournamentsPerYear === undefined || maxTournamentsPerYear === 0) {
    return undefined;
  }

  return [{
    year: currentYear,
    maxLiveTournaments: maxTournamentsPerYear,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    reason: 'admin-assigned'
  }];
}

/**
 * Create initial quota entry for new user registration
 * @param year Calendar year
 * @param limit Default is 1 tournament
 * @returns QuotaEntry array with single entry
 */
export function createInitialQuota(year: number, limit: number = 1): QuotaEntry[] {
  return [{
    year,
    maxLiveTournaments: limit,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    reason: 'auto-register'
  }];
}
