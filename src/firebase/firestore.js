import { db, isFirebaseEnabled } from './config.js';
import { getCurrentUser } from './auth.js';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

/**
 * Sync match to Firestore
 * @param {Object} match Match object to sync
 * @returns {Promise<Object>} Match object with syncStatus added
 */
export async function syncMatchToCloud(match) {
  if (!isFirebaseEnabled()) {
    console.warn('Firebase disabled - match not synced to cloud');
    return { ...match, syncStatus: 'local' };
  }

  const user = getCurrentUser();
  if (!user) {
    console.warn('No user authenticated - match not synced');
    return { ...match, syncStatus: 'local' };
  }

  try {
    const matchId = match.id || generateMatchId();
    const matchRef = doc(db, 'users', user.id, 'matches', matchId);

    const matchData = {
      ...match,
      id: matchId,
      userId: user.id,
      syncedAt: serverTimestamp(),
      syncStatus: 'synced'
    };

    await setDoc(matchRef, matchData);
    console.log('✅ Match synced to cloud:', matchId);

    return matchData;
  } catch (error) {
    console.error('❌ Error syncing match:', error);
    return { ...match, syncStatus: 'error' };
  }
}

/**
 * Get all matches from Firestore for current user
 * @returns {Promise<Array>} Array of match objects
 */
export async function getMatchesFromCloud() {
  if (!isFirebaseEnabled()) {
    console.warn('Firebase disabled - returning empty cloud matches');
    return [];
  }

  const user = getCurrentUser();
  if (!user) {
    console.warn('No user authenticated');
    return [];
  }

  try {
    const matchesRef = collection(db, 'users', user.id, 'matches');
    const q = query(matchesRef, orderBy('syncedAt', 'desc'), limit(50));
    const querySnapshot = await getDocs(q);

    const matches = [];
    querySnapshot.forEach((doc) => {
      matches.push({ id: doc.id, ...doc.data() });
    });

    console.log(`✅ Retrieved ${matches.length} matches from cloud`);
    return matches;
  } catch (error) {
    console.error('❌ Error getting matches from cloud:', error);
    return [];
  }
}

/**
 * Delete match from Firestore
 * @param {string} matchId Match ID to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteMatchFromCloud(matchId) {
  if (!isFirebaseEnabled()) {
    console.warn('Firebase disabled - match not deleted from cloud');
    return true;
  }

  const user = getCurrentUser();
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  try {
    const matchRef = doc(db, 'users', user.id, 'matches', matchId);
    await deleteDoc(matchRef);
    console.log('✅ Match deleted from cloud:', matchId);
    return true;
  } catch (error) {
    console.error('❌ Error deleting match from cloud:', error);
    return false;
  }
}

/**
 * Sync local matches to cloud
 * @param {Array} localMatches Array of local match objects
 * @returns {Promise<Array>} Array of synced matches with sync status
 */
export async function syncLocalMatchesToCloud(localMatches) {
  if (!isFirebaseEnabled() || !getCurrentUser()) {
    return localMatches.map(m => ({ ...m, syncStatus: 'local' }));
  }

  const syncedMatches = [];

  for (const match of localMatches) {
    const syncedMatch = await syncMatchToCloud(match);
    syncedMatches.push(syncedMatch);
  }

  console.log(`✅ Synced ${syncedMatches.length} matches to cloud`);
  return syncedMatches;
}

/**
 * Generate a unique match ID
 * @returns {string} Unique ID
 */
function generateMatchId() {
  return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get sync status for a match
 * @param {Object} match Match object
 * @returns {string} 'synced', 'local', or 'error'
 */
export function getMatchSyncStatus(match) {
  return match.syncStatus || 'local';
}

/**
 * Check if match is synced to cloud
 * @param {Object} match Match object
 * @returns {boolean} True if synced
 */
export function isMatchSynced(match) {
  return match.syncStatus === 'synced';
}
