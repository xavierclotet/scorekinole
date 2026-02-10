/**
 * Firebase functions for tournament management
 * CRUD operations and tournament lifecycle management
 */

import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { isAdmin, isSuperAdmin } from './admin';
import type { Tournament, TournamentStatus, TournamentParticipant } from '$lib/types/tournament';
import { getUserProfile, type UserProfile } from './userProfile';
import { getQuotaForYear, getQuotaEntryForYear, type QuotaEntry } from '$lib/types/quota';
import {
  collection,
  doc,
  getDoc,
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
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Recursively remove undefined values from an object
 * Firestore doesn't accept undefined values
 */
function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as T;
  }

  if (typeof obj === 'object') {
    const cleaned: any = {};
    Object.entries(obj).forEach(([key, value]) => {
      if (value !== undefined) {
        cleaned[key] = cleanUndefined(value);
      }
    });
    return cleaned as T;
  }

  return obj;
}

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
    const currentYear = new Date().getFullYear();

    // 1. Try new quota system first (quotaEntries array)
    let maxTournaments = getQuotaForYear(profile?.quotaEntries, currentYear);
    const quotaEntry = getQuotaEntryForYear(profile?.quotaEntries, currentYear);

    // 2. Fallback to old system for backward compatibility
    if (maxTournaments === 0 && profile?.maxTournamentsPerYear) {
      maxTournaments = profile.maxTournamentsPerYear;
    }

    // If max is 0, user cannot create tournaments
    if (maxTournaments === 0) {
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
        tier: 'CLUB'
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
    if ('tournamentDate' in data && data.tournamentDate) tournament.tournamentDate = data.tournamentDate;
    if ('address' in data && data.address) tournament.address = data.address;
    if ('externalLink' in data && data.externalLink) tournament.externalLink = data.externalLink;
    if ('posterUrl' in data && data.posterUrl) tournament.posterUrl = data.posterUrl;
    if ('timeConfig' in data && data.timeConfig) tournament.timeConfig = data.timeConfig;

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
 * Get tournament by ID
 *
 * @param id Tournament ID
 * @returns Tournament or null
 */
export async function getTournament(id: string): Promise<Tournament | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', id);
    const snapshot = await getDoc(tournamentRef);

    if (!snapshot.exists()) {
      console.warn('Tournament not found:', id);
      return null;
    }

    const data = snapshot.data();

    // Note: getTournament is used for public viewing - no permission check needed
    // Edit permissions are handled separately in the UI (canEdit flag)

    // Convert Firestore timestamps to numbers
    const tournament: Tournament = {
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
      startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
      completedAt:
        data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
    } as Tournament;

    return tournament;
  } catch (error) {
    console.error('❌ Error getting tournament:', error);
    return null;
  }
}

/**
 * Get all tournaments (admin only)
 *
 * @param limitCount Maximum number of tournaments to return
 * @param statusFilter Optional status filter
 * @returns Array of tournaments
 */
export async function getAllTournaments(
  limitCount: number = 100,
  statusFilter?: TournamentStatus
): Promise<Tournament[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return [];
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return [];
  }

  // Check if user is superadmin (can see all tournaments)
  const superAdminStatus = await isSuperAdmin();

  try {
    const tournamentsRef = collection(db!, 'tournaments');
    const tournamentsMap = new Map<string, Tournament>();

    // Helper to convert Firestore doc to Tournament
    const docToTournament = (data: DocumentData): Tournament => ({
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
      startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
      completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
    } as Tournament);

    if (superAdminStatus) {
      // SuperAdmin: see all tournaments
      let q;
      if (statusFilter) {
        q = query(
          tournamentsRef,
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      } else {
        q = query(tournamentsRef, orderBy('createdAt', 'desc'), limit(limitCount));
      }

      const snapshot = await getDocs(q);
      snapshot.forEach(docSnap => {
        tournamentsMap.set(docSnap.id, docToTournament(docSnap.data()));
      });
    } else {
      // Admin: see own tournaments + tournaments where they're in adminIds
      // Query 1: Tournaments owned by user (ownerId or createdBy.userId)
      let ownedQuery;
      if (statusFilter) {
        ownedQuery = query(
          tournamentsRef,
          where('ownerId', '==', user.id),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      } else {
        ownedQuery = query(
          tournamentsRef,
          where('ownerId', '==', user.id),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      }

      // Query 2: Tournaments where user is in adminIds
      let collaboratorQuery;
      if (statusFilter) {
        collaboratorQuery = query(
          tournamentsRef,
          where('adminIds', 'array-contains', user.id),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      } else {
        collaboratorQuery = query(
          tournamentsRef,
          where('adminIds', 'array-contains', user.id),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      }

      // Query 3: Legacy tournaments (createdBy.userId but no ownerId set)
      let legacyQuery;
      if (statusFilter) {
        legacyQuery = query(
          tournamentsRef,
          where('createdBy.userId', '==', user.id),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      } else {
        legacyQuery = query(
          tournamentsRef,
          where('createdBy.userId', '==', user.id),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      }

      // Execute all queries in parallel
      const [ownedSnapshot, collaboratorSnapshot, legacySnapshot] = await Promise.all([
        getDocs(ownedQuery),
        getDocs(collaboratorQuery),
        getDocs(legacyQuery)
      ]);

      // Combine results (Map deduplicates by ID)
      ownedSnapshot.forEach(docSnap => {
        tournamentsMap.set(docSnap.id, docToTournament(docSnap.data()));
      });
      collaboratorSnapshot.forEach(docSnap => {
        tournamentsMap.set(docSnap.id, docToTournament(docSnap.data()));
      });
      legacySnapshot.forEach(docSnap => {
        tournamentsMap.set(docSnap.id, docToTournament(docSnap.data()));
      });
    }

    // Convert to array and sort by createdAt desc
    const tournaments = Array.from(tournamentsMap.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limitCount);

    console.log(`✅ Retrieved ${tournaments.length} tournaments`);
    return tournaments;
  } catch (error) {
    console.error('❌ Error getting all tournaments:', error);
    return [];
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

    // Check permission using canManageTournament
    const snapshot = await getDoc(tournamentRef);
    if (!snapshot.exists()) {
      console.error('Tournament not found:', id);
      return false;
    }

    const tournamentData = snapshot.data();
    const hasPermission = await canManageTournament(tournamentData, user.id);
    if (!hasPermission) {
      console.error('Unauthorized: User cannot edit this tournament');
      return false;
    }

    // Recursively remove undefined values from updates
    const cleanUpdates = cleanUndefined(updates);

    await updateDoc(tournamentRef, {
      ...cleanUpdates,
      updatedAt: serverTimestamp()
    });

    console.log('✅ Tournament updated:', id);
    return true;
  } catch (error) {
    console.error('❌ Error updating tournament:', error);
    return false;
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

    await updateDoc(tournamentRef, {
      ...cleanUpdates,
      updatedAt: serverTimestamp()
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
export async function getTournamentByKey(key: string): Promise<Tournament | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  if (!key || key.length !== 6) {
    console.warn('Invalid tournament key:', key);
    return null;
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

    // Convert Firestore timestamps to numbers
    const tournament: Tournament = {
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
      startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
      completedAt:
        data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
    } as Tournament;

    console.log('✅ Tournament found by key:', tournament.name);
    return tournament;
  } catch (error) {
    console.error('❌ Error getting tournament by key:', error);
    return null;
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
    const queryLower = searchQuery.toLowerCase();

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as UserProfile;

      // Skip merged users (they've been migrated to another account)
      if (data.mergedTo) {
        return;
      }

      const nameMatch = data.playerName?.toLowerCase().includes(queryLower);
      const emailMatch = data.email?.toLowerCase().includes(queryLower);

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
        const tournament: Tournament = {
          ...data,
          id: docSnap.id,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
          startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
          completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
        } as Tournament;
        callback(tournament);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('❌ Error in tournament subscription:', error);
      callback(null);
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
