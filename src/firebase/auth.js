import { auth, isFirebaseEnabled } from './config.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

// Google OAuth Web Client ID (for native authentication)
const GOOGLE_WEB_CLIENT_ID = "648322505256-j4j11fqnr6p1minvnppodo02f2tbfejt.apps.googleusercontent.com";

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
    // Check if running in native app (Capacitor)
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      // Use native authentication for mobile apps
      console.log('🔐 Using native Google Sign-In...');

      const result = await FirebaseAuthentication.signInWithGoogle({
        webClientId: GOOGLE_WEB_CLIENT_ID
      });

      // Get the credential and sign in to Firebase
      const credential = GoogleAuthProvider.credential(result.credential?.idToken);
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      console.log('🔍 Firebase user object:', {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        metadata: user.metadata
      });
      console.log('🔍 Native result:', result);

      currentUser = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photo: user.photoURL
      };

      console.log('✅ User signed in (native):', currentUser.name);
      console.log('✅ Photo URL:', currentUser.photo);
      notifyAuthListeners(currentUser);
      return currentUser;
    } else {
      // Use web popup for browser
      console.log('🌐 Using web popup Sign-In...');

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      currentUser = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photo: user.photoURL
      };

      console.log('✅ User signed in (web):', currentUser.name);
      notifyAuthListeners(currentUser);
      return currentUser;
    }
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
