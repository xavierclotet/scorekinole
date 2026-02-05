/**
 * Firebase functions for tournament management
 * CRUD operations and tournament lifecycle management
 */

import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { isAdmin, isSuperAdmin } from './admin';
import type { Tournament, TournamentStatus } from '$lib/types/tournament';
import { getUserProfile, type UserProfile } from './userProfile';
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
 * @returns Object with quota info: canCreate, used, limit, isSuperAdmin
 */
export async function checkTournamentQuota(): Promise<{
  canCreate: boolean;
  used: number;
  limit: number;
  isSuperAdmin: boolean;
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
    const maxTournaments = profile?.maxTournamentsPerYear ?? 0;

    // If max is 0, user cannot create tournaments
    if (maxTournaments === 0) {
      return { canCreate: false, used: 0, limit: 0, isSuperAdmin: false };
    }

    const currentYear = new Date().getFullYear();
    const usedCount = await getUserTournamentCountForYear(user.id, currentYear);

    return {
      canCreate: usedCount < maxTournaments,
      used: usedCount,
      limit: maxTournaments,
      isSuperAdmin: false
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
      updatedAt: Date.now()
    };

    // Add optional fields only if they exist in the data object
    if ('description' in data && data.description) tournament.description = data.description;
    if ('tournamentDate' in data && data.tournamentDate) tournament.tournamentDate = data.tournamentDate;

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
    let q;

    if (superAdminStatus) {
      // SuperAdmin: see all tournaments
      q = query(tournamentsRef, orderBy('createdAt', 'desc'), limit(limitCount));
      if (statusFilter) {
        q = query(
          tournamentsRef,
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      }
    } else {
      // Admin: only see own tournaments
      if (statusFilter) {
        q = query(
          tournamentsRef,
          where('createdBy.userId', '==', user.id),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      } else {
        q = query(
          tournamentsRef,
          where('createdBy.userId', '==', user.id),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      }
    }

    const snapshot = await getDocs(q);

    const tournaments: Tournament[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      tournaments.push({
        ...data,
        createdAt:
          data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
        startedAt:
          data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
        completedAt:
          data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
      } as Tournament);
    });

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

    // Get total count (filtered for non-superadmins)
    let countQuery;
    if (superAdminStatus) {
      countQuery = tournamentsRef;
    } else {
      countQuery = query(tournamentsRef, where('createdBy.userId', '==', user.id));
    }
    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;

    // Build paginated query (filtered for non-superadmins)
    let q;
    if (superAdminStatus) {
      // SuperAdmin: see all tournaments
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
    } else {
      // Admin: only see own tournaments
      // Note: This query requires a composite index on createdBy.userId + createdAt
      // If the index doesn't exist, Firestore will show a link in the console to create it
      if (lastDocument) {
        q = query(
          tournamentsRef,
          where('createdBy.userId', '==', user.id),
          orderBy('createdAt', 'desc'),
          startAfter(lastDocument),
          limit(pageSize)
        );
      } else {
        q = query(
          tournamentsRef,
          where('createdBy.userId', '==', user.id),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
      }
    }

    const snapshot = await getDocs(q);

    const tournaments: Tournament[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      tournaments.push({
        ...data,
        createdAt:
          data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
        startedAt:
          data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
        completedAt:
          data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
      } as Tournament);
    });

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    const hasMore = snapshot.docs.length === pageSize;

    console.log(`✅ Retrieved ${tournaments.length} tournaments (page), total: ${totalCount}`);
    return {
      tournaments,
      totalCount,
      lastDoc,
      hasMore
    };
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

    // Check ownership for non-superadmins
    const superAdminStatus = await isSuperAdmin();
    if (!superAdminStatus) {
      const snapshot = await getDoc(tournamentRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.createdBy?.userId !== user.id) {
          console.error('Unauthorized: Admin can only edit own tournaments');
          return false;
        }
      }
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
    // Check ownership for non-superadmins
    const superAdminStatus = await isSuperAdmin();
    if (!superAdminStatus) {
      const tournamentRef = doc(db!, 'tournaments', id);
      const snapshot = await getDoc(tournamentRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.createdBy?.userId !== user.id) {
          console.error('Unauthorized: Admin can only delete own tournaments');
          return false;
        }
      }
    }

    // First, revert ranking changes for all participants
    const { revertTournamentRanking } = await import('./tournamentRanking');
    const rankingReverted = await revertTournamentRanking(id);

    if (!rankingReverted) {
      console.warn('⚠️ Failed to revert ranking, but continuing with deletion');
    }

    // Then delete the tournament document
    const tournamentRef = doc(db!, 'tournaments', id);
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
    const namesMap = new Map<string, { maxEdition: number; description?: string; country?: string; city?: string; address?: string }>();
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
