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
  deleteField,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  arrayRemove,
  runTransaction,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Timestamp
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
 * Email is PII and lives in the owner-only /users/{uid}/private/meta subdoc, not
 * on the public user doc. Admins read it per-user (the /private read rule already
 * grants admins access — covered by rules test U4). Per-uid cache so paging and
 * repeated searches don't re-fetch. A null entry means "fetched, no email".
 */
const _emailCache = new Map<string, string | null>();

/** Merge per-user private emails into loaded users (in place). Best-effort. */
async function attachEmails(users: AdminUserInfo[]): Promise<void> {
  if (!browser || !isFirebaseEnabled() || users.length === 0) return;

  const toFetch = users.filter((u) => !_emailCache.has(u.userId));
  await Promise.all(
    toFetch.map(async (u) => {
      try {
        const snap = await getDoc(doc(db!, 'users', u.userId, 'private', 'meta'));
        _emailCache.set(u.userId, (snap.exists() ? snap.data().email : null) ?? null);
      } catch {
        // Permission/network hiccup — fall back to the public-doc email (if any).
        _emailCache.set(u.userId, null);
      }
    })
  );

  for (const u of users) {
    const email = _emailCache.get(u.userId);
    if (email) u.email = email; // keep public-doc value for legacy/not-yet-migrated users
  }
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

    await attachEmails(users);

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

    await attachEmails(users);

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
 * Permanently delete a user (super admin only). Only succeeds for guest/empty
 * profiles with no tournament history and no merge links.
 * Throws on failure so callers can surface the precise error message.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  if (!browser || !isFirebaseEnabled()) {
    throw new Error('Firebase disabled');
  }

  const user = get(currentUser);
  if (!user) {
    throw new Error('No user authenticated');
  }

  const superAdminStatus = await isSuperAdmin();
  if (!superAdminStatus) {
    throw new Error('Unauthorized: super admin required');
  }

  const functions = getFunctions(getApp(), 'europe-west1');
  const fn = httpsCallable(functions, 'deleteUserAccount');
  await fn({ userId });
  console.log('✅ User permanently deleted:', userId);
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

    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      // Firestore throws on `undefined` anywhere in the payload (and one bad field
      // aborts the WHOLE save). `undefined` from the admin modal means "clear this
      // field" — translate it to a real field deletion.
      payload[key] = value === undefined ? deleteField() : value;
    }

    // playerNameLower is a denormalized invariant (name-uniqueness checks and the
    // import wizard's player matching query both depend on it). Renaming without
    // syncing it blocks the old name forever and lets imports create duplicate
    // guest profiles for the new name.
    if (typeof updates.playerName === 'string' && updates.playerName.trim()) {
      payload.playerName = updates.playerName.trim();
      payload.playerNameLower = updates.playerName.trim().toLowerCase();
    }

    await updateDoc(userRef, {
      ...payload,
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
/** Epoch range [start, end) for a calendar year, in local time. */
function yearBounds(year: number): { start: number; end: number } {
  return { start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() };
}

export async function getMatchesPaginated(
  pageSize: number = 15,
  lastDocument: QueryDocumentSnapshot<DocumentData> | null = null,
  year: number | null = null
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

    // Year scope (server-side): bound startTime to [yearStart, nextYearStart).
    // Range + orderBy on the same field needs only the automatic single-field index.
    const yearConstraints =
      year != null
        ? (() => {
            const { start, end } = yearBounds(year);
            return [where('startTime', '>=', start), where('startTime', '<', end)];
          })()
        : [];

    // Get total count (scoped to the year when set)
    const countSnapshot = await getCountFromServer(
      year != null ? query(matchesRef, ...yearConstraints) : matchesRef
    );
    const totalCount = countSnapshot.data().count;

    // Build paginated query
    let q;
    if (lastDocument) {
      q = query(
        matchesRef,
        ...yearConstraints,
        orderBy('startTime', 'desc'),
        startAfter(lastDocument),
        limit(pageSize)
      );
    } else {
      q = query(matchesRef, ...yearConstraints, orderBy('startTime', 'desc'), limit(pageSize));
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
 * Fetch all matches for search (admin only).
 * Same rationale as fetchAllUsers: searching must cover the entire
 * collection, not just the pages loaded so far by the infinite scroll.
 */
export async function fetchAllMatches(year: number | null = null): Promise<MatchHistory[]> {
  if (!browser || !isFirebaseEnabled()) return [];

  const user = get(currentUser);
  if (!user) return [];

  const adminStatus = await isAdmin();
  if (!adminStatus) return [];

  try {
    const matchesRef = collection(db!, 'matches');
    // Scope the search fetch to the selected year so it doesn't pull the entire
    // (ever-growing) collection — the main performance win for large datasets.
    let scopedQuery;
    if (year != null) {
      const { start, end } = yearBounds(year);
      scopedQuery = query(matchesRef, where('startTime', '>=', start), where('startTime', '<', end));
    }
    const snapshot = await getDocs(scopedQuery ?? matchesRef);

    const matches: MatchHistory[] = [];
    snapshot.forEach((docSnap) => {
      matches.push({
        ...docSnap.data(),
        // Doc id is authoritative (saveFriendlyMatchToFirestore keeps them
        // in sync, but the doc id is what delete/update operate on)
        id: docSnap.id
      } as MatchHistory);
    });

    matches.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));

    console.log(`✅ Fetched all ${matches.length} matches for search`);
    return matches;
  } catch (error) {
    console.error('❌ Error fetching all matches:', error);
    return [];
  }
}

/**
 * Calendar year of the oldest match (admin only). Used to build the year-filter
 * options. Costs a single document read (orderBy startTime asc, limit 1).
 * Returns null if there are no matches (or on error).
 */
export async function getEarliestMatchYear(): Promise<number | null> {
  if (!browser || !isFirebaseEnabled()) return null;

  const user = get(currentUser);
  if (!user) return null;

  const adminStatus = await isAdmin();
  if (!adminStatus) return null;

  try {
    const matchesRef = collection(db!, 'matches');
    const snapshot = await getDocs(query(matchesRef, orderBy('startTime', 'asc'), limit(1)));
    if (snapshot.empty) return null;
    const startTime = (snapshot.docs[0].data() as MatchHistory).startTime;
    if (!startTime) return null;
    return new Date(startTime).getFullYear();
  } catch (error) {
    console.error('❌ Error getting earliest match year:', error);
    return null;
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
      // A merged-away profile is dead: rankings skip mergedTo docs, so
      // tournaments moved onto it would be silently lost. This also blocks
      // cycles (A→B then B→A) where both profiles end up merged-away.
      if (targetData.mergedTo) throw new Error('target_already_merged');

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
    if (error.message === 'target_already_merged') return { success: false, error: 'Target user was already merged into another user' };
    console.error('❌ Error in merge transaction:', error);
    return { success: false, error: 'Error during merge operation' };
  }

  // 2. Update tournament documents where source userId appears.
  //    Done outside the merge transaction (idempotent) with a safety cap to
  //    prevent unbounded writes from users with many tournaments.
  const tournamentIdsRaw = [...new Set((sourceData!.tournaments || []).map(t => t.tournamentId))];

  // Records in source.tournaments only exist for COMPLETED tournaments. The source
  // user may also be registered in tournaments still in progress (DRAFT/GROUP_STAGE/
  // TRANSITION/FINAL_STAGE): without remapping those, the registration keeps pointing
  // at the merged-away doc and — since the Cloud Function writes records to
  // participant.userId and rankings skip mergedTo docs — the ranking points are
  // silently lost when the tournament completes.
  try {
    const activeSnapshot = await getDocs(query(
      collection(db!, 'tournaments'),
      where('status', 'in', ['DRAFT', 'GROUP_STAGE', 'TRANSITION', 'FINAL_STAGE'])
    ));
    activeSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const inParticipants = (data.participants || []).some((p: any) =>
        p.userId === sourceUserId || p.partner?.userId === sourceUserId
      );
      const inWaitlist = (data.waitlist || []).some((w: any) => w.userId === sourceUserId);
      if ((inParticipants || inWaitlist) && !tournamentIdsRaw.includes(docSnap.id)) {
        tournamentIdsRaw.push(docSnap.id);
      }
    });
  } catch (error) {
    console.error('⚠️ mergeUsers: could not scan active tournaments for registrations:', error);
  }

  if (tournamentIdsRaw.length > MAX_TOURNAMENTS_PER_MERGE) {
    console.warn(
      `⚠️ mergeUsers: source has ${tournamentIdsRaw.length} tournaments — ` +
      `capping tournament doc updates at ${MAX_TOURNAMENTS_PER_MERGE}`
    );
  }
  const tournamentIdsToCheck = tournamentIdsRaw.slice(0, MAX_TOURNAMENTS_PER_MERGE);

  let tournamentsUpdated = 0;

  for (const tournamentId of tournamentIdsToCheck) {
    const tournamentRef = doc(db!, 'tournaments', tournamentId);

    // Per-tournament transaction: active tournaments receive concurrent writes
    // (self-registrations, match results), so the written arrays must derive
    // from the in-transaction read — a batched read-modify-write would lose them.
    let docChanged = false;
    try {
      await runTransaction(db!, async (tx) => {
        docChanged = false; // reset in case of transaction retry
        const tournamentSnap = await tx.get(tournamentRef);
        if (!tournamentSnap.exists()) return;

        const tournamentData = tournamentSnap.data();
        let changed = false;

        const updatedParticipants = (tournamentData!.participants || []).map((p: any) => {
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

        let waitlistChanged = false;
        const updatedWaitlist = (tournamentData!.waitlist || []).map((w: any) => {
          if (w.userId === sourceUserId) {
            waitlistChanged = true;
            return { ...w, userId: targetUserId };
          }
          return w;
        });

        if (!changed && !waitlistChanged) return;

        const updates: Record<string, unknown> = {};
        if (changed) updates.participants = updatedParticipants;
        if (waitlistChanged) updates.waitlist = updatedWaitlist;
        tx.set(tournamentRef, updates, { merge: true });
        docChanged = true;
      });
    } catch (error) {
      console.error(`❌ mergeUsers: failed to remap tournament ${tournamentId}:`, error);
    }

    if (docChanged) tournamentsUpdated++;
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

// ─── Contact Messages ────────────────────────────────────────────────

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: Timestamp | null;
  ip: string;
  read: boolean;
}

export interface PaginatedContactMessagesResult {
  messages: ContactMessage[];
  totalCount: number;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function getContactMessagesPaginated(
  pageSize: number = 20,
  lastDocument: QueryDocumentSnapshot<DocumentData> | null = null,
  filter: 'all' | 'unread' | 'read' = 'all'
): Promise<PaginatedContactMessagesResult> {
  const emptyResult: PaginatedContactMessagesResult = {
    messages: [],
    totalCount: 0,
    lastDoc: null,
    hasMore: false
  };

  if (!browser || !isFirebaseEnabled() || !db) return emptyResult;

  try {
    const ref = collection(db, 'contactMessages');

    const readFilter = filter !== 'all' ? where('read', '==', filter === 'read') : null;

    // Count the same subset the list shows — counting the whole collection
    // made the header badge show the global total under Unread/Read.
    const countSnapshot = await getCountFromServer(readFilter ? query(ref, readFilter) : ref);
    const totalCount = countSnapshot.data().count;

    let constraints: any[] = [orderBy('createdAt', 'desc')];
    if (readFilter) constraints.push(readFilter);

    if (lastDocument) constraints.push(startAfter(lastDocument));
    constraints.push(limit(pageSize));

    const q = query(ref, ...constraints);
    const snapshot = await getDocs(q);

    const messages: ContactMessage[] = [];
    snapshot.forEach((ds) => {
      const data = ds.data() as Omit<ContactMessage, 'id'>;
      messages.push({ id: ds.id, ...data });
    });

    return {
      messages,
      totalCount,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] ?? null,
      hasMore: snapshot.docs.length === pageSize
    };
  } catch (err) {
    console.error('Error fetching contact messages:', err);
    // Rethrow so the page can show a real error state — returning an empty
    // result here rendered a misleading "No messages".
    throw err;
  }
}

export async function markContactMessageRead(messageId: string, read: boolean): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'contactMessages', messageId), { read });
}

export async function deleteContactMessage(messageId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, 'contactMessages', messageId));
}
