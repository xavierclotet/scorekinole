import { db, isFirebaseEnabled } from './config.js';
import { getCurrentUser } from './auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Get user profile from Firestore
 * @returns {Promise<Object|null>} User profile or null
 */
export async function getUserProfile() {
  if (!isFirebaseEnabled()) {
    console.warn('Firebase disabled - no user profile');
    return null;
  }

  const user = getCurrentUser();
  if (!user) {
    console.warn('No user authenticated');
    return null;
  }

  try {
    const profileRef = doc(db, 'users', user.id);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      const profile = profileSnap.data();
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
 * @param {string} playerName Player's display name
 * @returns {Promise<Object|null>} Updated profile or null
 */
export async function saveUserProfile(playerName) {
  if (!isFirebaseEnabled()) {
    console.warn('Firebase disabled - profile not saved');
    return null;
  }

  const user = getCurrentUser();
  if (!user) {
    console.warn('No user authenticated');
    return null;
  }

  try {
    const profileRef = doc(db, 'users', user.id);
    const profile = {
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
 * @returns {Promise<string>} Player name
 */
export async function getPlayerName() {
  const user = getCurrentUser();
  if (!user) return '';

  const profile = await getUserProfile();
  return profile?.playerName || user.name || 'Player';
}
