import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { doc, getDoc, setDoc, getDocs, query, where, collection, addDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import type { TournamentRecord } from '$lib/types/tournament';
import type { QuotaEntry } from '$lib/types/quota';
import { createInitialQuota } from '$lib/types/quota';
import { getDeviceInfo, type DeviceInfo } from '$lib/utils/deviceInfo';

export interface UserProfile {
  playerName: string;
  email: string | null;
  photoURL: string | null;
  language?: 'es' | 'ca' | 'en';  // User's preferred language
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  canAutofill?: boolean;           // Can use autofill buttons in groups/bracket pages
  canImportTournaments?: boolean;  // Can import historical tournaments (doesn't count towards quota)
  /** @deprecated Use quotaEntries instead. Kept for backward compatibility. */
  maxTournamentsPerYear?: number;  // Max tournaments this admin can create per year (0-365)
  quotaEntries?: QuotaEntry[];     // Per-year quota entries (new system)
  // Tournament tracking (ranking is calculated from tournaments, not stored)
  tournaments?: TournamentRecord[];      // Tournament history
  authProvider?: 'google' | null;        // null = GUEST without auth
  mergedFrom?: string[];                 // IDs of GUEST users merged into this one
  mergedTo?: string;                     // ID of registered user this GUEST was merged to
  // Device tracking (for fraud detection)
  registrationIP?: string;               // IP address at registration
  deviceFingerprint?: string;            // Browser/device fingerprint
  deviceInfo?: DeviceInfo;               // Full device info
  updatedAt?: any;
  createdAt?: any;
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled - no user profile');
    return null;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return null;
  }

  try {
    const profileRef = doc(db!, 'users', user.id);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      const profile = profileSnap.data() as UserProfile;
      console.log('✅ User profile loaded:', profile.playerName);
      return profile;
    } else {
      console.log('ℹ️ No profile found for user');
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return null;
  }
}

/**
 * Save or update user profile
 * For NEW users: auto-assigns isAdmin=true and 1 live tournament quota for current year
 */
export async function saveUserProfile(playerName: string): Promise<UserProfile | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled - profile not saved');
    return null;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return null;
  }

  try {
    const profileRef = doc(db!, 'users', user.id);

    // Check if this is a new user (no existing document)
    const existingDoc = await getDoc(profileRef);
    const isNewUser = !existingDoc.exists();

    const currentYear = new Date().getFullYear();

    const profile: Partial<UserProfile> = {
      playerName: playerName.trim(),
      email: user.email,
      photoURL: user.photoURL,
      authProvider: 'google',
      updatedAt: serverTimestamp()
    };

    // For NEW users only: auto-assign admin status, initial quota, and capture device info
    if (isNewUser) {
      profile.isAdmin = true;
      profile.canImportTournaments = true;
      profile.canAutofill = true;
      profile.quotaEntries = createInitialQuota(currentYear, 1);
      profile.createdAt = serverTimestamp();

      // Capture device info for fraud detection
      try {
        const deviceInfo = await getDeviceInfo();
        profile.registrationIP = deviceInfo.ip;
        profile.deviceFingerprint = deviceInfo.fingerprint;
        profile.deviceInfo = deviceInfo;
        console.log('📱 Device info captured:', deviceInfo.ip, deviceInfo.fingerprint.slice(0, 8) + '...');
      } catch (error) {
        console.warn('⚠️ Could not capture device info:', error);
      }

      console.log('🎉 New user - auto-assigning admin + canImportTournaments + canAutofill + 1 live tournament quota for', currentYear);
    }

    await setDoc(profileRef, profile, { merge: true });
    console.log('✅ User profile saved:', playerName, isNewUser ? '(new user)' : '(existing user)');
    return profile as UserProfile;
  } catch (error) {
    console.error('❌ Error saving user profile:', error);
    return null;
  }
}

/**
 * Get player name for current user
 * Falls back to Google display name if no custom name set
 */
export async function getPlayerName(): Promise<string> {
  const user = get(currentUser);
  if (!user) return '';

  const profile = await getUserProfile();
  return profile?.playerName || user.name || 'Player';
}

/**
 * Add a tournament record to user's history
 * Prevents duplicates by checking if tournament already exists in history
 * Note: Ranking is calculated from tournaments, not stored separately
 *
 * @param userId Firestore user ID
 * @param record Tournament record to add
 */
export async function addTournamentRecord(
  userId: string,
  record: TournamentRecord
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  try {
    const userRef = doc(db!, 'users', userId);
    const userSnap = await getDoc(userRef);

    // Check if tournament record already exists (prevent duplicates)
    if (userSnap.exists()) {
      const profile = userSnap.data() as UserProfile;
      const existingRecord = profile.tournaments?.find(t => t.tournamentId === record.tournamentId);
      if (existingRecord) {
        console.log(`⚠️ Tournament ${record.tournamentId} already in user ${userId} history - skipping duplicate`);
        return true; // Already exists, don't add duplicate
      }
    }

    await setDoc(userRef, {
      tournaments: arrayUnion(record),
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`✅ Added tournament record for user ${userId}: +${record.rankingDelta} points`);
    return true;
  } catch (error) {
    console.error('❌ Error adding tournament record:', error);
    return false;
  }
}

/**
 * Get user profile by ID (not current user)
 *
 * @param userId Firestore user ID
 */
export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  try {
    const userRef = doc(db!, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting user profile by ID:', error);
    return null;
  }
}

/**
 * Remove a tournament record from user's history
 * Used when deleting a tournament
 * Note: Ranking is calculated from tournaments, not stored separately
 *
 * @param userId Firestore user ID
 * @param tournamentId Tournament ID to remove
 * @returns true if successful
 */
export async function removeTournamentRecord(
  userId: string,
  tournamentId: string
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  try {
    const userRef = doc(db!, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.warn(`User ${userId} not found`);
      return false;
    }

    const profile = userSnap.data() as UserProfile;
    const tournaments = profile.tournaments || [];

    // Find the tournament record to remove
    const tournamentIndex = tournaments.findIndex(t => t.tournamentId === tournamentId);

    if (tournamentIndex === -1) {
      console.log(`Tournament ${tournamentId} not found in user ${userId} history`);
      return true; // Not an error - tournament wasn't in history
    }

    const removedRecord = tournaments[tournamentIndex];

    // Remove tournament from array
    const updatedTournaments = [
      ...tournaments.slice(0, tournamentIndex),
      ...tournaments.slice(tournamentIndex + 1)
    ];

    await setDoc(userRef, {
      tournaments: updatedTournaments,
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`✅ Removed tournament ${tournamentId} from user ${userId} (was +${removedRecord.rankingDelta} points)`);
    return true;
  } catch (error) {
    console.error('❌ Error removing tournament record:', error);
    return false;
  }
}

/**
 * Save user's language preference to their profile
 * @param language The language code to save
 */
export async function saveUserLanguage(language: 'es' | 'ca' | 'en'): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    return false;
  }

  try {
    const profileRef = doc(db!, 'users', user.id);
    await setDoc(profileRef, {
      language,
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log('✅ User language saved:', language);
    return true;
  } catch (error) {
    console.error('❌ Error saving user language:', error);
    return false;
  }
}
