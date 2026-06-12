/**
 * Firebase functions for tournament management
 * CRUD operations and tournament lifecycle management
 */

import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { isAdmin, isSuperAdmin } from './admin';
import type { Tournament, TournamentStatus, TournamentParticipant, BracketMatch, WaitlistEntry } from '$lib/types/tournament';
import { reconcileEditedRegistration, rosterChanged, applyRankingSnapshots, type EditBaseline } from './tournamentRegistration';
import { getUserProfile, type UserProfile } from './userProfile';
import { getQuotaForYear, getQuotaEntryForYear, type QuotaEntry } from '$lib/types/quota';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getCountFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  runTransaction,
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { cleanUndefined } from './cleanUndefined';

// ============================================================================
// PERMISSION HELPERS
// ============================================================================

/**
 * Check if a user can manage a tournament (edit, update matches, etc.)
 * Returns true if user is owner, in adminIds, or superadmin
 *
 * @param tournament Tournament object or partial with ownership fields
 * @param userId User ID to check
 * @returns true if user can manage the tournament
 */
export async function canManageTournament(
  tournament: { ownerId?: string; adminIds?: string[]; createdBy?: { userId: string } },
  userId: string
): Promise<boolean> {
  // Check if user is owner (ownerId takes precedence, fallback to createdBy.userId)
  const ownerId = tournament.ownerId || tournament.createdBy?.userId;
  if (ownerId === userId) {
    return true;
  }

  // Check if user is in adminIds
  if (tournament.adminIds?.includes(userId)) {
    return true;
  }

  // Check if user is superadmin
  const superAdminStatus = await isSuperAdmin();
  return superAdminStatus;
}

/**
 * Check if a user can manage tournament admins (add/remove admins, transfer ownership)
 * Returns true only if user is owner or superadmin
 *
 * @param tournament Tournament object or partial with ownership fields
 * @param userId User ID to check
 * @returns true if user can manage admins
 */
export async function canManageAdmins(
  tournament: { ownerId?: string; createdBy?: { userId: string } },
  userId: string
): Promise<boolean> {
  // Only owner or superadmin can manage admins
  const ownerId = tournament.ownerId || tournament.createdBy?.userId;
  if (ownerId === userId) {
    return true;
  }

  const superAdminStatus = await isSuperAdmin();
  return superAdminStatus;
}

/**
 * Get the effective owner ID of a tournament
 * Uses ownerId if set, otherwise falls back to createdBy.userId
 */
export function getEffectiveOwnerId(
  tournament: { ownerId?: string; createdBy?: { userId: string } }
): string | undefined {
  return tournament.ownerId || tournament.createdBy?.userId;
}

// ============================================================================
// QUOTA FUNCTIONS
// ============================================================================

/**
 * Get count of tournaments created by a user in a specific year
 *
 * @param userId User ID to count tournaments for
 * @param year Calendar year (e.g., 2024)
 * @returns Number of tournaments created by user in that year
 */
export async function getUserTournamentCountForYear(
  userId: string,
  year: number
): Promise<number> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return 0;
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');

    // Calculate year boundaries (timestamps in milliseconds)
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd = new Date(year + 1, 0, 1).getTime();

    // Query tournaments created by this user within the year
    const q = query(
      tournamentsRef,
      where('createdBy.userId', '==', userId),
      where('createdAt', '>=', Timestamp.fromMillis(yearStart)),
      where('createdAt', '<', Timestamp.fromMillis(yearEnd))
    );

    const countSnapshot = await getCountFromServer(q);
    return countSnapshot.data().count;
  } catch (error) {
    console.error('Error getting user tournament count:', error);
    return 0;
  }
}

/**
 * Check if current user can create a new tournament (quota check)
 *
 * @returns Object with quota info: canCreate, used, limit, isSuperAdmin, quotaEntry
 */
export async function checkTournamentQuota(): Promise<{
  canCreate: boolean;
  used: number;
  limit: number;
  isSuperAdmin: boolean;
  quotaEntry?: QuotaEntry;
}> {
  if (!browser || !isFirebaseEnabled()) {
    return { canCreate: false, used: 0, limit: 0, isSuperAdmin: false };
  }

  const user = get(currentUser);
  if (!user) {
    return { canCreate: false, used: 0, limit: 0, isSuperAdmin: false };
  }

  try {
    const superAdminStatus = await isSuperAdmin();

    // SuperAdmins bypass quota
    if (superAdminStatus) {
      return { canCreate: true, used: 0, limit: Infinity, isSuperAdmin: true };
    }

    const profile = await getUserProfile();

    // Log warning if profile is null - may indicate race condition
    if (!profile) {
      console.warn('checkTournamentQuota: getUserProfile() returned null - user profile may not be loaded yet');
    }

    const currentYear = new Date().getFullYear();

    // 1. Try new quota system first (quotaEntries array)
    let maxTournaments = getQuotaForYear(profile?.quotaEntries, currentYear);
    const quotaEntry = getQuotaEntryForYear(profile?.quotaEntries, currentYear);

    // 2. Fallback to old system for backward compatibility — ONLY when there
    //    is no entry for the year. An explicit 0 entry means the quota was
    //    revoked and must not be overridden by the legacy field.
    if (maxTournaments === 0 && !quotaEntry && profile?.maxTournamentsPerYear) {
      maxTournaments = profile.maxTournamentsPerYear;
    }

    // If max is 0, user cannot create tournaments
    // Note: This could be a race condition if profile wasn't loaded yet
    if (maxTournaments === 0) {
      console.warn('checkTournamentQuota: maxTournaments is 0, profile loaded:', !!profile);
      return { canCreate: false, used: 0, limit: 0, isSuperAdmin: false };
    }

    const usedCount = await getUserTournamentCountForYear(user.id, currentYear);

    return {
      canCreate: usedCount < maxTournaments,
      used: usedCount,
      limit: maxTournaments,
      isSuperAdmin: false,
      quotaEntry
    };
  } catch (error) {
    console.error('Error checking tournament quota:', error);
    return { canCreate: false, used: 0, limit: 0, isSuperAdmin: false };
  }
}

/**
 * Create a new tournament
 *
 * @param data Tournament data
 * @returns Tournament ID or null if failed
 */
export async function createTournament(data: Partial<Tournament>): Promise<string | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return null;
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return null;
  }

  // Check tournament quota (SuperAdmins bypass this check)
  const quotaCheck = await checkTournamentQuota();
  if (!quotaCheck.canCreate) {
    console.error('Tournament quota exceeded:', {
      used: quotaCheck.used,
      limit: quotaCheck.limit
    });
    return null;
  }

  // Get user profile to use playerName instead of Google account name
  const userProfile = await getUserProfile();
  const creatorName = userProfile?.playerName || user.name;

  try {
    const tournamentId = `tournament-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const tournamentRef = doc(db!, 'tournaments', tournamentId);

    // Build tournament object with only defined values
    const tournament: any = {
      id: tournamentId,
      key: data.key,
      name: data.name || 'Nuevo Torneo',
      edition: data.edition || 1,
      country: data.country || 'España',
      city: data.city || '',
      status: 'DRAFT',
      phaseType: data.phaseType || 'ONE_PHASE',
      gameType: data.gameType || 'singles',
      show20s: data.show20s ?? true,
      showHammer: data.showHammer ?? true,
      isTest: data.isTest ?? false,
      numTables: data.numTables || 1,
      rankingConfig: data.rankingConfig || {
        enabled: true,
        tier: 'SERIES_15'
      },
      participants: [],
      finalStage: data.finalStage || {
        mode: 'SINGLE_BRACKET',
        goldBracket: {
          rounds: [],
          totalRounds: 0,
          config: {
            earlyRounds: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
            semifinal: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
            final: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 }
          }
        },
        isComplete: false
      },
      createdAt: Date.now(),
      createdBy: {
        userId: user.id,
        userName: creatorName
      },
      ownerId: user.id,        // Owner is the creator by default
      ownerName: creatorName,  // Owner name for display
      adminIds: [],            // No additional admins initially
      updatedAt: Date.now()
    };

    // Add optional fields only if they exist in the data object
    if ('description' in data && data.description) tournament.description = data.description;
    if ('descriptionLanguage' in data && data.descriptionLanguage) tournament.descriptionLanguage = data.descriptionLanguage;
    // tournamentDate is MANDATORY: the public /tournaments query orders by it,
    // and Firestore's orderBy silently excludes docs missing the field — a
    // tournament created without a date would be invisible forever.
    tournament.tournamentDate = data.tournamentDate || Date.now();
    if ('tournamentTime' in data && data.tournamentTime) tournament.tournamentTime = data.tournamentTime;
    if ('address' in data && data.address) tournament.address = data.address;
    if ('venueId' in data && data.venueId) tournament.venueId = data.venueId;
    if ('externalLink' in data && data.externalLink) tournament.externalLink = data.externalLink;
    if ('posterUrl' in data && data.posterUrl) tournament.posterUrl = data.posterUrl;
    if ('timeConfig' in data && data.timeConfig) tournament.timeConfig = data.timeConfig;
    if ('registration' in data && data.registration) tournament.registration = data.registration;
    if ('finalStageMinQualifiers' in data && data.finalStageMinQualifiers) tournament.finalStageMinQualifiers = data.finalStageMinQualifiers;
    if ('timeEstimate' in data && data.timeEstimate) tournament.timeEstimate = data.timeEstimate;

    // Add groupStage configuration if it exists in the data
    if ('groupStage' in data && data.groupStage) {
      tournament.groupStage = data.groupStage;
    }

    await setDoc(tournamentRef, {
      ...tournament,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log('✅ Tournament created:', tournamentId);
    return tournamentId;
  } catch (error) {
    console.error('❌ Error creating tournament:', error);
    return null;
  }
}

/**
 * Parse raw Firestore document data into a Tournament object.
 * Converts Firestore Timestamps to numeric milliseconds.
 * Exported so transactional functions can reuse it without duplicating logic.
 */
export function parseTournamentData(data: DocumentData): Tournament {
  return {
    ...data,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
    startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
    completedAt:
      data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
  } as Tournament;
}

/**
 * In-memory cache of recently seen tournaments, fed by one-shot reads and by
 * the live onSnapshot subscriptions (which parse the full doc on every
 * emission anyway). Lets hot paths like /game's tap-to-play skip a network
 * round-trip when the doc was seen seconds ago — safe because the start/
 * complete transactions re-validate everything against the server.
 * Entries are shared references: callers must not mutate them.
 */
const tournamentCache = new Map<string, { tournament: Tournament; at: number }>();
const TOURNAMENT_CACHE_MAX_ENTRIES = 8;

function cacheTournament(tournament: Tournament): void {
  if (!tournament.id) return;
  const entry = { tournament, at: Date.now() };
  // Refresh insertion order so eviction below drops the least recently seen
  tournamentCache.delete(tournament.id);
  tournamentCache.set(tournament.id, entry);
  if (tournament.key) {
    const keyId = `key:${tournament.key.toUpperCase()}`;
    tournamentCache.delete(keyId);
    tournamentCache.set(keyId, entry);
  }
  while (tournamentCache.size > TOURNAMENT_CACHE_MAX_ENTRIES) {
    const oldest = tournamentCache.keys().next().value;
    if (oldest === undefined) break;
    tournamentCache.delete(oldest);
  }
}

function getCachedTournament(cacheId: string, maxAgeMs: number): Tournament | null {
  const entry = tournamentCache.get(cacheId);
  if (entry && Date.now() - entry.at <= maxAgeMs) return entry.tournament;
  return null;
}

/**
 * Drop a tournament from the in-memory cache. Called after writes that change
 * match status (start/complete/abandon) so subsequent cached reads never see
 * the pre-write state.
 */
export function invalidateTournamentCache(tournamentId: string): void {
  for (const [cacheId, entry] of tournamentCache) {
    if (entry.tournament.id === tournamentId) tournamentCache.delete(cacheId);
  }
}

/**
 * Get tournament by ID
 *
 * @param id Tournament ID
 * @returns Tournament or null
 */
export async function getTournament(id: string, forceServer = false): Promise<Tournament | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', id);
    const snapshot = forceServer
      ? await getDocFromServer(tournamentRef)
      : await getDoc(tournamentRef);

    if (!snapshot.exists()) {
      console.warn('Tournament not found:', id);
      return null;
    }

    const data = snapshot.data();

    // Note: getTournament is used for public viewing - no permission check needed
    // Edit permissions are handled separately in the UI (canEdit flag)

    const tournament = parseTournamentData(data);
    cacheTournament(tournament);
    return tournament;
  } catch (error) {
    console.error('❌ Error getting tournament:', error);
    return null;
  }
}

/**
 * Paginated result for tournaments
 */
export interface PaginatedTournamentsResult {
  tournaments: Tournament[];
  totalCount: number;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Get tournaments with pagination (admin only)
 */
export async function getTournamentsPaginated(
  pageSize: number = 15,
  lastDocument: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<PaginatedTournamentsResult> {
  const emptyResult: PaginatedTournamentsResult = {
    tournaments: [],
    totalCount: 0,
    lastDoc: null,
    hasMore: false
  };

  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return emptyResult;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return emptyResult;
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return emptyResult;
  }

  // Check if user is superadmin (can see all tournaments)
  const superAdminStatus = await isSuperAdmin();

  try {
    const tournamentsRef = collection(db!, 'tournaments');

    // Helper to convert Firestore doc to Tournament
    const docToTournament = (data: DocumentData): Tournament => ({
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
      startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
      completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
    } as Tournament);

    if (superAdminStatus) {
      // SuperAdmin: standard Firestore pagination
      const countSnapshot = await getCountFromServer(tournamentsRef);
      const totalCount = countSnapshot.data().count;

      let q;
      if (lastDocument) {
        q = query(
          tournamentsRef,
          orderBy('createdAt', 'desc'),
          startAfter(lastDocument),
          limit(pageSize)
        );
      } else {
        q = query(tournamentsRef, orderBy('createdAt', 'desc'), limit(pageSize));
      }

      const snapshot = await getDocs(q);
      const tournaments: Tournament[] = [];
      snapshot.forEach(docSnap => {
        tournaments.push(docToTournament(docSnap.data()));
      });

      const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      const hasMore = snapshot.docs.length === pageSize;

      console.log(`✅ Retrieved ${tournaments.length} tournaments (page), total: ${totalCount}`);
      return { tournaments, totalCount, lastDoc, hasMore };
    } else {
      // Admin: combine multiple queries (owned + collaborator + legacy)
      // Since Firestore doesn't support OR queries, we fetch all matching and paginate client-side
      const maxFetchLimit = 500; // Reasonable limit for admin tournaments

      // Query 1: Tournaments owned by user
      const ownedQuery = query(
        tournamentsRef,
        where('ownerId', '==', user.id),
        orderBy('createdAt', 'desc'),
        limit(maxFetchLimit)
      );

      // Query 2: Tournaments where user is in adminIds
      const collaboratorQuery = query(
        tournamentsRef,
        where('adminIds', 'array-contains', user.id),
        orderBy('createdAt', 'desc'),
        limit(maxFetchLimit)
      );

      // Query 3: Legacy tournaments (createdBy.userId for backward compatibility)
      const legacyQuery = query(
        tournamentsRef,
        where('createdBy.userId', '==', user.id),
        orderBy('createdAt', 'desc'),
        limit(maxFetchLimit)
      );

      // Execute all queries in parallel
      const [ownedSnapshot, collaboratorSnapshot, legacySnapshot] = await Promise.all([
        getDocs(ownedQuery),
        getDocs(collaboratorQuery),
        getDocs(legacyQuery)
      ]);

      // Combine and deduplicate results
      const tournamentsMap = new Map<string, Tournament>();
      ownedSnapshot.forEach(docSnap => {
        tournamentsMap.set(docSnap.id, docToTournament(docSnap.data()));
      });
      collaboratorSnapshot.forEach(docSnap => {
        tournamentsMap.set(docSnap.id, docToTournament(docSnap.data()));
      });
      legacySnapshot.forEach(docSnap => {
        tournamentsMap.set(docSnap.id, docToTournament(docSnap.data()));
      });

      // Sort by createdAt desc
      const allTournaments = Array.from(tournamentsMap.values())
        .sort((a, b) => b.createdAt - a.createdAt);

      const totalCount = allTournaments.length;

      // Client-side pagination using offset from lastDocument
      // Since we can't use Firestore's startAfter with combined queries,
      // we use a simple offset approach
      let startIndex = 0;
      if (lastDocument) {
        // Find the index after the last document's createdAt
        const lastCreatedAt = lastDocument.data().createdAt instanceof Timestamp
          ? lastDocument.data().createdAt.toMillis()
          : lastDocument.data().createdAt;
        startIndex = allTournaments.findIndex(t => t.createdAt < lastCreatedAt);
        if (startIndex === -1) startIndex = allTournaments.length;
      }

      const tournaments = allTournaments.slice(startIndex, startIndex + pageSize);
      const hasMore = startIndex + pageSize < totalCount;

      console.log(`✅ Retrieved ${tournaments.length} tournaments (page), total: ${totalCount}`);
      return {
        tournaments,
        totalCount,
        lastDoc: null, // Not used for client-side pagination
        hasMore
      };
    }
  } catch (error) {
    console.error('❌ Error getting tournaments:', error);
    return emptyResult;
  }
}

/**
 * Update tournament
 *
 * @param id Tournament ID
 * @param updates Partial tournament data
 * @returns true if successful
 */
export async function updateTournament(
  id: string,
  updates: Partial<Tournament>
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return false;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', id);

    // Recursively remove undefined values from updates
    const cleanUpdates = cleanUndefined(updates);

    // Use transaction to ensure atomic read-check-write
    await runTransaction(db!, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) {
        throw new Error('Tournament not found: ' + id);
      }

      const tournamentData = snapshot.data();
      const hasPermission = await canManageTournament(tournamentData, user.id);
      if (!hasPermission) {
        throw new Error('Unauthorized: User cannot edit this tournament');
      }

      transaction.update(tournamentRef, {
        ...cleanUpdates,
        updatedAt: serverTimestamp()
      });
    });

    console.log('✅ Tournament updated:', id);
    return true;
  } catch (error) {
    console.error('❌ Error updating tournament:', error);
    return false;
  }
}

/**
 * Update a DRAFT tournament from the edit wizard, MERGING the participant and
 * waitlist arrays against the live Firestore state inside the transaction.
 *
 * Why this exists: the wizard builds `editedParticipants` / `editedWaitlist`
 * from a snapshot taken when it opened. A plain `updateTournament({ participants })`
 * blindly overwrites the arrays, silently destroying any self-registration,
 * waitlist join, or promotion that happened while the wizard was open. This
 * function re-reads the current arrays inside the transaction and reconciles
 * (see `reconcileEditedRegistration`) so concurrent registrations survive.
 *
 * `configUpdates` MUST NOT contain `participants` or `waitlist` — those are
 * computed here from baseline + edited + current.
 *
 * @returns true if successful
 */
export async function updateDraftTournamentMergingRegistration(
  id: string,
  configUpdates: Partial<Tournament>,
  baseline: EditBaseline,
  editedParticipants: TournamentParticipant[],
  editedWaitlist: WaitlistEntry[]
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return false;
  }

  // Defensive: never let participants/waitlist sneak in via configUpdates and
  // re-introduce the blind overwrite this function exists to prevent.
  const { participants: _p, waitlist: _w, ...safeConfig } = configUpdates as Record<string, unknown>;

  try {
    const tournamentRef = doc(db!, 'tournaments', id);

    await runTransaction(db!, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) {
        throw new Error('Tournament not found: ' + id);
      }

      const current = parseTournamentData(snapshot.data());

      const hasPermission = await canManageTournament(current, user.id);
      if (!hasPermission) {
        throw new Error('Unauthorized: User cannot edit this tournament');
      }

      // Only DRAFT tournaments accept participant edits. If it auto-started
      // (DRAFT → GROUP_STAGE) while the wizard was open, abort rather than
      // corrupt a running tournament's roster.
      if (current.status !== 'DRAFT') {
        throw new Error('Cannot edit participants: tournament is no longer in DRAFT status');
      }

      const merged = reconcileEditedRegistration(
        baseline,
        { participants: editedParticipants, waitlist: editedWaitlist },
        { participants: current.participants || [], waitlist: current.waitlist || [] }
      );

      const cleanUpdates = cleanUndefined({
        ...safeConfig,
        participants: merged.participants,
        waitlist: merged.waitlist
      });

      transaction.update(tournamentRef, {
        ...cleanUpdates,
        updatedAt: serverTimestamp()
      });
    });

    console.log('✅ Tournament updated (registration merged):', id);
    return true;
  } catch (error) {
    console.error('❌ Error updating tournament (registration merge):', error);
    return false;
  }
}

/**
 * Apply pre-computed participant updates (ranking snapshots) onto a DRAFT
 * tournament transactionally, preserving any participant that registered
 * concurrently. Replaces the old read-outside / blind-overwrite pattern in
 * `syncParticipantRankings`, which dropped last-second registrations made while
 * the tournament was being started.
 *
 * @param updatedByKey participant identity key → fully-updated participant row
 */
export async function applyParticipantRankingSnapshots(
  id: string,
  updatedByKey: Map<string, TournamentParticipant>
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', id);

    await runTransaction(db!, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found: ' + id);

      const current = parseTournamentData(snapshot.data());
      const merged = applyRankingSnapshots(current.participants || [], updatedByKey);

      transaction.update(tournamentRef, {
        participants: cleanUndefined(merged),
        updatedAt: serverTimestamp()
      });
    });

    return true;
  } catch (error) {
    console.error('❌ Error applying ranking snapshots:', error);
    return false;
  }
}

export type StartCommitReason = 'roster_changed' | 'not_draft' | 'not_found' | 'error';

export interface StartCommitResult {
  success: boolean;
  reason?: StartCommitReason;
}

/**
 * Commit a tournament-start write (status → GROUP_STAGE, generated schedule,
 * frozen participants, closed registration) ONLY if the participant roster is
 * still exactly what the schedule was built from.
 *
 * If a player self-registered / unregistered / was promoted between the moment
 * the roster was snapshotted and this commit, the write is aborted with
 * `roster_changed` instead of silently dropping that registration. The caller
 * re-runs the start, which rebuilds the schedule including the new roster.
 *
 * @param expectedRosterKeys identity keys (see `participantIdentityKey`) of the
 *   roster the `updates` were built from. `updates.participants` must align with it.
 */
export async function commitTournamentStartIfRosterUnchanged(
  id: string,
  expectedRosterKeys: string[],
  updates: Partial<Tournament>
): Promise<StartCommitResult> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return { success: false, reason: 'error' };
  }

  let reason: StartCommitReason | undefined;
  try {
    const tournamentRef = doc(db!, 'tournaments', id);

    await runTransaction(db!, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) {
        reason = 'not_found';
        throw new Error('Tournament not found: ' + id);
      }

      const current = parseTournamentData(snapshot.data());

      if (current.status !== 'DRAFT') {
        reason = 'not_draft';
        throw new Error('Tournament is no longer in DRAFT status');
      }

      if (rosterChanged(expectedRosterKeys, current.participants || [])) {
        reason = 'roster_changed';
        throw new Error('Participant roster changed while starting the tournament');
      }

      transaction.update(tournamentRef, {
        ...cleanUndefined(updates),
        updatedAt: serverTimestamp()
      });
    });

    return { success: true };
  } catch (error) {
    if (reason) {
      console.warn(`⚠️ Tournament start aborted (${reason}):`, id);
      return { success: false, reason };
    }
    console.error('❌ Error committing tournament start:', error);
    return { success: false, reason: 'error' };
  }
}

/**
 * Update tournament without auth check (for match operations)
 * Security is handled by Firestore rules (key-based access)
 *
 * @param id Tournament ID
 * @param updates Partial tournament data
 * @returns true if successful
 */
export async function updateTournamentPublic(
  id: string,
  updates: Partial<Tournament>
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', id);

    // Recursively remove undefined values from updates
    const cleanUpdates = cleanUndefined(updates);

    // Use transaction to ensure atomic read-write (prevents concurrent overwrites)
    await runTransaction(db!, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) {
        throw new Error('Tournament not found: ' + id);
      }

      transaction.update(tournamentRef, {
        ...cleanUpdates,
        updatedAt: serverTimestamp()
      });
    });

    console.log('✅ Tournament updated (public):', id);
    return true;
  } catch (error) {
    console.error('❌ Error updating tournament (public):', error);
    return false;
  }
}

/**
 * Delete tournament
 *
 * IMPORTANT: This will revert ranking changes for all participants
 * before deleting the tournament document
 *
 * @param id Tournament ID
 * @returns true if successful
 */
export async function deleteTournament(id: string): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return false;
  }

  try {
    // Check permission using canManageTournament
    const tournamentRef = doc(db!, 'tournaments', id);
    const snapshot = await getDoc(tournamentRef);
    if (!snapshot.exists()) {
      console.error('Tournament not found:', id);
      return false;
    }

    const tournamentData = snapshot.data();
    const hasPermission = await canManageTournament(tournamentData, user.id);
    if (!hasPermission) {
      console.error('Unauthorized: User cannot delete this tournament');
      return false;
    }

    // Completed tournaments can only be deleted by superadmins
    if (tournamentData.status === 'COMPLETED') {
      const superAdminStatus = await isSuperAdmin();
      if (!superAdminStatus) {
        console.error('Unauthorized: Only superadmins can delete completed tournaments');
        return false;
      }
    }

    // First, revert ranking changes for all participants
    const { revertTournamentRanking } = await import('./tournamentRanking');
    const rankingReverted = await revertTournamentRanking(id);

    if (!rankingReverted) {
      console.warn('⚠️ Failed to revert ranking, but continuing with deletion');
    }

    // Then delete the tournament document
    await deleteDoc(tournamentRef);

    console.log('✅ Tournament deleted:', id);
    return true;
  } catch (error) {
    console.error('❌ Error deleting tournament:', error);
    return false;
  }
}

/**
 * Cancel tournament (soft delete)
 *
 * @param id Tournament ID
 * @returns true if successful
 */
export async function cancelTournament(id: string): Promise<boolean> {
  // Status guard: a stale tab can hold a DRAFT view of a tournament that has
  // since COMPLETED (ranking points already distributed by the Cloud Function)
  // or been CANCELLED — flipping those to CANCELLED corrupts the record.
  const current = await getTournament(id);
  if (!current) return false;
  if (current.status === 'COMPLETED' || current.status === 'CANCELLED') {
    console.error(`Cannot cancel tournament in ${current.status} status`);
    return false;
  }

  return await updateTournament(id, {
    status: 'CANCELLED',
    completedAt: Date.now()
  });
}

/**
 * Tournament name with max edition info
 */
export interface TournamentNameInfo {
  name: string;
  maxEdition: number;
  description?: string;
  descriptionLanguage?: string;
  country?: string;
  city?: string;
  address?: string;
}

/**
 * Search unique tournament names for autocomplete
 * Returns name and max edition for auto-filling next edition number
 *
 * @param searchQuery Search query (partial name)
 * @returns Array of tournament name info with max editions
 */
export async function searchTournamentNames(searchQuery: string): Promise<TournamentNameInfo[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return [];
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');

    // Always filter by user's own tournaments (even for superadmins)
    // This ensures autocomplete only suggests from your own tournament history
    const q = query(tournamentsRef, where('createdBy.userId', '==', user.id));
    const snapshot = await getDocs(q);

    // Track max edition per tournament name with additional info
    const namesMap = new Map<string, { maxEdition: number; description?: string; descriptionLanguage?: string; country?: string; city?: string; address?: string }>();
    const queryLower = searchQuery.toLowerCase();

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.name) {
        // If there's a search query, filter by it
        if (!searchQuery || data.name.toLowerCase().includes(queryLower)) {
          const currentInfo = namesMap.get(data.name);
          const edition = data.edition || 1;
          if (!currentInfo || edition > currentInfo.maxEdition) {
            // Store info from the tournament with the highest edition
            namesMap.set(data.name, {
              maxEdition: edition,
              description: data.description,
              descriptionLanguage: data.descriptionLanguage,
              country: data.country,
              city: data.city,
              address: data.address
            });
          }
        }
      }
    });

    // Convert to array of TournamentNameInfo and sort alphabetically
    const results: TournamentNameInfo[] = Array.from(namesMap.entries())
      .map(([name, info]) => ({
        name,
        maxEdition: info.maxEdition,
        description: info.description,
        descriptionLanguage: info.descriptionLanguage,
        country: info.country,
        city: info.city,
        address: info.address
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return results.slice(0, 10); // Limit to 10 results
  } catch (error) {
    console.error('❌ Error searching tournament names:', error);
    return [];
  }
}

/**
 * Get tournament by key (public access for players)
 * This function does NOT require admin permissions
 *
 * @param key 6-character tournament key
 * @returns Tournament or null
 */
export async function getTournamentByKey(
  key: string,
  options?: { maxAgeMs?: number }
): Promise<Tournament | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  if (!key || key.length !== 6) {
    console.warn('Invalid tournament key:', key);
    return null;
  }

  // Opt-in cache: serve a recently seen tournament (e.g. still fresh from the
  // live subscription during the previous match) without a network round-trip.
  if (options?.maxAgeMs) {
    const cached = getCachedTournament(`key:${key.toUpperCase()}`, options.maxAgeMs);
    if (cached) return cached;
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');
    const q = query(tournamentsRef, where('key', '==', key.toUpperCase()), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.warn('Tournament not found with key:', key);
      return null;
    }

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();

    const tournament = parseTournamentData(data);
    // Ensure id always matches the Firestore doc (same as subscribeTournament)
    tournament.id = docSnap.id;

    cacheTournament(tournament);
    return tournament;
  } catch (error) {
    console.error('❌ Error getting tournament by key:', error);
    return null;
  }
}

/**
 * Minimal tournament info for "my tournaments" listing
 */
export interface MyTournamentItem {
  id: string;
  name: string;
  key: string;
  status: TournamentStatus;
  gameType: 'singles' | 'doubles';
  participantsCount: number;
}

/**
 * Get active tournaments where the current user is a participant
 * Returns tournaments that are in GROUP_STAGE, TRANSITION, or FINAL_STAGE
 *
 * @returns Array of active tournaments where user is participant
 */
export async function getMyActiveTournaments(): Promise<MyTournamentItem[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user logged in');
    return [];
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');
    // Get all active tournaments (not DRAFT, COMPLETED, or CANCELLED)
    const q = query(
      tournamentsRef,
      where('status', 'in', ['GROUP_STAGE', 'TRANSITION', 'FINAL_STAGE']),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);

    const myTournaments: MyTournamentItem[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as Tournament;

      // Check if user is a participant (either as player or partner)
      const isParticipant = data.participants?.some(
        p => p.userId === user.id || p.partner?.userId === user.id
      );

      if (isParticipant) {
        myTournaments.push({
          id: docSnap.id,
          name: data.name,
          key: data.key,
          status: data.status,
          gameType: data.gameType,
          participantsCount: data.participants?.length || 0
        });
      }
    }

    console.log(`✅ Found ${myTournaments.length} active tournaments for user`);
    return myTournaments;
  } catch (error) {
    console.error('❌ Error getting user active tournaments:', error);
    return [];
  }
}

/**
 * Check if a tournament key already exists
 * Returns the tournament ID and name if it exists, null otherwise
 *
 * @param key Tournament key (6 alphanumeric characters)
 * @param excludeTournamentId Optional tournament ID to exclude (for edit mode)
 * @returns Object with exists flag, id and name, or null if key is invalid
 */
export async function checkTournamentKeyExists(
  key: string,
  excludeTournamentId?: string
): Promise<{ exists: boolean; id?: string; name?: string } | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  if (!key || key.length !== 6) {
    return null;
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');
    const q = query(tournamentsRef, where('key', '==', key.toUpperCase()), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { exists: false };
    }

    const docSnap = snapshot.docs[0];
    const tournamentId = docSnap.id;

    // If we're excluding a tournament ID (edit mode), check if it's the same
    if (excludeTournamentId && tournamentId === excludeTournamentId) {
      return { exists: false };
    }

    const data = docSnap.data();
    return {
      exists: true,
      id: tournamentId,
      name: data.name || 'Unknown'
    };
  } catch (error) {
    console.error('❌ Error checking tournament key:', error);
    return null;
  }
}

/**
 * Search users for participant selection
 *
 * @param query Search query (name or email)
 * @returns Array of user profiles
 */
/**
 * Remove accents/diacritics from a string for accent-insensitive search
 * "Núria" -> "Nuria", "José" -> "Jose"
 */
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export async function getAllRegisteredUsers(): Promise<(UserProfile & { userId: string })[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  try {
    const usersRef = collection(db!, 'users');
    const snapshot = await getDocs(usersRef);

    const users: (UserProfile & { userId: string })[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as UserProfile;

      // Skip merged users
      if (data.mergedTo) {
        return;
      }

      users.push({
        ...data,
        userId: docSnap.id,
        playerName: data.playerName || 'Usuario'
      });
    });

    return users;
  } catch (error) {
    console.error('❌ Error getting all users:', error);
    return [];
  }
}

export async function searchUsers(searchQuery: string): Promise<UserProfile[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  if (!searchQuery || searchQuery.length < 2) {
    return [];
  }

  try {
    const usersRef = collection(db!, 'users');
    const snapshot = await getDocs(usersRef);

    const users: UserProfile[] = [];
    // Normalize query: lowercase and remove accents
    const queryNormalized = removeAccents(searchQuery.toLowerCase());

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as UserProfile;

      // Skip merged users (they've been migrated to another account)
      if (data.mergedTo) {
        return;
      }

      // Normalize name and email for comparison
      const nameNormalized = removeAccents(data.playerName?.toLowerCase() || '');
      const emailLower = data.email?.toLowerCase() || '';

      const nameMatch = nameNormalized.includes(queryNormalized);
      const emailMatch = emailLower.includes(queryNormalized);

      if (nameMatch || emailMatch) {
        users.push({
          ...data,
          userId: docSnap.id,
          playerName: data.playerName || 'Usuario'
        } as UserProfile & { userId: string });
      }
    });

    // Sort by name
    users.sort((a, b) => (a.playerName || '').localeCompare(b.playerName || ''));

    return users.slice(0, 20); // Limit to 20 results
  } catch (error) {
    console.error('❌ Error searching users:', error);
    return [];
  }
}

/**
 * Subscribe to real-time tournament updates
 * Uses Firestore onSnapshot for live updates
 *
 * @param id Tournament ID
 * @param callback Function called with updated tournament data
 * @returns Unsubscribe function
 */
/**
 * Subscribe to a tournament by its 6-char share key in a SINGLE round trip
 * (query-based onSnapshot). Used by the public detail page: the old
 * getTournamentByKey + subscribeTournament sequence fetched the full doc
 * twice in series, doubling the time-to-content on a doc that embeds all
 * matches. callback(null) when no tournament has that key.
 */
export function subscribeTournamentByKey(
  key: string,
  callback: (tournament: Tournament | null) => void
): () => void {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return () => {};
  }

  const q = query(
    collection(db!, 'tournaments'),
    where('key', '==', key.toUpperCase()),
    limit(1)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }
      const docSnap = snapshot.docs[0];
      const tournament = parseTournamentData(docSnap.data());
      tournament.id = docSnap.id;
      cacheTournament(tournament);
      callback(tournament);
    },
    (error) => {
      console.error('❌ Error in tournament key subscription:', error);
      // Don't overwrite valid data on transient network errors
    }
  );

  return unsubscribe;
}

export function subscribeTournament(
  id: string,
  callback: (tournament: Tournament | null) => void
): () => void {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return () => {};
  }

  const tournamentRef = doc(db!, 'tournaments', id);

  const unsubscribe = onSnapshot(
    tournamentRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const tournament = parseTournamentData(data);
        tournament.id = docSnap.id;
        cacheTournament(tournament);
        callback(tournament);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('❌ Error in tournament subscription:', error);
      // Don't overwrite valid data on transient network errors
    }
  );

  return unsubscribe;
}

// ============================================================================
// TOURNAMENT ADMIN MANAGEMENT
// ============================================================================

/**
 * Add an admin to a tournament
 * Only the owner or superadmin can add admins
 *
 * @param tournamentId Tournament ID
 * @param adminUserId User ID of the admin to add
 * @returns true if successful
 */
export async function addTournamentAdmin(
  tournamentId: string,
  adminUserId: string
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', tournamentId);
    const snapshot = await getDoc(tournamentRef);

    if (!snapshot.exists()) {
      console.error('Tournament not found:', tournamentId);
      return false;
    }

    const tournamentData = snapshot.data();

    // Check if current user can manage admins
    const hasPermission = await canManageAdmins(tournamentData, user.id);
    if (!hasPermission) {
      console.error('Unauthorized: Only owner or superadmin can add tournament admins');
      return false;
    }

    // Get current adminIds
    const currentAdminIds = tournamentData.adminIds || [];

    // Check if user is already an admin
    if (currentAdminIds.includes(adminUserId)) {
      console.warn('User is already an admin of this tournament');
      return true; // Not an error, just already added
    }

    // Check if trying to add the owner
    const ownerId = getEffectiveOwnerId(tournamentData);
    if (adminUserId === ownerId) {
      console.warn('Cannot add owner as admin (they already have full access)');
      return true;
    }

    // Add the new admin
    await updateDoc(tournamentRef, {
      adminIds: [...currentAdminIds, adminUserId],
      updatedAt: serverTimestamp()
    });

    console.log('✅ Admin added to tournament:', adminUserId);
    return true;
  } catch (error) {
    console.error('❌ Error adding tournament admin:', error);
    return false;
  }
}

/**
 * Remove an admin from a tournament
 * Only the owner or superadmin can remove admins
 *
 * @param tournamentId Tournament ID
 * @param adminUserId User ID of the admin to remove
 * @returns true if successful
 */
export async function removeTournamentAdmin(
  tournamentId: string,
  adminUserId: string
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', tournamentId);
    const snapshot = await getDoc(tournamentRef);

    if (!snapshot.exists()) {
      console.error('Tournament not found:', tournamentId);
      return false;
    }

    const tournamentData = snapshot.data();

    // Check if current user can manage admins
    const hasPermission = await canManageAdmins(tournamentData, user.id);
    if (!hasPermission) {
      console.error('Unauthorized: Only owner or superadmin can remove tournament admins');
      return false;
    }

    // Get current adminIds
    const currentAdminIds = tournamentData.adminIds || [];

    // Remove the admin
    const updatedAdminIds = currentAdminIds.filter((id: string) => id !== adminUserId);

    await updateDoc(tournamentRef, {
      adminIds: updatedAdminIds,
      updatedAt: serverTimestamp()
    });

    console.log('✅ Admin removed from tournament:', adminUserId);
    return true;
  } catch (error) {
    console.error('❌ Error removing tournament admin:', error);
    return false;
  }
}

/**
 * Transfer tournament ownership to another user
 * Only the owner or superadmin can transfer ownership
 *
 * @param tournamentId Tournament ID
 * @param newOwnerId User ID of the new owner
 * @param keepPreviousOwnerAsAdmin If true, previous owner becomes an admin
 * @returns true if successful
 */
export async function transferTournamentOwnership(
  tournamentId: string,
  newOwnerId: string,
  newOwnerName: string,
  keepPreviousOwnerAsAdmin: boolean = false
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', tournamentId);
    const snapshot = await getDoc(tournamentRef);

    if (!snapshot.exists()) {
      console.error('Tournament not found:', tournamentId);
      return false;
    }

    const tournamentData = snapshot.data();

    // Check if current user can manage admins (transfer is an admin action)
    const hasPermission = await canManageAdmins(tournamentData, user.id);
    if (!hasPermission) {
      console.error('Unauthorized: Only owner or superadmin can transfer ownership');
      return false;
    }

    const currentOwnerId = getEffectiveOwnerId(tournamentData);

    // Can't transfer to yourself
    if (currentOwnerId === newOwnerId) {
      console.warn('Cannot transfer ownership to the current owner');
      return true;
    }

    // Prepare the update
    const currentAdminIds = tournamentData.adminIds || [];

    // Remove new owner from adminIds if they were a collaborator
    let updatedAdminIds = currentAdminIds.filter((id: string) => id !== newOwnerId);

    // Add previous owner to adminIds if requested
    if (keepPreviousOwnerAsAdmin && currentOwnerId && !updatedAdminIds.includes(currentOwnerId)) {
      updatedAdminIds = [...updatedAdminIds, currentOwnerId];
    }

    await updateDoc(tournamentRef, {
      ownerId: newOwnerId,
      ownerName: newOwnerName,
      adminIds: updatedAdminIds,
      updatedAt: serverTimestamp()
    });

    console.log('✅ Tournament ownership transferred to:', newOwnerName, '(', newOwnerId, ')');
    return true;
  } catch (error) {
    console.error('❌ Error transferring tournament ownership:', error);
    return false;
  }
}

/**
 * Get list of admin users for selection
 * Returns users who have isAdmin flag
 *
 * @returns Array of admin user profiles
 */
export async function getAdminUsers(): Promise<(UserProfile & { userId: string })[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  try {
    const usersRef = collection(db!, 'users');
    const q = query(usersRef, where('isAdmin', '==', true));
    const snapshot = await getDocs(q);

    const admins: (UserProfile & { userId: string })[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as UserProfile;

      // Skip merged users
      if (data.mergedTo) {
        return;
      }

      admins.push({
        ...data,
        userId: docSnap.id,
        playerName: data.playerName || 'Usuario'
      });
    });

    // Sort by name
    admins.sort((a, b) => (a.playerName || '').localeCompare(b.playerName || ''));

    return admins;
  } catch (error) {
    console.error('❌ Error getting admin users:', error);
    return [];
  }
}

/**
 * Get tournament admins info (for display in UI)
 * Returns basic info about owner and admin collaborators
 *
 * @param tournament Tournament object
 * @returns Object with owner and admins info
 */
export async function getTournamentAdminsInfo(tournament: Tournament): Promise<{
  owner: { userId: string; name: string } | null;
  admins: Array<{ userId: string; name: string }>;
}> {
  if (!browser || !isFirebaseEnabled()) {
    return { owner: null, admins: [] };
  }

  const result: {
    owner: { userId: string; name: string } | null;
    admins: Array<{ userId: string; name: string }>;
  } = {
    owner: null,
    admins: []
  };

  try {
    const ownerId = getEffectiveOwnerId(tournament);
    const adminIds = tournament.adminIds || [];

    // Get all user IDs we need to fetch
    const userIds = new Set<string>();
    if (ownerId) userIds.add(ownerId);
    adminIds.forEach(id => userIds.add(id));

    if (userIds.size === 0) {
      return result;
    }

    // Fetch user profiles
    const usersRef = collection(db!, 'users');
    const userProfiles = new Map<string, string>();

    for (const userId of userIds) {
      const userDoc = await getDoc(doc(usersRef, userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        userProfiles.set(userId, data.playerName || 'Usuario');
      }
    }

    // Build result
    if (ownerId) {
      result.owner = {
        userId: ownerId,
        name: userProfiles.get(ownerId) || tournament.createdBy?.userName || 'Unknown'
      };
    }

    result.admins = adminIds.map(id => ({
      userId: id,
      name: userProfiles.get(id) || 'Unknown'
    }));

    return result;
  } catch (error) {
    console.error('❌ Error getting tournament admins info:', error);
    return result;
  }
}

// ============================================================================
// USER DEPENDENCY CHECKING
// ============================================================================

/**
 * Summary of a tournament for dependency checking
 */
export interface TournamentSummary {
  id: string;
  name: string;
  status: TournamentStatus;
}

/**
 * User's tournament dependencies
 */
export interface UserTournamentDependencies {
  asOwner: TournamentSummary[];       // BLOQUEANTE - user owns these tournaments
  asCollaborator: TournamentSummary[]; // Auto-remover - user is in adminIds
  asParticipant: TournamentSummary[];  // Solo warning - user is a participant
}

/**
 * Get all tournament dependencies for a user
 * Used to check before deleting a user
 *
 * @param userId User ID to check dependencies for
 * @returns Object with arrays of tournaments by relationship type
 */
export async function getUserTournamentDependencies(
  userId: string
): Promise<UserTournamentDependencies> {
  const result: UserTournamentDependencies = {
    asOwner: [],
    asCollaborator: [],
    asParticipant: []
  };

  if (!browser || !isFirebaseEnabled()) {
    return result;
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');

    // Query 1: Owner by ownerId
    const ownerQuery = query(tournamentsRef, where('ownerId', '==', userId));

    // Query 2: Owner by createdBy.userId (legacy fallback for tournaments without ownerId)
    const creatorQuery = query(tournamentsRef, where('createdBy.userId', '==', userId));

    // Query 3: Collaborator (in adminIds array)
    const collaboratorQuery = query(tournamentsRef, where('adminIds', 'array-contains', userId));

    // Execute owner/collaborator queries in parallel
    const [ownerSnapshot, creatorSnapshot, collaboratorSnapshot] = await Promise.all([
      getDocs(ownerQuery),
      getDocs(creatorQuery),
      getDocs(collaboratorQuery)
    ]);

    // Deduplicate owner results (ownerId and createdBy.userId may overlap)
    const ownerMap = new Map<string, TournamentSummary>();

    ownerSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      ownerMap.set(docSnap.id, {
        id: docSnap.id,
        name: data.name,
        status: data.status
      });
    });

    creatorSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      // Only add if not already an owner via ownerId (legacy tournaments)
      if (!data.ownerId && !ownerMap.has(docSnap.id)) {
        ownerMap.set(docSnap.id, {
          id: docSnap.id,
          name: data.name,
          status: data.status
        });
      }
    });

    result.asOwner = Array.from(ownerMap.values());

    // Collaborator results (exclude if already owner)
    collaboratorSnapshot.forEach(docSnap => {
      if (!ownerMap.has(docSnap.id)) {
        const data = docSnap.data();
        result.asCollaborator.push({
          id: docSnap.id,
          name: data.name,
          status: data.status
        });
      }
    });

    // Query 4: Participant - Firestore cannot query nested arrays
    // We need to fetch all tournaments and filter client-side
    const allTournamentsSnapshot = await getDocs(tournamentsRef);

    const alreadyProcessed = new Set([
      ...ownerMap.keys(),
      ...result.asCollaborator.map(t => t.id)
    ]);

    allTournamentsSnapshot.forEach(docSnap => {
      // Skip if already processed as owner or collaborator
      if (alreadyProcessed.has(docSnap.id)) {
        return;
      }

      const data = docSnap.data();
      const participants = (data.participants || []) as TournamentParticipant[];

      // Check if user is a participant (primary or partner in doubles)
      const isParticipant = participants.some(
        (p: TournamentParticipant) => p.userId === userId || p.partner?.userId === userId
      );

      if (isParticipant) {
        result.asParticipant.push({
          id: docSnap.id,
          name: data.name,
          status: data.status
        });
      }
    });

    console.log(`✅ Found dependencies for user ${userId}:`, {
      owner: result.asOwner.length,
      collaborator: result.asCollaborator.length,
      participant: result.asParticipant.length
    });

    return result;
  } catch (error) {
    console.error('❌ Error getting user tournament dependencies:', error);
    return result;
  }
}

// ============================================================================
// TRANSFORM IMPORTED → LIVE
// ============================================================================

interface TransformMatchRound {
  pointsA: number;
  pointsB: number;
  twentiesA: number;
  twentiesB: number;
}

interface TransformMatch {
  participantAName: string;
  participantBName: string;
  scoreA: number;
  scoreB: number;
  rounds: TransformMatchRound[];
}

interface TransformBracketRound {
  name: string;
  matches: TransformMatch[];
}

interface TransformBracket {
  name: string;
  label: string;
  sourcePositions: number[];
  rounds: TransformBracketRound[];
}

type TransformPhaseConfig = { gameMode: 'points' | 'rounds'; pointsToWin?: number; roundsToPlay?: number; matchesToWin: number };
type TransformBracketConfig = { earlyRounds: TransformPhaseConfig; semifinal: TransformPhaseConfig; final: TransformPhaseConfig };

interface TransformConfig {
  groupStageType: 'ROUND_ROBIN' | 'SWISS';
  numGroups?: number;
  numSwissRounds?: number;
  groupQualificationMode: 'WINS' | 'POINTS';
  groupMatchConfig: TransformPhaseConfig;
  finalStageMode: 'SINGLE_BRACKET' | 'SPLIT_DIVISIONS' | 'PARALLEL_BRACKETS';
  thirdPlaceMatchEnabled: boolean;
  consolationEnabled: boolean;
  bracketConfig: TransformBracketConfig;
  silverBracketConfig?: TransformBracketConfig;
}

/**
 * Transform an IMPORTED tournament to have LIVE-like structure
 * Adds group/match config and optional round-level data to brackets.
 * The tournament remains isImported:true and COMPLETED, with enrichedAt timestamp.
 */
export async function transformImportedToLive(
  tournamentId: string,
  config: TransformConfig,
  knockoutBrackets: TransformBracket[]
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  try {
    // Get existing tournament
    const tournament = await getTournament(tournamentId);
    if (!tournament) {
      console.error('Tournament not found:', tournamentId);
      return false;
    }

    // Build name → participant ID map. Doubles results may reference the team
    // by "Player1 / Player2" or by its artistic team name, so both must resolve.
    const participantMap = new Map<string, string>();
    for (const p of tournament.participants || []) {
      participantMap.set(p.name.toLowerCase().trim(), p.id);
      if (p.partner?.name) {
        participantMap.set(p.partner.name.toLowerCase().trim(), p.id);
        participantMap.set(`${p.name} / ${p.partner.name}`.toLowerCase().trim(), p.id);
      }
      if (p.teamName) {
        participantMap.set(p.teamName.toLowerCase().trim(), p.id);
      }
    }

    const unknownParticipants = new Set<string>();
    const findParticipantId = (name: string): string => {
      const foundId = participantMap.get(name.toLowerCase().trim());
      if (!foundId) {
        unknownParticipants.add(name);
        return `unknown-${name}`;
      }
      return foundId;
    };

    // Update groupStage config fields
    let updatedGroupStage = tournament.groupStage;
    if (updatedGroupStage) {
      updatedGroupStage = {
        ...updatedGroupStage,
        type: config.groupStageType,
        qualificationMode: config.groupQualificationMode,
        gameMode: config.groupMatchConfig.gameMode,
        ...(config.groupMatchConfig.pointsToWin !== undefined ? { pointsToWin: config.groupMatchConfig.pointsToWin } : {}),
        ...(config.groupMatchConfig.roundsToPlay !== undefined ? { roundsToPlay: config.groupMatchConfig.roundsToPlay } : {}),
        matchesToWin: config.groupMatchConfig.matchesToWin,
        ...(config.groupStageType === 'ROUND_ROBIN' && config.numGroups !== undefined ? { numGroups: config.numGroups } : {}),
        ...(config.groupStageType === 'SWISS' && config.numSwissRounds !== undefined ? { numSwissRounds: config.numSwissRounds } : {})
      };
    }

    // Helper: build a BracketWithConfig from a TransformBracket using the given bracket config
    const buildBracket = (bracketInput: TransformBracket, bracketCfg: TransformBracketConfig = config.bracketConfig) => {
      const rounds = bracketInput.rounds.map((r, rIndex) => {
        const matches: BracketMatch[] = r.matches.map((m, mIndex) => {
          // BYE can appear on EITHER side; never run "BYE" through the
          // participant lookup (it used to persist participantA: "unknown-BYE").
          const aIsBye = m.participantAName.toUpperCase() === 'BYE';
          const bIsBye = m.participantBName.toUpperCase() === 'BYE';
          const isBye = aIsBye || bIsBye;
          const participantA = aIsBye ? '' : findParticipantId(m.participantAName);
          const participantB = bIsBye ? '' : findParticipantId(m.participantBName);
          // A tied score between two real players has no winner (the old
          // `scoreA > scoreB ? A : B` silently crowned B on ties).
          const winner = isBye
            ? (aIsBye ? participantB : participantA)
            : (m.scoreA > m.scoreB ? participantA : (m.scoreB > m.scoreA ? participantB : undefined));

          const total20sA = m.rounds.length > 0 ? m.rounds.reduce((s, rr) => s + rr.twentiesA, 0) : 0;
          const total20sB = m.rounds.length > 0 ? m.rounds.reduce((s, rr) => s + rr.twentiesB, 0) : 0;

          const bracketMatch: BracketMatch = {
            id: `match-${rIndex}-${mIndex}-${Date.now()}`,
            position: mIndex,
            participantA,
            ...(participantB ? { participantB } : {}),
            status: isBye ? 'WALKOVER' : 'COMPLETED',
            ...(winner ? { winner } : {}),
            totalPointsA: m.scoreA,
            totalPointsB: m.scoreB,
            total20sA,
            total20sB,
            completedAt: tournament.tournamentDate
          };

          if (m.rounds.length > 0) {
            bracketMatch.rounds = m.rounds.map((rr, rrIdx) => ({
              gameNumber: 1,
              roundInGame: rrIdx + 1,
              pointsA: rr.pointsA,
              pointsB: rr.pointsB,
              twentiesA: rr.twentiesA,
              twentiesB: rr.twentiesB,
              hammer: null
            }));
          }

          return bracketMatch;
        });

        return { roundNumber: rIndex + 1, name: r.name, matches };
      });

      return {
        rounds,
        totalRounds: rounds.length,
        config: bracketCfg
      };
    };

    // Build finalStage from knockoutBrackets
    let finalStage = tournament.finalStage;
    if (knockoutBrackets.length > 0) {
      if (config.finalStageMode === 'SPLIT_DIVISIONS' && knockoutBrackets.length >= 2) {
        const goldBracket = buildBracket(knockoutBrackets[0], config.bracketConfig);
        const silverBracket = buildBracket(knockoutBrackets[1], config.silverBracketConfig ?? config.bracketConfig);
        const goldWinner = goldBracket.rounds[goldBracket.rounds.length - 1]?.matches[0]?.winner;
        const silverWinner = silverBracket.rounds[silverBracket.rounds.length - 1]?.matches[0]?.winner;
        finalStage = {
          mode: 'SPLIT_DIVISIONS',
          goldBracket,
          silverBracket,
          thirdPlaceMatchEnabled: config.thirdPlaceMatchEnabled,
          consolationEnabled: config.consolationEnabled,
          isComplete: true,
          ...(goldWinner ? { winner: goldWinner } : {}),
          ...(silverWinner ? { silverWinner } : {})
        };
      } else if (knockoutBrackets.length === 1) {
        const bracket = buildBracket(knockoutBrackets[0], config.bracketConfig);
        const bracketWinner = bracket.rounds[bracket.rounds.length - 1]?.matches[0]?.winner;
        finalStage = {
          mode: 'SINGLE_BRACKET',
          goldBracket: bracket,
          thirdPlaceMatchEnabled: config.thirdPlaceMatchEnabled,
          consolationEnabled: config.consolationEnabled,
          isComplete: true,
          ...(bracketWinner ? { winner: bracketWinner } : {})
        };
      } else {
        // Multiple brackets (PARALLEL_BRACKETS)
        const parallelBrackets = knockoutBrackets.map((b) => {
          const bracket = buildBracket(b, config.bracketConfig);
          const bracketWinner = bracket.rounds[bracket.rounds.length - 1]?.matches[0]?.winner;
          return {
            id: `bracket-${b.label.toLowerCase()}`,
            name: b.name,
            label: b.label,
            bracket,
            sourcePositions: b.sourcePositions,
            ...(bracketWinner ? { winner: bracketWinner } : {})
          };
        });
        const firstWinner = parallelBrackets[0]?.winner;
        finalStage = {
          mode: 'PARALLEL_BRACKETS',
          goldBracket: parallelBrackets[0]?.bracket || tournament.finalStage?.goldBracket,
          parallelBrackets,
          thirdPlaceMatchEnabled: config.thirdPlaceMatchEnabled,
          consolationEnabled: config.consolationEnabled,
          isComplete: true,
          ...(firstWinner ? { winner: firstWinner } : {})
        };
      }
    }

    if (unknownParticipants.size > 0) {
      // Abort instead of persisting `unknown-<name>` participant IDs (same
      // rationale as createHistoricalTournament): those matches can't be
      // resolved by any view and silently corrupt the bracket.
      console.error(
        `❌ Transform aborted — ${unknownParticipants.size} name(s) in the knockout data don't match any participant: ${[...unknownParticipants].join(', ')}`
      );
      return false;
    }

    // Build the updates
    const updates: Partial<Tournament> = {
      enrichedAt: Date.now(),
      isImported: true
    };

    if (updatedGroupStage) {
      updates.groupStage = updatedGroupStage;
    }
    if (finalStage) {
      updates.finalStage = finalStage;
    }

    const success = await updateTournament(tournamentId, updates);
    if (success) {
      console.log('✅ Tournament transformed to LIVE:', tournamentId);
    }
    return success;
  } catch (error) {
    console.error('❌ Error transforming tournament to LIVE:', error);
    return false;
  }
}
