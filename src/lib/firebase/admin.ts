import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { getUserProfile, type UserProfile } from './userProfile';
import type { MatchHistory } from '$lib/types/history';
import {
  collection,
  getDocs,
  getDoc,
  getCountFromServer,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Extended user info for admin panel
 */
export interface AdminUserInfo extends UserProfile {
  userId: string;
  lastLoginAt?: any;
  matchCount?: number;
  tournamentsCreatedCount?: number;
}

/**
 * Paginated result for users
 */
export interface PaginatedUsersResult {
  users: AdminUserInfo[];
  totalCount: number;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Check if current user is admin
 */
export async function isAdmin(): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    return false;
  }

  // Check if user has admin role in Firestore
  try {
    const profile = await getUserProfile();
    return profile?.isAdmin === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Check if current user is super admin
 */
export async function isSuperAdmin(): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    return false;
  }

  // Check if user has superAdmin role in Firestore
  try {
    const profile = await getUserProfile();
    return profile?.isSuperAdmin === true;
  } catch (error) {
    console.error('Error checking super admin status:', error);
    return false;
  }
}

/**
 * Get all users (admin only) - legacy function for compatibility
 */
export async function getAllUsers(): Promise<AdminUserInfo[]> {
  const result = await getUsersPaginated(1000); // Get up to 1000 users
  return result.users;
}

/**
 * Get users with pagination (admin only)
 */
export async function getUsersPaginated(
  pageSize: number = 10,
  lastDocument: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<PaginatedUsersResult> {
  const emptyResult: PaginatedUsersResult = {
    users: [],
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

  try {
    const usersRef = collection(db!, 'users');

    // Get total count
    const countSnapshot = await getCountFromServer(usersRef);
    const totalCount = countSnapshot.data().count;

    // Build paginated query
    let q;
    if (lastDocument) {
      q = query(
        usersRef,
        orderBy('createdAt', 'desc'),
        startAfter(lastDocument),
        limit(pageSize)
      );
    } else {
      q = query(usersRef, orderBy('createdAt', 'desc'), limit(pageSize));
    }

    const snapshot = await getDocs(q);

    const users: AdminUserInfo[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      users.push({
        userId: docSnap.id,
        ...data
      });
    });

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    const hasMore = snapshot.docs.length === pageSize;

    console.log(`✅ Retrieved ${users.length} users (page), total: ${totalCount}`);
    return {
      users,
      totalCount,
      lastDoc,
      hasMore
    };
  } catch (error) {
    console.error('❌ Error getting users:', error);
    return emptyResult;
  }
}

/**
 * Delete user permanently (admin only)
 */
export async function deleteUser(userId: string): Promise<boolean> {
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
    const userRef = doc(db!, 'users', userId);
    await deleteDoc(userRef);

    console.log('✅ User permanently deleted:', userId);
    return true;
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    return false;
  }
}

/**
 * Update user profile (admin only)
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>
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
    const userRef = doc(db!, 'users', userId);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });

    console.log('✅ User profile updated:', userId);
    return true;
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    return false;
  }
}

/**
 * Toggle admin status for a user (admin only)
 */
export async function toggleAdminStatus(
  userId: string,
  isAdminStatus: boolean
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
  const adminCheck = await isAdmin();
  if (!adminCheck) {
    console.error('Unauthorized: User is not admin');
    return false;
  }

  try {
    const userRef = doc(db!, 'users', userId);
    await updateDoc(userRef, {
      isAdmin: isAdminStatus,
      updatedAt: serverTimestamp()
    });

    console.log(`✅ Admin status ${isAdminStatus ? 'granted' : 'revoked'} for user:`, userId);
    return true;
  } catch (error) {
    console.error('❌ Error toggling admin status:', error);
    return false;
  }
}

/**
 * Get match count for a specific user
 */
export async function getUserMatchCount(userId: string): Promise<number> {
  if (!browser || !isFirebaseEnabled()) {
    return 0;
  }

  try {
    const matchesRef = collection(db!, 'matches');
    let count = 0;

    // Query matches where user is in team1
    const q1 = query(matchesRef, where('players.team1.userId', '==', userId));
    const snapshot1 = await getDocs(q1);
    count += snapshot1.size;

    // Query matches where user is in team2
    const q2 = query(matchesRef, where('players.team2.userId', '==', userId));
    const snapshot2 = await getDocs(q2);
    count += snapshot2.size;

    return count;
  } catch (error) {
    console.error('❌ Error getting user match count:', error);
    return 0;
  }
}

/**
 * Get tournament count created by a specific user
 */
export async function getUserTournamentCount(userId: string): Promise<number> {
  if (!browser || !isFirebaseEnabled()) {
    return 0;
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');
    const q = query(tournamentsRef, where('createdBy.userId', '==', userId));
    const countSnapshot = await getCountFromServer(q);
    return countSnapshot.data().count;
  } catch (error) {
    console.error('❌ Error getting user tournament count:', error);
    return 0;
  }
}

/**
 * Get tournament counts for multiple users (batch)
 */
export async function getUsersTournamentCounts(userIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (!browser || !isFirebaseEnabled() || userIds.length === 0) {
    return counts;
  }

  try {
    // Fetch counts in parallel for all users
    const promises = userIds.map(async (userId) => {
      const count = await getUserTournamentCount(userId);
      return { userId, count };
    });

    const results = await Promise.all(promises);
    results.forEach(({ userId, count }) => {
      counts.set(userId, count);
    });

    return counts;
  } catch (error) {
    console.error('❌ Error getting tournament counts:', error);
    return counts;
  }
}

/**
 * Paginated result for matches
 */
export interface PaginatedMatchesResult {
  matches: MatchHistory[];
  totalCount: number;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Get all matches (admin only) - legacy function for compatibility
 */
export async function getAllMatches(limitCount: number = 100): Promise<MatchHistory[]> {
  const result = await getMatchesPaginated(limitCount);
  return result.matches;
}

/**
 * Get matches with pagination (admin only)
 */
export async function getMatchesPaginated(
  pageSize: number = 15,
  lastDocument: QueryDocumentSnapshot<DocumentData> | null = null
): Promise<PaginatedMatchesResult> {
  const emptyResult: PaginatedMatchesResult = {
    matches: [],
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

  try {
    const matchesRef = collection(db!, 'matches');

    // Get total count
    const countSnapshot = await getCountFromServer(matchesRef);
    const totalCount = countSnapshot.data().count;

    // Build paginated query
    let q;
    if (lastDocument) {
      q = query(
        matchesRef,
        orderBy('startTime', 'desc'),
        startAfter(lastDocument),
        limit(pageSize)
      );
    } else {
      q = query(matchesRef, orderBy('startTime', 'desc'), limit(pageSize));
    }

    const snapshot = await getDocs(q);

    const matches: MatchHistory[] = [];
    snapshot.forEach((docSnap) => {
      matches.push({
        id: docSnap.id,
        ...docSnap.data()
      } as MatchHistory);
    });

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    const hasMore = snapshot.docs.length === pageSize;

    console.log(`✅ Retrieved ${matches.length} matches (page), total: ${totalCount}`);
    return {
      matches,
      totalCount,
      lastDoc,
      hasMore
    };
  } catch (error) {
    console.error('❌ Error getting matches:', error);
    return emptyResult;
  }
}

/**
 * Update match (admin only)
 */
export async function updateMatch(
  matchId: string,
  updates: Partial<MatchHistory>
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
    const matchRef = doc(db!, 'matches', matchId);
    await updateDoc(matchRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });

    console.log('✅ Match updated:', matchId);
    return true;
  } catch (error) {
    console.error('❌ Error updating match:', error);
    return false;
  }
}

/**
 * Delete match permanently (admin only)
 */
export async function adminDeleteMatch(matchId: string): Promise<boolean> {
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
    const matchRef = doc(db!, 'matches', matchId);
    await deleteDoc(matchRef);

    console.log('✅ Match permanently deleted:', matchId);
    return true;
  } catch (error) {
    console.error('❌ Error deleting match:', error);
    return false;
  }
}

/**
 * Merge a GUEST user into a registered user
 * Copies tournaments and ranking from GUEST to registered user
 * Marks GUEST with mergedTo field (does not delete)
 */
export async function mergeGuestToRegistered(
  guestUserId: string,
  registeredUserId: string
): Promise<{ success: boolean; error?: string }> {
  if (!browser || !isFirebaseEnabled()) {
    return { success: false, error: 'Firebase disabled' };
  }

  const user = get(currentUser);
  if (!user) {
    return { success: false, error: 'No user authenticated' };
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    return { success: false, error: 'Unauthorized: User is not admin' };
  }

  try {
    // Get both user profiles
    const guestRef = doc(db!, 'users', guestUserId);
    const registeredRef = doc(db!, 'users', registeredUserId);

    const [guestSnap, registeredSnap] = await Promise.all([
      getDoc(guestRef),
      getDoc(registeredRef)
    ]);

    if (!guestSnap.exists()) {
      return { success: false, error: 'GUEST user not found' };
    }
    if (!registeredSnap.exists()) {
      return { success: false, error: 'Registered user not found' };
    }

    const guestData = guestSnap.data() as UserProfile;
    const registeredData = registeredSnap.data() as UserProfile;

    // Validate GUEST is actually a guest
    if (guestData.authProvider === 'google') {
      return { success: false, error: 'Source user is not a GUEST (has Google auth)' };
    }

    // Validate registered user has Google auth
    if (registeredData.authProvider !== 'google') {
      return { success: false, error: 'Target user is not registered (no Google auth)' };
    }

    // Check if GUEST was already merged
    if (guestData.mergedTo) {
      return { success: false, error: 'GUEST user was already merged' };
    }

    // Check if registered user already has tournaments (ranking is calculated from tournaments)
    const registeredTournaments = registeredData.tournaments || [];
    if (registeredTournaments.length > 0) {
      return { success: false, error: 'Target user already has tournaments' };
    }

    // Copy tournaments from GUEST (target is empty, no deduplication needed)
    const guestTournaments = guestData.tournaments || [];

    // Merge mergedFrom arrays
    const existingMergedFrom = registeredData.mergedFrom || [];
    const newMergedFrom = [...existingMergedFrom, guestUserId];

    // Update registered user (ranking is calculated from tournaments, not stored)
    await setDoc(registeredRef, {
      tournaments: guestTournaments,
      mergedFrom: newMergedFrom,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Mark GUEST as merged
    await setDoc(guestRef, {
      mergedTo: registeredUserId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`✅ Merged GUEST ${guestUserId} into registered user ${registeredUserId}`);
    console.log(`   - Tournaments: ${guestTournaments.length}`);

    return { success: true };
  } catch (error) {
    console.error('❌ Error merging users:', error);
    return { success: false, error: 'Error during merge operation' };
  }
}

/**
 * Get registered users for merge target selection
 * Returns users with Google auth (not GUESTs)
 */
export async function getRegisteredUsers(): Promise<AdminUserInfo[]> {
  if (!browser || !isFirebaseEnabled()) {
    return [];
  }

  const user = get(currentUser);
  if (!user) {
    return [];
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    return [];
  }

  try {
    const usersRef = collection(db!, 'users');
    const q = query(usersRef, where('authProvider', '==', 'google'), orderBy('playerName'));
    const snapshot = await getDocs(q);

    const users: AdminUserInfo[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      // Skip merged users (defensive - registered users shouldn't have mergedTo)
      if (data.mergedTo) return;
      // Skip users that already have tournaments (can't be migration targets)
      if (data.tournaments && data.tournaments.length > 0) return;
      users.push({
        userId: docSnap.id,
        ...data
      });
    });

    return users;
  } catch (error) {
    console.error('❌ Error getting registered users:', error);
    return [];
  }
}
