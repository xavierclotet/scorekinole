import { auth, isFirebaseEnabled } from './config.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';

// Current user state
let currentUser = null;
let authStateListeners = [];

/**
 * Sign in with Google
 * @returns {Promise<Object>} User object with id, name, email, photo
 */
export async function signInWithGoogle() {
  if (!isFirebaseEnabled()) {
    console.warn('Firebase is disabled. Using mock authentication.');
    // Mock user for development
    currentUser = {
      id: 'mock-user-123',
      name: 'Developer User',
      email: 'dev@scorekinole.com',
      photo: null
    };
    notifyAuthListeners(currentUser);
    return currentUser;
  }

  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    currentUser = {
      id: user.uid,
      name: user.displayName || 'Unknown',
      email: user.email,
      photo: user.photoURL
    };

    console.log('✅ User signed in:', currentUser.name);
    notifyAuthListeners(currentUser);
    return currentUser;
  } catch (error) {
    console.error('❌ Google sign in error:', error);
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function signOut() {
  if (!isFirebaseEnabled()) {
    currentUser = null;
    notifyAuthListeners(null);
    return;
  }

  try {
    await firebaseSignOut(auth);
    currentUser = null;
    console.log('✅ User signed out');
    notifyAuthListeners(null);
  } catch (error) {
    console.error('❌ Sign out error:', error);
    throw error;
  }
}

/**
 * Get current authenticated user
 * @returns {Object|null} Current user or null
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Listen to auth state changes
 * @param {Function} callback Function called when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthChange(callback) {
  authStateListeners.push(callback);

  // Call immediately with current state
  callback(currentUser);

  // Return unsubscribe function
  return () => {
    authStateListeners = authStateListeners.filter(cb => cb !== callback);
  };
}

/**
 * Initialize auth state listener
 */
export function initAuthListener() {
  if (!isFirebaseEnabled()) {
    console.log('Firebase disabled - using local auth only');
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photo: user.photoURL
      };
    } else {
      currentUser = null;
    }
    notifyAuthListeners(currentUser);
  });
}

/**
 * Notify all auth listeners of state change
 */
function notifyAuthListeners(user) {
  authStateListeners.forEach(callback => callback(user));
}
