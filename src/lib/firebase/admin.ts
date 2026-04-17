import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { getUserProfile, type UserProfile } from './userProfile';
import type { MatchHistory } from '$lib/types/history';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
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
  arrayRemove,
  runTransaction,
  writeBatch,
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
 * Fetch all users for search (admin only)
 * Returns all users in the collection without pagination limits
 */
export async function fetchAllUsers(): Promise<AdminUserInfo[]> {
  if (!browser || !isFirebaseEnabled()) return [];

  const user = get(currentUser);
  if (!user) return [];

  const adminStatus = await isAdmin();
  if (!adminStatus) return [];

  try {
    const usersRef = collection(db!, 'users');
    // Don't use orderBy('createdAt') — Firestore excludes documents
    // that don't have the ordered field. Users created by addTournamentRecord
    // may lack createdAt.
    const snapshot = await getDocs(usersRef);

    const users: AdminUserInfo[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      users.push({ userId: docSnap.id, ...data });
    });

    // Sort client-side (createdAt desc, users without createdAt at the end)
    users.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? a.createdAt ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? b.createdAt ?? 0;
      return bTime - aTime;
    });

    console.log(`✅ Fetched all ${users.length} users for search`);
    return users;
  } catch (error) {
    console.error('❌ Error fetching all users:', error);
    return [];
  }
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
 * Disable a user account (admin only).
 * Calls the disableUser Cloud Function which disables Firebase Auth + marks Firestore.
 */
export async function disableUser(userId: string): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  // Check super admin permission (fast-fail before calling Cloud Function)
  const superAdminStatus = await isSuperAdmin();
  if (!superAdminStatus) {
    console.error('Unauthorized: User is not super admin');
    return false;
  }

  try {
    const functions = getFunctions(getApp(), 'europe-west1');
    const fn = httpsCallable(functions, 'disableUser');
    await fn({ userId });
    console.log('✅ User disabled:', userId);
    return true;
  } catch (error) {
    console.error('❌ Error disabling user:', error);
    return false;
  }
}

/**
 * Re-enable a previously disabled user account (admin only).
 */
export async function enableUser(userId: string): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  // Check super admin permission (fast-fail before calling Cloud Function)
  const superAdminStatus = await isSuperAdmin();
  if (!superAdminStatus) {
    console.error('Unauthorized: User is not super admin');
    return false;
  }

  try {
    const functions = getFunctions(getApp(), 'europe-west1');
    const fn = httpsCallable(functions, 'enableUser');
    await fn({ userId });
    console.log('✅ User re-enabled:', userId);
    return true;
  } catch (error) {
    console.error('❌ Error enabling user:', error);
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
 * Toggle admin status for a user (super-admin only).
 * Granting/revoking isAdmin is a privilege-escalation action and is gated on
 * super-admin both here and in firestore.rules.
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

  // Super-admin gate: regular admins cannot promote/demote other admins
  const superAdminCheck = await isSuperAdmin();
  if (!superAdminCheck) {
    console.error('Unauthorized: super-admin required to toggle admin status');
    return false;
  }

  try {
    const userRef = doc(db!, 'users', userId);
    const updates: Record<string, any> = {
      isAdmin: isAdminStatus,
      updatedAt: serverTimestamp()
    };

    // When revoking admin, also clear associated permissions and quota
    if (!isAdminStatus) {
      updates.canAutofill = false;
      updates.canImportTournaments = false;
      updates.quotaEntries = [];
    }

    await updateDoc(userRef, updates);

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
 * Merge two user profiles (universal — works for any combination of guest/registered).
 *
 * Steps:
 * 1. Validate both users exist, aren't the same, source not already merged
 * 2. Merge tournaments[] (deduplicate by tournamentId, keep target's version on conflict)
 * 3. Update tournament documents: replace source userId in participant.userId / partner.userId
 * 4. Mark source as mergedTo, target gets mergedFrom
 *
 * @param sourceUserId User to merge FROM (will be marked as merged)
 * @param targetUserId User to merge INTO (will receive tournaments)
 */
/** Maximum number of tournament documents updated per merge to prevent unbounded writes */
const MAX_TOURNAMENTS_PER_MERGE = 50;

export async function mergeUsers(
  sourceUserId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string; tournamentsUpdated?: number }> {
  if (!browser || !isFirebaseEnabled()) {
    return { success: false, error: 'Firebase disabled' };
  }

  const user = get(currentUser);
  if (!user) {
    return { success: false, error: 'No user authenticated' };
  }

  const adminStatus = await isAdmin();
  if (!adminStatus) {
    return { success: false, error: 'Unauthorized: User is not admin' };
  }

  if (sourceUserId === targetUserId) {
    return { success: false, error: 'Cannot merge a user with themselves (same userId)' };
  }

  const sourceRef = doc(db!, 'users', sourceUserId);
  const targetRef = doc(db!, 'users', targetUserId);

  let sourceData: UserProfile;
  let targetData: UserProfile;
  let mergedTournaments: UserProfile['tournaments'];

  // 1. Atomically read both profiles and write the merge markers.
  //    runTransaction ensures the double-merge check + writes are atomic —
  //    a concurrent merge of the same source user will lose the transaction
  //    and get a "Source user was already merged" error instead of corrupting data.
  try {
    await runTransaction(db!, async (tx) => {
      const sourceSnap = await tx.get(sourceRef);
      const targetSnap = await tx.get(targetRef);

      if (!sourceSnap.exists()) throw new Error('source_not_found');
      if (!targetSnap.exists()) throw new Error('target_not_found');

      sourceData = sourceSnap.data() as UserProfile;
      targetData = targetSnap.data() as UserProfile;

      if (sourceData.mergedTo) throw new Error('already_merged');

      // Merge tournaments (deduplicate by tournamentId — target wins on conflict)
      const sourceTournaments = sourceData.tournaments || [];
      const targetTournaments = targetData.tournaments || [];
      const targetTournamentIds = new Set(targetTournaments.map(t => t.tournamentId));
      const newTournaments = sourceTournaments.filter(t => !targetTournamentIds.has(t.tournamentId));
      mergedTournaments = [...targetTournaments, ...newTournaments];

      const existingMergedFrom = targetData.mergedFrom || [];

      // Both writes in a single atomic transaction
      tx.set(targetRef, {
        tournaments: mergedTournaments,
        mergedFrom: [...existingMergedFrom, sourceUserId],
        updatedAt: serverTimestamp()
      }, { merge: true });

      tx.set(sourceRef, {
        mergedTo: targetUserId,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
  } catch (error: any) {
    if (error.message === 'source_not_found') return { success: false, error: 'Source user not found' };
    if (error.message === 'target_not_found') return { success: false, error: 'Target user not found' };
    if (error.message === 'already_merged') return { success: false, error: 'Source user was already merged' };
    console.error('❌ Error in merge transaction:', error);
    return { success: false, error: 'Error during merge operation' };
  }

  // 2. Update tournament documents where source userId appears.
  //    Done outside the transaction (idempotent) with a safety cap to prevent
  //    unbounded writes from users with many tournaments.
  const tournamentIdsRaw = [...new Set((sourceData!.tournaments || []).map(t => t.tournamentId))];
  if (tournamentIdsRaw.length > MAX_TOURNAMENTS_PER_MERGE) {
    console.warn(
      `⚠️ mergeUsers: source has ${tournamentIdsRaw.length} tournaments — ` +
      `capping tournament doc updates at ${MAX_TOURNAMENTS_PER_MERGE}`
    );
  }
  const tournamentIdsToCheck = tournamentIdsRaw.slice(0, MAX_TOURNAMENTS_PER_MERGE);

  let tournamentsUpdated = 0;
  const batch = writeBatch(db!);
  let batchSize = 0;

  for (const tournamentId of tournamentIdsToCheck) {
    const tournamentRef = doc(db!, 'tournaments', tournamentId);
    const tournamentSnap = await getDoc(tournamentRef);
    if (!tournamentSnap.exists()) continue;

    const tournamentData = tournamentSnap.data();
    const participants = tournamentData!.participants || [];
    let changed = false;

    const updatedParticipants = participants.map((p: any) => {
      const updated = { ...p };

      // Replace source userId in main participant
      if (updated.userId === sourceUserId) {
        updated.userId = targetUserId;
        if (targetData!.photoURL) updated.photoURL = targetData!.photoURL;
        if (targetData!.authProvider) updated.type = 'REGISTERED';
        changed = true;
      }

      // Replace source userId in partner
      if (updated.partner?.userId === sourceUserId) {
        updated.partner = { ...updated.partner, userId: targetUserId };
        if (targetData!.photoURL) updated.partner.photoURL = targetData!.photoURL;
        if (targetData!.authProvider) updated.partner.type = 'REGISTERED';
        changed = true;
      }

      return updated;
    });

    if (changed) {
      batch.set(tournamentRef, { participants: updatedParticipants }, { merge: true });
      batchSize++;
      tournamentsUpdated++;

      // Firestore batch limit is 500 writes; flush early at 400 for safety
      if (batchSize >= 400) {
        await batch.commit();
        batchSize = 0;
      }
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  console.log(`✅ Merged user ${sourceUserId} into ${targetUserId}`);
  console.log(`   - Tournament docs updated: ${tournamentsUpdated}`);

  return { success: true, tournamentsUpdated };
}

/**
 * Remove a user from tournament collaborators (adminIds) before deleting
 * This is called before deleting a user to clean up their collaborator roles
 *
 * @param userId User ID to remove
 * @param tournamentIds Tournament IDs to remove user from
 * @returns true if all removals succeeded
 */
export async function removeUserFromTournamentCollaborators(
  userId: string,
  tournamentIds: string[]
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  if (tournamentIds.length === 0) {
    return true;
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
    // Remove user from adminIds in each tournament
    const promises = tournamentIds.map(async (tournamentId) => {
      const tournamentRef = doc(db!, 'tournaments', tournamentId);
      await updateDoc(tournamentRef, {
        adminIds: arrayRemove(userId)
      });
      console.log(`✅ Removed user ${userId} from tournament ${tournamentId} adminIds`);
    });

    await Promise.all(promises);
    console.log(`✅ Removed user from ${tournamentIds.length} tournament(s)`);
    return true;
  } catch (error) {
    console.error('❌ Error removing user from tournament collaborators:', error);
    return false;
  }
}
