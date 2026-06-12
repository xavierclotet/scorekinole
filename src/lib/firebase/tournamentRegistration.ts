import type { TournamentParticipant, WaitlistEntry, ParticipantType, TournamentRegistration } from '$lib/types/tournament';

// --- Pure helpers (exported for testing) ---

/** Normalize an email for storage: trim whitespace and lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// --- Pure validation (exported for testing) ---

/**
 * Resolve `registration.allowWaitlist` to an explicit boolean.
 * Default (undefined) is `true` — full tournaments waitlist new sign-ups.
 * Only an explicit `false` enables a hard cap that blocks new registrations.
 */
export function isWaitlistAllowed(allowWaitlist: boolean | undefined): boolean {
  return allowWaitlist !== false;
}

export interface RegistrationValidation {
  canRegister: boolean;
  reason?: 'not_draft' | 'registration_disabled' | 'deadline_passed' | 'tournament_full' | 'already_registered' | 'already_waitlisted' | 'self_as_partner' | 'partner_already_registered' | 'partner_on_waitlist' | 'guest_partner_name_taken';
}

/** Normalize a guest partner name for collision checks: trim + lowercase + collapse whitespace. */
export function normalizeGuestPartnerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Collect normalized guest partner names already in use across participants and waitlist. */
export function collectGuestPartnerNames(
  participants: TournamentParticipant[],
  waitlist: WaitlistEntry[]
): string[] {
  const names: string[] = [];
  for (const p of participants) {
    if (p.partner?.type === 'GUEST' && p.partner.name) names.push(normalizeGuestPartnerName(p.partner.name));
  }
  for (const w of waitlist) {
    if (w.partner?.type === 'GUEST' && w.partner.name) names.push(normalizeGuestPartnerName(w.partner.name));
  }
  return names;
}

/**
 * Count participants that occupy a registration slot: ACTIVE (or legacy
 * no-status) rows, including admin-added GUEST participants. WITHDRAWN and
 * DISQUALIFIED participants free their slot.
 */
export function countActiveParticipants(participants: Array<{ status?: string }>): number {
  let count = 0;
  for (const p of participants) {
    if (!p.status || p.status === 'ACTIVE') count++;
  }
  return count;
}

export function validateRegistration(
  tournamentStatus: string,
  registration: TournamentRegistration | undefined,
  participantUserIds: string[],
  waitlistUserIds: string[],
  currentUserId: string,
  now: number,
  /** userIds that already occupy a partner slot in existing participants or waitlist entries */
  partnerUserIds: string[] = [],
  /** userId of the partner the current user wants to register with (doubles only) */
  partnerUserId?: string,
  /** Tournament scheduled date (ms). Defense-in-depth: close registrations once it passes. */
  tournamentDate?: number,
  /** Normalized guest partner names already in use (use `collectGuestPartnerNames`) */
  existingGuestPartnerNames: string[] = [],
  /** Raw name the user proposes for a GUEST partner (only relevant when type === 'GUEST') */
  proposedGuestPartnerName?: string,
  /**
   * Slot-occupying participant count (use `countActiveParticipants`). Includes
   * GUEST rows, excludes WITHDRAWN/DSQ. Falls back to participantUserIds.length
   * (registered-only) when not provided.
   */
  participantsCount?: number
): RegistrationValidation {
  if (tournamentStatus !== 'DRAFT') return { canRegister: false, reason: 'not_draft' };
  if (!registration?.enabled) return { canRegister: false, reason: 'registration_disabled' };
  if (registration.deadline && now > registration.deadline) return { canRegister: false, reason: 'deadline_passed' };
  if (tournamentDate !== undefined && now >= tournamentDate) return { canRegister: false, reason: 'deadline_passed' };
  const occupiedSlots = participantsCount ?? participantUserIds.length;
  if (!isWaitlistAllowed(registration.allowWaitlist) && registration.maxParticipants && occupiedSlots >= registration.maxParticipants) {
    return { canRegister: false, reason: 'tournament_full' };
  }
  if (participantUserIds.includes(currentUserId)) return { canRegister: false, reason: 'already_registered' };
  if (partnerUserIds.includes(currentUserId)) return { canRegister: false, reason: 'already_registered' };
  if (waitlistUserIds.includes(currentUserId)) return { canRegister: false, reason: 'already_waitlisted' };
  if (partnerUserId) {
    if (partnerUserId === currentUserId) return { canRegister: false, reason: 'self_as_partner' };
    if (participantUserIds.includes(partnerUserId)) return { canRegister: false, reason: 'partner_already_registered' };
    if (partnerUserIds.includes(partnerUserId)) return { canRegister: false, reason: 'partner_already_registered' };
    if (waitlistUserIds.includes(partnerUserId)) return { canRegister: false, reason: 'partner_on_waitlist' };
  }
  if (proposedGuestPartnerName !== undefined && proposedGuestPartnerName.trim() !== '') {
    const normalized = normalizeGuestPartnerName(proposedGuestPartnerName);
    if (existingGuestPartnerNames.includes(normalized)) {
      return { canRegister: false, reason: 'guest_partner_name_taken' };
    }
  }
  return { canRegister: true };
}

// --- Deadline configuration validation (used by the create-tournament wizard) ---

export type DeadlineValidationReason =
  | 'in_past'           // deadline is already in the past
  | 'after_tournament'; // deadline is on or after tournamentDate

export interface DeadlineValidation {
  valid: boolean;
  reason?: DeadlineValidationReason;
}

/**
 * Validate that a configured registration deadline is sane relative to the tournament date.
 *
 * Rules:
 *  - Deadline must not be in the past (relative to `now`).
 *  - If `tournamentDate` is provided, deadline must be strictly before it.
 *
 * Pure function — no Firebase / Date.now() side effects.
 */
export function validateRegistrationDeadline(
  deadlineMs: number,
  tournamentDate: number | undefined,
  now: number = Date.now()
): DeadlineValidation {
  if (deadlineMs < now) return { valid: false, reason: 'in_past' };
  if (tournamentDate !== undefined) {
    if (deadlineMs >= tournamentDate) return { valid: false, reason: 'after_tournament' };
  }
  return { valid: true };
}

/**
 * Map a raw registration error code/string (from validateRegistration reason or
 * thrown Error.message) to the Paraglide i18n key that describes it to the user.
 * Returns null when there is no specific key — caller should show a generic fallback.
 */
const REGISTRATION_ERROR_KEY_MAP: Record<string, string> = {
  // Validation reason codes (from validateRegistration)
  tournament_full: 'registration_full',
  already_registered: 'registration_registered',
  already_waitlisted: 'registration_onWaitlist',
  not_draft: 'registration_closed',
  registration_disabled: 'registration_closed',
  deadline_passed: 'registration_closed',
  guest_partner_name_taken: 'registration_guestPartnerNameTaken',
  // Thrown Error.message strings from Firestore operations
  'Cannot unregister after tournament has started': 'registration_closed',
  'Cannot leave waitlist after tournament has started': 'registration_closed',
  'Not registered': 'registration_closed',
  'Not on waitlist': 'registration_onWaitlist',
  'Not authenticated': 'registration_loginToRegister',
  'Email not verified': 'registration_emailNotVerified',
};

export function getRegistrationErrorMessageKey(error: string): string | null {
  return REGISTRATION_ERROR_KEY_MAP[error] ?? null;
}

/** Collect all userIds that are already occupying a partner slot (participants + waitlist). */
export function collectPartnerUserIds(
  participants: TournamentParticipant[],
  waitlist: WaitlistEntry[]
): string[] {
  const ids: string[] = [];
  for (const p of participants) {
    if (p.partner?.userId) ids.push(p.partner.userId);
  }
  for (const w of waitlist) {
    if (w.partner?.userId) ids.push(w.partner.userId);
  }
  return ids;
}

/** Filter a user search result list down to players eligible to be selected as a partner.
 *  Excludes: self, primary participants, users already assigned as partners, waitlist entries, waitlist partners. */
export function filterEligiblePartners<T extends { userId: string }>(
  users: T[],
  participants: TournamentParticipant[],
  waitlist: WaitlistEntry[],
  selfUserId: string
): T[] {
  const primaryIds = new Set(participants.map(p => p.userId).filter(Boolean) as string[]);
  const partnerIds = new Set(collectPartnerUserIds(participants, waitlist));
  const waitlistIds = new Set(waitlist.map(w => w.userId));
  const excluded = new Set([selfUserId, ...primaryIds, ...partnerIds, ...waitlistIds]);
  return users.filter(u => !excluded.has(u.userId));
}

export function determineRegistrationOutcome(
  participantsCount: number,
  maxParticipants?: number,
  allowWaitlist?: boolean
): 'registered' | 'waitlisted' {
  if (maxParticipants && participantsCount >= maxParticipants && isWaitlistAllowed(allowWaitlist)) return 'waitlisted';
  return 'registered';
}

export interface UnregistrationValidation {
  canUnregister: boolean;
  reason?: 'not_draft' | 'not_registered';
}

export function validateUnregistration(
  tournamentStatus: string,
  participantUserIds: string[],
  currentUserId: string
): UnregistrationValidation {
  if (tournamentStatus !== 'DRAFT') return { canUnregister: false, reason: 'not_draft' };
  if (!participantUserIds.includes(currentUserId)) return { canUnregister: false, reason: 'not_registered' };
  return { canUnregister: true };
}

export interface WaitlistUnregistrationValidation {
  canLeaveWaitlist: boolean;
  reason?: 'not_draft' | 'not_on_waitlist';
}

export function validateWaitlistUnregistration(
  tournamentStatus: string,
  waitlistUserIds: string[],
  currentUserId: string
): WaitlistUnregistrationValidation {
  if (tournamentStatus !== 'DRAFT') return { canLeaveWaitlist: false, reason: 'not_draft' };
  if (!waitlistUserIds.includes(currentUserId)) return { canLeaveWaitlist: false, reason: 'not_on_waitlist' };
  return { canLeaveWaitlist: true };
}

export function buildRegistrationConfig(
  enabled: boolean,
  deadlineDate: string,
  deadlineTime: string,
  maxParticipants: number | undefined,
  entryFee: string,
  allowWaitlist: boolean,
  notify: boolean,
  showList: boolean
): TournamentRegistration {
  // Always return an object (never undefined): in edit mode the wizard payload is
  // merged field-by-field into Firestore, so an absent `registration` key would leave
  // a previously-enabled config untouched and the admin could never close registration.
  const ds = deadlineDate
    ? (deadlineTime ? `${deadlineDate}T${deadlineTime}` : `${deadlineDate}T23:59`)
    : '';
  const sanitizedMax = maxParticipants && maxParticipants > 0 ? maxParticipants : undefined;
  return {
    enabled,
    deadline: ds ? new Date(ds).getTime() : undefined,
    maxParticipants: sanitizedMax,
    entryFee: entryFee.trim() || undefined,
    allowWaitlist,
    notifyOnRegistration: notify,
    showParticipantList: showList,
  };
}

/**
 * Returns true when a waitlist entry should be auto-promoted after a participant unregisters.
 * Respects registration.enabled and maxParticipants to avoid promoting into a closed or full tournament.
 */
export function shouldAutoPromote(
  waitlist: WaitlistEntry[],
  registration: TournamentRegistration | undefined,
  newParticipantCount: number
): boolean {
  if (waitlist.length === 0) return false;
  if (registration && !registration.enabled) return false;
  if (registration?.maxParticipants && newParticipantCount >= registration.maxParticipants) return false;
  return true;
}

export function adminPromoteFromWaitlist(
  participants: TournamentParticipant[],
  waitlist: WaitlistEntry[],
  userId: string,
  participantId = `participant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
  tournamentStatus?: string
): { participants: TournamentParticipant[]; waitlist: WaitlistEntry[] } | null {
  if (tournamentStatus !== undefined && tournamentStatus !== 'DRAFT') return null;
  const entryIndex = waitlist.findIndex(w => w.userId === userId);
  if (entryIndex === -1) return null;
  const entry = waitlist[entryIndex];
  const remainingWaitlist = waitlist.filter((_, i) => i !== entryIndex);
  const safePartner = sanitizePromotedPartner(entry.partner, participants, remainingWaitlist, entry.userId);
  const promoted: TournamentParticipant = {
    id: participantId,
    type: 'REGISTERED',
    userId: entry.userId,
    userKey: entry.userKey,
    name: entry.userName,
    rankingSnapshot: 0,
    status: 'ACTIVE',
    ...(entry.email ? { email: entry.email } : {}),
    ...(entry.photoURL ? { photoURL: entry.photoURL } : {}),
    ...(safePartner ? { partner: safePartner } : {}),
    ...(entry.teamName ? { teamName: entry.teamName } : {})
  };
  return {
    participants: [...participants, promoted],
    waitlist: remainingWaitlist
  };
}

export function adminRemoveFromWaitlist(
  waitlist: WaitlistEntry[],
  userId: string
): WaitlistEntry[] {
  return waitlist.filter(w => w.userId !== userId);
}

/**
 * Validate a waitlist entry's `partner` snapshot against the live tournament state
 * at promotion time. Stale REGISTERED partner refs (now a primary participant,
 * already in another partner slot, or on waitlist as primary) are dropped to
 * avoid creating duplicates. GUEST / NONE partners pass through unchanged.
 *
 * Returns the partner to keep on the promoted participant, or `undefined` to drop it.
 */
export function sanitizePromotedPartner(
  partner: { type: ParticipantType; userId?: string; name: string } | undefined,
  currentParticipants: TournamentParticipant[],
  currentWaitlist: WaitlistEntry[],
  promotedUserId: string
): { type: ParticipantType; userId?: string; name: string } | undefined {
  if (!partner) return undefined;
  if (partner.type !== 'REGISTERED' || !partner.userId) return partner;
  // Self-as-own-partner safety net (shouldn't happen but be defensive).
  if (partner.userId === promotedUserId) return undefined;
  const primaryIds = new Set(
    currentParticipants.map(p => p.userId).filter((id): id is string => !!id)
  );
  if (primaryIds.has(partner.userId)) return undefined;
  const partnerSlots = new Set(collectPartnerUserIds(currentParticipants, currentWaitlist));
  if (partnerSlots.has(partner.userId)) return undefined;
  const waitlistPrimaryIds = new Set(currentWaitlist.map(w => w.userId));
  if (waitlistPrimaryIds.has(partner.userId)) return undefined;
  return partner;
}

/**
 * Strip `userId` from any partner slot in participants and waitlist.
 * Used when a user listed only as a REGISTERED partner asks to unregister:
 * the primary's row stays, but their `partner` field is cleared so the slot
 * can be reassigned (admin or new partner) without leaving a dangling reference.
 *
 * Returns the new arrays plus whether anything was detached.
 */
export function detachUserFromPartnerSlots(
  participants: TournamentParticipant[],
  waitlist: WaitlistEntry[],
  userId: string
): { participants: TournamentParticipant[]; waitlist: WaitlistEntry[]; detached: boolean } {
  let detached = false;
  const newParticipants = participants.map(p => {
    if (p.partner?.userId === userId) {
      detached = true;
      const { partner, ...rest } = p;
      return rest as TournamentParticipant;
    }
    return p;
  });
  const newWaitlist = waitlist.map(w => {
    if (w.partner?.userId === userId) {
      detached = true;
      const { partner, ...rest } = w;
      return rest as WaitlistEntry;
    }
    return w;
  });
  return { participants: newParticipants, waitlist: newWaitlist, detached };
}

/**
 * Snapshot of the registration state at the moment the admin opened the edit wizard.
 * Used to distinguish "rows the admin saw and chose to keep/remove" from
 * "rows that appeared concurrently (new self-registrations / promotions)".
 */
export interface EditBaseline {
  /** participant.id values present when the wizard loaded */
  participantIds: string[];
  /** waitlist entry userId values present when the wizard loaded */
  waitlistUserIds: string[];
}

/**
 * Reconcile an admin's edited participant/waitlist lists (built from a stale
 * snapshot taken when the edit wizard opened) against the CURRENT Firestore
 * state, so that registrations / waitlist entries / promotions that happened
 * while the wizard was open are NOT clobbered by a blind overwrite.
 *
 * Semantics (safe default — never silently lose a real registration):
 *  - `edited` wins for every row the admin saw at open time: kept rows stay
 *    with the admin's edits; rows the admin removed (present in `baseline`,
 *    absent from `edited`) are dropped, honouring the explicit removal.
 *  - Rows present in `current` but NOT in `baseline` and NOT in `edited` are
 *    treated as concurrent additions (a player self-registered / joined the
 *    waitlist / was promoted after the wizard opened) and are PRESERVED.
 *  - De-dup: a user who is now a primary participant is removed from the
 *    waitlist (covers the concurrent unregister→promotion case where the
 *    promoted user would otherwise appear in both lists).
 *
 * Identity: participants by `id` for baseline/edited matching, then de-duped by
 * user identity (`participantIdentityKey`); waitlist entries by `userId`.
 *
 * Pure function — no Firebase side effects. The caller MUST run it inside the
 * same transaction that reads `current` and writes the result, so the
 * read-merge-write is atomic.
 */
export function reconcileEditedRegistration(
  baseline: EditBaseline,
  edited: { participants: TournamentParticipant[]; waitlist: WaitlistEntry[] },
  current: { participants: TournamentParticipant[]; waitlist: WaitlistEntry[] }
): { participants: TournamentParticipant[]; waitlist: WaitlistEntry[] } {
  const baselineParticipantIds = new Set(baseline.participantIds);
  const baselineWaitlistUserIds = new Set(baseline.waitlistUserIds);
  const editedParticipantIds = new Set(edited.participants.map(p => p.id));
  const editedWaitlistUserIds = new Set(edited.waitlist.map(w => w.userId));

  // Participants added concurrently: in Firestore now, unknown to the wizard,
  // and not already represented in the edited list.
  const concurrentParticipants = current.participants.filter(
    p => !baselineParticipantIds.has(p.id) && !editedParticipantIds.has(p.id)
  );
  const mergedParticipants = [...edited.participants, ...concurrentParticipants];

  // De-dup by user identity, not just row id: the admin may have manually added
  // a player (fresh local id) who self-registered concurrently (different id).
  // Without this, the same user ends up twice as a primary participant.
  // Preference: keep the concurrent Firestore row (it carries registration-time
  // data like userKey/partner) over an admin-added stub, unless the kept row was
  // already part of the baseline (a pre-existing row with admin edits).
  const concurrentIds = new Set(concurrentParticipants.map(p => p.id));
  const indexByIdentity = new Map<string, number>();
  const participants: TournamentParticipant[] = [];
  for (const p of mergedParticipants) {
    const identity = participantIdentityKey(p);
    const existingIdx = indexByIdentity.get(identity);
    if (existingIdx === undefined) {
      indexByIdentity.set(identity, participants.length);
      participants.push(p);
    } else if (concurrentIds.has(p.id) && !baselineParticipantIds.has(participants[existingIdx].id)) {
      participants[existingIdx] = p;
    }
  }

  // Waitlist entries added concurrently.
  const concurrentWaitlist = current.waitlist.filter(
    w => !baselineWaitlistUserIds.has(w.userId) && !editedWaitlistUserIds.has(w.userId)
  );
  let waitlist = [...edited.waitlist, ...concurrentWaitlist];

  // A user promoted to a primary slot must not linger on the waitlist.
  const primaryUserIds = new Set(
    participants.map(p => p.userId).filter((id): id is string => !!id)
  );
  waitlist = waitlist.filter(w => !primaryUserIds.has(w.userId));

  return { participants, waitlist };
}

/**
 * Stable identity key for a participant / registrant, robust to the participant
 * `id` being (re)generated during tournament start. Prefers `userId`; falls back
 * to a normalized name for legacy/guest rows that never had one.
 */
export function participantIdentityKey(p: { userId?: string; name?: string }): string {
  return p.userId ? `u:${p.userId}` : `n:${(p.name ?? '').trim().toLowerCase()}`;
}

/**
 * True if the set of participant identities in `current` differs from
 * `expectedKeys` — i.e. someone self-registered, unregistered, or was promoted
 * from the waitlist between the moment the roster was snapshotted and now.
 *
 * Used at tournament start: the schedule/bracket is built from a fixed roster,
 * so if the roster changed under us we must abort the start (and let the admin
 * retry with the new roster) rather than silently drop the new registration.
 */
export function rosterChanged(
  expectedKeys: string[],
  current: { userId?: string; name?: string }[]
): boolean {
  if (expectedKeys.length !== current.length) return true;
  const expected = [...expectedKeys].sort();
  const actual = current.map(participantIdentityKey).sort();
  return expected.some((k, i) => k !== actual[i]);
}

/**
 * Apply pre-computed participant updates (e.g. ranking snapshots, fetched from
 * user profiles outside the transaction) onto the CURRENT participant list,
 * matched by identity. Rows present in `current` but absent from `updatedByKey`
 * (a player who registered concurrently) are preserved untouched instead of
 * being clobbered.
 *
 * Pure function — the caller runs it inside the transaction that read `current`.
 */
export function applyRankingSnapshots(
  current: TournamentParticipant[],
  updatedByKey: Map<string, TournamentParticipant>
): TournamentParticipant[] {
  return current.map(p => updatedByKey.get(participantIdentityKey(p)) ?? p);
}

// --- Firestore operations ---
//
// Self-service registration writes go through the `tournamentSelfRegistration`
// Cloud Function: Firestore rules cannot validate the CONTENT of the
// participants/waitlist arrays (only which keys change), so direct client
// writes would let any authenticated user rewrite both arrays on a DRAFT
// tournament. The callable enforces that a user only adds/removes their own
// entry. The pure validation functions above stay exported for UI gating and
// are mirrored server-side in functions/src/selfRegistrationCore.ts.

interface PartnerData {
  type: ParticipantType;
  userId?: string;
  name: string;
}

type SelfRegistrationAction = 'register' | 'unregister' | 'leaveWaitlist';

async function callSelfRegistration(
  tournamentId: string,
  action: SelfRegistrationAction,
  partner?: PartnerData,
  teamName?: string
): Promise<{ status?: 'registered' | 'waitlisted'; promoted?: boolean }> {
  const { getApp } = await import('firebase/app');
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const functions = getFunctions(getApp(), 'europe-west1');
  const fn = httpsCallable(functions, 'tournamentSelfRegistration');
  const result = await fn({
    tournamentId,
    action,
    ...(partner ? { partner } : {}),
    ...(teamName ? { teamName } : {})
  });
  return result.data as { status?: 'registered' | 'waitlisted'; promoted?: boolean };
}

export interface RegisterResult {
  success: boolean;
  status?: 'registered' | 'waitlisted';
  error?: string;
}

export async function registerForTournament(
  tournamentId: string,
  partnerData?: PartnerData,
  teamName?: string
): Promise<RegisterResult> {
  const { browser } = await import('$app/environment');
  if (!browser) {
    return { success: false, error: 'Firebase not available' };
  }

  const { isFirebaseEnabled } = await import('./config');
  if (!isFirebaseEnabled()) {
    return { success: false, error: 'Firebase not available' };
  }

  const { get } = await import('svelte/store');
  const { currentUser, isCurrentEmailVerified } = await import('./auth');
  const user = get(currentUser);
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  if (!isCurrentEmailVerified()) {
    return { success: false, error: 'Email not verified' };
  }

  try {
    const data = await callSelfRegistration(tournamentId, 'register', partnerData, teamName);
    return { success: true, status: data.status ?? 'registered' };
  } catch (error: any) {
    console.error('Registration failed:', error);
    return { success: false, error: error.message };
  }
}

export interface UnregisterResult {
  success: boolean;
  promoted?: boolean; // true if a waitlist entry was promoted
  error?: string;
}

export async function unregisterFromTournament(
  tournamentId: string
): Promise<UnregisterResult> {
  const { browser } = await import('$app/environment');
  if (!browser) return { success: false, error: 'Firebase not available' };

  const { isFirebaseEnabled } = await import('./config');
  if (!isFirebaseEnabled()) return { success: false, error: 'Firebase not available' };

  const { get } = await import('svelte/store');
  const { currentUser } = await import('./auth');
  const user = get(currentUser);
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const data = await callSelfRegistration(tournamentId, 'unregister');
    return { success: true, promoted: data.promoted ?? false };
  } catch (error: any) {
    console.error('Unregistration failed:', error);
    return { success: false, error: error.message };
  }
}

export interface LeaveWaitlistResult {
  success: boolean;
  error?: string;
}

export async function leaveWaitlist(
  tournamentId: string
): Promise<LeaveWaitlistResult> {
  const { browser } = await import('$app/environment');
  if (!browser) return { success: false, error: 'Firebase not available' };

  const { isFirebaseEnabled } = await import('./config');
  if (!isFirebaseEnabled()) return { success: false, error: 'Firebase not available' };

  const { get } = await import('svelte/store');
  const { currentUser } = await import('./auth');
  const user = get(currentUser);
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    await callSelfRegistration(tournamentId, 'leaveWaitlist');
    return { success: true };
  } catch (error: any) {
    console.error('Leave waitlist failed:', error);
    return { success: false, error: error.message };
  }
}

// --- Admin Firestore operations (require runTransaction, no auth check on caller) ---

export interface AdminActionResult {
  success: boolean;
  error?: string;
}

export async function adminPromoteFromWaitlistFirestore(
  tournamentId: string,
  userId: string
): Promise<AdminActionResult> {
  const { browser } = await import('$app/environment');
  if (!browser) return { success: false, error: 'Firebase not available' };

  const { db, isFirebaseEnabled } = await import('./config');
  if (!isFirebaseEnabled() || !db) return { success: false, error: 'Firebase not available' };

  try {
    const { parseTournamentData } = await import('./tournaments');
    const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');

    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      const result = adminPromoteFromWaitlist(
        tournament.participants,
        tournament.waitlist || [],
        userId
      );
      if (!result) throw new Error('User not on waitlist');

      transaction.update(tournamentRef, {
        participants: result.participants,
        waitlist: result.waitlist,
        updatedAt: serverTimestamp()
      });
    }, { maxAttempts: 10 });

    return { success: true };
  } catch (error: any) {
    console.error('Admin promote failed:', error);
    return { success: false, error: error.message };
  }
}

export async function adminRemoveFromWaitlistFirestore(
  tournamentId: string,
  userId: string
): Promise<AdminActionResult> {
  const { browser } = await import('$app/environment');
  if (!browser) return { success: false, error: 'Firebase not available' };

  const { db, isFirebaseEnabled } = await import('./config');
  if (!isFirebaseEnabled() || !db) return { success: false, error: 'Firebase not available' };

  try {
    const { parseTournamentData } = await import('./tournaments');
    const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');

    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      const currentWaitlist = tournament.waitlist || [];
      const newWaitlist = adminRemoveFromWaitlist(currentWaitlist, userId);
      if (newWaitlist.length === currentWaitlist.length) throw new Error('User not on waitlist');

      transaction.update(tournamentRef, {
        waitlist: newWaitlist,
        updatedAt: serverTimestamp()
      });
    }, { maxAttempts: 10 });

    return { success: true };
  } catch (error: any) {
    console.error('Admin remove from waitlist failed:', error);
    return { success: false, error: error.message };
  }
}
