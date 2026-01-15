import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { doc, getDoc, setDoc, getDocs, query, where, collection, addDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import type { TournamentRecord } from '$lib/types/tournament';

export interface UserProfile {
  playerName: string;
  email: string | null;
  photoURL: string | null;
  isAdmin?: boolean;
  // ELO and tournament tracking
  elo?: number;                          // Current ELO (default 1500)
  tournaments?: TournamentRecord[];      // Tournament history
  authProvider?: 'google' | null;        // null = GUEST without auth
  mergedFrom?: string[];                 // IDs of GUEST users merged into this one
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
    const profile: UserProfile = {
      playerName: playerName.trim(),
      email: user.email,
      photoURL: user.photo,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp() // Will only set on first create
    };

    await setDoc(profileRef, profile, { merge: true });
    console.log('✅ User profile saved:', playerName);
    return profile;
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
 * Get or create a user by exact name match
 * Used for GUEST participants - creates a new user without auth if not found
 *
 * @param name Exact player name to search for
 * @returns Object with userId and whether it was newly created
 */
export async function getOrCreateUserByName(name: string): Promise<{ userId: string; created: boolean } | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  try {
    const usersRef = collection(db!, 'users');

    // Search for exact name match (case-sensitive)
    const q = query(usersRef, where('playerName', '==', name));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      // Found existing user with this name
      const existingDoc = snapshot.docs[0];
      console.log(`✅ Found existing user "${name}" with ID: ${existingDoc.id}`);
      return { userId: existingDoc.id, created: false };
    }

    // Create new GUEST user (no auth)
    const newUserData: Partial<UserProfile> = {
      playerName: name,
      email: null,
      photoURL: null,
      authProvider: null,
      elo: 1500,
      tournaments: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const newDocRef = await addDoc(usersRef, newUserData);
    console.log(`✅ Created new GUEST user "${name}" with ID: ${newDocRef.id}`);
    return { userId: newDocRef.id, created: true };
  } catch (error) {
    console.error('❌ Error in getOrCreateUserByName:', error);
    return null;
  }
}

/**
 * Add a tournament record to user's history and update ELO
 *
 * @param userId Firestore user ID
 * @param record Tournament record to add
 * @param newElo New ELO value after tournament
 */
export async function addTournamentRecord(
  userId: string,
  record: TournamentRecord,
  newElo: number
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  try {
    const userRef = doc(db!, 'users', userId);

    await setDoc(userRef, {
      elo: newElo,
      tournaments: arrayUnion(record),
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`✅ Added tournament record for user ${userId}: ELO ${record.eloBefore} → ${newElo} (${record.eloDelta > 0 ? '+' : ''}${record.eloDelta})`);
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
