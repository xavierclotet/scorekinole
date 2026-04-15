/**
 * Pure helper functions for tournament registration Cloud Function logic.
 * No Firebase dependencies — fully testable.
 */

export interface RegistrationParticipant {
  id?: string;
  userId?: string;
  name?: string;
  [key: string]: unknown;
}

export interface RegistrationWaitlistEntry {
  userId: string;
  userName?: string;
  [key: string]: unknown;
}

/**
 * Find participants that are in `after` but not in `before`, identified by their `id` field.
 * More reliable than array-length + last-index heuristic.
 */
export function detectNewParticipants(
  before: RegistrationParticipant[],
  after: RegistrationParticipant[]
): RegistrationParticipant[] {
  const beforeIds = new Set(before.map(p => p.id).filter(Boolean));
  return after.filter(p => p.id && !beforeIds.has(p.id));
}

/**
 * Find waitlist entries that are in `after` but not in `before`, identified by `userId`.
 */
export function detectNewWaitlistEntries(
  before: RegistrationWaitlistEntry[],
  after: RegistrationWaitlistEntry[]
): RegistrationWaitlistEntry[] {
  const beforeUserIds = new Set(before.map(w => w.userId));
  return after.filter(w => !beforeUserIds.has(w.userId));
}

/**
 * Find participants that were promoted FROM the waitlist:
 * they appear as new participants (id not in before) AND their userId was in beforeWaitlist.
 * Covers the unregister+auto-promote scenario where participant count stays the same.
 */
export function detectPromotedFromWaitlist(
  beforeParticipants: RegistrationParticipant[],
  afterParticipants: RegistrationParticipant[],
  beforeWaitlist: RegistrationWaitlistEntry[]
): RegistrationParticipant[] {
  const beforeParticipantIds = new Set(beforeParticipants.map(p => p.id).filter(Boolean));
  const beforeWaitlistUserIds = new Set(beforeWaitlist.map(w => w.userId));
  return afterParticipants.filter(p =>
    p.id && !beforeParticipantIds.has(p.id) &&
    p.userId && beforeWaitlistUserIds.has(p.userId)
  );
}
