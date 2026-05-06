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
  proposedGuestPartnerName?: string
): RegistrationValidation {
  if (tournamentStatus !== 'DRAFT') return { canRegister: false, reason: 'not_draft' };
  if (!registration?.enabled) return { canRegister: false, reason: 'registration_disabled' };
  if (registration.deadline && now > registration.deadline) return { canRegister: false, reason: 'deadline_passed' };
  if (tournamentDate !== undefined && now >= tournamentDate) return { canRegister: false, reason: 'deadline_passed' };
  if (!isWaitlistAllowed(registration.allowWaitlist) && registration.maxParticipants && participantUserIds.length >= registration.maxParticipants) {
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
): TournamentRegistration | undefined {
  if (!enabled) return undefined;
  const ds = deadlineDate
    ? (deadlineTime ? `${deadlineDate}T${deadlineTime}` : `${deadlineDate}T23:59`)
    : '';
  const sanitizedMax = maxParticipants && maxParticipants > 0 ? maxParticipants : undefined;
  return {
    enabled: true,
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

// --- Firestore operations ---

interface PartnerData {
  type: ParticipantType;
  userId?: string;
  name: string;
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

  const { db, isFirebaseEnabled } = await import('./config');
  if (!isFirebaseEnabled() || !db) {
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
    const { getUserProfile } = await import('./userProfile');
    const { parseTournamentData } = await import('./tournaments');
    const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');

    const profile = await getUserProfile();
    const tournamentRef = doc(db, 'tournaments', tournamentId);
    let outcome: 'registered' | 'waitlisted' = 'registered';

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      const participantUserIds = tournament.participants
        .filter(p => p.userId)
        .map(p => p.userId!);
      const waitlistUserIds = (tournament.waitlist || []).map((w: WaitlistEntry) => w.userId);
      const partnerUserIds = collectPartnerUserIds(tournament.participants, tournament.waitlist || []);
      const guestPartnerNames = collectGuestPartnerNames(tournament.participants, tournament.waitlist || []);

      const validation = validateRegistration(
        tournament.status,
        tournament.registration,
        participantUserIds,
        waitlistUserIds,
        user.id,
        Date.now(),
        partnerUserIds,
        partnerData?.type === 'REGISTERED' ? partnerData.userId : undefined,
        tournament.tournamentDate,
        guestPartnerNames,
        partnerData?.type === 'GUEST' ? partnerData.name : undefined
      );

      if (!validation.canRegister) {
        throw new Error(validation.reason || 'Cannot register');
      }

      outcome = determineRegistrationOutcome(
        tournament.participants.length,
        tournament.registration?.maxParticipants,
        tournament.registration?.allowWaitlist
      );

      if (outcome === 'registered') {
        const participant: TournamentParticipant = {
          id: `participant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          type: 'REGISTERED',
          userId: user.id,
          userKey: profile?.key ?? '',
          name: user.name || 'Jugador',
          email: user.email ? normalizeEmail(user.email) : undefined,
          photoURL: user.photoURL ?? undefined,
          rankingSnapshot: 0,
          status: 'ACTIVE',
          ...(partnerData ? { partner: partnerData } : {}),
          ...(teamName ? { teamName } : {})
        };

        transaction.update(tournamentRef, {
          participants: [...tournament.participants, participant],
          updatedAt: serverTimestamp()
        });
      } else {
        const entry: WaitlistEntry = {
          userId: user.id,
          userName: user.name || 'Jugador',
          userKey: profile?.key ?? '',
          registeredAt: Date.now(),
          ...(user.email ? { email: normalizeEmail(user.email) } : {}),
          ...(user.photoURL ? { photoURL: user.photoURL } : {}),
          ...(partnerData ? { partner: partnerData } : {})
        };

        transaction.update(tournamentRef, {
          waitlist: [...(tournament.waitlist || []), entry],
          updatedAt: serverTimestamp()
        });
      }
    }, { maxAttempts: 10 });

    return { success: true, status: outcome };
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

  const { db, isFirebaseEnabled } = await import('./config');
  if (!isFirebaseEnabled() || !db) return { success: false, error: 'Firebase not available' };

  const { get } = await import('svelte/store');
  const { currentUser } = await import('./auth');
  const user = get(currentUser);
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { parseTournamentData } = await import('./tournaments');
    const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');

    const tournamentRef = doc(db, 'tournaments', tournamentId);
    let promoted = false;

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (tournament.status !== 'DRAFT') throw new Error('Cannot unregister after tournament has started');

      const participantIndex = tournament.participants.findIndex(p => p.userId === user.id);
      const waitlist: WaitlistEntry[] = tournament.waitlist || [];

      // Case B: user is not a primary participant but occupies a partner slot
      // (REGISTERED partner of someone else's team). Detach without removing the team.
      if (participantIndex === -1) {
        const detach = detachUserFromPartnerSlots(tournament.participants, waitlist, user.id);
        if (!detach.detached) throw new Error('Not registered');
        transaction.update(tournamentRef, {
          participants: detach.participants,
          waitlist: detach.waitlist,
          updatedAt: serverTimestamp()
        });
        return;
      }

      const newParticipants = tournament.participants.filter(p => p.userId !== user.id);
      let newWaitlist = waitlist;

      if (shouldAutoPromote(waitlist, tournament.registration, newParticipants.length)) {
        const next = waitlist[0];
        const remainingWaitlist = waitlist.slice(1);
        const safePartner = sanitizePromotedPartner(next.partner, newParticipants, remainingWaitlist, next.userId);
        const promoted_participant: TournamentParticipant = {
          id: `participant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          type: 'REGISTERED',
          userId: next.userId,
          userKey: next.userKey,
          name: next.userName,
          rankingSnapshot: 0,
          status: 'ACTIVE',
          ...(next.email ? { email: next.email } : {}),
          ...(next.photoURL ? { photoURL: next.photoURL } : {}),
          ...(safePartner ? { partner: safePartner } : {}),
          ...(next.teamName ? { teamName: next.teamName } : {})
        };
        newParticipants.push(promoted_participant);
        newWaitlist = remainingWaitlist;
        promoted = true;
      }

      transaction.update(tournamentRef, {
        participants: newParticipants,
        waitlist: newWaitlist,
        updatedAt: serverTimestamp()
      });
    }, { maxAttempts: 10 });

    return { success: true, promoted };
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

  const { db, isFirebaseEnabled } = await import('./config');
  if (!isFirebaseEnabled() || !db) return { success: false, error: 'Firebase not available' };

  const { get } = await import('svelte/store');
  const { currentUser } = await import('./auth');
  const user = get(currentUser);
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { parseTournamentData } = await import('./tournaments');
    const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');

    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (tournament.status !== 'DRAFT') throw new Error('Cannot leave waitlist after tournament has started');

      const waitlist: WaitlistEntry[] = tournament.waitlist || [];
      if (!waitlist.some(w => w.userId === user.id)) throw new Error('Not on waitlist');

      transaction.update(tournamentRef, {
        waitlist: waitlist.filter(w => w.userId !== user.id),
        updatedAt: serverTimestamp()
      });
    }, { maxAttempts: 10 });

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
