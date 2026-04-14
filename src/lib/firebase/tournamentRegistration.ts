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
  partnerData?: PartnerData
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
          ...(partnerData ? { partner: partnerData } : {})
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
