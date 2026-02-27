import { auth, db, isFirebaseEnabled } from './config';
import { doc, getDoc } from 'firebase/firestore';
import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithCredential,
  linkWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type AuthCredential,
  type User as FirebaseUser
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { setLocale } from '$lib/paraglide/runtime.js';

// Google OAuth Web Client ID (for native authentication)
const GOOGLE_WEB_CLIENT_ID = "648322505256-j4j11fqnr6p1minvnppodo02f2tbfejt.apps.googleusercontent.com";

// User type
export interface User {
  id: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  providerPhotoURL: string | null; // Original provider profile photo (preserved for fallback)
}

// Current user store (reactive)
export const currentUser = writable<User | null>(null);

// Flag to indicate Firebase Auth has completed its first check (restored session or confirmed no session)
export const authInitialized = writable<boolean>(false);

// Flag to indicate user needs to complete their profile (no document in users collection)
export const needsProfileSetup = writable<boolean>(false);

// Pending credential for account linking (when user tries Facebook but email exists with Google)
let pendingLinkCredential: AuthCredential | null = null;

/**
 * Store a credential for later linking after the user signs in with another provider
 */
export function setPendingLinkCredential(credential: AuthCredential | null): void {
  pendingLinkCredential = credential;
}

/**
 * Check if there's a pending credential to link
 */
export function hasPendingLinkCredential(): boolean {
  return pendingLinkCredential !== null;
}

/**
 * Get credential from a failed sign-in error (account-exists-with-different-credential)
 */
export function getCredentialFromError(error: any): AuthCredential | null {
  return FacebookAuthProvider.credentialFromError(error) ||
         OAuthProvider.credentialFromError(error) ||
         null;
}

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
      photoURL: null,
      providerPhotoURL: null
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
        photoURL: user.photoURL,
        providerPhotoURL: user.photoURL
      };

      console.log('✅ User signed in (native):', appUser.name);
      currentUser.set(appUser);

      // Auto-link pending credential after successful Google sign-in (native)
      if (pendingLinkCredential) {
        try {
          await linkWithCredential(user, pendingLinkCredential);
          console.log('✅ Pending credential linked successfully (native)');
        } catch (linkError) {
          console.warn('⚠️ Could not link pending credential:', linkError);
        } finally {
          pendingLinkCredential = null;
        }
      }

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
        photoURL: user.photoURL,
        providerPhotoURL: user.photoURL
      };

      console.log('✅ User signed in (web):', appUser.name);
      currentUser.set(appUser);

      // Auto-link pending credential (e.g., Facebook) after successful Google sign-in
      if (pendingLinkCredential) {
        try {
          await linkWithCredential(user, pendingLinkCredential);
          console.log('✅ Pending credential linked successfully');
        } catch (linkError) {
          console.warn('⚠️ Could not link pending credential:', linkError);
        } finally {
          pendingLinkCredential = null;
        }
      }

      return appUser;
    }
  } catch (error) {
    console.error('❌ Google sign in error:', error);
    throw error;
  }
}

/**
 * Sign in with Facebook
 * @returns Promise with User object
 */
export async function signInWithFacebook(): Promise<User> {
  if (!browser) {
    throw new Error('Sign in can only be called in the browser');
  }

  if (!isFirebaseEnabled()) {
    console.warn('Firebase is disabled. Using mock authentication.');
    const mockUser: User = {
      id: 'mock-user-123',
      name: 'Developer User',
      email: 'dev@scorekinole.com',
      photoURL: null,
      providerPhotoURL: null
    };
    currentUser.set(mockUser);
    return mockUser;
  }

  try {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      console.log('🔐 Using native Facebook Sign-In...');

      const result = await FirebaseAuthentication.signInWithFacebook();

      const credential = FacebookAuthProvider.credential(result.credential?.accessToken!);
      const userCredential = await signInWithCredential(auth!, credential);
      const user = userCredential.user;

      const appUser: User = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photoURL: user.photoURL,
        providerPhotoURL: user.photoURL
      };

      console.log('✅ User signed in with Facebook (native):', appUser.name);
      currentUser.set(appUser);
      return appUser;
    } else {
      console.log('🌐 Using web popup Facebook Sign-In...');

      const provider = new FacebookAuthProvider();
      provider.addScope('email');
      const result = await signInWithPopup(auth!, provider);
      const user = result.user;

      const appUser: User = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photoURL: user.photoURL,
        providerPhotoURL: user.photoURL
      };

      console.log('✅ User signed in with Facebook (web):', appUser.name);
      currentUser.set(appUser);
      return appUser;
    }
  } catch (error) {
    console.error('❌ Facebook sign in error:', error);
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
    authInitialized.set(true);
    return;
  }

  onAuthStateChanged(auth!, async (user: FirebaseUser | null) => {
    if (user) {
      // Start with auth provider data (preserve provider photo for fallback)
      const providerPhotoURL = user.photoURL;
      let appUser: User = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photoURL: user.photoURL,
        providerPhotoURL: providerPhotoURL
      };

      // Check if user has a document in the users collection
      try {
        const userDocRef = doc(db!, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          console.log('ℹ️ User authenticated but no profile in Firestore - needs setup');
          needsProfileSetup.set(true);
        } else {
          console.log('✅ User has profile in Firestore');
          needsProfileSetup.set(false);

          // Use Firestore profile data (custom photo, player name, language)
          const profile = userDocSnap.data();
          if (profile) {
            appUser = {
              ...appUser,
              name: profile.playerName || appUser.name,
              // Use custom photo if set, otherwise fall back to Google photo
              photoURL: profile.photoURL || providerPhotoURL
            };

            // Apply user's language preference if set
            if (profile.language && ['es', 'ca', 'en'].includes(profile.language)) {
              console.log('🌐 Applying user language preference:', profile.language);
              setLocale(profile.language, { reload: false });
            }
          }
        }
      } catch (error) {
        console.error('❌ Error checking user profile:', error);
        needsProfileSetup.set(false);
      }

      currentUser.set(appUser);
    } else {
      currentUser.set(null);
      needsProfileSetup.set(false);
    }

    // Mark auth as initialized AFTER currentUser has its final value
    // This ensures derived stores see the complete state
    authInitialized.set(true);
  });
}
