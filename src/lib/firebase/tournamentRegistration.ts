import type { TournamentParticipant, WaitlistEntry, ParticipantType, TournamentRegistration } from '$lib/types/tournament';

// --- Pure validation (exported for testing) ---

export interface RegistrationValidation {
  canRegister: boolean;
  reason?: 'not_draft' | 'registration_disabled' | 'deadline_passed' | 'already_registered' | 'already_waitlisted';
}

export function validateRegistration(
  tournamentStatus: string,
  registration: TournamentRegistration | undefined,
  participantUserIds: string[],
  waitlistUserIds: string[],
  currentUserId: string,
  now: number
): RegistrationValidation {
  if (tournamentStatus !== 'DRAFT') return { canRegister: false, reason: 'not_draft' };
  if (!registration?.enabled) return { canRegister: false, reason: 'registration_disabled' };
  if (registration.deadline && now > registration.deadline) return { canRegister: false, reason: 'deadline_passed' };
  if (participantUserIds.includes(currentUserId)) return { canRegister: false, reason: 'already_registered' };
  if (waitlistUserIds.includes(currentUserId)) return { canRegister: false, reason: 'already_waitlisted' };
  return { canRegister: true };
}

export function determineRegistrationOutcome(
  participantsCount: number,
  maxParticipants?: number
): 'registered' | 'waitlisted' {
  if (maxParticipants && participantsCount >= maxParticipants) return 'waitlisted';
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
  rulesText: string,
  rulesUrl: string,
  notify: boolean,
  showList: boolean
): TournamentRegistration | undefined {
  if (!enabled) return undefined;
  const ds = deadlineDate
    ? (deadlineTime ? `${deadlineDate}T${deadlineTime}` : `${deadlineDate}T23:59`)
    : '';
  return {
    enabled: true,
    deadline: ds ? new Date(ds).getTime() : undefined,
    maxParticipants: maxParticipants || undefined,
    entryFee: entryFee.trim() || undefined,
    rulesText: rulesText.trim() || undefined,
    rulesUrl: rulesUrl.trim() || undefined,
    notifyOnRegistration: notify,
    showParticipantList: showList,
  };
}

export function adminPromoteFromWaitlist(
  participants: TournamentParticipant[],
  waitlist: WaitlistEntry[],
  userId: string,
  participantId = `participant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
): { participants: TournamentParticipant[]; waitlist: WaitlistEntry[] } | null {
  const entryIndex = waitlist.findIndex(w => w.userId === userId);
  if (entryIndex === -1) return null;
  const entry = waitlist[entryIndex];
  const promoted: TournamentParticipant = {
    id: participantId,
    type: 'REGISTERED',
    userId: entry.userId,
    userKey: entry.userKey,
    name: entry.userName,
    rankingSnapshot: 0,
    status: 'ACTIVE',
    ...(entry.partner ? { partner: entry.partner } : {})
  };
  return {
    participants: [...participants, promoted],
    waitlist: waitlist.filter((_, i) => i !== entryIndex)
  };
}

export function adminRemoveFromWaitlist(
  waitlist: WaitlistEntry[],
  userId: string
): WaitlistEntry[] {
  return waitlist.filter(w => w.userId !== userId);
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
  const { currentUser } = await import('./auth');
  const user = get(currentUser);
  if (!user) {
    return { success: false, error: 'Not authenticated' };
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

      const validation = validateRegistration(
        tournament.status,
        tournament.registration,
        participantUserIds,
        waitlistUserIds,
        user.id,
        Date.now()
      );

      if (!validation.canRegister) {
        throw new Error(validation.reason || 'Cannot register');
      }

      outcome = determineRegistrationOutcome(
        tournament.participants.length,
        tournament.registration?.maxParticipants
      );

      if (outcome === 'registered') {
        const participant: TournamentParticipant = {
          id: `participant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          type: 'REGISTERED',
          userId: user.id,
          userKey: profile?.key ?? '',
          name: user.name || 'Jugador',
          email: user.email ?? undefined,
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
          ...(partnerData ? { partner: partnerData } : {})
        };

        transaction.update(tournamentRef, {
          waitlist: [...(tournament.waitlist || []), entry],
          updatedAt: serverTimestamp()
        });
      }
    });

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
      if (participantIndex === -1) throw new Error('Not registered');

      const newParticipants = tournament.participants.filter(p => p.userId !== user.id);
      const waitlist: WaitlistEntry[] = tournament.waitlist || [];
      let newWaitlist = waitlist;

      if (waitlist.length > 0) {
        const next = waitlist[0];
        const promoted_participant: TournamentParticipant = {
          id: `participant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          type: 'REGISTERED',
          userId: next.userId,
          userKey: next.userKey,
          name: next.userName,
          rankingSnapshot: 0,
          status: 'ACTIVE',
          ...(next.partner ? { partner: next.partner } : {})
        };
        newParticipants.push(promoted_participant);
        newWaitlist = waitlist.slice(1);
        promoted = true;
      }

      transaction.update(tournamentRef, {
        participants: newParticipants,
        waitlist: newWaitlist,
        updatedAt: serverTimestamp()
      });
    });

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
    });

    return { success: true };
  } catch (error: any) {
    console.error('Leave waitlist failed:', error);
    return { success: false, error: error.message };
  }
}
