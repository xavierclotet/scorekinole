import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

export interface UserProfile {
  playerName: string;
  email: string | null;
  photoURL: string | null;
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
