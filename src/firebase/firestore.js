import { db, isFirebaseEnabled } from './config.js';
import { getCurrentUser } from './auth.js';
import { getCurrentPlayerName } from '../js/auth-ui.js';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

/**
 * Sync match to Firestore (root-level matches collection)
 * @param {Object} match Match object to sync
 * @param {Object} options Optional configuration
 * @param {number|null} options.manualTeamSelection Manual team selection (1, 2, or null for "didn't play")
 * @returns {Promise<Object>} Match object with syncStatus added
 */
export async function syncMatchToCloud(match, options = {}) {
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
    // Use root-level matches collection
    const matchRef = doc(db, 'matches', matchId);

    // Detect which team the logged-in user played on
    const playerName = getCurrentPlayerName();
    const team1Name = match.players?.team1?.name || '';
    const team2Name = match.players?.team2?.name || '';

    let team1UserId = match.players?.team1?.userId || null;
    let team2UserId = match.players?.team2?.userId || null;

    // Priority 1: Manual team selection (explicit user choice)
    if (options.manualTeamSelection !== undefined) {
      if (options.manualTeamSelection === 1) {
        team1UserId = user.id;
        team2UserId = null;
      } else if (options.manualTeamSelection === 2) {
        team1UserId = null;
        team2UserId = user.id;
      }
      // else if null: user didn't play, leave both as null
    }
    // Priority 2: Auto-detection based on player name (only if not already set)
    else if (!team1UserId && !team2UserId) {
      // If player name matches team1, user played as team1
      if (playerName && team1Name === playerName) {
        team1UserId = user.id;
      }
      // If player name matches team2, user played as team2
      else if (playerName && team2Name === playerName) {
        team2UserId = user.id;
      }
    }

    const matchData = {
      ...match,
      id: matchId,
      // User who saved the match
      savedBy: {
        userId: user.id,
        userName: user.name || 'Unknown',
        userEmail: user.email || ''
      },
      // Legacy fields for backward compatibility
      userId: user.id,
      userName: user.name || 'Unknown',
      userEmail: user.email || '',
      // Player info for each team
      players: {
        team1: {
          name: team1Name,
          userId: team1UserId
        },
        team2: {
          name: team2Name,
          userId: team2UserId
        }
      },
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
 * Get all active (non-deleted) matches from Firestore where current user played
 * Searches for matches where user is in team1 OR team2
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
    const matchesRef = collection(db, 'matches');
    const matchesMap = new Map(); // Use Map to avoid duplicates

    // Query 1: Matches where user played as team1 (only active)
    try {
      const q1 = query(
        matchesRef,
        where('players.team1.userId', '==', user.id),
        where('status', '==', 'active'),
        orderBy('syncedAt', 'desc'),
        limit(50)
      );
      const snapshot1 = await getDocs(q1);
      snapshot1.forEach((doc) => {
        matchesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.warn('Query team1 failed (may need index):', err.message);
    }

    // Query 2: Matches where user played as team2 (only active)
    try {
      const q2 = query(
        matchesRef,
        where('players.team2.userId', '==', user.id),
        where('status', '==', 'active'),
        orderBy('syncedAt', 'desc'),
        limit(50)
      );
      const snapshot2 = await getDocs(q2);
      snapshot2.forEach((doc) => {
        matchesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.warn('Query team2 failed (may need index):', err.message);
    }

    // Fallback: Query by legacy userId field (for old matches, only active)
    try {
      const q3 = query(
        matchesRef,
        where('userId', '==', user.id),
        where('status', '==', 'active'),
        orderBy('syncedAt', 'desc'),
        limit(50)
      );
      const snapshot3 = await getDocs(q3);
      snapshot3.forEach((doc) => {
        matchesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.warn('Query legacy userId failed (may need index):', err.message);
    }

    // Convert Map to Array and sort by syncedAt
    const matches = Array.from(matchesMap.values()).sort((a, b) => {
      const timeA = a.syncedAt?.seconds || 0;
      const timeB = b.syncedAt?.seconds || 0;
      return timeB - timeA; // Descending order
    });

    console.log(`✅ Retrieved ${matches.length} active matches from cloud`);
    return matches;
  } catch (error) {
    console.error('❌ Error getting matches from cloud:', error);
    return [];
  }
}

/**
 * Soft delete match from Firestore (mark as deleted)
 * @param {string} matchId Match ID to mark as deleted
 * @returns {Promise<boolean>} Success status
 */
export async function softDeleteMatchFromCloud(matchId) {
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
    const matchRef = doc(db, 'matches', matchId);
    await updateDoc(matchRef, {
      status: 'deleted',
      deletedAt: serverTimestamp(),
      deletedBy: user.id
    });
    console.log('✅ Match marked as deleted:', matchId);
    return true;
  } catch (error) {
    console.error('❌ Error soft deleting match:', error);
    return false;
  }
}

/**
 * Permanently delete match from Firestore
 * @param {string} matchId Match ID to permanently delete
 * @returns {Promise<boolean>} Success status
 */
export async function permanentlyDeleteMatchFromCloud(matchId) {
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
    const matchRef = doc(db, 'matches', matchId);
    await deleteDoc(matchRef);
    console.log('✅ Match permanently deleted from cloud:', matchId);
    return true;
  } catch (error) {
    console.error('❌ Error permanently deleting match:', error);
    return false;
  }
}

/**
 * Restore deleted match
 * @param {string} matchId Match ID to restore
 * @returns {Promise<boolean>} Success status
 */
export async function restoreMatchFromCloud(matchId) {
  if (!isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = getCurrentUser();
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  try {
    const matchRef = doc(db, 'matches', matchId);
    await updateDoc(matchRef, {
      status: 'active',
      restoredAt: serverTimestamp(),
      restoredBy: user.id
    });
    console.log('✅ Match restored:', matchId);
    return true;
  } catch (error) {
    console.error('❌ Error restoring match:', error);
    return false;
  }
}

/**
 * Get deleted matches from Firestore where current user played
 * @returns {Promise<Array>} Array of deleted match objects
 */
export async function getDeletedMatchesFromCloud() {
  if (!isFirebaseEnabled()) {
    console.warn('Firebase disabled - returning empty deleted matches');
    return [];
  }

  const user = getCurrentUser();
  if (!user) {
    console.warn('No user authenticated');
    return [];
  }

  try {
    const matchesRef = collection(db, 'matches');
    const matchesMap = new Map();

    // Query 1: Deleted matches where user played as team1
    try {
      const q1 = query(
        matchesRef,
        where('players.team1.userId', '==', user.id),
        where('status', '==', 'deleted'),
        orderBy('deletedAt', 'desc'),
        limit(50)
      );
      const snapshot1 = await getDocs(q1);
      snapshot1.forEach((doc) => {
        matchesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.warn('Query deleted team1 failed (may need index):', err.message);
    }

    // Query 2: Deleted matches where user played as team2
    try {
      const q2 = query(
        matchesRef,
        where('players.team2.userId', '==', user.id),
        where('status', '==', 'deleted'),
        orderBy('deletedAt', 'desc'),
        limit(50)
      );
      const snapshot2 = await getDocs(q2);
      snapshot2.forEach((doc) => {
        matchesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.warn('Query deleted team2 failed (may need index):', err.message);
    }

    // Fallback: Query by legacy userId field
    try {
      const q3 = query(
        matchesRef,
        where('userId', '==', user.id),
        where('status', '==', 'deleted'),
        orderBy('deletedAt', 'desc'),
        limit(50)
      );
      const snapshot3 = await getDocs(q3);
      snapshot3.forEach((doc) => {
        matchesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.warn('Query deleted legacy userId failed (may need index):', err.message);
    }

    const matches = Array.from(matchesMap.values()).sort((a, b) => {
      const timeA = a.deletedAt?.seconds || 0;
      const timeB = b.deletedAt?.seconds || 0;
      return timeB - timeA;
    });

    console.log(`✅ Retrieved ${matches.length} deleted matches from cloud`);
    return matches;
  } catch (error) {
    console.error('❌ Error getting deleted matches:', error);
    return [];
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

/**
 * Check if match needs team confirmation before syncing
 * @param {Object} match Match object
 * @returns {boolean} True if match needs confirmation
 */
export function matchNeedsTeamConfirmation(match) {
  // If match is already synced, no confirmation needed
  if (match.syncStatus === 'synced') {
    return false;
  }

  // Check if both teams have no userId assigned
  const team1UserId = match.players?.team1?.userId;
  const team2UserId = match.players?.team2?.userId;

  // Needs confirmation if both userIds are null/undefined
  return !team1UserId && !team2UserId;
}

// ============================================
// CURRENT MATCH SYNC (with device lock)
// ============================================

/**
 * Get or create device ID for this device
 * @returns {string} Device UUID
 */
function getDeviceId() {
  let deviceId = localStorage.getItem('crokinoleDeviceId');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('crokinoleDeviceId', deviceId);
  }
  return deviceId;
}

/**
 * Sync current match to cloud
 * @param {Object} matchData Current match data
 * @returns {Promise<boolean>} Success status
 */
export async function syncCurrentMatchToCloud(matchData) {
  if (!isFirebaseEnabled()) {
    return false;
  }

  const user = getCurrentUser();
  if (!user) {
    return false;
  }

  try {
    const deviceId = getDeviceId();
    const matchRef = doc(db, 'users', user.id, 'currentMatch');

    const data = {
      ...matchData,
      activeDevice: deviceId,
      lastUpdate: serverTimestamp()
    };

    await setDoc(matchRef, data);
    console.log('✅ Current match synced to cloud');
    return true;
  } catch (error) {
    console.error('❌ Error syncing current match:', error);
    return false;
  }
}

/**
 * Get current match from cloud
 * @returns {Promise<Object|null>} Current match data or null
 */
export async function getCurrentMatchFromCloud() {
  if (!isFirebaseEnabled()) {
    return null;
  }

  const user = getCurrentUser();
  if (!user) {
    return null;
  }

  try {
    const matchRef = doc(db, 'users', user.id, 'currentMatch');
    const docSnap = await getDoc(matchRef);

    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting current match from cloud:', error);
    return null;
  }
}

/**
 * Delete current match from cloud
 * @returns {Promise<boolean>} Success status
 */
export async function deleteCurrentMatchFromCloud() {
  if (!isFirebaseEnabled()) {
    return false;
  }

  const user = getCurrentUser();
  if (!user) {
    return false;
  }

  try {
    const matchRef = doc(db, 'users', user.id, 'currentMatch');
    await deleteDoc(matchRef);
    console.log('✅ Current match deleted from cloud');
    return true;
  } catch (error) {
    console.error('❌ Error deleting current match from cloud:', error);
    return false;
  }
}

/**
 * Check if this device owns the current match lock
 * @param {Object} currentMatch Current match data from cloud
 * @returns {boolean} True if this device owns the lock
 */
export function hasMatchLock(currentMatch) {
  if (!currentMatch) return true; // No match in cloud, we can take control

  const deviceId = getDeviceId();
  return currentMatch.activeDevice === deviceId;
}

/**
 * Check if current match lock is stale (no heartbeat in 2 minutes)
 * @param {Object} currentMatch Current match data from cloud
 * @returns {boolean} True if lock is stale
 */
export function isLockStale(currentMatch) {
  if (!currentMatch || !currentMatch.lastUpdate) return true;

  const now = Date.now();
  const lastUpdate = currentMatch.lastUpdate.toMillis ? currentMatch.lastUpdate.toMillis() : currentMatch.lastUpdate;
  const timeSinceUpdate = now - lastUpdate;

  // Lock is stale if no update in 2 minutes
  return timeSinceUpdate > 120000;
}

// ============================================
// ADVANCED QUERIES (for future features)
// ============================================

/**
 * Get matches filtered by event title
 * @param {string} eventTitle Event title to filter by
 * @param {number} maxResults Maximum number of results (default 50)
 * @returns {Promise<Array>} Array of match objects
 */
export async function getMatchesByEvent(eventTitle, maxResults = 50) {
  if (!isFirebaseEnabled()) {
    return [];
  }

  const user = getCurrentUser();
  if (!user) {
    return [];
  }

  try {
    const matchesRef = collection(db, 'matches');
    const q = query(
      matchesRef,
      where('userId', '==', user.id),
      where('eventTitle', '==', eventTitle),
      orderBy('timestamp', 'desc'),
      limit(maxResults)
    );
    const querySnapshot = await getDocs(q);

    const matches = [];
    querySnapshot.forEach((doc) => {
      matches.push({ id: doc.id, ...doc.data() });
    });

    console.log(`✅ Retrieved ${matches.length} matches for event: ${eventTitle}`);
    return matches;
  } catch (error) {
    console.error('❌ Error getting matches by event:', error);
    return [];
  }
}

/**
 * Get matches filtered by date range
 * @param {number} startTimestamp Start timestamp (milliseconds)
 * @param {number} endTimestamp End timestamp (milliseconds)
 * @param {number} maxResults Maximum number of results (default 50)
 * @returns {Promise<Array>} Array of match objects
 */
export async function getMatchesByDateRange(startTimestamp, endTimestamp, maxResults = 50) {
  if (!isFirebaseEnabled()) {
    return [];
  }

  const user = getCurrentUser();
  if (!user) {
    return [];
  }

  try {
    const matchesRef = collection(db, 'matches');
    const q = query(
      matchesRef,
      where('userId', '==', user.id),
      where('timestamp', '>=', startTimestamp),
      where('timestamp', '<=', endTimestamp),
      orderBy('timestamp', 'desc'),
      limit(maxResults)
    );
    const querySnapshot = await getDocs(q);

    const matches = [];
    querySnapshot.forEach((doc) => {
      matches.push({ id: doc.id, ...doc.data() });
    });

    console.log(`✅ Retrieved ${matches.length} matches between ${new Date(startTimestamp).toLocaleDateString()} - ${new Date(endTimestamp).toLocaleDateString()}`);
    return matches;
  } catch (error) {
    console.error('❌ Error getting matches by date range:', error);
    return [];
  }
}

/**
 * Get global matches (admin/analytics use)
 * WARNING: This queries all matches across all users. Use with caution.
 * @param {number} maxResults Maximum number of results (default 100)
 * @returns {Promise<Array>} Array of match objects
 */
export async function getAllMatches(maxResults = 100) {
  if (!isFirebaseEnabled()) {
    return [];
  }

  try {
    const matchesRef = collection(db, 'matches');
    const q = query(
      matchesRef,
      orderBy('syncedAt', 'desc'),
      limit(maxResults)
    );
    const querySnapshot = await getDocs(q);

    const matches = [];
    querySnapshot.forEach((doc) => {
      matches.push({ id: doc.id, ...doc.data() });
    });

    console.log(`✅ Retrieved ${matches.length} global matches`);
    return matches;
  } catch (error) {
    console.error('❌ Error getting all matches:', error);
    return [];
  }
}
