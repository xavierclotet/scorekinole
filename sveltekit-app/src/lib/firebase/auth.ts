import { auth, isFirebaseEnabled } from './config';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Google OAuth Web Client ID (for native authentication)
const GOOGLE_WEB_CLIENT_ID = "648322505256-j4j11fqnr6p1minvnppodo02f2tbfejt.apps.googleusercontent.com";

// User type
export interface User {
  id: string;
  name: string;
  email: string | null;
  photo: string | null;
}

// Current user store (reactive)
export const currentUser = writable<User | null>(null);

/**
 * Sign in with Google
 * @returns Promise with User object
 */
export async function signInWithGoogle(): Promise<User> {
  if (!browser) {
    throw new Error('Sign in can only be called in the browser');
  }

  if (!isFirebaseEnabled()) {
    console.warn('Firebase is disabled. Using mock authentication.');
    // Mock user for development
    const mockUser: User = {
      id: 'mock-user-123',
      name: 'Developer User',
      email: 'dev@scorekinole.com',
      photo: null
    };
    currentUser.set(mockUser);
    return mockUser;
  }

  try {
    // Check if running in native app (Capacitor)
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      // Use native authentication for mobile apps
      console.log('🔐 Using native Google Sign-In...');

      const result = await FirebaseAuthentication.signInWithGoogle({
        // @ts-expect-error - webClientId exists in runtime but not in types
        webClientId: GOOGLE_WEB_CLIENT_ID
      });

      // Get the credential and sign in to Firebase
      const credential = GoogleAuthProvider.credential(result.credential?.idToken);
      const userCredential = await signInWithCredential(auth!, credential);
      const user = userCredential.user;

      console.log('🔍 Firebase user object:', {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        metadata: user.metadata
      });
      console.log('🔍 Native result:', result);

      const appUser: User = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photo: user.photoURL
      };

      console.log('✅ User signed in (native):', appUser.name);
      console.log('✅ Photo URL:', appUser.photo);
      currentUser.set(appUser);
      return appUser;
    } else {
      // Use web popup for browser
      console.log('🌐 Using web popup Sign-In...');

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth!, provider);
      const user = result.user;

      const appUser: User = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photo: user.photoURL
      };

      console.log('✅ User signed in (web):', appUser.name);
      currentUser.set(appUser);
      return appUser;
    }
  } catch (error) {
    console.error('❌ Google sign in error:', error);
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  if (!browser) {
    return;
  }

  if (!isFirebaseEnabled()) {
    currentUser.set(null);
    return;
  }

  try {
    await firebaseSignOut(auth!);
    currentUser.set(null);
    console.log('✅ User signed out');
  } catch (error) {
    console.error('❌ Sign out error:', error);
    throw error;
  }
}

/**
 * Initialize auth state listener
 * Call this on app initialization
 */
export function initAuthListener(): void {
  if (!browser) {
    return;
  }

  if (!isFirebaseEnabled()) {
    console.log('Firebase disabled - using local auth only');
    return;
  }

  onAuthStateChanged(auth!, (user: FirebaseUser | null) => {
    if (user) {
      const appUser: User = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photo: user.photoURL
      };
      currentUser.set(appUser);
    } else {
      currentUser.set(null);
    }
  });
}
